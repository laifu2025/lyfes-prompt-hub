let app;
let api;
let ui;

/**
 * Initializes the Settings View module.
 * @param {object} context - The application context.
 */
export function initSettingsView(context) {
    app = context.app;
    api = context.api;
    ui = context.ui;
    
    initEventListeners();
    fetchAndRenderSettingsStatus();
}

/**
 * Sets up event listeners for the settings view.
 */
function initEventListeners() {
    ui.dom.importBtn.addEventListener('click', () => handleDataAction('importData', true));
    ui.dom.exportBtn.addEventListener('click', () => handleDataAction('exportData'));
    
    // Bind all data action buttons
    document.getElementById('create-backup-btn').addEventListener('click', () => handleDataAction('createBackup'));
    document.getElementById('restore-backup-btn').addEventListener('click', () => handleRestoreBackup());
    document.getElementById('setup-cloud-sync-btn').addEventListener('click', () => handleDataAction('setupCloudSync', true));
    document.getElementById('sync-to-cloud-btn').addEventListener('click', () => handleDataAction('syncToCloud'));
    document.getElementById('sync-from-cloud-btn').addEventListener('click', () => handleDataAction('syncFromCloud', true));
    document.getElementById('toggle-workspace-mode-btn').addEventListener('click', () => handleDataAction('toggleWorkspaceMode', true));
    document.getElementById('show-storage-info-btn').addEventListener('click', () => handleDataAction('showStorageInfo'));
}

/**
 * A generic handler for simple data operations that show notifications on success/failure.
 * @param {string} action - The API action to call.
 * @param {boolean} [refresh=false] - Whether to refresh data on success.
 */
async function handleDataAction(action, refresh = false) {
    try {
        ui.showToast('正在处理...', 'info');
        const response = await api.postMessageWithResponse(action);
        if (response.success) {
            ui.showToast('操作成功!', 'success');
            if (refresh) {
                app.initialLoad();
            }
        } else {
            throw new Error(response.error || '未知错误');
        }
    } catch (error) {
        ui.showToast(`操作失败: ${error.message}`, 'error');
    }
}

/**
 * Handles the restore backup flow.
 */
async function handleRestoreBackup() {
    try {
        const response = await api.postMessageWithResponse('getBackupList');
        if (!response.success || response.data.length === 0) {
            ui.showToast('没有可用的备份文件', 'info');
            return;
        }

        // This would typically involve showing a custom modal or quick pick in the UI.
        // For simplicity, we'll ask the extension to handle it.
        const restored = await api.postMessageWithResponse('restoreBackup');
        if (restored.success) {
            ui.showToast('备份恢复成功!', 'success');
            app.initialLoad();
        } else if (restored.error) {
            // If there's an error (e.g., user cancelled), show it.
            ui.showToast(`恢复操作: ${restored.error}`, 'info');
        }
    } catch (error) {
        ui.showToast(`恢复失败: ${error.message}`, 'error');
    }
}

/**
 * Fetches the latest system status from the backend and renders it.
 */
async function fetchAndRenderSettingsStatus() {
    try {
        const response = await api.postMessageWithResponse('getSystemStatus');
        if (response.success && response.data) {
            app.appData.systemStatus = response.data;
            renderSettingsStatus(response.data);
        }
    } catch (error) {
        console.error('Failed to fetch system status:', error);
    }
}

/**
 * Renders the status indicators in the settings view.
 * @param {object} status - The system status object from the backend.
 */
export function renderSettingsStatus(status) {
    const storageModeStatus = document.getElementById('storage-mode-status');
    const cloudSyncStatus = document.getElementById('cloud-sync-status');
    // ... other status elements

    const updateBadge = (element, text, statusType) => {
        if (!element) return;
        element.textContent = text;
        element.className = `status-badge ${statusType}`;
    };

    if (status.storageMode) {
        updateBadge(storageModeStatus, status.storageMode === 'workspace' ? '工作区' : '全局', 'info');
    }

    if (status.cloudSync) {
        const syncStatus = status.cloudSync.configured ? '已配置' : '未配置';
        const syncType = status.cloudSync.configured ? 'success' : 'warning';
        updateBadge(cloudSyncStatus, syncStatus, syncType);
    }
}
