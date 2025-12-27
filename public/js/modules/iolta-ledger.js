// =====================================================
// IOLTA Trust Ledger Page Module
// Version: 20251225
// Dependencies: api.js, state.js, utils.js
// =====================================================

// State for the unified IOLTA page
if (!window.IoltaPageState) {
    window.IoltaPageState = {
        clients: [],
        selectedClientId: null,
        transactions: [],
        totalBalance: 0,
        searchFilter: '',
        txSearchFilter: '',
        trustAccountId: null,
        unassignedCount: 0,
        sortColumn: 'date',
        sortDirection: 'desc',
        selectedTxIds: new Set()
    };
}
const IoltaPageState = window.IoltaPageState;

// Local helper - escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// UNIFIED IOLTA PAGE - Combined Operations + Client Ledger
// ============================================================

/**
 * Load the unified IOLTA page
 */
async function loadIoltaPage() {
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    try {
        // Load clients, trust account, and unassigned staging count
        const [clientsResult, accountsResult, stagingResult] = await Promise.all([
            apiGet(`/trust/clients.php?user_id=${userId}`),
            apiGet(`/accounts/index.php?user_id=${userId}&type=iolta`),
            apiGet(`/trust/staging.php?user_id=${userId}&status=unassigned`)
        ]);

        if (clientsResult.success) {
            IoltaPageState.clients = clientsResult.data.clients || [];

            // Calculate total balance
            IoltaPageState.totalBalance = IoltaPageState.clients.reduce(
                (sum, c) => sum + parseFloat(c.total_balance || 0), 0
            );
        }

        // Find trust account
        if (accountsResult.success && accountsResult.data.accounts) {
            const trustAcc = accountsResult.data.accounts.find(a => a.account_type === 'iolta');
            if (trustAcc) {
                IoltaPageState.trustAccountId = trustAcc.id;
            }
        }

        // Store unassigned staging count
        if (stagingResult.success) {
            IoltaPageState.unassignedCount = (stagingResult.data.staging || []).length;
        } else {
            IoltaPageState.unassignedCount = 0;
        }

        renderIoltaClientSidebar();

        // Check if there's a pending client selection from dashboard modal
        const pendingClientId = localStorage.getItem('ioltaPendingClientId');
        if (pendingClientId) {
            localStorage.removeItem('ioltaPendingClientId');
            selectIoltaClient(parseInt(pendingClientId) || pendingClientId);
        } else if (IoltaPageState.clients.length > 0) {
            // Select all clients by default
            selectIoltaClient('all');
        } else {
            renderIoltaTransactions([]);
        }

        // Load pending, printed, and cleared checks counts (non-blocking)
        loadPendingChecksCount();
        loadPrintedChecksCount();
        loadClearedChecksCount();

    } catch (error) {
        console.error('Error loading IOLTA page:', error);
        showToast('Error loading IOLTA data', 'error');
    }
}

/**
 * Render the client sidebar
 */
