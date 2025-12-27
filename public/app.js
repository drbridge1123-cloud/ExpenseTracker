/**
 * Expense Tracker - Main Application
 * Personal Finance Management System
 */

// API Configuration
// API_BASE is now loaded from js/api.js

// Application State
// Application State
// state is now loaded from js/state.js

// Reimbursement status icon helper
function getReimbursementIcon(status, amount) {
    // Only show for expenses (negative amounts)
    if (amount >= 0) return '';

    const icons = {
        'none': '',
        'pending': '<span class="reimb-icon reimb-pending" title="Reimbursement Pending">⏳</span>',
        'submitted': '<span class="reimb-icon reimb-submitted" title="Submitted for Reimbursement">📤</span>',
        'approved': '<span class="reimb-icon reimb-approved" title="Reimbursement Approved">✅</span>',
        'reimbursed': '<span class="reimb-icon reimb-reimbursed" title="Reimbursed">💰</span>',
        'denied': '<span class="reimb-icon reimb-denied" title="Reimbursement Denied">❌</span>'
    };
    return icons[status] || '';
}

// DOM Elements
// elements is now loaded from js/state.js

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Close any stale modals from previous session
    closeAllDynamicModals();

    // Setup login form
    setupLoginForm();

    // Check if user is already logged in
    const isLoggedIn = await checkAuthSession();

    if (!isLoggedIn) {
        showLoginPage();
        return;
    }

    // User is logged in - show main app
    showMainApp();
}

function showLoginPage() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

async function showMainApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Initialize account type system (now async - loads permissions)
    if (typeof initAccountType === 'function') {
        await initAccountType();
    }

    // Set current date
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        dateEl.textContent = formatDate(new Date(), 'long');
    }

    // Setup event listeners
    setupNavigation();
    setupMobileMenu();
    setupSearch();
    setupModal();

    // Show/hide admin section (new sidebar structure)
    const adminSection = document.getElementById('nav-admin-section');
    if (adminSection) {
        adminSection.style.display = state.isAdmin ? 'block' : 'none';
    }

    // Update user info in sidebar
    updateUserInfo();

    // Load users for user switcher (admins can see all users)
    await loadUsers();

    // Initialize dashboard month selector
    initDashboardMonthSelector();

    // Initialize report selectors
    // initReportSelectors(); // initReportSelectors might be missing, check later

    // Load initial data - navigate to dashboard (will auto-detect account type)
    if (state.currentUser) {
        navigateTo('dashboard');
    }
}

// =====================================================
// Authentication
// =====================================================
// Authentication functions are now loaded from js/auth.js

// =====================================================
// Navigation
// =====================================================

function setupNavigation() {
    // Handle menu items (new structure)
    const menuItems = document.querySelectorAll('.menu-item[data-page]');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    // Setup collapsible sections
    setupCollapsibleSections();

    // Restore sidebar section states from localStorage
    restoreSidebarSectionStates();
}

function setupCollapsibleSections() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function (e) {
            e.stopPropagation();
            const section = this.closest('.collapsible-section');
            const body = section.querySelector('.collapsible-body');
            const sectionId = section.dataset.section;

            section.classList.toggle('collapsed');

            if (section.classList.contains('collapsed')) {
                body.style.maxHeight = '0';
            } else {
                body.style.maxHeight = body.scrollHeight + 'px';
            }

            // Save state to localStorage
            saveSidebarSectionState(sectionId, section.classList.contains('collapsed'));
        });
    });

    // Initialize expanded sections' max-height
    document.querySelectorAll('.collapsible-section:not(.collapsed) .collapsible-body').forEach(body => {
        body.style.maxHeight = body.scrollHeight + 'px';
    });
}

function saveSidebarSectionState(sectionId, isCollapsed) {
    const states = JSON.parse(localStorage.getItem('sidebarSections') || '{}');
    states[sectionId] = isCollapsed;
    localStorage.setItem('sidebarSections', JSON.stringify(states));
}

