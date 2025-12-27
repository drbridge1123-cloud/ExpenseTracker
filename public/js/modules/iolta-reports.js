// =====================================================
// IOLTA Reports Module
// Version: 20251225
// Dependencies: iolta-common.js
// =====================================================
// Trust Reports, Audit Log, and Client Statements
// - Balance Summary Report
// - Account Summary Report
// - Audit Trail Report
// - Client Breakdown Report
// - Client Statements with Print
// =====================================================

// Report state
let currentReportType = null;
let currentReportData = null;

// =====================================================
// Audit Log
// =====================================================

async function loadTrustAuditLog() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const startDate = document.getElementById('audit-start-date')?.value;
    const endDate = document.getElementById('audit-end-date')?.value;

    const params = {
        type: 'audit_trail',
        user_id: userId,
        limit: 100
    };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const data = await apiGet('/trust/reports.php', params);

    if (data.success && data.data.audit_trail) {
        const { entries, summary } = data.data.audit_trail;

        // Render summary stats
        const statsContainer = document.getElementById('audit-summary-stats');
        if (statsContainer && summary) {
            const actionIcons = {
                'client_created': { icon: '&#128100;', color: '#10b981', bg: '#ecfdf5' },
                'client_updated': { icon: '&#9999;', color: '#3b82f6', bg: '#eff6ff' },
                'deposit': { icon: '&#128176;', color: '#10b981', bg: '#ecfdf5' },
                'disbursement': { icon: '&#128228;', color: '#f59e0b', bg: '#fffbeb' },
                'transfer_in': { icon: '&#8600;', color: '#8b5cf6', bg: '#f5f3ff' },
                'transfer_out': { icon: '&#8599;', color: '#8b5cf6', bg: '#f5f3ff' },
                'reconciliation_started': { icon: '&#128260;', color: '#6366f1', bg: '#eef2ff' },
                'reconciliation_completed': { icon: '&#9989;', color: '#10b981', bg: '#ecfdf5' }
            };

            statsContainer.innerHTML = summary.map(s => {
                const config = actionIcons[s.action] || { icon: '&#128203;', color: '#64748b', bg: '#f8fafc' };
                const label = s.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                return `
                    <div style="background: ${config.bg}; padding: 16px; border-radius: 10px; border: 1px solid ${config.color}20;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 20px;">${config.icon}</span>
                            <div>
                                <div style="font-size: 22px; font-weight: 600; color: ${config.color};">${s.count}</div>
                                <div style="font-size: 12px; color: #64748b;">${label}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render audit log entries
        const container = document.getElementById('audit-log-container');
        if (container) {
            if (entries.length === 0) {
                container.innerHTML = `
                    <div style="padding: 48px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 48px; margin-bottom: 16px;">&#128203;</div>
                        <div style="font-size: 16px; font-weight: 500;">No audit entries found</div>
                        <div style="font-size: 14px; margin-top: 4px;">Try adjusting the date range</div>
                    </div>
                `;
                return;
            }

            // Group entries by date
            const groupedByDate = {};
            entries.forEach(entry => {
                const date = entry.created_at.split(' ')[0];
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(entry);
            });

            let html = '';
            Object.keys(groupedByDate).forEach(date => {
                const displayDate = new Date(date).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
                });

                html += `
                    <div style="padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #475569; position: sticky; top: 0;">
                        ${displayDate}
                    </div>
                `;

                groupedByDate[date].forEach(entry => {
                    const time = entry.created_at.split(' ')[1]?.substring(0, 5) || '';
                    const actionConfig = getAuditActionConfig(entry.action);
                    const details = formatAuditDetails(entry);

                    html += `
                        <div style="display: flex; align-items: flex-start; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; background: white;"
                             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                            <!-- Icon -->
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: ${actionConfig.bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <span style="font-size: 18px;">${actionConfig.icon}</span>
                            </div>

                            <!-- Content -->
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-weight: 600; color: #1e293b; font-size: 14px;">${actionConfig.label}</span>
                                    <span style="font-size: 11px; padding: 2px 8px; background: ${actionConfig.bg}; color: ${actionConfig.color}; border-radius: 4px; font-weight: 500;">${entry.entity_type?.replace('trust_', '') || 'system'}</span>
                                </div>
                                <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">
                                    ${entry.client_name ? `<strong>${entry.client_name}</strong> • ` : ''}${details}
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: #94a3b8;">
                                    <span>🕐 ${time}</span>
                                    <span>&#128100; ${entry.username || 'System'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
            });

            container.innerHTML = html;
        }
    }
}

