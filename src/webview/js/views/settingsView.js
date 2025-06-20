import { dom } from '../state.js';
import * as api from '../api.js';
import { navigateTo, showToast } from '../uiManager.js';

let refreshCallback = () => {};
let hasInitialized = false;

function handleImport() {
    api.postMessageWithResponse('importData')
        .then(() => {
            showToast('数据导入成功！', 'success');
            refreshCallback();
        })
        .catch(err => showToast(`导入失败: ${err.message}`, 'error'));
}

function handleExport() {
    api.postMessageWithResponse('exportData')
        .then(() => showToast('数据已导出', 'success'))
        .catch(err => showToast(`导出失败: ${err.message}`, 'error'));
}

function handleCreateBackup() {
    api.postMessageWithResponse('createBackup')
        .then(result => showToast(`备份已创建: ${result.path}`, 'success'))
        .catch(err => showToast(`备份失败: ${err.message}`, 'error'));
}

function handleRestoreBackup() {
    api.postMessageWithResponse('restoreBackup')
        .then(result => {
            if (result.restored) {
                showToast('备份恢复成功！', 'success');
                refreshCallback();
            }
        })
        .catch(err => showToast(`恢复失败: ${err.message}`, 'error'));
}

function handleToggleWorkspaceMode() {
    api.postMessageWithResponse('toggleWorkspaceMode')
        .then(() => {
            showToast('存储模式已切换', 'success');
            refreshCallback();
        })
        .catch(err => showToast(`切换失败: ${err.message}`, 'error'));
}

function handleSyncToCloud() {
    api.postMessageWithResponse('webview:syncToCloud')
        .catch(err => showToast(`同步失败: ${err.message}`, 'error'));
}

function handleSyncFromCloud() {
    api.postMessageWithResponse('webview:syncFromCloud')
        .then((result) => {
            if (result) {
                refreshCallback();
            }
        })
        .catch(err => showToast(`从云端同步失败: ${err.message}`, 'error'));
}

export function init(refreshFunc) {
    if (hasInitialized) return;

    if (refreshFunc) {
        refreshCallback = refreshFunc;
    }
    const { settingsViewElements: elements } = dom;

    elements.importButton.addEventListener('click', handleImport);
    elements.exportButton.addEventListener('click', handleExport);
    elements.createBackupButton.addEventListener('click', handleCreateBackup);
    elements.restoreBackupButton.addEventListener('click', handleRestoreBackup);
    elements.setupCloudSyncButton.addEventListener('click', () => api.postMessageWithResponse('webview:setupCloudSync'));
    elements.toggleWorkspaceModeButton.addEventListener('click', handleToggleWorkspaceMode);
    elements.showStorageInfoButton.addEventListener('click', () => api.postMessageWithResponse('showStorageInfo'));
    elements.syncToCloudButton.addEventListener('click', handleSyncToCloud);
    elements.syncFromCloudButton.addEventListener('click', handleSyncFromCloud);

    dom.mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
    hasInitialized = true;
} 