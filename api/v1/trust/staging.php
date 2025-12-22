<?php
/**
 * Trust Staging API
 * Manages staged transactions before posting to accounting
 *
 * Workflow: CSV Import → Unassigned → Assigned → Posted
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
        handleDelete($db);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

/**
 * GET - List staged transactions
 * Supports filtering by status, client, date range
 */
function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $status = $_GET['status'] ?? null; // unassigned, assigned, posted, rejected
    $clientId = !empty($_GET['client_id']) ? (int)$_GET['client_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $batchId = $_GET['batch_id'] ?? null;
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    // Single record
    if ($id) {
        $sql = "SELECT s.*, a.account_name, c.client_name, c.matter_number
                FROM trust_staging s
                JOIN accounts a ON s.account_id = a.id
                LEFT JOIN trust_clients c ON s.client_id = c.id
                WHERE s.id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            errorResponse('Staging record not found', 404);
        }

        successResponse(['staging' => $record]);
    }

    // Build query
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 's.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($status) {
        $where[] = 's.status = :status';
        $params['status'] = $status;
    }

    if ($clientId) {
        $where[] = 's.client_id = :client_id';
        $params['client_id'] = $clientId;
    }

    if ($accountId) {
        $where[] = 's.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    if ($batchId) {
        $where[] = 's.import_batch_id = :batch_id';
        $params['batch_id'] = $batchId;
    }

    $whereClause = implode(' AND ', $where);

    // Get totals by status
    $summarySQL = "SELECT
                       status,
                       COUNT(*) as count,
                       SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as deposits,
                       SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as withdrawals,
                       SUM(amount) as net
                   FROM trust_staging s
                   WHERE $whereClause
                   GROUP BY status";
    $summaryStmt = $pdo->prepare($summarySQL);
    $summaryStmt->execute($params);
    $summary = [];
    while ($row = $summaryStmt->fetch(PDO::FETCH_ASSOC)) {
        $summary[$row['status']] = [
            'count' => (int)$row['count'],
            'deposits' => (float)$row['deposits'],
            'withdrawals' => (float)$row['withdrawals'],
            'net' => (float)$row['net']
        ];
    }

    // Get grand total (all statuses combined) - Bank Statement total
    $totalSQL = "SELECT
                     COUNT(*) as count,
                     SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as deposits,
                     SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as withdrawals,
                     SUM(amount) as net
                 FROM trust_staging s
                 WHERE $whereClause";
    $totalStmt = $pdo->prepare($totalSQL);
    $totalStmt->execute($params);
    $totalRow = $totalStmt->fetch(PDO::FETCH_ASSOC);
    $summary['total'] = [
        'count' => (int)($totalRow['count'] ?? 0),
        'deposits' => (float)($totalRow['deposits'] ?? 0),
        'withdrawals' => (float)($totalRow['withdrawals'] ?? 0),
        'net' => (float)($totalRow['net'] ?? 0)
    ];

    // Get list
    $sql = "SELECT s.*, a.account_name, c.client_name, c.matter_number
            FROM trust_staging s
            JOIN accounts a ON s.account_id = a.id
            LEFT JOIN trust_clients c ON s.client_id = c.id
            WHERE $whereClause
            ORDER BY s.transaction_date DESC, s.id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format
    foreach ($records as &$r) {
        $r['amount'] = (float)$r['amount'];
    }

    successResponse([
        'staging' => $records,
        'summary' => $summary,
        'total_count' => count($records)
    ]);
}

/**
 * POST - Create staging record or import CSV
 */
