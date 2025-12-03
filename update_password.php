<?php
/**
 * Password Update Utility
 * Uses centralized configuration from config.php
 *
 * Usage: php update_password.php <username> <new_password>
 * Example: php update_password.php daniel MyNewPassword123
 */

// Load configuration
require_once __DIR__ . '/config/config.php';

// Get database instance
$db = Database::getInstance();

// Get parameters from command line or use defaults
$username = $argv[1] ?? 'daniel';
$newPassword = $argv[2] ?? null;

if (!$newPassword) {
    echo "Usage: php update_password.php <username> <new_password>\n";
    echo "Example: php update_password.php daniel MyNewPassword123\n";
    exit(1);
}

try {
    $hash = password_hash($newPassword, PASSWORD_DEFAULT, ['cost' => PASSWORD_COST]);

    $stmt = $db->query(
        'UPDATE users SET password_hash = ? WHERE username = ?',
        [$hash, $username]
    );

    if ($stmt->rowCount() > 0) {
        echo "Password updated for {$username}.\n";
        echo "Verification: " . (password_verify($newPassword, $hash) ? 'SUCCESS' : 'FAILED') . "\n";
    } else {
        echo "User '{$username}' not found.\n";
        exit(1);
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
