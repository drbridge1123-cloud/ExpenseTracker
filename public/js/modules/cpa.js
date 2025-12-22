// =====================================================
// CPA Portal Module
// =====================================================
// Dependencies: state, API_BASE, formatCurrency, showToast

// State
if (!window._cpaState) {
    window._cpaState = {
        period: 'ytd',
        startDate: null,
        endDate: null,
        settings: {}
    };
}
const cpaState = window._cpaState;

// =====================================================
// Main Functions
// =====================================================

async function loadCpaPortalPage() {
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem('cpaSettings');
    if (savedSettings) {
        cpaState.settings = JSON.parse(savedSettings);
        populateCpaSettings();
    }

    // Set default period dates
    updateCpaDocuments();

    // Load sharing history
    loadCpaHistory();
}

function populateCpaSettings() {
    const nameEl = document.getElementById('cpa-name');
    const emailEl = document.getElementById('cpa-email');
    const firmEl = document.getElementById('cpa-firm');
    const phoneEl = document.getElementById('cpa-phone');

    if (nameEl && cpaState.settings.name) nameEl.value = cpaState.settings.name;
    if (emailEl && cpaState.settings.email) emailEl.value = cpaState.settings.email;
    if (firmEl && cpaState.settings.firm) firmEl.value = cpaState.settings.firm;
    if (phoneEl && cpaState.settings.phone) phoneEl.value = cpaState.settings.phone;
}

function saveCpaSettings() {
    cpaState.settings = {
        name: document.getElementById('cpa-name')?.value || '',
        email: document.getElementById('cpa-email')?.value || '',
        firm: document.getElementById('cpa-firm')?.value || '',
        phone: document.getElementById('cpa-phone')?.value || ''
    };

    localStorage.setItem('cpaSettings', JSON.stringify(cpaState.settings));
    showToast('Accountant settings saved', 'success');
}

function updateCpaDocuments() {
    const period = document.getElementById('cpa-period')?.value || 'ytd';
    cpaState.period = period;

    // Show/hide custom dates
    const customDates = document.getElementById('cpa-custom-dates');
    if (customDates) {
        customDates.style.display = period === 'custom' ? 'flex' : 'none';
    }

    // Calculate date range
    const { startDate, endDate } = getCpaDateRange(period);
    cpaState.startDate = startDate;
    cpaState.endDate = endDate;

    // Update date inputs if custom
    if (period === 'custom') {
        const startInput = document.getElementById('cpa-start-date');
        const endInput = document.getElementById('cpa-end-date');
        if (startInput && !startInput.value) startInput.value = startDate;
        if (endInput && !endInput.value) endInput.value = endDate;
    }
}