function handlePost(Database $db, PDO $pdo): void {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    // Check if file upload (CSV import)
    if (isset($_FILES['csv_file'])) {
        handleCsvImport($db, $pdo);
        return;
    }

    // Regular JSON create or action
    $input = json_decode(file_get_contents('php://input'), true);

    // Handle bulk actions
    if (!empty($input['action'])) {
        switch ($input['action']) {
            case 'bulk_delete':
            case 'delete':
                handleBulkDelete($db, $pdo, $input);
                return;
            case 'assign':
                handleBulkAssign($db, $pdo, $input);
                return;
            case 'unassign':
                handleBulkUnassign($db, $pdo, $input);
                return;
            case 'unpost':
                handleBulkUnpost($db, $pdo, $input);
                return;
            case 'post':
                handleBulkPost($db, $pdo, $input);
                return;
            case 'find_matches':
                handleFindMatches($db, $pdo, $input);
                return;
            case 'match':
                handleMatch($db, $pdo, $input);
                return;
        }
    }

    $required = ['user_id', 'account_id', 'transaction_date', 'amount', 'description'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || $input[$field] === '') {
            errorResponse("Field '$field' is required");
        }
    }

    // Determine transaction type
    $amount = (float)$input['amount'];
    $type = $input['transaction_type'] ?? 'other';
    if ($type === 'other') {
        $type = $amount > 0 ? 'deposit' : 'check';
    }

    $data = [
        'user_id' => (int)$input['user_id'],
        'account_id' => (int)$input['account_id'],
        'transaction_date' => $input['transaction_date'],
        'transaction_type' => $type,
        'amount' => $amount,
        'description' => sanitize($input['description']),
        'reference_number' => $input['reference_number'] ?? null,
        'payee' => $input['payee'] ?? null,
        'memo' => $input['memo'] ?? null,
        'status' => 'unassigned'
    ];

    // If client_id provided, set to assigned
    if (!empty($input['client_id'])) {
        $data['client_id'] = (int)$input['client_id'];
        $data['status'] = 'assigned';
        $data['assigned_at'] = date('Y-m-d H:i:s');
        $data['assigned_by'] = $input['user_id'];
    }

    $id = $db->insert('trust_staging', $data);

    // Log
    $db->insert('trust_audit_log', [
        'user_id' => $input['user_id'],
        'action' => 'deposit',
        'entity_type' => 'trust_staging',
        'entity_id' => $id,
        'new_values' => json_encode($data),
        'description' => 'Staging record created',
        'ip_address' => getClientIp()
    ]);

    $record = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

    successResponse(['staging' => $record], 'Staging record created');
}

/**
 * Handle CSV Import to Staging
 */
