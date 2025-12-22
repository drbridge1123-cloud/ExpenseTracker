// =====================================================
// IOLTA UI Components
// Reusable rendering functions
// =====================================================

const IoltaComponents = {

    // =====================================================
    // Client List Item
    // =====================================================

    clientListItem(client, balance, isActive = false, onClick = null) {
        const balanceColor = balance > 0 ? '#10b981' : (balance < 0 ? '#ef4444' : '#94a3b8');
        const isGeneral = client.client_name === 'General/Unassigned';

        return `
            <div class="iolta-client-item ${isActive ? 'active' : ''}"
                 data-client-id="${client.id}"
                 onclick="${onClick || `IoltaUI.selectClient(${client.id})`}"
                 style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; ${isActive ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}">
                <div>
                    <div style="font-size: 13px; font-weight: ${isGeneral ? '600' : '500'}; color: ${isGeneral ? '#f59e0b' : '#1e293b'};">
                        ${this.escapeHtml(client.client_name)}
                    </div>
                    ${client.client_number ? `<div style="font-size: 11px; color: #94a3b8;">${this.escapeHtml(client.client_number)}</div>` : ''}
                </div>
                <div style="font-size: 13px; font-weight: 600; color: ${balanceColor};">
                    ${this.formatCurrency(balance)}
                </div>
            </div>
        `;
    },

    // =====================================================
    // All Clients Header Item
    // =====================================================

    allClientsItem(totalBalance, clientCount, isActive = false) {
        const balanceColor = totalBalance > 0 ? '#10b981' : (totalBalance < 0 ? '#ef4444' : '#64748b');

        return `
            <div class="iolta-client-item ${isActive ? 'active' : ''}"
                 onclick="IoltaUI.selectClient('all')"
                 style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; ${isActive ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'border-left: 3px solid transparent;'}">
                <div>
                    <div style="font-size: 13px; font-weight: 600; color: #3b82f6;">All Clients</div>
                    <div style="font-size: 11px; color: #64748b;">${clientCount} total</div>
                </div>
                <div style="font-size: 13px; font-weight: 700; color: ${balanceColor};">
                    ${this.formatCurrency(totalBalance)}
                </div>
            </div>
        `;
    },

    // =====================================================
    // Transaction Row
    // =====================================================

    transactionRow(tx, options = {}) {
        const {
            showClientName = false,
            showCheckbox = true,
            isSelected = false,
            index = 0,
            clientName = ''
        } = options;

        const isStaging = tx.is_staging === true;
        const amount = parseFloat(tx.amount || 0);
        const isDebit = amount < 0;
        const displayAmount = Math.abs(amount);

        // Reference number
        let refNum = tx.reference_number || tx.check_number || '';
        if (!refNum && tx.description) {
            const match = tx.description.match(/CHECK\s*#?\s*(\d+)/i);
            if (match) refNum = match[1];
        }

        // Description
        let description = tx.description || tx.payee || '-';
        if (showClientName && clientName) {
            description = `<span style="color: #6366f1; font-weight: 500;">${this.escapeHtml(clientName)}</span> - ${this.escapeHtml(description)}`;
        } else {
            description = this.escapeHtml(description);
        }

        // Status
        let statusText, statusBg, statusColor;
        if (isStaging) {
            statusText = 'Unassigned';
            statusBg = '#fef3c7';
            statusColor = '#d97706';
        } else {
            const isPosted = tx.is_posted == 1;
            statusText = isPosted ? 'Posted' : 'Pending';
            statusBg = isPosted ? '#dcfce7' : '#fef3c7';
            statusColor = isPosted ? '#16a34a' : '#d97706';
        }

        // Balance (not applicable for staging)
        const balance = isStaging ? null : parseFloat(tx.running_balance || 0);
        const balanceDisplay = isStaging ? '-' : this.formatCurrency(balance);
        const balanceColor = isStaging ? '#94a3b8' : (balance >= 0 ? '#1e293b' : '#ef4444');

        return `
            <div class="iolta-tx-row ${isSelected ? 'selected' : ''}"
                 data-tx-id="${tx.id}"
                 data-index="${index}"
                 style="display: grid; grid-template-columns: ${showCheckbox ? '36px ' : ''}90px 70px 1fr 100px 100px 80px; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; ${isSelected ? 'background: #eff6ff;' : ''}">
                ${showCheckbox ? `
                <div style="display: flex; align-items: center;">
                    <input type="checkbox"
                           class="iolta-tx-checkbox"
                           data-tx-id="${tx.id}"
                           ${isSelected ? 'checked' : ''}
                           onclick="IoltaUI.toggleTxSelection('${tx.id}', event)"
                           style="width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6;">
                </div>
                ` : ''}
                <div style="font-size: 13px; color: #64748b;">${this.formatDate(tx.transaction_date)}</div>
                <div style="font-size: 12px; font-weight: 500; color: ${refNum ? '#7c3aed' : '#cbd5e1'};">${refNum || '-'}</div>
                <div style="font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${description}</div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isDebit ? '#ef4444' : '#10b981'};">
                    ${isDebit ? '-' : '+'}${this.formatCurrency(displayAmount)}
                </div>
                <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${balanceColor};">
                    ${balanceDisplay}
                </div>
                <div style="text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 500; border-radius: 4px; background: ${statusBg}; color: ${statusColor};">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    },

    // =====================================================
    // Transaction List Header
    // =====================================================

    transactionListHeader(options = {}) {
        const { showCheckbox = true, balanceLabel = 'Balance' } = options;

        return `
            <div style="display: grid; grid-template-columns: ${showCheckbox ? '36px ' : ''}90px 70px 1fr 100px 100px 80px; gap: 8px; padding: 10px 16px; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                ${showCheckbox ? `
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" onclick="IoltaUI.toggleSelectAll(this.checked)" style="width: 16px; height: 16px;">
                </div>
                ` : ''}
                <div>Date</div>
                <div>Check #</div>
                <div>Description</div>
                <div style="text-align: right;">Amount</div>
                <div style="text-align: right;">${balanceLabel}</div>
                <div style="text-align: center;">Status</div>
            </div>
        `;
    },

    // =====================================================
    // Empty State
    // =====================================================

    emptyState(icon = '📄', title = 'No Data', subtitle = '') {
        return `
            <div style="padding: 48px; text-align: center; color: #94a3b8;">
                <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
                <div style="font-size: 16px; font-weight: 500; color: #64748b;">${title}</div>
                ${subtitle ? `<div style="font-size: 14px; margin-top: 4px;">${subtitle}</div>` : ''}
            </div>
        `;
    },

    // =====================================================
    // Summary Card
    // =====================================================

    summaryCard(label, value, color = '#1e293b') {
        return `
            <div style="text-align: center; padding: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: ${color};">
                    ${typeof value === 'number' ? this.formatCurrency(value) : value}
                </div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${label}</div>
            </div>
        `;
    },

    // =====================================================
    // Balance Summary Bar
    // =====================================================

    balanceSummaryBar(bankBalance, bookBalance, difference) {
        const diffColor = Math.abs(difference) < 0.01 ? '#10b981' : '#ef4444';

        return `
            <div style="display: flex; justify-content: space-around; padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 16px;">
                <div style="text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Bank Balance</div>
                    <div style="font-size: 18px; font-weight: 700; color: #1e293b;">${this.formatCurrency(bankBalance)}</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Book Balance</div>
                    <div style="font-size: 18px; font-weight: 700; color: #1e293b;">${this.formatCurrency(bookBalance)}</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Difference</div>
                    <div style="font-size: 18px; font-weight: 700; color: ${diffColor};">${this.formatCurrency(difference)}</div>
                </div>
            </div>
        `;
    },

    // =====================================================
    // Utility Functions
    // =====================================================

    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '-';
        const num = parseFloat(amount);
        return '$' + num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export
window.IoltaComponents = IoltaComponents;
