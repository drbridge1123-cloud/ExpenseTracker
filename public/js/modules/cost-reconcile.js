// =====================================================
// Cost Account Reconciliation Module
// Version: 20251225
// Based on IOLTA Reconcile pattern
// =====================================================
// QuickBooks-style Bank Reconciliation for Cost Accounts
// - Start new reconciliation with statement date/balance
// - Two-column view: Checks/Payments and Deposits
// - Toggle items as cleared
// - Import bank CSV for auto-matching
// - Save progress and complete reconciliation
// =====================================================

// State for cost reconciliation
let costReconcileState = {
    reconcileId: null,
    accountId: null,
    isActive: false,
    statementDate: null,
    statementEndingBalance: 0,
    beginningBalance: 0,
    checks: [],
    deposits: [],
    clearedIds: new Set(),
    clearedChecksTotal: 0,
    clearedDepositsTotal: 0
};

/**
 * Load Cost Reconciliation page (entry point)
 */
async function loadCostReconcile() {
    // Load cost data first
    await loadCostClientLedgerPage();

    const container = document.getElementById('page-cost-reconcile');
    if (!container) return;

    // Show start reconciliation form
    renderCostReconcileStartForm(container);
}

/**
 * Render the start reconciliation form
 */
function renderCostReconcileStartForm(container) {
    container.innerHTML = `
        <div style="max-width: 600px; margin: 40px auto; padding: 0 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
                <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                    <span style="font-size: 28px;">💰</span>
                </div>
                <h2 style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 0 0 8px;">Cost Account Reconciliation</h2>
                <p style="color: #64748b; margin: 0;">Match your book records with bank statement</p>
            </div>

            <!-- Form Card -->
            <div style="background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); padding: 32px;">
                <!-- Account Info -->
                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #059669; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">🏦</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #1e293b;">Cost Account</div>
                        <div style="font-size: 13px; color: #64748b;">Client Costs & Expenses</div>
                    </div>
                </div>

                <!-- Statement Date -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 8px;">Statement Date</label>
                    <input type="date" id="cost-recon-statement-date"
                           value="${new Date().toISOString().split('T')[0]}"
                           style="width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                </div>

                <!-- Statement Ending Balance -->
                <div style="margin-bottom: 28px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 8px;">Statement Ending Balance</label>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 16px;">$</span>
                        <input type="number" id="cost-recon-statement-balance" step="0.01" placeholder="0.00"
                               style="width: 100%; padding: 12px 16px 12px 32px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; box-sizing: border-box;">
                    </div>
                    <p style="font-size: 12px; color: #94a3b8; margin: 8px 0 0;">Enter the ending balance from your bank statement</p>
                </div>

                <!-- Buttons -->
                <div style="display: flex; gap: 12px;">
                    <button onclick="loadCostReconHistory()"
                            style="flex: 1; padding: 14px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer;">
                        View History
                    </button>
                    <button onclick="startCostReconciliation()"
                            style="flex: 2; padding: 14px 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">
                        Begin Reconciliation
                    </button>
                </div>
            </div>

            <!-- Recent Reconciliations -->
            <div id="cost-recon-history-section" style="margin-top: 32px;">
                <h3 style="font-size: 16px; font-weight: 600; color: #475569; margin-bottom: 16px;">Recent Reconciliations</h3>
                <div id="cost-recon-history-list" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="padding: 20px; text-align: center; color: #94a3b8;">Loading...</div>
                </div>
            </div>
        </div>
    `;

    // Load history
    loadCostReconHistoryList();
}

/**
 * Load reconciliation history list
 */
