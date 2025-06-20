/**
 * @module navigation
 * @description Handles view switching and navigation history.
 */

import { dom } from './dom.js';
import { state } from './state.js';

/**
 * Hides all views and shows the one with the specified name.
 * @param {string} viewName - The name of the view to navigate to (e.g., 'main', 'edit').
 */
export function navigateTo(viewName) {
    const cleanViewName = viewName.replace('-view', '');
    const targetView = dom.views[cleanViewName];
    if (!targetView) {
        console.error(`Navigation failed: View '${cleanViewName}' not found.`);
        return;
    }

    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    targetView.classList.remove('hidden');

    const viewId = `${cleanViewName}-view`;
    state.pushView(viewId);
}

/**
 * Navigates to the previous view in the view stack.
 */
export function goBack() {
    const previousViewId = state.popView();
    if (!previousViewId) return;
    
    const cleanViewName = previousViewId.replace('-view', '');
    
    Object.values(dom.views).forEach(v => v.classList.add('hidden'));
    
    if (dom.views[cleanViewName]) {
        dom.views[cleanViewName].classList.remove('hidden');
    } else {
        console.error(`Go back failed: View '${cleanViewName}' not found.`);
        dom.views.main.classList.remove('hidden'); // Fallback to main view
    }
} 