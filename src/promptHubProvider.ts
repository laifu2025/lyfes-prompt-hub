import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DataManager } from './dataManager';

export class PromptHubProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptHubView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _dataManager: DataManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // Add a listener for when the view's visibility changes.
        // This ensures data is refreshed every time the user brings the view into focus.
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refresh();
            }
        });

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    if (message.type === 'webviewReady') {
                        // Webview is ready, send initial data
                        this.refresh();
                        return;
                    }
                    await this._handleWebviewMessage(message);
        } catch (error) {
                    console.error('处理webview消息失败:', error);
                    this._postMessage({
                        type: 'error',
                        requestId: message.requestId,
                        message: `操作失败: ${error}`
                    });
        }
            },
            undefined
        );
    }

    /**
     * 处理来自webview的消息
     */
    private async _handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'getAppData': {
                const appData = await this._dataManager.getAppData();
                this._postMessage({ type: 'appDataResponse', requestId: message.requestId, data: appData });
                break;
            }
            case 'saveAppData': {
                await this._dataManager.saveAppData(message.data);
                this._postMessage({ type: 'saveDataResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'exportData': {
                try {
                    const exportPath = await this._dataManager.exportData();
                    this._postMessage({ type: 'exportDataResponse', requestId: message.requestId, success: true, path: exportPath });
                } catch (error) {
                    this._postMessage({ type: 'exportDataResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'importData': {
                try {
                    const importedData = await this._dataManager.importData();
                    this._postMessage({ type: 'importDataResponse', requestId: message.requestId, success: !!importedData, data: importedData });
                } catch (error) {
                    this._postMessage({ type: 'importDataResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'createBackup': {
                try {
                    const backupPath = await this._dataManager.createBackup();
                    this._postMessage({ type: 'createBackupResponse', requestId: message.requestId, success: true, path: backupPath });
                } catch (error) {
                    this._postMessage({ type: 'createBackupResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'getBackupList': {
                const backupList = this._dataManager.getBackupList();
                this._postMessage({ type: 'backupListResponse', requestId: message.requestId, data: backupList });
                break;
                }
            case 'restoreBackup': {
                try {
                    const restoredData = await this._dataManager.restoreFromBackup(message.backupPath);
                    this._postMessage({ type: 'restoreBackupResponse', requestId: message.requestId, success: !!restoredData, data: restoredData });
                } catch (error) {
                    this._postMessage({ type: 'restoreBackupResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'setupCloudSync': {
                try {
                    await this._dataManager.setupCloudSync();
                    this._postMessage({ type: 'setupCloudSyncResponse', requestId: message.requestId, success: true });
                } catch (error) {
                    this._postMessage({ type: 'setupCloudSyncResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'syncToCloud': {
                try {
                    await this._dataManager.syncToCloud();
                    this._postMessage({ type: 'syncToCloudResponse', requestId: message.requestId, success: true });
                } catch (error) {
                    this._postMessage({ type: 'syncToCloudResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
                }
            case 'syncFromCloud': {
                try {
                    const syncedData = await this._dataManager.syncFromCloud();
                    this._postMessage({ type: 'syncFromCloudResponse', requestId: message.requestId, success: !!syncedData, data: syncedData });
                } catch (error) {
                    this._postMessage({ type: 'syncFromCloudResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
                }
            case 'getStorageInfo': {
                try {
                    const storageInfo = await this._dataManager.getStorageInfo();
                    this._postMessage({ type: 'storageInfoResponse', requestId: message.requestId, success: true, data: storageInfo });
                } catch (error) {
                    this._postMessage({ type: 'storageInfoResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
                }
            case 'toggleWorkspaceMode': {
                try {
                    // 后端自主决定如何切换，而不是依赖前端传递状态
                    const storageInfo = await this._dataManager.getStorageInfo();
                    const currentModeIsWorkspace = storageInfo.mode === 'workspace';
                    await this._dataManager.toggleWorkspaceMode(!currentModeIsWorkspace);
                    
                    // 获取更新后的状态并推送给 webview
                    const newStatus = await this._dataManager.getSystemStatus();
                    this._postMessage({ type: 'systemStatusUpdated', data: newStatus });

                    // 响应原始请求
                    this._postMessage({ type: 'toggleWorkspaceModeResponse', requestId: message.requestId, success: true, data: newStatus });

                } catch (error) {
                    this._postMessage({ type: 'toggleWorkspaceModeResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
                }
            case 'getSystemStatus': {
                try {
                    const status = await this._dataManager.getSystemStatus();
                    this._postMessage({ type: 'getSystemStatusResponse', requestId: message.requestId, success: true, data: status });
                } catch (error) {
                    this._postMessage({ type: 'getSystemStatusResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'showStorageInfo': {
                try {
                    const storageInfo = await this._dataManager.getStorageInfo();
                    const appData = await this._dataManager.getAppData();
                    
                    const info = [
                        `存储模式：${storageInfo.location}`,
                        `提示词数量：${appData.prompts.length}`,
                        `分类数量：${appData.categories.length}`,
                        `最后修改：${new Date(appData.metadata.lastModified).toLocaleString('zh-CN')}`,
                        `版本：${appData.metadata.version}`
                    ].join('\n');

                    this._showNotification(info, 'info', true);
                    this._postMessage({ type: 'showStorageInfoResponse', requestId: message.requestId, success: true });
                } catch (error) {
                    this._showNotification(`获取存储信息失败: ${error}`, 'error');
                    this._postMessage({ type: 'showStorageInfoResponse', requestId: message.requestId, success: false, error: String(error) });
                }
                break;
            }
            case 'showNotification': {
                this._showNotification(
                    message.message,
                    message.notificationType as 'info' | 'warning' | 'error'
                );
                break;
            }
            case 'showConfirmation': {
                const result = await this._showConfirmationDialog(message.message);
                this._postMessage({ 
                    type: 'confirmationResponse', 
                    requestId: message.requestId, 
                    confirmed: result 
                });
                break;
            }
            case 'showInputBox': {
                const result = await this._showInputBox(message.prompt, message.value);
                this._postMessage({
                    type: 'inputBoxResponse',
                    requestId: message.requestId,
                    value: result
                });
                break;
            }
            case 'addCategory': {
                try {
                    const updatedAppData = await this._dataManager.addCategory(message.name);
                    this._postMessage({ type: 'addCategoryResponse', requestId: message.requestId, success: true, data: updatedAppData });
                    this._showNotification(`分类 "${message.name}" 已成功添加。`, 'info');
                } catch (error: any) {
                    this._postMessage({ type: 'addCategoryResponse', requestId: message.requestId, success: false, error: error.message });
                    this._showNotification(`添加分类失败: ${error.message}`, 'error');
                }
                break;
            }
            case 'editCategory': {
                try {
                    const updatedAppData = await this._dataManager.editCategory(message.oldName, message.newName);
                    this._postMessage({ type: 'editCategoryResponse', requestId: message.requestId, success: true, data: updatedAppData });
                    this._showNotification(`分类已从 "${message.oldName}" 更新为 "${message.newName}"。`, 'info');
                } catch (error: any) {
                    this._postMessage({ type: 'editCategoryResponse', requestId: message.requestId, success: false, error: error.message });
                    this._showNotification(`编辑分类失败: ${error.message}`, 'error');
                }
                break;
            }
            case 'deleteCategory': {
                const { categoryName } = message;
                if (!categoryName) {
                    this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: false, error: '无效的分类名称' });
                    break;
                }

                try {
                    const appData = await this._dataManager.getAppData();
                    const isCategoryInUse = appData.prompts.some(p => p.category === categoryName);

                    if (isCategoryInUse) {
                        const errorMsg = `无法删除分类 "${categoryName}"，因为它仍包含 Prompt。请先将该分类下的所有 Prompt 移至其他分类或将其删除。`;
                        this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: false, error: errorMsg });
                        break;
                    }

                    const originalCategoryCount = appData.categories.length;
                    appData.categories = appData.categories.filter(c => c !== categoryName);

                    if (appData.categories.length < originalCategoryCount) {
                        await this._dataManager.saveAppData(appData);
                        const updatedAppData = await this._dataManager.getAppData();
                        this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: true, data: updatedAppData });
                    } else {
                        const errorMsg = `未找到要删除的分类 "${categoryName}"。`;
                        this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: false, error: errorMsg });
                    }
                } catch (error: any) {
                    this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: false, error: error.message });
                    this._showNotification(`删除分类时发生错误: ${error.message}`, 'error');
                }
                break;
            }
            case 'savePrompt': {
                try {
                    const updatedAppData = await this._dataManager.savePrompt(message.prompt);
                    this._postMessage({ type: 'savePromptResponse', requestId: message.requestId, success: true, data: updatedAppData });
                    this._showNotification('Prompt 已成功保存。', 'info');
                } catch (error: any) {
                    this._postMessage({ type: 'savePromptResponse', requestId: message.requestId, success: false, error: error.message });
                    this._showNotification(`保存 Prompt 失败: ${error.message}`, 'error');
                }
                break;
            }
            case 'deletePrompt': {
                try {
                    const updatedAppData = await this._dataManager.deletePrompt(message.id);
                    this._postMessage({ type: 'deletePromptResponse', requestId: message.requestId, success: true, data: updatedAppData });
                    this._showNotification('Prompt 已成功删除。', 'info');
                } catch (error: any) {
                    this._postMessage({ type: 'deletePromptResponse', requestId: message.requestId, success: false, error: error.message });
                    this._showNotification(`删除 Prompt 失败: ${error.message}`, 'error');
                }
                break;
            }
            default:
                console.warn('未知的消息类型:', message.type);
                }
    }

    /**
     * 向webview发送消息
     */
    private _postMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * 刷新webview，获取最新数据并推送
     */
    public async refresh(): Promise<void> {
        if (this._view) {
            try {
                const appData = await this._dataManager.getAppData();
                this._postMessage({ type: 'dataRefreshed', data: appData });
            } catch (error) {
                console.error('刷新数据失败:', error);
                this._postMessage({ type: 'error', message: '刷新数据失败' });
            }
        }
    }

    /**
     * 获取webview的HTML内容
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'js', 'app.js');
            const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

            const stylePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'style.css');
            const styleUri = webview.asWebviewUri(stylePathOnDisk);
            
            const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.html');
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

            // Replace placeholders
            htmlContent = htmlContent.replace(/__SCRIPT_URI__/g, scriptUri.toString());
            htmlContent = htmlContent.replace(/__STYLE_URI__/g, styleUri.toString());
            
            return htmlContent;
        } catch (error) {
            console.error('Error getting HTML for webview:', error);
            return this._getFallbackHtml(error);
        }
    }

    private _getFallbackHtml(error?: any): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error</title>
            </head>
            <body>
                <h1>Error loading Prompt Hub</h1>
                <p>Could not read 'index.html'. Please ensure the file exists and the extension is installed correctly.</p>
                <p>Details: ${error?.message || 'Unknown error'}</p>
            </body>
            </html>
        `;
    }

    /**
     * 显示通知消息
     * @param message 消息内容
     * @param type 消息类型：'info' | 'warning' | 'error'
     * @param modal 是否显示为模态对话框
     */
    private _showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info', modal: boolean = false): void {
        if (modal) {
            vscode.window.showInformationMessage(message, { modal: true });
        } else {
        switch (type) {
            case 'info':
                    vscode.window.showInformationMessage(message);
                break;
            case 'warning':
                    vscode.window.showWarningMessage(message);
                break;
            case 'error':
                    vscode.window.showErrorMessage(message);
                break;
            }
        }
    }

    /**
     * 显示一个确认对话框并返回用户的选择
     * @param message 对话框中显示的消息
     * @returns 如果用户点击'确定'则返回true, 否则返回false
     */
    private async _showConfirmationDialog(message: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            '确认'
        );
        return result === '确认';
    }

    private async _showInputBox(prompt: string, value?: string): Promise<string | undefined> {
        const result = await vscode.window.showInputBox({
            prompt: prompt,
            value: value,
            validateInput: (text: string) => {
                if (!text || text.trim().length === 0) {
                    return '名称不能为空。';
                }
                if (text.length > 50) {
                    return '名称过长（最多50个字符）。';
                }
                if (text.toLowerCase() === '未分类') {
                    return '"未分类" 是一个保留名称，无法使用。';
                }
                return null;
            }
        });
        return result;
    }
} 