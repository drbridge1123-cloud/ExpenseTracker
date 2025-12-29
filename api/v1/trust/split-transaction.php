<?php
/**
 * Trust Split Transaction API
 * Create split checks/deposits across multiple client ledgers
 * One physical check → Multiple client ledger entries
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($db, $pdo);
        break;
    case 'POST':
        handlePost($db, $pdo);
        break;
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

/**
 * GET - Retrieve split transaction details
 */
function handleGet(Database $db, PDO $pdo): void {
    $splitGroupId = $_GET['split_group_id'] ?? null;
    $transactionId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if ($splitGroupId) {
        // Get all transactions in a split group
        $transactions = $db->fetchAll(
            "SELECT t.*, tc.client_name, tc.case_number, l.client_id
             FROM trust_transactions t
             JOIN trust_ledger l ON t.ledger_id = l.id
             JOIN trust_clients tc ON l.client_id = tc.id
             WHERE t.split_group_id = :split_group_id
             ORDER BY t.id ASC",
            ['split_group_id' => $splitGroupId]
        );

        if (empty($transactions)) {
            errorResponse('Split group not found', 404);
        }

        // Calculate totals
        $totalAmount = 0;
        foreach ($transactions as &$tx) {
            $tx['amount'] = (float)$tx['amount'];
            $totalAmount += $tx['amount'];
        }

        successResponse([
            'split_group_id' => $splitGroupId,
            'total_amount' => $totalAmount,
            'transaction_count' => count($transactions),
            'transactions' => $transactions
        ]);
    } elseif ($transactionId) {
        // Get single transaction and check if it's part of a split
        $transaction = $db->fetch(
            "SELECT t.*, tc.client_name, tc.case_number, l.client_id
             FROM trust_transactions t
             JOIN trust_ledger l ON t.ledger_id = l.id
             JOIN trust_clients tc ON l.client_id = tc.id
             WHERE t.id = :id",
            ['id' => $transactionId]
        );

        if (!$transaction) {
            errorResponse('Transaction not found', 404);
        }

        $response = ['transaction' => $transaction];

        // If this is part of a split, get sibling transactions
        if (!empty($transaction['split_group_id'])) {
            $siblings = $db->fetchAll(
                "SELECT t.id, t.amount, t.description, tc.client_name, tc.case_number
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 JOIN trust_clients tc ON l.client_id = tc.id
                 WHERE t.split_group_id = :split_group_id AND t.id != :id",
                ['split_group_id' => $transaction['split_group_id'], 'id' => $transactionId]
            );
            $response['split_siblings'] = $siblings;
        }

        successResponse($response);
    } else {
        errorResponse('split_group_id or id is required');
    }
}

/**
 * POST - Create split transaction
 */
