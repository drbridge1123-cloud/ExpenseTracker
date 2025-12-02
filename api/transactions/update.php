<?php
/**
 * Transaction Update API
 * POST /api/transactions/update.php
 *
 * Body: { "id": 123, "category_id": 5, "description": "...", ... }
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Get JSON body
$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['id'])) {
    errorResponse('Transaction ID is required');
}

$id = (int)$input['id'];

try {
    $db = Database::getInstance();

    // Verify transaction exists
    $transaction = $db->fetch(
        "SELECT * FROM transactions WHERE id = :id",
        ['id' => $id]
    );

    if (!$transaction) {
        errorResponse('Transaction not found', 404);
    }

    // Allowed fields to update
    $allowedFields = [
        'category_id', 'description', 'vendor_name', 'memo',
        'tags', 'is_reviewed', 'status', 'transaction_date',
        'amount', 'transaction_type', 'reimbursement_status',
        'reimbursement_notes'
    ];

    $updateData = [];
    $oldValues = [];
    $newValues = [];

    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $input)) {
            $oldValues[$field] = $transaction[$field];
            $newValues[$field] = $input[$field];

            if ($field === 'tags' && is_array($input[$field])) {
                $updateData[$field] = json_encode($input[$field]);
            } elseif ($field === 'reimbursement_status' && empty($input[$field])) {
                // Allow setting reimbursement_status to NULL
                $updateData[$field] = null;
            } else {
                $updateData[$field] = $input[$field];
            }
        }
    }

    if (empty($updateData)) {
        errorResponse('No valid fields to update');
    }

    // Track if category changed for rule creation
    $categoryChanged = isset($updateData['category_id']) &&
                       $updateData['category_id'] != $transaction['category_id'];

    // If category changed manually, update categorized_by
    if ($categoryChanged) {
        $updateData['categorized_by'] = 'manual';
        $updateData['is_reviewed'] = 1;
        $updateData['reviewed_at'] = date('Y-m-d H:i:s');
    }

    // If marking as reviewed
    if (isset($updateData['is_reviewed']) && $updateData['is_reviewed'] && !$transaction['is_reviewed']) {
        $updateData['reviewed_at'] = date('Y-m-d H:i:s');
    }

    // Perform update
    $db->update('transactions', $updateData, 'id = :id', ['id' => $id]);

    // Create categorization rule if category changed and requested
    $newRule = null;
    if ($categoryChanged && !empty($input['create_rule'])) {
        $categorizer = new Categorizer($transaction['user_id']);

        $matchField = $input['rule_match_field'] ?? 'vendor';
        $matchType = $input['rule_match_type'] ?? 'contains';

        $ruleId = $categorizer->createRuleFromManual(
            $id,
            (int)$updateData['category_id'],
            $matchField,
            $matchType
        );

        if ($ruleId) {
            $newRule = $db->fetch(
                "SELECT * FROM categorization_rules WHERE id = :id",
                ['id' => $ruleId]
            );
        }
    }

    // Log the change
    $db->insert('audit_log', [
        'user_id' => $transaction['user_id'],
        'action' => 'update',
        'entity_type' => 'transaction',
        'entity_id' => $id,
        'old_values' => json_encode($oldValues),
        'new_values' => json_encode($newValues),
        'ip_address' => getClientIp(),
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);

    // Get updated transaction
    $updated = $db->fetch(
        "SELECT t.*, c.name AS category_name, c.color AS category_color
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.id = :id",
        ['id' => $id]
    );

    successResponse([
        'transaction' => $updated,
        'rule_created' => $newRule
    ], 'Transaction updated successfully');

} catch (Exception $e) {
    appLog('Transaction update error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
