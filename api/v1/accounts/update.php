<?php
/**
 * Account Update/Delete API
 * PUT: Update account
 * DELETE: Delete/deactivate account
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['id'])) {
    errorResponse('Account ID is required');
}

$id = (int)$input['id'];

try {
    $db = Database::getInstance();

    // Verify account exists
    $account = $db->fetch("SELECT * FROM accounts WHERE id = :id", ['id' => $id]);

    if (!$account) {
        errorResponse('Account not found', 404);
    }

    switch ($method) {
        case 'PUT':
        case 'POST': // Allow POST for updates too
            handleUpdate($db, $account, $input);
            break;
        case 'DELETE':
            handleDelete($db, $account, $input);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Account update error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * Update account
 */
function handleUpdate(Database $db, array $account, array $input): void {
    $allowedFields = [
        'account_name', 'account_type', 'institution_id',
        'account_number_last4', 'currency', 'current_balance',
        'available_balance', 'credit_limit', 'interest_rate',
        'is_active', 'include_in_totals', 'color', 'notes'
    ];

    $updateData = [];
    $oldValues = [];
    $newValues = [];

    foreach ($allowedFields as $field) {
        if (array_key_exists($field, $input)) {
            $oldValues[$field] = $account[$field];
            $newValues[$field] = $input[$field];

            // Type casting and validation
            switch ($field) {
                case 'current_balance':
                case 'available_balance':
                case 'credit_limit':
                case 'interest_rate':
                    $updateData[$field] = $input[$field] !== null ? (float)$input[$field] : null;
                    break;
                case 'institution_id':
                    $updateData[$field] = $input[$field] ? (int)$input[$field] : null;
                    break;
                case 'is_active':
                case 'include_in_totals':
                    $updateData[$field] = (int)$input[$field];
                    break;
                case 'account_number_last4':
                    $updateData[$field] = $input[$field] ? substr($input[$field], -4) : null;
                    break;
                case 'account_type':
                    $validTypes = ['checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'other'];
                    if (!in_array($input[$field], $validTypes)) {
                        errorResponse('Invalid account type');
                    }
                    $updateData[$field] = $input[$field];
                    break;
                default:
                    $updateData[$field] = sanitize($input[$field]);
            }
        }
    }

    if (empty($updateData)) {
        errorResponse('No valid fields to update');
    }

    $db->update('accounts', $updateData, 'id = :id', ['id' => $account['id']]);

    // Log the change
    $db->insert('audit_log', [
        'user_id' => $account['user_id'],
        'action' => 'update',
        'entity_type' => 'account',
        'entity_id' => $account['id'],
        'old_values' => json_encode($oldValues),
        'new_values' => json_encode($newValues),
        'ip_address' => getClientIp()
    ]);

    // Get updated account
    $updated = $db->fetch(
        "SELECT a.*, fi.name AS institution_name
         FROM accounts a
         LEFT JOIN financial_institutions fi ON a.institution_id = fi.id
         WHERE a.id = :id",
        ['id' => $account['id']]
    );

    successResponse(['account' => $updated], 'Account updated successfully');
}

/**
 * Delete/deactivate account
 */
function handleDelete(Database $db, array $account, array $input): void {
    // Check if account has transactions
    $transactionCount = $db->count('transactions', 'account_id = :id', ['id' => $account['id']]);

    if ($transactionCount > 0) {
        // Soft delete - just deactivate
        $db->update('accounts', ['is_active' => 0], 'id = :id', ['id' => $account['id']]);

        $db->insert('audit_log', [
            'user_id' => $account['user_id'],
            'action' => 'deactivate',
            'entity_type' => 'account',
            'entity_id' => $account['id'],
            'old_values' => json_encode(['is_active' => 1]),
            'new_values' => json_encode(['is_active' => 0]),
            'ip_address' => getClientIp()
        ]);

        successResponse([
            'deleted' => false,
            'deactivated' => true,
            'message' => "Account deactivated. Cannot delete because it has $transactionCount transactions."
        ], 'Account deactivated');
    } else {
        // Hard delete - no transactions
        $db->delete('accounts', 'id = :id', ['id' => $account['id']]);

        $db->insert('audit_log', [
            'user_id' => $account['user_id'],
            'action' => 'delete',
            'entity_type' => 'account',
            'entity_id' => $account['id'],
            'old_values' => json_encode($account),
            'ip_address' => getClientIp()
        ]);

        successResponse(['deleted' => true], 'Account deleted successfully');
    }
}
