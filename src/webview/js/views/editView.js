import { dom, state } from '../state.js';
import { goBack, renderTags, renderCategoryDropdown } from '../uiManager.js';
import * as api from '../api.js';

let allTagsCache = [];
let refreshCallback = () => {};

function renderAvailableTags() {
    const container = dom.editViewElements.allTagsContainer;
    if (!container) return;

    const available = allTagsCache.filter(t => !state.currentTags.includes(t));
    container.innerHTML = available.map(tag => `
        <span class="tag-pill available-tag" data-tag="${tag}">
            ${tag}
            <button type="button" class="tag-remove-btn permanent-delete" data-tag="${tag}" title="永久删除该标签">&times;</button>
        </span>
    `).join('');
    container.classList.toggle('hidden', available.length === 0);
}

function handleAvailableTagClick(e) {
    if (e.target.classList.contains('available-tag')) {
        const tag = e.target.dataset.tag;
        if (tag && !state.currentTags.includes(tag)) {
            state.currentTags.push(tag);
            renderTags();
            renderAvailableTags();
        }
    }
}

function handleFormSubmit(event) {
    event.preventDefault();
    const elements = dom.editViewElements;

    const promptData = {
        title: elements.titleInput.value,
        content: elements.promptInput.value,
        category: elements.categorySelect.value,
        tags: state.currentTags,
    };
    
    const promptId = elements.idInput.value;
    if (promptId) {
        promptData.id = parseInt(promptId, 10);
    }

    api.postMessageWithResponse('savePrompt', { prompt: promptData })
        .then(() => {
            refreshCallback();
            goBack();
            api.showToast('保存成功!');
        })
        .catch(err => {
            console.error('Save failed:', err);
            api.showToast(`保存失败: ${err.message}`, 'error');
        });
}

function handleDelete() {
    if (!state.editingPromptId) return;

    api.postMessageWithResponse('showConfirmation', { message: '确定要删除这个 Prompt 吗？此操作无法撤销。' })
        .then(result => {
            if (result.confirmed) {
                return api.postMessageWithResponse('deletePrompt', { id: state.editingPromptId });
            }
            return Promise.reject('取消删除');
        })
        .then(() => {
            refreshCallback();
            goBack();
            api.showToast('删除成功!');
        })
        .catch(err => {
            if (err !== '取消删除') {
                console.error('Delete failed:', err);
                api.showToast(`删除失败: ${err.message || err}`, 'error');
            }
        });
}

function handleTagInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const tag = e.target.value.trim();
        if (tag && !state.currentTags.includes(tag)) {
            state.currentTags.push(tag);
            if (!allTagsCache.includes(tag)) {
                allTagsCache.push(tag);
                allTagsCache.sort();
            }
            renderTags();
            renderAvailableTags();
        }
        e.target.value = '';
    }
}

function handleTagPillRemove(e) {
    if (e.target.classList.contains('tag-remove-btn')) {
        const tagToRemove = e.target.dataset.tag;
        state.currentTags = state.currentTags.filter(tag => tag !== tagToRemove);
        renderTags();
        renderAvailableTags();
    }
}

function handleTagPillDelete(e) {
    const deleteButton = e.target.closest('.tag-remove-btn.permanent-delete');
    if (deleteButton) {
        const tagToDelete = deleteButton.dataset.tag;
        
        api.postMessageWithResponse('showConfirmation', { message: `确定要从所有 Prompts 中永久删除标签 '${tagToDelete}' 吗？\n\n此操作无法撤销。` })
            .then(result => {
                if (result.confirmed) {
                    return api.postMessageWithResponse('deleteTag', { name: tagToDelete });
                }
                return Promise.reject('取消删除');
            })
            .then(() => {
                api.showToast(`标签 '${tagToDelete}' 已被永久删除。`, 'success');
                // Remove from current view
                state.currentTags = state.currentTags.filter(tag => tag !== tagToDelete);
                allTagsCache = allTagsCache.filter(tag => tag !== tagToDelete);
                renderTags();
                renderAvailableTags();
                // Optionally, trigger a full refresh if other parts of the app need to know
                refreshCallback(true);
            })
            .catch(err => {
                if (err !== '取消删除') {
                    api.showToast(`删除标签失败: ${err.message || err}`, 'error');
                }
            });
    }
}

function handleCategoryDropdownInteraction(e) {
    const { categoryWrapper, categoryDropdownMenu, categorySelect } = dom.editViewElements;

    if (e.target.classList.contains('dropdown-item')) {
        categorySelect.value = e.target.dataset.value;
        categoryDropdownMenu.classList.add('hidden');
        return;
    }

    if (categoryWrapper.contains(e.target)) {
        renderCategoryDropdown();
        categoryDropdownMenu.classList.toggle('hidden');
    } 
    else {
        categoryDropdownMenu.classList.add('hidden');
    }
}

export function render() {
    renderAvailableTags();
}

export function init(refreshFunc) {
    if (refreshFunc) {
        refreshCallback = refreshFunc;
    }

    const { editViewElements: elements } = dom;

    elements.form.addEventListener('submit', handleFormSubmit);
    elements.deleteButton.addEventListener('click', handleDelete);
    elements.cancelButton.addEventListener('click', goBack);
    elements.tagsInput.addEventListener('keydown', handleTagInput);
    
    dom.tagPillsContainer.addEventListener('click', handleTagPillRemove);
    elements.allTagsContainer.addEventListener('click', handleTagPillDelete);
    elements.allTagsContainer.addEventListener('click', handleAvailableTagClick);
    document.addEventListener('click', handleCategoryDropdownInteraction);

    api.postMessageWithResponse('getAllTags')
        .then(tags => {
            allTagsCache = (tags || []).sort();
            renderAvailableTags();
        })
        .catch(err => {
            api.showToast(`加载标签列表失败: ${err.message}`, 'error');
        });
}