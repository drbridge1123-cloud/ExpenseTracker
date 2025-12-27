<?php
require_once __DIR__ . '/../config/config.php';

$db = Database::getInstance();
$pdo = $db->getConnection();

// Find transactions where description starts with payee
$stmt = $pdo->query("
    SELECT id, payee, description
    FROM trust_transactions
    WHERE payee IS NOT NULL
    AND payee != ''
    AND description LIKE CONCAT(payee, ' - %')
");

$count = 0;
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $payeeLen = strlen($row['payee']);
    $newDesc = trim(substr($row['description'], $payeeLen + 3)); // Remove "Payee - "

    $update = $pdo->prepare("UPDATE trust_transactions SET description = :desc WHERE id = :id");
    $update->execute(['desc' => $newDesc, 'id' => $row['id']]);
    $count++;

    echo "Updated ID {$row['id']}: '{$row['description']}' -> '{$newDesc}'\n";
}

echo "\nTotal updated: $count\n";
