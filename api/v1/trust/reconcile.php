<?php
/**
 * Trust Reconciliation API
 * Compares bank statements (staging) with QuickBooks records (transactions)
 * to find matched, pending, and missing transactions
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
    default:
        errorResponse('Method not allowed', 405);
}

/**
 * Get reconciliation status - compare staging vs transactions
 */
function handleGet(Database $db, PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $startDate = $_GET['start_date'] ?? null;
    $endDate = $_GET['end_date'] ?? null;

    if (!$userId) {
        errorResponse('user_id is required');
    }

    // Get all staging records (bank statement data)
    $stagingWhere = ['s.user_id = :user_id'];
    $stagingParams = ['user_id' => $userId];

    if ($accountId) {
        $stagingWhere[] = 's.account_id = :account_id';
        $stagingParams['account_id'] = $accountId;
    }
    if ($startDate) {
        $stagingWhere[] = 's.transaction_date >= :start_date';
        $stagingParams['start_date'] = $startDate;
    }
    if ($endDate) {
        $stagingWhere[] = 's.transaction_date <= :end_date';
        $stagingParams['end_date'] = $endDate;
    }

    $stagingSql = "SELECT s.*,
                          c.client_name, c.matter_number
                   FROM trust_staging s
                   LEFT JOIN trust_clients c ON s.client_id = c.id
                   WHERE " . implode(' AND ', $stagingWhere) . "
                   ORDER BY s.transaction_date DESC, s.id DESC";

    $stmt = $pdo->prepare($stagingSql);
    $stmt->execute($stagingParams);
    $stagingRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get all transactions (QuickBooks data)
    $transWhere = ['t.user_id = :user_id'];
    $transParams = ['user_id' => $userId];

    if ($accountId) {
        $transWhere[] = 'l.account_id = :account_id';
        $transParams['account_id'] = $accountId;
    }
    if ($startDate) {
        $transWhere[] = 't.transaction_date >= :start_date';
        $transParams['start_date'] = $startDate;
    }
    if ($endDate) {
        $transWhere[] = 't.transaction_date <= :end_date';
        $transParams['end_date'] = $endDate;
    }

    $transSql = "SELECT t.*,
                        l.client_id,
                        c.client_name, c.matter_number
                 FROM trust_transactions t
                 JOIN trust_ledger l ON t.ledger_id = l.id
                 JOIN trust_clients c ON l.client_id = c.id
                 WHERE " . implode(' AND ', $transWhere) . "
                 ORDER BY t.transaction_date DESC, t.id DESC";

    $stmt = $pdo->prepare($transSql);
    $stmt->execute($transParams);
    $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Match staging records with transactions
    $matched = [];
    $pendingInBank = [];  // In staging but not in transactions (not yet in QuickBooks)
    $missingInBank = [];  // In transactions but not in staging (not on bank statement)

    $usedTransactionIds = [];
    $usedStagingIds = [];

    // First pass: exact matches (date + amount + check#)
    foreach ($stagingRecords as $staging) {
        $stagingDate = $staging['transaction_date'];
        $stagingAmount = round((float)$staging['amount'], 2);
        $stagingRef = trim($staging['reference_number'] ?? '');

        foreach ($transactions as $trans) {
            if (in_array($trans['id'], $usedTransactionIds)) continue;

            $transDate = $trans['transaction_date'];
            $transAmount = round((float)$trans['amount'], 2);
            $transRef = trim($trans['reference_number'] ?? '');

            // Match criteria: same date, same amount
            $dateMatch = $stagingDate === $transDate;
            $amountMatch = abs($stagingAmount - $transAmount) < 0.01;

            // If check numbers exist, they should match
            $refMatch = true;
            if ($stagingRef && $transRef) {
                $refMatch = $stagingRef === $transRef;
            }

            if ($dateMatch && $amountMatch && $refMatch) {
                $matched[] = [
                    'staging' => $staging,
                    'transaction' => $trans,
                    'match_type' => 'exact'
                ];
                $usedTransactionIds[] = $trans['id'];
                $usedStagingIds[] = $staging['id'];
                break;
            }
        }
    }

    // Second pass: fuzzy matches (±1 day, same amount)
    foreach ($stagingRecords as $staging) {
        if (in_array($staging['id'], $usedStagingIds)) continue;

        $stagingDate = strtotime($staging['transaction_date']);
        $stagingAmount = round((float)$staging['amount'], 2);

        foreach ($transactions as $trans) {
            if (in_array($trans['id'], $usedTransactionIds)) continue;

            $transDate = strtotime($trans['transaction_date']);
            $transAmount = round((float)$trans['amount'], 2);

            // Match criteria: ±1 day, same amount
            $dateDiff = abs($stagingDate - $transDate) / 86400; // days
            $amountMatch = abs($stagingAmount - $transAmount) < 0.01;

            if ($dateDiff <= 1 && $amountMatch) {
                $matched[] = [
                    'staging' => $staging,
                    'transaction' => $trans,
                    'match_type' => 'fuzzy'
                ];
                $usedTransactionIds[] = $trans['id'];
                $usedStagingIds[] = $staging['id'];
                break;
            }
        }
    }

    // Remaining staging = pending (in bank, not in QuickBooks)
    foreach ($stagingRecords as $staging) {
        if (!in_array($staging['id'], $usedStagingIds)) {
            $pendingInBank[] = $staging;
        }
    }

    // Remaining transactions = missing (in QuickBooks, not in bank)
    foreach ($transactions as $trans) {
        if (!in_array($trans['id'], $usedTransactionIds)) {
            $missingInBank[] = $trans;
        }
    }

    // Calculate totals
    $stagingTotal = array_sum(array_column($stagingRecords, 'amount'));
    $transTotal = array_sum(array_column($transactions, 'amount'));
    $matchedTotal = array_sum(array_map(fn($m) => $m['staging']['amount'], $matched));
    $pendingTotal = array_sum(array_column($pendingInBank, 'amount'));
    $missingTotal = array_sum(array_column($missingInBank, 'amount'));

    successResponse([
        'summary' => [
            'staging_count' => count($stagingRecords),
            'staging_total' => round($stagingTotal, 2),
            'transaction_count' => count($transactions),
            'transaction_total' => round($transTotal, 2),
            'matched_count' => count($matched),
            'matched_total' => round($matchedTotal, 2),
            'pending_count' => count($pendingInBank),
            'pending_total' => round($pendingTotal, 2),
            'missing_count' => count($missingInBank),
            'missing_total' => round($missingTotal, 2),
            'difference' => round($stagingTotal - $transTotal, 2)
        ],
        'matched' => $matched,
        'pending_in_bank' => $pendingInBank,
        'missing_in_bank' => $missingInBank
    ]);
}

