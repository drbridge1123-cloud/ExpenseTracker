// =====================================================
// NEW TRANSACTION MODAL (Deposit/Check/Fee)
// =====================================================

let currentTransactionTab = 'deposit';

// Helper to get current user ID
function getCurrentUserIdForModal() {
    return window.getCurrentUserId?.() || window.IoltaPageState?.currentUser || localStorage.getItem('currentUser') || 1;
}

// Open new transaction modal
function openNewTransactionModal(tab = 'deposit') {
    const modal = document.getElementById('new-transaction-modal');
    if (modal) {
        modal.style.display = 'flex';
        switchTransactionTab(tab);
    }
}

// Close new transaction modal
function closeNewTransactionModal() {
    const modal = document.getElementById('new-transaction-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Switch between transaction tabs
function switchTransactionTab(tab) {
    currentTransactionTab = tab;

    // Update tab styles
    const tabs = ['deposit', 'check', 'fee'];
    const tabStyles = {
        deposit: { active: '#dcfce7', activeColor: '#166534', border: '#22c55e' },
        check: { active: '#dbeafe', activeColor: '#1e40af', border: '#3b82f6' },
        fee: { active: '#fef3c7', activeColor: '#92400e', border: '#f59e0b' }
    };

    tabs.forEach(t => {
        const tabBtn = document.getElementById(`txn-tab-${t}`);
        if (tabBtn) {
            if (t === tab) {
                const style = tabStyles[t];
                tabBtn.style.background = style.active;
                tabBtn.style.color = style.activeColor;
                tabBtn.style.borderBottom = `3px solid ${style.border}`;
            } else {
                tabBtn.style.background = 'transparent';
                tabBtn.style.color = '#64748b';
                tabBtn.style.borderBottom = '3px solid transparent';
            }
        }
    });

    // Load form content
    loadTransactionForm(tab);
}

// Load form for selected transaction type
function loadTransactionForm(type) {
    const container = document.getElementById('new-transaction-content');
    if (!container) return;

    if (type === 'deposit') {
        container.innerHTML = getDepositFormHtml();
        initializeDepositForm();
    } else if (type === 'check') {
        container.innerHTML = getCheckFormHtml();
        initializeCheckForm();
    } else if (type === 'fee') {
        container.innerHTML = getFeeFormHtml();
        initializeFeeForm();
    }
}

// Deposit form HTML
function getDepositFormHtml() {
    return `
        <form id="txn-deposit-form" onsubmit="submitTransactionDeposit(event)">
            <div style="display: grid; gap: 16px;">
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Client *</label>
                    <div style="position: relative;">
                        <input type="text" id="txn-deposit-client-search" placeholder="Search clients..." autocomplete="off"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        <input type="hidden" id="txn-deposit-client" required>
                        <div id="txn-deposit-client-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 250px; overflow-y: auto; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 8px 8px; z-index: 10000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" id="txn-deposit-amount" step="0.01" min="0.01" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                        <input type="date" id="txn-deposit-date" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Description</label>
                    <input type="text" id="txn-deposit-description" placeholder="e.g., Retainer deposit"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Reference Number</label>
                    <input type="text" id="txn-deposit-reference" placeholder="e.g., Wire transfer #"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
            </div>
            <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeNewTransactionModal()" style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                <button type="submit" style="padding: 10px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Save Deposit</button>
            </div>
        </form>
    `;
}

// Check form HTML
function getCheckFormHtml() {
    return `
        <form id="txn-check-form" onsubmit="submitTransactionCheck(event)">
            <div style="display: grid; gap: 16px;">
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Client *</label>
                    <div style="position: relative;">
                        <input type="text" id="txn-check-client-search" placeholder="Search clients..." autocomplete="off"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        <input type="hidden" id="txn-check-client" required>
                        <div id="txn-check-client-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 250px; overflow-y: auto; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 8px 8px; z-index: 10000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Check # *</label>
                        <input type="text" id="txn-check-number" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" id="txn-check-amount" step="0.01" min="0.01" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                        <input type="date" id="txn-check-date" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Payee *</label>
                        <div style="position: relative;">
                            <input type="text" id="txn-check-payee-search" placeholder="Search vendors/customers..." autocomplete="off" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                            <input type="hidden" id="txn-check-payee">
                            <div id="txn-check-payee-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 250px; overflow-y: auto; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 8px 8px; z-index: 10000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></div>
                        </div>
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Type *</label>
                        <select id="txn-check-type" required
                                style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white;">
                            <option value="payout">Payout</option>
                            <option value="legal_fee">Legal Fee</option>
                            <option value="cost">Cost</option>
                            <option value="disbursement">Disbursement</option>
                            <option value="transfer_out">Transfer Out</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Memo</label>
                    <input type="text" id="txn-check-memo" placeholder="Check memo..."
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
            </div>
            <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeNewTransactionModal()" style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                <button type="submit" style="padding: 10px 20px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Save Check</button>
            </div>
        </form>
    `;
}

// Fee form HTML
function getFeeFormHtml() {
    return `
        <form id="txn-fee-form" onsubmit="submitTransactionFee(event)">
            <div style="display: grid; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Amount *</label>
                        <input type="number" id="txn-fee-amount" step="0.01" min="0.01" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                        <input type="date" id="txn-fee-date" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Description *</label>
                    <input type="text" id="txn-fee-description" required placeholder="e.g., Bank service fee"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Reference Number</label>
                    <input type="text" id="txn-fee-reference" placeholder="Optional reference..."
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
            </div>
            <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeNewTransactionModal()" style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                <button type="submit" style="padding: 10px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Save Fee</button>
            </div>
        </form>
    `;
}

// Initialize deposit form
async function initializeDepositForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('txn-deposit-date').value = today;

    // Setup searchable client dropdown
    await setupSearchableClientDropdown('txn-deposit');
}

// Initialize check form
async function initializeCheckForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('txn-check-date').value = today;

    // Setup searchable client dropdown
    await setupSearchableClientDropdown('txn-check');

    // Setup searchable payee dropdown
    await setupSearchablePayeeDropdown('txn-check');

    // Get next check number
    try {
        const userId = window.IoltaPageState?.currentUser || localStorage.getItem('currentUser');
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            action: 'next_check_number'
        });
        if (result.success && result.data?.next_check_number) {
            document.getElementById('txn-check-number').value = result.data.next_check_number;
        }
    } catch (e) {
        console.error('Error getting next check number:', e);
    }
}

