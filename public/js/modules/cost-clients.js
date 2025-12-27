/**
 * Cost Client Integration - Adds trust_clients support to Cost module
 */

window.getCostUserId = function() {
    return (typeof state !== 'undefined' && state.currentUser) || localStorage.getItem('currentUser') || '1';
};

window.loadCostClients = async function() {
    try {
        const result = await apiGet('/trust/clients.php', { user_id: getCostUserId() });
        costState.clients = (result.success && result.data) ? (result.data.clients || []) : [];
    } catch (e) {
        console.error('Error loading cost clients:', e);
        costState.clients = [];
    }
    return costState.clients;
};

window.loadCostOperations = async function() {
    try {
        await loadCostClients();
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
    var title = isEdit ? 'Edit Client' : 'Add Client';
    modal = document.createElement('div');
    modal.id = 'cost-client-modal';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; justify-content: center; align-items: center;';
    var clientId = client ? client.id : '';
    var caseNum = client ? (client.case_number || '') : '';
    var clientName = client ? (client.client_name || '') : '';
    var caseDesc = client ? (client.case_description || '') : '';
    var email = client ? (client.contact_email || '') : '';
    var phone = client ? (client.contact_phone || '') : '';
    var notes = client ? (client.notes || '') : '';
    modal.innerHTML = '<div style="width: 500px; max-width: 95%; background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden;"><div style="padding: 20px 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;"><div style="display: flex; justify-content: space-between; align-items: center;"><h3 style="margin: 0; font-size: 18px; font-weight: 600;">' + title + '</h3><button onclick="closeCostClientModal()" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 18px;">&times;</button></div></div><form id="cost-client-form" onsubmit="saveCostClient(event)" style="padding: 24px;"><input type="hidden" id="cost-client-id" value="' + clientId + '"><div style="margin-bottom: 16px;"><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Case Number</label><input type="text" id="cost-client-case-number" value="' + caseNum + '" placeholder="e.g., 202401" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;"></div><div style="margin-bottom: 16px;"><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Client Name *</label><input type="text" id="cost-client-name" required value="' + clientName + '" placeholder="e.g., Kim, Susan" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;"></div><div style="margin-bottom: 16px;"><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Case Description</label><input type="text" id="cost-client-case-desc" value="' + caseDesc + '" placeholder="e.g., Personal Injury" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;"></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;"><div><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Email</label><input type="email" id="cost-client-email" value="' + email + '" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;"></div><div><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Phone</label><input type="tel" id="cost-client-phone" value="' + phone + '" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;"></div></div><div style="margin-bottom: 16px;"><label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">Notes</label><textarea id="cost-client-notes" rows="2" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; resize: vertical;">' + notes + '</textarea></div><div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;"><button type="button" onclick="closeCostClientModal()" style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; cursor: pointer;">Cancel</button><button type="submit" style="padding: 10px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">' + (isEdit ? 'Save Changes' : 'Add Client') + '</button></div></form></div>';
    document.body.appendChild(modal);
};

window.closeCostClientModal = function() {
    var modal = document.getElementById('cost-client-modal');
    if (modal) modal.remove();
};

window.saveCostClient = async function(event) {
    event.preventDefault();
    var id = document.getElementById('cost-client-id').value;
    var data = {
        user_id: getCostUserId(),
        case_number: document.getElementById('cost-client-case-number').value,
        client_name: document.getElementById('cost-client-name').value,
        case_description: document.getElementById('cost-client-case-desc').value,
        contact_email: document.getElementById('cost-client-email').value,
        contact_phone: document.getElementById('cost-client-phone').value,
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
