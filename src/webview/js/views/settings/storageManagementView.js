import * as api from '../../api.js';

/**
 * 存储管理模块 - 负责处理存储模式切换和存储信息管理
 * 
 * 职责：
 * - 管理存储模式的切换
 * - 显示存储信息和状态
 * - 提供存储相关的UI交互
 */

let isInitialized = false;

/**
 * 处理存储模式切换
 * @param {Event} event - 事件对象
 */
function handleStorageChange(event) {
    const newMode = event.target.value;
    api.postMessageWithResponse('setStorageMode', { mode: newMode })
        .then(() => api.showToast('存储模式已切换', 'success'))
        .catch(err => api.showToast(`切换失败: ${err.message}`, 'error'));
}

/**
 * 处理工作区模式切换
 */
function handleToggleWorkspaceMode() {
    api.postMessageWithResponse('toggleWorkspaceMode')
        .then(() => api.showToast('存储模式已切换', 'success'))
        .catch(err => api.showToast(`切换失败: ${err.message}`, 'error'));
}

/**
 * 显示存储信息
 */
function handleShowStorageInfo() {
    api.postMessageWithResponse('getStorageInfo')
        .then(info => {
            // 这里可以显示存储信息的详细对话框或toast
            api.showToast('存储信息已获取', 'info');
        })
        .catch(err => api.showToast(`获取存储信息失败: ${err.message}`, 'error'));
}

/**
 * 更新存储状态显示
 * @param {Object} settings - 设置对象
 */
function updateStorageStatus(settings) {
    const statusElement = document.getElementById('storage-mode-status');
    if (statusElement && settings.storageMode) {
        statusElement.textContent = settings.storageMode === 'workspace' ? '工作区模式' : '全局模式';
        statusElement.className = `status-badge ${settings.storageMode === 'workspace' ? 'success' : 'info'}`;
    }
}

/**
 * 获取存储管理相关的DOM元素
 * @returns {Object} DOM元素对象
 */
function getElements() {
    return {
        toggleWorkspaceModeButton: document.getElementById('toggle-workspace-mode-btn'),
        showStorageInfoButton: document.getElementById('show-storage-info-btn'),
        storageModeStatus: document.getElementById('storage-mode-status')
    };
}

/**
 * 初始化存储管理模块
 * - 绑定事件监听器
 * - 设置UI交互逻辑
 */
export function init() {
    if (isInitialized) return;
    
    const elements = getElements();
    
    // 绑定事件监听器
    if (elements.toggleWorkspaceModeButton) {
        elements.toggleWorkspaceModeButton.addEventListener('click', handleToggleWorkspaceMode);
    }
    
    // show-storage-info-btn 事件绑定已在 eventHandlers.js 中全局处理
    // 移除重复绑定以避免冲突
    
    isInitialized = true;
    console.log('存储管理模块已初始化');
}

/**
 * 更新存储管理视图
 * @param {Object} settings - 设置对象
 */
export function updateView(settings) {
    updateStorageStatus(settings);
}

/**
 * 重置模块状态（用于测试或重新初始化）
 */
export function reset() {
    isInitialized = false;
}

// 导出供外部使用的函数
export {
    handleStorageChange,
    handleToggleWorkspaceMode,
    handleShowStorageInfo,
    updateStorageStatus
}; 