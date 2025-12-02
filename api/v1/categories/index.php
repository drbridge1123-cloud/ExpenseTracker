<?php
/**
 * Categories API
 * GET: List categories
 * POST: Create category
 * DELETE: Delete category
 */

require_once __DIR__ . '/../../../config/config.php';

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
        case 'DELETE':
            handleDelete($db);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Categories API error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * GET - List categories
 */
function handleGet(Database $db): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $type = $_GET['type'] ?? null; // income, expense, transfer
    $includeStats = isset($_GET['include_stats']) && $_GET['include_stats'] === '1';
    $hierarchical = isset($_GET['hierarchical']) && $_GET['hierarchical'] === '1';

    $conditions = ['c.is_active = 1'];
    $params = [];

    // Filter categories by user
    // Jianiel (user_id=3) has separate Business categories
    // Daniel (1), Hyunji (2), and others use shared Personal categories (user_id IS NULL)
    if ($userId == 3) {
        // Jianiel: Only show Business categories (user_id = 3)
        $conditions[] = 'c.user_id = :user_id';
        $params['user_id'] = $userId;
    } else if ($userId) {
        // Daniel, Hyunji, others: Show Personal shared categories (user_id IS NULL)
        $conditions[] = 'c.user_id IS NULL';
    } else {
        $conditions[] = 'c.user_id IS NULL'; // Default: system/shared categories
    }

    if ($type && in_array($type, ['income', 'expense', 'transfer', 'other'])) {
        $conditions[] = 'c.category_type = :type';
        $params['type'] = $type;
    }

    $whereClause = implode(' AND ', $conditions);

    // Base query
    $sql = "SELECT
                c.id,
                c.user_id,
                c.parent_id,
                c.name,
                c.slug,
                c.icon,
                c.color,
                c.category_type,
                c.is_system,
                c.sort_order,
                pc.name AS parent_name,
                pc.slug AS parent_slug
            FROM categories c
            LEFT JOIN categories pc ON c.parent_id = pc.id
            WHERE $whereClause
            ORDER BY c.category_type, c.sort_order, c.name";

    $categories = $db->fetchAll($sql, $params);

    // Add stats separately if requested (to avoid duplicate issues)
    if ($includeStats && $userId) {
        for ($i = 0; $i < count($categories); $i++) {
            $statsParams = ['category_id' => $categories[$i]['id'], 'user_id' => $userId];

            // Transaction count
            $countResult = $db->fetch(
                "SELECT COUNT(*) as cnt FROM transactions WHERE category_id = :category_id AND user_id = :user_id",
                $statsParams
            );
            $categories[$i]['transaction_count'] = (int)($countResult['cnt'] ?? 0);

            // Month total
            $monthResult = $db->fetch(
                "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
                 WHERE category_id = :category_id AND user_id = :user_id
                 AND transaction_date >= DATE_FORMAT(NOW(), '%Y-%m-01')",
                $statsParams
            );
            $categories[$i]['month_total'] = (float)($monthResult['total'] ?? 0);

            // Last month total
            $lastMonthResult = $db->fetch(
                "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
                 WHERE category_id = :category_id AND user_id = :user_id
                 AND transaction_date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01')
                 AND transaction_date < DATE_FORMAT(NOW(), '%Y-%m-01')",
                $statsParams
            );
            $categories[$i]['last_month_total'] = (float)($lastMonthResult['total'] ?? 0);

            // All time total
            $allTimeResult = $db->fetch(
                "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
                 WHERE category_id = :category_id AND user_id = :user_id",
                $statsParams
            );
            $categories[$i]['total_amount'] = (float)($allTimeResult['total'] ?? 0);
        }
    }

    // Format numeric fields (only if stats weren't already added)
    if ($includeStats && !$userId) {
        for ($i = 0; $i < count($categories); $i++) {
            $categories[$i]['transaction_count'] = (int)($categories[$i]['transaction_count'] ?? 0);
            $categories[$i]['month_total'] = (float)($categories[$i]['month_total'] ?? 0);
            $categories[$i]['last_month_total'] = (float)($categories[$i]['last_month_total'] ?? 0);
        }
    }

    // Build hierarchical structure if requested
    if ($hierarchical) {
        $categories = buildHierarchy($categories);
    }

    // Group by type
    $grouped = [
        'income' => [],
        'expense' => [],
        'transfer' => [],
        'other' => []
    ];

    foreach ($categories as $cat) {
        $type = $cat['category_type'];
        $grouped[$type][] = $cat;
    }

    successResponse([
        'categories' => $categories,
        'grouped' => $grouped
    ]);
}