async function loadCostReconHistoryList() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const container = document.getElementById('cost-recon-history-list');
    if (!container) return;

    const result = await apiGet('/cost/reconcile.php', {
        user_id: userId,
        limit: 10
    });

    if (result.success && result.data.reconciliations?.length > 0) {
        container.innerHTML = result.data.reconciliations.map(rec => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1; ${rec.status === 'in_progress' ? 'cursor: pointer;' : ''}"
                     ${rec.status === 'in_progress' ? `onclick="continueCostReconciliation(${rec.id})" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"` : ''}>
                    <div style="font-weight: 500; color: #1e293b;">${formatDate(rec.statement_date)}</div>
                    <div style="font-size: 12px; color: #64748b;">
                        ${rec.cleared_checks_count || 0} checks, ${rec.cleared_deposits_count || 0} deposits
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: #1e293b;">${formatCurrency(rec.statement_ending_balance)}</div>
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${rec.status === 'completed' ? '#ecfdf5' : '#fef3c7'}; color: ${rec.status === 'completed' ? '#10b981' : '#f59e0b'};">
                            ${rec.status === 'completed' ? '✓ Completed' : 'In Progress'}
                        </span>
                    </div>
                    ${rec.status === 'in_progress' ? `
                        <div style="display: flex; gap: 4px;">
                            <button onclick="event.stopPropagation(); editCostReconciliation(${rec.id}, '${rec.statement_date}', ${rec.statement_ending_balance})"
                                    style="padding: 6px 10px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;"
                                    title="Edit">✏️</button>
                            <button onclick="event.stopPropagation(); deleteCostReconciliation(${rec.id})"
                                    style="padding: 6px 10px; background: #fef2f2; color: #ef4444; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;"
                                    title="Delete">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <div style="padding: 32px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
                <div>No reconciliations yet</div>
            </div>
        `;
    }
}

/**
 * Show reconciliation history (for button click)
 */
function loadCostReconHistory() {
    loadCostReconHistoryList();
    showToast('History loaded', 'success');
}

/**
 * Start a new Cost Account reconciliation
 */
async function startCostReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const statementDate = document.getElementById('cost-recon-statement-date')?.value;
    const statementBalance = parseFloat(document.getElementById('cost-recon-statement-balance')?.value || 0);

    if (!statementDate) {
        showToast('Please select a statement date', 'error');
        return;
    }

    if (!statementBalance && statementBalance !== 0) {
        showToast('Please enter the statement ending balance', 'error');
        return;
    }

    const result = await apiPost('/cost/reconcile.php', {
        action: 'start',
        user_id: userId,
        statement_date: statementDate,
        statement_ending_balance: statementBalance
    });

    if (result.success) {
        // Update state
        costReconcileState = {
            reconcileId: result.data.reconcile_id,
            accountId: null,
            statementDate: statementDate,
            statementEndingBalance: statementBalance,
            beginningBalance: result.data.beginning_balance || 0,
            checks: result.data.checks || [],
            deposits: result.data.deposits || [],
            clearedIds: new Set(),
            isActive: true
        };

        // Render reconciliation view
        renderCostReconciliationView();
        showToast('Reconciliation started', 'success');
    } else {
        showToast(result.message || 'Error starting reconciliation', 'error');
    }
}

/**
 * Continue an in-progress reconciliation
 */
async function continueCostReconciliation(reconcileId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiGet('/cost/reconcile.php', {
        user_id: userId,
        id: reconcileId
    });

    if (result.success && result.data) {
        const data = result.data;

        // Set up reconcile state
        costReconcileState = {
            reconcileId: data.id,
            isActive: true,
            statementDate: data.statement_date,
            statementEndingBalance: parseFloat(data.statement_ending_balance),
            beginningBalance: parseFloat(data.beginning_balance || 0),
            clearedIds: new Set(data.cleared_ids?.map(id => parseInt(id)) || []),
            checks: data.checks || [],
            deposits: data.deposits || []
        };

        // Calculate totals from cleared items
        let checksTotal = 0, depositsTotal = 0;
        costReconcileState.checks.forEach(c => {
            if (costReconcileState.clearedIds.has(c.id)) {
                checksTotal += Math.abs(parseFloat(c.amount));
            }
        });
        costReconcileState.deposits.forEach(d => {
            if (costReconcileState.clearedIds.has(d.id)) {
                depositsTotal += parseFloat(d.amount);
            }
        });

        costReconcileState.clearedChecksTotal = checksTotal;
        costReconcileState.clearedDepositsTotal = depositsTotal;

        // Render reconciliation view
        renderCostReconciliationView();
        showToast('Reconciliation resumed', 'success');
    } else {
        showToast(result.message || 'Failed to load reconciliation', 'error');
    }
}

