-- =====================================================
-- Multi-Account Type Support Schema
-- Extension for Personal, IOLTA, General, Cost accounts
-- =====================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

USE `expense_tracker`;

-- -----------------------------------------------------
-- Table: user_account_types
-- Tracks which account types are enabled for each user
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_account_types` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_type` ENUM('personal', 'iolta', 'general', 'cost') NOT NULL,
    `is_enabled` TINYINT(1) DEFAULT 1,
    `is_default` TINYINT(1) DEFAULT 0,
    `settings` JSON NULL COMMENT 'Type-specific settings',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_account_type` (`user_id`, `account_type`),
    KEY `idx_uat_user` (`user_id`),
    CONSTRAINT `fk_uat_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- GENERAL ACCOUNT TABLES
-- For business expense tracking with project allocation
-- =====================================================

-- -----------------------------------------------------
-- Table: general_projects
-- Projects/Jobs for expense allocation
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `general_projects` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `project_number` VARCHAR(50) NULL,
    `project_name` VARCHAR(200) NOT NULL,
    `client_name` VARCHAR(200) NULL,
    `client_email` VARCHAR(255) NULL,
    `status` ENUM('active', 'completed', 'on_hold', 'cancelled') DEFAULT 'active',
    `budget` DECIMAL(15,2) NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `description` TEXT NULL,
    `notes` TEXT NULL,
    `is_billable` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_general_projects_number` (`user_id`, `project_number`),
    KEY `idx_general_projects_user` (`user_id`),
    KEY `idx_general_projects_status` (`status`),
    CONSTRAINT `fk_general_projects_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: general_accounts
-- Bank accounts for General Account type
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `general_accounts` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `institution_id` INT UNSIGNED NULL,
    `account_name` VARCHAR(100) NOT NULL,
    `account_type` ENUM('checking', 'savings', 'credit_card', 'cash', 'other') NOT NULL,
    `account_number_last4` CHAR(4) NULL,
    `currency` CHAR(3) DEFAULT 'USD',
    `current_balance` DECIMAL(15,2) DEFAULT 0.00,
    `credit_limit` DECIMAL(15,2) NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `color` CHAR(7) NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_general_accounts_user` (`user_id`),
    CONSTRAINT `fk_general_accounts_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: general_categories
-- Categories specific to General Account
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `general_categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NULL COMMENT 'NULL for system categories',
    `parent_id` INT UNSIGNED NULL,
    `name` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `icon` VARCHAR(50) NULL,
    `color` CHAR(7) NULL,
    `category_type` ENUM('income', 'expense', 'transfer', 'other') DEFAULT 'expense',
    `is_billable` TINYINT(1) DEFAULT 0,
    `is_system` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_general_categories_slug` (`slug`, `user_id`),
    KEY `idx_general_categories_user` (`user_id`),
    KEY `idx_general_categories_parent` (`parent_id`),
    CONSTRAINT `fk_general_categories_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_general_categories_parent` FOREIGN KEY (`parent_id`)
        REFERENCES `general_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: general_transactions
-- Transactions for General Account with project allocation
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `general_transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL,
    `project_id` INT UNSIGNED NULL,
    `transaction_date` DATE NOT NULL,
    `post_date` DATE NULL,
    `description` VARCHAR(500) NOT NULL,
    `original_description` VARCHAR(500) NULL,
    `vendor_name` VARCHAR(200) NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `currency` CHAR(3) DEFAULT 'USD',
    `transaction_type` ENUM('debit', 'credit', 'transfer', 'adjustment') NOT NULL,
    `is_billable` TINYINT(1) DEFAULT 0,
    `allocation_percentage` DECIMAL(5,2) DEFAULT 100.00,
    `status` ENUM('pending', 'posted', 'reconciled', 'void') DEFAULT 'posted',
    `check_number` VARCHAR(20) NULL,
    `reference_number` VARCHAR(50) NULL,
    `memo` TEXT NULL,
    `tags` JSON NULL,
    `import_hash` CHAR(64) NULL,
    `import_batch_id` INT UNSIGNED NULL,
    `is_reviewed` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_general_transactions_hash` (`import_hash`),
    KEY `idx_general_trans_user` (`user_id`),
    KEY `idx_general_trans_account` (`account_id`),
    KEY `idx_general_trans_category` (`category_id`),
    KEY `idx_general_trans_project` (`project_id`),
    KEY `idx_general_trans_date` (`transaction_date`),
    CONSTRAINT `fk_general_trans_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_general_trans_account` FOREIGN KEY (`account_id`)
        REFERENCES `general_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_general_trans_category` FOREIGN KEY (`category_id`)
        REFERENCES `general_categories` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_general_trans_project` FOREIGN KEY (`project_id`)
        REFERENCES `general_projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: general_budgets
-- Project-based budgets for General Account
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `general_budgets` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL,
    `project_id` INT UNSIGNED NULL,
    `budget_name` VARCHAR(100) NULL,
    `budget_type` ENUM('monthly', 'project', 'yearly', 'custom') DEFAULT 'monthly',
    `amount` DECIMAL(15,2) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `alert_threshold` DECIMAL(5,2) DEFAULT 80.00,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_general_budgets_user` (`user_id`),
    KEY `idx_general_budgets_project` (`project_id`),
    CONSTRAINT `fk_general_budgets_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_general_budgets_category` FOREIGN KEY (`category_id`)
        REFERENCES `general_categories` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_general_budgets_project` FOREIGN KEY (`project_id`)
        REFERENCES `general_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- COST ACCOUNT TABLES
