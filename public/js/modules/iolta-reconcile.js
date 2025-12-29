// =====================================================
// IOLTA Reconciliation Module
// Version: 20251225
// Dependencies: iolta-common.js
// =====================================================
// QuickBooks-style Bank Reconciliation for IOLTA Trust Accounts
// - Start new reconciliation with statement date/balance
// - Two-column view: Checks/Payments and Deposits
// - Toggle items as cleared
// - Import bank CSV for auto-matching
// - Save progress and complete reconciliation
// =====================================================

// Prevent duplicate page loads
let _reconcilePageLoading = false;

/**
 * Load Trust Reconciliation page (entry point)
 */
async function loadTrustReconcile() {
    // Prevent duplicate concurrent loads
    if (_reconcilePageLoading) {
        console.log('Reconcile page load already in progress, skipping...');
        return;
    }
    _reconcilePageLoading = true;

    try {
        // Load IOLTA data first to populate the account dropdown
        await loadIOLTAData();

        const container = document.getElementById('trust-reconcile-page');
        if (!container) return;

        // Show start reconciliation form (with recent history that allows continuing in-progress)
        renderReconcileStartForm(container);
    } finally {
        _reconcilePageLoading = false;
    }
}

function onTrustReconAccountChange() {
    // When account changes, could optionally pre-fill statement balance
    const accountId = document.getElementById('trust-recon-account')?.value;
    if (accountId) {
        const account = ioltaState.trustAccounts.find(a => a.id == accountId);
        if (account) {
            // Optionally pre-fill with current account balance
            // document.getElementById('trust-recon-statement-balance').value = account.current_balance;
        }
    }
}

async function beginTrustReconciliation() {
    let accountId = document.getElementById('trust-recon-account')?.value;
    const statementDate = document.getElementById('trust-recon-date')?.value;
    const statementBalance = document.getElementById('trust-recon-statement-balance')?.value;

    // Auto-select IOLTA account if not set
    if (!accountId) {
        // Try to get from ioltaState first
        if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
            const ioltaAccount = ioltaState.trustAccounts.find(a => a.account_type === 'iolta');
            accountId = ioltaAccount ? ioltaAccount.id : ioltaState.trustAccounts[0].id;
        } else {
            // Fallback: hardcoded IOLTA account ID
            accountId = 7;
        }
        // Update the hidden select
        const accountSelect = document.getElementById('trust-recon-account');
        if (accountSelect) {
            accountSelect.value = accountId;
        }
    }

    if (!statementDate) {
        showToast('Please select a statement date', 'error');
        return;
    }

    if (!statementBalance) {
        showToast('Please enter the statement ending balance', 'error');
        return;
    }

    // Show the active reconciliation section
    const activeSection = document.getElementById('trust-recon-active-section');
    if (activeSection) {
        activeSection.style.display = 'block';
    }

    // Update bank balance with entered statement balance
    const bankBalanceEl = document.getElementById('recon-bank-balance');
    if (bankBalanceEl) {
        bankBalanceEl.textContent = formatCurrency(parseFloat(statementBalance));
    }

    // Load the reconciliation data
    await loadTrustReconciliation();

    showToast('Reconciliation started', 'success');
}

async function finishTrustReconciliation() {
    let accountId = document.getElementById('trust-recon-account')?.value;
    const statementDate = document.getElementById('trust-recon-date')?.value;
    const statementBalance = document.getElementById('trust-recon-statement-balance')?.value;

    // Auto-select IOLTA account if not set
    if (!accountId) {
        if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
            const ioltaAccount = ioltaState.trustAccounts.find(a => a.account_type === 'iolta');
            accountId = ioltaAccount ? ioltaAccount.id : ioltaState.trustAccounts[0].id;
        } else {
            accountId = 7; // Fallback
        }
    }

    // Check if balanced
    const bankBalance = parseFloat(statementBalance || 0);
    const ledgerTotal = parseFloat(document.getElementById('recon-ledger-total')?.textContent.replace(/[^0-9.-]/g, '') || 0);
    const bookBalance = parseFloat(document.getElementById('recon-book-balance')?.textContent.replace(/[^0-9.-]/g, '') || 0);

    if (Math.abs(bankBalance - ledgerTotal) > 0.01 || Math.abs(bankBalance - bookBalance) > 0.01) {
        if (!confirm('The balances do not match. Are you sure you want to finish reconciliation?')) {
            return;
        }
    }

    // Save reconciliation record
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const result = await apiPost('/trust/reconciliation.php', {
        user_id: userId,
        account_id: accountId,
        statement_date: statementDate,
        statement_balance: bankBalance,
        book_balance: bookBalance,
        ledger_total: ledgerTotal,
        status: 'completed'
    });

    if (result.success) {
        showToast('Reconciliation completed successfully', 'success');

        // Hide active section and reload history
        const activeSection = document.getElementById('trust-recon-active-section');
        if (activeSection) {
            activeSection.style.display = 'none';
        }

        // Reset form
        document.getElementById('trust-recon-statement-balance').value = '';

        loadTrustReconHistory();
    } else {
        showToast(result.message || 'Error saving reconciliation', 'error');
    }
}

