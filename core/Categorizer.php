<?php
/**
 * Transaction Categorizer
 * Rule-based + AI fallback categorization engine
 */

class Categorizer {
    private Database $db;
    private array $rules = [];
    private array $categories = [];
    private ?int $userId = null;
    private ?int $defaultCategoryId = null;

    public function __construct(?int $userId = null) {
        $this->db = Database::getInstance();
        $this->userId = $userId;
        $this->loadRules();
        $this->loadCategories();
        $this->loadDefaultCategory();
    }

    /**
     * Load categorization rules (global + user-specific)
     */
    private function loadRules(): void {
        $sql = "SELECT * FROM categorization_rules
                WHERE is_active = 1
                AND (user_id IS NULL" . ($this->userId ? " OR user_id = :user_id" : "") . ")
                ORDER BY priority ASC, hit_count DESC";

        $params = $this->userId ? ['user_id' => $this->userId] : [];
        $this->rules = $this->db->fetchAll($sql, $params);
    }

    /**
     * Load categories for quick lookup
     */
    private function loadCategories(): void {
        $sql = "SELECT * FROM categories
                WHERE is_active = 1
                AND (user_id IS NULL" . ($this->userId ? " OR user_id = :user_id" : "") . ")
                ORDER BY sort_order";

        $params = $this->userId ? ['user_id' => $this->userId] : [];
        $rows = $this->db->fetchAll($sql, $params);

        foreach ($rows as $row) {
            $this->categories[$row['id']] = $row;
        }
    }

    /**
     * Load default category (Uncategorized)
     */
    private function loadDefaultCategory(): void {
        $uncategorized = $this->db->fetch(
            "SELECT id FROM categories WHERE slug = 'uncategorized' AND is_system = 1 LIMIT 1"
        );
        $this->defaultCategoryId = $uncategorized ? (int)$uncategorized['id'] : null;
    }

    /**
     * Categorize a single transaction
     * Returns: ['category_id', 'categorized_by', 'confidence', 'rule_id']
     */
    public function categorize(array $transaction): array {
        $result = [
            'category_id' => $this->defaultCategoryId,
            'categorized_by' => 'default',
            'confidence' => null,
            'rule_id' => null
        ];

        // Get the text to match against
        $description = $transaction['description'] ?? '';
        $originalDescription = $transaction['original_description'] ?? $description;
        $vendorName = $transaction['vendor_name'] ?? '';
        $memo = $transaction['memo'] ?? '';
        $amount = $transaction['amount'] ?? 0;

        // Try rule-based categorization first
        foreach ($this->rules as $rule) {
            if ($this->matchesRule($rule, $description, $originalDescription, $vendorName, $memo, $amount)) {
                $result = [
                    'category_id' => (int)$rule['category_id'],
                    'categorized_by' => 'rule',
                    'confidence' => 1.0,
                    'rule_id' => (int)$rule['id']
                ];

                // Increment hit count
                $this->incrementRuleHitCount($rule['id']);
                break;
            }
        }

        // If no rule matched and AI is enabled, try AI categorization
        if ($result['categorized_by'] === 'default' && AI_CATEGORIZATION_ENABLED) {
            $aiResult = $this->categorizeWithAI($description, $vendorName);
            if ($aiResult && $aiResult['confidence'] >= CATEGORIZATION_CONFIDENCE_THRESHOLD) {
                $result = [
                    'category_id' => $aiResult['category_id'],
                    'categorized_by' => 'ai',
                    'confidence' => $aiResult['confidence'],
                    'rule_id' => null
                ];
            }
        }

        return $result;
    }

    /**
     * Categorize multiple transactions
     */
    public function categorizeMany(array $transactions): array {
        $results = [];
        foreach ($transactions as $index => $transaction) {
            $results[$index] = $this->categorize($transaction);
        }
        return $results;
    }

