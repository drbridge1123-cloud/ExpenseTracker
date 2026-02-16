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
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

/**
 * Build hierarchical category structure from flat list
 */
function buildCategoryHierarchy(array $categories, Database $db): array {
    $hierarchy = [];
    $childrenByParent = [];
    $parentIds = [];

    // First pass: separate parents and children
    foreach ($categories as $cat) {
        $cat['total'] = (float)$cat['total'];

        if (empty($cat['parent_id']) || $cat['parent_id'] == 0) {
            // This is a parent category
            $hierarchy[$cat['category_id']] = [
                'category_id' => $cat['category_id'],
                'category_name' => $cat['category_name'],
                'category_icon' => $cat['category_icon'],
                'total' => $cat['total'],
                'children' => []
            ];
        } else {
            // This is a child category
            $parentIds[$cat['parent_id']] = true;
            if (!isset($childrenByParent[$cat['parent_id']])) {
                $childrenByParent[$cat['parent_id']] = [];
            }
            $childrenByParent[$cat['parent_id']][] = $cat;
        }
    }

    // Get parent info for orphan children (parent has no transactions but children do)
    foreach ($parentIds as $parentId => $_) {
        if (!isset($hierarchy[$parentId])) {
            $parent = $db->fetch(
                "SELECT id, name, icon FROM categories WHERE id = :id",
                ['id' => $parentId]
            );
            if ($parent) {
                $hierarchy[$parentId] = [
                    'category_id' => $parent['id'],
                    'category_name' => $parent['name'],
                    'category_icon' => $parent['icon'],
                    'total' => 0,
                    'children' => []
                ];
            }
        }
    }

    // Second pass: attach children to parents
    foreach ($childrenByParent as $parentId => $children) {
        if (isset($hierarchy[$parentId])) {
            foreach ($children as $child) {
                $hierarchy[$parentId]['children'][] = [
                    'category_id' => $child['category_id'],
                    'category_name' => $child['category_name'],
                    'category_icon' => $child['category_icon'],
                    'total' => $child['total']
                ];
                // Add child total to parent total
                $hierarchy[$parentId]['total'] += $child['total'];
            }
            // Sort children by total descending
            usort($hierarchy[$parentId]['children'], fn($a, $b) => $b['total'] <=> $a['total']);
        }
    }

    // Convert to array and sort by total descending
    $result = array_values($hierarchy);
    usort($result, fn($a, $b) => $b['total'] <=> $a['total']);

    return $result;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;
$compare = $_GET['compare'] ?? null;

if (!$userId) {
    errorResponse('User ID is required');
}

if (!$startDate || !$endDate) {
    errorResponse('Start date and end date are required');
}

try {
    $db = Database::getInstance();

    // Get income by category
    $incomeData = $db->fetchAll(
        "SELECT
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            COALESCE(SUM(t.amount), 0) as total
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id
            AND t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'income'
            AND (c.user_id = :user_id2 OR c.is_system = 1)
         GROUP BY c.id, c.name, c.icon
         HAVING total > 0
         ORDER BY total DESC",
        [
            'user_id' => $userId,
            'user_id2' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Get expenses by category (with parent_id for hierarchy)
    $expenseData = $db->fetchAll(
        "SELECT
            c.id as category_id,
            c.name as category_name,
            c.icon as category_icon,
            c.parent_id,
            COALESCE(SUM(ABS(t.amount)), 0) as total
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id
            AND t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'expense'
            AND (c.user_id = :user_id2 OR c.is_system = 1)
         GROUP BY c.id, c.name, c.icon, c.parent_id
         HAVING total > 0
         ORDER BY total DESC",
        [
            'user_id' => $userId,
            'user_id2' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Build hierarchical expense structure
    $expenseHierarchy = buildCategoryHierarchy($expenseData, $db);

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

    // Format category data with percent
    foreach ($incomeData as &$item) {
        $item['total'] = (float)$item['total'];
        $item['percent'] = $totalIncome > 0 ? round($item['total'] / $totalIncome * 100, 1) : 0;
    }

    foreach ($expenseData as &$item) {
        $item['total'] = (float)$item['total'];
        $item['percent'] = $totalExpenses > 0 ? round($item['total'] / $totalExpenses * 100, 1) : 0;
    }

    // Add percent to hierarchical data
    foreach ($expenseHierarchy as &$parent) {
        $parent['percent'] = $totalExpenses > 0 ? round($parent['total'] / $totalExpenses * 100, 1) : 0;
        foreach ($parent['children'] as &$child) {
            $child['percent'] = $totalExpenses > 0 ? round($child['total'] / $totalExpenses * 100, 1) : 0;
        }
    }

    successResponse([
        'period' => [
            'start' => $startDate,
            'end' => $endDate
        ],
        'income' => [
            'categories' => $incomeData,
            'total' => $totalIncome
        ],
        'expenses' => [
            'categories' => $expenseData,
            'categories_hierarchy' => $expenseHierarchy,
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
