// =====================================================
// Receipts & Reimbursements Module
// Extracted from app.js for better code organization
// =====================================================

// Dependencies: This module requires the following globals from app.js:
// - state (global state object)
// - API_BASE (API base URL)
// - formatCurrency, formatDate (utility functions)
// - showToast, showLoading, hideLoading (UI functions)
// - openModal, closeModal (modal functions)
// - escapeHtml (utility function)

// Receipts state
if (!window._receiptsState) {
    window._receiptsState = {
        receiptsData: [],
        reimbursementsData: [],
        allReimbursementsData: [],
        currentTab: 'all',
        currentReceiptId: null,
        currentFilter: null,
        // Multi-select & Folder
        selectedReceipts: new Set(),
        isSelectionMode: false,
        folders: [],
        currentFolderId: null
    };
}
const receiptsState = window._receiptsState;

// Legacy aliases for compatibility
let receiptsData = receiptsState.receiptsData;
let reimbursementsData = receiptsState.reimbursementsData;
let allReimbursementsData = receiptsState.allReimbursementsData;
let currentReceiptsTab = receiptsState.currentTab;
let currentReceiptId = receiptsState.currentReceiptId;
let currentReimbursementFilter = receiptsState.currentFilter;

// =====================================================
// Main Functions
// =====================================================

let currentReceiptsView = 'list'; // 'list' or 'kanban'

async function loadReceiptsPage() {
    // Load data for both views
    await Promise.all([
        loadReceipts(),
        loadReimbursementSummary(),
        loadKanbanBoard(),
        loadFolders()
    ]);
}

async function switchReceiptsView(view) {
    currentReceiptsView = view;
    receiptsState.currentView = view;

    const listView = document.getElementById('receipts-list-view');
    const kanbanView = document.getElementById('receipts-kanban-view');
    const listBtn = document.getElementById('view-btn-list');
    const kanbanBtn = document.getElementById('view-btn-kanban');

    if (view === 'list') {
        listView.style.display = 'block';
        kanbanView.style.display = 'none';
        listBtn.classList.add('active');
        kanbanBtn.classList.remove('active');
        // Refresh list view data - reload everything and re-render current tab
        await loadReimbursementSummary();
        await loadReceipts();
        await updateTabCounts();
        // Re-trigger the current tab to refresh its content
        await switchReceiptsTab(currentReceiptsTab);
    } else {
        listView.style.display = 'none';
        kanbanView.style.display = 'block';
        listBtn.classList.remove('active');
        kanbanBtn.classList.add('active');
        // Refresh kanban data
        await loadKanbanBoard();
    }
}

// =====================================================
// Kanban Board Functions
// =====================================================

async function loadKanbanBoard() {
    try {
        // Load both reimbursement data and cash receipts
        const [reimbResponse, cashResponse] = await Promise.all([
            fetch(`${API_BASE}/reimbursements/?user_id=${state.currentUser}`),
            fetch(`${API_BASE}/receipts/?user_id=${state.currentUser}&unattached=1`)
        ]);

        const reimbResult = await reimbResponse.json();
        const cashResult = await cashResponse.json();

        if (reimbResult.success) {
            receiptsState.allReimbursementsData = reimbResult.data.transactions || [];
        }

        // Get cash pending receipts (unattached with none/pending status)
        const cashPendingReceipts = cashResult.success ? (cashResult.data.receipts || []) : [];

        // Render the kanban board
        renderKanbanBoard(receiptsState.allReimbursementsData, cashPendingReceipts);

    } catch (error) {
        console.error('Error loading kanban board:', error);
    }
}

function renderKanbanBoard(reimbData, cashPendingReceipts) {
    // Separate items by status
    const pendingItems = reimbData.filter(t => t.reimbursement_status === 'pending' && t.item_type === 'transaction');
    const submittedItems = reimbData.filter(t => t.reimbursement_status === 'submitted');
    const reimbursedItems = reimbData.filter(t => t.reimbursement_status === 'reimbursed');

    // Cash pending = unattached receipts
    const cashItems = cashPendingReceipts.map(r => ({
        ...r,
        item_type: 'cash_receipt',
        transaction_date: r.receipt_date,
        reimbursement_status: r.reimbursement_status || 'pending'
    }));

    // Calculate totals
    const pendingTotal = pendingItems.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const cashTotal = cashItems.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const submittedTotal = submittedItems.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const reimbursedTotal = reimbursedItems.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);

    // Update column headers
    updateKanbanColumn('pending', pendingItems.length, pendingTotal);
    updateKanbanColumn('cash', cashItems.length, cashTotal);
    updateKanbanColumn('submitted', submittedItems.length, submittedTotal);
    updateKanbanColumn('reimbursed', reimbursedItems.length, reimbursedTotal);

    // Render cards
    renderKanbanCards('pending', pendingItems);
    renderKanbanCards('cash', cashItems);
    renderKanbanCards('submitted', submittedItems);
    renderKanbanCards('reimbursed', reimbursedItems);
}

function updateKanbanColumn(status, count, total) {
    const countEl = document.getElementById(`kanban-count-${status}`);
    const totalEl = document.getElementById(`kanban-total-${status}`);

    if (countEl) countEl.textContent = count;
    if (totalEl) totalEl.textContent = formatCurrency(total);
}

function renderKanbanCards(status, items) {
    const container = document.getElementById(`kanban-cards-${status}`);
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="kanban-empty">
                <div class="kanban-empty-icon">📭</div>
                <div>No items</div>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => createKanbanCard(item)).join('');
}

function createKanbanCard(item) {
    const isCash = item.item_type === 'cash_receipt';
    const amount = Math.abs(parseFloat(item.amount) || 0);
    const date = formatDateShort(item.transaction_date);
    const vendor = item.vendor_name || item.description || 'Unknown';
    const desc = item.description || '';
    const hasReceipt = (item.receipt_count || 0) > 0 || isCash;

    return `
        <div class="kanban-card ${isCash ? 'cash-type' : 'transaction-type'}"
             draggable="true"
             data-id="${item.id}"
             data-type="${item.item_type}"
             data-status="${item.reimbursement_status || 'pending'}"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             onclick="handleKanbanCardClick(${item.id}, '${item.item_type}')">
            <div class="kanban-card-header">
                <div class="kanban-card-amount">$${amount.toFixed(2)}</div>
                <div class="kanban-card-date">${date}</div>
            </div>
            <div class="kanban-card-vendor">${escapeHtml(vendor)}</div>
            ${desc && desc !== vendor ? `<div class="kanban-card-desc">${escapeHtml(desc)}</div>` : ''}
            <div class="kanban-card-footer">
                <span class="kanban-card-type ${isCash ? 'cash' : 'transaction'}">${isCash ? '💵 Cash' : '💳 Card'}</span>
                <span class="kanban-card-receipt ${hasReceipt ? 'has-receipt' : ''}">${hasReceipt ? '📎' : ''}</span>
            </div>
        </div>
    `;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Drag and Drop handlers
let draggedCard = null;

function handleDragStart(event) {
    draggedCard = event.target;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({
        id: event.target.dataset.id,
        type: event.target.dataset.type,
        currentStatus: event.target.dataset.status
    }));
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    draggedCard = null;
    // Remove drag-over from all containers
    document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleDrop(event, newStatus) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    const { id, type, currentStatus } = data;

    // Don't do anything if dropped in same column
    if (currentStatus === newStatus) return;

    // Special handling for cash column - only cash receipts can be in cash column
    if (newStatus === 'cash' && type !== 'cash_receipt') {
        showToast('Only cash receipts can be moved to Cash Pending', 'warning');
        return;
    }

    // Can't move transactions to cash column
    if (newStatus === 'cash') {
        // For cash receipts, set status to pending
        await updateItemStatus(id, type, 'pending');
    } else {
        // For other columns
        let targetStatus = newStatus;
        if (newStatus === 'cash') targetStatus = 'pending';

        await updateItemStatus(id, type, targetStatus);
    }

    // Reload both views' data so switching views shows updated content
    await loadKanbanBoard();
    await loadReimbursementSummary();
    await loadReceipts();
}

async function updateItemStatus(id, type, newStatus) {
    try {
        if (type === 'cash_receipt') {
            // Update cash receipt status
            const response = await fetch(`${API_BASE}/receipts/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bulk_update_status',
                    receipt_ids: [parseInt(id)],
                    reimbursement_status: newStatus
                })
            });
            const result = await response.json();
            if (result.success) {
                showToast('Status updated', 'success');
            }
        } else {
            // Update transaction status
            const response = await fetch(`${API_BASE}/reimbursements/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_status',
                    transaction_id: parseInt(id),
                    status: newStatus
                })
            });
            const result = await response.json();
            if (result.success) {
                showToast('Status updated', 'success');
            }
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Failed to update status', 'error');
    }
}

