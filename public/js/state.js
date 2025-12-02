// Application State
const state = {
    currentUser: null,
    currentPage: 'dashboard',
    transactions: [],
    accounts: [],
    categories: [],
    rules: [],
    pagination: {
        page: 1,
        limit: 50,
        total: 0
    },
    filters: {
        accountId: '',
        categoryId: '',
        startDate: '',
        endDate: '',
        search: '',
        sort: 'transaction_date',
        order: 'DESC'
    },
    selectedTransaction: null,
    // Auth state
    isLoggedIn: false,
    isAdmin: false,
    userData: null
};

// DOM Elements (Initialized when module loads, assuming deferred execution)
const elements = {
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menu-toggle'),
    pageContent: document.getElementById('page-content'),
    userSelect: document.getElementById('user-select'),
    globalSearch: document.getElementById('global-search'),
    modalOverlay: document.getElementById('modal-overlay'),
    modal: document.getElementById('modal'),
    loadingOverlay: document.getElementById('loading-overlay'),
    toastContainer: document.getElementById('toast-container')
};

// Export
export { state, elements };

// Legacy Compatibility
window.state = state;
window.elements = elements;