function renderIoltaClientSidebar() {
    const container = document.getElementById('iolta-client-list');
    if (!container) return;

    const filter = (IoltaPageState.searchFilter || '').toLowerCase();
    const filteredClients = (IoltaPageState.clients || []).filter(c =>
        !filter ||
        c.client_name.toLowerCase().includes(filter) ||
        (c.client_number && c.client_number.toLowerCase().includes(filter)) ||
        (c.case_number && c.case_number.toLowerCase().includes(filter))
    );

    // Update total balance in header
    const balanceEl = document.getElementById('iolta-total-balance');
    if (balanceEl) {
        balanceEl.textContent = formatCurrency(IoltaPageState.totalBalance);
    }

    let html = `
        <!-- All Clients Option -->
        <div class="iolta-client-item ${IoltaPageState.selectedClientId === 'all' ? 'selected' : ''}"
             onclick="selectIoltaClient('all')"
             style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                    background: ${IoltaPageState.selectedClientId === 'all' ? '#eff6ff' : 'transparent'};
                    border-left: 3px solid ${IoltaPageState.selectedClientId === 'all' ? '#3b82f6' : 'transparent'};">
            <div>
                <div style="font-weight: 600; color: #1e293b;">All Clients</div>
                <div style="font-size: 12px; color: #64748b;">${filteredClients.length} clients</div>
            </div>
            <div style="font-weight: 600; color: #1e293b;">${formatCurrency(IoltaPageState.totalBalance)}</div>
        </div>

        <!-- Unassigned/General -->
        <div class="iolta-client-item ${IoltaPageState.selectedClientId === 'general' ? 'selected' : ''}"
             onclick="selectIoltaClient('general')"
             style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                    background: ${IoltaPageState.selectedClientId === 'general' ? '#fef3c7' : '#fffbeb'};
                    border-left: 3px solid ${IoltaPageState.selectedClientId === 'general' ? '#f59e0b' : 'transparent'};">
            <div>
                <div style="font-weight: 500; color: #92400e;">Unassigned</div>
                <div style="font-size: 12px; color: #b45309;">${IoltaPageState.unassignedCount || 0} imports pending</div>
            </div>
            ${IoltaPageState.unassignedCount > 0 ?
                `<span style="background: #f59e0b; color: white; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px;">${IoltaPageState.unassignedCount}</span>` :
                `<span style="font-size: 18px;">📦</span>`
            }
        </div>

        <div style="height: 1px; background: #e2e8f0; margin: 8px 0;"></div>
    `;

    // Client list
    filteredClients.forEach(client => {
        const isSelected = IoltaPageState.selectedClientId === client.id;
        const balance = parseFloat(client.total_balance || 0);
        const balanceColor = balance > 0 ? '#10b981' : balance < 0 ? '#ef4444' : '#64748b';
        // Show client_number (case#) or case_number
        const caseNumber = client.client_number || client.case_number || '';

        html += `
            <div class="iolta-client-item ${isSelected ? 'selected' : ''}"
                 onclick="selectIoltaClient(${client.id})"
                 style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                        background: ${isSelected ? '#eff6ff' : 'transparent'};
                        border-left: 3px solid ${isSelected ? '#3b82f6' : 'transparent'};">
                <div style="min-width: 0; flex: 1;">
                    <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(client.client_name)}
                    </div>
                    ${caseNumber ? `<div style="font-size: 12px; color: #64748b;">#${escapeHtml(caseNumber)}</div>` : ''}
                </div>
                <div style="font-weight: 600; color: ${balanceColor}; margin-left: 12px; white-space: nowrap;">
                    ${formatCurrency(balance)}
                </div>
            </div>
        `;
    });

    if (filteredClients.length === 0 && filter) {
        html += `<div style="padding: 20px; text-align: center; color: #64748b;">No clients match "${escapeHtml(filter)}"</div>`;
    }

    container.innerHTML = html;
}

/**
 * Select a client and load their transactions
 */
async function selectIoltaClient(clientId) {

    IoltaPageState.selectedClientId = clientId;

    // Update sidebar selection
    renderIoltaClientSidebar();

    // Update header info (using correct element IDs from HTML)
    const selectedName = document.getElementById('iolta-selected-name');
    const selectedDetail = document.getElementById('iolta-selected-detail');
    const balanceBar = document.getElementById('iolta-balance-bar');
    const balanceEl = document.getElementById('iolta-client-balance');

    // Show/hide delete button based on client selection
    const deleteBtn = document.getElementById('iolta-delete-client-btn');

    if (clientId === 'all') {
        if (selectedName) selectedName.textContent = 'All Clients';
        if (selectedDetail) selectedDetail.textContent = 'Select a client to view transactions';
        if (balanceBar) balanceBar.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    } else if (clientId === 'general') {
        if (selectedName) selectedName.textContent = 'Unassigned';
        if (selectedDetail) selectedDetail.textContent = 'Bank imports pending assignment';
        if (balanceBar) balanceBar.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    } else {
        const client = IoltaPageState.clients.find(c => c.id == clientId); // Use == for loose comparison

        if (client) {
            if (selectedName) selectedName.textContent = client.client_name;
            if (selectedDetail) selectedDetail.textContent = client.case_number || 'Trust Account';

            if (balanceBar) {
                balanceBar.style.display = 'flex';
                const bal = parseFloat(client.total_balance || 0);
                if (balanceEl) {
                    balanceEl.textContent = formatCurrency(bal);
                    balanceEl.style.color = bal >= 0 ? '#047857' : '#ef4444';
                }
            }

            // Show delete button only for clients with NO transactions
            if (deleteBtn) {
                const txCount = parseInt(client.transaction_count || 0);
                deleteBtn.style.display = txCount === 0 ? 'inline-block' : 'none';
            }
        }
    }

    // Load transactions
    await loadIoltaTransactions(clientId);
}

/**
 * Load transactions for selected client
 */
async function loadIoltaTransactions(clientId) {
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
    const container = document.getElementById('iolta-transactions-list');


    if (!container) {
        console.error('[IOLTA] Container iolta-transactions-list not found!');
        return;
    }

    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Loading...</div>';

    try {
        let transactions = [];

        if (clientId === 'general') {
            // Load unassigned staging items
            const result = await apiGet(`/trust/staging.php?user_id=${userId}&status=unassigned`);
            if (result.success) {
                transactions = (result.data.staging || []).map(s => ({
                    ...s,
                    type: 'staging',
                    isStaging: true
                }));
            }
        } else if (clientId === 'all') {
            // Load all transactions
            const result = await apiGet(`/trust/transactions.php?user_id=${userId}&limit=100`);
            if (result.success) {
                transactions = result.data.transactions || [];
            }
        } else {
            // Load transactions for specific client
            const result = await apiGet(`/trust/transactions.php?user_id=${userId}&client_id=${clientId}&limit=100`);
            if (result.success) {
                transactions = result.data.transactions || [];
            }
        }

        IoltaPageState.transactions = transactions;
        renderIoltaTransactions(transactions, clientId);

    } catch (error) {
        console.error('Error loading transactions:', error);
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #ef4444;">Error loading transactions</div>';
    }
}

/**
 * Render transactions list
 */
function renderIoltaTransactions(transactions, clientId) {
    const container = document.getElementById('iolta-transactions-list');
    if (!container) return;

    // Apply search filter
    const searchTerm = (IoltaPageState.txSearchFilter || '').toLowerCase().trim();
    let filteredTx = transactions;

    if (searchTerm) {
        filteredTx = transactions.filter(tx => {
            const checkNum = (tx.check_number || tx.reference_number || '').toLowerCase();
            const desc = (tx.description || tx.memo || '').toLowerCase();
            const payee = (tx.entity_name || tx.payee_name || tx.payee || '').toLowerCase();
            const amount = Math.abs(parseFloat(tx.amount || 0)).toFixed(2);
            const date = tx.transaction_date || tx.date || '';

            // Search by check number (exact or partial)
            if (checkNum.includes(searchTerm)) return true;
            // Search by amount (exact or partial)
            if (amount.includes(searchTerm)) return true;
            // Search by date
            if (date.includes(searchTerm)) return true;
            // Search by description
            if (desc.includes(searchTerm)) return true;
            // Search by payee
            if (payee.includes(searchTerm)) return true;

            return false;
        });
    }

    // Update search bar elements in HTML
    const isUnassignedView = clientId === 'general';
    const searchInput = document.getElementById('iolta-tx-search');
    const clearBtn = document.getElementById('iolta-clear-search-btn');
    const autoMatchBtn = document.getElementById('iolta-auto-match-btn');
    const txCountEl = document.getElementById('iolta-tx-count');

    if (searchInput) searchInput.value = IoltaPageState.txSearchFilter || '';
    if (clearBtn) clearBtn.style.display = searchTerm ? 'block' : 'none';
    if (autoMatchBtn) autoMatchBtn.style.display = isUnassignedView ? 'block' : 'none';
    if (txCountEl) txCountEl.textContent = `${filteredTx.length} of ${transactions.length}`;

    if (!filteredTx || filteredTx.length === 0) {
        const emptyMessage = searchTerm
            ? `No results for "${escapeHtml(searchTerm)}"`
            : (clientId === 'general'
                ? 'No unassigned bank imports. Use "Import CSV" to import bank statement.'
                : 'No transactions found. Use the buttons above to add deposits or write checks.');

        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #64748b;">
                <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">${searchTerm ? '&#128269;' : '&#128237;'}</div>
                <div style="font-size: 14px; max-width: 300px; margin: 0 auto;">${emptyMessage}</div>
            </div>
        `;
        return;
    }

    // Sort based on IoltaPageState.sortColumn and sortDirection
    const sortColumn = IoltaPageState.sortColumn || 'date';
    const sortDir = IoltaPageState.sortDirection || 'desc';
    const dirMultiplier = sortDir === 'asc' ? 1 : -1;

    const sortedTx = [...filteredTx].sort((a, b) => {
        let aVal, bVal;

        switch (sortColumn) {
            case 'date':
                aVal = new Date(a.transaction_date || a.date || 0).getTime();
                bVal = new Date(b.transaction_date || b.date || 0).getTime();
                break;
            case 'check':
                aVal = (a.check_number || a.reference_number || '').toLowerCase();
                bVal = (b.check_number || b.reference_number || '').toLowerCase();
                break;
            case 'payee':
                aVal = (a.entity_name || a.payee_name || a.payee || '').toLowerCase();
                bVal = (b.entity_name || b.payee_name || b.payee || '').toLowerCase();
                break;
            case 'description':
                aVal = (a.description || a.memo || '').toLowerCase();
                bVal = (b.description || b.memo || '').toLowerCase();
                break;
            case 'amount':
                aVal = parseFloat(a.amount || 0);
                bVal = parseFloat(b.amount || 0);
                break;
            case 'status':
                aVal = (a.status || '').toLowerCase();
                bVal = (b.status || '').toLowerCase();
                break;
            default:
                aVal = new Date(a.transaction_date || a.date || 0).getTime();
                bVal = new Date(b.transaction_date || b.date || 0).getTime();
        }

        if (aVal < bVal) return -1 * dirMultiplier;
        if (aVal > bVal) return 1 * dirMultiplier;
        return 0;
    });

    // Calculate running balance in display order
    let runningBalance = 0;
    const balanceMap = new Map();
    sortedTx.forEach(tx => {
        runningBalance += parseFloat(tx.amount || 0);
        balanceMap.set(tx.id, runningBalance);
    });

    // Use CSS Grid for responsive layout (matches header in HTML)
    let html = '';

    sortedTx.forEach(tx => {
        const date = new Date(tx.transaction_date || tx.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        const amount = parseFloat(tx.amount || 0);
        const isPositive = amount >= 0;
        const amountColor = isPositive ? '#10b981' : '#ef4444';

        // Type based on transaction_type field, fallback to amount
        let typeLabel = '';
        let typeBg = '#e2e8f0';
        let typeColor = '#475569';

        if (tx.isStaging) {
            typeLabel = 'Import';
            typeBg = '#fef3c7';
            typeColor = '#92400e';
        } else if (amount > 0) {
            // Positive = Deposit
            typeLabel = 'Dep';
            typeBg = '#dcfce7';
            typeColor = '#166534';
        } else {
            // Negative = Use transaction_type
            const txType = tx.transaction_type || 'payout';
            const typeMap = {
                'payout': { label: 'Payout', bg: '#fee2e2', color: '#991b1b' },
                'disbursement': { label: 'Payout', bg: '#fee2e2', color: '#991b1b' },
                'legal_fee': { label: 'Legal Fee', bg: '#fefce8', color: '#854d0e' },
                'earned_fee': { label: 'Legal Fee', bg: '#fefce8', color: '#854d0e' },
                'cost': { label: 'Cost', bg: '#fff7ed', color: '#c2410c' },
                'bill': { label: 'Bill', bg: '#fef3c7', color: '#b45309' },
                'transfer_out': { label: 'Transfer', bg: '#eff6ff', color: '#1d4ed8' }
            };
            const typeInfo = typeMap[txType] || { label: 'Payout', bg: '#fee2e2', color: '#991b1b' };
            typeLabel = typeInfo.label;
            typeBg = typeInfo.bg;
            typeColor = typeInfo.color;
        }

        let statusHtml = '';
        if (tx.isStaging) {
            statusHtml = `<span style="padding: 2px 6px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 10px; font-weight: 500;">Pend</span>`;
        } else if (tx.status === 'cleared' || tx.is_cleared || tx.cleared) {
            statusHtml = `<span style="padding: 2px 6px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 10px; font-weight: 500;">Clr</span>`;
        } else if (tx.status === 'printed') {
            statusHtml = `<span style="padding: 2px 6px; background: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 10px; font-weight: 500;">Prt</span>`;
        } else {
            statusHtml = `<span style="padding: 2px 6px; background: #f1f5f9; color: #64748b; border-radius: 4px; font-size: 10px; font-weight: 500;">Pend</span>`;
        }

        // Check number column (check_number for transactions, reference_number for staging)
        const checkNumber = tx.check_number || tx.reference_number || '';

        // Payee name (entity_name or payee_name from transaction)
        const payeeName = tx.entity_name || tx.payee_name || tx.payee || '';

        // Clean description - remove redundant "Check #XXXX to [Payee] - " prefix
        let description = tx.description || tx.memo || '';
        // Pattern: "Check #XXXX to Some Name - " or "Check #XXXX to Some Name, LLC - "
        description = description.replace(/^Check\s*#\d+\s+to\s+[^-]+\s*-\s*/i, '');
        // Also remove standalone "Check #XXXX to Payee Name" if no memo follows
        description = description.replace(/^Check\s*#\d+\s+to\s+.+$/i, '') || description;
        description = description.trim() || '—';

        // Get calculated balance or use provided
        const displayBalance = balanceMap.get(tx.id) ?? tx.running_balance;

        // Use CSS Grid row matching header columns (9 columns: checkbox, date, check#, payee, type, description, amount, balance, status)
        html += `
            <div class="iolta-tx-row" onclick="viewIoltaTransaction(${tx.id}, ${tx.isStaging || false})">
                <div class="iolta-col-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" class="iolta-tx-checkbox" data-id="${tx.id}" data-staging="${tx.isStaging || false}" onchange="updateIoltaBulkActions()">
                </div>
                <div class="iolta-col-date">${date}</div>
                <div class="iolta-col-checknum">${checkNumber}</div>
                <div class="iolta-col-payee" title="${escapeHtml(payeeName)}">${escapeHtml(payeeName) || '—'}</div>
                <div class="iolta-col-type">
                    <span class="iolta-type-badge" style="background: ${typeBg}; color: ${typeColor};">${typeLabel}</span>
                </div>
                <div class="iolta-col-desc">${escapeHtml(description)}</div>
                <div class="iolta-col-amount" style="color: ${amountColor};">${isPositive ? '+' : ''}${formatCurrency(amount)}</div>
                <div class="iolta-col-balance">${displayBalance !== undefined ? formatCurrency(displayBalance) : '—'}</div>
                <div class="iolta-col-status">${statusHtml}</div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Update bulk actions visibility
    updateIoltaBulkActions();
}

/**
 * Filter clients by search
 */
function filterIoltaClients() {
    const input = document.getElementById('iolta-client-search');
    IoltaPageState.searchFilter = input ? input.value : '';
    renderIoltaClientSidebar();
}

/**
 * Filter transactions by search term
 */
function filterIoltaTransactions(searchTerm) {
    IoltaPageState.txSearchFilter = searchTerm;
    renderIoltaTransactions(IoltaPageState.transactions, IoltaPageState.selectedClientId);

    // Restore focus to search input after re-render
    const input = document.getElementById('iolta-tx-search');
    if (input) {
        input.focus();
        // Move cursor to end of input
        const len = input.value.length;
        input.setSelectionRange(len, len);
    }
}

/**
 * Clear transaction search
 */
function clearIoltaTxSearch() {
    IoltaPageState.txSearchFilter = '';
    const input = document.getElementById('iolta-tx-search');
    if (input) input.value = '';
    renderIoltaTransactions(IoltaPageState.transactions, IoltaPageState.selectedClientId);
}

/**
 * Sort IOLTA table by column
 */
function sortIoltaTable(column) {
    // Toggle direction if clicking same column
    if (IoltaPageState.sortColumn === column) {
        IoltaPageState.sortDirection = IoltaPageState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        IoltaPageState.sortColumn = column;
        IoltaPageState.sortDirection = 'desc'; // Default to descending for new column
    }

    // Update sort icons
    updateSortIcons();

    // Re-render with new sort
    renderIoltaTransactions(IoltaPageState.transactions, IoltaPageState.selectedClientId);
}

/**
 * Update sort icons in table header
 */
function updateSortIcons() {
    const columns = ['date', 'check', 'payee', 'description', 'amount', 'status'];
    columns.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (icon) {
            if (IoltaPageState.sortColumn === col) {
                icon.textContent = IoltaPageState.sortDirection === 'asc' ? '▲' : '▼';
                icon.style.opacity = '1';
            } else {
                icon.textContent = '';
                icon.style.opacity = '0.3';
            }
        }
    });
}

/**
 * Run auto-match for unassigned bank imports
 * Finds matching transactions based on check number, amount, and date
 */
async function runAutoMatch() {
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
    const accountId = IoltaPageState.trustAccountId;

    if (!accountId) {
        showToast('No trust account found', 'error');
        return;
    }

    // Show loading
    const btn = document.querySelector('button[onclick="runAutoMatch()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Matching...';
    }

    try {
        const result = await apiPost('/trust/staging.php', {
            action: 'auto_match',
            user_id: userId,
            account_id: accountId
        });

        if (result.success) {
            const data = result.data;
            const matchCount = data.match_count || 0;
            const unmatchedCount = data.unmatched_count || 0;

            if (matchCount > 0) {
                // Show match review modal
                showAutoMatchResults(data.matches, data.unmatched);
            } else {
                showToast(`No matches found. ${unmatchedCount} items remain unassigned.`, 'info');
            }
        } else {
            showToast(result.message || 'Auto-match failed', 'error');
        }
    } catch (error) {
        console.error('Auto-match error:', error);
        showToast('Auto-match failed: ' + error.message, 'error');
    } finally {
        // Restore button
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🔗</span> Auto-Match';
        }
    }
}

/**
 * Show auto-match results in a modal for review
 */
function showAutoMatchResults(matches, unmatched) {
    const modal = document.createElement('div');
    modal.id = 'auto-match-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;';

    let matchRows = '';
    matches.forEach((m, idx) => {
        const staging = m.staging;
        const tx = m.transaction;
        const score = m.match_score;
        const type = m.match_type;

        const scoreColor = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
        const typeLabel = type === 'check_number' ? 'Check #' : type === 'amount_date' ? 'Amount+Date' : 'Amount';

        matchRows += `
            <tr data-staging-id="${staging.id}" data-transaction-id="${tx.id}">
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <input type="checkbox" class="match-checkbox" checked data-staging-id="${staging.id}" data-transaction-id="${tx.id}">
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <div style="font-weight: 500;">${escapeHtml(staging.description)}</div>
                    <div style="font-size: 12px; color: #64748b;">
                        ${staging.transaction_date} | ${formatCurrency(staging.amount)} | Ref: ${staging.reference_number || '-'}
                    </div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                    <span style="font-size: 20px;">→</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <div style="font-weight: 500;">${escapeHtml(tx.client_name || 'Unknown')}</div>
                    <div style="font-size: 12px; color: #64748b;">
                        ${tx.transaction_date} | ${formatCurrency(tx.amount)} | Check #${tx.check_number || '-'}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(tx.description || '')}</div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                    <span style="display: inline-block; padding: 4px 8px; background: ${scoreColor}20; color: ${scoreColor}; border-radius: 4px; font-size: 12px; font-weight: 600;">
                        ${score}%
                    </span>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">${typeLabel}</div>
                </td>
            </tr>
        `;
    });

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 95%; max-width: 900px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Review Auto-Matches</h2>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">
                        Found ${matches.length} potential matches. Select which to approve.
                    </p>
                </div>
                <button onclick="closeAutoMatchModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>

            <div style="flex: 1; overflow-y: auto; padding: 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8fafc; position: sticky; top: 0;">
                        <tr>
                            <th style="padding: 12px; text-align: left; font-weight: 500; font-size: 12px; color: #64748b; width: 40px;">
                                <input type="checkbox" id="select-all-matches" checked onchange="toggleAllMatches(this)">
                            </th>
                            <th style="padding: 12px; text-align: left; font-weight: 500; font-size: 12px; color: #64748b;">Bank Import</th>
                            <th style="padding: 12px; text-align: center; font-weight: 500; font-size: 12px; color: #64748b; width: 40px;"></th>
                            <th style="padding: 12px; text-align: left; font-weight: 500; font-size: 12px; color: #64748b;">Existing Transaction</th>
                            <th style="padding: 12px; text-align: center; font-weight: 500; font-size: 12px; color: #64748b; width: 80px;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matchRows}
                    </tbody>
                </table>
            </div>

            ${unmatched.length > 0 ? `
                <div style="padding: 12px 20px; background: #fef3c7; border-top: 1px solid #fcd34d;">
                    <span style="font-size: 13px; color: #92400e;">
                        &#9888; ${unmatched.length} imports have no matches and will remain unassigned.
                    </span>
                </div>
            ` : ''}

            <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button onclick="closeAutoMatchModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; cursor: pointer;">
                    Cancel
                </button>
                <button onclick="approveSelectedMatches()" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
                    Approve Selected
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Close auto-match modal
 */
function closeAutoMatchModal() {
    const modal = document.getElementById('auto-match-modal');
    if (modal) modal.remove();
}

/**
 * Toggle all match checkboxes
 */
function toggleAllMatches(checkbox) {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

/**
 * Approve selected matches
 */
async function approveSelectedMatches() {
    const checkboxes = document.querySelectorAll('.match-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No matches selected', 'warning');
        return;
    }

    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
    let successCount = 0;
    let errorCount = 0;

    // Disable button
    const btn = document.querySelector('button[onclick="approveSelectedMatches()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing...';
    }

    for (const cb of checkboxes) {
        const stagingId = cb.dataset.stagingId;
        const transactionId = cb.dataset.transactionId;

        try {
            const result = await apiPost('/trust/staging.php', {
                action: 'match',
                staging_id: parseInt(stagingId),
                transaction_id: parseInt(transactionId),
                user_id: userId
            });

            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Match failed:', result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Match error:', error);
        }
    }

    closeAutoMatchModal();

    if (successCount > 0) {
        showToast(`${successCount} transactions matched successfully!`, 'success');
        // Refresh all related UI
        await selectIoltaClient('general');
        await refreshIoltaUI({ ledgers: true, transactions: true, sidebar: true });
    }
    if (errorCount > 0) {
        showToast(`${errorCount} matches failed`, 'error');
    }
}

/**
 * Toggle select all checkboxes
 */
function toggleIoltaSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.iolta-tx-checkbox');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    updateIoltaBulkActions();
}

/**
 * Update bulk actions bar visibility
 */
function updateIoltaBulkActions() {
    const bulkBar = document.getElementById('iolta-bulk-actions');
    const checkboxes = document.querySelectorAll('.iolta-tx-checkbox:checked');
    const countEl = document.getElementById('iolta-selected-count');
    const editBtn = document.getElementById('iolta-edit-btn');
    const clearStatusBtn = document.getElementById('iolta-clear-status-btn');

    if (bulkBar) {
        bulkBar.style.display = checkboxes.length > 0 ? 'flex' : 'none';
    }
    if (countEl) {
        countEl.textContent = `${checkboxes.length} selected`;
    }
    // Show edit button only when exactly 1 item is selected
    if (editBtn) {
        editBtn.style.display = checkboxes.length === 1 ? 'inline-block' : 'none';
    }

    // Show Clear button only if any selected transaction has pending status
    if (clearStatusBtn) {
        const hasPending = Array.from(checkboxes).some(cb => {
            const row = cb.closest('.iolta-tx-row');
            if (!row) return false;
            const statusEl = row.querySelector('.iolta-col-status');
            if (!statusEl) return false;
            const statusText = statusEl.textContent.trim().toLowerCase();
            return statusText === 'pend' || statusText === 'pending';
        });
        clearStatusBtn.style.display = hasPending ? 'inline-block' : 'none';
    }
}

/**
 * Clear all selected checkboxes
 */
function clearIoltaSelection() {
    const checkboxes = document.querySelectorAll('.iolta-tx-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    const selectAll = document.getElementById('iolta-select-all');
    if (selectAll) selectAll.checked = false;
    updateIoltaBulkActions();
}

/**
 * Get selected transaction IDs
 */
function getSelectedIoltaTxIds() {
    const checkboxes = document.querySelectorAll('.iolta-tx-checkbox:checked');
    return Array.from(checkboxes).map(cb => ({
        id: parseInt(cb.dataset.id),
        isStaging: cb.dataset.staging === 'true'
    }));
}

/**
 * Open move to client modal
 */
async function openIoltaMoveModal() {
    const selected = getSelectedIoltaTxIds();
    if (selected.length === 0) {
        alert('Please select transactions to move.');
        return;
    }

    // Try to get clients from state first, otherwise fetch from API
    let clients = (IoltaPageState.clients && IoltaPageState.clients.length > 0)
        ? IoltaPageState.clients
        : (ioltaState.clients && ioltaState.clients.length > 0)
            ? ioltaState.clients
            : [];

    // If still no clients, fetch from API
    if (clients.length === 0) {
        const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
        try {
            const result = await apiGet(`/trust/clients.php?user_id=${userId}`);
            if (result.success && result.data.clients) {
                clients = result.data.clients;
                IoltaPageState.clients = clients; // Cache for future use
            }
        } catch (e) {
            console.error('Failed to load clients:', e);
        }
    }

    const searchableSelect = createSearchableClientSelect('move-client-select', 'target_client_id', clients, 'Search clients...', false);

    const modalHtml = `
        <div id="iolta-move-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
            <div class="modal" style="background: white; border-radius: 16px; width: 700px; max-width: 95%; max-height: 90vh; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 24px 32px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 22px; font-weight: 600;">Move ${selected.length} Transaction(s)</h3>
                    <button onclick="closeIoltaModal('iolta-move-modal')" style="background: none; border: none; font-size: 32px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 24px 32px 32px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 12px; font-size: 16px;">Move to Client</label>
                    ${searchableSelect}
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 32px;">
                        <button onclick="closeIoltaModal('iolta-move-modal')" style="padding: 14px 28px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 16px;">Cancel</button>
                        <button onclick="executeMoveToClient()" style="padding: 14px 28px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 16px;">Move</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Execute move to client
 */
async function executeMoveToClient() {
    const targetClientId = document.getElementById('move-client-select-value').value;
    if (!targetClientId) {
        alert('Please select a target client.');
        return;
    }

    const selected = getSelectedIoltaTxIds();
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    try {
        // Move each transaction
        for (const item of selected) {
            if (item.isStaging) {
                // Move staging record
                await apiPost('/trust/staging.php', {
                    action: 'assign',
                    ids: [item.id],
                    client_id: targetClientId,
                    user_id: userId
                });
            } else {
                // Move trust transaction
                await apiPost('/trust/transactions.php', {
                    action: 'move_to_client',
                    transaction_ids: [item.id],
                    target_client_id: parseInt(targetClientId),
                    user_id: userId
                });
            }
        }

        showToast(`${selected.length} transaction(s) moved successfully`, 'success');
        closeIoltaModal('iolta-move-modal');
        clearIoltaSelection();
        await loadIoltaPage();
    } catch (error) {
        console.error('Error moving transactions:', error);
        showToast('Error moving transactions', 'error');
    }
}

/**
 * Delete selected transactions
 */
async function deleteSelectedIoltaTx() {
    const selected = getSelectedIoltaTxIds();
    if (selected.length === 0) {
        alert('Please select transactions to delete.');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selected.length} transaction(s)?\n\nThis action cannot be undone.`)) {
        return;
    }

    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    try {
        const stagingIds = selected.filter(s => s.isStaging).map(s => s.id);
        const txIds = selected.filter(s => !s.isStaging).map(s => s.id);

        // Delete staging records
        if (stagingIds.length > 0) {
            await apiPost('/trust/staging.php', {
                action: 'delete',
                ids: stagingIds,
                user_id: userId
            });
        }

        // Delete trust transactions
        if (txIds.length > 0) {
            await apiPost('/trust/transactions.php', {
                action: 'bulk_delete',
                transaction_ids: txIds,
                user_id: userId
            });
        }

        showToast(`${selected.length} transaction(s) deleted`, 'success');
        clearIoltaSelection();
        await loadIoltaPage();
    } catch (error) {
        console.error('Error deleting transactions:', error);
        showToast('Error deleting transactions', 'error');
    }
}

/**
 * Edit selected transaction (single only)
 */
function editSelectedIoltaTx() {
    const selected = getSelectedIoltaTxIds();
    if (selected.length !== 1) {
        alert('Please select exactly one transaction to edit.');
        return;
    }

    const item = selected[0];
    viewIoltaTransaction(item.id, item.isStaging);
}

/**
 * Open deposit modal with client pre-selected
 */
function openIoltaDepositModal() {
    // Always use searchable modal, but pre-select client if one is selected
    openTrustDepositModalGeneric();
}

/**
 * Generic deposit modal with client dropdown
 */
async function openTrustDepositModalGeneric() {
    // Try to get clients from state first, otherwise fetch from API
    let clients = (IoltaPageState.clients && IoltaPageState.clients.length > 0)
        ? IoltaPageState.clients
        : (ioltaState.clients && ioltaState.clients.length > 0)
            ? ioltaState.clients
            : [];

    // If still no clients, fetch from API
    if (clients.length === 0) {
        const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
        try {
            const result = await apiGet(`/trust/clients.php?user_id=${userId}`);
            if (result.success && result.data.clients) {
                clients = result.data.clients;
                IoltaPageState.clients = clients; // Cache for future use
            }
        } catch (e) {
            console.error('Failed to load clients:', e);
        }
    }

    const searchableSelect = createSearchableClientSelect('deposit-client-select', 'client_id', clients, 'Search clients...', true);

    const modalHtml = `
        <div id="iolta-deposit-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Record Deposit</h3>
                    <button onclick="closeIoltaModal('iolta-deposit-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-deposit-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client *</label>
                        ${searchableSelect}
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" name="amount" step="0.01" min="0.01" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                        <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Client retainer, settlement, etc.">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-deposit-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Record Deposit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Auto-select current client if one is selected
    const selectedClientId = IoltaPageState.selectedClientId;
    if (selectedClientId && selectedClientId !== 'all' && selectedClientId !== 'general') {
        const client = clients.find(c => c.id === selectedClientId);
        if (client) {
            const searchInput = document.getElementById('deposit-client-select-search');
            const hiddenInput = document.getElementById('deposit-client-select-value');
            if (searchInput && hiddenInput) {
                searchInput.value = client.client_name + (client.case_number ? ` (${client.case_number})` : '');
                hiddenInput.value = client.id;
            }
        }
    }

    document.getElementById('iolta-deposit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitIoltaDeposit(e.target);
    });
}

/**
 * Fallback deposit modal with client pre-selected (kept for compatibility)
 */
function openTrustDepositModalWithClient(clientId, clientName) {
    const modalHtml = `
        <div id="iolta-deposit-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Record Deposit</h3>
                    <button onclick="closeIoltaModal('iolta-deposit-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-deposit-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client</label>
                        <input type="text" value="${escapeHtml(clientName)}" disabled
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; color: #6b7280;">
                        <input type="hidden" name="client_id" value="${clientId}">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" name="amount" step="0.01" min="0.01" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                        <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Client retainer, settlement, etc.">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-deposit-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Record Deposit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('iolta-deposit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitIoltaDeposit(e.target);
    });
}

/**
 * Submit deposit
 */
async function submitIoltaDeposit(form) {
    const formData = new FormData(form);
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    const data = {
        user_id: userId,
        client_id: formData.get('client_id'),
        amount: parseFloat(formData.get('amount')),
        transaction_date: formData.get('transaction_date'),
        description: formData.get('description') || 'Deposit',
        transaction_type: 'deposit'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            showToast('Deposit recorded successfully', 'success');
            closeIoltaModal('iolta-deposit-modal');
            await loadIoltaPage(); // Refresh
        } else {
            showToast(result.message || 'Error recording deposit', 'error');
        }
    } catch (error) {
        showToast('Error recording deposit', 'error');
    }
}

/**
 * Open check modal with client pre-selected
 */
function openIoltaCheckModal() {
    // Always use searchable modal, but pre-select client if one is selected
    openTrustCheckModalGeneric();
}

/**
 * Generic check modal with client dropdown
 */
function openTrustCheckModalGeneric() {
    const modalHtml = `
        <div id="iolta-check-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Write Check</h3>
                    <button onclick="closeIoltaModal('iolta-check-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-check-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px; position: relative;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client *</label>
                        <input type="text" id="iolta-check-client-search" required autocomplete="off"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;"
                               placeholder="Search client by name or case number...">
                        <input type="hidden" name="client_id" id="iolta-check-client-id">
                        <div id="iolta-check-client-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10000;"></div>
                        <div id="iolta-check-client-balance" style="display: none; margin-top: 6px; padding: 8px 12px; background: #ecfdf5; border-radius: 6px; font-size: 13px; color: #065f46;"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Check # *</label>
                            <input type="text" name="check_number" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px; position: relative;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Pay To *</label>
                        <input type="text" name="payee" id="iolta-check-payee-generic" required autocomplete="off"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Search vendors, customers, employees...">
                        <input type="hidden" name="entity_id" id="iolta-check-entity-id-generic">
                        <div id="iolta-check-payee-dropdown-generic" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10000;"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Type *</label>
                            <select name="transaction_type" required style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: white;">
                                <option value="">Select type...</option>
                                <option value="payout">Client Payout</option>
                                <option value="legal_fee">Legal Fee</option>
                                <option value="cost">Cost</option>
                                <option value="bill">Bill</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Memo</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Payment purpose">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-check-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="button" onclick="saveCheckOnly()"
                                style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            &#128190; Save
                        </button>
                        <button type="button" onclick="printCheckWithConfirm()"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            &#128424; Print
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Setup client search autocomplete
    setupClientSearchAutocomplete();

    // Setup payee autocomplete
    setupPayeeAutocomplete('iolta-check-payee-generic', 'iolta-check-payee-dropdown-generic', 'iolta-check-entity-id-generic');
}

/**
 * Setup client search autocomplete for check modal
 */
function setupClientSearchAutocomplete() {
    const input = document.getElementById('iolta-check-client-search');
    const dropdown = document.getElementById('iolta-check-client-dropdown');
    const hiddenInput = document.getElementById('iolta-check-client-id');
    const balanceDiv = document.getElementById('iolta-check-client-balance');

    if (!input || !dropdown) return;

    const clients = IoltaPageState.clients || [];

    // Auto-select current client if one is selected
    const selectedClientId = IoltaPageState.selectedClientId;
    if (selectedClientId && selectedClientId !== 'all' && selectedClientId !== 'general') {
        const client = clients.find(c => c.id === selectedClientId);
        if (client) {
            const balance = parseFloat(client.total_balance || 0);
            input.value = client.client_name;
            hiddenInput.value = client.id;

            // Show balance
            if (balanceDiv) {
                balanceDiv.innerHTML = `Available Balance: <strong>${formatCurrency(balance)}</strong>`;
                balanceDiv.style.display = 'block';
            }

            // Update amount max
            const amountInput = document.querySelector('#iolta-check-form [name="amount"]');
            if (amountInput) {
                amountInput.max = balance;
            }
        }
    }

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();

        if (query.length < 1) {
            dropdown.style.display = 'none';
            return;
        }

        const filtered = clients.filter(c => {
            const name = (c.client_name || '').toLowerCase();
            const caseNum = (c.case_number || '').toLowerCase();
            return name.includes(query) || caseNum.includes(query);
        }).slice(0, 10);

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div style="padding: 12px; color: #94a3b8; text-align: center;">No clients found</div>';
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = filtered.map(c => {
            const balance = parseFloat(c.total_balance || 0);
            return `
                <div class="client-option" data-id="${c.id}" data-name="${escapeHtml(c.client_name)}" data-balance="${balance}"
                     style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
                     onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                    <div>
                        <div style="font-weight: 500; color: #1e293b;">${escapeHtml(c.client_name)}</div>
                        ${c.case_number ? `<div style="font-size: 12px; color: #94a3b8;">${escapeHtml(c.case_number)}</div>` : ''}
                    </div>
                    <div style="font-weight: 500; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">${formatCurrency(balance)}</div>
                </div>
            `;
        }).join('');

        dropdown.style.display = 'block';

        // Add click handlers
        dropdown.querySelectorAll('.client-option').forEach(option => {
            option.addEventListener('click', () => {
                const id = option.dataset.id;
                const name = option.dataset.name;
                const balance = parseFloat(option.dataset.balance);

                input.value = name;
                hiddenInput.value = id;
                dropdown.style.display = 'none';

                // Show balance
                if (balanceDiv) {
                    balanceDiv.innerHTML = `Available Balance: <strong>${formatCurrency(balance)}</strong>`;
                    balanceDiv.style.display = 'block';
                }

                // Update amount max
                const amountInput = document.querySelector('#iolta-check-form [name="amount"]');
                if (amountInput) {
                    amountInput.max = balance;
                }
            });
        });
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
}

/**
 * Check modal with pre-selected client
 */
function openTrustCheckModalWithClient(clientId, clientName) {
    const client = IoltaPageState.clients.find(c => c.id === clientId);
    const balance = client ? parseFloat(client.total_balance || 0) : 0;

    const modalHtml = `
        <div id="iolta-check-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Write Check</h3>
                        <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Available: ${formatCurrency(balance)}</p>
                    </div>
                    <button onclick="closeIoltaModal('iolta-check-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-check-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client</label>
                        <input type="text" value="${escapeHtml(clientName)}" disabled
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; color: #6b7280;">
                        <input type="hidden" name="client_id" value="${clientId}">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Check # *</label>
                            <input type="text" name="check_number" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" max="${balance}" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px; position: relative;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Pay To *</label>
                        <input type="text" name="payee" id="iolta-check-payee-client" required autocomplete="off"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Search vendors, customers, employees...">
                        <input type="hidden" name="entity_id" id="iolta-check-entity-id-client">
                        <div id="iolta-check-payee-dropdown-client" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10000;"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Type *</label>
                            <select name="transaction_type" required style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: white;">
                                <option value="">Select type...</option>
                                <option value="payout">Client Payout</option>
                                <option value="legal_fee">Legal Fee</option>
                                <option value="cost">Cost</option>
                                <option value="bill">Bill</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Memo</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Payment purpose">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-check-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="button" onclick="saveCheckOnly()"
                                style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            &#128190; Save
                        </button>
                        <button type="button" onclick="printCheckWithConfirm()"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            &#128424; Print
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Setup payee autocomplete
    setupPayeeAutocomplete('iolta-check-payee-client', 'iolta-check-payee-dropdown-client', 'iolta-check-entity-id-client');
}

/**
 * Submit check
 */
async function submitIoltaCheck(form) {
    const formData = new FormData(form);
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
    const payee = formData.get('payee');
    const memo = formData.get('description') || '';

    const data = {
        user_id: userId,
        client_id: formData.get('client_id'),
        amount: -Math.abs(parseFloat(formData.get('amount'))), // Negative for withdrawal
        transaction_date: formData.get('transaction_date'),
        description: memo || `Check to ${payee}`, // API requires non-empty description
        payee: payee,
        check_number: formData.get('check_number'),
        transaction_type: formData.get('transaction_type') || 'disbursement'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            showToast('Check recorded successfully', 'success');
            closeIoltaModal('iolta-check-modal');
            await loadIoltaPage();
        } else {
            showToast(result.message || 'Error recording check', 'error');
        }
    } catch (error) {
        showToast('Error recording check', 'error');
    }
}

/**
 * Save check only (no print)
 */
async function saveCheckOnly() {
    const form = document.getElementById('iolta-check-form');
    if (!form) return;

    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    await submitIoltaCheck(form);
}
window.saveCheckOnly = saveCheckOnly;

/**
 * Print check with confirmation modal
 */
function printCheckWithConfirm() {
    const form = document.getElementById('iolta-check-form');
    if (!form) return;

    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const formData = new FormData(form);
    const checkNumber = formData.get('check_number');
    const amount = parseFloat(formData.get('amount'));
    const payee = formData.get('payee');
    const transactionDate = formData.get('transaction_date');
    const description = formData.get('description') || '';

    // Show confirmation modal
    const confirmModal = document.createElement('div');
    confirmModal.id = 'check-confirm-modal';
    confirmModal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10001; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 16px; padding: 28px; width: 420px; max-width: 90vw; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 56px; height: 56px; background: #fef3c7; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <span style="font-size: 28px;">&#128424;</span>
                    </div>
                    <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #1e293b;">Confirm Check Details</h3>
                    <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">Please verify before printing</p>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Check Number</label>
                        <input type="text" id="confirm-check-number" value="${escapeHtml(checkNumber)}"
                               style="width: 100%; padding: 10px 12px; border: 2px solid #6366f1; border-radius: 8px; font-size: 18px; font-weight: 600; text-align: center;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Amount</label>
                            <div style="font-weight: 600; color: #ef4444; font-size: 16px;">${formatCurrency(amount)}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Date</label>
                            <div style="font-weight: 500; color: #1e293b;">${transactionDate}</div>
                        </div>
                    </div>
                    <div style="margin-top: 12px;">
                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Pay To</label>
                        <div style="font-weight: 500; color: #1e293b;">${escapeHtml(payee)}</div>
                    </div>
                    ${description ? `
                    <div style="margin-top: 12px;">
                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Memo</label>
                        <div style="color: #64748b;">${escapeHtml(description)}</div>
                    </div>
                    ` : ''}
                </div>

                <div style="display: flex; gap: 12px;">
                    <button onclick="closeCheckConfirmModal()"
                            style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
                        Cancel
                    </button>
                    <button onclick="confirmAndPrintCheck()"
                            style="flex: 1; padding: 12px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
                        Confirm & Print
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModal);
}
window.printCheckWithConfirm = printCheckWithConfirm;

/**
 * Close check confirmation modal
 */
function closeCheckConfirmModal() {
    const modal = document.getElementById('check-confirm-modal');
    if (modal) modal.remove();
}
window.closeCheckConfirmModal = closeCheckConfirmModal;

/**
 * Confirm and print check - saves to ledger then prints
 */
async function confirmAndPrintCheck() {
    const form = document.getElementById('iolta-check-form');
    if (!form) return;

    // Get the possibly edited check number from confirm modal
    const confirmedCheckNumber = document.getElementById('confirm-check-number')?.value;

    // Update the original form's check number
    const checkNumberInput = form.querySelector('[name="check_number"]');
    if (checkNumberInput && confirmedCheckNumber) {
        checkNumberInput.value = confirmedCheckNumber;
    }

    const formData = new FormData(form);
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    const payee = formData.get('payee');
    const memo = formData.get('description') || '';

    const data = {
        user_id: userId,
        client_id: formData.get('client_id'),
        amount: -Math.abs(parseFloat(formData.get('amount'))), // Negative for withdrawal
        transaction_date: formData.get('transaction_date'),
        description: memo || `Check to ${payee}`, // API requires non-empty description
        payee: payee,
        check_number: confirmedCheckNumber || formData.get('check_number'),
        transaction_type: formData.get('transaction_type') || 'disbursement'
    };

    try {
        // Save to ledger first
        const result = await apiPost('/trust/transactions.php', data);

        if (result.success) {
            showToast('Check saved to ledger', 'success');

            // Close modals
            closeCheckConfirmModal();
            closeIoltaModal('iolta-check-modal');

            // Get client info for printing
            const clientId = formData.get('client_id');
            const client = IoltaPageState.clients?.find(c => c.id == clientId);

            // Prepare check data for printing
            const checkData = {
                checkNumber: confirmedCheckNumber || formData.get('check_number'),
                date: formData.get('transaction_date'),
                payee: formData.get('payee'),
                amount: Math.abs(parseFloat(formData.get('amount'))),
                memo: formData.get('description') || '',
                clientName: client?.client_name || '',
                transactionId: result.data?.id || result.data?.transaction_id
            };

            // Open print dialog
            printTrustCheck(checkData);

            // Update status to 'printed'
            const transactionId = result.data?.transaction?.id || result.data?.id;
            if (transactionId) {
                try {
                    await apiPost('/trust/transactions.php', {
                        action: 'update',
                        id: transactionId,
                        user_id: userId,
                        status: 'printed'
                    });
                } catch (statusError) {
                    console.error('Failed to update status to printed:', statusError);
                }
            }

            // Reload page data
            await loadIoltaPage();
        } else {
            showToast(result.message || 'Error saving check', 'error');
        }
    } catch (error) {
        console.error('Error saving check:', error);
        showToast('Error saving check', 'error');
    }
}
window.confirmAndPrintCheck = confirmAndPrintCheck;

/**
 * Print trust check
 */
function printTrustCheck(checkData) {
    const { checkNumber, date, payee, amount, memo, clientName } = checkData;

    // Convert amount to words
    const amountInWords = numberToWords(amount);

    // Format date
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // Create print window
    const printWindow = window.open('', '_blank', 'width=900,height=500');

    if (!printWindow) {
        showToast('Pop-up blocked. Please allow pop-ups for this site.', 'error');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Check #${checkNumber}</title>
            <style>
                @page { size: 8.5in 3.67in; margin: 0; }
                body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; }
                .check {
                    width: 8in;
                    height: 3.5in;
                    border: 1px solid #ccc;
                    padding: 20px;
                    position: relative;
                    background: linear-gradient(135deg, #fefefe 0%, #f5f5f5 100%);
                }
                .check-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                }
                .bank-info {
                    font-size: 12px;
                    line-height: 1.4;
                }
                .check-number {
                    font-size: 14px;
                    font-weight: bold;
                }
                .date-line {
                    text-align: right;
                    margin-bottom: 20px;
                }
                .payee-line {
                    display: flex;
                    align-items: baseline;
                    margin-bottom: 15px;
                    gap: 10px;
                }
                .payee-label { font-size: 12px; }
                .payee-value {
                    flex: 1;
                    border-bottom: 1px solid #000;
                    padding-bottom: 2px;
                    font-size: 14px;
                }
                .amount-box {
                    border: 2px solid #000;
                    padding: 5px 10px;
                    font-size: 16px;
                    font-weight: bold;
                    min-width: 120px;
                    text-align: right;
                }
                .amount-words {
                    display: flex;
                    align-items: baseline;
                    margin-bottom: 20px;
                    gap: 10px;
                }
                .amount-words-value {
                    flex: 1;
                    border-bottom: 1px solid #000;
                    padding-bottom: 2px;
                    font-size: 12px;
                }
                .memo-line {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin-top: 30px;
                }
                .memo-label { font-size: 11px; }
                .memo-value {
                    flex: 1;
                    border-bottom: 1px solid #000;
                    padding-bottom: 2px;
                    font-size: 12px;
                }
                .signature-line {
                    position: absolute;
                    bottom: 30px;
                    right: 40px;
                    width: 200px;
                    border-top: 1px solid #000;
                    padding-top: 5px;
                    text-align: center;
                    font-size: 10px;
                }
                .micr-line {
                    position: absolute;
                    bottom: 10px;
                    left: 20px;
                    font-family: 'MICR', 'Courier New', monospace;
                    font-size: 12px;
                    letter-spacing: 2px;
                }
                @media print {
                    body { padding: 0; }
                    .check { border: none; }
                }
            </style>
        </head>
        <body>
            <div class="check">
                <div class="check-header">
                    <div class="bank-info">
                        <strong>BRIDGE LAW & ASSOCIATES, PLLC</strong><br>
                        IOLTA Trust Account<br>
                        555 Main Street, Suite 200<br>
                        City, State 12345
                    </div>
                    <div class="check-number">${checkNumber}</div>
                </div>

                <div class="date-line">
                    <span>Date: </span>
                    <span style="border-bottom: 1px solid #000; padding: 0 40px;">${formattedDate}</span>
                </div>

                <div class="payee-line">
                    <span class="payee-label">PAY TO THE<br>ORDER OF</span>
                    <span class="payee-value">${escapeHtml(payee)}</span>
                    <div class="amount-box">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>

                <div class="amount-words">
                    <span class="amount-words-value">${amountInWords} DOLLARS</span>
                </div>

                <div class="memo-line">
                    <span class="memo-label">MEMO</span>
                    <span class="memo-value">${escapeHtml(memo)}${clientName ? ' - ' + escapeHtml(clientName) : ''}</span>
                </div>

                <div class="signature-line">Authorized Signature</div>

                <div class="micr-line">
                    ⑆${checkNumber}⑆ ⑈123456789⑈ 9876543210⑆
                </div>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `);

    printWindow.document.close();
}
window.printTrustCheck = printTrustCheck;

/**
 * Convert number to words for check printing
 */
function numberToWords(num) {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
                  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
                  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);

    if (dollars === 0) return `ZERO AND ${cents}/100`;

    function convertHundreds(n) {
        let str = '';
        if (n >= 100) {
            str += ones[Math.floor(n / 100)] + ' HUNDRED ';
            n %= 100;
        }
        if (n >= 20) {
            str += tens[Math.floor(n / 10)] + ' ';
            n %= 10;
        }
        if (n > 0) {
            str += ones[n] + ' ';
        }
        return str;
    }

    function convert(n) {
        if (n === 0) return '';
        let str = '';
        if (n >= 1000000) {
            str += convertHundreds(Math.floor(n / 1000000)) + 'MILLION ';
            n %= 1000000;
        }
        if (n >= 1000) {
            str += convertHundreds(Math.floor(n / 1000)) + 'THOUSAND ';
            n %= 1000;
        }
        str += convertHundreds(n);
        return str.trim();
    }

    return `${convert(dollars)} AND ${cents}/100`;
}

/**
 * Open fee modal
 */
function openIoltaFeeModal() {
    const clientId = IoltaPageState.selectedClientId;

    if (!clientId || clientId === 'all' || clientId === 'general') {
        // No client selected - open modal with client selector
        openTrustFeeModalGeneric();
        return;
    }

    const client = IoltaPageState.clients.find(c => c.id === clientId);
    if (!client) {
        openTrustFeeModalGeneric();
        return;
    }

    openTrustFeeModalWithClient(clientId, client.client_name, parseFloat(client.total_balance || 0));
}

/**
 * Generic fee modal with client dropdown
 */
function openTrustFeeModalGeneric() {
    const clients = IoltaPageState.clients || [];
    const clientOptions = clients.map(c => {
        const balance = parseFloat(c.total_balance || 0);
        return `<option value="${c.id}" data-balance="${balance}">${escapeHtml(c.client_name)}${c.case_number ? ' (' + escapeHtml(c.case_number) + ')' : ''} - ${formatCurrency(balance)}</option>`;
    }).join('');

    const modalHtml = `
        <div id="iolta-fee-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Record Fee</h3>
                    <button onclick="closeIoltaModal('iolta-fee-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-fee-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client *</label>
                        <select name="client_id" required style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;">
                            <option value="">Select a client...</option>
                            ${clientOptions}
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Legal fees, filing fees, etc.">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-fee-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Record Fee
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('iolta-fee-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitIoltaFee(e.target);
    });
}

function openTrustFeeModalWithClient(clientId, clientName, balance) {
    const modalHtml = `
        <div id="iolta-fee-modal" class="modal-overlay active" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
            <div class="modal" style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Record Fee</h3>
                        <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Available: ${formatCurrency(balance)}</p>
                    </div>
                    <button onclick="closeIoltaModal('iolta-fee-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-fee-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client</label>
                        <input type="text" value="${escapeHtml(clientName)}" disabled
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; color: #6b7280;">
                        <input type="hidden" name="client_id" value="${clientId}">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" max="${balance}" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="0.00">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" name="transaction_date" required value="${new Date().toISOString().split('T')[0]}"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" name="description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Legal fees, filing fees, etc.">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-fee-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Record Fee
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('iolta-fee-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitIoltaFee(e.target);
    });
}

async function submitIoltaFee(form) {
    const formData = new FormData(form);
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    const data = {
        user_id: userId,
        client_id: formData.get('client_id'),
        amount: -Math.abs(parseFloat(formData.get('amount'))),
        transaction_date: formData.get('transaction_date'),
        description: formData.get('description') || 'Fee withdrawal',
        transaction_type: 'fee'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            showToast('Fee recorded successfully', 'success');
            closeIoltaModal('iolta-fee-modal');
            await loadIoltaPage();
        } else {
            showToast(result.message || 'Error recording fee', 'error');
        }
    } catch (error) {
        showToast('Error recording fee', 'error');
    }
}

/**
 * Handle CSV import from unified page
 * @param {HTMLInputElement} inputElement - Optional file input element
 */
function handleIoltaCsvImport(inputElement) {
    if (inputElement && inputElement.files && inputElement.files.length > 0) {
        // Called from existing file input
        handleLedgerCsvImport(inputElement);
        // Reset the input so the same file can be selected again
        inputElement.value = '';
    } else {
        // Called without input - create one
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = async (e) => {
            if (e.target.files && e.target.files[0]) {
                await handleLedgerCsvImport(e.target);
            }
        };
        input.click();
    }
}

/**
 * Open batch deposit modal
 */
function openIoltaBatchModal() {
    if (typeof IoltaUI !== 'undefined' && IoltaUI.openBatchModal) {
        IoltaUI.openBatchModal();
    } else {
        showToast('Batch deposit feature coming soon', 'info');
    }
}

/**
 * View transaction details
 */
function viewIoltaTransaction(id, isStaging) {
    if (isStaging) {
        // Open staging assignment modal
        showToast('Staging item - assign to a client', 'info');
    } else {
        // Open transaction detail modal using existing function
        if (typeof openTransactionDetailModal === 'function') {
            openTransactionDetailModal(id);
        } else {
            showToast('Transaction detail view not available', 'info');
        }
    }
}

/**
 * Close any IOLTA modal
 */
function closeIoltaModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
}

/**
 * Add new client
 */
function openIoltaAddClientModal() {
    const modalHtml = `
        <div id="iolta-add-client-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 12px; width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Add New Client</h3>
                    <button onclick="closeIoltaModal('iolta-add-client-modal')" style="background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer;">&times;</button>
                </div>
                <form id="iolta-add-client-form" style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client Name *</label>
                        <input type="text" name="client_name" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Full name">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Client #</label>
                            <input type="text" name="client_number"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Optional">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Case #</label>
                            <input type="text" name="case_number"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Optional">
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Case Description</label>
                        <input type="text" name="case_description"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;" placeholder="Case type or description">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Email</label>
                            <input type="email" name="contact_email"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone</label>
                            <input type="tel" name="contact_phone"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;">
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                        <button type="button" onclick="closeIoltaModal('iolta-add-client-modal')"
                                style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Add Client
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('iolta-add-client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitIoltaNewClient(e.target);
    });
}

async function submitIoltaNewClient(form) {
    const formData = new FormData(form);
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    const data = {
        user_id: userId,
        client_name: formData.get('client_name'),
        client_number: formData.get('client_number') || null,
        case_number: formData.get('case_number') || null,
        case_description: formData.get('case_description') || null,
        contact_email: formData.get('contact_email') || null,
        contact_phone: formData.get('contact_phone') || null
    };

    try {
        const result = await apiPost('/trust/clients.php', data);
        if (result.success) {
            showToast('Client added successfully', 'success');
            closeIoltaModal('iolta-add-client-modal');
            await loadIoltaPage();
            // Select the new client
            if (result.data && result.data.client) {
                selectIoltaClient(result.data.client.id);
            }
        } else {
            showToast(result.message || 'Error adding client', 'error');
        }
    } catch (error) {
        showToast('Error adding client', 'error');
    }
}

/**
 * Setup payee autocomplete for check modals
 * Searches entities (vendors, customers, employees) and shows dropdown
 */
function setupPayeeAutocomplete(inputId, dropdownId, hiddenInputId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (!input || !dropdown) return;

    let debounceTimer = null;
    let selectedIndex = -1;

    input.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        hiddenInput.value = ''; // Clear entity_id when user types

        if (debounceTimer) clearTimeout(debounceTimer);

        if (query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;
                const result = await apiGet(`/entities/index.php?user_id=${userId}&search=${encodeURIComponent(query)}&limit=10`);

                if (result.success && result.data.entities && result.data.entities.length > 0) {
                    const entities = result.data.entities;
                    selectedIndex = -1;

                    dropdown.innerHTML = entities.map((entity, index) => {
                        const typeIcon = getEntityTypeIcon(entity.type_code);
                        const typeLabel = entity.type_name || entity.type_code;
                        return `
                            <div class="payee-autocomplete-item" data-index="${index}" data-id="${entity.id}" data-name="${escapeHtml(entity.display_name || entity.name)}"
                                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;"
                                 onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">
                                <span style="font-size: 16px;">${typeIcon}</span>
                                <div style="flex: 1;">
                                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(entity.display_name || entity.name)}</div>
                                    <div style="font-size: 12px; color: #64748b;">${typeLabel}${entity.company_name ? ' - ' + escapeHtml(entity.company_name) : ''}</div>
                                </div>
                            </div>
                        `;
                    }).join('');

                    dropdown.style.display = 'block';

                    // Add click handlers
                    dropdown.querySelectorAll('.payee-autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            input.value = item.dataset.name;
                            hiddenInput.value = item.dataset.id;
                            dropdown.style.display = 'none';
                        });
                    });
                } else {
                    dropdown.innerHTML = `
                        <div style="padding: 12px; text-align: center; color: #64748b;">
                            No matches found. You can type a custom name.
                        </div>
                    `;
                    dropdown.style.display = 'block';
                }
            } catch (error) {
                console.error('Payee search error:', error);
                dropdown.style.display = 'none';
            }
        }, 300);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.payee-autocomplete-item');
        if (!items.length || dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const item = items[selectedIndex];
            if (item) {
                input.value = item.dataset.name;
                hiddenInput.value = item.dataset.id;
                dropdown.style.display = 'none';
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    function updateSelection(items) {
        items.forEach((item, index) => {
            item.style.background = index === selectedIndex ? '#e0e7ff' : 'white';
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

/**
 * Get icon for entity type
 */
function getEntityTypeIcon(typeCode) {
    const icons = {
        'vendor': '🏢',
        'customer': '&#128100;',
        'employee': '👔',
        'other': '&#128203;'
    };
    return icons[typeCode] || '&#128203;';
}

/**
 * Delete the currently selected client
 */
async function deleteSelectedClient() {
    const clientId = IoltaPageState.selectedClientId;

    if (!clientId || clientId === 'all' || clientId === 'general') {
        alert('Please select a client to delete.');
        return;
    }

    const client = IoltaPageState.clients.find(c => c.id == clientId);
    if (!client) {
        alert('Client not found.');
        return;
    }

    // Check balance
    const balance = parseFloat(client.total_balance || 0);
    if (balance !== 0) {
        alert('Cannot delete client with non-zero balance. Please close ledgers first.');
        return;
    }

    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete client "${client.client_name}"?\n\nThis action will deactivate the client.`);
    if (!confirmed) return;

    try {
        const result = await apiDelete(`/trust/clients.php?id=${clientId}`);

        if (result.success) {
            alert('Client deleted successfully.');
            // Refresh the client list
            await loadIoltaPage();
            // Select "All Clients"
            selectIoltaClient('all');
        } else {
            alert(result.message || 'Failed to delete client.');
        }
    } catch (error) {
        console.error('Error deleting client:', error);
        alert('An error occurred while deleting the client.');
    }
}