function handleKanbanCardClick(id, type) {
    if (type === 'cash_receipt') {
        editCashReceiptFromList(id);
    } else {
        viewTransactionDetailModal(id);
    }
}

async function loadReceipts(tabOverride = null) {
    try {
        const tab = tabOverride || currentReceiptsTab;
        const params = new URLSearchParams({
            user_id: state.currentUser
        });

        if (tab === 'cash') {
            // Cash tab: unattached receipts with pending status only
            params.append('unattached', '1');
        }

        // Filter by folder
        if (receiptsState.currentFolderId !== null) {
            params.append('folder_id', receiptsState.currentFolderId === 'unfiled' ? '' : receiptsState.currentFolderId);
        }

        const response = await fetch(`${API_BASE}/receipts/?${params}`);
        const result = await response.json();

        if (result.success) {
            receiptsData = result.data.receipts || [];
            receiptsState.receiptsData = receiptsData;
            renderReceipts();
        }
    } catch (error) {
        console.error('Error loading receipts:', error);
    }
}

async function loadReimbursementSummary() {
    try {
        const response = await fetch(`${API_BASE}/reimbursements/?user_id=${state.currentUser}`);
        const result = await response.json();

        if (result.success) {
            const summary = result.data.summary;
            receiptsState.allReimbursementsData = result.data.transactions || [];
            // Update legacy variable
            allReimbursementsData = receiptsState.allReimbursementsData;

            // Apply filter if set
            if (receiptsState.currentFilter) {
                receiptsState.reimbursementsData = receiptsState.allReimbursementsData.filter(t => t.reimbursement_status === receiptsState.currentFilter);
            } else {
                receiptsState.reimbursementsData = receiptsState.allReimbursementsData;
            }
            // Update legacy variable
            reimbursementsData = receiptsState.reimbursementsData;

            // Calculate pending transactions only (not cash receipts)
            const pendingTransactions = receiptsState.allReimbursementsData.filter(
                t => t.reimbursement_status === 'pending' && t.item_type === 'transaction'
            );
            const pendingTxnTotal = pendingTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
            const pendingTxnCount = pendingTransactions.length;

            // Update summary cards (with null checks)
            const pendingTotal = document.getElementById('reimb-pending-total');
            const pendingCount = document.getElementById('reimb-pending-count');
            const submittedTotal = document.getElementById('reimb-submitted-total');
            const submittedCount = document.getElementById('reimb-submitted-count');
            const reimbursedTotal = document.getElementById('reimb-reimbursed-total');
            const reimbursedCount = document.getElementById('reimb-reimbursed-count');

            // Pending shows only transactions (cash stays in Cash tab)
            if (pendingTotal) pendingTotal.textContent = formatCurrency(pendingTxnTotal);
            if (pendingCount) pendingCount.textContent = `${pendingTxnCount} items`;
            if (submittedTotal) submittedTotal.textContent = formatCurrency(summary.submitted.total);
            if (submittedCount) submittedCount.textContent = `${summary.submitted.count} items`;
            if (reimbursedTotal) reimbursedTotal.textContent = formatCurrency(summary.reimbursed.total);
            if (reimbursedCount) reimbursedCount.textContent = `${summary.reimbursed.count} items`;

            // Update active state on summary cards
            document.querySelectorAll('.receipts-summary-grid .summary-card').forEach(card => {
                card.classList.remove('active');
            });
            if (receiptsState.currentFilter) {
                const activeCard = document.querySelector(`.receipts-summary-grid .summary-card.${receiptsState.currentFilter}`);
                if (activeCard) activeCard.classList.add('active');
            }

            // If on reimbursements tab, re-render
            if (receiptsState.currentTab === 'reimbursements') {
                renderReimbursementsList();
            }
        }
    } catch (error) {
        console.error('Error loading reimbursement summary:', error);
    }
}

// Load pending transactions (transactions with reimbursement_status = 'pending')
async function loadPendingTransactions() {
    try {
        const response = await fetch(`${API_BASE}/reimbursements/?user_id=${state.currentUser}`);
        const result = await response.json();

        if (result.success) {
            // Filter only transactions (not cash receipts) with pending status
            const pendingItems = (result.data.transactions || []).filter(
                t => t.reimbursement_status === 'pending' && t.item_type === 'transaction'
            );
            receiptsState.pendingTransactions = pendingItems;
            renderPendingList();
        }
    } catch (error) {
        console.error('Error loading pending transactions:', error);
    }
}

