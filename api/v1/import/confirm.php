<?php
/**
 * Confirm Import - Import selected transactions after preview
 * POST /api/v1/import/confirm.php
 *
 * Accepts array of transactions to import (user has already selected)
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

if (empty($input['account_id'])) {
    errorResponse('Account ID is required');
}

if (!isset($input['transactions']) || !is_array($input['transactions'])) {
    errorResponse('Transactions array is required');
}

$userId = (int)$input['user_id'];
$accountId = (int)$input['account_id'];
$transactions = $input['transactions'];

if (empty($transactions)) {
    successResponse(['imported' => 0], 'No transactions to import');
}

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
    $importedDetails = [];

    foreach ($transactions as $txn) {
        try {
            $transactionDate = $txn['date'] ?? null;
            $description = $txn['description'] ?? '';
            $amount = (float)($txn['amount'] ?? 0);

            if (empty($transactionDate) || empty($description)) {
                $errors[] = "Missing required fields for: $description";
                continue;
            }

            // Determine transaction type
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
                'account_id' => $accountId,
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

            $importedDetails[] = [
                'date' => $transactionDate,
                'description' => $description,
                'amount' => $amount
            ];

            $imported++;

        } catch (Exception $e) {
            $errors[] = "Error importing '$description': " . $e->getMessage();
        }
    }

    // Update account balance
    if ($imported > 0) {
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
        'imported_details' => $importedDetails,
        'errors' => $errors,
        'account_id' => $accountId
    ], "$imported transaction(s) imported successfully");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import confirm error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
