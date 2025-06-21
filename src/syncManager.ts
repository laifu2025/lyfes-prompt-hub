import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
// @ts-ignore
import { createClient, WebDAVClient, AuthType } from 'webdav';
import { AppData, GistCreateResponse, GistGetResponse, GitLabSnippetResponse, GiteeGistResponse, SyncResult } from './types';
import { SyncError, SyncConflictError } from './errors';

/**
 * 云同步管理器 - 负责所有云同步相关的功能
 * 
 * 职责：
 * - 管理云同步设置和验证
 * - 各种云服务的同步实现（GitHub、Gitee、GitLab、WebDAV、Custom API）
 * - 同步冲突检测和处理
 * - 云同步状态管理
 */
export class SyncManager {
    private static readonly SYNC_FILENAME = 'prompt-hub.json';
    private syncDebouncer?: NodeJS.Timeout;
    
    private static readonly STORAGE_KEYS = {
        GITHUB_TOKEN: 'promptHub.githubToken',
        GITEE_TOKEN: 'promptHub.giteeToken',
        GITLAB_TOKEN: 'promptHub.gitlabToken',
        WEBDAV_PASSWORD: 'promptHub.webdavPassword',
        CUSTOM_API_KEY: 'promptHub.customApiKey'
    };

    constructor(private context: vscode.ExtensionContext) {}

    // #region Secret Management
    private async getSecret(key: 'githubToken' | 'giteeToken' | 'gitlabToken' | 'webdavPassword' | 'customApiKey'): Promise<string | undefined> {
        const keyMap = {
            githubToken: SyncManager.STORAGE_KEYS.GITHUB_TOKEN,
            giteeToken: SyncManager.STORAGE_KEYS.GITEE_TOKEN,
            gitlabToken: SyncManager.STORAGE_KEYS.GITLAB_TOKEN,
            webdavPassword: SyncManager.STORAGE_KEYS.WEBDAV_PASSWORD,
            customApiKey: SyncManager.STORAGE_KEYS.CUSTOM_API_KEY,
        };
        const secretKey = keyMap[key];
        if (!secretKey) return undefined;
        return this.context.secrets.get(secretKey);
    }

    private async _clearAllSecrets() {
        await this.context.secrets.delete(SyncManager.STORAGE_KEYS.GITHUB_TOKEN);
        await this.context.secrets.delete(SyncManager.STORAGE_KEYS.GITEE_TOKEN);
        await this.context.secrets.delete(SyncManager.STORAGE_KEYS.GITLAB_TOKEN);
        await this.context.secrets.delete(SyncManager.STORAGE_KEYS.WEBDAV_PASSWORD);
        await this.context.secrets.delete(SyncManager.STORAGE_KEYS.CUSTOM_API_KEY);
    }
    // #endregion

    // #region Error Handling
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
    // #endregion

