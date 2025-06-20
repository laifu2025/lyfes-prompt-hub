import { state, dom } from './state.js';

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
    renderCategoryManagementList();
}

export function renderPrompts() {
    if (!state.prompts) return;
    let filtered = state.prompts.filter(p => {
        const search = state.filter.searchTerm.toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(search);
        const contentMatch = p.content.toLowerCase().includes(search);

        const statusMatch = state.filter.status === 'all' || (p.enabled ? 'enabled' : 'disabled') === state.filter.status;
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
                <div class="prompt-tags">${p.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
            <label class="switch" title="${p.enabled ? '启用' : '禁用'}">
                <input type="checkbox" ${p.enabled ? 'checked' : ''} data-id="${p.id}">
                <span class="slider"></span>
            </label>
        </div>`).join('');
    dom.noResultsMessage.classList.toggle('hidden', filtered.length !== 0);
}

export function renderCategoryManagementList() {
    const categories = state.appData?.categories || [];
    dom.categoryManagement.container.innerHTML = ''; // Clear the list first
    categories.filter(c => c !== '未分类').forEach(cat => {
        const item = createCategoryItemElement(cat);
        dom.categoryManagement.container.appendChild(item);
    });
}

function createCategoryItemElement(categoryName) {
    const item = document.createElement('div');
    item.className = 'category-list-item';
    item.dataset.categoryName = categoryName;

    item.innerHTML = `
        <span class="category-name">${categoryName}</span>
        <div class="category-actions">
            <button class="btn-icon btn-edit" title="重命名">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
            </button>
            <button class="btn-icon btn-delete" title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-1.157.24-2.14.733-2.924 1.416C.507 7.74 1.454 11.233 3.69 13.47c2.236 2.236 5.73 3.184 7.965 1.615.783-.55 1.276-1.355 1.416-2.924h.443A2.75 2.75 0 0019 10.25v-1.5A2.75 2.75 0 0016.25 6h-.443c-.24-1.157-.733-2.14-1.416-2.924C12.26.507 8.767 1.454 6.53 3.69 4.295 5.925 3.346 9.42 4.915 11.655c.55.783 1.355 1.276 2.924 1.416v.443A2.75 2.75 0 0010.25 16h1.5A2.75 2.75 0 0014.5 13.25v-.443c1.157-.24 2.14-.733 2.924-1.416C19.493 9.26 18.546 5.767 16.31 3.53c-2.236-2.236-5.73-3.184-7.965-1.615-.783.55-1.276 1.355-1.416 2.924H6.5A1.25 1.25 0 015.25 6.5v-1.5A1.25 1.25 0 016.5 3.75h1.5A1.25 1.25 0 019.25 5v1.5A1.25 1.25 0 018 7.75h-1.5A1.25 1.25 0 015.25 6.5v-1.5A1.25 1.25 0 016.5 3.75h1.5A1.25 1.25 0 019.25 5v1.5A1.25 1.25 0 018 7.75h-1.5A1.25 1.25 0 015.25 6.5z" clip-rule="evenodd" /></svg>
            </button>
        </div>
    `;
    return item;
}


export function renderCategoryDropdown() {
    const categories = state.appData?.categories || [];
    dom.categoryDropdownMenu.innerHTML = categories.map(cat => `
        <div class="dropdown-item" data-value="${cat}">${cat}</div>
    `).join('');
}

export function renderTags() {
    dom.tagPillsContainer.innerHTML = state.currentTags.map(tag => `
        <span class="tag-pill">${tag}<button type="button" class="tag-remove-btn" data-tag="${tag}">&times;</button></span>`).join('');
}

export function updateCategories() {
    const categories = ['all', ...(state.appData?.categories || [])];

    const createHtml = (cat, isActive) => `<button class="btn category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? '全部' : cat}</button>`;

    dom.categoryTabsContainer.innerHTML = categories.map(c => createHtml(c, state.filter.category === c)).join('');
    
    renderCategoryDropdown();
}

export function updateFilterView() {
    if (!state.stagedFilter) return;

    // Update Status Buttons
    document.querySelectorAll('#status-options .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === state.stagedFilter.status);
    });

    // Render and Update Tag Buttons
    const allTags = state.prompts.reduce((acc, p) => [...acc, ...p.tags], []);
    const uniqueTags = ['all', ...new Set(allTags)];
    
    const tagContainer = document.getElementById('tag-filter-options');
    if(tagContainer) {
        tagContainer.innerHTML = uniqueTags.map(tag => 
            `<button class="btn filter-btn ${state.stagedFilter.selectedTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">${tag === 'all' ? '全部' : tag}</button>`
        ).join('');
    }
}

// --- Forms & UI State ---

export function showEditForm(id, isCreate = false) {
    const prompt = isCreate ? { id: null, title: '', content: '', category: '', tags: [] } : state.prompts.find(p => p.id == id);
    if (!prompt) return;
    state.editingPromptId = prompt.id;
    dom.promptForm.reset();
    dom.promptTitleField.value = prompt.title;
    dom.promptContentField.value = prompt.content;
    dom.promptCategoryField.value = prompt.category;
    state.currentTags = [...prompt.tags];
    renderTags();
    dom.editViewTitle.textContent = isCreate ? '创建 Prompt' : '编辑 Prompt';
    dom.deletePromptBtn.classList.toggle('hidden', isCreate);
    navigateTo('edit');
}

export function renderSettingsStatus(status) {
    const updateBadge = (element, text, statusType) => {
        if (element) {
            element.textContent = text;
            element.className = `status-badge ${statusType}`;
        }
    };
    updateBadge(document.getElementById('storage-mode-status'), status.storageMode, status.storageMode === 'workspace' ? 'success' : 'info');
    updateBadge(document.getElementById('cloud-sync-status'), status.cloudSync.status, 'info'); // Simplified
}


// --- Toasts (Notifications) ---
let toastQueue = [];
let isToastVisible = false;

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

export function showToast(message, type = 'success', duration = 3000) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastQueue.push({ element: toast, duration });
    if (!isToastVisible) {
        processToastQueue();
    }
}

function processToastQueue() {
    if (toastQueue.length === 0) {
        isToastVisible = false;
        return;
    }
    isToastVisible = true;
    const { element, duration } = toastQueue.shift();
    const toastContainer = document.getElementById('toast-container');
    toastContainer.appendChild(element);

    setTimeout(() => {
        element.classList.add('show');
    }, 10); // Small delay to allow CSS transition

    setTimeout(() => {
        element.classList.remove('show');
        setTimeout(() => {
            if (element.parentNode === toastContainer) {
                 toastContainer.removeChild(element);
            }
            processToastQueue();
        }, 500); // Wait for fade out animation
    }, duration);
}
