(function() {
    const vscode = acquireVsCodeApi();
    const pendingRequests = new Map();
    let requestIdCounter = 0;

    // --- State Variables ---
    let appData = null;
    let prompts = [];
    let currentTags = [];
    let appState = {
        viewStack: ['main-view'],
        editingPromptId: null,
        filter: { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] }
    };
    let stagedFilter = null;

    // --- DOM Elements (to be populated on DOMContentLoaded) ---
    const dom = {
        views: {},
        categoryManagement: {},
        // other elements will be populated directly
    };

    function postMessageWithResponse(type, payload = {}) {
        return new Promise((resolve, reject) => {
            const requestId = `webview-${requestIdCounter++}`;
            pendingRequests.set(requestId, { resolve, reject, type });
            vscode.postMessage({ type, requestId, ...payload });
        });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        const { requestId, type, ...response } = message;
        if (pendingRequests.has(requestId)) {
            const { resolve, reject, type: requestType } = pendingRequests.get(requestId);
            pendingRequests.delete(requestId);
            if (response.success === false) {
                console.error(`Request ${requestType} (${requestId}) failed:`, response.error);
                reject(new Error(response.error || `操作 '${requestType}' 失败`));
            } else {
                resolve(response);
            }
        } else if (type === 'error') {
            console.error('Received an error from the backend:', response.message);
            showToast(response.message, 'error');
        } else if (type === 'requestRefresh') {
            initialLoad();
            showToast('数据已刷新', 'info');
        } else if (type === 'appDataResponse' && requestId === 'manual_refresh') {
            appData = response.data;
            prompts = appData.prompts;
            renderAll();
        } else if (type === 'systemStatusUpdated') {
            if (response.data) {
                renderSettingsStatus(response.data);
            }
        } else if (type === 'backendReady') {
            // Backend is ready, now we can safely initialize the app.
            // First, populate the DOM object.
            Object.assign(dom.views, {
                main: document.getElementById('main-view'),
                edit: document.getElementById('edit-view'),
                settings: document.getElementById('settings-view'),
                filter: document.getElementById('filter-view'),
                category: document.getElementById('category-view'),
            });
            Object.assign(dom.categoryManagement, {
                container: document.getElementById('category-list-container'),
                addBtn: document.getElementById('add-category-btn'),
                newCategoryName: document.getElementById('new-category-name'),
            });
            Object.assign(dom, {
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
                categoryDropdownBtn: document.getElementById('category-dropdown-btn'),
                toastContainer: document.getElementById('toast-container'),
                restoreBackupModal: document.getElementById('restore-backup-modal'),
                backupListContainer: document.getElementById('backup-list-container'),
            });
            
            // Then, initialize the app.
            initialLoad();
            initEventListeners();
        }
    });
    
    // --- Core Functions ---

    function navigateTo(viewName) {
        const cleanViewName = viewName.replace('-view', '');
        const targetView = dom.views[cleanViewName];
        if (!targetView) {
            console.error(`Navigation failed: View '${cleanViewName}' not found.`);
            return;
        }

        Object.values(dom.views).forEach(v => v.classList.add('hidden'));
        targetView.classList.remove('hidden');

        const viewId = `${cleanViewName}-view`;
        if (appState.viewStack[appState.viewStack.length - 1] !== viewId) {
            appState.viewStack.push(viewId);
        }
    }

    function goBack() {
        if (appState.viewStack.length <= 1) return;
        appState.viewStack.pop();
        const previousViewId = appState.viewStack[appState.viewStack.length - 1];
        const cleanViewName = previousViewId.replace('-view', '');
        Object.values(dom.views).forEach(v => v.classList.add('hidden'));
        if (dom.views[cleanViewName]) {
            dom.views[cleanViewName].classList.remove('hidden');
        } else {
             console.error(`Go back failed: View '${cleanViewName}' not found.`);
             dom.views.main.classList.remove('hidden');
        }
    }

    function renderAll() {
        renderPrompts();
        updateCategories();
        updateFilterView();
        renderCategoryManagementList();
    }

    function renderPrompts() {
        if (!prompts) return;
        let filtered = prompts.filter(p => {
            const search = appState.filter.searchTerm.toLowerCase();
            const titleMatch = p.title.toLowerCase().includes(search);
            const contentMatch = p.content.toLowerCase().includes(search);
            const statusMatch = appState.filter.status === 'all' || (p.enabled ? 'enabled' : 'disabled') === appState.filter.status;
            const categoryMatch = appState.filter.category === 'all' || p.category === appState.filter.category;
            const selectedTags = appState.filter.selectedTags;
            const tagMatch = selectedTags.includes('all') || (p.tags && p.tags.some(tag => selectedTags.includes(tag)));
            return (titleMatch || contentMatch) && statusMatch && categoryMatch && tagMatch;
        });
        filtered.sort((a, b) => {
            switch (appState.filter.sortBy) {
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

    function renderCategoryManagementList() {
        const categories = appData?.categories || [];
        dom.categoryManagement.container.innerHTML = '';
        categories.filter(c => c !== '未分类').forEach(cat => {
            const item = createCategoryItemElement(cat);
            dom.categoryManagement.container.appendChild(item);
        });
    }

    function renderCategoryDropdown() {
        const categories = appData?.categories || [];
        dom.categoryDropdownMenu.innerHTML = categories.map(cat => `
            <div class="dropdown-item" data-value="${cat}">${cat}</div>
        `).join('');
    }

    function renderTags() {
        dom.tagPillsContainer.innerHTML = currentTags.map(tag => `
            <span class="tag-pill">${tag}<button type="button" class="tag-remove-btn" data-tag="${tag}">&times;</button></span>`).join('');
    }

    function updateCategories() {
        const categories = ['all', ...(appData?.categories || [])];
        const createHtml = (cat, isActive) => `<button class="btn category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? '全部' : cat}</button>`;
        dom.categoryTabsContainer.innerHTML = categories.map(c => createHtml(c, appState.filter.category === c)).join('');
        renderCategoryDropdown();
    }

    function updateFilterView() {
        if (!stagedFilter) return;
        document.querySelectorAll('#status-options .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === stagedFilter.status);
        });
        const allTags = prompts.reduce((acc, p) => [...acc, ...p.tags], []);
        const uniqueTags = ['all', ...new Set(allTags)];
        const tagContainer = document.getElementById('tag-filter-options');
        if(tagContainer) {
            tagContainer.innerHTML = uniqueTags.map(tag => 
                `<button class="btn filter-btn ${stagedFilter.selectedTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">${tag === 'all' ? '全部' : tag}</button>`
            ).join('');
        }
    }

    function showEditForm(id, isCreate = false) {
        const prompt = isCreate ? { id: null, title: '', content: '', category: '', tags: [] } : prompts.find(p => p.id == id);
        if (!prompt) return;
        appState.editingPromptId = prompt.id;
        dom.promptForm.reset();
        dom.promptTitleField.value = prompt.title;
        dom.promptContentField.value = prompt.content;
        dom.promptCategoryField.value = prompt.category;
        currentTags = [...prompt.tags];
        renderTags();
        dom.editViewTitle.textContent = isCreate ? '创建 Prompt' : '编辑 Prompt';
        dom.deletePromptBtn.classList.toggle('hidden', isCreate);
        navigateTo('edit');
    }

    function handleTagInput(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tagValue = dom.tagInputField.value.trim();
            if (tagValue && !currentTags.includes(tagValue)) {
                currentTags.push(tagValue);
                renderTags();
            }
            dom.tagInputField.value = '';
        }
    }

    function handleTagRemoval(e) {
        const tagToRemove = e.target.dataset.tag;
        if (tagToRemove) {
            currentTags = currentTags.filter(t => t !== tagToRemove);
            renderTags();
        }
    }

    async function handleRestoreBackup() {
        try {
            const { data: backupList } = await postMessageWithResponse('getBackupList');
            if (!backupList || backupList.length === 0) {
                showToast('没有可用的备份文件。', 'info');
                return;
            }
            dom.backupListContainer.innerHTML = backupList.map(b => `
                <div class="backup-item" data-path="${b.path}">
                    <span>${new Date(b.timestamp).toLocaleString('zh-CN')}</span>
                    <span>(${(b.size / 1024).toFixed(2)} KB)</span>
                </div>
            `).join('');
            dom.restoreBackupModal.classList.remove('hidden');
            const listener = async (event) => {
                if (event.target.closest('.backup-item')) {
                    const path = event.target.closest('.backup-item').dataset.path;
                    await handleDataAction('restoreBackup', {
                        pending: '正在恢复备份...',
                        success: '备份已恢复！',
                        error: '恢复备份失败。'
                    }, { backupPath: path });
                    dom.restoreBackupModal.classList.add('hidden');
                }
            };
            dom.backupListContainer.addEventListener('click', listener, { once: true });
            const closeModalListener = () => {
                dom.restoreBackupModal.classList.add('hidden');
                dom.backupListContainer.removeEventListener('click', listener);
            };
            document.getElementById('cancel-restore-btn').addEventListener('click', closeModalListener, { once: true });
        } catch (error) {
            showToast(`获取备份列表失败: ${error.message}`, 'error');
        }
    }

    async function handleSavePrompt(e) {
        e.preventDefault();
        const id = appState.editingPromptId;
        const newPromptData = {
            id: id,
            title: dom.promptTitleField.value,
            content: dom.promptContentField.value,
            category: dom.promptCategoryField.value || '未分类',
            tags: currentTags,
            enabled: id ? prompts.find(p => p.id == id).enabled : true,
            createdAt: id ? prompts.find(p => p.id == id).createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const action = id ? 'updatePrompt' : 'addPrompt';
        const messages = {
            pending: '正在保存...',
            success: '保存成功！',
            error: '保存失败。'
        };
        const { data: newAppData } = await handleDataAction(action, messages, { prompt: newPromptData });
        if (newAppData) {
            appData = newAppData;
            prompts = newAppData.prompts;
            goBack();
            renderAll();
        }
    }

    async function handleDeletePrompt() {
        const confirmed = await postMessageWithResponse('showConfirmation', { message: '确定要删除这个Prompt吗？' });
        if (confirmed.confirmed) {
            const { data: newAppData } = await handleDataAction('deletePrompt', {
                pending: '正在删除...',
                success: '删除成功！',
                error: '删除失败。'
            }, { id: appState.editingPromptId });
            if (newAppData) {
                appData = newAppData;
                prompts = newAppData.prompts;
                goBack();
                renderAll();
            }
        }
    }

    async function handleAddCategory() {
        const name = dom.categoryManagement.newCategoryName.value.trim();
        if (!name) {
            showToast('分类名称不能为空。', 'warning');
            return;
        }
        const { data: newAppData } = await handleDataAction('addCategory', {
            pending: '正在添加分类...',
            success: '分类已添加。',
            error: '添加分类失败。'
        }, { name });
        if (newAppData) {
            appData = newAppData;
            dom.categoryManagement.newCategoryName.value = '';
            renderCategoryManagementList();
            updateCategories();
        }
    }

    async function handleDeleteCategory(name, buttonElement) {
        const confirmed = await postMessageWithResponse('showConfirmation', { message: `确定要删除分类 "${name}" 吗？此操作将把它下面的所有Prompt移至"未分类"。` });
        if (confirmed.confirmed) {
            buttonElement.disabled = true;
            const { data: newAppData } = await handleDataAction('deleteCategory', {
                pending: '正在删除...',
                success: '分类已删除。',
                error: '删除失败。'
            }, { categoryName: name });
            if (newAppData) {
                appData = newAppData;
                prompts = newAppData.prompts;
                renderCategoryManagementList();
                updateCategories();
            } else {
                buttonElement.disabled = false;
            }
        }
    }

    async function handleDataAction(action, messages = {}, payload = {}) {
        let toastId;
        try {
            if (messages.pending) {
                toastId = showToast(messages.pending, 'info');
            }
            const response = await postMessageWithResponse(action, payload);
            if (messages.pending) hideToast(toastId);
            if (messages.success) showToast(messages.success, 'success');
            return response;
        } catch (error) {
            if (messages.pending) hideToast(toastId);
            if (messages.error) showToast(`${messages.error} ${error.message}`, 'error');
            console.error(`Action ${action} failed:`, error);
            return { success: false, error };
        }
    }
    
    function createToastContainer() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
            return container;
        }
        return document.getElementById('toast-container');
    }

    function showToast(message, type = 'success', duration = 3000) {
        const container = createToastContainer();
        const toastId = `toast-${Date.now()}`;
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => hideToast(toastId), duration);
        return toastId;
    }

    function hideToast(toastId) {
        const toast = document.getElementById(toastId);
        if(toast) toast.remove();
    }

    function renderSettingsStatus(status) {
        if (!status || !status.cloud || !status.storage) return;
        const { cloud, storage } = status;
        const updateBadge = (elementId, text, statusType) => {
            const el = document.getElementById(elementId);
            if (!el) return;
            el.textContent = text;
            el.className = 'status-badge';
            if (statusType) el.classList.add(`status-${statusType}`);
        };
        updateBadge('cloud-sync-status', cloud.message, cloud.status);
        document.getElementById('setup-cloud-sync-btn').textContent = cloud.configured ? '重新配置' : '配置同步';
        document.getElementById('sync-to-cloud-btn').disabled = !cloud.canSync;
        document.getElementById('sync-from-cloud-btn').disabled = !cloud.canSync;
        updateBadge('storage-mode-status', storage.message, storage.status);
    }

    async function fetchAndRenderSettingsStatus() {
        try {
            const response = await postMessageWithResponse('getSystemStatus');
            if (response.data) renderSettingsStatus(response.data);
        } catch (error) {
            console.error("获取设置状态失败:", error);
            showToast(error.message, 'error');
        }
    }

    function initEventListeners() {
        document.body.addEventListener('click', e => {
            const promptItem = e.target.closest('.prompt-item');
            if (promptItem) {
                const switchInput = e.target.closest('.switch input');
                if (switchInput) return; // handled by 'change' event
                showEditForm(promptItem.dataset.id);
            }

            const categoryTab = e.target.closest('.category-tab');
            if (categoryTab) {
                appState.filter.category = categoryTab.dataset.category;
                renderAll();
            }
            
            if (e.target.closest('#tag-pills-container')) {
                handleTagRemoval(e);
            }

            const backBtn = e.target.closest('.btn-back');
            if(backBtn) goBack();

            const dropdownItem = e.target.closest('.dropdown-item');
            if(dropdownItem) {
                dom.promptCategoryField.value = dropdownItem.dataset.value;
                dom.categoryDropdownMenu.classList.add('hidden');
            }
        });

        document.getElementById('search-input').addEventListener('input', e => {
            appState.filter.searchTerm = e.target.value;
            renderPrompts();
        });

        dom.promptForm.addEventListener('submit', handleSavePrompt);
        dom.promptCategoryField.addEventListener('focus', renderCategoryDropdown);
        dom.promptCategoryField.addEventListener('blur', () => setTimeout(() => dom.categoryDropdownMenu.classList.add('hidden'), 150));
        dom.tagInputField.addEventListener('keydown', handleTagInput);
        document.getElementById('add-prompt-btn').addEventListener('click', () => showEditForm(null, true));
        document.getElementById('cancel-edit-btn').addEventListener('click', goBack);
        document.getElementById('delete-prompt-btn').addEventListener('click', handleDeletePrompt);
        document.getElementById('settings-btn').addEventListener('click', () => {
            navigateTo('settings');
            fetchAndRenderSettingsStatus();
        });
        document.getElementById('manage-categories-btn').addEventListener('click', () => navigateTo('category'));
        document.getElementById('add-category-btn').addEventListener('click', handleAddCategory);
        dom.categoryManagement.container.addEventListener('click', e => {
            const deleteBtn = e.target.closest('.delete-category-btn');
            if (deleteBtn) {
                const item = e.target.closest('.category-item');
                handleDeleteCategory(item.dataset.categoryName, deleteBtn);
            }
            const editBtn = e.target.closest('.edit-category-btn');
            if (editBtn) {
                const item = e.target.closest('.category-item');
                enterCategoryEditMode(item);
            }
        });
        document.getElementById('import-btn').addEventListener('click', async () => {
            const { data: newAppData } = await handleDataAction('importData', {
                pending: '正在导入...',
                success: '导入成功！',
                error: '导入失败。'
            });
            if (newAppData) {
                appData = newAppData;
                prompts = newAppData.prompts;
                renderAll();
            }
        });
        document.getElementById('export-btn').addEventListener('click', () => handleDataAction('exportData', { success: '导出成功！', error: '导出失败。' }));
        document.getElementById('create-backup-btn').addEventListener('click', () => handleDataAction('createBackup', { success: '备份已创建！', error: '创建备份失败。' }));
        document.getElementById('restore-backup-btn').addEventListener('click', handleRestoreBackup);
        document.getElementById('setup-cloud-sync-btn').addEventListener('click', () => handleDataAction('setupCloudSync', { success: '云同步设置完成！', error: '设置失败。' }));
        document.getElementById('sync-to-cloud-btn').addEventListener('click', () => handleDataAction('syncToCloud', { success: '已同步到云端！', error: '上传失败。' }));
        document.getElementById('sync-from-cloud-btn').addEventListener('click', () => handleDataAction('syncFromCloud', { success: '已从云端同步！', error: '下载失败。' }));
        document.getElementById('switch-storage-mode-btn').addEventListener('click', () => handleDataAction('toggleWorkspaceMode', {
            pending: '正在切换模式...',
            success: '存储模式已切换。',
            error: '切换模式失败。'
        }));
        document.getElementById('view-storage-info-btn').addEventListener('click', () => handleDataAction('showStorageInfo'));

        document.getElementById('filter-btn').addEventListener('click', () => {
            stagedFilter = JSON.parse(JSON.stringify(appState.filter)); // Deep copy
            updateFilterView();
            navigateTo('filter');
        });
        document.getElementById('filter-apply-btn').addEventListener('click', () => {
            appState.filter = stagedFilter;
            goBack();
            renderAll();
        });
        document.getElementById('filter-reset-btn').addEventListener('click', () => {
            stagedFilter = { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] };
            updateFilterView();
        });
        document.getElementById('filter-view').addEventListener('click', e => {
            const statusBtn = e.target.closest('#status-options .filter-btn');
            if(statusBtn) {
                stagedFilter.status = statusBtn.dataset.status;
                updateFilterView();
            }
            const tagBtn = e.target.closest('#tag-filter-options .filter-btn');
            if(tagBtn) {
                const tag = tagBtn.dataset.tag;
                if (tag === 'all') {
                    stagedFilter.selectedTags = ['all'];
                } else {
                    stagedFilter.selectedTags = stagedFilter.selectedTags.filter(t => t !== 'all');
                    const index = stagedFilter.selectedTags.indexOf(tag);
                    if (index > -1) {
                        stagedFilter.selectedTags.splice(index, 1);
                        if(stagedFilter.selectedTags.length === 0) stagedFilter.selectedTags.push('all');
                    } else {
                        stagedFilter.selectedTags.push(tag);
                    }
                }
                updateFilterView();
            }
        });
    }

    function enterCategoryEditMode(itemElement) {
        const label = itemElement.querySelector('.category-label');
        const input = itemElement.querySelector('.category-input');
        const oldName = itemElement.dataset.categoryName;
        
        label.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();
        
        const finishEditing = async (saveChanges) => {
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKeydown);
            const newName = input.value.trim();
            
            if (saveChanges && newName && newName !== oldName) {
                const { data: newAppData } = await handleDataAction('editCategory', {
                    pending: '正在更新分类...',
                    success: '分类已更新。',
                    error: '更新分类失败。'
                }, { oldName, newName });
                if (newAppData) {
                    appData = newAppData;
                    prompts = newAppData.prompts;
                    itemElement.dataset.categoryName = newName;
                    label.textContent = newName;
                }
            } else {
                input.value = oldName;
            }
            
            input.classList.add('hidden');
            label.classList.remove('hidden');
        };
        
        const onBlur = () => finishEditing(true);
        const onKeydown = (e) => {
            if (e.key === 'Enter') finishEditing(true);
            if (e.key === 'Escape') finishEditing(false);
        };
        
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKeydown);
    }

    function createCategoryItemElement(categoryName) {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.dataset.categoryName = categoryName;

        // This is the flex container
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'category-item-content-wrapper'; // A new class for flex styling

        const label = document.createElement('span');
        label.className = 'category-label';
        label.textContent = categoryName;
        contentWrapper.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'category-input input-field hidden';
        input.value = categoryName;
        contentWrapper.appendChild(input);

        const actions = document.createElement('div');
        actions.className = 'category-actions';

        const editButton = document.createElement('button');
        editButton.className = 'btn-icon edit-category-btn';
        editButton.title = '编辑';
        editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`;
        actions.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-icon delete-category-btn';
        deleteButton.title = '删除';
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-1.157.234-2.11.83-2.812 1.686C2.47 6.67 2 7.545 2 8.414V15a2 2 0 002 2h12a2 2 0 002-2V8.414c0-.87-.47-1.744-1.188-2.535C16.11 5.022 15.158 4.426 14 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM7.5 3.75c0-.966.784-1.75 1.75-1.75h1.5a1.75 1.75 0 011.75 1.75v.443c-.472.066-.93.188-1.364.364a3.001 3.001 0 01-2.772 0c-.434-.176-.892-.298-1.364-.364v-.443zM10 8a1 1 0 011 1v4a1 1 0 11-2 0V9a1 1 0 011-1z" clip-rule="evenodd" /></svg>`;
        actions.appendChild(deleteButton);
        
        contentWrapper.appendChild(actions);
        item.appendChild(contentWrapper);

        return item;
    }

    async function initialLoad() {
        try {
            const response = await postMessageWithResponse('getAppData');
            appData = response.data;
            prompts = appData.prompts || [];
            renderAll();
        } catch (error) {
            console.error('Initial load failed:', error);
            showToast('加载数据失败，请刷新重试。', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        // The main initialization logic is now triggered by the 'backendReady' message.
        // This listener is kept in case any setup is needed right after the DOM loads,
        // before the backend is necessarily ready. For now, it's empty.
    });
})();
 