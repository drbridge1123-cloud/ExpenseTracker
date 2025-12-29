// =====================================================
// Transactions Module
// =====================================================
// Dependencies: state, apiGet, apiPost, apiDelete, apiRequest, formatCurrency, formatDate, formatDateISO,
//               showToast, showLoading, hideLoading, openModal, closeModal, navigateTo,
//               buildHierarchicalCategoryOptions, getCategoryIcon, getReimbursementIcon

// =====================================================
// Helper Functions
// =====================================================

// Build hierarchical category options with a selected value
function buildHierarchicalCategoryOptionsWithSelected(selectedId, includeUncategorized = true, typeFilter = null) {
    // Filter by type if specified
    let filteredCategories = state.categories;
    if (typeFilter) {
        filteredCategories = state.categories.filter(c => c.category_type === typeFilter);
    }

    // Separate parents and children
    const parentCategories = filteredCategories.filter(c => !c.parent_id || c.parent_id == 0);
    const childCategories = filteredCategories.filter(c => c.parent_id && c.parent_id != 0);

    // Group children by parent
    const childrenByParent = {};
    childCategories.forEach(child => {
        const parentKey = String(child.parent_id);
        if (!childrenByParent[parentKey]) {
            childrenByParent[parentKey] = [];
        }
        childrenByParent[parentKey].push(child);
    });

    // Sort parents by type (expense first) then sort_order
    parentCategories.sort((a, b) => {
        if (a.category_type !== b.category_type) {
            return a.category_type === 'expense' ? -1 : 1;
        }
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    let options = '';
    let currentType = null;

    parentCategories.forEach(parent => {
        // Add optgroup for type change
        if (parent.category_type !== currentType) {
            if (currentType !== null) {
                options += '</optgroup>';
            }
            const typeLabel = parent.category_type === 'expense' ? '📤 Expenses' : '📥 Income';
            options += `<optgroup label="${typeLabel}">`;
            currentType = parent.category_type;
        }

        const children = childrenByParent[String(parent.id)] || [];

        // Skip uncategorized if requested
        if (!includeUncategorized && parent.slug === 'uncategorized') {
            return;
        }

        // Parent option (blue color, bold)
        const isParentSelected = parent.id === selectedId || parent.id == selectedId;
        options += `<option value="${parent.id}" ${isParentSelected ? 'selected' : ''} style="color: #2563eb; font-weight: bold;">${parent.name}</option>`;

        // Child options with indent - sort by sort_order
        children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        children.forEach(child => {
            const isChildSelected = child.id === selectedId || child.id == selectedId;
            options += `<option value="${child.id}" ${isChildSelected ? 'selected' : ''} style="color: #6b7280;">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${child.name}</option>`;
        });
    });

    if (currentType !== null) {
        options += '</optgroup>';
    }

    return options;
}

// Build transfer account options (checking/savings only) with selection
function buildTransferAccountOptions(selectedId) {
    // Filter to only checking and savings accounts
    const transferAccounts = state.accounts.filter(a =>
        a.account_type === 'checking' || a.account_type === 'savings'
    );

    let options = '';
    transferAccounts.forEach(account => {
        const isSelected = account.id == selectedId;
        options += `<option value="${account.id}" ${isSelected ? 'selected' : ''}>${account.account_name}</option>`;
    });

    return options;
}

// Build grouped account options for dropdowns
function buildGroupedAccountOptions() {
    // Define account type labels and icons
    const typeLabels = {
        'checking': '🏦 Checking',
        'savings': '💰 Savings',
        'credit_card': '💳 Credit Cards',
        'investment': '📈 Investment',
        'cash': '💵 Cash',
        'loan': '📋 Loans',
        'other': '📁 Other'
    };

    // Group accounts by type
    const accountsByType = {};
    state.accounts.forEach(account => {
        const type = account.account_type || 'other';
        if (!accountsByType[type]) {
            accountsByType[type] = [];
        }
        accountsByType[type].push(account);
    });

    // Sort types in preferred order
    const typeOrder = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'other'];
    const sortedTypes = Object.keys(accountsByType).sort((a, b) => {
        return typeOrder.indexOf(a) - typeOrder.indexOf(b);
    });

    let options = '';

    sortedTypes.forEach(type => {
        const accounts = accountsByType[type];
        const label = typeLabels[type] || type;

        options += `<optgroup label="${label}">`;
        accounts.sort((a, b) => a.account_name.localeCompare(b.account_name));
        accounts.forEach(account => {
            options += `<option value="${account.id}" data-type="${type}">${account.account_name}</option>`;
        });
        options += '</optgroup>';
    });

    return options;
}

// =====================================================
// Main Functions
// =====================================================

async function loadTransactions() {
    // Load filter options
    await loadFilterOptions();

    // Setup filter handlers
    setupTransactionFilters();

    // Load transactions
    await fetchTransactions();
}

async function loadFilterOptions() {
    // Load accounts for filter (general mode only - exclude IOLTA client ledgers)
    if (state.accounts.length === 0) {
        const accountsData = await apiGet('/accounts/', { user_id: state.currentUser, account_mode: 'general' });
        if (accountsData.success) {
            state.accounts = accountsData.data.accounts;
        }
    }

    // Load categories for filter
    if (state.categories.length === 0) {
        const categoriesData = await apiGet('/categories/', { user_id: state.currentUser });
        if (categoriesData.success) {
            state.categories = categoriesData.data.categories;
        }
    }

    // Populate account filter with grouping by type
    const accountFilter = document.getElementById('txn-account-filter');
    accountFilter.innerHTML = '<option value="">All Accounts</option>' + buildGroupedAccountOptions();

    // Check if there's a pending account filter from navigation
    if (state.filters.pendingAccountFilter) {
        accountFilter.value = state.filters.pendingAccountFilter;
        state.filters.accountId = state.filters.pendingAccountFilter;
        delete state.filters.pendingAccountFilter; // Clear the flag
    }

    // Populate category filter with hierarchical structure
    const categoryFilter = document.getElementById('txn-category-filter');
    categoryFilter.innerHTML = '<option value="">All Categories</option>' + buildHierarchicalCategoryOptions();

    // Initialize custom category dropdown for filter
    if (typeof initCustomCategoryDropdown === 'function') {
        initCustomCategoryDropdown('txn-category-filter', state.categories, 'All Categories');
    }

    // Set default date range (current month) - but use 'all' if filtering by account
    if (state.filters.accountId) {
        document.getElementById('txn-date-preset').value = 'all';
        applyDatePreset('all', false);
    } else {
        document.getElementById('txn-date-preset').value = 'this_month';
        applyDatePreset('this_month', false);
    }
}

function applyDatePreset(preset, autoFilter = true) {
    const startInput = document.getElementById('txn-start-date');
    const endInput = document.getElementById('txn-end-date');
    const today = new Date();
    let startDate, endDate;

    if (preset === 'custom') {
        startInput.style.display = 'block';
        endInput.style.display = 'block';
        return;
    } else {
        startInput.style.display = 'none';
        endInput.style.display = 'none';
    }

    switch (preset) {
        case 'today':
            startDate = endDate = today;
            break;
        case 'yesterday':
            startDate = endDate = new Date(today.getTime() - 86400000);
            break;
        case 'this_week':
            const dayOfWeek = today.getDay();
            startDate = new Date(today.getTime() - dayOfWeek * 86400000);
            endDate = today;
            break;
        case 'last_week':
            const lastWeekEnd = new Date(today.getTime() - today.getDay() * 86400000 - 86400000);
            startDate = new Date(lastWeekEnd.getTime() - 6 * 86400000);
            endDate = lastWeekEnd;
            break;
        case 'this_month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = today;
            break;
        case 'last_month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'last_30':
            startDate = new Date(today.getTime() - 30 * 86400000);
            endDate = today;
            break;
        case 'last_90':
            startDate = new Date(today.getTime() - 90 * 86400000);
            endDate = today;
            break;
        case 'this_year':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = today;
            break;
        case 'last_year':
            startDate = new Date(today.getFullYear() - 1, 0, 1);
            endDate = new Date(today.getFullYear() - 1, 11, 31);
            break;
        case 'all':
            startDate = new Date(2000, 0, 1);
            endDate = today;
            break;
        default:
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = today;
    }

    startInput.value = formatDateISO(startDate);
    endInput.value = formatDateISO(endDate);

    if (autoFilter) {
        state.filters.accountId = document.getElementById('txn-account-filter').value;
        state.filters.categoryId = document.getElementById('txn-category-filter').value;
        state.filters.startDate = startInput.value;
        state.filters.endDate = endInput.value;
        state.pagination.page = 1;
        fetchTransactions();
    }
}

function setupTransactionFilters() {
    const applyFilters = () => {
        state.filters.accountId = document.getElementById('txn-account-filter').value;
        state.filters.categoryId = document.getElementById('txn-category-filter').value;
        state.filters.startDate = document.getElementById('txn-start-date').value;
        state.filters.endDate = document.getElementById('txn-end-date').value;
        state.pagination.page = 1;
        fetchTransactions();
    };

    const accountFilter = document.getElementById('txn-account-filter');
    accountFilter.addEventListener('change', () => {
        // Show/hide transaction type toggle based on account type
        updateTransactionTypeToggle();
        applyFilters();
    });
    document.getElementById('txn-category-filter').addEventListener('change', applyFilters);
    document.getElementById('txn-start-date').addEventListener('change', applyFilters);
    document.getElementById('txn-end-date').addEventListener('change', applyFilters);

    // Setup transaction type toggle buttons
    setupTransactionTypeToggle();

    document.getElementById('close-detail').addEventListener('click', () => {
        document.getElementById('transaction-detail-panel').classList.remove('open');
        state.selectedTransaction = null;
    });
}

function setupTransactionTypeToggle() {
    const toggleGroup = document.getElementById('txn-type-toggle');
    if (!toggleGroup) return;

    toggleGroup.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            toggleGroup.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update filter and fetch
            state.filters.transactionType = btn.dataset.type || '';
            state.pagination.page = 1;
            fetchTransactions();
        });
    });
}

