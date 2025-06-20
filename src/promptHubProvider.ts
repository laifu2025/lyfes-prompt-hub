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

            case 'setPromptActive': {
                await this._dataManager.setPromptActive(payload.id, payload.isActive);
                this._postMessage({ type: 'setPromptActiveResponse', requestId: message.requestId, success: true });
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
        this._showNotification(`发生错误: ${errorMessage}`, 'error');
        this._postMessage({ type: 'error', requestId, message: `操作失败: ${errorMessage}` });
    }
}