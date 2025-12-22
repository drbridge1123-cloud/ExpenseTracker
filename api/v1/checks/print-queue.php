<?php
/**
 * Check Print Queue API
 * QuickBooks-style workflow: Write → Preview → Print → Confirm → Register
 * Print ≠ Register - Transaction NOT recorded until explicit confirmation
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
        handlePut($db, $pdo);
        break;
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

/**
 * GET - Fetch queue items or generate preview
 */
function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $queueId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $status = $_GET['status'] ?? null;
    $action = $_GET['action'] ?? 'list';

    // Single item fetch
    if ($queueId) {
        $sql = "SELECT q.*,
                       l.client_id,
                       tc.client_name,
                       a.account_name as bank_account_name,
                       a.account_number_last4,
                       e.name as entity_name,
                       e.display_name as entity_display_name,
                       e.address_line1, e.address_line2, e.city, e.state, e.zip_code,
                       c.case_number, c.case_name,
                       cat.name as category_name
                FROM check_print_queue q
                LEFT JOIN trust_ledger l ON q.ledger_id = l.id
                LEFT JOIN trust_clients tc ON l.client_id = tc.id
                LEFT JOIN accounts a ON l.account_id = a.id
                LEFT JOIN entities e ON q.entity_id = e.id
                LEFT JOIN cases c ON q.case_id = c.id
                LEFT JOIN categories cat ON q.category_id = cat.id
                WHERE q.id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $queueId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            errorResponse('Queue item not found', 404);
        }

        // Build payee address block
        $addressParts = array_filter([
            $item['address_line1'],
            $item['address_line2'],
            implode(', ', array_filter([$item['city'], $item['state']]))
                . ($item['zip_code'] ? ' ' . $item['zip_code'] : '')
        ]);
        $item['payee_address_formatted'] = implode("\n", $addressParts);

        successResponse(['queue_item' => $item]);
        return;
    }

    // List queue items
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'q.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($status) {
        $where[] = 'q.queue_status = :status';
        $params['status'] = $status;
    } else {
        // By default, exclude confirmed/cancelled items
        $where[] = "q.queue_status NOT IN ('confirmed', 'cancelled')";
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT q.*,
                   tc.client_name,
                   a.account_name as bank_account_name,
                   e.name as entity_name,
                   c.case_number, c.case_name,
                   cat.name as category_name
            FROM check_print_queue q
            LEFT JOIN trust_ledger l ON q.ledger_id = l.id
            LEFT JOIN trust_clients tc ON l.client_id = tc.id
            LEFT JOIN accounts a ON l.account_id = a.id
            LEFT JOIN entities e ON q.entity_id = e.id
            LEFT JOIN cases c ON q.case_id = c.id
            LEFT JOIN categories cat ON q.category_id = cat.id
            WHERE $whereClause
            ORDER BY q.created_at DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get status summary
    $summarySql = "SELECT
                    COUNT(CASE WHEN queue_status = 'queued' THEN 1 END) as queued_count,
                    COUNT(CASE WHEN queue_status = 'previewing' THEN 1 END) as previewing_count,
                    COUNT(CASE WHEN queue_status = 'printed' THEN 1 END) as printed_count,
                    SUM(CASE WHEN queue_status IN ('queued', 'previewing', 'printing') THEN amount ELSE 0 END) as pending_amount
                   FROM check_print_queue
                   WHERE user_id = :user_id AND queue_status NOT IN ('confirmed', 'cancelled')";
    $summaryStmt = $pdo->prepare($summarySql);
    $summaryStmt->execute(['user_id' => $userId]);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    successResponse([
        'queue_items' => $items,
        'summary' => $summary
    ]);
}

/**
 * POST - Add check to print queue (Stage 1: Write Check)
 */
