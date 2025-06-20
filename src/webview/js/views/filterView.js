let app;
let api;
let ui;

/**
 * Initializes the Filter View module.
 * @param {object} context - The application context.
 */
export function initFilterView(context) {
    app = context.app;
    api = context.api;
    ui = context.ui;
    
    initEventListeners();
}

/**
 * Sets up event listeners for the filter view.
 */
function initEventListeners() {
    ui.dom.statusOptions.addEventListener('click', (e) => {
        const target = e.target.closest('.filter-btn');
        if (target) {
            app.setStagedFilter({ status: target.dataset.status });
        }
    });

    ui.dom.tagFilterOptions.addEventListener('click', (e) => {
        const target = e.target.closest('.filter-btn');
        if (target) {
            const tag = target.dataset.tag;
            const currentSelected = app.getState().stagedFilter.selectedTags || [];
            
            let newSelected;
            if (tag === 'all') {
                newSelected = ['all'];
            } else {
                const tempSelected = currentSelected.filter(t => t !== 'all');
                const index = tempSelected.indexOf(tag);
                if (index > -1) {
                    tempSelected.splice(index, 1);
                } else {
                    tempSelected.push(tag);
                }
                newSelected = tempSelected.length > 0 ? tempSelected : ['all'];
            }
            app.setStagedFilter({ selectedTags: newSelected });
        }
    });

    ui.dom.filterApplyBtn.addEventListener('click', () => {
        app.applyStagedFilter();
    });

    ui.dom.filterResetBtn.addEventListener('click', () => {
        app.resetStagedFilter();
    });
}

/**
 * Updates the filter view UI based on the staged filter state.
 * @param {object} appInstance - The main app instance.
 */
export function updateFilterView(appInstance) {
    const stagedFilter = appInstance.getState().stagedFilter;
    if (!stagedFilter) return;

    // Update Status Buttons
    ui.dom.statusOptions.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === stagedFilter.status);
    });

    // Render and Update Tag Buttons
    const allTags = appInstance.getPrompts().reduce((acc, p) => [...acc, ...(p.tags || [])], []);
    const uniqueTags = ['all', ...new Set(allTags)];
    
    ui.dom.tagFilterOptions.innerHTML = uniqueTags.map(tag => 
        `<button class="btn filter-btn ${stagedFilter.selectedTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">${tag === 'all' ? '全部' : tag}</button>`
    ).join('');
}
