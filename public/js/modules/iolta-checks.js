// =====================================================
// IOLTA Checks Module
// Version: 20251225
// Dependencies: iolta-common.js
// =====================================================
// Check Status Management (Pending/Printed/Cleared)
// - Check Status Modal with tabs
// - Pending Checks list and printing
// - Printed Checks list and clearing
// - Cleared Checks list
// - Bulk operations and shift-select
// =====================================================


// =====================================================
// Check History Selection Functions
// =====================================================

// Track last clicked checkbox for shift-select
let lastClickedCheckbox = null;

// Toggle select all checkboxes
function toggleSelectAllChecks(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', masterCheckbox.checked);
            row.style.background = masterCheckbox.checked ? '#eff6ff' : 'transparent';
        }
    });
    lastClickedCheckbox = null;
    updateCheckSelection();
}

// Handle checkbox click with shift-select support
function handleCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.check-tx-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.classList.toggle('selected', shouldCheck);
                    row.style.background = shouldCheck ? '#eff6ff' : 'transparent';
                }
            }
        }
    }

    lastClickedCheckbox = checkbox;
    updateCheckSelection();
}

// Update selection count and show/hide delete button
function updateCheckSelection() {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox:checked');
    const count = checkboxes.length;
    const deleteBtn = document.getElementById('checks-delete-selected-btn');
    const countSpan = document.getElementById('checks-selected-count');
    const selectAllCheckbox = document.getElementById('checks-select-all');

    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = count;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.check-tx-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // Update row backgrounds
    document.querySelectorAll('.check-tx-checkbox').forEach(cb => {
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', cb.checked);
            if (!row.matches(':hover')) {
                row.style.background = cb.checked ? '#eff6ff' : 'transparent';
            }
        }
    });
}

// Delete selected check transactions
async function deleteSelectedChecks() {
    const checkboxes = document.querySelectorAll('.check-tx-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.txId);

    if (ids.length === 0) {
        showToast('No transactions selected', 'error');
        return;
    }

    const confirmMsg = ids.length === 1
        ? 'Are you sure you want to delete this transaction?'
        : `Are you sure you want to delete ${ids.length} transactions?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    // Delete each selected transaction
    for (const txId of ids) {
        try {
            // DELETE uses query parameters, not body
            const result = await apiDelete(`/trust/transactions.php?id=${txId}&user_id=${userId}`);
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Failed to delete transaction:', txId, result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Error deleting transaction:', txId, error);
        }
    }

    // Show result
    if (successCount > 0) {
        showToast(`Deleted ${successCount} transaction${successCount > 1 ? 's' : ''}`, 'success');
    }
    if (errorCount > 0) {
        showToast(`Failed to delete ${errorCount} transaction${errorCount > 1 ? 's' : ''}`, 'error');
    }

    // Refresh the transaction list
    const selectedLedger = document.getElementById('trust-check-ledger')?.value;
    if (selectedLedger) {
        loadClientTransactionHistory(selectedLedger, 'checks');
    }

    // Refresh client sidebar to update balances
    renderChecksClientSidebar();
}

// =====================================================
// Deposit History Selection Functions
// =====================================================

// Track last clicked deposit checkbox for shift-select
let lastClickedDepositCheckbox = null;

// Toggle select all deposit checkboxes
function toggleSelectAllDeposits(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', masterCheckbox.checked);
            row.style.background = masterCheckbox.checked ? '#eff6ff' : 'transparent';
        }
    });
    lastClickedDepositCheckbox = null;
    updateDepositSelection();
}

// Handle deposit checkbox click with shift-select support
function handleDepositCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.deposit-tx-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedDepositCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedDepositCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.classList.toggle('selected', shouldCheck);
                    row.style.background = shouldCheck ? '#eff6ff' : 'transparent';
                }
            }
        }
    }

    lastClickedDepositCheckbox = checkbox;
    updateDepositSelection();
}

// Update deposit selection count and show/hide delete button
function updateDepositSelection() {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox:checked');
    const count = checkboxes.length;
    const deleteBtn = document.getElementById('deposits-delete-selected-btn');
    const countSpan = document.getElementById('deposits-selected-count');
    const selectAllCheckbox = document.getElementById('deposits-select-all');

    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = count;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.deposit-tx-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // Update row backgrounds
    document.querySelectorAll('.deposit-tx-checkbox').forEach(cb => {
        const row = cb.closest('tr');
        if (row) {
            row.classList.toggle('selected', cb.checked);
            if (!row.matches(':hover')) {
                row.style.background = cb.checked ? '#eff6ff' : 'transparent';
            }
        }
    });
}

// Delete selected deposit transactions
async function deleteSelectedDeposits() {
    const checkboxes = document.querySelectorAll('.deposit-tx-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.txId);

    if (ids.length === 0) {
        showToast('No deposits selected', 'error');
        return;
    }

    const confirmMsg = ids.length === 1
        ? 'Are you sure you want to delete this deposit?'
        : `Are you sure you want to delete ${ids.length} deposits?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    let successCount = 0;
    let errorCount = 0;

    // Delete each selected transaction
    for (const txId of ids) {
        try {
            // DELETE uses query parameters, not body
            const result = await apiDelete(`/trust/transactions.php?id=${txId}&user_id=${userId}`);
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Failed to delete deposit:', txId, result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Error deleting deposit:', txId, error);
        }
    }

    // Show result
    if (successCount > 0) {
        showToast(`Deleted ${successCount} deposit${successCount > 1 ? 's' : ''}`, 'success');
    }
    if (errorCount > 0) {
        showToast(`Failed to delete ${errorCount} deposit${errorCount > 1 ? 's' : ''}`, 'error');
    }

    // Refresh the transaction list - check both possible element IDs
    const selectedLedger = document.getElementById('trust-deposit-ledger')?.value ||
                          ioltaState.selectedDepositLedgerId;
    if (selectedLedger) {
        loadClientTransactionHistory(selectedLedger, 'receive');
    }

    // Refresh client sidebar to update balances
    renderDepositClientSidebar();
}

