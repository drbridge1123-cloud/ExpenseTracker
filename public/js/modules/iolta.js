// =====================================================
// IOLTA Trust Accounting Module
// Integrated into main SPA
// =====================================================

// IOLTA State
let ioltaState = {
    trustAccounts: [],
    clients: [],
    ledgers: [],
    transactions: [],
    selectedClientId: null,
    selectedLedgerId: null,
    stagingUnassignedTotal: 0,
    stagingTotal: 0,  // Bank Statement total (source of truth)
    stagingUnassignedTransactions: []  // Unassigned staging transactions for General/Unassigned view
};

// Operations tab state (must be declared before switchOperationsTab)
let currentOpsTab = 'receive';

// =====================================================
// Initialization
// =====================================================

function initIOLTA() {
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const dateInputs = [
        'deposit-date', 'disburse-date', 'transfer-date', 'fee-date'
    ];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });

    // Set audit date range (first of month to today)
    const auditStart = document.getElementById('audit-start-date');
    const auditEnd = document.getElementById('audit-end-date');
    if (auditStart) auditStart.value = firstOfMonth;
    if (auditEnd) auditEnd.value = today;

    // Load initial IOLTA data
    loadIOLTAData();
}

// IOLTA Data Cache
let ioltaDataCache = {
    accounts: null,
    clients: null,
    ledgers: null,
    timestamp: 0,
    ledgerTimestamp: 0,
    userId: null
};
const IOLTA_CACHE_TTL = 60000; // 60 seconds (increased from 30)

async function loadIOLTAData(forceRefresh = false) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const now = Date.now();

    // Use cache if valid
    if (!forceRefresh &&
        ioltaDataCache.accounts &&
        ioltaDataCache.clients &&
        ioltaDataCache.userId === userId &&
        (now - ioltaDataCache.timestamp) < IOLTA_CACHE_TTL) {
        ioltaState.trustAccounts = ioltaDataCache.accounts;
        ioltaState.clients = ioltaDataCache.clients;
        populateTrustAccountSelects();
        populateClientSelects();
        return;
    }

    await Promise.all([
        loadTrustAccounts(),
        loadTrustClients()
    ]);

    // Update cache
    ioltaDataCache.accounts = ioltaState.trustAccounts;
    ioltaDataCache.clients = ioltaState.clients;
    ioltaDataCache.timestamp = now;
    ioltaDataCache.userId = userId;
}

// Cached ledger loading
async function loadTrustLedgersCached(forceRefresh = false) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const now = Date.now();

    // Use cache if valid
    if (!forceRefresh &&
        ioltaDataCache.ledgers &&
        ioltaDataCache.userId === userId &&
        (now - ioltaDataCache.ledgerTimestamp) < IOLTA_CACHE_TTL) {
        ioltaState.ledgers = ioltaDataCache.ledgers;
        return;
    }

    await loadTrustLedgers();

    // Update cache
    ioltaDataCache.ledgers = ioltaState.ledgers;
    ioltaDataCache.ledgerTimestamp = now;
}

// =====================================================
// Trust Accounts
// =====================================================

async function loadTrustAccounts() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/accounts/', { user_id: userId });

    if (data.success) {
        ioltaState.trustAccounts = data.data.accounts.filter(a =>
            a.account_type === 'iolta' || a.account_type === 'trust'
        );

        // Populate account selects
        populateTrustAccountSelects();
    }
}

function populateTrustAccountSelects() {
    const selects = [
        'trust-ledger-account-filter',
        'trust-recon-account'
    ];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            ioltaState.trustAccounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = `${acc.account_name} (${acc.account_number_last4 || 'N/A'})`;
                select.appendChild(option);
            });
        }
    });
}

// =====================================================
// Clients
// =====================================================

async function loadTrustClients() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/trust/clients.php', {
        user_id: userId,
        include_inactive: '1'
    });

    if (data.success) {
        ioltaState.clients = data.data.clients;
        renderTrustClients(ioltaState.clients);
        populateClientSelects();
    }
}

function renderTrustClients(clientList) {
    const container = document.getElementById('trust-clients-table-body');
    const empty = document.getElementById('trust-clients-empty');
    const statsContainer = document.getElementById('trust-clients-stats');

    if (!container) return;

    // Calculate stats
    const totalClients = clientList.length;
    const activeClients = clientList.filter(c => c.is_active).length;
    const totalBalance = clientList.reduce((sum, c) => sum + parseFloat(c.total_balance || 0), 0);
    const totalLedgers = clientList.reduce((sum, c) => sum + parseInt(c.ledger_count || 0), 0);

    // Render stats
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div style="background: #eff6ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #bfdbfe;">
                <div style="font-size: 24px; font-weight: 700; color: #1d4ed8;">${totalClients}</div>
                <div style="font-size: 13px; color: #3b82f6;">Total Clients</div>
            </div>
            <div style="background: #ecfdf5; padding: 16px 20px; border-radius: 10px; border: 1px solid #a7f3d0;">
                <div style="font-size: 24px; font-weight: 700; color: #059669;">${activeClients}</div>
                <div style="font-size: 13px; color: #10b981;">Active</div>
            </div>
            <div style="background: #f5f3ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #c4b5fd;">
                <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${totalLedgers}</div>
                <div style="font-size: 13px; color: #8b5cf6;">Total Ledgers</div>
            </div>
            <div style="background: #fefce8; padding: 16px 20px; border-radius: 10px; border: 1px solid #fde047;">
                <div style="font-size: 24px; font-weight: 700; color: #ca8a04;">${formatCurrency(totalBalance)}</div>
                <div style="font-size: 13px; color: #eab308;">Total Balance</div>
            </div>
        `;
    }

    if (clientList.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = clientList.map((client, index) => {
        const balance = parseFloat(client.total_balance || 0);
        const isActive = client.is_active;
        const initials = (client.client_name || 'C').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bgColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
        const bgColor = bgColors[index % bgColors.length];

        return `
            <div style="display: grid; grid-template-columns: 2fr 1.2fr 1.5fr 0.8fr 1.2fr 0.8fr 0.8fr; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: background 0.15s;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                <!-- Client -->
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(client.client_name)}</div>
                        <div style="font-size: 12px; color: #94a3b8;">${client.client_number || 'No ID'}</div>
                    </div>
                </div>

                <!-- Matter -->
                <div>
                    <div style="font-size: 14px; color: #334155;">${client.matter_number || '-'}</div>
                    ${client.matter_description ? `<div style="font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${escapeHtml(client.matter_description)}">${escapeHtml(client.matter_description)}</div>` : ''}
                </div>

                <!-- Contact -->
                <div>
                    ${client.contact_email ? `<div style="font-size: 13px; color: #334155;">${escapeHtml(client.contact_email)}</div>` : '<div style="color: #94a3b8;">-</div>'}
                    ${client.contact_phone ? `<div style="font-size: 12px; color: #94a3b8;">${client.contact_phone}</div>` : ''}
                </div>

                <!-- Ledgers -->
                <div style="text-align: center;">
                    <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; background: #f1f5f9; border-radius: 6px; font-size: 13px; font-weight: 600; color: #475569;">
                        ${client.ledger_count || 0}
                    </span>
                </div>

                <!-- Balance -->
                <div style="text-align: right;">
                    <div style="font-size: 15px; font-weight: 600; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                        ${formatCurrency(balance)}
                    </div>
                </div>

                <!-- Status -->
                <div style="text-align: center;">
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; ${isActive ? 'background: #ecfdf5; color: #059669;' : 'background: #f1f5f9; color: #64748b;'}">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>

                <!-- Actions -->
                <div style="text-align: center;">
                    <button onclick="editTrustClient(${client.id})"
                            style="padding: 6px 14px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #475569; cursor: pointer; transition: all 0.15s;"
                            onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'"
                            onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0'">
                        Edit
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function populateClientSelects() {
    const selects = ['statement-client'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            ioltaState.clients.filter(c => c.is_active).forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.client_name}${client.matter_number ? ` (${client.matter_number})` : ''}`;
                select.appendChild(option);
            });
        }
    });
}

function openClientModal(clientId = null) {
    const modalBody = document.getElementById('modal-body');
    document.getElementById('modal-title').textContent = clientId ? 'Edit Client' : 'Add Client';

    modalBody.innerHTML = `
        <form id="client-form" onsubmit="saveTrustClient(event)">
            <input type="hidden" id="client-id" value="${clientId || ''}">
            <div class="form-group">
                <label>Client Name *</label>
                <input type="text" id="client-name" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Case #</label>
                <input type="text" id="client-number" class="form-input" placeholder="e.g., 2024-001">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="client-email" class="form-input">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="text" id="client-phone" class="form-input">
                </div>
            </div>
            <div class="form-group">
                <label>Address</label>
                <textarea id="client-address" class="form-input" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Memo</label>
                <textarea id="client-notes" class="form-input" rows="2"></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Client</button>
            </div>
        </form>
    `;

    // Open modal overlay directly
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('open');
    }
}

async function editTrustClient(clientId) {
    const data = await apiGet('/trust/clients.php', { id: clientId });

    if (data.success) {
        const client = data.data.client;
        // First open the modal with form
        openClientModal(clientId);

        // Then populate fields (using setTimeout to ensure DOM is ready)
        setTimeout(() => {
            const nameEl = document.getElementById('client-name');
            if (nameEl) nameEl.value = client.client_name || '';

            const numberEl = document.getElementById('client-number');
            if (numberEl) numberEl.value = client.client_number || '';

            const emailEl = document.getElementById('client-email');
            if (emailEl) emailEl.value = client.contact_email || '';

            const phoneEl = document.getElementById('client-phone');
            if (phoneEl) phoneEl.value = client.contact_phone || '';

            const addressEl = document.getElementById('client-address');
            if (addressEl) addressEl.value = client.address || '';

            const notesEl = document.getElementById('client-notes');
            if (notesEl) notesEl.value = client.notes || '';
        }, 10);
    }
}

async function saveTrustClient(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const clientId = document.getElementById('client-id').value;

    const clientData = {
        user_id: userId,
        client_name: document.getElementById('client-name').value,
        client_number: document.getElementById('client-number').value || null,
        contact_email: document.getElementById('client-email').value || null,
        contact_phone: document.getElementById('client-phone').value || null,
        address: document.getElementById('client-address').value || null,
        notes: document.getElementById('client-notes').value || null
    };

    let result;
    if (clientId) {
        clientData.id = parseInt(clientId);
        result = await apiRequest('/trust/clients.php', 'PUT', clientData);
    } else {
        result = await apiPost('/trust/clients.php', clientData);
    }

    if (result.success) {
        showToast(clientId ? 'Client updated' : 'Client created', 'success');
        closeModal();

        // Refresh all client lists
        await loadTrustClients();
        await loadTrustLedgers();

        // Update Operations page sidebars if present
        if (document.getElementById('ops-client-list')) {
            renderOpsClientSidebar(currentOpsTab);
        }
        if (document.getElementById('receive-client-list')) {
            renderReceiveClientSidebar();
        }
        if (document.getElementById('checks-client-list')) {
            renderChecksClientSidebar();
        }
        if (document.getElementById('deposit-client-list')) {
            renderDepositClientSidebar();
        }
    } else {
        showToast(result.message || 'Error saving client', 'error');
    }
}

// =====================================================
// Ledgers
// =====================================================

async function loadTrustLedgers() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const accountId = document.getElementById('trust-ledger-account-filter')?.value;

    const params = { user_id: userId, include_inactive: '1' };
    if (accountId) params.account_id = accountId;

    const data = await apiGet('/trust/ledger.php', params);

    if (data.success) {
        ioltaState.ledgers = data.data.ledgers;
        renderTrustLedgers(ioltaState.ledgers);
        populateLedgerSelects();
    }
}

function renderTrustLedgers(ledgerList) {
    const container = document.getElementById('trust-ledgers-table-body');
    const empty = document.getElementById('trust-ledgers-empty');
    const statsContainer = document.getElementById('trust-ledgers-stats');

    if (!container) return;

    // Calculate stats
    const totalLedgers = ledgerList.length;
    const activeLedgers = ledgerList.filter(l => l.is_active).length;
    const totalBalance = ledgerList.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
    const totalTransactions = ledgerList.reduce((sum, l) => sum + parseInt(l.transaction_count || 0), 0);

    // Render stats
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div style="background: #f5f3ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #c4b5fd;">
                <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${totalLedgers}</div>
                <div style="font-size: 13px; color: #8b5cf6;">Total Ledgers</div>
            </div>
            <div style="background: #ecfdf5; padding: 16px 20px; border-radius: 10px; border: 1px solid #a7f3d0;">
                <div style="font-size: 24px; font-weight: 700; color: #059669;">${activeLedgers}</div>
                <div style="font-size: 13px; color: #10b981;">Active</div>
            </div>
            <div style="background: #eff6ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #bfdbfe;">
                <div style="font-size: 24px; font-weight: 700; color: #1d4ed8;">${formatCurrency(totalBalance)}</div>
                <div style="font-size: 13px; color: #3b82f6;">Total Balance</div>
            </div>
            <div style="background: #fefce8; padding: 16px 20px; border-radius: 10px; border: 1px solid #fde047;">
                <div style="font-size: 24px; font-weight: 700; color: #ca8a04;">${totalTransactions}</div>
                <div style="font-size: 13px; color: #eab308;">Transactions</div>
            </div>
        `;
    }

    if (ledgerList.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = ledgerList.map((ledger, index) => {
        const balance = parseFloat(ledger.current_balance || 0);
        const minBalance = parseFloat(ledger.minimum_balance || 0);
        const isActive = ledger.is_active;
        const isBelowMin = balance < minBalance && minBalance > 0;
        const initials = (ledger.client_name || 'L').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bgColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
        const bgColor = bgColors[index % bgColors.length];

        return `
            <div style="display: grid; grid-template-columns: 2fr 1.5fr 1.2fr 1fr 0.8fr 1.2fr 0.8fr 0.8fr; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: background 0.15s;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                <!-- Client -->
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(ledger.client_name)}</div>
                        ${ledger.matter_number ? `<div style="font-size: 12px; color: #94a3b8;">${escapeHtml(ledger.matter_number)}</div>` : ''}
                    </div>
                </div>

                <!-- Account -->
                <div>
                    <div style="font-size: 14px; color: #334155;">${escapeHtml(ledger.account_name)}</div>
                    ${ledger.account_number_last4 ? `<div style="font-size: 12px; color: #94a3b8;">****${ledger.account_number_last4}</div>` : ''}
                </div>

                <!-- Balance -->
                <div style="text-align: right;">
                    <div style="font-size: 15px; font-weight: 600; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                        ${formatCurrency(balance)}
                    </div>
                    ${isBelowMin ? `<div style="font-size: 11px; color: #ef4444;">⚠️ Below min</div>` : ''}
                </div>

                <!-- Min Balance -->
                <div style="text-align: right; color: #64748b; font-size: 14px;">
                    ${formatCurrency(minBalance)}
                </div>

                <!-- Transactions -->
                <div style="text-align: center;">
                    <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; background: #f1f5f9; border-radius: 6px; font-size: 13px; font-weight: 600; color: #475569;">
                        ${ledger.transaction_count || 0}
                    </span>
                </div>

                <!-- Last Activity -->
                <div style="font-size: 13px; color: #64748b;">
                    ${ledger.last_activity ? formatDate(ledger.last_activity, 'short') : '<span style="color: #94a3b8;">No activity</span>'}
                </div>

                <!-- Status -->
                <div style="text-align: center;">
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; ${isActive ? 'background: #ecfdf5; color: #059669;' : 'background: #fee2e2; color: #dc2626;'}">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
                        ${isActive ? 'Active' : 'Closed'}
                    </span>
                </div>

                <!-- Actions -->
                <div style="text-align: center;">
                    <button onclick="viewLedgerTransactions(${ledger.id})"
                            style="padding: 6px 14px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #475569; cursor: pointer; transition: all 0.15s;"
                            onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'"
                            onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0'">
                        View
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function populateLedgerSelects() {
    const selects = [
        'deposit-ledger', 'disburse-ledger', 'fee-ledger',
        'transfer-from-ledger', 'transfer-to-ledger',
        'trust-trans-ledger-filter'
    ];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            ioltaState.ledgers.filter(l => l.is_active).forEach(ledger => {
                const option = document.createElement('option');
                option.value = ledger.id;
                option.textContent = `${ledger.client_name} - ${ledger.account_name} (${formatCurrency(ledger.current_balance)})`;
                option.dataset.balance = ledger.current_balance;
                option.dataset.client = ledger.client_name;
                select.appendChild(option);
            });
        }
    });
}

async function openLedgerModal() {
    // Make sure data is loaded
    if (!ioltaState.trustAccounts || ioltaState.trustAccounts.length === 0) {
        await loadTrustAccounts();
    }
    if (!ioltaState.clients || ioltaState.clients.length === 0) {
        await loadTrustClients();
    }

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) {
        showToast('Error opening modal', 'error');
        return;
    }

    modalTitle.textContent = 'Open Client Ledger';

    let accountOptions = (ioltaState.trustAccounts || []).map(acc =>
        `<option value="${acc.id}">${acc.account_name}</option>`
    ).join('');

    let clientOptions = (ioltaState.clients || []).filter(c => c.is_active).map(client =>
        `<option value="${client.id}">${client.client_name}${client.matter_number ? ` (${client.matter_number})` : ''}</option>`
    ).join('');

    modalBody.innerHTML = `
        <form id="ledger-form" onsubmit="saveTrustLedger(event)">
            <div class="form-group">
                <label>Trust Account *</label>
                <select id="ledger-account" class="form-select" required>
                    <option value="">Select account...</option>
                    ${accountOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Client *</label>
                <select id="ledger-client" class="form-select" required>
                    <option value="">Select client...</option>
                    ${clientOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Minimum Balance</label>
                <input type="number" id="ledger-min-balance" class="form-input" step="0.01" value="0.00">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Open Ledger</button>
            </div>
        </form>
    `;

    // Open modal overlay directly
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('open');
    }
}

async function saveTrustLedger(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const ledgerData = {
        user_id: userId,
        account_id: document.getElementById('ledger-account').value,
        client_id: document.getElementById('ledger-client').value,
        minimum_balance: document.getElementById('ledger-min-balance').value || 0
    };

    const result = await apiPost('/trust/ledger.php', ledgerData);

    if (result.success) {
        showToast('Ledger opened successfully', 'success');
        closeModal();

        // Refresh ledger lists
        await loadTrustLedgers();

        // Update Operations page sidebars if present
        if (document.getElementById('ops-client-list')) {
            renderOpsClientSidebar(currentOpsTab);
        }
        if (document.getElementById('receive-client-list')) {
            renderReceiveClientSidebar();
        }
        if (document.getElementById('checks-client-list')) {
            renderChecksClientSidebar();
        }
        if (document.getElementById('deposit-client-list')) {
            renderDepositClientSidebar();
        }
    } else {
        showToast(result.message || 'Error opening ledger', 'error');
    }
}

// =====================================================
// Transactions
// =====================================================

// Track selected ledger
let selectedLedgerId = '';

async function loadTrustTransactions() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ledgerId = selectedLedgerId || document.getElementById('trust-trans-ledger-filter')?.value;

    const params = { user_id: userId, all: 1 };
    if (ledgerId) params.ledger_id = ledgerId;

    const data = await apiGet('/trust/transactions.php', params);

    if (data.success) {
        ioltaState.transactions = data.data.transactions;
        renderTrustTransactions(ioltaState.transactions);

        // Update subtitle based on selection
        updateTransactionSubtitle(ledgerId);
    }

    // Also render ledger sidebar
    renderLedgerSidebar();
}

function updateTransactionSubtitle(ledgerId) {
    const subtitle = document.getElementById('trust-trans-subtitle');
    if (!subtitle) return;

    if (ledgerId && ioltaState.ledgers) {
        const ledger = ioltaState.ledgers.find(l => l.id == ledgerId);
        if (ledger) {
            subtitle.textContent = `${ledger.client_name} - ${ledger.account_name}`;
        } else {
            subtitle.textContent = 'All client transactions';
        }
    } else {
        subtitle.textContent = 'All client transactions';
    }
}

function renderLedgerSidebar() {
    const container = document.getElementById('ledger-sidebar-list');
    const totalEl = document.getElementById('ledger-sidebar-total');
    const allOption = document.getElementById('ledger-all-option');

    if (!container) return;

    const ledgers = ioltaState.ledgers || [];

    // Calculate total
    const totalBalance = ledgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
        totalEl.style.color = totalBalance >= 0 ? '#10b981' : '#ef4444';
    }

    // Update "All" option selection state
    if (allOption) {
        allOption.style.background = selectedLedgerId === '' ? '#eff6ff' : 'white';
    }

    if (ledgers.length === 0) {
        container.innerHTML = `
            <div style="padding: 24px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 24px; margin-bottom: 8px;">📭</div>
                <div style="font-size: 13px;">No ledgers found</div>
            </div>
        `;
        return;
    }

    const bgColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

    container.innerHTML = ledgers.map((ledger, index) => {
        const balance = parseFloat(ledger.current_balance || 0);
        const initials = (ledger.client_name || 'L').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bgColor = bgColors[index % bgColors.length];
        const isSelected = selectedLedgerId == ledger.id;

        return `
            <div class="ledger-sidebar-item" data-ledger-id="${ledger.id}" data-client-name="${(ledger.client_name || '').toLowerCase()}"
                 onclick="selectLedger(${ledger.id})"
                 style="padding: 10px 16px; cursor: pointer; transition: background 0.15s; ${isSelected ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}"
                 onmouseover="if(!this.classList.contains('selected')) this.style.background='#f8fafc'"
                 onmouseout="if(!this.classList.contains('selected')) this.style.background='${isSelected ? '#eff6ff' : 'white'}'">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 12px; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 500; color: #1e293b; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(ledger.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8;">${ledger.matter_number || 'No matter'}</div>
                    </div>
                    <div style="text-align: right; flex-shrink: 0;">
                        <div style="font-size: 13px; font-weight: 600; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                            ${formatCurrency(balance)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function selectLedger(ledgerId) {
    selectedLedgerId = ledgerId ? String(ledgerId) : '';

    // Update hidden select for compatibility
    const select = document.getElementById('trust-trans-ledger-filter');
    if (select) {
        select.value = selectedLedgerId;
    }

    // Reload transactions
    loadTrustTransactions();
}

function filterLedgerList(searchText) {
    const items = document.querySelectorAll('.ledger-sidebar-item');
    const search = searchText.toLowerCase().trim();

    items.forEach(item => {
        const clientName = item.dataset.clientName || '';
        if (search === '' || clientName.includes(search)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function renderTrustTransactions(transList) {
    const container = document.getElementById('trust-transactions-table-body');
    const empty = document.getElementById('trust-transactions-empty');
    const statsContainer = document.getElementById('trust-transactions-stats');

    if (!container) return;

    // Calculate stats
    const totalTransactions = transList.length;
    const deposits = transList.filter(t => ['deposit', 'transfer_in', 'refund', 'interest'].includes(t.transaction_type));
    const disbursements = transList.filter(t => !['deposit', 'transfer_in', 'refund', 'interest'].includes(t.transaction_type));
    const totalDeposits = deposits.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
    const totalDisbursements = disbursements.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

    // Render stats
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div style="background: #eff6ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #bfdbfe;">
                <div style="font-size: 24px; font-weight: 700; color: #1d4ed8;">${totalTransactions}</div>
                <div style="font-size: 13px; color: #3b82f6;">Total Transactions</div>
            </div>
            <div style="background: #ecfdf5; padding: 16px 20px; border-radius: 10px; border: 1px solid #a7f3d0;">
                <div style="font-size: 24px; font-weight: 700; color: #059669;">${formatCurrency(totalDeposits)}</div>
                <div style="font-size: 13px; color: #10b981;">Total Deposits</div>
            </div>
            <div style="background: #fef2f2; padding: 16px 20px; border-radius: 10px; border: 1px solid #fecaca;">
                <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${formatCurrency(totalDisbursements)}</div>
                <div style="font-size: 13px; color: #ef4444;">Total Disbursements</div>
            </div>
            <div style="background: #f5f3ff; padding: 16px 20px; border-radius: 10px; border: 1px solid #c4b5fd;">
                <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${formatCurrency(totalDeposits - totalDisbursements)}</div>
                <div style="font-size: 13px; color: #8b5cf6;">Net Movement</div>
            </div>
        `;
    }

    if (transList.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    container.innerHTML = transList.map((trans, index) => {
        const isCredit = ['deposit', 'transfer_in', 'refund', 'interest'].includes(trans.transaction_type);
        const amount = parseFloat(trans.amount || 0);
        const balance = parseFloat(trans.running_balance || 0);
        const typeLabel = trans.transaction_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Type badge colors
        const typeStyles = {
            deposit: { bg: '#ecfdf5', color: '#059669', icon: '↓' },
            disbursement: { bg: '#fef2f2', color: '#dc2626', icon: '↑' },
            transfer_in: { bg: '#eff6ff', color: '#1d4ed8', icon: '←' },
            transfer_out: { bg: '#fff7ed', color: '#ea580c', icon: '→' },
            fee_withdrawal: { bg: '#fefce8', color: '#ca8a04', icon: '💰' },
            refund: { bg: '#ecfdf5', color: '#059669', icon: '↩' },
            interest: { bg: '#f5f3ff', color: '#7c3aed', icon: '%' }
        };
        const typeStyle = typeStyles[trans.transaction_type] || { bg: '#f1f5f9', color: '#475569', icon: '•' };

        // Entity/Payee - Source for deposits, Recipient for disbursements
        const entityLabel = isCredit ? 'From' : 'To';
        const entityName = trans.entity_name || trans.payee || '-';

        // Case/Matter info
        const caseInfo = trans.case_number ? `${trans.case_number}` : '-';

        // Category info
        const categoryName = trans.category_name || '-';

        return `
            <div class="trust-trans-row" data-trans-id="${trans.id}" onclick="openTransactionDetailModal(${trans.id})"
                 style="display: grid; grid-template-columns: 90px 140px 1fr 90px 1fr 110px 100px 1fr 110px 110px; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: background 0.15s; cursor: pointer; font-size: 13px;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                <!-- Date -->
                <div style="color: #334155;">
                    ${formatDate(trans.transaction_date, 'short')}
                </div>

                <!-- Client Ledger -->
                <div style="color: #1e293b; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(trans.client_name)}">
                    ${escapeHtml(trans.client_name)}
                </div>

                <!-- Source/Recipient (Entity) -->
                <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(entityName)}">
                    <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">${entityLabel}:</span>
                    <span style="color: #1e293b; font-weight: 500;">${escapeHtml(entityName)}</span>
                </div>

                <!-- Type -->
                <div style="text-align: center;">
                    <span style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 500; background: ${typeStyle.bg}; color: ${typeStyle.color};">
                        <span>${typeStyle.icon}</span>
                        ${typeLabel}
                    </span>
                </div>

                <!-- Memo/Description -->
                <div style="color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(trans.description)}">
                    ${escapeHtml(trans.description)}
                </div>

                <!-- Case Number -->
                <div style="color: #6366f1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${trans.case_name || ''}">
                    ${caseInfo}
                </div>

                <!-- Category -->
                <div style="color: #64748b; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${categoryName}">
                    ${categoryName}
                </div>

                <!-- Reference -->
                <div style="color: #94a3b8; font-size: 12px;">
                    ${trans.reference_number || trans.check_number || '-'}
                </div>

                <!-- Amount -->
                <div style="text-align: right;">
                    <span style="font-weight: 600; color: ${isCredit ? '#10b981' : '#ef4444'};">
                        ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(amount))}
                    </span>
                </div>

                <!-- Balance -->
                <div style="text-align: right;">
                    <span style="font-weight: 600; color: ${balance >= 0 ? '#1e293b' : '#ef4444'};">
                        ${formatCurrency(balance)}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// Transaction Detail Modal
// =====================================================

let currentTransactionDetail = null;

async function openTransactionDetailModal(transactionId) {
    // Find transaction in current state
    let transaction = ioltaState.transactions?.find(t => t.id == transactionId);

    // If not in state, fetch from API
    if (!transaction) {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        const data = await apiGet('/trust/transactions.php', {
            user_id: userId,
            id: transactionId
        });
        if (data.success && data.data.transactions?.length > 0) {
            transaction = data.data.transactions[0];
        }
    }

    if (!transaction) {
        showToast('Transaction not found', 'error');
        return;
    }

    currentTransactionDetail = transaction;

    const isCredit = ['deposit', 'transfer_in', 'refund', 'interest'].includes(transaction.transaction_type);
    const amount = parseFloat(transaction.amount || 0);
    const typeLabel = transaction.transaction_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Type styling
    const typeStyles = {
        deposit: { bg: '#ecfdf5', color: '#059669', icon: '↓', label: 'Deposit' },
        disbursement: { bg: '#fef2f2', color: '#dc2626', icon: '↑', label: 'Disbursement' },
        transfer_in: { bg: '#eff6ff', color: '#1d4ed8', icon: '←', label: 'Transfer In' },
        transfer_out: { bg: '#fff7ed', color: '#ea580c', icon: '→', label: 'Transfer Out' },
        fee_withdrawal: { bg: '#fefce8', color: '#ca8a04', icon: '💰', label: 'Earned Fee' },
        refund: { bg: '#ecfdf5', color: '#059669', icon: '↩', label: 'Refund' },
        interest: { bg: '#f5f3ff', color: '#7c3aed', icon: '%', label: 'Interest' }
    };
    const typeStyle = typeStyles[transaction.transaction_type] || { bg: '#f1f5f9', color: '#475569', icon: '•', label: typeLabel };

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = 'Transaction Details';

    modalBody.innerHTML = `
        <div class="transaction-detail-modal">
            <!-- Header with type badge and amount -->
            <div class="trans-detail-header">
                <div class="trans-type-badge" style="background: ${typeStyle.bg}; color: ${typeStyle.color};">
                    <span class="type-icon">${typeStyle.icon}</span>
                    <span class="type-label">${typeStyle.label}</span>
                </div>
                <div class="trans-amount ${isCredit ? 'credit' : 'debit'}">
                    ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(amount))}
                </div>
            </div>

            <!-- Details Grid -->
            <div class="trans-detail-grid">
                <div class="trans-detail-row">
                    <div class="detail-label">Date</div>
                    <div class="detail-value">${formatDate(transaction.transaction_date, 'long')}</div>
                </div>
                <div class="trans-detail-row">
                    <div class="detail-label">Client</div>
                    <div class="detail-value">${escapeHtml(transaction.client_name || 'N/A')}</div>
                </div>
                <div class="trans-detail-row">
                    <div class="detail-label">Account</div>
                    <div class="detail-value">${escapeHtml(transaction.account_name || 'N/A')}</div>
                </div>
                ${transaction.reference_number ? `
                <div class="trans-detail-row">
                    <div class="detail-label">Reference #</div>
                    <div class="detail-value">${escapeHtml(transaction.reference_number)}</div>
                </div>
                ` : ''}
                ${transaction.check_number ? `
                <div class="trans-detail-row">
                    <div class="detail-label">Check #</div>
                    <div class="detail-value">${escapeHtml(transaction.check_number)}</div>
                </div>
                ` : ''}
                ${transaction.payee ? `
                <div class="trans-detail-row">
                    <div class="detail-label">Payee</div>
                    <div class="detail-value">${escapeHtml(transaction.payee)}</div>
                </div>
                ` : ''}
                <div class="trans-detail-row">
                    <div class="detail-label">Description</div>
                    <div class="detail-value">${escapeHtml(transaction.description || 'No description')}</div>
                </div>
                ${transaction.memo ? `
                <div class="trans-detail-row">
                    <div class="detail-label">Memo</div>
                    <div class="detail-value">${escapeHtml(transaction.memo)}</div>
                </div>
                ` : ''}
                <div class="trans-detail-row">
                    <div class="detail-label">Running Balance</div>
                    <div class="detail-value" style="font-weight: 600; color: ${parseFloat(transaction.running_balance) >= 0 ? '#1e293b' : '#ef4444'};">
                        ${formatCurrency(transaction.running_balance)}
                    </div>
                </div>
                ${transaction.created_by_name ? `
                <div class="trans-detail-row">
                    <div class="detail-label">Recorded By</div>
                    <div class="detail-value">${escapeHtml(transaction.created_by_name)}</div>
                </div>
                ` : ''}
                <div class="trans-detail-row">
                    <div class="detail-label">Created</div>
                    <div class="detail-value">${formatDate(transaction.created_at, 'datetime')}</div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="trans-detail-actions">
                <button type="button" class="btn btn-secondary" onclick="editTransactionFromDetail(${transaction.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Transaction
                </button>
                <button type="button" class="btn btn-danger" onclick="deleteTransactionFromDetail(${transaction.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `;

    // Open modal overlay directly
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('open');
}

async function editTransactionFromDetail(transactionId) {
    const trans = currentTransactionDetail;
    if (!trans) return;

    closeModal();

    // Open the edit modal with pre-filled data
    await openTrustTransactionEditModal(trans);
}

async function openTrustTransactionEditModal(transaction) {
    // Make sure ledgers are loaded
    if (!ioltaState.ledgers || ioltaState.ledgers.length === 0) {
        await loadTrustLedgers();
    }

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = 'Edit Transaction';

    const activeLedgers = ioltaState.ledgers ? ioltaState.ledgers.filter(l => l.is_active) : [];
    let ledgerOptions = activeLedgers.map(ledger =>
        `<option value="${ledger.id}" ${ledger.id == transaction.ledger_id ? 'selected' : ''}>
            ${ledger.client_name} - ${ledger.account_name} (${formatCurrency(ledger.current_balance)})
        </option>`
    ).join('');

    const transDate = transaction.transaction_date ? transaction.transaction_date.split(' ')[0] : new Date().toISOString().split('T')[0];

    // Map transaction type
    let transType = transaction.transaction_type;
    if (transType === 'transfer_in' || transType === 'transfer_out') transType = 'transfer';

    modalBody.innerHTML = `
        <form id="trust-transaction-edit-form" onsubmit="updateTrustTransaction(event, ${transaction.id})">
            <div class="form-group">
                <label>Transaction Type *</label>
                <select id="edit-trans-type" class="form-select" required disabled>
                    <option value="deposit" ${transaction.transaction_type === 'deposit' ? 'selected' : ''}>Deposit</option>
                    <option value="disbursement" ${transaction.transaction_type === 'disbursement' ? 'selected' : ''}>Disbursement</option>
                    <option value="transfer" ${['transfer_in', 'transfer_out'].includes(transaction.transaction_type) ? 'selected' : ''}>Transfer</option>
                    <option value="fee_withdrawal" ${transaction.transaction_type === 'fee_withdrawal' ? 'selected' : ''}>Earned Fee</option>
                </select>
                <small style="color: #64748b;">Transaction type cannot be changed</small>
            </div>
            <div class="form-group">
                <label>Client Ledger *</label>
                <select id="edit-trans-ledger" class="form-select" required>
                    ${ledgerOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="edit-trans-date" class="form-input" value="${transDate}" required>
            </div>
            <div class="form-group">
                <label>Amount *</label>
                <input type="number" id="edit-trans-amount" class="form-input" step="0.01" min="0.01"
                       value="${Math.abs(parseFloat(transaction.amount))}" required>
            </div>
            ${transaction.reference_number ? `
            <div class="form-group">
                <label>Reference Number</label>
                <input type="text" id="edit-trans-reference" class="form-input" value="${escapeHtml(transaction.reference_number)}">
            </div>
            ` : ''}
            ${transaction.check_number ? `
            <div class="form-group">
                <label>Check Number</label>
                <input type="text" id="edit-trans-check" class="form-input" value="${escapeHtml(transaction.check_number)}">
            </div>
            ` : ''}
            ${transaction.payee ? `
            <div class="form-group">
                <label>Payee</label>
                <input type="text" id="edit-trans-payee" class="form-input" value="${escapeHtml(transaction.payee)}">
            </div>
            ` : ''}
            <div class="form-group">
                <label>Description</label>
                <textarea id="edit-trans-description" class="form-input" rows="2">${escapeHtml(transaction.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Memo</label>
                <textarea id="edit-trans-memo" class="form-input" rows="2">${escapeHtml(transaction.memo || '')}</textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
        </form>
    `;

    // Open modal overlay directly
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('open');
}

async function updateTrustTransaction(event, transactionId) {
    event.preventDefault();

    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = {
        id: transactionId,
        user_id: userId,
        ledger_id: document.getElementById('edit-trans-ledger').value,
        transaction_date: document.getElementById('edit-trans-date').value,
        amount: parseFloat(document.getElementById('edit-trans-amount').value),
        description: document.getElementById('edit-trans-description')?.value || '',
        memo: document.getElementById('edit-trans-memo')?.value || ''
    };

    // Optional fields
    const refEl = document.getElementById('edit-trans-reference');
    const checkEl = document.getElementById('edit-trans-check');
    const payeeEl = document.getElementById('edit-trans-payee');

    if (refEl) data.reference_number = refEl.value;
    if (checkEl) data.check_number = checkEl.value;
    if (payeeEl) data.payee = payeeEl.value;

    try {
        const response = await fetch(`${API_BASE}/trust/transactions.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast('Transaction updated successfully', 'success');
            closeModal();
            await loadTrustTransactions();
        } else {
            showToast(result.message || 'Failed to update transaction', 'error');
        }
    } catch (error) {
        console.error('Update transaction error:', error);
        showToast('Error updating transaction', 'error');
    }
}

async function deleteTransactionFromDetail(transactionId) {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone and may affect ledger balances.')) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch(`${API_BASE}/trust/transactions.php?id=${transactionId}&user_id=${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (result.success) {
            showToast('Transaction deleted successfully', 'success');
            closeModal();
            await loadTrustTransactions();
        } else {
            showToast(result.message || 'Failed to delete transaction', 'error');
        }
    } catch (error) {
        console.error('Delete transaction error:', error);
        showToast('Error deleting transaction', 'error');
    }
}

// =====================================================
// Record Transaction Modal
// =====================================================

async function openTrustTransactionModal() {
    // Make sure ledgers are loaded
    if (!ioltaState.ledgers || ioltaState.ledgers.length === 0) {
        await loadTrustLedgers();
    }

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) {
        console.error('Modal elements not found');
        showToast('Error opening modal', 'error');
        return;
    }

    modalTitle.textContent = 'Record Trust Transaction';

    const activeLedgers = ioltaState.ledgers ? ioltaState.ledgers.filter(l => l.is_active) : [];
    let ledgerOptions = activeLedgers.map(ledger =>
        `<option value="${ledger.id}">${ledger.client_name} - ${ledger.account_name} (${formatCurrency(ledger.current_balance)})</option>`
    ).join('');

    const today = new Date().toISOString().split('T')[0];

    modalBody.innerHTML = `
        <form id="trust-transaction-form" onsubmit="saveTrustTransaction(event)">
            <div class="form-group">
                <label>Transaction Type *</label>
                <select id="trans-type" class="form-select" required onchange="updateTransactionForm()">
                    <option value="">Select type...</option>
                    <option value="deposit">Deposit</option>
                    <option value="disbursement">Disbursement</option>
                    <option value="transfer">Transfer Between Ledgers</option>
                </select>
            </div>
            <div class="form-group">
                <label>Client Ledger *</label>
                <select id="trans-ledger" class="form-select" required>
                    <option value="">Select ledger...</option>
                    ${ledgerOptions}
                </select>
            </div>
            <div class="form-group" id="trans-to-ledger-group" style="display: none;">
                <label>Transfer To Ledger *</label>
                <select id="trans-to-ledger" class="form-select">
                    <option value="">Select destination...</option>
                    ${ledgerOptions}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Amount *</label>
                    <input type="number" id="trans-amount" class="form-input" step="0.01" min="0.01" required>
                </div>
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="trans-date" class="form-input" value="${today}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Description *</label>
                <input type="text" id="trans-description" class="form-input" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Reference #</label>
                    <input type="text" id="trans-reference" class="form-input">
                </div>
                <div class="form-group" id="trans-payee-group" style="display: none;">
                    <label>Payee</label>
                    <input type="text" id="trans-payee" class="form-input">
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Record Transaction</button>
            </div>
        </form>
    `;

    // Open modal overlay directly (same as openClientModal)
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('open');
    }
}

function updateTransactionForm() {
    const type = document.getElementById('trans-type').value;
    const toLedgerGroup = document.getElementById('trans-to-ledger-group');
    const payeeGroup = document.getElementById('trans-payee-group');
    const toLedger = document.getElementById('trans-to-ledger');

    if (type === 'transfer') {
        toLedgerGroup.style.display = 'block';
        toLedger.required = true;
        payeeGroup.style.display = 'none';
    } else if (type === 'disbursement') {
        toLedgerGroup.style.display = 'none';
        toLedger.required = false;
        payeeGroup.style.display = 'block';
    } else {
        toLedgerGroup.style.display = 'none';
        toLedger.required = false;
        payeeGroup.style.display = 'none';
    }
}

async function saveTrustTransaction(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const type = document.getElementById('trans-type').value;

    if (type === 'transfer') {
        // Handle transfer
        const fromLedgerId = document.getElementById('trans-ledger').value;
        const toLedgerId = document.getElementById('trans-to-ledger').value;

        if (fromLedgerId === toLedgerId) {
            showToast('Cannot transfer to the same ledger', 'error');
            return;
        }

        const transferData = {
            user_id: userId,
            from_ledger_id: fromLedgerId,
            to_ledger_id: toLedgerId,
            amount: document.getElementById('trans-amount').value,
            transaction_date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-description').value,
            reference_number: document.getElementById('trans-reference').value || null
        };

        const result = await apiPost('/trust/transfer.php', transferData);

        if (result.success) {
            showToast('Transfer recorded successfully', 'success');
            closeModal();
            loadTrustLedgers();
            loadTrustTransactions();
        } else {
            showToast(result.message || 'Error recording transfer', 'error');
        }
    } else {
        // Handle deposit or disbursement
        const transData = {
            user_id: userId,
            ledger_id: document.getElementById('trans-ledger').value,
            transaction_type: type,
            amount: document.getElementById('trans-amount').value,
            transaction_date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-description').value,
            reference_number: document.getElementById('trans-reference').value || null,
            payee: document.getElementById('trans-payee')?.value || null
        };

        const result = await apiPost('/trust/transactions.php', transData);

        if (result.success) {
            showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} recorded successfully`, 'success');
            closeModal();
            loadTrustLedgers();
            loadTrustTransactions();
        } else {
            showToast(result.message || 'Error recording transaction', 'error');
        }
    }
}

// =====================================================
// Deposit
// =====================================================

async function submitTrustDeposit(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const transData = {
        user_id: userId,
        ledger_id: document.getElementById('deposit-ledger').value,
        transaction_type: 'deposit',
        amount: document.getElementById('deposit-amount').value,
        transaction_date: document.getElementById('deposit-date').value,
        description: document.getElementById('deposit-description').value,
        reference_number: document.getElementById('deposit-reference').value || null
    };

    const result = await apiPost('/trust/transactions.php', transData);

    if (result.success) {
        showToast('Deposit recorded successfully', 'success');
        document.getElementById('trust-deposit-form').reset();
        document.getElementById('deposit-date').value = new Date().toISOString().split('T')[0];
        loadTrustLedgers();
    } else {
        showToast(result.message || 'Error recording deposit', 'error');
    }
}

// =====================================================
// Disburse
// =====================================================

async function submitTrustDisburse(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const transData = {
        user_id: userId,
        ledger_id: document.getElementById('disburse-ledger').value,
        transaction_type: 'disbursement',
        amount: document.getElementById('disburse-amount').value,
        transaction_date: document.getElementById('disburse-date').value,
        description: document.getElementById('disburse-description').value,
        payee: document.getElementById('disburse-payee').value,
        check_number: document.getElementById('disburse-check').value || null
    };

    const result = await apiPost('/trust/transactions.php', transData);

    if (result.success) {
        showToast('Disbursement recorded successfully', 'success');
        document.getElementById('trust-disburse-form').reset();
        document.getElementById('disburse-date').value = new Date().toISOString().split('T')[0];
        loadTrustLedgers();
    } else {
        showToast(result.message || 'Error recording disbursement', 'error');
    }
}

// =====================================================
// Transfer
// =====================================================

async function submitTrustTransfer(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const transferData = {
        user_id: userId,
        transfer_type: 'client_to_client',
        from_ledger_id: document.getElementById('transfer-from-ledger').value,
        to_ledger_id: document.getElementById('transfer-to-ledger').value,
        amount: document.getElementById('transfer-amount').value,
        transaction_date: document.getElementById('transfer-date').value,
        description: document.getElementById('transfer-description').value
    };

    const result = await apiPost('/trust/transfer.php', transferData);

    if (result.success) {
        showToast('Transfer completed successfully', 'success');
        document.getElementById('trust-transfer-form').reset();
        document.getElementById('transfer-date').value = new Date().toISOString().split('T')[0];
        loadTrustLedgers();
    } else {
        showToast(result.message || 'Error processing transfer', 'error');
    }
}

// =====================================================
// Earned Fee
// =====================================================

function updateFeeBalanceHint() {
    updateBalanceHint('fee');
}

function updateBalanceHint(prefix) {
    const select = document.getElementById(`${prefix}-ledger`);
    const hint = document.getElementById(`${prefix}-balance-hint`);
    if (!select || !hint) return;

    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.balance) {
        const balance = parseFloat(selectedOption.dataset.balance);
        const clientName = selectedOption.dataset.client || 'Client';
        hint.innerHTML = `<strong>${clientName}</strong> • Available balance: <strong>${formatCurrency(balance)}</strong>`;
        hint.style.display = 'block';
    } else {
        hint.style.display = 'none';
    }
}

async function submitTrustFee(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const transData = {
        user_id: userId,
        ledger_id: document.getElementById('fee-ledger').value,
        transaction_type: 'earned_fee',
        amount: document.getElementById('fee-amount').value,
        transaction_date: document.getElementById('fee-date').value,
        description: document.getElementById('fee-description').value,
        reference_number: document.getElementById('fee-invoice').value || null
    };

    const result = await apiPost('/trust/transactions.php', transData);

    if (result.success) {
        showToast('Fee withdrawal recorded successfully', 'success');
        document.getElementById('trust-fee-form').reset();
        document.getElementById('fee-date').value = new Date().toISOString().split('T')[0];
        loadTrustLedgers();
    } else {
        showToast(result.message || 'Error recording fee withdrawal', 'error');
    }
}

// =====================================================
// Reconciliation
// =====================================================

async function loadTrustReconcile() {
    // Load IOLTA data first to populate the account dropdown
    await loadIOLTAData();
    populateTrustAccountSelects();

    // Set default date to today
    const dateInput = document.getElementById('trust-recon-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Load reconciliation history
    loadTrustReconHistory();
}

function onTrustReconAccountChange() {
    // When account changes, could optionally pre-fill statement balance
    const accountId = document.getElementById('trust-recon-account')?.value;
    if (accountId) {
        const account = ioltaState.trustAccounts.find(a => a.id == accountId);
        if (account) {
            // Optionally pre-fill with current account balance
            // document.getElementById('trust-recon-statement-balance').value = account.current_balance;
        }
    }
}

async function beginTrustReconciliation() {
    const accountId = document.getElementById('trust-recon-account')?.value;
    const statementDate = document.getElementById('trust-recon-date')?.value;
    const statementBalance = document.getElementById('trust-recon-statement-balance')?.value;

    if (!accountId) {
        showToast('Please select an account', 'error');
        return;
    }

    if (!statementDate) {
        showToast('Please select a statement date', 'error');
        return;
    }

    if (!statementBalance) {
        showToast('Please enter the statement ending balance', 'error');
        return;
    }

    // Show the active reconciliation section
    const activeSection = document.getElementById('trust-recon-active-section');
    if (activeSection) {
        activeSection.style.display = 'block';
    }

    // Update bank balance with entered statement balance
    const bankBalanceEl = document.getElementById('recon-bank-balance');
    if (bankBalanceEl) {
        bankBalanceEl.textContent = formatCurrency(parseFloat(statementBalance));
    }

    // Load the reconciliation data
    await loadTrustReconciliation();

    showToast('Reconciliation started', 'success');
}

async function finishTrustReconciliation() {
    const accountId = document.getElementById('trust-recon-account')?.value;
    const statementDate = document.getElementById('trust-recon-date')?.value;
    const statementBalance = document.getElementById('trust-recon-statement-balance')?.value;

    if (!accountId) {
        showToast('Please start a reconciliation first', 'error');
        return;
    }

    // Check if balanced
    const bankBalance = parseFloat(statementBalance || 0);
    const ledgerTotal = parseFloat(document.getElementById('recon-ledger-total')?.textContent.replace(/[^0-9.-]/g, '') || 0);
    const bookBalance = parseFloat(document.getElementById('recon-book-balance')?.textContent.replace(/[^0-9.-]/g, '') || 0);

    if (Math.abs(bankBalance - ledgerTotal) > 0.01 || Math.abs(bankBalance - bookBalance) > 0.01) {
        if (!confirm('The balances do not match. Are you sure you want to finish reconciliation?')) {
            return;
        }
    }

    // Save reconciliation record
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const result = await apiPost('/trust/reconciliation.php', {
        user_id: userId,
        account_id: accountId,
        statement_date: statementDate,
        statement_balance: bankBalance,
        book_balance: bookBalance,
        ledger_total: ledgerTotal,
        status: 'completed'
    });

    if (result.success) {
        showToast('Reconciliation completed successfully', 'success');

        // Hide active section and reload history
        const activeSection = document.getElementById('trust-recon-active-section');
        if (activeSection) {
            activeSection.style.display = 'none';
        }

        // Reset form
        document.getElementById('trust-recon-statement-balance').value = '';

        loadTrustReconHistory();
    } else {
        showToast(result.message || 'Error saving reconciliation', 'error');
    }
}

function undoTrustReconTransaction() {
    showToast('Undo feature coming soon', 'info');
}

async function loadTrustReconHistory() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const container = document.getElementById('trust-recon-history-list');
    if (!container) return;

    const result = await apiGet('/trust/reconciliation.php', {
        user_id: userId,
        limit: 10
    });

    if (result.success && result.data.reconciliations && result.data.reconciliations.length > 0) {
        container.innerHTML = result.data.reconciliations.map(rec => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                <div>
                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(rec.account_name || 'Trust Account')}</div>
                    <div style="font-size: 12px; color: #94a3b8;">${formatDate(rec.statement_date)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; color: #10b981;">${formatCurrency(rec.statement_balance)}</div>
                    <div style="font-size: 11px; color: ${rec.status === 'completed' ? '#10b981' : '#f59e0b'};">${rec.status === 'completed' ? '✓ Completed' : 'In Progress'}</div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = 'No reconciliations completed yet';
    }
}

async function loadTrustReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const accountId = document.getElementById('trust-recon-account')?.value;

    if (!accountId) return;

    const data = await apiGet('/trust/reports.php', {
        type: 'account_summary',
        account_id: accountId,
        user_id: userId
    });

    if (data.success) {
        const summary = data.data.summary;
        const accountBalance = parseFloat(summary.totals?.account_balance || 0);
        const ledgerTotal = parseFloat(summary.totals?.total_client_balance || 0);
        const difference = accountBalance - ledgerTotal;
        const isBalanced = Math.abs(difference) < 0.01;

        // Update balance displays
        document.getElementById('recon-bank-balance').textContent = formatCurrency(accountBalance);
        document.getElementById('recon-book-balance').textContent = formatCurrency(accountBalance);
        document.getElementById('recon-ledger-total').textContent = formatCurrency(ledgerTotal);

        // Update difference card
        const diffEl = document.getElementById('recon-difference');
        const diffCard = document.getElementById('recon-difference-card');
        const statusIcon = document.getElementById('recon-status-icon');

        diffEl.textContent = formatCurrency(Math.abs(difference));

        if (isBalanced) {
            diffEl.style.color = '#10b981';
            diffCard.style.background = '#ecfdf5';
            diffCard.style.borderColor = '#10b981';
            statusIcon.innerHTML = '✅';
            statusIcon.style.background = '#10b981';
            statusIcon.style.color = 'white';
        } else {
            diffEl.style.color = '#ef4444';
            diffCard.style.background = '#fef2f2';
            diffCard.style.borderColor = '#ef4444';
            statusIcon.innerHTML = '⚠️';
            statusIcon.style.background = '#fef2f2';
        }

        // Update ledger count
        const countEl = document.getElementById('recon-ledger-count');
        if (countEl) {
            const count = summary.ledgers?.length || 0;
            countEl.textContent = `${count} client${count !== 1 ? 's' : ''}`;
        }

        // Render ledger breakdown
        const container = document.getElementById('recon-ledger-breakdown');
        if (container && summary.ledgers) {
            if (summary.ledgers.length === 0) {
                container.innerHTML = `
                    <div style="padding: 48px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
                        <div>No client ledgers found for this account</div>
                    </div>
                `;
            } else {
                container.innerHTML = summary.ledgers.map((ledger, index) => {
                    const balance = parseFloat(ledger.current_balance || 0);
                    const isPositive = balance >= 0;
                    const percentage = ledgerTotal > 0 ? ((balance / ledgerTotal) * 100).toFixed(1) : 0;

                    return `
                        <div style="display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; gap: 16px;"
                             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                            <!-- Avatar -->
                            <div style="width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                                ${(ledger.client_name || 'C').charAt(0).toUpperCase()}
                            </div>

                            <!-- Client Info -->
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 2px;">
                                    ${escapeHtml(ledger.client_name || 'Unknown Client')}
                                </div>
                                <div style="font-size: 12px; color: #64748b;">
                                    ${ledger.matter_number ? `Matter: ${ledger.matter_number}` : 'No matter number'}
                                </div>
                            </div>

                            <!-- Balance -->
                            <div style="text-align: right;">
                                <div style="font-size: 16px; font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'};">
                                    ${formatCurrency(balance)}
                                </div>
                                <div style="font-size: 11px; color: #94a3b8;">
                                    ${percentage}% of total
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Add total row
                container.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-top: 2px solid #e2e8f0;">
                        <div style="font-weight: 600; color: #475569;">Total Client Balances</div>
                        <div style="font-size: 18px; font-weight: 700; color: #1e293b;">${formatCurrency(ledgerTotal)}</div>
                    </div>
                `;
            }
        }
    }
}

// =====================================================
// Audit Log
// =====================================================

async function loadTrustAuditLog() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const startDate = document.getElementById('audit-start-date')?.value;
    const endDate = document.getElementById('audit-end-date')?.value;

    const params = {
        type: 'audit_trail',
        user_id: userId,
        limit: 100
    };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const data = await apiGet('/trust/reports.php', params);

    if (data.success && data.data.audit_trail) {
        const { entries, summary } = data.data.audit_trail;

        // Render summary stats
        const statsContainer = document.getElementById('audit-summary-stats');
        if (statsContainer && summary) {
            const actionIcons = {
                'client_created': { icon: '👤', color: '#10b981', bg: '#ecfdf5' },
                'client_updated': { icon: '✏️', color: '#3b82f6', bg: '#eff6ff' },
                'deposit': { icon: '💰', color: '#10b981', bg: '#ecfdf5' },
                'disbursement': { icon: '📤', color: '#f59e0b', bg: '#fffbeb' },
                'transfer_in': { icon: '↘️', color: '#8b5cf6', bg: '#f5f3ff' },
                'transfer_out': { icon: '↗️', color: '#8b5cf6', bg: '#f5f3ff' },
                'reconciliation_started': { icon: '🔄', color: '#6366f1', bg: '#eef2ff' },
                'reconciliation_completed': { icon: '✅', color: '#10b981', bg: '#ecfdf5' }
            };

            statsContainer.innerHTML = summary.map(s => {
                const config = actionIcons[s.action] || { icon: '📋', color: '#64748b', bg: '#f8fafc' };
                const label = s.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                return `
                    <div style="background: ${config.bg}; padding: 16px; border-radius: 10px; border: 1px solid ${config.color}20;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 20px;">${config.icon}</span>
                            <div>
                                <div style="font-size: 22px; font-weight: 600; color: ${config.color};">${s.count}</div>
                                <div style="font-size: 12px; color: #64748b;">${label}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render audit log entries
        const container = document.getElementById('audit-log-container');
        if (container) {
            if (entries.length === 0) {
                container.innerHTML = `
                    <div style="padding: 48px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                        <div style="font-size: 16px; font-weight: 500;">No audit entries found</div>
                        <div style="font-size: 14px; margin-top: 4px;">Try adjusting the date range</div>
                    </div>
                `;
                return;
            }

            // Group entries by date
            const groupedByDate = {};
            entries.forEach(entry => {
                const date = entry.created_at.split(' ')[0];
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(entry);
            });

            let html = '';
            Object.keys(groupedByDate).forEach(date => {
                const displayDate = new Date(date).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
                });

                html += `
                    <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #475569; position: sticky; top: 0;">
                        ${displayDate}
                    </div>
                `;

                groupedByDate[date].forEach(entry => {
                    const time = entry.created_at.split(' ')[1]?.substring(0, 5) || '';
                    const actionConfig = getAuditActionConfig(entry.action);
                    const details = formatAuditDetails(entry);

                    html += `
                        <div style="display: flex; align-items: flex-start; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; background: white;"
                             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                            <!-- Icon -->
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: ${actionConfig.bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <span style="font-size: 18px;">${actionConfig.icon}</span>
                            </div>

                            <!-- Content -->
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-weight: 600; color: #1e293b; font-size: 14px;">${actionConfig.label}</span>
                                    <span style="font-size: 11px; padding: 2px 8px; background: ${actionConfig.bg}; color: ${actionConfig.color}; border-radius: 4px; font-weight: 500;">${entry.entity_type?.replace('trust_', '') || 'system'}</span>
                                </div>
                                <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">
                                    ${entry.client_name ? `<strong>${entry.client_name}</strong> • ` : ''}${details}
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: #94a3b8;">
                                    <span>🕐 ${time}</span>
                                    <span>👤 ${entry.username || 'System'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
            });

            container.innerHTML = html;
        }
    }
}

function getAuditActionConfig(action) {
    const configs = {
        'client_created': { icon: '👤', color: '#10b981', bg: '#ecfdf5', label: 'Client Created' },
        'client_updated': { icon: '✏️', color: '#3b82f6', bg: '#eff6ff', label: 'Client Updated' },
        'ledger_created': { icon: '📒', color: '#8b5cf6', bg: '#f5f3ff', label: 'Ledger Created' },
        'deposit': { icon: '💰', color: '#10b981', bg: '#ecfdf5', label: 'Deposit' },
        'disbursement': { icon: '📤', color: '#f59e0b', bg: '#fffbeb', label: 'Disbursement' },
        'transfer_in': { icon: '↘️', color: '#06b6d4', bg: '#ecfeff', label: 'Transfer In' },
        'transfer_out': { icon: '↗️', color: '#f97316', bg: '#fff7ed', label: 'Transfer Out' },
        'earned_fee': { icon: '💵', color: '#84cc16', bg: '#f7fee7', label: 'Earned Fee' },
        'reconciliation_started': { icon: '🔄', color: '#6366f1', bg: '#eef2ff', label: 'Reconciliation Started' },
        'reconciliation_completed': { icon: '✅', color: '#10b981', bg: '#ecfdf5', label: 'Reconciliation Completed' }
    };
    return configs[action] || { icon: '📋', color: '#64748b', bg: '#f8fafc', label: action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
}

function formatAuditDetails(entry) {
    try {
        if (entry.description) return entry.description;

        const values = entry.new_values ? JSON.parse(entry.new_values) : null;
        if (!values) return 'No details available';

        // Format based on action type
        if (entry.action === 'client_created' || entry.action === 'client_updated') {
            const parts = [];
            if (values.client_name) parts.push(values.client_name);
            if (values.matter_number) parts.push(`Matter: ${values.matter_number}`);
            if (values.is_active === 0) parts.push('Deactivated');
            return parts.join(' • ') || 'Client details updated';
        }

        if (entry.action.includes('deposit') || entry.action.includes('disbursement')) {
            if (values.amount) return `Amount: ${formatCurrency(Math.abs(values.amount))}`;
        }

        // Generic format
        const keys = Object.keys(values).slice(0, 2);
        return keys.map(k => `${k.replace(/_/g, ' ')}: ${String(values[k]).substring(0, 30)}`).join(' • ');
    } catch (e) {
        return entry.description || 'Details available';
    }
}

// =====================================================
// Trust Reports
// =====================================================

let currentReportType = null;
let currentReportData = null;

async function showTrustReport(reportType) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const displayArea = document.getElementById('trust-report-display');
    const gridArea = document.querySelector('.trust-reports-grid');
    const contentArea = document.getElementById('trust-report-content');

    if (!displayArea || !contentArea) return;

    // Show loading
    contentArea.innerHTML = '<div class="loading-spinner">Loading report...</div>';
    displayArea.style.display = 'block';
    if (gridArea) gridArea.style.display = 'none';

    currentReportType = reportType;

    try {
        const data = await apiGet('/trust/reports.php', {
            type: reportType,
            user_id: userId
        });

        if (data.success) {
            currentReportData = data.data;
            renderTrustReport(reportType, data.data);
        } else {
            contentArea.innerHTML = `<div class="empty-state"><p>Error loading report: ${data.message || 'Unknown error'}</p></div>`;
        }
    } catch (error) {
        console.error('Report error:', error);
        contentArea.innerHTML = '<div class="empty-state"><p>Failed to load report</p></div>';
    }
}

function hideTrustReport() {
    const displayArea = document.getElementById('trust-report-display');
    const gridArea = document.querySelector('.trust-reports-grid');

    if (displayArea) displayArea.style.display = 'none';
    if (gridArea) gridArea.style.display = 'flex';

    currentReportType = null;
    currentReportData = null;
}

function renderTrustReport(reportType, data) {
    const contentArea = document.getElementById('trust-report-content');
    if (!contentArea) return;

    switch (reportType) {
        case 'balance_summary':
            renderBalanceSummaryReport(contentArea, data);
            break;
        case 'account_summary':
            renderAccountSummaryReport(contentArea, data);
            break;
        case 'audit_trail':
            renderAuditTrailReport(contentArea, data);
            break;
        default:
            contentArea.innerHTML = '<div class="empty-state"><p>Unknown report type</p></div>';
    }
}

function renderBalanceSummaryReport(container, data) {
    const summary = data.balance_summary;
    const totals = summary.totals;

    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Trust Account Summary</h3>
            <div class="report-summary-cards">
                <div class="report-summary-card">
                    <div class="label">Trust Accounts</div>
                    <div class="value">${totals.account_count}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Client Ledgers</div>
                    <div class="value">${totals.total_ledgers}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Total Bank Balance</div>
                    <div class="value">${formatCurrency(totals.grand_total_account)}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Total Client Balance</div>
                    <div class="value">${formatCurrency(totals.grand_total_client)}</div>
                </div>
            </div>
        </div>

        <div class="report-section">
            <h3 class="report-section-title">Account Details</h3>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Client Ledgers</th>
                        <th style="text-align: right">Bank Balance</th>
                        <th style="text-align: right">Client Total</th>
                        <th style="text-align: right">Difference</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${summary.accounts.map(acc => `
                        <tr>
                            <td>
                                <strong>${escapeHtml(acc.account_name)}</strong>
                                ${acc.account_number_last4 ? `<br><small style="color: var(--text-muted)">****${acc.account_number_last4}</small>` : ''}
                            </td>
                            <td>${acc.ledger_count} (${acc.active_ledgers} active)</td>
                            <td style="text-align: right; font-weight: 600">${formatCurrency(acc.account_balance)}</td>
                            <td style="text-align: right; font-weight: 600">${formatCurrency(acc.client_total)}</td>
                            <td style="text-align: right; font-weight: 600; color: ${acc.difference !== 0 ? 'var(--danger)' : 'var(--success)'}">
                                ${formatCurrency(acc.difference)}
                            </td>
                            <td>
                                <span class="status-badge ${acc.is_balanced ? 'balanced' : 'unbalanced'}">
                                    ${acc.is_balanced ? 'Balanced' : 'Unbalanced'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="report-footer" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted);">
            Generated: ${data.generated_at}
        </div>
    `;
}

function renderAccountSummaryReport(container, data) {
    // Need to select an account first
    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Select Trust Account</h3>
            <div style="max-width: 400px;">
                <select id="account-summary-select" class="form-select" onchange="loadAccountSummary()">
                    <option value="">Choose an account...</option>
                </select>
            </div>
        </div>
        <div id="account-summary-content"></div>
    `;

    // Populate accounts dropdown
    populateAccountSummarySelect();
}

async function populateAccountSummarySelect() {
    const select = document.getElementById('account-summary-select');
    if (!select) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/accounts/', { user_id: userId });

    if (data.success) {
        const trustAccounts = data.data.accounts.filter(a => a.account_type === 'iolta' || a.account_type === 'trust');
        select.innerHTML = '<option value="">Choose an account...</option>' +
            trustAccounts.map(acc => `<option value="${acc.id}">${escapeHtml(acc.account_name)}</option>`).join('');
    }
}

async function loadAccountSummary() {
    const accountId = document.getElementById('account-summary-select')?.value;
    const container = document.getElementById('account-summary-content');
    if (!accountId || !container) return;

    container.innerHTML = '<div class="loading-spinner">Loading...</div>';

    const data = await apiGet('/trust/reports.php', {
        type: 'account_summary',
        account_id: accountId
    });

    if (data.success) {
        const summary = data.data.summary;
        const account = summary.account;
        const totals = summary.totals;

        container.innerHTML = `
            <div class="report-section" style="margin-top: 24px;">
                <h3 class="report-section-title">${escapeHtml(account.account_name)}</h3>
                <div class="report-summary-cards">
                    <div class="report-summary-card">
                        <div class="label">Bank Balance</div>
                        <div class="value">${formatCurrency(totals.account_balance)}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Client Total</div>
                        <div class="value">${formatCurrency(totals.total_client_balance)}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Active Ledgers</div>
                        <div class="value">${totals.active_ledgers}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Status</div>
                        <div class="value ${totals.is_balanced ? 'success' : 'danger'}">${totals.is_balanced ? 'Balanced' : 'Unbalanced'}</div>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h3 class="report-section-title">Client Ledgers</h3>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>Client</th>
                            <th>Matter</th>
                            <th style="text-align: right">Balance</th>
                            <th>Transactions</th>
                            <th>Last Activity</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summary.ledgers.map(ledger => `
                            <tr>
                                <td><strong>${escapeHtml(ledger.client_name)}</strong></td>
                                <td>${ledger.matter_number || '-'}</td>
                                <td style="text-align: right; font-weight: 600">${formatCurrency(ledger.current_balance)}</td>
                                <td>${ledger.transaction_count}</td>
                                <td>${ledger.last_activity ? formatDate(ledger.last_activity, 'short') : 'No activity'}</td>
                                <td>
                                    <span class="status-badge ${ledger.is_active ? 'balanced' : 'unbalanced'}">
                                        ${ledger.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

function renderAuditTrailReport(container, data) {
    const audit = data.audit_trail;

    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Audit Trail (${audit.period.start_date} to ${audit.period.end_date})</h3>
            <div class="report-summary-cards">
                <div class="report-summary-card">
                    <div class="label">Total Entries</div>
                    <div class="value">${audit.total_entries}</div>
                </div>
                ${audit.summary.slice(0, 3).map(s => `
                    <div class="report-summary-card">
                        <div class="label">${s.action.replace(/_/g, ' ')}</div>
                        <div class="value">${s.count}</div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="report-section">
            <h3 class="report-section-title">Activity Log</h3>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Client</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${audit.entries.map(entry => `
                        <tr>
                            <td>${formatDate(entry.created_at, 'datetime')}</td>
                            <td>${escapeHtml(entry.username || 'System')}</td>
                            <td><span class="status-badge balanced">${entry.action.replace(/_/g, ' ')}</span></td>
                            <td>${escapeHtml(entry.client_name || '-')}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(entry.description || '-')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function printTrustReport() {
    window.print();
}

function exportTrustReportPDF() {
    showToast('PDF export coming soon', 'info');
}

// Legacy function for compatibility
async function generateTrustReport(reportType) {
    showTrustReport(reportType);
}

// =====================================================
// Client Statements
// =====================================================

async function loadTrustStatements() {
    const clientSelect = document.getElementById('statement-client');
    if (!clientSelect) return;

    // Set default dates
    const startDate = document.getElementById('statement-start-date');
    const endDate = document.getElementById('statement-end-date');

    if (startDate && !startDate.value) {
        const firstOfMonth = new Date();
        firstOfMonth.setDate(1);
        startDate.value = firstOfMonth.toISOString().split('T')[0];
    }

    if (endDate && !endDate.value) {
        endDate.value = new Date().toISOString().split('T')[0];
    }

    // Load clients
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/trust/clients.php', { user_id: userId });

    if (data.success) {
        clientSelect.innerHTML = '<option value="">Choose a client...</option>' +
            data.data.clients.map(c => `<option value="${c.id}">${escapeHtml(c.client_name)}${c.matter_number ? ` - ${c.matter_number}` : ''}</option>`).join('');
    }
}

async function onStatementClientChange() {
    const clientId = document.getElementById('statement-client')?.value;
    const ledgerSelect = document.getElementById('statement-ledger');

    if (!clientId || !ledgerSelect) {
        if (ledgerSelect) ledgerSelect.innerHTML = '<option value="">Select client first...</option>';
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/trust/ledger.php', {
        user_id: userId,
        client_id: clientId
    });

    if (data.success && data.data.ledgers.length > 0) {
        ledgerSelect.innerHTML = data.data.ledgers.map(l =>
            `<option value="${l.id}">${escapeHtml(l.account_name)} - ${formatCurrency(l.current_balance)}</option>`
        ).join('');

        // Auto-load first ledger
        loadClientStatementData();
    } else {
        ledgerSelect.innerHTML = '<option value="">No ledgers found</option>';
    }
}

async function loadClientStatementData() {
    const ledgerId = document.getElementById('statement-ledger')?.value;
    const startDate = document.getElementById('statement-start-date')?.value;
    const endDate = document.getElementById('statement-end-date')?.value;
    const container = document.getElementById('client-statement-container');

    if (!ledgerId || !container) return;

    container.innerHTML = '<div class="loading-spinner" style="padding: 80px; text-align: center;">Loading statement...</div>';

    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = await apiGet('/trust/reports.php', {
        type: 'client_statement',
        ledger_id: ledgerId,
        user_id: userId,
        start_date: startDate,
        end_date: endDate
    });

    if (data.success) {
        const stmt = data.data.statement;
        const ledger = stmt.ledger;

        container.innerHTML = `
            <div class="statement-wrapper">
                <div class="statement-header-info">
                    <div class="statement-client-info">
                        <h3>${escapeHtml(ledger.client_name)}</h3>
                        <p>Client #: ${ledger.client_number || 'N/A'}</p>
                        <p>Matter: ${ledger.matter_number || 'N/A'} ${ledger.matter_description ? `- ${escapeHtml(ledger.matter_description)}` : ''}</p>
                        <p>Account: ${escapeHtml(ledger.account_name)} ****${ledger.account_number_last4 || '----'}</p>
                    </div>
                    <div class="statement-period-info">
                        <div class="period-label">Statement Period</div>
                        <div class="period-dates">${formatDate(stmt.period.start_date, 'short')} - ${formatDate(stmt.period.end_date, 'short')}</div>
                    </div>
                </div>

                <div class="statement-summary-row">
                    <div class="statement-summary-item">
                        <div class="label">Opening Balance</div>
                        <div class="value">${formatCurrency(stmt.opening_balance)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Total Deposits</div>
                        <div class="value positive">+${formatCurrency(stmt.total_deposits)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Total Disbursements</div>
                        <div class="value negative">-${formatCurrency(stmt.total_disbursements)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Closing Balance</div>
                        <div class="value">${formatCurrency(stmt.closing_balance)}</div>
                    </div>
                </div>

                <table class="statement-transactions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Reference</th>
                            <th>Description</th>
                            <th style="text-align: right">Debit</th>
                            <th style="text-align: right">Credit</th>
                            <th style="text-align: right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stmt.transactions.length === 0 ? `
                            <tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No transactions in this period</td></tr>
                        ` : stmt.transactions.map(t => `
                            <tr>
                                <td>${formatDate(t.transaction_date, 'short')}</td>
                                <td>${t.reference_number || '-'}</td>
                                <td>${escapeHtml(t.description || t.transaction_type)}</td>
                                <td style="text-align: right" class="amount-debit">${t.amount < 0 ? formatCurrency(Math.abs(t.amount)) : ''}</td>
                                <td style="text-align: right" class="amount-credit">${t.amount >= 0 ? formatCurrency(t.amount) : ''}</td>
                                <td style="text-align: right" class="balance-cell">${formatCurrency(t.running_balance)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="statement-footer">
                    <button class="btn btn-secondary" onclick="printClientStatement()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        Print Statement
                    </button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `<div class="trust-statement-empty"><p>Error loading statement</p></div>`;
    }
}

// Legacy function
async function loadClientStatement() {
    onStatementClientChange();
}

function printClientStatement() {
    window.print();
}

// =====================================================
// Helper for viewing ledger transactions
// =====================================================

function viewLedgerTransactions(ledgerId) {
    const select = document.getElementById('trust-trans-ledger-filter');
    if (select) {
        select.value = ledgerId;
    }
    navigateTo('trust-transactions');
    loadTrustTransactions();
}

// =====================================================
// Check History Selection Functions
// =====================================================

// Track last clicked checkbox for shift-select
let lastClickedCheckbox = null;

// Toggle select all checkboxes
function toggleSelectAllChecks(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', masterCheckbox.checked);
            row.style.background = masterCheckbox.checked ? '#eff6ff' : 'transparent';
        }
    });
    lastClickedCheckbox = null;
    updateCheckSelection();
}

// Handle checkbox click with shift-select support
function handleCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.check-tx-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.classList.toggle('selected', shouldCheck);
                    row.style.background = shouldCheck ? '#eff6ff' : 'transparent';
                }
            }
        }
    }

    lastClickedCheckbox = checkbox;
    updateCheckSelection();
}

// Update selection count and show/hide delete button
function updateCheckSelection() {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox:checked');
    const count = checkboxes.length;
    const deleteBtn = document.getElementById('checks-delete-selected-btn');
    const countSpan = document.getElementById('checks-selected-count');
    const selectAllCheckbox = document.getElementById('checks-select-all');

    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = count;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.check-tx-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // Update row backgrounds
    document.querySelectorAll('.check-tx-checkbox').forEach(cb => {
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', cb.checked);
            if (!row.matches(':hover')) {
                row.style.background = cb.checked ? '#eff6ff' : 'transparent';
            }
        }
    });
}

// Delete selected check transactions
async function deleteSelectedChecks() {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.txId);

    if (ids.length === 0) {
        showToast('No transactions selected', 'error');
        return;
    }

    const confirmMsg = ids.length === 1
        ? 'Are you sure you want to delete this transaction?'
        : `Are you sure you want to delete ${ids.length} transactions?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    // Delete each selected transaction
    for (const txId of ids) {
        try {
            // DELETE uses query parameters, not body
            const result = await apiDelete(`/trust/transactions.php?id=${txId}&user_id=${userId}`);
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Failed to delete transaction:', txId, result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Error deleting transaction:', txId, error);
        }
    }

    // Show result
    if (successCount > 0) {
        showToast(`Deleted ${successCount} transaction${successCount > 1 ? 's' : ''}`, 'success');
    }
    if (errorCount > 0) {
        showToast(`Failed to delete ${errorCount} transaction${errorCount > 1 ? 's' : ''}`, 'error');
    }

    // Refresh the transaction list
    const selectedLedger = document.getElementById('trust-check-ledger')?.value;
    if (selectedLedger) {
        loadClientTransactionHistory(selectedLedger, 'checks');
    }

    // Refresh client sidebar to update balances
    renderChecksClientSidebar();
}

// =====================================================
// Deposit History Selection Functions
// =====================================================

// Track last clicked deposit checkbox for shift-select
let lastClickedDepositCheckbox = null;

// Toggle select all deposit checkboxes
function toggleSelectAllDeposits(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', masterCheckbox.checked);
            row.style.background = masterCheckbox.checked ? '#eff6ff' : 'transparent';
        }
    });
    lastClickedDepositCheckbox = null;
    updateDepositSelection();
}

// Handle deposit checkbox click with shift-select support
function handleDepositCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.deposit-tx-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedDepositCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedDepositCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.classList.toggle('selected', shouldCheck);
                    row.style.background = shouldCheck ? '#eff6ff' : 'transparent';
                }
            }
        }
    }

    lastClickedDepositCheckbox = checkbox;
    updateDepositSelection();
}

// Update deposit selection count and show/hide delete button
function updateDepositSelection() {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox:checked');
    const count = checkboxes.length;
    const deleteBtn = document.getElementById('deposits-delete-selected-btn');
    const countSpan = document.getElementById('deposits-selected-count');
    const selectAllCheckbox = document.getElementById('deposits-select-all');

    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = count;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.deposit-tx-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // Update row backgrounds
    document.querySelectorAll('.deposit-tx-checkbox').forEach(cb => {
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', cb.checked);
            if (!row.matches(':hover')) {
                row.style.background = cb.checked ? '#eff6ff' : 'transparent';
            }
        }
    });
}

// Delete selected deposit transactions
async function deleteSelectedDeposits() {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.txId);

    if (ids.length === 0) {
        showToast('No deposits selected', 'error');
        return;
    }

    const confirmMsg = ids.length === 1
        ? 'Are you sure you want to delete this deposit?'
        : `Are you sure you want to delete ${ids.length} deposits?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    // Delete each selected transaction
    for (const txId of ids) {
        try {
            // DELETE uses query parameters, not body
            const result = await apiDelete(`/trust/transactions.php?id=${txId}&user_id=${userId}`);
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Failed to delete deposit:', txId, result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Error deleting deposit:', txId, error);
        }
    }

    // Show result
    if (successCount > 0) {
        showToast(`Deleted ${successCount} deposit${successCount > 1 ? 's' : ''}`, 'success');
    }
    if (errorCount > 0) {
        showToast(`Failed to delete ${errorCount} deposit${errorCount > 1 ? 's' : ''}`, 'error');
    }

    // Refresh the transaction list - check both possible element IDs
    const selectedLedger = document.getElementById('trust-deposit-ledger')?.value ||
                          ioltaState.selectedDepositLedgerId;
    if (selectedLedger) {
        loadClientTransactionHistory(selectedLedger, 'receive');
    }

    // Refresh client sidebar to update balances
    renderDepositClientSidebar();
}

// =====================================================
// Pending Checks Functions
// =====================================================

// Track last clicked pending checkbox for shift-select
let lastClickedPendingCheckbox = null;

// Open pending checks modal and load pending checks
async function openPendingChecksModal() {
    const modal = document.getElementById('pending-checks-modal');
    if (modal) {
        modal.style.display = 'flex';
        await loadPendingChecksList();
    }
}

// Close pending checks modal
function closePendingChecksModal() {
    const modal = document.getElementById('pending-checks-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load pending checks from API
async function loadPendingChecksList() {
    const container = document.getElementById('pending-checks-list');
    console.log('loadPendingChecksList called, container:', container);
    if (!container) {
        console.error('pending-checks-list container not found!');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    console.log('Loading pending checks for userId:', userId);

    try {
        // Get pending checks (status = 'pending') - checks have check_number or reference_number
        // We filter by status='pending' and check for check/reference number on the client side
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            status: 'pending',
            all: 1
        });
        console.log('loadPendingChecksList API result:', result);

        // Filter to only include transactions with check_number (actual checks)
        console.log('result.success:', result.success);
        console.log('result.data:', result.data);
        console.log('result.data.transactions:', result.data ? result.data.transactions : 'no data');

        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];
        console.log('allTransactions count:', allTransactions.length);

        const checks = allTransactions.filter(t =>
            (t.check_number && t.check_number.trim() !== '') ||
            (t.reference_number && t.reference_number.trim() !== '')
        );
        console.log('checks with check_number or reference_number count:', checks.length);

        if (checks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                    <p style="font-size: 15px; margin: 0;">No pending checks</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">All checks have been printed</p>
                </div>
            `;
            // Update count and hide print all button
            updatePendingChecksCount(0);
            const printAllBtn = document.getElementById('print-all-pending-btn');
            if (printAllBtn) printAllBtn.style.display = 'none';
            return;
        }

        updatePendingChecksCount(checks.length);

        // Show print all button
        const printAllBtn = document.getElementById('print-all-pending-btn');
        if (printAllBtn) printAllBtn.style.display = 'inline-block';

        // Build table
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 12px 8px; text-align: left; width: 40px;"></th>
                        <th style="padding: 12px 8px; text-align: left;">Check #</th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Payee</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        checks.forEach(check => {
            const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;"
                    onmouseover="this.style.background='#fefce8'"
                    onmouseout="this.style.background=this.querySelector('.pending-check-checkbox').checked ? '#fef3c7' : 'transparent'">
                    <td style="padding: 12px 8px;">
                        <input type="checkbox" class="pending-check-checkbox"
                               data-check-id="${check.id}"
                               data-check-number="${check.check_number || check.reference_number || ''}"
                               data-payee="${check.payee || check.entity_name || ''}"
                               data-amount="${Math.abs(check.amount)}"
                               data-date="${check.transaction_date}"
                               data-memo="${check.description || ''}"
                               data-client="${check.client_name || ''}"
                               onclick="handlePendingCheckboxClick(this, event)"
                               style="width: 16px; height: 16px; cursor: pointer;">
                    </td>
                    <td style="padding: 12px 8px; font-weight: 600; color: #7c3aed;">${check.check_number || check.reference_number || '-'}</td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px;">${check.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${check.payee || check.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Reset selection state
        lastClickedPendingCheckbox = null;
        document.getElementById('pending-checks-select-all').checked = false;
        updatePendingCheckSelection();

    } catch (error) {
        console.error('Error loading pending checks:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 40px;">
                <p>Error loading pending checks</p>
            </div>
        `;
    }
}

// Update pending checks count in button (updates all elements)
function updatePendingChecksCount(count) {
    // Update all elements with id or class 'pending-checks-count'
    document.querySelectorAll('#pending-checks-count, .pending-checks-count').forEach(span => {
        span.textContent = count;
    });
}

// Load pending checks count (for button display)
async function loadPendingChecksCount() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            status: 'pending',
            all: 1
        });
        if (result.success && result.data.transactions) {
            // Filter to count transactions with check_number OR reference_number (actual checks)
            const checks = result.data.transactions.filter(t =>
                (t.check_number && t.check_number.trim() !== '') ||
                (t.reference_number && t.reference_number.trim() !== '')
            );
            updatePendingChecksCount(checks.length);
        } else {
            updatePendingChecksCount(0);
        }
    } catch (error) {
        console.error('Error loading pending checks count:', error);
        updatePendingChecksCount(0);
    }
}

// Handle pending checkbox click with shift-select support
function handlePendingCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.pending-check-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedPendingCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedPendingCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.style.background = shouldCheck ? '#fef3c7' : 'transparent';
                }
            }
        }
    }

    lastClickedPendingCheckbox = checkbox;
    updatePendingCheckSelection();
}

// Toggle select all pending checks
function toggleSelectAllPendingChecks(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.style.background = masterCheckbox.checked ? '#fef3c7' : 'transparent';
        }
    });
    lastClickedPendingCheckbox = null;
    updatePendingCheckSelection();
}

// Update pending check selection count
function updatePendingCheckSelection() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox:checked');
    const count = checkboxes.length;
    const printSelectedBtn = document.getElementById('print-selected-checks-btn');
    const countSpan = document.getElementById('pending-checks-selected-count');
    const selectAllCheckbox = document.getElementById('pending-checks-select-all');

    if (printSelectedBtn) {
        printSelectedBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = `(${count} selected)`;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.pending-check-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
}

// Print selected pending checks
async function printSelectedPendingChecks() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.checkId,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    await printChecksAndUpdateStatus(checksData);
}

// Print all pending checks
async function printAllPendingChecks() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox');
    if (checkboxes.length === 0) {
        showToast('No pending checks to print', 'info');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.checkId,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    await printChecksAndUpdateStatus(checksData);
}

// Print checks and update their status to 'printed'
async function printChecksAndUpdateStatus(checksData) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Build print HTML for multiple checks
    let printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Checks</title>
            <style>
                @page { size: 8.5in 3.5in; margin: 0; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                .check-page {
                    width: 8.5in;
                    height: 3.5in;
                    padding: 0.25in 0.5in;
                    box-sizing: border-box;
                    page-break-after: always;
                    position: relative;
                }
                .check-page:last-child { page-break-after: auto; }
                .check-date { position: absolute; top: 0.4in; right: 0.75in; font-size: 12pt; }
                .check-payee { position: absolute; top: 0.85in; left: 1in; font-size: 12pt; }
                .check-amount-box { position: absolute; top: 0.8in; right: 0.5in; font-size: 12pt; font-weight: bold; border: 1px solid #333; padding: 4px 8px; }
                .check-amount-words { position: absolute; top: 1.25in; left: 0.5in; font-size: 11pt; }
                .check-memo { position: absolute; top: 2.1in; left: 0.5in; font-size: 10pt; color: #666; }
                .check-number { position: absolute; top: 0.25in; right: 0.5in; font-size: 14pt; font-weight: bold; color: #7c3aed; }
            </style>
        </head>
        <body>
    `;

    checksData.forEach(check => {
        const date = new Date(check.date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        });
        const amountWords = numberToWords(check.amount);

        printHTML += `
            <div class="check-page">
                <div class="check-number">#${check.checkNumber || 'N/A'}</div>
                <div class="check-date">${date}</div>
                <div class="check-payee">PAY TO THE ORDER OF: ${check.payee || ''}</div>
                <div class="check-amount-box">$${check.amount.toFixed(2)}</div>
                <div class="check-amount-words">${amountWords} DOLLARS</div>
                <div class="check-memo">MEMO: ${check.memo || ''} | Client: ${check.client || ''}</div>
            </div>
        `;
    });

    printHTML += '</body></html>';

    // Open print window
    const printWindow = window.open('', '_blank', 'width=900,height=400');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    // Ask user to confirm if printing was successful
    // Use setTimeout to allow print dialog to close first
    setTimeout(async () => {
        const confirmed = confirm(`Did you successfully print ${checksData.length} check(s)?\n\nClick OK to mark them as printed.\nClick Cancel if you need to print again.`);

        if (!confirmed) {
            showToast('Checks remain in pending status', 'info');
            return;
        }

        // Update status to 'printed' for each check
        let successCount = 0;
        let errorCount = 0;

        for (const check of checksData) {
            try {
                const result = await apiRequest('/trust/transactions.php', 'PUT', {
                    id: check.id,
                    user_id: userId,
                    status: 'printed'
                });
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error('Failed to update check status:', check.id, result.message);
                }
            } catch (error) {
                errorCount++;
                console.error('Error updating check status:', check.id, error);
            }
        }

        // Show result and refresh
        if (successCount > 0) {
            showToast(`${successCount} check(s) marked as printed`, 'success');
        }
        if (errorCount > 0) {
            showToast(`Failed to update ${errorCount} check(s)`, 'error');
        }

        // Refresh the pending checks list
        await loadPendingChecksList();
        await loadPendingChecksCount();
    }, 500);
}

// Helper: Convert number to words for check printing
function numberToWords(num) {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
                  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
                  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

    if (num === 0) return 'ZERO';

    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);

    function convertHundreds(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
    }

    function convertThousands(n) {
        if (n < 1000) return convertHundreds(n);
        if (n < 1000000) return convertThousands(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convertHundreds(n % 1000) : '');
        return convertThousands(Math.floor(n / 1000000)) + ' MILLION' + (n % 1000000 ? ' ' + convertThousands(n % 1000000) : '');
    }

    let result = convertThousands(dollars);
    if (cents > 0) {
        result += ' AND ' + cents + '/100';
    }
    return result;
}

// =====================================================
// Expose functions globally
// =====================================================

window.initIOLTA = initIOLTA;
window.loadIOLTAData = loadIOLTAData;
window.loadTrustClients = loadTrustClients;
window.loadTrustLedgers = loadTrustLedgers;
window.loadTrustTransactions = loadTrustTransactions;
window.loadTrustReconcile = loadTrustReconcile;
window.loadTrustReconciliation = loadTrustReconciliation;
window.onTrustReconAccountChange = onTrustReconAccountChange;
window.beginTrustReconciliation = beginTrustReconciliation;
window.finishTrustReconciliation = finishTrustReconciliation;
window.undoTrustReconTransaction = undoTrustReconTransaction;
window.loadTrustReconHistory = loadTrustReconHistory;
window.loadTrustAuditLog = loadTrustAuditLog;
window.openClientModal = openClientModal;
window.editTrustClient = editTrustClient;
window.saveTrustClient = saveTrustClient;
window.openLedgerModal = openLedgerModal;
window.saveTrustLedger = saveTrustLedger;
window.submitTrustDeposit = submitTrustDeposit;
window.submitTrustDisburse = submitTrustDisburse;
window.submitTrustTransfer = submitTrustTransfer;
window.submitTrustFee = submitTrustFee;
window.updateFeeBalanceHint = updateFeeBalanceHint;
window.updateBalanceHint = updateBalanceHint;
window.generateTrustReport = generateTrustReport;
window.loadClientStatement = loadClientStatement;
window.printClientStatement = printClientStatement;
window.viewLedgerTransactions = viewLedgerTransactions;
window.selectLedger = selectLedger;
window.filterLedgerList = filterLedgerList;
window.openTrustTransactionModal = openTrustTransactionModal;
window.saveTrustTransaction = saveTrustTransaction;
window.updateTransactionForm = updateTransactionForm;
window.openTransactionDetailModal = openTransactionDetailModal;
window.editTransactionFromDetail = editTransactionFromDetail;
window.deleteTransactionFromDetail = deleteTransactionFromDetail;
window.updateTrustTransaction = updateTrustTransaction;
window.showTrustReport = showTrustReport;
window.hideTrustReport = hideTrustReport;
window.loadTrustReports = loadTrustReports;
window.loadTrustStatements = loadTrustStatements;
window.onStatementClientChange = onStatementClientChange;
window.loadClientStatementData = loadClientStatementData;
window.printTrustReport = printTrustReport;
window.exportTrustReportPDF = exportTrustReportPDF;

// Deposit Modal Functions
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.openDepositRegisterModal = openDepositRegisterModal;
window.closeDepositRegisterModal = closeDepositRegisterModal;
window.editTrustDeposit = editTrustDeposit;
window.saveTrustDeposit = saveTrustDeposit;
window.deleteTrustDeposit = deleteTrustDeposit;
window.resetTrustDepositForm = resetTrustDepositForm;
window.selectClientForDeposit = selectClientForDeposit;
window.filterDepositClientList = filterDepositClientList;
window.updateTrustDepositBalance = updateTrustDepositBalance;

// Check Modal Functions
window.openCheckModal = openCheckModal;
window.closeCheckModal = closeCheckModal;
window.openCheckRegisterModal = openCheckRegisterModal;
window.closeCheckRegisterModal = closeCheckRegisterModal;

// Trust Operations Page
window.loadTrustOperations = loadTrustOperations;
window.saveTrustCheckModal = saveTrustCheckModal;
window.filterCheckRegister = filterCheckRegister;

// Check History Selection
window.toggleSelectAllChecks = toggleSelectAllChecks;
window.handleCheckboxClick = handleCheckboxClick;
window.updateCheckSelection = updateCheckSelection;
window.deleteSelectedChecks = deleteSelectedChecks;

// Deposit History Selection
window.toggleSelectAllDeposits = toggleSelectAllDeposits;
window.handleDepositCheckboxClick = handleDepositCheckboxClick;
window.updateDepositSelection = updateDepositSelection;
window.deleteSelectedDeposits = deleteSelectedDeposits;

// Pending Checks Functions
window.openPendingChecksModal = openPendingChecksModal;
window.closePendingChecksModal = closePendingChecksModal;
window.loadPendingChecksList = loadPendingChecksList;
window.loadPendingChecksCount = loadPendingChecksCount;
window.toggleSelectAllPendingChecks = toggleSelectAllPendingChecks;
window.handlePendingCheckboxClick = handlePendingCheckboxClick;
window.updatePendingCheckSelection = updatePendingCheckSelection;
window.printSelectedPendingChecks = printSelectedPendingChecks;
window.printAllPendingChecks = printAllPendingChecks;
window.printChecksAndUpdateStatus = printChecksAndUpdateStatus;
window.openChecksModalWithFilter = openChecksModalWithFilter;
window.closeChecksFilterModal = closeChecksFilterModal;

// =====================================================
// Checks Filter Modal (Printed/Cleared)
// =====================================================

async function openChecksModalWithFilter(status) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Create or get modal
    let modal = document.getElementById('checks-filter-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'checks-filter-modal';
        document.body.appendChild(modal);
    }

    const statusConfig = {
        printed: { title: 'Printed Checks', icon: '🖨️', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
        cleared: { title: 'Cleared Checks', icon: '✅', color: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }
    };
    const config = statusConfig[status] || statusConfig.printed;

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;">
            <div style="width: 800px; max-width: 95%; max-height: 90vh; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: ${config.gradient}; color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">${config.icon}</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${config.title}</h3>
                                <p style="margin: 2px 0 0; font-size: 13px; opacity: 0.9;">View ${status} checks</p>
                            </div>
                        </div>
                        <button onclick="closeChecksFilterModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div id="checks-filter-list" style="flex: 1; overflow-y: auto; padding: 0;">
                    <div style="text-align: center; padding: 40px; color: #64748b;">
                        <div class="loading-spinner"></div>
                        <p style="margin-top: 12px;">Loading checks...</p>
                    </div>
                </div>
                <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button onclick="closeChecksFilterModal()" style="padding: 10px 24px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">Close</button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'block';

    // Load checks
    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            all: 1
        });

        const container = document.getElementById('checks-filter-list');
        if (!container) return;

        if (result.success && result.data.transactions) {
            // Filter checks based on status
            let checks = result.data.transactions.filter(t =>
                t.transaction_type === 'disbursement' &&
                ((t.check_number && t.check_number.trim() !== '') ||
                 (t.reference_number && t.reference_number.trim() !== ''))
            );

            if (status === 'printed') {
                checks = checks.filter(c => c.check_printed_date && !c.check_cleared_date);
            } else if (status === 'cleared') {
                checks = checks.filter(c => c.check_cleared_date);
            }

            if (checks.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">${config.icon}</div>
                        <p style="font-size: 15px; margin: 0;">No ${status} checks</p>
                    </div>
                `;
                return;
            }

            let html = `
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 12px 16px; text-align: left;">Check #</th>
                            <th style="padding: 12px 8px; text-align: left;">Date</th>
                            <th style="padding: 12px 8px; text-align: left;">Client</th>
                            <th style="padding: 12px 8px; text-align: left;">Payee</th>
                            <th style="padding: 12px 8px; text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            checks.forEach(check => {
                const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                });
                const checkNum = check.check_number || check.reference_number || '-';

                html += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 12px 16px; color: #3b82f6; font-weight: 600;">${escapeHtml(checkNum)}</td>
                        <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                        <td style="padding: 12px 8px;">${escapeHtml(check.client_name || '-')}</td>
                        <td style="padding: 12px 8px;">${escapeHtml(check.payee || check.description || '-')}</td>
                        <td style="padding: 12px 8px; text-align: right; color: #dc2626; font-weight: 500;">-${formatCurrency(Math.abs(check.amount))}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading checks:', error);
        const container = document.getElementById('checks-filter-list');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 40px;">
                    <p>Error loading checks</p>
                </div>
            `;
        }
    }
}

function closeChecksFilterModal() {
    const modal = document.getElementById('checks-filter-modal');
    if (modal) modal.style.display = 'none';
}

// =====================================================
// IOLTA Dashboard
// =====================================================

async function loadIoltaDashboard() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Toggle dashboard wrappers
    const ioltaWrapper = document.getElementById('iolta-dashboard-wrapper');
    const personalWrapper = document.getElementById('personal-dashboard-wrapper');
    if (ioltaWrapper) ioltaWrapper.style.display = 'block';
    if (personalWrapper) personalWrapper.style.display = 'none';

    // Load trust accounts and summary data
    await loadTrustAccounts();

    // Get summary from reports API
    const summaryData = await apiGet('/trust/reports.php', {
        type: 'balance_summary',
        user_id: userId
    });

    const container = document.getElementById('iolta-dashboard-content');
    if (!container) return;

    let totalClientFunds = 0;
    let activeClients = 0;
    let activeLedgers = 0;
    let pendingReconciliation = 0;

    if (summaryData.success && summaryData.data.balance_summary) {
        const summary = summaryData.data.balance_summary;
        totalClientFunds = summary.totals?.grand_total_client || 0;
        activeLedgers = summary.totals?.total_ledgers || 0;
        // Count active clients from accounts
        activeClients = ioltaState.clients?.filter(c => c.is_active)?.length || 0;
        // Calculate reconciliation difference
        const accountTotal = summary.totals?.grand_total_account || 0;
        const ledgerTotal = summary.totals?.grand_total_client || 0;
        pendingReconciliation = Math.abs(accountTotal - ledgerTotal) > 0.01 ? 1 : 0;
    }

    container.innerHTML = `
        <div class="iolta-dashboard">
            <!-- Summary Stats -->
            <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card card">
                    <div class="stat-icon" style="font-size: 24px;">💰</div>
                    <div class="stat-content">
                        <div class="stat-value">${formatCurrency(totalClientFunds)}</div>
                        <div class="stat-label">Total Client Funds</div>
                    </div>
                </div>
                <div class="stat-card card">
                    <div class="stat-icon" style="font-size: 24px;">👥</div>
                    <div class="stat-content">
                        <div class="stat-value">${activeClients}</div>
                        <div class="stat-label">Active Clients</div>
                    </div>
                </div>
                <div class="stat-card card">
                    <div class="stat-icon" style="font-size: 24px;">📒</div>
                    <div class="stat-content">
                        <div class="stat-value">${activeLedgers}</div>
                        <div class="stat-label">Open Ledgers</div>
                    </div>
                </div>
                <div class="stat-card card">
                    <div class="stat-icon" style="font-size: 24px;">⚖️</div>
                    <div class="stat-content">
                        <div class="stat-value ${pendingReconciliation === 0 ? 'text-success' : 'text-warning'}">${pendingReconciliation === 0 ? 'Balanced' : pendingReconciliation + ' Issues'}</div>
                        <div class="stat-label">Reconciliation Status</div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="card" style="margin-bottom: 24px;">
                <h3 style="margin-bottom: 16px;">Quick Actions</h3>
                <div class="quick-actions" style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="navigateTo('trust-operations'); setTimeout(() => switchOperationsTab('receive'), 100);">
                        📥 Deposit
                    </button>
                    <button class="btn btn-secondary" onclick="navigateTo('trust-operations'); setTimeout(() => { switchOperationsTab('disburse'); switchDisburseSubTab('check'); }, 100);">
                        ✏️ Write Check
                    </button>
                    <button class="btn btn-secondary" onclick="navigateTo('trust-operations'); setTimeout(() => { switchOperationsTab('disburse'); switchDisburseSubTab('fee'); }, 100);">
                        💵 Earned Fee
                    </button>
                    <button class="btn btn-secondary" onclick="navigateTo('trust-reconcile')">
                        ✅ Reconcile
                    </button>
                    <button class="btn btn-secondary" onclick="openClientModal()">
                        ➕ New Client
                    </button>
                </div>
            </div>

            <!-- Check Status -->
            <div class="card">
                <h3 style="margin-bottom: 16px;">Check Status</h3>
                <div id="iolta-check-status">
                    <p style="color: #6b7280;">Loading check status...</p>
                </div>
            </div>
        </div>
    `;

    // Load check status
    loadCheckStatusSummary();
}

async function loadCheckStatusSummary() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Load all transactions to count check statuses
    const data = await apiGet('/trust/transactions.php', {
        user_id: userId,
        all: 1
    });

    const container = document.getElementById('iolta-check-status');
    if (!container) return;

    if (data.success && data.data.transactions) {
        // Filter only checks (disbursements with check/reference number)
        const checks = data.data.transactions.filter(t =>
            t.transaction_type === 'disbursement' &&
            ((t.check_number && t.check_number.trim() !== '') ||
             (t.reference_number && t.reference_number.trim() !== ''))
        );

        // Count by status (based on printed/cleared dates)
        const pending = checks.filter(c => !c.check_printed_date && !c.check_cleared_date);
        const printed = checks.filter(c => c.check_printed_date && !c.check_cleared_date);
        const cleared = checks.filter(c => c.check_cleared_date);

        // Calculate totals
        const pendingTotal = pending.reduce((sum, c) => sum + Math.abs(parseFloat(c.amount || 0)), 0);
        const printedTotal = printed.reduce((sum, c) => sum + Math.abs(parseFloat(c.amount || 0)), 0);
        const clearedTotal = cleared.reduce((sum, c) => sum + Math.abs(parseFloat(c.amount || 0)), 0);

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <!-- Pending -->
                <div style="background: #fef3c7; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;"
                     onclick="openPendingChecksModal()"
                     onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';"
                     onmouseout="this.style.transform=''; this.style.boxShadow='';">
                    <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
                    <div style="font-size: 32px; font-weight: 700; color: #b45309;">${pending.length}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">Pending</div>
                    <div style="font-size: 12px; color: #a16207;">${formatCurrency(pendingTotal)}</div>
                </div>

                <!-- Printed -->
                <div style="background: #dbeafe; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;"
                     onclick="openChecksModalWithFilter('printed')"
                     onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';"
                     onmouseout="this.style.transform=''; this.style.boxShadow='';">
                    <div style="font-size: 28px; margin-bottom: 8px;">🖨️</div>
                    <div style="font-size: 32px; font-weight: 700; color: #1d4ed8;">${printed.length}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 4px;">Printed</div>
                    <div style="font-size: 12px; color: #3b82f6;">${formatCurrency(printedTotal)}</div>
                </div>

                <!-- Cleared -->
                <div style="background: #dcfce7; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;"
                     onclick="openChecksModalWithFilter('cleared')"
                     onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';"
                     onmouseout="this.style.transform=''; this.style.boxShadow='';">
                    <div style="font-size: 28px; margin-bottom: 8px;">✅</div>
                    <div style="font-size: 32px; font-weight: 700; color: #15803d;">${cleared.length}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Cleared</div>
                    <div style="font-size: 12px; color: #22c55e;">${formatCurrency(clearedTotal)}</div>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
                <div style="font-size: 14px;">No checks found</div>
            </div>
        `;
    }
}

// =====================================================
// Page Loaders for Navigation
// =====================================================

// Trust Deposit State
let trustDepositsState = {
    deposits: [],
    searchText: '',
    selectedClientId: null
};

// =====================================================
// TRUST OPERATIONS PAGE (Combined Tabs)
// =====================================================

async function loadTrustOperations() {
    // Set today's date on all modal date fields FIRST (instant)
    const today = new Date().toISOString().split('T')[0];
    const dateFields = [
        'trust-deposit-date',
        'modal-transfer-date',
        'modal-fee-date'
    ];
    dateFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });

    // Initialize tab on first load (sets currentOpsTab and applies styling)
    // This happens IMMEDIATELY before any API calls
    switchOperationsTab(currentOpsTab || 'receive');

    // Render UI immediately with cached data if available
    const hasCachedData = ioltaDataCache.ledgers && ioltaDataCache.ledgers.length > 0;
    if (hasCachedData) {
        ioltaState.ledgers = ioltaDataCache.ledgers;
        populateTrustDepositLedgers();
        renderOpsClientSidebar(currentOpsTab);
    }

    // Load IOLTA data and ledgers in PARALLEL (not sequential)
    await Promise.all([
        loadIOLTAData(),
        loadTrustLedgersCached()
    ]);

    // Populate dropdown and render sidebar (data now loaded)
    populateTrustDepositLedgers();
    renderOpsClientSidebar(currentOpsTab);

    // Load pending checks count in background (don't await)
    loadPendingChecksCount();
}

async function loadTrustDeposit() {
    // Set today's date
    document.getElementById('trust-deposit-date').value = new Date().toISOString().split('T')[0];

    // Load ledgers for dropdown
    await loadIOLTAData();
    await loadTrustLedgers();
    populateTrustDepositLedgers();

    // Load client sidebar for deposit page
    renderDepositClientSidebar();

    // Load existing deposits
    await loadTrustDeposits();
}

// Render client sidebar for Deposit Check page
function renderDepositClientSidebar() {
    const container = document.getElementById('deposit-client-list');
    const totalEl = document.getElementById('deposit-client-total');
    if (!container) return;

    const ledgers = ioltaState.ledgers || [];
    let totalBalance = 0;

    if (ledgers.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">👥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No clients yet</div>
                <div style="font-size: 12px; margin-bottom: 16px;">Add a client to get started</div>
                <button onclick="openClientModal()" style="padding: 10px 20px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500;">
                    + Add Client
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = ledgers.map(ledger => {
        totalBalance += parseFloat(ledger.current_balance) || 0;
        const isSelected = trustDepositsState.selectedClientId == ledger.id;
        const initials = (ledger.client_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return `
            <div class="deposit-client-item ${isSelected ? 'selected' : ''}"
                 onclick="selectClientForDeposit(${ledger.id})"
                 style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s; ${isSelected ? 'background: #ecfdf5; border-left: 3px solid #10b981;' : 'border-left: 3px solid transparent;'}"
                 onmouseover="this.style.background='${isSelected ? '#ecfdf5' : '#f8fafc'}'"
                 onmouseout="this.style.background='${isSelected ? '#ecfdf5' : 'transparent'}'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(ledger.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${ledger.client_number ? escapeHtml(ledger.client_number) : 'No case #'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                            <span></span>
                            <span style="font-size: 13px; font-weight: 600; color: ${parseFloat(ledger.current_balance) >= 0 ? '#10b981' : '#ef4444'};">
                                ${formatCurrency(ledger.current_balance)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }
}

// Filter client list for deposit page
function filterDepositClientList(searchTerm) {
    const container = document.getElementById('deposit-client-list');
    if (!container) return;

    const items = container.querySelectorAll('.deposit-client-item');
    const term = searchTerm.toLowerCase();

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? '' : 'none';
    });
}

// Select client for deposit form
function selectClientForDeposit(ledgerId) {
    // Store selected client ID in state
    trustDepositsState.selectedClientId = ledgerId;

    const select = document.getElementById('trust-deposit-ledger');
    if (select) {
        select.value = ledgerId;
        updateTrustDepositBalance();
    }
    // Re-render to show selection
    renderDepositClientSidebar();
    // Load transaction history for selected client
    loadClientTransactionHistory(ledgerId, 'deposit');
}

function populateTrustDepositLedgers() {
    const select = document.getElementById('trust-deposit-ledger');
    if (!select) return;

    select.innerHTML = '<option value="">Select client ledger...</option>' +
        (ioltaState.ledgers || []).map(l =>
            `<option value="${l.id}">${escapeHtml(l.client_name)} (${formatCurrency(l.current_balance)})</option>`
        ).join('');
}

function updateTrustDepositBalance() {
    const ledgerId = document.getElementById('trust-deposit-ledger').value;
    const balanceInfo = document.getElementById('trust-deposit-balance-info');
    const balanceEl = document.getElementById('trust-deposit-current-balance');

    if (ledgerId) {
        const ledger = ioltaState.ledgers.find(l => l.id == ledgerId);
        if (ledger) {
            balanceInfo.style.display = 'block';
            balanceEl.textContent = formatCurrency(ledger.current_balance);
        }
    } else {
        balanceInfo.style.display = 'none';
    }
}

async function loadTrustDeposits() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiGet('/trust/transactions.php', {
        user_id: userId,
        type: 'deposit',
        all: 1
    });

    if (result.success) {
        trustDepositsState.deposits = result.data.transactions || [];
        renderTrustDeposits();
        updateTrustDepositsSummary();
    }
}

function renderTrustDeposits() {
    const container = document.getElementById('trust-deposit-list');
    if (!container) return;

    let deposits = trustDepositsState.deposits;

    // Apply search filter
    if (trustDepositsState.searchText) {
        const search = trustDepositsState.searchText.toLowerCase();
        deposits = deposits.filter(d =>
            (d.client_name || '').toLowerCase().includes(search) ||
            (d.description || '').toLowerCase().includes(search) ||
            (d.reference_number || '').toLowerCase().includes(search)
        );
    }

    if (deposits.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">📥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No deposits yet</div>
                <div style="font-size: 12px;">Click "+ New Deposit" to record a deposit</div>
            </div>
        `;
        return;
    }

    container.innerHTML = deposits.map(deposit => `
        <div onclick="editTrustDeposit(${deposit.id})"
             style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 2px;">${escapeHtml(deposit.client_name || 'Unknown')}</div>
                    <div style="font-size: 12px; color: #64748b;">${escapeHtml(deposit.description || '')}</div>
                </div>
                <span style="font-size: 15px; font-weight: 700; color: #10b981; white-space: nowrap;">+${formatCurrency(deposit.amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: #94a3b8;">${formatDate(deposit.transaction_date)}</span>
                ${deposit.reference_number ? `<span style="font-size: 11px; padding: 2px 8px; background: #eff6ff; color: #3b82f6; border-radius: 4px;">Check #${escapeHtml(deposit.reference_number)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function updateTrustDepositsSummary() {
    const deposits = trustDepositsState.deposits;

    // Update count and total for all deposits
    const countEl = document.getElementById('trust-deposit-count');
    const totalEl = document.getElementById('trust-deposit-total');

    if (countEl) countEl.textContent = deposits.length;
    if (totalEl) {
        const total = deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        totalEl.textContent = formatCurrency(total);
    }
}

function filterTrustDeposits(searchText) {
    trustDepositsState.searchText = searchText;
    renderTrustDeposits();
}

async function saveTrustDeposit(event) {
    event.preventDefault();

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ledgerId = document.getElementById('trust-deposit-ledger').value;

    if (!ledgerId) {
        showToast('Please select a client ledger', 'error');
        return;
    }

    const data = {
        user_id: userId,
        ledger_id: ledgerId,
        transaction_type: 'deposit',
        amount: parseFloat(document.getElementById('trust-deposit-amount').value),
        transaction_date: document.getElementById('trust-deposit-date').value,
        description: document.getElementById('trust-deposit-memo').value,
        reference_number: document.getElementById('trust-deposit-check-number').value || null,
        received_from: document.getElementById('trust-deposit-from').value
    };

    const depositId = document.getElementById('trust-deposit-id').value;
    if (depositId) data.id = parseInt(depositId);

    const result = await apiPost('/trust/transactions.php', data);

    if (result.success) {
        showToast(result.message || 'Deposit saved successfully', 'success');
        closeDepositModal();
        await loadTrustDeposits();
        await loadTrustLedgers();
        populateTrustDepositLedgers();

        // Refresh transaction history if ledger is selected
        if (ledgerId) {
            await loadClientTransactionHistory(ledgerId, 'receive');
        }

        // Update sidebar
        renderOpsClientSidebar('receive');
    } else {
        showToast(result.message || 'Error saving deposit', 'error');
    }
}

function resetTrustDepositForm() {
    document.getElementById('trust-deposit-form').reset();
    document.getElementById('trust-deposit-id').value = '';
    document.getElementById('trust-deposit-ledger').value = '';
    // Reset client search input
    const clientSearchEl = document.getElementById('trust-deposit-client-search');
    if (clientSearchEl) clientSearchEl.value = '';
    document.getElementById('trust-deposit-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('trust-deposit-delete-btn').style.display = 'none';
    document.getElementById('trust-deposit-balance-info').style.display = 'none';
}

// Modal control functions for Deposit
async function openDepositModal(depositId = null) {
    resetTrustDepositForm();

    // Ensure ledgers are loaded for client search
    if (!ioltaState.ledgers || ioltaState.ledgers.length === 0) {
        await loadTrustLedgers();
    }
    populateTrustDepositLedgers();

    const modal = document.getElementById('deposit-modal');
    const title = document.getElementById('deposit-modal-title');

    // If new deposit (no depositId), pre-fill with selected client from sidebar
    if (!depositId) {
        const selectedLedgerId = trustDepositsState.selectedClientId ||
                                 document.getElementById('trust-deposit-ledger')?.value ||
                                 null;

        if (selectedLedgerId) {
            const ledger = (ioltaState.ledgers || []).find(l => l.id == selectedLedgerId);
            if (ledger) {
                // Set hidden ledger input
                document.getElementById('trust-deposit-ledger').value = ledger.id;

                // Set client search input display
                const clientSearchInput = document.getElementById('trust-deposit-client-search');
                if (clientSearchInput) {
                    clientSearchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;
                }

                // Update balance display
                updateTrustDepositBalance();
            }
        }
    }

    if (depositId) {
        // Edit mode
        const deposit = trustDepositsState.deposits.find(d => d.id === depositId);
        if (deposit) {
            document.getElementById('trust-deposit-id').value = depositId;
            document.getElementById('trust-deposit-ledger').value = deposit.ledger_id;

            // Set client search input display
            const ledger = (ioltaState.ledgers || []).find(l => l.id == deposit.ledger_id);
            const clientSearchInput = document.getElementById('trust-deposit-client-search');
            if (ledger && clientSearchInput) {
                clientSearchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;
            }

            document.getElementById('trust-deposit-date').value = deposit.transaction_date;
            document.getElementById('trust-deposit-amount').value = deposit.amount;
            document.getElementById('trust-deposit-check-number').value = deposit.reference_number || '';
            document.getElementById('trust-deposit-from').value = deposit.received_from || '';
            document.getElementById('trust-deposit-memo').value = deposit.description || '';
            document.getElementById('trust-deposit-delete-btn').style.display = 'inline-block';
            updateTrustDepositBalance();
            title.textContent = 'Edit Deposit';
        }
    } else {
        // New deposit mode
        title.textContent = 'New Deposit';
    }

    modal.style.display = 'flex';
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
    resetTrustDepositForm();
}

// Deposit Register Modal
async function openDepositRegisterModal() {
    const modal = document.getElementById('deposit-register-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Load all deposits for register
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const result = await apiGet('/trust/deposits.php', { user_id: userId, all: 1 });

    if (result.success) {
        const deposits = result.data.deposits || [];
        renderDepositRegisterListData(deposits, result.data.summary);
    } else {
        renderDepositRegisterListData([], null);
    }
}

function closeDepositRegisterModal() {
    const modal = document.getElementById('deposit-register-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Render deposit register with provided data (called from openDepositRegisterModal)
 */
function renderDepositRegisterListData(deposits, summary) {
    const container = document.getElementById('deposit-register-list');
    const countEl = document.getElementById('register-deposit-count');
    const totalEl = document.getElementById('register-deposit-total');
    if (!container) return;

    // Update stats from summary or calculate
    if (countEl) countEl.textContent = summary?.total_count || deposits.length;
    if (totalEl) {
        const total = summary?.total_amount || deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        totalEl.textContent = formatCurrency(total);
    }

    if (deposits.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">📥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No deposits yet</div>
                <div style="font-size: 12px;">Click "+ New" to record a deposit</div>
            </div>
        `;
        return;
    }

    container.innerHTML = deposits.map(deposit => `
        <div onclick="closeDepositRegisterModal(); editTrustDeposit(${deposit.id});"
             style="padding: 16px 24px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 2px;">${escapeHtml(deposit.client_name || 'Unknown')}</div>
                    <div style="font-size: 12px; color: #64748b;">${escapeHtml(deposit.description || '')}</div>
                </div>
                <span style="font-size: 15px; font-weight: 700; color: #10b981; white-space: nowrap; margin-left: 12px;">+${formatCurrency(deposit.amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: #94a3b8;">${formatDate(deposit.transaction_date)}</span>
                ${deposit.reference_number ? `<span style="font-size: 11px; padding: 2px 8px; background: #eff6ff; color: #3b82f6; border-radius: 4px;">Check #${escapeHtml(deposit.reference_number)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderDepositRegisterList() {
    const container = document.getElementById('deposit-register-list');
    const countEl = document.getElementById('register-deposit-count');
    const totalEl = document.getElementById('register-deposit-total');
    if (!container) return;

    const deposits = trustDepositsState.deposits || [];

    // Update stats
    if (countEl) countEl.textContent = deposits.length;
    if (totalEl) {
        const total = deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        totalEl.textContent = formatCurrency(total);
    }

    if (deposits.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">📥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No deposits yet</div>
                <div style="font-size: 12px;">Click "+ New" to record a deposit</div>
            </div>
        `;
        return;
    }

    container.innerHTML = deposits.map(deposit => `
        <div onclick="closeDepositRegisterModal(); editTrustDeposit(${deposit.id});"
             style="padding: 16px 24px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 2px;">${escapeHtml(deposit.client_name || 'Unknown')}</div>
                    <div style="font-size: 12px; color: #64748b;">${escapeHtml(deposit.description || '')}</div>
                </div>
                <span style="font-size: 15px; font-weight: 700; color: #10b981; white-space: nowrap; margin-left: 12px;">+${formatCurrency(deposit.amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: #94a3b8;">${formatDate(deposit.transaction_date)}</span>
                ${deposit.reference_number ? `<span style="font-size: 11px; padding: 2px 8px; background: #eff6ff; color: #3b82f6; border-radius: 4px;">Check #${escapeHtml(deposit.reference_number)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function editTrustDeposit(id) {
    openDepositModal(id);
}

async function deleteTrustDeposit() {
    const depositId = document.getElementById('trust-deposit-id').value;
    if (!depositId) return;

    if (!confirm('Are you sure you want to delete this deposit?')) return;

    const result = await apiDelete('/trust/transactions.php?id=' + depositId);

    if (result.success) {
        showToast('Deposit deleted', 'success');
        closeDepositModal();
        await loadTrustDeposits();
        await loadTrustLedgers();
        populateTrustDepositLedgers();
    } else {
        showToast(result.message || 'Error deleting deposit', 'error');
    }
}

async function loadTrustDisburse() {
    await loadIOLTAData();
    initIOLTA();
}

async function loadTrustTransfer() {
    await loadIOLTAData();
    initIOLTA();
}

async function loadTrustFee() {
    await loadIOLTAData();
    initIOLTA();
}

// Trust Reports page initialization
async function loadTrustReports() {
    // Hide the report display area and show the grid when entering page
    const displayArea = document.getElementById('trust-report-display');
    const gridArea = document.querySelector('.trust-reports-grid');

    if (displayArea) displayArea.style.display = 'none';
    if (gridArea) gridArea.style.display = 'grid';
}

// =====================================================
// Unified Client Accounts Page
// =====================================================

async function loadClientAccountsPage() {
    await loadIOLTAData();
    await Promise.all([
        loadTrustLedgers(),
        loadStagingUnassignedTotal()
    ]);
    renderClientSidebar();
}

function renderClientSidebar() {
    const container = document.getElementById('client-sidebar-list');
    const totalEl = document.getElementById('client-sidebar-total');

    if (!container) return;

    // Merge clients with their ledger data
    const clientsWithBalance = (ioltaState.clients || []).map(client => {
        const clientLedgers = (ioltaState.ledgers || []).filter(l => l.client_id == client.id);
        let totalBalance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

        // Add staging unassigned total to General/Unassigned client
        if (client.client_name === 'General/Unassigned') {
            totalBalance += (ioltaState.stagingUnassignedTotal || 0);
        }

        return {
            ...client,
            totalBalance,
            ledgerCount: clientLedgers.length,
            ledgers: clientLedgers
        };
    });

    // Calculate total (includes staging unassigned via General/Unassigned)
    const grandTotal = clientsWithBalance.reduce((sum, c) => sum + c.totalBalance, 0);
    if (totalEl) {
        totalEl.textContent = formatCurrency(grandTotal);
        totalEl.style.color = grandTotal >= 0 ? '#10b981' : '#ef4444';
    }

    if (clientsWithBalance.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 12px;">👥</div>
                <div style="font-size: 14px; margin-bottom: 16px;">No clients yet</div>
                <button onclick="openClientModal()"
                        style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">
                    + Add First Client
                </button>
            </div>
        `;
        return;
    }

    const bgColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

    container.innerHTML = clientsWithBalance.map((client, index) => {
        const initials = (client.client_name || 'C').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bgColor = bgColors[index % bgColors.length];
        const isSelected = ioltaState.selectedClientId == client.id;
        const isActive = client.is_active;

        return `
            <div class="client-sidebar-item" data-client-id="${client.id}" data-client-name="${(client.client_name || '').toLowerCase()}"
                 onclick="selectClient(${client.id})"
                 style="padding: 12px 16px; cursor: pointer; transition: all 0.15s; border-left: 3px solid ${isSelected ? '#3b82f6' : 'transparent'}; background: ${isSelected ? '#eff6ff' : 'white'};"
                 onmouseover="if(${!isSelected}) this.style.background='#f8fafc'"
                 onmouseout="if(${!isSelected}) this.style.background='white'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 13px; flex-shrink: 0; opacity: ${isActive ? 1 : 0.5};">
                        ${initials}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-weight: 600; color: #1e293b; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(client.client_name)}
                            </span>
                            ${!isActive ? '<span style="font-size: 10px; padding: 2px 6px; background: #f1f5f9; color: #64748b; border-radius: 4px;">Inactive</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                            ${client.matter_number || 'No matter #'}
                        </div>
                    </div>
                    <div style="text-align: right; flex-shrink: 0;">
                        <div style="font-size: 14px; font-weight: 600; color: ${client.totalBalance >= 0 ? '#10b981' : '#ef4444'};">
                            ${formatCurrency(client.totalBalance)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8;">
                            ${client.ledgerCount} ledger${client.ledgerCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterClientList(searchText) {
    const items = document.querySelectorAll('.client-sidebar-item');
    const search = searchText.toLowerCase().trim();

    items.forEach(item => {
        const clientName = item.dataset.clientName || '';
        if (search === '' || clientName.includes(search)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

async function selectClient(clientId) {
    ioltaState.selectedClientId = clientId;

    // Update sidebar selection
    document.querySelectorAll('.client-sidebar-item').forEach(item => {
        const isSelected = item.dataset.clientId == clientId;
        item.style.borderLeftColor = isSelected ? '#3b82f6' : 'transparent';
        item.style.background = isSelected ? '#eff6ff' : 'white';
    });

    // Find client data
    const client = ioltaState.clients.find(c => c.id == clientId);
    const clientLedgers = (ioltaState.ledgers || []).filter(l => l.client_id == clientId);

    if (!client) return;

    // Update header
    const infoEl = document.getElementById('client-detail-info');
    const buttonsEl = document.getElementById('client-action-buttons');
    const balanceCardsEl = document.getElementById('client-balance-cards');

    if (infoEl) {
        infoEl.innerHTML = `
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px;">
                ${client.client_number || 'Client'}
            </div>
            <h2 style="margin: 0; font-size: 22px; font-weight: 600; color: #1e293b;">${escapeHtml(client.client_name)}</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">
                ${client.matter_number ? `Matter: ${client.matter_number}` : ''}
                ${client.matter_description ? ` - ${client.matter_description}` : ''}
            </p>
        `;
    }

    if (buttonsEl) {
        buttonsEl.style.display = 'flex';
    }

    // Show balance cards for each ledger
    if (balanceCardsEl && clientLedgers.length > 0) {
        const totalBalance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

        balanceCardsEl.style.display = 'grid';
        balanceCardsEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        balanceCardsEl.style.gap = '12px';

        balanceCardsEl.innerHTML = clientLedgers.map(ledger => {
            const balance = parseFloat(ledger.current_balance || 0);
            return `
                <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${escapeHtml(ledger.account_name)}</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                        ${formatCurrency(balance)}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                        ${ledger.transaction_count || 0} transactions
                    </div>
                </div>
            `;
        }).join('');
    }

    // Show transactions area
    document.getElementById('no-client-selected').style.display = 'none';
    document.getElementById('client-transactions-area').style.display = 'block';

    // Load transactions for the first ledger
    if (clientLedgers.length > 0) {
        ioltaState.selectedLedgerId = clientLedgers[0].id;
        await loadClientTransactions(clientLedgers[0].id);
    }
}

async function loadClientTransactions(ledgerId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = await apiGet('/trust/transactions.php', {
        user_id: userId,
        ledger_id: ledgerId,
        all: 1
    });

    if (data.success) {
        renderClientTransactions(data.data.transactions);
    }
}

function renderClientTransactions(transactions) {
    const container = document.getElementById('client-transactions-list');
    const countEl = document.getElementById('transaction-count');

    if (!container) return;

    if (countEl) {
        countEl.textContent = `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`;
    }

    if (transactions.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 24px; margin-bottom: 8px;">📋</div>
                <div style="font-size: 14px;">No transactions yet</div>
            </div>
        `;
        return;
    }

    const typeStyles = {
        deposit: { bg: '#ecfdf5', color: '#059669', icon: '↓', label: 'Deposit' },
        disbursement: { bg: '#fef2f2', color: '#dc2626', icon: '↑', label: 'Disbursement' },
        transfer_in: { bg: '#eff6ff', color: '#1d4ed8', icon: '←', label: 'Transfer In' },
        transfer_out: { bg: '#fff7ed', color: '#ea580c', icon: '→', label: 'Transfer Out' },
        fee_withdrawal: { bg: '#fefce8', color: '#ca8a04', icon: '💰', label: 'Earned Fee' },
        earned_fee: { bg: '#fefce8', color: '#ca8a04', icon: '💰', label: 'Earned Fee' },
        refund: { bg: '#ecfdf5', color: '#059669', icon: '↩', label: 'Refund' },
        interest: { bg: '#f5f3ff', color: '#7c3aed', icon: '%', label: 'Interest' }
    };

    container.innerHTML = transactions.map(trans => {
        const isCredit = ['deposit', 'transfer_in', 'refund', 'interest'].includes(trans.transaction_type);
        const amount = parseFloat(trans.amount || 0);
        const balance = parseFloat(trans.running_balance || 0);
        const typeStyle = typeStyles[trans.transaction_type] || { bg: '#f1f5f9', color: '#475569', icon: '•', label: trans.transaction_type };

        return `
            <div class="client-trans-row" onclick="openTransactionDetailModal(${trans.id})"
                 style="display: grid; grid-template-columns: 100px 1fr 120px 120px; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: background 0.15s; cursor: pointer;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                <div style="font-size: 13px; color: #64748b;">
                    ${formatDate(trans.transaction_date, 'short')}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${typeStyle.bg}; color: ${typeStyle.color}; flex-shrink: 0;">
                        ${typeStyle.icon} ${typeStyle.label}
                    </span>
                    <span style="font-size: 13px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(trans.description || '')}
                    </span>
                </div>
                <div style="text-align: right; font-size: 14px; font-weight: 600; color: ${isCredit ? '#10b981' : '#ef4444'};">
                    ${isCredit ? '+' : '-'}${formatCurrency(Math.abs(amount))}
                </div>
                <div style="text-align: right; font-size: 14px; font-weight: 500; color: #1e293b;">
                    ${formatCurrency(balance)}
                </div>
            </div>
        `;
    }).join('');
}

// Quick action functions
function quickDeposit() {
    if (!ioltaState.selectedLedgerId) {
        showToast('Please select a client first', 'error');
        return;
    }
    openQuickTransactionModal('deposit');
}

function quickCheck() {
    if (!ioltaState.selectedLedgerId) {
        showToast('Please select a client first', 'error');
        return;
    }
    openQuickTransactionModal('disbursement');
}

function quickTransfer() {
    if (!ioltaState.selectedLedgerId) {
        showToast('Please select a client first', 'error');
        return;
    }
    openTransferModal();
}

function openTransferModal() {
    const fromLedger = ioltaState.ledgers.find(l => l.id == ioltaState.selectedLedgerId);
    if (!fromLedger) return;

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = 'Transfer Between Clients';
    const today = new Date().toISOString().split('T')[0];

    // Get other ledgers (excluding current one)
    const otherLedgers = ioltaState.ledgers.filter(l => l.id != ioltaState.selectedLedgerId);

    modalBody.innerHTML = `
        <form id="transfer-modal-form" onsubmit="submitTransferModal(event)">
            <!-- From Ledger -->
            <div style="background: #fef2f2; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="background: #ef4444; color: white; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">FROM</span>
                    <span style="font-size: 13px; color: #64748b;">Source Ledger</span>
                </div>
                <div style="font-weight: 600; color: #1e293b;">${escapeHtml(fromLedger.client_name)}</div>
                <div style="font-size: 13px; color: #10b981; font-weight: 500;">Available: ${formatCurrency(fromLedger.current_balance)}</div>
            </div>
            <input type="hidden" id="transfer-from-id" value="${fromLedger.id}">

            <!-- Arrow -->
            <div style="text-align: center; margin: 12px 0;">
                <div style="width: 36px; height: 36px; background: #e2e8f0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">↓</span>
                </div>
            </div>

            <!-- To Ledger -->
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: #10b981; color: white; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">TO</span>
                    Destination Ledger *
                </label>
                <select id="transfer-to-id" class="form-input" required>
                    <option value="">Select destination ledger...</option>
                    ${otherLedgers.map(l => `
                        <option value="${l.id}">${escapeHtml(l.client_name)} (${formatCurrency(l.current_balance)})</option>
                    `).join('')}
                </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label>Amount *</label>
                    <input type="number" id="transfer-amount" class="form-input" step="0.01" min="0.01" max="${fromLedger.current_balance}" required>
                </div>
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="transfer-date" class="form-input" value="${today}" required>
                </div>
            </div>

            <div class="form-group">
                <label>Description *</label>
                <input type="text" id="transfer-description" class="form-input" placeholder="e.g., Reallocation of funds" required>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
                    Execute Transfer
                </button>
            </div>
        </form>
    `;

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('open');
}

async function submitTransferModal(event) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const fromId = document.getElementById('transfer-from-id').value;
    const toId = document.getElementById('transfer-to-id').value;
    const amount = document.getElementById('transfer-amount').value;
    const date = document.getElementById('transfer-date').value;
    const description = document.getElementById('transfer-description').value;

    if (!toId) {
        showToast('Please select a destination ledger', 'error');
        return;
    }

    const result = await apiPost('/trust/transactions.php', {
        user_id: userId,
        from_ledger_id: fromId,
        to_ledger_id: toId,
        transaction_type: 'transfer',
        amount: amount,
        transaction_date: date,
        description: description
    });

    if (result.success) {
        showToast('Transfer completed successfully', 'success');
        closeModal();
        // Reload data
        await loadTrustLedgers();
        renderClientSidebar();
        if (ioltaState.selectedClientId) {
            selectClient(ioltaState.selectedClientId);
        }
    } else {
        showToast(result.message || 'Error processing transfer', 'error');
    }
}

function openQuickTransactionModal(type) {
    const ledger = ioltaState.ledgers.find(l => l.id == ioltaState.selectedLedgerId);
    if (!ledger) return;

    const isDeposit = type === 'deposit';
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    if (!modalBody || !modalTitle) return;

    modalTitle.textContent = isDeposit ? 'Deposit to Trust' : 'Disburse from Trust';
    const today = new Date().toISOString().split('T')[0];

    modalBody.innerHTML = `
        <form id="quick-transaction-form" onsubmit="submitQuickTransaction(event, '${type}')">
            <div style="background: ${isDeposit ? '#ecfdf5' : '#fef2f2'}; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
                <div style="font-size: 12px; color: ${isDeposit ? '#059669' : '#dc2626'}; margin-bottom: 4px;">Client</div>
                <div style="font-weight: 600; color: #1e293b;">${escapeHtml(ledger.client_name)}</div>
                <div style="font-size: 13px; color: #64748b;">Current Balance: ${formatCurrency(ledger.current_balance)}</div>
            </div>
            <input type="hidden" id="quick-ledger-id" value="${ledger.id}">
            <div class="form-group">
                <label>Amount *</label>
                <input type="number" id="quick-amount" class="form-input" step="0.01" min="0.01" required>
            </div>
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="quick-date" class="form-input" value="${today}" required>
            </div>
            <div class="form-group">
                <label>Description *</label>
                <input type="text" id="quick-description" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Reference #</label>
                <input type="text" id="quick-reference" class="form-input">
            </div>
            ${!isDeposit ? `
            <div class="form-group">
                <label>Payee</label>
                <input type="text" id="quick-payee" class="form-input">
            </div>
            ` : ''}
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" style="background: ${isDeposit ? '#10b981' : '#ef4444'};">
                    ${isDeposit ? 'Record Deposit' : 'Record Disbursement'}
                </button>
            </div>
        </form>
    `;

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('open');
}

async function submitQuickTransaction(event, type) {
    event.preventDefault();
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const transData = {
        user_id: userId,
        ledger_id: document.getElementById('quick-ledger-id').value,
        transaction_type: type,
        amount: document.getElementById('quick-amount').value,
        transaction_date: document.getElementById('quick-date').value,
        description: document.getElementById('quick-description').value,
        reference_number: document.getElementById('quick-reference').value || null
    };

    if (type === 'disbursement') {
        transData.payee = document.getElementById('quick-payee')?.value || null;
    }

    const result = await apiPost('/trust/transactions.php', transData);

    if (result.success) {
        showToast(`${type === 'deposit' ? 'Deposit' : 'Disbursement'} recorded successfully`, 'success');
        closeModal();
        // Reload data
        await loadTrustLedgers();
        renderClientSidebar();
        if (ioltaState.selectedClientId) {
            selectClient(ioltaState.selectedClientId);
        }
    } else {
        showToast(result.message || 'Error recording transaction', 'error');
    }
}

// =====================================================
// Trust Checks Functions
// =====================================================

let trustChecksState = {
    checks: [],
    currentFilter: '',
    nextCheckNumber: 1001,
    entities: [],
    cases: [],
    selectedEntityId: null,
    pendingFilter: null,  // Filter to apply when page loads
    selectedLedgerId: null  // Selected client ledger from sidebar
};

// Navigate to check register with a specific filter
async function goToCheckRegisterWithFilter(status) {
    // Load checks if not already loaded
    if (!trustChecksState.checks || trustChecksState.checks.length === 0) {
        await loadTrustChecks();
    }

    // Open check register modal with filter applied
    checkRegisterFilter = status;
    openCheckRegisterModal();

    // Update tab styles after modal opens
    setTimeout(() => {
        filterCheckRegister(status);
    }, 100);
}

async function loadTrustChecksPage() {
    // Set today's date
    document.getElementById('trust-check-date').value = new Date().toISOString().split('T')[0];

    // Apply pending filter if set from dashboard
    if (trustChecksState.pendingFilter) {
        trustChecksState.currentFilter = trustChecksState.pendingFilter;
        trustChecksState.pendingFilter = null;
    }

    // Load ledgers for dropdown
    await loadIOLTAData();
    await loadTrustLedgers();
    populateTrustCheckLedgers();

    // Load client sidebar for checks page
    renderChecksClientSidebar();

    // Load existing checks
    await loadTrustChecks();

    // Update tab UI to reflect current filter
    updateCheckFilterTabUI();

    // Load entities for the payee autocomplete
    await loadCheckEntities();

    // Setup click outside handler for entity dropdown
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('trust-check-entity-dropdown');
        const input = document.getElementById('trust-check-payee');
        if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
            dropdown.style.display = 'none';
        }
    });
}

function updateCheckFilterTabUI() {
    const container = document.querySelector('.register-tabs');
    if (!container) return;

    container.querySelectorAll('.register-tab').forEach(tab => {
        tab.classList.remove('active');
        const tabFilter = tab.getAttribute('data-filter') || tab.textContent.toLowerCase().trim();
        if (tabFilter === trustChecksState.currentFilter ||
            (!trustChecksState.currentFilter && tabFilter === 'all')) {
            tab.classList.add('active');
        }
    });
}

// =====================================================
// Entity Autocomplete for Check Payee
// =====================================================

async function loadCheckEntities() {
    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        // Load ALL entities (including customers) for trust checks
        // Trust checks can be payable to vendors, customers, employees, etc.
        const result = await apiGet('/entities/', { user_id: userId, all: 1 });
        if (result.success) {
            trustChecksState.entities = result.data.entities || [];
            console.log('Loaded entities for check payee:', trustChecksState.entities.length);
        }
    } catch (error) {
        console.error('Error loading entities:', error);
    }
}

function showCheckPayeeDropdown() {
    const dropdown = document.getElementById('trust-check-entity-dropdown');
    if (dropdown) {
        renderCheckEntityDropdown(trustChecksState.entities);
        dropdown.style.display = 'block';
    }
}

function searchCheckPayeeEntity(query) {
    if (!trustChecksState.entities || trustChecksState.entities.length === 0) {
        console.warn('No entities loaded for payee search');
        renderCheckEntityDropdown([], query);
        return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = trustChecksState.entities.filter(e => {
        const name = (e.name || '').toLowerCase();
        const displayName = (e.display_name || '').toLowerCase();
        const companyName = (e.company_name || '').toLowerCase();

        return name.includes(lowerQuery) ||
               displayName.includes(lowerQuery) ||
               companyName.includes(lowerQuery);
    });

    console.log(`Payee search "${query}": found ${filtered.length} of ${trustChecksState.entities.length}`);
    renderCheckEntityDropdown(filtered, query);
}

function renderCheckEntityDropdown(list, query = '') {
    const dropdown = document.getElementById('trust-check-entity-dropdown');
    if (!dropdown) return;

    dropdown.style.display = 'block';

    // Check if there's an exact match (case-insensitive)
    const lowerQuery = (query || '').toLowerCase().trim();
    const hasExactMatch = list.some(e => {
        const name = (e.name || '').toLowerCase();
        const displayName = (e.display_name || '').toLowerCase();
        const companyName = (e.company_name || '').toLowerCase();
        return name === lowerQuery || displayName === lowerQuery || companyName === lowerQuery;
    });

    // Only show "Create new" if query exists AND no exact match
    const createNewHtml = (query && query.trim() && !hasExactMatch) ? `
        <div style="padding: 12px 14px; cursor: pointer; background: #fef3c7; border-bottom: 1px solid #fcd34d; transition: background 0.1s;"
             onmouseover="this.style.background='#fde68a'"
             onmouseout="this.style.background='#fef3c7'"
             onclick="createNewCheckEntity('${escapeHtml(query.trim())}')">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">+</div>
                <div>
                    <div style="font-weight: 600; color: #92400e; font-size: 14px;">Create new payee</div>
                    <div style="font-size: 12px; color: #78350f;">"${escapeHtml(query.trim())}"</div>
                </div>
            </div>
        </div>
    ` : '';

    if (list.length === 0) {
        dropdown.innerHTML = createNewHtml || `
            <div style="padding: 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 13px;">No matching entities found</div>
                <div style="font-size: 12px; margin-top: 4px;">Type a name to search or create</div>
            </div>
        `;
        return;
    }

    // Show matching entities FIRST, then "Create new" option at bottom
    const entitiesHtml = list.slice(0, 10).map(e => `
        <div style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s;"
             onmouseover="this.style.background='#f9fafb'"
             onmouseout="this.style.background='white'"
             onclick="selectCheckPayeeEntity(${e.id})">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(e.display_name || e.name)}</div>
                    ${e.city ? `<div style="font-size: 12px; color: #64748b;">${escapeHtml(e.city)}${e.state ? ', ' + escapeHtml(e.state) : ''}</div>` : ''}
                </div>
                <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${escapeHtml(e.type_name || 'Entity')}</div>
            </div>
        </div>
    `).join('');

    // Show entities first, then "Create new" at bottom
    dropdown.innerHTML = entitiesHtml + createNewHtml;
}

function selectCheckPayeeEntity(entityId) {
    const entity = trustChecksState.entities.find(e => e.id === entityId);
    if (!entity) return;

    trustChecksState.selectedEntityId = entityId;
    document.getElementById('trust-check-entity-id').value = entityId;
    document.getElementById('trust-check-payee').value = entity.display_name || entity.name;
    document.getElementById('trust-check-entity-dropdown').style.display = 'none';

    // Show selected entity display
    const selectedDiv = document.getElementById('trust-check-entity-selected');
    selectedDiv.style.display = 'block';
    document.getElementById('trust-check-entity-name').textContent = entity.display_name || entity.name;

    const addressParts = [entity.address_line1, entity.city, entity.state].filter(Boolean);
    document.getElementById('trust-check-entity-address').textContent = addressParts.join(', ') || 'No address';
}

function clearCheckPayeeEntity() {
    trustChecksState.selectedEntityId = null;
    document.getElementById('trust-check-entity-id').value = '';
    document.getElementById('trust-check-payee').value = '';
    document.getElementById('trust-check-entity-selected').style.display = 'none';
}

function createNewCheckEntity(name) {
    // Show entity type selection dropdown
    const dropdown = document.getElementById('trust-check-entity-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = `
        <div style="padding: 16px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 12px; font-size: 14px;">
                Create "${escapeHtml(name)}" as:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;"
                     onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff'"
                     onmouseout="this.style.borderColor='transparent'; this.style.background='#f8fafc'"
                     onclick="confirmCreateEntity('${escapeHtml(name)}', 1, 'Vendor')">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; background: #dbeafe; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">🏢</div>
                        <div>
                            <div style="font-weight: 600; color: #1e40af; font-size: 14px;">Vendor</div>
                            <div style="font-size: 11px; color: #64748b;">Suppliers, service providers</div>
                        </div>
                    </div>
                </div>
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;"
                     onmouseover="this.style.borderColor='#10b981'; this.style.background='#ecfdf5'"
                     onmouseout="this.style.borderColor='transparent'; this.style.background='#f8fafc'"
                     onclick="confirmCreateEntity('${escapeHtml(name)}', 2, 'Customer')">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">👤</div>
                        <div>
                            <div style="font-weight: 600; color: #059669; font-size: 14px;">Customer</div>
                            <div style="font-size: 11px; color: #64748b;">Clients who pay for services</div>
                        </div>
                    </div>
                </div>
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;"
                     onmouseover="this.style.borderColor='#f59e0b'; this.style.background='#fffbeb'"
                     onmouseout="this.style.borderColor='transparent'; this.style.background='#f8fafc'"
                     onclick="confirmCreateEntity('${escapeHtml(name)}', 3, 'Employee')">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">💼</div>
                        <div>
                            <div style="font-weight: 600; color: #d97706; font-size: 14px;">Employee</div>
                            <div style="font-size: 11px; color: #64748b;">Staff members</div>
                        </div>
                    </div>
                </div>
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;"
                     onmouseover="this.style.borderColor='#8b5cf6'; this.style.background='#f5f3ff'"
                     onmouseout="this.style.borderColor='transparent'; this.style.background='#f8fafc'"
                     onclick="confirmCreateEntity('${escapeHtml(name)}', 5, 'Other')">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; background: #ede9fe; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">📋</div>
                        <div>
                            <div style="font-weight: 600; color: #7c3aed; font-size: 14px;">Other</div>
                            <div style="font-size: 11px; color: #64748b;">Other entities</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="margin-top: 12px; text-align: center;">
                <button onclick="document.getElementById('trust-check-entity-dropdown').style.display='none'"
                        style="padding: 8px 16px; background: #f1f5f9; border: none; border-radius: 6px; color: #64748b; cursor: pointer; font-size: 13px;">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

function confirmCreateEntity(name, entityTypeId, typeName) {
    // Map entity type ID to type_code for API
    const typeCodeMap = { 1: 'vendor', 2: 'customer', 3: 'employee', 4: 'provider', 5: 'other' };
    const typeCode = typeCodeMap[entityTypeId] || 'other';

    // Hide the dropdown
    document.getElementById('trust-check-entity-dropdown').style.display = 'none';

    // Store the name to auto-fill after entity is created
    window.pendingEntityName = name;
    window.pendingEntitySource = 'trust-check';

    // Open the Add Entity modal with pre-selected type and pre-filled name
    if (typeof showAddEntityModal === 'function') {
        showAddEntityModal(typeCode);

        // Pre-fill the name field after modal opens
        setTimeout(() => {
            // For vendor, fill company name; for others, fill name
            if (typeCode === 'vendor') {
                const companyField = document.getElementById('entity-company');
                if (companyField) companyField.value = name;
            }
            const nameField = document.getElementById('entity-name');
            if (nameField) nameField.value = name;

            // Also set display name
            const displayField = document.getElementById('entity-display');
            if (displayField) displayField.value = name;
        }, 100);
    } else {
        showToast('Entity modal not available', 'error');
    }
}

// =====================================================
// Client Account Search for Check Modal
// =====================================================

function searchTrustCheckClients(query) {
    const ledgers = ioltaState.ledgers || [];
    const filtered = ledgers.filter(l => {
        const searchStr = `${l.client_name || ''} ${l.matter_number || ''}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
    });
    renderTrustCheckClientDropdown(filtered, query);
}

function showTrustCheckClientDropdown() {
    const dropdown = document.getElementById('trust-check-client-dropdown');
    if (!dropdown) return;

    const ledgers = ioltaState.ledgers || [];
    renderTrustCheckClientDropdown(ledgers, '');
}

function renderTrustCheckClientDropdown(list, query = '') {
    const dropdown = document.getElementById('trust-check-client-dropdown');
    if (!dropdown) return;

    dropdown.style.display = 'block';

    // Build create new client option if query exists
    const createNewHtml = query.trim() ? `
        <div style="padding: 12px 14px; cursor: pointer; background: #f0fdf4; border-bottom: 2px solid #10b981; transition: background 0.1s;"
             onmouseover="this.style.background='#dcfce7'"
             onmouseout="this.style.background='#f0fdf4'"
             onclick="createNewClientFromDropdown('${escapeHtml(query.trim())}', 'check')">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">+</div>
                <div>
                    <div style="font-weight: 600; color: #059669; font-size: 14px;">Create new client</div>
                    <div style="font-size: 12px; color: #065f46;">"${escapeHtml(query.trim())}"</div>
                </div>
            </div>
        </div>
    ` : '';

    if (list.length === 0) {
        dropdown.innerHTML = createNewHtml || `
            <div style="padding: 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 13px;">No matching clients found</div>
                <div style="font-size: 12px; margin-top: 4px;">Type a name to create a new client</div>
            </div>
        `;
        return;
    }

    const clientsHtml = list.slice(0, 15).map(l => {
        const balance = parseFloat(l.current_balance || 0);
        const balanceFormatted = balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const balanceColor = balance > 0 ? '#059669' : '#94a3b8';

        return `
            <div style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s;"
                 onmouseover="this.style.background='#f9fafb'"
                 onmouseout="this.style.background='white'"
                 onclick="selectTrustCheckClient(${l.id})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(l.client_name || 'Unknown')}</div>
                        <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(l.matter_number || 'M-' + l.client_id)}</div>
                    </div>
                    <div style="font-weight: 600; color: ${balanceColor}; font-size: 13px;">${balanceFormatted}</div>
                </div>
            </div>
        `;
    }).join('');

    dropdown.innerHTML = createNewHtml + clientsHtml;
}

function selectTrustCheckClient(ledgerId) {
    const ledger = (ioltaState.ledgers || []).find(l => l.id === ledgerId);
    if (!ledger) return;

    // Set hidden input value
    document.getElementById('trust-check-ledger').value = ledgerId;

    // Set search input display value
    const searchInput = document.getElementById('trust-check-client-search');
    searchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;

    // Hide dropdown
    document.getElementById('trust-check-client-dropdown').style.display = 'none';

    // Update balance display
    updateTrustCheckBalance();

    // Pay To (Payee) field stays empty - user searches from Vendor/Customer/Employee/Others
}

// Auto-match Payee entity when Client is selected (disabled - user searches manually)
function autoMatchPayeeFromClient(clientName) {
    if (!clientName || !trustChecksState.entities) return;

    // Find entity with matching name (case-insensitive)
    const matchingEntity = trustChecksState.entities.find(e => {
        const entityName = (e.display_name || e.name || '').toLowerCase();
        return entityName === clientName.toLowerCase();
    });

    if (matchingEntity) {
        // Auto-select the matching entity
        trustChecksState.selectedEntityId = matchingEntity.id;
        document.getElementById('trust-check-entity-id').value = matchingEntity.id;
        document.getElementById('trust-check-payee').value = matchingEntity.display_name || matchingEntity.name;

        // Show selected entity display
        const selectedDiv = document.getElementById('trust-check-entity-selected');
        if (selectedDiv) {
            selectedDiv.style.display = 'block';
            document.getElementById('trust-check-entity-name').textContent = matchingEntity.display_name || matchingEntity.name;

            const addressParts = [matchingEntity.address_line1, matchingEntity.city, matchingEntity.state].filter(Boolean);
            document.getElementById('trust-check-entity-address').textContent =
                addressParts.length > 0 ? addressParts.join(', ') : (matchingEntity.type_name || 'Entity');
        }

        console.log('Auto-matched payee:', matchingEntity.name);
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    // Check modal dropdown
    const clientDropdown = document.getElementById('trust-check-client-dropdown');
    const clientSearch = document.getElementById('trust-check-client-search');
    if (clientDropdown && clientSearch && !clientSearch.contains(e.target) && !clientDropdown.contains(e.target)) {
        clientDropdown.style.display = 'none';
    }

    // Deposit modal dropdown
    const depositDropdown = document.getElementById('trust-deposit-client-dropdown');
    const depositSearch = document.getElementById('trust-deposit-client-search');
    if (depositDropdown && depositSearch && !depositSearch.contains(e.target) && !depositDropdown.contains(e.target)) {
        depositDropdown.style.display = 'none';
    }
});

// =====================================================
// Client Account Search for Deposit Modal
// =====================================================

function searchTrustDepositClients(query) {
    const ledgers = ioltaState.ledgers || [];
    const filtered = ledgers.filter(l => {
        const searchStr = `${l.client_name || ''} ${l.matter_number || ''}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
    });
    renderTrustDepositClientDropdown(filtered, query);
}

function showTrustDepositClientDropdown() {
    const dropdown = document.getElementById('trust-deposit-client-dropdown');
    if (!dropdown) return;

    const ledgers = ioltaState.ledgers || [];
    renderTrustDepositClientDropdown(ledgers, '');
}

function renderTrustDepositClientDropdown(list, query = '') {
    const dropdown = document.getElementById('trust-deposit-client-dropdown');
    if (!dropdown) return;

    dropdown.style.display = 'block';

    // Build create new client option if query exists
    const createNewHtml = query.trim() ? `
        <div style="padding: 12px 14px; cursor: pointer; background: #f0fdf4; border-bottom: 2px solid #10b981; transition: background 0.1s;"
             onmouseover="this.style.background='#dcfce7'"
             onmouseout="this.style.background='#f0fdf4'"
             onclick="createNewClientFromDropdown('${escapeHtml(query.trim())}', 'deposit')">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">+</div>
                <div>
                    <div style="font-weight: 600; color: #059669; font-size: 14px;">Create new client</div>
                    <div style="font-size: 12px; color: #065f46;">"${escapeHtml(query.trim())}"</div>
                </div>
            </div>
        </div>
    ` : '';

    if (list.length === 0) {
        dropdown.innerHTML = createNewHtml || `
            <div style="padding: 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 13px;">No matching clients found</div>
                <div style="font-size: 12px; margin-top: 4px;">Type a name to create a new client</div>
            </div>
        `;
        return;
    }

    const clientsHtml = list.slice(0, 15).map(l => {
        const balance = parseFloat(l.current_balance || 0);
        const balanceFormatted = balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const balanceColor = balance > 0 ? '#059669' : '#94a3b8';

        return `
            <div style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.1s;"
                 onmouseover="this.style.background='#f9fafb'"
                 onmouseout="this.style.background='white'"
                 onclick="selectTrustDepositClient(${l.id})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(l.client_name || 'Unknown')}</div>
                        <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(l.matter_number || 'M-' + l.client_id)}</div>
                    </div>
                    <div style="font-weight: 600; color: ${balanceColor}; font-size: 13px;">${balanceFormatted}</div>
                </div>
            </div>
        `;
    }).join('');

    dropdown.innerHTML = createNewHtml + clientsHtml;
}

function selectTrustDepositClient(ledgerId) {
    const ledger = (ioltaState.ledgers || []).find(l => l.id === ledgerId);
    if (!ledger) return;

    // Set hidden input value
    document.getElementById('trust-deposit-ledger').value = ledgerId;

    // Set search input display value
    const searchInput = document.getElementById('trust-deposit-client-search');
    searchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;

    // Hide dropdown
    document.getElementById('trust-deposit-client-dropdown').style.display = 'none';

    // Update balance display
    updateTrustDepositBalance();
}

// =====================================================
// Create New Client from Dropdown
// =====================================================

async function createNewClientFromDropdown(clientName, source = 'deposit') {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Get the default trust account (first IOLTA account)
    const trustAccounts = ioltaState.trustAccounts || [];
    if (trustAccounts.length === 0) {
        showToast('No trust account found. Please create an IOLTA account first.', 'error');
        return;
    }
    const defaultAccountId = trustAccounts[0].id;

    try {
        // 1. Create the client
        const clientResult = await IoltaApi.createClient({
            user_id: userId,
            client_name: clientName,
            is_active: 1
        });

        if (!clientResult.success) {
            showToast(clientResult.message || 'Failed to create client', 'error');
            return;
        }

        const newClient = clientResult.data.client;
        showToast(`Client "${clientName}" created!`, 'success');

        // 2. Create a ledger for this client
        const ledgerResult = await IoltaApi.createLedger({
            user_id: userId,
            client_id: newClient.id,
            account_id: defaultAccountId,
            current_balance: 0,
            is_active: 1
        });

        if (!ledgerResult.success) {
            showToast('Client created but ledger creation failed', 'warning');
            return;
        }

        const newLedger = ledgerResult.data.ledger;

        // 3. Invalidate the cache and refresh data
        ioltaDataCache.timestamp = 0; // Force cache refresh

        // Refresh the clients and ledgers
        await loadTrustClients();
        await loadTrustLedgers();

        // Also add to ioltaState.ledgers immediately with client info for dropdown
        const enrichedLedger = {
            ...newLedger,
            client_name: clientName,
            client_id: newClient.id,
            matter_number: newClient.matter_number || 'M-' + newClient.id,
            current_balance: 0
        };

        // Add to ledgers if not already present
        if (!ioltaState.ledgers.find(l => l.id === newLedger.id)) {
            ioltaState.ledgers.push(enrichedLedger);
        }

        // 4. Select the new ledger in the appropriate modal
        if (source === 'deposit') {
            document.getElementById('trust-deposit-ledger').value = newLedger.id;
            document.getElementById('trust-deposit-client-search').value = `${clientName} (M-${newClient.id})`;
            document.getElementById('trust-deposit-client-dropdown').style.display = 'none';
        } else if (source === 'check') {
            document.getElementById('trust-check-ledger').value = newLedger.id;
            document.getElementById('trust-check-client-search').value = `${clientName} (M-${newClient.id})`;
            document.getElementById('trust-check-client-dropdown').style.display = 'none';
        }

    } catch (error) {
        console.error('Error creating client:', error);
        showToast('Error creating client', 'error');
    }
}

// =====================================================
// Client Ledger Selection for Checks
// =====================================================

async function loadCheckCases() {
    const select = document.getElementById('trust-check-case');
    if (!select) return;

    // Use ledgers from ioltaState - they contain client info with ledger details
    let ledgers = ioltaState.ledgers || [];

    // If no cached ledgers, fetch from API
    if (ledgers.length === 0) {
        try {
            const userId = state.currentUser || localStorage.getItem('currentUser');
            const result = await apiGet('/trust/ledger.php', { user_id: userId, include_inactive: '0' });
            if (result.success && result.data.ledgers) {
                ledgers = result.data.ledgers;
            }
        } catch (e) {
            console.error('Error loading client ledgers:', e);
        }
    }

    // Filter only active ledgers
    const activeLedgers = ledgers.filter(l => l.is_active);

    select.innerHTML = '<option value="">Select client ledger...</option>' +
        activeLedgers.map(l =>
            `<option value="${l.id}">${escapeHtml(l.matter_number || 'M-' + l.client_id)} - ${escapeHtml(l.client_name)} ($${parseFloat(l.current_balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})})</option>`
        ).join('');
}

async function loadCheckCategories() {
    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        const result = await apiGet('/categories/', { user_id: userId });
        if (result.success) {
            const categories = (result.data.categories || []).filter(c => c.category_type === 'expense');
            const select = document.getElementById('trust-check-category');
            if (select) {
                select.innerHTML = '<option value="">Select category...</option>' +
                    categories.map(c =>
                        `<option value="${c.id}">${c.icon || '📁'} ${escapeHtml(c.name)}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Render client sidebar for Write Checks page
function renderChecksClientSidebar() {
    const container = document.getElementById('checks-client-list');
    const totalEl = document.getElementById('checks-client-total');
    if (!container) return;

    const ledgers = ioltaState.ledgers || [];
    let totalBalance = 0;

    if (ledgers.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 24px; margin-bottom: 8px;">👥</div>
                <div style="font-size: 13px;">No clients yet</div>
                <button onclick="openClientModal()" style="margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">
                    + Add Client
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = ledgers.map(ledger => {
        totalBalance += parseFloat(ledger.current_balance) || 0;
        const isSelected = document.getElementById('trust-check-ledger')?.value == ledger.id;
        return `
            <div class="checks-client-item ${isSelected ? 'selected' : ''}"
                 onclick="selectClientForCheck(${ledger.id})"
                 style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s; ${isSelected ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}"
                 onmouseover="this.style.background='${isSelected ? '#eff6ff' : '#f8fafc'}'"
                 onmouseout="this.style.background='${isSelected ? '#eff6ff' : 'white'}'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(ledger.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${ledger.client_number ? escapeHtml(ledger.client_number) : 'No case #'}</div>
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: ${parseFloat(ledger.current_balance) >= 0 ? '#10b981' : '#ef4444'}; white-space: nowrap; margin-left: 8px;">
                        ${formatCurrency(ledger.current_balance)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }
}

// Filter client list for checks page
function filterChecksClientList(searchTerm) {
    const container = document.getElementById('checks-client-list');
    if (!container) return;

    const items = container.querySelectorAll('.checks-client-item');
    const term = searchTerm.toLowerCase();

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? '' : 'none';
    });
}

// Select client for check form
function selectClientForCheck(ledgerId) {
    // Save to state for auto-fill when opening new check modal
    trustChecksState.selectedLedgerId = ledgerId;

    const select = document.getElementById('trust-check-ledger');
    if (select) {
        select.value = ledgerId;
        updateTrustCheckBalance();
    }
    // Re-render to show selection (try shared sidebar first, then legacy)
    if (document.getElementById('ops-client-list')) {
        renderOpsClientSidebar('disburse');
    } else {
        renderChecksClientSidebar();
    }
    // Load transaction history for selected client
    loadClientTransactionHistory(ledgerId, 'checks');
}

// Load transaction history for a client (used in checks, deposit, and receive pages)
async function loadClientTransactionHistory(ledgerId, pageType) {
    // Support both old 'deposit' and new 'receive' page types
    let containerId, countId;
    if (pageType === 'checks') {
        containerId = 'checks-transaction-list';
        countId = 'checks-tx-count';
    } else if (pageType === 'receive' || pageType === 'deposit') {
        // Try receive first, fall back to deposit
        containerId = document.getElementById('receive-transaction-list') ? 'receive-transaction-list' : 'deposit-transaction-list';
        countId = document.getElementById('receive-tx-count') ? 'receive-tx-count' : 'deposit-tx-count';
    } else {
        containerId = `${pageType}-transaction-list`;
        countId = `${pageType}-tx-count`;
    }
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);

    if (!container) return;

    if (!ledgerId) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No transactions</div>
                <div style="font-size: 12px;">Select a client to view transaction history</div>
            </div>
        `;
        if (countEl) countEl.textContent = '0 transactions';
        return;
    }

    container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #94a3b8;">
            <div style="font-size: 14px;">Loading...</div>
        </div>
    `;

    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            ledger_id: ledgerId,
            all: 1
        });

        if (result.success && result.data.transactions) {
            const transactions = result.data.transactions;
            if (countEl) countEl.textContent = `${transactions.length} transactions`;

            if (transactions.length === 0) {
                container.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
                        <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No transactions yet</div>
                        <div style="font-size: 12px;">Record deposits or disbursements</div>
                    </div>
                `;
                return;
            }

            // Store transactions for detail view
            window._trustTransactionsCache = transactions;

            // Build table-style transaction list with checkboxes for checks and deposits
            const showCheckboxes = pageType === 'checks' || pageType === 'receive' || pageType === 'deposit';
            const checkboxClass = pageType === 'checks' ? 'check-tx-checkbox' : 'deposit-tx-checkbox';
            const selectAllId = pageType === 'checks' ? 'checks-select-all' : 'deposits-select-all';
            const selectAllHandler = pageType === 'checks' ? 'toggleSelectAllChecks' : 'toggleSelectAllDeposits';
            const clickHandler = pageType === 'checks' ? 'handleCheckboxClick' : 'handleDepositCheckboxClick';

            container.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            ${showCheckboxes ? `<th style="padding: 12px 8px 12px 16px; width: 40px;">
                                <input type="checkbox" id="${selectAllId}" onchange="${selectAllHandler}(this)" style="width: 16px; height: 16px; cursor: pointer;">
                            </th>` : ''}
                            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Date</th>
                            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Check #</th>
                            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Type</th>
                            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
                            <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
                            <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map((tx, index) => {
                            const isPositive = parseFloat(tx.amount) > 0;
                            const typeLabel = getTransactionTypeLabel(tx.transaction_type);
                            const typeBadgeColor = getTransactionBadgeColor(tx.transaction_type);
                            const hasCheckNumber = tx.check_number && tx.check_number.trim() !== '';
                            const statusBadge = getStatusBadge(tx.status, hasCheckNumber);

                            return `
                                <tr data-tx-id="${tx.id}" style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s; cursor: pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=this.classList.contains('selected') ? '#eff6ff' : 'transparent'">
                                    ${showCheckboxes ? `<td style="padding: 14px 8px 14px 16px;" onclick="event.stopPropagation();">
                                        <input type="checkbox" class="${checkboxClass}" data-tx-id="${tx.id}" onclick="${clickHandler}(this, event)" style="width: 16px; height: 16px; cursor: pointer;">
                                    </td>` : ''}
                                    <td style="padding: 14px 16px; color: #64748b; white-space: nowrap;" onclick="showTrustTransactionDetail(${index})">${formatDate(tx.transaction_date)}</td>
                                    <td style="padding: 14px 16px; color: #1e293b; font-weight: 500; white-space: nowrap;" onclick="showTrustTransactionDetail(${index})">
                                        ${tx.check_number ? '#' + tx.check_number : '-'}
                                    </td>
                                    <td style="padding: 14px 16px;" onclick="showTrustTransactionDetail(${index})">
                                        <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; background: ${typeBadgeColor.bg}; color: ${typeBadgeColor.text};">
                                            ${typeLabel}
                                        </span>
                                    </td>
                                    <td style="padding: 14px 16px;" onclick="showTrustTransactionDetail(${index})">
                                        <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; background: ${statusBadge.bg}; color: ${statusBadge.text};">
                                            ${statusBadge.label}
                                        </span>
                                    </td>
                                    <td style="padding: 14px 16px; color: #1e293b; font-weight: 500; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick="showTrustTransactionDetail(${index})">
                                        ${escapeHtml(tx.description || '-')}
                                    </td>
                                    <td style="padding: 14px 16px; text-align: right; font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'}; white-space: nowrap;" onclick="showTrustTransactionDetail(${index})">
                                        ${isPositive ? '+' : ''}${formatCurrency(tx.amount)}
                                    </td>
                                    <td style="padding: 14px 16px; text-align: right; color: #374151; font-weight: 500; white-space: nowrap;" onclick="showTrustTransactionDetail(${index})">
                                        ${formatCurrency(tx.running_balance)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            // Reset selection UI when loading new data
            if (pageType === 'checks') {
                updateCheckSelection();
            } else if (pageType === 'receive' || pageType === 'deposit') {
                updateDepositSelection();
            }
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        container.innerHTML = `
            <div style="padding: 30px 20px; text-align: center; color: #ef4444;">
                <div style="font-size: 13px;">Error loading transactions</div>
            </div>
        `;
    }
}

// Get icon for transaction type
function getTransactionIcon(type) {
    const icons = {
        'deposit': '📥',
        'disbursement': '📤',
        'transfer_in': '↩️',
        'transfer_out': '↪️',
        'earned_fee': '💵',
        'refund': '↩️',
        'interest': '📈',
        'adjustment': '⚙️'
    };
    return icons[type] || '💰';
}

// Get readable label for transaction type
function getTransactionTypeLabel(type) {
    const labels = {
        'deposit': 'Deposit',
        'disbursement': 'Payout',
        'payout': 'Payout',
        'legal_fee': 'Legal Fee',
        'transfer_in': 'Transfer In',
        'transfer_out': 'Transfer Out',
        'earned_fee': 'Legal Fee',
        'refund': 'Refund',
        'interest': 'Interest',
        'adjustment': 'Adjustment'
    };
    return labels[type] || type;
}

// Get badge colors for transaction type
function getTransactionBadgeColor(type) {
    const colors = {
        'deposit': { bg: '#ecfdf5', text: '#059669' },
        'disbursement': { bg: '#fef2f2', text: '#dc2626' },
        'payout': { bg: '#fef2f2', text: '#dc2626' },
        'legal_fee': { bg: '#f5f3ff', text: '#7c3aed' },
        'transfer_in': { bg: '#eff6ff', text: '#2563eb' },
        'transfer_out': { bg: '#fef3c7', text: '#d97706' },
        'earned_fee': { bg: '#f5f3ff', text: '#7c3aed' },
        'refund': { bg: '#ecfeff', text: '#0891b2' },
        'interest': { bg: '#f0fdf4', text: '#16a34a' },
        'adjustment': { bg: '#f1f5f9', text: '#475569' }
    };
    return colors[type] || { bg: '#f1f5f9', text: '#64748b' };
}

// Get status badge with label and colors
function getStatusBadge(status, hasCheckNumber = false) {
    // For checks (has check_number): pending means "not printed yet"
    // For other transactions: pending just means default/uncleared
    const badges = {
        'pending': hasCheckNumber
            ? { label: 'Not Printed', bg: '#fef3c7', text: '#92400e' }
            : { label: 'Pending', bg: '#f1f5f9', text: '#64748b' },
        'printed': { label: 'Printed', bg: '#dbeafe', text: '#1e40af' },
        'cleared': { label: 'Cleared', bg: '#dcfce7', text: '#166534' },
        'void': { label: 'Void', bg: '#fecaca', text: '#991b1b' }
    };
    return badges[status] || { label: status || '-', bg: '#f1f5f9', text: '#64748b' };
}

function populateTrustCheckLedgers() {
    const select = document.getElementById('trust-check-ledger');
    if (!select) return;

    select.innerHTML = '<option value="">Select client ledger...</option>' +
        (ioltaState.ledgers || []).map(l =>
            `<option value="${l.id}">${escapeHtml(l.client_name)} (${formatCurrency(l.current_balance)})</option>`
        ).join('');
}

function updateTrustCheckBalance() {
    const ledgerId = document.getElementById('trust-check-ledger').value;
    const balanceInfo = document.getElementById('trust-check-balance-info');
    const balanceEl = document.getElementById('trust-check-available');

    if (ledgerId) {
        const ledger = ioltaState.ledgers.find(l => l.id == ledgerId);
        if (ledger) {
            balanceInfo.style.display = 'block';
            balanceEl.textContent = formatCurrency(ledger.current_balance);
            balanceEl.style.color = ledger.current_balance >= 0 ? '#10b981' : '#ef4444';

            // Set max amount on input
            document.getElementById('trust-check-amount').max = ledger.current_balance;
        }
    } else {
        balanceInfo.style.display = 'none';
    }
}

function updateTrustCheckWords() {
    const amount = parseFloat(document.getElementById('trust-check-amount').value) || 0;
    const wordsEl = document.getElementById('trust-check-words');
    if (wordsEl) {
        wordsEl.textContent = numberToWordsForCheck(amount);
    }
}

function numberToWordsForCheck(amount) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const dollars = Math.floor(amount);
    const cents = Math.round((amount - dollars) * 100);

    let words = '';
    if (dollars === 0) words = 'Zero';
    else if (dollars < 20) words = ones[dollars];
    else if (dollars < 100) words = tens[Math.floor(dollars / 10)] + (dollars % 10 ? ' ' + ones[dollars % 10] : '');
    else if (dollars < 1000) {
        words = ones[Math.floor(dollars / 100)] + ' Hundred';
        if (dollars % 100) words += ' ' + (dollars % 100 < 20 ? ones[dollars % 100] : tens[Math.floor((dollars % 100) / 10)] + (dollars % 10 ? ' ' + ones[dollars % 10] : ''));
    } else {
        const thousands = Math.floor(dollars / 1000);
        words = (thousands < 20 ? ones[thousands] : tens[Math.floor(thousands / 10)] + (thousands % 10 ? ' ' + ones[thousands % 10] : '')) + ' Thousand';
        if (dollars % 1000) words += ' ' + numberToWordsForCheck(dollars % 1000).split(' and')[0];
    }

    return words + ' and ' + cents.toString().padStart(2, '0') + '/100 dollars';
}

async function loadTrustChecks() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const params = { user_id: userId, all: 1 };
    if (trustChecksState.currentFilter) {
        params.status = trustChecksState.currentFilter;
    }

    const result = await apiGet('/trust/checks.php', params);

    if (result.success) {
        trustChecksState.checks = result.data.checks || [];
        trustChecksState.nextCheckNumber = result.data.next_check_number || 1001;
        renderTrustChecks();
        updateTrustChecksSummary();

        // Set next check number if form is empty
        const checkNumberInput = document.getElementById('trust-check-number');
        if (checkNumberInput && !checkNumberInput.value) {
            checkNumberInput.value = trustChecksState.nextCheckNumber;
        }
    }
}

function renderTrustChecks() {
    const container = document.getElementById('trust-check-list');
    if (!container) return;

    const checks = trustChecksState.checks;

    if (checks.length === 0) {
        container.innerHTML = `
            <div class="register-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c9a962" stroke-width="1.5">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <path d="M3 10h18"/>
                </svg>
                <p>No checks found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = checks.map(check => `
        <div class="register-item" onclick="editTrustCheck(${check.id})">
            <div class="register-item-number">#${escapeHtml(check.check_number)}</div>
            <div class="register-item-details">
                <div class="register-item-payee">${escapeHtml(check.payee)}</div>
                <div class="register-item-memo">${escapeHtml(check.client_name || '')}</div>
            </div>
            <div>
                <div class="register-item-amount">${formatCurrency(check.amount)}</div>
                <div class="register-item-date">${formatDate(check.check_date)}</div>
                <span class="register-item-status ${check.status}">${check.status}</span>
            </div>
        </div>
    `).join('');
}

function updateTrustChecksSummary() {
    const checks = trustChecksState.checks;
    const pending = checks.filter(c => c.status === 'pending');

    const countEl = document.getElementById('trust-pending-count');
    const amountEl = document.getElementById('trust-pending-amount');

    if (countEl) countEl.textContent = pending.length;
    if (amountEl) {
        const total = pending.reduce((sum, c) => sum + parseFloat(c.amount), 0);
        amountEl.textContent = formatCurrency(total);
    }
}

function filterTrustChecks(status, element) {
    trustChecksState.currentFilter = status;

    // Update tab styles - use register-tab class
    const container = document.getElementById('page-trust-checks');
    if (container) {
        container.querySelectorAll('.register-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        if (element) {
            element.classList.add('active');
        }
    }

    loadTrustChecks();
}

async function saveTrustCheck(event) {
    if (event) event.preventDefault();
    return saveTrustCheckFromButton();
}

async function saveTrustCheckFromButton() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ledgerId = document.getElementById('trust-check-ledger').value;

    if (!ledgerId) {
        showToast('Please select a client account', 'error');
        return;
    }

    const amount = parseFloat(document.getElementById('trust-check-amount').value);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    // Validate balance
    const ledger = ioltaState.ledgers.find(l => l.id == ledgerId);
    if (ledger && amount > ledger.current_balance) {
        showToast('Insufficient funds in client ledger', 'error');
        return;
    }

    // Get required fields
    const entityId = document.getElementById('trust-check-entity-id')?.value;
    const payee = document.getElementById('trust-check-payee').value;
    const memo = document.getElementById('trust-check-memo').value;

    // Validate required fields
    if (!payee) {
        showToast('Please select a payee (recipient)', 'error');
        return;
    }
    if (!memo) {
        showToast('Please enter a memo', 'error');
        return;
    }

    const data = {
        user_id: userId,
        ledger_id: ledgerId,
        check_number: document.getElementById('trust-check-number').value,
        payee: payee,
        amount: amount,
        check_date: document.getElementById('trust-check-date').value,
        memo: memo,
        status: document.getElementById('trust-check-status').value,
        address: document.getElementById('trust-check-address')?.value || ''
    };

    // Add entity ID if available
    if (entityId) data.entity_id = parseInt(entityId);

    const checkId = document.getElementById('trust-check-id').value;
    if (checkId) data.id = parseInt(checkId);

    const result = await apiPost('/trust/checks.php', data);

    if (result.success) {
        showToast(result.message || 'Check saved successfully', 'success');
        resetTrustCheckForm();
        await loadTrustChecks();
        await loadTrustLedgers(); // Refresh balances
        populateTrustCheckLedgers();
        renderChecksClientSidebar();

        // Refresh transaction history if ledger is selected
        if (ledgerId) {
            await loadClientTransactionHistory(ledgerId, 'checks');
        }

        // Update sidebar for operations page
        if (document.getElementById('ops-client-list')) {
            renderOpsClientSidebar('disburse');
        }
    } else {
        showToast(result.message || 'Error saving check', 'error');
    }
}

function updateTrustCheckPreview() {
    // Preview function for real-time updates (optional)
}

function resetTrustCheckForm() {
    // Reset all form fields
    const ledgerEl = document.getElementById('trust-check-ledger');
    if (ledgerEl) ledgerEl.value = '';

    // Reset client search input
    const clientSearchEl = document.getElementById('trust-check-client-search');
    if (clientSearchEl) clientSearchEl.value = '';

    document.getElementById('trust-check-id').value = '';
    document.getElementById('trust-check-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('trust-check-number').value = trustChecksState.nextCheckNumber || '';
    document.getElementById('trust-check-payee').value = '';
    document.getElementById('trust-check-amount').value = '';
    document.getElementById('trust-check-memo').value = '';
    document.getElementById('trust-check-status').value = 'pending';

    // Reset type to default
    const typeEl = document.getElementById('trust-check-type');
    if (typeEl) typeEl.value = 'payout';

    const addressEl = document.getElementById('trust-check-address');
    if (addressEl) addressEl.value = '';

    // Reset entity selection
    const entityIdEl = document.getElementById('trust-check-entity-id');
    if (entityIdEl) entityIdEl.value = '';
    const entitySelectedEl = document.getElementById('trust-check-entity-selected');
    if (entitySelectedEl) entitySelectedEl.style.display = 'none';
    trustChecksState.selectedEntityId = null;

    // Reset case and category
    const caseEl = document.getElementById('trust-check-case');
    if (caseEl) caseEl.value = '';
    const categoryEl = document.getElementById('trust-check-category');
    if (categoryEl) categoryEl.value = '';

    // Hide action buttons
    const deleteBtn = document.getElementById('trust-check-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    const voidBtn = document.getElementById('trust-check-void-btn');
    if (voidBtn) voidBtn.style.display = 'none';
    const printBtn = document.getElementById('trust-check-print-btn');
    if (printBtn) printBtn.style.display = 'none';
    const clearBtn = document.getElementById('trust-check-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const saveBtn = document.getElementById('trust-check-save-btn');
    if (saveBtn) saveBtn.style.display = 'inline-block';

    // Hide status display for new checks
    const statusDisplay = document.getElementById('trust-check-status-display');
    if (statusDisplay) statusDisplay.style.display = 'none';

    const balanceInfo = document.getElementById('trust-check-balance-info');
    if (balanceInfo) balanceInfo.style.display = 'none';

    const wordsEl = document.getElementById('trust-check-words');
    if (wordsEl) wordsEl.textContent = 'Zero and 00/100';
}

function editTrustCheck(id) {
    const check = trustChecksState.checks.find(c => c.id === id);
    if (!check) return;

    document.getElementById('trust-check-id').value = id;
    document.getElementById('trust-check-ledger').value = check.ledger_id;
    document.getElementById('trust-check-number').value = check.check_number;
    document.getElementById('trust-check-date').value = check.check_date;
    document.getElementById('trust-check-payee').value = check.payee;
    document.getElementById('trust-check-amount').value = check.amount;
    document.getElementById('trust-check-memo').value = check.memo || '';
    document.getElementById('trust-check-status').value = check.status || 'pending';

    // Update status display and buttons based on current status
    updateCheckStatusUI(check.status);

    updateTrustCheckBalance();
    updateTrustCheckWords();
}

// Update UI based on check status
function updateCheckStatusUI(status) {
    const statusDisplay = document.getElementById('trust-check-status-display');
    const statusBadge = document.getElementById('trust-check-status-badge');
    const deleteBtn = document.getElementById('trust-check-delete-btn');
    const voidBtn = document.getElementById('trust-check-void-btn');
    const printBtn = document.getElementById('trust-check-print-btn');
    const clearBtn = document.getElementById('trust-check-clear-btn');
    const saveBtn = document.getElementById('trust-check-save-btn');

    // Show status display for existing checks
    if (statusDisplay) statusDisplay.style.display = 'block';

    // Set status badge style
    if (statusBadge) {
        const statusConfig = {
            pending: { text: 'PENDING', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
            printed: { text: 'PRINTED', bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
            cleared: { text: 'CLEARED', bg: '#dcfce7', color: '#166534', border: '#86efac' },
            void: { text: 'VOID', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
        };
        const config = statusConfig[status] || statusConfig.pending;
        statusBadge.textContent = config.text;
        statusBadge.style.background = config.bg;
        statusBadge.style.color = config.color;
        statusBadge.style.border = `1px solid ${config.border}`;
    }

    // Show/hide buttons based on status
    // Pending: can edit, save, print, delete, void
    // Printed: can clear, void (no edit)
    // Cleared: view only (no actions except void for correction)
    // Void: view only

    if (deleteBtn) deleteBtn.style.display = status === 'pending' ? 'inline-block' : 'none';
    if (voidBtn) voidBtn.style.display = (status === 'pending' || status === 'printed') ? 'inline-block' : 'none';
    if (printBtn) printBtn.style.display = status === 'pending' ? 'inline-block' : 'none';
    if (clearBtn) clearBtn.style.display = status === 'printed' ? 'inline-block' : 'none';
    if (saveBtn) saveBtn.style.display = status === 'pending' ? 'inline-block' : 'none';

    // Disable form fields for non-pending checks
    const isEditable = status === 'pending';
    const formFields = ['trust-check-ledger', 'trust-check-number', 'trust-check-date',
                        'trust-check-payee', 'trust-check-amount', 'trust-check-memo'];
    formFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = !isEditable;
            field.style.opacity = isEditable ? '1' : '0.7';
            field.style.cursor = isEditable ? 'auto' : 'not-allowed';
        }
    });
}

// Print check and change status to 'printed'
async function printAndMarkCheck() {
    const checkId = document.getElementById('trust-check-id').value;
    if (!checkId) {
        showToast('Please save the check first', 'error');
        return;
    }

    // Open print preview
    const check = trustChecksState.checks.find(c => c.id == checkId);
    if (check) {
        printCheckPreview(check);
    }

    // Update status to printed
    const result = await apiPost('/trust/checks.php', {
        id: parseInt(checkId),
        user_id: state.currentUser || localStorage.getItem('currentUser'),
        ledger_id: document.getElementById('trust-check-ledger').value,
        check_number: document.getElementById('trust-check-number').value,
        payee: document.getElementById('trust-check-payee').value,
        amount: parseFloat(document.getElementById('trust-check-amount').value),
        check_date: document.getElementById('trust-check-date').value,
        memo: document.getElementById('trust-check-memo').value,
        status: 'printed'
    });

    if (result.success) {
        showToast('Check marked as printed', 'success');
        await loadTrustChecks();
        // Update UI
        document.getElementById('trust-check-status').value = 'printed';
        updateCheckStatusUI('printed');
    } else {
        showToast(result.message || 'Error updating check status', 'error');
    }
}

// Print preview window
function printCheckPreview(check) {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    const ledger = ioltaState.ledgers?.find(l => l.id == check.ledger_id);
    const checkDate = new Date(check.check_date);
    const formattedDate = checkDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const amountFormatted = parseFloat(check.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const cents = ((check.amount % 1) * 100).toFixed(0).padStart(2, '0');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Check #${check.check_number}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Inter', -apple-system, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 40px 20px;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                .toolbar {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-bottom: 30px;
                }
                .btn {
                    padding: 12px 28px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .btn-primary {
                    background: white;
                    color: #5b21b6;
                    box-shadow: 0 4px 14px rgba(0,0,0,0.15);
                }
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                }
                .btn-secondary {
                    background: rgba(255,255,255,0.2);
                    color: white;
                    backdrop-filter: blur(10px);
                }
                .btn-secondary:hover {
                    background: rgba(255,255,255,0.3);
                }
                .check {
                    background: linear-gradient(180deg, #fefefe 0%, #f8f9fa 100%);
                    border-radius: 12px;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.25);
                    padding: 0;
                    overflow: hidden;
                    position: relative;
                }
                .check::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 6px;
                    background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
                }
                .check-inner {
                    padding: 40px 50px;
                }
                .check-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 35px;
                    padding-bottom: 25px;
                    border-bottom: 2px solid #e5e7eb;
                }
                .bank-info h2 {
                    font-size: 22px;
                    font-weight: 700;
                    color: #1f2937;
                    margin-bottom: 4px;
                }
                .bank-info p {
                    font-size: 13px;
                    color: #6b7280;
                }
                .check-meta {
                    text-align: right;
                }
                .check-number {
                    display: inline-block;
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                    color: white;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 10px;
                }
                .check-date {
                    font-size: 15px;
                    color: #374151;
                }
                .check-date span {
                    color: #9ca3af;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .payee-section {
                    margin-bottom: 30px;
                }
                .payee-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #9ca3af;
                    margin-bottom: 8px;
                }
                .payee-name {
                    font-family: 'Libre Baskerville', Georgia, serif;
                    font-size: 26px;
                    font-weight: 700;
                    color: #111827;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #d1d5db;
                }
                .amount-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    gap: 20px;
                }
                .amount-words {
                    flex: 1;
                    font-family: 'Libre Baskerville', Georgia, serif;
                    font-size: 16px;
                    color: #374151;
                    padding: 12px 0;
                    border-bottom: 2px solid #d1d5db;
                    font-style: italic;
                }
                .amount-box {
                    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                    border: 2px solid #22c55e;
                    border-radius: 10px;
                    padding: 14px 24px;
                    text-align: center;
                    min-width: 160px;
                }
                .amount-box .currency {
                    font-size: 14px;
                    color: #16a34a;
                    font-weight: 500;
                }
                .amount-box .value {
                    font-size: 28px;
                    font-weight: 700;
                    color: #15803d;
                    font-family: 'Inter', sans-serif;
                }
                .memo-section {
                    display: flex;
                    gap: 40px;
                    margin-top: 35px;
                    padding-top: 25px;
                    border-top: 1px dashed #e5e7eb;
                }
                .memo {
                    flex: 1;
                }
                .memo-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #9ca3af;
                    margin-bottom: 6px;
                }
                .memo-text {
                    font-size: 14px;
                    color: #4b5563;
                    min-height: 20px;
                }
                .signature {
                    width: 220px;
                    text-align: center;
                }
                .signature-line {
                    border-bottom: 2px solid #374151;
                    height: 40px;
                    margin-bottom: 8px;
                }
                .signature-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #6b7280;
                }
                .check-footer {
                    background: #f9fafb;
                    padding: 15px 50px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid #e5e7eb;
                }
                .routing-info {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    color: #9ca3af;
                    letter-spacing: 2px;
                }
                .security-text {
                    font-size: 10px;
                    color: #d1d5db;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                @media print {
                    body { background: white; padding: 0; }
                    .toolbar { display: none; }
                    .check { box-shadow: none; border: 1px solid #e5e7eb; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="toolbar">
                    <button class="btn btn-primary" onclick="window.print()">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                        </svg>
                        Print Check
                    </button>
                    <button class="btn btn-secondary" onclick="window.close()">
                        Close
                    </button>
                </div>
                <div class="check">
                    <div class="check-inner">
                        <div class="check-header">
                            <div class="bank-info">
                                <h2>${ledger?.client_name || 'Client Trust Account'}</h2>
                                <p>${ledger?.account_name || 'IOLTA Trust Account'}</p>
                            </div>
                            <div class="check-meta">
                                <div class="check-number">No. ${check.check_number}</div>
                                <div class="check-date">
                                    <span>Date</span><br>
                                    ${formattedDate}
                                </div>
                            </div>
                        </div>
                        <div class="payee-section">
                            <div class="payee-label">Pay to the Order of</div>
                            <div class="payee-name">${check.payee}</div>
                        </div>
                        <div class="amount-section">
                            <div class="amount-words">${numberToWords(check.amount)} and ${cents}/100 Dollars</div>
                            <div class="amount-box">
                                <div class="currency">USD</div>
                                <div class="value">$${amountFormatted}</div>
                            </div>
                        </div>
                        <div class="memo-section">
                            <div class="memo">
                                <div class="memo-label">Memo</div>
                                <div class="memo-text">${check.memo || '—'}</div>
                            </div>
                            <div class="signature">
                                <div class="signature-line"></div>
                                <div class="signature-label">Authorized Signature</div>
                            </div>
                        </div>
                    </div>
                    <div class="check-footer">
                        <div class="routing-info">⑆ 000000000 ⑆ 000000000 ⑆ ${check.check_number}</div>
                        <div class="security-text">Void after 180 days</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Mark check as cleared (bank matched)
async function clearTrustCheck() {
    const checkId = document.getElementById('trust-check-id').value;
    if (!checkId) return;

    if (!confirm('Mark this check as cleared? This indicates the bank has processed the check.')) return;

    const result = await apiPost('/trust/checks.php', {
        id: parseInt(checkId),
        user_id: state.currentUser || localStorage.getItem('currentUser'),
        ledger_id: document.getElementById('trust-check-ledger').value,
        check_number: document.getElementById('trust-check-number').value,
        payee: document.getElementById('trust-check-payee').value,
        amount: parseFloat(document.getElementById('trust-check-amount').value),
        check_date: document.getElementById('trust-check-date').value,
        memo: document.getElementById('trust-check-memo').value,
        status: 'cleared'
    });

    if (result.success) {
        showToast('Check marked as cleared', 'success');
        await loadTrustChecks();
        document.getElementById('trust-check-status').value = 'cleared';
        updateCheckStatusUI('cleared');
    } else {
        showToast(result.message || 'Error updating check status', 'error');
    }
}

// Void a check
async function voidTrustCheck() {
    const checkId = document.getElementById('trust-check-id').value;
    if (!checkId) return;

    if (!confirm('Void this check? The amount will be restored to the client ledger.')) return;

    const result = await apiPost('/trust/checks.php', {
        id: parseInt(checkId),
        user_id: state.currentUser || localStorage.getItem('currentUser'),
        ledger_id: document.getElementById('trust-check-ledger').value,
        check_number: document.getElementById('trust-check-number').value,
        payee: document.getElementById('trust-check-payee').value,
        amount: parseFloat(document.getElementById('trust-check-amount').value),
        check_date: document.getElementById('trust-check-date').value,
        memo: document.getElementById('trust-check-memo').value,
        status: 'void'
    });

    if (result.success) {
        showToast('Check voided', 'success');
        resetTrustCheckForm();
        await loadTrustChecks();
        await loadTrustLedgers();
        populateTrustCheckLedgers();
        renderChecksClientSidebar();
    } else {
        showToast(result.message || 'Error voiding check', 'error');
    }
}

// Number to words helper
function numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                  'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    num = Math.floor(num);
    if (num === 0) return 'Zero';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
    if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    return numberToWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '');
}

async function deleteTrustCheck() {
    const checkId = document.getElementById('trust-check-id').value;
    if (!checkId) return;

    if (!confirm('Are you sure you want to delete this check?')) return;

    const result = await apiDelete('/trust/checks.php?id=' + checkId);

    if (result.success) {
        showToast('Check deleted', 'success');
        resetTrustCheckForm();
        await loadTrustChecks();
        await loadTrustLedgers();
        populateTrustCheckLedgers();
    } else {
        showToast(result.message || 'Error deleting check', 'error');
    }
}

function printTrustCheck() {
    // Get current form values
    const checkId = document.getElementById('trust-check-id')?.value;
    const ledgerId = document.getElementById('trust-check-ledger')?.value;
    const checkNumber = document.getElementById('trust-check-number')?.value;
    const checkDate = document.getElementById('trust-check-date')?.value;
    const payee = document.getElementById('trust-check-payee')?.value;
    const amount = parseFloat(document.getElementById('trust-check-amount')?.value) || 0;
    const memo = document.getElementById('trust-check-memo')?.value;

    if (!checkNumber || !payee || amount <= 0) {
        showToast('Please fill in Check Number, Payee, and Amount before printing', 'error');
        return;
    }

    // Build check object from form data
    const check = {
        id: checkId,
        ledger_id: ledgerId,
        check_number: checkNumber,
        check_date: checkDate || new Date().toISOString().split('T')[0],
        payee: payee,
        amount: amount,
        memo: memo || ''
    };

    // Use existing printCheckPreview function
    printCheckPreview(check);
}

window.loadIoltaDashboard = loadIoltaDashboard;
window.loadTrustDeposit = loadTrustDeposit;
window.renderDepositClientSidebar = renderDepositClientSidebar;
window.filterDepositClientList = filterDepositClientList;
window.selectClientForDeposit = selectClientForDeposit;
window.loadTrustDisburse = loadTrustDisburse;
window.loadTrustTransfer = loadTrustTransfer;
window.loadTrustFee = loadTrustFee;
window.loadTrustReports = loadTrustReports;
window.loadTrustStatements = loadTrustStatements;
window.loadClientAccountsPage = loadClientAccountsPage;
window.selectClient = selectClient;
window.filterClientList = filterClientList;
window.quickDeposit = quickDeposit;
window.quickCheck = quickCheck;
window.quickTransfer = quickTransfer;
window.openQuickTransactionModal = openQuickTransactionModal;
window.submitQuickTransaction = submitQuickTransaction;
window.openTransferModal = openTransferModal;
window.submitTransferModal = submitTransferModal;
window.loadTrustChecksPage = loadTrustChecksPage;
window.updateTrustCheckBalance = updateTrustCheckBalance;
window.updateTrustCheckWords = updateTrustCheckWords;
window.filterTrustChecks = filterTrustChecks;
window.goToCheckRegisterWithFilter = goToCheckRegisterWithFilter;
window.updateCheckFilterTabUI = updateCheckFilterTabUI;
window.renderChecksClientSidebar = renderChecksClientSidebar;
window.filterChecksClientList = filterChecksClientList;
window.selectClientForCheck = selectClientForCheck;
window.loadClientTransactionHistory = loadClientTransactionHistory;
window.saveTrustCheck = saveTrustCheck;
window.saveTrustCheckFromButton = saveTrustCheckFromButton;
window.updateTrustCheckPreview = updateTrustCheckPreview;
window.resetTrustCheckForm = resetTrustCheckForm;
window.editTrustCheck = editTrustCheck;
window.deleteTrustCheck = deleteTrustCheck;
window.printTrustCheck = printTrustCheck;
window.printAndMarkCheck = printAndMarkCheck;
window.clearTrustCheck = clearTrustCheck;
window.voidTrustCheck = voidTrustCheck;
window.updateCheckStatusUI = updateCheckStatusUI;
// Entity autocomplete for checks
window.searchCheckPayeeEntity = searchCheckPayeeEntity;
window.showCheckPayeeDropdown = showCheckPayeeDropdown;
window.selectCheckPayeeEntity = selectCheckPayeeEntity;
window.clearCheckPayeeEntity = clearCheckPayeeEntity;
window.createNewCheckEntity = createNewCheckEntity;
window.confirmCreateEntity = confirmCreateEntity;
// Client account search for checks
window.searchTrustCheckClients = searchTrustCheckClients;
window.showTrustCheckClientDropdown = showTrustCheckClientDropdown;
window.selectTrustCheckClient = selectTrustCheckClient;
// Client account search for deposits
window.searchTrustDepositClients = searchTrustDepositClients;
window.showTrustDepositClientDropdown = showTrustDepositClientDropdown;
window.selectTrustDepositClient = selectTrustDepositClient;
window.createNewClientFromDropdown = createNewClientFromDropdown;
window.loadCheckCases = loadCheckCases;
window.loadCheckCategories = loadCheckCategories;
window.updateTrustDepositBalance = updateTrustDepositBalance;
window.populateTrustDepositLedgers = populateTrustDepositLedgers;
window.filterTrustDeposits = filterTrustDeposits;
window.saveTrustDeposit = saveTrustDeposit;
window.resetTrustDepositForm = resetTrustDepositForm;
window.editTrustDeposit = editTrustDeposit;
window.deleteTrustDeposit = deleteTrustDeposit;

// =====================================================
// IOLTA Data Management
// =====================================================

function loadTrustDataManagement() {
    // Initialize tab switching for trust data management
    const tabBtns = document.querySelectorAll('#trust-dm-tabs .dm-nav-item');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and content
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#page-trust-data-management .dm-tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            const tabId = btn.dataset.tab + '-content';
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // Style export checkbox cards
    document.querySelectorAll('input[name="trust-export"]').forEach(input => {
        input.addEventListener('change', function() {
            this.closest('.dm-checkbox-card').classList.toggle('checked', this.checked);
        });
        // Initialize styling
        if (input.checked) {
            input.closest('.dm-checkbox-card').classList.add('checked');
        }
    });

    // Populate trust accounts for import
    populateTrustImportAccounts();

    // Setup dropzone drag and drop
    setupTrustDropzones();
}

async function populateTrustImportAccounts() {
    const select = document.getElementById('trust-import-account');
    if (!select) return;

    // Clear existing options first
    select.innerHTML = '<option value="">Select account...</option>';

    // If trustAccounts is empty, fetch from API
    if (!ioltaState.trustAccounts || ioltaState.trustAccounts.length === 0) {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        try {
            const response = await fetch(`${API_BASE}/accounts/index.php?user_id=${userId}`);
            const data = await response.json();
            if (data.success && data.data?.accounts) {
                ioltaState.trustAccounts = data.data.accounts.filter(a =>
                    a.account_type === 'iolta' || a.account_type === 'trust'
                );
            }
        } catch (e) {
            console.error('Failed to load trust accounts:', e);
        }
    }

    // Use Set to prevent duplicates
    const addedIds = new Set();
    if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
        ioltaState.trustAccounts.forEach(acc => {
            if (!addedIds.has(acc.id)) {
                addedIds.add(acc.id);
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = acc.account_name;
                select.appendChild(option);
            }
        });
    }
}

function setupTrustDropzones() {
    const importDropzone = document.getElementById('trust-import-dropzone');
    const restoreDropzone = document.getElementById('trust-restore-dropzone');

    [importDropzone, restoreDropzone].forEach(dropzone => {
        if (!dropzone) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const input = dropzone.querySelector('input[type="file"]');
                if (input) {
                    input.files = files;
                    if (dropzone.id === 'trust-import-dropzone') {
                        updateTrustFileName(input);
                    } else {
                        updateTrustRestoreFileName(input);
                    }
                }
            }
        });
    });
}

function updateTrustFileName(input) {
    const label = document.getElementById('trust-import-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file selected';
    }
}

function updateTrustRestoreFileName(input) {
    const label = document.getElementById('trust-restore-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file selected';
    }
}

async function exportTrustData() {
    const selected = Array.from(document.querySelectorAll('input[name="trust-export"]:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showToast('Please select at least one data type to export', 'error');
        return;
    }

    const loading = document.getElementById('trust-export-loading');
    if (loading) loading.style.display = 'flex';

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        for (const type of selected) {
            const url = `${API_BASE}/trust/export.php?type=${type}&user_id=${userId}`;

            const link = document.createElement('a');
            link.href = url;
            link.download = `trust_${type}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        showToast('Export completed successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function importTrustData() {
    const type = document.getElementById('trust-import-type').value;
    const fileInput = document.getElementById('trust-import-file');
    const resultBox = document.getElementById('trust-import-result');
    const accountSelect = document.getElementById('trust-import-account');

    if (!fileInput.files[0]) {
        showToast('Please select a CSV file', 'error');
        return;
    }

    const loading = document.getElementById('trust-import-loading');
    if (loading) loading.style.display = 'flex';
    if (resultBox) resultBox.style.display = 'none';

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const accountId = accountSelect?.value || '';
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('csv_file', fileInput.files[0]);

    // Determine API endpoint based on type
    let apiUrl;
    if (type === 'bank-statement') {
        apiUrl = `${API_BASE}/trust/bank-import.php`;
        formData.append('mode', 'import');
        if (accountId) formData.append('account_id', accountId);
    } else {
        apiUrl = `${API_BASE}/trust/import.php`;
        formData.append('type', type);
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (resultBox) {
            if (result.success) {
                resultBox.style.display = 'block';
                resultBox.style.background = '#d1fae5';
                resultBox.style.border = '1px solid #10b981';
                resultBox.style.color = '#065f46';

                if (type === 'bank-statement') {
                    const skippedItems = result.data?.skipped_items || [];
                    let skippedHtml = '';
                    if (skippedItems.length > 0) {
                        skippedHtml = `
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #10b981;">
                                <strong style="color: #b45309;">Skipped Items (${skippedItems.length}):</strong>
                                <div style="max-height: 150px; overflow-y: auto; margin-top: 6px; font-size: 12px;">
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <thead>
                                            <tr style="background: #f0fdf4;">
                                                <th style="padding: 4px; text-align: left; border-bottom: 1px solid #86efac;">Date</th>
                                                <th style="padding: 4px; text-align: left; border-bottom: 1px solid #86efac;">Description</th>
                                                <th style="padding: 4px; text-align: right; border-bottom: 1px solid #86efac;">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${skippedItems.map(item => `
                                                <tr>
                                                    <td style="padding: 3px 4px; border-bottom: 1px solid #dcfce7;">${item.date}</td>
                                                    <td style="padding: 3px 4px; border-bottom: 1px solid #dcfce7; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description}</td>
                                                    <td style="padding: 3px 4px; border-bottom: 1px solid #dcfce7; text-align: right; color: ${item.amount >= 0 ? '#059669' : '#dc2626'};">$${Math.abs(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        `;
                    }
                    resultBox.innerHTML = `
                        <strong>Bank Statement Import successful!</strong><br>
                        Imported: ${result.data?.imported || 0} transactions<br>
                        Skipped (duplicates): ${result.data?.skipped || 0}<br>
                        New Balance: $${(result.data?.new_balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                        ${result.data?.errors?.length ? '<br><span style="color:#b45309;">Warnings: ' + result.data.errors.slice(0, 3).join(', ') + '</span>' : ''}
                        ${skippedHtml}
                    `;
                } else {
                    // Build skipped list HTML if there are errors
                    let skippedListHtml = '';
                    if (result.data?.errors?.length > 0) {
                        const maxShow = 10;
                        const errorsToShow = result.data.errors.slice(0, maxShow);
                        const remaining = result.data.errors.length - maxShow;
                        skippedListHtml = `
                            <div style="margin-top: 10px; padding: 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; max-height: 200px; overflow-y: auto;">
                                <strong style="color: #92400e;">Skipped Details:</strong>
                                <ul style="margin: 5px 0 0 15px; padding: 0; color: #78350f;">
                                    ${errorsToShow.map(e => `<li>${e}</li>`).join('')}
                                    ${remaining > 0 ? `<li style="font-style: italic;">...and ${remaining} more</li>` : ''}
                                </ul>
                            </div>
                        `;
                    }
                    resultBox.innerHTML = `
                        <strong>Import successful!</strong><br>
                        Imported: ${result.data?.imported || 0}<br>
                        Skipped: ${result.data?.skipped || 0}
                        ${skippedListHtml}
                    `;
                }
                showToast('Import completed successfully', 'success');

                // Clear file input
                fileInput.value = '';
                document.getElementById('trust-import-file-name').textContent = 'No file selected';

                // Refresh dashboard if on it
                if (typeof loadTrustDashboard === 'function') {
                    loadTrustDashboard();
                }
            } else {
                resultBox.style.display = 'block';
                resultBox.style.background = '#fee2e2';
                resultBox.style.border = '1px solid #ef4444';
                resultBox.style.color = '#991b1b';
                resultBox.textContent = result.message || 'Import failed';
                showToast('Import failed', 'error');
            }
        }
    } catch (error) {
        console.error('Import error:', error);
        if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.style.background = '#fee2e2';
            resultBox.style.border = '1px solid #ef4444';
            resultBox.style.color = '#991b1b';
            resultBox.textContent = 'Import failed: ' + error.message;
        }
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Handle import type change
function onTrustImportTypeChange(type) {
    const accountGroup = document.getElementById('trust-import-account')?.parentElement;
    if (accountGroup) {
        // Show account selector for bank-statement, hide for others
        accountGroup.style.display = type === 'bank-statement' ? 'block' : 'none';
    }
}

async function createTrustBackup() {
    const loading = document.getElementById('trust-backup-loading');
    if (loading) loading.style.display = 'flex';

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch(`${API_BASE}/trust/backup.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });

        if (response.ok) {
            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'trust_backup.zip';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            // Download the file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('Backup created successfully', 'success');
        } else {
            const result = await response.json();
            showToast('Backup failed: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Backup error:', error);
        showToast('Backup failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function restoreTrustBackup() {
    const fileInput = document.getElementById('trust-restore-file');
    const mode = document.querySelector('input[name="trust-restore-mode"]:checked').value;
    const resultBox = document.getElementById('trust-restore-result');

    if (!fileInput.files[0]) {
        showToast('Please select a backup ZIP file', 'error');
        return;
    }

    if (mode === 'replace') {
        if (!confirm('WARNING: This will delete ALL your existing IOLTA data before restoring. Are you sure?')) {
            return;
        }
    }

    const loading = document.getElementById('trust-restore-loading');
    if (loading) loading.style.display = 'flex';
    if (resultBox) resultBox.style.display = 'none';

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('mode', mode);
    formData.append('backup_file', fileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE}/trust/restore.php`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (resultBox) {
            if (result.success) {
                resultBox.style.display = 'block';
                resultBox.style.background = '#d1fae5';
                resultBox.style.border = '1px solid #10b981';
                resultBox.style.color = '#065f46';

                let statsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; margin-top: 12px;">';
                if (result.data?.stats) {
                    for (const [table, count] of Object.entries(result.data.stats)) {
                        statsHtml += `
                            <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 12px; color: #065f46;">${table}</div>
                                <div style="font-size: 18px; font-weight: 600;">${count}</div>
                            </div>
                        `;
                    }
                }
                statsHtml += '</div>';

                resultBox.innerHTML = `
                    <strong>Restore successful!</strong><br>
                    Mode: ${result.data?.mode || mode}
                    ${statsHtml}
                `;
                showToast('Restore completed successfully', 'success');

                // Reload IOLTA data
                await loadIOLTAData();
            } else {
                resultBox.style.display = 'block';
                resultBox.style.background = '#fee2e2';
                resultBox.style.border = '1px solid #ef4444';
                resultBox.style.color = '#991b1b';
                resultBox.textContent = result.message || 'Restore failed';
                showToast('Restore failed', 'error');
            }
        }
    } catch (error) {
        console.error('Restore error:', error);
        if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.style.background = '#fee2e2';
            resultBox.style.border = '1px solid #ef4444';
            resultBox.style.color = '#991b1b';
            resultBox.textContent = 'Restore failed: ' + error.message;
        }
        showToast('Restore failed: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Expose Data Management functions globally
window.loadTrustDataManagement = loadTrustDataManagement;
window.populateTrustImportAccounts = populateTrustImportAccounts;
window.setupTrustDropzones = setupTrustDropzones;
window.updateTrustFileName = updateTrustFileName;
window.updateTrustRestoreFileName = updateTrustRestoreFileName;
window.exportTrustData = exportTrustData;
window.importTrustData = importTrustData;
window.onTrustImportTypeChange = onTrustImportTypeChange;
window.createTrustBackup = createTrustBackup;
window.restoreTrustBackup = restoreTrustBackup;

// =====================================================
// CHECK MODAL FUNCTIONS
// =====================================================

let checkRegisterFilter = 'all';

async function openCheckModal(checkId = null) {
    resetTrustCheckForm();

    // Ensure ledgers are loaded for client search
    if (!ioltaState.ledgers || ioltaState.ledgers.length === 0) {
        await loadTrustLedgers();
    }
    populateTrustCheckLedgers();

    // Ensure entities are loaded for payee autocomplete
    if (!trustChecksState.entities || trustChecksState.entities.length === 0) {
        await loadCheckEntities();
    }

    const modal = document.getElementById('check-modal');
    const title = document.getElementById('check-modal-title');

    // If new check (no checkId), pre-fill with selected client from sidebar
    if (!checkId) {
        // Check for selected client in state (saved before resetTrustCheckForm cleared the DOM)
        const selectedLedgerId = trustChecksState.selectedLedgerId ||
                                 trustDepositsState.selectedClientId ||
                                 null;

        if (selectedLedgerId) {
            const ledger = (ioltaState.ledgers || []).find(l => l.id == selectedLedgerId);
            if (ledger) {
                // Set hidden ledger input
                document.getElementById('trust-check-ledger').value = ledger.id;

                // Set client search input display
                const clientSearchInput = document.getElementById('trust-check-client-search');
                if (clientSearchInput) {
                    clientSearchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;
                }

                // Update balance display
                updateTrustCheckBalance();

                // Pay To (Payee) field stays empty - user searches from Vendor/Customer/Employee/Others
            }
        }
    }

    if (checkId) {
        // Edit mode - load check data
        const check = trustChecksState.checks.find(c => c.id === checkId);
        if (check) {
            document.getElementById('trust-check-id').value = checkId;
            document.getElementById('trust-check-ledger').value = check.ledger_id;

            // Set client search input display
            const ledger = (ioltaState.ledgers || []).find(l => l.id == check.ledger_id);
            const clientSearchInput = document.getElementById('trust-check-client-search');
            if (ledger && clientSearchInput) {
                clientSearchInput.value = `${ledger.client_name} (${ledger.matter_number || 'M-' + ledger.client_id})`;
            }

            document.getElementById('trust-check-number').value = check.check_number || '';
            document.getElementById('trust-check-date').value = check.check_date || check.transaction_date;
            document.getElementById('trust-check-payee').value = check.payee || '';
            document.getElementById('trust-check-amount').value = Math.abs(check.amount);
            document.getElementById('trust-check-memo').value = check.memo || check.description || '';
            document.getElementById('trust-check-status').value = check.status || 'pending';

            // Set transaction type (map old types to new)
            const typeEl = document.getElementById('trust-check-type');
            if (typeEl) {
                let txType = check.transaction_type || 'payout';
                // Map old disbursement/earned_fee to new types
                if (txType === 'disbursement') txType = 'payout';
                if (txType === 'earned_fee') txType = 'legal_fee';
                typeEl.value = txType;
            }

            // Show entity info if available
            if (check.entity_id) {
                document.getElementById('trust-check-entity-id').value = check.entity_id;
            }

            // Show status badge
            const statusDisplay = document.getElementById('trust-check-status-display');
            const statusBadge = document.getElementById('trust-check-status-badge');
            if (statusDisplay && statusBadge) {
                statusDisplay.style.display = 'block';
                const status = check.status || 'pending';
                statusBadge.textContent = status.toUpperCase();
                if (status === 'pending') {
                    statusBadge.style.background = '#fef3c7';
                    statusBadge.style.color = '#92400e';
                } else if (status === 'printed') {
                    statusBadge.style.background = '#dbeafe';
                    statusBadge.style.color = '#1d4ed8';
                } else if (status === 'cleared') {
                    statusBadge.style.background = '#dcfce7';
                    statusBadge.style.color = '#166534';
                } else if (status === 'voided') {
                    statusBadge.style.background = '#fee2e2';
                    statusBadge.style.color = '#991b1b';
                }
            }

            // Show/hide buttons based on status
            const deleteBtn = document.getElementById('trust-check-delete-btn');
            const voidBtn = document.getElementById('trust-check-void-btn');
            const printBtn = document.getElementById('trust-check-print-btn');
            const clearBtn = document.getElementById('trust-check-clear-btn');
            const saveBtn = document.getElementById('trust-check-save-btn');

            if (deleteBtn) deleteBtn.style.display = check.status === 'pending' ? 'inline-block' : 'none';
            if (voidBtn) voidBtn.style.display = (check.status === 'printed' || check.status === 'cleared') ? 'inline-block' : 'none';
            if (printBtn) printBtn.style.display = check.status === 'pending' ? 'inline-block' : 'none';
            if (clearBtn) clearBtn.style.display = check.status === 'printed' ? 'inline-block' : 'none';
            if (saveBtn) saveBtn.style.display = check.status === 'pending' ? 'inline-block' : 'none';

            updateTrustCheckBalance();
            updateTrustCheckWords();
            title.textContent = 'Edit Check #' + (check.check_number || checkId);
        }
    } else {
        // New check mode
        title.textContent = 'New Check';
        document.getElementById('trust-check-date').value = new Date().toISOString().split('T')[0];

        // Show print button for new checks (can print before saving)
        const printBtn = document.getElementById('trust-check-print-btn');
        if (printBtn) printBtn.style.display = 'inline-block';

        // Show save button for new checks
        const saveBtn = document.getElementById('trust-check-save-btn');
        if (saveBtn) saveBtn.style.display = 'inline-block';
    }

    modal.style.display = 'flex';
}

function closeCheckModal() {
    document.getElementById('check-modal').style.display = 'none';
    resetTrustCheckForm();
}

function openCheckRegisterModal() {
    const modal = document.getElementById('check-register-modal');
    if (!modal) return;

    renderCheckRegisterList();
    modal.style.display = 'flex';
}

function closeCheckRegisterModal() {
    const modal = document.getElementById('check-register-modal');
    if (modal) modal.style.display = 'none';
}

function renderCheckRegisterList() {
    const container = document.getElementById('check-register-list');
    const countEl = document.getElementById('register-check-count');
    const pendingEl = document.getElementById('register-pending-count');
    const totalEl = document.getElementById('register-check-total');

    if (!container) return;

    let checks = trustChecksState.checks || [];

    // Apply filter
    if (checkRegisterFilter !== 'all') {
        checks = checks.filter(c => c.status === checkRegisterFilter);
    }

    // Update stats
    const allChecks = trustChecksState.checks || [];
    const pendingCount = allChecks.filter(c => c.status === 'pending').length;
    const total = allChecks.reduce((sum, c) => sum + Math.abs(parseFloat(c.amount) || 0), 0);

    if (countEl) countEl.textContent = allChecks.length;
    if (pendingEl) pendingEl.textContent = pendingCount;
    if (totalEl) totalEl.textContent = formatCurrency(total);

    if (checks.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">✏️</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No checks ${checkRegisterFilter !== 'all' ? '(' + checkRegisterFilter + ')' : ''}</div>
                <div style="font-size: 12px;">Click "+ New" to write a check</div>
            </div>
        `;
        return;
    }

    container.innerHTML = checks.map(check => {
        const statusColors = {
            'pending': { bg: '#fef3c7', text: '#92400e' },
            'printed': { bg: '#dbeafe', text: '#1d4ed8' },
            'cleared': { bg: '#dcfce7', text: '#166534' },
            'voided': { bg: '#fee2e2', text: '#991b1b' }
        };
        const colors = statusColors[check.status] || statusColors['pending'];

        return `
            <div onclick="closeCheckRegisterModal(); openCheckModal(${check.id});"
                 style="padding: 16px 24px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                    <div>
                        <span style="font-weight: 600; color: #1e293b; font-size: 14px;">Check #${check.check_number || '-'}</span>
                        <span style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; background: ${colors.bg}; color: ${colors.text};">${(check.status || 'pending').toUpperCase()}</span>
                    </div>
                    <span style="font-weight: 600; color: #dc2626; font-size: 14px;">-${formatCurrency(Math.abs(check.amount))}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b;">
                    <span>${check.payee || 'Unknown'}</span>
                    <span>${formatDate(check.check_date || check.transaction_date)}</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${check.client_name || ''}</div>
            </div>
        `;
    }).join('');
}

function filterCheckRegister(filter) {
    checkRegisterFilter = filter;

    // Update tab styles
    const tabs = document.querySelectorAll('#check-register-modal .register-tab');
    tabs.forEach(tab => {
        if (tab.dataset.filter === filter) {
            tab.style.background = '#3b82f6';
            tab.style.color = 'white';
            tab.style.border = 'none';
        } else {
            tab.style.background = 'white';
            tab.style.color = '#64748b';
            tab.style.border = '1px solid #e2e8f0';
        }
    });

    renderCheckRegisterList();
}

async function saveTrustCheckModal(event) {
    event.preventDefault();

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const checkId = document.getElementById('trust-check-id').value;
    const ledgerId = document.getElementById('trust-check-ledger').value;
    const checkNumber = document.getElementById('trust-check-number').value.trim();
    const checkDate = document.getElementById('trust-check-date').value;
    const payee = document.getElementById('trust-check-payee').value.trim();
    const amount = parseFloat(document.getElementById('trust-check-amount').value);
    const memo = document.getElementById('trust-check-memo').value.trim();
    const entityId = document.getElementById('trust-check-entity-id').value;
    const transactionType = document.getElementById('trust-check-type').value;

    if (!ledgerId || !checkNumber || !checkDate || !payee || !amount || !memo) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    const data = {
        user_id: parseInt(userId),
        ledger_id: parseInt(ledgerId),
        check_number: checkNumber,
        check_date: checkDate,
        payee: payee,
        amount: amount,
        memo: memo,
        status: 'pending',
        transaction_type: transactionType
    };

    if (entityId) {
        data.entity_id = parseInt(entityId);
    }

    if (checkId) {
        data.id = parseInt(checkId);
    }

    try {
        const result = checkId
            ? await apiPut('/trust/checks.php', data)
            : await apiPost('/trust/checks.php', data);

        if (result.success) {
            showToast(result.message || 'Check saved successfully', 'success');
            closeCheckModal();
            await loadTrustChecks();
            await loadTrustLedgers();
            renderChecksClientSidebar();
            // Update pending checks count in button
            loadPendingChecksCount();

            // Refresh transaction history if ledger is selected
            if (ledgerId) {
                await loadClientTransactionHistory(ledgerId, 'checks');
            }

            // Update sidebar
            renderOpsClientSidebar('disburse');
        } else {
            showToast(result.message || 'Error saving check', 'error');
        }
    } catch (e) {
        console.error('Error saving check:', e);
        showToast('Error saving check', 'error');
    }
}

// =====================================================
// OPERATIONS TAB SWITCHING
// =====================================================

/**
 * Switch between Operations tabs (Receive, Disburse)
 * New 2-tab structure for IOLTA operations with shared sidebar
 */
function switchOperationsTab(tabName) {
    currentOpsTab = tabName;

    // Update tab button states with appropriate colors
    document.querySelectorAll('.ops-tab').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);

        // Use different colors per tab
        if (isActive) {
            if (btn.dataset.tab === 'receive') {
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            } else if (btn.dataset.tab === 'batch') {
                btn.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
            } else {
                btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
            }
            btn.style.color = 'white';
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#64748b';
        }
    });

    // Show/hide tab content
    document.querySelectorAll('.ops-tab-content').forEach(content => {
        const isActive = content.id === `ops-tab-${tabName}`;
        content.classList.toggle('active', isActive);
        content.style.display = isActive ? 'flex' : 'none';
    });

    // Render shared client sidebar for receive/disburse tabs
    if (tabName === 'receive' || tabName === 'disburse') {
        renderOpsClientSidebar(tabName);
    }

    // Load data for the selected tab
    if (tabName === 'disburse') {
        // Default to check sub-tab
        switchDisburseSubTab('check');
    } else if (tabName === 'batch') {
        // Load batch deposit data
        loadBatchDepositTab();
    }
}

/**
 * Render shared client sidebar for Operations tabs
 * Used by both Receive and Disburse tabs
 */
function renderOpsClientSidebar(tabName) {
    const container = document.getElementById('ops-client-list');
    const totalEl = document.getElementById('ops-client-total');
    if (!container) return;

    const ledgers = ioltaState.ledgers || [];
    let totalBalance = 0;

    // Determine colors based on active tab
    const isReceiveTab = tabName === 'receive';
    const activeColor = isReceiveTab ? '#10b981' : '#3b82f6';
    const activeBg = isReceiveTab ? '#ecfdf5' : '#eff6ff';
    const gradientStart = isReceiveTab ? '#10b981' : '#3b82f6';
    const gradientEnd = isReceiveTab ? '#059669' : '#1d4ed8';

    if (ledgers.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">👥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No clients yet</div>
                <div style="font-size: 12px; margin-bottom: 16px;">Add a client to get started</div>
                <button onclick="openClientModal()" style="padding: 10px 20px; background: linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%); color: white; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500;">
                    + Add Client
                </button>
            </div>
        `;
        return;
    }

    // Determine selected client based on current tab
    const selectedId = isReceiveTab
        ? (trustDepositsState.selectedClientId || null)
        : (document.getElementById('trust-check-ledger')?.value || null);

    container.innerHTML = ledgers.map(ledger => {
        totalBalance += parseFloat(ledger.current_balance) || 0;
        const isSelected = selectedId == ledger.id;
        const initials = (ledger.client_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        // Use a generic handler that routes to correct function based on current context
        const selectFn = isReceiveTab ? 'selectClientForReceive' : 'selectOpsClient';

        return `
            <div class="ops-client-item ${isSelected ? 'selected' : ''}"
                 data-ledger-id="${ledger.id}"
                 onclick="${selectFn}(${ledger.id})"
                 style="padding: 14px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s; ${isSelected ? `background: ${activeBg}; border-left: 3px solid ${activeColor};` : 'border-left: 3px solid transparent;'}"
                 onmouseover="this.style.background='${isSelected ? activeBg : '#f8fafc'}'"
                 onmouseout="this.style.background='${isSelected ? activeBg : 'transparent'}'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(ledger.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${ledger.client_number ? escapeHtml(ledger.client_number) : 'No case #'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                            <span></span>
                            <span style="font-size: 13px; font-weight: 600; color: ${parseFloat(ledger.current_balance) >= 0 ? '#10b981' : '#ef4444'};">
                                ${formatCurrency(ledger.current_balance)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }

    // Also update uncleared deposits count if on receive tab
    if (isReceiveTab) {
        loadUnclearedDepositsCount();
    }
}

/**
 * Select client for Disburse tab - routes to correct handler based on sub-tab
 */
function selectOpsClient(ledgerId) {
    // Check which sub-tab is active
    const checkSubTab = document.querySelector('.disburse-sub-tab[data-subtype="check"]');
    const isCheckActive = checkSubTab && checkSubTab.classList.contains('active');

    if (isCheckActive) {
        selectClientForCheck(ledgerId);
    } else {
        selectClientForFee(ledgerId);
    }
}

/**
 * Filter shared client list for Operations tabs
 */
function filterOpsClientList(searchTerm) {
    const container = document.getElementById('ops-client-list');
    if (!container) return;

    const items = container.querySelectorAll('.ops-client-item');
    const term = searchTerm.toLowerCase();

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? '' : 'none';
    });
}

/**
 * Switch between Disburse sub-tabs (Check, Fee)
 */
function switchDisburseSubTab(subType) {
    // Toggle sub-tab buttons with styling
    document.querySelectorAll('.disburse-sub-tab').forEach(btn => {
        const isActive = btn.dataset.subtype === subType;
        btn.classList.toggle('active', isActive);

        if (isActive) {
            btn.style.background = subType === 'check' ? '#3b82f6' : '#f59e0b';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#f1f5f9';
            btn.style.color = '#64748b';
        }
    });

    // Toggle sub-content
    const checkContent = document.getElementById('disburse-check-content');
    const feeContent = document.getElementById('disburse-fee-content');

    if (checkContent) {
        checkContent.style.display = subType === 'check' ? 'flex' : 'none';
    }
    if (feeContent) {
        feeContent.style.display = subType === 'fee' ? 'flex' : 'none';
    }

    // The shared client sidebar is already rendered by switchOperationsTab
    // Only render legacy sidebars if new shared sidebar doesn't exist
    if (!document.getElementById('ops-client-list')) {
        if (subType === 'check') {
            renderChecksClientSidebar();
        } else if (subType === 'fee') {
            renderFeeClientSidebar();
        }
    }
}

/**
 * Render client sidebar for Receive tab (formerly Deposit)
 */
function renderReceiveClientSidebar() {
    const container = document.getElementById('receive-client-list');
    const totalEl = document.getElementById('receive-client-total');
    if (!container) {
        // Fallback to deposit sidebar if receive elements don't exist yet
        renderDepositClientSidebar();
        return;
    }

    const ledgers = ioltaState.ledgers || [];
    let totalBalance = 0;

    if (ledgers.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">👥</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">No clients yet</div>
                <div style="font-size: 12px; margin-bottom: 16px;">Add a client to get started</div>
                <button onclick="openClientModal()" style="padding: 10px 20px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500;">
                    + Add Client
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = ledgers.map(ledger => {
        totalBalance += parseFloat(ledger.current_balance) || 0;
        const isSelected = trustDepositsState.selectedClientId == ledger.id;
        const initials = (ledger.client_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return `
            <div class="receive-client-item ${isSelected ? 'selected' : ''}"
                 onclick="selectClientForReceive(${ledger.id})"
                 style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s; ${isSelected ? 'background: #ecfdf5; border-left: 3px solid #10b981;' : 'border-left: 3px solid transparent;'}"
                 onmouseover="this.style.background='${isSelected ? '#ecfdf5' : '#f8fafc'}'"
                 onmouseout="this.style.background='${isSelected ? '#ecfdf5' : 'transparent'}'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(ledger.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${ledger.client_number ? escapeHtml(ledger.client_number) : 'No case #'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                            <span></span>
                            <span style="font-size: 13px; font-weight: 600; color: ${parseFloat(ledger.current_balance) >= 0 ? '#10b981' : '#ef4444'};">
                                ${formatCurrency(ledger.current_balance)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }

    // Also update uncleared deposits count
    loadUnclearedDepositsCount();
}

/**
 * Load uncleared deposits count for header button
 */
async function loadUnclearedDepositsCount() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            type: 'deposit',
            all: 1
        });
        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];
        const unclearedCount = allTransactions.filter(t => t.status !== 'cleared').length;
        updateUnclearedDepositsCount(unclearedCount);
    } catch (error) {
        console.error('Error loading uncleared deposits count:', error);
    }
}

/**
 * Filter client list for Receive tab
 */
function filterReceiveClientList(searchTerm) {
    const container = document.getElementById('receive-client-list');
    if (!container) return;

    const items = container.querySelectorAll('.receive-client-item');
    const term = searchTerm.toLowerCase();

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? '' : 'none';
    });
}

/**
 * Select client for Receive tab (uses same logic as deposit)
 */
function selectClientForReceive(ledgerId) {
    // Store selected client ID in state
    trustDepositsState.selectedClientId = ledgerId;

    const select = document.getElementById('trust-deposit-ledger');
    if (select) {
        select.value = ledgerId;
        updateTrustDepositBalance();
    }
    // Re-render to show selection (try shared sidebar first, then legacy)
    if (document.getElementById('ops-client-list')) {
        renderOpsClientSidebar('receive');
    } else {
        renderReceiveClientSidebar();
    }
    // Load transaction history for selected client (deposits)
    loadClientTransactionHistory(ledgerId, 'deposit');
}

// =====================================================
// TRANSFER TAB FUNCTIONS
// =====================================================

function renderTransferClientSidebar() {
    const container = document.getElementById('transfer-client-list');
    const totalEl = document.getElementById('transfer-client-total');

    if (!container) return;

    const clients = ioltaState.clients || [];
    let totalBalance = 0;

    container.innerHTML = clients.map(client => {
        const balance = parseFloat(client.current_balance) || 0;
        totalBalance += balance;

        return `
            <div onclick="selectClientForTransfer(${client.id})"
                 class="client-item"
                 data-client-id="${client.id}"
                 style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;"
                 onmouseover="this.style.background='#f8fafc'"
                 onmouseout="this.style.background='white'">
                <div>
                    <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${client.client_name}</div>
                    <div style="font-size: 11px; color: #94a3b8;">${client.matter_number || 'No matter #'}</div>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: ${balance >= 0 ? '#059669' : '#dc2626'};">
                    ${formatCurrency(balance)}
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }
}

function filterTransferClientList(query) {
    const items = document.querySelectorAll('#transfer-client-list .client-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
        const name = item.querySelector('div > div:first-child')?.textContent?.toLowerCase() || '';
        const matter = item.querySelector('div > div:last-child')?.textContent?.toLowerCase() || '';
        item.style.display = (name.includes(lowerQuery) || matter.includes(lowerQuery)) ? '' : 'none';
    });
}

function selectClientForTransfer(clientId) {
    // Highlight selected client
    document.querySelectorAll('#transfer-client-list .client-item').forEach(item => {
        const isSelected = parseInt(item.dataset.clientId) === clientId;
        item.style.background = isSelected ? '#f5f3ff' : 'white';
        item.style.borderLeft = isSelected ? '3px solid #8b5cf6' : 'none';
    });

    // Load transfer history for this client
    loadClientTransferHistory(clientId);
}

async function loadClientTransferHistory(clientId) {
    const container = document.getElementById('transfer-transaction-list');
    const countEl = document.getElementById('transfer-tx-count');

    if (!container) return;

    const client = ioltaState.clients?.find(c => c.id === clientId);
    if (!client) return;

    // Get transactions filtered by transfer types
    const result = await apiGet('/trust/transactions.php', {
        ledger_id: client.id,
        user_id: state.currentUser || localStorage.getItem('currentUser')
    });

    if (!result.success) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Error loading transfers</div>';
        return;
    }

    const transfers = (result.data.transactions || []).filter(t =>
        t.transaction_type === 'transfer_in' || t.transaction_type === 'transfer_out'
    );

    if (countEl) {
        countEl.textContent = `${transfers.length} transfer${transfers.length !== 1 ? 's' : ''}`;
    }

    if (transfers.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">🔄</div>
                <div style="font-size: 14px; font-weight: 500;">No transfers yet</div>
                <div style="font-size: 12px; margin-top: 4px;">for ${client.client_name}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = transfers.map(tx => `
        <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${tx.description}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                    ${new Date(tx.transaction_date).toLocaleDateString()}
                    <span style="margin-left: 8px; padding: 2px 6px; background: ${tx.transaction_type === 'transfer_in' ? '#ecfdf5' : '#fef2f2'}; color: ${tx.transaction_type === 'transfer_in' ? '#059669' : '#dc2626'}; border-radius: 4px; font-size: 10px;">
                        ${tx.transaction_type === 'transfer_in' ? 'IN' : 'OUT'}
                    </span>
                </div>
            </div>
            <div style="font-size: 14px; font-weight: 600; color: ${tx.amount >= 0 ? '#059669' : '#dc2626'};">
                ${formatCurrency(Math.abs(tx.amount))}
            </div>
        </div>
    `).join('');
}

function openTransferModal() {
    const modal = document.getElementById('transfer-modal');
    if (modal) {
        modal.style.display = 'flex';
        populateTransferLedgers();
    }
}

function closeTransferModal() {
    const modal = document.getElementById('transfer-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openTransferHistoryModal() {
    showToast('Transfer history coming soon', 'info');
}

async function populateTransferLedgers() {
    const fromSelect = document.getElementById('modal-transfer-from');
    const toSelect = document.getElementById('modal-transfer-to');

    if (!fromSelect || !toSelect) return;

    const ledgers = ioltaState.clients || [];
    const options = ledgers.map(l =>
        `<option value="${l.id}">${l.client_name} - ${formatCurrency(l.current_balance)}</option>`
    ).join('');

    fromSelect.innerHTML = '<option value="">Select source...</option>' + options;
    toSelect.innerHTML = '<option value="">Select destination...</option>' + options;
}

// =====================================================
// FEE TAB FUNCTIONS
// =====================================================

function renderFeeClientSidebar() {
    const container = document.getElementById('fee-client-list');
    const totalEl = document.getElementById('fee-client-total');

    if (!container) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];
    let totalBalance = 0;

    // Map clients with their ledger balances
    const clientsWithBalances = clients.map(client => {
        // Find all ledgers for this client and sum their balances
        const clientLedgers = ledgers.filter(l => l.client_id == client.id);
        let balance = clientLedgers.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);

        // Add staging unassigned total to General/Unassigned
        if (client.client_name === 'General/Unassigned') {
            balance += (ioltaState.stagingUnassignedTotal || 0);
        }

        return { ...client, balance };
    });

    container.innerHTML = clientsWithBalances.map(client => {
        totalBalance += client.balance;

        return `
            <div onclick="selectClientForFee(${client.id})"
                 class="client-item"
                 data-client-id="${client.id}"
                 style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;"
                 onmouseover="this.style.background='#f8fafc'"
                 onmouseout="this.style.background='white'">
                <div>
                    <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${client.client_name}</div>
                    <div style="font-size: 11px; color: #94a3b8;">${client.matter_number || 'No matter #'}</div>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: ${client.balance >= 0 ? '#059669' : '#dc2626'};">
                    ${formatCurrency(client.balance)}
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) {
        totalEl.textContent = formatCurrency(totalBalance);
    }
}

function filterFeeClientList(query) {
    const items = document.querySelectorAll('#fee-client-list .client-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
        const name = item.querySelector('div > div:first-child')?.textContent?.toLowerCase() || '';
        const matter = item.querySelector('div > div:last-child')?.textContent?.toLowerCase() || '';
        item.style.display = (name.includes(lowerQuery) || matter.includes(lowerQuery)) ? '' : 'none';
    });
}

function selectClientForFee(ledgerId) {
    // Update shared ops sidebar if it exists
    if (document.getElementById('ops-client-list')) {
        renderOpsClientSidebar('disburse');
    } else {
        // Legacy: Highlight selected client in old sidebar
        document.querySelectorAll('#fee-client-list .client-item').forEach(item => {
            const isSelected = parseInt(item.dataset.clientId) === ledgerId;
            item.style.background = isSelected ? '#ecfdf5' : 'white';
            item.style.borderLeft = isSelected ? '3px solid #10b981' : 'none';
        });
    }

    // Load fee history for this client
    loadClientFeeHistory(ledgerId);
}

async function loadClientFeeHistory(clientId) {
    const container = document.getElementById('fee-transaction-list');
    const countEl = document.getElementById('fee-tx-count');

    if (!container) return;

    const client = ioltaState.clients?.find(c => c.id === clientId);
    if (!client) return;

    // Get transactions filtered by earned_fee type
    const result = await apiGet('/trust/transactions.php', {
        ledger_id: client.id,
        user_id: state.currentUser || localStorage.getItem('currentUser')
    });

    if (!result.success) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Error loading fee history</div>';
        return;
    }

    const fees = (result.data.transactions || []).filter(t => t.transaction_type === 'earned_fee');

    if (countEl) {
        countEl.textContent = `${fees.length} withdrawal${fees.length !== 1 ? 's' : ''}`;
    }

    if (fees.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 40px; margin-bottom: 12px;">💵</div>
                <div style="font-size: 14px; font-weight: 500;">No fee withdrawals yet</div>
                <div style="font-size: 12px; margin-top: 4px;">for ${client.client_name}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = fees.map(tx => `
        <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${tx.description}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                    ${new Date(tx.transaction_date).toLocaleDateString()}
                    ${tx.reference_number ? `<span style="margin-left: 8px;">Inv: ${tx.reference_number}</span>` : ''}
                </div>
            </div>
            <div style="font-size: 14px; font-weight: 600; color: #059669;">
                ${formatCurrency(Math.abs(tx.amount))}
            </div>
        </div>
    `).join('');
}

function openFeeModal() {
    const modal = document.getElementById('fee-modal');
    if (modal) {
        modal.style.display = 'flex';
        populateFeeLedgers();
        populateCostAccountClients();

        // Reset transfer to dropdown and cost client group
        const transferToSelect = document.getElementById('modal-fee-transfer-to');
        if (transferToSelect) transferToSelect.value = 'general';

        const costClientGroup = document.getElementById('fee-cost-client-group');
        if (costClientGroup) costClientGroup.style.display = 'none';

        // Reset subtitle
        const subtitle = document.getElementById('fee-modal-subtitle');
        if (subtitle) subtitle.textContent = 'Transfer to operating account';

        // Set default date
        const dateInput = document.getElementById('modal-fee-date');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function closeFeeModal() {
    const modal = document.getElementById('fee-modal');
    if (modal) {
        modal.style.display = 'none';
        // Reset form
        const form = document.getElementById('fee-modal-form');
        if (form) form.reset();
    }
}

function openFeeHistoryModal() {
    showToast('Fee history coming soon', 'info');
}

async function populateFeeLedgers() {
    const select = document.getElementById('modal-fee-ledger');
    if (!select) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];

    // Map clients with their ledger balances
    const clientsWithBalances = clients.map(client => {
        const clientLedgers = ledgers.filter(l => l.client_id == client.id);
        let balance = clientLedgers.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);

        // Add staging unassigned total to General/Unassigned
        if (client.client_name === 'General/Unassigned') {
            balance += (ioltaState.stagingUnassignedTotal || 0);
        }

        return { ...client, balance };
    });

    select.innerHTML = '<option value="">Select client...</option>' +
        clientsWithBalances.map(c =>
            `<option value="${c.id}">${c.client_name} - ${formatCurrency(c.balance)}</option>`
        ).join('');
}

// Populate Cost Account clients dropdown
async function populateCostAccountClients() {
    const select = document.getElementById('modal-fee-cost-client');
    if (!select) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Fetch cost account clients from API
        const data = await apiGet('/trust/clients.php', {
            user_id: userId,
            account_type: 'cost'
        });

        if (data.success && data.data.clients) {
            select.innerHTML = '<option value="">Select client...</option>' +
                data.data.clients.map(c =>
                    `<option value="${c.id}">${c.client_name}</option>`
                ).join('');
        } else {
            select.innerHTML = '<option value="">No cost account clients found</option>';
        }
    } catch (e) {
        console.error('Error loading cost account clients:', e);
        select.innerHTML = '<option value="">Error loading clients</option>';
    }
}

// Handle Transfer To dropdown change
function onFeeTransferToChange(value) {
    const costClientGroup = document.getElementById('fee-cost-client-group');
    const costClientSelect = document.getElementById('modal-fee-cost-client');
    const subtitle = document.getElementById('fee-modal-subtitle');
    const submitBtn = document.getElementById('fee-modal-submit-btn');

    if (value === 'cost') {
        // Show cost client dropdown
        if (costClientGroup) costClientGroup.style.display = 'block';
        if (costClientSelect) costClientSelect.required = true;
        if (subtitle) subtitle.textContent = 'Reimburse to cost account client';
        if (submitBtn) submitBtn.textContent = 'Reimburse';
    } else {
        // Hide cost client dropdown
        if (costClientGroup) costClientGroup.style.display = 'none';
        if (costClientSelect) costClientSelect.required = false;
        if (subtitle) subtitle.textContent = 'Transfer to operating account';
        if (submitBtn) submitBtn.textContent = 'Withdraw Fee';
    }
}

/**
 * Submit Transfer Modal Form
 */
async function submitTransferModal(event) {
    event.preventDefault();

    const fromLedgerId = document.getElementById('modal-transfer-from').value;
    const toLedgerId = document.getElementById('modal-transfer-to').value;
    const amount = parseFloat(document.getElementById('modal-transfer-amount').value);
    const date = document.getElementById('modal-transfer-date').value;
    const description = document.getElementById('modal-transfer-description').value;
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!fromLedgerId || !toLedgerId) {
        showToast('Please select both source and destination ledgers', 'error');
        return;
    }

    if (fromLedgerId === toLedgerId) {
        showToast('Source and destination cannot be the same', 'error');
        return;
    }

    try {
        // Create transfer_out transaction for source
        const outResult = await apiPost('/trust/transactions.php', {
            user_id: userId,
            ledger_id: parseInt(fromLedgerId),
            transaction_type: 'transfer_out',
            amount: amount,
            description: description + ' (Transfer to another client)',
            transaction_date: date
        });

        if (!outResult.success) {
            showToast(outResult.message || 'Error creating transfer out', 'error');
            return;
        }

        // Create transfer_in transaction for destination
        const inResult = await apiPost('/trust/transactions.php', {
            user_id: userId,
            ledger_id: parseInt(toLedgerId),
            transaction_type: 'transfer_in',
            amount: amount,
            description: description + ' (Transfer from another client)',
            transaction_date: date
        });

        if (!inResult.success) {
            showToast(inResult.message || 'Error creating transfer in', 'error');
            return;
        }

        showToast('Transfer completed successfully', 'success');
        closeTransferModal();
        await loadTrustLedgers();
        renderTransferClientSidebar();

    } catch (e) {
        console.error('Transfer error:', e);
        showToast('Error executing transfer', 'error');
    }
}

/**
 * Submit Fee Modal Form
 */
async function submitFeeModal(event) {
    event.preventDefault();

    const ledgerId = document.getElementById('modal-fee-ledger').value;
    const transferTo = document.getElementById('modal-fee-transfer-to').value;
    const costClientId = document.getElementById('modal-fee-cost-client').value;
    const amount = parseFloat(document.getElementById('modal-fee-amount').value);
    const date = document.getElementById('modal-fee-date').value;
    const description = document.getElementById('modal-fee-description').value;
    const invoice = document.getElementById('modal-fee-invoice').value;
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!ledgerId) {
        showToast('Please select a client ledger', 'error');
        return;
    }

    // Validate cost client if transfer to cost account
    if (transferTo === 'cost' && !costClientId) {
        showToast('Please select a cost account client', 'error');
        return;
    }

    try {
        if (transferTo === 'general') {
            // Transfer to General Account - Legal Fee
            const result = await apiPost('/trust/transactions.php', {
                user_id: userId,
                ledger_id: parseInt(ledgerId),
                transaction_type: 'earned_fee',
                amount: amount,
                description: description,
                reference_number: invoice || null,
                transaction_date: date,
                category_name: 'Legal Fee',  // Auto-categorize as Legal Fee
                destination_account: 'general'
            });

            if (result.success) {
                showToast('Fee withdrawal recorded to General Account', 'success');
                closeFeeModal();
                await loadTrustLedgers();
                renderFeeClientSidebar();
            } else {
                showToast(result.message || 'Error recording fee', 'error');
            }

        } else if (transferTo === 'cost') {
            // Transfer to Cost Account - Client Reimbursement
            const result = await apiPost('/trust/transactions.php', {
                user_id: userId,
                ledger_id: parseInt(ledgerId),
                transaction_type: 'reimbursement',
                amount: amount,
                description: description + ' (Reimbursement)',
                reference_number: invoice || null,
                transaction_date: date,
                destination_account: 'cost',
                cost_client_id: parseInt(costClientId)
            });

            if (result.success) {
                showToast('Reimbursement recorded to Cost Account client', 'success');
                closeFeeModal();
                await loadTrustLedgers();
                renderFeeClientSidebar();
            } else {
                showToast(result.message || 'Error recording reimbursement', 'error');
            }
        }

    } catch (e) {
        console.error('Fee withdrawal error:', e);
        showToast('Error recording fee withdrawal', 'error');
    }
}

// Export Operations Tab functions
window.switchOperationsTab = switchOperationsTab;
window.switchDisburseSubTab = switchDisburseSubTab;
window.renderOpsClientSidebar = renderOpsClientSidebar;
window.filterOpsClientList = filterOpsClientList;
window.selectOpsClient = selectOpsClient;
window.renderReceiveClientSidebar = renderReceiveClientSidebar;
window.filterReceiveClientList = filterReceiveClientList;
window.selectClientForReceive = selectClientForReceive;
window.renderTransferClientSidebar = renderTransferClientSidebar;
window.filterTransferClientList = filterTransferClientList;
window.selectClientForTransfer = selectClientForTransfer;
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.openTransferHistoryModal = openTransferHistoryModal;
window.submitTransferModal = submitTransferModal;
window.renderFeeClientSidebar = renderFeeClientSidebar;
window.filterFeeClientList = filterFeeClientList;
window.selectClientForFee = selectClientForFee;
window.openFeeModal = openFeeModal;
window.closeFeeModal = closeFeeModal;
window.openFeeHistoryModal = openFeeHistoryModal;
window.submitFeeModal = submitFeeModal;
window.onFeeTransferToChange = onFeeTransferToChange;

// =====================================================
// BATCH DEPOSIT - QuickBooks Style
// =====================================================

let batchState = {
    batches: [],
    selectedBatchId: null,
    filterStatus: 'draft'
};

async function loadBatchDepositTab() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        const batches = await IoltaApi.loadBatches(userId, batchState.filterStatus === 'all' ? null : batchState.filterStatus);
        batchState.batches = batches;
        renderBatchList();
    } catch (e) {
        console.error('Error loading batches:', e);
        showToast('Error loading batches', 'error');
    }
}

function filterBatches(status) {
    batchState.filterStatus = status;

    // Update button styles
    document.querySelectorAll('.batch-filter-btn').forEach(btn => {
        const isActive = btn.dataset.status === status;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? '#8b5cf6' : '#f1f5f9';
        btn.style.color = isActive ? 'white' : '#64748b';
    });

    loadBatchDepositTab();
}

function renderBatchList() {
    const container = document.getElementById('batch-list');
    if (!container) return;

    const batches = batchState.batches;

    if (!batches || batches.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">📦</div>
                <div style="font-size: 13px;">No ${batchState.filterStatus === 'all' ? '' : batchState.filterStatus} batches</div>
            </div>
        `;
        return;
    }

    container.innerHTML = batches.map(batch => {
        const isSelected = batchState.selectedBatchId == batch.id;
        const statusColor = batch.status === 'posted' ? '#10b981' : '#f59e0b';
        const statusBg = batch.status === 'posted' ? '#ecfdf5' : '#fef3c7';

        return `
            <div class="batch-item ${isSelected ? 'selected' : ''}"
                 onclick="selectBatch(${batch.id})"
                 style="padding: 14px 16px; border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: all 0.15s; ${isSelected ? 'background: #f5f3ff; border-left: 3px solid #8b5cf6;' : 'border-left: 3px solid transparent;'}"
                 onmouseover="this.style.background='${isSelected ? '#f5f3ff' : '#f8fafc'}'"
                 onmouseout="this.style.background='${isSelected ? '#f5f3ff' : 'transparent'}'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                    <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${formatCurrency(batch.total_amount)}</div>
                    <span style="padding: 2px 8px; background: ${statusBg}; color: ${statusColor}; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase;">
                        ${batch.status}
                    </span>
                </div>
                <div style="font-size: 12px; color: #64748b;">
                    ${formatDate(batch.batch_date)} ${batch.bank_reference ? '• ' + escapeHtml(batch.bank_reference) : ''}
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                    ${batch.item_count || 0} item(s)
                </div>
            </div>
        `;
    }).join('');
}

async function selectBatch(batchId) {
    batchState.selectedBatchId = batchId;

    // Update selection in list
    document.querySelectorAll('.batch-item').forEach(item => {
        item.classList.remove('selected');
        item.style.background = 'transparent';
        item.style.borderLeft = '3px solid transparent';
    });
    event.currentTarget.classList.add('selected');
    event.currentTarget.style.background = '#f5f3ff';
    event.currentTarget.style.borderLeft = '3px solid #8b5cf6';

    // Load batch detail
    try {
        const batch = await IoltaApi.loadBatch(batchId);
        if (batch) {
            renderBatchDetail(batch);
        }
    } catch (e) {
        console.error('Error loading batch:', e);
    }
}

function renderBatchDetail(batch) {
    const container = document.getElementById('batch-detail');
    if (!container) return;

    const isPosted = batch.status === 'posted';
    const items = batch.items || [];

    container.innerHTML = `
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 13px; opacity: 0.9;">Batch Deposit</div>
                    <div style="font-size: 24px; font-weight: 700;">${formatCurrency(batch.total_amount)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 13px; opacity: 0.9;">${formatDate(batch.batch_date)}</div>
                    ${batch.bank_reference ? `<div style="font-size: 12px; opacity: 0.8;">Ref: ${escapeHtml(batch.bank_reference)}</div>` : ''}
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 8px;">
                ${!isPosted ? `
                    <button onclick="openAddBatchItemModal(${batch.id})" style="padding: 8px 16px; background: #8b5cf6; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">+ Add Item</button>
                    <button onclick="postBatch(${batch.id})" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">Post Batch</button>
                    <button onclick="deleteBatch(${batch.id})" style="padding: 8px 16px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">Delete</button>
                ` : `
                    <span style="padding: 6px 12px; background: #ecfdf5; color: #059669; border-radius: 6px; font-size: 12px; font-weight: 600;">
                        Posted ${batch.posted_at ? formatDate(batch.posted_at) : ''}
                    </span>
                `}
            </div>
            <span style="font-size: 12px; color: #64748b;">${items.length} item(s)</span>
        </div>

        <!-- Items Table -->
        <div style="flex: 1; overflow-y: auto;">
            ${items.length === 0 ? `
                <div style="padding: 40px 20px; text-align: center; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
                    <div style="font-size: 13px;">No items yet</div>
                    <div style="font-size: 12px; margin-top: 4px;">Add checks to this batch</div>
                </div>
            ` : `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Client</th>
                            <th style="padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Check #</th>
                            <th style="padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</th>
                            <th style="padding: 10px 16px; text-align: right; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Amount</th>
                            ${!isPosted ? '<th style="padding: 10px 16px; text-align: center; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Actions</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 12px 16px;">
                                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(item.client_name || 'Unknown')}</div>
                                    ${item.matter_number ? `<div style="font-size: 11px; color: #94a3b8;">${escapeHtml(item.matter_number)}</div>` : ''}
                                </td>
                                <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">${item.check_number || '-'}</td>
                                <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">${escapeHtml(item.description || '-')}</td>
                                <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #10b981;">${formatCurrency(item.amount)}</td>
                                ${!isPosted ? `
                                    <td style="padding: 12px 16px; text-align: center;">
                                        <button onclick="deleteBatchItem(${item.id}, ${batch.id})" style="padding: 4px 8px; background: #fee2e2; color: #dc2626; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">Remove</button>
                                    </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <!-- Summary Footer -->
        <div style="padding: 12px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
            <div style="text-align: right;">
                <div style="font-size: 12px; color: #64748b;">Total</div>
                <div style="font-size: 20px; font-weight: 700; color: #8b5cf6;">${formatCurrency(batch.total_amount)}</div>
            </div>
        </div>
    `;
}

function openNewBatchModal() {
    const accounts = ioltaState.trustAccounts || [];
    const today = new Date().toISOString().split('T')[0];

    let modal = document.getElementById('new-batch-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'new-batch-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeNewBatchModal()">
            <div style="width: 450px; max-width: 95%; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">New Batch Deposit</h3>
                    <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Create a deposit slip for multiple checks</p>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Trust Account *</label>
                        <select id="new-batch-account" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            <option value="">Select account...</option>
                            ${accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Deposit Date *</label>
                        <input type="date" id="new-batch-date" value="${today}" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Bank Reference / Deposit Slip #</label>
                        <input type="text" id="new-batch-reference" placeholder="e.g., DEP-001" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Memo</label>
                        <input type="text" id="new-batch-memo" placeholder="Optional memo" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="padding: 16px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeNewBatchModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="submitNewBatch()" style="padding: 10px 20px; background: #8b5cf6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Create Batch</button>
                </div>
            </div>
        </div>
    `;
}

function closeNewBatchModal() {
    const modal = document.getElementById('new-batch-modal');
    if (modal) modal.remove();
}

async function submitNewBatch() {
    const accountId = document.getElementById('new-batch-account').value;
    const batchDate = document.getElementById('new-batch-date').value;
    const bankReference = document.getElementById('new-batch-reference').value;
    const memo = document.getElementById('new-batch-memo').value;
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!accountId || !batchDate) {
        showToast('Please select account and date', 'warning');
        return;
    }

    try {
        const result = await IoltaApi.createBatch({
            user_id: userId,
            account_id: accountId,
            batch_date: batchDate,
            bank_reference: bankReference,
            memo: memo
        });

        if (result.success) {
            showToast('Batch created', 'success');
            closeNewBatchModal();
            await loadBatchDepositTab();

            // Select the new batch
            if (result.data?.batch?.id) {
                batchState.selectedBatchId = result.data.batch.id;
                renderBatchDetail(result.data.batch);
            }
        } else {
            showToast(result.error || 'Error creating batch', 'error');
        }
    } catch (e) {
        console.error('Error creating batch:', e);
        showToast('Error creating batch', 'error');
    }
}

function openAddBatchItemModal(batchId) {
    const clients = ioltaState.clients || [];

    let modal = document.getElementById('add-batch-item-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-batch-item-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeAddBatchItemModal()">
            <div style="width: 450px; max-width: 95%; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Add Check to Batch</h3>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Client *</label>
                        <select id="batch-item-client" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            <option value="">Select client...</option>
                            ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.client_name)}${c.matter_number ? ' - ' + escapeHtml(c.matter_number) : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" id="batch-item-amount" step="0.01" min="0.01" placeholder="0.00" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Check Number</label>
                        <input type="text" id="batch-item-check" placeholder="e.g., 1234" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Payee (Check From)</label>
                        <input type="text" id="batch-item-payee" placeholder="Who wrote the check" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" id="batch-item-desc" placeholder="e.g., Retainer payment" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="padding: 16px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeAddBatchItemModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="submitBatchItem(${batchId})" style="padding: 10px 20px; background: #8b5cf6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Add Item</button>
                </div>
            </div>
        </div>
    `;
}

function closeAddBatchItemModal() {
    const modal = document.getElementById('add-batch-item-modal');
    if (modal) modal.remove();
}

async function submitBatchItem(batchId) {
    const clientId = document.getElementById('batch-item-client').value;
    const amount = parseFloat(document.getElementById('batch-item-amount').value);
    const checkNumber = document.getElementById('batch-item-check').value;
    const payeeName = document.getElementById('batch-item-payee').value;
    const description = document.getElementById('batch-item-desc').value;

    if (!clientId || !amount || amount <= 0) {
        showToast('Please select client and enter amount', 'warning');
        return;
    }

    try {
        const result = await IoltaApi.addBatchItem(batchId, {
            client_id: clientId,
            amount: amount,
            check_number: checkNumber,
            payee_name: payeeName,
            description: description
        });

        if (result.success) {
            showToast('Item added', 'success');
            closeAddBatchItemModal();
            await loadBatchDepositTab();

            // Refresh detail view
            const batch = await IoltaApi.loadBatch(batchId);
            if (batch) renderBatchDetail(batch);
        } else {
            showToast(result.error || 'Error adding item', 'error');
        }
    } catch (e) {
        console.error('Error adding batch item:', e);
        showToast('Error adding item', 'error');
    }
}

async function deleteBatchItem(itemId, batchId) {
    if (!confirm('Remove this item from the batch?')) return;

    try {
        const result = await IoltaApi.deleteBatchItem(itemId);
        if (result.success) {
            showToast('Item removed', 'success');
            await loadBatchDepositTab();

            // Refresh detail
            const batch = await IoltaApi.loadBatch(batchId);
            if (batch) renderBatchDetail(batch);
        } else {
            showToast(result.error || 'Error removing item', 'error');
        }
    } catch (e) {
        console.error('Error deleting batch item:', e);
        showToast('Error removing item', 'error');
    }
}

async function postBatch(batchId) {
    const batch = batchState.batches.find(b => b.id == batchId);
    if (!batch) return;

    if (!confirm(`Post this batch deposit?\n\nTotal: ${formatCurrency(batch.total_amount)}\nItems: ${batch.item_count}\n\nThis will create transactions in each client's ledger.`)) {
        return;
    }

    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');
        const result = await IoltaApi.postBatch(batchId, userId);

        if (result.success) {
            showToast(`Batch posted: ${result.data.posted} transactions created`, 'success');
            await loadBatchDepositTab();

            // Refresh detail
            const updatedBatch = await IoltaApi.loadBatch(batchId);
            if (updatedBatch) renderBatchDetail(updatedBatch);
        } else {
            showToast(result.error || 'Error posting batch', 'error');
        }
    } catch (e) {
        console.error('Error posting batch:', e);
        showToast('Error posting batch', 'error');
    }
}

async function deleteBatch(batchId) {
    if (!confirm('Delete this batch? This cannot be undone.')) return;

    try {
        const result = await IoltaApi.deleteBatch(batchId);
        if (result.success) {
            showToast('Batch deleted', 'success');
            batchState.selectedBatchId = null;
            await loadBatchDepositTab();

            // Clear detail view
            const container = document.getElementById('batch-detail');
            if (container) {
                container.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 48px; margin-bottom: 12px;">📦</div>
                        <div style="font-size: 16px; font-weight: 500;">Select a batch</div>
                        <div style="font-size: 13px; margin-top: 4px;">or create a new one</div>
                    </div>
                `;
            }
        } else {
            showToast(result.error || 'Error deleting batch', 'error');
        }
    } catch (e) {
        console.error('Error deleting batch:', e);
        showToast('Error deleting batch', 'error');
    }
}

// Export Batch Deposit functions
window.loadBatchDepositTab = loadBatchDepositTab;
window.filterBatches = filterBatches;
window.selectBatch = selectBatch;
window.openNewBatchModal = openNewBatchModal;
window.closeNewBatchModal = closeNewBatchModal;
window.submitNewBatch = submitNewBatch;
window.openAddBatchItemModal = openAddBatchItemModal;
window.closeAddBatchItemModal = closeAddBatchItemModal;
window.submitBatchItem = submitBatchItem;
window.deleteBatchItem = deleteBatchItem;
window.postBatch = postBatch;
window.deleteBatch = deleteBatch;

// =====================================================
// CLIENT LEDGER PAGE - 2-Column Layout with Sidebar
// =====================================================

let ledgerCurrentFilter = 'all';
let ledgerSearchTerm = '';
let ledgerSidebarSearchTerm = '';

async function loadClientLedgerPage() {
    // Use new refactored module
    if (typeof IoltaUI !== 'undefined') {
        await IoltaUI.loadData();
        IoltaUI.currentFilter = 'all';
        IoltaUI.searchTerm = '';
        const searchInput = document.getElementById('ledger-client-search');
        if (searchInput) searchInput.value = '';
        IoltaUI.renderClientSidebar();
        IoltaUI.renderTransactionList();
        return;
    }

    // Legacy fallback
    await loadIOLTAData();
    await loadTrustLedgers();
    await Promise.all([
        loadAllClientTransactions(),
        loadStagingUnassignedTotal()
    ]);

    ledgerCurrentFilter = 'all';
    ledgerSearchTerm = '';
    ledgerSidebarSearchTerm = '';
    const searchInput = document.getElementById('ledger-client-search');
    if (searchInput) searchInput.value = '';

    renderLedgerClientSidebar();
    renderClientLedger();
}

async function loadAllClientTransactions() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Load all transactions from all ledgers (no limit)
    const data = await apiGet('/trust/transactions.php', {
        user_id: userId,
        limit: 'all'
    });

    if (data.success) {
        ioltaState.allTransactions = data.data.transactions || [];
    }
}

async function loadStagingUnassignedTotal() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Load staging summary to get unassigned total AND total
    const data = await apiGet('/trust/staging.php', {
        user_id: userId
    });

    if (data.success && data.data.summary) {
        // Unassigned total for General/Unassigned client
        const unassigned = data.data.summary.unassigned;
        ioltaState.stagingUnassignedTotal = unassigned ? (unassigned.net || 0) : 0;
        // Total staging (Bank Statement = source of truth)
        const total = data.data.summary.total;
        ioltaState.stagingTotal = total ? (total.net || 0) : 0;
    } else {
        ioltaState.stagingUnassignedTotal = 0;
        ioltaState.stagingTotal = 0;
    }

    // Also load unassigned staging transactions for General/Unassigned detail view
    const unassignedData = await apiGet('/trust/staging.php', {
        user_id: userId,
        status: 'unassigned'
    });

    if (unassignedData.success && unassignedData.data.staging) {
        // Convert staging records to transaction-like format
        ioltaState.stagingUnassignedTransactions = unassignedData.data.staging.map(s => ({
            id: 'staging_' + s.id,
            staging_id: s.id,
            transaction_date: s.transaction_date,
            transaction_type: s.transaction_type,
            amount: parseFloat(s.amount),
            description: s.description,
            reference_number: s.reference_number,
            payee: s.payee,
            is_posted: 0,
            is_staging: true,
            status: s.status,
            running_balance: 0  // Not applicable for staging
        }));
    } else {
        ioltaState.stagingUnassignedTransactions = [];
    }
}

// =====================================================
// Client Sidebar Functions
// =====================================================

function filterLedgerClientList(searchTerm) {
    // Use new refactored module
    if (typeof IoltaUI !== 'undefined') {
        IoltaUI.filterClients(searchTerm);
        return;
    }
    // Legacy fallback
    ledgerSidebarSearchTerm = searchTerm.toLowerCase();
    renderLedgerClientSidebar();
}

function renderLedgerClientSidebar() {
    const container = document.getElementById('ledger-client-sidebar');
    if (!container) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];

    // Filter by search term
    let filteredClients = clients;
    if (ledgerSidebarSearchTerm) {
        filteredClients = clients.filter(c =>
            c.client_name.toLowerCase().includes(ledgerSidebarSearchTerm) ||
            (c.client_number && c.client_number.toLowerCase().includes(ledgerSidebarSearchTerm)) ||
            (c.matter_number && c.matter_number.toLowerCase().includes(ledgerSidebarSearchTerm))
        );
    }

    // Calculate balances for each client
    const clientsWithBalance = filteredClients.map(client => {
        const clientLedgers = ledgers.filter(l => l.client_id == client.id);
        let balance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

        // Add staging unassigned total to General/Unassigned client
        if (client.client_name === 'General/Unassigned') {
            balance += (ioltaState.stagingUnassignedTotal || 0);
        }

        return { ...client, balance };
    });

    // Sort by client_number (case #) descending (highest first)
    clientsWithBalance.sort((a, b) => {
        const caseA = a.client_number || '0';
        const caseB = b.client_number || '0';
        return caseB.localeCompare(caseA, undefined, { numeric: true });
    });

    // Calculate total balance - use Bank Statement (staging) as source of truth
    const ledgerTotal = ledgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
    // If staging total is available, use it (Bank Balance = source of truth)
    // Otherwise fall back to ledger + unassigned staging
    const totalBalance = ioltaState.stagingTotal || (ledgerTotal + (ioltaState.stagingUnassignedTotal || 0));
    const totalBalanceColor = totalBalance > 0 ? '#10b981' : (totalBalance < 0 ? '#ef4444' : '#64748b');

    // Build sidebar HTML
    let html = `
        <div class="ledger-client-item ${ledgerCurrentFilter === 'all' ? 'active' : ''}"
             onclick="selectLedgerClientFromSidebar('all')"
             style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; ${ledgerCurrentFilter === 'all' ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}">
            <div>
                <div style="font-size: 13px; font-weight: 600; color: #3b82f6;">All Clients</div>
                <div style="font-size: 11px; color: #64748b;">${clients.length} total</div>
            </div>
            <div style="font-size: 13px; font-weight: 700; color: ${totalBalanceColor};">
                ${formatCurrency(totalBalance)}
            </div>
        </div>
    `;

    if (clientsWithBalance.length === 0 && ledgerSidebarSearchTerm) {
        html += `
            <div style="padding: 24px 16px; text-align: center; color: #94a3b8;">
                <div style="font-size: 13px;">No clients found</div>
            </div>
        `;
    } else {
        clientsWithBalance.forEach(client => {
            const isActive = ledgerCurrentFilter == client.id;
            const balanceColor = client.balance > 0 ? '#10b981' : (client.balance < 0 ? '#ef4444' : '#94a3b8');

            html += `
                <div class="ledger-client-item ${isActive ? 'active' : ''}"
                     onclick="selectLedgerClientFromSidebar('${client.id}')"
                     style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; ${isActive ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}"
                     onmouseover="if(!this.classList.contains('active')) this.style.background='#f8fafc'"
                     onmouseout="if(!this.classList.contains('active')) this.style.background=''">
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 13px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(client.client_name)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8;">
                            ${client.client_number ? escapeHtml(client.client_number) : 'No case #'}
                        </div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: ${balanceColor}; margin-left: 8px; white-space: nowrap;">
                        ${formatCurrency(client.balance)}
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}

function selectLedgerClientFromSidebar(clientId) {
    // Use new refactored module
    if (typeof IoltaUI !== 'undefined') {
        IoltaUI.selectClient(clientId);
        return;
    }
    // Legacy fallback
    ledgerCurrentFilter = clientId;
    renderLedgerClientSidebar();
    updateSelectedClientHeader();
    renderClientLedger();
}

function updateSelectedClientHeader() {
    const nameEl = document.getElementById('ledger-selected-client-name');
    const matterEl = document.getElementById('ledger-selected-client-matter');
    const balanceEl = document.getElementById('ledger-selected-balance-amount');
    const balanceHeaderEl = document.getElementById('ledger-balance-header');

    if (!nameEl) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];

    if (ledgerCurrentFilter === 'all') {
        const ledgerTotal = ledgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
        const totalBalance = ledgerTotal + (ioltaState.stagingUnassignedTotal || 0);
        nameEl.textContent = 'All Clients';
        matterEl.textContent = `${clients.length} clients`;
        if (balanceEl) {
            balanceEl.textContent = formatCurrency(totalBalance);
            balanceEl.style.color = totalBalance >= 0 ? '#10b981' : '#ef4444';
        }
        // Update table header to show "Client Bal" for All Clients view
        if (balanceHeaderEl) balanceHeaderEl.textContent = 'Client Bal';
    } else {
        const client = clients.find(c => c.id == ledgerCurrentFilter);
        if (client) {
            const clientLedgers = ledgers.filter(l => l.client_id == client.id);
            let balance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

            // Add staging unassigned total for General/Unassigned client
            if (client.client_name === 'General/Unassigned') {
                balance += (ioltaState.stagingUnassignedTotal || 0);
            }

            nameEl.textContent = client.client_name;
            matterEl.textContent = client.matter_number || client.client_number || '';
            if (balanceEl) {
                balanceEl.textContent = formatCurrency(balance);
                balanceEl.style.color = balance >= 0 ? '#10b981' : '#ef4444';
            }
        }
        // Update table header to show "Balance" for single client view (running balance)
        if (balanceHeaderEl) balanceHeaderEl.textContent = 'Balance';
    }
}

// Legacy dropdown functions (kept for compatibility)
function showLedgerClientDropdown() {
    const dropdown = document.getElementById('ledger-client-dropdown');
    if (!dropdown) return;

    renderLedgerClientDropdown('');
    dropdown.style.display = 'block';
}

function searchLedgerClients(term) {
    ledgerSearchTerm = term.toLowerCase();
    renderLedgerClientDropdown(ledgerSearchTerm);

    const dropdown = document.getElementById('ledger-client-dropdown');
    if (dropdown) dropdown.style.display = 'block';
}

function renderLedgerClientDropdown(searchTerm) {
    const dropdown = document.getElementById('ledger-client-dropdown');
    if (!dropdown) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];

    // Filter clients by search term
    let filteredClients = clients;
    if (searchTerm) {
        filteredClients = clients.filter(c =>
            c.client_name.toLowerCase().includes(searchTerm) ||
            (c.client_number && c.client_number.toLowerCase().includes(searchTerm))
        );
    }

    // Build dropdown items
    let html = `
        <div onclick="selectLedgerClient('all', 'All Clients')"
             style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #3b82f6;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
            All Clients
        </div>
    `;

    if (filteredClients.length === 0) {
        html += `
            <div style="padding: 16px 12px; text-align: center; color: #94a3b8; font-size: 13px;">
                No clients found
            </div>
        `;
    } else {
        // Show first 50 results
        filteredClients.slice(0, 50).forEach(client => {
            // Calculate client balance
            const clientLedgers = ledgers.filter(l => l.client_id == client.id);
            let balance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

            // Add staging unassigned total to General/Unassigned
            if (client.client_name === 'General/Unassigned') {
                balance += (ioltaState.stagingUnassignedTotal || 0);
            }

            html += `
                <div onclick="selectLedgerClient('${client.id}', '${escapeHtml(client.client_name)}')"
                     style="padding: 10px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                     onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                    <div>
                        <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${escapeHtml(client.client_name)}</div>
                        ${client.client_number ? `<div style="font-size: 11px; color: #94a3b8;">${escapeHtml(client.client_number)}</div>` : ''}
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                        ${formatCurrency(balance)}
                    </div>
                </div>
            `;
        });

        if (filteredClients.length > 50) {
            html += `
                <div style="padding: 10px 12px; text-align: center; color: #64748b; font-size: 12px; background: #f8fafc;">
                    Showing 50 of ${filteredClients.length} clients. Type to search more.
                </div>
            `;
        }
    }

    dropdown.innerHTML = html;
}

function selectLedgerClient(clientId, clientName) {
    ledgerCurrentFilter = clientId;

    const searchInput = document.getElementById('ledger-client-search');
    const dropdown = document.getElementById('ledger-client-dropdown');
    const clearBtn = document.getElementById('ledger-clear-filter');

    if (searchInput) {
        searchInput.value = clientId === 'all' ? '' : clientName;
    }
    if (dropdown) dropdown.style.display = 'none';
    if (clearBtn) {
        clearBtn.style.display = clientId === 'all' ? 'none' : 'inline-block';
    }

    renderClientLedger();
}

function clearLedgerFilter() {
    selectLedgerClient('all', 'All Clients');
}

function filterLedgerByClient(clientId) {
    ledgerCurrentFilter = clientId;
    renderClientLedger();
}

// State for selected transactions
let ledgerSelectedTxIds = new Set();
let ledgerLastSelectedTxId = null; // For shift+click range selection

function renderClientLedger() {
    const container = document.getElementById('ledger-transactions-list');
    const totalBalanceEl = document.getElementById('ledger-total-balance');
    const clientCountEl = document.getElementById('ledger-client-count');

    if (!container) return;

    const clients = ioltaState.clients || [];
    const ledgers = ioltaState.ledgers || [];
    const transactions = ioltaState.allTransactions || [];

    // Calculate totals
    const totalBalance = ledgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
    const activeClients = clients.filter(c => c.is_active).length;

    // Update header stats
    if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(totalBalance);
    if (clientCountEl) clientCountEl.textContent = activeClients;

    // Update selected client header
    updateSelectedClientHeader();

    // Filter transactions by client if needed
    let filteredTransactions = transactions;

    // Check if General/Unassigned client is selected
    const selectedClient = clients.find(c => c.id == ledgerCurrentFilter);
    const isGeneralUnassigned = selectedClient && selectedClient.client_name === 'General/Unassigned';

    if (ledgerCurrentFilter !== 'all') {
        if (isGeneralUnassigned) {
            // For General/Unassigned, show staging unassigned transactions
            // These are stored in ioltaState.stagingUnassignedTransactions
            filteredTransactions = ioltaState.stagingUnassignedTransactions || [];
        } else {
            const clientLedgerIds = ledgers
                .filter(l => l.client_id == ledgerCurrentFilter)
                .map(l => l.id);
            filteredTransactions = transactions.filter(tx => clientLedgerIds.includes(tx.ledger_id));
        }
    }

    // Sort by date descending, then by id descending for same date
    filteredTransactions.sort((a, b) => {
        const dateCompare = new Date(b.transaction_date) - new Date(a.transaction_date);
        if (dateCompare !== 0) return dateCompare;
        return b.id - a.id;
    });

    // Store for later reference
    window._ledgerFilteredTransactions = filteredTransactions;

    // Clear selection if filtered list changed
    ledgerSelectedTxIds = new Set([...ledgerSelectedTxIds].filter(id =>
        filteredTransactions.some(tx => tx.id == id)
    ));

    // Update action bar
    updateLedgerActionBar();

    if (filteredTransactions.length === 0) {
        container.innerHTML = `
            <div style="padding: 48px; text-align: center; color: #94a3b8;">
                <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                <div style="font-size: 16px; font-weight: 500; color: #64748b;">No Transactions</div>
                <div style="font-size: 14px; margin-top: 4px;">
                    ${ledgerCurrentFilter !== 'all' ? 'No transactions for this client' : 'No transactions yet'}
                </div>
            </div>
        `;
        return;
    }

    // Build transaction rows with checkbox
    let html = filteredTransactions.map((tx, index) => {
        // Check if this is a staging transaction
        const isStaging = tx.is_staging === true;

        // Find ledger and client info (for "All Clients" view)
        const ledger = !isStaging ? ledgers.find(l => l.id == tx.ledger_id) : null;
        const client = ledger ? clients.find(c => c.id == ledger.client_id) : null;
        const clientName = isStaging ? 'Unassigned' : (client ? client.client_name : 'Unknown');

        const amount = parseFloat(tx.amount || 0);
        const isDebit = tx.transaction_type === 'debit' || tx.transaction_type === 'disbursement' || amount < 0;
        const displayAmount = Math.abs(amount);

        // For "All Clients" view, show ledger's current balance (final client balance)
        // For staging or single client view, show running_balance (balance after this transaction)
        // For staging unassigned, balance is not applicable
        let balance = 0;
        if (isStaging) {
            balance = 0; // No running balance for unassigned staging
        } else if (ledgerCurrentFilter === 'all') {
            balance = parseFloat(ledger?.current_balance || 0);
        } else {
            balance = parseFloat(tx.running_balance || 0);
        }

        // Extract check number from reference_number, check_number, or description
        let refNum = tx.reference_number || tx.check_number || '';
        if (!refNum && tx.description) {
            const match = tx.description.match(/CHECK\s*#?\s*(\d+)/i);
            if (match) {
                refNum = match[1];
            }
        }

        const isSelected = ledgerSelectedTxIds.has(tx.id);

        // Description - include client name if showing all clients
        let description = tx.description || tx.payee || '-';
        if (ledgerCurrentFilter === 'all' && clientName) {
            description = `<span style="color: #6366f1; font-weight: 500;">${escapeHtml(clientName)}</span> - ${escapeHtml(description)}`;
        } else {
            description = escapeHtml(description);
        }

        // Status display - staging transactions show their staging status
        let statusText, statusBg, statusColor;
        if (isStaging) {
            statusText = 'Unassigned';
            statusBg = '#fef3c7';
            statusColor = '#d97706';
        } else {
            const isPosted = tx.is_posted == 1;
            statusText = isPosted ? 'Posted' : 'Pending';
            statusBg = isPosted ? '#dcfce7' : '#fef3c7';
            statusColor = isPosted ? '#16a34a' : '#d97706';
        }

        return `
            <div class="ledger-tx-row ${isSelected ? 'selected' : ''}" data-tx-id="${tx.id}" data-index="${index}"
                 style="display: grid; grid-template-columns: 36px 90px 70px 1fr 100px 100px 80px; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; ${isSelected ? 'background: #eff6ff;' : ''}">
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" class="ledger-tx-checkbox" data-tx-id="${tx.id}"
                           ${isSelected ? 'checked' : ''}
                           onclick="toggleLedgerTxSelection(${tx.id}, event)"
                           style="width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6;">
                </div>
                <div style="font-size: 13px; color: #64748b; cursor: pointer;" onclick="showTrustTransactionDetail(${index})">${formatDate(tx.transaction_date)}</div>
                <div style="font-size: 12px; font-weight: 500; color: ${refNum ? '#7c3aed' : '#cbd5e1'}; cursor: pointer;" onclick="showTrustTransactionDetail(${index})">${refNum || '-'}</div>
                <div style="font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" onclick="showTrustTransactionDetail(${index})">${description}</div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isDebit ? '#ef4444' : '#10b981'}; cursor: pointer;" onclick="showTrustTransactionDetail(${index})">
                    ${isDebit ? '-' : '+'}${formatCurrency(displayAmount)}
                </div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isStaging ? '#94a3b8' : (balance >= 0 ? '#1e293b' : '#ef4444')}; cursor: pointer;" onclick="showTrustTransactionDetail(${index})">
                    ${isStaging ? '-' : formatCurrency(balance)}
                </div>
                <div style="text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 500; border-radius: 4px; background: ${statusBg}; color: ${statusColor};">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Cache transactions for detail view
    window._trustTransactionsCache = filteredTransactions;
}

// Update action bar visibility based on selection
function updateLedgerActionBar() {
    let actionBar = document.getElementById('ledger-action-bar');
    const selectedCount = ledgerSelectedTxIds.size;

    if (selectedCount === 0) {
        if (actionBar) actionBar.remove();
        return;
    }

    // Create action bar if it doesn't exist
    if (!actionBar) {
        actionBar = document.createElement('div');
        actionBar.id = 'ledger-action-bar';
        document.body.appendChild(actionBar);
    }

    // Fixed position at bottom center of screen
    actionBar.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: #1e293b;
        display: flex;
        align-items: center;
        gap: 16px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1);
        z-index: 9999;
    `;

    actionBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; padding-right: 16px; border-right: 1px solid #475569;">
            <div style="width: 32px; height: 32px; background: #3b82f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
                ${selectedCount}
            </div>
            <span style="color: #94a3b8; font-size: 13px;">selected</span>
        </div>
        <div style="display: flex; gap: 8px;">
            <button onclick="openLedgerMoveModal()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                Move to Client
            </button>
            <button onclick="openLedgerEditModal()" style="padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s; ${selectedCount !== 1 ? 'opacity: 0.4; cursor: not-allowed;' : ''}" ${selectedCount !== 1 ? 'disabled' : ''} onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
                Edit
            </button>
            <button onclick="deleteLedgerTransactions()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
                Delete
            </button>
        </div>
        <button onclick="clearLedgerSelection()" style="padding: 8px; background: transparent; color: #64748b; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; margin-left: 8px;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#64748b'" title="Cancel">
            ✕
        </button>
    `;
}

function toggleLedgerTxSelection(txId, event) {
    if (event) event.stopPropagation();

    const transactions = window._ledgerFilteredTransactions || [];
    const checkbox = document.querySelector(`.ledger-tx-checkbox[data-tx-id="${txId}"]`);

    // Shift+click for range selection
    if (event && event.shiftKey && ledgerLastSelectedTxId !== null) {
        // Prevent default checkbox behavior for shift+click
        if (event.preventDefault) event.preventDefault();

        const txIds = transactions.map(t => t.id);
        const currentIndex = txIds.indexOf(txId);
        const lastIndex = txIds.indexOf(ledgerLastSelectedTxId);

        if (currentIndex !== -1 && lastIndex !== -1) {
            const start = Math.min(currentIndex, lastIndex);
            const end = Math.max(currentIndex, lastIndex);

            // Select all transactions in range
            for (let i = start; i <= end; i++) {
                const id = txIds[i];
                ledgerSelectedTxIds.add(id);

                // Update UI for each row
                const row = document.querySelector(`.ledger-tx-row[data-tx-id="${id}"]`);
                const cb = document.querySelector(`.ledger-tx-checkbox[data-tx-id="${id}"]`);
                if (row) {
                    row.classList.add('selected');
                    row.style.background = '#eff6ff';
                }
                if (cb) {
                    cb.checked = true;
                }
            }

            updateLedgerActionBar();
            return;
        }
    }

    // Normal click - toggle single item
    // For onclick, the checkbox state has already changed, so we read its current state
    const isNowChecked = checkbox ? checkbox.checked : !ledgerSelectedTxIds.has(txId);

    if (isNowChecked) {
        ledgerSelectedTxIds.add(txId);
        ledgerLastSelectedTxId = txId; // Remember last selected for shift+click
    } else {
        ledgerSelectedTxIds.delete(txId);
    }

    // Update UI
    const row = document.querySelector(`.ledger-tx-row[data-tx-id="${txId}"]`);

    if (row) {
        row.classList.toggle('selected', isNowChecked);
        row.style.background = isNowChecked ? '#eff6ff' : '';
    }

    updateLedgerActionBar();
}

function toggleSelectAllLedgerTx(checked) {
    const transactions = window._ledgerFilteredTransactions || [];

    if (checked) {
        transactions.forEach(tx => ledgerSelectedTxIds.add(tx.id));
    } else {
        ledgerSelectedTxIds.clear();
    }

    // Update all checkboxes and rows
    document.querySelectorAll('.ledger-tx-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    document.querySelectorAll('.ledger-tx-row').forEach(row => {
        row.classList.toggle('selected', checked);
        row.style.background = checked ? '#eff6ff' : '';
    });

    updateLedgerActionBar();
}

function clearLedgerSelection() {
    ledgerSelectedTxIds.clear();
    ledgerLastSelectedTxId = null; // Reset shift+click anchor
    document.querySelectorAll('.ledger-tx-checkbox').forEach(cb => {
        cb.checked = false;
    });
    document.querySelectorAll('.ledger-tx-row').forEach(row => {
        row.classList.remove('selected');
        row.style.background = '';
    });
    updateLedgerActionBar();
}

// =====================================================
// Move to Client Modal
// =====================================================

function openLedgerMoveModal() {
    if (ledgerSelectedTxIds.size === 0) {
        showToast('Please select transactions to move', 'warning');
        return;
    }

    const clients = ioltaState.clients || [];

    let modal = document.getElementById('ledger-move-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ledger-move-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeLedgerMoveModal()">
            <div style="width: 500px; max-width: 95%; max-height: 80vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">Move ${ledgerSelectedTxIds.size} Transaction(s) to Client</h3>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <input type="text" id="move-client-search" placeholder="Search clients..."
                               oninput="filterMoveClientList(this.value)"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div id="move-client-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        ${clients.map(c => `
                            <div class="move-client-option" onclick="selectMoveClient(${c.id})"
                                 data-client-id="${c.id}"
                                 style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
                                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                                <div>
                                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(c.client_name)}</div>
                                    <div style="font-size: 12px; color: #64748b;">${c.matter_number || c.client_number || ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeLedgerMoveModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                </div>
            </div>
        </div>
    `;
}

function closeLedgerMoveModal() {
    const modal = document.getElementById('ledger-move-modal');
    if (modal) modal.remove();
}

function filterMoveClientList(searchTerm) {
    const clients = ioltaState.clients || [];
    const filtered = clients.filter(c =>
        c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.matter_number && c.matter_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.client_number && c.client_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const container = document.getElementById('move-client-list');
    if (!container) return;

    container.innerHTML = filtered.map(c => `
        <div class="move-client-option" onclick="selectMoveClient(${c.id})"
             data-client-id="${c.id}"
             style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <div>
                <div style="font-weight: 500; color: #1e293b;">${escapeHtml(c.client_name)}</div>
                <div style="font-size: 12px; color: #64748b;">${c.matter_number || c.client_number || ''}</div>
            </div>
        </div>
    `).join('');
}

async function selectMoveClient(targetClientId) {
    if (ledgerSelectedTxIds.size === 0) return;

    const confirmMove = confirm(`Move ${ledgerSelectedTxIds.size} transaction(s) to this client?`);
    if (!confirmMove) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const transactionIds = Array.from(ledgerSelectedTxIds);

    try {
        const result = await apiPost('/trust/transactions.php', {
            action: 'move_to_client',
            user_id: userId,
            transaction_ids: transactionIds,
            target_client_id: targetClientId
        });

        if (result.success) {
            showToast(`Moved ${transactionIds.length} transaction(s) successfully`, 'success');
            closeLedgerMoveModal();
            clearLedgerSelection();
            // Reload data
            await loadTrustLedgers();
            await loadAllClientTransactions();
            renderLedgerClientSidebar();
            renderClientLedger();
        } else {
            showToast(result.message || 'Failed to move transactions', 'error');
        }
    } catch (error) {
        console.error('Error moving transactions:', error);
        showToast('Error moving transactions', 'error');
    }
}

// =====================================================
// Edit Transaction Modal
// =====================================================

function openLedgerEditModal() {
    if (ledgerSelectedTxIds.size !== 1) {
        showToast('Please select exactly one transaction to edit', 'warning');
        return;
    }

    const txId = Array.from(ledgerSelectedTxIds)[0];
    const transactions = window._ledgerFilteredTransactions || [];
    const tx = transactions.find(t => t.id == txId);

    if (!tx) {
        showToast('Transaction not found', 'error');
        return;
    }

    let modal = document.getElementById('ledger-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ledger-edit-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeLedgerEditModal()">
            <div style="width: 500px; max-width: 95%; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                    <h3 style="margin: 0; color: white; font-size: 18px;">Edit Transaction</h3>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Date</label>
                        <input type="date" id="edit-tx-date" value="${tx.transaction_date}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Description</label>
                        <input type="text" id="edit-tx-description" value="${escapeHtml(tx.description || '')}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Reference #</label>
                        <input type="text" id="edit-tx-reference" value="${escapeHtml(tx.reference_number || tx.check_number || '')}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Amount</label>
                        <input type="number" id="edit-tx-amount" value="${Math.abs(tx.amount)}" step="0.01"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Payee</label>
                        <input type="text" id="edit-tx-payee" value="${escapeHtml(tx.payee || '')}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="closeLedgerEditModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button onclick="saveLedgerEdit(${tx.id})" style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">Save Changes</button>
                </div>
            </div>
        </div>
    `;
}

function closeLedgerEditModal() {
    const modal = document.getElementById('ledger-edit-modal');
    if (modal) modal.remove();
}

async function saveLedgerEdit(txId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = {
        action: 'update',
        user_id: parseInt(userId),
        id: parseInt(txId),
        transaction_date: document.getElementById('edit-tx-date').value,
        description: document.getElementById('edit-tx-description').value,
        reference_number: document.getElementById('edit-tx-reference').value,
        amount: Math.abs(parseFloat(document.getElementById('edit-tx-amount').value)),
        payee: document.getElementById('edit-tx-payee').value
    };

    console.log('Saving edit with data:', JSON.stringify(data));

    try {
        const result = await apiPost('/trust/transactions.php', data);
        console.log('Update result:', result);

        if (result.success) {
            showToast('Transaction updated successfully', 'success');
            closeLedgerEditModal();
            clearLedgerSelection();
            // Reload data
            await loadTrustLedgers();
            await loadAllClientTransactions();
            renderLedgerClientSidebar();
            renderClientLedger();
        } else {
            console.error('Update failed:', result);
            showToast(result.message || 'Failed to update transaction', 'error');
        }
    } catch (error) {
        console.error('Error updating transaction:', error);
        showToast('Error updating transaction', 'error');
    }
}

// =====================================================
// Delete Transactions
// =====================================================

async function deleteLedgerTransactions() {
    if (ledgerSelectedTxIds.size === 0) {
        showToast('Please select transactions to delete', 'warning');
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete ${ledgerSelectedTxIds.size} transaction(s)? This will update client balances.`);
    if (!confirmDelete) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const transactionIds = Array.from(ledgerSelectedTxIds);

    try {
        const result = await apiPost('/trust/transactions.php', {
            action: 'bulk_delete',
            user_id: userId,
            transaction_ids: transactionIds
        });

        if (result.success) {
            showToast(`Deleted ${result.data.deleted || transactionIds.length} transaction(s)`, 'success');
            clearLedgerSelection();
            // Reload data
            await loadTrustLedgers();
            await loadAllClientTransactions();
            renderLedgerClientSidebar();
            renderClientLedger();
        } else {
            showToast(result.message || 'Failed to delete transactions', 'error');
        }
    } catch (error) {
        console.error('Error deleting transactions:', error);
        showToast('Error deleting transactions', 'error');
    }
}

function updateAssignButtonVisibility() {
    let btn = document.getElementById('ledger-assign-btn');

    if (!btn) {
        // Create the button if it doesn't exist
        const header = document.querySelector('#page-client-ledger .page-header') ||
                       document.querySelector('#page-client-ledger > div > div:first-child');
        if (header) {
            btn = document.createElement('button');
            btn.id = 'ledger-assign-btn';
            btn.className = 'btn btn-primary';
            btn.style.cssText = 'display: none; margin-left: 12px; padding: 8px 16px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;';
            btn.innerHTML = 'Assign to Client (<span id="ledger-selected-count">0</span>)';
            btn.onclick = openAssignToClientModal;

            const addBtn = header.querySelector('button');
            if (addBtn) {
                addBtn.parentNode.insertBefore(btn, addBtn);
            } else {
                header.appendChild(btn);
            }
        }
    }

    if (btn) {
        const count = ledgerSelectedTxIds.size;
        btn.style.display = count > 0 ? 'inline-block' : 'none';
        const countEl = document.getElementById('ledger-selected-count');
        if (countEl) countEl.textContent = count;
    }
}

// Export new functions
window.toggleLedgerTxSelection = toggleLedgerTxSelection;
window.toggleSelectAllLedgerTx = toggleSelectAllLedgerTx;

// =====================================================
// Assign to Client Modal
// =====================================================

function openAssignToClientModal() {
    const selectedIds = Array.from(ledgerSelectedTxIds);
    if (selectedIds.length === 0) return;

    // Get selected transactions info
    const transactions = window._ledgerFilteredTransactions || [];
    const selectedTxs = transactions.filter(tx => selectedIds.includes(tx.id));

    // Calculate total amount
    const totalAmount = selectedTxs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

    // Get unique descriptions for auto-match suggestions
    const descriptions = [...new Set(selectedTxs.map(tx => tx.description || tx.payee || '').filter(d => d))];

    // Find potential matches from client names
    const clients = ioltaState.clients || [];
    const suggestedClients = findAutoMatchClients(descriptions, clients);

    // Create modal
    let modal = document.getElementById('assign-client-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'assign-client-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeAssignClientModal()">
            <div style="width: 600px; max-width: 95%; max-height: 90vh; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;" onclick="event.stopPropagation()">
                <!-- Header -->
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">👤</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Assign to Client</h3>
                                <p style="margin: 2px 0 0; font-size: 13px; opacity: 0.9;">${selectedIds.length} transaction${selectedIds.length > 1 ? 's' : ''} selected</p>
                            </div>
                        </div>
                        <button onclick="closeAssignClientModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>

                <!-- Summary -->
                <div style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <div style="display: flex; gap: 24px;">
                        <div>
                            <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Total Amount</div>
                            <div style="font-size: 20px; font-weight: 700; color: ${totalAmount >= 0 ? '#10b981' : '#ef4444'};">${formatCurrency(Math.abs(totalAmount))}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Transactions</div>
                            <div style="font-size: 20px; font-weight: 700; color: #1e293b;">${selectedIds.length}</div>
                        </div>
                    </div>
                </div>

                <!-- Auto-match suggestions -->
                ${suggestedClients.length > 0 ? `
                <div style="padding: 16px 24px; background: #fefce8; border-bottom: 1px solid #fef08a;">
                    <div style="font-size: 12px; font-weight: 600; color: #854d0e; margin-bottom: 8px;">💡 Suggested Matches</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${suggestedClients.slice(0, 5).map(client => `
                            <button onclick="selectAssignClient(${client.id}, '${escapeHtml(client.client_name)}')"
                                    style="padding: 6px 12px; background: white; border: 1px solid #fbbf24; border-radius: 6px; font-size: 12px; color: #92400e; cursor: pointer; font-weight: 500;">
                                ${escapeHtml(client.client_name)} ${client.matter_number ? '(' + client.matter_number + ')' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Search -->
                <div style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0;">
                    <input type="text" id="assign-client-search" placeholder="Search clients by name or case #..."
                           oninput="filterAssignClientList(this.value)"
                           style="width: 100%; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>

                <!-- Client List -->
                <div id="assign-client-list" style="flex: 1; overflow-y: auto; max-height: 300px;">
                    ${renderAssignClientList(clients, '')}
                </div>

                <!-- Footer -->
                <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
                    <div id="assign-selected-client" style="font-size: 14px; color: #64748b;">No client selected</div>
                    <div style="display: flex; gap: 12px;">
                        <button onclick="closeAssignClientModal()" style="padding: 10px 20px; background: white; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                        <button id="assign-confirm-btn" onclick="confirmAssignToClient()" disabled
                                style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; opacity: 0.5;">
                            Assign
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Focus search input
    setTimeout(() => {
        const searchInput = document.getElementById('assign-client-search');
        if (searchInput) searchInput.focus();
    }, 100);
}

let assignSelectedClientId = null;

function renderAssignClientList(clients, searchTerm) {
    const filtered = searchTerm
        ? clients.filter(c =>
            c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.matter_number && c.matter_number.toLowerCase().includes(searchTerm.toLowerCase()))
          )
        : clients;

    if (filtered.length === 0) {
        return `
            <div style="padding: 40px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                <div style="font-size: 14px;">No clients found</div>
            </div>
        `;
    }

    return filtered.slice(0, 100).map(client => {
        const ledgers = ioltaState.ledgers || [];
        const clientLedgers = ledgers.filter(l => l.client_id == client.id);
        let balance = clientLedgers.reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);
        const isGeneral = client.client_name === 'General/Unassigned';

        // Add staging unassigned total to General/Unassigned
        if (isGeneral) {
            balance += (ioltaState.stagingUnassignedTotal || 0);
        }

        return `
            <div class="assign-client-item" data-client-id="${client.id}"
                 onclick="selectAssignClient(${client.id}, '${escapeHtml(client.client_name).replace(/'/g, "\\'")}')"
                 style="padding: 12px 24px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=this.classList.contains('selected') ? '#eff6ff' : 'white'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: ${isGeneral ? '#fef3c7' : '#dbeafe'}; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; color: ${isGeneral ? '#92400e' : '#1d4ed8'};">
                        ${client.client_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b;">${escapeHtml(client.client_name)}</div>
                        ${client.matter_number ? `<div style="font-size: 12px; color: #64748b;">Case #${escapeHtml(client.matter_number)}</div>` : ''}
                    </div>
                </div>
                <div style="font-size: 14px; font-weight: 600; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                    ${formatCurrency(balance)}
                </div>
            </div>
        `;
    }).join('');
}

function filterAssignClientList(searchTerm) {
    const clients = ioltaState.clients || [];
    const container = document.getElementById('assign-client-list');
    if (container) {
        container.innerHTML = renderAssignClientList(clients, searchTerm);

        // Re-select if previously selected
        if (assignSelectedClientId) {
            const item = container.querySelector(`.assign-client-item[data-client-id="${assignSelectedClientId}"]`);
            if (item) {
                item.classList.add('selected');
                item.style.background = '#eff6ff';
            }
        }
    }
}

function selectAssignClient(clientId, clientName) {
    assignSelectedClientId = clientId;

    // Update UI
    document.querySelectorAll('.assign-client-item').forEach(item => {
        item.classList.remove('selected');
        item.style.background = 'white';
    });

    const selectedItem = document.querySelector(`.assign-client-item[data-client-id="${clientId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.style.background = '#eff6ff';
    }

    // Update footer
    const selectedEl = document.getElementById('assign-selected-client');
    if (selectedEl) {
        selectedEl.innerHTML = `<span style="color: #1e293b; font-weight: 500;">Selected: ${escapeHtml(clientName)}</span>`;
    }

    // Enable confirm button
    const confirmBtn = document.getElementById('assign-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    }
}

function findAutoMatchClients(descriptions, clients) {
    const matches = [];

    descriptions.forEach(desc => {
        const descLower = desc.toLowerCase();
        clients.forEach(client => {
            // Check if client name or case number appears in description
            const nameParts = client.client_name.toLowerCase().split(/[,\s]+/);
            const hasNameMatch = nameParts.some(part => part.length > 2 && descLower.includes(part));
            const hasCaseMatch = client.matter_number && descLower.includes(client.matter_number.toLowerCase());

            if ((hasNameMatch || hasCaseMatch) && !matches.find(m => m.id === client.id)) {
                matches.push(client);
            }
        });
    });

    return matches;
}

async function confirmAssignToClient() {
    if (!assignSelectedClientId) return;

    const selectedIds = Array.from(ledgerSelectedTxIds);
    if (selectedIds.length === 0) return;

    const confirmBtn = document.getElementById('assign-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Assigning...';
    }

    try {
        const userId = state.currentUser || localStorage.getItem('currentUser');

        const response = await fetch(API_BASE + '/trust/transactions.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reassign',
                transaction_ids: selectedIds,
                target_client_id: assignSelectedClientId,
                user_id: userId
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`${selectedIds.length} transaction(s) assigned successfully`, 'success');
            closeAssignClientModal();

            // Clear selection and reload
            ledgerSelectedTxIds.clear();
            await loadAllClientTransactions();
            await loadTrustLedgers();
            renderClientLedger();
        } else {
            showToast(result.message || 'Failed to assign transactions', 'error');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Assign';
            }
        }
    } catch (error) {
        console.error('Error assigning transactions:', error);
        showToast('Error assigning transactions', 'error');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Assign';
        }
    }
}

function closeAssignClientModal() {
    const modal = document.getElementById('assign-client-modal');
    if (modal) modal.remove();
    assignSelectedClientId = null;
}

// Export modal functions
window.openAssignToClientModal = openAssignToClientModal;
window.closeAssignClientModal = closeAssignClientModal;
window.filterAssignClientList = filterAssignClientList;
window.selectAssignClient = selectAssignClient;
window.confirmAssignToClient = confirmAssignToClient;

window.loadClientLedgerPage = loadClientLedgerPage;
window.filterLedgerByClient = filterLedgerByClient;
window.filterLedgerClientList = filterLedgerClientList;
window.selectLedgerClientFromSidebar = selectLedgerClientFromSidebar;
window.searchLedgerClients = searchLedgerClients;
window.showLedgerClientDropdown = showLedgerClientDropdown;
window.selectLedgerClient = selectLedgerClient;
window.clearLedgerFilter = clearLedgerFilter;
window.toggleLedgerTxSelection = toggleLedgerTxSelection;
window.toggleSelectAllLedgerTx = toggleSelectAllLedgerTx;
window.clearLedgerSelection = clearLedgerSelection;
window.openLedgerMoveModal = openLedgerMoveModal;
window.closeLedgerMoveModal = closeLedgerMoveModal;
window.filterMoveClientList = filterMoveClientList;
window.selectMoveClient = selectMoveClient;
window.openLedgerEditModal = openLedgerEditModal;
window.closeLedgerEditModal = closeLedgerEditModal;
window.saveLedgerEdit = saveLedgerEdit;
window.deleteLedgerTransactions = deleteLedgerTransactions;

// =====================================================
// Transaction Detail Modal
// =====================================================

function showTrustTransactionDetail(index) {
    const transactions = window._trustTransactionsCache || [];
    const tx = transactions[index];
    if (!tx) return;

    const isPositive = parseFloat(tx.amount) > 0;
    const typeLabel = getTransactionTypeLabel(tx.transaction_type);
    const typeBadgeColor = getTransactionBadgeColor(tx.transaction_type);

    // Create modal if it doesn't exist
    let modal = document.getElementById('trust-tx-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'trust-tx-detail-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="closeTrustTransactionDetail(event)">
            <div style="width: 500px; max-width: 95%; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">📋</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Transaction Detail</h3>
                                <p style="margin: 2px 0 0; font-size: 13px; opacity: 0.9;">${formatDate(tx.transaction_date)}</p>
                            </div>
                        </div>
                        <button onclick="closeTrustTransactionDetail()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="padding: 24px;">
                    <!-- Type Badge -->
                    <div style="margin-bottom: 20px; text-align: center;">
                        <span style="display: inline-block; padding: 8px 20px; border-radius: 24px; font-size: 14px; font-weight: 600; background: ${typeBadgeColor.bg}; color: ${typeBadgeColor.text};">
                            ${typeLabel}
                        </span>
                    </div>

                    <!-- Amount -->
                    <div style="text-align: center; margin-bottom: 24px; padding: 20px; background: ${isPositive ? '#ecfdf5' : '#fef2f2'}; border-radius: 12px;">
                        <div style="font-size: 32px; font-weight: 700; color: ${isPositive ? '#059669' : '#dc2626'};">
                            ${isPositive ? '+' : ''}${formatCurrency(tx.amount)}
                        </div>
                        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                            Balance after: ${formatCurrency(tx.running_balance)}
                        </div>
                    </div>

                    <!-- Details Grid -->
                    <div style="display: grid; gap: 16px;">
                        ${tx.check_number ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Check Number</span>
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">#${tx.check_number}</span>
                        </div>
                        ` : ''}

                        ${tx.payee ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Payee</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.payee)}</span>
                        </div>
                        ` : ''}

                        ${tx.received_from ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Received From</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.received_from)}</span>
                        </div>
                        ` : ''}

                        ${tx.client_name ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Client</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.client_name)}</span>
                        </div>
                        ` : ''}

                        ${tx.matter_number ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Case #</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.matter_number)}</span>
                        </div>
                        ` : ''}

                        ${tx.reference_number ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Check #</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.reference_number)}</span>
                        </div>
                        ` : ''}

                        ${tx.entity_name ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Entity</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.entity_display_name || tx.entity_name)}</span>
                        </div>
                        ` : ''}

                        ${tx.category_name ? `
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: #64748b; font-size: 13px;">Category</span>
                            <span style="color: #1e293b; font-weight: 500; font-size: 14px;">${escapeHtml(tx.category_name)}</span>
                        </div>
                        ` : ''}

                        <div style="padding: 12px 0;">
                            <div style="color: #64748b; font-size: 13px; margin-bottom: 6px;">Description</div>
                            <div style="color: #1e293b; font-size: 14px; line-height: 1.5;">${escapeHtml(tx.description || '-')}</div>
                        </div>

                        ${tx.memo ? `
                        <div style="padding: 12px 0; border-top: 1px solid #f1f5f9;">
                            <div style="color: #64748b; font-size: 13px; margin-bottom: 6px;">Memo</div>
                            <div style="color: #1e293b; font-size: 14px; line-height: 1.5;">${escapeHtml(tx.memo)}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                    <button onclick="closeTrustTransactionDetail()" style="padding: 10px 24px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

function closeTrustTransactionDetail(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('trust-tx-detail-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

window.showTrustTransactionDetail = showTrustTransactionDetail;
window.closeTrustTransactionDetail = closeTrustTransactionDetail;

// ============================================
// Bank Statement Import Functions
// ============================================

// State for bank statement import
let bankStatementImportState = {
    bankTransactions: [],
    matchResults: [],
    selectedMatches: new Set(),
    accountId: null
};

/**
 * Open bank statement import modal
 */
function openBankStatementImportModal() {
    const modal = document.getElementById('bank-statement-import-modal');
    if (modal) {
        modal.style.display = 'flex';
        resetBankStatementImport();

        // Get selected account from reconcile page
        const accountSelect = document.getElementById('trust-recon-account');
        if (accountSelect && accountSelect.value) {
            bankStatementImportState.accountId = parseInt(accountSelect.value);
        }
    }
}

/**
 * Close bank statement import modal
 */
function closeBankStatementImportModal() {
    const modal = document.getElementById('bank-statement-import-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Reset import to initial state
 */
function resetBankStatementImport() {
    bankStatementImportState = {
        bankTransactions: [],
        matchResults: [],
        selectedMatches: new Set(),
        accountId: bankStatementImportState.accountId
    };

    // Reset file input
    const fileInput = document.getElementById('bank-statement-file');
    if (fileInput) fileInput.value = '';

    // Show upload step, hide preview
    document.getElementById('import-step-upload').style.display = 'block';
    document.getElementById('import-step-preview').style.display = 'none';
}

/**
 * Handle file selection for bank statement
 */
async function handleBankStatementFile(input) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('Please select a CSV file', 'error');
        return;
    }

    try {
        const content = await file.text();
        const transactions = parseChaseCsv(content);

        if (transactions.length === 0) {
            showToast('No transactions found in CSV', 'error');
            return;
        }

        bankStatementImportState.bankTransactions = transactions;

        // Update UI
        document.getElementById('import-file-name').textContent = file.name;
        document.getElementById('import-tx-count').textContent = transactions.length;

        // Match with existing transactions
        await matchBankTransactions();

        // Show preview step
        document.getElementById('import-step-upload').style.display = 'none';
        document.getElementById('import-step-preview').style.display = 'flex';

        showToast(`Loaded ${transactions.length} transactions from CSV`, 'success');

    } catch (error) {
        console.error('Error parsing CSV:', error);
        showToast('Error parsing CSV file: ' + error.message, 'error');
    }
}

/**
 * Parse Chase bank CSV format
 * Chase CSV columns: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
 */
function parseChaseCsv(content) {
    const lines = content.split('\n');
    const transactions = [];

    // Find header row
    let headerIndex = -1;
    let headers = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line properly (handle quoted fields)
        const fields = parseCsvLine(line);

        // Check if this looks like a header row
        const lowerFields = fields.map(f => f.toLowerCase());
        if (lowerFields.includes('date') || lowerFields.includes('posting date') ||
            lowerFields.includes('amount') || lowerFields.includes('description')) {
            headerIndex = i;
            headers = fields.map(h => h.toLowerCase().trim());
            break;
        }
    }

    if (headerIndex === -1) {
        throw new Error('Could not find header row in CSV');
    }

    // Find column indices
    const dateCol = headers.findIndex(h => h.includes('date'));
    const descCol = headers.findIndex(h => h.includes('description'));
    const amountCol = headers.findIndex(h => h === 'amount');
    const checkCol = headers.findIndex(h => h.includes('check') || h.includes('slip'));
    const typeCol = headers.findIndex(h => h === 'type');
    const balanceCol = headers.findIndex(h => h.includes('balance'));

    // Parse data rows
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCsvLine(line);
        if (fields.length < 3) continue;

        const dateStr = fields[dateCol] || '';
        const description = fields[descCol] || '';
        const amountStr = fields[amountCol] || '0';
        const checkNumber = checkCol >= 0 ? (fields[checkCol] || '').trim() : '';
        const txType = typeCol >= 0 ? (fields[typeCol] || '').toLowerCase() : '';

        // Parse date (MM/DD/YYYY format)
        let date = null;
        if (dateStr) {
            const dateParts = dateStr.split('/');
            if (dateParts.length === 3) {
                date = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
            }
        }

        // Parse amount (remove $ and commas, handle negative)
        let amount = parseFloat(amountStr.replace(/[$,]/g, '')) || 0;

        if (!date || amount === 0) continue;

        transactions.push({
            date,
            description: description.trim(),
            amount,
            checkNumber: checkNumber.replace(/[^0-9]/g, ''), // Extract only numbers
            type: amount > 0 ? 'deposit' : 'withdrawal',
            rawType: txType
        });
    }

    return transactions;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCsvLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    fields.push(current.trim());
    return fields;
}

/**
 * Match bank transactions with existing trust transactions
 */
async function matchBankTransactions() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const accountId = bankStatementImportState.accountId;

    // Fetch uncleared trust transactions
    let url = `${API_BASE}/trust/transactions.php?user_id=${userId}`;
    if (accountId) {
        url += `&account_id=${accountId}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
        showToast('Error loading transactions: ' + result.message, 'error');
        return;
    }

    const bookTransactions = result.data.transactions || [];
    const matchResults = [];

    // Clear selected matches
    bankStatementImportState.selectedMatches.clear();

    // Match each bank transaction
    for (const bankTx of bankStatementImportState.bankTransactions) {
        let matchStatus = 'missing'; // not found in book
        let matchedTx = null;
        let matchConfidence = 0;

        // For checks: match by check_number + amount
        if (bankTx.checkNumber && bankTx.amount < 0) {
            const checkMatch = bookTransactions.find(bt => {
                const btCheckNum = (bt.check_number || '').replace(/[^0-9]/g, '');
                const btAmount = parseFloat(bt.amount);
                return btCheckNum === bankTx.checkNumber &&
                       Math.abs(btAmount - bankTx.amount) < 0.01;
            });

            if (checkMatch) {
                matchedTx = checkMatch;
                matchConfidence = 100;

                if (checkMatch.status === 'cleared') {
                    matchStatus = 'already';
                } else {
                    matchStatus = 'matched';
                    // Auto-select matched items
                    bankStatementImportState.selectedMatches.add(matchResults.length);
                }
            }
        }

        // For deposits and other transactions: match by amount + date (within 3 days)
        if (!matchedTx) {
            const amountMatch = bookTransactions.find(bt => {
                const btAmount = parseFloat(bt.amount);
                if (Math.abs(btAmount - bankTx.amount) > 0.01) return false;

                // Check date within 3 days
                const bankDate = new Date(bankTx.date);
                const bookDate = new Date(bt.transaction_date);
                const dayDiff = Math.abs((bankDate - bookDate) / (1000 * 60 * 60 * 24));

                return dayDiff <= 3;
            });

            if (amountMatch) {
                matchedTx = amountMatch;
                matchConfidence = 80;

                if (amountMatch.status === 'cleared') {
                    matchStatus = 'already';
                } else {
                    matchStatus = 'matched';
                    bankStatementImportState.selectedMatches.add(matchResults.length);
                }
            }
        }

        matchResults.push({
            bankTx,
            matchedTx,
            matchStatus,
            matchConfidence
        });
    }

    bankStatementImportState.matchResults = matchResults;

    // Render results
    renderMatchResults();
}

/**
 * Render match results in the table
 */
function renderMatchResults() {
    const tbody = document.getElementById('import-match-tbody');
    const results = bankStatementImportState.matchResults;

    // Count by status
    let matched = 0, pending = 0, missing = 0, already = 0;

    let html = '';

    results.forEach((result, index) => {
        const { bankTx, matchedTx, matchStatus, matchConfidence } = result;
        const isSelected = bankStatementImportState.selectedMatches.has(index);
        const canSelect = matchStatus === 'matched';

        // Count
        if (matchStatus === 'matched') matched++;
        else if (matchStatus === 'already') already++;
        else if (matchStatus === 'missing') missing++;

        // Status badge
        let statusBadge = '';
        switch (matchStatus) {
            case 'matched':
                statusBadge = `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">Matched</span>`;
                break;
            case 'already':
                statusBadge = `<span style="background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">Already Cleared</span>`;
                break;
            case 'missing':
                statusBadge = `<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">Not in Book</span>`;
                break;
        }

        // Matched transaction info
        let matchedInfo = '-';
        if (matchedTx) {
            const clientName = matchedTx.client_name || 'Unknown';
            const checkNum = matchedTx.check_number ? `#${matchedTx.check_number}` : '';
            matchedInfo = `
                <div style="font-weight: 500; color: #1e293b;">${escapeHtml(clientName)} ${checkNum}</div>
                <div style="font-size: 12px; color: #64748b;">${escapeHtml(matchedTx.description || '')}</div>
            `;
        }

        // Amount formatting
        const amountColor = bankTx.amount < 0 ? '#dc2626' : '#059669';
        const amountFormatted = bankTx.amount < 0
            ? `-$${Math.abs(bankTx.amount).toFixed(2)}`
            : `+$${bankTx.amount.toFixed(2)}`;

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 16px;">
                    ${canSelect ? `<input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleImportMatchSelection(${index})" style="margin-right: 10px;">` : '<span style="display: inline-block; width: 26px;"></span>'}
                    <div style="display: inline-block; vertical-align: top;">
                        <div style="font-weight: 500; color: #1e293b;">${bankTx.date}</div>
                        <div style="font-size: 12px; color: #64748b; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(bankTx.description)}
                            ${bankTx.checkNumber ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Check #${bankTx.checkNumber}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding: 12px 16px; text-align: center;">${statusBadge}</td>
                <td style="padding: 12px 16px;">${matchedInfo}</td>
                <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: ${amountColor};">${amountFormatted}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html || '<tr><td colspan="4" style="padding: 40px; text-align: center; color: #94a3b8;">No transactions to display</td></tr>';

    // Update counts
    document.getElementById('match-count-matched').textContent = matched;
    document.getElementById('match-count-pending').textContent = pending;
    document.getElementById('match-count-missing').textContent = missing;
    document.getElementById('match-count-already').textContent = already;

    // Update selected count
    updateImportSelectedCount();
}

/**
 * Toggle selection of a match result
 */
function toggleImportMatchSelection(index) {
    if (bankStatementImportState.selectedMatches.has(index)) {
        bankStatementImportState.selectedMatches.delete(index);
    } else {
        bankStatementImportState.selectedMatches.add(index);
    }
    updateImportSelectedCount();
}

/**
 * Toggle select all import matches
 */
function toggleSelectAllImportMatches(checkbox) {
    const results = bankStatementImportState.matchResults;

    if (checkbox.checked) {
        results.forEach((result, index) => {
            if (result.matchStatus === 'matched') {
                bankStatementImportState.selectedMatches.add(index);
            }
        });
    } else {
        bankStatementImportState.selectedMatches.clear();
    }

    renderMatchResults();
}

/**
 * Update selected count display
 */
function updateImportSelectedCount() {
    const count = bankStatementImportState.selectedMatches.size;
    document.getElementById('import-selected-count').textContent = count;

    // Update select all checkbox
    const selectAll = document.getElementById('import-select-all');
    const matchedCount = bankStatementImportState.matchResults.filter(r => r.matchStatus === 'matched').length;
    if (selectAll) {
        selectAll.checked = matchedCount > 0 && count === matchedCount;
        selectAll.indeterminate = count > 0 && count < matchedCount;
    }
}

/**
 * Confirm selected matches and clear transactions
 */
async function confirmBankStatementMatches() {
    const selectedIndices = Array.from(bankStatementImportState.selectedMatches);

    if (selectedIndices.length === 0) {
        showToast('No transactions selected', 'warning');
        return;
    }

    const confirmed = confirm(`Mark ${selectedIndices.length} transaction(s) as cleared?\n\nThis will update their status to "Cleared" and set the cleared date to today.`);
    if (!confirmed) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    for (const index of selectedIndices) {
        const result = bankStatementImportState.matchResults[index];
        if (!result.matchedTx) continue;

        try {
            const response = await fetch(`${API_BASE}/trust/transactions.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: result.matchedTx.id,
                    user_id: userId,
                    status: 'cleared',
                    cleared_date: new Date().toISOString().split('T')[0]
                })
            });

            const updateResult = await response.json();
            if (updateResult.success) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error('Error updating transaction:', error);
            errorCount++;
        }
    }

    if (successCount > 0) {
        showToast(`${successCount} transaction(s) marked as cleared`, 'success');
    }
    if (errorCount > 0) {
        showToast(`${errorCount} transaction(s) failed to update`, 'error');
    }

    // Close modal and refresh
    closeBankStatementImportModal();

    // Refresh the reconciliation page if on it
    if (typeof loadTrustReconData === 'function') {
        loadTrustReconData();
    }
}

// Export bank statement import functions
window.openBankStatementImportModal = openBankStatementImportModal;
window.closeBankStatementImportModal = closeBankStatementImportModal;
window.resetBankStatementImport = resetBankStatementImport;
window.handleBankStatementFile = handleBankStatementFile;
window.toggleImportMatchSelection = toggleImportMatchSelection;
window.toggleSelectAllImportMatches = toggleSelectAllImportMatches;
window.confirmBankStatementMatches = confirmBankStatementMatches;

// =====================================================
// Uncleared Deposits Modal
// =====================================================

// Track selected uncleared deposits
let selectedUnclearedDeposits = new Set();

// Open uncleared deposits modal
async function openUnclearedDepositsModal() {
    const modal = document.getElementById('uncleared-deposits-modal');
    if (modal) {
        modal.style.display = 'flex';
        selectedUnclearedDeposits.clear();
        updateUnclearedDepositsSelection();
        await loadUnclearedDepositsList();
    }
}

// Close uncleared deposits modal
function closeUnclearedDepositsModal() {
    const modal = document.getElementById('uncleared-deposits-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load uncleared deposits from API
async function loadUnclearedDepositsList() {
    const container = document.getElementById('uncleared-deposits-list');
    if (!container) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Get deposits that are not cleared - deposits have transaction_type = 'deposit'
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            type: 'deposit',
            all: 1
        });

        // Filter to only uncleared deposits (status != 'cleared')
        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];
        const unclearedDeposits = allTransactions.filter(t => t.status !== 'cleared');

        // Update the count in header button
        updateUnclearedDepositsCount(unclearedDeposits.length);

        if (unclearedDeposits.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                    <p style="font-size: 15px; margin: 0;">No uncleared deposits</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">All deposits have been cleared by the bank</p>
                </div>
            `;
            return;
        }

        // Build table
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 12px 8px; text-align: left; width: 40px;"></th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Description</th>
                        <th style="padding: 12px 8px; text-align: left;">Received From</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        unclearedDeposits.forEach(deposit => {
            const date = new Date(deposit.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;"
                    onmouseover="this.style.background='#e0f2fe'"
                    onmouseout="this.style.background=this.querySelector('.uncleared-deposit-checkbox').checked ? '#bae6fd' : 'transparent'">
                    <td style="padding: 12px 8px;">
                        <input type="checkbox" class="uncleared-deposit-checkbox"
                               data-deposit-id="${deposit.id}"
                               onclick="toggleUnclearedDepositSelection(${deposit.id})"
                               style="width: 16px; height: 16px; cursor: pointer;">
                    </td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px; font-weight: 500;">${deposit.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${deposit.description || '-'}</td>
                    <td style="padding: 12px 8px;">${deposit.received_from || deposit.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #059669;">+${formatCurrency(Math.abs(deposit.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading uncleared deposits:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #dc2626; padding: 40px;">
                Error loading uncleared deposits
            </div>
        `;
    }
}

// Update uncleared deposits count in header button
function updateUnclearedDepositsCount(count) {
    const countEl = document.getElementById('uncleared-deposits-count');
    if (countEl) {
        countEl.textContent = count;
    }
}

// Toggle individual deposit selection
function toggleUnclearedDepositSelection(depositId) {
    if (selectedUnclearedDeposits.has(depositId)) {
        selectedUnclearedDeposits.delete(depositId);
    } else {
        selectedUnclearedDeposits.add(depositId);
    }
    updateUnclearedDepositsSelection();
}

// Toggle select all uncleared deposits
function toggleSelectAllUnclearedDeposits(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.uncleared-deposit-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const depositId = parseInt(cb.dataset.depositId);
        if (masterCheckbox.checked) {
            selectedUnclearedDeposits.add(depositId);
        } else {
            selectedUnclearedDeposits.delete(depositId);
        }
        // Update row background
        const row = cb.closest('tr');
        if (row) {
            row.style.background = cb.checked ? '#bae6fd' : 'transparent';
        }
    });
    updateUnclearedDepositsSelection();
}

// Update selection UI
function updateUnclearedDepositsSelection() {
    const count = selectedUnclearedDeposits.size;
    const countEl = document.getElementById('uncleared-deposits-selected-count');
    const markBtn = document.getElementById('mark-cleared-btn');

    if (countEl) {
        countEl.textContent = `(${count} selected)`;
    }
    if (markBtn) {
        markBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// Mark selected deposits as cleared
async function markSelectedDepositsCleared() {
    if (selectedUnclearedDeposits.size === 0) {
        showToast('No deposits selected', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    for (const depositId of selectedUnclearedDeposits) {
        try {
            const result = await apiPut('/trust/transactions.php', {
                id: depositId,
                user_id: userId,
                status: 'cleared',
                cleared_date: new Date().toISOString().split('T')[0]
            });
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error('Error marking deposit cleared:', error);
            errorCount++;
        }
    }

    if (successCount > 0) {
        showToast(`${successCount} deposit(s) marked as cleared`, 'success');
    }
    if (errorCount > 0) {
        showToast(`${errorCount} deposit(s) failed to update`, 'error');
    }

    // Clear selection and reload
    selectedUnclearedDeposits.clear();
    document.getElementById('uncleared-deposits-select-all').checked = false;
    updateUnclearedDepositsSelection();
    await loadUnclearedDepositsList();

    // Refresh receive tab if visible
    if (typeof renderDepositClientSidebar === 'function') {
        renderDepositClientSidebar();
    }
}

// Export uncleared deposits functions
window.openUnclearedDepositsModal = openUnclearedDepositsModal;
window.closeUnclearedDepositsModal = closeUnclearedDepositsModal;
window.loadUnclearedDepositsList = loadUnclearedDepositsList;
window.toggleUnclearedDepositSelection = toggleUnclearedDepositSelection;
window.toggleSelectAllUnclearedDeposits = toggleSelectAllUnclearedDeposits;
window.markSelectedDepositsCleared = markSelectedDepositsCleared;
window.loadUnclearedDepositsCount = loadUnclearedDepositsCount;

// =====================================================
// STAGING WORKFLOW (CSV Import → Assign → Post)
// =====================================================

// Staging state
let stagingState = {
    records: [],
    summary: {},
    currentTab: 'unassigned',
    selectedIds: new Set(),
    lastClickedId: null
};

/**
 * Load staging page data
 */
async function loadStagingPage() {
    await loadIOLTAData();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Load staging records from API
 */
async function loadStagingRecords(status = null) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const params = { user_id: userId };
    if (status) params.status = status;

    const data = await apiGet('/trust/staging.php', params);

    if (data.success) {
        stagingState.records = data.data.staging || [];
        stagingState.summary = data.data.summary || {};
    }

    return stagingState.records;
}

/**
 * Render staging page with tabs
 */
function renderStagingPage() {
    const container = document.getElementById('staging-content');
    if (!container) return;

    const summary = stagingState.summary;
    const unassignedCount = summary.unassigned?.count || 0;
    const assignedCount = summary.assigned?.count || 0;
    const postedCount = summary.posted?.count || 0;

    container.innerHTML = `
        <div style="padding: 24px;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 600;">Transaction Staging</h2>
                <button onclick="console.log('Import clicked'); openStagingImportModal();" class="btn btn-primary" style="cursor: pointer; z-index: 100;">
                    Import CSV
                </button>
            </div>

            <!-- Tabs -->
            <div style="display: flex; gap: 4px; margin-bottom: 20px; background: #f1f5f9; padding: 4px; border-radius: 8px; width: fit-content;">
                <button class="staging-tab ${stagingState.currentTab === 'unassigned' ? 'active' : ''}"
                        onclick="switchStagingTab('unassigned')">
                    Unassigned <span class="badge">${unassignedCount}</span>
                </button>
                <button class="staging-tab ${stagingState.currentTab === 'assigned' ? 'active' : ''}"
                        onclick="switchStagingTab('assigned')">
                    Assigned <span class="badge">${assignedCount}</span>
                </button>
                <button class="staging-tab ${stagingState.currentTab === 'posted' ? 'active' : ''}"
                        onclick="switchStagingTab('posted')">
                    Posted <span class="badge">${postedCount}</span>
                </button>
            </div>

            <!-- Actions bar - always visible for unassigned/assigned tabs -->
            <div id="staging-actions" style="margin-bottom: 16px; display: flex; gap: 12px;">
                ${stagingState.currentTab === 'unassigned' ? `
                    <button id="btn-bulk-assign" onclick="openBulkAssignModal()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Assign Selected to Client (<span id="selected-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-delete" onclick="deleteSelectedStaging()" class="btn btn-danger" style="padding: 10px 20px; font-size: 14px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Delete Selected (<span id="delete-count">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
                ${stagingState.currentTab === 'assigned' ? `
                    <button id="btn-bulk-post" onclick="postSelectedStaging()" class="btn btn-primary" style="padding: 10px 20px; font-size: 14px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Post Selected (<span id="selected-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-match" onclick="openMatchModal()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Match to Existing (<span id="match-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-unassign" onclick="unassignSelectedStaging()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unassign (<span id="unassign-count">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
                ${stagingState.currentTab === 'posted' ? `
                    <button id="btn-bulk-unpost-assigned" onclick="unpostSelectedStaging('assigned')" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unpost to Assigned (<span id="unpost-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-unpost-unassigned" onclick="unpostSelectedStaging('unassigned')" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unpost to Unassigned (<span id="unpost-count2">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
            </div>

            <!-- Transactions list -->
            <div id="staging-list">
                ${renderStagingList()}
            </div>
        </div>
    `;

    updateStagingActionsVisibility();
}

/**
 * Render staging transactions list
 */
function renderStagingList() {
    const records = stagingState.records.filter(r => r.status === stagingState.currentTab);

    if (records.length === 0) {
        return `
            <div style="padding: 48px; text-align: center; color: #94a3b8;">
                <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                <div style="font-size: 16px; font-weight: 500; color: #64748b;">No ${stagingState.currentTab} transactions</div>
                ${stagingState.currentTab === 'unassigned' ? `
                    <div style="font-size: 14px; margin-top: 8px;">Import a CSV file to get started</div>
                ` : ''}
            </div>
        `;
    }

    let html = `
        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
            <!-- Header -->
            <div style="display: grid; grid-template-columns: 40px 100px 80px 1fr 150px 120px 100px; gap: 12px; padding: 12px 16px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">
                <div><input type="checkbox" id="staging-select-all" onchange="toggleSelectAllStaging(this.checked)"></div>
                <div>Date</div>
                <div>Check #</div>
                <div>Description</div>
                <div>Client</div>
                <div style="text-align: right;">Amount</div>
                <div>Status</div>
            </div>

            <!-- Rows -->
            ${records.map(r => renderStagingRow(r)).join('')}
        </div>
    `;

    return html;
}

/**
 * Render single staging row
 */
function renderStagingRow(record) {
    const amount = parseFloat(record.amount);
    const isPositive = amount > 0;
    const isSelected = stagingState.selectedIds.has(record.id);

    const statusColors = {
        unassigned: { bg: '#fef3c7', text: '#d97706' },
        assigned: { bg: '#dbeafe', text: '#2563eb' },
        posted: { bg: '#dcfce7', text: '#16a34a' },
        rejected: { bg: '#fee2e2', text: '#dc2626' }
    };
    const statusStyle = statusColors[record.status] || statusColors.unassigned;

    // Extract check number from reference_number or description
    let checkNum = record.reference_number || '';
    // If no reference_number, try to extract from description (e.g., "CHECK 11822")
    if (!checkNum && record.description) {
        const match = record.description.match(/CHECK\s*#?\s*(\d+)/i);
        if (match) {
            checkNum = match[1];
        }
    }

    return `
        <div class="staging-row ${isSelected ? 'selected' : ''}" data-id="${record.id}"
             style="display: grid; grid-template-columns: 40px 100px 80px 1fr 150px 120px 100px; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; cursor: pointer; ${isSelected ? 'background: #eff6ff;' : ''}"
             onclick="toggleStagingSelection(${record.id}, event)">
            <div>
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleStagingSelection(${record.id}, event)">
            </div>
            <div style="font-size: 13px; color: #64748b;">${formatDate(record.transaction_date)}</div>
            <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(checkNum || '-')}</div>
            <div style="font-size: 13px; color: #1e293b;">${escapeHtml(record.description || '-')}</div>
            <div style="font-size: 13px; color: ${record.client_name ? '#1e293b' : '#94a3b8'};">
                ${record.client_name ? escapeHtml(record.client_name) : '(Not assigned)'}
            </div>
            <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'};">
                ${isPositive ? '+' : ''}${formatCurrency(amount)}
            </div>
            <div>
                <span style="padding: 2px 8px; font-size: 11px; font-weight: 500; border-radius: 4px; background: ${statusStyle.bg}; color: ${statusStyle.text};">
                    ${record.status}
                </span>
            </div>
        </div>
    `;
}

/**
 * Switch staging tab
 */
async function switchStagingTab(tab) {
    stagingState.currentTab = tab;
    stagingState.selectedIds.clear();
    stagingState.lastClickedId = null;
    await loadStagingRecords(tab);
    renderStagingPage();
}

/**
 * Toggle staging selection with shift+click range selection support
 */
function toggleStagingSelection(id, event) {
    if (event) event.stopPropagation();

    // Ensure id is a number for consistent comparison
    const numId = parseInt(id);
    console.log('toggleStagingSelection:', numId, 'current size:', stagingState.selectedIds.size);

    // Shift+click range selection
    if (event && event.shiftKey && stagingState.lastClickedId !== null) {
        const records = stagingState.records.filter(r => r.status === stagingState.currentTab);
        const recordIds = records.map(r => parseInt(r.id));

        const startIdx = recordIds.indexOf(stagingState.lastClickedId);
        const endIdx = recordIds.indexOf(numId);

        if (startIdx !== -1 && endIdx !== -1) {
            const minIdx = Math.min(startIdx, endIdx);
            const maxIdx = Math.max(startIdx, endIdx);

            // Select all items in range
            for (let i = minIdx; i <= maxIdx; i++) {
                stagingState.selectedIds.add(recordIds[i]);
            }

            // Update UI for all rows in range
            document.querySelectorAll('.staging-row').forEach(row => {
                const rowId = parseInt(row.dataset.id);
                const isSelected = stagingState.selectedIds.has(rowId);
                row.classList.toggle('selected', isSelected);
                row.style.background = isSelected ? '#eff6ff' : '';
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = isSelected;
            });

            stagingState.lastClickedId = numId;
            updateStagingActionsVisibility();
            return;
        }
    }

    // Normal single click toggle
    if (stagingState.selectedIds.has(numId)) {
        stagingState.selectedIds.delete(numId);
    } else {
        stagingState.selectedIds.add(numId);
    }

    // Track last clicked for shift+click
    stagingState.lastClickedId = numId;

    console.log('After toggle, size:', stagingState.selectedIds.size);

    // Update UI
    const row = document.querySelector(`.staging-row[data-id="${numId}"]`);
    if (row) {
        const isSelected = stagingState.selectedIds.has(numId);
        row.classList.toggle('selected', isSelected);
        row.style.background = isSelected ? '#eff6ff' : '';
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = isSelected;
    }

    updateStagingActionsVisibility();
}

/**
 * Toggle select all staging
 */
function toggleSelectAllStaging(checked) {
    const records = stagingState.records.filter(r => r.status === stagingState.currentTab);

    if (checked) {
        records.forEach(r => stagingState.selectedIds.add(parseInt(r.id)));
    } else {
        stagingState.selectedIds.clear();
    }

    console.log('toggleSelectAllStaging:', checked, 'size:', stagingState.selectedIds.size);

    // Update all rows
    document.querySelectorAll('.staging-row').forEach(row => {
        const id = parseInt(row.dataset.id);
        const isSelected = stagingState.selectedIds.has(id);
        row.classList.toggle('selected', isSelected);
        row.style.background = isSelected ? '#eff6ff' : '';
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = isSelected;
    });

    updateStagingActionsVisibility();
}

/**
 * Update actions bar visibility
 */
function updateStagingActionsVisibility() {
    const count = stagingState.selectedIds.size;

    // Update button text directly with new count
    const assignBtn = document.getElementById('btn-bulk-assign');
    const postBtn = document.getElementById('btn-bulk-post');
    const matchBtn = document.getElementById('btn-bulk-match');
    const deleteBtn = document.getElementById('btn-bulk-delete');

    if (assignBtn) {
        assignBtn.textContent = `Assign Selected to Client (${count})`;
        assignBtn.disabled = count === 0;
        assignBtn.style.opacity = count === 0 ? '0.5' : '1';
        assignBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (deleteBtn) {
        deleteBtn.textContent = `Delete Selected (${count})`;
        deleteBtn.disabled = count === 0;
        deleteBtn.style.opacity = count === 0 ? '0.5' : '1';
        deleteBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (postBtn) {
        postBtn.textContent = `Post Selected (${count})`;
        postBtn.disabled = count === 0;
        postBtn.style.opacity = count === 0 ? '0.5' : '1';
        postBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (matchBtn) {
        // Match button works with single selection only
        const matchCount = count === 1 ? 1 : 0;
        matchBtn.textContent = `Match to Existing (${matchCount})`;
        matchBtn.disabled = count !== 1;
        matchBtn.style.opacity = count !== 1 ? '0.5' : '1';
        matchBtn.style.cursor = count !== 1 ? 'not-allowed' : 'pointer';
    }
}

/**
 * Open CSV import modal for staging
 */
function openStagingImportModal() {
    let modal = document.getElementById('staging-import-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staging-import-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeStagingImportModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; max-width: 500px; width: 90%; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Import Transactions</h3>
                <button onclick="closeStagingImportModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 16px; color: #64748b;">
                    Import bank transactions from a CSV file. Transactions will be added to the <strong>Unassigned</strong> queue.
                </p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">CSV File</label>
                    <input type="file" id="staging-csv-file" accept=".csv" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                </div>

                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 13px; color: #64748b;">
                    <strong>Expected columns:</strong><br>
                    date, amount, description (required)<br>
                    type, reference, payee (optional)
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button onclick="closeStagingImportModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; cursor: pointer;">Cancel</button>
                <button onclick="submitStagingImport()" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">Import</button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

function closeStagingImportModal() {
    const modal = document.getElementById('staging-import-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Submit CSV import
 */
async function submitStagingImport() {
    const fileInput = document.getElementById('staging-csv-file');
    if (!fileInput || !fileInput.files[0]) {
        showToast('Please select a CSV file', 'error');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Find IOLTA account - try trustAccounts first, then fetch from API if needed
    let ioltaAccount = null;
    if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
        ioltaAccount = ioltaState.trustAccounts.find(a => a.account_type === 'iolta');
    }

    // If not found in state, fetch from API
    if (!ioltaAccount) {
        const accountsData = await apiGet('/accounts/index.php', { user_id: userId, account_type: 'iolta' });
        if (accountsData.success && accountsData.data.accounts && accountsData.data.accounts.length > 0) {
            ioltaAccount = accountsData.data.accounts[0];
        }
    }

    if (!ioltaAccount) {
        showToast('No IOLTA account found. Please create one first.', 'error');
        return;
    }

    console.log('Importing to account:', ioltaAccount);

    const formData = new FormData();
    formData.append('csv_file', fileInput.files[0]);
    formData.append('user_id', userId);
    formData.append('account_id', ioltaAccount.id);

    try {
        const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        console.log('Import result:', data);

        if (data.success) {
            let msg = `Imported ${data.data.imported} transactions`;
            if (data.data.duplicates > 0) {
                msg += `, ${data.data.duplicates} duplicates skipped`;
            }
            showToast(msg, 'success');

            // Show skipped list if any duplicates
            if (data.data.skipped_list && data.data.skipped_list.length > 0) {
                showSkippedDuplicatesModal(data.data.skipped_list);
            }

            closeStagingImportModal();
            await loadStagingRecords();
            renderStagingPage();
        } else {
            showToast(data.message || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Import error:', error);
        showToast('Import failed: ' + error.message, 'error');
    }
}

/**
 * Open bulk assign modal
 */
function openBulkAssignModal() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to assign', 'warning');
        return;
    }

    const clients = ioltaState.clients || [];

    let modal = document.getElementById('staging-assign-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staging-assign-modal';
        document.body.appendChild(modal);
    }

    console.log('openBulkAssignModal called, clients:', clients.length);

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeBulkAssignModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; max-width: 500px; width: 90%; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px;">Assign to Client</h3>
                <button onclick="closeBulkAssignModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 16px; color: #64748b;">
                    Assigning <strong>${stagingState.selectedIds.size}</strong> transaction(s) to a client.
                </p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Select Client</label>
                    <input type="text" id="staging-assign-search" placeholder="Search clients..."
                           oninput="filterStagingAssignClients(this.value)"
                           style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
                    <div id="staging-assign-client-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        ${clients.length > 0 ? clients.map(c => `
                            <div class="staging-client-option" data-id="${c.id}"
                                 onclick="selectStagingAssignClient(${c.id})"
                                 style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;"
                                 onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
                                <div style="font-weight: 500;">${escapeHtml(c.client_name)}</div>
                                <div style="font-size: 12px; color: #64748b;">${c.matter_number || 'No matter #'}</div>
                            </div>
                        `).join('') : '<div style="padding: 20px; text-align: center; color: #94a3b8;">No clients found. Add clients first.</div>'}
                    </div>
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; text-align: right;">
                <button onclick="closeBulkAssignModal()" style="padding: 10px 20px; background: #f1f5f9; border: none; border-radius: 8px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

function closeBulkAssignModal() {
    const modal = document.getElementById('staging-assign-modal');
    if (modal) modal.style.display = 'none';
}

function filterStagingAssignClients(term) {
    const clients = ioltaState.clients || [];
    const filtered = clients.filter(c =>
        c.client_name.toLowerCase().includes(term.toLowerCase()) ||
        (c.matter_number && c.matter_number.toLowerCase().includes(term.toLowerCase()))
    );

    const list = document.getElementById('staging-assign-client-list');
    if (list) {
        list.innerHTML = filtered.map(c => `
            <div class="staging-client-option" data-id="${c.id}"
                 onclick="selectStagingAssignClient(${c.id})"
                 style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
                <div style="font-weight: 500;">${escapeHtml(c.client_name)}</div>
                <div style="font-size: 12px; color: #64748b;">${c.matter_number || 'No matter #'}</div>
            </div>
        `).join('');
    }
}

/**
 * Select client and assign all selected staging records, then auto-post to Client Ledger
 */
async function selectStagingAssignClient(clientId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    let assignSuccess = 0;
    let assignFailed = 0;

    // Step 1: Assign client to all selected staging records
    for (const id of ids) {
        try {
            const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    client_id: clientId,
                    user_id: userId
                })
            });
            const data = await response.json();
            if (data.success) assignSuccess++;
            else assignFailed++;
        } catch (e) {
            assignFailed++;
        }
    }

    // Step 2: Auto-post to Client Ledger
    if (assignSuccess > 0) {
        try {
            console.log('Posting staging_ids:', ids);
            const response = await fetch('/expensetracker/api/v1/trust/post.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bulk_post',
                    staging_ids: ids,
                    user_id: userId
                })
            });
            const postData = await response.json();
            console.log('Post response:', postData);

            closeBulkAssignModal();

            if (postData.success) {
                showToast(`Assigned and posted ${postData.data.posted} transaction(s) to Client Ledger`, 'success');
            } else {
                showToast(`Assigned ${assignSuccess} but posting failed: ${postData.message}`, 'warning');
                console.error('Post failed:', postData);
            }
        } catch (e) {
            closeBulkAssignModal();
            showToast(`Assigned ${assignSuccess} but posting failed: ${e.message}`, 'warning');
            console.error('Post exception:', e);
        }
    } else {
        closeBulkAssignModal();
        showToast(`Assignment failed`, 'error');
    }

    stagingState.selectedIds.clear();
    stagingState.lastClickedId = null;
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Post selected staging records
 */
async function postSelectedStaging() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to post', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await fetch('/expensetracker/api/v1/trust/post.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_post',
                staging_ids: ids,
                user_id: userId
            })
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Posted ${data.data.posted} transaction(s)`, 'success');
            if (data.data.errors && data.data.errors.length > 0) {
                console.log('Post errors:', data.data.errors);
            }
        } else {
            showToast(data.message || 'Posting failed', 'error');
        }
    } catch (error) {
        showToast('Posting failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Unassign selected staging records (move back to unassigned)
 */
async function unassignSelectedStaging() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to unassign', 'warning');
        return;
    }

    const count = stagingState.selectedIds.size;
    if (!confirm(`Move ${count} transaction(s) back to unassigned?`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await apiPost('/trust/staging.php', {
            action: 'unassign',
            ids: ids,
            user_id: userId
        });

        if (response.success) {
            showToast(`Moved ${response.data.unassigned} transaction(s) to unassigned`, 'success');
            if (response.data.errors && response.data.errors.length > 0) {
                console.log('Unassign errors:', response.data.errors);
            }
        } else {
            showToast(response.message || 'Unassign failed', 'error');
        }
    } catch (error) {
        showToast('Unassign failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Unpost selected staging records (reverse posted transactions)
 */
async function unpostSelectedStaging(targetStatus = 'assigned') {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to unpost', 'warning');
        return;
    }

    const count = stagingState.selectedIds.size;
    const targetLabel = targetStatus === 'assigned' ? 'Assigned' : 'Unassigned';

    if (!confirm(`Unpost ${count} transaction(s) and move to ${targetLabel}?\n\nThis will DELETE the trust transactions and reverse the client ledger balances.`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await IoltaApi.unpostStaging(ids, userId, targetStatus);

        if (response.success) {
            showToast(`Unposted ${response.data.unposted} transaction(s) to ${targetLabel}`, 'success');
            if (response.data.errors && response.data.errors.length > 0) {
                console.log('Unpost errors:', response.data.errors);
            }
        } else {
            showToast(response.message || response.error || 'Unpost failed', 'error');
        }
    } catch (error) {
        showToast('Unpost failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Delete selected staging records
 */
async function deleteSelectedStaging() {
    const ids = Array.from(stagingState.selectedIds);
    if (ids.length === 0) {
        showToast('Select transactions to delete', 'warning');
        return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete ${ids.length} transaction(s)? This cannot be undone.`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_delete',
                staging_ids: ids,
                user_id: userId
            })
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Deleted ${data.data.deleted} transaction(s)`, 'success');
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Show modal with skipped duplicate transactions
 */
function showSkippedDuplicatesModal(skippedList) {
    // Remove existing modal if any
    const existing = document.getElementById('skipped-duplicates-modal');
    if (existing) existing.remove();

    const rows = skippedList.map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; font-size: 13px;">${item.date || '-'}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #7c3aed;">${item.reference || '-'}</td>
            <td style="padding: 10px 12px; font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.description || '-')}</td>
            <td style="padding: 10px 12px; font-size: 13px; text-align: right; font-weight: 500; color: ${item.amount < 0 ? '#ef4444' : '#10b981'};">
                ${item.amount < 0 ? '-' : '+'}$${Math.abs(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}
            </td>
        </tr>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'skipped-duplicates-modal';
    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;" onclick="closeSkippedDuplicatesModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; padding: 24px; width: 700px; max-width: 90vw; max-height: 80vh; z-index: 10001; box-shadow: 0 25px 50px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Skipped Duplicates</h3>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">${skippedList.length} transactions were skipped (already exist with same check# and amount)</p>
                </div>
                <button onclick="closeSkippedDuplicatesModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8fafc; position: sticky; top: 0;">
                        <tr>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Date</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Check #</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 16px; text-align: right;">
                <button onclick="closeSkippedDuplicatesModal()" style="padding: 10px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeSkippedDuplicatesModal() {
    const modal = document.getElementById('skipped-duplicates-modal');
    if (modal) modal.remove();
}

// =====================================================
// TRANSACTION MATCHING (Bank Reconciliation Style)
// =====================================================

let matchingState = {
    stagingId: null,
    matches: [],
    selectedMatchId: null
};

/**
 * Open match modal for the first selected staging record
 */
async function openMatchModal() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Please select a transaction to match', 'warning');
        return;
    }

    // Only handle one at a time for matching
    const stagingId = Array.from(stagingState.selectedIds)[0];
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Show loading
    showToast('Finding potential matches...', 'info');

    try {
        const result = await IoltaApi.findMatches(stagingId, userId);

        if (!result.success) {
            showToast(result.message || 'Failed to find matches', 'error');
            return;
        }

        matchingState.stagingId = stagingId;
        matchingState.matches = result.data.matches || [];
        matchingState.selectedMatchId = null;

        renderMatchModal(result.data.staging, result.data.matches);

    } catch (error) {
        console.error('Error finding matches:', error);
        showToast('Error finding matches', 'error');
    }
}

/**
 * Render the match modal with potential matches
 */
function renderMatchModal(staging, matches) {
    let modal = document.getElementById('match-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'match-modal';
        document.body.appendChild(modal);
    }

    const amount = parseFloat(staging.amount);
    const isPositive = amount > 0;

    let matchesHtml = '';
    if (matches.length === 0) {
        matchesHtml = `
            <div style="padding: 32px; text-align: center; color: #94a3b8;">
                <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
                <div style="font-size: 14px; font-weight: 500; color: #64748b;">No matching transactions found</div>
                <div style="font-size: 13px; margin-top: 8px; color: #94a3b8;">
                    Matches require: same client, same amount, date within 14 days
                </div>
            </div>
        `;
    } else {
        matchesHtml = matches.map(m => {
            const matchAmount = parseFloat(m.amount);
            const matchIsPositive = matchAmount > 0;
            const scoreColor = m.match_score >= 80 ? '#10b981' : m.match_score >= 50 ? '#f59e0b' : '#94a3b8';

            return `
                <div class="match-option" data-id="${m.id}"
                     onclick="selectMatchOption(${m.id})"
                     style="display: grid; grid-template-columns: 40px 1fr 120px 80px; gap: 12px; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: all 0.15s; align-items: center;"
                     onmouseover="this.style.borderColor='#8b5cf6'; this.style.background='#faf5ff';"
                     onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='#e2e8f0'; this.style.background='white';}">
                    <div style="display: flex; align-items: center; justify-content: center;">
                        <input type="radio" name="match-option" value="${m.id}" style="width: 18px; height: 18px; cursor: pointer;">
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 4px;">
                            ${escapeHtml(m.description || 'No description')}
                        </div>
                        <div style="font-size: 12px; color: #64748b;">
                            ${formatDate(m.transaction_date)} · ${m.reference_number ? 'Ref: ' + escapeHtml(m.reference_number) : ''} ${m.check_number ? '· Check #' + escapeHtml(m.check_number) : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 15px; font-weight: 600; color: ${matchIsPositive ? '#10b981' : '#ef4444'};">
                            ${matchIsPositive ? '+' : ''}${formatCurrency(matchAmount)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                            ${m.days_difference === 0 ? 'Same day' : m.days_difference + ' day(s) diff'}
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 12px; background: ${scoreColor}20; color: ${scoreColor};">
                            ${m.match_score}%
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeMatchModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; max-width: 700px; width: 95%; max-height: 85vh; overflow: hidden; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Match Bank Transaction</h3>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Link this bank import to an existing ledger entry</p>
                </div>
                <button onclick="closeMatchModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; padding: 4px;">&times;</button>
            </div>

            <div style="padding: 20px 24px; max-height: calc(85vh - 180px); overflow-y: auto;">
                <!-- Staging record being matched -->
                <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; margin-bottom: 8px;">Bank Import (to match)</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 15px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(staging.description || 'No description')}</div>
                            <div style="font-size: 13px; opacity: 0.9;">${formatDate(staging.transaction_date)} · ${staging.client_name || 'Unknown client'}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 20px; font-weight: 700;">${isPositive ? '+' : ''}${formatCurrency(amount)}</div>
                        </div>
                    </div>
                </div>

                <!-- Potential matches -->
                <div style="margin-bottom: 12px; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                    Potential Matches (${matches.length})
                </div>
                ${matchesHtml}
            </div>

            <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; background: #f8fafc;">
                <button onclick="closeMatchModal()" style="padding: 10px 24px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-weight: 500;">Cancel</button>
                <button id="btn-confirm-match" onclick="confirmMatch()" style="padding: 10px 24px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; opacity: 0.5;" disabled>
                    Confirm Match
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

/**
 * Select a match option
 */
function selectMatchOption(transactionId) {
    matchingState.selectedMatchId = transactionId;

    // Update UI
    document.querySelectorAll('.match-option').forEach(el => {
        el.classList.remove('selected');
        el.style.borderColor = '#e2e8f0';
        el.style.background = 'white';
        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
    });

    const selected = document.querySelector(`.match-option[data-id="${transactionId}"]`);
    if (selected) {
        selected.classList.add('selected');
        selected.style.borderColor = '#8b5cf6';
        selected.style.background = '#faf5ff';
        const radio = selected.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    }

    // Enable confirm button
    const btn = document.getElementById('btn-confirm-match');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

/**
 * Confirm the selected match
 */
async function confirmMatch() {
    if (!matchingState.stagingId || !matchingState.selectedMatchId) {
        showToast('Please select a transaction to match', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const result = await IoltaApi.matchTransaction(
            matchingState.stagingId,
            matchingState.selectedMatchId,
            userId
        );

        if (result.success) {
            showToast('Transaction matched successfully!', 'success');
            closeMatchModal();

            // Refresh staging list
            stagingState.selectedIds.clear();
            await loadStagingRecords();
            renderStagingPage();
        } else {
            showToast(result.message || 'Failed to match transaction', 'error');
        }
    } catch (error) {
        console.error('Error matching transaction:', error);
        showToast('Error matching transaction', 'error');
    }
}

/**
 * Close the match modal
 */
function closeMatchModal() {
    const modal = document.getElementById('match-modal');
    if (modal) modal.style.display = 'none';

    matchingState.stagingId = null;
    matchingState.matches = [];
    matchingState.selectedMatchId = null;
}

// Export staging functions
window.loadStagingPage = loadStagingPage;
window.loadStagingRecords = loadStagingRecords;
window.renderStagingPage = renderStagingPage;
window.switchStagingTab = switchStagingTab;
window.toggleStagingSelection = toggleStagingSelection;
window.toggleSelectAllStaging = toggleSelectAllStaging;
window.openStagingImportModal = openStagingImportModal;
window.closeStagingImportModal = closeStagingImportModal;
window.submitStagingImport = submitStagingImport;
window.openBulkAssignModal = openBulkAssignModal;
window.closeBulkAssignModal = closeBulkAssignModal;
window.filterStagingAssignClients = filterStagingAssignClients;
window.selectStagingAssignClient = selectStagingAssignClient;
window.postSelectedStaging = postSelectedStaging;
window.unassignSelectedStaging = unassignSelectedStaging;
window.unpostSelectedStaging = unpostSelectedStaging;
window.deleteSelectedStaging = deleteSelectedStaging;
window.showSkippedDuplicatesModal = showSkippedDuplicatesModal;
window.closeSkippedDuplicatesModal = closeSkippedDuplicatesModal;
window.openMatchModal = openMatchModal;
window.closeMatchModal = closeMatchModal;
window.selectMatchOption = selectMatchOption;
window.confirmMatch = confirmMatch;
