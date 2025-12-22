<?php
/**
 * Trust Posting API
 * Posts staged transactions to accounting (Chart of Accounts)
 *
 * This is the ONLY place where account balances change.
 * Staging → Posted = Accounting entry created
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$db = Database::getInstance();
$pdo = $db->getConnection();

$input = json_decode(file_get_contents('php://input'), true);

$action = $input['action'] ?? 'post';

switch ($action) {
    case 'post':
        handlePost($db, $pdo, $input);
        break;
    case 'unpost':
        handleUnpost($db, $pdo, $input);
        break;
    case 'bulk_post':
        handleBulkPost($db, $pdo, $input);
        break;
    default:
        errorResponse('Invalid action');
}

/**
 * Post a single staging transaction to accounting
 */
function handlePost(Database $db, PDO $pdo, array $input): void {
    if (empty($input['staging_id'])) {
        errorResponse('staging_id is required');
    }

    $stagingId = (int)$input['staging_id'];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    // Get staging record
    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);

    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    if ($staging['status'] === 'posted') {
        errorResponse('Transaction already posted');
    }

    if ($staging['status'] !== 'assigned') {
        errorResponse('Transaction must be assigned to a client before posting');
    }

    if (!$staging['client_id']) {
        errorResponse('Client must be assigned before posting');
    }

    $userId = $userId ?? $staging['user_id'];

    // Start transaction
    $pdo->beginTransaction();

    try {
        // 1. Get or create ledger for this client
        $ledger = $db->fetch(
            "SELECT * FROM trust_ledger WHERE client_id = :client_id AND account_id = :account_id",
            ['client_id' => $staging['client_id'], 'account_id' => $staging['account_id']]
        );

        if (!$ledger) {
            // Create ledger
            $ledgerId = $db->insert('trust_ledger', [
                'user_id' => $userId,
                'account_id' => $staging['account_id'],
                'client_id' => $staging['client_id'],
                'current_balance' => 0,
                'is_active' => 1
            ]);
            $ledger = ['id' => $ledgerId, 'current_balance' => 0];
        }

        // 2. Calculate new balance
        $currentBalance = (float)$ledger['current_balance'];
        $amount = (float)$staging['amount'];
        $newBalance = $currentBalance + $amount;

        // 3. Create trust_transaction (accounting entry)
        $transactionType = $staging['transaction_type'];
        if ($transactionType === 'other') {
            $transactionType = $amount > 0 ? 'deposit' : 'disbursement';
        } elseif ($transactionType === 'check') {
            $transactionType = 'disbursement';
        }

        $transactionId = $db->insert('trust_transactions', [
            'user_id' => $userId,
            'ledger_id' => $ledger['id'],
            'staging_id' => $stagingId,
            'transaction_type' => $transactionType,
            'amount' => $amount,
            'running_balance' => $newBalance,
            'description' => $staging['description'],
            'payee' => $staging['payee'],
            'reference_number' => $staging['reference_number'],
            'transaction_date' => $staging['transaction_date'],
            'is_posted' => 1
        ]);

        // 4. Update ledger balance
        $db->update('trust_ledger',
            ['current_balance' => $newBalance],
            'id = :id',
            ['id' => $ledger['id']]
        );

        // 5. Update Case Account balance in accounts table
        $caseAccount = $db->fetch(
            "SELECT id, current_balance FROM accounts WHERE linked_client_id = :client_id AND account_type = 'trust'",
            ['client_id' => $staging['client_id']]
        );

        if ($caseAccount) {
            $newAccountBalance = (float)$caseAccount['current_balance'] + $amount;
            $db->update('accounts',
                ['current_balance' => $newAccountBalance],
                'id = :id',
                ['id' => $caseAccount['id']]
            );
        }

        // 6. Mark staging as posted
        $db->update('trust_staging', [
            'status' => 'posted',
            'posted_at' => date('Y-m-d H:i:s'),
            'posted_by' => $userId,
            'posted_transaction_id' => $transactionId
        ], 'id = :id', ['id' => $stagingId]);

        // 7. Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => $amount > 0 ? 'deposit' : 'disbursement',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transactionId,
            'client_id' => $staging['client_id'],
            'new_values' => json_encode([
                'staging_id' => $stagingId,
                'amount' => $amount,
                'new_balance' => $newBalance
            ]),
            'description' => "Posted: " . $staging['description'],
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'posted' => true,
            'transaction_id' => $transactionId,
            'new_balance' => $newBalance,
            'client_id' => $staging['client_id']
        ], 'Transaction posted to accounting');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Posting failed: ' . $e->getMessage());
    }
}

