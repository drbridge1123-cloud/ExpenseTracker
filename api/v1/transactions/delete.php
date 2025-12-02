<?php
/**
 * Transaction Delete API
 * DELETE /api/transactions/delete.php
 * POST /api/transactions/delete.php (for single or bulk delete)
 *
 * Body: { "id": 123 } or { "ids": [1, 2, 3] }
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

// Support single ID or array of IDs
$ids = [];
if (isset($input['id'])) {
    $ids = [(int)$input['id']];
} elseif (isset($input['ids']) && is_array($input['ids'])) {
    $ids = array_map('intval', $input['ids']);
}

if (empty($ids)) {
    errorResponse('Transaction ID(s) required');
}

try {
    $db = Database::getInstance();
    $db->beginTransaction();

    // Get transactions info before deleting (for balance updates)
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $transactions = $db->fetchAll(
        "SELECT id, account_id, amount, transaction_type
         FROM transactions
         WHERE id IN ($placeholders)",
        $ids
    );

    if (empty($transactions)) {
        $db->rollback();
        errorResponse('No transactions found', 404);
    }

    // Calculate balance adjustments per account
    $balanceAdjustments = [];
    foreach ($transactions as $txn) {
        $accountId = $txn['account_id'];
        if (!isset($balanceAdjustments[$accountId])) {
            $balanceAdjustments[$accountId] = 0;
        }
        // Reverse the transaction effect on balance
        // If it was a credit (positive), we subtract; if debit (negative), we add
        $balanceAdjustments[$accountId] -= (float)$txn['amount'];
    }

    // Delete transactions
    $db->query(
        "DELETE FROM transactions WHERE id IN ($placeholders)",
        $ids
    );

    // Update account balances
    foreach ($balanceAdjustments as $accountId => $adjustment) {
        $db->query(
            "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?",
            [$adjustment, $accountId]
        );
    }

    $db->commit();

    $count = count($transactions);
    appLog("Deleted $count transaction(s): " . implode(', ', $ids));

    successResponse([
        'deleted_count' => $count,
        'deleted_ids' => array_column($transactions, 'id'),
        'message' => $count === 1 ? 'Transaction deleted' : "$count transactions deleted"
    ]);

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Transaction delete error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