function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $ledgerId = !empty($input['ledger_id']) ? (int)$input['ledger_id'] : null;
    $entityId = !empty($input['entity_id']) ? (int)$input['entity_id'] : null;
    $caseId = !empty($input['case_id']) ? (int)$input['case_id'] : null;
    $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
    $checkNumber = trim($input['check_number'] ?? '');
    $amount = !empty($input['amount']) ? (float)$input['amount'] : 0;
    $checkDate = $input['check_date'] ?? date('Y-m-d');
    $memo = trim($input['memo'] ?? '');

    // Validation - All fields required per QuickBooks workflow
    $errors = [];
    if (!$userId) $errors[] = 'user_id';
    if (!$ledgerId) $errors[] = 'ledger_id (Bank Account)';
    if (!$entityId) $errors[] = 'entity_id (Recipient)';
    if (!$checkNumber) $errors[] = 'check_number';
    if ($amount <= 0) $errors[] = 'amount';
    if (!$memo) $errors[] = 'memo';
    if (!$categoryId) $errors[] = 'category_id';
    if (!$caseId) $errors[] = 'case_id (Case Number)';

    if (!empty($errors)) {
        errorResponse('Missing required fields: ' . implode(', ', $errors));
    }

    // Verify entity exists and is payable (can receive checks)
    $entitySql = "SELECT e.*, et.is_payable
                  FROM entities e
                  JOIN entity_types et ON e.entity_type_id = et.id
                  WHERE e.id = :id AND e.is_active = 1";
    $entityStmt = $pdo->prepare($entitySql);
    $entityStmt->execute(['id' => $entityId]);
    $entity = $entityStmt->fetch(PDO::FETCH_ASSOC);

    if (!$entity) {
        errorResponse('Entity not found or inactive');
    }

    if (!$entity['is_payable']) {
        errorResponse('This entity type cannot receive checks (e.g., Customer)');
    }

    // Verify ledger exists and check balance
    $ledgerSql = "SELECT l.*, a.account_name
                  FROM trust_ledger l
                  JOIN accounts a ON l.account_id = a.id
                  WHERE l.id = :id";
    $ledgerStmt = $pdo->prepare($ledgerSql);
    $ledgerStmt->execute(['id' => $ledgerId]);
    $ledger = $ledgerStmt->fetch(PDO::FETCH_ASSOC);

    if (!$ledger) {
        errorResponse('Bank account ledger not found');
    }

    if ($amount > (float)$ledger['current_balance']) {
        errorResponse('Insufficient funds. Available: $' . number_format($ledger['current_balance'], 2));
    }

    // Check for duplicate check number in queue or registered checks
    $dupCheckSql = "SELECT id FROM check_print_queue
                    WHERE user_id = :user_id AND ledger_id = :ledger_id
                    AND check_number = :check_number AND queue_status != 'cancelled'";
    $dupCheckStmt = $pdo->prepare($dupCheckSql);
    $dupCheckStmt->execute([
        'user_id' => $userId,
        'ledger_id' => $ledgerId,
        'check_number' => $checkNumber
    ]);
    if ($dupCheckStmt->fetch()) {
        errorResponse('Check number already exists in print queue');
    }

    $dupRegSql = "SELECT id FROM trust_checks
                  WHERE user_id = :user_id AND ledger_id = :ledger_id AND check_number = :check_number";
    $dupRegStmt = $pdo->prepare($dupRegSql);
    $dupRegStmt->execute([
        'user_id' => $userId,
        'ledger_id' => $ledgerId,
        'check_number' => $checkNumber
    ]);
    if ($dupRegStmt->fetch()) {
        errorResponse('Check number already registered');
    }

    // Build payee address from entity
    $addressParts = array_filter([
        $entity['address_line1'],
        $entity['address_line2'],
        implode(', ', array_filter([$entity['city'], $entity['state']]))
            . ($entity['zip_code'] ? ' ' . $entity['zip_code'] : '')
    ]);
    $payeeAddress = implode("\n", $addressParts);

    // Convert amount to words
    $amountWords = numberToWords($amount);

    try {
        $data = [
            'user_id' => $userId,
            'ledger_id' => $ledgerId,
            'entity_id' => $entityId,
            'case_id' => $caseId,
            'category_id' => $categoryId,
            'check_number' => sanitize($checkNumber),
            'payee_name' => $entity['display_name'] ?: $entity['name'],
            'payee_address' => $payeeAddress,
            'amount' => $amount,
            'amount_words' => $amountWords,
            'check_date' => $checkDate,
            'memo' => sanitize($memo),
            'queue_status' => 'queued',
            'is_registered' => 0
        ];

        $queueId = $db->insert('check_print_queue', $data);

        successResponse([
            'id' => $queueId,
            'check_number' => $checkNumber,
            'amount' => $amount,
            'payee_name' => $data['payee_name'],
            'queue_status' => 'queued'
        ], 'Check added to print queue');

    } catch (Exception $e) {
        errorResponse('Error adding to queue: ' . $e->getMessage());
    }
}

