import { state, dom } from './state.js';
import { postMessageWithResponse } from './api.js';
import * as ui from './uiManager.js';

// A helper function for data-related actions
async function handleDataAction(action, messages = {}, payload = {}) {
    const {
        loading = '正在处理...',
        success = '操作成功！',
        error = '操作失败，请重试'
    } = messages;

    ui.showToast(loading, 'info', 2000);
    try {
        const response = await postMessageWithResponse(action, payload);
        ui.showToast(success, 'success');
        return response;
    } catch (err) {
        console.error(`${action} failed:`, err);
        ui.showToast(err.message || error, 'error');
        throw err; // Re-throw for further handling if needed
    }
}

// --- Event Handler Functions ---

async function handleSavePrompt(e) {
    e.preventDefault();
    const promptData = {
        id: state.editingPromptId,
        title: dom.promptTitleField.value,
        content: dom.promptContentField.value,
        category: dom.promptCategoryField.value,
        tags: state.currentTags,
    };

    if (!promptData.title || !promptData.content) {
        ui.showToast('标题和内容不能为空。', 'error');
        return;
    }

    await handleDataAction('savePrompt', {
        success: 'Prompt 已保存！'
    }, { prompt: promptData });

    ui.goBack();
    // Request a full data refresh after saving
    postMessageWithResponse('getAppData').then(response => {
        state.appData = response.data;
        state.prompts = response.data.prompts;
        ui.renderAll();
    });
}

async function handleDeletePrompt() {
    if (!state.editingPromptId) return;

    // You might want to add a confirmation modal here
    await handleDataAction('deletePrompt', {
        success: 'Prompt 已删除！'
    }, { id: state.editingPromptId });
    
    ui.goBack();
    // Request a full data refresh
    postMessageWithResponse('getAppData').then(response => {
        state.appData = response.data;
        state.prompts = response.data.prompts;
        ui.renderAll();
    });
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tagValue = dom.tagInputField.value.trim();
        if (tagValue && !state.currentTags.includes(tagValue)) {
            state.currentTags.push(tagValue);
            ui.renderTags();
        }
        dom.tagInputField.value = '';
    }
}


async function fetchAndRenderSettingsStatus() {
    try {
        const response = await postMessageWithResponse('getSystemStatus');
        if (response.data) {
            ui.renderSettingsStatus(response.data);
        }
    } catch (error) {
        console.error("Error fetching system status:", error);
        ui.showToast('无法获取系统状态', 'error');
    }
}


// --- Main Initializer ---

export function initEventListeners() {
    // Event delegation for dynamically created elements
    document.body.addEventListener('click', e => {
        const target = e.target;

        // Back buttons
        if (target.closest('.btn-back')) {
            ui.goBack();
            return;
        }

        // --- Main View ---
        if (target.closest('#add-prompt-btn')) {
            ui.showEditForm(null, true);
        }
        if (target.closest('#manage-categories-btn')) {
            ui.navigateTo('category');
        }
        if (target.closest('#settings-btn')) {
            fetchAndRenderSettingsStatus();
            ui.navigateTo('settings');
        }
         if (target.closest('#filter-btn')) {
            state.stagedFilter = { ...state.filter };
            ui.updateFilterView();
            ui.navigateTo('filter');
        }

        // Category tabs
        const categoryTab = target.closest('.category-tab');
        if (categoryTab) {
            state.filter.category = categoryTab.dataset.category;
            ui.updateCategories();
            ui.renderPrompts();
            return;
        }

        // Prompt item click (for editing)
        const promptItem = target.closest('.prompt-item');
        if (promptItem) {
            const promptId = promptItem.dataset.id;
            // Prevent edit form from opening when clicking the toggle switch
            if (!target.closest('.switch')) {
                ui.showEditForm(promptId);
            }
            return;
        }

        // Tag pill removal
        const removeBtn = target.closest('.tag-remove-btn');
        if (removeBtn) {
            const tagToRemove = removeBtn.dataset.tag;
            state.currentTags = state.currentTags.filter(t => t !== tagToRemove);
            ui.renderTags();
            return;
        }
        
        // --- Category Management View ---
        if (target.closest('#add-new-category-btn')) {
            // Logic to add a new category will be handled here
        }
        const editCategoryBtn = target.closest('.category-actions .btn-edit');
        if (editCategoryBtn) {
            // Logic for editing a category name
        }
        const deleteCategoryBtn = target.closest('.category-actions .btn-delete');
        if (deleteCategoryBtn) {
            // Logic for deleting a category
        }
    });

    // Direct event listeners for non-dynamic elements
    dom.promptForm.addEventListener('submit', handleSavePrompt);
    dom.deletePromptBtn.addEventListener('click', handleDeletePrompt);
    dom.tagInputField.addEventListener('keydown', handleTagInput);
    
    // Search input
    document.getElementById('search-input').addEventListener('input', e => {
        state.filter.searchTerm = e.target.value;
        ui.renderPrompts();
    });

    // --- Filter View controls ---
    document.getElementById('filter-apply-btn')?.addEventListener('click', () => {
        state.filter = { ...state.stagedFilter };
        ui.renderAll();
        ui.goBack();
    });

    document.getElementById('filter-reset-btn')?.addEventListener('click', () => {
        state.stagedFilter = { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] };
        ui.updateFilterView();
    });
    
    document.getElementById('status-options')?.addEventListener('click', e => {
        const statusBtn = e.target.closest('.filter-btn');
        if (statusBtn && state.stagedFilter) {
            state.stagedFilter.status = statusBtn.dataset.status;
            ui.updateFilterView();
        }
    });
    
    document.getElementById('tag-filter-options')?.addEventListener('click', e => {
        const tagBtn = e.target.closest('.filter-btn');
         if (tagBtn && state.stagedFilter) {
            const tag = tagBtn.dataset.tag;
            if (tag === 'all') {
                state.stagedFilter.selectedTags = ['all'];
            } else {
                state.stagedFilter.selectedTags = state.stagedFilter.selectedTags.filter(t => t !== 'all');
                const index = state.stagedFilter.selectedTags.indexOf(tag);
                if (index > -1) {
                    state.stagedFilter.selectedTags.splice(index, 1);
                     if (state.stagedFilter.selectedTags.length === 0) {
                        state.stagedFilter.selectedTags.push('all');
                    }
                } else {
                    state.stagedFilter.selectedTags.push(tag);
                }
            }
            ui.updateFilterView();
        }
    });

     // --- Settings View Actions ---
    document.getElementById('toggle-workspace-mode-btn')?.addEventListener('click', () => {
        handleDataAction('toggleWorkspaceMode', { success: '存储模式已切换' }).then(fetchAndRenderSettingsStatus);
    });

    // Add other settings buttons here... e.g., import, export
}
