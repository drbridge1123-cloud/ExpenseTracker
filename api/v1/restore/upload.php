<?php
/**
 * Restore from Backup API
 * POST /api/v1/restore/upload.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

if (empty($_POST['user_id'])) {
    errorResponse('User ID is required');
}

if (empty($_FILES['backup_file'])) {
    errorResponse('Backup file is required');
}

$userId = (int)$_POST['user_id'];
$mode = $_POST['mode'] ?? 'merge'; // 'merge' or 'replace'
$file = $_FILES['backup_file'];

// Validate mode
if (!in_array($mode, ['merge', 'replace'])) {
    errorResponse('Invalid mode. Use "merge" or "replace"');
}

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds server limit',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds form limit',
        UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file',
        UPLOAD_ERR_EXTENSION => 'Upload blocked by extension'
    ];
    errorResponse($errors[$file['error']] ?? 'Upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'zip') {
    errorResponse('Only ZIP files are allowed');
}

// Check file size (max 100MB for backups)
$maxSize = 100 * 1024 * 1024;
if ($file['size'] > $maxSize) {
    errorResponse('File size exceeds maximum allowed (100MB)');
}

try {
    $db = Database::getInstance();

    // Verify user exists
    $user = $db->fetch("SELECT id, username FROM users WHERE id = :id", ['id' => $userId]);
    if (!$user) {
        errorResponse('User not found', 404);
    }

    // Restore from backup
    $restoreManager = new RestoreManager($userId, $mode);
    $result = $restoreManager->restore($file['tmp_name']);

    if ($result['success']) {
        successResponse([
            'restored' => true,
            'mode' => $result['mode'],
            'backup_created' => $result['backup_created'],
            'stats' => $result['stats']
        ], 'Backup restored successfully');
    } else {
        errorResponse('Restore failed');
    }

} catch (Exception $e) {
    appLog('Restore error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