/**
 * PUT - Update queue status (Preview, Print, Confirm, Register)
 */
function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $queueId = !empty($input['id']) ? (int)$input['id'] : null;
    $action = $input['action'] ?? null;

    if (!$queueId || !$action) {
        errorResponse('Queue ID and action are required');
    }

    // Get queue item
    $itemSql = "SELECT q.*, l.client_id, l.current_balance as ledger_balance
                FROM check_print_queue q
                JOIN trust_ledger l ON q.ledger_id = l.id
                WHERE q.id = :id";
    $itemStmt = $pdo->prepare($itemSql);
    $itemStmt->execute(['id' => $queueId]);
    $item = $itemStmt->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        errorResponse('Queue item not found', 404);
    }

    if ($item['is_registered']) {
        errorResponse('Check already registered');
    }

    try {
        $pdo->beginTransaction();

        switch ($action) {
            case 'preview':
                // Stage 2: Mark as previewing
                $db->query(
                    "UPDATE check_print_queue SET queue_status = 'previewing', preview_generated_at = NOW() WHERE id = :id",
                    ['id' => $queueId]
                );
                $pdo->commit();
                successResponse(['status' => 'previewing'], 'Preview generated');
                break;

            case 'print':
                // Stage 3: Mark as printing/printed
                $db->query(
                    "UPDATE check_print_queue SET queue_status = 'printed', print_attempted_at = NOW(), print_completed_at = NOW() WHERE id = :id",
                    ['id' => $queueId]
                );
                $pdo->commit();
                successResponse(['status' => 'printed'], 'Print completed - awaiting confirmation');
                break;

            case 'confirm':
                // Stage 4: Confirm and REGISTER the transaction
                // Verify final check number (may have changed during print)
                $finalCheckNumber = isset($input['final_check_number'])
                    ? trim($input['final_check_number'])
                    : $item['check_number'];

                // Re-verify funds
                if ($item['amount'] > $item['ledger_balance']) {
                    $pdo->rollBack();
                    errorResponse('Insufficient funds. Available: $' . number_format($item['ledger_balance'], 2));
                }

                // Create the ACTUAL check record (this is when the transaction is REGISTERED)
                $checkData = [
                    'user_id' => $item['user_id'],
                    'ledger_id' => $item['ledger_id'],
                    'check_number' => $finalCheckNumber,
                    'payee' => $item['payee_name'],
                    'payee_address' => $item['payee_address'],
                    'amount' => $item['amount'],
                    'check_date' => $item['check_date'],
                    'memo' => $item['memo'],
                    'entity_id' => $item['entity_id'],
                    'case_id' => $item['case_id'],
                    'category_id' => $item['category_id'],
                    'status' => 'pending',
                    'print_status' => 'printed',
                    'printed_at' => date('Y-m-d H:i:s'),
                    'registered_at' => date('Y-m-d H:i:s')
                ];

                $checkId = $db->insert('trust_checks', $checkData);

                // Deduct from ledger balance
                $db->query(
                    "UPDATE trust_ledger SET current_balance = current_balance - :amount WHERE id = :id",
                    ['amount' => $item['amount'], 'id' => $item['ledger_id']]
                );

                // Create trust transaction record
                $newBalance = $item['ledger_balance'] - $item['amount'];
                $transData = [
                    'user_id' => $item['user_id'],
                    'ledger_id' => $item['ledger_id'],
                    'transaction_type' => 'disbursement',
                    'amount' => -$item['amount'],
                    'transaction_date' => $item['check_date'],
                    'description' => "Check #{$finalCheckNumber} to {$item['payee_name']}"
                        . ($item['memo'] ? " - {$item['memo']}" : ''),
                    'reference_number' => "CHK-{$finalCheckNumber}",
                    'running_balance' => $newBalance,
                    'entity_id' => $item['entity_id'],
                    'case_id' => $item['case_id'],
                    'category_id' => $item['category_id'],
                    'payee' => $item['payee_name']
                ];

                $db->insert('trust_transactions', $transData);

                // Update queue item as confirmed and registered
                $db->query(
                    "UPDATE check_print_queue SET
                        queue_status = 'confirmed',
                        confirmed_at = NOW(),
                        is_registered = 1,
                        registered_check_id = :check_id,
                        registered_at = NOW(),
                        check_number = :check_number
                     WHERE id = :id",
                    ['check_id' => $checkId, 'check_number' => $finalCheckNumber, 'id' => $queueId]
                );

                // Audit log
                logQueueAudit($pdo, $item['user_id'], 'check_registered', $item['client_id'], $checkId, [
                    'check_number' => $finalCheckNumber,
                    'amount' => $item['amount'],
                    'payee' => $item['payee_name'],
                    'queue_id' => $queueId
                ]);

                $pdo->commit();
                successResponse([
                    'status' => 'confirmed',
                    'check_id' => $checkId,
                    'check_number' => $finalCheckNumber
                ], 'Check registered successfully');
                break;

            case 'cancel':
                $reason = trim($input['cancel_reason'] ?? 'User cancelled');
                $db->query(
                    "UPDATE check_print_queue SET queue_status = 'cancelled', cancelled_at = NOW(), cancel_reason = :reason WHERE id = :id",
                    ['reason' => $reason, 'id' => $queueId]
                );
                $pdo->commit();
                successResponse(['status' => 'cancelled'], 'Check cancelled');
                break;

            default:
                $pdo->rollBack();
                errorResponse('Invalid action. Use: preview, print, confirm, cancel');
        }

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Error updating queue: ' . $e->getMessage());
    }
}

