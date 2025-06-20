"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudSyncManager = void 0;
const vscode = require("vscode");
const https = require("https");
class CloudSyncManager {
    constructor(context, storageManager) {
        this.context = context;
        this.storageManager = storageManager;
    }
    /**
     * 获取云同步配置
     */
    getCloudConfig() {
        return this.context.globalState.get('promptHubCloudConfig') || null;
    }
    /**
     * 保存云同步配置
     */
    async saveCloudConfig(config) {
        await this.context.globalState.update('promptHubCloudConfig', config);
        // 重启自动同步
        if (config.autoSync) {
            this.startAutoSync();
        }
        else {
            this.stopAutoSync();
        }
    }
    /**
     * 配置GitHub同步
     */
    async configureGitHubSync() {
        try {
            // 获取GitHub Token
            const token = await vscode.window.showInputBox({
                prompt: '请输入GitHub Personal Access Token',
                password: true,
                placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx'
            });
            if (!token) {
                return false;
            }
            // 获取仓库信息
            const repo = await vscode.window.showInputBox({
                prompt: '请输入仓库名称 (格式: owner/repo)',
                placeHolder: 'username/prompt-hub-data'
            });
            if (!repo) {
                return false;
            }
            // 获取文件路径
            const filePath = await vscode.window.showInputBox({
                prompt: '请输入存储文件路径',
                value: 'prompt-hub-data.json',
                placeHolder: 'prompt-hub-data.json'
            });
            if (!filePath) {
                return false;
            }
            // 验证配置
            const config = {
                provider: 'github',
                apiToken: token,
                repositoryUrl: `https://api.github.com/repos/${repo}`,
                filePath: filePath,
                autoSync: true,
                syncInterval: 60 // 默认1小时
            };
            // 测试连接
            const testResult = await this.testConnection(config);
            if (!testResult.success) {
                vscode.window.showErrorMessage(`GitHub连接测试失败: ${testResult.message}`);
                return false;
            }
            await this.saveCloudConfig(config);
            vscode.window.showInformationMessage('GitHub同步配置成功');
            return true;
        }
        catch (error) {
            console.error('配置GitHub同步失败:', error);
            vscode.window.showErrorMessage(`配置GitHub同步失败: ${error}`);
            return false;
        }
    }
    /**
     * 配置Gitee同步
     */
    async configureGiteeSync() {
        try {
            const token = await vscode.window.showInputBox({
                prompt: '请输入Gitee Access Token',
                password: true
            });
            if (!token) {
                return false;
            }
            const repo = await vscode.window.showInputBox({
                prompt: '请输入仓库名称 (格式: owner/repo)',
                placeHolder: 'username/prompt-hub-data'
            });
            if (!repo) {
                return false;
            }
            const filePath = await vscode.window.showInputBox({
                prompt: '请输入存储文件路径',
                value: 'prompt-hub-data.json',
                placeHolder: 'prompt-hub-data.json'
            });
            if (!filePath) {
                return false;
            }
            const config = {
                provider: 'gitee',
                apiToken: token,
                repositoryUrl: `https://gitee.com/api/v5/repos/${repo}`,
                filePath: filePath,
                autoSync: true,
                syncInterval: 60
            };
            const testResult = await this.testConnection(config);
            if (!testResult.success) {
                vscode.window.showErrorMessage(`Gitee连接测试失败: ${testResult.message}`);
                return false;
            }
            await this.saveCloudConfig(config);
            vscode.window.showInformationMessage('Gitee同步配置成功');
            return true;
        }
        catch (error) {
            console.error('配置Gitee同步失败:', error);
            vscode.window.showErrorMessage(`配置Gitee同步失败: ${error}`);
            return false;
        }
    }
    /**
     * 测试云端连接
     */
    async testConnection(config) {
        const cloudConfig = config || this.getCloudConfig();
        if (!cloudConfig) {
            return {
                success: false,
                message: '未配置云同步',
                timestamp: new Date().toISOString()
            };
        }
        try {
            const response = await this.makeApiRequest(cloudConfig, 'GET', '');
            if (response.status === 200 || response.status === 404) {
                return {
                    success: true,
                    message: '连接成功',
                    timestamp: new Date().toISOString()
                };
            }
            else {
                return {
                    success: false,
                    message: `连接失败: HTTP ${response.status}`,
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `连接失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 上传数据到云端
     */
    async uploadToCloud() {
        const config = this.getCloudConfig();
        if (!config) {
            return {
                success: false,
                message: '未配置云同步',
                timestamp: new Date().toISOString()
            };
        }
        try {
            const data = await this.storageManager.getData();
            const dataContent = JSON.stringify(data, null, 2);
            // 添加同步元信息
            const syncData = {
                ...data,
                syncMeta: {
                    uploadTime: new Date().toISOString(),
                    source: 'cursor-extension',
                    version: data.version
                }
            };
            // 检查远程文件是否存在
            const remoteData = await this.downloadFromCloud();
            let shouldUpdate = true;
            if (remoteData.success && remoteData.data) {
                // 处理冲突
                const conflictResult = await this.handleConflict(syncData, remoteData.data);
                if (!conflictResult.success) {
                    return conflictResult;
                }
                syncData.syncMeta = conflictResult.mergedData?.syncMeta || syncData.syncMeta;
            }
            // 上传数据
            const uploadResult = await this.uploadFile(config, JSON.stringify(syncData, null, 2));
            if (uploadResult.success) {
                // 更新本地同步状态
                await this.updateLastSyncTime();
                return {
                    success: true,
                    message: '数据已成功上传到云端',
                    timestamp: new Date().toISOString()
                };
            }
            else {
                return uploadResult;
            }
        }
        catch (error) {
            console.error('上传到云端失败:', error);
            return {
                success: false,
                message: `上传失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 从云端下载数据
     */
    async downloadFromCloud() {
        const config = this.getCloudConfig();
        if (!config) {
            return {
                success: false,
                message: '未配置云同步',
                timestamp: new Date().toISOString()
            };
        }
        try {
            const response = await this.downloadFile(config);
            if (response.success && response.data) {
                const cloudData = JSON.parse(response.data);
                // 验证数据格式
                if (!this.validateCloudData(cloudData)) {
                    return {
                        success: false,
                        message: '云端数据格式无效',
                        timestamp: new Date().toISOString()
                    };
                }
                return {
                    success: true,
                    message: '数据已从云端下载',
                    timestamp: new Date().toISOString(),
                    data: cloudData
                };
            }
            else {
                return {
                    success: false,
                    message: response.message || '下载失败',
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            console.error('从云端下载失败:', error);
            return {
                success: false,
                message: `下载失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 双向同步
     */
    async syncWithCloud() {
        try {
            const downloadResult = await this.downloadFromCloud();
            if (!downloadResult.success) {
                // 如果下载失败（可能是首次使用），尝试上传本地数据
                return await this.uploadToCloud();
            }
            const localData = await this.storageManager.getData();
            const cloudData = downloadResult.data;
            // 比较时间戳决定同步方向
            const localTime = new Date(localData.lastBackupTime).getTime();
            const cloudTime = new Date(cloudData.lastBackupTime).getTime();
            if (localTime > cloudTime) {
                // 本地数据更新，上传到云端
                return await this.uploadToCloud();
            }
            else if (cloudTime > localTime) {
                // 云端数据更新，下载到本地
                const choice = await vscode.window.showWarningMessage('云端有更新的数据，是否要覆盖本地数据？', { modal: true }, '下载云端数据', '保持本地数据', '手动合并');
                switch (choice) {
                    case '下载云端数据':
                        await this.storageManager.saveData(cloudData);
                        return {
                            success: true,
                            message: '已从云端同步最新数据',
                            timestamp: new Date().toISOString()
                        };
                    case '手动合并':
                        const mergeResult = await this.handleConflict(localData, cloudData);
                        if (mergeResult.success && mergeResult.mergedData) {
                            await this.storageManager.saveData(mergeResult.mergedData);
                            return {
                                success: true,
                                message: '数据已手动合并',
                                timestamp: new Date().toISOString(),
                                conflictResolved: true
                            };
                        }
                        return mergeResult;
                    default:
                        return {
                            success: false,
                            message: '用户取消同步',
                            timestamp: new Date().toISOString()
                        };
                }
            }
            else {
                // 数据一致
                return {
                    success: true,
                    message: '数据已是最新版本',
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            console.error('云同步失败:', error);
            return {
                success: false,
                message: `同步失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 处理数据冲突
     */
    async handleConflict(localData, cloudData) {
        try {
            // 简单的合并策略：合并用户、提示词和分类
            const mergedData = {
                ...localData,
                users: this.mergeUsers(localData.users, cloudData.users),
                prompts: this.mergePrompts(localData.prompts, cloudData.prompts),
                categories: this.mergeCategories(localData.categories, cloudData.categories),
                lastBackupTime: new Date().toISOString(),
                version: localData.version
            };
            return {
                success: true,
                message: '数据冲突已自动合并',
                timestamp: new Date().toISOString(),
                mergedData: mergedData
            };
        }
        catch (error) {
            console.error('处理数据冲突失败:', error);
            return {
                success: false,
                message: `合并失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 合并用户数据
     */
    mergeUsers(localUsers, cloudUsers) {
        const merged = [...localUsers];
        cloudUsers.forEach(cloudUser => {
            const existingIndex = merged.findIndex(u => u.id === cloudUser.id);
            if (existingIndex >= 0) {
                // 更新现有用户（保留最新的）
                merged[existingIndex] = cloudUser;
            }
            else {
                // 添加新用户
                merged.push(cloudUser);
            }
        });
        return merged;
    }
    /**
     * 合并提示词数据
     */
    mergePrompts(localPrompts, cloudPrompts) {
        const merged = [...localPrompts];
        cloudPrompts.forEach(cloudPrompt => {
            const existingIndex = merged.findIndex(p => p.id === cloudPrompt.id);
            if (existingIndex >= 0) {
                // 比较更新时间，保留最新的
                const localTime = new Date(merged[existingIndex].updatedAt).getTime();
                const cloudTime = new Date(cloudPrompt.updatedAt).getTime();
                if (cloudTime > localTime) {
                    merged[existingIndex] = cloudPrompt;
                }
            }
            else {
                // 添加新提示词
                merged.push(cloudPrompt);
            }
        });
        return merged;
    }
    /**
     * 合并分类数据
     */
    mergeCategories(localCategories, cloudCategories) {
        const merged = new Set([...localCategories, ...cloudCategories]);
        return Array.from(merged);
    }
    /**
     * 验证云端数据格式
     */
    validateCloudData(data) {
        return (data &&
            Array.isArray(data.users) &&
            Array.isArray(data.prompts) &&
            Array.isArray(data.categories) &&
            typeof data.version === 'string');
    }
    /**
     * 启动自动同步
     */
    startAutoSync() {
        this.stopAutoSync(); // 先停止现有的定时器
        const config = this.getCloudConfig();
        if (!config || !config.autoSync) {
            return;
        }
        const interval = config.syncInterval * 60 * 1000; // 转换为毫秒
        this.syncTimer = setInterval(async () => {
            try {
                const result = await this.syncWithCloud();
                if (result.success) {
                    console.log('自动云同步完成');
                }
                else {
                    console.error('自动云同步失败:', result.message);
                }
            }
            catch (error) {
                console.error('自动云同步出错:', error);
            }
        }, interval);
        console.log(`已启动自动云同步，间隔: ${config.syncInterval}分钟`);
    }
    /**
     * 停止自动同步
     */
    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
            console.log('已停止自动云同步');
        }
    }
    /**
     * 更新最后同步时间
     */
    async updateLastSyncTime() {
        await this.context.globalState.update('promptHubLastSyncTime', new Date().toISOString());
    }
    /**
     * 获取最后同步时间
     */
    getLastSyncTime() {
        return this.context.globalState.get('promptHubLastSyncTime') || null;
    }
    /**
     * 发起API请求
     */
    async makeApiRequest(config, method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(config.repositoryUrl + path);
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Authorization': config.provider === 'github' ? `token ${config.apiToken}` : `token ${config.apiToken}`,
                    'User-Agent': 'Cursor-PromptHub-Extension',
                    'Content-Type': 'application/json'
                }
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve({
                        status: res.statusCode || 0,
                        data: data
                    });
                });
            });
            req.on('error', (error) => {
                reject(error);
            });
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    /**
     * 上传文件到云端
     */
    async uploadFile(config, content) {
        try {
            // GitHub和Gitee的API略有不同，这里简化处理
            const endpoint = `/contents/${config.filePath}`;
            // 先获取文件的SHA（如果存在）
            let sha;
            try {
                const getResponse = await this.makeApiRequest(config, 'GET', endpoint);
                if (getResponse.status === 200) {
                    const fileInfo = JSON.parse(getResponse.data);
                    sha = fileInfo.sha;
                }
            }
            catch (error) {
                // 文件不存在，忽略错误
            }
            // 准备上传数据
            const uploadData = {
                message: `Update prompt hub data - ${new Date().toISOString()}`,
                content: Buffer.from(content).toString('base64'),
                ...(sha && { sha })
            };
            const response = await this.makeApiRequest(config, 'PUT', endpoint, JSON.stringify(uploadData));
            if (response.status === 200 || response.status === 201) {
                return {
                    success: true,
                    message: '文件上传成功',
                    timestamp: new Date().toISOString()
                };
            }
            else {
                return {
                    success: false,
                    message: `上传失败: HTTP ${response.status}`,
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `上传失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 从云端下载文件
     */
    async downloadFile(config) {
        try {
            const endpoint = `/contents/${config.filePath}`;
            const response = await this.makeApiRequest(config, 'GET', endpoint);
            if (response.status === 200) {
                const fileInfo = JSON.parse(response.data);
                const content = Buffer.from(fileInfo.content, 'base64').toString('utf8');
                return {
                    success: true,
                    message: '文件下载成功',
                    timestamp: new Date().toISOString(),
                    data: content
                };
            }
            else if (response.status === 404) {
                return {
                    success: false,
                    message: '云端文件不存在',
                    timestamp: new Date().toISOString()
                };
            }
            else {
                return {
                    success: false,
                    message: `下载失败: HTTP ${response.status}`,
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `下载失败: ${error}`,
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * 移除云同步配置
     */
    async removeCloudConfig() {
        this.stopAutoSync();
        await this.context.globalState.update('promptHubCloudConfig', undefined);
        await this.context.globalState.update('promptHubLastSyncTime', undefined);
        vscode.window.showInformationMessage('云同步配置已清除');
    }
    /**
     * 获取同步状态信息
     */
    getSyncStatus() {
        const config = this.getCloudConfig();
        const lastSyncTime = this.getLastSyncTime();
        return {
            isConfigured: !!config,
            provider: config?.provider,
            lastSyncTime: lastSyncTime || undefined,
            autoSyncEnabled: config?.autoSync || false
        };
    }
}
exports.CloudSyncManager = CloudSyncManager;
//# sourceMappingURL=cloudSyncManager.js.map