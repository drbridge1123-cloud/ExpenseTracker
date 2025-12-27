<?php
/**
 * Batch Deposits API
 * QuickBooks 스타일 배치 디파짓 관리
 *
 * GET    - 배치 목록 조회
 * POST   - 배치 생성, 아이템 추가, 포스팅
 * PUT    - 배치/아이템 수정
 * DELETE - 배치/아이템 삭제
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        handleGet($db, $pdo);
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

// =====================================================
// GET - 배치 목록 조회
// =====================================================

function handleGet(Database $db, PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $accountId = !empty($_GET['account_id']) ? (int)$_GET['account_id'] : null;
    $batchId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $status = $_GET['status'] ?? null;
    $includeItems = !empty($_GET['include_items']);

    // 단일 배치 조회
    if ($batchId) {
        $batch = $db->fetch(
            "SELECT b.*, a.account_name
             FROM deposit_batches b
             LEFT JOIN accounts a ON b.account_id = a.id
             WHERE b.id = :id",
            ['id' => $batchId]
        );

        if (!$batch) {
            errorResponse('Batch not found', 404);
        }

        // 아이템 포함
        $batch['items'] = $db->fetchAll(
            "SELECT di.*, c.client_name, c.case_number
             FROM deposit_items di
             LEFT JOIN trust_clients c ON di.client_id = c.id
             WHERE di.deposit_batch_id = :batch_id
             ORDER BY di.sequence, di.id",
            ['batch_id' => $batchId]
        );

        successResponse(['batch' => $batch]);
    }

    // 배치 목록 조회
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'b.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($accountId) {
        $where[] = 'b.account_id = :account_id';
        $params['account_id'] = $accountId;
    }

    if ($status) {
        $where[] = 'b.status = :status';
        $params['status'] = $status;
    }

    $whereClause = implode(' AND ', $where);

    $batches = $db->fetchAll(
        "SELECT b.*, a.account_name,
                (SELECT COUNT(*) FROM deposit_items WHERE deposit_batch_id = b.id) as item_count
         FROM deposit_batches b
         LEFT JOIN accounts a ON b.account_id = a.id
         WHERE $whereClause
         ORDER BY b.batch_date DESC, b.id DESC
         LIMIT 100",
        $params
    );

    // 아이템 포함 옵션
    if ($includeItems) {
        foreach ($batches as &$batch) {
            $batch['items'] = $db->fetchAll(
                "SELECT di.*, c.client_name, c.case_number
                 FROM deposit_items di
                 LEFT JOIN trust_clients c ON di.client_id = c.id
                 WHERE di.deposit_batch_id = :batch_id
                 ORDER BY di.sequence, di.id",
                ['batch_id' => $batch['id']]
            );
        }
    }

    successResponse(['batches' => $batches]);
}

// =====================================================
// POST - 배치 생성, 아이템 추가, 포스팅
// =====================================================

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? 'create_batch';

    switch ($action) {
        case 'create_batch':
            createBatch($db, $pdo, $input);
            break;
        case 'add_item':
            addItem($db, $pdo, $input);
            break;
        case 'add_items':
            addItems($db, $pdo, $input);
            break;
        case 'post':
            postBatch($db, $pdo, $input);
            break;
        case 'create_from_staging':
            createFromStaging($db, $pdo, $input);
            break;
        default:
            errorResponse('Unknown action: ' . $action);
    }
}

/**
 * 새 배치 생성
 */
function createBatch(Database $db, PDO $pdo, array $input): void {
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $accountId = !empty($input['account_id']) ? (int)$input['account_id'] : null;
    $batchDate = $input['batch_date'] ?? date('Y-m-d');
    $bankReference = $input['bank_reference'] ?? null;
    $memo = $input['memo'] ?? null;

    if (!$userId || !$accountId) {
        errorResponse('user_id and account_id are required');
    }

    $batchId = $db->insert('deposit_batches', [
        'user_id' => $userId,
        'account_id' => $accountId,
        'batch_date' => $batchDate,
        'bank_reference' => $bankReference,
        'memo' => $memo,
        'status' => 'draft',
        'total_amount' => 0,
        'item_count' => 0
    ]);

    $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);

    successResponse(['batch' => $batch], 'Batch created successfully');
}

