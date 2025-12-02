<?php
/**
 * Bulk Categorize by Pattern API
 * POST: Categorize all transactions matching a pattern
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['pattern'])) {
    errorResponse('Pattern is required');
}

if (empty($input['category_id'])) {
    errorResponse('Category ID is required');
}

if (empty($input['user_id'])) {
    errorResponse('User ID is required');
}

try {
    $db = Database::getInstance();

    $pattern = trim($input['pattern']);
    $categoryId = (int)$input['category_id'];
    $userId = (int)$input['user_id'];
    $createRule = !empty($input['create_rule']);

    // Verify category exists
    $category = $db->fetch("SELECT * FROM categories WHERE id = :id", ['id' => $categoryId]);
    if (!$category) {
        errorResponse('Category not found', 404);
    }

    // Get uncategorized category ID
    $uncategorized = $db->fetch("SELECT id FROM categories WHERE slug = 'uncategorized'");
    $uncategorizedId = $uncategorized ? $uncategorized['id'] : null;

    // Update all matching transactions (only uncategorized ones)
    $sql = "UPDATE transactions
            SET category_id = :category_id,
                categorized_by = 'rule',
                updated_at = NOW()
            WHERE user_id = :user_id
            AND UPPER(description) LIKE :pattern";

    if ($uncategorizedId) {
        $sql .= " AND category_id = :uncategorized_id";
    }

    $params = [
        'category_id' => $categoryId,
        'user_id' => $userId,
        'pattern' => '%' . strtoupper($pattern) . '%'
    ];

    if ($uncategorizedId) {
        $params['uncategorized_id'] = $uncategorizedId;
    }

    $stmt = $db->query($sql, $params);
    $updated = $stmt->rowCount();

    // Create rule if requested
    $ruleCreated = false;
    if ($createRule) {
        // Check if similar rule exists
        $existingRule = $db->fetch(
            "SELECT id FROM categorization_rules WHERE match_value = :pattern AND category_id = :cat_id",
            ['pattern' => $pattern, 'cat_id' => $categoryId]
        );

        if (!$existingRule) {
            $db->insert('categorization_rules', [
                'user_id' => $userId,
                'category_id' => $categoryId,
                'rule_name' => $pattern,
                'match_field' => 'description',
                'match_type' => 'contains',
                'match_value' => $pattern,
                'priority' => 50,
                'is_active' => 1
            ]);
            $ruleCreated = true;
        }
    }

    successResponse([
        'updated' => $updated,
        'pattern' => $pattern,
        'rule_created' => $ruleCreated
    ], "$updated transactions categorized");

} catch (Exception $e) {
    appLog('Bulk categorize pattern error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
