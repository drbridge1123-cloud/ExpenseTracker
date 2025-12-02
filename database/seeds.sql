-- ExpenseTracker Seed Data
-- Run after schema.sql to populate default data

-- =====================================================
-- Financial Institutions
-- =====================================================
INSERT INTO financial_institutions (name, short_code, institution_type, country, csv_format, is_active) VALUES
('Chase Bank', 'CHASE', 'bank', 'US', '{"date_col": 0, "description_col": 1, "amount_col": 2, "type_col": 3, "date_format": "m/d/Y"}', 1),
('Chase Credit Card', 'CHASE_CC', 'credit_card', 'US', '{"date_col": 0, "post_date_col": 1, "description_col": 2, "category_col": 3, "type_col": 4, "amount_col": 5, "memo_col": 6, "date_format": "m/d/Y", "has_header": true}', 1),
('Bank of America', 'BOFA', 'bank', 'US', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "m/d/Y"}', 1),
('Wells Fargo', 'WF', 'bank', 'US', '{"date_col": 0, "amount_col": 1, "description_col": 4, "date_format": "m/d/Y"}', 1),
('Capital One', 'CAPONE', 'credit_card', 'US', '{"date_col": 0, "post_date_col": 1, "description_col": 3, "debit_col": 5, "credit_col": 6, "date_format": "Y-m-d"}', 1),
('American Express', 'AMEX', 'credit_card', 'US', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "m/d/Y"}', 1),
('Discover', 'DISCOVER', 'credit_card', 'US', '{"date_col": 0, "post_date_col": 1, "description_col": 2, "amount_col": 3, "date_format": "m/d/Y"}', 1),
('Citi Bank', 'CITI', 'bank', 'US', '{"date_col": 0, "description_col": 2, "debit_col": 3, "credit_col": 4, "date_format": "m/d/Y"}', 1),
('Generic CSV', 'GENERIC', 'other', 'US', '{"date_col": 0, "description_col": 1, "amount_col": 2, "date_format": "Y-m-d"}', 1);

-- =====================================================
-- Categories
-- =====================================================

-- 1. Income
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(1, 'Income', 'income', 'dollar-sign', '#22c55e', 'income', 1, 1, NULL),
(2, 'Salary', 'salary', 'briefcase', '#22c55e', 'income', 1, 2, 1),
(3, 'Freelance / Side Income', 'freelance', 'laptop', '#22c55e', 'income', 1, 3, 1),
(4, 'Investment Income', 'investment-income', 'trending-up', '#22c55e', 'income', 1, 4, 1);

-- 2. Housing
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(5, 'Housing', 'housing', 'home', '#f97316', 'expense', 1, 5, NULL),
(6, 'Rent / Mortgage', 'rent-mortgage', 'home', '#f97316', 'expense', 1, 6, 5),
(7, 'Utilities', 'utilities', 'zap', '#f97316', 'expense', 1, 7, 5),
(8, 'Home Maintenance', 'home-maintenance', 'wrench', '#f97316', 'expense', 1, 8, 5);

-- 3. Food & Dining
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(9, 'Food and Dining', 'food-dining', 'utensils', '#ef4444', 'expense', 1, 9, NULL),
(10, 'Groceries', 'groceries', 'shopping-cart', '#ef4444', 'expense', 1, 10, 9),
(11, 'Restaurants', 'restaurants', 'utensils', '#ef4444', 'expense', 1, 11, 9),
(12, 'Coffee / Snacks', 'coffee-snacks', 'coffee', '#ef4444', 'expense', 1, 12, 9);

-- 4. Transportation
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(13, 'Transportation', 'transportation', 'car', '#22c55e', 'expense', 1, 13, NULL),
(14, 'Gas', 'gas', 'fuel', '#22c55e', 'expense', 1, 14, 13),
(15, 'Maintenance', 'vehicle-maintenance', 'wrench', '#22c55e', 'expense', 1, 15, 13),
(16, 'Auto Insurance', 'auto-insurance', 'shield', '#22c55e', 'expense', 1, 16, 13);

-- 5. Healthcare
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(17, 'Healthcare', 'healthcare', 'heart', '#a855f7', 'expense', 1, 17, NULL),
(18, 'Medical Visits', 'medical-visits', 'heart', '#a855f7', 'expense', 1, 18, 17),
(19, 'Pharmacy', 'pharmacy', 'heart', '#a855f7', 'expense', 1, 19, 17),
(20, 'Health Insurance', 'health-insurance', 'shield', '#a855f7', 'expense', 1, 20, 17);

-- 6. Insurance
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(21, 'Insurance', 'insurance', 'shield', '#6b7280', 'expense', 1, 21, NULL),
(22, 'Life Insurance', 'life-insurance', 'shield', '#6b7280', 'expense', 1, 22, 21),
(23, 'Home / Renters Insurance', 'home-renters-insurance', 'shield', '#6b7280', 'expense', 1, 23, 21),
(24, 'Auto Insurance General', 'auto-insurance-general', 'shield', '#6b7280', 'expense', 1, 24, 21);