    // #region Cloud Sync Setup
    public async saveCloudSyncSettings(settings: {
        provider: 'github' | 'gitee' | 'gitlab' | 'webdav' | 'custom',
        gistId?: string,
        gitlabUrl?: string,
        webdavUrl?: string,
        webdavUsername?: string,
        customApiUrl?: string,
        token: string
    }): Promise<void> {
        const { provider, gistId, gitlabUrl, webdavUrl, webdavUsername, customApiUrl, token } = settings;

        // Clear all secrets first
        await this._clearAllSecrets();

        try {
            switch (provider) {
                case 'github':
                    await this._validateAndStoreGitHub(token, gistId);
                    break;
                case 'gitee':
                    await this._validateAndStoreGitee(token, gistId);
                    break;
                case 'gitlab':
                    const finalGitlabUrl = gitlabUrl || 'https://gitlab.com';
                    await this._validateAndStoreGitLab(finalGitlabUrl, token, gistId);
                    break;
                case 'webdav':
                    if (!webdavUrl || !webdavUsername) throw new SyncError('WebDAV URL 和用户名不能为空。', 'WEBDAV_CONFIG_MISSING');
                    await this._validateAndStoreWebDAV(webdavUrl, webdavUsername, token);
                    break;
                case 'custom':
                    if (!customApiUrl) throw new SyncError('自定义 API URL 不能为空。', 'CUSTOM_API_URL_MISSING');
                    await this._validateAndStoreCustomApi(customApiUrl, token);
                    break;
                default:
                    throw new SyncError(`未知的云服务提供商: ${provider}`, 'UNKNOWN_PROVIDER');
            }
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
    }

    private async _validateAndStoreGitHub(token: string, gistId?: string): Promise<string> {
        const result = await this._testGitHubGist(token, gistId);
        await this.context.secrets.store(SyncManager.STORAGE_KEYS.GITHUB_TOKEN, token);
        return result.gistId;
    }

    private async _validateAndStoreGitee(token: string, gistId?: string): Promise<string> {
        const validatedGist = await this._testGiteeGist(token, gistId);
        await this.context.secrets.store(SyncManager.STORAGE_KEYS.GITEE_TOKEN, token);
        return validatedGist.gistId;
    }

    private async _validateAndStoreGitLab(url: string, token: string, snippetId?: string): Promise<string> {
        const validatedSnippet = await this._testGitLabSnippet(url, token, snippetId);
        await this.context.secrets.store(SyncManager.STORAGE_KEYS.GITLAB_TOKEN, token);
        return validatedSnippet.snippetId;
    }

    private async _validateAndStoreWebDAV(url: string, user: string, pass: string): Promise<void> {
        await this._testWebDAV(url, user, pass);
        await this.context.secrets.store(SyncManager.STORAGE_KEYS.WEBDAV_PASSWORD, pass);
    }

    private async _validateAndStoreCustomApi(url: string, key: string): Promise<void> {
        await this._testCustomApi(url, key);
        await this.context.secrets.store(SyncManager.STORAGE_KEYS.CUSTOM_API_KEY, key);
    }
    // #endregion

    // #region Provider Testing
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
                    files: { [SyncManager.SYNC_FILENAME]: { content: '{}' } }
                }, { headers });
                const newGistId = response.data.id;
                if (!newGistId) {
                    throw new Error('创建Gist成功，但未能获取Gist ID。');
                }
                return { gistId: newGistId, isNew: true }; 
            } catch (error) {
                throw this._handleAxiosError(error, 'GitHub', 'test');
            }
        }
    }
    
    private async _testGiteeGist(token: string, gistId?: string): Promise<{ gistId: string, isNew: boolean }> {
        const giteeApiUrl = `https://gitee.com/api/v5`;
        const headers = { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' };
        const fileName = SyncManager.SYNC_FILENAME;

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
                file_name: SyncManager.SYNC_FILENAME,
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
    // #endregion

    // #region Cloud Sync Operations
    public async syncToCloud(appData: AppData, force: boolean = false): Promise<void> {
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            return;
        }

        if (!force) {
            const remoteData = await this.getRemoteAppData(appData);
            if (remoteData) {
                const localModified = new Date(appData.metadata.lastModified);
                const remoteModified = new Date(remoteData.metadata.lastModified);

                if (localModified <= remoteModified) {
                    throw new SyncConflictError(
                        'Local data is not newer than cloud data. Upload would overwrite remote changes.',
                        appData.metadata.lastModified,
                        remoteData.metadata.lastModified
                    );
                }
            }
        }

        const content = JSON.stringify(appData, null, 4);

        switch (appData.settings.syncProvider) {
            case 'github':
                await this.syncToGitHub(content, appData);
                break;
            case 'gitee':
                await this.syncToGitee(content, appData);
                break;
            case 'gitlab':
                await this.syncToGitLab(content, appData);
                break;
            case 'webdav':
                await this.syncToWebDAV(content, appData);
                break;
            case 'custom':
                await this.syncToCustomApi(content, appData);
                break;
            default:
                throw new SyncError('Unsupported sync provider.', 'unsupported_provider');
        }
    }

    private async syncToGitHub(content: string, appData: AppData): Promise<void> {
        const token = await this.getSecret('githubToken');
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('GitHub token or Gist ID is not configured.', 'config_missing');
        }

        try {
            await axios.patch(`https://api.github.com/gists/${gistId}`, {
                files: {
                    [SyncManager.SYNC_FILENAME]: {
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

    private async syncToGitee(content: string, appData: AppData): Promise<void> {
        const token = await this.getSecret('giteeToken');
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('Gitee token or Gist ID is not configured.', 'config_missing');
        }
        
        try {
            await axios.patch(`https://gitee.com/api/v5/gists/${gistId}`, {
                files: {
                    [SyncManager.SYNC_FILENAME]: {
                        content: content
                    }
                },
                access_token: token
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'write');
        }
    }

    private async syncToGitLab(content: string, appData: AppData): Promise<void> {
        const token = await this.getSecret('gitlabToken');
        const snippetId = appData.settings.gistId;
        const gitlabUrl = appData.settings.gitlabUrl || 'https://gitlab.com';

        if (!token || !snippetId) {
            throw new SyncError('GitLab token or Snippet ID is not configured.', 'config_missing');
        }

        try {
            await axios.put(`${gitlabUrl}/api/v4/snippets/${snippetId}`, {
                content: content,
                file_name: SyncManager.SYNC_FILENAME
            }, {
                headers: { 'PRIVATE-TOKEN': token }
            });
        } catch (error) {
            throw this._handleAxiosError(error, 'GitLab', 'write');
        }
    }

    private async syncToWebDAV(content: string, appData: AppData): Promise<void> {
        const pass = await this.getSecret('webdavPassword');
        const url = appData.settings.webdavUrl;
        const user = appData.settings.webdavUsername;

        if (!url || !user || !pass) {
            throw new SyncError('WebDAV configuration is incomplete.', 'config_missing');
        }

        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        const filePath = `/${SyncManager.SYNC_FILENAME}`;
        
        try {
            await client.putFileContents(filePath, content, { overwrite: true });
        } catch (error) {
            throw new SyncError(`WebDAV write error: ${error}`, 'webdav_write_error');
        }
    }

    private async syncToCustomApi(content: string, appData: AppData): Promise<void> {
        const apiKey = await this.getSecret('customApiKey');
        const apiUrl = appData.settings.customApiUrl;

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

    public async syncFromCloud(appData: AppData, force: boolean = false): Promise<AppData> {
        const remoteData = await this.getRemoteAppData(appData);

        if (!remoteData) {
            throw new SyncError('Could not retrieve remote data. The cloud may be empty.', 'remote_empty');
        }

        if (!force) {
            const localModified = new Date(appData.metadata.lastModified);
            const remoteModified = new Date(remoteData.metadata.lastModified);

            if (remoteModified <= localModified) {
                throw new SyncConflictError(
                    'Remote data is not newer than local data. Download would overwrite local changes.',
                    appData.metadata.lastModified,
                    remoteData.metadata.lastModified
                );
            }
        }

        return remoteData;
    }

    public async getRemoteAppData(appData: AppData): Promise<AppData | null> {
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            return null;
        }

        switch (appData.settings.syncProvider) {
            case 'github':
                return this.syncFromGitHub(appData);
            case 'gitee':
                return this.syncFromGitee(appData);
            case 'gitlab':
                return this.syncFromGitLab(appData);
            case 'webdav':
                return this.syncFromWebDAV(appData);
            case 'custom':
                return this.syncFromCustomApi(appData);
            default:
                throw new SyncError('Unsupported sync provider.', 'unsupported_provider');
        }
    }

    private async syncFromGitHub(appData: AppData): Promise<AppData | null> {
        const token = await this.getSecret('githubToken');
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('GitHub token or Gist ID is not configured.', 'config_missing');
        }
        
        try {
            const response = await axios.get<GistGetResponse>(`https://api.github.com/gists/${gistId}`, {
                headers: { 'Authorization': `token ${token}` }
            });
            const content = response.data.files[SyncManager.SYNC_FILENAME]?.content;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'GitHub', 'read');
        }
    }

    private async syncFromGitee(appData: AppData): Promise<AppData | null> {
        const token = await this.getSecret('giteeToken');
        const gistId = appData.settings.gistId;

        if (!token || !gistId) {
            throw new SyncError('Gitee token or Gist ID is not configured.', 'config_missing');
        }

        try {
            const response = await axios.get<GistGetResponse>(`https://gitee.com/api/v5/gists/${gistId}`, {
                params: { access_token: token }
            });
            const content = response.data.files[SyncManager.SYNC_FILENAME]?.content;
            return content ? JSON.parse(content) : null;
        } catch (error) {
            throw this._handleAxiosError(error, 'Gitee', 'read');
        }
    }

    private async syncFromGitLab(appData: AppData): Promise<AppData | null> {
        const token = await this.getSecret('gitlabToken');
        const { gistId: snippetId, gitlabUrl = 'https://gitlab.com' } = appData.settings;

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
    
    private async syncFromWebDAV(appData: AppData): Promise<AppData | null> {
        const pass = await this.getSecret('webdavPassword');
        const url = appData.settings.webdavUrl;
        const user = appData.settings.webdavUsername;

        if (!url || !user || !pass) {
            throw new SyncError('WebDAV configuration is incomplete.', 'config_missing');
        }
        
        const client: WebDAVClient = createClient(url, { username: user, password: pass });
        const filePath = `/${SyncManager.SYNC_FILENAME}`;

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
    
    private async syncFromCustomApi(appData: AppData): Promise<AppData | null> {
        const apiKey = await this.getSecret('customApiKey');
        const apiUrl = appData.settings.customApiUrl;

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
    // #endregion

    // #region Sync Reconciliation
    public async reconcileCloudSync(appData: AppData): Promise<SyncResult> {
        if (!appData.settings.cloudSync || !appData.settings.syncProvider) {
            return { status: 'disabled', message: 'Cloud sync is not enabled.' };
        }

        try {
            const remoteData = await this.getRemoteAppData(appData);

            if (!remoteData) {
                // No remote data, so we can safely upload.
                await this.syncToCloud(appData, true); // Force push as it's the first time
                return { status: 'uploaded', message: 'Initial data uploaded to cloud.' };
            }

            const localModified = new Date(appData.metadata.lastModified);
            const remoteModified = new Date(remoteData.metadata.lastModified);

            if (localModified > remoteModified) {
                await this.syncToCloud(appData, false);
                return { status: 'uploaded', message: 'Local changes uploaded.' };
            } else if (remoteModified > localModified) {
                // This would require updating the local data, which needs to be handled by the calling code
                return { status: 'downloaded', message: 'Remote changes available for download.' };
            } else {
                return { status: 'in_sync', message: 'Data is already in sync.' };
            }

        } catch (error) {
            if (error instanceof SyncConflictError) {
                console.warn(`[SyncManager] Sync conflict during reconciliation: ${error.message}`);
                return { status: 'conflict', message: error.message };
            }
            console.error(`[SyncManager] Error during sync reconciliation: ${error}`);
            return { status: 'error', message: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * 启动自动同步debounced任务
     * @param appData 应用数据
     * @param onConflict 冲突处理回调
     */
    public async startAutoSync(
        appData: AppData,
        onConflict: (message: string) => void
    ): Promise<void> {
        if (!appData.settings.cloudSync || !appData.settings.autoSync) {
            return;
        }

        if (this.syncDebouncer) {
            clearTimeout(this.syncDebouncer);
        }

        this.syncDebouncer = setTimeout(() => {
            this.reconcileCloudSync(appData)
                .then(result => {
                    if (result.status === 'conflict') {
                        onConflict('自动同步检测到冲突，请手动同步。');
                    }
                })
                .catch(err => {
                    if (err instanceof SyncConflictError) {
                        console.warn('[SyncManager] Auto-sync conflict detected. Needs manual intervention.');
                        onConflict('自动同步检测到冲突，请手动同步。');
                    } else {
                        console.error('[SyncManager] Auto-sync failed:', err);
                    }
                });
        }, 5000); // 5-second debounce delay
    }

    public async resetCloudSync(): Promise<void> {
        // 清除所有保存的密钥
        await this._clearAllSecrets();
    }

    public dispose(): void {
        if (this.syncDebouncer) {
            clearTimeout(this.syncDebouncer);
        }
    }
    // #endregion
} 