// Export unified page functions
window.deleteSelectedClient = deleteSelectedClient;
window.loadIoltaPage = loadIoltaPage;
window.renderIoltaClientSidebar = renderIoltaClientSidebar;
window.selectIoltaClient = selectIoltaClient;
window.loadIoltaTransactions = loadIoltaTransactions;
window.renderIoltaTransactions = renderIoltaTransactions;
window.filterIoltaClients = filterIoltaClients;
window.filterIoltaTransactions = filterIoltaTransactions;
window.clearIoltaTxSearch = clearIoltaTxSearch;
window.sortIoltaTable = sortIoltaTable;
window.updateSortIcons = updateSortIcons;
window.runAutoMatch = runAutoMatch;
window.showAutoMatchResults = showAutoMatchResults;
window.closeAutoMatchModal = closeAutoMatchModal;
window.toggleAllMatches = toggleAllMatches;
// approveSelectedMatches - registered earlier (line 15883)
window.toggleIoltaSelectAll = toggleIoltaSelectAll;
window.updateIoltaBulkActions = updateIoltaBulkActions;
window.clearIoltaSelection = clearIoltaSelection;
window.getSelectedIoltaTxIds = getSelectedIoltaTxIds;
window.openIoltaMoveModal = openIoltaMoveModal;
window.executeMoveToClient = executeMoveToClient;
window.deleteSelectedIoltaTx = deleteSelectedIoltaTx;
window.editSelectedIoltaTx = editSelectedIoltaTx;
window.openIoltaDepositModal = openIoltaDepositModal;
window.openIoltaCheckModal = openIoltaCheckModal;
window.openIoltaFeeModal = openIoltaFeeModal;
window.handleIoltaCsvImport = handleIoltaCsvImport;
window.openIoltaBatchModal = openIoltaBatchModal;
window.viewIoltaTransaction = viewIoltaTransaction;
window.closeIoltaModal = closeIoltaModal;
window.openIoltaAddClientModal = openIoltaAddClientModal;
window.submitIoltaNewClient = submitIoltaNewClient;
window.IoltaPageState = IoltaPageState;

