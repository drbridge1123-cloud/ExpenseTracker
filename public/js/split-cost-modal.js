/**
 * Split Cost Transaction Modal
 * Split one cost across multiple clients
 */

// State for cost split modal
const costSplitModalState = {
    totalAmount: 0,
    lines: [
        { client_id: null, client_name: '', amount: 0, description: '' },
        { client_id: null, client_name: '', amount: 0, description: '' }
    ],
    clients: [],
    accounts: []
};

function getCostSplitUserId() {
    return window.getCurrentUserId ? window.getCurrentUserId() : 1;
}

function openCostSplitModal() {
    // Reset state
    costSplitModalState.totalAmount = 0;
    costSplitModalState.lines = [
        { client_id: null, client_name: '', amount: 0, description: '' },
        { client_id: null, client_name: '', amount: 0, description: '' }
    ];

    // Create modal if not exists
    let modal = document.getElementById('cost-split-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cost-split-modal';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; justify-content: center; align-items: center;';
        modal.innerHTML = getCostSplitModalHtml();
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    loadCostSplitData();
    renderCostSplitLines();

    // Set default date
    const dateInput = document.getElementById('cost-split-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

function closeCostSplitModal() {
    const modal = document.getElementById('cost-split-modal');
    if (modal) modal.style.display = 'none';
}

function getCostSplitModalHtml() {
    return `
        <div style="width: 700px; max-width: 95%; max-height: 90vh; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
            <!-- Header -->
            <div style="padding: 20px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 24px;">&#128176;</span>
                        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: white;">Split Cost</h2>
                    </div>
                    <button onclick="closeCostSplitModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
                </div>
            </div>

            <!-- Body -->
            <div style="flex: 1; overflow-y: auto; padding: 24px;">
                <form id="cost-split-form" onsubmit="submitCostSplit(event)">
                    <!-- Top row: Account, Date -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Cost Account *</label>
                            <select id="cost-split-account" required style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                                <option value="">Select Account</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Date *</label>
                            <input type="date" id="cost-split-date" required style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Description and Total -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Description *</label>
                            <input type="text" id="cost-split-description" required placeholder="e.g., Court Filing Fee" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Total Amount *</label>
                            <input type="number" id="cost-split-total" required step="0.01" min="0.01" placeholder="0.00"
                                   oninput="updateCostSplitTotal(this.value)"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; text-align: right;">
                        </div>
                    </div>

                    <!-- Payee and Reference -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Payee</label>
                            <input type="text" id="cost-split-payee" placeholder="Payee name (optional)" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Reference #</label>
                            <input type="text" id="cost-split-ref" placeholder="Reference # (optional)" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Split Lines Section -->
                    <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                        <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Client Split</h3>
                            <button type="button" onclick="addCostSplitLine()"
                                    style="padding: 6px 12px; background: #059669; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">
                                + Add Line
                            </button>
                        </div>

                        <!-- Split Lines Table -->
                        <div id="cost-split-lines" style="max-height: 250px; overflow-y: auto;">
                            <!-- Lines rendered dynamically -->
                        </div>

                        <!-- Totals Row -->
                        <div style="padding: 12px 16px; background: #f1f5f9; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
                            <div>
                                <span style="font-size: 13px; color: #64748b;">Allocated:</span>
                                <span id="cost-split-allocated" style="font-size: 15px; font-weight: 700; color: #1e293b; margin-left: 8px;">$0.00</span>
                            </div>
                            <div>
                                <span style="font-size: 13px; color: #64748b;">Remaining:</span>
                                <span id="cost-split-remaining" style="font-size: 15px; font-weight: 700; margin-left: 8px;">$0.00</span>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Footer -->
            <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeCostSplitModal()"
                        style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
                    Cancel
                </button>
                <button type="button" onclick="submitCostSplit(event)" id="cost-split-submit-btn"
                        style="padding: 10px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Save Split
                </button>
            </div>
        </div>
    `;
}

async function loadCostSplitData() {
    try {
        const userId = getCostSplitUserId();

        // Load accounts and clients in parallel
        const [accountsResult, clientsResult] = await Promise.all([
            apiGet(`/cost/accounts.php?user_id=${userId}`),
            apiGet(`/trust/clients.php?user_id=${userId}`)
        ]);

        // Populate accounts dropdown
        const accountSelect = document.getElementById('cost-split-account');
        if (accountSelect && accountsResult.success) {
            const accounts = accountsResult.data.accounts || [];
            costSplitModalState.accounts = accounts;

            accountSelect.innerHTML = '<option value="">Select Account</option>';
            accounts.forEach(acc => {
                accountSelect.innerHTML += `<option value="${acc.id}">${acc.account_name}</option>`;
            });
        }

        // Store clients for split lines
        if (clientsResult.success) {
            costSplitModalState.clients = (clientsResult.data.clients || []).filter(c =>
                c.client_name !== 'General/Unassigned'
            );
        }
    } catch (error) {
        console.error('Error loading cost split data:', error);
    }
}

function renderCostSplitLines() {
    const container = document.getElementById('cost-split-lines');
    if (!container) return;

    let html = '';
    costSplitModalState.lines.forEach((line, index) => {
        html += `
            <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: 2fr 100px 1.5fr 40px; gap: 12px; align-items: center;">
                <div style="position: relative;">
                    <input type="text" placeholder="Select client..."
                           value="${escapeHtml(line.client_name)}"
                           data-cost-index="${index}"
                           onfocus="showCostClientDropdown(${index})"
                           oninput="filterCostClients(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                    <div id="cost-client-dropdown-${index}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 1000;">
                    </div>
                </div>
                <div>
                    <input type="number" placeholder="0.00" step="0.01" min="0"
                           value="${line.amount || ''}"
                           oninput="updateCostSplitAmount(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box; text-align: right;">
                </div>
                <div>
                    <input type="text" placeholder="Description (optional)"
                           value="${escapeHtml(line.description)}"
                           oninput="updateCostSplitDescription(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                </div>
                <div>
                    <button type="button" onclick="removeCostSplitLine(${index})"
                            style="width: 28px; height: 28px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;"
                            ${costSplitModalState.lines.length <= 2 ? 'disabled' : ''}>
                        &times;
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateCostSplitTotals();
}

function showCostClientDropdown(index) {
    // Hide all other dropdowns
    document.querySelectorAll('[id^="cost-client-dropdown-"]').forEach(d => d.style.display = 'none');

    const dropdown = document.getElementById(`cost-client-dropdown-${index}`);
    if (dropdown) {
        dropdown.style.display = 'block';
        renderCostClientList(index, costSplitModalState.clients);
    }
}

function filterCostClients(index, query) {
    const q = query.toLowerCase();
    const filtered = costSplitModalState.clients.filter(c =>
        c.client_name.toLowerCase().includes(q) ||
        (c.case_number && c.case_number.toLowerCase().includes(q))
    );
    renderCostClientList(index, filtered);
}

function renderCostClientList(index, clients) {
    const dropdown = document.getElementById(`cost-client-dropdown-${index}`);
    if (!dropdown) return;

    if (!clients || clients.length === 0) {
        dropdown.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 13px;">No clients found</div>';
        return;
    }

    dropdown.innerHTML = clients.map(client => `
        <div onclick="selectCostClient(${index}, ${client.id}, '${escapeHtml(client.client_name)}')"
             style="padding: 10px 12px; cursor: pointer; font-size: 13px; transition: background 0.15s;"
             onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">
            <div style="font-weight: 500;">${escapeHtml(client.client_name)}</div>
            ${client.case_number ? `<div style="font-size: 11px; color: #64748b;">${escapeHtml(client.case_number)}</div>` : ''}
        </div>
    `).join('');
}

function selectCostClient(index, clientId, clientName) {
    costSplitModalState.lines[index].client_id = clientId;
    costSplitModalState.lines[index].client_name = clientName;

    // Update input and hide dropdown
    const input = document.querySelector(`[data-cost-index="${index}"]`);
    if (input) input.value = clientName;

    const dropdown = document.getElementById(`cost-client-dropdown-${index}`);
    if (dropdown) dropdown.style.display = 'none';
}

function updateCostSplitTotal(value) {
    costSplitModalState.totalAmount = parseFloat(value) || 0;
    updateCostSplitTotals();
}

function updateCostSplitAmount(index, value) {
    costSplitModalState.lines[index].amount = parseFloat(value) || 0;
    updateCostSplitTotals();
}

function updateCostSplitDescription(index, value) {
    costSplitModalState.lines[index].description = value;
}

function addCostSplitLine() {
    costSplitModalState.lines.push({ client_id: null, client_name: '', amount: 0, description: '' });
    renderCostSplitLines();
}

function removeCostSplitLine(index) {
    if (costSplitModalState.lines.length > 2) {
        costSplitModalState.lines.splice(index, 1);
        renderCostSplitLines();
    }
}

function updateCostSplitTotals() {
    const allocated = costSplitModalState.lines.reduce((sum, line) => sum + (line.amount || 0), 0);
    const remaining = costSplitModalState.totalAmount - allocated;

    const allocatedEl = document.getElementById('cost-split-allocated');
    const remainingEl = document.getElementById('cost-split-remaining');

    if (allocatedEl) {
        allocatedEl.textContent = '$' + allocated.toFixed(2);
    }

    if (remainingEl) {
        remainingEl.textContent = '$' + remaining.toFixed(2);
        remainingEl.style.color = Math.abs(remaining) < 0.01 ? '#10b981' : '#ef4444';
    }
}

async function submitCostSplit(event) {
    if (event) event.preventDefault();

    const submitBtn = document.getElementById('cost-split-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        // Get form values
        const accountId = document.getElementById('cost-split-account')?.value;
        const date = document.getElementById('cost-split-date')?.value;
        const description = document.getElementById('cost-split-description')?.value;
        const totalAmount = parseFloat(document.getElementById('cost-split-total')?.value) || 0;
        const payee = document.getElementById('cost-split-payee')?.value;
        const referenceNumber = document.getElementById('cost-split-ref')?.value;

        // Validate
        if (!accountId) throw new Error('Please select an account');
        if (!date) throw new Error('Please enter a date');
        if (!description) throw new Error('Please enter a description');
        if (totalAmount <= 0) throw new Error('Please enter a valid total amount');

        // Validate splits
        const validLines = costSplitModalState.lines.filter(l => l.client_id && l.amount > 0);
        if (validLines.length < 2) throw new Error('At least 2 valid split lines are required');

        const splitTotal = validLines.reduce((sum, l) => sum + l.amount, 0);
        if (Math.abs(splitTotal - totalAmount) > 0.01) {
            throw new Error(`Split amounts ($${splitTotal.toFixed(2)}) must equal total ($${totalAmount.toFixed(2)})`);
        }

        // Prepare data
        const data = {
            user_id: getCostSplitUserId(),
            account_id: parseInt(accountId),
            transaction_date: date,
            transaction_type: 'debit',
            description: description,
            total_amount: totalAmount,
            payee: payee || null,
            reference_number: referenceNumber || null,
            splits: validLines.map(l => ({
                client_id: l.client_id,
                amount: l.amount,
                description: l.description || description
            }))
        };

        const result = await apiPost('/cost/split-transaction.php', data);

        if (result.success) {
            closeCostSplitModal();

            if (typeof showToast === 'function') {
                showToast(`Split cost created: $${totalAmount.toFixed(2)} across ${validLines.length} clients`, 'success');
            }

            // Refresh cost transactions list if on cost page
            if (typeof loadCostTransactions === 'function') {
                loadCostTransactions();
            }
            if (typeof loadCostPage === 'function') {
                loadCostPage();
            }
        } else {
            throw new Error(result.message || 'Failed to create split cost');
        }
    } catch (error) {
        console.error('Cost split error:', error);
        alert(error.message || 'Error creating split cost');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Split';
        }
    }
}

// Hide dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('[data-cost-index]') && !e.target.closest('[id^="cost-client-dropdown-"]')) {
        document.querySelectorAll('[id^="cost-client-dropdown-"]').forEach(d => d.style.display = 'none');
    }
});

// Local escapeHtml helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export for global access
window.openCostSplitModal = openCostSplitModal;
window.closeCostSplitModal = closeCostSplitModal;
window.addCostSplitLine = addCostSplitLine;
window.removeCostSplitLine = removeCostSplitLine;
window.showCostClientDropdown = showCostClientDropdown;
window.filterCostClients = filterCostClients;
window.selectCostClient = selectCostClient;
window.updateCostSplitTotal = updateCostSplitTotal;
window.updateCostSplitAmount = updateCostSplitAmount;
window.updateCostSplitDescription = updateCostSplitDescription;
window.submitCostSplit = submitCostSplit;
