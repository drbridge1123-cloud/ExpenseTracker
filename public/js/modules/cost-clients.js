/**
 * Cost Client Integration - Adds trust_clients support to Cost module
 */

window.getCostUserId = function() {
    return (typeof state !== 'undefined' && state.currentUser) || localStorage.getItem('currentUser') || '1';
};

// Note: loadCostClients cache function is defined in cost.js and exposed as window.loadCostClients

window.loadCostOperations = async function() {
    try {
        // Use cached loadCostClients from cost.js if available
        if (typeof window.loadCostClients === 'function') {
            costState.clients = await window.loadCostClients();
        } else {
            // Fallback
            const result = await apiGet('/trust/clients.php', { user_id: getCostUserId() });
            costState.clients = (result.success && result.data) ? (result.data.clients || []) : [];
        }
        costState.currentTab = costState.currentTab || 'receive';
        renderCostDepositClientSidebar();
    } catch (error) {
        console.error('Error loading cost operations:', error);
        if (typeof showToast === 'function') showToast('Error loading cost operations', 'error');
    }
};

window.switchCostOperationsTab = function(tabName) {
    costState.currentTab = tabName;
    costState.selectedClient = null;
    document.querySelectorAll('#page-cost-operations .ops-tab').forEach(function(btn) {
        var isActive = btn.dataset.tab === tabName;
        btn.style.background = isActive ? '#059669' : 'white';
        btn.style.color = isActive ? 'white' : '#64748b';
        btn.style.border = isActive ? 'none' : '1px solid #e2e8f0';
    });
    var receiveTab = document.getElementById('cost-ops-tab-receive');
    var disburseTab = document.getElementById('cost-ops-tab-disburse');
    if (receiveTab) receiveTab.style.display = tabName === 'receive' ? 'flex' : 'none';
    if (disburseTab) disburseTab.style.display = tabName === 'disburse' ? 'flex' : 'none';
    if (tabName === 'receive') { renderCostDepositClientSidebar(); } else { renderCostDisburseClientSidebar(); }
};

window.renderCostDepositClientSidebar = function() {
    var container = document.getElementById('cost-deposit-clients');
    if (!container) return;
    if (!costState.clients || costState.clients.length === 0) {
        container.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #64748b;"><p style="font-size: 13px;">No clients yet</p><button onclick="openCostClientModal()" style="margin-top: 12px; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">+ Add Client</button></div>';
        return;
    }
    var html = '';
    costState.clients.forEach(function(client) {
        var isSelected = costState.selectedClient && costState.selectedClient.id === client.id;
        var caseNum = client.case_number || '-';
        html += '<div class="cost-client-item' + (isSelected ? ' selected' : '') + '" onclick="selectCostClient(' + client.id + ', \'receive\')" style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ' + (isSelected ? '#f0fdf4' : 'white') + ';"><div style="font-weight: 600; font-size: 14px; color: #1e293b;">' + caseNum + '</div><div style="font-size: 13px; color: #64748b; margin-top: 2px;">' + client.client_name + '</div></div>';
    });
    html += '<div style="padding: 12px 16px; border-top: 1px solid #e2e8f0;"><button onclick="openCostClientModal()" style="width: 100%; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">+ Add Client</button></div>';
    container.innerHTML = html;
};

window.renderCostDisburseClientSidebar = function() {
    var container = document.getElementById('cost-disburse-clients');
    if (!container) return;
    if (!costState.clients || costState.clients.length === 0) {
        container.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #64748b;"><p style="font-size: 13px;">No clients yet</p><button onclick="openCostClientModal()" style="margin-top: 12px; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">+ Add Client</button></div>';
        return;
    }
    var html = '';
    costState.clients.forEach(function(client) {
        var isSelected = costState.selectedClient && costState.selectedClient.id === client.id;
        var caseNum = client.case_number || '-';
        html += '<div class="cost-client-item' + (isSelected ? ' selected' : '') + '" onclick="selectCostClient(' + client.id + ', \'disburse\')" style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ' + (isSelected ? '#f0fdf4' : 'white') + ';"><div style="font-weight: 600; font-size: 14px; color: #1e293b;">' + caseNum + '</div><div style="font-size: 13px; color: #64748b; margin-top: 2px;">' + client.client_name + '</div></div>';
    });
    html += '<div style="padding: 12px 16px; border-top: 1px solid #e2e8f0;"><button onclick="openCostClientModal()" style="width: 100%; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">+ Add Client</button></div>';
    container.innerHTML = html;
};

