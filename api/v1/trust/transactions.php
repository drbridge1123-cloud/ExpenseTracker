<?php
/**
 * Trust Transactions API
 * Records deposits, disbursements, and transfers in client ledgers
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($pdo);
        break;
    case 'POST':
        handlePost($db, $pdo);
        break;
    case 'PUT':
        handlePut($db, $pdo);
        break;
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $ledgerId = !empty($_GET['ledger_id']) ? (int)$_GET['ledger_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $startDate = $_GET['start_date'] ?? null;
    $endDate = $_GET['end_date'] ?? null;
    $type = $_GET['type'] ?? null;
    $status = $_GET['status'] ?? null;
    $all = !empty($_GET['all']) ? true : false;
    $limit = $all ? 10000 : (!empty($_GET['limit']) ? (($_GET['limit'] == 'all') ? 10000 : min((int)$_GET['limit'], 10000)) : 100);
    $offset = !empty($_GET['offset']) ? (int)$_GET['offset'] : 0;

    $where = ['1=1'];
    $params = [];

    if ($ledgerId) {
        $where[] = 't.ledger_id = :ledger_id';
        $params['ledger_id'] = $ledgerId;
    }

    if ($accountId) {
        $where[] = 'l.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    if ($userId) {
        $where[] = 't.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($startDate) {
        $where[] = 't.transaction_date >= :start_date';
        $params['start_date'] = $startDate;
    }

    if ($endDate) {
        $where[] = 't.transaction_date <= :end_date';
        $params['end_date'] = $endDate;
    }

    if ($type) {
        $where[] = 't.transaction_type = :type';
        $params['type'] = $type;
    }

    if ($status) {
        $where[] = 't.status = :status';
        $params['status'] = $status;
    }

    $whereClause = implode(' AND ', $where);

    // Get total count
    $countSql = "SELECT COUNT(*) as total
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 WHERE $whereClause";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Get transactions with client and account information
    $sql = "SELECT
                t.*,
                l.current_balance as ledger_balance,
                tc.client_name, tc.matter_number,
                a.account_name
            FROM trust_transactions t
            JOIN trust_ledger l ON t.ledger_id = l.id
            JOIN trust_clients tc ON l.client_id = tc.id
            JOIN accounts a ON l.account_id = a.id
            WHERE $whereClause
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT $limit OFFSET $offset";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($transactions as &$trans) {
        $trans['amount'] = (float)$trans['amount'];
        $trans['running_balance'] = (float)$trans['running_balance'];
    }

    successResponse([
        'transactions' => $transactions,
        'total' => (int)$total,
        'limit' => $limit,
        'offset' => $offset
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Handle special actions via POST
    if (!empty($input['action'])) {
        switch ($input['action']) {
            case 'move_to_client':
                handleMoveToClient($db, $pdo, $input);
                return;
            case 'update':
                handleUpdateAction($db, $pdo, $input);
                return;
            case 'bulk_delete':
                handleBulkDelete($db, $pdo, $input);
                return;
        }
    }

    $required = ['user_id', 'ledger_id', 'transaction_type', 'amount', 'description', 'transaction_date'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || ($field !== 'amount' && empty($input[$field]))) {
            errorResponse("Field '$field' is required");
        }
    }

    $validTypes = ['deposit', 'disbursement', 'transfer_in', 'transfer_out', 'earned_fee', 'refund', 'interest', 'adjustment'];
    if (!in_array($input['transaction_type'], $validTypes)) {
        errorResponse('Invalid transaction type');
    }

    // Get ledger
    $ledger = $db->fetch("SELECT l.*, a.account_name FROM trust_ledger l
                          JOIN accounts a ON l.account_id = a.id
                          WHERE l.id = :id", ['id' => $input['ledger_id']]);
    if (!$ledger) {
        errorResponse('Ledger not found', 404);
    }

    if (!$ledger['is_active']) {
        errorResponse('Cannot add transactions to closed ledger');
    }

    $amount = (float)$input['amount'];
    $type = $input['transaction_type'];

    // Determine if this is a debit or credit to the ledger
    $isCredit = in_array($type, ['deposit', 'transfer_in', 'refund', 'interest']);

    // For disbursements, earned fees, transfer out - amount should reduce balance
    if (!$isCredit) {
        $amount = -abs($amount);
    } else {
        $amount = abs($amount);
    }

    // Check for negative balance on withdrawals
    $newBalance = (float)$ledger['current_balance'] + $amount;
    if ($newBalance < 0) {
        errorResponse('Insufficient funds. Current balance: $' . number_format($ledger['current_balance'], 2));
    }

    $pdo->beginTransaction();

    try {
        // Insert transaction
        $transData = [
            'user_id' => (int)$input['user_id'],
            'ledger_id' => (int)$input['ledger_id'],
            'transaction_id' => $input['transaction_id'] ?? null,
            'transaction_type' => $type,
            'amount' => $amount,
            'running_balance' => $newBalance,
            'description' => sanitize($input['description']),
            'payee' => $input['payee'] ?? null,
            'received_from' => $input['received_from'] ?? null,
            'reference_number' => $input['reference_number'] ?? null,
            'check_number' => $input['check_number'] ?? null,
            'transaction_date' => $input['transaction_date'],
            'cleared_date' => $input['cleared_date'] ?? null,
            'memo' => $input['memo'] ?? null,
            'created_by' => $input['user_id']
        ];

        $transId = $db->insert('trust_transactions', $transData);

        // Update ledger balance
        $db->update('trust_ledger', ['current_balance' => $newBalance], 'id = :id', ['id' => $input['ledger_id']]);

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $input['user_id'],
            'action' => $type,
            'entity_type' => 'trust_transactions',
            'entity_id' => $transId,
            'client_id' => $ledger['client_id'],
            'new_values' => json_encode($transData),
            'description' => "Amount: $amount, New Balance: $newBalance",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        $transaction = $db->fetch("SELECT * FROM trust_transactions WHERE id = :id", ['id' => $transId]);
        $transaction['amount'] = (float)$transaction['amount'];
        $transaction['running_balance'] = (float)$transaction['running_balance'];

        successResponse([
            'transaction' => $transaction,
            'new_balance' => $newBalance
        ], 'Transaction recorded successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to record transaction: ' . $e->getMessage());
    }
}

function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Handle reassign action (bulk move transactions to different client)
    if (!empty($input['action']) && $input['action'] === 'reassign') {
        handleReassign($db, $pdo, $input);
        return;
    }

    if (empty($input['id'])) {
        errorResponse('Transaction ID is required');
    }

    $transId = (int)$input['id'];
    $userId = $input['user_id'] ?? null;

    // Get existing transaction
    $existing = $db->fetch("SELECT t.*, l.current_balance as ledger_balance, l.client_id
                            FROM trust_transactions t
                            JOIN trust_ledger l ON t.ledger_id = l.id
                            WHERE t.id = :id", ['id' => $transId]);

    if (!$existing) {
        errorResponse('Transaction not found', 404);
    }

    // Check user ownership
    if ($userId && $existing['user_id'] != $userId) {
        errorResponse('Unauthorized', 403);
    }

    $pdo->beginTransaction();

    try {
        $oldAmount = (float)$existing['amount'];
        $updates = [];
        $params = ['id' => $transId];

        // Allowed update fields
        $allowedFields = ['transaction_date', 'description', 'memo', 'reference_number', 'check_number', 'payee', 'status'];

        foreach ($allowedFields as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }

        // Handle amount change - recalculate balance
        $newAmount = null;
        if (isset($input['amount'])) {
            $newAmount = (float)$input['amount'];
            $type = $existing['transaction_type'];
            $isCredit = in_array($type, ['deposit', 'transfer_in', 'refund', 'interest']);

            // Apply sign based on transaction type
            if (!$isCredit) {
                $newAmount = -abs($newAmount);
            } else {
                $newAmount = abs($newAmount);
            }

            // Calculate balance adjustment
            $amountDiff = $newAmount - $oldAmount;
            $newBalance = (float)$existing['running_balance'] + $amountDiff;

            // Only check ledger balance when INCREASING a withdrawal (more negative)
            if ($amountDiff < 0) {
                $newLedgerBalance = (float)$existing['ledger_balance'] + $amountDiff;
                if ($newLedgerBalance < 0) {
                    $pdo->rollBack();
                    errorResponse('Update would result in negative ledger balance');
                }
            }

            $updates[] = "amount = :amount";
            $params['amount'] = $newAmount;
            $updates[] = "running_balance = :running_balance";
            $params['running_balance'] = $newBalance;
        }

        if (empty($updates)) {
            $pdo->rollBack();
            errorResponse('No fields to update');
        }

        $sql = "UPDATE trust_transactions SET " . implode(', ', $updates) . " WHERE id = :id";
        $db->query($sql, $params);

        // If amount changed, update ledger balance and recalculate subsequent transactions
        if ($newAmount !== null) {
            $amountDiff = $newAmount - $oldAmount;

            // Update ledger balance
            $db->query("UPDATE trust_ledger SET current_balance = current_balance + :diff WHERE id = :ledger_id",
                ['diff' => $amountDiff, 'ledger_id' => $existing['ledger_id']]);

            // Recalculate running balances for subsequent transactions
            recalculateRunningBalances($db, $existing['ledger_id'], $existing['transaction_date'], $transId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?: $existing['user_id'],
            'action' => 'update',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transId,
            'client_id' => $existing['client_id'],
            'old_values' => json_encode($existing),
            'new_values' => json_encode($input),
            'description' => "Transaction #$transId updated",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        $transaction = $db->fetch("SELECT * FROM trust_transactions WHERE id = :id", ['id' => $transId]);
        successResponse(['transaction' => $transaction], 'Transaction updated successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to update transaction: ' . $e->getMessage());
    }
}

function handleDelete(Database $db, PDO $pdo): void {
    $transId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$transId) {
        errorResponse('Transaction ID is required');
    }

    // Get existing transaction
    $existing = $db->fetch("SELECT t.*, l.client_id
                            FROM trust_transactions t
                            JOIN trust_ledger l ON t.ledger_id = l.id
                            WHERE t.id = :id", ['id' => $transId]);

    if (!$existing) {
        errorResponse('Transaction not found', 404);
    }

    // Check user ownership
    if ($userId && $existing['user_id'] != $userId) {
        errorResponse('Unauthorized', 403);
    }

    $pdo->beginTransaction();

    try {
        $amount = (float)$existing['amount'];
        $ledgerId = $existing['ledger_id'];

        // Reverse the amount from ledger balance
        $db->query("UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :ledger_id",
            ['amount' => $amount, 'ledger_id' => $ledgerId]);

        // Delete the transaction
        $db->query("DELETE FROM trust_transactions WHERE id = :id", ['id' => $transId]);

        // Recalculate running balances for subsequent transactions
        recalculateRunningBalances($db, $ledgerId, $existing['transaction_date'], $transId);

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?: $existing['user_id'],
            'action' => 'delete',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transId,
            'client_id' => $existing['client_id'],
            'old_values' => json_encode($existing),
            'description' => "Transaction #$transId deleted, Amount: $amount",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse(null, 'Transaction deleted successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to delete transaction: ' . $e->getMessage());
    }
}

/**
 * Reassign transactions to a different client
 */
