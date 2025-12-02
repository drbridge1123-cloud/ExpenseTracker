<?php
/**
 * Reimbursements API - Manage reimbursement status and reports
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
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    try {
        $db = Database::getInstance();
        $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        $statusFilter = $_GET['status'] ?? null;

        // Get transactions with reimbursement status
        $txnConditions = ["t.reimbursement_status IS NOT NULL AND t.reimbursement_status != '' AND t.reimbursement_status != 'none'"];
        $txnParams = [];

        if ($userId) {
            $txnConditions[] = 't.user_id = :user_id';
            $txnParams['user_id'] = $userId;
        }

        if ($statusFilter) {
            $txnConditions[] = 't.reimbursement_status = :status';
            $txnParams['status'] = $statusFilter;
        }

        $txnWhereClause = implode(' AND ', $txnConditions);

        $txnSql = "SELECT
                    t.id,
                    t.transaction_date,
                    t.description,
                    t.vendor_name,
                    t.amount,
                    t.reimbursement_status,
                    t.reimbursement_date,
                    t.reimbursement_notes,
                    t.category_id,
                    c.name AS category_name,
                    c.icon AS category_icon,
                    a.account_name,
                    'transaction' AS item_type,
                    (SELECT COUNT(*) FROM receipts r WHERE r.transaction_id = t.id) AS receipt_count
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN accounts a ON t.account_id = a.id
                WHERE $txnWhereClause
                ORDER BY t.transaction_date DESC";

        $transactions = $db->fetchAll($txnSql, $txnParams);

        // Get Cash receipts with submitted/reimbursed status (no transaction linked)
        $cashConditions = ["r.transaction_id IS NULL", "r.reimbursement_status IN ('submitted', 'reimbursed')"];
        $cashParams = [];

        if ($userId) {
            $cashConditions[] = 'r.user_id = :user_id';
            $cashParams['user_id'] = $userId;
        }

        if ($statusFilter) {
            $cashConditions[] = 'r.reimbursement_status = :status';
            $cashParams['status'] = $statusFilter;
        }

        $cashWhereClause = implode(' AND ', $cashConditions);

        $cashSql = "SELECT
                    r.id,
                    r.receipt_date AS transaction_date,
                    r.description,
                    r.vendor_name,
                    r.amount,
                    r.reimbursement_status,
                    NULL AS reimbursement_date,
                    NULL AS reimbursement_notes,
                    NULL AS category_id,
                    'Cash' AS category_name,
                    '💵' AS category_icon,
                    'Cash' AS account_name,
                    'cash_receipt' AS item_type,
                    1 AS receipt_count
                FROM receipts r
                WHERE $cashWhereClause
                ORDER BY r.receipt_date DESC";

        $cashReceipts = $db->fetchAll($cashSql, $cashParams);

        // Merge and sort by date
        $allItems = array_merge($transactions, $cashReceipts);
        usort($allItems, function($a, $b) {
            return strtotime($b['transaction_date']) - strtotime($a['transaction_date']);
        });

        // Get summary stats from transactions
        $statsSql = "SELECT
                        reimbursement_status,
                        COUNT(*) as count,
                        SUM(ABS(amount)) as total
                     FROM transactions
                     WHERE reimbursement_status IS NOT NULL AND reimbursement_status != '' AND reimbursement_status != 'none'";

        if ($userId) {
            $statsSql .= " AND user_id = :user_id";
        }

        $statsSql .= " GROUP BY reimbursement_status";

        $statsParams = [];
        if ($userId) {
            $statsParams['user_id'] = $userId;
        }

        $stats = $db->fetchAll($statsSql, $statsParams);

        // Get Cash receipts stats
        $cashStatsSql = "SELECT
                            reimbursement_status,
                            COUNT(*) as count,
                            SUM(ABS(amount)) as total
                         FROM receipts
                         WHERE transaction_id IS NULL
                           AND reimbursement_status IS NOT NULL
                           AND reimbursement_status != ''
                           AND reimbursement_status != 'none'";

        if ($userId) {
            $cashStatsSql .= " AND user_id = :user_id";
        }

        $cashStatsSql .= " GROUP BY reimbursement_status";

        $cashStatsParams = [];
        if ($userId) {
            $cashStatsParams['user_id'] = $userId;
        }

        $cashStats = $db->fetchAll($cashStatsSql, $cashStatsParams);

        $summary = [
            'pending' => ['count' => 0, 'total' => 0],
            'submitted' => ['count' => 0, 'total' => 0],
            'approved' => ['count' => 0, 'total' => 0],
            'reimbursed' => ['count' => 0, 'total' => 0],
            'denied' => ['count' => 0, 'total' => 0]
        ];

        // Add transaction stats
        foreach ($stats as $stat) {
            if (isset($summary[$stat['reimbursement_status']])) {
                $summary[$stat['reimbursement_status']]['count'] += (int)$stat['count'];
                $summary[$stat['reimbursement_status']]['total'] += (float)$stat['total'];
            }
        }

        // Add Cash receipt stats
        foreach ($cashStats as $stat) {
            if (isset($summary[$stat['reimbursement_status']])) {
                $summary[$stat['reimbursement_status']]['count'] += (int)$stat['count'];
                $summary[$stat['reimbursement_status']]['total'] += (float)$stat['total'];
            }
        }

        successResponse([
            'transactions' => $allItems,
            'summary' => $summary
        ]);

    } catch (Exception $e) {
        appLog('Reimbursements list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    try {
        $db = Database::getInstance();
        $input = json_decode(file_get_contents('php://input'), true);

        $action = $input['action'] ?? '';

        switch ($action) {
            case 'update_status':
                // Update single transaction status
                $transactionId = (int)($input['transaction_id'] ?? 0);
                $status = $input['status'] ?? '';
                $notes = $input['notes'] ?? null;

                if (!$transactionId) {
                    errorResponse('Transaction ID is required');
                }

                $validStatuses = ['none', 'pending', 'submitted', 'approved', 'reimbursed', 'denied'];
                if (!in_array($status, $validStatuses)) {
                    errorResponse('Invalid status');
                }

                $updateData = ['reimbursement_status' => $status];

                if ($status === 'reimbursed') {
                    $updateData['reimbursement_date'] = date('Y-m-d');
                }

                if ($notes !== null) {
                    $updateData['reimbursement_notes'] = $notes;
                }

                $db->update('transactions', $updateData, 'id = :id', ['id' => $transactionId]);

                // Auto-organize: When reimbursed, move receipts to category folder
                if ($status === 'reimbursed') {
                    autoOrganizeReceiptsOnReimbursement($db, $transactionId);
                }

                successResponse(null, 'Status updated');
                break;

            case 'bulk_update':
                // Update multiple transactions
                $transactionIds = $input['transaction_ids'] ?? [];
                $status = $input['status'] ?? '';

                if (empty($transactionIds)) {
                    errorResponse('Transaction IDs are required');
                }

                $validStatuses = ['none', 'pending', 'submitted', 'approved', 'reimbursed', 'denied'];
                if (!in_array($status, $validStatuses)) {
                    errorResponse('Invalid status');
                }

                $placeholders = implode(',', array_fill(0, count($transactionIds), '?'));

                $updateData = ['reimbursement_status' => $status];
                if ($status === 'reimbursed') {
                    $db->getConnection()->prepare(
                        "UPDATE transactions SET reimbursement_status = ?, reimbursement_date = CURDATE() WHERE id IN ($placeholders)"
                    )->execute(array_merge([$status], $transactionIds));

                    // Auto-organize for each transaction
                    foreach ($transactionIds as $txnId) {
                        autoOrganizeReceiptsOnReimbursement($db, (int)$txnId);
                    }
                } else {
                    $db->getConnection()->prepare(
                        "UPDATE transactions SET reimbursement_status = ? WHERE id IN ($placeholders)"
                    )->execute(array_merge([$status], $transactionIds));
                }

                successResponse(null, count($transactionIds) . ' transactions updated');
                break;

            case 'mark_reimbursable':
                // Mark transaction as reimbursable
                $transactionId = (int)($input['transaction_id'] ?? 0);

                if (!$transactionId) {
                    errorResponse('Transaction ID is required');
                }

                $db->update(
                    'transactions',
                    ['reimbursement_status' => 'pending'],
                    'id = :id',
                    ['id' => $transactionId]
                );

                successResponse(null, 'Transaction marked for reimbursement');
                break;

            default:
                errorResponse('Invalid action');
        }

    } catch (Exception $e) {
        appLog('Reimbursement update error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

/**
 * Auto-organize receipts when a transaction is marked as reimbursed
 * Physically moves receipt files from YYYY/Requested/ to YYYY/Reimbursed/
 */
