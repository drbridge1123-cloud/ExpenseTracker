-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: expense_tracker
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `account_shares`
--

DROP TABLE IF EXISTS `account_shares`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_shares` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` int(10) unsigned NOT NULL,
  `shared_with_user_id` int(10) unsigned NOT NULL,
  `permission_level` enum('view','edit') DEFAULT 'view',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_shares_account` (`account_id`),
  KEY `idx_shares_user` (`shared_with_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_shares`
--

LOCK TABLES `account_shares` WRITE;
/*!40000 ALTER TABLE `account_shares` DISABLE KEYS */;
/*!40000 ALTER TABLE `account_shares` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `accounts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `institution_id` int(10) unsigned DEFAULT NULL,
  `account_name` varchar(100) NOT NULL,
  `account_type` enum('checking','savings','credit_card','investment','cash','loan','other') NOT NULL,
  `account_number_last4` char(4) DEFAULT NULL,
  `currency` char(3) DEFAULT 'USD',
  `current_balance` decimal(15,2) DEFAULT 0.00,
  `available_balance` decimal(15,2) DEFAULT NULL,
  `credit_limit` decimal(15,2) DEFAULT NULL COMMENT 'For credit cards',
  `interest_rate` decimal(5,4) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `include_in_totals` tinyint(1) DEFAULT 1,
  `color` char(7) DEFAULT NULL COMMENT 'Hex color for UI',
  `notes` text DEFAULT NULL,
  `last_synced_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_joint` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_accounts_user` (`user_id`),
  KEY `idx_accounts_institution` (`institution_id`),
  KEY `idx_accounts_type` (`account_type`),
  CONSTRAINT `fk_accounts_institution` FOREIGN KEY (`institution_id`) REFERENCES `financial_institutions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES (2,2,NULL,'Chase Reserved','credit_card',NULL,'USD',0.00,NULL,NULL,NULL,1,1,'#3b82f6',NULL,NULL,'2025-12-03 11:19:09','2025-12-03 11:19:09',0),(3,1,NULL,'Chase Reserved','credit_card',NULL,'USD',-6195.08,NULL,NULL,NULL,1,1,'#3b82f6',NULL,'2025-12-03 14:25:01','2025-12-03 11:24:41','2025-12-03 11:25:01',0),(4,1,NULL,'Bank of America Checking','checking',NULL,'USD',5000.00,NULL,NULL,NULL,1,1,NULL,NULL,NULL,'2025-12-03 14:12:54','2025-12-03 14:12:54',0),(5,1,NULL,'Wells Fargo Savings','savings',NULL,'USD',10000.00,NULL,NULL,NULL,1,1,NULL,NULL,NULL,'2025-12-03 14:12:54','2025-12-03 14:12:54',0),(6,1,NULL,'Visa Credit Card','credit_card',NULL,'USD',-1500.00,NULL,NULL,NULL,1,1,NULL,NULL,NULL,'2025-12-03 14:12:54','2025-12-03 14:12:54',0);
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int(10) unsigned DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
INSERT INTO `audit_log` VALUES (1,1,'create','account',1,NULL,'{\"user_id\":1,\"institution_id\":null,\"account_name\":\"Chase Reserved\",\"account_type\":\"credit_card\",\"account_number_last4\":null,\"currency\":\"USD\",\"current_balance\":0,\"available_balance\":null,\"credit_limit\":null,\"interest_rate\":null,\"is_active\":1,\"include_in_totals\":1,\"color\":\"#3b82f6\",\"notes\":null}','::1',NULL,'2025-12-03 11:18:51'),(2,1,'delete','account',1,'{\"id\":1,\"user_id\":1,\"institution_id\":null,\"account_name\":\"Chase Reserved\",\"account_type\":\"credit_card\",\"account_number_last4\":null,\"currency\":\"USD\",\"current_balance\":\"0.00\",\"available_balance\":null,\"credit_limit\":null,\"interest_rate\":null,\"is_active\":1,\"include_in_totals\":1,\"color\":\"#3b82f6\",\"notes\":null,\"last_synced_at\":null,\"created_at\":\"2025-12-03 03:18:51\",\"updated_at\":\"2025-12-03 03:18:51\",\"is_joint\":0}',NULL,'::1',NULL,'2025-12-03 11:18:58'),(3,2,'create','account',2,NULL,'{\"user_id\":2,\"institution_id\":null,\"account_name\":\"Chase Reserved\",\"account_type\":\"credit_card\",\"account_number_last4\":null,\"currency\":\"USD\",\"current_balance\":0,\"available_balance\":null,\"credit_limit\":null,\"interest_rate\":null,\"is_active\":1,\"include_in_totals\":1,\"color\":\"#3b82f6\",\"notes\":null}','::1',NULL,'2025-12-03 11:19:09'),(4,1,'create','account',3,NULL,'{\"user_id\":1,\"institution_id\":null,\"account_name\":\"Chase Reserved\",\"account_type\":\"credit_card\",\"account_number_last4\":null,\"currency\":\"USD\",\"current_balance\":0,\"available_balance\":null,\"credit_limit\":null,\"interest_rate\":null,\"is_active\":1,\"include_in_totals\":1,\"color\":\"#3b82f6\",\"notes\":null}','::1',NULL,'2025-12-03 11:24:41');
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budgets`
--

DROP TABLE IF EXISTS `budgets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `budgets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `category_id` int(10) unsigned DEFAULT NULL COMMENT 'NULL for overall budget',
  `budget_name` varchar(100) DEFAULT NULL,
  `budget_type` enum('monthly','weekly','yearly','custom') DEFAULT 'monthly',
  `amount` decimal(15,2) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `rollover` tinyint(1) DEFAULT 0 COMMENT 'Rollover unused amount',
  `alert_threshold` decimal(5,2) DEFAULT 80.00 COMMENT 'Alert at % spent',
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_budgets_user` (`user_id`),
  KEY `idx_budgets_category` (`category_id`),
  KEY `idx_budgets_dates` (`start_date`,`end_date`),
  CONSTRAINT `fk_budgets_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_budgets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budgets`
--

