/**
 * @module events
 * @description Handles all user interactions and application events.
 */

import { dom } from './dom.js';
import { state } from './state.js';
import { postMessage, postMessageWithResponse } from './api.js';
import { navigateTo, goBack } from './navigation.js';
import { renderAll, renderEditView, renderFilterView, renderSettingsStatus, renderBackupList, renderTagsForEdit, createCategoryItemElement } from './ui.js';

// --- Action Handlers ---

async function handleDataAction(action, messages = {}, payload = {}) {
    if (messages.pending) {
        // showToast(messages.pending, 'info'); // Optional pending message
    }
    try {
        const response = await postMessageWithResponse(action, payload);
        if (messages.success) {
            postMessage('showNotification', { message: messages.success, notificationType: 'info' });
        }
        if (response.data) {
            state.setAppData(response.data);
            renderAll();
        }
        return response;
    } catch (error) {
        console.error(`Action ${action} failed:`, error);
        if (messages.error) {
            postMessage('showNotification', { message: `${messages.error}: ${error.message}`, notificationType: 'error' });
        }
    }
}

function showEditForm(id, isCreate = false) {
    const prompt = isCreate 
        ? { id: null, title: '', content: '', category: '未分类', tags: [] } 
        : state.prompts.find(p => p.id == id);
    if (!prompt) return;

    state.setEditingPromptId(prompt.id);
    state.setCurrentTagsInEdit([...prompt.tags]);
    renderEditView(prompt);
    navigateTo('edit');
}

async function handleSavePrompt(e) {
    e.preventDefault();
    const payload = {
        id: state.appState.editingPromptId,
        title: dom.promptTitleField.value,
        content: dom.promptContentField.value,
        category: dom.promptCategoryField.value || '未分类',
        tags: state.currentTagsInEdit,
    };
    await handleDataAction('savePrompt', { success: 'Prompt 已保存' }, payload);
    goBack();
}

async function handleDeletePrompt() {
    const id = state.appState.editingPromptId;
    if (id && confirm('确定要删除这个 Prompt吗？')) {
        await handleDataAction('deletePrompt', { success: 'Prompt 已删除' }, { id });
        goBack();
    }
}

async function handleDeleteCategory(name, itemElement) {
    if (confirm(`确定要删除分类 "${name}" 吗？该分类下的所有 Prompts 将被移至"未分类"。`)) {
        await handleDataAction('deleteCategory', { success: `分类 "${name}" 已删除` }, { name });
        // The re-render will be handled by the response
    }
}

async function handleRestoreBackup() {
    dom.restoreBackupModal.classList.remove('hidden');
    const response = await postMessageWithResponse('getBackups');
    if (response.backups) {
        renderBackupList(response.backups);
    }
}


// --- Main Event Initializer ---

export function initializeEventListeners() {
    // Listener for messages from the extension
    document.body.addEventListener('vscode-appDataResponse', e => {
        state.setAppData(e.detail.data);
        renderAll();
    });
    document.body.addEventListener('vscode-requestRefresh', () => {
        postMessage('showNotification', { message: '数据已刷新', notificationType: 'info' });
        initialLoad();
    });
    document.body.addEventListener('vscode-systemStatusUpdated', e => {
        renderSettingsStatus(e.detail.data);
    });
    document.body.addEventListener('vscode-error', e => {
        postMessage('showNotification', { message: e.detail.message, notificationType: 'error' });
    });


    // Global click listener (event delegation)
    document.body.addEventListener('click', e => {
        handleGlobalClicks(e.target);
    });

    // Form submissions and specific inputs
    dom.promptForm.addEventListener('submit', handleSavePrompt);
    dom.tagInputField.addEventListener('keydown', handleTagInput);
    dom.searchInput.addEventListener('input', e => {
        state.setFilter({ ...state.filter, searchTerm: e.target.value });
        renderPrompts();
    });
    dom.sortBySelect.addEventListener('change', e => {
        state.setFilter({ ...state.filter, sortBy: e.target.value });
        renderPrompts();
    });
}


