// =====================================================
// Custom Dropdown Component - Indent Line Style
// =====================================================

/**
 * Initialize a custom dropdown for category selection with search
 * @param {string} selectId - ID of the original select element
 * @param {Array} categories - Array of category objects with hierarchical structure
 * @param {string} placeholder - Placeholder text
 */
function initCustomCategoryDropdown(selectId, categories, placeholder = 'Select category') {
    const originalSelect = document.getElementById(selectId);
    if (!originalSelect) return;

    // Check if already initialized - remove existing wrapper
    const existingWrapper = originalSelect.closest('.custom-dropdown');
    if (existingWrapper) {
        // Get parent and replace wrapper with just the select
        const parent = existingWrapper.parentNode;
        parent.insertBefore(originalSelect, existingWrapper);
        existingWrapper.remove();
        originalSelect.classList.remove('hidden-select');
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';

    // Hide original select
    originalSelect.classList.add('hidden-select');

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger placeholder';
    trigger.textContent = placeholder;

    // Create dropdown menu
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';

    // Create search input
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'dropdown-search-wrapper';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'dropdown-search';
    searchInput.placeholder = 'Search...';
    searchWrapper.appendChild(searchInput);

    // Create items container
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'dropdown-items';

    // Build menu content
    buildCategoryMenuWithContainer(itemsContainer, categories, originalSelect.value);

    menu.appendChild(searchWrapper);
    menu.appendChild(itemsContainer);

    // Wrap the select
    originalSelect.parentNode.insertBefore(wrapper, originalSelect);
    wrapper.appendChild(originalSelect);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    // Update trigger text if value exists
    if (originalSelect.value) {
        const category = findCategoryById(categories, originalSelect.value);
        if (category) {
            trigger.textContent = category.name;
            trigger.classList.remove('placeholder');
        }
    }

    // Event: Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) {
            wrapper.classList.add('open');
            searchInput.value = '';
            filterDropdownItems(itemsContainer, '');
            setTimeout(() => searchInput.focus(), 10);
        }
    });

    // Event: Search input
    searchInput.addEventListener('input', (e) => {
        filterDropdownItems(itemsContainer, e.target.value.toLowerCase());
    });

    // Prevent search input from closing dropdown
    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Event: Select item (header or item)
    itemsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item, .dropdown-header[data-value]');
        if (item && item.dataset.value) {
            const value = item.dataset.value;
            const text = item.dataset.text || item.textContent;

            // Update hidden select
            originalSelect.value = value;
            originalSelect.dispatchEvent(new Event('change'));

            // Update trigger
            trigger.textContent = text;
            trigger.classList.remove('placeholder');

            // Update selected state
            itemsContainer.querySelectorAll('.dropdown-item, .dropdown-header').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            // Close dropdown
            wrapper.classList.remove('open');
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            wrapper.classList.remove('open');
        }
    });
}

/**
 * Initialize a simple custom dropdown (non-hierarchical)
 */
function initCustomDropdown(selectId, placeholder = 'Select...') {
    const originalSelect = document.getElementById(selectId);
    if (!originalSelect) return;

    // Check if already initialized - remove existing wrapper
    const existingWrapper = originalSelect.closest('.custom-dropdown');
    if (existingWrapper) {
        const parent = existingWrapper.parentNode;
        parent.insertBefore(originalSelect, existingWrapper);
        existingWrapper.remove();
        originalSelect.classList.remove('hidden-select');
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';

    // Hide original select
    originalSelect.classList.add('hidden-select');

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger placeholder';
    trigger.textContent = placeholder;

    // Create dropdown menu
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';

    // Build menu from select options
    buildSimpleMenu(menu, originalSelect);

    // Wrap the select
    originalSelect.parentNode.insertBefore(wrapper, originalSelect);
    wrapper.appendChild(originalSelect);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    // Update trigger text if value exists
    if (originalSelect.value) {
        const option = originalSelect.options[originalSelect.selectedIndex];
        if (option && option.value) {
            trigger.textContent = option.text;
            trigger.classList.remove('placeholder');
        }
    }

    // Event: Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) {
            wrapper.classList.add('open');
        }
    });

    // Event: Select item
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const value = item.dataset.value;
            const text = item.textContent;

            // Update hidden select
            originalSelect.value = value;
            originalSelect.dispatchEvent(new Event('change'));

            // Update trigger
            trigger.textContent = text;
            trigger.classList.remove('placeholder');

            // Update selected state
            menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            // Close dropdown
            wrapper.classList.remove('open');
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            wrapper.classList.remove('open');
        }
    });
}

