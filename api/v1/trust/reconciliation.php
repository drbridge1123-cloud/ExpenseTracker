<?php
/**
 * Trust Reconciliation API
 * Manages IOLTA 3-way reconciliation records
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
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $limit = !empty($_GET['limit']) ? min((int)$_GET['limit'], 100) : 20;

    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'r.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($accountId) {
        $where[] = 'r.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT r.*, a.account_name
            FROM trust_reconciliations r
            LEFT JOIN accounts a ON r.account_id = a.id
            WHERE $whereClause
            ORDER BY r.statement_date DESC, r.created_at DESC
            LIMIT $limit";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $reconciliations = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($reconciliations as &$rec) {
        $rec['statement_balance'] = (float)$rec['statement_balance'];
        $rec['book_balance'] = (float)$rec['book_balance'];
        $rec['ledger_total'] = (float)$rec['ledger_total'];
    }

    successResponse([
        'reconciliations' => $reconciliations
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $required = ['user_id', 'account_id', 'statement_date', 'statement_balance'];
    foreach ($required as $field) {
        if (!isset($input[$field])) {
            errorResponse("Field '$field' is required");
        }
    }

    $data = [
        'user_id' => (int)$input['user_id'],
        'account_id' => (int)$input['account_id'],
        'statement_date' => $input['statement_date'],
        'statement_balance' => (float)$input['statement_balance'],
        'book_balance' => (float)($input['book_balance'] ?? 0),
        'ledger_total' => (float)($input['ledger_total'] ?? 0),
        'difference' => (float)$input['statement_balance'] - (float)($input['ledger_total'] ?? 0),
        'status' => $input['status'] ?? 'completed',
        'notes' => $input['notes'] ?? null
    ];

    try {
        $id = $db->insert('trust_reconciliations', $data);

        // Log the reconciliation
        $db->insert('trust_audit_log', [
            'user_id' => $input['user_id'],
            'action' => 'reconciliation_completed',
            'entity_type' => 'trust_reconciliations',
            'entity_id' => $id,
            'description' => "3-way reconciliation completed for account {$input['account_id']}",
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);

        successResponse([
            'id' => $id,
            'message' => 'Reconciliation saved successfully'
        ]);
    } catch (Exception $e) {
        errorResponse('Error saving reconciliation: ' . $e->getMessage());
    }
}
