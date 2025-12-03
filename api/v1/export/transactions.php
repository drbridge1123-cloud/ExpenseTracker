<?php
/**
 * Export Transactions API
 * GET /api/v1/export/transactions.php?user_id=X
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

// Optional filters
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;
$accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;

try {
    $db = Database::getInstance();

    // Build query
    $conditions = ['t.user_id = :user_id'];
    $params = ['user_id' => $userId];

    if ($startDate) {
        $conditions[] = 't.transaction_date >= :start_date';
        $params['start_date'] = $startDate;
    }
    if ($endDate) {
        $conditions[] = 't.transaction_date <= :end_date';
        $params['end_date'] = $endDate;
    }
    if ($accountId) {
        $conditions[] = 't.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    $whereClause = implode(' AND ', $conditions);

    $sql = "SELECT
                t.id,
                t.transaction_date,
                t.post_date,
                t.description,
                t.original_description,
                t.vendor_name,
                t.amount,
                t.currency,
                t.transaction_type,
                t.status,
                t.check_number,
                t.memo,
                t.is_recurring,
                t.reimbursement_status,
                a.account_name,
                c.name AS category_name,
                c.category_type
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE $whereClause
            ORDER BY t.transaction_date DESC, t.id DESC";

    $transactions = $db->fetchAll($sql, $params);

    // Output CSV
    $filename = 'export_transactions_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');

    // UTF-8 BOM for Excel
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    // Header row
    fputcsv($output, [
        'ID', 'Date', 'Post Date', 'Description', 'Original Description',
        'Vendor', 'Amount', 'Currency', 'Type', 'Status', 'Check Number',
        'Memo', 'Is Recurring', 'Reimbursement Status', 'Account', 'Category', 'Category Type'
    ]);

    // Data rows
    foreach ($transactions as $row) {
        fputcsv($output, [
            $row['id'],
            $row['transaction_date'],
            $row['post_date'],
            $row['description'],
            $row['original_description'],
            $row['vendor_name'],
            $row['amount'],
            $row['currency'],
            $row['transaction_type'],
            $row['status'],
            $row['check_number'],
            $row['memo'],
            $row['is_recurring'],
            $row['reimbursement_status'],
            $row['account_name'],
            $row['category_name'],
            $row['category_type']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export transactions error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
