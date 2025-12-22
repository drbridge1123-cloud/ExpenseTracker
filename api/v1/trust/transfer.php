<?php
/**
 * Trust Transfer API
 * Handles transfers between client ledgers and to operating accounts
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$transferType = $input['transfer_type'] ?? null;

switch ($transferType) {
    case 'client_to_client':
        handleClientToClient($db, $pdo, $input);
        break;
    case 'earned_fee':
        handleEarnedFee($db, $pdo, $input);
        break;
    default:
        errorResponse('Invalid transfer type. Use: client_to_client or earned_fee');
}

/**
 * Transfer funds between two client ledgers
 */
function handleClientToClient(Database $db, PDO $pdo, array $input): void {
    $required = ['user_id', 'from_ledger_id', 'to_ledger_id', 'amount', 'description', 'transaction_date'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || ($field !== 'amount' && empty($input[$field]))) {
            errorResponse("Field '$field' is required");
        }
    }

    $fromLedgerId = (int)$input['from_ledger_id'];
    $toLedgerId = (int)$input['to_ledger_id'];
    $amount = abs((float)$input['amount']);

    if ($fromLedgerId === $toLedgerId) {
        errorResponse('Cannot transfer to the same ledger');
    }

    if ($amount <= 0) {
        errorResponse('Amount must be greater than 0');
    }

    // Get both ledgers
    $fromLedger = $db->fetch("SELECT l.*, c.client_name FROM trust_ledger l
                              JOIN trust_clients c ON l.client_id = c.id
                              WHERE l.id = :id", ['id' => $fromLedgerId]);
    $toLedger = $db->fetch("SELECT l.*, c.client_name FROM trust_ledger l
                            JOIN trust_clients c ON l.client_id = c.id
                            WHERE l.id = :id", ['id' => $toLedgerId]);

    if (!$fromLedger || !$toLedger) {
        errorResponse('One or both ledgers not found', 404);
    }

    if (!$fromLedger['is_active'] || !$toLedger['is_active']) {
        errorResponse('Cannot transfer to/from closed ledger');
    }

    // Check sufficient funds
    if ((float)$fromLedger['current_balance'] < $amount) {
        errorResponse('Insufficient funds in source ledger');
    }

    $pdo->beginTransaction();

    try {
        $newFromBalance = (float)$fromLedger['current_balance'] - $amount;
        $newToBalance = (float)$toLedger['current_balance'] + $amount;
        $date = $input['transaction_date'];
        $description = sanitize($input['description']);
        $userId = (int)$input['user_id'];

        // Create transfer_out transaction
        $fromTransData = [
            'user_id' => $userId,
            'ledger_id' => $fromLedgerId,
            'transaction_type' => 'transfer_out',
            'amount' => -$amount,
            'running_balance' => $newFromBalance,
            'description' => "Transfer to {$toLedger['client_name']}: $description",
            'transaction_date' => $date,
            'created_by' => $userId
        ];
        $fromTransId = $db->insert('trust_transactions', $fromTransData);

        // Create transfer_in transaction
        $toTransData = [
            'user_id' => $userId,
            'ledger_id' => $toLedgerId,
            'transaction_type' => 'transfer_in',
            'amount' => $amount,
            'running_balance' => $newToBalance,
            'description' => "Transfer from {$fromLedger['client_name']}: $description",
            'transaction_date' => $date,
            'related_transaction_id' => $fromTransId,
            'created_by' => $userId
        ];
        $toTransId = $db->insert('trust_transactions', $toTransData);

        // Link the transactions
        $db->update('trust_transactions', ['related_transaction_id' => $toTransId], 'id = :id', ['id' => $fromTransId]);

        // Update ledger balances
        $db->update('trust_ledger', ['current_balance' => $newFromBalance], 'id = :id', ['id' => $fromLedgerId]);
        $db->update('trust_ledger', ['current_balance' => $newToBalance], 'id = :id', ['id' => $toLedgerId]);

        // Audit logs
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'transfer',
            'entity_type' => 'trust_transactions',
            'entity_id' => $fromTransId,
            'client_id' => $fromLedger['client_id'],
            'description' => "Transfer $amount to {$toLedger['client_name']}",
            'ip_address' => getClientIp()
        ]);

        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'transfer',
            'entity_type' => 'trust_transactions',
            'entity_id' => $toTransId,
            'client_id' => $toLedger['client_id'],
            'description' => "Transfer $amount from {$fromLedger['client_name']}",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'from_transaction_id' => $fromTransId,
            'to_transaction_id' => $toTransId,
            'from_new_balance' => $newFromBalance,
            'to_new_balance' => $newToBalance
        ], 'Transfer completed successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Transfer failed: ' . $e->getMessage());
    }
}

/**
 * Transfer earned fees from trust to operating account
 */
function handleEarnedFee(Database $db, PDO $pdo, array $input): void {
    $required = ['user_id', 'ledger_id', 'amount', 'description', 'transaction_date'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || ($field !== 'amount' && empty($input[$field]))) {
            errorResponse("Field '$field' is required");
        }
    }

    $ledgerId = (int)$input['ledger_id'];
    $amount = abs((float)$input['amount']);

    if ($amount <= 0) {
        errorResponse('Amount must be greater than 0');
    }

    // Get ledger
    $ledger = $db->fetch("SELECT l.*, c.client_name, a.user_id as account_user_id
                          FROM trust_ledger l
                          JOIN trust_clients c ON l.client_id = c.id
                          JOIN accounts a ON l.account_id = a.id
                          WHERE l.id = :id", ['id' => $ledgerId]);

    if (!$ledger) {
        errorResponse('Ledger not found', 404);
    }

    if (!$ledger['is_active']) {
        errorResponse('Cannot withdraw from closed ledger');
    }

    // Check sufficient funds
    if ((float)$ledger['current_balance'] < $amount) {
        errorResponse('Insufficient funds in ledger');
    }

    $pdo->beginTransaction();

    try {
        $newBalance = (float)$ledger['current_balance'] - $amount;
        $date = $input['transaction_date'];
        $description = sanitize($input['description']);
        $userId = (int)$input['user_id'];

        // Create earned_fee transaction
        $transData = [
            'user_id' => $userId,
            'ledger_id' => $ledgerId,
            'transaction_type' => 'earned_fee',
            'amount' => -$amount,
            'running_balance' => $newBalance,
            'description' => "Earned fee withdrawal: $description",
            'reference_number' => $input['reference_number'] ?? null,
            'transaction_date' => $date,
            'created_by' => $userId
        ];
        $transId = $db->insert('trust_transactions', $transData);

        // Update ledger balance
        $db->update('trust_ledger', ['current_balance' => $newBalance], 'id = :id', ['id' => $ledgerId]);

        // Audit log
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'fee_withdrawal',
            'entity_type' => 'trust_transactions',
            'entity_id' => $transId,
            'client_id' => $ledger['client_id'],
            'description' => "Earned fee: $amount from {$ledger['client_name']}",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'transaction_id' => $transId,
            'new_balance' => $newBalance,
            'amount_withdrawn' => $amount
        ], 'Earned fee withdrawal completed');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Withdrawal failed: ' . $e->getMessage());
    }
}
