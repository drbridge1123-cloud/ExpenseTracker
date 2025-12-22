<?php
/**
 * Import Selected Duplicates
 * POST /api/v1/import/duplicates.php
 *
 * Imports transactions that were flagged as duplicates but user confirmed are valid
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['user_id'])) {
    errorResponse('User ID is required');
}

if (empty($input['transactions']) || !is_array($input['transactions'])) {
    errorResponse('Transactions array is required');
}

$userId = (int)$input['user_id'];
$accountId = !empty($input['account_id']) ? (int)$input['account_id'] : null;
$transactions = $input['transactions'];

try {
    $db = Database::getInstance();

    // Get uncategorized category for this user
    $uncategorized = $db->fetch(
        "SELECT id FROM categories WHERE user_id = :user_id AND name = 'Uncategorized'",
        ['user_id' => $userId]
    );
    $uncategorizedId = $uncategorized ? $uncategorized['id'] : null;

    if (!$uncategorizedId) {
        $db->insert('categories', [
            'user_id' => $userId,
            'name' => 'Uncategorized',
            'type' => 'expense',
            'color' => '#9CA3AF',
            'icon' => 'help-circle'
        ]);
        $uncategorizedId = $db->lastInsertId();
    }

    // Initialize Categorizer for rule-based categorization
    $categorizer = new Categorizer($userId);

    $db->beginTransaction();

    $imported = 0;
    $errors = [];

    foreach ($transactions as $txn) {
        try {
            $transactionDate = $txn['date'] ?? null;
            $description = $txn['description'] ?? '';
            $amount = (float)($txn['amount'] ?? 0);
            $txnAccountId = !empty($txn['account_id']) ? (int)$txn['account_id'] : $accountId;

            if (empty($transactionDate) || empty($description) || !$txnAccountId) {
                $errors[] = "Missing required fields for: $description";
                continue;
            }

            // Determine transaction type (expense = negative amount, income = positive)
            $transactionType = $amount < 0 ? 'debit' : 'credit';

            // Try to categorize using user's rules
            $categoryId = $uncategorizedId;
            $categorizedBy = 'default';

            $txnForRules = [
                'description' => $description,
                'original_description' => $description,
                'vendor_name' => '',
                'memo' => '',
                'amount' => $amount
            ];
            $ruleResult = $categorizer->categorize($txnForRules);

            if ($ruleResult && $ruleResult['categorized_by'] === 'rule') {
                $categoryId = $ruleResult['category_id'];
                $categorizedBy = 'rule';
            }

            // Insert transaction
            $db->insert('transactions', [
                'user_id' => $userId,
                'account_id' => $txnAccountId,
                'category_id' => $categoryId,
                'amount' => $amount,
                'description' => $description,
                'original_description' => $description,
                'transaction_date' => $transactionDate,
                'transaction_type' => $transactionType,
                'status' => 'posted',
                'is_recurring' => 0,
                'categorized_by' => $categorizedBy
            ]);

            $imported++;

        } catch (Exception $e) {
            $errors[] = "Error importing '$description': " . $e->getMessage();
        }
    }

    // Update account balance if we imported any transactions
    if ($imported > 0 && $accountId) {
        $balanceResult = $db->fetch(
            "SELECT SUM(amount) as total FROM transactions WHERE account_id = :account_id",
            ['account_id' => $accountId]
        );
        $newBalance = $balanceResult['total'] ?? 0;

        $db->query(
            "UPDATE accounts SET current_balance = :balance WHERE id = :account_id",
            ['balance' => $newBalance, 'account_id' => $accountId]
        );
    }

    $db->commit();

    successResponse([
        'imported' => $imported,
        'errors' => $errors
    ], "$imported transaction(s) imported successfully");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import duplicates error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
