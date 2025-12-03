<?php
/**
 * Import Categorization Rules API
 * POST /api/v1/import/rules.php
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
    if (!isset($headerMap['match value'])) {
        errorResponse('Missing required column: Match Value');
    }
    if (!isset($headerMap['category']) && !isset($headerMap['category name'])) {
        errorResponse('Missing required column: Category');
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
            $matchValue = trim($row[$headerMap['match value']] ?? '');
            $categoryName = trim($row[$headerMap['category'] ?? $headerMap['category name']] ?? '');

            if (empty($matchValue)) {
                $errors[] = "Row $rowNum: Match value is required";
                $skipped++;
                continue;
            }

            if (empty($categoryName)) {
                $errors[] = "Row $rowNum: Category is required";
                $skipped++;
                continue;
            }

            // Find category
            $categoryId = $categoryMap[strtolower($categoryName)] ?? null;
            if (!$categoryId) {
                $errors[] = "Row $rowNum: Category '$categoryName' not found";
                $skipped++;
                continue;
            }

            // Get optional fields
            $ruleName = isset($headerMap['rule name']) ? trim($row[$headerMap['rule name']] ?? '') : null;
            $matchField = strtolower(trim($row[$headerMap['match field'] ?? 0] ?? 'description'));
            $matchType = strtolower(trim($row[$headerMap['match type'] ?? 0] ?? 'contains'));
            $priority = isset($headerMap['priority']) ? (int)($row[$headerMap['priority']] ?? 100) : 100;

            // Validate match field
            $validFields = ['description', 'vendor', 'memo', 'amount', 'any'];
            if (!in_array($matchField, $validFields)) {
                $matchField = 'description';
            }

            // Validate match type
            $validTypes = ['contains', 'starts_with', 'ends_with', 'exact', 'regex'];
            if (!in_array($matchType, $validTypes)) {
                $matchType = 'contains';
            }

            // Check for duplicate
            $existing = $db->fetch(
                "SELECT id FROM categorization_rules
                 WHERE user_id = :user_id AND category_id = :category_id
                 AND match_field = :match_field AND match_type = :match_type AND match_value = :match_value",
                [
                    'user_id' => $userId,
                    'category_id' => $categoryId,
                    'match_field' => $matchField,
                    'match_type' => $matchType,
                    'match_value' => $matchValue
                ]
            );

            if ($existing) {
                $skipped++;
                continue;
            }

            // Insert
            $db->insert('categorization_rules', [
                'user_id' => $userId,
                'category_id' => $categoryId,
                'rule_name' => $ruleName ?: null,
                'match_field' => $matchField,
                'match_type' => $matchType,
                'match_value' => $matchValue,
                'match_case_sensitive' => 0,
                'priority' => $priority,
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
    ], "$imported rules imported, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import rules error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