// =====================================================
// UNIFIED CHECK STATUS MODAL
// =====================================================

// Current state for check status modal
let checkStatusModalState = {
    currentTab: 'pending',
    checks: [],
    filteredChecks: [],
    selectedIds: new Set(),
    searchQuery: ''
};

// Track last clicked checkbox for shift-select
let lastClickedCheckStatusCheckbox = null;

// Open unified check status modal
async function openCheckStatusModal(tab = 'pending') {
    const modal = document.getElementById('check-status-modal');
    if (modal) {
        modal.style.display = 'flex';
        checkStatusModalState.currentTab = tab;
        // Load all tab counts first before switching to selected tab
        await loadAllCheckStatusCounts();
        await switchCheckStatusTab(tab);
    }
}

// Close unified check status modal
function closeCheckStatusModal() {
    const modal = document.getElementById('check-status-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    checkStatusModalState.selectedIds.clear();
}

// Switch tabs in check status modal
async function switchCheckStatusTab(tab) {
    checkStatusModalState.currentTab = tab;
    checkStatusModalState.selectedIds.clear();
    lastClickedCheckStatusCheckbox = null;

    // Update tab styles
    const tabs = ['pending', 'printed', 'cleared'];
    const tabColors = {
        pending: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', countBg: '#f59e0b' },
        printed: { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', countBg: '#3b82f6' },
        cleared: { bg: '#dcfce7', color: '#166534', border: '#22c55e', countBg: '#22c55e' }
    };

    tabs.forEach(t => {
        const tabBtn = document.getElementById(`check-tab-${t}`);
        const countSpan = document.getElementById(`check-tab-${t}-count`);
        if (tabBtn) {
            if (t === tab) {
                tabBtn.style.background = tabColors[t].bg;
                tabBtn.style.color = tabColors[t].color;
                tabBtn.style.borderBottom = `3px solid ${tabColors[t].border}`;
                if (countSpan) countSpan.style.background = tabColors[t].countBg;
            } else {
                tabBtn.style.background = 'transparent';
                tabBtn.style.color = '#64748b';
                tabBtn.style.borderBottom = '3px solid transparent';
                if (countSpan) countSpan.style.background = '#94a3b8';
            }
        }
    });

    // Update action bar style and buttons
    const actionBar = document.getElementById('check-status-action-bar');
    const selectLabel = document.getElementById('check-status-select-label');
    const actionsDiv = document.getElementById('check-status-actions');

    if (actionBar) {
        actionBar.style.background = tabColors[tab].bg;
    }
    if (selectLabel) {
        selectLabel.style.color = tabColors[tab].color;
    }

    // Set action buttons based on tab
    if (actionsDiv) {
        if (tab === 'pending') {
            actionsDiv.innerHTML = `
                <button id="check-status-print-selected" onclick="printSelectedCheckStatus()" style="padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: none;">
                    &#128424; Print Selected
                </button>
                <button id="check-status-print-all" onclick="printAllCheckStatus()" style="padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                    &#128424; Print All
                </button>
            `;
        } else if (tab === 'printed') {
            actionsDiv.innerHTML = `
                <button id="check-status-mark-cleared" onclick="markSelectedCheckStatusCleared()" style="padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: none;">
                    &#10003; Mark Cleared
                </button>
                <button id="check-status-reprint" onclick="reprintSelectedCheckStatus()" style="padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: none;">
                    &#128424; Reprint
                </button>
            `;
        } else {
            actionsDiv.innerHTML = `<span style="font-size: 13px; color: #64748b;">View only</span>`;
        }
    }

    // Reset select all checkbox
    const selectAllCb = document.getElementById('check-status-select-all');
    if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.style.display = tab === 'cleared' ? 'none' : 'inline-block';
    }

    // Load checks for this tab
    await loadCheckStatusList(tab);
}

// Load checks for current tab
async function loadCheckStatusList(status) {
    const container = document.getElementById('check-status-list');
    if (!container) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Try to use cached data first (from loadAllCheckStatusCounts)
        let checks = getCachedChecksByStatus(status);

        // If no cache, fetch from API
        if (!checks) {
            const result = await apiGet('/trust/transactions.php', {
                user_id: userId,
                status: status,
                all: 1
            });

            const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];

            // Filter to only include transactions with check_number (actual checks)
            checks = allTransactions.filter(t =>
                (t.check_number && t.check_number.trim() !== '') ||
                (t.reference_number && t.reference_number.trim() !== '')
            );
        }

        checkStatusModalState.checks = checks;
        checkStatusModalState.filteredChecks = [...checks];
        checkStatusModalState.searchQuery = '';

        // Clear search input
        const searchInput = document.getElementById('check-status-search');
        if (searchInput) searchInput.value = '';

        // Update tab counts
        updateCheckStatusTabCount(status, checks.length);

        if (checks.length === 0) {
            const emptyMessages = {
                pending: { icon: '&#9989;', title: 'No pending checks', sub: 'All checks have been printed' },
                printed: { icon: '&#128237;', title: 'No printed checks', sub: 'Printed checks awaiting clearance will appear here' },
                cleared: { icon: '&#128203;', title: 'No cleared checks', sub: 'Cleared checks will appear here' }
            };
            const msg = emptyMessages[status];
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">${msg.icon}</div>
                    <p style="font-size: 15px; margin: 0;">${msg.title}</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">${msg.sub}</p>
                </div>
            `;
            // Hide print all button for pending
            const printAllBtn = document.getElementById('check-status-print-all');
            if (printAllBtn) printAllBtn.style.display = 'none';
            return;
        }

        // Show print all button for pending
        if (status === 'pending') {
            const printAllBtn = document.getElementById('check-status-print-all');
            if (printAllBtn) printAllBtn.style.display = 'inline-block';
        }

        // Build table
        const showCheckbox = status !== 'cleared';
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        ${showCheckbox ? '<th style="padding: 12px 8px; text-align: left; width: 40px;"></th>' : ''}
                        <th style="padding: 12px 8px; text-align: left;">Check #</th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Payee</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const statusColors = {
            pending: { checkColor: '#f59e0b', hoverBg: '#fef3c7', selectedBg: '#fde68a' },
            printed: { checkColor: '#3b82f6', hoverBg: '#eff6ff', selectedBg: '#dbeafe' },
            cleared: { checkColor: '#22c55e', hoverBg: '#f0fdf4', selectedBg: '#dcfce7' }
        };
        const colors = statusColors[status];

        checks.forEach(check => {
            const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr class="check-status-row" data-id="${check.id}"
                    style="border-bottom: 1px solid #f1f5f9; cursor: ${showCheckbox ? 'pointer' : 'default'};"
                    onmouseover="this.style.background='${colors.hoverBg}'"
                    onmouseout="this.style.background=this.classList.contains('selected') ? '${colors.selectedBg}' : 'transparent'">
                    ${showCheckbox ? `
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
                    </td>` : ''}
                    <td style="padding: 12px 8px; font-weight: 600; color: ${colors.checkColor};">${check.check_number || check.reference_number || '-'}</td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px;">${check.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${check.payee || check.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Reset selection
        updateCheckStatusSelection();

    } catch (error) {
        console.error('Error loading check status list:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 40px;">
                <p>Error loading checks</p>
            </div>
        `;
    }
}

