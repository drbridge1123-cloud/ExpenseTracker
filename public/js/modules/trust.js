// =====================================================
// IOLTA Trust Accounting Module
// =====================================================

const API_BASE = '/expensetracker/api/v1';
let currentUserId = 1; // TODO: Get from session
let trustAccounts = [];
let clients = [];
let ledgers = [];

// =====================================================
// Initialization
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get user from localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUserId = parseInt(savedUser);
    }

    // Set default date
    document.getElementById('trans-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('transfer-date').value = new Date().toISOString().split('T')[0];

    // Load initial data
    loadTrustAccounts();
    loadClients();
    loadStats();
});

// =====================================================
// API Helpers
// =====================================================

async function apiGet(endpoint, params = {}) {
    const url = new URL(API_BASE + endpoint, window.location.origin);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
            url.searchParams.append(key, params[key]);
        }
    });

    const response = await fetch(url);
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(API_BASE + endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function showToast(message, type = 'success') {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// =====================================================
// Navigation
// =====================================================

function showPanel(panelName) {
    // Update nav buttons
    document.querySelectorAll('.trust-nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(panelName.toLowerCase())) {
            btn.classList.add('active');
        }
    });

    // Update panels
    document.querySelectorAll('.trust-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`panel-${panelName}`).classList.add('active');

    // Load panel data
    switch (panelName) {
        case 'clients':
            loadClients();
            break;
        case 'ledgers':
            loadLedgers();
            break;
        case 'transactions':
            loadTransactions();
            break;
        case 'reconciliation':
            loadReconciliation();
            break;
    }
}

// =====================================================
// Load Trust Accounts
// =====================================================

async function loadTrustAccounts() {
    const data = await apiGet('/accounts/', { user_id: currentUserId });

    if (data.success) {
        trustAccounts = data.data.accounts.filter(a =>
            a.account_type === 'iolta' || a.account_type === 'trust'
        );

        // Populate account selects
        const selects = [
            'ledger-account',
            'ledger-account-filter',
            'recon-account-select'
        ];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const firstOption = select.options[0];
                select.innerHTML = '';
                select.appendChild(firstOption);

                trustAccounts.forEach(acc => {
                    const option = document.createElement('option');
                    option.value = acc.id;
                    option.textContent = `${acc.account_name} (${acc.account_number_last4 || 'N/A'})`;
                    select.appendChild(option);
                });
            }
        });
    }
}

// =====================================================
// Stats
// =====================================================

async function loadStats() {
    // Load balance summary
    const balanceData = await apiGet('/trust/reports.php', {
        type: 'balance_summary',
        user_id: currentUserId
    });

    if (balanceData.success) {
        const summary = balanceData.data.balance_summary;
        document.getElementById('stat-total-balance').textContent =
            formatCurrency(summary.totals.grand_total_client);
        document.getElementById('stat-active-ledgers').textContent =
            summary.totals.total_ledgers;
    }

    // Load clients count
    const clientsData = await apiGet('/trust/clients.php', { user_id: currentUserId });
    if (clientsData.success) {
        document.getElementById('stat-active-clients').textContent =
            clientsData.data.clients.filter(c => c.is_active).length;
    }
}

// =====================================================
// Clients
// =====================================================

async function loadClients() {
    const data = await apiGet('/trust/clients.php', {
        user_id: currentUserId,
        include_inactive: '1'
    });

    if (data.success) {
        clients = data.data.clients;
        renderClients(clients);
        populateClientSelects();
    }
}

function renderClients(clientList) {
    const tbody = document.getElementById('clients-table-body');
    const empty = document.getElementById('clients-empty');

    if (clientList.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = clientList.map(client => `
        <tr>
            <td>
                <div class="client-name">${escapeHtml(client.client_name)}</div>
                ${client.client_number ? `<div class="matter-number">#${escapeHtml(client.client_number)}</div>` : ''}
            </td>
            <td>${client.matter_number || '-'}</td>
            <td>${client.contact_email || '-'}</td>
            <td>${client.ledger_count}</td>
            <td class="amount ${client.total_balance >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(client.total_balance)}
            </td>
            <td>
                <span class="status-badge ${client.is_active ? 'active' : 'inactive'}">
                    ${client.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <button class="action-btn" onclick="editClient(${client.id})">Edit</button>
            </td>
        </tr>
    `).join('');
}

function populateClientSelects() {
    const selects = ['ledger-client'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            clients.filter(c => c.is_active).forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.client_name}${client.matter_number ? ` (${client.matter_number})` : ''}`;
                select.appendChild(option);
            });
        }
    });
}

function openClientModal(clientId = null) {
    document.getElementById('client-form').reset();
    document.getElementById('client-id').value = '';
    document.getElementById('client-modal-title').textContent = clientId ? 'Edit Client' : 'Add Client';
    openModal('client-modal');
}