-- For client billing and cost tracking
-- =====================================================

-- -----------------------------------------------------
-- Table: cost_clients
-- Clients for billing purposes
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_clients` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `client_number` VARCHAR(50) NULL,
    `client_name` VARCHAR(200) NOT NULL,
    `contact_name` VARCHAR(100) NULL,
    `contact_email` VARCHAR(255) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `billing_address` TEXT NULL,
    `billing_rate` DECIMAL(10,2) NULL COMMENT 'Hourly or default rate',
    `retainer_amount` DECIMAL(15,2) NULL,
    `retainer_balance` DECIMAL(15,2) DEFAULT 0.00,
    `payment_terms` VARCHAR(50) DEFAULT 'Net 30',
    `tax_id` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_cost_clients_number` (`user_id`, `client_number`),
    KEY `idx_cost_clients_user` (`user_id`),
    KEY `idx_cost_clients_active` (`is_active`),
    CONSTRAINT `fk_cost_clients_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: cost_accounts
-- Bank accounts for Cost Account type
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_accounts` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `institution_id` INT UNSIGNED NULL,
    `account_name` VARCHAR(100) NOT NULL,
    `account_type` ENUM('checking', 'savings', 'credit_card', 'cash', 'other') NOT NULL,
    `account_number_last4` CHAR(4) NULL,
    `currency` CHAR(3) DEFAULT 'USD',
    `current_balance` DECIMAL(15,2) DEFAULT 0.00,
    `credit_limit` DECIMAL(15,2) NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `color` CHAR(7) NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_cost_accounts_user` (`user_id`),
    CONSTRAINT `fk_cost_accounts_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: cost_categories
