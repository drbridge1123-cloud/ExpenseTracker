/**
 * Cost Account Module - IOLTA Style
 * 2-Column Layout with Client Sidebar + Transaction List
 */

// State management for cost module
const costState = {
    clients: [],
    transactions: [],
    allTransactions: [],
    filteredTransactions: [],
    selectedClientId: 'all',
    selectedTxIds: new Set(),
    clientBalances: {},
    searchTerm: '',
    txSearchTerm: '',
    monthFilter: null,  // { month: 12, year: 2025 } or null for all
    categories: [] // User-defined categories
};

// Cache for clients to avoid duplicate API calls
let _costClientsCache = null;
let _costClientsCacheTime = 0;
const _COST_CACHE_TTL = 30000; // 30 seconds

async function loadCostClients(forceRefresh = false) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const now = Date.now();

    // Return cached data if valid
    if (!forceRefresh && _costClientsCache && (now - _costClientsCacheTime) < _COST_CACHE_TTL) {
        return _costClientsCache;
    }

    const result = await apiGet('/trust/clients.php', { user_id: userId });
    if (result.success && result.data) {
        _costClientsCache = result.data.clients || [];
        _costClientsCacheTime = now;
        return _costClientsCache;
    }
    return [];
}

// Default cost categories
const DEFAULT_COST_CATEGORIES = [
    'Filing Fees',
    'Court Costs',
    'Service Fees',
    'Expert Witness',
    'Travel',
    'Copies/Printing',
    'Postage',
    'Other'
];

// Get all categories (default + user-defined)
function getCostCategories() {
    const userCategories = JSON.parse(localStorage.getItem('costCategories') || '[]');
    const allCategories = [...DEFAULT_COST_CATEGORIES];

    // Add user categories that aren't already in default
    userCategories.forEach(cat => {
        if (!allCategories.includes(cat)) {
            allCategories.push(cat);
        }
    });

    return allCategories;
}

// Generate category options HTML
function getCostCategoryOptions() {
    return getCostCategories().map(cat =>
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

// Add new category
function costAddCategory(categoryName) {
    if (!categoryName || categoryName.trim() === '') return false;

    const trimmed = categoryName.trim();
    const existing = getCostCategories();

    if (existing.includes(trimmed)) {
        showToast('Category already exists', 'warning');
        return false;
    }

    const userCategories = JSON.parse(localStorage.getItem('costCategories') || '[]');
    userCategories.push(trimmed);
    localStorage.setItem('costCategories', JSON.stringify(userCategories));

    return true;
}

// Open Add Category modal
function costOpenAddCategoryModal(context) {
    const modalHtml = `
        <div id="cost-add-category-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15,23,42,0.4);
            z-index: 300000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        ">
            <div style="
                background: white;
                padding: 32px;
                border-radius: 20px;
                width: 400px;
                max-width: 90vw;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                animation: costModalSlideUp 0.25s ease-out;
            ">
                <div style="text-align: center; margin-bottom: 28px;">
                    <div style="
                        width: 56px;
                        height: 56px;
                        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                        border-radius: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 20px;
                        font-size: 28px;
                    ">📁</div>
                    <h3 style="margin: 0; font-size: 22px; font-weight: 600; color: #0f172a;">New Category</h3>
                    <p style="margin: 10px 0 0; font-size: 14px; color: #64748b;">Add a custom category for your expenses</p>
                </div>
                <div style="margin-bottom: 28px;">
                    <input type="text" id="cost-new-category-name"
                           class="cost-category-input"
                           placeholder="e.g., Medical Records, Deposition">
                </div>
                <div style="display: flex; gap: 12px;">
                    <button type="button" class="cost-cat-btn-cancel" onclick="costCloseAddCategoryModal()">Cancel</button>
                    <button type="button" class="cost-cat-btn-add" onclick="costSaveNewCategory('${context}')">Add Category</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes costModalSlideUp {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .cost-category-input {
                width: 100%;
                padding: 16px 18px;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                font-size: 15px;
                transition: all 0.2s ease;
                outline: none;
                box-sizing: border-box;
                background: #f8fafc;
            }
            .cost-category-input:focus {
                border-color: #6366f1;
                background: white;
                box-shadow: 0 0 0 4px rgba(99,102,241,0.1);
            }
            .cost-category-input::placeholder {
                color: #94a3b8;
            }
            .cost-cat-btn-cancel {
                flex: 1;
                padding: 14px 24px;
                border: 2px solid #e2e8f0;
                background: white;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                color: #64748b;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .cost-cat-btn-cancel:hover {
                background: #f8fafc;
                border-color: #cbd5e1;
            }
            .cost-cat-btn-add {
                flex: 1;
                padding: 14px 24px;
                border: none;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                color: white;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 14px rgba(99,102,241,0.35);
            }
            .cost-cat-btn-add:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(99,102,241,0.4);
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(() => {
        const input = document.getElementById('cost-new-category-name');
        if (input) {
            input.focus();
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') costSaveNewCategory(context);
            });
        }
    }, 100);
}

// Close Add Category modal
function costCloseAddCategoryModal() {
    const overlay = document.getElementById('cost-add-category-overlay');
    if (overlay) overlay.remove();
}

// Save new category and update dropdown
function costSaveNewCategory(context) {
    const input = document.getElementById('cost-new-category-name');
    const categoryName = input?.value?.trim();

    if (!categoryName) {
        showToast('Please enter a category name', 'warning');
        return;
    }

    if (costAddCategory(categoryName)) {
        showToast(`Category "${categoryName}" added`, 'success');

        // Update the appropriate dropdown
        let selectId;
        if (context === 'expense') {
            selectId = 'cost-expense-category';
        } else if (context === 'bulk') {
            selectId = 'cost-bulk-category';
        } else if (context === 'tx') {
            selectId = 'cost-tx-category';
        } else if (context === 'edit') {
            selectId = 'cost-edit-tx-category';
        }

        if (selectId) {
            const select = document.getElementById(selectId);
            if (select) {
                // Rebuild options
                select.innerHTML = '<option value="">-- Select --</option>' + getCostCategoryOptions();

                // Set to new category
                select.value = categoryName;
            }
        }

        costCloseAddCategoryModal();
    }
}

// =====================================================
// MAIN PAGE LOAD
// =====================================================

async function loadCostClientLedgerPage() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Check for month filter from sessionStorage (from dashboard "View All Transactions")
        const monthFilterStr = sessionStorage.getItem('costMonthFilter');
        if (monthFilterStr) {
            costState.monthFilter = JSON.parse(monthFilterStr);
            sessionStorage.removeItem('costMonthFilter'); // Clear after reading
        } else {
            costState.monthFilter = null;
        }

        // Load clients from trust_clients (shared) - use cache
        costState.clients = await loadCostClients();

        // Load all cost transactions
        const txResult = await apiGet('/cost/transactions.php', { user_id: userId, limit: 'all' });
        costState.allTransactions = (txResult.success && txResult.data) ? (txResult.data.transactions || []) : [];

        // Calculate client balances
        calculateClientBalances();

        // Reset selection
        costState.selectedClientId = 'all';
        costState.selectedTxIds.clear();
        costState.searchTerm = '';
        costState.txSearchTerm = '';

        // Clear search inputs
        const clientSearch = document.getElementById('cost-client-search');
        const txSearch = document.getElementById('cost-tx-search');
        if (clientSearch) clientSearch.value = '';
        if (txSearch) txSearch.value = '';

        // Render UI
        renderCostClientSidebar();
        renderCostTransactionList();
        updateCostSelectedHeader();
        updateCostMonthFilterUI();

        // Update Check Status badge counts in header
        updateCostCheckStatusBadges();

    } catch (error) {
        console.error('Error loading cost client ledger:', error);
        showToast('Error loading cost client ledger', 'error');
    }
}

// Update UI to show month filter status
function updateCostMonthFilterUI() {
    // Find or create the filter indicator container
    let filterIndicator = document.getElementById('cost-month-filter-indicator');
    const headerArea = document.querySelector('.cost-client-ledger-header') ||
                       document.querySelector('#cost-client-ledger .page-header') ||
                       document.querySelector('#cost-tx-search')?.parentElement;

    if (costState.monthFilter) {
        const { month, year } = costState.monthFilter;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[month - 1];

        if (!filterIndicator && headerArea) {
            filterIndicator = document.createElement('div');
            filterIndicator.id = 'cost-month-filter-indicator';
            headerArea.parentElement.insertBefore(filterIndicator, headerArea.nextSibling);
        }

        if (filterIndicator) {
            filterIndicator.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #dbeafe; border-radius: 8px; margin: 8px 16px;">
                    <span style="font-size: 14px; color: #1e40af;">
                        📅 Showing: <strong>${monthName} ${year}</strong> transactions only
                    </span>
                    <button onclick="costClearMonthFilter()" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">
                        Clear Filter
                    </button>
                </div>
            `;
        }
    } else {
        if (filterIndicator) {
            filterIndicator.remove();
        }
    }
}

// Clear month filter
function costClearMonthFilter() {
    costState.monthFilter = null;
    renderCostTransactionList();
    updateCostMonthFilterUI();
}

// Update Check Status badge counts in page header
function updateCostCheckStatusBadges() {
    const allTx = costState.allTransactions || [];

    // Filter checks (disbursements with reference numbers)
    const checks = allTx.filter(tx => {
        const amount = parseFloat(tx.amount || 0);
        const hasCheckNumber = tx.reference_number || tx.check_number;
        return amount < 0 && hasCheckNumber;
    });

    // Count by status (pending includes: null, empty, 'pending', 'posted')
    const pendingCount = checks.filter(c => !c.status || c.status === 'pending' || c.status === 'posted').length;
    const printedCount = checks.filter(c => c.status === 'printed').length;
    const clearedCount = checks.filter(c => c.status === 'cleared' || c.status === 'reconciled').length;

    // Update header badges
    const pendingEl = document.getElementById('cost-pending-count');
    const printedEl = document.getElementById('cost-printed-count');
    const clearedEl = document.getElementById('cost-cleared-count');

    if (pendingEl) pendingEl.textContent = pendingCount;
    if (printedEl) printedEl.textContent = printedCount;
    if (clearedEl) clearedEl.textContent = clearedCount;
}

function calculateClientBalances() {
    costState.clientBalances = {};
    let totalBalance = 0;

    costState.allTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        totalBalance += amount;
        if (tx.client_id) {
            costState.clientBalances[tx.client_id] = (costState.clientBalances[tx.client_id] || 0) + amount;
        }
    });

    // Update total balance in header
    const totalEl = document.getElementById('cost-total-balance');
    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }
}

// =====================================================
// CLIENT SIDEBAR
// =====================================================