function handleReassign(Database $db, PDO $pdo, array $input): void {
    $transactionIds = $input['transaction_ids'] ?? [];
    $targetClientId = !empty($input['target_client_id']) ? (int)$input['target_client_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (empty($transactionIds) || !is_array($transactionIds)) {
        errorResponse('transaction_ids array is required');
    }

    if (!$targetClientId) {
        errorResponse('target_client_id is required');
    }

    // Get target client's ledger (create one if it doesn't exist)
    $targetLedger = $db->fetch(
        "SELECT id FROM trust_ledger WHERE client_id = :client_id AND user_id = :user_id LIMIT 1",
        ['client_id' => $targetClientId, 'user_id' => $userId]
    );

    if (!$targetLedger) {
        // Get default IOLTA account
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1",
            ['user_id' => $userId]
        );

        if (!$account) {
            errorResponse('No IOLTA account found');
        }

        // Create ledger for target client
        $targetLedgerId = $db->insert('trust_ledger', [
            'user_id' => $userId,
            'client_id' => $targetClientId,
            'account_id' => $account['id'],
            'current_balance' => 0,
            'is_active' => 1
        ]);
    } else {
        $targetLedgerId = $targetLedger['id'];
    }

    $pdo->beginTransaction();

    try {
        $movedCount = 0;
        $affectedLedgers = [];

        foreach ($transactionIds as $txId) {
            $txId = (int)$txId;

            // Get transaction details
            $tx = $db->fetch(
                "SELECT t.*, l.client_id as source_client_id
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 WHERE t.id = :id AND t.user_id = :user_id",
                ['id' => $txId, 'user_id' => $userId]
            );

            if (!$tx) continue;

            $sourceLedgerId = $tx['ledger_id'];
            $amount = (float)$tx['amount'];

            // Skip if already in target ledger
            if ($sourceLedgerId == $targetLedgerId) continue;

            // Track affected ledgers for balance recalculation
            $affectedLedgers[$sourceLedgerId] = true;
            $affectedLedgers[$targetLedgerId] = true;

            // Update source ledger balance (subtract)
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $sourceLedgerId]
            );

            // Update target ledger balance (add)
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance + :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $targetLedgerId]
            );

            // Move transaction to target ledger
            $db->query(
                "UPDATE trust_transactions SET ledger_id = :ledger_id WHERE id = :id",
                ['ledger_id' => $targetLedgerId, 'id' => $txId]
            );

            $movedCount++;
        }

        // Recalculate running balances for all affected ledgers
        foreach (array_keys($affectedLedgers) as $ledgerId) {
            recalculateLedgerRunningBalances($db, $ledgerId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'reassign',
            'entity_type' => 'trust_transactions',
            'client_id' => $targetClientId,
            'new_values' => json_encode([
                'transaction_ids' => $transactionIds,
                'target_client_id' => $targetClientId,
                'moved_count' => $movedCount
            ]),
            'description' => "Reassigned $movedCount transactions to client #$targetClientId",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'moved_count' => $movedCount,
            'target_ledger_id' => $targetLedgerId
        ], "$movedCount transaction(s) reassigned successfully");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to reassign transactions: ' . $e->getMessage());
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
 * Recalculate running balances for transactions after a given date
 */
