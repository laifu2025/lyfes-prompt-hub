/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { DataManager, SyncError } from './dataManager';

export class PromptHubProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptHubView';

    private _view?: vscode.WebviewView;
    private _dataManager: DataManager;

    constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._dataManager = new DataManager(context);
    }

    public getDataManager(): DataManager {
        return this._dataManager;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            // Legacy handler for simple settings save from old webview code
            if (message.command === 'saveSettings') {
                try {
                    await this._dataManager.saveAppData(message.data);
                    this._postMessage({ command: 'settingsSaved' });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this._postMessage({ command: 'settingsSaveFailed', message: errorMessage });
                    vscode.window.showErrorMessage(`保存设置失败: ${errorMessage}`);
                }
                return;
            }

            try {
                await this._handleWebviewMessage(message);
            } catch (error) {
                this.showError(error, message.type, message.requestId);
            }
        });
    }

    private async _handleWebviewMessage(message: any): Promise<void> {
        const payload = message.payload || {};
        switch (message.type) {
            case 'webviewReady':
                await this.refresh();
                break;

            case 'getAppData': {
                const appData = await this._dataManager.getAppData();
                this._postMessage({ type: 'appDataResponse', requestId: message.requestId, success: true, data: appData });
                break;
            }

            case 'getPrompts': {
                const prompts = await this._dataManager.getPrompts();
                this._postMessage({ type: 'promptsResponse', requestId: message.requestId, success: true, data: prompts });
                break;
            }

            case 'getAllTags': {
                const tags = await this._dataManager.getAllTags();
                this._postMessage({ type: 'allTagsResponse', requestId: message.requestId, success: true, data: tags });
                break;
            }

            case 'getCategoryPromptCount': {
                const count = await this._dataManager.getCategoryPromptCount(payload.name);
                this._postMessage({ type: 'categoryPromptCountResponse', requestId: message.requestId, success: true, data: { count } });
                break;
            }
            
            case 'savePrompt': {
                await this._dataManager.savePrompt(payload.prompt);
                this._postMessage({ type: 'savePromptResponse', requestId: message.requestId, success: true });
                this._showNotification('Prompt 已保存。');
                break;
            }

            case 'deletePrompt': {
                await this._dataManager.deletePrompt(payload.id);
                this._postMessage({ type: 'deletePromptResponse', requestId: message.requestId, success: true });
                this._showNotification('Prompt 已删除。');
                break;
            }

            case 'renameCategory': {
                await this._dataManager.renameCategory(payload.oldName, payload.newName);
                this._postMessage({ type: 'renameCategoryResponse', requestId: message.requestId, success: true });
                this._showNotification(`分类已重命名为 "${payload.newName}"`);
                break;
            }

            case 'deleteTag': {
                await this._dataManager.deleteTag(payload.name);
                this._postMessage({ type: 'deleteTagResponse', requestId: message.requestId, success: true });
                break;
            }

            case 'deleteCategory': {
                await this._dataManager.deleteCategory(payload.name);
                this._postMessage({ type: 'deleteCategoryResponse', requestId: message.requestId, success: true });
                this._showNotification('分类已删除。');
                break;
            }
            
            case 'addCategory': {
                await this._dataManager.addCategory(payload.name);
                this._postMessage({ type: 'addCategoryResponse', requestId: message.requestId, success: true });
                this._showNotification(`分类 "${payload.name}" 已成功添加。`);
                break;
            }

            // Data Management Actions
            case 'importData': {
                const result = await this._dataManager.importData();
                if (result) this.refresh();
                this._postMessage({ type: 'importDataResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'exportData': {
                await this._dataManager.exportData();
                this._postMessage({ type: 'exportDataResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'createBackup': {
                const backupPath = await this._dataManager.createBackup();
                this._postMessage({ type: 'createBackupResponse', requestId: message.requestId, success: true, data: { path: backupPath } });
                break;
            }
            case 'restoreBackup': {
                // This one is more complex and better handled by the command which has full UI control
                await vscode.commands.executeCommand('promptHub.restoreBackup');
                this._postMessage({ type: 'restoreBackupResponse', requestId: message.requestId, success: true, data: { restored: true }});
                break;
            }

            // Cloud Sync Actions
            case 'webview:setupCloudSync': {
                const result = await this._dataManager.setupCloudSync();
                if (result) { this.refresh(); }
                this._postMessage({ type: 'setupCloudSyncResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'webview:saveCloudSyncSettings': {
                try {
                    const result = await this._dataManager.saveCloudSyncSettings(payload);
                    this._postMessage({ type: 'saveCloudSyncSettingsResponse', requestId: message.requestId, success: true, data: result });
                    vscode.window.showInformationMessage('云同步设置已保存并验证成功!');
                } catch (error: any) {
                    const errorMessage = error instanceof Error ? error.message : '发生未知错误';
                    // Directly respond with the error message for the webview to handle
                    this._postMessage({ 
                        type: 'saveCloudSyncSettingsResponse', 
                        requestId: message.requestId, 
                        success: false, 
                        error: errorMessage 
                    });
                    // Also show a native error notification to the user
                    vscode.window.showErrorMessage(`云同步设置失败: ${errorMessage}`);
                }
                break;
            }
            case 'webview:disableCloudSync': {
                await this._dataManager.disableCloudSync();
                this.refresh();
                this._postMessage({ type: 'disableCloudSyncResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'webview:resetCloudSync': {
                await this._dataManager.resetCloudSync();
                this.refresh();
                this._postMessage({ type: 'resetCloudSyncResponse', requestId: message.requestId, success: true });
                vscode.window.showInformationMessage('云同步设置已重置为默认状态（关闭）');
                break;
            }

            case 'webview:resetAllData': {
                try {
                    const resetResult = await this._dataManager.resetAllData();
                    this.refresh();
                    this._postMessage({ 
                        type: 'resetAllDataResponse', 
                        requestId: message.requestId, 
                        success: true, 
                        data: resetResult 
                    });
                    vscode.window.showInformationMessage('所有数据已重置为默认状态，已添加软件开发生命周期相关的示例数据！');
                } catch (error) {
                    this._postMessage({ 
                        type: 'resetAllDataResponse', 
                        requestId: message.requestId, 
                        success: false, 
                        error: error instanceof Error ? error.message : '重置所有数据失败' 
                    });
                    vscode.window.showErrorMessage(`重置所有数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
                }
                break;
            }

            case 'webview:clearAllData': {
                try {
                    const clearResult = await this._dataManager.clearAllData();
                    this.refresh();
                    this._postMessage({ 
                        type: 'clearAllDataResponse', 
                        requestId: message.requestId, 
                        success: true, 
                        data: clearResult 
                    });
                    vscode.window.showInformationMessage('所有数据已清空，只保留默认设置！');
                } catch (error) {
                    this._postMessage({ 
                        type: 'clearAllDataResponse', 
                        requestId: message.requestId, 
                        success: false, 
                        error: error instanceof Error ? error.message : '清空所有数据失败' 
                    });
                    vscode.window.showErrorMessage(`清空所有数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
                }
                break;
            }
            case 'webview:syncToCloud': {
                await this._dataManager.syncToCloud();
                this._postMessage({ type: 'syncToCloudResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'webview:syncFromCloud': {
                const result = await this._dataManager.syncFromCloud();
                if (result) this.refresh();
                this._postMessage({ type: 'syncFromCloudResponse', requestId: message.requestId, success: true, data: result });
                break;
            }

            case 'webview:setSetting': {
                const { key, value } = payload;
                await this._dataManager.updateSetting(key, value);
                this._postMessage({ type: 'setSettingResponse', requestId: message.requestId, success: true });
                break;
            }

            // Storage Mode Actions
            case 'getStorageInfo': {
                await vscode.commands.executeCommand('promptHub.showStorageInfo');
                this._postMessage({ type: 'getStorageInfoResponse', requestId: message.requestId, success: true });
                break;
            }
            case 'toggleWorkspaceMode': {
                const appData = await this._dataManager.getAppData();
                await this._dataManager.toggleWorkspaceMode(!appData.settings.workspaceMode);
                this.refresh();
                this._postMessage({ type: 'toggleWorkspaceModeResponse', requestId: message.requestId, success: true });
                break;
            }

            case 'getSystemStatus': {
                const status = await this._dataManager.getSystemStatus();
                this._postMessage({ type: 'systemStatusResponse', requestId: message.requestId, success: true, data: status });
                break;
            }

            case 'setPromptActive': {
                await this._dataManager.setPromptActive(payload.id, payload.isActive);
                this._postMessage({ type: 'setPromptActiveResponse', requestId: message.requestId, success: true });
                break;
            }

            case 'showNotification': {
                const { message: notificationMessage, type: notificationType } = payload;
                if (notificationType === 'error') {
                    vscode.window.showErrorMessage(notificationMessage);
                } else if (notificationType === 'warning') {
                    vscode.window.showWarningMessage(notificationMessage);
                } else {
                    vscode.window.showInformationMessage(notificationMessage);
                }
                // This is a fire-and-forget message, no response needed.
                break;
            }

            case 'showConfirmation': {
                const confirmed = await this._showConfirmationDialog(payload.message);
                this._postMessage({ type: 'confirmationResponse', requestId: message.requestId, success: true, confirmed });
                break;
            }

            case 'showInputBox': {
                const value = await vscode.window.showInputBox(payload);
                // If the user cancels the input box, `value` will be `undefined`.
                // We send it back anyway, the webview should handle this case.
                this._postMessage({ type: 'inputBoxResponse', requestId: message.requestId, success: true, value });
                break;
            }
        }
    }

    private _postMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public async refresh(): Promise<void> {
        if (this._view && this._view.visible) {
            const appData = await this._dataManager.getAppData();
            this._postMessage({ type: 'appDataResponse', data: appData, isRefresh: true });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.html');
    
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'js', 'app.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'style.css'));

        const nonce = getNonce();
    
        try {
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            
            const cspSource = webview.cspSource;
            htmlContent = htmlContent
                .replace(/__CSP_SOURCE__/g, `default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://*.vscode-cdn.net; font-src ${cspSource} https://*.vscode-cdn.net; script-src 'nonce-${nonce}'; img-src ${cspSource} https:; connect-src ${cspSource};`)
                .replace(/__NONCE__/g, nonce)
                .replace(/__STYLE_URI__/g, styleUri.toString())
                .replace(/__SCRIPT_URI__/g, scriptUri.toString());
    
            return htmlContent;
        } catch (error) {
            console.error('Error reading or processing webview HTML:', error);
            return this._getFallbackHtml(error);
        }
    }

    private _getFallbackHtml(error?: any): string {
        console.error('Failed to render webview, showing fallback HTML.', error);
        return `<!DOCTYPE html><html lang="en"><head><title>Error</title></head><body><h1>Error loading Prompt Hub</h1><p>Details: ${error instanceof Error ? error.message : String(error)}</p></body></html>`;
    }

    private _showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        const options = { modal: false };
        if (type === 'error') {
            vscode.window.showErrorMessage(message, options);
        } else if (type === 'warning') {
            vscode.window.showWarningMessage(message, options);
        } else {
            vscode.window.showInformationMessage(message, options);
        }
    }

    private async _showConfirmationDialog(message: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(message, { modal: true }, 'Confirm');
        return result === 'Confirm';
    }

    private showError(error: any, requestType?: string, requestId?: string): void {
        console.error(`Error handling ${requestType || 'unknown'} request (ID: ${requestId || 'N/A'}):`, error);
        const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : '发生未知错误');
    
        // Always show a native VS Code error message to the user
        vscode.window.showErrorMessage(`操作失败: ${errorMessage}`);
    
        // Also send an error response to the webview if a request ID was provided
        if (requestId) {
            this._postMessage({
                type: `${requestType}Response`,
                requestId,
                success: false,
                error: errorMessage
            });
        }
    }

    public dispose(): void {
        this._view = undefined;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}