<?php
/**
 * Chase Bank CSV Import Script
 * Imports bank statement transactions to staging
 * Skips duplicates based on check# + amount (already in trust_transactions)
 */

require_once __DIR__ . '/../config/config.php';

// Configuration
$CSV_FILES = [
    'C:/Users/Daniel/Downloads/Chase1052_Activity_20251221.2024.CSV',  // 2024 data
    'C:/Users/Daniel/Downloads/Chase1052_Activity_20251221.CSV'        // 2025 data
];
$USER_ID = 1;
$ACCOUNT_ID = 7; // IOLTA account ID

echo "<pre style='font-family: monospace; font-size: 12px;'>\n";
echo "===========================================\n";
echo "Chase Bank CSV Import Script\n";
echo "===========================================\n\n";

$db = Database::getInstance();
$pdo = $db->getConnection();

// For dedup within import only (Bank CSV is source of truth)
// Check staging table for duplicates to avoid re-importing same file
$existingStagingChecks = $db->fetchAll(
    "SELECT reference_number, amount FROM trust_staging
     WHERE user_id = :user_id AND account_id = :account_id
     AND reference_number IS NOT NULL AND reference_number != '' AND reference_number != '1'
     AND amount < 0",
    ['user_id' => $USER_ID, 'account_id' => $ACCOUNT_ID]
);

$existingStagingDeposits = $db->fetchAll(
    "SELECT transaction_date, amount FROM trust_staging
     WHERE user_id = :user_id AND account_id = :account_id
     AND amount > 0",
    ['user_id' => $USER_ID, 'account_id' => $ACCOUNT_ID]
);

// Build lookup maps (staging only - bank CSV is source of truth)
$checkMap = [];  // "ref|amount" => true (for checks)
$depositMap = []; // "date|amount" => true (for deposits)

foreach ($existingStagingChecks as $st) {
    $key = trim($st['reference_number']) . '|' . round((float)$st['amount'], 2);
    $checkMap[$key] = true;
}

foreach ($existingStagingDeposits as $st) {
    $key = $st['transaction_date'] . '|' . round((float)$st['amount'], 2);
    $depositMap[$key] = true;
}

echo "Loaded " . count($checkMap) . " existing staging check#/amount combinations\n";
echo "Loaded " . count($depositMap) . " existing staging deposit date/amount combinations\n\n";

$totalImported = 0;
$totalDuplicates = 0;
$totalSkipped = 0;

$pdo->beginTransaction();

try {
    foreach ($CSV_FILES as $csvFile) {
        echo "===========================================\n";
        echo "Processing: " . basename($csvFile) . "\n";
        echo "===========================================\n";

        if (!file_exists($csvFile)) {
            echo "ERROR: File not found: $csvFile\n";
            continue;
        }

        $file = fopen($csvFile, 'r');
        if (!$file) {
            echo "ERROR: Cannot open file\n";
            continue;
        }

        // Read header
        $header = fgetcsv($file);
        // Chase columns: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #

        $imported = 0;
        $duplicates = 0;
        $skipped = 0;
        $rowNum = 1;

        while (($row = fgetcsv($file)) !== false) {
            $rowNum++;

            $details = trim($row[0] ?? '');
            $date = trim($row[1] ?? '');
            $description = trim($row[2] ?? '');
            $amount = trim($row[3] ?? '');
            $type = trim($row[4] ?? '');
            $balance = trim($row[5] ?? '');
            $checkNum = trim($row[6] ?? '');

            if (empty($date) || empty($amount)) {
                $skipped++;
                continue;
            }

            // Parse date (MM/DD/YYYY)
            $parsedDate = date('Y-m-d', strtotime($date));

            // Parse amount
            $amount = preg_replace('/[^0-9.\-]/', '', $amount);
            $amount = (float)$amount;

            if ($amount == 0) {
                $skipped++;
                continue;
            }

            // Determine transaction type
            $transType = $amount > 0 ? 'deposit' : 'disbursement';

            // Check for duplicates
            if ($amount < 0 && $checkNum && $checkNum != '1') {
                // For checks: check# + amount
                $dupKey = trim($checkNum) . '|' . round($amount, 2);
                if (isset($checkMap[$dupKey])) {
                    $duplicates++;
                    continue;
                }
                $checkMap[$dupKey] = true;
            } elseif ($amount > 0) {
                // For deposits: date + amount
                $dupKey = $parsedDate . '|' . round($amount, 2);
                if (isset($depositMap[$dupKey])) {
                    $duplicates++;
                    continue;
                }
                $depositMap[$dupKey] = true;
            }

            // Insert staging record
            $db->insert('trust_staging', [
                'user_id' => $USER_ID,
                'account_id' => $ACCOUNT_ID,
                'transaction_date' => $parsedDate,
                'transaction_type' => $transType,
                'amount' => $amount,
                'description' => $description,
                'reference_number' => $checkNum ?: null,
                'status' => 'unassigned',
                'import_batch_id' => 'CHASE_' . date('YmdHis'),
                'csv_row_number' => $rowNum
            ]);

            $imported++;
        }

        fclose($file);

        echo "Imported: $imported\n";
        echo "Duplicates skipped: $duplicates\n";
        echo "Other skipped: $skipped\n\n";

        $totalImported += $imported;
        $totalDuplicates += $duplicates;
        $totalSkipped += $skipped;
    }

    $pdo->commit();

    echo "===========================================\n";
    echo "IMPORT COMPLETE\n";
    echo "===========================================\n";
    echo "Total Imported: $totalImported\n";
    echo "Total Duplicates Skipped: $totalDuplicates\n";
    echo "Total Other Skipped: $totalSkipped\n\n";

    // Verify totals
    $qbTotal = $db->fetch("SELECT SUM(amount) as total FROM trust_transactions WHERE user_id = :user_id", ['user_id' => $USER_ID]);
    $stagingTotal = $db->fetch("SELECT SUM(amount) as total FROM trust_staging WHERE user_id = :user_id", ['user_id' => $USER_ID]);

    $qb = round((float)$qbTotal['total'], 2);
    $staging = round((float)$stagingTotal['total'], 2);
    $combined = round($qb + $staging, 2);

    echo "===========================================\n";
    echo "BALANCE VERIFICATION\n";
    echo "===========================================\n";
    echo "QuickBooks (trust_transactions): $" . number_format($qb, 2) . "\n";
    echo "Staging (bank statement): $" . number_format($staging, 2) . "\n";
    echo "Combined Total: $" . number_format($combined, 2) . "\n";
    echo "Bank Balance (target): $4,218,143.24\n";
    echo "Difference: $" . number_format(4218143.24 - $combined, 2) . "\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}

echo "</pre>";
