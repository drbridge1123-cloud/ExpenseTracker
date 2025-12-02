// =====================================================
// Dashboard Module
// =====================================================
// Dependencies: state, apiGet, formatCurrency, formatDate, showToast, showLoading, hideLoading, openModal, closeModal

// =====================================================
// Dashboard Month Selector
// =====================================================

function initDashboardMonthSelector() {
    const select = document.getElementById('dashboard-month');
    if (!select) return;

    const now = new Date();
    const currentYear = now.getFullYear();

    // Add yearly options at the top
    select.innerHTML = '<optgroup label="Yearly">';
    for (let y = currentYear; y >= currentYear - 2; y--) {
        select.innerHTML += `<option value="${y}-yearly">${y} (Full Year)</option>`;
    }
    select.innerHTML += '</optgroup>';

    // Add monthly options
    select.innerHTML += '<optgroup label="Monthly">';
    for (let i = 0; i < 24; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        select.innerHTML += `<option value="${value}">${label}</option>`;
    }
    select.innerHTML += '</optgroup>';

    // Set default to current year (Full Year)
    const defaultValue = `${currentYear}-yearly`;
    select.value = defaultValue;

    select.addEventListener('change', () => loadDashboard());
}

// =====================================================
// Main Dashboard Load
// =====================================================

async function loadDashboard() {
    const monthSelect = document.getElementById('dashboard-month');
    if (!monthSelect) return;

    const selectedValue = monthSelect.value;
    const isYearly = selectedValue.includes('yearly');

    let year, month, reportType;

    if (isYearly) {
        year = parseInt(selectedValue.split('-')[0]);
        month = null;
        reportType = 'yearly';
    } else {
        [year, month] = selectedValue.split('-').map(Number);
        reportType = 'monthly';
    }

    try {
        // Load report data
        const reportParams = {
            user_id: state.currentUser,
            year,
            type: reportType
        };
        if (month) {
            reportParams.month = month;
        }
        const reportData = await apiGet('/reports/', reportParams);

        if (reportData.success) {
            updateDashboardSummary(reportData.data.report);
            updateCategoryChart(reportData.data.report.category_breakdown);
        }

        // Load accounts summary
        const accountsData = await apiGet('/accounts/', {
            user_id: state.currentUser
        });

        if (accountsData.success) {
            state.accounts = accountsData.data.accounts;
            updateAccountsSummary(accountsData.data.accounts);
        }

        // Load recent transactions
        const txnData = await apiGet('/transactions/', {
            user_id: state.currentUser,
            limit: 10
        });

        if (txnData.success) {
            updateRecentTransactions(txnData.data.transactions);
        }
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

function updateDashboardSummary(report) {
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpensesEl = document.getElementById('total-expenses');
    const netSavingsEl = document.getElementById('net-savings');
    const savingsRateEl = document.getElementById('savings-rate');

    if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(report.total_income);
    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(report.total_expenses);
    if (netSavingsEl) {
        netSavingsEl.textContent = formatCurrency(report.net_savings);
        netSavingsEl.style.color = report.net_savings >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (savingsRateEl) savingsRateEl.textContent = report.savings_rate.toFixed(1) + '%';

    // Store report for detail views
    state.currentReport = report;
}

// =====================================================
// Dashboard Detail Views
// =====================================================

async function showIncomeDetail() {
    const monthSelect = document.getElementById('dashboard-month');
    const [year, month] = monthSelect.value.split('-').map(Number);

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        type: 'credit',
        year: year,
        month: month,
        limit: 50
    });
    hideLoading();

    if (!data.success) {
        showToast('Failed to load income details', 'error');
        return;
    }

    const transactions = data.data.transactions || [];
    const total = transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    openModal('💰 Income Details', `
        <div class="detail-summary">
            <div class="detail-total text-success">${formatCurrency(total)}</div>
            <div class="detail-count">${transactions.length} transactions</div>
        </div>
        <div class="detail-transactions-list">
            ${transactions.length === 0 ? '<p class="text-muted text-center">No income this month</p>' :
            transactions.map(t => `
                <div class="detail-transaction-item" onclick="showTransactionDetail(${t.id})">
                    <div class="detail-transaction-date">${formatDate(t.transaction_date)}</div>
                    <div class="detail-transaction-desc">${t.description}</div>
                    <div class="detail-transaction-amount text-success">+${formatCurrency(Math.abs(t.amount))}</div>
                </div>
            `).join('')}
        </div>
    `);
}

async function showExpensesDetail() {
    const monthSelect = document.getElementById('dashboard-month');
    const [year, month] = monthSelect.value.split('-').map(Number);

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        type: 'debit',
        year: year,
        month: month,
        limit: 50
    });
    hideLoading();

    if (!data.success) {
        showToast('Failed to load expense details', 'error');
        return;
    }

    const transactions = data.data.transactions || [];
    const total = transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    openModal('💸 Expense Details', `
        <div class="detail-summary">
            <div class="detail-total text-danger">${formatCurrency(total)}</div>
            <div class="detail-count">${transactions.length} transactions</div>
        </div>
        <div class="detail-transactions-list">
            ${transactions.length === 0 ? '<p class="text-muted text-center">No expenses this month</p>' :
            transactions.map(t => `
                <div class="detail-transaction-item" onclick="showTransactionDetail(${t.id})">
                    <div class="detail-transaction-date">${formatDate(t.transaction_date)}</div>
                    <div class="detail-transaction-desc">${t.description}</div>
                    <div class="detail-transaction-amount text-danger">-${formatCurrency(Math.abs(t.amount))}</div>
                </div>
            `).join('')}
        </div>
    `);
}

