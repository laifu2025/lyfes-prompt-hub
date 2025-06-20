import { state } from './state.js';

const eventListeners = new Map();

/**
 * Register a listener for a specific event type from the backend.
 * @param {string} eventName The name of the event to listen for.
 * @param {function} callback The function to call when the event is triggered.
 */
export function on(eventName, callback) {
    if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, []);
    }
    eventListeners.get(eventName).push(callback);
}

/**
 * Emits an event, calling all registered listeners for that event.
 * @param {string} eventName The name of the event to emit.
 * @param {any} data The data to pass to the listeners.
 */
function emit(eventName, data) {
    if (eventListeners.has(eventName)) {
        eventListeners.get(eventName).forEach(callback => callback(data));
    }
}

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
 * This is a critical part of the API layer.
 */
export function initializeApiListener() {
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
                // If the response contains data (like after a save), emit an update event
                if (response.data) {
                    emit('appDataUpdated', response.data);
                }
                resolve(response);
            }
        } else {
            // Handle messages initiated by the backend by emitting events
            switch (type) {
                case 'error':
                    console.error('Received an error from the backend:', response.message);
                    emit('error', response.message);
                    break;
                case 'requestRefresh':
                    emit('requestRefresh');
                    break;
                case 'appDataResponse': // E.g., for manual refresh or push updates
                    emit('appDataUpdated', response.data);
                    break;
                case 'systemStatusUpdated':
                    emit('systemStatusUpdated', response.data);
                    break;
            }
        }
    });
}