/**
 * Build hierarchical category tree
 */
function buildHierarchy(array $categories): array {
    $byId = [];
    $tree = [];

    // Index by ID
    foreach ($categories as $cat) {
        $cat['children'] = [];
        $byId[$cat['id']] = $cat;
    }

    // Build tree
    foreach ($byId as $id => $cat) {
        if ($cat['parent_id'] && isset($byId[$cat['parent_id']])) {
            $byId[$cat['parent_id']]['children'][] = &$byId[$id];
        } else {
            $tree[] = &$byId[$id];
        }
    }

    return $tree;
}

/**
 * POST - Create new category
 */
function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    if (empty($input['name'])) {
        errorResponse('Category name is required');
    }

    if (empty($input['category_type'])) {
        errorResponse('Category type is required');
    }

    $validTypes = ['income', 'expense', 'transfer', 'other'];
    if (!in_array($input['category_type'], $validTypes)) {
        errorResponse('Invalid category type');
    }

    // Generate slug
    $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $input['name']));
    $slug = trim($slug, '-');

    // Check for duplicate slug
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $existingSlug = $db->fetch(
        "SELECT id FROM categories WHERE slug = :slug AND (user_id IS NULL OR user_id = :user_id)",
        ['slug' => $slug, 'user_id' => $userId]
    );

    if ($existingSlug) {
        $slug .= '-' . time();
    }

    // Validate parent if provided
    if (!empty($input['parent_id'])) {
        $parent = $db->fetch(
            "SELECT * FROM categories WHERE id = :id",
            ['id' => $input['parent_id']]
        );
        if (!$parent) {
            errorResponse('Parent category not found');
        }
        // Subcategory must have same type as parent
        $input['category_type'] = $parent['category_type'];
    }

    // Get max sort order
    $maxSort = $db->fetchColumn(
        "SELECT MAX(sort_order) FROM categories WHERE category_type = :type",
        ['type' => $input['category_type']]
    );

    // Prepare data
    $categoryData = [
        'user_id' => $userId,
        'parent_id' => !empty($input['parent_id']) ? (int)$input['parent_id'] : null,
        'name' => sanitize($input['name']),
        'slug' => $slug,
        'icon' => $input['icon'] ?? null,
        'color' => $input['color'] ?? null,
        'category_type' => $input['category_type'],
        'is_system' => 0,
        'is_active' => 1,
        'sort_order' => ($maxSort ?? 0) + 1
    ];

    $categoryId = $db->insert('categories', $categoryData);

    // Get the created category
    $category = $db->fetch(
        "SELECT c.*, pc.name AS parent_name
         FROM categories c
         LEFT JOIN categories pc ON c.parent_id = pc.id
         WHERE c.id = :id",
        ['id' => $categoryId]
    );

    successResponse(['category' => $category], 'Category created successfully');
}

/**
 * DELETE - Delete category
 */
function handleDelete(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? $_GET['id'] ?? null;

    if (empty($id)) {
        errorResponse('Category ID is required');
    }

    $id = (int)$id;

    // Get category
    $category = $db->fetch("SELECT * FROM categories WHERE id = :id", ['id' => $id]);

    if (!$category) {
        errorResponse('Category not found', 404);
    }

    // Don't allow deleting system categories
    if ($category['is_system'] || $category['slug'] === 'uncategorized') {
        errorResponse('Cannot delete system category', 403);
    }

    // Get uncategorized category ID
    $uncategorized = $db->fetch("SELECT id FROM categories WHERE slug = 'uncategorized'");
    $uncategorizedId = $uncategorized ? $uncategorized['id'] : null;

    // Move transactions to uncategorized
    if ($uncategorizedId) {
        $db->update(
            'transactions',
            ['category_id' => $uncategorizedId],
            'category_id = :old_category_id',
            ['old_category_id' => $id]
        );
    }

    // Delete the category
    $db->delete('categories', 'id = :id', ['id' => $id]);

    successResponse(['deleted' => true], 'Category deleted successfully');
}
