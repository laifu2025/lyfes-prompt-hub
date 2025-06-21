import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
// @ts-ignore
import { createClient, WebDAVClient, AuthType } from 'webdav';

// #region Custom Error
export class SyncError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'SyncError';
    }
}

export class SyncConflictError extends Error {
    constructor(message: string, public localModified: string, public remoteModified: string) {
        super(message);
        this.name = 'SyncConflictError';
    }
}
// #endregion

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
        autoSync: boolean;
        syncProvider: 'github' | 'gitee' | 'gitlab' | 'webdav' | 'custom' | null;
        workspaceMode: boolean;
        isValidated?: boolean;
        gistId?: string; 
        gitlabUrl?: string;
        webdavUrl?: string;
        webdavUsername?: string;
        customApiUrl?: string;
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

// GitLab interfaces
interface GitLabSnippetResponse {
    id: number;
    raw_url?: string;
}

// Gitee interfaces
interface GiteeGistResponse {
    id: string;
}

// WebDAV a.d.
interface WebDAVClientOptions {
    username?: string;
    password?: string;
    authType?: AuthType;
}
// #endregion

export class DataManager {
    private context: vscode.ExtensionContext;
    private backupTimer?: NodeJS.Timeout;
    private syncDebouncer?: NodeJS.Timeout;
    private static readonly SYNC_FILENAME = 'prompt-hub.json';
    
    private static readonly STORAGE_KEYS = {
        APP_DATA: 'promptHub.appData',
        WORKSPACE_DATA: 'promptHub.workspaceData',
        BACKUP_HISTORY: 'promptHub.backupHistory',
        GITHUB_TOKEN: 'promptHub.githubToken',
        GITEE_TOKEN: 'promptHub.giteeToken',
        GITLAB_TOKEN: 'promptHub.gitlabToken',
        WEBDAV_PASSWORD: 'promptHub.webdavPassword',
        CUSTOM_API_KEY: 'promptHub.customApiKey'
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeAutoBackup().catch((err: any) => console.error("Failed to initialize auto-backup:", err));
    }

    private async getSecret(key: 'githubToken' | 'giteeToken' | 'gitlabToken' | 'webdavPassword' | 'customApiKey' | 'gitlabUrl' | 'webdavUrl' | 'customApiUrl'): Promise<string | undefined> {
        const keyMap = {
            githubToken: DataManager.STORAGE_KEYS.GITHUB_TOKEN,
            giteeToken: DataManager.STORAGE_KEYS.GITEE_TOKEN,
            gitlabToken: DataManager.STORAGE_KEYS.GITLAB_TOKEN,
            webdavPassword: DataManager.STORAGE_KEYS.WEBDAV_PASSWORD,
            customApiKey: DataManager.STORAGE_KEYS.CUSTOM_API_KEY,
            gitlabUrl: 'promptHub.gitlabUrl',
            webdavUrl: 'promptHub.webdavUrl',
            customApiUrl: 'promptHub.customApiUrl',
        };
        const secretKey = keyMap[key];
        if (!secretKey) return undefined;
    
        if (['gitlabUrl', 'webdavUrl', 'customApiUrl'].includes(key)) {
            const appData = await this.getAppData();
            if (key === 'gitlabUrl') return appData.settings.gitlabUrl;
            if (key === 'webdavUrl') return appData.settings.webdavUrl;
            if (key === 'customApiUrl') return appData.settings.customApiUrl;
        }

        return this.context.secrets.get(secretKey);
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
                autoSync: false,
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

        if (data.settings.cloudSync && data.settings.autoSync) {
            if (this.syncDebouncer) {
                clearTimeout(this.syncDebouncer);
            }
            this.syncDebouncer = setTimeout(() => {
                this.reconcileCloudSync()
                    .then(result => {
                        if (result.status === 'conflict') {
                             vscode.window.showWarningMessage('自动同步检测到冲突，请手动同步。');
                        }
                    })
                    .catch(err => {
                        if (err instanceof SyncConflictError) {
                            console.warn('[PromptHub] Auto-sync conflict detected. Needs manual intervention.');
                             vscode.window.showWarningMessage('自动同步检测到冲突，请手动同步。');
                        } else {
                            console.error('[PromptHub] Auto-sync failed:', err);
                        }
                    });
            }, 5000); // 5-second debounce delay
        }
    }