-- 7. Education
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(25, 'Education', 'education', 'book', '#3b82f6', 'expense', 1, 25, NULL),
(26, 'Tuition / Courses', 'tuition-courses', 'book', '#3b82f6', 'expense', 1, 26, 25),
(27, 'Books / Materials', 'books-materials', 'book', '#3b82f6', 'expense', 1, 27, 25);

-- 8. Entertainment
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(28, 'Entertainment', 'entertainment', 'film', '#ec4899', 'expense', 1, 28, NULL),
(29, 'Streaming Services', 'streaming-services', 'film', '#ec4899', 'expense', 1, 29, 28),
(30, 'Events / Activities', 'events-activities', 'film', '#ec4899', 'expense', 1, 30, 28),
(31, 'Gaming / Hobbies', 'gaming-hobbies', 'smile', '#ec4899', 'expense', 1, 31, 28);

-- 9. Personal Care
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(32, 'Personal Care', 'personal-care', 'smile', '#f472b6', 'expense', 1, 32, NULL),
(33, 'Hair / Grooming', 'hair-grooming', 'smile', '#f472b6', 'expense', 1, 33, 32),
(34, 'Skincare / Products', 'skincare-products', 'smile', '#f472b6', 'expense', 1, 34, 32),
(35, 'Clothing', 'clothing', 'shopping-bag', '#f472b6', 'expense', 1, 35, 32);

-- 10. Shopping
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(36, 'Shopping', 'shopping', 'shopping-bag', '#a855f7', 'expense', 1, 36, NULL),
(37, 'Household Supplies', 'household-supplies', 'shopping-cart', '#a855f7', 'expense', 1, 37, 36),
(38, 'Electronics', 'electronics', 'smartphone', '#a855f7', 'expense', 1, 38, 36),
(39, 'Gifts Purchases', 'gifts-purchases', 'gift', '#a855f7', 'expense', 1, 39, 36);

-- 11. Travel
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(40, 'Travel', 'travel', 'plane', '#0ea5e9', 'expense', 1, 40, NULL),
(41, 'Flights', 'flights', 'plane', '#0ea5e9', 'expense', 1, 41, 40),
(42, 'Hotels', 'hotels', 'home', '#0ea5e9', 'expense', 1, 42, 40),
(43, 'Activities / Food', 'travel-activities', 'utensils', '#0ea5e9', 'expense', 1, 43, 40);

-- 12. Business Expenses
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(44, 'Business Expenses', 'business-expenses', 'briefcase', '#92400e', 'expense', 1, 44, NULL),
(45, 'Office Supplies', 'office-supplies', 'file-text', '#92400e', 'expense', 1, 45, 44),
(46, 'Software Subscriptions', 'software-subscriptions', 'laptop', '#92400e', 'expense', 1, 46, 44),
(47, 'Business Meals', 'business-meals', 'utensils', '#92400e', 'expense', 1, 47, 44);

-- 13. Property Management
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(48, 'Property Management', 'property-management', 'home', '#14b8a6', 'expense', 1, 48, NULL),
(49, 'Repairs and Maintenance', 'repairs-maintenance', 'wrench', '#14b8a6', 'expense', 1, 49, 48),
(50, 'Property Tax', 'property-tax', 'file-text', '#14b8a6', 'expense', 1, 50, 48),
(51, 'HOA / Insurance', 'hoa-insurance', 'shield', '#14b8a6', 'expense', 1, 51, 48);

-- 14. Financial
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(52, 'Financial', 'financial', 'dollar-sign', '#7c3aed', 'expense', 1, 52, NULL),
(53, 'Bank Fees', 'bank-fees', 'credit-card', '#7c3aed', 'expense', 1, 53, 52),
(54, 'Loan Payments', 'loan-payments', 'dollar-sign', '#7c3aed', 'expense', 1, 54, 52),
(55, 'Investments', 'investments', 'trending-up', '#7c3aed', 'expense', 1, 55, 52);

-- 15. Gifts / Charity
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(56, 'Gifts / Charity', 'gifts-charity', 'gift', '#f43f5e', 'expense', 1, 56, NULL),
(57, 'Gifts Given', 'gifts-given', 'gift', '#f43f5e', 'expense', 1, 57, 56),
(58, 'Donations', 'donations', 'heart', '#f43f5e', 'expense', 1, 58, 56);

-- 16. Uncategorized (for unmapped transactions)
INSERT INTO categories (id, name, slug, icon, color, category_type, is_system, sort_order, parent_id) VALUES
(59, 'Uncategorized', 'uncategorized', 'help-circle', '#9ca3af', 'expense', 1, 99, NULL);

-- =====================================================
-- Default User (optional - remove in production)
-- Password: Dbghrud83#
-- =====================================================
INSERT INTO users (username, email, password_hash, display_name, is_active, is_admin) VALUES
('Daniel', 'daniel@example.com', '$2y$10$vPh1rE2b0nvEcKtPkIfLOOvTaI4HzO5ps2STvMQ/KnLyIlLvKakQi', 'Daniel', 1, 1);
