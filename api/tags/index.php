<?php
/**
 * Tags API
 * GET /api/tags/ - List all tags
 * POST /api/tags/ - Create tag
 * DELETE /api/tags/?id=X - Delete tag
 * POST /api/tags/assign.php - Assign tags to transactions
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGet();
        break;
    case 'POST':
        handlePost();
        break;
    case 'DELETE':
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    try {
        $db = Database::getInstance();

        $tags = $db->fetchAll(
            "SELECT t.*,
                    COUNT(tt.transaction_id) as transaction_count,
                    COALESCE(SUM(ABS(tr.amount)), 0) as total_amount
             FROM tags t
             LEFT JOIN transaction_tags tt ON t.id = tt.tag_id
             LEFT JOIN transactions tr ON tt.transaction_id = tr.id
             WHERE t.user_id = :user_id
             GROUP BY t.id
             ORDER BY t.name",
            ['user_id' => $userId]
        );

        foreach ($tags as &$tag) {
            $tag['total_amount'] = (float)$tag['total_amount'];
        }

        successResponse(['tags' => $tags]);

    } catch (Exception $e) {
        appLog('Tags list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $name = trim($input['name'] ?? '');
    $color = $input['color'] ?? '#6366f1';

    if (!$userId) {
        errorResponse('User ID is required');
    }
    if (empty($name)) {
        errorResponse('Tag name is required');
    }

    try {
        $db = Database::getInstance();

        // Check if tag exists
        $existing = $db->fetch(
            "SELECT id FROM tags WHERE user_id = :user_id AND name = :name",
            ['user_id' => $userId, 'name' => $name]
        );

        if ($existing) {
            errorResponse('Tag already exists');
        }

        $tagId = $db->insert('tags', [
            'user_id' => $userId,
            'name' => $name,
            'color' => $color
        ]);

        successResponse(['id' => $tagId], 'Tag created');

    } catch (Exception $e) {
        appLog('Tag create error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('Tag ID is required');
    }

    try {
        $db = Database::getInstance();

        // Delete tag assignments first
        $db->query("DELETE FROM transaction_tags WHERE tag_id = :id", ['id' => $id]);

        // Delete tag
        $db->query("DELETE FROM tags WHERE id = :id", ['id' => $id]);

        successResponse(['deleted' => true], 'Tag deleted');

    } catch (Exception $e) {
        appLog('Tag delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
