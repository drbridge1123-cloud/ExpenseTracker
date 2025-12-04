<?php
/**
 * =========================================================================
 * QuickBooks-Style Profit & Loss Detail Report API
 * =========================================================================
 *
 * GET /api/v1/reports/profit-loss-detail.php
 *
 * Parameters:
 *   - user_id: required (INT)
 *   - start_date: required (YYYY-MM-DD)
 *   - end_date: required (YYYY-MM-DD)
 *   - accounting_basis: optional ('accrual' or 'cash', default: 'accrual')
 *   - show_memo: optional (1 or 0, default: 1)
 *   - show_payee: optional (1 or 0, default: 1)
 *   - include_zero_balance: optional (1 or 0, default: 0)
 *   - format: optional ('json', 'html', 'csv', default: 'json')
 *
 * Response matches QuickBooks P&L Detail:
 *   - Ordered by: account_type_order, account_name, date, type, doc_number
 *   - Grouped by: Account Type → Parent Account → Sub-account
 *   - Includes: Line-by-line transaction details
 *   - Subtotals: Per sub-account, per parent, per type, and net totals
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

// =========================================================================
// CONFIGURATION VARIABLES
// =========================================================================
class PnLDetailConfig {
    public $userId;
    public $startDate;
    public $endDate;
    public $accountingBasis = 'accrual';
    public $showMemo = true;
    public $showPayee = true;
    public $includeZeroBalance = false;
    public $currencySymbol = '$';
    public $currencyCode = 'USD';
    public $decimalPlaces = 2;
    public $thousandsSeparator = ',';
    public $decimalSeparator = '.';
    public $dateFormat = 'm/d/Y';
    public $companyName = '';
    public $format = 'json';
}

// Parse parameters
$config = new PnLDetailConfig();
$config->userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$config->startDate = $_GET['start_date'] ?? null;
$config->endDate = $_GET['end_date'] ?? null;
$config->accountingBasis = $_GET['accounting_basis'] ?? 'accrual';
$config->showMemo = isset($_GET['show_memo']) ? (bool)$_GET['show_memo'] : true;
$config->showPayee = isset($_GET['show_payee']) ? (bool)$_GET['show_payee'] : true;
$config->includeZeroBalance = isset($_GET['include_zero_balance']) ? (bool)$_GET['include_zero_balance'] : false;
$config->format = $_GET['format'] ?? 'json';

// Validation
if (!$config->userId) {
    errorResponse('User ID is required');
}
if (!$config->startDate || !$config->endDate) {
    errorResponse('Start date and end date are required');
}

try {
    $db = Database::getInstance();

    // =========================================================================
    // GET COMPANY SETTINGS
    // =========================================================================
    $company = $db->fetch(
        "SELECT * FROM qb_company_settings WHERE user_id = :user_id",
        ['user_id' => $config->userId]
    );

    if ($company) {
        $config->companyName = $company['company_name'] ?? 'My Company';
        $config->accountingBasis = $company['accounting_basis'] ?? 'accrual';
        $config->currencyCode = $company['default_currency'] ?? 'USD';
    } else {
        $config->companyName = 'My Company';
    }

    // =========================================================================
    // MAIN QUERY: Get all transactions with full account hierarchy
    // =========================================================================
    // QuickBooks Sorting Order:
    // 1. Account Type (Income → COGS → Expense → Other Income → Other Expense)
    // 2. Parent Account Name
    // 3. Sub-Account Name
    // 4. Transaction Date
    // 5. Transaction Type
    // 6. Document Number

    $query = "
        SELECT
            t.id AS transaction_id,
            t.transaction_date,
            t.doc_number,
            t.payee_name,
            t.memo,
            t.amount,
            t.quantity,
            t.unit_price,

            -- Transaction Type
            tt.type_code AS txn_type_code,
            tt.abbreviation AS txn_type_abbrev,
            tt.type_name AS txn_type_name,

            -- Account Info (current level)
            a.id AS account_id,
            a.account_number,
            a.account_name,
            a.depth AS account_depth,
            a.full_path AS account_full_path,

            -- Account Type Info
            at.id AS account_type_id,
            at.type_code AS account_type_code,
            at.type_name AS account_type_name,
            at.type_category,
            at.sort_order AS type_sort_order,
            at.is_debit_positive,

            -- Parent Account (Level 1)
            p1.id AS parent1_id,
            p1.account_name AS parent1_name,
            p1.account_number AS parent1_number,

            -- Grandparent Account (Level 0 - Top level)
            p2.id AS parent2_id,
            p2.account_name AS parent2_name,
            p2.account_number AS parent2_number,

            -- Determine the top-level category account
            COALESCE(p2.account_name, p1.account_name, a.account_name) AS category_name,
            COALESCE(p2.id, p1.id, a.id) AS category_id

        FROM qb_transactions t
        INNER JOIN qb_chart_of_accounts a ON t.account_id = a.id
        INNER JOIN qb_account_types at ON a.account_type_id = at.id
        INNER JOIN qb_transaction_types tt ON t.transaction_type_id = tt.id
        LEFT JOIN qb_chart_of_accounts p1 ON a.parent_id = p1.id
        LEFT JOIN qb_chart_of_accounts p2 ON p1.parent_id = p2.id

        WHERE t.user_id = :user_id
          AND t.transaction_date BETWEEN :start_date AND :end_date
          AND at.type_category IN ('income', 'cogs', 'expense', 'other_income', 'other_expense')

        ORDER BY
            at.sort_order ASC,                    -- Account type order (Income first, etc.)
            COALESCE(p2.sort_order, p1.sort_order, a.sort_order) ASC,
            COALESCE(p2.account_name, p1.account_name, a.account_name) ASC,
            COALESCE(p1.sort_order, a.sort_order) ASC,
            p1.account_name ASC,
            a.sort_order ASC,
            a.account_name ASC,
            t.transaction_date ASC,
            tt.sort_order ASC,
            t.doc_number ASC
    ";

    $transactions = $db->fetchAll($query, [
        'user_id' => $config->userId,
        'start_date' => $config->startDate,
        'end_date' => $config->endDate
    ]);

    // =========================================================================
    // BUILD HIERARCHICAL DATA STRUCTURE
    // =========================================================================
    $report = buildPnLDetailStructure($transactions, $config);

    // =========================================================================
    // OUTPUT BASED ON FORMAT
    // =========================================================================
    switch ($config->format) {
        case 'html':
            header('Content-Type: text/html; charset=utf-8');
            echo generatePnLDetailHtml($report, $config);
            exit;

        case 'csv':
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="pnl_detail_' . date('Y-m-d') . '.csv"');
            echo generatePnLDetailCsv($report, $config);
            exit;

        case 'json':
        default:
            successResponse($report);
    }

} catch (Exception $e) {
    appLog('P&L Detail Report error: ' . $e->getMessage(), 'error');
    errorResponse($e->getMessage(), 500);
}


// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

/**
 * Build hierarchical P&L Detail structure matching QuickBooks format
 */