function showSavingsDetail() {
    const report = state.currentReport;
    if (!report) return;

    openModal('💵 Net Savings Breakdown', `
        <div class="savings-breakdown">
            <div class="breakdown-row">
                <span class="breakdown-label">Total Income</span>
                <span class="breakdown-value text-success">+${formatCurrency(report.total_income)}</span>
            </div>
            <div class="breakdown-row">
                <span class="breakdown-label">Total Expenses</span>
                <span class="breakdown-value text-danger">-${formatCurrency(report.total_expenses)}</span>
            </div>
            <div class="breakdown-divider"></div>
            <div class="breakdown-row total">
                <span class="breakdown-label">Net Savings</span>
                <span class="breakdown-value ${report.net_savings >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(report.net_savings)}</span>
            </div>
        </div>
        <div class="savings-tip">
            <p>${report.net_savings >= 0 ?
            '🎉 Great job! You saved money this month.' :
            '⚠️ You spent more than you earned this month.'}</p>
        </div>
    `);
}

function showSavingsRateDetail() {
    const report = state.currentReport;
    if (!report) return;

    const rate = report.savings_rate;
    let ratingText, ratingColor;

    if (rate >= 50) {
        ratingText = 'Excellent! You are saving aggressively.';
        ratingColor = 'var(--success)';
    } else if (rate >= 20) {
        ratingText = 'Good! You have a healthy savings rate.';
        ratingColor = 'var(--success)';
    } else if (rate >= 10) {
        ratingText = 'Fair. Consider increasing your savings.';
        ratingColor = 'var(--warning)';
    } else if (rate >= 0) {
        ratingText = 'Low savings rate. Try to reduce expenses.';
        ratingColor = 'var(--warning)';
    } else {
        ratingText = 'Negative! You are spending more than earning.';
        ratingColor = 'var(--danger)';
    }

    openModal('📊 Savings Rate Analysis', `
        <div class="rate-display">
            <div class="rate-circle" style="border-color: ${ratingColor}">
                <span class="rate-value" style="color: ${ratingColor}">${rate.toFixed(1)}%</span>
            </div>
        </div>
        <div class="rate-formula">
            <p>Savings Rate = (Income - Expenses) / Income × 100</p>
            <p>= (${formatCurrency(report.total_income)} - ${formatCurrency(report.total_expenses)}) / ${formatCurrency(report.total_income)} × 100</p>
        </div>
        <div class="rate-assessment" style="color: ${ratingColor}">
            <p>${ratingText}</p>
        </div>
    `);
}

