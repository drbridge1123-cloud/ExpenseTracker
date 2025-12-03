<?php
/**
 * Apply categorization rules to uncategorized transactions
 * POST /api/v1/transactions/apply-rules.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    $db = Database::getInstance();

    // Get user's uncategorized category
    $uncategorized = $db->fetch(
        "SELECT id FROM categories WHERE slug = 'uncategorized' AND user_id = :user_id",
        ['user_id' => $userId]
    );

    // Build conditions for uncategorized transactions
    $conditions = ['user_id = :user_id'];
    $params = ['user_id' => $userId];

    if ($uncategorized) {
        $conditions[] = '(category_id IS NULL OR category_id = :uncategorized_id)';
        $params['uncategorized_id'] = $uncategorized['id'];
    } else {
        $conditions[] = 'category_id IS NULL';
    }

    // Get uncategorized transactions
    $whereClause = implode(' AND ', $conditions);
    $transactions = $db->fetchAll(
        "SELECT id, description, original_description, vendor_name, memo, amount
         FROM transactions
         WHERE $whereClause",
        $params
    );

    if (empty($transactions)) {
        successResponse([
            'categorized' => 0,
            'message' => 'No uncategorized transactions found'
        ]);
    }

    // Initialize categorizer
    $categorizer = new Categorizer($userId);

    $categorized = 0;
    $results = [];

    foreach ($transactions as $txn) {
        $result = $categorizer->categorize($txn);

        // Only update if a rule matched (not default)
        if ($result['categorized_by'] === 'rule' && $result['category_id']) {
            $db->update('transactions', [
                'category_id' => $result['category_id'],
                'categorized_by' => 'rule',
                'categorization_confidence' => $result['confidence']
            ], 'id = :id', ['id' => $txn['id']]);

            $categorized++;
            $results[] = [
                'transaction_id' => $txn['id'],
                'description' => $txn['description'],
                'category_id' => $result['category_id'],
                'rule_id' => $result['rule_id']
            ];
        }
    }

    successResponse([
        'categorized' => $categorized,
        'total_uncategorized' => count($transactions),
        'details' => $results
    ], "$categorized transactions categorized using rules");

} catch (Exception $e) {
    appLog('Apply rules error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
