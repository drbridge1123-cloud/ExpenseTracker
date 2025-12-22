<?php
/**
 * Trust Ledger API
 * Manages client sub-ledgers within IOLTA accounts
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
        handlePut($db);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $clientId = !empty($_GET['client_id']) ? (int)$_GET['client_id'] : null;
    $ledgerId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $includeInactive = isset($_GET['include_inactive']) && $_GET['include_inactive'] === '1';

    if ($ledgerId) {
        // Get single ledger with recent transactions
        $sql = "SELECT
                    l.*,
                    c.client_name, c.client_number, c.matter_number, c.matter_description,
                    a.account_name, a.account_number_last4
                FROM trust_ledger l
                JOIN trust_clients c ON l.client_id = c.id
                JOIN accounts a ON l.account_id = a.id
                WHERE l.id = :id";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $ledgerId]);
        $ledger = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ledger) {
            errorResponse('Ledger not found', 404);
        }

        // Get recent transactions
        $transSql = "SELECT * FROM trust_transactions
                     WHERE ledger_id = :ledger_id
                     ORDER BY transaction_date DESC, id DESC
                     LIMIT 50";
        $transStmt = $pdo->prepare($transSql);
        $transStmt->execute(['ledger_id' => $ledgerId]);
        $ledger['transactions'] = $transStmt->fetchAll(PDO::FETCH_ASSOC);

        $ledger['current_balance'] = (float)$ledger['current_balance'];

        successResponse(['ledger' => $ledger]);
    }

    // List ledgers
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'l.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($accountId) {
        $where[] = 'l.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    if ($clientId) {
        $where[] = 'l.client_id = :client_id';
        $params['client_id'] = $clientId;
    }

    if (!$includeInactive) {
        $where[] = 'l.is_active = 1';
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT
                l.*,
                c.client_name, c.client_number, c.matter_number,
                a.account_name, a.account_number_last4,
                (SELECT COUNT(*) FROM trust_transactions WHERE ledger_id = l.id) as transaction_count,
                (SELECT MAX(transaction_date) FROM trust_transactions WHERE ledger_id = l.id) as last_activity
            FROM trust_ledger l
            JOIN trust_clients c ON l.client_id = c.id
            JOIN accounts a ON l.account_id = a.id
            WHERE $whereClause
            ORDER BY c.client_name, a.account_name";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $ledgers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate totals
    $totalBalance = 0;
    foreach ($ledgers as &$ledger) {
        $ledger['current_balance'] = (float)$ledger['current_balance'];
        $ledger['transaction_count'] = (int)$ledger['transaction_count'];
        $totalBalance += $ledger['current_balance'];
    }

    successResponse([
        'ledgers' => $ledgers,
        'total_count' => count($ledgers),
        'total_balance' => $totalBalance
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $required = ['user_id', 'account_id', 'client_id'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            errorResponse("Field '$field' is required");
        }
    }

    // Verify account is IOLTA/Trust type
    $account = $db->fetch("SELECT * FROM accounts WHERE id = :id", ['id' => $input['account_id']]);
    if (!$account) {
        errorResponse('Account not found', 404);
    }
    if (!in_array($account['account_type'], ['iolta', 'trust'])) {
        errorResponse('Account must be an IOLTA or Trust account');
    }

    // Verify client exists
    if (!$db->exists('trust_clients', 'id = :id', ['id' => $input['client_id']])) {
        errorResponse('Client not found', 404);
    }

    // Check for existing ledger
    if ($db->exists('trust_ledger', 'account_id = :account_id AND client_id = :client_id', [
        'account_id' => $input['account_id'],
        'client_id' => $input['client_id']
    ])) {
        errorResponse('Ledger already exists for this client in this account');
    }

    $ledgerData = [
        'user_id' => (int)$input['user_id'],
        'account_id' => (int)$input['account_id'],
        'client_id' => (int)$input['client_id'],
        'current_balance' => 0.00,
        'minimum_balance' => (float)($input['minimum_balance'] ?? 0),
        'is_active' => 1,
        'opened_at' => date('Y-m-d')
    ];

    $ledgerId = $db->insert('trust_ledger', $ledgerData);

    // Audit log
    $db->insert('trust_audit_log', [
        'user_id' => $input['user_id'],
        'action' => 'ledger_created',
        'entity_type' => 'trust_ledger',
        'entity_id' => $ledgerId,
        'client_id' => $input['client_id'],
        'new_values' => json_encode($ledgerData),
        'ip_address' => getClientIp()
    ]);

    $ledger = $db->fetch("SELECT l.*, c.client_name, a.account_name
                          FROM trust_ledger l
                          JOIN trust_clients c ON l.client_id = c.id
                          JOIN accounts a ON l.account_id = a.id
                          WHERE l.id = :id", ['id' => $ledgerId]);

    successResponse(['ledger' => $ledger], 'Ledger created successfully');
}

function handlePut(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['id'])) {
        errorResponse('Ledger ID is required');
    }

    $ledgerId = (int)$input['id'];
    $existing = $db->fetch("SELECT * FROM trust_ledger WHERE id = :id", ['id' => $ledgerId]);

    if (!$existing) {
        errorResponse('Ledger not found', 404);
    }

    $updateData = [];
    $allowedFields = ['minimum_balance', 'is_active'];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $updateData[$field] = $input[$field];
        }
    }

    // If closing ledger, set closed_at
    if (isset($input['is_active']) && $input['is_active'] == 0) {
        if ((float)$existing['current_balance'] != 0) {
            errorResponse('Cannot close ledger with non-zero balance');
        }
        $updateData['closed_at'] = date('Y-m-d');
    }

    if (empty($updateData)) {
        errorResponse('No fields to update');
    }

    $db->update('trust_ledger', $updateData, 'id = :id', ['id' => $ledgerId]);

    // Audit log
    $action = isset($updateData['is_active']) && $updateData['is_active'] == 0 ? 'ledger_closed' : 'ledger_updated';
    $db->insert('trust_audit_log', [
        'user_id' => $existing['user_id'],
        'action' => $action,
        'entity_type' => 'trust_ledger',
        'entity_id' => $ledgerId,
        'client_id' => $existing['client_id'],
        'old_values' => json_encode($existing),
        'new_values' => json_encode($updateData),
        'ip_address' => getClientIp()
    ]);

    $ledger = $db->fetch("SELECT l.*, c.client_name, a.account_name
                          FROM trust_ledger l
                          JOIN trust_clients c ON l.client_id = c.id
                          JOIN accounts a ON l.account_id = a.id
                          WHERE l.id = :id", ['id' => $ledgerId]);

    successResponse(['ledger' => $ledger], 'Ledger updated successfully');
}