// --- Event Delegation Handlers ---

function handleGlobalClicks(target) {
    // --- Universal Components ---
    if (target.closest('.back-btn')) {
        goBack();
        return;
    }
    
    // --- Header Buttons ---
    const headerBtn = target.closest('.header-actions button');
    if (headerBtn) {
        switch (headerBtn.id) {
            case 'add-prompt-btn': showEditForm(null, true); break;
            case 'filter-btn': 
                state.setStagedFilter(JSON.parse(JSON.stringify(state.filter)));
                renderFilterView();
                navigateTo('filter');
                break;
            case 'settings-btn': 
                postMessageWithResponse('getSystemStatus').then(renderSettingsStatus);
                navigateTo('settings');
                break;
        }
        return;
    }
    
    // --- View-specific clicks ---
    const view = target.closest('.view');
    if (!view) return;

    switch(view.id) {
        case 'main-view': handleMainViewClicks(target); break;
        case 'edit-view': handleEditViewClicks(target); break;
        case 'filter-view': handleFilterViewClicks(target); break;
        case 'category-view': handleCategoryViewClicks(target); break;
        case 'settings-view': handleSettingsViewClicks(target); break;
    }
}

function handleMainViewClicks(target) {
    const promptItem = target.closest('.prompt-item');
    if (promptItem) {
        if (target.closest('.switch')) {
            const checkbox = promptItem.querySelector('input[type="checkbox"]');
            if (checkbox?.dataset.id) {
                handleDataAction('togglePrompt', {}, { id: checkbox.dataset.id });
            }
        } else {
            showEditForm(promptItem.dataset.id);
        }
        return;
    }

    const categoryTab = target.closest('.category-tab');
    if (categoryTab) {
        state.setFilter({ ...state.filter, category: categoryTab.dataset.category });
        renderAll();
    }
}

function handleEditViewClicks(target) {
    if (target.classList.contains('tag-remove-btn')) {
        state.removeTagFromEdit(target.dataset.tag);
        renderTagsForEdit(state.currentTagsInEdit);
        return;
    }
    if (target.id === 'category-dropdown-btn') {
        dom.categoryDropdownMenu.classList.toggle('hidden');
        return;
    }
    const dropdownItem = target.closest('.dropdown-item');
    if (dropdownItem) {
        dom.promptCategoryField.value = dropdownItem.dataset.value;
        dom.categoryDropdownMenu.classList.add('hidden');
        return;
    }
    if (target.id === 'delete-prompt-btn') {
        handleDeletePrompt();
    }
}

function handleFilterViewClicks(target) {
    const stagedFilter = state.stagedFilter;
    if (!stagedFilter) return;

    const statusBtn = target.closest('#status-options .filter-btn');
    if (statusBtn) {
        stagedFilter.status = statusBtn.dataset.status;
        renderFilterView();
        return;
    }

    const tagBtn = target.closest('#tag-filter-options .filter-btn');
    if (tagBtn) {
        const tag = tagBtn.dataset.tag;
        if (tag === 'all') {
            stagedFilter.selectedTags = ['all'];
        } else {
            stagedFilter.selectedTags = stagedFilter.selectedTags.filter(t => t !== 'all');
            const index = stagedFilter.selectedTags.indexOf(tag);
            if (index > -1) {
                stagedFilter.selectedTags.splice(index, 1);
                if (stagedFilter.selectedTags.length === 0) stagedFilter.selectedTags.push('all');
            } else {
                stagedFilter.selectedTags.push(tag);
            }
        }
        renderFilterView();
        return;
    }

    if (target.id === 'apply-filter-btn') {
        state.setFilter(JSON.parse(JSON.stringify(stagedFilter)));
        state.setStagedFilter(null);
        renderAll();
        goBack();
    }

    if (target.id === 'reset-filter-btn') {
        state.setStagedFilter({ searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] });
        renderFilterView();
    }
}

