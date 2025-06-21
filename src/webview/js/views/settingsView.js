import { dom, state } from '../state.js';
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

// --- New Cloud Sync UI Logic ---

function showProviderConfig(provider) {
    // Hide all provider configs first
    const { settingsViewElements: elements } = dom;
    Object.values(elements).forEach(el => {
        if (el && el.container && el.container.classList.contains('provider-config')) {
            el.container.classList.add('hidden');
        }
    });

    // Show the selected one
    switch (provider) {
        case 'github':
            elements.githubConfig.container.classList.remove('hidden');
            break;
        case 'gitee':
            elements.giteeConfig.container.classList.remove('hidden');
            break;
        case 'gitlab':
            elements.gitlabConfig.container.classList.remove('hidden');
            break;
        case 'webdav':
            elements.webdavConfig.container.classList.remove('hidden');
            break;
        case 'custom':
            elements.customConfig.container.classList.remove('hidden');
            break;
    }
}

function handleProviderChange(event) {
    showProviderConfig(event.target.value);
}

function handleSyncToggle(event) {
    const { settingsViewElements: elements } = dom;
    const isEnabled = event.target.checked;
    elements.cloudSyncConfigContainer.classList.toggle('hidden', !isEnabled);

    if (!isEnabled) {
        // If user disables sync, call backend to clear settings
        api.postMessageWithResponse('webview:disableCloudSync')
            .then(() => {
                showToast('云同步已禁用', 'success');
                elements.syncProviderSelect.value = 'disabled';
                showProviderConfig('disabled');
            })
            .catch(err => showToast(`禁用失败: ${err.message}`, 'error'));
    }
}

function handleSaveSyncSettings() {
    const { settingsViewElements: elements } = dom;
    const provider = elements.syncProviderSelect.value;
    if (provider === 'disabled') {
        showToast('请先选择一个同步服务商', 'error');
        return;
    }

    const settings = { provider };

    switch (provider) {
        case 'github':
            settings.token = elements.githubConfig.token.value;
            settings.gistId = elements.githubConfig.gistId.value;
            break;
        case 'gitee':
            settings.token = elements.giteeConfig.token.value;
            settings.gistId = elements.giteeConfig.gistId.value;
            break;
        case 'gitlab':
            settings.gitlabUrl = elements.gitlabConfig.url.value;
            settings.token = elements.gitlabConfig.token.value;
            settings.gistId = elements.gitlabConfig.snippetId.value; // Note the ID mismatch
            break;
        case 'webdav':
            settings.webdavUrl = elements.webdavConfig.url.value;
            settings.webdavUsername = elements.webdavConfig.username.value;
            settings.webdavPassword = elements.webdavConfig.password.value;
            break;
        case 'custom':
            settings.customApiUrl = elements.customConfig.url.value;
            settings.apiKey = elements.customConfig.apiKey.value;
            break;
    }
    
    api.postMessageWithResponse('webview:saveCloudSyncSettings', settings)
        .then(result => {
            if (result.success) {
                showToast('云同步设置已保存并验证成功!', 'success');
                // Clear password/token fields after successful save for security
                Object.values(elements).forEach(el => {
                    if (el && el.token) el.token.value = '';
                    if (el && el.password) el.password.value = '';
                    if (el && el.apiKey) el.apiKey.value = '';
                });
            } else {
                showToast(`设置失败: ${result.error}`, 'error');
            }
        })
        .catch(err => showToast(`保存失败: ${err.message}`, 'error'));
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

export function updateCloudSyncView(settings) {
    if (!settings) return;
    const { settingsViewElements: elements } = dom;

    const isEnabled = settings.cloudSync;
    elements.cloudSyncEnabledToggle.checked = isEnabled;
    elements.cloudSyncConfigContainer.classList.toggle('hidden', !isEnabled);
    
    if (isEnabled) {
        elements.syncProviderSelect.value = settings.syncProvider || 'disabled';
        showProviderConfig(settings.syncProvider);

        // Populate non-sensitive fields
        if (settings.syncProvider === 'github') {
            elements.githubConfig.gistId.value = settings.gistId || '';
        }
        if (settings.syncProvider === 'gitee') {
            elements.giteeConfig.gistId.value = settings.gistId || '';
        }
        if (settings.syncProvider === 'gitlab') {
            elements.gitlabConfig.url.value = settings.gitlabUrl || '';
            elements.gitlabConfig.snippetId.value = settings.gistId || '';
        }
        if (settings.syncProvider === 'webdav') {
            elements.webdavConfig.url.value = settings.webdavUrl || '';
            elements.webdavConfig.username.value = settings.webdavUsername || '';
        }
        if (settings.syncProvider === 'custom') {
            elements.customConfig.url.value = settings.customApiUrl || '';
        }
    }
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
    
    // New cloud sync event listeners
    elements.cloudSyncEnabledToggle.addEventListener('change', handleSyncToggle);
    elements.syncProviderSelect.addEventListener('change', handleProviderChange);
    elements.saveSyncSettingsButton.addEventListener('click', handleSaveSyncSettings);

    elements.toggleWorkspaceModeButton.addEventListener('click', handleToggleWorkspaceMode);
    elements.showStorageInfoButton.addEventListener('click', () => api.postMessageWithResponse('showStorageInfo'));
    elements.syncToCloudButton.addEventListener('click', handleSyncToCloud);
    elements.syncFromCloudButton.addEventListener('click', handleSyncFromCloud);

    dom.mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
    hasInitialized = true;
} 