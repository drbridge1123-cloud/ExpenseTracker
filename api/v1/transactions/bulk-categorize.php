<?php
/**
 * Bulk Categorize Transactions by IDs
 * POST /api/transactions/bulk-categorize.php
 *
 * Body: {
 *   "user_id": 1,
 *   "transaction_ids": [1, 2, 3],
 *   "category_id": 5,
 *   "create_rule": true  (optional - creates rule based on common pattern)
 * }
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
$transactionIds = $input['transaction_ids'] ?? [];
$categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
$createRule = !empty($input['create_rule']);
$ruleData = $input['rule_data'] ?? null; // Custom rule settings from UI

// Debug log
appLog('Bulk categorize request', 'debug', [
    'user_id' => $userId,
    'transaction_ids' => $transactionIds,
    'category_id' => $categoryId
]);

if (!$userId) {
    errorResponse('User ID is required');
}

if (empty($transactionIds) || !is_array($transactionIds)) {
    errorResponse('Transaction IDs are required');
}

if (!$categoryId) {
    errorResponse('Category ID is required');
}

try {
    $db = Database::getInstance();

    // Verify category exists
    $category = $db->fetch(
        "SELECT id, name FROM categories WHERE id = :id",
        ['id' => $categoryId]
    );

    if (!$category) {
        errorResponse('Category not found', 404);
    }

    // Sanitize transaction IDs
    $transactionIds = array_map('intval', $transactionIds);
    $idList = implode(',', $transactionIds);

    // Update transactions
    $sql = "UPDATE transactions
            SET category_id = :category_id,
                categorized_by = 'manual',
                categorization_confidence = 100
            WHERE id IN ($idList)
              AND user_id = :user_id";

    appLog('Bulk categorize SQL', 'debug', [
        'sql' => $sql,
        'idList' => $idList,
        'category_id' => $categoryId,
        'user_id' => $userId
    ]);

    $stmt = $db->query($sql, [
        'category_id' => $categoryId,
        'user_id' => $userId
    ]);
    $updated = $stmt->rowCount();

    appLog('Bulk categorize result', 'debug', ['updated' => $updated]);

    // Create rules if requested
    $rulesCreated = 0;
    $ruleCreated = false;

    if ($createRule && $updated > 0) {
        // If custom rule data provided, use it directly
        if ($ruleData && !empty($ruleData['rule_name']) && !empty($ruleData['match_value'])) {
            $ruleName = trim($ruleData['rule_name']);
            $matchField = $ruleData['match_field'] ?? 'description';
            $matchType = $ruleData['match_type'] ?? 'contains';
            $matchValue = trim($ruleData['match_value']);
            $priority = (int)($ruleData['priority'] ?? 50);

            // Validate match_field
            $validFields = ['description', 'vendor_name', 'amount'];
            if (!in_array($matchField, $validFields)) {
                $matchField = 'description';
            }

            // Validate match_type
            $validTypes = ['contains', 'exact', 'starts_with', 'regex'];
            if (!in_array($matchType, $validTypes)) {
                $matchType = 'contains';
            }

            // Check if exact rule already exists
            $existingRule = $db->fetch(
                "SELECT id FROM categorization_rules
                 WHERE UPPER(match_value) = UPPER(:match_value)
                 AND match_type = :match_type
                 AND match_field = :match_field
                 AND user_id = :user_id",
                [
                    'match_value' => $matchValue,
                    'match_type' => $matchType,
                    'match_field' => $matchField,
                    'user_id' => $userId
                ]
            );

            if (!$existingRule) {
                $db->insert('categorization_rules', [
                    'user_id' => $userId,
                    'category_id' => $categoryId,
                    'rule_name' => $ruleName,
                    'match_field' => $matchField,
                    'match_type' => $matchType,
                    'match_value' => $matchValue,
                    'priority' => $priority,
                    'is_active' => 1
                ]);
                $rulesCreated = 1;
                $ruleCreated = true;
            }
        } else {
            // Fallback: auto-generate rules based on patterns (legacy behavior)
            $patternsProcessed = [];
            $transactions = $db->fetchAll(
                "SELECT description, vendor_name FROM transactions WHERE id IN ($idList)"
            );

            $skipPatterns = ['STORE', 'PAYMENT', 'PURCHASE', 'DEBIT', 'CREDIT', 'ACH', 'POS',
                             'CHECKCARD', 'TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'CHARGE',
                             'THANK', 'YOU', 'THE', 'AND', 'FOR', 'INC', 'LLC', 'CORP'];

            foreach ($transactions as $txn) {
                $pattern = $txn['vendor_name'] ?: $txn['description'];
                if (!$pattern) continue;

                $pattern = preg_replace('/^(PURCHASE|DEBIT|CREDIT|ACH|POS|CHECKCARD|SQ \*|TST\*|DD \*|SP |PY \*)\s*/i', '', $pattern);
                $parts = preg_split('/[\s\*#\-]+/', trim($pattern));
                $patternParts = [];
                foreach ($parts as $part) {
                    $part = trim($part);
                    if (strlen($part) < 3 || is_numeric($part) || in_array(strtoupper($part), $skipPatterns)) {
                        continue;
                    }
                    $patternParts[] = $part;
                    if (count($patternParts) >= 2) break;
                }

                if (empty($patternParts)) continue;

                $cleanPattern = implode(' ', $patternParts);
                $upperPattern = strtoupper($cleanPattern);

                if (in_array($upperPattern, $patternsProcessed)) continue;
                $patternsProcessed[] = $upperPattern;

                if (strlen($cleanPattern) >= 3) {
                    $existingRule = $db->fetch(
                        "SELECT id FROM categorization_rules WHERE UPPER(match_value) = UPPER(:pattern)",
                        ['pattern' => $cleanPattern]
                    );

                    if (!$existingRule) {
                        $db->insert('categorization_rules', [
                            'user_id' => $userId,
                            'category_id' => $categoryId,
                            'rule_name' => $cleanPattern,
                            'match_field' => 'description',
                            'match_type' => 'contains',
                            'match_value' => $cleanPattern,
                            'priority' => 50,
                            'is_active' => 1
                        ]);
                        $rulesCreated++;
                    }
                }
            }
        }
    }

    $ruleMsg = $rulesCreated > 0 ? " and $rulesCreated rule(s) created" : "";
    successResponse([
        'updated' => $updated,
        'transaction_ids' => $transactionIds,
        'rules_created' => $rulesCreated
    ], "$updated transactions categorized$ruleMsg");

} catch (Exception $e) {
    appLog('Bulk categorize error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
