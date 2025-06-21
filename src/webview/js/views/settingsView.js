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

    // Hide sync actions when toggling off
    document.getElementById('sync-actions-container').classList.add('hidden');

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

function renderSyncSummary(settings) {
    const { settingsViewElements: elements } = dom;
    const summaryView = elements.syncSummaryView;
    if (!summaryView) return;

    const provider = settings.syncProvider;
    let mainText = '';
    let secondaryText = '';

    switch (provider) {
        case 'github':
            mainText = `已连接到 <strong>GitHub Gist</strong>`;
            secondaryText = `(ID: ${settings.gistId})`;
            break;
        case 'gitee':
            mainText = `已连接到 <strong>Gitee Gist</strong>`;
            secondaryText = `(ID: ${settings.gistId})`;
            break;
        case 'gitlab':
            const gitlabInstance = settings.gitlabUrl === 'https://gitlab.com' ? 'GitLab.com' : settings.gitlabUrl;
            mainText = `已连接到 <strong>${gitlabInstance}</strong>`;
            secondaryText = `(Snippet: ${settings.gistId})`;
            break;
        case 'webdav':
            mainText = `已连接到 <strong>WebDAV</strong>`;
            secondaryText = `(${settings.webdavUsername}@${settings.webdavUrl})`;
            break;
        case 'custom':
            mainText = `已连接到自定义 API`;
            secondaryText = `(URL: <strong>${settings.customApiUrl}</strong>)`;
            break;
        default:
            mainText = '云同步配置无效';
    }

    summaryView.innerHTML = `
        <div class="summary-text-container">
            <span class="summary-text-main">${mainText}</span>
            <span class="summary-text-secondary">${secondaryText}</span>
        </div>
        <div class="summary-actions">
            <span class="status-indicator success"></span>
            <button id="edit-sync-settings-btn" class="btn btn-secondary">修改</button>
        </div>
    `;
    
    // Re-attach listener for the newly created button
    summaryView.querySelector('#edit-sync-settings-btn').addEventListener('click', () => {
        const currentProvider = dom.settingsViewElements.syncProviderSelect.value;
        setSyncConfigLockedState(false, {}, currentProvider); // Pass empty settings object
        showToast('设置已解锁，您可以进行修改。', 'info');
    });
}

function setSyncConfigLockedState(isLocked, settings, provider) {
    const { settingsViewElements: elements } = dom;

    elements.syncSettingsForm.classList.toggle('hidden', isLocked);
    elements.syncSummaryView.classList.toggle('hidden', !isLocked);
    
    // Main select should also be locked
    elements.syncProviderSelect.disabled = isLocked;

    if (isLocked) {
        renderSyncSummary(settings);
        document.getElementById('sync-actions-container').classList.remove('hidden');
    } else {
        document.getElementById('sync-actions-container').classList.add('hidden');
    }
}

function handleSaveSyncSettings() {
    console.log('handleSaveSyncSettings called');
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
    
    const saveButton = elements.saveSyncSettingsButton;
    const originalButtonHtml = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner"></span>正在验证中...`;
    let isSuccess = false;
    
    api.postMessageWithResponse('webview:saveCloudSyncSettings', settings)
        .then(result => {
            if (result.success) {
                isSuccess = true;
                showToast('云同步设置已保存并验证成功!', 'success');
                // The full settings object is in result.data
                setSyncConfigLockedState(true, result.data, provider);

                // Show and highlight the sync actions
                const syncActionsContainer = document.getElementById('sync-actions-container');
                syncActionsContainer.classList.remove('hidden');
                
                const syncButtons = syncActionsContainer.querySelectorAll('.btn');
                syncButtons.forEach(btn => {
                    btn.classList.add('highlight-animation');
                    // Remove animation class after it finishes
                    setTimeout(() => btn.classList.remove('highlight-animation'), 2000);
                });

            } else {
                showToast(`设置失败: ${result.error}`, 'error');
            }
        })
        .catch(err => showToast(`保存失败: ${err.message}`, 'error'))
        .finally(() => {
            if (!isSuccess) {
                saveButton.disabled = false;
                saveButton.innerHTML = originalButtonHtml;
            }
        });
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
        const provider = settings.syncProvider || 'disabled';
        elements.syncProviderSelect.value = provider;
        showProviderConfig(provider);

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
        
        // Lock the UI if the settings are already validated
        if (settings.isValidated) {
            setSyncConfigLockedState(true, settings, provider);
        } else {
            setSyncConfigLockedState(false, settings, provider);
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
    elements.editSyncSettingsButton.addEventListener('click', () => {
        const provider = dom.settingsViewElements.syncProviderSelect.value;
        setSyncConfigLockedState(false, {}, provider);
        showToast('设置已解锁，您可以进行修改。', 'info');
    });

    elements.toggleWorkspaceModeButton.addEventListener('click', handleToggleWorkspaceMode);
    elements.showStorageInfoButton.addEventListener('click', () => api.postMessageWithResponse('showStorageInfo'));
    elements.syncToCloudButton.addEventListener('click', handleSyncToCloud);
    elements.syncFromCloudButton.addEventListener('click', handleSyncFromCloud);

    dom.mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
    hasInitialized = true;
} 