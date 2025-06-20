import { dom } from '../state.js';
import * as api from '../api.js';
import { navigateTo } from '../uiManager.js';

function setupDataManagementListeners() {
    dom.settingsViewElements.importButton.addEventListener('click', () => {
        api.postMessage({ command: 'importData' });
    });

    dom.settingsViewElements.exportButton.addEventListener('click', () => {
        api.postMessage({ command: 'exportData' });
    });

    dom.settingsViewElements.createBackupButton.addEventListener('click', () => {
        api.postMessage({ command: 'createBackup' });
    });

    dom.settingsViewElements.restoreBackupButton.addEventListener('click', () => {
        api.postMessage({ command: 'restoreBackup' });
    });
}

function setupCloudSyncListeners() {
    dom.settingsViewElements.setupCloudSyncButton.addEventListener('click', () => {
        api.postMessage({ command: 'setupCloudSync' });
    });

    dom.settingsViewElements.syncToCloudButton.addEventListener('click', () => {
        api.postMessage({ command: 'syncToCloud' });
    });

    dom.settingsViewElements.syncFromCloudButton.addEventListener('click', () => {
        api.postMessage({ command: 'syncFromCloud' });
    });
}

function setupStorageModeListeners() {
    dom.settingsViewElements.toggleWorkspaceModeButton.addEventListener('click', () => {
        api.postMessage({ command: 'toggleWorkspaceMode' });
    });
     dom.settingsViewElements.showStorageInfoButton.addEventListener('click', () => {
        api.postMessage({ command: 'getStorageInfo' });
    });
}

export function init() {
    dom.mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
    
    setupDataManagementListeners();
    setupCloudSyncListeners();
    setupStorageModeListeners();
} 