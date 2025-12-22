<?php
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$db = Database::getInstance();
$pdo = $db->getConnection();

switch ($method) {
    case 'GET':
        handleGet($pdo);
        break;
    case 'POST':
        handlePost($db);
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet(PDO $pdo): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $includeInactive = isset($_GET['include_inactive']) && $_GET['include_inactive'] === '1';

    $where = ['1=1'];
    $params = [];

    if ($userId) {
        $where[] = '(a.user_id = :user_id OR a.is_joint = 1 OR a.id IN (SELECT account_id FROM account_shares WHERE shared_with_user_id = :shared_user_id))';
        $params['user_id'] = $userId;
        $params['shared_user_id'] = $userId;
    }

    if (!$includeInactive) {
        $where[] = 'a.is_active = 1';
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT
                a.id, a.user_id, a.institution_id, a.account_name, a.account_type,
                a.account_number_last4, a.currency, a.current_balance, a.available_balance,
                a.credit_limit, a.interest_rate, a.is_active, a.include_in_totals,
                a.is_joint, a.color, a.notes, a.last_synced_at, a.created_at, a.updated_at,
                fi.name AS institution_name,
                fi.short_code AS institution_code,
                fi.institution_type AS institution_type
            FROM accounts a
            LEFT JOIN financial_institutions fi ON a.institution_id = fi.id
            WHERE $whereClause
            ORDER BY a.account_type, a.account_name";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get transaction stats separately
    foreach ($accounts as &$acc) {
        $statsStmt = $pdo->prepare("SELECT
            COUNT(*) as transaction_count,
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) as month_income,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN ABS(amount) ELSE 0 END), 0) as month_expenses
            FROM transactions
            WHERE account_id = ? AND transaction_date >= DATE_FORMAT(NOW(), '%Y-%m-01')");
        $statsStmt->execute([$acc['id']]);
        $stats = $statsStmt->fetch(PDO::FETCH_ASSOC);

        $acc['transaction_count'] = (int)$stats['transaction_count'];
        $acc['month_income'] = (float)$stats['month_income'];
        $acc['month_expenses'] = (float)$stats['month_expenses'];
        $acc['current_balance'] = (float)$acc['current_balance'];
        $acc['is_joint'] = (int)$acc['is_joint'];
    }

    $grouped = [];
    foreach ($accounts as $account) {
        $type = $account['account_type'];
        if (!isset($grouped[$type])) {
            $grouped[$type] = [];
        }
        $grouped[$type][] = $account;
    }

    $totals = [
        'total_balance' => array_sum(array_column($accounts, 'current_balance')),
        'total_month_income' => array_sum(array_column($accounts, 'month_income')),
        'total_month_expenses' => array_sum(array_column($accounts, 'month_expenses')),
        'account_count' => count($accounts)
    ];

    successResponse([
        'accounts' => $accounts,
        'grouped' => $grouped,
        'totals' => $totals
    ]);
}

function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    $required = ['user_id', 'account_name', 'account_type'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            errorResponse("Field '$field' is required");
        }
    }

    $validTypes = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'trust', 'iolta', 'other'];
    if (!in_array($input['account_type'], $validTypes)) {
        errorResponse('Invalid account type');
    }

    if (!$db->exists('users', 'id = :id', ['id' => $input['user_id']])) {
        errorResponse('User not found', 404);
    }

    $accountData = [
        'user_id' => (int)$input['user_id'],
        'institution_id' => !empty($input['institution_id']) ? (int)$input['institution_id'] : null,
        'account_name' => sanitize($input['account_name']),
        'account_type' => $input['account_type'],
        'account_number_last4' => !empty($input['account_number_last4']) ? substr($input['account_number_last4'], -4) : null,
        'currency' => $input['currency'] ?? DEFAULT_CURRENCY,
        'current_balance' => (float)($input['current_balance'] ?? 0),
        'available_balance' => isset($input['available_balance']) ? (float)$input['available_balance'] : null,
        'credit_limit' => isset($input['credit_limit']) ? (float)$input['credit_limit'] : null,
        'interest_rate' => isset($input['interest_rate']) ? (float)$input['interest_rate'] : null,
        'is_active' => 1,
        'include_in_totals' => isset($input['include_in_totals']) ? (int)$input['include_in_totals'] : 1,
        'color' => $input['color'] ?? null,
        'notes' => $input['notes'] ?? null
    ];

    $accountId = $db->insert('accounts', $accountData);

    $account = $db->fetch(
        "SELECT a.*, fi.name AS institution_name FROM accounts a LEFT JOIN financial_institutions fi ON a.institution_id = fi.id WHERE a.id = :id",
        ['id' => $accountId]
    );

    $db->insert('audit_log', [
        'user_id' => $input['user_id'],
        'action' => 'create',
        'entity_type' => 'account',
        'entity_id' => $accountId,
        'new_values' => json_encode($accountData),
        'ip_address' => getClientIp()
    ]);

    successResponse(['account' => $account], 'Account created successfully');
}
