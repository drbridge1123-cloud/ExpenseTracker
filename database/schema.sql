-- =====================================================
-- Personal Finance Management System - Database Schema
-- Compatible with MariaDB (XAMPP)
-- =====================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------
-- Database Creation
-- -----------------------------------------------------
CREATE DATABASE IF NOT EXISTS `expense_tracker`
    DEFAULT CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `expense_tracker`;

-- -----------------------------------------------------
-- Table: users
-- -----------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(100) NULL,
    `default_currency` CHAR(3) DEFAULT 'USD',
    `timezone` VARCHAR(50) DEFAULT 'UTC',
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_username` (`username`),
    UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: user_sessions
-- -----------------------------------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `session_token` VARCHAR(255) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `expires_at` TIMESTAMP NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sessions_token` (`session_token`),
    KEY `idx_sessions_user` (`user_id`),
    KEY `idx_sessions_expires` (`expires_at`),
    CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: financial_institutions
-- -----------------------------------------------------
DROP TABLE IF EXISTS `financial_institutions`;
CREATE TABLE `financial_institutions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `short_code` VARCHAR(20) NOT NULL,
    `institution_type` ENUM('bank', 'credit_union', 'credit_card', 'investment', 'other') DEFAULT 'bank',
    `country` CHAR(2) DEFAULT 'US',
    `csv_format` JSON NULL COMMENT 'CSV column mapping configuration',
    `logo_url` VARCHAR(500) NULL,
    `website` VARCHAR(255) NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_institutions_code` (`short_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: accounts
-- -----------------------------------------------------
DROP TABLE IF EXISTS `accounts`;
CREATE TABLE `accounts` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `institution_id` INT UNSIGNED NULL,
    `account_name` VARCHAR(100) NOT NULL,
    `account_type` ENUM('checking', 'savings', 'credit_card', 'investment', 'cash', 'loan', 'other') NOT NULL,
    `account_number_last4` CHAR(4) NULL,
    `currency` CHAR(3) DEFAULT 'USD',
    `current_balance` DECIMAL(15,2) DEFAULT 0.00,
    `available_balance` DECIMAL(15,2) NULL,
    `credit_limit` DECIMAL(15,2) NULL COMMENT 'For credit cards',
    `interest_rate` DECIMAL(5,4) NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `include_in_totals` TINYINT(1) DEFAULT 1,
    `color` CHAR(7) NULL COMMENT 'Hex color for UI',
    `notes` TEXT NULL,
    `last_synced_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_accounts_user` (`user_id`),
    KEY `idx_accounts_institution` (`institution_id`),
    KEY `idx_accounts_type` (`account_type`),
    CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_accounts_institution` FOREIGN KEY (`institution_id`)
        REFERENCES `financial_institutions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: categories
-- -----------------------------------------------------
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NULL COMMENT 'NULL for system categories',
    `parent_id` INT UNSIGNED NULL COMMENT 'For subcategories',
    `name` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `icon` VARCHAR(50) NULL,
    `color` CHAR(7) NULL,
    `category_type` ENUM('income', 'expense', 'transfer', 'other') DEFAULT 'expense',
    `is_system` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_categories_slug_user` (`slug`, `user_id`),
    KEY `idx_categories_user` (`user_id`),
    KEY `idx_categories_parent` (`parent_id`),
    KEY `idx_categories_type` (`category_type`),
    CONSTRAINT `fk_categories_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_id`)
        REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: categorization_rules