function renderPendingList() {
    const container = document.getElementById('receipts-grid');
    const pendingItems = receiptsState.pendingTransactions || [];

    if (pendingItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <p>No pending transactions</p>
                <small>Mark transactions as reimbursable from the Transactions page</small>
            </div>
        `;
        return;
    }

    function formatDateTwoLines(dateStr) {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return { main: `${months[date.getMonth()]} ${date.getDate()}`, year: date.getFullYear() };
    }

    container.innerHTML = `
        <div class="table-header-bar">
            <div class="table-header-title">Showing: <span>Pending (${pendingItems.length})</span></div>
        </div>

        <div class="reimb-bulk-actions" id="pending-bulk-actions" style="display: none;">
            <span class="selected-count">0 selected</span>
            <button class="btn btn-primary" onclick="bulkSubmitPending()">Submit</button>
            <button class="btn btn-secondary" onclick="bulkUpdatePendingStatus('none')">Remove</button>
        </div>

        <div class="reimb-header">
            <div class="col reimb-col-check"></div>
            <div class="col reimb-col-date">DATE</div>
            <div class="col reimb-col-desc">DESCRIPTION</div>
            <div class="col reimb-col-note">NOTE</div>
            <div class="col reimb-col-category">CATEGORY</div>
            <div class="col reimb-col-amount">AMOUNT</div>
            <div class="col reimb-col-status">STATUS</div>
        </div>

        ${pendingItems.map(t => {
            const dateFormatted = formatDateTwoLines(t.transaction_date);
            return `
                <div class="reimb-row clickable-row" data-id="${t.id}" data-type="transaction" onclick="handleReimbRowClick(${t.id}, event)">
                    <div class="reimb-col-check" onclick="event.stopPropagation()">
                        <input type="checkbox" class="pending-checkbox" data-id="${t.id}" onchange="updatePendingSelection()">
                    </div>
                    <div class="reimb-col-date">
                        <span class="date-main">${dateFormatted.main}</span>
                        <span class="date-year">${dateFormatted.year}</span>
                    </div>
                    <div class="reimb-col-desc">
                        ${t.description || t.vendor_name || 'Item'}
                        ${t.receipt_count > 0 ? ' 📎' : ''}
                    </div>
                    <div class="reimb-col-note" onclick="event.stopPropagation()">
                        <input type="text" class="reimb-note-input"
                            value="${(t.reimbursement_notes || '').replace(/"/g, '&quot;')}"
                            placeholder="Add note..."
                            onblur="updateReimbursementNote(${t.id}, this.value, 'transaction')">
                    </div>
                    <div class="reimb-col-category">
                        <div class="category-icon">${t.category_icon || '📦'}</div>
                        <span class="category-name">${t.category_name || 'Other'}</span>
                    </div>
                    <div class="reimb-col-amount amount-negative">$${Math.abs(t.amount).toFixed(2)}</div>
                    <div class="reimb-col-status">
                        <div class="status-pending">
                            <div class="status-content">
                                <span class="status-dot"></span>
                                <span class="status-text">Pending</span>
                            </div>
                            <div class="status-underline"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

function updatePendingSelection() {
    const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
    const bulkBar = document.getElementById('pending-bulk-actions');

    if (bulkBar) {
        if (checkboxes.length > 0) {
            bulkBar.style.display = 'flex';
            bulkBar.querySelector('.selected-count').textContent = `${checkboxes.length} selected`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkSubmitPending() {
    const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    if (ids.length === 0) return;

    if (!confirm(`Submit ${ids.length} item(s) for reimbursement?`)) return;

    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_update',
                transaction_ids: ids,
                status: 'submitted'
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`${ids.length} items submitted`, 'success');
            await updateTabCounts();
            switchReceiptsTab('submitted');
        } else {
            showToast(result.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Error submitting:', error);
        showToast('Failed to submit', 'error');
    }
}

async function bulkUpdatePendingStatus(status) {
    const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    if (ids.length === 0) return;

    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_update',
                transaction_ids: ids,
                status: status
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`${ids.length} items updated`, 'success');
            await updateTabCounts();
            await loadPendingTransactions();
        } else {
            showToast(result.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Error updating:', error);
        showToast('Failed to update', 'error');
    }
}

function filterReimbursementsByStatus(status) {
    // Toggle filter - if clicking same status, clear filter
    if (receiptsState.currentFilter === status) {
        receiptsState.currentFilter = null;
        receiptsState.reimbursementsData = receiptsState.allReimbursementsData;
    } else {
        receiptsState.currentFilter = status;
        receiptsState.reimbursementsData = receiptsState.allReimbursementsData.filter(t => t.reimbursement_status === status);
    }
    // Update legacy variables for compatibility
    currentReimbursementFilter = receiptsState.currentFilter;
    reimbursementsData = receiptsState.reimbursementsData;

    // Update active state on summary cards
    document.querySelectorAll('.receipts-summary-grid .summary-card').forEach(card => {
        card.classList.remove('active');
    });
    if (receiptsState.currentFilter) {
        const activeCard = document.querySelector(`.receipts-summary-grid .summary-card.${receiptsState.currentFilter}`);
        if (activeCard) activeCard.classList.add('active');
    }

    // Switch to reimbursements tab and render
    receiptsState.currentTab = 'reimbursements';
    currentReceiptsTab = receiptsState.currentTab;
    document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.receipts-tabs .tab-btn:last-child').classList.add('active');

    renderReimbursementsList();
}

// =====================================================
// Render Functions
// =====================================================

function renderReceipts() {
    const container = document.getElementById('receipts-grid');

    if (currentReceiptsTab === 'reimbursements') {
        renderReimbursementsList();
        return;
    }

    // Update bulk action bar visibility
    updateReceiptBulkActions();

    if (receiptsData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>No receipts yet</p>
                <button class="btn btn-primary" onclick="openUploadReceiptModal()">Upload your first receipt</button>
            </div>
        `;
        return;
    }

    container.innerHTML = receiptsData.map(receipt => {
        const isPdf = receipt.file_type === 'application/pdf';
        const imageUrl = isPdf ? '' : `${window.location.origin}/ExpensesTracker/${receipt.file_path}`;
        const isSelected = receiptsState.selectedReceipts.has(receipt.id);

        return `
            <div class="receipt-card ${isSelected ? 'selected' : ''}"
                 onclick="viewReceipt(${receipt.id})"
                 data-id="${receipt.id}">
                <div class="receipt-checkbox" onclick="event.stopPropagation(); toggleReceiptSelection(${receipt.id})">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="receipt-card-image ${isPdf ? 'pdf' : ''}">
                    ${isPdf
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="8" y="18" font-size="6" fill="currentColor">PDF</text></svg>'
                : `<img src="${imageUrl}" alt="Receipt">`
            }
                </div>
                <div class="receipt-card-body">
                    <div class="receipt-card-vendor">${receipt.vendor_name || 'Unknown Vendor'}</div>
                    <div class="receipt-card-amount">${receipt.amount ? formatCurrency(receipt.amount) : '-'}</div>
                    <div class="receipt-card-date">${receipt.receipt_date ? formatDate(receipt.receipt_date) : 'No date'}</div>
                    <span class="receipt-card-status ${receipt.transaction_id ? 'linked' : 'unlinked'}">
                        ${receipt.transaction_id ? 'Linked' : 'Unlinked'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function renderReimbursementsList() {
    const container = document.getElementById('receipts-grid');

    // Always use the state object to get current data
    const currentReimbursements = receiptsState.reimbursementsData;

    if (currentReimbursements.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                <p>No reimbursement requests</p>
                <small>Mark transactions as reimbursable from the Transactions page</small>
            </div>
        `;
        return;
    }

    const currentFilter = receiptsState.currentFilter;
    const filterLabel = currentFilter
        ? `${capitalizeFirst(currentFilter)} (${currentReimbursements.length})`
        : `All Reimbursements (${currentReimbursements.length})`;

    // Helper function to get category icon
    function getCategoryIcon(categoryName) {
        const icons = {
            'food': '🍔',
            'family meal': '🍔',
            'coffee': '☕',
            'shopping': '🛒',
            'transport': '🚗',
            'entertainment': '🎬',
            'utilities': '💡',
            'healthcare': '🏥',
            'education': '📚',
            'travel': '✈️'
        };
        const key = (categoryName || '').toLowerCase();
        return icons[key] || '📦';
    }

    // Helper function to get category class
    function getCategoryClass(categoryName) {
        const key = (categoryName || '').toLowerCase().replace(/\s+/g, '-');
        return key || 'other';
    }

    // Helper function to format date in 2 lines
    function formatDateTwoLines(dateStr) {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        return {
            main: `${month} ${day}`,
            year: year
        };
    }

    container.innerHTML = `
        <!-- Table Header Bar -->
        <div class="table-header-bar">
            <div class="table-header-title">
                Showing: <span>${filterLabel}</span>
            </div>
            ${currentFilter ? `<a href="#" class="show-all-link" onclick="clearReimbursementFilter(); return false;">Show All →</a>` : ''}
        </div>

        <!-- Table Header -->
        <div class="reimb-header no-checkbox">
            <div class="col reimb-col-date">DATE</div>
            <div class="col reimb-col-desc">DESCRIPTION</div>
            <div class="col reimb-col-note">NOTE</div>
            <div class="col reimb-col-category">CATEGORY</div>
            <div class="col reimb-col-amount">AMOUNT</div>
            <div class="col reimb-col-status">STATUS</div>
        </div>

        <!-- Table Body -->
        ${currentReimbursements.map(t => {
        const dateFormatted = formatDateTwoLines(t.transaction_date);
        const categoryIcon = getCategoryIcon(t.category_name);
        const categoryClass = getCategoryClass(t.category_name);
        const statusClass = `status-${t.reimbursement_status || 'none'}`;
        const isCash = t.item_type === 'cash_receipt';
        const clickHandler = isCash ? `editCashReceiptFromList(${t.id})` : `handleReimbRowClick(${t.id}, event)`;
        const dataType = isCash ? 'cash' : 'transaction';

        return `
                <div class="reimb-row clickable-row no-checkbox" data-id="${t.id}" data-type="${dataType}" onclick="${clickHandler}">
                    <!-- Date (2 lines) -->
                    <div class="reimb-col-date">
                        <span class="date-main">${dateFormatted.main}</span>
                        <span class="date-year">${dateFormatted.year}</span>
                    </div>

                    <!-- Description -->
                    <div class="reimb-col-desc">
                        ${t.description || t.vendor_name || 'Item'}
                        ${isCash ? ' <span style="color: #10b981; font-size: 11px;">(Cash)</span>' : ''}
                        ${t.receipt_count > 0 ? ` 📎` : ''}
                    </div>

                    <!-- Note -->
                    <div class="reimb-col-note" onclick="event.stopPropagation()">
                        <input type="text"
                            class="reimb-note-input"
                            value="${(t.reimbursement_notes || '').replace(/"/g, '&quot;')}"
                            placeholder="Add note..."
                            onblur="updateReimbursementNote(${t.id}, this.value, '${dataType}')">
                    </div>

                    <!-- Category (Icon + Text) -->
                    <div class="reimb-col-category">
                        <div class="category-icon ${categoryClass}">${categoryIcon}</div>
                        <span class="category-name">${t.category_name || 'Other'}</span>
                    </div>

                    <!-- Amount -->
                    <div class="reimb-col-amount amount-negative">
                        $${Math.abs(t.amount).toFixed(2)}
                    </div>

                    <!-- Status (Dot + Underline) -->
                    <div class="reimb-col-status">
                        <div class="${statusClass}">
                            <div class="status-content">
                                <span class="status-dot"></span>
                                <span class="status-text">${capitalizeFirst(t.reimbursement_status || 'none')}</span>
                            </div>
                            <div class="status-underline"></div>
                        </div>
                    </div>
                </div>
            `;
    }).join('')}
    `;
}

function renderSubmittedList() {
    const container = document.getElementById('receipts-grid');
    const currentReimbursements = receiptsState.reimbursementsData;

    if (currentReimbursements.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                <p>No submitted requests</p>
                <small>Submit reimbursement requests from the Pending or Cash tabs</small>
            </div>
        `;
        return;
    }

    const filterLabel = `Submitted (${currentReimbursements.length})`;

    function formatDateTwoLines(dateStr) {
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return { main: `${months[date.getMonth()]} ${date.getDate()}`, year: date.getFullYear() };
    }

    container.innerHTML = `
        <div class="table-header-bar">
            <div class="table-header-title">Showing: <span>${filterLabel}</span></div>
        </div>

        <div class="reimb-bulk-actions" id="reimb-bulk-actions" style="display: none;">
            <span class="selected-count">0 selected</span>
            <button class="btn btn-purple" onclick="confirmMarkReimbursed()">Mark Reimbursed</button>
            <button class="btn btn-secondary" onclick="bulkUpdateReimbursement('none')">Remove</button>
        </div>

        <div class="reimb-header">
            <div class="col reimb-col-check"></div>
            <div class="col reimb-col-date">DATE</div>
            <div class="col reimb-col-desc">DESCRIPTION</div>
            <div class="col reimb-col-note">NOTE</div>
            <div class="col reimb-col-category">CATEGORY</div>
            <div class="col reimb-col-amount">AMOUNT</div>
            <div class="col reimb-col-status">STATUS</div>
        </div>

        ${currentReimbursements.map(t => {
            const dateFormatted = formatDateTwoLines(t.transaction_date);
            const statusClass = `status-${t.reimbursement_status || 'none'}`;
            const isCash = t.item_type === 'cash_receipt';
            const clickHandler = isCash ? `editCashReceiptFromList(${t.id})` : `handleReimbRowClick(${t.id}, event)`;
            const dataType = isCash ? 'cash' : 'transaction';

            return `
                <div class="reimb-row clickable-row" data-id="${t.id}" data-type="${dataType}" onclick="${clickHandler}">
                    <div class="reimb-col-check" onclick="event.stopPropagation()">
                        <input type="checkbox" class="reimb-checkbox" data-id="${t.id}" data-type="${dataType}" onchange="updateReimbursementSelection()">
                    </div>
                    <div class="reimb-col-date">
                        <span class="date-main">${dateFormatted.main}</span>
                        <span class="date-year">${dateFormatted.year}</span>
                    </div>
                    <div class="reimb-col-desc">
                        ${t.description || t.vendor_name || 'Item'}
                        ${isCash ? ' <span style="color: #10b981; font-size: 11px;">(Cash)</span>' : ''}
                        ${t.receipt_count > 0 ? ' 📎' : ''}
                    </div>
                    <div class="reimb-col-note" onclick="event.stopPropagation()">
                        <input type="text" class="reimb-note-input"
                            value="${(t.reimbursement_notes || '').replace(/"/g, '&quot;')}"
                            placeholder="Add note..."
                            onblur="updateReimbursementNote(${t.id}, this.value, '${dataType}')">
                    </div>
                    <div class="reimb-col-category">
                        <div class="category-icon">${t.category_icon || '📦'}</div>
                        <span class="category-name">${t.category_name || 'Other'}</span>
                    </div>
                    <div class="reimb-col-amount amount-negative">$${Math.abs(t.amount).toFixed(2)}</div>
                    <div class="reimb-col-status">
                        <div class="${statusClass}">
                            <div class="status-content">
                                <span class="status-dot"></span>
                                <span class="status-text">${capitalizeFirst(t.reimbursement_status || 'none')}</span>
                            </div>
                            <div class="status-underline"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

// =====================================================
// Helper Functions
// =====================================================

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Row click handler - opens transaction details
function handleReimbRowClick(transactionId, event) {
    // Don't trigger if clicking on checkbox or note input
    if (event.target.closest('.reimb-col-check') || event.target.closest('.reimb-note-input')) {
        return;
    }
    viewTransactionDetailModal(transactionId);
}

// Edit Cash receipt from Requested/Reimbursements list
async function editCashReceiptFromList(receiptId) {
    try {
        // Fetch receipt data
        const response = await fetch(`${API_BASE}/receipts/?user_id=${state.currentUser}`);
        const result = await response.json();

        if (result.success) {
            const receipt = (result.data?.receipts || []).find(r => r.id === receiptId);
            if (receipt) {
                // Store in receiptsData for editReceipt function
                receiptsData = result.data.receipts;
                currentReceiptId = receiptId;
                receiptsState.currentReceiptId = receiptId;
                editReceipt();
            } else {
                showToast('Receipt not found', 'error');
            }
        }
    } catch (error) {
        console.error('Error loading receipt:', error);
        showToast('Failed to load receipt', 'error');
    }
}

// Confirm mark as reimbursed with dialog
async function confirmMarkReimbursed() {
    const checkboxes = document.querySelectorAll('.reimb-checkbox:checked');
    const transactionIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    if (transactionIds.length === 0) {
        showToast('No items selected', 'warning');
        return;
    }

    const confirmMsg = `Mark ${transactionIds.length} item(s) as reimbursed?\n\nReceipts will be moved to the Reimbursed folder.`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_update',
                transaction_ids: transactionIds,
                status: 'reimbursed'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`${transactionIds.length} item(s) marked as reimbursed`, 'success');

            // Reload data
            await loadReimbursementSummary();
            updateTabCounts();

            // Switch to Reimbursements tab
            switchReceiptsTab('reimbursements');
        } else {
            showToast(data.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Error marking reimbursed:', error);
        showToast('Failed to update', 'error');
    }
}

function clearReimbursementFilter() {
    receiptsState.currentFilter = null;
    receiptsState.reimbursementsData = receiptsState.allReimbursementsData;
    // Update legacy variables
    currentReimbursementFilter = null;
    reimbursementsData = receiptsState.reimbursementsData;

    // Remove active state from summary cards
    document.querySelectorAll('.receipts-summary-grid .summary-card').forEach(card => {
        card.classList.remove('active');
    });

    renderReimbursementsList();
}

// =====================================================
// Multi-Select Functions
// =====================================================

function toggleReceiptSelectionMode() {
    receiptsState.isSelectionMode = !receiptsState.isSelectionMode;
    if (!receiptsState.isSelectionMode) {
        clearReceiptSelection();
    }

    // Update select button text
    const selectBtn = document.getElementById('receipt-select-btn');
    if (selectBtn) {
        selectBtn.textContent = receiptsState.isSelectionMode ? 'Cancel' : 'Select';
        selectBtn.classList.toggle('active', receiptsState.isSelectionMode);
    }

    renderReceipts();
}

function toggleReceiptSelection(receiptId) {
    if (receiptsState.selectedReceipts.has(receiptId)) {
        receiptsState.selectedReceipts.delete(receiptId);
    } else {
        receiptsState.selectedReceipts.add(receiptId);
    }
    updateReceiptBulkActions();
    renderReceipts();
}

function selectAllReceipts() {
    receiptsData.forEach(r => receiptsState.selectedReceipts.add(r.id));
    updateReceiptBulkActions();
    renderReceipts();
}

function clearReceiptSelection() {
    receiptsState.selectedReceipts.clear();
    updateReceiptBulkActions();
}

function updateReceiptBulkActions() {
    const bar = document.getElementById('receipt-bulk-actions');
    if (!bar) return;

    const count = receiptsState.selectedReceipts.size;

    if (count > 0) {
        bar.style.display = 'flex';
        bar.querySelector('.selected-count').textContent = `${count} selected`;
    } else {
        bar.style.display = 'none';
    }
}

// =====================================================
// Bulk Actions
// =====================================================

async function bulkDeleteReceipts() {
    const ids = Array.from(receiptsState.selectedReceipts);
    if (ids.length === 0) return;

    if (!confirm(`Delete ${ids.length} receipt(s)? This cannot be undone.`)) return;

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_delete',
                receipt_ids: ids,
                user_id: state.currentUser
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`${result.data.deleted_count} receipt(s) deleted`, 'success');
            clearReceiptSelection();
            receiptsState.isSelectionMode = false;
            loadReceipts();
            loadFolders();
        } else {
            showToast(result.message || 'Delete failed', 'error');
        }
    } catch (error) {
        console.error('Bulk delete error:', error);
        showToast('Delete failed', 'error');
    }
}

async function moveReceiptsToFolder(folderId) {
    const ids = Array.from(receiptsState.selectedReceipts);
    if (ids.length === 0) return;

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'move_to_folder',
                receipt_ids: ids,
                folder_id: folderId,
                user_id: state.currentUser
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`${result.data.moved_count} receipt(s) moved`, 'success');
            closeModal();
            clearReceiptSelection();
            receiptsState.isSelectionMode = false;
            loadReceipts();
            loadFolders();
        } else {
            showToast(result.message || 'Move failed', 'error');
        }
    } catch (error) {
        console.error('Move error:', error);
        showToast('Move failed', 'error');
    }
}

function openMoveFolderModal() {
    const folders = receiptsState.folders;
    const count = receiptsState.selectedReceipts.size;

    openModal('Move to Folder', `
        <p style="margin-bottom: 16px;">Move ${count} receipt(s) to:</p>
        <div class="folder-list-modal">
            <div class="folder-option" onclick="moveReceiptsToFolder(null)">
                <span class="folder-icon">📁</span>
                <span>Unfiled</span>
            </div>
            ${folders.map(f => `
                <div class="folder-option" onclick="moveReceiptsToFolder(${f.id})">
                    <span class="folder-icon">${f.icon || '📁'}</span>
                    <span>${escapeHtml(f.name)}</span>
                    <span class="folder-count">${f.receipt_count || 0}</span>
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <button class="btn btn-outline" onclick="openCreateFolderModal()" style="width: 100%;">
                + Create New Folder
            </button>
        </div>
    `);
}

// =====================================================
// Folder Functions
// =====================================================

async function loadFolders() {
    // This function now updates tab counts instead of rendering sidebar
    await updateTabCounts();
}

async function updateTabCounts() {
    try {
        // Load receipt counts and reimbursement summary
        const [receiptsResponse, unattachedResponse, reimbResponse] = await Promise.all([
            fetch(`${API_BASE}/receipts/?user_id=${state.currentUser}`),
            fetch(`${API_BASE}/receipts/?user_id=${state.currentUser}&unattached=1`),
            fetch(`${API_BASE}/reimbursements/?user_id=${state.currentUser}`)
        ]);

        const receiptsResult = await receiptsResponse.json();
        const unattachedResult = await unattachedResponse.json();
        const reimbResult = await reimbResponse.json();

        // Get counts
        const allReceiptsCount = receiptsResult.success ? (receiptsResult.data?.receipts?.length || 0) : 0;
        const unattachedCount = unattachedResult.success ? (unattachedResult.data?.receipts?.length || 0) : 0;
        const unattachedReceipts = unattachedResult.success ? (unattachedResult.data?.receipts || []) : [];

        // Calculate cash total
        const cashTotal = unattachedReceipts.reduce((sum, r) => sum + Math.abs(parseFloat(r.amount) || 0), 0);

        const reimbSummary = reimbResult.success ? reimbResult.data.summary : {};
        const allReimbData = reimbResult.success ? (reimbResult.data.transactions || []) : [];

        // Count pending transactions (not cash)
        const pendingCount = allReimbData.filter(
            t => t.reimbursement_status === 'pending' && t.item_type === 'transaction'
        ).length;

        // Submitted count (both transactions and cash)
        const submittedCount = reimbSummary.submitted?.count || 0;

        // Reimbursed count
        const reimbursedCount = reimbSummary.reimbursed?.count || 0;

        // Update tab counts
        const allCountEl = document.getElementById('tab-count-all');
        const pendingCountEl = document.getElementById('tab-count-pending');
        const cashCountEl = document.getElementById('tab-count-cash');
        const submittedCountEl = document.getElementById('tab-count-submitted');
        const reimbursementsCountEl = document.getElementById('tab-count-reimbursements');

        if (allCountEl) allCountEl.textContent = allReceiptsCount;
        if (pendingCountEl) pendingCountEl.textContent = pendingCount;
        if (cashCountEl) cashCountEl.textContent = unattachedCount;
        if (submittedCountEl) submittedCountEl.textContent = submittedCount;
        if (reimbursementsCountEl) reimbursementsCountEl.textContent = reimbursedCount;

        // Update Cash summary card
        const cashTotalEl = document.getElementById('reimb-cash-total');
        const cashCountSummaryEl = document.getElementById('reimb-cash-count');
        if (cashTotalEl) cashTotalEl.textContent = formatCurrency(cashTotal);
        if (cashCountSummaryEl) cashCountSummaryEl.textContent = `${unattachedCount} items`;

    } catch (error) {
        console.error('Error updating tab counts:', error);
    }
}

function filterByFolder(folderId) {
    receiptsState.currentFolderId = folderId;
    clearReceiptSelection();

    // Handle special reimbursement-based folders
    if (folderId === 'reimbursed') {
        // Switch to Reimbursements tab and filter by reimbursed status
        receiptsState.currentTab = 'reimbursements';
        currentReceiptsTab = 'reimbursements';

        // Update tabs UI
        document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => {
            if (btn.textContent === 'Reimbursements') btn.classList.add('active');
        });

        filterReimbursementsByStatus('reimbursed');
    } else if (folderId === 'submitted') {
        // Switch to Submitted tab
        receiptsState.currentTab = 'submitted';
        currentReceiptsTab = 'submitted';

        receiptsState.reimbursementsData = receiptsState.allReimbursementsData.filter(
            t => t.reimbursement_status === 'submitted'
        );
        reimbursementsData = receiptsState.reimbursementsData;

        // Update tabs UI
        document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => {
            if (btn.textContent.includes('Submitted')) btn.classList.add('active');
        });

        renderSubmittedList();
    } else {
        loadReceipts();
    }

    // Update active state in sidebar
    document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('active');
    });
    if (folderId === null) {
        document.querySelector('.folder-item:first-child')?.classList.add('active');
    } else {
        document.querySelector(`.folder-item[data-id="${folderId}"]`)?.classList.add('active');
    }
}

function openCreateFolderModal() {
    closeModal();
    openModal('Create Folder', `
        <form onsubmit="createFolder(event)">
            <div class="form-group">
                <label>Folder Name</label>
                <input type="text" class="form-control" id="new-folder-name" placeholder="e.g., Tax 2024, Work Expenses" required>
            </div>
            <div class="form-group">
                <label>Icon (emoji)</label>
                <input type="text" class="form-control" id="new-folder-icon" placeholder="📁" maxlength="4" style="width: 80px;">
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" id="new-folder-color" value="#3b82f6">
            </div>
            <div class="form-actions" style="margin-top: 20px;">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Create Folder</button>
            </div>
        </form>
    `);
}

async function createFolder(event) {
    event.preventDefault();

    const name = document.getElementById('new-folder-name').value.trim();
    const icon = document.getElementById('new-folder-icon').value.trim() || '📁';
    const color = document.getElementById('new-folder-color').value;

    if (!name) {
        showToast('Folder name is required', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/receipt-folders/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser,
                name: name,
                icon: icon,
                color: color,
                folder_type: 'custom'
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Folder created', 'success');
            closeModal();
            loadFolders();
        } else {
            showToast(result.message || 'Failed to create folder', 'error');
        }
    } catch (error) {
        console.error('Create folder error:', error);
        showToast('Failed to create folder', 'error');
    }
}

async function deleteFolder(folderId, folderName) {
    if (!confirm(`Delete folder "${folderName}"? Receipts will be moved to Unfiled.`)) return;

    try {
        const response = await fetch(`${API_BASE}/receipt-folders/?id=${folderId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast('Folder deleted', 'success');
            if (receiptsState.currentFolderId == folderId) {
                receiptsState.currentFolderId = null;
            }
            loadFolders();
            loadReceipts();
        } else {
            showToast(result.message || 'Failed to delete folder', 'error');
        }
    } catch (error) {
        console.error('Delete folder error:', error);
        showToast('Failed to delete folder', 'error');
    }
}

function updateReimbursementSelection() {
    const checkboxes = document.querySelectorAll('.reimb-checkbox:checked');
    const bulkActions = document.getElementById('reimb-bulk-actions');
    const selectedCount = bulkActions.querySelector('.selected-count');

    if (checkboxes.length > 0) {
        bulkActions.style.display = 'flex';
        selectedCount.textContent = `${checkboxes.length} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

async function bulkUpdateReimbursement(status) {
    const checkboxes = document.querySelectorAll('.reimb-checkbox:checked');

    // Separate transaction IDs and cash receipt IDs
    const transactionIds = [];
    const cashReceiptIds = [];

    checkboxes.forEach(cb => {
        const id = parseInt(cb.dataset.id);
        const type = cb.dataset.type;
        if (type === 'cash') {
            cashReceiptIds.push(id);
        } else {
            transactionIds.push(id);
        }
    });

    if (transactionIds.length === 0 && cashReceiptIds.length === 0) {
        showToast('No items selected', 'warning');
        return;
    }

    try {
        const promises = [];

        // Update transactions
        if (transactionIds.length > 0) {
            promises.push(fetch(`${API_BASE}/reimbursements/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bulk_update',
                    transaction_ids: transactionIds,
                    status: status
                })
            }));
        }

        // Update cash receipts
        if (cashReceiptIds.length > 0) {
            promises.push(fetch(`${API_BASE}/receipts/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bulk_update_status',
                    receipt_ids: cashReceiptIds,
                    reimbursement_status: status
                })
            }));
        }

        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));

        const allSuccess = results.every(r => r.success);
        const totalUpdated = transactionIds.length + cashReceiptIds.length;

        if (allSuccess) {
            showToast(`${totalUpdated} item(s) updated`, 'success');

            // Reload fresh data from server
            await loadReimbursementSummary();
            loadReceipts();  // Also reload receipts for Cash tab

            // Update tab counts
            updateTabCounts();

            // Re-render current tab with fresh data
            const currentTab = receiptsState.currentTab;
            if (currentTab === 'submitted') {
                receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
                    t => t.reimbursement_status === 'submitted'
                );
                renderSubmittedList();
            } else if (currentTab === 'reimbursements') {
                receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
                    t => t.reimbursement_status === 'reimbursed'
                );
                renderReimbursementsList();
            }

            // Hide bulk actions bar since nothing is selected now
            const bulkActionsBar = document.getElementById('reimb-bulk-actions');
            if (bulkActionsBar) {
                bulkActionsBar.style.display = 'none';
            }
        } else {
            showToast('Some updates failed', 'error');
        }
    } catch (error) {
        console.error('Bulk update error:', error);
        showToast('Failed to update items', 'error');
    }
}

