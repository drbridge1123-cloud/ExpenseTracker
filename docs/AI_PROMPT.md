# AI Continuation Prompt Package

다른 AI가 이 프로젝트를 이어서 작업할 때 사용하는 컨텍스트 문서

---

## 프로젝트 요약

```
프로젝트: ExpensesTracker (개인 재무 관리 시스템)
위치: c:\xampp\htdocs\ExpensesTracker\
스택: PHP + JavaScript + MySQL (XAMPP)
상태: 리팩토링 완료, 운영 중
```

---

## 전체 구조 (복사해서 사용)

```
ExpensesTracker/
├── api/                 # 백엔드 REST API (PHP)
│   ├── accounts/        # 계좌 CRUD
│   ├── admin/           # 관리자 기능
│   ├── auth/            # 로그인/로그아웃
│   ├── budgets/         # 예산 관리
│   ├── categories/      # 카테고리 CRUD
│   ├── checks/          # 수표 관리
│   ├── receipts/        # 영수증 업로드/조회
│   ├── recurring/       # 반복거래
│   ├── reimbursements/  # 환급 처리
│   ├── reports/         # 리포트 데이터
│   ├── rules/           # 자동분류 규칙
│   ├── settings/        # 사용자 설정
│   ├── tags/            # 태그
│   └── transactions/    # 거래 CRUD
├── config/              # 설정 (DB 비밀번호 등) - 비공개
│   └── config.php
├── core/                # 공통 라이브러리 - 비공개
│   ├── Database.php     # DB 연결 클래스
│   ├── Categorizer.php  # 자동 분류 로직
│   └── CSVParser.php    # CSV 파싱
├── database/            # DB 스키마
│   └── schema.sql       # 테이블 구조 정의 (설계도)
├── logs/                # 로그 파일
├── public/              # 프론트엔드 - 브라우저 접근 가능
│   ├── js/
│   │   ├── modules/     # 기능별 모듈 (15개)
│   │   │   ├── accounts.js      (329줄)
│   │   │   ├── admin.js         (292줄)
│   │   │   ├── budgets.js       (297줄)
│   │   │   ├── categories.js    (2,019줄)
│   │   │   ├── checks.js        (280줄)
│   │   │   ├── cpa.js           (695줄)
│   │   │   ├── custom-reports.js(373줄)
│   │   │   ├── dashboard.js     (456줄)
│   │   │   ├── import.js        (129줄)
│   │   │   ├── receipts.js      (1,102줄)
│   │   │   ├── reconcile.js     (397줄)
│   │   │   ├── recurring.js     (283줄)
│   │   │   ├── reports.js       (772줄)
│   │   │   ├── rules.js         (463줄)
│   │   │   └── transactions.js  (1,142줄)
│   │   ├── api.js       # API 호출 함수
│   │   ├── auth.js      # 로그인/인증
│   │   ├── state.js     # 전역 상태
│   │   └── utils.js     # 유틸리티
│   ├── components/
│   ├── app.js           # 메인 앱 (711줄)
│   ├── index.html       # 메인 페이지
│   ├── styles.css       # 스타일
│   └── *.html           # 추가 페이지들
├── uploads/             # 업로드 파일 저장
├── .htaccess            # URL/보안 설정
└── install.php          # 설치 스크립트
```

---

## 아키텍처 비유 (이해용)

```
레스토랑 비유:

[손님] = 브라우저/사용자
[홀/메뉴판] = public/ (HTML, CSS, JS) - 다운로드됨
[웨이터] = JavaScript - 주문받고 서빙
[주방] = api/ (PHP) - 요리 (데이터 처리)
[냉장고] = MySQL DB - 재료 저장
[접시] = JSON - 포장/전달 형식
[주방도구] = core/ - 공통 도구
[금고] = config/ - 비밀정보

흐름:
손님 클릭 → 웨이터(JS) → 주방(API) → 냉장고(DB) → JSON포장 → 웨이터 → 화면표시
```

---

## 핵심 코드 패턴

### 1. 전역 함수 노출 패턴
```javascript
// 각 모듈에서
function loadTransactions() { ... }
window.loadTransactions = loadTransactions;

// HTML에서 호출
<button onclick="loadTransactions()">Load</button>
```

### 2. API 호출 패턴
```javascript
// js/api.js 사용
const data = await apiGet('/transactions/', { user_id: state.currentUser });
const result = await apiPost('/transactions/', { amount: 100, ... });
```

### 3. 상태 관리
```javascript
// js/state.js
state.categories = [...];
state.currentUser = 2;
```

### 4. 중복 방지 패턴
```javascript
// window 객체로 중복 선언 방지
if (!window._stateName) {
    window._stateName = { ... };
}
const localState = window._stateName;
```

---

## 데이터베이스 정보

### 접속
```bash
"c:/xampp/mysql/bin/mysql.exe" -u root expense_tracker
```

### 주요 테이블
- users (4명)
- accounts (8개)
- transactions (620건)
- categories (119개)
- receipts (11개)
- categorization_rules (18개)

### 관계
```
users → accounts → transactions → category
                 → receipts
categories → categories (parent-child)
```

---

## 자주 쓰는 명령어

### 파일 삭제 (Windows)
```bash
cmd /c del "파일경로"
powershell -Command "Remove-Item '경로' -Force"
```

### DB 조회
```bash
"c:/xampp/mysql/bin/mysql.exe" -u root expense_tracker -e "SELECT * FROM users;"
```

---

## 작업 시 주의사항

1. **public/만 브라우저 접근 가능** - 나머지는 서버 내부용
2. **schema.sql ≠ 실제 데이터** - schema.sql은 빈 테이블 구조만
3. **Windows 환경** - bash 명령어 대신 cmd/powershell 사용
4. **defer 속성** - script 태그에 defer로 로딩 순서 관리
5. **categories.js 먼저 로드** - buildHierarchicalCategoryOptions 함수 제공

---

## 이전 작업 히스토리

### 완료된 작업
1. ✅ app.js 모듈화 (9,414줄 → 711줄)
2. ✅ 15개 기능별 모듈 분리
3. ✅ 임시 파일 정리
4. ✅ 백업 폴더 삭제
5. ✅ 에러 수정 (buildHierarchicalCategoryOptions 누락)

### 현재 상태
- 앱 정상 작동 중
- 에러 없음
- 코드 정리 완료

---

## 다음 작업 제안

1. 작은 모듈 병합 고려 (budgets+recurring → planning.js)
2. 다크모드 토글 기능 (현재 CSS 변수로만 관리)
3. TypeScript 마이그레이션
4. 테스트 코드 추가
5. Docker 컨테이너화
