<?php
/**
 * Profit & Loss (P&L) Report API
 * GET /api/reports/profit-loss.php
 *
 * Parameters:
 *   - user_id: required
 *   - start_date: required (YYYY-MM-DD)
 *   - end_date: required (YYYY-MM-DD)
 *   - compare: optional ('previous_period', 'previous_year')
 *   - include_transactions: optional (1 to include transaction details)
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;
$compare = $_GET['compare'] ?? null;
$includeTransactions = isset($_GET['include_transactions']) && $_GET['include_transactions'] == '1';

if (!$userId) {
    errorResponse('User ID is required');
}

if (!$startDate || !$endDate) {
    errorResponse('Start date and end date are required');
}

try {
    $db = Database::getInstance();

    // Get income by category with sub-categories
    $incomeData = $db->fetchAll(
        "SELECT
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.parent_id,
            pc.name as parent_name,
            pc.icon as parent_icon,
            COALESCE(SUM(t.amount), 0) as total
         FROM categories c
         LEFT JOIN categories pc ON c.parent_id = pc.id
         LEFT JOIN transactions t ON t.category_id = c.id
            AND t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'income'
            AND (c.user_id = :user_id2 OR c.is_system = 1)
         GROUP BY c.id, c.name, c.icon, c.parent_id, pc.name, pc.icon
         HAVING total > 0
         ORDER BY COALESCE(pc.name, c.name), c.name",
        [
            'user_id' => $userId,
            'user_id2' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Get expenses by category with sub-categories
    $expenseData = $db->fetchAll(
        "SELECT
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.parent_id,
            pc.name as parent_name,
            pc.icon as parent_icon,
            COALESCE(SUM(ABS(t.amount)), 0) as total
         FROM categories c
         LEFT JOIN categories pc ON c.parent_id = pc.id
         LEFT JOIN transactions t ON t.category_id = c.id
            AND t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'expense'
            AND (c.user_id = :user_id2 OR c.is_system = 1)
         GROUP BY c.id, c.name, c.icon, c.parent_id, pc.name, pc.icon
         HAVING total > 0
         ORDER BY COALESCE(pc.name, c.name), c.name",
        [
            'user_id' => $userId,
            'user_id2' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Get transactions for each category if requested
    $transactionsByCategory = [];
    if ($includeTransactions) {
        $allTransactions = $db->fetchAll(
            "SELECT
                t.id,
                t.transaction_date,
                t.description,
                t.vendor_name,
                t.amount,
                t.category_id,
                t.check_number,
                t.reference_number,
                c.category_type
             FROM transactions t
             JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = :user_id
                AND t.transaction_date BETWEEN :start_date AND :end_date
                AND c.category_type IN ('income', 'expense')
             ORDER BY t.transaction_date DESC",
            [
                'user_id' => $userId,
                'start_date' => $startDate,
                'end_date' => $endDate
            ]
        );

        foreach ($allTransactions as $txn) {
            $catId = $txn['category_id'];
            if (!isset($transactionsByCategory[$catId])) {
                $transactionsByCategory[$catId] = [];
            }
            $transactionsByCategory[$catId][] = [
                'id' => $txn['id'],
                'date' => $txn['transaction_date'],
                'description' => $txn['description'],
                'vendor' => $txn['vendor_name'],
                'amount' => abs((float)$txn['amount']),
                'ref' => $txn['check_number'] ?: $txn['reference_number']
            ];
        }
    }

    // Calculate totals
    $totalIncome = array_sum(array_column($incomeData, 'total'));
    $totalExpenses = array_sum(array_column($expenseData, 'total'));
    $netIncome = $totalIncome - $totalExpenses;

    // Get monthly breakdown for chart
    $monthlyData = $db->fetchAll(
        "SELECT
            DATE_FORMAT(t.transaction_date, '%Y-%m') as month,
            DATE_FORMAT(t.transaction_date, '%b %Y') as month_label,
            SUM(CASE WHEN c.category_type = 'income' THEN t.amount ELSE 0 END) as income,
            SUM(CASE WHEN c.category_type = 'expense' THEN ABS(t.amount) ELSE 0 END) as expenses
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
         GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m'), DATE_FORMAT(t.transaction_date, '%b %Y')
         ORDER BY month",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Add net to monthly data
    foreach ($monthlyData as &$m) {
        $m['income'] = (float)$m['income'];
        $m['expenses'] = (float)$m['expenses'];
        $m['net'] = $m['income'] - $m['expenses'];
    }

    // Comparison data if requested
    $comparison = null;
    if ($compare) {
        $start = new DateTime($startDate);
        $end = new DateTime($endDate);
        $interval = $start->diff($end);

        if ($compare === 'previous_year') {
            $prevStart = (clone $start)->modify('-1 year')->format('Y-m-d');
            $prevEnd = (clone $end)->modify('-1 year')->format('Y-m-d');
        } else {
            // previous_period - same length period before
            $days = $interval->days + 1;
            $prevEnd = (clone $start)->modify('-1 day')->format('Y-m-d');
            $prevStart = (clone $start)->modify("-{$days} days")->format('Y-m-d');
        }

        $prevTotals = $db->fetch(
            "SELECT
                SUM(CASE WHEN c.category_type = 'income' THEN t.amount ELSE 0 END) as income,
                SUM(CASE WHEN c.category_type = 'expense' THEN ABS(t.amount) ELSE 0 END) as expenses
             FROM transactions t
             JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = :user_id
                AND t.transaction_date BETWEEN :start_date AND :end_date",
            [
                'user_id' => $userId,
                'start_date' => $prevStart,
                'end_date' => $prevEnd
            ]
        );

        $prevIncome = (float)($prevTotals['income'] ?? 0);
        $prevExpenses = (float)($prevTotals['expenses'] ?? 0);
        $prevNet = $prevIncome - $prevExpenses;

        $comparison = [
            'period' => ['start' => $prevStart, 'end' => $prevEnd],
            'income' => $prevIncome,
            'expenses' => $prevExpenses,
            'net_income' => $prevNet,
            'income_change' => $prevIncome > 0 ? round(($totalIncome - $prevIncome) / $prevIncome * 100, 1) : 0,
            'expenses_change' => $prevExpenses > 0 ? round(($totalExpenses - $prevExpenses) / $prevExpenses * 100, 1) : 0,
            'net_change' => $prevNet != 0 ? round(($netIncome - $prevNet) / abs($prevNet) * 100, 1) : 0
        ];
    }

    // Format category data and add transactions
    foreach ($incomeData as &$item) {
        $item['total'] = (float)$item['total'];
        $item['percent'] = $totalIncome > 0 ? round($item['total'] / $totalIncome * 100, 1) : 0;
        if ($includeTransactions && isset($transactionsByCategory[$item['category_id']])) {
            $item['transactions'] = $transactionsByCategory[$item['category_id']];
        }
    }

    foreach ($expenseData as &$item) {
        $item['total'] = (float)$item['total'];
        $item['percent'] = $totalExpenses > 0 ? round($item['total'] / $totalExpenses * 100, 1) : 0;
        if ($includeTransactions && isset($transactionsByCategory[$item['category_id']])) {
            $item['transactions'] = $transactionsByCategory[$item['category_id']];
        }
    }

    // Build hierarchical structure for accordion view
    $incomeHierarchy = buildCategoryHierarchy($incomeData);
    $expenseHierarchy = buildCategoryHierarchy($expenseData);

    successResponse([
        'period' => [
            'start' => $startDate,
            'end' => $endDate
        ],
        'income' => [
            'categories' => $incomeData,
            'hierarchy' => $incomeHierarchy,
            'total' => $totalIncome
        ],
        'expenses' => [
            'categories' => $expenseData,
            'hierarchy' => $expenseHierarchy,
            'total' => $totalExpenses
        ],
        'net_income' => $netIncome,
        'monthly' => $monthlyData,
        'comparison' => $comparison,
        'summary' => [
            'gross_margin' => $totalIncome > 0 ? round($netIncome / $totalIncome * 100, 1) : 0,
            'expense_ratio' => $totalIncome > 0 ? round($totalExpenses / $totalIncome * 100, 1) : 0
        ]
    ]);

} catch (Exception $e) {
    appLog('P&L Report error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * Build hierarchical structure for categories
 * Groups sub-categories under their parent categories
 */
