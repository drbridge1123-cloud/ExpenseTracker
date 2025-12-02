<?php
/**
 * Reports API
 * GET: Get reports (monthly, yearly, custom range)
 * POST: Generate/refresh report
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = Database::getInstance();

    switch ($method) {
        case 'GET':
            handleGet($db);
            break;
        case 'POST':
            handlePost($db);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Reports API error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * GET - Get reports
 */
function handleGet(Database $db): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $year = !empty($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
    $month = !empty($_GET['month']) ? (int)$_GET['month'] : null;
    $reportType = $_GET['type'] ?? 'monthly'; // monthly, yearly, custom

    if (!$userId) {
        errorResponse('User ID is required');
    }

    switch ($reportType) {
        case 'monthly':
            if (!$month) {
                $month = (int)date('m');
            }
            getMonthlyReport($db, $userId, $year, $month);
            break;

        case 'yearly':
            getYearlyReport($db, $userId, $year);
            break;

        case 'custom':
            $startDate = $_GET['start_date'] ?? null;
            $endDate = $_GET['end_date'] ?? null;
            if (!$startDate || !$endDate) {
                errorResponse('Start date and end date are required for custom reports');
            }
            getCustomReport($db, $userId, $startDate, $endDate);
            break;

        default:
            errorResponse('Invalid report type');
    }
}

/**
 * Get monthly report
 */