/**
 * Render the main reconciliation view (QuickBooks style)
 */
function renderCostReconciliationView() {
    const container = document.getElementById('page-cost-reconcile');
    if (!container) return;

    container.innerHTML = `
        <div style="height: 100%; display: flex; flex-direction: column; background: #f8fafc;">
            <!-- Header -->
            <div style="background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">Cost Account Reconciliation</h2>
                        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                            Statement: ${formatDate(costReconcileState.statementDate)}
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button onclick="importCostBankStatementForMatch()" style="padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            📄 Import CSV
                        </button>
                        <button onclick="saveCostReconciliation()" style="padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            💾 Save for Later
                        </button>
                        <button onclick="leaveCostReconciliation()" style="padding: 10px 16px; background: #fef2f2; color: #ef4444; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            ✕ Leave
                        </button>
                    </div>
                </div>
            </div>

            <!-- Two Column Layout -->
            <div style="flex: 1; display: flex; overflow: hidden;">
                <!-- Left: Checks and Payments -->
                <div style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid #e2e8f0;">
                    <div style="padding: 16px 20px; background: #fef2f2; border-bottom: 1px solid #fecaca;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #991b1b;">Checks and Payments</span>
                            <span id="cost-recon-checks-summary" style="font-size: 13px; color: #64748b;">0 of ${costReconcileState.checks.length} cleared</span>
                        </div>
                    </div>
                    <div id="cost-recon-checks-list" style="flex: 1; overflow-y: auto; background: white;">
                        <!-- Checks will be rendered here -->
                    </div>
                    <div style="padding: 12px 20px; background: #fef2f2; border-top: 1px solid #fecaca;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500; color: #991b1b;">Cleared Total:</span>
                            <span id="cost-recon-checks-total" style="font-weight: 600; color: #991b1b;">$0.00</span>
                        </div>
                    </div>
                </div>

                <!-- Right: Deposits and Credits -->
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="padding: 16px 20px; background: #ecfdf5; border-bottom: 1px solid #a7f3d0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #065f46;">Deposits and Other Credits</span>
                            <span id="cost-recon-deposits-summary" style="font-size: 13px; color: #64748b;">0 of ${costReconcileState.deposits.length} cleared</span>
                        </div>
                    </div>
                    <div id="cost-recon-deposits-list" style="flex: 1; overflow-y: auto; background: white;">
                        <!-- Deposits will be rendered here -->
                    </div>
                    <div style="padding: 12px 20px; background: #ecfdf5; border-top: 1px solid #a7f3d0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500; color: #065f46;">Cleared Total:</span>
                            <span id="cost-recon-deposits-total" style="font-weight: 600; color: #065f46;">$0.00</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Summary -->
            <div style="background: white; border-top: 2px solid #e2e8f0; padding: 20px 24px;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 40px;">
                    <!-- Left side: Balance breakdown -->
                    <div style="flex: 1;">
                        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 6px 0; color: #64748b;">Beginning Balance</td>
                                <td style="padding: 6px 0; text-align: right; font-weight: 500;">${formatCurrency(costReconcileState.beginningBalance)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #10b981;">+ Cleared Deposits</td>
                                <td id="cost-summary-deposits" style="padding: 6px 0; text-align: right; font-weight: 500; color: #10b981;">$0.00</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #ef4444;">- Cleared Checks</td>
                                <td id="cost-summary-checks" style="padding: 6px 0; text-align: right; font-weight: 500; color: #ef4444;">$0.00</td>
                            </tr>
                            <tr style="border-top: 1px solid #e2e8f0;">
                                <td style="padding: 10px 0 6px; font-weight: 600;">Cleared Balance</td>
                                <td id="cost-summary-cleared" style="padding: 10px 0 6px; text-align: right; font-weight: 600;">$0.00</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b;">Statement Ending Balance</td>
                                <td style="padding: 6px 0; text-align: right; font-weight: 500;">${formatCurrency(costReconcileState.statementEndingBalance)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Right side: Difference and button -->
                    <div style="text-align: center;">
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">Difference</div>
                        <div id="cost-recon-difference" style="font-size: 32px; font-weight: 700; color: #ef4444; margin-bottom: 16px;">$0.00</div>
                        <button id="btn-cost-reconcile-now" onclick="completeCostReconciliation()" disabled
                                style="padding: 14px 32px; background: #d1d5db; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: not-allowed;">
                            Reconcile Now
                        </button>
                        <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">Difference must be $0.00</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render transactions
    renderCostReconcileTransactions();
}

/**
 * Render transactions in both columns
 */
function renderCostReconcileTransactions() {
    // Render checks
    const checksContainer = document.getElementById('cost-recon-checks-list');
    if (checksContainer) {
        if (costReconcileState.checks.length === 0) {
            checksContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
                    <div>No uncleared checks</div>
                </div>
            `;
        } else {
            checksContainer.innerHTML = costReconcileState.checks.map(tx => {
                const isCleared = costReconcileState.clearedIds.has(tx.id);
                const checkNum = tx.check_number || tx.reference_number?.replace(/[^0-9]/g, '') || '';
                return `
                    <div onclick="toggleCostReconcileItem(${tx.id})"
                         style="display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ${isCleared ? '#fef2f2' : 'white'};"
                         onmouseover="this.style.background='${isCleared ? '#fee2e2' : '#f8fafc'}'"
                         onmouseout="this.style.background='${isCleared ? '#fef2f2' : 'white'}'">
                        <div style="width: 24px; height: 24px; border: 2px solid ${isCleared ? '#ef4444' : '#d1d5db'}; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; background: ${isCleared ? '#ef4444' : 'white'};">
                            ${isCleared ? '<span style="color: white; font-size: 14px;">✓</span>' : ''}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${checkNum ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #64748b;">#${checkNum}</span>` : ''}
                                <span style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tx.payee || tx.vendor_name || tx.client_name || tx.description || 'Unknown')}</span>
                            </div>
                            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${formatDate(tx.transaction_date)}</div>
                        </div>
                        <div style="font-weight: 600; color: #ef4444; white-space: nowrap;">${formatCurrency(Math.abs(tx.amount))}</div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render deposits
    const depositsContainer = document.getElementById('cost-recon-deposits-list');
    if (depositsContainer) {
        if (costReconcileState.deposits.length === 0) {
            depositsContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
                    <div>No uncleared deposits</div>
                </div>
            `;
        } else {
            depositsContainer.innerHTML = costReconcileState.deposits.map(tx => {
                const isCleared = costReconcileState.clearedIds.has(tx.id);
                const refNum = tx.reference_number || '';
                return `
                    <div onclick="toggleCostReconcileItem(${tx.id})"
                         style="display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ${isCleared ? '#ecfdf5' : 'white'};"
                         onmouseover="this.style.background='${isCleared ? '#d1fae5' : '#f8fafc'}'"
                         onmouseout="this.style.background='${isCleared ? '#ecfdf5' : 'white'}'">
                        <div style="width: 24px; height: 24px; border: 2px solid ${isCleared ? '#10b981' : '#d1d5db'}; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; background: ${isCleared ? '#10b981' : 'white'};">
                            ${isCleared ? '<span style="color: white; font-size: 14px;">✓</span>' : ''}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${refNum ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #64748b;">${escapeHtml(refNum)}</span>` : ''}
                                <span style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tx.client_name || tx.description || 'Deposit')}</span>
                            </div>
                            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${formatDate(tx.transaction_date)}</div>
                        </div>
                        <div style="font-weight: 600; color: #10b981; white-space: nowrap;">${formatCurrency(tx.amount)}</div>
                    </div>
                `;
            }).join('');
        }
    }

    // Update summary
    updateCostReconcileSummary();
}

/**
 * Toggle item cleared status
 */
function toggleCostReconcileItem(transactionId) {
    if (costReconcileState.clearedIds.has(transactionId)) {
        costReconcileState.clearedIds.delete(transactionId);
    } else {
        costReconcileState.clearedIds.add(transactionId);
    }
    renderCostReconcileTransactions();
}

/**
 * Update reconciliation summary
 */
function updateCostReconcileSummary() {
    let clearedChecksTotal = 0;
    let clearedChecksCount = 0;
    let clearedDepositsTotal = 0;
    let clearedDepositsCount = 0;

    // Calculate cleared checks
    costReconcileState.checks.forEach(tx => {
        if (costReconcileState.clearedIds.has(tx.id)) {
            clearedChecksTotal += Math.abs(parseFloat(tx.amount));
            clearedChecksCount++;
        }
    });

    // Calculate cleared deposits
    costReconcileState.deposits.forEach(tx => {
        if (costReconcileState.clearedIds.has(tx.id)) {
            clearedDepositsTotal += parseFloat(tx.amount);
            clearedDepositsCount++;
        }
    });

    // Update displays
    const checksSummary = document.getElementById('cost-recon-checks-summary');
    const depositsSummary = document.getElementById('cost-recon-deposits-summary');
    const checksTotal = document.getElementById('cost-recon-checks-total');
    const depositsTotal = document.getElementById('cost-recon-deposits-total');

    if (checksSummary) checksSummary.textContent = `${clearedChecksCount} of ${costReconcileState.checks.length} cleared`;
    if (depositsSummary) depositsSummary.textContent = `${clearedDepositsCount} of ${costReconcileState.deposits.length} cleared`;
    if (checksTotal) checksTotal.textContent = formatCurrency(clearedChecksTotal);
    if (depositsTotal) depositsTotal.textContent = formatCurrency(clearedDepositsTotal);

    // Calculate cleared balance
    const clearedBalance = costReconcileState.beginningBalance + clearedDepositsTotal - clearedChecksTotal;
    const difference = costReconcileState.statementEndingBalance - clearedBalance;

    // Update summary section
    const summaryDeposits = document.getElementById('cost-summary-deposits');
    const summaryChecks = document.getElementById('cost-summary-checks');
    const summaryCleared = document.getElementById('cost-summary-cleared');

    if (summaryDeposits) summaryDeposits.textContent = formatCurrency(clearedDepositsTotal);
    if (summaryChecks) summaryChecks.textContent = formatCurrency(clearedChecksTotal);
    if (summaryCleared) summaryCleared.textContent = formatCurrency(clearedBalance);

    // Update difference
    const diffEl = document.getElementById('cost-recon-difference');
    const btnReconcile = document.getElementById('btn-cost-reconcile-now');

    if (diffEl) {
        diffEl.textContent = formatCurrency(Math.abs(difference));

        if (Math.abs(difference) < 0.01) {
            diffEl.style.color = '#10b981';
            if (btnReconcile) {
                btnReconcile.disabled = false;
                btnReconcile.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                btnReconcile.style.cursor = 'pointer';
            }
        } else {
            diffEl.style.color = '#ef4444';
            if (btnReconcile) {
                btnReconcile.disabled = true;
                btnReconcile.style.background = '#d1d5db';
                btnReconcile.style.cursor = 'not-allowed';
            }
        }
    }
}

/**
 * Save reconciliation progress
 */
async function saveCostReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiPost('/cost/reconcile.php', {
        action: 'save',
        user_id: userId,
        reconcile_id: costReconcileState.reconcileId,
        cleared_ids: Array.from(costReconcileState.clearedIds)
    });

    if (result.success) {
        showToast('Progress saved. You can continue later.', 'success');
    } else {
        showToast(result.message || 'Error saving', 'error');
    }
}

/**
 * Complete reconciliation
 */
async function completeCostReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!confirm('Are you sure you want to complete this reconciliation? This will mark all selected transactions as cleared.')) {
        return;
    }

    const result = await apiPost('/cost/reconcile.php', {
        action: 'complete',
        user_id: userId,
        reconcile_id: costReconcileState.reconcileId,
        cleared_ids: Array.from(costReconcileState.clearedIds)
    });

    if (result.success) {
        showToast('Reconciliation completed successfully!', 'success');
        costReconcileState.isActive = false;
        loadCostReconcile(); // Go back to start form
    } else {
        showToast(result.message || 'Error completing reconciliation', 'error');
    }
}

/**
 * Leave reconciliation without saving
 */
async function leaveCostReconciliation() {
    if (!confirm('Leave without saving? Your progress will be lost unless you saved.')) {
        return;
    }

    costReconcileState.isActive = false;
    loadCostReconcile();
}

/**
 * Import bank statement CSV for auto-matching
 */
function importCostBankStatementForMatch() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast('Processing bank statement...', 'info');

        try {
            const text = await file.text();
            const bankTransactions = parseCostBankStatementCSV(text);

            if (bankTransactions.length === 0) {
                showToast('No transactions found in CSV', 'error');
                return;
            }

            // Auto-match bank transactions with book records
            const matchedCount = autoMatchCostTransactions(bankTransactions);

            // Update UI
            renderCostReconcileTransactions();
            updateCostReconcileSummary();

            showToast(`Auto-matched ${matchedCount} transactions. Please review and confirm.`, 'success');
        } catch (err) {
            console.error('CSV parsing error:', err);
            showToast('Error parsing CSV file', 'error');
        }
    };
    input.click();
}

/**
 * Parse bank statement CSV
 */
function parseCostBankStatementCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const transactions = [];
    const header = lines[0].toLowerCase();

    // Detect format based on headers
    const isChase = header.includes('posting date') || header.includes('details');

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line
        const fields = parseCostCSVLine(line);

        if (isChase && fields.length >= 4) {
            const amount = parseFloat(fields[3]?.replace(/[,$]/g, '') || 0);
            const date = fields[1] || '';
            const description = fields[2] || '';
            const checkNum = fields[6] || '';

            if (amount !== 0) {
                transactions.push({
                    date: parseCostDate(date),
                    amount: amount,
                    description: description,
                    checkNum: checkNum ? checkNum.replace(/\D/g, '') : null,
                    type: amount < 0 ? 'check' : 'deposit'
                });
            }
        } else if (fields.length >= 3) {
            const amount = parseFloat(fields[2]?.replace(/[,$]/g, '') || fields[1]?.replace(/[,$]/g, '') || 0);
            const date = fields[0] || '';
            const description = fields[1] || '';

            if (amount !== 0) {
                transactions.push({
                    date: parseCostDate(date),
                    amount: amount,
                    description: description,
                    checkNum: null,
                    type: amount < 0 ? 'check' : 'deposit'
                });
            }
        }
    }

    return transactions;
}

function parseCostCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current.trim());

    return fields;
}

function parseCostDate(dateStr) {
    if (!dateStr) return null;

    const cleaned = dateStr.replace(/"/g, '').trim();
    const date = new Date(cleaned);

    if (!isNaN(date.getTime())) {
        return date;
    }

    const parts = cleaned.split(/[\/\-]/);
    if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    }

    return null;
}

/**
 * Auto-match bank transactions with book records
 */
function autoMatchCostTransactions(bankTransactions) {
    let matchedCount = 0;
    const dateToleranceDays = 7;

    for (const bankTx of bankTransactions) {
        const bankAmount = Math.abs(bankTx.amount);
        const bankDate = bankTx.date;

        const searchList = bankTx.type === 'check'
            ? costReconcileState.checks
            : costReconcileState.deposits;

        for (const bookTx of searchList) {
            if (costReconcileState.clearedIds.has(bookTx.id)) continue;

            const bookAmount = Math.abs(parseFloat(bookTx.amount));
            const bookDate = new Date(bookTx.transaction_date);

            // Check #1: Exact check number match
            if (bankTx.checkNum && bookTx.check_number) {
                const bankCheckNum = bankTx.checkNum.replace(/\D/g, '');
                const bookCheckNum = bookTx.check_number.toString().replace(/\D/g, '');

                if (bankCheckNum === bookCheckNum && Math.abs(bankAmount - bookAmount) < 0.01) {
                    costReconcileState.clearedIds.add(bookTx.id);
                    matchedCount++;
                    break;
                }
            }

            // Check #2: Amount match within date tolerance
            if (Math.abs(bankAmount - bookAmount) < 0.01) {
                if (bankDate && bookDate) {
                    const daysDiff = Math.abs((bankDate - bookDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff <= dateToleranceDays) {
                        costReconcileState.clearedIds.add(bookTx.id);
                        matchedCount++;
                        break;
                    }
                } else {
                    costReconcileState.clearedIds.add(bookTx.id);
                    matchedCount++;
                    break;
                }
            }
        }
    }

    return matchedCount;
}

/**
 * Delete an in-progress reconciliation
 */
async function deleteCostReconciliation(reconcileId) {
    if (!confirm('Delete this reconciliation? This cannot be undone.')) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch(`${API_BASE}/cost/reconcile.php?id=${reconcileId}&user_id=${userId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            showToast('Reconciliation deleted', 'success');
            loadCostReconHistoryList();
        } else {
            showToast(result.message || 'Failed to delete', 'error');
        }
    } catch (e) {
        console.error('Delete error:', e);
        showToast('Error deleting reconciliation', 'error');
    }
}

