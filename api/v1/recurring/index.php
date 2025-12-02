<?php
/**
 * Recurring Transactions API
 * GET /api/recurring/ - List recurring transactions
 * POST /api/recurring/ - Create/update recurring transaction
 * DELETE /api/recurring/?id=X - Delete recurring transaction
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGet();
        break;
    case 'POST':
        handlePost();
        break;
    case 'DELETE':
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed', 405);
}

function handleGet() {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    try {
        $db = Database::getInstance();

        $recurring = $db->fetchAll(
            "SELECT r.*,
                    a.account_name as account_name,
                    c.name as category_name,
                    c.icon as category_icon,
                    c.color as category_color
             FROM recurring_transactions r
             LEFT JOIN accounts a ON r.account_id = a.id
             LEFT JOIN categories c ON r.category_id = c.id
             WHERE r.user_id = :user_id
             ORDER BY r.is_active DESC, r.next_occurrence ASC",
            ['user_id' => $userId]
        );

        // Calculate next occurrence for each
        foreach ($recurring as &$r) {
            $r['amount'] = (float)$r['amount'];
            if ($r['next_occurrence']) {
                $r['days_until'] = (strtotime($r['next_occurrence']) - strtotime('today')) / 86400;
            }
        }

        // Get upcoming this month
        $upcomingThisMonth = array_filter($recurring, function($r) {
            return $r['is_active'] &&
                   $r['next_occurrence'] &&
                   date('Y-m', strtotime($r['next_occurrence'])) === date('Y-m');
        });

        $totalMonthly = array_sum(array_map(function($r) {
            return $r['transaction_type'] === 'debit' ? abs($r['amount']) : 0;
        }, array_filter($recurring, fn($r) => $r['is_active'] && $r['frequency'] === 'monthly')));

        successResponse([
            'recurring' => array_values($recurring),
            'summary' => [
                'total_active' => count(array_filter($recurring, fn($r) => $r['is_active'])),
                'upcoming_this_month' => count($upcomingThisMonth),
                'total_monthly_expenses' => $totalMonthly
            ]
        ]);

    } catch (Exception $e) {
        appLog('Recurring list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    $input = json_decode(file_get_contents('php://input'), true);

    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $accountId = !empty($input['account_id']) ? (int)$input['account_id'] : null;
    $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
    $description = trim($input['description'] ?? '');
    $amount = isset($input['amount']) ? (float)$input['amount'] : null;
    $transactionType = $input['transaction_type'] ?? 'debit';
    $frequency = $input['frequency'] ?? 'monthly';
    $dayOfMonth = !empty($input['day_of_month']) ? (int)$input['day_of_month'] : null;
    $startDate = $input['start_date'] ?? date('Y-m-d');
    $endDate = !empty($input['end_date']) ? $input['end_date'] : null;
    $autoCreate = !empty($input['auto_create']) ? 1 : 0;

    if (!$userId) {
        errorResponse('User ID is required');
    }
    if (!$accountId) {
        errorResponse('Account ID is required');
    }
    if (empty($description)) {
        errorResponse('Description is required');
    }
    if ($amount === null) {
        errorResponse('Amount is required');
    }

    try {
        $db = Database::getInstance();

        // Calculate next occurrence
        $nextOccurrence = calculateNextOccurrence($frequency, $dayOfMonth, $startDate);

        $data = [
            'user_id' => $userId,
            'account_id' => $accountId,
            'category_id' => $categoryId,
            'description' => $description,
            'amount' => abs($amount),
            'transaction_type' => $transactionType,
            'frequency' => $frequency,
            'day_of_month' => $dayOfMonth,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'next_occurrence' => $nextOccurrence,
            'auto_create' => $autoCreate,
            'is_active' => 1
        ];

        if ($id) {
            // Update
            $db->query(
                "UPDATE recurring_transactions SET
                    account_id = :account_id,
                    category_id = :category_id,
                    description = :description,
                    amount = :amount,
                    transaction_type = :transaction_type,
                    frequency = :frequency,
                    day_of_month = :day_of_month,
                    start_date = :start_date,
                    end_date = :end_date,
                    next_occurrence = :next_occurrence,
                    auto_create = :auto_create
                 WHERE id = :id AND user_id = :user_id",
                array_merge($data, ['id' => $id])
            );
            $recurringId = $id;
            $message = 'Recurring transaction updated';
        } else {
            // Create
            $recurringId = $db->insert('recurring_transactions', $data);
            $message = 'Recurring transaction created';
        }

        successResponse(['id' => $recurringId], $message);

    } catch (Exception $e) {
        appLog('Recurring save error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('ID is required');
    }

    try {
        $db = Database::getInstance();
        $db->query("DELETE FROM recurring_transactions WHERE id = :id", ['id' => $id]);
        successResponse(['deleted' => true], 'Recurring transaction deleted');
    } catch (Exception $e) {
        appLog('Recurring delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function calculateNextOccurrence($frequency, $dayOfMonth, $startDate) {
    $start = new DateTime($startDate);
    $today = new DateTime('today');

    if ($start > $today) {
        return $start->format('Y-m-d');
    }

    switch ($frequency) {
        case 'daily':
            return $today->format('Y-m-d');

        case 'weekly':
            $dayOfWeek = $start->format('N'); // 1-7
            $next = clone $today;
            $currentDay = $next->format('N');
            $daysToAdd = ($dayOfWeek - $currentDay + 7) % 7;
            if ($daysToAdd === 0) $daysToAdd = 7;
            $next->modify("+$daysToAdd days");
            return $next->format('Y-m-d');

        case 'biweekly':
            $diff = $today->diff($start)->days;
            $weeksElapsed = floor($diff / 7);
            $biweeksToAdd = ceil(($weeksElapsed + 1) / 2) * 2;
            $next = clone $start;
            $next->modify("+$biweeksToAdd weeks");
            return $next->format('Y-m-d');

        case 'monthly':
            $day = $dayOfMonth ?: (int)$start->format('d');
            $next = new DateTime($today->format('Y-m') . '-01');

            // If we're past this month's day, go to next month
            if ((int)$today->format('d') >= $day) {
                $next->modify('+1 month');
            }

            // Handle months with fewer days
            $lastDay = (int)$next->format('t');
            $day = min($day, $lastDay);
            $next->setDate($next->format('Y'), $next->format('m'), $day);

            return $next->format('Y-m-d');

        case 'quarterly':
            $month = (int)$start->format('m');
            $quarterMonth = ((ceil($month / 3) - 1) * 3) + 1;
            $next = new DateTime($today->format('Y') . '-' . str_pad($quarterMonth, 2, '0', STR_PAD_LEFT) . '-' . $start->format('d'));
            while ($next <= $today) {
                $next->modify('+3 months');
            }
            return $next->format('Y-m-d');

        case 'yearly':
            $next = new DateTime($today->format('Y') . '-' . $start->format('m-d'));
            if ($next <= $today) {
                $next->modify('+1 year');
            }
            return $next->format('Y-m-d');

        default:
            return $today->format('Y-m-d');
    }
}
