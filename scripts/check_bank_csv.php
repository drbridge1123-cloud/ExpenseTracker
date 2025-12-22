<?php
// 은행 CSV 전체 합계 계산
$files = [
    'C:/Users/Daniel/Downloads/Chase1052_Activity_20251221.2024.CSV',
    'C:/Users/Daniel/Downloads/Chase1052_Activity_20251221.CSV'
];

$seen = [];
$deposits = 0;
$checks = 0;
$depositCount = 0;
$checkCount = 0;

foreach ($files as $file) {
    echo "Processing: " . basename($file) . "\n";
    $f = fopen($file, 'r');
    fgetcsv($f); // skip header
    while (($row = fgetcsv($f)) !== false) {
        $date = trim($row[1] ?? '');
        $amount = (float)preg_replace('/[^0-9.\-]/', '', $row[3] ?? '');
        $checkNum = trim($row[6] ?? '');

        if ($amount == 0) continue;

        // Dedup key
        if ($amount > 0) {
            $key = 'D|' . date('Y-m-d', strtotime($date)) . '|' . round($amount, 2);
        } else {
            $key = 'C|' . $checkNum . '|' . round($amount, 2);
        }

        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;

        if ($amount > 0) {
            $deposits += $amount;
            $depositCount++;
        } else {
            $checks += $amount;
            $checkCount++;
        }
    }
    fclose($f);
}

echo "\n=== 은행 CSV 원본 (중복 제거 후) ===\n";
echo "Deposits: $depositCount 건, $" . number_format($deposits, 2) . "\n";
echo "Checks: $checkCount 건, $" . number_format($checks, 2) . "\n";
echo "Total: $" . number_format($deposits + $checks, 2) . "\n";
echo "\n은행 실제 잔액: $4,218,143.24\n";
echo "차이: $" . number_format(4218143.24 - ($deposits + $checks), 2) . "\n";
