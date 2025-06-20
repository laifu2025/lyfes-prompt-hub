let app;
let api;
let ui;

/**
 * Initializes the Category View module.
 * @param {object} context - The application context.
 */
export function initCategoryView(context) {
    app = context.app;
    api = context.api;
    ui = context.ui;

    initEventListeners();
}

/**
 * Sets up event listeners for the category view.
 */
function initEventListeners() {
    ui.dom.addNewCategoryBtn.addEventListener('click', handleAddNewCategory);
    
    ui.dom.categoryListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-category-btn')) {
            const item = e.target.closest('.category-item');
            enterCategoryEditMode(item);
        } else if (e.target.classList.contains('delete-category-btn')) {
            const item = e.target.closest('.category-item');
            const categoryName = item.querySelector('.category-name').textContent;
            handleDeleteCategory(categoryName, item);
        }
    });
}

/**
 * Renders the list of categories for management.
 * @param {string[]} categories - The array of category names.
 */
export function renderCategoryManagementList(categories = []) {
    ui.dom.categoryListContainer.innerHTML = ''; // Clear the list first
    categories
        .filter(c => c !== '未分类' && c !== 'all')
        .forEach(cat => {
            const item = createCategoryItemElement(cat);
            ui.dom.categoryListContainer.appendChild(item);
        });
}

function createCategoryItemElement(categoryName) {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
        <span class="category-name">${categoryName}</span>
        <div class="category-actions">
            <button class="btn-icon edit-category-btn" title="编辑分类">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-10 10a2 2 0 01-2.828 0l-2.828-2.828a2 2 0 010-2.828l10-10zM10.5 7.5L6 12l-1.5-1.5L9 6l1.5 1.5z" /></svg>
            </button>
            <button class="btn-icon delete-category-btn" title="删除分类">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-1.157.234-2.11.845-2.8 1.636A13.097 13.097 0 001.01 9.854a.75.75 0 000 .292A13.097 13.097 0 003.2 14.17a10.966 10.966 0 002.8 1.636v.443A2.75 2.75 0 008.75 19h2.5A2.75 2.75 0 0014 16.25v-.443a10.966 10.966 0 002.8-1.636 13.097 13.097 0 002.19-4.324.75.75 0 000-.292 13.097 13.097 0 00-2.19-4.324A10.966 10.966 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 0110 5zm0 10a.75.75 0 01-.75-.75v-2.5a.75.75 0 011.5 0v2.5a.75.75 0 01-.75.75z" clip-rule="evenodd" /></svg>
            </button>
        </div>`;
    return item;
}

async function handleAddNewCategory() {
    try {
        const newName = await api.postMessageWithResponse('showInputBox', { prompt: '请输入新的分类名称' });
        if (newName && newName.value) {
            await api.postMessageWithResponse('addCategory', { name: newName.value });
            app.initialLoad();
        }
    } catch (error) {
        ui.showToast(`添加分类失败: ${error.message}`, 'error');
    }
}

async function handleDeleteCategory(categoryName, element) {
    try {
        const confirmed = await api.postMessageWithResponse('showConfirmation', {
            message: `确定要删除分类 "${categoryName}" 吗？该分类下的所有 Prompts 将被移至"未分类"。`
        });

        if (confirmed && confirmed.confirmed) {
            await api.postMessageWithResponse('deleteCategory', { categoryName });
            app.initialLoad();
        }
    } catch (error) {
        ui.showToast(`删除分类失败: ${error.message}`, 'error');
    }
}

function enterCategoryEditMode(itemElement) {
    const nameSpan = itemElement.querySelector('.category-name');
    const oldName = nameSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'edit-category-input';

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const finishEditing = async (saveChanges) => {
        const newName = input.value.trim();
        input.replaceWith(nameSpan); // Revert to span first

        if (saveChanges && newName && newName !== oldName) {
            try {
                await api.postMessageWithResponse('editCategory', { oldName, newName });
                ui.showToast('分类更新成功', 'success');
                app.initialLoad(); // Refresh data
            } catch (error) {
                ui.showToast(`更新失败: ${error.message}`, 'error');
                nameSpan.textContent = oldName; // Restore old name on failure
            }
        } else {
            nameSpan.textContent = oldName; // Restore if no changes
        }
    };
    
    input.addEventListener('blur', () => finishEditing(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEditing(true);
        if (e.key === 'Escape') finishEditing(false);
    });
}
