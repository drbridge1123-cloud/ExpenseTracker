<?php
/**
 * Export Categories API
 * GET /api/v1/export/categories.php?user_id=X
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
                c.id,
                c.name,
                c.slug,
                c.icon,
                c.color,
                c.category_type,
                c.is_system,
                c.sort_order,
                p.name AS parent_name
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE c.user_id = :user_id AND c.is_active = 1
            ORDER BY c.category_type, c.sort_order, c.name";

    $categories = $db->fetchAll($sql, ['user_id' => $userId]);

    // Output CSV
    $filename = 'export_categories_' . date('Y-m-d') . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    fputcsv($output, [
        'ID', 'Name', 'Slug', 'Icon', 'Color', 'Type', 'Is System', 'Sort Order', 'Parent Category'
    ]);

    foreach ($categories as $row) {
        fputcsv($output, [
            $row['id'],
            $row['name'],
            $row['slug'],
            $row['icon'],
            $row['color'],
            $row['category_type'],
            $row['is_system'],
            $row['sort_order'],
            $row['parent_name']
        ]);
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    appLog('Export categories error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
