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
                const pnlResponse = await fetch(`${API_BASE}/reports/profit-loss.php?user_id=${state.currentUser}&start_date=${startDate}&end_date=${endDate}`);
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
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Profit & Loss Statement</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { text-align: center; margin-bottom: 5px; }
                .date-range { text-align: center; color: #666; margin-bottom: 30px; }
                .section { margin-bottom: 20px; }
                .section-header { background: #f5f5f5; padding: 10px; font-weight: bold; display: flex; justify-content: space-between; }
                .section-header.income { background: #dcfce7; color: #166534; }
                .section-header.expense { background: #fee2e2; color: #991b1b; }
                .item { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee; }
                .net-income { background: #4f46e5; color: white; padding: 15px; display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-top: 20px; }
                .net-income.negative { background: #dc2626; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Profit & Loss Statement</h1>
            <div class="date-range">${new Date(data.period.start).toLocaleDateString()} - ${new Date(data.period.end).toLocaleDateString()}</div>

            <div class="section">
                <div class="section-header income">
                    <span>Income</span>
                    <span>${formatCurrency(data.income.total)}</span>
                </div>
                ${data.income.categories.map(c => `
                    <div class="item">
                        <span>${c.category_name}</span>
                        <span>${formatCurrency(c.total)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="section">
                <div class="section-header expense">
                    <span>Expenses</span>
                    <span>${formatCurrency(data.expenses.total)}</span>
                </div>
                ${data.expenses.categories.map(c => `
                    <div class="item">
                        <span>${c.category_name}</span>
                        <span>${formatCurrency(c.total)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="net-income ${data.net_income < 0 ? 'negative' : ''}">
                <span>Net Income</span>
                <span>${formatCurrency(data.net_income)}</span>
            </div>
        </body>
        </html>
    `;
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
        let csvContent = '';

        switch (type) {
            case 'pnl':
                const pnlResponse = await fetch(`${API_BASE}/reports/profit-loss.php?user_id=${state.currentUser}&start_date=${cpaState.startDate}&end_date=${cpaState.endDate}`);
                const pnlResult = await pnlResponse.json();
                if (pnlResult.success) {
                    csvContent = generatePnlCsv(pnlResult.data);
                }
                break;
            case 'transactions':
                csvContent = await generateTransactionsCsv();
                break;
            case 'categories':
                csvContent = await generateCategoriesCsv();
                break;
            case 'accounts':
                csvContent = generateAccountsCsv();
                break;
            case 'vendors':
                csvContent = await generateVendorsCsv();
                break;
        }

        downloadCsv(csvContent, `${type}-report-${cpaState.startDate}-to-${cpaState.endDate}.csv`);
    } catch (error) {
        console.error('Error downloading document:', error);
        showToast('Failed to download document', 'error');
    }
}

function generatePnlCsv(data) {
    let csv = 'Profit & Loss Statement\n';
    csv += `Period: ${data.period.start} to ${data.period.end}\n\n`;
    csv += 'INCOME\nCategory,Amount\n';
    data.income.categories.forEach(c => csv += `"${c.category_name}",${c.total}\n`);
    csv += `Total Income,${data.income.total}\n\n`;
    csv += 'EXPENSES\nCategory,Amount\n';
    data.expenses.categories.forEach(c => csv += `"${c.category_name}",${c.total}\n`);
    csv += `Total Expenses,${data.expenses.total}\n\n`;
    csv += `NET INCOME,${data.net_income}\n`;
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