function getCpaDateRange(period) {
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
            const customStart = document.getElementById('cpa-start-date');
            const customEnd = document.getElementById('cpa-end-date');
            startDate = customStart?.value ? new Date(customStart.value) : new Date(today.getFullYear(), 0, 1);
            endDate = customEnd?.value ? new Date(customEnd.value) : today;
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

function applyCpaCustomDates() {
    const startDate = document.getElementById('cpa-start-date')?.value;
    const endDate = document.getElementById('cpa-end-date')?.value;

    if (startDate) cpaState.startDate = startDate;
    if (endDate) cpaState.endDate = endDate;

    showToast('Date range updated', 'success');
}

function getSelectedDocuments() {
    const docs = [];
    if (document.getElementById('doc-pnl')?.checked) docs.push('pnl');
    if (document.getElementById('doc-transactions')?.checked) docs.push('transactions');
    if (document.getElementById('doc-categories')?.checked) docs.push('categories');
    if (document.getElementById('doc-accounts')?.checked) docs.push('accounts');
    if (document.getElementById('doc-vendors')?.checked) docs.push('vendors');
    return docs;
}

async function previewDocument(type) {
    const { startDate, endDate } = cpaState;

    let content = '';

    try {
        switch (type) {
            case 'pnl':
                // Fetch detailed P&L data with transactions
                const pnlResponse = await fetch(`${API_BASE}/reports/profit-loss-detail.php?user_id=${state.currentUser}&start_date=${startDate}&end_date=${endDate}`);
                const pnlResult = await pnlResponse.json();
                if (pnlResult.success) {
                    content = generatePnlHtml(pnlResult.data);
                }
                break;
            case 'transactions':
                content = await generateTransactionsHtml();
                break;
            case 'categories':
                content = await generateCategoriesHtml();
                break;
            case 'accounts':
                content = generateAccountsHtml();
                break;
            case 'vendors':
                content = await generateVendorsHtml();
                break;
        }

        const previewWindow = window.open('', '_blank');
        previewWindow.document.write(content);
        previewWindow.document.close();
    } catch (error) {
        console.error('Error previewing document:', error);
        showToast('Failed to generate preview', 'error');
    }
}

function getDocumentTitle(type) {
    const titles = {
        pnl: 'Profit & Loss Statement',
        transactions: 'Transaction Report',
        categories: 'Category Summary',
        accounts: 'Account Summary',
        vendors: 'Vendor Report'
    };
    return titles[type] || 'Report';
}

function generatePnlHtml(data) {
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const formatMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

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
    const hierarchy = data.expenses?.categories || [];
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
    <div class="date-range">${data.period.start} through ${data.period.end}</div>

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

async function generateTransactionsHtml() {
    const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}&limit=10000`);
    const result = await response.json();
    const transactions = result.success ? (result.data.transactions || []) : [];

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Transaction Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { text-align: center; }
                .date-range { text-align: center; color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; }
                .amount { text-align: right; }
                .positive { color: #166534; }
                .negative { color: #991b1b; }
                @media print { body { padding: 20px; font-size: 12px; } }
            </style>
        </head>
        <body>
            <h1>Transaction Report</h1>
            <div class="date-range">${cpaState.startDate} to ${cpaState.endDate}</div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Account</th>
                        <th class="amount">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(t => `
                        <tr>
                            <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
                            <td>${t.vendor_name || t.description || '-'}</td>
                            <td>${t.category_name || 'Uncategorized'}</td>
                            <td>${t.account_name || '-'}</td>
                            <td class="amount ${t.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(t.amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

async function generateCategoriesHtml() {
    const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
    const result = await response.json();
    const data = result.success ? result.data : { expenses_by_category: [] };

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Category Summary</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { text-align: center; }
                .date-range { text-align: center; color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; }
                .amount { text-align: right; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Category Summary</h1>
            <div class="date-range">${cpaState.startDate} to ${cpaState.endDate}</div>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th class="amount">Total</th>
                        <th class="amount">Transactions</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.expenses_by_category || []).map(c => `
                        <tr>
                            <td>${c.name}</td>
                            <td class="amount">${formatCurrency(c.total)}</td>
                            <td class="amount">${c.transaction_count}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

function generateAccountsHtml() {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Account Summary</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { text-align: center; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; }
                .amount { text-align: right; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Account Summary</h1>
            <div style="text-align: center; color: #666; margin-bottom: 20px;">As of ${new Date().toLocaleDateString()}</div>
            <table>
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Institution</th>
                        <th class="amount">Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${(state.accounts || []).map(a => `
                        <tr>
                            <td>${a.account_name}</td>
                            <td>${a.account_type || '-'}</td>
                            <td>${a.institution_name || '-'}</td>
                            <td class="amount">${formatCurrency(a.current_balance || 0)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

async function generateVendorsHtml() {
    const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
    const result = await response.json();
    const data = result.success ? result.data : { top_merchants: [] };

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Vendor Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { text-align: center; }
                .date-range { text-align: center; color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; }
                .amount { text-align: right; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Vendor Report</h1>
            <div class="date-range">${cpaState.startDate} to ${cpaState.endDate}</div>
            <table>
                <thead>
                    <tr>
                        <th>Vendor</th>
                        <th class="amount">Total Spent</th>
                        <th class="amount">Transactions</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.top_merchants || []).map(m => `
                        <tr>
                            <td>${m.vendor_name}</td>
                            <td class="amount">${formatCurrency(m.total)}</td>
                            <td class="amount">${m.transaction_count}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

async function downloadDocument(type) {
    try {
        // All documents use XLSX format with ExcelJS
        switch (type) {
            case 'pnl':
                const pnlResponse = await fetch(`${API_BASE}/reports/profit-loss-detail.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
                const pnlResult = await pnlResponse.json();
                if (pnlResult.success) {
                    await downloadPnlExcel(pnlResult.data);
                }
                break;
            case 'transactions':
                await downloadTransactionsExcel();
                break;
            case 'categories':
                await downloadCategoriesExcel();
                break;
            case 'accounts':
                await downloadAccountsExcel();
                break;
            case 'vendors':
                await downloadVendorsExcel();
                break;
        }
    } catch (error) {
        console.error('Error downloading document:', error);
        showToast('Failed to download document', 'error');
    }
}

/**
 * Download P&L as XLSX with formatting (same as Reports page)
 */
async function downloadPnlExcel(data) {
    // Check if ExcelJS is available
    console.log('ExcelJS check:', typeof ExcelJS, typeof window.ExcelJS);
    if (typeof ExcelJS === 'undefined' && typeof window.ExcelJS === 'undefined') {
        console.warn('ExcelJS not loaded, falling back to CSV');
        const csv = generatePnlCsv(data);
        downloadCsv(csv, `pnl-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
        return;
    }

    // Use window.ExcelJS if ExcelJS is not directly available
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;

    try {
        showToast('Generating Excel file...', 'info');

        const workbook = new Excel.Workbook();
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

        const formatDateForExcel = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        };

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
        dateRow.getCell(1).value = `${data.period.start} through ${data.period.end}`;
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
                const catRow = addRow([cat.category_name, '', '', '', '', ''], categoryHeaderStyle);
                sheet.mergeCells(`A${catRow.number}:F${catRow.number}`);

                if (cat.children && cat.children.length > 0) {
                    cat.children.forEach(child => {
                        addRow([child.category_name, '', '', '', '', ''], subcategoryHeaderStyle, 1);

                        if (child.transactions && child.transactions.length > 0) {
                            let rb = 0;
                            child.transactions.forEach(txn => {
                                rb += txn.amount;
                                addRow([
                                    txn.type || 'Deposit',
                                    formatDateForExcel(txn.date),
                                    txn.name || '',
                                    txn.memo || txn.description || '',
                                    txn.amount,
                                    rb
                                ], transactionStyle, 2);
                            });
                        }
                        addRow([`Total ${child.category_name}`, '', '', '', child.total, child.total], subtotalStyle, 1);
                    });
                }

                if (cat.transactions && cat.transactions.length > 0) {
                    let rb = 0;
                    cat.transactions.forEach(txn => {
                        rb += txn.amount;
                        addRow([
                            txn.type || 'Deposit',
                            formatDateForExcel(txn.date),
                            txn.name || '',
                            txn.memo || txn.description || '',
                            txn.amount,
                            rb
                        ], transactionStyle, 1);
                    });
                }

                addRow([`Total ${cat.category_name}`, '', '', '', cat.total, cat.total], categoryTotalStyle);
                rowNum++;
            });
        }

        addRow(['Total Income', '', '', '', data.income?.total || 0, data.income?.total || 0], sectionTotalStyle);
        rowNum++;

        // ===== EXPENSE SECTION =====
        const expenseHeaderRow = addRow(['Expense', '', '', '', '', ''], sectionHeaderExpenseStyle);
        sheet.mergeCells(`A${expenseHeaderRow.number}:F${expenseHeaderRow.number}`);

        if (data.expenses && data.expenses.categories) {
            data.expenses.categories.forEach(cat => {
                const catRow = addRow([cat.category_name, '', '', '', '', ''], categoryHeaderStyle);
                sheet.mergeCells(`A${catRow.number}:F${catRow.number}`);

                if (cat.children && cat.children.length > 0) {
                    cat.children.forEach(child => {
                        addRow([child.category_name, '', '', '', '', ''], subcategoryHeaderStyle, 1);

                        if (child.transactions && child.transactions.length > 0) {
                            let rb = 0;
                            child.transactions.forEach(txn => {
                                rb += txn.amount;
                                addRow([
                                    txn.type || 'Check',
                                    formatDateForExcel(txn.date),
                                    txn.name || '',
                                    txn.memo || txn.description || '',
                                    txn.amount,
                                    rb
                                ], transactionStyle, 2);
                            });
                        }
                        addRow([`Total ${child.category_name}`, '', '', '', child.total, child.total], subtotalStyle, 1);
                    });
                }

                if (cat.transactions && cat.transactions.length > 0) {
                    let rb = 0;
                    cat.transactions.forEach(txn => {
                        rb += txn.amount;
                        addRow([
                            txn.type || 'Check',
                            formatDateForExcel(txn.date),
                            txn.name || '',
                            txn.memo || txn.description || '',
                            txn.amount,
                            rb
                        ], transactionStyle, 1);
                    });
                }

                addRow([`Total ${cat.category_name}`, '', '', '', cat.total, cat.total], categoryTotalStyle);
                rowNum++;
            });
        }

        addRow(['Total Expense', '', '', '', data.expenses?.total || 0, data.expenses?.total || 0], sectionTotalStyle);
        rowNum++;

        // Net Income
        const netStyle = (data.net_income || 0) >= 0 ? netIncomeStyle : netIncomeNegativeStyle;
        addRow(['Net Income', '', '', '', data.net_income || 0, data.net_income || 0], netStyle);

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `P&L_Statement_${cpaState.startDate}_to_${cpaState.endDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('P&L exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed, using CSV fallback', 'warning');
        const csv = generatePnlCsv(data);
        downloadCsv(csv, `pnl-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
    }
}

/**
 * Download Transactions as XLSX with formatting
 */
async function downloadTransactionsExcel() {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;
    if (!Excel) {
        console.warn('ExcelJS not loaded, falling back to CSV');
        const csv = await generateTransactionsCsv();
        downloadCsv(csv, `transactions-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
        return;
    }

    try {
        showToast('Generating Excel file...', 'info');

        const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}&limit=10000`);
        const result = await response.json();
        const transactions = result.success ? (result.data.transactions || []) : [];

        const workbook = new Excel.Workbook();
        workbook.creator = 'Expense Tracker';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Transactions', {
            pageSetup: { paperSize: 9, orientation: 'landscape' }
        });

        // Set column widths
        sheet.columns = [
            { width: 12 },  // Date
            { width: 35 },  // Description
            { width: 18 },  // Category
            { width: 18 },  // Account
            { width: 12 },  // Type
            { width: 14 },  // Amount
        ];

        // Title
        const titleRow = sheet.addRow(['Transaction Report']);
        titleRow.font = { bold: true, size: 16 };
        sheet.mergeCells('A1:F1');
        titleRow.alignment = { horizontal: 'center' };

        // Date range
        const dateRow = sheet.addRow([`Period: ${cpaState.startDate} to ${cpaState.endDate}`]);
        dateRow.font = { italic: true, color: { argb: 'FF666666' } };
        sheet.mergeCells('A2:F2');
        dateRow.alignment = { horizontal: 'center' };

        // Empty row
        sheet.addRow([]);

        // Header row
        const headerRow = sheet.addRow(['Date', 'Description', 'Category', 'Account', 'Type', 'Amount']);
        headerRow.height = 22;
        headerRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Data rows
        let totalIncome = 0;
        let totalExpense = 0;

        transactions.forEach((t, index) => {
            const amount = parseFloat(t.amount) || 0;
            const isExpense = amount < 0;

            if (isExpense) {
                totalExpense += Math.abs(amount);
            } else {
                totalIncome += amount;
            }

            const row = sheet.addRow([
                t.transaction_date,
                t.vendor_name || t.description || '',
                t.category_name || 'Uncategorized',
                t.account_name || '',
                t.transaction_type || '',
                amount
            ]);

            // Alternating row colors and styling - only for cells with data
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                if (index % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                }
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
                if (colNumber === 6) {
                    cell.numFmt = '#,##0.00';
                    cell.alignment = { horizontal: 'right' };
                    if (amount < 0) {
                        cell.font = { color: { argb: 'FFE74C3C' } };
                    } else {
                        cell.font = { color: { argb: 'FF27AE60' } };
                    }
                }
            });
        });

        // Summary section
        sheet.addRow([]);
        const summaryHeaderRow = sheet.addRow(['Summary', '', '', '', '', '']);
        summaryHeaderRow.font = { bold: true, size: 12 };
        sheet.mergeCells(`A${summaryHeaderRow.number}:F${summaryHeaderRow.number}`);

        const incomeRow = sheet.addRow(['', '', '', '', 'Total Income:', totalIncome]);
        incomeRow.getCell(6).numFmt = '#,##0.00';
        incomeRow.getCell(6).font = { bold: true, color: { argb: 'FF27AE60' } };
        incomeRow.getCell(5).font = { bold: true };

        const expenseRow = sheet.addRow(['', '', '', '', 'Total Expenses:', totalExpense]);
        expenseRow.getCell(6).numFmt = '#,##0.00';
        expenseRow.getCell(6).font = { bold: true, color: { argb: 'FFE74C3C' } };
        expenseRow.getCell(5).font = { bold: true };

        const netRow = sheet.addRow(['', '', '', '', 'Net:', totalIncome - totalExpense]);
        netRow.getCell(6).numFmt = '#,##0.00';
        netRow.getCell(6).font = { bold: true, color: { argb: (totalIncome - totalExpense) >= 0 ? 'FF27AE60' : 'FFE74C3C' } };
        netRow.getCell(5).font = { bold: true };

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Transactions_${cpaState.startDate}_to_${cpaState.endDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Transactions exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed', 'error');
    }
}

/**
 * Download Categories as XLSX with formatting
 */
async function downloadCategoriesExcel() {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;
    if (!Excel) {
        console.warn('ExcelJS not loaded, falling back to CSV');
        const csv = await generateCategoriesCsv();
        downloadCsv(csv, `categories-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
        return;
    }

    try {
        showToast('Generating Excel file...', 'info');

        const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
        const result = await response.json();
        const data = result.success ? result.data : { expenses_by_category: [], income_by_category: [] };

        const workbook = new Excel.Workbook();
        workbook.creator = 'Expense Tracker';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Category Summary', {
            pageSetup: { paperSize: 9, orientation: 'portrait' }
        });

        // Set column widths
        sheet.columns = [
            { width: 30 },  // Category
            { width: 15 },  // Total
            { width: 15 },  // Transactions
            { width: 15 },  // % of Total
        ];

        // Title
        const titleRow = sheet.addRow(['Category Summary Report']);
        titleRow.font = { bold: true, size: 16 };
        sheet.mergeCells('A1:D1');
        titleRow.alignment = { horizontal: 'center' };

        // Date range
        const dateRow = sheet.addRow([`Period: ${cpaState.startDate} to ${cpaState.endDate}`]);
        dateRow.font = { italic: true, color: { argb: 'FF666666' } };
        sheet.mergeCells('A2:D2');
        dateRow.alignment = { horizontal: 'center' };

        sheet.addRow([]);

        // Expense Section
        const expenseHeaderRow = sheet.addRow(['EXPENSES']);
        expenseHeaderRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        expenseHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } };
        sheet.mergeCells(`A${expenseHeaderRow.number}:D${expenseHeaderRow.number}`);

        // Expense header
        const expHeaderRow = sheet.addRow(['Category', 'Total', 'Transactions', '% of Total']);
        expHeaderRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
            cell.border = { bottom: { style: 'thin' } };
        });

        const expenseTotal = (data.expenses_by_category || []).reduce((sum, c) => sum + parseFloat(c.total || 0), 0);

        (data.expenses_by_category || []).forEach((c, index) => {
            const total = parseFloat(c.total || 0);
            const percent = expenseTotal > 0 ? (total / expenseTotal * 100) : 0;
            const row = sheet.addRow([c.name, total, c.transaction_count, percent]);

            row.getCell(2).numFmt = '#,##0.00';
            row.getCell(4).numFmt = '0.0"%"';
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (index % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                }
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
            });
        });

        // Expense total
        const expTotalRow = sheet.addRow(['Total Expenses', expenseTotal, '', '100%']);
        expTotalRow.font = { bold: true };
        expTotalRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
        });
        expTotalRow.getCell(2).numFmt = '#,##0.00';

        sheet.addRow([]);

        // Income Section
        const incomeHeaderRow = sheet.addRow(['INCOME']);
        incomeHeaderRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        incomeHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } };
        sheet.mergeCells(`A${incomeHeaderRow.number}:D${incomeHeaderRow.number}`);

        // Income header
        const incHeaderRow = sheet.addRow(['Category', 'Total', 'Transactions', '% of Total']);
        incHeaderRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
            cell.border = { bottom: { style: 'thin' } };
        });

        const incomeTotal = (data.income_by_category || []).reduce((sum, c) => sum + parseFloat(c.total || 0), 0);

        (data.income_by_category || []).forEach((c, index) => {
            const total = parseFloat(c.total || 0);
            const percent = incomeTotal > 0 ? (total / incomeTotal * 100) : 0;
            const row = sheet.addRow([c.name, total, c.transaction_count, percent]);

            row.getCell(2).numFmt = '#,##0.00';
            row.getCell(4).numFmt = '0.0"%"';
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (index % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                }
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
            });
        });

        // Income total
        const incTotalRow = sheet.addRow(['Total Income', incomeTotal, '', '100%']);
        incTotalRow.font = { bold: true };
        incTotalRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        });
        incTotalRow.getCell(2).numFmt = '#,##0.00';

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Categories_${cpaState.startDate}_to_${cpaState.endDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Categories exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed', 'error');
    }
}