    /**
     * Check if transaction matches a rule
     */
    private function matchesRule(
        array $rule,
        string $description,
        string $originalDescription,
        string $vendorName,
        string $memo,
        float $amount
    ): bool {
        $matchField = $rule['match_field'];
        $matchType = $rule['match_type'];
        $matchValue = $rule['match_value'];
        $caseSensitive = (bool)$rule['match_case_sensitive'];

        // Determine which field(s) to match against
        $fieldsToMatch = [];
        switch ($matchField) {
            case 'description':
                $fieldsToMatch = [$description, $originalDescription];
                break;
            case 'vendor':
                $fieldsToMatch = [$vendorName];
                break;
            case 'memo':
                $fieldsToMatch = [$memo];
                break;
            case 'amount':
                return $this->matchAmount($matchType, $matchValue, $amount);
            case 'any':
                $fieldsToMatch = [$description, $originalDescription, $vendorName, $memo];
                break;
        }

        // Check match against each field
        foreach ($fieldsToMatch as $fieldValue) {
            if (empty($fieldValue)) continue;

            if ($this->matchText($matchType, $matchValue, $fieldValue, $caseSensitive)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Match text based on match type
     */
    private function matchText(string $matchType, string $pattern, string $text, bool $caseSensitive): bool {
        if (!$caseSensitive) {
            $pattern = strtolower($pattern);
            $text = strtolower($text);
        }

        switch ($matchType) {
            case 'exact':
                return $text === $pattern;

            case 'contains':
                return strpos($text, $pattern) !== false;

            case 'starts_with':
                return strpos($text, $pattern) === 0;

            case 'ends_with':
                return substr($text, -strlen($pattern)) === $pattern;

            case 'regex':
                $flags = $caseSensitive ? '' : 'i';
                return (bool)preg_match("/{$pattern}/{$flags}", $text);

            default:
                return false;
        }
    }

    /**
     * Match amount for amount-based rules
     */
    private function matchAmount(string $matchType, string $pattern, float $amount): bool {
        // Pattern format: "=100", ">50", "<200", "50-100"
        if (preg_match('/^([<>=])(.+)$/', $pattern, $matches)) {
            $operator = $matches[1];
            $value = (float)$matches[2];

            switch ($operator) {
                case '=': return abs($amount - $value) < 0.01;
                case '>': return $amount > $value;
                case '<': return $amount < $value;
            }
        }

        // Range format
        if (preg_match('/^([\d.]+)-([\d.]+)$/', $pattern, $matches)) {
            $min = (float)$matches[1];
            $max = (float)$matches[2];
            return $amount >= $min && $amount <= $max;
        }

        return false;
    }

    /**
     * Increment rule hit count
     */
    private function incrementRuleHitCount(int $ruleId): void {
        $this->db->query(
            "UPDATE categorization_rules
             SET hit_count = hit_count + 1, last_hit_at = NOW()
             WHERE id = :id",
            ['id' => $ruleId]
        );
    }

    /**
     * AI-based categorization (placeholder for AI integration)
     */
    private function categorizeWithAI(string $description, string $vendorName): ?array {
        if (!AI_CATEGORIZATION_ENABLED || empty(AI_API_KEY)) {
            return null;
        }

        // Build context for AI
        $categoryNames = array_map(fn($c) => $c['name'], $this->categories);
        $prompt = $this->buildAIPrompt($description, $vendorName, $categoryNames);

        // Call AI API (OpenAI example)
        $result = $this->callOpenAI($prompt);

        if ($result && isset($result['category'])) {
            // Find matching category
            foreach ($this->categories as $id => $category) {
                if (strtolower($category['name']) === strtolower($result['category'])) {
                    return [
                        'category_id' => $id,
                        'confidence' => $result['confidence'] ?? 0.8
                    ];
                }
            }
        }

        return null;
    }

    /**
     * Build prompt for AI categorization
     */
    private function buildAIPrompt(string $description, string $vendorName, array $categories): string {
        $categoryList = implode(', ', $categories);

        return "Categorize this transaction:
Description: {$description}
Vendor: {$vendorName}

Available categories: {$categoryList}

Respond with JSON: {\"category\": \"CategoryName\", \"confidence\": 0.95}
Only use categories from the list above.";
    }

    /**
     * Call OpenAI API for categorization
     */
    private function callOpenAI(string $prompt): ?array {
        $url = 'https://api.openai.com/v1/chat/completions';

        $data = [
            'model' => 'gpt-3.5-turbo',
            'messages' => [
                ['role' => 'system', 'content' => 'You are a financial transaction categorizer. Respond only with valid JSON.'],
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.3,
            'max_tokens' => 50
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . AI_API_KEY
            ],
            CURLOPT_POSTFIELDS => json_encode($data)
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            appLog("AI API error: HTTP $httpCode", 'error', ['response' => $response]);
            return null;
        }

        $result = json_decode($response, true);
        $content = $result['choices'][0]['message']['content'] ?? null;

        if ($content) {
            return json_decode($content, true);
        }

        return null;
    }

    /**
     * Create a new categorization rule
     */
    public function createRule(array $data): int {
        $required = ['category_id', 'match_value'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                throw new InvalidArgumentException("Missing required field: $field");
            }
        }

        return $this->db->insert('categorization_rules', [
            'user_id' => $data['user_id'] ?? $this->userId,
            'category_id' => $data['category_id'],
            'rule_name' => $data['rule_name'] ?? null,
            'match_field' => $data['match_field'] ?? 'description',
            'match_type' => $data['match_type'] ?? 'contains',
            'match_value' => $data['match_value'],
            'match_case_sensitive' => $data['match_case_sensitive'] ?? 0,
            'priority' => $data['priority'] ?? 100,
            'is_active' => 1
        ]);
    }

    /**
     * Create rule from manual categorization
     * Called when user manually categorizes a transaction
     */
    public function createRuleFromManual(
        int $transactionId,
        int $categoryId,
        string $matchField = 'vendor',
        string $matchType = 'contains'
    ): ?int {
        // Get transaction details
        $transaction = $this->db->fetch(
            "SELECT description, vendor_name, original_description
             FROM transactions WHERE id = :id",
            ['id' => $transactionId]
        );

        if (!$transaction) {
            return null;
        }

        // Determine match value
        $matchValue = '';
        switch ($matchField) {
            case 'vendor':
                $matchValue = $transaction['vendor_name'];
                break;
            case 'description':
                $matchValue = $transaction['description'];
                break;
            default:
                $matchValue = $transaction['original_description'];
        }

        if (empty($matchValue)) {
            return null;
        }

        // Check if similar rule already exists
        $existingRule = $this->db->fetch(
            "SELECT id FROM categorization_rules
             WHERE category_id = :category_id
             AND match_field = :match_field
             AND match_value = :match_value
             AND (user_id IS NULL OR user_id = :user_id)",
            [
                'category_id' => $categoryId,
                'match_field' => $matchField,
                'match_value' => $matchValue,
                'user_id' => $this->userId
            ]
        );

        if ($existingRule) {
            return (int)$existingRule['id'];
        }

        // Create new rule
        return $this->createRule([
            'user_id' => $this->userId,
            'category_id' => $categoryId,
            'rule_name' => "Auto: " . substr($matchValue, 0, 50),
            'match_field' => $matchField,
            'match_type' => $matchType,
            'match_value' => $matchValue,
            'priority' => 50 // Higher priority for user rules
        ]);
    }

    /**
     * Get all rules for current user
     */
    public function getRules(): array {
        return $this->rules;
    }

    /**
     * Get all categories
     */
    public function getCategories(): array {
        return $this->categories;
    }

    /**
     * Update a rule
     */
    public function updateRule(int $ruleId, array $data): bool {
        $allowed = ['category_id', 'rule_name', 'match_field', 'match_type',
                    'match_value', 'match_case_sensitive', 'priority', 'is_active'];

        $updateData = array_intersect_key($data, array_flip($allowed));

        if (empty($updateData)) {
            return false;
        }

        $rows = $this->db->update('categorization_rules', $updateData,
            "id = :id" . ($this->userId ? " AND (user_id IS NULL OR user_id = :user_id)" : ""),
            array_merge(['id' => $ruleId], $this->userId ? ['user_id' => $this->userId] : [])
        );

        // Reload rules
        $this->loadRules();

        return $rows > 0;
    }

    /**
     * Delete a rule
     */
    public function deleteRule(int $ruleId): bool {
        // Only allow deleting user-specific rules, not global ones
        $rows = $this->db->delete('categorization_rules',
            "id = :id AND user_id = :user_id",
            ['id' => $ruleId, 'user_id' => $this->userId]
        );

        $this->loadRules();

        return $rows > 0;
    }

    /**
     * Reload rules (after adding/modifying)
     */
    public function reloadRules(): void {
        $this->loadRules();
    }

    /**
     * Get categorization statistics
     */
    public function getStats(): array {
        $stats = $this->db->fetch(
            "SELECT
                COUNT(*) as total_rules,
                SUM(hit_count) as total_hits,
                SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) as global_rules,
                SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) as user_rules
             FROM categorization_rules
             WHERE is_active = 1
             AND (user_id IS NULL" . ($this->userId ? " OR user_id = :user_id" : "") . ")",
            $this->userId ? ['user_id' => $this->userId] : []
        );

        return $stats ?: [];
    }
}
