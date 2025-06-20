export const state = {
    appData: null,
    prompts: [],
    currentTags: [],
    viewStack: ['main-view'],
    editingPromptId: null,
    filter: { 
        searchTerm: '', 
        sortBy: 'newest', 
        status: 'all', 
        category: 'all', 
        selectedTags: ['all'] 
    },
    stagedFilter: null,
    vscode: acquireVsCodeApi(),
    pendingRequests: new Map(),
    requestIdCounter: 0,
};

export const dom = {
    views: {
        main: document.getElementById('main-view'),
        edit: document.getElementById('edit-view'),
        settings: document.getElementById('settings-view'),
        filter: document.getElementById('filter-view'),
        category: document.getElementById('category-view'),
    },
    categoryManagement: {
        container: document.getElementById('category-list-container'),
        addBtn: document.getElementById('add-new-category-btn'),
    },
    promptListContainer: document.getElementById('prompt-list-container'),
    categoryTabsContainer: document.getElementById('category-tabs-container'),
    noResultsMessage: document.getElementById('no-results-message'),
    promptForm: document.getElementById('prompt-form'),
    promptTitleField: document.getElementById('prompt-title'),
    promptContentField: document.getElementById('prompt-content'),
    promptCategoryField: document.getElementById('prompt-category'),
    categoryDropdownMenu: document.getElementById('category-dropdown-menu'),
    tagInputField: document.getElementById('tag-input-field'),
    tagPillsContainer: document.getElementById('tag-pills-container'),
    deletePromptBtn: document.getElementById('delete-prompt-btn'),
    editViewTitle: document.getElementById('edit-view-title'),
    // Note: Some IDs from the old code were very specific and might be better generalized
    // e.g. 'filter-reset-btn' is inside the filter view.
};