function getMonthlyReport(Database $db, int $userId, int $year, int $month): void {
    // Try to get cached report first
    $cached = $db->fetch(
        "SELECT * FROM monthly_reports
         WHERE user_id = :user_id AND report_year = :year AND report_month = :month",
        ['user_id' => $userId, 'year' => $year, 'month' => $month]
    );

    // Generate fresh report data
    $startDate = sprintf('%04d-%02d-01', $year, $month);
    $endDate = date('Y-m-t', strtotime($startDate));

    $reportData = generateReportData($db, $userId, $startDate, $endDate);

    // Get previous month for comparison
    $prevMonth = $month - 1;
    $prevYear = $year;
    if ($prevMonth < 1) {
        $prevMonth = 12;
        $prevYear--;
    }

    $prevStartDate = sprintf('%04d-%02d-01', $prevYear, $prevMonth);
    $prevEndDate = date('Y-m-t', strtotime($prevStartDate));
    $prevReportData = generateReportData($db, $userId, $prevStartDate, $prevEndDate);

    // Calculate comparison
    $comparison = [
        'income_change' => $reportData['total_income'] - $prevReportData['total_income'],
        'income_change_pct' => $prevReportData['total_income'] > 0
            ? (($reportData['total_income'] - $prevReportData['total_income']) / $prevReportData['total_income'] * 100)
            : 0,
        'expenses_change' => $reportData['total_expenses'] - $prevReportData['total_expenses'],
        'expenses_change_pct' => $prevReportData['total_expenses'] > 0
            ? (($reportData['total_expenses'] - $prevReportData['total_expenses']) / $prevReportData['total_expenses'] * 100)
            : 0,
        'previous_month' => [
            'year' => $prevYear,
            'month' => $prevMonth,
            'total_income' => $prevReportData['total_income'],
            'total_expenses' => $prevReportData['total_expenses']
        ]
    ];

    successResponse([
        'report' => array_merge($reportData, [
            'year' => $year,
            'month' => $month,
            'period_start' => $startDate,
            'period_end' => $endDate
        ]),
        'comparison' => $comparison,
        'cached' => $cached !== null,
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Get yearly report
 */
function getYearlyReport(Database $db, int $userId, int $year): void {
    $startDate = "$year-01-01";
    $endDate = "$year-12-31";

    $reportData = generateReportData($db, $userId, $startDate, $endDate);

    // Get monthly breakdown
    $monthlyData = [];
    for ($m = 1; $m <= 12; $m++) {
        $mStart = sprintf('%04d-%02d-01', $year, $m);
        $mEnd = date('Y-m-t', strtotime($mStart));

        $monthly = $db->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS expenses
             FROM transactions
             WHERE user_id = :user_id
             AND transaction_date BETWEEN :start_date AND :end_date",
            ['user_id' => $userId, 'start_date' => $mStart, 'end_date' => $mEnd]
        );

        $monthlyData[] = [
            'month' => $m,
            'month_name' => date('F', mktime(0, 0, 0, $m, 1)),
            'income' => (float)$monthly['income'],
            'expenses' => (float)$monthly['expenses'],
            'net' => (float)$monthly['income'] - (float)$monthly['expenses']
        ];
    }

    // Previous year comparison
    $prevYear = $year - 1;
    $prevStartDate = "$prevYear-01-01";
    $prevEndDate = "$prevYear-12-31";
    $prevReportData = generateReportData($db, $userId, $prevStartDate, $prevEndDate);

    successResponse([
        'report' => array_merge($reportData, [
            'year' => $year,
            'period_start' => $startDate,
            'period_end' => $endDate,
            'monthly_breakdown' => $monthlyData
        ]),
        'comparison' => [
            'previous_year' => $prevYear,
            'income_change_pct' => $prevReportData['total_income'] > 0
                ? (($reportData['total_income'] - $prevReportData['total_income']) / $prevReportData['total_income'] * 100)
                : 0,
            'expenses_change_pct' => $prevReportData['total_expenses'] > 0
                ? (($reportData['total_expenses'] - $prevReportData['total_expenses']) / $prevReportData['total_expenses'] * 100)
                : 0
        ],
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Get custom date range report
 */
function getCustomReport(Database $db, int $userId, string $startDate, string $endDate): void {
    $reportData = generateReportData($db, $userId, $startDate, $endDate);

    successResponse([
        'report' => array_merge($reportData, [
            'period_start' => $startDate,
            'period_end' => $endDate
        ]),
        'generated_at' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Generate report data for a date range
 */
function generateReportData(Database $db, int $userId, string $startDate, string $endDate): array {
    // Totals
    $totals = $db->fetch(
        "SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS total_expenses,
            COUNT(*) AS transaction_count
         FROM transactions
         WHERE user_id = :user_id
         AND transaction_date BETWEEN :start_date AND :end_date
         AND status != 'void'",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    $totalIncome = (float)$totals['total_income'];
    $totalExpenses = (float)$totals['total_expenses'];
    $netSavings = $totalIncome - $totalExpenses;
    $savingsRate = $totalIncome > 0 ? ($netSavings / $totalIncome * 100) : 0;

    // Category breakdown
    $categoryBreakdown = $db->fetchAll(
        "SELECT
            c.id AS category_id,
            c.name AS category_name,
            c.slug AS category_slug,
            c.color AS category_color,
            c.icon AS category_icon,
            c.category_type,
            COUNT(t.id) AS transaction_count,
            COALESCE(SUM(ABS(t.amount)), 0) AS total_amount,
            ROUND(COALESCE(SUM(ABS(t.amount)), 0) / NULLIF(:total_expenses, 0) * 100, 2) AS percentage
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id
            AND t.user_id = :user_id
            AND t.transaction_date BETWEEN :start_date AND :end_date
            AND t.status != 'void'
         WHERE c.category_type = 'expense' AND c.is_active = 1
         GROUP BY c.id
         HAVING transaction_count > 0
         ORDER BY total_amount DESC",
        [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'total_expenses' => $totalExpenses
        ]
    );

    // Account breakdown
    $accountBreakdown = $db->fetchAll(
        "SELECT
            a.id AS account_id,
            a.account_name,
            a.account_type,
            a.color AS account_color,
            COUNT(t.id) AS transaction_count,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'credit' THEN t.amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'debit' THEN ABS(t.amount) ELSE 0 END), 0) AS expenses
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
            AND t.transaction_date BETWEEN :start_date AND :end_date
            AND t.status != 'void'
         WHERE a.user_id = :user_id AND a.is_active = 1
         GROUP BY a.id
         ORDER BY expenses DESC",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    // Daily breakdown
    $dailyBreakdown = $db->fetchAll(
        "SELECT
            DATE(transaction_date) AS date,
            DAYOFWEEK(transaction_date) AS day_of_week,
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS expenses,
            COUNT(*) AS transaction_count
         FROM transactions
         WHERE user_id = :user_id
         AND transaction_date BETWEEN :start_date AND :end_date
         AND status != 'void'
         GROUP BY DATE(transaction_date)
         ORDER BY date",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    // Top vendors
    $topVendors = $db->fetchAll(
        "SELECT
            vendor_name,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(ABS(amount)), 0) AS total_amount,
            MIN(transaction_date) AS first_transaction,
            MAX(transaction_date) AS last_transaction
         FROM transactions
         WHERE user_id = :user_id
         AND transaction_date BETWEEN :start_date AND :end_date
         AND transaction_type = 'debit'
         AND vendor_name IS NOT NULL AND vendor_name != ''
         AND status != 'void'
         GROUP BY vendor_name
         ORDER BY total_amount DESC
         LIMIT 10",
        ['user_id' => $userId, 'start_date' => $startDate, 'end_date' => $endDate]
    );

    return [
        'total_income' => $totalIncome,
        'total_expenses' => $totalExpenses,
        'net_savings' => $netSavings,
        'savings_rate' => round($savingsRate, 2),
        'transaction_count' => (int)$totals['transaction_count'],
        'category_breakdown' => $categoryBreakdown,
        'account_breakdown' => $accountBreakdown,
        'daily_breakdown' => $dailyBreakdown,
        'top_vendors' => $topVendors
    ];
}

/**
 * POST - Generate/refresh monthly report
 */
function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['user_id'])) {
        errorResponse('User ID is required');
    }

    $userId = (int)$input['user_id'];
    $year = !empty($input['year']) ? (int)$input['year'] : (int)date('Y');
    $month = !empty($input['month']) ? (int)$input['month'] : (int)date('m');

    $startDate = sprintf('%04d-%02d-01', $year, $month);
    $endDate = date('Y-m-t', strtotime($startDate));

    $reportData = generateReportData($db, $userId, $startDate, $endDate);

    // Upsert monthly report
    $existing = $db->fetch(
        "SELECT id FROM monthly_reports
         WHERE user_id = :user_id AND report_year = :year AND report_month = :month",
        ['user_id' => $userId, 'year' => $year, 'month' => $month]
    );

    $reportRecord = [
        'user_id' => $userId,
        'report_year' => $year,
        'report_month' => $month,
        'total_income' => $reportData['total_income'],
        'total_expenses' => $reportData['total_expenses'],
        'net_savings' => $reportData['net_savings'],
        'savings_rate' => $reportData['savings_rate'],
        'category_breakdown' => json_encode($reportData['category_breakdown']),
        'account_breakdown' => json_encode($reportData['account_breakdown']),
        'daily_breakdown' => json_encode($reportData['daily_breakdown']),
        'top_vendors' => json_encode($reportData['top_vendors']),
        'transaction_count' => $reportData['transaction_count']
    ];

    if ($existing) {
        $db->update('monthly_reports', $reportRecord,
            'id = :id', ['id' => $existing['id']]);
        $reportId = $existing['id'];
    } else {
        $reportId = $db->insert('monthly_reports', $reportRecord);
    }

    successResponse([
        'report_id' => $reportId,
        'report' => $reportData,
        'year' => $year,
        'month' => $month
    ], 'Report generated successfully');
}
