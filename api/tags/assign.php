<?php
/**
 * Assign Tags to Transactions
 * POST /api/tags/assign.php
 *
 * Body: {
 *   "transaction_ids": [1, 2, 3],
 *   "tag_ids": [1, 2],
 *   "action": "add" | "remove" | "set"
 * }
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$transactionIds = $input['transaction_ids'] ?? [];
$tagIds = $input['tag_ids'] ?? [];
$action = $input['action'] ?? 'add';

if (empty($transactionIds)) {
    errorResponse('Transaction IDs are required');
}

try {
    $db = Database::getInstance();

    $transactionIds = array_map('intval', $transactionIds);
    $tagIds = array_map('intval', $tagIds);

    $affected = 0;

    foreach ($transactionIds as $txnId) {
        if ($action === 'set' || $action === 'remove') {
            // Remove existing tags
            if ($action === 'set') {
                $db->query(
                    "DELETE FROM transaction_tags WHERE transaction_id = :txn_id",
                    ['txn_id' => $txnId]
                );
            } elseif ($action === 'remove') {
                foreach ($tagIds as $tagId) {
                    $db->query(
                        "DELETE FROM transaction_tags WHERE transaction_id = :txn_id AND tag_id = :tag_id",
                        ['txn_id' => $txnId, 'tag_id' => $tagId]
                    );
                    $affected++;
                }
                continue;
            }
        }

        // Add tags
        if ($action === 'add' || $action === 'set') {
            foreach ($tagIds as $tagId) {
                // Check if already assigned
                $existing = $db->fetch(
                    "SELECT 1 FROM transaction_tags WHERE transaction_id = :txn_id AND tag_id = :tag_id",
                    ['txn_id' => $txnId, 'tag_id' => $tagId]
                );

                if (!$existing) {
                    $db->query(
                        "INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (:txn_id, :tag_id)",
                        ['txn_id' => $txnId, 'tag_id' => $tagId]
                    );
                    $affected++;
                }
            }
        }
    }

    successResponse([
        'affected' => $affected,
        'transactions' => count($transactionIds),
        'tags' => count($tagIds)
    ], 'Tags updated');

} catch (Exception $e) {
    appLog('Tag assign error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
