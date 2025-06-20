import * as vscode from 'vscode';
import { PromptHubProvider } from './promptHubProvider';
import { DataManager } from './dataManager';

// let dataManager: DataManager; // REMOVE

export function activate(context: vscode.ExtensionContext) {
    console.log('Prompt Hub 扩展已激活');
    
    // dataManager = new DataManager(context); // REMOVE
    
    const promptHubProvider = new PromptHubProvider(context.extensionUri, context);
    
    // 注册 webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'promptHubView', 
            promptHubProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    
    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.openPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.promptHub');
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.refresh', () => {
            promptHubProvider.refresh();
        })
    );

    // 数据管理相关命令
    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.exportData', async () => {
            try {
                await promptHubProvider.getDataManager().exportData();
            } catch (error) {
                vscode.window.showErrorMessage(`导出数据失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.importData', async () => {
            try {
                const result = await promptHubProvider.getDataManager().importData();
                if (result) {
                    promptHubProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`导入数据失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.createBackup', async () => {
            try {
                const backupPath = await promptHubProvider.getDataManager().createBackup();
                vscode.window.showInformationMessage(`备份已创建: ${backupPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`创建备份失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.restoreBackup', async () => {
            try {
                const dataManager = promptHubProvider.getDataManager();
                const backupList = dataManager.getBackupList();
                if (backupList.length === 0) {
                    vscode.window.showInformationMessage('没有可用的备份文件');
                    return;
                }

                const items: (vscode.QuickPickItem & { backupPath: string })[] = backupList.map(backup => ({
                    label: new Date(backup.timestamp).toLocaleString('zh-CN'),
                    description: `${(backup.size / 1024).toFixed(2)} KB`,
                    detail: backup.path,
                    backupPath: backup.path
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: '选择要恢复的备份'
                });

                if (selected) {
                    const result = await dataManager.restoreFromBackup(selected.backupPath);
                    if (result) {
                        promptHubProvider.refresh();
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`恢复备份失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.setupCloudSync', async () => {
            try {
                const result = await promptHubProvider.getDataManager().setupCloudSync();
                if (result) {
                    promptHubProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`设置云同步失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.syncToCloud', async () => {
            try {
                await promptHubProvider.getDataManager().syncToCloud();
            } catch (error) {
                vscode.window.showErrorMessage(`同步到云端失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.syncFromCloud', async () => {
            try {
                const result = await promptHubProvider.getDataManager().syncFromCloud();
                if (result) {
                    promptHubProvider.refresh();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`从云端同步失败: ${error}`);
            }
        })
    );

    // 工作区模式相关命令
    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.toggleWorkspaceMode', async () => {
            try {
                const dataManager = promptHubProvider.getDataManager();
                const storageInfo = await dataManager.getStorageInfo();
                const currentMode = storageInfo.mode === 'workspace';
                
                const action = currentMode ? '禁用' : '启用';
                const choice = await vscode.window.showInformationMessage(
                    `当前存储模式：${storageInfo.location}`,
                    `${action}工作区模式`,
                    '取消'
                );

                if (choice === `${action}工作区模式`) {
                    await dataManager.toggleWorkspaceMode(!currentMode);
                    promptHubProvider.refresh();
                    
                    const newMode = !currentMode ? '工作区模式' : '全局模式';
                    vscode.window.showInformationMessage(`已切换到${newMode}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`切换存储模式失败: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('promptHub.showStorageInfo', async () => {
            try {
                const dataManager = promptHubProvider.getDataManager();
                const storageInfo = await dataManager.getStorageInfo();
                const appData = await dataManager.getAppData();
                
                const info = [
                    `存储模式：${storageInfo.location}`,
                    `提示词数量：${appData.prompts.length}`,
                    `分类数量：${appData.categories.length}`,
                    `最后修改：${new Date(appData.metadata.lastModified).toLocaleString('zh-CN')}`,
                    `版本：${appData.metadata.version}`
                ].join('\n');

                vscode.window.showInformationMessage(info, { modal: true });
            } catch (error) {
                vscode.window.showErrorMessage(`获取存储信息失败: ${error}`);
            }
        })
    );

    // 将数据管理器添加到context，以便在停用时清理
    context.subscriptions.push({
        dispose: () => promptHubProvider.getDataManager().dispose()
    });
}

export function deactivate() {
    console.log('Prompt Hub 扩展已停用');
    // if (dataManager) { // REMOVED
    //     dataManager.dispose();
    // }
} 