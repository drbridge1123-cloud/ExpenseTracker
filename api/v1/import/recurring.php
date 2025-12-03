<?php
/**
 * Import Recurring Transactions API
 * POST /api/v1/import/recurring.php
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
    if (!isset($headerMap['description'])) {
        errorResponse('Missing required column: Description');
    }
    if (!isset($headerMap['amount'])) {
        errorResponse('Missing required column: Amount');
    }

    // Load accounts and categories for lookup
    $accounts = $db->fetchAll(
        "SELECT id, account_name FROM accounts WHERE user_id = :user_id AND is_active = 1",
        ['user_id' => $userId]
    );
    $accountMap = [];
    foreach ($accounts as $acc) {
        $accountMap[strtolower($acc['account_name'])] = $acc['id'];
    }

    $categories = $db->fetchAll(
        "SELECT id, name, slug FROM categories WHERE user_id = :user_id AND is_active = 1",
        ['user_id' => $userId]
    );
    $categoryMap = [];
    foreach ($categories as $cat) {
        $categoryMap[strtolower($cat['name'])] = $cat['id'];
        $categoryMap[strtolower($cat['slug'])] = $cat['id'];
    }

    // Get default account
    $defaultAccount = $db->fetch(
        "SELECT id FROM accounts WHERE user_id = :user_id AND is_active = 1 LIMIT 1",
        ['user_id' => $userId]
    );
    $defaultAccountId = $defaultAccount ? $defaultAccount['id'] : null;

    if (!$defaultAccountId) {
        errorResponse('No active account found. Please create an account first.');
    }

    $db->beginTransaction();

    $imported = 0;
    $skipped = 0;
    $errors = [];
    $rowNum = 1;

    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            $description = trim($row[$headerMap['description']] ?? '');
            $amount = (float)($row[$headerMap['amount']] ?? 0);

            if (empty($description)) {
                $errors[] = "Row $rowNum: Description is required";
                $skipped++;
                continue;
            }

            if ($amount == 0) {
                $errors[] = "Row $rowNum: Amount is required";
                $skipped++;
                continue;
            }

            // Get optional fields
            $vendor = isset($headerMap['vendor']) ? trim($row[$headerMap['vendor']] ?? '') : null;
            $type = strtolower(trim($row[$headerMap['type'] ?? 0] ?? ($amount < 0 ? 'debit' : 'credit')));
            $frequency = strtolower(trim($row[$headerMap['frequency'] ?? 0] ?? 'monthly'));
            $startDate = isset($headerMap['start date']) ? trim($row[$headerMap['start date']] ?? '') : date('Y-m-d');
            $nextOccurrence = isset($headerMap['next occurrence']) ? trim($row[$headerMap['next occurrence']] ?? '') : $startDate;

            // Validate type
            if (!in_array($type, ['debit', 'credit'])) {
                $type = $amount < 0 ? 'debit' : 'credit';
            }

            // Validate frequency
            $validFreq = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
            if (!in_array($frequency, $validFreq)) {
                $frequency = 'monthly';
            }

            // Find account
            $accountName = isset($headerMap['account']) ? strtolower(trim($row[$headerMap['account']] ?? '')) : '';
            $accountId = $accountMap[$accountName] ?? $defaultAccountId;

            // Find category
            $categoryName = isset($headerMap['category']) ? strtolower(trim($row[$headerMap['category']] ?? '')) : '';
            $categoryId = $categoryMap[$categoryName] ?? null;

            // Check for duplicate
            $existing = $db->fetch(
                "SELECT id FROM recurring_transactions
                 WHERE user_id = :user_id AND description = :description AND amount = :amount",
                ['user_id' => $userId, 'description' => $description, 'amount' => $amount]
            );

            if ($existing) {
                $skipped++;
                continue;
            }

            // Insert
            $db->insert('recurring_transactions', [
                'user_id' => $userId,
                'account_id' => $accountId,
                'category_id' => $categoryId,
                'description' => $description,
                'vendor_name' => $vendor ?: null,
                'amount' => $amount,
                'transaction_type' => $type,
                'frequency' => $frequency,
                'start_date' => $startDate ?: date('Y-m-d'),
                'next_occurrence' => $nextOccurrence ?: $startDate ?: date('Y-m-d'),
                'auto_create' => 0,
                'is_active' => 1
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
    ], "$imported recurring transactions imported, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import recurring error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
