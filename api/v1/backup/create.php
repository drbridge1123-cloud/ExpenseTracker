<?php
/**
 * Create Full Backup API
 * POST /api/v1/backup/create.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$userId = !empty($input['user_id']) ? (int)$input['user_id'] : (!empty($_POST['user_id']) ? (int)$_POST['user_id'] : null);

if (!$userId) {
    errorResponse('User ID is required');
}

try {
    $db = Database::getInstance();

    // Verify user exists
    $user = $db->fetch("SELECT id, username FROM users WHERE id = :id", ['id' => $userId]);
    if (!$user) {
        errorResponse('User not found', 404);
    }

    // Create backup
    $backupManager = new BackupManager($userId);
    $result = $backupManager->createBackup();

    if ($result['success']) {
        // Return file for download
        $filePath = $result['path'];
        $fileName = $result['filename'];

        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $fileName . '"');
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: no-cache, no-store, must-revalidate');

        readfile($filePath);

        // Optionally delete after download
        // unlink($filePath);

        exit;
    } else {
        errorResponse('Backup creation failed');
    }

} catch (Exception $e) {
    appLog('Backup creation error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