function recalculateRunningBalances(Database $db, int $ledgerId, string $fromDate, int $excludeId = 0): void {
    // Get ledger's starting balance before the affected transaction
    $priorBalance = $db->fetch(
        "SELECT running_balance FROM trust_transactions
         WHERE ledger_id = :ledger_id AND (transaction_date < :date OR (transaction_date = :date2 AND id < :id))
         ORDER BY transaction_date DESC, id DESC LIMIT 1",
        ['ledger_id' => $ledgerId, 'date' => $fromDate, 'date2' => $fromDate, 'id' => $excludeId]
    );

    $runningBalance = $priorBalance ? (float)$priorBalance['running_balance'] : 0;

    // Get all transactions from that date forward
    $transactions = $db->fetchAll(
        "SELECT id, amount FROM trust_transactions
         WHERE ledger_id = :ledger_id AND (transaction_date > :date OR (transaction_date = :date2 AND id > :id))
         ORDER BY transaction_date ASC, id ASC",
        ['ledger_id' => $ledgerId, 'date' => $fromDate, 'date2' => $fromDate, 'id' => $excludeId]
    );

    foreach ($transactions as $trans) {
        $runningBalance += (float)$trans['amount'];
        $db->query("UPDATE trust_transactions SET running_balance = :balance WHERE id = :id",
            ['balance' => $runningBalance, 'id' => $trans['id']]);
    }
}

