import { state } from './state.js';
import { initializeApiListener, postMessageWithResponse } from './api.js';
import { initEventListeners } from './eventHandlers.js';
import * as ui from './uiManager.js';

/**
 * The main application entry point.
 */
function main() {
    // 1. Initialize the listener for messages from the extension backend.
    // Pass in the functions it needs to call from other modules.
    initializeApiListener(initialLoad, ui.renderAll, ui.renderSettingsStatus);

    // 2. Initialize all our event listeners for user interaction.
    initEventListeners();

    // 3. Perform the initial data load from the extension.
    initialLoad();
}

/**
 * Fetches all necessary data from the backend and triggers the initial render.
 */
async function initialLoad() {
    try {
        const response = await postMessageWithResponse('getAppData');
        if (response.data) {
            state.appData = response.data;
            state.prompts = response.data.prompts || [];
            ui.renderAll();
        } else {
            throw new Error("No data received from backend.");
        }
    } catch (error) {
        console.error("Error during initial load:", error);
        ui.showToast(error.message || '获取数据失败', 'error');
    }
}

// Start the application once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', main);
