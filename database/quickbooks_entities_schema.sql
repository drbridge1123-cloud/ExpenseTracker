-- =====================================================
-- QuickBooks-Style Entities Schema
-- Master Entity Lists for Check & Deposit System
-- =====================================================

USE `expense_tracker`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------
-- 1. Table: entity_types (Vendor, Customer, Employee, etc.)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `entity_types`;
CREATE TABLE `entity_types` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `type_code` VARCHAR(20) NOT NULL UNIQUE,
    `type_name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_payable` TINYINT(1) DEFAULT 1 COMMENT 'Can receive checks',
    `is_receivable` TINYINT(1) DEFAULT 1 COMMENT 'Can be deposit source',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default entity types
INSERT INTO `entity_types` (`type_code`, `type_name`, `description`, `is_payable`, `is_receivable`) VALUES
('vendor', 'Vendor', 'Suppliers and service providers', 1, 0),
('customer', 'Customer', 'Clients who pay for services', 0, 1),
('employee', 'Employee', 'Staff members', 1, 0),
('provider', 'Provider', 'Service providers (subtype of Vendor)', 1, 0),
('other', 'Other', 'Other entities', 1, 1);

-- -----------------------------------------------------
-- 2. Table: entities (Master Entity List)
-- Vendors, Customers, Employees all in one table
-- -----------------------------------------------------
DROP TABLE IF EXISTS `entities`;
CREATE TABLE `entities` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `entity_type_id` INT UNSIGNED NOT NULL,
    `entity_code` VARCHAR(50) NULL COMMENT 'Internal ID/Code',
    `name` VARCHAR(200) NOT NULL,
    `display_name` VARCHAR(200) NULL COMMENT 'Name as printed on checks',
    `company_name` VARCHAR(200) NULL,

    -- Contact Information
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `fax` VARCHAR(20) NULL,
    `website` VARCHAR(255) NULL,

    -- Address (for check printing)
    `address_line1` VARCHAR(255) NULL,
    `address_line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(50) NULL,
    `zip_code` VARCHAR(20) NULL,
    `country` VARCHAR(50) DEFAULT 'USA',

    -- Banking (for direct deposit/ACH)
    `bank_name` VARCHAR(100) NULL,
    `bank_routing` VARCHAR(20) NULL,
    `bank_account` VARCHAR(50) NULL,
    `payment_method` ENUM('check', 'ach', 'wire', 'cash', 'other') DEFAULT 'check',

    -- Defaults
    `default_account_id` INT UNSIGNED NULL COMMENT 'Default expense account',
    `default_category_id` INT UNSIGNED NULL COMMENT 'Default category',
    `default_memo` VARCHAR(255) NULL,

    -- Tax Information
    `tax_id` VARCHAR(20) NULL COMMENT 'SSN or EIN',
    `is_1099` TINYINT(1) DEFAULT 0,

    -- Status
    `is_active` TINYINT(1) DEFAULT 1,
    `notes` TEXT NULL,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_entities_user` (`user_id`),
    KEY `idx_entities_type` (`entity_type_id`),
    KEY `idx_entities_name` (`name`),
    KEY `idx_entities_code` (`entity_code`),
    KEY `idx_entities_active` (`is_active`),
    FULLTEXT KEY `ft_entities_search` (`name`, `display_name`, `company_name`),
    CONSTRAINT `fk_entities_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_entities_type` FOREIGN KEY (`entity_type_id`)
        REFERENCES `entity_types` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 3. Table: cases (Case/Matter Tracking)
-- Links transactions to specific cases/matters
-- -----------------------------------------------------
DROP TABLE IF EXISTS `cases`;
CREATE TABLE `cases` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `case_number` VARCHAR(50) NOT NULL,
    `case_name` VARCHAR(255) NOT NULL,
    `client_id` INT UNSIGNED NULL COMMENT 'Link to trust_clients or entities',
    `entity_id` INT UNSIGNED NULL COMMENT 'Associated entity (customer)',
    `description` TEXT NULL,
    `status` ENUM('open', 'pending', 'closed', 'archived') DEFAULT 'open',
    `opened_date` DATE NULL,
    `closed_date` DATE NULL,
    `notes` TEXT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_cases_number` (`user_id`, `case_number`),
    KEY `idx_cases_user` (`user_id`),
    KEY `idx_cases_client` (`client_id`),
    KEY `idx_cases_entity` (`entity_id`),
    KEY `idx_cases_status` (`status`),
    CONSTRAINT `fk_cases_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 4. Table: trust_checks (Enhanced for QuickBooks workflow)
