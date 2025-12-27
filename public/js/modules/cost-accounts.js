// =====================================================
// COST ACCOUNTS MODULE
// Manage credit cards and bank accounts for cost tracking
// =====================================================

const CostAccountsModule = {
    accounts: [],

    getCurrentUser() {
        return (typeof state !== 'undefined' && state.currentUser) || localStorage.getItem('currentUser') || '1';
    },

    async init() {
        await this.loadAccounts();
    },

    async loadAccounts() {
        const grid = document.getElementById('cost-accounts-grid');
        if (!grid) return;

        try {
            const result = await apiGet('/cost/accounts.php', {
                user_id: this.getCurrentUser()
            });

            if (result.success && result.data) {
                this.accounts = result.data.accounts || result.data || [];
                this.renderAccounts();
            } else {
                this.accounts = [];
                this.renderAccounts();
            }
        } catch (error) {
            console.error('Error loading cost accounts:', error);
            this.accounts = [];
            this.renderAccounts();
        }
    },

    renderAccounts() {
        const grid = document.getElementById('cost-accounts-grid');
        if (!grid) return;

        if (this.accounts.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #64748b;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🏦</div>
                    <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #334155;">No accounts yet</h3>
                    <p style="margin: 0; font-size: 14px;">Add credit cards or bank accounts to track costs</p>
                    <button onclick="openCostAccountModal()" style="margin-top: 20px; padding: 10px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
                        + Add Account
                    </button>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.accounts.map(account => this.renderAccountCard(account)).join('');
    },

    renderAccountCard(account) {
        const typeIcons = {
            'Credit Card': '💳',
            'Checking': '🏦',
            'Savings': '💰',
            'Cash': '💵',
            'Other': '📋'
        };
        const icon = typeIcons[account.account_type] || '💳';
        const accountColor = account.color || '#059669';

        const balance = parseFloat(account.balance || 0);
        const balanceClass = balance >= 0 ? 'positive' : 'negative';
        const balanceColor = balance >= 0 ? '#10b981' : '#ef4444';

        const thisMonthExpenses = parseFloat(account.this_month_expenses || 0);
        const thisMonthIncome = parseFloat(account.this_month_income || 0);

        return `
            <div class="account-card" onclick="CostAccountsModule.selectAccount(${account.id})" style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; border-top: 3px solid ${accountColor};">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div style="width: 48px; height: 48px; background: ${accountColor}20; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                        ${icon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${account.account_name || account.name}</h3>
                        <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">${account.account_type || 'Account'}</p>
                    </div>
                    <div style="position: relative;">
                        <button onclick="event.stopPropagation(); CostAccountsModule.showAccountMenu(${account.id}, this)" style="padding: 4px 8px; background: transparent; border: none; cursor: pointer; font-size: 18px; color: #94a3b8;">⋮</button>
                    </div>
                </div>
                <div style="font-size: 28px; font-weight: 700; color: ${balanceColor}; margin-bottom: 16px;">
                    ${this.formatCurrency(balance)}
                </div>
                <div style="display: flex; gap: 16px;">
                    <div>
                        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">This Month Income</div>
                        <div style="font-size: 14px; font-weight: 600; color: #10b981;">${this.formatCurrency(thisMonthIncome)}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">This Month Expenses</div>
                        <div style="font-size: 14px; font-weight: 600; color: #ef4444;">${this.formatCurrency(thisMonthExpenses)}</div>
                    </div>
                </div>
            </div>
        `;
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    selectAccount(accountId) {
        const account = this.accounts.find(a => a.id === accountId);
        if (account) {
            this.showAccountDetailModal(account);
        }
    },

    async showAccountDetailModal(account) {
        const balance = parseFloat(account.balance || 0);
        const balanceColor = balance >= 0 ? '#10b981' : '#ef4444';

        const typeIcons = {
            'Credit Card': '&#128179;',
            'Checking': '&#127974;',
            'Savings': '&#128176;',
            'Cash': '&#128181;',
            'Other': '&#128203;'
        };
        const icon = typeIcons[account.account_type] || '&#128179;';

        const thisMonthIncome = parseFloat(account.this_month_income || 0);
        const thisMonthExpenses = parseFloat(account.this_month_expenses || 0);

        // Fetch recent transactions for this account
        let recentTransactions = [];
        try {
            const txnData = await apiGet('/cost/transactions.php', {
                user_id: this.getCurrentUser(),
                account_id: account.id,
                limit: 10
            });
            if (txnData.success && txnData.data) {
                recentTransactions = txnData.data.transactions || [];
            }
        } catch (e) {
            console.error('Error loading transactions:', e);
        }

        // Remove existing modal
        let modal = document.getElementById('cost-account-detail-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'cost-account-detail-modal';
        modal.style.cssText = `
            display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 99999; justify-content: center; align-items: center;
        `;

        modal.innerHTML = `
            <div style="width: 600px; max-width: 95%; max-height: 85vh; background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column;">
                <div style="padding: 20px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${account.account_name || account.name}</h3>
                        <button onclick="CostAccountsModule.closeAccountDetailModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                        <div style="width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: #f0fdf4; color: #059669;">
                            ${icon}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 14px; color: #64748b;">${account.account_type || 'Account'}</div>
                            <div style="font-size: 28px; font-weight: 700; color: ${balanceColor};">${this.formatCurrency(balance)}</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                        <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">This Month Income</div>
                            <div style="font-size: 20px; font-weight: 600; color: #10b981;">${this.formatCurrency(thisMonthIncome)}</div>
                        </div>
                        <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">This Month Expenses</div>
                            <div style="font-size: 20px; font-weight: 600; color: #ef4444;">${this.formatCurrency(thisMonthExpenses)}</div>
                        </div>
                    </div>

                    <div>
                        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1e293b;">Recent Transactions</h4>
                        ${recentTransactions.length > 0 ? `
                            <div style="max-height: 250px; overflow-y: auto;">
                                ${recentTransactions.map(txn => {
                                    const amt = parseFloat(txn.amount || 0);
                                    return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <div>
                                            <div style="font-size: 14px; font-weight: 500; color: #1e293b;">${txn.description || txn.vendor_name || 'Transaction'}</div>
                                            <div style="font-size: 12px; color: #64748b;">${typeof formatDate === 'function' ? formatDate(txn.transaction_date) : txn.transaction_date}</div>
                                        </div>
                                        <div style="font-size: 14px; font-weight: 600; color: ${amt >= 0 ? '#10b981' : '#ef4444'};">
                                            ${amt >= 0 ? '+' : ''}${this.formatCurrency(amt)}
                                        </div>
                                    </div>
                                `}).join('')}
                            </div>
                        ` : `
                            <div style="text-align: center; padding: 24px; color: #94a3b8;">
                                No recent transactions
                            </div>
                        `}
                    </div>
                </div>
                <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px;">
                    <button onclick="CostAccountsModule.closeAccountDetailModal(); CostAccountsModule.editAccount(${account.id});" style="flex: 1; padding: 10px 20px; background: white; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Edit Account</button>
                    <button onclick="CostAccountsModule.closeAccountDetailModal(); CostAccountsModule.viewAllTransactions(${account.id});" style="flex: 1; padding: 10px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">View All Transactions</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeAccountDetailModal();
            }
        });
    },

    closeAccountDetailModal() {
        const modal = document.getElementById('cost-account-detail-modal');
        if (modal) modal.remove();
    },

    viewAllTransactions(accountId) {
        // Navigate to cost-client-ledger with account filter
        localStorage.setItem('costSelectedAccount', accountId);
        if (typeof navigateTo === 'function') {
            navigateTo('cost-client-ledger');
        }
    },

    showAccountMenu(accountId, button) {
        // Remove existing menus
        document.querySelectorAll('.account-menu-popup').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'account-menu-popup';
        menu.style.cssText = `
            position: absolute; right: 0; top: 100%; background: white; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0;
            z-index: 1000; min-width: 140px; overflow: hidden;
        `;
        menu.innerHTML = `
            <button onclick="event.stopPropagation(); CostAccountsModule.editAccount(${accountId})" style="display: block; width: 100%; padding: 10px 16px; text-align: left; border: none; background: white; cursor: pointer; font-size: 13px; color: #374151;">Edit</button>
            <button onclick="event.stopPropagation(); CostAccountsModule.deleteAccount(${accountId})" style="display: block; width: 100%; padding: 10px 16px; text-align: left; border: none; background: white; cursor: pointer; font-size: 13px; color: #ef4444;">Delete</button>
        `;

        button.parentElement.appendChild(menu);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== button) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    },

    editAccount(accountId) {
        document.querySelectorAll('.account-menu-popup').forEach(m => m.remove());
        const account = this.accounts.find(a => a.id === accountId);
        if (account) {
            openCostAccountModal(account);
        }
    },

    async deleteAccount(accountId) {
        document.querySelectorAll('.account-menu-popup').forEach(m => m.remove());
        if (!confirm('Are you sure you want to delete this account?')) return;

        try {
            const result = await apiDelete('/cost/accounts.php', {
                id: accountId,
                user_id: this.getCurrentUser()
            });

            if (result.success) {
                await this.loadAccounts();
                if (typeof showToast === 'function') {
                    showToast('Account deleted successfully', 'success');
                }
            } else {
                alert(result.message || 'Error deleting account');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            alert('Error deleting account');
        }
    }
};

// Open Add/Edit Cost Account Modal
function openCostAccountModal(account = null) {
    // Remove existing modal
    let modal = document.getElementById('cost-account-modal');
    if (modal) modal.remove();

    const isEdit = !!account;
    const title = isEdit ? 'Edit Account' : 'Add Account';

    modal = document.createElement('div');
    modal.id = 'cost-account-modal';
    modal.style.cssText = `
        display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 99999; justify-content: center; align-items: center;
    `;

    modal.innerHTML = `
        <div style="width: 500px; max-width: 95%; background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden;">
            <div style="padding: 20px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${title}</h3>
                    <button onclick="closeCostAccountModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button>
                </div>
            </div>
            <form id="cost-account-form" onsubmit="saveCostAccount(event)" style="padding: 24px;">
                <input type="hidden" id="cost-account-id" value="${account?.id || ''}">

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Account Name *</label>
                    <input type="text" id="cost-account-name" required value="${account?.account_name || account?.name || ''}"
                           placeholder="e.g., Chase Business Card"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Account Type *</label>
                    <select id="cost-account-type" required style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        <option value="">Select type...</option>
                        <option value="Credit Card" ${account?.account_type === 'Credit Card' ? 'selected' : ''}>Credit Card</option>
                        <option value="Checking" ${account?.account_type === 'Checking' ? 'selected' : ''}>Checking</option>
                        <option value="Savings" ${account?.account_type === 'Savings' ? 'selected' : ''}>Savings</option>
                        <option value="Cash" ${account?.account_type === 'Cash' ? 'selected' : ''}>Cash</option>
                        <option value="Other" ${account?.account_type === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Starting Balance</label>
                    <input type="number" id="cost-account-balance" step="0.01" value="${account?.balance || '0.00'}"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Account Number (optional)</label>
                    <input type="text" id="cost-account-number" value="${account?.account_number || ''}"
                           placeholder="Last 4 digits"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Color</label>
                    <input type="color" id="cost-account-color" value="${account?.color || '#059669'}"
                           style="width: 100%; height: 40px; padding: 4px; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; box-sizing: border-box;">
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
                    <button type="button" onclick="closeCostAccountModal()" style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button>
                    <button type="submit" style="padding: 10px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">${isEdit ? 'Save Changes' : 'Add Account'}</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeCostAccountModal() {
    const modal = document.getElementById('cost-account-modal');
    if (modal) modal.remove();
}

async function saveCostAccount(event) {
    event.preventDefault();

    const id = document.getElementById('cost-account-id').value;
    const data = {
        user_id: CostAccountsModule.getCurrentUser(),
        account_name: document.getElementById('cost-account-name').value,
        account_type: document.getElementById('cost-account-type').value,
        balance: parseFloat(document.getElementById('cost-account-balance').value) || 0,
        account_number: document.getElementById('cost-account-number').value,
        color: document.getElementById('cost-account-color').value
    };

    try {
        let result;
        if (id) {
            data.id = id;
            result = await apiPut('/cost/accounts.php', data);
        } else {
            result = await apiPost('/cost/accounts.php', data);
        }

        if (result.success) {
            closeCostAccountModal();
            await CostAccountsModule.loadAccounts();
            if (typeof showToast === 'function') {
                showToast(id ? 'Account updated successfully' : 'Account added successfully', 'success');
            }
        } else {
            alert(result.message || 'Error saving account');
        }
    } catch (error) {
        console.error('Error saving account:', error);
        alert('Error saving account');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized when cost-accounts page is shown
});

// Export for global access
window.CostAccountsModule = CostAccountsModule;
window.openCostAccountModal = openCostAccountModal;
window.closeCostAccountModal = closeCostAccountModal;
window.saveCostAccount = saveCostAccount;
