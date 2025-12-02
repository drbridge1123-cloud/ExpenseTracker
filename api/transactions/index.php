<?php
/**
 * Transactions API - List/Search Transactions
 * GET /api/transactions/
 */

require_once __DIR__ . '/../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = Database::getInstance();

    // Get query parameters
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(10000, max(10, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    // Build WHERE conditions
    $conditions = ['1=1'];
    $params = [];

    // Filter by specific transaction ID
    if (!empty($_GET['id'])) {
        $conditions[] = 't.id = :id';
        $params['id'] = (int)$_GET['id'];
    }

    // Filter by user (include shared accounts)
    if (!empty($_GET['user_id'])) {
        $userId = (int)$_GET['user_id'];
        $conditions[] = '(t.user_id = :user_id OR t.account_id IN (SELECT account_id FROM account_shares WHERE shared_with_user_id = :shared_user_id))';
        $params['user_id'] = $userId;
        $params['shared_user_id'] = $userId;
    }

    // Filter by account
    if (!empty($_GET['account_id'])) {
        $conditions[] = 't.account_id = :account_id';
        $params['account_id'] = (int)$_GET['account_id'];
    }

    // Filter by category
    if (!empty($_GET['category_id'])) {
        $conditions[] = 't.category_id = :category_id';
        $params['category_id'] = (int)$_GET['category_id'];
    }

    // Filter by transaction type
    if (!empty($_GET['type'])) {
        $conditions[] = 't.transaction_type = :type';
        $params['type'] = $_GET['type'];
    }

    // Filter by status
    if (!empty($_GET['status'])) {
        $conditions[] = 't.status = :status';
        $params['status'] = $_GET['status'];
    }

    // Filter by date range
    if (!empty($_GET['start_date'])) {
        $conditions[] = 't.transaction_date >= :start_date';
        $params['start_date'] = $_GET['start_date'];
    }

    if (!empty($_GET['end_date'])) {
        $conditions[] = 't.transaction_date <= :end_date';
        $params['end_date'] = $_GET['end_date'];
    }

    // Filter by amount range
    if (isset($_GET['min_amount'])) {
        $conditions[] = 'ABS(t.amount) >= :min_amount';
        $params['min_amount'] = (float)$_GET['min_amount'];
    }

    if (isset($_GET['max_amount'])) {
        $conditions[] = 'ABS(t.amount) <= :max_amount';
        $params['max_amount'] = (float)$_GET['max_amount'];
    }

    // Search in description/vendor
    if (!empty($_GET['search'])) {
        $searchTerm = '%' . $_GET['search'] . '%';
        $conditions[] = '(t.description LIKE :search OR t.vendor_name LIKE :search2 OR t.original_description LIKE :search3)';
        $params['search'] = $searchTerm;
        $params['search2'] = $searchTerm;
        $params['search3'] = $searchTerm;
    }

    // Filter uncategorized
    if (isset($_GET['uncategorized']) && $_GET['uncategorized'] === '1') {
        $conditions[] = '(t.category_id IS NULL OR c.slug = :uncategorized_slug)';
        $params['uncategorized_slug'] = 'uncategorized';
    }

    // Filter unreviewed
    if (isset($_GET['unreviewed']) && $_GET['unreviewed'] === '1') {
        $conditions[] = 't.is_reviewed = 0';
    }

    // Filter by reconciliation status
    if (isset($_GET['is_reconciled'])) {
        $conditions[] = 't.is_reconciled = :is_reconciled';
        $params['is_reconciled'] = (int)$_GET['is_reconciled'];
    }

    $whereClause = implode(' AND ', $conditions);

    // Sorting
    $sortColumn = $_GET['sort'] ?? 'transaction_date';
    $sortDir = strtoupper($_GET['order'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

    $allowedSort = ['transaction_date', 'amount', 'description', 'vendor_name', 'created_at'];
    if (!in_array($sortColumn, $allowedSort)) {
        $sortColumn = 'transaction_date';
    }

    // Get total count
    $countSql = "SELECT COUNT(*) FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE $whereClause";
    $totalCount = $db->fetchColumn($countSql, $params);

    // Get transactions with joins
    $sql = "SELECT
                t.id,
                t.user_id,
                t.account_id,
                t.category_id,
                t.transaction_date,
                t.post_date,
                t.description,
                t.original_description,
                t.vendor_name,
                t.amount,
                t.currency,
                t.transaction_type,
                t.status,
                t.is_recurring,
                t.check_number,
                t.memo,
                t.tags,
                t.categorized_by,
                t.categorization_confidence,
                t.is_reviewed,
                t.created_at,
                t.reimbursement_status,
                a.account_name,
                a.account_type AS account_type,
                a.color AS account_color,
                c.name AS category_name,
                c.slug AS category_slug,
                c.icon AS category_icon,
                c.color AS category_color,
                c.category_type,
                u.username,
                u.display_name,
                (SELECT COUNT(*) FROM receipts r WHERE r.transaction_id = t.id) AS has_receipt
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE $whereClause
            ORDER BY t.$sortColumn $sortDir, t.id DESC
            LIMIT $limit OFFSET $offset";

    $transactions = $db->fetchAll($sql, $params);

    // Parse JSON fields
    foreach ($transactions as &$t) {
        $t['tags'] = $t['tags'] ? json_decode($t['tags'], true) : [];
        $t['amount'] = (float)$t['amount'];
    }

    // Calculate pagination info
    $totalPages = ceil($totalCount / $limit);

    successResponse([
        'transactions' => $transactions,
        'pagination' => [
            'current_page' => $page,
            'per_page' => $limit,
            'total_items' => (int)$totalCount,
            'total_pages' => $totalPages,
            'has_next' => $page < $totalPages,
            'has_prev' => $page > 1
        ]
    ]);

} catch (Exception $e) {
    appLog('Transactions list error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