-- Add entity reference and print tracking
-- -----------------------------------------------------
ALTER TABLE `trust_checks`
    ADD COLUMN `entity_id` INT UNSIGNED NULL AFTER `payee`,
    ADD COLUMN `case_id` INT UNSIGNED NULL AFTER `entity_id`,
    ADD COLUMN `category_id` INT UNSIGNED NULL AFTER `case_id`,
    ADD COLUMN `print_status` ENUM('not_printed', 'printed', 'reprinted', 'cancelled') DEFAULT 'not_printed' AFTER `status`,
    ADD COLUMN `printed_at` TIMESTAMP NULL AFTER `print_status`,
    ADD COLUMN `printed_by` INT UNSIGNED NULL AFTER `printed_at`,
    ADD COLUMN `registered_at` TIMESTAMP NULL AFTER `printed_by`,
    ADD COLUMN `payee_address` TEXT NULL AFTER `payee`,
    ADD KEY `idx_checks_entity` (`entity_id`),
    ADD KEY `idx_checks_case` (`case_id`),
    ADD KEY `idx_checks_print_status` (`print_status`);

-- -----------------------------------------------------
-- 5. Table: check_print_queue (Pre-print staging)
-- Checks are staged here before printing, NOT registered
-- -----------------------------------------------------
DROP TABLE IF EXISTS `check_print_queue`;
CREATE TABLE `check_print_queue` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `ledger_id` INT UNSIGNED NOT NULL,
    `entity_id` INT UNSIGNED NULL,
    `case_id` INT UNSIGNED NULL,
    `category_id` INT UNSIGNED NULL,

    -- Check Details
    `check_number` VARCHAR(20) NOT NULL,
    `payee_name` VARCHAR(200) NOT NULL,
    `payee_address` TEXT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `amount_words` VARCHAR(255) NULL COMMENT 'Amount in words',
    `check_date` DATE NOT NULL,
    `memo` VARCHAR(255) NULL,

    -- Print Tracking
    `queue_status` ENUM('queued', 'previewing', 'printing', 'printed', 'confirmed', 'cancelled') DEFAULT 'queued',
    `preview_generated_at` TIMESTAMP NULL,
    `print_attempted_at` TIMESTAMP NULL,
    `print_completed_at` TIMESTAMP NULL,
    `confirmed_at` TIMESTAMP NULL,
    `cancelled_at` TIMESTAMP NULL,
    `cancel_reason` VARCHAR(255) NULL,

    -- Final Registration
    `is_registered` TINYINT(1) DEFAULT 0,
    `registered_check_id` INT UNSIGNED NULL COMMENT 'Links to trust_checks after registration',
    `registered_at` TIMESTAMP NULL,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_print_queue_user` (`user_id`),
    KEY `idx_print_queue_status` (`queue_status`),
    KEY `idx_print_queue_registered` (`is_registered`),
    CONSTRAINT `fk_print_queue_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 6. Table: deposits (Enhanced with entity tracking)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_deposits`;
CREATE TABLE `trust_deposits` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `ledger_id` INT UNSIGNED NOT NULL,
    `entity_id` INT UNSIGNED NULL COMMENT 'Source entity (who deposited)',
    `case_id` INT UNSIGNED NULL,
    `category_id` INT UNSIGNED NULL,

    -- Deposit Details
    `deposit_date` DATE NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `deposit_type` ENUM('cash', 'check', 'wire', 'ach', 'other') DEFAULT 'check',
    `reference_number` VARCHAR(50) NULL,
    `memo` VARCHAR(255) NULL,
    `description` TEXT NULL,

    -- Check Details (if deposit type is check)
    `check_number` VARCHAR(20) NULL,
    `check_bank` VARCHAR(100) NULL,
    `check_date` DATE NULL,

    -- Status
    `status` ENUM('pending', 'cleared', 'returned') DEFAULT 'pending',
    `cleared_date` DATE NULL,

    -- Transaction Link
    `transaction_id` INT UNSIGNED NULL COMMENT 'Link to trust_transactions',

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_deposits_user` (`user_id`),
    KEY `idx_deposits_ledger` (`ledger_id`),
    KEY `idx_deposits_entity` (`entity_id`),
    KEY `idx_deposits_case` (`case_id`),
    KEY `idx_deposits_date` (`deposit_date`),
    KEY `idx_deposits_status` (`status`),
    CONSTRAINT `fk_deposits_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_deposits_ledger` FOREIGN KEY (`ledger_id`)
        REFERENCES `trust_ledger` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 7. Update trust_transactions with entity/case references
-- -----------------------------------------------------
ALTER TABLE `trust_transactions`
    ADD COLUMN `entity_id` INT UNSIGNED NULL AFTER `payee`,
    ADD COLUMN `case_id` INT UNSIGNED NULL AFTER `entity_id`,
    ADD COLUMN `category_id` INT UNSIGNED NULL AFTER `case_id`,
    ADD KEY `idx_trust_trans_entity` (`entity_id`),
    ADD KEY `idx_trust_trans_case` (`case_id`);

-- -----------------------------------------------------
-- 8. Check Number Sequence (per bank account)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `check_sequences`;
CREATE TABLE `check_sequences` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `last_check_number` INT UNSIGNED DEFAULT 1000,
    `prefix` VARCHAR(10) NULL,
    `suffix` VARCHAR(10) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_check_seq_account` (`user_id`, `account_id`),
    CONSTRAINT `fk_check_seq_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- End of QuickBooks Entities Schema
-- =====================================================
