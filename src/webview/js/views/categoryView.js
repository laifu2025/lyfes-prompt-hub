import { dom, state } from '../state.js';
import * as api from '../api.js';
import { goBack, showToast } from '../uiManager.js';

let refreshCallback = () => {};

function createCategoryItemElement(categoryName, isEditing = false, isNew = false) {
    const item = document.createElement('div');
    item.className = 'category-manage-item';
    if (isNew) {
        item.classList.add('new-category-item');
    }
    item.dataset.categoryName = categoryName || '';

    const displayName = categoryName || (isNew ? '' : '未命名分类');

    item.innerHTML = `
        <div class="category-name-wrapper">
            <span class="category-name ${isEditing ? 'hidden' : ''}">${displayName}</span>
            <input type="text" class="category-input ${isEditing ? '' : 'hidden'}" value="${displayName}" placeholder="输入分类名称" />
        </div>
        <div class="category-manage-actions">
            <button class="btn-icon btn-edit ${isEditing ? 'hidden' : ''}" title="重命名">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-save ${isEditing ? '' : 'hidden'}" title="保存">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-cancel ${isEditing ? '' : 'hidden'}" title="取消">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-delete ${isEditing ? 'hidden' : ''}" title="删除">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-1 1v1H4a1 1 0 000 2h1v9a2 2 0 002 2h6a2 2 0 002-2V6h1a1 1 0 100-2h-4V3a1 1 0 00-1-1H9zm7 5a1 1 0 10-2 0v9a1 1 0 11-2 0V7a1 1 0 10-2 0v9a1 1 0 102 0V7a1 1 0 102 0V7z" clip-rule="evenodd" /></svg>
            </button>
        </div>
    `;
    return item;
}

function handleAddCategory() {
    api.postMessageWithResponse('showInputBox', {
        value: '',
        prompt: '请输入新的分类名称',
        placeHolder: '例如：代码片段'
    }).then(result => {
        const newName = result.value;
        if (newName) {
            return api.postMessageWithResponse('addCategory', { name: newName });
        }
        return Promise.reject('取消添加');
    }).then(() => {
        showToast('分类已添加', 'success');
        refreshCallback();
    }).catch(err => {
        if (err !== '取消添加') {
            showToast(err.message || '添加失败', 'error');
        }
    });
}

function handleRenameCategory(oldName) {
    api.postMessageWithResponse('showInputBox', {
        value: oldName,
        prompt: `重命名分类 "${oldName}"`,
        placeHolder: '输入新的分类名称'
    }).then(result => {
        const newName = result.value;
        if (newName && newName !== oldName) {
            return api.postMessageWithResponse('renameCategory', { oldName, newName });
        }
        return Promise.reject('取消重命名');
    }).then(() => {
        showToast('分类已重命名', 'success');
        refreshCallback();
    }).catch(err => {
        if (err !== '取消重命名') {
            showToast(err.message || '重命名失败', 'error');
        }
    });
}

function handleDeleteCategory(name) {
     api.postMessageWithResponse('showConfirmation', { message: `确定要删除分类 "${name}" 吗？该分类下的 Prompts 将被移动到 "未分类"。` })
        .then(result => {
            if (result.confirmed) {
                return api.postMessageWithResponse('deleteCategory', { name });
            }
            return Promise.reject('取消删除');
        }).then(() => {
            showToast('分类已删除', 'success');
            refreshCallback();
        }).catch(err => {
            if (err !== '取消删除') {
                showToast(err.message || '删除失败', 'error');
            }
        });
}

function toggleEditMode(item, isEditing) {
    if (!item) return;
    
    const nameSpan = item.querySelector('.category-name');
    const input = item.querySelector('.category-input');
    
    const editBtn = item.querySelector('.btn-edit');
    const deleteBtn = item.querySelector('.btn-delete');
    const saveBtn = item.querySelector('.btn-save');
    const cancelBtn = item.querySelector('.btn-cancel');

    if (nameSpan) nameSpan.classList.toggle('hidden', isEditing);
    if (input) input.classList.toggle('hidden', !isEditing);
    if (editBtn) editBtn.classList.toggle('hidden', isEditing);
    if (deleteBtn) deleteBtn.classList.toggle('hidden', isEditing);
    if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEditing);

    if (isEditing && input) {
        input.focus();
        input.select();
    }
}

function handleCategoryListClick(e) {
    const item = e.target.closest('.category-manage-item');
    if (!item) return;

    const originalName = item.dataset.categoryName;
    const isNewItem = item.classList.contains('new-category-item');

    if (e.target.closest('.btn-edit')) {
        toggleEditMode(item, true);
    }
    
    else if (e.target.closest('.btn-cancel')) {
        if (isNewItem) {
            item.remove();
        } else {
            const input = item.querySelector('.category-input');
            if (input) input.value = originalName;
            toggleEditMode(item, false);
        }
    }

    else if (e.target.closest('.btn-save')) {
        const input = item.querySelector('.category-input');
        if (!input) return;

        const newName = input.value.trim();
        if (!newName) {
            showToast('分类名称不能为空', 'error');
            return;
        }

        if (isNewItem) {
            api.postMessageWithResponse('addCategory', { name: newName })
                .then(() => showToast('分类已添加'))
                .catch(err => showToast(`添加失败: ${err.message}`, 'error'));
        } else {
            if (newName !== originalName) {
                api.postMessageWithResponse('renameCategory', { oldName: originalName, newName: newName })
                    .then(() => showToast('分类已重命名'))
                    .catch(err => showToast(`重命名失败: ${err.message}`, 'error'));
            } else {
                toggleEditMode(item, false);
            }
        }
    }

    else if (e.target.closest('.btn-delete')) {
        handleDeleteCategory(originalName);
    }
}

export function init(refreshFunc) {
    if (refreshFunc) {
        refreshCallback = refreshFunc;
    }
    const { categoryViewElements: elements } = dom;
    if (elements && elements.addCategoryButton) {
        elements.addCategoryButton.addEventListener('click', handleAddCategory);
    }
    if (elements && elements.backButton) {
        elements.backButton.addEventListener('click', goBack);
    }
    if (elements && elements.container) {
        elements.container.addEventListener('click', handleCategoryListClick);
    }
}

export function render() {
    const { categoryViewElements: elements } = dom;
    const container = elements ? elements.container : null;

    if (!container) {
        console.error("Category view container not found!");
        return;
    }

    const categories = state.appData?.categories || [];
    container.innerHTML = ''; // Clear the list first
    categories
        .filter(c => c !== '未分类') // "Uncategorized" should not be managed
        .forEach(category => {
            const item = createCategoryItemElement(category);
            container.appendChild(item);
        });
} 