import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// #region Interfaces
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
        backupInterval: number; // minutes
        cloudSync: boolean;
        syncProvider: 'github' | 'gitee' | 'custom' | null;
        workspaceMode: boolean;
        gistId?: string; 
    };
    metadata: {
        version: string;
        lastModified: string;
        totalPrompts: number;
    };
}

interface GistCreateResponse {
    id: string;
}

interface GistFile {
    content?: string;
}

interface GistGetResponse {
    files: {
        [filename: string]: GistFile;
    };
}
// #endregion

export class DataManager {
    private context: vscode.ExtensionContext;
    private backupTimer?: NodeJS.Timeout;
    private static readonly SYNC_FILENAME = 'prompt-hub.json';
    
    private static readonly STORAGE_KEYS = {
        APP_DATA: 'promptHub.appData',
        WORKSPACE_DATA: 'promptHub.workspaceData',
        BACKUP_HISTORY: 'promptHub.backupHistory',
        GITHUB_TOKEN: 'promptHub.githubToken'
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeAutoBackup().catch((err: any) => console.error("Failed to initialize auto-backup:", err));
    }

    // #region Core Data Handling
    public async getAppData(): Promise<AppData> {
        const defaultData: AppData = {
            prompts: [],
            categories: [],
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
            let savedData: AppData | undefined;
            const globalData = this.context.globalState.get<AppData>(DataManager.STORAGE_KEYS.APP_DATA);
            const workspaceData = this.context.workspaceState.get<AppData>(DataManager.STORAGE_KEYS.WORKSPACE_DATA);

            // Determine current settings owner
            const settingsOwner = workspaceData?.settings.workspaceMode ? workspaceData : globalData;

            if (settingsOwner?.settings.workspaceMode) {
                savedData = workspaceData;
            } else {
                savedData = globalData;
            }
            
            if (savedData) {
                savedData.categories = savedData.categories || defaultData.categories;
                const mergedData = {
                    ...defaultData,
                    ...savedData,
                    settings: { ...defaultData.settings, ...savedData.settings },
                    metadata: { ...defaultData.metadata, ...savedData.metadata, totalPrompts: savedData.prompts?.length || 0 }
                };
                return mergedData;
            }

            return defaultData;
        } catch (error) {
            console.error('[DataManager] CRITICAL: Error while getting AppData. Returning default data.', error);
            return defaultData;
        }
    }

    public async getPrompts(): Promise<Prompt[]> {
        const appData = await this.getAppData();
        return appData.prompts || [];
    }

    public async getAllTags(): Promise<string[]> {
        const appData = await this.getAppData();
        const allTags = new Set<string>();
        if (appData.prompts) {
            for (const prompt of appData.prompts) {
                if (prompt.tags) {
                    for (const tag of prompt.tags) {
                        allTags.add(tag);
                    }
                }
            }
        }
        return Array.from(allTags);
    }

    public async saveAppData(data: AppData): Promise<void> {
        data.metadata = { ...data.metadata, lastModified: new Date().toISOString(), totalPrompts: data.prompts.length };

        if (data.settings.workspaceMode) {
            await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, data);
        } else {
            await this.context.globalState.update(DataManager.STORAGE_KEYS.APP_DATA, data);
        }
        
