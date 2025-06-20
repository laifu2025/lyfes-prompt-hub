import { state, dom } from './state.js';
import * as api from './api.js';
import { navigateTo, goBack, renderAll, showToast, renderSettingsStatus } from './uiManager.js';
import * as mainView from './views/mainView.js';
import * as editView from './views/editView.js';
import * as categoryView from './views/categoryView.js';
import * as settingsView from './views/settingsView.js';
import { initEventListeners } from './eventHandlers.js';
// Import other views later
// import SettingsView from './views/settingsView.js';
// import FilterView from './views/filterView.js';

export async function initialLoad() {
    try {
        const appData = await api.postMessageWithResponse('getAppData');
        if (appData) {
            state.appData = appData;
            state.prompts = appData.prompts || [];
            renderAll();
        }
    } catch (error) {
        console.error("Error during initial load:", error);
        showToast(error.message || '获取初始数据失败', 'error');
    }
}

function init() {
    api.initializeApiListener();
    
    // Listen for manual refresh events triggered from the backend
    window.addEventListener('manualRefresh', (e) => {
        const data = e.detail;
        if (data) {
            state.appData = data;
            state.prompts = data.prompts || [];
            renderAll();
            showToast('数据已手动刷新', 'success');
        }
    });

    window.addEventListener('backendError', (e) => {
        showToast(e.detail, 'error');
    });

    mainView.init();
    editView.init(initialLoad);
    categoryView.init(initialLoad);
    settingsView.init(initialLoad);
    initEventListeners();
    
    Object.values(dom.views).forEach(view => {
        const backButton = view.querySelector('.btn-back');
        if(backButton) {
            backButton.addEventListener('click', goBack);
        }
    });

    navigateTo('main');
    
    initialLoad();
}

window.addEventListener('load', init);
