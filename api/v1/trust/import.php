<?php
/**
 * Trust Data Import API
 * Imports IOLTA trust data from CSV files
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$userId = !empty($_POST['user_id']) ? (int)$_POST['user_id'] : null;
$type = $_POST['type'] ?? '';

if (!$userId) {
    errorResponse('user_id is required');
}

if (!$type) {
    errorResponse('type is required');
}

if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
    errorResponse('CSV file is required');
}

$db = Database::getInstance();
$pdo = $db->getConnection();

$file = fopen($_FILES['csv_file']['tmp_name'], 'r');
if (!$file) {
    errorResponse('Failed to open CSV file');
}

// Read header row
$header = fgetcsv($file);
if (!$header) {
    fclose($file);
    errorResponse('Empty CSV file');
}

// Normalize header names (remove BOM and normalize)
$header = array_map(function($col) {
    // Remove UTF-8 BOM if present
    $col = preg_replace('/^\xEF\xBB\xBF/', '', $col);
    // Normalize whitespace and convert to lowercase
    return strtolower(trim(preg_replace('/\s+/', ' ', $col)));
}, $header);

$imported = 0;
$skipped = 0;
$errors = [];

try {
    $pdo->beginTransaction();

    switch ($type) {
        case 'clients':
            list($imported, $skipped, $errors) = importClients($pdo, $file, $header, $userId);
            break;
        case 'ledger':
            list($imported, $skipped, $errors) = importLedgers($pdo, $file, $header, $userId);
            break;
        case 'transactions':
            list($imported, $skipped, $errors) = importTransactions($pdo, $file, $header, $userId);
            break;
        default:
            fclose($file);
            errorResponse('Invalid import type');
    }

    $pdo->commit();
    fclose($file);

    successResponse([
        'imported' => $imported,
        'skipped' => $skipped,
        'errors' => $errors
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fclose($file);
    errorResponse('Import failed: ' . $e->getMessage());
}

function importClients(PDO $pdo, $file, array $header, int $userId): array {
    $imported = 0;
    $skipped = 0;
    $errors = [];

    // Helper function to find column by multiple possible names
    $findColumn = function($possibleNames) use ($header) {
        foreach ($possibleNames as $name) {
            $idx = array_search(strtolower($name), $header);
            if ($idx !== false) return $idx;
        }
        return false;
    };

    // Required columns - support multiple naming conventions
    $clientNameIdx = $findColumn(['client_name', 'clientname', 'client', 'name', 'client name']);
    if ($clientNameIdx === false) {
        throw new Exception('client_name column is required (also accepts: clientname, client, name, client name)');
    }

    // Optional columns - support multiple naming conventions
    $matterIdx = $findColumn(['matter_number', 'matternumber', 'matter', 'case_number', 'casenumber', 'case number', 'matter number', 'case #', 'case#']);
    $emailIdx = $findColumn(['contact_email', 'email', 'e-mail', 'contact email']);
    $phoneIdx = $findColumn(['contact_phone', 'phone', 'telephone', 'tel', 'contact phone']);
    $addressIdx = $findColumn(['address', 'addr', 'street', 'street_address']);
    $statusIdx = $findColumn(['status', 'is_active', 'active']);

    $rowNum = 1;
    while (($row = fgetcsv($file)) !== false) {
        $rowNum++;

        $clientName = trim($row[$clientNameIdx] ?? '');
        if (empty($clientName)) {
            $errors[] = "Row $rowNum: client_name is required";
            $skipped++;
            continue;
        }

        // Check if client already exists
        $checkStmt = $pdo->prepare("SELECT id FROM trust_clients WHERE user_id = :user_id AND client_name = :name");
        $checkStmt->execute(['user_id' => $userId, 'name' => $clientName]);
        if ($checkStmt->fetch()) {
            $errors[] = "Row $rowNum: '$clientName' already exists (duplicate)";
            $skipped++;
            continue;
        }

        $data = [
            'user_id' => $userId,
            'client_name' => $clientName,
            'matter_number' => $matterIdx !== false ? trim($row[$matterIdx] ?? '') : null,
            'contact_email' => $emailIdx !== false ? trim($row[$emailIdx] ?? '') : null,
            'contact_phone' => $phoneIdx !== false ? trim($row[$phoneIdx] ?? '') : null,
            'address' => $addressIdx !== false ? trim($row[$addressIdx] ?? '') : null,
            'is_active' => $statusIdx !== false ? (strtolower(trim($row[$statusIdx] ?? '')) !== 'inactive') : true
        ];

        $sql = "INSERT INTO trust_clients (user_id, client_name, matter_number, contact_email, contact_phone, address, is_active, created_at)
                VALUES (:user_id, :client_name, :matter_number, :contact_email, :contact_phone, :address, :is_active, NOW())";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($data);
        $clientId = $pdo->lastInsertId();

        // Create Trust Sub-Account in accounts table (QuickBooks-style)
        // Find IOLTA trust account for this user
        $ioltaStmt = $pdo->prepare("SELECT id FROM accounts WHERE user_id = :user_id AND account_type = 'iolta' LIMIT 1");
        $ioltaStmt->execute(['user_id' => $userId]);
        $ioltaAccount = $ioltaStmt->fetch(PDO::FETCH_ASSOC);

        if ($ioltaAccount) {
            // Create account name: "CaseNumber ClientName" (e.g., "200556 An, Do Want")
            $matterNumber = $data['matter_number'] ?: 'C' . $clientId;
            $accountName = $matterNumber . ' ' . $clientName;

            // Insert trust sub-account
            $accountSql = "INSERT INTO accounts (user_id, parent_account_id, linked_client_id, account_name, account_type, current_balance, is_active, created_at)
                           VALUES (:user_id, :parent_id, :client_id, :name, 'trust', 0, 1, NOW())";
            $accountStmt = $pdo->prepare($accountSql);
            $accountStmt->execute([
                'user_id' => $userId,
                'parent_id' => $ioltaAccount['id'],
                'client_id' => $clientId,
                'name' => $accountName
            ]);

            // Create trust_ledger entry
            $ledgerSql = "INSERT INTO trust_ledger (user_id, client_id, account_id, current_balance, is_active, created_at)
                          VALUES (:user_id, :client_id, :account_id, 0, 1, NOW())";
            $ledgerStmt = $pdo->prepare($ledgerSql);
            $ledgerStmt->execute([
                'user_id' => $userId,
                'client_id' => $clientId,
                'account_id' => $ioltaAccount['id']
            ]);
        }

        $imported++;
    }

    return [$imported, $skipped, $errors];
}

function importLedgers(PDO $pdo, $file, array $header, int $userId): array {
    $imported = 0;
    $skipped = 0;
    $errors = [];

    // Required columns
    $clientIdIdx = array_search('client_id', $header);
    $accountIdIdx = array_search('account_id', $header);

    if ($clientIdIdx === false || $accountIdIdx === false) {
        throw new Exception('client_id and account_id columns are required');
    }

    // Optional columns
    $balanceIdx = array_search('current_balance', $header);

    $rowNum = 1;
    while (($row = fgetcsv($file)) !== false) {
        $rowNum++;

        $clientId = (int)trim($row[$clientIdIdx] ?? 0);
        $accountId = (int)trim($row[$accountIdIdx] ?? 0);

        if (!$clientId || !$accountId) {
            $errors[] = "Row $rowNum: client_id and account_id are required";
            $skipped++;
            continue;
        }

        // Verify client exists
        $checkClient = $pdo->prepare("SELECT id FROM trust_clients WHERE id = :id AND user_id = :user_id");
        $checkClient->execute(['id' => $clientId, 'user_id' => $userId]);
        if (!$checkClient->fetch()) {
            $errors[] = "Row $rowNum: client_id $clientId not found";
            $skipped++;
            continue;
        }

        // Check if ledger already exists
        $checkLedger = $pdo->prepare("SELECT id FROM trust_ledger WHERE user_id = :user_id AND client_id = :client_id AND account_id = :account_id");
        $checkLedger->execute(['user_id' => $userId, 'client_id' => $clientId, 'account_id' => $accountId]);
        if ($checkLedger->fetch()) {
            $skipped++;
            continue;
        }

        $balance = $balanceIdx !== false ? (float)trim($row[$balanceIdx] ?? 0) : 0;

        $sql = "INSERT INTO trust_ledger (user_id, client_id, account_id, current_balance, is_active, created_at)
                VALUES (:user_id, :client_id, :account_id, :balance, 1, NOW())";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'client_id' => $clientId,
            'account_id' => $accountId,
            'balance' => $balance
        ]);
        $imported++;
    }

    return [$imported, $skipped, $errors];
}

function importTransactions(PDO $pdo, $file, array $header, int $userId): array {
    $imported = 0;
    $skipped = 0;
    $errors = [];

    // Required columns
    $ledgerIdIdx = array_search('ledger_id', $header);
    $typeIdx = array_search('transaction_type', $header);
    $amountIdx = array_search('amount', $header);
    $dateIdx = array_search('transaction_date', $header);

    if ($ledgerIdIdx === false || $typeIdx === false || $amountIdx === false || $dateIdx === false) {
        throw new Exception('ledger_id, transaction_type, amount, and transaction_date columns are required');
    }

    // Optional columns
    $descIdx = array_search('description', $header);
    $refIdx = array_search('reference_number', $header);

    $rowNum = 1;
    while (($row = fgetcsv($file)) !== false) {
        $rowNum++;

        $ledgerId = (int)trim($row[$ledgerIdIdx] ?? 0);
        $type = trim($row[$typeIdx] ?? '');
        $amount = (float)trim($row[$amountIdx] ?? 0);
        $date = trim($row[$dateIdx] ?? '');

        if (!$ledgerId || !$type || !$amount || !$date) {
            $errors[] = "Row $rowNum: ledger_id, transaction_type, amount, and transaction_date are required";
            $skipped++;
            continue;
        }

        // Verify ledger exists
        $checkLedger = $pdo->prepare("SELECT current_balance FROM trust_ledger WHERE id = :id AND user_id = :user_id");
        $checkLedger->execute(['id' => $ledgerId, 'user_id' => $userId]);
        $ledger = $checkLedger->fetch(PDO::FETCH_ASSOC);
        if (!$ledger) {
            $errors[] = "Row $rowNum: ledger_id $ledgerId not found";
            $skipped++;
            continue;
        }

        $description = $descIdx !== false ? trim($row[$descIdx] ?? '') : '';
        $reference = $refIdx !== false ? trim($row[$refIdx] ?? '') : '';

        // Calculate running balance
        $runningBalance = (float)$ledger['current_balance'] + $amount;

        $sql = "INSERT INTO trust_transactions (user_id, ledger_id, transaction_type, amount, transaction_date, description, reference_number, running_balance, created_at)
                VALUES (:user_id, :ledger_id, :type, :amount, :date, :description, :reference, :running_balance, NOW())";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'user_id' => $userId,
            'ledger_id' => $ledgerId,
            'type' => $type,
            'amount' => $amount,
            'date' => $date,
            'description' => $description,
            'reference' => $reference,
            'running_balance' => $runningBalance
        ]);

        // Update ledger balance
        $updateLedger = $pdo->prepare("UPDATE trust_ledger SET current_balance = :balance WHERE id = :id");
        $updateLedger->execute(['balance' => $runningBalance, 'id' => $ledgerId]);

        $imported++;
    }

    return [$imported, $skipped, $errors];
}
