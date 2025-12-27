// =====================================================
// IOLTA Staging Module - CSV Import & Assignment
// Version: 20251225
// Dependencies: api.js, state.js, utils.js
// =====================================================

// Staging page state
if (!window.stagingPageState) {
    window.stagingPageState = {
        records: [],
        currentTab: 'unassigned',
        selectedIds: new Set()
    };
}
const stagingPageState = window.stagingPageState;

// Local helper - escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// STAGING WORKFLOW (CSV Import → Assign → Post)
// =====================================================

// Staging state
let stagingState = {
    records: [],
    summary: {},
    currentTab: 'unassigned',
    selectedIds: new Set(),
    lastClickedId: null
};

/**
 * Load staging page data
 */
async function loadStagingPage() {
    await loadIOLTAData();
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Load staging records from API
 */
async function loadStagingRecords(status = null) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const params = { user_id: userId };
    if (status) params.status = status;

    const data = await apiGet('/trust/staging.php', params);

    if (data.success) {
        stagingState.records = data.data.staging || [];
        stagingState.summary = data.data.summary || {};
    }

    return stagingState.records;
}

/**
 * Render staging page with tabs
 */
function renderStagingPage() {
    const container = document.getElementById('staging-content');
    if (!container) return;

    const summary = stagingState.summary;
    const unassignedCount = summary.unassigned?.count || 0;
    const assignedCount = summary.assigned?.count || 0;
    const postedCount = summary.posted?.count || 0;

    container.innerHTML = `
        <div style="padding: 24px;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 600;">Transaction Staging</h2>
                <button onclick="openStagingImportModal();" class="btn btn-primary" style="cursor: pointer; z-index: 100;">
                    Import CSV
                </button>
            </div>

            <!-- Tabs -->
            <div style="display: flex; gap: 4px; margin-bottom: 20px; background: #f1f5f9; padding: 4px; border-radius: 8px; width: fit-content;">
                <button class="staging-tab ${stagingState.currentTab === 'unassigned' ? 'active' : ''}"
                        onclick="switchStagingTab('unassigned')">
                    Unassigned <span class="badge">${unassignedCount}</span>
                </button>
                <button class="staging-tab ${stagingState.currentTab === 'assigned' ? 'active' : ''}"
                        onclick="switchStagingTab('assigned')">
                    Assigned <span class="badge">${assignedCount}</span>
                </button>
                <button class="staging-tab ${stagingState.currentTab === 'posted' ? 'active' : ''}"
                        onclick="switchStagingTab('posted')">
                    Posted <span class="badge">${postedCount}</span>
                </button>
            </div>

            <!-- Actions bar - always visible for unassigned/assigned tabs -->
            <div id="staging-actions" style="margin-bottom: 16px; display: flex; gap: 12px;">
                ${stagingState.currentTab === 'unassigned' ? `
                    <button id="btn-bulk-assign" onclick="openBulkAssignModal()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Assign Selected to Client (<span id="selected-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-delete" onclick="deleteSelectedStaging()" class="btn btn-danger" style="padding: 10px 20px; font-size: 14px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Delete Selected (<span id="delete-count">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
                ${stagingState.currentTab === 'assigned' ? `
                    <button id="btn-bulk-post" onclick="postSelectedStaging()" class="btn btn-primary" style="padding: 10px 20px; font-size: 14px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Post Selected (<span id="selected-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-match" onclick="openMatchModal()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Match to Existing (<span id="match-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-unassign" onclick="unassignSelectedStaging()" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unassign (<span id="unassign-count">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
                ${stagingState.currentTab === 'posted' ? `
                    <button id="btn-bulk-unpost-assigned" onclick="unpostSelectedStaging('assigned')" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unpost to Assigned (<span id="unpost-count">${stagingState.selectedIds.size}</span>)
                    </button>
                    <button id="btn-bulk-unpost-unassigned" onclick="unpostSelectedStaging('unassigned')" class="btn btn-secondary" style="padding: 10px 20px; font-size: 14px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Unpost to Unassigned (<span id="unpost-count2">${stagingState.selectedIds.size}</span>)
                    </button>
                ` : ''}
            </div>

            <!-- Transactions list -->
            <div id="staging-list">
                ${renderStagingList()}
            </div>
        </div>
    `;

    updateStagingActionsVisibility();
}

/**
 * Render staging transactions list
 */
function renderStagingList() {
    const records = stagingState.records.filter(r => r.status === stagingState.currentTab);

    if (records.length === 0) {
        return `
            <div style="padding: 48px; text-align: center; color: #94a3b8;">
                <div style="font-size: 48px; margin-bottom: 16px;">&#128203;</div>
                <div style="font-size: 16px; font-weight: 500; color: #64748b;">No ${stagingState.currentTab} transactions</div>
                ${stagingState.currentTab === 'unassigned' ? `
                    <div style="font-size: 14px; margin-top: 8px;">Import a CSV file to get started</div>
                ` : ''}
            </div>
        `;
    }

    let html = `
        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
            <!-- Header -->
            <div style="display: grid; grid-template-columns: 40px 100px 80px 1fr 150px 120px 100px; gap: 12px; padding: 12px 16px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">
                <div><input type="checkbox" id="staging-select-all" onchange="toggleSelectAllStaging(this.checked)"></div>
                <div>Date</div>
                <div>Check #</div>
                <div>Description</div>
                <div>Client</div>
                <div style="text-align: right;">Amount</div>
                <div>Status</div>
            </div>

            <!-- Rows -->
            ${records.map(r => renderStagingRow(r)).join('')}
        </div>
    `;

    return html;
}

/**
 * Render single staging row
 */
function renderStagingRow(record) {
    const amount = parseFloat(record.amount);
    const isPositive = amount > 0;
    const isSelected = stagingState.selectedIds.has(record.id);

    const statusColors = {
        unassigned: { bg: '#fef3c7', text: '#d97706' },
        assigned: { bg: '#dbeafe', text: '#2563eb' },
        posted: { bg: '#dcfce7', text: '#16a34a' },
        rejected: { bg: '#fee2e2', text: '#dc2626' }
    };
    const statusStyle = statusColors[record.status] || statusColors.unassigned;

    // Extract check number from reference_number or description
    let checkNum = record.reference_number || '';
    // If no reference_number, try to extract from description (e.g., "CHECK 11822")
    if (!checkNum && record.description) {
        const match = record.description.match(/CHECK\s*#?\s*(\d+)/i);
        if (match) {
            checkNum = match[1];
        }
    }

    return `
        <div class="staging-row ${isSelected ? 'selected' : ''}" data-id="${record.id}"
             style="display: grid; grid-template-columns: 40px 100px 80px 1fr 150px 120px 100px; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; align-items: center; cursor: pointer; ${isSelected ? 'background: #eff6ff;' : ''}"
             onclick="toggleStagingSelection(${record.id}, event)">
            <div>
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleStagingSelection(${record.id}, event)">
            </div>
            <div style="font-size: 13px; color: #64748b;">${formatDate(record.transaction_date)}</div>
            <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(checkNum || '-')}</div>
            <div style="font-size: 13px; color: #1e293b;">${escapeHtml(record.description || '-')}</div>
            <div style="font-size: 13px; color: ${record.client_name ? '#1e293b' : '#94a3b8'};">
                ${record.client_name ? escapeHtml(record.client_name) : '(Not assigned)'}
            </div>
            <div style="text-align: right; font-size: 13px; font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'};">
                ${isPositive ? '+' : ''}${formatCurrency(amount)}
            </div>
            <div>
                <span style="padding: 2px 8px; font-size: 11px; font-weight: 500; border-radius: 4px; background: ${statusStyle.bg}; color: ${statusStyle.text};">
                    ${record.status}
                </span>
            </div>
        </div>
    `;
}

/**
 * Switch staging tab
 */
async function switchStagingTab(tab) {
    stagingState.currentTab = tab;
    stagingState.selectedIds.clear();
    stagingState.lastClickedId = null;
    await loadStagingRecords(tab);
    renderStagingPage();
}

/**
 * Toggle staging selection with shift+click range selection support
 */
function toggleStagingSelection(id, event) {
    if (event) event.stopPropagation();

    // Ensure id is a number for consistent comparison
    const numId = parseInt(id);

    // Shift+click range selection
    if (event && event.shiftKey && stagingState.lastClickedId !== null) {
        const records = stagingState.records.filter(r => r.status === stagingState.currentTab);
        const recordIds = records.map(r => parseInt(r.id));

        const startIdx = recordIds.indexOf(stagingState.lastClickedId);
        const endIdx = recordIds.indexOf(numId);

        if (startIdx !== -1 && endIdx !== -1) {
            const minIdx = Math.min(startIdx, endIdx);
            const maxIdx = Math.max(startIdx, endIdx);

            // Select all items in range
            for (let i = minIdx; i <= maxIdx; i++) {
                stagingState.selectedIds.add(recordIds[i]);
            }

            // Update UI for all rows in range
            document.querySelectorAll('.staging-row').forEach(row => {
                const rowId = parseInt(row.dataset.id);
                const isSelected = stagingState.selectedIds.has(rowId);
                row.classList.toggle('selected', isSelected);
                row.style.background = isSelected ? '#eff6ff' : '';
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = isSelected;
            });

            stagingState.lastClickedId = numId;
            updateStagingActionsVisibility();
            return;
        }
    }

    // Normal single click toggle
    if (stagingState.selectedIds.has(numId)) {
        stagingState.selectedIds.delete(numId);
    } else {
        stagingState.selectedIds.add(numId);
    }

    // Track last clicked for shift+click
    stagingState.lastClickedId = numId;


    // Update UI
    const row = document.querySelector(`.staging-row[data-id="${numId}"]`);
    if (row) {
        const isSelected = stagingState.selectedIds.has(numId);
        row.classList.toggle('selected', isSelected);
        row.style.background = isSelected ? '#eff6ff' : '';
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = isSelected;
    }

    updateStagingActionsVisibility();
}

/**
 * Toggle select all staging
 */
function toggleSelectAllStaging(checked) {
    const records = stagingState.records.filter(r => r.status === stagingState.currentTab);

    if (checked) {
        records.forEach(r => stagingState.selectedIds.add(parseInt(r.id)));
    } else {
        stagingState.selectedIds.clear();
    }


    // Update all rows
    document.querySelectorAll('.staging-row').forEach(row => {
        const id = parseInt(row.dataset.id);
        const isSelected = stagingState.selectedIds.has(id);
        row.classList.toggle('selected', isSelected);
        row.style.background = isSelected ? '#eff6ff' : '';
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = isSelected;
    });

    updateStagingActionsVisibility();
}

/**
 * Update actions bar visibility
 */
function updateStagingActionsVisibility() {
    const count = stagingState.selectedIds.size;

    // Update button text directly with new count
    const assignBtn = document.getElementById('btn-bulk-assign');
    const postBtn = document.getElementById('btn-bulk-post');
    const matchBtn = document.getElementById('btn-bulk-match');
    const deleteBtn = document.getElementById('btn-bulk-delete');

    if (assignBtn) {
        assignBtn.textContent = `Assign Selected to Client (${count})`;
        assignBtn.disabled = count === 0;
        assignBtn.style.opacity = count === 0 ? '0.5' : '1';
        assignBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (deleteBtn) {
        deleteBtn.textContent = `Delete Selected (${count})`;
        deleteBtn.disabled = count === 0;
        deleteBtn.style.opacity = count === 0 ? '0.5' : '1';
        deleteBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (postBtn) {
        postBtn.textContent = `Post Selected (${count})`;
        postBtn.disabled = count === 0;
        postBtn.style.opacity = count === 0 ? '0.5' : '1';
        postBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
    if (matchBtn) {
        // Match button works with single selection only
        const matchCount = count === 1 ? 1 : 0;
        matchBtn.textContent = `Match to Existing (${matchCount})`;
        matchBtn.disabled = count !== 1;
        matchBtn.style.opacity = count !== 1 ? '0.5' : '1';
        matchBtn.style.cursor = count !== 1 ? 'not-allowed' : 'pointer';
    }
}

/**
 * Open CSV import modal for staging
 */
function openStagingImportModal() {
    let modal = document.getElementById('staging-import-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staging-import-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeStagingImportModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; max-width: 500px; width: 90%; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Import Transactions</h3>
                <button onclick="closeStagingImportModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 16px; color: #64748b;">
                    Import bank transactions from a CSV file. Transactions will be added to the <strong>Unassigned</strong> queue.
                </p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">CSV File</label>
                    <input type="file" id="staging-csv-file" accept=".csv" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                </div>

                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 13px; color: #64748b;">
                    <strong>Expected columns:</strong><br>
                    date, amount, description (required)<br>
                    type, reference, payee (optional)
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button onclick="closeStagingImportModal()" style="padding: 10px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 8px; cursor: pointer;">Cancel</button>
                <button onclick="submitStagingImport()" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">Import</button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

function closeStagingImportModal() {
    const modal = document.getElementById('staging-import-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Submit CSV import
 */
async function submitStagingImport() {
    const fileInput = document.getElementById('staging-csv-file');
    if (!fileInput || !fileInput.files[0]) {
        showToast('Please select a CSV file', 'error');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Find IOLTA account - try trustAccounts first, then fetch from API if needed
    let ioltaAccount = null;
    if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
        ioltaAccount = ioltaState.trustAccounts.find(a => a.account_type === 'iolta');
    }

    // If not found in state, fetch from API
    if (!ioltaAccount) {
        const accountsData = await apiGet('/accounts/index.php', { user_id: userId, account_type: 'iolta' });
        if (accountsData.success && accountsData.data.accounts && accountsData.data.accounts.length > 0) {
            ioltaAccount = accountsData.data.accounts[0];
        }
    }

    if (!ioltaAccount) {
        showToast('No IOLTA account found. Please create one first.', 'error');
        return;
    }


    const formData = new FormData();
    formData.append('csv_file', fileInput.files[0]);
    formData.append('user_id', userId);
    formData.append('account_id', ioltaAccount.id);

    try {
        const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            let msg = `Imported ${data.data.imported} transactions`;
            if (data.data.duplicates > 0) {
                msg += `, ${data.data.duplicates} duplicates skipped`;
            }
            showToast(msg, 'success');

            // Show skipped list if any duplicates
            if (data.data.skipped_list && data.data.skipped_list.length > 0) {
                showSkippedDuplicatesModal(data.data.skipped_list);
            }

            closeStagingImportModal();
            await loadStagingRecords();
            renderStagingPage();
        } else {
            showToast(data.message || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Import error:', error);
        showToast('Import failed: ' + error.message, 'error');
    }
}

/**
 * Open bulk assign modal
 */
function openBulkAssignModal() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to assign', 'warning');
        return;
    }

    const clients = ioltaState.clients || [];

    let modal = document.getElementById('staging-assign-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staging-assign-modal';
        document.body.appendChild(modal);
    }


    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeBulkAssignModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; max-width: 500px; width: 90%; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px;">Assign to Client</h3>
                <button onclick="closeBulkAssignModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 16px; color: #64748b;">
                    Assigning <strong>${stagingState.selectedIds.size}</strong> transaction(s) to a client.
                </p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Select Client</label>
                    <input type="text" id="staging-assign-search" placeholder="Search clients..."
                           oninput="filterStagingAssignClients(this.value)"
                           style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
                    <div id="staging-assign-client-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        ${clients.length > 0 ? clients.map(c => `
                            <div class="staging-client-option" data-id="${c.id}"
                                 onclick="selectStagingAssignClient(${c.id})"
                                 style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;"
                                 onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
                                <div style="font-weight: 500;">${escapeHtml(c.client_name)}</div>
                                <div style="font-size: 12px; color: #64748b;">${c.case_number || 'No case #'}</div>
                            </div>
                        `).join('') : '<div style="padding: 20px; text-align: center; color: #94a3b8;">No clients found. Add clients first.</div>'}
                    </div>
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid #e2e8f0; text-align: right;">
                <button onclick="closeBulkAssignModal()" style="padding: 10px 20px; background: #f1f5f9; border: none; border-radius: 8px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

function closeBulkAssignModal() {
    const modal = document.getElementById('staging-assign-modal');
    if (modal) modal.style.display = 'none';
}

function filterStagingAssignClients(term) {
    const clients = ioltaState.clients || [];
    const filtered = clients.filter(c =>
        c.client_name.toLowerCase().includes(term.toLowerCase()) ||
        (c.case_number && c.case_number.toLowerCase().includes(term.toLowerCase()))
    );

    const list = document.getElementById('staging-assign-client-list');
    if (list) {
        list.innerHTML = filtered.map(c => `
            <div class="staging-client-option" data-id="${c.id}"
                 onclick="selectStagingAssignClient(${c.id})"
                 style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
                <div style="font-weight: 500;">${escapeHtml(c.client_name)}</div>
                <div style="font-size: 12px; color: #64748b;">${c.case_number || 'No case #'}</div>
            </div>
        `).join('');
    }
}

/**
 * Select client and assign all selected staging records, then auto-post to Client Ledger
 */
async function selectStagingAssignClient(clientId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    let assignSuccess = 0;
    let assignFailed = 0;

    // Step 1: Assign client to all selected staging records
    for (const id of ids) {
        try {
            const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    client_id: clientId,
                    user_id: userId
                })
            });
            const data = await response.json();
            if (data.success) assignSuccess++;
            else assignFailed++;
        } catch (e) {
            assignFailed++;
        }
    }

    // Step 2: Auto-post to Client Ledger
    if (assignSuccess > 0) {
        try {
            const response = await fetch('/expensetracker/api/v1/trust/post.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'bulk_post',
                    staging_ids: ids,
                    user_id: userId
                })
            });
            const postData = await response.json();

            closeBulkAssignModal();

            if (postData.success) {
                showToast(`Assigned and posted ${postData.data.posted} transaction(s) to Client Ledger`, 'success');
            } else {
                showToast(`Assigned ${assignSuccess} but posting failed: ${postData.message}`, 'warning');
                console.error('Post failed:', postData);
            }
        } catch (e) {
            closeBulkAssignModal();
            showToast(`Assigned ${assignSuccess} but posting failed: ${e.message}`, 'warning');
            console.error('Post exception:', e);
        }
    } else {
        closeBulkAssignModal();
        showToast(`Assignment failed`, 'error');
    }

    stagingState.selectedIds.clear();
    stagingState.lastClickedId = null;
    await loadStagingRecords();
    renderStagingPage();
}

/**
 * Post selected staging records
 */
async function postSelectedStaging() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to post', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await fetch('/expensetracker/api/v1/trust/post.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_post',
                staging_ids: ids,
                user_id: userId
            })
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Posted ${data.data.posted} transaction(s)`, 'success');
            if (data.data.errors && data.data.errors.length > 0) {
            }
        } else {
            showToast(data.message || 'Posting failed', 'error');
        }
    } catch (error) {
        showToast('Posting failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
    // Also refresh ledger balances
    await refreshIoltaUI({ ledgers: true, transactions: true, sidebar: true });
}

/**
 * Unassign selected staging records (move back to unassigned)
 */
async function unassignSelectedStaging() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to unassign', 'warning');
        return;
    }

    const count = stagingState.selectedIds.size;
    if (!confirm(`Move ${count} transaction(s) back to unassigned?`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await apiPost('/trust/staging.php', {
            action: 'unassign',
            ids: ids,
            user_id: userId
        });

        if (response.success) {
            showToast(`Moved ${response.data.unassigned} transaction(s) to unassigned`, 'success');
            if (response.data.errors && response.data.errors.length > 0) {
            }
        } else {
            showToast(response.message || 'Unassign failed', 'error');
        }
    } catch (error) {
        showToast('Unassign failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
    // Also refresh staging summary
    await loadStagingSummary();
    updateStagingBadge();
}

/**
 * Unpost selected staging records (reverse posted transactions)
 */
async function unpostSelectedStaging(targetStatus = 'assigned') {
    if (stagingState.selectedIds.size === 0) {
        showToast('Select transactions to unpost', 'warning');
        return;
    }

    const count = stagingState.selectedIds.size;
    const targetLabel = targetStatus === 'assigned' ? 'Assigned' : 'Unassigned';

    if (!confirm(`Unpost ${count} transaction(s) and move to ${targetLabel}?\n\nThis will DELETE the trust transactions and reverse the client ledger balances.`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');
    const ids = Array.from(stagingState.selectedIds);

    try {
        const response = await IoltaApi.unpostStaging(ids, userId, targetStatus);

        if (response.success) {
            showToast(`Unposted ${response.data.unposted} transaction(s) to ${targetLabel}`, 'success');
            if (response.data.errors && response.data.errors.length > 0) {
            }
        } else {
            showToast(response.message || response.error || 'Unpost failed', 'error');
        }
    } catch (error) {
        showToast('Unpost failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
    // Also refresh ledger balances since unposting affects them
    await refreshIoltaUI({ ledgers: true, transactions: true, sidebar: true });
}

/**
 * Delete selected staging records
 */
async function deleteSelectedStaging() {
    const ids = Array.from(stagingState.selectedIds);
    if (ids.length === 0) {
        showToast('Select transactions to delete', 'warning');
        return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete ${ids.length} transaction(s)? This cannot be undone.`)) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch('/expensetracker/api/v1/trust/staging.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'bulk_delete',
                staging_ids: ids,
                user_id: userId
            })
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Deleted ${data.data.deleted} transaction(s)`, 'success');
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }

    stagingState.selectedIds.clear();
    await loadStagingRecords();
    renderStagingPage();
    // Also refresh staging summary
    await loadStagingSummary();
    updateStagingBadge();
}

/**
 * Show modal with skipped duplicate transactions
 */
function showSkippedDuplicatesModal(skippedList) {
    // Remove existing modal if any
    const existing = document.getElementById('skipped-duplicates-modal');
    if (existing) existing.remove();

    const rows = skippedList.map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; font-size: 13px;">${item.date || '-'}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #7c3aed;">${item.reference || '-'}</td>
            <td style="padding: 10px 12px; font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.description || '-')}</td>
            <td style="padding: 10px 12px; font-size: 13px; text-align: right; font-weight: 500; color: ${item.amount < 0 ? '#ef4444' : '#10b981'};">
                ${item.amount < 0 ? '-' : '+'}$${Math.abs(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}
            </td>
        </tr>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'skipped-duplicates-modal';
    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;" onclick="closeSkippedDuplicatesModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; padding: 24px; width: 700px; max-width: 90vw; max-height: 80vh; z-index: 10001; box-shadow: 0 25px 50px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Skipped Duplicates</h3>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">${skippedList.length} transactions were skipped (already exist with same check# and amount)</p>
                </div>
                <button onclick="closeSkippedDuplicatesModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8fafc; position: sticky; top: 0;">
                        <tr>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Date</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Check #</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 16px; text-align: right;">
                <button onclick="closeSkippedDuplicatesModal()" style="padding: 10px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeSkippedDuplicatesModal() {
    const modal = document.getElementById('skipped-duplicates-modal');
    if (modal) modal.remove();
}

// =====================================================
// TRANSACTION MATCHING (Bank Reconciliation Style)
// =====================================================

let matchingState = {
    stagingId: null,
    matches: [],
    selectedMatchId: null
};

/**
 * Open match modal for the first selected staging record
 */
async function openMatchModal() {
    if (stagingState.selectedIds.size === 0) {
        showToast('Please select a transaction to match', 'warning');
        return;
    }

    // Only handle one at a time for matching
    const stagingId = Array.from(stagingState.selectedIds)[0];
    const userId = state.currentUser || localStorage.getItem('currentUser');

    // Show loading
    showToast('Finding potential matches...', 'info');

    try {
        const result = await IoltaApi.findMatches(stagingId, userId);

        if (!result.success) {
            showToast(result.message || 'Failed to find matches', 'error');
            return;
        }

        matchingState.stagingId = stagingId;
        matchingState.matches = result.data.matches || [];
        matchingState.selectedMatchId = null;

        renderMatchModal(result.data.staging, result.data.matches);

    } catch (error) {
        console.error('Error finding matches:', error);
        showToast('Error finding matches', 'error');
    }
}

/**
 * Render the match modal with potential matches
 */
function renderMatchModal(staging, matches) {
    let modal = document.getElementById('match-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'match-modal';
        document.body.appendChild(modal);
    }

    const amount = parseFloat(staging.amount);
    const isPositive = amount > 0;

    let matchesHtml = '';
    if (matches.length === 0) {
        matchesHtml = `
            <div style="padding: 32px; text-align: center; color: #94a3b8;">
                <div style="font-size: 36px; margin-bottom: 12px;">&#128269;</div>
                <div style="font-size: 14px; font-weight: 500; color: #64748b;">No matching transactions found</div>
                <div style="font-size: 13px; margin-top: 8px; color: #94a3b8;">
                    Matches require: same client, same amount, date within 14 days
                </div>
            </div>
        `;
    } else {
        matchesHtml = matches.map(m => {
            const matchAmount = parseFloat(m.amount);
            const matchIsPositive = matchAmount > 0;
            const scoreColor = m.match_score >= 80 ? '#10b981' : m.match_score >= 50 ? '#f59e0b' : '#94a3b8';

            return `
                <div class="match-option" data-id="${m.id}"
                     onclick="selectMatchOption(${m.id})"
                     style="display: grid; grid-template-columns: 40px 1fr 120px 80px; gap: 12px; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: all 0.15s; align-items: center;"
                     onmouseover="this.style.borderColor='#8b5cf6'; this.style.background='#faf5ff';"
                     onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='#e2e8f0'; this.style.background='white';}">
                    <div style="display: flex; align-items: center; justify-content: center;">
                        <input type="radio" name="match-option" value="${m.id}" style="width: 18px; height: 18px; cursor: pointer;">
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 4px;">
                            ${escapeHtml(m.description || 'No description')}
                        </div>
                        <div style="font-size: 12px; color: #64748b;">
                            ${formatDate(m.transaction_date)} · ${m.reference_number ? 'Ref: ' + escapeHtml(m.reference_number) : ''} ${m.check_number ? '· Check #' + escapeHtml(m.check_number) : ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 15px; font-weight: 600; color: ${matchIsPositive ? '#10b981' : '#ef4444'};">
                            ${matchIsPositive ? '+' : ''}${formatCurrency(matchAmount)}
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                            ${m.days_difference === 0 ? 'Same day' : m.days_difference + ' day(s) diff'}
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 12px; background: ${scoreColor}20; color: ${scoreColor};">
                            ${m.match_score}%
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9998;" onclick="closeMatchModal()"></div>
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; max-width: 700px; width: 95%; max-height: 85vh; overflow: hidden; z-index: 9999; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
            <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">Match Bank Transaction</h3>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Link this bank import to an existing ledger entry</p>
                </div>
                <button onclick="closeMatchModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; padding: 4px;">&times;</button>
            </div>

            <div style="padding: 20px 24px; max-height: calc(85vh - 180px); overflow-y: auto;">
                <!-- Staging record being matched -->
                <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; margin-bottom: 8px;">Bank Import (to match)</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 15px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(staging.description || 'No description')}</div>
                            <div style="font-size: 13px; opacity: 0.9;">${formatDate(staging.transaction_date)} · ${staging.client_name || 'Unknown client'}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 20px; font-weight: 700;">${isPositive ? '+' : ''}${formatCurrency(amount)}</div>
                        </div>
                    </div>
                </div>

                <!-- Potential matches -->
                <div style="margin-bottom: 12px; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                    Potential Matches (${matches.length})
                </div>
                ${matchesHtml}
            </div>

            <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; background: #f8fafc;">
                <button onclick="closeMatchModal()" style="padding: 10px 24px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-weight: 500;">Cancel</button>
                <button id="btn-confirm-match" onclick="confirmMatch()" style="padding: 10px 24px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; opacity: 0.5;" disabled>
                    Confirm Match
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

/**
 * Select a match option
 */
function selectMatchOption(transactionId) {
    matchingState.selectedMatchId = transactionId;

    // Update UI
    document.querySelectorAll('.match-option').forEach(el => {
        el.classList.remove('selected');
        el.style.borderColor = '#e2e8f0';
        el.style.background = 'white';
        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
    });

    const selected = document.querySelector(`.match-option[data-id="${transactionId}"]`);
    if (selected) {
        selected.classList.add('selected');
        selected.style.borderColor = '#8b5cf6';
        selected.style.background = '#faf5ff';
        const radio = selected.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    }

    // Enable confirm button
    const btn = document.getElementById('btn-confirm-match');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

/**
 * Confirm the selected match
 */
async function confirmMatch() {
    if (!matchingState.stagingId || !matchingState.selectedMatchId) {
        showToast('Please select a transaction to match', 'warning');
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const result = await IoltaApi.matchTransaction(
            matchingState.stagingId,
            matchingState.selectedMatchId,
            userId
        );

        if (result.success) {
            showToast('Transaction matched successfully!', 'success');
            closeMatchModal();

            // Refresh staging list
            stagingState.selectedIds.clear();
            await loadStagingRecords();
            renderStagingPage();
            // Also refresh ledger balances and transactions
            await refreshIoltaUI({ ledgers: true, transactions: true, sidebar: true });
        } else {
            showToast(result.message || 'Failed to match transaction', 'error');
        }
    } catch (error) {
        console.error('Error matching transaction:', error);
        showToast('Error matching transaction', 'error');
    }
}

/**
 * Close the match modal
 */
function closeMatchModal() {
    const modal = document.getElementById('match-modal');
    if (modal) modal.style.display = 'none';

    matchingState.stagingId = null;
    matchingState.matches = [];
    matchingState.selectedMatchId = null;
}

// Export staging functions
window.loadStagingPage = loadStagingPage;
window.loadStagingRecords = loadStagingRecords;
window.renderStagingPage = renderStagingPage;
window.switchStagingTab = switchStagingTab;
window.toggleStagingSelection = toggleStagingSelection;
window.toggleSelectAllStaging = toggleSelectAllStaging;
window.openStagingImportModal = openStagingImportModal;
window.closeStagingImportModal = closeStagingImportModal;
window.submitStagingImport = submitStagingImport;
window.openBulkAssignModal = openBulkAssignModal;
window.closeBulkAssignModal = closeBulkAssignModal;
window.filterStagingAssignClients = filterStagingAssignClients;
window.selectStagingAssignClient = selectStagingAssignClient;
window.postSelectedStaging = postSelectedStaging;
window.unassignSelectedStaging = unassignSelectedStaging;
window.unpostSelectedStaging = unpostSelectedStaging;
window.deleteSelectedStaging = deleteSelectedStaging;
window.showSkippedDuplicatesModal = showSkippedDuplicatesModal;
window.closeSkippedDuplicatesModal = closeSkippedDuplicatesModal;
window.openMatchModal = openMatchModal;
window.closeMatchModal = closeMatchModal;
window.selectMatchOption = selectMatchOption;
window.confirmMatch = confirmMatch;

console.log('IOLTA Staging module loaded');
