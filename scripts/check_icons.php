<?php
require_once __DIR__ . '/../config/config.php';

$db = Database::getInstance();
$pdo = $db->getConnection();
$pdo->exec('SET NAMES utf8mb4');

$stmt = $pdo->query('SELECT id, name, icon FROM categories WHERE user_id = 1 ORDER BY id LIMIT 15');
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo $row['id'] . ' | ' . $row['name'] . ' | ' . $row['icon'] . "\n";
}