-- -----------------------------------------------------
DROP TABLE IF EXISTS `categorization_rules`;
CREATE TABLE `categorization_rules` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NULL COMMENT 'NULL for global rules',
    `category_id` INT UNSIGNED NOT NULL,
    `rule_name` VARCHAR(100) NULL,
    `match_field` ENUM('description', 'vendor', 'memo', 'amount', 'any') DEFAULT 'description',
    `match_type` ENUM('contains', 'starts_with', 'ends_with', 'exact', 'regex') DEFAULT 'contains',
    `match_value` VARCHAR(255) NOT NULL,
    `match_case_sensitive` TINYINT(1) DEFAULT 0,
    `priority` INT DEFAULT 100 COMMENT 'Lower = higher priority',
    `hit_count` INT UNSIGNED DEFAULT 0,
    `last_hit_at` TIMESTAMP NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_rules_user` (`user_id`),
    KEY `idx_rules_category` (`category_id`),
    KEY `idx_rules_priority` (`priority`),
    KEY `idx_rules_active` (`is_active`),
    CONSTRAINT `fk_rules_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rules_category` FOREIGN KEY (`category_id`)
        REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: transactions
-- -----------------------------------------------------
DROP TABLE IF EXISTS `transactions`;
CREATE TABLE `transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL,
    `transaction_date` DATE NOT NULL,
    `post_date` DATE NULL,
    `description` VARCHAR(500) NOT NULL,
    `original_description` VARCHAR(500) NULL COMMENT 'Raw description from import',
    `vendor_name` VARCHAR(200) NULL,
    `amount` DECIMAL(15,2) NOT NULL COMMENT 'Negative for debits, positive for credits',
    `currency` CHAR(3) DEFAULT 'USD',
    `transaction_type` ENUM('debit', 'credit', 'transfer', 'adjustment') NOT NULL,
    `status` ENUM('pending', 'posted', 'reconciled', 'void') DEFAULT 'posted',
    `is_recurring` TINYINT(1) DEFAULT 0,
    `is_split` TINYINT(1) DEFAULT 0,
    `parent_transaction_id` INT UNSIGNED NULL COMMENT 'For split transactions',
    `transfer_account_id` INT UNSIGNED NULL COMMENT 'For transfers',
    `check_number` VARCHAR(20) NULL,
    `reference_number` VARCHAR(50) NULL,
    `memo` TEXT NULL,
    `tags` JSON NULL,
    `location` JSON NULL COMMENT 'Geo data if available',
    `import_hash` CHAR(64) NULL COMMENT 'SHA256 for deduplication',
    `import_batch_id` INT UNSIGNED NULL,
    `categorized_by` ENUM('rule', 'ai', 'manual', 'default') DEFAULT 'default',
    `categorization_confidence` DECIMAL(3,2) NULL,
    `is_reviewed` TINYINT(1) DEFAULT 0,
    `reviewed_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_transactions_hash` (`import_hash`),
    KEY `idx_transactions_user` (`user_id`),
    KEY `idx_transactions_account` (`account_id`),
    KEY `idx_transactions_category` (`category_id`),
    KEY `idx_transactions_date` (`transaction_date`),
    KEY `idx_transactions_type` (`transaction_type`),
    KEY `idx_transactions_status` (`status`),
    KEY `idx_transactions_vendor` (`vendor_name`),
    KEY `idx_transactions_batch` (`import_batch_id`),
    KEY `idx_transactions_user_date` (`user_id`, `transaction_date`),
    CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transactions_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_transactions_category` FOREIGN KEY (`category_id`)
        REFERENCES `categories` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_transactions_parent` FOREIGN KEY (`parent_transaction_id`)
        REFERENCES `transactions` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_transactions_transfer` FOREIGN KEY (`transfer_account_id`)
        REFERENCES `accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: import_batches
-- -----------------------------------------------------
DROP TABLE IF EXISTS `import_batches`;
CREATE TABLE `import_batches` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `institution_id` INT UNSIGNED NULL,
    `filename` VARCHAR(255) NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `file_size` INT UNSIGNED NULL,
    `total_rows` INT UNSIGNED DEFAULT 0,
    `imported_rows` INT UNSIGNED DEFAULT 0,
    `duplicate_rows` INT UNSIGNED DEFAULT 0,
    `error_rows` INT UNSIGNED DEFAULT 0,
    `status` ENUM('pending', 'processing', 'completed', 'failed', 'partial') DEFAULT 'pending',
    `error_log` JSON NULL,
    `started_at` TIMESTAMP NULL,
    `completed_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_batches_user` (`user_id`),
    KEY `idx_batches_account` (`account_id`),
    KEY `idx_batches_status` (`status`),
    CONSTRAINT `fk_batches_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_batches_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_batches_institution` FOREIGN KEY (`institution_id`)
        REFERENCES `financial_institutions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: monthly_reports
-- -----------------------------------------------------
DROP TABLE IF EXISTS `monthly_reports`;
CREATE TABLE `monthly_reports` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `report_year` SMALLINT UNSIGNED NOT NULL,
    `report_month` TINYINT UNSIGNED NOT NULL,
    `total_income` DECIMAL(15,2) DEFAULT 0.00,
    `total_expenses` DECIMAL(15,2) DEFAULT 0.00,
    `net_savings` DECIMAL(15,2) DEFAULT 0.00,
    `savings_rate` DECIMAL(5,2) NULL,
    `category_breakdown` JSON NULL COMMENT 'Spending by category',
    `account_breakdown` JSON NULL COMMENT 'Activity by account',
    `daily_breakdown` JSON NULL COMMENT 'Daily spending pattern',
    `top_vendors` JSON NULL COMMENT 'Top spending vendors',
    `comparison_data` JSON NULL COMMENT 'vs previous periods',
    `transaction_count` INT UNSIGNED DEFAULT 0,
    `generated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_reports_user_period` (`user_id`, `report_year`, `report_month`),
    KEY `idx_reports_period` (`report_year`, `report_month`),
    CONSTRAINT `fk_reports_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: budgets