/**
 * 배치에 아이템 추가
 */
function addItem(Database $db, PDO $pdo, array $input): void {
    $batchId = !empty($input['batch_id']) ? (int)$input['batch_id'] : null;
    $clientId = !empty($input['client_id']) ? (int)$input['client_id'] : null;
    $amount = isset($input['amount']) ? (float)$input['amount'] : null;

    if (!$batchId || !$clientId || $amount === null) {
        errorResponse('batch_id, client_id, and amount are required');
    }

    // 배치 확인
    $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
    if (!$batch) {
        errorResponse('Batch not found', 404);
    }

    if ($batch['status'] !== 'draft') {
        errorResponse('Cannot add items to a posted batch');
    }

    // 클라이언트 확인
    $client = $db->fetch("SELECT * FROM trust_clients WHERE id = :id", ['id' => $clientId]);
    if (!$client) {
        errorResponse('Client not found', 404);
    }

    // 순서 결정
    $maxSeq = $db->fetch(
        "SELECT MAX(sequence) as max_seq FROM deposit_items WHERE deposit_batch_id = :batch_id",
        ['batch_id' => $batchId]
    );
    $sequence = ($maxSeq['max_seq'] ?? 0) + 1;

    $itemId = $db->insert('deposit_items', [
        'deposit_batch_id' => $batchId,
        'client_id' => $clientId,
        'amount' => $amount,
        'check_number' => $input['check_number'] ?? null,
        'description' => $input['description'] ?? null,
        'payee_name' => $input['payee_name'] ?? null,
        'staging_id' => $input['staging_id'] ?? null,
        'sequence' => $sequence
    ]);

    // 배치 합계 업데이트
    updateBatchTotals($db, $batchId);

    $item = $db->fetch(
        "SELECT di.*, c.client_name
         FROM deposit_items di
         LEFT JOIN trust_clients c ON di.client_id = c.id
         WHERE di.id = :id",
        ['id' => $itemId]
    );

    $updatedBatch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);

    successResponse([
        'item' => $item,
        'batch' => $updatedBatch
    ], 'Item added successfully');
}

/**
 * 배치에 여러 아이템 추가
 */
function addItems(Database $db, PDO $pdo, array $input): void {
    $batchId = !empty($input['batch_id']) ? (int)$input['batch_id'] : null;
    $items = $input['items'] ?? [];

    if (!$batchId || empty($items)) {
        errorResponse('batch_id and items array are required');
    }

    // 배치 확인
    $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
    if (!$batch) {
        errorResponse('Batch not found', 404);
    }

    if ($batch['status'] !== 'draft') {
        errorResponse('Cannot add items to a posted batch');
    }

    $pdo->beginTransaction();

    try {
        $maxSeq = $db->fetch(
            "SELECT MAX(sequence) as max_seq FROM deposit_items WHERE deposit_batch_id = :batch_id",
            ['batch_id' => $batchId]
        );
        $sequence = ($maxSeq['max_seq'] ?? 0);

        $addedCount = 0;

        foreach ($items as $item) {
            $clientId = !empty($item['client_id']) ? (int)$item['client_id'] : null;
            $amount = isset($item['amount']) ? (float)$item['amount'] : null;

            if (!$clientId || $amount === null) {
                continue;
            }

            $sequence++;

            $db->insert('deposit_items', [
                'deposit_batch_id' => $batchId,
                'client_id' => $clientId,
                'amount' => $amount,
                'check_number' => $item['check_number'] ?? null,
                'description' => $item['description'] ?? null,
                'payee_name' => $item['payee_name'] ?? null,
                'staging_id' => $item['staging_id'] ?? null,
                'sequence' => $sequence
            ]);

            $addedCount++;
        }

        updateBatchTotals($db, $batchId);

        $pdo->commit();

        $updatedBatch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
        $allItems = $db->fetchAll(
            "SELECT di.*, c.client_name
             FROM deposit_items di
             LEFT JOIN trust_clients c ON di.client_id = c.id
             WHERE di.deposit_batch_id = :batch_id
             ORDER BY di.sequence",
            ['batch_id' => $batchId]
        );

        successResponse([
            'batch' => $updatedBatch,
            'items' => $allItems,
            'added' => $addedCount
        ], "$addedCount item(s) added");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to add items: ' . $e->getMessage());
    }
}

