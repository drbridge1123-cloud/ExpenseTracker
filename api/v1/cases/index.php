<?php
/**
 * Cases API
 * Case/Matter tracking for transactions
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
    case 'PUT':
        handlePut($db, $pdo);
        break;
    case 'DELETE':
        handleDelete($db, $pdo);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(Database $db, PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $caseId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;
    $activeOnly = !isset($_GET['include_inactive']);
    $limit = !empty($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100;

    // Single case fetch
    if ($caseId) {
        $sql = "SELECT c.*,
                       tc.client_name as trust_client_name,
                       e.name as entity_name
                FROM cases c
                LEFT JOIN trust_clients tc ON c.client_id = tc.id
                LEFT JOIN entities e ON c.entity_id = e.id
                WHERE c.id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $caseId]);
        $case = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$case) {
            errorResponse('Case not found', 404);
        }

        // Get case transactions summary
        $transSql = "SELECT
                        COUNT(*) as transaction_count,
                        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_deposits,
                        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_disbursements
                     FROM trust_transactions
                     WHERE case_id = :case_id";
        $transStmt = $pdo->prepare($transSql);
        $transStmt->execute(['case_id' => $caseId]);
        $case['summary'] = $transStmt->fetch(PDO::FETCH_ASSOC);

        successResponse(['case' => $case]);
        return;
    }

    // Build query
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'c.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($status) {
        $where[] = 'c.status = :status';
        $params['status'] = $status;
    }

    if ($activeOnly) {
        $where[] = 'c.is_active = 1';
    }

    if ($search) {
        $where[] = '(c.case_number LIKE :search OR c.case_name LIKE :search2)';
        $searchTerm = "%$search%";
        $params['search'] = $searchTerm;
        $params['search2'] = $searchTerm;
    }

    $whereClause = implode(' AND ', $where);

    // Get cases
    $sql = "SELECT c.*,
                   tc.client_name as trust_client_name,
                   e.name as entity_name,
                   (SELECT COUNT(*) FROM trust_transactions WHERE case_id = c.id) as transaction_count
            FROM cases c
            LEFT JOIN trust_clients tc ON c.client_id = tc.id
            LEFT JOIN entities e ON c.entity_id = e.id
            WHERE $whereClause
            ORDER BY c.case_number DESC
            LIMIT $limit";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $cases = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get status summary
    $summarySql = "SELECT
                    COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count
                   FROM cases WHERE user_id = :user_id";
    $summaryStmt = $pdo->prepare($summarySql);
    $summaryStmt->execute(['user_id' => $userId]);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC);

    successResponse([
        'cases' => $cases,
        'summary' => $summary
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $caseNumber = trim($input['case_number'] ?? '');
    $caseName = trim($input['case_name'] ?? '');

    if (!$userId || !$caseNumber || !$caseName) {
        errorResponse('Missing required fields: user_id, case_number, case_name');
    }

    // Check for duplicate case number
    $existing = $db->fetch(
        "SELECT id FROM cases WHERE user_id = :user_id AND case_number = :case_number",
        ['user_id' => $userId, 'case_number' => $caseNumber]
    );

    if ($existing) {
        errorResponse('Case number already exists');
    }

    $data = [
        'user_id' => $userId,
        'case_number' => sanitize($caseNumber),
        'case_name' => sanitize($caseName),
        'description' => sanitize($input['description'] ?? ''),
        'status' => $input['status'] ?? 'open',
        'opened_date' => $input['opened_date'] ?? date('Y-m-d'),
        'notes' => sanitize($input['notes'] ?? ''),
        'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1
    ];

    if (!empty($input['client_id'])) {
        $data['client_id'] = (int)$input['client_id'];
    }
    if (!empty($input['entity_id'])) {
        $data['entity_id'] = (int)$input['entity_id'];
    }
    if (!empty($input['closed_date'])) {
        $data['closed_date'] = $input['closed_date'];
    }

    try {
        $caseId = $db->insert('cases', $data);

        successResponse([
            'id' => $caseId,
            'case_number' => $caseNumber
        ], 'Case created successfully');

    } catch (Exception $e) {
        errorResponse('Error creating case: ' . $e->getMessage());
    }
}

function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $caseId = !empty($input['id']) ? (int)$input['id'] : null;

    if (!$caseId) {
        errorResponse('Case ID is required');
    }

    $existing = $db->fetch("SELECT * FROM cases WHERE id = :id", ['id' => $caseId]);
    if (!$existing) {
        errorResponse('Case not found', 404);
    }

    $updates = [];
    $params = ['id' => $caseId];

    $fields = ['case_name', 'description', 'status', 'notes', 'opened_date', 'closed_date'];
    foreach ($fields as $field) {
        if (isset($input[$field])) {
            $updates[] = "$field = :$field";
            $params[$field] = sanitize($input[$field]);
        }
    }

    if (isset($input['is_active'])) {
        $updates[] = "is_active = :is_active";
        $params['is_active'] = (int)$input['is_active'];
    }

    if (isset($input['client_id'])) {
        $updates[] = "client_id = :client_id";
        $params['client_id'] = $input['client_id'] ? (int)$input['client_id'] : null;
    }

    if (isset($input['entity_id'])) {
        $updates[] = "entity_id = :entity_id";
        $params['entity_id'] = $input['entity_id'] ? (int)$input['entity_id'] : null;
    }

    if (empty($updates)) {
        errorResponse('No fields to update');
    }

    try {
        $sql = "UPDATE cases SET " . implode(', ', $updates) . " WHERE id = :id";
        $db->query($sql, $params);

        successResponse(null, 'Case updated successfully');

    } catch (Exception $e) {
        errorResponse('Error updating case: ' . $e->getMessage());
    }
}

function handleDelete(Database $db, PDO $pdo): void {
    $caseId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$caseId) {
        errorResponse('Case ID is required');
    }

    $case = $db->fetch("SELECT * FROM cases WHERE id = :id", ['id' => $caseId]);
    if (!$case) {
        errorResponse('Case not found', 404);
    }

    // Check for transactions
    $transCount = $db->fetch(
        "SELECT COUNT(*) as count FROM trust_transactions WHERE case_id = :id",
        ['id' => $caseId]
    );

    if ($transCount['count'] > 0) {
        // Soft delete
        $db->query("UPDATE cases SET is_active = 0, status = 'archived' WHERE id = :id", ['id' => $caseId]);
        successResponse(null, 'Case archived (has associated transactions)');
    } else {
        $db->query("DELETE FROM cases WHERE id = :id", ['id' => $caseId]);
        successResponse(null, 'Case deleted successfully');
    }
}