function handleCsvImport(Database $db, PDO $pdo): void {
    $userId = !empty($_POST['user_id']) ? (int)$_POST['user_id'] : null;
    $accountId = !empty($_POST['account_id']) ? (int)$_POST['account_id'] : null;

    if (!$userId || !$accountId) {
        errorResponse('user_id and account_id are required');
    }

    if ($_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
        errorResponse('CSV file upload failed');
    }

    $file = fopen($_FILES['csv_file']['tmp_name'], 'r');
    if (!$file) {
        errorResponse('Failed to open CSV file');
    }

    // Read header
    $header = fgetcsv($file);
    if (!$header) {
        fclose($file);
        errorResponse('Empty CSV file');
    }

    // Normalize headers
    $header = array_map(function($col) {
        $col = preg_replace('/^\xEF\xBB\xBF/', '', $col); // Remove BOM
        return strtolower(trim(preg_replace('/\s+/', ' ', $col)));
    }, $header);

    // Find columns
    $findColumn = function($names) use ($header) {
        foreach ($names as $name) {
            $idx = array_search(strtolower($name), $header);
            if ($idx !== false) return $idx;
        }
        return false;
    };

    // Expanded column name support for various bank CSV formats
    $dateIdx = $findColumn([
        'date', 'transaction_date', 'trans_date', 'trans date',
        'posting date', 'post date', 'posted date', 'effective date', 'value date',
        'settlement date', 'trade date', 'process date', 'processed date'
    ]);

    // Try amount column first, then check for separate debit/credit columns
    $amountIdx = $findColumn([
        'amount', 'amt', 'transaction amount', 'trans amount',
        'net amount', 'total', 'sum'
    ]);

    // Some banks use separate debit/credit columns
    $debitIdx = $findColumn(['debit', 'withdrawal', 'withdrawals', 'debit amount', 'money out']);
    $creditIdx = $findColumn(['credit', 'deposit', 'deposits', 'credit amount', 'money in']);

    // If no amount column but we have debit/credit, we'll handle it in the row processing
    $useSeparateDebitCredit = ($amountIdx === false && ($debitIdx !== false || $creditIdx !== false));

    $descIdx = $findColumn([
        'description', 'desc', 'memo', 'details', 'transaction description',
        'narrative', 'particulars', 'remarks', 'note', 'notes', 'name'
    ]);
    $typeIdx = $findColumn(['type', 'transaction_type', 'trans_type', 'category', 'transaction category']);
    $refIdx = $findColumn([
        'reference', 'reference_number', 'ref', 'check_number', 'check #', 'check#',
        'check number', 'confirmation', 'confirmation number', 'transaction id', 'trans id'
    ]);
    $payeeIdx = $findColumn(['payee', 'vendor', 'recipient', 'merchant', 'merchant name']);

    // Validate we have date and either amount or debit/credit columns
    if ($dateIdx === false) {
        fclose($file);
        errorResponse('CSV must have a date column (e.g., Date, Posting Date, Transaction Date)');
    }
    if ($amountIdx === false && !$useSeparateDebitCredit) {
        fclose($file);
        errorResponse('CSV must have amount column (e.g., Amount) or separate Debit/Credit columns');
    }

    // Generate batch ID
    $batchId = 'IMPORT_' . date('YmdHis') . '_' . substr(md5(uniqid()), 0, 6);

    $imported = 0;
    $skipped = 0;
    $duplicates = 0;
    $errors = [];
    $skippedList = [];

    // Pre-load existing transactions for duplicate checking (check# + amount)
    $existingTransactions = $db->fetchAll(
        "SELECT reference_number, amount FROM trust_transactions t
         JOIN trust_ledger l ON t.ledger_id = l.id
         WHERE t.user_id = :user_id AND l.account_id = :account_id
         AND t.reference_number IS NOT NULL AND t.reference_number != ''",
        ['user_id' => $userId, 'account_id' => $accountId]
    );

    // Also check staging table for duplicates
    $existingStaging = $db->fetchAll(
        "SELECT reference_number, amount FROM trust_staging
         WHERE user_id = :user_id AND account_id = :account_id
         AND reference_number IS NOT NULL AND reference_number != ''",
        ['user_id' => $userId, 'account_id' => $accountId]
    );

    // Build lookup map: "ref|amount" => true
    $existingMap = [];
    foreach ($existingTransactions as $tx) {
        $key = trim($tx['reference_number']) . '|' . round((float)$tx['amount'], 2);
        $existingMap[$key] = true;
    }
    foreach ($existingStaging as $st) {
        $key = trim($st['reference_number']) . '|' . round((float)$st['amount'], 2);
        $existingMap[$key] = true;
    }

    $pdo->beginTransaction();

    try {
        $rowNum = 1;
        while (($row = fgetcsv($file)) !== false) {
            $rowNum++;

            $date = trim($row[$dateIdx] ?? '');

            // Get amount from either single amount column or debit/credit columns
            if ($amountIdx !== false) {
                $amount = trim($row[$amountIdx] ?? '');
            } else {
                // Use separate debit/credit columns
                $debitVal = $debitIdx !== false ? trim($row[$debitIdx] ?? '') : '';
                $creditVal = $creditIdx !== false ? trim($row[$creditIdx] ?? '') : '';

                // Parse both values
                $debitVal = preg_replace('/[^0-9.\-]/', '', $debitVal);
                $creditVal = preg_replace('/[^0-9.\-]/', '', $creditVal);
                $debitNum = $debitVal !== '' ? (float)$debitVal : 0;
                $creditNum = $creditVal !== '' ? (float)$creditVal : 0;

                // Debit is negative (money out), credit is positive (money in)
                if ($debitNum > 0) {
                    $amount = -abs($debitNum);
                } elseif ($creditNum > 0) {
                    $amount = abs($creditNum);
                } else {
                    $amount = 0;
                }
            }

            if (empty($date)) {
                $errors[] = "Row $rowNum: Missing date";
                $skipped++;
                continue;
            }

            // Parse amount (remove currency symbols, commas) if it's still a string
            if (is_string($amount)) {
                $amount = preg_replace('/[^0-9.\-]/', '', $amount);
                $amount = (float)$amount;
            }

            if ($amount == 0) {
                $skipped++;
                continue;
            }

            // Parse date
            $parsedDate = strtotime($date);
            if (!$parsedDate) {
                $errors[] = "Row $rowNum: Invalid date '$date'";
                $skipped++;
                continue;
            }
            $date = date('Y-m-d', $parsedDate);

            // Determine type
            $type = 'other';
            if ($typeIdx !== false && !empty($row[$typeIdx])) {
                $typeStr = strtolower(trim($row[$typeIdx]));
                if (strpos($typeStr, 'deposit') !== false) $type = 'deposit';
                elseif (strpos($typeStr, 'check') !== false) $type = 'check';
                elseif (strpos($typeStr, 'transfer') !== false) $type = 'transfer';
                elseif (strpos($typeStr, 'fee') !== false) $type = 'fee';
            }
            if ($type === 'other') {
                $type = $amount > 0 ? 'deposit' : 'check';
            }

            $description = $descIdx !== false ? trim($row[$descIdx] ?? '') : '';
            $reference = $refIdx !== false ? trim($row[$refIdx] ?? '') : null;
            $payee = $payeeIdx !== false ? trim($row[$payeeIdx] ?? '') : null;

            if (empty($description)) {
                $description = $type === 'deposit' ? 'Deposit' : 'Check/Withdrawal';
            }

            // Check for duplicates (check# + amount)
            if ($reference) {
                $dupKey = trim($reference) . '|' . round($amount, 2);
                if (isset($existingMap[$dupKey])) {
                    $duplicates++;
                    $skippedList[] = [
                        'row' => $rowNum,
                        'date' => $date,
                        'reference' => $reference,
                        'amount' => $amount,
                        'description' => $description,
                        'reason' => 'Duplicate (check# + amount already exists)'
                    ];
                    continue;
                }
                // Add to map to prevent duplicates within same import
                $existingMap[$dupKey] = true;
            }

            // Insert staging record
            $sql = "INSERT INTO trust_staging
                    (user_id, account_id, transaction_date, transaction_type, amount,
                     description, reference_number, payee, original_csv_row,
                     import_batch_id, csv_row_number, status)
                    VALUES
                    (:user_id, :account_id, :date, :type, :amount,
                     :description, :reference, :payee, :csv_row,
                     :batch_id, :row_num, 'unassigned')";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'user_id' => $userId,
                'account_id' => $accountId,
                'date' => $date,
                'type' => $type,
                'amount' => $amount,
                'description' => $description,
                'reference' => $reference,
                'payee' => $payee,
                'csv_row' => json_encode($row),
                'batch_id' => $batchId,
                'row_num' => $rowNum
            ]);

            $imported++;
        }

        $pdo->commit();
        fclose($file);

        // Log import
        $db->insert('trust_audit_log', [
            'user_id' => $userId,
            'action' => 'deposit',
            'entity_type' => 'trust_staging',
            'entity_id' => 0,
            'new_values' => json_encode(['batch_id' => $batchId, 'imported' => $imported]),
            'description' => "CSV Import: $imported records imported",
            'ip_address' => getClientIp()
        ]);

        $message = "$imported transactions imported to staging";
        if ($duplicates > 0) {
            $message .= ", $duplicates duplicates skipped";
        }

        successResponse([
            'imported' => $imported,
            'skipped' => $skipped,
            'duplicates' => $duplicates,
            'batch_id' => $batchId,
            'errors' => $errors,
            'skipped_list' => $skippedList
        ], $message);

    } catch (Exception $e) {
        $pdo->rollBack();
        fclose($file);
        errorResponse('Import failed: ' . $e->getMessage());
    }
}

