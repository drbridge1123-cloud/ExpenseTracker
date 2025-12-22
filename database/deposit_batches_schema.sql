-- =====================================================
-- Deposit Batches Schema (QuickBooks Style)
-- 여러 체크를 하나의 은행 입금으로 묶는 구조
-- =====================================================

-- deposit_batches: 은행에 입금한 하나의 deposit slip
CREATE TABLE IF NOT EXISTS `deposit_batches` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `account_id` INT UNSIGNED NOT NULL COMMENT 'IOLTA bank account',

    -- Batch 정보
    `batch_date` DATE NOT NULL COMMENT '입금 날짜',
    `bank_reference` VARCHAR(50) NULL COMMENT 'Deposit slip number',
    `memo` VARCHAR(500) NULL,

    -- 합계 (자동 계산됨)
    `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `item_count` INT NOT NULL DEFAULT 0,

    -- 상태
    `status` ENUM('draft', 'posted', 'reconciled') NOT NULL DEFAULT 'draft',
    `posted_at` TIMESTAMP NULL,
    `posted_by` INT UNSIGNED NULL,

    -- 감사 추적
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_batches_user` (`user_id`),
    KEY `idx_batches_account` (`account_id`),
    KEY `idx_batches_date` (`batch_date`),
    KEY `idx_batches_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- deposit_items: 배치 안의 개별 체크들
CREATE TABLE IF NOT EXISTS `deposit_items` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `deposit_batch_id` INT UNSIGNED NOT NULL,
    `client_id` INT UNSIGNED NOT NULL COMMENT 'trust_clients.id',

    -- 아이템 정보
    `amount` DECIMAL(15,2) NOT NULL,
    `check_number` VARCHAR(50) NULL,
    `description` VARCHAR(500) NULL,
    `payee_name` VARCHAR(200) NULL COMMENT '체크 발행인',

    -- 포스팅 후 링크
    `staging_id` INT UNSIGNED NULL COMMENT '원본 staging record (있으면)',
    `trust_transaction_id` INT UNSIGNED NULL COMMENT '포스팅된 transaction',

    -- 순서
    `sequence` INT NOT NULL DEFAULT 0,

    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_items_batch` (`deposit_batch_id`),
    KEY `idx_items_client` (`client_id`),
    KEY `idx_items_staging` (`staging_id`),
    KEY `idx_items_transaction` (`trust_transaction_id`),

    CONSTRAINT `fk_items_batch` FOREIGN KEY (`deposit_batch_id`)
        REFERENCES `deposit_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 트리거: 아이템 추가/삭제 시 배치 합계 자동 업데이트
DELIMITER //

CREATE TRIGGER IF NOT EXISTS `update_batch_totals_insert`
AFTER INSERT ON `deposit_items`
FOR EACH ROW
BEGIN
    UPDATE deposit_batches
    SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM deposit_items WHERE deposit_batch_id = NEW.deposit_batch_id),
        item_count = (SELECT COUNT(*) FROM deposit_items WHERE deposit_batch_id = NEW.deposit_batch_id)
    WHERE id = NEW.deposit_batch_id;
END//

CREATE TRIGGER IF NOT EXISTS `update_batch_totals_update`
AFTER UPDATE ON `deposit_items`
FOR EACH ROW
BEGIN
    UPDATE deposit_batches
    SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM deposit_items WHERE deposit_batch_id = NEW.deposit_batch_id),
        item_count = (SELECT COUNT(*) FROM deposit_items WHERE deposit_batch_id = NEW.deposit_batch_id)
    WHERE id = NEW.deposit_batch_id;
END//

CREATE TRIGGER IF NOT EXISTS `update_batch_totals_delete`
AFTER DELETE ON `deposit_items`
FOR EACH ROW
BEGIN
    UPDATE deposit_batches
    SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM deposit_items WHERE deposit_batch_id = OLD.deposit_batch_id),
        item_count = (SELECT COUNT(*) FROM deposit_items WHERE deposit_batch_id = OLD.deposit_batch_id)
    WHERE id = OLD.deposit_batch_id;
END//

DELIMITER ;