function restoreSidebarSectionStates() {
    const states = JSON.parse(localStorage.getItem('sidebarSections') || '{}');
    Object.keys(states).forEach(sectionId => {
        const section = document.querySelector(`.collapsible-section[data-section="${sectionId}"]`);
        if (section) {
            const body = section.querySelector('.collapsible-body');
            if (states[sectionId]) {
                section.classList.add('collapsed');
                body.style.maxHeight = '0';
            } else {
                section.classList.remove('collapsed');
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        }
    });
}

function navigateTo(page) {
    // Close any open dynamically created modals
    closeAllDynamicModals();

    // Update nav active state for menu items
    document.querySelectorAll('.menu-item[data-page]').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Show corresponding page
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    state.currentPage = page;

    // Load page-specific data
    loadPageData(page);

    // Close mobile menu
    elements.sidebar.classList.remove('open');
}

// Close all dynamically created modals
function closeAllDynamicModals() {
    const dynamicModalIds = [
        'checks-filter-modal',
        'check-status-modal',
        'cost-client-modal',
        'cost-account-modal'
    ];
    dynamicModalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    });
    // Also remove any overlay modals that might be floating
    document.querySelectorAll('[style*="position: fixed"][style*="z-index: 99999"]').forEach(el => {
        if (el.id && el.id.includes('modal')) {
            el.style.display = 'none';
        }
    });
}

