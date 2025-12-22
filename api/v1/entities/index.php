<?php
/**
 * Entities API
 * Master list for Vendors, Customers, Employees
 * QuickBooks-style entity management
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
    $entityId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $typeCode = $_GET['type'] ?? null;
    $search = $_GET['search'] ?? null;
    $isPayable = isset($_GET['is_payable']) ? (int)$_GET['is_payable'] : null;
    $isReceivable = isset($_GET['is_receivable']) ? (int)$_GET['is_receivable'] : null;
    $activeOnly = !isset($_GET['include_inactive']);
    $all = !empty($_GET['all']);
    $limit = $all ? 10000 : (!empty($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100);
    $offset = !empty($_GET['offset']) ? (int)$_GET['offset'] : 0;

    // Single entity fetch
    if ($entityId) {
        $sql = "SELECT e.*, et.type_code, et.type_name
                FROM entities e
                JOIN entity_types et ON e.entity_type_id = et.id
                WHERE e.id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $entityId]);
        $entity = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$entity) {
            errorResponse('Entity not found', 404);
        }

        successResponse(['entity' => $entity]);
        return;
    }

    // Build query
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'e.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if ($typeCode) {
        $where[] = 'et.type_code = :type_code';
        $params['type_code'] = $typeCode;
    }

    if ($isPayable !== null) {
        $where[] = 'et.is_payable = :is_payable';
        $params['is_payable'] = $isPayable;
    }

    if ($isReceivable !== null) {
        $where[] = 'et.is_receivable = :is_receivable';
        $params['is_receivable'] = $isReceivable;
    }

    if ($activeOnly) {
        $where[] = 'e.is_active = 1';
    }

    if ($search) {
        $where[] = '(e.name LIKE :search OR e.display_name LIKE :search2 OR e.company_name LIKE :search3 OR e.entity_code LIKE :search4)';
        $searchTerm = "%$search%";
        $params['search'] = $searchTerm;
        $params['search2'] = $searchTerm;
        $params['search3'] = $searchTerm;
        $params['search4'] = $searchTerm;
    }

    $whereClause = implode(' AND ', $where);

    // Get total count
    $countSql = "SELECT COUNT(*) as total FROM entities e JOIN entity_types et ON e.entity_type_id = et.id WHERE $whereClause";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Get entities
    $sql = "SELECT e.*, et.type_code, et.type_name, et.is_payable, et.is_receivable
            FROM entities e
            JOIN entity_types et ON e.entity_type_id = et.id
            WHERE $whereClause
            ORDER BY e.name ASC
            LIMIT $limit OFFSET $offset";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $entities = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get entity types for filtering
    $typesSql = "SELECT * FROM entity_types ORDER BY type_name";
    $typesStmt = $pdo->query($typesSql);
    $types = $typesStmt->fetchAll(PDO::FETCH_ASSOC);

    successResponse([
        'entities' => $entities,
        'types' => $types,
        'total' => (int)$total,
        'limit' => $limit,
        'offset' => $offset
    ]);
}

function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $typeCode = $input['type'] ?? $input['type_code'] ?? null;
    $name = trim($input['name'] ?? '');

    if (!$userId || !$typeCode || !$name) {
        errorResponse('Missing required fields: user_id, type, name');
    }

    // Get entity type ID
    $typeStmt = $pdo->prepare("SELECT id FROM entity_types WHERE type_code = :code");
    $typeStmt->execute(['code' => $typeCode]);
    $type = $typeStmt->fetch(PDO::FETCH_ASSOC);

    if (!$type) {
        errorResponse('Invalid entity type');
    }

    $entityTypeId = $type['id'];

    // Build insert data
    $data = [
        'user_id' => $userId,
        'entity_type_id' => $entityTypeId,
        'name' => sanitize($name),
        'display_name' => sanitize($input['display_name'] ?? $name),
        'company_name' => sanitize($input['company_name'] ?? ''),
        'entity_code' => sanitize($input['entity_code'] ?? ''),
        'email' => sanitize($input['email'] ?? ''),
        'phone' => sanitize($input['phone'] ?? ''),
        'fax' => sanitize($input['fax'] ?? ''),
        'address_line1' => sanitize($input['address_line1'] ?? ''),
        'address_line2' => sanitize($input['address_line2'] ?? ''),
        'city' => sanitize($input['city'] ?? ''),
        'state' => sanitize($input['state'] ?? ''),
        'zip_code' => sanitize($input['zip_code'] ?? ''),
        'country' => sanitize($input['country'] ?? 'USA'),
        'payment_method' => $input['payment_method'] ?? 'check',
        'tax_id' => sanitize($input['tax_id'] ?? ''),
        'is_1099' => !empty($input['is_1099']) ? 1 : 0,
        'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1,
        'notes' => sanitize($input['notes'] ?? '')
    ];

    try {
        $entityId = $db->insert('entities', $data);

        $entity = $db->fetch("SELECT e.*, et.type_code, et.type_name
                              FROM entities e
                              JOIN entity_types et ON e.entity_type_id = et.id
                              WHERE e.id = :id", ['id' => $entityId]);

        successResponse([
            'entity' => $entity,
            'id' => $entityId
        ], 'Entity created successfully');

    } catch (Exception $e) {
        errorResponse('Error creating entity: ' . $e->getMessage());
    }
}

function handlePut(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $entityId = !empty($input['id']) ? (int)$input['id'] : null;

    if (!$entityId) {
        errorResponse('Entity ID is required');
    }

    // Verify entity exists
    $existing = $db->fetch("SELECT * FROM entities WHERE id = :id", ['id' => $entityId]);
    if (!$existing) {
        errorResponse('Entity not found', 404);
    }

    // Build update data
    $updates = [];
    $params = ['id' => $entityId];

    $fields = [
        'name', 'display_name', 'company_name', 'entity_code',
        'email', 'phone', 'fax',
        'address_line1', 'address_line2', 'city', 'state', 'zip_code', 'country',
        'payment_method', 'tax_id', 'notes'
    ];

    foreach ($fields as $field) {
        if (isset($input[$field])) {
            $updates[] = "$field = :$field";
            $params[$field] = sanitize($input[$field]);
        }
    }

    // Boolean fields
    if (isset($input['is_1099'])) {
        $updates[] = "is_1099 = :is_1099";
        $params['is_1099'] = (int)$input['is_1099'];
    }
    if (isset($input['is_active'])) {
        $updates[] = "is_active = :is_active";
        $params['is_active'] = (int)$input['is_active'];
    }

    // Optional foreign keys
    if (isset($input['default_account_id'])) {
        $updates[] = "default_account_id = :default_account_id";
        $params['default_account_id'] = $input['default_account_id'] ? (int)$input['default_account_id'] : null;
    }
    if (isset($input['default_category_id'])) {
        $updates[] = "default_category_id = :default_category_id";
        $params['default_category_id'] = $input['default_category_id'] ? (int)$input['default_category_id'] : null;
    }

    if (empty($updates)) {
        errorResponse('No fields to update');
    }

    try {
        $sql = "UPDATE entities SET " . implode(', ', $updates) . " WHERE id = :id";
        $db->query($sql, $params);

        // Update linked trust_client if this is a Customer entity
        updateLinkedTrustClient($db, $entityId, $input);

        $entity = $db->fetch("SELECT e.*, et.type_code, et.type_name
                              FROM entities e
                              JOIN entity_types et ON e.entity_type_id = et.id
                              WHERE e.id = :id", ['id' => $entityId]);

        successResponse(['entity' => $entity], 'Entity updated successfully');

    } catch (Exception $e) {
        errorResponse('Error updating entity: ' . $e->getMessage());
    }
}

function handleDelete(Database $db, PDO $pdo): void {
    $entityId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$entityId) {
        errorResponse('Entity ID is required');
    }

    // Verify entity exists
    $entity = $db->fetch("SELECT * FROM entities WHERE id = :id", ['id' => $entityId]);
    if (!$entity) {
        errorResponse('Entity not found', 404);
    }

    // Check if entity is used in transactions
    $usageCheck = $db->fetch(
        "SELECT COUNT(*) as count FROM trust_transactions WHERE entity_id = :id",
        ['id' => $entityId]
    );

    if ($usageCheck['count'] > 0) {
        // Soft delete - just deactivate
        $db->query("UPDATE entities SET is_active = 0 WHERE id = :id", ['id' => $entityId]);
        successResponse(null, 'Entity deactivated (has associated transactions)');
    } else {
        // Hard delete
        $db->query("DELETE FROM entities WHERE id = :id", ['id' => $entityId]);
        successResponse(null, 'Entity deleted successfully');
    }
}

/**
 * Update linked trust_client when Customer entity is updated
 * This keeps Client and Customer data in sync
 */
