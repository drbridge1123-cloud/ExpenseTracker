<?php
/**
 * User Permissions API
 * Returns the current user's permissions based on their role
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

// Check if user is logged in
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    errorResponse('Not authenticated', 401);
}

$userId = $_SESSION['user_id'];
$pdo = Database::getInstance()->getConnection();

try {
    // Get user's role_id
    $userStmt = $pdo->prepare("SELECT role_id, is_admin FROM users WHERE id = :id");
    $userStmt->execute(['id' => $userId]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        errorResponse('User not found', 404);
    }

    // If user is admin (is_admin flag), give all permissions
    if ($user['is_admin']) {
        $permStmt = $pdo->query("SELECT permission_key FROM permissions");
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
    } else {
        // Get permissions based on role
        $roleId = $user['role_id'] ?: 3; // Default to staff if no role

        $permStmt = $pdo->prepare("
            SELECT p.permission_key
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id = :role_id
        ");
        $permStmt->execute(['role_id' => $roleId]);
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
    }

    successResponse([
        'permissions' => $permissions,
        'is_admin' => (bool)$user['is_admin'],
        'role_id' => $user['role_id']
    ]);

} catch (Exception $e) {
    errorResponse('Error fetching permissions: ' . $e->getMessage());
}
