<?php
/**
 * Reconciliations API
 * GET /api/reconciliations.php - Get reconciliation history
 * POST /api/reconciliations.php - Create new reconciliation
 * DELETE /api/reconciliations.php?id=X - Undo reconciliation
 */

require_once __DIR__ . '/../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = Database::getInstance();

    switch ($method) {
        case 'GET':
            handleGet($db);
            break;
        case 'POST':
            handlePost($db);
            break;
        case 'DELETE':
            handleDelete($db);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Reconciliation error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

function handleGet($db) {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    $reconciliations = $db->fetchAll(
        "SELECT r.*, a.account_name,
                (SELECT COUNT(*) FROM transactions t WHERE t.reconciliation_id = r.id) as transaction_count
         FROM reconciliations r
         JOIN accounts a ON r.account_id = a.id
         WHERE r.user_id = :user_id
         ORDER BY r.reconciled_date DESC
         LIMIT 50",
        ['user_id' => $userId]
    );

    successResponse($reconciliations);
}

function handlePost($db) {
    $data = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($data['user_id']) ? (int)$data['user_id'] : null;
    $accountId = !empty($data['account_id']) ? (int)$data['account_id'] : null;
    $statementDate = $data['statement_date'] ?? null;
    $statementBalance = isset($data['statement_balance']) ? (float)$data['statement_balance'] : 0;
    $transactionIds = $data['transaction_ids'] ?? [];

    if (!$userId || !$accountId || !$statementDate) {
        errorResponse('User ID, account ID, and statement date are required');
    }

    if (empty($transactionIds)) {
        errorResponse('No transactions selected for reconciliation');
    }

    // Create reconciliation record
    $reconciliationId = $db->insert('reconciliations', [
        'user_id' => $userId,
        'account_id' => $accountId,
        'statement_date' => $statementDate,
        'statement_balance' => $statementBalance,
        'reconciled_date' => date('Y-m-d H:i:s')
    ]);

    // Mark transactions as reconciled
    $placeholders = implode(',', array_fill(0, count($transactionIds), '?'));
    $params = array_merge([$reconciliationId], $transactionIds);

    $db->query(
        "UPDATE transactions SET is_reconciled = 1, reconciliation_id = ? WHERE id IN ($placeholders)",
        $params
    );

    successResponse([
        'id' => $reconciliationId,
        'transactions_reconciled' => count($transactionIds)
    ]);
}

function handleDelete($db) {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('Reconciliation ID is required');
    }

    // Get reconciliation details
    $reconciliation = $db->fetch(
        "SELECT * FROM reconciliations WHERE id = :id",
        ['id' => $id]
    );

    if (!$reconciliation) {
        errorResponse('Reconciliation not found', 404);
    }

    // Unmark transactions
    $db->query(
        "UPDATE transactions SET is_reconciled = 0, reconciliation_id = NULL WHERE reconciliation_id = ?",
        [$id]
    );

    // Delete reconciliation record
    $db->delete('reconciliations', 'id = :id', ['id' => $id]);

    successResponse(['message' => 'Reconciliation undone']);
}
