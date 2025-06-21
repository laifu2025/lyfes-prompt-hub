import { dom, state } from '../state.js';
import * as api from '../api.js';
import { navigateTo, renderSettingsStatus } from '../uiManager.js';
import { init as initTooltips } from '../tooltips.js';

let refreshCallback = () => {};
let hasInitialized = false;

function handleImport(files) {
    if (files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        api.postMessageWithResponse('importData', { data: event.target.result })
            .then(() => api.showToast('数据导入成功！', 'success'))
            .catch(err => api.showToast(`导入失败: ${err.message}`, 'error'));
    };
    reader.readAsText(file);
}

function handleExport() {
    api.postMessageWithResponse('exportData')
        .then(() => api.showToast('数据已导出', 'success'))
        .catch(err => api.showToast(`导出失败: ${err.message}`, 'error'));
}

function handleBackup() {
    api.postMessageWithResponse('backupData')
        .then(result => api.showToast(`备份已创建: ${result.path}`, 'success'))
        .catch(err => api.showToast(`备份失败: ${err.message}`, 'error'));
}

function handleRestore() {
    api.postMessageWithResponse('restoreData')
        .then(response => {
            if (response.success) {
                api.showToast('备份恢复成功！', 'success');
            }
        })
        .catch(err => api.showToast(`恢复失败: ${err.message}`, 'error'));
}

function handleStorageChange(event) {
    const newMode = event.target.value;
    api.postMessageWithResponse('setStorageMode', { mode: newMode })
        .then(() => api.showToast('存储模式已切换', 'success'))
        .catch(err => api.showToast(`切换失败: ${err.message}`, 'error'));
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
        default:
            // No specific config to show
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
    document.getElementById('auto-sync-container').classList.add('hidden');

    if (!isEnabled) {
        // If user disables sync, call backend to clear settings
        api.postMessageWithResponse('webview:disableCloudSync')
            .then(() => {
                api.showToast('云同步已禁用', 'success');
                elements.syncProviderSelect.value = 'disabled';
                showProviderConfig('disabled');
            })
            .catch(err => api.showToast(`禁用失败: ${err.message}`, 'error'));
    } else {
        // When user enables sync, show the current provider config or default to disabled
        const currentProvider = elements.syncProviderSelect.value || 'disabled';
        showProviderConfig(currentProvider);
        
        // Ensure the settings form is visible (not locked)
        setSyncConfigLockedState(false, {}, currentProvider);
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
        api.showToast('设置已解锁，您可以进行修改。', 'info');
    });
}

function setSyncConfigLockedState(isLocked, settings, provider) {
    const { settingsViewElements: elements } = dom;

    elements.syncSettingsForm.classList.toggle('hidden', isLocked);
    elements.syncSummaryView.classList.toggle('hidden', !isLocked);
    
    // Main select should also be locked
    elements.syncProviderSelect.disabled = isLocked;

    // Only show auto-sync option when sync is successfully configured
    document.getElementById('auto-sync-container').classList.toggle('hidden', !isLocked);

    if (isLocked) {
        renderSyncSummary(settings);
        document.getElementById('sync-actions-container').classList.remove('hidden');
        // Re-attach listeners here ensures the buttons are in the DOM.
        document.getElementById('sync-to-cloud-btn')?.addEventListener('click', handleSyncToCloud);
        document.getElementById('sync-from-cloud-btn')?.addEventListener('click', handleSyncFromCloud);
    } else {
        // When unlocking, also show the correct provider's config inputs
        showProviderConfig(provider);
        document.getElementById('sync-actions-container').classList.add('hidden');
    }
}

