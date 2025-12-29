<?php
/**
 * Cost Dashboard API
 * Returns summary statistics for Cost Account dashboard
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

// Get summary statistics
$stats = [];

// 1. Account Balance (total from all cost accounts)
$balanceResult = $db->fetch(
    "SELECT COALESCE(SUM(ct.amount), 0) as total_balance
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id AND ca.is_active = 1",
    ['user_id' => $userId]
);
$stats['account_balance'] = floatval($balanceResult['total_balance'] ?? 0);

// 2. This Month Expenses (negative amounts this month)
$thisMonthResult = $db->fetch(
    "SELECT COALESCE(SUM(ABS(ct.amount)), 0) as this_month_expenses
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.amount < 0
       AND MONTH(ct.transaction_date) = MONTH(CURRENT_DATE())
       AND YEAR(ct.transaction_date) = YEAR(CURRENT_DATE())",
    ['user_id' => $userId]
);
$stats['this_month_expenses'] = floatval($thisMonthResult['this_month_expenses'] ?? 0);

// 3. Active Clients (clients with cost transactions)
$clientsResult = $db->fetch(
    "SELECT COUNT(DISTINCT ct.client_id) as active_clients
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id AND ca.is_active = 1 AND ct.client_id IS NOT NULL",
    ['user_id' => $userId]
);
$stats['active_clients'] = intval($clientsResult['active_clients'] ?? 0);

// 4. Unreconciled Items (status != 'reconciled')
$unreconciledResult = $db->fetch(
    "SELECT COUNT(*) as unreconciled_count
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND (ct.status IS NULL OR ct.status != 'reconciled')",
    ['user_id' => $userId]
);
$stats['unreconciled_items'] = intval($unreconciledResult['unreconciled_count'] ?? 0);

// 5. Advanced vs Reimbursed summary
$advancedReimbursed = $db->fetch(
    "SELECT
        COALESCE(SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END), 0) as total_advanced,
        COALESCE(SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END), 0) as total_reimbursed
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id AND ca.is_active = 1",
    ['user_id' => $userId]
);
$stats['total_advanced'] = floatval($advancedReimbursed['total_advanced'] ?? 0);
$stats['total_reimbursed'] = floatval($advancedReimbursed['total_reimbursed'] ?? 0);
$stats['outstanding_balance'] = $stats['total_advanced'] - $stats['total_reimbursed'];

// 6. Recent Transactions (last 10)
$recentTransactions = $db->fetchAll(
    "SELECT ct.id, ct.transaction_date, ct.description, ct.amount, ct.vendor_name,
            ca.account_name, tc.client_name, tc.case_number
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     LEFT JOIN trust_clients tc ON ct.client_id = tc.id
     WHERE ca.user_id = :user_id AND ca.is_active = 1
     ORDER BY ct.transaction_date DESC, ct.id DESC
     LIMIT 10",
    ['user_id' => $userId]
);
$stats['recent_transactions'] = $recentTransactions ?: [];

// 7. Monthly Trend (last 6 months)
$monthlyTrend = $db->fetchAll(
    "SELECT
        DATE_FORMAT(ct.transaction_date, '%Y-%m') as month,
        SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END) as expenses,
        SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END) as income
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
     GROUP BY DATE_FORMAT(ct.transaction_date, '%Y-%m')
     ORDER BY month ASC",
    ['user_id' => $userId]
);
$stats['monthly_trend'] = $monthlyTrend ?: [];

// 8. Accounts list for dropdowns
$accounts = $db->fetchAll(
    "SELECT id, account_name, account_type, color
     FROM cost_accounts
     WHERE user_id = :user_id AND is_active = 1
     ORDER BY account_name",
    ['user_id' => $userId]
);
$stats['accounts'] = $accounts ?: [];

// 9. Clients list for dropdowns
$clients = $db->fetchAll(
    "SELECT id, client_name, case_number
     FROM trust_clients
     WHERE user_id = :user_id AND is_active = 1
     ORDER BY client_name",
    ['user_id' => $userId]
);
$stats['clients'] = $clients ?: [];

// 10. Duplicate check data (transactions with same amount and date)
$duplicates = $db->fetchAll(
    "SELECT ct.transaction_date, ct.amount, COUNT(*) as count
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id AND ca.is_active = 1
     GROUP BY ct.transaction_date, ct.amount
     HAVING COUNT(*) > 1
     LIMIT 10",
    ['user_id' => $userId]
);
$stats['potential_duplicates'] = $duplicates ?: [];
$stats['duplicate_count'] = count($duplicates);

// 11. Expense by Category (for pie chart)
$expenseByCategory = $db->fetchAll(
    "SELECT
        COALESCE(ct.category, 'Uncategorized') as category,
        SUM(ABS(ct.amount)) as total
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.amount < 0
     GROUP BY ct.category
     ORDER BY total DESC",
    ['user_id' => $userId]
);
$stats['expense_by_category'] = $expenseByCategory ?: [];

// 12. Pending Checks (status = 'pending', for checks written but not yet printed)
$pendingChecks = $db->fetchAll(
    "SELECT ct.id, ct.check_number, ct.transaction_date, ct.amount, ct.description,
            ct.payee, ca.account_name, tc.client_name, tc.case_number
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     LEFT JOIN trust_clients tc ON ct.client_id = tc.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.status = 'pending'
       AND ct.check_number IS NOT NULL
     ORDER BY ct.transaction_date DESC, ct.id DESC
     LIMIT 20",
    ['user_id' => $userId]
);
$stats['pending_checks'] = $pendingChecks ?: [];
$stats['pending_checks_count'] = count($pendingChecks);

// 13. Printed Checks (status = 'printed', printed but not yet cleared)
$printedChecks = $db->fetchAll(
    "SELECT ct.id, ct.check_number, ct.transaction_date, ct.amount, ct.description,
            ct.payee, ca.account_name, tc.client_name, tc.case_number
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     LEFT JOIN trust_clients tc ON ct.client_id = tc.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.status = 'printed'
       AND ct.check_number IS NOT NULL
     ORDER BY ct.transaction_date DESC, ct.id DESC
     LIMIT 20",
    ['user_id' => $userId]
);
$stats['printed_checks'] = $printedChecks ?: [];
$stats['printed_checks_count'] = count($printedChecks);

// 14. Cleared Checks count (for stats)
$clearedResult = $db->fetch(
    "SELECT COUNT(*) as cleared_count
     FROM cost_transactions ct
     JOIN cost_accounts ca ON ct.account_id = ca.id
     WHERE ca.user_id = :user_id
       AND ca.is_active = 1
       AND ct.status = 'cleared'
       AND ct.check_number IS NOT NULL",
    ['user_id' => $userId]
);
$stats['cleared_checks_count'] = intval($clearedResult['cleared_count'] ?? 0);

jsonResponse(['success' => true, 'data' => $stats]);