/**
 * Build hierarchical category menu with indent lines
 */
function buildCategoryMenu(menu, categories, selectedValue) {
    if (!categories || categories.length === 0) {
        menu.innerHTML = '<div class="dropdown-empty">No categories available</div>';
        return;
    }

    // Group categories by type (expense/income)
    const expenseCategories = categories.filter(c => c.category_type === 'expense');
    const incomeCategories = categories.filter(c => c.category_type === 'income');

    let html = '';

    // Build expense section
    if (expenseCategories.length > 0) {
        html += buildCategorySection(expenseCategories, selectedValue);
    }

    // Add divider if both types exist
    if (expenseCategories.length > 0 && incomeCategories.length > 0) {
        html += '<div class="dropdown-divider"></div>';
    }

    // Build income section
    if (incomeCategories.length > 0) {
        html += buildCategorySection(incomeCategories, selectedValue);
    }

    menu.innerHTML = html;
}

/**
 * Build hierarchical category menu into a container element
 */
function buildCategoryMenuWithContainer(container, categories, selectedValue) {
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="dropdown-empty">No categories available</div>';
        return;
    }

    // Group categories by type (expense/income)
    const expenseCategories = categories.filter(c => c.category_type === 'expense');
    const incomeCategories = categories.filter(c => c.category_type === 'income');

    let html = '';

    // Build expense section
    if (expenseCategories.length > 0) {
        html += buildCategorySection(expenseCategories, selectedValue);
    }

    // Add divider if both types exist
    if (expenseCategories.length > 0 && incomeCategories.length > 0) {
        html += '<div class="dropdown-divider"></div>';
    }

    // Build income section
    if (incomeCategories.length > 0) {
        html += buildCategorySection(incomeCategories, selectedValue);
    }

    container.innerHTML = html;
}

/**
 * Filter dropdown items based on search query
 */
function filterDropdownItems(container, query) {
    const items = container.querySelectorAll('.dropdown-item, .dropdown-header');
    const groups = container.querySelectorAll('.dropdown-group');
    const dividers = container.querySelectorAll('.dropdown-divider');

    if (!query) {
        // Show all items
        items.forEach(item => {
            item.style.display = '';
            item.classList.remove('search-match');
        });
        groups.forEach(g => g.style.display = '');
        dividers.forEach(d => d.style.display = '');
        return;
    }

    // Track which parents have visible children
    const visibleParents = new Set();

    items.forEach(item => {
        const text = (item.dataset.text || item.textContent).toLowerCase();
        const isMatch = text.includes(query);

        if (isMatch) {
            item.style.display = '';
            item.classList.add('search-match');
            // If this is a child item, mark parent as needing to show
            const parentHeader = item.previousElementSibling;
            if (parentHeader && parentHeader.classList.contains('dropdown-header')) {
                visibleParents.add(parentHeader);
            }
            // Check all previous siblings for parent header
            let prev = item.previousElementSibling;
            while (prev) {
                if (prev.classList.contains('dropdown-header')) {
                    visibleParents.add(prev);
                    break;
                }
                prev = prev.previousElementSibling;
            }
        } else {
            item.style.display = 'none';
            item.classList.remove('search-match');
        }
    });

    // Show parent headers that have matching children
    visibleParents.forEach(header => {
        header.style.display = '';
    });

    // Hide empty groups
    groups.forEach(group => {
        const visibleItems = group.querySelectorAll('.dropdown-item:not([style*="display: none"]), .dropdown-header:not([style*="display: none"])');
        group.style.display = visibleItems.length > 0 ? '' : 'none';
    });

    // Hide dividers if adjacent groups are hidden
    dividers.forEach(divider => {
        const prevGroup = divider.previousElementSibling;
        const nextGroup = divider.nextElementSibling;
        const prevVisible = prevGroup && prevGroup.style.display !== 'none';
        const nextVisible = nextGroup && nextGroup.style.display !== 'none';
        divider.style.display = (prevVisible && nextVisible) ? '' : 'none';
    });
}

