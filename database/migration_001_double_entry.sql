-- =====================================================
-- Migration 001: Double-Entry Bookkeeping Foundation
-- Phase 1 of Accounting System Refactor
--
-- This migration adds:
-- 1. ledger_entries - Immutable double-entry ledger
-- 2. Enhanced audit_log - Better change tracking
-- 3. accounts update - Add account_class for proper accounting
-- =====================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------
-- Step 1: Add account_class to accounts table
-- This enables proper Chart of Accounts classification
-- -----------------------------------------------------
ALTER TABLE `accounts`
ADD COLUMN `account_class` ENUM('asset', 'liability', 'equity', 'income', 'expense')
    DEFAULT NULL AFTER `account_type`,
ADD COLUMN `account_code` VARCHAR(20) DEFAULT NULL AFTER `account_class`,
ADD COLUMN `is_system` TINYINT(1) DEFAULT 0 AFTER `is_active`;

-- Update existing accounts to have proper account_class
UPDATE `accounts` SET `account_class` = 'asset'
WHERE `account_type` IN ('checking', 'savings', 'investment', 'cash');

UPDATE `accounts` SET `account_class` = 'liability'
WHERE `account_type` IN ('credit_card', 'loan');

-- -----------------------------------------------------
-- Step 2: Create ledger_entries table
-- This is the core double-entry bookkeeping table
-- KEY PRINCIPLE: INSERT ONLY - NEVER UPDATE OR DELETE
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `ledger_entries` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,

    -- Journal Entry grouping (all entries with same journal_id must balance)
    `journal_id` CHAR(36) NOT NULL COMMENT 'UUID to group debit/credit pairs',
    `journal_date` DATE NOT NULL COMMENT 'Effective date of the entry',
    `journal_type` ENUM(
        'standard',      -- Normal transaction
        'adjustment',    -- Adjusting entry
        'reversal',      -- Reversal of previous entry
        'opening',       -- Opening balance
        'closing'        -- Period closing
    ) DEFAULT 'standard',

    -- Entry details
    `line_number` TINYINT UNSIGNED NOT NULL COMMENT 'Line within journal entry',
    `account_id` INT UNSIGNED NOT NULL,
    `debit_amount` DECIMAL(15,2) DEFAULT 0.00,
    `credit_amount` DECIMAL(15,2) DEFAULT 0.00,
    `description` VARCHAR(500) NOT NULL,
    `memo` TEXT NULL,

    -- Reference to source (optional - links to legacy transactions)
    `source_type` VARCHAR(50) NULL COMMENT 'transaction, check, transfer, etc.',
    `source_id` INT UNSIGNED NULL,

    -- For reversals
    `reverses_journal_id` CHAR(36) NULL COMMENT 'Points to journal being reversed',
    `reversed_by_journal_id` CHAR(36) NULL COMMENT 'Points to reversal journal',

    -- Metadata (immutable after creation)
    `created_by` INT UNSIGNED NULL COMMENT 'User who created this entry',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- For future Trust/IOLTA support
    `client_matter_id` INT UNSIGNED NULL COMMENT 'For Trust accounting',

    PRIMARY KEY (`id`),
    KEY `idx_ledger_user` (`user_id`),
    KEY `idx_ledger_journal` (`journal_id`),
    KEY `idx_ledger_date` (`journal_date`),
    KEY `idx_ledger_account` (`account_id`),
    KEY `idx_ledger_source` (`source_type`, `source_id`),
    KEY `idx_ledger_reversal` (`reverses_journal_id`),

    CONSTRAINT `fk_ledger_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ledger_account` FOREIGN KEY (`account_id`)
        REFERENCES `accounts` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ledger_created_by` FOREIGN KEY (`created_by`)
        REFERENCES `users` (`id`) ON DELETE SET NULL,

    -- CRITICAL: Ensure either debit OR credit, not both
    CONSTRAINT `chk_ledger_debit_credit` CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0) OR
        (debit_amount = 0 AND credit_amount = 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Step 3: Create view to verify journal balance
-- This ensures Debit = Credit for every journal entry
-- -----------------------------------------------------
CREATE OR REPLACE VIEW `v_journal_balance` AS
SELECT
    journal_id,
    journal_date,
    user_id,
    SUM(debit_amount) as total_debits,
    SUM(credit_amount) as total_credits,
    SUM(debit_amount) - SUM(credit_amount) as difference,
    CASE
        WHEN SUM(debit_amount) = SUM(credit_amount) THEN 'BALANCED'
        ELSE 'UNBALANCED'
    END as status
FROM ledger_entries
GROUP BY journal_id, journal_date, user_id;

-- -----------------------------------------------------
-- Step 4: Create view for account balances from ledger
-- This provides running balance for each account
-- -----------------------------------------------------
CREATE OR REPLACE VIEW `v_account_ledger_balance` AS
SELECT
    account_id,
    user_id,
    SUM(debit_amount) as total_debits,
    SUM(credit_amount) as total_credits,
    -- For Asset/Expense accounts: Debit increases, Credit decreases
    -- For Liability/Equity/Income accounts: Credit increases, Debit decreases
    SUM(debit_amount) - SUM(credit_amount) as debit_balance,
    SUM(credit_amount) - SUM(debit_amount) as credit_balance
FROM ledger_entries
GROUP BY account_id, user_id;

-- -----------------------------------------------------
-- Step 5: Enhance audit_log table
-- Add fields for better compliance tracking
-- -----------------------------------------------------
ALTER TABLE `audit_log`
ADD COLUMN `session_id` VARCHAR(64) NULL AFTER `user_id`,
ADD COLUMN `request_id` CHAR(36) NULL AFTER `session_id`,
ADD COLUMN `change_reason` TEXT NULL AFTER `new_values`;

-- Add index for faster lookups
ALTER TABLE `audit_log`
ADD KEY `idx_audit_session` (`session_id`),
ADD KEY `idx_audit_request` (`request_id`);

-- -----------------------------------------------------
-- Step 6: Add soft delete to transactions
-- Financial records should never be hard deleted
-- -----------------------------------------------------
ALTER TABLE `transactions`
ADD COLUMN `deleted_at` TIMESTAMP NULL AFTER `updated_at`,
ADD COLUMN `deleted_by` INT UNSIGNED NULL AFTER `deleted_at`;

ALTER TABLE `transactions`
ADD KEY `idx_transactions_deleted` (`deleted_at`);

-- -----------------------------------------------------
-- Step 7: Create trigger to prevent ledger_entries updates
-- This enforces immutability at the database level
-- -----------------------------------------------------
DELIMITER //

CREATE TRIGGER `tr_ledger_entries_no_update`
BEFORE UPDATE ON `ledger_entries`
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Ledger entries are immutable. Use reversal entries for corrections.';
END//

CREATE TRIGGER `tr_ledger_entries_no_delete`
BEFORE DELETE ON `ledger_entries`
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Ledger entries cannot be deleted. Use reversal entries for corrections.';
END//

DELIMITER ;

-- -----------------------------------------------------
-- Step 8: Create stored procedure for journal entry
-- This ensures atomic creation of balanced entries
-- -----------------------------------------------------
DELIMITER //

CREATE PROCEDURE `sp_create_journal_entry`(
    IN p_user_id INT UNSIGNED,
    IN p_journal_date DATE,
    IN p_journal_type VARCHAR(20),
    IN p_description VARCHAR(500),
    IN p_entries JSON,  -- Array of {account_id, debit_amount, credit_amount, memo}
    OUT p_journal_id CHAR(36),
    OUT p_success BOOLEAN,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_total_debits DECIMAL(15,2) DEFAULT 0;
    DECLARE v_total_credits DECIMAL(15,2) DEFAULT 0;
    DECLARE v_line_num INT DEFAULT 0;
    DECLARE v_entry_count INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_success = FALSE;
        SET p_message = 'Database error occurred';
    END;

    -- Generate UUID for journal_id
    SET p_journal_id = UUID();

    -- Calculate totals from entries
    SET v_entry_count = JSON_LENGTH(p_entries);

    -- Validate: Must have at least 2 entries
    IF v_entry_count < 2 THEN
        SET p_success = FALSE;
        SET p_message = 'Journal entry must have at least 2 lines';
    ELSE
        START TRANSACTION;

        -- Insert each line
        SET v_line_num = 0;
        WHILE v_line_num < v_entry_count DO
            INSERT INTO ledger_entries (
                user_id, journal_id, journal_date, journal_type, line_number,
                account_id, debit_amount, credit_amount, description, memo, created_by
            ) VALUES (
                p_user_id,
                p_journal_id,
                p_journal_date,
                p_journal_type,
                v_line_num + 1,
                JSON_UNQUOTE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].account_id'))),
                COALESCE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].debit_amount')), 0),
                COALESCE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].credit_amount')), 0),
                p_description,
                JSON_UNQUOTE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].memo'))),
                p_user_id
            );

            SET v_total_debits = v_total_debits + COALESCE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].debit_amount')), 0);
            SET v_total_credits = v_total_credits + COALESCE(JSON_EXTRACT(p_entries, CONCAT('$[', v_line_num, '].credit_amount')), 0);
            SET v_line_num = v_line_num + 1;
        END WHILE;

        -- Verify balance
        IF v_total_debits != v_total_credits THEN
            ROLLBACK;
            SET p_success = FALSE;
            SET p_message = CONCAT('Journal entry not balanced. Debits: ', v_total_debits, ' Credits: ', v_total_credits);
        ELSE
            COMMIT;
            SET p_success = TRUE;
            SET p_message = CONCAT('Journal entry created successfully. ID: ', p_journal_id);
        END IF;
    END IF;
END//

DELIMITER ;

-- =====================================================
-- End of Migration 001
-- =====================================================