/**
 * Download Accounts as XLSX with formatting
 */
async function downloadAccountsExcel() {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;
    if (!Excel) {
        console.warn('ExcelJS not loaded, falling back to CSV');
        const csv = generateAccountsCsv();
        downloadCsv(csv, `accounts-report.csv`);
        return;
    }

    try {
        showToast('Generating Excel file...', 'info');

        const workbook = new Excel.Workbook();
        workbook.creator = 'Expense Tracker';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Account Summary', {
            pageSetup: { paperSize: 9, orientation: 'portrait' }
        });

        // Set column widths
        sheet.columns = [
            { width: 25 },  // Account
            { width: 18 },  // Type
            { width: 20 },  // Institution
            { width: 15 },  // Balance
        ];

        // Title
        const titleRow = sheet.addRow(['Account Summary']);
        titleRow.font = { bold: true, size: 16 };
        sheet.mergeCells('A1:D1');
        titleRow.alignment = { horizontal: 'center' };

        // Date
        const dateRow = sheet.addRow([`As of: ${new Date().toLocaleDateString()}`]);
        dateRow.font = { italic: true, color: { argb: 'FF666666' } };
        sheet.mergeCells('A2:D2');
        dateRow.alignment = { horizontal: 'center' };

        sheet.addRow([]);

        // Header row
        const headerRow = sheet.addRow(['Account', 'Type', 'Institution', 'Balance']);
        headerRow.height = 22;
        headerRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Group accounts by type
        const accountsByType = {};
        (state.accounts || []).forEach(a => {
            const type = a.account_type || 'Other';
            if (!accountsByType[type]) {
                accountsByType[type] = [];
            }
            accountsByType[type].push(a);
        });

        let totalBalance = 0;

        Object.entries(accountsByType).forEach(([type, accounts]) => {
            // Type header
            const typeRow = sheet.addRow([type, '', '', '']);
            typeRow.font = { bold: true };
            typeRow.eachCell({ includeEmpty: false }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
            });
            sheet.mergeCells(`A${typeRow.number}:D${typeRow.number}`);

            accounts.forEach((a, index) => {
                const balance = parseFloat(a.current_balance || 0);
                totalBalance += balance;

                const row = sheet.addRow([
                    a.account_name,
                    a.account_type || '',
                    a.institution_name || '',
                    balance
                ]);

                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(4).alignment = { horizontal: 'right' };
                row.eachCell({ includeEmpty: false }, (cell) => {
                    if (index % 2 === 1) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                    }
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
                });
            });
        });

        // Total row
        sheet.addRow([]);
        const totalRow = sheet.addRow(['', '', 'Total Balance:', totalBalance]);
        totalRow.font = { bold: true };
        totalRow.getCell(4).numFmt = '#,##0.00';
        totalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Accounts_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Accounts exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed', 'error');
    }
}

