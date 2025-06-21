import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AppData, Prompt, StorageInfo, SystemStatus, SyncResult, BackupInfo } from './types';
import { SyncError, SyncConflictError } from './errors';
import { StorageManager } from './storageManager';
import { BackupManager } from './backupManager';
import { SyncManager } from './syncManager';

// 导出错误类以保持向后兼容性
export { SyncError, SyncConflictError };

/**
 * 数据管理器 - 协调各个功能模块的主要管理器
 * 
 * 职责：
 * - 协调存储管理器、备份管理器和同步管理器
 * - 提供统一的API接口
 * - 处理模块间的数据流转
 * - 维护向后兼容性
 */
export class DataManager {
    private storageManager: StorageManager;
    private backupManager: BackupManager;
    private syncManager: SyncManager;

    constructor(private context: vscode.ExtensionContext) {
        this.storageManager = new StorageManager(context);
        this.backupManager = new BackupManager(context);
        this.syncManager = new SyncManager(context);
        
        this.initializeAutoBackup().catch((err: any) => console.error("Failed to initialize auto-backup:", err));
    }

    // #region Core Data Handling - 委托给StorageManager
    public async getAppData(): Promise<AppData> {
        return this.storageManager.getAppData();
    }

    public async getPrompts(): Promise<Prompt[]> {
        return this.storageManager.getPrompts();
    }

    public async getAllTags(): Promise<string[]> {
        return this.storageManager.getAllTags();
    }

    public async saveAppData(data: AppData): Promise<void> {
        await this.storageManager.saveAppData(data);
        
        // 处理自动备份
        if (data.settings.autoBackup) {
            await this.createBackup(data);
        }

        // 处理自动同步
        if (data.settings.cloudSync && data.settings.autoSync) {
            await this.syncManager.startAutoSync(data, (message: string) => {
                vscode.window.showWarningMessage(message);
            });
        }
    }

    public async updateSetting(key: string, value: any): Promise<void> {
        return this.storageManager.updateSetting(key, value);
    }
    // #endregion

    // #region Workspace Mode - 委托给StorageManager
    public async toggleWorkspaceMode(enable: boolean): Promise<void> {
        return this.storageManager.toggleWorkspaceMode(enable);
    }

    public async getStorageInfo(): Promise<StorageInfo> {
        return this.storageManager.getStorageInfo();
    }
    // #endregion

    // #region CRUD Operations - 委托给StorageManager
    public async savePrompt(promptData: Partial<Prompt> & { id?: string | number }): Promise<AppData> {
        return this.storageManager.savePrompt(promptData);
    }
    
    public async deletePrompt(promptId: number | string): Promise<void> {
        return this.storageManager.deletePrompt(promptId);
    }

    public async getCategoryPromptCount(categoryName: string): Promise<number> {
        return this.storageManager.getCategoryPromptCount(categoryName);
    }

    public async addCategory(categoryName: string): Promise<AppData> {
        return this.storageManager.addCategory(categoryName);
    }

    public async renameCategory(oldName: string, newName: string): Promise<AppData> {
        return this.storageManager.renameCategory(oldName, newName);
    }

    public async deleteCategory(categoryName: string): Promise<AppData> {
        return this.storageManager.deleteCategory(categoryName);
    }
    
    public async deleteTag(tagName: string): Promise<AppData> {
        return this.storageManager.deleteTag(tagName);
    }

    public async setPromptActive(promptId: string | number, isActive: boolean): Promise<void> {
        return this.storageManager.setPromptActive(promptId, isActive);
    }
    // #endregion

