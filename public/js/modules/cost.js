/**
 * Cost Account Module
 * Mirrors IOLTA structure for cost/reimbursement tracking
 */

// State management for cost module
const costState = {
    clients: [],
    ledgers: [],
    transactions: [],
    selectedClient: null,
    selectedLedger: null,
    currentTab: 'receive'
};

// =====================================================
// Cost Client Ledger Page
// =====================================================

async function loadCostClientLedgerPage() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // For now, show placeholder - will connect to cost API later
        const container = document.getElementById('cost-ledger-transactions-container');
        if (container) {
            container.innerHTML = `
                <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 40px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">Coming Soon</div>
                    <p style="color: #64748b;">Cost client ledger will be available once the backend is set up.</p>
                    <p style="color: #94a3b8; font-size: 13px; margin-top: 12px;">This will mirror the IOLTA client ledger functionality.</p>
                </div>
            `;
        }

        // Update stats
        document.getElementById('cost-ledger-total-balance').textContent = '$0.00';
        document.getElementById('cost-ledger-client-count').textContent = '0';
        document.getElementById('cost-ledger-tx-count').textContent = '0';

    } catch (error) {
        console.error('Error loading cost client ledger:', error);
        showToast('Error loading cost client ledger', 'error');
    }
}

function searchCostLedgerClients(term) {
    // Placeholder for client search
    console.log('Searching cost clients:', term);
}

function showCostLedgerClientDropdown() {
    // Placeholder
}

function clearCostLedgerFilter() {
    document.getElementById('cost-ledger-client-search').value = '';
    document.getElementById('cost-ledger-clear-filter').style.display = 'none';
    loadCostClientLedgerPage();
}

function openCostClientModal() {
    // Placeholder - will open modal to add cost client
    showToast('Cost client creation coming soon', 'info');
}

// =====================================================
// Cost Operations Page
// =====================================================

async function loadCostOperations() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        // Load placeholder for now
        renderCostDepositClientSidebar();

    } catch (error) {
        console.error('Error loading cost operations:', error);
        showToast('Error loading cost operations', 'error');
    }
}

function switchCostOperationsTab(tabName) {
    costState.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('#page-cost-operations .ops-tab').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.style.background = isActive ? '#059669' : 'white';
        btn.style.color = isActive ? 'white' : '#64748b';
        btn.style.border = isActive ? 'none' : '1px solid #e2e8f0';
    });

    // Show/hide tab content
    document.getElementById('cost-ops-tab-receive').style.display = tabName === 'receive' ? 'flex' : 'none';
    document.getElementById('cost-ops-tab-disburse').style.display = tabName === 'disburse' ? 'flex' : 'none';

    // Load appropriate content
    if (tabName === 'receive') {
        renderCostDepositClientSidebar();
    } else {
        renderCostDisburseClientSidebar();
    }
}

function renderCostDepositClientSidebar() {
    const container = document.getElementById('cost-deposit-clients');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #64748b;">
            <p style="font-size: 13px;">No clients yet</p>
            <button onclick="openCostClientModal()" style="margin-top: 12px; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                + Add Client
            </button>
        </div>
    `;
}

function renderCostDisburseClientSidebar() {
    const container = document.getElementById('cost-disburse-clients');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #64748b;">
            <p style="font-size: 13px;">No clients yet</p>
            <button onclick="openCostClientModal()" style="margin-top: 12px; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                + Add Client
            </button>
        </div>
    `;
}

// =====================================================
// Other Cost Pages (Placeholders)
// =====================================================

async function loadCostReconcile() {
    // Placeholder - page already has "Coming Soon" message
    console.log('Cost reconcile page loaded');
}

async function loadCostDataManagement() {
    // Placeholder - page already has "Coming Soon" message
    console.log('Cost data management page loaded');
}

async function loadCostReports() {
    // Placeholder - page already has "Coming Soon" message
    console.log('Cost reports page loaded');
}

// =====================================================
// Global Exports
// =====================================================

window.costState = costState;
window.loadCostClientLedgerPage = loadCostClientLedgerPage;
window.searchCostLedgerClients = searchCostLedgerClients;
window.showCostLedgerClientDropdown = showCostLedgerClientDropdown;
window.clearCostLedgerFilter = clearCostLedgerFilter;
window.openCostClientModal = openCostClientModal;
window.loadCostOperations = loadCostOperations;
window.switchCostOperationsTab = switchCostOperationsTab;
window.renderCostDepositClientSidebar = renderCostDepositClientSidebar;
window.renderCostDisburseClientSidebar = renderCostDisburseClientSidebar;
window.loadCostReconcile = loadCostReconcile;
window.loadCostDataManagement = loadCostDataManagement;
window.loadCostReports = loadCostReports;
