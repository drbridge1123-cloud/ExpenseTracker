// =====================================================
// IOLTA Main Module
// Entry point and module integration
// =====================================================

// Initialize IOLTA when called
async function initIOLTA() {
    console.log('Initializing IOLTA module...');
    await IoltaUI.init();
    console.log('IOLTA module initialized');
}

// Load Client Ledger page
async function loadClientLedgerPage() {
    await IoltaUI.loadData();
    IoltaUI.renderClientSidebar();
    IoltaUI.renderTransactionList();
}

// Filter client list
function filterLedgerClientList(searchTerm) {
    IoltaUI.filterClients(searchTerm);
}

// Select client from sidebar
function selectLedgerClientFromSidebar(clientId) {
    IoltaUI.selectClient(clientId);
}

// Legacy compatibility functions
function renderLedgerClientSidebar() {
    IoltaUI.renderClientSidebar();
}

function renderClientLedger() {
    IoltaUI.renderTransactionList();
}

// Export global functions for HTML onclick handlers
window.initIOLTA = initIOLTA;
window.loadClientLedgerPage = loadClientLedgerPage;
window.filterLedgerClientList = filterLedgerClientList;
window.selectLedgerClientFromSidebar = selectLedgerClientFromSidebar;
window.renderLedgerClientSidebar = renderLedgerClientSidebar;
window.renderClientLedger = renderClientLedger;

// Additional exports from IoltaUI
window.toggleLedgerTxSelection = (txId, event) => IoltaUI.toggleTxSelection(txId, event);
window.clearLedgerSelection = () => IoltaUI.clearSelection();