/**
 * DELETE - Remove from queue (only if not registered)
 */
function handleDelete(Database $db, PDO $pdo): void {
    $queueId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$queueId) {
        errorResponse('Queue ID required');
    }

    $item = $db->fetch("SELECT * FROM check_print_queue WHERE id = :id", ['id' => $queueId]);

    if (!$item) {
        errorResponse('Queue item not found', 404);
    }

    if ($item['is_registered']) {
        errorResponse('Cannot delete registered check. Use void instead.');
    }

    $db->query("DELETE FROM check_print_queue WHERE id = :id", ['id' => $queueId]);

    successResponse(null, 'Queue item deleted');
}

/**
 * Convert number to words for check amount
 */
function numberToWords(float $amount): string {
    $ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
             'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
             'Seventeen', 'Eighteen', 'Nineteen'];
    $tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    $dollars = (int)floor($amount);
    $cents = round(($amount - $dollars) * 100);

    if ($dollars == 0) {
        $words = 'Zero';
    } else {
        $words = '';

        if ($dollars >= 1000000) {
            $millions = (int)floor($dollars / 1000000);
            $words .= convertHundreds($millions, $ones, $tens) . ' Million ';
            $dollars %= 1000000;
        }

        if ($dollars >= 1000) {
            $thousands = (int)floor($dollars / 1000);
            $words .= convertHundreds($thousands, $ones, $tens) . ' Thousand ';
            $dollars %= 1000;
        }

        if ($dollars > 0) {
            $words .= convertHundreds($dollars, $ones, $tens);
        }

        $words = trim($words);
    }

    return $words . ' and ' . str_pad($cents, 2, '0', STR_PAD_LEFT) . '/100 Dollars';
}

function convertHundreds(int $num, array $ones, array $tens): string {
    $result = '';

    if ($num >= 100) {
        $result .= $ones[(int)floor($num / 100)] . ' Hundred ';
        $num %= 100;
    }

    if ($num >= 20) {
        $result .= $tens[(int)floor($num / 10)] . ' ';
        $num %= 10;
    }

    if ($num > 0) {
        $result .= $ones[$num];
    }

    return trim($result);
}

function logQueueAudit(PDO $pdo, int $userId, string $action, ?int $clientId, ?int $referenceId, array $details): void {
    try {
        $sql = "INSERT INTO trust_audit_log (user_id, action, entity_type, entity_id, client_id, reference_id, details, ip_address, created_at)
                VALUES (:user_id, :action, :entity_type, :entity_id, :client_id, :reference_id, :details, :ip, NOW())";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'action' => $action,
            'entity_type' => 'check_print_queue',
            'entity_id' => $referenceId ?? 0,
            'client_id' => $clientId ?? 0,
            'reference_id' => $referenceId,
            'details' => json_encode($details),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
    } catch (Exception $e) {
        error_log("Queue audit log error: " . $e->getMessage());
    }
}