// Initialize fee form
function initializeFeeForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('txn-fee-date').value = today;
}

// Load clients for select dropdown (legacy - kept for compatibility)
async function loadClientsForSelect(selectElement) {
    try {
        const userId = window.IoltaPageState?.currentUser || localStorage.getItem('currentUser');
        const result = await apiGet('/trust/clients.php', { user_id: userId });

        if (result.success && result.data) {
            const clients = result.data.clients || result.data;
            selectElement.innerHTML = '<option value="">Select client...</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.client_name || client.name;
                selectElement.appendChild(option);
            });
        }
    } catch (e) {
        console.error('Error loading clients:', e);
    }
}

// Setup searchable client dropdown with auto-select
async function setupSearchableClientDropdown(prefix) {
    const searchInput = document.getElementById(`${prefix}-client-search`);
    const hiddenInput = document.getElementById(`${prefix}-client`);
    const dropdown = document.getElementById(`${prefix}-client-dropdown`);

    if (!searchInput || !hiddenInput || !dropdown) return;

    // Load clients
    let clients = [];
    try {
        const userId = getCurrentUserIdForModal();
        const result = await apiGet('/trust/clients.php', { user_id: userId });
        if (result.success && result.data) {
            clients = result.data.clients || result.data;
        }
    } catch (e) {
        console.error('Error loading clients:', e);
    }

    // Store clients for filtering
    window[`${prefix}_clients`] = clients;

    // Auto-select current client if one is selected
    const selectedClientId = window.IoltaPageState?.selectedClientId;
    if (selectedClientId && selectedClientId !== 'all' && selectedClientId !== 'general') {
        const client = clients.find(c => c.id == selectedClientId);
        if (client) {
            searchInput.value = client.client_name || client.name;
            hiddenInput.value = client.id;
        }
    }

    // Render dropdown options
    function renderDropdownOptions(filteredClients) {
        if (filteredClients.length === 0) {
            dropdown.innerHTML = '<div style="padding: 12px; color: #94a3b8; text-align: center;">No clients found</div>';
            return;
        }

        dropdown.innerHTML = filteredClients.map(c => {
            const name = c.client_name || c.name;
            const caseNum = c.case_number || '';
            const balance = parseFloat(c.total_balance || 0);
            return `
                <div class="txn-client-option" data-id="${c.id}" data-name="${escapeHtmlAttr(name)}"
                     style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
                     onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">
                    <div>
                        <div style="font-weight: 500; color: #1e293b;">${escapeHtmlDisplay(name)}</div>
                        ${caseNum ? `<div style="font-size: 12px; color: #94a3b8;">${escapeHtmlDisplay(caseNum)}</div>` : ''}
                    </div>
                    <div style="font-weight: 500; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">$${balance.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        dropdown.querySelectorAll('.txn-client-option').forEach(option => {
            option.addEventListener('click', () => {
                const id = option.dataset.id;
                const name = option.dataset.name;
                searchInput.value = name;
                hiddenInput.value = id;
                dropdown.style.display = 'none';
            });
        });
    }

    // Show dropdown on focus
    searchInput.addEventListener('focus', () => {
        renderDropdownOptions(clients);
        dropdown.style.display = 'block';
    });

    // Filter on input
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        const filtered = query === '' ? clients : clients.filter(c => {
            const name = (c.client_name || c.name || '').toLowerCase();
            const caseNum = (c.case_number || '').toLowerCase();
            return name.includes(query) || caseNum.includes(query);
        });
        renderDropdownOptions(filtered);
        dropdown.style.display = 'block';

        // Clear hidden value if search text doesn't match
        if (query === '') {
            hiddenInput.value = '';
        }
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Handle escape key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
}

// Setup searchable payee dropdown (vendors + customers) - Live search from API
async function setupSearchablePayeeDropdown(prefix) {
    const searchInput = document.getElementById(`${prefix}-payee-search`);
    const hiddenInput = document.getElementById(`${prefix}-payee`);
    const dropdown = document.getElementById(`${prefix}-payee-dropdown`);

    if (!searchInput || !hiddenInput || !dropdown) return;

    let searchTimeout = null;
    let cachedEntities = []; // Cache for initial/empty search

    // Function to search entities from API
    async function searchEntities(query) {
        try {
            const userId = getCurrentUserIdForModal();
            const params = { user_id: userId, limit: 50 };
            if (query && query.trim()) {
                params.search = query.trim();
            }
            const result = await apiGet('/entities/', params);
            if (result.success && result.data) {
                return result.data.entities || [];
            }
        } catch (e) {
            console.error('Error searching entities:', e);
        }
        return [];
    }

    // Load initial entities (cache for empty search)
    cachedEntities = await searchEntities('');
    window[`${prefix}_payees`] = cachedEntities;

    // Render dropdown options
    function renderPayeeOptions(filteredEntities, searchQuery = '') {
        let html = '';

        // Check if exact match exists in entities
        const trimmedQuery = searchQuery.trim();
        const exactMatch = trimmedQuery && filteredEntities.some(e =>
            (e.name || '').toLowerCase() === trimmedQuery.toLowerCase() ||
            (e.display_name || '').toLowerCase() === trimmedQuery.toLowerCase()
        );

        // Add "Add as Vendor" / "Add as Customer" options if user typed something that doesn't exist
        if (trimmedQuery && !exactMatch) {
            html += `
                <div class="txn-payee-add-section" style="padding: 8px 12px; background: #f0fdf4; border-bottom: 1px solid #dcfce7;">
                    <div style="font-size: 11px; font-weight: 600; color: #166534; margin-bottom: 8px;">Add "${escapeHtmlDisplay(trimmedQuery)}" as:</div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="txn-payee-add-vendor" data-name="${escapeHtmlAttr(trimmedQuery)}"
                                style="flex: 1; padding: 8px 12px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <span>🏢</span> Vendor
                        </button>
                        <button type="button" class="txn-payee-add-customer" data-name="${escapeHtmlAttr(trimmedQuery)}"
                                style="flex: 1; padding: 8px 12px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <span>👤</span> Customer
                        </button>
                    </div>
                </div>
            `;
        }

        if (filteredEntities.length === 0 && !searchQuery.trim()) {
            html += '<div style="padding: 12px; color: #94a3b8; text-align: center;">No payees found. Type to add new.</div>';
        } else {
            // Group by type
            const vendors = filteredEntities.filter(e => e.type_code === 'vendor');
            const customers = filteredEntities.filter(e => e.type_code === 'customer');
            const others = filteredEntities.filter(e => e.type_code !== 'vendor' && e.type_code !== 'customer');

            if (vendors.length > 0) {
                html += '<div style="padding: 6px 12px; background: #f8fafc; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Vendors</div>';
                html += vendors.map(e => renderPayeeItem(e)).join('');
            }

            if (customers.length > 0) {
                html += '<div style="padding: 6px 12px; background: #f8fafc; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Customers</div>';
                html += customers.map(e => renderPayeeItem(e)).join('');
            }

            if (others.length > 0) {
                html += '<div style="padding: 6px 12px; background: #f8fafc; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Other</div>';
                html += others.map(e => renderPayeeItem(e)).join('');
            }
        }

        dropdown.innerHTML = html;

        // Add click handlers for entity items
        dropdown.querySelectorAll('.txn-payee-option').forEach(option => {
            option.addEventListener('click', () => {
                const name = option.dataset.name;
                searchInput.value = name;
                hiddenInput.value = name;
                dropdown.style.display = 'none';
            });
        });

        // Add click handler for "Add as Vendor" button
        const addVendorBtn = dropdown.querySelector('.txn-payee-add-vendor');
        if (addVendorBtn) {
            addVendorBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const name = addVendorBtn.dataset.name;
                await createEntityFromPayee(name, 'vendor', searchInput, hiddenInput, dropdown);
            });
        }

        // Add click handler for "Add as Customer" button
        const addCustomerBtn = dropdown.querySelector('.txn-payee-add-customer');
        if (addCustomerBtn) {
            addCustomerBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const name = addCustomerBtn.dataset.name;
                await createEntityFromPayee(name, 'customer', searchInput, hiddenInput, dropdown);
            });
        }
    }

    // Open Add Entity modal instead of direct save
    async function createEntityFromPayee(name, type, searchInput, hiddenInput, dropdown) {
        dropdown.style.display = 'none';
        openAddEntityModal(name, type, searchInput, hiddenInput, async () => {
            // Callback after successful save - refresh cached entities
            cachedEntities = await searchEntities('');
        });
    }

    function renderPayeeItem(entity) {
        const name = entity.display_name || entity.name;
        const company = entity.company_name;
        const typeIcon = entity.type_code === 'vendor' ? '🏢' : (entity.type_code === 'customer' ? '👤' : '📋');

        return `
            <div class="txn-payee-option" data-id="${entity.id}" data-name="${escapeHtmlAttr(name)}"
                 style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;"
                 onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">
                <span style="font-size: 16px;">${typeIcon}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtmlDisplay(name)}</div>
                    ${company && company !== name ? `<div style="font-size: 12px; color: #94a3b8;">${escapeHtmlDisplay(company)}</div>` : ''}
                </div>
            </div>
        `;
    }

    // Show dropdown on focus - show immediately with cached data, then refresh
    searchInput.addEventListener('focus', () => {
        // Show immediately with what we have
        renderPayeeOptions(cachedEntities, searchInput.value);
        dropdown.style.display = 'block';

        // Refresh cache in background
        searchEntities('').then(results => {
            cachedEntities = results;
            // Only update if still focused and no search query
            if (document.activeElement === searchInput && !searchInput.value.trim()) {
                renderPayeeOptions(cachedEntities, '');
            }
        });
    });

    // Live search on input with debounce
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();

        // Set hidden value immediately
        hiddenInput.value = query;

        // Show dropdown immediately
        dropdown.style.display = 'block';

        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Show "Use" option immediately with any cached matches
        const filtered = query === '' ? cachedEntities : cachedEntities.filter(e => {
            const name = (e.name || '').toLowerCase();
            const displayName = (e.display_name || '').toLowerCase();
            const company = (e.company_name || '').toLowerCase();
            return name.includes(query.toLowerCase()) || displayName.includes(query.toLowerCase()) || company.includes(query.toLowerCase());
        });
        renderPayeeOptions(filtered, query);

        // If there's a query, also search API for more results
        if (query) {
            searchTimeout = setTimeout(async () => {
                const results = await searchEntities(query);
                // Only update if the query hasn't changed
                if (searchInput.value.trim() === query) {
                    renderPayeeOptions(results, query);
                }
            }, 300);
        }
    });

    // Hide dropdown when clicking outside - use mousedown to catch before focus changes
    const hideDropdownHandler = (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            // Ensure hidden value matches visible value
            if (searchInput.value.trim()) {
                hiddenInput.value = searchInput.value.trim();
            }
        }
    };

    // Remove old handler if exists, then add new one
    document.removeEventListener('mousedown', hideDropdownHandler);
    document.addEventListener('mousedown', hideDropdownHandler);

    // Handle escape key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            // Set value and close dropdown
            if (searchInput.value.trim()) {
                hiddenInput.value = searchInput.value.trim();
            }
            dropdown.style.display = 'none';
        }
    });
}

// Helper to escape HTML for attributes
function escapeHtmlAttr(text) {
    if (!text) return '';
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Helper to escape HTML for display
function escapeHtmlDisplay(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Submit deposit
async function submitTransactionDeposit(event) {
    event.preventDefault();

    const userId = getCurrentUserIdForModal();
    const clientId = document.getElementById('txn-deposit-client').value;

    if (!clientId) {
        showNotification('Please select a client', 'error');
        return;
    }

    const data = {
        user_id: userId,
        client_id: clientId,
        amount: parseFloat(document.getElementById('txn-deposit-amount').value),
        transaction_date: document.getElementById('txn-deposit-date').value,
        description: document.getElementById('txn-deposit-description').value || 'Deposit',
        reference_number: document.getElementById('txn-deposit-reference').value || null,
        transaction_type: 'deposit'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            closeNewTransactionModal();
            // Refresh the current page data
            refreshCurrentPageData();
            showNotification('Deposit recorded successfully', 'success');
        } else {
            showNotification(result.message || 'Error saving deposit', 'error');
        }
    } catch (e) {
        console.error('Error saving deposit:', e);
        showNotification('Error saving deposit', 'error');
    }
}

// Submit check
async function submitTransactionCheck(event) {
    event.preventDefault();

    const userId = getCurrentUserIdForModal();
    const clientId = document.getElementById('txn-check-client').value;
    const payee = document.getElementById('txn-check-payee').value || document.getElementById('txn-check-payee-search').value;

    if (!clientId) {
        showNotification('Please select a client', 'error');
        return;
    }

    if (!payee || !payee.trim()) {
        showNotification('Please enter a payee', 'error');
        return;
    }

    const transactionType = document.getElementById('txn-check-type').value || 'payout';

    const data = {
        user_id: userId,
        client_id: clientId,
        check_number: document.getElementById('txn-check-number').value,
        amount: -Math.abs(parseFloat(document.getElementById('txn-check-amount').value)),
        transaction_date: document.getElementById('txn-check-date').value,
        payee: payee.trim(),
        description: document.getElementById('txn-check-memo').value || 'Check',
        transaction_type: transactionType,
        status: 'pending'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            closeNewTransactionModal();
            // Refresh the current page data
            refreshCurrentPageData();
            if (typeof loadAllCheckStatusCounts === 'function') loadAllCheckStatusCounts();
            showNotification('Check recorded successfully', 'success');
        } else {
            showNotification(result.message || 'Error saving check', 'error');
        }
    } catch (e) {
        console.error('Error saving check:', e);
        showNotification('Error saving check', 'error');
    }
}

// Submit fee
async function submitTransactionFee(event) {
    event.preventDefault();

    const userId = getCurrentUserIdForModal();
    const data = {
        user_id: userId,
        amount: -Math.abs(parseFloat(document.getElementById('txn-fee-amount').value)),
        transaction_date: document.getElementById('txn-fee-date').value,
        description: document.getElementById('txn-fee-description').value || 'Fee',
        reference_number: document.getElementById('txn-fee-reference').value || null,
        transaction_type: 'fee'
    };

    try {
        const result = await apiPost('/trust/transactions.php', data);
        if (result.success) {
            closeNewTransactionModal();
            // Refresh the current page data
            refreshCurrentPageData();
            showNotification('Fee recorded successfully', 'success');
        } else {
            showNotification(result.message || 'Error saving fee', 'error');
        }
    } catch (e) {
        console.error('Error saving fee:', e);
        showNotification('Error saving fee', 'error');
    }
}

// Refresh the current page data after saving a transaction
async function refreshCurrentPageData() {
    console.log('[NewTxnModal] refreshCurrentPageData called');

    // IOLTA Ledger page (iolta-ledger.js) - This is the primary IOLTA page
    if (typeof window.loadIoltaTransactions === 'function' && window.IoltaPageState) {
        const clientId = window.IoltaPageState.selectedClientId || 'all';
        console.log('[NewTxnModal] Refreshing IOLTA transactions for clientId:', clientId);
        await window.loadIoltaTransactions(clientId);
        // Also refresh sidebar to update balances
        if (typeof window.loadIoltaPage === 'function') {
            // Reload the full page to get updated client balances
            await window.loadIoltaPage();
        }
        return;
    }

    // Client Ledger page (legacy)
    if (typeof window.loadClientLedgerPage === 'function') {
        console.log('[NewTxnModal] Calling loadClientLedgerPage');
        await window.loadClientLedgerPage();
        return;
    }

    // IOLTA Dashboard/Transactions page
    if (typeof window.refreshIoltaUI === 'function') {
        await window.refreshIoltaUI({
            ledgers: true,
            transactions: true,
            sidebar: true
        });
    }

    // IOLTA Dashboard
    if (typeof window.loadIOLTAData === 'function') {
        window.loadIOLTAData(true);
    }
    // Trust Clients list
    if (typeof window.loadTrustClients === 'function') {
        window.loadTrustClients();
    }
    // Check Status page
    if (typeof window.loadCheckStatusList === 'function') {
        const activeTab = document.querySelector('.check-status-tab.active');
        if (activeTab) {
            const status = activeTab.dataset.status || 'pending';
            window.loadCheckStatusList(status);
        }
    }
}

// Show notification helper
function showNotification(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}

// =====================================================
// ADD ENTITY MODAL
// =====================================================

let addEntityCallback = null;
let addEntitySearchInput = null;
let addEntityHiddenInput = null;

// Open Add Entity Modal with form
function openAddEntityModal(name, type, searchInput, hiddenInput, onSaveCallback) {
    // Store references for callback
    addEntityCallback = onSaveCallback;
    addEntitySearchInput = searchInput;
    addEntityHiddenInput = hiddenInput;

    const typeName = type === 'vendor' ? 'Vendor' : 'Customer';
    const typeIcon = type === 'vendor' ? '🏢' : '👤';

    // Remove existing modal if any
    const existingModal = document.getElementById('add-entity-modal');
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="add-entity-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100001;">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                        <span>${typeIcon}</span> Add ${typeName}
                    </h2>
                    <button onclick="closeAddEntityModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; line-height: 1;">&times;</button>
                </div>

                <!-- Form -->
                <form id="add-entity-form" onsubmit="submitAddEntityForm(event)" style="padding: 24px;">
                    <input type="hidden" id="add-entity-type" value="${type}">

                    <!-- Name -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">
                            Name <span style="color: #ef4444;">*</span>
                        </label>
                        <input type="text" id="add-entity-name" value="${escapeHtmlAttr(name)}" required
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <!-- Display Name -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">
                            Display Name <span style="color: #9ca3af;">(for checks)</span>
                        </label>
                        <input type="text" id="add-entity-display-name" value="${escapeHtmlAttr(name)}"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <!-- Email & Phone -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Email</label>
                            <input type="email" id="add-entity-email" placeholder="email@example.com"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Phone</label>
                            <input type="tel" id="add-entity-phone" placeholder="(555) 123-4567"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Address Section -->
                    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">Address</div>

                    <!-- Street Address -->
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">Street Address</label>
                        <input type="text" id="add-entity-address1" placeholder="Street address"
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <!-- Address Line 2 -->
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">Address Line 2</label>
                        <input type="text" id="add-entity-address2" placeholder="Suite, unit, building, etc."
                               style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <!-- City, State, Zip -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">City</label>
                            <input type="text" id="add-entity-city" placeholder="City"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">State</label>
                            <input type="text" id="add-entity-state" placeholder="CA" maxlength="2"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px;">Zip</label>
                            <input type="text" id="add-entity-zip" placeholder="90001"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Notes -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Notes</label>
                        <textarea id="add-entity-notes" rows="2" placeholder="Optional notes..."
                                  style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; resize: vertical;"></textarea>
                    </div>

                    <!-- Buttons -->
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button type="button" onclick="closeAddEntityModal()"
                                style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">
                            Cancel
                        </button>
                        <button type="submit"
                                style="padding: 10px 24px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Close on backdrop click
    document.getElementById('add-entity-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-entity-modal') closeAddEntityModal();
    });

    // Add phone number formatting
    const phoneInput = document.getElementById('add-entity-phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = formatPhoneNumber(e.target.value);
        });
    }

    // Focus on name field
    setTimeout(() => document.getElementById('add-entity-name')?.focus(), 100);
}

// Format phone number as (XXX) XXX-XXXX
function formatPhoneNumber(value) {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');

    // Limit to 10 digits
    const limited = digits.substring(0, 10);

    // Format based on length
    if (limited.length === 0) {
        return '';
    } else if (limited.length <= 3) {
        return `(${limited}`;
    } else if (limited.length <= 6) {
        return `(${limited.substring(0, 3)}) ${limited.substring(3)}`;
    } else {
        return `(${limited.substring(0, 3)}) ${limited.substring(3, 6)}-${limited.substring(6)}`;
    }
}

// Close Add Entity Modal
function closeAddEntityModal() {
    const modal = document.getElementById('add-entity-modal');
    if (modal) modal.remove();
    addEntityCallback = null;
    addEntitySearchInput = null;
    addEntityHiddenInput = null;
}

// Submit Add Entity Form
async function submitAddEntityForm(event) {
    event.preventDefault();

    const type = document.getElementById('add-entity-type').value;
    const name = document.getElementById('add-entity-name').value.trim();
    const displayName = document.getElementById('add-entity-display-name').value.trim() || name;

    if (!name) {
        showNotification('Name is required', 'error');
        return;
    }

    const data = {
        user_id: getCurrentUserIdForModal(),
        type: type,
        name: name,
        display_name: displayName,
        email: document.getElementById('add-entity-email').value.trim(),
        phone: document.getElementById('add-entity-phone').value.trim(),
        address_line1: document.getElementById('add-entity-address1').value.trim(),
        address_line2: document.getElementById('add-entity-address2').value.trim(),
        city: document.getElementById('add-entity-city').value.trim(),
        state: document.getElementById('add-entity-state').value.trim(),
        zip_code: document.getElementById('add-entity-zip').value.trim(),
        notes: document.getElementById('add-entity-notes').value.trim()
    };

    try {
        const result = await apiPost('/entities/', data);

        if (result.success) {
            // Set the payee field with display name
            if (addEntitySearchInput) addEntitySearchInput.value = displayName;
            if (addEntityHiddenInput) addEntityHiddenInput.value = displayName;

            // Run callback
            if (addEntityCallback) await addEntityCallback();

            // Close modal
            closeAddEntityModal();

            // Show success
            const typeName = type === 'vendor' ? 'Vendor' : 'Customer';
            showNotification(`${typeName} "${name}" added successfully`, 'success');
        } else {
            showNotification(result.message || 'Error adding entity', 'error');
        }
    } catch (e) {
        console.error('Error creating entity:', e);
        showNotification('Error adding entity', 'error');
    }
}

// Make functions globally available
window.openNewTransactionModal = openNewTransactionModal;
window.closeNewTransactionModal = closeNewTransactionModal;
window.switchTransactionTab = switchTransactionTab;
window.submitTransactionDeposit = submitTransactionDeposit;
window.submitTransactionCheck = submitTransactionCheck;
window.submitTransactionFee = submitTransactionFee;
window.openAddEntityModal = openAddEntityModal;
window.closeAddEntityModal = closeAddEntityModal;
window.submitAddEntityForm = submitAddEntityForm;
