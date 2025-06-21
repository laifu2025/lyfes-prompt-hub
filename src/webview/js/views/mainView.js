import { dom, state } from '../state.js';
import { showEditForm, updateCategories, renderPrompts, navigateTo } from '../uiManager.js';
import * as api from '../api.js';

function handlePromptItemClick(event) {
    const promptItem = event.target.closest('.prompt-item');
    if (!promptItem) return;

    // Handle switch toggle
    if (event.target.closest('.switch')) {
        const checkbox = event.target.closest('.switch').querySelector('input');
        const promptId = checkbox.dataset.id;
        const isActive = checkbox.checked;
        api.postMessageWithResponse('setPromptActive', { id: promptId, isActive: isActive });
        return; // Stop propagation to prevent opening edit view
    }
    
    // Handle click on item to edit
    const promptId = promptItem.dataset.id;
    if (promptId) {
        showEditForm(promptId, false);
    }
}

function handleCategoryTabClick(e) {
    if (e.target.matches('.category-tab')) {
        const category = e.target.dataset.category;
        state.filter.category = category;
        updateCategories(); // Re-render tabs to show active state
        renderPrompts(); // Re-render prompts for the selected category
    }
}

function handleSearchInput(e) {
    state.filter.searchTerm = e.target.value;
    renderPrompts();
}

function handleAddPrompt() {
    showEditForm(null, true);
}

export function init() {
    dom.mainViewElements.promptListContainer.addEventListener('click', handlePromptItemClick);
    dom.mainViewElements.categoryTabsContainer.addEventListener('click', handleCategoryTabClick);
    dom.mainViewElements.manageCategoriesButton.addEventListener('click', () => navigateTo('categoryManagement'));
    dom.mainViewElements.addPromptButton.addEventListener('click', handleAddPrompt);
    dom.mainViewElements.searchInput.addEventListener('input', handleSearchInput);
    dom.mainViewElements.filterButton.addEventListener('click', () => navigateTo('filter'));
    dom.mainViewElements.settingsButton.addEventListener('click', () => navigateTo('settings'));
}

// TODO: Add listeners for filter, settings, and category management buttons
// dom.mainViewElements.filterButton.addEventListener('click', ...)
// dom.mainViewElements.settingsButton.addEventListener('click', ...) 

export function render() {
    renderPrompts();
} 