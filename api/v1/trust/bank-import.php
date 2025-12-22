<?php
/**
 * Trust Bank Statement Import API
 * Imports bank statements (Chase CSV) into trust_transactions
 *
 * Flow:
 * 1. Parse CSV file
 * 2. Match transactions to existing clients (optional)
 * 3. Import as deposits/disbursements
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
$mode = $_POST['mode'] ?? 'preview'; // 'preview' or 'import'
$file = $_FILES['csv_file'];

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error: ' . $file['error']);
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'csv') {
    errorResponse('Only CSV files are supported');
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    // Get IOLTA account if not specified
    if (!$accountId) {
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1",
            ['user_id' => $userId]
        );
        if ($account) {
            $accountId = $account['id'];
        } else {
            errorResponse('No IOLTA account found. Please create one first.');
        }
    }

    // Parse CSV file
    $handle = fopen($file['tmp_name'], 'r');
    if (!$handle) {
        errorResponse('Failed to open CSV file');
    }

    // Skip BOM if present
    $bom = fread($handle, 3);
    if ($bom !== "\xEF\xBB\xBF") {
        rewind($handle);
    }

    // Read header
    $header = fgetcsv($handle);
    if (!$header) {
        fclose($handle);
        errorResponse('Empty CSV file');
    }

    // Normalize headers
    $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

    // Detect Chase format
    $hasDetails = isset($headerMap['details']);
    $hasPostingDate = isset($headerMap['posting date']);
    $hasTransactionDate = isset($headerMap['transaction date']);

    if (!$hasDetails && !$hasPostingDate) {
        fclose($handle);
        errorResponse('Invalid CSV format. Expected Chase bank statement format.');
    }

    // Get date column
    $dateCol = $hasPostingDate ? 'posting date' : ($hasTransactionDate ? 'transaction date' : 'date');

    $transactions = [];
    $rowNum = 1;
    $errors = [];

    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            $details = isset($headerMap['details']) ? trim($row[$headerMap['details']] ?? '') : '';
            $postingDate = trim($row[$headerMap[$dateCol]] ?? '');
            $description = trim($row[$headerMap['description']] ?? '');
            $amount = (float)str_replace(['$', ','], '', $row[$headerMap['amount']] ?? '0');
            $type = isset($headerMap['type']) ? trim($row[$headerMap['type']] ?? '') : '';
            $balance = isset($headerMap['balance']) ? (float)str_replace(['$', ','], '', $row[$headerMap['balance']] ?? '0') : null;
            $checkOrSlip = isset($headerMap['check or slip #']) ? trim($row[$headerMap['check or slip #']] ?? '') : '';

            if (empty($postingDate) || empty($description)) {
                continue;
            }

            // Parse date (MM/DD/YYYY format for Chase)
            $dateObj = DateTime::createFromFormat('m/d/Y', $postingDate);
            if (!$dateObj) {
                $dateObj = DateTime::createFromFormat('Y-m-d', $postingDate);
            }
            if (!$dateObj) {
                $errors[] = "Row $rowNum: Invalid date format: $postingDate";
                continue;
            }
            $formattedDate = $dateObj->format('Y-m-d');

            // Determine transaction type based on amount
            // Positive = deposit (credit), Negative = disbursement (debit)
            $transType = $amount >= 0 ? 'deposit' : 'disbursement';

            // Store absolute amount
            $absAmount = abs($amount);

            $transactions[] = [
                'row' => $rowNum,
                'date' => $formattedDate,
                'description' => $description,
                'amount' => $absAmount,
                'original_amount' => $amount,
                'type' => $transType,
                'details' => $details,
                'check_number' => $checkOrSlip,
                'balance' => $balance
            ];

        } catch (Exception $e) {
            $errors[] = "Row $rowNum: " . $e->getMessage();
        }
    }

    fclose($handle);

    // Preview mode - just return parsed data
    if ($mode === 'preview') {
        // Count deposits and disbursements
        $deposits = array_filter($transactions, fn($t) => $t['type'] === 'deposit');
        $disbursements = array_filter($transactions, fn($t) => $t['type'] === 'disbursement');

        successResponse([
            'transactions' => $transactions,
            'summary' => [
                'total' => count($transactions),
                'deposits' => count($deposits),
                'disbursements' => count($disbursements),
                'total_deposits' => array_sum(array_column($deposits, 'amount')),
                'total_disbursements' => array_sum(array_column($disbursements, 'amount'))
            ],
            'account_id' => $accountId,
            'errors' => $errors
        ], 'Preview generated');
    }

    // Import mode - actually insert transactions
    // For Trust transactions, we need a ledger_id
    // Get default/general ledger or create one if doesn't exist

    $generalLedger = $db->fetch(
        "SELECT l.id FROM trust_ledger l
         JOIN trust_clients c ON l.client_id = c.id
         WHERE l.user_id = :user_id AND l.account_id = :account_id
         AND c.client_name = 'General/Unassigned'
         LIMIT 1",
        ['user_id' => $userId, 'account_id' => $accountId]
    );

    if (!$generalLedger) {
        // Create a general client and ledger for unassigned transactions
        $pdo->beginTransaction();
        try {
            $clientId = $db->insert('trust_clients', [
                'user_id' => $userId,
                'client_name' => 'General/Unassigned',
                'is_active' => 1
            ]);

            $ledgerId = $db->insert('trust_ledger', [
                'user_id' => $userId,
                'client_id' => $clientId,
                'account_id' => $accountId,
                'current_balance' => 0,
                'is_active' => 1
            ]);

            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            errorResponse('Failed to create general ledger: ' . $e->getMessage());
        }
    } else {
        $ledgerId = $generalLedger['id'];
    }

    // Get current ledger balance
    $ledger = $db->fetch("SELECT current_balance FROM trust_ledger WHERE id = :id", ['id' => $ledgerId]);
    $runningBalance = (float)($ledger['current_balance'] ?? 0);

    $imported = 0;
    $skipped = 0;
    $skippedItems = []; // Track skipped items for reporting

    $pdo->beginTransaction();
    try {
        foreach ($transactions as $txn) {
            // Check for duplicates
            $existing = $db->fetch(
                "SELECT id FROM trust_transactions
                 WHERE user_id = :user_id AND ledger_id = :ledger_id
                 AND transaction_date = :date AND description = :desc AND amount = :amount",
                [
                    'user_id' => $userId,
                    'ledger_id' => $ledgerId,
                    'date' => $txn['date'],
                    'desc' => $txn['description'],
                    'amount' => $txn['type'] === 'deposit' ? $txn['amount'] : -$txn['amount']
                ]
            );

            if ($existing) {
                $skipped++;
                $skippedItems[] = [
                    'date' => $txn['date'],
                    'description' => $txn['description'],
                    'amount' => $txn['original_amount'],
                    'type' => $txn['type'],
                    'reason' => 'Duplicate transaction already exists'
                ];
                continue;
            }

            // Calculate amount with sign
            $signedAmount = $txn['type'] === 'deposit' ? $txn['amount'] : -$txn['amount'];
            $runningBalance += $signedAmount;

            $db->insert('trust_transactions', [
                'user_id' => $userId,
                'ledger_id' => $ledgerId,
                'transaction_type' => $txn['type'],
                'amount' => $signedAmount,
                'running_balance' => $runningBalance,
                'description' => $txn['description'],
                'transaction_date' => $txn['date'],
                'check_number' => $txn['check_number'] ?: null,
                'status' => 'cleared',
                'created_by' => $userId
            ]);

            $imported++;
        }

        // Update ledger balance
        $db->update('trust_ledger',
            ['current_balance' => $runningBalance],
            'id = :id',
            ['id' => $ledgerId]
        );

        // Update account balance
        $db->query(
            "UPDATE accounts SET current_balance = :balance WHERE id = :id",
            ['balance' => $runningBalance, 'id' => $accountId]
        );

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'bank_import',
            'entity_type' => 'trust_transactions',
            'description' => "Imported $imported transactions from bank statement, skipped $skipped duplicates",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'imported' => $imported,
            'skipped' => $skipped,
            'skipped_items' => $skippedItems,
            'new_balance' => $runningBalance,
            'ledger_id' => $ledgerId,
            'errors' => $errors
        ], "Successfully imported $imported transactions");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Import failed: ' . $e->getMessage());
    }

} catch (Exception $e) {
    appLog('Trust bank import error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
