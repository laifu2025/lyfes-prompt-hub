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
        categoryManagement: document.getElementById('category-management-view'),
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

    editViewElements: {
        form: document.getElementById('prompt-form'),
        idInput: document.getElementById('prompt-id'),
        titleInput: document.getElementById('prompt-title'),
        promptInput: document.getElementById('prompt-content'),
        categorySelect: document.getElementById('prompt-category'),
        categoryWrapper: document.querySelector('#edit-view .custom-select-wrapper'),
        categoryDropdownMenu: document.getElementById('category-dropdown-menu'),
        tagsInput: document.getElementById('tag-input-field'),
        allTagsContainer: document.getElementById('all-tags-container'),
        saveButton: document.querySelector('#prompt-form button[type="submit"]'),
        backButton: document.querySelector('#edit-view .btn-back'),
        cancelButton: document.getElementById('cancel-edit-btn'),
        deleteButton: document.getElementById('delete-prompt-btn'),
        viewTitle: document.getElementById('edit-view-title'),
    },

    mainViewElements: {
        searchInput: document.getElementById('search-input'),
        filterButton: document.getElementById('filter-btn'),
        addPromptButton: document.getElementById('add-prompt-btn'),
        manageCategoriesButton: document.getElementById('manage-categories-btn'),
        settingsButton: document.getElementById('settings-btn'),
        categoryTabsContainer: document.getElementById('category-tabs-container'),
        promptListContainer: document.getElementById('prompt-list-container'),
        noResultsMessage: document.getElementById('no-results-message'),
    },

    categoryViewElements: {
        view: document.getElementById('category-management-view'),
        addCategoryButton: document.getElementById('add-category-btn'),
        backButton: document.querySelector('#category-management-view .btn-back'),
        container: document.getElementById('category-management-list-container'),
    },

    filterViewElements: {
        view: document.getElementById('filter-view'),
        backButton: document.querySelector('#filter-view .btn-back'),
        statusOptions: document.getElementById('status-options'),
        tagFilterOptions: document.getElementById('tag-filter-options'),
        resetButton: document.getElementById('filter-reset-btn'),
        applyButton: document.getElementById('filter-apply-btn'),
    },

    settingsViewElements: {
        view: document.getElementById('settings-view'),
        backButton: document.querySelector('#settings-view .btn-back'),
        importButton: document.getElementById('import-btn'),
        exportButton: document.getElementById('export-btn'),
        createBackupButton: document.getElementById('create-backup-btn'),
        restoreBackupButton: document.getElementById('restore-backup-btn'),
        
        // Old cloud sync elements (some might be removed or repurposed)
        cloudSyncStatus: document.getElementById('cloud-sync-status'), // This might be removed
        setupCloudSyncButton: document.getElementById('setup-cloud-sync-btn'), // This is now removed

        // New Cloud Sync UI Elements
        cloudSyncEnabledToggle: document.getElementById('cloud-sync-enabled-toggle'),
        cloudSyncConfigContainer: document.getElementById('cloud-sync-config-container'),
        syncProviderSelect: document.getElementById('sync-provider-select'),
        
        // New Summary/Form Containers
        syncSummaryView: document.getElementById('sync-summary-view'),
        syncSettingsForm: document.getElementById('sync-settings-form'),

        githubConfig: {
            container: document.getElementById('github-config'),
            token: document.getElementById('github-token'),
            gistId: document.getElementById('github-gist-id'),
        },
        giteeConfig: {
            container: document.getElementById('gitee-config'),
            token: document.getElementById('gitee-token'),
            gistId: document.getElementById('gitee-gist-id'),
        },
        gitlabConfig: {
            container: document.getElementById('gitlab-config'),
            url: document.getElementById('gitlab-url'),
            token: document.getElementById('gitlab-token'),
            snippetId: document.getElementById('gitlab-snippet-id'),
        },
        webdavConfig: {
            container: document.getElementById('webdav-config'),
            url: document.getElementById('webdav-url'),
            username: document.getElementById('webdav-username'),
            password: document.getElementById('webdav-password'),
        },
        customConfig: {
            container: document.getElementById('custom-config'),
            url: document.getElementById('custom-api-url'),
            apiKey: document.getElementById('custom-api-key'),
        },

        saveSyncSettingsButton: document.getElementById('save-sync-settings-btn'),
        editSyncSettingsButton: document.getElementById('edit-sync-settings-btn'),
        syncToCloudButton: document.getElementById('sync-to-cloud-btn'),
        syncFromCloudButton: document.getElementById('sync-from-cloud-btn'),
        
        // Storage Mode
        storageModeStatus: document.getElementById('storage-mode-status'),
        toggleWorkspaceModeButton: document.getElementById('toggle-workspace-mode-btn'),
        showStorageInfoButton: document.getElementById('show-storage-info-btn'),
    },
};
