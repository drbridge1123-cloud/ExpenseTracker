/**
 * =========================================================================
 * QuickBooks-Style Profit & Loss Detail Report Module
 * =========================================================================
 *
 * This module provides a complete P&L Detail Report system matching
 * QuickBooks Desktop/Online format exactly.
 *
 * Features:
 * - Hierarchical account grouping (Parent → Sub-account → Transactions)
 * - QuickBooks-standard ordering (Income → COGS → Expense → Other Income → Other Expense)
 * - Line-by-line transaction details
 * - Subtotals at every level
 * - PDF, CSV, Excel exports
 * - Configurable columns (Date, Type, Num, Name, Memo, Amount)
 * - Cash/Accrual basis selection
 */

const PnLDetailReport = (function() {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================
    const CONFIG = {
        apiEndpoint: '/api/v1/reports/profit-loss-detail.php',
        userId: 1, // Default, should be set from session
        currency: {
            symbol: '$',
            code: 'USD',
            decimals: 2,
            thousandsSep: ',',
            decimalSep: '.'
        },
        dateFormat: 'MM/DD/YYYY',
        showPayee: true,
        showMemo: true,
        includeZeroBalance: false,
        accountingBasis: 'accrual'
    };

    let currentReport = null;

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Initialize the P&L Detail Report module
     * @param {Object} options - Configuration options
     */
    function init(options = {}) {
        Object.assign(CONFIG, options);
        setupEventListeners();
    }

    /**
     * Load P&L Detail report for specified date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Report data
     */
    async function loadReport(startDate, endDate, options = {}) {
        const params = new URLSearchParams({
            user_id: options.userId || CONFIG.userId,
            start_date: startDate,
            end_date: endDate,
            accounting_basis: options.accountingBasis || CONFIG.accountingBasis,
            show_payee: options.showPayee !== undefined ? (options.showPayee ? 1 : 0) : (CONFIG.showPayee ? 1 : 0),
            show_memo: options.showMemo !== undefined ? (options.showMemo ? 1 : 0) : (CONFIG.showMemo ? 1 : 0),
            include_zero_balance: options.includeZeroBalance ? 1 : 0
        });

        try {
            const response = await fetch(`${CONFIG.apiEndpoint}?${params}`);
            const result = await response.json();

            if (result.success) {
                currentReport = result.data;
                return result.data;
            } else {
                throw new Error(result.message || 'Failed to load report');
            }
        } catch (error) {
            console.error('P&L Detail Report Error:', error);
            throw error;
        }
    }

    /**
     * Render report to a container element
     * @param {HTMLElement|string} container - Container element or selector
     * @param {Object} reportData - Report data from loadReport()
     */
    function render(container, reportData = null) {
        const data = reportData || currentReport;
        if (!data) {
            console.error('No report data available');
            return;
        }

        const containerEl = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!containerEl) {
            console.error('Container not found');
            return;
        }

        containerEl.innerHTML = generateReportHtml(data);
    }

    /**
     * Export report to PDF
     * @param {Object} reportData - Report data
     */
    function exportToPdf(reportData = null) {
        const data = reportData || currentReport;
        if (!data) {
            alert('Please load a report first');
            return;
        }

        // Use jsPDF if available
        if (typeof jspdf !== 'undefined' || typeof window.jspdf !== 'undefined') {
            generatePdfWithJsPdf(data);
        } else {
            // Fallback: open print dialog
            const printWindow = window.open('', '_blank');
            printWindow.document.write(generatePrintableHtml(data));
            printWindow.document.close();
            printWindow.print();
        }
    }

    /**
     * Export report to CSV
     * @param {Object} reportData - Report data
     */
    function exportToCsv(reportData = null) {
        const data = reportData || currentReport;
        if (!data) {
            alert('Please load a report first');
            return;
        }

        const csv = generateCsv(data);
        downloadFile(csv, `PnL_Detail_${data.config.date_range.start}_to_${data.config.date_range.end}.csv`, 'text/csv');
    }

    /**
     * Get current report data
     * @returns {Object|null} Current report data
     */
    function getCurrentReport() {
        return currentReport;
    }

    /**
     * Update configuration
     * @param {Object} options - New configuration options
     */
    function setConfig(options) {
        Object.assign(CONFIG, options);
    }

    // =========================================================================
    // PRIVATE FUNCTIONS
    // =========================================================================

    function setupEventListeners() {
        // Add any global event listeners here
    }

    function generateReportHtml(data) {
        let html = `
            <div class="pnl-report">
                <div class="pnl-header">
                    <h1 class="company-name">${escapeHtml(data.config.company_name)}</h1>
                    <h2 class="report-title">Profit and Loss Detail</h2>
                    <p class="date-range">${data.config.date_range.start_formatted} through ${data.config.date_range.end_formatted}</p>
                    <p class="accounting-basis">${data.config.accounting_basis} Basis</p>
                </div>

                <table class="pnl-table">
                    <thead>
                        <tr>
                            <th class="col-date">Date</th>
                            <th class="col-type">Type</th>
                            <th class="col-num">Num</th>
                            ${CONFIG.showPayee ? '<th class="col-name">Name</th>' : ''}
                            ${CONFIG.showMemo ? '<th class="col-memo">Memo/Description</th>' : ''}
                            <th class="col-amount">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

        sectionOrder.forEach(sectionKey => {
            const section = data.sections[sectionKey];
            if (!section || Object.keys(section.accounts).length === 0) return;

            const colSpan = getColumnCount();

            // Section header
            html += `
                <tr class="section-header">
                    <td colspan="${colSpan}">${section.title.toUpperCase()}</td>
                </tr>
            `;

            // Accounts
            Object.values(section.accounts).forEach(account => {
                html += renderAccountHtml(account, 1);
            });

            // Section total
            html += `
                <tr class="section-total">
                    <td colspan="${colSpan - 1}">Total ${section.title}</td>
                    <td class="amount">${formatCurrency(section.total)}</td>
                </tr>
            `;

            // Computed totals
            if (sectionKey === 'cogs') {
                html += `
                    <tr class="computed-total gross-profit">
                        <td colspan="${colSpan - 1}">Gross Profit</td>
                        <td class="amount">${data.summary.gross_profit.formatted}</td>
                    </tr>
                `;
            }

            if (sectionKey === 'expense') {
                html += `
                    <tr class="computed-total net-operating">
                        <td colspan="${colSpan - 1}">Net Operating Income</td>
                        <td class="amount">${data.summary.net_operating_income.formatted}</td>
                    </tr>
                `;
            }

            if (sectionKey === 'other_expense') {
                html += `
                    <tr class="computed-total net-other">
                        <td colspan="${colSpan - 1}">Net Other Income</td>
                        <td class="amount">${data.summary.net_other_income.formatted}</td>
                    </tr>
                `;
            }
        });

        // Net Income
        html += `
                <tr class="net-income">
                    <td colspan="${getColumnCount() - 1}">Net Income</td>
                    <td class="amount">${data.summary.net_income.formatted}</td>
                </tr>
            </tbody>
        </table>

        <div class="pnl-footer">
            <p class="generated-at">Generated: ${data.config.generated_at}</p>
        </div>
        </div>
        `;

        return html;
    }

    function renderAccountHtml(account, depth) {
        const indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth);
        const colSpan = getColumnCount();
        let html = '';

        // Account header
        html += `
            <tr class="account-header depth-${depth}">
                <td colspan="${colSpan}">${indent}${escapeHtml(account.account_name)}</td>
            </tr>
        `;

        // Direct transactions
        if (account.direct_transactions) {
            account.direct_transactions.forEach(txn => {
                html += renderTransactionHtml(txn, depth + 1);
            });
        }

        // Sub-accounts
        if (account.sub_accounts) {
            Object.values(account.sub_accounts).forEach(subAccount => {
                const subIndent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth + 1);

                html += `
                    <tr class="account-header depth-${depth + 1}">
                        <td colspan="${colSpan}">${subIndent}${escapeHtml(subAccount.account_name)}</td>
                    </tr>
                `;

                subAccount.transactions.forEach(txn => {
                    html += renderTransactionHtml(txn, depth + 2);
                });

                html += `
                    <tr class="account-total depth-${depth + 1}">
                        <td colspan="${colSpan - 1}">${subIndent}Total ${escapeHtml(subAccount.account_name)}</td>
                        <td class="amount">${formatCurrency(subAccount.total)}</td>
                    </tr>
                `;
            });

            // Account total
            html += `
                <tr class="account-total depth-${depth}">
                    <td colspan="${colSpan - 1}">${indent}Total ${escapeHtml(account.account_name)}</td>
                    <td class="amount">${formatCurrency(account.total)}</td>
                </tr>
            `;
        }

        return html;
    }

    function renderTransactionHtml(txn, depth) {
        const indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth);

        let html = `
            <tr class="transaction-row depth-${depth}">
                <td class="col-date">${indent}${txn.date_formatted}</td>
                <td class="col-type">${escapeHtml(txn.type)}</td>
                <td class="col-num">${escapeHtml(txn.num)}</td>
        `;

        if (CONFIG.showPayee) {
            html += `<td class="col-name">${escapeHtml(txn.name)}</td>`;
        }

        if (CONFIG.showMemo) {
            html += `<td class="col-memo">${escapeHtml(txn.memo)}</td>`;
        }

        html += `
                <td class="col-amount amount">${txn.amount_formatted}</td>
            </tr>
        `;

        return html;
    }

    function generatePrintableHtml(data) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Profit and Loss Detail - ${escapeHtml(data.config.company_name)}</title>
                <link rel="stylesheet" href="/styles/pnl-detail.css">
                <style>
                    @media print {
                        body { margin: 0; padding: 20px; }
                        .pnl-report { max-width: 100%; }
                    }
                </style>
            </head>
            <body>
                ${generateReportHtml(data)}
            </body>
            </html>
        `;
    }

    function generatePdfWithJsPdf(data) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');

        // Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(data.config.company_name, 105, 15, { align: 'center' });

        doc.setFontSize(12);
        doc.text('Profit and Loss Detail', 105, 22, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `${data.config.date_range.start_formatted} through ${data.config.date_range.end_formatted}`,
            105, 28, { align: 'center' }
        );

        // Build table data
        const tableData = buildPdfTableData(data);

        // Generate table using autoTable
        if (typeof doc.autoTable === 'function') {
            const headers = ['Date', 'Type', 'Num'];
            if (CONFIG.showPayee) headers.push('Name');
            if (CONFIG.showMemo) headers.push('Memo');
            headers.push('Amount');

            doc.autoTable({
                head: [headers],
                body: tableData,
                startY: 35,
                styles: { fontSize: 8, cellPadding: 1 },
                headStyles: { fillColor: [100, 100, 100] },
                columnStyles: {
                    [headers.length - 1]: { halign: 'right' }
                }
            });
        }

        doc.save(`PnL_Detail_${data.config.date_range.start}_${data.config.date_range.end}.pdf`);
    }

    function buildPdfTableData(data) {
        const tableData = [];
        const sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

        sectionOrder.forEach(sectionKey => {
            const section = data.sections[sectionKey];
            if (!section || Object.keys(section.accounts).length === 0) return;

            // Section header
            const headerRow = [section.title.toUpperCase(), '', ''];
            if (CONFIG.showPayee) headerRow.push('');
            if (CONFIG.showMemo) headerRow.push('');
            headerRow.push('');
            tableData.push(headerRow);

            // Accounts and transactions
            Object.values(section.accounts).forEach(account => {
                addAccountToPdfData(tableData, account, 1);
            });

            // Section total
            const totalRow = [`Total ${section.title}`, '', ''];
            if (CONFIG.showPayee) totalRow.push('');
            if (CONFIG.showMemo) totalRow.push('');
            totalRow.push(formatCurrency(section.total));
            tableData.push(totalRow);
        });

        // Net Income
        const netRow = ['NET INCOME', '', ''];
        if (CONFIG.showPayee) netRow.push('');
        if (CONFIG.showMemo) netRow.push('');
        netRow.push(data.summary.net_income.formatted);
        tableData.push(netRow);

        return tableData;
    }

    function addAccountToPdfData(tableData, account, depth) {
        const indent = '  '.repeat(depth);

        // Account header
        const headerRow = [indent + account.account_name, '', ''];
        if (CONFIG.showPayee) headerRow.push('');
        if (CONFIG.showMemo) headerRow.push('');
        headerRow.push('');
        tableData.push(headerRow);

        // Direct transactions
        if (account.direct_transactions) {
            account.direct_transactions.forEach(txn => {
                const row = [indent + '  ' + txn.date_formatted, txn.type, txn.num];
                if (CONFIG.showPayee) row.push(txn.name);
                if (CONFIG.showMemo) row.push(txn.memo);
                row.push(txn.amount_formatted);
                tableData.push(row);
            });
        }

        // Sub-accounts
        if (account.sub_accounts) {
            Object.values(account.sub_accounts).forEach(subAccount => {
                const subIndent = '  '.repeat(depth + 1);

                const subHeaderRow = [subIndent + subAccount.account_name, '', ''];
                if (CONFIG.showPayee) subHeaderRow.push('');
                if (CONFIG.showMemo) subHeaderRow.push('');
                subHeaderRow.push('');
                tableData.push(subHeaderRow);

                subAccount.transactions.forEach(txn => {
                    const row = [subIndent + '  ' + txn.date_formatted, txn.type, txn.num];
                    if (CONFIG.showPayee) row.push(txn.name);
                    if (CONFIG.showMemo) row.push(txn.memo);
                    row.push(txn.amount_formatted);
                    tableData.push(row);
                });

                const subTotalRow = [subIndent + `Total ${subAccount.account_name}`, '', ''];
                if (CONFIG.showPayee) subTotalRow.push('');
                if (CONFIG.showMemo) subTotalRow.push('');
                subTotalRow.push(formatCurrency(subAccount.total));
                tableData.push(subTotalRow);
            });

            // Account total
            const totalRow = [indent + `Total ${account.account_name}`, '', ''];
            if (CONFIG.showPayee) totalRow.push('');
            if (CONFIG.showMemo) totalRow.push('');
            totalRow.push(formatCurrency(account.total));
            tableData.push(totalRow);
        }
    }

    function generateCsv(data) {
        const lines = [];

        // Header
        lines.push(data.config.company_name);
        lines.push('Profit and Loss Detail');
        lines.push(`${data.config.date_range.start_formatted} through ${data.config.date_range.end_formatted}`);
        lines.push(`${data.config.accounting_basis} Basis`);
        lines.push('');

        // Column headers
        const headers = ['Account', 'Date', 'Type', 'Num'];
        if (CONFIG.showPayee) headers.push('Name');
        if (CONFIG.showMemo) headers.push('Memo');
        headers.push('Amount');
        lines.push(headers.map(escapeCsv).join(','));

        // Data rows
        const sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

        sectionOrder.forEach(sectionKey => {
            const section = data.sections[sectionKey];
            if (!section || Object.keys(section.accounts).length === 0) return;

            lines.push(section.title.toUpperCase());

            Object.values(section.accounts).forEach(account => {
                addAccountToCsv(lines, account, 1);
            });

            const totalRow = [`Total ${section.title}`, '', '', ''];
            if (CONFIG.showPayee) totalRow.push('');
            if (CONFIG.showMemo) totalRow.push('');
            totalRow.push(section.total);
            lines.push(totalRow.map(escapeCsv).join(','));

            lines.push('');
        });

        // Net Income
        const netRow = ['NET INCOME', '', '', ''];
        if (CONFIG.showPayee) netRow.push('');
        if (CONFIG.showMemo) netRow.push('');
        netRow.push(data.summary.net_income.amount);
        lines.push(netRow.map(escapeCsv).join(','));

        return lines.join('\n');
    }

    function addAccountToCsv(lines, account, depth) {
        const indent = '  '.repeat(depth);

        lines.push(indent + account.account_name);

        if (account.direct_transactions) {
            account.direct_transactions.forEach(txn => {
                const row = [indent + '  ', txn.date_formatted, txn.type, txn.num];
                if (CONFIG.showPayee) row.push(txn.name);
                if (CONFIG.showMemo) row.push(txn.memo);
                row.push(txn.amount);
                lines.push(row.map(escapeCsv).join(','));
            });
        }

        if (account.sub_accounts) {
            Object.values(account.sub_accounts).forEach(subAccount => {
                const subIndent = '  '.repeat(depth + 1);

                lines.push(subIndent + subAccount.account_name);

                subAccount.transactions.forEach(txn => {
                    const row = [subIndent + '  ', txn.date_formatted, txn.type, txn.num];
                    if (CONFIG.showPayee) row.push(txn.name);
                    if (CONFIG.showMemo) row.push(txn.memo);
                    row.push(txn.amount);
                    lines.push(row.map(escapeCsv).join(','));
                });

                const subTotalRow = [subIndent + `Total ${subAccount.account_name}`, '', '', ''];
                if (CONFIG.showPayee) subTotalRow.push('');
                if (CONFIG.showMemo) subTotalRow.push('');
                subTotalRow.push(subAccount.total);
                lines.push(subTotalRow.map(escapeCsv).join(','));
            });

            const totalRow = [indent + `Total ${account.account_name}`, '', '', ''];
            if (CONFIG.showPayee) totalRow.push('');
            if (CONFIG.showMemo) totalRow.push('');
            totalRow.push(account.total);
            lines.push(totalRow.map(escapeCsv).join(','));
        }
    }

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    function getColumnCount() {
        let count = 4; // date, type, num, amount
        if (CONFIG.showPayee) count++;
        if (CONFIG.showMemo) count++;
        return count;
    }

    function formatCurrency(amount) {
        const abs = Math.abs(amount);
        const formatted = abs.toLocaleString('en-US', {
            minimumFractionDigits: CONFIG.currency.decimals,
            maximumFractionDigits: CONFIG.currency.decimals
        });
        return (amount < 0 ? '-' : '') + CONFIG.currency.symbol + formatted;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeCsv(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // =========================================================================
    // EXPORT PUBLIC API
    // =========================================================================

    return {
        init,
        loadReport,
        render,
        exportToPdf,
        exportToCsv,
        getCurrentReport,
        setConfig,
        // For testing
        _formatCurrency: formatCurrency,
        _escapeHtml: escapeHtml
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PnLDetailReport;
}
