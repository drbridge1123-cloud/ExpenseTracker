// =====================================================
// IOLTA Common - Shared State & Utilities
// Version: 20251226
// =====================================================

// =====================================================
// Shared State
// =====================================================

// Main IOLTA State (shared across all IOLTA modules)
window.ioltaState = window.ioltaState || {
    trustAccounts: [],
    clients: [],
    ledgers: [],
    transactions: [],
    selectedClientId: null,
    selectedLedgerId: null,
    stagingUnassignedTotal: 0,
    stagingTotal: 0,
    stagingUnassignedTransactions: []
};
const ioltaState = window.ioltaState;

// QuickBooks-style Bank Reconciliation State
window.trustReconcileState = window.trustReconcileState || {
    reconcileId: null,
    accountId: null,
    statementDate: null,
    statementEndingBalance: 0,
    beginningBalance: 0,
    checks: [],
    deposits: [],
    clearedIds: new Set(),
    isActive: false
};

// Operations tab state
window.currentOpsTab = window.currentOpsTab || 'receive';

// Staging page state
window.stagingPageState = window.stagingPageState || {
    records: [],
    currentTab: 'unassigned',
    selectedIds: new Set()
};

// IOLTA Page State (Trust Ledger page)
window.IoltaPageState = window.IoltaPageState || {
    clients: [],
    selectedClientId: null,
    transactions: [],
    selectedTxIds: new Set(),
    sortColumn: 'transaction_date',
    sortDirection: 'desc',
    filterText: ''
};

// Reference to main app state (defined in state.js)
// Use getter to ensure we always get the latest reference
const state = new Proxy({}, {
    get: (target, prop) => window.state ? window.state[prop] : undefined,
    set: (target, prop, value) => { if (window.state) window.state[prop] = value; return true; }
});

// =====================================================
// Utility Functions
// =====================================================

// Escape HTML to prevent XSS
function ioltaEscapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format currency consistently
function ioltaFormatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format date for display
function ioltaFormatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format date short (MM/DD/YYYY)
function ioltaFormatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// =====================================================
// Searchable Client Select Component
// =====================================================

function createSearchableClientSelect(containerId, inputName, clients, placeholder = 'Search clients...', required = false) {
    window[`${containerId}_clients`] = clients.map(c => ({
        id: c.id,
        name: c.client_name,
        case: c.case_number || ''
    }));

    return `
        <div id="${containerId}" class="searchable-client-select" style="position: relative;">
            <input type="hidden" name="${inputName}" id="${containerId}-value" ${required ? 'required' : ''}>
            <input type="text"
                   id="${containerId}-search"
                   placeholder="${placeholder}"
                   autocomplete="off"
                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                   onfocus="openClientDropdown('${containerId}')"
                   oninput="filterClientDropdown('${containerId}', this.value)">
            <div id="${containerId}-dropdown"
                 style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 500px; overflow-y: auto; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 8px 8px; z-index: 10000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            </div>
        </div>
    `;
}

function openClientDropdown(containerId) {
    const dropdown = document.getElementById(`${containerId}-dropdown`);
    const searchInput = document.getElementById(`${containerId}-search`);
    const clients = window[`${containerId}_clients`] || [];

    renderClientDropdownOptions(containerId, clients, searchInput.value);
    dropdown.style.display = 'block';

    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            const container = document.getElementById(containerId);
            if (container && !container.contains(e.target)) {
                dropdown.style.display = 'none';
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 10);
}

function filterClientDropdown(containerId, searchText) {
    const dropdown = document.getElementById(`${containerId}-dropdown`);
    const clients = window[`${containerId}_clients`] || [];

    const filtered = searchText.trim() === '' ? clients : clients.filter(c => {
        const search = searchText.toLowerCase();
        return c.name.toLowerCase().includes(search) ||
               (c.case && c.case.toLowerCase().includes(search));
    });

    renderClientDropdownOptions(containerId, filtered, searchText);
    dropdown.style.display = 'block';
}

