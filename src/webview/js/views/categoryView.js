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

    const displayName = categoryName || '';

    item.innerHTML = `
        <div class="category-name-wrapper">
            <span class="category-name ${isEditing ? 'hidden' : ''}">${displayName}</span>
            <input type="text" class="category-input ${isEditing ? '' : 'hidden'}" value="${displayName}" placeholder="输入分类名称" />
        </div>
        <div class="category-manage-actions">
            <button class="btn-icon btn-save ${isEditing ? '' : 'hidden'}" title="保存">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-cancel ${isEditing ? '' : 'hidden'}" title="取消">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-delete" title="删除">
                 <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5 3h3v1h-1v9.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 13.5V4h-1V3h3V2.5A1.5 1.5 0 0 1 7.5 1h1A1.5 1.5 0 0 1 10 2.5v.5Zm-4 1h-1v9.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V4h-1v9H6.5V4Zm2-1.5V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5V3h2Z"/></svg>
            </button>
        </div>
    `;
    return item;
}

function handleAddCategory() {
    const { categoryViewElements: elements } = dom;
    const container = elements ? elements.container : null;
    if (!container) return;

    if (container.querySelector('.new-category-item')) {
        container.querySelector('.new-category-item .category-input').focus();
        return;
    }

    const newItem = createCategoryItemElement('', true, true);
    container.prepend(newItem);
    newItem.querySelector('.category-input').focus();
}

function handleDeleteCategory(name) {
    api.postMessageWithResponse('showConfirmation', { message: `确定要删除分类 "${name}" 吗？` })
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
                const errorMessage = err.message || '删除失败';
                showToast(errorMessage, 'error');
            }
        });
}

function toggleEditMode(item, isEditing) {
    if (!item) return;
    
    const nameSpan = item.querySelector('.category-name');
    const input = item.querySelector('.category-input');
    
    const saveBtn = item.querySelector('.btn-save');
    const cancelBtn = item.querySelector('.btn-cancel');

    if (nameSpan) nameSpan.classList.toggle('hidden', isEditing);
    if (input) input.classList.toggle('hidden', !isEditing);
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

    if (e.target.closest('.category-name')) {
        toggleEditMode(item, true);
        return;
    }
    
    if (e.target.closest('.btn-cancel')) {
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

        const actionPromise = isNewItem
            ? api.postMessageWithResponse('addCategory', { name: newName })
            : (newName !== originalName
                ? api.postMessageWithResponse('renameCategory', { oldName: originalName, newName: newName })
                : Promise.resolve(true));

        actionPromise.then(result => {
            if (result) {
                const message = isNewItem ? '分类已添加' : (newName !== originalName ? '分类已重命名' : '');
                if (message) showToast(message, 'success');
                refreshCallback();
            }
        }).catch(err => {
            const action = isNewItem ? '添加' : '重命名';
            showToast(`${action}失败: ${err.message}`, 'error');
            if (!isNewItem) {
                toggleEditMode(item, false);
            }
        });
    }

    else if (e.target.closest('.btn-delete')) {
        if (isNewItem) {
            item.remove();
            return;
        }
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
        .forEach(category => {
            const item = createCategoryItemElement(category);
            container.appendChild(item);
        });
} 