function updateTransactionTypeToggle() {
    const accountFilter = document.getElementById('txn-account-filter');
    const toggleGroup = document.getElementById('txn-type-toggle');
    if (!toggleGroup) return;

    const selectedOption = accountFilter.options[accountFilter.selectedIndex];
    const accountType = selectedOption?.dataset?.type;

    // Show toggle only for checking accounts
    if (accountType === 'checking') {
        toggleGroup.style.display = 'inline-flex';
    } else {
        toggleGroup.style.display = 'none';
        // Reset transaction type filter when hiding
        state.filters.transactionType = '';
        toggleGroup.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
        toggleGroup.querySelector('.btn-toggle[data-type=""]')?.classList.add('active');
    }
}

async function fetchTransactions() {
    const params = {
        user_id: state.currentUser,
        page: state.pagination.page,
        limit: state.pagination.limit
    };

    if (state.filters.accountId) params.account_id = state.filters.accountId;
    if (state.filters.transactionType) params.transaction_type = state.filters.transactionType;
    if (state.filters.categoryId) params.category_id = state.filters.categoryId;
    if (state.filters.startDate) params.start_date = state.filters.startDate;
    if (state.filters.endDate) params.end_date = state.filters.endDate;
    if (state.filters.search) params.search = state.filters.search;
    if (state.filters.sort) params.sort = state.filters.sort;
    if (state.filters.order) params.order = state.filters.order;

    const data = await apiGet('/transactions/', params);

    if (data.success) {
        state.transactions = data.data.transactions;
        state.pagination.total = data.data.pagination.total_items;
        state.pagination.totalPages = data.data.pagination.total_pages;
        renderTransactionsTable();
        renderPagination();
        updateSortIcons();
    }
}

