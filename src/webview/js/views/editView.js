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

async function handleAllTagsContainerClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.target.classList.contains('delete-tag')) {
        const tagToDelete = e.target.dataset.tag;
        if (!tagToDelete) return;

        try {
            // 使用VS Code确认对话框而不是原生confirm()
            const confirmed = await api.showConfirmation(`确定要从所有 Prompts 中永久删除标签 '${tagToDelete}' 吗？\n\n此操作无法撤销。`);
            if (!confirmed) {
                return;
            }

            // 执行删除操作
            await api.postMessageWithResponse('deleteTag', { tag: tagToDelete });
            api.showToast(`标签 '${tagToDelete}' 已被永久删除。`, 'success');

            // 重新加载标签列表
            await loadAllTags();
            
            // 从当前编辑的标签中移除（如果存在）
            state.currentTags = state.currentTags.filter(tag => tag !== tagToDelete);
            allTagsCache = allTagsCache.filter(tag => tag !== tagToDelete);
            renderTags();
            renderAvailableTags();
            refreshCallback(); // Refresh the full view

        } catch (err) {
            console.error('删除标签失败:', err);
            api.showToast(`删除标签失败: ${err.message || err}`, 'error');
        }
    } else if (e.target.classList.contains('add-tag')) {
        // 添加标签功能
        const tagToAdd = e.target.dataset.tag;
        if (tagToAdd && !state.currentTags.includes(tagToAdd)) {
            state.currentTags.push(tagToAdd);
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
    elements.cancelButton.addEventListener('click', goBack);
    elements.tagsInput.addEventListener('keydown', handleTagInput);
    
    dom.tagPillsContainer.addEventListener('click', handleTagPillRemove);
    elements.allTagsContainer.addEventListener('click', handleAllTagsContainerClick);
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