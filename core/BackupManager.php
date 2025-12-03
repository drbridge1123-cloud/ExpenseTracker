<?php
/**
 * BackupManager - Full backup and restore functionality
 */

class BackupManager
{
    private Database $db;
    private int $userId;
    private string $backupDir;

    // Tables to backup (in order for FK constraints)
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

    public function __construct(int $userId)
    {
        $this->db = Database::getInstance();
        $this->userId = $userId;
        $this->backupDir = UPLOAD_DIR . '/backups';

        if (!is_dir($this->backupDir)) {
            mkdir($this->backupDir, 0755, true);
        }
    }

    /**
     * Create a full backup ZIP
     */
    public function createBackup(): array
    {
        $timestamp = date('Y-m-d_His');
        $backupName = "ExpenseTracker_Backup_{$this->userId}_{$timestamp}";
        $tempDir = sys_get_temp_dir() . '/' . $backupName;
        $zipPath = $this->backupDir . '/' . $backupName . '.zip';

        // Create temp directory structure
        mkdir($tempDir, 0755, true);
        mkdir($tempDir . '/data', 0755, true);
        mkdir($tempDir . '/files', 0755, true);

        try {
            // Export data
            $stats = $this->exportData($tempDir . '/data');

            // Export files
            $fileStats = $this->exportFiles($tempDir . '/files');

            // Create manifest
            $manifest = [
                'version' => '1.0',
                'created_at' => date('Y-m-d H:i:s'),
                'user_id' => $this->userId,
                'tables' => $stats,
                'files' => $fileStats
            ];
            file_put_contents($tempDir . '/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT));

            // Create ZIP
            $this->createZip($tempDir, $zipPath);

            // Cleanup temp directory
            $this->deleteDirectory($tempDir);

            return [
                'success' => true,
                'filename' => $backupName . '.zip',
                'path' => $zipPath,
                'size' => filesize($zipPath),
                'stats' => $stats,
                'file_stats' => $fileStats
            ];

        } catch (Exception $e) {
            // Cleanup on error
            if (is_dir($tempDir)) {
                $this->deleteDirectory($tempDir);
            }
            if (file_exists($zipPath)) {
                unlink($zipPath);
            }
            throw $e;
        }
    }

    /**
     * Export all tables to JSON files
     */
    private function exportData(string $dataDir): array
    {
        $stats = [];

        foreach ($this->tables as $table) {
            $data = $this->exportTable($table);
            $count = count($data);

            file_put_contents(
                $dataDir . '/' . $table . '.json',
                json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );

            $stats[$table] = $count;
        }

        return $stats;
    }

    /**
     * Export a single table
     */
    private function exportTable(string $table): array
    {
        $sql = "SELECT * FROM `$table` WHERE user_id = :user_id";
        return $this->db->fetchAll($sql, ['user_id' => $this->userId]);
    }

    /**
     * Export user files
     */
    private function exportFiles(string $filesDir): array
    {
        $stats = ['BankTransaction' => 0, 'receipts' => 0];

        // Bank transaction files
        $bankDir = UPLOAD_DIR . '/BankTransaction';
        if (is_dir($bankDir)) {
            $destDir = $filesDir . '/BankTransaction';
            mkdir($destDir, 0755, true);

            // Get user's import batches
            $batches = $this->db->fetchAll(
                "SELECT filename, file_hash FROM import_batches WHERE user_id = :user_id",
                ['user_id' => $this->userId]
            );

            foreach ($batches as $batch) {
                // Try to find the file
                $pattern = $bankDir . '/' . $batch['file_hash'] . '*';
                $files = glob($pattern);
                foreach ($files as $file) {
                    if (is_file($file)) {
                        copy($file, $destDir . '/' . basename($file));
                        $stats['BankTransaction']++;
                    }
                }
            }
        }

        // Receipt files
        $receiptsDir = UPLOAD_DIR . '/receipts';
        if (is_dir($receiptsDir)) {
            $destDir = $filesDir . '/receipts';
            mkdir($destDir, 0755, true);

            // Get user's receipts
            $receipts = $this->db->fetchAll(
                "SELECT file_path FROM receipts WHERE user_id = :user_id",
                ['user_id' => $this->userId]
            );

            foreach ($receipts as $receipt) {
                $srcFile = UPLOAD_DIR . '/' . $receipt['file_path'];
                if (is_file($srcFile)) {
                    $destFile = $destDir . '/' . basename($receipt['file_path']);
                    copy($srcFile, $destFile);
                    $stats['receipts']++;
                }
            }
        }

        return $stats;
    }

    /**
     * Create ZIP archive
     */
    private function createZip(string $sourceDir, string $zipPath): void
    {
        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new Exception('Failed to create ZIP file');
        }

        $this->addDirectoryToZip($zip, $sourceDir, '');
        $zip->close();
    }

    /**
     * Recursively add directory to ZIP
     */
    private function addDirectoryToZip(ZipArchive $zip, string $dir, string $base): void
    {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($files as $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = $base . '/' . substr($filePath, strlen($dir) + 1);
                $relativePath = ltrim($relativePath, '/');
                $zip->addFile($filePath, $relativePath);
            }
        }
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
