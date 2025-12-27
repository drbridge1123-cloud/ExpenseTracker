<?php
/**
 * One-time QuickBooks Ledger Import Script
 * Imports transactions from QuickBooks CSV export directly to trust_transactions
 *
 * Usage: php import_quickbooks_ledger.php
 * Or access via browser: http://localhost/expensetracker/scripts/import_quickbooks_ledger.php
 */

// Set to true to actually insert data, false for dry-run preview
$DRY_RUN = false;

require_once __DIR__ . '/../config/config.php';

// Configuration
$CSV_FILE = 'C:/Users/Daniel/Downloads/IOLTA Full data.csv';
$USER_ID = 1;
$ACCOUNT_ID = 7; // IOLTA account ID

echo "<pre style='font-family: monospace; font-size: 12px;'>\n";
echo "===========================================\n";
echo "QuickBooks Ledger Import Script\n";
echo "===========================================\n\n";

if ($DRY_RUN) {
    echo "*** DRY RUN MODE - No data will be inserted ***\n\n";
}

// Open CSV file
if (!file_exists($CSV_FILE)) {
    die("Error: CSV file not found: $CSV_FILE\n");
}

$file = fopen($CSV_FILE, 'r');
if (!$file) {
    die("Error: Cannot open CSV file\n");
}

$db = Database::getInstance();
$pdo = $db->getConnection();

// Load all clients for case number matching
$clients = $db->fetchAll("SELECT id, client_name, case_number FROM trust_clients WHERE user_id = :user_id", ['user_id' => $USER_ID]);
$clientMap = [];
foreach ($clients as $c) {
    if ($c['case_number']) {
        $clientMap[$c['case_number']] = $c;
    }
}
echo "Loaded " . count($clientMap) . " clients with case numbers\n\n";

// Parse CSV - QuickBooks format has specific column positions
// Columns: (empty), (account), (client header), (empty), (empty), Type, (empty), Date, (empty), Num, (empty), Name, (empty), Memo, (empty), Clr, (empty), Split, (empty), Amount, (empty), Balance
$header = fgetcsv($file); // Skip header row

$transactions = [];
$skipped = [];
$unmatchedClients = [];
$inIOLTASection = false;
$rowNum = 0;

while (($row = fgetcsv($file)) !== false) {
    $rowNum++;

    // Check for IOLTA section start
    if (isset($row[1]) && strpos($row[1], 'IOLTA') !== false) {
        $inIOLTASection = true;
        echo "Found IOLTA section at row $rowNum\n";
        continue;
    }

    // Check for IOLTA section end (Total line)
    if (isset($row[1]) && strpos($row[1], 'Total IOLTA') !== false) {
        $inIOLTASection = false;
        echo "End of IOLTA section at row $rowNum\n";
        break;
    }

    // Only process rows in IOLTA section
    if (!$inIOLTASection) continue;

    // Extract data from QuickBooks CSV columns
    $type = trim($row[5] ?? '');
    $date = trim($row[7] ?? '');
    $checkNum = trim($row[9] ?? '');
    $payee = trim($row[11] ?? '');
    $memo = trim($row[13] ?? '');
    $split = trim($row[17] ?? '');
    $amount = trim($row[19] ?? '');

    // Skip empty rows or non-transaction rows
    if (empty($date) || empty($amount) || !in_array($type, ['Check', 'Deposit', 'General Journal'])) {
        continue;
    }

    // Parse amount (remove commas, handle negatives)
    $amount = str_replace(',', '', $amount);
    $amount = (float)$amount;

    if ($amount == 0) continue;

    // Parse date
    $parsedDate = date('Y-m-d', strtotime($date));

    // Extract case number from Split column (e.g., "201747 Choe, Jenna" -> "201747")
    $caseNumber = null;
    $clientId = null;

    if (preg_match('/^(\d{6}(-\d+)?)\s/', $split, $matches)) {
        $caseNumber = $matches[1];

        // Try to find client by case number
        if (isset($clientMap[$caseNumber])) {
            $clientId = $clientMap[$caseNumber]['id'];
        } else {
            // Try without suffix (-1, -2, etc.)
            $baseCase = preg_replace('/-\d+$/', '', $caseNumber);
            if (isset($clientMap[$baseCase])) {
                $clientId = $clientMap[$baseCase]['id'];
            }
        }
    }

    // Determine transaction type
    $transactionType = 'other';
    if ($type === 'Check') {
        $transactionType = 'disbursement';
    } elseif ($type === 'Deposit') {
        $transactionType = 'deposit';
    } elseif ($type === 'General Journal') {
        $transactionType = $amount > 0 ? 'deposit' : 'disbursement';
    }

    // Build description
    $description = $memo ?: $payee;
    if ($payee && $memo && $payee !== $memo) {
        $description = $payee . ' - ' . $memo;
    }

    $tx = [
        'row' => $rowNum,
        'date' => $parsedDate,
        'type' => $transactionType,
        'check_num' => $checkNum,
        'payee' => $payee,
        'description' => $description,
        'amount' => $amount,
        'split' => $split,
        'case_number' => $caseNumber,
        'client_id' => $clientId
    ];

    if ($clientId) {
        $transactions[] = $tx;
    } else {
        $unmatchedClients[$caseNumber] = $split;
        $skipped[] = $tx;
    }
}

