<?php
/**
 * Cost Split Transaction API
 * Split one cost across multiple clients
 * POST: Create split transaction
 * GET: Get split details
 * DELETE: Delete split group
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($db);
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

/**
 * GET - Retrieve split transaction details
 */
function handleGet(Database $db): void {
    $parentId = !empty($_GET['parent_id']) ? (int)$_GET['parent_id'] : null;
    $transactionId = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if ($parentId) {
        // Get parent and all child split transactions
        $parent = $db->fetch(
            "SELECT ct.*, ca.account_name
             FROM cost_transactions ct
             LEFT JOIN cost_accounts ca ON ct.account_id = ca.id
             WHERE ct.id = :id AND ct.is_split = 1",
            ['id' => $parentId]
        );

        if (!$parent) {
            errorResponse('Split parent transaction not found', 404);
        }

        $children = $db->fetchAll(
            "SELECT ct.*, tc.client_name, tc.case_number
             FROM cost_transactions ct
             LEFT JOIN trust_clients tc ON ct.client_id = tc.id
             WHERE ct.parent_transaction_id = :parent_id
             ORDER BY ct.id ASC",
            ['parent_id' => $parentId]
        );

        successResponse([
            'parent' => $parent,
            'splits' => $children,
            'total_amount' => (float)$parent['amount'],
            'split_count' => count($children)
        ]);
    } elseif ($transactionId) {
        // Check if this transaction is part of a split
        $transaction = $db->fetch(
            "SELECT ct.*, tc.client_name, tc.case_number
             FROM cost_transactions ct
             LEFT JOIN trust_clients tc ON ct.client_id = tc.id
             WHERE ct.id = :id",
            ['id' => $transactionId]
        );

        if (!$transaction) {
            errorResponse('Transaction not found', 404);
        }

        $response = ['transaction' => $transaction];

        // If this is a parent, get children
        if ($transaction['is_split']) {
            $children = $db->fetchAll(
                "SELECT ct.id, ct.amount, ct.description, tc.client_name, tc.case_number
                 FROM cost_transactions ct
                 LEFT JOIN trust_clients tc ON ct.client_id = tc.id
                 WHERE ct.parent_transaction_id = :id",
                ['id' => $transactionId]
            );
            $response['splits'] = $children;
        }
        // If this is a child, get parent and siblings
        elseif ($transaction['parent_transaction_id']) {
            $parent = $db->fetch(
                "SELECT id, amount, description FROM cost_transactions WHERE id = :id",
                ['id' => $transaction['parent_transaction_id']]
            );
            $siblings = $db->fetchAll(
                "SELECT ct.id, ct.amount, ct.description, tc.client_name, tc.case_number
                 FROM cost_transactions ct
                 LEFT JOIN trust_clients tc ON ct.client_id = tc.id
                 WHERE ct.parent_transaction_id = :parent_id AND ct.id != :id",
                ['parent_id' => $transaction['parent_transaction_id'], 'id' => $transactionId]
            );
            $response['parent'] = $parent;
            $response['siblings'] = $siblings;
        }

        successResponse($response);
    } else {
        errorResponse('parent_id or id is required');
    }
}

/**
 * POST - Create split transaction
 * Takes a cost and splits it across multiple clients
 */
