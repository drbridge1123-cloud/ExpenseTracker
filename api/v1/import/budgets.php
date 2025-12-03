<?php
/**
 * Import Budgets API
 * POST /api/v1/import/budgets.php
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

if (empty($_POST['user_id'])) {
    errorResponse('User ID is required');
}

if (empty($_FILES['csv_file'])) {
    errorResponse('CSV file is required');
}

$userId = (int)$_POST['user_id'];
$file = $_FILES['csv_file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'csv') {
    errorResponse('Only CSV files are allowed');
}

try {
    $db = Database::getInstance();

    $handle = fopen($file['tmp_name'], 'r');
    if (!$handle) {
        errorResponse('Failed to open CSV file');
    }

    // Skip BOM
    $bom = fread($handle, 3);
    if ($bom !== "\xEF\xBB\xBF") {
        rewind($handle);
    }

    $header = fgetcsv($handle);
    if (!$header) {
        errorResponse('CSV file is empty');
    }

    $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

    // Required columns
    if (!isset($headerMap['amount'])) {
        errorResponse('Missing required column: Amount');
    }

    // Load categories for lookup
    $categories = $db->fetchAll(
        "SELECT id, name, slug FROM categories WHERE user_id = :user_id AND is_active = 1",
        ['user_id' => $userId]
    );
    $categoryMap = [];
    foreach ($categories as $cat) {
        $categoryMap[strtolower($cat['name'])] = $cat['id'];
        $categoryMap[strtolower($cat['slug'])] = $cat['id'];
    }

    $db->beginTransaction();

    $imported = 0;
    $skipped = 0;
    $errors = [];
    $rowNum = 1;

    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            $amount = (float)($row[$headerMap['amount']] ?? 0);

            if ($amount <= 0) {
                $errors[] = "Row $rowNum: Amount must be positive";
                $skipped++;
                continue;
            }

            // Get optional fields
            $budgetName = isset($headerMap['budget name']) ? trim($row[$headerMap['budget name']] ?? '') : null;
            $budgetType = strtolower(trim($row[$headerMap['type'] ?? $headerMap['budget type'] ?? 0] ?? 'monthly'));
            $startDate = isset($headerMap['start date']) ? trim($row[$headerMap['start date']] ?? '') : date('Y-m-01');
            $endDate = isset($headerMap['end date']) ? trim($row[$headerMap['end date']] ?? '') : null;
            $rollover = isset($headerMap['rollover']) ? (int)($row[$headerMap['rollover']] ?? 0) : 0;
            $threshold = isset($headerMap['alert threshold (%)']) ? (float)($row[$headerMap['alert threshold (%)']] ?? 80) : 80;

            // Validate budget type
            $validTypes = ['monthly', 'weekly', 'yearly', 'custom'];
            if (!in_array($budgetType, $validTypes)) {
                $budgetType = 'monthly';
            }

            // Find category
            $categoryName = isset($headerMap['category']) ? strtolower(trim($row[$headerMap['category']] ?? '')) : '';
            $categoryId = $categoryMap[$categoryName] ?? null;

            // Generate budget name if not provided
            if (!$budgetName) {
                if ($categoryId && $categoryName) {
                    $budgetName = ucfirst($categoryName) . ' Budget';
                } else {
                    $budgetName = 'Budget ' . date('M Y');
                }
            }

            // Check for duplicate
            $existing = $db->fetch(
                "SELECT id FROM budgets
                 WHERE user_id = :user_id AND budget_name = :name AND category_id " . ($categoryId ? "= :category_id" : "IS NULL"),
                $categoryId
                    ? ['user_id' => $userId, 'name' => $budgetName, 'category_id' => $categoryId]
                    : ['user_id' => $userId, 'name' => $budgetName]
            );

            if ($existing) {
                $skipped++;
                continue;
            }

            // Insert
            $db->insert('budgets', [
                'user_id' => $userId,
                'category_id' => $categoryId,
                'budget_name' => $budgetName,
                'budget_type' => $budgetType,
                'amount' => $amount,
                'start_date' => $startDate ?: date('Y-m-01'),
                'end_date' => $endDate ?: null,
                'rollover' => $rollover,
                'alert_threshold' => $threshold,
                'is_active' => 1
            ]);

            $imported++;

        } catch (Exception $e) {
            $errors[] = "Row $rowNum: " . $e->getMessage();
            $skipped++;
        }
    }

    fclose($handle);
    $db->commit();

    successResponse([
        'imported' => $imported,
        'skipped' => $skipped,
        'errors' => $errors
    ], "$imported budgets imported, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import budgets error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