function buildPnLDetailStructure($transactions, $config) {
    $sections = [
        'income' => [
            'title' => 'Income',
            'accounts' => [],
            'total' => 0
        ],
        'cogs' => [
            'title' => 'Cost of Goods Sold',
            'accounts' => [],
            'total' => 0
        ],
        'expense' => [
            'title' => 'Expenses',
            'accounts' => [],
            'total' => 0
        ],
        'other_income' => [
            'title' => 'Other Income',
            'accounts' => [],
            'total' => 0
        ],
        'other_expense' => [
            'title' => 'Other Expenses',
            'accounts' => [],
            'total' => 0
        ]
    ];

    // Group transactions into hierarchical structure
    foreach ($transactions as $txn) {
        $category = $txn['type_category'];
        if (!isset($sections[$category])) continue;

        // Build the account hierarchy path
        $parentName = $txn['parent1_name'] ?: $txn['account_name'];
        $accountName = $txn['account_name'];
        $isSubAccount = !empty($txn['parent1_name']);

        // Initialize parent account if not exists
        if (!isset($sections[$category]['accounts'][$parentName])) {
            $sections[$category]['accounts'][$parentName] = [
                'account_id' => $isSubAccount ? $txn['parent1_id'] : $txn['account_id'],
                'account_number' => $isSubAccount ? $txn['parent1_number'] : $txn['account_number'],
                'account_name' => $parentName,
                'sub_accounts' => [],
                'direct_transactions' => [],
                'total' => 0
            ];
        }

        // Determine amount sign (QuickBooks convention)
        // Income accounts: positive amount = credit (revenue)
        // Expense accounts: positive amount = debit (expense)
        $amount = (float)$txn['amount'];

        // Build transaction detail row
        $txnDetail = [
            'transaction_id' => $txn['transaction_id'],
            'date' => $txn['transaction_date'],
            'date_formatted' => formatDateForReport($txn['transaction_date'], $config->dateFormat),
            'type' => $txn['txn_type_abbrev'],
            'type_name' => $txn['txn_type_name'],
            'num' => $txn['doc_number'] ?: '',
            'name' => $config->showPayee ? ($txn['payee_name'] ?: '') : '',
            'memo' => $config->showMemo ? ($txn['memo'] ?: '') : '',
            'amount' => $amount,
            'amount_formatted' => formatCurrencyForReport($amount, $config)
        ];

        if ($isSubAccount) {
            // Add to sub-account
            if (!isset($sections[$category]['accounts'][$parentName]['sub_accounts'][$accountName])) {
                $sections[$category]['accounts'][$parentName]['sub_accounts'][$accountName] = [
                    'account_id' => $txn['account_id'],
                    'account_number' => $txn['account_number'],
                    'account_name' => $accountName,
                    'transactions' => [],
                    'total' => 0
                ];
            }
            $sections[$category]['accounts'][$parentName]['sub_accounts'][$accountName]['transactions'][] = $txnDetail;
            $sections[$category]['accounts'][$parentName]['sub_accounts'][$accountName]['total'] += $amount;
        } else {
            // Add directly to parent account
            $sections[$category]['accounts'][$parentName]['direct_transactions'][] = $txnDetail;
        }

        // Update totals
        $sections[$category]['accounts'][$parentName]['total'] += $amount;
        $sections[$category]['total'] += $amount;
    }

    // Calculate summary totals (QuickBooks style)
    $totalIncome = $sections['income']['total'];
    $totalCogs = $sections['cogs']['total'];
    $grossProfit = $totalIncome - $totalCogs;
    $totalExpenses = $sections['expense']['total'];
    $netOperatingIncome = $grossProfit - $totalExpenses;
    $totalOtherIncome = $sections['other_income']['total'];
    $totalOtherExpense = $sections['other_expense']['total'];
    $netOtherIncome = $totalOtherIncome - $totalOtherExpense;
    $netIncome = $netOperatingIncome + $netOtherIncome;

    // Filter out zero-balance accounts if configured
    if (!$config->includeZeroBalance) {
        foreach ($sections as $category => &$section) {
            $section['accounts'] = array_filter($section['accounts'], function($account) {
                return abs($account['total']) > 0.001;
            });
        }
    }

    return [
        'config' => [
            'company_name' => $config->companyName,
            'report_title' => 'Profit and Loss Detail',
            'date_range' => [
                'start' => $config->startDate,
                'end' => $config->endDate,
                'start_formatted' => formatDateForReport($config->startDate, $config->dateFormat),
                'end_formatted' => formatDateForReport($config->endDate, $config->dateFormat)
            ],
            'accounting_basis' => ucfirst($config->accountingBasis),
            'currency' => $config->currencyCode,
            'show_memo' => $config->showMemo,
            'show_payee' => $config->showPayee,
            'generated_at' => date('Y-m-d H:i:s')
        ],
        'sections' => $sections,
        'summary' => [
            'total_income' => [
                'amount' => $totalIncome,
                'formatted' => formatCurrencyForReport($totalIncome, $config)
            ],
            'total_cogs' => [
                'amount' => $totalCogs,
                'formatted' => formatCurrencyForReport($totalCogs, $config)
            ],
            'gross_profit' => [
                'amount' => $grossProfit,
                'formatted' => formatCurrencyForReport($grossProfit, $config)
            ],
            'total_expenses' => [
                'amount' => $totalExpenses,
                'formatted' => formatCurrencyForReport($totalExpenses, $config)
            ],
            'net_operating_income' => [
                'amount' => $netOperatingIncome,
                'formatted' => formatCurrencyForReport($netOperatingIncome, $config)
            ],
            'total_other_income' => [
                'amount' => $totalOtherIncome,
                'formatted' => formatCurrencyForReport($totalOtherIncome, $config)
            ],
            'total_other_expense' => [
                'amount' => $totalOtherExpense,
                'formatted' => formatCurrencyForReport($totalOtherExpense, $config)
            ],
            'net_other_income' => [
                'amount' => $netOtherIncome,
                'formatted' => formatCurrencyForReport($netOtherIncome, $config)
            ],
            'net_income' => [
                'amount' => $netIncome,
                'formatted' => formatCurrencyForReport($netIncome, $config)
            ]
        ]
    ];
}