async function editClient(clientId) {
    const data = await apiGet('/trust/clients.php', { id: clientId });

    if (data.success) {
        const client = data.data.client;
        document.getElementById('client-id').value = client.id;
        document.getElementById('client-name').value = client.client_name;
        document.getElementById('client-number').value = client.client_number || '';
        document.getElementById('client-matter').value = client.matter_number || '';
        document.getElementById('client-matter-desc').value = client.matter_description || '';
        document.getElementById('client-email').value = client.contact_email || '';
        document.getElementById('client-phone').value = client.contact_phone || '';
        document.getElementById('client-address').value = client.address || '';
        document.getElementById('client-notes').value = client.notes || '';

        document.getElementById('client-modal-title').textContent = 'Edit Client';
        openModal('client-modal');
    }
}

async function saveClient(event) {
    event.preventDefault();

    const clientId = document.getElementById('client-id').value;
    const clientData = {
        user_id: currentUserId,
        client_name: document.getElementById('client-name').value,
        client_number: document.getElementById('client-number').value || null,
        matter_number: document.getElementById('client-matter').value || null,
        matter_description: document.getElementById('client-matter-desc').value || null,
        contact_email: document.getElementById('client-email').value || null,
        contact_phone: document.getElementById('client-phone').value || null,
        address: document.getElementById('client-address').value || null,
        notes: document.getElementById('client-notes').value || null
    };

    let result;
    if (clientId) {
        clientData.id = parseInt(clientId);
        result = await apiPut('/trust/clients.php', clientData);
    } else {
        result = await apiPost('/trust/clients.php', clientData);
    }

    if (result.success) {
        showToast(clientId ? 'Client updated' : 'Client created');
        closeModal('client-modal');
        loadClients();
        loadStats();
    } else {
        showToast(result.message || 'Error saving client', 'error');
    }
}

// =====================================================
// Ledgers
// =====================================================

async function loadLedgers() {
    const accountId = document.getElementById('ledger-account-filter').value;

    const params = { user_id: currentUserId, include_inactive: '1' };
    if (accountId) params.account_id = accountId;

    const data = await apiGet('/trust/ledger.php', params);

    if (data.success) {
        ledgers = data.data.ledgers;
        renderLedgers(ledgers);
        populateLedgerSelects();
    }
}

