/**
 * WebView 数据桥接层
 * 简化版本 - 移除用户系统，直接管理提示词数据
 */

// 全局状态变量
let appData = null;
let isDataLoaded = false;

/**
 * 初始化数据管理
 */
async function initializeDataManager() {
    if (!window.DataManager) {
        console.error('DataManager 未找到，请确保扩展正确加载');
        return;
    }
    
    try {
        // 从扩展存储中加载数据
        appData = await window.DataManager.getAppData();
        isDataLoaded = true;
        
        // 触发数据加载完成事件
        window.dispatchEvent(new CustomEvent('dataLoaded', { detail: appData }));
        
        console.log('应用数据已加载:', appData);
        
        // 显示存储模式信息
        const storageMode = appData.settings.workspaceMode ? '工作区模式' : '全局模式';
        console.log(`当前存储模式: ${storageMode}`);
        
    } catch (error) {
        console.error('初始化数据管理器失败:', error);
        showToast('数据加载失败', 'error');
    }
}

/**
 * 等待数据加载完成
 */
function waitForDataLoad() {
    return new Promise((resolve) => {
        if (isDataLoaded) {
            resolve(appData);
        } else {
            window.addEventListener('dataLoaded', (event) => {
                resolve(event.detail);
            }, { once: true });
        }
    });
}

/**
 * 保存应用数据
 */
async function saveAppData() {
    if (!appData || !window.DataManager) {
        console.warn('无法保存数据：数据未加载或DataManager不可用');
        return false;
    }
    
    try {
        const success = await window.DataManager.saveAppData(appData);
        if (success) {
            console.log('数据保存成功');
        }
        return success;
    } catch (error) {
        console.error('保存数据失败:', error);
        showToast('保存数据失败', 'error');
        return false;
    }
}

/**
 * 获取应用数据统计信息
 */
async function getAppStats() {
    await waitForDataLoad();
    
    return {
        totalPrompts: appData.prompts.length,
        activePrompts: appData.prompts.filter(p => p.isActive).length,
        categories: appData.categories.length,
        lastModified: appData.metadata.lastModified,
        storageMode: appData.settings.workspaceMode ? 'workspace' : 'global'
    };
}

/**
 * 获取所有提示词
 */
async function getPrompts() {
    await waitForDataLoad();
    return appData.prompts || [];
}

/**
 * 根据筛选条件获取提示词
 */
async function getFilteredPrompts(filters = {}) {
    await waitForDataLoad();
    
    let filtered = [...appData.prompts];
    
    // 按分类筛选
    if (filters.category && filters.category !== '全部') {
        filtered = filtered.filter(p => p.category === filters.category);
    }
    
    // 按状态筛选
    if (filters.status === 'active') {
        filtered = filtered.filter(p => p.isActive);
    } else if (filters.status === 'inactive') {
        filtered = filtered.filter(p => !p.isActive);
    }
    
    // 按关键词搜索
    if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(term) ||
            p.content.toLowerCase().includes(term) ||
            p.tags.some(tag => tag.toLowerCase().includes(term))
        );
    }
    
    // 按标签筛选
    if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(p => 
            filters.tags.some(tag => p.tags.includes(tag))
        );
    }
    
    // 排序
    if (filters.sortBy) {
        switch (filters.sortBy) {
            case 'title':
                filtered.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'created':
                filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'updated':
                filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                break;
            case 'category':
                filtered.sort((a, b) => a.category.localeCompare(b.category));
                break;
        }
    }
    
    return filtered;
}

/**
 * 根据ID获取单个提示词
 */
async function getPromptById(id) {
    await waitForDataLoad();
    return appData.prompts.find(p => p.id === id);
}

/**
 * 添加提示词
 */
