<?php
/**
 * Import Categories API
 * POST /api/v1/import/categories.php
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

// Validate file
if ($file['error'] !== UPLOAD_ERR_OK) {
    errorResponse('File upload error');
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'csv') {
    errorResponse('Only CSV files are allowed');
}

try {
    $db = Database::getInstance();

    // Parse CSV
    $handle = fopen($file['tmp_name'], 'r');
    if (!$handle) {
        errorResponse('Failed to open CSV file');
    }

    // Skip BOM if present
    $bom = fread($handle, 3);
    if ($bom !== "\xEF\xBB\xBF") {
        rewind($handle);
    }

    // Read header
    $header = fgetcsv($handle);
    if (!$header) {
        errorResponse('CSV file is empty');
    }

    // Map headers (case-insensitive)
    $headerMap = array_flip(array_map('strtolower', array_map('trim', $header)));

    // Required columns
    $requiredCols = ['name', 'type'];
    foreach ($requiredCols as $col) {
        if (!isset($headerMap[$col])) {
            errorResponse("Missing required column: $col");
        }
    }

    $db->beginTransaction();

    $imported = 0;
    $skipped = 0;
    $errors = [];
    $rowNum = 1;

    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;

        try {
            $name = trim($row[$headerMap['name']] ?? '');
            $type = strtolower(trim($row[$headerMap['type'] ?? $headerMap['category type'] ?? 0] ?? ''));

            if (empty($name)) {
                $errors[] = "Row $rowNum: Name is required";
                $skipped++;
                continue;
            }

            // Validate type
            $validTypes = ['income', 'expense', 'transfer', 'other'];
            if (!in_array($type, $validTypes)) {
                $type = 'expense';
            }

            // Generate slug
            $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $name));
            $slug = trim($slug, '-');

            // Check for duplicate
            $existing = $db->fetch(
                "SELECT id FROM categories WHERE (slug = :slug OR name = :name) AND user_id = :user_id",
                ['slug' => $slug, 'name' => $name, 'user_id' => $userId]
            );

            if ($existing) {
                $skipped++;
                continue;
            }

            // Get optional fields
            $icon = isset($headerMap['icon']) ? trim($row[$headerMap['icon']] ?? '') : null;
            $color = isset($headerMap['color']) ? trim($row[$headerMap['color']] ?? '') : null;
            $sortOrder = isset($headerMap['sort order']) ? (int)($row[$headerMap['sort order']] ?? 0) : 0;

            // Get max sort order if not provided
            if (!$sortOrder) {
                $maxSort = $db->fetchColumn(
                    "SELECT MAX(sort_order) FROM categories WHERE user_id = :user_id AND category_type = :type",
                    ['user_id' => $userId, 'type' => $type]
                );
                $sortOrder = ($maxSort ?? 0) + 1;
            }

            // Insert
            $db->insert('categories', [
                'user_id' => $userId,
                'name' => $name,
                'slug' => $slug,
                'icon' => $icon ?: null,
                'color' => $color ?: null,
                'category_type' => $type,
                'is_system' => 0,
                'is_active' => 1,
                'sort_order' => $sortOrder
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
    ], "$imported categories imported, $skipped skipped");

} catch (Exception $e) {
    if (isset($db)) {
        $db->rollback();
    }
    appLog('Import categories error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}
