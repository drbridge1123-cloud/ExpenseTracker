<?php
/**
 * Checks API
 * GET /api/checks/ - List all checks
 * POST /api/checks/ - Create/update check
 * DELETE /api/checks/?id=X - Void/delete check
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGet();
        break;
    case 'POST':
        handlePost();
        break;
    case 'DELETE':
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $status = $_GET['status'] ?? null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    try {
        $db = Database::getInstance();

        $sql = "SELECT c.*,
                       a.account_name as account_name,
                       cat.name as category_name,
                       cat.icon as category_icon
                FROM checks c
                LEFT JOIN accounts a ON c.account_id = a.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.user_id = :user_id";
        $params = ['user_id' => $userId];

        if ($accountId) {
            $sql .= " AND c.account_id = :account_id";
            $params['account_id'] = $accountId;
        }

        if ($status) {
            $sql .= " AND c.status = :status";
            $params['status'] = $status;
        }

        $sql .= " ORDER BY c.check_date DESC, c.check_number DESC";

        $checks = $db->fetchAll($sql, $params);

        // Get next check number for each account
        $nextNumbers = $db->fetchAll(
            "SELECT account_id, MAX(CAST(check_number AS UNSIGNED)) + 1 as next_number
             FROM checks
             WHERE user_id = :user_id
             GROUP BY account_id",
            ['user_id' => $userId]
        );

        $nextNumberMap = [];
        foreach ($nextNumbers as $n) {
            $nextNumberMap[$n['account_id']] = $n['next_number'] ?: 1001;
        }

        // Summary
        $summary = $db->fetch(
            "SELECT
                COUNT(*) as total_checks,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
                SUM(CASE WHEN status = 'cleared' THEN 1 ELSE 0 END) as cleared_count
             FROM checks
             WHERE user_id = :user_id",
            ['user_id' => $userId]
        );

        successResponse([
            'checks' => $checks,
            'next_check_numbers' => $nextNumberMap,
            'summary' => [
                'total_checks' => (int)$summary['total_checks'],
                'pending_count' => (int)$summary['pending_count'],
                'pending_amount' => (float)$summary['pending_amount'],
                'cleared_count' => (int)$summary['cleared_count']
            ]
        ]);

    } catch (Exception $e) {
        appLog('Checks list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $accountId = !empty($input['account_id']) ? (int)$input['account_id'] : null;
    $checkNumber = trim($input['check_number'] ?? '');
    $payee = trim($input['payee'] ?? '');
    $amount = isset($input['amount']) ? (float)$input['amount'] : null;
    $checkDate = $input['check_date'] ?? date('Y-m-d');
    $memo = trim($input['memo'] ?? '');
    $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
    $status = $input['status'] ?? 'pending';
    $createTransaction = !empty($input['create_transaction']);

    if (!$userId) errorResponse('User ID is required');
    if (!$accountId) errorResponse('Account is required');
    if (empty($checkNumber)) errorResponse('Check number is required');
    if (empty($payee)) errorResponse('Payee is required');
    if ($amount === null || $amount <= 0) errorResponse('Valid amount is required');

    try {
        $db = Database::getInstance();
        $db->beginTransaction();

        $data = [
            'user_id' => $userId,
            'account_id' => $accountId,
            'check_number' => $checkNumber,
            'payee' => $payee,
            'amount' => $amount,
            'check_date' => $checkDate,
            'memo' => $memo,
            'category_id' => $categoryId,
            'status' => $status
        ];

        if ($id) {
            // Update existing check
            $db->query(
                "UPDATE checks SET
                    account_id = ?,
                    check_number = ?,
                    payee = ?,
                    amount = ?,
                    check_date = ?,
                    memo = ?,
                    category_id = ?,
                    status = ?
                 WHERE id = ? AND user_id = ?",
                [
                    $accountId,
                    $checkNumber,
                    $payee,
                    $amount,
                    $checkDate,
                    $memo,
                    $categoryId,
                    $status,
                    $id,
                    $userId
                ]
            );
            $checkId = $id;
            $message = 'Check updated';
        } else {
            // Check if check number already exists
            $existing = $db->fetch(
                "SELECT id FROM checks WHERE account_id = :account_id AND check_number = :check_number",
                ['account_id' => $accountId, 'check_number' => $checkNumber]
            );

            if ($existing) {
                $db->rollback();
                errorResponse('Check number already exists for this account');
            }

            $checkId = $db->insert('checks', $data);
            $message = 'Check created';
            $matchedTransaction = null;

            // Try to find matching transaction (reverse matching)
            // Match by: account_id + check_number
            if (!empty($checkNumber)) {
                $existingTxn = $db->fetch(
                    "SELECT t.id, t.amount, t.category_id FROM transactions t
                     LEFT JOIN checks c ON c.transaction_id = t.id
                     WHERE t.account_id = ? AND t.check_number = ? AND c.id IS NULL",
                    [$accountId, $checkNumber]
                );

                if ($existingTxn) {
                    // Verify amount matches (within 0.01 tolerance)
                    $txnAmount = abs((float)$existingTxn['amount']);
                    $checkAmount = abs($amount);

                    if (abs($txnAmount - $checkAmount) < 0.01) {
                        // Match found! Link check to existing transaction
                        $db->query(
                            "UPDATE checks SET transaction_id = ?, status = 'cleared' WHERE id = ?",
                            [$existingTxn['id'], $checkId]
                        );

                        // Update transaction with check's category if set
                        if ($categoryId) {
                            $db->query(
                                "UPDATE transactions SET category_id = ?, categorized_by = 'check' WHERE id = ?",
                                [$categoryId, $existingTxn['id']]
                            );
                        }

                        $matchedTransaction = $existingTxn['id'];
                        $message = 'Check created and matched with existing transaction';
                    }
                }
            }

            // Create new transaction only if requested AND no match was found
            if ($createTransaction && !$matchedTransaction) {
                $txnId = $db->insert('transactions', [
                    'user_id' => $userId,
                    'account_id' => $accountId,
                    'category_id' => $categoryId,
                    'transaction_date' => $checkDate,
                    'description' => "Check #$checkNumber - $payee",
                    'original_description' => "CHECK $checkNumber $payee",
                    'vendor_name' => $payee,
                    'amount' => -abs($amount),
                    'transaction_type' => 'debit',
                    'check_number' => $checkNumber,
                    'memo' => $memo,
                    'categorized_by' => 'manual',
                    'categorization_confidence' => 100
                ]);

                // Update check with transaction ID
                $db->query(
                    "UPDATE checks SET transaction_id = ? WHERE id = ?",
                    [$txnId, $checkId]
                );

                // Update account balance
                $db->query(
                    "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?",
                    [abs($amount), $accountId]
                );

                $message .= ' and transaction recorded';
            }
        }

        $db->commit();

        $response = ['id' => $checkId];
        if (isset($matchedTransaction) && $matchedTransaction) {
            $response['matched_transaction_id'] = $matchedTransaction;
            $response['auto_cleared'] = true;
        }

        successResponse($response, $message);

    } catch (Exception $e) {
        if (isset($db)) $db->rollback();
        appLog('Check save error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $void = isset($_GET['void']);

    if (!$id) {
        errorResponse('Check ID is required');
    }

    try {
        $db = Database::getInstance();
        $db->beginTransaction();

        // Get check info before deleting
        $check = $db->fetch(
            "SELECT id, account_id, amount, transaction_id, status FROM checks WHERE id = ?",
            [$id]
        );

        if (!$check) {
            $db->rollback();
            errorResponse('Check not found', 404);
        }

        if ($void) {
            // Just mark as void
            $db->query(
                "UPDATE checks SET status = 'void' WHERE id = ?",
                [$id]
            );
            $db->commit();
            successResponse(['voided' => true], 'Check voided');
        } else {
            // If check has a linked transaction, delete it and update balance
            if (!empty($check['transaction_id'])) {
                // Get transaction info
                $txn = $db->fetch(
                    "SELECT id, account_id, amount FROM transactions WHERE id = ?",
                    [$check['transaction_id']]
                );

                if ($txn) {
                    // Delete the transaction
                    $db->query("DELETE FROM transactions WHERE id = ?", [$txn['id']]);

                    // Reverse the balance adjustment (transaction amount was negative for checks)
                    $db->query(
                        "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?",
                        [$txn['amount'], $txn['account_id']]
                    );
                }
            }

            // Delete check
            $db->query("DELETE FROM checks WHERE id = ?", [$id]);

            $db->commit();
            successResponse(['deleted' => true], 'Check deleted');
        }

    } catch (Exception $e) {
        if (isset($db)) $db->rollback();
        appLog('Check delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