export async function handleSaveSyncSettings() {
    const { settingsViewElements: elements } = dom;
    const saveButton = elements.saveSyncSettingsButton;
    setSaveButtonLoading(true);

    const provider = elements.syncProviderSelect.value;
    const settings = {
        provider: provider,
        token: '',
        gistId: '',
        gitlabUrl: '',
        webdavUrl: '',
        webdavUsername: '',
        customApiUrl: '',
    };

    switch (provider) {
        case 'github':
            settings.token = elements.githubConfig.token.value.trim();
            settings.gistId = elements.githubConfig.gistId.value.trim();
            break;
        case 'gitee':
            settings.token = elements.giteeConfig.token.value.trim();
            settings.gistId = elements.giteeConfig.gistId.value.trim();
            break;
        case 'gitlab':
            settings.token = elements.gitlabConfig.token.value.trim();
            settings.gistId = elements.gitlabConfig.snippetId.value.trim();
            settings.gitlabUrl = elements.gitlabConfig.url.value.trim();
            break;
        case 'webdav':
            settings.token = elements.webdavConfig.password.value.trim();
            settings.webdavUrl = elements.webdavConfig.url.value.trim();
            settings.webdavUsername = elements.webdavConfig.username.value.trim();
            break;
        case 'custom':
            settings.token = elements.customConfig.apiKey.value.trim();
            settings.customApiUrl = elements.customConfig.url.value.trim();
            break;
    }
    
    try {
        const updatedAppData = await api.saveSyncSettings(settings);
        // Update global state
        state.appData = updatedAppData;

        setSyncConfigLockedState(true, updatedAppData.settings, provider);
        renderSettingsStatus(updatedAppData.settings); // Explicitly update status indicators
        highlightSyncActions();
        // Success notification is already handled by the backend as a native VS Code notification
    } catch (error) {
        // Errors are now globally handled and shown as VS Code notifications,
        // so we just need to catch them to prevent unhandled promise rejections.
        // The UI state will remain unlocked for the user to try again.
    } finally {
        setSaveButtonLoading(false);
    }
}

function handleSyncToCloud() {
    api.postMessageWithResponse('webview:syncToCloud')
        .then(result => {
            if (result.success) {
                // Success notification is already handled by the backend as a native VS Code notification
            }
        })
        .catch(err => {
            // Error is handled by the backend and displayed as a native VS Code notification.
            console.error('Sync to cloud failed:', err);
        });
}

function handleSyncFromCloud() {
    api.postMessageWithResponse('webview:syncFromCloud')
        .then(result => {
            if (result.success) {
                // Success notification is already handled by the backend as a native VS Code notification
            }
        })
        .catch(err => {
            // Error is handled by the backend and displayed as a native VS Code notification.
             console.error('Sync from cloud failed:', err);
        });
}

function handleAutoSyncToggle(event) {
    const isEnabled = event.target.checked;
    api.postMessageWithResponse('webview:setSetting', { key: 'autoSync', value: isEnabled })
        .then(() => {
            api.showNotification(`自动同步已${isEnabled ? '开启' : '关闭'}`, 'info');
        })
        .catch(err => {
            api.showNotification(`操作失败: ${err.message}`, 'error');
            // Revert the checkbox state on failure
            event.target.checked = !isEnabled;
        });
}