/**
 * Staging에서 배치 생성 (Split Deposit)
 */
function createFromStaging(Database $db, PDO $pdo, array $input): void {
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $stagingId = !empty($input['staging_id']) ? (int)$input['staging_id'] : null;
    $items = $input['items'] ?? [];

    if (!$userId || !$stagingId || empty($items)) {
        errorResponse('user_id, staging_id, and items array are required');
    }

    // Staging 레코드 확인
    $staging = $db->fetch("SELECT * FROM trust_staging WHERE id = :id", ['id' => $stagingId]);
    if (!$staging) {
        errorResponse('Staging record not found', 404);
    }

    if ($staging['status'] === 'posted') {
        errorResponse('Staging record already posted');
    }

    // 합계 검증
    $itemTotal = array_sum(array_column($items, 'amount'));
    $stagingAmount = (float)$staging['amount'];

    if (abs($itemTotal - $stagingAmount) > 0.01) {
        errorResponse("Items total ($itemTotal) does not match staging amount ($stagingAmount)");
    }

    $pdo->beginTransaction();

    try {
        // 배치 생성
        $batchId = $db->insert('deposit_batches', [
            'user_id' => $userId,
            'account_id' => $staging['account_id'],
            'batch_date' => $staging['transaction_date'],
            'bank_reference' => $staging['reference_number'],
            'memo' => 'Split from staging #' . $stagingId . ': ' . $staging['description'],
            'status' => 'draft',
            'total_amount' => 0,
            'item_count' => 0
        ]);

        // 아이템 추가
        $sequence = 0;
        foreach ($items as $item) {
            $sequence++;
            $db->insert('deposit_items', [
                'deposit_batch_id' => $batchId,
                'client_id' => (int)$item['client_id'],
                'amount' => (float)$item['amount'],
                'check_number' => $item['check_number'] ?? null,
                'description' => $item['description'] ?? $staging['description'],
                'payee_name' => $item['payee_name'] ?? null,
                'staging_id' => $stagingId,
                'sequence' => $sequence
            ]);
        }

        // 원본 staging을 'posted' 상태로 표시
        $db->update('trust_staging', [
            'status' => 'posted',
            'posted_at' => date('Y-m-d H:i:s'),
            'posted_by' => $userId,
            'memo' => 'Split into batch #' . $batchId
        ], 'id = :id', ['id' => $stagingId]);

        updateBatchTotals($db, $batchId);

        $pdo->commit();

        $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
        $batchItems = $db->fetchAll(
            "SELECT di.*, c.client_name
             FROM deposit_items di
             LEFT JOIN trust_clients c ON di.client_id = c.id
             WHERE di.deposit_batch_id = :batch_id
             ORDER BY di.sequence",
            ['batch_id' => $batchId]
        );

        successResponse([
            'batch' => $batch,
            'items' => $batchItems
        ], 'Batch created from staging');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to create batch: ' . $e->getMessage());
    }
}

/**
 * 배치 포스팅 - 각 아이템을 클라이언트 ledger에 기록
 */