/**
 * Download Vendors as XLSX with formatting
 */
async function downloadVendorsExcel() {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;
    if (!Excel) {
        console.warn('ExcelJS not loaded, falling back to CSV');
        const csv = await generateVendorsCsv();
        downloadCsv(csv, `vendors-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
        return;
    }

    try {
        showToast('Generating Excel file...', 'info');

        const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
        const result = await response.json();
        const data = result.success ? result.data : { top_merchants: [] };

        const workbook = new Excel.Workbook();
        workbook.creator = 'Expense Tracker';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Vendor Report', {
            pageSetup: { paperSize: 9, orientation: 'portrait' }
        });

        // Set column widths
        sheet.columns = [
            { width: 35 },  // Vendor
            { width: 15 },  // Total Spent
            { width: 15 },  // Transactions
            { width: 15 },  // % of Total
        ];

        // Title
        const titleRow = sheet.addRow(['Vendor Report']);
        titleRow.font = { bold: true, size: 16 };
        sheet.mergeCells('A1:D1');
        titleRow.alignment = { horizontal: 'center' };

        // Date range
        const dateRow = sheet.addRow([`Period: ${cpaState.startDate} to ${cpaState.endDate}`]);
        dateRow.font = { italic: true, color: { argb: 'FF666666' } };
        sheet.mergeCells('A2:D2');
        dateRow.alignment = { horizontal: 'center' };

        sheet.addRow([]);

        // Header row
        const headerRow = sheet.addRow(['Vendor', 'Total Spent', 'Transactions', '% of Total']);
        headerRow.height = 22;
        headerRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        const totalSpent = (data.top_merchants || []).reduce((sum, m) => sum + parseFloat(m.total_spent || 0), 0);

        // Data rows
        (data.top_merchants || []).forEach((m, index) => {
            const spent = parseFloat(m.total_spent || 0);
            const percent = totalSpent > 0 ? (spent / totalSpent * 100) : 0;

            const row = sheet.addRow([
                m.vendor_name,
                spent,
                m.transaction_count,
                percent
            ]);

            row.getCell(2).numFmt = '#,##0.00';
            row.getCell(4).numFmt = '0.0"%"';
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (index % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                }
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
            });
        });

        // Total row
        sheet.addRow([]);
        const totalRow = sheet.addRow(['Total', totalSpent, '', '100%']);
        totalRow.font = { bold: true };
        totalRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
        });
        totalRow.getCell(2).numFmt = '#,##0.00';

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Vendors_${cpaState.startDate}_to_${cpaState.endDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Vendors exported to Excel', 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed', 'error');
    }
}

function generatePnlCsv(data) {
    const formatDateForCsv = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    };
    const formatAmountForCsv = (amount) => {
        if (amount === null || amount === undefined) return '';
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    };
    const escapeCSV = (str) => str ? str.replace(/"/g, '""') : '';

    // Header row
    let csv = 'Type,Date,Name,Memo,Amount,Balance\n';

    // ===== INCOME SECTION =====
    csv += 'Income,,,,,\n';

    if (data.income && data.income.categories) {
        data.income.categories.forEach(cat => {
            csv += `"${escapeCSV(cat.category_name)}",,,,,\n`;

            if (cat.children && cat.children.length > 0) {
                cat.children.forEach(child => {
                    csv += `"    ${escapeCSV(child.category_name)}",,,,,\n`;
                    if (child.transactions && child.transactions.length > 0) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            csv += `"        ${txn.type || 'Deposit'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                        });
                    }
                    csv += `"    Total ${escapeCSV(child.category_name)}",,,,"${formatAmountForCsv(child.total)}","${formatAmountForCsv(child.total)}"\n`;
                });
            }

            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    csv += `"    ${txn.type || 'Deposit'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                });
            }

            csv += `"Total ${escapeCSV(cat.category_name)}",,,,"${formatAmountForCsv(cat.total)}","${formatAmountForCsv(cat.total)}"\n`;
            csv += ',,,,,\n';
        });
    }

    csv += `"Total Income",,,,"${formatAmountForCsv(data.income?.total || 0)}","${formatAmountForCsv(data.income?.total || 0)}"\n`;
    csv += ',,,,,\n';

    // ===== EXPENSE SECTION =====
    csv += 'Expense,,,,,\n';

    if (data.expenses && data.expenses.categories) {
        data.expenses.categories.forEach(cat => {
            csv += `"${escapeCSV(cat.category_name)}",,,,,\n`;

            if (cat.children && cat.children.length > 0) {
                cat.children.forEach(child => {
                    csv += `"    ${escapeCSV(child.category_name)}",,,,,\n`;
                    if (child.transactions && child.transactions.length > 0) {
                        let rb = 0;
                        child.transactions.forEach(txn => {
                            rb += txn.amount;
                            csv += `"        ${txn.type || 'Check'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                        });
                    }
                    csv += `"    Total ${escapeCSV(child.category_name)}",,,,"${formatAmountForCsv(child.total)}","${formatAmountForCsv(child.total)}"\n`;
                });
            }

            if (cat.transactions && cat.transactions.length > 0) {
                let rb = 0;
                cat.transactions.forEach(txn => {
                    rb += txn.amount;
                    csv += `"    ${txn.type || 'Check'}","${formatDateForCsv(txn.date)}","","${escapeCSV(txn.memo || txn.description || '')}","${formatAmountForCsv(txn.amount)}","${formatAmountForCsv(rb)}"\n`;
                });
            }

            csv += `"Total ${escapeCSV(cat.category_name)}",,,,"${formatAmountForCsv(cat.total)}","${formatAmountForCsv(cat.total)}"\n`;
            csv += ',,,,,\n';
        });
    }

    csv += `"Total Expense",,,,"${formatAmountForCsv(data.expenses?.total || 0)}","${formatAmountForCsv(data.expenses?.total || 0)}"\n`;
    csv += ',,,,,\n';

    // ===== NET INCOME =====
    csv += `"Net Income",,,,"${formatAmountForCsv(data.net_income || 0)}","${formatAmountForCsv(data.net_income || 0)}"\n`;

    return csv;
}

