/**
 * @module state
 * @description Manages the application's state.
 */

// Private state variables
let _appData = {
    prompts: [],
    categories: [],
};
let _appState = {
    viewStack: ['main-view'],
    editingPromptId: null,
    filter: { searchTerm: '', sortBy: 'newest', status: 'all', category: 'all', selectedTags: ['all'] }
};
let _stagedFilter = null;
let _currentTagsInEdit = [];

// Public state object
export const state = {
    get appData() {
        return _appData;
    },
    get prompts() {
        return _appData.prompts || [];
    },
    get categories() {
        return _appData.categories || [];
    },
    get appState() {
        return _appState;
    },
    get filter() {
        return _appState.filter;
    },
    get stagedFilter() {
        return _stagedFilter;
    },
    get currentTagsInEdit() {
        return _currentTagsInEdit;
    },

    setAppData(data) {
        _appData = data;
    },
    
    setPrompts(prompts) {
        _appData.prompts = prompts;
    },

    setCategories(categories) {
        _appData.categories = categories;
    },

    setFilter(newFilter) {
        _appState.filter = newFilter;
    },

    setStagedFilter(newFilter) {
        _stagedFilter = newFilter;
    },

    setEditingPromptId(id) {
        _appState.editingPromptId = id;
    },

    setCurrentTagsInEdit(tags) {
        _currentTagsInEdit = tags;
    },

    addTagToEdit(tag) {
        if (tag && !_currentTagsInEdit.includes(tag)) {
            _currentTagsInEdit.push(tag);
        }
    },

    removeTagFromEdit(tag) {
        _currentTagsInEdit = _currentTagsInEdit.filter(t => t !== tag);
    },

    pushView(viewId) {
        if (_appState.viewStack[_appState.viewStack.length - 1] !== viewId) {
            _appState.viewStack.push(viewId);
        }
    },

    popView() {
        if (_appState.viewStack.length > 1) {
            _appState.viewStack.pop();
        }
        return _appState.viewStack[_appState.viewStack.length - 1];
    }
}; 