-- -----------------------------------------------------
DROP TABLE IF EXISTS `budgets`;
CREATE TABLE `budgets` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL COMMENT 'NULL for overall budget',
    `budget_name` VARCHAR(100) NULL,
    `budget_type` ENUM('monthly', 'weekly', 'yearly', 'custom') DEFAULT 'monthly',
    `amount` DECIMAL(15,2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `rollover` TINYINT(1) DEFAULT 0 COMMENT 'Rollover unused amount',
    `alert_threshold` DECIMAL(5,2) DEFAULT 80.00 COMMENT 'Alert at % spent',
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_budgets_user` (`user_id`),
    KEY `idx_budgets_category` (`category_id`),
    KEY `idx_budgets_dates` (`start_date`, `end_date`),
    CONSTRAINT `fk_budgets_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_budgets_category` FOREIGN KEY (`category_id`)
        REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: recurring_transactions
-- -----------------------------------------------------
DROP TABLE IF EXISTS `recurring_transactions`;
CREATE TABLE `recurring_transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL,
    `description` VARCHAR(500) NOT NULL,
    `vendor_name` VARCHAR(200) NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `transaction_type` ENUM('debit', 'credit') NOT NULL,
    `frequency` ENUM('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly') NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `next_occurrence` DATE NOT NULL,
    `day_of_month` TINYINT UNSIGNED NULL,
    `day_of_week` TINYINT UNSIGNED NULL,
    `auto_create` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_recurring_user` (`user_id`),
    KEY `idx_recurring_next` (`next_occurrence`),
    CONSTRAINT `fk_recurring_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recurring_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_recurring_category` FOREIGN KEY (`category_id`)
        REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: user_settings
-- -----------------------------------------------------
DROP TABLE IF EXISTS `user_settings`;
CREATE TABLE `user_settings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `setting_key` VARCHAR(50) NOT NULL,
    `setting_value` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_settings_user_key` (`user_id`, `setting_key`),
    CONSTRAINT `fk_settings_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: audit_log
-- -----------------------------------------------------
DROP TABLE IF EXISTS `audit_log`;
CREATE TABLE `audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NULL,
    `action` VARCHAR(50) NOT NULL,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` INT UNSIGNED NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_audit_user` (`user_id`),
    KEY `idx_audit_entity` (`entity_type`, `entity_id`),
    KEY `idx_audit_action` (`action`),
    KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Default Data Inserts
-- =====================================================

-- Default Financial Institutions
INSERT INTO `financial_institutions` (`name`, `short_code`, `institution_type`, `csv_format`) VALUES
('Chase Bank', 'CHASE', 'bank', '{"date_col": 0, "description_col": 1, "amount_col": 2, "type_col": 3, "date_format": "m/d/Y"}'),
('Bank of America', 'BOFA', 'bank', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "m/d/Y"}'),
('Wells Fargo', 'WF', 'bank', '{"date_col": 0, "amount_col": 1, "description_col": 4, "date_format": "m/d/Y"}'),
('Capital One', 'CAPONE', 'credit_card', '{"date_col": 0, "post_date_col": 1, "description_col": 3, "debit_col": 5, "credit_col": 6, "date_format": "Y-m-d"}'),
('American Express', 'AMEX', 'credit_card', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "m/d/Y"}'),
('Discover', 'DISCOVER', 'credit_card', '{"date_col": 0, "post_date_col": 1, "description_col": 2, "amount_col": 3, "date_format": "m/d/Y"}'),
('Citi Bank', 'CITI', 'bank', '{"date_col": 0, "description_col": 2, "debit_col": 3, "credit_col": 4, "date_format": "m/d/Y"}'),
('Generic CSV', 'GENERIC', 'other', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "Y-m-d"}');

-- Default System Categories
INSERT INTO `categories` (`name`, `slug`, `icon`, `color`, `category_type`, `is_system`, `sort_order`) VALUES
-- Income Categories
('Salary', 'salary', 'briefcase', '#22c55e', 'income', 1, 1),
('Freelance', 'freelance', 'laptop', '#16a34a', 'income', 1, 2),
('Investments', 'investments', 'trending-up', '#15803d', 'income', 1, 3),
('Refunds', 'refunds', 'rotate-ccw', '#14532d', 'income', 1, 4),
('Other Income', 'other-income', 'plus-circle', '#166534', 'income', 1, 5),

-- Expense Categories
('Housing', 'housing', 'home', '#ef4444', 'expense', 1, 10),
('Utilities', 'utilities', 'zap', '#f97316', 'expense', 1, 11),
('Groceries', 'groceries', 'shopping-cart', '#eab308', 'expense', 1, 12),
('Dining', 'dining', 'utensils', '#84cc16', 'expense', 1, 13),
('Transportation', 'transportation', 'car', '#22c55e', 'expense', 1, 14),
('Gas', 'gas', 'fuel', '#14b8a6', 'expense', 1, 15),
('Healthcare', 'healthcare', 'heart', '#06b6d4', 'expense', 1, 16),
('Insurance', 'insurance', 'shield', '#0ea5e9', 'expense', 1, 17),
('Entertainment', 'entertainment', 'film', '#3b82f6', 'expense', 1, 18),
('Shopping', 'shopping', 'shopping-bag', '#6366f1', 'expense', 1, 19),
('Subscriptions', 'subscriptions', 'repeat', '#8b5cf6', 'expense', 1, 20),
('Education', 'education', 'book', '#a855f7', 'expense', 1, 21),
('Personal Care', 'personal-care', 'smile', '#d946ef', 'expense', 1, 22),
('Travel', 'travel', 'plane', '#ec4899', 'expense', 1, 23),
('Gifts', 'gifts', 'gift', '#f43f5e', 'expense', 1, 24),
('Fees & Charges', 'fees', 'alert-circle', '#64748b', 'expense', 1, 25),
('Taxes', 'taxes', 'file-text', '#475569', 'expense', 1, 26),
('Uncategorized', 'uncategorized', 'help-circle', '#94a3b8', 'expense', 1, 99),

-- Transfer Category
('Transfer', 'transfer', 'repeat', '#6b7280', 'transfer', 1, 100);

-- Default Categorization Rules (Global)
INSERT INTO `categorization_rules` (`category_id`, `rule_name`, `match_field`, `match_type`, `match_value`, `priority`) VALUES
-- Groceries
((SELECT id FROM categories WHERE slug = 'groceries'), 'Walmart', 'description', 'contains', 'WALMART', 50),
((SELECT id FROM categories WHERE slug = 'groceries'), 'Target', 'description', 'contains', 'TARGET', 50),
((SELECT id FROM categories WHERE slug = 'groceries'), 'Costco', 'description', 'contains', 'COSTCO', 50),
((SELECT id FROM categories WHERE slug = 'groceries'), 'Kroger', 'description', 'contains', 'KROGER', 50),
((SELECT id FROM categories WHERE slug = 'groceries'), 'Whole Foods', 'description', 'contains', 'WHOLE FOODS', 50),
((SELECT id FROM categories WHERE slug = 'groceries'), 'Trader Joe', 'description', 'contains', 'TRADER JOE', 50),

-- Dining
((SELECT id FROM categories WHERE slug = 'dining'), 'McDonalds', 'description', 'contains', 'MCDONALD', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'Starbucks', 'description', 'contains', 'STARBUCKS', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'Chipotle', 'description', 'contains', 'CHIPOTLE', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'Subway', 'description', 'contains', 'SUBWAY', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'DoorDash', 'description', 'contains', 'DOORDASH', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'UberEats', 'description', 'contains', 'UBER EATS', 50),
((SELECT id FROM categories WHERE slug = 'dining'), 'Grubhub', 'description', 'contains', 'GRUBHUB', 50),

-- Gas
((SELECT id FROM categories WHERE slug = 'gas'), 'Shell', 'description', 'contains', 'SHELL', 50),
((SELECT id FROM categories WHERE slug = 'gas'), 'Exxon', 'description', 'contains', 'EXXON', 50),
((SELECT id FROM categories WHERE slug = 'gas'), 'Chevron', 'description', 'contains', 'CHEVRON', 50),
((SELECT id FROM categories WHERE slug = 'gas'), 'BP', 'description', 'contains', 'BP ', 50),

-- Subscriptions
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'Netflix', 'description', 'contains', 'NETFLIX', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'Spotify', 'description', 'contains', 'SPOTIFY', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'Amazon Prime', 'description', 'contains', 'PRIME VIDEO', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'Disney+', 'description', 'contains', 'DISNEY PLUS', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'HBO Max', 'description', 'contains', 'HBO', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'YouTube Premium', 'description', 'contains', 'YOUTUBE', 50),
((SELECT id FROM categories WHERE slug = 'subscriptions'), 'Apple', 'description', 'contains', 'APPLE.COM/BILL', 50),

-- Shopping
((SELECT id FROM categories WHERE slug = 'shopping'), 'Amazon', 'description', 'contains', 'AMAZON', 60),
((SELECT id FROM categories WHERE slug = 'shopping'), 'Best Buy', 'description', 'contains', 'BEST BUY', 50),
((SELECT id FROM categories WHERE slug = 'shopping'), 'Home Depot', 'description', 'contains', 'HOME DEPOT', 50),
((SELECT id FROM categories WHERE slug = 'shopping'), 'Lowes', 'description', 'contains', 'LOWES', 50),

-- Utilities
((SELECT id FROM categories WHERE slug = 'utilities'), 'Electric', 'description', 'contains', 'ELECTRIC', 50),
((SELECT id FROM categories WHERE slug = 'utilities'), 'Gas Utility', 'description', 'contains', 'GAS COMPANY', 50),
((SELECT id FROM categories WHERE slug = 'utilities'), 'Water', 'description', 'contains', 'WATER', 60),
((SELECT id FROM categories WHERE slug = 'utilities'), 'Internet', 'description', 'contains', 'COMCAST', 50),
((SELECT id FROM categories WHERE slug = 'utilities'), 'AT&T', 'description', 'contains', 'AT&T', 50),
((SELECT id FROM categories WHERE slug = 'utilities'), 'Verizon', 'description', 'contains', 'VERIZON', 50),

-- Transportation
((SELECT id FROM categories WHERE slug = 'transportation'), 'Uber', 'description', 'contains', 'UBER', 60),
((SELECT id FROM categories WHERE slug = 'transportation'), 'Lyft', 'description', 'contains', 'LYFT', 50),

-- Transfers
((SELECT id FROM categories WHERE slug = 'transfer'), 'Zelle', 'description', 'contains', 'ZELLE', 40),
((SELECT id FROM categories WHERE slug = 'transfer'), 'Venmo', 'description', 'contains', 'VENMO', 40),
((SELECT id FROM categories WHERE slug = 'transfer'), 'PayPal Transfer', 'description', 'contains', 'PAYPAL', 50),
((SELECT id FROM categories WHERE slug = 'transfer'), 'Transfer', 'description', 'contains', 'TRANSFER', 70),

-- Fees
((SELECT id FROM categories WHERE slug = 'fees'), 'ATM Fee', 'description', 'contains', 'ATM FEE', 50),
((SELECT id FROM categories WHERE slug = 'fees'), 'Service Fee', 'description', 'contains', 'SERVICE FEE', 50),
((SELECT id FROM categories WHERE slug = 'fees'), 'Overdraft', 'description', 'contains', 'OVERDRAFT', 50),

-- Income
((SELECT id FROM categories WHERE slug = 'salary'), 'Direct Deposit', 'description', 'contains', 'DIRECT DEP', 50),
((SELECT id FROM categories WHERE slug = 'salary'), 'Payroll', 'description', 'contains', 'PAYROLL', 50),
((SELECT id FROM categories WHERE slug = 'refunds'), 'Refund', 'description', 'contains', 'REFUND', 50);

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------
-- Table: receipt_folders
-- -----------------------------------------------------
DROP TABLE IF EXISTS `receipt_folders`;
CREATE TABLE `receipt_folders` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `folder_type` ENUM('custom', 'category') DEFAULT 'custom',
    `category_id` INT UNSIGNED NULL COMMENT 'Link to category for auto-organize',
    `icon` VARCHAR(50) NULL,
    `color` CHAR(7) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_folders_user_name` (`user_id`, `name`),
    KEY `idx_folders_user` (`user_id`),
    KEY `idx_folders_category` (`category_id`),
    CONSTRAINT `fk_folders_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_folders_category` FOREIGN KEY (`category_id`)
        REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: receipts (add folder_id column)
-- Note: If receipts table already exists, use:
-- ALTER TABLE receipts ADD COLUMN folder_id INT UNSIGNED NULL;
-- ALTER TABLE receipts ADD KEY idx_receipts_folder (folder_id);
-- -----------------------------------------------------

-- =====================================================
-- End of Schema
-- =====================================================
