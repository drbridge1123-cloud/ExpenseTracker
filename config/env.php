<?php
/**
 * Environment Variable Loader
 * Pure PHP implementation without external dependencies
 */

/**
 * Load environment variables from .env file
 *
 * @param string $path Path to .env file
 * @return bool True if file loaded successfully
 */
function loadEnv(string $path): bool {
    if (!file_exists($path)) {
        return false;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Skip comments
        $line = trim($line);
        if (empty($line) || strpos($line, '#') === 0) {
            continue;
        }

        // Parse KEY=value format
        if (strpos($line, '=') === false) {
            continue;
        }

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);

        // Remove quotes if present
        if (preg_match('/^(["\'])(.*)\1$/', $value, $matches)) {
            $value = $matches[2];
        }

        // Handle escape sequences in double-quoted strings
        if (isset($matches[1]) && $matches[1] === '"') {
            $value = str_replace(['\\n', '\\r', '\\t'], ["\n", "\r", "\t"], $value);
        }

        // Set as environment variable and in $_ENV
        if (!array_key_exists($name, $_ENV)) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }

    return true;
}

/**
 * Get environment variable with default fallback
 *
 * @param string $key Environment variable name
 * @param mixed $default Default value if not set
 * @return mixed
 */
function env(string $key, $default = null) {
    $value = getenv($key);

    if ($value === false) {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? null;
    }

    if ($value === null) {
        return $default;
    }

    // Convert string booleans
    $lower = strtolower($value);
    if ($lower === 'true' || $lower === '(true)') return true;
    if ($lower === 'false' || $lower === '(false)') return false;
    if ($lower === 'null' || $lower === '(null)') return null;
    if ($lower === 'empty' || $lower === '(empty)') return '';

    // Convert numeric strings
    if (is_numeric($value)) {
        return strpos($value, '.') !== false ? (float)$value : (int)$value;
    }

    return $value;
}