function buildCategoryHierarchy($categories) {
    $hierarchy = [];
    $parentCategories = [];
    $childCategories = [];

    // Separate parent and child categories
    foreach ($categories as $cat) {
        if (empty($cat['parent_id'])) {
            // This is a parent category or standalone category
            $parentCategories[$cat['category_id']] = [
                'id' => $cat['category_id'],
                'name' => $cat['category_name'],
                'icon' => $cat['category_icon'],
                'total' => $cat['total'],
                'percent' => $cat['percent'],
                'transactions' => $cat['transactions'] ?? [],
                'sub_categories' => []
            ];
        } else {
            // This is a child category
            $childCategories[] = $cat;
        }
    }

    // Assign children to their parents
    foreach ($childCategories as $child) {
        $parentId = $child['parent_id'];

        // If parent exists in our list, add as sub-category
        if (isset($parentCategories[$parentId])) {
            $parentCategories[$parentId]['sub_categories'][] = [
                'id' => $child['category_id'],
                'name' => $child['category_name'],
                'icon' => $child['category_icon'],
                'total' => $child['total'],
                'percent' => $child['percent'],
                'transactions' => $child['transactions'] ?? []
            ];
        } else {
            // Parent not in list (maybe has no transactions), create virtual parent group
            $virtualParentKey = 'parent_' . $parentId;
            if (!isset($parentCategories[$virtualParentKey])) {
                $parentCategories[$virtualParentKey] = [
                    'id' => $parentId,
                    'name' => $child['parent_name'] ?? 'Other',
                    'icon' => $child['parent_icon'] ?? '📁',
                    'total' => 0,
                    'percent' => 0,
                    'transactions' => [],
                    'sub_categories' => []
                ];
            }
            $parentCategories[$virtualParentKey]['sub_categories'][] = [
                'id' => $child['category_id'],
                'name' => $child['category_name'],
                'icon' => $child['category_icon'],
                'total' => $child['total'],
                'percent' => $child['percent'],
                'transactions' => $child['transactions'] ?? []
            ];
            $parentCategories[$virtualParentKey]['total'] += $child['total'];
        }
    }

    // Calculate totals for parents with sub-categories (if parent has no direct transactions)
    foreach ($parentCategories as &$parent) {
        if (!empty($parent['sub_categories']) && $parent['total'] == 0) {
            $parent['total'] = array_sum(array_column($parent['sub_categories'], 'total'));
        }
    }

    // Sort by total descending
    usort($parentCategories, function($a, $b) {
        return $b['total'] <=> $a['total'];
    });

    return array_values($parentCategories);
}
