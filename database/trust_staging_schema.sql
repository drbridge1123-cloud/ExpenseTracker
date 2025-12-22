-- =====================================================
-- Trust Staging Schema
-- Implements 3-stage workflow: Unassigned → Assigned → Posted
-- =====================================================

USE `expense_tracker`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------
-- 1. Table: trust_staging (Imported transactions before posting)
-- This is the "holding area" - NOT accounting yet
-- -----------------------------------------------------
DROP TABLE IF EXISTS `trust_staging`;
CREATE TABLE `trust_staging` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL COMMENT 'IOLTA bank account',

    -- Transaction data from CSV import
    `transaction_date` DATE NOT NULL,
    `transaction_type` ENUM('deposit', 'check', 'transfer', 'fee', 'other') NOT NULL DEFAULT 'other',
    `amount` DECIMAL(15,2) NOT NULL COMMENT 'Positive for deposits, negative for withdrawals',
    `description` VARCHAR(500) NOT NULL,
    `reference_number` VARCHAR(50) NULL COMMENT 'Check number, wire reference',
    `payee` VARCHAR(200) NULL,
    `memo` TEXT NULL,

    -- Original CSV data (preserved for audit)
    `original_csv_row` JSON NULL COMMENT 'Original row data from CSV',
    `import_batch_id` VARCHAR(50) NULL COMMENT 'Batch ID for grouping imports',
    `csv_row_number` INT NULL,

    -- Staging workflow status
    `status` ENUM('unassigned', 'assigned', 'posted', 'rejected') NOT NULL DEFAULT 'unassigned',

    -- Case assignment (filled when status = 'assigned')
    `client_id` INT UNSIGNED NULL COMMENT 'Assigned client/case',
    `assigned_at` TIMESTAMP NULL,
    `assigned_by` INT UNSIGNED NULL,

    -- Posting info (filled when status = 'posted')
    `posted_at` TIMESTAMP NULL,
    `posted_by` INT UNSIGNED NULL,
    `posted_transaction_id` INT UNSIGNED NULL COMMENT 'Link to trust_transactions after posting',

    -- Rejection info (if rejected)
    `rejected_at` TIMESTAMP NULL,
    `rejected_by` INT UNSIGNED NULL,
    `rejection_reason` VARCHAR(500) NULL,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_staging_user` (`user_id`),
    KEY `idx_staging_account` (`account_id`),
    KEY `idx_staging_status` (`status`),
    KEY `idx_staging_client` (`client_id`),
    KEY `idx_staging_date` (`transaction_date`),
    KEY `idx_staging_batch` (`import_batch_id`),

    CONSTRAINT `fk_staging_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_staging_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_staging_client` FOREIGN KEY (`client_id`)
        REFERENCES `trust_clients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 2. Update trust_transactions to track posting source
-- -----------------------------------------------------
ALTER TABLE `trust_transactions`
ADD COLUMN IF NOT EXISTS `staging_id` INT UNSIGNED NULL COMMENT 'Source staging record' AFTER `transaction_id`,
ADD COLUMN IF NOT EXISTS `is_posted` TINYINT(1) DEFAULT 1 COMMENT 'True if affects account balance' AFTER `staging_id`;

-- Add index for staging reference
-- ALTER TABLE `trust_transactions`
-- ADD KEY `idx_trust_trans_staging` (`staging_id`);

-- -----------------------------------------------------
-- 3. View: Staging Summary by Status
-- -----------------------------------------------------
DROP VIEW IF EXISTS `v_trust_staging_summary`;
CREATE VIEW `v_trust_staging_summary` AS
SELECT
    s.user_id,
    s.account_id,
    s.status,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN s.amount > 0 THEN s.amount ELSE 0 END) as total_deposits,
    SUM(CASE WHEN s.amount < 0 THEN ABS(s.amount) ELSE 0 END) as total_withdrawals,
    SUM(s.amount) as net_amount
FROM trust_staging s
GROUP BY s.user_id, s.account_id, s.status;

-- -----------------------------------------------------
-- 4. View: Unassigned Transactions
-- -----------------------------------------------------
DROP VIEW IF EXISTS `v_trust_unassigned`;
CREATE VIEW `v_trust_unassigned` AS
SELECT
    s.*,
    a.account_name
FROM trust_staging s
JOIN accounts a ON s.account_id = a.id
WHERE s.status = 'unassigned';

-- -----------------------------------------------------
-- 5. View: Assigned but not Posted
-- -----------------------------------------------------
DROP VIEW IF EXISTS `v_trust_assigned`;
CREATE VIEW `v_trust_assigned` AS
SELECT
    s.*,
    a.account_name,
    c.client_name,
    c.matter_number
FROM trust_staging s
JOIN accounts a ON s.account_id = a.id
LEFT JOIN trust_clients c ON s.client_id = c.id
WHERE s.status = 'assigned';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- End of Trust Staging Schema
-- =====================================================
