<?php
/**
 * Export Budgets API
 * GET /api/v1/export/budgets.php?user_id=X
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
if (!$userId) {
    errorResponse('User ID is required');
}

try {
    $db = Database::getInstance();

    $sql = "SELECT
                b.id,
                b.budget_name,
                b.budget_type,
                b.amount,
                b.start_date,
                b.end_date,
                b.rollover,
                b.alert_threshold,
                c.name AS category_name
            FROM budgets b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.user_id = :user_id AND b.is_active = 1
            ORDER BY b.budget_name";

    $budgets = $db->fetchAll($sql, ['user_id' => $userId]);

    // Output CSV
    $filename = 'export_budgets_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    fputcsv($output, [
        'ID', 'Budget Name', 'Type', 'Amount', 'Start Date', 'End Date',
        'Rollover', 'Alert Threshold (%)', 'Category'
    ]);

    foreach ($budgets as $row) {
        fputcsv($output, [
            $row['id'],
            $row['budget_name'],
            $row['budget_type'],
            $row['amount'],
            $row['start_date'],
            $row['end_date'],
            $row['rollover'],
            $row['alert_threshold'],
            $row['category_name']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export budgets error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
