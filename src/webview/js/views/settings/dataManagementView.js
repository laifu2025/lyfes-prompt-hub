import * as api from '../../api.js';

/**
 * 数据管理模块 - 负责处理导入、导出、备份、恢复等数据管理功能
 * 
 * 职责：
 * - 处理数据导入和导出
 * - 管理数据备份和恢复
 * - 提供数据管理相关的UI交互
 */

let isInitialized = false;

/**
 * 处理文件导入
 * @param {FileList} files - 待导入的文件列表
 */
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

/**
 * 处理数据导出
 */
function handleExport() {
    api.postMessageWithResponse('exportData')
        .then(() => api.showToast('数据已导出', 'success'))
        .catch(err => api.showToast(`导出失败: ${err.message}`, 'error'));
}

/**
 * 处理数据备份
 */
function handleBackup() {
    api.postMessageWithResponse('backupData')
        .then(result => api.showToast(`备份已创建: ${result.path}`, 'success'))
        .catch(err => api.showToast(`备份失败: ${err.message}`, 'error'));
}

/**
 * 处理数据恢复
 */
function handleRestore() {
    api.postMessageWithResponse('restoreData')
        .then(response => {
            if (response.success) {
                api.showToast('备份恢复成功！', 'success');
            }
        })
        .catch(err => api.showToast(`恢复失败: ${err.message}`, 'error'));
}

/**
 * 获取数据管理相关的DOM元素
 * @returns {Object} DOM元素对象
 */
function getElements() {
    return {
        importButton: document.getElementById('import-btn'),
        importInput: document.getElementById('import-file-input'),
        exportButton: document.getElementById('export-btn'),
        createBackupButton: document.getElementById('create-backup-btn'),
        restoreBackupButton: document.getElementById('restore-backup-btn')
    };
}

/**
 * 初始化数据管理模块
 * - 绑定事件监听器
 * - 设置UI交互逻辑
 */
export function init() {
    if (isInitialized) return;
    
    const elements = getElements();
    
    // 绑定事件监听器
    elements.importButton.addEventListener('click', () => elements.importInput.click());
    elements.importInput.addEventListener('change', (event) => handleImport(event.target.files));
    elements.exportButton.addEventListener('click', handleExport);
    elements.createBackupButton.addEventListener('click', handleBackup);
    elements.restoreBackupButton.addEventListener('click', handleRestore);
    
    isInitialized = true;
    console.log('数据管理模块已初始化');
}

/**
 * 重置模块状态（用于测试或重新初始化）
 */
export function reset() {
    isInitialized = false;
}

// 导出供外部使用的函数
export {
    handleImport,
    handleExport,
    handleBackup,
    handleRestore
}; 