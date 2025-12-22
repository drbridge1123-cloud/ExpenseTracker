-- =====================================================
-- IOLTA (Interest on Lawyers Trust Accounts) Schema
-- Extension for expense_tracker database
-- =====================================================

USE `expense_tracker`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------
-- 1. Extend accounts table with trust/iolta types
-- -----------------------------------------------------
ALTER TABLE `accounts`
MODIFY `account_type` ENUM('checking', 'savings', 'credit_card',
    'investment', 'cash', 'loan', 'trust', 'iolta', 'other') NOT NULL;

-- -----------------------------------------------------
-- 2. Table: trust_clients (Clients/Matters)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_clients`;
CREATE TABLE `trust_clients` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `client_number` VARCHAR(50) NULL COMMENT 'Internal client ID',
    `client_name` VARCHAR(200) NOT NULL,
    `matter_number` VARCHAR(50) NULL COMMENT 'Case/Matter number',
    `matter_description` VARCHAR(500) NULL,
    `contact_email` VARCHAR(255) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `address` TEXT NULL,
    `notes` TEXT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_trust_clients_user` (`user_id`),
    UNIQUE KEY `uk_trust_clients_matter` (`user_id`, `matter_number`),
    KEY `idx_trust_clients_name` (`client_name`),
    CONSTRAINT `fk_trust_clients_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 3. Table: trust_ledger (Client Sub-Ledgers)
-- Each client has a sub-ledger within a trust account
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_ledger`;
CREATE TABLE `trust_ledger` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL COMMENT 'IOLTA/Trust bank account',
    `client_id` INT UNSIGNED NOT NULL,
    `current_balance` DECIMAL(15,2) DEFAULT 0.00,
    `minimum_balance` DECIMAL(15,2) DEFAULT 0.00 COMMENT 'Alert if below this',
    `is_active` TINYINT(1) DEFAULT 1,
    `opened_at` DATE NULL,
    `closed_at` DATE NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_trust_ledger_client` (`account_id`, `client_id`),
    KEY `idx_trust_ledger_user` (`user_id`),
    KEY `idx_trust_ledger_balance` (`current_balance`),
    CONSTRAINT `fk_trust_ledger_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_trust_ledger_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_trust_ledger_client` FOREIGN KEY (`client_id`)
        REFERENCES `trust_clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 4. Table: trust_transactions (Client Ledger Entries)
-- Records all movements in client sub-ledgers
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_transactions`;
CREATE TABLE `trust_transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `ledger_id` INT UNSIGNED NOT NULL,
    `transaction_id` INT UNSIGNED NULL COMMENT 'Link to main bank transaction',
    `transaction_type` ENUM(
        'deposit',           -- Client funds received
        'disbursement',      -- Payment on behalf of client
        'transfer_in',       -- Transfer from another client ledger
        'transfer_out',      -- Transfer to another client ledger
        'earned_fee',        -- Fee transfer to operating account
        'refund',            -- Refund to client
        'interest',          -- Interest earned (rare for IOLTA)
        'adjustment'         -- Manual adjustment
    ) NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL COMMENT 'Positive for deposits, negative for withdrawals',
    `running_balance` DECIMAL(15,2) NOT NULL COMMENT 'Balance after this transaction',
    `description` VARCHAR(500) NOT NULL,
    `payee` VARCHAR(200) NULL COMMENT 'For disbursements',
    `reference_number` VARCHAR(50) NULL COMMENT 'Check number, wire reference, etc.',
    `check_number` VARCHAR(20) NULL,
    `transaction_date` DATE NOT NULL,
    `cleared_date` DATE NULL,
    `memo` TEXT NULL,
    `related_transaction_id` INT UNSIGNED NULL COMMENT 'For transfers between ledgers',
    `created_by` INT UNSIGNED NULL COMMENT 'User who created this entry',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_trust_trans_ledger` (`ledger_id`),
    KEY `idx_trust_trans_date` (`transaction_date`),
    KEY `idx_trust_trans_type` (`transaction_type`),
    KEY `idx_trust_trans_transaction` (`transaction_id`),
    CONSTRAINT `fk_trust_trans_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_trust_trans_ledger` FOREIGN KEY (`ledger_id`)
        REFERENCES `trust_ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_trust_trans_transaction` FOREIGN KEY (`transaction_id`)
        REFERENCES `transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 5. Table: trust_reconciliations (3-Way Reconciliation)
