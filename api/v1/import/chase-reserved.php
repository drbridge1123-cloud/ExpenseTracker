<?php
/**
 * Import Chase Reserve CSV
 * POST /api/v1/import/chase-reserve.php
 *
 * Chase CSV Format:
 * Transaction Date, Post Date, Description, Category, Type, Amount, Memo
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
$transferAccountId = !empty($_POST['transfer_account_id']) ? (int)$_POST['transfer_account_id'] : null;
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

    // Find ALL CSV files in ZIP
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $filename = $zip->getNameIndex($i);
        if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'csv') {
            // Extract CSV to temp file
            $csvContent = $zip->getFromIndex($i);
            $csvPath = sys_get_temp_dir() . '/chase_import_' . uniqid() . '.csv';
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

    // If no account specified, try to find or create Chase Reserve account
    if (!$accountId) {
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_name LIKE '%Chase%Reserve%'",
            ['user_id' => $userId]
        );

        if ($account) {
            $accountId = $account['id'];
        } else {
            // Create Chase Reserve account
            $db->insert('accounts', [
                'user_id' => $userId,
                'account_name' => 'Chase Reserve',
                'account_type' => 'credit_card',
                'currency' => 'USD',
                'current_balance' => 0,
                'is_active' => 1,
                'include_in_totals' => 1
            ]);
            $accountId = $db->lastInsertId();
        }
    }

    // Get category mappings
    $categoryMap = [];
    $categories = $db->fetchAll(
        "SELECT id, name FROM categories WHERE user_id = :user_id",
        ['user_id' => $userId]
    );
    foreach ($categories as $cat) {
        $categoryMap[strtolower($cat['name'])] = $cat['id'];
    }

    // Get uncategorized category for this user
    $uncategorized = $db->fetch(
        "SELECT id FROM categories WHERE user_id = :user_id AND name = 'Uncategorized'",
        ['user_id' => $userId]
    );
    $uncategorizedId = $uncategorized ? $uncategorized['id'] : null;

    // If no uncategorized category, create one
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
    $skippedDetails = []; // Track why each row was skipped
    $importedDetails = []; // Track imported transactions
    $filesProcessed = 0;
    $matchedChecks = []; // Checks that matched with imported transactions
    $mismatchedChecks = []; // Checks with amount mismatch (need manual review)

    // Process each CSV file
    foreach ($csvPaths as $csvPath) {
        $handle = fopen($csvPath, 'r');
        if (!$handle) {
            $errors[] = "Failed to open CSV file: $csvPath";
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

        // Auto-detect format: Chase Credit Card vs Chase Checking vs AMEX vs Citi
        $isChaseCC = isset($headerMap['transaction date']);  // Chase Credit Card
        $isChaseChecking = isset($headerMap['posting date']) && isset($headerMap['details']);  // Chase Checking
        $isAmex = isset($headerMap['date']) && !isset($headerMap['transaction date']) && isset($headerMap['amount']);
        $isCiti = isset($headerMap['date']) && isset($headerMap['debit']) && isset($headerMap['credit']);
        $isChase = $isChaseCC || $isChaseChecking;  // Either Chase format

        // Check required columns
        if (!$isChase && !$isAmex && !$isCiti) {
            fclose($handle);
            $errors[] = "Unknown CSV format. Expected Chase CC (Transaction Date), Chase Checking (Posting Date, Details), AMEX (Date, Amount), or Citi (Date, Debit, Credit) columns.";
            continue;
        }
        if (!isset($headerMap['description'])) {
            fclose($handle);
            continue;
        }
        // Amount column required for Chase/AMEX but not Citi (which has Debit/Credit)
        if (($isChase || $isAmex) && !isset($headerMap['amount'])) {
            fclose($handle);
            continue;
        }

        $filesProcessed++;
        $rowNum = 1;

        while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            // Get date based on format
            if ($isChaseCC) {
                // Chase Credit Card: Transaction Date, Post Date
                $transactionDate = trim($row[$headerMap['transaction date']] ?? '');
                $postDate = trim($row[$headerMap['post date'] ?? $headerMap['transaction date']] ?? '');
            } elseif ($isChaseChecking) {
                // Chase Checking: Posting Date only
                $transactionDate = trim($row[$headerMap['posting date']] ?? '');
                $postDate = $transactionDate;
            } else {
                // AMEX or Citi format - both use 'date' column
                $transactionDate = trim($row[$headerMap['date']] ?? '');
                $postDate = $transactionDate;
            }

            $description = trim($row[$headerMap['description']] ?? '');
            $chaseCategory = isset($headerMap['category']) ? strtolower(trim($row[$headerMap['category']] ?? '')) : '';
            $type = isset($headerMap['type']) ? strtolower(trim($row[$headerMap['type']] ?? '')) : '';
            $memo = isset($headerMap['memo']) ? trim($row[$headerMap['memo']] ?? '') : '';

            // Calculate amount based on format
            if ($isCiti) {
                // Citi format: separate Debit and Credit columns
                $debit = trim($row[$headerMap['debit']] ?? '');
                $credit = trim($row[$headerMap['credit']] ?? '');

                // Payment transactions - mark as transfer if transfer_account_id provided
                $isPayment = !empty($credit) && stripos($description, 'PAYMENT') !== false;
                if ($isPayment && !$transferAccountId) {
                    $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Payment (no transfer account)', 'description' => $description, 'amount' => $credit];
                    $skipped++;
                    continue;
                }

                // Debit = expense (negative), Credit = refund (positive)
                if (!empty($debit)) {
                    $amount = -abs((float)$debit);
                } elseif (!empty($credit)) {
                    $amount = abs((float)$credit);
                } else {
                    $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Empty amount', 'description' => $description, 'amount' => null];
                    $skipped++;
                    continue;
                }
            } else {
                $amount = (float)($row[$headerMap['amount']] ?? 0);
            }

            // AMEX: handle sign and payments
            $isPayment = false;
            if ($isAmex) {
                // AMEX payments have negative amounts and contain "PAYMENT" in description
                if ($amount < 0 && stripos($description, 'PAYMENT') !== false) {
                    $isPayment = true;
                    if (!$transferAccountId) {
                        $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Payment (no transfer account)', 'description' => $description, 'amount' => $amount];
                        $skipped++;
                        continue;
                    }
                }
                // Flip sign: AMEX positive = expense = our negative
                $amount = -$amount;
            }

            if (empty($transactionDate) || empty($description)) {
                $errors[] = "Row $rowNum: Missing transaction date or description";
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

            // Handle Chase payment type
            if ($type === 'payment') {
                $isPayment = true;
                if (!$transferAccountId) {
                    $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Payment (no transfer account)', 'description' => $description, 'amount' => $amount];
                    $skipped++;
                    continue;
                }
            }

            // Also detect payments by description for Chase CC (when type column is not present or different)
            if (!$isPayment && $isChaseCC && stripos($description, 'AUTOMATIC PAYMENT') !== false) {
                $isPayment = true;
                if (!$transferAccountId) {
                    $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Payment (no transfer account)', 'description' => $description, 'amount' => $amount];
                    $skipped++;
                    continue;
                }
            }

            // Chase Checking: Details column indicates transaction type
            // DSLIP = Deposit Slip, DEBIT_CARD = Debit Card purchase, ACH_CREDIT/ACH_DEBIT = ACH transfers
            // CHECK_PAID = Check cleared
            $checkNumber = null;
            $matchedCheck = null;

            if ($isChaseChecking) {
                $details = isset($headerMap['details']) ? strtoupper(trim($row[$headerMap['details']] ?? '')) : '';

                // Get check number from "Check or Slip #" column
                $checkNumber = isset($headerMap['check or slip #']) ? trim($row[$headerMap['check or slip #']] ?? '') : '';

                // Skip internal transfers between accounts (Zelle, wire transfers, etc.)
                // These would need manual categorization or separate handling
                if (in_array($details, ['ACCT_XFER', 'WIRE_OUTGOING', 'WIRE_INCOMING'])) {
                    // Keep as regular transaction, not a payment
                }

                // Check matching: Look for pending checks with this check number
                if (!empty($checkNumber)) {
                    $pendingCheck = $db->fetch(
                        "SELECT * FROM checks
                         WHERE account_id = :account_id
                         AND check_number = :check_number
                         AND status = 'pending'",
                        ['account_id' => $accountId, 'check_number' => $checkNumber]
                    );

                    if ($pendingCheck) {
                        // Compare amounts (use absolute values, allow 0.01 tolerance)
                        $checkAmount = abs((float)$pendingCheck['amount']);
                        $txnAmount = abs((float)$amount);

                        if (abs($checkAmount - $txnAmount) < 0.01) {
                            // ✅ Match successful - will update check after transaction insert
                            $matchedCheck = $pendingCheck;
                        } else {
                            // ⚠️ Amount mismatch - needs manual review
                            $mismatchedChecks[] = [
                                'check_id' => $pendingCheck['id'],
                                'check_number' => $checkNumber,
                                'check_amount' => $pendingCheck['amount'],
                                'imported_amount' => $amount,
                                'payee' => $pendingCheck['payee'],
                                'description' => $description
                            ];
                        }
                    }
                }
            }

            // Categorization priority:
            // 1. Matched check's category (highest)
            // 2. User's rules
            // 3. Chase category mapping
            // 4. Uncategorized (default)
            $categoryId = $uncategorizedId;
            $categorizedBy = 'default';

            // If we have a matched check, use its category
            if ($matchedCheck && !empty($matchedCheck['category_id'])) {
                $categoryId = $matchedCheck['category_id'];
                $categorizedBy = 'check';
            } else {
                // Try user's rules
                $txnForRules = [
                    'description' => $description,
                    'original_description' => $description,
                    'vendor_name' => '',
                    'memo' => $memo,
                    'amount' => $amount
                ];
                $ruleResult = $categorizer->categorize($txnForRules);

                if ($ruleResult && $ruleResult['categorized_by'] === 'rule') {
                    // User's rule matched - use it
                    $categoryId = $ruleResult['category_id'];
                    $categorizedBy = 'rule';
                }
            }

            // If still uncategorized, fall back to Chase category mapping
            if ($categorizedBy === 'default') {
                // No rule matched - fall back to Chase category mapping
                $chaseCategoryMapping = [
                    'food & drink' => ['food & drink', 'dining', 'restaurants', 'food & dining'],
                    'food & beverage' => ['food & drink', 'dining', 'restaurants', 'food & dining'],
                    'groceries' => ['groceries', 'grocery'],
                    'shopping' => ['shopping'],
                    'travel' => ['travel', 'transportation'],
                    'entertainment' => ['entertainment'],
                    'health & wellness' => ['health & wellness', 'health', 'medical'],
                    'home' => ['home', 'household'],
                    'personal' => ['personal', 'personal care'],
                    'gas' => ['gas', 'fuel', 'gas & fuel'],
                    'automotive' => ['automotive', 'auto', 'car'],
                    'bills & utilities' => ['bills & utilities', 'utilities', 'bills'],
                    'education' => ['education'],
                    'professional services' => ['professional services', 'services'],
                    'gifts & donations' => ['gifts & donations', 'gifts', 'donations'],
                    'fees & adjustments' => ['fees & adjustments', 'fees', 'bank fees']
                ];

                // Find matching category from Chase's category
                foreach ($chaseCategoryMapping as $ourCat => $chaseCats) {
                    if (in_array($chaseCategory, $chaseCats)) {
                        // Try to find our category by name
                        foreach ($categoryMap as $catName => $catId) {
                            if (stripos($catName, $ourCat) !== false) {
                                $categoryId = $catId;
                                $categorizedBy = 'chase';
                                break 2;
                            }
                        }
                        break;
                    }
                }

                // If still no match, try exact match on Chase category name
                if ($categoryId === $uncategorizedId && isset($categoryMap[$chaseCategory])) {
                    $categoryId = $categoryMap[$chaseCategory];
                    $categorizedBy = 'chase';
                }
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
                $skippedDetails[] = ['row' => $rowNum, 'reason' => 'Duplicate', 'description' => $description, 'amount' => $amount, 'date' => $formattedDate];
                $skipped++;
                continue;
            }

            // Determine transaction type based on amount (debit/credit for this schema)
            // Negative amount = debit (expense), Positive amount = credit (refund/return)
            $transactionType = $amount < 0 ? 'debit' : 'credit';

            // For adjustments/returns
            if ($type === 'return' || $type === 'adjustment') {
                $transactionType = 'credit';
            }

            // For payments, set as transfer type
            if ($isPayment) {
                $transactionType = 'transfer';
            }

            // Parse post date if available
            $formattedPostDate = null;
            if (!empty($postDate)) {
                $postDateObj = DateTime::createFromFormat('m/d/Y', $postDate);
                if (!$postDateObj) {
                    $postDateObj = DateTime::createFromFormat('Y-m-d', $postDate);
                }
                if ($postDateObj) {
                    $formattedPostDate = $postDateObj->format('Y-m-d');
                }
            }

            // Insert transaction
            $transactionData = [
                'user_id' => $userId,
                'account_id' => $accountId,
                'category_id' => $isPayment ? null : $categoryId, // No category for transfers
                'amount' => $amount,
                'description' => $description,
                'original_description' => $description,
                'transaction_date' => $formattedDate,
                'post_date' => $formattedPostDate,
                'transaction_type' => $transactionType,
                'status' => 'posted',
                'memo' => $memo ?: null,
                'is_recurring' => 0,
                'categorized_by' => $isPayment ? 'default' : $categorizedBy
            ];

            // Add check_number if present
            if (!empty($checkNumber)) {
                $transactionData['check_number'] = $checkNumber;
            }

            // Add transfer_account_id for payment/transfer transactions
            if ($isPayment && $transferAccountId) {
                $transactionData['transfer_account_id'] = $transferAccountId;
            }

            $transactionId = $db->insert('transactions', $transactionData);

            // If we matched a check, update it to cleared status
            if ($matchedCheck) {
                $db->query(
                    "UPDATE checks SET status = 'cleared', transaction_id = :txn_id WHERE id = :check_id",
                    ['txn_id' => $transactionId, 'check_id' => $matchedCheck['id']]
                );
                $matchedChecks[] = [
                    'check_id' => $matchedCheck['id'],
                    'check_number' => $matchedCheck['check_number'],
                    'payee' => $matchedCheck['payee'],
                    'amount' => $matchedCheck['amount'],
                    'transaction_id' => $transactionId
                ];
            }

            $importedDetails[] = [
                'row' => $rowNum,
                'description' => $description,
                'amount' => $amount,
                'date' => $formattedDate,
                'type' => $isPayment ? 'transfer' : $transactionType,
                'check_matched' => $matchedCheck ? true : false
            ];
            $imported++;

        } catch (Exception $e) {
            $errors[] = "Row $rowNum: " . $e->getMessage();
            $skipped++;
        }
        }

        fclose($handle);
    } // End foreach csvPaths

    // Update account balance based on transaction totals
    // For the main account (credit card): sum of all transactions
    $balanceResult = $db->fetch(
        "SELECT SUM(amount) as total FROM transactions WHERE account_id = :account_id",
        ['account_id' => $accountId]
    );
    $newBalance = $balanceResult['total'] ?? 0;

    $db->query(
        "UPDATE accounts SET current_balance = :balance WHERE id = :account_id",
        ['balance' => $newBalance, 'account_id' => $accountId]
    );

    // Update transfer account balance if transfers were imported
    // Transfer transactions reduce the bank account balance
    $transferAccountBalance = null;
    if ($transferAccountId) {
        // Calculate: transfers FROM this account TO credit card = negative impact on bank
        $transferTotal = $db->fetch(
            "SELECT SUM(amount) as total FROM transactions
             WHERE transfer_account_id = :transfer_account_id
             AND transaction_type = 'transfer'",
            ['transfer_account_id' => $transferAccountId]
        );

        // Get current transactions for transfer account (excluding what we just linked)
        $transferAccountTxns = $db->fetch(
            "SELECT SUM(amount) as total FROM transactions WHERE account_id = :account_id",
            ['account_id' => $transferAccountId]
        );

        // Transfer amount is positive on credit card side (debt reduction)
        // So it should be negative on bank side (money going out)
        $transferImpact = -($transferTotal['total'] ?? 0);
        $transferAccountBalance = ($transferAccountTxns['total'] ?? 0) + $transferImpact;

        $db->query(
            "UPDATE accounts SET current_balance = :balance WHERE id = :account_id",
            ['balance' => $transferAccountBalance, 'account_id' => $transferAccountId]
        );
    }

    $db->commit();

    // Note: Rules are now applied during import (before Chase category mapping)
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

    // Build response message
    $message = "$imported transactions imported from $filesProcessed file(s), $categorized auto-categorized, $skipped skipped";
    if (count($matchedChecks) > 0) {
        $message .= ", " . count($matchedChecks) . " checks matched and cleared";
    }
    if (count($mismatchedChecks) > 0) {
        $message .= ", " . count($mismatchedChecks) . " checks need manual review (amount mismatch)";
    }

    successResponse([
        'imported' => $imported,
        'categorized' => $categorized,
        'skipped' => $skipped,
        'imported_details' => $importedDetails, // All imported transactions
        'skipped_details' => $skippedDetails, // All skipped items
        'files_processed' => $filesProcessed,
        'errors' => array_slice($errors, 0, 20), // Limit errors to 20
        'account_id' => $accountId,
        'new_balance' => $newBalance,
        'transfer_account_id' => $transferAccountId,
        'transfer_account_balance' => $transferAccountBalance,
        // Check matching results
        'checks_matched' => $matchedChecks,
        'checks_mismatched' => $mismatchedChecks
    ], $message);

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import Chase Reserve error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
