<?php
/**
 * Trust Data Restore API
 * Restores IOLTA trust data from a backup ZIP file
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_POST['user_id']) ? (int)$_POST['user_id'] : null;
$mode = $_POST['mode'] ?? 'merge';

if (!$userId) {
    errorResponse('user_id is required');
}

if (!isset($_FILES['backup_file']) || $_FILES['backup_file']['error'] !== UPLOAD_ERR_OK) {
    errorResponse('Backup file is required');
}

$pdo = Database::getInstance()->getConnection();

// Create temporary directory for extraction
$tempDir = sys_get_temp_dir() . '/trust_restore_' . $userId . '_' . time();
if (!mkdir($tempDir, 0755, true)) {
    errorResponse('Failed to create temp directory');
}

try {
    // Extract ZIP file
    $zip = new ZipArchive();
    if ($zip->open($_FILES['backup_file']['tmp_name']) !== true) {
        throw new Exception('Failed to open ZIP file');
    }

    $zip->extractTo($tempDir);
    $zip->close();

    // Read backup data
    $jsonFile = $tempDir . '/trust_data.json';
    if (!file_exists($jsonFile)) {
        throw new Exception('Invalid backup file: trust_data.json not found');
    }

    $backupData = json_decode(file_get_contents($jsonFile), true);
    if (!$backupData || !isset($backupData['tables'])) {
        throw new Exception('Invalid backup data format');
    }

    $stats = [];

    $pdo->beginTransaction();

    // If replace mode, delete existing data first (in reverse dependency order)
    if ($mode === 'replace') {
        $pdo->exec("DELETE FROM trust_audit_log WHERE user_id = $userId");
        $pdo->exec("DELETE FROM trust_reconciliations WHERE user_id = $userId");
        $pdo->exec("DELETE FROM trust_checks WHERE user_id = $userId");
        $pdo->exec("DELETE FROM trust_transactions WHERE user_id = $userId");
        $pdo->exec("DELETE FROM trust_ledger WHERE user_id = $userId");
        $pdo->exec("DELETE FROM trust_clients WHERE user_id = $userId");
    }

    // Restore tables in dependency order
    $tableOrder = [
        'trust_clients',
        'trust_ledger',
        'trust_transactions',
        'trust_checks',
        'trust_reconciliations',
        'trust_audit_log'
    ];

    // Map old IDs to new IDs
    $idMaps = [];

    foreach ($tableOrder as $tableName) {
        if (!isset($backupData['tables'][$tableName])) {
            continue;
        }

        $rows = $backupData['tables'][$tableName];
        $stats[$tableName] = 0;

        foreach ($rows as $row) {
            // Store old ID for mapping
            $oldId = $row['id'] ?? null;

            // Update user_id to current user
            $row['user_id'] = $userId;

            // Remove id for auto-increment
            unset($row['id']);

            // Map foreign keys to new IDs
            if ($tableName === 'trust_ledger') {
                if (isset($row['client_id']) && isset($idMaps['trust_clients'][$row['client_id']])) {
                    $row['client_id'] = $idMaps['trust_clients'][$row['client_id']];
                }
            } elseif ($tableName === 'trust_transactions') {
                if (isset($row['ledger_id']) && isset($idMaps['trust_ledger'][$row['ledger_id']])) {
                    $row['ledger_id'] = $idMaps['trust_ledger'][$row['ledger_id']];
                }
            } elseif ($tableName === 'trust_checks') {
                if (isset($row['ledger_id']) && isset($idMaps['trust_ledger'][$row['ledger_id']])) {
                    $row['ledger_id'] = $idMaps['trust_ledger'][$row['ledger_id']];
                }
            } elseif ($tableName === 'trust_audit_log') {
                if (isset($row['client_id']) && isset($idMaps['trust_clients'][$row['client_id']])) {
                    $row['client_id'] = $idMaps['trust_clients'][$row['client_id']];
                }
            }

            // Build INSERT statement
            $columns = array_keys($row);
            $placeholders = array_map(fn($c) => ":$c", $columns);

            $sql = "INSERT INTO $tableName (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";

            try {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($row);
                $newId = $pdo->lastInsertId();

                // Store ID mapping
                if ($oldId !== null) {
                    $idMaps[$tableName][$oldId] = $newId;
                }

                $stats[$tableName]++;
            } catch (PDOException $e) {
                // Skip duplicate entries in merge mode
                if ($mode === 'merge' && strpos($e->getMessage(), 'Duplicate') !== false) {
                    continue;
                }
                throw $e;
            }
        }
    }

    $pdo->commit();

    // Cleanup
    array_map('unlink', glob($tempDir . '/*'));
    rmdir($tempDir);

    successResponse([
        'message' => 'Restore completed successfully',
        'mode' => $mode,
        'stats' => $stats
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    // Cleanup on error
    if (file_exists($tempDir)) {
        array_map('unlink', glob($tempDir . '/*'));
        rmdir($tempDir);
    }

    errorResponse('Restore failed: ' . $e->getMessage());
}