async function generateTransactionsCsv() {
    const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}&limit=10000`);
    const result = await response.json();
    const transactions = result.success ? (result.data.transactions || []) : [];

    let csv = 'Transaction Report\n';
    csv += `Period: ${cpaState.startDate} to ${cpaState.endDate}\n\n`;
    csv += 'Date,Description,Category,Account,Amount\n';
    transactions.forEach(t => {
        csv += `${t.transaction_date},"${t.vendor_name || t.description || ''}","${t.category_name || 'Uncategorized'}","${t.account_name || ''}",${t.amount}\n`;
    });
    return csv;
}

async function generateCategoriesCsv() {
    const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
    const result = await response.json();
    const data = result.success ? result.data : { expenses_by_category: [] };

    let csv = 'Category Summary\n';
    csv += `Period: ${cpaState.startDate} to ${cpaState.endDate}\n\n`;
    csv += 'Category,Total,Transactions\n';
    (data.expenses_by_category || []).forEach(c => {
        csv += `"${c.name}",${c.total},${c.transaction_count}\n`;
    });
    return csv;
}

function generateAccountsCsv() {
    let csv = 'Account Summary\n';
    csv += `As of: ${new Date().toLocaleDateString()}\n\n`;
    csv += 'Account,Type,Institution,Balance\n';
    (state.accounts || []).forEach(a => {
        csv += `"${a.account_name}","${a.account_type || ''}","${a.institution_name || ''}",${a.current_balance || 0}\n`;
    });
    return csv;
}

async function generateVendorsCsv() {
    const response = await fetch(`${API_BASE}/reports/summary.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
    const result = await response.json();
    const data = result.success ? result.data : { top_merchants: [] };

    let csv = 'Vendor Report\n';
    csv += `Period: ${cpaState.startDate} to ${cpaState.endDate}\n\n`;
    csv += 'Vendor,Total Spent,Transactions\n';
    (data.top_merchants || []).forEach(m => {
        csv += `"${m.vendor_name}",${m.total},${m.transaction_count}\n`;
    });
    return csv;
}

