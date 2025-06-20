import { state, dom } from '../state.js';
import * as api from '../api.js';
import { navigateTo, goBack, renderPrompts, updateFilterView } from '../uiManager.js';

function handleSearchInput(e) {
    state.filter.searchTerm = e.target.value;
    renderPrompts();
}

async function openFilterView() {
    try {
        // Always fetch the latest prompts to ensure tags are up-to-date
        const response = await api.postMessageWithResponse('getPrompts');
        if (response && response.data) {
            state.prompts = response.data;
        } else {
            console.warn('Could not refresh prompts for filter view.');
        }
    } catch (error) {
        console.error('Error fetching prompts for filter view:', error);
        // Don't block the UI, proceed with existing state data
    }
    
    // Clear old tags to force re-render with potentially new ones
    if(dom.filterViewElements.tagFilterOptions) {
        dom.filterViewElements.tagFilterOptions.innerHTML = '';
    }

    // Clone the current filter state for editing, so changes aren't applied live
    state.stagedFilter = JSON.parse(JSON.stringify(state.filter));
    updateFilterView();
    navigateTo('filter');
}

function applyFilters() {
    state.filter = JSON.parse(JSON.stringify(state.stagedFilter));
    renderPrompts();
    goBack();
}

function resetFilters() {
    state.stagedFilter = { 
        searchTerm: state.filter.searchTerm, // Keep search term
        sortBy: 'newest', 
        status: 'all', 
        category: 'all', 
        selectedTags: ['all'] 
    };
    updateFilterView();
}

/*
// This logic will be handled by eventHandlers.js
function handleStatusClick(e) {
   // ...
}

function handleTagClick(e) {
    // ...
}
*/

export function init() {
    // All event listeners are now managed in eventHandlers.js
    // dom.mainViewElements.searchInput.addEventListener('input', handleSearchInput);
    // dom.mainViewElements.filterButton.addEventListener('click', openFilterView);

    // // Filter View listeners
    // dom.filterViewElements.applyButton.addEventListener('click', applyFilters);
    // dom.filterViewElements.resetButton.addEventListener('click', resetFilters);
    // dom.filterViewElements.statusOptions.addEventListener('click', handleStatusClick);
    // dom.filterViewElements.tagFilterOptions.addEventListener('click', handleTagClick);
} 