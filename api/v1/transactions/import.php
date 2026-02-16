<?php
/**
 * Transaction Import API
 * POST /api/transactions/import.php
 *
 * Supports: CSV files, ZIP files (auto-extracts CSVs), Multiple files
 *
 * Form data:
 * - csv_file: The CSV or ZIP file (or csv_file[] for multiple)
 * - account_id: Target account ID
 * - institution_code: Bank/institution code for CSV format
 * - user_id: User ID (required)
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Validate required parameters
if (empty($_POST['account_id'])) {
    errorResponse('Account ID is required');
}

if (empty($_POST['institution_code'])) {
    errorResponse('Institution code is required');
}

if (empty($_POST['user_id'])) {
    errorResponse('User ID is required');
}

if (empty($_FILES['csv_file'])) {
    errorResponse('File is required');
}

$accountId = (int)$_POST['account_id'];
$institutionCode = strtoupper($_POST['institution_code']);
$userId = (int)$_POST['user_id'];

// Handle single or multiple file uploads
$uploadedFiles = [];
if (is_array($_FILES['csv_file']['name'])) {
    // Multiple files
    for ($i = 0; $i < count($_FILES['csv_file']['name']); $i++) {
        $uploadedFiles[] = [
            'name' => $_FILES['csv_file']['name'][$i],
            'type' => $_FILES['csv_file']['type'][$i],
            'tmp_name' => $_FILES['csv_file']['tmp_name'][$i],
            'error' => $_FILES['csv_file']['error'][$i],
            'size' => $_FILES['csv_file']['size'][$i]
        ];
    }
} else {
    // Single file
    $uploadedFiles[] = $_FILES['csv_file'];
}

try {
    $db = Database::getInstance();

    // Verify account exists and belongs to user
    $account = $db->fetch(
        "SELECT * FROM accounts WHERE id = :id AND user_id = :user_id",
        ['id' => $accountId, 'user_id' => $userId]
    );

    if (!$account) {
        errorResponse('Account not found or access denied', 404);
    }

    $uploadPath = UPLOAD_DIR . '/BankTransaction';
    if (!is_dir($uploadPath)) {
        mkdir($uploadPath, 0755, true);
    }

    // Collect all CSV files to process
    $csvFilesToProcess = [];

    foreach ($uploadedFiles as $file) {
        // Validate file
        if ($file['error'] !== UPLOAD_ERR_OK) {
            continue;
        }

        if ($file['size'] > MAX_UPLOAD_SIZE) {
            continue;
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['csv', 'zip'])) {
            continue;
        }

        $fileHash = hash_file('sha256', $file['tmp_name']);
        $filename = $fileHash . '_' . basename($file['name']);
        $destination = $uploadPath . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            continue;
        }

        // Handle ZIP files
        if ($ext === 'zip') {
            $zip = new ZipArchive();
            if ($zip->open($destination) === TRUE) {
                $extractPath = $uploadPath . '/temp_' . $fileHash;
                if (!is_dir($extractPath)) {
                    mkdir($extractPath, 0755, true);
                }

                $zip->extractTo($extractPath);
                $zip->close();

                // Find all CSV files in extracted content
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($extractPath, RecursiveDirectoryIterator::SKIP_DOTS)
                );
                foreach ($iterator as $extractedFile) {
                    if (strtolower($extractedFile->getExtension()) === 'csv') {
                        $csvFilesToProcess[] = [
                            'path' => $extractedFile->getPathname(),
                            'name' => $extractedFile->getFilename(),
                            'source' => $file['name']
                        ];
                    }
                }
            }
        } else {
            $csvFilesToProcess[] = [
                'path' => $destination,
                'name' => $file['name'],
                'source' => $file['name']
            ];
        }
    }

    if (empty($csvFilesToProcess)) {
        errorResponse('No valid CSV files to import');
    }

    // Get institution ID
    $institution = $db->fetch(
        "SELECT id FROM financial_institutions WHERE short_code = :code",
        ['code' => $institutionCode]
    );

    // Process all CSV files
    $totalImported = 0;
    $totalDuplicates = 0;
    $totalRows = 0;
    $allErrors = [];
    $fileResults = [];
    $categorizer = new Categorizer($userId);

    foreach ($csvFilesToProcess as $csvInfo) {
        $csvFile = $csvInfo['path'];
        $csvFilename = $csvInfo['name'];
        $csvHash = hash_file('sha256', $csvFile);

        // Check for duplicate file
        $existingBatch = $db->fetch(
            "SELECT id, created_at FROM import_batches WHERE file_hash = :hash AND account_id = :account_id",
            ['hash' => $csvHash, 'account_id' => $accountId]
        );

        if ($existingBatch) {
            $fileResults[] = [
                'file' => $csvFilename,
                'status' => 'skipped',
                'message' => 'Already imported on ' . $existingBatch['created_at'],
                'imported' => 0,
                'duplicates' => 0
            ];
            continue;
        }

        // Create import batch for this CSV
        $batchId = $db->insert('import_batches', [
            'user_id' => $userId,
            'account_id' => $accountId,
            'institution_id' => $institution ? $institution['id'] : null,
            'filename' => $csvFilename,
            'file_hash' => $csvHash,
            'file_size' => filesize($csvFile),
            'status' => 'processing',
            'started_at' => date('Y-m-d H:i:s')
        ]);

        try {
            // Parse CSV
            $parser = new CSVParser();
            $parseResult = $parser->parse($csvFile, $institutionCode, $accountId);

            $db->beginTransaction();

            $imported = 0;
            $duplicates = 0;

            foreach ($parseResult['transactions'] as $txn) {
                // Check for duplicate using import hash
                if ($db->exists('transactions', 'import_hash = :hash', ['hash' => $txn['import_hash']])) {
                    $duplicates++;
                    continue;
                }

                // Categorize transaction
                $categoryResult = $categorizer->categorize($txn);

                // Insert transaction
                $db->insert('transactions', [
                    'user_id' => $userId,
                    'account_id' => $accountId,
                    'category_id' => $categoryResult['category_id'],
                    'transaction_date' => $txn['transaction_date'],
                    'post_date' => $txn['post_date'],
                    'description' => $txn['description'],
                    'original_description' => $txn['original_description'],
                    'vendor_name' => $txn['vendor_name'],
                    'amount' => $txn['amount'],
                    'currency' => $account['currency'],
                    'transaction_type' => $txn['transaction_type'],
                    'status' => 'posted',
                    'check_number' => $txn['check_number'],
                    'memo' => $txn['memo'],
                    'import_hash' => $txn['import_hash'],
                    'import_batch_id' => $batchId,
                    'categorized_by' => $categoryResult['categorized_by'],
                    'categorization_confidence' => $categoryResult['confidence']
                ]);

                $imported++;
            }

            $db->commit();

            // Update batch status
            $db->update('import_batches', [
                'status' => 'completed',
                'total_rows' => $parseResult['total_rows'],
                'imported_rows' => $imported,
                'duplicate_rows' => $duplicates,
                'error_rows' => count($parseResult['errors']),
                'error_log' => !empty($parseResult['errors']) ? json_encode($parseResult['errors']) : null,
                'completed_at' => date('Y-m-d H:i:s')
            ], 'id = :id', ['id' => $batchId]);

            $totalImported += $imported;
            $totalDuplicates += $duplicates;
            $totalRows += $parseResult['total_rows'];
            $allErrors = array_merge($allErrors, $parseResult['errors']);

            $fileResults[] = [
                'file' => $csvFilename,
                'status' => 'success',
                'imported' => $imported,
                'duplicates' => $duplicates,
                'total_rows' => $parseResult['total_rows']
            ];

        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollback();
            }

            $db->update('import_batches', [
                'status' => 'failed',
                'error_log' => json_encode(['fatal' => $e->getMessage()]),
                'completed_at' => date('Y-m-d H:i:s')
            ], 'id = :id', ['id' => $batchId]);

            $fileResults[] = [
                'file' => $csvFilename,
                'status' => 'failed',
                'message' => $e->getMessage(),
                'imported' => 0,
                'duplicates' => 0
            ];
        }
    }

    // Update account balance
    $balanceResult = $db->fetch(
        "SELECT COALESCE(SUM(amount), 0) as balance FROM transactions WHERE account_id = :account_id AND deleted_at IS NULL",
        ['account_id' => $accountId]
    );

    $db->update('accounts', [
        'current_balance' => $balanceResult['balance'],
        'last_synced_at' => date('Y-m-d H:i:s')
    ], 'id = :id', ['id' => $accountId]);

    // Log the import
    $audit = new AuditService($userId);
    $audit->logImport('transaction', $totalImported, count($csvFilesToProcess) . ' file(s)');

    // Cleanup temp directories
    $tempDirs = glob($uploadPath . '/temp_*', GLOB_ONLYDIR);
    foreach ($tempDirs as $tempDir) {
        $files = glob($tempDir . '/*');
        foreach ($files as $f) {
            if (is_file($f)) unlink($f);
        }
        @rmdir($tempDir);
    }

    successResponse([
        'total_files' => count($csvFilesToProcess),
        'total_rows' => $totalRows,
        'imported' => $totalImported,
        'duplicates' => $totalDuplicates,
        'errors' => $allErrors,
        'file_results' => $fileResults
    ], "Import completed: $totalImported transactions imported from " . count($csvFilesToProcess) . " file(s)");

} catch (Exception $e) {
    appLog('Import error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
