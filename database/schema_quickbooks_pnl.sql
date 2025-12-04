-- =====================================================
-- QuickBooks-Style Profit & Loss Detail Report Schema
-- Compatible with MariaDB/MySQL (XAMPP)
-- =====================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

USE `expense_tracker`;

-- =====================================================
-- 1. ACCOUNT TYPES TABLE (QuickBooks Official Ordering)
-- =====================================================
-- QuickBooks P&L account type order:
-- 1. Income
-- 2. Cost of Goods Sold (COGS)
-- 3. Expense
-- 4. Other Income
-- 5. Other Expense

DROP TABLE IF EXISTS `qb_account_types`;
CREATE TABLE `qb_account_types` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `type_code` VARCHAR(30) NOT NULL,
    `type_name` VARCHAR(100) NOT NULL,
    `type_category` ENUM('income', 'cogs', 'expense', 'other_income', 'other_expense') NOT NULL,
    `sort_order` INT UNSIGNED NOT NULL COMMENT 'QuickBooks official ordering',
    `is_debit_positive` TINYINT(1) DEFAULT 0 COMMENT '1=debit increases, 0=credit increases',
    `description` TEXT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_account_types_code` (`type_code`),
    KEY `idx_account_types_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert QuickBooks standard account types in official order
INSERT INTO `qb_account_types` (`type_code`, `type_name`, `type_category`, `sort_order`, `is_debit_positive`, `description`) VALUES
-- Income types (appears first in P&L)
('INCOME', 'Income', 'income', 100, 0, 'Revenue from primary business operations'),
('SALES', 'Sales', 'income', 101, 0, 'Sales revenue'),
('SERVICE', 'Service Income', 'income', 102, 0, 'Revenue from services'),
('DISCOUNT', 'Sales Discounts', 'income', 103, 0, 'Discounts given to customers'),
('REFUNDS_GIVEN', 'Refunds Given', 'income', 104, 0, 'Customer refunds reducing revenue'),

-- Cost of Goods Sold (appears second)
('COGS', 'Cost of Goods Sold', 'cogs', 200, 1, 'Direct costs of producing goods'),
('COGS_MATERIALS', 'Materials Cost', 'cogs', 201, 1, 'Raw materials expense'),
('COGS_LABOR', 'Direct Labor', 'cogs', 202, 1, 'Labor directly tied to production'),
('COGS_SHIPPING', 'Shipping Costs', 'cogs', 203, 1, 'Freight and shipping for goods'),

-- Expenses (appears third)
('EXPENSE', 'Expense', 'expense', 300, 1, 'General business expenses'),
('EXPENSE_PAYROLL', 'Payroll Expenses', 'expense', 301, 1, 'Employee wages and salaries'),
('EXPENSE_RENT', 'Rent Expense', 'expense', 302, 1, 'Office/facility rent'),
('EXPENSE_UTILITIES', 'Utilities', 'expense', 303, 1, 'Electric, water, gas expenses'),
('EXPENSE_OFFICE', 'Office Expenses', 'expense', 304, 1, 'Office supplies and equipment'),
('EXPENSE_TRAVEL', 'Travel Expense', 'expense', 305, 1, 'Business travel costs'),
('EXPENSE_MEALS', 'Meals & Entertainment', 'expense', 306, 1, 'Business meals and entertainment'),
('EXPENSE_INSURANCE', 'Insurance', 'expense', 307, 1, 'Business insurance'),
('EXPENSE_DEPRECIATION', 'Depreciation', 'expense', 308, 1, 'Asset depreciation'),
('EXPENSE_ADVERTISING', 'Advertising & Marketing', 'expense', 309, 1, 'Marketing expenses'),
('EXPENSE_PROFESSIONAL', 'Professional Services', 'expense', 310, 1, 'Legal, accounting, consulting'),
('EXPENSE_BANK', 'Bank Charges', 'expense', 311, 1, 'Bank fees and charges'),
('EXPENSE_INTEREST', 'Interest Expense', 'expense', 312, 1, 'Loan and credit interest'),
('EXPENSE_TAX', 'Taxes & Licenses', 'expense', 313, 1, 'Business taxes and licenses'),
('EXPENSE_REPAIRS', 'Repairs & Maintenance', 'expense', 314, 1, 'Equipment and facility repairs'),

