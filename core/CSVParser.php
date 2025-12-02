<?php
/**
 * CSV Parser Class
 * Handles bank-specific CSV normalization
 */

class CSVParser {
    private Database $db;
    private array $institutionFormats = [];
    private array $errors = [];
    private array $warnings = [];

    /**
     * Standard normalized transaction structure
     */
    private array $normalizedFields = [
        'transaction_date',
        'post_date',
        'description',
        'original_description',
        'vendor_name',
        'amount',
        'transaction_type',
        'check_number',
        'reference_number',
        'memo'
    ];

    public function __construct() {
        $this->db = Database::getInstance();
        $this->loadInstitutionFormats();
    }

    /**
     * Load CSV formats from database
     */
    private function loadInstitutionFormats(): void {
        $institutions = $this->db->fetchAll(
            "SELECT short_code, csv_format FROM financial_institutions WHERE is_active = 1"
        );

        foreach ($institutions as $inst) {
            $this->institutionFormats[$inst['short_code']] = json_decode($inst['csv_format'], true);
        }
    }

    /**
     * Parse CSV file
     */
    public function parse(string $filePath, string $institutionCode, int $accountId): array {
        $this->errors = [];
        $this->warnings = [];

        if (!file_exists($filePath)) {
            throw new Exception("File not found: $filePath");
        }

        $format = $this->institutionFormats[$institutionCode] ?? null;
        if (!$format) {
            throw new Exception("Unknown institution code: $institutionCode");
        }

        $rows = $this->readCSV($filePath);
        if (empty($rows)) {
            throw new Exception("No data found in CSV file");
        }

        // Skip header row if present
        $hasHeader = $this->detectHeader($rows[0], $format);
        if ($hasHeader) {
            array_shift($rows);
        }

        $normalized = [];
        foreach ($rows as $index => $row) {
            $lineNum = $index + ($hasHeader ? 2 : 1);
            try {
                $transaction = $this->normalizeRow($row, $format, $accountId);
                if ($transaction) {
                    $normalized[] = $transaction;
                }
            } catch (Exception $e) {
                $this->errors[] = "Line $lineNum: " . $e->getMessage();
            }
        }

        return [
            'transactions' => $normalized,
            'total_rows' => count($rows),
            'parsed_rows' => count($normalized),
            'errors' => $this->errors,
            'warnings' => $this->warnings
        ];
    }

    /**
     * Read CSV file into array
     */
    private function readCSV(string $filePath): array {
        $rows = [];
        $handle = fopen($filePath, 'r');

        if ($handle === false) {
            throw new Exception("Could not open file");
        }

        // Detect delimiter
        $firstLine = fgets($handle);
        rewind($handle);
        $delimiter = $this->detectDelimiter($firstLine);

        while (($data = fgetcsv($handle, 0, $delimiter)) !== false) {
            // Skip empty rows
            if (count($data) === 1 && empty($data[0])) {
                continue;
            }
            $rows[] = $data;
        }

        fclose($handle);
        return $rows;
    }

    /**
     * Detect CSV delimiter
     */
    private function detectDelimiter(string $line): string {
        $delimiters = [',', ';', "\t", '|'];
        $counts = [];

        foreach ($delimiters as $d) {
            $counts[$d] = substr_count($line, $d);
        }

        return array_keys($counts, max($counts))[0];
    }

