/**
 * @module api
 * @description Handles all communication with the VS Code extension host.
 */

const vscode = acquireVsCodeApi();
const pendingRequests = new Map();
let requestIdCounter = 0;

/**
 * Posts a message to the extension host and returns a Promise that resolves with the response.
 * @param {string} type - The type of the message.
 * @param {object} [payload={}] - The data to send with the message.
 * @returns {Promise<any>} A promise that resolves with the response from the extension.
 */
export function postMessageWithResponse(type, payload = {}) {
    return new Promise((resolve, reject) => {
        const requestId = `webview-${requestIdCounter++}`;
        pendingRequests.set(requestId, { resolve, reject, type });
        vscode.postMessage({ type, requestId, ...payload });
    });
}

/**
 * Initializes the main message listener to handle responses from the extension host
 * and dispatches events for other modules to listen to.
 */
export function initializeApiListener() {
    window.addEventListener('message', event => {
        const message = event.data;
        const { requestId, type, ...response } = message;

        // Handle responses to specific requests
        if (pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = pendingRequests.get(requestId);
            pendingRequests.delete(requestId);
            if (response.success === false) {
                console.error(`Request ${requestType} (${requestId}) failed:`, response.error);
                reject(new Error(response.error || `操作 '${requestType}' 失败`));
            } else {
                resolve(response);
            }
            return;
        }

        // Handle generic messages or pushes from the backend by dispatching custom events
        const eventName = `vscode-${type}`;
        document.body.dispatchEvent(new CustomEvent(eventName, { detail: response }));
    });
}

/**
 * A simpler postMessage for when no response is expected.
 * @param {string} type - The type of the message.
 * @param {object} [payload={}] - The data to send with the message.
 */
export function postMessage(type, payload = {}) {
    vscode.postMessage({ type, ...payload });
} 