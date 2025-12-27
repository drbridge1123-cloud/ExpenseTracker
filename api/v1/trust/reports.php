<?php
/**
 * Trust Reports API
 * Client statements, audit reports, and summary reports
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

if ($method !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$reportType = $_GET['type'] ?? null;

switch ($reportType) {
    case 'client_statement':
        getClientStatement($pdo);
        break;
    case 'account_summary':
        getAccountSummary($pdo);
        break;
    case 'audit_trail':
        getAuditTrail($pdo);
        break;
    case 'balance_summary':
        getBalanceSummary($pdo);
        break;
    case 'client_breakdown':
        getClientBreakdown($pdo);
        break;
    default:
        errorResponse('Invalid report type. Use: client_statement, account_summary, audit_trail, balance_summary, client_breakdown');
}

/**
 * Client statement - transactions for a specific client ledger
 */
function getClientStatement(PDO $pdo): void {
    $ledgerId = !empty($_GET['ledger_id']) ? (int)$_GET['ledger_id'] : null;
    $startDate = $_GET['start_date'] ?? date('Y-m-01');
    $endDate = $_GET['end_date'] ?? date('Y-m-d');

    if (!$ledgerId) {
        errorResponse('ledger_id is required');
    }

    // Get ledger info
    $ledgerSql = "SELECT
                    l.*,
                    c.client_name, c.client_number, c.case_number, c.case_description,
                    c.contact_email, c.address,
                    a.account_name, a.account_number_last4
                  FROM trust_ledger l
                  JOIN trust_clients c ON l.client_id = c.id
                  JOIN accounts a ON l.account_id = a.id
                  WHERE l.id = :ledger_id";
    $ledgerStmt = $pdo->prepare($ledgerSql);
    $ledgerStmt->execute(['ledger_id' => $ledgerId]);
    $ledger = $ledgerStmt->fetch(PDO::FETCH_ASSOC);

    if (!$ledger) {
        errorResponse('Ledger not found', 404);
    }

    // Get opening balance (balance before start date)
    $openingSql = "SELECT running_balance FROM trust_transactions
                   WHERE ledger_id = :ledger_id AND transaction_date < :start_date
                   ORDER BY transaction_date DESC, id DESC LIMIT 1";
    $openingStmt = $pdo->prepare($openingSql);
    $openingStmt->execute(['ledger_id' => $ledgerId, 'start_date' => $startDate]);
    $openingRow = $openingStmt->fetch(PDO::FETCH_ASSOC);
    $openingBalance = $openingRow ? (float)$openingRow['running_balance'] : 0.00;

    // Get transactions in date range
    $transSql = "SELECT * FROM trust_transactions
                 WHERE ledger_id = :ledger_id
                 AND transaction_date BETWEEN :start_date AND :end_date
                 ORDER BY transaction_date, id";
    $transStmt = $pdo->prepare($transSql);
    $transStmt->execute([
        'ledger_id' => $ledgerId,
        'start_date' => $startDate,
        'end_date' => $endDate
    ]);
    $transactions = $transStmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate totals
    $totalDeposits = 0;
    $totalDisbursements = 0;
    foreach ($transactions as &$trans) {
        $trans['amount'] = (float)$trans['amount'];
        $trans['running_balance'] = (float)$trans['running_balance'];
        if ($trans['amount'] > 0) {
            $totalDeposits += $trans['amount'];
        } else {
            $totalDisbursements += abs($trans['amount']);
        }
    }

    successResponse([
        'statement' => [
            'ledger' => $ledger,
            'period' => [
                'start_date' => $startDate,
                'end_date' => $endDate
            ],
            'opening_balance' => $openingBalance,
            'total_deposits' => $totalDeposits,
            'total_disbursements' => $totalDisbursements,
            'closing_balance' => (float)$ledger['current_balance'],
            'transactions' => $transactions,
            'transaction_count' => count($transactions)
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Account summary - all client ledgers for a trust account
 */
function getAccountSummary(PDO $pdo): void {
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;

    if (!$accountId) {
        errorResponse('account_id is required');
    }

    // Get account info
    $accountSql = "SELECT * FROM accounts WHERE id = :id";
    $accountStmt = $pdo->prepare($accountSql);
    $accountStmt->execute(['id' => $accountId]);
    $account = $accountStmt->fetch(PDO::FETCH_ASSOC);

    if (!$account) {
        errorResponse('Account not found', 404);
    }

    // Get all client ledgers
    $ledgerSql = "SELECT
                    l.*,
                    c.client_name, c.client_number, c.case_number,
                    (SELECT COUNT(*) FROM trust_transactions WHERE ledger_id = l.id) as transaction_count,
                    (SELECT MAX(transaction_date) FROM trust_transactions WHERE ledger_id = l.id) as last_activity
                  FROM trust_ledger l
                  JOIN trust_clients c ON l.client_id = c.id
                  WHERE l.account_id = :account_id
                  ORDER BY l.is_active DESC, c.client_name";
    $ledgerStmt = $pdo->prepare($ledgerSql);
    $ledgerStmt->execute(['account_id' => $accountId]);
    $ledgers = $ledgerStmt->fetchAll(PDO::FETCH_ASSOC);

    $totalBalance = 0;
    $activeLedgers = 0;
    foreach ($ledgers as &$ledger) {
        $ledger['current_balance'] = (float)$ledger['current_balance'];
        $totalBalance += $ledger['current_balance'];
        if ($ledger['is_active']) $activeLedgers++;
    }

    // Check if balanced with account
    $accountBalance = (float)$account['current_balance'];
    $difference = $accountBalance - $totalBalance;
    $isBalanced = abs($difference) < 0.01;

    successResponse([
        'summary' => [
            'account' => $account,
            'ledgers' => $ledgers,
            'totals' => [
                'ledger_count' => count($ledgers),
                'active_ledgers' => $activeLedgers,
                'total_client_balance' => $totalBalance,
                'account_balance' => $accountBalance,
                'difference' => $difference,
                'is_balanced' => $isBalanced
            ]
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Audit trail - all trust activities
 */
function getAuditTrail(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $clientId = !empty($_GET['client_id']) ? (int)$_GET['client_id'] : null;
    $startDate = $_GET['start_date'] ?? date('Y-m-01');
    $endDate = $_GET['end_date'] ?? date('Y-m-d');
    $limit = !empty($_GET['limit']) ? min((int)$_GET['limit'], 1000) : 100;

    $where = ["DATE(a.created_at) BETWEEN :start_date AND :end_date"];
    $params = [
        'start_date' => $startDate,
        'end_date' => $endDate
    ];

    if ($userId) {
        $where[] = 'a.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($clientId) {
        $where[] = 'a.client_id = :client_id';
        $params['client_id'] = $clientId;
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT a.*, u.display_name as username, c.client_name
            FROM trust_audit_log a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN trust_clients c ON a.client_id = c.id
            WHERE $whereClause
            ORDER BY a.created_at DESC
            LIMIT $limit";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get summary by action
    $summarySql = "SELECT a.action, COUNT(*) as count
                   FROM trust_audit_log a
                   LEFT JOIN users u ON a.user_id = u.id
                   LEFT JOIN trust_clients c ON a.client_id = c.id
                   WHERE $whereClause
                   GROUP BY a.action
                   ORDER BY count DESC";
    $summaryStmt = $pdo->prepare($summarySql);
    $summaryStmt->execute($params);
    $summary = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);

    successResponse([
        'audit_trail' => [
            'period' => [
                'start_date' => $startDate,
                'end_date' => $endDate
            ],
            'entries' => $entries,
            'summary' => $summary,
            'total_entries' => count($entries)
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Balance summary - overview of all trust accounts
 */
function getBalanceSummary(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    // Only get actual IOLTA bank accounts, not client sub-accounts marked as 'trust'
    $where = ["a.account_type = 'iolta'"];
    $params = [];

    if ($userId) {
        $where[] = 'a.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    $whereClause = implode(' AND ', $where);

    // Get all trust accounts with ledger totals
    $sql = "SELECT
                a.id, a.account_name, a.account_number_last4, a.account_type,
                a.current_balance as account_balance,
                COUNT(DISTINCT l.id) as ledger_count,
                COUNT(DISTINCT CASE WHEN l.is_active = 1 THEN l.id END) as active_ledgers,
                COALESCE(SUM(l.current_balance), 0) as client_total
            FROM accounts a
            LEFT JOIN trust_ledger l ON a.id = l.account_id
            WHERE $whereClause
            GROUP BY a.id
            ORDER BY a.account_name";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $grandTotalAccount = 0;
    $grandTotalClient = 0;
    $totalLedgers = 0;

    foreach ($accounts as &$account) {
        $account['account_balance'] = (float)$account['account_balance'];
        $account['client_total'] = (float)$account['client_total'];
        $account['difference'] = $account['account_balance'] - $account['client_total'];
        $account['is_balanced'] = abs($account['difference']) < 0.01;

        $grandTotalAccount += $account['account_balance'];
        $grandTotalClient += $account['client_total'];
        $totalLedgers += (int)$account['ledger_count'];
    }

    successResponse([
        'balance_summary' => [
            'accounts' => $accounts,
            'totals' => [
                'account_count' => count($accounts),
                'total_ledgers' => $totalLedgers,
                'grand_total_account' => $grandTotalAccount,
                'grand_total_client' => $grandTotalClient,
                'grand_difference' => $grandTotalAccount - $grandTotalClient
            ]
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Client breakdown - detailed analysis by Legal Fee, Cost, and Client Payout
 * Shows remaining balances categorized by type
 */
function getClientBreakdown(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $balanceFilter = $_GET['balance_filter'] ?? 'all'; // all, zero, nonzero

    if (!$userId) {
        errorResponse('user_id is required');
    }

    // Get all client ledgers with their current balances
    $ledgerSql = "SELECT
                    l.id as ledger_id,
                    l.current_balance,
                    l.is_active,
                    c.id as client_id,
                    c.client_name,
                    c.case_number,
                    c.is_active as client_active
                  FROM trust_ledger l
                  JOIN trust_clients c ON l.client_id = c.id
                  WHERE l.user_id = :user_id
                  ORDER BY c.case_number DESC, c.client_name";

    $ledgerStmt = $pdo->prepare($ledgerSql);
    $ledgerStmt->execute(['user_id' => $userId]);
    $ledgers = $ledgerStmt->fetchAll(PDO::FETCH_ASSOC);

    // First pass: count all clients for filter buttons
    $allClientsCount = count($ledgers);
    $clientsWithBalanceCount = 0;
    $clientsZeroBalanceCount = 0;
    foreach ($ledgers as $ledger) {
        if (abs((float)$ledger['current_balance']) < 0.01) {
            $clientsZeroBalanceCount++;
        } else {
            $clientsWithBalanceCount++;
        }
    }

    // For each ledger, calculate breakdown of remaining balance
    $clients = [];
    $totals = [
        'total_balance' => 0,
        'total_legal_fee' => 0,
        'total_cost' => 0,
        'total_client_payout' => 0,
        'clients_with_balance' => $clientsWithBalanceCount,
        'clients_zero_balance' => $clientsZeroBalanceCount,
        'total_clients' => $allClientsCount
    ];

    foreach ($ledgers as $ledger) {
        $ledgerId = $ledger['ledger_id'];
        $currentBalance = (float)$ledger['current_balance'];

        // Apply balance filter
        if ($balanceFilter === 'zero' && abs($currentBalance) >= 0.01) continue;
        if ($balanceFilter === 'nonzero' && abs($currentBalance) < 0.01) continue;

        // Get all transactions for this ledger to calculate what's pending
        $transSql = "SELECT
                        t.transaction_type,
                        t.amount,
                        t.payee,
                        t.description,
                        t.status
                     FROM trust_transactions t
                     WHERE t.ledger_id = :ledger_id
                     ORDER BY t.transaction_date, t.id";

        $transStmt = $pdo->prepare($transSql);
        $transStmt->execute(['ledger_id' => $ledgerId]);
        $transactions = $transStmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate totals by type
        $totalDeposits = 0;
        $legalFeePaid = 0;
        $costPaid = 0;
        $clientPayoutPaid = 0;

        foreach ($transactions as $trans) {
            $amount = (float)$trans['amount'];
            $txType = $trans['transaction_type'] ?? '';

            if ($amount > 0) {
                // Deposit
                $totalDeposits += $amount;
            } else {
                // Disbursement - categorize by transaction_type first, then fallback to payee analysis
                $absAmount = abs($amount);

                // Primary: Use explicit transaction_type
                if ($txType === 'legal_fee' || $txType === 'earned_fee') {
                    $legalFeePaid += $absAmount;
                } elseif ($txType === 'cost') {
                    $costPaid += $absAmount;
                } elseif ($txType === 'payout') {
                    $clientPayoutPaid += $absAmount;
                } else {
                    // Fallback for old data: analyze payee/description
                    $payee = strtolower($trans['payee'] ?? '');
                    $desc = strtolower($trans['description'] ?? '');

                    if (strpos($payee, 'bridge law') !== false ||
                        strpos($desc, 'legal fee') !== false) {
                        $legalFeePaid += $absAmount;
                    } elseif (isMedialProvider($payee) || isCostPayment($payee, $desc)) {
                        $costPaid += $absAmount;
                    } else {
                        $clientPayoutPaid += $absAmount;
                    }
                }
            }
        }

        // Calculate remaining amounts (what's still in the balance)
        // The current balance represents funds still held

        // For cases with remaining balance, estimate what it's for
        // based on typical settlement structure
        $legalFeeRemaining = 0;
        $costRemaining = 0;
        $clientPayoutRemaining = $currentBalance; // Default: all to client

        // If there's a positive balance, it's typically waiting to be disbursed
        if ($currentBalance > 0) {
            // Check pending disbursements
            $pendingSql = "SELECT
                            t.payee,
                            t.description,
                            t.transaction_type,
                            ABS(t.amount) as amount
                           FROM trust_transactions t
                           WHERE t.ledger_id = :ledger_id
                           AND t.status = 'pending'
                           AND t.amount < 0";
            $pendingStmt = $pdo->prepare($pendingSql);
            $pendingStmt->execute(['ledger_id' => $ledgerId]);
            $pendingTrans = $pendingStmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($pendingTrans as $pending) {
                $amount = (float)$pending['amount'];
                $txType = $pending['transaction_type'] ?? '';

                // Primary: Use explicit transaction_type
                if ($txType === 'legal_fee' || $txType === 'earned_fee') {
                    $legalFeeRemaining += $amount;
                } elseif ($txType === 'cost') {
                    $costRemaining += $amount;
                } elseif ($txType === 'payout') {
                    // Don't add to clientPayoutRemaining here - handled below
                } else {
                    // Fallback for old data
                    $payee = strtolower($pending['payee'] ?? '');
                    $desc = strtolower($pending['description'] ?? '');

                    if (strpos($payee, 'bridge law') !== false ||
                        strpos($desc, 'legal fee') !== false) {
                        $legalFeeRemaining += $amount;
                    } elseif (isMedialProvider($payee) || isCostPayment($payee, $desc)) {
                        $costRemaining += $amount;
                    }
                }
            }

            // Adjust client payout remaining (total balance minus identified pending)
            $identifiedPending = $legalFeeRemaining + $costRemaining;
            $clientPayoutRemaining = max(0, $currentBalance - $identifiedPending);
        }

        $clientData = [
            'client_id' => $ledger['client_id'],
            'ledger_id' => $ledgerId,
            'client_name' => $ledger['client_name'],
            'case_number' => $ledger['case_number'],
            'current_balance' => $currentBalance,
            'is_active' => $ledger['is_active'] && $ledger['client_active'],
            'total_deposits' => $totalDeposits,
            'legal_fee_paid' => $legalFeePaid,
            'cost_paid' => $costPaid,
            'client_payout_paid' => $clientPayoutPaid,
            'legal_fee_remaining' => $legalFeeRemaining,
            'cost_remaining' => $costRemaining,
            'client_payout_remaining' => $clientPayoutRemaining
        ];

        $clients[] = $clientData;

        // Update filtered totals (only for clients matching filter)
        $totals['total_balance'] += $currentBalance;
        $totals['total_legal_fee'] += $legalFeeRemaining;
        $totals['total_cost'] += $costRemaining;
        $totals['total_client_payout'] += $clientPayoutRemaining;
    }

    successResponse([
        'client_breakdown' => [
            'clients' => $clients,
            'totals' => $totals,
            'filter' => $balanceFilter
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Check if payee is a medical provider (for Cost categorization)
 */
function isMedialProvider(string $payee): bool {
    $medicalKeywords = [
        'chiropractic', 'chiropractor', 'd.c.', 'dc,',
        'medical', 'imaging', 'radiology', 'diagnostic',
        'physical therapy', 'therapy', 'rehab',
        'hospital', 'clinic', 'health',
        'pain', 'orthopedic', 'spine',
        'acupuncture', 'l.ac', 'lac,',
        'optum', 'ati physical'
    ];

    foreach ($medicalKeywords as $keyword) {
        if (strpos($payee, $keyword) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * Check if payment is a cost/expense (not client payout)
 */
function isCostPayment(string $payee, string $desc): bool {
    $costKeywords = [
        'records', 'copy service', 'subpoena',
        'filing fee', 'court cost', 'expert',
        'interpreter', 'translation',
        'police report', 'medical record'
    ];

    foreach ($costKeywords as $keyword) {
        if (strpos($payee, $keyword) !== false || strpos($desc, $keyword) !== false) {
            return true;
        }
    }
    return false;
}
