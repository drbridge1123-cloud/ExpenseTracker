// =====================================================
// IOLTA UI Logic
// Event handlers and view rendering
// =====================================================

const IoltaUI = {
    // Current state
    currentFilter: 'all',  // 'all' or client ID
    searchTerm: '',

    // =====================================================
    // Initialization
    // =====================================================

    async init() {
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        const dateInputs = document.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => {
            if (!input.value) input.value = today;
        });

        // Load initial data
        await this.loadData();

        // Render initial view
        this.renderClientSidebar();
        this.renderTransactionList();
    },

    // =====================================================
    // Data Loading
    // =====================================================

    async loadData() {
        const userId = this.getUserId();

        try {
            // Load in parallel
            const [clients, ledgers, transactions, stagingData] = await Promise.all([
                IoltaApi.loadClients(userId),
                IoltaApi.loadLedgers(userId),
                IoltaApi.loadAllTransactions(userId),
                IoltaApi.loadStaging(userId)
            ]);

            // Update new state
            IoltaState.setClients(clients);
            IoltaState.setLedgers(ledgers);
            IoltaState.setTransactions(transactions);
            IoltaState.setStagingRecords(stagingData.staging || []);
            IoltaState.setStagingSummary(stagingData.summary || {});

            // Load unassigned staging separately for General/Unassigned view
            const unassignedData = await IoltaApi.loadStagingUnassigned(userId);
            IoltaState.setStagingUnassigned(unassignedData.staging || []);

            // Sync with legacy ioltaState (for backward compatibility)
            if (typeof ioltaState !== 'undefined') {
                ioltaState.clients = clients;
                ioltaState.ledgers = ledgers;
                ioltaState.transactions = transactions;
                ioltaState.allTransactions = transactions;
                ioltaState.stagingTotal = stagingData.summary?.total?.net || 0;
                ioltaState.stagingUnassignedTotal = stagingData.summary?.unassigned?.net || 0;
                ioltaState.stagingUnassignedTransactions = unassignedData.staging || [];
            }

        } catch (error) {
            console.error('Failed to load IOLTA data:', error);
            showToast('Failed to load data', 'error');
        }
    },

    async refreshData() {
        IoltaState.reset();
        await this.loadData();
        this.renderClientSidebar();
        this.renderTransactionList();
    },

    // =====================================================
    // Client Sidebar
    // =====================================================

    renderClientSidebar() {
        const container = document.getElementById('ledger-client-sidebar');
        if (!container) return;

        const clients = IoltaState.clients;
        const bankBalance = IoltaState.getBankBalance();

        // Filter clients by search term
        let filteredClients = clients;
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filteredClients = clients.filter(c =>
                c.client_name.toLowerCase().includes(term) ||
                (c.client_number && c.client_number.toLowerCase().includes(term))
            );
        }

        // Calculate balances and sort by client_number (CASE #) descending
        const clientsWithBalance = filteredClients.map(client => ({
            ...client,
            balance: IoltaState.getClientBalance(client.id)
        })).sort((a, b) => {
            const caseA = a.client_number || '0';
            const caseB = b.client_number || '0';
            return caseB.localeCompare(caseA, undefined, { numeric: true });
        });

        // Build HTML
        let html = '';

        // All Clients item
        html += IoltaComponents.allClientsItem(bankBalance, clients.length, this.currentFilter === 'all');

        // Client list
        if (clientsWithBalance.length === 0 && this.searchTerm) {
            html += IoltaComponents.emptyState('🔍', 'No clients found');
        } else {
            clientsWithBalance.forEach(client => {
                html += IoltaComponents.clientListItem(
                    client,
                    client.balance,
                    this.currentFilter == client.id
                );
            });
        }

        container.innerHTML = html;

        // Update header
        this.updateHeader();
    },

    // =====================================================
    // Transaction List
    // =====================================================

    renderTransactionList() {
        const container = document.getElementById('ledger-transactions-list');
        if (!container) return;

        let transactions;
        let showClientName = false;
        let balanceLabel = 'Balance';

        if (this.currentFilter === 'all') {
            // All clients view - show all transactions
            transactions = IoltaState.getAllTransactions();
            showClientName = true;
            balanceLabel = 'Client Bal';
        } else {
            // Single client view
            transactions = IoltaState.getClientTransactions(this.currentFilter);
        }

        // Sort by date descending
        transactions = [...transactions].sort((a, b) => {
            const dateCompare = new Date(b.transaction_date) - new Date(a.transaction_date);
            if (dateCompare !== 0) return dateCompare;
            return (b.id || 0) - (a.id || 0);
        });

        // Empty state
        if (transactions.length === 0) {
            container.innerHTML = IoltaComponents.emptyState(
                '📄',
                'No Transactions',
                this.currentFilter !== 'all' ? 'No transactions for this client' : 'No transactions yet'
            );
            return;
        }

        // Build HTML (header is already in HTML, don't add it again)
        let html = '';

        transactions.forEach((tx, index) => {
            // Get client name for "All Clients" view
            let clientName = '';
            if (showClientName && !tx.is_staging) {
                const ledger = IoltaState.ledgers.find(l => l.id == tx.ledger_id);
                const client = ledger ? IoltaState.getClient(ledger.client_id) : null;
                clientName = client ? client.client_name : 'Unknown';
            } else if (tx.is_staging) {
                clientName = 'Unassigned';
            }

            html += IoltaComponents.transactionRow(tx, {
                showClientName,
                showCheckbox: true,
                isSelected: IoltaState.selection.transactions.has(String(tx.id)),
                index,
                clientName
            });
        });

        container.innerHTML = html;

        // Store for reference
        this._currentTransactions = transactions;
    },

    // =====================================================
    // Header Update
    // =====================================================

    updateHeader() {
        const nameEl = document.getElementById('ledger-selected-client-name');
        const matterEl = document.getElementById('ledger-selected-client-matter');
        const balanceEl = document.getElementById('ledger-selected-balance-amount');

        if (!nameEl) return;

        if (this.currentFilter === 'all') {
            nameEl.textContent = 'All Clients';
            if (matterEl) matterEl.textContent = `${IoltaState.clients.length} clients`;
            if (balanceEl) {
                const balance = IoltaState.getBankBalance();
                balanceEl.textContent = IoltaComponents.formatCurrency(balance);
                balanceEl.style.color = balance >= 0 ? '#10b981' : '#ef4444';
            }
        } else {
            const client = IoltaState.getClient(this.currentFilter);
            if (client) {
                nameEl.textContent = client.client_name;
                if (matterEl) matterEl.textContent = client.matter_number || '';
                if (balanceEl) {
                    const balance = IoltaState.getClientBalance(this.currentFilter);
                    balanceEl.textContent = IoltaComponents.formatCurrency(balance);
                    balanceEl.style.color = balance >= 0 ? '#10b981' : '#ef4444';
                }
            }
        }
    },

    // =====================================================
    // Selection
    // =====================================================

    selectClient(clientId) {
        this.currentFilter = clientId;
        IoltaState.clearTransactionSelection();
        this.renderClientSidebar();
        this.renderTransactionList();
        this.updateActionBar();
    },

    filterClients(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        this.renderClientSidebar();
    },

    toggleTxSelection(txId, event) {
        if (event) event.stopPropagation();
        IoltaState.toggleTransactionSelection(txId);
        this.renderTransactionList();
        this.updateActionBar();
    },

    toggleSelectAll(checked) {
        if (checked && this._currentTransactions) {
            IoltaState.selectAllTransactions(this._currentTransactions.map(tx => tx.id));
        } else {
            IoltaState.clearTransactionSelection();
        }
        this.renderTransactionList();
        this.updateActionBar();
    },

    // =====================================================
    // Action Bar
    // =====================================================

    updateActionBar() {
        let actionBar = document.getElementById('ledger-action-bar');
        const selectedCount = IoltaState.selection.transactions.size;

        if (selectedCount === 0) {
            if (actionBar) actionBar.remove();
            return;
        }

        if (!actionBar) {
            actionBar = document.createElement('div');
            actionBar.id = 'ledger-action-bar';
            actionBar.style.cssText = 'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; padding: 12px 24px; border-radius: 8px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000;';
            document.body.appendChild(actionBar);
        }

        actionBar.innerHTML = `
            <span style="font-size: 14px; font-weight: 500;">${selectedCount} selected</span>
            <button onclick="IoltaUI.openMoveModal()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">Move</button>
            <button onclick="IoltaUI.deleteSelected()" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">Delete</button>
            <button onclick="IoltaUI.clearSelection()" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">Cancel</button>
        `;
    },

    clearSelection() {
        IoltaState.clearTransactionSelection();
        this.renderTransactionList();
        this.updateActionBar();
    },

    // =====================================================
    // Actions
    // =====================================================

    async deleteSelected() {
        const selectedIds = Array.from(IoltaState.selection.transactions);
        if (selectedIds.length === 0) return;

        if (!confirm(`Delete ${selectedIds.length} transaction(s)?`)) return;

        try {
            // Separate staging and regular transactions
            const stagingIds = selectedIds.filter(id => String(id).startsWith('staging_')).map(id => id.replace('staging_', ''));
            const txIds = selectedIds.filter(id => !String(id).startsWith('staging_'));

            if (txIds.length > 0) {
                await IoltaApi.bulkDeleteTransactions(txIds, this.getUserId());
            }
            if (stagingIds.length > 0) {
                await IoltaApi.deleteStaging(stagingIds, this.getUserId());
            }

            showToast('Deleted successfully');
            await this.refreshData();
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('Delete failed', 'error');
        }
    },

    openMoveModal() {
        const selectedIds = Array.from(IoltaState.selection.transactions);
        if (selectedIds.length === 0) {
            showToast('Please select transactions to move', 'warning');
            return;
        }

        const clients = IoltaState.clients || [];

        let modal = document.getElementById('iolta-move-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'iolta-move-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; justify-content: center; align-items: center;" onclick="IoltaUI.closeMoveModal()">
                <div style="width: 500px; max-width: 95%; max-height: 80vh; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);" onclick="event.stopPropagation()">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                        <h3 style="margin: 0; color: white; font-size: 18px;">Move ${selectedIds.length} Transaction(s) to Client</h3>
                    </div>
                    <div style="padding: 20px;">
                        <div style="margin-bottom: 16px;">
                            <input type="text" id="iolta-move-search" placeholder="Search clients..."
                                   oninput="IoltaUI.filterMoveClients(this.value)"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div id="iolta-move-client-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                            ${this._renderMoveClientList(clients)}
                        </div>
                    </div>
                    <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="IoltaUI.closeMoveModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    },

    _renderMoveClientList(clients) {
        return clients.map(c => `
            <div class="move-client-option" onclick="IoltaUI.moveToClient(${c.id})"
                 data-client-id="${c.id}"
                 style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
                <div>
                    <div style="font-weight: 500; color: #1e293b;">${IoltaComponents.escapeHtml(c.client_name)}</div>
                    <div style="font-size: 12px; color: #64748b;">${c.matter_number || c.client_number || ''}</div>
                </div>
            </div>
        `).join('');
    },

    filterMoveClients(searchTerm) {
        const clients = IoltaState.clients || [];
        const filtered = clients.filter(c =>
            c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.matter_number && c.matter_number.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        const list = document.getElementById('iolta-move-client-list');
        if (list) {
            list.innerHTML = this._renderMoveClientList(filtered);
        }
    },

    closeMoveModal() {
        const modal = document.getElementById('iolta-move-modal');
        if (modal) modal.remove();
    },

    async moveToClient(targetClientId) {
        const selectedIds = Array.from(IoltaState.selection.transactions);
        if (selectedIds.length === 0) return;

        if (!confirm(`Move ${selectedIds.length} transaction(s) to this client?`)) return;

        try {
            // Separate staging and regular transactions
            const stagingIds = selectedIds
                .filter(id => String(id).startsWith('staging_'))
                .map(id => String(id).replace('staging_', ''));
            const txIds = selectedIds
                .filter(id => !String(id).startsWith('staging_'))
                .map(id => parseInt(id));

            let movedCount = 0;

            // Move staging records (assign to client)
            if (stagingIds.length > 0) {
                const stagingResult = await IoltaApi.assignStaging(stagingIds, targetClientId, this.getUserId());
                if (stagingResult.success) {
                    movedCount += stagingIds.length;
                }
            }

            // Move trust transactions
            if (txIds.length > 0) {
                const txResult = await apiPost('/trust/transactions.php', {
                    action: 'move_to_client',
                    user_id: this.getUserId(),
                    transaction_ids: txIds,
                    target_client_id: targetClientId
                });
                if (txResult.success) {
                    movedCount += txResult.data?.moved || txIds.length;
                }
            }

            if (movedCount > 0) {
                showToast(`Moved ${movedCount} transaction(s) successfully`, 'success');
                this.closeMoveModal();
                IoltaState.clearTransactionSelection();
                await this.refreshData();
            } else {
                showToast('No transactions were moved', 'warning');
            }
        } catch (error) {
            console.error('Error moving transactions:', error);
            showToast('Error moving transactions', 'error');
        }
    },

    // =====================================================
    // Utility
    // =====================================================

    getUserId() {
        return window.state?.currentUser || localStorage.getItem('currentUser') || 1;
    }
};

// Export
window.IoltaUI = IoltaUI;