-- Other Income (appears fourth)
('OTHER_INCOME', 'Other Income', 'other_income', 400, 0, 'Non-operating income'),
('OTHER_INCOME_INTEREST', 'Interest Income', 'other_income', 401, 0, 'Interest earned'),
('OTHER_INCOME_DIVIDEND', 'Dividend Income', 'other_income', 402, 0, 'Investment dividends'),
('OTHER_INCOME_GAIN', 'Gain on Sale', 'other_income', 403, 0, 'Gain on asset sales'),
('OTHER_INCOME_MISC', 'Miscellaneous Income', 'other_income', 404, 0, 'Other non-operating income'),

-- Other Expense (appears last)
('OTHER_EXPENSE', 'Other Expense', 'other_expense', 500, 1, 'Non-operating expenses'),
('OTHER_EXPENSE_LOSS', 'Loss on Sale', 'other_expense', 501, 1, 'Loss on asset sales'),
('OTHER_EXPENSE_PENALTY', 'Penalties & Fines', 'other_expense', 502, 1, 'Fines and penalties'),
('OTHER_EXPENSE_MISC', 'Miscellaneous Expense', 'other_expense', 503, 1, 'Other non-operating expenses');


-- =====================================================
-- 2. CHART OF ACCOUNTS TABLE (QuickBooks Style)
-- =====================================================
-- Hierarchical account structure with parent-child relationships

DROP TABLE IF EXISTS `qb_chart_of_accounts`;
CREATE TABLE `qb_chart_of_accounts` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_number` VARCHAR(20) NULL COMMENT 'Optional account number like 4000, 5100',
    `account_name` VARCHAR(150) NOT NULL,
    `account_type_id` INT UNSIGNED NOT NULL,
    `parent_id` INT UNSIGNED NULL COMMENT 'Parent account for sub-accounts',
    `description` TEXT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `is_system` TINYINT(1) DEFAULT 0 COMMENT 'System default accounts',
    `sort_order` INT UNSIGNED DEFAULT 0 COMMENT 'Custom sort within same level',
    `depth` TINYINT UNSIGNED DEFAULT 0 COMMENT '0=parent, 1=child, 2=grandchild',
    `full_path` VARCHAR(500) NULL COMMENT 'Cached full path: Parent:Child:Grandchild',
    `opening_balance` DECIMAL(15,2) DEFAULT 0.00,
    `opening_balance_date` DATE NULL,
    `tax_line` VARCHAR(100) NULL COMMENT 'Tax form line mapping',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_coa_user_name_parent` (`user_id`, `account_name`, `parent_id`),
    KEY `idx_coa_user` (`user_id`),
    KEY `idx_coa_type` (`account_type_id`),
    KEY `idx_coa_parent` (`parent_id`),
    KEY `idx_coa_active` (`is_active`),
    KEY `idx_coa_sort` (`user_id`, `account_type_id`, `sort_order`, `account_name`),
    CONSTRAINT `fk_coa_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_coa_type` FOREIGN KEY (`account_type_id`)
        REFERENCES `qb_account_types` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_coa_parent` FOREIGN KEY (`parent_id`)
        REFERENCES `qb_chart_of_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 3. TRANSACTION TYPES TABLE (QuickBooks Style)
-- =====================================================

DROP TABLE IF EXISTS `qb_transaction_types`;
CREATE TABLE `qb_transaction_types` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `type_code` VARCHAR(20) NOT NULL,
    `type_name` VARCHAR(50) NOT NULL,
    `abbreviation` VARCHAR(10) NOT NULL COMMENT 'Display in reports: INV, CHK, etc.',
    `affects_ar` TINYINT(1) DEFAULT 0,
    `affects_ap` TINYINT(1) DEFAULT 0,
    `sort_order` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_txn_types_code` (`type_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert QuickBooks transaction types