function renderCostClientSidebar() {
    const container = document.getElementById('cost-client-list');
    if (!container) return;

    let clients = costState.clients || [];

    // Filter by search term
    if (costState.searchTerm) {
        const term = costState.searchTerm.toLowerCase();
        clients = clients.filter(c =>
            c.client_name.toLowerCase().includes(term) ||
            (c.case_number && c.case_number.toLowerCase().includes(term)) ||
            (c.client_number && c.client_number.toLowerCase().includes(term))
        );
    }

    // Sort by case_number descending
    clients.sort((a, b) => {
        const caseA = a.case_number || a.client_number || '0';
        const caseB = b.case_number || b.client_number || '0';
        return caseB.localeCompare(caseA, undefined, { numeric: true });
    });

    // Calculate unassigned balance (transactions without client_id)
    const unassignedTx = costState.allTransactions.filter(tx => !tx.client_id);
    const unassignedBalance = unassignedTx.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
    const unassignedCount = unassignedTx.length;

    // Calculate total balance (including unassigned)
    const clientsTotal = Object.values(costState.clientBalances).reduce((sum, b) => sum + b, 0);
    const totalBalance = clientsTotal + unassignedBalance;
    const totalBalanceColor = totalBalance > 0 ? '#10b981' : (totalBalance < 0 ? '#ef4444' : '#64748b');

    // Build HTML
    let html = `
        <div class="cost-client-item ${costState.selectedClientId === 'all' ? 'active' : ''}"
             onclick="selectCostClientFromSidebar('all')"
             style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; ${costState.selectedClientId === 'all' ? 'background: #ecfdf5; border-left: 3px solid #059669;' : 'border-left: 3px solid transparent;'}">
            <div>
                <div style="font-size: 13px; font-weight: 600; color: #059669;">All Clients</div>
                <div style="font-size: 11px; color: #64748b;">${costState.clients.length} total</div>
            </div>
            <div style="font-size: 13px; font-weight: 700; color: ${totalBalanceColor};">
                ${formatCurrency(totalBalance)}
            </div>
        </div>
    `;

    // Add Unassigned section (like IOLTA's General/Unassigned)
    if (unassignedCount > 0 || costState.selectedClientId === 'unassigned') {
        const isUnassignedActive = costState.selectedClientId === 'unassigned';
        const unassignedBalanceColor = unassignedBalance > 0 ? '#10b981' : (unassignedBalance < 0 ? '#ef4444' : '#94a3b8');

        html += `
            <div style="padding: 6px 16px; background: #fef3c7; border-bottom: 1px solid #fde68a;">
                <div style="font-size: 10px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Unassigned</div>
            </div>
            <div class="cost-client-item ${isUnassignedActive ? 'active' : ''}"
                 onclick="selectCostClientFromSidebar('unassigned')"
                 style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; ${isUnassignedActive ? 'background: #fef9c3; border-left: 3px solid #f59e0b;' : 'border-left: 3px solid transparent; background: #fffbeb;'}"
                 onmouseover="if(!this.classList.contains('active')) this.style.background='#fef3c7'"
                 onmouseout="if(!this.classList.contains('active')) this.style.background='#fffbeb'">
                <div style="min-width: 0; flex: 1;">
                    <div style="font-size: 13px; font-weight: 500; color: #92400e;">
                        Bank Statement
                    </div>
                    <div style="font-size: 11px; color: #b45309;">
                        ${unassignedCount} pending assignment
                    </div>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: ${unassignedBalanceColor}; margin-left: 8px; white-space: nowrap;">
                    ${formatCurrency(unassignedBalance)}
                </div>
            </div>
        `;
    }

    // Add Clients section header
    html += `
        <div style="padding: 6px 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
            <div style="font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Clients</div>
        </div>
    `;

    if (clients.length === 0 && costState.searchTerm) {
        html += `
            <div style="padding: 24px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 13px;">No clients found</div>
            </div>
        `;
    } else if (clients.length === 0) {
        html += `
            <div style="padding: 24px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
                <div style="font-size: 13px;">No clients yet</div>
                <button onclick="openCostClientModal()" style="margin-top: 12px; padding: 6px 14px; background: #059669; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">+ Add Client</button>
            </div>
        `;
    } else {
        clients.forEach(client => {
            const isActive = costState.selectedClientId == client.id;
            const balance = costState.clientBalances[client.id] || 0;
            const balanceColor = balance > 0 ? '#10b981' : (balance < 0 ? '#ef4444' : '#94a3b8');

            html += `
                <div class="cost-client-item ${isActive ? 'active' : ''}"
                     onclick="selectCostClientFromSidebar('${client.id}')"
                     style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; ${isActive ? 'background: #ecfdf5; border-left: 3px solid #059669;' : 'border-left: 3px solid transparent;'}"
                     onmouseover="if(!this.classList.contains('active')) this.style.background='#f8fafc'"
                     onmouseout="if(!this.classList.contains('active')) this.style.background=''">
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 13px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(client.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8;">
                            ${client.case_number || client.client_number || 'No case #'}
                        </div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: ${balanceColor}; margin-left: 8px; white-space: nowrap;">
                        ${formatCurrency(balance)}
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}

function filterCostClients() {
    const input = document.getElementById('cost-client-search');
    costState.searchTerm = input ? input.value.toLowerCase() : '';
    renderCostClientSidebar();
}

function selectCostClientFromSidebar(clientId) {
    costState.selectedClientId = clientId;
    costState.selectedTxIds.clear();
    costState.txSearchTerm = '';

    const txSearch = document.getElementById('cost-tx-search');
    if (txSearch) txSearch.value = '';

    renderCostClientSidebar();
    updateCostSelectedHeader();
    renderCostTransactionList();
}

function updateCostSelectedHeader() {
    const nameEl = document.getElementById('cost-selected-name');
    const detailEl = document.getElementById('cost-selected-detail');
    const balanceBar = document.getElementById('cost-balance-bar');
    const balanceEl = document.getElementById('cost-client-balance');
    const depositsEl = document.getElementById('cost-client-deposits');
    const disbursementsEl = document.getElementById('cost-client-disbursements');

    if (!nameEl) return;

    if (costState.selectedClientId === 'all') {
        const totalBalance = Object.values(costState.clientBalances).reduce((sum, b) => sum + b, 0);
        nameEl.textContent = 'All Clients';
        detailEl.textContent = `${costState.clients.length} clients`;
        if (balanceBar) balanceBar.style.display = 'none';
    } else if (costState.selectedClientId === 'unassigned') {
        // Unassigned/Bank Statement view
        const unassignedTx = costState.allTransactions.filter(tx => !tx.client_id);
        let deposits = 0, disbursements = 0;
        unassignedTx.forEach(tx => {
            const amt = parseFloat(tx.amount) || 0;
            if (amt >= 0) deposits += amt;
            else disbursements += Math.abs(amt);
        });
        const balance = deposits - disbursements;

        nameEl.textContent = 'Bank Statement';
        nameEl.style.color = '#92400e';
        detailEl.textContent = `${unassignedTx.length} pending assignment`;

        if (balanceBar) {
            balanceBar.style.display = 'block';
            balanceBar.style.background = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
            balanceBar.style.borderBottom = '1px solid #fcd34d';
            if (balanceEl) {
                balanceEl.textContent = formatCurrency(balance);
                balanceEl.style.color = balance >= 0 ? '#047857' : '#dc2626';
            }
            if (depositsEl) depositsEl.textContent = formatCurrency(deposits);
            if (disbursementsEl) disbursementsEl.textContent = formatCurrency(disbursements);
        }
    } else {
        const client = costState.clients.find(c => c.id == costState.selectedClientId);
        if (client) {
            const balance = costState.clientBalances[client.id] || 0;

            // Calculate deposits and disbursements
            const clientTx = costState.allTransactions.filter(tx => tx.client_id == client.id);
            let deposits = 0, disbursements = 0;
            clientTx.forEach(tx => {
                const amt = parseFloat(tx.amount) || 0;
                if (amt >= 0) deposits += amt;
                else disbursements += Math.abs(amt);
            });

            nameEl.textContent = client.client_name;
            nameEl.style.color = '#1e293b';
            detailEl.textContent = client.case_number || client.client_number || '';

            if (balanceBar) {
                balanceBar.style.display = 'block';
                balanceBar.style.background = 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
                balanceBar.style.borderBottom = '1px solid #a7f3d0';
                if (balanceEl) {
                    balanceEl.textContent = formatCurrency(balance);
                    balanceEl.style.color = balance >= 0 ? '#047857' : '#dc2626';
                }
                if (depositsEl) depositsEl.textContent = formatCurrency(deposits);
                if (disbursementsEl) disbursementsEl.textContent = formatCurrency(disbursements);
            }
        }
    }
}

// =====================================================
// TRANSACTION LIST
// =====================================================

// Sort state for Cost table
let costSortColumn = 'date';
let costSortDirection = 'desc';

function sortCostTable(column) {
    if (costSortColumn === column) {
        costSortDirection = costSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        costSortColumn = column;
        costSortDirection = column === 'date' ? 'desc' : 'asc';
    }

    // Update sort icons
    ['date', 'check', 'payee', 'description', 'amount', 'status'].forEach(col => {
        const icon = document.getElementById(`cost-sort-icon-${col}`);
        if (icon) {
            if (col === costSortColumn) {
                icon.textContent = costSortDirection === 'asc' ? '▲' : '▼';
            } else {
                icon.textContent = '';
            }
        }
    });

    renderCostTransactionList();
}

function renderCostTransactionList() {
    const container = document.getElementById('cost-transactions-list');
    const countEl = document.getElementById('cost-tx-count');
    if (!container) return;

    // Get transactions for selected client
    let transactions = costState.allTransactions;

    // Apply month filter if set
    if (costState.monthFilter) {
        const { month, year } = costState.monthFilter;
        transactions = transactions.filter(tx => {
            const txDate = new Date(tx.transaction_date);
            return txDate.getMonth() + 1 === month && txDate.getFullYear() === year;
        });
    }

    if (costState.selectedClientId === 'unassigned') {
        // Show only unassigned transactions (no client_id)
        transactions = transactions.filter(tx => !tx.client_id);
    } else if (costState.selectedClientId !== 'all') {
        transactions = transactions.filter(tx => tx.client_id == costState.selectedClientId);
    }

    // Filter by search term
    if (costState.txSearchTerm) {
        const term = costState.txSearchTerm.toLowerCase();
        transactions = transactions.filter(tx =>
            (tx.description && tx.description.toLowerCase().includes(term)) ||
            (tx.reference_number && tx.reference_number.toLowerCase().includes(term)) ||
            (tx.vendor_name && tx.vendor_name.toLowerCase().includes(term)) ||
            (tx.amount && tx.amount.toString().includes(term)) ||
            (tx.check_number && tx.check_number.toLowerCase().includes(term))
        );
    }

    // Sort based on current sort state
    transactions = [...transactions].sort((a, b) => {
        let comparison = 0;
        switch (costSortColumn) {
            case 'date':
                comparison = new Date(a.transaction_date) - new Date(b.transaction_date);
                if (comparison === 0) comparison = a.id - b.id;
                break;
            case 'check':
                const checkA = a.reference_number || a.check_number || '';
                const checkB = b.reference_number || b.check_number || '';
                comparison = checkA.localeCompare(checkB, undefined, { numeric: true });
                break;
            case 'payee':
                const payeeA = a.vendor_name || a.payee || '';
                const payeeB = b.vendor_name || b.payee || '';
                comparison = payeeA.localeCompare(payeeB);
                break;
            case 'description':
                const descA = a.description || '';
                const descB = b.description || '';
                comparison = descA.localeCompare(descB);
                break;
            case 'amount':
                comparison = parseFloat(a.amount || 0) - parseFloat(b.amount || 0);
                break;
            case 'status':
                const statusA = a.status || 'pending';
                const statusB = b.status || 'pending';
                comparison = statusA.localeCompare(statusB);
                break;
        }
        return costSortDirection === 'asc' ? comparison : -comparison;
    });

    // Store for later
    costState.filteredTransactions = transactions;

    // Update count
    if (countEl) {
        countEl.textContent = `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`;
    }

    // Clear search button visibility
    const clearBtn = document.getElementById('cost-clear-search-btn');
    if (clearBtn) {
        clearBtn.style.display = costState.txSearchTerm ? 'block' : 'none';
    }

    // Update bulk actions
    updateCostBulkActions();

    if (transactions.length === 0) {
        container.innerHTML = `
            <div style="padding: 50px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 10px;">&#128196;</div>
                <div style="font-size: 15px; font-weight: 500;">${costState.txSearchTerm ? 'No matching transactions' : 'No Transactions'}</div>
                <div style="font-size: 12px; margin-top: 4px;">
                    ${costState.selectedClientId !== 'all' ? 'Click "+ New Transaction" to add one' : 'Select a client to view transactions'}
                </div>
            </div>
        `;
        return;
    }

    // Calculate running balance for single client view
    let runningBalance = 0;
    if (costState.selectedClientId !== 'all') {
        // Sort ascending for running balance calculation
        const sortedForBalance = [...transactions].sort((a, b) => {
            const dateCompare = new Date(a.transaction_date) - new Date(b.transaction_date);
            if (dateCompare !== 0) return dateCompare;
            return a.id - b.id;
        });
        sortedForBalance.forEach(tx => {
            runningBalance += parseFloat(tx.amount) || 0;
            tx.running_balance = runningBalance;
        });
    }

    // Build rows with IOLTA-style columns: checkbox, date, check#, payee, type, description, amount, balance, status
    let html = transactions.map((tx, index) => {
        const amount = parseFloat(tx.amount || 0);
        const isDebit = amount < 0;
        const displayAmount = Math.abs(amount);

        // For "All Clients" view, show client balance; for single client, show running balance
        let balance = 0;
        if (costState.selectedClientId === 'all') {
            balance = costState.clientBalances[tx.client_id] || 0;
        } else {
            balance = tx.running_balance || 0;
        }

        const isSelected = costState.selectedTxIds.has(tx.id);

        // Extract check number
        const checkNum = tx.reference_number || tx.check_number || '';

        // Get payee
        const payee = tx.vendor_name || tx.payee || '';

        // Get client name for All Clients view
        let description = tx.description || '';
        if (costState.selectedClientId === 'all' && tx.client_id) {
            const client = costState.clients.find(c => c.id == tx.client_id);
            const clientName = client ? client.client_name : 'Unknown';
            description = `<span style="color: #059669; font-weight: 500;">${escapeHtml(clientName)}</span> - ${escapeHtml(description || '-')}`;
        } else {
            description = escapeHtml(description || '-');
        }

        // Determine transaction type and badge
        let typeLabel, typeBg, typeColor;
        const txType = tx.transaction_type || (isDebit ? 'debit' : 'credit');

        if (txType === 'credit' || txType === 'deposit' || amount > 0) {
            typeLabel = 'Dep';
            typeBg = '#dcfce7';
            typeColor = '#16a34a';
        } else if (checkNum) {
            typeLabel = 'Check';
            typeBg = '#ede9fe';
            typeColor = '#7c3aed';
        } else {
            typeLabel = 'Payout';
            typeBg = '#fef3c7';
            typeColor = '#d97706';
        }

        // Status badge
        let statusText, statusBg, statusColor;
        const status = tx.status || 'pending';
        if (status === 'cleared' || status === 'reconciled') {
            statusText = 'Clr';
            statusBg = '#dcfce7';
            statusColor = '#16a34a';
        } else if (status === 'printed') {
            statusText = 'Prt';
            statusBg = '#dbeafe';
            statusColor = '#2563eb';
        } else {
            statusText = 'Pend';
            statusBg = '#fef3c7';
            statusColor = '#d97706';
        }

        return `
            <div class="cost-tx-row ${isSelected ? 'selected' : ''}" data-tx-id="${tx.id}" data-index="${index}"
                 style="display: grid; grid-template-columns: 36px 85px 70px 130px 60px 1fr 90px 90px 60px; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; align-items: center; ${isSelected ? 'background: #ecfdf5;' : ''}"
                 onmouseover="if(!this.classList.contains('selected')) this.style.background='#f8fafc'"
                 onmouseout="if(!this.classList.contains('selected')) this.style.background=''">
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" class="cost-tx-checkbox" data-tx-id="${tx.id}"
                           ${isSelected ? 'checked' : ''}
                           onclick="toggleCostTxSelection(${tx.id}, event)"
                           style="width: 16px; height: 16px; cursor: pointer; accent-color: #059669;">
                </div>
                <div style="font-size: 13px; color: #64748b;">${formatDate(tx.transaction_date)}</div>
                <div style="font-size: 12px; font-weight: 500; color: ${checkNum ? '#7c3aed' : '#cbd5e1'};">${checkNum || '-'}</div>
                <div style="font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(payee)}">${escapeHtml(payee) || '-'}</div>
                <div>
                    <span style="display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: 600; border-radius: 4px; background: ${typeBg}; color: ${typeColor};">
                        ${typeLabel}
                    </span>
                </div>
                <div style="font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${description}</div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isDebit ? '#ef4444' : '#10b981'};">
                    ${isDebit ? '-' : '+'}${formatCurrency(displayAmount)}
                </div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${balance >= 0 ? '#1e293b' : '#ef4444'};">
                    ${formatCurrency(balance)}
                </div>
                <div style="text-align: center;">
                    <span style="display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: 600; border-radius: 4px; background: ${statusBg}; color: ${statusColor};">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function filterCostTransactions(searchTerm) {
    costState.txSearchTerm = searchTerm.toLowerCase();
    renderCostTransactionList();
}

function clearCostTxSearch() {
    const input = document.getElementById('cost-tx-search');
    if (input) input.value = '';
    costState.txSearchTerm = '';
    renderCostTransactionList();
}

// =====================================================
// TRANSACTION SELECTION
// =====================================================

function toggleCostTxSelection(txId, event) {
    if (event) event.stopPropagation();

    const checkbox = document.querySelector(`.cost-tx-checkbox[data-tx-id="${txId}"]`);
    const isNowChecked = checkbox ? checkbox.checked : !costState.selectedTxIds.has(txId);

    if (isNowChecked) {
        costState.selectedTxIds.add(txId);
    } else {
        costState.selectedTxIds.delete(txId);
    }

    // Update UI
    const row = document.querySelector(`.cost-tx-row[data-tx-id="${txId}"]`);
    if (row) {
        row.classList.toggle('selected', isNowChecked);
        row.style.background = isNowChecked ? '#ecfdf5' : '';
    }

    updateCostBulkActions();
}

function toggleSelectAllCostTx(checked) {
    const transactions = costState.filteredTransactions || [];

    if (checked) {
        transactions.forEach(tx => costState.selectedTxIds.add(tx.id));
    } else {
        costState.selectedTxIds.clear();
    }

    // Update all checkboxes
    document.querySelectorAll('.cost-tx-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    document.querySelectorAll('.cost-tx-row').forEach(row => {
        row.classList.toggle('selected', checked);
        row.style.background = checked ? '#ecfdf5' : '';
    });

    updateCostBulkActions();
}

function updateCostBulkActions() {
    const bulkBar = document.getElementById('cost-bulk-actions');
    const countEl = document.getElementById('cost-selected-count');
    const editBtn = document.getElementById('cost-edit-btn');
    const clearBtn = document.getElementById('cost-clear-status-btn');
    const selectedCount = costState.selectedTxIds.size;

    if (!bulkBar) return;

    if (selectedCount === 0) {
        bulkBar.style.display = 'none';
    } else {
        bulkBar.style.display = 'block';
        if (countEl) countEl.textContent = `${selectedCount} selected`;
        if (editBtn) {
            editBtn.style.display = selectedCount === 1 ? 'inline-block' : 'none';
        }
        // Show Clear button if any selected transactions are not cleared
        if (clearBtn) {
            const selectedTxs = costState.filteredTransactions.filter(tx => costState.selectedTxIds.has(tx.id));
            const hasNonCleared = selectedTxs.some(tx => tx.status !== 'cleared' && tx.status !== 'reconciled');
            clearBtn.style.display = hasNonCleared ? 'inline-block' : 'none';
        }
    }
}

// =====================================================
// TRANSACTION MODAL
// =====================================================

function openCostTransactionModal(type = 'deposit') {
    // Check if client is pre-selected from sidebar
    let client = null;
    let clientDisplay = 'Select client...';
    let clientId = '';

    if (costState.selectedClientId && costState.selectedClientId !== 'all') {
        client = costState.clients.find(c => c.id == costState.selectedClientId);
        if (client) {
            clientDisplay = client.client_name;
            clientId = client.id;
        }
    }

    let modal = document.getElementById('cost-transaction-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-transaction-modal';

    const today = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostTransactionModal()">
            <div style="width: 650px; max-width: 95%; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">New Transaction</h3>
                </div>
                <div style="padding: 20px;">
                    <!-- Transaction Type Tabs -->
                    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                        <button type="button" id="cost-tx-tab-deposit" onclick="switchCostTxTab('deposit')" style="flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; background: #059669; color: white;">
                            Deposit
                        </button>
                        <button type="button" id="cost-tx-tab-payout" onclick="switchCostTxTab('payout')" style="flex: 1; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; background: white; color: #64748b;">
                            Payout
                        </button>
                    </div>

                    <form id="cost-transaction-form" onsubmit="submitCostTransaction(event)">
                        <input type="hidden" id="cost-tx-type" value="deposit">

                        <!-- Client and Check # row -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Client *</label>
                                <div id="cost-tx-client-container" style="position: relative;">
                                    <input type="text" id="cost-tx-client-search" placeholder="Search client..." autocomplete="off"
                                           value="${client ? escapeHtml(client.client_name) : ''}"
                                           oninput="costSearchClients(this.value, 'tx')" onfocus="costShowClientDropdown('tx')"
                                           style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                                    <input type="hidden" id="cost-tx-client" value="${clientId}" required>
                                    <div id="cost-tx-client-dropdown" class="cost-tx-client-dropdown" style="display: none;"></div>
                                </div>
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Check #</label>
                                <input type="text" id="cost-tx-reference" placeholder="Optional"
                                       style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                                <input type="date" id="cost-tx-date" value="${today}" required
                                       style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                                <input type="number" id="cost-tx-amount" step="0.01" min="0.01" required placeholder="0.00"
                                       style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            </div>
                        </div>

                        <div id="cost-tx-payee-row" style="display: none; margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Payee *</label>
                            <div id="cost-tx-payee-container" style="position: relative;">
                                <input type="text" id="cost-tx-payee" placeholder="Search payee..." autocomplete="off"
                                       oninput="costSearchVendors(this.value, 'tx')" onfocus="costShowVendorDropdown('tx')"
                                       style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                                <input type="hidden" id="cost-tx-vendor">
                                <div id="cost-tx-vendor-dropdown" class="cost-tx-client-dropdown" style="display: none;"></div>
                            </div>
                        </div>

                        <div id="cost-tx-payment-category-row" style="display: none; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div id="cost-tx-payment-type-row">
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Payment Type</label>
                                <select id="cost-tx-payment-type" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white;">
                                    <option value="check">Check</option>
                                    <option value="credit_card">Credit Card</option>
                                </select>
                            </div>
                            <div id="cost-tx-category-row">
                                <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Category</label>
                                <div style="display: flex; gap: 8px;">
                                    <select id="cost-tx-category" style="flex: 1; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white;">
                                        <option value="">-- Select --</option>
                                        ${getCostCategoryOptions()}
                                    </select>
                                    <button type="button" onclick="costOpenAddCategoryModal('tx')" style="padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; color: #6366f1; font-size: 14px; cursor: pointer; white-space: nowrap;">+</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                            <input type="text" id="cost-tx-description" placeholder="e.g., Retainer deposit"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </form>
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeCostTransactionModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="document.getElementById('cost-transaction-form').dispatchEvent(new Event('submit', {cancelable: true}))" id="cost-tx-submit-btn" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">Record Deposit</button>
                </div>
            </div>
        </div>
        <style>
            .cost-tx-client-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                max-height: 250px;
                overflow-y: auto;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 100000;
                margin-top: 4px;
            }
            .cost-tx-client-dropdown .cost-client-dropdown-item {
                padding: 10px 12px;
                cursor: pointer;
                border-bottom: 1px solid #f1f5f9;
            }
            .cost-tx-client-dropdown .cost-client-dropdown-item:hover {
                background: #f8fafc;
            }
            .cost-tx-client-dropdown .cost-client-dropdown-item.create-new {
                background: #f0fdf4;
                color: #166534;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .cost-tx-client-dropdown .cost-client-dropdown-item.create-new:hover {
                background: #dcfce7;
            }
        </style>
    `;

    document.body.appendChild(modal);

    // Add click outside listener to close dropdowns
    setTimeout(() => {
        document.addEventListener('click', costCloseTxDropdownOnClickOutside);
    }, 100);
}

// Close dropdowns when clicking outside (for transaction modal)
function costCloseTxDropdownOnClickOutside(e) {
    const clientDropdown = document.getElementById('cost-tx-client-dropdown');
    const clientContainer = document.getElementById('cost-tx-client-container');
    const vendorDropdown = document.getElementById('cost-tx-vendor-dropdown');
    const vendorContainer = document.getElementById('cost-tx-payee-container');

    if (clientDropdown && clientContainer && !clientContainer.contains(e.target)) {
        clientDropdown.style.display = 'none';
    }
    if (vendorDropdown && vendorContainer && !vendorContainer.contains(e.target)) {
        vendorDropdown.style.display = 'none';
    }
}

function closeCostTransactionModal() {
    const modal = document.getElementById('cost-transaction-modal');
    if (modal) modal.remove();
    document.removeEventListener('click', costCloseTxDropdownOnClickOutside);
}

function switchCostTxTab(type) {
    const typeInput = document.getElementById('cost-tx-type');
    const depositTab = document.getElementById('cost-tx-tab-deposit');
    const payoutTab = document.getElementById('cost-tx-tab-payout');
    const payeeRow = document.getElementById('cost-tx-payee-row');
    const paymentCategoryRow = document.getElementById('cost-tx-payment-category-row');
    const submitBtn = document.getElementById('cost-tx-submit-btn');

    if (typeInput) typeInput.value = type;

    if (type === 'deposit') {
        depositTab.style.background = '#059669';
        depositTab.style.color = 'white';
        depositTab.style.border = 'none';
        payoutTab.style.background = 'white';
        payoutTab.style.color = '#64748b';
        payoutTab.style.border = '1px solid #e2e8f0';
        if (payeeRow) payeeRow.style.display = 'none';
        if (paymentCategoryRow) paymentCategoryRow.style.display = 'none';
        if (submitBtn) {
            submitBtn.textContent = 'Record Deposit';
            submitBtn.style.background = '#059669';
        }
    } else {
        payoutTab.style.background = '#dc2626';
        payoutTab.style.color = 'white';
        payoutTab.style.border = 'none';
        depositTab.style.background = 'white';
        depositTab.style.color = '#64748b';
        depositTab.style.border = '1px solid #e2e8f0';
        if (payeeRow) payeeRow.style.display = 'block';
        if (paymentCategoryRow) paymentCategoryRow.style.display = 'grid';
        if (submitBtn) {
            submitBtn.textContent = 'Record Payout';
            submitBtn.style.background = '#dc2626';
        }
    }
}

async function submitCostTransaction(event) {
    event.preventDefault();

    const type = document.getElementById('cost-tx-type').value;
    const clientId = document.getElementById('cost-tx-client').value;
    const date = document.getElementById('cost-tx-date').value;
    const amount = parseFloat(document.getElementById('cost-tx-amount').value);
    const payee = document.getElementById('cost-tx-payee').value;
    const paymentType = document.getElementById('cost-tx-payment-type')?.value || 'check';
    const description = document.getElementById('cost-tx-description').value;
    const reference = document.getElementById('cost-tx-reference').value;
    const category = document.getElementById('cost-tx-category')?.value || null;

    if (!clientId) {
        showToast('Please select a client', 'warning');
        return;
    }

    if (!date || !amount) {
        showToast('Please fill in required fields', 'warning');
        return;
    }

    if (type === 'payout' && !payee) {
        showToast('Please enter a payee for payout', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    // For payouts, use the selected payment type; for deposits, always 'deposit'
    const transactionType = type === 'deposit' ? 'deposit' : (paymentType === 'credit_card' ? 'credit_card' : 'disbursement');

    const data = {
        user_id: userId,
        client_id: clientId,
        transaction_type: transactionType,
        payment_method: type === 'deposit' ? 'deposit' : paymentType,
        transaction_date: date,
        amount: type === 'deposit' ? amount : -Math.abs(amount),
        payee: payee || null,
        description: description || (type === 'deposit' ? 'Deposit' : 'Payout'),
        reference_number: reference || null,
        category: category
    };

    try {
        const result = await apiPost('/cost/transactions.php', data);
        if (result.success) {
            showToast(type === 'deposit' ? 'Deposit recorded successfully' : 'Payout recorded successfully', 'success');
            closeCostTransactionModal();
            await loadCostClientLedgerPage();
        } else {
            showToast(result.message || 'Error recording transaction', 'error');
        }
    } catch (error) {
        console.error('Error recording transaction:', error);
        showToast('Error recording transaction', 'error');
    }
}

// =====================================================
// BULK ACTIONS
// =====================================================

async function deleteSelectedCostTx() {
    if (costState.selectedTxIds.size === 0) {
        showToast('Please select transactions to delete', 'warning');
        return;
    }

    if (!confirm(`Delete ${costState.selectedTxIds.size} transaction(s)?`)) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costState.selectedTxIds);

    try {
        let successCount = 0;
        for (const id of ids) {
            const result = await apiDelete('/cost/transactions.php', { id, user_id: userId });
            if (result.success) successCount++;
        }

        showToast(`Deleted ${successCount} transaction(s)`, 'success');
        costState.selectedTxIds.clear();
        await loadCostClientLedgerPage();
    } catch (error) {
        console.error('Error deleting transactions:', error);
        showToast('Error deleting transactions', 'error');
    }
}

function openCostMoveModal() {
    if (costState.selectedTxIds.size === 0) {
        showToast('Please select transactions to move', 'warning');
        return;
    }

    const clients = costState.clients || [];

    let modal = document.getElementById('cost-move-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-move-modal';

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostMoveModal()">
            <div style="width: 500px; max-width: 95%; max-height: 80vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">Move ${costState.selectedTxIds.size} Transaction(s) to Client</h3>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <input type="text" id="move-client-search" placeholder="Search clients..."
                               oninput="filterCostMoveClientList(this.value)"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div id="move-client-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        ${clients.map(c => `
                            <div class="move-client-option" onclick="selectCostMoveClient(${c.id})"
                                 data-client-id="${c.id}"
                                 style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
                                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                                <div>
                                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(c.client_name)}</div>
                                    <div style="font-size: 12px; color: #64748b;">${c.case_number || c.client_number || ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeCostMoveModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeCostMoveModal() {
    const modal = document.getElementById('cost-move-modal');
    if (modal) modal.remove();
}

function filterCostMoveClientList(searchTerm) {
    const clients = costState.clients || [];
    const filtered = clients.filter(c =>
        c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.case_number && c.case_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.client_number && c.client_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const container = document.getElementById('move-client-list');
    if (!container) return;

    container.innerHTML = filtered.map(c => `
        <div class="move-client-option" onclick="selectCostMoveClient(${c.id})"
             data-client-id="${c.id}"
             style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <div>
                <div style="font-weight: 500; color: #1e293b;">${escapeHtml(c.client_name)}</div>
                <div style="font-size: 12px; color: #64748b;">${c.case_number || c.client_number || ''}</div>
            </div>
        </div>
    `).join('');
}

async function selectCostMoveClient(targetClientId) {
    if (costState.selectedTxIds.size === 0) return;

    if (!confirm(`Move ${costState.selectedTxIds.size} transaction(s) to this client?`)) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costState.selectedTxIds);

    try {
        let successCount = 0;
        for (const id of ids) {
            const result = await apiPut('/cost/transactions.php', {
                id,
                user_id: userId,
                client_id: targetClientId
            });
            if (result.success) successCount++;
        }

        showToast(`Moved ${successCount} transaction(s) successfully`, 'success');
        closeCostMoveModal();
        costState.selectedTxIds.clear();
        await loadCostClientLedgerPage();
    } catch (error) {
        console.error('Error moving transactions:', error);
        showToast('Error moving transactions', 'error');
    }
}

function editSelectedCostTx() {
    if (costState.selectedTxIds.size !== 1) {
        showToast('Please select exactly one transaction to edit', 'warning');
        return;
    }

    const txId = Array.from(costState.selectedTxIds)[0];
    const tx = costState.allTransactions.find(t => t.id == txId);

    if (!tx) {
        showToast('Transaction not found', 'error');
        return;
    }

    openCostEditTransactionModal(tx);
}

// Open Edit Transaction Modal
function openCostEditTransactionModal(tx) {
    let modal = document.getElementById('cost-edit-tx-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-edit-tx-modal';

    const isDeposit = parseFloat(tx.amount) > 0;
    const absAmount = Math.abs(parseFloat(tx.amount)).toFixed(2);

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostEditTxModal()">
            <div style="width: 650px; max-width: 95%; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 24px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
                    <h3 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Edit Transaction</h3>
                </div>
                <div style="padding: 28px;">
                    <form id="cost-edit-tx-form" onsubmit="submitCostEditTx(event)">
                        <input type="hidden" id="cost-edit-tx-id" value="${tx.id}">

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Client</label>
                                <div style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; background: #f8fafc; color: #1e293b; font-weight: 500;">
                                    ${escapeHtml(tx.client_name || 'N/A')}
                                </div>
                            </div>
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Type</label>
                                <select id="cost-edit-tx-type" style="width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box; background: white;">
                                    <option value="payout" ${!isDeposit ? 'selected' : ''}>Payout</option>
                                    <option value="deposit" ${isDeposit ? 'selected' : ''}>Deposit</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Date *</label>
                                <input type="date" id="cost-edit-tx-date" value="${tx.transaction_date}" required
                                       style="width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Amount *</label>
                                <input type="number" id="cost-edit-tx-amount" value="${absAmount}" step="0.01" min="0.01" required
                                       style="width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Reference / Check #</label>
                                <input type="text" id="cost-edit-tx-reference" value="${escapeHtml(tx.reference_number || tx.check_number || '')}"
                                       style="width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Category</label>
                                <div style="display: flex; gap: 10px;">
                                    <select id="cost-edit-tx-category" style="flex: 1; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box; background: white;">
                                        <option value="">-- Select --</option>
                                        ${getCostCategoryOptions()}
                                    </select>
                                    <button type="button" onclick="costOpenAddCategoryModal('edit')" style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: white; color: #6366f1; font-size: 15px; cursor: pointer; font-weight: 600;">+</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px;">Description</label>
                            <input type="text" id="cost-edit-tx-description" value="${escapeHtml(tx.description || '')}"
                                   style="width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                        </div>
                    </form>
                </div>
                <div style="padding: 20px 28px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 14px; background: #f8fafc;">
                    <button onclick="closeCostEditTxModal()" style="padding: 12px 24px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; cursor: pointer; font-weight: 500;">Cancel</button>
                    <button onclick="document.getElementById('cost-edit-tx-form').dispatchEvent(new Event('submit', {cancelable: true}))" style="padding: 12px 24px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">Save Changes</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Set category value after modal is added
    setTimeout(() => {
        const categorySelect = document.getElementById('cost-edit-tx-category');
        if (categorySelect && tx.category) {
            categorySelect.value = tx.category;
        }
    }, 50);
}

function closeCostEditTxModal() {
    const modal = document.getElementById('cost-edit-tx-modal');
    if (modal) modal.remove();
}

async function submitCostEditTx(event) {
    event.preventDefault();

    const txId = document.getElementById('cost-edit-tx-id').value;
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const txType = document.getElementById('cost-edit-tx-type').value;
    let amount = parseFloat(document.getElementById('cost-edit-tx-amount').value);

    // Apply sign based on type: payout = negative, deposit = positive
    if (txType === 'payout') {
        amount = -Math.abs(amount);
    } else {
        amount = Math.abs(amount);
    }

    const data = {
        id: txId,
        user_id: userId,
        transaction_date: document.getElementById('cost-edit-tx-date').value,
        amount: amount,
        description: document.getElementById('cost-edit-tx-description').value,
        reference_number: document.getElementById('cost-edit-tx-reference').value || null,
        category: document.getElementById('cost-edit-tx-category').value || null
    };

    try {
        const result = await apiPut('/cost/transactions.php', data);
        if (result.success) {
            showToast('Transaction updated successfully', 'success');
            closeCostEditTxModal();
            costState.selectedTxIds.clear();
            await loadCostClientLedgerPage();
        } else {
            showToast(result.message || 'Error updating transaction', 'error');
        }
    } catch (error) {
        console.error('Error updating transaction:', error);
        showToast('Error updating transaction', 'error');
    }
}

// =====================================================
// CLIENT MODAL (Shared with trust)
// =====================================================

function openCostClientModal(client) {
    // Use existing trust client modal if available
    if (typeof openClientModal === 'function') {
        openClientModal(client);
    } else {
        showToast('Client modal not available', 'error');
    }
}

// =====================================================
// CHECK STATUS MODAL (IOLTA Style)
// =====================================================

// Check status modal state
const costCheckStatusModalState = {
    currentTab: 'pending',
    checks: [],
    filteredChecks: [],
    selectedIds: new Set(),
    searchQuery: ''
};

async function openCostCheckStatusModal(tab = 'pending') {
    costCheckStatusModalState.currentTab = tab;
    costCheckStatusModalState.selectedIds.clear();
    costCheckStatusModalState.searchQuery = '';

    // Load checks from cost transactions
    await loadCostChecks();

    let modal = document.getElementById('cost-check-status-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-check-status-modal';

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostCheckStatusModal()">
            <div style="width: 800px; max-width: 95%; max-height: 85vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: white; font-size: 18px;">Check Status</h3>
                        <button onclick="closeCostCheckStatusModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 18px;">&#215;</button>
                    </div>
                </div>

                <!-- Tabs -->
                <div style="display: flex; border-bottom: 1px solid #e2e8f0;">
                    <button onclick="switchCostCheckStatusTab('pending')" id="cost-check-tab-pending"
                            style="flex: 1; padding: 12px; border: none; background: ${tab === 'pending' ? '#fff7ed' : 'white'}; cursor: pointer; font-size: 13px; font-weight: 500; color: ${tab === 'pending' ? '#ea580c' : '#64748b'}; border-bottom: 2px solid ${tab === 'pending' ? '#ea580c' : 'transparent'};">
                        Pending <span id="cost-check-pending-badge" style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px; margin-left: 4px;">0</span>
                    </button>
                    <button onclick="switchCostCheckStatusTab('printed')" id="cost-check-tab-printed"
                            style="flex: 1; padding: 12px; border: none; background: ${tab === 'printed' ? '#eff6ff' : 'white'}; cursor: pointer; font-size: 13px; font-weight: 500; color: ${tab === 'printed' ? '#2563eb' : '#64748b'}; border-bottom: 2px solid ${tab === 'printed' ? '#2563eb' : 'transparent'};">
                        Printed <span id="cost-check-printed-badge" style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px; margin-left: 4px;">0</span>
                    </button>
                    <button onclick="switchCostCheckStatusTab('cleared')" id="cost-check-tab-cleared"
                            style="flex: 1; padding: 12px; border: none; background: ${tab === 'cleared' ? '#f0fdf4' : 'white'}; cursor: pointer; font-size: 13px; font-weight: 500; color: ${tab === 'cleared' ? '#16a34a' : '#64748b'}; border-bottom: 2px solid ${tab === 'cleared' ? '#16a34a' : 'transparent'};">
                        Cleared <span id="cost-check-cleared-badge" style="background: #22c55e; color: white; padding: 2px 6px; border-radius: 10px; font-size: 11px; margin-left: 4px;">0</span>
                    </button>
                </div>

                <!-- Search -->
                <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
                    <input type="text" id="cost-check-search" placeholder="Search by check #, client, or payee..."
                           oninput="filterCostCheckStatusList(this.value)"
                           style="width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                </div>

                <!-- Check List -->
                <div id="cost-check-status-list" style="flex: 1; overflow-y: auto; min-height: 300px;">
                    <!-- Populated dynamically -->
                </div>

                <!-- Footer Actions -->
                <div id="cost-check-status-footer" style="padding: 16px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: none;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span id="cost-check-selection-count" style="font-size: 13px; color: #64748b;">0 selected</span>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="printSelectedCostChecks()" id="cost-print-selected-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; display: none;">
                                Print Selected
                            </button>
                            <button onclick="markSelectedCostChecksCleared()" id="cost-clear-selected-btn" style="padding: 8px 16px; background: #22c55e; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; display: none;">
                                Mark Cleared
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    renderCostCheckStatusList();
    updateCostCheckStatusCounts();
}

function closeCostCheckStatusModal() {
    const modal = document.getElementById('cost-check-status-modal');
    if (modal) modal.remove();
}

async function loadCostChecks() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get all check transactions (those with reference_number that look like check numbers)
    const allTx = costState.allTransactions || [];

    // Filter to get only checks (disbursements with reference numbers)
    costCheckStatusModalState.checks = allTx.filter(tx => {
        const amount = parseFloat(tx.amount || 0);
        const hasCheckNumber = tx.reference_number || tx.check_number;
        return amount < 0 && hasCheckNumber;
    }).map(tx => {
        // Get client info
        const client = costState.clients.find(c => c.id == tx.client_id);
        return {
            ...tx,
            client_name: client ? client.client_name : 'Unknown',
            check_number: tx.reference_number || tx.check_number,
            payee: tx.vendor_name || tx.payee || tx.description
        };
    });

    costCheckStatusModalState.filteredChecks = [...costCheckStatusModalState.checks];
}

function switchCostCheckStatusTab(tab) {
    costCheckStatusModalState.currentTab = tab;
    costCheckStatusModalState.selectedIds.clear();

    // Update tab styles
    ['pending', 'printed', 'cleared'].forEach(t => {
        const tabBtn = document.getElementById(`cost-check-tab-${t}`);
        if (tabBtn) {
            const isActive = t === tab;
            const colors = {
                pending: { bg: '#fff7ed', color: '#ea580c', border: '#ea580c' },
                printed: { bg: '#eff6ff', color: '#2563eb', border: '#2563eb' },
                cleared: { bg: '#f0fdf4', color: '#16a34a', border: '#16a34a' }
            };
            tabBtn.style.background = isActive ? colors[t].bg : 'white';
            tabBtn.style.color = isActive ? colors[t].color : '#64748b';
            tabBtn.style.borderBottom = `2px solid ${isActive ? colors[t].border : 'transparent'}`;
        }
    });

    renderCostCheckStatusList();
}

function filterCostCheckStatusList(query) {
    costCheckStatusModalState.searchQuery = query.toLowerCase().trim();

    if (!costCheckStatusModalState.searchQuery) {
        costCheckStatusModalState.filteredChecks = [...costCheckStatusModalState.checks];
    } else {
        costCheckStatusModalState.filteredChecks = costCheckStatusModalState.checks.filter(check => {
            const checkNumber = (check.check_number || '').toLowerCase();
            const clientName = (check.client_name || '').toLowerCase();
            const payee = (check.payee || '').toLowerCase();
            return checkNumber.includes(costCheckStatusModalState.searchQuery) ||
                   clientName.includes(costCheckStatusModalState.searchQuery) ||
                   payee.includes(costCheckStatusModalState.searchQuery);
        });
    }

    renderCostCheckStatusList();
}

function renderCostCheckStatusList() {
    const container = document.getElementById('cost-check-status-list');
    if (!container) return;

    const status = costCheckStatusModalState.currentTab;

    // Filter by status
    let checks = costCheckStatusModalState.filteredChecks.filter(check => {
        const checkStatus = check.status || 'pending';
        if (status === 'pending') return checkStatus === 'pending' || checkStatus === 'posted';
        if (status === 'printed') return checkStatus === 'printed';
        if (status === 'cleared') return checkStatus === 'cleared' || checkStatus === 'reconciled';
        return true;
    });

    if (checks.length === 0) {
        const emptyMsgs = {
            pending: { icon: '&#9989;', title: 'No pending checks', sub: 'All checks have been printed' },
            printed: { icon: '&#128237;', title: 'No printed checks', sub: 'Printed checks will appear here' },
            cleared: { icon: '&#128203;', title: 'No cleared checks', sub: 'Cleared checks will appear here' }
        };
        const msg = costCheckStatusModalState.searchQuery ?
            { icon: '&#128269;', title: 'No checks found', sub: 'Try a different search term' } : emptyMsgs[status];
        container.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">${msg.icon}</div>
                <p style="font-size: 15px; margin: 0;">${msg.title}</p>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">${msg.sub}</p>
            </div>`;
        return;
    }

    const showCheckbox = status !== 'cleared';
    const colorMap = {
        pending: { c: '#f59e0b', h: '#fef3c7', s: '#fde68a' },
        printed: { c: '#3b82f6', h: '#eff6ff', s: '#dbeafe' },
        cleared: { c: '#22c55e', h: '#f0fdf4', s: '#dcfce7' }
    };
    const colors = colorMap[status];

    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    ${showCheckbox ? '<th style="padding: 12px 8px; width: 40px;"></th>' : ''}
                    <th style="padding: 12px 8px; text-align: left;">Check #</th>
                    <th style="padding: 12px 8px; text-align: left;">Date</th>
                    <th style="padding: 12px 8px; text-align: left;">Client</th>
                    <th style="padding: 12px 8px; text-align: left;">Payee</th>
                    <th style="padding: 12px 8px; text-align: right;">Amount</th>
                </tr>
            </thead>
            <tbody>`;

    checks.forEach(check => {
        const date = new Date(check.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const checkNum = check.check_number || '-';
        const payeeName = check.payee || '-';
        const clientName = check.client_name || '-';

        html += `
            <tr class="cost-check-status-row" data-id="${check.id}"
                style="border-bottom: 1px solid #f1f5f9; cursor: ${showCheckbox ? 'pointer' : 'default'};"
                onmouseover="this.style.background='${colors.h}'"
                onmouseout="this.style.background=this.classList.contains('selected') ? '${colors.s}' : 'transparent'">`;

        if (showCheckbox) {
            html += `
                <td style="padding: 12px 8px;">
                    <input type="checkbox" class="cost-check-status-checkbox"
                           data-id="${check.id}"
                           onclick="handleCostCheckStatusCheckboxClick(this, event)"
                           style="width: 16px; height: 16px; cursor: pointer;">
                </td>`;
        }

        html += `
                <td style="padding: 12px 8px; font-weight: 600; color: ${colors.c};">${checkNum}</td>
                <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                <td style="padding: 12px 8px;">${clientName}</td>
                <td style="padding: 12px 8px;">${payeeName}</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
            </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Restore selected state
    costCheckStatusModalState.selectedIds.forEach(id => {
        const cb = container.querySelector(`.cost-check-status-checkbox[data-id="${id}"]`);
        if (cb) {
            cb.checked = true;
            const row = cb.closest('tr');
            if (row) row.classList.add('selected');
        }
    });

    updateCostCheckStatusSelection();
}

function handleCostCheckStatusCheckboxClick(checkbox, event) {
    event.stopPropagation();
    const id = parseInt(checkbox.dataset.id);

    if (checkbox.checked) {
        costCheckStatusModalState.selectedIds.add(id);
    } else {
        costCheckStatusModalState.selectedIds.delete(id);
    }

    const row = checkbox.closest('tr');
    if (row) {
        row.classList.toggle('selected', checkbox.checked);
    }

    updateCostCheckStatusSelection();
}

function updateCostCheckStatusSelection() {
    const footer = document.getElementById('cost-check-status-footer');
    const countEl = document.getElementById('cost-check-selection-count');
    const printBtn = document.getElementById('cost-print-selected-btn');
    const clearBtn = document.getElementById('cost-clear-selected-btn');

    const count = costCheckStatusModalState.selectedIds.size;

    if (footer) {
        footer.style.display = count > 0 ? 'block' : 'none';
    }
    if (countEl) {
        countEl.textContent = `${count} selected`;
    }
    if (printBtn) {
        printBtn.style.display = costCheckStatusModalState.currentTab === 'pending' ? 'inline-block' : 'none';
    }
    if (clearBtn) {
        clearBtn.style.display = costCheckStatusModalState.currentTab === 'printed' ? 'inline-block' : 'none';
    }
}

function updateCostCheckStatusCounts() {
    const allChecks = costCheckStatusModalState.checks;

    const pendingCount = allChecks.filter(c => !c.status || c.status === 'pending' || c.status === 'posted').length;
    const printedCount = allChecks.filter(c => c.status === 'printed').length;
    const clearedCount = allChecks.filter(c => c.status === 'cleared' || c.status === 'reconciled').length;

    // Update badges in modal
    const pendingBadge = document.getElementById('cost-check-pending-badge');
    const printedBadge = document.getElementById('cost-check-printed-badge');
    const clearedBadge = document.getElementById('cost-check-cleared-badge');

    if (pendingBadge) pendingBadge.textContent = pendingCount;
    if (printedBadge) printedBadge.textContent = printedCount;
    if (clearedBadge) clearedBadge.textContent = clearedCount;

    // Update header counts
    const headerPending = document.getElementById('cost-pending-count');
    const headerPrinted = document.getElementById('cost-printed-count');
    const headerCleared = document.getElementById('cost-cleared-count');

    if (headerPending) headerPending.textContent = pendingCount;
    if (headerPrinted) headerPrinted.textContent = printedCount;
    if (headerCleared) headerCleared.textContent = clearedCount;
}

async function printSelectedCostChecks() {
    if (costCheckStatusModalState.selectedIds.size === 0) return;

    // Get selected checks data
    const selectedChecks = costCheckStatusModalState.checks.filter(
        check => costCheckStatusModalState.selectedIds.has(check.id)
    );

    if (selectedChecks.length === 0) {
        showToast('No checks selected', 'warning');
        return;
    }

    // Generate QuickBooks-style check print for all selected checks
    const printWindow = window.open('', '_blank', 'width=900,height=700');

    let checksHtml = '';
    selectedChecks.forEach((check, index) => {
        const amount = Math.abs(parseFloat(check.amount || 0));
        const checkNumber = check.check_number || check.reference_number || '';
        const vendorName = check.vendor_name || check.payee || '';
        const description = check.description || '';
        const clientName = check.client_name || '';
        const date = check.transaction_date || '';

        // Format date
        const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
        const longDate = date ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

        // Convert amount to words
        const amountInWords = numberToWords(amount);

        // Page break between checks (except first)
        const pageBreak = index > 0 ? 'page-break-before: always;' : '';

        checksHtml += `
            <div class="check-page" style="${pageBreak}">
                <!-- Main Check (TOP) -->
                <div class="check">
                    <div class="check-background">CHECK</div>

                    <div class="check-header">
                        <div class="company-info">
                            <div class="company-name">YOUR COMPANY NAME</div>
                            <div>123 Business Street</div>
                            <div>City, State 12345</div>
                        </div>
                        <div class="check-number-section">
                            <div class="check-number">${checkNumber || '______'}</div>
                            <div style="font-size: 10px; margin-top: 5px;">Check Number</div>
                        </div>
                    </div>

                    <div class="check-date-row">
                        <span class="date-label">DATE</span>
                        <span class="date-value">${formattedDate || ''}</span>
                    </div>

                    <div class="pay-to-section">
                        <div class="pay-to-row">
                            <span class="pay-to-label">PAY TO THE<br>ORDER OF</span>
                            <span class="pay-to-value">${vendorName || ''}</span>
                            <span class="amount-box">$${amount.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="amount-words-row">
                        <span class="amount-words">${amountInWords}</span>
                        <span class="dollars-label">DOLLARS</span>
                    </div>

                    <div class="check-footer">
                        <div class="memo-section">
                            <div class="memo-label">MEMO</div>
                            <div class="memo-value">${description || ''}</div>
                        </div>
                        <div class="signature-section">
                            <div class="signature-line"></div>
                            <div class="signature-label">AUTHORIZED SIGNATURE</div>
                        </div>
                    </div>

                    <div class="micr-line">
                        ⑆${checkNumber || '000000'}⑆ ⑈012345678⑈ 9876543210⑆
                    </div>
                </div>

                <div class="perforation"></div>

                <!-- Check Stub (MIDDLE - Keep for records) -->
                <div class="check-stub">
                    <div class="stub-header">
                        <div class="stub-title">CHECK STUB - KEEP FOR YOUR RECORDS</div>
                        <div class="stub-check-info">
                            <div>Check #: <strong>${checkNumber || '____'}</strong></div>
                            <div>Date: <strong>${formattedDate || '____'}</strong></div>
                        </div>
                    </div>
                    <div class="stub-details">
                        <div class="stub-row">
                            <span class="stub-label">Pay To:</span>
                            <span class="stub-value">${vendorName || ''}</span>
                        </div>
                        <div class="stub-row">
                            <span class="stub-label">Client:</span>
                            <span class="stub-value">${clientName || 'N/A'}</span>
                        </div>
                        <div class="stub-row">
                            <span class="stub-label">Account:</span>
                            <span class="stub-value">${check.account_name || 'Cost Account'}</span>
                        </div>
                        <div class="stub-row">
                            <span class="stub-label">Memo:</span>
                            <span class="stub-value">${description || ''}</span>
                        </div>
                    </div>
                    <div class="stub-amount-section">
                        <span class="stub-label">AMOUNT:</span>
                        <span class="stub-amount">$${amount.toFixed(2)}</span>
                    </div>
                </div>

                <div class="perforation"></div>

                <!-- Voucher Stub (BOTTOM - Vendor keeps) -->
                <div class="voucher-stub">
                    <div class="voucher-header">
                        <div class="voucher-title">PAYMENT VOUCHER</div>
                        <div style="text-align: right; font-size: 11px;">
                            <div>Check #: <strong>${checkNumber || '____'}</strong></div>
                            <div>${longDate || ''}</div>
                        </div>
                    </div>
                    <table class="voucher-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Client/Matter</th>
                                <th class="amount-col">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${formattedDate || ''}</td>
                                <td>${description || 'Payment'}</td>
                                <td>${clientName || 'N/A'}</td>
                                <td class="amount-col">$${amount.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="voucher-total">
                        <span class="voucher-total-label">TOTAL PAYMENT:</span>
                        <span class="voucher-total-amount">$${amount.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Checks (${selectedChecks.length})</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                @page {
                    size: 8.5in 11in;
                    margin: 0;
                }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    background: #fff;
                    color: #000;
                }
                .check-page {
                    width: 8.5in;
                    min-height: 11in;
                    padding: 0.25in;
                }

                /* ===== CHECK STUB (Top) ===== */
                .check-stub {
                    border: 1px solid #ccc;
                    padding: 15px 20px;
                    margin-bottom: 10px;
                    background: #fafafa;
                    height: 3in;
                }
                .stub-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 15px;
                    border-bottom: 1px dashed #999;
                    padding-bottom: 10px;
                }
                .stub-title {
                    font-weight: bold;
                    font-size: 14px;
                }
                .stub-check-info {
                    text-align: right;
                    font-size: 12px;
                }
                .stub-details {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    font-size: 11px;
                }
                .stub-row {
                    display: flex;
                    gap: 8px;
                }
                .stub-label {
                    font-weight: bold;
                    min-width: 80px;
                }
                .stub-value {
                    flex: 1;
                }
                .stub-amount-section {
                    margin-top: 15px;
                    padding-top: 10px;
                    border-top: 1px dashed #999;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .stub-amount {
                    font-size: 18px;
                    font-weight: bold;
                }

                /* ===== MAIN CHECK ===== */
                .check {
                    border: 2px solid #1a365d;
                    padding: 20px;
                    background: linear-gradient(135deg, #f0f4f8 0%, #fff 50%, #f0f4f8 100%);
                    position: relative;
                    height: 3.5in;
                }
                .check-background {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 100px;
                    color: rgba(0,0,0,0.03);
                    font-weight: bold;
                    pointer-events: none;
                }
                .check-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 20px;
                }
                .company-info {
                    font-size: 11px;
                    line-height: 1.4;
                }
                .company-name {
                    font-size: 16px;
                    font-weight: bold;
                    color: #1a365d;
                    margin-bottom: 5px;
                }
                .check-number-section {
                    text-align: right;
                }
                .check-number {
                    font-size: 18px;
                    font-weight: bold;
                    color: #1a365d;
                }
                .check-date-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 15px;
                }
                .date-label {
                    font-size: 11px;
                    margin-right: 10px;
                }
                .date-value {
                    font-size: 14px;
                    font-weight: bold;
                    border-bottom: 1px solid #000;
                    min-width: 150px;
                    text-align: center;
                }

                /* Pay To Section */
                .pay-to-section {
                    margin-bottom: 15px;
                }
                .pay-to-row {
                    display: flex;
                    align-items: baseline;
                    margin-bottom: 8px;
                }
                .pay-to-label {
                    font-size: 10px;
                    font-weight: bold;
                    margin-right: 10px;
                    white-space: nowrap;
                }
                .pay-to-value {
                    flex: 1;
                    font-size: 14px;
                    font-weight: bold;
                    border-bottom: 1px solid #000;
                    padding-bottom: 2px;
                    min-height: 20px;
                }
                .amount-box {
                    border: 2px solid #1a365d;
                    padding: 5px 15px;
                    font-size: 16px;
                    font-weight: bold;
                    background: #fff;
                    min-width: 120px;
                    text-align: right;
                }

                /* Amount in Words */
                .amount-words-row {
                    display: flex;
                    align-items: baseline;
                    margin-bottom: 15px;
                }
                .amount-words {
                    flex: 1;
                    font-size: 12px;
                    border-bottom: 1px solid #000;
                    padding-bottom: 2px;
                    text-transform: uppercase;
                }
                .dollars-label {
                    font-size: 11px;
                    margin-left: 10px;
                    font-weight: bold;
                }

                /* Memo & Signature */
                .check-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-top: 20px;
                }
                .memo-section {
                    flex: 1;
                    max-width: 300px;
                }
                .memo-label {
                    font-size: 10px;
                    margin-bottom: 3px;
                }
                .memo-value {
                    font-size: 11px;
                    border-bottom: 1px solid #000;
                    min-height: 18px;
                    padding-bottom: 2px;
                }
                .signature-section {
                    text-align: right;
                    min-width: 250px;
                }
                .signature-line {
                    border-bottom: 1px solid #000;
                    min-height: 30px;
                    margin-bottom: 3px;
                }
                .signature-label {
                    font-size: 10px;
                }

                /* MICR Line */
                .micr-line {
                    margin-top: 15px;
                    padding-top: 10px;
                    font-family: 'MICR', 'Courier New', monospace;
                    font-size: 12px;
                    letter-spacing: 3px;
                    color: #333;
                }

                /* ===== VOUCHER STUB (Bottom) ===== */
                .voucher-stub {
                    border: 1px solid #ccc;
                    padding: 15px 20px;
                    margin-top: 10px;
                    background: #fafafa;
                    height: 3.5in;
                }
                .voucher-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    border-bottom: 2px solid #1a365d;
                    padding-bottom: 10px;
                }
                .voucher-title {
                    font-weight: bold;
                    font-size: 14px;
                    color: #1a365d;
                }
                .voucher-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                .voucher-table th {
                    text-align: left;
                    padding: 8px 5px;
                    border-bottom: 1px solid #999;
                    font-weight: bold;
                    background: #e8e8e8;
                }
                .voucher-table td {
                    padding: 8px 5px;
                    border-bottom: 1px solid #ddd;
                }
                .voucher-table .amount-col {
                    text-align: right;
                    font-weight: bold;
                }
                .voucher-total {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 15px;
                    padding-top: 10px;
                    border-top: 2px solid #1a365d;
                }
                .voucher-total-label {
                    font-weight: bold;
                    margin-right: 30px;
                }
                .voucher-total-amount {
                    font-size: 16px;
                    font-weight: bold;
                    min-width: 100px;
                    text-align: right;
                }

                /* Print styles */
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .check-page { padding: 0; }
                    .no-print { display: none; }
                }

                /* Perforated lines */
                .perforation {
                    border-bottom: 1px dashed #999;
                    margin: 5px 0;
                    position: relative;
                }
                .perforation::before {
                    content: '✂';
                    position: absolute;
                    left: -5px;
                    top: -8px;
                    font-size: 12px;
                    color: #999;
                }
            </style>
        </head>
        <body>
            ${checksHtml}
        </body>
        </html>
    `);

    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = function() {
        printWindow.print();
    };

    showToast(`Printing ${selectedChecks.length} check(s)...`, 'info');

    // Mark as printed in database
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costCheckStatusModalState.selectedIds);

    for (const id of ids) {
        await apiPut('/cost/transactions.php', { id, user_id: userId, status: 'printed' });
    }

    // Clear selection
    costCheckStatusModalState.selectedIds.clear();

    // Refresh data and switch to Printed tab
    await loadCostClientLedgerPage();
    await loadCostChecks();
    costCheckStatusModalState.currentTab = 'printed';
    renderCostCheckStatusList();
    updateCostCheckStatusCounts();

    // Update tab UI
    ['pending', 'printed', 'cleared'].forEach(t => {
        const tabBtn = document.getElementById(`cost-check-tab-${t}`);
        if (tabBtn) {
            const isActive = t === 'printed';
            const colors = {
                pending: { bg: '#fff7ed', color: '#ea580c', border: '#ea580c' },
                printed: { bg: '#eff6ff', color: '#2563eb', border: '#2563eb' },
                cleared: { bg: '#f0fdf4', color: '#16a34a', border: '#16a34a' }
            };
            tabBtn.style.background = isActive ? colors[t].bg : 'white';
            tabBtn.style.color = isActive ? colors[t].color : '#64748b';
            tabBtn.style.borderBottom = `2px solid ${isActive ? colors[t].border : 'transparent'}`;
        }
    });
}

async function markSelectedCostChecksCleared() {
    if (costCheckStatusModalState.selectedIds.size === 0) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costCheckStatusModalState.selectedIds);

    for (const id of ids) {
        await apiPut('/cost/transactions.php', { id, user_id: userId, status: 'cleared' });
    }

    showToast(`Marked ${ids.length} check(s) as cleared`, 'success');

    // Refresh
    await loadCostClientLedgerPage();
    await loadCostChecks();
    switchCostCheckStatusTab('cleared');
    updateCostCheckStatusCounts();
}

// =====================================================
// MARK AS CLEARED (Bulk Action)
// =====================================================

async function markSelectedCostAsCleared() {
    if (costState.selectedTxIds.size === 0) {
        showToast('Please select transactions to clear', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costState.selectedTxIds);

    try {
        let successCount = 0;
        for (const id of ids) {
            const result = await apiPut('/cost/transactions.php', { id, user_id: userId, status: 'cleared' });
            if (result.success) successCount++;
        }

        showToast(`Marked ${successCount} transaction(s) as cleared`, 'success');
        costState.selectedTxIds.clear();
        await loadCostClientLedgerPage();
    } catch (error) {
        console.error('Error clearing transactions:', error);
        showToast('Error clearing transactions', 'error');
    }
}

// =====================================================
// IMPORT CSV FUNCTIONALITY
// =====================================================

async function handleCostCsvImport(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    // Reset file input
    fileInput.value = '';

    // Read and parse CSV
    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvText = e.target.result;
        const lines = csvText.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            showToast('CSV file is empty or has no data rows', 'error');
            return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Find column indices
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo'));
        const checkIdx = headers.findIndex(h => h.includes('check') || h.includes('ref'));

        if (dateIdx === -1 || amountIdx === -1) {
            showToast('CSV must have Date and Amount columns', 'error');
            return;
        }

        // Parse rows
        const transactions = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length > Math.max(dateIdx, amountIdx)) {
                const amount = parseFloat(values[amountIdx].replace(/[$,]/g, '')) || 0;
                if (amount !== 0) {
                    transactions.push({
                        date: values[dateIdx],
                        amount: amount,
                        description: descIdx >= 0 ? values[descIdx] : '',
                        reference: checkIdx >= 0 ? values[checkIdx] : ''
                    });
                }
            }
        }

        if (transactions.length === 0) {
            showToast('No valid transactions found in CSV', 'warning');
            return;
        }

        // Show preview modal
        showCostImportPreview(transactions);
    };

    reader.readAsText(file);
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

function showCostImportPreview(transactions) {
    let modal = document.getElementById('cost-import-preview-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-import-preview-modal';

    const preview = transactions.slice(0, 10);

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostImportPreview()">
            <div style="width: 700px; max-width: 95%; max-height: 85vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">Import Preview</h3>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">${transactions.length} transaction(s) found</p>
                </div>

                <div style="flex: 1; overflow-y: auto; padding: 16px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 10px 8px; text-align: left; border-bottom: 1px solid #e2e8f0;">Date</th>
                                <th style="padding: 10px 8px; text-align: left; border-bottom: 1px solid #e2e8f0;">Description</th>
                                <th style="padding: 10px 8px; text-align: left; border-bottom: 1px solid #e2e8f0;">Ref #</th>
                                <th style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #e2e8f0;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${preview.map(tx => `
                                <tr>
                                    <td style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9;">${tx.date}</td>
                                    <td style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(tx.description).substring(0, 40)}</td>
                                    <td style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9;">${tx.reference || '-'}</td>
                                    <td style="padding: 10px 8px; border-bottom: 1px solid #f1f5f9; text-align: right; color: ${tx.amount < 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">
                                        ${tx.amount < 0 ? '-' : '+'}${formatCurrency(Math.abs(tx.amount))}
                                    </td>
                                </tr>
                            `).join('')}
                            ${transactions.length > 10 ? `
                                <tr>
                                    <td colspan="4" style="padding: 10px 8px; text-align: center; color: #64748b; font-style: italic;">
                                        ... and ${transactions.length - 10} more transactions
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>

                    <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px;">
                        <strong>Note:</strong> Imported transactions will be added as unassigned. You can assign them to clients after import.
                    </div>
                </div>

                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeCostImportPreview()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="confirmCostImport()" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">Import ${transactions.length} Transaction(s)</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Store transactions for confirmation
    window._costImportTransactions = transactions;
}

function closeCostImportPreview() {
    const modal = document.getElementById('cost-import-preview-modal');
    if (modal) modal.remove();
    window._costImportTransactions = null;
}

async function confirmCostImport() {
    const transactions = window._costImportTransactions;
    if (!transactions || transactions.length === 0) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    closeCostImportPreview();
    showToast('Importing transactions...', 'info');

    let successCount = 0;
    for (const tx of transactions) {
        try {
            // Parse date
            const date = new Date(tx.date);
            const dateStr = date.toISOString().split('T')[0];

            const result = await apiPost('/cost/transactions.php', {
                user_id: userId,
                client_id: null, // Unassigned
                transaction_date: dateStr,
                amount: tx.amount,
                description: tx.description,
                reference_number: tx.reference || null,
                transaction_type: tx.amount > 0 ? 'credit' : 'debit',
                status: 'pending'
            });

            if (result.success) successCount++;
        } catch (error) {
            console.error('Error importing transaction:', error);
        }
    }

    showToast(`Imported ${successCount} of ${transactions.length} transactions`, 'success');
    await loadCostClientLedgerPage();
}

// =====================================================
// BATCH DEPOSIT MODAL
// =====================================================

function openCostBatchModal() {
    if (costState.selectedClientId === 'all') {
        showToast('Please select a client first', 'warning');
        return;
    }

    const client = costState.clients.find(c => c.id == costState.selectedClientId);
    if (!client) {
        showToast('Client not found', 'error');
        return;
    }

    let modal = document.getElementById('cost-batch-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-batch-modal';

    const today = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostBatchModal()">
            <div style="width: 600px; max-width: 95%; max-height: 85vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">Batch Deposit</h3>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">${client.client_name}</p>
                </div>

                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Date</label>
                        <input type="date" id="cost-batch-date" value="${today}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Batch Reference</label>
                        <input type="text" id="cost-batch-reference" placeholder="e.g., DEP-001"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <label style="font-size: 13px; font-weight: 500; color: #374151;">Items</label>
                            <button onclick="addCostBatchItem()" style="padding: 4px 12px; background: #059669; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;">+ Add Item</button>
                        </div>
                        <div id="cost-batch-items" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                            <!-- Items added here -->
                        </div>
                    </div>

                    <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; font-weight: 500; color: #047857;">Total</span>
                        <span id="cost-batch-total" style="font-size: 20px; font-weight: 700; color: #047857;">$0.00</span>
                    </div>
                </div>

                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeCostBatchModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="submitCostBatch()" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">Record Batch</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Initialize with one empty item
    window._costBatchItems = [];
    addCostBatchItem();
}

function closeCostBatchModal() {
    const modal = document.getElementById('cost-batch-modal');
    if (modal) modal.remove();
    window._costBatchItems = null;
}

function addCostBatchItem() {
    const container = document.getElementById('cost-batch-items');
    if (!container) return;

    const index = window._costBatchItems.length;
    window._costBatchItems.push({ description: '', amount: 0 });

    const itemHtml = `
        <div class="cost-batch-item" data-index="${index}" style="display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid #f1f5f9;">
            <input type="text" placeholder="Description" onchange="updateCostBatchItem(${index}, 'description', this.value)"
                   style="flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 13px;">
            <input type="number" placeholder="Amount" step="0.01" onchange="updateCostBatchItem(${index}, 'amount', this.value)"
                   style="width: 120px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 13px; text-align: right;">
            <button onclick="removeCostBatchItem(${index})" style="padding: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; cursor: pointer;">&#215;</button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', itemHtml);
}

function updateCostBatchItem(index, field, value) {
    if (window._costBatchItems && window._costBatchItems[index]) {
        window._costBatchItems[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
        updateCostBatchTotal();
    }
}

function removeCostBatchItem(index) {
    const item = document.querySelector(`.cost-batch-item[data-index="${index}"]`);
    if (item) item.remove();
    if (window._costBatchItems) {
        window._costBatchItems[index] = null;
        updateCostBatchTotal();
    }
}

function updateCostBatchTotal() {
    const total = (window._costBatchItems || [])
        .filter(item => item !== null)
        .reduce((sum, item) => sum + (item.amount || 0), 0);

    const totalEl = document.getElementById('cost-batch-total');
    if (totalEl) {
        totalEl.textContent = formatCurrency(total);
    }
}

async function submitCostBatch() {
    const date = document.getElementById('cost-batch-date').value;
    const reference = document.getElementById('cost-batch-reference').value;
    const items = (window._costBatchItems || []).filter(item => item !== null && item.amount > 0);

    if (items.length === 0) {
        showToast('Please add at least one item', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const clientId = costState.selectedClientId;

    closeCostBatchModal();
    showToast('Recording batch deposit...', 'info');

    let successCount = 0;
    for (const item of items) {
        try {
            const result = await apiPost('/cost/transactions.php', {
                user_id: userId,
                client_id: clientId,
                transaction_date: date,
                amount: item.amount,
                description: item.description || 'Batch Deposit',
                reference_number: reference || null,
                transaction_type: 'credit',
                status: 'pending'
            });

            if (result.success) successCount++;
        } catch (error) {
            console.error('Error recording batch item:', error);
        }
    }

    showToast(`Recorded ${successCount} batch item(s)`, 'success');
    await loadCostClientLedgerPage();
}

// =====================================================
// PLACEHOLDER FUNCTIONS
// =====================================================

function printCostClientStatement() {
    showToast('Print feature coming soon', 'info');
}

async function loadCostReconcile() {
    console.log('Cost reconcile page loaded');
}

// =====================================================
// COST DATA MANAGEMENT
// =====================================================

let costDmCurrentTab = 'export';

// Cost DM Activity Log State
if (!window._costDmState) {
    window._costDmState = {
        currentTab: 'export',
        activityLog: []
    };
}
const costDmState = window._costDmState;

async function loadCostDataManagement() {
    // Load accounts for import dropdown
    await loadCostAccountsForImport();
    // Render activity log
    renderCostActivityLog();
    // Populate client dropdowns for export features
    await populateCostDmClientDropdowns();
}

function switchCostDmTab(tab) {
    costDmCurrentTab = tab;
    costDmState.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('#page-cost-data-management .dm-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === `cost-${tab}`);
    });

    // Update tab content
    document.getElementById('cost-export-content')?.classList.toggle('active', tab === 'export');
    document.getElementById('cost-import-content')?.classList.toggle('active', tab === 'import');
    document.getElementById('cost-backup-content')?.classList.toggle('active', tab === 'backup');
    document.getElementById('cost-restore-content')?.classList.toggle('active', tab === 'restore');
}

// Load Cost Accounts for import dropdown
async function loadCostAccountsForImport() {
    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        const response = await apiGet('/cost/accounts.php', { user_id: userId });

        if (response.success && response.data) {
            const accounts = response.data.accounts || [];
            const select = document.getElementById('cost-dm-import-account');
            if (select) {
                select.innerHTML = '<option value="">Select account...</option>';
                accounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = account.account_name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load cost accounts:', error);
    }
}

// File name update functions
function updateCostImportFileName(input) {
    const fileName = input.files[0]?.name || 'No file selected';
    document.getElementById('cost-dm-import-file-name').textContent = fileName;
}

function updateCostRestoreFileName(input) {
    const fileName = input.files[0]?.name || 'No file selected';
    document.getElementById('cost-dm-restore-file-name').textContent = fileName;
}

async function exportCostData() {
    const selected = Array.from(document.querySelectorAll('input[name="cost-dm-export"]:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showToast('Please select at least one data type', 'warning');
        return;
    }

    const loading = document.getElementById('cost-dm-export-loading');
    if (loading) loading.classList.add('active');

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const startDate = document.getElementById('cost-export-start-date')?.value || '';
    const endDate = document.getElementById('cost-export-end-date')?.value || '';

    try {
        // Load data first - use cache
        const clients = await loadCostClients();

        const txResult = await apiGet('/cost/transactions.php', {
            user_id: userId,
            limit: 'all',
            start_date: startDate,
            end_date: endDate
        });
        const transactions = (txResult.success && txResult.data) ? (txResult.data.transactions || []) : [];

        // Calculate balances per client
        const clientBalances = {};
        transactions.forEach(tx => {
            if (tx.client_id) {
                if (!clientBalances[tx.client_id]) {
                    clientBalances[tx.client_id] = { deposits: 0, payouts: 0, count: 0 };
                }
                const amount = parseFloat(tx.amount) || 0;
                if (amount >= 0) {
                    clientBalances[tx.client_id].deposits += amount;
                } else {
                    clientBalances[tx.client_id].payouts += Math.abs(amount);
                }
                clientBalances[tx.client_id].count++;
            }
        });

        // Check if ExcelJS is available
        const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;

        if (Excel) {
            const workbook = new Excel.Workbook();
            workbook.creator = 'Expense Tracker - Cost Account';
            workbook.created = new Date();

            // Export transactions
            if (selected.includes('transactions')) {
                const sheet = workbook.addWorksheet('Transactions');
                sheet.columns = [
                    { header: 'Date', key: 'date', width: 12 },
                    { header: 'Client', key: 'client', width: 25 },
                    { header: 'Case #', key: 'case_number', width: 15 },
                    { header: 'Description', key: 'description', width: 35 },
                    { header: 'Reference', key: 'reference', width: 15 },
                    { header: 'Amount', key: 'amount', width: 12 },
                    { header: 'Status', key: 'status', width: 10 }
                ];

                // Style header
                sheet.getRow(1).font = { bold: true };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
                sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

                transactions.forEach(tx => {
                    const client = clients.find(c => c.id == tx.client_id);
                    sheet.addRow({
                        date: tx.transaction_date,
                        client: client ? client.client_name : 'Unassigned',
                        case_number: client ? (client.case_number || client.client_number || '') : '',
                        description: tx.description || '',
                        reference: tx.reference_number || tx.check_number || '',
                        amount: parseFloat(tx.amount) || 0,
                        status: tx.status || 'pending'
                    });
                });
            }

            // Export clients
            if (selected.includes('clients')) {
                const sheet = workbook.addWorksheet('Clients');
                sheet.columns = [
                    { header: 'Client Name', key: 'name', width: 30 },
                    { header: 'Case #', key: 'case_number', width: 15 },
                    { header: 'Email', key: 'email', width: 25 },
                    { header: 'Phone', key: 'phone', width: 15 },
                    { header: 'Status', key: 'status', width: 10 }
                ];

                sheet.getRow(1).font = { bold: true };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
                sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

                clients.forEach(client => {
                    sheet.addRow({
                        name: client.client_name,
                        case_number: client.case_number || client.client_number || '',
                        email: client.email || '',
                        phone: client.phone || '',
                        status: client.status || 'active'
                    });
                });
            }

            // Export summary
            if (selected.includes('summary')) {
                const sheet = workbook.addWorksheet('Summary');
                sheet.columns = [
                    { header: 'Client Name', key: 'name', width: 30 },
                    { header: 'Case #', key: 'case_number', width: 15 },
                    { header: 'Total Deposits', key: 'deposits', width: 15 },
                    { header: 'Total Payouts', key: 'payouts', width: 15 },
                    { header: 'Balance', key: 'balance', width: 15 },
                    { header: 'Transactions', key: 'count', width: 12 }
                ];

                sheet.getRow(1).font = { bold: true };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
                sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

                clients.forEach(client => {
                    const bal = clientBalances[client.id] || { deposits: 0, payouts: 0, count: 0 };
                    sheet.addRow({
                        name: client.client_name,
                        case_number: client.case_number || client.client_number || '',
                        deposits: bal.deposits,
                        payouts: bal.payouts,
                        balance: bal.deposits - bal.payouts,
                        count: bal.count
                    });
                });
            }

            // Download file
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cost-export-${new Date().toISOString().split('T')[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);

            addCostActivity('export', `Exported ${selected.join(', ')}`, `cost-export.xlsx`);
            showToast('Export completed successfully', 'success');
        } else {
            // Fallback to CSV
            let csvContent = '';

            if (selected.includes('transactions')) {
                csvContent = 'Date,Client,Case #,Description,Reference,Amount,Status\n';
                transactions.forEach(tx => {
                    const client = clients.find(c => c.id == tx.client_id);
                    csvContent += `"${tx.transaction_date}","${client ? client.client_name : 'Unassigned'}","${client ? (client.case_number || '') : ''}","${(tx.description || '').replace(/"/g, '""')}","${tx.reference_number || ''}",${tx.amount || 0},"${tx.status || 'pending'}"\n`;
                });
            }

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cost-transactions-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            addCostActivity('export', `Exported ${selected.join(', ')}`, `cost-transactions.csv`);
            showToast('Export completed (CSV format)', 'success');
        }
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.classList.remove('active');
    }
}