/**
 * PUT - Update staging record (assign client, change status)
 */
function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['id'])) {
        errorResponse('Staging record ID is required');
    }

    $id = (int)$input['id'];
    $existing = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

    if (!$existing) {
        errorResponse('Staging record not found', 404);
    }

    // Cannot modify posted records
    if ($existing['status'] === 'posted') {
        errorResponse('Cannot modify posted transactions');
    }

    $updateData = [];
    $allowedFields = ['transaction_date', 'transaction_type', 'amount', 'description',
                      'reference_number', 'payee', 'memo'];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $updateData[$field] = $input[$field];
        }
    }

    // Handle client assignment
    if (isset($input['client_id'])) {
        if ($input['client_id']) {
            // Verify client exists
            $client = $db->fetch("SELECT id FROM trust_clients WHERE id = :id",
                                 ['id' => $input['client_id']]);
            if (!$client) {
                errorResponse('Client not found');
            }
            $updateData['client_id'] = (int)$input['client_id'];
            $updateData['status'] = 'assigned';
            $updateData['assigned_at'] = date('Y-m-d H:i:s');
            $updateData['assigned_by'] = $input['user_id'] ?? $existing['user_id'];
        } else {
            // Unassign
            $updateData['client_id'] = null;
            $updateData['status'] = 'unassigned';
            $updateData['assigned_at'] = null;
            $updateData['assigned_by'] = null;
        }
    }

    // Handle rejection
    if (isset($input['status']) && $input['status'] === 'rejected') {
        $updateData['status'] = 'rejected';
        $updateData['rejected_at'] = date('Y-m-d H:i:s');
        $updateData['rejected_by'] = $input['user_id'] ?? $existing['user_id'];
        $updateData['rejection_reason'] = $input['rejection_reason'] ?? null;
    }

    if (empty($updateData)) {
        errorResponse('No fields to update');
    }

    $db->update('trust_staging', $updateData, 'id = :id', ['id' => $id]);

    // Log
    $db->insert('trust_audit_log', [
        'user_id' => $existing['user_id'],
        'action' => 'ledger_updated',
        'entity_type' => 'trust_staging',
        'entity_id' => $id,
        'client_id' => $updateData['client_id'] ?? $existing['client_id'],
        'old_values' => json_encode($existing),
        'new_values' => json_encode($updateData),
        'ip_address' => getClientIp()
    ]);

    $updated = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

    successResponse(['staging' => $updated], 'Staging record updated');
}

