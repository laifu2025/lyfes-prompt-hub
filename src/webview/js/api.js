import { state } from './state.js';

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
        state.vscode.postMessage({ type, requestId, ...payload });
    });
}

/**
 * Initializes the main message listener to handle responses from the extension.
 * This is a critical part of the API layer.
 * @param {function} initialLoad - A function to be called when a refresh is requested.
 * @param {function} renderAll - A function to render the entire UI.
 * @param {function} renderSettingsStatus - A function to update settings status.
 */
export function initializeApiListener(initialLoad, renderAll, renderSettingsStatus) {
    window.addEventListener('message', event => {
        const message = event.data;
        const { requestId, type, ...response } = message;

        if (state.pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = state.pendingRequests.get(requestId);
            state.pendingRequests.delete(requestId);
            if (response.success === false) {
                console.error(`Request ${requestType} (${requestId}) failed:`, response.error);
                reject(new Error(response.error || `操作 '${requestType}' 失败`));
            } else {
                resolve(response);
            }
        } else {
            // Handle messages initiated by the backend
            switch (type) {
                case 'error':
                    console.error('Received an error from the backend:', response.message);
                    // We might need a UI function to show this error, e.g., showToast
                    break;
                case 'requestRefresh':
                    initialLoad();
                    state.vscode.postMessage({
                        type: 'showNotification',
                        message: '数据已刷新',
                        notificationType: 'info'
                    });
                    break;
                case 'appDataResponse': // E.g., for manual refresh or push updates
                     if (response.data) {
                        state.appData = response.data;
                        state.prompts = response.data.prompts;
                        renderAll();
                     }
                    break;
                case 'systemStatusUpdated':
                    if (response.data) {
                        renderSettingsStatus(response.data);
                    }
                    break;
            }
        }
    });
}