    /**
     * Detect if first row is header
     */
    private function detectHeader(array $row, array $format): bool {
        // Check if the date column contains a date-like value
        $dateCol = $format['date_col'] ?? 0;
        $dateValue = $row[$dateCol] ?? '';

        // If it looks like a date, it's data not header
        if (preg_match('/\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/', $dateValue)) {
            return false;
        }

        // Check for common header words
        $headerWords = ['date', 'description', 'amount', 'debit', 'credit', 'transaction', 'posted'];
        $rowLower = strtolower(implode(' ', $row));

        foreach ($headerWords as $word) {
            if (strpos($rowLower, $word) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * Normalize a single row based on institution format
     */
    private function normalizeRow(array $row, array $format, int $accountId): ?array {
        // Extract values based on format mapping
        $dateCol = $format['date_col'] ?? 0;
        $postDateCol = $format['post_date_col'] ?? null;
        $descCol = $format['description_col'] ?? 1;
        $amountCol = $format['amount_col'] ?? null;
        $debitCol = $format['debit_col'] ?? null;
        $creditCol = $format['credit_col'] ?? null;
        $typeCol = $format['type_col'] ?? null;
        $checkCol = $format['check_col'] ?? null;
        $memoCol = $format['memo_col'] ?? null;
        $dateFormat = $format['date_format'] ?? 'm/d/Y';
        $skipEmptyAmount = $format['skip_empty_amount'] ?? false;

        // Skip rows with empty amount if configured
        if ($skipEmptyAmount && $amountCol !== null) {
            $amountValue = trim($row[$amountCol] ?? '');
            if (empty($amountValue)) {
                return null;
            }
        }

        // Parse date
        $dateValue = trim($row[$dateCol] ?? '');
        $transactionDate = $this->parseDate($dateValue, $dateFormat);

        if (!$transactionDate) {
            throw new Exception("Invalid date: $dateValue");
        }

        // Parse post date if available
        $postDate = null;
        if ($postDateCol !== null && isset($row[$postDateCol])) {
            $postDate = $this->parseDate(trim($row[$postDateCol]), $dateFormat);
        }

        // Parse description
        $description = trim($row[$descCol] ?? '');
        if (empty($description)) {
            throw new Exception("Empty description");
        }

        // Parse amount
        $amount = 0;
        $transactionType = 'debit';

        if ($amountCol !== null) {
            // Single amount column (negative = debit, positive = credit)
            $amount = $this->parseAmount($row[$amountCol] ?? '0');

            // Some banks invert the sign
            if (isset($format['invert_sign']) && $format['invert_sign']) {
                $amount = -$amount;
            }

            $transactionType = $amount < 0 ? 'debit' : 'credit';
        } elseif ($debitCol !== null || $creditCol !== null) {
            // Separate debit/credit columns
            $debitAmount = $this->parseAmount($row[$debitCol] ?? '0');
            $creditAmount = $this->parseAmount($row[$creditCol] ?? '0');

            if ($debitAmount != 0) {
                $amount = -abs($debitAmount);
                $transactionType = 'debit';
            } else {
                $amount = abs($creditAmount);
                $transactionType = 'credit';
            }
        }

        // Determine type from type column if available
        if ($typeCol !== null && isset($row[$typeCol])) {
            $typeValue = strtolower(trim($row[$typeCol]));
            if (in_array($typeValue, ['debit', 'withdrawal', 'purchase', 'payment'])) {
                $transactionType = 'debit';
                $amount = -abs($amount);
            } elseif (in_array($typeValue, ['credit', 'deposit', 'refund'])) {
                $transactionType = 'credit';
                $amount = abs($amount);
            }
        }

        // Extract vendor name from description
        $vendorName = $this->extractVendorName($description);

        // Generate import hash for deduplication
        $importHash = generateImportHash(
            $accountId,
            $transactionDate,
            $description,
            $amount
        );

        return [
            'account_id' => $accountId,
            'transaction_date' => $transactionDate,
            'post_date' => $postDate,
            'description' => $this->cleanDescription($description),
            'original_description' => $description,
            'vendor_name' => $vendorName,
            'amount' => $amount,
            'transaction_type' => $transactionType,
            'check_number' => $checkCol !== null ? trim($row[$checkCol] ?? '') : null,
            'memo' => $memoCol !== null ? trim($row[$memoCol] ?? '') : null,
            'import_hash' => $importHash
        ];
    }

    /**
     * Parse date string to Y-m-d format
     */
    private function parseDate(string $dateStr, string $format): ?string {
        $dateStr = trim($dateStr);

        // Try the specified format first
        $date = DateTime::createFromFormat($format, $dateStr);
        if ($date) {
            return $date->format('Y-m-d');
        }

        // Try common formats
        $formats = [
            'm/d/Y', 'm/d/y', 'Y-m-d', 'Y/m/d',
            'd/m/Y', 'd/m/y', 'm-d-Y', 'm-d-y',
            'M d, Y', 'F d, Y', 'd M Y',
            'd-M', 'j-M', 'd-M-Y', 'j-M-Y'  // e.g., 4-Oct, 04-Oct
        ];

        foreach ($formats as $fmt) {
            $date = DateTime::createFromFormat($fmt, $dateStr);
            if ($date) {
                return $date->format('Y-m-d');
            }
        }

        // Try strtotime as fallback
        $timestamp = strtotime($dateStr);
        if ($timestamp !== false) {
            return date('Y-m-d', $timestamp);
        }

        return null;
    }

    /**
     * Parse amount string to float
     */
    private function parseAmount(string $amountStr): float {
        $amountStr = trim($amountStr);

        if (empty($amountStr)) {
            return 0.0;
        }

        // Check for parentheses (negative)
        $isNegative = false;
        if (preg_match('/^\((.+)\)$/', $amountStr, $matches)) {
            $amountStr = $matches[1];
            $isNegative = true;
        }

        // Check for leading minus
        if (strpos($amountStr, '-') === 0) {
            $isNegative = true;
            $amountStr = substr($amountStr, 1);
        }

        // Remove currency symbols and whitespace
        $amountStr = preg_replace('/[^\d.,\-]/', '', $amountStr);

        // Handle European format (1.234,56 vs 1,234.56)
        if (preg_match('/^\d{1,3}(\.\d{3})+,\d{2}$/', $amountStr)) {
            // European format
            $amountStr = str_replace('.', '', $amountStr);
            $amountStr = str_replace(',', '.', $amountStr);
        } else {
            // US format - remove thousands separator
            $amountStr = str_replace(',', '', $amountStr);
        }

        $amount = (float) $amountStr;

        return $isNegative ? -$amount : $amount;
    }

    /**
     * Extract vendor name from description
     */
    private function extractVendorName(string $description): string {
        // Remove common prefixes
        $prefixes = [
            'PURCHASE AUTHORIZED ON',
            'PURCHASE - ',
            'POS DEBIT - ',
            'CHECKCARD ',
            'VISA PURCHASE',
            'DEBIT CARD PURCHASE',
            'ACH DEBIT',
            'ACH CREDIT',
            'DIRECT DEBIT',
            'DIRECT DEPOSIT',
            'ONLINE PAYMENT',
            'BILL PAY',
            'RECURRING PAYMENT'
        ];

        $vendor = $description;
        foreach ($prefixes as $prefix) {
            $vendor = preg_replace('/^' . preg_quote($prefix, '/') . '/i', '', $vendor);
        }

        // Remove date/time patterns
        $vendor = preg_replace('/\d{2}\/\d{2}\s*/', '', $vendor);
        $vendor = preg_replace('/\d{2}:\d{2}:\d{2}/', '', $vendor);

        // Remove card numbers
        $vendor = preg_replace('/\b\d{4}\b/', '', $vendor);
        $vendor = preg_replace('/\*{4,}/', '', $vendor);

        // Remove location suffixes
        $vendor = preg_replace('/\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/i', '', $vendor);

        // Clean up
        $vendor = preg_replace('/\s+/', ' ', $vendor);
        $vendor = trim($vendor);

        // Limit length
        if (strlen($vendor) > 200) {
            $vendor = substr($vendor, 0, 197) . '...';
        }

        return $vendor ?: $description;
    }

    /**
     * Clean description for display
     */
    private function cleanDescription(string $description): string {
        // Normalize whitespace
        $clean = preg_replace('/\s+/', ' ', $description);
        $clean = trim($clean);

        // Convert to title case if all uppercase
        if ($clean === strtoupper($clean)) {
            $clean = ucwords(strtolower($clean));
        }

        return $clean;
    }

    /**
     * Get available institution codes
     */
    public function getAvailableInstitutions(): array {
        return $this->db->fetchAll(
            "SELECT id, name, short_code, institution_type
             FROM financial_institutions
             WHERE is_active = 1
             ORDER BY name"
        );
    }

    /**
     * Add custom institution format
     */
    public function addInstitutionFormat(
        string $name,
        string $shortCode,
        string $type,
        array $csvFormat
    ): int {
        return $this->db->insert('financial_institutions', [
            'name' => $name,
            'short_code' => strtoupper($shortCode),
            'institution_type' => $type,
            'csv_format' => json_encode($csvFormat)
        ]);
    }

    /**
     * Get parsing errors
     */
    public function getErrors(): array {
        return $this->errors;
    }

    /**
     * Get parsing warnings
     */
    public function getWarnings(): array {
        return $this->warnings;
    }
}