    public async updateSetting(key: string, value: any): Promise<void> {
        const appData = await this.getAppData();
        
        // Type-safe way to update settings
        if (key in appData.settings) {
            (appData.settings as any)[key] = value;
            await this.saveAppData(appData);
        } else {
            console.warn(`[DataManager] Attempted to update a non-existent setting: ${key}`);
            throw new Error(`Setting ${key} not found.`);
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
        appData.categories.push(categoryName);
        await this.saveAppData(appData);
        return appData;
    }

    public async renameCategory(oldName: string, newName: string): Promise<AppData> {
        const appData = await this.getAppData();
        const index = appData.categories.indexOf(oldName);
        if (index > -1) {
            appData.categories[index] = newName;
            appData.prompts.forEach(p => {
                if (p.category === oldName) {
                    p.category = newName;
                }
            });
            await this.saveAppData(appData);
        }
        return appData;
    }

    public async deleteCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        appData.categories = appData.categories.filter(c => c !== categoryName);
        appData.prompts.forEach(p => {
            if (p.category === categoryName) {
                p.category = ''; 
            }
        });
        await this.saveAppData(appData);
        return appData;
    }
    
    public async deleteTag(tagName: string): Promise<AppData> {
        const appData = await this.getAppData();
        appData.prompts.forEach(p => {
            if (p.tags) {
                p.tags = p.tags.filter(t => t !== tagName);
            }
        });
        await this.saveAppData(appData);
        return appData;
    }

