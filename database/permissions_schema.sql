-- Permissions Schema for Role-Based Access Control
-- Run this SQL to add permission management to the expense tracker

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_label VARCHAR(100) NOT NULL,
    description TEXT,
    is_system TINYINT(1) DEFAULT 0 COMMENT 'System roles cannot be deleted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default roles
INSERT INTO roles (role_name, role_label, description, is_system) VALUES
('admin', 'Administrator', 'Full access to all features and settings', 1),
('manager', 'Manager', 'Can manage transactions, reports, and view all data', 1),
('staff', 'Staff', 'Can add/edit own transactions and view reports', 1)
ON DUPLICATE KEY UPDATE role_label = VALUES(role_label);

-- Permissions table (defines all available permissions)
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    permission_label VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default permissions
INSERT INTO permissions (permission_key, permission_label, category, description) VALUES
-- Transaction permissions
('transactions.view', 'View Transactions', 'Transactions', 'View transaction list and details'),
('transactions.view_all', 'View All Users Transactions', 'Transactions', 'View transactions from all users'),
('transactions.create', 'Create Transactions', 'Transactions', 'Add new transactions'),
('transactions.edit', 'Edit Transactions', 'Transactions', 'Modify existing transactions'),
('transactions.edit_all', 'Edit All Users Transactions', 'Transactions', 'Modify any user transactions'),
('transactions.delete', 'Delete Transactions', 'Transactions', 'Remove transactions'),
('transactions.delete_all', 'Delete All Users Transactions', 'Transactions', 'Remove any user transactions'),
('transactions.import', 'Import Transactions', 'Transactions', 'Import transactions from CSV'),
('transactions.export', 'Export Transactions', 'Transactions', 'Export transactions to CSV'),

-- Account permissions
('accounts.view', 'View Accounts', 'Accounts', 'View account list'),
('accounts.create', 'Create Accounts', 'Accounts', 'Add new bank accounts'),
('accounts.edit', 'Edit Accounts', 'Accounts', 'Modify account settings'),
('accounts.delete', 'Delete Accounts', 'Accounts', 'Remove accounts'),

-- Category permissions
('categories.view', 'View Categories', 'Categories', 'View category list'),
('categories.create', 'Create Categories', 'Categories', 'Add new categories'),
('categories.edit', 'Edit Categories', 'Categories', 'Modify categories'),
('categories.delete', 'Delete Categories', 'Categories', 'Remove categories'),

-- Rules permissions
('rules.view', 'View Rules', 'Rules', 'View categorization rules'),
('rules.create', 'Create Rules', 'Rules', 'Add new rules'),
('rules.edit', 'Edit Rules', 'Rules', 'Modify rules'),
('rules.delete', 'Delete Rules', 'Rules', 'Remove rules'),

-- Reports permissions
('reports.view', 'View Reports', 'Reports', 'Access report pages'),
('reports.view_all', 'View All Users Reports', 'Reports', 'View reports for all users'),
('reports.export', 'Export Reports', 'Reports', 'Export reports to PDF/CSV'),

-- Budget permissions
('budgets.view', 'View Budgets', 'Budgets', 'View budget settings'),
('budgets.create', 'Create Budgets', 'Budgets', 'Add new budgets'),
('budgets.edit', 'Edit Budgets', 'Budgets', 'Modify budgets'),
('budgets.delete', 'Delete Budgets', 'Budgets', 'Remove budgets'),

-- Recurring permissions
('recurring.view', 'View Recurring', 'Recurring', 'View recurring transactions'),
('recurring.create', 'Create Recurring', 'Recurring', 'Add new recurring'),
('recurring.edit', 'Edit Recurring', 'Recurring', 'Modify recurring'),
('recurring.delete', 'Delete Recurring', 'Recurring', 'Remove recurring'),

