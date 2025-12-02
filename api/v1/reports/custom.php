<?php
/**
 * Custom Report API
 * POST /api/reports/custom.php
 *
 * Body: {
 *   "user_id": 1,
 *   "category_ids": [1, 2, 3],
 *   "period": "this_year" | "last_year" | "this_month" | "last_6_months" | "custom",
 *   "start_date": "2024-01-01", (for custom period)
 *   "end_date": "2024-12-31",   (for custom period)
 *   "group_by": "month" | "category"
 * }
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
$categoryIds = $input['category_ids'] ?? [];
$period = $input['period'] ?? 'this_year';
$groupBy = $input['group_by'] ?? 'month';

if (!$userId) {
    errorResponse('User ID is required');
}

if (empty($categoryIds)) {
    errorResponse('At least one category must be selected');
}

try {
    $db = Database::getInstance();

    // Calculate date range based on period
    $dates = calculateDateRange($period, $input['start_date'] ?? null, $input['end_date'] ?? null);
    $startDate = $dates['start'];
    $endDate = $dates['end'];

    // Build category ID list for SQL
    $categoryIdList = implode(',', array_map('intval', $categoryIds));

    // Get category details
    $categories = $db->fetchAll(
        "SELECT id, name, icon, color, category_type, parent_id
         FROM categories
         WHERE id IN ($categoryIdList)"
    );

    // Index categories by ID
    $categoryMap = [];
    foreach ($categories as $cat) {
        $categoryMap[$cat['id']] = $cat;
    }

    // Get monthly breakdown for selected categories
    $monthlyData = $db->fetchAll(
        "SELECT
            DATE_FORMAT(transaction_date, '%Y-%m') as month,
            category_id,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expense,
            COUNT(*) as transaction_count
         FROM transactions
         WHERE user_id = :user_id
           AND category_id IN ($categoryIdList)
           AND transaction_date >= :start_date
           AND transaction_date <= :end_date
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m'), category_id
         ORDER BY month ASC",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Get totals per category
    $categoryTotals = $db->fetchAll(
        "SELECT
            category_id,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_expense,
            COUNT(*) as transaction_count
         FROM transactions
         WHERE user_id = :user_id
           AND category_id IN ($categoryIdList)
           AND transaction_date >= :start_date
           AND transaction_date <= :end_date
         GROUP BY category_id",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]
    );

    // Build summary by category
    $categorySummary = [];
    $grandTotalIncome = 0;
    $grandTotalExpense = 0;

    foreach ($categoryTotals as $total) {
        $catId = $total['category_id'];
        $cat = $categoryMap[$catId] ?? null;

        if ($cat) {
            $categorySummary[] = [
                'id' => $catId,
                'name' => $cat['name'],
                'icon' => $cat['icon'],
                'color' => $cat['color'],
                'type' => $cat['category_type'],
                'total_income' => (float)$total['total_income'],
                'total_expense' => (float)$total['total_expense'],
                'total' => $cat['category_type'] === 'income'
                    ? (float)$total['total_income']
                    : (float)$total['total_expense'],
                'transaction_count' => (int)$total['transaction_count']
            ];

            $grandTotalIncome += (float)$total['total_income'];
            $grandTotalExpense += (float)$total['total_expense'];
        }
    }

    // Build monthly trend data
    $monthlyTrend = [];
    $allMonths = [];

    // Generate all months in range
    $currentMonth = new DateTime($startDate);
    $endMonth = new DateTime($endDate);
    while ($currentMonth <= $endMonth) {
        $monthKey = $currentMonth->format('Y-m');
        $allMonths[$monthKey] = [
            'month' => $monthKey,
            'label' => $currentMonth->format('M Y'),
            'income' => 0,
            'expense' => 0,
            'categories' => []
        ];
        $currentMonth->modify('+1 month');
    }

    // Fill in actual data
    foreach ($monthlyData as $row) {
        $monthKey = $row['month'];
        $catId = $row['category_id'];

        if (isset($allMonths[$monthKey])) {
            $allMonths[$monthKey]['income'] += (float)$row['income'];
            $allMonths[$monthKey]['expense'] += (float)$row['expense'];
            $allMonths[$monthKey]['categories'][$catId] = [
                'income' => (float)$row['income'],
                'expense' => (float)$row['expense'],
                'count' => (int)$row['transaction_count']
            ];
        }
    }

    $monthlyTrend = array_values($allMonths);

    // Calculate averages
    $numMonths = count($monthlyTrend);
    $avgIncome = $numMonths > 0 ? $grandTotalIncome / $numMonths : 0;
    $avgExpense = $numMonths > 0 ? $grandTotalExpense / $numMonths : 0;

    // Calculate percentages for pie chart
    $pieData = [];
    $totalForPie = 0;

    foreach ($categorySummary as $cat) {
        $totalForPie += $cat['total'];
    }

    foreach ($categorySummary as &$cat) {
        $cat['percentage'] = $totalForPie > 0 ? round(($cat['total'] / $totalForPie) * 100, 1) : 0;
        $pieData[] = [
            'name' => $cat['name'],
            'value' => $cat['total'],
            'percentage' => $cat['percentage'],
            'color' => $cat['color'] ?? getDefaultColor($cat['type'])
        ];
    }

    // Sort pie data by value descending
    usort($pieData, fn($a, $b) => $b['value'] <=> $a['value']);

    successResponse([
        'period' => [
            'start' => $startDate,
            'end' => $endDate,
            'label' => getPeriodLabel($period, $startDate, $endDate)
        ],
        'summary' => [
            'total_income' => $grandTotalIncome,
            'total_expense' => $grandTotalExpense,
            'net' => $grandTotalIncome - $grandTotalExpense,
            'avg_monthly_income' => round($avgIncome, 2),
            'avg_monthly_expense' => round($avgExpense, 2),
            'num_months' => $numMonths,
            'num_categories' => count($categorySummary)
        ],
        'categories' => $categorySummary,
        'monthly_trend' => $monthlyTrend,
        'pie_chart' => $pieData
    ]);

} catch (Exception $e) {
    appLog('Custom report error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * Calculate date range based on period type
 */
