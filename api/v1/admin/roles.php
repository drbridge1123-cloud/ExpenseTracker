<?php
/**
 * Roles API
 * Manages user roles for permission control
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($pdo);
        break;
    case 'POST':
        handlePost($db, $pdo);
        break;
    case 'PUT':
        handlePut($pdo);
        break;
    case 'DELETE':
        handleDelete($pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $roleId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if ($roleId) {
        // Get single role with permissions
        $sql = "SELECT r.*,
                GROUP_CONCAT(p.permission_key) as permissions
                FROM roles r
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                WHERE r.id = :id
                GROUP BY r.id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $roleId]);
        $role = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$role) {
            errorResponse('Role not found', 404);
        }

        $role['permissions'] = $role['permissions'] ? explode(',', $role['permissions']) : [];
        successResponse(['role' => $role]);
    } else {
        // Get all roles with user counts
        $sql = "SELECT r.*,
                COUNT(DISTINCT u.id) as user_count,
                GROUP_CONCAT(DISTINCT p.permission_key) as permissions
                FROM roles r
                LEFT JOIN users u ON u.role_id = r.id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                GROUP BY r.id
                ORDER BY r.id";
        $stmt = $pdo->query($sql);
        $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($roles as &$role) {
            $role['permissions'] = $role['permissions'] ? explode(',', $role['permissions']) : [];
            $role['user_count'] = (int)$role['user_count'];
            $role['is_system'] = (bool)$role['is_system'];
        }

        successResponse(['roles' => $roles]);
    }
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $roleName = trim($input['role_name'] ?? '');
    $roleLabel = trim($input['role_label'] ?? '');
    $description = trim($input['description'] ?? '');
    $permissions = $input['permissions'] ?? [];

    if (!$roleName || !$roleLabel) {
        errorResponse('Role name and label are required');
    }

    // Check for duplicate role name
    $checkStmt = $pdo->prepare("SELECT id FROM roles WHERE role_name = :name");
    $checkStmt->execute(['name' => $roleName]);
    if ($checkStmt->fetch()) {
        errorResponse('Role name already exists');
    }

    try {
        $pdo->beginTransaction();

        // Insert role
        $roleId = $db->insert('roles', [
            'role_name' => $roleName,
            'role_label' => $roleLabel,
            'description' => $description,
            'is_system' => 0
        ]);

        // Assign permissions
        if (!empty($permissions)) {
            $permSql = "INSERT INTO role_permissions (role_id, permission_id)
                        SELECT :role_id, id FROM permissions WHERE permission_key = :key";
            $permStmt = $pdo->prepare($permSql);

            foreach ($permissions as $permKey) {
                $permStmt->execute(['role_id' => $roleId, 'key' => $permKey]);
            }
        }

        $pdo->commit();
        successResponse(['id' => $roleId, 'message' => 'Role created successfully']);

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Error creating role: ' . $e->getMessage());
    }
}

function handlePut(PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $roleId = (int)($input['id'] ?? 0);
    if (!$roleId) {
        errorResponse('Role ID is required');
    }

    // Check if role exists
    $checkStmt = $pdo->prepare("SELECT * FROM roles WHERE id = :id");
    $checkStmt->execute(['id' => $roleId]);
    $role = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    $roleLabel = trim($input['role_label'] ?? $role['role_label']);
    $description = trim($input['description'] ?? $role['description']);
    $permissions = $input['permissions'] ?? null;

    try {
        $pdo->beginTransaction();

        // Update role info (don't allow changing role_name for system roles)
        if (!$role['is_system'] && !empty($input['role_name'])) {
            $sql = "UPDATE roles SET role_name = :name, role_label = :label, description = :desc WHERE id = :id";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'name' => trim($input['role_name']),
                'label' => $roleLabel,
                'desc' => $description,
                'id' => $roleId
            ]);
        } else {
            $sql = "UPDATE roles SET role_label = :label, description = :desc WHERE id = :id";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'label' => $roleLabel,
                'desc' => $description,
                'id' => $roleId
            ]);
        }

        // Update permissions if provided
        if ($permissions !== null) {
            // Remove existing permissions
            $delStmt = $pdo->prepare("DELETE FROM role_permissions WHERE role_id = :id");
            $delStmt->execute(['id' => $roleId]);

            // Add new permissions
            if (!empty($permissions)) {
                $permSql = "INSERT INTO role_permissions (role_id, permission_id)
                            SELECT :role_id, id FROM permissions WHERE permission_key = :key";
                $permStmt = $pdo->prepare($permSql);

                foreach ($permissions as $permKey) {
                    $permStmt->execute(['role_id' => $roleId, 'key' => $permKey]);
                }
            }
        }

        $pdo->commit();
        successResponse(['message' => 'Role updated successfully']);

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Error updating role: ' . $e->getMessage());
    }
}

function handleDelete(PDO $pdo): void {
    $roleId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$roleId) {
        errorResponse('Role ID is required');
    }

    // Check if role exists and is not system role
    $checkStmt = $pdo->prepare("SELECT * FROM roles WHERE id = :id");
    $checkStmt->execute(['id' => $roleId]);
    $role = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    if ($role['is_system']) {
        errorResponse('Cannot delete system roles');
    }

    // Check if any users have this role
    $userStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role_id = :id");
    $userStmt->execute(['id' => $roleId]);
    if ($userStmt->fetchColumn() > 0) {
        errorResponse('Cannot delete role with assigned users. Reassign users first.');
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM roles WHERE id = :id");
        $stmt->execute(['id' => $roleId]);
        successResponse(['message' => 'Role deleted successfully']);
    } catch (Exception $e) {
        errorResponse('Error deleting role: ' . $e->getMessage());
    }
}
