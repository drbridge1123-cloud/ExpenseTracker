# Expense Tracker

Personal & Business Finance Management System with IOLTA Trust Accounting

## Features

### General Accounting
- **Dashboard** - Financial overview with charts and summaries
- **Transactions** - Income/expense tracking with bank import
- **Accounts** - Multiple bank account management
- **Categories** - Hierarchical category system
- **Checks** - Check writing and tracking
- **Reconciliation** - Bank statement reconciliation
- **Budgets** - Monthly budget planning
- **Reports** - Financial reports and analytics
- **Contacts** - Payee/vendor management
- **Rules** - Auto-categorization rules

### IOLTA Trust Accounting
- **Client Ledgers** - Per-client trust balance tracking
- **Trust Transactions** - Deposits, disbursements, transfers
- **Three-Way Reconciliation** - Bank, book, client balance verification
- **Trust Reports** - Client statements and compliance reports

### Cost Accounting
- **Matter Tracking** - Cost per client/matter
- **Expense Allocation** - Assign costs to matters

## Requirements

- PHP 8.0+
- MySQL/MariaDB
- Apache (XAMPP recommended)

## Installation

### 1. Clone Repository
```bash
cd C:\xampp\htdocs
git clone <repository-url> expensetracker
```

### 2. Database Setup
```bash
mysql -u root < database/schema.sql
```

### 3. Create Directories
```bash
mkdir storage/receipts storage/BankTransaction logs
```

### 4. Access Application
```
http://localhost/expensetracker/public/
```

## Project Structure

```
expensetracker/
├── api/v1/              # REST API endpoints
│   ├── accounts/        # Account management
│   ├── auth/            # Authentication
│   ├── categories/      # Category management
│   ├── checks/          # Check writing
│   ├── import/          # Bank CSV import
│   ├── reports/         # Financial reports
│   ├── trust/           # IOLTA Trust API
│   └── ...
├── config/              # Configuration
├── core/                # Core classes
├── database/            # SQL schema
├── logs/                # Application logs
├── public/              # Frontend
│   ├── js/modules/      # JavaScript modules
│   └── index.html       # SPA entry point
├── scripts/             # Utility scripts
└── storage/             # Uploaded files
```

## API Endpoints

Base URL: `/expensetracker/api/v1`

| Endpoint | Description |
|----------|-------------|
| `/auth/` | Authentication |
| `/accounts/` | Bank accounts |
| `/transactions/` | Transactions |
| `/categories/` | Categories |
| `/checks/` | Check management |
| `/reports/` | Reports |
| `/budgets/` | Budgets |
| `/rules/` | Auto-categorization |
| `/recurring/` | Recurring transactions |
| `/contacts/` | Contacts/Payees |
| `/trust/` | IOLTA Trust operations |

## Account Modes

The app supports three account modes (switchable via header):

1. **General** - Personal/business expense tracking
2. **IOLTA** - Trust account management for attorneys
3. **Cost** - Cost accounting per client/matter

## Tech Stack

- **Backend**: PHP 8, MySQL
- **Frontend**: Vanilla JavaScript (SPA)
- **CSS**: Custom with CSS variables
- **Charts**: Chart.js

## License

Private - All rights reserved
