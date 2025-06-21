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
        syncProvider: 'github' | 'gitee' | 'gitlab' | 'webdav' | 'custom' | null;
        workspaceMode: boolean;
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
        const appData = await this.getAppData();
        const selection = await vscode.window.showQuickPick(
            [
                { label: 'GitHub Gist', description: '通过GitHub Gist同步' },
                { label: 'Gitee Gist', description: '通过Gitee Gist同步' },
                { label: 'GitLab Snippets', description: '通过GitLab Snippets同步' },
                { label: 'WebDAV', description: '通过WebDAV服务器同步' },
                { label: 'Custom API', description: '通过自定义API端点同步' },
                { label: 'Disable Cloud Sync', description: '禁用云同步' }
            ],
            { placeHolder: '请选择一个云同步提供商' }
        );

        if (!selection) { return; }

        switch (selection.label) {
            case 'GitHub Gist':
                return this.setupGitHubSync();
            case 'Gitee Gist':
                return this.setupGiteeSync();
            case 'GitLab Snippets':
                return this.setupGitLabSync();
            case 'WebDAV':
                return this.setupWebDAVSync();
            case 'Custom API':
                return this.setupCustomApiSync();
            case 'Disable Cloud Sync':
                return this.disableCloudSync();
        }
    }

    public async saveCloudSyncSettings(settings: any): Promise<AppData> {
        const appData = await this.getAppData();

        // Reset previous provider's secrets if provider changes
        if (appData.settings.syncProvider && appData.settings.syncProvider !== settings.provider) {
            await this.clearProviderSecrets(appData.settings.syncProvider);
        }

        appData.settings.syncProvider = settings.provider;

        switch (settings.provider) {
            case 'github':
                if (!settings.token) { throw new Error('GitHub Token is required.'); }
                await this.context.secrets.store(DataManager.STORAGE_KEYS.GITHUB_TOKEN, settings.token);
                appData.settings.gistId = settings.gistId || undefined;
                break;
            
            case 'gitee':
                if (!settings.token) { throw new Error('Gitee Token is required.'); }
                await this.context.secrets.store(DataManager.STORAGE_KEYS.GITEE_TOKEN, settings.token);
                appData.settings.gistId = settings.gistId || undefined;
                break;

            case 'gitlab':
                if (!settings.token) { throw new Error('GitLab Token is required.'); }
                await this.context.secrets.store(DataManager.STORAGE_KEYS.GITLAB_TOKEN, settings.token);
                appData.settings.gitlabUrl = settings.gitlabUrl || undefined;
                appData.settings.gistId = settings.gistId || undefined;
                break;

            case 'webdav':
                if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
                    throw new Error('WebDAV URL, username, and password are required.');
                }
                // Validate WebDAV credentials
                try {
                    await axios({
                        method: 'OPTIONS',
                        url: settings.webdavUrl,
                        auth: { username: settings.webdavUsername, password: settings.webdavPassword },
                        timeout: 10000,
                    } as any);
                } catch (error: any) {
                    let message = '请检查网络连接或服务器URL。';
                    if (error.response?.status === 401) {
                        message = '凭据无效（用户名或密码错误）。';
                    } else if (error.message) {
                        message = error.message;
                    }
                    throw new Error(`WebDAV 验证失败: ${message}`);
                }
                await this.context.secrets.store(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD, settings.webdavPassword);
                appData.settings.webdavUrl = settings.webdavUrl;
                appData.settings.webdavUsername = settings.webdavUsername;
                break;

            case 'custom':
                if (!settings.customApiUrl || !settings.apiKey) {
                    throw new Error('Custom API URL and API Key are required.');
                }
                await this.context.secrets.store(DataManager.STORAGE_KEYS.CUSTOM_API_KEY, settings.apiKey);
                appData.settings.customApiUrl = settings.customApiUrl;
                break;

            default:
                throw new Error('Invalid sync provider specified.');
        }

        appData.settings.cloudSync = true;
        await this.saveAppData(appData);
        return appData;
    }

    private async clearProviderSecrets(provider: string) {
        switch (provider) {
            case 'github': await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITHUB_TOKEN); break;
            case 'gitee': await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITEE_TOKEN); break;
            case 'gitlab': await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITLAB_TOKEN); break;
            case 'webdav': await this.context.secrets.delete(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD); break;
            case 'custom': await this.context.secrets.delete(DataManager.STORAGE_KEYS.CUSTOM_API_KEY); break;
        }
    }

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

                const scopes = response.headers['x-oauth-scopes'] as string;
                if (!scopes || !scopes.split(', ').includes('gist')) {
                    throw new Error('Token无效或缺少 "gist" 权限。');
                }
            });
        } catch (error: any) {
            let message = '请检查网络连接或Token。';
            if (error.response) {
                if (error.response.status >= 500) {
                    message = `GitHub 服务器返回了错误 (状态码: ${error.response.status})。这可能是临时性问题，请稍后再试。您也可以检查 GitHub Status 页面。`;
                } else if (error.response.data?.message) {
                    message = error.response.data.message;
                }
            } else if (error.message) {
                message = error.message;
            }
            vscode.window.showErrorMessage(`GitHub Token 验证失败: ${message}`);
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

                // We won't check scopes for Gitee anymore, as the API doesn't seem to return them reliably.
                // We will trust the user to have set the correct permissions.
                await axios.get('https://gitee.com/api/v5/user', {
                    params: { access_token: token },
                    signal: controller.signal
                } as any);

            });
        } catch (error: any) {
            let message = '请检查网络连接或Token。';
            if (error.response) {
                if (error.response.status >= 500) {
                    message = `Gitee 服务器返回了错误 (状态码: ${error.response.status})。这可能是临时性问题，请稍后再试。`;
                } else if (error.response.data?.message) {
                    message = `[${error.response.status}] ${error.response.data.message}`;
                }
            } else if (error.message) {
                message = error.message;
            }
            vscode.window.showErrorMessage(`Gitee Token 验证失败: ${message}`);
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
            let message = '请检查网络连接、实例URL或Token。';
            if (error.response) {
                 if (error.response.status >= 500) {
                    message = `GitLab 服务器返回了错误 (状态码: ${error.response.status})。这可能是临时性问题，请稍后再试。`;
                } else if (error.response.data?.message) {
                    message = `[${error.response.status}] ${error.response.data.message}`;
                }
            } else if (error.message) {
                message = error.message;
            }
            vscode.window.showErrorMessage(`GitLab Token 验证失败: ${message}`);
            return;
        }

        const snippetId = await vscode.window.showInputBox({ prompt: '（可选）输入现有Snippet ID进行关联' });
        await this.context.secrets.store(DataManager.STORAGE_KEYS.GITLAB_TOKEN, token);

        const appData = await this.getAppData();
        appData.settings.cloudSync = true;
        appData.settings.syncProvider = 'gitlab';
        appData.settings.gistId = snippetId || undefined; // Re-use gistId for snippetId
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
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证 WebDAV 凭据...',
                cancellable: true
            }, async (_, cancellationToken) => {
                const controller = new AbortController();
                cancellationToken.onCancellationRequested(() => controller.abort());

                // Use OPTIONS request as a lightweight way to check credentials and connectivity
                await axios({
                    method: 'OPTIONS',
                    url: webdavUrl,
                    auth: { username: webdavUsername, password: webdavPassword },
                    timeout: 10000, // 10s timeout
                    signal: controller.signal
                } as any);
            });
        } catch (error: any) {
            let message = '请检查网络连接或服务器URL。';
            if (error.response?.status === 401) {
                message = '凭据无效（用户名或密码错误）。';
            } else if (error.message) {
                message = error.message;
            }
            vscode.window.showErrorMessage(`WebDAV 验证失败: ${message}`);
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
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在验证自定义 API...',
                cancellable: true
            }, async (_, cancellationToken) => {
                const controller = new AbortController();
                cancellationToken.onCancellationRequested(() => controller.abort());

                await axios.get(apiUrl, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    timeout: 10000,
                    signal: controller.signal
                } as any);
            });
        } catch (error: any) {
            let message = '请检查网络连接或API URL。';
            if (error.response?.status === 401 || error.response?.status === 403) {
                message = 'API密钥无效或无权限访问。';
            } else if (error.message) {
                message = error.message;
            }
            vscode.window.showErrorMessage(`自定义 API 验证失败: ${message}`);
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
            appData.settings.cloudSync = false;
            appData.settings.syncProvider = null;
        appData.settings.gistId = undefined;
        appData.settings.gitlabUrl = undefined;
        appData.settings.webdavUrl = undefined;
        appData.settings.webdavUsername = undefined;
        appData.settings.customApiUrl = undefined;

        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITEE_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
        await this.context.secrets.delete(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);

            await this.saveAppData(appData);
            vscode.window.showInformationMessage('云同步已禁用。');
            return appData;
    }

    public async syncToCloud(): Promise<void> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            vscode.window.showErrorMessage('云同步未配置，请先设置。');
            return;
        }

        const dataToSync = JSON.stringify(appData, null, 2);
        const fileName = DataManager.SYNC_FILENAME;
        let gistId = appData.settings.gistId;

        try {
            switch (appData.settings.syncProvider) {
                case 'github':
                    {
                const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
                        if (!token) throw new Error('未找到GitHub Token');
                const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
                        const data = { files: { [fileName]: { content: dataToSync } }, public: false };

                        if (gistId) {
                            await axios.patch(`https://api.github.com/gists/${gistId}`, data, { headers });
                        } else {
                            const response = await axios.post<GistCreateResponse>('https://api.github.com/gists', data, { headers });
                            gistId = response.data.id;
                            appData.settings.gistId = gistId;
                            await this.saveAppData(appData);
                        }
                    }
                    break;
                case 'gitee':
                    {
                        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITEE_TOKEN);
                        if (!token) throw new Error('未找到Gitee Token');
                        
                        // Gitee API requires access_token to be a query parameter.
                        const params = { access_token: token };
                        const data = { files: { [fileName]: { content: dataToSync } }, public: false, description: "Prompt Hub Data" };

                        if (gistId) {
                            // Based on repeated failures, we are now attempting the most minimal possible payload for an update.
                            // Some strict APIs only accept the fields that are actually being changed.
                            const patchData = {
                                files: {
                                    [fileName]: {
                                        content: dataToSync
                                    }
                                }
                            };
                            await axios.patch(`https://gitee.com/api/v5/gists/${gistId}`, patchData, { params });
                        } else {
                            const response = await axios.post<GiteeGistResponse>('https://gitee.com/api/v5/gists', data, { params });
                            gistId = response.data.id;
                            appData.settings.gistId = gistId;
                            await this.saveAppData(appData);
                        }
                    }
                    break;
                case 'gitlab':
                    {
                        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
                        if (!token) throw new Error('未找到GitLab Token');
                        const baseUrl = appData.settings.gitlabUrl || 'https://gitlab.com';
                        const headers = { 'PRIVATE-TOKEN': token };
                        const data = { title: fileName, file_name: fileName, content: dataToSync, visibility: 'private' };
                        
                        if (gistId) { // snippet id
                            await axios.put(`${baseUrl}/api/v4/snippets/${gistId}`, { content: dataToSync }, { headers });
                } else {
                            const response = await axios.post<GitLabSnippetResponse>(`${baseUrl}/api/v4/snippets`, data, { headers });
                    gistId = response.data.id;
                    appData.settings.gistId = gistId;
                    await this.saveAppData(appData);
                }
                    }
                    break;
                case 'webdav':
                    {
                        const { webdavUrl, webdavUsername } = appData.settings;
                        const password = await this.context.secrets.get(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
                        if (!webdavUrl || !webdavUsername || !password) throw new Error('WebDAV配置不完整');

                        const fullUrl = path.join(webdavUrl, fileName).replace(/\\/g, '/');
                        await axios.put(fullUrl, dataToSync, {
                            auth: { username: webdavUsername, password }
                        });
                    }
                    break;
                case 'custom':
                    {
                        const apiUrl = appData.settings.customApiUrl;
                        const apiKey = await this.context.secrets.get(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);
                        if (!apiUrl || !apiKey) throw new Error('自定义API配置不完整');
                        
                        await axios.post(apiUrl, { data: dataToSync }, { headers: { 'Authorization': `Bearer ${apiKey}` }});
                    }
                    break;
            }
            vscode.window.showInformationMessage(`数据已成功同步到 ${appData.settings.syncProvider}。`);
        } catch (error: any) {
                console.error('Sync to cloud failed:', error);
            vscode.window.showErrorMessage(`云同步失败: ${error.message}`);
            }
    }

    public async syncFromCloud(): Promise<AppData | null> {
        const appData = await this.getAppData();
        if (!appData.settings.cloudSync || !appData.settings.syncProvider || !appData.settings.gistId) {
            vscode.window.showErrorMessage('云同步未配置或未关联远程数据。');
            return null;
        }
        
        let gistId = appData.settings.gistId;

        try {
            let remoteDataContent: string | undefined;

            switch (appData.settings.syncProvider) {
                case 'github':
                    {
                const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITHUB_TOKEN);
                        if (!token) throw new Error('未找到GitHub Token');
                const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
                        const response = await axios.get<GistGetResponse>(`https://api.github.com/gists/${gistId}`, { headers });
                        remoteDataContent = response.data.files[DataManager.SYNC_FILENAME]?.content;
                    }
                    break;
                case 'gitee':
                    {
                        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITEE_TOKEN);
                        if (!token) throw new Error('未找到Gitee Token');
                        const response = await axios.get<any>(`https://gitee.com/api/v5/gists/${gistId}?access_token=${token}`);
                        // Gitee's get-single-gist response structure is different from GitHub's
                        remoteDataContent = response.data.files[DataManager.SYNC_FILENAME]?.content;
                    }
                    break;
                case 'gitlab':
                    {
                        const token = await this.context.secrets.get(DataManager.STORAGE_KEYS.GITLAB_TOKEN);
                        if (!token) throw new Error('未找到GitLab Token');
                        const baseUrl = appData.settings.gitlabUrl || 'https://gitlab.com';
                        const headers = { 'PRIVATE-TOKEN': token };
                        const response = await axios.get(
                            `${baseUrl}/api/v4/snippets/${gistId}/raw`,
                            {
                                headers,
                                responseType: 'text'
                            }
                        );
                        remoteDataContent = response.data as string;
                    }
                    break;
                case 'webdav':
                     {
                        const { webdavUrl, webdavUsername } = appData.settings;
                        const password = await this.context.secrets.get(DataManager.STORAGE_KEYS.WEBDAV_PASSWORD);
                        if (!webdavUrl || !webdavUsername || !password) throw new Error('WebDAV配置不完整');

                        const fullUrl = path.join(webdavUrl, DataManager.SYNC_FILENAME).replace(/\\/g, '/');
                        const response = await axios.get(fullUrl, {
                            auth: { username: webdavUsername, password },
                            responseType: 'text'
                        });
                        remoteDataContent = response.data as string;
                    }
                    break;
                case 'custom':
                    {
                        const apiUrl = appData.settings.customApiUrl;
                        const apiKey = await this.context.secrets.get(DataManager.STORAGE_KEYS.CUSTOM_API_KEY);
                        if (!apiUrl || !apiKey) throw new Error('自定义API配置不完整');

                        const response = await axios.get<{data: string}>(apiUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                        remoteDataContent = response.data.data; // Assuming API returns { data: '...' }
                    }
                    break;
            }

            if (!remoteDataContent) {
                vscode.window.showErrorMessage('从云端获取数据失败或数据为空。');
                return null;
            }

            const remoteData: AppData = JSON.parse(remoteDataContent);
            
            const choice = await vscode.window.showWarningMessage(
                `从云端同步会覆盖本地数据。云端数据最后修改于 ${new Date(remoteData.metadata.lastModified).toLocaleString()}。确定要同步吗？`,
                { modal: true }, '确定同步'
            );

            if (choice === '确定同步') {
                await this.saveAppData(remoteData);
                vscode.window.showInformationMessage('数据已成功从云端同步。');
                return remoteData;
            }
            return null;

        } catch (error: any) {
            console.error('Sync from cloud failed:', error);
            vscode.window.showErrorMessage(`从云端同步失败: ${error.message}`);
            return null;
        }
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