<?php
/**
 * Trust Clients API
 * Manages clients/matters for IOLTA accounts
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
        handlePost($db);
        break;
    case 'PUT':
        handlePut($db);
        break;
    case 'DELETE':
        handleDelete($db);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $clientId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $includeInactive = isset($_GET['include_inactive']) && $_GET['include_inactive'] === '1';

    if ($clientId) {
        // Get single client with ledger info
        $sql = "SELECT
                    c.*,
                    COUNT(DISTINCT l.id) as ledger_count,
                    COALESCE(SUM(l.current_balance), 0) as total_balance
                FROM trust_clients c
                LEFT JOIN trust_ledger l ON c.id = l.client_id AND l.is_active = 1
                WHERE c.id = :id
                GROUP BY c.id";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $clientId]);
        $client = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$client) {
            errorResponse('Client not found', 404);
        }

        // Get ledgers for this client
        $ledgerSql = "SELECT
                        l.*,
                        a.account_name,
                        a.account_number_last4
                      FROM trust_ledger l
                      JOIN accounts a ON l.account_id = a.id
                      WHERE l.client_id = :client_id
                      ORDER BY l.is_active DESC, a.account_name";
        $ledgerStmt = $pdo->prepare($ledgerSql);
        $ledgerStmt->execute(['client_id' => $clientId]);
        $client['ledgers'] = $ledgerStmt->fetchAll(PDO::FETCH_ASSOC);

        successResponse(['client' => $client]);
    }

    // List all clients
    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = 'c.user_id = :user_id';
        $params['user_id'] = $userId;
    }

    if (!$includeInactive) {
        $where[] = 'c.is_active = 1';
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT
                c.*,
                COUNT(DISTINCT l.id) as ledger_count,
                COALESCE(SUM(l.current_balance), 0) as total_balance
            FROM trust_clients c
            LEFT JOIN trust_ledger l ON c.id = l.client_id AND l.is_active = 1
            WHERE $whereClause
            GROUP BY c.id
            ORDER BY c.client_name";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $clients = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format numbers
    foreach ($clients as &$client) {
        $client['total_balance'] = (float)$client['total_balance'];
        $client['ledger_count'] = (int)$client['ledger_count'];
    }

    successResponse([
        'clients' => $clients,
        'total_count' => count($clients)
    ]);
}

function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $required = ['user_id', 'client_name'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            errorResponse("Field '$field' is required");
        }
    }

    // Check for duplicate matter number
    if (!empty($input['matter_number'])) {
        if ($db->exists('trust_clients', 'user_id = :user_id AND matter_number = :matter', [
            'user_id' => $input['user_id'],
            'matter' => $input['matter_number']
        ])) {
            errorResponse('Matter number already exists');
        }
    }

    // Create or find linked Customer entity
    $entityId = createOrLinkCustomerEntity($db, $input);

    $clientData = [
        'user_id' => (int)$input['user_id'],
        'entity_id' => $entityId,
        'client_number' => $input['client_number'] ?? null,
        'client_name' => sanitize($input['client_name']),
        'matter_number' => $input['matter_number'] ?? null,
        'matter_description' => $input['matter_description'] ?? null,
        'contact_email' => $input['contact_email'] ?? null,
        'contact_phone' => $input['contact_phone'] ?? null,
        'address' => $input['address'] ?? null,
        'notes' => $input['notes'] ?? null,
        'is_active' => 1
    ];

    $clientId = $db->insert('trust_clients', $clientData);

    // Auto-create ledger for this client
    // Find IOLTA trust account for this user
    $trustAccount = $db->fetch(
        "SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1",
        ['user_id' => $input['user_id']]
    );

    if ($trustAccount) {
        // Create trust_ledger entry
        $db->insert('trust_ledger', [
            'user_id' => (int)$input['user_id'],
            'client_id' => $clientId,
            'account_id' => $trustAccount['id'],
            'current_balance' => 0,
            'is_active' => 1
        ]);

        // Create Trust Sub-Account in accounts table (QuickBooks-style)
        $matterNumber = $clientData['matter_number'] ?: 'C' . $clientId;
        $accountName = $matterNumber . ' ' . $clientData['client_name'];

        $db->insert('accounts', [
            'user_id' => (int)$input['user_id'],
            'parent_account_id' => $trustAccount['id'],
            'linked_client_id' => $clientId,
            'account_name' => $accountName,
            'account_type' => 'trust',
            'current_balance' => 0,
            'is_active' => 1
        ]);
    }

    // Audit log
    $db->insert('trust_audit_log', [
        'user_id' => $input['user_id'],
        'action' => 'client_created',
        'entity_type' => 'trust_clients',
        'entity_id' => $clientId,
        'client_id' => $clientId,
        'new_values' => json_encode($clientData),
        'ip_address' => getClientIp()
    ]);

    $client = $db->fetch("SELECT * FROM trust_clients WHERE id = :id", ['id' => $clientId]);

    successResponse(['client' => $client], 'Client created successfully');
}

function handlePut(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['id'])) {
        errorResponse('Client ID is required');
    }

    $clientId = (int)$input['id'];
    $existing = $db->fetch("SELECT * FROM trust_clients WHERE id = :id", ['id' => $clientId]);

    if (!$existing) {
        errorResponse('Client not found', 404);
    }

    // Check for duplicate matter number (excluding current)
    if (!empty($input['matter_number'])) {
        if ($db->exists('trust_clients', 'user_id = :user_id AND matter_number = :matter AND id != :id', [
            'user_id' => $existing['user_id'],
            'matter' => $input['matter_number'],
            'id' => $clientId
        ])) {
            errorResponse('Matter number already exists');
        }
    }

    $updateData = [];
    $allowedFields = ['client_number', 'client_name', 'matter_number', 'matter_description',
                      'contact_email', 'contact_phone', 'address', 'notes', 'is_active'];

    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $updateData[$field] = $field === 'client_name' ? sanitize($input[$field]) : $input[$field];
        }
    }

    if (empty($updateData)) {
        errorResponse('No fields to update');
    }

    $db->update('trust_clients', $updateData, 'id = :id', ['id' => $clientId]);

    // Update linked Customer entity if exists
    if (!empty($existing['entity_id'])) {
        updateLinkedCustomerEntity($db, (int)$existing['entity_id'], $updateData);
    }

    // Audit log
    $db->insert('trust_audit_log', [
        'user_id' => $existing['user_id'],
        'action' => 'client_updated',
        'entity_type' => 'trust_clients',
        'entity_id' => $clientId,
        'client_id' => $clientId,
        'old_values' => json_encode($existing),
        'new_values' => json_encode($updateData),
        'ip_address' => getClientIp()
    ]);

    $client = $db->fetch("SELECT * FROM trust_clients WHERE id = :id", ['id' => $clientId]);

    successResponse(['client' => $client], 'Client updated successfully');
}

function handleDelete(Database $db): void {
    $clientId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$clientId) {
        errorResponse('Client ID is required');
    }

    $existing = $db->fetch("SELECT * FROM trust_clients WHERE id = :id", ['id' => $clientId]);

    if (!$existing) {
        errorResponse('Client not found', 404);
    }

    // Check if client has any ledger balance
    $pdo = $db->getConnection();
    $stmt = $pdo->prepare("SELECT SUM(current_balance) as total FROM trust_ledger WHERE client_id = :id");
    $stmt->execute(['id' => $clientId]);
    $balance = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($balance && (float)$balance['total'] != 0) {
        errorResponse('Cannot delete client with non-zero balance. Please close ledgers first.');
    }

    // Soft delete - set inactive
    $db->update('trust_clients', ['is_active' => 0], 'id = :id', ['id' => $clientId]);

    // Audit log
    $db->insert('trust_audit_log', [
        'user_id' => $existing['user_id'],
        'action' => 'client_updated',
        'entity_type' => 'trust_clients',
        'entity_id' => $clientId,
        'client_id' => $clientId,
        'old_values' => json_encode(['is_active' => 1]),
        'new_values' => json_encode(['is_active' => 0]),
        'description' => 'Client deactivated',
        'ip_address' => getClientIp()
    ]);

    successResponse(null, 'Client deactivated successfully');
}

/**
 * Create or link a Customer entity for a trust client
 * This allows Clients to appear in Payee searches
 */