function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded ' + filename, 'success');
}

async function generateReportPackage() {
    const selectedDocs = getSelectedDocuments();
    if (selectedDocs.length === 0) {
        showToast('Please select at least one document', 'warning');
        return;
    }

    showToast('Generating report package...', 'info');

    for (const doc of selectedDocs) {
        await downloadDocument(doc);
        await new Promise(r => setTimeout(r, 500));
    }

    showToast('Report package generated!', 'success');
}

async function downloadAllReports() {
    document.querySelectorAll('.cpa-document-item input[type="checkbox"]').forEach(cb => cb.checked = true);
    await generateReportPackage();
}

function openEmailModal() {
    const selectedDocs = getSelectedDocuments();
    if (selectedDocs.length === 0) {
        showToast('Please select at least one document', 'warning');
        return;
    }

    if (cpaState.settings.email) {
        document.getElementById('email-to').value = cpaState.settings.email;
    }

    const today = new Date().toLocaleDateString();
    document.getElementById('email-subject').value = `Financial Documents - ${today}`;
    document.getElementById('email-message').value = `Dear ${cpaState.settings.name || 'Accountant'},\n\nPlease find attached the financial documents for the period ${cpaState.startDate} to ${cpaState.endDate}.\n\nBest regards`;

    const attachmentsContainer = document.getElementById('email-attachments');
    attachmentsContainer.innerHTML = selectedDocs.map(doc => `
        <div class="email-attachment">
            <span>${getDocumentTitle(doc)}</span>
            <span class="remove" onclick="this.parentElement.remove()">&times;</span>
        </div>
    `).join('');

    document.getElementById('email-modal').style.display = 'flex';
}

