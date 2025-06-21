import { dom, state } from '../state.js';
import * as api from '../api.js';
import { navigateTo, renderSettingsStatus } from '../uiManager.js';
import { init as initTooltips } from '../tooltips.js';

// 导入子模块
import * as dataManagementView from './settings/dataManagementView.js';
import * as cloudSyncView from './settings/cloudSyncView.js';
import * as storageManagementView from './settings/storageManagementView.js';

let refreshCallback = () => {};
let hasInitialized = false;

// 数据管理功能 - 委托给数据管理模块
function handleImport(files) {
    return dataManagementView.handleImport(files);
}

function handleExport() {
    return dataManagementView.handleExport();
}

function handleBackup() {
    return dataManagementView.handleBackup();
}

function handleRestore() {
    return dataManagementView.handleRestore();
}

// 存储管理功能 - 委托给存储管理模块
function handleStorageChange(event) {
    return storageManagementView.handleStorageChange(event);
}

// 云同步功能 - 委托给云同步模块  
function showProviderConfig(provider) {
    return cloudSyncView.showProviderConfig(provider);
}

function handleProviderChange(event) {
    return cloudSyncView.handleProviderChange(event);
}

function handleSyncToggle(event) {
    return cloudSyncView.handleSyncToggle(event);
}

function renderSyncSummary(settings) {
    // 此函数已移动到云同步模块中，保留此引用以保持兼容性
    // 但实际功能由云同步模块的内部函数处理
}

function setSyncConfigLockedState(isLocked, settings, provider) {
    return cloudSyncView.setSyncConfigLockedState(isLocked, settings, provider);
}

export async function handleSaveSyncSettings() {
    return cloudSyncView.handleSaveSyncSettings();
}

function handleSyncToCloud() {
    return cloudSyncView.handleSyncToCloud();
}

function handleSyncFromCloud() {
    return cloudSyncView.handleSyncFromCloud();
}

function handleAutoSyncToggle(event) {
    return cloudSyncView.handleAutoSyncToggle(event);
}

export function updateCloudSyncView(settings) {
    return cloudSyncView.updateCloudSyncView(settings);
}

function setSaveButtonLoading(isLoading) {
    // 此函数已移动到云同步模块中，保留此引用以保持兼容性
    // 但实际功能由云同步模块的内部函数处理
}

export function init(refreshFunc) {
    if (hasInitialized) return;
    refreshCallback = refreshFunc;

    // 只初始化设置相关的子模块，不要重复绑定主视图的按钮
    dataManagementView.init();
    cloudSyncView.init();
    storageManagementView.init();

    // Init tooltips
    initTooltips();
    
    hasInitialized = true;
    console.log('设置视图主控制器已初始化，所有子模块已加载');
}

function highlightSyncActions() {
    return cloudSyncView.highlightSyncActions();
} 