/**
 * Move transactions to a different client (via POST action)
 */
function handleMoveToClient(Database $db, PDO $pdo, array $input): void {
    $transactionIds = $input['transaction_ids'] ?? [];
    $targetClientId = !empty($input['target_client_id']) ? (int)$input['target_client_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (empty($transactionIds) || !is_array($transactionIds)) {
        errorResponse('transaction_ids array is required');
    }

    if (!$targetClientId) {
        errorResponse('target_client_id is required');
    }

    if (!$userId) {
        errorResponse('user_id is required');
    }

    // Get target client's ledger (create one if it doesn't exist)
    $targetLedger = $db->fetch(
        "SELECT id FROM trust_ledger WHERE client_id = :client_id AND user_id = :user_id LIMIT 1",
        ['client_id' => $targetClientId, 'user_id' => $userId]
    );

    if (!$targetLedger) {
        // Get default IOLTA account
        $account = $db->fetch(
            "SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1",
            ['user_id' => $userId]
        );

        if (!$account) {
            errorResponse('No IOLTA account found');
        }

        // Create ledger for target client
        $targetLedgerId = $db->insert('trust_ledger', [
            'user_id' => $userId,
            'client_id' => $targetClientId,
            'account_id' => $account['id'],
            'current_balance' => 0,
            'is_active' => 1
        ]);
    } else {
        $targetLedgerId = $targetLedger['id'];
    }

    $pdo->beginTransaction();

    try {
        $movedCount = 0;
        $affectedLedgers = [];

        foreach ($transactionIds as $txId) {
            $txId = (int)$txId;

            // Get transaction details
            $tx = $db->fetch(
                "SELECT t.*, l.client_id as source_client_id
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 WHERE t.id = :id AND t.user_id = :user_id",
                ['id' => $txId, 'user_id' => $userId]
            );

            if (!$tx) continue;

            $sourceLedgerId = $tx['ledger_id'];
            $amount = (float)$tx['amount'];

            // Skip if already in target ledger
            if ($sourceLedgerId == $targetLedgerId) continue;

            // Track affected ledgers for balance recalculation
            $affectedLedgers[$sourceLedgerId] = true;
            $affectedLedgers[$targetLedgerId] = true;

            // Update source ledger balance (subtract)
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $sourceLedgerId]
            );

            // Update target ledger balance (add)
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance + :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $targetLedgerId]
            );

            // Move transaction to target ledger
            $db->query(
                "UPDATE trust_transactions SET ledger_id = :ledger_id WHERE id = :id",
                ['ledger_id' => $targetLedgerId, 'id' => $txId]
            );

            $movedCount++;
        }

        // Recalculate running balances for all affected ledgers
        foreach (array_keys($affectedLedgers) as $ledgerId) {
            recalculateLedgerRunningBalances($db, $ledgerId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'ledger_updated',
            'entity_type' => 'trust_transactions',
            'entity_id' => 0,
            'client_id' => $targetClientId,
            'new_values' => json_encode([
                'transaction_ids' => $transactionIds,
                'target_client_id' => $targetClientId,
                'moved_count' => $movedCount
            ]),
            'description' => "Moved $movedCount transactions to client #$targetClientId",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'moved' => $movedCount,
            'target_ledger_id' => $targetLedgerId
        ], "$movedCount transaction(s) moved successfully");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to move transactions: ' . $e->getMessage());
    }
}

