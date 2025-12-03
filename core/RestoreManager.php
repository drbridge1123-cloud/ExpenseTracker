<?php
/**
 * RestoreManager - Restore from backup ZIP
 */

class RestoreManager
{
    private Database $db;
    private int $userId;
    private string $mode;

    // Tables to restore (in order for FK constraints)
    private array $tables = [
        'accounts',
        'categories',
        'categorization_rules',
        'budgets',
        'recurring_transactions',
        'transactions',
        'receipts',
        'checks',
        'reconciliations'
    ];

    public function __construct(int $userId, string $mode = 'merge')
    {
        $this->db = Database::getInstance();
        $this->userId = $userId;
        $this->mode = $mode; // 'merge' or 'replace'
    }

    /**
     * Restore from backup ZIP
     */
    public function restore(string $zipPath): array
    {
        if (!file_exists($zipPath)) {
            throw new Exception('Backup file not found');
        }

        $tempDir = sys_get_temp_dir() . '/restore_' . uniqid();

        try {
            // Extract ZIP
            $this->extractZip($zipPath, $tempDir);

            // Validate backup
            $manifest = $this->validateBackup($tempDir);

            // Start restore
            $stats = [];

            if ($this->mode === 'replace') {
                // Delete existing data in reverse order (FK constraints)
                $this->deleteUserData();
            }

            // Restore data
            $stats['data'] = $this->restoreData($tempDir . '/data');

            // Restore files
            $stats['files'] = $this->restoreFiles($tempDir . '/files');

            // Cleanup
            $this->deleteDirectory($tempDir);

            return [
                'success' => true,
                'mode' => $this->mode,
                'stats' => $stats,
                'backup_created' => $manifest['created_at'] ?? 'unknown'
            ];

        } catch (Exception $e) {
            // Cleanup on error
            if (is_dir($tempDir)) {
                $this->deleteDirectory($tempDir);
            }
            throw $e;
        }
    }

    /**
     * Extract ZIP archive
     */
    private function extractZip(string $zipPath, string $destDir): void
    {
        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new Exception('Failed to open backup ZIP');
        }

