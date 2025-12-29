<?php
/**
 * Cost Transactions API
 * Manage cost transactions (deposits and disbursements)
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$db = Database::getInstance();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGet($db);
        break;
    case 'POST':
        handlePost($db);
        break;
    case 'PUT':
        handlePut($db);
        break;
    case 'DELETE':
        handleDelete($db);
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

function handleGet($db) {
    $userId = $_GET['user_id'] ?? null;
    $clientId = $_GET['client_id'] ?? null;
    $accountId = $_GET['account_id'] ?? null;
    $limit = $_GET['limit'] ?? 100;

    if (!$userId) {
        jsonResponse(['success' => false, 'message' => 'user_id is required'], 400);
    }

    $params = ['user_id' => $userId];
    $whereConditions = ['ct.user_id = :user_id'];

    if ($clientId) {
        $whereConditions[] = 'ct.client_id = :client_id';
        $params['client_id'] = $clientId;
    }

    if ($accountId) {
        $whereConditions[] = 'ct.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    $whereClause = implode(' AND ', $whereConditions);

    // Handle limit - 'all' means no limit
    $limitClause = '';
    if ($limit !== 'all' && $limit !== null) {
        $limitClause = ' LIMIT ' . intval($limit);
    }

    $transactions = $db->fetchAll(
        "SELECT ct.*,
                ca.account_name,
                tc.client_name, tc.case_number
         FROM cost_transactions ct
         LEFT JOIN cost_accounts ca ON ct.account_id = ca.id
         LEFT JOIN trust_clients tc ON ct.client_id = tc.id
         WHERE {$whereClause}
         ORDER BY ct.transaction_date DESC, ct.id DESC" . $limitClause,
        $params
    );

    jsonResponse(['success' => true, 'data' => ['transactions' => $transactions ?: []]]);
}

function handlePost($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = $input['user_id'] ?? null;
    $clientId = $input['client_id'] ?? null;
    $transactionType = $input['transaction_type'] ?? 'debit';
    $transactionDate = $input['transaction_date'] ?? date('Y-m-d');
    $amount = $input['amount'] ?? 0;
    $description = $input['description'] ?? '';
    $payee = $input['payee'] ?? null;
    $referenceNumber = $input['reference_number'] ?? null;
    $accountId = $input['account_id'] ?? null;
    $category = $input['category'] ?? null;

    if (!$userId || !$clientId) {
        jsonResponse(['success' => false, 'message' => 'user_id and client_id are required'], 400);
    }

    // Get default account if not specified
    if (!$accountId) {
        $defaultAccount = $db->fetch(
            "SELECT id FROM cost_accounts WHERE user_id = :user_id AND is_active = 1 ORDER BY id LIMIT 1",
            ['user_id' => $userId]
        );
        $accountId = $defaultAccount ? $defaultAccount['id'] : null;
    }

    if (!$accountId) {
        jsonResponse(['success' => false, 'message' => 'No cost account found. Please create an account first.'], 400);
    }

    // Map transaction type to database enum
    $dbTransactionType = 'debit';
    if ($transactionType === 'deposit' || $amount > 0) {
        $dbTransactionType = 'credit';
    }

    // Build description with payee if provided
    $fullDescription = $description;
    if ($payee && $transactionType === 'disbursement') {
        $fullDescription = $payee . ' - ' . $description;
    }

    $id = $db->insert('cost_transactions', [
        'user_id' => $userId,
        'account_id' => $accountId,
        'client_id' => $clientId,
        'transaction_date' => $transactionDate,
        'description' => $fullDescription,
        'vendor_name' => $payee,
        'amount' => $amount,
        'transaction_type' => $dbTransactionType,
        'reference_number' => $referenceNumber,
        'category' => $category,
        'status' => 'pending'
    ]);

    // Update account balance
    $db->query(
        "UPDATE cost_accounts SET current_balance = current_balance + :amount WHERE id = :account_id",
        ['amount' => $amount, 'account_id' => $accountId]
    );

    jsonResponse([
        'success' => true,
        'data' => ['id' => $id],
        'message' => ($transactionType === 'deposit' ? 'Deposit' : 'Disbursement') . ' recorded successfully'
    ]);
}

function handlePut($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $userId = $input['user_id'] ?? null;

    if (!$id || !$userId) {
        jsonResponse(['success' => false, 'message' => 'id and user_id are required'], 400);
    }

    // Verify ownership
    $transaction = $db->fetch(
        "SELECT * FROM cost_transactions WHERE id = :id AND user_id = :user_id",
        ['id' => $id, 'user_id' => $userId]
    );

    if (!$transaction) {
        jsonResponse(['success' => false, 'message' => 'Transaction not found'], 404);
    }

    $updateData = [];
    if (isset($input['transaction_date'])) $updateData['transaction_date'] = $input['transaction_date'];
    if (isset($input['description'])) $updateData['description'] = $input['description'];
    if (isset($input['reference_number'])) $updateData['reference_number'] = $input['reference_number'];
    if (isset($input['status'])) $updateData['status'] = $input['status'];
    if (isset($input['category'])) $updateData['category'] = $input['category'];

    // Handle amount change - adjust account balance
    if (isset($input['amount']) && $input['amount'] != $transaction['amount']) {
        $difference = $input['amount'] - $transaction['amount'];
        $db->query(
            "UPDATE cost_accounts SET current_balance = current_balance + :diff WHERE id = :account_id",
            ['diff' => $difference, 'account_id' => $transaction['account_id']]
        );
        $updateData['amount'] = $input['amount'];
    }

    if (!empty($updateData)) {
        $db->update('cost_transactions', $updateData, 'id = :id', ['id' => $id]);
    }

    jsonResponse(['success' => true, 'message' => 'Transaction updated successfully']);
}

function handleDelete($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? $_GET['id'] ?? null;
    $userId = $input['user_id'] ?? $_GET['user_id'] ?? null;

    if (!$id || !$userId) {
        jsonResponse(['success' => false, 'message' => 'id and user_id are required'], 400);
    }

    // Verify ownership and get transaction details
    $transaction = $db->fetch(
        "SELECT * FROM cost_transactions WHERE id = :id AND user_id = :user_id",
        ['id' => $id, 'user_id' => $userId]
    );

    if (!$transaction) {
        jsonResponse(['success' => false, 'message' => 'Transaction not found'], 404);
    }

    // Reverse the account balance
    $db->query(
        "UPDATE cost_accounts SET current_balance = current_balance - :amount WHERE id = :account_id",
        ['amount' => $transaction['amount'], 'account_id' => $transaction['account_id']]
    );

    // Delete the transaction
    $db->delete('cost_transactions', 'id = :id', ['id' => $id]);

    jsonResponse(['success' => true, 'message' => 'Transaction deleted successfully']);
}
