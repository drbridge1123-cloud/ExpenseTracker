<?php
/**
 * LedgerService - Double-Entry Bookkeeping Service
 *
 * Handles all ledger operations following accounting principles:
 * - INSERT only - no updates or deletes
 * - Debit = Credit must always balance
 * - Corrections via reversal entries
 *
 * @package ExpenseTracker
 */

class LedgerService
{
    private Database $db;
    private ?int $userId;

    public function __construct(?int $userId = null)
    {
        $this->db = Database::getInstance();
        $this->userId = $userId;
    }

    /**
     * Create a journal entry with multiple lines
     * Each journal entry must have balanced debits and credits
     *
     * @param array $entry [
     *   'date' => 'YYYY-MM-DD',
     *   'type' => 'standard|adjustment|reversal|opening|closing',
     *   'description' => 'Description',
     *   'lines' => [
     *     ['account_id' => 1, 'debit' => 100.00, 'credit' => 0, 'memo' => ''],
     *     ['account_id' => 2, 'debit' => 0, 'credit' => 100.00, 'memo' => ''],
     *   ],
     *   'source_type' => 'transaction|check|transfer' (optional),
     *   'source_id' => int (optional),
     * ]
     * @return array ['success' => bool, 'journal_id' => string, 'message' => string]
     */
    public function createJournalEntry(array $entry): array
    {
        // Validate required fields
        if (empty($entry['date']) || empty($entry['lines']) || !is_array($entry['lines'])) {
            return [
                'success' => false,
                'journal_id' => null,
                'message' => 'Missing required fields: date and lines'
            ];
        }

        if (count($entry['lines']) < 2) {
            return [
                'success' => false,
                'journal_id' => null,
                'message' => 'Journal entry must have at least 2 lines'
            ];
        }

        // Calculate totals
        $totalDebit = 0;
        $totalCredit = 0;
        foreach ($entry['lines'] as $line) {
            $totalDebit += floatval($line['debit'] ?? 0);
            $totalCredit += floatval($line['credit'] ?? 0);
        }

        // Verify balance (using cents to avoid float precision issues)
        if (round($totalDebit * 100) !== round($totalCredit * 100)) {
            return [
                'success' => false,
                'journal_id' => null,
                'message' => sprintf(
                    'Journal entry not balanced. Debits: %.2f, Credits: %.2f',
                    $totalDebit,
                    $totalCredit
                )
            ];
        }

        // Generate UUID for journal_id
        $journalId = $this->generateUUID();
        $journalDate = $entry['date'];
        $journalType = $entry['type'] ?? 'standard';
        $description = $entry['description'] ?? '';
        $sourceType = $entry['source_type'] ?? null;
        $sourceId = $entry['source_id'] ?? null;
        $reversesJournalId = $entry['reverses_journal_id'] ?? null;

        try {
            $this->db->beginTransaction();

            // Insert each line
            $lineNumber = 1;
            foreach ($entry['lines'] as $line) {
                $this->db->insert('ledger_entries', [
                    'user_id' => $this->userId,
                    'journal_id' => $journalId,
                    'journal_date' => $journalDate,
                    'journal_type' => $journalType,
                    'line_number' => $lineNumber,
                    'account_id' => $line['account_id'],
                    'debit_amount' => floatval($line['debit'] ?? 0),
                    'credit_amount' => floatval($line['credit'] ?? 0),
                    'description' => $description,
                    'memo' => $line['memo'] ?? null,
                    'source_type' => $sourceType,
                    'source_id' => $sourceId,
                    'reverses_journal_id' => $reversesJournalId,
                    'created_by' => $this->userId
                ]);
                $lineNumber++;
            }

            // If this is a reversal, mark the original entry as reversed
            if ($reversesJournalId) {
                // Note: We can't UPDATE ledger_entries, so we track this via queries
                // The reversed_by_journal_id will be set via a separate process if needed
            }

            $this->db->commit();

            // Log the journal entry creation
            $this->logAudit('create_journal', 'ledger_entry', null, [
                'journal_id' => $journalId,
                'lines_count' => count($entry['lines']),
                'total_amount' => $totalDebit
            ]);

            return [
                'success' => true,
                'journal_id' => $journalId,
                'message' => 'Journal entry created successfully'
            ];

        } catch (Exception $e) {
            $this->db->rollback();
            appLog('Ledger entry error: ' . $e->getMessage(), 'error');
            return [
                'success' => false,
                'journal_id' => null,
                'message' => 'Failed to create journal entry: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Create a simple two-line journal entry (most common case)
     *
     * @param int $debitAccountId Account to debit
     * @param int $creditAccountId Account to credit
     * @param float $amount Transaction amount
     * @param string $date Transaction date
     * @param string $description Description
     * @param string|null $sourceType Source type (transaction, check, etc.)
     * @param int|null $sourceId Source ID
     * @return array
     */
    public function createSimpleEntry(
        int $debitAccountId,
        int $creditAccountId,
        float $amount,
        string $date,
        string $description,
        ?string $sourceType = null,
        ?int $sourceId = null
    ): array {
        return $this->createJournalEntry([
            'date' => $date,
            'type' => 'standard',
            'description' => $description,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'lines' => [
                ['account_id' => $debitAccountId, 'debit' => $amount, 'credit' => 0],
                ['account_id' => $creditAccountId, 'debit' => 0, 'credit' => $amount],
            ]
        ]);
    }

    /**
     * Create a reversal entry for an existing journal entry
     *
     * @param string $journalId The journal_id to reverse
     * @param string $reason Reason for reversal
     * @return array
     */
    public function createReversalEntry(string $journalId, string $reason = 'Reversal'): array
    {
        // Fetch original entry lines
        $originalLines = $this->db->fetchAll(
            "SELECT * FROM ledger_entries WHERE journal_id = :journal_id ORDER BY line_number",
            ['journal_id' => $journalId]
        );

        if (empty($originalLines)) {
            return [
                'success' => false,
                'journal_id' => null,
                'message' => 'Original journal entry not found'
            ];
        }

        // Check if already reversed
        $alreadyReversed = $this->db->fetch(
            "SELECT journal_id FROM ledger_entries WHERE reverses_journal_id = :journal_id LIMIT 1",
            ['journal_id' => $journalId]
        );

        if ($alreadyReversed) {
            return [
                'success' => false,
                'journal_id' => null,
                'message' => 'Journal entry has already been reversed'
            ];
        }

        // Create reversal lines (swap debit/credit)
        $reversalLines = [];
        foreach ($originalLines as $line) {
            $reversalLines[] = [
                'account_id' => $line['account_id'],
                'debit' => floatval($line['credit_amount']),  // Swap credit to debit
                'credit' => floatval($line['debit_amount']),  // Swap debit to credit
                'memo' => $reason
            ];
        }

        return $this->createJournalEntry([
            'date' => date('Y-m-d'),  // Reversal dated today
            'type' => 'reversal',
            'description' => 'REVERSAL: ' . $originalLines[0]['description'],
            'reverses_journal_id' => $journalId,
            'lines' => $reversalLines
        ]);
    }

    /**
     * Get account balance from ledger
     *
     * @param int $accountId
     * @param string|null $asOfDate Optional date to get balance as of
     * @return array ['debit_total', 'credit_total', 'balance']
     */
    public function getAccountBalance(int $accountId, ?string $asOfDate = null): array
    {
        $sql = "SELECT
                    SUM(debit_amount) as debit_total,
                    SUM(credit_amount) as credit_total
                FROM ledger_entries
                WHERE account_id = :account_id";

        $params = ['account_id' => $accountId];

        if ($asOfDate) {
            $sql .= " AND journal_date <= :as_of_date";
            $params['as_of_date'] = $asOfDate;
        }

        if ($this->userId) {
            $sql .= " AND user_id = :user_id";
            $params['user_id'] = $this->userId;
        }

        $result = $this->db->fetch($sql, $params);

        $debitTotal = floatval($result['debit_total'] ?? 0);
        $creditTotal = floatval($result['credit_total'] ?? 0);

        return [
            'debit_total' => $debitTotal,
            'credit_total' => $creditTotal,
            'balance' => $debitTotal - $creditTotal  // Positive = debit balance
        ];
    }

    /**
     * Get journal entry details
     *
     * @param string $journalId
     * @return array|null
     */
    public function getJournalEntry(string $journalId): ?array
    {
        $lines = $this->db->fetchAll(
            "SELECT le.*, a.account_name, a.account_type, a.account_class
             FROM ledger_entries le
             JOIN accounts a ON le.account_id = a.id
             WHERE le.journal_id = :journal_id
             ORDER BY le.line_number",
            ['journal_id' => $journalId]
        );

        if (empty($lines)) {
            return null;
        }

        return [
            'journal_id' => $journalId,
            'journal_date' => $lines[0]['journal_date'],
            'journal_type' => $lines[0]['journal_type'],
            'description' => $lines[0]['description'],
            'source_type' => $lines[0]['source_type'],
            'source_id' => $lines[0]['source_id'],
            'created_at' => $lines[0]['created_at'],
            'created_by' => $lines[0]['created_by'],
            'reverses_journal_id' => $lines[0]['reverses_journal_id'],
            'lines' => $lines,
            'total_debit' => array_sum(array_column($lines, 'debit_amount')),
            'total_credit' => array_sum(array_column($lines, 'credit_amount'))
        ];
    }

    /**
     * Get ledger entries for an account
     *
     * @param int $accountId
     * @param string|null $startDate
     * @param string|null $endDate
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function getAccountLedger(
        int $accountId,
        ?string $startDate = null,
        ?string $endDate = null,
        int $limit = 100,
        int $offset = 0
    ): array {
        $sql = "SELECT le.*, a.account_name
                FROM ledger_entries le
                JOIN accounts a ON le.account_id = a.id
                WHERE le.account_id = :account_id";

        $params = ['account_id' => $accountId];

        if ($this->userId) {
            $sql .= " AND le.user_id = :user_id";
            $params['user_id'] = $this->userId;
        }

        if ($startDate) {
            $sql .= " AND le.journal_date >= :start_date";
            $params['start_date'] = $startDate;
        }

        if ($endDate) {
            $sql .= " AND le.journal_date <= :end_date";
            $params['end_date'] = $endDate;
        }

        $sql .= " ORDER BY le.journal_date DESC, le.created_at DESC LIMIT :limit OFFSET :offset";

        // PDO needs special handling for LIMIT/OFFSET
        $stmt = $this->db->getConnection()->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Verify all journal entries are balanced
     *
     * @return array List of unbalanced journal entries
     */
    public function verifyLedgerIntegrity(): array
    {
        $sql = "SELECT * FROM v_journal_balance WHERE status = 'UNBALANCED'";

        if ($this->userId) {
            $sql = "SELECT * FROM v_journal_balance WHERE status = 'UNBALANCED' AND user_id = :user_id";
            return $this->db->fetchAll($sql, ['user_id' => $this->userId]);
        }

        return $this->db->fetchAll($sql);
    }

    /**
     * Get trial balance report
     *
     * @param string|null $asOfDate
     * @return array
     */
    public function getTrialBalance(?string $asOfDate = null): array
    {
        $sql = "SELECT
                    a.id as account_id,
                    a.account_name,
                    a.account_type,
                    a.account_class,
                    a.account_code,
                    SUM(le.debit_amount) as total_debits,
                    SUM(le.credit_amount) as total_credits,
                    SUM(le.debit_amount) - SUM(le.credit_amount) as balance
                FROM accounts a
                LEFT JOIN ledger_entries le ON a.id = le.account_id";

        $params = [];

        if ($asOfDate) {
            $sql .= " AND le.journal_date <= :as_of_date";
            $params['as_of_date'] = $asOfDate;
        }

        if ($this->userId) {
            $sql .= " WHERE a.user_id = :user_id";
            $params['user_id'] = $this->userId;
        }

        $sql .= " GROUP BY a.id, a.account_name, a.account_type, a.account_class, a.account_code
                  HAVING total_debits > 0 OR total_credits > 0
                  ORDER BY a.account_class, a.account_code, a.account_name";

        $accounts = $this->db->fetchAll($sql, $params);

        $totalDebits = array_sum(array_column($accounts, 'total_debits'));
        $totalCredits = array_sum(array_column($accounts, 'total_credits'));

        return [
            'accounts' => $accounts,
            'total_debits' => $totalDebits,
            'total_credits' => $totalCredits,
            'is_balanced' => round($totalDebits * 100) === round($totalCredits * 100),
            'as_of_date' => $asOfDate ?? date('Y-m-d')
        ];
    }

    /**
     * Record an expense transaction in double-entry format
     * Debit: Expense Category Account
     * Credit: Bank/Credit Card Account
     *
     * @param int $expenseAccountId The expense category account
     * @param int $paymentAccountId The bank/credit card account
     * @param float $amount
     * @param string $date
     * @param string $description
     * @param int|null $transactionId Link to transactions table
     * @return array
     */
    public function recordExpense(
        int $expenseAccountId,
        int $paymentAccountId,
        float $amount,
        string $date,
        string $description,
        ?int $transactionId = null
    ): array {
        return $this->createSimpleEntry(
            $expenseAccountId,    // Debit expense (increases expense)
            $paymentAccountId,    // Credit bank/CC (decreases asset or increases liability)
            abs($amount),
            $date,
            $description,
            $transactionId ? 'transaction' : null,
            $transactionId
        );
    }

    /**
     * Record an income transaction in double-entry format
     * Debit: Bank Account
     * Credit: Income Category Account
     *
     * @param int $bankAccountId The bank account receiving funds
     * @param int $incomeAccountId The income category account
     * @param float $amount
     * @param string $date
     * @param string $description
     * @param int|null $transactionId Link to transactions table
     * @return array
     */
    public function recordIncome(
        int $bankAccountId,
        int $incomeAccountId,
        float $amount,
        string $date,
        string $description,
        ?int $transactionId = null
    ): array {
        return $this->createSimpleEntry(
            $bankAccountId,    // Debit bank (increases asset)
            $incomeAccountId,  // Credit income (increases income)
            abs($amount),
            $date,
            $description,
            $transactionId ? 'transaction' : null,
            $transactionId
        );
    }

    /**
     * Record a transfer between accounts
     *
     * @param int $fromAccountId Source account
     * @param int $toAccountId Destination account
     * @param float $amount
     * @param string $date
     * @param string $description
     * @return array
     */
    public function recordTransfer(
        int $fromAccountId,
        int $toAccountId,
        float $amount,
        string $date,
        string $description
    ): array {
        return $this->createSimpleEntry(
            $toAccountId,    // Debit destination (increase)
            $fromAccountId,  // Credit source (decrease)
            abs($amount),
            $date,
            $description,
            'transfer',
            null
        );
    }

    /**
     * Generate a UUID v4
     */
    private function generateUUID(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    /**
     * Log audit entry
     */
    private function logAudit(string $action, string $entityType, ?int $entityId, array $newValues = []): void
    {
        try {
            $this->db->insert('audit_log', [
                'user_id' => $this->userId,
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'new_values' => json_encode($newValues),
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null
            ]);
        } catch (Exception $e) {
            appLog('Audit log error: ' . $e->getMessage(), 'error');
        }
    }
}