// Update tab count badge
function updateCheckStatusTabCount(status, count) {
    const countSpan = document.getElementById(`check-tab-${status}-count`);
    if (countSpan) {
        countSpan.textContent = count;
    }
}

// Handle checkbox click with shift-select support
function handleCheckStatusCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.check-status-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedCheckStatusCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedCheckStatusCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    if (shouldCheck) {
                        row.classList.add('selected');
                    } else {
                        row.classList.remove('selected');
                    }
                }
            }
        }
    } else {
        const row = checkbox.closest('tr');
        if (row) {
            if (checkbox.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
    }

    lastClickedCheckStatusCheckbox = checkbox;
    updateCheckStatusSelection();
}

// Toggle select all
function toggleSelectAllCheckStatus(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.check-status-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            if (masterCheckbox.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
    });
    lastClickedCheckStatusCheckbox = null;
    updateCheckStatusSelection();
}

// Update selection count and show/hide action buttons
function updateCheckStatusSelection() {
    const checkboxes = document.querySelectorAll('.check-status-checkbox:checked');
    const count = checkboxes.length;
    const tab = checkStatusModalState.currentTab;

    const countSpan = document.getElementById('check-status-selected-count');
    if (countSpan) {
        countSpan.textContent = `(${count} selected)`;
    }

    // Show/hide action buttons based on selection
    if (tab === 'pending') {
        const printSelectedBtn = document.getElementById('check-status-print-selected');
        if (printSelectedBtn) {
            printSelectedBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }
    } else if (tab === 'printed') {
        const markClearedBtn = document.getElementById('check-status-mark-cleared');
        const reprintBtn = document.getElementById('check-status-reprint');
        if (markClearedBtn) {
            markClearedBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (reprintBtn) {
            reprintBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    // Update select all checkbox state
    const selectAllCb = document.getElementById('check-status-select-all');
    const allCheckboxes = document.querySelectorAll('.check-status-checkbox');
    if (selectAllCb) {
        if (allCheckboxes.length === 0) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        } else if (count === 0) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCb.checked = true;
            selectAllCb.indeterminate = false;
        } else {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = true;
        }
    }
}

// Print selected checks (for pending tab)
async function printSelectedCheckStatus() {
    const checkboxes = document.querySelectorAll('.check-status-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.id,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    await printChecksAndUpdateStatus(checksData);
    await switchCheckStatusTab('pending'); // Refresh list
}

// Print all checks (for pending tab)
async function printAllCheckStatus() {
    const checks = checkStatusModalState.checks;
    if (checks.length === 0) {
        showToast('No checks to print', 'error');
        return;
    }

    const checksData = checks.map(c => ({
        id: c.id,
        checkNumber: c.check_number || c.reference_number || '',
        payee: c.payee || c.entity_name || '',
        amount: Math.abs(parseFloat(c.amount)),
        date: c.transaction_date,
        memo: c.description || '',
        client: c.client_name || ''
    }));

    await printChecksAndUpdateStatus(checksData);
    await switchCheckStatusTab('pending'); // Refresh list
}

// Mark selected as cleared (for printed tab)
async function markSelectedCheckStatusCleared() {
    const checkboxes = document.querySelectorAll('.check-status-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const checkIds = Array.from(checkboxes).map(cb => cb.dataset.id);

    try {
        let successCount = 0;
        for (const id of checkIds) {
            const result = await apiPost('/trust/transactions.php', {
                action: 'update',
                id: parseInt(id),
                user_id: userId,
                status: 'cleared'
            });
            if (result.success) successCount++;
        }

        showToast(`${successCount} check(s) marked as cleared`, 'success');

        // Invalidate cache and refresh (single API call)
        invalidateCheckStatusCache();
        await loadAllCheckStatusCounts(true);
        await switchCheckStatusTab('printed');

    } catch (error) {
        console.error('Error marking checks as cleared:', error);
        showToast('Error updating check status', 'error');
    }
}

// Reprint selected checks (for printed tab)
async function reprintSelectedCheckStatus() {
    const checkboxes = document.querySelectorAll('.check-status-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        clientName: cb.dataset.client
    }));

    // Print without updating status
    for (const check of checksData) {
        printTrustCheck(check);
    }
}

// Load all check status counts
// Cache for check status data to avoid duplicate API calls
let _checkStatusCache = null;
let _checkStatusCacheTime = 0;
const CHECK_STATUS_CACHE_TTL = 5000; // 5 seconds

// Invalidate cache (call after delete/update operations)
function invalidateCheckStatusCache() {
    _checkStatusCache = null;
    _checkStatusCacheTime = 0;
}

async function loadAllCheckStatusCounts(forceRefresh = false) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Use single API call and cache results
        const now = Date.now();
        if (forceRefresh || !_checkStatusCache || (now - _checkStatusCacheTime) > CHECK_STATUS_CACHE_TTL) {
            const result = await apiGet('/trust/transactions.php', { user_id: userId, all: 1 });
            if (result.success && result.data && result.data.transactions) {
                _checkStatusCache = result.data.transactions.filter(t =>
                    (t.check_number && t.check_number.trim() !== '') ||
                    (t.reference_number && t.reference_number.trim() !== '')
                );
                _checkStatusCacheTime = now;
            } else {
                _checkStatusCache = [];
            }
        }

        const pendingCount = _checkStatusCache.filter(t => t.status === 'pending').length;
        const printedCount = _checkStatusCache.filter(t => t.status === 'printed').length;
        const clearedCount = _checkStatusCache.filter(t => t.status === 'cleared').length;

        // Update tab counts
        updateCheckStatusTabCount('pending', pendingCount);
        updateCheckStatusTabCount('printed', printedCount);
        updateCheckStatusTabCount('cleared', clearedCount);

        // Update button counts on main page
        updatePendingChecksCount(pendingCount);
        updatePrintedChecksCount(printedCount);
        updateClearedChecksCount(clearedCount);

    } catch (error) {
        console.error('Error loading check status counts:', error);
    }
}

