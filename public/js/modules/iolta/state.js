// =====================================================
// IOLTA State Management
// Single source of truth for all IOLTA data
// =====================================================

const IoltaState = {
    // Data
    trustAccounts: [],
    clients: [],
    ledgers: [],
    transactions: [],      // QuickBooks transactions (posted)
    staging: {
        records: [],       // All staging records
        unassigned: [],    // Unassigned staging (for General/Unassigned view)
        summary: {
            total: { count: 0, net: 0 },
            unassigned: { count: 0, net: 0 },
            reconciled: { count: 0, net: 0 }
        }
    },

    // UI State
    selectedClientId: null,
    selectedLedgerId: null,
    currentView: 'clients',  // clients, ledger, staging, reconcile

    // Filters
    filters: {
        clientSearch: '',
        transactionSearch: '',
        dateRange: { start: null, end: null }
    },

    // Selection (for bulk operations)
    selection: {
        transactions: new Set(),
        staging: new Set()
    },

    // Cache
    _loaded: {
        accounts: false,
        clients: false,
        ledgers: false,
        transactions: false,
        staging: false
    },

    // =====================================================
    // Getters
    // =====================================================

    // Bank Balance = Staging Total (Source of Truth)
    getBankBalance() {
        return this.staging.summary.total?.net || 0;
    },

    // Book Balance = QuickBooks Total
    getBookBalance() {
        return this.transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    },

    // Unassigned Balance (staging not yet assigned to clients)
    getUnassignedBalance() {
        return this.staging.summary.unassigned?.net || 0;
    },

    // Get client by ID
    getClient(clientId) {
        return this.clients.find(c => c.id == clientId);
    },

    // Get General/Unassigned client
    getGeneralUnassignedClient() {
        return this.clients.find(c => c.client_name === 'General/Unassigned');
    },

    // Get client balance (ledger balance + staging unassigned if General/Unassigned)
    getClientBalance(clientId) {
        const client = this.getClient(clientId);
        if (!client) return 0;

        const ledgerBalance = this.ledgers
            .filter(l => l.client_id == clientId)
            .reduce((sum, l) => sum + parseFloat(l.current_balance || 0), 0);

        // Add staging unassigned for General/Unassigned client
        if (client.client_name === 'General/Unassigned') {
            return ledgerBalance + this.getUnassignedBalance();
        }

        return ledgerBalance;
    },

    // Get transactions for a client
    getClientTransactions(clientId) {
        const client = this.getClient(clientId);
        if (!client) return [];

        // For General/Unassigned, return staging unassigned
        if (client.client_name === 'General/Unassigned') {
            return this.staging.unassigned.map(s => ({
                id: 'staging_' + s.id,
                staging_id: s.id,
                transaction_date: s.transaction_date,
                amount: parseFloat(s.amount),
                description: s.description,
                reference_number: s.reference_number,
                is_staging: true,
                status: 'unassigned'
            }));
        }

        // For regular clients, return transactions from their ledgers
        const clientLedgerIds = this.ledgers
            .filter(l => l.client_id == clientId)
            .map(l => parseInt(l.id));

        return this.transactions.filter(tx => clientLedgerIds.includes(parseInt(tx.ledger_id)));
    },

    // Get all transactions (for All Clients view)
    getAllTransactions() {
        return this.transactions;
    },

    // =====================================================
    // Setters
    // =====================================================

    setTrustAccounts(accounts) {
        this.trustAccounts = accounts || [];
        this._loaded.accounts = true;
    },

    setClients(clients) {
        this.clients = clients || [];
        this._loaded.clients = true;
    },

    setLedgers(ledgers) {
        this.ledgers = ledgers || [];
        this._loaded.ledgers = true;
    },

    setTransactions(transactions) {
        this.transactions = transactions || [];
        this._loaded.transactions = true;
    },

    setStagingRecords(records) {
        this.staging.records = records || [];
        this._loaded.staging = true;
    },

    setStagingUnassigned(records) {
        this.staging.unassigned = records || [];
    },

    setStagingSummary(summary) {
        this.staging.summary = summary || {
            total: { count: 0, net: 0 },
            unassigned: { count: 0, net: 0 },
            reconciled: { count: 0, net: 0 }
        };
    },

    // =====================================================
    // Selection Management
    // =====================================================

    toggleTransactionSelection(txId) {
        if (this.selection.transactions.has(txId)) {
            this.selection.transactions.delete(txId);
        } else {
            this.selection.transactions.add(txId);
        }
    },

    selectAllTransactions(txIds) {
        txIds.forEach(id => this.selection.transactions.add(id));
    },

    clearTransactionSelection() {
        this.selection.transactions.clear();
    },

    toggleStagingSelection(stagingId) {
        if (this.selection.staging.has(stagingId)) {
            this.selection.staging.delete(stagingId);
        } else {
            this.selection.staging.add(stagingId);
        }
    },

    clearStagingSelection() {
        this.selection.staging.clear();
    },

    // =====================================================
    // Reset
    // =====================================================

    reset() {
        this.trustAccounts = [];
        this.clients = [];
        this.ledgers = [];
        this.transactions = [];
        this.staging = {
            records: [],
            unassigned: [],
            summary: { total: { count: 0, net: 0 }, unassigned: { count: 0, net: 0 }, reconciled: { count: 0, net: 0 } }
        };
        this.selectedClientId = null;
        this.selectedLedgerId = null;
        this.selection.transactions.clear();
        this.selection.staging.clear();
        Object.keys(this._loaded).forEach(k => this._loaded[k] = false);
    },

    // Check if data needs loading
    needsLoad(dataType) {
        return !this._loaded[dataType];
    }
};

// Export for use in other modules
window.IoltaState = IoltaState;
