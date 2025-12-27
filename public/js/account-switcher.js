/**
 * Account Type Switcher
 * Handles switching between different account types (Personal, IOLTA, General, Cost)
 */

// Current account type (default to IOLTA)
let currentAccountType = 'iolta';

// User permissions cache
let userPermissions = [];
let userIsAdmin = false;

// Account type to permission mapping
const accountTypePermissions = {
    iolta: 'account_type.iolta',
    general: 'account_type.general',
    cost: 'account_type.cost'
};

/**
 * Load user permissions from API
 */
async function loadUserPermissions() {
    try {
        const response = await fetch(`${typeof API_BASE !== 'undefined' ? API_BASE : '/expensetracker/api/v1'}/auth/permissions.php`, {
            credentials: 'include'
        });
        const result = await response.json();

        if (result.success) {
            userPermissions = result.data.permissions || [];
            userIsAdmin = result.data.is_admin || false;
            return true;
        }
    } catch (error) {
        console.error('Failed to load user permissions:', error);
    }
    return false;
}

/**
 * Check if user has permission for account type
 */
function hasAccountTypePermission(accountType) {
    // Admin has access to everything
    if (userIsAdmin) return true;

    const permissionKey = accountTypePermissions[accountType];
    return userPermissions.includes(permissionKey);
}

/**
 * Get allowed account types for current user
 */
function getAllowedAccountTypes() {
    const allTypes = ['iolta', 'general', 'cost'];
    return allTypes.filter(type => hasAccountTypePermission(type));
}

/**
 * Initialize account type from localStorage or default
 */
async function initAccountType() {
    // Load permissions first
    await loadUserPermissions();

    const allowedTypes = getAllowedAccountTypes();

    // Always default to IOLTA (ignore localStorage)
    // IOLTA is the primary use case for this application
    let defaultType = 'iolta';

    // If IOLTA is not allowed, use first allowed type
    if (!allowedTypes.includes(defaultType)) {
        defaultType = allowedTypes[0] || 'iolta';
    }

    currentAccountType = defaultType;

    // Update dropdown with only allowed options
    updateAccountTypeDropdown(allowedTypes);

    // Set data attribute on body for CSS styling
    document.body.setAttribute('data-account-type', currentAccountType);

    // Render sidebar menu for current account type
    renderSidebarMenu(currentAccountType);

    return currentAccountType;
}

/**
 * Update account type dropdown with allowed options only
 */
function updateAccountTypeDropdown(allowedTypes) {
    const dropdown = document.getElementById('account-type-dropdown');
    const selectedDisplay = dropdown?.querySelector('.account-type-selected span:last-child');
    const optionsContainer = dropdown?.querySelector('.account-type-options');

    if (!dropdown || !optionsContainer) return;

    const accountTypeInfo = {
        iolta: { icon: '⚖️', label: 'IOLTA Account' },
        general: { icon: '🏢', label: 'General Account' },
        cost: { icon: '💵', label: 'Cost Account' }
    };

    // Build options HTML
    optionsContainer.innerHTML = allowedTypes.map(type => {
        const info = accountTypeInfo[type];
        return `
            <div class="account-type-option ${type === currentAccountType ? 'active' : ''}"
                 data-type="${type}" onclick="switchAccountType('${type}')">
                <span>${info.icon}</span>
                <span>${info.label}</span>
            </div>
        `;
    }).join('');

    // Update selected display
    if (selectedDisplay) {
        const currentInfo = accountTypeInfo[currentAccountType];
        const iconSpan = dropdown.querySelector('.account-type-selected span:first-child');
        if (iconSpan) iconSpan.textContent = currentInfo.icon;
        selectedDisplay.textContent = currentInfo.label;
    }

    // Hide dropdown if only one option
    if (allowedTypes.length <= 1) {
        dropdown.style.pointerEvents = 'none';
        const arrow = dropdown.querySelector('.dropdown-arrow');
        if (arrow) arrow.style.display = 'none';
    }
}

/**
 * Switch to a different account type
 */
function switchAccountType(newType) {
    if (!['iolta', 'general', 'cost'].includes(newType)) {
        console.error('Invalid account type:', newType);
        return;
    }

    // Check permission
    if (!hasAccountTypePermission(newType)) {
        if (typeof showToast === 'function') {
            showToast('You do not have permission to access this account type', 'error');
        }
        return;
    }

    const previousType = currentAccountType;
    currentAccountType = newType;

    // Save to localStorage
    localStorage.setItem('currentAccountType', newType);

    // Set data attribute on body for CSS styling
    document.body.setAttribute('data-account-type', newType);

    // Render sidebar menu for new account type
    renderSidebarMenu(newType);

    // Update dropdown selection
    updateAccountTypeDropdown(getAllowedAccountTypes());

    // Clear any type-specific state/cache
    clearTypeSpecificState(previousType);

    // Navigate to dashboard of new type
    navigateTo('dashboard');

    // Show notification
    showAccountTypeNotification(newType);

    console.log(`Switched from ${previousType} to ${newType}`);
}

