<?php
/**
 * Bulk Update Transactions API
 * POST: Update multiple transactions at once
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['transaction_ids']) || !is_array($input['transaction_ids'])) {
    errorResponse('Transaction IDs are required');
}

if (empty($input['category_id'])) {
    errorResponse('Category ID is required');
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    $transactionIds = array_map('intval', $input['transaction_ids']);
    $categoryId = (int)$input['category_id'];
    $createRule = !empty($input['create_rule']);

    // Verify category exists
    $category = $db->fetch("SELECT * FROM categories WHERE id = :id", ['id' => $categoryId]);
    if (!$category) {
        errorResponse('Category not found', 404);
    }

    // Get first transaction for rule creation
    $firstTransaction = null;
    if ($createRule && count($transactionIds) > 0) {
        $firstTransaction = $db->fetch(
            "SELECT * FROM transactions WHERE id = :id",
            ['id' => $transactionIds[0]]
        );
    }

    // Update all transactions
    $placeholders = implode(',', array_fill(0, count($transactionIds), '?'));
    $sql = "UPDATE transactions SET category_id = ?, categorized_by = 'manual', updated_at = NOW() WHERE id IN ($placeholders)";

    $stmt = $pdo->prepare($sql);
    $params = array_merge([$categoryId], $transactionIds);
    $stmt->execute($params);

    $updated = $stmt->rowCount();

    // Create rule if requested
    $ruleCreated = false;
    if ($createRule && $firstTransaction) {
        // Extract pattern from first transaction description
        $words = explode(' ', $firstTransaction['description']);
        $pattern = implode(' ', array_slice($words, 0, 3));

        if (strlen($pattern) >= 3) {
            // Check if similar rule exists
            $existingRule = $db->fetch(
                "SELECT id FROM categorization_rules WHERE match_value LIKE :pattern AND category_id = :cat_id",
                ['pattern' => '%' . $pattern . '%', 'cat_id' => $categoryId]
            );

            if (!$existingRule) {
                $db->insert('categorization_rules', [
                    'user_id' => $firstTransaction['user_id'],
                    'category_id' => $categoryId,
                    'rule_name' => $pattern,
                    'match_field' => 'description',
                    'match_type' => 'contains',
                    'match_value' => $pattern,
                    'priority' => 50,
                    'is_active' => 1
                ]);
                $ruleCreated = true;
            }
        }
    }

    successResponse([
        'updated' => $updated,
        'rule_created' => $ruleCreated
    ], "$updated transactions updated");

} catch (Exception $e) {
    appLog('Bulk update error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
