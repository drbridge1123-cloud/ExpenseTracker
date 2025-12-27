<?php
/**
 * Trust Deposits API
 * Lists deposits from trust_transactions (transaction_type = 'deposit')
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
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $ledgerId = !empty($_GET['ledger_id']) ? (int)$_GET['ledger_id'] : null;
    $depositId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $all = !empty($_GET['all']);
    $limit = $all ? 10000 : (!empty($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100);

    // Single deposit fetch
    if ($depositId) {
        $sql = "SELECT t.*,
                       l.client_id,
                       tc.client_name, tc.case_number,
                       a.account_name as trust_account_name,
                       e.name as entity_name,
                       e.display_name as entity_display_name,
                       cs.case_number, cs.case_name,
                       cat.name as category_name
                FROM trust_transactions t
                JOIN trust_ledger l ON t.ledger_id = l.id
                JOIN trust_clients tc ON l.client_id = tc.id
                JOIN accounts a ON l.account_id = a.id
                LEFT JOIN entities e ON t.entity_id = e.id
                LEFT JOIN cases cs ON t.case_id = cs.id
                LEFT JOIN categories cat ON t.category_id = cat.id
                WHERE t.id = :id AND t.transaction_type = 'deposit'";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $depositId]);
        $deposit = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$deposit) {
            errorResponse('Deposit not found', 404);
        }

        successResponse(['deposit' => $deposit]);
        return;
    }

    // List deposits from trust_transactions
    $where = ["t.transaction_type = 'deposit'"];
    $params = [];

    if ($userId) {
        $where[] = 't.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($ledgerId) {
        $where[] = 't.ledger_id = :ledger_id';
        $params['ledger_id'] = $ledgerId;
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT t.*,
                   tc.client_name, tc.case_number,
                   a.account_name as trust_account_name,
                   e.name as entity_name,
                   cs.case_number as case_case_number
            FROM trust_transactions t
            JOIN trust_ledger l ON t.ledger_id = l.id
            JOIN trust_clients tc ON l.client_id = tc.id
            JOIN accounts a ON l.account_id = a.id
            LEFT JOIN entities e ON t.entity_id = e.id
            LEFT JOIN cases cs ON t.case_id = cs.id
            WHERE $whereClause
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT $limit";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $deposits = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get summary
    $summarySql = "SELECT
                    COUNT(*) as total_count,
                    COALESCE(SUM(amount), 0) as total_amount
                   FROM trust_transactions t
                   WHERE t.user_id = :user_id AND t.transaction_type = 'deposit'";
    $summaryStmt = $pdo->prepare($summarySql);
    $summaryStmt->execute(['user_id' => $userId]);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    successResponse([
        'deposits' => $deposits,
        'summary' => $summary
    ]);
}