function calculateDateRange(string $period, ?string $customStart, ?string $customEnd): array {
    $now = new DateTime();

    switch ($period) {
        case 'this_month':
            return [
                'start' => $now->format('Y-m-01'),
                'end' => $now->format('Y-m-t')
            ];

        case 'last_month':
            $lastMonth = (clone $now)->modify('-1 month');
            return [
                'start' => $lastMonth->format('Y-m-01'),
                'end' => $lastMonth->format('Y-m-t')
            ];

        case 'last_3_months':
            return [
                'start' => (clone $now)->modify('-3 months')->format('Y-m-01'),
                'end' => $now->format('Y-m-t')
            ];

        case 'last_6_months':
            return [
                'start' => (clone $now)->modify('-6 months')->format('Y-m-01'),
                'end' => $now->format('Y-m-t')
            ];

        case 'this_year':
            return [
                'start' => $now->format('Y-01-01'),
                'end' => $now->format('Y-12-31')
            ];

        case 'last_year':
            $lastYear = $now->format('Y') - 1;
            return [
                'start' => "$lastYear-01-01",
                'end' => "$lastYear-12-31"
            ];

        case 'all_time':
            return [
                'start' => '2000-01-01',
                'end' => $now->format('Y-m-d')
            ];

        case 'custom':
            return [
                'start' => $customStart ?? $now->format('Y-01-01'),
                'end' => $customEnd ?? $now->format('Y-12-31')
            ];

        default:
            return [
                'start' => $now->format('Y-01-01'),
                'end' => $now->format('Y-12-31')
            ];
    }
}

/**
 * Get human-readable period label
 */
function getPeriodLabel(string $period, string $start, string $end): string {
    switch ($period) {
        case 'this_month': return 'This Month';
        case 'last_month': return 'Last Month';
        case 'last_3_months': return 'Last 3 Months';
        case 'last_6_months': return 'Last 6 Months';
        case 'this_year': return 'This Year';
        case 'last_year': return 'Last Year';
        case 'all_time': return 'All Time';
        case 'custom': return date('M j, Y', strtotime($start)) . ' - ' . date('M j, Y', strtotime($end));
        default: return 'Custom Period';
    }
}

/**
 * Get default color for category type
 */
function getDefaultColor(string $type): string {
    return match($type) {
        'income' => '#22c55e',
        'expense' => '#ef4444',
        'transfer' => '#6366f1',
        default => '#6b7280'
    };
}
