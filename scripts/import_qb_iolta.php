<?php
/**
 * QuickBooks IOLTA CSV Import Script
 * Imports directly to trust_transactions (ledger)
 * Unmatched clients go to General/Unassigned
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../core/Database.php';

$userId = 1;
$accountId = 7; // IOLTA account
$csvPath = 'C:/Users/Daniel/Downloads/IOLTA Full data.csv';

// Connect to database
$pdo = Database::getInstance()->getConnection();

echo "=== QuickBooks IOLTA Import ===\n\n";

// Get Unassigned ledger
$stmt = $pdo->prepare("
    SELECT l.id FROM trust_ledger l
    JOIN trust_clients c ON l.client_id = c.id
    WHERE l.user_id = ? AND c.client_name = 'General/Unassigned'
");
$stmt->execute([$userId]);
$unassignedLedger = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$unassignedLedger) {
    die("Error: General/Unassigned ledger not found\n");
}
$unassignedLedgerId = $unassignedLedger['id'];
echo "Unassigned Ledger ID: $unassignedLedgerId\n";

// Load all clients with matter numbers
$stmt = $pdo->prepare("
    SELECT c.id as client_id, c.matter_number, c.client_name, l.id as ledger_id
    FROM trust_clients c
    LEFT JOIN trust_ledger l ON l.client_id = c.id AND l.user_id = ?
    WHERE c.user_id = ? AND c.matter_number IS NOT NULL
");
$stmt->execute([$userId, $userId]);
$clients = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Build lookup map by matter_number
$clientMap = [];
foreach ($clients as $client) {
    if ($client['matter_number'] && $client['ledger_id']) {
        $clientMap[$client['matter_number']] = [
            'client_id' => $client['client_id'],
            'ledger_id' => $client['ledger_id'],
            'client_name' => $client['client_name']
        ];
    }
}
echo "Loaded " . count($clientMap) . " clients with ledgers\n\n";

// Read CSV file
$handle = fopen($csvPath, 'r');
if (!$handle) {
    die("Error: Cannot open CSV file\n");
}

// Skip BOM if present
$bom = fread($handle, 3);
if ($bom !== "\xEF\xBB\xBF") {
    rewind($handle);
}

// Read header
$header = fgetcsv($handle);

$stats = [
    'total' => 0,
    'imported' => 0,
    'matched' => 0,
    'unassigned' => 0,
    'skipped' => 0,
    'errors' => 0
];

$transactions = [];

while (($row = fgetcsv($handle)) !== false) {
    $stats['total']++;

    // CSV columns (with empty columns): Type(5), Date(7), Num(9), Name(11), Memo(13), Clr(15), Split(17), Amount(19), Balance(21)
    $type = trim($row[5] ?? '');
    $date = trim($row[7] ?? '');
    $num = trim($row[9] ?? '');
    $name = trim($row[11] ?? '');
    $memo = trim($row[13] ?? '');
    $clr = trim($row[15] ?? '');
    $split = trim($row[17] ?? '');
    $amount = trim($row[19] ?? '');

    // Stop at "Total IOLTA" row - everything after is duplicate (double-entry other side)
    $firstCol = trim($row[1] ?? '');
    if (strpos($firstCol, 'Total IOLTA') !== false || strpos($firstCol, 'Total Bridge Law') !== false) {
        echo "Reached Total row, stopping import.\n";
        break;
    }

    // Skip non-transaction rows
    if (!in_array($type, ['Deposit', 'Check', 'General Journal'])) {
        $stats['skipped']++;
        continue;
    }

    // Skip rows without valid date
    if (!preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $date)) {
        $stats['skipped']++;
        continue;
    }

    // Skip zero amount
    $amountNum = (float) str_replace(',', '', $amount);
    if ($amountNum == 0) {
        $stats['skipped']++;
        continue;
    }

    // Parse date (MM/DD/YYYY -> YYYY-MM-DD)
    $dateParts = explode('/', $date);
    $transactionDate = $dateParts[2] . '-' . $dateParts[0] . '-' . $dateParts[1];

    // Determine transaction type and amount
    if ($amountNum > 0) {
        $txType = 'deposit';
        $txAmount = $amountNum;
        $receivedFrom = $name;
        $payee = null;
    } else {
        $txType = 'disbursement';
        $txAmount = abs($amountNum);
        $payee = $name;
        $receivedFrom = null;
    }

    // Extract matter number from Split (e.g., "201162 Park, Mi Jung" -> "201162", "200831-X Choe, Sarah" -> "200831-X")
    $ledgerId = $unassignedLedgerId;
    $matched = false;

    // Match patterns: 6 digits, optionally followed by -number or -letter(s)
    if (preg_match('/^(\d{6}(?:-[A-Za-z0-9]+)?)\s/', $split, $matches)) {
        $matterNumber = $matches[1];
        if (isset($clientMap[$matterNumber])) {
            $ledgerId = $clientMap[$matterNumber]['ledger_id'];
            $matched = true;
        }
    }

    // Check number
    $checkNumber = null;
    if ($type === 'Check' && $num) {
        $checkNumber = $num;
    }

    // Status
    $status = ($clr === 'Ö' || $clr === '/') ? 'cleared' : 'pending';

    $transactions[] = [
        'ledger_id' => $ledgerId,
        'transaction_type' => $txType,
        'amount' => $txAmount,
        'description' => $memo ?: $name,
        'payee' => $payee,
        'received_from' => $receivedFrom,
        'check_number' => $checkNumber,
        'status' => $status,
        'transaction_date' => $transactionDate,
        'matched' => $matched
    ];

    if ($matched) {
        $stats['matched']++;
    } else {
        $stats['unassigned']++;
    }
}
fclose($handle);

echo "Parsed " . count($transactions) . " transactions\n";
echo "Matched: {$stats['matched']}, Unassigned: {$stats['unassigned']}\n\n";

// Sort by date for running balance calculation
usort($transactions, function($a, $b) {
    return strcmp($a['transaction_date'], $b['transaction_date']);
});

// Insert transactions
echo "Inserting transactions...\n";

$insertStmt = $pdo->prepare("
    INSERT INTO trust_transactions
    (user_id, ledger_id, transaction_type, amount, running_balance, description, payee, received_from, check_number, status, transaction_date, is_posted, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, NOW())
");

$pdo->beginTransaction();

try {
    foreach ($transactions as $tx) {
        $insertStmt->execute([
            $userId,
            $tx['ledger_id'],
            $tx['transaction_type'],
            $tx['amount'],
            $tx['description'],
            $tx['payee'],
            $tx['received_from'],
            $tx['check_number'],
            $tx['status'],
            $tx['transaction_date']
        ]);
        $stats['imported']++;
    }

    // Recalculate running balances for each ledger
    echo "Recalculating running balances...\n";

    $ledgerIds = $pdo->query("SELECT DISTINCT ledger_id FROM trust_transactions WHERE user_id = $userId")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($ledgerIds as $ledgerId) {
        // Get transactions ordered by date
        $txStmt = $pdo->prepare("
            SELECT id, transaction_type, amount
            FROM trust_transactions
            WHERE ledger_id = ? AND user_id = ?
            ORDER BY transaction_date, id
        ");
        $txStmt->execute([$ledgerId, $userId]);
        $ledgerTxs = $txStmt->fetchAll(PDO::FETCH_ASSOC);

        $balance = 0;
        foreach ($ledgerTxs as $tx) {
            if (in_array($tx['transaction_type'], ['deposit', 'transfer_in', 'refund'])) {
                $balance += $tx['amount'];
            } else {
                $balance -= $tx['amount'];
            }

            $pdo->prepare("UPDATE trust_transactions SET running_balance = ? WHERE id = ?")->execute([$balance, $tx['id']]);
        }

        // Update ledger current_balance
        $pdo->prepare("UPDATE trust_ledger SET current_balance = ? WHERE id = ?")->execute([$balance, $ledgerId]);
    }

    $pdo->commit();
    echo "\n=== Import Complete ===\n";
    echo "Total rows: {$stats['total']}\n";
    echo "Imported: {$stats['imported']}\n";
    echo "Matched to clients: {$stats['matched']}\n";
    echo "Unassigned: {$stats['unassigned']}\n";
    echo "Skipped: {$stats['skipped']}\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "Error: " . $e->getMessage() . "\n";
    $stats['errors']++;
}
