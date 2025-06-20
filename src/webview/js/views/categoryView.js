import { dom } from '../state.js';
import * as api from '../api.js';
import { goBack, showToast } from '../uiManager.js';
import { state } from '../state.js';

async function handleAddCategory() {
    try {
        const result = await api.postMessageWithResponse('showInputBox', { prompt: '输入新的分类名称' });
        const newName = result.value;
        if (newName) {
            await api.postMessageWithResponse('addCategory', { name: newName });
            showToast('分类已添加');
            api.postMessageWithResponse('requestRefresh');
        }
    } catch (e) {
        if (e && e.message && !e.message.includes('Cancelled')) {
            showToast(`添加失败: ${e.message}`, 'error');
        }
    }
}

async function handleEditCategory(oldName) {
    try {
        const result = await api.postMessageWithResponse('showInputBox', { prompt: '输入新的分类名称', value: oldName });
        const newName = result.value;
        if (newName && newName !== oldName) {
            await api.postMessageWithResponse('editCategory', { oldName, newName });
            showToast('分类已更新');
            api.postMessageWithResponse('requestRefresh');
        }
    } catch (e) {
        if (e && e.message && !e.message.includes('Cancelled')) {
            showToast(`更新失败: ${e.message}`, 'error');
        }
    }
}

async function handleDeleteCategory(name) {
    try {
        const result = await api.postMessageWithResponse('showConfirmation', { message: `确定要删除分类 "${name}" 吗？该分类下的所有 Prompts 将会被移至"未分类"。` });
        if (result.confirmed) {
            await api.postMessageWithResponse('deleteCategory', { name });
            showToast('分类已删除');
            // No need to request refresh, backend will push update
        }
    } catch (e) {
        showToast(`删除失败: ${e.message}`, 'error');
    }
}

function toggleEditMode(item, isEditing) {
    const nameSpan = item.querySelector('.category-name');
    const input = item.querySelector('.category-input');
    
    const editBtn = item.querySelector('.btn-edit');
    const deleteBtn = item.querySelector('.btn-delete');
    const saveBtn = item.querySelector('.btn-save');
    const cancelBtn = item.querySelector('.btn-cancel');

    nameSpan.classList.toggle('hidden', isEditing);
    input.classList.toggle('hidden', !isEditing);

    editBtn.classList.toggle('hidden', isEditing);
    deleteBtn.classList.toggle('hidden', isEditing);
    saveBtn.classList.toggle('hidden', !isEditing);
    cancelBtn.classList.toggle('hidden', !isEditing);

    if (isEditing) {
        input.focus();
        input.select();
    }
}

function handleCategoryListClick(e) {
    const item = e.target.closest('.category-manage-item');
    if (!item) return;

    const originalName = item.dataset.categoryName;

    // Edit button clicked
    if (e.target.closest('.btn-edit')) {
        toggleEditMode(item, true);
    }
    
    // Cancel button clicked
    else if (e.target.closest('.btn-cancel')) {
        const input = item.querySelector('.category-input');
        input.value = originalName; // Reset to original name
        toggleEditMode(item, false);
    }

    // Save button clicked
    else if (e.target.closest('.btn-save')) {
        const input = item.querySelector('.category-input');
        const newName = input.value.trim();
        if (newName && newName !== originalName) {
            api.postMessageWithResponse('renameCategory', { oldName: originalName, newName: newName })
                .then(() => showToast('分类已重命名'))
                .catch(e => showToast(`重命名失败: ${e.message}`, 'error'));
        }
        // The view will be refreshed by the extension, so we just toggle back
        toggleEditMode(item, false); 
    }

    // Delete button clicked
    else if (e.target.closest('.btn-delete')) {
        handleDeleteCategory(originalName);
    }
}

function createCategoryItemElement(categoryName) {
    const item = document.createElement('div');
    item.className = 'category-manage-item';
    item.dataset.categoryName = categoryName;

    item.innerHTML = `
        <div class="category-name-wrapper">
            <span class="category-name">${categoryName}</span>
            <input type="text" class="category-input hidden" value="${categoryName}" />
        </div>
        <div class="category-manage-actions">
            <button class="btn-icon btn-edit" title="重命名">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-save hidden" title="保存">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-cancel hidden" title="取消">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-delete" title="删除">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-1 1v1H4a1 1 0 000 2h1v9a2 2 0 002 2h6a2 2 0 002-2V6h1a1 1 0 100-2h-4V3a1 1 0 00-1-1H9zm7 5a1 1 0 10-2 0v9a1 1 0 11-2 0V7a1 1 0 10-2 0v9a1 1 0 102 0V7a1 1 0 102 0V7z" clip-rule="evenodd" /></svg>
            </button>
        </div>
    `;
    return item;
}

export function init() {
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
    const container = elements.container;

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