function renderClientDropdownOptions(containerId, clients, searchText) {
    const dropdown = document.getElementById(`${containerId}-dropdown`);

    if (clients.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 12px; color: #6b7280; text-align: center;">
                No clients found
            </div>
        `;
        return;
    }

    dropdown.innerHTML = clients.map(c => `
        <div onclick="selectClient('${containerId}', ${c.id}, '${ioltaEscapeHtml(c.name).replace(/'/g, "\\'")}', '${ioltaEscapeHtml(c.case || '').replace(/'/g, "\\'")}')"
             style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;"
             onmouseover="this.style.background='#f1f5f9'"
             onmouseout="this.style.background='white'">
            <div style="font-weight: 500; color: #1e293b;">${ioltaEscapeHtml(c.name)}</div>
            ${c.case ? `<div style="font-size: 12px; color: #6b7280;">${ioltaEscapeHtml(c.case)}</div>` : ''}
        </div>
    `).join('');
}

function selectClient(containerId, clientId, clientName, caseNumber) {
    const hiddenInput = document.getElementById(`${containerId}-value`);
    const searchInput = document.getElementById(`${containerId}-search`);
    const dropdown = document.getElementById(`${containerId}-dropdown`);

    hiddenInput.value = clientId;
    searchInput.value = clientName + (caseNumber ? ` (${caseNumber})` : '');
    dropdown.style.display = 'none';

    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
}

// =====================================================
// Common API Functions
// =====================================================

// Cache timestamps and pending requests to prevent duplicate calls
let _clientsLoadedAt = 0;
let _accountsLoadedAt = 0;
let _stagingSummaryLoadedAt = 0;
let _clientsLoadingPromise = null; // Track in-flight request
let _accountsLoadingPromise = null;
const _IOLTA_CACHE_TTL = 30000; // 30 seconds

async function loadTrustClients(forceRefresh = false) {
    // Return cached data if fresh
    if (!forceRefresh && ioltaState.clients.length > 0 && (Date.now() - _clientsLoadedAt) < _IOLTA_CACHE_TTL) {
        return ioltaState.clients;
    }
    // If a request is already in flight, wait for it
    if (_clientsLoadingPromise) {
        return _clientsLoadingPromise;
    }
    // Start new request
    _clientsLoadingPromise = (async () => {
        try {
            const result = await apiGet('/trust/clients.php', { user_id: state.currentUser });
            if (result.success) {
                ioltaState.clients = result.data?.clients || result.data || [];
                _clientsLoadedAt = Date.now();
                return ioltaState.clients;
            }
        } catch (error) {
            console.error('Error loading trust clients:', error);
        } finally {
            _clientsLoadingPromise = null;
        }
        return [];
    })();
    return _clientsLoadingPromise;
}

async function loadTrustAccounts(forceRefresh = false) {
    // Return cached data if fresh
    if (!forceRefresh && ioltaState.trustAccounts.length > 0 && (Date.now() - _accountsLoadedAt) < _IOLTA_CACHE_TTL) {
        return ioltaState.trustAccounts;
    }
    // If a request is already in flight, wait for it
    if (_accountsLoadingPromise) {
        return _accountsLoadingPromise;
    }
    // Start new request
    _accountsLoadingPromise = (async () => {
        try {
            const result = await apiGet('/accounts/', {
                user_id: state.currentUser,
                account_type: 'iolta'
            });
            if (result.success) {
                ioltaState.trustAccounts = result.data.accounts || [];
                _accountsLoadedAt = Date.now();
                return ioltaState.trustAccounts;
            }
        } catch (error) {
            console.error('Error loading trust accounts:', error);
        } finally {
            _accountsLoadingPromise = null;
        }
        return [];
    })();
    return _accountsLoadingPromise;
}

// Update staging badge in menu
function updateStagingBadge() {
    const badge = document.getElementById('staging-badge');
    if (badge) {
        const count = ioltaState.stagingUnassignedTotal || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

// Load staging summary for badge
async function loadStagingSummary(forceRefresh = false) {
    // Return cached if fresh
    if (!forceRefresh && ioltaState.stagingUnassignedTotal !== undefined && (Date.now() - _stagingSummaryLoadedAt) < _IOLTA_CACHE_TTL) {
        updateStagingBadge();
        return;
    }
    try {
        const result = await apiGet('/trust/staging.php', {
            user_id: state.currentUser,
            action: 'summary'
        });
        if (result.success && result.data) {
            ioltaState.stagingUnassignedTotal = result.data.unassigned || 0;
            ioltaState.stagingTotal = result.data.total || 0;
            _stagingSummaryLoadedAt = Date.now();
            updateStagingBadge();
        }
    } catch (error) {
        console.error('Error loading staging summary:', error);
    }
}

// =====================================================
// Number to Words (for checks)
// =====================================================

function numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                  'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const dollars = Math.floor(Math.abs(num));
    const cents = Math.round((Math.abs(num) - dollars) * 100);

    let words = '';

    if (dollars >= 1000000) {
        words += numberToWords(Math.floor(dollars / 1000000)) + ' Million ';
        num = dollars % 1000000;
    } else {
        num = dollars;
    }

    if (num >= 1000) {
        const thousands = Math.floor(num / 1000);
        if (thousands < 20) {
            words += ones[thousands];
        } else {
            words += tens[Math.floor(thousands / 10)] + (thousands % 10 ? ' ' + ones[thousands % 10] : '');
        }
        words += ' Thousand ';
        num = num % 1000;
    }

    if (num >= 100) {
        words += ones[Math.floor(num / 100)] + ' Hundred ';
        num = num % 100;
    }

    if (num >= 20) {
        words += tens[Math.floor(num / 10)];
        if (num % 10) words += ' ' + ones[num % 10];
    } else if (num > 0) {
        words += ones[num];
    }

    words = words.trim();
    return words + ' and ' + cents.toString().padStart(2, '0') + '/100 Dollars';
}

// =====================================================
// Export to Window (Global Access)
// =====================================================

// Utilities
window.ioltaEscapeHtml = ioltaEscapeHtml;
window.ioltaFormatCurrency = ioltaFormatCurrency;
window.ioltaFormatDate = ioltaFormatDate;
window.ioltaFormatDateShort = ioltaFormatDateShort;
window.numberToWords = numberToWords;

// Client Select Component
window.createSearchableClientSelect = createSearchableClientSelect;
window.openClientDropdown = openClientDropdown;
window.filterClientDropdown = filterClientDropdown;
window.selectClient = selectClient;

// Common API
window.loadTrustClients = loadTrustClients;
window.loadTrustAccounts = loadTrustAccounts;
window.updateStagingBadge = updateStagingBadge;
window.loadStagingSummary = loadStagingSummary;

// =====================================================
// Load IOLTA Data (main data loader for state)
// =====================================================

async function loadIOLTAData(forceRefresh = false) {
    try {
        // Load all data in parallel for speed
        await Promise.all([
            loadTrustAccounts(),
            loadTrustClients(),
            loadStagingSummary()
        ]);

        return true;
    } catch (error) {
        console.error('Error loading IOLTA data:', error);
        return false;
    }
}

window.loadIOLTAData = loadIOLTAData;

// =====================================================
// IOLTA Dashboard
// =====================================================

async function loadIoltaDashboard() {
    // Toggle dashboard wrappers (show iolta, hide others)
    const ioltaWrapper = document.getElementById('iolta-dashboard-wrapper');
    const personalWrapper = document.getElementById('personal-dashboard-wrapper');
    const costWrapper = document.getElementById('cost-dashboard-wrapper');
    if (ioltaWrapper) ioltaWrapper.style.display = 'block';
    if (personalWrapper) personalWrapper.style.display = 'none';
    if (costWrapper) costWrapper.style.display = 'none';

    // Load dashboard stats (also updates ioltaState.clients and trustAccounts)
    const stats = await loadIoltaDashboardStats();

    // Separate pending and printed checks
    const allPendingChecks = stats.pendingChecksList || [];
    const pendingOnly = allPendingChecks.filter(c => c.status === 'pending');
    const printedOnly = allPendingChecks.filter(c => c.status === 'printed');

    // Build pending checks HTML
    const pendingChecksHtml = buildPendingChecksHtml(pendingOnly);

    // Build printed checks HTML
    const printedChecksHtml = buildPrintedChecksHtml(printedOnly);

    // Build recent transactions HTML
    const recentTransactionsHtml = buildRecentTransactionsHtml(stats.recentTransactions || []);

    // Render dashboard content
    const content = document.getElementById('iolta-dashboard-content');
    if (content) {
        content.innerHTML = `
            <!-- Summary Cards Row -->
            <div id="iolta-stat-cards-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                <!-- Total Client Funds -->
                <a href="javascript:void(0)" id="stat-card-client-funds" class="card iolta-stat-card" style="padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; display: block;">
                    <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${ioltaFormatCurrency(stats.totalClientFunds)}</div>
                    <div style="color: #6b7280; font-size: 14px;">Total Client Funds</div>
                </a>

                <!-- Active Clients (Trust Accounts) -->
                <a href="javascript:void(0)" id="stat-card-trust-accounts" class="card iolta-stat-card" style="padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; display: block;">
                    <div style="font-size: 24px; margin-bottom: 8px;">👥</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${stats.activeClients}</div>
                    <div style="color: #6b7280; font-size: 14px;">Active Clients</div>
                </a>

                <!-- Open Ledgers -->
                <a href="javascript:void(0)" id="stat-card-ledgers" class="card iolta-stat-card" style="padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; display: block;">
                    <div style="font-size: 24px; margin-bottom: 8px;">📒</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${stats.openLedgers}</div>
                    <div style="color: #6b7280; font-size: 14px;">Open Ledgers</div>
                </a>

                <!-- Reconciliation Status -->
                <a href="javascript:void(0)" id="stat-card-reconcile" class="card iolta-stat-card" style="padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; display: block;">
                    <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
                    <div style="font-size: 24px; font-weight: 700; color: ${stats.reconcileIssues > 0 ? '#ef4444' : '#10b981'};">
                        ${stats.reconcileIssues > 0 ? stats.reconcileIssues + ' Issues' : 'OK'}
                    </div>
                    <div style="color: #6b7280; font-size: 14px;">Reconciliation Status</div>
                </a>
            </div>

            <!-- Quick Actions -->
            <div class="card" style="padding: 20px; margin-bottom: 24px;">
                <h3 style="margin-bottom: 16px; font-size: 16px; font-weight: 600; color: #1e293b;">Quick Actions</h3>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button onclick="openNewTransactionModal('deposit')" class="btn btn-primary" style="display: flex; align-items: center; gap: 8px;">
                        💵 Deposit
                    </button>
                    <button onclick="openNewTransactionModal('check')" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        ✏️ Write Check
                    </button>
                    <button onclick="openDepositListModal()" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        💰 Deposit List
                    </button>
                    <button onclick="openPayoutListModal()" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        📄 Payout List
                    </button>
                    <button onclick="openCostListModal()" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        💳 Cost List
                    </button>
                    <button onclick="openLegalFeeListModal()" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        ⚖️ Legal Fee List
                    </button>
                    <button onclick="openNewClientModal()" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                        ➕ New Client
                    </button>
                </div>
            </div>

            <!-- Pending Checks + Printed Checks + Recent Transactions Row -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                <!-- Pending Checks -->
                <div class="card" style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="font-size: 16px; font-weight: 600; color: #1e293b;">Pending Checks</h3>
                        <button onclick="navigateToLedgerWithFilter('pending')" class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 12px;">View All</button>
                    </div>
                    ${pendingChecksHtml}
                </div>

                <!-- Printed Checks -->
                <div class="card" style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="font-size: 16px; font-weight: 600; color: #1e293b;">Printed Checks</h3>
                        <button onclick="navigateToLedgerWithFilter('printed')" class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 12px;">View All</button>
                    </div>
                    ${printedChecksHtml}
                </div>

                <!-- Recent Transactions -->
                <div class="card" style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="font-size: 16px; font-weight: 600; color: #1e293b;">Recent Transactions</h3>
                        <button onclick="navigateTo('iolta')" class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 12px;">View All</button>
                    </div>
                    ${recentTransactionsHtml}
                </div>
            </div>
        `;

        // Attach click handlers after rendering
        document.getElementById('stat-card-client-funds')?.addEventListener('click', (e) => {
            e.preventDefault();
            openClientFundsModal();
        });
        document.getElementById('stat-card-trust-accounts')?.addEventListener('click', (e) => {
            e.preventDefault();
            openActiveClientsModal();
        });
        document.getElementById('stat-card-ledgers')?.addEventListener('click', (e) => {
            e.preventDefault();
            openLedgersModal();
        });
        document.getElementById('stat-card-reconcile')?.addEventListener('click', (e) => {
            e.preventDefault();
            openReconcileStatusModal();
        });

        // Add hover effects
        document.querySelectorAll('.iolta-stat-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
                card.style.boxShadow = '';
            });
        });
    }
}

// Build Spending by Category HTML
function buildSpendingByCategoryHtml(categories) {
    if (!categories || categories.length === 0) {
        return '<p style="color: #6b7280; text-align: center; padding: 20px;">No spending data available</p>';
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const maxAmount = Math.max(...categories.map(c => c.amount));

    return `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${categories.slice(0, 5).map((cat, i) => `
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-size: 14px; color: #374151;">${ioltaEscapeHtml(cat.name)}</span>
                        <span style="font-size: 14px; font-weight: 600; color: #1e293b;">${ioltaFormatCurrency(cat.amount)}</span>
                    </div>
                    <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${(cat.amount / maxAmount * 100)}%; background: ${colors[i % colors.length]}; border-radius: 4px;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Build Account Balances HTML
function buildAccountBalancesHtml(accounts) {
    if (!accounts || accounts.length === 0) {
        return '<p style="color: #6b7280; text-align: center; padding: 20px;">No trust accounts configured</p>';
    }

    return `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${accounts.map(acc => {
                const balance = parseFloat(acc.balance) || 0;
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px;">
                        <div>
                            <div style="font-weight: 500; color: #1e293b;">${ioltaEscapeHtml(acc.account_name)}</div>
                            <div style="font-size: 12px; color: #6b7280;">${ioltaEscapeHtml(acc.bank_name || 'Trust Account')}</div>
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: ${balance >= 0 ? '#059669' : '#dc2626'};">
                            ${ioltaFormatCurrency(balance)}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Build Pending Checks HTML
function buildPendingChecksHtml(checks) {
    if (!checks || checks.length === 0) {
        return '<p style="color: #6b7280; text-align: center; padding: 20px;">No pending checks</p>';
    }

    return `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
            ${checks.slice(0, 10).map(check => {
                const checkNum = check.check_number && check.check_number !== '-' ? `#${ioltaEscapeHtml(check.check_number)}` : '';
                const payeeInfo = check.payee || check.client_name || 'Unknown';
                return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #fefce8; border-radius: 8px; border-left: 3px solid #eab308;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${ioltaEscapeHtml(check.client_name || 'Unknown Client')}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${checkNum ? checkNum + ' - ' : ''}${ioltaEscapeHtml(payeeInfo)} - ${ioltaFormatDateShort(check.check_date)}
                        </div>
                    </div>
                    <div style="font-weight: 600; color: #92400e; margin-left: 12px; white-space: nowrap;">${ioltaFormatCurrency(check.amount)}</div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

// Build Printed Checks HTML
function buildPrintedChecksHtml(checks) {
    if (!checks || checks.length === 0) {
        return '<p style="color: #6b7280; text-align: center; padding: 20px;">No printed checks</p>';
    }

    return `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
            ${checks.slice(0, 10).map(check => {
                const checkNum = check.check_number && check.check_number !== '-' ? `#${ioltaEscapeHtml(check.check_number)}` : '';
                const payeeInfo = check.payee || check.client_name || 'Unknown';
                return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #eff6ff; border-radius: 8px; border-left: 3px solid #3b82f6;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${ioltaEscapeHtml(check.client_name || 'Unknown Client')}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${checkNum ? checkNum + ' - ' : ''}${ioltaEscapeHtml(payeeInfo)} - ${ioltaFormatDateShort(check.check_date)}
                        </div>
                    </div>
                    <div style="font-weight: 600; color: #1d4ed8; margin-left: 12px; white-space: nowrap;">${ioltaFormatCurrency(check.amount)}</div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

// Build Recent Transactions HTML
function buildRecentTransactionsHtml(transactions) {
    if (!transactions || transactions.length === 0) {
        return '<p style="color: #6b7280; text-align: center; padding: 20px;">No recent transactions</p>';
    }

    return `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
            ${transactions.slice(0, 10).map(tx => {
                const amount = parseFloat(tx.amount) || 0;
                const isDeposit = amount > 0;
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDeposit ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; border-left: 3px solid ${isDeposit ? '#22c55e' : '#ef4444'};">
                        <div>
                            <div style="font-weight: 500; color: #1e293b;">${ioltaEscapeHtml(tx.client_name || 'Unknown')}</div>
                            <div style="font-size: 12px; color: #6b7280;">${ioltaEscapeHtml(tx.description || tx.transaction_type)} - ${ioltaFormatDateShort(tx.transaction_date)}</div>
                        </div>
                        <div style="font-weight: 600; color: ${isDeposit ? '#059669' : '#dc2626'};">
                            ${isDeposit ? '+' : ''}${ioltaFormatCurrency(amount)}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Load dashboard statistics
async function loadIoltaDashboardStats() {
    const stats = {
        totalClientFunds: 0,
        trustAccountCount: 0,
        activeClients: 0,
        openLedgers: 0,
        reconcileIssues: 0,
        pendingChecks: 0,
        pendingAmount: 0,
        printedChecks: 0,
        printedAmount: 0,
        clearedChecks: 0,
        clearedAmount: 0,
        pendingChecksList: [],
        recentTransactions: [],
        spendingByCategory: []
    };

    try {
        const userId = state.currentUser;

        // Single API call for all dashboard data (fast like Cost dashboard)
        const result = await apiGet('/trust/dashboard.php', { user_id: userId });

        if (result.success && result.data) {
            const data = result.data;

            // Map API response to stats
            stats.totalClientFunds = data.total_client_funds || 0;
            stats.trustAccountCount = data.trust_account_count || 0;
            stats.activeClients = data.active_clients || 0;
            stats.openLedgers = data.open_ledgers || 0;
            stats.reconcileIssues = data.reconcile_issues || 0;
            stats.pendingChecks = data.pending_checks || 0;
            stats.pendingAmount = data.pending_amount || 0;
            stats.printedChecks = data.printed_checks || 0;
            stats.printedAmount = data.printed_amount || 0;
            stats.recentTransactions = data.recent_transactions || [];

            // Map pending checks list
            stats.pendingChecksList = (data.pending_checks_list || []).map(t => ({
                id: t.id,
                check_number: t.check_number || t.reference_number || '-',
                payee: t.payee || t.description,
                amount: parseFloat(t.amount) || 0,
                check_date: t.check_date,
                status: t.status,
                client_name: t.client_name,
                ledger_id: t.ledger_id
            }));

            // Update shared state with clients and trust accounts
            ioltaState.clients = data.clients || [];
            ioltaState.trustAccounts = data.trust_accounts || [];

            // Update cache timestamps to prevent duplicate API calls
            _clientsLoadedAt = Date.now();
            _accountsLoadedAt = Date.now();
        }

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }

    return stats;
}

// Get display name for transaction category
function getCategoryDisplayName(category) {
    const names = {
        'deposit': 'Deposits',
        'payout': 'Payouts',
        'disbursement': 'Disbursements',
        'legal_fee': 'Legal Fees',
        'cost': 'Costs',
        'earned_fee': 'Earned Fees',
        'refund': 'Refunds',
        'transfer': 'Transfers',
        'bill': 'Bills'
    };
    return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

window.loadIoltaDashboard = loadIoltaDashboard;
window.loadIoltaDashboardStats = loadIoltaDashboardStats;

// Navigate to Trust Ledger with status filter
function navigateToLedgerWithFilter(statusFilter) {
    // Store filter in session storage for the Trust Ledger page to pick up
    sessionStorage.setItem('ioltaStatusFilter', statusFilter);
    navigateTo('iolta');
}
window.navigateToLedgerWithFilter = navigateToLedgerWithFilter;

// =====================================================
// Dashboard Detail Modals
// =====================================================

// Client Funds Detail Modal - shows breakdown by client
async function openClientFundsModal() {
    // Get client balances from ledger data
    const clients = Array.isArray(ioltaState.clients) ? ioltaState.clients : [];

    let tableRows = '';
    let totalBalance = 0;

    clients.forEach(client => {
        const balance = parseFloat(client.balance) || 0;
        totalBalance += balance;
        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(client.client_name)}</td>
                <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(client.case_number || '-')}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: ${balance >= 0 ? '#059669' : '#dc2626'};">
                    ${ioltaFormatCurrency(balance)}
                </td>
            </tr>
        `;
    });

    if (clients.length === 0) {
        tableRows = '<tr><td colspan="3" style="padding: 24px; text-align: center; color: #6b7280;">No client ledgers found</td></tr>';
    }

    const modalHtml = `
        <div id="client-funds-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 700px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">💰 Client Funds Breakdown</h2>
                    <button onclick="closeIoltaModal('client-funds-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 140px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Client Name</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Case Number</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f1f5f9; font-weight: 700;">
                                <td colspan="2" style="padding: 12px;">Total</td>
                                <td style="padding: 12px; text-align: right; color: #059669;">${ioltaFormatCurrency(totalBalance)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('client-funds-modal').addEventListener('click', (e) => {
        if (e.target.id === 'client-funds-modal') closeIoltaModal('client-funds-modal');
    });
}

// Active Clients Modal - shows only clients with non-zero balance
async function openActiveClientsModal() {
    const clients = Array.isArray(ioltaState.clients) ? ioltaState.clients : [];

    // Filter only active clients (with non-zero balance)
    const activeClients = clients.filter(c => {
        const balance = parseFloat(c.balance || c.total_balance) || 0;
        return balance !== 0;
    });

    let tableRows = '';
    let totalBalance = 0;

    activeClients.forEach(client => {
        const balance = parseFloat(client.balance || client.total_balance) || 0;
        totalBalance += balance;
        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="closeIoltaModal('active-clients-modal'); navigateTo('iolta'); setTimeout(() => { if(typeof selectIoltaClient === 'function') selectIoltaClient(${client.id}); }, 500);">
                <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(client.client_name)}</td>
                <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(client.case_number || '-')}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: ${balance >= 0 ? '#059669' : '#dc2626'};">
                    ${ioltaFormatCurrency(balance)}
                </td>
            </tr>
        `;
    });

    if (activeClients.length === 0) {
        tableRows = '<tr><td colspan="3" style="padding: 24px; text-align: center; color: #6b7280;">No active clients found</td></tr>';
    }

    const modalHtml = `
        <div id="active-clients-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 700px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">👥 Active Clients</h2>
                    <button onclick="closeIoltaModal('active-clients-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 140px);">
                    <p style="color: #6b7280; font-size: 13px; margin-bottom: 16px;">Clients with non-zero balance. Click to view ledger.</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Client Name</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Case Number</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f1f5f9; font-weight: 700;">
                                <td colspan="2" style="padding: 12px;">Total (${activeClients.length} clients)</td>
                                <td style="padding: 12px; text-align: right; color: #059669;">${ioltaFormatCurrency(totalBalance)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('active-clients-modal').addEventListener('click', (e) => {
        if (e.target.id === 'active-clients-modal') closeIoltaModal('active-clients-modal');
    });
}

// Trust Accounts Detail Modal
async function openTrustAccountsModal() {
    const accounts = Array.isArray(ioltaState.trustAccounts) ? ioltaState.trustAccounts : [];

    let tableRows = '';
    let totalBalance = 0;

    accounts.forEach(acc => {
        const balance = parseFloat(acc.balance) || 0;
        totalBalance += balance;
        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(acc.account_name)}</td>
                <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(acc.account_number || '-')}</td>
                <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(acc.bank_name || '-')}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">
                    ${ioltaFormatCurrency(balance)}
                </td>
            </tr>
        `;
    });

    if (accounts.length === 0) {
        tableRows = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #6b7280;">No trust accounts configured</td></tr>';
    }

    const modalHtml = `
        <div id="trust-accounts-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">🏦 Trust Accounts</h2>
                    <button onclick="closeIoltaModal('trust-accounts-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 140px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Account Name</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Account #</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Bank</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f1f5f9; font-weight: 700;">
                                <td colspan="3" style="padding: 12px;">Total</td>
                                <td style="padding: 12px; text-align: right; color: #059669;">${ioltaFormatCurrency(totalBalance)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('trust-accounts-modal').addEventListener('click', (e) => {
        if (e.target.id === 'trust-accounts-modal') closeIoltaModal('trust-accounts-modal');
    });
}

// Open Ledgers Detail Modal
async function openLedgersModal() {
    const clients = Array.isArray(ioltaState.clients) ? ioltaState.clients : [];

    let tableRows = '';

    clients.forEach(client => {
        const balance = parseFloat(client.balance) || 0;
        const status = balance > 0 ? 'Active' : (balance === 0 ? 'Zero Balance' : 'Overdrawn');
        const statusColor = balance > 0 ? '#059669' : (balance === 0 ? '#6b7280' : '#dc2626');

        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="navigateTo('iolta'); setTimeout(() => { if(typeof selectIoltaClient === 'function') selectIoltaClient(${client.id}); }, 500);">
                <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(client.client_name)}</td>
                <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(client.case_number || '-')}</td>
                <td style="padding: 12px;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; background: ${statusColor}20; color: ${statusColor};">
                        ${status}
                    </span>
                </td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: ${balance >= 0 ? '#059669' : '#dc2626'};">
                    ${ioltaFormatCurrency(balance)}
                </td>
            </tr>
        `;
    });

    if (clients.length === 0) {
        tableRows = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #6b7280;">No open ledgers found</td></tr>';
    }

    const modalHtml = `
        <div id="ledgers-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">📒 Open Ledgers</h2>
                    <button onclick="closeIoltaModal('ledgers-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 140px);">
                    <p style="margin-bottom: 16px; color: #6b7280; font-size: 14px;">Click on a ledger to view transactions</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Client Name</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Case Number</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Status</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('ledgers-modal').addEventListener('click', (e) => {
        if (e.target.id === 'ledgers-modal') closeIoltaModal('ledgers-modal');
    });
}

// Reconciliation Status Modal
async function openReconcileStatusModal() {
    const accounts = Array.isArray(ioltaState.trustAccounts) ? ioltaState.trustAccounts : [];

    let tableRows = '';

    // For now, show basic status - this can be enhanced with actual reconciliation data
    accounts.forEach(acc => {
        const lastReconciled = acc.last_reconciled_date || null;
        const isReconciled = lastReconciled && isWithinMonth(lastReconciled);
        const statusText = lastReconciled ? ioltaFormatDate(lastReconciled) : 'Never';
        const statusColor = isReconciled ? '#059669' : '#f59e0b';

        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(acc.account_name)}</td>
                <td style="padding: 12px; text-align: center;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; background: ${statusColor}20; color: ${statusColor};">
                        ${isReconciled ? '✓ Reconciled' : '⚠ Pending'}
                    </span>
                </td>
                <td style="padding: 12px; color: #6b7280;">${statusText}</td>
                <td style="padding: 12px; text-align: center;">
                    <button onclick="closeIoltaModal('reconcile-status-modal'); navigateTo('trust-reconcile');" class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                        Reconcile
                    </button>
                </td>
            </tr>
        `;
    });

    if (accounts.length === 0) {
        tableRows = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #6b7280;">No trust accounts to reconcile</td></tr>';
    }

    const modalHtml = `
        <div id="reconcile-status-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">📊 Reconciliation Status</h2>
                    <button onclick="closeIoltaModal('reconcile-status-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 140px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Account</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569;">Status</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Last Reconciled</th>
                                <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('reconcile-status-modal').addEventListener('click', (e) => {
        if (e.target.id === 'reconcile-status-modal') closeIoltaModal('reconcile-status-modal');
    });
}

// Helper: Check if date is within current month
function isWithinMonth(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// Close modal helper for IOLTA dynamic modals
function closeIoltaModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
}

window.openClientFundsModal = openClientFundsModal;
window.openActiveClientsModal = openActiveClientsModal;
window.openTrustAccountsModal = openTrustAccountsModal;
window.openLedgersModal = openLedgersModal;
window.openReconcileStatusModal = openReconcileStatusModal;
window.closeIoltaModal = closeIoltaModal;

// =====================================================
// Quick Action List Modals
// =====================================================

// Deposit List Modal - shows all deposits
async function openDepositListModal() {
    const userId = state.currentUser;
    let deposits = [];

    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            type: 'deposit',
            limit: 100
        });
        if (result.success && result.data) {
            deposits = result.data.transactions || [];
        }
    } catch (e) {
        console.error('Error loading deposits:', e);
    }

    let tableRows = deposits.map(d => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px;">${ioltaFormatDateShort(d.transaction_date)}</td>
            <td style="padding: 12px; font-weight: 500;">${ioltaEscapeHtml(d.client_name || 'Unknown')}</td>
            <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(d.received_from || d.description || '-')}</td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">${ioltaFormatCurrency(d.amount)}</td>
        </tr>
    `).join('');

    if (deposits.length === 0) {
        tableRows = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #6b7280;">No deposits found</td></tr>';
    }

    const modalHtml = `
        <div id="deposit-list-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">💰 Deposit List</h2>
                    <button onclick="closeIoltaModal('deposit-list-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 80px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Date</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Client</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Received From</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('deposit-list-modal').addEventListener('click', (e) => {
        if (e.target.id === 'deposit-list-modal') closeIoltaModal('deposit-list-modal');
    });
}

// Payout List Modal - shows all payouts/disbursements (Check History format)
async function openPayoutListModal() {
    const userId = state.currentUser;
    let payouts = [];

    try {
        // Get all transactions and filter for payouts (negative amounts = outgoing money)
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            limit: 500
        });
        if (result.success && result.data) {
            const allTx = result.data.transactions || [];
            // Payouts are all negative amount transactions (checks, disbursements, etc.)
            payouts = allTx.filter(t => parseFloat(t.amount) < 0);
        }
    } catch (e) {
        console.error('Error loading payouts:', e);
    }

    // Format type for display
    function formatType(type, hasCheckNumber) {
        const types = {
            'payout': 'Payout',
            'disbursement': 'Disbursement',
            'legal_fee': 'Legal Fee',
            'cost': 'Cost',
            'transfer_out': 'Transfer Out',
            'check': 'Check'
        };
        if (types[type]) return types[type];
        // If no type but has check number, it's a check
        if (hasCheckNumber) return 'Check';
        return 'Disbursement';
    }

    let tableRows = payouts.map(p => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px;">${ioltaFormatDateShort(p.transaction_date)}</td>
            <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(p.check_number ? '#' + p.check_number : '-')}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; background: #fee2e2; color: #dc2626;">
                    ${formatType(p.transaction_type, p.check_number)}
                </span>
            </td>
            <td style="padding: 12px; color: #374151;">${ioltaEscapeHtml(p.payee || p.entity_name || p.description || '-')}</td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #dc2626;">${ioltaFormatCurrency(Math.abs(p.amount))}</td>
        </tr>
    `).join('');

    if (payouts.length === 0) {
        tableRows = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: #6b7280;">No payouts found</td></tr>';
    }

    const modalHtml = `
        <div id="payout-list-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 900px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">📄 Payout List</h2>
                    <button onclick="closeIoltaModal('payout-list-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 80px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DATE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">CHECK #</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">TYPE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DESCRIPTION</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('payout-list-modal').addEventListener('click', (e) => {
        if (e.target.id === 'payout-list-modal') closeIoltaModal('payout-list-modal');
    });
}

// Cost List Modal - shows all cost transactions (Check History format)
async function openCostListModal() {
    const userId = state.currentUser;
    let costs = [];

    try {
        // Get all transactions and filter for cost type only
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            limit: 500
        });
        if (result.success && result.data) {
            const allTx = result.data.transactions || [];
            costs = allTx.filter(t => t.transaction_type === 'cost');
        }
    } catch (e) {
        console.error('Error loading costs:', e);
    }

    let tableRows = costs.map(c => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px;">${ioltaFormatDateShort(c.transaction_date)}</td>
            <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(c.check_number ? '#' + c.check_number : '-')}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; background: #fef3c7; color: #92400e;">
                    Cost
                </span>
            </td>
            <td style="padding: 12px; color: #374151;">${ioltaEscapeHtml(c.payee || c.description || '-')}</td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #dc2626;">${ioltaFormatCurrency(Math.abs(c.amount))}</td>
        </tr>
    `).join('');

    if (costs.length === 0) {
        tableRows = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: #6b7280;">No cost transactions found</td></tr>';
    }

    const modalHtml = `
        <div id="cost-list-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 900px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">💳 Cost List</h2>
                    <button onclick="closeIoltaModal('cost-list-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 80px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DATE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">CHECK #</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">TYPE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DESCRIPTION</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('cost-list-modal').addEventListener('click', (e) => {
        if (e.target.id === 'cost-list-modal') closeIoltaModal('cost-list-modal');
    });
}

// Legal Fee List Modal - shows all legal fee transactions (Check History format)
async function openLegalFeeListModal() {
    const userId = state.currentUser;
    let fees = [];

    try {
        // Get all transactions and filter for legal_fee/earned_fee types
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            limit: 500
        });
        if (result.success && result.data) {
            const allTx = result.data.transactions || [];
            fees = allTx.filter(t => t.transaction_type === 'legal_fee' || t.transaction_type === 'earned_fee');
        }
    } catch (e) {
        console.error('Error loading legal fees:', e);
    }

    let tableRows = fees.map(f => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px;">${ioltaFormatDateShort(f.transaction_date)}</td>
            <td style="padding: 12px; color: #6b7280;">${ioltaEscapeHtml(f.check_number ? '#' + f.check_number : '-')}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; background: #ede9fe; color: #7c3aed;">
                    Legal Fee
                </span>
            </td>
            <td style="padding: 12px; color: #374151;">${ioltaEscapeHtml(f.payee || f.description || '-')}</td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: #8b5cf6;">${ioltaFormatCurrency(Math.abs(f.amount))}</td>
        </tr>
    `).join('');

    if (fees.length === 0) {
        tableRows = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: #6b7280;">No legal fee transactions found</td></tr>';
    }

    const modalHtml = `
        <div id="legal-fee-list-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b;">Legal Fee List</h2>
                    <button onclick="closeIoltaModal('legal-fee-list-modal')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 80px);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DATE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">CHECK #</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">TYPE</th>
                                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">DESCRIPTION</th>
                                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569;">AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('legal-fee-list-modal').addEventListener('click', (e) => {
        if (e.target.id === 'legal-fee-list-modal') closeIoltaModal('legal-fee-list-modal');
    });
}

// New Client Modal - Use professional Trust Client modal
function openNewClientModal() {
    // Use the professional-style Trust Client modal
    openTrustClientModal();
}

window.openDepositListModal = openDepositListModal;
window.openPayoutListModal = openPayoutListModal;
window.openCostListModal = openCostListModal;
window.openLegalFeeListModal = openLegalFeeListModal;
window.openNewClientModal = openNewClientModal;

// =====================================================
// Refresh IOLTA UI (common refresh function)
// =====================================================

async function refreshIoltaUI(options = {}) {
    const { ledgers, transactions, sidebar } = options;

    try {
        // Refresh transactions if requested
        if (transactions && typeof window.loadIoltaTransactions === 'function') {
            const clientId = window.IoltaPageState?.selectedClientId || 'all';
            await window.loadIoltaTransactions(clientId);
        }

        // Refresh sidebar/client list if requested
        if (sidebar && typeof window.renderIoltaClientSidebar === 'function') {
            await loadTrustClients();
            window.renderIoltaClientSidebar();
        }

        // Refresh full page if ledgers requested
        if (ledgers && typeof window.loadIoltaPage === 'function') {
            await window.loadIoltaPage();
        }
    } catch (error) {
        console.error('Error refreshing IOLTA UI:', error);
    }
}

window.refreshIoltaUI = refreshIoltaUI;

// =====================================================
// Trust Client Modal (Professional Style - Same as Cost)
// =====================================================

window.openTrustClientModal = function(client) {
    var modal = document.getElementById('trust-client-modal');
    if (modal) modal.remove();
    var isEdit = !!client;
    var title = isEdit ? 'Edit Client' : 'Add New Client';
    modal = document.createElement('div');
    modal.id = 'trust-client-modal';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center; padding: 20px;';
    var clientId = client ? client.id : '';
    var caseNumber = client ? (client.case_number || '') : '';
    var clientName = client ? (client.client_name || '') : '';
    var displayName = client ? (client.display_name || '') : '';
    var email = client ? (client.contact_email || '') : '';
    var phone = client ? (client.contact_phone || '') : '';
    var address = client ? (client.address || '') : '';
    var notes = client ? (client.notes || '') : '';

    // Parse address into components if available
    var street = '', street2 = '', city = '', stateCode = '', zip = '';
    if (address) {
        var parts = address.split(',').map(function(p) { return p.trim(); });
        if (parts.length >= 1) street = parts[0] || '';
        if (parts.length >= 2) street2 = parts[1] || '';
        if (parts.length >= 3) city = parts[2] || '';
        if (parts.length >= 4) {
            var stateZip = parts[3].trim().split(' ');
            stateCode = stateZip[0] || '';
            zip = stateZip[1] || '';
        }
    }

    // Input style for cleaner look
    var inputStyle = 'width: 100%; padding: 11px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #fff; transition: all 0.15s ease; outline: none;';
    var inputFocus = "this.style.borderColor='#7c3aed'; this.style.boxShadow='0 0 0 3px rgba(124,58,237,0.1)'";
    var inputBlur = "this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'";

    modal.innerHTML = `
        <div style="width: 480px; max-width: 95%; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
            <div style="padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 17px; font-weight: 600; color: #1e293b;">${title}</h2>
                <button onclick="closeTrustClientModal()" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: none; border-radius: 6px; font-size: 16px; color: #64748b; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">&times;</button>
            </div>

            <form id="trust-client-form" onsubmit="saveTrustClient(event)" style="padding: 20px 24px;">
                <input type="hidden" id="trust-client-id" value="${clientId}">

                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Name <span style="color: #ef4444;">*</span></label>
                        <input type="text" id="trust-client-name" required value="${clientName}" placeholder="Full name"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Case #</label>
                        <input type="text" id="trust-client-case" value="${caseNumber}" placeholder="Case number"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Display Name <span style="color: #94a3b8; font-weight: 400;">(for checks)</span></label>
                    <input type="text" id="trust-client-display-name" value="${displayName}" placeholder="Name as printed on checks"
                           style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Email</label>
                        <input type="email" id="trust-client-email" value="${email}" placeholder="email@example.com"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone</label>
                        <input type="tel" id="trust-client-phone" value="${phone}" placeholder="(555) 123-4567"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 16px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                    <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Address</label>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="trust-client-street" value="${street}" placeholder="Street address"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="trust-client-street2" value="${street2}" placeholder="Suite, unit, building (optional)"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 10px;">
                        <input type="text" id="trust-client-city" value="${city}" placeholder="City"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="trust-client-state" value="${stateCode}" placeholder="State" maxlength="2"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="trust-client-zip" value="${zip}" placeholder="Zip"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Notes</label>
                    <textarea id="trust-client-notes" rows="2" placeholder="Additional notes (optional)"
                              style="${inputStyle} resize: vertical; min-height: 60px;" onfocus="${inputFocus}" onblur="${inputBlur}">${notes}</textarea>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                    <button type="button" onclick="closeTrustClientModal()"
                            style="padding: 10px 20px; background: #fff; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
                            onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0'">Cancel</button>
                    <button type="submit"
                            style="padding: 10px 20px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; box-shadow: 0 1px 2px rgba(124,58,237,0.2);"
                            onmouseover="this.style.background='#6d28d9'; this.style.boxShadow='0 2px 4px rgba(124,58,237,0.3)'" onmouseout="this.style.background='#7c3aed'; this.style.boxShadow='0 1px 2px rgba(124,58,237,0.2)'">Save Client</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeTrustClientModal = function() {
    var modal = document.getElementById('trust-client-modal');
    if (modal) modal.remove();
};