function handleCategoryViewClicks(target) {
    if (target.closest('#add-category-header-btn')) {
        if (document.querySelector('.category-list-item.is-new')) return; // Prevent multiple new items
        const newItem = createCategoryItemElement('', true);
        newItem.classList.add('is-new');
        dom.categoryManagement.container.prepend(newItem);
        newItem.querySelector('input').focus();
        return;
    }

    const item = target.closest('.category-list-item');
    if (!item) return;
    
    const categoryName = item.querySelector('.category-name').textContent;
    const input = item.querySelector('input');

    if (target.closest('.edit-category-btn')) {
        enterCategoryEditMode(item);
    } 
    else if (target.closest('.delete-category-btn')) {
        handleDeleteCategory(categoryName, item);
    }
    else if (target.closest('.save-category-btn')) {
        finishCategoryEditMode(item, true);
    }
    else if (target.closest('.cancel-edit-btn')) {
        finishCategoryEditMode(item, false);
    }
}

async function handleSettingsViewClicks(target) {
    if (target.id === 'manage-categories-btn') {
        navigateTo('category');
    }
    else if (target.id === 'create-backup-btn') {
        handleDataAction('createBackup', { success: '备份成功' });
    }
    else if (target.id === 'restore-backup-btn') {
        handleRestoreBackup();
    }
    else if (target.closest('.storage-option')) {
        const mode = target.closest('.storage-option').dataset.mode;
        if (mode) {
            await handleDataAction('switchStorage', { success: `存储模式已切换` }, { mode });
            postMessageWithResponse('getSystemStatus').then(renderSettingsStatus);
        }
    }
    else if (target.closest('.restore-single-backup-btn')) {
        const fileName = target.closest('[data-filename]').dataset.filename;
        if (confirm(`确定要从备份文件 "${fileName}" 恢复吗？当前所有数据将被覆盖。`)) {
            await handleDataAction('restoreBackup', { success: '数据已从备份恢复' }, { fileName });
            dom.restoreBackupModal.classList.add('hidden');
        }
    }
    else if (target.id === 'close-backup-modal-btn') {
        dom.restoreBackupModal.classList.add('hidden');
    }
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tagValue = dom.tagInputField.value.trim();
        state.addTagToEdit(tagValue);
        renderTagsForEdit(state.currentTagsInEdit);
        dom.tagInputField.value = '';
    }
}

// --- Inline Editing Logic for Categories ---

export function enterCategoryEditMode(itemElement) {
    itemElement.classList.add('editing');
    const nameSpan = itemElement.querySelector('.category-name');
    const input = itemElement.querySelector('.category-input');
    input.value = nameSpan.textContent;
    input.style.display = 'block';
    nameSpan.style.display = 'none';
    input.focus();
    input.select();
}

async function finishCategoryEditMode(itemElement, saveChanges) {
    const input = itemElement.querySelector('input');
    const originalName = itemElement.querySelector('.category-name').textContent;
    const newName = input.value.trim();

    if (itemElement.classList.contains('is-new')) {
         if (saveChanges && newName) {
            await handleDataAction('addCategory', { success: `分类 "${newName}" 已添加` }, { name: newName });
        }
        itemElement.remove(); // Always remove the temporary new item element
    } else {
        // It's an existing item
        if (saveChanges && newName && newName !== originalName) {
            await handleDataAction('editCategory', { success: '分类已更新' }, { oldName: originalName, newName: newName });
        }
        itemElement.classList.remove('editing');
        itemElement.querySelector('.category-name').style.display = 'block';
        input.style.display = 'none';
    }
    // The data and UI will be updated via the response from handleDataAction
}


export async function initialLoad() {
    try {
        const response = await postMessageWithResponse('getAppData');
        state.setAppData(response.data);
        renderAll();
    } catch (error) {
        console.error("Initial load failed:", error);
        postMessage('showNotification', { message: `加载初始数据失败: ${error.message}`, notificationType: 'error' });
    }
} 