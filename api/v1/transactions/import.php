<?php
/**
 * Transaction Import API
 * POST /api/transactions/import.php
 *
 * Form data:
 * - csv_file: The CSV file
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
    errorResponse('CSV file is required');
}

$accountId = (int)$_POST['account_id'];
$institutionCode = strtoupper($_POST['institution_code']);
$userId = (int)$_POST['user_id'];
$file = $_FILES['csv_file'];

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

if ($file['size'] > MAX_UPLOAD_SIZE) {
    errorResponse('File size exceeds maximum allowed (' . (MAX_UPLOAD_SIZE / 1024 / 1024) . 'MB)');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ALLOWED_EXTENSIONS)) {
    errorResponse('Invalid file type. Only CSV files are allowed.');
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

    // Create import batch record
    $fileHash = hash_file('sha256', $file['tmp_name']);

    // Check for duplicate file
    $existingBatch = $db->fetch(
        "SELECT id, created_at FROM import_batches WHERE file_hash = :hash AND account_id = :account_id",
        ['hash' => $fileHash, 'account_id' => $accountId]
    );

    if ($existingBatch) {
        errorResponse(
            'This file was already imported on ' . $existingBatch['created_at'],
            409
        );
    }

    // Move file to uploads directory
    $uploadPath = UPLOAD_DIR . '/BankTransaction';
    if (!is_dir($uploadPath)) {
        mkdir($uploadPath, 0755, true);
    }

    $filename = $fileHash . '_' . basename($file['name']);
    $destination = $uploadPath . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        errorResponse('Failed to save uploaded file', 500);
    }

    // Get institution ID
    $institution = $db->fetch(
        "SELECT id FROM financial_institutions WHERE short_code = :code",
        ['code' => $institutionCode]
    );

    // Create import batch
    $batchId = $db->insert('import_batches', [
        'user_id' => $userId,
        'account_id' => $accountId,
        'institution_id' => $institution ? $institution['id'] : null,
        'filename' => $file['name'],
        'file_hash' => $fileHash,
        'file_size' => $file['size'],
        'status' => 'processing',
        'started_at' => date('Y-m-d H:i:s')
    ]);

    // Parse CSV
    $parser = new CSVParser();
    $parseResult = $parser->parse($destination, $institutionCode, $accountId);

    $categorizer = new Categorizer($userId);

    // Begin transaction for inserts
    $db->beginTransaction();

    $imported = 0;
    $duplicates = 0;
    $errors = [];

    try {
        foreach ($parseResult['transactions'] as $index => $txn) {
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

        // Update account last synced and recalculate balance
        $balanceResult = $db->fetch(
            "SELECT COALESCE(SUM(amount), 0) as balance FROM transactions WHERE account_id = :account_id",
            ['account_id' => $accountId]
        );

        $db->update('accounts', [
            'current_balance' => $balanceResult['balance'],
            'last_synced_at' => date('Y-m-d H:i:s')
        ], 'id = :id', ['id' => $accountId]);

        successResponse([
            'batch_id' => $batchId,
            'total_rows' => $parseResult['total_rows'],
            'imported' => $imported,
            'duplicates' => $duplicates,
            'errors' => $parseResult['errors'],
            'warnings' => $parseResult['warnings'] ?? []
        ], "Import completed: $imported transactions imported, $duplicates duplicates skipped");

    } catch (Exception $e) {
        $db->rollback();

        // Update batch status to failed
        $db->update('import_batches', [
            'status' => 'failed',
            'error_log' => json_encode(['fatal' => $e->getMessage()]),
            'completed_at' => date('Y-m-d H:i:s')
        ], 'id = :id', ['id' => $batchId]);

        throw $e;
    }

} catch (Exception $e) {
    appLog('Import error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