function createOrLinkCustomerEntity(Database $db, array $input): ?int {
    $userId = (int)$input['user_id'];
    $clientName = sanitize($input['client_name']);

    // Get Customer entity type ID
    $customerType = $db->fetch(
        "SELECT id FROM entity_types WHERE type_code = 'customer'",
        []
    );

    if (!$customerType) {
        return null; // Entity types not set up
    }

    $customerTypeId = $customerType['id'];

    // Check if entity with same name already exists for this user
    $existingEntity = $db->fetch(
        "SELECT id FROM entities WHERE user_id = :user_id AND entity_type_id = :type_id AND name = :name",
        ['user_id' => $userId, 'type_id' => $customerTypeId, 'name' => $clientName]
    );

    if ($existingEntity) {
        return (int)$existingEntity['id'];
    }

    // Create new Customer entity
    $entityData = [
        'user_id' => $userId,
        'entity_type_id' => $customerTypeId,
        'entity_code' => $input['client_number'] ?? null,
        'name' => $clientName,
        'display_name' => $clientName,
        'email' => $input['contact_email'] ?? null,
        'phone' => $input['contact_phone'] ?? null,
        'address_line1' => $input['address'] ?? null,
        'notes' => $input['notes'] ?? null,
        'is_active' => 1
    ];

    return $db->insert('entities', $entityData);
}

/**
 * Update linked Customer entity when Client is updated
 */
function updateLinkedCustomerEntity(Database $db, int $entityId, array $updateData): void {
    $entityUpdateData = [];

    // Map client fields to entity fields
    if (isset($updateData['client_name'])) {
        $entityUpdateData['name'] = $updateData['client_name'];
        $entityUpdateData['display_name'] = $updateData['client_name'];
    }
    if (isset($updateData['client_number'])) {
        $entityUpdateData['entity_code'] = $updateData['client_number'];
    }
    if (isset($updateData['contact_email'])) {
        $entityUpdateData['email'] = $updateData['contact_email'];
    }
    if (isset($updateData['contact_phone'])) {
        $entityUpdateData['phone'] = $updateData['contact_phone'];
    }
    if (isset($updateData['address'])) {
        $entityUpdateData['address_line1'] = $updateData['address'];
    }
    if (isset($updateData['notes'])) {
        $entityUpdateData['notes'] = $updateData['notes'];
    }
    if (isset($updateData['is_active'])) {
        $entityUpdateData['is_active'] = $updateData['is_active'];
    }

    if (!empty($entityUpdateData)) {
        $db->update('entities', $entityUpdateData, 'id = :id', ['id' => $entityId]);
    }
}
