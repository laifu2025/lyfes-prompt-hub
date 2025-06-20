/**
 * @file Main entry point for the webview application.
 * @description This file initializes all the necessary modules and starts the application.
 */

import { initializeApiListener } from './api.js';
import { initializeEventListeners, initialLoad } from './events.js';

// The main function to bootstrap the application
function main() {
    initializeApiListener();
    initializeEventListeners();
    initialLoad();
}

// Wait for the DOM to be fully loaded before running the main function.
document.addEventListener('DOMContentLoaded', main); 