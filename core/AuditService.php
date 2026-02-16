<?php
/**
 * AuditService - Change Tracking and Audit Logging
 *
 * Records all changes to financial data for compliance and debugging.
 * Audit logs are INSERT-only and should never be modified.
 *
 * @package ExpenseTracker
 */

class AuditService
{
    private Database $db;
    private ?int $userId;
    private ?string $sessionId;
    private ?string $requestId;

    public function __construct(?int $userId = null)
    {
        $this->db = Database::getInstance();
        $this->userId = $userId;
        $this->sessionId = session_id() ?: null;
        $this->requestId = $this->generateRequestId();
    }

    /**
     * Log a create action
     *
     * @param string $entityType Table/entity name
     * @param int $entityId ID of created entity
     * @param array $data Data that was created
     * @param string|null $reason Optional reason for the action
     */
    public function logCreate(string $entityType, int $entityId, array $data, ?string $reason = null): void
    {
        $this->log('create', $entityType, $entityId, null, $data, $reason);
    }

    /**
     * Log an update action
     *
     * @param string $entityType Table/entity name
     * @param int $entityId ID of updated entity
     * @param array $oldValues Previous values
     * @param array $newValues New values
     * @param string|null $reason Optional reason for the change
     */
    public function logUpdate(
        string $entityType,
        int $entityId,
        array $oldValues,
        array $newValues,
        ?string $reason = null
    ): void {
        // Only log fields that actually changed
        $changes = $this->diffValues($oldValues, $newValues);

        if (!empty($changes['old']) || !empty($changes['new'])) {
            $this->log('update', $entityType, $entityId, $changes['old'], $changes['new'], $reason);
        }
    }

    /**
     * Log a delete action (soft delete preferred)
     *
     * @param string $entityType Table/entity name
     * @param int $entityId ID of deleted entity
     * @param array $data Data that was deleted
     * @param string|null $reason Required reason for deletion
     */
    public function logDelete(string $entityType, int $entityId, array $data, ?string $reason = null): void
    {
        $this->log('delete', $entityType, $entityId, $data, null, $reason);
    }

    /**
     * Log a void action (for financial records)
     *
     * @param string $entityType Table/entity name
     * @param int $entityId ID of voided entity
     * @param array $data Data that was voided
     * @param string $reason Required reason for voiding
     */
    public function logVoid(string $entityType, int $entityId, array $data, string $reason): void
    {
        $this->log('void', $entityType, $entityId, $data, ['status' => 'void'], $reason);
    }

    /**
     * Log a view/access action (for sensitive data)
     *
     * @param string $entityType Table/entity name
     * @param int $entityId ID of accessed entity
     */
    public function logAccess(string $entityType, int $entityId): void
    {
        $this->log('access', $entityType, $entityId, null, null, null);
    }

    /**
     * Log an export action
     *
     * @param string $entityType Type of data exported
     * @param int $recordCount Number of records exported
     * @param string $format Export format (csv, json, etc.)
     */
    public function logExport(string $entityType, int $recordCount, string $format): void
    {
        $this->log('export', $entityType, null, null, [
            'record_count' => $recordCount,
            'format' => $format
        ], null);
    }

    /**
     * Log an import action
     *
     * @param string $entityType Type of data imported
     * @param int $recordCount Number of records imported
     * @param string $source Source file or method
     */
    public function logImport(string $entityType, int $recordCount, string $source): void
    {
        $this->log('import', $entityType, null, null, [
            'record_count' => $recordCount,
            'source' => $source
        ], null);
    }

    /**
     * Log a reconciliation action
     *
     * @param int $accountId Account being reconciled
     * @param string $statementDate Statement date
     * @param float $statementBalance Statement balance
     * @param float $reconciledBalance Reconciled balance
     */
    public function logReconciliation(
        int $accountId,
        string $statementDate,
        float $statementBalance,
        float $reconciledBalance
    ): void {
        $this->log('reconcile', 'account', $accountId, null, [
            'statement_date' => $statementDate,
            'statement_balance' => $statementBalance,
            'reconciled_balance' => $reconciledBalance,
            'difference' => $statementBalance - $reconciledBalance
        ], null);
    }

    /**
     * Get audit history for an entity
     *
     * @param string $entityType
     * @param int $entityId
     * @param int $limit
     * @return array
     */
    public function getHistory(string $entityType, int $entityId, int $limit = 50): array
    {
        return $this->db->fetchAll(
            "SELECT al.*, u.username, u.display_name
             FROM audit_log al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.entity_type = :entity_type AND al.entity_id = :entity_id
             ORDER BY al.created_at DESC
             LIMIT :limit",
            [
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'limit' => $limit
            ]
        );
    }