/**
 * Edit an in-progress reconciliation
 */
function editCostReconciliation(reconcileId, currentDate, currentBalance) {
    const modal = document.createElement('div');
    modal.id = 'edit-cost-recon-modal';
    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 16px; padding: 24px; width: 400px; max-width: 90vw;">
                <h3 style="margin: 0 0 20px; font-size: 18px; color: #1e293b;">Edit Reconciliation</h3>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Statement Date</label>
                    <input type="date" id="edit-cost-recon-date" value="${currentDate}"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Statement Ending Balance</label>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b;">$</span>
                        <input type="number" id="edit-cost-recon-balance" step="0.01" value="${currentBalance}"
                               style="width: 100%; padding: 10px 12px 10px 28px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button onclick="closeEditCostReconModal()"
                            style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="saveCostReconciliationEdit(${reconcileId})"
                            style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEditCostReconModal() {
    const modal = document.getElementById('edit-cost-recon-modal');
    if (modal) modal.remove();
}

async function saveCostReconciliationEdit(reconcileId) {
    const statementDate = document.getElementById('edit-cost-recon-date')?.value;
    const statementBalance = parseFloat(document.getElementById('edit-cost-recon-balance')?.value || 0);
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!statementDate) {
        showToast('Please enter a statement date', 'error');
        return;
    }

    try {
        const result = await apiPost('/cost/reconcile.php', {
            action: 'update',
            reconcile_id: reconcileId,
            user_id: userId,
            statement_date: statementDate,
            statement_ending_balance: statementBalance
        });

        if (result.success) {
            showToast('Reconciliation updated', 'success');
            closeEditCostReconModal();
            loadCostReconHistoryList();
        } else {
            showToast(result.message || 'Failed to update', 'error');
        }
    } catch (e) {
        console.error('Update error:', e);
        showToast('Error updating reconciliation', 'error');
    }
}

// =====================================================
// Window Exports
// =====================================================

window.loadCostReconcile = loadCostReconcile;
window.loadCostReconHistory = loadCostReconHistory;
window.loadCostReconHistoryList = loadCostReconHistoryList;
window.startCostReconciliation = startCostReconciliation;
window.continueCostReconciliation = continueCostReconciliation;
window.toggleCostReconcileItem = toggleCostReconcileItem;
window.saveCostReconciliation = saveCostReconciliation;
window.completeCostReconciliation = completeCostReconciliation;
window.leaveCostReconciliation = leaveCostReconciliation;
window.importCostBankStatementForMatch = importCostBankStatementForMatch;
window.editCostReconciliation = editCostReconciliation;
window.closeEditCostReconModal = closeEditCostReconModal;
window.saveCostReconciliationEdit = saveCostReconciliationEdit;
window.deleteCostReconciliation = deleteCostReconciliation;

console.log('Cost Reconcile module loaded');
