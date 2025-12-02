<?php
/**
 * Receipts API - Upload, List, Delete Receipts
 */

require_once __DIR__ . '/../../config/config.php';

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
    try {
        $db = Database::getInstance();

        $conditions = ['1=1'];
        $params = [];

        // Filter by user
        if (!empty($_GET['user_id'])) {
            $conditions[] = 'r.user_id = :user_id';
            $params['user_id'] = (int)$_GET['user_id'];
        }

        // Filter by transaction
        if (!empty($_GET['transaction_id'])) {
            $conditions[] = 'r.transaction_id = :transaction_id';
            $params['transaction_id'] = (int)$_GET['transaction_id'];
        }

        // Filter unattached receipts only (Cash tab)
        // Exclude submitted/reimbursed - they show in Requested/Reimbursements tabs
        if (isset($_GET['unattached']) && $_GET['unattached'] === '1') {
            $conditions[] = 'r.transaction_id IS NULL';
            $conditions[] = "(r.reimbursement_status IS NULL OR r.reimbursement_status IN ('none', 'pending'))";
        }

        // Filter by date range
        if (!empty($_GET['start_date'])) {
            $conditions[] = 'r.receipt_date >= :start_date';
            $params['start_date'] = $_GET['start_date'];
        }

        if (!empty($_GET['end_date'])) {
            $conditions[] = 'r.receipt_date <= :end_date';
            $params['end_date'] = $_GET['end_date'];
        }

        // Filter by folder
        if (isset($_GET['folder_id'])) {
            if ($_GET['folder_id'] === '' || $_GET['folder_id'] === 'unfiled') {
                $conditions[] = 'r.folder_id IS NULL';
            } else {
                $conditions[] = 'r.folder_id = :folder_id';
                $params['folder_id'] = (int)$_GET['folder_id'];
            }
        }

        $whereClause = implode(' AND ', $conditions);

        $sql = "SELECT
                    r.*,
                    t.description AS transaction_description,
                    t.amount AS transaction_amount,
                    t.transaction_date,
                    COALESCE(r.reimbursement_status, t.reimbursement_status, 'none') AS reimbursement_status,
                    t.reimbursement_status AS transaction_reimbursement_status,
                    f.name AS folder_name,
                    f.icon AS folder_icon,
                    f.color AS folder_color
                FROM receipts r
                LEFT JOIN transactions t ON r.transaction_id = t.id
                LEFT JOIN receipt_folders f ON r.folder_id = f.id
                WHERE $whereClause
                ORDER BY r.created_at DESC";

        $receipts = $db->fetchAll($sql, $params);

        successResponse(['receipts' => $receipts]);

    } catch (Exception $e) {
        appLog('Receipts list error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handlePost() {
    try {
        $db = Database::getInstance();

        // Check if it's a file upload or JSON request
        if (!empty($_FILES['receipt'])) {
            // File upload
            $file = $_FILES['receipt'];
            $userId = (int)($_POST['user_id'] ?? 0);
            $transactionId = !empty($_POST['transaction_id']) ? (int)$_POST['transaction_id'] : null;

            if (!$userId) {
                errorResponse('User ID is required');
            }

            // Validate file
            $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
            $maxSize = 10 * 1024 * 1024; // 10MB

            if (!in_array($file['type'], $allowedTypes)) {
                errorResponse('Invalid file type. Allowed: JPG, PNG, GIF, PDF');
            }

            if ($file['size'] > $maxSize) {
                errorResponse('File too large. Maximum size: 10MB');
            }

            // Generate unique filename
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $fileName = 'receipt_' . $userId . '_' . time() . '_' . uniqid() . '.' . $ext;

            // Create upload directory - store in receipts/Requested/
            $uploadDir = __DIR__ . '/../../uploads/receipts/Requested';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filePath = $uploadDir . '/' . $fileName;
            $relativePath = 'uploads/receipts/Requested/' . $fileName;

            if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                errorResponse('Failed to save file');
            }

            // Get or create Requested folder for this user
            $requestedFolder = $db->fetch(
                "SELECT id FROM receipt_folders WHERE user_id = :user_id AND name = 'Requested'",
                ['user_id' => $userId]
            );

            if (!$requestedFolder) {
                // Create Requested folder
                $requestedFolderId = $db->insert('receipt_folders', [
                    'user_id' => $userId,
                    'name' => 'Requested',
                    'folder_type' => 'custom',
                    'icon' => '📋'
                ]);
            } else {
                $requestedFolderId = $requestedFolder['id'];
            }

            // Save to database
            $receiptData = [
                'user_id' => $userId,
                'transaction_id' => $transactionId,
                'file_name' => $fileName,
                'original_name' => $file['name'],
                'file_path' => $relativePath,
                'file_type' => $file['type'],
                'file_size' => $file['size'],
                'folder_id' => $requestedFolderId,
                'description' => $_POST['description'] ?? null,
                'receipt_date' => $_POST['receipt_date'] ?? null,
                'vendor_name' => $_POST['vendor_name'] ?? null,
                'amount' => isset($_POST['amount']) ? (float)$_POST['amount'] : null,
                'reimbursement_status' => $_POST['reimbursement_status'] ?? 'none'
            ];

            $receiptId = $db->insert('receipts', $receiptData);

            $receipt = $db->fetch("SELECT * FROM receipts WHERE id = :id", ['id' => $receiptId]);

            successResponse(['receipt' => $receipt], 'Receipt uploaded successfully');

        } else {
            // JSON request - attach/detach receipt to transaction
            $input = json_decode(file_get_contents('php://input'), true);

            if (isset($input['action'])) {
                switch ($input['action']) {
                    case 'attach':
                        // Attach receipt to transaction
                        $receiptId = (int)($input['receipt_id'] ?? 0);
                        $transactionId = (int)($input['transaction_id'] ?? 0);

                        if (!$receiptId || !$transactionId) {
                            errorResponse('Receipt ID and Transaction ID are required');
                        }

                        $db->query(
                            "UPDATE receipts SET transaction_id = :transaction_id WHERE id = :id",
                            ['transaction_id' => $transactionId, 'id' => $receiptId]
                        );

                        successResponse(null, 'Receipt attached to transaction');
                        break;

                    case 'detach':
                        // Detach receipt from transaction
                        $receiptId = (int)($input['receipt_id'] ?? 0);

                        if (!$receiptId) {
                            errorResponse('Receipt ID is required');
                        }

                        $db->query(
                            "UPDATE receipts SET transaction_id = NULL WHERE id = :id",
                            ['id' => $receiptId]
                        );

                        successResponse(null, 'Receipt detached from transaction');
                        break;

                    case 'update':
                        // Update receipt details
                        $receiptId = (int)($input['receipt_id'] ?? 0);

                        if (!$receiptId) {
                            errorResponse('Receipt ID is required');
                        }

                        $updateData = [];
                        if (isset($input['description'])) $updateData['description'] = $input['description'];
                        if (isset($input['receipt_date'])) $updateData['receipt_date'] = $input['receipt_date'];
                        if (isset($input['vendor_name'])) $updateData['vendor_name'] = $input['vendor_name'];
                        if (isset($input['amount'])) $updateData['amount'] = (float)$input['amount'];
                        if (isset($input['reimbursement_status'])) $updateData['reimbursement_status'] = $input['reimbursement_status'];

                        if (!empty($updateData)) {
                            $db->update('receipts', $updateData, 'id = :id', ['id' => $receiptId]);
                        }

                        successResponse(null, 'Receipt updated');
                        break;

                    case 'bulk_update_status':
                        // Update reimbursement status for multiple cash receipts
                        $receiptIds = $input['receipt_ids'] ?? [];
                        $newStatus = $input['reimbursement_status'] ?? 'none';

                        if (empty($receiptIds) || !is_array($receiptIds)) {
                            errorResponse('Receipt IDs array is required');
                        }

                        // Sanitize IDs
                        $receiptIds = array_map('intval', $receiptIds);
                        $placeholders = implode(',', $receiptIds);

                        $db->query(
                            "UPDATE receipts SET reimbursement_status = :status WHERE id IN ($placeholders)",
                            ['status' => $newStatus]
                        );

                        successResponse(['updated_count' => count($receiptIds)], count($receiptIds) . " receipt(s) updated");
                        break;

                    case 'bulk_delete':
                        // Delete multiple receipts at once
                        $receiptIds = $input['receipt_ids'] ?? [];
                        $userId = (int)($input['user_id'] ?? 0);

                        if (empty($receiptIds) || !is_array($receiptIds)) {
                            errorResponse('Receipt IDs array is required');
                        }

                        if (!$userId) {
                            errorResponse('User ID is required');
                        }

                        // Sanitize IDs
                        $receiptIds = array_map('intval', $receiptIds);
                        $placeholders = implode(',', $receiptIds);

                        // Get receipts to delete (verify ownership)
                        $receipts = $db->fetchAll(
                            "SELECT id, file_path FROM receipts WHERE id IN ($placeholders) AND user_id = :user_id",
                            ['user_id' => $userId]
                        );

                        $deletedCount = 0;
                        foreach ($receipts as $receipt) {
                            // Delete file
                            $filePath = __DIR__ . '/../../' . $receipt['file_path'];
                            if (file_exists($filePath)) {
                                unlink($filePath);
                            }
                            // Delete from database
                            $db->query("DELETE FROM receipts WHERE id = :id", ['id' => $receipt['id']]);
                            $deletedCount++;
                        }

                        successResponse(['deleted_count' => $deletedCount], "$deletedCount receipt(s) deleted");
                        break;

                    case 'move_to_folder':
                        // Move receipts to a folder
                        $receiptIds = $input['receipt_ids'] ?? [];
                        $folderId = isset($input['folder_id']) ? ($input['folder_id'] === null ? null : (int)$input['folder_id']) : null;
                        $userId = (int)($input['user_id'] ?? 0);

                        if (empty($receiptIds) || !is_array($receiptIds)) {
                            errorResponse('Receipt IDs array is required');
                        }

                        if (!$userId) {
                            errorResponse('User ID is required');
                        }

                        // Verify folder belongs to user (if not null)
                        if ($folderId !== null) {
                            $folder = $db->fetch(
                                "SELECT id FROM receipt_folders WHERE id = :id AND user_id = :user_id",
                                ['id' => $folderId, 'user_id' => $userId]
                            );
                            if (!$folder) {
                                errorResponse('Folder not found or access denied', 404);
                            }
                        }

                        // Sanitize IDs
                        $receiptIds = array_map('intval', $receiptIds);
                        $placeholders = implode(',', $receiptIds);

                        // Update receipts
                        $db->query(
                            "UPDATE receipts SET folder_id = :folder_id WHERE id IN ($placeholders) AND user_id = :user_id",
                            ['folder_id' => $folderId, 'user_id' => $userId]
                        );

                        $movedCount = count($receiptIds);
                        successResponse(['moved_count' => $movedCount], "$movedCount receipt(s) moved");
                        break;

                    default:
                        errorResponse('Invalid action');
                }
            } else {
                errorResponse('Action or file upload required');
            }
        }

    } catch (Exception $e) {
        appLog('Receipt upload error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}

function handleDelete() {
    try {
        $db = Database::getInstance();

        $receiptId = (int)($_GET['id'] ?? 0);

        if (!$receiptId) {
            errorResponse('Receipt ID is required');
        }

        // Get receipt info
        $receipt = $db->fetch("SELECT * FROM receipts WHERE id = :id", ['id' => $receiptId]);

        if (!$receipt) {
            errorResponse('Receipt not found', 404);
        }

        // Delete file
        $filePath = __DIR__ . '/../../' . $receipt['file_path'];
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        // Delete from database
        $db->query("DELETE FROM receipts WHERE id = :id", ['id' => $receiptId]);

        successResponse(null, 'Receipt deleted');

    } catch (Exception $e) {
        appLog('Receipt delete error: ' . $e->getMessage(), 'error');
        errorResponse($e->getMessage(), 500);
    }
}
