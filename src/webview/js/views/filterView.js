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

function handleStatusClick(e) {
    const button = e.target.closest('.filter-btn');
    if (button && button.dataset.status) {
        state.stagedFilter.status = button.dataset.status;
        dom.filterViewElements.statusOptions.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    }
}

function handleTagClick(e) {
    const button = e.target.closest('.filter-btn');
    if (button && button.dataset.tag) {
        const tag = button.dataset.tag;
        const tags = state.stagedFilter.selectedTags;

        if (tag === 'all') {
            state.stagedFilter.selectedTags = ['all'];
        } else {
            const index = tags.indexOf(tag);
            if (index > -1) {
                tags.splice(index, 1);
                if (tags.length === 0) {
                    tags.push('all');
                }
            } else {
                // Remove 'all' if a specific tag is selected
                const allIndex = tags.indexOf('all');
                if (allIndex > -1) {
                    tags.splice(allIndex, 1);
                }
                tags.push(tag);
            }
        }
        updateFilterView();
    }
}


export function init() {
    dom.mainViewElements.searchInput.addEventListener('input', handleSearchInput);
    dom.mainViewElements.filterButton.addEventListener('click', openFilterView);

    // Filter View listeners
    dom.filterViewElements.applyButton.addEventListener('click', applyFilters);
    dom.filterViewElements.resetButton.addEventListener('click', resetFilters);
    dom.filterViewElements.statusOptions.addEventListener('click', handleStatusClick);
    dom.filterViewElements.tagFilterOptions.addEventListener('click', handleTagClick);
} 