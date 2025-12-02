<?php
/**
 * Expense Tracker - Installation Script
 * Run this once to set up the database and initial configuration
 */

// Prevent direct access after installation
$lockFile = __DIR__ . '/.installed';

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expense Tracker - Installation</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 40px;
            line-height: 1.6;
        }
        .container {
            max-width: 700px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 { color: #1f2937; margin-bottom: 10px; }
        .subtitle { color: #6b7280; margin-bottom: 30px; }
        .step {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .step h3 {
            color: #374151;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .step-number {
            width: 28px;
            height: 28px;
            background: #3b82f6;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
        }
        .status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
        }
        .status.success { background: #dcfce7; color: #166534; }
        .status.error { background: #fee2e2; color: #991b1b; }
        .status.pending { background: #fef3c7; color: #92400e; }
        .message {
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .message.success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .message.error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .message.warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        pre {
            background: #1f2937;
            color: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 13px;
            margin: 15px 0;
        }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
        }
        .btn:hover { background: #2563eb; }
        .btn.success { background: #22c55e; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
        .form-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
        }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
        code {
            background: #e5e7eb;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Expense Tracker Installation</h1>
        <p class="subtitle">Personal Finance Management System</p>

        <?php

        $errors = [];
        $success = [];

        // Check if already installed
        if (file_exists($lockFile)) {
            echo '<div class="message warning">
                <strong>Already Installed!</strong><br>
                The application has already been installed. If you need to reinstall, delete the <code>.installed</code> file.
                <br><br>
                <a href="public/" class="btn success">Go to Application</a>
            </div>';
            echo '</div></body></html>';
            exit;
        }

        // Step 1: Check PHP Version
        echo '<div class="step">';
        echo '<h3><span class="step-number">1</span> PHP Version Check</h3>';

        if (version_compare(PHP_VERSION, '8.0.0', '>=')) {
            echo '<span class="status success">PHP ' . PHP_VERSION . ' - OK</span>';
            $success[] = 'PHP version check passed';
        } else {
            echo '<span class="status error">PHP ' . PHP_VERSION . ' - Requires PHP 8.0+</span>';
            $errors[] = 'PHP version must be 8.0 or higher';
        }
        echo '</div>';

        // Step 2: Check Required Extensions
        echo '<div class="step">';
        echo '<h3><span class="step-number">2</span> Required PHP Extensions</h3>';

        $requiredExtensions = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'curl'];
        echo '<ul>';
        foreach ($requiredExtensions as $ext) {
            $loaded = extension_loaded($ext);
            $status = $loaded ? 'success' : 'error';
            echo "<li><code>$ext</code> - <span class='status $status'>" . ($loaded ? 'Installed' : 'Missing') . "</span></li>";
            if (!$loaded) {
                $errors[] = "Extension $ext is not installed";
            }
        }
        echo '</ul>';
        echo '</div>';

        // Step 3: Check Directory Permissions
        echo '<div class="step">';
        echo '<h3><span class="step-number">3</span> Directory Permissions</h3>';

        $directories = [
            __DIR__ . '/uploads' => 'uploads',
            __DIR__ . '/logs' => 'logs'
        ];

        echo '<ul>';
        foreach ($directories as $path => $name) {
            if (!is_dir($path)) {
                mkdir($path, 0755, true);
            }
            $writable = is_writable($path);
            $status = $writable ? 'success' : 'error';
            echo "<li><code>$name/</code> - <span class='status $status'>" . ($writable ? 'Writable' : 'Not Writable') . "</span></li>";
            if (!$writable) {
                $errors[] = "Directory $name is not writable";
            }
        }
        echo '</ul>';
        echo '</div>';

        // Step 4: Database Installation
        echo '<div class="step">';
        echo '<h3><span class="step-number">4</span> Database Setup</h3>';

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['install_db'])) {
            $dbHost = $_POST['db_host'] ?? 'localhost';
            $dbUser = $_POST['db_user'] ?? 'root';
            $dbPass = $_POST['db_pass'] ?? '';
            $dbName = $_POST['db_name'] ?? 'expense_tracker';

            try {
                // Connect without database first
                $pdo = new PDO(
                    "mysql:host=$dbHost",
                    $dbUser,
                    $dbPass,
                    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
                );

                // Create database if not exists
                $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                $pdo->exec("USE `$dbName`");

                // Read schema file
                $schemaFile = __DIR__ . '/database/schema.sql';
                if (!file_exists($schemaFile)) {
                    throw new Exception('Schema file not found: database/schema.sql');
                }

                $schema = file_get_contents($schemaFile);

                // Remove comments and normalize
                $schema = preg_replace('/--.*$/m', '', $schema);
                $schema = preg_replace('/\/\*.*?\*\//s', '', $schema);

                // Split by semicolon but handle multi-line statements
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
                $pdo->exec("SET NAMES utf8mb4");

                // Use multi-query approach - execute the entire schema
                // Split carefully by finding statement boundaries
                $statements = [];
                $currentStatement = '';
                $lines = explode("\n", $schema);

                foreach ($lines as $line) {
                    $line = trim($line);
                    if (empty($line) || strpos($line, '--') === 0) {
                        continue;
                    }
                    $currentStatement .= ' ' . $line;

                    // Check if statement is complete (ends with semicolon, not inside quotes)
                    if (substr(rtrim($line), -1) === ';') {
                        $stmt = trim($currentStatement);
                        if (!empty($stmt) && $stmt !== ';') {
                            // Skip CREATE DATABASE and USE statements (we already did that)
                            if (!preg_match('/^(CREATE\s+DATABASE|USE\s+)/i', $stmt)) {
                                $statements[] = $stmt;
                            }
                        }
                        $currentStatement = '';
                    }
                }

                // Execute each statement
                foreach ($statements as $statement) {
                    $statement = trim($statement);
                    if (!empty($statement) && $statement !== ';') {
                        try {
                            $pdo->exec($statement);
                        } catch (PDOException $e) {
                            // Log but continue (some errors like "table already exists" are ok)
                            if (strpos($e->getMessage(), 'already exists') === false) {
                                error_log("SQL Error: " . $e->getMessage() . " in statement: " . substr($statement, 0, 100));
                            }
                        }
                    }
                }

                $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

                // Check if users exist
                $stmt = $pdo->query("SELECT COUNT(*) FROM users");
                if ($stmt->fetchColumn() == 0) {
                    // Create default users
                    $passwordHash = password_hash('password123', PASSWORD_DEFAULT);
                    $pdo->exec("INSERT INTO users (username, email, password_hash, display_name) VALUES
                        ('daniel', 'daniel@example.com', '$passwordHash', 'Daniel'),
                        ('wife', 'wife@example.com', '$passwordHash', 'Wife')");
                }

                // Update config file
                $configContent = file_get_contents(__DIR__ . '/config/config.php');
                $configContent = preg_replace("/define\('DB_HOST', '.*?'\)/", "define('DB_HOST', '$dbHost')", $configContent);
                $configContent = preg_replace("/define\('DB_NAME', '.*?'\)/", "define('DB_NAME', '$dbName')", $configContent);
                $configContent = preg_replace("/define\('DB_USER', '.*?'\)/", "define('DB_USER', '$dbUser')", $configContent);
                $configContent = preg_replace("/define\('DB_PASS', '.*?'\)/", "define('DB_PASS', '$dbPass')", $configContent);
                file_put_contents(__DIR__ . '/config/config.php', $configContent);

                // Create lock file
                file_put_contents($lockFile, date('Y-m-d H:i:s'));

                echo '<div class="message success">
                    <strong>Database installed successfully!</strong><br>
                    All tables and default data have been created.
                </div>';

                echo '<div class="message success">
                    <strong>Installation Complete!</strong><br>
                    Default users created:<br>
                    <ul>
                        <li>Username: <code>daniel</code></li>
                        <li>Username: <code>wife</code></li>
                    </ul>
                    <br>
                    <a href="public/" class="btn success">Go to Application</a>
                </div>';

            } catch (Exception $e) {
                echo '<div class="message error">
                    <strong>Database Error:</strong> ' . htmlspecialchars($e->getMessage()) . '
                </div>';
            }
        } else {
            // Show database form
            if (empty($errors)) {
                echo '<p>Enter your database connection details:</p>';
                echo '<form method="POST">
                    <div class="form-group">
                        <label>Database Host</label>
                        <input type="text" name="db_host" value="localhost">
                    </div>
                    <div class="form-group">
                        <label>Database Name</label>
                        <input type="text" name="db_name" value="expense_tracker">
                    </div>
                    <div class="form-group">
                        <label>Database User</label>
                        <input type="text" name="db_user" value="root">
                    </div>
                    <div class="form-group">
                        <label>Database Password</label>
                        <input type="password" name="db_pass" value="">
                    </div>
                    <button type="submit" name="install_db" class="btn">Install Database</button>
                </form>';
            } else {
                echo '<div class="message error">
                    <strong>Cannot proceed with installation.</strong> Please fix the errors above first.
                </div>';
            }
        }
        echo '</div>';

        // Show errors summary
        if (!empty($errors)) {
            echo '<div class="message error">';
            echo '<strong>Installation Errors:</strong>';
            echo '<ul>';
            foreach ($errors as $error) {
                echo "<li>$error</li>";
            }
            echo '</ul>';
            echo '</div>';
        }

        ?>

        <div class="step">
            <h3><span class="step-number">5</span> Manual Steps (if needed)</h3>
            <p>If automatic installation fails, you can manually set up the database:</p>
            <ol>
                <li>Open phpMyAdmin at <a href="http://localhost/phpmyadmin" target="_blank">http://localhost/phpmyadmin</a></li>
                <li>Create a new database called <code>expense_tracker</code></li>
                <li>Import the SQL file: <code>database/schema.sql</code></li>
                <li>Update database credentials in <code>config/config.php</code></li>
            </ol>
        </div>
    </div>
</body>
</html>