/**
 * Unpost a transaction (reverse accounting entry)
 */
function handleUnpost(Database $db, PDO $pdo, array $input): void {
    if (empty($input['staging_id'])) {
        errorResponse('staging_id is required');
    }

    $stagingId = (int)$input['staging_id'];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    // Get staging record
    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);

    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    if ($staging['status'] !== 'posted') {
        errorResponse('Transaction is not posted');
    }

    if (!$staging['posted_transaction_id']) {
        errorResponse('No linked transaction found');
    }

    $userId = $userId ?? $staging['user_id'];

    // Get the posted transaction
    $transaction = $db->fetch(
        "SELECT * FROM trust_transactions WHERE id = :id",
        ['id' => $staging['posted_transaction_id']]
    );

    if (!$transaction) {
        errorResponse('Posted transaction not found');
    }

    $pdo->beginTransaction();

    try {
        $amount = (float)$transaction['amount'];
        $reverseAmount = -$amount;

        // 1. Update ledger balance (reverse)
        $ledger = $db->fetch("SELECT * FROM trust_ledger WHERE id = :id", ['id' => $transaction['ledger_id']]);
        $newBalance = (float)$ledger['current_balance'] + $reverseAmount;

        $db->update('trust_ledger',
            ['current_balance' => $newBalance],
            'id = :id',
            ['id' => $ledger['id']]
        );

        // 2. Update Case Account balance
        $caseAccount = $db->fetch(
            "SELECT id, current_balance FROM accounts WHERE linked_client_id = :client_id AND account_type = 'trust'",
            ['client_id' => $staging['client_id']]
        );

        if ($caseAccount) {
            $newAccountBalance = (float)$caseAccount['current_balance'] + $reverseAmount;
            $db->update('accounts',
                ['current_balance' => $newAccountBalance],
                'id = :id',
                ['id' => $caseAccount['id']]
            );
        }

        // 3. Mark transaction as unposted
        $db->update('trust_transactions',
            ['is_posted' => 0],
            'id = :id',
            ['id' => $transaction['id']]
        );

        // 4. Revert staging status to assigned
        $db->update('trust_staging', [
            'status' => 'assigned',
            'posted_at' => null,
            'posted_by' => null,
            'posted_transaction_id' => null
        ], 'id = :id', ['id' => $stagingId]);

        // 5. Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'balance_adjustment',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transaction['id'],
            'client_id' => $staging['client_id'],
            'old_values' => json_encode(['balance' => $ledger['current_balance']]),
            'new_values' => json_encode(['balance' => $newBalance, 'unposted' => true]),
            'description' => "Unposted: " . $staging['description'],
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'unposted' => true,
            'new_balance' => $newBalance,
            'client_id' => $staging['client_id']
        ], 'Transaction unposted (reversed)');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Unpost failed: ' . $e->getMessage());
    }
}

/**
 * Bulk post multiple staging transactions
 */