        if (data.settings.autoBackup) {
            await this.createBackup(data);
        }
    }
    // #endregion

    // #region Workspace Mode
    public async toggleWorkspaceMode(enable: boolean): Promise<void> {
        const currentData = await this.getAppData();
        currentData.settings.workspaceMode = enable;
        if (enable) {
            await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, currentData);
             await this.context.globalState.update(DataManager.STORAGE_KEYS.APP_DATA, undefined);
        } else {
            await this.context.globalState.update(DataManager.STORAGE_KEYS.APP_DATA, currentData);
            await this.context.workspaceState.update(DataManager.STORAGE_KEYS.WORKSPACE_DATA, undefined);
        }
    }

    public async getStorageInfo(): Promise<{mode: 'global' | 'workspace', location: string}> {
        const data = await this.getAppData();
        return {
            mode: data.settings.workspaceMode ? 'workspace' : 'global',
            location: data.settings.workspaceMode ? '工作区' : '全局'
        };
    }
    // #endregion

    // #region CRUD Operations
    public async savePrompt(promptData: Partial<Prompt> & { id?: string | number }): Promise<AppData> {
        if (!promptData) {
            throw new Error('Attempted to save invalid prompt data.');
        }

        const appData = await this.getAppData();
        const now = new Date().toISOString();

        if (promptData.id) {
            const promptId = Number(promptData.id);
            const promptIndex = appData.prompts.findIndex(p => p.id === promptId);
            if (promptIndex > -1) {
                appData.prompts[promptIndex] = { ...appData.prompts[promptIndex], ...promptData, id: promptId, updatedAt: now };
            }
        } else {
            const newPrompt: Prompt = {
                id: Date.now(),
                title: promptData.title || '无标题',
                content: promptData.content || '',
                category: promptData.category || '',
                tags: promptData.tags || [],
                isActive: promptData.isActive === false ? false : true,
                createdAt: now,
                updatedAt: now,
            };
            appData.prompts.push(newPrompt);
        }

        if (promptData.category && !appData.categories.includes(promptData.category)) {
            appData.categories.push(promptData.category);
        }
        await this.saveAppData(appData);
        return appData;
    }
    
    public async deletePrompt(promptId: number | string): Promise<void> {
        const appData = await this.getAppData();
        appData.prompts = appData.prompts.filter(p => p.id != promptId);
        await this.saveAppData(appData);
    }

    public async getCategoryPromptCount(categoryName: string): Promise<number> {
        const appData = await this.getAppData();
        return appData.prompts.filter(p => p.category === categoryName).length;
    }

    public async addCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!categoryName || categoryName.trim() === '') {
            throw new Error('分类名称不能为空。');
        }
        if (appData.categories.includes(categoryName)) {
            throw new Error(`分类 "${categoryName}" 已存在.`);
        }
        appData.categories.unshift(categoryName);
        await this.saveAppData(appData);
        return appData;
    }

    public async renameCategory(oldName: string, newName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!newName || newName.trim() === '') throw new Error('分类名称不能为空。');
        if (oldName === newName) return appData;
        if (appData.categories.includes(newName)) throw new Error(`分类 "${newName}" 已存在.`);
        
        const categoryIndex = appData.categories.indexOf(oldName);
        if (categoryIndex === -1) throw new Error(`未找到分类 "${oldName}".`);

        appData.categories[categoryIndex] = newName;
        appData.prompts.forEach(p => { if (p.category === oldName) p.category = newName; });
        await this.saveAppData(appData);
        return appData;
    }

    public async deleteCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        const promptCount = appData.prompts.filter(p => p.category === categoryName).length;

        if (promptCount > 0) {
            throw new Error(`分类 "${categoryName}" 下有 ${promptCount} 个 Prompts，无法删除。`);
        }
        
        appData.categories = appData.categories.filter(c => c !== categoryName);
        
        await this.saveAppData(appData);
        return appData;
    }

    public async deleteTag(tagName: string): Promise<AppData> {
        const appData = await this.getAppData();
        appData.prompts.forEach(p => {
            if (p.tags && p.tags.includes(tagName)) {
                p.tags = p.tags.filter(t => t !== tagName);
            }
        });
        await this.saveAppData(appData);
        return appData;
    }

    public async setPromptActive(promptId: string | number, isActive: boolean): Promise<void> {
        const appData = await this.getAppData();
        const id = Number(promptId);
        const prompt = appData.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.isActive = isActive;
            await this.saveAppData(appData);
        } else {
            throw new Error('Prompt not found');
        }
    }
    // #endregion

    // #region Backup & Restore
    public async createBackup(data?: AppData): Promise<string> {
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `prompt-hub-backup-${timestamp}.json`;
        const backupPath = path.join(backupDir, backupFile);

        const dataToBackup = data || await this.getAppData();
        fs.writeFileSync(backupPath, JSON.stringify(dataToBackup, null, 2));

        await this.updateBackupHistory(backupPath, timestamp);
        await this.cleanupOldBackups();
        return backupPath;
    }

    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        if (!fs.existsSync(backupPath)) {
            vscode.window.showErrorMessage('备份文件不存在。');
            return null;
        }
        const fileContent = fs.readFileSync(backupPath, 'utf-8');
        const data = JSON.parse(fileContent);
        await this.saveAppData(data);
        return data;
    }

    public getBackupList(): Array<{path: string, timestamp: string, size: number}> {
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) return [];
        
        const backupFiles = fs.readdirSync(backupDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                return { path: filePath, timestamp: this.extractTimestamp(file), size: stats.size };
            });
            
        return backupFiles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    private extractTimestamp(filename: string): string {
        const match = filename.match(/prompt-hub-backup-(.+)\.json/);
        return match ? new Date(match[1].replace(/-/g, ':').replace('T', ' ').substring(0, 19)).toLocaleString() : 'N/A';
    }

    private getBackupDirectory(): string {
        return path.join(this.context.globalStorageUri.fsPath, 'backups');
    }

    private async updateBackupHistory(backupPath: string, timestamp: string): Promise<void> {
        // This is a placeholder for more advanced history management if needed.
    }

    private async cleanupOldBackups(): Promise<void> {
        const backups = this.getBackupList();
        if (backups.length > 10) {
            const oldBackups = backups.slice(10);
            oldBackups.forEach(backup => fs.unlinkSync(backup.path));
        }
    }

    private async initializeAutoBackup(): Promise<void> {
        const appData = await this.getAppData();
        if (appData.settings.autoBackup) {
            const interval = (appData.settings.backupInterval || 30) * 60 * 1000;
            if (this.backupTimer) clearInterval(this.backupTimer);
            this.backupTimer = setInterval(() => {
                this.createBackup().catch((err: any) => console.error("Auto-backup failed:", err));
            }, interval);
        }
    }
    // #endregion

    // #region Import & Export
    public async exportData(): Promise<string> {
        const appData = await this.getAppData();
        const content = JSON.stringify(appData, null, 2);
        const file = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`prompt-hub-export-${Date.now()}.json`),
            filters: { 'JSON': ['json'] }
        });
        if (file) {
            fs.writeFileSync(file.fsPath, content);
            return file.fsPath;
        }
        throw new Error('导出已取消');
    }

    public async importData(): Promise<AppData | null> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            title: '选择要导入的JSON文件'
        });

        if (fileUri && fileUri[0]) {
            try {
                await this.createBackup();
                vscode.window.showInformationMessage('导入前已自动备份当前数据。');
                
                const filePath = fileUri[0].fsPath;
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const importedData = JSON.parse(fileContent) as AppData;

                const choice = await vscode.window.showWarningMessage(
                    '导入数据将覆盖当前所有本地数据，是否继续？(此操作不可逆)', 
                    { modal: true }, 
                    '继续导入'
                );

                if (choice === '继续导入') {
                    await this.saveAppData(importedData);
                    return importedData;
                }
            } catch (error) {
                console.error('[DataManager] Failed to import data:', error);
                vscode.window.showErrorMessage(`导入数据失败: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        }
        return null;
    }
    // #endregion

    // #region Cloud Sync
    public async setupCloudSync(): Promise<AppData | void> {
        const choice = await vscode.window.showQuickPick([
            { label: 'GitHub Gist', description: '通过 GitHub Gist 同步' },
            { label: '禁用云同步', description: '关闭云同步功能' }
        ], {
            placeHolder: '请选择云同步提供商'
        });

        if (!choice) return;

        switch (choice.label) {
            case 'GitHub Gist':
                return await this.setupGitHubSync();
            case '禁用云同步':
                return await this.disableCloudSync();
        }
    }

    private async setupGitHubSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({
            prompt: '请输入您的 GitHub Personal Access Token (需要 gist 权限)',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
        });

        if (!token) {
            vscode.window.showWarningMessage('未提供Token，GitHub同步设置已取消。');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证GitHub Token...',
                cancellable: false
            }, async () => {
                const response = await axios.get('https://api.github.com/user', {
                    headers: { 'Authorization': `token ${token}` }
                });
    
                const scopes = response.headers['x-oauth-scopes'] as string;
                if (!scopes || !scopes.split(', ').includes('gist')) {
                    throw new Error('Token无效或缺少 "gist" 权限。');
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '请检查网络连接或Token。';
            vscode.window.showErrorMessage(`Token验证失败: ${message}`);
            return;
        }

        const gistId = await vscode.window.showInputBox({
            prompt: '（可选）请输入一个已有的 Gist ID 用于同步',
            ignoreFocusOut: true,
            placeHolder: '如果留空，将在首次同步时自动创建新的 Gist'
        });

        try {
            await this.context.secrets.store(DataManager.STORAGE_KEYS.GITHUB_TOKEN, token);
            const appData = await this.getAppData();
            appData.settings.cloudSync = true;
            appData.settings.syncProvider = 'github';
            appData.settings.gistId = gistId || undefined;
            await this.saveAppData(appData);
            vscode.window.showInformationMessage('GitHub Gist 同步设置成功！');
            return appData;
        } catch (error) {
            console.error('[DataManager] Error setting up GitHub sync:', error);
            vscode.window.showErrorMessage(`设置 GitHub 同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
    
    private async disableCloudSync(): Promise<AppData | void> {
        try {
            await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
            const appData = await this.getAppData();
            appData.settings.cloudSync = false;
            appData.settings.syncProvider = null;
            delete appData.settings.gistId;
            await this.saveAppData(appData);
            vscode.window.showInformationMessage('云同步已禁用。');
            return appData;
        } catch (error) {
            console.error('[DataManager] Error disabling cloud sync:', error);
            vscode.window.showErrorMessage(`禁用云同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    public async syncToCloud(): Promise<void> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            vscode.window.showWarningMessage('云同步未配置，请先在设置中完成配置。');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '同步到云端...',
            cancellable: false
        }, async (progress) => {
            try {
                const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
                if (!token) throw new Error('未找到 GitHub Token');

                const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
                const contentToSync = JSON.stringify(appData, null, 2);
                const files = { [DataManager.SYNC_FILENAME]: { content: contentToSync } };

                let gistId = appData.settings.gistId;

                if (gistId) {
                    // Update existing Gist
                    progress.report({ message: '更新 Gist...' });
                    await axios.patch(`https://api.github.com/gists/${gistId}`, { files }, { headers });
                } else {
                    // Create new Gist
                    progress.report({ message: '创建新的 Gist...' });
                    const response = await axios.post<GistCreateResponse>('https://api.github.com/gists', {
                        files,
                        public: false,
                        description: 'Lyfe\'s Prompt Hub Data'
                    }, { headers });
                    gistId = response.data.id;
                    appData.settings.gistId = gistId;
                    await this.saveAppData(appData);
                }
                vscode.window.showInformationMessage('成功同步到云端！');
            } catch (error) {
                console.error('Sync to cloud failed:', error);
                vscode.window.showErrorMessage(`同步失败: ${error instanceof Error ? error.message : '请检查网络或Token权限'}`);
            }
        });
    }

    public async syncFromCloud(): Promise<AppData | null> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.gistId) {
            vscode.window.showWarningMessage('云同步未配置或缺少Gist ID。');
            return null;
        }
        
        const choice = await vscode.window.showWarningMessage(
            '从云端同步将覆盖所有本地数据，是否继续？',
            { modal: true },
            '继续同步'
        );
        if (choice !== '继续同步') return null;

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '从云端同步...',
            cancellable: false
        }, async (progress) => {
            try {
                const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
                if (!token) throw new Error('未找到 GitHub Token');

                const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
                progress.report({ message: '正在获取Gist...' });
                const response = await axios.get<GistGetResponse>(`https://api.github.com/gists/${appData.settings.gistId}`, { headers });
                
                const file = response.data.files[DataManager.SYNC_FILENAME];
                if (!file || !file.content) throw new Error('在Gist中未找到同步文件。');

                const cloudData = JSON.parse(file.content) as AppData;
                
                // Keep local workspace/sync settings
                cloudData.settings.workspaceMode = appData.settings.workspaceMode;
                cloudData.settings.cloudSync = appData.settings.cloudSync;
                cloudData.settings.gistId = appData.settings.gistId;
                cloudData.settings.syncProvider = appData.settings.syncProvider;

                await this.saveAppData(cloudData);
                vscode.window.showInformationMessage('成功从云端恢复数据！');
                return cloudData;
            } catch (error) {
                 console.error('Sync from cloud failed:', error);
                vscode.window.showErrorMessage(`从云端同步失败: ${error instanceof Error ? error.message : '请检查网络、Gist ID或Token权限'}`);
                return null;
            }
        });
    }
    // #endregion

    // #region System & Dispose
    public async getSystemStatus(): Promise<{ storageMode: 'workspace' | 'global'; cloudSync: { status: string } }> {
        const storageInfo = await this.getStorageInfo();
        const appData = await this.getAppData();
        let syncStatus = '未配置';
        if (appData.settings.cloudSync && appData.settings.syncProvider) {
            syncStatus = `已配置 (${appData.settings.syncProvider})`;
        }
        return {
            storageMode: storageInfo.mode,
            cloudSync: { status: syncStatus }
        };
    }

    public dispose(): void {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
    }
    // #endregion
}