-- Must balance: Bank Statement = Book Balance = Sum of Client Ledgers
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_reconciliations`;
CREATE TABLE `trust_reconciliations` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL,
    `reconciliation_date` DATE NOT NULL,
    `statement_date` DATE NOT NULL,

    -- The 3-way balance
    `bank_balance` DECIMAL(15,2) NOT NULL COMMENT 'Per bank statement',
    `book_balance` DECIMAL(15,2) NOT NULL COMMENT 'Per accounting records',
    `client_ledger_total` DECIMAL(15,2) NOT NULL COMMENT 'Sum of all client ledgers',

    -- Outstanding items
    `deposits_in_transit` DECIMAL(15,2) DEFAULT 0.00,
    `outstanding_checks` DECIMAL(15,2) DEFAULT 0.00,
    `adjusted_bank_balance` DECIMAL(15,2) NULL COMMENT 'Bank + deposits - checks',

    -- Results
    `is_balanced` TINYINT(1) DEFAULT 0,
    `difference` DECIMAL(15,2) NULL,
    `notes` TEXT NULL,

    -- Status tracking
    `status` ENUM('draft', 'completed', 'reviewed', 'archived') DEFAULT 'draft',
    `completed_at` TIMESTAMP NULL,
    `reviewed_by` VARCHAR(100) NULL,
    `reviewed_at` TIMESTAMP NULL,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_trust_recon_account` (`account_id`),
    KEY `idx_trust_recon_date` (`reconciliation_date`),
    KEY `idx_trust_recon_status` (`status`),
    CONSTRAINT `fk_trust_recon_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_trust_recon_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 6. Table: trust_reconciliation_items
-- Individual items in a reconciliation (outstanding checks, etc.)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_reconciliation_items`;
CREATE TABLE `trust_reconciliation_items` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `reconciliation_id` INT UNSIGNED NOT NULL,
    `item_type` ENUM('outstanding_check', 'deposit_in_transit', 'adjustment', 'other') NOT NULL,
    `transaction_id` INT UNSIGNED NULL,
    `trust_transaction_id` INT UNSIGNED NULL,
    `description` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `item_date` DATE NULL,
    `reference_number` VARCHAR(50) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_recon_items_recon` (`reconciliation_id`),
    CONSTRAINT `fk_recon_items_recon` FOREIGN KEY (`reconciliation_id`)
        REFERENCES `trust_reconciliations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 7. Table: trust_audit_log
-- Detailed audit trail for compliance (required by bar associations)
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_audit_log`;
CREATE TABLE `trust_audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `action` ENUM(
        'ledger_created', 'ledger_updated', 'ledger_closed',
        'deposit', 'disbursement', 'transfer', 'fee_withdrawal',
        'reconciliation_started', 'reconciliation_completed',
        'client_created', 'client_updated',
        'balance_adjustment'
    ) NOT NULL,
    `entity_type` VARCHAR(50) NOT NULL COMMENT 'trust_ledger, trust_transaction, etc.',
    `entity_id` INT UNSIGNED NOT NULL,
    `client_id` INT UNSIGNED NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `description` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_trust_audit_user` (`user_id`),
    KEY `idx_trust_audit_entity` (`entity_type`, `entity_id`),
    KEY `idx_trust_audit_client` (`client_id`),
    KEY `idx_trust_audit_action` (`action`),
    KEY `idx_trust_audit_date` (`created_at`),
    CONSTRAINT `fk_trust_audit_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- End of IOLTA Schema
-- =====================================================