/**
 * Format date for report display
 */
function formatDateForReport($date, $format = 'm/d/Y') {
    if (empty($date)) return '';
    $dt = new DateTime($date);
    return $dt->format($format);
}

/**
 * Format currency for report display
 */
function formatCurrencyForReport($amount, $config) {
    $formatted = number_format(
        abs($amount),
        $config->decimalPlaces,
        $config->decimalSeparator,
        $config->thousandsSeparator
    );

    $prefix = $amount < 0 ? '-' : '';
    return $prefix . $config->currencySymbol . $formatted;
}

/**
 * Generate QuickBooks-style HTML output
 */
function generatePnLDetailHtml($report, $config) {
    $html = '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profit and Loss Detail - ' . htmlspecialchars($report['config']['company_name']) . '</title>
    <link rel="stylesheet" href="/styles/pnl-detail.css">
</head>
<body>
    <div class="pnl-report">
        <div class="pnl-header">
            <h1 class="company-name">' . htmlspecialchars($report['config']['company_name']) . '</h1>
            <h2 class="report-title">Profit and Loss Detail</h2>
            <p class="date-range">' . $report['config']['date_range']['start_formatted'] . ' through ' . $report['config']['date_range']['end_formatted'] . '</p>
            <p class="accounting-basis">' . $report['config']['accounting_basis'] . ' Basis</p>
        </div>

        <table class="pnl-table">
            <thead>
                <tr>
                    <th class="col-date">Date</th>
                    <th class="col-type">Type</th>
                    <th class="col-num">Num</th>';

    if ($config->showPayee) {
        $html .= '
                    <th class="col-name">Name</th>';
    }

    if ($config->showMemo) {
        $html .= '
                    <th class="col-memo">Memo/Description</th>';
    }

    $html .= '
                    <th class="col-amount">Amount</th>
                </tr>
            </thead>
            <tbody>';

    // Render each section
    $sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

    foreach ($sectionOrder as $sectionKey) {
        $section = $report['sections'][$sectionKey];
        if (empty($section['accounts']) && !$config->includeZeroBalance) continue;

        // Section header
        $html .= '
                <tr class="section-header">
                    <td colspan="' . getColumnCount($config) . '">' . strtoupper($section['title']) . '</td>
                </tr>';

        // Render accounts
        foreach ($section['accounts'] as $account) {
            $html .= renderAccountHtml($account, $config, 1);
        }

        // Section total
        $html .= '
                <tr class="section-total">
                    <td colspan="' . (getColumnCount($config) - 1) . '">Total ' . $section['title'] . '</td>
                    <td class="amount">' . formatCurrencyForReport($section['total'], $config) . '</td>
                </tr>';

        // Add computed rows after sections
        if ($sectionKey === 'cogs') {
            $html .= '
                <tr class="computed-total gross-profit">
                    <td colspan="' . (getColumnCount($config) - 1) . '">Gross Profit</td>
                    <td class="amount">' . $report['summary']['gross_profit']['formatted'] . '</td>
                </tr>';
        }

        if ($sectionKey === 'expense') {
            $html .= '
                <tr class="computed-total net-operating">
                    <td colspan="' . (getColumnCount($config) - 1) . '">Net Operating Income</td>
                    <td class="amount">' . $report['summary']['net_operating_income']['formatted'] . '</td>
                </tr>';
        }

        if ($sectionKey === 'other_expense') {
            $html .= '
                <tr class="computed-total net-other">
                    <td colspan="' . (getColumnCount($config) - 1) . '">Net Other Income</td>
                    <td class="amount">' . $report['summary']['net_other_income']['formatted'] . '</td>
                </tr>';
        }
    }

    // Net Income
    $html .= '
                <tr class="net-income">
                    <td colspan="' . (getColumnCount($config) - 1) . '">Net Income</td>
                    <td class="amount">' . $report['summary']['net_income']['formatted'] . '</td>
                </tr>
            </tbody>
        </table>

        <div class="pnl-footer">
            <p class="generated-at">Generated: ' . $report['config']['generated_at'] . '</p>
        </div>
    </div>
</body>
</html>';

    return $html;
}

