-- Bank Reconciliation Tables
-- QuickBooks-style reconciliation tracking

-- Reconciliation sessions
CREATE TABLE IF NOT EXISTS trust_reconciliations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    account_id INT NOT NULL,
    statement_date DATE NOT NULL,
    statement_ending_balance DECIMAL(15,2) NOT NULL,
    beginning_balance DECIMAL(15,2) NOT NULL,
    status ENUM('in_progress', 'completed') DEFAULT 'in_progress',
    cleared_checks_count INT DEFAULT 0,
    cleared_checks_total DECIMAL(15,2) DEFAULT 0,
    cleared_deposits_count INT DEFAULT 0,
    cleared_deposits_total DECIMAL(15,2) DEFAULT 0,
    difference DECIMAL(15,2) DEFAULT 0,
    completed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_account (user_id, account_id),
    INDEX idx_status (status),
    INDEX idx_statement_date (statement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cleared items for in-progress reconciliations (temporary storage)
CREATE TABLE IF NOT EXISTS trust_reconciliation_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reconciliation_id INT NOT NULL,
    transaction_id INT NOT NULL,
    cleared_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_recon_trans (reconciliation_id, transaction_id),
    FOREIGN KEY (reconciliation_id) REFERENCES trust_reconciliations(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES trust_transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add reconciliation_id to trust_transactions for tracking which reconciliation cleared it
ALTER TABLE trust_transactions
ADD COLUMN IF NOT EXISTS reconciliation_id INT NULL,
ADD COLUMN IF NOT EXISTS cleared_date DATE NULL;