function renderLedgers(ledgerList) {
    const tbody = document.getElementById('ledgers-table-body');

    if (ledgerList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
                    No ledgers found. Open a ledger for a client to get started.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = ledgerList.map(ledger => `
        <tr>
            <td>
                <div class="client-name">${escapeHtml(ledger.client_name)}</div>
                ${ledger.matter_number ? `<div class="matter-number">${escapeHtml(ledger.matter_number)}</div>` : ''}
            </td>
            <td>${escapeHtml(ledger.account_name)}</td>
            <td class="amount ${ledger.current_balance >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(ledger.current_balance)}
            </td>
            <td>${ledger.transaction_count}</td>
            <td>${formatDate(ledger.last_activity)}</td>
            <td>
                <span class="status-badge ${ledger.is_active ? 'active' : 'inactive'}">
                    ${ledger.is_active ? 'Active' : 'Closed'}
                </span>
            </td>
            <td>
                <button class="action-btn" onclick="viewLedger(${ledger.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function populateLedgerSelects() {
    const selects = ['trans-ledger', 'trans-ledger-filter', 'transfer-from', 'transfer-to'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            ledgers.filter(l => l.is_active).forEach(ledger => {
                const option = document.createElement('option');
                option.value = ledger.id;
                option.textContent = `${ledger.client_name} - ${formatCurrency(ledger.current_balance)}`;
                select.appendChild(option);
            });
        }
    });
}

function openLedgerModal() {
    document.getElementById('ledger-form').reset();
    openModal('ledger-modal');
}

async function saveLedger(event) {
    event.preventDefault();

    const ledgerData = {
        user_id: currentUserId,
        account_id: parseInt(document.getElementById('ledger-account').value),
        client_id: parseInt(document.getElementById('ledger-client').value),
        minimum_balance: parseFloat(document.getElementById('ledger-min-balance').value) || 0
    };

    const result = await apiPost('/trust/ledger.php', ledgerData);

    if (result.success) {
        showToast('Ledger opened successfully');
        closeModal('ledger-modal');
        loadLedgers();
        loadStats();
    } else {
        showToast(result.message || 'Error opening ledger', 'error');
    }
}

async function viewLedger(ledgerId) {
    // TODO: Open ledger detail view
    console.log('View ledger:', ledgerId);
}

// =====================================================
// Transactions
// =====================================================

async function loadTransactions() {
    const ledgerId = document.getElementById('trans-ledger-filter').value;

    const params = { user_id: currentUserId, all: 1 };
    if (ledgerId) params.ledger_id = ledgerId;

    const data = await apiGet('/trust/transactions.php', params);

    if (data.success) {
        renderTransactions(data.data.transactions);
    }
}

function renderTransactions(transactions) {
    const tbody = document.getElementById('transactions-table-body');

    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
                    No transactions found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transactions.map(trans => `
        <tr>
            <td>${formatDate(trans.transaction_date)}</td>
            <td>
                <div class="client-name">${escapeHtml(trans.client_name)}</div>
                ${trans.matter_number ? `<div class="matter-number">${escapeHtml(trans.matter_number)}</div>` : ''}
            </td>
            <td>
                <span class="trans-type ${trans.transaction_type}">
                    ${formatTransType(trans.transaction_type)}
                </span>
            </td>
            <td>${escapeHtml(trans.description)}</td>
            <td class="amount ${trans.amount >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(trans.amount)}
            </td>
            <td class="amount">${formatCurrency(trans.running_balance)}</td>
        </tr>
    `).join('');
}

function formatTransType(type) {
    const types = {
        deposit: 'Deposit',
        disbursement: 'Disbursement',
        transfer_in: 'Transfer In',
        transfer_out: 'Transfer Out',
        earned_fee: 'Earned Fee',
        refund: 'Refund',
        interest: 'Interest',
        adjustment: 'Adjustment'
    };
    return types[type] || type;
}

function openTransactionModal() {
    document.getElementById('transaction-form').reset();
    document.getElementById('trans-date').value = new Date().toISOString().split('T')[0];
    openModal('transaction-modal');
}

async function saveTransaction(event) {
    event.preventDefault();

    const transData = {
        user_id: currentUserId,
        ledger_id: parseInt(document.getElementById('trans-ledger').value),
        transaction_type: document.getElementById('trans-type').value,
        amount: parseFloat(document.getElementById('trans-amount').value),
        transaction_date: document.getElementById('trans-date').value,
        description: document.getElementById('trans-description').value,
        reference_number: document.getElementById('trans-reference').value || null,
        payee: document.getElementById('trans-payee').value || null,
        memo: document.getElementById('trans-memo').value || null
    };

    const result = await apiPost('/trust/transactions.php', transData);

    if (result.success) {
        showToast('Transaction recorded');
        closeModal('transaction-modal');
        loadTransactions();
        loadLedgers();
        loadStats();
    } else {
        showToast(result.message || 'Error recording transaction', 'error');
    }
}

// =====================================================
// Transfers
// =====================================================

function openTransferModal() {
    document.getElementById('transfer-form').reset();
    document.getElementById('transfer-date').value = new Date().toISOString().split('T')[0];
    openModal('transfer-modal');
}

async function saveTransfer(event) {
    event.preventDefault();

    const transferData = {
        user_id: currentUserId,
        transfer_type: 'client_to_client',
        from_ledger_id: parseInt(document.getElementById('transfer-from').value),
        to_ledger_id: parseInt(document.getElementById('transfer-to').value),
        amount: parseFloat(document.getElementById('transfer-amount').value),
        transaction_date: document.getElementById('transfer-date').value,
        description: document.getElementById('transfer-description').value
    };

    const result = await apiPost('/trust/transfer.php', transferData);

    if (result.success) {
        showToast('Transfer completed');
        closeModal('transfer-modal');
        loadTransactions();
        loadLedgers();
        loadStats();
    } else {
        showToast(result.message || 'Transfer failed', 'error');
    }
}

// =====================================================
// Reconciliation
// =====================================================

async function loadReconciliation() {
    const accountId = document.getElementById('recon-account-select').value;
    if (!accountId) return;

    const data = await apiGet('/trust/reports.php', {
        type: 'account_summary',
        account_id: accountId
    });

    if (data.success) {
        const summary = data.data.summary;

        document.getElementById('recon-bank-balance').textContent =
            formatCurrency(summary.account.current_balance);
        document.getElementById('recon-ledger-total').textContent =
            formatCurrency(summary.totals.total_client_balance);

        const diff = summary.totals.difference;
        const diffEl = document.getElementById('recon-difference');
        diffEl.textContent = formatCurrency(diff);
        diffEl.className = `value ${Math.abs(diff) < 0.01 ? 'balanced' : 'unbalanced'}`;

        // Render client ledger breakdown
        const tbody = document.getElementById('recon-ledgers-body');
        tbody.innerHTML = summary.ledgers.map(ledger => `
            <tr>
                <td>${escapeHtml(ledger.client_name)}</td>
                <td>${ledger.matter_number || '-'}</td>
                <td class="amount">${formatCurrency(ledger.current_balance)}</td>
            </tr>
        `).join('');
    }
}

function openReconModal() {
    // TODO: Implement full reconciliation modal
    showToast('Full reconciliation coming soon', 'info');
}

// =====================================================
// Modal Helpers
// =====================================================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS animation for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
