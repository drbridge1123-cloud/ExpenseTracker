<?php
/**
 * Database Connection Class
 * PDO-based database abstraction layer
 */

class Database {
    private static ?Database $instance = null;
    private PDO $pdo;

    /**
     * Private constructor for singleton pattern
     */
    private function __construct() {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_CHARSET
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];

        try {
            $this->pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            if (APP_DEBUG) {
                throw new Exception("Database connection failed: " . $e->getMessage());
            }
            throw new Exception("Database connection failed");
        }
    }

    /**
     * Get singleton instance
     */
    public static function getInstance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Get PDO connection
     */
    public function getConnection(): PDO {
        return $this->pdo;
    }

    /**
     * Execute a query with parameters
     */
    public function query(string $sql, array $params = []): PDOStatement {
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        } catch (PDOException $e) {
            appLog("Query error: " . $e->getMessage(), 'error', ['sql' => $sql]);
            throw $e;
        }
    }

    /**
     * Fetch all rows
     */
    public function fetchAll(string $sql, array $params = []): array {
        return $this->query($sql, $params)->fetchAll();
    }

    /**
     * Fetch single row
     */
    public function fetch(string $sql, array $params = []): ?array {
        $result = $this->query($sql, $params)->fetch();
        return $result ?: null;
    }

    /**
     * Fetch single column value
     */
    public function fetchColumn(string $sql, array $params = [], int $column = 0) {
        return $this->query($sql, $params)->fetchColumn($column);
    }

    /**
     * Insert and return last insert ID
     */
    public function insert(string $table, array $data): int {
        $columns = array_keys($data);
        $placeholders = array_map(fn($col) => ":$col", $columns);

        $sql = sprintf(
            "INSERT INTO `%s` (`%s`) VALUES (%s)",
            $table,
            implode('`, `', $columns),
            implode(', ', $placeholders)
        );

        $this->query($sql, $data);
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Update records
     */
    public function update(string $table, array $data, string $where, array $whereParams = []): int {
        $setParts = array_map(fn($col) => "`$col` = :$col", array_keys($data));

        $sql = sprintf(
            "UPDATE `%s` SET %s WHERE %s",
            $table,
            implode(', ', $setParts),
            $where
        );

        $stmt = $this->query($sql, array_merge($data, $whereParams));
        return $stmt->rowCount();
    }

    /**
     * Delete records
     */
    public function delete(string $table, string $where, array $params = []): int {
        $sql = sprintf("DELETE FROM `%s` WHERE %s", $table, $where);
        $stmt = $this->query($sql, $params);
        return $stmt->rowCount();
    }

    /**
     * Check if record exists
     */
    public function exists(string $table, string $where, array $params = []): bool {
        $sql = sprintf("SELECT 1 FROM `%s` WHERE %s LIMIT 1", $table, $where);
        return (bool) $this->fetchColumn($sql, $params);
    }

    /**
     * Count records
     */
    public function count(string $table, string $where = '1=1', array $params = []): int {
        $sql = sprintf("SELECT COUNT(*) FROM `%s` WHERE %s", $table, $where);
        return (int) $this->fetchColumn($sql, $params);
    }

    /**
     * Begin transaction
     */
    public function beginTransaction(): bool {
        return $this->pdo->beginTransaction();
    }

    /**
     * Commit transaction
     */
    public function commit(): bool {
        return $this->pdo->commit();
    }

    /**
     * Rollback transaction
     */
    public function rollback(): bool {
        return $this->pdo->rollBack();
    }

    /**
     * Check if in transaction
     */
    public function inTransaction(): bool {
        return $this->pdo->inTransaction();
    }

    /**
     * Execute within transaction
     */
    public function transaction(callable $callback) {
        $this->beginTransaction();
        try {
            $result = $callback($this);
            $this->commit();
            return $result;
        } catch (Exception $e) {
            $this->rollback();
            throw $e;
        }
    }

    /**
     * Prevent cloning
     */
    private function __clone() {}

    /**
     * Prevent unserialization
     */
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
}

/**
 * Helper function to get database instance
 */
function db(): Database {
    return Database::getInstance();
}