async function switchReceiptsTab(tab) {
    currentReceiptsTab = tab;
    receiptsState.currentTab = tab;

    // Clear reimbursement filter when switching tabs
    if (tab !== 'reimbursements' && tab !== 'submitted') {
        currentReimbursementFilter = null;
        receiptsState.currentFilter = null;
        reimbursementsData = receiptsState.allReimbursementsData || [];
        receiptsState.reimbursementsData = reimbursementsData;
        document.querySelectorAll('.receipts-summary-grid .summary-card').forEach(card => {
            card.classList.remove('active');
        });
    }

    // Update tab buttons - find the correct button by tab name
    document.querySelectorAll('.receipts-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Find button that matches this tab
    const tabMap = { 'all': 0, 'pending': 1, 'cash': 2, 'submitted': 3, 'reimbursements': 4 };
    const tabIndex = tabMap[tab];
    const buttons = document.querySelectorAll('.receipts-tabs .tab-btn');
    if (buttons[tabIndex]) {
        buttons[tabIndex].classList.add('active');
    }

    if (tab === 'reimbursements') {
        // Load fresh data if needed
        if (!receiptsState.allReimbursementsData || receiptsState.allReimbursementsData.length === 0) {
            await loadReimbursementSummary();
        }
        // Show only reimbursed items
        receiptsState.currentFilter = 'reimbursed';
        receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
            t => t.reimbursement_status === 'reimbursed'
        );
        reimbursementsData = receiptsState.reimbursementsData;
        renderReimbursementsList();
    } else if (tab === 'submitted') {
        // Load fresh data if needed
        if (!receiptsState.allReimbursementsData || receiptsState.allReimbursementsData.length === 0) {
            await loadReimbursementSummary();
        }
        // Show only submitted items (both transaction and cash)
        receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
            t => t.reimbursement_status === 'submitted'
        );
        reimbursementsData = receiptsState.reimbursementsData;
        renderSubmittedList();
    } else if (tab === 'pending') {
        // Show transactions with pending reimbursement status
        await loadPendingTransactions();
    } else if (tab === 'cash') {
        // Show unattached receipts with pending status
        loadReceipts('cash');
    } else {
        loadReceipts();
    }
}

