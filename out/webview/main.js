(function() {
    const vscode = acquireVsCodeApi();
    const pendingRequests = new Map();
    let requestIdCounter = 0;

    function postMessageWithResponse(type, payload = {}) {
        return new Promise((resolve, reject) => {
            const requestId = `webview-${requestIdCounter++}`;
            pendingRequests.set(requestId, { resolve, reject, type });
            vscode.postMessage({ type, requestId, ...payload });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Note: The message listener is now inside DOMContentLoaded to have access to all scoped functions and variables.
        // This was the fix for the `initialLoad is not defined` error.
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
                // Use VS Code's native notification system for a better user experience.
                vscode.postMessage({
                    type: 'showNotification',
                    message: '数据已刷新',
                    notificationType: 'info'
                });
        } else if (type === 'appDataResponse' && requestId === 'manual_refresh') {
                // Backend initiated data push
            appData = response.data;
            prompts = appData.prompts;
            renderAll();
            } else if (type === 'systemStatusUpdated') {
                // Backend initiated system status update
                if (response.data) {
                    renderSettingsStatus(response.data);
                }
        }
    });

        let appData = null;
        let prompts = [];
        let currentTags = [];
        let appState = {
            viewStack: ['main-view'],
            editingPromptId: null,
            filter: { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] }
        };
        let stagedFilter = null;

        const dom = {
            views: {
                main: document.getElementById('main-view'),
                edit: document.getElementById('edit-view'),
                settings: document.getElementById('settings-view'),
                filter: document.getElementById('filter-view'),
                category: document.getElementById('category-view'),
            },
            categoryManagement: {
                container: document.getElementById('category-list-container'),
                addBtn: document.getElementById('add-category-btn'),
                newCategoryName: document.getElementById('new-category-name'),
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
            categoryDropdownBtn: document.getElementById('category-dropdown-btn'),
            toastContainer: document.getElementById('toast-container'),
            restoreBackupModal: document.getElementById('restore-backup-modal'),
            backupListContainer: document.getElementById('backup-list-container'),
        };

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
            // Filter out '未分类', then reverse the array to show newest first, matching the position of the add box.
            const displayCategories = [...categories].filter(c => c !== '未分类').reverse();

            dom.categoryManagement.container.innerHTML = ''; // Clear the list first
            displayCategories.forEach(cat => {
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

            // Update Status Buttons
            document.querySelectorAll('#status-options .filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.status === stagedFilter.status);
            });

            // Render and Update Tag Buttons
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

        function handleAddNewCategory() {
            // Check if a temporary item already exists
            if (document.querySelector('.category-item[data-is-temp="true"]')) {
                return; // Do nothing if already adding
            }

            const tempItem = createCategoryItemElement('');
            tempItem.dataset.isTemp = 'true'; // Mark as temporary
            dom.categoryManagement.container.prepend(tempItem);
            enterCategoryEditMode(tempItem, true); // Enter edit mode for creating
        }

        async function handleRestoreBackup() {
            try {
                const { data: backupList } = await postMessageWithResponse('getBackupList');
                if (!backupList || backupList.length === 0) {
                    showToast('没有可用的备份文件。', 'info');
                    return;
                }

                dom.backupListContainer.innerHTML = backupList.map(backup => `
                    <div class="data-item" data-backup-path="${backup.path}">
                        <span>${new Date(backup.timestamp).toLocaleString('zh-CN')}</span>
                        <span class="status-badge info">${(backup.size / 1024).toFixed(2)} KB</span>
                    </div>
                `).join('');

                dom.restoreBackupModal.classList.remove('hidden');

                // 为新生成的恢复列表项添加一次性事件监听器
                const listener = async (event) => {
                    const selectedItem = event.target.closest('.data-item');
                    if (selectedItem && selectedItem.dataset.backupPath) {
                        dom.restoreBackupModal.classList.add('hidden');
                        dom.backupListContainer.removeEventListener('click', listener); // 清理监听器

                        await handleDataAction('restoreFromBackup', {
                            loading: '正在从备份中恢复...',
                            success: '数据恢复成功！',
                            error: '恢复失败'
                        }, { path: selectedItem.dataset.backupPath });
                    }
                };
                dom.backupListContainer.addEventListener('click', listener);

                // 添加关闭模态框的逻辑
                const closeModalBtn = dom.restoreBackupModal.querySelector('.close-modal-btn');
                const closeModalListener = () => {
                    dom.restoreBackupModal.classList.add('hidden');
                    dom.backupListContainer.removeEventListener('click', listener); // 同样清理
                    closeModalBtn.removeEventListener('click', closeModalListener);
                };
                closeModalBtn.addEventListener('click', closeModalListener);


            } catch (error) {
                showToast(`获取备份列表失败: ${error.message}`, 'error');
            }
        }

        async function handleSavePrompt(e) {
            e.preventDefault();
            const formData = {
                title: dom.promptTitleField.value.trim(),
                content: dom.promptContentField.value.trim(),
                category: dom.promptCategoryField.value.trim() || '未分类',
                tags: currentTags
            };
            if (!formData.title || !formData.content) return showToast('标题和内容不能为空', 'error');
            
            const id = appState.editingPromptId;
            if (id) {
                appData.prompts = prompts.map(p => p.id === id ? { ...p, ...formData, updatedAt: new Date().toISOString() } : p);
            } else {
                appData.prompts.push({ ...formData, id: `prompt_${Date.now()}`, enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            }

            if (formData.category && !appData.categories.includes(formData.category)) {
                appData.categories.push(formData.category);
            }

            try {
                await postMessageWithResponse('saveAppData', { data: appData });
                prompts = appData.prompts;
                showToast(id ? 'Prompt 已更新' : 'Prompt 已创建', 'success');
                renderAll();
                goBack();
            } catch (error) {
                showToast(`保存失败: ${error.message}`, 'error');
            }
        }
        
        async function handleDeletePrompt() {
            if (!appState.editingPromptId) return;

            try {
                const confirmed = await postMessageWithResponse('showConfirmation', {
                    message: `确定要删除 Prompt "${dom.promptTitleField.value}" 吗？此操作无法撤销。`,
                    confirmLabel: '删除'
                });

                if (confirmed.value) {
                    await handleDataAction(
                        'deletePrompt',
                        { success: 'Prompt 已删除', failure: '删除 Prompt 失败' },
                        { id: appState.editingPromptId }
                    );
                    goBack();
                }
            } catch (error) {
                console.error('Delete confirmation was cancelled or failed.', error);
                // No toast needed if user just cancelled.
            }
        }

        async function handleDeleteCategory(name, buttonElement) {
            const itemElement = buttonElement.closest('.category-item');
            try {
                const confirmed = await postMessageWithResponse('showConfirmation', { message: `确定要删除分类 "${name}" 吗？这会将该分类下的所有 Prompts 移动到 "未分类"。` });
                if (!confirmed) return;

                await postMessageWithResponse('deleteCategory', { categoryName: name });
                
                itemElement?.remove();

                showToast(`分类 "${name}" 已被删除。`, 'info');
                
                // Refresh data in the background
                initialLoad();
            } catch (error) {
                showToast(`删除分类失败: ${error.message}`, 'error');
            }
        }

        async function handleDataAction(action, messages = {}, payload = {}) {
            const {
                start: startMessage = '正在处理...',
                success: successMessage = '操作成功！',
                error: errorMessage = '操作失败'
            } = messages;

            const toastId = showToast(startMessage, 'info', null); // Show persistent toast

            try {
                const response = await postMessageWithResponse(action, payload);
                hideToast(toastId);
                // Use the destructured and defaulted successMessage variable
                showToast(successMessage, 'success');
                // After a successful action, refresh the app state
                    await initialLoad();
                return response;
            } catch (err) {
                hideToast(toastId);
                console.error(`Action ${action} failed:`, err);
                // Use the destructured and defaulted errorMessage variable
                showToast(`${errorMessage}: ${err.message}`, 'error');
                throw err;
            }
        }

        function createToastContainer() {
            const container = document.createElement('div');
            container.id = 'toast-container';
            // Basic styles for the container
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '1001';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '10px';
            document.body.appendChild(container);
            return container;
        }

        function showToast(message, type = 'success', duration = 3000) {
            const toastContainer = document.getElementById('toast-container') || createToastContainer();
            
            const toastId = `toast-${Date.now()}`;
            // 将 Toast 消息转发到扩展主机
            const messageType = type === 'success' ? 'info' : type;
            vscode.postMessage({
                type: 'showNotification',
                message: message,
                notificationType: messageType
            });
        }

        function hideToast(toastId) {
            const toast = document.getElementById(toastId);
            if(toast) toast.remove();
        }

        function renderSettingsStatus(status) {
            if (!status || !status.cloud || !status.storage) {
                console.error("无法更新设置状态：无效的状态对象", status);
                return;
            }
            const { cloud, storage } = status;
        
                const updateBadge = (element, text, statusType) => {
                const el = document.getElementById(element);
                if (!el) return;
                el.textContent = text;
                el.className = 'status-badge'; // Reset classes
                if (statusType) {
                    el.classList.add(`status-${statusType}`);
                    }
                };

            // Cloud Sync Status
            updateBadge('cloud-sync-status', cloud.message, cloud.status);
            document.getElementById('setup-cloud-sync-btn').textContent = cloud.configured ? '重新配置' : '配置同步';
            document.getElementById('sync-to-cloud-btn').disabled = !cloud.canSync;
            document.getElementById('sync-from-cloud-btn').disabled = !cloud.canSync;

            // Storage Mode Status
            updateBadge('storage-mode-status', storage.message, storage.status);
                }

        async function fetchAndRenderSettingsStatus() {
            try {
                const response = await postMessageWithResponse('getSystemStatus');
                if (response.data) {
                    renderSettingsStatus(response.data);
                    }
            } catch (error) {
                console.error("获取设置状态失败:", error);
                showToast(error.message, 'error');
            }
        }
        
        function initEventListeners() {
            document.body.addEventListener('click', async e => {
                // Global back button
                if (e.target.closest('.back-btn')) {
                    goBack();
                }

                // Header buttons
                if (e.target.closest('#add-prompt-btn')) {
                    showEditForm(null, true);
                }
                if (e.target.closest('#filter-btn')) {
                    stagedFilter = JSON.parse(JSON.stringify(appState.filter));
                    updateFilterView();
                    navigateTo('filter');
                }
                if (e.target.closest('#settings-btn')) {
                    fetchAndRenderSettingsStatus();
                    navigateTo('settings');
                }

                // Main View: Prompt List
                if (dom.views.main.contains(e.target)) {
                    const promptItem = e.target.closest('.prompt-item');
                    if (promptItem) {
                        if (e.target.closest('.switch')) {
                            // The switch itself is the target, not the checkbox inside sometimes
                            const checkbox = promptItem.querySelector('input[type="checkbox"]');
                            if (checkbox && e.target !== checkbox) {
                                // clicking the label toggles the checkbox, so we don't need to do it twice.
                                // but we do need the id for the data action.
                            }
                             if (checkbox?.dataset.id) {
                                await handleDataAction('togglePrompt', {}, { id: checkbox.dataset.id });
                            }
                        } else {
                            showEditForm(promptItem.dataset.id);
                        }
                    }

                    if (e.target.classList.contains('category-tab')) {
                        appState.filter.category = e.target.dataset.category;
                        renderAll();
                    }
                }

                // Filter View Buttons
                if (dom.views.filter.contains(e.target)) {
                    if (e.target.closest('#status-options .filter-btn')) {
                        stagedFilter.status = e.target.dataset.status;
                        updateFilterView();
                    }
                    if (e.target.closest('#tag-filter-options .filter-btn')) {
                        const tag = e.target.dataset.tag;
                        if (tag === 'all') {
                            stagedFilter.selectedTags = ['all'];
                        } else {
                            stagedFilter.selectedTags = stagedFilter.selectedTags.filter(t => t !== 'all');
                            const index = stagedFilter.selectedTags.indexOf(tag);
                            if (index > -1) {
                                stagedFilter.selectedTags.splice(index, 1);
                                if (stagedFilter.selectedTags.length === 0) {
                                    stagedFilter.selectedTags.push('all');
                                }
                            } else {
                                stagedFilter.selectedTags.push(tag);
                            }
                        }
                        updateFilterView();
                    }
                    if (e.target.id === 'apply-filter-btn') {
                        appState.filter = JSON.parse(JSON.stringify(stagedFilter));
                        stagedFilter = null;
                        renderAll();
                        goBack();
                    }
                    if (e.target.id === 'reset-filter-btn') {
                        stagedFilter = { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] };
                        updateFilterView();
                    }
                }

                // Category Management View
                if (dom.views.category.contains(e.target)) {
                    if (e.target.closest('#add-category-header-btn')) {
                        // Check if a new item is already added
                        if (document.getElementById('new-category-input')) return;

                        const newItem = createCategoryItemElement('', true);
                        dom.categoryManagement.container.prepend(newItem);
                        const input = newItem.querySelector('input');
                        input.focus();
                        enterCategoryEditMode(newItem, true);
                    }

                    const item = e.target.closest('.category-list-item');
                    if (!item) return;

                    const isEditing = item.classList.contains('editing');

                    if (e.target.closest('.edit-category-btn') && !isEditing) {
                        enterCategoryEditMode(item);
                    } else if (e.target.closest('.delete-category-btn') && !isEditing) {
                        const categoryName = item.querySelector('.category-name').textContent;
                        handleDeleteCategory(categoryName, item);
                    }
                }

                // Edit View: Tag removal
                if (dom.views.edit.contains(e.target)) {
                    if (e.target.classList.contains('tag-remove-btn')) {
                        const tagToRemove = e.target.dataset.tag;
                        currentTags = currentTags.filter(tag => tag !== tagToRemove);
                        renderTags();
                    }

                    if (e.target.id === 'category-dropdown-btn') {
                        dom.categoryDropdownMenu.classList.toggle('hidden');
                    }
                    
                    if (e.target.classList.contains('dropdown-item')) {
                        dom.promptCategoryField.value = e.target.dataset.value;
                        dom.categoryDropdownMenu.classList.add('hidden');
                    }
                }

                // Settings View
                if (dom.views.settings.contains(e.target)) {
                     if (e.target.id === 'manage-categories-btn') {
                        navigateTo('category');
                    }
                    if (e.target.id === 'create-backup-btn') {
                        handleDataAction('createBackup', { success: '备份成功' });
                    }
                    if (e.target.id === 'restore-backup-btn') {
                        handleRestoreBackup();
                    }
                    if (e.target.closest('.storage-option')) {
                        const mode = e.target.closest('.storage-option').dataset.mode;
                        if (mode) {
                            await handleDataAction('switchStorage', { success: `存储模式已切换为 ${mode}` }, { mode });
                            // After switching, refresh the status display
                            fetchAndRenderSettingsStatus();
                        }
                    }
                }
            });

            dom.promptForm.addEventListener('submit', handleSavePrompt);
            dom.deletePromptBtn.addEventListener('click', handleDeletePrompt);
            dom.tagInputField.addEventListener('keydown', handleTagInput);
            
            const searchInput = document.getElementById('search-input');
            searchInput.addEventListener('input', e => {
                appState.filter.searchTerm = e.target.value;
                renderPrompts();
            });

            const sortBySelect = document.getElementById('sort-by-select');
            sortBySelect.addEventListener('change', e => {
                appState.filter.sortBy = e.target.value;
                renderPrompts();
            });
        }

        function enterCategoryEditMode(itemElement, isCreating = false) {
            itemElement.classList.add('editing');
            const label = itemElement.querySelector('.category-label');
            const input = itemElement.querySelector('.category-input');
            
            label.classList.add('hidden');
            input.classList.remove('hidden');
            input.focus();
            input.select();

            const finishEditing = async (saveChanges) => {
                // Remove listeners to prevent memory leaks
                input.removeEventListener('blur', onBlur);
                input.removeEventListener('keydown', onKeydown);
                
                const oldName = itemElement.dataset.categoryName;
                const newName = input.value.trim();

                // On cancel or no change, remove temp item or revert existing item
                if (!saveChanges || !newName || (newName === oldName && !isCreating)) {
                    if (isCreating) {
                        itemElement.remove();
                    } else {
                        input.value = oldName;
                        label.classList.remove('hidden');
                        input.classList.add('hidden');
                        itemElement.classList.remove('editing');
                    }
                    return;
                }
                
                try {
                    if (isCreating) {
                        await postMessageWithResponse('addCategory', { name: newName });
                        showToast(`分类 "${newName}" 已添加`, 'success');
                    } else {
                        await postMessageWithResponse('editCategory', { oldName, newName });
                        showToast('分类已更新', 'success');
                    }
                    // Refresh the entire list to ensure correct data and order
                    initialLoad(); 
                } catch (err) {
                    showToast(`操作失败: ${err.message}`, 'error');
                    // If failed, revert UI
                    if (isCreating) {
                        itemElement.remove();
                    } else {
                        input.value = oldName;
                        label.classList.remove('hidden');
                        input.classList.add('hidden');
                        itemElement.classList.remove('editing');
                    }
                }
            };

            const onBlur = () => finishEditing(true);
            const onKeydown = (e) => {
                if (e.key === 'Enter') {
                    finishEditing(true);
                } else if (e.key === 'Escape') {
                    finishEditing(false);
                }
            };
            
            input.addEventListener('blur', onBlur);
            input.addEventListener('keydown', onKeydown);
        }

        // Helper function to create a category item element
        function createCategoryItemElement(categoryName) {
            const item = document.createElement('div');
            item.className = 'category-item';
            item.dataset.categoryName = categoryName;

            const label = document.createElement('span');
            label.className = 'category-label';
            label.textContent = categoryName;
            item.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'category-input input-field hidden';
            input.value = categoryName;
            item.appendChild(input);

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
            deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
            actions.appendChild(deleteButton);
            
            item.appendChild(actions);

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

        // Call initialLoad once the DOM is ready.
        initialLoad();
        // Initialize all event listeners once.
        initEventListeners();
    });
})();
 