window.saveTrustClient = async function(event) {
    event.preventDefault();
    var id = document.getElementById('trust-client-id').value;

    // Build address from components
    var street = document.getElementById('trust-client-street')?.value.trim() || '';
    var street2 = document.getElementById('trust-client-street2')?.value.trim() || '';
    var city = document.getElementById('trust-client-city')?.value.trim() || '';
    var stateCode = document.getElementById('trust-client-state')?.value.trim() || '';
    var zip = document.getElementById('trust-client-zip')?.value.trim() || '';

    var address = '';
    if (street) address += street;
    if (street2) address += (address ? ', ' : '') + street2;
    if (city) address += (address ? ', ' : '') + city;
    if (stateCode) address += (address ? ', ' : '') + stateCode;
    if (zip) address += (address ? ' ' : '') + zip;

    var userId = (typeof state !== 'undefined' && state.currentUser) || localStorage.getItem('currentUser') || '1';

    var data = {
        user_id: userId,
        case_number: document.getElementById('trust-client-case').value,
        client_name: document.getElementById('trust-client-name').value,
        display_name: document.getElementById('trust-client-display-name')?.value || null,
        contact_email: document.getElementById('trust-client-email').value,
        contact_phone: document.getElementById('trust-client-phone').value,
        address: address || null,
        notes: document.getElementById('trust-client-notes').value
    };

    try {
        var result;
        if (id) {
            data.id = id;
            result = await apiPut('/trust/clients.php', data);
        } else {
            result = await apiPost('/trust/clients.php', data);
        }

        if (result.success) {
            closeTrustClientModal();
            // Refresh client list
            if (typeof loadTrustClients === 'function') {
                await loadTrustClients();
            }
            if (typeof window.renderIoltaClientSidebar === 'function') {
                window.renderIoltaClientSidebar();
            }
            if (typeof showToast === 'function') {
                showToast(id ? 'Client updated' : 'Client added', 'success');
            }
        } else {
            alert(result.message || 'Error saving client');
        }
    } catch (error) {
        console.error('Error saving client:', error);
        alert('Error saving client');
    }
};

console.log('IOLTA Common module loaded');