// =====================================================
// Upload Modal Functions
// =====================================================

function openUploadReceiptModal() {
    document.getElementById('receipt-upload-modal').classList.add('active');
    document.getElementById('receipt-date').value = new Date().toISOString().split('T')[0];

    // Load recent transactions for linking
    loadRecentTransactionsForReceipt();
}

function closeReceiptUploadModal() {
    document.getElementById('receipt-upload-modal').classList.remove('active');
    document.getElementById('receipt-upload-form').reset();
    clearReceiptPreview();

    // Reset Cash checkbox and related UI
    const cashCheckbox = document.getElementById('receipt-cash');
    const reimbGroup = document.getElementById('cash-reimbursement-group');
    const transactionSelect = document.getElementById('receipt-transaction');

    if (cashCheckbox) cashCheckbox.checked = false;
    if (reimbGroup) reimbGroup.style.display = 'none';
    if (transactionSelect) transactionSelect.disabled = false;
}

async function loadRecentTransactionsForReceipt() {
    try {
        const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&limit=50`);
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('receipt-transaction');
            select.innerHTML = '<option value="">-- Select Transaction (Optional) --</option>';

            result.data.transactions.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = `${formatDate(t.transaction_date)} - ${t.description || t.vendor_name} (${formatCurrency(t.amount)})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show preview for images
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('receipt-preview-img').src = e.target.result;
            document.getElementById('receipt-preview').style.display = 'block';
            document.getElementById('receipt-dropzone').style.display = 'none';
        };
        reader.readAsDataURL(file);
    } else {
        // PDF - show placeholder
        document.getElementById('receipt-preview').innerHTML = `
            <div style="padding: 20px; background: #fee2e2; border-radius: 8px; margin-bottom: 12px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p style="margin: 8px 0 0; color: #dc2626; font-weight: 500;">${file.name}</p>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="clearReceiptPreview()">Remove</button>
        `;
        document.getElementById('receipt-preview').style.display = 'block';
        document.getElementById('receipt-dropzone').style.display = 'none';
    }
}