fclose($file);

echo "\n===========================================\n";
echo "PARSE RESULTS\n";
echo "===========================================\n";
echo "Total transactions to import: " . count($transactions) . "\n";
echo "Skipped (no client match): " . count($skipped) . "\n";

if (!empty($unmatchedClients)) {
    echo "\nUnmatched case numbers:\n";
    foreach ($unmatchedClients as $caseNum => $split) {
        echo "  - $caseNum: $split\n";
    }
}

// Preview first 10 transactions
echo "\n===========================================\n";
echo "PREVIEW (first 10 transactions)\n";
echo "===========================================\n";
foreach (array_slice($transactions, 0, 10) as $tx) {
    $caseNum = $tx['case_number'] ?? '';
    $client = $caseNum ? ($clientMap[$caseNum] ?? null) : null;
    $clientName = $client ? $client['client_name'] : 'UNKNOWN';
    echo sprintf("Row %d: %s | %s | %s | %s | \$%.2f\n",
        $tx['row'],
        $tx['date'],
        $tx['check_num'] ?: '-',
        substr($tx['description'], 0, 40),
        $clientName,
        $tx['amount']
    );
}

if ($DRY_RUN) {
    echo "\n*** DRY RUN - Set \$DRY_RUN = false to actually import ***\n";
    echo "</pre>";
    exit;
}

// Start import
echo "\n===========================================\n";
echo "IMPORTING...\n";
echo "===========================================\n";

$pdo->beginTransaction();

try {
    $imported = 0;
    $errors = [];

    // Group transactions by client for running balance calculation
    $clientTransactions = [];
    foreach ($transactions as $tx) {
        $clientTransactions[$tx['client_id']][] = $tx;
    }

    foreach ($clientTransactions as $clientId => $txList) {
        // Sort by date
        usort($txList, function($a, $b) {
            return strcmp($a['date'], $b['date']);
        });

        // Get or create ledger for this client
        $ledger = $db->fetch(
            "SELECT * FROM trust_ledger WHERE client_id = :client_id AND account_id = :account_id",
            ['client_id' => $clientId, 'account_id' => $ACCOUNT_ID]
        );

        if (!$ledger) {
            // Create ledger
            $ledgerId = $db->insert('trust_ledger', [
                'user_id' => $USER_ID,
                'account_id' => $ACCOUNT_ID,
                'client_id' => $clientId,
                'current_balance' => 0,
                'is_active' => 1
            ]);
            $currentBalance = 0;
        } else {
            $ledgerId = $ledger['id'];
            $currentBalance = (float)$ledger['current_balance'];
        }

        // Insert transactions
        foreach ($txList as $tx) {
            $currentBalance += $tx['amount'];

            $db->insert('trust_transactions', [
                'user_id' => $USER_ID,
                'ledger_id' => $ledgerId,
                'transaction_type' => $tx['type'],
                'amount' => $tx['amount'],
                'running_balance' => $currentBalance,
                'description' => $tx['description'],
                'payee' => $tx['payee'],
                'reference_number' => $tx['check_num'],
                'transaction_date' => $tx['date'],
                'is_posted' => 1
            ]);

            $imported++;
        }

        // Update ledger balance
        $db->update('trust_ledger',
            ['current_balance' => $currentBalance],
            'id = :id',
            ['id' => $ledgerId]
        );

        // Update case account balance if exists
        $caseAccount = $db->fetch(
            "SELECT id FROM accounts WHERE linked_client_id = :client_id AND account_type = 'trust'",
            ['client_id' => $clientId]
        );
        if ($caseAccount) {
            $db->update('accounts',
                ['current_balance' => $currentBalance],
                'id = :id',
                ['id' => $caseAccount['id']]
            );
        }
    }

    $pdo->commit();

    echo "Successfully imported $imported transactions!\n";
    echo "Updated " . count($clientTransactions) . " client ledgers.\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}

echo "\n===========================================\n";
echo "IMPORT COMPLETE\n";
echo "===========================================\n";
echo "</pre>";
