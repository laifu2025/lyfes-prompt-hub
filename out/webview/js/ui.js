/**
 * @module ui
 * @description Handles all UI rendering and updates.
 */

import { dom } from './dom.js';
import { state } from './state.js';
import { enterCategoryEditMode } from './events.js';

// --- Main Render Functions ---

export function renderAll() {
    renderPrompts();
    renderCategoryTabs();
    renderCategoryDropdown();
    renderCategoryManagementList();
    if (state.stagedFilter) {
        renderFilterView();
    }
}

export function renderPrompts() {
    const { prompts, filter } = state;
    if (!prompts) return;

    let filtered = prompts.filter(p => {
        const search = filter.searchTerm.toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(search);
        const contentMatch = p.content.toLowerCase().includes(search);
        const statusMatch = filter.status === 'all' || (p.enabled ? 'enabled' : 'disabled') === filter.status;
        const categoryMatch = filter.category === 'all' || p.category === filter.category;
        const selectedTags = filter.selectedTags;
        const tagMatch = selectedTags.includes('all') || (p.tags && p.tags.some(tag => selectedTags.includes(tag)));
        return (titleMatch || contentMatch) && statusMatch && categoryMatch && tagMatch;
    });

    filtered.sort((a, b) => {
        switch (filter.sortBy) {
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

export function renderCategoryTabs() {
    const categories = ['all', ...state.categories];
    const activeCategory = state.filter.category;
    const createHtml = (cat, isActive) => `<button class="btn category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat === 'all' ? '全部' : cat}</button>`;
    dom.categoryTabsContainer.innerHTML = categories.map(c => createHtml(c, activeCategory === c)).join('');
}


// --- View-Specific Renderers ---

export function renderEditView(prompt) {
    dom.promptForm.reset();
    const isCreate = !prompt.id;
    dom.editViewTitle.textContent = isCreate ? '创建 Prompt' : '编辑 Prompt';
    dom.deletePromptBtn.classList.toggle('hidden', isCreate);
    
    dom.promptTitleField.value = prompt.title;
    dom.promptContentField.value = prompt.content;
    dom.promptCategoryField.value = prompt.category;
    
    renderTagsForEdit(prompt.tags);
}

export function renderTagsForEdit(tags) {
    dom.tagPillsContainer.innerHTML = tags.map(tag => `
        <span class="tag-pill">${tag}<button type="button" class="tag-remove-btn" data-tag="${tag}">&times;</button></span>`).join('');
}

export function renderCategoryDropdown() {
    const categories = state.categories || [];
    dom.categoryDropdownMenu.innerHTML = categories.map(cat => `
        <div class="dropdown-item" data-value="${cat}">${cat}</div>
    `).join('');
}

export function renderCategoryManagementList() {
    const categories = state.categories || [];
    const displayCategories = [...categories].filter(c => c !== '未分类').reverse();
    dom.categoryManagement.container.innerHTML = ''; // Clear
    displayCategories.forEach(cat => {
        const item = createCategoryItemElement(cat, false);
        dom.categoryManagement.container.appendChild(item);
    });
}

export function createCategoryItemElement(categoryName, isNew = false) {
    const item = document.createElement('div');
    item.className = 'category-list-item';
    
    item.innerHTML = `
        <span class="category-name">${categoryName}</span>
        <input type="text" class="input-field category-input" value="${categoryName}" style="display: none;" />
        <div class="category-actions">
            <button class="btn-icon save-category-btn" title="保存">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </button>
            <button class="btn-icon cancel-edit-btn" title="取消">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <button class="btn-icon edit-category-btn" title="编辑">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="btn-icon btn-danger delete-category-btn" title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>
    `;

    if (isNew) {
        item.classList.add('editing');
        item.querySelector('.category-name').style.display = 'none';
        const input = item.querySelector('.category-input');
        input.style.display = 'block';
        input.value = '';
        input.placeholder = '输入新分类名称...';
    }

    return item;
}

export function renderFilterView() {
    const { stagedFilter, prompts } = state;
    if (!stagedFilter) return;

    // Status Buttons
    dom.filterView.statusOptions.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === stagedFilter.status);
    });

    // Tag Buttons
    const allTags = prompts.reduce((acc, p) => [...acc, ...(p.tags || [])], []);
    const uniqueTags = ['all', ...new Set(allTags)];
    
    if(dom.filterView.tagOptions) {
        dom.filterView.tagOptions.innerHTML = uniqueTags.map(tag => 
            `<button class="btn filter-btn ${stagedFilter.selectedTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">${tag === 'all' ? '全部' : tag}</button>`
        ).join('');
    }
}

export function renderSettingsStatus(status) {
    if (!status) return;

    const updateBadge = (element, text, statusType) => {
        if (!element) return;
        element.textContent = text;
        element.className = `status-badge ${statusType}`;
    };

    updateBadge(dom.settingsView.cloudStatusBadge, status.cloud.status, status.cloud.type);
    updateBadge(dom.settingsView.storageStatusBadge, status.storage.status, status.storage.type);
}

export function renderBackupList(backups) {
    dom.backupListContainer.innerHTML = backups.map(backup => `
        <div class="data-item" data-filename="${backup.fileName}">
            <div class="data-item-info">${backup.label}</div>
            <div class="data-item-actions">
                <button class="btn-secondary btn-sm restore-single-backup-btn">恢复</button>
            </div>
        </div>
    `).join('') || '<p>没有可用的备份。</p>';
}

// --- UI Helpers ---

let toastTimeoutId;
export function showToast(message, type = 'success', duration = 3000) {
    if (!dom.toastContainer) {
        dom.toastContainer = document.createElement('div');
        dom.toastContainer.id = 'toast-container';
        document.body.appendChild(dom.toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    dom.toastContainer.innerHTML = '';
    dom.toastContainer.appendChild(toast);
    
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.remove();
    }, duration);
}

export function toggleDropdown(dropdownMenu, show) {
    if (show) {
        dropdownMenu.classList.remove('hidden');
    } else {
        dropdownMenu.classList.add('hidden');
    }
} 