function clearReceiptPreview() {
    document.getElementById('receipt-file').value = '';
    document.getElementById('receipt-preview').style.display = 'none';
    document.getElementById('receipt-dropzone').style.display = 'block';
    document.getElementById('receipt-preview').innerHTML = `
        <img id="receipt-preview-img" src="" alt="Preview">
        <button type="button" class="btn btn-sm btn-secondary" onclick="clearReceiptPreview()">Remove</button>
    `;
}

async function handleReceiptUpload(event) {
    event.preventDefault();

    const fileInput = document.getElementById('receipt-file');
    const isCash = document.getElementById('receipt-cash').checked;
    const transactionId = document.getElementById('receipt-transaction').value;
    const vendor = document.getElementById('receipt-vendor').value.trim();
    const amount = document.getElementById('receipt-amount').value;
    const receiptDate = document.getElementById('receipt-date').value;

    // Validation: File is always required
    if (!fileInput.files.length) {
        showToast('Please select a file', 'error');
        return;
    }

    // Validation: Vendor, Amount, Date are always required
    if (!vendor) {
        showToast('Please enter vendor/store name', 'error');
        return;
    }
    if (!amount) {
        showToast('Please enter amount', 'error');
        return;
    }
    if (!receiptDate) {
        showToast('Please select receipt date', 'error');
        return;
    }

    // Validation: Transaction is required UNLESS Cash is checked
    if (!isCash && !transactionId) {
        showToast('Please link to a transaction or check "Cash" option', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('receipt', fileInput.files[0]);
    formData.append('user_id', state.currentUser);
    formData.append('vendor_name', vendor);
    formData.append('amount', amount);
    formData.append('receipt_date', receiptDate);
    formData.append('description', document.getElementById('receipt-description').value);

    // If Cash checkbox is checked, save reimbursement status directly to receipt
    if (isCash) {
        const reimbStatus = document.getElementById('receipt-reimbursement-status').value;
        formData.append('reimbursement_status', reimbStatus);
    } else {
        // Link to transaction
        formData.append('transaction_id', transactionId);
    }

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt uploaded successfully', 'success');
            closeReceiptUploadModal();
            loadReceipts();
            updateTabCounts();
        } else {
            showToast(result.message || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed', 'error');
    }
}

// Toggle Cash reimbursement options
function toggleCashReimbursement() {
    const isCash = document.getElementById('receipt-cash').checked;
    const reimbGroup = document.getElementById('cash-reimbursement-group');
    const transactionSelect = document.getElementById('receipt-transaction');

    if (isCash) {
        reimbGroup.style.display = 'block';
        transactionSelect.disabled = true;
        transactionSelect.value = '';
    } else {
        reimbGroup.style.display = 'none';
        transactionSelect.disabled = false;
    }
}

// =====================================================
// View Receipt Functions
// =====================================================

function viewReceipt(receiptId) {
    const receipt = receiptsData.find(r => r.id === receiptId);
    if (!receipt) return;

    currentReceiptId = receiptId;
    receiptsState.currentReceiptId = receiptId;

    const isPdf = receipt.file_type === 'application/pdf';
    const imageUrl = `${window.location.origin}/ExpensesTracker/${receipt.file_path}`;

    if (isPdf) {
        document.getElementById('receipt-view-img').style.display = 'none';
        document.querySelector('.receipt-image-container').innerHTML = `
            <div style="text-align: center;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p style="margin-top: 12px; color: #6b7280;">PDF Document</p>
                <a href="${imageUrl}" target="_blank" class="btn btn-primary" style="margin-top: 12px;">Open PDF</a>
            </div>
        `;
    } else {
        document.querySelector('.receipt-image-container').innerHTML = `<img id="receipt-view-img" src="${imageUrl}" alt="Receipt">`;
    }

    document.getElementById('receipt-view-vendor').textContent = receipt.vendor_name || '-';
    document.getElementById('receipt-view-amount').textContent = receipt.amount ? formatCurrency(receipt.amount) : '-';
    document.getElementById('receipt-view-date').textContent = receipt.receipt_date ? formatDate(receipt.receipt_date) : '-';
    document.getElementById('receipt-view-description').textContent = receipt.description || '-';
    document.getElementById('receipt-view-transaction').textContent = receipt.transaction_description
        ? `${receipt.transaction_description} (${formatCurrency(receipt.transaction_amount)})`
        : 'Not linked';

    // Show/hide link row based on whether already linked
    const linkRow = document.getElementById('receipt-link-row');
    if (receipt.transaction_id) {
        linkRow.style.display = 'none';
    } else {
        linkRow.style.display = 'flex';
        // Load transactions for linking
        loadTransactionsForLinking();
    }

    document.getElementById('receipt-view-modal').classList.add('active');
}

async function loadTransactionsForLinking() {
    try {
        const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&limit=100`);
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('receipt-link-select');
            select.innerHTML = '<option value="">-- Select Transaction --</option>';

            result.data.transactions.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = `${formatDate(t.transaction_date)} - ${t.description || t.vendor_name} (${formatCurrency(t.amount)})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function closeReceiptViewModal() {
    document.getElementById('receipt-view-modal').classList.remove('active');
    currentReceiptId = null;
    receiptsState.currentReceiptId = null;
}

function downloadReceipt() {
    const receipt = receiptsData.find(r => r.id === currentReceiptId);
    if (!receipt) return;

    const url = `${window.location.origin}/ExpensesTracker/${receipt.file_path}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = receipt.original_name;
    a.click();
}

async function deleteReceipt() {
    if (!confirm('Delete this receipt?')) return;

    try {
        const response = await fetch(`${API_BASE}/receipts/?id=${currentReceiptId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt deleted', 'success');
            closeReceiptViewModal();
            loadReceipts();
        } else {
            showToast(result.message || 'Delete failed', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed', 'error');
    }
}

// =====================================================
// Edit Receipt Functions
// =====================================================

function editReceipt() {
    const receipt = receiptsData.find(r => r.id === currentReceiptId);
    if (!receipt) return;

    closeReceiptViewModal();

    // Get current reimbursement status
    const currentStatus = receipt.reimbursement_status || 'none';

    openModal('Edit Receipt', `
        <form id="edit-receipt-form" onsubmit="saveReceiptEdit(event, ${receipt.id}, ${receipt.transaction_id || 'null'})">
            <div class="form-group">
                <label>Vendor / Store</label>
                <input type="text" class="form-control" id="edit-receipt-vendor" value="${escapeHtml(receipt.vendor_name || '')}" placeholder="e.g., Amazon, Costco">
            </div>
            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" step="0.01" class="form-control" id="edit-receipt-amount" value="${receipt.amount || ''}" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Receipt Date</label>
                    <input type="date" class="form-control" id="edit-receipt-date" value="${receipt.receipt_date && receipt.receipt_date !== '0000-00-00' ? receipt.receipt_date : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Description / Notes</label>
                <textarea class="form-control" id="edit-receipt-description" rows="2" placeholder="What was this purchase for?">${escapeHtml(receipt.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Reimbursement Status ${!receipt.transaction_id ? '<span style="font-size: 11px; color: #6b7280; font-weight: normal;">(Cash)</span>' : ''}</label>
                <select class="form-control" id="edit-receipt-status">
                    <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>None</option>
                    <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="submitted" ${currentStatus === 'submitted' ? 'selected' : ''}>Submitted</option>
                    <option value="reimbursed" ${currentStatus === 'reimbursed' ? 'selected' : ''}>Reimbursed</option>
                </select>
            </div>
            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" style="flex: 1;">Save Changes</button>
            </div>
        </form>
    `);
}

async function saveReceiptEdit(event, receiptId, transactionId) {
    event.preventDefault();

    const statusSelect = document.getElementById('edit-receipt-status');
    const newStatus = statusSelect ? statusSelect.value : 'none';

    const data = {
        action: 'update',
        receipt_id: receiptId,
        vendor_name: document.getElementById('edit-receipt-vendor').value,
        amount: document.getElementById('edit-receipt-amount').value,
        receipt_date: document.getElementById('edit-receipt-date').value,
        description: document.getElementById('edit-receipt-description').value,
        reimbursement_status: newStatus  // Save status for Cash receipts
    };

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // If linked to transaction, also update transaction status
            if (transactionId && statusSelect) {
                await updateTransactionReimbursementStatus(transactionId, newStatus);
            }

            showToast('Receipt updated', 'success');
            closeModal();
            loadReceipts();
            updateTabCounts();

            // Refresh reimbursements data and re-render current tab
            await loadReimbursementSummary();

            const currentTab = receiptsState.currentTab;
            if (currentTab === 'submitted') {
                receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
                    t => t.reimbursement_status === 'submitted'
                );
                renderSubmittedList();
            } else if (currentTab === 'reimbursements') {
                receiptsState.reimbursementsData = (receiptsState.allReimbursementsData || []).filter(
                    t => t.reimbursement_status === 'reimbursed'
                );
                renderReimbursementsList();
            }
        } else {
            showToast(result.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Update error:', error);
        showToast('Update failed', 'error');
    }
}

async function updateTransactionReimbursementStatus(transactionId, status) {
    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_status',
                transaction_id: transactionId,
                status: status
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Reimbursement status update error:', error);
        return { success: false };
    }
}

async function linkReceiptToTransaction() {
    const transactionId = document.getElementById('receipt-link-select').value;
    if (!transactionId) {
        showToast('Please select a transaction', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'attach',
                receipt_id: currentReceiptId,
                transaction_id: parseInt(transactionId)
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt linked to transaction', 'success');
            closeReceiptViewModal();
            loadReceipts();
        } else {
            showToast(result.message || 'Link failed', 'error');
        }
    } catch (error) {
        console.error('Link error:', error);
        showToast('Link failed', 'error');
    }
}

async function updateReimbursementStatus(transactionId, status) {
    if (!status) return;

    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_status',
                transaction_id: transactionId,
                status: status
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Status updated', 'success');
            loadReimbursementSummary();
            if (currentReceiptsTab === 'reimbursements') {
                renderReimbursementsList();
            }
        } else {
            showToast(result.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Update error:', error);
        showToast('Update failed', 'error');
    }
}

// =====================================================
// External Receipt Functions
// =====================================================

async function viewReceiptFromTransaction(receiptId) {
    try {
        const response = await fetch(`${API_BASE}/receipts/?id=${receiptId}`);
        const result = await response.json();

        if (!result.success || !result.data.receipts?.length) {
            showToast('Receipt not found', 'error');
            return;
        }

        const receipt = result.data.receipts[0];
        const isPdf = receipt.file_type === 'application/pdf';
        const imageUrl = `${window.location.origin}/ExpensesTracker/${receipt.file_path}`;

        // Create a quick view modal
        const modalContent = isPdf
            ? `<div style="text-align: center; padding: 40px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p style="margin-top: 12px; color: #6b7280;">${receipt.original_name}</p>
                <a href="${imageUrl}" target="_blank" class="btn btn-primary" style="margin-top: 12px;">Open PDF</a>
               </div>`
            : `<div style="text-align: center;">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;" alt="Receipt">
               </div>`;

        openModal('Receipt', modalContent);
    } catch (error) {
        console.error('View receipt error:', error);
        showToast('Failed to load receipt', 'error');
    }
}

function uploadReceiptForTransaction(transactionId) {
    // Close current modal and open receipt upload with transaction pre-linked
    closeModal();

    // Open receipt upload modal
    const uploadModal = document.getElementById('receipt-upload-modal');
    if (uploadModal) {
        uploadModal.classList.add('active');
        document.getElementById('receipt-transaction').value = transactionId;
        // Clear other fields
        document.getElementById('receipt-file').value = '';
        document.getElementById('receipt-vendor').value = '';
        document.getElementById('receipt-amount').value = '';
        document.getElementById('receipt-date').value = '';
        document.getElementById('receipt-description').value = '';
        document.querySelector('.file-preview')?.remove();
    } else {
        // Fallback: use inline file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showLoading();

            const formData = new FormData();
            formData.append('file', file);
            formData.append('user_id', state.currentUser);
            formData.append('transaction_id', transactionId);

            try {
                const response = await fetch(`${API_BASE}/receipts/`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                hideLoading();

                if (result.success) {
                    showToast('Receipt uploaded!', 'success');
                    // Refresh the transaction modal
                    showEditTransaction(transactionId);
                } else {
                    showToast(result.message || 'Upload failed', 'error');
                }
            } catch (error) {
                hideLoading();
                console.error('Upload error:', error);
                showToast('Upload failed', 'error');
            }
        };
        input.click();
    }
}

async function detachReceiptFromTransaction(receiptId, transactionId) {
    if (!confirm('Remove this receipt from the transaction?')) return;

    try {
        const response = await fetch(`${API_BASE}/receipts/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'detach',
                receipt_id: receiptId
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Receipt detached', 'success');
            // Refresh the transaction modal
            showEditTransaction(transactionId);
        } else {
            showToast(result.message || 'Failed to detach', 'error');
        }
    } catch (error) {
        console.error('Detach error:', error);
        showToast('Failed to detach receipt', 'error');
    }
}

// =====================================================
// Drag and Drop Setup
// =====================================================

document.addEventListener('DOMContentLoaded', function () {
    const dropzone = document.getElementById('receipt-dropzone');
    if (dropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'));
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length) {
                document.getElementById('receipt-file').files = files;
                handleFileSelect({ target: { files: files } });
            }
        });

        dropzone.addEventListener('click', () => {
            document.getElementById('receipt-file').click();
        });
    }
});

// =====================================================
// Expose Functions Globally
// =====================================================

window.loadReceiptsPage = loadReceiptsPage;
window.loadReceipts = loadReceipts;
window.loadReimbursementSummary = loadReimbursementSummary;
window.loadKanbanBoard = loadKanbanBoard;
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleKanbanCardClick = handleKanbanCardClick;
window.filterReimbursementsByStatus = filterReimbursementsByStatus;
window.clearReimbursementFilter = clearReimbursementFilter;
window.updateReimbursementSelection = updateReimbursementSelection;
window.bulkUpdateReimbursement = bulkUpdateReimbursement;
window.switchReceiptsTab = switchReceiptsTab;
window.openUploadReceiptModal = openUploadReceiptModal;
window.closeReceiptUploadModal = closeReceiptUploadModal;
window.handleReceiptUpload = handleReceiptUpload;
window.toggleCashReimbursement = toggleCashReimbursement;
window.handleFileSelect = handleFileSelect;
window.clearReceiptPreview = clearReceiptPreview;
window.viewReceipt = viewReceipt;
window.closeReceiptViewModal = closeReceiptViewModal;
window.downloadReceipt = downloadReceipt;
window.deleteReceipt = deleteReceipt;
window.editReceipt = editReceipt;
window.saveReceiptEdit = saveReceiptEdit;
window.linkReceiptToTransaction = linkReceiptToTransaction;
window.updateReimbursementStatus = updateReimbursementStatus;
window.viewReceiptFromTransaction = viewReceiptFromTransaction;
window.uploadReceiptForTransaction = uploadReceiptForTransaction;
window.detachReceiptFromTransaction = detachReceiptFromTransaction;

// Multi-select & Folder functions
window.toggleReceiptSelectionMode = toggleReceiptSelectionMode;
window.toggleReceiptSelection = toggleReceiptSelection;
window.selectAllReceipts = selectAllReceipts;
window.clearReceiptSelection = clearReceiptSelection;
window.bulkDeleteReceipts = bulkDeleteReceipts;
window.moveReceiptsToFolder = moveReceiptsToFolder;
window.openMoveFolderModal = openMoveFolderModal;
window.loadFolders = loadFolders;
window.filterByFolder = filterByFolder;
window.openCreateFolderModal = openCreateFolderModal;
window.createFolder = createFolder;
window.deleteFolder = deleteFolder;
window.viewTransactionDetailModal = viewTransactionDetailModal;
window.handleReimbActionReceipts = handleReimbActionReceipts;
window.handleReimbRowClick = handleReimbRowClick;
window.confirmMarkReimbursed = confirmMarkReimbursed;
window.editCashReceiptFromList = editCashReceiptFromList;
window.loadPendingTransactions = loadPendingTransactions;
window.renderPendingList = renderPendingList;
window.updatePendingSelection = updatePendingSelection;
window.bulkSubmitPending = bulkSubmitPending;
window.bulkUpdatePendingStatus = bulkUpdatePendingStatus;
window.renderSubmittedList = renderSubmittedList;
window.switchReceiptsView = switchReceiptsView;

// Override handleReimbAction for receipts page
async function handleReimbActionReceipts(transactionId, action, event) {
    event.stopPropagation();

    document.querySelectorAll('.actions-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
    });

    if (action === 'view') {
        viewTransactionDetailModal(transactionId);
    } else {
        await updateReimbursementStatus(transactionId, action);
        loadReimbursementSummary();
        if (currentReceiptsTab === 'reimbursements') {
            renderReimbursementsList();
        }
    }
}

async function viewTransactionDetailModal(transactionId) {
    try {
        const response = await fetch(`${API_BASE}/transactions/?id=${transactionId}`);
        const result = await response.json();

        // API returns transactions as an array
        const transactions = result.data?.transactions || result.data || [];
        const t = Array.isArray(transactions)
            ? transactions.find(tx => tx.id == transactionId)
            : transactions;

        if (!result.success || !t) {
            showToast('Transaction not found', 'error');
            return;
        }
        const dateStr = t.transaction_date && t.transaction_date !== '0000-00-00'
            ? new Date(t.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'No date';

        // Get receipts for this transaction
        const receiptsResponse = await fetch(`${API_BASE}/receipts/?transaction_id=${transactionId}`);
        const receiptsResult = await receiptsResponse.json();
        const receipts = receiptsResult.success ? (receiptsResult.data?.receipts || receiptsResult.data || []) : [];

        const receiptsHtml = receipts.length > 0
            ? receipts.map(r => `
                <div class="detail-receipt-item" onclick="window.open('${window.location.origin}/ExpensesTracker/${r.file_path}', '_blank')">
                    <img src="${window.location.origin}/ExpensesTracker/${r.file_path}" alt="Receipt">
                </div>
            `).join('')
            : '<p style="color: var(--text-secondary); font-size: 13px;">No receipts attached</p>';

        const statusColors = {
            'pending': '#f59e0b',
            'submitted': '#3b82f6',
            'approved': '#10b981',
            'reimbursed': '#22c55e',
            'none': '#6b7280'
        };
        const statusColor = statusColors[t.reimbursement_status] || '#6b7280';

        const currentStatus = t.reimbursement_status || 'none';

        const content = `
            <div class="transaction-detail-modal">
                <div class="detail-section">
                    <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${dateStr}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Description</span>
                        <span class="detail-value">${escapeHtml(t.description || '')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Amount</span>
                        <span class="detail-value amount-negative">$${Math.abs(t.amount).toFixed(2)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Category</span>
                        <span class="detail-value">${t.category_icon || '❓'} ${t.category_name || 'Uncategorized'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Account</span>
                        <span class="detail-value">${t.account_name || 'Unknown'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">
                            <select class="detail-status-select" onchange="updateTransactionStatusFromModal(${t.id}, this.value)">
                                <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>None</option>
                                <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="submitted" ${currentStatus === 'submitted' ? 'selected' : ''}>Submitted</option>
                                <option value="reimbursed" ${currentStatus === 'reimbursed' ? 'selected' : ''}>Reimbursed</option>
                            </select>
                        </span>
                    </div>
                    ${t.reimbursement_notes ? `
                    <div class="detail-row">
                        <span class="detail-label">Notes</span>
                        <span class="detail-value">${escapeHtml(t.reimbursement_notes)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h4 style="margin-bottom: 12px; color: var(--text-secondary); font-size: 13px;">Receipts</h4>
                    <div class="detail-receipts-grid">
                        ${receiptsHtml}
                    </div>
                </div>
            </div>
        `;

        openModal('Transaction Details', content);

    } catch (error) {
        console.error('Error loading transaction details:', error);
        showToast('Failed to load details', 'error');
    }
}

// Update status from Transaction Details modal
async function updateTransactionStatusFromModal(transactionId, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/reimbursements/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_status',
                transaction_id: transactionId,
                status: newStatus
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Status updated', 'success');
            // Refresh data in background
            await loadReimbursementSummary();
            updateTabCounts();
        } else {
            showToast(data.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Failed to update status', 'error');
    }
}

window.updateTransactionStatusFromModal = updateTransactionStatusFromModal;