INSERT INTO `qb_transaction_types` (`type_code`, `type_name`, `abbreviation`, `affects_ar`, `affects_ap`, `sort_order`) VALUES
('INVOICE', 'Invoice', 'INV', 1, 0, 1),
('PAYMENT', 'Payment', 'PMT', 1, 0, 2),
('SALES_RECEIPT', 'Sales Receipt', 'SLS', 0, 0, 3),
('CREDIT_MEMO', 'Credit Memo', 'CRM', 1, 0, 4),
('REFUND', 'Refund', 'REF', 0, 0, 5),
('BILL', 'Bill', 'BILL', 0, 1, 10),
('BILL_PAYMENT', 'Bill Payment', 'BP', 0, 1, 11),
('CHECK', 'Check', 'CHK', 0, 0, 12),
('EXPENSE', 'Expense', 'EXP', 0, 0, 13),
('CREDIT_CARD', 'Credit Card', 'CC', 0, 0, 14),
('DEPOSIT', 'Deposit', 'DEP', 0, 0, 20),
('TRANSFER', 'Transfer', 'TRF', 0, 0, 21),
('JOURNAL', 'Journal Entry', 'JE', 0, 0, 30),
('GENERAL_JOURNAL', 'General Journal', 'GJ', 0, 0, 31);


-- =====================================================
-- 4. TRANSACTIONS TABLE (QuickBooks P&L Detail Style)
-- =====================================================
-- Stores individual transaction line items for P&L Detail report

DROP TABLE IF EXISTS `qb_transactions`;
CREATE TABLE `qb_transactions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `transaction_type_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL COMMENT 'Chart of Accounts entry',
    `bank_account_id` INT UNSIGNED NULL COMMENT 'Link to bank/payment account',
    `transaction_date` DATE NOT NULL,
    `doc_number` VARCHAR(50) NULL COMMENT 'Invoice/Check/Reference number',
    `payee_name` VARCHAR(200) NULL COMMENT 'Customer, Vendor, or Payee name',
    `memo` TEXT NULL COMMENT 'Line item memo/description',
    `amount` DECIMAL(15,2) NOT NULL COMMENT 'Signed: positive=debit, negative=credit for expense accounts',
    `quantity` DECIMAL(15,4) NULL,
    `unit_price` DECIMAL(15,4) NULL,
    `class_id` INT UNSIGNED NULL COMMENT 'For class tracking',
    `location_id` INT UNSIGNED NULL COMMENT 'For location tracking',
    `is_billable` TINYINT(1) DEFAULT 0,
    `is_reconciled` TINYINT(1) DEFAULT 0,
    `cleared_date` DATE NULL,
    `source_transaction_id` INT UNSIGNED NULL COMMENT 'Parent transaction (for splits)',
    `split_index` INT UNSIGNED NULL COMMENT 'Line number in split transaction',
    `currency` CHAR(3) DEFAULT 'USD',
    `exchange_rate` DECIMAL(15,6) DEFAULT 1.000000,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_txn_user` (`user_id`),
    KEY `idx_txn_account` (`account_id`),
    KEY `idx_txn_date` (`transaction_date`),
    KEY `idx_txn_type` (`transaction_type_id`),
    KEY `idx_txn_payee` (`payee_name`),
    KEY `idx_txn_doc` (`doc_number`),
    KEY `idx_txn_user_date` (`user_id`, `transaction_date`),
    KEY `idx_txn_source` (`source_transaction_id`),
    CONSTRAINT `fk_txn_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_txn_account` FOREIGN KEY (`account_id`)
        REFERENCES `qb_chart_of_accounts` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_txn_type` FOREIGN KEY (`transaction_type_id`)
        REFERENCES `qb_transaction_types` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 5. P&L REPORT CONFIGURATION TABLE
-- =====================================================

DROP TABLE IF EXISTS `qb_report_config`;
CREATE TABLE `qb_report_config` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `config_key` VARCHAR(50) NOT NULL,
    `config_value` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_config_user_key` (`user_id`, `config_key`),
    CONSTRAINT `fk_config_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 6. COMPANY SETTINGS TABLE
-- =====================================================