async function loadPageData(page) {
    if (!state.currentUser) return;

    showLoading();

    try {
        switch (page) {
            case 'dashboard':
                // Check account type for dashboard
                const accountType = typeof getAccountType === 'function' ? getAccountType() : 'personal';
                if (accountType === 'iolta') {
                    await loadIoltaDashboard();
                } else {
                    await loadDashboard();
                }
                break;
            case 'transactions':
                await loadTransactions();
                break;
            case 'accounts':
                await loadAccounts();
                break;
            case 'categories':
                await loadCategories();
                break;
            case 'reports':
                await loadReportsPage();
                break;
            case 'budgets':
                await loadBudgetsPage();
                break;
            case 'recurring':
                await loadRecurringPage();
                break;
            case 'checks':
                await loadChecksPage();
                break;
            case 'receipts':
                await loadReceiptsPage();
                break;
            case 'reconcile':
                await loadReconcilePage();
                break;
            case 'cpa-portal':
                await loadCpaPortalPage();
                break;
            case 'admin':
                if (state.isAdmin) {
                    await loadAdminPage();
                }
                break;
            case 'import':
                await loadImportPage();
                break;
            case 'rules':
                await loadRules();
                break;
            case 'data-management':
                loadDataManagementPage();
                break;
            // IOLTA Pages
            case 'iolta':
                if (typeof loadIoltaPage === 'function') await loadIoltaPage();
                break;
            case 'trust-operations':
                if (typeof loadTrustOperations === 'function') await loadTrustOperations();
                break;
            case 'trust-reconcile':
                if (typeof loadTrustReconcile === 'function') await loadTrustReconcile();
                break;
            case 'trust-audit':
                if (typeof loadTrustAuditLog === 'function') await loadTrustAuditLog();
                break;
            case 'trust-reports':
                if (typeof loadTrustReports === 'function') await loadTrustReports();
                break;
            case 'trust-data-management':
                if (typeof loadTrustDataManagement === 'function') await loadTrustDataManagement();
                break;
            // Cost Account Pages (mirrors IOLTA structure)
            case 'cost-accounts':
                if (typeof CostAccountsModule !== 'undefined') await CostAccountsModule.init();
                break;
            case 'cost-client-ledger':
                if (typeof loadCostClientLedgerPage === 'function') await loadCostClientLedgerPage();
                break;
            case 'cost-operations':
                if (typeof loadCostOperations === 'function') await loadCostOperations();
                break;
            case 'cost-reconcile':
                if (typeof loadCostReconcile === 'function') await loadCostReconcile();
                break;
            case 'cost-data-management':
                if (typeof loadCostDataManagement === 'function') await loadCostDataManagement();
                break;
            case 'cost-reports':
                if (typeof loadCostReports === 'function') await loadCostReports();
                break;
            case 'vendors':
                if (typeof loadVendorsPage === 'function') await loadVendorsPage();
                break;
            case 'customers':
                if (typeof loadCustomersPage === 'function') await loadCustomersPage();
                break;
            case 'employees':
                if (typeof loadEmployeesPage === 'function') await loadEmployeesPage();
                break;
        }
    } catch (error) {
        showToast('Error loading data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function setupMobileMenu() {
    elements.menuToggle.addEventListener('click', () => {
        elements.sidebar.classList.toggle('open');
    });
}

// =====================================================
// Users
// =====================================================

async function loadUsers() {
    // Display current logged-in user name only (no user switching allowed)
    const userNameEl = document.getElementById('current-user-name');

    if (userNameEl && state.userData) {
        userNameEl.textContent = state.userData.display_name || state.userData.username;
    }

    // Store current user in state
    state.users = state.userData ? [state.userData] : [];
}

// User switching is disabled for security - each user can only see their own data
async function switchUser(userId) {
    // Function disabled - users cannot switch accounts
    console.log('User switching is disabled');
}

// =====================================================
// Dashboard module is loaded from js/modules/dashboard.js
// =====================================================
// Transactions
// =====================================================
// Transaction functions are now loaded from js/transactions.js
// The following functions have been moved:
// - buildHierarchicalCategoryOptions
// - buildGroupedAccountOptions
// - loadTransactions
// - loadFilterOptions
// - applyDatePreset
// - setupTransactionFilters
// - fetchTransactions
// - renderTransactionsTable
// - renderPagination
// - goToPage
// - sortTransactions
// - updateSortIcons

/* TRANSACTIONS SECTION MOVED TO transactions.js - END */


// Transactions module is loaded from js/modules/transactions.js
// Accounts module is loaded from js/modules/accounts.js


// =====================================================
// Reports
// =====================================================

function initReportSelectors() {
    // This function is no longer needed with the new Reports page design
    // Keeping it empty to prevent errors from existing calls
}

async function generateReport() {
    const type = document.getElementById('report-type').value;
    const year = document.getElementById('report-year').value;
    const month = document.getElementById('report-month').value;

    showLoading();

    const data = await apiGet('/reports/', {
        user_id: state.currentUser,
        type,
        year,
        month
    });

    hideLoading();

    if (data.success) {
        renderReport(data.data, type);
    } else {
        showToast('Error generating report', 'error');
    }
}

function renderReport(data, type) {
    const container = document.getElementById('report-content');
    const report = data.report;

    container.innerHTML = `
        <div class="report-summary">
            <div class="report-metric">
                <div class="report-metric-value text-success">${formatCurrency(report.total_income)}</div>
                <div class="report-metric-label">Total Income</div>
            </div>
            <div class="report-metric">
                <div class="report-metric-value text-danger">${formatCurrency(report.total_expenses)}</div>
                <div class="report-metric-label">Total Expenses</div>
            </div>
            <div class="report-metric">
                <div class="report-metric-value ${report.net_savings >= 0 ? 'text-success' : 'text-danger'}">
                    ${formatCurrency(report.net_savings)}
                </div>
                <div class="report-metric-label">Net Savings</div>
            </div>
            <div class="report-metric">
                <div class="report-metric-value">${report.savings_rate.toFixed(1)}%</div>
                <div class="report-metric-label">Savings Rate</div>
            </div>
        </div>

        <div class="card">
            <h3>Spending by Category</h3>
            <div class="category-chart">
                ${report.category_breakdown.map(cat => `
                    <div class="category-bar">
                        <span class="category-bar-label">${cat.category_name}</span>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width: ${cat.percentage || 0}%; background: ${cat.category_color || '#6b7280'}"></div>
                        </div>
                        <span class="category-bar-amount">${formatCurrency(cat.total_amount)}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="card">
            <h3>Top Vendors</h3>
            <table class="transactions-table">
                <thead>
                    <tr>
                        <th>Vendor</th>
                        <th>Transactions</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.top_vendors.map(v => `
                        <tr>
                            <td>${v.vendor_name}</td>
                            <td>${v.transaction_count}</td>
                            <td class="text-right">${formatCurrency(v.total_amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// =====================================================
// Import module is loaded from js/modules/import.js
// =====================================================
// Search
// =====================================================

function setupSearch() {
    // Global search was removed - function kept for compatibility
    if (!elements.globalSearch) {
        return;
    }

    let debounceTimer;

    elements.globalSearch.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const searchTerm = e.target.value.trim();
            if (searchTerm.length >= 2) {
                state.filters.search = searchTerm;
                if (state.currentPage === 'transactions') {
                    fetchTransactions();
                } else {
                    navigateTo('transactions');
                }
            } else if (searchTerm.length === 0) {
                state.filters.search = '';
                if (state.currentPage === 'transactions') {
                    fetchTransactions();
                }
            }
        }, 300);
    });
}

// =====================================================
// Modal
// =====================================================

function setupModal() {
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) {
            closeModal();
        }
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
}

function openModal(title, content, size = '') {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;

    // Remove previous size classes
    modal.classList.remove('modal-lg', 'modal-sm');
    if (size) {
        modal.classList.add(size);
    }

    elements.modalOverlay.classList.add('open');
}

function closeModal() {
    elements.modalOverlay.classList.remove('open');
    // Clean up size classes
    document.getElementById('modal').classList.remove('modal-lg', 'modal-sm');
    // Clean up edit-transaction-modal class
    document.getElementById('modal-body').classList.remove('edit-transaction-modal');
}

// =====================================================
// Toast Notifications & Loading
// =====================================================
// UI helper functions (showToast, showLoading, hideLoading) are now loaded from js/utils.js

// =====================================================
// API Helpers
// =====================================================
// API functions (apiGet, apiPost, etc.) are now loaded from js/api.js

// =====================================================
// Utility Functions
// =====================================================
// Utility functions (formatCurrency, formatDate, etc.) are now loaded from js/utils.js

// Functions are now exposed globally from their respective modules:
// - showTransactionDetail, updateTransactionCategory, goToPage, sortTransactions: js/modules/transactions.js
// - deleteRule: js/modules/rules.js
// - applyDatePreset: js/modules/transactions.js

// =====================================================
// Custom Report Builder module is loaded from js/modules/custom-reports.js

// Reports module is loaded from js/modules/reports.js

// =====================================================
// Budgets module is loaded from js/modules/budgets.js
// Recurring module is loaded from js/modules/recurring.js
// Checks module is loaded from js/modules/checks.js
// Reconcile module is loaded from js/modules/reconcile.js
// CPA module is loaded from js/modules/cpa.js
// Admin module is loaded from js/modules/admin.js
// Mobile Sidebar Functions
// =====================================================

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (sidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
    } else {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Update mobile header user avatar
function updateMobileUserAvatar() {
    const avatar = document.getElementById('mobile-user-avatar');
    const user = state?.currentUser;
    if (avatar && user) {
        const initials = (user.display_name || user.username || 'U')
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        avatar.textContent = initials;
    }
}

// Close sidebar when clicking on menu item (mobile)
document.addEventListener('DOMContentLoaded', function () {
    const menuItems = document.querySelectorAll('.menu-item[data-page]');
    menuItems.forEach(item => {
        item.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });

    // Update mobile avatar when user logs in
    const originalShowApp = window.showApp;
    if (typeof originalShowApp === 'function') {
        window.showApp = function () {
            originalShowApp();
            updateMobileUserAvatar();
        };
    }
});

// Expose mobile functions globally
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;

// =====================================================
// Password Visibility Toggle
// =====================================================
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        // Change to "Hide" icon (Slash Eye)
        btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>';
    } else {
        input.type = 'password';
        // Change to "Show" icon (Normal Eye)
        btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;
