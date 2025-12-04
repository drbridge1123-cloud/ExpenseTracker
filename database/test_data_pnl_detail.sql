-- =====================================================
-- QuickBooks-Style P&L Detail Report - Test Data
-- =====================================================
-- This file contains comprehensive test data to verify
-- the P&L Detail report matches QuickBooks format exactly.

USE `expense_tracker`;

-- =====================================================
-- CREATE TEST USER (if not exists)
-- =====================================================
INSERT IGNORE INTO `users` (`id`, `username`, `email`, `password_hash`, `display_name`, `default_currency`)
VALUES (1, 'testuser', 'test@example.com', '$2y$12$placeholder', 'Test User', 'USD');

-- =====================================================
-- COMPANY SETTINGS
-- =====================================================
INSERT INTO `qb_company_settings` (`user_id`, `company_name`, `address_line1`, `city`, `state`, `zip_code`, `accounting_basis`)
VALUES (1, 'Smith Legal Services, LLC', '123 Main Street, Suite 400', 'San Francisco', 'CA', '94105', 'accrual')
ON DUPLICATE KEY UPDATE
    company_name = VALUES(company_name),
    address_line1 = VALUES(address_line1),
    city = VALUES(city),
    state = VALUES(state),
    zip_code = VALUES(zip_code);

-- =====================================================
-- CLEAR EXISTING TEST DATA
-- =====================================================
DELETE FROM `qb_transactions` WHERE user_id = 1;
DELETE FROM `qb_chart_of_accounts` WHERE user_id = 1;

-- =====================================================
-- CHART OF ACCOUNTS - INCOME
-- =====================================================
-- Following QuickBooks account hierarchy: Parent > Sub-account > Detail

-- Income Parent (4000)
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (1, 1, '4000', 'Income', (SELECT id FROM qb_account_types WHERE type_code = 'INCOME'), NULL, 100, 0);

-- Legal Fees (Sub-account of Income)
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (2, 1, '4100', 'Legal Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 1, 110, 1);

-- Legal Fees Sub-accounts
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(3, 1, '4110', 'Consultation Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 111, 2),
(4, 1, '4120', 'Litigation Services', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 112, 2),
(5, 1, '4130', 'Document Preparation', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 2, 113, 2);

-- Retainer Fees (Sub-account of Income)
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (6, 1, '4200', 'Retainer Fees', (SELECT id FROM qb_account_types WHERE type_code = 'SERVICE'), 1, 120, 1);

-- =====================================================
-- CHART OF ACCOUNTS - OTHER INCOME
-- =====================================================
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(7, 1, '6000', 'Other Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME'), NULL, 200, 0),
(8, 1, '6100', 'Interest Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME_INTEREST'), 7, 210, 1),
(9, 1, '6200', 'Miscellaneous Income', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_INCOME_MISC'), 7, 220, 1);

-- =====================================================
-- CHART OF ACCOUNTS - EXPENSES
-- =====================================================
-- Expenses Parent (5000)
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (10, 1, '5000', 'Expenses', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE'), NULL, 300, 0);

-- Office Supplies
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (11, 1, '5100', 'Office Supplies', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 10, 310, 1);

INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(12, 1, '5110', 'Stationery', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 11, 311, 2),
(13, 1, '5120', 'Computer Supplies', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_OFFICE'), 11, 312, 2);

-- Bank Charges
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (14, 1, '5200', 'Bank Charges', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 10, 320, 1);

INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(15, 1, '5210', 'Service Charges', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 14, 321, 2),
(16, 1, '5220', 'Wire Transfer Fees', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_BANK'), 14, 322, 2);

-- Travel
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (17, 1, '5300', 'Travel', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 10, 330, 1);

INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(18, 1, '5310', 'Airfare', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 331, 2),
(19, 1, '5320', 'Lodging', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 332, 2),
(20, 1, '5330', 'Ground Transportation', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_TRAVEL'), 17, 333, 2);

-- Professional Services
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (21, 1, '5400', 'Professional Services', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_PROFESSIONAL'), 10, 340, 1);

-- Rent
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (22, 1, '5500', 'Rent Expense', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_RENT'), 10, 350, 1);

-- Utilities
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES (23, 1, '5600', 'Utilities', (SELECT id FROM qb_account_types WHERE type_code = 'EXPENSE_UTILITIES'), 10, 360, 1);

-- =====================================================
-- CHART OF ACCOUNTS - OTHER EXPENSES
-- =====================================================
INSERT INTO `qb_chart_of_accounts` (`id`, `user_id`, `account_number`, `account_name`, `account_type_id`, `parent_id`, `sort_order`, `depth`)
VALUES
(24, 1, '7000', 'Other Expenses', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE'), NULL, 400, 0),
(25, 1, '7100', 'Penalties & Fines', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE_PENALTY'), 24, 410, 1),
(26, 1, '7200', 'Miscellaneous Expense', (SELECT id FROM qb_account_types WHERE type_code = 'OTHER_EXPENSE_MISC'), 24, 420, 1);

-- =====================================================
-- UPDATE FULL PATHS
-- =====================================================
UPDATE `qb_chart_of_accounts` c1
LEFT JOIN `qb_chart_of_accounts` c2 ON c1.parent_id = c2.id
LEFT JOIN `qb_chart_of_accounts` c3 ON c2.parent_id = c3.id
SET c1.full_path = CASE
    WHEN c3.account_name IS NOT NULL THEN CONCAT(c3.account_name, ':', c2.account_name, ':', c1.account_name)
    WHEN c2.account_name IS NOT NULL THEN CONCAT(c2.account_name, ':', c1.account_name)
    ELSE c1.account_name
END
WHERE c1.user_id = 1;

-- =====================================================
-- TEST TRANSACTIONS - NOVEMBER 2024
-- =====================================================

-- INCOME: Legal Fees - Consultation Fees (4110)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-01', 'INV-1001', 'Johnson Corp', 'Initial consultation - contract review', 2500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-10', 'INV-1003', 'Smith Family Trust', 'Estate planning consultation', 1500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 3, '2024-11-18', 'INV-1006', 'Williams Holdings', 'M&A consultation', 8500.00);

-- INCOME: Legal Fees - Litigation Services (4120)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 4, '2024-11-05', 'INV-1002', 'ABC Industries', 'Litigation support - Phase 1', 15000.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 4, '2024-11-15', 'INV-1005', 'ABC Industries', 'Litigation support - Phase 2', 12500.00);

-- INCOME: Legal Fees - Document Preparation (4130)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'INVOICE'), 5, '2024-11-12', 'INV-1004', 'Tech Startup LLC', 'Document preparation - incorporation', 3500.00);

-- INCOME: Retainer Fees (4200)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'SALES_RECEIPT'), 6, '2024-11-20', 'SR-001', 'Various Clients', 'Monthly retainer - November', 5000.00);

-- OTHER INCOME: Interest Income (6100)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'DEPOSIT'), 8, '2024-11-30', 'DEP-101', 'First National Bank', 'Interest earned on operating account', 125.50);

-- EXPENSES: Office Supplies - Stationery (5110)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 12, '2024-11-03', '1001', 'Office Depot', 'Legal pads, pens, folders', 245.75),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 12, '2024-11-14', '1002', 'Staples', 'Paper supplies', 87.50);