async function addPrompt(prompt) {
    await waitForDataLoad();
    
    const newId = appData.prompts.length > 0 ? Math.max(...appData.prompts.map(p => p.id)) + 1 : 1;
    const newPrompt = {
        id: newId,
        title: prompt.title || '未命名提示词',
        content: prompt.content || '',
        category: prompt.category || '默认分类',
        tags: prompt.tags || [],
        isActive: prompt.isActive !== undefined ? prompt.isActive : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    appData.prompts.push(newPrompt);
    await saveAppData();
    
    return newPrompt;
}

/**
 * 更新提示词
 */
async function updatePrompt(id, updates) {
    await waitForDataLoad();
    
    const promptIndex = appData.prompts.findIndex(p => p.id === id);
    if (promptIndex === -1) {
        throw new Error('提示词不存在');
    }
    
    appData.prompts[promptIndex] = {
        ...appData.prompts[promptIndex],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    await saveAppData();
    return appData.prompts[promptIndex];
}

/**
 * 删除提示词
 */
async function deletePrompt(id) {
    await waitForDataLoad();
    
    const promptIndex = appData.prompts.findIndex(p => p.id === id);
    if (promptIndex === -1) {
        throw new Error('提示词不存在');
    }
    
    const deletedPrompt = appData.prompts.splice(promptIndex, 1)[0];
    await saveAppData();
    
    return deletedPrompt;
}

/**
 * 批量操作提示词
 */
async function batchUpdatePrompts(ids, updates) {
    await waitForDataLoad();
    
    const updatedPrompts = [];
    
    for (const id of ids) {
        const promptIndex = appData.prompts.findIndex(p => p.id === id);
        if (promptIndex >= 0) {
            appData.prompts[promptIndex] = {
                ...appData.prompts[promptIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            updatedPrompts.push(appData.prompts[promptIndex]);
        }
    }
    
    await saveAppData();
    return updatedPrompts;
}

/**
 * 切换提示词状态
 */
async function togglePromptStatus(id, isActive) {
    return await updatePrompt(id, { isActive });
}

/**
 * 复制提示词
 */
async function duplicatePrompt(id) {
    await waitForDataLoad();
    
    const originalPrompt = appData.prompts.find(p => p.id === id);
    if (!originalPrompt) {
        throw new Error('提示词不存在');
    }
    
    const duplicatedPrompt = {
        ...originalPrompt,
        title: `${originalPrompt.title} (副本)`,
        id: undefined, // 将由 addPrompt 生成新ID
        createdAt: undefined,
        updatedAt: undefined
    };
    
    return await addPrompt(duplicatedPrompt);
}

/**
 * 获取分类列表
 */
async function getCategories() {
    await waitForDataLoad();
    return appData.categories || [];
}

/**
 * 添加分类
 */
async function addCategory(categoryName) {
    await waitForDataLoad();
    
    if (!categoryName || categoryName.trim() === '') {
        throw new Error('分类名称不能为空');
    }
    
    const trimmedName = categoryName.trim();
    
    if (!appData.categories.includes(trimmedName)) {
        appData.categories.push(trimmedName);
        await saveAppData();
        return trimmedName;
    }
    
    throw new Error('分类已存在');
}

/**
 * 删除分类
 */
async function deleteCategory(categoryName) {
    await waitForDataLoad();
    
    const index = appData.categories.indexOf(categoryName);
    if (index > -1) {
        appData.categories.splice(index, 1);
        
        // 将使用该分类的提示词移动到默认分类
        appData.prompts.forEach(prompt => {
            if (prompt.category === categoryName) {
                prompt.category = '默认分类';
                prompt.updatedAt = new Date().toISOString();
            }
        });
        
        await saveAppData();
        return true;
    }
    
    return false;
}

/**
 * 重命名分类
 */
async function renameCategory(oldName, newName) {
    await waitForDataLoad();
    
    if (!newName || newName.trim() === '') {
        throw new Error('新分类名称不能为空');
    }
    
    const trimmedNewName = newName.trim();
    
    if (appData.categories.includes(trimmedNewName)) {
        throw new Error('新分类名称已存在');
    }
    
    const index = appData.categories.indexOf(oldName);
    if (index > -1) {
        appData.categories[index] = trimmedNewName;
        
        // 更新所有使用该分类的提示词
        appData.prompts.forEach(prompt => {
            if (prompt.category === oldName) {
                prompt.category = trimmedNewName;
                prompt.updatedAt = new Date().toISOString();
            }
        });
        
        await saveAppData();
        return true;
    }
    
    return false;
}

/**
 * 获取所有标签
 */
async function getAllTags() {
    await waitForDataLoad();
    
    const tagSet = new Set();
    appData.prompts.forEach(prompt => {
        prompt.tags.forEach(tag => tagSet.add(tag));
    });
    
    return Array.from(tagSet).sort();
}

/**
 * 获取设置信息
 */
async function getSettings() {
    await waitForDataLoad();
    return { ...appData.settings };
}

/**
 * 更新设置
 */
async function updateSettings(newSettings) {
    await waitForDataLoad();
    
    appData.settings = {
        ...appData.settings,
        ...newSettings
    };
    
    await saveAppData();
    return appData.settings;
}

/**
 * 导出数据
 */
async function exportDataToFile() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return;
    }
    
    try {
        const result = await window.DataManager.exportData();
        if (result.success) {
            showToast(`数据已导出到: ${result.path}`, 'success');
        } else {
            showToast(`导出失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('导出数据失败:', error);
        showToast('导出数据失败', 'error');
    }
}

/**
 * 导入数据
 */
async function importDataFromFile() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return;
    }
    
    try {
        const result = await window.DataManager.importData();
        if (result.success && result.data) {
            appData = result.data;
            isDataLoaded = true;
            
            // 触发数据更新事件
            window.dispatchEvent(new CustomEvent('dataUpdated', { detail: appData }));
            
            showToast('数据导入成功', 'success');
            return true;
        } else if (result.error) {
            showToast(`导入失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('导入数据失败:', error);
        showToast('导入数据失败', 'error');
    }
    
    return false;
}

/**
 * 创建备份
 */
async function createBackup() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return;
    }
    
    try {
        const result = await window.DataManager.createBackup();
        if (result.success) {
            showToast(`备份已创建`, 'success');
        } else {
            showToast(`创建备份失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('创建备份失败:', error);
        showToast('创建备份失败', 'error');
    }
}

/**
 * 获取备份列表
 */
async function getBackupList() {
    if (!window.DataManager) {
        return [];
    }
    
    try {
        return await window.DataManager.getBackupList();
    } catch (error) {
        console.error('获取备份列表失败:', error);
        return [];
    }
}

/**
 * 恢复备份
 */
async function restoreFromBackup(backupPath) {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return false;
    }
    
    try {
        const result = await window.DataManager.restoreBackup(backupPath);
        if (result.success && result.data) {
            appData = result.data;
            isDataLoaded = true;
            
            // 触发数据更新事件
            window.dispatchEvent(new CustomEvent('dataUpdated', { detail: appData }));
            
            showToast('数据恢复成功', 'success');
            return true;
        } else if (result.error) {
            showToast(`恢复失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('恢复备份失败:', error);
        showToast('恢复备份失败', 'error');
    }
    
    return false;
}

/**
 * 设置云同步
 */
async function setupCloudSync() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return;
    }
    
    try {
        const result = await window.DataManager.setupCloudSync();
        if (result.success) {
            showToast('云同步设置成功', 'success');
        } else if (result.error) {
            showToast(`设置失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('设置云同步失败:', error);
        showToast('设置云同步失败', 'error');
    }
}

/**
 * 同步到云端
 */
async function syncToCloud() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return;
    }
    
    try {
        const result = await window.DataManager.syncToCloud();
        if (result.success) {
            showToast('数据已同步到云端', 'success');
        } else if (result.error) {
            showToast(`同步失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('同步到云端失败:', error);
        showToast('同步到云端失败', 'error');
    }
}

/**
 * 从云端同步
 */
async function syncFromCloud() {
    if (!window.DataManager) {
        showToast('数据管理器不可用', 'error');
        return false;
    }
    
    try {
        const result = await window.DataManager.syncFromCloud();
        if (result.success && result.data) {
            appData = result.data;
            isDataLoaded = true;
            
            // 触发数据更新事件
            window.dispatchEvent(new CustomEvent('dataUpdated', { detail: appData }));
            
            showToast('数据已从云端同步', 'success');
            return true;
        } else if (result.error) {
            showToast(`同步失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('从云端同步失败:', error);
        showToast('从云端同步失败', 'error');
    }
    
    return false;
}

// 在页面加载时自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDataManager);
} else {
    initializeDataManager();
}

// 导出函数供其他脚本使用
if (typeof window !== 'undefined') {
    window.DataBridge = {
        // 初始化和基础信息
        initialize: initializeDataManager,
        waitForDataLoad,
        getAppStats,
        
        // 提示词管理
        getPrompts,
        getFilteredPrompts,
        getPromptById,
        addPrompt,
        updatePrompt,
        deletePrompt,
        batchUpdatePrompts,
        togglePromptStatus,
        duplicatePrompt,
        
        // 分类管理
        getCategories,
        addCategory,
        deleteCategory,
        renameCategory,
        
        // 标签管理
        getAllTags,
        
        // 设置管理
        getSettings,
        updateSettings,
        
        // 数据管理
        exportData: exportDataToFile,
        importData: importDataFromFile,
        createBackup,
        getBackupList,
        restoreFromBackup,
        
        // 云同步
        setupCloudSync,
        syncToCloud,
        syncFromCloud
    };
} 