    // #region Backup/Restore - 委托给BackupManager
    public async createBackup(data?: AppData): Promise<string> {
        const appData = data || await this.getAppData();
        return this.backupManager.createBackup(appData);
    }

    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        const appData = await this.backupManager.restoreFromBackup(backupPath);
        if (appData) {
            await this.saveAppData(appData);
        }
        return appData;
    }

    public getBackupList(): BackupInfo[] {
        return this.backupManager.getBackupList();
    }

    private async initializeAutoBackup(): Promise<void> {
        const data = await this.getAppData();
        await this.backupManager.initializeAutoBackup(data.settings);
    }
    // #endregion

    // #region Import/Export
    public async exportData(): Promise<string> {
        const appData = await this.getAppData();
        const result = await vscode.window.showSaveDialog({
            filters: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'JSON': ['json']
            }
        });
        if (result) {
            fs.writeFileSync(result.fsPath, JSON.stringify(appData, null, 4));
            return result.fsPath;
        }
        return '';
    }

    public async importData(): Promise<AppData | null> {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'JSON': ['json']
            }
        });

        if (result && result.length > 0) {
            const fileContent = fs.readFileSync(result[0].fsPath, 'utf-8');
            try {
                const importedData: AppData = JSON.parse(fileContent);

                const currentData = await this.getAppData();
                currentData.prompts = [...currentData.prompts, ...importedData.prompts];
                currentData.categories = [...new Set([...currentData.categories, ...importedData.categories])];
                
                await this.saveAppData(currentData);
                return currentData;

            } catch (error) {
                vscode.window.showErrorMessage('导入失败: 无效的JSON文件。');
                return null;
            }
        }
        return null;
    }
    // #endregion

    // #region Cloud Sync - 委托给SyncManager
    public async setupCloudSync(): Promise<AppData | void> {
        const provider = await vscode.window.showQuickPick(['GitHub', 'Gitee', 'GitLab', 'WebDAV', 'Custom'], {
            placeHolder: '选择一个云同步服务商'
        });

        if (!provider) return;

        switch (provider) {
            case 'GitHub':
                await this.setupGitHubSync();
                break;
            case 'Gitee':
                await this.setupGiteeSync();
                break;
            case 'GitLab':
                await this.setupGitLabSync();
                break;
            case 'WebDAV':
                await this.setupWebDAVSync();
                break;
            case 'Custom':
                await this.setupCustomApiSync();
                break;
            default:
                vscode.window.showErrorMessage('未指定有效的云服务提供商。');
        }
    }

    public async saveCloudSyncSettings(settings: any): Promise<AppData> {
        const appData = await this.getAppData();
        const { provider, gistId, gitlabUrl, webdavUrl, webdavUsername, customApiUrl, token } = settings;

        try {
            await this.syncManager.saveCloudSyncSettings(settings);
            
            appData.settings.syncProvider = provider;
            appData.settings.isValidated = true;
            appData.settings.cloudSync = true;
            
            // 根据提供商设置相应的配置
            switch (provider) {
                case 'github':
                case 'gitee':
                    appData.settings.gistId = gistId;
                    break;
                case 'gitlab':
                    appData.settings.gistId = gistId;
                    appData.settings.gitlabUrl = gitlabUrl || 'https://gitlab.com';
                    break;
                case 'webdav':
                    appData.settings.webdavUrl = webdavUrl;
                    appData.settings.webdavUsername = webdavUsername;
                    break;
                case 'custom':
                    appData.settings.customApiUrl = customApiUrl;
                    break;
            }
            
            await this.saveAppData(appData);
            return appData;
        } catch (error) {
            // 清除所有云同步设置
            appData.settings.cloudSync = false;
            appData.settings.syncProvider = null;
            appData.settings.isValidated = false;
            appData.settings.gistId = undefined;
            appData.settings.gitlabUrl = undefined;
            appData.settings.webdavUrl = undefined;
            appData.settings.webdavUsername = undefined;
            appData.settings.customApiUrl = undefined;
            
            await this.saveAppData(appData);
            throw error;
        }
    }

    private async setupGitHubSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({ 
            prompt: '输入你的GitHub Personal Access Token (需要gist权限)', 
            password: true, 
            ignoreFocusOut: true 
        });
        if (!token) return;

        const gistId = await vscode.window.showInputBox({ 
            prompt: '（可选）输入现有Gist ID进行关联',
            ignoreFocusOut: true 
        });

        const appData = await this.getAppData();
        await this.saveCloudSyncSettings({
            provider: 'github',
            token,
            gistId
        });

        vscode.window.showInformationMessage('GitHub Gist 同步已成功设置。');
        return appData;
    }

    private async setupGiteeSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({ 
            prompt: '输入你的Gitee Private Token (需要gists权限)', 
            password: true, 
            ignoreFocusOut: true 
        });
        if (!token) return;

        const gistId = await vscode.window.showInputBox({ 
            prompt: '（可选）输入现有Gist ID进行关联',
            ignoreFocusOut: true 
        });

        await this.saveCloudSyncSettings({
            provider: 'gitee',
            token,
            gistId
        });

        vscode.window.showInformationMessage('Gitee Gist 同步已成功设置。');
    }

    private async setupGitLabSync(): Promise<AppData | void> {
        const gitlabUrl = await vscode.window.showInputBox({ 
            prompt: '输入你的GitLab实例URL，如果使用gitlab.com请留空',
            placeHolder: 'https://gitlab.example.com',
            ignoreFocusOut: true
        }) || 'https://gitlab.com';

        const token = await vscode.window.showInputBox({ 
            prompt: '输入你的GitLab Personal Access Token (需要api scope)', 
            password: true, 
            ignoreFocusOut: true 
        });
        if (!token) return;

        const snippetId = await vscode.window.showInputBox({ 
            prompt: '（可选）输入现有Snippet ID进行关联',
            ignoreFocusOut: true 
        });

        await this.saveCloudSyncSettings({
            provider: 'gitlab',
            token,
            gistId: snippetId,
            gitlabUrl
        });

        vscode.window.showInformationMessage('GitLab Snippets 同步已成功设置。');
    }

    private async setupWebDAVSync(): Promise<AppData | void> {
        const webdavUrl = await vscode.window.showInputBox({ 
            prompt: '输入你的WebDAV服务器URL',
            ignoreFocusOut: true 
        });
        if (!webdavUrl) return;
        
        const webdavUsername = await vscode.window.showInputBox({ 
            prompt: '输入WebDAV用户名',
            ignoreFocusOut: true 
        });
        if (!webdavUsername) return;
        
        const webdavPassword = await vscode.window.showInputBox({ 
            prompt: '输入WebDAV密码', 
            password: true,
            ignoreFocusOut: true 
        });
        if (!webdavPassword) return;

        await this.saveCloudSyncSettings({
            provider: 'webdav',
            token: webdavPassword,
            webdavUrl,
            webdavUsername
        });

        vscode.window.showInformationMessage('WebDAV 同步已成功设置。');
    }

    private async setupCustomApiSync(): Promise<AppData | void> {
        const apiUrl = await vscode.window.showInputBox({ 
            prompt: '输入你的自定义API端点URL', 
            ignoreFocusOut: true 
        });
        if (!apiUrl) return;

        const apiKey = await vscode.window.showInputBox({ 
            prompt: '输入API密钥/Token', 
            password: true, 
            ignoreFocusOut: true 
        });
        if (!apiKey) return;

        await this.saveCloudSyncSettings({
            provider: 'custom',
            token: apiKey,
            customApiUrl: apiUrl
        });

        vscode.window.showInformationMessage('自定义API 同步已成功设置。');
    }

    public async disableCloudSync(): Promise<AppData | void> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync) { return; }

        const confirmation = await vscode.window.showWarningMessage(
            '您确定要禁用云同步吗？这将清除您本地存储的所有同步设置（Token、密码等）。',
            { modal: true },
            '确定'
        );

        if (confirmation !== '确定') { return; }
        
        appData.settings.cloudSync = false;
        appData.settings.syncProvider = null;
        appData.settings.gistId = undefined;
        appData.settings.gitlabUrl = undefined;
        appData.settings.webdavUrl = undefined;
        appData.settings.webdavUsername = undefined;
        appData.settings.customApiUrl = undefined;
        appData.settings.isValidated = false;

        await this.syncManager.resetCloudSync();
        await this.saveAppData(appData);

        return appData;
    }

    public async syncToCloud(force: boolean = false): Promise<void> {
        const appData = await this.getAppData();
        return this.syncManager.syncToCloud(appData, force);
    }

    public async syncFromCloud(force: boolean = false): Promise<AppData> {
        const appData = await this.getAppData();
        const remoteData = await this.syncManager.syncFromCloud(appData, force);
        await this.saveAppData(remoteData);
        return remoteData;
    }

    public async getSystemStatus(): Promise<SystemStatus> {
        const appData = await this.getAppData();
        const storageMode = appData.settings.workspaceMode ? 'workspace' : 'global';
        let cloudSyncStatus = '未启用';
        if (appData.settings.cloudSync && appData.settings.syncProvider) {
            cloudSyncStatus = `已启用 (${appData.settings.syncProvider})`;
        }
        return {
            storageMode,
            cloudSync: {
                status: cloudSyncStatus,
            }
        };
    }

    public async reconcileCloudSync(): Promise<SyncResult> {
        const appData = await this.getAppData();
        return this.syncManager.reconcileCloudSync(appData);
    }

    public async resetCloudSync(): Promise<AppData> {
        const appData = await this.getAppData();
        
        // 重置所有云同步相关设置为默认值
        appData.settings.cloudSync = false;
        appData.settings.autoSync = false;
        appData.settings.syncProvider = null;
        appData.settings.isValidated = false;
        appData.settings.gistId = undefined;
        appData.settings.gitlabUrl = undefined;
        appData.settings.webdavUrl = undefined;
        appData.settings.webdavUsername = undefined;
        appData.settings.customApiUrl = undefined;

        // 清除所有保存的密钥
        await this.syncManager.resetCloudSync();
        
        // 保存更新后的数据
        await this.saveAppData(appData);
        
        return appData;
    }

    public async resetAllData(): Promise<AppData> {
        const resetData = await this.storageManager.resetAllData();
        await this.syncManager.resetCloudSync();
        return resetData;
    }

    /**
     * 清空所有数据
     * 只保留默认设置，不包含任何示例数据
     * @returns Promise<AppData> 清空后的应用数据
     */
    public async clearAllData(): Promise<AppData> {
        const clearData = await this.storageManager.clearAllData();
        await this.syncManager.resetCloudSync();
        return clearData;
    }
    // #endregion

    public dispose(): void {
        this.backupManager.dispose();
        this.syncManager.dispose();
    }
}