-- EXPENSES: Office Supplies - Computer Supplies (5120)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 13, '2024-11-08', 'CC-4521', 'Amazon', 'Printer toner cartridges', 189.99);

-- EXPENSES: Bank Charges - Service Charges (5210)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 15, '2024-11-01', 'BC-001', 'First National Bank', 'Monthly service charge', 25.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 15, '2024-11-22', 'BC-003', 'First National Bank', 'Overdraft protection fee', 15.00);

-- EXPENSES: Bank Charges - Wire Transfer Fees (5220)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 16, '2024-11-15', 'BC-002', 'First National Bank', 'Wire transfer to client trust', 35.00);

-- EXPENSES: Travel - Airfare (5310)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 18, '2024-11-04', 'CC-4522', 'United Airlines', 'Flight to NYC for deposition', 485.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 18, '2024-11-20', 'CC-4530', 'Delta Airlines', 'Flight to Chicago for client meeting', 325.00);

-- EXPENSES: Travel - Lodging (5320)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 19, '2024-11-04', 'CC-4523', 'Marriott Times Square', 'NYC hotel - 2 nights', 650.00);

-- EXPENSES: Travel - Ground Transportation (5330)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 20, '2024-11-05', 'CC-4524', 'NYC Yellow Cab', 'Taxi to courthouse', 45.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CREDIT_CARD'), 20, '2024-11-06', 'CC-4525', 'Uber', 'Return to airport', 62.00);

-- EXPENSES: Professional Services (5400)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 21, '2024-11-15', 'BILL-201', 'IT Support Services', 'Monthly IT support', 500.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 21, '2024-11-25', 'BILL-202', 'Johnson CPA', 'Monthly bookkeeping', 750.00);

-- EXPENSES: Rent (5500)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'CHECK'), 22, '2024-11-01', '1000', 'Main Street Properties', 'Office rent - November', 3500.00);

-- EXPENSES: Utilities (5600)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 23, '2024-11-10', 'UTIL-001', 'Pacific Gas & Electric', 'Electricity - October', 285.00),
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'BILL'), 23, '2024-11-12', 'UTIL-002', 'AT&T', 'Phone and internet - November', 195.00);

-- OTHER EXPENSES: Miscellaneous (7200)
INSERT INTO `qb_transactions` (`user_id`, `transaction_type_id`, `account_id`, `transaction_date`, `doc_number`, `payee_name`, `memo`, `amount`)
VALUES
(1, (SELECT id FROM qb_transaction_types WHERE type_code = 'EXPENSE'), 26, '2024-11-28', 'MISC-001', 'Misc', 'Charitable donation', 250.00);

