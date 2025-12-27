<?php
/**
 * Trust Data Export API
 * Exports IOLTA trust data as CSV files
 */
require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$pdo = Database::getInstance()->getConnection();

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
$type = $_GET['type'] ?? '';

if (!$userId) {
    errorResponse('user_id is required');
}

if (!$type) {
    errorResponse('type is required');
}

$filename = "trust_{$type}_" . date('Y-m-d') . ".csv";

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$output = fopen('php://output', 'w');

switch ($type) {
    case 'clients':
        exportClients($pdo, $userId, $output);
        break;
    case 'ledger':
        exportLedgers($pdo, $userId, $output);
        break;
    case 'transactions':
        exportTransactions($pdo, $userId, $output);
        break;
    case 'checks':
        exportChecks($pdo, $userId, $output);
        break;
    case 'reconciliations':
        exportReconciliations($pdo, $userId, $output);
        break;
    case 'audit':
        exportAuditLog($pdo, $userId, $output);
        break;
    default:
        fclose($output);
        errorResponse('Invalid export type');
}

fclose($output);
exit;

function exportClients(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'client_name', 'case_number', 'contact_email', 'contact_phone', 'address', 'is_active', 'created_at']);

    $sql = "SELECT id, client_name, case_number, contact_email, contact_phone, address, is_active, created_at
            FROM trust_clients WHERE user_id = :user_id ORDER BY client_name";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}

function exportLedgers(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'client_id', 'client_name', 'account_id', 'account_name', 'current_balance', 'is_active', 'created_at']);

    $sql = "SELECT l.id, l.client_id, c.client_name, l.account_id, a.account_name, l.current_balance, l.is_active, l.created_at
            FROM trust_ledger l
            JOIN trust_clients c ON l.client_id = c.id
            JOIN accounts a ON l.account_id = a.id
            WHERE l.user_id = :user_id ORDER BY c.client_name";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}

function exportTransactions(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'ledger_id', 'client_name', 'transaction_type', 'amount', 'transaction_date', 'description', 'reference_number', 'running_balance', 'created_at']);

    $sql = "SELECT t.id, t.ledger_id, c.client_name, t.transaction_type, t.amount, t.transaction_date, t.description, t.reference_number, t.running_balance, t.created_at
            FROM trust_transactions t
            JOIN trust_ledger l ON t.ledger_id = l.id
            JOIN trust_clients c ON l.client_id = c.id
            WHERE t.user_id = :user_id ORDER BY t.transaction_date DESC, t.id DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}

function exportChecks(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'ledger_id', 'client_name', 'check_number', 'payee', 'amount', 'check_date', 'memo', 'status', 'created_at']);

    $sql = "SELECT ch.id, ch.ledger_id, c.client_name, ch.check_number, ch.payee, ch.amount, ch.check_date, ch.memo, ch.status, ch.created_at
            FROM trust_checks ch
            JOIN trust_ledger l ON ch.ledger_id = l.id
            JOIN trust_clients c ON l.client_id = c.id
            WHERE ch.user_id = :user_id ORDER BY ch.check_date DESC, ch.check_number DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}

function exportReconciliations(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'account_id', 'account_name', 'statement_date', 'statement_balance', 'book_balance', 'ledger_total', 'difference', 'status', 'notes', 'created_at']);

    $sql = "SELECT r.id, r.account_id, a.account_name, r.statement_date, r.statement_balance, r.book_balance, r.ledger_total, r.difference, r.status, r.notes, r.created_at
            FROM trust_reconciliations r
            LEFT JOIN accounts a ON r.account_id = a.id
            WHERE r.user_id = :user_id ORDER BY r.statement_date DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}

function exportAuditLog(PDO $pdo, int $userId, $output): void {
    fputcsv($output, ['id', 'action', 'entity_type', 'entity_id', 'client_id', 'client_name', 'details', 'ip_address', 'created_at']);

    $sql = "SELECT al.id, al.action, al.entity_type, al.entity_id, al.client_id,
                   COALESCE(c.client_name, 'N/A') as client_name, al.details, al.ip_address, al.created_at
            FROM trust_audit_log al
            LEFT JOIN trust_clients c ON al.client_id = c.id
            WHERE al.user_id = :user_id ORDER BY al.created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['user_id' => $userId]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, $row);
    }
}