function postBatch(Database $db, PDO $pdo, array $input): void {
    $batchId = !empty($input['batch_id']) ? (int)$input['batch_id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$batchId) {
        errorResponse('batch_id is required');
    }

    // 배치 확인
    $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
    if (!$batch) {
        errorResponse('Batch not found', 404);
    }

    if ($batch['status'] !== 'draft') {
        errorResponse('Batch already posted');
    }

    // 아이템 확인
    $items = $db->fetchAll(
        "SELECT * FROM deposit_items WHERE deposit_batch_id = :batch_id ORDER BY sequence",
        ['batch_id' => $batchId]
    );

    if (empty($items)) {
        errorResponse('Batch has no items');
    }

    $pdo->beginTransaction();

    try {
        $postedCount = 0;

        foreach ($items as $item) {
            // Ledger 가져오거나 생성
            $ledger = $db->fetch(
                "SELECT id, current_balance FROM trust_ledger
                 WHERE client_id = :client_id AND account_id = :account_id LIMIT 1",
                ['client_id' => $item['client_id'], 'account_id' => $batch['account_id']]
            );

            if (!$ledger) {
                $ledgerId = $db->insert('trust_ledger', [
                    'user_id' => $batch['user_id'],
                    'client_id' => $item['client_id'],
                    'account_id' => $batch['account_id'],
                    'current_balance' => 0,
                    'is_active' => 1
                ]);
                $currentBalance = 0;
            } else {
                $ledgerId = $ledger['id'];
                $currentBalance = (float)$ledger['current_balance'];
            }

            $amount = (float)$item['amount'];
            $newBalance = $currentBalance + $amount;
            $type = $amount > 0 ? 'deposit' : 'disbursement';

            // Trust transaction 생성
            $transId = $db->insert('trust_transactions', [
                'user_id' => $batch['user_id'],
                'ledger_id' => $ledgerId,
                'transaction_type' => $type,
                'amount' => $amount,
                'running_balance' => $newBalance,
                'description' => $item['description'] ?? 'Batch deposit #' . $batchId,
                'reference_number' => $item['check_number'],
                'transaction_date' => $batch['batch_date'],
                'memo' => 'Batch #' . $batchId,
                'created_by' => $userId ?? $batch['user_id']
            ]);

            // Ledger 잔액 업데이트
            $db->update('trust_ledger',
                ['current_balance' => $newBalance],
                'id = :id',
                ['id' => $ledgerId]
            );

            // 아이템에 transaction ID 링크
            $db->update('deposit_items',
                ['trust_transaction_id' => $transId],
                'id = :id',
                ['id' => $item['id']]
            );

            $postedCount++;
        }

        // 배치 상태 업데이트
        $db->update('deposit_batches', [
            'status' => 'posted',
            'posted_at' => date('Y-m-d H:i:s'),
            'posted_by' => $userId
        ], 'id = :id', ['id' => $batchId]);

        // 감사 로그
        $db->insert('trust_audit_log', [
            'user_id' => $userId ?? 1,
            'action' => 'batch_posted',
            'entity_type' => 'deposit_batch',
            'entity_id' => $batchId,
            'new_values' => json_encode([
                'batch_id' => $batchId,
                'total_amount' => $batch['total_amount'],
                'item_count' => $postedCount
            ]),
            'description' => "Batch deposit #$batchId posted: $postedCount items, \${$batch['total_amount']}",
            'ip_address' => getClientIp()
        ]);

        $pdo->commit();

        successResponse([
            'posted' => $postedCount,
            'batch_id' => $batchId
        ], "Batch posted: $postedCount transactions created");

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to post batch: ' . $e->getMessage());
    }
}

/**
 * 배치 합계 수동 업데이트
 */
function updateBatchTotals(Database $db, int $batchId): void {
    $totals = $db->fetch(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM deposit_items WHERE deposit_batch_id = :batch_id",
        ['batch_id' => $batchId]
    );

    $db->update('deposit_batches', [
        'total_amount' => $totals['total'],
        'item_count' => $totals['count']
    ], 'id = :id', ['id' => $batchId]);
}

// =====================================================
// PUT - 배치/아이템 수정
// =====================================================

