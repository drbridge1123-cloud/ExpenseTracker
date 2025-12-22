<?php
/**
 * Application Configuration
 * Personal Finance Management System
 */

// Prevent direct access
if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}

// Load environment variables
require_once __DIR__ . '/env.php';
$envFile = APP_ROOT . '/.env';
if (file_exists($envFile)) {
    loadEnv($envFile);
}

// Environment
define('APP_ENV', env('APP_ENV', 'development'));
define('APP_DEBUG', env('APP_DEBUG', APP_ENV === 'development'));

// Database Configuration
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_PORT', env('DB_PORT', 3306));
define('DB_NAME', env('DB_NAME', 'expense_tracker'));
define('DB_USER', env('DB_USER', 'root'));
define('DB_PASS', env('DB_PASS', ''));
define('DB_CHARSET', 'utf8mb4');

// Application Settings
define('APP_NAME', env('APP_NAME', 'Expense Tracker'));
define('APP_VERSION', '1.0.0');
define('APP_URL', env('APP_URL', 'http://localhost/expensetracker'));
define('APP_PATH', env('APP_PATH', 'expensetracker'));

// Session Configuration
define('SESSION_NAME', 'expense_tracker_session');
define('SESSION_LIFETIME', env('SESSION_LIFETIME', 86400 * 7));

// File Upload Settings
define('UPLOAD_DIR', APP_ROOT . '/storage');
define('MAX_UPLOAD_SIZE', 10 * 1024 * 1024); // 10MB
define('ALLOWED_EXTENSIONS', ['csv', 'CSV']);

// Timezone
define('APP_TIMEZONE', env('APP_TIMEZONE', 'America/New_York'));
date_default_timezone_set(APP_TIMEZONE);

// API Settings
define('API_RATE_LIMIT', 100); // requests per minute
define('API_KEY_REQUIRED', false);

// Security
define('CSRF_TOKEN_NAME', 'csrf_token');
define('PASSWORD_COST', 12);

// Error Reporting based on environment
if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Default Currency
define('DEFAULT_CURRENCY', 'USD');

// Categorization Settings
define('AI_CATEGORIZATION_ENABLED', env('AI_CATEGORIZATION_ENABLED', false));
define('AI_API_KEY', env('AI_API_KEY', ''));
define('CATEGORIZATION_CONFIDENCE_THRESHOLD', 0.7);

// Logging
define('LOG_DIR', APP_ROOT . '/logs');
define('LOG_LEVEL', APP_DEBUG ? 'debug' : 'error');

// Create required directories if they don't exist
$requiredDirs = [UPLOAD_DIR, LOG_DIR];
foreach ($requiredDirs as $dir) {
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

/**
 * Autoloader for core classes
 */
spl_autoload_register(function ($class) {
    $paths = [
        APP_ROOT . '/core/',
        APP_ROOT . '/api/',
    ];

    foreach ($paths as $path) {
        $file = $path . $class . '.php';
        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});

/**
 * Global helper functions
 */

/**
 * Sanitize input for database storage
 * Note: Do NOT use htmlspecialchars here - that's for output only
 * PDO prepared statements handle SQL injection prevention
 */
function sanitize($input) {
    if (is_array($input)) {
        return array_map('sanitize', $input);
    }
    // Just trim whitespace - SQL injection is prevented by prepared statements
    return trim($input);
}

/**
 * JSON response helper
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Error response helper
 */
function errorResponse($message, $statusCode = 400, $errors = []) {
    jsonResponse([
        'success' => false,
        'message' => $message,
        'errors' => $errors
    ], $statusCode);
}

/**
 * Success response helper
 */
function successResponse($data = [], $message = 'Success') {
    jsonResponse([
        'success' => true,
        'message' => $message,
        'data' => $data
    ]);
}

/**
 * Log helper
 */
function appLog($message, $level = 'info', $context = []) {
    $logFile = LOG_DIR . '/' . date('Y-m-d') . '.log';
    $timestamp = date('Y-m-d H:i:s');
    $contextStr = !empty($context) ? ' | ' . json_encode($context) : '';
    $logEntry = "[{$timestamp}] [{$level}] {$message}{$contextStr}" . PHP_EOL;
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

/**
 * Generate unique hash for import deduplication
 */
function generateImportHash($accountId, $date, $description, $amount) {
    $data = implode('|', [$accountId, $date, $description, $amount]);
    return hash('sha256', $data);
}

/**
 * Format currency
 */
function formatCurrency($amount, $currency = DEFAULT_CURRENCY) {
    $formatter = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
    return $formatter->formatCurrency($amount, $currency);
}

/**
 * Get client IP address
 */
function getClientIp() {
    $ipKeys = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
    foreach ($ipKeys as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = explode(',', $_SERVER[$key])[0];
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
}

/**
 * CORS headers for API
 */
function setCorsHeaders() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}
