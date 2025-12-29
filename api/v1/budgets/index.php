<?php
/**
 * Budgets API
 * GET /api/budgets/ - List all budgets with spending progress
 * POST /api/budgets/ - Create/update budget
 * DELETE /api/budgets/?id=X - Delete budget
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
    $month = $_GET['month'] ?? date('Y-m');

    if (!$userId) {
        errorResponse('User ID is required');
    }

    try {
        $db = Database::getInstance();

        // Get start and end of month
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));

        // Get budgets with current spending
        $budgets = $db->fetchAll(
            "SELECT
                b.id,
                b.category_id,
                b.amount as budget_amount,
                b.budget_type,
                c.name as category_name,
                c.icon as category_icon,
                c.color as category_color,
                c.category_type,
                COALESCE(SUM(ABS(t.amount)), 0) as spent
             FROM budgets b
             JOIN categories c ON b.category_id = c.id
             LEFT JOIN transactions t ON t.category_id = b.category_id
                  AND t.user_id = b.user_id
                  AND t.transaction_date BETWEEN :start_date AND :end_date
             WHERE b.user_id = :user_id
               AND b.is_active = 1
             GROUP BY b.id, b.category_id, b.amount, b.budget_type,
                      c.name, c.icon, c.color, c.category_type
             ORDER BY c.category_type, c.name",
            [
                'user_id' => $userId,
                'start_date' => $startDate,
                'end_date' => $endDate
            ]
        );

        // Calculate percentages and status
        $totalBudget = 0;
        $totalSpent = 0;

        foreach ($budgets as &$budget) {
            $budget['budget_amount'] = (float)$budget['budget_amount'];
            $budget['spent'] = (float)$budget['spent'];
            $budget['remaining'] = $budget['budget_amount'] - $budget['spent'];
            $budget['percent_used'] = $budget['budget_amount'] > 0
                ? round(($budget['spent'] / $budget['budget_amount']) * 100, 1)
                : 0;

            // Status: on_track, warning (>75%), over_budget (>100%)
            if ($budget['percent_used'] > 100) {
                $budget['status'] = 'over_budget';
            } elseif ($budget['percent_used'] > 75) {
                $budget['status'] = 'warning';
            } else {
                $budget['status'] = 'on_track';
            }

            $totalBudget += $budget['budget_amount'];
            $totalSpent += $budget['spent'];
        }

        // Get categories without budgets (for adding new budgets)
        // Get expense categories for this user (user_id matches or user_id IS NULL for shared categories)
        // Note: Use NOT EXISTS instead of NOT IN to handle NULL category_ids in budgets table
        $unbugdetedCategories = $db->fetchAll(
            "SELECT c.id, c.name, c.icon, c.color, c.category_type, c.parent_id, c.sort_order,
                    p.name AS parent_name
             FROM categories c
             LEFT JOIN categories p ON c.parent_id = p.id
             WHERE c.category_type = 'expense'
               AND (c.user_id = :user_id OR c.user_id IS NULL)
               AND NOT EXISTS (
                   SELECT 1 FROM budgets b
                   WHERE b.category_id = c.id
                     AND b.user_id = :user_id2
                     AND b.is_active = 1
               )
             ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.name",
            ['user_id' => $userId, 'user_id2' => $userId]
        );

        successResponse([
            'budgets' => $budgets,
            'unbudgeted_categories' => $unbugdetedCategories,
            'summary' => [
                'total_budget' => $totalBudget,
                'total_spent' => $totalSpent,
                'total_remaining' => $totalBudget - $totalSpent,
                'overall_percent' => $totalBudget > 0
                    ? round(($totalSpent / $totalBudget) * 100, 1)
                    : 0
            ],
            'period' => [
                'month' => $month,
                'start_date' => $startDate,
                'end_date' => $endDate
            ]
        ]);

    } catch (Exception $e) {
        appLog('Budget list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    $input = json_decode(file_get_contents('php://input'), true);

    $userId = !empty($input['user_id']) ? (int)$input['user_id'] : null;
    $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : null;
    $amount = isset($input['amount']) ? (float)$input['amount'] : null;
    $budgetType = $input['period_type'] ?? $input['budget_type'] ?? 'monthly';

    if (!$userId) {
        errorResponse('User ID is required');
    }
    if (!$categoryId) {
        errorResponse('Category ID is required');
    }
    if ($amount === null || $amount < 0) {
        errorResponse('Valid budget amount is required');
    }

    try {
        $db = Database::getInstance();

        // Check if budget exists for this category
        $existing = $db->fetch(
            "SELECT id FROM budgets
             WHERE user_id = :user_id
               AND category_id = :category_id
               AND budget_type = :budget_type",
            [
                'user_id' => $userId,
                'category_id' => $categoryId,
                'budget_type' => $budgetType
            ]
        );

        if ($existing) {
            // Update existing budget
            $db->query(
                "UPDATE budgets SET amount = :amount, is_active = 1
                 WHERE id = :id",
                ['amount' => $amount, 'id' => $existing['id']]
            );
            $budgetId = $existing['id'];
            $message = 'Budget updated';
        } else {
            // Create new budget
            $budgetId = $db->insert('budgets', [
                'user_id' => $userId,
                'category_id' => $categoryId,
                'amount' => $amount,
                'budget_type' => $budgetType,
                'start_date' => date('Y-m-01'),
                'is_active' => 1
            ]);
            $message = 'Budget created';
        }

        successResponse(['id' => $budgetId], $message);

    } catch (Exception $e) {
        appLog('Budget save error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;

    if (!$id) {
        errorResponse('Budget ID is required');
    }

    try {
        $db = Database::getInstance();

        $db->query("DELETE FROM budgets WHERE id = :id", ['id' => $id]);

        successResponse(['deleted' => true], 'Budget deleted');

    } catch (Exception $e) {
        appLog('Budget delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
