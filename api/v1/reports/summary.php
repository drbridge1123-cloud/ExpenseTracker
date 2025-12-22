<?php
/**
 * Reports Summary API
 * GET /api/reports/summary.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$period = $_GET['period'] ?? 'month';
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? date('Y-m-d');

if (!$userId) {
    errorResponse('User ID is required');
}

// Calculate date range based on period
if (!$startDate) {
    switch ($period) {
        case 'all':
            $startDate = '2000-01-01';
            break;
        case 'month':
            $startDate = date('Y-m-01');
            break;
        case 'quarter':
            $quarter = ceil(date('n') / 3);
            $startDate = date('Y-' . str_pad(($quarter - 1) * 3 + 1, 2, '0', STR_PAD_LEFT) . '-01');
            break;
        case 'year':
            $startDate = date('Y-01-01');
            break;
        default:
            $startDate = date('Y-m-01');
    }
}

try {
    $db = Database::getInstance();

    $income = $db->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date BETWEEN :start_date AND :end_date
           AND c.category_type = 'income'",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $expenses = $db->fetch(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date BETWEEN :start_date AND :end_date
           AND c.category_type = 'expense'",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $expensesByCategory = $db->fetchAll(
        "SELECT c.id, c.name, c.icon, c.color,
                COALESCE(SUM(ABS(t.amount)), 0) as total,
                COUNT(t.id) as transaction_count
         FROM categories c
         LEFT JOIN transactions t ON c.id = t.category_id
              AND t.user_id = :user_id
              AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'expense'
         GROUP BY c.id, c.name, c.icon, c.color
         HAVING total > 0
         ORDER BY total DESC",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $incomeByCategory = $db->fetchAll(
        "SELECT c.id, c.name, c.icon, c.color,
                COALESCE(SUM(t.amount), 0) as total,
                COUNT(t.id) as transaction_count
         FROM categories c
         LEFT JOIN transactions t ON c.id = t.category_id
              AND t.user_id = :user_id
              AND t.transaction_date BETWEEN :start_date AND :end_date
         WHERE c.category_type = 'income'
         GROUP BY c.id, c.name, c.icon, c.color
         HAVING total > 0
         ORDER BY total DESC",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $dailyTrend = $db->fetchAll(
        "SELECT DATE(transaction_date) as date,
                SUM(CASE WHEN c.category_type = 'expense' THEN ABS(amount) ELSE 0 END) as expenses,
                SUM(CASE WHEN c.category_type = 'income' THEN amount ELSE 0 END) as income
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date BETWEEN :start_date AND :end_date
         GROUP BY DATE(transaction_date)
         ORDER BY date",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $topMerchants = $db->fetchAll(
        "SELECT COALESCE(vendor_name, description) as vendor_name,
                COUNT(*) as transaction_count,
                SUM(ABS(amount)) as total_spent
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = :user_id
           AND t.transaction_date BETWEEN :start_date AND :end_date
           AND c.category_type = 'expense'
           AND (vendor_name IS NOT NULL AND vendor_name != '' OR description IS NOT NULL AND description != '')
         GROUP BY COALESCE(vendor_name, description)
         ORDER BY total_spent DESC
         LIMIT 10",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $totalIncome = (float)$income['total'];
    $totalExpenses = (float)$expenses['total'];
    $netIncome = $totalIncome - $totalExpenses;
    $savingsRate = $totalIncome > 0 ? round(($netIncome / $totalIncome) * 100, 1) : 0;

    successResponse([
        'period' => [
            'start_date' => $startDate,
            'end_date' => $endDate,
            'type' => $period
        ],
        'summary' => [
            'total_income' => $totalIncome,
            'total_expenses' => $totalExpenses,
            'net_income' => $netIncome,
            'savings_rate' => $savingsRate
        ],
        'expenses_by_category' => $expensesByCategory,
        'income_by_category' => $incomeByCategory,
        'daily_trend' => $dailyTrend,
        'top_merchants' => $topMerchants
    ]);

} catch (Exception $e) {
    appLog('Report summary error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