// Get cached checks by status (for loadCheckStatusList to reuse)
function getCachedChecksByStatus(status) {
    if (_checkStatusCache) {
        return _checkStatusCache.filter(t => t.status === status);
    }
    return null;
}

// Legacy functions - redirect to unified modal
async function openPendingChecksModal() {
    await openCheckStatusModal('pending');
}

function closePendingChecksModal() {
    closeCheckStatusModal();
}

async function openPrintedChecksModal() {
    await openCheckStatusModal('printed');
}

function closePrintedChecksModal() {
    closeCheckStatusModal();
}

async function openClearedChecksModal() {
    await openCheckStatusModal('cleared');
}

function closeClearedChecksModal() {
    closeCheckStatusModal();
}

// Load pending checks from API
async function loadPendingChecksList() {
    const container = document.getElementById('pending-checks-list');
    if (!container) {
        console.error('pending-checks-list container not found!');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Get pending checks (status = 'pending') - checks have check_number or reference_number
        // We filter by status='pending' and check for check/reference number on the client side
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            status: 'pending',
            all: 1
        });

        // Filter to only include transactions with check_number (actual checks)

        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];

        const checks = allTransactions.filter(t =>
            (t.check_number && t.check_number.trim() !== '') ||
            (t.reference_number && t.reference_number.trim() !== '')
        );

        if (checks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">&#9989;</div>
                    <p style="font-size: 15px; margin: 0;">No pending checks</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">All checks have been printed</p>
                </div>
            `;
            // Update count and hide print all button
            updatePendingChecksCount(0);
            const printAllBtn = document.getElementById('print-all-pending-btn');
            if (printAllBtn) printAllBtn.style.display = 'none';
            return;
        }

        updatePendingChecksCount(checks.length);

        // Show print all button
        const printAllBtn = document.getElementById('print-all-pending-btn');
        if (printAllBtn) printAllBtn.style.display = 'inline-block';

        // Build table
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 12px 8px; text-align: left; width: 40px;"></th>
                        <th style="padding: 12px 8px; text-align: left;">Check #</th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Payee</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        checks.forEach(check => {
            const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;"
                    onmouseover="this.style.background='#fefce8'"
                    onmouseout="this.style.background=this.querySelector('.pending-check-checkbox').checked ? '#fef3c7' : 'transparent'">
                    <td style="padding: 12px 8px;">
                        <input type="checkbox" class="pending-check-checkbox"
                               data-check-id="${check.id}"
                               data-check-number="${check.check_number || check.reference_number || ''}"
                               data-payee="${check.payee || check.entity_name || ''}"
                               data-amount="${Math.abs(check.amount)}"
                               data-date="${check.transaction_date}"
                               data-memo="${check.description || ''}"
                               data-client="${check.client_name || ''}"
                               onclick="handlePendingCheckboxClick(this, event)"
                               style="width: 16px; height: 16px; cursor: pointer;">
                    </td>
                    <td style="padding: 12px 8px; font-weight: 600; color: #7c3aed;">${check.check_number || check.reference_number || '-'}</td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px;">${check.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${check.payee || check.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Reset selection state
        lastClickedPendingCheckbox = null;
        document.getElementById('pending-checks-select-all').checked = false;
        updatePendingCheckSelection();

    } catch (error) {
        console.error('Error loading pending checks:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 40px;">
                <p>Error loading pending checks</p>
            </div>
        `;
    }
}