// Alias for toggleSelectAllIoltaTx (called from index.html)
function toggleSelectAllIoltaTx(checked) {
    const checkbox = document.getElementById('iolta-select-all');
    if (checkbox) checkbox.checked = checked;
    const checkboxes = document.querySelectorAll('.iolta-tx-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
    updateIoltaBulkActions();
}
window.toggleSelectAllIoltaTx = toggleSelectAllIoltaTx;

/**
 * Mark selected transactions as cleared (pending -> cleared)
 */
async function markSelectedIoltaAsCleared() {
    const selected = getSelectedIoltaTxIds();
    if (selected.length === 0) {
        showToast('Please select transactions to clear', 'error');
        return;
    }

    // Filter only non-staging transactions (real trust_transactions)
    const realTxIds = selected.filter(s => !s.isStaging).map(s => s.id);

    if (realTxIds.length === 0) {
        showToast('Staging transactions cannot be cleared', 'error');
        return;
    }

    const userId = window.getCurrentUserId ? window.getCurrentUserId() : 1;

    try {
        // Update each transaction's status to 'cleared'
        const apiBase = window.API_BASE || '/expensetracker/api/v1';
        const promises = realTxIds.map(id =>
            fetch(`${apiBase}/trust/transactions.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    id: id,
                    user_id: userId,
                    status: 'cleared'
                })
            })
        );

        const results = await Promise.all(promises);

        // Check for errors
        let successCount = 0;
        for (const res of results) {
            if (res.ok) successCount++;
        }

        if (successCount > 0) {
            showToast(`${successCount} transaction(s) marked as cleared`, 'success');
        } else {
            showToast('Failed to clear transactions', 'error');
        }

        // Refresh the transactions list
        clearIoltaSelection();
        if (IoltaPageState.selectedClientId) {
            await loadIoltaTransactions(IoltaPageState.selectedClientId);
        }
    } catch (error) {
        console.error('Error clearing transactions:', error);
        showToast('Failed to clear transactions', 'error');
    }
}
window.markSelectedIoltaAsCleared = markSelectedIoltaAsCleared;

// =====================================================
// Dashboard Stat Card Detail Functions
// =====================================================

async function showTotalClientFundsDetail() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get client breakdown from reports API (includes individual client balances)
    const breakdownData = await apiGet('/trust/reports.php', {
        type: 'client_breakdown',
        user_id: userId,
        balance_filter: 'all'
    });

    let modal = document.getElementById('stat-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stat-detail-modal';
        document.body.appendChild(modal);
    }

    let clientsHtml = '';
    let grandTotal = 0;

    if (breakdownData.success && breakdownData.data.client_breakdown) {
        const clients = breakdownData.data.client_breakdown.clients || [];

        // Calculate grand total from ALL clients
        clients.forEach(client => {
            grandTotal += parseFloat(client.current_balance || 0);
        });

        // Filter out clients with $0 balance for display
        const activeClients = clients.filter(client => Math.abs(parseFloat(client.current_balance || 0)) >= 0.01);

        if (activeClients.length > 0) {
            clientsHtml = `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            <th style="text-align: left; padding: 8px; font-size: 12px; color: #6b7280;">Client</th>
                            <th style="text-align: left; padding: 8px; font-size: 12px; color: #6b7280;">Case #</th>
                            <th style="text-align: right; padding: 8px; font-size: 12px; color: #6b7280;">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeClients.map(client => {
                            const balance = parseFloat(client.current_balance || 0);
                            const balanceColor = balance >= 0 ? '#059669' : '#dc2626';
                            return `
                                <tr style="border-bottom: 1px solid #f3f4f6; cursor: pointer;"
                                    onclick="closeStatDetailModal(); localStorage.setItem('ioltaPendingClientId', '${client.client_id}'); navigateTo('iolta');"
                                    onmouseover="this.style.background='#f9fafb';"
                                    onmouseout="this.style.background='';">
                                    <td style="padding: 10px 8px;">${client.client_name || 'Unknown'}</td>
                                    <td style="padding: 10px 8px; color: #6b7280;">${client.case_number || '-'}</td>
                                    <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: ${balanceColor};">${formatCurrency(balance)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    if (!clientsHtml) {
        clientsHtml = '<p style="color: #6b7280; text-align: center; padding: 40px;">No client funds found</p>';
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="width: 700px; max-width: 95%; max-height: 85vh; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">&#128176;</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Total Client Funds</h3>
                                <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700;">${formatCurrency(grandTotal)}</p>
                            </div>
                        </div>
                        <button onclick="closeStatDetailModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <p style="color: #6b7280; font-size: 13px; margin-bottom: 16px;">Click on a client to view their ledger</p>
                    ${clientsHtml}
                </div>
            </div>
        </div>
    `;
}

async function showTrustAccountsDetail() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get balance summary with account details
    const summaryData = await apiGet('/trust/reports.php', {
        type: 'balance_summary',
        user_id: userId
    });

    let modal = document.getElementById('stat-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stat-detail-modal';
        document.body.appendChild(modal);
    }

    let accountsHtml = '';
    let accountCount = 0;
    let totalBalance = 0;

    if (summaryData.success && summaryData.data.balance_summary) {
        const accounts = summaryData.data.balance_summary.accounts || [];
        accountCount = accounts.length;

        if (accounts.length > 0) {
            accounts.forEach(account => {
                totalBalance += parseFloat(account.account_balance || 0);
            });

            accountsHtml = `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            <th style="text-align: left; padding: 8px; font-size: 12px; color: #6b7280;">Account Name</th>
                            <th style="text-align: center; padding: 8px; font-size: 12px; color: #6b7280;">Ledgers</th>
                            <th style="text-align: right; padding: 8px; font-size: 12px; color: #6b7280;">Bank Balance</th>
                            <th style="text-align: right; padding: 8px; font-size: 12px; color: #6b7280;">Client Total</th>
                            <th style="text-align: center; padding: 8px; font-size: 12px; color: #6b7280;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${accounts.map(account => {
                            const bankBalance = parseFloat(account.account_balance || 0);
                            const clientTotal = parseFloat(account.total_client_balance || 0);
                            const diff = Math.abs(bankBalance - clientTotal);
                            const isBalanced = diff < 0.01;
                            const statusColor = isBalanced ? '#059669' : '#dc2626';
                            const statusText = isBalanced ? '&#10003; Balanced' : '&#9888; Off by ' + formatCurrency(diff);
                            return `
                                <tr style="border-bottom: 1px solid #f3f4f6;">
                                    <td style="padding: 10px 8px; font-weight: 500;">${account.account_name}</td>
                                    <td style="padding: 10px 8px; text-align: center; color: #6b7280;">${account.ledger_count || 0}</td>
                                    <td style="padding: 10px 8px; text-align: right; font-weight: 600;">${formatCurrency(bankBalance)}</td>
                                    <td style="padding: 10px 8px; text-align: right; color: #6b7280;">${formatCurrency(clientTotal)}</td>
                                    <td style="padding: 10px 8px; text-align: center; font-size: 12px; color: ${statusColor};">${statusText}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="border-top: 2px solid #e5e7eb; background: #f9fafb;">
                            <td style="padding: 12px 8px; font-weight: 600;">Total</td>
                            <td style="padding: 12px 8px;"></td>
                            <td style="padding: 12px 8px; text-align: right; font-weight: 700;">${formatCurrency(totalBalance)}</td>
                            <td style="padding: 12px 8px;"></td>
                            <td style="padding: 12px 8px;"></td>
                        </tr>
                    </tfoot>
                </table>
            `;
        }
    }

    if (!accountsHtml) {
        accountsHtml = '<p style="color: #6b7280; text-align: center; padding: 40px;">No trust accounts found</p>';
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="width: 750px; max-width: 95%; max-height: 85vh; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">&#127974;</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Trust Accounts</h3>
                                <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700;">${accountCount} Account${accountCount !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <button onclick="closeStatDetailModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    ${accountsHtml}
                </div>
            </div>
        </div>
    `;
}

async function showOpenLedgersDetail() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get client breakdown from reports API
    const breakdownData = await apiGet('/trust/reports.php', {
        type: 'client_breakdown',
        user_id: userId,
        balance_filter: 'all'
    });

    let modal = document.getElementById('stat-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stat-detail-modal';
        document.body.appendChild(modal);
    }

    let ledgersHtml = '';
    let totalLedgers = 0;

    if (breakdownData.success && breakdownData.data.client_breakdown) {
        const allClients = breakdownData.data.client_breakdown.clients || [];
        // Filter to only clients with non-zero balance
        const clients = allClients.filter(client => Math.abs(parseFloat(client.current_balance || 0)) >= 0.01);
        totalLedgers = clients.length;

        clients.forEach(client => {
            const balance = parseFloat(client.current_balance || 0);
            const balanceColor = balance >= 0 ? '#059669' : '#dc2626';
            const statusBadge = balance > 0
                ? '<span style="padding: 4px 8px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 11px;">Open</span>'
                : '<span style="padding: 4px 8px; background: #fef2f2; color: #dc2626; border-radius: 4px; font-size: 11px;">Negative</span>';

            ledgersHtml += `
                <tr style="border-bottom: 1px solid #f3f4f6; cursor: pointer;"
                    onclick="closeStatDetailModal(); localStorage.setItem('ioltaPendingClientId', '${client.client_id}'); navigateTo('iolta');"
                    onmouseover="this.style.background='#f9fafb';"
                    onmouseout="this.style.background='';">
                    <td style="padding: 10px 8px; font-weight: 500;">${client.client_name || 'Unknown'}</td>
                    <td style="padding: 10px 8px; color: #6b7280;">${client.case_number || '-'}</td>
                    <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: ${balanceColor};">${formatCurrency(balance)}</td>
                    <td style="padding: 10px 8px; text-align: center;">${statusBadge}</td>
                </tr>
            `;
        });
    }

    const tableHtml = ledgersHtml ? `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 2px solid #e5e7eb;">
                    <th style="text-align: left; padding: 8px; font-size: 12px; color: #6b7280;">Client</th>
                    <th style="text-align: left; padding: 8px; font-size: 12px; color: #6b7280;">Case #</th>
                    <th style="text-align: right; padding: 8px; font-size: 12px; color: #6b7280;">Balance</th>
                    <th style="text-align: center; padding: 8px; font-size: 12px; color: #6b7280;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${ledgersHtml}
            </tbody>
        </table>
    ` : '<p style="color: #6b7280; text-align: center; padding: 40px;">No open ledgers found</p>';

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="width: 700px; max-width: 95%; max-height: 85vh; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">&#128210;</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Open Ledgers</h3>
                                <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700;">${totalLedgers}</p>
                            </div>
                        </div>
                        <button onclick="closeStatDetailModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <p style="color: #6b7280; font-size: 13px; margin-bottom: 16px;">Click on a ledger to view transactions</p>
                    ${tableHtml}
                </div>
            </div>
        </div>
    `;
}

async function showReconciliationDetail() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get balance summary
    const summaryData = await apiGet('/trust/reports.php', {
        type: 'balance_summary',
        user_id: userId
    });

    let modal = document.getElementById('stat-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stat-detail-modal';
        document.body.appendChild(modal);
    }

    let accountTotal = 0;
    let ledgerTotal = 0;
    let accountsHtml = '';

    if (summaryData.success && summaryData.data.balance_summary) {
        const summary = summaryData.data.balance_summary;
        accountTotal = summary.totals?.grand_total_account || 0;
        ledgerTotal = summary.totals?.grand_total_client || 0;

        const accounts = summary.accounts || [];
        accountsHtml = accounts.map(account => {
            const accBalance = parseFloat(account.account_balance || 0);
            const clientTotal = parseFloat(account.total_client_balance || 0);
            const diff = accBalance - clientTotal;
            const isBalanced = Math.abs(diff) < 0.01;

            return `
                <div style="background: ${isBalanced ? '#f0fdf4' : '#fef2f2'}; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #374151;">&#127974; ${account.account_name || 'Trust Account'}</h4>
                        <span style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; ${isBalanced ? 'background: #dcfce7; color: #166534;' : 'background: #fef2f2; color: #dc2626;'}">
                            ${isBalanced ? '&#10003; Balanced' : '&#9888; Unbalanced'}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                        <div>
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Bank Balance</div>
                            <div style="font-size: 16px; font-weight: 600; color: #1f2937;">${formatCurrency(accBalance)}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Client Ledgers</div>
                            <div style="font-size: 16px; font-weight: 600; color: #1f2937;">${formatCurrency(clientTotal)}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Difference</div>
                            <div style="font-size: 16px; font-weight: 600; color: ${isBalanced ? '#059669' : '#dc2626'};">${formatCurrency(diff)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    const difference = accountTotal - ledgerTotal;
    const isBalanced = Math.abs(difference) < 0.01;

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="width: 650px; max-width: 95%; max-height: 85vh; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, ${isBalanced ? '#059669' : '#dc2626'} 0%, ${isBalanced ? '#047857' : '#b91c1c'} 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">&#9878;</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Reconciliation Status</h3>
                                <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700;">${isBalanced ? 'All Accounts Balanced' : 'Attention Needed'}</p>
                            </div>
                        </div>
                        <button onclick="closeStatDetailModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <!-- Summary -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 12px;">
                        <div style="text-align: center;">
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Total Bank Balance</div>
                            <div style="font-size: 20px; font-weight: 700; color: #1f2937;">${formatCurrency(accountTotal)}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Total Client Ledgers</div>
                            <div style="font-size: 20px; font-weight: 700; color: #1f2937;">${formatCurrency(ledgerTotal)}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Difference</div>
                            <div style="font-size: 20px; font-weight: 700; color: ${isBalanced ? '#059669' : '#dc2626'};">${formatCurrency(difference)}</div>
                        </div>
                    </div>

                    <!-- Account Breakdown -->
                    <h4 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151;">Account Breakdown</h4>
                    ${accountsHtml || '<p style="color: #6b7280; text-align: center; padding: 20px;">No accounts found</p>'}

                    <!-- Action Button -->
                    <div style="margin-top: 20px; text-align: center;">
                        <button onclick="closeStatDetailModal(); navigateTo('trust-reconcile');"
                                style="padding: 12px 24px; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Go to Reconciliation
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeStatDetailModal() {
    const modal = document.getElementById('stat-detail-modal');
    if (modal) modal.remove();
}

window.showTotalClientFundsDetail = showTotalClientFundsDetail;
window.showTrustAccountsDetail = showTrustAccountsDetail;
window.showOpenLedgersDetail = showOpenLedgersDetail;
window.showReconciliationDetail = showReconciliationDetail;
window.closeStatDetailModal = closeStatDetailModal;

console.log('IOLTA Ledger module loaded');
