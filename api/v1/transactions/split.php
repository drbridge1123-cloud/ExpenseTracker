<?php
/**
 * General Transaction Split API
 * Split one transaction across multiple categories
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
            "SELECT t.*, c.name as category_name, a.account_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             LEFT JOIN accounts a ON t.account_id = a.id
             WHERE t.id = :id AND t.is_split = 1",
            ['id' => $parentId]
        );

        if (!$parent) {
            errorResponse('Split parent transaction not found', 404);
        }

        $children = $db->fetchAll(
            "SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.parent_transaction_id = :parent_id
             ORDER BY t.id ASC",
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
            "SELECT t.*, c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.id = :id",
            ['id' => $transactionId]
        );

        if (!$transaction) {
            errorResponse('Transaction not found', 404);
        }

        $response = ['transaction' => $transaction];

        // If this is a parent, get children
        if ($transaction['is_split']) {
            $children = $db->fetchAll(
                "SELECT t.id, t.amount, t.description, c.name as category_name
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.parent_transaction_id = :id",
                ['id' => $transactionId]
            );
            $response['splits'] = $children;
        }
        // If this is a child, get parent and siblings
        elseif ($transaction['parent_transaction_id']) {
            $parent = $db->fetch(
                "SELECT id, amount, description FROM transactions WHERE id = :id",
                ['id' => $transaction['parent_transaction_id']]
            );
            $siblings = $db->fetchAll(
                "SELECT t.id, t.amount, t.description, c.name as category_name
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.parent_transaction_id = :parent_id AND t.id != :id",
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
 * Takes a transaction and splits it across multiple categories
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
    $vendorName = isset($input['vendor_name']) ? sanitize($input['vendor_name']) : null;
    $checkNumber = isset($input['check_number']) ? sanitize($input['check_number']) : null;
    $referenceNumber = isset($input['reference_number']) ? sanitize($input['reference_number']) : null;
    $transactionType = $input['transaction_type'] ?? 'expense';

    // Validate splits array
    if (!is_array($splits) || count($splits) < 2) {
        errorResponse('At least 2 split lines are required');
    }

    // Validate each split has required fields and amounts sum up
    $splitTotal = 0;
    foreach ($splits as $i => $split) {
        if (empty($split['category_id'])) {
            errorResponse("Split line " . ($i + 1) . " is missing category_id");
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
            'category_id' => null, // Parent has no category
            'amount' => $totalAmount,
            'transaction_type' => $transactionType,
            'transaction_date' => $transactionDate,
            'description' => $description,
            'vendor_name' => $vendorName,
            'check_number' => $checkNumber,
            'reference_number' => $referenceNumber,
            'is_split' => 1,
            'parent_transaction_id' => null,
            'status' => 'cleared',
            'created_at' => date('Y-m-d H:i:s')
        ];

        $parentId = $db->insert('transactions', $parentData);

        $createdSplits = [];

        // Create child transactions for each split
        foreach ($splits as $split) {
            $categoryId = (int)$split['category_id'];
            $amount = (float)$split['amount'];
            $splitDescription = isset($split['description']) ? sanitize($split['description']) : $description;

            $childData = [
                'user_id' => $userId,
                'account_id' => $accountId,
                'category_id' => $categoryId,
                'amount' => $amount,
                'transaction_type' => $transactionType,
                'transaction_date' => $transactionDate,
                'description' => $splitDescription,
                'vendor_name' => $vendorName,
                'check_number' => $checkNumber,
                'reference_number' => $referenceNumber,
                'is_split' => 0,
                'parent_transaction_id' => $parentId,
                'status' => 'cleared',
                'created_at' => date('Y-m-d H:i:s')
            ];

            $childId = $db->insert('transactions', $childData);

            // Get category name
            $category = $db->fetch(
                "SELECT name FROM categories WHERE id = :id",
                ['id' => $categoryId]
            );

            $createdSplits[] = [
                'id' => $childId,
                'category_id' => $categoryId,
                'category_name' => $category ? $category['name'] : null,
                'amount' => $amount,
                'description' => $splitDescription
            ];
        }

        $pdo->commit();

        successResponse([
            'parent_id' => $parentId,
            'total_amount' => $totalAmount,
            'splits' => $createdSplits
        ], 'Split transaction created successfully');

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
        "SELECT id, is_split FROM transactions WHERE id = :id",
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
        // Delete all children first
        $childCount = $db->query(
            "DELETE FROM transactions WHERE parent_transaction_id = :id",
            ['id' => $parentId]
        );

        // Delete parent
        $db->query(
            "DELETE FROM transactions WHERE id = :id",
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