function getAuditActionConfig(action) {
    const configs = {
        'client_created': { icon: '&#128100;', color: '#10b981', bg: '#ecfdf5', label: 'Client Created' },
        'client_updated': { icon: '&#9999;', color: '#3b82f6', bg: '#eff6ff', label: 'Client Updated' },
        'ledger_created': { icon: '&#128210;', color: '#8b5cf6', bg: '#f5f3ff', label: 'Ledger Created' },
        'deposit': { icon: '&#128176;', color: '#10b981', bg: '#ecfdf5', label: 'Deposit' },
        'disbursement': { icon: '&#128228;', color: '#f59e0b', bg: '#fffbeb', label: 'Disbursement' },
        'transfer_in': { icon: '&#8600;', color: '#06b6d4', bg: '#ecfeff', label: 'Transfer In' },
        'transfer_out': { icon: '&#8599;', color: '#f97316', bg: '#fff7ed', label: 'Transfer Out' },
        'earned_fee': { icon: '&#128181;', color: '#84cc16', bg: '#f7fee7', label: 'Earned Fee' },
        'reconciliation_started': { icon: '&#128260;', color: '#6366f1', bg: '#eef2ff', label: 'Reconciliation Started' },
        'reconciliation_completed': { icon: '&#9989;', color: '#10b981', bg: '#ecfdf5', label: 'Reconciliation Completed' }
    };
    return configs[action] || { icon: '&#128203;', color: '#64748b', bg: '#f8fafc', label: action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
}

function formatAuditDetails(entry) {
    try {
        if (entry.description) return entry.description;

        const values = entry.new_values ? JSON.parse(entry.new_values) : null;
        if (!values) return 'No details available';

        // Format based on action type
        if (entry.action === 'client_created' || entry.action === 'client_updated') {
            const parts = [];
            if (values.client_name) parts.push(values.client_name);
            if (values.case_number) parts.push(`Case: ${values.case_number}`);
            if (values.is_active === 0) parts.push('Deactivated');
            return parts.join(' • ') || 'Client details updated';
        }

        if (entry.action.includes('deposit') || entry.action.includes('disbursement')) {
            if (values.amount) return `Amount: ${formatCurrency(Math.abs(values.amount))}`;
        }

        // Generic format
        const keys = Object.keys(values).slice(0, 2);
        return keys.map(k => `${k.replace(/_/g, ' ')}: ${String(values[k]).substring(0, 30)}`).join(' • ');
    } catch (e) {
        return entry.description || 'Details available';
    }
}

// =====================================================
// Trust Reports
// =====================================================

async function showTrustReport(reportType) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const displayArea = document.getElementById('trust-report-display');
    const gridArea = document.querySelector('.trust-reports-grid');
    const contentArea = document.getElementById('trust-report-content');

    if (!displayArea || !contentArea) return;

    // Show loading
    contentArea.innerHTML = '<div class="loading-spinner">Loading report...</div>';
    displayArea.style.display = 'block';
    if (gridArea) gridArea.style.display = 'none';

    currentReportType = reportType;

    try {
        const data = await apiGet('/trust/reports.php', {
            type: reportType,
            user_id: userId
        });

        if (data.success) {
            currentReportData = data.data;
            renderTrustReport(reportType, data.data);
        } else {
            contentArea.innerHTML = `<div class="empty-state"><p>Error loading report: ${data.message || 'Unknown error'}</p></div>`;
        }
    } catch (error) {
        console.error('Report error:', error);
        contentArea.innerHTML = '<div class="empty-state"><p>Failed to load report</p></div>';
    }
}

