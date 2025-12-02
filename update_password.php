<?php
$hash = password_hash('Dbghrud83#', PASSWORD_DEFAULT);
$pdo = new PDO('mysql:host=localhost;dbname=expense_tracker', 'root', '');
$stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE username = ?');
$stmt->execute([$hash, 'daniel']);
echo "Password updated for daniel.\n";
echo "Verification: " . (password_verify('Dbghrud83#', $hash) ? 'SUCCESS' : 'FAILED') . "\n";