function closeEmailModal() {
    document.getElementById('email-modal').style.display = 'none';
}

async function sendEmail() {
    const to = document.getElementById('email-to')?.value;
    const subject = document.getElementById('email-subject')?.value;
    const message = document.getElementById('email-message')?.value;

    if (!to) {
        showToast('Please enter an email address', 'warning');
        return;
    }

    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message + '\n\n[Please attach the downloaded reports to this email]')}`;
    window.open(mailtoLink);

    saveCpaShareHistory(to, getSelectedDocuments());

    closeEmailModal();
    showToast('Email client opened. Please attach the downloaded reports.', 'info');
}

function saveCpaShareHistory(email, docs) {
    const history = JSON.parse(localStorage.getItem('cpaHistory') || '[]');
    history.unshift({
        date: new Date().toISOString(),
        email: email,
        documents: docs,
        period: `${cpaState.startDate} to ${cpaState.endDate}`
    });

    if (history.length > 20) history.pop();

    localStorage.setItem('cpaHistory', JSON.stringify(history));
    loadCpaHistory();
}

function loadCpaHistory() {
    const history = JSON.parse(localStorage.getItem('cpaHistory') || '[]');
    const container = document.getElementById('cpa-history-list');

    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state">No documents shared yet</div>';
        return;
    }

    container.innerHTML = history.map(item => `
        <div class="cpa-history-item">
            <div class="cpa-history-info">
                <span class="cpa-history-date">${new Date(item.date).toLocaleDateString()} - ${item.email}</span>
                <span class="cpa-history-docs">${item.documents.map(d => getDocumentTitle(d)).join(', ')}</span>
            </div>
            <div class="cpa-history-actions">
                <button class="btn btn-sm" onclick="resendDocuments('${item.email}', '${item.documents.join(',')}')">Resend</button>
            </div>
        </div>
    `).join('');
}

function resendDocuments(email, docs) {
    document.getElementById('email-to').value = email;
    docs.split(',').forEach(doc => {
        const checkbox = document.getElementById(`doc-${doc}`);
        if (checkbox) checkbox.checked = true;
    });
    openEmailModal();
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadCpaPortalPage = loadCpaPortalPage;
window.updateCpaDocuments = updateCpaDocuments;
window.applyCpaCustomDates = applyCpaCustomDates;
window.saveCpaSettings = saveCpaSettings;
window.previewDocument = previewDocument;
window.downloadDocument = downloadDocument;
window.generateReportPackage = generateReportPackage;
window.downloadAllReports = downloadAllReports;
window.openEmailModal = openEmailModal;
window.closeEmailModal = closeEmailModal;
window.sendEmail = sendEmail;
window.resendDocuments = resendDocuments;
