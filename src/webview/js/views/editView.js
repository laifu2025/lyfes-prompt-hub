import { dom, state } from '../state.js';
import { goBack, showToast, renderTags, renderCategoryDropdown } from '../uiManager.js';
import * as api from '../api.js';

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
            showToast('保存成功!');
            goBack();
            api.postMessageWithResponse('requestRefresh'); // Request data refresh
        })
        .catch(err => {
            showToast(`保存失败: ${err.message}`, 'error');
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
            showToast('删除成功!');
            goBack();
            api.postMessageWithResponse('requestRefresh');
        })
        .catch(err => {
            if (err !== '取消删除') {
                 showToast(`删除失败: ${err.message || err}`, 'error');
            }
        });
}

function handleTagInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const tag = e.target.value.trim();
        if (tag && !state.currentTags.includes(tag)) {
            state.currentTags.push(tag);
            renderTags();
        }
        e.target.value = '';
    }
}

function handleTagPillRemove(e) {
    if (e.target.classList.contains('tag-remove-btn')) {
        const tagToRemove = e.target.dataset.tag;
        state.currentTags = state.currentTags.filter(tag => tag !== tagToRemove);
        renderTags();
    }
}

function handleCategoryDropdownInteraction(e) {
    const { categoryWrapper, categoryDropdownMenu, categorySelect } = dom.editViewElements;

    // Case 1: Click is on a dropdown item
    if (e.target.classList.contains('dropdown-item')) {
        categorySelect.value = e.target.dataset.value;
        categoryDropdownMenu.classList.add('hidden');
        return; // Done
    }

    // Case 2: Click is inside the wrapper (on the input field or arrow)
    if (categoryWrapper.contains(e.target)) {
        // First, make sure the dropdown is populated
        renderCategoryDropdown();
        // Then, toggle its visibility
        categoryDropdownMenu.classList.toggle('hidden');
    } 
    // Case 3: Click is outside the wrapper
    else {
        categoryDropdownMenu.classList.add('hidden');
    }
}


export function init() {
    const { editViewElements: elements } = dom;

    elements.form.addEventListener('submit', handleFormSubmit);
    elements.deleteButton.addEventListener('click', handleDelete);
    elements.cancelButton.addEventListener('click', goBack);
    elements.tagsInput.addEventListener('keydown', handleTagInput);
    
    // These listeners handle the custom dropdown behavior.
    dom.tagPillsContainer.addEventListener('click', handleTagPillRemove);
    document.addEventListener('click', handleCategoryDropdownInteraction);
} 