-- Categories for Cost Account with markup support
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_categories` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NULL,
    `parent_id` INT UNSIGNED NULL,
    `name` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `icon` VARCHAR(50) NULL,
    `color` CHAR(7) NULL,
    `category_type` ENUM('income', 'expense', 'transfer', 'other') DEFAULT 'expense',
    `markup_percentage` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Default markup for billing',
    `is_system` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_cost_categories_slug` (`slug`, `user_id`),
    KEY `idx_cost_categories_user` (`user_id`),
    KEY `idx_cost_categories_parent` (`parent_id`),
    CONSTRAINT `fk_cost_categories_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cost_categories_parent` FOREIGN KEY (`parent_id`)
        REFERENCES `cost_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: cost_transactions
-- Cost transactions with billing status tracking
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NULL,
    `client_id` INT UNSIGNED NULL,
    `invoice_id` INT UNSIGNED NULL,
    `transaction_date` DATE NOT NULL,
    `post_date` DATE NULL,
    `description` VARCHAR(500) NOT NULL,
    `original_description` VARCHAR(500) NULL,
    `vendor_name` VARCHAR(200) NULL,
    `amount` DECIMAL(15,2) NOT NULL COMMENT 'Actual cost',
    `billable_amount` DECIMAL(15,2) NULL COMMENT 'Amount to bill (with markup)',
    `markup_percentage` DECIMAL(5,2) DEFAULT 0.00,
    `currency` CHAR(3) DEFAULT 'USD',
    `transaction_type` ENUM('debit', 'credit', 'transfer', 'adjustment') NOT NULL,
    `billing_status` ENUM('unbilled', 'billed', 'paid', 'write_off', 'non_billable') DEFAULT 'unbilled',
    `billed_date` DATE NULL,
    `paid_date` DATE NULL,
    `status` ENUM('pending', 'posted', 'reconciled', 'void') DEFAULT 'posted',
    `check_number` VARCHAR(20) NULL,
    `reference_number` VARCHAR(50) NULL,
    `memo` TEXT NULL,
    `tags` JSON NULL,
    `import_hash` CHAR(64) NULL,
    `import_batch_id` INT UNSIGNED NULL,
    `is_reviewed` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_cost_transactions_hash` (`import_hash`),
    KEY `idx_cost_trans_user` (`user_id`),
    KEY `idx_cost_trans_account` (`account_id`),
    KEY `idx_cost_trans_category` (`category_id`),
    KEY `idx_cost_trans_client` (`client_id`),
    KEY `idx_cost_trans_invoice` (`invoice_id`),
    KEY `idx_cost_trans_date` (`transaction_date`),
    KEY `idx_cost_trans_billing` (`billing_status`),
    CONSTRAINT `fk_cost_trans_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cost_trans_account` FOREIGN KEY (`account_id`)
        REFERENCES `cost_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cost_trans_category` FOREIGN KEY (`category_id`)
        REFERENCES `cost_categories` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_cost_trans_client` FOREIGN KEY (`client_id`)
        REFERENCES `cost_clients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table: cost_invoices
-- Invoices generated from cost transactions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_invoices` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `client_id` INT UNSIGNED NOT NULL,
    `invoice_number` VARCHAR(50) NOT NULL,
    `invoice_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `tax_rate` DECIMAL(5,2) DEFAULT 0.00,
    `tax_amount` DECIMAL(15,2) DEFAULT 0.00,
    `discount_amount` DECIMAL(15,2) DEFAULT 0.00,
    `total` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `amount_paid` DECIMAL(15,2) DEFAULT 0.00,
    `balance_due` DECIMAL(15,2) AS (`total` - `amount_paid`) STORED,
    `status` ENUM('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled', 'write_off') DEFAULT 'draft',
    `notes` TEXT NULL,
    `terms` TEXT NULL,
    `sent_at` TIMESTAMP NULL,
    `paid_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_cost_invoices_number` (`user_id`, `invoice_number`),
    KEY `idx_cost_invoices_user` (`user_id`),
    KEY `idx_cost_invoices_client` (`client_id`),
    KEY `idx_cost_invoices_status` (`status`),
    KEY `idx_cost_invoices_date` (`invoice_date`),
    CONSTRAINT `fk_cost_invoices_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cost_invoices_client` FOREIGN KEY (`client_id`)
        REFERENCES `cost_clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key for cost_transactions.invoice_id after cost_invoices table exists
ALTER TABLE `cost_transactions`
    ADD CONSTRAINT `fk_cost_trans_invoice` FOREIGN KEY (`invoice_id`)
        REFERENCES `cost_invoices` (`id`) ON DELETE SET NULL;

-- -----------------------------------------------------
-- Table: cost_invoice_payments
-- Payment records for invoices
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_invoice_payments` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `invoice_id` INT UNSIGNED NOT NULL,
    `payment_date` DATE NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `payment_method` ENUM('cash', 'check', 'credit_card', 'bank_transfer', 'other') DEFAULT 'check',
    `reference_number` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_invoice_payments_invoice` (`invoice_id`),
    CONSTRAINT `fk_invoice_payments_invoice` FOREIGN KEY (`invoice_id`)
        REFERENCES `cost_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Default General Account Categories
