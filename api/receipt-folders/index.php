<?php
/**
 * Receipt Folders API - CRUD for organizing receipts into folders
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
    case 'PUT':
        handlePut();
        break;
    case 'DELETE':
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    try {
        $db = Database::getInstance();

        $userId = (int)($_GET['user_id'] ?? 0);
        if (!$userId) {
            errorResponse('User ID is required');
        }

        // Get folders with receipt counts
        $sql = "SELECT
                    f.*,
                    COUNT(r.id) AS receipt_count,
                    c.name AS category_name,
                    c.icon AS category_icon,
                    c.color AS category_color
                FROM receipt_folders f
                LEFT JOIN receipts r ON r.folder_id = f.id
                LEFT JOIN categories c ON f.category_id = c.id
                WHERE f.user_id = :user_id
                GROUP BY f.id
                ORDER BY f.folder_type, f.name";

        $folders = $db->fetchAll($sql, ['user_id' => $userId]);

        // Get count of unfiled receipts
        $unfiledCount = $db->fetch(
            "SELECT COUNT(*) AS count FROM receipts WHERE user_id = :user_id AND folder_id IS NULL",
            ['user_id' => $userId]
        );

        // Get total receipts count
        $totalCount = $db->fetch(
            "SELECT COUNT(*) AS count FROM receipts WHERE user_id = :user_id",
            ['user_id' => $userId]
        );

        successResponse([
            'folders' => $folders,
            'unfiled_count' => (int)$unfiledCount['count'],
            'total_count' => (int)$totalCount['count']
        ]);

    } catch (Exception $e) {
        appLog('Folders list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    try {
        $db = Database::getInstance();
        $input = json_decode(file_get_contents('php://input'), true);

        $userId = (int)($input['user_id'] ?? 0);
        $name = trim($input['name'] ?? '');
        $folderType = $input['folder_type'] ?? 'custom';
        $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
        $icon = $input['icon'] ?? null;
        $color = $input['color'] ?? null;

        if (!$userId) {
            errorResponse('User ID is required');
        }

        if (!$name) {
            errorResponse('Folder name is required');
        }

        // Check for duplicate name
        $existing = $db->fetch(
            "SELECT id FROM receipt_folders WHERE user_id = :user_id AND name = :name",
            ['user_id' => $userId, 'name' => $name]
        );

        if ($existing) {
            errorResponse('A folder with this name already exists');
        }

        // If creating category folder, get category info
        if ($categoryId && !$icon && !$color) {
            $category = $db->fetch(
                "SELECT icon, color FROM categories WHERE id = :id",
                ['id' => $categoryId]
            );
            if ($category) {
                $icon = $icon ?? $category['icon'];
                $color = $color ?? $category['color'];
            }
        }

        $folderId = $db->insert('receipt_folders', [
            'user_id' => $userId,
            'name' => $name,
            'folder_type' => $folderType,
            'category_id' => $categoryId,
            'icon' => $icon,
            'color' => $color
        ]);

        $folder = $db->fetch("SELECT * FROM receipt_folders WHERE id = :id", ['id' => $folderId]);

        successResponse(['folder' => $folder], 'Folder created successfully');

    } catch (Exception $e) {
        appLog('Folder create error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePut() {
    try {
        $db = Database::getInstance();
        $input = json_decode(file_get_contents('php://input'), true);

        $folderId = (int)($input['id'] ?? 0);
        if (!$folderId) {
            errorResponse('Folder ID is required');
        }

        $folder = $db->fetch("SELECT * FROM receipt_folders WHERE id = :id", ['id' => $folderId]);
        if (!$folder) {
            errorResponse('Folder not found', 404);
        }

        $updateData = [];
        if (isset($input['name'])) {
            $name = trim($input['name']);
            // Check for duplicate name (excluding current folder)
            $existing = $db->fetch(
                "SELECT id FROM receipt_folders WHERE user_id = :user_id AND name = :name AND id != :id",
                ['user_id' => $folder['user_id'], 'name' => $name, 'id' => $folderId]
            );
            if ($existing) {
                errorResponse('A folder with this name already exists');
            }
            $updateData['name'] = $name;
        }
        if (isset($input['icon'])) $updateData['icon'] = $input['icon'];
        if (isset($input['color'])) $updateData['color'] = $input['color'];

        if (!empty($updateData)) {
            $db->update('receipt_folders', $updateData, 'id = :id', ['id' => $folderId]);
        }

        $updatedFolder = $db->fetch("SELECT * FROM receipt_folders WHERE id = :id", ['id' => $folderId]);

        successResponse(['folder' => $updatedFolder], 'Folder updated');

    } catch (Exception $e) {
        appLog('Folder update error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    try {
        $db = Database::getInstance();

        $folderId = (int)($_GET['id'] ?? 0);
        if (!$folderId) {
            errorResponse('Folder ID is required');
        }

        $folder = $db->fetch("SELECT * FROM receipt_folders WHERE id = :id", ['id' => $folderId]);
        if (!$folder) {
            errorResponse('Folder not found', 404);
        }

        // Move receipts to unfiled (folder_id = NULL)
        $db->query(
            "UPDATE receipts SET folder_id = NULL WHERE folder_id = :folder_id",
            ['folder_id' => $folderId]
        );

        // Delete folder
        $db->query("DELETE FROM receipt_folders WHERE id = :id", ['id' => $folderId]);

        successResponse(null, 'Folder deleted');

    } catch (Exception $e) {
        appLog('Folder delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
