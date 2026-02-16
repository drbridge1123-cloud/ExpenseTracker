<?php
/**
 * Preview Import - Detect duplicates in CSV before importing
 * POST /api/v1/import/preview.php
 *
 * Returns all transactions grouped by duplicate status
 * User can then select which ones to import
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
$accountId = !empty($_POST['account_id']) ? (int)$_POST['account_id'] : null;
$format = $_POST['format'] ?? 'amex'; // 'amex' or 'chase'
$file = $_FILES['csv_file'];

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['csv', 'zip'])) {
    errorResponse('Only CSV and ZIP files are supported');
}

// Handle ZIP files - extract and find CSV files
$csvFilesToProcess = [];
$tempExtractPath = null;

if ($ext === 'zip') {
    $uploadPath = UPLOAD_DIR . '/BankTransaction';
    if (!is_dir($uploadPath)) {
        mkdir($uploadPath, 0755, true);
    }

    $zip = new ZipArchive();
    if ($zip->open($file['tmp_name']) !== TRUE) {
        errorResponse('Failed to open ZIP file');
    }

    $fileHash = hash_file('sha256', $file['tmp_name']);
    $tempExtractPath = $uploadPath . '/temp_preview_' . $fileHash;
    if (!is_dir($tempExtractPath)) {
        mkdir($tempExtractPath, 0755, true);
    }

    $zip->extractTo($tempExtractPath);
    $zip->close();

    // Find all CSV files in extracted content
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($tempExtractPath, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    foreach ($iterator as $extractedFile) {
        if (strtolower($extractedFile->getExtension()) === 'csv') {
            $csvFilesToProcess[] = $extractedFile->getPathname();
        }
    }

    if (empty($csvFilesToProcess)) {
        // Cleanup
        array_map('unlink', glob("$tempExtractPath/*"));
        @rmdir($tempExtractPath);
        errorResponse('No CSV files found in ZIP');
    }
} else {
    // Single CSV file
    $csvFilesToProcess[] = $file['tmp_name'];
}

try {
    $db = Database::getInstance();

    // Get or create account
    if (!$accountId) {
        $accountName = $format === 'amex' ? 'AMEX' : 'Chase';
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_name LIKE :name",
            ['user_id' => $userId, 'name' => "%$accountName%"]
        );

        if ($account) {
            $accountId = $account['id'];
        } else {
            $db->insert('accounts', [
                'user_id' => $userId,
                'account_name' => $accountName,
                'account_type' => 'credit_card',
                'currency' => 'USD',
                'current_balance' => 0,
                'is_active' => 1,
                'include_in_totals' => 1
            ]);
            $accountId = $db->lastInsertId();
        }
    }

    // Parse all CSV files
    $allTransactions = [];
    $errors = [];
    $globalRowNum = 0;

    foreach ($csvFilesToProcess as $csvFilePath) {
        $handle = fopen($csvFilePath, 'r');
        if (!$handle) {
            $errors[] = "Failed to open CSV file: " . basename($csvFilePath);
            continue;
        }

        // Skip BOM
        $bom = fread($handle, 3);
        if ($bom !== "\xEF\xBB\xBF") {
            rewind($handle);
        }

        $header = fgetcsv($handle);
        if (!$header) {
            fclose($handle);
            $errors[] = "Empty CSV file: " . basename($csvFilePath);
            continue;
        }

        $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

        // Validate format for AMEX
        if ($format === 'amex') {
            if (!isset($headerMap['date']) || !isset($headerMap['description']) || !isset($headerMap['amount'])) {
                fclose($handle);
                $errors[] = "Invalid AMEX CSV format in " . basename($csvFilePath) . ". Required: Date, Description, Amount";
                continue;
            }
        }

        $rowNum = 1;
        $fileName = basename($csvFilePath);

        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;
            $globalRowNum++;

            try {
                if ($format === 'amex') {
                    $transactionDate = trim($row[$headerMap['date']] ?? '');
                    $description = trim($row[$headerMap['description']] ?? '');
                    $amount = (float)($row[$headerMap['amount']] ?? 0);
                } else {
                    // Chase format - check multiple possible column names
                    $dateCol = $headerMap['posting date'] ?? $headerMap['transaction date'] ?? $headerMap['date'] ?? null;
                    $transactionDate = $dateCol !== null ? trim($row[$dateCol] ?? '') : '';
                    $description = trim($row[$headerMap['description']] ?? '');
                    $amount = (float)($row[$headerMap['amount']] ?? 0);
                }

                if (empty($transactionDate) || empty($description)) {
                    continue;
                }

                // Parse date
                $dateObj = DateTime::createFromFormat('m/d/Y', $transactionDate);
                if (!$dateObj) {
                    $dateObj = DateTime::createFromFormat('Y-m-d', $transactionDate);
                }
                if (!$dateObj) {
                    $errors[] = "$fileName Row $rowNum: Invalid date format: $transactionDate";
                    continue;
                }
                $formattedDate = $dateObj->format('Y-m-d');

                // Skip payments
                $isPayment = stripos($description, 'PAYMENT') !== false && $amount < 0;

                // Normalize amount for our system (AMEX: positive = expense = our negative)
                $normalizedAmount = $format === 'amex' ? -$amount : $amount;

                $allTransactions[] = [
                    'row' => $globalRowNum,
                    'file' => $fileName,
                    'date' => $formattedDate,
                    'description' => $description,
                    'amount' => $normalizedAmount,
                    'original_amount' => $amount,
                    'is_payment' => $isPayment
                ];

            } catch (Exception $e) {
                $errors[] = "$fileName Row $rowNum: " . $e->getMessage();
            }
        }

        fclose($handle);
    }

    // Cleanup temp directory if it was created for ZIP extraction
    if ($tempExtractPath && is_dir($tempExtractPath)) {
        $files = glob("$tempExtractPath/*");
        foreach ($files as $f) {
            if (is_file($f)) unlink($f);
        }
        @rmdir($tempExtractPath);
    }

    // Group transactions by date+description+amount to find duplicates within CSV
    $groups = [];
    foreach ($allTransactions as $idx => $txn) {
        $key = $txn['date'] . '|' . $txn['description'] . '|' . $txn['amount'];
        if (!isset($groups[$key])) {
            $groups[$key] = [];
        }
        $groups[$key][] = array_merge($txn, ['index' => $idx]);
    }

    // Check each transaction against database
    $result = [
        'unique' => [],           // No duplicates - will auto-import
        'duplicate_groups' => [], // Groups with multiple same transactions in CSV
        'existing_in_db' => [],   // Already exists in database
        'payments' => [],         // Payment transactions
        'total_in_file' => count($allTransactions)
    ];

    foreach ($groups as $key => $groupItems) {
        $firstItem = $groupItems[0];

        // Check if exists in database
        $existing = $db->fetch(
            "SELECT id, description, amount, transaction_date
             FROM transactions
             WHERE user_id = :user_id
             AND account_id = :account_id
             AND transaction_date = :date
             AND description = :description
             AND amount = :amount",
            [
                'user_id' => $userId,
                'account_id' => $accountId,
                'date' => $firstItem['date'],
                'description' => $firstItem['description'],
                'amount' => $firstItem['amount']
            ]
        );

        // Handle payments
        if ($firstItem['is_payment']) {
            foreach ($groupItems as $item) {
                $result['payments'][] = $item;
            }
            continue;
        }

        // If exists in DB, add all to existing_in_db
        if ($existing) {
            foreach ($groupItems as $item) {
                $item['existing_id'] = $existing['id'];
                $result['existing_in_db'][] = $item;
            }
            continue;
        }

        // If multiple in CSV with same values, it's a duplicate group
        if (count($groupItems) > 1) {
            $result['duplicate_groups'][] = [
                'key' => $key,
                'date' => $firstItem['date'],
                'description' => $firstItem['description'],
                'amount' => $firstItem['amount'],
                'count' => count($groupItems),
                'items' => $groupItems
            ];
        } else {
            // Unique transaction
            $result['unique'][] = $firstItem;
        }
    }

    // Summary
    $result['summary'] = [
        'total' => count($allTransactions),
        'unique' => count($result['unique']),
        'duplicate_groups' => count($result['duplicate_groups']),
        'duplicate_items' => array_sum(array_map(fn($g) => $g['count'], $result['duplicate_groups'])),
        'existing_in_db' => count($result['existing_in_db']),
        'payments' => count($result['payments'])
    ];

    $result['account_id'] = $accountId;
    $result['errors'] = $errors;

    successResponse($result, 'Preview generated');

} catch (Exception $e) {
    appLog('Import preview error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
