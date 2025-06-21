/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { DataManager } from './dataManager';

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
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'out')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            try {
                await this._handleWebviewMessage(message);
            } catch (error) {
                this.showError(error, message.requestId);
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
                    await this._dataManager.saveCloudSyncSettings(message.data);
                    this.refresh(); // Refresh the view to show updated state
                    this._postMessage({ type: 'saveCloudSyncSettingsResponse', requestId: message.requestId, success: true, data: { success: true } });
                } catch (error: any) {
                    this._postMessage({ type: 'saveCloudSyncSettingsResponse', requestId: message.requestId, success: false, data: { success: false, error: error.message } });
                }
                break;
            }
            case 'webview:disableCloudSync': {
                await this._dataManager.disableCloudSync();
                this.refresh();
                this._postMessage({ type: 'disableCloudSyncResponse', requestId: message.requestId, success: true });
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
                this._showNotification(payload.message, payload.type);
                // This is a fire-and-forget message, so we don't need to send a response back.
                // However, if the frontend uses `postMessageWithResponse`, it needs a reply.
                this._postMessage({ type: 'notificationResponse', requestId: message.requestId, success: true });
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
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.html');
    
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'js', 'app.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'style.css'));
    
        try {
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            
            htmlContent = htmlContent
                .replace(/__STYLE_URI__/g, styleUri.toString())
                .replace(/__SCRIPT_URI__/g, scriptUri.toString());
    
            return htmlContent;
        } catch (error) {
            console.error('Error reading or processing webview HTML:', error);
            return this._getFallbackHtml(error);
        }
    }

    private _getFallbackHtml(error?: any): string {
        const message = error instanceof Error ? error.message : String(error);
        return `<!DOCTYPE html><html lang="en"><head><title>Error</title></head><body><h1>Error loading Prompt Hub</h1><p>Details: ${message}</p></body></html>`;
    }

    private _showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        const show = {
            'info': vscode.window.showInformationMessage,
            'warning': vscode.window.showWarningMessage,
            'error': vscode.window.showErrorMessage,
        };
        show[type](message);
    }

    private async _showConfirmationDialog(message: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(message, { modal: true }, '确认');
        return result === '确认';
    }

    private showError(error: any, requestId?: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error handling webview message:', error);
        
        // Post the specific error message back to the webview
        this._postMessage({ type: 'error', requestId, message: errorMessage });
        
        // Also show a generic notification in the VS Code window itself, but the webview gets the detail.
        this._showNotification(`操作失败: ${errorMessage}`, 'error');
    }
}