function autoOrganizeReceiptsOnReimbursement($db, $transactionId) {
    try {
        // Get receipts for this transaction first
        $receipts = $db->fetchAll(
            "SELECT id, file_path, user_id FROM receipts WHERE transaction_id = :transaction_id",
            ['transaction_id' => $transactionId]
        );

        if (empty($receipts)) {
            return; // No receipts to move
        }

        // Use receipt's user_id (receipts belong to the user who uploaded them)
        $userId = $receipts[0]['user_id'];

        // Get or create Reimbursed folder for this user
        $reimbursedFolder = $db->fetch(
            "SELECT id FROM receipt_folders WHERE user_id = :user_id AND name = 'Reimbursed'",
            ['user_id' => $userId]
        );

        if (!$reimbursedFolder) {
            $reimbursedFolderId = $db->insert('receipt_folders', [
                'user_id' => $userId,
                'name' => 'Reimbursed',
                'folder_type' => 'custom',
                'icon' => '✅'
            ]);
        } else {
            $reimbursedFolderId = $reimbursedFolder['id'];
        }

        $baseDir = __DIR__ . '/../../';
        $movedCount = 0;

        foreach ($receipts as $receipt) {
            $oldPath = $receipt['file_path'];

            // Check if file is in Requested folder
            if (strpos($oldPath, '/Requested/') === false) {
                // Just update folder_id without moving file
                $db->query(
                    "UPDATE receipts SET folder_id = :folder_id WHERE id = :id",
                    ['folder_id' => $reimbursedFolderId, 'id' => $receipt['id']]
                );
                continue;
            }

            // Calculate new path (replace Requested with Reimbursed)
            $newPath = str_replace('/Requested/', '/Reimbursed/', $oldPath);

            // Create Reimbursed directory if it doesn't exist
            $newDir = dirname($baseDir . $newPath);
            if (!is_dir($newDir)) {
                mkdir($newDir, 0755, true);
            }

            // Move the physical file
            $oldFullPath = $baseDir . $oldPath;
            $newFullPath = $baseDir . $newPath;

            if (file_exists($oldFullPath)) {
                if (rename($oldFullPath, $newFullPath)) {
                    // Update database with new path and folder_id
                    $db->query(
                        "UPDATE receipts SET file_path = :new_path, folder_id = :folder_id WHERE id = :id",
                        ['new_path' => $newPath, 'folder_id' => $reimbursedFolderId, 'id' => $receipt['id']]
                    );
                    $movedCount++;
                } else {
                    appLog("Failed to move file: $oldFullPath to $newFullPath", 'error');
                }
            }
        }

        appLog("Moved $movedCount receipt(s) to Reimbursed folder for transaction $transactionId", 'info');

    } catch (Exception $e) {
        appLog('Auto-organize error: ' . $e->getMessage(), 'error');
        // Don't throw - this is a non-critical operation
    }
}