// Update pending checks count in button (updates all elements)
function updatePendingChecksCount(count) {
    // Update all elements with id or class 'pending-checks-count'
    document.querySelectorAll('#pending-checks-count, .pending-checks-count').forEach(span => {
        span.textContent = count;
    });
}

// Load ALL check counts in a single API call (pending, printed, cleared)
async function loadAllChecksCounts() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        // Single API call to get all transactions with check numbers
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            all: 1
        });
        if (result.success && result.data.transactions) {
            // Filter to transactions with check_number OR reference_number (actual checks)
            const allChecks = result.data.transactions.filter(t =>
                (t.check_number && t.check_number.trim() !== '') ||
                (t.reference_number && t.reference_number.trim() !== '')
            );

            // Count by status
            const pendingCount = allChecks.filter(t => t.status === 'pending').length;
            const printedCount = allChecks.filter(t => t.status === 'printed').length;
            const clearedCount = allChecks.filter(t => t.status === 'cleared').length;

            updatePendingChecksCount(pendingCount);
            updatePrintedChecksCount(printedCount);
            updateClearedChecksCount(clearedCount);
        } else {
            updatePendingChecksCount(0);
            updatePrintedChecksCount(0);
            updateClearedChecksCount(0);
        }
    } catch (error) {
        console.error('Error loading checks counts:', error);
        updatePendingChecksCount(0);
        updatePrintedChecksCount(0);
        updateClearedChecksCount(0);
    }
}

// Load pending checks count (for button display) - legacy, calls combined function
async function loadPendingChecksCount() {
    // For backward compatibility, just call the combined function
    await loadAllChecksCounts();
}

// Handle pending checkbox click with shift-select support
function handlePendingCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.pending-check-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedPendingCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedPendingCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.style.background = shouldCheck ? '#fef3c7' : 'transparent';
                }
            }
        }
    }

    lastClickedPendingCheckbox = checkbox;
    updatePendingCheckSelection();
}

// Toggle select all pending checks
function toggleSelectAllPendingChecks(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.style.background = masterCheckbox.checked ? '#fef3c7' : 'transparent';
        }
    });
    lastClickedPendingCheckbox = null;
    updatePendingCheckSelection();
}

// Update pending check selection count
function updatePendingCheckSelection() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox:checked');
    const count = checkboxes.length;
    const printSelectedBtn = document.getElementById('print-selected-checks-btn');
    const countSpan = document.getElementById('pending-checks-selected-count');
    const selectAllCheckbox = document.getElementById('pending-checks-select-all');

    if (printSelectedBtn) {
        printSelectedBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = `(${count} selected)`;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.pending-check-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
}

// Print selected pending checks
async function printSelectedPendingChecks() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.checkId,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    await printChecksAndUpdateStatus(checksData);
}

