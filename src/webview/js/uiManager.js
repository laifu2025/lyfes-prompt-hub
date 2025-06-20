/**
 * Caches frequently accessed DOM elements.
 * @type {Object<string, HTMLElement|Object<string, HTMLElement>>}
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
    addPromptBtn: document.getElementById('add-prompt-btn'),
    filterBtn: document.getElementById('filter-btn'),
    manageCategoriesBtn: document.getElementById('manage-categories-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    
    // Edit View
    editView: document.getElementById('edit-view'),
    promptForm: document.getElementById('prompt-form'),
    promptIdField: document.getElementById('prompt-id'),
    promptTitleField: document.getElementById('prompt-title'),
    promptContentField: document.getElementById('prompt-content'),
    promptCategoryField: document.getElementById('prompt-category'),
    categoryDropdownMenu: document.getElementById('category-dropdown-menu'),
    tagInputField: document.getElementById('tag-input-field'),
    tagPillsContainer: document.getElementById('tag-pills-container'),
    deletePromptBtn: document.getElementById('delete-prompt-btn'),
    editViewTitle: document.getElementById('edit-view-title'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    
    // Settings View
    settingsView: document.getElementById('settings-view'),
    importBtn: document.getElementById('import-btn'),
    exportBtn: document.getElementById('export-btn'),
    
    // Filter View
    filterView: document.getElementById('filter-view'),
    statusOptions: document.getElementById('status-options'),
    tagFilterOptions: document.getElementById('tag-filter-options'),
    filterResetBtn: document.getElementById('filter-reset-btn'),
    filterApplyBtn: document.getElementById('filter-apply-btn'),

    // Category View
    categoryView: document.getElementById('category-view'),
    categoryListContainer: document.getElementById('category-list-container'),
    addNewCategoryBtn: document.getElementById('add-new-category-btn'),

    // Common
    backButtons: document.querySelectorAll('.btn-back'),
    helpModal: document.getElementById('help-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
};

const viewStack = ['main-view'];

/**
 * Navigates to a specific view.
 * @param {string} viewName - The name of the view to navigate to (e.g., 'edit').
 */
export function navigateTo(viewName) {
    const targetView = dom.views[viewName];
    if (!targetView) {
        console.error(`Navigation failed: View '${viewName}' not found.`);
        return;
    }

    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    targetView.classList.remove('hidden');

    const viewId = `${viewName}-view`;
    if (viewStack[viewStack.length - 1] !== viewId) {
        viewStack.push(viewId);
    }
}

/**
 * Navigates to the previous view in the stack.
 */
export function goBack() {
    if (viewStack.length <= 1) return;

    viewStack.pop();
    
    const previousViewId = viewStack[viewStack.length - 1];
    const viewName = previousViewId.replace('-view', '');
    
    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    if (dom.views[viewName]) {
        dom.views[viewName].classList.remove('hidden');
    } else {
        console.error(`Go back failed: View '${viewName}' not found.`);
        navigateTo('main'); // Fallback to main view
    }
}

/**
 * Shows a modal by its ID.
 * @param {string} modalId - The ID of the modal overlay to show.
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Hides a modal by its ID.
 * @param {string} modalId - The ID of the modal overlay to hide.
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Creates and shows a toast message.
 * @param {string} message - The message to display.
 * @param {'success' | 'error' | 'info'} [type='info'] - The type of the toast.
 * @param {number} [duration=3000] - The duration to show the toast in ms.
 */
export function showToast(message, type = 'info', duration = 3000) {
    // This function can be expanded to create a more sophisticated toast notification system
    console.log(`[Toast-${type.toUpperCase()}]: ${message}`);
    postMessageWithResponse('showNotification', { message, notificationType: type });
}

/**
 * Initializes the UI Manager, primarily setting up global event listeners.
 */
export function initUIManager() {
    dom.backButtons.forEach(button => {
        button.addEventListener('click', goBack);
    });

    if (dom.modalCloseBtn) {
        dom.modalCloseBtn.addEventListener('click', () => hideModal('help-modal'));
    }
}