function sortTransactions(column) {
    if (state.filters.sort === column) {
        state.filters.order = state.filters.order === 'DESC' ? 'ASC' : 'DESC';
    } else {
        state.filters.sort = column;
        state.filters.order = column === 'description' ? 'ASC' : 'DESC';
    }
    state.pagination.page = 1;
    fetchTransactions();
}

function updateSortIcons() {
    const columns = ['transaction_date', 'description', 'amount'];

    columns.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (icon) {
            if (state.filters.sort === col) {
                icon.textContent = state.filters.order === 'DESC' ? '↓' : '↑';
                icon.classList.add('active');
            } else {
                icon.textContent = '';
                icon.classList.remove('active');
            }
        }
    });
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactions-tbody');

    if (state.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No transactions found</td></tr>';
        updateBulkActionsBar();
        return;
    }

    tbody.innerHTML = state.transactions.map(txn => {
        const isChecked = (state.selectedTransactions || []).includes(txn.id);
        const hasReceipt = txn.has_receipt > 0;
        const reimbursementIcon = getReimbursementIcon(txn.reimbursement_status, txn.amount);
        return `
        <tr class="${state.selectedTransaction === txn.id ? 'selected' : ''} ${isChecked ? 'row-checked' : ''}">
            <td onclick="event.stopPropagation()">
                <input type="checkbox" class="txn-checkbox" data-id="${txn.id}"
                    ${isChecked ? 'checked' : ''}
                    onchange="toggleTransactionSelection(${txn.id}, this.checked)">
            </td>
            <td onclick="showTransactionDetail(${txn.id})">${formatDate(txn.transaction_date)}</td>
            <td onclick="showTransactionDetail(${txn.id})">
                <div>${txn.description}</div>
                <div class="text-muted" style="font-size: 0.75rem">${txn.vendor_name || ''}</div>
            </td>
            <td onclick="showTransactionDetail(${txn.id})">
                <span class="category-badge" style="background: ${txn.category_color || '#e5e7eb'}20; color: ${txn.category_color || '#6b7280'}">
                    ${txn.category_name || 'Uncategorized'}
                </span>
            </td>
            <td onclick="showTransactionDetail(${txn.id})">${txn.account_name}</td>
            <td onclick="showTransactionDetail(${txn.id})" class="text-right ${txn.amount >= 0 ? 'amount-credit' : 'amount-debit'}">
                ${formatCurrency(txn.amount)}
            </td>
            <td class="text-center receipt-cell" onclick="showTransactionDetail(${txn.id})">
                <span class="receipt-icon ${hasReceipt ? 'has-receipt' : 'no-receipt'}" title="${hasReceipt ? 'Has Receipt' : 'No Receipt'}">
                    ${hasReceipt ? '🧾' : ''}
                </span>
                ${reimbursementIcon}
            </td>
            <td onclick="showTransactionDetail(${txn.id})">
                <span class="status-badge status-${txn.check_status ? txn.check_status : txn.status}">${txn.check_status ? txn.check_status : txn.status}</span>
            </td>
        </tr>
    `}).join('');

    updateBulkActionsBar();
}

// =====================================================
// Selection Functions
// =====================================================

function toggleTransactionSelection(id, checked) {
    if (!state.selectedTransactions) {
        state.selectedTransactions = [];
    }

    if (checked) {
        if (!state.selectedTransactions.includes(id)) {
            state.selectedTransactions.push(id);
        }
    } else {
        state.selectedTransactions = state.selectedTransactions.filter(x => x !== id);
    }

    updateBulkActionsBar();
    updateSelectAllCheckbox();
}

