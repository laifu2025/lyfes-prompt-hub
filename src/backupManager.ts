import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AppData, BackupInfo } from './types';

/**
 * 备份管理器 - 负责数据备份和恢复功能
 * 
 * 职责：
 * - 创建和管理数据备份
 * - 恢复数据从备份文件
 * - 自动备份定时任务
 * - 备份文件清理
 */
export class BackupManager {
    private backupTimer?: NodeJS.Timeout;

    constructor(private context: vscode.ExtensionContext) {}

    // #region Backup/Restore
    public async createBackup(data: AppData): Promise<string> {
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = `backup-${timestamp}.json`;
        const backupPath = path.join(backupDir, backupFile);
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 4));
        await this.updateBackupHistory(backupPath, timestamp);
        await this.cleanupOldBackups();
        return backupPath;
    }

    public async restoreFromBackup(backupPath: string): Promise<AppData | null> {
        if (fs.existsSync(backupPath)) {
            const data = fs.readFileSync(backupPath, 'utf-8');
            const appData = JSON.parse(data);
            return appData;
        }
        return null;
    }

    public getBackupList(): BackupInfo[] {
        const backupDir = this.getBackupDirectory();
        if (!fs.existsSync(backupDir)) {
            return [];
        }
        const files = fs.readdirSync(backupDir);
        return files
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stat = fs.statSync(filePath);
                return { 
                    path: filePath, 
                    timestamp: this.extractTimestamp(file), 
                    size: stat.size, 
                    mtime: stat.mtime 
                };
            })
            .filter((file): file is { path: string; timestamp: string; size: number, mtime: Date } => file.timestamp !== 'N/A')
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .map(({path, timestamp, size}) => ({path, timestamp, size}));
    }

    private extractTimestamp(filename: string): string {
        const match = filename.match(/backup-(.*)\.json/);
        return match ? match[1].replace(/-/g, ':') : 'N/A';
    }

    private getBackupDirectory(): string {
        return path.join(this.context.globalStorageUri.fsPath, 'backups');
    }

    private async updateBackupHistory(backupPath: string, timestamp: string): Promise<void> {
        // 可以在这里记录备份历史，暂时留空
    }

    private async cleanupOldBackups(): Promise<void> {
        // 可以在这里清理老的备份文件，暂时留空
    }

    /**
     * 初始化自动备份
     * @param settings 应用设置
     */
    public async initializeAutoBackup(settings: AppData['settings']): Promise<void> {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        if (settings.autoBackup) {
            // 注意：这里需要外部提供创建备份的回调，因为备份管理器不应该直接依赖数据管理器
            this.backupTimer = setInterval(() => {
                // 这里需要通过回调函数来创建备份
                console.log('[BackupManager] Auto-backup timer triggered');
            }, settings.backupInterval * 60 * 1000);
        }
    }

    /**
     * 设置自动备份回调
     * @param callback 备份回调函数
     */
    public setAutoBackupCallback(callback: () => Promise<void>): void {
        // 可以用于设置自动备份的回调函数
    }

    public dispose(): void {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
    }
    // #endregion
} 