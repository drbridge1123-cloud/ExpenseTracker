// =====================================================
// Reports Module
// Extracted from app.js for better code organization
// =====================================================

// Dependencies: This module requires the following globals from app.js:
// - state (global state object)
// - API_BASE (API base URL)
// - formatCurrency (utility function)
// - showToast (UI function)

// Reports state
if (!window._reportState) {
    window._reportState = {
        period: 'month',
        data: null,
        comparisonData: null,
        charts: {},
        pnlData: null,
        pnlChart: null
    };
}
const reportState = window._reportState;

// Legacy aliases for compatibility
let reportPeriod = reportState.period;
let reportData = reportState.data;
let comparisonData = reportState.comparisonData;
let reportCharts = reportState.charts;
let pnlData = reportState.pnlData;
let pnlChart = reportState.pnlChart;

// =====================================================
// Main Functions
// =====================================================

async function loadReportsPage() {
    await loadReportData();
    await loadComparisonData();
}

async function loadReportData() {
    try {
        const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&period=${reportPeriod}`);
        const result = await response.json();

        if (result.success) {
            reportData = result.data;
            reportState.data = reportData;
            updateReportOverview();
            updateReportCharts();
        }
    } catch (error) {
        console.error('Error loading report:', error);
    }
}

async function loadComparisonData() {
    try {
        const response = await fetch(`${API_BASE}/reports/monthly-comparison.php?user_id=${state.currentUser}&months=6`);
        const result = await response.json();

        if (result.success) {
            comparisonData = result.data;
            reportState.comparisonData = comparisonData;
            updateComparisonTab();
        }
    } catch (error) {
        console.error('Error loading comparison:', error);
    }
}

// =====================================================
// P&L Report Functions
// =====================================================

async function loadPnlReport() {
    const periodSelect = document.getElementById('pnl-period');
    const period = periodSelect ? periodSelect.value : 'ytd';

    const { startDate, endDate } = getPnlDateRange(period);

    // Update custom date inputs
    const startInput = document.getElementById('pnl-start-date');
    const endInput = document.getElementById('pnl-end-date');
    if (startInput) startInput.value = startDate;
    if (endInput) endInput.value = endDate;

    try {
        const response = await fetch(`${API_BASE}/reports/profit-loss.php?user_id=${state.currentUser}&start_date=${startDate}&end_date=${endDate}`);
        const result = await response.json();

        if (result.success) {
            pnlData = result.data;
            reportState.pnlData = pnlData;
            renderPnlStatement();
            updatePnlChart();
        }
    } catch (error) {
        console.error('Error loading P&L:', error);
    }
}

function getPnlDateRange(period) {
    const today = new Date();
    let startDate, endDate;

    switch (period) {
        case 'this_month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'last_month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'this_quarter':
            const quarter = Math.floor(today.getMonth() / 3);
            startDate = new Date(today.getFullYear(), quarter * 3, 1);
            endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
            break;
        case 'last_quarter':
            const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
            const year = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
            const qStart = lastQuarter < 0 ? 3 : lastQuarter;
            startDate = new Date(year, qStart * 3, 1);
            endDate = new Date(year, qStart * 3 + 3, 0);
            break;
        case 'ytd':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = today;
            break;
        case 'last_year':
            startDate = new Date(today.getFullYear() - 1, 0, 1);
            endDate = new Date(today.getFullYear() - 1, 11, 31);
            break;
        case 'custom':
            const customStart = document.getElementById('pnl-start-date');
            const customEnd = document.getElementById('pnl-end-date');
            startDate = customStart && customStart.value ? new Date(customStart.value) : new Date(today.getFullYear(), 0, 1);
            endDate = customEnd && customEnd.value ? new Date(customEnd.value) : today;
            break;
        default:
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = today;
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

function changePnlPeriod(period) {
    const customDates = document.getElementById('pnl-custom-dates');
    if (customDates) {
        customDates.style.display = period === 'custom' ? 'flex' : 'none';
    }

    if (period !== 'custom') {
        loadPnlReport();
    }
}

function applyPnlCustomDates() {
    loadPnlReport();
}

function renderPnlStatement() {
    if (!pnlData) return;

    // Update date range display
    const dateRange = document.getElementById('pnl-date-range');
    if (dateRange) {
        const start = new Date(pnlData.period.start);
        const end = new Date(pnlData.period.end);
        dateRange.textContent = `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    }

    // Render income items
    const incomeContainer = document.getElementById('pnl-income-items');
    if (incomeContainer) {
        if (pnlData.income.categories.length > 0) {
            incomeContainer.innerHTML = pnlData.income.categories.map(cat => `
                <div class="pnl-item">
                    <div class="pnl-item-name">
                        <span class="pnl-item-icon">${cat.category_icon || '💵'}</span>
                        <span>${cat.category_name}</span>
                    </div>
                    <div class="pnl-item-amount">
                        ${formatCurrency(cat.total)}
                        <span class="pnl-item-percent">(${cat.percent}%)</span>
                    </div>
                </div>
            `).join('');
        } else {
            incomeContainer.innerHTML = '<div class="pnl-empty-message">No income recorded</div>';
        }
    }

    // Render expense items
    const expenseContainer = document.getElementById('pnl-expense-items');
    if (expenseContainer) {
        if (pnlData.expenses.categories.length > 0) {
            expenseContainer.innerHTML = pnlData.expenses.categories.map(cat => `
                <div class="pnl-item">
                    <div class="pnl-item-name">
                        <span class="pnl-item-icon">${cat.category_icon || '📁'}</span>
                        <span>${cat.category_name}</span>
                    </div>
                    <div class="pnl-item-amount">
                        ${formatCurrency(cat.total)}
                        <span class="pnl-item-percent">(${cat.percent}%)</span>
                    </div>
                </div>
            `).join('');
        } else {
            expenseContainer.innerHTML = '<div class="pnl-empty-message">No expenses recorded</div>';
        }
    }

    // Update totals
    document.getElementById('pnl-income-total').textContent = formatCurrency(pnlData.income.total);
    document.getElementById('pnl-expenses-total').textContent = formatCurrency(pnlData.expenses.total);

    // Update net income
    const netIncomeEl = document.getElementById('pnl-net-income');
    netIncomeEl.textContent = formatCurrency(pnlData.net_income);

    const netIncomeContainer = netIncomeEl.closest('.pnl-net-income');
    if (netIncomeContainer) {
        netIncomeContainer.classList.toggle('negative', pnlData.net_income < 0);
    }

    // Update summary cards
    document.getElementById('pnl-gross-margin').textContent = pnlData.summary.gross_margin + '%';
    document.getElementById('pnl-expense-ratio').textContent = pnlData.summary.expense_ratio + '%';
}

