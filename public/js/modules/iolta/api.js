// =====================================================
// IOLTA API Module
// Centralized API calls for trust accounting
// =====================================================

const IoltaApi = {
    // =====================================================
    // Trust Accounts
    // =====================================================

    async loadAccounts(userId) {
        const data = await apiGet('/accounts/index.php', {
            user_id: userId,
            type: 'bank'
        });
        return data.success ? data.data.accounts : [];
    },

    // =====================================================
    // Clients
    // =====================================================

    async loadClients(userId) {
        const data = await apiGet('/trust/clients.php', { user_id: userId });
        return data.success ? data.data.clients : [];
    },

    async createClient(clientData) {
        return await apiPost('/trust/clients.php', clientData);
    },

    async updateClient(clientId, clientData) {
        return await apiPut(`/trust/clients.php?id=${clientId}`, clientData);
    },

    async deleteClient(clientId) {
        return await apiDelete(`/trust/clients.php?id=${clientId}`);
    },

    // =====================================================
    // Ledgers
    // =====================================================

    async loadLedgers(userId) {
        const data = await apiGet('/trust/ledger.php', { user_id: userId });
        return data.success ? data.data.ledgers : [];
    },

    async createLedger(ledgerData) {
        return await apiPost('/trust/ledger.php', ledgerData);
    },

    async updateLedger(ledgerId, ledgerData) {
        return await apiPut(`/trust/ledger.php?id=${ledgerId}`, ledgerData);
    },

    // =====================================================
    // Transactions (QuickBooks/Posted)
    // =====================================================

    async loadTransactions(userId, filters = {}) {
        const params = { user_id: userId, ...filters };
        const data = await apiGet('/trust/transactions.php', params);
        return data.success ? data.data.transactions : [];
    },

    async loadAllTransactions(userId) {
        const data = await apiGet('/trust/transactions.php', {
            user_id: userId,
            all: 1
        });
        return data.success ? data.data.transactions : [];
    },

    async createTransaction(transactionData) {
        return await apiPost('/trust/transactions.php', transactionData);
    },

    async updateTransaction(transactionId, transactionData) {
        return await apiPut(`/trust/transactions.php?id=${transactionId}`, transactionData);
    },

    async deleteTransaction(transactionId) {
        return await apiDelete(`/trust/transactions.php?id=${transactionId}`);
    },

    async bulkDeleteTransactions(transactionIds, userId) {
        return await apiPost('/trust/transactions.php', {
            action: 'bulk_delete',
            user_id: userId,
            ids: transactionIds
        });
    },

    async moveTransactions(transactionIds, targetLedgerId, userId) {
        return await apiPost('/trust/transactions.php', {
            action: 'bulk_move',
            user_id: userId,
            ids: transactionIds,
            target_ledger_id: targetLedgerId
        });
    },

    // =====================================================
    // Staging (Bank CSV Import)
    // =====================================================

    async loadStaging(userId, status = null) {
        const params = { user_id: userId };
        if (status) params.status = status;
        const data = await apiGet('/trust/staging.php', params);
        return data.success ? data.data : { staging: [], summary: {} };
    },

    async loadStagingUnassigned(userId) {
        const data = await apiGet('/trust/staging.php', {
            user_id: userId,
            status: 'unassigned'
        });
        return data.success ? data.data : { staging: [], summary: {} };
    },

    async importStaging(formData) {
        // FormData for file upload
        return await fetch('/expensetracker/api/v1/trust/staging.php', {
            method: 'POST',
            body: formData
        }).then(r => r.json());
    },

    async assignStaging(stagingIds, clientId, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'assign',
            user_id: userId,
            ids: stagingIds,
            client_id: clientId
        });
    },

    async unassignStaging(stagingIds, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'unassign',
            user_id: userId,
            ids: stagingIds
        });
    },

    async unpostStaging(stagingIds, userId, targetStatus = 'assigned') {
        return await apiPost('/trust/staging.php', {
            action: 'unpost',
            user_id: userId,
            ids: stagingIds,
            target_status: targetStatus
        });
    },

    async postStaging(stagingIds, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'post',
            user_id: userId,
            ids: stagingIds
        });
    },

    async deleteStaging(stagingIds, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'delete',
            user_id: userId,
            ids: stagingIds
        });
    },

    // =====================================================
    // Matching (Bank Reconciliation Style)
    // =====================================================

    async findMatches(stagingId, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'find_matches',
            staging_id: stagingId,
            user_id: userId
        });
    },

    async matchTransaction(stagingId, transactionId, userId) {
        return await apiPost('/trust/staging.php', {
            action: 'match',
            staging_id: stagingId,
            transaction_id: transactionId,
            user_id: userId
        });
    },

    // =====================================================
    // Reconciliation
    // =====================================================

    async loadReconciliation(userId, accountId) {
        const data = await apiGet('/trust/reconcile.php', {
            user_id: userId,
            account_id: accountId
        });
        return data.success ? data.data : null;
    },

    async saveReconciliation(reconcileData) {
        return await apiPost('/trust/reconcile.php', reconcileData);
    },

    // =====================================================
    // Reports
    // =====================================================

    async loadBalanceSummary(userId, accountId) {
        const data = await apiGet('/trust/reports.php', {
            user_id: userId,
            account_id: accountId,
            type: 'balance_summary'
        });
        return data.success ? data.data : null;
    },

    async loadClientStatement(userId, clientId, startDate, endDate) {
        const data = await apiGet('/trust/reports.php', {
            user_id: userId,
            client_id: clientId,
            start_date: startDate,
            end_date: endDate,
            type: 'client_statement'
        });
        return data.success ? data.data : null;
    },

    // =====================================================
    // Checks
    // =====================================================

    async loadPendingChecks(userId, accountId) {
        const data = await apiGet('/checks/print-queue.php', {
            user_id: userId,
            account_id: accountId,
            status: 'pending'
        });
        return data.success ? data.data : [];
    },

    async printChecks(checkIds) {
        return await apiPost('/checks/print-queue.php', {
            action: 'print',
            ids: checkIds
        });
    },

    // =====================================================
    // Batch Deposits (QuickBooks Style)
    // =====================================================

    async loadBatches(userId, status = null) {
        const params = { user_id: userId, include_items: 1 };
        if (status) params.status = status;
        const data = await apiGet('/trust/batch-deposits.php', params);
        return data.success ? data.data.batches : [];
    },

    async loadBatch(batchId) {
        const data = await apiGet('/trust/batch-deposits.php', { id: batchId });
        return data.success ? data.data.batch : null;
    },

    async createBatch(batchData) {
        return await apiPost('/trust/batch-deposits.php', {
            action: 'create_batch',
            ...batchData
        });
    },

    async addBatchItem(batchId, itemData) {
        return await apiPost('/trust/batch-deposits.php', {
            action: 'add_item',
            batch_id: batchId,
            ...itemData
        });
    },

    async addBatchItems(batchId, items) {
        return await apiPost('/trust/batch-deposits.php', {
            action: 'add_items',
            batch_id: batchId,
            items: items
        });
    },

    async updateBatchItem(itemId, itemData) {
        return await apiPut(`/trust/batch-deposits.php?item_id=${itemId}`, itemData);
    },

    async deleteBatchItem(itemId) {
        return await apiDelete(`/trust/batch-deposits.php?item_id=${itemId}`);
    },

    async postBatch(batchId, userId) {
        return await apiPost('/trust/batch-deposits.php', {
            action: 'post',
            batch_id: batchId,
            user_id: userId
        });
    },

    async deleteBatch(batchId) {
        return await apiDelete(`/trust/batch-deposits.php?id=${batchId}`);
    },

    async createBatchFromStaging(stagingId, items, userId) {
        return await apiPost('/trust/batch-deposits.php', {
            action: 'create_from_staging',
            staging_id: stagingId,
            items: items,
            user_id: userId
        });
    }
};

// Export
window.IoltaApi = IoltaApi;
