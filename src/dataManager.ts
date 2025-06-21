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
    id: string;
    raw_url: string;
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
        const result = await this._testGiteeGist(token, gistId);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITEE_TOKEN, token);
        return result.gistId;
    }

    private async _validateAndStoreGitLab(url: string, token: string, snippetId?: string): Promise<string> {
        const result = await this._testGitLabSnippet(url, token, snippetId);
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITLAB_TOKEN, token);
        return result.snippetId;
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
        try {
            if (gistId) {
                // Test existing Gist
                await axios.get(`https://api.github.com/gists/${gistId}`, { headers });
                return { gistId, isNew: false };
            } else {
                // Test token by creating a new Gist
                const response = await axios.post('https://api.github.com/gists', {
                    description: 'Prompt Hub Sync Data',
                    public: false,
                    files: { [DataManager.SYNC_FILENAME]: { content: '{}' } }
                }, { headers });
                const newGistId = (response.data as GistCreateResponse).id;
                // clean up
                await axios.delete(`https://api.github.com/gists/${newGistId}`, { headers });
                return { gistId: newGistId, isNew: true }; 
            }
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'test');
        }
    }
    
    private async _testGiteeGist(token: string, gistId?: string): Promise<{ gistId: string, isNew: boolean }> {
        const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' };
        try {
            if (gistId) {
                await axios.get(`https://gitee.com/api/v5/gists/${gistId}`, { headers });
                return { gistId, isNew: false };
            } else {
                const response = await axios.post('https://gitee.com/api/v5/gists', {
                    description: 'Prompt Hub Sync Data',
                    public: false,
                    files: { [DataManager.SYNC_FILENAME]: { content: '{}' } }
                }, { headers });
                const newGistId = (response.data as GiteeGistResponse).id;
                // clean up
                await axios.delete(`https://gitee.com/api/v5/gists/${newGistId}`, { headers });
                return { gistId: newGistId, isNew: true };
            }
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'test');
        }
    }

    private async _testGitLabSnippet(url: string, token: string, snippetId?: string): Promise<{ snippetId: string, isNew: boolean }> {
        const headers = { 'PRIVATE-TOKEN': token };
        const apiUrl = new URL(url);
        apiUrl.pathname = path.join(apiUrl.pathname, 'api/v4');
        const endpoint = apiUrl.toString();

        try {
            if (snippetId) {
                await axios.get(`${endpoint}/snippets/${snippetId}`, { headers });
                return { snippetId, isNew: false };
            } else {
                const response = await axios.post(`${endpoint}/snippets`, {
                    title: 'Prompt Hub Sync Data',
                    visibility: 'private',
                    files: [{ file_path: DataManager.SYNC_FILENAME, content: '{}' }]
                }, { headers });
                const newSnippetId = (response.data as GitLabSnippetResponse).id;
                // clean up
                await axios.delete(`${endpoint}/snippets/${newSnippetId}`, { headers });
                return { snippetId: newSnippetId, isNew: true };
            }
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'test');
        }
    }

    private async _testWebDAV(url: string, user: string, pass: string): Promise<void> {
        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        try {
            // Test connection and credentials by listing root directory contents
            await client.getDirectoryContents('/');
        } catch (error: any) {
            if (error.response && error.response.status === 401) {
                throw new SyncError('WebDAV 用户名或密码错误。', 'INVALID_CREDENTIALS');
            }
            throw new SyncError(`连接 WebDAV 服务器失败: ${error.message}`, 'CONNECTION_FAILED');
        }
    }

    private async _testCustomApi(url: string, key: string): Promise<void> {
        try {
            await axios.get(url, { headers: { 'Authorization': `Bearer ${key}` } });
        } catch (error) {
             throw this._handleAxiosError(error, '自定义 API', 'test');
        }
    }
    
    // These functions were missing and are now restored.
    private async setupGitHubSync(): Promise<AppData | void> {
        const token = await vscode.window.showInputBox({ prompt: '输入你的GitHub Personal Access Token (需要gist权限)', password: true, ignoreFocusOut: true });
        if (!token) { return; }

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

    public async syncToCloud(): Promise<void> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            console.log("Cloud sync is not enabled.");
            return;
        }

        const dataToSync = JSON.stringify(appData, null, 4);

        try {
            switch (appData.settings.syncProvider) {
                case 'github':
                    await this.syncToGitHub(dataToSync);
                    break;
                case 'gitee':
                    await this.syncToGitee(dataToSync);
                    break;
                case 'gitlab':
                    await this.syncToGitLab(dataToSync);
                    break;
                case 'webdav':
                    await this.syncToWebDAV(dataToSync);
                    break;
                case 'custom':
                    await this.syncToCustomApi(dataToSync);
                    break;
            }
             vscode.window.setStatusBarMessage('✅ 同步成功', 3000);
        } catch (error: any) {
            const message = error instanceof SyncError ? error.message : `同步失败: ${error.message}`;
            vscode.window.showErrorMessage(message);
            // Re-throw to allow caller to handle if needed
            throw error;
        }
    }

    private async syncToGitHub(content: string): Promise<void> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
        if (!token || !appData.settings.gistId) throw new SyncError('GitHub 配置不完整。', 'CONFIG_INCOMPLETE');
        const headers = { 'Authorization': `token ${token}` };
        const url = `https://api.github.com/gists/${appData.settings.gistId}`;
        try {
            await axios.patch(url, { files: { [DataManager.SYNC_FILENAME]: { content } } }, { headers });
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'write');
        }
    }

    private async syncToGitee(content: string): Promise<void> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITEE_TOKEN);
        if (!token || !appData.settings.gistId) throw new SyncError('Gitee 配置不完整。', 'CONFIG_INCOMPLETE');
        const headers = { 'Authorization': `token ${token}` };
        const url = `https://gitee.com/api/v5/gists/${appData.settings.gistId}`;
        try {
            await axios.patch(url, { files: { [DataManager.SYNC_FILENAME]: { content } } }, { headers });
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'write');
        }
    }

    private async syncToGitLab(content: string): Promise<void> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
        if (!token || !appData.settings.gistId || !appData.settings.gitlabUrl) throw new SyncError('GitLab 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const apiUrl = new URL(appData.settings.gitlabUrl);
        apiUrl.pathname = path.join(apiUrl.pathname, `api/v4/snippets/${appData.settings.gistId}`);
        const url = apiUrl.toString();
        
        const headers = { 'PRIVATE-TOKEN': token };

        try {
            await axios.put(url, { 
                files: [{ action: 'update', file_path: DataManager.SYNC_FILENAME, content }] 
            }, { headers });
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'write');
        }
    }

    private async syncToWebDAV(content: string): Promise<void> {
        const appData = await this.getAppData();
        const password = await this.context.secrets.get(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
        if (!password || !appData.settings.webdavUrl || !appData.settings.webdavUsername) throw new SyncError('WebDAV 配置不完整。', 'CONFIG_INCOMPLETE');

        const client: WebDAVClient = createClient(appData.settings.webdavUrl, { 
            username: appData.settings.webdavUsername, 
            password 
        });

        try {
            await client.putFileContents(`/${DataManager.SYNC_FILENAME}`, content, { overwrite: true });
        } catch (error: any) {
             if (error.response && error.response.status === 401) {
                throw new SyncError('WebDAV 用户名或密码错误。', 'INVALID_CREDENTIALS');
            }
            throw new SyncError(`写入 WebDAV 失败: ${error.message}`, 'WRITE_FAILED');
        }
    }

    private async syncToCustomApi(content: string): Promise<void> {
        const appData = await this.getAppData();
        const key = await this.context.secrets.get(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);
        if (!key || !appData.settings.customApiUrl) throw new SyncError('自定义 API 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const headers = { 'Authorization': `Bearer ${key}` };
        try {
            await axios.post(appData.settings.customApiUrl, { content }, { headers });
        } catch (error) {
            throw this._handleAxiosError(error, '自定义 API', 'write');
        }
    }

    public async syncFromCloud(): Promise<AppData | null> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            console.log("Cloud sync is not enabled.");
            return null;
        }

        try {
            let remoteData: AppData | null = null;
            switch (appData.settings.syncProvider) {
                case 'github':
                    remoteData = await this.syncFromGitHub();
                    break;
                case 'gitee':
                    remoteData = await this.syncFromGitee();
                    break;
                case 'gitlab':
                    remoteData = await this.syncFromGitLab();
                    break;
                case 'webdav':
                    remoteData = await this.syncFromWebDAV();
                    break;
                case 'custom':
                    remoteData = await this.syncFromCustomApi();
                    break;
            }

            if (remoteData) {
                await this.saveAppData(remoteData);
                 vscode.window.setStatusBarMessage('✅ 从云端恢复数据成功', 3000);
                return remoteData;
            }
            return null;
        } catch (error: any) {
            const message = error instanceof SyncError ? error.message : `从云端同步失败: ${error.message}`;
            vscode.window.showErrorMessage(message);
            throw error;
        }
    }

    private async syncFromGitHub(): Promise<AppData | null> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
        if (!token || !appData.settings.gistId) throw new SyncError('GitHub 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const headers = { 'Authorization': `token ${token}` };
        const url = `https://api.github.com/gists/${appData.settings.gistId}`;
        
        try {
            const response = await axios.get<GistGetResponse>(url, { headers });
            const file = response.data.files[DataManager.SYNC_FILENAME];
            return file && file.content ? JSON.parse(file.content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'read');
        }
    }

    private async syncFromGitee(): Promise<AppData | null> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITEE_TOKEN);
        if (!token || !appData.settings.gistId) throw new SyncError('Gitee 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const headers = { 'Authorization': `token ${token}` };
        const url = `https://gitee.com/api/v5/gists/${appData.settings.gistId}`;
        
        try {
            const response = await axios.get<GistGetResponse>(url, { headers });
            const file = response.data.files[DataManager.SYNC_FILENAME];
            return file && file.content ? JSON.parse(file.content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'read');
        }
    }

    private async syncFromGitLab(): Promise<AppData | null> {
        const appData = await this.getAppData();
        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
        if (!token || !appData.settings.gistId || !appData.settings.gitlabUrl) throw new SyncError('GitLab 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const apiUrl = new URL(appData.settings.gitlabUrl);
        apiUrl.pathname = path.join(apiUrl.pathname, `api/v4/snippets/${appData.settings.gistId}/raw`);
        const url = apiUrl.toString();

        const headers = { 'PRIVATE-TOKEN': token };
        
        try {
            const response = await axios.get<AppData>(url, { headers });
            return response.data;
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'read');
        }
    }
    
    private async syncFromWebDAV(): Promise<AppData | null> {
        const appData = await this.getAppData();
        const password = await this.context.secrets.get(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
        if (!password || !appData.settings.webdavUrl || !appData.settings.webdavUsername) throw new SyncError('WebDAV 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const client: WebDAVClient = createClient(appData.settings.webdavUrl, { 
            username: appData.settings.webdavUsername, 
            password 
        });

        try {
            const content = await client.getFileContents(`/${DataManager.SYNC_FILENAME}`, { format: 'text' });
            return JSON.parse(content as string);
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                 return null; // File doesn't exist, which is fine on first sync
            }
             if (error.response && error.response.status === 401) {
                throw new SyncError('WebDAV 用户名或密码错误。', 'INVALID_CREDENTIALS');
            }
            throw new SyncError(`读取 WebDAV 失败: ${error.message}`, 'READ_FAILED');
        }
    }
    
    private async syncFromCustomApi(): Promise<AppData | null> {
        const appData = await this.getAppData();
        const key = await this.context.secrets.get(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);
        if (!key || !appData.settings.customApiUrl) throw new SyncError('自定义 API 配置不完整。', 'CONFIG_INCOMPLETE');
        
        const headers = { 'Authorization': `Bearer ${key}` };
        try {
            const response = await axios.get(appData.settings.customApiUrl, { headers });
            // Assuming the API returns the AppData structure directly
            return response.data as AppData;
        } catch (error) {
            throw this._handleAxiosError(error, '自定义 API', 'read');
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

    public dispose(): void {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
    }
}