# SaaS Level UI Upgrade 설계서

ExpensesTracker를 SaaS 수준의 현대적 UI로 업그레이드하기 위한 설계 문서

---

## 현재 상태 분석

### 현재 기술 스택
- Vanilla JavaScript (ES6+)
- CSS Variables 기반 스타일링
- PHP REST API
- MySQL Database

### 현재 UI 특징
- 단일 페이지 애플리케이션 (SPA) 구조
- 탭 기반 네비게이션
- 기본적인 반응형 디자인
- 다크모드 CSS 변수 준비됨

### 개선이 필요한 영역
- 디자인 시스템 부재
- 애니메이션/트랜지션 미흡
- 모바일 UX 개선 필요
- 로딩 상태 표시 개선
- 에러 처리 UI 개선

---

## 목표 UI/UX

### 벤치마크 서비스
- Mint (재무 관리)
- YNAB (예산 관리)
- Notion (UI/UX)
- Linear (모던 디자인)
- Stripe Dashboard (데이터 시각화)

### 디자인 원칙
1. **Clean & Minimal** - 불필요한 요소 제거
2. **Data-First** - 중요 정보 즉시 확인
3. **Consistent** - 일관된 디자인 언어
4. **Responsive** - 모든 디바이스 최적화
5. **Accessible** - 접근성 준수

---

## Phase 1: 디자인 시스템 구축

### 1.1 색상 시스템

```css
:root {
    /* Primary */
    --primary-50: #eff6ff;
    --primary-100: #dbeafe;
    --primary-200: #bfdbfe;
    --primary-300: #93c5fd;
    --primary-400: #60a5fa;
    --primary-500: #3b82f6;
    --primary-600: #2563eb;
    --primary-700: #1d4ed8;
    --primary-800: #1e40af;
    --primary-900: #1e3a8a;

    /* Neutral (Light Mode) */
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-300: #d1d5db;
    --gray-400: #9ca3af;
    --gray-500: #6b7280;
    --gray-600: #4b5563;
    --gray-700: #374151;
    --gray-800: #1f2937;
    --gray-900: #111827;

    /* Semantic */
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
    --info: #06b6d4;

    /* Surfaces */
    --surface-primary: var(--gray-50);
    --surface-secondary: white;
    --surface-elevated: white;
}

/* Dark Mode */
[data-theme="dark"] {
    --surface-primary: var(--gray-900);
    --surface-secondary: var(--gray-800);
    --surface-elevated: var(--gray-800);
}
```

### 1.2 타이포그래피

```css
:root {
    /* Font Family */
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    /* Font Sizes */
    --text-xs: 0.75rem;    /* 12px */
    --text-sm: 0.875rem;   /* 14px */
    --text-base: 1rem;     /* 16px */
    --text-lg: 1.125rem;   /* 18px */
    --text-xl: 1.25rem;    /* 20px */
    --text-2xl: 1.5rem;    /* 24px */
    --text-3xl: 1.875rem;  /* 30px */

    /* Font Weights */
    --font-normal: 400;
    --font-medium: 500;
    --font-semibold: 600;
    --font-bold: 700;

    /* Line Heights */
    --leading-tight: 1.25;
    --leading-normal: 1.5;
    --leading-relaxed: 1.75;
}
```

### 1.3 스페이싱 & 레이아웃

```css
:root {
    /* Spacing Scale */
    --space-1: 0.25rem;   /* 4px */
    --space-2: 0.5rem;    /* 8px */
    --space-3: 0.75rem;   /* 12px */
    --space-4: 1rem;      /* 16px */
    --space-5: 1.25rem;   /* 20px */
    --space-6: 1.5rem;    /* 24px */
    --space-8: 2rem;      /* 32px */
    --space-10: 2.5rem;   /* 40px */
    --space-12: 3rem;     /* 48px */

    /* Border Radius */
    --radius-sm: 0.25rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.75rem;
    --radius-2xl: 1rem;
    --radius-full: 9999px;

    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

---

## Phase 2: 컴포넌트 라이브러리

### 2.1 버튼 시스템

```css
/* Button Base */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    border-radius: var(--radius-lg);
    transition: all 0.15s ease;
    cursor: pointer;
}

/* Variants */
.btn-primary {
    background: var(--primary-600);
    color: white;
}
.btn-primary:hover {
    background: var(--primary-700);
}

.btn-secondary {
    background: var(--gray-100);
    color: var(--gray-700);
}

.btn-ghost {
    background: transparent;
    color: var(--gray-600);
}
.btn-ghost:hover {
    background: var(--gray-100);
}

.btn-danger {
    background: var(--error);
    color: white;
}

/* Sizes */
.btn-sm { padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
.btn-lg { padding: var(--space-3) var(--space-6); font-size: var(--text-base); }
```

### 2.2 카드 컴포넌트

```css
.card {
    background: var(--surface-secondary);
    border-radius: var(--radius-xl);
    border: 1px solid var(--gray-200);
    overflow: hidden;
}

.card-header {
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--gray-200);
}

.card-body {
    padding: var(--space-6);
}

.card-footer {
    padding: var(--space-4) var(--space-6);
    background: var(--gray-50);
    border-top: 1px solid var(--gray-200);
}

/* Elevated Card */
.card-elevated {
    border: none;
    box-shadow: var(--shadow-md);
}
```

### 2.3 입력 필드

```css
.input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-lg);
    background: var(--surface-secondary);
    transition: all 0.15s ease;
}

.input:focus {
    outline: none;
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
}

.input-error {
    border-color: var(--error);
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.input-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--gray-700);
}