-- Check writing permissions
('checks.view', 'View Checks', 'Checks', 'View check register'),
('checks.create', 'Write Checks', 'Checks', 'Create new checks'),
('checks.edit', 'Edit Checks', 'Checks', 'Modify checks'),
('checks.delete', 'Delete Checks', 'Checks', 'Void/delete checks'),
('checks.print', 'Print Checks', 'Checks', 'Print checks'),

-- Reconciliation permissions
('reconcile.view', 'View Reconciliation', 'Reconciliation', 'View reconciliation page'),
('reconcile.perform', 'Perform Reconciliation', 'Reconciliation', 'Execute account reconciliation'),

-- Data Management permissions
('data.backup', 'Create Backup', 'Data Management', 'Create full data backup'),
('data.restore', 'Restore Backup', 'Data Management', 'Restore from backup'),
('data.import', 'Import Data', 'Data Management', 'Import data from files'),
('data.export', 'Export Data', 'Data Management', 'Export data to files'),

-- IOLTA Trust permissions
('iolta.view', 'View IOLTA', 'IOLTA Trust', 'Access IOLTA pages'),
('iolta.manage_clients', 'Manage Trust Clients', 'IOLTA Trust', 'Add/edit trust clients'),
('iolta.write_checks', 'Write Trust Checks', 'IOLTA Trust', 'Write checks from trust'),
('iolta.deposit', 'Make Deposits', 'IOLTA Trust', 'Deposit to trust accounts'),
('iolta.transfer', 'Transfer Funds', 'IOLTA Trust', 'Transfer between trust accounts'),
('iolta.reconcile', 'Trust Reconciliation', 'IOLTA Trust', 'Perform 3-way reconciliation'),
('iolta.audit', 'View Audit Log', 'IOLTA Trust', 'View trust audit trail'),

-- Admin permissions
('admin.view', 'View Admin Panel', 'Administration', 'Access admin panel'),
('admin.manage_users', 'Manage Users', 'Administration', 'Add/edit/delete users'),
('admin.manage_roles', 'Manage Roles', 'Administration', 'Configure role permissions'),
('admin.system_settings', 'System Settings', 'Administration', 'Modify system configuration')
ON DUPLICATE KEY UPDATE permission_label = VALUES(permission_label);

-- Role-Permission mapping table
CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- User role assignment (add role_id to users table if not exists)
-- ALTER TABLE users ADD COLUMN role_id INT DEFAULT 3 AFTER is_admin;
-- ALTER TABLE users ADD FOREIGN KEY (role_id) REFERENCES roles(id);

-- Default role permissions for Admin (all permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Default role permissions for Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE permission_key IN (
    'transactions.view', 'transactions.view_all', 'transactions.create', 'transactions.edit',
    'transactions.edit_all', 'transactions.delete', 'transactions.import', 'transactions.export',
    'accounts.view', 'accounts.create', 'accounts.edit',
    'categories.view', 'categories.create', 'categories.edit',
    'rules.view', 'rules.create', 'rules.edit', 'rules.delete',
    'reports.view', 'reports.view_all', 'reports.export',
    'budgets.view', 'budgets.create', 'budgets.edit', 'budgets.delete',
    'recurring.view', 'recurring.create', 'recurring.edit', 'recurring.delete',
    'checks.view', 'checks.create', 'checks.edit', 'checks.print',
    'reconcile.view', 'reconcile.perform',
    'data.backup', 'data.export',
    'iolta.view', 'iolta.manage_clients', 'iolta.write_checks', 'iolta.deposit',
    'iolta.transfer', 'iolta.reconcile', 'iolta.audit'
)
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Default role permissions for Staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE permission_key IN (
    'transactions.view', 'transactions.create', 'transactions.edit',
    'accounts.view',
    'categories.view',
    'rules.view',
    'reports.view',
    'budgets.view',
    'recurring.view', 'recurring.create',
    'checks.view', 'checks.create',
    'reconcile.view',
    'iolta.view'
)
ON DUPLICATE KEY UPDATE role_id = role_id;
