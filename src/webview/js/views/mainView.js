let app;
let api;
let ui;

/**
 * Initializes the Main View module.
 * @param {object} context - The application context.
 */
export function initMainView(context) {
    app = context.app;
    api = context.api;
    ui = context.ui;
    
    initEventListeners();
}

/**
 * Sets up event listeners for the main view.
 */
function initEventListeners() {
    ui.dom.searchInput.addEventListener('input', () => {
        app.setFilter({ searchTerm: ui.dom.searchInput.value });
    });

    ui.dom.addPromptBtn.addEventListener('click', () => {
        app.showEditForm(null, true); // This function needs to be exposed from editView or app
    });
    
    ui.dom.filterBtn.addEventListener('click', () => ui.navigateTo('filter'));
    ui.dom.manageCategoriesBtn.addEventListener('click', () => ui.navigateTo('category'));
    ui.dom.settingsBtn.addEventListener('click', () => ui.navigateTo('settings'));
    
    ui.dom.categoryTabsContainer.addEventListener('click', (e) => {
        const target = e.target.closest('.category-tab');
        if (target) {
            const category = target.dataset.category;
            app.setFilter({ category });
        }
    });

    ui.dom.promptListContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.prompt-item');
        const toggle = e.target.closest('.switch input[type="checkbox"]');

        if (toggle) {
            e.stopPropagation();
            const promptId = toggle.dataset.id;
            const isEnabled = toggle.checked;
            // Optimistically update UI, then send to backend
            api.postMessageWithResponse('updatePromptEnabled', { id: promptId, enabled: isEnabled })
                .catch(err => {
                    // Revert on error
                    toggle.checked = !isEnabled;
                    ui.showToast(`更新失败: ${err.message}`, 'error');
                });
        } else if (item) {
            const promptId = item.dataset.id;
            app.showEditForm(promptId);
        }
    });
}

/**
 * Renders all components of the main view.
 * @param {object} appInstance - The main app instance.
 */
export function renderAll(appInstance) {
    renderPrompts(appInstance);
    renderCategoryTabs(appInstance);
}

/**
 * Renders the list of prompts.
 * @param {object} appInstance - The main app instance.
 */
function renderPrompts(appInstance) {
    const prompts = appInstance.getPrompts();
    const filter = appInstance.getState().filter;

    if (!prompts) return;

    let filtered = prompts.filter(p => {
        const search = filter.searchTerm.toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(search);
        const contentMatch = p.content.toLowerCase().includes(search);

        const statusMatch = filter.status === 'all' || (p.enabled ? 'enabled' : 'disabled') === filter.status;
        const categoryMatch = filter.category === 'all' || p.category === filter.category;
        
        const selectedTags = filter.selectedTags;
        const tagMatch = !selectedTags || selectedTags.includes('all') || (p.tags && p.tags.some(tag => selectedTags.includes(tag)));

        return (titleMatch || contentMatch) && statusMatch && categoryMatch && tagMatch;
    });

    filtered.sort((a, b) => {
        switch (filter.sortBy) {
            case 'oldest': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title_asc': return a.title.localeCompare(b.title);
            case 'title_desc': return b.title.localeCompare(a.title);
            default: return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    ui.dom.promptListContainer.innerHTML = filtered.map(p => `
        <div class="prompt-item" data-id="${p.id}">
            <div class="prompt-item-content">
                <div class="prompt-item-title">${p.title}</div>
                <div class="prompt-tags">${(p.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
            </div>
            <label class="switch" title="${p.enabled ? '启用' : '禁用'}">
                <input type="checkbox" ${p.enabled ? 'checked' : ''} data-id="${p.id}">
                <span class="slider"></span>
            </label>
        </div>`).join('');
    
    ui.dom.noResultsMessage.classList.toggle('hidden', filtered.length > 0);
}

/**
 * Renders the category tabs.
 * @param {object} appInstance - The main app instance.
 */
function renderCategoryTabs(appInstance) {
    const categories = ['all', ...(appInstance.getCategories() || [])];
    const activeCategory = appInstance.getState().filter.category;

    const createHtml = (cat, isActive) => `<button class="btn category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? '全部' : cat}</button>`;

    ui.dom.categoryTabsContainer.innerHTML = categories.map(c => createHtml(c, activeCategory === c)).join('');
}
