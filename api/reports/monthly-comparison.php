<?php
/**
 * Monthly Comparison Report API
 * GET /api/reports/monthly-comparison.php
 *
 * Query params:
 *   - user_id: required
 *   - months: number of months to compare (default: 6)
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$months = !empty($_GET['months']) ? (int)$_GET['months'] : 6;

if (!$userId) {
    errorResponse('User ID is required');
}

$months = min(max($months, 1), 24); // Limit between 1 and 24 months

try {
    $db = Database::getInstance();

    // Get monthly totals
    $monthlyData = $db->fetchAll(
        "SELECT
            DATE_FORMAT(t.transaction_date, '%Y-%m') as month,
            DATE_FORMAT(t.transaction_date, '%b %Y') as month_label,
            SUM(CASE WHEN c.category_type = 'income' THEN t.amount ELSE 0 END) as income,
            SUM(CASE WHEN c.category_type = 'expense' THEN ABS(t.amount) ELSE 0 END) as expenses
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL :months MONTH)
         GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m'), DATE_FORMAT(t.transaction_date, '%b %Y')
         ORDER BY month",
        ['user_id' => $userId, 'months' => $months]
    );

    // Calculate net income for each month
    foreach ($monthlyData as &$month) {
        $month['income'] = (float)$month['income'];
        $month['expenses'] = (float)$month['expenses'];
        $month['net'] = $month['income'] - $month['expenses'];
    }

    // Get category trends (top 5 expense categories over time)
    $categoryTrends = $db->fetchAll(
        "SELECT
            DATE_FORMAT(t.transaction_date, '%Y-%m') as month,
            c.id as category_id,
            c.name as category_name,
            c.color,
            SUM(ABS(t.amount)) as total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL :months MONTH)
           AND c.category_type = 'expense'
         GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m'), c.id, c.name, c.color
         ORDER BY month, total DESC",
        ['user_id' => $userId, 'months' => $months]
    );

    // Restructure category trends for easier charting
    $trendsByCategory = [];
    foreach ($categoryTrends as $trend) {
        $catId = $trend['category_id'];
        if (!isset($trendsByCategory[$catId])) {
            $trendsByCategory[$catId] = [
                'category_id' => $catId,
                'category_name' => $trend['category_name'],
                'color' => $trend['color'],
                'data' => []
            ];
        }
        $trendsByCategory[$catId]['data'][$trend['month']] = (float)$trend['total'];
    }

    // Calculate averages
    $avgIncome = count($monthlyData) > 0
        ? array_sum(array_column($monthlyData, 'income')) / count($monthlyData)
        : 0;
    $avgExpenses = count($monthlyData) > 0
        ? array_sum(array_column($monthlyData, 'expenses')) / count($monthlyData)
        : 0;

    // Month-over-month change
    $momChange = null;
    if (count($monthlyData) >= 2) {
        $current = end($monthlyData);
        $previous = prev($monthlyData);
        if ($previous['expenses'] > 0) {
            $momChange = round((($current['expenses'] - $previous['expenses']) / $previous['expenses']) * 100, 1);
        }
    }

    successResponse([
        'monthly_data' => $monthlyData,
        'category_trends' => array_values($trendsByCategory),
        'averages' => [
            'income' => round($avgIncome, 2),
            'expenses' => round($avgExpenses, 2),
            'net' => round($avgIncome - $avgExpenses, 2)
        ],
        'mom_expense_change' => $momChange
    ]);

} catch (Exception $e) {
    appLog('Monthly comparison error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