/**
 * Build a section of categories (expense or income)
 */
function buildCategorySection(categories, selectedValue) {
    // Get parent categories
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);

    let html = '<div class="dropdown-group">';

    // Sort parents by sort_order
    parents.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    parents.forEach(parent => {
        const subs = children.filter(c => c.parent_id === parent.id);
        const parentSelected = parent.id == selectedValue ? 'selected' : '';

        if (subs.length > 0) {
            // Parent with children - clickable header
            html += `<div class="dropdown-header ${parentSelected}" data-value="${parent.id}" data-text="${escapeAttr(parent.name)}">${escapeHtml(parent.name)}</div>`;

            // Child items with indent line
            subs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            subs.forEach(sub => {
                const selected = sub.id == selectedValue ? 'selected' : '';
                html += `<div class="dropdown-item ${selected}" data-value="${sub.id}" data-text="${escapeAttr(sub.name)}">${escapeHtml(sub.name)}</div>`;
            });
        } else {
            // Parent without children - top-level item (no indent line)
            html += `<div class="dropdown-item top-level ${parentSelected}" data-value="${parent.id}" data-text="${escapeAttr(parent.name)}">${escapeHtml(parent.name)}</div>`;
        }
    });

    html += '</div>';
    return html;
}

/**
 * Build simple menu from select options
 */
function buildSimpleMenu(menu, selectElement) {
    let html = '<div class="dropdown-group">';
    const selectedValue = selectElement.value;

    Array.from(selectElement.options).forEach((option, index) => {
        if (index === 0 && !option.value) return; // Skip placeholder option

        const selected = option.value === selectedValue ? 'selected' : '';
        html += `<div class="dropdown-item top-level ${selected}" data-value="${option.value}">${escapeHtml(option.text)}</div>`;
    });

    html += '</div>';

    if (html === '<div class="dropdown-group"></div>') {
        html = '<div class="dropdown-empty">No options available</div>';
    }

    menu.innerHTML = html;
}

/**
 * Find category by ID in hierarchical list
 */
function findCategoryById(categories, id) {
    return categories.find(c => c.id == id);
}

/**
 * Close all open dropdowns
 */
function closeAllDropdowns() {
    document.querySelectorAll('.custom-dropdown.open').forEach(d => {
        d.classList.remove('open');
    });
}

/**
 * Reset dropdown to placeholder state
 */
function resetCustomDropdown(selectId, placeholder = 'Select...') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const wrapper = select.closest('.custom-dropdown');
    if (!wrapper) return;

    const trigger = wrapper.querySelector('.dropdown-trigger');
    if (trigger) {
        trigger.textContent = placeholder;
        trigger.classList.add('placeholder');
    }

    // Clear selection
    wrapper.querySelectorAll('.dropdown-item, .dropdown-header').forEach(i => i.classList.remove('selected'));
    select.value = '';
}

/**
 * Set dropdown value programmatically
 */
function setCustomDropdownValue(selectId, value, text) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const wrapper = select.closest('.custom-dropdown');
    if (!wrapper) return;

    const trigger = wrapper.querySelector('.dropdown-trigger');
    const menu = wrapper.querySelector('.dropdown-menu');

    // Update select value
    select.value = value;

    // Update trigger
    if (trigger) {
        trigger.textContent = text || value;
        trigger.classList.toggle('placeholder', !value);
    }

    // Update selected state in menu
    if (menu) {
        menu.querySelectorAll('.dropdown-item, .dropdown-header').forEach(item => {
            item.classList.toggle('selected', item.dataset.value === String(value));
        });
    }
}

/**
 * Escape HTML for display
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape for attribute
 */
function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Expose functions globally
window.initCustomCategoryDropdown = initCustomCategoryDropdown;
window.initCustomDropdown = initCustomDropdown;
window.resetCustomDropdown = resetCustomDropdown;
window.setCustomDropdownValue = setCustomDropdownValue;
window.closeAllDropdowns = closeAllDropdowns;
