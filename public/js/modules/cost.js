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
    txSearchTerm: ''
};

// =====================================================
// MAIN PAGE LOAD
// =====================================================

async function loadCostClientLedgerPage() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Load clients from trust_clients (shared)
        const clientsResult = await apiGet('/trust/clients.php', { user_id: userId });
        costState.clients = (clientsResult.success && clientsResult.data) ? (clientsResult.data.clients || []) : [];

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

    } catch (error) {
        console.error('Error loading cost client ledger:', error);
        showToast('Error loading cost client ledger', 'error');
    }
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
    // Must have a client selected
    if (costState.selectedClientId === 'all') {
        showToast('Please select a client first', 'warning');
        return;
    }

    const client = costState.clients.find(c => c.id == costState.selectedClientId);
    if (!client) {
        showToast('Client not found', 'error');
        return;
    }

    let modal = document.getElementById('cost-transaction-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'cost-transaction-modal';

    const today = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeCostTransactionModal()">
            <div style="width: 500px; max-width: 95%; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">New Transaction</h3>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">${client.case_number || ''} ${client.client_name}</p>
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
                        <input type="hidden" id="cost-tx-client-id" value="${client.id}">

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" id="cost-tx-date" value="${today}" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                            <input type="number" id="cost-tx-amount" step="0.01" min="0.01" required placeholder="0.00"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>

                        <div id="cost-tx-payee-row" style="display: none; margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Payee *</label>
                            <input type="text" id="cost-tx-payee" placeholder="e.g., Medical Records Inc."
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                            <input type="text" id="cost-tx-description" placeholder="e.g., Retainer deposit"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Reference / Check #</label>
                            <input type="text" id="cost-tx-reference" placeholder="Optional"
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
    `;

    document.body.appendChild(modal);
}

function closeCostTransactionModal() {
    const modal = document.getElementById('cost-transaction-modal');
    if (modal) modal.remove();
}

function switchCostTxTab(type) {
    const typeInput = document.getElementById('cost-tx-type');
    const depositTab = document.getElementById('cost-tx-tab-deposit');
    const payoutTab = document.getElementById('cost-tx-tab-payout');
    const payeeRow = document.getElementById('cost-tx-payee-row');
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
        if (submitBtn) {
            submitBtn.textContent = 'Record Payout';
            submitBtn.style.background = '#dc2626';
        }
    }
}

async function submitCostTransaction(event) {
    event.preventDefault();

    const type = document.getElementById('cost-tx-type').value;
    const clientId = document.getElementById('cost-tx-client-id').value;
    const date = document.getElementById('cost-tx-date').value;
    const amount = parseFloat(document.getElementById('cost-tx-amount').value);
    const payee = document.getElementById('cost-tx-payee').value;
    const description = document.getElementById('cost-tx-description').value;
    const reference = document.getElementById('cost-tx-reference').value;

    if (!date || !amount) {
        showToast('Please fill in required fields', 'warning');
        return;
    }

    if (type === 'payout' && !payee) {
        showToast('Please enter a payee for payout', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = {
        user_id: userId,
        client_id: clientId,
        transaction_type: type === 'deposit' ? 'deposit' : 'disbursement',
        transaction_date: date,
        amount: type === 'deposit' ? amount : -Math.abs(amount),
        payee: payee || null,
        description: description || (type === 'deposit' ? 'Deposit' : 'Payout'),
        reference_number: reference || null
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

    // Open edit modal (TODO: implement full edit modal)
    showToast('Edit feature coming soon', 'info');
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

    // TODO: Implement actual check printing
    showToast(`Printing ${costCheckStatusModalState.selectedIds.size} check(s)...`, 'info');

    // Mark as printed
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(costCheckStatusModalState.selectedIds);

    for (const id of ids) {
        await apiPut('/cost/transactions.php', { id, user_id: userId, status: 'printed' });
    }

    // Refresh
    await loadCostClientLedgerPage();
    await loadCostChecks();
    switchCostCheckStatusTab('printed');
    updateCostCheckStatusCounts();
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

async function loadCostDataManagement() {
    console.log('Cost data management page loaded');
}

async function loadCostReports() {
    console.log('Cost reports page loaded');
}

// Legacy compatibility
async function loadCostOperations() {
    // Redirect to client ledger
    navigateTo('cost-client-ledger');
}

// =====================================================
// GLOBAL EXPORTS
// =====================================================

window.costState = costState;
window.loadCostClientLedgerPage = loadCostClientLedgerPage;
window.filterCostClients = filterCostClients;
window.selectCostClientFromSidebar = selectCostClientFromSidebar;
window.renderCostTransactionList = renderCostTransactionList;
window.filterCostTransactions = filterCostTransactions;
window.clearCostTxSearch = clearCostTxSearch;
window.toggleCostTxSelection = toggleCostTxSelection;
window.toggleSelectAllCostTx = toggleSelectAllCostTx;
window.openCostTransactionModal = openCostTransactionModal;
window.closeCostTransactionModal = closeCostTransactionModal;
window.switchCostTxTab = switchCostTxTab;
window.submitCostTransaction = submitCostTransaction;
window.deleteSelectedCostTx = deleteSelectedCostTx;
window.openCostMoveModal = openCostMoveModal;
window.closeCostMoveModal = closeCostMoveModal;
window.filterCostMoveClientList = filterCostMoveClientList;
window.selectCostMoveClient = selectCostMoveClient;
window.editSelectedCostTx = editSelectedCostTx;
window.openCostClientModal = openCostClientModal;
window.printCostClientStatement = printCostClientStatement;
window.loadCostReconcile = loadCostReconcile;
window.loadCostDataManagement = loadCostDataManagement;
window.loadCostReports = loadCostReports;
window.loadCostOperations = loadCostOperations;

// Sort function
window.sortCostTable = sortCostTable;

// Check Status Modal
window.openCostCheckStatusModal = openCostCheckStatusModal;
window.closeCostCheckStatusModal = closeCostCheckStatusModal;
window.switchCostCheckStatusTab = switchCostCheckStatusTab;
window.filterCostCheckStatusList = filterCostCheckStatusList;
window.handleCostCheckStatusCheckboxClick = handleCostCheckStatusCheckboxClick;
window.printSelectedCostChecks = printSelectedCostChecks;
window.markSelectedCostChecksCleared = markSelectedCostChecksCleared;

// Bulk Actions
window.markSelectedCostAsCleared = markSelectedCostAsCleared;

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