function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Required fields
    $required = ['user_id', 'transaction_type', 'transaction_date', 'splits'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            errorResponse("Field '$field' is required");
        }
    }

    $userId = (int)$input['user_id'];
    $transactionType = $input['transaction_type'];
    $transactionDate = $input['transaction_date'];
    $splits = $input['splits'];

    // Validate transaction type
    $validTypes = ['disbursement', 'deposit', 'transfer_out', 'earned_fee', 'refund'];
    if (!in_array($transactionType, $validTypes)) {
        errorResponse('Invalid transaction type for split: ' . $transactionType);
    }

    // Validate splits array
    if (!is_array($splits) || count($splits) < 2) {
        errorResponse('At least 2 split lines are required');
    }

    // Validate each split has required fields
    $totalAmount = 0;
    foreach ($splits as $i => $split) {
        if (empty($split['client_id'])) {
            errorResponse("Split line " . ($i + 1) . " is missing client_id");
        }
        if (!isset($split['amount']) || $split['amount'] <= 0) {
            errorResponse("Split line " . ($i + 1) . " must have a positive amount");
        }
        $totalAmount += (float)$split['amount'];
    }

    // Common fields for all split lines
    $checkNumber = $input['check_number'] ?? null;
    $payee = $input['payee'] ?? null;
    $receivedFrom = $input['received_from'] ?? null;
    $referenceNumber = $input['reference_number'] ?? null;
    $status = $input['status'] ?? 'pending';
    $memo = $input['memo'] ?? null;

    // Determine if this is a credit or debit type
    $isCredit = in_array($transactionType, ['deposit', 'transfer_in', 'refund', 'interest']);

    // Get default IOLTA account
    $account = $db->fetch(
        "SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1",
        ['user_id' => $userId]
    );

    if (!$account) {
        errorResponse('No IOLTA account found. Please create an IOLTA account first.');
    }

    $pdo->beginTransaction();

    try {
        // Generate unique split group ID
        $splitGroupId = generateUUID();

        $createdTransactions = [];
        $affectedLedgers = [];

        foreach ($splits as $split) {
            $clientId = (int)$split['client_id'];
            $amount = (float)$split['amount'];
            $description = $split['description'] ?? $memo ?? '';

            // Apply sign based on transaction type
            $signedAmount = $isCredit ? abs($amount) : -abs($amount);

            // Get or create ledger for this client
            $ledger = $db->fetch(
                "SELECT l.*, tc.client_name FROM trust_ledger l
                 JOIN trust_clients tc ON l.client_id = tc.id
                 WHERE l.client_id = :client_id AND l.user_id = :user_id LIMIT 1",
                ['client_id' => $clientId, 'user_id' => $userId]
            );

            if (!$ledger) {
                // Auto-create ledger
                $ledgerId = $db->insert('trust_ledger', [
                    'user_id' => $userId,
                    'client_id' => $clientId,
                    'account_id' => $account['id'],
                    'current_balance' => 0,
                    'is_active' => 1
                ]);

                $ledger = $db->fetch(
                    "SELECT l.*, tc.client_name FROM trust_ledger l
                     JOIN trust_clients tc ON l.client_id = tc.id
                     WHERE l.id = :id",
                    ['id' => $ledgerId]
                );
            }

            // Check for negative balance on withdrawals
            $newBalance = (float)$ledger['current_balance'] + $signedAmount;
            if ($newBalance < 0) {
                throw new Exception(
                    "Insufficient funds for {$ledger['client_name']}. " .
                    "Current balance: $" . number_format($ledger['current_balance'], 2) . ", " .
                    "Requested: $" . number_format($amount, 2)
                );
            }

            // Insert transaction
            $transData = [
                'user_id' => $userId,
                'ledger_id' => $ledger['id'],
                'transaction_type' => $transactionType,
                'amount' => $signedAmount,
                'running_balance' => $newBalance,
                'description' => sanitize($description),
                'payee' => $payee,
                'received_from' => $receivedFrom,
                'reference_number' => $referenceNumber,
                'check_number' => $checkNumber,
                'status' => $status,
                'transaction_date' => $transactionDate,
                'memo' => $memo,
                'is_split' => 0,  // Individual lines are not parents
                'split_group_id' => $splitGroupId,
                'created_by' => $userId
            ];

            $transId = $db->insert('trust_transactions', $transData);

            // Update ledger balance
            $db->update('trust_ledger', ['current_balance' => $newBalance], 'id = :id', ['id' => $ledger['id']]);

            // Track for balance recalculation
            $affectedLedgers[$ledger['id']] = $transactionDate;

            $createdTransactions[] = [
                'id' => $transId,
                'client_id' => $clientId,
                'client_name' => $ledger['client_name'],
                'amount' => $signedAmount,
                'new_balance' => $newBalance
            ];
        }

        // Recalculate running balances for all affected ledgers
        foreach ($affectedLedgers as $ledgerId => $date) {
            recalculateLedgerRunningBalances($db, $ledgerId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'split_' . $transactionType,
            'entity_type' => 'trust_transactions',
            'entity_id' => $createdTransactions[0]['id'],
            'new_values' => json_encode([
                'split_group_id' => $splitGroupId,
                'total_amount' => $totalAmount,
                'split_count' => count($splits),
                'check_number' => $checkNumber
            ]),
            'description' => "Split {$transactionType} #{$checkNumber}: $" . number_format($totalAmount, 2) . " across " . count($splits) . " clients",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'split_group_id' => $splitGroupId,
            'total_amount' => $isCredit ? $totalAmount : -$totalAmount,
            'transactions' => $createdTransactions
        ], 'Split transaction created successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to create split transaction: ' . $e->getMessage());
    }
}

/**
 * DELETE - Delete entire split group
 */
function handleDelete(Database $db, PDO $pdo): void {
    $splitGroupId = $_GET['split_group_id'] ?? null;
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$splitGroupId) {
        errorResponse('split_group_id is required');
    }

    // Get all transactions in the split group
    $transactions = $db->fetchAll(
        "SELECT t.*, l.client_id FROM trust_transactions t
         JOIN trust_ledger l ON t.ledger_id = l.id
         WHERE t.split_group_id = :split_group_id",
        ['split_group_id' => $splitGroupId]
    );

    if (empty($transactions)) {
        errorResponse('Split group not found', 404);
    }

    $pdo->beginTransaction();

    try {
        $affectedLedgers = [];

        foreach ($transactions as $tx) {
            $ledgerId = $tx['ledger_id'];
            $amount = (float)$tx['amount'];

            // Reverse the amount from ledger balance
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $ledgerId]
            );

            // Track affected ledgers
            $affectedLedgers[$ledgerId] = true;

            // Delete the transaction
            $db->query("DELETE FROM trust_transactions WHERE id = :id", ['id' => $tx['id']]);
        }

        // Recalculate running balances for all affected ledgers
        foreach (array_keys($affectedLedgers) as $ledgerId) {
            recalculateLedgerRunningBalances($db, $ledgerId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?: $transactions[0]['user_id'],
            'action' => 'delete_split',
            'entity_type' => 'trust_transactions',
            'old_values' => json_encode([
                'split_group_id' => $splitGroupId,
                'transaction_count' => count($transactions)
            ]),
            'description' => "Deleted split group $splitGroupId with " . count($transactions) . " transactions",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'deleted_count' => count($transactions)
        ], 'Split transaction deleted successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to delete split transaction: ' . $e->getMessage());
    }
}

/**
 * Recalculate all running balances for a ledger from the beginning
 */
function recalculateLedgerRunningBalances(Database $db, int $ledgerId): void {
    $transactions = $db->fetchAll(
        "SELECT id, amount FROM trust_transactions
         WHERE ledger_id = :ledger_id
         ORDER BY transaction_date ASC, id ASC",
        ['ledger_id' => $ledgerId]
    );

    $runningBalance = 0;
    foreach ($transactions as $tx) {
        $runningBalance += (float)$tx['amount'];
        $db->query(
            "UPDATE trust_transactions SET running_balance = :balance WHERE id = :id",
            ['balance' => $runningBalance, 'id' => $tx['id']]
        );
    }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}