function updateLinkedTrustClient(Database $db, int $entityId, array $input): void {
    // Find trust_client linked to this entity
    $client = $db->fetch(
        "SELECT id FROM trust_clients WHERE entity_id = :entity_id",
        ['entity_id' => $entityId]
    );

    if (!$client) {
        return; // No linked client
    }

    $clientUpdateData = [];

    // Map entity fields to client fields
    if (isset($input['name'])) {
        $clientUpdateData['client_name'] = sanitize($input['name']);
    }
    if (isset($input['entity_code'])) {
        $clientUpdateData['client_number'] = $input['entity_code'];
    }
    if (isset($input['email'])) {
        $clientUpdateData['contact_email'] = $input['email'];
    }
    if (isset($input['phone'])) {
        $clientUpdateData['contact_phone'] = $input['phone'];
    }
    if (isset($input['address_line1'])) {
        $clientUpdateData['address'] = $input['address_line1'];
    }
    if (isset($input['notes'])) {
        $clientUpdateData['notes'] = $input['notes'];
    }
    if (isset($input['is_active'])) {
        $clientUpdateData['is_active'] = (int)$input['is_active'];
    }

    if (!empty($clientUpdateData)) {
        $db->update('trust_clients', $clientUpdateData, 'id = :id', ['id' => $client['id']]);
    }
}