/**
 * Render a single account with its sub-accounts and transactions
 */
function renderAccountHtml($account, $config, $depth = 0) {
    $indent = str_repeat('&nbsp;&nbsp;&nbsp;&nbsp;', $depth);
    $html = '';

    // Account header
    $html .= '
                <tr class="account-header depth-' . $depth . '">
                    <td colspan="' . getColumnCount($config) . '">' . $indent . htmlspecialchars($account['account_name']) . '</td>
                </tr>';

    // Direct transactions (if any)
    foreach ($account['direct_transactions'] as $txn) {
        $html .= renderTransactionRowHtml($txn, $config, $depth + 1);
    }

    // Sub-accounts
    foreach ($account['sub_accounts'] as $subAccount) {
        $subIndent = str_repeat('&nbsp;&nbsp;&nbsp;&nbsp;', $depth + 1);

        // Sub-account header
        $html .= '
                <tr class="account-header depth-' . ($depth + 1) . '">
                    <td colspan="' . getColumnCount($config) . '">' . $subIndent . htmlspecialchars($subAccount['account_name']) . '</td>
                </tr>';

        // Sub-account transactions
        foreach ($subAccount['transactions'] as $txn) {
            $html .= renderTransactionRowHtml($txn, $config, $depth + 2);
        }

        // Sub-account total
        $html .= '
                <tr class="account-total depth-' . ($depth + 1) . '">
                    <td colspan="' . (getColumnCount($config) - 1) . '">' . $subIndent . 'Total ' . htmlspecialchars($subAccount['account_name']) . '</td>
                    <td class="amount">' . formatCurrencyForReport($subAccount['total'], $config) . '</td>
                </tr>';
    }

    // Account total (if has sub-accounts)
    if (!empty($account['sub_accounts'])) {
        $html .= '
                <tr class="account-total depth-' . $depth . '">
                    <td colspan="' . (getColumnCount($config) - 1) . '">' . $indent . 'Total ' . htmlspecialchars($account['account_name']) . '</td>
                    <td class="amount">' . formatCurrencyForReport($account['total'], $config) . '</td>
                </tr>';
    }

    return $html;
}

