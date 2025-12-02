<?php
/**
 * Categorization Rules API
 * GET: List rules
 * POST: Create rule
 * PUT: Update rule
 * DELETE: Delete rule
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
        case 'PUT':
            handlePut($db);
            break;
        case 'DELETE':
            handleDelete($db);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Rules API error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * GET - List rules
 */
function handleGet(Database $db): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $categoryId = !empty($_GET['category_id']) ? (int)$_GET['category_id'] : null;
    $includeGlobal = !isset($_GET['user_only']) || $_GET['user_only'] !== '1';

    $conditions = ['r.is_active = 1'];
    $params = [];

    if ($userId) {
        if ($includeGlobal) {
            $conditions[] = '(r.user_id IS NULL OR r.user_id = :user_id)';
        } else {
            $conditions[] = 'r.user_id = :user_id';
        }
        $params['user_id'] = $userId;
    } else {
        $conditions[] = 'r.user_id IS NULL'; // Only global rules
    }

    if ($categoryId) {
        $conditions[] = 'r.category_id = :category_id';
        $params['category_id'] = $categoryId;
    }

    $whereClause = implode(' AND ', $conditions);

    $sql = "SELECT
                r.*,
                c.name AS category_name,
                c.slug AS category_slug,
                c.icon AS category_icon,
                c.color AS category_color,
                c.category_type,
                u.username AS created_by_username
            FROM categorization_rules r
            LEFT JOIN categories c ON r.category_id = c.id
            LEFT JOIN users u ON r.user_id = u.id
            WHERE $whereClause
            ORDER BY r.priority ASC, r.hit_count DESC, r.rule_name";

    $rules = $db->fetchAll($sql, $params);

    // Format
    foreach ($rules as &$rule) {
        $rule['hit_count'] = (int)$rule['hit_count'];
        $rule['priority'] = (int)$rule['priority'];
        $rule['is_global'] = $rule['user_id'] === null;
    }
    unset($rule); // Important: unset reference to avoid issues in subsequent loops

    // Group by category
    $byCategory = [];
    foreach ($rules as $rule) {
        $catId = $rule['category_id'];
        if (!isset($byCategory[$catId])) {
            $byCategory[$catId] = [
                'category_name' => $rule['category_name'],
                'category_color' => $rule['category_color'],
                'rules' => []
            ];
        }
        $byCategory[$catId]['rules'][] = $rule;
    }

    // Stats
    $stats = [
        'total_rules' => count($rules),
        'global_rules' => count(array_filter($rules, fn($r) => $r['is_global'])),
        'user_rules' => count(array_filter($rules, fn($r) => !$r['is_global'])),
        'total_hits' => array_sum(array_column($rules, 'hit_count'))
    ];

    successResponse([
        'rules' => $rules,
        'by_category' => $byCategory,
        'stats' => $stats
    ]);
}

/**
 * POST - Create new rule
 */
function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    if (empty($input['category_id'])) {
        errorResponse('Category ID is required');
    }

    if (empty($input['match_value'])) {
        errorResponse('Match value is required');
    }

    // Validate category exists
    if (!$db->exists('categories', 'id = :id', ['id' => $input['category_id']])) {
        errorResponse('Category not found', 404);
    }

    // Validate match type
    $validMatchTypes = ['contains', 'starts_with', 'ends_with', 'exact', 'regex'];
    $matchType = $input['match_type'] ?? 'contains';
    if (!in_array($matchType, $validMatchTypes)) {
        errorResponse('Invalid match type');
    }

    // Validate match field
    $validMatchFields = ['description', 'vendor', 'memo', 'amount', 'any'];
    $matchField = $input['match_field'] ?? 'description';
    if (!in_array($matchField, $validMatchFields)) {
        errorResponse('Invalid match field');
    }

    // Check for duplicate rule
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $existing = $db->fetch(
        "SELECT id FROM categorization_rules
         WHERE category_id = :category_id
         AND match_field = :match_field
         AND match_type = :match_type
         AND match_value = :match_value
         AND (user_id IS NULL OR user_id = :user_id)",
        [
            'category_id' => $input['category_id'],
            'match_field' => $matchField,
            'match_type' => $matchType,
            'match_value' => $input['match_value'],
            'user_id' => $userId
        ]
    );

    if ($existing) {
        errorResponse('A similar rule already exists', 409);
    }

    // Prepare data
    $ruleData = [
        'user_id' => $userId,
        'category_id' => (int)$input['category_id'],
        'rule_name' => !empty($input['rule_name']) ? sanitize($input['rule_name']) : null,
        'match_field' => $matchField,
        'match_type' => $matchType,
        'match_value' => $input['match_value'],
        'match_case_sensitive' => isset($input['match_case_sensitive']) ? (int)$input['match_case_sensitive'] : 0,
        'priority' => isset($input['priority']) ? (int)$input['priority'] : 100,
        'is_active' => 1
    ];

    $ruleId = $db->insert('categorization_rules', $ruleData);

    // Get the created rule with joins
    $rule = $db->fetch(
        "SELECT r.*, c.name AS category_name, c.color AS category_color
         FROM categorization_rules r
         LEFT JOIN categories c ON r.category_id = c.id
         WHERE r.id = :id",
        ['id' => $ruleId]
    );

    successResponse(['rule' => $rule], 'Rule created successfully');
}

/**
 * PUT - Update rule
 */
function handlePut(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['id'])) {
        errorResponse('Rule ID is required');
    }

    $id = (int)$input['id'];

    // Get existing rule
    $rule = $db->fetch("SELECT * FROM categorization_rules WHERE id = :id", ['id' => $id]);

    if (!$rule) {
        errorResponse('Rule not found', 404);
    }

    // Don't allow editing global rules unless you're admin
    // For now, we'll just prevent editing system rules
    if ($rule['user_id'] === null && empty($input['force_global_edit'])) {
        errorResponse('Cannot edit global rules. Create a user-specific rule instead.', 403);
    }

    // Allowed fields
    $allowedFields = [
        'category_id', 'rule_name', 'match_field', 'match_type',
        'match_value', 'match_case_sensitive', 'priority', 'is_active'
    ];

    $updateData = [];
    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $input)) {
            $updateData[$field] = $input[$field];
        }
    }

    if (empty($updateData)) {
        errorResponse('No valid fields to update');
    }

    $db->update('categorization_rules', $updateData, 'id = :id', ['id' => $id]);

    // Get updated rule
    $updated = $db->fetch(
        "SELECT r.*, c.name AS category_name, c.color AS category_color
         FROM categorization_rules r
         LEFT JOIN categories c ON r.category_id = c.id
         WHERE r.id = :id",
        ['id' => $id]
    );

    successResponse(['rule' => $updated], 'Rule updated successfully');
}

/**
 * DELETE - Delete rule
 */
function handleDelete(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? $_GET['id'] ?? null;

    if (empty($id)) {
        errorResponse('Rule ID is required');
    }

    $id = (int)$id;

    // Get rule
    $rule = $db->fetch("SELECT * FROM categorization_rules WHERE id = :id", ['id' => $id]);

    if (!$rule) {
        errorResponse('Rule not found', 404);
    }

    $db->delete('categorization_rules', 'id = :id', ['id' => $id]);

    successResponse(['deleted' => true], 'Rule deleted successfully');
}
