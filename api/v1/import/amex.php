<?php
/**
 * Import AMEX CSV
 * POST /api/v1/import/amex.php
 *
 * AMEX CSV Format:
 * Date,Description,Card Member,Account #,Amount
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
$file = $_FILES['csv_file'];

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$csvPaths = [];

// If ZIP file, extract ALL CSV files from it
if ($ext === 'zip') {
    $zip = new ZipArchive();
    if ($zip->open($file['tmp_name']) !== true) {
        errorResponse('Failed to open ZIP file');
    }

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $filename = $zip->getNameIndex($i);
        if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'csv') {
            $csvContent = $zip->getFromIndex($i);
            $csvPath = sys_get_temp_dir() . '/amex_import_' . uniqid() . '.csv';
            file_put_contents($csvPath, $csvContent);
            $csvPaths[] = $csvPath;
        }
    }
    $zip->close();

    if (empty($csvPaths)) {
        errorResponse('No CSV file found in ZIP');
    }
} elseif ($ext === 'csv') {
    $csvPaths[] = $file['tmp_name'];
} else {
    errorResponse('Only CSV or ZIP files are allowed');
}

try {
    $db = Database::getInstance();

    // If no account specified, try to find or create AMEX account
    if (!$accountId) {
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_name LIKE '%AMEX%'",
            ['user_id' => $userId]
        );

        if ($account) {
            $accountId = $account['id'];
        } else {
            $db->insert('accounts', [
                'user_id' => $userId,
                'account_name' => 'AMEX',
                'account_type' => 'credit_card',
                'currency' => 'USD',
                'current_balance' => 0,
                'is_active' => 1,
                'include_in_totals' => 1
            ]);
            $accountId = $db->lastInsertId();
        }
    }

    // Get uncategorized category for this user
    $uncategorized = $db->fetch(
        "SELECT id FROM categories WHERE user_id = :user_id AND name = 'Uncategorized'",
        ['user_id' => $userId]
    );
    $uncategorizedId = $uncategorized ? $uncategorized['id'] : null;

    if (!$uncategorizedId) {
        $db->insert('categories', [
            'user_id' => $userId,
            'name' => 'Uncategorized',
            'type' => 'expense',
            'color' => '#9CA3AF',
            'icon' => 'help-circle'
        ]);
        $uncategorizedId = $db->lastInsertId();
    }

    $db->beginTransaction();

    // Initialize Categorizer for rule-based categorization
    $categorizer = new Categorizer($userId);

    $imported = 0;
    $skipped = 0;
    $errors = [];
    $filesProcessed = 0;
    $pendingDuplicates = []; // Duplicates for user review
    $skippedDetails = [];
    $importedDetails = [];

    foreach ($csvPaths as $csvPath) {
        $handle = fopen($csvPath, 'r');
        if (!$handle) {
            $errors[] = "Failed to open CSV file";
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
            continue;
        }

        $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

        // AMEX format: Date, Description, Card Member, Account #, Amount
        if (!isset($headerMap['date']) || !isset($headerMap['description']) || !isset($headerMap['amount'])) {
            fclose($handle);
            $errors[] = "Invalid AMEX CSV format. Required: Date, Description, Amount";
            continue;
        }

        $filesProcessed++;
        $rowNum = 1;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;

            try {
                $transactionDate = trim($row[$headerMap['date']] ?? '');
                $description = trim($row[$headerMap['description']] ?? '');
                $amount = (float)($row[$headerMap['amount']] ?? 0);

                if (empty($transactionDate) || empty($description)) {
                    $skipped++;
                    continue;
                }

                // Parse date (MM/DD/YYYY format)
                $dateObj = DateTime::createFromFormat('m/d/Y', $transactionDate);
                if (!$dateObj) {
                    $dateObj = DateTime::createFromFormat('Y-m-d', $transactionDate);
                }
                if (!$dateObj) {
                    $errors[] = "Row $rowNum: Invalid date format: $transactionDate";
                    $skipped++;
                    continue;
                }
                $formattedDate = $dateObj->format('Y-m-d');

                // Skip payments (or handle with transfer account)
                if (stripos($description, 'PAYMENT') !== false && $amount < 0) {
                    $skippedDetails[] = [
                        'reason' => 'Payment (no transfer account)',
                        'description' => $description,
                        'amount' => $amount,
                        'date' => $formattedDate
                    ];
                    $skipped++;
                    continue;
                }

                // Check for duplicate
                $existing = $db->fetch(
                    "SELECT id FROM transactions
                     WHERE user_id = :user_id
                     AND account_id = :account_id
                     AND transaction_date = :date
                     AND description = :description
                     AND amount = :amount",
                    [
                        'user_id' => $userId,
                        'account_id' => $accountId,
                        'date' => $formattedDate,
                        'description' => $description,
                        'amount' => $amount
                    ]
                );

                if ($existing) {
                    // Instead of auto-skipping, add to pending duplicates for user review
                    $pendingDuplicates[] = [
                        'date' => $formattedDate,
                        'description' => $description,
                        'amount' => -$amount, // Flip sign to match our convention
                        'original_amount' => $amount,
                        'existing_id' => $existing['id'],
                        'account_id' => $accountId
                    ];
                    $skippedDetails[] = [
                        'reason' => 'Duplicate',
                        'description' => $description,
                        'amount' => -$amount,
                        'date' => $formattedDate
                    ];
                    $skipped++;
                    continue;
                }

                // AMEX: positive = expense, negative = credit/refund
                $transactionType = $amount > 0 ? 'debit' : 'credit';

                // Try to categorize using user's rules (highest priority)
                $categoryId = $uncategorizedId;
                $categorizedBy = 'default';

                $txnForRules = [
                    'description' => $description,
                    'original_description' => $description,
                    'vendor_name' => '',
                    'memo' => '',
                    'amount' => -$amount
                ];
                $ruleResult = $categorizer->categorize($txnForRules);

                if ($ruleResult && $ruleResult['categorized_by'] === 'rule') {
                    $categoryId = $ruleResult['category_id'];
                    $categorizedBy = 'rule';
                }

                // Insert transaction
                $db->insert('transactions', [
                    'user_id' => $userId,
                    'account_id' => $accountId,
                    'category_id' => $categoryId,
                    'amount' => -$amount, // Flip sign: AMEX positive = our negative (expense)
                    'description' => $description,
                    'original_description' => $description,
                    'transaction_date' => $formattedDate,
                    'transaction_type' => $transactionType,
                    'status' => 'posted',
                    'is_recurring' => 0,
                    'categorized_by' => $categorizedBy
                ]);

                $importedDetails[] = [
                    'date' => $formattedDate,
                    'description' => $description,
                    'amount' => -$amount
                ];

                $imported++;

            } catch (Exception $e) {
                $errors[] = "Row $rowNum: " . $e->getMessage();
                $skipped++;
            }
        }

        fclose($handle);
    }

    // Update account balance
    $balanceResult = $db->fetch(
        "SELECT SUM(amount) as total FROM transactions WHERE account_id = :account_id",
        ['account_id' => $accountId]
    );
    $newBalance = $balanceResult['total'] ?? 0;

    $db->query(
        "UPDATE accounts SET current_balance = :balance WHERE id = :account_id",
        ['balance' => $newBalance, 'account_id' => $accountId]
    );

    $db->commit();

    // Note: Rules are now applied during import
    // Post-import categorization only needed for any remaining uncategorized transactions
    $categorized = 0;
    if ($imported > 0) {
        $uncategorizedTxns = $db->fetchAll(
            "SELECT id, description, original_description, vendor_name, amount
             FROM transactions
             WHERE user_id = :user_id
             AND account_id = :account_id
             AND category_id = :uncategorized_id
             AND categorized_by = 'default'",
            ['user_id' => $userId, 'account_id' => $accountId, 'uncategorized_id' => $uncategorizedId]
        );

        foreach ($uncategorizedTxns as $txn) {
            $result = $categorizer->categorize($txn);
            if ($result && $result['category_id'] != $uncategorizedId) {
                $db->update('transactions', [
                    'category_id' => $result['category_id'],
                    'categorized_by' => $result['categorized_by'] ?? 'rule',
                    'categorization_confidence' => $result['confidence'] ?? null
                ], 'id = :id', ['id' => $txn['id']]);
                $categorized++;
            }
        }
    }

    successResponse([
        'imported' => $imported,
        'categorized' => $categorized,
        'skipped' => $skipped,
        'files_processed' => $filesProcessed,
        'errors' => array_slice($errors, 0, 10),
        'account_id' => $accountId,
        'new_balance' => $newBalance,
        'imported_details' => array_slice($importedDetails, 0, 100),
        'skipped_details' => array_slice($skippedDetails, 0, 100),
        'pending_duplicates' => $pendingDuplicates // For user review
    ], "$imported transactions imported from $filesProcessed file(s), $categorized auto-categorized, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import AMEX error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