/**
 * Auto-reconcile: mark matched staging as posted
 */
function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $action = $input['action'] ?? 'auto_match';

    switch ($action) {
        case 'auto_match':
            handleAutoMatch($db, $pdo, $input);
            break;
        case 'mark_reconciled':
            handleMarkReconciled($db, $pdo, $input);
            break;
        default:
            errorResponse('Invalid action');
    }
}

/**
 * Auto-match and mark staging records as reconciled
 */
function handleAutoMatch(Database $db, PDO $pdo, array $input): void {
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$userId) {
        errorResponse('user_id is required');
    }

    // Get unposted staging records
    $staging = $db->fetchAll(
        "SELECT * FROM trust_staging WHERE user_id = :user_id AND status != 'posted'",
        ['user_id' => $userId]
    );

    // Get all transactions
    $transactions = $db->fetchAll(
        "SELECT t.*, l.client_id FROM trust_transactions t
         JOIN trust_ledger l ON t.ledger_id = l.id
         WHERE t.user_id = :user_id",
        ['user_id' => $userId]
    );

    $matched = 0;
    $pdo->beginTransaction();

    try {
        foreach ($staging as $s) {
            $sDate = $s['transaction_date'];
            $sAmount = round((float)$s['amount'], 2);
            $sRef = trim($s['reference_number'] ?? '');

            foreach ($transactions as $t) {
                $tDate = $t['transaction_date'];
                $tAmount = round((float)$t['amount'], 2);
                $tRef = trim($t['reference_number'] ?? '');

                // Exact match
                $dateMatch = $sDate === $tDate;
                $amountMatch = abs($sAmount - $tAmount) < 0.01;
                $refMatch = !$sRef || !$tRef || $sRef === $tRef;

                if ($dateMatch && $amountMatch && $refMatch) {
                    // Mark staging as reconciled
                    $db->update('trust_staging', [
                        'status' => 'reconciled',
                        'matched_transaction_id' => $t['id'],
                        'client_id' => $t['client_id']
                    ], 'id = :id', ['id' => $s['id']]);

                    $matched++;
                    break;
                }
            }
        }

        $pdo->commit();

        successResponse([
            'matched' => $matched,
            'total_staging' => count($staging)
        ], "$matched records auto-matched");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Auto-match failed: ' . $e->getMessage());
    }
}

/**
 * Manually mark a staging record as reconciled with a transaction
 */
function handleMarkReconciled(Database $db, PDO $pdo, array $input): void {
    $stagingId = !empty($input['staging_id']) ? (int)$input['staging_id'] : null;
    $transactionId = !empty($input['transaction_id']) ? (int)$input['transaction_id'] : null;

    if (!$stagingId) {
        errorResponse('staging_id is required');
    }

    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);
    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    $updateData = ['status' => 'reconciled'];

    if ($transactionId) {
        $trans = $db->fetch(
            "SELECT t.*, l.client_id FROM trust_transactions t
             JOIN trust_ledger l ON t.ledger_id = l.id
             WHERE t.id = :id",
            ['id' => $transactionId]
        );
        if ($trans) {
            $updateData['matched_transaction_id'] = $transactionId;
            $updateData['client_id'] = $trans['client_id'];
        }
    }

    $db->update('trust_staging', $updateData, 'id = :id', ['id' => $stagingId]);

    successResponse(['reconciled' => true], 'Record marked as reconciled');
}