/**
 * Render sidebar menu based on account type
 */
function renderSidebarMenu(accountType) {
    const config = menuConfigs[accountType];
    if (!config) {
        console.error('No menu config for account type:', accountType);
        return;
    }

    // Get sidebar element
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Find or create the dynamic menu container
    let dynamicMenu = document.getElementById('dynamic-sidebar-menu');
    if (!dynamicMenu) {
        // Create dynamic menu container after fixed menu
        const fixedMenu = sidebar.querySelector('.fixed-menu');
        dynamicMenu = document.createElement('div');
        dynamicMenu.id = 'dynamic-sidebar-menu';
        dynamicMenu.className = 'dynamic-sidebar-menu';
        if (fixedMenu && fixedMenu.nextSibling) {
            sidebar.insertBefore(dynamicMenu, fixedMenu.nextSibling);
        } else {
            sidebar.appendChild(dynamicMenu);
        }
    }

    // Hide all existing static menu sections (they will be replaced by dynamic menu)
    const staticMenuElements = sidebar.querySelectorAll('.nav-section, .collapsible-section, .section-divider');
    staticMenuElements.forEach(element => {
        element.style.display = 'none';
    });

    // Build menu HTML
    let menuHTML = '';

    config.sections.forEach(section => {
        const isCollapsible = section.collapsible;
        const isExpanded = section.defaultExpanded !== false;
        const sectionClass = isCollapsible ? 'menu-section collapsible' : 'menu-section';
        const contentClass = isExpanded ? 'section-content' : 'section-content collapsed';

        menuHTML += `
            <div class="${sectionClass}" id="section-${section.id}">
                <div class="section-header" ${isCollapsible ? `onclick="toggleSection('${section.id}')"` : ''}>
                    <span class="section-label">${section.label}</span>
                    ${isCollapsible ? `
                        <span class="section-toggle">
                            <svg class="toggle-icon ${isExpanded ? '' : 'collapsed'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </span>
                    ` : ''}
                    ${section.itemCount ? `<span class="section-count">${section.items.length}</span>` : ''}
                </div>
                <div class="${contentClass}" id="section-content-${section.id}">
        `;

        section.items.forEach(item => {
            menuHTML += `
                <div class="menu-item" data-page="${item.page}" onclick="navigateTo('${item.page}')">
                    <span class="menu-icon">${item.icon}</span>
                    <span class="menu-label">${item.label}</span>
                </div>
            `;
        });

        menuHTML += `
                </div>
            </div>
        `;
    });

    dynamicMenu.innerHTML = menuHTML;

    // Re-show admin section for admins if applicable
    if (accountType === 'general') {
        const adminSection = document.getElementById('nav-admin-section');
        if (adminSection && typeof state !== 'undefined' && state.isAdmin) {
            adminSection.style.display = 'block';
        }
    }

    // Update browser title
    updatePageTitle(accountType);
}

/**
 * Toggle collapsible section
 */
function toggleSection(sectionId) {
    const content = document.getElementById(`section-content-${sectionId}`);
    const header = content?.previousElementSibling;
    const toggleIcon = header?.querySelector('.toggle-icon');

    if (content) {
        content.classList.toggle('collapsed');
    }
    if (toggleIcon) {
        toggleIcon.classList.toggle('collapsed');
    }
}

/**
 * Update page title based on account type
 */
function updatePageTitle(accountType) {
    const titles = {
        iolta: 'IOLTA Trust Accounting',
        general: 'Business Expense Management',
        cost: 'Cost & Billing Management'
    };

    // Update browser title
    document.title = `ExpenseTracker - ${titles[accountType]}`;
}

/**
 * Clear type-specific state when switching
 */
function clearTypeSpecificState(previousType) {
    // Clear cached data that's type-specific
    if (typeof state !== 'undefined') {
        // Reset pagination
        if (state.pagination) {
            state.pagination.currentPage = 1;
        }

        // Clear filters
        if (state.filters) {
            state.filters = {};
        }
    }
}

/**
 * Show notification when switching account types
 */
function showAccountTypeNotification(accountType) {
    const names = {
        iolta: 'IOLTA Account',
        general: 'General Account',
        cost: 'Cost Account'
    };

    if (typeof showToast === 'function') {
        showToast(`Switched to ${names[accountType]}`, 'info');
    }
}

/**
 * Get current account type
 */
function getAccountType() {
    return currentAccountType;
}

/**
 * Check if current account type matches
 */
function isAccountType(type) {
    return currentAccountType === type;
}

// Make available globally
window.initAccountType = initAccountType;
window.switchAccountType = switchAccountType;
window.getAccountType = getAccountType;
window.isAccountType = isAccountType;
window.toggleSection = toggleSection;
window.renderSidebarMenu = renderSidebarMenu;
window.hasAccountTypePermission = hasAccountTypePermission;
window.getAllowedAccountTypes = getAllowedAccountTypes;
window.loadUserPermissions = loadUserPermissions;