function hideTrustReport() {
    const displayArea = document.getElementById('trust-report-display');
    const gridArea = document.querySelector('.trust-reports-grid');

    if (displayArea) displayArea.style.display = 'none';
    if (gridArea) gridArea.style.display = 'flex';

    currentReportType = null;
    currentReportData = null;
}

function renderTrustReport(reportType, data) {
    const contentArea = document.getElementById('trust-report-content');
    if (!contentArea) return;

    switch (reportType) {
        case 'balance_summary':
            renderBalanceSummaryReport(contentArea, data);
            break;
        case 'account_summary':
            renderAccountSummaryReport(contentArea, data);
            break;
        case 'audit_trail':
            renderAuditTrailReport(contentArea, data);
            break;
        case 'client_breakdown':
            renderClientBreakdownReport(contentArea, data);
            break;
        default:
            contentArea.innerHTML = '<div class="empty-state"><p>Unknown report type</p></div>';
    }
}

function renderBalanceSummaryReport(container, data) {
    const summary = data.balance_summary;
    const totals = summary.totals;

    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Trust Account Summary</h3>
            <div class="report-summary-cards">
                <div class="report-summary-card">
                    <div class="label">Trust Accounts</div>
                    <div class="value">${totals.account_count}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Client Ledgers</div>
                    <div class="value">${totals.total_ledgers}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Total Bank Balance</div>
                    <div class="value">${formatCurrency(totals.grand_total_account)}</div>
                </div>
                <div class="report-summary-card">
                    <div class="label">Total Client Balance</div>
                    <div class="value">${formatCurrency(totals.grand_total_client)}</div>
                </div>
            </div>
        </div>

        <div class="report-section">
            <h3 class="report-section-title">Account Details</h3>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Client Ledgers</th>
                        <th style="text-align: right">Bank Balance</th>
                        <th style="text-align: right">Client Total</th>
                        <th style="text-align: right">Difference</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${summary.accounts.map(acc => `
                        <tr>
                            <td>
                                <strong>${escapeHtml(acc.account_name)}</strong>
                                ${acc.account_number_last4 ? `<br><small style="color: var(--text-muted)">****${acc.account_number_last4}</small>` : ''}
                            </td>
                            <td>${acc.ledger_count} (${acc.active_ledgers} active)</td>
                            <td style="text-align: right; font-weight: 600">${formatCurrency(acc.account_balance)}</td>
                            <td style="text-align: right; font-weight: 600">${formatCurrency(acc.client_total)}</td>
                            <td style="text-align: right; font-weight: 600; color: ${acc.difference !== 0 ? 'var(--danger)' : 'var(--success)'}">
                                ${formatCurrency(acc.difference)}
                            </td>
                            <td>
                                <span class="status-badge ${acc.is_balanced ? 'balanced' : 'unbalanced'}">
                                    ${acc.is_balanced ? 'Balanced' : 'Unbalanced'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="report-footer" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted);">
            Generated: ${data.generated_at}
        </div>
    `;
}

function renderAccountSummaryReport(container, data) {
    // Need to select an account first
    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Select Trust Account</h3>
            <div style="max-width: 400px;">
                <select id="account-summary-select" class="form-select" onchange="loadAccountSummary()">
                    <option value="">Choose an account...</option>
                </select>
            </div>
        </div>
        <div id="account-summary-content"></div>
    `;

    // Populate accounts dropdown
    populateAccountSummarySelect();
}

async function populateAccountSummarySelect() {
    const select = document.getElementById('account-summary-select');
    if (!select) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/accounts/', { user_id: userId });

    if (data.success) {
        const trustAccounts = data.data.accounts.filter(a => a.account_type === 'iolta' || a.account_type === 'trust');
        select.innerHTML = '<option value="">Choose an account...</option>' +
            trustAccounts.map(acc => `<option value="${acc.id}">${escapeHtml(acc.account_name)}</option>`).join('');
    }
}

async function loadAccountSummary() {
    const accountId = document.getElementById('account-summary-select')?.value;
    const container = document.getElementById('account-summary-content');
    if (!accountId || !container) return;

    container.innerHTML = '<div class="loading-spinner">Loading...</div>';

    const data = await apiGet('/trust/reports.php', {
        type: 'account_summary',
        account_id: accountId
    });

    if (data.success) {
        const summary = data.data.summary;
        const account = summary.account;
        const totals = summary.totals;

        container.innerHTML = `
            <div class="report-section" style="margin-top: 24px;">
                <h3 class="report-section-title">${escapeHtml(account.account_name)}</h3>
                <div class="report-summary-cards">
                    <div class="report-summary-card">
                        <div class="label">Bank Balance</div>
                        <div class="value">${formatCurrency(totals.account_balance)}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Client Total</div>
                        <div class="value">${formatCurrency(totals.total_client_balance)}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Active Ledgers</div>
                        <div class="value">${totals.active_ledgers}</div>
                    </div>
                    <div class="report-summary-card">
                        <div class="label">Status</div>
                        <div class="value ${totals.is_balanced ? 'success' : 'danger'}">${totals.is_balanced ? 'Balanced' : 'Unbalanced'}</div>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h3 class="report-section-title">Client Ledgers</h3>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>Client</th>
                            <th>Case</th>
                            <th style="text-align: right">Balance</th>
                            <th>Transactions</th>
                            <th>Last Activity</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summary.ledgers.map(ledger => `
                            <tr>
                                <td><strong>${escapeHtml(ledger.client_name)}</strong></td>
                                <td>${ledger.case_number || '-'}</td>
                                <td style="text-align: right; font-weight: 600">${formatCurrency(ledger.current_balance)}</td>
                                <td>${ledger.transaction_count}</td>
                                <td>${ledger.last_activity ? formatDate(ledger.last_activity, 'short') : 'No activity'}</td>
                                <td>
                                    <span class="status-badge ${ledger.is_active ? 'balanced' : 'unbalanced'}">
                                        ${ledger.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

function renderAuditTrailReport(container, data) {
    const audit = data.audit_trail;

    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Audit Trail (${audit.period.start_date} to ${audit.period.end_date})</h3>
            <div class="report-summary-cards">
                <div class="report-summary-card">
                    <div class="label">Total Entries</div>
                    <div class="value">${audit.total_entries}</div>
                </div>
                ${audit.summary.slice(0, 3).map(s => `
                    <div class="report-summary-card">
                        <div class="label">${s.action.replace(/_/g, ' ')}</div>
                        <div class="value">${s.count}</div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="report-section">
            <h3 class="report-section-title">Activity Log</h3>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Client</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${audit.entries.map(entry => `
                        <tr>
                            <td>${formatDate(entry.created_at, 'datetime')}</td>
                            <td>${escapeHtml(entry.username || 'System')}</td>
                            <td><span class="status-badge balanced">${entry.action.replace(/_/g, ' ')}</span></td>
                            <td>${escapeHtml(entry.client_name || '-')}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(entry.description || '-')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderClientBreakdownReport(container, data) {
    const breakdown = data.client_breakdown;
    const totals = breakdown.totals;
    const clients = breakdown.clients;
    const currentFilter = breakdown.filter || 'all';

    container.innerHTML = `
        <div class="report-section">
            <h3 class="report-section-title">Client Balance Breakdown</h3>

            <!-- Filter Buttons -->
            <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                <button class="btn ${currentFilter === 'all' ? 'btn-primary' : 'btn-secondary'}"
                        onclick="loadClientBreakdown('all')" style="font-size: 13px; padding: 8px 16px;">
                    All Clients (${totals.total_clients})
                </button>
                <button class="btn ${currentFilter === 'nonzero' ? 'btn-primary' : 'btn-secondary'}"
                        onclick="loadClientBreakdown('nonzero')" style="font-size: 13px; padding: 8px 16px;">
                    With Balance (${totals.clients_with_balance})
                </button>
                <button class="btn ${currentFilter === 'zero' ? 'btn-primary' : 'btn-secondary'}"
                        onclick="loadClientBreakdown('zero')" style="font-size: 13px; padding: 8px 16px;">
                    Zero Balance (${totals.clients_zero_balance})
                </button>
            </div>

            <!-- Summary Cards -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 12px; padding: 20px;">
                    <div style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Total Balance</div>
                    <div style="font-size: 28px; font-weight: 700; color: #15803d;">${formatCurrency(totals.total_balance)}</div>
                </div>
                <div style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border: 1px solid #d8b4fe; border-radius: 12px; padding: 20px;">
                    <div style="font-size: 12px; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Legal Fee (Pending)</div>
                    <div style="font-size: 28px; font-weight: 700; color: #7c3aed;">${formatCurrency(totals.total_legal_fee)}</div>
                </div>
                <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1px solid #fdba74; border-radius: 12px; padding: 20px;">
                    <div style="font-size: 12px; color: #c2410c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Cost (Pending)</div>
                    <div style="font-size: 28px; font-weight: 700; color: #ea580c;">${formatCurrency(totals.total_cost)}</div>
                </div>
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; border-radius: 12px; padding: 20px;">
                    <div style="font-size: 12px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Client Payout (Pending)</div>
                    <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${formatCurrency(totals.total_client_payout)}</div>
                </div>
            </div>
        </div>

        <div class="report-section">
            <h3 class="report-section-title">Client Details</h3>
            <div style="overflow-x: auto;">
                <table class="report-table" style="min-width: 900px;">
                    <thead>
                        <tr>
                            <th style="min-width: 100px;">Case #</th>
                            <th style="min-width: 180px;">Client</th>
                            <th style="text-align: right; min-width: 110px;">Balance</th>
                            <th style="text-align: right; min-width: 100px; color: #7c3aed;">Legal Fee</th>
                            <th style="text-align: right; min-width: 100px; color: #ea580c;">Cost</th>
                            <th style="text-align: right; min-width: 110px; color: #2563eb;">Client Payout</th>
                            <th style="min-width: 80px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clients.length === 0 ? `
                            <tr>
                                <td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;">
                                    No clients found with the selected filter
                                </td>
                            </tr>
                        ` : clients.map(client => `
                            <tr style="opacity: ${client.is_active ? 1 : 0.6};">
                                <td style="font-family: monospace; font-size: 13px;">${escapeHtml(client.case_number || '-')}</td>
                                <td>
                                    <div style="font-weight: 600; color: #1e293b;">${escapeHtml(client.client_name)}</div>
                                </td>
                                <td style="text-align: right; font-weight: 700; font-size: 14px; color: ${client.current_balance >= 0 ? '#15803d' : '#dc2626'};">
                                    ${formatCurrency(client.current_balance)}
                                </td>
                                <td style="text-align: right; color: #7c3aed; font-weight: 500;">
                                    ${client.legal_fee_remaining > 0 ? formatCurrency(client.legal_fee_remaining) : '-'}
                                </td>
                                <td style="text-align: right; color: #ea580c; font-weight: 500;">
                                    ${client.cost_remaining > 0 ? formatCurrency(client.cost_remaining) : '-'}
                                </td>
                                <td style="text-align: right; color: #2563eb; font-weight: 500;">
                                    ${client.client_payout_remaining > 0 ? formatCurrency(client.client_payout_remaining) : '-'}
                                </td>
                                <td>
                                    ${Math.abs(client.current_balance) < 0.01
                                        ? '<span style="display: inline-block; padding: 4px 10px; background: #f1f5f9; color: #64748b; border-radius: 20px; font-size: 11px; font-weight: 500;">Closed</span>'
                                        : '<span style="display: inline-block; padding: 4px 10px; background: #dcfce7; color: #15803d; border-radius: 20px; font-size: 11px; font-weight: 500;">Active</span>'
                                    }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="report-footer" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted);">
            Generated: ${data.generated_at} | Showing ${clients.length} clients
        </div>
    `;
}

async function loadClientBreakdown(filter = 'all') {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const contentArea = document.getElementById('trust-report-content');

    if (!contentArea) return;

    contentArea.innerHTML = '<div class="loading-spinner">Loading report...</div>';

    try {
        const data = await apiGet('/trust/reports.php', {
            type: 'client_breakdown',
            user_id: userId,
            balance_filter: filter
        });

        if (data.success) {
            currentReportData = data.data;
            renderClientBreakdownReport(contentArea, data.data);
        } else {
            contentArea.innerHTML = `<div class="empty-state"><p>Error loading report: ${data.message || 'Unknown error'}</p></div>`;
        }
    } catch (error) {
        console.error('Report error:', error);
        contentArea.innerHTML = '<div class="empty-state"><p>Failed to load report</p></div>';
    }
}

function printTrustReport() {
    window.print();
}

function exportTrustReportPDF() {
    showToast('PDF export coming soon', 'info');
}

// Legacy function for compatibility
async function generateTrustReport(reportType) {
    showTrustReport(reportType);
}

// =====================================================
// Client Statements
// =====================================================

async function loadTrustStatements() {
    const clientSelect = document.getElementById('statement-client');
    if (!clientSelect) return;

    // Set default dates
    const startDate = document.getElementById('statement-start-date');
    const endDate = document.getElementById('statement-end-date');

    if (startDate && !startDate.value) {
        const firstOfMonth = new Date();
        firstOfMonth.setDate(1);
        startDate.value = firstOfMonth.toISOString().split('T')[0];
    }

    if (endDate && !endDate.value) {
        endDate.value = new Date().toISOString().split('T')[0];
    }

    // Load clients
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/trust/clients.php', { user_id: userId });

    if (data.success) {
        clientSelect.innerHTML = '<option value="">Choose a client...</option>' +
            data.data.clients.map(c => `<option value="${c.id}">${escapeHtml(c.client_name)}${c.case_number ? ` - ${c.case_number}` : ''}</option>`).join('');
    }
}

async function onStatementClientChange() {
    const clientId = document.getElementById('statement-client')?.value;
    const ledgerSelect = document.getElementById('statement-ledger');

    if (!clientId || !ledgerSelect) {
        if (ledgerSelect) ledgerSelect.innerHTML = '<option value="">Select client first...</option>';
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const data = await apiGet('/trust/ledger.php', {
        user_id: userId,
        client_id: clientId
    });

    if (data.success && data.data.ledgers.length > 0) {
        ledgerSelect.innerHTML = data.data.ledgers.map(l =>
            `<option value="${l.id}">${escapeHtml(l.account_name)} - ${formatCurrency(l.current_balance)}</option>`
        ).join('');

        // Auto-load first ledger
        loadClientStatementData();
    } else {
        ledgerSelect.innerHTML = '<option value="">No ledgers found</option>';
    }
}

async function loadClientStatementData() {
    const ledgerId = document.getElementById('statement-ledger')?.value;
    const startDate = document.getElementById('statement-start-date')?.value;
    const endDate = document.getElementById('statement-end-date')?.value;
    const container = document.getElementById('client-statement-container');

    if (!ledgerId || !container) return;

    container.innerHTML = '<div class="loading-spinner" style="padding: 80px; text-align: center;">Loading statement...</div>';

    const userId = state.currentUser || localStorage.getItem('currentUser');

    const data = await apiGet('/trust/reports.php', {
        type: 'client_statement',
        ledger_id: ledgerId,
        user_id: userId,
        start_date: startDate,
        end_date: endDate
    });

    if (data.success) {
        const stmt = data.data.statement;
        const ledger = stmt.ledger;

        container.innerHTML = `
            <div class="statement-wrapper">
                <div class="statement-header-info">
                    <div class="statement-client-info">
                        <h3>${escapeHtml(ledger.client_name)}</h3>
                        <p>Client #: ${ledger.client_number || 'N/A'}</p>
                        <p>Case: ${ledger.case_number || 'N/A'} ${ledger.case_description ? `- ${escapeHtml(ledger.case_description)}` : ''}</p>
                        <p>Account: ${escapeHtml(ledger.account_name)} ****${ledger.account_number_last4 || '----'}</p>
                    </div>
                    <div class="statement-period-info">
                        <div class="period-label">Statement Period</div>
                        <div class="period-dates">${formatDate(stmt.period.start_date, 'short')} - ${formatDate(stmt.period.end_date, 'short')}</div>
                    </div>
                </div>

                <div class="statement-summary-row">
                    <div class="statement-summary-item">
                        <div class="label">Opening Balance</div>
                        <div class="value">${formatCurrency(stmt.opening_balance)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Total Deposits</div>
                        <div class="value positive">+${formatCurrency(stmt.total_deposits)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Total Disbursements</div>
                        <div class="value negative">-${formatCurrency(stmt.total_disbursements)}</div>
                    </div>
                    <div class="statement-summary-item">
                        <div class="label">Closing Balance</div>
                        <div class="value">${formatCurrency(stmt.closing_balance)}</div>
                    </div>
                </div>

                <table class="statement-transactions-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Reference</th>
                            <th>Description</th>
                            <th style="text-align: right">Debit</th>
                            <th style="text-align: right">Credit</th>
                            <th style="text-align: right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stmt.transactions.length === 0 ? `
                            <tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No transactions in this period</td></tr>
                        ` : stmt.transactions.map(t => `
                            <tr>
                                <td>${formatDate(t.transaction_date, 'short')}</td>
                                <td>${t.reference_number || '-'}</td>
                                <td>${escapeHtml(t.description || t.transaction_type)}</td>
                                <td style="text-align: right" class="amount-debit">${t.amount < 0 ? formatCurrency(Math.abs(t.amount)) : ''}</td>
                                <td style="text-align: right" class="amount-credit">${t.amount >= 0 ? formatCurrency(t.amount) : ''}</td>
                                <td style="text-align: right" class="balance-cell">${formatCurrency(t.running_balance)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="statement-footer">
                    <button class="btn btn-secondary" onclick="printClientStatement()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        Print Statement
                    </button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `<div class="trust-statement-empty"><p>Error loading statement</p></div>`;
    }
}

// Legacy function
async function loadClientStatement() {
    onStatementClientChange();
}

function printClientStatement() {
    const clientId = IoltaPageState.selectedClientId;

    if (!clientId || clientId === 'all') {
        alert('Please select a client to print statement.');
        return;
    }

    let clientName = 'General/Unassigned';
    let caseNumber = '';
    let balance = 0;

    if (clientId !== 'general') {
        const client = IoltaPageState.clients.find(c => c.id == clientId);
        if (client) {
            clientName = client.client_name;
            caseNumber = client.case_number || '';
            balance = parseFloat(client.total_balance) || 0;
        }
    }

    const transactions = IoltaPageState.transactions || [];

    // Calculate totals
    let totalDeposits = 0;
    let totalDisbursements = 0;
    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        if (amount > 0) {
            totalDeposits += amount;
        } else {
            totalDisbursements += Math.abs(amount);
        }
    });

    // Build transaction rows
    let transactionRows = '';
    let runningBalance = 0;

    // Separate deposits and payouts (same as screen display)
    const deposits = transactions.filter(tx => parseFloat(tx.amount || 0) > 0);
    const payouts = transactions.filter(tx => parseFloat(tx.amount || 0) <= 0);

    // Sort deposits by date descending (newest first)
    deposits.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

    // Sort payouts by date ascending (oldest first)
    payouts.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        if (dateA.getTime() !== dateB.getTime()) {
            return dateA - dateB;
        }
        return (a.id || 0) - (b.id || 0);
    });

    // Display order: All deposits first, then payouts
    const sortedTx = [...deposits, ...payouts];

    sortedTx.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        runningBalance += amount;
        const dateStr = new Date(tx.transaction_date).toLocaleDateString();
        // Type based on amount: + = Dep, - = Payout
        const typeLabel = amount > 0 ? 'Deposit' : 'Payout';

        transactionRows += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${dateStr}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.check_number || ''}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${typeLabel}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.description || ''}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${amount >= 0 ? '#059669' : '#dc2626'};">
                    ${amount >= 0 ? '+' : ''}${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">
                    ${runningBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
            </tr>
        `;
    });

    if (transactions.length === 0) {
        transactionRows = `
            <tr>
                <td colspan="6" style="padding: 20px; text-align: center; color: #666;">No transactions found</td>
            </tr>
        `;
    }

    // Create print window
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Client Ledger Statement - ${clientName}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 40px;
                    color: #333;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #333;
                    padding-bottom: 20px;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .header h2 {
                    margin: 10px 0 0 0;
                    font-size: 18px;
                    font-weight: normal;
                    color: #666;
                }
                .client-info {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: #f5f5f5;
                }
                .client-info p {
                    margin: 5px 0;
                }
                .summary {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .summary-box {
                    padding: 15px;
                    border: 1px solid #ddd;
                    width: 30%;
                    text-align: center;
                }
                .summary-box .label {
                    font-size: 12px;
                    color: #666;
                }
                .summary-box .value {
                    font-size: 18px;
                    font-weight: bold;
                    margin-top: 5px;
                }
                .deposits { color: #059669; }
                .disbursements { color: #dc2626; }
                .balance { color: #1e40af; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background: #333;
                    color: white;
                    padding: 10px 8px;
                    text-align: left;
                }
                th:nth-child(5), th:nth-child(6) {
                    text-align: right;
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                }
                @media print {
                    body { margin: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>IOLTA Trust Account Statement</h1>
                <h2>Client Ledger</h2>
            </div>

            <div class="client-info">
                <p><strong>Client:</strong> ${clientName}</p>
                ${caseNumber ? `<p><strong>Case #:</strong> ${caseNumber}</p>` : ''}
                <p><strong>Statement Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            <div class="summary">
                <div class="summary-box">
                    <div class="label">Total Deposits</div>
                    <div class="value deposits">+$${totalDeposits.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </div>
                <div class="summary-box">
                    <div class="label">Total Disbursements</div>
                    <div class="value disbursements">-$${totalDisbursements.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </div>
                <div class="summary-box">
                    <div class="label">Current Balance</div>
                    <div class="value balance">$${balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Check #</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactionRows}
                </tbody>
            </table>

            <div class="footer">
                <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
        </body>
        </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(printContent);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = function() {
        printWindow.print();
    };
}

// =====================================================
// Window Exports
// =====================================================

// Audit Log
window.loadTrustAuditLog = loadTrustAuditLog;

// Trust Reports
window.showTrustReport = showTrustReport;
window.hideTrustReport = hideTrustReport;
window.loadAccountSummary = loadAccountSummary;
window.loadClientBreakdown = loadClientBreakdown;
window.printTrustReport = printTrustReport;
window.exportTrustReportPDF = exportTrustReportPDF;
window.generateTrustReport = generateTrustReport;

// Client Statements
window.loadTrustStatements = loadTrustStatements;
window.onStatementClientChange = onStatementClientChange;
window.loadClientStatementData = loadClientStatementData;
window.loadClientStatement = loadClientStatement;
window.printClientStatement = printClientStatement;

console.log('IOLTA Reports module loaded');