/**
 * DELETE - Remove staging record (only unassigned/assigned)
 */
function handleDelete(Database $db): void {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('Staging record ID is required');
    }

    $existing = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

    if (!$existing) {
        errorResponse('Staging record not found', 404);
    }

    if ($existing['status'] === 'posted') {
        errorResponse('Cannot delete posted transactions');
    }

    $db->delete('trust_staging', 'id = :id', ['id' => $id]);

    // Log
    $db->insert('trust_audit_log', [
        'user_id' => $existing['user_id'],
        'action' => 'ledger_updated',
        'entity_type' => 'trust_staging',
        'entity_id' => $id,
        'old_values' => json_encode($existing),
        'description' => 'Staging record deleted',
        'ip_address' => getClientIp()
    ]);

    successResponse(null, 'Staging record deleted');
}

/**
 * Handle bulk assign of staging records to a client
 */
function handleBulkAssign(Database $db, PDO $pdo, array $input): void {
    $stagingIds = $input['ids'] ?? $input['staging_ids'] ?? [];
    if (empty($stagingIds) || !is_array($stagingIds)) {
        errorResponse('ids array is required');
    }

    $clientId = !empty($input['client_id']) ? (int)$input['client_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$clientId) {
        errorResponse('client_id is required');
    }

    // Verify client exists
    $client = $db->fetch("SELECT id, client_name FROM trust_clients WHERE id = :id", ['id' => $clientId]);
    if (!$client) {
        errorResponse('Client not found', 404);
    }

    $stagingIds = array_map('intval', $stagingIds);
    $assigned = 0;
    $skipped = 0;
    $errors = [];

    foreach ($stagingIds as $id) {
        $existing = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

        if (!$existing) {
            $errors[] = "ID $id: Not found";
            $skipped++;
            continue;
        }

        if ($existing['status'] === 'posted') {
            $errors[] = "ID $id: Already posted";
            $skipped++;
            continue;
        }

        $db->update('trust_staging', [
            'client_id' => $clientId,
            'status' => 'assigned',
            'assigned_at' => date('Y-m-d H:i:s'),
            'assigned_by' => $userId
        ], 'id = :id', ['id' => $id]);

        $assigned++;
    }

    // Log bulk assign
    $db->insert('trust_audit_log', [
        'user_id' => $userId ?? 1,
        'action' => 'ledger_updated',
        'entity_type' => 'trust_staging',
        'entity_id' => 0,
        'client_id' => $clientId,
        'new_values' => json_encode(['assigned' => $assigned, 'client_id' => $clientId]),
        'description' => "Bulk assign: $assigned staging records assigned to {$client['client_name']}",
        'ip_address' => getClientIp()
    ]);

    successResponse([
        'assigned' => $assigned,
        'skipped' => $skipped,
        'errors' => $errors
    ], "$assigned staging record(s) assigned to {$client['client_name']}");
}

/**
 * Handle bulk unassign of staging records (move back to unassigned)
 */
function handleBulkUnassign(Database $db, PDO $pdo, array $input): void {
    $stagingIds = $input['ids'] ?? $input['staging_ids'] ?? [];
    if (empty($stagingIds) || !is_array($stagingIds)) {
        errorResponse('ids array is required');
    }

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    $stagingIds = array_map('intval', $stagingIds);
    $unassigned = 0;
    $skipped = 0;
    $errors = [];

    foreach ($stagingIds as $id) {
        $existing = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

        if (!$existing) {
            $errors[] = "ID $id: Not found";
            $skipped++;
            continue;
        }

        if ($existing['status'] === 'posted') {
            $errors[] = "ID $id: Already posted, cannot unassign";
            $skipped++;
            continue;
        }

        if ($existing['status'] === 'unassigned') {
            $errors[] = "ID $id: Already unassigned";
            $skipped++;
            continue;
        }

        $db->update('trust_staging', [
            'client_id' => null,
            'status' => 'unassigned',
            'assigned_at' => null,
            'assigned_by' => null
        ], 'id = :id', ['id' => $id]);

        $unassigned++;
    }

    // Log bulk unassign
    $db->insert('trust_audit_log', [
        'user_id' => $userId ?? 1,
        'action' => 'ledger_updated',
        'entity_type' => 'trust_staging',
        'entity_id' => 0,
        'new_values' => json_encode(['unassigned' => $unassigned]),
        'description' => "Bulk unassign: $unassigned staging records moved back to unassigned",
        'ip_address' => getClientIp()
    ]);

    successResponse([
        'unassigned' => $unassigned,
        'skipped' => $skipped,
        'errors' => $errors
    ], "$unassigned staging record(s) moved back to unassigned");
}

