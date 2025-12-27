// Filter check status list by search query
function filterCheckStatusList(query) {
    checkStatusModalState.searchQuery = query.toLowerCase().trim();
    if (!checkStatusModalState.searchQuery) {
        checkStatusModalState.filteredChecks = [...checkStatusModalState.checks];
    } else {
        checkStatusModalState.filteredChecks = checkStatusModalState.checks.filter(check => {
            const checkNumber = (check.check_number || check.reference_number || '').toLowerCase();
            const clientName = (check.client_name || '').toLowerCase();
            const payee = (check.payee || check.entity_name || '').toLowerCase();
            return checkNumber.includes(checkStatusModalState.searchQuery) ||
                   clientName.includes(checkStatusModalState.searchQuery) ||
                   payee.includes(checkStatusModalState.searchQuery);
        });
    }
    renderCheckStatusList();
}

// Render the filtered check list
function renderCheckStatusList() {
    const container = document.getElementById('check-status-list');
    if (!container) return;
    const status = checkStatusModalState.currentTab;
    const checks = checkStatusModalState.filteredChecks;

    if (checks.length === 0) {
        const emptyMsgs = {
            pending: { icon: '✅', title: 'No pending checks', sub: 'All checks have been printed' },
            printed: { icon: '📭', title: 'No printed checks', sub: 'Printed checks will appear here' },
            cleared: { icon: '📋', title: 'No cleared checks', sub: 'Cleared checks will appear here' }
        };
        const msg = checkStatusModalState.searchQuery ?
            { icon: '🔍', title: 'No checks found', sub: 'Try a different search term' } : emptyMsgs[status];
        container.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">${msg.icon}</div>
                <p style="font-size: 15px; margin: 0;">${msg.title}</p>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">${msg.sub}</p>
            </div>`;
        return;
    }

    const showCheckbox = status !== 'cleared';
    const colorMap = {
        pending: { c: '#f59e0b', h: '#fef3c7', s: '#fde68a' },
        printed: { c: '#3b82f6', h: '#eff6ff', s: '#dbeafe' },
        cleared: { c: '#22c55e', h: '#f0fdf4', s: '#dcfce7' }
    };
    const colors = colorMap[status];

    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    ${showCheckbox ? '<th style="padding: 12px 8px; width: 40px;"></th>' : ''}
                    <th style="padding: 12px 8px; text-align: left;">Check #</th>
                    <th style="padding: 12px 8px; text-align: left;">Date</th>
                    <th style="padding: 12px 8px; text-align: left;">Client</th>
                    <th style="padding: 12px 8px; text-align: left;">Payee</th>
                    <th style="padding: 12px 8px; text-align: right;">Amount</th>
                </tr>
            </thead>
            <tbody>`;

    checks.forEach(check => {
        const date = new Date(check.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const checkNum = check.check_number || check.reference_number || '-';
        const payeeName = check.payee || check.entity_name || '-';
        const clientName = check.client_name || '-';

        html += `
            <tr class="check-status-row" data-id="${check.id}"
                style="border-bottom: 1px solid #f1f5f9; cursor: ${showCheckbox ? 'pointer' : 'default'};"
                onmouseover="this.style.background='${colors.h}'"
                onmouseout="this.style.background=this.classList.contains('selected') ? '${colors.s}' : 'transparent'">`;

        if (showCheckbox) {
            html += `
                <td style="padding: 12px 8px;">
                    <input type="checkbox" class="check-status-checkbox"
                           data-id="${check.id}"
                           data-check-number="${check.check_number || check.reference_number || ''}"
                           data-payee="${check.payee || check.entity_name || ''}"
                           data-amount="${Math.abs(check.amount)}"
                           data-date="${check.transaction_date}"
                           data-memo="${check.description || ''}"
                           data-client="${check.client_name || ''}"
                           onclick="handleCheckStatusCheckboxClick(this, event)"
                           style="width: 16px; height: 16px; cursor: pointer;">
                </td>`;
        }

        html += `
                <td style="padding: 12px 8px; font-weight: 600; color: ${colors.c};">${checkNum}</td>
                <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                <td style="padding: 12px 8px;">${clientName}</td>
                <td style="padding: 12px 8px;">${payeeName}</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
            </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Restore selected state
    checkStatusModalState.selectedIds.forEach(id => {
        const cb = container.querySelector(`.check-status-checkbox[data-id="${id}"]`);
        if (cb) {
            cb.checked = true;
            const row = cb.closest('tr');
            if (row) row.classList.add('selected');
        }
    });

    updateCheckStatusSelection();
}

// Make functions globally available
window.filterCheckStatusList = filterCheckStatusList;
window.renderCheckStatusList = renderCheckStatusList;