function handleCostFileImport(input) {
    const file = input.files[0];
    if (!file) return;

    input.value = '';

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvText = e.target.result;
        const lines = csvText.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            showToast('File is empty or has no data rows', 'error');
            return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

        // Find column indices
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo'));
        const refIdx = headers.findIndex(h => h.includes('check') || h.includes('ref') || h.includes('number'));

        if (dateIdx === -1 || amountIdx === -1) {
            showToast('CSV must have Date and Amount columns', 'error');
            return;
        }

        // Parse rows
        const transactions = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length > Math.max(dateIdx, amountIdx)) {
                const amount = parseFloat(values[amountIdx].replace(/[$,'"]/g, '')) || 0;
                if (amount !== 0) {
                    transactions.push({
                        date: values[dateIdx].replace(/"/g, ''),
                        amount: amount,
                        description: descIdx >= 0 ? values[descIdx].replace(/"/g, '') : '',
                        reference: refIdx >= 0 ? values[refIdx].replace(/"/g, '') : ''
                    });
                }
            }
        }

        if (transactions.length === 0) {
            showToast('No valid transactions found', 'warning');
            return;
        }

        // Show preview
        showCostImportPreview(transactions);
    };

    reader.readAsText(file);
}

// Import Cost Data (from Import tab)
async function importCostData() {
    const fileInput = document.getElementById('cost-dm-import-file');
    const accountId = document.getElementById('cost-dm-import-account')?.value;
    const format = document.getElementById('cost-dm-import-format')?.value || 'chase';

    if (!fileInput?.files[0]) {
        showToast('Please select a file to import', 'warning');
        return;
    }

    if (!accountId) {
        showToast('Please select an account', 'warning');
        return;
    }

    const loading = document.getElementById('cost-dm-import-loading');
    if (loading) loading.classList.add('active');

    try {
        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const csvText = e.target.result;
                const transactions = parseCostCsvData(csvText, format);

                if (transactions.length === 0) {
                    showToast('No valid transactions found in file', 'warning');
                    if (loading) loading.classList.remove('active');
                    return;
                }

                // Import transactions via API
                const userId = state.currentUser || localStorage.getItem('currentUser');
                let importedCount = 0;

                for (const tx of transactions) {
                    const result = await apiPost('/cost/transactions.php', {
                        user_id: userId,
                        account_id: accountId,
                        transaction_date: tx.date,
                        description: tx.description,
                        amount: tx.amount,
                        reference_number: tx.reference || '',
                        status: 'pending'
                    });
                    if (result.success) importedCount++;
                }

                // Log activity
                addCostActivity('import', `Imported ${importedCount} transactions`, file.name);

                showToast(`Imported ${importedCount} transactions successfully`, 'success');
                fileInput.value = '';
                document.getElementById('cost-dm-import-file-name').textContent = 'No file selected';

            } catch (error) {
                console.error('Import error:', error);
                showToast('Import failed: ' + error.message, 'error');
            } finally {
                if (loading) loading.classList.remove('active');
            }
        };

        reader.readAsText(file);

    } catch (error) {
        console.error('Import error:', error);
        showToast('Import failed: ' + error.message, 'error');
        if (loading) loading.classList.remove('active');
    }
}

// Parse CSV data based on format
function parseCostCsvData(csvText, format) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const transactions = [];

    if (format === 'chase') {
        // Chase format: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
        const headers = lines[0].toLowerCase().split(',');
        const dateIdx = headers.findIndex(h => h.includes('posting') || h.includes('date'));
        const descIdx = headers.findIndex(h => h.includes('description'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));
        const checkIdx = headers.findIndex(h => h.includes('check') || h.includes('slip'));

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length > Math.max(dateIdx, amountIdx)) {
                const amount = parseFloat(values[amountIdx]?.replace(/[$,'"]/g, '')) || 0;
                if (amount !== 0) {
                    transactions.push({
                        date: formatDateForDb(values[dateIdx]?.replace(/"/g, '')),
                        description: values[descIdx]?.replace(/"/g, '') || '',
                        amount: amount,
                        reference: checkIdx >= 0 ? values[checkIdx]?.replace(/"/g, '') : ''
                    });
                }
            }
        }
    } else if (format === 'amex') {
        // AMEX format: Date,Description,Amount
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= 3) {
                const amount = parseFloat(values[2]?.replace(/[$,'"]/g, '')) || 0;
                if (amount !== 0) {
                    transactions.push({
                        date: formatDateForDb(values[0]?.replace(/"/g, '')),
                        description: values[1]?.replace(/"/g, '') || '',
                        amount: -amount, // AMEX shows charges as positive
                        reference: ''
                    });
                }
            }
        }
    } else {
        // Generic: Date, Description, Amount
        const headers = lines[0].toLowerCase().split(',');
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo'));
        const amountIdx = headers.findIndex(h => h.includes('amount'));

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length > Math.max(dateIdx, amountIdx)) {
                const amount = parseFloat(values[amountIdx]?.replace(/[$,'"]/g, '')) || 0;
                if (amount !== 0) {
                    transactions.push({
                        date: formatDateForDb(values[dateIdx]?.replace(/"/g, '')),
                        description: descIdx >= 0 ? values[descIdx]?.replace(/"/g, '') : '',
                        amount: amount,
                        reference: ''
                    });
                }
            }
        }
    }

    return transactions;
}

// Format date for database (YYYY-MM-DD)
function formatDateForDb(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    // Try different date formats
    const formats = [
        /^(\d{4})-(\d{2})-(\d{2})$/,           // YYYY-MM-DD
        /^(\d{2})\/(\d{2})\/(\d{4})$/,          // MM/DD/YYYY
        /^(\d{2})-(\d{2})-(\d{4})$/,            // MM-DD-YYYY
    ];

    for (const fmt of formats) {
        const match = dateStr.match(fmt);
        if (match) {
            if (fmt === formats[0]) {
                return dateStr;
            } else {
                return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
            }
        }
    }

    // Fallback: try Date parsing
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
}

// Create Full Backup
async function createCostFullBackup() {
    const loading = document.getElementById('cost-dm-backup-loading');
    if (loading) loading.classList.add('active');

    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');

        // Fetch all cost data - use cache for clients
        const [clients, txRes, accountsRes] = await Promise.all([
            loadCostClients(),
            apiGet('/cost/transactions.php', { user_id: userId, limit: 'all' }),
            apiGet('/cost/accounts.php', { user_id: userId })
        ]);

        const backupData = {
            version: '1.0',
            type: 'cost_account',
            created_at: new Date().toISOString(),
            user_id: userId,
            data: {
                clients: clients,
                transactions: txRes.success ? (txRes.data?.transactions || []) : [],
                accounts: accountsRes.success ? (accountsRes.data?.accounts || []) : []
            }
        };

        // Create ZIP using JSZip
        if (typeof JSZip === 'undefined' && typeof window.JSZip === 'undefined') {
            // Fallback to JSON download
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CostAccount_Backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            addCostActivity('backup', 'Created full backup (JSON)', 'CostAccount_Backup.json');
            showToast('Backup downloaded successfully', 'success');
        } else {
            const JSZipLib = typeof JSZip !== 'undefined' ? JSZip : window.JSZip;
            const zip = new JSZipLib();

            // Add data files
            zip.file('backup_info.json', JSON.stringify({
                version: backupData.version,
                type: backupData.type,
                created_at: backupData.created_at,
                user_id: backupData.user_id
            }, null, 2));

            zip.file('clients.json', JSON.stringify(backupData.data.clients, null, 2));
            zip.file('transactions.json', JSON.stringify(backupData.data.transactions, null, 2));
            zip.file('accounts.json', JSON.stringify(backupData.data.accounts, null, 2));

            // Generate ZIP
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CostAccount_Backup_${new Date().toISOString().split('T')[0]}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            addCostActivity('backup', 'Created full backup (ZIP)', 'CostAccount_Backup.zip');
            showToast('Backup downloaded successfully', 'success');
        }

    } catch (error) {
        console.error('Backup error:', error);
        showToast('Backup failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.classList.remove('active');
    }
}

// Restore Cost Backup
async function restoreCostBackup() {
    const fileInput = document.getElementById('cost-dm-restore-file');
    const mode = document.querySelector('input[name="cost-dm-restore-mode"]:checked')?.value || 'merge';

    if (!fileInput?.files[0]) {
        showToast('Please select a backup file', 'warning');
        return;
    }

    if (mode === 'replace') {
        if (!confirm('WARNING: This will delete ALL existing cost account data before restoring. Are you sure?')) {
            return;
        }
    }

    const loading = document.getElementById('cost-dm-restore-loading');
    if (loading) loading.classList.add('active');

    try {
        const file = fileInput.files[0];
        const userId = state.currentUser || localStorage.getItem('currentUser');

        if (file.name.endsWith('.zip')) {
            // Handle ZIP file
            const JSZipLib = typeof JSZip !== 'undefined' ? JSZip : window.JSZip;
            if (!JSZipLib) {
                showToast('ZIP support not available. Please use JSON backup file.', 'error');
                if (loading) loading.classList.remove('active');
                return;
            }

            const zip = await JSZipLib.loadAsync(file);

            // Read data files
            const clientsJson = await zip.file('clients.json')?.async('text');
            const transactionsJson = await zip.file('transactions.json')?.async('text');

            const backupData = {
                data: {
                    clients: clientsJson ? JSON.parse(clientsJson) : [],
                    transactions: transactionsJson ? JSON.parse(transactionsJson) : []
                }
            };

            await restoreCostData(backupData, mode, userId);

        } else {
            // Handle JSON file
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const backupData = JSON.parse(e.target.result);
                    await restoreCostData(backupData, mode, userId);
                } catch (error) {
                    console.error('Restore error:', error);
                    showToast('Invalid backup file format', 'error');
                }
                if (loading) loading.classList.remove('active');
            };
            reader.readAsText(file);
            return;
        }

        addCostActivity('restore', `Restored backup (${mode} mode)`, file.name);
        showToast('Backup restored successfully', 'success');

        // Reset file input
        fileInput.value = '';
        document.getElementById('cost-dm-restore-file-name').textContent = 'No file selected';

    } catch (error) {
        console.error('Restore error:', error);
        showToast('Restore failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.classList.remove('active');
    }
}

// Helper to restore cost data
async function restoreCostData(backupData, mode, userId) {
    const { clients = [], transactions = [] } = backupData.data || {};

    // Note: Full restore would require server-side API support
    // For now, we'll restore transactions only

    let restoredCount = 0;

    for (const tx of transactions) {
        const result = await apiPost('/cost/transactions.php', {
            user_id: userId,
            account_id: tx.account_id || 1,
            client_id: tx.client_id || null,
            transaction_date: tx.transaction_date,
            description: tx.description || '',
            amount: tx.amount,
            reference_number: tx.reference_number || '',
            status: tx.status || 'pending'
        });
        if (result.success) restoredCount++;
    }

    showToast(`Restored ${restoredCount} transactions`, 'success');
}

// Activity Log Functions
function addCostActivity(type, message, filename = '') {
    const activity = {
        type,
        message,
        filename,
        timestamp: new Date().toISOString()
    };

    costDmState.activityLog.unshift(activity);
    if (costDmState.activityLog.length > 10) {
        costDmState.activityLog.pop();
    }

    renderCostActivityLog();
}

function renderCostActivityLog() {
    const container = document.getElementById('cost-activity-log-preview');
    const badge = document.getElementById('cost-dm-activity-badge');

    if (!container) return;

    if (costDmState.activityLog.length === 0) {
        container.innerHTML = `
            <div class="activity-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <span>No recent activity</span>
            </div>
        `;
        if (badge) badge.style.display = 'none';
        return;
    }

    const typeIcons = {
        'import': '📥',
        'export': '📤',
        'backup': '💾',
        'restore': '🔄'
    };

    container.innerHTML = costDmState.activityLog.slice(0, 5).map(activity => {
        const time = new Date(activity.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return `
            <div class="activity-item" style="display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="font-size: 18px;">${typeIcons[activity.type] || '📋'}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(activity.message)}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${dateStr} at ${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');

    if (badge) {
        badge.textContent = costDmState.activityLog.length;
        badge.style.display = 'flex';
    }
}

// =====================================================
// COST REPORTS
// =====================================================

let costReportData = {
    clients: [],
    transactions: [],
    clientSummary: [],
    monthlyData: []
};

let costMonthlyChart = null;
let costClientsChart = null;

async function loadCostReports() {
    await loadCostReportData();
}

async function loadCostReportData() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const period = document.getElementById('cost-report-period')?.value || 'ytd';

    try {
        // Load clients - use cache
        costReportData.clients = await loadCostClients();

        // Load transactions
        const txResult = await apiGet('/cost/transactions.php', { user_id: userId, limit: 'all' });
        costReportData.transactions = (txResult.success && txResult.data) ? (txResult.data.transactions || []) : [];

        // Calculate date range based on period
        const { startDate, endDate } = getCostReportDateRange(period);

        // Filter transactions by date
        const filteredTx = costReportData.transactions.filter(tx => {
            const txDate = new Date(tx.transaction_date);
            return txDate >= startDate && txDate <= endDate;
        });

        // Calculate summaries
        let totalDeposits = 0;
        let totalPayouts = 0;
        const clientStats = {};
        const monthlyStats = {};

        filteredTx.forEach(tx => {
            const amount = parseFloat(tx.amount) || 0;

            // Total stats
            if (amount >= 0) {
                totalDeposits += amount;
            } else {
                totalPayouts += Math.abs(amount);
            }

            // Client stats
            if (tx.client_id) {
                if (!clientStats[tx.client_id]) {
                    clientStats[tx.client_id] = { deposits: 0, payouts: 0, count: 0 };
                }
                if (amount >= 0) {
                    clientStats[tx.client_id].deposits += amount;
                } else {
                    clientStats[tx.client_id].payouts += Math.abs(amount);
                }
                clientStats[tx.client_id].count++;
            }

            // Monthly stats
            const monthKey = tx.transaction_date.substring(0, 7); // YYYY-MM
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { deposits: 0, payouts: 0 };
            }
            if (amount >= 0) {
                monthlyStats[monthKey].deposits += amount;
            } else {
                monthlyStats[monthKey].payouts += Math.abs(amount);
            }
        });

        // Build client summary
        costReportData.clientSummary = costReportData.clients.map(client => {
            const stats = clientStats[client.id] || { deposits: 0, payouts: 0, count: 0 };
            return {
                id: client.id,
                name: client.client_name,
                case_number: client.case_number || client.client_number || '',
                deposits: stats.deposits,
                payouts: stats.payouts,
                balance: stats.deposits - stats.payouts,
                count: stats.count
            };
        }).sort((a, b) => b.balance - a.balance);

        // Build monthly data
        costReportData.monthlyData = Object.entries(monthlyStats)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([month, data]) => ({
                month,
                label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                ...data
            }));

        // Update UI
        updateCostReportSummary(totalDeposits, totalPayouts);
        updateCostReportTable();
        updateCostReportCharts();

    } catch (error) {
        console.error('Error loading cost report data:', error);
        showToast('Error loading report data', 'error');
    }
}

function getCostReportDateRange(period) {
    const today = new Date();
    let startDate, endDate;

    switch (period) {
        case 'this_month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'last_month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'this_quarter':
            const quarter = Math.floor(today.getMonth() / 3);
            startDate = new Date(today.getFullYear(), quarter * 3, 1);
            endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
            break;
        case 'ytd':
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
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = today;
    }

    return { startDate, endDate };
}

function updateCostReportSummary(totalDeposits, totalPayouts) {
    const balance = totalDeposits - totalPayouts;

    document.getElementById('cost-report-total-clients').textContent = costReportData.clients.length;
    document.getElementById('cost-report-total-deposits').textContent = formatCurrency(totalDeposits);
    document.getElementById('cost-report-total-payouts').textContent = formatCurrency(totalPayouts);

    const balanceEl = document.getElementById('cost-report-balance');
    if (balanceEl) {
        balanceEl.textContent = formatCurrency(balance);
        balanceEl.style.color = balance >= 0 ? '#059669' : '#ef4444';
    }
}

function updateCostReportTable(searchTerm = '') {
    const tbody = document.getElementById('cost-report-table-body');
    if (!tbody) return;

    let data = costReportData.clientSummary;

    // Filter by search
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        data = data.filter(client =>
            client.name.toLowerCase().includes(term) ||
            client.case_number.toLowerCase().includes(term)
        );
    }

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 40px; text-align: center; color: #94a3b8;">
                    ${searchTerm ? 'No clients match your search' : 'No client data available'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(client => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 16px; font-weight: 500;">${escapeHtml(client.name)}</td>
            <td style="padding: 12px 16px; color: #64748b;">${client.case_number}</td>
            <td style="padding: 12px 16px; text-align: right; color: #10b981; font-weight: 500;">${formatCurrency(client.deposits)}</td>
            <td style="padding: 12px 16px; text-align: right; color: #ef4444; font-weight: 500;">${formatCurrency(client.payouts)}</td>
            <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: ${client.balance >= 0 ? '#059669' : '#ef4444'};">${formatCurrency(client.balance)}</td>
            <td style="padding: 12px 16px; text-align: center; color: #64748b;">${client.count}</td>
        </tr>
    `).join('');
}

function filterCostReportTable(searchTerm) {
    updateCostReportTable(searchTerm);
}

function updateCostReportCharts() {
    // Monthly Activity Chart
    const monthlyCanvas = document.getElementById('cost-monthly-chart');
    if (monthlyCanvas && typeof Chart !== 'undefined') {
        const ctx = monthlyCanvas.getContext('2d');

        if (costMonthlyChart) {
            costMonthlyChart.destroy();
        }

        const labels = costReportData.monthlyData.map(d => d.label);
        const deposits = costReportData.monthlyData.map(d => d.deposits);
        const payouts = costReportData.monthlyData.map(d => d.payouts);

        costMonthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Deposits',
                        data: deposits,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderRadius: 4
                    },
                    {
                        label: 'Payouts',
                        data: payouts,
                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => context.dataset.label + ': ' + formatCurrency(context.parsed.y)
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => '$' + value.toLocaleString()
                        }
                    }
                }
            }
        });
    }

    // Top Clients Chart
    const clientsCanvas = document.getElementById('cost-clients-chart');
    if (clientsCanvas && typeof Chart !== 'undefined') {
        const ctx = clientsCanvas.getContext('2d');

        if (costClientsChart) {
            costClientsChart.destroy();
        }

        const topClients = costReportData.clientSummary.slice(0, 8);
        const labels = topClients.map(c => c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name);
        const balances = topClients.map(c => c.balance);
        const colors = balances.map(b => b >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(239, 68, 68, 0.8)');

        costClientsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Balance',
                    data: balances,
                    backgroundColor: colors,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => 'Balance: ' + formatCurrency(context.parsed.x)
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: (value) => '$' + value.toLocaleString()
                        }
                    }
                }
            }
        });
    }
}

async function exportCostReport() {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;

    if (!Excel) {
        showToast('Excel export not available', 'warning');
        return;
    }

    try {
        const workbook = new Excel.Workbook();
        workbook.creator = 'Expense Tracker - Cost Report';
        workbook.created = new Date();

        // Summary sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Client Name', key: 'name', width: 30 },
            { header: 'Case #', key: 'case_number', width: 15 },
            { header: 'Deposits', key: 'deposits', width: 15 },
            { header: 'Payouts', key: 'payouts', width: 15 },
            { header: 'Balance', key: 'balance', width: 15 },
            { header: 'Transactions', key: 'count', width: 12 }
        ];

        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
        summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        costReportData.clientSummary.forEach(client => {
            summarySheet.addRow(client);
        });

        // Download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cost-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Report exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

// Legacy compatibility
async function loadCostOperations() {
    // Redirect to client ledger
    navigateTo('cost-client-ledger');
}

// =====================================================
// GLOBAL EXPORTS (cost-core.js)
// =====================================================

// State & Core Functions
window.costState = costState;
window.loadCostClients = loadCostClients;
window.getCostCategories = getCostCategories;
window.getCostCategoryOptions = getCostCategoryOptions;
window.costAddCategory = costAddCategory;
window.costOpenAddCategoryModal = costOpenAddCategoryModal;
window.costCloseAddCategoryModal = costCloseAddCategoryModal;
window.costSaveNewCategory = costSaveNewCategory;

// Main Page & Client Sidebar
window.loadCostClientLedgerPage = loadCostClientLedgerPage;
window.updateCostMonthFilterUI = updateCostMonthFilterUI;
window.costClearMonthFilter = costClearMonthFilter;
window.updateCostCheckStatusBadges = updateCostCheckStatusBadges;
window.calculateClientBalances = calculateClientBalances;
window.renderCostClientSidebar = renderCostClientSidebar;
window.filterCostClients = filterCostClients;
window.selectCostClientFromSidebar = selectCostClientFromSidebar;
window.updateCostSelectedHeader = updateCostSelectedHeader;

// Transaction List
window.sortCostTable = sortCostTable;
window.renderCostTransactionList = renderCostTransactionList;
window.filterCostTransactions = filterCostTransactions;
window.clearCostTxSearch = clearCostTxSearch;

// Transaction Selection
window.toggleCostTxSelection = toggleCostTxSelection;
window.toggleSelectAllCostTx = toggleSelectAllCostTx;
window.updateCostBulkActions = updateCostBulkActions;

// Transaction Modal
window.openCostTransactionModal = openCostTransactionModal;
window.costCloseTxDropdownOnClickOutside = costCloseTxDropdownOnClickOutside;
window.closeCostTransactionModal = closeCostTransactionModal;
window.switchCostTxTab = switchCostTxTab;
window.submitCostTransaction = submitCostTransaction;

// Bulk Actions
window.deleteSelectedCostTx = deleteSelectedCostTx;
window.openCostMoveModal = openCostMoveModal;
window.closeCostMoveModal = closeCostMoveModal;
window.filterCostMoveClientList = filterCostMoveClientList;
window.selectCostMoveClient = selectCostMoveClient;
window.editSelectedCostTx = editSelectedCostTx;
window.openCostEditTransactionModal = openCostEditTransactionModal;
window.closeCostEditTxModal = closeCostEditTxModal;
window.submitCostEditTx = submitCostEditTx;
window.markSelectedCostAsCleared = markSelectedCostAsCleared;

// Client Modal
window.openCostClientModal = openCostClientModal;
window.printCostClientStatement = printCostClientStatement;

// Check Status Modal
window.openCostCheckStatusModal = openCostCheckStatusModal;
window.closeCostCheckStatusModal = closeCostCheckStatusModal;
window.switchCostCheckStatusTab = switchCostCheckStatusTab;
window.filterCostCheckStatusList = filterCostCheckStatusList;
window.handleCostCheckStatusCheckboxClick = handleCostCheckStatusCheckboxClick;
window.printSelectedCostChecks = printSelectedCostChecks;
window.markSelectedCostChecksCleared = markSelectedCostChecksCleared;

// Import CSV
window.handleCostCsvImport = handleCostCsvImport;
window.closeCostImportPreview = closeCostImportPreview;
window.confirmCostImport = confirmCostImport;

// Batch Modal
window.openCostBatchModal = openCostBatchModal;
window.closeCostBatchModal = closeCostBatchModal;
window.addCostBatchItem = addCostBatchItem;
window.updateCostBatchItem = updateCostBatchItem;
window.removeCostBatchItem = removeCostBatchItem;
window.submitCostBatch = submitCostBatch;

// Cost Data Management
window.loadCostDataManagement = loadCostDataManagement;
window.switchCostDmTab = switchCostDmTab;
window.exportCostData = exportCostData;
window.handleCostFileImport = handleCostFileImport;
window.updateCostImportFileName = updateCostImportFileName;
window.updateCostRestoreFileName = updateCostRestoreFileName;
window.importCostData = importCostData;
window.createCostFullBackup = createCostFullBackup;
window.restoreCostBackup = restoreCostBackup;
window.addCostActivity = addCostActivity;
window.renderCostActivityLog = renderCostActivityLog;

// Cost Reports
window.loadCostReports = loadCostReports;
window.loadCostReportData = loadCostReportData;
window.filterCostReportTable = filterCostReportTable;
window.exportCostReport = exportCostReport;

// Legacy compatibility
window.loadCostReconcile = loadCostReconcile;
window.loadCostOperations = loadCostOperations;

