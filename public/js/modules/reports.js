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
        case 'all':
            startDate = new Date(2000, 0, 1);
            endDate = today;
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

    // Render expense items with accordion for subcategories
    const expenseContainer = document.getElementById('pnl-expense-items');
    if (expenseContainer) {
        const hierarchy = pnlData.expenses.categories_hierarchy || [];
        if (hierarchy.length > 0) {
            expenseContainer.innerHTML = hierarchy.map(cat => {
                const hasChildren = cat.children && cat.children.length > 0;
                const childrenHtml = hasChildren ? cat.children.map(child => `
                    <div class="pnl-sub-item-group" data-category-id="${child.category_id}">
                        <div class="pnl-sub-item expandable" onclick="togglePnlSubCategory(this, ${child.category_id})">
                            <div class="pnl-item-name">
                                <span class="pnl-expand-icon">▶</span>
                                <span class="pnl-item-icon">${child.category_icon || '📁'}</span>
                                <span>${child.category_name}</span>
                            </div>
                            <div class="pnl-item-amount">
                                ${formatCurrency(child.total)}
                                <span class="pnl-item-percent">(${child.percent}%)</span>
                            </div>
                        </div>
                        <div class="pnl-transactions" id="pnl-txns-${child.category_id}">
                            <div class="pnl-txn-loading">Loading transactions...</div>
                        </div>
                    </div>
                `).join('') : '';

                return `
                    <div class="pnl-item-group ${hasChildren ? 'has-children' : ''}">
                        <div class="pnl-item ${hasChildren ? 'expandable' : ''}" onclick="${hasChildren ? 'togglePnlCategory(this)' : ''}">
                            <div class="pnl-item-name">
                                ${hasChildren ? '<span class="pnl-expand-icon">▶</span>' : ''}
                                <span class="pnl-item-icon">${cat.category_icon || '📁'}</span>
                                <span>${cat.category_name}</span>
                                ${hasChildren ? `<span class="pnl-child-count">(${cat.children.length})</span>` : ''}
                            </div>
                            <div class="pnl-item-amount">
                                ${formatCurrency(cat.total)}
                                <span class="pnl-item-percent">(${cat.percent}%)</span>
                            </div>
                        </div>
                        ${hasChildren ? `<div class="pnl-sub-items">${childrenHtml}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else if (pnlData.expenses.categories.length > 0) {
            // Fallback to flat list
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

// Open the export modal instead of direct export
function exportPnlPdf() {
    openPnlExportModal('pdf');
}

function exportPnlExcel() {
    openPnlExportModal('excel');
}

// Store category data for modal
let pnlExportCategoryData = null;

/**
 * Open P&L Export Modal
 */
async function openPnlExportModal(defaultFormat = null) {
    if (!pnlData) {
        showToast('No data to export. Please load a P&L report first.', 'warning');
        return;
    }

    const modal = document.getElementById('pnl-export-modal');
    if (!modal) return;

    // Reset to summary mode
    document.querySelector('input[name="pnl-export-type"][value="summary"]').checked = true;
    document.getElementById('pnl-category-selection').style.display = 'none';

    // Set up radio button listeners
    const radioButtons = document.querySelectorAll('input[name="pnl-export-type"]');
    radioButtons.forEach(radio => {
        radio.onchange = () => {
            const categorySection = document.getElementById('pnl-category-selection');
            if (radio.value === 'detailed' && radio.checked) {
                categorySection.style.display = 'block';
                loadExportCategoryList();
            } else {
                categorySection.style.display = 'none';
            }
        };
    });

    // Show modal
    modal.classList.add('active');
}

/**
 * Close P&L Export Modal
 */
function closePnlExportModal() {
    const modal = document.getElementById('pnl-export-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Load category list for export selection
 */
async function loadExportCategoryList() {
    const listContainer = document.getElementById('pnl-category-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="export-loading">Loading categories...</div>';

    // Fetch detailed data to get categories with amounts
    const userId = state.currentUser;

    try {
        const response = await fetch(`${API_BASE}/reports/profit-loss-detail.php?user_id=${userId}&start_date=${pnlData.period.start}&end_date=${pnlData.period.end}`);
        const result = await response.json();

        if (result.success) {
            pnlExportCategoryData = result.data;
            renderExportCategoryList(result.data);
        } else {
            // Fallback to summary data
            pnlExportCategoryData = pnlData;
            renderExportCategoryList(pnlData);
        }
    } catch (e) {
        console.error('Failed to load categories:', e);
        // Fallback to summary data
        pnlExportCategoryData = pnlData;
        renderExportCategoryList(pnlData);
    }
}

/**
 * Render the category list with checkboxes
 */
function renderExportCategoryList(data) {
    const listContainer = document.getElementById('pnl-category-list');
    if (!listContainer) return;

    const formatMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

    let html = '';

    // Income section
    if (data.income && data.income.categories && data.income.categories.length > 0) {
        html += '<div class="export-section-header income">Income</div>';
        data.income.categories.forEach(cat => {
            html += renderCategoryGroup(cat, 'income', formatMoney);
        });
    }

    // Expense section
    if (data.expenses && data.expenses.categories && data.expenses.categories.length > 0) {
        html += '<div class="export-section-header expense">Expenses</div>';
        data.expenses.categories.forEach(cat => {
            html += renderCategoryGroup(cat, 'expense', formatMoney);
        });
    }

    if (!html) {
        html = '<div class="export-loading">No categories with transactions</div>';
    }

    listContainer.innerHTML = html;
}

/**
 * Render a category group (parent + children)
 */
function renderCategoryGroup(cat, type, formatMoney) {
    const catId = cat.category_id;
    const hasChildren = cat.children && cat.children.length > 0;

    let html = `<div class="export-category-group" data-type="${type}">
        <div class="export-category-parent">
            <div class="export-category-parent-left">
                <input type="checkbox" id="export-cat-${catId}" value="${catId}" checked onchange="toggleExportCategory(${catId}, this.checked)">
                <span class="export-category-icon">${cat.category_icon || (type === 'income' ? '💰' : '💸')}</span>
                <span class="export-category-name">${cat.category_name}</span>
            </div>
            <span class="export-category-amount">${formatMoney(cat.total)}</span>
        </div>`;

    if (hasChildren) {
        html += '<div class="export-category-children">';
        cat.children.forEach(child => {
            html += `<div class="export-category-child">
                <div class="export-category-child-left">
                    <input type="checkbox" id="export-cat-${child.category_id}" value="${child.category_id}" data-parent="${catId}" checked>
                    <span class="export-category-name">${child.category_name}</span>
                </div>
                <span class="export-category-amount">${formatMoney(child.total)}</span>
            </div>`;
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

/**
 * Toggle all categories on/off
 */
function toggleAllPnlCategories(checked) {
    const checkboxes = document.querySelectorAll('#pnl-category-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Toggle parent category and its children
 */
function toggleExportCategory(parentId, checked) {
    // Toggle all children of this parent
    const childCheckboxes = document.querySelectorAll(`#pnl-category-list input[data-parent="${parentId}"]`);
    childCheckboxes.forEach(cb => {
        cb.checked = checked;
    });

    // Update select all checkbox
    updateSelectAllCheckbox();
}

/**
 * Update the "Select All" checkbox state
 */
function updateSelectAllCheckbox() {
    const allCheckboxes = document.querySelectorAll('#pnl-category-list input[type="checkbox"]');
    const checkedCount = document.querySelectorAll('#pnl-category-list input[type="checkbox"]:checked').length;
    const selectAllCb = document.getElementById('pnl-select-all');

    if (selectAllCb) {
        selectAllCb.checked = checkedCount === allCheckboxes.length;
        selectAllCb.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }
}

/**
 * Execute P&L Export with selected options
 */
async function executePnlExport(format) {
    const exportType = document.querySelector('input[name="pnl-export-type"]:checked')?.value || 'summary';

    if (exportType === 'summary') {
        // Simple summary export
        closePnlExportModal();
        if (format === 'pdf') {
            exportPnlPdfSummary();
        } else {
            exportPnlExcelSimple();
        }
        return;
    }

    // Detailed export with category selection
    const selectedCategories = getSelectedExportCategories();

    if (selectedCategories.length === 0) {
        showToast('Please select at least one category', 'warning');
        return;
    }

    closePnlExportModal();
    showToast(`Generating detailed ${format.toUpperCase()}...`, 'info');

    // Filter data by selected categories
    const filteredData = filterDataByCategories(pnlExportCategoryData || pnlData, selectedCategories);

    if (format === 'pdf') {
        exportPnlPdfDetailed(filteredData);
    } else {
        exportPnlExcelDetailed(filteredData);
    }
}

/**
 * Get list of selected category IDs
 */
function getSelectedExportCategories() {
    const checkboxes = document.querySelectorAll('#pnl-category-list input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

/**
 * Filter P&L data by selected categories
 */
function filterDataByCategories(data, selectedCategoryIds) {
    const filtered = {
        period: data.period,
        income: { categories: [], total: 0 },
        expenses: { categories: [], total: 0 },
        net_income: 0
    };

    // Filter income categories
    if (data.income && data.income.categories) {
        data.income.categories.forEach(cat => {
            if (selectedCategoryIds.includes(cat.category_id)) {
                // Include parent with filtered children
                const filteredCat = { ...cat };
                if (cat.children) {
                    filteredCat.children = cat.children.filter(child =>
                        selectedCategoryIds.includes(child.category_id)
                    );
                    // Recalculate total if children were filtered
                    if (filteredCat.children.length !== cat.children.length) {
                        filteredCat.total = filteredCat.children.reduce((sum, c) => sum + (c.total || 0), 0);
                        if (cat.transactions) {
                            filteredCat.total += cat.transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                        }
                    }
                }
                filtered.income.categories.push(filteredCat);
                filtered.income.total += filteredCat.total;
            }
        });
    }

    // Filter expense categories
    if (data.expenses && data.expenses.categories) {
        data.expenses.categories.forEach(cat => {
            if (selectedCategoryIds.includes(cat.category_id)) {
                const filteredCat = { ...cat };
                if (cat.children) {
                    filteredCat.children = cat.children.filter(child =>
                        selectedCategoryIds.includes(child.category_id)
                    );
                    if (filteredCat.children.length !== cat.children.length) {
                        filteredCat.total = filteredCat.children.reduce((sum, c) => sum + (c.total || 0), 0);
                        if (cat.transactions) {
                            filteredCat.total += cat.transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
                        }
                    }
                }
                filtered.expenses.categories.push(filteredCat);
                filtered.expenses.total += filteredCat.total;
            }
        });
    }

    filtered.net_income = filtered.income.total - filtered.expenses.total;
    return filtered;
}

/**
 * Export PDF - Summary with transaction details
 */
function exportPnlPdfSummary() {
    // Use detailed data if available, otherwise use summary data
    const detailedData = pnlExportCategoryData || pnlData;
    const printContent = generateSummaryPnlHtml(detailedData, pnlData);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

/**
 * Export PDF - Detailed with transactions
 */
function exportPnlPdfDetailed(data) {
    const printContent = generateDetailedPnlHtml(data, pnlData);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

/**
 * Export Excel - Detailed with transactions (Real XLSX with formatting)
 */
async function exportPnlExcelDetailed(data) {
    // Check if ExcelJS is available
    if (typeof ExcelJS === 'undefined') {
        console.warn('ExcelJS not loaded, falling back to CSV');
        exportPnlExcelDetailedCsv(data);
        return;
    }

    try {
        showToast('Generating Excel file...', 'info');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Expense Tracker';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('P&L Statement', {
            pageSetup: { paperSize: 9, orientation: 'portrait' }
        });

        // Set column widths
        sheet.columns = [
            { width: 35 },  // Type
            { width: 12 },  // Date
            { width: 20 },  // Name
            { width: 40 },  // Memo
            { width: 15 },  // Amount
            { width: 15 }   // Balance
        ];

        // Styles
        const titleStyle = {
            font: { bold: true, size: 16 },
            alignment: { horizontal: 'center' }
        };
        const dateRangeStyle = {
            font: { size: 11, color: { argb: 'FF666666' } },
            alignment: { horizontal: 'center' }
        };
        const headerStyle = {
            font: { bold: true, size: 10 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
            border: { bottom: { style: 'medium', color: { argb: 'FFDDDDDD' } } },
            alignment: { horizontal: 'left' }
        };
        const sectionHeaderStyle = {
            font: { bold: true, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
        };
        const sectionHeaderExpenseStyle = {
            font: { bold: true, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }
        };
        const categoryHeaderStyle = {
            font: { bold: true, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }
        };
        const subcategoryHeaderStyle = {
            font: { bold: true, size: 10, color: { argb: 'FF555555' } }
        };
        const transactionStyle = {
            font: { size: 10 }
        };
        const subtotalStyle = {
            font: { bold: true, size: 10 },
            border: { top: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
        };
        const categoryTotalStyle = {
            font: { bold: true, size: 10 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
            border: { top: { style: 'medium', color: { argb: 'FF999999' } } }
        };
        const sectionTotalStyle = {
            font: { bold: true, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
            border: { top: { style: 'medium', color: { argb: 'FF666666' } } }
        };
        const netIncomeStyle = {
            font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } }
        };
        const netIncomeNegativeStyle = {
            font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB71C1C' } }
        };
        const amountStyle = { alignment: { horizontal: 'right' }, numFmt: '"$"#,##0.00' };

        let rowNum = 1;

        // Title
        sheet.mergeCells(`A${rowNum}:F${rowNum}`);
        const titleRow = sheet.getRow(rowNum);
        titleRow.getCell(1).value = 'Profit & Loss Statement';
        titleRow.getCell(1).style = titleStyle;
        titleRow.height = 25;
        rowNum++;

        // Date Range
        sheet.mergeCells(`A${rowNum}:F${rowNum}`);
        const dateRow = sheet.getRow(rowNum);
        dateRow.getCell(1).value = `${pnlData.period.start} through ${pnlData.period.end}`;
        dateRow.getCell(1).style = dateRangeStyle;
        rowNum += 2;

        // Header Row
        const headerRow = sheet.getRow(rowNum);
        ['Type', 'Date', 'Name', 'Memo', 'Amount', 'Balance'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.style = { ...headerStyle };
            if (i >= 4) cell.style.alignment = { horizontal: 'right' };
        });
        rowNum++;

        // Helper function to add a row
        const addRow = (values, style, indent = 0) => {
            const row = sheet.getRow(rowNum);
            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                if (i === 0 && indent > 0) {
                    cell.value = '    '.repeat(indent) + (v || '');
                } else {
                    cell.value = v;
                }
                if (style) {
                    cell.style = { ...style };
                }
                if (i >= 4 && typeof v === 'number') {
                    cell.style = { ...cell.style, ...amountStyle };
                }
            });
            rowNum++;
            return row;
        };

        // ===== INCOME SECTION =====
        const incomeHeaderRow = addRow(['Income', '', '', '', '', ''], sectionHeaderStyle);
        sheet.mergeCells(`A${incomeHeaderRow.number}:F${incomeHeaderRow.number}`);

        if (data.income && data.income.categories) {
            data.income.categories.forEach(cat => {
                // Category header
                const catRow = addRow([cat.category_name, '', '', '', '', ''], categoryHeaderStyle);
                sheet.mergeCells(`A${catRow.number}:F${catRow.number}`);

                // Children
                if (cat.children && cat.children.length > 0) {
                    cat.children.forEach(child => {
                        // Subcategory header
                        addRow([child.category_name, '', '', '', '', ''], subcategoryHeaderStyle, 1);

                        // Transactions
                        if (child.transactions && child.transactions.length > 0) {
                            let rb = 0;
                            child.transactions.forEach(txn => {
                                rb += txn.amount;
                                addRow([
                                    txn.type || 'Deposit',
                                    formatDateForExcel(txn.date),
                                    '',
                                    txn.memo || txn.description || '',
                                    txn.amount,
                                    rb
                                ], transactionStyle, 2);
                            });
                        }

                        // Subcategory total
                        addRow([`Total ${child.category_name}`, '', '', '', child.total, child.total], subtotalStyle, 1);
                    });
                }

                // Direct transactions
                if (cat.transactions && cat.transactions.length > 0) {
                    let rb = 0;
                    cat.transactions.forEach(txn => {
                        rb += txn.amount;
                        addRow([
                            txn.type || 'Deposit',
                            formatDateForExcel(txn.date),
                            '',
                            txn.memo || txn.description || '',
                            txn.amount,
                            rb
                        ], transactionStyle, 1);
                    });
                }

                // Category total
                addRow([`Total ${cat.category_name}`, '', '', '', cat.total, cat.total], categoryTotalStyle);

                // Blank row
                rowNum++;
            });
        }

        // Total Income
        addRow(['Total Income', '', '', '', data.income.total, data.income.total], sectionTotalStyle);
        rowNum++;

        // ===== EXPENSE SECTION =====
        const expenseHeaderRow = addRow(['Expense', '', '', '', '', ''], sectionHeaderExpenseStyle);
        sheet.mergeCells(`A${expenseHeaderRow.number}:F${expenseHeaderRow.number}`);

        if (data.expenses && data.expenses.categories) {
            data.expenses.categories.forEach(cat => {
                // Category header
                const catRow = addRow([cat.category_name, '', '', '', '', ''], categoryHeaderStyle);
                sheet.mergeCells(`A${catRow.number}:F${catRow.number}`);

                // Children
                if (cat.children && cat.children.length > 0) {
                    cat.children.forEach(child => {
                        // Subcategory header
                        addRow([child.category_name, '', '', '', '', ''], subcategoryHeaderStyle, 1);

                        // Transactions
                        if (child.transactions && child.transactions.length > 0) {
                            let rb = 0;
                            child.transactions.forEach(txn => {
                                rb += txn.amount;
                                addRow([
                                    txn.type || 'Check',
                                    formatDateForExcel(txn.date),
                                    '',
                                    txn.memo || txn.description || '',
                                    txn.amount,
                                    rb
                                ], transactionStyle, 2);
                            });
                        }

                        // Subcategory total
                        addRow([`Total ${child.category_name}`, '', '', '', child.total, child.total], subtotalStyle, 1);
                    });
                }

                // Direct transactions
                if (cat.transactions && cat.transactions.length > 0) {
                    let rb = 0;
                    cat.transactions.forEach(txn => {
                        rb += txn.amount;
                        addRow([
                            txn.type || 'Check',
                            formatDateForExcel(txn.date),
                            '',
                            txn.memo || txn.description || '',
                            txn.amount,
                            rb
                        ], transactionStyle, 1);
                    });
                }

                // Category total
                addRow([`Total ${cat.category_name}`, '', '', '', cat.total, cat.total], categoryTotalStyle);

                // Blank row
                rowNum++;
            });
        }

        // Total Expense
        addRow(['Total Expense', '', '', '', data.expenses.total, data.expenses.total], sectionTotalStyle);
        rowNum++;

        // Net Income
        const netStyle = data.net_income >= 0 ? netIncomeStyle : netIncomeNegativeStyle;
        addRow(['Net Income', '', '', '', data.net_income, data.net_income], netStyle);

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `P&L_Detail_${pnlData.period.start}_to_${pnlData.period.end}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('P&L exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed, using CSV fallback', 'warning');
        exportPnlExcelDetailedCsv(data);
    }
}

/**
 * Fallback CSV export
 */
function exportPnlExcelDetailedCsv(data) {
    const csv = generateDetailedPnlCsv(data);
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `P&L_Detail_${pnlData.period.start}_to_${pnlData.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Detailed P&L exported to CSV', 'success');
}

function formatDateForExcel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Generate Summary HTML for PDF with transaction details
 */
function generateSummaryPnlHtml(data, summaryData) {
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const formatMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

    // Use summaryData for period if available, otherwise use data
    const periodData = summaryData || data;

    // Helper to build transaction rows
    const buildTransactionRows = (transactions, indent = 40) => {
        if (!transactions || transactions.length === 0) return '';
        let rows = '';
        let rb = 0;
        transactions.forEach(txn => {
            rb += txn.amount;
            rows += `<tr class="transaction">
                <td style="padding-left: ${indent}px;">${txn.type || 'Transaction'}</td>
                <td>${formatDate(txn.date)}</td>
                <td>${txn.name || ''}</td>
                <td class="memo">${txn.memo || txn.description || ''}</td>
                <td class="amount">${formatMoney(txn.amount)}</td>
                <td class="amount">${formatMoney(rb)}</td>
            </tr>`;
        });
        return rows;
    };

    let incomeRows = '';
    if (data.income && data.income.categories) {
        data.income.categories.forEach(cat => {
            // Category header
            incomeRows += `<tr class="category-header"><td colspan="6">${cat.category_icon || ''} ${cat.category_name}</td></tr>`;

            // Children (subcategories)
            if (cat.children && cat.children.length > 0) {
                cat.children.forEach(child => {
                    incomeRows += `<tr class="subcategory-header"><td colspan="6" style="padding-left: 20px;">${child.category_icon || ''} ${child.category_name}</td></tr>`;
                    incomeRows += buildTransactionRows(child.transactions, 40);
                    if (child.transactions && child.transactions.length > 0) {
                        incomeRows += `<tr class="subtotal"><td colspan="4" style="padding-left: 20px;">Total ${child.category_name}</td><td class="amount">${formatMoney(child.total)}</td><td class="amount">${formatMoney(child.total)}</td></tr>`;
                    }
                });
            }

            // Direct transactions on category
            if (cat.transactions && cat.transactions.length > 0) {
                incomeRows += buildTransactionRows(cat.transactions, 20);
            }

            // Category total
            incomeRows += `<tr class="category-total"><td colspan="4">Total ${cat.category_name}</td><td class="amount">${formatMoney(cat.total)}</td><td class="amount">${formatMoney(cat.total)}</td></tr>`;
        });
    }

    let expenseRows = '';
    const hierarchy = data.expenses?.categories_hierarchy || data.expenses?.categories || [];
    hierarchy.forEach(cat => {
        // Category header
        expenseRows += `<tr class="category-header"><td colspan="6">${cat.category_icon || ''} ${cat.category_name}</td></tr>`;

        // Children (subcategories)
        if (cat.children && cat.children.length > 0) {
            cat.children.forEach(child => {
                expenseRows += `<tr class="subcategory-header"><td colspan="6" style="padding-left: 20px;">${child.category_icon || ''} ${child.category_name}</td></tr>`;
                expenseRows += buildTransactionRows(child.transactions, 40);
                if (child.transactions && child.transactions.length > 0) {
                    expenseRows += `<tr class="subtotal"><td colspan="4" style="padding-left: 20px;">Total ${child.category_name}</td><td class="amount">${formatMoney(child.total)}</td><td class="amount">${formatMoney(child.total)}</td></tr>`;
                }
            });
        }

        // Direct transactions on category
        if (cat.transactions && cat.transactions.length > 0) {
            expenseRows += buildTransactionRows(cat.transactions, 20);
        }

        // Category total
        expenseRows += `<tr class="category-total"><td colspan="4">Total ${cat.category_name}</td><td class="amount">${formatMoney(cat.total)}</td><td class="amount">${formatMoney(cat.total)}</td></tr>`;
    });

    return `<!DOCTYPE html>
<html>
<head>
    <title>Profit & Loss Statement</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; }
        h1 { text-align: center; margin-bottom: 5px; font-size: 18px; }
        .date-range { text-align: center; color: #666; margin-bottom: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f5; padding: 8px 5px; text-align: left; border-bottom: 2px solid #ddd; font-size: 10px; }
        th.amount { text-align: right; }
        td { padding: 4px 5px; border-bottom: 1px solid #eee; vertical-align: top; }
        td.amount { text-align: right; font-family: 'Consolas', monospace; }
        td.memo { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: #666; }
        .section-header { background: #e8f5e9; font-weight: bold; font-size: 13px; }
        .section-header.expense { background: #ffebee; }
        .category-header td { font-weight: bold; padding-top: 10px; background: #fafafa; }
        .subcategory-header td { font-weight: 600; font-size: 10px; color: #555; }
        .transaction td { font-size: 10px; }
        .subtotal td { font-weight: 500; font-size: 10px; border-top: 1px solid #ccc; }
        .category-total td { font-weight: bold; background: #f5f5f5; border-top: 2px solid #999; }
        .section-total td { font-weight: bold; font-size: 12px; background: #e0e0e0; border-top: 2px solid #666; }
        .net-income td { font-weight: bold; font-size: 14px; background: #1a237e; color: white; }
        .net-income.negative td { background: #b71c1c; }
        @media print {
            body { padding: 0; }
            .transaction td { font-size: 9px; }
        }
    </style>
</head>
<body>
    <h1>Profit & Loss Statement</h1>
    <div class="date-range">${periodData.period.start} through ${periodData.period.end}</div>

    <table>
        <thead>
            <tr>
                <th>Type</th>
                <th>Date</th>
                <th>Name</th>
                <th>Memo</th>
                <th class="amount">Amount</th>
                <th class="amount">Balance</th>
            </tr>
        </thead>
        <tbody>
            <tr class="section-header"><td colspan="6">Income</td></tr>
            ${incomeRows}
            <tr class="section-total"><td colspan="4">Total Income</td><td class="amount">${formatMoney(data.income?.total || 0)}</td><td class="amount">${formatMoney(data.income?.total || 0)}</td></tr>

            <tr class="section-header expense"><td colspan="6">Expenses</td></tr>
            ${expenseRows}
            <tr class="section-total"><td colspan="4">Total Expenses</td><td class="amount">${formatMoney(data.expenses?.total || 0)}</td><td class="amount">${formatMoney(data.expenses?.total || 0)}</td></tr>

            <tr class="net-income ${data.net_income < 0 ? 'negative' : ''}">
                <td colspan="4">Net Income</td>
                <td class="amount">${formatMoney(data.net_income || 0)}</td>
                <td class="amount">${formatMoney(data.net_income || 0)}</td>
            </tr>
        </tbody>
    </table>
</body>
</html>`;
}

function exportPnlExcelSimple() {
    // Fallback simple export
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

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${pnlData.period.start}-to-${pnlData.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('P&L exported to CSV', 'success');
}

/**
 * Generate CSV for detailed P&L (matching PDF format exactly)
 */
function generateDetailedPnlCsv(data) {
    // Header row
    let csv = 'Type,Date,Name,Memo,Amount,Balance\n';

    // ===== INCOME SECTION =====
    csv += 'Income,,,,,\n';

    // Build income rows
    if (data.income && data.income.categories) {
        data.income.categories.forEach(cat => {
            const hasChildren = cat.children && cat.children.length > 0;

            // Parent Category header (bold style - uppercase or prefix)
            csv += `"${escapeCSV(cat.category_name)}",,,,,\n`;

            // Children categories
            if (hasChildren) {
                cat.children.forEach(child => {
                    // Subcategory header (indented)
                    csv += `"    ${escapeCSV(child.category_name)}",,,,,\n`;

                    // Transactions for subcategory
                    if (child.transactions && child.transactions.length > 0) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            csv += `"        ${txn.type || 'Deposit'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                        });
                    }

                    // Subcategory total
                    csv += `"    Total ${escapeCSV(child.category_name)}",,,,"${formatAmountForCsv(child.total)}","${formatAmountForCsv(child.total)}"\n`;
                });
            }

            // Direct transactions for parent category (no children)
            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    csv += `"    ${txn.type || 'Deposit'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                });
            }

            // Parent Category total
            csv += `"Total ${escapeCSV(cat.category_name)}",,,,"${formatAmountForCsv(cat.total)}","${formatAmountForCsv(cat.total)}"\n`;

            // Blank line between categories
            csv += ',,,,,\n';
        });
    }

    // Total Income (section total)
    csv += `"Total Income",,,,"${formatAmountForCsv(data.income.total)}","${formatAmountForCsv(data.income.total)}"\n`;

    // Blank line separator
    csv += ',,,,,\n';

    // ===== EXPENSE SECTION =====
    csv += 'Expense,,,,,\n';

    // Build expense rows
    if (data.expenses && data.expenses.categories) {
        data.expenses.categories.forEach(cat => {
            const hasChildren = cat.children && cat.children.length > 0;

            // Parent Category header
            csv += `"${escapeCSV(cat.category_name)}",,,,,\n`;

            // Children categories
            if (hasChildren) {
                cat.children.forEach(child => {
                    // Subcategory header (indented)
                    csv += `"    ${escapeCSV(child.category_name)}",,,,,\n`;

                    // Transactions for subcategory
                    if (child.transactions && child.transactions.length > 0) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            csv += `"        ${txn.type || 'Check'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                        });
                    }

                    // Subcategory total
                    csv += `"    Total ${escapeCSV(child.category_name)}",,,,"${formatAmountForCsv(child.total)}","${formatAmountForCsv(child.total)}"\n`;
                });
            }

            // Direct transactions for parent category (no children)
            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    csv += `"    ${txn.type || 'Check'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                });
            }

            // Parent Category total
            csv += `"Total ${escapeCSV(cat.category_name)}",,,,"${formatAmountForCsv(cat.total)}","${formatAmountForCsv(cat.total)}"\n`;

            // Blank line between categories
            csv += ',,,,,\n';
        });
    }

    // Total Expense (section total)
    csv += `"Total Expense",,,,"${formatAmountForCsv(data.expenses.total)}","${formatAmountForCsv(data.expenses.total)}"\n`;

    // Blank line separator
    csv += ',,,,,\n';

    // ===== NET INCOME =====
    csv += `"Net Income",,,,"${formatAmountForCsv(data.net_income)}","${formatAmountForCsv(data.net_income)}"\n`;

    return csv;
}

/**
 * Generate QuickBooks-style HTML for PDF
 */
function generateDetailedPnlHtml(data, summaryData) {
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const formatMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

    let incomeRows = '';
    let expenseRows = '';

    // Build income rows
    if (data.income && data.income.categories) {
        data.income.categories.forEach(cat => {
            incomeRows += `<tr class="category-header"><td colspan="6">${cat.category_name}</td></tr>`;

            if (cat.children && cat.children.length > 0) {
                cat.children.forEach(child => {
                    incomeRows += `<tr class="subcategory-header"><td colspan="6" style="padding-left: 20px;">${child.category_name}</td></tr>`;

                    if (child.transactions) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            incomeRows += `<tr class="transaction">
                                <td style="padding-left: 40px;">${txn.type}</td>
                                <td>${formatDate(txn.date)}</td>
                                <td>${txn.name || ''}</td>
                                <td class="memo">${txn.memo || txn.description || ''}</td>
                                <td class="amount">${formatMoney(txn.amount)}</td>
                                <td class="amount">${formatMoney(rb)}</td>
                            </tr>`;
                        });
                    }
                    incomeRows += `<tr class="subtotal"><td colspan="4" style="padding-left: 20px;">Total ${child.category_name}</td><td class="amount">${formatMoney(child.total)}</td><td class="amount">${formatMoney(child.total)}</td></tr>`;
                });
            }

            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    incomeRows += `<tr class="transaction">
                        <td style="padding-left: 20px;">${txn.type}</td>
                        <td>${formatDate(txn.date)}</td>
                        <td>${txn.name || ''}</td>
                        <td class="memo">${txn.memo || txn.description || ''}</td>
                        <td class="amount">${formatMoney(txn.amount)}</td>
                        <td class="amount">${formatMoney(rb)}</td>
                    </tr>`;
                });
            }

            incomeRows += `<tr class="category-total"><td colspan="4">Total ${cat.category_name}</td><td class="amount">${formatMoney(cat.total)}</td><td class="amount">${formatMoney(cat.total)}</td></tr>`;
        });
    }

    // Build expense rows
    if (data.expenses && data.expenses.categories) {
        data.expenses.categories.forEach(cat => {
            expenseRows += `<tr class="category-header"><td colspan="6">${cat.category_name}</td></tr>`;

            if (cat.children && cat.children.length > 0) {
                cat.children.forEach(child => {
                    expenseRows += `<tr class="subcategory-header"><td colspan="6" style="padding-left: 20px;">${child.category_name}</td></tr>`;

                    if (child.transactions) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            expenseRows += `<tr class="transaction">
                                <td style="padding-left: 40px;">${txn.type}</td>
                                <td>${formatDate(txn.date)}</td>
                                <td>${txn.name || ''}</td>
                                <td class="memo">${txn.memo || txn.description || ''}</td>
                                <td class="amount">${formatMoney(txn.amount)}</td>
                                <td class="amount">${formatMoney(rb)}</td>
                            </tr>`;
                        });
                    }
                    expenseRows += `<tr class="subtotal"><td colspan="4" style="padding-left: 20px;">Total ${child.category_name}</td><td class="amount">${formatMoney(child.total)}</td><td class="amount">${formatMoney(child.total)}</td></tr>`;
                });
            }

            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    expenseRows += `<tr class="transaction">
                        <td style="padding-left: 20px;">${txn.type}</td>
                        <td>${formatDate(txn.date)}</td>
                        <td>${txn.name || ''}</td>
                        <td class="memo">${txn.memo || txn.description || ''}</td>
                        <td class="amount">${formatMoney(txn.amount)}</td>
                        <td class="amount">${formatMoney(rb)}</td>
                    </tr>`;
                });
            }

            expenseRows += `<tr class="category-total"><td colspan="4">Total ${cat.category_name}</td><td class="amount">${formatMoney(cat.total)}</td><td class="amount">${formatMoney(cat.total)}</td></tr>`;
        });
    }

    return `<!DOCTYPE html>
<html>
<head>
    <title>Profit & Loss Statement</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; font-size: 11px; }
        h1 { text-align: center; margin-bottom: 5px; font-size: 18px; }
        .date-range { text-align: center; color: #666; margin-bottom: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f5; padding: 8px 5px; text-align: left; border-bottom: 2px solid #ddd; font-size: 10px; }
        th.amount { text-align: right; }
        td { padding: 4px 5px; border-bottom: 1px solid #eee; vertical-align: top; }
        td.amount { text-align: right; font-family: 'Consolas', monospace; }
        td.memo { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: #666; }
        .section-header { background: #e8f5e9; font-weight: bold; font-size: 13px; }
        .section-header.expense { background: #ffebee; }
        .category-header td { font-weight: bold; padding-top: 10px; background: #fafafa; }
        .subcategory-header td { font-weight: 600; font-size: 10px; color: #555; }
        .transaction td { font-size: 10px; }
        .subtotal td { font-weight: 500; font-size: 10px; border-top: 1px solid #ccc; }
        .category-total td { font-weight: bold; background: #f5f5f5; border-top: 2px solid #999; }
        .section-total td { font-weight: bold; font-size: 12px; background: #e0e0e0; border-top: 2px solid #666; }
        .net-income td { font-weight: bold; font-size: 14px; background: #1a237e; color: white; }
        .net-income.negative td { background: #b71c1c; }
        @media print {
            body { padding: 0; }
            .transaction td { font-size: 9px; }
        }
    </style>
</head>
<body>
    <h1>Profit & Loss Statement</h1>
    <div class="date-range">${summaryData.period.start} through ${summaryData.period.end}</div>

    <table>
        <thead>
            <tr>
                <th>Type</th>
                <th>Date</th>
                <th>Name</th>
                <th>Memo</th>
                <th class="amount">Amount</th>
                <th class="amount">Balance</th>
            </tr>
        </thead>
        <tbody>
            <tr class="section-header"><td colspan="6">Income</td></tr>
            ${incomeRows}
            <tr class="section-total"><td colspan="4">Total Income</td><td class="amount">${formatMoney(data.income.total)}</td><td class="amount">${formatMoney(data.income.total)}</td></tr>

            <tr class="section-header expense"><td colspan="6">Expense</td></tr>
            ${expenseRows}
            <tr class="section-total"><td colspan="4">Total Expense</td><td class="amount">${formatMoney(data.expenses.total)}</td><td class="amount">${formatMoney(data.expenses.total)}</td></tr>

            <tr class="net-income ${data.net_income < 0 ? 'negative' : ''}">
                <td colspan="4">Net Income</td>
                <td class="amount">${formatMoney(data.net_income)}</td>
                <td class="amount">${formatMoney(data.net_income)}</td>
            </tr>
        </tbody>
    </table>
</body>
</html>`;
}

function formatDateForCsv(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatAmountForCsv(amount) {
    if (amount === null || amount === undefined) return '';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function escapeCSV(str) {
    if (!str) return '';
    return str.replace(/"/g, '""');
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
// P&L Accordion Toggle
// =====================================================

function togglePnlCategory(element) {
    const group = element.closest('.pnl-item-group');
    if (group) {
        group.classList.toggle('expanded');
    }
}

/**
 * Toggle expand/collapse all items in a P&L section (single button)
 */
function togglePnlSection(section) {
    const containerId = section === 'income' ? 'pnl-income-items' : 'pnl-expense-items';
    const container = document.getElementById(containerId);
    const button = document.getElementById(`${section}-toggle-btn`);
    if (!container) return;

    // Check if any item is expanded
    const parentGroups = container.querySelectorAll('.pnl-item-group.has-children');
    const subGroups = container.querySelectorAll('.pnl-sub-item-group');
    const anyExpanded = [...parentGroups, ...subGroups].some(g => g.classList.contains('expanded'));

    // If any expanded, collapse all. Otherwise expand all.
    const expand = !anyExpanded;

    // Toggle all parent categories
    parentGroups.forEach(group => {
        if (expand) {
            group.classList.add('expanded');
        } else {
            group.classList.remove('expanded');
        }
    });

    // Toggle all sub-categories
    subGroups.forEach(group => {
        if (expand) {
            group.classList.add('expanded');
            // Load transactions if not loaded yet
            const categoryId = group.dataset.categoryId;
            const txnContainer = document.getElementById(`pnl-txns-${categoryId}`);
            if (txnContainer && txnContainer.querySelector('.pnl-txn-loading')) {
                loadCategoryTransactions(categoryId, txnContainer);
            }
        } else {
            group.classList.remove('expanded');
        }
    });

    // Update button text
    if (button) {
        button.textContent = expand ? 'Collapse All' : 'Expand All';
    }
}

/**
 * Toggle subcategory to show/hide transaction details
 */
async function togglePnlSubCategory(element, categoryId) {
    const group = element.closest('.pnl-sub-item-group');
    if (!group) return;

    const isExpanded = group.classList.contains('expanded');
    group.classList.toggle('expanded');

    // If expanding and transactions not loaded yet, fetch them
    if (!isExpanded) {
        const txnContainer = document.getElementById(`pnl-txns-${categoryId}`);
        if (txnContainer && txnContainer.querySelector('.pnl-txn-loading')) {
            await loadCategoryTransactions(categoryId, txnContainer);
        }
    }
}

/**
 * Load transactions for a specific category
 */
async function loadCategoryTransactions(categoryId, container) {
    if (!pnlData) return;

    const userId = state.currentUser;
    const targetId = parseInt(categoryId);
    console.log('Loading transactions for category:', targetId);

    try {
        const response = await fetch(`${API_BASE}/reports/profit-loss-detail.php?user_id=${userId}&start_date=${pnlData.period.start}&end_date=${pnlData.period.end}`);
        const result = await response.json();
        console.log('API result:', result.success, 'Categories count:', result.data?.expenses?.categories?.length);

        if (result.success) {
            // Find the category in the response
            let transactions = [];
            let categoryData = null;

            // Search in expenses
            if (result.data.expenses && result.data.expenses.categories) {
                result.data.expenses.categories.forEach(cat => {
                    // Check parent category
                    if (parseInt(cat.category_id) === targetId && cat.transactions) {
                        console.log('Found parent match:', cat.category_name, cat.transactions.length, 'txns');
                        transactions = cat.transactions;
                        categoryData = cat;
                    }
                    // Check children categories
                    if (cat.children && cat.children.length > 0) {
                        cat.children.forEach(child => {
                            if (parseInt(child.category_id) === targetId) {
                                console.log('Found child match:', child.category_name, 'has transactions:', !!child.transactions, child.transactions?.length);
                                if (child.transactions) {
                                    transactions = child.transactions;
                                    categoryData = child;
                                }
                            }
                        });
                    }
                });
            }

            // Search in income
            if (transactions.length === 0 && result.data.income && result.data.income.categories) {
                result.data.income.categories.forEach(cat => {
                    if (parseInt(cat.category_id) === targetId && cat.transactions) {
                        transactions = cat.transactions;
                        categoryData = cat;
                    }
                    if (cat.children) {
                        cat.children.forEach(child => {
                            if (parseInt(child.category_id) === targetId && child.transactions) {
                                transactions = child.transactions;
                                categoryData = child;
                            }
                        });
                    }
                });
            }

            console.log('Final transactions count:', transactions.length);
            renderTransactionList(container, transactions);
        } else {
            container.innerHTML = '<div class="pnl-txn-error">Failed to load transactions</div>';
        }
    } catch (e) {
        console.error('Failed to load transactions:', e);
        container.innerHTML = '<div class="pnl-txn-error">Failed to load transactions</div>';
    }
}

/**
 * Render transaction list inside subcategory
 */
function renderTransactionList(container, transactions) {
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="pnl-txn-empty">No transactions</div>';
        return;
    }

    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    container.innerHTML = `
        <div class="pnl-txn-list">
            ${transactions.map(txn => `
                <div class="pnl-txn-item">
                    <div class="pnl-txn-date">${formatDate(txn.date)}</div>
                    <div class="pnl-txn-desc">${txn.description || txn.memo || ''}</div>
                    <div class="pnl-txn-amount">${formatCurrency(txn.amount)}</div>
                </div>
            `).join('')}
        </div>
    `;
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
window.togglePnlCategory = togglePnlCategory;
window.togglePnlSubCategory = togglePnlSubCategory;
window.togglePnlSection = togglePnlSection;

// P&L Export Modal functions
window.openPnlExportModal = openPnlExportModal;
window.closePnlExportModal = closePnlExportModal;
window.toggleAllPnlCategories = toggleAllPnlCategories;
window.toggleExportCategory = toggleExportCategory;
window.executePnlExport = executePnlExport;