export function updateCloudSyncView(settings) {
    const { settingsViewElements: elements } = dom;
    if (!elements.cloudSyncEnabledToggle) {
        return;
    }

    elements.cloudSyncEnabledToggle.checked = settings.cloudSync;
    elements.cloudSyncConfigContainer.classList.toggle('hidden', !settings.cloudSync);

    const isConfiguredAndEnabled = settings.syncProvider && settings.syncProvider !== 'disabled' && settings.gistId;

    setSyncConfigLockedState(isConfiguredAndEnabled, settings, settings.syncProvider);

    if (settings.syncProvider) {
        elements.syncProviderSelect.value = settings.syncProvider;
        // 确保显示正确的配置表单
        showProviderConfig(settings.syncProvider);
    } else {
        elements.syncProviderSelect.value = 'disabled';
        // 如果云同步开启但没有配置提供商，显示默认的配置选择
        if (settings.cloudSync) {
            showProviderConfig('disabled');
        }
    }

    // Update auto-sync toggle state
    const autoSyncToggle = document.getElementById('auto-sync-toggle');
    if (autoSyncToggle) {
        autoSyncToggle.checked = !!settings.autoSync;
    }
    
    // Fill in existing values if present
    if (settings.syncProvider === 'github' && elements.githubConfig.gistId) {
        elements.githubConfig.gistId.value = settings.gistId || '';
    } else if (settings.syncProvider === 'gitee' && elements.giteeConfig.gistId) {
        elements.giteeConfig.gistId.value = settings.gistId || '';
    } else if (settings.syncProvider === 'gitlab' && elements.gitlabConfig.snippetId) {
        elements.gitlabConfig.snippetId.value = settings.gistId || '';
        elements.gitlabConfig.url.value = settings.gitlabUrl || '';
    } else if (settings.syncProvider === 'webdav' && elements.webdavConfig.url) {
        elements.webdavConfig.url.value = settings.webdavUrl || '';
        elements.webdavConfig.username.value = settings.webdavUsername || '';
    } else if (settings.syncProvider === 'custom' && elements.customConfig.url) {
        elements.customConfig.url.value = settings.customApiUrl || '';
    }

    renderSettingsStatus(settings);
    highlightSyncActions();
}

function setSaveButtonLoading(isLoading) {
    const saveButton = dom.settingsViewElements.saveSyncSettingsButton;
    if (isLoading) {
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner"></span> 验证中...';
    } else {
        saveButton.disabled = false;
        saveButton.textContent = '保存并验证';
    }
}

export function init(refreshFunc) {
    if (hasInitialized) return;
    refreshCallback = refreshFunc;
    const { mainViewElements, editViewElements, settingsViewElements: elements, filterViewElements } = dom;

    // Back buttons
    Array.from(document.querySelectorAll('.btn-back')).forEach(btn => {
        btn.addEventListener('click', () => navigateTo('main'));
    });

    // Main buttons
    mainViewElements.addPromptButton.addEventListener('click', () => navigateTo('edit', { isNew: true }));
    mainViewElements.manageCategoriesButton.addEventListener('click', () => navigateTo('category'));
    mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
    mainViewElements.filterButton.addEventListener('click', () => navigateTo('filter'));

    // Data Management listeners
    elements.importButton.addEventListener('click', () => elements.importInput.click());
    elements.importInput.addEventListener('change', (event) => handleImport(event.target.files));
    elements.exportButton.addEventListener('click', handleExport);
    elements.createBackupButton.addEventListener('click', handleBackup);
    elements.restoreBackupButton.addEventListener('click', handleRestore);
    
    // Cloud Sync listeners
    elements.saveSyncSettingsButton.addEventListener('click', handleSaveSyncSettings);
    elements.cloudSyncEnabledToggle.addEventListener('change', handleSyncToggle);
    elements.syncProviderSelect.addEventListener('change', handleProviderChange);
    document.getElementById('auto-sync-toggle').addEventListener('change', handleAutoSyncToggle);

    // Init tooltips
    initTooltips();
    
    hasInitialized = true;
}

function highlightSyncActions() {
    const syncToCloudBtn = document.getElementById('sync-to-cloud-btn');
    const syncFromCloudBtn = document.getElementById('sync-from-cloud-btn');
    if (!syncToCloudBtn || !syncFromCloudBtn || !state.appData?.metadata?.lastModified) return;

    const lastModified = new Date(state.appData.metadata.lastModified);
    
    if (state.appData.settings.lastSyncTimestamp) {
        const lastSync = new Date(state.appData.settings.lastSyncTimestamp);
        if (lastModified > lastSync) {
            syncToCloudBtn.classList.add('highlight');
        } else {
            syncToCloudBtn.classList.remove('highlight');
        }
    } else {
        // No sync has ever happened, so highlight upload
        syncToCloudBtn.classList.add('highlight');
    }
} 