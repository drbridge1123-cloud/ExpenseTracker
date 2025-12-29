<?php
/**
 * IOLTA Dashboard API
 * Returns all dashboard statistics in a single request for fast loading
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$db = Database::getInstance();

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

$userId = $_GET['user_id'] ?? null;

if (!$userId) {
    jsonResponse(['success' => false, 'message' => 'user_id is required'], 400);
}

$stats = [];

// 1. Total Client Funds (sum of all client balances from trust_ledger)
$fundsResult = $db->fetch(
    "SELECT COALESCE(SUM(tl.current_balance), 0) as total_funds
     FROM trust_ledger tl
     JOIN trust_clients tc ON tl.client_id = tc.id
     WHERE tc.user_id = :user_id AND tc.is_active = 1 AND tl.is_active = 1",
    ['user_id' => $userId]
);
$stats['total_client_funds'] = floatval($fundsResult['total_funds'] ?? 0);

// 2. Active Clients (clients with non-zero balance in trust_ledger)
$activeResult = $db->fetch(
    "SELECT COUNT(DISTINCT tl.client_id) as active_count
     FROM trust_ledger tl
     JOIN trust_clients tc ON tl.client_id = tc.id
     WHERE tc.user_id = :user_id AND tc.is_active = 1 AND tl.is_active = 1 AND tl.current_balance != 0",
    ['user_id' => $userId]
);
$stats['active_clients'] = intval($activeResult['active_count'] ?? 0);

// 3. Open Ledgers (total client count)
$ledgersResult = $db->fetch(
    "SELECT COUNT(*) as total_ledgers
     FROM trust_clients tc
     WHERE tc.user_id = :user_id AND tc.is_active = 1",
    ['user_id' => $userId]
);
$stats['open_ledgers'] = intval($ledgersResult['total_ledgers'] ?? 0);

// 4. Trust Account Count
$accountsResult = $db->fetch(
    "SELECT COUNT(*) as account_count
     FROM accounts a
     WHERE a.user_id = :user_id AND a.account_type = 'iolta' AND a.is_active = 1",
    ['user_id' => $userId]
);
$stats['trust_account_count'] = intval($accountsResult['account_count'] ?? 0);

// 5. Pending Checks (status = 'pending', amount < 0)
$pendingResult = $db->fetch(
    "SELECT COUNT(*) as pending_count, COALESCE(SUM(ABS(tt.amount)), 0) as pending_amount
     FROM trust_transactions tt
     WHERE tt.user_id = :user_id AND tt.status = 'pending' AND tt.amount < 0",
    ['user_id' => $userId]
);
$stats['pending_checks'] = intval($pendingResult['pending_count'] ?? 0);
$stats['pending_amount'] = floatval($pendingResult['pending_amount'] ?? 0);

// 6. Printed Checks (status = 'printed', amount < 0)
$printedResult = $db->fetch(
    "SELECT COUNT(*) as printed_count, COALESCE(SUM(ABS(tt.amount)), 0) as printed_amount
     FROM trust_transactions tt
     WHERE tt.user_id = :user_id AND tt.status = 'printed' AND tt.amount < 0",
    ['user_id' => $userId]
);
$stats['printed_checks'] = intval($printedResult['printed_count'] ?? 0);
$stats['printed_amount'] = floatval($printedResult['printed_amount'] ?? 0);

// 7. Pending Checks List (for display)
$pendingChecksList = $db->fetchAll(
    "SELECT tt.id, tt.check_number, tt.reference_number, tt.description, tt.payee,
            ABS(tt.amount) as amount, tt.transaction_date as check_date, tt.status,
            tc.client_name, tt.ledger_id
     FROM trust_transactions tt
     LEFT JOIN trust_ledger tl ON tt.ledger_id = tl.id
     LEFT JOIN trust_clients tc ON tl.client_id = tc.id
     WHERE tt.user_id = :user_id
       AND tt.status IN ('pending', 'printed')
       AND tt.amount < 0
     ORDER BY tt.transaction_date DESC
     LIMIT 50",
    ['user_id' => $userId]
);
$stats['pending_checks_list'] = $pendingChecksList ?: [];

// 8. Recent Transactions (last 10)
$recentTransactions = $db->fetchAll(
    "SELECT tt.id, tt.transaction_date, tt.description, tt.amount, tt.transaction_type,
            tt.check_number, tt.reference_number, tt.status, tt.payee,
            tc.client_name, tc.case_number, tt.ledger_id
     FROM trust_transactions tt
     LEFT JOIN trust_ledger tl ON tt.ledger_id = tl.id
     LEFT JOIN trust_clients tc ON tl.client_id = tc.id
     WHERE tt.user_id = :user_id
     ORDER BY tt.transaction_date DESC, tt.id DESC
     LIMIT 10",
    ['user_id' => $userId]
);
$stats['recent_transactions'] = $recentTransactions ?: [];

// 9. Clients list (for state) - with balance from trust_ledger
$clients = $db->fetchAll(
    "SELECT tc.id, tc.client_name, tc.case_number,
            COALESCE(tl.current_balance, 0) as balance, tc.is_active
     FROM trust_clients tc
     LEFT JOIN trust_ledger tl ON tc.id = tl.client_id AND tl.is_active = 1
     WHERE tc.user_id = :user_id AND tc.is_active = 1
     ORDER BY tc.client_name",
    ['user_id' => $userId]
);
$stats['clients'] = $clients ?: [];

// 10. Trust Accounts list (for state)
$trustAccounts = $db->fetchAll(
    "SELECT a.id, a.account_name, a.account_number_last4, a.current_balance as balance
     FROM accounts a
     WHERE a.user_id = :user_id AND a.account_type = 'iolta' AND a.is_active = 1
     ORDER BY a.account_name",
    ['user_id' => $userId]
);
$stats['trust_accounts'] = $trustAccounts ?: [];

// 11. Reconciliation Issues (placeholder - can be expanded)
$stats['reconcile_issues'] = 0;

jsonResponse(['success' => true, 'data' => $stats]);
