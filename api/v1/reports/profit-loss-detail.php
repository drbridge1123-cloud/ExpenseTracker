<?php
/**
 * Detailed Profit & Loss Report API (QuickBooks Style)
 * GET /api/reports/profit-loss-detail.php
 *
 * Returns all individual transactions grouped by category hierarchy
 * for QuickBooks-style detailed P&L export
 *
 * Parameters:
 *   - user_id: required
 *   - start_date: required (YYYY-MM-DD)
 *   - end_date: required (YYYY-MM-DD)
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;

if (!$userId) {
    errorResponse('User ID is required');
}

if (!$startDate || !$endDate) {
    errorResponse('Start date and end date are required');
}

try {
    $db = Database::getInstance();

    // Get all income transactions with details
    $incomeTransactions = $db->fetchAll(
        "SELECT
            t.id,
            t.transaction_date,
            t.amount,
            t.description,
            t.original_description,
            t.transaction_type,
            t.check_number,
            t.memo,
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.parent_id,
            a.account_name as account_name,
            a.account_type
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
            AND c.category_type = 'income'
         ORDER BY c.parent_id, c.name, t.transaction_date",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Get all expense transactions with details
    $expenseTransactions = $db->fetchAll(
        "SELECT
            t.id,
            t.transaction_date,
            t.amount,
            t.description,
            t.original_description,
            t.transaction_type,
            t.check_number,
            t.memo,
            t.vendor_name,
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.parent_id,
            a.account_name as account_name,
            a.account_type
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
            AND c.category_type = 'expense'
         ORDER BY c.parent_id, c.name, t.transaction_date",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Build hierarchical income structure with transactions
    $incomeHierarchy = buildDetailedHierarchy($incomeTransactions, $db);

    // Build hierarchical expense structure with transactions
    $expenseHierarchy = buildDetailedHierarchy($expenseTransactions, $db);

    // Calculate totals
    $totalIncome = 0;
    foreach ($incomeHierarchy as $cat) {
        $totalIncome += $cat['total'];
    }

    $totalExpenses = 0;
    foreach ($expenseHierarchy as $cat) {
        $totalExpenses += $cat['total'];
    }

    $netIncome = $totalIncome - $totalExpenses;

    successResponse([
        'period' => [
            'start' => $startDate,
            'end' => $endDate
        ],
        'income' => [
            'categories' => $incomeHierarchy,
            'total' => $totalIncome
        ],
        'expenses' => [
            'categories' => $expenseHierarchy,
            'total' => $totalExpenses
        ],
        'net_income' => $netIncome
    ]);

} catch (Exception $e) {
    appLog('Detailed P&L Report error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * Build hierarchical category structure with individual transactions
 */
function buildDetailedHierarchy(array $transactions, Database $db): array {
    $categories = [];
    $parentCategories = [];

    // Group transactions by category
    foreach ($transactions as $txn) {
        $catId = $txn['category_id'];
        $parentId = $txn['parent_id'];

        if (!isset($categories[$catId])) {
            $categories[$catId] = [
                'category_id' => $catId,
                'category_name' => $txn['category_name'],
                'category_icon' => $txn['category_icon'],
                'parent_id' => $parentId,
                'transactions' => [],
                'total' => 0,
                'running_balance' => 0
            ];
        }

        $amount = abs((float)$txn['amount']);
        $categories[$catId]['total'] += $amount;
        $categories[$catId]['running_balance'] += $amount;

        // Determine transaction type label
        $typeLabel = 'Transaction';
        if ($txn['transaction_type'] === 'debit') {
            if (!empty($txn['check_number'])) {
                $typeLabel = 'Check';
            } elseif (stripos($txn['account_name'] ?? '', 'credit') !== false ||
                      stripos($txn['account_name'] ?? '', 'amex') !== false) {
                $typeLabel = 'Credit Card Charge';
            } else {
                $typeLabel = 'Check';
            }
        } elseif ($txn['transaction_type'] === 'credit') {
            $typeLabel = 'Deposit';
        }

        $categories[$catId]['transactions'][] = [
            'id' => $txn['id'],
            'type' => $typeLabel,
            'date' => $txn['transaction_date'],
            'check_number' => $txn['check_number'],
            'name' => $txn['vendor_name'] ?? '',
            'description' => $txn['description'],
            'memo' => $txn['memo'] ?? $txn['original_description'],
            'account' => $txn['account_name'] ?? 'Unknown',
            'amount' => $amount,
            'running_balance' => $categories[$catId]['running_balance']
        ];

        // Track parent categories
        if ($parentId) {
            $parentCategories[$parentId] = true;
        }
    }

    // Get parent category info for categories that need it
    foreach ($parentCategories as $parentId => $_) {
        if (!isset($categories[$parentId])) {
            $parent = $db->fetch(
                "SELECT id, name, icon FROM categories WHERE id = :id",
                ['id' => $parentId]
            );
            if ($parent) {
                $categories[$parentId] = [
                    'category_id' => $parent['id'],
                    'category_name' => $parent['name'],
                    'category_icon' => $parent['icon'],
                    'parent_id' => null,
                    'transactions' => [],
                    'total' => 0,
                    'children' => []
                ];
            }
        }
    }

    // Build hierarchy
    $hierarchy = [];
    foreach ($categories as $catId => $cat) {
        if (empty($cat['parent_id'])) {
            // This is a parent category
            $hierarchy[$catId] = $cat;
            $hierarchy[$catId]['children'] = [];
        }
    }

    // Attach children to parents
    foreach ($categories as $catId => $cat) {
        if (!empty($cat['parent_id']) && isset($hierarchy[$cat['parent_id']])) {
            $hierarchy[$cat['parent_id']]['children'][] = $cat;
            $hierarchy[$cat['parent_id']]['total'] += $cat['total'];
        } elseif (empty($cat['parent_id']) && !isset($hierarchy[$catId])) {
            // Standalone category
            $hierarchy[$catId] = $cat;
            $hierarchy[$catId]['children'] = [];
        }
    }

    // Handle orphan children (parent not in results)
    foreach ($categories as $catId => $cat) {
        if (!empty($cat['parent_id']) && !isset($hierarchy[$cat['parent_id']])) {
            // Add as top-level
            $hierarchy[$catId] = $cat;
            $hierarchy[$catId]['children'] = [];
        }
    }

    // Sort by total descending
    $result = array_values($hierarchy);
    usort($result, fn($a, $b) => $b['total'] <=> $a['total']);

    // Sort children by total descending
    foreach ($result as &$cat) {
        if (!empty($cat['children'])) {
            usort($cat['children'], fn($a, $b) => $b['total'] <=> $a['total']);
        }
    }

    return $result;
}
