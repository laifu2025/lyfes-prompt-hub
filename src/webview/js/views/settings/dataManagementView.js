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
 * 处理重置所有数据
 * 将所有数据重置为默认状态，包含预设的软件开发生命周期相关的示例数据
 */
function handleResetAllData() {
    console.log('handleResetAllData 函数被调用');
    
    // 显示确认对话框
    api.showConfirmation('确定要重置所有数据吗？这将清除所有提示词、分类、设置和云同步配置，并添加默认的软件开发生命周期示例数据。此操作不可撤销！')
        .then(response => {
            console.log('确认对话框响应:', response);
            if (response.confirmed) {
                console.log('用户确认重置，开始执行重置操作');
                api.postMessageWithResponse('webview:resetAllData')
                    .then(response => {
                        console.log('重置操作响应:', response);
                        if (response.success) {
                            api.showToast('所有数据已重置为默认状态，已添加软件开发生命周期相关的示例数据！', 'success');
                            // 刷新应用数据
                            window.location.reload();
                        }
                    })
                    .catch(err => {
                        console.error('重置操作失败:', err);
                        api.showToast(`重置失败: ${err.message}`, 'error');
                    });
            } else {
                console.log('用户取消了重置操作');
            }
        })
        .catch(err => {
            console.error('显示确认对话框失败:', err);
            api.showToast(`操作失败: ${err.message}`, 'error');
        });
}

/**
 * 处理清空所有数据
 * 清空所有数据，只保留默认设置（云同步关闭）
 */
function handleClearAllData() {
    console.log('handleClearAllData 函数被调用');
    
    // 显示确认对话框
    api.showConfirmation('确定要清空所有数据吗？这将删除所有提示词和分类，只保留默认设置。此操作不可撤销！')
        .then(response => {
            console.log('确认对话框响应:', response);
            if (response.confirmed) {
                console.log('用户确认清空，开始执行清空操作');
                api.postMessageWithResponse('webview:clearAllData')
                    .then(response => {
                        console.log('清空操作响应:', response);
                        if (response.success) {
                            api.showToast('所有数据已清空，只保留默认设置！', 'success');
                            // 刷新应用数据
                            window.location.reload();
                        }
                    })
                    .catch(err => {
                        console.error('清空操作失败:', err);
                        api.showToast(`清空失败: ${err.message}`, 'error');
                    });
            } else {
                console.log('用户取消了清空操作');
            }
        })
        .catch(err => {
            console.error('显示确认对话框失败:', err);
            api.showToast(`操作失败: ${err.message}`, 'error');
        });
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
        restoreBackupButton: document.getElementById('restore-backup-btn'),
        resetAllDataButton: document.getElementById('reset-all-data-btn'),
        clearAllDataButton: document.getElementById('clear-all-data-btn')
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
    
    // 调试输出：检查所有元素是否存在
    console.log('数据管理模块初始化 - 检查元素:', {
        importButton: !!elements.importButton,
        importInput: !!elements.importInput,
        exportButton: !!elements.exportButton,
        createBackupButton: !!elements.createBackupButton,
        restoreBackupButton: !!elements.restoreBackupButton,
        resetAllDataButton: !!elements.resetAllDataButton,
        clearAllDataButton: !!elements.clearAllDataButton
    });
    
    // 绑定事件监听器
    if (elements.importButton) {
        elements.importButton.addEventListener('click', () => elements.importInput.click());
    }
    if (elements.importInput) {
        elements.importInput.addEventListener('change', (event) => handleImport(event.target.files));
    }
    if (elements.exportButton) {
        elements.exportButton.addEventListener('click', handleExport);
    }
    if (elements.createBackupButton) {
        elements.createBackupButton.addEventListener('click', handleBackup);
    }
    if (elements.restoreBackupButton) {
        elements.restoreBackupButton.addEventListener('click', handleRestore);
    }
    
    // 添加重置所有数据按钮的事件监听器
    if (elements.resetAllDataButton) {
        console.log('重置按钮找到，绑定事件监听器');
        elements.resetAllDataButton.addEventListener('click', (event) => {
            console.log('重置按钮被点击');
            handleResetAllData();
        });
    } else {
        console.error('未找到重置按钮元素 #reset-all-data-btn');
    }
    
    // 添加清空所有数据按钮的事件监听器
    if (elements.clearAllDataButton) {
        console.log('清空按钮找到，绑定事件监听器');
        elements.clearAllDataButton.addEventListener('click', (event) => {
            console.log('清空按钮被点击');
            handleClearAllData();
        });
    } else {
        console.error('未找到清空按钮元素 #clear-all-data-btn');
    }
    
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
    handleRestore,
    handleResetAllData,
    handleClearAllData
}; 