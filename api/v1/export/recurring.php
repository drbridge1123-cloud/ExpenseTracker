<?php
/**
 * Export Recurring Transactions API
 * GET /api/v1/export/recurring.php?user_id=X
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
                r.id,
                r.description,
                r.vendor_name,
                r.amount,
                r.transaction_type,
                r.frequency,
                r.start_date,
                r.end_date,
                r.next_occurrence,
                r.day_of_month,
                r.day_of_week,
                r.auto_create,
                a.account_name,
                c.name AS category_name
            FROM recurring_transactions r
            LEFT JOIN accounts a ON r.account_id = a.id
            LEFT JOIN categories c ON r.category_id = c.id
            WHERE r.user_id = :user_id AND r.is_active = 1
            ORDER BY r.next_occurrence";

    $recurring = $db->fetchAll($sql, ['user_id' => $userId]);

    // Output CSV
    $filename = 'export_recurring_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    fputcsv($output, [
        'ID', 'Description', 'Vendor', 'Amount', 'Type', 'Frequency',
        'Start Date', 'End Date', 'Next Occurrence', 'Day of Month',
        'Day of Week', 'Auto Create', 'Account', 'Category'
    ]);

    foreach ($recurring as $row) {
        fputcsv($output, [
            $row['id'],
            $row['description'],
            $row['vendor_name'],
            $row['amount'],
            $row['transaction_type'],
            $row['frequency'],
            $row['start_date'],
            $row['end_date'],
            $row['next_occurrence'],
            $row['day_of_month'],
            $row['day_of_week'],
            $row['auto_create'],
            $row['account_name'],
            $row['category_name']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export recurring error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
