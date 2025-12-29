// =====================================================
// SPLIT TRANSACTION MODAL
// Create split checks/deposits across multiple clients
// =====================================================

let splitModalState = {
    type: 'check',      // 'check' or 'deposit'
    lines: [],          // Array of {client_id, client_name, amount, description}
    totalAmount: 0,
    clients: []         // Cached client list
};

// Helper to get current user ID
function getSplitModalUserId() {
    return window.getCurrentUserId?.() || window.IoltaPageState?.currentUser || localStorage.getItem('currentUser') || 1;
}

// Open split transaction modal
function openSplitTransactionModal(type = 'check') {
    splitModalState.type = type;
    splitModalState.lines = [
        { client_id: '', client_name: '', amount: '', description: '' },
        { client_id: '', client_name: '', amount: '', description: '' }
    ];
    splitModalState.totalAmount = 0;

    // Create modal if it doesn't exist
    let modal = document.getElementById('split-transaction-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'split-transaction-modal';
        modal.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;';
        modal.innerHTML = getSplitModalHtml();
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    updateSplitModalContent();
    loadSplitModalClients();

    // Set today's date
    const dateInput = document.getElementById('split-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Close split transaction modal
function closeSplitTransactionModal() {
    const modal = document.getElementById('split-transaction-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Get modal HTML structure
function getSplitModalHtml() {
    return `
        <div style="background: white; border-radius: 16px; width: 95%; max-width: 800px; max-height: 90vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
            <!-- Header -->
            <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 id="split-modal-title" style="margin: 0; font-size: 20px; font-weight: 700; color: white;">Split Check</h2>
                        <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">Distribute one check across multiple client ledgers</p>
                    </div>
                    <button onclick="closeSplitTransactionModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
                </div>
            </div>

            <!-- Content -->
            <div style="padding: 24px; overflow-y: auto; max-height: calc(90vh - 180px);">
                <form id="split-transaction-form" onsubmit="submitSplitTransaction(event)">
                    <!-- Common Fields -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Check # *</label>
                            <input type="text" id="split-check-number" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                            <input type="date" id="split-date" required
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Type *</label>
                            <select id="split-type" required
                                    style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white;">
                                <option value="disbursement">Disbursement</option>
                                <option value="payout">Payout</option>
                                <option value="legal_fee">Legal Fee</option>
                                <option value="cost">Cost</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Payee *</label>
                            <input type="text" id="split-payee" required placeholder="Who is this check made out to?"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Memo</label>
                            <input type="text" id="split-memo" placeholder="Optional memo..."
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Split Lines Section -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Split Allocations</h3>
                            <button type="button" onclick="addSplitLine()"
                                    style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                <span style="font-size: 16px;">+</span> Add Client
                            </button>
                        </div>

                        <!-- Split Lines Table -->
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #e2e8f0;">
                                        <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Client</th>
                                        <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; width: 130px;">Amount</th>
                                        <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</th>
                                        <th style="padding: 10px 12px; width: 50px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="split-lines-body">
                                    <!-- Dynamic rows -->
                                </tbody>
                            </table>
                        </div>

                        <!-- Totals -->
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <span style="font-size: 13px; color: #64748b;">Total Allocated:</span>
                                    <span id="split-allocated-amount" style="font-size: 18px; font-weight: 700; color: #1e293b; margin-left: 8px;">$0.00</span>
                                </div>
                                <div id="split-validation-message" style="font-size: 13px; color: #22c55e;"></div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Footer -->
            <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; background: #f8fafc; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeSplitTransactionModal()"
                        style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">
                    Cancel
                </button>
                <button type="button" onclick="submitSplitTransaction(event)" id="split-submit-btn"
                        style="padding: 10px 24px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Save Split Check
                </button>
            </div>
        </div>
    `;
}

// Update modal content based on type
function updateSplitModalContent() {
    const title = document.getElementById('split-modal-title');
    const checkNumField = document.getElementById('split-check-number');

    if (splitModalState.type === 'deposit') {
        if (title) title.textContent = 'Split Deposit';
        if (checkNumField) {
            checkNumField.parentElement.style.display = 'none';
        }
    } else {
        if (title) title.textContent = 'Split Check';
        if (checkNumField) {
            checkNumField.parentElement.style.display = 'block';
        }
    }

    renderSplitLines();
}

// Load clients for dropdown
async function loadSplitModalClients() {
    try {
        const userId = getSplitModalUserId();
        const response = await fetch(`/expensetracker/api/v1/trust/clients.php?user_id=${userId}&limit=1000`);
        const data = await response.json();

        if (data.success && data.data?.clients) {
            splitModalState.clients = data.data.clients;
        }
    } catch (error) {
        console.error('Failed to load clients:', error);
    }
}

// Render split lines
function renderSplitLines() {
    const tbody = document.getElementById('split-lines-body');
    if (!tbody) return;

    tbody.innerHTML = splitModalState.lines.map((line, index) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px;">
                <div style="position: relative;">
                    <input type="text"
                           id="split-client-search-${index}"
                           value="${line.client_name || ''}"
                           placeholder="Search client..."
                           autocomplete="off"
                           onfocus="showSplitClientDropdown(${index})"
                           oninput="filterSplitClients(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                    <input type="hidden" id="split-client-id-${index}" value="${line.client_id || ''}">
                    <div id="split-client-dropdown-${index}"
                         style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 6px 6px; z-index: 10001; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    </div>
                </div>
            </td>
            <td style="padding: 8px;">
                <input type="number"
                       id="split-amount-${index}"
                       value="${line.amount || ''}"
                       placeholder="0.00"
                       step="0.01"
                       min="0.01"
                       oninput="updateSplitLineAmount(${index}, this.value)"
                       style="width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; text-align: right; box-sizing: border-box;">
            </td>
            <td style="padding: 8px;">
                <input type="text"
                       id="split-desc-${index}"
                       value="${line.description || ''}"
                       placeholder="Description..."
                       oninput="updateSplitLineDescription(${index}, this.value)"
                       style="width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
            </td>
            <td style="padding: 8px; text-align: center;">
                ${splitModalState.lines.length > 2 ? `
                    <button type="button" onclick="removeSplitLine(${index})"
                            style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 18px; padding: 4px;">&times;</button>
                ` : ''}
            </td>
        </tr>
    `).join('');

    updateSplitTotals();
}

// Show client dropdown
function showSplitClientDropdown(index) {
    const dropdown = document.getElementById(`split-client-dropdown-${index}`);
    if (!dropdown) return;

    renderSplitClientList(index, splitModalState.clients);
    dropdown.style.display = 'block';

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!e.target.closest(`#split-client-search-${index}`) && !e.target.closest(`#split-client-dropdown-${index}`)) {
                dropdown.style.display = 'none';
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 100);
}

// Filter clients
function filterSplitClients(index, query) {
    const filtered = splitModalState.clients.filter(client => {
        const searchStr = `${client.client_name} ${client.case_number || ''} ${client.matter_number || ''}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
    });
    renderSplitClientList(index, filtered);
}

// Render client list in dropdown
function renderSplitClientList(index, clients) {
    const dropdown = document.getElementById(`split-client-dropdown-${index}`);
    if (!dropdown) return;

    if (clients.length === 0) {
        dropdown.innerHTML = '<div style="padding: 12px; color: #64748b; font-size: 13px;">No clients found</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = clients.slice(0, 50).map(client => `
        <div onclick="selectSplitClient(${index}, ${client.id}, '${escapeHtml(client.client_name)}')"
             style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 13px;"
             onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">
            <div style="font-weight: 500; color: #1e293b;">${escapeHtml(client.client_name)}</div>
            <div style="font-size: 11px; color: #64748b;">#${client.case_number || client.matter_number || client.id}</div>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

// Select client
function selectSplitClient(index, clientId, clientName) {
    splitModalState.lines[index].client_id = clientId;
    splitModalState.lines[index].client_name = clientName;

    const searchInput = document.getElementById(`split-client-search-${index}`);
    const hiddenInput = document.getElementById(`split-client-id-${index}`);
    const dropdown = document.getElementById(`split-client-dropdown-${index}`);

    if (searchInput) searchInput.value = clientName;
    if (hiddenInput) hiddenInput.value = clientId;
    if (dropdown) dropdown.style.display = 'none';
}

// Update line amount
function updateSplitLineAmount(index, value) {
    splitModalState.lines[index].amount = parseFloat(value) || 0;
    updateSplitTotals();
}

// Update line description
function updateSplitLineDescription(index, value) {
    splitModalState.lines[index].description = value;
}

// Add new split line
function addSplitLine() {
    splitModalState.lines.push({ client_id: '', client_name: '', amount: '', description: '' });
    renderSplitLines();
}

// Remove split line
function removeSplitLine(index) {
    if (splitModalState.lines.length > 2) {
        splitModalState.lines.splice(index, 1);
        renderSplitLines();
    }
}

// Update totals display
function updateSplitTotals() {
    const totalAllocated = splitModalState.lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
    splitModalState.totalAmount = totalAllocated;

    const allocatedEl = document.getElementById('split-allocated-amount');
    const validationEl = document.getElementById('split-validation-message');

    if (allocatedEl) {
        allocatedEl.textContent = '$' + totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    if (validationEl) {
        const validLines = splitModalState.lines.filter(l => l.client_id && l.amount > 0).length;
        if (validLines >= 2 && totalAllocated > 0) {
            validationEl.style.color = '#22c55e';
            validationEl.textContent = `${validLines} clients selected`;
        } else {
            validationEl.style.color = '#f59e0b';
            validationEl.textContent = 'Select at least 2 clients with amounts';
        }
    }
}

// Submit split transaction
async function submitSplitTransaction(event) {
    if (event) event.preventDefault();

    // Validate
    const validLines = splitModalState.lines.filter(l => l.client_id && l.amount > 0);
    if (validLines.length < 2) {
        alert('Please select at least 2 clients with amounts');
        return;
    }

    const checkNumber = document.getElementById('split-check-number')?.value;
    const transactionDate = document.getElementById('split-date')?.value;
    const transactionType = document.getElementById('split-type')?.value;
    const payee = document.getElementById('split-payee')?.value;
    const memo = document.getElementById('split-memo')?.value;

    if (!transactionDate) {
        alert('Please select a date');
        return;
    }

    if (!payee) {
        alert('Please enter a payee');
        return;
    }

    if (splitModalState.type === 'check' && !checkNumber) {
        alert('Please enter a check number');
        return;
    }

    const submitBtn = document.getElementById('split-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        const payload = {
            user_id: getSplitModalUserId(),
            transaction_type: transactionType || 'disbursement',
            transaction_date: transactionDate,
            check_number: checkNumber || null,
            payee: payee,
            memo: memo || null,
            status: 'pending',
            splits: validLines.map(line => ({
                client_id: parseInt(line.client_id),
                amount: parseFloat(line.amount),
                description: line.description || memo || ''
            }))
        };

        const response = await fetch('/expensetracker/api/v1/trust/split-transaction.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            closeSplitTransactionModal();

            // Show success message
            if (typeof showToast === 'function') {
                showToast(`Split ${splitModalState.type} created: $${splitModalState.totalAmount.toFixed(2)} across ${validLines.length} clients`, 'success');
            } else {
                alert(`Split ${splitModalState.type} created successfully!`);
            }

            // Refresh the page data if available
            if (typeof loadTrustClients === 'function') {
                loadTrustClients(true);
            }
            if (typeof loadIoltaTransactions === 'function') {
                loadIoltaTransactions();
            }
        } else {
            throw new Error(data.message || 'Failed to create split transaction');
        }
    } catch (error) {
        console.error('Split transaction error:', error);
        alert('Error: ' + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Split Check';
        }
    }
}

// Escape HTML helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Split dropdown toggle
function toggleSplitDropdown() {
    const menu = document.getElementById('split-dropdown-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function closeSplitDropdown() {
    const menu = document.getElementById('split-dropdown-menu');
    if (menu) menu.style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('split-dropdown-menu');
    const btn = document.getElementById('split-dropdown-btn');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Export for global access
window.openSplitTransactionModal = openSplitTransactionModal;
window.closeSplitTransactionModal = closeSplitTransactionModal;
window.addSplitLine = addSplitLine;
window.removeSplitLine = removeSplitLine;
window.showSplitClientDropdown = showSplitClientDropdown;
window.filterSplitClients = filterSplitClients;
window.selectSplitClient = selectSplitClient;
window.updateSplitLineAmount = updateSplitLineAmount;
window.updateSplitLineDescription = updateSplitLineDescription;
window.submitSplitTransaction = submitSplitTransaction;
window.toggleSplitDropdown = toggleSplitDropdown;
window.closeSplitDropdown = closeSplitDropdown;
