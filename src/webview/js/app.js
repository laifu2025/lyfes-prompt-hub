import { state, dom } from './state.js';
import * as api from './api.js';
import { navigateTo, goBack, renderAll, showToast, renderSettingsStatus, renderPrompts } from './uiManager.js';
import * as mainView from './views/mainView.js';
import * as editView from './views/editView.js';
import * as categoryView from './views/categoryView.js';
import * as filterView from './views/filterView.js';
import * as settingsView from './views/settingsView.js';
// Import other views later
// import SettingsView from './views/settingsView.js';
// import FilterView from './views/filterView.js';

async function initialLoad() {
    try {
        const response = await api.postMessageWithResponse('getAppData');
        if (response && response.data) {
            state.appData = response.data;
            state.prompts = response.data.prompts || [];
            renderAll();
        }
        const settings = await api.postMessageWithResponse('getSettings');
        if (settings) {
            renderSettingsStatus(settings);
        }
    } catch (error) {
        console.error("Error during initial load:", error);
        showToast(error.message || '获取初始数据失败', 'error');
    }
}

function init() {
    // Setup communication
    api.initializeApiListener();
    
    // API event handlers
    api.on('appDataUpdated', (data) => {
        state.appData = data;
        state.prompts = data.prompts || [];
        renderAll();
        showToast('数据已自动刷新', 'info');
    });

    api.on('requestRefresh', () => {
        initialLoad();
        showToast('数据已刷新', 'success');
    });

    api.on('error', (errorMessage) => {
        showToast(errorMessage, 'error');
    });

    // Initialize all view modules
    mainView.init();
    editView.init();
    categoryView.init();
    filterView.init();
    settingsView.init();
    
    // Gobal event listeners
    dom.views.main.addEventListener('click', (e) => {
        if (e.target.closest('.btn-back')) {
            goBack();
        }
    });
    
    Object.values(dom.views).forEach(view => {
        const backButton = view.querySelector('.btn-back');
        if(backButton) {
            backButton.addEventListener('click', goBack);
        }
    });

    // Set initial view
    navigateTo('main');
    
    // Initial data load
    initialLoad();
}

window.addEventListener('load', init);
