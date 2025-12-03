<?php
/**
 * Export Categorization Rules API
 * GET /api/v1/export/rules.php?user_id=X
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
                r.rule_name,
                r.match_field,
                r.match_type,
                r.match_value,
                r.match_case_sensitive,
                r.priority,
                r.hit_count,
                c.name AS category_name,
                c.category_type
            FROM categorization_rules r
            LEFT JOIN categories c ON r.category_id = c.id
            WHERE r.user_id = :user_id AND r.is_active = 1
            ORDER BY r.priority, r.rule_name";

    $rules = $db->fetchAll($sql, ['user_id' => $userId]);

    // Output CSV
    $filename = 'export_rules_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    fputcsv($output, [
        'ID', 'Rule Name', 'Match Field', 'Match Type', 'Match Value',
        'Case Sensitive', 'Priority', 'Hit Count', 'Category', 'Category Type'
    ]);

    foreach ($rules as $row) {
        fputcsv($output, [
            $row['id'],
            $row['rule_name'],
            $row['match_field'],
            $row['match_type'],
            $row['match_value'],
            $row['match_case_sensitive'],
            $row['priority'],
            $row['hit_count'],
            $row['category_name'],
            $row['category_type']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export rules error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
