const vscode = acquireVsCodeApi();
const pendingRequests = new Map();
let requestIdCounter = 0;

/**
 * A map to store event listeners for messages from the backend.
 * @type {Map<string, Set<Function>>}
 */
const eventListeners = new Map();

/**
 * Sends a message to the extension host and returns a promise that resolves with the response.
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
 * Registers a listener for a specific event type from the backend.
 * @param {string} eventType - The type of the event to listen for.
 * @param {Function} callback - The function to call when the event is received.
 * @returns {Function} An unsubscribe function.
 */
export function on(eventType, callback) {
    if (!eventListeners.has(eventType)) {
        eventListeners.set(eventType, new Set());
    }
    eventListeners.get(eventType).add(callback);

    // Return an unsubscribe function
    return () => {
        eventListeners.get(eventType)?.delete(callback);
    };
}

/**
 * Emits an event to all registered listeners.
 * @param {string} eventType - The type of the event.
 * @param {any} data - The data to pass to the listeners.
 */
function emit(eventType, data) {
    if (eventListeners.has(eventType)) {
        eventListeners.get(eventType).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${eventType}:`, error);
            }
        });
    }
}

/**
 * Initializes the message listener to handle communication from the extension.
 */
export function initializeApi() {
    window.addEventListener('message', event => {
        const message = event.data;
        const { requestId, type, ...response } = message;

        // Handle responses to requests made from the webview
        if (requestId && pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = pendingRequests.get(requestId);
            pendingRequests.delete(requestId);
            if (response.success === false) {
                console.error(`Request ${requestType} (${requestId}) failed:`, response.error);
                reject(new Error(response.error || `操作 '${requestType}' 失败`));
            } else {
                resolve(response);
            }
        } 
        // Handle events/pushes from the backend
        else if (type) {
            emit(type, response);
        }
    });
}