/**
 * Render a single transaction row
 */
function renderTransactionRowHtml($txn, $config, $depth = 0) {
    $indent = str_repeat('&nbsp;&nbsp;&nbsp;&nbsp;', $depth);

    $html = '
                <tr class="transaction-row depth-' . $depth . '">
                    <td class="col-date">' . $indent . $txn['date_formatted'] . '</td>
                    <td class="col-type">' . htmlspecialchars($txn['type']) . '</td>
                    <td class="col-num">' . htmlspecialchars($txn['num']) . '</td>';

    if ($config->showPayee) {
        $html .= '
                    <td class="col-name">' . htmlspecialchars($txn['name']) . '</td>';
    }

    if ($config->showMemo) {
        $html .= '
                    <td class="col-memo">' . htmlspecialchars($txn['memo']) . '</td>';
    }

    $html .= '
                    <td class="col-amount amount">' . $txn['amount_formatted'] . '</td>
                </tr>';

    return $html;
}

/**
 * Get column count based on configuration
 */
function getColumnCount($config) {
    $count = 4; // date, type, num, amount
    if ($config->showPayee) $count++;
    if ($config->showMemo) $count++;
    return $count;
}

/**
 * Generate CSV output
 */
function generatePnLDetailCsv($report, $config) {
    $output = fopen('php://temp', 'r+');

    // Header
    fputcsv($output, [$report['config']['company_name']]);
    fputcsv($output, ['Profit and Loss Detail']);
    fputcsv($output, [$report['config']['date_range']['start_formatted'] . ' through ' . $report['config']['date_range']['end_formatted']]);
    fputcsv($output, [$report['config']['accounting_basis'] . ' Basis']);
    fputcsv($output, []);

    // Column headers
    $headers = ['Account', 'Date', 'Type', 'Num'];
    if ($config->showPayee) $headers[] = 'Name';
    if ($config->showMemo) $headers[] = 'Memo/Description';
    $headers[] = 'Amount';
    fputcsv($output, $headers);

    // Sections
    $sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

    foreach ($sectionOrder as $sectionKey) {
        $section = $report['sections'][$sectionKey];
        if (empty($section['accounts'])) continue;

        fputcsv($output, [strtoupper($section['title'])]);

        foreach ($section['accounts'] as $account) {
            writeCsvAccount($output, $account, $config, 1);
        }

        $totalRow = array_fill(0, count($headers) - 1, '');
        $totalRow[0] = 'Total ' . $section['title'];
        $totalRow[] = $section['total'];
        fputcsv($output, $totalRow);

        // Computed totals
        if ($sectionKey === 'cogs') {
            $row = array_fill(0, count($headers) - 1, '');
            $row[0] = 'Gross Profit';
            $row[] = $report['summary']['gross_profit']['amount'];
            fputcsv($output, $row);
        }

        if ($sectionKey === 'expense') {
            $row = array_fill(0, count($headers) - 1, '');
            $row[0] = 'Net Operating Income';
            $row[] = $report['summary']['net_operating_income']['amount'];
            fputcsv($output, $row);
        }

        if ($sectionKey === 'other_expense') {
            $row = array_fill(0, count($headers) - 1, '');
            $row[0] = 'Net Other Income';
            $row[] = $report['summary']['net_other_income']['amount'];
            fputcsv($output, $row);
        }

        fputcsv($output, []);
    }

    // Net Income
    $netRow = array_fill(0, count($headers) - 1, '');
    $netRow[0] = 'NET INCOME';
    $netRow[] = $report['summary']['net_income']['amount'];
    fputcsv($output, $netRow);

    rewind($output);
    $csv = stream_get_contents($output);
    fclose($output);

    return $csv;
}

