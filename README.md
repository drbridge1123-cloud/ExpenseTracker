# ExpenseTracker

Personal Finance Management System

## Requirements

- PHP 8.0+
- MySQL/MariaDB
- XAMPP (recommended)

## Installation

### 1. Clone/Download
```bash
git clone https://github.com/yourusername/ExpenseTracker.git
cd ExpenseTracker
```

### 2. Database Setup
```bash
mysql -u root < database/schema.sql
```

### 3. Configuration
```bash
# Edit config/env.php with your database settings (if needed)
```

### 4. Create Required Directories
```bash
mkdir -p storage/receipts storage/BankTransaction logs
```

### 5. Access Application
```
http://localhost/ExpenseTracker/public/
```

## Project Structure

```
ExpenseTracker/
├── api/v1/          # REST API endpoints
├── config/          # Configuration files
├── core/            # Core classes (Database, etc.)
├── database/        # SQL schema and seeds
├── logs/            # Application logs (gitignored)
├── public/          # Frontend (HTML, JS, CSS)
├── storage/         # Uploaded files (gitignored)
└── .gitignore
```

## Default User

- Username: `Daniel`
- Password: `Dbghrud83#`

## API Endpoints

Base URL: `/ExpenseTracker/api/v1`

| Endpoint | Description |
|----------|-------------|
| `/auth/` | Authentication |
| `/accounts/` | Bank accounts |
| `/transactions/` | Transactions |
| `/categories/` | Categories |
| `/reports/` | Reports |
| `/budgets/` | Budgets |

## Development

### Local (XAMPP)
1. Place in `C:\xampp\htdocs\ExpenseTracker`
2. Start Apache + MySQL
3. Access `http://localhost/ExpenseTracker/public/`

### ngrok (for sharing)
```bash
ngrok http --basic-auth="user:pass" 80
```

## License

Private - All rights reserved