/**
 * Handle bulk unpost - reverse posted staging records
 * Deletes the trust_transaction and reverts staging to assigned or unassigned
 */
function handleBulkUnpost(Database $db, PDO $pdo, array $input): void {
    $stagingIds = $input['ids'] ?? $input['staging_ids'] ?? [];
    if (empty($stagingIds) || !is_array($stagingIds)) {
        errorResponse('ids array is required');
    }

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $targetStatus = $input['target_status'] ?? 'assigned'; // 'assigned' or 'unassigned'

    $stagingIds = array_map('intval', $stagingIds);
    $unposted = 0;
    $skipped = 0;
    $errors = [];

    $pdo->beginTransaction();

    try {
        foreach ($stagingIds as $id) {
            $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

            if (!$staging) {
                $errors[] = "ID $id: Not found";
                $skipped++;
                continue;
            }

            if ($staging['status'] !== 'posted') {
                $errors[] = "ID $id: Not posted (status: {$staging['status']})";
                $skipped++;
                continue;
            }

            // Get the posted transaction ID
            $transactionId = $staging['posted_transaction_id'];

            if ($transactionId) {
                // Get the transaction to reverse the ledger balance
                $transaction = $db->fetch(
                    "SELECT * FROM trust_transactions WHERE id = :id",
                    ['id' => $transactionId]
                );

                if ($transaction) {
                    $ledgerId = $transaction['ledger_id'];
                    $amount = (float)$transaction['amount'];

                    // Get current ledger balance
                    $ledger = $db->fetch(
                        "SELECT * FROM trust_ledger WHERE id = :id",
                        ['id' => $ledgerId]
                    );

                    if ($ledger) {
                        // Reverse the balance
                        $newBalance = (float)$ledger['current_balance'] - $amount;
                        $db->update('trust_ledger',
                            ['current_balance' => $newBalance],
                            'id = :id',
                            ['id' => $ledgerId]
                        );
                    }

                    // Delete the transaction
                    $db->delete('trust_transactions', 'id = :id', ['id' => $transactionId]);
                }
            }

            // Revert staging status
            if ($targetStatus === 'unassigned') {
                $db->update('trust_staging', [
                    'status' => 'unassigned',
                    'client_id' => null,
                    'assigned_at' => null,
                    'assigned_by' => null,
                    'posted_at' => null,
                    'posted_by' => null,
                    'posted_transaction_id' => null
                ], 'id = :id', ['id' => $id]);
            } else {
                // Keep assigned status with client_id
                $db->update('trust_staging', [
                    'status' => 'assigned',
                    'posted_at' => null,
                    'posted_by' => null,
                    'posted_transaction_id' => null
                ], 'id = :id', ['id' => $id]);
            }

            $unposted++;
        }

        $pdo->commit();

        // Log bulk unpost
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?? 1,
            'action' => 'transaction_reversed',
            'entity_type' => 'trust_staging',
            'entity_id' => 0,
            'new_values' => json_encode(['unposted' => $unposted, 'target_status' => $targetStatus]),
            'description' => "Bulk unpost: $unposted staging records reversed to $targetStatus",
            'ip_address' => getClientIp()
        ]);

        successResponse([
            'unposted' => $unposted,
            'skipped' => $skipped,
            'errors' => $errors
        ], "$unposted staging record(s) unposted and moved to $targetStatus");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to unpost transactions: ' . $e->getMessage());
    }
}

/**
 * Handle bulk post of staging records to trust transactions
 */