DROP TABLE IF EXISTS `qb_company_settings`;
CREATE TABLE `qb_company_settings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `company_name` VARCHAR(200) NOT NULL DEFAULT 'My Company',
    `legal_name` VARCHAR(200) NULL,
    `address_line1` VARCHAR(200) NULL,
    `address_line2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(50) NULL,
    `zip_code` VARCHAR(20) NULL,
    `country` CHAR(2) DEFAULT 'US',
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(255) NULL,
    `website` VARCHAR(255) NULL,
    `tax_id` VARCHAR(50) NULL COMMENT 'EIN or Tax ID',
    `fiscal_year_start` TINYINT UNSIGNED DEFAULT 1 COMMENT 'Month (1-12)',
    `accounting_basis` ENUM('accrual', 'cash') DEFAULT 'accrual',
    `default_currency` CHAR(3) DEFAULT 'USD',
    `date_format` VARCHAR(20) DEFAULT 'MM/DD/YYYY',
    `number_format` ENUM('1,234.56', '1.234,56', '1 234.56') DEFAULT '1,234.56',
    `logo_path` VARCHAR(500) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_company_user` (`user_id`),
    CONSTRAINT `fk_company_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 7. SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert default company settings for user_id = 1
INSERT INTO `qb_company_settings` (`user_id`, `company_name`, `address_line1`, `city`, `state`, `zip_code`, `accounting_basis`) VALUES
(1, 'Smith Legal Services, LLC', '123 Main Street, Suite 400', 'San Francisco', 'CA', '94105', 'accrual');