function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);
    $batchId = !empty($_GET['id']) ? (int)$_GET['id'] : (!empty($input['batch_id']) ? (int)$input['batch_id'] : null);
    $itemId = !empty($_GET['item_id']) ? (int)$_GET['item_id'] : (!empty($input['item_id']) ? (int)$input['item_id'] : null);

    if ($itemId) {
        // 아이템 수정
        $item = $db->fetch("SELECT * FROM deposit_items WHERE id = :id", ['id' => $itemId]);
        if (!$item) {
            errorResponse('Item not found', 404);
        }

        $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $item['deposit_batch_id']]);
        if ($batch['status'] !== 'draft') {
            errorResponse('Cannot modify items in a posted batch');
        }

        $updates = [];
        if (isset($input['client_id'])) $updates['client_id'] = (int)$input['client_id'];
        if (isset($input['amount'])) $updates['amount'] = (float)$input['amount'];
        if (isset($input['check_number'])) $updates['check_number'] = $input['check_number'];
        if (isset($input['description'])) $updates['description'] = $input['description'];
        if (isset($input['payee_name'])) $updates['payee_name'] = $input['payee_name'];

        if (!empty($updates)) {
            $db->update('deposit_items', $updates, 'id = :id', ['id' => $itemId]);
            updateBatchTotals($db, $item['deposit_batch_id']);
        }

        $updatedItem = $db->fetch(
            "SELECT di.*, c.client_name FROM deposit_items di
             LEFT JOIN trust_clients c ON di.client_id = c.id
             WHERE di.id = :id",
            ['id' => $itemId]
        );

        successResponse(['item' => $updatedItem], 'Item updated');

    } elseif ($batchId) {
        // 배치 수정
        $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
        if (!$batch) {
            errorResponse('Batch not found', 404);
        }

        if ($batch['status'] !== 'draft') {
            errorResponse('Cannot modify a posted batch');
        }

        $updates = [];
        if (isset($input['batch_date'])) $updates['batch_date'] = $input['batch_date'];
        if (isset($input['bank_reference'])) $updates['bank_reference'] = $input['bank_reference'];
        if (isset($input['memo'])) $updates['memo'] = $input['memo'];

        if (!empty($updates)) {
            $db->update('deposit_batches', $updates, 'id = :id', ['id' => $batchId]);
        }

        $updatedBatch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);

        successResponse(['batch' => $updatedBatch], 'Batch updated');

    } else {
        errorResponse('batch_id or item_id is required');
    }
}

// =====================================================
// DELETE - 배치/아이템 삭제
// =====================================================

function handleDelete(Database $db, PDO $pdo): void {
    $batchId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $itemId = !empty($_GET['item_id']) ? (int)$_GET['item_id'] : null;

    if ($itemId) {
        // 아이템 삭제
        $item = $db->fetch("SELECT * FROM deposit_items WHERE id = :id", ['id' => $itemId]);
        if (!$item) {
            errorResponse('Item not found', 404);
        }

        $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $item['deposit_batch_id']]);
        if ($batch['status'] !== 'draft') {
            errorResponse('Cannot delete items from a posted batch');
        }

        $db->delete('deposit_items', 'id = :id', ['id' => $itemId]);
        updateBatchTotals($db, $item['deposit_batch_id']);

        successResponse(null, 'Item deleted');

    } elseif ($batchId) {
        // 배치 삭제
        $batch = $db->fetch("SELECT * FROM deposit_batches WHERE id = :id", ['id' => $batchId]);
        if (!$batch) {
            errorResponse('Batch not found', 404);
        }

        if ($batch['status'] !== 'draft') {
            errorResponse('Cannot delete a posted batch');
        }

        // 아이템도 CASCADE로 삭제됨
        $db->delete('deposit_batches', 'id = :id', ['id' => $batchId]);

        successResponse(null, 'Batch deleted');

    } else {
        errorResponse('id or item_id is required');
    }
}
