// =====================================================
// Reconcile Module
// =====================================================
// Dependencies: state, API_BASE, formatCurrency, showToast, loadAccounts

// State
if (!window._reconcileState) {
    window._reconcileState = {
        accountId: null,
        statementDate: null,
        endingBalance: 0,
        transactions: [],
        clearedIds: new Set(),
        history: []
    };
}
const reconcileState = window._reconcileState;

// =====================================================
// Main Functions
// =====================================================

async function loadReconcilePage() {
    // Populate account dropdown - only bank accounts (checking, savings, credit_card)
    const accountSelect = document.getElementById('reconcile-account');
    if (accountSelect && state.accounts) {
        accountSelect.innerHTML = '<option value="">-- Select Account --</option>';
        // Filter to only show bank accounts, not client ledgers
        const bankAccountTypes = ['checking', 'savings', 'credit_card', 'bank'];
        const bankAccounts = state.accounts.filter(acc =>
            bankAccountTypes.includes(acc.account_type?.toLowerCase())
        );
        bankAccounts.forEach(acc => {
            accountSelect.innerHTML += `<option value="${acc.id}">${acc.account_name}</option>`;
        });
    }

    // Set default date to today
    const dateInput = document.getElementById('reconcile-statement-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Load reconciliation history
    await loadReconcileHistory();
}

async function loadReconcileHistory() {
    try {
        const response = await fetch(`${API_BASE}/reconciliations.php?user_id=${state.currentUser}`);
        const result = await response.json();

        if (result.success) {
            reconcileState.history = result.data || [];
            renderReconcileHistory();
        }
    } catch (error) {
        console.error('Error loading reconcile history:', error);
    }
}

function renderReconcileHistory() {
    const container = document.getElementById('reconcile-history-list');
    if (!container) return;

    if (reconcileState.history.length === 0) {
        container.innerHTML = '<div class="empty-state">No reconciliations completed yet</div>';
        return;
    }

    container.innerHTML = reconcileState.history.map(rec => `
        <div class="reconcile-history-item">
            <div class="reconcile-history-info">
                <span class="reconcile-history-account">${rec.account_name || 'Account'}</span>
                <span class="reconcile-history-date">Reconciled ${new Date(rec.reconciled_date).toLocaleDateString()}</span>
            </div>
            <div class="reconcile-history-details">
                <span class="reconcile-history-balance">${formatCurrency(rec.statement_balance)}</span>
                <span class="reconcile-history-count">${rec.transaction_count || 0} items</span>
            </div>
        </div>
    `).join('');
}

function loadReconcileAccount() {
    const accountId = document.getElementById('reconcile-account')?.value;
    if (!accountId) return;

    reconcileState.accountId = accountId;

    // Find the selected account
    const account = state.accounts.find(a => a.id == accountId);
    if (account) {
        // Pre-fill ending balance with current account balance
        const balanceInput = document.getElementById('reconcile-ending-balance');
        if (balanceInput) {
            balanceInput.value = account.current_balance || 0;
        }
    }
}

async function startReconciliation() {
    const accountEl = document.getElementById('reconcile-account');
    const dateEl = document.getElementById('reconcile-statement-date');
    const balanceEl = document.getElementById('reconcile-ending-balance');

    const accountId = accountEl?.value;
    let statementDate = dateEl?.value?.trim() || '';
    const endingBalance = parseFloat(balanceEl?.value) || 0;


    if (!accountId) {
        showToast('Please select an account', 'warning');
        return;
    }

    // Check for empty or whitespace-only date
    if (!statementDate || statementDate === '') {
        // Try to set today's date if element exists
        if (dateEl) {
            const today = new Date().toISOString().split('T')[0];
            dateEl.value = today;
            statementDate = today;
        }
        // Final check
        if (!statementDate || statementDate === '') {
            showToast('Please select a statement date', 'warning');
            return;
        }
    }

    // Use the validated date
    const finalDate = statementDate;

    reconcileState.accountId = accountId;
    reconcileState.statementDate = finalDate;
    reconcileState.endingBalance = endingBalance;
    reconcileState.clearedIds = new Set();

    // Load transactions for reconciliation
    try {
        const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&account_id=${accountId}&end_date=${finalDate}&is_reconciled=0&limit=1000`);
        const result = await response.json();

        if (result.success) {
            reconcileState.transactions = result.data.transactions || [];
            showReconcileTransactions();
            updateReconcileSummary();
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Failed to load transactions', 'error');
    }
}

function updateReconcileFilters() {
    // Reload transactions when filters change
    if (reconcileState.accountId) {
        startReconciliation();
    }
}

function showReconcileTransactions() {
    const summaryEl = document.getElementById('reconcile-summary');
    const transactionsEl = document.getElementById('reconcile-transactions');
    if (summaryEl) summaryEl.style.display = 'block';
    if (transactionsEl) transactionsEl.style.display = 'block';

    // Update statement balance display
    const stmtBalance = document.getElementById('stmt-balance');
    if (stmtBalance) stmtBalance.textContent = formatCurrency(reconcileState.endingBalance);

    // Separate deposits and payments
    const deposits = reconcileState.transactions.filter(t => t.amount > 0);
    const payments = reconcileState.transactions.filter(t => t.amount <= 0);

    // Update counts
    const depositsCount = document.getElementById('deposits-count');
    const paymentsCount = document.getElementById('payments-count');
    if (depositsCount) depositsCount.textContent = deposits.length;
    if (paymentsCount) paymentsCount.textContent = payments.length;

    // Render lists
    renderReconcileList('deposits-list', deposits, true);
    renderReconcileList('payments-list', payments, false);
}

function renderReconcileList(containerId, transactions, isDeposit) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (transactions.length === 0) {
        container.innerHTML = `<div class="empty-state">No ${isDeposit ? 'deposits' : 'payments'} to reconcile</div>`;
        return;
    }

    container.innerHTML = transactions.map(t => {
        const isCleared = reconcileState.clearedIds.has(t.id);
        return `
            <div class="reconcile-item ${isCleared ? 'cleared' : ''}" data-id="${t.id}" onclick="toggleReconcileItem(${t.id})">
                <div class="checkbox">${isCleared ? '✔' : ''}</div>
                <div class="date">${new Date(t.transaction_date).toLocaleDateString()}</div>
                <div class="description">
                    <div class="vendor">${t.vendor_name || t.description || 'Transaction'}</div>
                    <div class="category">${t.category_name || 'Uncategorized'}</div>
                </div>
                <div class="amount ${t.amount > 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(Math.abs(t.amount))}
                </div>
            </div>
        `;
    }).join('');

    // Update total
    const totalId = isDeposit ? 'deposits-total' : 'payments-total';
    const clearedTransactions = transactions.filter(t => reconcileState.clearedIds.has(t.id));
    const total = clearedTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalEl = document.getElementById(totalId);
    if (totalEl) totalEl.textContent = formatCurrency(total);
}

function toggleReconcileItem(transactionId) {
    if (reconcileState.clearedIds.has(transactionId)) {
        reconcileState.clearedIds.delete(transactionId);
    } else {
        reconcileState.clearedIds.add(transactionId);
    }

    // Re-render lists with updated state
    const deposits = reconcileState.transactions.filter(t => t.amount > 0);
    const payments = reconcileState.transactions.filter(t => t.amount <= 0);
    renderReconcileList('deposits-list', deposits, true);
    renderReconcileList('payments-list', payments, false);

    updateReconcileSummary();
}

function updateReconcileSummary() {
    // Calculate cleared balance
    const clearedTransactions = reconcileState.transactions.filter(t => reconcileState.clearedIds.has(t.id));
    const clearedBalance = clearedTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Get account's beginning balance (simplified - using 0 for now)
    const beginningBalance = 0;
    const calculatedBalance = beginningBalance + clearedBalance;

    const clearedBalanceEl = document.getElementById('cleared-balance');
    if (clearedBalanceEl) clearedBalanceEl.textContent = formatCurrency(calculatedBalance);

    const difference = reconcileState.endingBalance - calculatedBalance;
    const diffElement = document.getElementById('reconcile-difference');
    if (diffElement) {
        diffElement.textContent = formatCurrency(difference);

        // Update highlight styling based on balance
        const diffContainer = diffElement.closest('.reconcile-summary-item');
        if (diffContainer) {
            diffContainer.classList.toggle('balanced', Math.abs(difference) < 0.01);
            diffContainer.classList.toggle('unbalanced', Math.abs(difference) >= 0.01);
        }
    }

    // Update progress
    const total = reconcileState.transactions.length;
    const cleared = reconcileState.clearedIds.size;
    const progressPercent = total > 0 ? (cleared / total) * 100 : 0;

    const progressFill = document.getElementById('reconcile-progress-fill');
    const progressText = document.getElementById('reconcile-progress-text');
    if (progressFill) progressFill.style.width = `${progressPercent}%`;
    if (progressText) progressText.textContent = `${cleared} of ${total} items cleared`;
}

function switchReconcileTab(tabName) {
    document.querySelectorAll('.reconcile-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.reconcile-list').forEach(l => l.classList.remove('active'));

    document.querySelector(`.reconcile-tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`reconcile-${tabName}`)?.classList.add('active');
}

function selectAllReconcile() {
    reconcileState.transactions.forEach(t => reconcileState.clearedIds.add(t.id));

    const deposits = reconcileState.transactions.filter(t => t.amount > 0);
    const payments = reconcileState.transactions.filter(t => t.amount <= 0);
    renderReconcileList('deposits-list', deposits, true);
    renderReconcileList('payments-list', payments, false);
    updateReconcileSummary();
}

function clearAllReconcile() {
    reconcileState.clearedIds.clear();

    const deposits = reconcileState.transactions.filter(t => t.amount > 0);
    const payments = reconcileState.transactions.filter(t => t.amount <= 0);
    renderReconcileList('deposits-list', deposits, true);
    renderReconcileList('payments-list', payments, false);
    updateReconcileSummary();
}

function filterReconcileTransactions() {
    const search = document.getElementById('reconcile-search')?.value?.toLowerCase() || '';

    const filtered = reconcileState.transactions.filter(t => {
        const vendor = (t.vendor_name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category_name || '').toLowerCase();
        return vendor.includes(search) || desc.includes(search) || cat.includes(search);
    });

    const deposits = filtered.filter(t => t.amount > 0);
    const payments = filtered.filter(t => t.amount <= 0);
    renderReconcileList('deposits-list', deposits, true);
    renderReconcileList('payments-list', payments, false);
}

async function finishReconciliation() {
    const difference = reconcileState.endingBalance - reconcileState.transactions
        .filter(t => reconcileState.clearedIds.has(t.id))
        .reduce((sum, t) => sum + t.amount, 0);

    if (Math.abs(difference) >= 0.01) {
        if (!confirm(`The difference is ${formatCurrency(difference)}. Are you sure you want to finish with this difference?`)) {
            return;
        }
    }

    if (reconcileState.clearedIds.size === 0) {
        showToast('No transactions selected to reconcile', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reconciliations.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser,
                account_id: reconcileState.accountId,
                statement_date: reconcileState.statementDate,
                statement_balance: reconcileState.endingBalance,
                transaction_ids: Array.from(reconcileState.clearedIds)
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Reconciliation completed successfully!', 'success');

            // Reset state
            reconcileState.clearedIds.clear();
            reconcileState.transactions = [];
            const summaryEl = document.getElementById('reconcile-summary');
            const transactionsEl = document.getElementById('reconcile-transactions');
            if (summaryEl) summaryEl.style.display = 'none';
            if (transactionsEl) transactionsEl.style.display = 'none';

            // Reload history
            await loadReconcileHistory();

            // Reload accounts to update balances
            if (typeof loadAccounts === 'function') {
                await loadAccounts();
            }
        } else {
            showToast(result.error || 'Failed to complete reconciliation', 'error');
        }
    } catch (error) {
        console.error('Error finishing reconciliation:', error);
        showToast('Failed to complete reconciliation', 'error');
    }
}

async function undoLastReconcile() {
    if (reconcileState.history.length === 0) {
        showToast('No reconciliations to undo', 'warning');
        return;
    }

    const lastReconcile = reconcileState.history[0];
    if (!confirm(`Undo reconciliation for ${lastReconcile.account_name} on ${new Date(lastReconcile.reconciled_date).toLocaleDateString()}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reconciliations.php?id=${lastReconcile.id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showToast('Reconciliation undone', 'success');
            await loadReconcileHistory();
        } else {
            showToast(result.error || 'Failed to undo', 'error');
        }
    } catch (error) {
        console.error('Error undoing reconciliation:', error);
        showToast('Failed to undo reconciliation', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadReconcilePage = loadReconcilePage;
window.loadReconcileAccount = loadReconcileAccount;
window.startReconciliation = startReconciliation;
window.toggleReconcileItem = toggleReconcileItem;
window.switchReconcileTab = switchReconcileTab;
window.selectAllReconcile = selectAllReconcile;
window.clearAllReconcile = clearAllReconcile;
window.filterReconcileTransactions = filterReconcileTransactions;
window.finishReconciliation = finishReconciliation;
window.undoLastReconcile = undoLastReconcile;
window.updateReconcileFilters = updateReconcileFilters;
