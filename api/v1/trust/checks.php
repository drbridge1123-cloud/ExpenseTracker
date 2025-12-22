<?php
/**
 * Trust Checks API
 * Manages checks written from IOLTA trust accounts
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
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $ledgerId = !empty($_GET['ledger_id']) ? (int)$_GET['ledger_id'] : null;
    $status = $_GET['status'] ?? null;
    $all = !empty($_GET['all']);
    $limit = $all ? 10000 : (!empty($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100);

    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'c.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($ledgerId) {
        $where[] = 'c.ledger_id = :ledger_id';
        $params['ledger_id'] = $ledgerId;
    }

    if ($status) {
        $where[] = 'c.status = :status';
        $params['status'] = $status;
    }

    $whereClause = implode(' AND ', $where);

    // Get checks with client info
    $sql = "SELECT c.*,
                   l.client_id,
                   tc.client_name,
                   a.account_name as trust_account_name
            FROM trust_checks c
            JOIN trust_ledger l ON c.ledger_id = l.id
            JOIN trust_clients tc ON l.client_id = tc.id
            JOIN accounts a ON l.account_id = a.id
            WHERE $whereClause
            ORDER BY c.check_date DESC, c.check_number DESC
            LIMIT $limit";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $checks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get next check number
    $nextNumSql = "SELECT COALESCE(MAX(CAST(check_number AS UNSIGNED)), 1000) + 1 as next_num
                   FROM trust_checks
                   WHERE user_id = :user_id";
    $nextNumStmt = $pdo->prepare($nextNumSql);
    $nextNumStmt->execute(['user_id' => $userId]);
    $nextNum = $nextNumStmt->fetch(PDO::FETCH_ASSOC)['next_num'];

    // Get summary
    $summarySql = "SELECT
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
                    COUNT(CASE WHEN status = 'cleared' THEN 1 END) as cleared_count,
                    SUM(CASE WHEN status = 'cleared' THEN amount ELSE 0 END) as cleared_amount
                   FROM trust_checks c
                   WHERE c.user_id = :user_id";
    $summaryStmt = $pdo->prepare($summarySql);
    $summaryStmt->execute(['user_id' => $userId]);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    successResponse([
        'checks' => $checks,
        'next_check_number' => (int)$nextNum,
        'summary' => $summary
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $data = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($data['user_id']) ? (int)$data['user_id'] : null;
    $ledgerId = !empty($data['ledger_id']) ? (int)$data['ledger_id'] : null;
    $checkNumber = trim($data['check_number'] ?? '');
    $payee = trim($data['payee'] ?? '');
    $amount = !empty($data['amount']) ? (float)$data['amount'] : 0;
    $checkDate = $data['check_date'] ?? date('Y-m-d');
    $memo = trim($data['memo'] ?? '');
    $status = $data['status'] ?? 'pending';
    $checkId = !empty($data['id']) ? (int)$data['id'] : null;

    // New QuickBooks-style fields
    $entityId = !empty($data['entity_id']) ? (int)$data['entity_id'] : null;
    $caseId = !empty($data['case_id']) ? (int)$data['case_id'] : null;
    $categoryId = !empty($data['category_id']) ? (int)$data['category_id'] : null;
    $transactionType = $data['transaction_type'] ?? 'payout';

    // Validate transaction type
    $validTypes = ['payout', 'legal_fee', 'disbursement', 'earned_fee'];
    if (!in_array($transactionType, $validTypes)) {
        $transactionType = 'payout';
    }

    // Validation
    if (!$userId || !$ledgerId || !$checkNumber || !$payee || $amount <= 0) {
        errorResponse('Missing required fields: user_id, ledger_id, check_number, payee, amount');
    }

    // Verify ledger exists and get balance
    $ledgerSql = "SELECT l.*, tc.client_name, a.account_name
                  FROM trust_ledger l
                  JOIN trust_clients tc ON l.client_id = tc.id
                  JOIN accounts a ON l.account_id = a.id
                  WHERE l.id = :id";
    $ledgerStmt = $pdo->prepare($ledgerSql);
    $ledgerStmt->execute(['id' => $ledgerId]);
    $ledger = $ledgerStmt->fetch(PDO::FETCH_ASSOC);

    if (!$ledger) {
        errorResponse('Client ledger not found');
    }

    // Check sufficient funds (only for new checks or increased amounts)
    if (!$checkId || $status !== 'void') {
        $existingAmount = 0;
        if ($checkId) {
            $existingStmt = $pdo->prepare("SELECT amount FROM trust_checks WHERE id = :id");
            $existingStmt->execute(['id' => $checkId]);
            $existingCheck = $existingStmt->fetch(PDO::FETCH_ASSOC);
            $existingAmount = $existingCheck ? (float)$existingCheck['amount'] : 0;
        }

        $additionalAmount = $amount - $existingAmount;
        if ($additionalAmount > 0 && $additionalAmount > (float)$ledger['current_balance']) {
            errorResponse('Insufficient funds in client ledger. Available: $' . number_format($ledger['current_balance'], 2));
        }
    }

    try {
        $pdo->beginTransaction();

        if ($checkId) {
            // Update existing check
            $oldCheckStmt = $pdo->prepare("SELECT * FROM trust_checks WHERE id = :id");
            $oldCheckStmt->execute(['id' => $checkId]);
            $oldCheck = $oldCheckStmt->fetch(PDO::FETCH_ASSOC);

            $sql = "UPDATE trust_checks SET
                    ledger_id = :ledger_id,
                    check_number = :check_number,
                    payee = :payee,
                    amount = :amount,
                    check_date = :check_date,
                    memo = :memo,
                    status = :status,
                    entity_id = :entity_id,
                    case_id = :case_id,
                    category_id = :category_id,
                    updated_at = NOW()
                    WHERE id = :id";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'ledger_id' => $ledgerId,
                'check_number' => $checkNumber,
                'payee' => $payee,
                'amount' => $amount,
                'check_date' => $checkDate,
                'memo' => $memo,
                'status' => $status,
                'entity_id' => $entityId,
                'case_id' => $caseId,
                'category_id' => $categoryId,
                'id' => $checkId
            ]);

            // Update ledger balance if amount changed
            $amountDiff = $amount - (float)$oldCheck['amount'];
            if ($amountDiff != 0) {
                $updateLedgerSql = "UPDATE trust_ledger SET current_balance = current_balance - :diff WHERE id = :id";
                $updateLedgerStmt = $pdo->prepare($updateLedgerSql);
                $updateLedgerStmt->execute(['diff' => $amountDiff, 'id' => $ledgerId]);
            }

            // Audit log
            logTrustAudit($pdo, $userId, 'check_updated', $ledger['client_id'], $checkId, [
                'check_number' => $checkNumber,
                'old_amount' => $oldCheck['amount'],
                'new_amount' => $amount,
                'payee' => $payee
            ]);

            $message = 'Check updated successfully';
        } else {
            // Create new check
            $sql = "INSERT INTO trust_checks (user_id, ledger_id, check_number, payee, amount, check_date, memo, status, entity_id, case_id, category_id, created_at)
                    VALUES (:user_id, :ledger_id, :check_number, :payee, :amount, :check_date, :memo, :status, :entity_id, :case_id, :category_id, NOW())";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'user_id' => $userId,
                'ledger_id' => $ledgerId,
                'check_number' => $checkNumber,
                'payee' => $payee,
                'amount' => $amount,
                'check_date' => $checkDate,
                'memo' => $memo,
                'status' => $status,
                'entity_id' => $entityId,
                'case_id' => $caseId,
                'category_id' => $categoryId
            ]);

            $checkId = $pdo->lastInsertId();

            // Deduct from ledger balance
            $updateLedgerSql = "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id";
            $updateLedgerStmt = $pdo->prepare($updateLedgerSql);
            $updateLedgerStmt->execute(['amount' => $amount, 'id' => $ledgerId]);

            // Create trust transaction record (amount stored as negative for disbursements)
            $newBalance = (float)$ledger['current_balance'] - $amount;
            $transSql = "INSERT INTO trust_transactions
                        (user_id, ledger_id, transaction_type, amount, transaction_date, description, reference_number, check_number, status, running_balance, entity_id, case_id, category_id, payee, created_at)
                        VALUES (:user_id, :ledger_id, :transaction_type, :amount, :date, :desc, :ref, :check_number, :status, :running_balance, :entity_id, :case_id, :category_id, :payee, NOW())";
            $transStmt = $pdo->prepare($transSql);
            $transStmt->execute([
                'user_id' => $userId,
                'ledger_id' => $ledgerId,
                'transaction_type' => $transactionType,
                'amount' => -$amount,
                'date' => $checkDate,
                'desc' => "Check #$checkNumber to $payee" . ($memo ? " - $memo" : ''),
                'ref' => "CHK-$checkNumber",
                'check_number' => $checkNumber,
                'status' => $status,
                'running_balance' => $newBalance,
                'entity_id' => $entityId,
                'case_id' => $caseId,
                'category_id' => $categoryId,
                'payee' => $payee
            ]);

            // Audit log
            logTrustAudit($pdo, $userId, 'check_written', $ledger['client_id'], $checkId, [
                'check_number' => $checkNumber,
                'amount' => $amount,
                'payee' => $payee,
                'client_name' => $ledger['client_name']
            ]);

            $message = 'Check saved successfully';
        }

        $pdo->commit();
        successResponse(['id' => $checkId, 'message' => $message]);

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Error saving check: ' . $e->getMessage());
    }
}

function handleDelete(Database $db, PDO $pdo): void {
    $checkId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$checkId) {
        errorResponse('Check ID required');
    }

    // Get check details
    $checkStmt = $pdo->prepare("SELECT c.*, l.client_id FROM trust_checks c JOIN trust_ledger l ON c.ledger_id = l.id WHERE c.id = :id");
    $checkStmt->execute(['id' => $checkId]);
    $check = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$check) {
        errorResponse('Check not found');
    }

    try {
        $pdo->beginTransaction();

        // Restore balance to ledger
        $updateLedgerSql = "UPDATE trust_ledger SET current_balance = current_balance + :amount WHERE id = :id";
        $updateLedgerStmt = $pdo->prepare($updateLedgerSql);
        $updateLedgerStmt->execute(['amount' => $check['amount'], 'id' => $check['ledger_id']]);

        // Delete check
        $deleteStmt = $pdo->prepare("DELETE FROM trust_checks WHERE id = :id");
        $deleteStmt->execute(['id' => $checkId]);

        // Audit log
        logTrustAudit($pdo, $check['user_id'], 'check_deleted', $check['client_id'], $checkId, [
            'check_number' => $check['check_number'],
            'amount' => $check['amount'],
            'payee' => $check['payee']
        ]);

        $pdo->commit();
        successResponse(['message' => 'Check deleted successfully']);

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Error deleting check: ' . $e->getMessage());
    }
}

function logTrustAudit(PDO $pdo, int $userId, string $action, int $clientId, ?int $referenceId, array $details): void {
    try {
        $sql = "INSERT INTO trust_audit_log (user_id, action, entity_type, entity_id, client_id, reference_id, details, ip_address, created_at)
                VALUES (:user_id, :action, :entity_type, :entity_id, :client_id, :reference_id, :details, :ip, NOW())";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'action' => $action,
            'entity_type' => 'trust_checks',
            'entity_id' => $referenceId ?? 0,
            'client_id' => $clientId,
            'reference_id' => $referenceId,
            'details' => json_encode($details),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
    } catch (Exception $e) {
        // Log silently fails - don't break main operation
        error_log("Trust audit log error: " . $e->getMessage());
    }
}
