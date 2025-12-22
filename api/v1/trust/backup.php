<?php
/**
 * Trust Data Backup API
 * Creates a ZIP backup of all IOLTA trust data
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

if (!$userId) {
    errorResponse('user_id is required');
}

$pdo = Database::getInstance()->getConnection();

// Create temporary directory for backup files
$tempDir = sys_get_temp_dir() . '/trust_backup_' . $userId . '_' . time();
if (!mkdir($tempDir, 0755, true)) {
    errorResponse('Failed to create temp directory');
}

try {
    // Export all trust tables to JSON
    $tables = [
        'trust_clients' => "SELECT * FROM trust_clients WHERE user_id = :user_id",
        'trust_ledger' => "SELECT * FROM trust_ledger WHERE user_id = :user_id",
        'trust_transactions' => "SELECT * FROM trust_transactions WHERE user_id = :user_id",
        'trust_checks' => "SELECT * FROM trust_checks WHERE user_id = :user_id",
        'trust_reconciliations' => "SELECT * FROM trust_reconciliations WHERE user_id = :user_id",
        'trust_audit_log' => "SELECT * FROM trust_audit_log WHERE user_id = :user_id"
    ];

    $backupData = [
        'created_at' => date('Y-m-d H:i:s'),
        'user_id' => $userId,
        'version' => '1.0',
        'tables' => []
    ];

    foreach ($tables as $tableName => $sql) {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['user_id' => $userId]);
            $backupData['tables'][$tableName] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            // Table might not exist yet, skip it
            $backupData['tables'][$tableName] = [];
        }
    }

    // Write backup data to JSON file
    $jsonFile = $tempDir . '/trust_data.json';
    file_put_contents($jsonFile, json_encode($backupData, JSON_PRETTY_PRINT));

    // Create manifest file
    $manifest = [
        'created_at' => date('Y-m-d H:i:s'),
        'user_id' => $userId,
        'version' => '1.0',
        'tables' => array_map(function($data) {
            return count($data);
        }, $backupData['tables'])
    ];
    file_put_contents($tempDir . '/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT));

    // Create ZIP file
    $zipFile = $tempDir . '/trust_backup.zip';
    $zip = new ZipArchive();

    if ($zip->open($zipFile, ZipArchive::CREATE) !== true) {
        throw new Exception('Failed to create ZIP file');
    }

    $zip->addFile($jsonFile, 'trust_data.json');
    $zip->addFile($tempDir . '/manifest.json', 'manifest.json');
    $zip->close();

    // Send ZIP file to client
    $filename = 'trust_backup_' . date('Y-m-d_His') . '.zip';
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($zipFile));
    readfile($zipFile);

    // Cleanup
    unlink($jsonFile);
    unlink($tempDir . '/manifest.json');
    unlink($zipFile);
    rmdir($tempDir);

    exit;

} catch (Exception $e) {
    // Cleanup on error
    if (file_exists($tempDir)) {
        array_map('unlink', glob($tempDir . '/*'));
        rmdir($tempDir);
    }
    errorResponse('Backup failed: ' . $e->getMessage());
}
