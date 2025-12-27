<?php
/**
 * Cost Account Bank Reconciliation API
 * QuickBooks-style reconciliation for Cost Accounts
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($db, $pdo);
        break;
    case 'POST':
        handlePost($db, $pdo);
        break;
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

/**
 * GET - Get reconciliation data or list
 */
function handleGet(Database $db, PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $reconcileId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $status = $_GET['status'] ?? null;

    if (!$userId) {
        errorResponse('user_id is required');
    }

    // Get specific reconciliation
    if ($reconcileId) {
        $recon = $db->fetch(
            "SELECT * FROM cost_reconciliations WHERE id = :id AND user_id = :user_id",
            ['id' => $reconcileId, 'user_id' => $userId]
        );

        if (!$recon) {
            errorResponse('Reconciliation not found', 404);
        }

        // Get cleared items for this reconciliation
        $clearedIds = $db->fetchAll(
            "SELECT transaction_id FROM cost_reconciliation_items WHERE reconciliation_id = :id",
            ['id' => $reconcileId]
        );
        $recon['cleared_ids'] = array_column($clearedIds, 'transaction_id');

        // Get uncleared transactions
        $transactions = getUnclearedCostTransactions($db, $userId, $reconcileId);
        $recon['checks'] = $transactions['checks'];
        $recon['deposits'] = $transactions['deposits'];

        successResponse($recon);
    }

    // List reconciliations
    $where = ['user_id = :user_id'];
    $params = ['user_id' => $userId];

    if ($status) {
        $where[] = 'status = :status';
        $params['status'] = $status;
    }

    $whereClause = implode(' AND ', $where);

    $reconciliations = $db->fetchAll(
        "SELECT * FROM cost_reconciliations
         WHERE $whereClause
         ORDER BY statement_date DESC, id DESC
         LIMIT 50",
        $params
    );

    successResponse(['reconciliations' => $reconciliations]);
}

/**
 * POST - Start, save, or complete reconciliation
 */
function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? 'start';

    switch ($action) {
        case 'start':
            handleStart($db, $pdo, $input);
            break;
        case 'save':
            handleSave($db, $pdo, $input);
            break;
        case 'complete':
            handleComplete($db, $pdo, $input);
            break;
        case 'update':
            handleUpdate($db, $pdo, $input);
            break;
        default:
            errorResponse('Invalid action. Use: start, save, complete, update');
    }
}

/**
 * Start new reconciliation
 */
function handleStart(Database $db, PDO $pdo, array $input): void {
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $statementDate = $input['statement_date'] ?? null;
    $statementEndingBalance = isset($input['statement_ending_balance']) ? (float)$input['statement_ending_balance'] : null;

    if (!$userId || !$statementDate || $statementEndingBalance === null) {
        errorResponse('Required: user_id, statement_date, statement_ending_balance');
    }

    // Check for existing in-progress reconciliation
    $existing = $db->fetch(
        "SELECT id FROM cost_reconciliations
         WHERE user_id = :user_id AND status = 'in_progress'",
        ['user_id' => $userId]
    );

    if ($existing) {
        errorResponse('An in-progress reconciliation already exists. Please complete or delete it first.', 400);
    }

    // Calculate beginning balance (last completed reconciliation's ending balance, or 0)
    $lastRecon = $db->fetch(
        "SELECT statement_ending_balance FROM cost_reconciliations
         WHERE user_id = :user_id AND status = 'completed'
         ORDER BY statement_date DESC LIMIT 1",
        ['user_id' => $userId]
    );

    $beginningBalance = $lastRecon ? (float)$lastRecon['statement_ending_balance'] : 0;

    // Create reconciliation record
    $reconcileId = $db->insert('cost_reconciliations', [
        'user_id' => $userId,
        'reconciliation_date' => date('Y-m-d'),
        'statement_date' => $statementDate,
        'statement_ending_balance' => $statementEndingBalance,
        'beginning_balance' => $beginningBalance,
        'status' => 'in_progress'
    ]);

    // Get uncleared transactions
    $transactions = getUnclearedCostTransactions($db, $userId, $reconcileId);

    successResponse([
        'reconcile_id' => $reconcileId,
        'beginning_balance' => $beginningBalance,
        'statement_ending_balance' => $statementEndingBalance,
        'checks' => $transactions['checks'],
        'deposits' => $transactions['deposits']
    ], 'Reconciliation started');
}

/**
 * Save reconciliation progress (Save for Later)
 */
