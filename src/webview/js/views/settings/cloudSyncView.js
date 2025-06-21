import { dom, state } from '../../state.js';
import * as api from '../../api.js';
import { renderSettingsStatus } from '../../uiManager.js';

/**
 * 云同步模块 - 负责处理所有云同步相关功能
 * 
 * 职责：
 * - 管理云同步开关和配置
 * - 处理各种同步提供商的配置
 * - 执行同步操作（上传/下载）
 * - 管理自动同步设置
 * - 提供云同步相关的UI交互
 */

let isInitialized = false;

/**
 * 显示指定提供商的配置界面
 * @param {string} provider - 同步提供商名称
 */
function showProviderConfig(provider) {
    // 首先隐藏所有提供商配置
    const { settingsViewElements: elements } = dom;
    Object.values(elements).forEach(el => {
        if (el && el.container && el.container.classList.contains('provider-config')) {
            el.container.classList.add('hidden');
        }
    });

    // 显示选中的配置界面
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
            // 没有特定配置需要显示
            break;
    }
}

/**
 * 处理同步提供商变更
 * @param {Event} event - 事件对象
 */
function handleProviderChange(event) {
    showProviderConfig(event.target.value);
}

/**
 * 处理云同步开关切换
 * @param {Event} event - 事件对象
 */
function handleSyncToggle(event) {
    const { settingsViewElements: elements } = dom;
    const isEnabled = event.target.checked;
    
    elements.cloudSyncConfigContainer.classList.toggle('hidden', !isEnabled);

    // 切换关闭时隐藏同步操作
    document.getElementById('sync-actions-container').classList.add('hidden');
    document.getElementById('auto-sync-container').classList.add('hidden');

    if (!isEnabled) {
        // 用户禁用同步时，清除后端设置
        api.postMessageWithResponse('webview:disableCloudSync')
            .then(() => {
                api.showToast('云同步已禁用', 'success');
                elements.syncProviderSelect.value = 'disabled';
                showProviderConfig('disabled');
            })
            .catch(err => api.showToast(`禁用失败: ${err.message}`, 'error'));
    } else {
        // 用户启用同步时，显示当前提供商配置或默认为禁用
        const currentProvider = elements.syncProviderSelect.value || 'disabled';
        showProviderConfig(currentProvider);
        
        // 确保设置表单可见（未锁定）
        setSyncConfigLockedState(false, {}, currentProvider);
    }
}

/**
 * 渲染同步摘要信息
 * @param {Object} settings - 同步设置
 */
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
    
    // 为新创建的按钮重新绑定事件监听器
    summaryView.querySelector('#edit-sync-settings-btn').addEventListener('click', () => {
        const currentProvider = dom.settingsViewElements.syncProviderSelect.value;
        setSyncConfigLockedState(false, {}, currentProvider);
        api.showToast('设置已解锁，您可以进行修改。', 'info');
    });
}

/**
 * 设置同步配置的锁定状态
 * @param {boolean} isLocked - 是否锁定
 * @param {Object} settings - 设置对象
 * @param {string} provider - 提供商名称
 */
function setSyncConfigLockedState(isLocked, settings, provider) {
    const { settingsViewElements: elements } = dom;

    elements.syncSettingsForm.classList.toggle('hidden', isLocked);
    elements.syncSummaryView.classList.toggle('hidden', !isLocked);
    
    // 主选择器也应该被锁定
    elements.syncProviderSelect.disabled = isLocked;

    // 只有在同步成功配置后才显示自动同步选项
    document.getElementById('auto-sync-container').classList.toggle('hidden', !isLocked);

    if (isLocked) {
        renderSyncSummary(settings);
        document.getElementById('sync-actions-container').classList.remove('hidden');
        // 注意：不在这里绑定事件监听器，因为它们应该在init时只绑定一次
        // 动态按钮的监听器将在renderSyncSummary中处理
    } else {
        // 解锁时，也显示正确的提供商配置输入
        showProviderConfig(provider);
        document.getElementById('sync-actions-container').classList.add('hidden');
    }
}

/**
 * 保存同步设置
 */
export async function handleSaveSyncSettings() {
    const { settingsViewElements: elements } = dom;
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

    // 根据不同提供商收集配置信息
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
        // 更新全局状态
        state.appData = updatedAppData;

        setSyncConfigLockedState(true, updatedAppData.settings, provider);
        highlightSyncActions();
        // 成功通知已由后端处理为原生VS Code通知
    } catch (error) {
        // 错误现在全局处理并显示为VS Code通知，
        // 所以我们只需要捕获它们以防止未处理的promise拒绝。
        // UI状态将保持解锁，供用户重试。
    } finally {
        setSaveButtonLoading(false);
    }
}

