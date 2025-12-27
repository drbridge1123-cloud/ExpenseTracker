/**
 * Menu Configuration for Different Account Types
 * Defines sidebar menu structure for each account type
 */

const menuConfigs = {
    iolta: {
        label: 'IOLTA Account',
        icon: '⚖️',
        color: '#7c3aed',
        sections: [
            {
                id: 'trust',
                label: 'TRUST',
                items: [
                    { page: 'iolta', icon: '⚖️', label: 'Trust Ledger' }
                ]
            },
            {
                id: 'compliance',
                label: 'COMPLIANCE',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'trust-reconcile', icon: '✅', label: 'Reconcile' },
                    { page: 'trust-audit', icon: '📋', label: 'Audit Log' },
                    { page: 'trust-data-management', icon: '💾', label: 'Data Management' }
                ]
            },
            {
                id: 'contacts',
                label: 'CONTACTS',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'vendors', icon: '🏢', label: 'Vendors' },
                    { page: 'customers', icon: '👤', label: 'Customers' },
                    { page: 'employees', icon: '👔', label: 'Employees' }
                ]
            },
            {
                id: 'reports',
                label: 'REPORTS',
                collapsible: true,
                defaultExpanded: false,
                items: [
                    { page: 'trust-reports', icon: '📈', label: 'Trust Reports' }
                ]
            }
        ]
    },

    general: {
        label: 'General Account',
        icon: '🏢',
        color: '#0891b2',
        sections: [
            {
                id: 'money',
                label: 'MONEY',
                items: [
                    { page: 'transactions', icon: '💳', label: 'Transactions' },
                    { page: 'accounts', icon: '🏛', label: 'Accounts' },
                    { page: 'categories', icon: '📊', label: 'Chart of Accounts' }
                ]
            },
            {
                id: 'tools',
                label: 'TOOLS',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'rules', icon: '⚙️', label: 'Rules' },
                    { page: 'budgets', icon: '💰', label: 'Budgets' },
                    { page: 'recurring', icon: '🔄', label: 'Recurring' },
                    { page: 'checks', icon: '✏️', label: 'Write Checks' },
                    { page: 'receipts', icon: '🧾', label: 'Receipts' },
                    { page: 'reconcile', icon: '✅', label: 'Reconcile' },
                    { page: 'data-management', icon: '💾', label: 'Data Management' }
                ]
            },
            {
                id: 'contacts',
                label: 'CONTACTS',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'vendors', icon: '🏢', label: 'Vendors' },
                    { page: 'customers', icon: '👤', label: 'Customers' },
                    { page: 'employees', icon: '👔', label: 'Employees' }
                ]
            },
            {
                id: 'reports',
                label: 'REPORTS',
                collapsible: true,
                defaultExpanded: false,
                items: [
                    { page: 'reports', icon: '📈', label: 'Reports' },
                    { page: 'cpa-portal', icon: '👤', label: 'CPA Portal' }
                ]
            }
        ]
    },

    cost: {
        label: 'Cost Account',
        icon: '💵',
        color: '#059669',
        sections: [
            {
                id: 'trust',
                label: 'COST',
                items: [
                    { page: 'cost-client-ledger', icon: '📄', label: 'Client Ledger' },
                    { page: 'cost-accounts', icon: '🏦', label: 'Accounts' }
                ]
            },
            {
                id: 'compliance',
                label: 'MANAGEMENT',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'cost-reconcile', icon: '✅', label: 'Reconciliation' },
                    { page: 'cost-data-management', icon: '💾', label: 'Data Management' }
                ]
            },
            {
                id: 'contacts',
                label: 'CONTACTS',
                collapsible: true,
                defaultExpanded: true,
                items: [
                    { page: 'vendors', icon: '🏢', label: 'Vendors' },
                    { page: 'customers', icon: '👤', label: 'Customers' },
                    { page: 'employees', icon: '👔', label: 'Employees' }
                ]
            },
            {
                id: 'reports',
                label: 'REPORTS',
                collapsible: true,
                defaultExpanded: false,
                items: [
                    { page: 'cost-reports', icon: '📈', label: 'Cost Reports' }
                ]
            }
        ]
    }
};

/**
 * Get menu configuration for an account type
 */
function getMenuConfig(accountType) {
    return menuConfigs[accountType] || menuConfigs.general;
}

/**
 * Get all menu items for an account type (flattened)
 */
function getAllMenuItems(accountType) {
    const config = getMenuConfig(accountType);
    const items = [];

    config.sections.forEach(section => {
        section.items.forEach(item => {
            items.push({
                ...item,
                sectionId: section.id,
                sectionLabel: section.label
            });
        });
    });

    return items;
}

/**
 * Check if a page belongs to an account type
 */
function isPageInAccountType(page, accountType) {
    const items = getAllMenuItems(accountType);
    return items.some(item => item.page === page) || page === 'dashboard';
}

/**
 * Get the default page for an account type
 */
function getDefaultPage(accountType) {
    return 'dashboard';
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        menuConfigs,
        getMenuConfig,
        getAllMenuItems,
        isPageInAccountType,
        getDefaultPage
    };
}

// Make available globally
window.menuConfigs = menuConfigs;
window.getMenuConfig = getMenuConfig;
window.getAllMenuItems = getAllMenuItems;
window.isPageInAccountType = isPageInAccountType;
window.getDefaultPage = getDefaultPage;
