import { state } from './state.js';
import { showSettingsSaveStatus } from './uiManager.js';

/**
 * Sends a message to the extension backend and returns a Promise that resolves with the response.
 * @param {string} type The message type/command.
 * @param {object} payload The data to send with the message.
 * @returns {Promise<any>} A promise that resolves with the backend's response.
 */
export function postMessageWithResponse(type, payload = {}) {
    return new Promise((resolve, reject) => {
        const requestId = `webview-${state.requestIdCounter++}`;
        state.pendingRequests.set(requestId, { resolve, reject, type });
        state.vscode.postMessage({ type, requestId, payload });
    });
}

/**
 * Initializes the main message listener to handle responses from the extension.
 */
export function initializeApiListener() {
    window.addEventListener('message', event => {
        const message = event.data;
        const { requestId, type, ...response } = message;

        // Handle responses to requests initiated by the webview
        if (requestId && state.pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = state.pendingRequests.get(requestId);
            state.pendingRequests.delete(requestId);
            if (response.success === false || message.success === false) {
                const errorMsg = (response.data && response.data.error) || response.error || response.message || `操作 '${requestType}' 失败`;
                console.error(`Request ${requestType} (${requestId}) failed:`, errorMsg);
                reject(new Error(errorMsg));
            } else {
                resolve(response.data !== undefined ? response.data : response);
            }
        // Handle messages initiated by the backend (e.g., manual refresh)
        } else if (!requestId) { 
            // This handles older, non-request-response messages
            if (message.command === 'settingsSaved') {
                showSettingsSaveStatus(true);
                return;
            }
            if (message.command === 'settingsSaveFailed') {
                showSettingsSaveStatus(false, message.message);
                return;
            }

            if (type === 'appDataResponse' && message.isRefresh) {
                window.dispatchEvent(new CustomEvent('manualRefresh', { detail: message.data }));
            } else if (type === 'error') {
                 console.error('Received an error from the backend:', message.message);
                 window.dispatchEvent(new CustomEvent('backendError', { detail: message.message }));
            }
        }
    });
}

// 这是个 "fire-and-forget" 的消息，不期待回复
export function showNotification(message, type = 'info') {
    state.vscode.postMessage({
        type: 'showNotification',
        payload: { message, type }
    });
}

// `showToast` is an alias for `showNotification` for semantic clarity in the views.
export const showToast = showNotification;

/**
 * 显示确认对话框
 * @param {string} message 确认消息
 * @returns {Promise<boolean>} 用户是否确认
 */
export async function showConfirmation(message) {
    const response = await postMessageWithResponse('showConfirmation', { message });
    // 后端返回的数据结构中，confirmed字段可能在response.confirmed或response.data.confirmed
    return response.confirmed !== undefined ? response.confirmed : response.data?.confirmed;
}

/**
 * Saves the cloud sync settings.
 * @param {object} settings The sync settings to save.
 * @returns {Promise<any>}
 */
export function saveSyncSettings(settings) {
    return postMessageWithResponse('webview:saveCloudSyncSettings', settings);
}