INSERT INTO `general_categories` (`name`, `slug`, `icon`, `color`, `category_type`, `is_system`, `sort_order`) VALUES
-- Income
('Revenue', 'revenue', 'dollar-sign', '#22c55e', 'income', 1, 1),
('Consulting Fees', 'consulting-fees', 'briefcase', '#16a34a', 'income', 1, 2),
('Project Income', 'project-income', 'folder', '#15803d', 'income', 1, 3),
-- Expenses
('Office Supplies', 'office-supplies', 'paperclip', '#ef4444', 'expense', 1, 10),
('Software & Tools', 'software-tools', 'code', '#f97316', 'expense', 1, 11),
('Professional Services', 'professional-services', 'users', '#eab308', 'expense', 1, 12),
('Marketing', 'marketing', 'megaphone', '#84cc16', 'expense', 1, 13),
('Travel & Entertainment', 'travel-entertainment', 'plane', '#22c55e', 'expense', 1, 14),
('Utilities', 'utilities', 'zap', '#14b8a6', 'expense', 1, 15),
('Insurance', 'insurance', 'shield', '#06b6d4', 'expense', 1, 16),
('Rent', 'rent', 'home', '#0ea5e9', 'expense', 1, 17),
('Payroll', 'payroll', 'users', '#3b82f6', 'expense', 1, 18),
('Taxes', 'taxes', 'file-text', '#6366f1', 'expense', 1, 19),
('Miscellaneous', 'miscellaneous', 'more-horizontal', '#8b5cf6', 'expense', 1, 20),
('Uncategorized', 'uncategorized', 'help-circle', '#94a3b8', 'expense', 1, 99),
-- Transfer
('Transfer', 'transfer', 'repeat', '#6b7280', 'transfer', 1, 100);

-- Default Cost Account Categories
INSERT INTO `cost_categories` (`name`, `slug`, `icon`, `color`, `category_type`, `markup_percentage`, `is_system`, `sort_order`) VALUES
-- Income (from billing)
('Billable Costs', 'billable-costs', 'dollar-sign', '#22c55e', 'income', 0.00, 1, 1),
('Service Fees', 'service-fees', 'briefcase', '#16a34a', 'income', 0.00, 1, 2),
-- Expenses (costs to track)
('Filing Fees', 'filing-fees', 'file-text', '#ef4444', 'expense', 0.00, 1, 10),
('Court Costs', 'court-costs', 'scale', '#f97316', 'expense', 0.00, 1, 11),
('Expert Witnesses', 'expert-witnesses', 'user-check', '#eab308', 'expense', 15.00, 1, 12),
('Deposition Costs', 'deposition-costs', 'mic', '#84cc16', 'expense', 10.00, 1, 13),
('Research Services', 'research-services', 'search', '#22c55e', 'expense', 10.00, 1, 14),
('Document Services', 'document-services', 'file', '#14b8a6', 'expense', 5.00, 1, 15),
('Travel Expenses', 'travel-expenses', 'map-pin', '#06b6d4', 'expense', 0.00, 1, 16),
('Postage & Delivery', 'postage-delivery', 'send', '#0ea5e9', 'expense', 0.00, 1, 17),
('Copies & Printing', 'copies-printing', 'printer', '#3b82f6', 'expense', 0.00, 1, 18),
('Miscellaneous Costs', 'miscellaneous-costs', 'more-horizontal', '#6366f1', 'expense', 0.00, 1, 19),
('Uncategorized', 'uncategorized', 'help-circle', '#94a3b8', 'expense', 0.00, 1, 99),
-- Transfer
('Transfer', 'transfer', 'repeat', '#6b7280', 'transfer', 0.00, 1, 100);

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- End of Multi-Account Schema
-- =====================================================
