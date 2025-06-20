import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
    };
    metadata: {
        version: string;
        lastModified: string;
        totalPrompts: number;
    };
}
// #endregion

export class DataManager {
    private context: vscode.ExtensionContext;
    private backupTimer?: NodeJS.Timeout;
    
    private static readonly STORAGE_KEYS = {
        APP_DATA: 'promptHub.appData',
        WORKSPACE_DATA: 'promptHub.workspaceData',
        BACKUP_HISTORY: 'promptHub.backupHistory',
        SYNC_CONFIG: 'promptHub.syncConfig'
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeAutoBackup().catch(err => console.error("Failed to initialize auto-backup:", err));
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

            if (workspaceData?.settings.workspaceMode) {
                savedData = workspaceData;
            } else if (globalData) {
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
            throw new Error(`分类 "${categoryName}" 已存在。`);
        }
        appData.categories.unshift(categoryName);
        await this.saveAppData(appData);
        return appData;
    }

    public async renameCategory(oldName: string, newName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!newName || newName.trim() === '') throw new Error('分类名称不能为空。');
        if (oldName === newName) return appData;
        if (appData.categories.includes(newName)) throw new Error(`分类 "${newName}" 已存在。`);
        
        const categoryIndex = appData.categories.indexOf(oldName);
        if (categoryIndex === -1) throw new Error(`未找到分类 "${oldName}"。`);

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
        
        // Remove the category from the list
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
        const prompt = appData.prompts.find(p => p && p.id === id);

        if (prompt) {
            prompt.isActive = isActive;
            prompt.updatedAt = new Date().toISOString();
            await this.saveAppData(appData);
        } else {
            throw new Error(`找不到ID为 ${promptId} 的Prompt。`);
        }
    }
    // #endregion

    // #region Backup & Restore
    public async createBackup(data?: AppData): Promise<string> {
        const backupData = { timestamp: new Date().toISOString(), data: data || await this.getAppData(), version: '1.0.0', source: 'Lyfe\'s Prompt Hub' };
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        const filename = `prompt-hub-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const backupPath = path.join(backupDir, filename);
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
        
        await this.updateBackupHistory(backupPath, backupData.timestamp);
        await this.cleanupOldBackups();
        return backupPath;
    }

    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        if (!fs.existsSync(backupPath)) throw new Error('备份文件不存在');
        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        if (!backup.data) throw new Error('备份文件格式不正确');
        await this.saveAppData(backup.data);
        return backup.data;
    }

    public getBackupList(): Array<{path: string, timestamp: string, size: number}> {
        return this.context.globalState.get<Array<{path: string, timestamp: string}>>(DataManager.STORAGE_KEYS.BACKUP_HISTORY, [])
            .filter(b => fs.existsSync(b.path))
            .map(b => ({ ...b, size: fs.statSync(b.path).size }))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    private getBackupDirectory(): string {
        return path.join(this.context.extensionPath, 'backups');
    }

    private async updateBackupHistory(backupPath: string, timestamp: string): Promise<void> {
        const history = this.context.globalState.get<Array<{path: string, timestamp: string}>>(DataManager.STORAGE_KEYS.BACKUP_HISTORY, []);
        history.push({ path: backupPath, timestamp });
        await this.context.globalState.update(DataManager.STORAGE_KEYS.BACKUP_HISTORY, history);
    }

    private async cleanupOldBackups(): Promise<void> {
        const sortedHistory = this.getBackupList();
        if (sortedHistory.length > 10) {
            const toDelete = sortedHistory.slice(10);
            toDelete.forEach(backup => { try { fs.unlinkSync(backup.path); } catch (e) { console.warn(`删除旧备份失败: ${backup.path}`, e); } });
            await this.context.globalState.update(DataManager.STORAGE_KEYS.BACKUP_HISTORY, sortedHistory.slice(0, 10));
        }
    }

    private async initializeAutoBackup(): Promise<void> {
        const data = await this.getAppData();
        const interval = (data.settings.backupInterval || 30) * 60 * 1000;

        this.backupTimer = setInterval(async () => {
            const currentData = await this.getAppData();
            if (currentData.settings.autoBackup) {
                await this.createBackup(currentData);
            }
        }, interval);
    }
    // #endregion

    // #region Import & Export
    public async exportData(): Promise<string> {
        const exportData = { timestamp: new Date().toISOString(), data: await this.getAppData(), version: '1.0.0', source: 'Lyfe\'s Prompt Hub' };
        const defaultPath = path.join(this.getBackupDirectory(), `prompt-hub-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        const result = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultPath), filters: { 'JSON': ['json'] } });
        if (result) {
            fs.writeFileSync(result.fsPath, JSON.stringify(exportData, null, 2), 'utf-8');
            return result.fsPath;
        }
        throw new Error('导出已取消');
    }

    public async importData(): Promise<AppData | null> {
        const result = await vscode.window.showOpenDialog({ filters: { 'JSON': ['json'] } });
        if (!result || result.length === 0) throw new Error('导入已取消');
        
        const importData = JSON.parse(fs.readFileSync(result[0].fsPath, 'utf-8'));
        if (!importData.data) throw new Error('导入文件格式不正确');

        const choice = await vscode.window.showWarningMessage('导入数据将覆盖当前所有数据，是否继续？', { modal: true }, '继续导入');
        if (choice === '继续导入') {
            await this.createBackup();
            await this.saveAppData(importData.data);
            return importData.data;
        }
        return null;
    }
    // #endregion

    // #region Cloud Sync (Dummy implementations)
    public async setupCloudSync(): Promise<void> { vscode.window.showInformationMessage('云同步功能待实现。'); }
    public async syncToCloud(): Promise<void> { vscode.window.showInformationMessage('云同步功能待实现。'); }
    public async syncFromCloud(): Promise<AppData | null> { vscode.window.showInformationMessage('云同步功能待实现。'); return null; }
    // #endregion
    
    // #region System & Dispose
    public async getSystemStatus(): Promise<{ storageMode: 'workspace' | 'global'; cloudSync: { status: string } }> {
        const storageInfo = await this.getStorageInfo();
        return {
            storageMode: storageInfo.mode,
            cloudSync: { status: '未配置' } // Dummy status for now
        };
    }

    public dispose(): void {
        if (this.backupTimer) clearInterval(this.backupTimer);
    }
    // #endregion
}