function handleBulkPost(Database $db, PDO $pdo, array $input): void {
    if (empty($input['staging_ids']) || !is_array($input['staging_ids'])) {
        errorResponse('staging_ids array is required');
    }

    $stagingIds = array_map('intval', $input['staging_ids']);
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    $posted = 0;
    $failed = 0;
    $errors = [];

    foreach ($stagingIds as $stagingId) {
        try {
            // Get staging record
            $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);

            if (!$staging) {
                $errors[] = "ID $stagingId: Not found";
                $failed++;
                continue;
            }

            if ($staging['status'] === 'posted') {
                $errors[] = "ID $stagingId: Already posted";
                $failed++;
                continue;
            }

            if ($staging['status'] !== 'assigned' || !$staging['client_id']) {
                $errors[] = "ID $stagingId: Must be assigned to a client";
                $failed++;
                continue;
            }

            // Post this transaction (reuse single post logic inline)
            $pdo->beginTransaction();

            // Get or create ledger
            $ledger = $db->fetch(
                "SELECT * FROM trust_ledger WHERE client_id = :client_id AND account_id = :account_id",
                ['client_id' => $staging['client_id'], 'account_id' => $staging['account_id']]
            );

            if (!$ledger) {
                $ledgerId = $db->insert('trust_ledger', [
                    'user_id' => $userId ?? $staging['user_id'],
                    'account_id' => $staging['account_id'],
                    'client_id' => $staging['client_id'],
                    'current_balance' => 0,
                    'is_active' => 1
                ]);
                $ledger = ['id' => $ledgerId, 'current_balance' => 0];
            }

            $currentBalance = (float)$ledger['current_balance'];
            $amount = (float)$staging['amount'];
            $newBalance = $currentBalance + $amount;

            $transactionType = $staging['transaction_type'];
            if ($transactionType === 'other') {
                $transactionType = $amount > 0 ? 'deposit' : 'disbursement';
            } elseif ($transactionType === 'check') {
                $transactionType = 'disbursement';
            }

            $transactionId = $db->insert('trust_transactions', [
                'user_id' => $userId ?? $staging['user_id'],
                'ledger_id' => $ledger['id'],
                'staging_id' => $stagingId,
                'transaction_type' => $transactionType,
                'amount' => $amount,
                'running_balance' => $newBalance,
                'description' => $staging['description'],
                'payee' => $staging['payee'],
                'reference_number' => $staging['reference_number'],
                'transaction_date' => $staging['transaction_date'],
                'is_posted' => 1
            ]);

            $db->update('trust_ledger',
                ['current_balance' => $newBalance],
                'id = :id',
                ['id' => $ledger['id']]
            );

            // Update Case Account
            $caseAccount = $db->fetch(
                "SELECT id, current_balance FROM accounts WHERE linked_client_id = :client_id AND account_type = 'trust'",
                ['client_id' => $staging['client_id']]
            );

            if ($caseAccount) {
                $newAccountBalance = (float)$caseAccount['current_balance'] + $amount;
                $db->update('accounts',
                    ['current_balance' => $newAccountBalance],
                    'id = :id',
                    ['id' => $caseAccount['id']]
                );
            }

            $db->update('trust_staging', [
                'status' => 'posted',
                'posted_at' => date('Y-m-d H:i:s'),
                'posted_by' => $userId ?? $staging['user_id'],
                'posted_transaction_id' => $transactionId
            ], 'id = :id', ['id' => $stagingId]);

            $pdo->commit();
            $posted++;

        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $errors[] = "ID $stagingId: " . $e->getMessage();
            $failed++;
        }
    }

    // Log bulk operation
    $db->insert('trust_audit_log', [
        'user_id' => $userId ?? 1,
        'action' => 'deposit',
        'entity_type' => 'trust_staging',
        'entity_id' => 0,
        'new_values' => json_encode(['posted' => $posted, 'failed' => $failed]),
        'description' => "Bulk post: $posted posted, $failed failed",
        'ip_address' => getClientIp()
    ]);

    successResponse([
        'posted' => $posted,
        'failed' => $failed,
        'errors' => $errors
    ], "$posted transactions posted");
}
