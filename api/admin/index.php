<?php
/**
 * Admin API
 * GET /api/admin/ - Get all users (admin only)
 * POST /api/admin/ - Create/update user (admin only)
 * DELETE /api/admin/?id=X - Delete user (admin only)
 * POST /api/admin/?action=toggle - Toggle user active status
 * POST /api/admin/?action=reset-password - Reset user password
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Check admin access
function requireAdmin() {
    if (empty($_SESSION['logged_in']) || empty($_SESSION['is_admin'])) {
        errorResponse('Admin access required', 403);
    }
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        requireAdmin();
        handleGet();
        break;
    case 'POST':
        requireAdmin();
        if ($action === 'toggle') {
            handleToggleActive();
        } elseif ($action === 'reset-password') {
            handleResetPassword();
        } else {
            handleCreateUpdate();
        }
        break;
    case 'DELETE':
        requireAdmin();
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    try {
        $db = Database::getInstance();

        $users = $db->fetchAll(
            "SELECT u.id, u.username, u.email, u.display_name, u.is_active, u.is_admin,
                    u.default_currency, u.timezone, u.created_at, u.last_login,
                    (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as transaction_count,
                    (SELECT COUNT(*) FROM accounts WHERE user_id = u.id) as account_count
             FROM users u
             ORDER BY u.id ASC"
        );

        // Get system stats
        $stats = [
            'total_users' => count($users),
            'active_users' => count(array_filter($users, fn($u) => $u['is_active'])),
            'admin_users' => count(array_filter($users, fn($u) => $u['is_admin'])),
            'total_transactions' => array_sum(array_column($users, 'transaction_count')),
            'total_accounts' => array_sum(array_column($users, 'account_count'))
        ];

        successResponse([
            'users' => $users,
            'stats' => $stats
        ]);

    } catch (Exception $e) {
        appLog('Admin get users error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleCreateUpdate() {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $displayName = trim($input['display_name'] ?? '');
    $isActive = isset($input['is_active']) ? (int)$input['is_active'] : 1;
    $isAdmin = isset($input['is_admin']) ? (int)$input['is_admin'] : 0;

    try {
        $db = Database::getInstance();

        if ($id) {
            // Update existing user
            $updates = [];
            $params = ['id' => $id];

            if (!empty($username)) {
                // Check uniqueness
                $existing = $db->fetch(
                    "SELECT id FROM users WHERE username = :username AND id != :id",
                    ['username' => $username, 'id' => $id]
                );
                if ($existing) {
                    errorResponse('Username already taken');
                }
                $updates[] = "username = :username";
                $params['username'] = $username;
            }

            if (!empty($email)) {
                $existing = $db->fetch(
                    "SELECT id FROM users WHERE email = :email AND id != :id",
                    ['email' => $email, 'id' => $id]
                );
                if ($existing) {
                    errorResponse('Email already in use');
                }
                $updates[] = "email = :email";
                $params['email'] = $email;
            }

            if (!empty($displayName)) {
                $updates[] = "display_name = :display_name";
                $params['display_name'] = $displayName;
            }

            if (!empty($password)) {
                $updates[] = "password_hash = :password_hash";
                $params['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            }

            $updates[] = "is_active = :is_active";
            $params['is_active'] = $isActive;

            $updates[] = "is_admin = :is_admin";
            $params['is_admin'] = $isAdmin;

            if (!empty($updates)) {
                $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = :id";
                $db->query($sql, $params);
            }

            successResponse(['id' => $id], 'User updated successfully');

        } else {
            // Create new user
            if (empty($username) || empty($email) || empty($password)) {
                errorResponse('Username, email, and password are required');
            }

            // Check uniqueness
            $existing = $db->fetch(
                "SELECT id FROM users WHERE username = :username",
                ['username' => $username]
            );
            if ($existing) {
                errorResponse('Username already taken');
            }

            $existing = $db->fetch(
                "SELECT id FROM users WHERE email = :email",
                ['email' => $email]
            );
            if ($existing) {
                errorResponse('Email already in use');
            }

            $userId = $db->insert('users', [
                'username' => $username,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'display_name' => $displayName ?: $username,
                'is_active' => $isActive,
                'is_admin' => $isAdmin
            ]);

            successResponse(['id' => $userId], 'User created successfully');
        }

    } catch (Exception $e) {
        appLog('Admin create/update user error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleToggleActive() {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = !empty($input['id']) ? (int)$input['id'] : null;

    if (!$id) {
        errorResponse('User ID is required');
    }

    // Prevent disabling yourself
    if ($id == $_SESSION['user_id']) {
        errorResponse('Cannot deactivate your own account');
    }

    try {
        $db = Database::getInstance();

        $user = $db->fetch("SELECT is_active FROM users WHERE id = :id", ['id' => $id]);
        if (!$user) {
            errorResponse('User not found', 404);
        }

        $newStatus = $user['is_active'] ? 0 : 1;
        $db->query(
            "UPDATE users SET is_active = :status WHERE id = :id",
            ['status' => $newStatus, 'id' => $id]
        );

        successResponse([
            'id' => $id,
            'is_active' => $newStatus
        ], $newStatus ? 'User activated' : 'User deactivated');

    } catch (Exception $e) {
        appLog('Admin toggle user error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleResetPassword() {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $newPassword = $input['password'] ?? '';

    if (!$id) {
        errorResponse('User ID is required');
    }

    if (strlen($newPassword) < 6) {
        errorResponse('Password must be at least 6 characters');
    }

    try {
        $db = Database::getInstance();

        $db->query(
            "UPDATE users SET password_hash = :hash WHERE id = :id",
            [
                'hash' => password_hash($newPassword, PASSWORD_DEFAULT),
                'id' => $id
            ]
        );

        successResponse(null, 'Password reset successfully');

    } catch (Exception $e) {
        appLog('Admin reset password error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('User ID is required');
    }

    // Prevent deleting yourself
    if ($id == $_SESSION['user_id']) {
        errorResponse('Cannot delete your own account');
    }

    try {
        $db = Database::getInstance();

        // Check if user exists
        $user = $db->fetch("SELECT id, username FROM users WHERE id = :id", ['id' => $id]);
        if (!$user) {
            errorResponse('User not found', 404);
        }

        // Delete user's data (cascade)
        $db->query("DELETE FROM transactions WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM recurring_transactions WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM budgets WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM categorization_rules WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM checks WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM accounts WHERE user_id = :id", ['id' => $id]);
        $db->query("DELETE FROM categories WHERE user_id = :id AND is_system = 0", ['id' => $id]);
        $db->query("DELETE FROM users WHERE id = :id", ['id' => $id]);

        successResponse(null, "User '{$user['username']}' deleted successfully");

    } catch (Exception $e) {
        appLog('Admin delete user error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
