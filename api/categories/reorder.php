<?php
/**
 * Category Reorder API
 * POST /api/categories/reorder.php
 *
 * Body: {
 *   "user_id": null or 3,
 *   "order": [
 *     { "id": 1, "sort_order": 0 },
 *     { "id": 2, "sort_order": 1 },
 *     ...
 *   ]
 * }
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$userId = isset($input['user_id']) ? $input['user_id'] : null;
$order = $input['order'] ?? [];

if (empty($order) || !is_array($order)) {
    errorResponse('Order data is required');
}

try {
    $db = Database::getInstance();

    // Begin transaction
    $db->beginTransaction();

    foreach ($order as $item) {
        if (!isset($item['id']) || !isset($item['sort_order'])) {
            continue;
        }

        $categoryId = (int)$item['id'];
        $sortOrder = (int)$item['sort_order'];

        // Update sort_order for this category
        // Only update categories that match the user_id filter
        if ($userId === null) {
            $db->query(
                "UPDATE categories SET sort_order = :sort_order WHERE id = :id AND user_id IS NULL",
                ['sort_order' => $sortOrder, 'id' => $categoryId]
            );
        } else {
            $db->query(
                "UPDATE categories SET sort_order = :sort_order WHERE id = :id AND user_id = :user_id",
                ['sort_order' => $sortOrder, 'id' => $categoryId, 'user_id' => $userId]
            );
        }
    }

    $db->commit();

    successResponse(['updated' => count($order)], 'Categories reordered successfully');

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Category reorder error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