    /**
     * Get all audit entries for a user
     *
     * @param int $userId
     * @param string|null $startDate
     * @param string|null $endDate
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function getUserAuditLog(
        int $userId,
        ?string $startDate = null,
        ?string $endDate = null,
        int $limit = 100,
        int $offset = 0
    ): array {
        $sql = "SELECT * FROM audit_log WHERE user_id = :user_id";
        $params = ['user_id' => $userId];

        if ($startDate) {
            $sql .= " AND created_at >= :start_date";
            $params['start_date'] = $startDate;
        }

        if ($endDate) {
            $sql .= " AND created_at <= :end_date";
            $params['end_date'] = $endDate . ' 23:59:59';
        }

        $sql .= " ORDER BY created_at DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset;

        return $this->db->fetchAll($sql, $params);
    }

    /**
     * Get audit summary for compliance reporting
     *
     * @param string $startDate
     * @param string $endDate
     * @return array
     */
    public function getAuditSummary(string $startDate, string $endDate): array
    {
        $sql = "SELECT
                    action,
                    entity_type,
                    COUNT(*) as count,
                    COUNT(DISTINCT user_id) as unique_users
                FROM audit_log
                WHERE created_at BETWEEN :start_date AND :end_date";

        $params = [
            'start_date' => $startDate,
            'end_date' => $endDate . ' 23:59:59'
        ];

        if ($this->userId) {
            $sql .= " AND user_id = :user_id";
            $params['user_id'] = $this->userId;
        }

        $sql .= " GROUP BY action, entity_type ORDER BY count DESC";

        return $this->db->fetchAll($sql, $params);
    }

    /**
     * Search audit log
     *
     * @param array $filters [action, entity_type, user_id, start_date, end_date]
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function search(array $filters, int $limit = 100, int $offset = 0): array
    {
        $sql = "SELECT al.*, u.username, u.display_name
                FROM audit_log al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1";
        $params = [];

        if (!empty($filters['action'])) {
            $sql .= " AND al.action = :action";
            $params['action'] = $filters['action'];
        }

        if (!empty($filters['entity_type'])) {
            $sql .= " AND al.entity_type = :entity_type";
            $params['entity_type'] = $filters['entity_type'];
        }

        if (!empty($filters['user_id'])) {
            $sql .= " AND al.user_id = :user_id";
            $params['user_id'] = $filters['user_id'];
        }

        if (!empty($filters['start_date'])) {
            $sql .= " AND al.created_at >= :start_date";
            $params['start_date'] = $filters['start_date'];
        }

        if (!empty($filters['end_date'])) {
            $sql .= " AND al.created_at <= :end_date";
            $params['end_date'] = $filters['end_date'] . ' 23:59:59';
        }

        $sql .= " ORDER BY al.created_at DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset;

        return $this->db->fetchAll($sql, $params);
    }

    /**
     * Core logging method
     */
    private function log(
        string $action,
        string $entityType,
        ?int $entityId,
        ?array $oldValues,
        ?array $newValues,
        ?string $reason
    ): void {
        try {
            // Sanitize sensitive data
            $oldValues = $oldValues ? $this->sanitizeData($oldValues) : null;
            $newValues = $newValues ? $this->sanitizeData($newValues) : null;

            $this->db->insert('audit_log', [
                'user_id' => $this->userId,
                'session_id' => $this->sessionId,
                'request_id' => $this->requestId,
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'old_values' => $oldValues ? json_encode($oldValues) : null,
                'new_values' => $newValues ? json_encode($newValues) : null,
                'change_reason' => $reason,
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
                'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500)
            ]);
        } catch (Exception $e) {
            // Log to error log but don't throw - audit should not break operations
            appLog('Audit log error: ' . $e->getMessage(), 'error');
        }
    }

    /**
     * Calculate difference between old and new values
     */
    private function diffValues(array $old, array $new): array
    {
        $changedOld = [];
        $changedNew = [];

        $allKeys = array_unique(array_merge(array_keys($old), array_keys($new)));

        foreach ($allKeys as $key) {
            $oldVal = $old[$key] ?? null;
            $newVal = $new[$key] ?? null;

            // Skip timestamp fields
            if (in_array($key, ['updated_at', 'created_at'])) {
                continue;
            }

            if ($oldVal !== $newVal) {
                $changedOld[$key] = $oldVal;
                $changedNew[$key] = $newVal;
            }
        }

        return ['old' => $changedOld, 'new' => $changedNew];
    }

    /**
     * Remove sensitive fields from audit data
     */
    private function sanitizeData(array $data): array
    {
        $sensitiveFields = [
            'password', 'password_hash', 'token', 'session_token',
            'api_key', 'secret', 'ssn', 'social_security'
        ];

        foreach ($sensitiveFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = '[REDACTED]';
            }
        }

        return $data;
    }

    /**
     * Generate a unique request ID
     */
    private function generateRequestId(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
