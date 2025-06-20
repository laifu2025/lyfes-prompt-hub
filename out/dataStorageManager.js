"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataStorageManager = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
class DataStorageManager {
    constructor(context) {
        this.defaultSettings = {
            theme: 'auto',
            autoBackup: true,
            cloudSync: false,
            backupInterval: 30,
            maxBackups: 10
        };
        this.defaultData = {
            users: [],
            prompts: [],
            categories: ['工作', '学习', '创意', '代码'],
            currentUser: null,
            settings: this.defaultSettings,
            lastBackupTime: new Date().toISOString(),
            version: '1.0.0'
        };
        this.context = context;
        this.initializeStorage();
    }
    /**
     * 初始化存储系统
     */
    async initializeStorage() {
        try {
            // 检查是否有现有数据
            const existingData = await this.getData();
            if (!existingData.users || !existingData.prompts) {
                // 尝试从localStorage迁移数据
                await this.migrateFromLocalStorage();
            }
            // 启动自动备份
            if (existingData.settings?.autoBackup) {
                this.startAutoBackup();
            }
            console.log('数据存储管理器初始化完成');
        }
        catch (error) {
            console.error('初始化存储系统失败:', error);
            vscode.window.showErrorMessage('初始化数据存储失败，请重启扩展');
        }
    }
    /**
     * 获取完整数据
     */
    async getData() {
        const data = this.context.globalState.get('promptHubData');
        return data || this.defaultData;
    }
    /**
     * 保存完整数据
     */
    async saveData(data) {
        data.lastBackupTime = new Date().toISOString();
        await this.context.globalState.update('promptHubData', data);
        // 触发自动备份
        if (data.settings.autoBackup) {
            await this.createBackup();
        }
    }
    /**
     * 获取用户数据
     */
    async getUsers() {
        const data = await this.getData();
        return data.users || [];
    }
    /**
     * 保存用户数据
     */
    async saveUser(user) {
        const data = await this.getData();
        const existingIndex = data.users.findIndex(u => u.id === user.id);
        if (existingIndex >= 0) {
            data.users[existingIndex] = user;
        }
        else {
            data.users.push(user);
        }
        await this.saveData(data);
    }
    /**
     * 获取当前用户
     */
    async getCurrentUser() {
        const data = await this.getData();
        return data.currentUser;
    }
    /**
     * 设置当前用户
     */
    async setCurrentUser(user) {
        const data = await this.getData();
        data.currentUser = user;
        await this.saveData(data);
    }
    /**
     * 获取提示词数据
     */
    async getPrompts() {
        const data = await this.getData();
        return data.prompts || [];
    }
    /**
     * 保存提示词数据
     */
    async savePrompt(prompt) {
        const data = await this.getData();
        const existingIndex = data.prompts.findIndex(p => p.id === prompt.id);
        if (existingIndex >= 0) {
            data.prompts[existingIndex] = prompt;
        }
        else {
            data.prompts.push(prompt);
        }
        await this.saveData(data);
    }
    /**
     * 删除提示词
     */
    async deletePrompt(promptId) {
        const data = await this.getData();
        data.prompts = data.prompts.filter(p => p.id !== promptId);
        await this.saveData(data);
    }
    /**
     * 获取分类列表
     */
    async getCategories() {
        const data = await this.getData();
        return data.categories || this.defaultData.categories;
    }
    /**
     * 保存分类列表
     */
    async saveCategories(categories) {
        const data = await this.getData();
        data.categories = categories;
        await this.saveData(data);
    }
    /**
     * 获取设置
     */
    async getSettings() {
        const data = await this.getData();
        return data.settings || this.defaultSettings;
    }
    /**
     * 保存设置
     */
    async saveSettings(settings) {
        const data = await this.getData();
        data.settings = { ...this.defaultSettings, ...settings };
        await this.saveData(data);
    }
    /**
     * 从localStorage迁移数据
     */
    async migrateFromLocalStorage() {
        try {
            // 这里我们需要通过webview来获取localStorage数据
            // 暂时跳过，等webview通信建立后实现
            console.log('localStorage迁移功能待实现');
        }
        catch (error) {
            console.error('迁移localStorage数据失败:', error);
        }
    }
    /**
     * 创建备份
     */
    async createBackup() {
        try {
            const data = await this.getData();
            const backupDir = path.join(os.homedir(), '.cursor', 'prompt-hub-backups');
            // 确保备份目录存在
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
            // 创建备份文件
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
            // 清理旧备份
            await this.cleanupOldBackups(backupDir);
            console.log(`备份已创建: ${backupFile}`);
            return backupFile;
        }
        catch (error) {
            console.error('创建备份失败:', error);
            throw error;
        }
    }
    /**
     * 从备份恢复数据
     */
    async restoreFromBackup(backupPath) {
        try {
            let filePath = backupPath;
            if (!filePath) {
                // 选择备份文件
                const options = {
                    canSelectMany: false,
                    openLabel: '选择备份文件',
                    filters: {
                        'JSON 文件': ['json']
                    }
                };
                const fileUri = await vscode.window.showOpenDialog(options);
                if (!fileUri || fileUri.length === 0) {
                    return;
                }
                filePath = fileUri[0].fsPath;
            }
            if (!filePath || !fs.existsSync(filePath)) {
                throw new Error('备份文件不存在');
            }
            // 读取备份数据
            const backupContent = fs.readFileSync(filePath, 'utf8');
            const backupData = JSON.parse(backupContent);
            // 验证备份数据格式
            if (!this.validateBackupData(backupData)) {
                throw new Error('备份文件格式无效');
            }
            // 确认恢复操作
            const choice = await vscode.window.showWarningMessage('恢复备份将覆盖当前所有数据，确定要继续吗？', { modal: true }, '确定', '取消');
            if (choice === '确定') {
                await this.saveData(backupData);
                vscode.window.showInformationMessage('数据已成功从备份恢复');
            }
        }
        catch (error) {
            console.error('恢复备份失败:', error);
            vscode.window.showErrorMessage(`恢复备份失败: ${error}`);
        }
    }
    /**
     * 获取可用备份列表
     */
    getAvailableBackups() {
        try {
            const backupDir = path.join(os.homedir(), '.cursor', 'prompt-hub-backups');
            if (!fs.existsSync(backupDir)) {
                return [];
            }
            return fs.readdirSync(backupDir)
                .filter(file => file.endsWith('.json'))
                .map(file => path.join(backupDir, file))
                .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
        }
        catch (error) {
            console.error('获取备份列表失败:', error);
            return [];
        }
    }
    /**
     * 导出数据
     */
    async exportData() {
        try {
            const data = await this.getData();
            const options = {
                defaultUri: vscode.Uri.file(`prompt-hub-export-${new Date().toISOString().slice(0, 10)}.json`),
                filters: {
                    'JSON 文件': ['json']
                }
            };
            const fileUri = await vscode.window.showSaveDialog(options);
            if (!fileUri) {
                return;
            }
            fs.writeFileSync(fileUri.fsPath, JSON.stringify(data, null, 2), 'utf8');
            vscode.window.showInformationMessage(`数据已导出到: ${fileUri.fsPath}`);
        }
        catch (error) {
            console.error('导出数据失败:', error);
            vscode.window.showErrorMessage(`导出数据失败: ${error}`);
        }
    }
    /**
     * 导入数据
     */
    async importData() {
        try {
            const options = {
                canSelectMany: false,
                openLabel: '选择要导入的数据文件',
                filters: {
                    'JSON 文件': ['json']
                }
            };
            const fileUri = await vscode.window.showOpenDialog(options);
            if (!fileUri || fileUri.length === 0) {
                return;
            }
            const filePath = fileUri[0].fsPath;
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const importData = JSON.parse(fileContent);
            if (!this.validateBackupData(importData)) {
                throw new Error('导入文件格式无效');
            }
            const choice = await vscode.window.showWarningMessage('导入数据将覆盖当前所有数据，确定要继续吗？', { modal: true }, '确定', '取消');
            if (choice === '确定') {
                await this.saveData(importData);
                vscode.window.showInformationMessage('数据导入成功');
            }
        }
        catch (error) {
            console.error('导入数据失败:', error);
            vscode.window.showErrorMessage(`导入数据失败: ${error}`);
        }
    }
    /**
     * 启动自动备份
     */
    startAutoBackup() {
        const settings = this.context.globalState.get('promptHubSettings') || this.defaultSettings;
        const interval = settings.backupInterval * 60 * 1000; // 转换为毫秒
        setInterval(async () => {
            try {
                await this.createBackup();
                console.log('自动备份完成');
            }
            catch (error) {
                console.error('自动备份失败:', error);
            }
        }, interval);
    }
    /**
     * 清理旧备份
     */
    async cleanupOldBackups(backupDir) {
        try {
            const settings = await this.getSettings();
            const files = fs.readdirSync(backupDir)
                .filter(file => file.endsWith('.json'))
                .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                mtime: fs.statSync(path.join(backupDir, file)).mtime
            }))
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
            // 删除超过最大备份数量的文件
            if (files.length > settings.maxBackups) {
                const filesToDelete = files.slice(settings.maxBackups);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`已删除旧备份: ${file.name}`);
                });
            }
        }
        catch (error) {
            console.error('清理旧备份失败:', error);
        }
    }
    /**
     * 验证备份数据格式
     */
    validateBackupData(data) {
        return (data &&
            Array.isArray(data.users) &&
            Array.isArray(data.prompts) &&
            Array.isArray(data.categories) &&
            typeof data.settings === 'object' &&
            typeof data.version === 'string');
    }
    /**
     * 清理所有数据（用于测试或重置）
     */
    async clearAllData() {
        const choice = await vscode.window.showWarningMessage('这将删除所有数据，包括用户、提示词和设置。此操作不可恢复！', { modal: true }, '确定删除', '取消');
        if (choice === '确定删除') {
            await this.context.globalState.update('promptHubData', undefined);
            await this.saveData(this.defaultData);
            vscode.window.showInformationMessage('所有数据已清理');
        }
    }
    /**
     * 获取数据统计信息
     */
    async getDataStats() {
        const data = await this.getData();
        const backups = this.getAvailableBackups();
        const dataSize = JSON.stringify(data).length;
        return {
            userCount: data.users?.length || 0,
            promptCount: data.prompts?.length || 0,
            categoryCount: data.categories?.length || 0,
            backupCount: backups.length,
            lastBackupTime: data.lastBackupTime || '无',
            dataSize: `${(dataSize / 1024).toFixed(2)} KB`
        };
    }
}
exports.DataStorageManager = DataStorageManager;
//# sourceMappingURL=dataStorageManager.js.map