-- =====================================================
-- EXPECTED REPORT OUTPUT (November 2024)
-- =====================================================
/*
PROFIT AND LOSS DETAIL
Smith Legal Services, LLC
November 1 - 30, 2024
Accrual Basis

INCOME
  Legal Fees
    Consultation Fees
      11/01/2024 | INV  | INV-1001 | Johnson Corp       | Initial consultation - contract review  | $2,500.00
      11/10/2024 | INV  | INV-1003 | Smith Family Trust | Estate planning consultation            | $1,500.00
      11/18/2024 | INV  | INV-1006 | Williams Holdings  | M&A consultation                        | $8,500.00
      Total Consultation Fees                                                                       | $12,500.00
    Litigation Services
      11/05/2024 | INV  | INV-1002 | ABC Industries     | Litigation support - Phase 1            | $15,000.00
      11/15/2024 | INV  | INV-1005 | ABC Industries     | Litigation support - Phase 2            | $12,500.00
      Total Litigation Services                                                                     | $27,500.00
    Document Preparation
      11/12/2024 | INV  | INV-1004 | Tech Startup LLC   | Document preparation - incorporation    | $3,500.00
      Total Document Preparation                                                                    | $3,500.00
    Total Legal Fees                                                                                | $43,500.00
  Retainer Fees
    11/20/2024 | SLS  | SR-001   | Various Clients    | Monthly retainer - November             | $5,000.00
    Total Retainer Fees                                                                             | $5,000.00
Total Income                                                                                        | $48,500.00

EXPENSES
  Office Supplies
    Stationery
      11/03/2024 | CHK  | 1001     | Office Depot       | Legal pads, pens, folders               | $245.75
      11/14/2024 | CHK  | 1002     | Staples            | Paper supplies                          | $87.50
      Total Stationery                                                                              | $333.25
    Computer Supplies
      11/08/2024 | CC   | CC-4521  | Amazon             | Printer toner cartridges                | $189.99
      Total Computer Supplies                                                                       | $189.99
    Total Office Supplies                                                                           | $523.24
  Bank Charges
    Service Charges
      11/01/2024 | EXP  | BC-001   | First National Bank | Monthly service charge                 | $25.00
      11/22/2024 | EXP  | BC-003   | First National Bank | Overdraft protection fee               | $15.00
      Total Service Charges                                                                         | $40.00
    Wire Transfer Fees
      11/15/2024 | EXP  | BC-002   | First National Bank | Wire transfer to client trust          | $35.00
      Total Wire Transfer Fees                                                                      | $35.00
    Total Bank Charges                                                                              | $75.00
  Travel
    Airfare
      11/04/2024 | CC   | CC-4522  | United Airlines    | Flight to NYC for deposition            | $485.00
      11/20/2024 | CC   | CC-4530  | Delta Airlines     | Flight to Chicago for client meeting    | $325.00
      Total Airfare                                                                                 | $810.00
    Lodging
      11/04/2024 | CC   | CC-4523  | Marriott Times Square | NYC hotel - 2 nights                 | $650.00
      Total Lodging                                                                                 | $650.00
    Ground Transportation
      11/05/2024 | CC   | CC-4524  | NYC Yellow Cab     | Taxi to courthouse                      | $45.00
      11/06/2024 | CC   | CC-4525  | Uber               | Return to airport                       | $62.00
      Total Ground Transportation                                                                   | $107.00
    Total Travel                                                                                    | $1,567.00
  Professional Services
    11/15/2024 | BILL | BILL-201 | IT Support Services | Monthly IT support                      | $500.00
    11/25/2024 | BILL | BILL-202 | Johnson CPA        | Monthly bookkeeping                     | $750.00
    Total Professional Services                                                                     | $1,250.00
  Rent Expense
    11/01/2024 | CHK  | 1000     | Main Street Properties | Office rent - November               | $3,500.00
    Total Rent Expense                                                                              | $3,500.00
  Utilities
    11/10/2024 | BILL | UTIL-001 | Pacific Gas & Electric | Electricity - October                | $285.00
    11/12/2024 | BILL | UTIL-002 | AT&T                | Phone and internet - November           | $195.00
    Total Utilities                                                                                 | $480.00
Total Expenses                                                                                      | $7,395.24

NET OPERATING INCOME                                                                                | $41,104.76

OTHER INCOME
  Interest Income
    11/30/2024 | DEP  | DEP-101  | First National Bank | Interest earned on operating account    | $125.50
    Total Interest Income                                                                           | $125.50
Total Other Income                                                                                  | $125.50

OTHER EXPENSES
  Miscellaneous Expense
    11/28/2024 | EXP  | MISC-001 | Misc               | Charitable donation                      | $250.00
    Total Miscellaneous Expense                                                                     | $250.00
Total Other Expenses                                                                                | $250.00

NET OTHER INCOME                                                                                    | -$124.50

NET INCOME                                                                                          | $40,980.26
*/