function handleSave(Database $db, PDO $pdo, array $input): void {
    $reconcileId = !empty($input['reconcile_id']) ? (int)$input['reconcile_id'] : null;
    $clearedIds = $input['cleared_ids'] ?? [];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$reconcileId || !$userId) {
        errorResponse('Required: reconcile_id, user_id');
    }

    // Verify ownership
    $recon = $db->fetch(
        "SELECT * FROM cost_reconciliations WHERE id = :id AND user_id = :user_id",
        ['id' => $reconcileId, 'user_id' => $userId]
    );

    if (!$recon) {
        errorResponse('Reconciliation not found', 404);
    }

    if ($recon['status'] === 'completed') {
        errorResponse('Cannot modify completed reconciliation');
    }

    $pdo->beginTransaction();

    try {
        // Clear existing items
        $db->query(
            "DELETE FROM cost_reconciliation_items WHERE reconciliation_id = :id",
            ['id' => $reconcileId]
        );

        // Insert new cleared items
        $checksTotal = 0;
        $checksCount = 0;
        $depositsTotal = 0;
        $depositsCount = 0;

        foreach ($clearedIds as $transId) {
            $transId = (int)$transId;

            // Get transaction details
            $trans = $db->fetch(
                "SELECT amount FROM cost_transactions WHERE id = :id",
                ['id' => $transId]
            );

            if ($trans) {
                $db->insert('cost_reconciliation_items', [
                    'reconciliation_id' => $reconcileId,
                    'transaction_id' => $transId
                ]);

                $amount = (float)$trans['amount'];
                if ($amount < 0) {
                    $checksTotal += abs($amount);
                    $checksCount++;
                } else {
                    $depositsTotal += $amount;
                    $depositsCount++;
                }
            }
        }

        // Calculate cleared balance and difference
        $clearedBalance = $recon['beginning_balance'] + $depositsTotal - $checksTotal;
        $difference = $recon['statement_ending_balance'] - $clearedBalance;

        // Update reconciliation
        $db->update('cost_reconciliations', [
            'cleared_checks_count' => $checksCount,
            'cleared_checks_total' => $checksTotal,
            'cleared_deposits_count' => $depositsCount,
            'cleared_deposits_total' => $depositsTotal,
            'difference' => $difference
        ], 'id = :id', ['id' => $reconcileId]);

        $pdo->commit();

        successResponse([
            'reconcile_id' => $reconcileId,
            'cleared_checks_count' => $checksCount,
            'cleared_checks_total' => $checksTotal,
            'cleared_deposits_count' => $depositsCount,
            'cleared_deposits_total' => $depositsTotal,
            'cleared_balance' => $clearedBalance,
            'difference' => $difference
        ], 'Progress saved');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to save: ' . $e->getMessage());
    }
}

/**
 * Complete reconciliation (Reconcile Now)
 */
function handleComplete(Database $db, PDO $pdo, array $input): void {
    $reconcileId = !empty($input['reconcile_id']) ? (int)$input['reconcile_id'] : null;
    $clearedIds = $input['cleared_ids'] ?? [];
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$reconcileId || !$userId) {
        errorResponse('Required: reconcile_id, user_id');
    }

    // Verify ownership
    $recon = $db->fetch(
        "SELECT * FROM cost_reconciliations WHERE id = :id AND user_id = :user_id",
        ['id' => $reconcileId, 'user_id' => $userId]
    );

    if (!$recon) {
        errorResponse('Reconciliation not found', 404);
    }

    if ($recon['status'] === 'completed') {
        errorResponse('Reconciliation already completed');
    }

    // Calculate totals
    $checksTotal = 0;
    $checksCount = 0;
    $depositsTotal = 0;
    $depositsCount = 0;

    foreach ($clearedIds as $transId) {
        $trans = $db->fetch(
            "SELECT amount FROM cost_transactions WHERE id = :id",
            ['id' => (int)$transId]
        );
        if ($trans) {
            $amount = (float)$trans['amount'];
            if ($amount < 0) {
                $checksTotal += abs($amount);
                $checksCount++;
            } else {
                $depositsTotal += $amount;
                $depositsCount++;
            }
        }
    }

    $clearedBalance = (float)$recon['beginning_balance'] + $depositsTotal - $checksTotal;
    $difference = (float)$recon['statement_ending_balance'] - $clearedBalance;

    // Allow small rounding difference (within 1 cent)
    if (abs($difference) > 0.01) {
        errorResponse("Cannot complete: Difference is $" . number_format($difference, 2) . ". Must be $0.00 to reconcile.");
    }

    $pdo->beginTransaction();

    try {
        // Mark transactions as cleared
        $clearedDate = $recon['statement_date'];
        foreach ($clearedIds as $transId) {
            $db->update('cost_transactions', [
                'status' => 'cleared',
                'cleared_date' => $clearedDate,
                'reconciliation_id' => $reconcileId
            ], 'id = :id', ['id' => (int)$transId]);
        }

        // Clear temporary items
        $db->query(
            "DELETE FROM cost_reconciliation_items WHERE reconciliation_id = :id",
            ['id' => $reconcileId]
        );

        // Update reconciliation as completed
        $db->update('cost_reconciliations', [
            'status' => 'completed',
            'cleared_checks_count' => $checksCount,
            'cleared_checks_total' => $checksTotal,
            'cleared_deposits_count' => $depositsCount,
            'cleared_deposits_total' => $depositsTotal,
            'difference' => 0,
            'completed_at' => date('Y-m-d H:i:s')
        ], 'id = :id', ['id' => $reconcileId]);

        $pdo->commit();

        successResponse([
            'reconcile_id' => $reconcileId,
            'cleared_count' => $checksCount + $depositsCount
        ], 'Reconciliation completed successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to complete: ' . $e->getMessage());
    }
}

