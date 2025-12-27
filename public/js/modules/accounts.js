// =====================================================
// Accounts Module
// =====================================================
// Dependencies: state, apiGet, apiPost, apiRequest, formatCurrency, formatDate,
//               showToast, openModal, closeModal, navigateTo

// =====================================================
// Main Functions
// =====================================================

async function loadAccounts() {
    // Get current account mode (personal, iolta, cost, general)
    const accountMode = typeof getAccountType === 'function' ? getAccountType() : 'personal';

    const data = await apiGet('/accounts/', {
        user_id: state.currentUser,
        account_mode: accountMode
    });

    if (data.success) {
        state.accounts = data.data.accounts;
        renderAccountsGrid();
    }

    // Setup add account button
    document.getElementById('add-account-btn').onclick = () => showAddAccountModal();
}

function renderAccountsGrid() {
    const grid = document.getElementById('accounts-grid');

    grid.innerHTML = state.accounts.map(acc => {
        const balance = parseFloat(acc.current_balance);
        const color = acc.color || '#6b7280';

        return `
            <div class="card account-card" onclick="showAccountDetailModal(${acc.id})" style="cursor: pointer;">
                <div class="account-card-header">
                    <div class="account-card-icon" style="background: ${color}20; color: ${color}">
                        ${getAccountIconHTML(acc.account_type)}
                    </div>
                    <div class="account-card-title">
                        <h4>${acc.account_name}</h4>
                        <span>${formatAccountTypeName(acc.account_type)}</span>
                    </div>
                    <button class="btn-icon account-edit-btn" onclick="event.stopPropagation(); showEditAccountModal(${acc.id})" title="Edit Account">
                        &#8942;
                    </button>
                </div>
                <div class="account-card-balance ${balance < 0 ? 'text-danger' : ''}">
                    ${formatCurrency(balance)}
                </div>
                <div class="account-card-stats">
                    <div>
                        <span class="account-stat-label">This Month Income</span>
                        <div class="text-success">${formatCurrency(acc.month_income)}</div>
                    </div>
                    <div>
                        <span class="account-stat-label">This Month Expenses</span>
                        <div class="text-danger">${formatCurrency(acc.month_expenses)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getAccountIconHTML(type) {
    const icons = {
        checking: '&#127974;',
        savings: '&#128176;',
        credit_card: '&#128179;',
        investment: '&#128200;',
        cash: '&#128181;',
        loan: '&#128178;',
        other: '&#128178;'
    };
    return icons[type] || icons.other;
}

function formatAccountTypeName(type) {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// =====================================================
// Add Account Modal
// =====================================================

function showAddAccountModal() {
    openModal('Add Account', `
        <form id="add-account-form">
            <div class="form-group">
                <label>Account Name</label>
                <input type="text" class="form-input" name="account_name" required>
            </div>
            <div class="form-group">
                <label>Account Type</label>
                <select class="form-select" name="account_type" required>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="investment">Investment</option>
                    <option value="cash">Cash</option>
                    <option value="loan">Loan</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Current Balance</label>
                <input type="number" class="form-input" name="current_balance" step="0.01" value="0">
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" name="color" value="#3b82f6">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Create Account</button>
        </form>
    `);

    document.getElementById('add-account-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const result = await apiPost('/accounts/', {
            user_id: state.currentUser,
            account_name: formData.get('account_name'),
            account_type: formData.get('account_type'),
            current_balance: parseFloat(formData.get('current_balance')),
            color: formData.get('color')
        });

        if (result.success) {
            showToast('Account created successfully', 'success');
            closeModal();
            await loadAccounts();
        } else {
            showToast('Error creating account', 'error');
        }
    };
}

// =====================================================
// Account Detail Modal
// =====================================================

async function showAccountDetailModal(accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return;

    const balance = parseFloat(account.current_balance);
    const color = account.color || '#6b7280';

    // Fetch recent transactions for this account
    const txnData = await apiGet('/transactions/', {
        user_id: state.currentUser,
        account_id: accountId,
        limit: 10
    });

    const recentTransactions = txnData.success ? txnData.data.transactions : [];

    openModal(`${account.account_name}`, `
        <div class="account-detail">
            <div class="account-detail-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);">
                <div class="account-detail-icon" style="width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: ${color}20; color: ${color}">
                    ${getAccountIconHTML(account.account_type)}
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; color: var(--text-secondary);">${formatAccountTypeName(account.account_type)}</div>
                    <div style="font-size: 28px; font-weight: 700; color: ${balance < 0 ? 'var(--danger-color)' : 'var(--text-primary)'};">${formatCurrency(balance)}</div>
                </div>
            </div>

            <div class="account-detail-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">This Month Income</div>
                    <div style="font-size: 20px; font-weight: 600; color: var(--success-color);">${formatCurrency(account.month_income)}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">This Month Expenses</div>
                    <div style="font-size: 20px; font-weight: 600; color: var(--danger-color);">${formatCurrency(account.month_expenses)}</div>
                </div>
            </div>

            ${account.credit_limit ? `
            <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 13px; color: var(--text-secondary);">Credit Used</span>
                    <span style="font-size: 13px; font-weight: 500;">${formatCurrency(Math.abs(balance))} / ${formatCurrency(account.credit_limit)}</span>
                </div>
                <div style="height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${Math.min((Math.abs(balance) / account.credit_limit) * 100, 100)}%; background: ${Math.abs(balance) / account.credit_limit > 0.8 ? 'var(--danger-color)' : 'var(--primary-color)'}; border-radius: 4px;"></div>
                </div>
            </div>
            ` : ''}

            <div class="account-detail-transactions">
                <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">Recent Transactions</h4>
                ${recentTransactions.length > 0 ? `
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${recentTransactions.map(txn => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                                <div>
                                    <div style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${txn.description || txn.vendor_name || 'Transaction'}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${formatDate(txn.transaction_date)} ${txn.category_name ? '• ' + txn.category_name : ''}</div>
                                </div>
                                <div style="font-size: 14px; font-weight: 600; color: ${parseFloat(txn.amount) >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                                    ${parseFloat(txn.amount) >= 0 ? '+' : ''}${formatCurrency(txn.amount)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 24px; color: var(--text-secondary);">
                        No recent transactions
                    </div>
                `}
            </div>

            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button class="btn btn-secondary" style="flex: 1;" onclick="closeModal(); showEditAccountModal(${accountId});">Edit Account</button>
                <button class="btn btn-primary" style="flex: 1;" onclick="closeModal(); navigateTo('transactions'); setTimeout(() => { document.getElementById('txn-account-filter').value = ${accountId}; document.getElementById('txn-account-filter').dispatchEvent(new Event('change')); }, 300);">View All Transactions</button>
            </div>
        </div>
    `);
}

// =====================================================
// Edit Account Modal
// =====================================================

function showEditAccountModal(accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return;

    openModal('Edit Account', `
        <form id="edit-account-form">
            <input type="hidden" name="id" value="${account.id}">
            <div class="form-group">
                <label>Account Name</label>
                <input type="text" class="form-input" name="account_name" value="${account.account_name}" required>
            </div>
            <div class="form-group">
                <label>Account Type</label>
                <select class="form-select" name="account_type" required>
                    <option value="checking" ${account.account_type === 'checking' ? 'selected' : ''}>Checking</option>
                    <option value="savings" ${account.account_type === 'savings' ? 'selected' : ''}>Savings</option>
                    <option value="credit_card" ${account.account_type === 'credit_card' ? 'selected' : ''}>Credit Card</option>
                    <option value="investment" ${account.account_type === 'investment' ? 'selected' : ''}>Investment</option>
                    <option value="cash" ${account.account_type === 'cash' ? 'selected' : ''}>Cash</option>
                    <option value="loan" ${account.account_type === 'loan' ? 'selected' : ''}>Loan</option>
                    <option value="other" ${account.account_type === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Current Balance</label>
                <input type="number" class="form-input" name="current_balance" step="0.01" value="${account.current_balance}">
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" name="color" value="${account.color || '#3b82f6'}">
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" name="is_active" ${account.is_active ? 'checked' : ''}>
                    Active Account
                </label>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-danger" onclick="deleteAccount(${account.id})">Delete</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
        </form>
    `);

    document.getElementById('edit-account-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const result = await apiRequest('/accounts/update.php', 'POST', {
            id: accountId,
            account_name: formData.get('account_name'),
            account_type: formData.get('account_type'),
            current_balance: parseFloat(formData.get('current_balance')),
            color: formData.get('color'),
            is_active: formData.get('is_active') ? 1 : 0
        });

        if (result.success) {
            showToast('Account updated successfully', 'success');
            closeModal();
            await loadAccounts();
        } else {
            showToast(result.message || 'Error updating account', 'error');
        }
    };
}

// =====================================================
// Delete Account
// =====================================================

async function deleteAccount(accountId) {
    if (!confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
        return;
    }

    const result = await apiRequest('/accounts/update.php', 'DELETE', { id: accountId });

    if (result.success) {
        showToast('Account deleted successfully', 'success');
        closeModal();
        await loadAccounts();
    } else {
        showToast(result.message || 'Error deleting account', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadAccounts = loadAccounts;
window.renderAccountsGrid = renderAccountsGrid;
window.getAccountIconHTML = getAccountIconHTML;
window.formatAccountTypeName = formatAccountTypeName;
window.showAddAccountModal = showAddAccountModal;
window.showAccountDetailModal = showAccountDetailModal;
window.showEditAccountModal = showEditAccountModal;
window.deleteAccount = deleteAccount;
