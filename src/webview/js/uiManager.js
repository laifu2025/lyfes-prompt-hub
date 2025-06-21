import { state, dom } from './state.js';
import * as categoryView from './views/categoryView.js';
import * as editView from './views/editView.js';
import * as filterView from './views/filterView.js';
import * as settingsView from './views/settingsView.js';
import * as api from './api.js';

// --- Globals ---
let activeView = 'main';

// --- Navigation ---

export function navigateTo(viewName) {
    const cleanViewName = viewName.replace('-view', '');
    const targetView = dom.views[cleanViewName];
    if (!targetView) {
        console.error(`Navigation failed: View '${cleanViewName}' not found.`);
        return;
    }

    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    targetView.classList.remove('hidden');

    // Special case for views that need rendering upon navigation
    if (cleanViewName === 'categoryManagement') {
        categoryView.render();
    }

    const viewId = `${cleanViewName}-view`;
    if (state.viewStack[state.viewStack.length - 1] !== viewId) {
        state.viewStack.push(viewId);
    }
}

export function goBack() {
    if (state.viewStack.length <= 1) return;

    state.viewStack.pop();
    
    const previousViewId = state.viewStack[state.viewStack.length - 1];
    const cleanViewName = previousViewId.replace('-view', '');
    
    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    if (dom.views[cleanViewName]) {
        dom.views[cleanViewName].classList.remove('hidden');
    } else {
         console.error(`Go back failed: View '${cleanViewName}' not found.`);
         dom.views.main.classList.remove('hidden');
    }
}

// --- Rendering ---

export function renderAll() {
    renderPrompts();
    updateCategories();
    updateFilterView();
    categoryView.render();
    if (state.appData && state.appData.settings) {
        renderSettingsStatus(state.appData.settings);
    }
}

export function renderPrompts() {
    if (!state.prompts) {
        return;
    }
    let filtered = state.prompts.filter(p => {
        if (!p) return false;

        const search = state.filter.searchTerm.toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(search);
        const contentMatch = p.content.toLowerCase().includes(search);

        const statusMatch = state.filter.status === 'all' || (p.isActive ? 'enabled' : 'disabled') === state.filter.status;
        const categoryMatch = state.filter.category === 'all' || p.category === state.filter.category;
        
        const selectedTags = state.filter.selectedTags;
        const tagMatch = selectedTags.includes('all') || (p.tags && p.tags.some(tag => selectedTags.includes(tag)));

        return (titleMatch || contentMatch) && statusMatch && categoryMatch && tagMatch;
    });

    filtered.sort((a, b) => {
        switch (state.filter.sortBy) {
            case 'oldest': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title_asc': return a.title.localeCompare(b.title);
            case 'title_desc': return b.title.localeCompare(a.title);
            default: return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    dom.promptListContainer.innerHTML = filtered.map(p => `
        <div class="prompt-item" data-id="${p.id}">
            <div class="prompt-item-content">
                <div class="prompt-item-title">${p.title}</div>
                <div class="prompt-tags">${(p.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
            <label class="switch" title="${p.isActive ? '启用' : '禁用'}">
                <input type="checkbox" ${p.isActive ? 'checked' : ''} data-id="${p.id}">
                <span class="slider"></span>
            </label>
        </div>`).join('');
    dom.noResultsMessage.classList.toggle('hidden', filtered.length !== 0);
}

export function renderCategoryDropdown() {
    const { categorySelect, categoryDropdownMenu } = dom.editViewElements;
    const categories = state.appData?.categories || [];
    dom.categoryDropdownMenu.innerHTML = categories.map(cat => `
        <div class="dropdown-item" data-value="${cat}">${cat}</div>
    `).join('');
}

export function renderTags() {
    dom.tagPillsContainer.innerHTML = state.currentTags.map(tag => `
        <span class="tag-pill">
            ${tag}
            <button type="button" class="tag-remove-btn" data-tag="${tag}">&times;</button>
        </span>`).join('');
}

export function updateCategories() {
    const categories = ['all', ...(state.appData?.categories || [])];

    const createHtml = (cat, isActive) => `<button class="btn category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? '全部' : cat}</button>`;

    dom.categoryTabsContainer.innerHTML = categories.map(c => createHtml(c, state.filter.category === c)).join('');
    
    renderCategoryDropdown();
}

export function updateFilterView() {
    if (!state.stagedFilter || !state.prompts) return;

    // Update Status Buttons
    document.querySelectorAll('#status-options .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === state.stagedFilter.status);
    });

    // Render Tag Buttons on first load or if they don't exist
    const tagContainer = document.getElementById('tag-filter-options');
    if (tagContainer.children.length === 0) {
        const allTags = state.prompts.reduce((acc, p) => {
            return p && p.tags ? [...acc, ...p.tags] : acc;
        }, []);
        const uniqueTags = ['all', ...new Set(allTags)];
        tagContainer.innerHTML = uniqueTags.map(tag => 
            `<button class="btn filter-btn" data-tag="${tag}">${tag === 'all' ? '全部' : tag}</button>`
        ).join('');
    }

    // Update active state for all tag buttons
    tagContainer.querySelectorAll('.filter-btn').forEach(btn => {
        const tag = btn.dataset.tag;
        const isActive = state.stagedFilter.selectedTags.includes(tag);
        btn.classList.toggle('active', isActive);
    });
}

// --- Forms & UI State ---

export function showEditForm(id, isCreate = false) {
    const { editViewElements: elements } = dom;
    const prompt = isCreate 
        ? { id: null, title: '', content: '', category: '', tags: [] } 
        : state.prompts.find(p => p.id == id);
    
    if (!prompt) {
        console.error('Prompt not found for editing:', id);
        showToast('找不到要编辑的Prompt', 'error');
        return;
    }

    elements.form.reset();
    state.editingPromptId = prompt.id;
    state.currentTags = [...(prompt.tags || [])];

    elements.idInput.value = prompt.id || '';
    elements.titleInput.value = prompt.title;
    elements.promptInput.value = prompt.content; // Changed from prompt.prompt
    elements.categorySelect.value = prompt.category;
    
    renderTags();
    renderCategoryDropdown();
    editView.render();

    elements.viewTitle.textContent = isCreate ? '创建 Prompt' : '编辑 Prompt';
    elements.deleteButton.classList.toggle('hidden', isCreate);
    navigateTo('edit');
}

export function renderSettingsStatus(status) {
    const updateBadge = (element, text, statusType) => {
        if (element) {
            element.textContent = text;
            element.className = `status-badge ${statusType}`;
        }
    };
    if (!status) return;

    const storageModeText = status.storageMode === 'workspace' ? '工作区' : '全局';
    updateBadge(dom.settingsViewElements.storageModeStatus, storageModeText, status.storageMode === 'workspace' ? 'success' : 'info');
    
    settingsView.updateCloudSyncView(status);

    const isEnabled = status.cloudSync;
    dom.settingsViewElements.syncToCloudButton.disabled = !isEnabled;
    dom.settingsViewElements.syncFromCloudButton.disabled = !isEnabled;
}

// --- Toasts (Notifications) ---

/**
 * 使用 VS Code 的原生通知API显示消息。
 * @param {string} message - 要显示的消息.
 * @param {'info' | 'success' | 'warning' | 'error'} type - 通知类型.
 */
export function showToast(message, type = 'info') {
    // 将 'success' 映射到 'info'，因为 VS Code 的原生通知只有这三种
    const notificationType = type === 'success' ? 'info' : type;
    api.showNotification(message, notificationType);
}
