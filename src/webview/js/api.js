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

        if (state.pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = state.pendingRequests.get(requestId);
            state.pendingRequests.delete(requestId);
            if (response.success === false || message.success === false) { // Check both for robustness
                const errorMsg = response.error || response.message || `操作 '${requestType}' 失败`;
                console.error(`Request ${requestType} (${requestId}) failed:`, errorMsg);
                reject(new Error(errorMsg));
            } else {
                resolve(response.data !== undefined ? response.data : response);
            }
        } else {
             // Messages initiated by the backend (e.g., manual refresh from VS Code command)
            if (type === 'appDataResponse' && message.isRefresh) {
                // This is a special case for manual refresh.
                // We'll dispatch a custom event that the app can listen to.
                window.dispatchEvent(new CustomEvent('manualRefresh', { detail: message.data }));
            } else if (type === 'error') {
                 console.error('Received an error from the backend:', message.message);
                 window.dispatchEvent(new CustomEvent('backendError', { detail: message.message }));
            }
        }
    });
}