    public async setPromptActive(promptId: string | number, isActive: boolean): Promise<void> {
        const id = Number(promptId);
        const appData = await this.getAppData();
        const prompt = appData.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.isActive = isActive;
            await this.saveAppData(appData);
        }
    }
    // #endregion

    // #region Backup/Restore
    public async createBackup(data?: AppData): Promise<string> {
        const appData = data || await this.getAppData();
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = `backup-${timestamp}.json`;
        const backupPath = path.join(backupDir, backupFile);
        fs.writeFileSync(backupPath, JSON.stringify(appData, null, 4));
        await this.updateBackupHistory(backupPath, timestamp);
        await this.cleanupOldBackups();
        return backupPath;
    }

    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        if (fs.existsSync(backupPath)) {
            const data = fs.readFileSync(backupPath, 'utf-8');
            const appData = JSON.parse(data);
            await this.saveAppData(appData);
            return appData;
        }
        return null;
    }

    public getBackupList(): Array<{path: string, timestamp: string, size: number}> {
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) {
            return [];
        }
        const files = fs.readdirSync(backupDir);
        return files
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stat = fs.statSync(filePath);
                return { path: filePath, timestamp: this.extractTimestamp(file), size: stat.size, mtime: stat.mtime };
            })
            .filter((file): file is { path: string; timestamp: string; size: number, mtime: Date } => file.timestamp !== 'N/A')
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .map(({path, timestamp, size})=>({path, timestamp, size}));
    }

    private extractTimestamp(filename: string): string {
        const match = filename.match(/backup-(.*)\.json/);
        return match ? match[1].replace(/-/g, ':') : 'N/A';
    }

    private getBackupDirectory(): string {
        return path.join(this.context.globalStorageUri.fsPath, 'backups');
    }

    private async updateBackupHistory(backupPath: string, timestamp: string): Promise<void> { }

    private async cleanupOldBackups(): Promise<void> { }

    private async initializeAutoBackup(): Promise<void> {
        const data = await this.getAppData();
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        if (data.settings.autoBackup) {
            this.backupTimer = setInterval(() => {
                this.createBackup().catch(err => console.error("Auto-backup failed:", err));
            }, data.settings.backupInterval * 60 * 1000);
        }
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

    // #region Cloud Sync
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

        // Clear all secrets first
        await this._clearAllSecrets();

        appData.settings.syncProvider = provider;
        appData.settings.isValidated = false;
        appData.settings.gistId = undefined;
        appData.settings.gitlabUrl = undefined;
        appData.settings.webdavUrl = undefined;
        appData.settings.webdavUsername = undefined;
        appData.settings.customApiUrl = undefined;

        try {
            switch (provider) {
                case 'github':
                    appData.settings.gistId = await this._validateAndStoreGitHub(token, gistId);
                    break;
                case 'gitee':
                    appData.settings.gistId = await this._validateAndStoreGitee(token, gistId);
                    break;
                case 'gitlab':
                    const finalGitlabUrl = gitlabUrl || 'https://gitlab.com';
                    appData.settings.gistId = await this._validateAndStoreGitLab(finalGitlabUrl, token, gistId);
                    appData.settings.gitlabUrl = finalGitlabUrl;
                    break;
                case 'webdav':
                    if (!webdavUrl || !webdavUsername) throw new SyncError('WebDAV URL 和用户名不能为空。', 'WEBDAV_CONFIG_MISSING');
                    await this._validateAndStoreWebDAV(webdavUrl, webdavUsername, token);
                    appData.settings.webdavUrl = webdavUrl;
                    appData.settings.webdavUsername = webdavUsername;
                    break;
                case 'custom':
                    if (!customApiUrl) throw new SyncError('自定义 API URL 不能为空。', 'CUSTOM_API_URL_MISSING');
                    await this._validateAndStoreCustomApi(customApiUrl, token);
                    appData.settings.customApiUrl = customApiUrl;
                    break;
                default:
                    throw new SyncError(`未知的云服务提供商: ${provider}`, 'UNKNOWN_PROVIDER');
            }
            appData.settings.cloudSync = true;
            appData.settings.isValidated = true;
        } catch (error) {
            // Passthrough SyncError, wrap others
            if (error instanceof SyncError) {
                throw error;
            } else if (error instanceof Error) {
                throw new SyncError(`验证失败: ${error.message}`, 'VALIDATION_FAILED');
            } else {
                throw new SyncError('发生未知验证错误。', 'UNKNOWN_VALIDATION_ERROR');
            }
        }

        await this.saveAppData(appData);
        return appData;
    }

    private async _clearAllSecrets() {
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITEE_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);
    }
    
    private async _validateAndStoreGitHub(token: string, gistId?: string): Promise<string> {
        const result = await this._testGitHubGist(token, gistId);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITHUB_TOKEN, token);
        return result.gistId;
    }

    private async _validateAndStoreGitee(token: string, gistId?: string): Promise<string> {
        const validatedGist = await this._testGiteeGist(token, gistId);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITEE_TOKEN, token);
        return validatedGist.gistId;
    }

    private async _validateAndStoreGitLab(url: string, token: string, snippetId?: string): Promise<string> {
        const validatedSnippet = await this._testGitLabSnippet(url, token, snippetId);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITLAB_TOKEN, token);
        return validatedSnippet.snippetId;
    }

    private async _validateAndStoreWebDAV(url: string, user: string, pass: string): Promise<void> {
        await this._testWebDAV(url, user, pass);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD, pass);
    }

    private async _validateAndStoreCustomApi(url: string, key: string): Promise<void> {
        await this._testCustomApi(url, key);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.CUSTOM_API_KEY, key);
    }

    private _handleAxiosError(error: any, provider: string, operation: 'read' | 'write' | 'test'): SyncError {
        if (axios.isAxiosError(error)) {
            const err = error as AxiosError;
            const status = err.response?.status;
            switch (status) {
                case 401:
                    return new SyncError(`${provider} 凭证无效或已过期，请检查 Token/密码。`, 'INVALID_CREDENTIALS');
                case 403:
                    return new SyncError(`您没有权限访问此 ${provider} 资源，请检查权限设置。`, 'FORBIDDEN');
                case 404:
                    return new SyncError(`${provider} ${operation === 'read' ? '资源' : 'Gist/Snippet'} 未找到，请检查 ID 或 URL。`, 'NOT_FOUND');
                default:
                    if (err.request) {
                        return new SyncError(`无法连接到 ${provider} 服务器，请检查网络连接或 ${provider} URL。`, 'CONNECTION_FAILED');
                    }
                    return new SyncError(`${provider} 请求失败: ${err.message}`, 'REQUEST_FAILED');
            }
        }
        return new SyncError(`${provider} 发生未知错误: ${error.message}`, 'UNKNOWN_ERROR');
    }

    private async _testGitHubGist(token: string, gistId?: string): Promise<{ gistId: string, isNew: boolean }> {
        const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
        
            if (gistId) {
            // Validate existing Gist
            try {
                await axios.get(`https://api.github.com/gists/${gistId}`, { headers });
                return { gistId, isNew: false };
            } catch (error) {
                throw this._handleAxiosError(error, 'GitHub', 'test');
            }
            } else {
            // Create new Gist
            try {
                const response = await axios.post('https://api.github.com/gists', {
                    description: 'Lyfe\'s Prompt Hub Sync',
                    public: false,
                    files: { [DataManager.SYNC_FILENAME]: { content: '{}' } }
                }, { headers });
                const newGistId = response.data.id;
                if (!newGistId) {
                    throw new Error('创建Gist成功，但未能获取Gist ID。');
                }
                return { gistId: newGistId, isNew: true }; 
        } catch (error) {
                // Here is the source of the problem. Axios errors are not standard Error objects.
                // We must wrap it to ensure it has a .message property.
            throw this._handleAxiosError(error, 'GitHub', 'test');
            }
        }
    }
    
    private async _testGiteeGist(token: string, gistId?: string): Promise<{ gistId: string, isNew: boolean }> {
        const giteeApiUrl = `https://gitee.com/api/v5`;
        const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' };
        const fileName = DataManager.SYNC_FILENAME;

        if (gistId) {
            try {
                await axios.get(`${giteeApiUrl}/gists/${gistId}`, { headers });
                return { gistId, isNew: false };
            } catch (error: any) {
                if (error.response && error.response.status === 404) {
                    // Gist not found, fall through to create a new one
                } else {
                    throw this._handleAxiosError(error, 'Gitee', 'test');
                }
            }
        }

        try {
            const createData = {
                files: { [fileName]: { content: '{"version":"1.0.0"}' } },
                description: 'Prompt Hub Sync Data',
                public: false,
            };
            const response = await axios.post<GiteeGistResponse>(`${giteeApiUrl}/gists`, createData, { headers });
            return { gistId: response.data.id, isNew: true };
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'write');
        }
    }

    private async _testGitLabSnippet(url: string, token: string, snippetId?: string): Promise<{ snippetId: string, isNew: boolean }> {
        const apiUrl = url.endsWith('/') ? `${url}api/v4` : `${url}/api/v4`;
        const headers = { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' };

        if (snippetId) {
            try {
                await axios.get(`${apiUrl}/snippets/${snippetId}`, { headers });
                return { snippetId, isNew: false };
            } catch (error: any) {
                if (error.response && error.response.status === 404) {
                    // Snippet not found, fall through to create a new one
                } else {
                    throw this._handleAxiosError(error, 'GitLab', 'test');
                }
            }
        }
        
        // Create a new snippet if no ID is provided or the existing one is not found
        try {
            const createData = {
                title: 'Prompt Hub Sync Data',
                file_name: DataManager.SYNC_FILENAME,
                content: JSON.stringify({ prompts: [], categories: [], version: '1.0' }, null, 2),
                visibility: 'private' as const
            };

            const response = await axios.post<GitLabSnippetResponse>(`${apiUrl}/snippets`, createData, { headers });
            
            if (response.data && response.data.id) {
                return { snippetId: response.data.id.toString(), isNew: true };
            } else {
                throw new Error('Failed to create GitLab snippet: Invalid response from server.');
            }
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'write');
        }
    }

    private async _testWebDAV(url: string, user: string, pass: string): Promise<void> {
        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        const testFilePath = `/.prompt-hub-test-${Date.now()}.tmp`;
        try {
            // Attempt to write a temporary file to test permissions
            await client.putFileContents(testFilePath, 'test');
            // Attempt to delete the temporary file
            await client.deleteFile(testFilePath);
        } catch (error: any) {
            console.error('[WebDAV Test] Error:', error.message);
            // Try to clean up even if there was an error
            try {
                if (await client.exists(testFilePath)) {
                    await client.deleteFile(testFilePath);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw new SyncError('Failed to verify WebDAV server access. Check URL, credentials, and permissions.', 'AUTH_ERROR');
        }
    }

    private async _testCustomApi(url: string, key: string): Promise<void> {
        try {
            await axios.get(url, {
                headers: { 'Authorization': `Bearer ${key}` }
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'Custom API', 'test');
        }
    }
    
    // These functions were missing and are now restored.
    private async setupGitHubSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({ prompt: '输入你的GitHub Personal Access Token (需要gist权限)', password: true, ignoreFocusOut: true });
        if (!token) return;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证 GitHub Token...',
                cancellable: true
            }, async (_, cancellationToken) => {
                const controller = new AbortController();
                cancellationToken.onCancellationRequested(() => controller.abort());

                const response = await axios.get('https://api.github.com/user', {
                    headers: { 'Authorization': `token ${token}` },
                    signal: controller.signal
                } as any);

                const scopes = (response.headers as any)['x-oauth-scopes'] as string;
                if (!scopes || !scopes.split(', ').includes('gist')) {
                    throw new Error('Token无效或缺少 "gist" 权限。');
                }
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`GitHub Token 验证失败: ${error.message}`);
            return;
        }
        
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITHUB_TOKEN, token);
        const gistId = await vscode.window.showInputBox({ prompt: '（可选）输入现有Gist ID进行关联' });
        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'github';
        appData.settings.gistId = gistId || undefined;
        await this.saveAppData(appData);
        vscode.window.showInformationMessage('GitHub Gist 同步已成功设置。');
        return appData;
    }

    private async setupGiteeSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({ prompt: '输入你的Gitee Private Token (需要gists权限)', password: true, ignoreFocusOut: true });
        if (!token) return;

        try {
             await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证 Gitee Token...',
                cancellable: true
            }, async (_, cancellationToken) => {
                const controller = new AbortController();
                cancellationToken.onCancellationRequested(() => controller.abort());
                await axios.get('https://gitee.com/api/v5/user', {
                    params: { access_token: token },
                    signal: controller.signal
                } as any);
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Gitee Token 验证失败: ${error.message}`);
            return;
        }

        const gistId = await vscode.window.showInputBox({ prompt: '（可选）输入现有Gist ID进行关联' });
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITEE_TOKEN, token);
        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'gitee';
        appData.settings.gistId = gistId || undefined;
        await this.saveAppData(appData);
        vscode.window.showInformationMessage('Gitee Gist 同步已成功设置。');
        return appData;
    }

    private async setupGitLabSync(): Promise<AppData | void> {
        const gitlabUrl = await vscode.window.showInputBox({ 
            prompt: '输入你的GitLab实例URL，如果使用gitlab.com请留空',
            placeHolder: 'https://gitlab.example.com',
            ignoreFocusOut: true
        }) || 'https://gitlab.com';

        const token = await vscode.window.showInputBox({ prompt: '输入你的GitLab Personal Access Token (需要api scope)', password: true, ignoreFocusOut: true });
        if (!token) return;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证 GitLab Token...',
                cancellable: true
            }, async (_, cancellationToken) => {
                const controller = new AbortController();
                cancellationToken.onCancellationRequested(() => controller.abort());
                await axios.get(`${gitlabUrl}/api/v4/user`, {
                    headers: { 'PRIVATE-TOKEN': token },
                    signal: controller.signal
                } as any);
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`GitLab Token 验证失败: ${error.message}`);
            return;
        }

        const snippetId = await vscode.window.showInputBox({ prompt: '（可选）输入现有Snippet ID进行关联' });
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITLAB_TOKEN, token);
        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'gitlab';
        appData.settings.gistId = snippetId || undefined;
        appData.settings.gitlabUrl = gitlabUrl;
        await this.saveAppData(appData);
        vscode.window.showInformationMessage('GitLab Snippets 同步已成功设置。');
        return appData;
    }

    private async setupWebDAVSync(): Promise<AppData | void> {
        const webdavUrl = await vscode.window.showInputBox({ prompt: '输入你的WebDAV服务器URL' });
        if (!webdavUrl) return;
        
        const webdavUsername = await vscode.window.showInputBox({ prompt: '输入WebDAV用户名' });
        if (!webdavUsername) return;
        
        const webdavPassword = await vscode.window.showInputBox({ prompt: '输入WebDAV密码', password: true });
        if (!webdavPassword) return;

        try {
            await this._testWebDAV(webdavUrl, webdavUsername, webdavPassword);
        } catch (error: any) {
            vscode.window.showErrorMessage(`WebDAV 验证失败: ${error.message}`);
            return;
        }

        await this.context.secrets.store(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD, webdavPassword);
        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'webdav';
        appData.settings.webdavUrl = webdavUrl;
        appData.settings.webdavUsername = webdavUsername;
        await this.saveAppData(appData);
        vscode.window.showInformationMessage('WebDAV 同步已成功设置。');
        return appData;
    }

    private async setupCustomApiSync(): Promise<AppData | void> {
        const apiUrl = await vscode.window.showInputBox({ prompt: '输入你的自定义API端点URL', ignoreFocusOut: true });
        if (!apiUrl) return;

        const apiKey = await vscode.window.showInputBox({ prompt: '输入API密钥/Token', password: true, ignoreFocusOut: true });
        if (!apiKey) return;

        try {
            await this._testCustomApi(apiUrl, apiKey);
        } catch (error: any) {
            vscode.window.showErrorMessage(`自定义 API 验证失败: ${error.message}`);
            return;
        }

        await this.context.secrets.store(DataManager.STORAGE_KEYS.CUSTOM_API_KEY, apiKey);
        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'custom';
        appData.settings.customApiUrl = apiUrl;
        await this.saveAppData(appData);
        vscode.window.showInformationMessage('自定义API 同步已成功设置。');
        return appData;
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

        await this._clearAllSecrets();
            await this.saveAppData(appData);

            return appData;
    }

    public async syncToCloud(force: boolean = false): Promise<void> {
        const localData = await this.getAppData();
        if (!localData.settings.cloudSync || !localData.settings.syncProvider) {
            return;
        }

        if (!force) {
            const remoteData = await this.getRemoteAppData();
            if (remoteData) {
                const localModified = new Date(localData.metadata.lastModified);
                const remoteModified = new Date(remoteData.metadata.lastModified);

                if (localModified <= remoteModified) {
                    throw new SyncConflictError(
                        'Local data is not newer than cloud data. Upload would overwrite remote changes.',
                        localData.metadata.lastModified,
                        remoteData.metadata.lastModified
                    );
                }
            }
        }

        const content = JSON.stringify(localData, null, 4);

        switch (localData.settings.syncProvider) {
                case 'github':
                await this.syncToGitHub(content);
                    break;
                case 'gitee':
                await this.syncToGitee(content);
                    break;
                case 'gitlab':
                await this.syncToGitLab(content);
                    break;
                case 'webdav':
                await this.syncToWebDAV(content);
                    break;
                case 'custom':
                await this.syncToCustomApi(content);
                    break;
            default:
                throw new SyncError('Unsupported sync provider.', 'unsupported_provider');
        }
    }

    private async syncToGitHub(content: string): Promise<void> {
        const token = await this.getSecret('githubToken');
        const appData = await this.getAppData();
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('GitHub token or Gist ID is not configured.', 'config_missing');
        }

        try {
            await axios.patch(`https://api.github.com/gists/${gistId}`, {
                files: {
                    [DataManager.SYNC_FILENAME]: {
                        content: content
                    }
                }
            }, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'write');
        }
    }

    private async syncToGitee(content: string): Promise<void> {
        const token = await this.getSecret('giteeToken');
        const appData = await this.getAppData();
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('Gitee token or Gist ID is not configured.', 'config_missing');
        }
        
        try {
            await axios.patch(`https://gitee.com/api/v5/gists/${gistId}`, {
                files: {
                    [DataManager.SYNC_FILENAME]: {
                        content: content
                    }
                },
                access_token: token
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'write');
        }
    }

    private async syncToGitLab(content: string): Promise<void> {
        const token = await this.getSecret('gitlabToken');
        const appData = await this.getAppData();
        const snippetId = appData.settings.gistId;
        const gitlabUrl = appData.settings.gitlabUrl || 'https://gitlab.com';

        if (!token || !snippetId) {
            throw new SyncError('GitLab token or Snippet ID is not configured.', 'config_missing');
        }

        try {
            await axios.put(`${gitlabUrl}/api/v4/snippets/${snippetId}`, {
                content: content,
                file_name: DataManager.SYNC_FILENAME
            }, {
                headers: { 'PRIVATE-TOKEN': token }
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'write');
        }
    }

    private async syncToWebDAV(content: string): Promise<void> {
        const pass = await this.getSecret('webdavPassword');
        const appData = await this.getAppData();
        const url = appData.settings.webdavUrl;
        const user = appData.settings.webdavUsername;

        if (!url || !user || !pass) {
            throw new SyncError('WebDAV configuration is incomplete.', 'config_missing');
        }

        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        const filePath = path.join('/', DataManager.SYNC_FILENAME);
        
        try {
            await client.putFileContents(filePath, content, { overwrite: true });
        } catch (error) {
            throw new SyncError(`WebDAV write error: ${error}`, 'webdav_write_error');
        }
    }

    private async syncToCustomApi(content: string): Promise<void> {
        const apiKey = await this.getSecret('customApiKey');
        const apiUrl = (await this.getAppData()).settings.customApiUrl;

        if (!apiKey || !apiUrl) {
            throw new SyncError('Custom API key or URL is not configured.', 'config_missing');
        }

        try {
            await axios.post(apiUrl, { content }, {
                headers: { 'x-api-key': apiKey }
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'Custom API', 'write');
        }
    }

    public async syncFromCloud(force: boolean = false): Promise<AppData> {
        const localData = await this.getAppData();
        const remoteData = await this.getRemoteAppData();

        if (!remoteData) {
            throw new SyncError('Could not retrieve remote data. The cloud may be empty.', 'remote_empty');
        }

        if (!force) {
            const localModified = new Date(localData.metadata.lastModified);
            const remoteModified = new Date(remoteData.metadata.lastModified);

            if (remoteModified <= localModified) {
                throw new SyncConflictError(
                    'Remote data is not newer than local data. Download would overwrite local changes.',
                    localData.metadata.lastModified,
                    remoteData.metadata.lastModified
                );
            }
        }

        await this.saveAppData(remoteData);
        return remoteData;
    }

    private async getRemoteAppData(): Promise<AppData | null> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            return null;
        }

            switch (appData.settings.syncProvider) {
                case 'github':
                return this.syncFromGitHub();
                case 'gitee':
                return this.syncFromGitee();
                case 'gitlab':
                return this.syncFromGitLab();
                case 'webdav':
                return this.syncFromWebDAV();
                case 'custom':
                return this.syncFromCustomApi();
            default:
                throw new SyncError('Unsupported sync provider.', 'unsupported_provider');
        }
    }

    private async syncFromGitHub(): Promise<AppData | null> {
        const token = await this.getSecret('githubToken');
        const gistId = (await this.getAppData()).settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('GitHub token or Gist ID is not configured.', 'config_missing');
        }
        
        try {
            const response = await axios.get<GistGetResponse>(`https://api.github.com/gists/${gistId}`, {
                headers: { 'Authorization': `token ${token}` }
            });
            const content = response.data.files[DataManager.SYNC_FILENAME]?.content;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'read');
        }
    }

    private async syncFromGitee(): Promise<AppData | null> {
        const token = await this.getSecret('giteeToken');
        const gistId = (await this.getAppData()).settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('Gitee token or Gist ID is not configured.', 'config_missing');
        }

        try {
            const response = await axios.get<GistGetResponse>(`https://gitee.com/api/v5/gists/${gistId}`, {
                params: { access_token: token }
            });
            const content = response.data.files[DataManager.SYNC_FILENAME]?.content;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'read');
        }
    }

    private async syncFromGitLab(): Promise<AppData | null> {
        const token = await this.getSecret('gitlabToken');
        const { gistId: snippetId, gitlabUrl = 'https://gitlab.com' } = (await this.getAppData()).settings;

        if (!token || !snippetId) {
            throw new SyncError('GitLab token or Snippet ID is not configured.', 'config_missing');
        }

        try {
            const snippetInfoResponse = await axios.get<GitLabSnippetResponse>(`${gitlabUrl}/api/v4/snippets/${snippetId}`, {
                headers: { 'PRIVATE-TOKEN': token }
            });

            const rawUrl = snippetInfoResponse.data.raw_url;
            if (!rawUrl) {
                throw new SyncError('Could not find raw URL for GitLab snippet.', 'gitlab_raw_url_missing');
            }

            const response = await axios.get<string>(rawUrl, {
                headers: { 'PRIVATE-TOKEN': token }
            });

            const content = response.data;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'read');
        }
    }
    
    private async syncFromWebDAV(): Promise<AppData | null> {
        const pass = await this.getSecret('webdavPassword');
        const appData = await this.getAppData();
        const url = appData.settings.webdavUrl;
        const user = appData.settings.webdavUsername;

        if (!url || !user || !pass) {
            throw new SyncError('WebDAV configuration is incomplete.', 'config_missing');
        }
        
        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        const filePath = path.join('/', DataManager.SYNC_FILENAME);

        try {
            if (await client.exists(filePath)) {
                const content = await client.getFileContents(filePath, { format: "text" });
                return content ? JSON.parse(content as string) : null;
            }
            return null;
        } catch (error) {
            throw new SyncError(`WebDAV read error: ${error}`, 'webdav_read_error');
        }
    }
    
    private async syncFromCustomApi(): Promise<AppData | null> {
        const apiKey = await this.getSecret('customApiKey');
        const apiUrl = (await this.getAppData()).settings.customApiUrl;

        if (!apiKey || !apiUrl) {
            throw new SyncError('Custom API key or URL is not configured.', 'config_missing');
        }

        try {
            const response = await axios.get(apiUrl, {
                headers: { 'x-api-key': apiKey }
            });

            const content = response.data?.data?.content;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'Custom API', 'read');
        }
    }

    public async getSystemStatus(): Promise<{ storageMode: 'workspace' | 'global'; cloudSync: { status: string } }> {
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

    public async reconcileCloudSync(): Promise<{status: 'uploaded' | 'downloaded' | 'in_sync' | 'conflict' | 'error' | 'disabled', message?: string}> {
        const localData = await this.getAppData();
        if (!localData.settings.cloudSync || !localData.settings.syncProvider) {
            return { status: 'disabled', message: 'Cloud sync is not enabled.' };
        }

        try {
            const remoteData = await this.getRemoteAppData();

            if (!remoteData) {
                // No remote data, so we can safely upload.
                await this.syncToCloud(true); // Force push as it's the first time
                return { status: 'uploaded', message: 'Initial data uploaded to cloud.' };
            }

            const localModified = new Date(localData.metadata.lastModified);
            const remoteModified = new Date(remoteData.metadata.lastModified);

            if (localModified > remoteModified) {
                await this.syncToCloud(false);
                return { status: 'uploaded', message: 'Local changes uploaded.' };
            } else if (remoteModified > localModified) {
                await this.syncFromCloud(false);
                return { status: 'downloaded', message: 'Remote changes downloaded.' };
            } else {
                return { status: 'in_sync', message: 'Data is already in sync.' };
            }

        } catch (error) {
            if (error instanceof SyncConflictError) {
                console.warn(`[PromptHub] Sync conflict during reconciliation: ${error.message}`);
                return { status: 'conflict', message: error.message };
            }
            console.error(`[PromptHub] Error during sync reconciliation: ${error}`);
            return { status: 'error', message: error instanceof Error ? error.message : String(error) };
        }
    }

    public dispose(): void {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        if (this.syncDebouncer) {
            clearTimeout(this.syncDebouncer);
        }
    }
}