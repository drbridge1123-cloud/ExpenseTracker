<?php
/**
 * Transaction Detail API
 * GET /api/transactions/detail.php?id=123
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$id = (int)($_GET['id'] ?? 0);

if (!$id) {
    errorResponse('Transaction ID is required');
}

try {
    $db = Database::getInstance();

    $sql = "SELECT
                t.*,
                a.account_name,
                a.account_type,
                a.color AS account_color,
                a.currency AS account_currency,
                fi.name AS institution_name,
                fi.short_code AS institution_code,
                c.name AS category_name,
                c.slug AS category_slug,
                c.icon AS category_icon,
                c.color AS category_color,
                c.category_type,
                pc.name AS parent_category_name,
                u.username,
                u.display_name,
                ta.account_name AS transfer_account_name,
                r.rule_name AS matched_rule_name,
                r.match_value AS matched_rule_pattern
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN financial_institutions fi ON a.institution_id = fi.id
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN categories pc ON c.parent_id = pc.id
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
            LEFT JOIN categorization_rules r ON t.categorized_by = 'rule'
            WHERE t.id = :id";

    $transaction = $db->fetch($sql, ['id' => $id]);

    if (!$transaction) {
        errorResponse('Transaction not found', 404);
    }

    // Parse JSON fields
    $transaction['tags'] = $transaction['tags'] ? json_decode($transaction['tags'], true) : [];
    $transaction['location'] = $transaction['location'] ? json_decode($transaction['location'], true) : null;
    $transaction['amount'] = (float)$transaction['amount'];

    // Get related transactions (same vendor, within 30 days)
    $relatedSql = "SELECT
                    id, transaction_date, description, amount, category_id
                   FROM transactions
                   WHERE vendor_name = :vendor
                   AND id != :id
                   AND transaction_date BETWEEN DATE_SUB(:date, INTERVAL 30 DAY)
                                            AND DATE_ADD(:date2, INTERVAL 30 DAY)
                   ORDER BY transaction_date DESC
                   LIMIT 5";

    $related = $db->fetchAll($relatedSql, [
        'vendor' => $transaction['vendor_name'],
        'id' => $id,
        'date' => $transaction['transaction_date'],
        'date2' => $transaction['transaction_date']
    ]);

    // Get split transactions if this is a split parent
    $splits = [];
    if ($transaction['is_split']) {
        $splits = $db->fetchAll(
            "SELECT id, description, amount, category_id
             FROM transactions
             WHERE parent_transaction_id = :id",
            ['id' => $id]
        );
    }

    // Get import batch info if imported
    $importBatch = null;
    if ($transaction['import_batch_id']) {
        $importBatch = $db->fetch(
            "SELECT id, filename, imported_rows, created_at
             FROM import_batches
             WHERE id = :id",
            ['id' => $transaction['import_batch_id']]
        );
    }

    // Get receipt linked to this transaction
    $receipt = $db->fetch(
        "SELECT id, file_name, original_name, file_path, file_type, file_size,
                description, receipt_date, vendor_name, amount, created_at
         FROM receipts
         WHERE transaction_id = :id",
        ['id' => $id]
    );

    successResponse([
        'transaction' => $transaction,
        'related_transactions' => $related,
        'split_transactions' => $splits,
        'import_batch' => $importBatch,
        'receipt' => $receipt
    ]);

} catch (Exception $e) {
    appLog('Transaction detail error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