window.renderCostPayoutClientSidebar = window.renderCostDisburseClientSidebar;

window.selectCostClient = function(clientId, tabType) {
    costState.selectedClient = costState.clients.find(function(c) { return c.id === clientId; });
    if (tabType === 'receive' || tabType === 'deposit') {
        renderCostDepositClientSidebar();
        renderCostDepositForm();
    } else {
        renderCostDisburseClientSidebar();
        renderCostDisburseForm();
    }
};

window.renderCostDepositForm = function() {
    var formContainer = document.getElementById('cost-deposit-form-container');
    if (!formContainer) return;
    if (!costState.selectedClient) {
        formContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;"><p>Select a client to record a deposit</p></div>';
        return;
    }
    var client = costState.selectedClient;
    var today = new Date().toISOString().split('T')[0];
    formContainer.innerHTML = `
        <div style="max-width: 500px;">
            <h3 style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: #1e293b;">
                Receive Funds: ${client.case_number || ''} ${client.client_name}
            </h3>
            <form id="cost-deposit-form" onsubmit="submitCostDeposit(event)">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                    <input type="date" id="cost-deposit-date" value="${today}" required
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Amount *</label>
                    <input type="number" id="cost-deposit-amount" step="0.01" min="0.01" required placeholder="0.00"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Description</label>
                    <input type="text" id="cost-deposit-description" placeholder="e.g., Retainer deposit"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Reference / Check #</label>
                    <input type="text" id="cost-deposit-reference" placeholder="Optional"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-top: 24px;">
                    <button type="submit" style="width: 100%; padding: 12px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        Record Deposit
                    </button>
                </div>
            </form>
        </div>
    `;
};

window.renderCostDisburseForm = function() {
    var formContainer = document.getElementById('cost-disburse-form-container');
    if (!formContainer) return;
    if (!costState.selectedClient) {
        formContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;"><p>Select a client to record a disbursement</p></div>';
        return;
    }
    var client = costState.selectedClient;
    var today = new Date().toISOString().split('T')[0];
    formContainer.innerHTML = `
        <div style="max-width: 500px;">
            <h3 style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: #1e293b;">
                Payout: ${client.case_number || ''} ${client.client_name}
            </h3>
            <form id="cost-disburse-form" onsubmit="submitCostDisburse(event)">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Date *</label>
                    <input type="date" id="cost-disburse-date" value="${today}" required
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Amount *</label>
                    <input type="number" id="cost-disburse-amount" step="0.01" min="0.01" required placeholder="0.00"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Payee *</label>
                    <input type="text" id="cost-disburse-payee" required placeholder="e.g., Medical Records Inc."
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Description</label>
                    <input type="text" id="cost-disburse-description" placeholder="e.g., Medical records request"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Check # / Reference</label>
                    <input type="text" id="cost-disburse-reference" placeholder="Optional"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-top: 24px;">
                    <button type="submit" style="width: 100%; padding: 12px 20px; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        Record Payout
                    </button>
                </div>
            </form>
        </div>
    `;
};

window.renderCostPayoutForm = window.renderCostDisburseForm;

console.log('Cost-clients integration loaded');

