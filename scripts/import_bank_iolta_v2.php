<?php
/**
 * Bank Statement IOLTA Import Script v2
 * Uses bank statement as source of truth
 * Matches with QuickBooks data for client info
 *
 * IMPORTANT: The two bank files are SEQUENTIAL, NOT overlapping.
 * Trust20250306: 6/20/2024 to 3/6/2025 (net = $1,977,718.07)
 * Trust20251130: 3/6/2025 to 11/28/2025 (net = $1,915,142.49)
 * Combined net = $3,892,860.56 (matches bank ending balance)
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../core/Database.php';

$userId = 1;

// Bank files - sequential, NO date filtering needed
$bankFiles = [
    'C:/Users/Daniel/Downloads/Trust20250306.CSV',
    'C:/Users/Daniel/Downloads/Trust20251130.CSV'
];

$qbFile = 'C:/Users/Daniel/Downloads/IOLTA Full data.csv';
$cutoffDate = '2025-11-30';

$pdo = Database::getInstance()->getConnection();

echo "=== Bank Statement IOLTA Import v2 ===\n\n";

// ========================================
// STEP 1: Get Unassigned ledger
// ========================================
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

// ========================================
// STEP 2: Load all clients with matter numbers
// ========================================
$stmt = $pdo->prepare("
    SELECT c.id as client_id, c.matter_number, c.client_name, l.id as ledger_id
    FROM trust_clients c
    LEFT JOIN trust_ledger l ON l.client_id = c.id AND l.user_id = ?
    WHERE c.user_id = ? AND c.matter_number IS NOT NULL
");
$stmt->execute([$userId, $userId]);
$clients = $stmt->fetchAll(PDO::FETCH_ASSOC);

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
echo "Loaded " . count($clientMap) . " clients with ledgers\n";

// ========================================
// STEP 3: Parse QuickBooks data (for client matching)
// ========================================
echo "\n--- Parsing QuickBooks data for check matching ---\n";

$qbHandle = fopen($qbFile, 'r');
if (!$qbHandle) die("Cannot open QB file\n");

// Skip BOM
$bom = fread($qbHandle, 3);
if ($bom !== "\xEF\xBB\xBF") rewind($qbHandle);
fgetcsv($qbHandle); // header

$qbByCheckNum = [];
$qbByDateAmount = [];

while (($row = fgetcsv($qbHandle)) !== false) {
    $firstCol = trim($row[1] ?? '');
    if (strpos($firstCol, 'Total IOLTA') !== false) break;

    $type = trim($row[5] ?? '');
    $date = trim($row[7] ?? '');
    $num = trim($row[9] ?? '');
    $name = trim($row[11] ?? '');
    $memo = trim($row[13] ?? '');
    $split = trim($row[17] ?? '');
    $amount = trim($row[19] ?? '');

    if (!in_array($type, ['Deposit', 'Check', 'General Journal'])) continue;
    if (!preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $date, $dm)) continue;

    $txDate = $dm[3] . '-' . $dm[1] . '-' . $dm[2];
    $amountNum = (float)str_replace(',', '', $amount);
    if ($amountNum == 0) continue;

    // Extract matter number
    $ledgerId = $unassignedLedgerId;
    if (preg_match('/^(\d{6}(?:-[A-Za-z0-9]+)?)\s/', $split, $m)) {
        $matter = $m[1];
        if (isset($clientMap[$matter])) {
            $ledgerId = $clientMap[$matter]['ledger_id'];
        }
    }

    $qbInfo = [
        'date' => $txDate,
        'name' => $name,
        'memo' => $memo,
        'ledger_id' => $ledgerId,
        'amount' => $amountNum
    ];

    if (!empty($num)) {
        $qbByCheckNum[$num] = $qbInfo;
    }

    $key = $txDate . '|' . $amountNum;
    if (!isset($qbByDateAmount[$key])) {
        $qbByDateAmount[$key] = [];
    }
    $qbByDateAmount[$key][] = $qbInfo;
}
fclose($qbHandle);

echo "QB Checks indexed: " . count($qbByCheckNum) . "\n";
echo "QB Date+Amount keys: " . count($qbByDateAmount) . "\n";

// ========================================
// STEP 4: Parse Bank Statements
// ========================================
echo "\n--- Parsing Bank Statements ---\n";

$bankTransactions = [];
$bankStats = ['total' => 0, 'matched' => 0, 'unmatched' => 0, 'skipped_interest' => 0];
// Note: No deduplication - bank files are sequential with no overlap

foreach ($bankFiles as $bankFile) {
    echo "Processing: $bankFile\n";

    $bankHandle = fopen($bankFile, 'r');
    if (!$bankHandle) {
        echo "  Cannot open file, skipping\n";
        continue;
    }

    fgetcsv($bankHandle); // header

    while (($row = fgetcsv($bankHandle)) !== false) {
        $date = trim($row[1] ?? '');
        $desc = trim($row[2] ?? '');
        $amount = (float)($row[3] ?? 0);
        $checkNum = trim($row[6] ?? '');

        if (empty($date)) continue;

        // Parse date
        if (!preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $date, $dm)) continue;
        $txDate = $dm[3] . '-' . str_pad($dm[1], 2, '0', STR_PAD_LEFT) . '-' . str_pad($dm[2], 2, '0', STR_PAD_LEFT);

        // Skip after cutoff
        if ($txDate > $cutoffDate) continue;

        // Skip ALL interest transactions (INTEREST PAYMENT + TRUST INTEREST TRANSFER)
        // These cancel each other out (net = $0) but we exclude both to keep the balance correct
        if (strpos($desc, 'INTEREST') !== false) {
            $bankStats['skipped_interest']++;
            continue;
        }

        $bankStats['total']++;

        // Determine transaction type
        if ($amount > 0) {
            $txType = 'deposit';
            $txAmount = $amount;
        } else {
            $txType = 'disbursement';
            $txAmount = abs($amount);
        }

        // Try to match with QuickBooks
        $ledgerId = $unassignedLedgerId;
        $payee = null;
        $description = $desc;
        $matched = false;

        // Match by check number first
        if (!empty($checkNum) && isset($qbByCheckNum[$checkNum])) {
            $qb = $qbByCheckNum[$checkNum];
            $ledgerId = $qb['ledger_id'];
            $payee = $qb['name'];
            $description = $qb['memo'] ?: $qb['name'];
            $matched = true;
            $bankStats['matched']++;
        }
        // Try match by date + amount
        else {
            $key = $txDate . '|' . $amount;
            if (isset($qbByDateAmount[$key]) && count($qbByDateAmount[$key]) > 0) {
                $qb = array_shift($qbByDateAmount[$key]);
                $ledgerId = $qb['ledger_id'];
                $payee = $qb['name'];
                $description = $qb['memo'] ?: $qb['name'];
                $matched = true;
                $bankStats['matched']++;
            } else {
                $bankStats['unmatched']++;
            }
        }

        $bankTransactions[] = [
            'ledger_id' => $ledgerId,
            'transaction_type' => $txType,
            'amount' => $txAmount,
            'description' => $description,
            'payee' => $txType === 'disbursement' ? $payee : null,
            'received_from' => $txType === 'deposit' ? $payee : null,
            'check_number' => $checkNum ?: null,
            'status' => 'cleared',
            'transaction_date' => $txDate
        ];
    }
    fclose($bankHandle);
}

echo "\nBank Transactions: {$bankStats['total']}\n";
echo "  Matched to QB: {$bankStats['matched']}\n";
echo "  Unmatched: {$bankStats['unmatched']}\n";
echo "  Skipped (interest): {$bankStats['skipped_interest']}\n";

// Calculate expected total
$totalCredits = 0;
$totalDebits = 0;
foreach ($bankTransactions as $tx) {
    if ($tx['transaction_type'] === 'deposit') {
        $totalCredits += $tx['amount'];
    } else {
        $totalDebits += $tx['amount'];
    }
}
echo "\nPre-insert verification:\n";
echo "  Total Credits: $" . number_format($totalCredits, 2) . "\n";
echo "  Total Debits: $" . number_format($totalDebits, 2) . "\n";
echo "  Net: $" . number_format($totalCredits - $totalDebits, 2) . "\n";
echo "  Expected (bank ending): $3,892,860.56\n";

// ========================================
// STEP 5: Clear existing and Insert
// ========================================
echo "\n--- Clearing existing transactions and inserting ---\n";

$pdo->beginTransaction();

try {
    $pdo->prepare("DELETE FROM trust_transactions WHERE user_id = ?")->execute([$userId]);
    echo "Deleted existing transactions\n";

    $pdo->prepare("UPDATE trust_ledger SET current_balance = 0 WHERE user_id = ?")->execute([$userId]);
    echo "Reset ledger balances\n";

    $insertStmt = $pdo->prepare("
        INSERT INTO trust_transactions
        (user_id, ledger_id, transaction_type, amount, running_balance, description, payee, received_from, check_number, status, transaction_date, is_posted, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, NOW())
    ");

    $inserted = 0;
    foreach ($bankTransactions as $tx) {
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
        $inserted++;
    }
    echo "Inserted $inserted transactions\n";

    // ========================================
    // STEP 6: Recalculate running balances
    // ========================================
    echo "\n--- Recalculating running balances ---\n";

    $ledgerIds = $pdo->query("SELECT DISTINCT ledger_id FROM trust_transactions WHERE user_id = $userId")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($ledgerIds as $ledgerId) {
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

        $pdo->prepare("UPDATE trust_ledger SET current_balance = ? WHERE id = ?")->execute([$balance, $ledgerId]);
    }

    $pdo->commit();

    // ========================================
    // STEP 7: Summary
    // ========================================
    echo "\n=== Import Complete ===\n";

    $totalBalance = $pdo->query("SELECT SUM(current_balance) FROM trust_ledger WHERE user_id = $userId")->fetchColumn();
    $txCount = $pdo->query("SELECT COUNT(*) FROM trust_transactions WHERE user_id = $userId")->fetchColumn();

    echo "Total Transactions: $txCount\n";
    echo "Total Balance: $" . number_format($totalBalance, 2) . "\n";
    echo "Bank Ending Balance: $3,892,860.56 (from statement)\n";

    $diff = abs($totalBalance - 3892860.56);
    if ($diff < 1) {
        echo "STATUS: MATCH!\n";
    } else {
        echo "STATUS: DIFFERENCE of $" . number_format($diff, 2) . "\n";
    }

    $unassignedCount = $pdo->prepare("
        SELECT COUNT(*) FROM trust_transactions t
        JOIN trust_ledger l ON t.ledger_id = l.id
        JOIN trust_clients c ON l.client_id = c.id
        WHERE t.user_id = ? AND c.client_name = 'General/Unassigned'
    ");
    $unassignedCount->execute([$userId]);
    echo "Unassigned transactions: " . $unassignedCount->fetchColumn() . "\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "Error: " . $e->getMessage() . "\n";
}