function toggleSelectAllTransactions(checked) {
    if (!state.selectedTransactions) {
        state.selectedTransactions = [];
    }

    if (checked) {
        state.transactions.forEach(txn => {
            if (!state.selectedTransactions.includes(txn.id)) {
                state.selectedTransactions.push(txn.id);
            }
        });
    } else {
        const currentPageIds = state.transactions.map(t => t.id);
        state.selectedTransactions = state.selectedTransactions.filter(id => !currentPageIds.includes(id));
    }

    renderTransactionsTable();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-transactions');
    if (!selectAllCheckbox) return;

    const currentPageIds = state.transactions.map(t => t.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => (state.selectedTransactions || []).includes(id));
    selectAllCheckbox.checked = allSelected;
}

function updateBulkActionsBar() {
    const bar = document.getElementById('bulk-actions');
    const countSpan = document.getElementById('selected-count');
    if (!bar || !countSpan) return;

    const count = (state.selectedTransactions || []).length;
    if (count > 0) {
        bar.style.display = 'flex';
        countSpan.textContent = `${count} selected`;
    } else {
        bar.style.display = 'none';
    }
}

function clearSelection() {
    state.selectedTransactions = [];
    const selectAllCheckbox = document.getElementById('select-all-transactions');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    renderTransactionsTable();
}

// =====================================================
// Pagination
// =====================================================