window.openCostClientModal = function(client) {
    var modal = document.getElementById('cost-client-modal');
    if (modal) modal.remove();
    var isEdit = !!client;
    var title = isEdit ? 'Edit Client' : 'Add New Client';
    modal = document.createElement('div');
    modal.id = 'cost-client-modal';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center; padding: 20px;';
    var clientId = client ? client.id : '';
    var caseNumber = client ? (client.case_number || '') : '';
    var clientName = client ? (client.client_name || '') : '';
    var displayName = client ? (client.display_name || '') : '';
    var email = client ? (client.contact_email || '') : '';
    var phone = client ? (client.contact_phone || '') : '';
    var address = client ? (client.address || '') : '';
    var notes = client ? (client.notes || '') : '';

    // Parse address into components if available
    var street = '', street2 = '', city = '', stateCode = '', zip = '';
    if (address) {
        var parts = address.split(',').map(function(p) { return p.trim(); });
        if (parts.length >= 1) street = parts[0] || '';
        if (parts.length >= 2) street2 = parts[1] || '';
        if (parts.length >= 3) city = parts[2] || '';
        if (parts.length >= 4) {
            var stateZip = parts[3].trim().split(' ');
            stateCode = stateZip[0] || '';
            zip = stateZip[1] || '';
        }
    }

    // Input style for cleaner look
    var inputStyle = 'width: 100%; padding: 11px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #fff; transition: all 0.15s ease; outline: none;';
    var inputFocus = "this.style.borderColor='#6366f1'; this.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)'";
    var inputBlur = "this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'";

    modal.innerHTML = `
        <div style="width: 480px; max-width: 95%; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
            <div style="padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 17px; font-weight: 600; color: #1e293b;">${title}</h2>
                <button onclick="closeCostClientModal()" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: none; border-radius: 6px; font-size: 16px; color: #64748b; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">&times;</button>
            </div>

            <form id="cost-client-form" onsubmit="saveCostClient(event)" style="padding: 20px 24px;">
                <input type="hidden" id="cost-client-id" value="${clientId}">

                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Name <span style="color: #ef4444;">*</span></label>
                        <input type="text" id="cost-client-name" required value="${clientName}" placeholder="Full name"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Case #</label>
                        <input type="text" id="cost-client-case" value="${caseNumber}" placeholder="Case number"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Display Name <span style="color: #94a3b8; font-weight: 400;">(for checks)</span></label>
                    <input type="text" id="cost-client-display-name" value="${displayName}" placeholder="Name as printed on checks"
                           style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Email</label>
                        <input type="email" id="cost-client-email" value="${email}" placeholder="email@example.com"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone</label>
                        <input type="tel" id="cost-client-phone" value="${phone}" placeholder="(555) 123-4567"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 16px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                    <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Address</label>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="cost-client-street" value="${street}" placeholder="Street address"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="cost-client-street2" value="${street2}" placeholder="Suite, unit, building (optional)"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 10px;">
                        <input type="text" id="cost-client-city" value="${city}" placeholder="City"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="cost-client-state" value="${stateCode}" placeholder="State" maxlength="2"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="cost-client-zip" value="${zip}" placeholder="Zip"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Notes</label>
                    <textarea id="cost-client-notes" rows="2" placeholder="Additional notes (optional)"
                              style="${inputStyle} resize: vertical; min-height: 60px;" onfocus="${inputFocus}" onblur="${inputBlur}">${notes}</textarea>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                    <button type="button" onclick="closeCostClientModal()"
                            style="padding: 10px 20px; background: #fff; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
                            onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0'">Cancel</button>
                    <button type="submit"
                            style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; box-shadow: 0 1px 2px rgba(99,102,241,0.2);"
                            onmouseover="this.style.background='#4f46e5'; this.style.boxShadow='0 2px 4px rgba(99,102,241,0.3)'" onmouseout="this.style.background='#6366f1'; this.style.boxShadow='0 1px 2px rgba(99,102,241,0.2)'">Save Client</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeCostClientModal = function() {
    var modal = document.getElementById('cost-client-modal');
    if (modal) modal.remove();
};

window.saveCostClient = async function(event) {
    event.preventDefault();
    var id = document.getElementById('cost-client-id').value;

    // Build address from components
    var street = document.getElementById('cost-client-street')?.value.trim() || '';
    var street2 = document.getElementById('cost-client-street2')?.value.trim() || '';
    var city = document.getElementById('cost-client-city')?.value.trim() || '';
    var stateCode = document.getElementById('cost-client-state')?.value.trim() || '';
    var zip = document.getElementById('cost-client-zip')?.value.trim() || '';

    var address = '';
    if (street) address += street;
    if (street2) address += (address ? ', ' : '') + street2;
    if (city) address += (address ? ', ' : '') + city;
    if (stateCode) address += (address ? ', ' : '') + stateCode;
    if (zip) address += (address ? ' ' : '') + zip;

    var data = {
        user_id: getCostUserId(),
        case_number: document.getElementById('cost-client-case').value,
        client_name: document.getElementById('cost-client-name').value,
        display_name: document.getElementById('cost-client-display-name')?.value || null,
        contact_email: document.getElementById('cost-client-email').value,
        contact_phone: document.getElementById('cost-client-phone').value,
        address: address || null,
        notes: document.getElementById('cost-client-notes').value
    };
    try {
        var result;
        if (id) { data.id = id; result = await apiPut('/trust/clients.php', data); }
        else { result = await apiPost('/trust/clients.php', data); }
        if (result.success) {
            closeCostClientModal();
            await loadCostClients();
            if (costState.currentTab === 'deposit') { renderCostDepositClientSidebar(); }
            else { renderCostPayoutClientSidebar(); }
            if (typeof showToast === 'function') { showToast(id ? 'Client updated' : 'Client added', 'success'); }
        } else { alert(result.message || 'Error saving client'); }
    } catch (error) { console.error('Error saving client:', error); alert('Error saving client'); }
};

// Submit Deposit form
window.submitCostDeposit = async function(event) {
    event.preventDefault();
    if (!costState.selectedClient) {
        alert('Please select a client first');
        return;
    }

    var data = {
        user_id: getCostUserId(),
        client_id: costState.selectedClient.id,
        transaction_type: 'deposit',
        transaction_date: document.getElementById('cost-deposit-date').value,
        amount: parseFloat(document.getElementById('cost-deposit-amount').value),
        description: document.getElementById('cost-deposit-description').value || 'Deposit',
        reference_number: document.getElementById('cost-deposit-reference').value || null
    };

    try {
        var result = await apiPost('/cost/transactions.php', data);
        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('Deposit recorded successfully', 'success');
            }
            // Clear form
            document.getElementById('cost-deposit-amount').value = '';
            document.getElementById('cost-deposit-description').value = '';
            document.getElementById('cost-deposit-reference').value = '';
        } else {
            alert(result.message || 'Error recording deposit');
        }
    } catch (error) {
        console.error('Error recording deposit:', error);
        alert('Error recording deposit');
    }
};

// Submit Disburse form
window.submitCostDisburse = async function(event) {
    event.preventDefault();
    if (!costState.selectedClient) {
        alert('Please select a client first');
        return;
    }

    var data = {
        user_id: getCostUserId(),
        client_id: costState.selectedClient.id,
        transaction_type: 'disbursement',
        transaction_date: document.getElementById('cost-disburse-date').value,
        amount: -Math.abs(parseFloat(document.getElementById('cost-disburse-amount').value)), // Negative for disbursement
        payee: document.getElementById('cost-disburse-payee').value,
        description: document.getElementById('cost-disburse-description').value || 'Disbursement',
        reference_number: document.getElementById('cost-disburse-reference').value || null
    };

    try {
        var result = await apiPost('/cost/transactions.php', data);
        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('Payout recorded successfully', 'success');
            }
            // Clear form
            document.getElementById('cost-disburse-amount').value = '';
            document.getElementById('cost-disburse-payee').value = '';
            document.getElementById('cost-disburse-description').value = '';
            document.getElementById('cost-disburse-reference').value = '';
        } else {
            alert(result.message || 'Error recording payout');
        }
    } catch (error) {
        console.error('Error recording payout:', error);
        alert('Error recording payout');
    }
};
