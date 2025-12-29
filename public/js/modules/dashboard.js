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

    // Set default to current month
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const defaultValue = `${currentYear}-${currentMonth}`;
    select.value = defaultValue;

    select.addEventListener('change', () => loadDashboard());
}

// =====================================================
// Main Dashboard Load
// =====================================================

async function loadDashboard() {
    // Get dashboard wrappers
    const ioltaWrapper = document.getElementById('iolta-dashboard-wrapper');
    const costWrapper = document.getElementById('cost-dashboard-wrapper');
    const personalWrapper = document.getElementById('personal-dashboard-wrapper');

    // Check account type
    const accountType = typeof getAccountType === 'function' ? getAccountType() : 'general';

    // Hide all wrappers first
    if (ioltaWrapper) ioltaWrapper.style.display = 'none';
    if (costWrapper) costWrapper.style.display = 'none';
    if (personalWrapper) personalWrapper.style.display = 'none';

    // Show appropriate wrapper based on account type
    if (accountType === 'cost') {
        // Show Cost Dashboard
        if (costWrapper) costWrapper.style.display = 'block';
        // Load Cost Dashboard data
        if (typeof loadCostDashboard === 'function') {
            await loadCostDashboard();
        }
        return; // Don't load personal dashboard data
    } else {
        // Show Personal Dashboard for general accounts
        if (personalWrapper) personalWrapper.style.display = 'block';
    }

    const summaryCards = document.querySelector('#personal-dashboard-wrapper .summary-cards');
    const categoryChartRow = document.getElementById('category-chart-row');

    if (summaryCards) summaryCards.style.display = '';
    if (categoryChartRow) categoryChartRow.style.display = '';

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
        // Load report data for general accounts
        const reportParams = {
            user_id: state.currentUser,
            year,
            type: reportType
        };
        if (month) {
            reportParams.month = month;
        }
        const reportData = await apiGet('/reports/', reportParams);

        // Load last month's report for comparison
        let lastMonthReport = null;
        if (reportType === 'monthly' && month) {
            const lastMonth = month === 1 ? 12 : month - 1;
            const lastYear = month === 1 ? year - 1 : year;
            const lastReportData = await apiGet('/reports/', {
                user_id: state.currentUser,
                year: lastYear,
                month: lastMonth,
                type: 'monthly'
            });
            if (lastReportData.success) {
                lastMonthReport = lastReportData.data.report;
            }
        }

        // Load general accounts (exclude trust/iolta)
        const accountsData = await apiGet('/accounts/', {
            user_id: state.currentUser,
            account_mode: 'general'
        });

        if (accountsData.success) {
            state.accounts = accountsData.data.accounts;
            updateAccountsSummary(accountsData.data.accounts);
        }

        // Load transfers for current period
        let currentTransfers = 0;
        let lastTransfers = 0;

        if (reportType === 'monthly' && month) {
            // Calculate date range for current month
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            // Current month transfers
            const transferData = await apiGet('/transactions/', {
                user_id: state.currentUser,
                type: 'transfer',
                start_date: startDate,
                end_date: endDate
            });
            if (transferData.success) {
                currentTransfers = (transferData.data.transactions || []).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
            }

            // Last month transfers
            const lastMonth = month === 1 ? 12 : month - 1;
            const lastYear = month === 1 ? year - 1 : year;
            const lastStartDate = `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`;
            const lastLastDay = new Date(lastYear, lastMonth, 0).getDate();
            const lastEndDate = `${lastYear}-${String(lastMonth).padStart(2, '0')}-${lastLastDay}`;

            const lastTransferData = await apiGet('/transactions/', {
                user_id: state.currentUser,
                type: 'transfer',
                start_date: lastStartDate,
                end_date: lastEndDate
            });
            if (lastTransferData.success) {
                lastTransfers = (lastTransferData.data.transactions || []).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
            }
        }

        if (reportData.success) {
            updateDashboardSummary(reportData.data.report, lastMonthReport, currentTransfers, lastTransfers);
            updateCategoryChart(reportData.data.report.category_breakdown);
        }

        // Load recent transactions
        const txnData = await apiGet('/transactions/', {
            user_id: state.currentUser,
            limit: 10
        });

        if (txnData.success) {
            updateRecentTransactions(txnData.data.transactions);
        }

        // Load pending checks
        loadPendingChecksForDashboard();
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

// =====================================================
// Pending Checks for Dashboard
// =====================================================

async function loadPendingChecksForDashboard() {
    try {
        const result = await apiGet('/checks/', {
            user_id: state.currentUser,
            status: 'pending'
        });

        const card = document.getElementById('pending-checks-card');
        const row = card?.parentElement;

        if (result.success) {
            const checks = result.data.checks || [];

            // Always show the card and use two-column layout
            if (card) card.style.display = 'block';
            if (row) row.classList.remove('single-col');

            if (checks.length === 0) {
                // Show empty state
                const countEl = document.getElementById('pending-checks-count');
                if (countEl) countEl.textContent = '0';
                const totalEl = document.getElementById('pending-checks-total');
                if (totalEl) totalEl.textContent = '$0.00';
                const listEl = document.getElementById('pending-checks-list');
                if (listEl) {
                    listEl.innerHTML = `
                        <div class="pending-checks-empty">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span>No pending checks</span>
                        </div>
                    `;
                }
                return;
            }

            // Update count badge
            const countEl = document.getElementById('pending-checks-count');
            if (countEl) countEl.textContent = checks.length;

            // Calculate total
            const total = checks.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
            const totalEl = document.getElementById('pending-checks-total');
            if (totalEl) totalEl.textContent = formatCurrency(total);

            // Render list (show max 5)
            const listEl = document.getElementById('pending-checks-list');
            if (listEl) {
                const displayChecks = checks.slice(0, 5);
                listEl.innerHTML = displayChecks.map(check => `
                    <div class="pending-check-item" onclick="goToPendingCheck(${check.id})">
                        <div class="pending-check-info">
                            <span class="pending-check-number">#${check.check_number}</span>
                            <span class="pending-check-payee">${check.payee}</span>
                            <span class="pending-check-date">${formatDate(check.check_date)}</span>
                        </div>
                        <span class="pending-check-amount">-${formatCurrency(check.amount)}</span>
                    </div>
                `).join('');

                if (checks.length > 5) {
                    listEl.innerHTML += `
                        <div class="pending-check-item" style="justify-content:center;color:var(--text-secondary);font-size:12px;">
                            +${checks.length - 5} more pending checks
                        </div>
                    `;
                }
            }
        }
    } catch (error) {
        console.error('Error loading pending checks:', error);
    }
}

function goToPendingCheck(checkId) {
    navigateTo('checks');
    // Wait for page to load then edit - retry if function not ready
    let attempts = 0;
    const maxAttempts = 20;
    const tryEdit = () => {
        attempts++;
        if (typeof editCheck === 'function') {
            editCheck(checkId);
        } else if (attempts < maxAttempts) {
            setTimeout(tryEdit, 100);
        }
    };
    setTimeout(tryEdit, 100);
}

function updateDashboardSummary(report, lastMonthReport = null, transfers = 0, lastTransfers = 0) {
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpensesEl = document.getElementById('total-expenses');
    const netSavingsEl = document.getElementById('net-savings');
    const lastIncomeEl = document.getElementById('last-income');
    const lastExpensesEl = document.getElementById('last-expenses');
    const lastNetEl = document.getElementById('last-net');
    const incomeChangeEl = document.getElementById('income-change');
    const expensesChangeEl = document.getElementById('expenses-change');
    const netChangeEl = document.getElementById('net-change');
    const totalTransferEl = document.getElementById('total-transfer');
    const lastTransferEl = document.getElementById('last-transfer');
    const transferChangeEl = document.getElementById('transfer-change');

    // Current month values
    if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(report.total_income);
    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(report.total_expenses);
    if (netSavingsEl) {
        netSavingsEl.textContent = formatCurrency(report.net_savings);
        netSavingsEl.style.color = report.net_savings >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    // Last month values
    if (lastMonthReport) {
        if (lastIncomeEl) lastIncomeEl.textContent = formatCurrency(lastMonthReport.total_income);
        if (lastExpensesEl) lastExpensesEl.textContent = formatCurrency(lastMonthReport.total_expenses);
        if (lastNetEl) lastNetEl.textContent = formatCurrency(lastMonthReport.net_savings);

        // Calculate and display changes
        updateChangeBadge(incomeChangeEl, report.total_income, lastMonthReport.total_income, true);
        updateChangeBadge(expensesChangeEl, report.total_expenses, lastMonthReport.total_expenses, false);
        updateChangeBadge(netChangeEl, report.net_savings, lastMonthReport.net_savings, true);
    } else {
        if (lastIncomeEl) lastIncomeEl.textContent = '-';
        if (lastExpensesEl) lastExpensesEl.textContent = '-';
        if (lastNetEl) lastNetEl.textContent = '-';
        if (incomeChangeEl) { incomeChangeEl.textContent = '-'; incomeChangeEl.className = 'change-badge'; }
        if (expensesChangeEl) { expensesChangeEl.textContent = '-'; expensesChangeEl.className = 'change-badge'; }
        if (netChangeEl) { netChangeEl.textContent = '-'; netChangeEl.className = 'change-badge'; }
    }

    // Transfers
    if (totalTransferEl) {
        totalTransferEl.textContent = formatCurrency(transfers);
    }
    if (lastTransferEl) lastTransferEl.textContent = formatCurrency(lastTransfers);
    if (lastMonthReport) {
        updateChangeBadge(transferChangeEl, transfers, lastTransfers, false);
    } else {
        if (transferChangeEl) { transferChangeEl.textContent = '-'; transferChangeEl.className = 'change-badge'; }
    }

    // Store report for detail views
    state.currentReport = report;
}

function updateChangeBadge(el, current, previous, higherIsBetter) {
    if (!el) return;

    if (previous === 0) {
        el.textContent = current > 0 ? '+100%' : '-';
        el.className = 'change-badge ' + (current > 0 ? (higherIsBetter ? 'positive' : 'negative') : '');
        return;
    }

    const change = ((current - previous) / Math.abs(previous)) * 100;
    const isPositiveChange = change > 0;

    if (Math.abs(change) < 0.1) {
        el.textContent = '0%';
        el.className = 'change-badge';
    } else {
        el.textContent = (isPositiveChange ? '+' : '') + change.toFixed(1) + '%';
        // For income/net: increase is good (green), decrease is bad (red)
        // For expenses: increase is bad (red), decrease is good (green)
        const isGood = higherIsBetter ? isPositiveChange : !isPositiveChange;
        el.className = 'change-badge ' + (isGood ? 'positive' : 'negative');
    }
}

// =====================================================
// Dashboard Detail Views
// =====================================================

function getMonthDateRange(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    return { startDate, endDate };
}

async function showIncomeDetail() {
    const monthSelect = document.getElementById('dashboard-month');
    const [year, month] = monthSelect.value.split('-').map(Number);
    const { startDate, endDate } = getMonthDateRange(year, month);

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        type: 'credit',
        start_date: startDate,
        end_date: endDate,
        limit: 100
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
        <div class="detail-transactions-table">
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Account</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">No income this month</td></tr>' :
                    transactions.map(t => `
                        <tr class="clickable" onclick="showTransactionDetail(${t.id})">
                            <td>${formatDate(t.transaction_date)}</td>
                            <td class="desc-cell">${t.description}</td>
                            <td>${t.account_name || '-'}</td>
                            <td>${t.category_name || '-'}</td>
                            <td class="text-right text-success">+${formatCurrency(Math.abs(t.amount))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, 'modal-wide');
}

async function showExpensesDetail() {
    const monthSelect = document.getElementById('dashboard-month');
    const [year, month] = monthSelect.value.split('-').map(Number);
    const { startDate, endDate } = getMonthDateRange(year, month);

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        type: 'debit',
        start_date: startDate,
        end_date: endDate,
        limit: 100
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
        <div class="detail-transactions-table">
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Account</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">No expenses this month</td></tr>' :
                    transactions.map(t => `
                        <tr class="clickable" onclick="showTransactionDetail(${t.id})">
                            <td>${formatDate(t.transaction_date)}</td>
                            <td class="desc-cell">${t.description}</td>
                            <td>${t.account_name || '-'}</td>
                            <td>${t.category_name || '-'}</td>
                            <td class="text-right text-danger">-${formatCurrency(Math.abs(t.amount))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, 'modal-wide');
}

async function showTransferDetail() {
    const monthSelect = document.getElementById('dashboard-month');
    const [year, month] = monthSelect.value.split('-').map(Number);
    const { startDate, endDate } = getMonthDateRange(year, month);

    showLoading();
    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        type: 'transfer',
        start_date: startDate,
        end_date: endDate,
        limit: 100
    });
    hideLoading();

    if (!data.success) {
        showToast('Failed to load transfer details', 'error');
        return;
    }

    const transactions = data.data.transactions || [];
    const total = transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    openModal('🔄 Transfer Details', `
        <div class="detail-summary">
            <div class="detail-total">${formatCurrency(total)}</div>
            <div class="detail-count">${transactions.length} transfers</div>
        </div>
        <div class="detail-transactions-table">
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Account</th>
                        <th>Category</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">No transfers this month</td></tr>' :
                    transactions.map(t => `
                        <tr class="clickable" onclick="showTransactionDetail(${t.id})">
                            <td>${formatDate(t.transaction_date)}</td>
                            <td class="desc-cell">${t.description}</td>
                            <td>${t.account_name || '-'}</td>
                            <td>${t.category_name || '-'}</td>
                            <td class="text-right">${formatCurrency(Math.abs(t.amount))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, 'modal-wide');
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
            <p>Savings Rate = (Income - Expenses) / Income &#215; 100</p>
            <p>= (${formatCurrency(report.total_income)} - ${formatCurrency(report.total_expenses)}) / ${formatCurrency(report.total_income)} &#215; 100</p>
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

    // Filter out IOLTA/Trust accounts - they have their own section
    const filteredAccounts = (accounts || []).filter(acc =>
        acc.account_type !== 'iolta' && acc.account_type !== 'trust'
    );

    if (!filteredAccounts || filteredAccounts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No accounts found</p>';
        return;
    }

    const typeIcons = {
        'checking': '🏦',
        'savings': '💰',
        'credit_card': '💳',
        'investment': '📈',
        'cash': '💵',
        'loan': '📋',
        'other': '📁'
    };

    container.innerHTML = filteredAccounts.map(acc => {
        const balance = parseFloat(acc.current_balance);
        const balanceClass = balance < 0 ? 'negative' : '';
        const color = acc.color || '#6b7280';
        const icon = typeIcons[acc.account_type] || '📁';
        const jointBadge = acc.is_joint ? '<span class="joint-badge">Joint</span>' : '';

        return `
            <div class="account-row clickable" onclick="showAccountDetail(${acc.id})">
                <div class="account-info">
                    <div class="account-color" style="background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 14px;">${icon}</div>
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

function updateCostAccountsSummary(accounts) {
    const container = document.getElementById('accounts-summary');
    if (!container) return;

    if (!accounts || accounts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No cost accounts found</p>';
        return;
    }

    const typeIcons = {
        'Credit Card': '💳',
        'Checking': '🏦',
        'Savings': '💰',
        'Cash': '💵',
        'Other': '📋'
    };

    const typeColors = {
        'Credit Card': '#8b5cf6',
        'Checking': '#059669',
        'Savings': '#0891b2',
        'Cash': '#f59e0b',
        'Other': '#6b7280'
    };

    container.innerHTML = accounts.map(acc => {
        const balance = parseFloat(acc.balance || 0);
        const balanceClass = balance < 0 ? 'negative' : '';
        const icon = typeIcons[acc.account_type] || '💳';
        // Use account's custom color if set, otherwise fall back to type color
        const color = acc.color || typeColors[acc.account_type] || '#6b7280';

        return `
            <div class="account-row clickable" onclick="showCostAccountDetail(${acc.id})">
                <div class="account-info">
                    <div class="account-color" style="background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 14px;">${icon}</div>
                    <div>
                        <div class="account-name">${acc.account_name}</div>
                        <div class="account-type">${acc.account_type || 'Account'}</div>
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
                ${transactions.map(txn => {
                    const status = txn.check_status ? txn.check_status : txn.status;
                    return `
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
                        <td>
                            <span class="status-badge status-${status}">${status}</span>
                        </td>
                    </tr>
                `}).join('')}
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

function getCategoryIcon(iconName) {
    const iconMap = {
        'briefcase': '💼',
        'laptop': '💻',
        'trending-up': '📈',
        'rotate-ccw': '🔄',
        'plus-circle': '➕',
        'home': '🏠',
        'zap': '⚡',
        'shopping-cart': '🛒',
        'utensils': '🍽️',
        'car': '🚗',
        'fuel': '⛽',
        'heart': '❤️',
        'shield': '🛡️',
        'film': '🎬',
        'shopping-bag': '🛍️',
        'gift': '🎁',
        'book': '📚',
        'plane': '✈️',
        'smartphone': '📱',
        'coffee': '☕',
        'music': '🎵',
        'dollar-sign': '💵',
        'credit-card': '💳',
        'percent': '💯',
        'tag': '🏷️',
        'folder': '📁',
        'banknote': '💵',
        'wrench': '🔧',
        'repeat': '🔁',
        'alert-circle': '⚠️',
        'file-text': '📄',
        'smile': '😊',
        'help-circle': '❓'
    };
    return iconMap[iconName] || '📁';
}

// =====================================================
// Cost Account Detail (for dashboard)
// =====================================================

// Store cost accounts for detail modal access
let dashboardCostAccounts = [];

async function showCostAccountDetail(accountId) {
    // Find account from stored cost accounts
    let account = dashboardCostAccounts.find(a => a.id === accountId);

    // If not found, try to fetch
    if (!account) {
        try {
            const result = await apiGet('/cost/accounts.php', {
                user_id: state.currentUser,
                id: accountId
            });
            if (result.success && result.data) {
                account = result.data.accounts?.[0] || result.data;
            }
        } catch (e) {
            console.error('Error fetching cost account:', e);
        }
    }

    if (!account) {
        showToast('Account not found', 'error');
        return;
    }

    // Use CostAccountsModule if available
    if (typeof CostAccountsModule !== 'undefined' && CostAccountsModule.showAccountDetailModal) {
        CostAccountsModule.accounts = dashboardCostAccounts;
        CostAccountsModule.showAccountDetailModal(account);
    } else {
        // Fallback: navigate to cost-accounts page
        navigateTo('cost-accounts');
    }
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
window.showTransferDetail = showTransferDetail;
window.showAccountDetail = showAccountDetail;
window.updateCategoryChart = updateCategoryChart;
window.updateAccountsSummary = updateAccountsSummary;
window.updateRecentTransactions = updateRecentTransactions;
window.getAccountIcon = getAccountIcon;
window.formatAccountType = formatAccountType;
window.loadPendingChecksForDashboard = loadPendingChecksForDashboard;
window.goToPendingCheck = goToPendingCheck;
window.showCostAccountDetail = showCostAccountDetail;