function handlePost(Database $db, PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);

    // Required fields
    $required = ['user_id', 'account_id', 'transaction_date', 'description', 'total_amount', 'splits'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || (is_string($input[$field]) && trim($input[$field]) === '')) {
            errorResponse("Field '$field' is required");
        }
    }

    $userId = (int)$input['user_id'];
    $accountId = (int)$input['account_id'];
    $transactionDate = $input['transaction_date'];
    $description = sanitize($input['description']);
    $totalAmount = (float)$input['total_amount'];
    $splits = $input['splits'];

    // Optional fields
    $payee = isset($input['payee']) ? sanitize($input['payee']) : null;
    $referenceNumber = isset($input['reference_number']) ? sanitize($input['reference_number']) : null;
    $category = isset($input['category']) ? sanitize($input['category']) : null;
    $transactionType = $input['transaction_type'] ?? 'debit';

    // Validate splits array
    if (!is_array($splits) || count($splits) < 2) {
        errorResponse('At least 2 split lines are required');
    }

    // Validate each split has required fields and amounts sum up
    $splitTotal = 0;
    foreach ($splits as $i => $split) {
        if (empty($split['client_id'])) {
            errorResponse("Split line " . ($i + 1) . " is missing client_id");
        }
        if (!isset($split['amount']) || (float)$split['amount'] == 0) {
            errorResponse("Split line " . ($i + 1) . " must have a non-zero amount");
        }
        $splitTotal += (float)$split['amount'];
    }

    // Amounts must match (with small tolerance for floating point)
    if (abs($splitTotal - $totalAmount) > 0.01) {
        errorResponse("Split amounts ($" . number_format($splitTotal, 2) .
                     ") must equal total ($" . number_format($totalAmount, 2) . ")");
    }

    $pdo->beginTransaction();

    try {
        // Create parent transaction with is_split = 1
        $parentData = [
            'user_id' => $userId,
            'account_id' => $accountId,
            'client_id' => null, // Parent has no specific client
            'amount' => $totalAmount,
            'transaction_type' => $transactionType,
            'transaction_date' => $transactionDate,
            'description' => $description,
            'payee' => $payee,
            'reference_number' => $referenceNumber,
            'category' => $category,
            'is_split' => 1,
            'parent_transaction_id' => null,
            'status' => 'cleared',
            'created_at' => date('Y-m-d H:i:s')
        ];

        $parentId = $db->insert('cost_transactions', $parentData);

        $createdSplits = [];

        // Create child transactions for each split
        foreach ($splits as $split) {
            $clientId = (int)$split['client_id'];
            $amount = (float)$split['amount'];
            $splitDescription = isset($split['description']) ? sanitize($split['description']) : $description;

            $childData = [
                'user_id' => $userId,
                'account_id' => $accountId,
                'client_id' => $clientId,
                'amount' => $amount,
                'transaction_type' => $transactionType,
                'transaction_date' => $transactionDate,
                'description' => $splitDescription,
                'payee' => $payee,
                'reference_number' => $referenceNumber,
                'category' => $category,
                'is_split' => 0,
                'parent_transaction_id' => $parentId,
                'status' => 'cleared',
                'created_at' => date('Y-m-d H:i:s')
            ];

            $childId = $db->insert('cost_transactions', $childData);

            // Update client balance
            $db->query(
                "UPDATE trust_clients SET cost_balance = COALESCE(cost_balance, 0) + :amount WHERE id = :client_id",
                ['amount' => $amount, 'client_id' => $clientId]
            );

            // Get client name
            $client = $db->fetch(
                "SELECT client_name, case_number FROM trust_clients WHERE id = :id",
                ['id' => $clientId]
            );

            $createdSplits[] = [
                'id' => $childId,
                'client_id' => $clientId,
                'client_name' => $client ? $client['client_name'] : null,
                'case_number' => $client ? $client['case_number'] : null,
                'amount' => $amount,
                'description' => $splitDescription
            ];
        }

        $pdo->commit();

        successResponse([
            'parent_id' => $parentId,
            'total_amount' => $totalAmount,
            'splits' => $createdSplits
        ], 'Split cost transaction created successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to create split transaction: ' . $e->getMessage());
    }
}

/**
 * DELETE - Delete split transaction (parent and all children)
 */
function handleDelete(Database $db, PDO $pdo): void {
    $parentId = !empty($_GET['parent_id']) ? (int)$_GET['parent_id'] : null;

    if (!$parentId) {
        errorResponse('parent_id is required');
    }

    // Verify parent exists and is a split transaction
    $parent = $db->fetch(
        "SELECT id, is_split FROM cost_transactions WHERE id = :id",
        ['id' => $parentId]
    );

    if (!$parent) {
        errorResponse('Transaction not found', 404);
    }

    if (!$parent['is_split']) {
        errorResponse('Transaction is not a split parent');
    }

    $pdo->beginTransaction();

    try {
        // Get children to reverse balances
        $children = $db->fetchAll(
            "SELECT client_id, amount FROM cost_transactions WHERE parent_transaction_id = :id",
            ['id' => $parentId]
        );

        // Reverse client balances
        foreach ($children as $child) {
            if ($child['client_id']) {
                $db->query(
                    "UPDATE trust_clients SET cost_balance = COALESCE(cost_balance, 0) - :amount WHERE id = :client_id",
                    ['amount' => $child['amount'], 'client_id' => $child['client_id']]
                );
            }
        }

        // Delete all children first
        $childCount = count($children);
        $db->query(
            "DELETE FROM cost_transactions WHERE parent_transaction_id = :id",
            ['id' => $parentId]
        );

        // Delete parent
        $db->query(
            "DELETE FROM cost_transactions WHERE id = :id",
            ['id' => $parentId]
        );

        $pdo->commit();

        successResponse([
            'deleted_parent_id' => $parentId,
            'deleted_children' => $childCount
        ], 'Split transaction deleted successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Failed to delete split transaction: ' . $e->getMessage());
    }
}