/**
 * Update reconciliation (statement date and ending balance)
 */
function handleUpdate(Database $db, PDO $pdo, array $input): void {
    $reconcileId = !empty($input['reconcile_id']) ? (int)$input['reconcile_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $statementDate = $input['statement_date'] ?? null;
    $statementEndingBalance = isset($input['statement_ending_balance']) ? (float)$input['statement_ending_balance'] : null;

    if (!$reconcileId || !$userId) {
        errorResponse('Required: reconcile_id, user_id');
    }

    // Verify ownership
    $recon = $db->fetch(
        "SELECT * FROM cost_reconciliations WHERE id = :id AND user_id = :user_id",
        ['id' => $reconcileId, 'user_id' => $userId]
    );

    if (!$recon) {
        errorResponse('Reconciliation not found', 404);
    }

    if ($recon['status'] === 'completed') {
        errorResponse('Cannot modify completed reconciliation');
    }

    // Build update data
    $updateData = [];
    if ($statementDate !== null) {
        $updateData['statement_date'] = $statementDate;
    }
    if ($statementEndingBalance !== null) {
        $updateData['statement_ending_balance'] = $statementEndingBalance;
    }

    if (empty($updateData)) {
        errorResponse('No fields to update');
    }

    $db->update('cost_reconciliations', $updateData, 'id = :id', ['id' => $reconcileId]);

    successResponse([
        'reconcile_id' => $reconcileId,
        'statement_date' => $statementDate ?? $recon['statement_date'],
        'statement_ending_balance' => $statementEndingBalance ?? $recon['statement_ending_balance']
    ], 'Reconciliation updated');
}

/**
 * DELETE - Delete reconciliation
 */
function handleDelete(Database $db, PDO $pdo): void {
    $reconcileId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$reconcileId || !$userId) {
        errorResponse('Required: id, user_id');
    }

    $recon = $db->fetch(
        "SELECT * FROM cost_reconciliations WHERE id = :id AND user_id = :user_id",
        ['id' => $reconcileId, 'user_id' => $userId]
    );

    if (!$recon) {
        errorResponse('Reconciliation not found', 404);
    }

    if ($recon['status'] === 'completed') {
        errorResponse('Cannot delete completed reconciliation');
    }

    // Delete items first, then reconciliation
    $db->query("DELETE FROM cost_reconciliation_items WHERE reconciliation_id = :id", ['id' => $reconcileId]);
    $db->query("DELETE FROM cost_reconciliations WHERE id = :id", ['id' => $reconcileId]);

    successResponse(null, 'Reconciliation deleted');
}

/**
 * Get uncleared cost transactions
 */
function getUnclearedCostTransactions(Database $db, int $userId, int $reconcileId): array {
    // Get transactions that are not cleared, or are temporarily cleared in this reconciliation
    $sql = "SELECT ct.*, tc.client_name, tc.case_number
            FROM cost_transactions ct
            LEFT JOIN trust_clients tc ON ct.client_id = tc.id
            WHERE ct.user_id = :user_id
            AND (ct.status != 'cleared' OR ct.reconciliation_id = :recon_id OR ct.status IS NULL OR ct.status = 'pending')
            ORDER BY ct.transaction_date ASC, ct.id ASC";

    $transactions = $db->fetchAll($sql, [
        'user_id' => $userId,
        'recon_id' => $reconcileId
    ]);

    $checks = [];
    $deposits = [];

    foreach ($transactions as $t) {
        $t['amount'] = (float)$t['amount'];

        if ($t['amount'] < 0) {
            $checks[] = $t;
        } else {
            $deposits[] = $t;
        }
    }

    return [
        'checks' => $checks,
        'deposits' => $deposits
    ];
}