/**
 * 同步到云端
 */
function handleSyncToCloud() {
    api.postMessageWithResponse('webview:syncToCloud')
        .then(result => {
            if (result.success) {
                // 成功通知已由后端处理为原生VS Code通知
            }
        })
        .catch(err => {
            // 错误由后端处理并显示为原生VS Code通知
            console.error('同步到云端失败:', err);
        });
}

/**
 * 从云端同步
 */
function handleSyncFromCloud() {
    api.postMessageWithResponse('webview:syncFromCloud')
        .then(result => {
            if (result.success) {
                // 成功通知已由后端处理为原生VS Code通知
            }
        })
        .catch(err => {
            // 错误由后端处理并显示为原生VS Code通知
            console.error('从云端同步失败:', err);
        });
}

/**
 * 重置云同步设置
 */
function handleResetCloudSync() {
    if (confirm('确定要重置云同步设置吗？\n\n这将：\n• 关闭云同步功能\n• 清除所有保存的Token和密码\n• 重置所有云同步相关配置\n\n此操作不可撤销！')) {
        api.postMessageWithResponse('webview:resetCloudSync')
            .then(result => {
                if (result.success) {
                    // 成功通知已由后端处理为原生VS Code通知
                    console.log('云同步设置已重置');
                }
            })
            .catch(err => {
                api.showNotification(`重置失败: ${err.message}`, 'error');
                console.error('重置云同步设置失败:', err);
            });
    }
}

/**
 * 处理自动同步开关切换
 * @param {Event} event - 事件对象
 */
function handleAutoSyncToggle(event) {
    const isEnabled = event.target.checked;
    api.postMessageWithResponse('webview:setSetting', { key: 'autoSync', value: isEnabled })
        .then(() => {
            api.showNotification(`自动同步已${isEnabled ? '开启' : '关闭'}`, 'info');
        })
        .catch(err => {
            api.showNotification(`操作失败: ${err.message}`, 'error');
            // 失败时恢复复选框状态
            event.target.checked = !isEnabled;
        });
}

/**
 * 设置保存按钮的加载状态
 * @param {boolean} isLoading - 是否加载中
 */
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

/**
 * 高亮同步操作按钮（根据数据修改状态）
 */
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
        // 从未同步过，所以高亮上传按钮
        syncToCloudBtn.classList.add('highlight');
    }
}

/**
 * 更新云同步视图
 * @param {Object} settings - 设置对象
 */
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

    // 更新自动同步开关状态
    const autoSyncToggle = document.getElementById('auto-sync-toggle');
    if (autoSyncToggle) {
        autoSyncToggle.checked = !!settings.autoSync;
    }
    
    // 填入现有值（如果存在）
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

    highlightSyncActions();
}

/**
 * 初始化云同步模块
 * - 绑定事件监听器
 * - 设置UI交互逻辑
 */
export function init() {
    if (isInitialized) return;
    
    const { settingsViewElements: elements } = dom;
    
    // 绑定云同步相关事件监听器
    elements.saveSyncSettingsButton.addEventListener('click', handleSaveSyncSettings);
    elements.cloudSyncEnabledToggle.addEventListener('change', handleSyncToggle);
    elements.syncProviderSelect.addEventListener('change', handleProviderChange);
    document.getElementById('auto-sync-toggle').addEventListener('change', handleAutoSyncToggle);
    
    // 绑定同步操作按钮的事件监听器（只绑定一次）
    const syncToCloudBtn = document.getElementById('sync-to-cloud-btn');
    const syncFromCloudBtn = document.getElementById('sync-from-cloud-btn');
    if (syncToCloudBtn) {
        syncToCloudBtn.addEventListener('click', handleSyncToCloud);
    }
    if (syncFromCloudBtn) {
        syncFromCloudBtn.addEventListener('click', handleSyncFromCloud);
    }
    
    isInitialized = true;
    console.log('云同步模块已初始化');
}

/**
 * 重置模块状态（用于测试或重新初始化）
 */
export function reset() {
    isInitialized = false;
}

// 导出供外部使用的函数
export {
    showProviderConfig,
    handleProviderChange,
    handleSyncToggle,
    handleSyncToCloud,
    handleSyncFromCloud,
    handleAutoSyncToggle,
    setSyncConfigLockedState,
    highlightSyncActions
}; 