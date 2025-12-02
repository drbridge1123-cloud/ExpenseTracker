<?php
/**
 * Authentication API
 * POST /api/auth/ - Login
 * POST /api/auth/?action=register - Register new user
 * POST /api/auth/?action=logout - Logout
 * GET /api/auth/?action=check - Check session
 * PUT /api/auth/ - Update user profile
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

// Start session if not started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'check') {
            checkSession();
        } else {
            errorResponse('Invalid action', 400);
        }
        break;
    case 'POST':
        if ($action === 'register') {
            handleRegister();
        } elseif ($action === 'logout') {
            handleLogout();
        } else {
            handleLogin();
        }
        break;
    case 'PUT':
        handleUpdateProfile();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleLogin() {
    $input = json_decode(file_get_contents('php://input'), true);

    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    // Debug log
    appLog('Login attempt', 'debug', ['username' => $username, 'password_length' => strlen($password)]);

    if (empty($username) || empty($password)) {
        errorResponse('Username and password are required');
    }

    try {
        $db = Database::getInstance();

        // Find user by username or email
        $user = $db->fetch(
            "SELECT * FROM users WHERE username = :username OR email = :email",
            ['username' => $username, 'email' => $username]
        );

        if (!$user) {
            errorResponse('Invalid username or password', 401);
        }

        if (!$user['is_active']) {
            errorResponse('Account is deactivated. Contact administrator.', 403);
        }

        // Verify password
        appLog('Password check', 'debug', ['hash' => $user['password_hash'], 'verify_result' => password_verify($password, $user['password_hash'])]);
        if (!password_verify($password, $user['password_hash'])) {
            errorResponse('Invalid username or password', 401);
        }

        // Update last login
        $db->query(
            "UPDATE users SET last_login = NOW() WHERE id = :id",
            ['id' => $user['id']]
        );

        // Set session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['is_admin'] = $user['is_admin'];
        $_SESSION['logged_in'] = true;

        // Return user data (without password)
        unset($user['password_hash']);

        successResponse([
            'user' => $user,
            'session_id' => session_id()
        ], 'Login successful');

    } catch (Exception $e) {
        appLog('Login error: ' . $e->getMessage(), 'error');
        errorResponse('Login failed', 500);
    }
}

function handleRegister() {
    $input = json_decode(file_get_contents('php://input'), true);

    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $displayName = trim($input['display_name'] ?? '');

    if (empty($username) || empty($email) || empty($password)) {
        errorResponse('Username, email, and password are required');
    }

    if (strlen($username) < 3) {
        errorResponse('Username must be at least 3 characters');
    }

    if (strlen($password) < 6) {
        errorResponse('Password must be at least 6 characters');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        errorResponse('Invalid email address');
    }

    try {
        $db = Database::getInstance();

        // Check if username exists
        $existing = $db->fetch(
            "SELECT id FROM users WHERE username = :username",
            ['username' => $username]
        );
        if ($existing) {
            errorResponse('Username already taken');
        }

        // Check if email exists
        $existing = $db->fetch(
            "SELECT id FROM users WHERE email = :email",
            ['email' => $email]
        );
        if ($existing) {
            errorResponse('Email already registered');
        }

        // Create user
        $userId = $db->insert('users', [
            'username' => $username,
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'display_name' => $displayName ?: $username,
            'is_active' => 1,
            'is_admin' => 0
        ]);

        // Create default categories for new user
        createDefaultCategories($db, $userId);

        successResponse(['user_id' => $userId], 'Registration successful');

    } catch (Exception $e) {
        appLog('Registration error: ' . $e->getMessage(), 'error');
        errorResponse('Registration failed', 500);
    }
}

function createDefaultCategories($db, $userId) {
    // Copy system categories for user or create defaults
    // This can be customized based on your needs
}

function handleLogout() {
    $_SESSION = [];

    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }

    session_destroy();

    successResponse(null, 'Logged out successfully');
}

function checkSession() {
    if (!empty($_SESSION['logged_in']) && !empty($_SESSION['user_id'])) {
        try {
            $db = Database::getInstance();
            $user = $db->fetch(
                "SELECT id, username, email, display_name, is_active, is_admin, default_currency, timezone
                 FROM users WHERE id = :id",
                ['id' => $_SESSION['user_id']]
            );

            if ($user && $user['is_active']) {
                successResponse([
                    'logged_in' => true,
                    'user' => $user
                ]);
            }
        } catch (Exception $e) {
            // Session invalid
        }
    }

    successResponse([
        'logged_in' => false,
        'user' => null
    ]);
}

function handleUpdateProfile() {
    if (empty($_SESSION['user_id'])) {
        errorResponse('Not authenticated', 401);
    }

    $input = json_decode(file_get_contents('php://input'), true);

    $displayName = trim($input['display_name'] ?? '');
    $email = trim($input['email'] ?? '');
    $currentPassword = $input['current_password'] ?? '';
    $newPassword = $input['new_password'] ?? '';

    try {
        $db = Database::getInstance();

        $updates = [];
        $params = ['id' => $_SESSION['user_id']];

        if (!empty($displayName)) {
            $updates[] = "display_name = :display_name";
            $params['display_name'] = $displayName;
        }

        if (!empty($email)) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                errorResponse('Invalid email address');
            }

            // Check if email is taken by another user
            $existing = $db->fetch(
                "SELECT id FROM users WHERE email = :email AND id != :user_id",
                ['email' => $email, 'user_id' => $_SESSION['user_id']]
            );
            if ($existing) {
                errorResponse('Email already in use');
            }

            $updates[] = "email = :email";
            $params['email'] = $email;
        }

        // Password change
        if (!empty($newPassword)) {
            if (empty($currentPassword)) {
                errorResponse('Current password is required to change password');
            }

            // Verify current password
            $user = $db->fetch(
                "SELECT password_hash FROM users WHERE id = :id",
                ['id' => $_SESSION['user_id']]
            );

            if (!password_verify($currentPassword, $user['password_hash'])) {
                errorResponse('Current password is incorrect');
            }

            if (strlen($newPassword) < 6) {
                errorResponse('New password must be at least 6 characters');
            }

            $updates[] = "password_hash = :password_hash";
            $params['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
        }

        if (empty($updates)) {
            errorResponse('No changes to update');
        }

        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = :id";
        $db->query($sql, $params);

        successResponse(null, 'Profile updated successfully');

    } catch (Exception $e) {
        appLog('Profile update error: ' . $e->getMessage(), 'error');
        errorResponse('Update failed', 500);
    }
}
