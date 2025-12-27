# Technical Documentation

ExpensesTracker 개발자용 기술 문서 (Updated: 2025-01)

## 아키텍처 개요

### 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  public/                                                     │
│  ├── index.html          # SPA 메인 페이지                   │
│  ├── app.js              # 코어 앱 (초기화, 네비게이션)       │
│  ├── js/modules/*.js     # 기능별 모듈 (27개)                │
│  ├── js/api.js           # API 통신 레이어                   │
│  ├── js/state.js         # 전역 상태 관리                    │
│  ├── js/utils.js         # 유틸리티 함수                     │
│  └── styles/*.css        # 모듈화된 CSS (6개 파일)           │
├─────────────────────────────────────────────────────────────┤
│                      REST API Layer                          │
├─────────────────────────────────────────────────────────────┤
│  api/v1/                                                     │
│  ├── */index.php         # 각 리소스별 엔드포인트            │
│  ├── trust/*             # IOLTA/Trust Accounting API        │
│  ├── cost/*              # Cost Accounting API               │
│  ├── export/*            # Data Export API                   │
│  ├── import/*            # Data Import API                   │
│  ├── backup/*            # Backup API                        │
│  └── core/               # 공통 라이브러리                   │
├─────────────────────────────────────────────────────────────┤
│                      Database (MySQL)                        │
│  expense_tracker                                             │
│  ├── users, accounts, transactions, categories              │
│  ├── trust_clients, trust_ledger, trust_transactions        │
│  ├── trust_staging, checks, categorization_rules            │
│  └── recurring_transactions, budgets, receipts              │
└─────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

```
User Action → JS Module → api.js → PHP API → MySQL → JSON Response → JS → DOM Update
```

---

## Frontend 구조

### 모듈 시스템

app.js가 9,414줄에서 711줄로 리팩토링됨 (92% 감소)

총 27개 모듈, 30,472줄

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| **Core Modules** | | |
| categories.js | 2,644 | Chart of Accounts, 카테고리 CRUD |
| transactions.js | 1,385 | 거래 목록, 필터링, 상세 |
| receipts.js | 2,424 | 영수증 업로드, 연결 |
| reports.js | 1,996 | 리포트 생성, 차트 |
| dashboard.js | 736 | 대시보드, 요약 |
| accounts.js | 329 | 계좌 관리 |
| budgets.js | 295 | 예산 관리 |
| recurring.js | 302 | 반복 거래 |
| checks.js | 471 | 수표 관리 |
| rules.js | 462 | 자동분류 규칙 |
| reconcile.js | 419 | 계좌 조정 |
| import.js | 128 | CSV 가져오기 |
| custom-reports.js | 372 | 커스텀 리포트 빌더 |
| **IOLTA/Trust Modules** | | |
| iolta-common.js | 1,399 | Trust 공통 함수, 유틸리티 |
| iolta-ledger.js | 2,993 | Client Ledger, 트랜잭션 관리 |
| iolta-checks.js | 1,753 | Trust 수표 발행/관리 |
| iolta-staging.js | 1,138 | Bank Import Staging |
| iolta-reconcile.js | 1,254 | Trust 계좌 조정 |
| iolta-reports.js | 1,054 | Trust 리포트 (3-way 등) |
| **Cost Accounting Modules** | | |
| cost.js | 1,825 | Cost Accounting 메인 |
| cost-accounts.js | 440 | Cost 계좌 관리 |
| cost-clients.js | 317 | Cost 클라이언트 관리 |
| cost-reconcile.js | 935 | Cost 조정 |
| **Admin & Utility Modules** | | |
| admin.js | 584 | 관리자 패널 |
| cpa.js | 1,669 | CPA 포털 기능 |
| entities.js | 632 | Entity 관리 |
| data-management.js | 2,516 | Export/Import/Backup/Restore |

### CSS 모듈 구조

CSS가 6개 모듈 파일로 분리됨 (총 ~17,000줄)

| 파일 | 역할 |
|------|------|
| variables-and-base.css | CSS 변수, 기본 스타일 |
| layout-and-components.css | 레이아웃, 공통 컴포넌트 |
| pages-part1.css | 페이지별 스타일 1 |
| pages-part2.css | 페이지별 스타일 2 |
| pages-part3.css | 페이지별 스타일 3 |
| pages-part4.css | 페이지별 스타일 4 |

### 전역 노출 패턴

```javascript
// 각 모듈에서 함수를 window에 노출
function loadTransactions() { ... }
window.loadTransactions = loadTransactions;

// HTML에서 호출
<button onclick="loadTransactions()">Load</button>
```

### 상태 관리

```javascript
// js/state.js
const state = {
    currentUser: null,
    categories: [],
    accounts: [],
    transactions: [],
    // ...
};
```

### API 통신

```javascript
// js/api.js
async function apiGet(endpoint, params) {
    const url = new URL(API_BASE + endpoint);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url);
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}
```

---

## Backend 구조

### API 엔드포인트

#### Core Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET/POST | /api/v1/transactions/ | 거래 CRUD |
| PUT | /api/v1/transactions/update.php | 거래 수정 |
| DELETE | /api/v1/transactions/delete.php | 거래 삭제 |
| POST | /api/v1/transactions/bulk-categorize.php | 일괄 분류 |
| POST | /api/v1/transactions/apply-rules.php | 규칙 적용 |
| GET/POST | /api/v1/categories/ | 카테고리 CRUD |
| POST | /api/v1/categories/reorder.php | 카테고리 순서 변경 |
| GET/POST | /api/v1/accounts/ | 계좌 CRUD |
| POST | /api/v1/auth/ | 로그인 |
| GET | /api/v1/reports/ | 리포트 데이터 |
| GET | /api/v1/reports/profit-loss.php | 손익계산서 |
| GET | /api/v1/reports/summary.php | 요약 리포트 |

#### IOLTA/Trust Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET/POST | /api/v1/trust/clients.php | Trust 클라이언트 CRUD |
| GET/POST | /api/v1/trust/ledger.php | Client Ledger 조회/관리 |
| GET/POST | /api/v1/trust/transactions.php | Trust 트랜잭션 |
| GET/POST | /api/v1/trust/checks.php | Trust 수표 관리 |
| GET/POST | /api/v1/trust/deposits.php | Trust 입금 |
| POST | /api/v1/trust/batch-deposits.php | 일괄 입금 |
| GET/POST | /api/v1/trust/staging.php | Bank Import Staging |
| POST | /api/v1/trust/post.php | Staging → Ledger 전기 |
| GET | /api/v1/trust/reconcile.php | Trust 조정 |
| GET | /api/v1/trust/reports.php | Trust 리포트 |
| POST | /api/v1/trust/import.php | Trust 데이터 Import |
| GET | /api/v1/trust/export.php | Trust 데이터 Export |
| POST | /api/v1/trust/backup.php | Trust 백업 |
| POST | /api/v1/trust/restore.php | Trust 복원 |

#### Cost Accounting Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET/POST | /api/v1/cost/accounts.php | Cost 계좌 관리 |
| GET/POST | /api/v1/cost/transactions.php | Cost 트랜잭션 |
| GET | /api/v1/cost/reconcile.php | Cost 조정 |

#### Data Management Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/v1/export/transactions.php | 거래 내보내기 |
| GET | /api/v1/export/categories.php | 카테고리 내보내기 |
| GET | /api/v1/export/accounts.php | 계좌 내보내기 |
| GET | /api/v1/export/rules.php | 규칙 내보내기 |
| GET | /api/v1/export/recurring.php | 반복거래 내보내기 |
| GET | /api/v1/export/budgets.php | 예산 내보내기 |
| POST | /api/v1/import/*.php | 각 데이터 유형 가져오기 |
| POST | /api/v1/backup/create.php | 전체 백업 생성 |
| POST | /api/v1/restore/upload.php | 백업 복원 |

### Core 라이브러리

```php
// core/Database.php
class Database {
    private $pdo;

    public function __construct() {
        $config = require '../config/config.php';
        $this->pdo = new PDO(...);
    }

    public function query($sql, $params = []) { ... }
    public function fetch($sql, $params = []) { ... }
    public function fetchAll($sql, $params = []) { ... }
}

// core/Categorizer.php
class Categorizer {
    public function categorize($description) { ... }
    public function applyRules($transaction) { ... }
}

// core/CSVParser.php
class CSVParser {
    public function parse($file, $format) { ... }
}

// core/BackupManager.php
class BackupManager {
    public function createBackup($userId) { ... }
}

// core/RestoreManager.php
class RestoreManager {
    public function restore($file, $mode) { ... }
}
```

### 응답 형식

```json
{
    "success": true,
    "data": { ... },
    "message": "Operation completed"
}

{
    "success": false,
    "error": "Error message"
}
```

---

## Database 스키마

### 주요 테이블

```sql
-- 사용자
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 계좌
CREATE TABLE accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type ENUM('checking','savings','credit_card','investment','cash','loan','other'),
    current_balance DECIMAL(15,2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 거래
CREATE TABLE transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED,
    transaction_date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_type ENUM('debit','credit','transfer','adjustment'),
    reimbursement_status ENUM('none','pending','submitted','approved','reimbursed','denied'),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 카테고리 (계층형)
CREATE TABLE categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED,
    parent_id INT UNSIGNED,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50),
    category_type ENUM('income','expense','transfer','other'),
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);
```

### Trust/IOLTA 테이블

```sql
-- Trust 클라이언트
CREATE TABLE trust_clients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    client_number VARCHAR(50),
    client_name VARCHAR(255) NOT NULL,
    matter_number VARCHAR(50),
    matter_name VARCHAR(255),
    status ENUM('active','inactive','closed') DEFAULT 'active',
    opening_balance DECIMAL(15,2) DEFAULT 0.00,
    current_balance DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Trust 원장
CREATE TABLE trust_ledger (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    client_id INT UNSIGNED NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type ENUM('deposit','withdrawal','check','transfer','fee','interest','adjustment'),
    reference_number VARCHAR(50),
    payee VARCHAR(255),
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    running_balance DECIMAL(15,2),
    check_id INT UNSIGNED,
    reconciled TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (client_id) REFERENCES trust_clients(id)
);

-- Trust 트랜잭션 (전체 계좌 관점)
CREATE TABLE trust_transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    ledger_id INT UNSIGNED,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(50),
    reference_number VARCHAR(50),
    description TEXT,
    debit DECIMAL(15,2) DEFAULT 0.00,
    credit DECIMAL(15,2) DEFAULT 0.00,
    running_balance DECIMAL(15,2),
    reconciled TINYINT(1) DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (ledger_id) REFERENCES trust_ledger(id)
);

-- Bank Import Staging
CREATE TABLE trust_staging (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    transaction_date DATE NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(50),
    reference_number VARCHAR(50),
    client_id INT UNSIGNED,
    status ENUM('pending','matched','posted','skipped') DEFAULT 'pending',
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 기타 주요 테이블

```sql
-- 수표
CREATE TABLE checks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    check_number VARCHAR(20) NOT NULL,
    payee VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    check_date DATE NOT NULL,
    memo TEXT,
    status ENUM('pending','printed','cleared','voided') DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- 자동분류 규칙
CREATE TABLE categorization_rules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    rule_name VARCHAR(100),
    match_field ENUM('description','payee','amount'),
    match_type ENUM('contains','exact','starts_with','ends_with','regex'),
    match_value VARCHAR(255) NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    priority INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    hit_count INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 반복 거래
CREATE TABLE recurring_transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    account_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    frequency ENUM('daily','weekly','biweekly','monthly','quarterly','yearly'),
    next_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 예산
CREATE TABLE budgets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    budget_amount DECIMAL(15,2) NOT NULL,
    budget_period ENUM('monthly','quarterly','yearly') DEFAULT 'monthly',
    start_date DATE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### ERD 관계

```
users (1) ──── (N) accounts
users (1) ──── (N) transactions
users (1) ──── (N) categories
users (1) ──── (N) trust_clients
users (1) ──── (N) trust_ledger
users (1) ──── (N) checks

accounts (1) ──── (N) transactions
accounts (1) ──── (N) checks

categories (1) ──── (N) transactions
categories (1) ──── (N) categories (self-reference, parent-child)
categories (1) ──── (N) budgets
categories (1) ──── (N) categorization_rules

transactions (1) ──── (N) receipts

trust_clients (1) ──── (N) trust_ledger
trust_ledger (1) ──── (N) trust_transactions
trust_ledger (1) ──── (1) checks (for trust checks)
```

---

## 보안

### 인증
- 세션 기반 인증
- 비밀번호 해시 (password_hash)

### 보안 설정
```apache
# .htaccess
RewriteEngine On
RewriteRule ^config/ - [F,L]
RewriteRule ^core/ - [F,L]
```

### SQL Injection 방지
```php
// Prepared Statements 사용
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$id]);
```

---

## 개발 가이드

### 새 모듈 추가

1. `public/js/modules/newmodule.js` 생성
2. 함수 작성 후 `window.functionName = functionName` 으로 노출
3. `index.html`에 `<script src="js/modules/newmodule.js" defer></script>` 추가

### 새 API 엔드포인트 추가

1. `api/v1/newresource/index.php` 생성
2. Database 클래스 사용
3. JSON 응답 반환

### 코드 컨벤션

- 함수명: camelCase
- 변수명: camelCase
- 클래스명: PascalCase
- 파일명: kebab-case.js, snake_case.php

### 프로덕션 배포

1. JS 파일 minify 권장 (1.37MB → ~400KB 예상)
2. CSS는 이미 모듈화되어 있음
3. 환경변수는 `.env` 파일 또는 `config/config.php` 사용
