# Technical Documentation

ExpensesTracker 개발자용 기술 문서

## 아키텍처 개요

### 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  public/                                                     │
│  ├── index.html          # SPA 메인 페이지                   │
│  ├── app.js              # 코어 앱 (초기화, 네비게이션)       │
│  ├── js/modules/*.js     # 기능별 모듈 (15개)                │
│  ├── js/api.js           # API 통신 레이어                   │
│  ├── js/state.js         # 전역 상태 관리                    │
│  └── js/utils.js         # 유틸리티 함수                     │
├─────────────────────────────────────────────────────────────┤
│                      REST API Layer                          │
├─────────────────────────────────────────────────────────────┤
│  api/                                                        │
│  ├── */index.php         # 각 리소스별 엔드포인트            │
│  └── core/               # 공통 라이브러리                   │
├─────────────────────────────────────────────────────────────┤
│                      Database (MySQL)                        │
│  expense_tracker                                             │
│  ├── users, accounts, transactions, categories ...          │
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

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| categories.js | 2,019 | Chart of Accounts, 카테고리 CRUD |
| transactions.js | 1,142 | 거래 목록, 필터링, 상세 |
| receipts.js | 1,102 | 영수증 업로드, 연결 |
| reports.js | 772 | 리포트 생성, 차트 |
| cpa.js | 695 | CPA 포털 기능 |
| dashboard.js | 456 | 대시보드, 요약 |
| rules.js | 463 | 자동분류 규칙 |
| reconcile.js | 397 | 계좌 조정 |
| custom-reports.js | 373 | 커스텀 리포트 빌더 |
| accounts.js | 329 | 계좌 관리 |
| budgets.js | 297 | 예산 관리 |
| admin.js | 292 | 관리자 패널 |
| recurring.js | 283 | 반복 거래 |
| checks.js | 280 | 수표 관리 |
| import.js | 129 | CSV 가져오기 |

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

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/transactions/ | 거래 목록 조회 |
| POST | /api/transactions/ | 거래 생성 |
| PUT | /api/transactions/update.php | 거래 수정 |
| DELETE | /api/transactions/ | 거래 삭제 |
| GET | /api/categories/ | 카테고리 목록 |
| POST | /api/categories/ | 카테고리 생성 |
| GET | /api/accounts/ | 계좌 목록 |
| POST | /api/auth/ | 로그인 |
| GET | /api/reports/ | 리포트 데이터 |

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

### ERD 관계

```
users (1) ──── (N) accounts
users (1) ──── (N) transactions
users (1) ──── (N) categories
accounts (1) ──── (N) transactions
categories (1) ──── (N) transactions
categories (1) ──── (N) categories (self-reference, parent-child)
transactions (1) ──── (N) receipts
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

1. `api/newresource/index.php` 생성
2. Database 클래스 사용
3. JSON 응답 반환

### 코드 컨벤션

- 함수명: camelCase
- 변수명: camelCase
- 클래스명: PascalCase
- 파일명: kebab-case.js, snake_case.php
