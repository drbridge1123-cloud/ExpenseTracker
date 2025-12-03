<?php
/**
 * Export Accounts API
 * GET /api/v1/export/accounts.php?user_id=X
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
                a.id,
                a.account_name,
                a.account_type,
                a.account_number_last4,
                a.currency,
                a.current_balance,
                a.available_balance,
                a.credit_limit,
                a.interest_rate,
                a.include_in_totals,
                a.color,
                a.notes,
                fi.name AS institution_name
            FROM accounts a
            LEFT JOIN financial_institutions fi ON a.institution_id = fi.id
            WHERE a.user_id = :user_id AND a.is_active = 1
            ORDER BY a.account_name";

    $accounts = $db->fetchAll($sql, ['user_id' => $userId]);

    // Output CSV
    $filename = 'export_accounts_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    fputcsv($output, [
        'ID', 'Account Name', 'Type', 'Last 4 Digits', 'Currency',
        'Current Balance', 'Available Balance', 'Credit Limit', 'Interest Rate',
        'Include in Totals', 'Color', 'Notes', 'Institution'
    ]);

    foreach ($accounts as $row) {
        fputcsv($output, [
            $row['id'],
            $row['account_name'],
            $row['account_type'],
            $row['account_number_last4'],
            $row['currency'],
            $row['current_balance'],
            $row['available_balance'],
            $row['credit_limit'],
            $row['interest_rate'],
            $row['include_in_totals'],
            $row['color'],
            $row['notes'],
            $row['institution_name']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export accounts error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