-- Create sample Chart of Accounts for user_id = 1
-- Income Accounts
INSERT INTO `qb_chart_of_accounts` (`user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `is_system`, `sort_order`, `depth`) VALUES
-- Income (type_id = 1 for INCOME)
(1, '4000', 'Income', (SELECT id FROM qb_account_types WHERE type_code = 'INCOME'), NULL, 1, 1, 0),
(1, '4100', 'Legal Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 1, 0, 10, 1),
(1, '4110', 'Consultation Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 0, 11, 2),
(1, '4120', 'Litigation Services', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 0, 12, 2),
(1, '4130', 'Document Preparation', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 0, 13, 2),
(1, '4200', 'Retainer Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 1, 0, 20, 1),

-- Other Income
(1, '6000', 'Other Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME'), NULL, 1, 100, 0),
(1, '6100', 'Interest Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME_INTEREST'), 7, 0, 101, 1),
(1, '6200', 'Miscellaneous Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME_MISC'), 7, 0, 102, 1);

-- Expense Accounts
INSERT INTO `qb_chart_of_accounts` (`user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `is_system`, `sort_order`, `depth`) VALUES
-- Expenses (type_id for EXPENSE category)
(1, '5000', 'Expenses', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE'), NULL, 1, 200, 0),
(1, '5100', 'Office Supplies', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 10, 0, 210, 1),
(1, '5110', 'Stationery', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 11, 0, 211, 2),
(1, '5120', 'Computer Supplies', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 11, 0, 212, 2),
(1, '5200', 'Bank Charges', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 10, 0, 220, 1),
(1, '5210', 'Service Charges', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 14, 0, 221, 2),
(1, '5220', 'Wire Transfer Fees', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 14, 0, 222, 2),
(1, '5300', 'Travel', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 10, 0, 230, 1),
(1, '5310', 'Airfare', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 0, 231, 2),
(1, '5320', 'Lodging', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 0, 232, 2),
(1, '5330', 'Ground Transportation', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 0, 233, 2),
(1, '5400', 'Professional Services', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_PROFESSIONAL'), 10, 0, 240, 1),
(1, '5500', 'Rent Expense', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_RENT'), 10, 0, 250, 1),
(1, '5600', 'Utilities', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_UTILITIES'), 10, 0, 260, 1),

-- Other Expenses
(1, '7000', 'Other Expenses', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE'), NULL, 1, 300, 0),
(1, '7100', 'Penalties & Fines', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE_PENALTY'), 24, 0, 301, 1),
(1, '7200', 'Miscellaneous Expense', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE_MISC'), 24, 0, 302, 1);

-- Update full_path for all accounts
UPDATE `qb_chart_of_accounts` c1
LEFT JOIN `qb_chart_of_accounts` c2 ON c1.parent_id = c2.id
LEFT JOIN `qb_chart_of_accounts` c3 ON c2.parent_id = c3.id
SET c1.full_path = CASE
    WHEN c3.account_name IS NOT NULL THEN CONCAT(c3.account_name, ':', c2.account_name, ':', c1.account_name)
    WHEN c2.account_name IS NOT NULL THEN CONCAT(c2.account_name, ':', c1.account_name)
    ELSE c1.account_name
END
WHERE c1.user_id = 1;

-- Insert sample transactions
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`) VALUES
-- Legal Fees Income
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-01', 'INV-1001', 'Johnson Corp', 'Initial consultation - contract review', 2500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 4, '2024-11-05', 'INV-1002', 'ABC Industries', 'Litigation support - Phase 1', 15000.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-10', 'INV-1003', 'Smith Family Trust', 'Estate planning consultation', 1500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 5, '2024-11-12', 'INV-1004', 'Tech Startup LLC', 'Document preparation - incorporation', 3500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 4, '2024-11-15', 'INV-1005', 'ABC Industries', 'Litigation support - Phase 2', 12500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-18', 'INV-1006', 'Williams Holdings', 'M&A consultation', 8500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'SALES_RECEIPT'), 6, '2024-11-20', 'SR-001', 'Various Clients', 'Monthly retainer - November', 5000.00),

-- Other Income
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'DEPOSIT'), 8, '2024-11-30', 'DEP-101', 'First National Bank', 'Interest earned on operating account', 125.50),

-- Office Supplies Expenses
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 12, '2024-11-03', '1001', 'Office Depot', 'Legal pads, pens, folders', 245.75),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 13, '2024-11-08', 'CC-4521', 'Amazon', 'Printer toner cartridges', 189.99),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 12, '2024-11-14', '1002', 'Staples', 'Paper supplies', 87.50),

-- Bank Charges
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 15, '2024-11-01', 'BC-001', 'First National Bank', 'Monthly service charge', 25.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 16, '2024-11-15', 'BC-002', 'First National Bank', 'Wire transfer to client trust', 35.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 15, '2024-11-22', 'BC-003', 'First National Bank', 'Overdraft protection fee', 15.00),

-- Travel Expenses
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 18, '2024-11-04', 'CC-4522', 'United Airlines', 'Flight to NYC for deposition', 485.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 19, '2024-11-04', 'CC-4523', 'Marriott Times Square', 'NYC hotel - 2 nights', 650.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 20, '2024-11-05', 'CC-4524', 'NYC Yellow Cab', 'Taxi to courthouse', 45.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 20, '2024-11-06', 'CC-4525', 'Uber', 'Return to airport', 62.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 18, '2024-11-20', 'CC-4530', 'Delta Airlines', 'Flight to Chicago for client meeting', 325.00),

-- Professional Services
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 21, '2024-11-15', 'BILL-201', 'IT Support Services', 'Monthly IT support', 500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 21, '2024-11-25', 'BILL-202', 'Johnson CPA', 'Monthly bookkeeping', 750.00),

-- Rent
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 22, '2024-11-01', '1000', 'Main Street Properties', 'Office rent - November', 3500.00),

-- Utilities
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 23, '2024-11-10', 'UTIL-001', 'Pacific Gas & Electric', 'Electricity - October', 285.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 23, '2024-11-12', 'UTIL-002', 'AT&T', 'Phone and internet - November', 195.00),

-- Other Expenses
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 26, '2024-11-28', 'MISC-001', 'Misc', 'Charitable donation', 250.00);


SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- QUICKBOOKS P&L DETAIL GROUPING & SUBTOTAL LOGIC
-- =====================================================
/*
QuickBooks P&L Detail Report Structure:

INCOME (Account Type Order: 100-199)
  ├─ Parent Account
  │    ├─ Sub-Account
  │    │    ├─ Transaction 1: Date | Type | Num | Name | Memo | Amount
  │    │    ├─ Transaction 2: Date | Type | Num | Name | Memo | Amount
  │    │    └─ Total Sub-Account
  │    ├─ Sub-Account 2
  │    │    └─ ...
  │    └─ Total Parent Account
  └─ Total Income

COST OF GOODS SOLD (Account Type Order: 200-299)
  └─ ... (same structure)

GROSS PROFIT = Total Income - Total COGS

EXPENSES (Account Type Order: 300-399)
  └─ ... (same structure)
  └─ Total Expenses

NET OPERATING INCOME = Gross Profit - Total Expenses

OTHER INCOME (Account Type Order: 400-499)
  └─ ... (same structure)

OTHER EXPENSES (Account Type Order: 500-599)
  └─ ... (same structure)

NET OTHER INCOME = Other Income - Other Expenses

NET INCOME = Net Operating Income + Net Other Income
*/
