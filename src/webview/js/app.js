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
            api.postMessageWithResponse('showNotification', { message: '数据已刷新', type: 'info' });
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

function initTooltipListeners() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    const tooltipContent = {
        'github-token': '需要 `gist` 权限的 Personal Access Token。这允许插件创建和管理一个私有的 Gist 来存储您的数据。您的 Token 只会安全地存储在本地。',
        'github-id': 'Gist 的唯一标识符，通常是浏览器地址栏中您用户名后面的一长串字符。如果您留空，插件将在验证成功后自动为您创建一个新的私有 Gist 并填入其 ID。',
        'gitee-token': '需要 `gists` 权限的 Personal Access Token。这允许插件创建和管理一个私有的 Gist 来存储您的数据。您的 Token 只会安全地存储在本地。',
        'gitee-id': 'Gitee Gist 的唯一标识符，通常是浏览器地址栏中您用户名后面的一长串字符。如果您留空，插件将自动为您创建一个新的私有 Gist 并填入其 ID。',
        'gitlab-token': '需要 `api` 权限的 Personal Access Token。这允许插件创建和管理一个私有的 Snippet。您的 Token 只会安全地存储在本地。',
        'gitlab-id': 'GitLab Snippet 的唯一标识符，通常是浏览器地址栏中 `/-/snippets/` 后面的一串数字。如果您留空，插件将自动为您创建一个新的私有 Snippet 并填入其 ID。',
        'gitlab-url': '如果您使用自建的 GitLab 实例，请在此处填写其根 URL，例如 `https://gitlab.yourcompany.com`。如果留空，将默认使用官方的 `https://gitlab.com`。',
        'webdav-url': '您的 WebDAV 服务器的完整访问地址，通常以 `/remote.php/dav/files/` 或类似路径结尾。插件将在此目录下创建一个 `prompt-hub.json` 文件用于同步。',
        'custom-url': '一个支持 `GET` 和 `POST` 请求的 API 端点。`GET` 用于下载数据，`POST` 用于上传。请求体将是 JSON 格式的数据。'
    };

    document.body.addEventListener('mouseover', e => {
        const target = e.target;
        if (target.classList.contains('help-icon')) {
            const key = target.dataset.tooltipKey;
            if (tooltipContent[key]) {
                tooltip.innerHTML = tooltipContent[key];
                tooltip.classList.remove('hidden');
                
                const rect = target.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();

                let top = rect.top - tooltipRect.height - 10;
                let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

                if (top < 0) { // If tooltip goes off-screen top
                    top = rect.bottom + 10;
                }
                if (left < 0) { // Adjust left if it goes off-screen
                    left = 5;
                }
                if (left + tooltipRect.width > window.innerWidth) { // Adjust right
                    left = window.innerWidth - tooltipRect.width - 5;
                }

                tooltip.style.top = `${top}px`;
                tooltip.style.left = `${left}px`;
            }
        }
    });

    document.body.addEventListener('mouseout', e => {
        if (e.target.classList.contains('help-icon')) {
            tooltip.classList.add('hidden');
        }
    });
}

window.addEventListener('load', () => {
    init();
    initTooltipListeners();
});
