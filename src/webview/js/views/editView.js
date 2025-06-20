let app;
let api;
let ui;

let currentTags = [];

/**
 * Initializes the Edit View module.
 * @param {object} context - The application context.
 */
export function initEditView(context) {
    app = context.app;
    api = context.api;
    ui = context.ui;
    
    initEventListeners();
}

/**
 * Populates and displays the edit form.
 * @param {object} appInstance - The main app instance.
 * @param {string|null} promptId - The ID of the prompt to edit, or null to create a new one.
 * @param {boolean} [isCreate=false] - Flag indicating if it's a new prompt.
 */
export function showEditForm(appInstance, promptId, isCreate = false) {
    const prompt = isCreate 
        ? { id: null, title: '', content: '', category: '', tags: [] }
        : (appInstance.getPrompts().find(p => p.id == promptId) || null);

    if (!prompt) {
        ui.showToast('找不到要编辑的 Prompt', 'error');
        return;
    }
    
    appInstance.getState().editingPromptId = prompt.id;

    ui.dom.promptForm.reset();
    ui.dom.promptIdField.value = prompt.id || '';
    ui.dom.promptTitleField.value = prompt.title;
    ui.dom.promptContentField.value = prompt.content;
    ui.dom.promptCategoryField.value = prompt.category;
    
    currentTags = [...(prompt.tags || [])];
    renderTags();
    renderCategoryDropdown();

    ui.dom.editViewTitle.textContent = isCreate ? '创建 Prompt' : '编辑 Prompt';
    ui.dom.deletePromptBtn.classList.toggle('hidden', isCreate);
    
    ui.navigateTo('edit');
}

function initEventListeners() {
    ui.dom.promptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSavePrompt();
    });

    ui.dom.cancelEditBtn.addEventListener('click', () => {
        ui.goBack();
    });

    document.getElementById('refresh-edit-view-btn').addEventListener('click', () => {
        const currentId = app.getState().editingPromptId;
        if (currentId) {
            showEditForm(app, currentId, false);
            ui.showToast('表单已刷新', 'info');
        }
    });

    ui.dom.deletePromptBtn.addEventListener('click', handleDeletePrompt);
    ui.dom.tagInputField.addEventListener('keydown', handleTagInput);
    ui.dom.tagPillsContainer.addEventListener('click', handleTagRemoval);

    // Custom category dropdown logic
    ui.dom.promptCategoryField.addEventListener('focus', () => {
        ui.dom.categoryDropdownMenu.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!ui.dom.promptCategoryField.contains(e.target) && !ui.dom.categoryDropdownMenu.contains(e.target)) {
            ui.dom.categoryDropdownMenu.classList.add('hidden');
        }
    });

    ui.dom.categoryDropdownMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
            ui.dom.promptCategoryField.value = item.dataset.value;
            ui.dom.categoryDropdownMenu.classList.add('hidden');
        }
    });
}

function renderTags() {
    ui.dom.tagPillsContainer.innerHTML = currentTags.map(tag => `
        <span class="tag-pill">${tag}<button type="button" class="tag-remove-btn" data-tag="${tag}">&times;</button></span>`).join('');
}

function renderCategoryDropdown() {
    const categories = app.getCategories() || [];
    ui.dom.categoryDropdownMenu.innerHTML = categories
        .filter(c => c !== '未分类')
        .map(cat => `<div class="dropdown-item" data-value="${cat}">${cat}</div>`)
        .join('');
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tagValue = ui.dom.tagInputField.value.trim();
        if (tagValue && !currentTags.includes(tagValue)) {
            currentTags.push(tagValue);
            renderTags();
        }
        ui.dom.tagInputField.value = '';
    }
}

function handleTagRemoval(e) {
    if (e.target.classList.contains('tag-remove-btn')) {
        const tagToRemove = e.target.dataset.tag;
        currentTags = currentTags.filter(tag => tag !== tagToRemove);
        renderTags();
    }
}

function handleSavePrompt() {
    const promptData = {
        id: ui.dom.promptIdField.value || null,
        title: ui.dom.promptTitleField.value.trim(),
        content: ui.dom.promptContentField.value.trim(),
        category: ui.dom.promptCategoryField.value.trim() || '未分类',
        tags: currentTags,
    };

    if (!promptData.title || !promptData.content) {
        ui.showToast('标题和内容不能为空', 'error');
        return;
    }

    app.savePrompt(promptData);
}

function handleDeletePrompt() {
    const promptId = app.getState().editingPromptId;
    if (promptId) {
        // Here you could add a confirmation dialog
        api.postMessageWithResponse('showConfirmation', {
            message: `你确定要删除这个 Prompt 吗? 这个操作无法撤销。`,
        }).then(response => {
            if(response && response.confirmed) {
                app.deletePrompt(promptId);
            }
        });
    }
}
