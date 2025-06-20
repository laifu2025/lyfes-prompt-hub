import { initializeApi, on, postMessageWithResponse } from './api.js';
import { initUIManager, navigateTo, goBack, showToast, dom } from './uiManager.js';
import { initMainView, renderAll as renderMainView } from './views/mainView.js';
import { initEditView, showEditForm as showEditFormActual } from './views/editView.js';
import { initSettingsView, renderSettingsStatus } from './views/settingsView.js';
import { initFilterView, updateFilterView } from './views/filterView.js';
import { initCategoryView, renderCategoryManagementList } from './views/categoryView.js';

class PromptHubApp {
    constructor() {
        this.appData = {
            prompts: [],
            categories: [],
            tags: [],
            systemStatus: {}
        };
        this.appState = {
            editingPromptId: null,
            filter: { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] },
            stagedFilter: null,
            currentTags: [],
        };
        
        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    async init() {
        initializeApi();
        initUIManager();

        this.initEventHandlers();

        // Pass context to each view module
        const viewContext = {
            app: this,
            api: { postMessageWithResponse, on },
            ui: { navigateTo, goBack, showToast, dom }
        };

        initMainView(viewContext);
        initEditView(viewContext);
        initSettingsView(viewContext);
        initFilterView(viewContext);
        initCategoryView(viewContext);

        await this.initialLoad();
    }

    initEventHandlers() {
        on('appDataResponse', (response) => {
            this.appData = response.data;
            this.renderAll();
        });

        on('requestRefresh', () => {
            this.initialLoad();
            showToast('数据已刷新', 'info');
        });

        on('systemStatusUpdated', (response) => {
            if (response.data) {
                this.appData.systemStatus = response.data;
                renderSettingsStatus(this.appData.systemStatus);
            }
        });

        on('error', (response) => {
            console.error('Received an error from the backend:', response.message);
            showToast(response.message, 'error');
        });
    }

    async initialLoad() {
        try {
            const response = await postMessageWithResponse('getAppData');
            if (response.data) {
                this.appData = response.data;
                this.renderAll();
            }
        } catch (error) {
            console.error('Failed to load initial data:', error);
            showToast('初始化数据失败', 'error');
        }
    }

    renderAll() {
        renderMainView(this);
        // The other render functions are called from within the views themselves
        // or triggered by events.
        renderCategoryManagementList(this.appData.categories);
        updateFilterView(this);
    }

    // Methods to be called by views
    getPrompts() { return this.appData.prompts || []; }
    getCategories() { return this.appData.categories || []; }
    getTags() { return this.appData.tags || []; }
    getSystemStatus() { return this.appData.systemStatus || {}; }
    getState() { return this.appState; }
    
    setFilter(newFilter) {
        this.appState.filter = { ...this.appState.filter, ...newFilter };
        this.renderAll();
    }

    setStagedFilter(newFilter) {
        if (!this.appState.stagedFilter) {
            this.appState.stagedFilter = { ...this.appState.filter };
        }
        this.appState.stagedFilter = { ...this.appState.stagedFilter, ...newFilter };
        updateFilterView(this);
    }
    
    applyStagedFilter() {
        if (this.appState.stagedFilter) {
            this.appState.filter = { ...this.appState.stagedFilter };
            this.appState.stagedFilter = null;
            this.renderAll();
            goBack();
        }
    }

    resetStagedFilter() {
        this.appState.stagedFilter = { ...this.appState.filter };
        updateFilterView(this);
    }

    async savePrompt(promptData) {
        try {
            const response = await postMessageWithResponse('savePrompt', { prompt: promptData });
            showToast('Prompt 保存成功!', 'success');
            this.appData = response.data; // Update data with the latest from backend
            this.renderAll();
            goBack();
        } catch (error) {
            showToast(`保存失败: ${error.message}`, 'error');
        }
    }

    async deletePrompt(promptId) {
        try {
            const response = await postMessageWithResponse('deletePrompt', { id: promptId });
            showToast('Prompt 删除成功!', 'success');
            this.appData = response.data; // Update data
            this.renderAll();
            goBack();
        } catch (error) {
            showToast(`删除失败: ${error.message}`, 'error');
        }
    }

    showEditForm(promptId, isCreate = false) {
        showEditFormActual(this, promptId, isCreate);
    }
}

// Instantiate and start the app
new PromptHubApp();