// Print all pending checks
async function printAllPendingChecks() {
    const checkboxes = document.querySelectorAll('.pending-check-checkbox');
    if (checkboxes.length === 0) {
        showToast('No pending checks to print', 'info');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.checkId,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    await printChecksAndUpdateStatus(checksData);
}

// Print checks and update their status to 'printed'
async function printChecksAndUpdateStatus(checksData) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Build print HTML for multiple checks
    let printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Checks</title>
            <style>
                @page { size: 8.5in 3.5in; margin: 0; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                .check-page {
                    width: 8.5in;
                    height: 3.5in;
                    padding: 0.25in 0.5in;
                    box-sizing: border-box;
                    page-break-after: always;
                    position: relative;
                }
                .check-page:last-child { page-break-after: auto; }
                .check-date { position: absolute; top: 0.4in; right: 0.75in; font-size: 12pt; }
                .check-payee { position: absolute; top: 0.85in; left: 1in; font-size: 12pt; }
                .check-amount-box { position: absolute; top: 0.8in; right: 0.5in; font-size: 12pt; font-weight: bold; border: 1px solid #333; padding: 4px 8px; }
                .check-amount-words { position: absolute; top: 1.25in; left: 0.5in; font-size: 11pt; }
                .check-memo { position: absolute; top: 2.1in; left: 0.5in; font-size: 10pt; color: #666; }
                .check-number { position: absolute; top: 0.25in; right: 0.5in; font-size: 14pt; font-weight: bold; color: #7c3aed; }
            </style>
        </head>
        <body>
    `;

    checksData.forEach(check => {
        const date = new Date(check.date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        });
        const amountWords = numberToWords(check.amount);

        printHTML += `
            <div class="check-page">
                <div class="check-number">#${check.checkNumber || 'N/A'}</div>
                <div class="check-date">${date}</div>
                <div class="check-payee">PAY TO THE ORDER OF: ${check.payee || ''}</div>
                <div class="check-amount-box">$${check.amount.toFixed(2)}</div>
                <div class="check-amount-words">${amountWords} DOLLARS</div>
                <div class="check-memo">MEMO: ${check.memo || ''} | Client: ${check.client || ''}</div>
            </div>
        `;
    });

    printHTML += '</body></html>';

    // Open print window
    const printWindow = window.open('', '_blank', 'width=900,height=400');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    // Update status to 'printed' immediately (no confirm dialog - it gets suppressed by browser)
    let successCount = 0;
    let errorCount = 0;

    for (const check of checksData) {
        try {
            const result = await apiPost('/trust/transactions.php', {
                action: 'update',
                id: parseInt(check.id),
                user_id: userId,
                status: 'printed'
            });
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Failed to update check status:', check.id, result.message);
            }
        } catch (error) {
            errorCount++;
            console.error('Error updating check status:', check.id, error);
        }
    }

    // Show result and refresh
    if (successCount > 0) {
        showToast(`${successCount} check(s) marked as printed`, 'success');
    }
    if (errorCount > 0) {
        showToast(`Failed to update ${errorCount} check(s)`, 'error');
    }

    // Refresh all related UI (single API call)
    invalidateCheckStatusCache();
    await loadAllCheckStatusCounts(true);
    await loadPendingChecksList();
}

// =====================================================
// PRINTED CHECKS FUNCTIONS
// =====================================================

// Track last clicked printed checkbox for shift-select
let lastClickedPrintedCheckbox = null;

// Open printed checks modal and load printed checks
async function openPrintedChecksModal() {
    const modal = document.getElementById('printed-checks-modal');
    if (modal) {
        modal.style.display = 'flex';
        await loadPrintedChecksList();
    }
}

// Close printed checks modal
function closePrintedChecksModal() {
    const modal = document.getElementById('printed-checks-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load printed checks from API
async function loadPrintedChecksList() {
    const container = document.getElementById('printed-checks-list');
    if (!container) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            status: 'printed',
            all: 1
        });

        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];

        // Filter to only include transactions with check_number (actual checks)
        const checks = allTransactions.filter(t =>
            (t.check_number && t.check_number.trim() !== '') ||
            (t.reference_number && t.reference_number.trim() !== '')
        );

        if (checks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">&#9989;</div>
                    <p style="font-size: 15px; margin: 0;">No printed checks awaiting clearance</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">All printed checks have been cleared</p>
                </div>
            `;
            updatePrintedChecksCount(0);
            return;
        }

        updatePrintedChecksCount(checks.length);

        // Build table
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 12px 8px; text-align: left; width: 40px;"></th>
                        <th style="padding: 12px 8px; text-align: left;">Check #</th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Payee</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        checks.forEach(check => {
            const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;"
                    onmouseover="this.style.background='#eff6ff'"
                    onmouseout="this.style.background=this.querySelector('.printed-check-checkbox').checked ? '#dbeafe' : 'transparent'">
                    <td style="padding: 12px 8px;">
                        <input type="checkbox" class="printed-check-checkbox"
                               data-check-id="${check.id}"
                               data-check-number="${check.check_number || check.reference_number || ''}"
                               data-payee="${check.payee || check.entity_name || ''}"
                               data-amount="${Math.abs(check.amount)}"
                               data-date="${check.transaction_date}"
                               data-memo="${check.description || ''}"
                               data-client="${check.client_name || ''}"
                               onclick="handlePrintedCheckboxClick(this, event)"
                               style="width: 16px; height: 16px; cursor: pointer;">
                    </td>
                    <td style="padding: 12px 8px; font-weight: 600; color: #3b82f6;">${check.check_number || check.reference_number || '-'}</td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px;">${check.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${check.payee || check.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Reset selection state
        lastClickedPrintedCheckbox = null;
        document.getElementById('printed-checks-select-all').checked = false;
        updatePrintedCheckSelection();

    } catch (error) {
        console.error('Error loading printed checks:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 40px;">
                <p>Error loading printed checks</p>
            </div>
        `;
    }
}

// Update printed checks count
function updatePrintedChecksCount(count) {
    document.querySelectorAll('#iolta-printed-count').forEach(span => {
        span.textContent = count;
    });
}

// Load printed checks count (for button display)
async function loadPrintedChecksCount() {
    // No-op: counts are now loaded by loadAllChecksCounts()
    // Kept for backward compatibility
}

// Handle printed checkbox click with shift-select support
function handlePrintedCheckboxClick(checkbox, event) {
    const checkboxes = Array.from(document.querySelectorAll('.printed-check-checkbox'));
    const currentIndex = checkboxes.indexOf(checkbox);

    if (event.shiftKey && lastClickedPrintedCheckbox !== null) {
        const lastIndex = checkboxes.indexOf(lastClickedPrintedCheckbox);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldCheck = checkbox.checked;

            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = shouldCheck;
                const row = checkboxes[i].closest('tr');
                if (row) {
                    row.style.background = shouldCheck ? '#dbeafe' : 'transparent';
                }
            }
        }
    }

    lastClickedPrintedCheckbox = checkbox;
    updatePrintedCheckSelection();
}

// Toggle select all printed checks
function toggleSelectAllPrintedChecks(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.printed-check-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const row = cb.closest('tr');
        if (row) {
            row.style.background = masterCheckbox.checked ? '#dbeafe' : 'transparent';
        }
    });
    lastClickedPrintedCheckbox = null;
    updatePrintedCheckSelection();
}

// Update printed check selection count
function updatePrintedCheckSelection() {
    const checkboxes = document.querySelectorAll('.printed-check-checkbox:checked');
    const count = checkboxes.length;
    const markClearedBtn = document.getElementById('mark-printed-cleared-btn');
    const reprintBtn = document.getElementById('reprint-selected-btn');
    const countSpan = document.getElementById('printed-checks-selected-count');
    const selectAllCheckbox = document.getElementById('printed-checks-select-all');

    if (markClearedBtn) {
        markClearedBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (reprintBtn) {
        reprintBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (countSpan) {
        countSpan.textContent = `(${count} selected)`;
    }

    // Update select all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.printed-check-checkbox');
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
}

// Mark selected printed checks as cleared
async function markSelectedPrintedChecksCleared() {
    const checkboxes = document.querySelectorAll('.printed-check-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const checkIds = Array.from(checkboxes).map(cb => cb.dataset.checkId);

    try {
        let successCount = 0;
        for (const id of checkIds) {
            const result = await apiPost('/trust/transactions.php', {
                action: 'update',
                id: parseInt(id),
                user_id: userId,
                status: 'cleared'
            });
            if (result.success) successCount++;
        }

        showToast(`${successCount} check(s) marked as cleared`, 'success');

        // Refresh lists
        await loadPrintedChecksList();
        await loadPrintedChecksCount();
        await loadPendingChecksCount();

        // Refresh main UI if on IOLTA page
        if (typeof loadIoltaPage === 'function') {
            await loadIoltaPage();
        }
    } catch (error) {
        console.error('Error marking checks as cleared:', error);
        showToast('Error updating check status', 'error');
    }
}

// Reprint selected checks
async function reprintSelectedChecks() {
    const checkboxes = document.querySelectorAll('.printed-check-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('No checks selected', 'error');
        return;
    }

    const checksData = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.checkId,
        checkNumber: cb.dataset.checkNumber,
        payee: cb.dataset.payee,
        amount: parseFloat(cb.dataset.amount),
        date: cb.dataset.date,
        memo: cb.dataset.memo,
        client: cb.dataset.client
    }));

    // Print without updating status (already printed)
    for (const check of checksData) {
        printTrustCheck({
            checkNumber: check.checkNumber,
            date: check.date,
            payee: check.payee,
            amount: check.amount,
            memo: check.memo,
            clientName: check.client
        });
    }
}

// =====================================================
// CLEARED CHECKS FUNCTIONS
// =====================================================

// Open cleared checks modal and load cleared checks
async function openClearedChecksModal() {
    const modal = document.getElementById('cleared-checks-modal');
    if (modal) {
        modal.style.display = 'flex';
        await loadClearedChecksList();
    }
}

// Close cleared checks modal
function closeClearedChecksModal() {
    const modal = document.getElementById('cleared-checks-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load cleared checks from API
async function loadClearedChecksList() {
    const container = document.getElementById('cleared-checks-list');
    if (!container) return;

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const result = await apiGet('/trust/transactions.php', {
            user_id: userId,
            status: 'cleared',
            all: 1
        });

        const allTransactions = result.success && result.data && result.data.transactions ? result.data.transactions : [];

        // Filter to only include transactions with check_number (actual checks)
        const checks = allTransactions.filter(t =>
            (t.check_number && t.check_number.trim() !== '') ||
            (t.reference_number && t.reference_number.trim() !== '')
        );

        const totalEl = document.getElementById('cleared-checks-total');
        if (totalEl) {
            totalEl.textContent = `(${checks.length} checks)`;
        }

        if (checks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">&#128237;</div>
                    <p style="font-size: 15px; margin: 0;">No cleared checks</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">Checks will appear here after they clear the bank</p>
                </div>
            `;
            updateClearedChecksCount(0);
            return;
        }

        updateClearedChecksCount(checks.length);

        // Build table
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 12px 8px; text-align: left;">Check #</th>
                        <th style="padding: 12px 8px; text-align: left;">Date</th>
                        <th style="padding: 12px 8px; text-align: left;">Client</th>
                        <th style="padding: 12px 8px; text-align: left;">Payee</th>
                        <th style="padding: 12px 8px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        checks.forEach(check => {
            const date = new Date(check.transaction_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;"
                    onmouseover="this.style.background='#f0fdf4'"
                    onmouseout="this.style.background='transparent'">
                    <td style="padding: 12px 8px; font-weight: 600; color: #22c55e;">${check.check_number || check.reference_number || '-'}</td>
                    <td style="padding: 12px 8px; color: #64748b;">${date}</td>
                    <td style="padding: 12px 8px;">${check.client_name || '-'}</td>
                    <td style="padding: 12px 8px;">${check.payee || check.entity_name || '-'}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(Math.abs(check.amount))}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading cleared checks:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 40px;">
                <p>Error loading cleared checks</p>
            </div>
        `;
    }
}

// Update cleared checks count
function updateClearedChecksCount(count) {
    document.querySelectorAll('#iolta-cleared-count').forEach(span => {
        span.textContent = count;
    });
}

// Load cleared checks count (for button display)
async function loadClearedChecksCount() {
    // No-op: counts are now loaded by loadAllChecksCounts()
    // Kept for backward compatibility
}

// Helper: Convert number to words for check printing
function numberToWords(num) {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
                  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
                  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

    if (num === 0) return 'ZERO';

    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);

    function convertHundreds(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
    }

    function convertThousands(n) {
        if (n < 1000) return convertHundreds(n);
        if (n < 1000000) return convertThousands(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convertHundreds(n % 1000) : '');
        return convertThousands(Math.floor(n / 1000000)) + ' MILLION' + (n % 1000000 ? ' ' + convertThousands(n % 1000000) : '');
    }

    let result = convertThousands(dollars);
    if (cents > 0) {
        result += ' AND ' + cents + '/100';
    }
    return result;
}


// =====================================================
// Window Exports
// =====================================================

// Check History Selection
window.toggleSelectAllChecks = toggleSelectAllChecks;
window.handleCheckboxClick = handleCheckboxClick;
window.updateCheckSelection = updateCheckSelection;
window.deleteSelectedChecks = deleteSelectedChecks;

// Deposit Selection
window.toggleSelectAllDeposits = toggleSelectAllDeposits;
window.handleDepositCheckboxClick = handleDepositCheckboxClick;
window.updateDepositSelection = updateDepositSelection;
window.deleteSelectedDeposits = deleteSelectedDeposits;

// Check Status Modal
window.openCheckStatusModal = openCheckStatusModal;
window.closeCheckStatusModal = closeCheckStatusModal;
window.switchCheckStatusTab = switchCheckStatusTab;
window.loadCheckStatusList = loadCheckStatusList;
window.handleCheckStatusCheckboxClick = handleCheckStatusCheckboxClick;
window.toggleSelectAllCheckStatus = toggleSelectAllCheckStatus;
window.updateCheckStatusSelection = updateCheckStatusSelection;
window.printSelectedCheckStatus = printSelectedCheckStatus;
window.printAllCheckStatus = printAllCheckStatus;
window.markSelectedCheckStatusCleared = markSelectedCheckStatusCleared;
window.reprintSelectedCheckStatus = reprintSelectedCheckStatus;
window.loadAllCheckStatusCounts = loadAllCheckStatusCounts;
window.loadAllChecksCounts = loadAllChecksCounts;

// Pending Checks
window.openPendingChecksModal = openPendingChecksModal;
window.closePendingChecksModal = closePendingChecksModal;
window.loadPendingChecksList = loadPendingChecksList;
window.updatePendingChecksCount = updatePendingChecksCount;
window.loadPendingChecksCount = loadPendingChecksCount;
window.handlePendingCheckboxClick = handlePendingCheckboxClick;
window.toggleSelectAllPendingChecks = toggleSelectAllPendingChecks;
window.updatePendingCheckSelection = updatePendingCheckSelection;
window.printSelectedPendingChecks = printSelectedPendingChecks;
window.printAllPendingChecks = printAllPendingChecks;
window.printChecksAndUpdateStatus = printChecksAndUpdateStatus;

// Printed Checks
window.openPrintedChecksModal = openPrintedChecksModal;
window.closePrintedChecksModal = closePrintedChecksModal;
window.loadPrintedChecksList = loadPrintedChecksList;
window.updatePrintedChecksCount = updatePrintedChecksCount;
window.loadPrintedChecksCount = loadPrintedChecksCount;
window.handlePrintedCheckboxClick = handlePrintedCheckboxClick;
window.toggleSelectAllPrintedChecks = toggleSelectAllPrintedChecks;
window.updatePrintedCheckSelection = updatePrintedCheckSelection;
window.markSelectedPrintedChecksCleared = markSelectedPrintedChecksCleared;
window.reprintSelectedChecks = reprintSelectedChecks;

// Cleared Checks
window.openClearedChecksModal = openClearedChecksModal;
window.closeClearedChecksModal = closeClearedChecksModal;
window.loadClearedChecksList = loadClearedChecksList;
window.updateClearedChecksCount = updateClearedChecksCount;
window.loadClearedChecksCount = loadClearedChecksCount;

console.log("IOLTA Checks module loaded");