function renderPagination() {
    const container = document.getElementById('transactions-pagination');
    const { page, totalPages } = state.pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<button ${page === 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">&laquo; Prev</button>`;

    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    for (let i = start; i <= end; i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    html += `<button ${page === totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">Next &raquo;</button>`;

    container.innerHTML = html;
}

function goToPage(page) {
    state.pagination.page = page;
    fetchTransactions();
}

// =====================================================
// Transaction Detail
// =====================================================

async function showTransactionDetail(id) {
    state.selectedTransaction = id;

    const data = await apiGet('/transactions/detail.php', { id });

    if (!data.success) {
        showToast('Error loading transaction details', 'error');
        return;
    }

    const txn = data.data.transaction;
    const receipt = data.data.receipt;
    const panel = document.getElementById('transaction-detail-panel');
    const content = document.getElementById('transaction-detail-content');

    if (panel && content) {
        renderTransactionsTable();

        const receiptSection = receipt ? `
            <div class="detail-section receipt-section">
                <div class="detail-section-title">🧾 Receipt</div>
                <div class="receipt-preview">
                    ${receipt.file_type.startsWith('image/') ? `
                        <img src="${APP_BASE}/${receipt.file_path}" alt="Receipt" onclick="viewReceiptFullscreen('${receipt.file_path}')">
                    ` : `
                        <div class="pdf-preview" onclick="viewReceiptFullscreen('${receipt.file_path}')">
                            <span>📄 PDF</span>
                            <span class="pdf-name">${receipt.original_name}</span>
                        </div>
                    `}
                </div>
                <div class="receipt-actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewReceiptFullscreen('${receipt.file_path}')">View</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteReceiptFromTransaction(${txn.id}, ${receipt.id})">Remove</button>
                </div>
            </div>
        ` : `
            <div class="detail-section receipt-section">
                <div class="detail-section-title">🧾 Receipt</div>
                <div class="receipt-upload-area" onclick="openReceiptUploadModal(${txn.id})">
                    <span class="upload-icon">📷</span>
                    <span>Click to upload receipt</span>
                </div>
            </div>
        `;

        const reimbursementSection = txn.amount < 0 ? `
            <div class="detail-section reimbursement-section">
                <div class="detail-section-title">💰 Reimbursement</div>
                <div class="detail-field">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        <select id="reimbursement-status" class="form-select" onchange="updateReimbursementStatus(${txn.id}, this.value)">
                            <option value="none" ${txn.reimbursement_status === 'none' ? 'selected' : ''}>Not Requested</option>
                            <option value="pending" ${txn.reimbursement_status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="submitted" ${txn.reimbursement_status === 'submitted' ? 'selected' : ''}>Submitted</option>
                            <option value="reimbursed" ${txn.reimbursement_status === 'reimbursed' ? 'selected' : ''}>Reimbursed</option>
                        </select>
                    </div>
                </div>
                <div class="detail-field">
                    <div class="detail-label">Note</div>
                    <div class="detail-value">
                        <textarea id="reimbursement-note" class="form-input" rows="2"
                            placeholder="Add note (e.g., submitted to HR on...)"
                            onblur="updateReimbursementNote(${txn.id}, this.value)">${txn.reimbursement_notes || ''}</textarea>
                    </div>
                </div>
            </div>
        ` : '';

        content.innerHTML = `
            <div class="detail-field">
                <div class="detail-label">Amount</div>
                <div class="detail-amount ${txn.amount >= 0 ? 'text-success' : 'text-danger'}">
                    ${formatCurrency(txn.amount)}
                </div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Date</div>
                <div class="detail-value">${formatDate(txn.transaction_date, 'long')}</div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Description</div>
                <div class="detail-value">${txn.description}</div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Vendor</div>
                <div class="detail-value">${txn.vendor_name || '-'}</div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Category</div>
                <div class="detail-value">
                    <div class="category-dropdown-wrapper" id="txn-category-dropdown">
                        <input type="hidden" id="detail-category" value="${txn.category_id || ''}">
                        <div class="category-trigger" onclick="toggleTxnCategoryDropdown()">
                            <span class="category-trigger-text ${txn.category_id ? '' : 'placeholder'}" id="txn-category-trigger-text">
                                ${txn.category_id ? (txn.category_icon || '📁') + ' ' + (txn.category_name || 'Select category') : 'Select category'}
                            </span>
                        </div>
                        <div class="category-menu" id="txn-category-menu">
                            <div class="category-list-panel" id="txn-category-list-panel">
                                <!-- Parent categories rendered by JS -->
                            </div>
                            <div class="subcategory-panel" id="txn-subcategory-panel">
                                <div class="subcategory-empty">Select a category</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Account</div>
                <div class="detail-value">${txn.account_name}</div>
            </div>

            ${txn.transaction_type === 'transfer' ? `
            <div class="detail-field">
                <div class="detail-label">Transfer From (Bank Account)</div>
                <div class="detail-value">
                    <select id="detail-transfer-account" class="form-select" onchange="updateTransactionTransferAccount(${txn.id})">
                        <option value="">Select bank account...</option>
                        ${buildTransferAccountOptions(txn.transfer_account_id)}
                    </select>
                </div>
            </div>
            ` : ''}

            <div class="detail-field">
                <div class="detail-label">Status</div>
                <div class="detail-value">
                    <span class="status-badge status-${txn.check_status ? txn.check_status : txn.status}">${txn.check_status ? txn.check_status : txn.status}</span>
                </div>
            </div>

            <div class="detail-field">
                <div class="detail-label">Categorized By</div>
                <div class="detail-value">${txn.categorized_by || 'default'}</div>
            </div>

            ${txn.memo ? `
                <div class="detail-field">
                    <div class="detail-label">Memo</div>
                    <div class="detail-value">${txn.memo}</div>
                </div>
            ` : ''}

            ${receiptSection}
            ${reimbursementSection}

            <div class="detail-field mt-4">
                <label>
                    <input type="checkbox" id="create-rule-checkbox"> Create categorization rule
                </label>
            </div>

            <div class="detail-actions mt-4">
                <button class="btn btn-danger btn-sm" onclick="deleteTransaction(${txn.id})">
                    Delete Transaction
                </button>
            </div>
        `;

        panel.classList.add('open');

        // Set current transaction ID for category dropdown
        currentTxnIdForCategory = txn.id;
        // Initialize category dropdown after DOM is updated
        setTimeout(() => {
            renderTxnCategoryDropdown(txn.category_id);
        }, 0);
    } else {
        const categoryIcon = getCategoryIcon(txn.category_icon);

        openModal(`${txn.transaction_type === 'credit' ? '💵' : '💸'} Transaction Details`, `
            <div class="transaction-detail-modal">
                <div class="detail-amount-large ${txn.amount >= 0 ? 'text-success' : 'text-danger'}">
                    ${formatCurrency(txn.amount)}
                </div>

                <div class="detail-info-grid">
                    <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${formatDate(txn.transaction_date, 'long')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Description</span>
                        <span class="detail-value">${txn.description}</span>
                    </div>
                    ${txn.vendor_name ? `
                    <div class="detail-row">
                        <span class="detail-label">Vendor</span>
                        <span class="detail-value">${txn.vendor_name}</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Category</span>
                        <span class="detail-value">
                            <span class="category-badge" style="background: ${txn.category_color || '#e5e7eb'}20; color: ${txn.category_color || '#6b7280'}">
                                ${categoryIcon} ${txn.category_name || 'Uncategorized'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Account</span>
                        <span class="detail-value">${txn.account_name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">
                            <span class="status-badge status-${txn.check_status ? txn.check_status : txn.status}">${txn.check_status ? txn.check_status : txn.status}</span>
                        </span>
                    </div>
                    ${txn.memo ? `
                    <div class="detail-row">
                        <span class="detail-label">Memo</span>
                        <span class="detail-value">${txn.memo}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="form-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="closeModal(); navigateTo('transactions')">View All Transactions</button>
                </div>
            </div>
        `);
    }
}

// =====================================================
// Transaction Actions
// =====================================================

// ===== Two-Column Category Dropdown for Transaction Detail =====
let txnActiveCategoryId = null;
let txnSelectedCategoryId = null;
let currentTxnIdForCategory = null;

function renderTxnCategoryDropdown(selectedCategoryId) {
    txnSelectedCategoryId = selectedCategoryId ? parseInt(selectedCategoryId) : null;

    // Get parent categories (no parent_id)
    const parentCategories = state.categories.filter(c => !c.parent_id || c.parent_id == 0);
    const panel = document.getElementById('txn-category-list-panel');
    if (!panel) return;

    panel.innerHTML = parentCategories.map(cat => `
        <button type="button" class="category-btn" data-id="${cat.id}" onclick="selectTxnParentCategory(${cat.id}, event)">
            <span class="category-btn-icon">${cat.icon || '📁'}</span>
            <span>${cat.name}</span>
        </button>
    `).join('');

    // If we have a selected category, find its parent and select it
    if (txnSelectedCategoryId) {
        const selectedCat = state.categories.find(c => c.id === txnSelectedCategoryId);
        if (selectedCat) {
            const parentId = selectedCat.parent_id || selectedCat.id;
            selectTxnParentCategory(parentId);
        }
    }
}

function selectTxnParentCategory(parentId, event) {
    if (event) event.stopPropagation();

    txnActiveCategoryId = parentId;

    // Update button states
    document.querySelectorAll('#txn-category-list-panel .category-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.id) === parentId);
    });

    // Get children of this parent
    const children = state.categories.filter(c => c.parent_id === parentId);
    const parent = state.categories.find(c => c.id === parentId);
    const subPanel = document.getElementById('txn-subcategory-panel');
    if (!subPanel) return;

    if (children.length === 0) {
        // No children - show parent as selectable option
        subPanel.innerHTML = `
            <div class="subcategory-header">${parent?.name || 'Category'}</div>
            <div class="subcategory-option ${txnSelectedCategoryId === parentId ? 'selected' : ''}"
                 data-id="${parentId}"
                 onclick="selectTxnSubcategory(${parentId}, '${(parent?.icon || '📁').replace(/'/g, "\\'")}', '${(parent?.name || '').replace(/'/g, "\\'")}')">
                <span class="subcategory-option-icon">${parent?.icon || '📁'}</span>
                <span>${parent?.name}</span>
            </div>
        `;
    } else {
        // Has children - show them
        subPanel.innerHTML = `
            <div class="subcategory-header">${parent?.name || 'Subcategories'}</div>
            ${children.map(child => `
                <div class="subcategory-option ${txnSelectedCategoryId === child.id ? 'selected' : ''}"
                     data-id="${child.id}"
                     onclick="selectTxnSubcategory(${child.id}, '${(child.icon || '📁').replace(/'/g, "\\'")}', '${(child.name || '').replace(/'/g, "\\'")}')">
                    <span class="subcategory-option-icon">${child.icon || '📁'}</span>
                    <span>${child.name}</span>
                </div>
            `).join('')}
        `;
    }
}

function selectTxnSubcategory(categoryId, icon, name) {
    txnSelectedCategoryId = categoryId;
    document.getElementById('detail-category').value = categoryId;

    // Update trigger text
    const triggerText = document.getElementById('txn-category-trigger-text');
    if (triggerText) {
        triggerText.textContent = `${icon} ${name}`;
        triggerText.classList.remove('placeholder');
    }

    // Update selected state
    document.querySelectorAll('#txn-subcategory-panel .subcategory-option').forEach(opt => {
        opt.classList.toggle('selected', parseInt(opt.dataset.id) === categoryId);
    });

    // Close dropdown and update
    closeTxnCategoryDropdown();

    // Trigger category update
    if (currentTxnIdForCategory) {
        updateTransactionCategory(currentTxnIdForCategory);
    }
}

function toggleTxnCategoryDropdown() {
    const trigger = document.querySelector('#txn-category-dropdown .category-trigger');
    const menu = document.getElementById('txn-category-menu');
    if (!trigger || !menu) return;

    const isOpen = menu.classList.contains('open');

    if (isOpen) {
        closeTxnCategoryDropdown();
    } else {
        trigger.classList.add('open');
        menu.classList.add('open');
        // Initialize dropdown content
        renderTxnCategoryDropdown(document.getElementById('detail-category')?.value);
    }
}

function closeTxnCategoryDropdown() {
    const trigger = document.querySelector('#txn-category-dropdown .category-trigger');
    const menu = document.getElementById('txn-category-menu');
    if (trigger) trigger.classList.remove('open');
    if (menu) menu.classList.remove('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('txn-category-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        closeTxnCategoryDropdown();
    }
});

async function updateTransactionCategory(txnId) {
    const categoryId = document.getElementById('detail-category').value;
    const createRuleCheckbox = document.getElementById('create-rule-checkbox');
    const createRule = createRuleCheckbox ? createRuleCheckbox.checked : false;

    const result = await apiPost('/transactions/update.php', {
        id: txnId,
        category_id: parseInt(categoryId),
        create_rule: createRule
    });

    if (result.success) {
        showToast('Transaction updated', 'success');
        if (result.data.rule_created) {
            showToast('New categorization rule created', 'info');
        }
        await fetchTransactions();
    } else {
        showToast('Error updating transaction', 'error');
    }
}

async function updateTransactionTransferAccount(txnId) {
    const transferAccountId = document.getElementById('detail-transfer-account').value;

    const result = await apiPost('/transactions/update.php', {
        id: txnId,
        transfer_account_id: transferAccountId ? parseInt(transferAccountId) : null
    });

    if (result.success) {
        showToast('Transfer account updated', 'success');
        await fetchTransactions();
        // Refresh detail panel to show updated info
        await showTransactionDetail(txnId);
    } else {
        showToast(result.error || 'Error updating transfer account', 'error');
    }
}

async function deleteTransaction(txnId) {
    if (!confirm('Are you sure you want to delete this transaction?')) {
        return;
    }

    const result = await apiPost('/transactions/delete.php', { id: txnId });

    if (result.success) {
        showToast('Transaction deleted', 'success');
        state.selectedTransaction = null;
        const panel = document.getElementById('transaction-detail-panel');
        if (panel) {
            panel.classList.remove('open');
        }
        await fetchTransactions();
    } else {
        showToast(result.error || 'Error deleting transaction', 'error');
    }
}

async function deleteSelectedTransactions() {
    const ids = state.selectedTransactions || [];
    if (ids.length === 0) {
        showToast('No transactions selected', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${ids.length} transaction(s)?`)) {
        return;
    }

    const result = await apiPost('/transactions/delete.php', { ids });

    if (result.success) {
        showToast(`${result.data.deleted_count} transaction(s) deleted`, 'success');
        state.selectedTransactions = [];
        await fetchTransactions();
    } else {
        showToast(result.error || 'Error deleting transactions', 'error');
    }
}

// =====================================================
// Receipt Functions
// =====================================================

async function uploadReceiptForTransaction(transactionId, file) {
    if (!file) return;

    const txnId = transactionId || state.selectedTransaction;

    if (!txnId) {
        showToast('No transaction selected', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('transaction_id', txnId);
    formData.append('user_id', state.currentUser);

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt uploaded successfully', 'success');
            await showTransactionDetail(txnId);
            await fetchTransactions();
        } else {
            showToast(result.message || 'Error uploading receipt', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Error uploading receipt', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteReceiptFromTransaction(transactionId, receiptId) {
    if (!confirm('Are you sure you want to remove this receipt?')) {
        return;
    }

    try {
        const result = await apiDelete(`/receipts/?id=${receiptId}`);

        if (result.success) {
            showToast('Receipt removed', 'success');
            await showTransactionDetail(transactionId);
            await fetchTransactions();
        } else {
            showToast(result.message || 'Error removing receipt', 'error');
        }
    } catch (error) {
        showToast('Error removing receipt', 'error');
    }
}

function viewReceiptFullscreen(filePath) {
    const url = `${APP_BASE}/${filePath}`;
    const isPdf = filePath.toLowerCase().endsWith('.pdf');

    if (isPdf) {
        window.open(url, '_blank');
    } else {
        openModal('🧾 Receipt', `
            <div class="receipt-fullscreen">
                <img src="${url}" alt="Receipt" style="max-width: 100%; max-height: 80vh;">
            </div>
            <div class="mt-3 text-center">
                <a href="${url}" download class="btn btn-primary">Download</a>
            </div>
        `);
    }
}

// Receipt upload modal state
let pendingReceiptFile = null;
let pendingTransactionId = null;

function openReceiptUploadModal(transactionId) {
    pendingTransactionId = transactionId;
    const today = new Date().toISOString().split('T')[0];

    const modalContent = `
        <div class="receipt-upload-modal-form">
            <div class="txn-receipt-dropzone" id="txn-receipt-dropzone"
                 ondragover="handleDragOver(event)"
                 ondragleave="handleDragLeave(event)"
                 ondrop="handleDropForTxn(event)">
                <input type="file" id="txn-receipt-file" accept="image/*,.pdf" style="display:none"
                       onchange="handleTxnFileSelect(event)">
                <div class="dropzone-content" onclick="document.getElementById('txn-receipt-file').click()">
                    <span class="dropzone-icon">📷</span>
                    <p class="dropzone-text">Drag & drop or click to browse</p>
                    <p class="dropzone-hint">JPG, PNG, GIF, PDF (Max 10MB)</p>
                </div>
            </div>

            <div class="txn-receipt-preview" id="txn-receipt-preview" style="display:none;">
                <img id="txn-preview-img" src="" alt="Preview">
                <button type="button" class="btn btn-sm btn-secondary" onclick="clearTxnReceiptPreview()">Remove</button>
            </div>

            <div class="receipt-form-fields">
                <div class="form-row">
                    <div class="form-group">
                        <label>Vendor / Store</label>
                        <input type="text" id="txn-receipt-vendor" placeholder="e.g., Amazon, Costco">
                    </div>
                    <div class="form-group">
                        <label>Amount</label>
                        <input type="number" id="txn-receipt-amount" step="0.01" placeholder="0.00">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Receipt Date</label>
                        <input type="date" id="txn-receipt-date" value="${today}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Description / Notes</label>
                    <textarea id="txn-receipt-description" rows="2" placeholder="What was this purchase for?"></textarea>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="txn-receipt-reimbursable">
                        Mark as reimbursable expense
                    </label>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="submitTxnReceipt()">Upload Receipt</button>
            </div>
        </div>
    `;

    openModal('📎 Upload Receipt', modalContent);
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
}

function handleDropForTxn(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processReceiptFile(files[0]);
    }
}

function handleTxnFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (file) {
        processReceiptFile(file);
    }
}

function processReceiptFile(file) {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Invalid file type. Allowed: JPG, PNG, GIF, PDF', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large. Maximum size: 10MB', 'error');
        return;
    }

    pendingReceiptFile = file;

    const dropzone = document.getElementById('txn-receipt-dropzone');
    const preview = document.getElementById('txn-receipt-preview');
    const previewImg = document.getElementById('txn-preview-img');

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
            dropzone.style.display = 'none';
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = `
            <div class="pdf-preview-box">
                <span class="pdf-icon">📄</span>
                <span class="pdf-filename">${file.name}</span>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="clearTxnReceiptPreview()">Remove</button>
        `;
        dropzone.style.display = 'none';
        preview.style.display = 'block';
    }
}

function clearTxnReceiptPreview() {
    pendingReceiptFile = null;
    document.getElementById('txn-receipt-file').value = '';
    document.getElementById('txn-receipt-dropzone').style.display = 'block';
    document.getElementById('txn-receipt-preview').style.display = 'none';
    document.getElementById('txn-receipt-preview').innerHTML = `
        <img id="txn-preview-img" src="" alt="Preview">
        <button type="button" class="btn btn-sm btn-secondary" onclick="clearTxnReceiptPreview()">Remove</button>
    `;
}

async function submitTxnReceipt() {
    if (!pendingReceiptFile) {
        showToast('Please select a file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('receipt', pendingReceiptFile);
    formData.append('user_id', state.currentUser);
    formData.append('transaction_id', pendingTransactionId);
    formData.append('vendor_name', document.getElementById('txn-receipt-vendor').value);
    formData.append('amount', document.getElementById('txn-receipt-amount').value);
    formData.append('receipt_date', document.getElementById('txn-receipt-date').value);
    formData.append('description', document.getElementById('txn-receipt-description').value);

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt uploaded successfully', 'success');
            closeModal();

            if (document.getElementById('txn-receipt-reimbursable').checked) {
                await apiPost('/transactions/update.php', {
                    id: pendingTransactionId,
                    reimbursement_status: 'pending'
                });
            }

            await showTransactionDetail(pendingTransactionId);
            await fetchTransactions();

            pendingReceiptFile = null;
            pendingTransactionId = null;
        } else {
            showToast(result.message || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed', 'error');
    } finally {
        hideLoading();
    }
}

// =====================================================
// Reimbursement Functions
// =====================================================

async function updateReimbursementStatus(transactionId, status) {
    try {
        const result = await apiPost('/transactions/update.php', {
            id: transactionId,
            reimbursement_status: status
        });

        if (result.success) {
            showToast('Reimbursement status updated', 'success');
            await fetchTransactions();
        } else {
            showToast(result.message || 'Error updating status', 'error');
        }
    } catch (error) {
        showToast('Error updating reimbursement status', 'error');
    }
}

async function updateReimbursementNote(transactionId, note) {
    try {
        const result = await apiPost('/transactions/update.php', {
            id: transactionId,
            reimbursement_notes: note
        });

        if (result.success) {
            showToast('Reimbursement note saved', 'success');
        } else {
            showToast(result.message || 'Error saving note', 'error');
        }
    } catch (error) {
        showToast('Error saving reimbursement note', 'error');
    }
}

function toggleReimbActions(transactionId, event) {
    event.stopPropagation();

    const dropdown = document.getElementById(`reimb-actions-${transactionId}`);
    const isOpen = dropdown.classList.contains('open');

    document.querySelectorAll('.actions-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
    });

    if (!isOpen) {
        dropdown.classList.add('open');
    }
}

async function handleReimbAction(transactionId, action, event) {
    event.stopPropagation();

    document.querySelectorAll('.actions-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
    });

    if (action === 'view') {
        navigateTo('transactions');
        setTimeout(() => {
            showTransactionDetail(transactionId);
        }, 300);
    } else {
        await updateReimbursementStatus(transactionId, action);
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.buildHierarchicalCategoryOptionsWithSelected = buildHierarchicalCategoryOptionsWithSelected;
window.buildTransferAccountOptions = buildTransferAccountOptions;
window.buildGroupedAccountOptions = buildGroupedAccountOptions;
window.loadTransactions = loadTransactions;
window.loadFilterOptions = loadFilterOptions;
window.applyDatePreset = applyDatePreset;
window.setupTransactionFilters = setupTransactionFilters;
window.fetchTransactions = fetchTransactions;
window.sortTransactions = sortTransactions;
window.renderTransactionsTable = renderTransactionsTable;
window.toggleTransactionSelection = toggleTransactionSelection;
window.toggleSelectAllTransactions = toggleSelectAllTransactions;
window.clearSelection = clearSelection;
window.renderPagination = renderPagination;
window.goToPage = goToPage;
window.showTransactionDetail = showTransactionDetail;
window.updateTransactionCategory = updateTransactionCategory;
window.updateTransactionTransferAccount = updateTransactionTransferAccount;
window.deleteTransaction = deleteTransaction;
window.deleteSelectedTransactions = deleteSelectedTransactions;
window.uploadReceiptForTransaction = uploadReceiptForTransaction;
window.deleteReceiptFromTransaction = deleteReceiptFromTransaction;
window.viewReceiptFullscreen = viewReceiptFullscreen;
window.openReceiptUploadModal = openReceiptUploadModal;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDropForTxn = handleDropForTxn;
window.handleTxnFileSelect = handleTxnFileSelect;
window.processReceiptFile = processReceiptFile;
window.clearTxnReceiptPreview = clearTxnReceiptPreview;
window.submitTxnReceipt = submitTxnReceipt;
window.updateReimbursementStatus = updateReimbursementStatus;
window.updateReimbursementNote = updateReimbursementNote;
window.toggleReimbActions = toggleReimbActions;
window.handleReimbAction = handleReimbAction;