function updatePnlChart() {
    if (!pnlData || !pnlData.monthly || pnlData.monthly.length === 0) return;

    const canvas = document.getElementById('pnl-trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (pnlChart) {
        pnlChart.destroy();
    }

    const labels = pnlData.monthly.map(m => m.month_label);
    const incomeData = pnlData.monthly.map(m => m.income);
    const expenseData = pnlData.monthly.map(m => m.expenses);
    const netData = pnlData.monthly.map(m => m.net);

    pnlChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Net',
                    data: netData,
                    type: 'line',
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#6366f1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });

    reportState.pnlChart = pnlChart;
}

function exportPnlPdf() {
    if (!pnlData) {
        showToast('No data to export', 'warning');
        return;
    }

    // Create printable content
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Profit & Loss Statement</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { text-align: center; margin-bottom: 5px; }
                .date-range { text-align: center; color: #666; margin-bottom: 30px; }
                .section { margin-bottom: 20px; }
                .section-header { background: #f5f5f5; padding: 10px; font-weight: bold; display: flex; justify-content: space-between; }
                .section-header.income { background: #dcfce7; color: #166534; }
                .section-header.expense { background: #fee2e2; color: #991b1b; }
                .item { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee; }
                .net-income { background: #4f46e5; color: white; padding: 15px; display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-top: 20px; }
                .net-income.negative { background: #dc2626; }
                .summary { display: flex; justify-content: space-around; margin-top: 30px; padding: 20px; background: #f5f5f5; }
                .summary-item { text-align: center; }
                .summary-label { font-size: 12px; color: #666; }
                .summary-value { font-size: 24px; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Profit & Loss Statement</h1>
            <div class="date-range">${new Date(pnlData.period.start).toLocaleDateString()} - ${new Date(pnlData.period.end).toLocaleDateString()}</div>

            <div class="section">
                <div class="section-header income">
                    <span>Income</span>
                    <span>${formatCurrency(pnlData.income.total)}</span>
                </div>
                ${pnlData.income.categories.map(c => `
                    <div class="item">
                        <span>${c.category_name}</span>
                        <span>${formatCurrency(c.total)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="section">
                <div class="section-header expense">
                    <span>Expenses</span>
                    <span>${formatCurrency(pnlData.expenses.total)}</span>
                </div>
                ${pnlData.expenses.categories.map(c => `
                    <div class="item">
                        <span>${c.category_name}</span>
                        <span>${formatCurrency(c.total)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="net-income ${pnlData.net_income < 0 ? 'negative' : ''}">
                <span>Net Income</span>
                <span>${formatCurrency(pnlData.net_income)}</span>
            </div>

            <div class="summary">
                <div class="summary-item">
                    <div class="summary-label">Gross Margin</div>
                    <div class="summary-value">${pnlData.summary.gross_margin}%</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Expense Ratio</div>
                    <div class="summary-value">${pnlData.summary.expense_ratio}%</div>
                </div>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

function exportPnlExcel() {
    if (!pnlData) {
        showToast('No data to export', 'warning');
        return;
    }

    // Create CSV content
    let csv = 'Profit & Loss Statement\n';
    csv += `Period: ${pnlData.period.start} to ${pnlData.period.end}\n\n`;

    csv += 'INCOME\n';
    csv += 'Category,Amount,Percent\n';
    pnlData.income.categories.forEach(c => {
        csv += `"${c.category_name}",${c.total},${c.percent}%\n`;
    });
    csv += `Total Income,${pnlData.income.total},100%\n\n`;

    csv += 'EXPENSES\n';
    csv += 'Category,Amount,Percent\n';
    pnlData.expenses.categories.forEach(c => {
        csv += `"${c.category_name}",${c.total},${c.percent}%\n`;
    });
    csv += `Total Expenses,${pnlData.expenses.total},100%\n\n`;

    csv += `NET INCOME,${pnlData.net_income}\n`;
    csv += `Gross Margin,${pnlData.summary.gross_margin}%\n`;
    csv += `Expense Ratio,${pnlData.summary.expense_ratio}%\n`;

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${pnlData.period.start}-to-${pnlData.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('P&L exported to CSV', 'success');
}

// =====================================================
// Report Navigation Functions
// =====================================================

function changeReportPeriod(period) {
    reportPeriod = period;
    reportState.period = period;
    loadReportData();
}

async function switchReportTab(tabName) {
    document.querySelectorAll('.reports-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.reports-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.reports-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`report-${tabName}`).classList.add('active');

    // Re-render charts after tab is visible (Chart.js needs visible canvas)
    setTimeout(async () => {
        if (tabName === 'overview') {
            if (!reportData) await loadReportData();
            updateReportCharts();
        } else if (tabName === 'comparison') {
            if (!comparisonData) await loadComparisonData();
            updateComparisonTab();
        } else if (tabName === 'categories') {
            if (!reportData) await loadReportData();
            updateAllCategoriesList();
            updateCategoryPieCharts();
        } else if (tabName === 'custom') {
            await initCustomReport();
        } else if (tabName === 'pnl') {
            await loadPnlReport();
        }
    }, 50);
}

// =====================================================
// Report Overview Functions
// =====================================================

function updateReportOverview() {
    if (!reportData) return;

    const { summary } = reportData;

    document.getElementById('report-total-income').textContent = formatCurrency(summary.total_income);
    document.getElementById('report-total-expenses').textContent = formatCurrency(summary.total_expenses);

    const netEl = document.getElementById('report-net-income');
    netEl.textContent = formatCurrency(summary.net_income);
    netEl.className = 'report-card-value ' + (summary.net_income >= 0 ? 'text-success' : 'text-danger');

    const savingsEl = document.getElementById('report-savings-rate');
    savingsEl.textContent = summary.savings_rate + '%';
    savingsEl.className = 'report-card-value ' + (summary.savings_rate >= 0 ? 'text-success' : 'text-danger');

    updateReportCategoryList();
    updateReportMerchantList();
    updateAllCategoriesList();
}

function updateReportCategoryList() {
    const container = document.getElementById('report-category-list');
    const categories = reportData.expenses_by_category.slice(0, 8);
    const total = categories.reduce((sum, c) => sum + parseFloat(c.total), 0);

    container.innerHTML = categories.map(cat => {
        const percent = total > 0 ? ((parseFloat(cat.total) / total) * 100).toFixed(1) : 0;
        return `
            <div class="report-category-item">
                <div class="report-category-icon" style="background: ${cat.color || '#6366f1'}20; color: ${cat.color || '#6366f1'}">
                    ${cat.icon || '📁'}
                </div>
                <div class="report-category-info">
                    <div class="report-category-name">${cat.name}</div>
                    <div class="report-category-count">${cat.transaction_count} transactions</div>
                </div>
                <div>
                    <div class="report-category-amount">${formatCurrency(cat.total)}</div>
                    <div class="report-category-percent">${percent}%</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateReportMerchantList() {
    const container = document.getElementById('report-merchant-list');
    const merchants = reportData.top_merchants || [];

    container.innerHTML = merchants.map(m => `
        <div class="report-merchant-item">
            <div>
                <div style="font-weight: 500;">${m.vendor_name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${m.transaction_count} transactions</div>
            </div>
            <div class="report-category-amount">${formatCurrency(m.total_spent)}</div>
        </div>
    `).join('');
}

function updateAllCategoriesList() {
    const container = document.getElementById('report-all-categories');
    if (!container) return;

    const allCategories = [...(reportData.expenses_by_category || []), ...(reportData.income_by_category || [])];

    container.innerHTML = allCategories.map(cat => {
        const isIncome = (reportData.income_by_category || []).some(c => c.id === cat.id);
        return `
            <div class="report-category-item">
                <div class="report-category-icon" style="background: ${cat.color || '#6366f1'}20; color: ${cat.color || '#6366f1'}">
                    ${cat.icon || '📁'}
                </div>
                <div class="report-category-info">
                    <div class="report-category-name">${cat.name}</div>
                    <div class="report-category-count">${cat.transaction_count} transactions - ${isIncome ? 'Income' : 'Expense'}</div>
                </div>
                <div>
                    <div class="report-category-amount" style="color: ${isIncome ? 'var(--success)' : 'var(--danger)'}">
                        ${isIncome ? '+' : '-'}${formatCurrency(cat.total)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// Chart Functions
// =====================================================

function updateReportCharts() {
    if (!reportData) return;

    // Expense Doughnut Chart
    const expenseCtx = document.getElementById('report-expense-chart');
    if (expenseCtx) {
        if (reportCharts.expense) reportCharts.expense.destroy();

        const expenseData = reportData.expenses_by_category.slice(0, 8);
        reportCharts.expense = new Chart(expenseCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: expenseData.map(c => c.name),
                datasets: [{
                    data: expenseData.map(c => parseFloat(c.total)),
                    backgroundColor: expenseData.map(c => c.color || '#6366f1'),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, padding: 8 } }
                }
            }
        });
    }

    // Daily Trend Chart
    const trendCtx = document.getElementById('report-trend-chart');
    if (trendCtx) {
        if (reportCharts.trend) reportCharts.trend.destroy();

        const trendData = reportData.daily_trend || [];
        reportCharts.trend = new Chart(trendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: trendData.map(d => {
                    const date = new Date(d.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Expenses',
                    data: trendData.map(d => parseFloat(d.expenses)),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3
                }, {
                    label: 'Income',
                    data: trendData.map(d => parseFloat(d.income)),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => '$' + value.toLocaleString() }
                    }
                }
            }
        });
    }

    // Category Pie Charts
    updateCategoryPieCharts();
}

function updateCategoryPieCharts() {
    const categoryPieCtx = document.getElementById('report-category-pie');
    if (categoryPieCtx) {
        if (reportCharts.categoryPie) reportCharts.categoryPie.destroy();

        const expenseData = reportData.expenses_by_category.slice(0, 8);
        reportCharts.categoryPie = new Chart(categoryPieCtx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: expenseData.map(c => c.name),
                datasets: [{
                    data: expenseData.map(c => parseFloat(c.total)),
                    backgroundColor: expenseData.map(c => c.color || '#6366f1'),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } } }
            }
        });
    }

    const incomePieCtx = document.getElementById('report-income-pie');
    if (incomePieCtx) {
        if (reportCharts.incomePie) reportCharts.incomePie.destroy();

        const incomeData = reportData.income_by_category || [];
        reportCharts.incomePie = new Chart(incomePieCtx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: incomeData.map(c => c.name),
                datasets: [{
                    data: incomeData.map(c => parseFloat(c.total)),
                    backgroundColor: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } } }
            }
        });
    }
}

function updateComparisonTab() {
    if (!comparisonData) return;

    const { averages, mom_expense_change, monthly_data } = comparisonData;

    document.getElementById('report-avg-income').textContent = formatCurrency(averages.income);
    document.getElementById('report-avg-expenses').textContent = formatCurrency(averages.expenses);

    const momEl = document.getElementById('report-mom-change');
    if (mom_expense_change !== null) {
        momEl.textContent = (mom_expense_change >= 0 ? '+' : '') + mom_expense_change + '%';
        momEl.className = 'report-card-value ' + (mom_expense_change <= 0 ? 'text-success' : 'text-danger');
    }

    // Comparison Bar Chart
    const ctx = document.getElementById('report-comparison-chart');
    if (ctx) {
        if (reportCharts.comparison) reportCharts.comparison.destroy();

        reportCharts.comparison = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: monthly_data.map(m => m.month_label),
                datasets: [{
                    label: 'Income',
                    data: monthly_data.map(m => m.income),
                    backgroundColor: '#10b981'
                }, {
                    label: 'Expenses',
                    data: monthly_data.map(m => m.expenses),
                    backgroundColor: '#ef4444'
                }, {
                    label: 'Net',
                    data: monthly_data.map(m => m.net),
                    type: 'line',
                    borderColor: '#6366f1',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => '$' + value.toLocaleString() }
                    }
                }
            }
        });
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================

window.loadReportsPage = loadReportsPage;
window.loadReportData = loadReportData;
window.loadComparisonData = loadComparisonData;
window.loadPnlReport = loadPnlReport;
window.changePnlPeriod = changePnlPeriod;
window.applyPnlCustomDates = applyPnlCustomDates;
window.exportPnlPdf = exportPnlPdf;
window.exportPnlExcel = exportPnlExcel;
window.changeReportPeriod = changeReportPeriod;
window.switchReportTab = switchReportTab;
window.updateReportOverview = updateReportOverview;
window.updateReportCharts = updateReportCharts;
window.updateComparisonTab = updateComparisonTab;
