# ExpensesTracker

Personal Finance Management System - 개인 재무 관리 시스템

## 소개

ExpensesTracker는 개인 및 가족의 재무를 효율적으로 관리할 수 있는 웹 애플리케이션입니다. 거래 내역 추적, 카테고리 분류, 예산 관리, 영수증 보관, 리포트 생성 등 다양한 기능을 제공합니다.

## 주요 기능

- **거래 관리**: 수입/지출 내역 기록 및 조회
- **자동 분류**: 규칙 기반 거래 자동 카테고리 분류
- **카테고리 관리**: 계층형 카테고리 (Chart of Accounts)
- **예산 관리**: 카테고리별 예산 설정 및 추적
- **반복 거래**: 정기 결제 자동 등록
- **영수증 관리**: 영수증 이미지 업로드 및 거래 연결
- **리포트**: 월별/카테고리별 지출 분석
- **CSV 가져오기**: 은행 내역 일괄 가져오기
- **환급 추적**: 비용 환급 상태 관리
- **멀티 유저**: 여러 사용자 지원

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | PHP 8.x |
| Database | MySQL / MariaDB |
| Server | Apache (XAMPP) |

## 설치 방법

### 요구사항
- XAMPP 8.x 이상 (Apache + MySQL + PHP)
- 웹 브라우저 (Chrome, Firefox, Edge 권장)

### 설치 순서

1. **프로젝트 복사**
   ```bash
   # XAMPP htdocs 폴더에 복사
   C:\xampp\htdocs\ExpensesTracker\
   ```

2. **데이터베이스 생성**
   ```sql
   CREATE DATABASE expense_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **스키마 적용**
   ```bash
   mysql -u root expense_tracker < database/schema.sql
   ```

4. **설정 파일 수정**
   ```php
   // config/config.php
   $db_host = "localhost";
   $db_name = "expense_tracker";
   $db_user = "root";
   $db_pass = "";
   ```

5. **브라우저 접속**
   ```
   http://localhost/ExpensesTracker/public/
   ```

## 프로젝트 구조

```
ExpensesTracker/
├── api/               # REST API (PHP)
├── config/            # 설정 파일
├── core/              # 공통 라이브러리
├── database/          # DB 스키마
├── logs/              # 로그 파일
├── public/            # 프론트엔드
│   ├── js/modules/    # JavaScript 모듈
│   ├── app.js         # 메인 앱
│   ├── index.html     # 메인 페이지
│   └── styles.css     # 스타일
└── uploads/           # 업로드 파일
```

## 사용 방법

1. **로그인**: 사용자 계정으로 로그인
2. **대시보드**: 요약 정보 및 최근 거래 확인
3. **거래 관리**: Transactions 탭에서 거래 추가/수정/삭제
4. **카테고리**: Categories 탭에서 분류 체계 관리
5. **리포트**: Reports 탭에서 분석 리포트 조회

## 라이선스

Private - 개인 사용 목적

## 연락처

문의사항은 프로젝트 관리자에게 연락하세요.