LOCK TABLES `budgets` WRITE;
/*!40000 ALTER TABLE `budgets` DISABLE KEYS */;
INSERT INTO `budgets` VALUES (2,1,143,'Groceries Budget','monthly',600.00,'2024-01-01',NULL,0,80.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53'),(3,1,144,'Dining Out Budget','monthly',300.00,'2024-01-01',NULL,0,75.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53'),(4,1,139,'Gas Budget','monthly',200.00,'2024-01-01',NULL,0,80.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53'),(5,1,146,'Clothing Budget','monthly',200.00,'2024-01-01',NULL,0,90.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53'),(6,1,133,'Housing Total','monthly',2200.00,'2024-01-01',NULL,0,85.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53'),(7,1,NULL,'Total Monthly Spending','monthly',4500.00,'2024-01-01',NULL,0,80.00,1,'2025-12-03 14:14:53','2025-12-03 14:14:53');
/*!40000 ALTER TABLE `budgets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL COMMENT 'NULL for system categories',
  `parent_id` int(10) unsigned DEFAULT NULL COMMENT 'For subcategories',
  `name` varchar(50) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `color` char(7) DEFAULT NULL,
  `category_type` enum('income','expense','transfer','other') DEFAULT 'expense',
  `is_system` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_slug_user` (`slug`,`user_id`),
  KEY `idx_categories_user` (`user_id`),
  KEY `idx_categories_parent` (`parent_id`),
  KEY `idx_categories_type` (`category_type`),
  CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_categories_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=220 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (122,1,NULL,'Assets','assets','🏦','#3B82F6','other',0,1,0,'2025-12-03 11:41:55'),(128,1,NULL,'Income','income','💵','#22C55E','income',0,1,6,'2025-12-03 11:41:55'),(129,1,128,'Salary','salary','💼','#22C55E','income',0,1,7,'2025-12-03 11:41:55'),(130,1,128,'Business Income','business-income','🏢','#22C55E','income',0,1,8,'2025-12-03 11:41:55'),(131,1,128,'Interest Income','interest-income','📈','#22C55E','income',0,1,9,'2025-12-03 11:41:55'),(132,1,128,'Reimbursement','reimbursement','🔄','#22C55E','income',0,1,10,'2025-12-03 11:41:55'),(133,1,NULL,'Housing','housing','🏠','#EF4444','expense',0,1,11,'2025-12-03 11:41:55'),(134,1,133,'Rent / Mortgage','rent-mortgage','🏡','#EF4444','expense',0,1,12,'2025-12-03 11:41:55'),(135,1,133,'Electric','electric','⚡','#F59E0B','expense',0,1,13,'2025-12-03 11:41:55'),(136,1,133,'Water','water','💧','#3B82F6','expense',0,1,14,'2025-12-03 11:41:55'),(137,1,133,'Internet','internet','🌐','#6366F1','expense',0,1,15,'2025-12-03 11:41:55'),(138,1,NULL,'Transportation','transportation','🚗','#F59E0B','expense',0,1,16,'2025-12-03 11:41:55'),(139,1,138,'Fuel','fuel','⛽','#F59E0B','expense',0,1,17,'2025-12-03 11:41:55'),(140,1,138,'Car Insurance','car-insurance','🛡','#F59E0B','expense',0,1,18,'2025-12-03 11:41:55'),(141,1,138,'Car Maintenance','car-maintenance','🔧','#F59E0B','expense',0,1,19,'2025-12-03 11:41:55'),(142,1,NULL,'Food','food','🍽','#EC4899','expense',0,1,20,'2025-12-03 11:41:55'),(143,1,142,'Groceries','groceries','🛒','#EC4899','expense',0,1,21,'2025-12-03 11:41:55'),(144,1,142,'Dining Out','dining-out','🍔','#EC4899','expense',0,1,22,'2025-12-03 11:41:55'),(145,1,NULL,'Personal','personal','👤','#8B5CF6','expense',0,1,23,'2025-12-03 11:41:55'),(146,1,145,'Clothing','clothing','👕','#8B5CF6','expense',0,1,24,'2025-12-03 11:41:55'),(147,1,145,'Health & Wellness','health-wellness','💪','#8B5CF6','expense',0,1,25,'2025-12-03 11:41:55'),(148,1,145,'Education','education','📚','#8B5CF6','expense',0,1,26,'2025-12-03 11:41:55'),(149,1,NULL,'Financial','financial','💳','#6366F1','expense',0,1,27,'2025-12-03 11:41:55'),(150,1,149,'Credit Card Payment','cc-payment','💳','#6366F1','expense',0,1,28,'2025-12-03 11:41:55'),(151,1,149,'Bank Fee','bank-fee','🏦','#6366F1','expense',0,1,29,'2025-12-03 11:41:55'),(152,1,149,'Insurance','insurance','🛡','#6366F1','expense',0,1,30,'2025-12-03 11:41:55'),(153,1,NULL,'Miscellaneous','misc','📦','#64748B','expense',0,1,31,'2025-12-03 11:41:55'),(154,1,153,'Gifts','gifts','🎁','#64748B','expense',0,1,32,'2025-12-03 11:41:55'),(155,1,153,'Travel','travel','✈','#64748B','expense',0,1,33,'2025-12-03 11:41:55'),(156,2,NULL,'Assets','assets','🏦','#3B82F6','other',0,1,0,'2025-12-03 11:41:55'),(159,2,NULL,'Income','income','💵','#22C55E','income',0,1,3,'2025-12-03 11:41:55'),(160,2,159,'Salary','salary','💼','#22C55E','income',0,1,4,'2025-12-03 11:41:55'),(161,2,159,'Gift Income','gift-income','🎁','#22C55E','income',0,1,5,'2025-12-03 11:41:55'),(162,2,159,'Reimbursement','reimbursement','🔄','#22C55E','income',0,1,6,'2025-12-03 11:41:55'),(163,2,NULL,'Housing','housing','🏠','#EF4444','expense',0,1,7,'2025-12-03 11:41:55'),(164,2,163,'Rent / Mortgage','rent-mortgage','🏡','#EF4444','expense',0,1,8,'2025-12-03 11:41:55'),(165,2,163,'Utilities','utilities','💡','#EF4444','expense',0,1,9,'2025-12-03 11:41:55'),(166,2,NULL,'Food','food','🍽','#EC4899','expense',0,1,10,'2025-12-03 11:41:55'),(167,2,166,'Groceries','groceries','🛒','#EC4899','expense',0,1,11,'2025-12-03 11:41:55'),(168,2,166,'Dining','dining','🍔','#EC4899','expense',0,1,12,'2025-12-03 11:41:55'),(169,2,NULL,'Transportation','transportation','🚗','#F59E0B','expense',0,1,13,'2025-12-03 11:41:55'),(170,2,169,'Gas','gas','⛽','#F59E0B','expense',0,1,14,'2025-12-03 11:41:55'),(171,2,169,'Maintenance','maintenance','🔧','#F59E0B','expense',0,1,15,'2025-12-03 11:41:55'),(172,2,NULL,'Personal','personal','👤','#8B5CF6','expense',0,1,16,'2025-12-03 11:41:55'),(173,2,172,'Beauty','beauty','💄','#EC4899','expense',0,1,17,'2025-12-03 11:41:55'),(174,2,172,'Fitness','fitness','💪','#8B5CF6','expense',0,1,18,'2025-12-03 11:41:55'),(175,2,172,'Education','education','📚','#8B5CF6','expense',0,1,19,'2025-12-03 11:41:55'),(176,2,NULL,'Medical','medical','🏥','#EF4444','expense',0,1,20,'2025-12-03 11:41:55'),(177,2,176,'Hospital','hospital','🏥','#EF4444','expense',0,1,21,'2025-12-03 11:41:55'),(178,2,176,'Pharmacy','pharmacy','💊','#EF4444','expense',0,1,22,'2025-12-03 11:41:55'),(179,2,NULL,'Misc','misc','📦','#64748B','expense',0,1,23,'2025-12-03 11:41:55'),(180,2,179,'Travel','travel','✈','#64748B','expense',0,1,24,'2025-12-03 11:41:55'),(181,2,179,'Shopping','shopping','🛍','#64748B','expense',0,1,25,'2025-12-03 11:41:55'),(182,3,NULL,'Property Income','property-income','💰','#22C55E','income',0,1,0,'2025-12-03 11:41:55'),(183,3,182,'Residential Rent','residential-rent','🏠','#22C55E','income',0,1,1,'2025-12-03 11:41:55'),(184,3,182,'Commercial Rent','commercial-rent','🏢','#22C55E','income',0,1,2,'2025-12-03 11:41:55'),(185,3,182,'Late Fees','late-fees','⏰','#F59E0B','income',0,1,3,'2025-12-03 11:41:55'),(186,3,182,'Other Income (Laundry/Parking)','other-income','📋','#22C55E','income',0,1,4,'2025-12-03 11:41:55'),(187,3,NULL,'Bank Accounts','bank-accounts','🏦','#3B82F6','other',0,1,5,'2025-12-03 11:41:55'),(188,3,187,'Operating Account','operating-account','💳','#3B82F6','other',0,1,6,'2025-12-03 11:41:55'),(189,3,187,'Security Deposit Account','security-deposit','🔒','#3B82F6','other',0,1,7,'2025-12-03 11:41:55'),(190,3,187,'Reserve Account','reserve-account','🏧','#3B82F6','other',0,1,8,'2025-12-03 11:41:55'),(191,3,187,'Owner Distribution Account','owner-distribution','💵','#3B82F6','other',0,1,9,'2025-12-03 11:41:55'),(192,3,NULL,'Operating Expenses','operating-expenses','🔧','#EF4444','expense',0,1,10,'2025-12-03 11:41:55'),(193,3,192,'Utilities - Water/Sewer','utilities-water','💧','#3B82F6','expense',0,1,11,'2025-12-03 11:41:55'),(194,3,192,'Utilities - Electric/Gas','utilities-electric','⚡','#F59E0B','expense',0,1,12,'2025-12-03 11:41:55'),(195,3,192,'Repairs - General','repairs-general','🔧','#EF4444','expense',0,1,13,'2025-12-03 11:41:55'),(196,3,192,'Repairs - Contractor/Labor','repairs-contractor','👷','#EF4444','expense',0,1,14,'2025-12-03 11:41:55'),(197,3,192,'Supplies & Materials','supplies-materials','📦','#64748B','expense',0,1,15,'2025-12-03 11:41:55'),(198,3,NULL,'Administrative','administrative','📋','#6366F1','expense',0,1,16,'2025-12-03 11:41:55'),(199,3,198,'Property Management Fee','pm-fee','🏢','#6366F1','expense',0,1,17,'2025-12-03 11:41:55'),(200,3,198,'Accounting & Bookkeeping','accounting','📊','#6366F1','expense',0,1,18,'2025-12-03 11:41:55'),(201,3,198,'Bank Service Charges','bank-charges','🏦','#6366F1','expense',0,1,19,'2025-12-03 11:41:55'),(202,3,198,'Office Supplies','office-supplies','📎','#6366F1','expense',0,1,20,'2025-12-03 11:41:55'),(203,3,NULL,'Capital Improvements','capital-improvements','🏗','#8B5CF6','expense',0,1,21,'2025-12-03 11:41:55'),(204,3,203,'Major Renovation','major-renovation','🏗','#8B5CF6','expense',0,1,22,'2025-12-03 11:41:55'),(205,3,203,'Roof Replacement','roof-replacement','🏠','#8B5CF6','expense',0,1,23,'2025-12-03 11:41:55'),(206,3,203,'HVAC/Plumbing Replacement','hvac-plumbing','🔧','#8B5CF6','expense',0,1,24,'2025-12-03 11:41:55'),(207,3,203,'Exterior Improvements','exterior-improvements','🌳','#8B5CF6','expense',0,1,25,'2025-12-03 11:41:55'),(208,3,NULL,'Loan Accounts','loan-accounts','📄','#DC2626','expense',0,1,26,'2025-12-03 11:41:55'),(209,3,208,'Mortgage Principal','mortgage-principal','🏠','#DC2626','expense',0,1,27,'2025-12-03 11:41:55'),(210,3,208,'Mortgage Interest','mortgage-interest','💰','#DC2626','expense',0,1,28,'2025-12-03 11:41:55'),(211,3,208,'Escrow - Tax & Insurance','escrow','📋','#DC2626','expense',0,1,29,'2025-12-03 11:41:55'),(212,3,208,'Property Tax Payable','property-tax','🏛','#DC2626','expense',0,1,30,'2025-12-03 11:41:55'),(213,3,NULL,'Owner Equity','owner-equity','👤','#059669','other',0,1,31,'2025-12-03 11:41:55'),(214,3,213,'Owner Contribution','owner-contribution','➕','#22C55E','income',0,1,32,'2025-12-03 11:41:55'),(215,3,213,'Owner Draws','owner-draws','➖','#EF4444','expense',0,1,33,'2025-12-03 11:41:55'),(216,3,213,'Retained Earnings','retained-earnings','📈','#059669','other',0,1,34,'2025-12-03 11:41:55'),(217,1,NULL,'Uncategorized','uncategorized','❓','#9CA3AF','expense',1,1,999,'2025-12-03 11:46:41'),(218,2,NULL,'Uncategorized','uncategorized','❓','#9CA3AF','expense',1,1,999,'2025-12-03 11:46:41'),(219,3,NULL,'Uncategorized','uncategorized','❓','#9CA3AF','expense',1,1,999,'2025-12-03 11:46:41');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categorization_rules`
--

DROP TABLE IF EXISTS `categorization_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categorization_rules` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL COMMENT 'NULL for global rules',
  `category_id` int(10) unsigned NOT NULL,
  `rule_name` varchar(100) DEFAULT NULL,
  `match_field` enum('description','vendor','memo','amount','any') DEFAULT 'description',
  `match_type` enum('contains','starts_with','ends_with','exact','regex') DEFAULT 'contains',
  `match_value` varchar(255) NOT NULL,
  `match_case_sensitive` tinyint(1) DEFAULT 0,
  `priority` int(11) DEFAULT 100 COMMENT 'Lower = higher priority',
  `hit_count` int(10) unsigned DEFAULT 0,
  `last_hit_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_rules_user` (`user_id`),
  KEY `idx_rules_category` (`category_id`),
  KEY `idx_rules_priority` (`priority`),
  KEY `idx_rules_active` (`is_active`),
  CONSTRAINT `fk_rules_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rules_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categorization_rules`
--

LOCK TABLES `categorization_rules` WRITE;
/*!40000 ALTER TABLE `categorization_rules` DISABLE KEYS */;
INSERT INTO `categorization_rules` VALUES (47,1,142,'Starbucks to Food','description','contains','STARBUCKS',0,100,0,NULL,1,'2025-12-03 12:00:41','2025-12-03 12:00:41'),(48,1,139,'Fuel purchases','description','contains','SHELL',0,100,0,NULL,1,'2025-12-03 12:00:41','2025-12-03 12:00:41'),(49,1,139,'Chevron fuel','description','contains','CHEVRON',0,100,0,NULL,1,'2025-12-03 12:00:41','2025-12-03 12:00:41'),(50,1,142,'Target to Food','description','contains','TARGET',0,100,1,'2025-12-03 12:02:09',1,'2025-12-03 12:02:03','2025-12-03 12:02:09'),(51,1,142,'Trader Joes to Food','description','contains','TRADER JOE',0,100,3,'2025-12-03 12:02:09',1,'2025-12-03 12:02:03','2025-12-03 12:02:09'),(52,1,142,'Taco Bell to Food','description','contains','TACO BELL',0,100,1,'2025-12-03 12:02:09',1,'2025-12-03 12:02:03','2025-12-03 12:02:09'),(53,1,142,'Coffee to Food','description','contains','COFFEE',0,100,1,'2025-12-03 12:02:09',1,'2025-12-03 12:02:03','2025-12-03 12:02:09'),(54,1,143,'Costco Groceries','description','contains','Costco',0,100,5,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(55,1,143,'Trader Joes','description','contains','Trader Joe',0,100,3,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(56,1,143,'Whole Foods','description','contains','Whole Foods',0,100,2,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(57,1,144,'Starbucks','description','contains','Starbucks',0,100,10,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(58,1,144,'Chipotle','description','contains','Chipotle',0,100,4,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(59,1,139,'Shell Gas','description','contains','Shell',0,100,8,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(60,1,139,'Chevron Gas','description','contains','Chevron',0,100,5,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(61,1,137,'Xfinity Internet','description','contains','Xfinity',0,100,12,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(62,1,129,'Salary Deposit','description','contains','Salary',0,100,24,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11'),(63,1,147,'CVS Pharmacy','description','contains','CVS',0,100,6,NULL,1,'2025-12-03 14:14:11','2025-12-03 14:14:11');
/*!40000 ALTER TABLE `categorization_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `checks`
--

DROP TABLE IF EXISTS `checks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `checks` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `account_id` int(10) unsigned NOT NULL,
  `transaction_id` int(10) unsigned DEFAULT NULL,
  `check_number` varchar(20) NOT NULL,
  `payee` varchar(200) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `check_date` date NOT NULL,
  `memo` text DEFAULT NULL,
  `category_id` int(10) unsigned DEFAULT NULL,
  `status` enum('pending','cleared','void') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_checks_account_number` (`account_id`,`check_number`),
  KEY `idx_checks_user` (`user_id`),
  KEY `idx_checks_account` (`account_id`),
  KEY `idx_checks_date` (`check_date`),
  KEY `fk_checks_transaction` (`transaction_id`),
  KEY `fk_checks_category` (`category_id`),
  CONSTRAINT `fk_checks_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_checks_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_checks_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_checks_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `checks`
--

LOCK TABLES `checks` WRITE;
/*!40000 ALTER TABLE `checks` DISABLE KEYS */;
/*!40000 ALTER TABLE `checks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `financial_institutions`
--

DROP TABLE IF EXISTS `financial_institutions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `financial_institutions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `short_code` varchar(20) NOT NULL,
  `institution_type` enum('bank','credit_union','credit_card','investment','other') DEFAULT 'bank',
  `country` char(2) DEFAULT 'US',
  `csv_format` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'CSV column mapping configuration' CHECK (json_valid(`csv_format`)),
  `logo_url` varchar(500) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_institutions_code` (`short_code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `financial_institutions`
--

LOCK TABLES `financial_institutions` WRITE;
/*!40000 ALTER TABLE `financial_institutions` DISABLE KEYS */;
INSERT INTO `financial_institutions` VALUES (1,'Chase Bank','CHASE','bank','US','{\"date_col\": 0, \"description_col\": 1, \"amount_col\": 2, \"type_col\": 3, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(2,'Bank of America','BOFA','bank','US','{\"date_col\": 0, \"description_col\": 1, \"amount_col\": 2, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(3,'Wells Fargo','WF','bank','US','{\"date_col\": 0, \"amount_col\": 1, \"description_col\": 4, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(4,'Capital One','CAPONE','credit_card','US','{\"date_col\": 0, \"post_date_col\": 1, \"description_col\": 3, \"debit_col\": 5, \"credit_col\": 6, \"date_format\": \"Y-m-d\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(5,'American Express','AMEX','credit_card','US','{\"date_col\": 0, \"description_col\": 1, \"amount_col\": 2, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(6,'Discover','DISCOVER','credit_card','US','{\"date_col\": 0, \"post_date_col\": 1, \"description_col\": 2, \"amount_col\": 3, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(7,'Citi Bank','CITI','bank','US','{\"date_col\": 0, \"description_col\": 2, \"debit_col\": 3, \"credit_col\": 4, \"date_format\": \"m/d/Y\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(8,'Generic CSV','GENERIC','other','US','{\"date_col\": 0, \"description_col\": 1, \"amount_col\": 2, \"date_format\": \"Y-m-d\"}',NULL,NULL,1,'2025-12-03 09:41:13'),(9,'Chase Credit Card','CHASE_CC','credit_card','US','{\"date_col\":0,\"post_date_col\":1,\"description_col\":2,\"category_col\":3,\"type_col\":4,\"amount_col\":5,\"memo_col\":6,\"date_format\":\"m\\/d\\/Y\",\"has_header\":true}',NULL,NULL,1,'2025-12-03 11:23:58');
/*!40000 ALTER TABLE `financial_institutions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `import_batches`
--

DROP TABLE IF EXISTS `import_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `import_batches` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `account_id` int(10) unsigned NOT NULL,
  `institution_id` int(10) unsigned DEFAULT NULL,
  `filename` varchar(255) NOT NULL,
  `file_hash` char(64) NOT NULL,
  `file_size` int(10) unsigned DEFAULT NULL,
  `total_rows` int(10) unsigned DEFAULT 0,
  `imported_rows` int(10) unsigned DEFAULT 0,
  `duplicate_rows` int(10) unsigned DEFAULT 0,
  `error_rows` int(10) unsigned DEFAULT 0,
  `status` enum('pending','processing','completed','failed','partial') DEFAULT 'pending',
  `error_log` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`error_log`)),
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_batches_user` (`user_id`),
  KEY `idx_batches_account` (`account_id`),
  KEY `idx_batches_status` (`status`),
  KEY `fk_batches_institution` (`institution_id`),
  CONSTRAINT `fk_batches_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_batches_institution` FOREIGN KEY (`institution_id`) REFERENCES `financial_institutions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_batches_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `import_batches`
--

LOCK TABLES `import_batches` WRITE;
/*!40000 ALTER TABLE `import_batches` DISABLE KEYS */;
INSERT INTO `import_batches` VALUES (1,2,2,NULL,'Chase2446_Activity20241226_20250125_20251130.CSV','556f73c1509389d92a31d59552fe7e61256d4aec6ed205129376760c541574f4',2675,0,0,0,0,'processing',NULL,'2025-12-03 14:21:23',NULL,'2025-12-03 11:21:23'),(2,1,3,9,'Chase2446_Activity20241226_20250125_20251130.CSV','556f73c1509389d92a31d59552fe7e61256d4aec6ed205129376760c541574f4',2675,41,41,0,0,'completed',NULL,'2025-12-03 14:25:01','2025-12-03 14:25:01','2025-12-03 11:25:01');
/*!40000 ALTER TABLE `import_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `monthly_reports`
--

DROP TABLE IF EXISTS `monthly_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `monthly_reports` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `report_year` smallint(5) unsigned NOT NULL,
  `report_month` tinyint(3) unsigned NOT NULL,
  `total_income` decimal(15,2) DEFAULT 0.00,
  `total_expenses` decimal(15,2) DEFAULT 0.00,
  `net_savings` decimal(15,2) DEFAULT 0.00,
  `savings_rate` decimal(5,2) DEFAULT NULL,
  `category_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Spending by category' CHECK (json_valid(`category_breakdown`)),
  `account_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Activity by account' CHECK (json_valid(`account_breakdown`)),
  `daily_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Daily spending pattern' CHECK (json_valid(`daily_breakdown`)),
  `top_vendors` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Top spending vendors' CHECK (json_valid(`top_vendors`)),
  `comparison_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'vs previous periods' CHECK (json_valid(`comparison_data`)),
  `transaction_count` int(10) unsigned DEFAULT 0,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reports_user_period` (`user_id`,`report_year`,`report_month`),
  KEY `idx_reports_period` (`report_year`,`report_month`),
  CONSTRAINT `fk_reports_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monthly_reports`
--

LOCK TABLES `monthly_reports` WRITE;
/*!40000 ALTER TABLE `monthly_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `monthly_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `receipt_folders`
--

DROP TABLE IF EXISTS `receipt_folders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receipt_folders` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `name` varchar(100) NOT NULL,
  `folder_type` enum('custom','category') DEFAULT 'custom',
  `category_id` int(10) unsigned DEFAULT NULL COMMENT 'Link to category for auto-organize',
  `icon` varchar(50) DEFAULT NULL,
  `color` char(7) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_folders_user_name` (`user_id`,`name`),
  KEY `idx_folders_user` (`user_id`),
  KEY `idx_folders_category` (`category_id`),
  CONSTRAINT `fk_folders_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_folders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receipt_folders`
--

LOCK TABLES `receipt_folders` WRITE;
/*!40000 ALTER TABLE `receipt_folders` DISABLE KEYS */;
/*!40000 ALTER TABLE `receipt_folders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `receipts`
--

DROP TABLE IF EXISTS `receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receipts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `transaction_id` int(10) unsigned DEFAULT NULL,
  `folder_id` int(10) unsigned DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_type` varchar(50) DEFAULT NULL,
  `file_size` int(10) unsigned DEFAULT NULL,
  `description` text DEFAULT NULL,
  `receipt_date` date DEFAULT NULL,
  `vendor_name` varchar(200) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `reimbursement_status` enum('none','pending','submitted','approved','reimbursed') DEFAULT 'none',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_receipts_user` (`user_id`),
  KEY `idx_receipts_transaction` (`transaction_id`),
  KEY `idx_receipts_folder` (`folder_id`),
  CONSTRAINT `fk_receipts_folder` FOREIGN KEY (`folder_id`) REFERENCES `receipt_folders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_receipts_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_receipts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receipts`
--

LOCK TABLES `receipts` WRITE;
/*!40000 ALTER TABLE `receipts` DISABLE KEYS */;
/*!40000 ALTER TABLE `receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reconciliations`
--

DROP TABLE IF EXISTS `reconciliations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reconciliations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `account_id` int(10) unsigned NOT NULL,
  `statement_date` date NOT NULL,
  `statement_balance` decimal(15,2) NOT NULL,
  `reconciled_balance` decimal(15,2) DEFAULT NULL,
  `difference` decimal(15,2) DEFAULT NULL,
  `status` enum('in_progress','completed','abandoned') DEFAULT 'in_progress',
  `reconciled_date` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reconciliations_user` (`user_id`),
  KEY `idx_reconciliations_account` (`account_id`),
  KEY `idx_reconciliations_date` (`reconciled_date`),
  CONSTRAINT `fk_reconciliations_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reconciliations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reconciliations`
--

LOCK TABLES `reconciliations` WRITE;
/*!40000 ALTER TABLE `reconciliations` DISABLE KEYS */;
/*!40000 ALTER TABLE `reconciliations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `recurring_transactions`
--

DROP TABLE IF EXISTS `recurring_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `recurring_transactions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `account_id` int(10) unsigned NOT NULL,
  `category_id` int(10) unsigned DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `vendor_name` varchar(200) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `transaction_type` enum('debit','credit') NOT NULL,
  `frequency` enum('daily','weekly','biweekly','monthly','quarterly','yearly') NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `next_occurrence` date NOT NULL,
  `day_of_month` tinyint(3) unsigned DEFAULT NULL,
  `day_of_week` tinyint(3) unsigned DEFAULT NULL,
  `auto_create` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_recurring_user` (`user_id`),
  KEY `idx_recurring_next` (`next_occurrence`),
  KEY `fk_recurring_account` (`account_id`),
  KEY `fk_recurring_category` (`category_id`),
  CONSTRAINT `fk_recurring_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recurring_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_recurring_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recurring_transactions`
--

LOCK TABLES `recurring_transactions` WRITE;
/*!40000 ALTER TABLE `recurring_transactions` DISABLE KEYS */;
INSERT INTO `recurring_transactions` VALUES (1,1,3,NULL,'House Payment',NULL,5000.00,'debit','monthly','2025-12-03','2026-01-03','2026-01-01',1,NULL,0,1,'2025-12-03 11:33:05','2025-12-03 11:33:05'),(2,1,4,134,'Monthly Rent',NULL,-1800.00,'debit','monthly','2024-01-01',NULL,'2024-12-01',1,NULL,1,1,'2025-12-03 14:14:29','2025-12-03 14:14:29'),(3,1,4,129,'Monthly Salary',NULL,5500.00,'credit','monthly','2024-01-01',NULL,'2024-12-01',1,NULL,1,1,'2025-12-03 14:14:29','2025-12-03 14:14:29'),(4,1,4,137,'Xfinity Internet',NULL,-79.99,'debit','monthly','2024-01-05',NULL,'2024-12-05',5,NULL,1,1,'2025-12-03 14:14:29','2025-12-03 14:14:29'),(5,1,4,140,'Progressive Insurance',NULL,-145.00,'debit','monthly','2024-01-15',NULL,'2024-12-15',15,NULL,1,1,'2025-12-03 14:14:29','2025-12-03 14:14:29'),(6,1,4,152,'Health Insurance Premium',NULL,-350.00,'debit','monthly','2024-01-01',NULL,'2024-12-01',1,NULL,0,1,'2025-12-03 14:14:29','2025-12-03 14:14:29'),(7,1,5,131,'Savings Interest',NULL,45.00,'credit','monthly','2024-01-15',NULL,'2024-12-15',15,NULL,0,1,'2025-12-03 14:14:29','2025-12-03 14:14:29');
/*!40000 ALTER TABLE `recurring_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transactions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `account_id` int(10) unsigned NOT NULL,
  `category_id` int(10) unsigned DEFAULT NULL,
  `transaction_date` date NOT NULL,
  `post_date` date DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `original_description` varchar(500) DEFAULT NULL COMMENT 'Raw description from import',
  `vendor_name` varchar(200) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL COMMENT 'Negative for debits, positive for credits',
  `currency` char(3) DEFAULT 'USD',
  `transaction_type` enum('debit','credit','transfer','adjustment') NOT NULL,
  `status` enum('pending','posted','reconciled','void') DEFAULT 'posted',
  `is_recurring` tinyint(1) DEFAULT 0,
  `is_split` tinyint(1) DEFAULT 0,
  `parent_transaction_id` int(10) unsigned DEFAULT NULL COMMENT 'For split transactions',
  `transfer_account_id` int(10) unsigned DEFAULT NULL COMMENT 'For transfers',
  `check_number` varchar(20) DEFAULT NULL,
  `reference_number` varchar(50) DEFAULT NULL,
  `memo` text DEFAULT NULL,
  `tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`tags`)),
  `location` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Geo data if available' CHECK (json_valid(`location`)),
  `import_hash` char(64) DEFAULT NULL COMMENT 'SHA256 for deduplication',
  `import_batch_id` int(10) unsigned DEFAULT NULL,
  `categorized_by` enum('rule','ai','manual','default') DEFAULT 'default',
  `categorization_confidence` decimal(3,2) DEFAULT NULL,
  `is_reviewed` tinyint(1) DEFAULT 0,
  `is_reconciled` tinyint(1) DEFAULT 0,
  `reimbursement_status` enum('none','pending','submitted','approved','reimbursed') DEFAULT 'none',
  `reimbursement_date` date DEFAULT NULL,
  `reimbursement_notes` text DEFAULT NULL,
  `reconciliation_id` int(10) unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transactions_hash` (`import_hash`),
  KEY `idx_transactions_user` (`user_id`),
  KEY `idx_transactions_account` (`account_id`),
  KEY `idx_transactions_category` (`category_id`),
  KEY `idx_transactions_date` (`transaction_date`),
  KEY `idx_transactions_type` (`transaction_type`),
  KEY `idx_transactions_status` (`status`),
  KEY `idx_transactions_vendor` (`vendor_name`),
  KEY `idx_transactions_batch` (`import_batch_id`),
  KEY `idx_transactions_user_date` (`user_id`,`transaction_date`),
  KEY `idx_transactions_reconciliation` (`reconciliation_id`),
  KEY `fk_transactions_parent` (`parent_transaction_id`),
  KEY `fk_transactions_transfer` (`transfer_account_id`),
  CONSTRAINT `fk_transactions_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transactions_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_parent` FOREIGN KEY (`parent_transaction_id`) REFERENCES `transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_transfer` FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=145 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (72,1,4,129,'2024-11-01','2024-11-01','Monthly Salary - November','DIRECT DEP ACME CORP PAYROLL','Acme Corporation',5500.00,'USD','credit','reconciled',1,0,NULL,NULL,NULL,'PAY-2024-11-001','Regular bi-weekly salary','[\"income\", \"salary\", \"recurring\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','02f39b905661650195f8f36fc3915063',NULL,'rule',0.95,1,1,'none',NULL,NULL,NULL,'2024-11-02 17:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(73,1,4,129,'2024-10-01','2024-10-01','Monthly Salary - October','DIRECT DEP ACME CORP PAYROLL','Acme Corporation',5500.00,'USD','credit','reconciled',1,0,NULL,NULL,NULL,'PAY-2024-10-001','Regular bi-weekly salary','[\"income\", \"salary\", \"recurring\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','44ae95c24d5e5f40a23934b2d36b97f8',NULL,'rule',0.95,1,1,'none',NULL,NULL,NULL,'2024-10-02 17:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(74,1,4,129,'2024-09-01','2024-09-01','Monthly Salary - September','DIRECT DEP ACME CORP PAYROLL','Acme Corporation',5500.00,'USD','credit','reconciled',1,0,NULL,NULL,NULL,'PAY-2024-09-001','Regular bi-weekly salary','[\"income\", \"salary\", \"recurring\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','bb3a35e7c77f16a2aabe451f4c4f9fed',NULL,'rule',0.95,1,1,'none',NULL,NULL,NULL,'2024-09-02 17:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(75,1,5,131,'2024-11-15','2024-11-15','Savings Interest - November','INTEREST PAYMENT','Wells Fargo',45.00,'USD','credit','posted',0,0,NULL,NULL,NULL,'INT-2024-11-001','Monthly interest earned','[\"income\", \"interest\", \"passive\"]',NULL,'1918ae43817e8c66800f149aa95fa1f2',NULL,'rule',0.90,1,0,'none',NULL,NULL,NULL,'2024-11-16 17:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(76,1,5,131,'2024-10-15','2024-10-15','Savings Interest - October','INTEREST PAYMENT','Wells Fargo',42.50,'USD','credit','reconciled',0,0,NULL,NULL,NULL,'INT-2024-10-001','Monthly interest earned','[\"income\", \"interest\", \"passive\"]',NULL,'ee854c71a1ccbb30706878e32b980b82',NULL,'rule',0.90,1,1,'none',NULL,NULL,NULL,'2024-10-16 16:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(77,1,4,130,'2024-11-10','2024-11-12','Freelance Project Payment','ZELLE FROM JOHN DOE','John Doe Consulting',1200.00,'USD','credit','posted',0,0,NULL,NULL,NULL,'ZELLE-2024-11-001','Website redesign project','[\"income\", \"freelance\", \"side-hustle\"]','{\"city\": \"Remote\", \"state\": \"CA\"}','a1e2aef4d7954f32abc3ca7842aefa14',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,'2024-11-11 22:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(78,1,4,132,'2024-11-20','2024-11-21','Work Expense Reimbursement','ACH CREDIT ACME CORP EXPENSE','Acme Corporation',350.00,'USD','credit','posted',0,0,NULL,NULL,NULL,'REIMB-2024-11-001','Travel expenses for client meeting','[\"income\", \"reimbursement\", \"work\"]',NULL,'c50f7e7e6cbcc896964369a7c53ce115',NULL,'manual',1.00,1,0,'reimbursed',NULL,NULL,NULL,'2024-11-21 18:00:00','2025-12-03 14:21:20','2025-12-03 14:21:20'),(79,1,4,134,'2024-11-01','2024-11-01','November Rent Payment','ONLINE PMT SKYLINE APARTMENTS','Skyline Apartments',-1800.00,'USD','debit','reconciled',1,0,NULL,NULL,NULL,'RENT-2024-11','Monthly rent payment','[\"housing\", \"rent\", \"recurring\", \"fixed\"]','{\"address\": \"123 Main St\", \"city\": \"San Francisco\", \"state\": \"CA\"}','6cdb35468044f42fb5f730daf594fc3b',NULL,'rule',0.98,1,1,'none',NULL,NULL,NULL,'2024-11-02 15:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(80,1,4,134,'2024-10-01','2024-10-01','October Rent Payment','ONLINE PMT SKYLINE APARTMENTS','Skyline Apartments',-1800.00,'USD','debit','reconciled',1,0,NULL,NULL,NULL,'RENT-2024-10','Monthly rent payment','[\"housing\", \"rent\", \"recurring\", \"fixed\"]','{\"address\": \"123 Main St\", \"city\": \"San Francisco\", \"state\": \"CA\"}','6cd630758fac93212c5ea081e0e5e6af',NULL,'rule',0.98,1,1,'none',NULL,NULL,NULL,'2024-10-02 15:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(81,1,4,135,'2024-11-10','2024-11-11','Electric Bill - November','PG&E ELEC AUTOPAY','PG&E',-145.50,'USD','debit','posted',1,0,NULL,NULL,NULL,'PGE-2024-11','Monthly electric bill','[\"housing\", \"utilities\", \"electric\", \"recurring\"]',NULL,'54980370bb8ab075968e2e005f5fbfd5',NULL,'rule',0.92,1,0,'none',NULL,NULL,NULL,'2024-11-11 17:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(82,1,4,136,'2024-11-08','2024-11-09','Water Bill - November','SFPUC WATER AUTOPAY','SF Water Dept',-48.00,'USD','debit','posted',1,0,NULL,NULL,NULL,'WATER-2024-11','Monthly water bill','[\"housing\", \"utilities\", \"water\", \"recurring\"]',NULL,'ae3159eced16a5d478a5a068b8d1bd4d',NULL,'rule',0.92,1,0,'none',NULL,NULL,NULL,'2024-11-09 17:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(83,1,4,137,'2024-11-05','2024-11-05','Internet Bill - Xfinity','COMCAST XFINITY AUTOPAY','Xfinity',-79.99,'USD','debit','posted',1,0,NULL,NULL,NULL,'XFINITY-2024-11','Monthly internet service','[\"housing\", \"utilities\", \"internet\", \"recurring\"]',NULL,'0f056c34d802f531294baaa1ab03abe5',NULL,'rule',0.95,1,0,'none',NULL,NULL,NULL,'2024-11-06 16:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(84,1,4,135,'2024-10-10','2024-10-11','Electric Bill - October','PG&E ELEC AUTOPAY','PG&E',-132.00,'USD','debit','reconciled',1,0,NULL,NULL,NULL,'PGE-2024-10','Monthly electric bill','[\"housing\", \"utilities\", \"electric\", \"recurring\"]',NULL,'934d32de910ff82dde2e7f2cf511babb',NULL,'rule',0.92,1,1,'none',NULL,NULL,NULL,'2024-10-11 16:00:00','2025-12-03 14:21:37','2025-12-03 14:21:37'),(85,1,6,139,'2024-11-22','2024-11-23','Shell Gas Station','SHELL OIL 57442 SAN FRAN','Shell',-58.50,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Regular unleaded','[\"transportation\", \"fuel\", \"gas\"]','{\"address\": \"500 Market St\", \"city\": \"San Francisco\", \"state\": \"CA\"}','e2ce6ee8e5f0d9faba7af3a2379d815c',NULL,'rule',0.88,1,0,'none',NULL,NULL,NULL,'2024-11-23 18:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(86,1,6,139,'2024-11-12','2024-11-13','Chevron Gas','CHEVRON 94501 OAKLAND','Chevron',-52.00,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,NULL,'[\"transportation\", \"fuel\", \"gas\"]','{\"city\": \"Oakland\", \"state\": \"CA\"}','2bb314f68426011577a1347d7ee5cd2f',NULL,'rule',0.88,1,0,'none',NULL,NULL,NULL,'2024-11-13 19:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(87,1,6,139,'2024-10-28','2024-10-29','Costco Gas','COSTCO GAS #1234','Costco',-48.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,NULL,'Costco member price','[\"transportation\", \"fuel\", \"gas\", \"costco\"]','{\"city\": \"Daly City\", \"state\": \"CA\"}','37d0cbe336a06a665b6bbe5a71c64df0',NULL,'rule',0.85,1,1,'none',NULL,NULL,NULL,'2024-10-29 22:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(88,1,4,140,'2024-11-15','2024-11-15','Car Insurance - Progressive','PROGRESSIVE INS AUTOPAY','Progressive Insurance',-145.00,'USD','debit','posted',1,0,NULL,NULL,NULL,'PROG-2024-11','Monthly auto insurance premium','[\"transportation\", \"insurance\", \"car\", \"recurring\"]',NULL,'117e8c38ce0a50ece164a30edf42fb45',NULL,'rule',0.95,1,0,'none',NULL,NULL,NULL,'2024-11-16 16:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(89,1,4,140,'2024-10-15','2024-10-15','Car Insurance - Progressive','PROGRESSIVE INS AUTOPAY','Progressive Insurance',-145.00,'USD','debit','reconciled',1,0,NULL,NULL,NULL,'PROG-2024-10','Monthly auto insurance premium','[\"transportation\", \"insurance\", \"car\", \"recurring\"]',NULL,'e620958757ceb7f9ebc398caa30f7169',NULL,'rule',0.95,1,1,'none',NULL,NULL,NULL,'2024-10-16 15:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(90,1,6,141,'2024-10-20','2024-10-21','Oil Change - Jiffy Lube','JIFFY LUBE #3892 SAN FRAN','Jiffy Lube',-75.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,'JL-INV-38921','Full synthetic oil change','[\"transportation\", \"maintenance\", \"car\", \"oil-change\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','78e1c307d124ff55fbd5acaf8b83bf0a',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,'2024-10-21 21:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(91,1,6,141,'2024-11-18','2024-11-19','Car Wash - Deluxe','QUICK QUACK CAR WASH','Quick Quack',-25.00,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Monthly unlimited membership','[\"transportation\", \"maintenance\", \"car\", \"carwash\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','36d9fd763bb42dd2302f490e5cb806c9',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,'2024-11-19 20:00:00','2025-12-03 14:21:58','2025-12-03 14:21:58'),(92,1,6,143,'2024-11-23','2024-11-24','Costco - Weekly Groceries','COSTCO WHSE #1234 DALY CIT','Costco',-195.50,'USD','debit','posted',0,0,NULL,NULL,NULL,'COSTCO-2024-11-23','Weekly grocery shopping','[\"food\", \"groceries\", \"costco\", \"bulk\"]','{\"city\": \"Daly City\", \"state\": \"CA\"}','1e05873c68def22730650949584390a0',NULL,'rule',0.92,1,0,'none',NULL,NULL,NULL,'2024-11-25 00:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(93,1,6,143,'2024-11-16','2024-11-17','Trader Joes','TRADER JOE S #567 SF','Trader Joes',-78.25,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Weekly produce and snacks','[\"food\", \"groceries\", \"organic\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','947e693933a0c034a49321c42d4fa00a',NULL,'rule',0.90,1,0,'none',NULL,NULL,NULL,'2024-11-17 19:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(94,1,6,143,'2024-11-09','2024-11-10','Whole Foods Market','WHOLE FOODS MKT SF','Whole Foods',-112.30,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Organic groceries','[\"food\", \"groceries\", \"organic\", \"whole-foods\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','23ce83f0a58385fd4deced267a0c54e2',NULL,'rule',0.90,1,0,'none',NULL,NULL,NULL,'2024-11-10 21:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(95,1,6,143,'2024-10-26','2024-10-27','Safeway Groceries','SAFEWAY #2891 SF','Safeway',-65.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,NULL,NULL,'[\"food\", \"groceries\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','aa395b4cb15f1d664a60d568278e61b5',NULL,'rule',0.88,1,1,'none',NULL,NULL,NULL,'2024-10-27 17:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(96,1,6,143,'2024-10-19','2024-10-20','Costco - Groceries','COSTCO WHSE #1234 DALY CIT','Costco',-220.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,'COSTCO-2024-10-19','Monthly bulk shopping','[\"food\", \"groceries\", \"costco\", \"bulk\"]','{\"city\": \"Daly City\", \"state\": \"CA\"}','1eeb73daa82e1567f35277bd24d4fee3',NULL,'rule',0.92,1,1,'none',NULL,NULL,NULL,'2024-10-20 22:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(97,1,6,144,'2024-11-24','2024-11-25','Cheesecake Factory','CHEESECAKE FACTORY SF','Cheesecake Factory',-95.00,'USD','debit','pending',0,0,NULL,NULL,NULL,NULL,'Birthday dinner','[\"food\", \"dining\", \"restaurant\", \"special-occasion\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','36ca1fe71b4b2e7e8f52755011307a3a',NULL,'rule',0.85,0,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:22:28','2025-12-03 14:22:28'),(98,1,6,144,'2024-11-19','2024-11-20','Chipotle','CHIPOTLE 1892 MARKET ST','Chipotle',-16.50,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Lunch','[\"food\", \"dining\", \"fast-casual\", \"lunch\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','3c3fc6660ccdd758800d44d9c2b4f804',NULL,'rule',0.92,1,0,'none',NULL,NULL,NULL,'2024-11-20 21:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(99,1,6,144,'2024-11-15','2024-11-16','Starbucks Coffee','STARBUCKS #18923 SF','Starbucks',-8.75,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Morning coffee','[\"food\", \"dining\", \"coffee\", \"breakfast\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','06adbef85d314b0cc264f369011bfec6',NULL,'rule',0.95,1,0,'none',NULL,NULL,NULL,'2024-11-16 16:30:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(100,1,6,144,'2024-11-11','2024-11-12','Starbucks Coffee','STARBUCKS #18923 SF','Starbucks',-7.50,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,NULL,'[\"food\", \"dining\", \"coffee\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','eb510aaef5adb92efaeed6d8d71ea8dc',NULL,'rule',0.95,1,0,'none',NULL,NULL,NULL,'2024-11-12 16:30:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(101,1,6,144,'2024-11-05','2024-11-06','McDonalds','MCDONALDS F12893 SF','McDonalds',-12.00,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Quick lunch','[\"food\", \"dining\", \"fast-food\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','b62a18b8e6de505453cb4b7711d68bbe',NULL,'rule',0.90,1,0,'none',NULL,NULL,NULL,'2024-11-06 20:30:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(102,1,6,144,'2024-10-22','2024-10-23','Olive Garden','OLIVE GARDEN #892 COLMA','Olive Garden',-72.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,NULL,'Family dinner','[\"food\", \"dining\", \"restaurant\", \"family\"]','{\"city\": \"Colma\", \"state\": \"CA\"}','43e9d25b867a75e9301494456250d0c7',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,'2024-10-24 03:00:00','2025-12-03 14:22:28','2025-12-03 14:22:28'),(103,1,6,146,'2024-11-21','2024-11-22','Target - Clothing','TARGET T-2893 SF','Target',-135.00,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Winter clothes','[\"shopping\", \"clothing\", \"retail\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','004511cd8c6d3cf271b410c3b063bb13',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,'2024-11-22 22:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(104,1,6,146,'2024-10-15','2024-10-17','Amazon - Running Shoes','AMZN MKTP US*2K9823','Amazon',-129.99,'USD','debit','reconciled',0,0,NULL,NULL,NULL,'112-3829182-2938291','Nike running shoes','[\"shopping\", \"clothing\", \"shoes\", \"amazon\", \"fitness\"]',NULL,'52a590e72646a15ded34460698a4f529',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,'2024-10-17 17:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(105,1,6,146,'2024-11-08','2024-11-10','Amazon - T-Shirts','AMZN MKTP US*8K2938','Amazon',-45.00,'USD','debit','posted',0,0,NULL,NULL,NULL,'112-9283746-1928374','Basic t-shirts pack','[\"shopping\", \"clothing\", \"amazon\"]',NULL,'3e4d74714cd9c661ed9cf5ac754c25c2',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,'2024-11-10 19:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(106,1,4,147,'2024-11-12','2024-11-12','CVS Pharmacy','CVS/PHARM #7382 SF','CVS Pharmacy',-45.00,'USD','debit','posted',0,0,NULL,NULL,NULL,NULL,'Prescription refill','[\"health\", \"pharmacy\", \"prescription\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','820c31a06f95dc82cdbde2b7f3d0b592',NULL,'rule',0.88,1,0,'none',NULL,NULL,NULL,'2024-11-13 17:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(107,1,4,147,'2024-10-25','2024-10-25','Doctor Visit Copay','KAISER PERM SF MED OFC','Kaiser Permanente',-40.00,'USD','debit','reconciled',0,0,NULL,NULL,NULL,'KP-2024-10-25','Annual checkup copay','[\"health\", \"medical\", \"doctor\", \"insurance\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','7ff761eb7842d757da8406fd045c6e4b',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,'2024-10-26 17:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(108,1,6,147,'2024-11-01','2024-11-02','Planet Fitness Membership','PLANET FITNESS SF','Planet Fitness',-24.99,'USD','debit','posted',1,0,NULL,NULL,NULL,'PF-2024-11','Monthly gym membership','[\"health\", \"fitness\", \"gym\", \"recurring\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','e9d8550c252c5ff952b634ef26adec80',NULL,'rule',0.95,1,0,'none',NULL,NULL,NULL,'2024-11-02 15:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(109,1,6,154,'2024-11-20','2024-11-22','Amazon - Birthday Gift','AMZN MKTP US*9K2873','Amazon',-85.00,'USD','debit','posted',0,0,NULL,NULL,NULL,'112-8372619-9283746','Gift for mom birthday','[\"shopping\", \"gift\", \"amazon\", \"birthday\"]',NULL,'aff464288a9e68e693011f1abb667de7',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,'2024-11-22 17:00:00','2025-12-03 14:22:50','2025-12-03 14:22:50'),(114,1,4,151,'2024-11-05','2024-11-05','Monthly Service Fee','MONTHLY SERVICE FEE','Bank of America',-12.00,'USD','','posted',0,0,NULL,NULL,NULL,'FEE-2024-001','Regular monthly fee','[\"fee\", \"bank\"]','{\"city\": \"Charlotte\", \"state\": \"NC\"}','hash_fin_001',NULL,'',0.95,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:29','2025-12-03 14:27:16'),(115,1,4,151,'2024-10-05','2024-10-05','Monthly Service Fee','MONTHLY SERVICE FEE','Bank of America',-12.00,'USD','','posted',0,0,NULL,NULL,NULL,'FEE-2024-002','Regular monthly fee','[\"fee\", \"bank\"]','{\"city\": \"Charlotte\", \"state\": \"NC\"}','hash_fin_002',NULL,'',0.95,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:29','2025-12-03 14:27:16'),(116,1,4,151,'2024-11-15','2024-11-15','Wire Transfer Fee','WIRE TRANSFER FEE OUTGOING','Bank of America',-35.00,'USD','','posted',0,0,NULL,NULL,NULL,'WIRE-2024-001','International wire to Korea','[\"fee\", \"wire\"]','{\"city\": \"Charlotte\", \"state\": \"NC\"}','hash_fin_003',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:29','2025-12-03 14:27:16'),(117,1,4,149,'2024-11-20','2024-11-20','ATM Withdrawal','ATM WITHDRAWAL 7-ELEVEN','ATM',-200.00,'USD','','posted',0,0,NULL,NULL,NULL,'ATM-2024-001','Cash for weekend','[\"cash\", \"atm\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_fin_004',NULL,'',0.90,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:29','2025-12-03 14:27:16'),(118,1,6,148,'2024-11-01','2024-11-03','Udemy Course','UDEMY*COURSE PURCHASE','Udemy',-49.99,'USD','','posted',0,0,NULL,NULL,NULL,'EDU-2024-001','Python Advanced Course','[\"education\", \"online\"]','{\"city\": \"San Francisco\", \"state\": \"CA\"}','hash_edu_001',NULL,'',0.92,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:41','2025-12-03 14:27:16'),(119,1,6,148,'2024-10-15','2024-10-17','Coursera Annual','COURSERA*ANNUAL SUBSCRIPTION','Coursera',-199.00,'USD','','posted',0,0,NULL,NULL,NULL,'EDU-2024-002','Annual learning subscription','[\"education\", \"subscription\"]','{\"city\": \"Mountain View\", \"state\": \"CA\"}','hash_edu_002',NULL,'',0.95,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:41','2025-12-03 14:27:16'),(120,1,4,148,'2024-11-10','2024-11-10','Books Purchase','BARNES NOBLE BOOKSELLERS','Barnes & Noble',-35.00,'USD','','posted',0,0,NULL,NULL,NULL,'EDU-2024-003','Programming books','[\"education\", \"books\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_edu_003',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:41','2025-12-03 14:27:16'),(121,1,4,152,'2024-11-01','2024-11-01','Health Insurance','KAISER PERMANENTE INSURANCE','Kaiser Permanente',-180.00,'USD','','posted',0,0,NULL,NULL,NULL,'INS-2024-001','Monthly health premium','[\"insurance\", \"health\"]','{\"city\": \"Oakland\", \"state\": \"CA\"}','hash_ins_001',NULL,'',0.98,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:54','2025-12-03 14:27:16'),(122,1,4,152,'2024-10-01','2024-10-01','Health Insurance','KAISER PERMANENTE INSURANCE','Kaiser Permanente',-180.00,'USD','','posted',0,0,NULL,NULL,NULL,'INS-2024-002','Monthly health premium','[\"insurance\", \"health\"]','{\"city\": \"Oakland\", \"state\": \"CA\"}','hash_ins_002',NULL,'',0.98,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:54','2025-12-03 14:27:16'),(123,1,4,152,'2024-11-15','2024-11-15','Renters Insurance','LEMONADE INS PREMIUM','Lemonade Insurance',-45.00,'USD','','posted',0,0,NULL,NULL,NULL,'INS-2024-003','Monthly renters policy','[\"insurance\", \"renters\"]','{\"city\": \"New York\", \"state\": \"NY\"}','hash_ins_003',NULL,'',0.95,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:24:54','2025-12-03 14:27:16'),(124,1,6,155,'2024-10-20','2024-10-22','Flight to Seattle','UNITED AIRLINES WEB','United Airlines',-450.00,'USD','','posted',0,0,NULL,NULL,NULL,'TRV-2024-001','Business trip round trip','[\"travel\", \"flight\"]','{\"city\": \"Chicago\", \"state\": \"IL\"}','hash_trv_001',NULL,'',0.95,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:11','2025-12-03 14:27:16'),(125,1,6,155,'2024-10-21','2024-10-23','Hotel Seattle','MARRIOTT SEATTLE DOWNTOWN','Marriott',-189.00,'USD','','posted',0,0,NULL,NULL,NULL,'TRV-2024-002','2 nights downtown','[\"travel\", \"hotel\"]','{\"city\": \"Seattle\", \"state\": \"WA\"}','hash_trv_002',NULL,'',0.96,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:11','2025-12-03 14:27:16'),(126,1,6,155,'2024-10-22','2024-10-24','Uber in Seattle','UBER TRIP','Uber',-45.00,'USD','','posted',0,0,NULL,NULL,NULL,'TRV-2024-003','Airport to hotel and back','[\"travel\", \"rideshare\"]','{\"city\": \"Seattle\", \"state\": \"WA\"}','hash_trv_003',NULL,'',0.88,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:11','2025-12-03 14:27:16'),(127,1,6,155,'2024-11-25','2024-11-27','Flight to Denver','SOUTHWEST AIRLINES','Southwest',-320.00,'USD','','posted',0,0,NULL,NULL,NULL,'TRV-2024-004','Thanksgiving trip','[\"travel\", \"flight\"]','{\"city\": \"Dallas\", \"state\": \"TX\"}','hash_trv_004',NULL,'',0.95,0,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:11','2025-12-03 14:27:16'),(128,1,4,149,'2024-11-01','2024-11-01','Transfer to Savings','ONLINE TRANSFER TO SAVINGS','Internal Transfer',-500.00,'USD','transfer','posted',0,0,NULL,5,NULL,'XFR-2024-001','Monthly savings goal','[\"transfer\", \"savings\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_001',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(129,1,5,149,'2024-11-01','2024-11-01','Transfer from Checking','ONLINE TRANSFER FROM CHECKING','Internal Transfer',500.00,'USD','transfer','posted',0,0,NULL,4,NULL,'XFR-2024-001R','Monthly savings goal','[\"transfer\", \"savings\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_002',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(130,1,4,150,'2024-11-10','2024-11-10','Credit Card Payment','VISA CREDIT CARD PAYMENT','Visa Payment',-1500.00,'USD','transfer','posted',0,0,NULL,6,NULL,'XFR-2024-002','Pay off credit card','[\"transfer\", \"payment\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_003',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(131,1,6,150,'2024-11-10','2024-11-10','Payment Received','PAYMENT RECEIVED THANK YOU','Payment',1500.00,'USD','transfer','posted',0,0,NULL,4,NULL,'XFR-2024-002R','Payment from checking','[\"transfer\", \"payment\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_004',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(132,1,4,149,'2024-10-01','2024-10-01','Transfer to Savings','ONLINE TRANSFER TO SAVINGS','Internal Transfer',-500.00,'USD','transfer','posted',0,0,NULL,5,NULL,'XFR-2024-003','Monthly savings goal','[\"transfer\", \"savings\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_005',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(133,1,5,149,'2024-10-01','2024-10-01','Transfer from Checking','ONLINE TRANSFER FROM CHECKING','Internal Transfer',500.00,'USD','transfer','posted',0,0,NULL,4,NULL,'XFR-2024-003R','Monthly savings goal','[\"transfer\", \"savings\"]','{\"city\": \"Online\", \"state\": \"NA\"}','hash_xfr_006',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:31','2025-12-03 14:27:16'),(134,1,6,153,'2024-11-08','2024-11-10','Haircut','GREAT CLIPS','Great Clips',-25.00,'USD','','posted',0,0,NULL,NULL,NULL,'MISC-2024-001','Monthly haircut','[\"personal\", \"grooming\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_misc_001',NULL,'',0.85,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:44','2025-12-03 14:27:16'),(135,1,4,153,'2024-11-12','2024-11-12','Netflix Subscription','NETFLIX.COM','Netflix',-15.99,'USD','','posted',0,0,NULL,NULL,NULL,'MISC-2024-002','Monthly streaming','[\"subscription\", \"entertainment\"]','{\"city\": \"Los Gatos\", \"state\": \"CA\"}','hash_misc_002',NULL,'',0.92,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:44','2025-12-03 14:27:16'),(136,1,4,153,'2024-10-12','2024-10-12','Netflix Subscription','NETFLIX.COM','Netflix',-15.99,'USD','','posted',0,0,NULL,NULL,NULL,'MISC-2024-003','Monthly streaming','[\"subscription\", \"entertainment\"]','{\"city\": \"Los Gatos\", \"state\": \"CA\"}','hash_misc_003',NULL,'',0.92,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:44','2025-12-03 14:27:16'),(137,1,4,153,'2024-11-15','2024-11-15','Spotify Premium','SPOTIFY USA','Spotify',-14.99,'USD','','posted',0,0,NULL,NULL,NULL,'MISC-2024-004','Monthly music','[\"subscription\", \"music\"]','{\"city\": \"New York\", \"state\": \"NY\"}','hash_misc_004',NULL,'',0.93,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:44','2025-12-03 14:27:16'),(138,1,6,153,'2024-11-18','2024-11-20','Pet Supplies','PETCO ANIMAL SUPPLIES','Petco',-89.00,'USD','','posted',0,0,NULL,NULL,NULL,'MISC-2024-005','Dog food and treats','[\"pet\", \"supplies\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_misc_005',NULL,'',0.88,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:44','2025-12-03 14:27:16'),(139,1,6,143,'2024-11-28',NULL,'Costco Groceries','COSTCO WHSE #1234','Costco',-156.78,'USD','','pending',0,0,NULL,NULL,NULL,NULL,'Bulk shopping','[\"groceries\", \"bulk\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_pend_001',NULL,'',0.90,0,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:56','2025-12-03 14:25:56'),(140,1,6,139,'2024-11-29',NULL,'Gas Station','SHELL OIL 57442344233','Shell',-55.00,'USD','','pending',0,0,NULL,NULL,NULL,NULL,'Fill up tank','[\"fuel\", \"gas\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_pend_002',NULL,'',0.95,0,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:56','2025-12-03 14:25:56'),(141,1,6,144,'2024-11-30',NULL,'Restaurant','CHIPOTLE MEXICAN GRILL','Chipotle',-42.50,'USD','','pending',0,0,NULL,NULL,NULL,NULL,'Dinner with friends','[\"dining\", \"fast-casual\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_pend_003',NULL,'',0.88,0,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:25:56','2025-12-03 14:25:56'),(142,1,6,146,'2024-11-05','2024-11-07','Returned Item','NORDSTROM RETURN','Nordstrom',-89.99,'USD','','void',0,0,NULL,NULL,NULL,'VOID-2024-001','Returned - wrong size','[\"clothing\", \"return\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_void_001',NULL,'manual',1.00,1,0,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:26:09','2025-12-03 14:26:09'),(143,1,4,134,'2024-11-01','2024-11-03','Rent Payment','CHECK 1001 LANDLORD','Property Management',-1800.00,'USD','','posted',0,0,NULL,NULL,'1001','CHK-2024-001','November rent payment','[\"rent\", \"housing\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_chk_001',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:26:20','2025-12-03 14:27:16'),(144,1,4,147,'2024-11-10','2024-11-12','Dentist Visit','CHECK 1002 DENTAL OFFICE','Dr. Smith Dental',-250.00,'USD','','posted',0,0,NULL,NULL,'1002','CHK-2024-002','Regular checkup and cleaning','[\"health\", \"dental\"]','{\"city\": \"Los Angeles\", \"state\": \"CA\"}','hash_chk_002',NULL,'manual',1.00,1,1,'none',NULL,NULL,NULL,NULL,'2025-12-03 14:26:20','2025-12-03 14:27:16');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_sessions`
--

DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_sessions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `session_token` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sessions_token` (`session_token`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_sessions`
--

LOCK TABLES `user_sessions` WRITE;
/*!40000 ALTER TABLE `user_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_settings`
--

DROP TABLE IF EXISTS `user_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `setting_key` varchar(50) NOT NULL,
  `setting_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`setting_value`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settings_user_key` (`user_id`,`setting_key`),
  CONSTRAINT `fk_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_settings`
--

LOCK TABLES `user_settings` WRITE;
/*!40000 ALTER TABLE `user_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(100) DEFAULT NULL,
  `default_currency` char(3) DEFAULT 'USD',
  `timezone` varchar(50) DEFAULT 'UTC',
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_admin` tinyint(1) DEFAULT 0,
  `last_login` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Daniel','drbridge1123@gmail.com','$2y$10$uag96FxX0ATgDhXFnNeX4.wjyF.FMVT5uvS77E0TjUSJih5FlbMgW','Daniel','USD','UTC',1,'2025-12-03 09:46:44','2025-12-03 11:43:11',1,'2025-12-03 11:43:11'),(2,'Hyunji','yhj413@gmail.com','$2y$10$1KEpM4HMKhS2dWHrT4nlB..aTv767hkAdubHv.ayfwfL/bCgmmy4y','Hyunji','USD','UTC',1,'2025-12-03 11:10:50','2025-12-03 11:10:50',1,NULL),(3,'Jianiel','Jianielllc@gmail.com','$2y$10$mmqv4fhG329Q7ynEAbFdLOqLpzajZ4nCw7sQtRglq8.WpTqaa8r4y','Jianiel','USD','UTC',1,'2025-12-03 11:11:14','2025-12-03 11:11:48',0,'2025-12-03 11:11:48');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-03  6:32:37
