<?php
/**
 * Category Update API
 * POST /api/categories/update.php
 *
 * Body: { "id": 123, "name": "New Name", "color": "#ff0000", ... }
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['id'])) {
    errorResponse('Category ID is required');
}

$id = (int)$input['id'];

try {
    $db = Database::getInstance();

    // Verify category exists
    $category = $db->fetch(
        "SELECT * FROM categories WHERE id = :id",
        ['id' => $id]
    );

    if (!$category) {
        errorResponse('Category not found', 404);
    }

    // Only prevent editing 'uncategorized' category
    if ($category['slug'] === 'uncategorized') {
        errorResponse('Cannot edit uncategorized category', 403);
    }

    // Allowed fields to update
    $allowedFields = ['name', 'color', 'icon', 'category_type', 'parent_id'];

    $updateData = [];

    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $input)) {
            if ($field === 'parent_id') {
                $updateData[$field] = !empty($input[$field]) ? (int)$input[$field] : null;
            } else {
                $updateData[$field] = $input[$field];
            }
        }
    }

    if (empty($updateData)) {
        errorResponse('No valid fields to update');
    }

    // If name changed, update slug
    if (isset($updateData['name'])) {
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $updateData['name']));
        $slug = trim($slug, '-');

        // Check for duplicate slug
        $userId = $category['user_id'];
        $existingSlug = $db->fetch(
            "SELECT id FROM categories WHERE slug = :slug AND id != :id AND (user_id IS NULL OR user_id = :user_id)",
            ['slug' => $slug, 'id' => $id, 'user_id' => $userId]
        );

        if ($existingSlug) {
            $slug .= '-' . time();
        }

        $updateData['slug'] = $slug;
    }

    // Validate parent if provided
    if (isset($updateData['parent_id']) && $updateData['parent_id']) {
        // Can't set itself as parent
        if ($updateData['parent_id'] == $id) {
            errorResponse('Category cannot be its own parent');
        }

        $parent = $db->fetch(
            "SELECT * FROM categories WHERE id = :id",
            ['id' => $updateData['parent_id']]
        );

        if (!$parent) {
            errorResponse('Parent category not found');
        }

        // Inherit type from parent
        $updateData['category_type'] = $parent['category_type'];
    }

    // Perform update
    $db->update('categories', $updateData, 'id = :id', ['id' => $id]);

    // Get updated category
    $updated = $db->fetch(
        "SELECT c.*, pc.name AS parent_name
         FROM categories c
         LEFT JOIN categories pc ON c.parent_id = pc.id
         WHERE c.id = :id",
        ['id' => $id]
    );

    successResponse(['category' => $updated], 'Category updated successfully');

} catch (Exception $e) {
    appLog('Category update error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
