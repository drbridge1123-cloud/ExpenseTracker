<?php
/**
 * Settings API
 * GET: Get settings
 * POST: Update settings
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = Database::getInstance();

    switch ($method) {
        case 'GET':
            handleGet($db);
            break;
        case 'POST':
            handlePost($db);
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (Exception $e) {
    appLog('Settings API error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}

/**
 * GET - Get user settings
 */
function handleGet(Database $db): void {
    $userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    if (!$userId) {
        errorResponse('User ID is required');
    }

    // Get all settings for user
    $settings = $db->fetchAll(
        "SELECT setting_key, setting_value FROM user_settings WHERE user_id = :user_id",
        ['user_id' => $userId]
    );

    // Convert to key-value object
    $settingsObj = [];
    foreach ($settings as $setting) {
        $settingsObj[$setting['setting_key']] = json_decode($setting['setting_value'], true);
    }

    // Add defaults for missing settings
    $defaults = [
        'currency' => 'USD',
        'date_format' => 'MM/DD/YYYY',
        'timezone' => 'America/New_York',
        'ai_categorization' => false,
        'notifications' => [
            'email' => true,
            'budget_alerts' => true
        ],
        'dashboard' => [
            'show_chart' => true,
            'recent_transactions_count' => 10
        ],
        'theme' => 'light'
    ];

    foreach ($defaults as $key => $value) {
        if (!isset($settingsObj[$key])) {
            $settingsObj[$key] = $value;
        }
    }

    successResponse(['settings' => $settingsObj]);
}

/**
 * POST - Update settings
 */
function handlePost(Database $db): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['user_id'])) {
        errorResponse('User ID is required');
    }

    $userId = (int)$input['user_id'];

    // Remove user_id from settings
    unset($input['user_id']);

    if (empty($input)) {
        errorResponse('No settings to update');
    }

    // Update each setting
    foreach ($input as $key => $value) {
        $settingValue = json_encode($value);

        // Upsert
        $existing = $db->fetch(
            "SELECT id FROM user_settings WHERE user_id = :user_id AND setting_key = :key",
            ['user_id' => $userId, 'key' => $key]
        );

        if ($existing) {
            $db->update('user_settings',
                ['setting_value' => $settingValue],
                'id = :id',
                ['id' => $existing['id']]
            );
        } else {
            $db->insert('user_settings', [
                'user_id' => $userId,
                'setting_key' => $key,
                'setting_value' => $settingValue
            ]);
        }
    }

    successResponse(['updated' => array_keys($input)], 'Settings updated successfully');
}