.input-helper {
    font-size: var(--text-xs);
    color: var(--gray-500);
}
```

### 2.4 테이블

```css
.table-container {
    overflow-x: auto;
    border-radius: var(--radius-xl);
    border: 1px solid var(--gray-200);
}

.table {
    width: 100%;
    border-collapse: collapse;
}

.table th {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gray-500);
    background: var(--gray-50);
    text-align: left;
}

.table td {
    padding: var(--space-4);
    font-size: var(--text-sm);
    border-top: 1px solid var(--gray-200);
}

.table tr:hover td {
    background: var(--gray-50);
}
```

---

## Phase 3: 레이아웃 개선

### 3.1 새로운 사이드바

```html
<aside class="sidebar">
    <div class="sidebar-header">
        <img src="logo.svg" class="sidebar-logo">
        <span class="sidebar-title">ExpensesTracker</span>
    </div>

    <nav class="sidebar-nav">
        <a href="#" class="nav-item active">
            <svg class="nav-icon">...</svg>
            <span>Dashboard</span>
        </a>
        <a href="#" class="nav-item">
            <svg class="nav-icon">...</svg>
            <span>Transactions</span>
            <span class="nav-badge">12</span>
        </a>
        <!-- ... -->
    </nav>

    <div class="sidebar-footer">
        <div class="user-menu">
            <img src="avatar.jpg" class="user-avatar">
            <span class="user-name">Daniel</span>
        </div>
    </div>
</aside>
```

```css
.sidebar {
    width: 260px;
    height: 100vh;
    background: var(--gray-900);
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0;
    top: 0;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    color: var(--gray-400);
    border-radius: var(--radius-lg);
    margin: var(--space-1) var(--space-2);
    transition: all 0.15s ease;
}

.nav-item:hover {
    background: var(--gray-800);
    color: white;
}

.nav-item.active {
    background: var(--primary-600);
    color: white;
}
```

### 3.2 대시보드 그리드

```css
.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-6);
}

@media (max-width: 1200px) {
    .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
}
```

---

## Phase 4: 인터랙션 & 애니메이션

### 4.1 트랜지션

```css
/* 기본 트랜지션 */
.transition-fast { transition: all 0.1s ease; }
.transition-base { transition: all 0.15s ease; }
.transition-slow { transition: all 0.3s ease; }

/* 호버 효과 */
.hover-lift:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
}

/* 페이지 전환 */
.page-enter {
    opacity: 0;
    transform: translateY(10px);
}
.page-enter-active {
    opacity: 1;
    transform: translateY(0);
    transition: all 0.3s ease;
}
```

### 4.2 로딩 상태

```css
/* Skeleton Loading */
.skeleton {
    background: linear-gradient(
        90deg,
        var(--gray-200) 25%,
        var(--gray-100) 50%,
        var(--gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s infinite;
    border-radius: var(--radius-md);
}

@keyframes skeleton-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* Spinner */
.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--gray-200);
    border-top-color: var(--primary-600);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

### 4.3 토스트 알림

```css
.toast-container {
    position: fixed;
    bottom: var(--space-6);
    right: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    z-index: 1000;
}

.toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--gray-800);
    color: white;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    animation: toast-in 0.3s ease;
}

@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
}

.toast-success { border-left: 4px solid var(--success); }
.toast-error { border-left: 4px solid var(--error); }
.toast-warning { border-left: 4px solid var(--warning); }
```

---

## Phase 5: 데이터 시각화

### 5.1 차트 라이브러리
- **추천**: Chart.js 또는 Apache ECharts
- 일관된 색상 팔레트 적용
- 반응형 차트

### 5.2 통계 카드

```html
<div class="stat-card">
    <div class="stat-icon stat-icon-green">
        <svg>...</svg>
    </div>
    <div class="stat-content">
        <span class="stat-label">Total Income</span>
        <span class="stat-value">$12,450</span>
        <span class="stat-change positive">+12.5%</span>
    </div>
</div>
```

```css
.stat-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    background: var(--surface-secondary);
    border-radius: var(--radius-xl);
    border: 1px solid var(--gray-200);
}

.stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: var(--gray-900);
}

.stat-change {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
}
.stat-change.positive { color: var(--success); }
.stat-change.negative { color: var(--error); }
```

---

## 구현 로드맵

### Week 1-2: 기반 작업
- [ ] 디자인 시스템 CSS 작성
- [ ] Inter 폰트 적용
- [ ] 다크모드 토글 구현
- [ ] 기본 컴포넌트 스타일링

### Week 3-4: 레이아웃
- [ ] 새로운 사이드바 구현
- [ ] 반응형 레이아웃 개선
- [ ] 헤더/네비게이션 개선

### Week 5-6: 컴포넌트
- [ ] 버튼, 입력, 카드 컴포넌트
- [ ] 테이블 스타일 개선
- [ ] 모달 디자인 개선

### Week 7-8: 인터랙션
- [ ] 애니메이션 추가
- [ ] 로딩 상태 개선
- [ ] 토스트 시스템

### Week 9-10: 마무리
- [ ] 데이터 시각화 개선
- [ ] 접근성 검토
- [ ] 성능 최적화
- [ ] 크로스 브라우저 테스트

---

## 기술 선택지

### Option A: Vanilla CSS 유지
- 장점: 추가 의존성 없음, 빠른 로딩
- 단점: 유지보수 복잡도 증가

### Option B: Tailwind CSS 도입
- 장점: 빠른 개발, 일관된 디자인
- 단점: 학습 곡선, 클래스 복잡도

### Option C: CSS-in-JS (Styled Components)
- 장점: 컴포넌트 기반, 스코프된 스타일
- 단점: JS 프레임워크 필요

### 권장: Option A + CSS Variables
현재 구조 유지하면서 디자인 시스템만 강화
