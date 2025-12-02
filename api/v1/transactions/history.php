<?php
/**
 * Import History API
 * GET: Get import batch history
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

    $limit = min(50, max(10, (int)($_GET['limit'] ?? 20)));

    $sql = "SELECT
                ib.id,
                ib.account_id,
                ib.filename,
                ib.total_rows,
                ib.imported_rows,
                ib.duplicate_rows,
                ib.error_rows,
                ib.status,
                ib.created_at,
                ib.completed_at,
                a.account_name,
                fi.name AS institution_name,
                fi.short_code AS institution_code
            FROM import_batches ib
            LEFT JOIN accounts a ON ib.account_id = a.id
            LEFT JOIN financial_institutions fi ON ib.institution_id = fi.id
            WHERE ib.user_id = :user_id
            ORDER BY ib.created_at DESC
            LIMIT $limit";

    $batches = $db->fetchAll($sql, ['user_id' => $userId]);

    // Parse error logs
    foreach ($batches as &$batch) {
        $batch['error_log'] = $batch['error_log'] ? json_decode($batch['error_log'], true) : null;
        $batch['total_rows'] = (int)$batch['total_rows'];
        $batch['imported_rows'] = (int)$batch['imported_rows'];
        $batch['duplicate_rows'] = (int)$batch['duplicate_rows'];
        $batch['error_rows'] = (int)$batch['error_rows'];
    }

    // Get summary stats
    $stats = $db->fetch(
        "SELECT
            COUNT(*) AS total_imports,
            SUM(imported_rows) AS total_imported,
            SUM(duplicate_rows) AS total_duplicates,
            MAX(created_at) AS last_import
         FROM import_batches
         WHERE user_id = :user_id AND status = 'completed'",
        ['user_id' => $userId]
    );

    successResponse([
        'batches' => $batches,
        'stats' => [
            'total_imports' => (int)$stats['total_imports'],
            'total_imported' => (int)$stats['total_imported'],
            'total_duplicates' => (int)$stats['total_duplicates'],
            'last_import' => $stats['last_import']
        ]
    ]);

} catch (Exception $e) {
    appLog('Import history error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
