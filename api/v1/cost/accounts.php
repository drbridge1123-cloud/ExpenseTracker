<?php
/**
 * Cost Accounts API
 * Manage credit cards and bank accounts for cost tracking
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

// Map account type from frontend to database enum values
function mapAccountType($type) {
    $map = [
        'Credit Card' => 'credit_card',
        'Checking' => 'checking',
        'Savings' => 'savings',
        'Cash' => 'cash',
        'Other' => 'other'
    ];
    return $map[$type] ?? 'other';
}

// Map account type from database to display values
function mapAccountTypeDisplay($type) {
    $map = [
        'credit_card' => 'Credit Card',
        'checking' => 'Checking',
        'savings' => 'Savings',
        'cash' => 'Cash',
        'other' => 'Other'
    ];
    return $map[$type] ?? 'Other';
}

function handleGet($db) {
    $userId = $_GET['user_id'] ?? null;
    $accountId = $_GET['id'] ?? null;

    if (!$userId) {
        jsonResponse(['success' => false, 'message' => 'user_id is required'], 400);
    }

    if ($accountId) {
        // Get single account with calculated balance (sum of all transactions only)
        $account = $db->fetch(
            "SELECT ca.id, ca.user_id, ca.account_name, ca.account_type,
                    ca.account_number_last4 as account_number,
                    COALESCE((SELECT SUM(ct.amount)
                              FROM cost_transactions ct
                              WHERE ct.account_id = ca.id), 0) as balance,
                    ca.is_active, ca.color, ca.created_at, ca.updated_at
             FROM cost_accounts ca WHERE ca.id = :id AND ca.user_id = :user_id",
            ['id' => $accountId, 'user_id' => $userId]
        );

        if ($account) {
            $account['account_type'] = mapAccountTypeDisplay($account['account_type']);
            jsonResponse(['success' => true, 'data' => $account]);
        } else {
            jsonResponse(['success' => false, 'message' => 'Account not found'], 404);
        }
    } else {
        // Get all accounts with this month stats and calculated balance from transactions
        $accounts = $db->fetchAll(
            "SELECT ca.id, ca.user_id, ca.account_name, ca.account_type,
                    ca.account_number_last4 as account_number,
                    COALESCE((SELECT SUM(ct.amount)
                              FROM cost_transactions ct
                              WHERE ct.account_id = ca.id), 0) as balance,
                    ca.is_active, ca.color, ca.created_at, ca.updated_at,
                    COALESCE((SELECT SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END)
                              FROM cost_transactions ct
                              WHERE ct.account_id = ca.id
                              AND MONTH(ct.transaction_date) = MONTH(CURRENT_DATE())
                              AND YEAR(ct.transaction_date) = YEAR(CURRENT_DATE())), 0) as this_month_income,
                    COALESCE((SELECT SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END)
                              FROM cost_transactions ct
                              WHERE ct.account_id = ca.id
                              AND MONTH(ct.transaction_date) = MONTH(CURRENT_DATE())
                              AND YEAR(ct.transaction_date) = YEAR(CURRENT_DATE())), 0) as this_month_expenses
             FROM cost_accounts ca
             WHERE ca.user_id = :user_id AND ca.is_active = 1
             ORDER BY FIELD(ca.account_type, 'checking', 'savings', 'credit_card', 'cash', 'other'), ca.account_name",
            ['user_id' => $userId]
        );

        // Map account types to display values
        if ($accounts) {
            foreach ($accounts as &$account) {
                $account['account_type'] = mapAccountTypeDisplay($account['account_type']);
            }
        }

        jsonResponse(['success' => true, 'data' => ['accounts' => $accounts ?: []]]);
    }
}

function handlePost($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = $input['user_id'] ?? null;
    $accountName = $input['account_name'] ?? null;
    $accountType = $input['account_type'] ?? 'Credit Card';
    $accountNumber = $input['account_number'] ?? null;
    $balance = $input['balance'] ?? 0;
    $color = $input['color'] ?? '#059669';

    if (!$userId || !$accountName) {
        jsonResponse(['success' => false, 'message' => 'user_id and account_name are required'], 400);
    }

    $id = $db->insert('cost_accounts', [
        'user_id' => $userId,
        'account_name' => $accountName,
        'account_type' => mapAccountType($accountType),
        'account_number_last4' => $accountNumber ? substr($accountNumber, -4) : null,
        'current_balance' => $balance,
        'color' => $color
    ]);

    jsonResponse(['success' => true, 'data' => ['id' => $id], 'message' => 'Account created successfully']);
}

function handlePut($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $userId = $input['user_id'] ?? null;

    if (!$id || !$userId) {
        jsonResponse(['success' => false, 'message' => 'id and user_id are required'], 400);
    }

    // Verify ownership
    $account = $db->fetch(
        "SELECT * FROM cost_accounts WHERE id = :id AND user_id = :user_id",
        ['id' => $id, 'user_id' => $userId]
    );

    if (!$account) {
        jsonResponse(['success' => false, 'message' => 'Account not found'], 404);
    }

    $updateData = [];
    if (isset($input['account_name'])) $updateData['account_name'] = $input['account_name'];
    if (isset($input['account_type'])) $updateData['account_type'] = mapAccountType($input['account_type']);
    if (isset($input['account_number'])) $updateData['account_number_last4'] = $input['account_number'] ? substr($input['account_number'], -4) : null;
    if (isset($input['balance'])) $updateData['current_balance'] = $input['balance'];
    if (isset($input['color'])) $updateData['color'] = $input['color'];

    if (!empty($updateData)) {
        $db->update('cost_accounts', $updateData, 'id = :id', ['id' => $id]);
    }

    jsonResponse(['success' => true, 'message' => 'Account updated successfully']);
}

function handleDelete($db) {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? $_GET['id'] ?? null;
    $userId = $input['user_id'] ?? $_GET['user_id'] ?? null;

    if (!$id || !$userId) {
        jsonResponse(['success' => false, 'message' => 'id and user_id are required'], 400);
    }

    // Verify ownership
    $account = $db->fetch(
        "SELECT * FROM cost_accounts WHERE id = :id AND user_id = :user_id",
        ['id' => $id, 'user_id' => $userId]
    );

    if (!$account) {
        jsonResponse(['success' => false, 'message' => 'Account not found'], 404);
    }

    // Soft delete
    $db->update('cost_accounts', ['is_active' => 0], 'id = :id', ['id' => $id]);

    jsonResponse(['success' => true, 'message' => 'Account deleted successfully']);
}