async function showAccountDetail(accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return;

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        account_id: accountId,
        limit: 20
    });
    hideLoading();

    const transactions = data.success ? (data.data.transactions || []) : [];
    const color = account.color || '#6b7280';

    openModal(`${getAccountIcon(account.account_type)} ${account.account_name}`, `
        <div class="account-detail-header" style="border-left: 4px solid ${color}; padding-left: 15px;">
            <div class="account-detail-balance ${account.current_balance < 0 ? 'text-danger' : ''}">${formatCurrency(account.current_balance)}</div>
            <div class="account-detail-type">${formatAccountType(account.account_type)}</div>
            ${account.credit_limit ? `<div class="account-detail-limit">Credit Limit: ${formatCurrency(account.credit_limit)}</div>` : ''}
        </div>
        <h4 style="margin: 20px 0 10px; font-size: 0.9rem;">Recent Transactions</h4>
        <div class="detail-transactions-list">
            ${transactions.length === 0 ? '<p class="text-muted text-center">No transactions</p>' :
            transactions.map(t => `
                <div class="detail-transaction-item" onclick="showTransactionDetail(${t.id})">
                    <div class="detail-transaction-date">${formatDate(t.transaction_date)}</div>
                    <div class="detail-transaction-desc">${t.description}</div>
                    <div class="detail-transaction-amount ${t.transaction_type === 'credit' ? 'text-success' : 'text-danger'}">
                        ${t.transaction_type === 'credit' ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="form-actions" style="margin-top: 20px;">
            <button class="btn btn-secondary" onclick="closeModal(); navigateTo('transactions')">View All Transactions</button>
            <button class="btn btn-primary" onclick="closeModal(); showEditAccountModal(${accountId})">Edit Account</button>
        </div>
    `);
}

// =====================================================
// Dashboard Charts & Lists
// =====================================================

function updateCategoryChart(breakdown) {
    const container = document.getElementById('category-chart');
    if (!container) return;

    if (!breakdown || breakdown.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No spending data for this period</p>';
        return;
    }

    const maxAmount = Math.max(...breakdown.map(c => parseFloat(c.total_amount)));

    container.innerHTML = breakdown.slice(0, 8).map(cat => {
        const pct = (parseFloat(cat.total_amount) / maxAmount * 100).toFixed(0);
        const color = cat.category_color || '#6b7280';

        return `
            <div class="category-bar clickable" onclick="showCategoryDetail(${cat.category_id}, '${cat.category_name}', '${getCategoryIcon(cat.category_icon)}')">
                <span class="category-bar-label">${cat.category_name}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: ${pct}%; background: ${color}"></div>
                </div>
                <span class="category-bar-amount">${formatCurrency(cat.total_amount)}</span>
            </div>
        `;
    }).join('');
}

function updateAccountsSummary(accounts) {
    const container = document.getElementById('accounts-summary');
    if (!container) return;

    if (!accounts || accounts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No accounts found</p>';
        return;
    }

    container.innerHTML = accounts.map(acc => {
        const balance = parseFloat(acc.current_balance);
        const balanceClass = balance < 0 ? 'negative' : '';
        const color = acc.color || '#6b7280';
        const jointBadge = acc.is_joint ? '<span class="joint-badge">Joint</span>' : '';

        return `
            <div class="account-row clickable" onclick="showAccountDetail(${acc.id})">
                <div class="account-info">
                    <div class="account-color" style="background: ${color}"></div>
                    <div>
                        <div class="account-name">${acc.account_name} ${jointBadge}</div>
                        <div class="account-type">${formatAccountType(acc.account_type)}</div>
                    </div>
                </div>
                <div class="account-balance ${balanceClass}">${formatCurrency(balance)}</div>
            </div>
        `;
    }).join('');
}

function updateRecentTransactions(transactions) {
    const container = document.getElementById('recent-transactions');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No recent transactions</p>';
        return;
    }

    container.innerHTML = `
        <table class="transactions-table">
            <tbody>
                ${transactions.map(txn => `
                    <tr onclick="showTransactionDetail(${txn.id})">
                        <td>${formatDate(txn.transaction_date)}</td>
                        <td>${txn.description}</td>
                        <td>
                            <span class="category-badge" style="background: ${txn.category_color || '#e5e7eb'}20; color: ${txn.category_color || '#6b7280'}">
                                ${txn.category_name || 'Uncategorized'}
                            </span>
                        </td>
                        <td class="text-right ${txn.amount >= 0 ? 'amount-credit' : 'amount-debit'}">
                            ${formatCurrency(txn.amount)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// =====================================================
// Helper Functions
// =====================================================

function getAccountIcon(type) {
    const icons = {
        'checking': '🏦',
        'savings': '💰',
        'credit_card': '💳',
        'investment': '📈',
        'cash': '💵',
        'loan': '📋',
        'other': '📁'
    };
    return icons[type] || '📁';
}

function formatAccountType(type) {
    const types = {
        'checking': 'Checking',
        'savings': 'Savings',
        'credit_card': 'Credit Card',
        'investment': 'Investment',
        'cash': 'Cash',
        'loan': 'Loan',
        'other': 'Other'
    };
    return types[type] || type;
}

function getCategoryIcon(icon) {
    return icon || '📁';
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.initDashboardMonthSelector = initDashboardMonthSelector;
window.loadDashboard = loadDashboard;
window.showIncomeDetail = showIncomeDetail;
window.showExpensesDetail = showExpensesDetail;
window.showSavingsDetail = showSavingsDetail;
window.showSavingsRateDetail = showSavingsRateDetail;
window.showAccountDetail = showAccountDetail;
window.updateCategoryChart = updateCategoryChart;
window.updateAccountsSummary = updateAccountsSummary;
window.updateRecentTransactions = updateRecentTransactions;
window.getAccountIcon = getAccountIcon;
window.formatAccountType = formatAccountType;