/**
 * Write account data to CSV
 */
function writeCsvAccount($output, $account, $config, $depth) {
    $indent = str_repeat('  ', $depth);
    $headerCount = 4;
    if ($config->showPayee) $headerCount++;
    if ($config->showMemo) $headerCount++;

    // Account name
    fputcsv($output, [$indent . $account['account_name']]);

    // Direct transactions
    foreach ($account['direct_transactions'] as $txn) {
        $row = [
            $indent . '  ',
            $txn['date_formatted'],
            $txn['type'],
            $txn['num']
        ];
        if ($config->showPayee) $row[] = $txn['name'];
        if ($config->showMemo) $row[] = $txn['memo'];
        $row[] = $txn['amount'];
        fputcsv($output, $row);
    }

    // Sub-accounts
    foreach ($account['sub_accounts'] as $subAccount) {
        fputcsv($output, [$indent . '  ' . $subAccount['account_name']]);

        foreach ($subAccount['transactions'] as $txn) {
            $row = [
                $indent . '    ',
                $txn['date_formatted'],
                $txn['type'],
                $txn['num']
            ];
            if ($config->showPayee) $row[] = $txn['name'];
            if ($config->showMemo) $row[] = $txn['memo'];
            $row[] = $txn['amount'];
            fputcsv($output, $row);
        }

        $totalRow = array_fill(0, $headerCount, '');
        $totalRow[0] = $indent . '  Total ' . $subAccount['account_name'];
        $totalRow[] = $subAccount['total'];
        fputcsv($output, $totalRow);
    }

    // Account total
    if (!empty($account['sub_accounts'])) {
        $totalRow = array_fill(0, $headerCount, '');
        $totalRow[0] = $indent . 'Total ' . $account['account_name'];
        $totalRow[] = $account['total'];
        fputcsv($output, $totalRow);
    }
}