function undoTrustReconTransaction() {
    showToast('Undo feature coming soon', 'info');
}

async function loadTrustReconHistory() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const container = document.getElementById('trust-recon-history-list');
    if (!container) return;

    const result = await apiGet('/trust/reconciliation.php', {
        user_id: userId,
        limit: 10
    });

    if (result.success && result.data.reconciliations && result.data.reconciliations.length > 0) {
        container.innerHTML = result.data.reconciliations.map(rec => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                <div>
                    <div style="font-weight: 500; color: #1e293b;">${escapeHtml(rec.account_name || 'Trust Account')}</div>
                    <div style="font-size: 12px; color: #94a3b8;">${formatDate(rec.statement_date)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; color: #10b981;">${formatCurrency(rec.statement_balance)}</div>
                    <div style="font-size: 11px; color: ${rec.status === 'completed' ? '#10b981' : '#f59e0b'};">${rec.status === 'completed' ? '&#10003; Completed' : 'In Progress'}</div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = 'No reconciliations completed yet';
    }
}

async function loadTrustReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    let accountId = document.getElementById('trust-recon-account')?.value;

    // Auto-select IOLTA account if not set
    if (!accountId) {
        if (ioltaState.trustAccounts && ioltaState.trustAccounts.length > 0) {
            const ioltaAccount = ioltaState.trustAccounts.find(a => a.account_type === 'iolta');
            accountId = ioltaAccount ? ioltaAccount.id : ioltaState.trustAccounts[0].id;
        } else {
            accountId = 7; // Fallback
        }
    }

    const data = await apiGet('/trust/reports.php', {
        type: 'account_summary',
        account_id: accountId,
        user_id: userId
    });

    if (data.success) {
        const summary = data.data.summary;
        const accountBalance = parseFloat(summary.totals?.account_balance || 0);
        const ledgerTotal = parseFloat(summary.totals?.total_client_balance || 0);

        // Get bank balance from user input (statement balance), NOT from account balance
        const statementBalanceInput = document.getElementById('trust-recon-statement-balance')?.value;
        const bankBalance = statementBalanceInput ? parseFloat(statementBalanceInput) : accountBalance;

        // Calculate differences for 3-way reconciliation
        const bankVsLedger = bankBalance - ledgerTotal;
        const bankVsBook = bankBalance - accountBalance;
        const isBalanced = Math.abs(bankVsLedger) < 0.01 && Math.abs(bankVsBook) < 0.01;

        // Update balance displays
        document.getElementById('recon-bank-balance').textContent = formatCurrency(bankBalance);
        document.getElementById('recon-book-balance').textContent = formatCurrency(accountBalance);
        document.getElementById('recon-ledger-total').textContent = formatCurrency(ledgerTotal);

        // Update difference card (show Bank vs Ledger difference)
        const diffEl = document.getElementById('recon-difference');
        const diffCard = document.getElementById('recon-difference-card');
        const statusIcon = document.getElementById('recon-status-icon');

        diffEl.textContent = formatCurrency(Math.abs(bankVsLedger));

        if (isBalanced) {
            diffEl.style.color = '#10b981';
            diffCard.style.background = '#ecfdf5';
            diffCard.style.borderColor = '#10b981';
            statusIcon.innerHTML = '&#9989;';
            statusIcon.style.background = '#10b981';
            statusIcon.style.color = 'white';
        } else {
            diffEl.style.color = '#ef4444';
            diffCard.style.background = '#fef2f2';
            diffCard.style.borderColor = '#ef4444';
            statusIcon.innerHTML = '&#9888;';
            statusIcon.style.background = '#fef2f2';
        }

        // Update ledger count
        const countEl = document.getElementById('recon-ledger-count');
        if (countEl) {
            const count = summary.ledgers?.length || 0;
            countEl.textContent = `${count} client${count !== 1 ? 's' : ''}`;
        }

        // Render ledger breakdown
        const container = document.getElementById('recon-ledger-breakdown');
        if (container && summary.ledgers) {
            if (summary.ledgers.length === 0) {
                container.innerHTML = `
                    <div style="padding: 48px; text-align: center; color: #94a3b8;">
                        <div style="font-size: 40px; margin-bottom: 12px;">&#128203;</div>
                        <div>No client ledgers found for this account</div>
                    </div>
                `;
            } else {
                container.innerHTML = summary.ledgers.map((ledger, index) => {
                    const balance = parseFloat(ledger.current_balance || 0);
                    const isPositive = balance >= 0;
                    const percentage = ledgerTotal > 0 ? ((balance / ledgerTotal) * 100).toFixed(1) : 0;

                    return `
                        <div style="display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; gap: 16px;"
                             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                            <!-- Avatar -->
                            <div style="width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                                ${(ledger.client_name || 'C').charAt(0).toUpperCase()}
                            </div>

                            <!-- Client Info -->
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 2px;">
                                    ${escapeHtml(ledger.client_name || 'Unknown Client')}
                                </div>
                                <div style="font-size: 12px; color: #64748b;">
                                    ${ledger.case_number ? `Case: ${ledger.case_number}` : 'No case number'}
                                </div>
                            </div>

                            <!-- Balance -->
                            <div style="text-align: right;">
                                <div style="font-size: 16px; font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'};">
                                    ${formatCurrency(balance)}
                                </div>
                                <div style="font-size: 11px; color: #94a3b8;">
                                    ${percentage}% of total
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Add total row
                container.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-top: 2px solid #e2e8f0;">
                        <div style="font-weight: 600; color: #475569;">Total Client Balances</div>
                        <div style="font-size: 18px; font-weight: 700; color: #1e293b;">${formatCurrency(ledgerTotal)}</div>
                    </div>
                `;
            }
        }
    }
}

// =====================================================
// QuickBooks-style Bank Reconciliation
// =====================================================

/**
 * Render the start reconciliation form
 */
function renderReconcileStartForm(container) {
    // Filter for main IOLTA bank account, not client sub-accounts
    const account = ioltaState.trustAccounts.find(a => a.account_type === 'iolta') || ioltaState.trustAccounts[0];
    const accountName = account?.account_name || 'IOLTA Account';
    const accountLast4 = account?.account_number_last4 || '';

    container.innerHTML = `
        <div style="max-width: 600px; margin: 40px auto; padding: 0 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
                <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                    <span style="font-size: 28px;">&#127974;</span>
                </div>
                <h2 style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 0 0 8px;">Bank Reconciliation</h2>
                <p style="color: #64748b; margin: 0;">Match your book records with bank statement</p>
            </div>

            <!-- Form Card -->
            <div style="background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); padding: 32px;">
                <!-- Account Info -->
                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #6366f1; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 20px;">&#127963;</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #1e293b;">${escapeHtml(accountName)}</div>
                        <div style="font-size: 13px; color: #64748b;">****${accountLast4 || '0000'}</div>
                    </div>
                </div>

                <!-- Statement Date -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 8px;">Statement Date</label>
                    <input type="date" id="recon-statement-date"
                           value="${new Date().toISOString().split('T')[0]}"
                           style="width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px;">
                </div>

                <!-- Statement Ending Balance -->
                <div style="margin-bottom: 28px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 8px;">Statement Ending Balance</label>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 16px;">$</span>
                        <input type="number" id="recon-statement-balance" step="0.01" placeholder="0.00"
                               style="width: 100%; padding: 12px 16px 12px 32px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px;">
                    </div>
                    <p style="font-size: 12px; color: #94a3b8; margin: 8px 0 0;">Enter the ending balance from your bank statement</p>
                </div>

                <!-- Buttons -->
                <div style="display: flex; gap: 12px;">
                    <button onclick="loadTrustReconHistory()"
                            style="flex: 1; padding: 14px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer;">
                        View History
                    </button>
                    <button onclick="startTrustReconciliation()"
                            style="flex: 2; padding: 14px 20px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">
                        Begin Reconciliation
                    </button>
                </div>
            </div>

            <!-- Recent Reconciliations -->
            <div id="recon-history-section" style="margin-top: 32px;">
                <h3 style="font-size: 16px; font-weight: 600; color: #475569; margin-bottom: 16px;">Recent Reconciliations</h3>
                <div id="recon-history-list" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="padding: 20px; text-align: center; color: #94a3b8;">Loading...</div>
                </div>
            </div>
        </div>
    `;

    // Load history
    loadReconHistoryList();
}

/**
 * Load reconciliation history list
 */
async function loadReconHistoryList() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const container = document.getElementById('recon-history-list');
    if (!container) return;

    const result = await apiGet('/trust/reconcile.php', {
        user_id: userId,
        limit: 10
    });

    if (result.success && result.data.reconciliations?.length > 0) {
        container.innerHTML = result.data.reconciliations.map(rec => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1; ${rec.status === 'in_progress' ? 'cursor: pointer;' : ''}"
                     ${rec.status === 'in_progress' ? `onclick="continueReconciliation(${rec.id})" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"` : ''}>
                    <div style="font-weight: 500; color: #1e293b;">${formatDate(rec.statement_date)}</div>
                    <div style="font-size: 12px; color: #64748b;">
                        ${rec.cleared_checks_count || 0} checks, ${rec.cleared_deposits_count || 0} deposits
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: #1e293b;">${formatCurrency(rec.statement_ending_balance)}</div>
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${rec.status === 'completed' ? '#ecfdf5' : '#fef3c7'}; color: ${rec.status === 'completed' ? '#10b981' : '#f59e0b'};">
                            ${rec.status === 'completed' ? '&#10003; Completed' : 'In Progress'}
                        </span>
                    </div>
                    ${rec.status === 'in_progress' ? `
                        <div style="display: flex; gap: 4px;">
                            <button onclick="event.stopPropagation(); editReconciliation(${rec.id}, '${rec.statement_date}', ${rec.statement_ending_balance})"
                                    style="padding: 6px 10px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;"
                                    title="Edit">&#9999;</button>
                            <button onclick="event.stopPropagation(); deleteReconciliation(${rec.id})"
                                    style="padding: 6px 10px; background: #fef2f2; color: #ef4444; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;"
                                    title="Delete">&#128465;</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <div style="padding: 32px; text-align: center; color: #94a3b8;">
                <div style="font-size: 32px; margin-bottom: 8px;">&#128203;</div>
                <div>No reconciliations yet</div>
            </div>
        `;
    }
}

/**
 * Continue an in-progress reconciliation
 */
async function continueReconciliation(reconcileId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiGet('/trust/reconcile.php', {
        user_id: userId,
        id: reconcileId
    });

    if (result.success && result.data) {
        const data = result.data;

        // Set up reconcile state
        trustReconcileState = {
            reconcileId: data.id,
            isActive: true,
            statementDate: data.statement_date,
            statementEndingBalance: parseFloat(data.statement_ending_balance),
            beginningBalance: parseFloat(data.beginning_balance),
            clearedIds: new Set(data.cleared_ids?.map(id => parseInt(id)) || []),
            checks: data.checks || [],
            deposits: data.deposits || []
        };

        // Calculate totals from cleared items
        let checksTotal = 0, depositsTotal = 0;
        trustReconcileState.checks.forEach(c => {
            if (trustReconcileState.clearedIds.has(c.id)) {
                checksTotal += Math.abs(parseFloat(c.amount));
            }
        });
        trustReconcileState.deposits.forEach(d => {
            if (trustReconcileState.clearedIds.has(d.id)) {
                depositsTotal += parseFloat(d.amount);
            }
        });

        trustReconcileState.clearedChecksTotal = checksTotal;
        trustReconcileState.clearedDepositsTotal = depositsTotal;

        // Render reconciliation view
        renderReconciliationView();
        showToast('Reconciliation resumed', 'success');
    } else {
        showToast(result.message || 'Failed to load reconciliation', 'error');
    }
}

/**
 * Start a new IOLTA Trust reconciliation
 */
async function startTrustReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    // Use main IOLTA bank account, not client sub-accounts
    const account = ioltaState.trustAccounts.find(a => a.account_type === 'iolta') || ioltaState.trustAccounts[0];
    const accountId = account?.id;
    const statementDate = document.getElementById('recon-statement-date')?.value;
    const statementBalance = parseFloat(document.getElementById('recon-statement-balance')?.value || 0);

    if (!statementDate) {
        showToast('Please select a statement date', 'error');
        return;
    }

    if (!statementBalance) {
        showToast('Please enter the statement ending balance', 'error');
        return;
    }

    const result = await apiPost('/trust/reconcile.php', {
        action: 'start',
        user_id: userId,
        account_id: accountId,
        statement_date: statementDate,
        statement_ending_balance: statementBalance
    });

    if (result.success) {
        // Update state
        trustReconcileState = {
            reconcileId: result.data.reconcile_id,
            accountId: accountId,
            statementDate: statementDate,
            statementEndingBalance: statementBalance,
            beginningBalance: result.data.beginning_balance,
            checks: result.data.checks || [],
            deposits: result.data.deposits || [],
            clearedIds: new Set(),
            isActive: true
        };

        // Render reconciliation view
        renderReconciliationView();
        showToast('Reconciliation started', 'success');
    } else {
        showToast(result.message || 'Error starting reconciliation', 'error');
    }
}

/**
 * Resume an existing reconciliation
 */
async function resumeReconciliation(reconcileId) {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiGet('/trust/reconcile.php', {
        user_id: userId,
        id: reconcileId
    });

    if (result.success && result.data) {
        const data = result.data;
        trustReconcileState = {
            reconcileId: data.id,
            accountId: data.account_id,
            statementDate: data.statement_date,
            statementEndingBalance: parseFloat(data.statement_ending_balance),
            beginningBalance: parseFloat(data.beginning_balance),
            checks: data.checks || [],
            deposits: data.deposits || [],
            clearedIds: new Set(data.cleared_ids || []),
            isActive: true
        };

        renderReconciliationView();
        showToast('Reconciliation resumed', 'info');
    }
}

/**
 * Render the main reconciliation view (QuickBooks style)
 */
function renderReconciliationView() {
    const container = document.getElementById('trust-reconcile-page');
    if (!container) return;

    const account = ioltaState.trustAccounts.find(a => a.id == trustReconcileState.accountId);
    const accountName = account?.account_name || 'IOLTA Account';

    container.innerHTML = `
        <div style="height: 100%; display: flex; flex-direction: column; background: #f8fafc;">
            <!-- Header -->
            <div style="background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">Bank Reconciliation</h2>
                        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                            ${escapeHtml(accountName)} • Statement: ${formatDate(trustReconcileState.statementDate)}
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button onclick="importBankStatementForMatch()" style="padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            &#128196; Import CSV
                        </button>
                        <button onclick="saveReconciliation()" style="padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            &#128190; Save for Later
                        </button>
                        <button onclick="leaveReconciliation()" style="padding: 10px 16px; background: #fef2f2; color: #ef4444; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;">
                            &#10005; Leave
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
                            <span id="recon-checks-summary" style="font-size: 13px; color: #64748b;">0 of ${trustReconcileState.checks.length} cleared</span>
                        </div>
                    </div>
                    <div id="recon-checks-list" style="flex: 1; overflow-y: auto; background: white;">
                        <!-- Checks will be rendered here -->
                    </div>
                    <div style="padding: 12px 20px; background: #fef2f2; border-top: 1px solid #fecaca;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500; color: #991b1b;">Cleared Total:</span>
                            <span id="recon-checks-total" style="font-weight: 600; color: #991b1b;">$0.00</span>
                        </div>
                    </div>
                </div>

                <!-- Right: Deposits and Credits -->
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="padding: 16px 20px; background: #ecfdf5; border-bottom: 1px solid #a7f3d0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #065f46;">Deposits and Other Credits</span>
                            <span id="recon-deposits-summary" style="font-size: 13px; color: #64748b;">0 of ${trustReconcileState.deposits.length} cleared</span>
                        </div>
                    </div>
                    <div id="recon-deposits-list" style="flex: 1; overflow-y: auto; background: white;">
                        <!-- Deposits will be rendered here -->
                    </div>
                    <div style="padding: 12px 20px; background: #ecfdf5; border-top: 1px solid #a7f3d0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500; color: #065f46;">Cleared Total:</span>
                            <span id="recon-deposits-total" style="font-weight: 600; color: #065f46;">$0.00</span>
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
                                <td style="padding: 6px 0; text-align: right; font-weight: 500;">${formatCurrency(trustReconcileState.beginningBalance)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #10b981;">+ Cleared Deposits</td>
                                <td id="summary-deposits" style="padding: 6px 0; text-align: right; font-weight: 500; color: #10b981;">$0.00</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #ef4444;">- Cleared Checks</td>
                                <td id="summary-checks" style="padding: 6px 0; text-align: right; font-weight: 500; color: #ef4444;">$0.00</td>
                            </tr>
                            <tr style="border-top: 1px solid #e2e8f0;">
                                <td style="padding: 10px 0 6px; font-weight: 600;">Cleared Balance</td>
                                <td id="summary-cleared" style="padding: 10px 0 6px; text-align: right; font-weight: 600;">$0.00</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b;">Statement Ending Balance</td>
                                <td style="padding: 6px 0; text-align: right; font-weight: 500;">${formatCurrency(trustReconcileState.statementEndingBalance)}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- Right side: Difference and button -->
                    <div style="text-align: center;">
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">Difference</div>
                        <div id="recon-difference" style="font-size: 32px; font-weight: 700; color: #ef4444; margin-bottom: 16px;">$0.00</div>
                        <button id="btn-reconcile-now" onclick="completeReconciliation()" disabled
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
    renderReconcileTransactions();
}

/**
 * Render transactions in both columns
 */
function renderReconcileTransactions() {
    // Render checks
    const checksContainer = document.getElementById('recon-checks-list');
    if (checksContainer) {
        if (trustReconcileState.checks.length === 0) {
            checksContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
                    <div>No uncleared checks</div>
                </div>
            `;
        } else {
            checksContainer.innerHTML = trustReconcileState.checks.map(tx => {
                const isCleared = trustReconcileState.clearedIds.has(tx.id);
                const checkNum = tx.check_number || tx.reference_number?.replace(/[^0-9]/g, '') || '';
                return `
                    <div onclick="toggleTrustReconcileItem(${tx.id})"
                         style="display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ${isCleared ? '#fef2f2' : 'white'};"
                         onmouseover="this.style.background='${isCleared ? '#fee2e2' : '#f8fafc'}'"
                         onmouseout="this.style.background='${isCleared ? '#fef2f2' : 'white'}'">
                        <div style="width: 24px; height: 24px; border: 2px solid ${isCleared ? '#ef4444' : '#d1d5db'}; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; background: ${isCleared ? '#ef4444' : 'white'};">
                            ${isCleared ? '<span style="color: white; font-size: 14px;">&#10003;</span>' : ''}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${checkNum ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #64748b;">#${checkNum}</span>` : ''}
                                <span style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tx.payee || tx.client_name || 'Unknown')}</span>
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
    const depositsContainer = document.getElementById('recon-deposits-list');
    if (depositsContainer) {
        if (trustReconcileState.deposits.length === 0) {
            depositsContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
                    <div>No uncleared deposits</div>
                </div>
            `;
        } else {
            depositsContainer.innerHTML = trustReconcileState.deposits.map(tx => {
                const isCleared = trustReconcileState.clearedIds.has(tx.id);
                const refNum = tx.reference_number || '';
                return `
                    <div onclick="toggleTrustReconcileItem(${tx.id})"
                         style="display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; background: ${isCleared ? '#ecfdf5' : 'white'};"
                         onmouseover="this.style.background='${isCleared ? '#d1fae5' : '#f8fafc'}'"
                         onmouseout="this.style.background='${isCleared ? '#ecfdf5' : 'white'}'">
                        <div style="width: 24px; height: 24px; border: 2px solid ${isCleared ? '#10b981' : '#d1d5db'}; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; background: ${isCleared ? '#10b981' : 'white'};">
                            ${isCleared ? '<span style="color: white; font-size: 14px;">&#10003;</span>' : ''}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${refNum ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #64748b;">${escapeHtml(refNum)}</span>` : ''}
                                <span style="font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tx.received_from || tx.client_name || tx.description || 'Deposit')}</span>
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
    updateTrustReconcileSummary();
}

/**
 * Toggle IOLTA Trust item cleared status
 */
function toggleTrustReconcileItem(transactionId) {
    if (trustReconcileState.clearedIds.has(transactionId)) {
        trustReconcileState.clearedIds.delete(transactionId);
    } else {
        trustReconcileState.clearedIds.add(transactionId);
    }
    renderReconcileTransactions();
}

/**
 * Update IOLTA Trust reconciliation summary
 */
function updateTrustReconcileSummary() {
    let clearedChecksTotal = 0;
    let clearedChecksCount = 0;
    let clearedDepositsTotal = 0;
    let clearedDepositsCount = 0;

    // Calculate cleared checks
    trustReconcileState.checks.forEach(tx => {
        if (trustReconcileState.clearedIds.has(tx.id)) {
            clearedChecksTotal += Math.abs(parseFloat(tx.amount));
            clearedChecksCount++;
        }
    });

    // Calculate cleared deposits
    trustReconcileState.deposits.forEach(tx => {
        if (trustReconcileState.clearedIds.has(tx.id)) {
            clearedDepositsTotal += parseFloat(tx.amount);
            clearedDepositsCount++;
        }
    });

    // Update displays
    document.getElementById('recon-checks-summary').textContent = `${clearedChecksCount} of ${trustReconcileState.checks.length} cleared`;
    document.getElementById('recon-deposits-summary').textContent = `${clearedDepositsCount} of ${trustReconcileState.deposits.length} cleared`;
    document.getElementById('recon-checks-total').textContent = formatCurrency(clearedChecksTotal);
    document.getElementById('recon-deposits-total').textContent = formatCurrency(clearedDepositsTotal);

    // Calculate cleared balance
    const clearedBalance = trustReconcileState.beginningBalance + clearedDepositsTotal - clearedChecksTotal;
    const difference = trustReconcileState.statementEndingBalance - clearedBalance;

    // Update summary section
    document.getElementById('summary-deposits').textContent = formatCurrency(clearedDepositsTotal);
    document.getElementById('summary-checks').textContent = formatCurrency(clearedChecksTotal);
    document.getElementById('summary-cleared').textContent = formatCurrency(clearedBalance);

    // Update difference
    const diffEl = document.getElementById('recon-difference');
    const btnReconcile = document.getElementById('btn-reconcile-now');

    diffEl.textContent = formatCurrency(Math.abs(difference));

    if (Math.abs(difference) < 0.01) {
        diffEl.style.color = '#10b981';
        btnReconcile.disabled = false;
        btnReconcile.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btnReconcile.style.cursor = 'pointer';
    } else {
        diffEl.style.color = '#ef4444';
        btnReconcile.disabled = true;
        btnReconcile.style.background = '#d1d5db';
        btnReconcile.style.cursor = 'not-allowed';
    }
}

/**
 * Save reconciliation progress
 */
async function saveReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    const result = await apiPost('/trust/reconcile.php', {
        action: 'save',
        user_id: userId,
        reconcile_id: trustReconcileState.reconcileId,
        cleared_ids: Array.from(trustReconcileState.clearedIds)
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
async function completeReconciliation() {
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!confirm('Are you sure you want to complete this reconciliation? This will mark all selected transactions as cleared.')) {
        return;
    }

    const result = await apiPost('/trust/reconcile.php', {
        action: 'complete',
        user_id: userId,
        reconcile_id: trustReconcileState.reconcileId,
        cleared_ids: Array.from(trustReconcileState.clearedIds)
    });

    if (result.success) {
        showToast('Reconciliation completed successfully!', 'success');
        trustReconcileState.isActive = false;
        loadTrustReconcile(); // Go back to start form
    } else {
        showToast(result.message || 'Error completing reconciliation', 'error');
    }
}

/**
 * Leave reconciliation without saving
 */
async function leaveReconciliation() {
    if (!confirm('Leave without saving? Your progress will be lost unless you saved.')) {
        return;
    }

    trustReconcileState.isActive = false;
    loadTrustReconcile();
}

/**
 * Import bank statement CSV for auto-matching during reconciliation
 */
function importBankStatementForMatch() {
    // Create file input for CSV upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast('Processing bank statement...', 'info');

        try {
            const text = await file.text();
            const bankTransactions = parseBankStatementCSV(text);

            if (bankTransactions.length === 0) {
                showToast('No transactions found in CSV', 'error');
                return;
            }

            // Auto-match bank transactions with book records
            const matchedCount = autoMatchTransactions(bankTransactions);

            // Update UI
            renderReconcileTransactions();
            updateTrustReconcileSummary();

            showToast(`Auto-matched ${matchedCount} transactions. Please review and confirm.`, 'success');
        } catch (err) {
            console.error('CSV parsing error:', err);
            showToast('Error parsing CSV file', 'error');
        }
    };
    input.click();
}

/**
 * Parse bank statement CSV (Chase format or generic)
 */
function parseBankStatementCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const transactions = [];
    const header = lines[0].toLowerCase();

    // Detect format based on headers
    const isChase = header.includes('posting date') || header.includes('details');

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (handle quoted fields)
        const fields = parseCSVLine(line);

        if (isChase && fields.length >= 4) {
            // Chase format: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
            const amount = parseFloat(fields[3]?.replace(/[,$]/g, '') || 0);
            const date = fields[1] || '';
            const description = fields[2] || '';
            const checkNum = fields[6] || '';

            if (amount !== 0) {
                transactions.push({
                    date: parseDate(date),
                    amount: amount,
                    description: description,
                    checkNum: checkNum ? checkNum.replace(/\D/g, '') : null,
                    type: amount < 0 ? 'check' : 'deposit'
                });
            }
        } else if (fields.length >= 3) {
            // Generic format: Date, Description, Amount
            const amount = parseFloat(fields[2]?.replace(/[,$]/g, '') || fields[1]?.replace(/[,$]/g, '') || 0);
            const date = fields[0] || '';
            const description = fields[1] || '';

            if (amount !== 0) {
                transactions.push({
                    date: parseDate(date),
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

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
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

/**
 * Parse date string to Date object
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    // Try common formats: MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY
    const cleaned = dateStr.replace(/"/g, '').trim();
    const date = new Date(cleaned);

    if (!isNaN(date.getTime())) {
        return date;
    }

    // Try MM/DD/YYYY
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
 * Returns count of matched transactions
 */
function autoMatchTransactions(bankTransactions) {
    let matchedCount = 0;
    const dateToleranceDays = 7; // Allow 7 days difference

    for (const bankTx of bankTransactions) {
        const bankAmount = Math.abs(bankTx.amount);
        const bankDate = bankTx.date;

        // Search in appropriate list (checks or deposits)
        const searchList = bankTx.type === 'check'
            ? trustReconcileState.checks
            : trustReconcileState.deposits;

        for (const bookTx of searchList) {
            // Skip if already cleared
            if (trustReconcileState.clearedIds.has(bookTx.id)) continue;

            const bookAmount = Math.abs(parseFloat(bookTx.amount));
            const bookDate = new Date(bookTx.transaction_date);

            // Check #1: Exact check number match (highest priority)
            if (bankTx.checkNum && bookTx.check_number) {
                const bankCheckNum = bankTx.checkNum.replace(/\D/g, '');
                const bookCheckNum = bookTx.check_number.toString().replace(/\D/g, '');

                if (bankCheckNum === bookCheckNum && Math.abs(bankAmount - bookAmount) < 0.01) {
                    trustReconcileState.clearedIds.add(bookTx.id);
                    matchedCount++;
                    break;
                }
            }

            // Check #2: Amount match within date tolerance
            if (Math.abs(bankAmount - bookAmount) < 0.01) {
                // Check date tolerance
                if (bankDate && bookDate) {
                    const daysDiff = Math.abs((bankDate - bookDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff <= dateToleranceDays) {
                        trustReconcileState.clearedIds.add(bookTx.id);
                        matchedCount++;
                        break;
                    }
                } else {
                    // If no date, just match by amount (risky but useful)
                    trustReconcileState.clearedIds.add(bookTx.id);
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
async function deleteReconciliation(reconcileId) {
    if (!confirm('Delete this reconciliation? This cannot be undone.')) {
        return;
    }

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const response = await fetch(`${API_BASE}/trust/reconcile.php?id=${reconcileId}&user_id=${userId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            showToast('Reconciliation deleted', 'success');
            loadReconHistoryList();
        } else {
            showToast(result.message || 'Failed to delete', 'error');
        }
    } catch (e) {
        console.error('Delete error:', e);
        showToast('Error deleting reconciliation', 'error');
    }
}

/**
 * Edit an in-progress reconciliation (statement date and ending balance)
 */
function editReconciliation(reconcileId, currentDate, currentBalance) {
    // Create edit modal
    const modal = document.createElement('div');
    modal.id = 'edit-recon-modal';
    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 16px; padding: 24px; width: 400px; max-width: 90vw;">
                <h3 style="margin: 0 0 20px; font-size: 18px; color: #1e293b;">Edit Reconciliation</h3>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Statement Date</label>
                    <input type="date" id="edit-recon-date" value="${currentDate}"
                           style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;">
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 6px;">Statement Ending Balance</label>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b;">$</span>
                        <input type="number" id="edit-recon-balance" step="0.01" value="${currentBalance}"
                               style="width: 100%; padding: 10px 12px 10px 28px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;">
                    </div>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button onclick="closeEditReconModal()"
                            style="padding: 10px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="saveReconciliationEdit(${reconcileId})"
                            style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEditReconModal() {
    const modal = document.getElementById('edit-recon-modal');
    if (modal) modal.remove();
}

async function saveReconciliationEdit(reconcileId) {
    const statementDate = document.getElementById('edit-recon-date')?.value;
    const statementBalance = parseFloat(document.getElementById('edit-recon-balance')?.value || 0);
    const userId = state.currentUser || localStorage.getItem('currentUser');

    if (!statementDate) {
        showToast('Please enter a statement date', 'error');
        return;
    }

    try {
        const result = await apiPost('/trust/reconcile.php', {
            action: 'update',
            reconcile_id: reconcileId,
            user_id: userId,
            statement_date: statementDate,
            statement_ending_balance: statementBalance
        });

        if (result.success) {
            showToast('Reconciliation updated', 'success');
            closeEditReconModal();
            loadReconHistoryList();
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

// Main entry point
window.loadTrustReconcile = loadTrustReconcile;

// Form functions
window.onTrustReconAccountChange = onTrustReconAccountChange;
window.beginTrustReconciliation = beginTrustReconciliation;
window.finishTrustReconciliation = finishTrustReconciliation;
window.undoTrustReconTransaction = undoTrustReconTransaction;

// History functions
window.loadTrustReconHistory = loadTrustReconHistory;
window.loadReconHistoryList = loadReconHistoryList;

// QuickBooks-style reconciliation
window.startTrustReconciliation = startTrustReconciliation;
window.continueReconciliation = continueReconciliation;
window.resumeReconciliation = resumeReconciliation;
window.toggleTrustReconcileItem = toggleTrustReconcileItem;
window.saveReconciliation = saveReconciliation;
window.completeReconciliation = completeReconciliation;
window.leaveReconciliation = leaveReconciliation;

// CSV import and matching
window.importBankStatementForMatch = importBankStatementForMatch;

// Edit/Delete
window.editReconciliation = editReconciliation;
window.closeEditReconModal = closeEditReconModal;
window.saveReconciliationEdit = saveReconciliationEdit;
window.deleteReconciliation = deleteReconciliation;

console.log('IOLTA Reconcile module loaded');