function handleBulkPost(Database $db, PDO $pdo, array $input): void {
    $stagingIds = $input['ids'] ?? $input['staging_ids'] ?? [];
    if (empty($stagingIds) || !is_array($stagingIds)) {
        errorResponse('ids array is required');
    }

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    $stagingIds = array_map('intval', $stagingIds);
    $posted = 0;
    $skipped = 0;
    $errors = [];

    $pdo->beginTransaction();

    try {
        foreach ($stagingIds as $id) {
            $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

            if (!$staging) {
                $errors[] = "ID $id: Not found";
                $skipped++;
                continue;
            }

            if ($staging['status'] === 'posted') {
                $errors[] = "ID $id: Already posted";
                $skipped++;
                continue;
            }

            if ($staging['status'] !== 'assigned' || !$staging['client_id']) {
                $errors[] = "ID $id: Must be assigned to a client first";
                $skipped++;
                continue;
            }

            // Get or create ledger for client
            $ledger = $db->fetch(
                "SELECT id, current_balance FROM trust_ledger WHERE client_id = :client_id AND account_id = :account_id LIMIT 1",
                ['client_id' => $staging['client_id'], 'account_id' => $staging['account_id']]
            );

            if (!$ledger) {
                // Create ledger
                $ledgerId = $db->insert('trust_ledger', [
                    'user_id' => $staging['user_id'],
                    'client_id' => $staging['client_id'],
                    'account_id' => $staging['account_id'],
                    'current_balance' => 0,
                    'is_active' => 1
                ]);
                $currentBalance = 0;
            } else {
                $ledgerId = $ledger['id'];
                $currentBalance = (float)$ledger['current_balance'];
            }

            $amount = (float)$staging['amount'];
            $newBalance = $currentBalance + $amount;

            // Determine transaction type
            $type = $amount > 0 ? 'deposit' : 'disbursement';

            // Create trust transaction
            $transId = $db->insert('trust_transactions', [
                'user_id' => $staging['user_id'],
                'ledger_id' => $ledgerId,
                'transaction_type' => $type,
                'amount' => $amount,
                'running_balance' => $newBalance,
                'description' => $staging['description'],
                'payee' => $staging['payee'],
                'reference_number' => $staging['reference_number'],
                'transaction_date' => $staging['transaction_date'],
                'memo' => $staging['memo'],
                'created_by' => $userId ?? $staging['user_id']
            ]);

            // Update ledger balance
            $db->update('trust_ledger', ['current_balance' => $newBalance], 'id = :id', ['id' => $ledgerId]);

            // Mark staging as posted
            $db->update('trust_staging', [
                'status' => 'posted',
                'posted_at' => date('Y-m-d H:i:s'),
                'posted_by' => $userId,
                'posted_transaction_id' => $transId
            ], 'id = :id', ['id' => $id]);

            $posted++;
        }

        $pdo->commit();

        // Log bulk post
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?? 1,
            'action' => 'ledger_updated',
            'entity_type' => 'trust_staging',
            'entity_id' => 0,
            'new_values' => json_encode(['posted' => $posted]),
            'description' => "Bulk post: $posted staging records posted to trust transactions",
            'ip_address' => getClientIp()
        ]);

        successResponse([
            'posted' => $posted,
            'skipped' => $skipped,
            'errors' => $errors
        ], "$posted staging record(s) posted to trust transactions");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to post transactions: ' . $e->getMessage());
    }
}

/**
 * Handle bulk delete of staging records
 */
function handleBulkDelete(Database $db, PDO $pdo, array $input): void {
    $stagingIds = $input['ids'] ?? $input['staging_ids'] ?? [];
    if (empty($stagingIds) || !is_array($stagingIds)) {
        errorResponse('ids array is required');
    }

    $stagingIds = array_map('intval', $stagingIds);
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    $deleted = 0;
    $skipped = 0;
    $errors = [];

    foreach ($stagingIds as $id) {
        $existing = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $id]);

        if (!$existing) {
            $errors[] = "ID $id: Not found";
            $skipped++;
            continue;
        }

        if ($existing['status'] === 'posted') {
            $errors[] = "ID $id: Cannot delete posted transaction";
            $skipped++;
            continue;
        }

        $db->delete('trust_staging', 'id = :id', ['id' => $id]);
        $deleted++;
    }

    // Log bulk delete
    $db->insert('trust_audit_log', [
        'user_id' => $userId ?? 1,
        'action' => 'ledger_updated',
        'entity_type' => 'trust_staging',
        'entity_id' => 0,
        'new_values' => json_encode(['deleted' => $deleted, 'skipped' => $skipped]),
        'description' => "Bulk delete: $deleted staging records deleted",
        'ip_address' => getClientIp()
    ]);

    successResponse([
        'deleted' => $deleted,
        'skipped' => $skipped,
        'errors' => $errors
    ], "$deleted staging record(s) deleted");
}

/**
 * Find potential matching transactions for a staging record
 * Matches based on: same client, same amount, date within 7 days
 */
