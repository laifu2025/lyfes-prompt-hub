/**
 * @module dom
 * @description Caches all DOM element references for easy access.
 */

export const dom = {
    views: {
        main: document.getElementById('main-view'),
        edit: document.getElementById('edit-view'),
        settings: document.getElementById('settings-view'),
        filter: document.getElementById('filter-view'),
        category: document.getElementById('category-view'),
    },
    // Main View
    promptListContainer: document.getElementById('prompt-list-container'),
    categoryTabsContainer: document.getElementById('category-tabs-container'),
    noResultsMessage: document.getElementById('no-results-message'),
    searchInput: document.getElementById('search-input'),
    sortBySelect: document.getElementById('sort-by-select'),
    
    // Edit View
    promptForm: document.getElementById('prompt-form'),
    promptTitleField: document.getElementById('prompt-title'),
    promptContentField: document.getElementById('prompt-content'),
    promptCategoryField: document.getElementById('prompt-category'),
    categoryDropdownBtn: document.getElementById('category-dropdown-btn'),
    categoryDropdownMenu: document.getElementById('category-dropdown-menu'),
    tagInputField: document.getElementById('tag-input-field'),
    tagPillsContainer: document.getElementById('tag-pills-container'),
    deletePromptBtn: document.getElementById('delete-prompt-btn'),
    editViewTitle: document.getElementById('edit-view-title'),

    // Category Management View
    categoryManagement: {
        container: document.getElementById('category-list-container'),
    },

    // Filter View
    filterView: {
        statusOptions: document.getElementById('status-options'),
        tagOptions: document.getElementById('tag-filter-options'),
        applyBtn: document.getElementById('apply-filter-btn'),
        resetBtn: document.getElementById('reset-filter-btn'),
    },

    // Settings View
    settingsView: {
        storageOptions: document.getElementById('storage-options-container'),
        cloudStatusBadge: document.getElementById('cloud-sync-status'),
        storageStatusBadge: document.getElementById('storage-mode-status'),
        backupListContainer: document.getElementById('backup-list-container'),
    },
    
    // Modals & Toasts
    restoreBackupModal: document.getElementById('restore-backup-modal'),
    backupListContainer: document.getElementById('backup-list-container'), // This seems duplicated, but let's keep for now
    toastContainer: document.getElementById('toast-container'),
}; 