/**
 * Update a transaction (via POST action)
 */
function handleUpdateAction(Database $db, PDO $pdo, array $input): void {
    // Debug log
    error_log('handleUpdateAction input: ' . json_encode($input));

    if (empty($input['id'])) {
        errorResponse('Transaction ID is required');
    }

    $transId = (int)$input['id'];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    // Get existing transaction
    $existing = $db->fetch(
        "SELECT t.*, l.current_balance as ledger_balance, l.client_id
         FROM trust_transactions t
         JOIN trust_ledger l ON t.ledger_id = l.id
         WHERE t.id = :id",
        ['id' => $transId]
    );

    error_log('handleUpdateAction existing: ' . json_encode($existing));

    if (!$existing) {
        errorResponse('Transaction not found', 404);
    }

    // Skip ownership check - trust transactions may have different user_id
    // if ($userId && $existing['user_id'] != $userId) {
    //     errorResponse('Unauthorized', 403);
    // }

    $pdo->beginTransaction();

    try {
        $oldAmount = (float)$existing['amount'];
        $updates = [];
        $params = ['id' => $transId];

        // Allowed update fields
        $allowedFields = ['transaction_date', 'description', 'memo', 'reference_number', 'check_number', 'payee'];

        foreach ($allowedFields as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }

        // Handle amount change - recalculate balance
        $newAmount = null;
        if (isset($input['amount'])) {
            $newAmount = (float)$input['amount'];
            $type = $existing['transaction_type'];
            $isCredit = in_array($type, ['deposit', 'transfer_in', 'refund', 'interest']);

            // Apply sign based on transaction type
            if (!$isCredit) {
                $newAmount = -abs($newAmount);
            } else {
                $newAmount = abs($newAmount);
            }

            // Calculate balance adjustment
            $amountDiff = $newAmount - $oldAmount;
            $newBalance = (float)$existing['running_balance'] + $amountDiff;

            // Only check ledger balance when INCREASING a withdrawal (more negative)
            if ($amountDiff < 0) {
                $newLedgerBalance = (float)$existing['ledger_balance'] + $amountDiff;
                if ($newLedgerBalance < 0) {
                    $pdo->rollBack();
                    errorResponse('Update would result in negative ledger balance');
                }
            }

            $updates[] = "amount = :amount";
            $params['amount'] = $newAmount;
            $updates[] = "running_balance = :running_balance";
            $params['running_balance'] = $newBalance;
        }

        if (empty($updates)) {
            $pdo->rollBack();
            errorResponse('No fields to update');
        }

        $sql = "UPDATE trust_transactions SET " . implode(', ', $updates) . " WHERE id = :id";
        $db->query($sql, $params);

        // If amount changed, update ledger balance and recalculate subsequent transactions
        if ($newAmount !== null) {
            $amountDiff = $newAmount - $oldAmount;

            // Update ledger balance
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance + :diff WHERE id = :ledger_id",
                ['diff' => $amountDiff, 'ledger_id' => $existing['ledger_id']]
            );

            // Recalculate running balances for subsequent transactions
            recalculateRunningBalances($db, $existing['ledger_id'], $existing['transaction_date'], $transId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?: $existing['user_id'],
            'action' => 'ledger_updated',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transId,
            'client_id' => $existing['client_id'],
            'old_values' => json_encode($existing),
            'new_values' => json_encode($input),
            'description' => "Transaction #$transId updated",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        $transaction = $db->fetch("SELECT * FROM trust_transactions WHERE id = :id", ['id' => $transId]);
        successResponse(['transaction' => $transaction], 'Transaction updated successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to update transaction: ' . $e->getMessage());
    }
}

/**
 * Bulk delete transactions (via POST action)
 */
function handleBulkDelete(Database $db, PDO $pdo, array $input): void {
    $transactionIds = $input['transaction_ids'] ?? [];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (empty($transactionIds) || !is_array($transactionIds)) {
        errorResponse('transaction_ids array is required');
    }

    if (!$userId) {
        errorResponse('user_id is required');
    }

    $pdo->beginTransaction();

    try {
        $deletedCount = 0;
        $affectedLedgers = [];

        foreach ($transactionIds as $txId) {
            $txId = (int)$txId;

            // Get transaction details
            $tx = $db->fetch(
                "SELECT t.*, l.client_id
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 WHERE t.id = :id AND t.user_id = :user_id",
                ['id' => $txId, 'user_id' => $userId]
            );

            if (!$tx) continue;

            $ledgerId = $tx['ledger_id'];
            $amount = (float)$tx['amount'];

            // Track affected ledgers
            $affectedLedgers[$ledgerId] = true;

            // Update ledger balance (reverse the amount)
            $db->query(
                "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id",
                ['amount' => $amount, 'id' => $ledgerId]
            );

            // Delete the transaction
            $db->query("DELETE FROM trust_transactions WHERE id = :id", ['id' => $txId]);

            $deletedCount++;
        }

        // Recalculate running balances for all affected ledgers
        foreach (array_keys($affectedLedgers) as $ledgerId) {
            recalculateLedgerRunningBalances($db, $ledgerId);
        }

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'ledger_updated',
            'entity_type' => 'trust_transactions',
            'entity_id' => 0,
            'new_values' => json_encode([
                'transaction_ids' => $transactionIds,
                'deleted_count' => $deletedCount
            ]),
            'description' => "Deleted $deletedCount transactions",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'deleted' => $deletedCount
        ], "$deletedCount transaction(s) deleted successfully");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to delete transactions: ' . $e->getMessage());
    }
}
