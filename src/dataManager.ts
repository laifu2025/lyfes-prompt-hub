import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export interface Prompt {
    id: number;
    title: string;
    content: string;
    category: string;
    tags: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface AppData {
    prompts: Prompt[];
    categories: string[];
    settings: {
        autoBackup: boolean;
        backupInterval: number; // 分钟
        cloudSync: boolean;
        syncProvider: 'github' | 'gitee' | 'custom' | null;
        workspaceMode: boolean; // 新增：是否启用工作区模式
    };
    metadata: {
        version: string;
        lastModified: string;
        totalPrompts: number;
    };
}

export class DataManager {
    private context: vscode.ExtensionContext;
    private backupTimer?: NodeJS.Timeout;
    
    // 数据存储键名
    private static readonly STORAGE_KEYS = {
        APP_DATA: 'promptHub.appData',
        WORKSPACE_DATA: 'promptHub.workspaceData',
        BACKUP_HISTORY: 'promptHub.backupHistory',
        SYNC_CONFIG: 'promptHub.syncConfig'
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeAutoBackup();
    }

    /**
     * 获取应用数据（支持全局和工作区模式）
     */
    public async getAppData(): Promise<AppData> {
        const defaultData: AppData = {
            prompts: [],
            categories: ['默认分类', '开发', '写作', '翻译', '分析', '代码生成', '调试', '文档'],
            settings: {
                autoBackup: true,
                backupInterval: 30,
                cloudSync: false,
                syncProvider: null,
                workspaceMode: false
            },
            metadata: {
                version: '1.0.0',
                lastModified: new Date().toISOString(),
                totalPrompts: 0
            }
        };

        try {
            // 检查是否启用工作区模式
            let savedData: AppData | undefined;
            
            const globalData = this.context.globalState.get<AppData>(DataManager.STORAGE_KEYS.APP_DATA);
            const workspaceData = this.context.workspaceState.get<AppData>(DataManager.STORAGE_KEYS.WORKSPACE_DATA);
            
            // 如果有工作区数据且启用了工作区模式，优先使用工作区数据
            if (workspaceData?.settings.workspaceMode) {
                savedData = workspaceData;
            } else if (globalData) {
                savedData = globalData;
            }
            
            if (savedData) {
                // 如果保存的数据中没有分类，则使用默认分类
                if (!savedData.categories || savedData.categories.length === 0) {
                    savedData.categories = defaultData.categories;
                }

                // 合并默认设置，确保新增的配置项不会丢失
                const mergedData = {
                    ...defaultData,
                    ...savedData,
                    settings: {
                        ...defaultData.settings,
                        ...savedData.settings
                    },
                    metadata: {
                        ...defaultData.metadata,
                        ...savedData.metadata,
                        totalPrompts: savedData.prompts?.length || 0
                    }
                };
                return mergedData;
            }

            // 如果没有数据，尝试从文件备份恢复
            const backupData = await this.restoreFromLatestBackup();
            if (backupData) {
                await this.saveAppData(backupData);
                return backupData;
            }

            return defaultData;
        } catch (error) {
            console.error('获取应用数据失败:', error);
            return defaultData;
        }
    }

    /**
     * 保存应用数据（支持全局和工作区模式）
     */
    public async saveAppData(data: AppData): Promise<void> {
        try {
            // 更新元数据
            data.metadata = {
                ...data.metadata,
                lastModified: new Date().toISOString(),
                totalPrompts: data.prompts.length
            };

            // 根据工作区模式决定存储位置
            if (data.settings.workspaceMode) {
                await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, data);
                console.log('应用数据已保存到工作区');
            } else {
                await this.context.globalState.update(DataManager.STORAGE_KEYS.APP_DATA, data);
                console.log('应用数据已保存到全局存储');
            }
            
            // 如果启用了自动备份，创建备份
            if (data.settings.autoBackup) {
                await this.createBackup(data);
            }

        } catch (error) {
            console.error('保存应用数据失败:', error);
            throw error;
        }
    }

    /**
     * 切换工作区模式
     */
    public async toggleWorkspaceMode(enable: boolean): Promise<void> {
        const currentData = await this.getAppData();
        
        if (enable) {
            // 启用工作区模式：将全局数据复制到工作区
            currentData.settings.workspaceMode = true;
            await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, currentData);
        } else {
            // 禁用工作区模式：将工作区数据合并到全局
            currentData.settings.workspaceMode = false;
            await this.context.globalState.update(DataManager.STORAGE_KEYS.APP_DATA, currentData);
            await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, undefined);
        }
    }

    /**
     * 获取当前存储模式信息
     */
    public async getStorageInfo(): Promise<{mode: 'global' | 'workspace', location: string}> {
        const data = await this.getAppData();
        return {
            mode: data.settings.workspaceMode ? 'workspace' : 'global',
            location: data.settings.workspaceMode ? '工作区模式' : '全局模式'
        };
    }

    /**
     * 获取系统状态，用于UI展示
     */
    public async getSystemStatus(): Promise<{ cloud: { configured: boolean, provider: string | null, canSync: boolean, message: string, status: string }, storage: { isWorkspace: boolean, message: string, status: string } }> {
        const data = await this.getAppData();
        const storageInfo = await this.getStorageInfo();
        const syncConfig = this.context.globalState.get<any>(DataManager.STORAGE_KEYS.SYNC_CONFIG);

        const isCloudConfigured = data.settings.cloudSync && !!data.settings.syncProvider && !!syncConfig;
        const canSync = data.settings.cloudSync && !!data.settings.syncProvider;

        return {
            cloud: {
                configured: isCloudConfigured,
                provider: data.settings.syncProvider,
                canSync: canSync,
                message: isCloudConfigured ? `已配置: ${data.settings.syncProvider}` : (canSync ? '待配置' : '未启用'),
                status: isCloudConfigured ? 'success' : (canSync ? 'info' : 'warning')
            },
            storage: {
                isWorkspace: data.settings.workspaceMode,
                message: storageInfo.location,
                status: data.settings.workspaceMode ? 'success' : 'info'
            }
        };
    }

    /**
     * 添加一个新分类
     * @param categoryName 新分类的名称
     * @returns 更新后的应用数据
     */
    public async addCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!categoryName || categoryName.trim() === '') {
            throw new Error('分类名称不能为空。');
        }
        if (appData.categories.includes(categoryName)) {
            throw new Error(`分类 "${categoryName}" 已存在。`);
        }

        appData.categories.push(categoryName);
        await this.saveAppData(appData);
        return appData;
    }

    /**
     * 编辑一个现有分类
     * @param oldName 旧的分类名称
     * @param newName 新的分类名称
     * @returns 更新后的应用数据
     */
    public async editCategory(oldName: string, newName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!newName || newName.trim() === '') {
            throw new Error('分类名称不能为空。');
        }
        if (oldName === newName) {
            return appData; // 名称没有改变，直接返回
        }
        if (appData.categories.includes(newName)) {
            throw new Error(`分类 "${newName}" 已存在。`);
        }

        const categoryIndex = appData.categories.indexOf(oldName);
        if (categoryIndex === -1) {
            throw new Error(`未找到分类 "${oldName}"。`);
        }

        // 更新分类列表
        appData.categories[categoryIndex] = newName;

        // 更新所有相关的 Prompt
        appData.prompts.forEach(prompt => {
            if (prompt.category === oldName) {
                prompt.category = newName;
            }
        });

        await this.saveAppData(appData);
        return appData;
    }

    /**
     * 删除一个分类
     * @param categoryName 要删除的分类名称
     * @returns 更新后的应用数据
     */
    public async deleteCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        const categoryIndex = appData.categories.indexOf(categoryName);
        if (categoryIndex > -1) {
            appData.categories.splice(categoryIndex, 1);
            // 将属于该分类的 prompts 移动到 "未分类"
            appData.prompts.forEach(p => {
                if (p.category === categoryName) {
                    p.category = '未分类';
                }
            });
            await this.saveAppData(appData);
        }
        return appData;
    }

    /**
     * 保存（创建或更新）一个 Prompt
     * @param promptData 要保存的 Prompt 数据
     * @returns 更新后的应用数据
     */
    public async savePrompt(promptData: Partial<Prompt> & { id?: string | number }): Promise<AppData> {
        const appData = await this.getAppData();
        const now = new Date().toISOString();

        if (promptData.id) {
            // 更新现有 Prompt
            const promptId = typeof promptData.id === 'string' ? parseInt(promptData.id, 10) : promptData.id;
            const promptIndex = appData.prompts.findIndex(p => p.id === promptId);
            if (promptIndex > -1) {
                appData.prompts[promptIndex] = {
                    ...appData.prompts[promptIndex],
                    ...promptData,
                    id: promptId,
                    updatedAt: now,
                };
            } else {
                throw new Error(`找不到 ID 为 ${promptId} 的 Prompt。`);
            }
        } else {
            // 创建新 Prompt
            const newPrompt: Prompt = {
                id: Date.now(), // 简单地使用时间戳作为ID
                title: promptData.title || '',
                content: promptData.content || '',
                category: promptData.category || '未分类',
                tags: promptData.tags || [],
                isActive: true, // 默认为激活状态
                createdAt: now,
                updatedAt: now,
            };
            appData.prompts.push(newPrompt);
        }

        // 更新分类列表
        if (promptData.category && !appData.categories.includes(promptData.category)) {
            appData.categories.push(promptData.category);
        }
        
        await this.saveAppData(appData);
        return appData;
    }

    /**
     * 删除一个 Prompt
     * @param promptId 要删除的 Prompt 的 ID
     * @returns 更新后的应用数据
     */
    public async deletePrompt(promptId: number): Promise<AppData> {
        const appData = await this.getAppData();
        const promptIndex = appData.prompts.findIndex(p => p.id === promptId);
        if (promptIndex > -1) {
            appData.prompts.splice(promptIndex, 1);
            await this.saveAppData(appData);
        }
        return appData;
    }

    /**
     * 创建数据备份
     */
    public async createBackup(data?: AppData): Promise<string> {
        try {
            if (!data) {
                data = await this.getAppData();
            }

            const timestamp = new Date().toISOString();
            const backupData = {
                timestamp,
                data,
                version: '1.0.0',
                source: 'Lyfe\'s Prompt Hub'
            };

            // 获取备份目录
            const backupDir = this.getBackupDirectory();
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // 创建备份文件
            const filename = `prompt-hub-backup-${timestamp.replace(/[:.]/g, '-')}.json`;
            const backupPath = path.join(backupDir, filename);
            
            fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');

            // 更新备份历史
            await this.updateBackupHistory(backupPath, timestamp);

            // 清理旧备份（保留最近10个）
            await this.cleanupOldBackups();

            console.log(`备份已创建: ${backupPath}`);
            return backupPath;
        } catch (error) {
            console.error('创建备份失败:', error);
            throw error;
        }
    }

    /**
     * 从备份恢复数据
     */
    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('备份文件不存在');
            }

            const backupContent = fs.readFileSync(backupPath, 'utf-8');
            const backup = JSON.parse(backupContent);

            if (!backup.data) {
                throw new Error('备份文件格式不正确');
            }

            // 恢复数据
            await this.saveAppData(backup.data);
            
            vscode.window.showInformationMessage(`数据已从备份恢复: ${backup.timestamp}`);
            return backup.data;
        } catch (error) {
            console.error('从备份恢复失败:', error);
            vscode.window.showErrorMessage(`恢复备份失败: ${error}`);
            return null;
        }
    }

    /**
     * 从最新备份恢复
     */
    public async restoreFromLatestBackup(): Promise<AppData | null> {
        try {
            const backupHistory = this.context.globalState.get<Array<{path: string, timestamp: string}>>(
                DataManager.STORAGE_KEYS.BACKUP_HISTORY, 
                []
            );

            if (backupHistory.length === 0) {
                return null;
            }

            // 按时间排序，获取最新的备份
            const latestBackup = backupHistory
                .filter(b => fs.existsSync(b.path))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

            if (!latestBackup) {
                return null;
            }

            const backupContent = fs.readFileSync(latestBackup.path, 'utf-8');
            const backup = JSON.parse(backupContent);
            return backup.data || null;
        } catch (error) {
            console.error('从最新备份恢复失败:', error);
            return null;
        }
    }

    /**
     * 获取备份列表
     */
    public getBackupList(): Array<{path: string, timestamp: string, size: number}> {
        const backupHistory = this.context.globalState.get<Array<{path: string, timestamp: string}>>(
            DataManager.STORAGE_KEYS.BACKUP_HISTORY, 
            []
        );

        return backupHistory
            .filter(b => fs.existsSync(b.path))
            .map(b => {
                const stats = fs.statSync(b.path);
                return {
                    ...b,
                    size: stats.size
                };
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    /**
     * 导出数据
     */
    public async exportData(): Promise<string> {
        try {
            const data = await this.getAppData();
            const exportData = {
                timestamp: new Date().toISOString(),
                data,
                version: '1.0.0',
                source: 'Lyfe\'s Prompt Hub'
            };

            const defaultPath = path.join(
                this.getBackupDirectory(),
                `prompt-hub-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
            );

            const result = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultPath),
                filters: {
                    'JSON文件': ['json'],
                    '所有文件': ['*']
                }
            });

            if (result) {
                fs.writeFileSync(result.fsPath, JSON.stringify(exportData, null, 2), 'utf-8');
                vscode.window.showInformationMessage(`数据已导出到: ${result.fsPath}`);
                return result.fsPath;
            }

            throw new Error('导出已取消');
        } catch (error) {
            console.error('导出数据失败:', error);
            vscode.window.showErrorMessage(`导出失败: ${error}`);
            throw error;
        }
    }

    /**
     * 导入数据
     */
    public async importData(): Promise<AppData | null> {
        try {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON文件': ['json'],
                    '所有文件': ['*']
                }
            });

            if (!result || result.length === 0) {
                throw new Error('导入已取消');
            }

            const filePath = result[0].fsPath;
            const content = fs.readFileSync(filePath, 'utf-8');
            const importData = JSON.parse(content);

            if (!importData.data) {
                throw new Error('导入文件格式不正确');
            }

            // 询问是否覆盖现有数据
            const choice = await vscode.window.showWarningMessage(
                '导入数据将覆盖当前所有数据，是否继续？',
                { modal: true },
                '继续导入',
                '取消'
            );

            if (choice === '继续导入') {
                // 先创建当前数据的备份
                await this.createBackup();
                
                // 导入新数据
                await this.saveAppData(importData.data);
                
                vscode.window.showInformationMessage('数据导入成功！');
                return importData.data;
            }

            return null;
        } catch (error) {
            console.error('导入数据失败:', error);
            vscode.window.showErrorMessage(`导入失败: ${error}`);
            return null;
        }
    }

    /**
     * 云同步功能
     */
    public async setupCloudSync(): Promise<void> {
        try {
            const providers = [
                { label: 'GitHub Gist', value: 'github' },
                { label: 'Gitee Gist', value: 'gitee' },
                { label: '自定义API', value: 'custom' }
            ];

            const selected = await vscode.window.showQuickPick(providers, {
                placeHolder: '选择云同步服务提供商'
            });

            if (!selected) {
                return;
            }

            // 根据选择的提供商配置同步
            switch (selected.value) {
                case 'github':
                    await this.setupGitHubSync();
                    break;
                case 'gitee':
                    await this.setupGiteeSync();
                    break;
                case 'custom':
                    await this.setupCustomSync();
                    break;
            }
        } catch (error) {
            console.error('设置云同步失败:', error);
            vscode.window.showErrorMessage(`设置云同步失败: ${error}`);
        }
    }

    /**
     * 同步到云端
     */
    public async syncToCloud(): Promise<void> {
        try {
            const data = await this.getAppData();
            
            if (!data.settings.cloudSync || !data.settings.syncProvider) {
                throw new Error('云同步未配置');
            }

            const syncConfig = this.context.globalState.get<any>(DataManager.STORAGE_KEYS.SYNC_CONFIG);
            if (!syncConfig) {
                throw new Error('同步配置不存在');
            }

            const syncData = {
                timestamp: new Date().toISOString(),
                data: data,
                version: '1.0.0'
            };

            switch (data.settings.syncProvider) {
                case 'github':
                    await this.syncToGitHub(syncData, syncConfig);
                    break;
                case 'gitee':
                    await this.syncToGitee(syncData, syncConfig);
                    break;
                case 'custom':
                    await this.syncToCustomAPI(syncData, syncConfig);
                    break;
            }

            vscode.window.showInformationMessage('数据已同步到云端');
        } catch (error) {
            console.error('同步到云端失败:', error);
            vscode.window.showErrorMessage(`同步失败: ${error}`);
        }
    }

    /**
     * 从云端同步
     */
    public async syncFromCloud(): Promise<AppData | null> {
        try {
            const data = await this.getAppData();
            
            if (!data.settings.cloudSync || !data.settings.syncProvider) {
                throw new Error('云同步未配置');
            }

            const syncConfig = this.context.globalState.get<any>(DataManager.STORAGE_KEYS.SYNC_CONFIG);
            if (!syncConfig) {
                throw new Error('同步配置不存在');
            }

            let cloudData: any;
            switch (data.settings.syncProvider) {
                case 'github':
                    cloudData = await this.syncFromGitHub(syncConfig);
                    break;
                case 'gitee':
                    cloudData = await this.syncFromGitee(syncConfig);
                    break;
                case 'custom':
                    cloudData = await this.syncFromCustomAPI(syncConfig);
                    break;
                default:
                    throw new Error('未知的同步提供商');
            }

            if (cloudData && cloudData.data) {
                // 询问是否覆盖本地数据
                const choice = await vscode.window.showWarningMessage(
                    '从云端同步将覆盖本地数据，是否继续？',
                    { modal: true },
                    '继续同步',
                    '取消'
                );

                if (choice === '继续同步') {
                    await this.createBackup(); // 备份当前数据
                    await this.saveAppData(cloudData.data);
                    vscode.window.showInformationMessage('数据已从云端同步');
                    return cloudData.data;
                }
            }

            return null;
        } catch (error) {
            console.error('从云端同步失败:', error);
            vscode.window.showErrorMessage(`同步失败: ${error}`);
            return null;
        }
    }

    // 私有方法

    private getBackupDirectory(): string {
        const extensionPath = this.context.extensionPath;
        return path.join(extensionPath, 'backups');
    }

    private async updateBackupHistory(backupPath: string, timestamp: string): Promise<void> {
        const history = this.context.globalState.get<Array<{path: string, timestamp: string}>>(
            DataManager.STORAGE_KEYS.BACKUP_HISTORY, 
            []
        );

        history.push({ path: backupPath, timestamp });
        await this.context.globalState.update(DataManager.STORAGE_KEYS.BACKUP_HISTORY, history);
    }

    private async cleanupOldBackups(): Promise<void> {
        const history = this.context.globalState.get<Array<{path: string, timestamp: string}>>(
            DataManager.STORAGE_KEYS.BACKUP_HISTORY, 
            []
        );

        // 按时间排序，保留最新的10个备份
        const sortedHistory = history
            .filter(b => fs.existsSync(b.path))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (sortedHistory.length > 10) {
            const toDelete = sortedHistory.slice(10);
            
            for (const backup of toDelete) {
                try {
                    fs.unlinkSync(backup.path);
                } catch (error) {
                    console.warn(`删除旧备份失败: ${backup.path}`, error);
                }
            }

            // 更新备份历史
            const newHistory = sortedHistory.slice(0, 10);
            await this.context.globalState.update(DataManager.STORAGE_KEYS.BACKUP_HISTORY, newHistory);
        }
    }

    private initializeAutoBackup(): void {
        // 定期检查并创建备份
        this.backupTimer = setInterval(async () => {
            try {
                const data = await this.getAppData();
                if (data.settings.autoBackup) {
                    await this.createBackup(data);
                }
            } catch (error) {
                console.error('自动备份失败:', error);
            }
        }, 30 * 60 * 1000); // 每30分钟检查一次
    }

    private async setupGitHubSync(): Promise<void> {
        const token = await vscode.window.showInputBox({
            prompt: '请输入GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_...'
        });

        if (!token) {
            return;
        }

        const gistId = await vscode.window.showInputBox({
            prompt: '请输入Gist ID（可选，留空将创建新的Gist）',
            placeHolder: 'Gist ID'
        });

        const config = {
            provider: 'github',
            token,
            gistId
        };

        await this.context.globalState.update(DataManager.STORAGE_KEYS.SYNC_CONFIG, config);
        
        const data = await this.getAppData();
        data.settings.cloudSync = true;
        data.settings.syncProvider = 'github';
        await this.saveAppData(data);

        vscode.window.showInformationMessage('GitHub同步已配置');
    }

    private async setupGiteeSync(): Promise<void> {
        const token = await vscode.window.showInputBox({
            prompt: '请输入Gitee Private Token',
            password: true
        });

        if (!token) {
            return;
        }

        const config = {
            provider: 'gitee',
            token
        };

        await this.context.globalState.update(DataManager.STORAGE_KEYS.SYNC_CONFIG, config);
        
        const data = await this.getAppData();
        data.settings.cloudSync = true;
        data.settings.syncProvider = 'gitee';
        await this.saveAppData(data);

        vscode.window.showInformationMessage('Gitee同步已配置');
    }

    private async setupCustomSync(): Promise<void> {
        const apiUrl = await vscode.window.showInputBox({
            prompt: '请输入API地址',
            placeHolder: 'https://api.example.com/sync'
        });

        if (!apiUrl) {
            return;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入API密钥',
            password: true
        });

        const config = {
            provider: 'custom',
            apiUrl,
            apiKey
        };

        await this.context.globalState.update(DataManager.STORAGE_KEYS.SYNC_CONFIG, config);
        
        const data = await this.getAppData();
        data.settings.cloudSync = true;
        data.settings.syncProvider = 'custom';
        await this.saveAppData(data);

        vscode.window.showInformationMessage('自定义API同步已配置');
    }

    private async syncToGitHub(data: any, config: any): Promise<void> {
        // GitHub Gist API 实现
        const gistData = {
            description: 'Lyfe\'s Prompt Hub Data',
            files: {
                'prompt-hub-data.json': {
                    content: JSON.stringify(data, null, 2)
                }
            },
            public: false
        };

        const method = config.gistId ? 'PATCH' : 'POST';
        const url = config.gistId 
            ? `https://api.github.com/gists/${config.gistId}`
            : 'https://api.github.com/gists';

        console.log('同步到GitHub:', url, gistData);
    }

    private async syncFromGitHub(config: any): Promise<any> {
        if (!config.gistId) {
            throw new Error('未配置Gist ID');
        }

        console.log('从GitHub同步:', config.gistId);
        return null;
    }

    private async syncToGitee(data: any, config: any): Promise<void> {
        console.log('同步到Gitee:', data);
    }

    private async syncFromGitee(config: any): Promise<any> {
        console.log('从Gitee同步');
        return null;
    }

    private async syncToCustomAPI(data: any, config: any): Promise<void> {
        console.log('同步到自定义API:', config.apiUrl);
    }

    private async syncFromCustomAPI(config: any): Promise<any> {
        console.log('从自定义API同步:', config.apiUrl);
        return null;
    }

    public dispose(): void {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
    }
} 