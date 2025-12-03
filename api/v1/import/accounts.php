<?php
/**
 * Import Accounts API
 * POST /api/v1/import/accounts.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

if (empty($_POST['user_id'])) {
    errorResponse('User ID is required');
}

if (empty($_FILES['csv_file'])) {
    errorResponse('CSV file is required');
}

$userId = (int)$_POST['user_id'];
$file = $_FILES['csv_file'];

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'csv') {
    errorResponse('Only CSV files are allowed');
}

try {
    $db = Database::getInstance();

    $handle = fopen($file['tmp_name'], 'r');
    if (!$handle) {
        errorResponse('Failed to open CSV file');
    }

    // Skip BOM
    $bom = fread($handle, 3);
    if ($bom !== "\xEF\xBB\xBF") {
        rewind($handle);
    }

    $header = fgetcsv($handle);
    if (!$header) {
        errorResponse('CSV file is empty');
    }

    $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

    // Required columns
    if (!isset($headerMap['account name']) && !isset($headerMap['name'])) {
        errorResponse('Missing required column: Account Name');
    }

    $db->beginTransaction();

    $imported = 0;
    $skipped = 0;
    $errors = [];
    $rowNum = 1;

    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            $accountName = trim($row[$headerMap['account name'] ?? $headerMap['name']] ?? '');

            if (empty($accountName)) {
                $errors[] = "Row $rowNum: Account name is required";
                $skipped++;
                continue;
            }

            // Check for duplicate
            $existing = $db->fetch(
                "SELECT id FROM accounts WHERE account_name = :name AND user_id = :user_id",
                ['name' => $accountName, 'user_id' => $userId]
            );

            if ($existing) {
                $skipped++;
                continue;
            }

            // Get optional fields
            $accountType = strtolower(trim($row[$headerMap['type'] ?? $headerMap['account type'] ?? 0] ?? 'checking'));
            $validTypes = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'other'];
            if (!in_array($accountType, $validTypes)) {
                $accountType = 'checking';
            }

            $last4 = isset($headerMap['last 4 digits']) ? trim($row[$headerMap['last 4 digits']] ?? '') : null;
            $currency = isset($headerMap['currency']) ? strtoupper(trim($row[$headerMap['currency']] ?? 'USD')) : 'USD';
            $balance = isset($headerMap['current balance']) ? (float)($row[$headerMap['current balance']] ?? 0) : 0;
            $color = isset($headerMap['color']) ? trim($row[$headerMap['color']] ?? '') : null;
            $notes = isset($headerMap['notes']) ? trim($row[$headerMap['notes']] ?? '') : null;

            // Insert
            $db->insert('accounts', [
                'user_id' => $userId,
                'account_name' => $accountName,
                'account_type' => $accountType,
                'account_number_last4' => $last4 ?: null,
                'currency' => $currency,
                'current_balance' => $balance,
                'is_active' => 1,
                'include_in_totals' => 1,
                'color' => $color ?: null,
                'notes' => $notes ?: null
            ]);

            $imported++;

        } catch (Exception $e) {
            $errors[] = "Row $rowNum: " . $e->getMessage();
            $skipped++;
        }
    }

    fclose($handle);
    $db->commit();

    successResponse([
        'imported' => $imported,
        'skipped' => $skipped,
        'errors' => $errors
    ], "$imported accounts imported, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import accounts error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