function handleFindMatches(Database $db, PDO $pdo, array $input): void {
    $stagingId = !empty($input['staging_id']) ? (int)$input['staging_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$stagingId) {
        errorResponse('staging_id is required');
    }

    // Get the staging record
    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);
    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    if ($staging['status'] === 'posted') {
        errorResponse('Cannot find matches for already posted record');
    }

    if (!$staging['client_id']) {
        errorResponse('Staging record must be assigned to a client first');
    }

    // Find matching transactions:
    // - Same client (via ledger)
    // - Same amount (exact match)
    // - Date within 7 days
    // - Not already matched to another staging record
    // - Status is 'pending' (not yet cleared)
    $sql = "SELECT t.*,
                   l.client_id,
                   tc.client_name, tc.matter_number,
                   a.account_name
            FROM trust_transactions t
            JOIN trust_ledger l ON t.ledger_id = l.id
            JOIN trust_clients tc ON l.client_id = tc.id
            JOIN accounts a ON l.account_id = a.id
            WHERE l.client_id = :client_id
              AND l.account_id = :account_id
              AND t.amount = :amount
              AND t.status = 'pending'
              AND (t.staging_id IS NULL OR t.staging_id = 0)
              AND t.transaction_date BETWEEN DATE_SUB(:tx_date, INTERVAL 14 DAY)
                                         AND DATE_ADD(:tx_date2, INTERVAL 14 DAY)
            ORDER BY ABS(DATEDIFF(t.transaction_date, :tx_date3)) ASC,
                     t.id DESC
            LIMIT 10";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'client_id' => $staging['client_id'],
        'account_id' => $staging['account_id'],
        'amount' => $staging['amount'],
        'tx_date' => $staging['transaction_date'],
        'tx_date2' => $staging['transaction_date'],
        'tx_date3' => $staging['transaction_date']
    ]);
    $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate match score for each
    foreach ($matches as &$match) {
        $dateDiff = abs(strtotime($match['transaction_date']) - strtotime($staging['transaction_date']));
        $daysDiff = floor($dateDiff / 86400);

        // Score: 100 for exact date, decreasing by 5 for each day difference
        $match['match_score'] = max(0, 100 - ($daysDiff * 5));
        $match['days_difference'] = $daysDiff;
    }

    successResponse([
        'staging' => $staging,
        'matches' => $matches,
        'match_count' => count($matches)
    ]);
}

/**
 * Match a staging record to an existing transaction
 * Links them together without creating a duplicate
 */
function handleMatch(Database $db, PDO $pdo, array $input): void {
    $stagingId = !empty($input['staging_id']) ? (int)$input['staging_id'] : null;
    $transactionId = !empty($input['transaction_id']) ? (int)$input['transaction_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$stagingId || !$transactionId) {
        errorResponse('staging_id and transaction_id are required');
    }

    // Get staging record
    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);
    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    if ($staging['status'] === 'posted') {
        errorResponse('Staging record is already posted');
    }

    // Get transaction
    $transaction = $db->fetch("SELECT * FROM trust_transactions WHERE id = :id", ['id' => $transactionId]);
    if (!$transaction) {
        errorResponse('Transaction not found', 404);
    }

    if ($transaction['staging_id']) {
        errorResponse('Transaction is already matched to another staging record');
    }

    // Verify amounts match
    if (abs((float)$staging['amount'] - (float)$transaction['amount']) > 0.01) {
        errorResponse('Amount mismatch: staging=' . $staging['amount'] . ', transaction=' . $transaction['amount']);
    }

    $pdo->beginTransaction();

    try {
        // Update transaction: mark as cleared, link to staging
        $db->update('trust_transactions', [
            'staging_id' => $stagingId,
            'status' => 'cleared',
            'cleared_date' => $staging['transaction_date']
        ], 'id = :id', ['id' => $transactionId]);

        // Update staging: mark as posted, link to transaction
        $db->update('trust_staging', [
            'matched_transaction_id' => $transactionId,
            'status' => 'posted',
            'posted_at' => date('Y-m-d H:i:s'),
            'posted_by' => $userId,
            'posted_transaction_id' => $transactionId
        ], 'id = :id', ['id' => $stagingId]);

        $pdo->commit();

        // Log the match
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?? 1,
            'action' => 'transaction_matched',
            'entity_type' => 'trust_staging',
            'entity_id' => $stagingId,
            'client_id' => $staging['client_id'],
            'new_values' => json_encode([
                'staging_id' => $stagingId,
                'transaction_id' => $transactionId,
                'amount' => $staging['amount']
            ]),
            'description' => "Matched staging #{$stagingId} to transaction #{$transactionId}",
            'ip_address' => getClientIp()
        ]);

        successResponse([
            'matched' => true,
            'staging_id' => $stagingId,
            'transaction_id' => $transactionId
        ], 'Transaction matched successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to match transaction: ' . $e->getMessage());
    }
}