        // Security: check for path traversal
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $filename = $zip->getNameIndex($i);
            if (strpos($filename, '..') !== false || strpos($filename, ':') !== false) {
                throw new Exception('Invalid file path in backup');
            }
        }

        mkdir($destDir, 0755, true);
        $zip->extractTo($destDir);
        $zip->close();
    }

    /**
     * Validate backup structure
     */
    private function validateBackup(string $tempDir): array
    {
        $manifestPath = $tempDir . '/manifest.json';
        if (!file_exists($manifestPath)) {
            throw new Exception('Invalid backup: manifest.json not found');
        }

        $manifest = json_decode(file_get_contents($manifestPath), true);
        if (!$manifest) {
            throw new Exception('Invalid backup: corrupt manifest');
        }

        // Check data directory
        if (!is_dir($tempDir . '/data')) {
            throw new Exception('Invalid backup: data directory not found');
        }

        return $manifest;
    }

    /**
     * Delete all user data (for replace mode)
     */
    private function deleteUserData(): void
    {
        // Delete in reverse order to respect FK constraints
        $reverseTables = array_reverse($this->tables);

        $this->db->beginTransaction();
        try {
            foreach ($reverseTables as $table) {
                $this->db->query("DELETE FROM `$table` WHERE user_id = :user_id", ['user_id' => $this->userId]);
            }
            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }

    /**
     * Restore data from JSON files
     */
    private function restoreData(string $dataDir): array
    {
        $stats = [];

        $this->db->beginTransaction();
        try {
            // ID mapping for FK updates
            $idMaps = [];

            foreach ($this->tables as $table) {
                $jsonFile = $dataDir . '/' . $table . '.json';
                if (!file_exists($jsonFile)) {
                    $stats[$table] = ['imported' => 0, 'skipped' => 0];
                    continue;
                }

                $data = json_decode(file_get_contents($jsonFile), true);
                if (!is_array($data)) {
                    $stats[$table] = ['imported' => 0, 'skipped' => 0, 'error' => 'Invalid JSON'];
                    continue;
                }

                $result = $this->restoreTable($table, $data, $idMaps);
                $idMaps[$table] = $result['id_map'];
                $stats[$table] = [
                    'imported' => $result['imported'],
                    'skipped' => $result['skipped']
                ];
            }

            $this->db->commit();
            return $stats;

        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }

    /**
     * Restore a single table
     */
    private function restoreTable(string $table, array $data, array $idMaps): array
    {
        $imported = 0;
        $skipped = 0;
        $idMap = []; // old_id => new_id

        foreach ($data as $row) {
            $oldId = $row['id'];
            unset($row['id']); // Let MySQL generate new ID
            $row['user_id'] = $this->userId;

            // Update FK references
            $row = $this->updateForeignKeys($table, $row, $idMaps);

            // Handle merge mode: skip if similar exists
            if ($this->mode === 'merge') {
                if ($this->recordExists($table, $row)) {
                    $skipped++;
                    continue;
                }
            }

            try {
                // Remove timestamp fields that will be auto-generated
                unset($row['created_at']);
                unset($row['updated_at']);

                $newId = $this->db->insert($table, $row);
                $idMap[$oldId] = $newId;
                $imported++;
            } catch (Exception $e) {
                appLog("Restore error in $table: " . $e->getMessage(), 'error');
                $skipped++;
            }
        }

        return [
            'imported' => $imported,
            'skipped' => $skipped,
            'id_map' => $idMap
        ];
    }

    /**
     * Update foreign key references using ID maps
     */
    private function updateForeignKeys(string $table, array $row, array $idMaps): array
    {
        $fkMappings = [
            'categories' => ['parent_id' => 'categories'],
            'categorization_rules' => ['category_id' => 'categories'],
            'budgets' => ['category_id' => 'categories'],
            'recurring_transactions' => [
                'account_id' => 'accounts',
                'category_id' => 'categories'
            ],
            'transactions' => [
                'account_id' => 'accounts',
                'category_id' => 'categories',
                'transfer_account_id' => 'accounts'
            ],
            'receipts' => ['transaction_id' => 'transactions'],
            'checks' => [
                'account_id' => 'accounts',
                'transaction_id' => 'transactions',
                'category_id' => 'categories'
            ],
            'reconciliations' => ['account_id' => 'accounts']
        ];

        if (!isset($fkMappings[$table])) {
            return $row;
        }

        foreach ($fkMappings[$table] as $fkColumn => $refTable) {
            if (isset($row[$fkColumn]) && $row[$fkColumn] && isset($idMaps[$refTable][$row[$fkColumn]])) {
                $row[$fkColumn] = $idMaps[$refTable][$row[$fkColumn]];
            } elseif (isset($row[$fkColumn]) && $row[$fkColumn] && !isset($idMaps[$refTable][$row[$fkColumn]])) {
                // FK reference not found - set to null
                $row[$fkColumn] = null;
            }
        }

        return $row;
    }

    /**
     * Check if similar record exists (for merge mode)
     */
    private function recordExists(string $table, array $row): bool
    {
        $uniqueChecks = [
            'accounts' => ['account_name'],
            'categories' => ['slug'],
            'categorization_rules' => ['category_id', 'match_field', 'match_type', 'match_value'],
            'budgets' => ['budget_name', 'category_id'],
            'recurring_transactions' => ['description', 'amount'],
            'transactions' => ['import_hash'],
            'receipts' => ['file_path'],
            'checks' => ['check_number', 'account_id'],
            'reconciliations' => ['account_id', 'statement_date']
        ];

        if (!isset($uniqueChecks[$table])) {
            return false;
        }

        $conditions = ['user_id = :user_id'];
        $params = ['user_id' => $this->userId];

        foreach ($uniqueChecks[$table] as $col) {
            if (isset($row[$col]) && $row[$col] !== null) {
                $conditions[] = "`$col` = :$col";
                $params[$col] = $row[$col];
            } else {
                $conditions[] = "`$col` IS NULL";
            }
        }

        $whereClause = implode(' AND ', $conditions);
        $result = $this->db->fetch("SELECT id FROM `$table` WHERE $whereClause LIMIT 1", $params);

        return $result !== false;
    }

    /**
     * Restore files
     */
    private function restoreFiles(string $filesDir): array
    {
        $stats = ['BankTransaction' => 0, 'receipts' => 0];

        // Restore bank transaction files
        $bankSrc = $filesDir . '/BankTransaction';
        $bankDest = UPLOAD_DIR . '/BankTransaction';
        if (is_dir($bankSrc)) {
            if (!is_dir($bankDest)) {
                mkdir($bankDest, 0755, true);
            }
            $files = array_diff(scandir($bankSrc), ['.', '..']);
            foreach ($files as $file) {
                $srcPath = $bankSrc . '/' . $file;
                $destPath = $bankDest . '/' . $file;
                if (is_file($srcPath) && !file_exists($destPath)) {
                    copy($srcPath, $destPath);
                    $stats['BankTransaction']++;
                }
            }
        }

        // Restore receipt files
        $receiptsSrc = $filesDir . '/receipts';
        $receiptsDest = UPLOAD_DIR . '/receipts';
        if (is_dir($receiptsSrc)) {
            if (!is_dir($receiptsDest)) {
                mkdir($receiptsDest, 0755, true);
            }
            $files = array_diff(scandir($receiptsSrc), ['.', '..']);
            foreach ($files as $file) {
                $srcPath = $receiptsSrc . '/' . $file;
                $destPath = $receiptsDest . '/' . $file;
                if (is_file($srcPath) && !file_exists($destPath)) {
                    copy($srcPath, $destPath);
                    $stats['receipts']++;
                }
            }
        }

        return $stats;
    }

    /**
     * Delete directory recursively
     */
    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) return;

        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            $path = $dir . '/' . $file;
            is_dir($path) ? $this->deleteDirectory($path) : unlink($path);
        }
        rmdir($dir);
    }
}
