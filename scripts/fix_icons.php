<?php
require_once __DIR__ . '/../config/config.php';

$db = Database::getInstance();
$pdo = $db->getConnection();
$pdo->exec('SET NAMES utf8mb4');

$icons = [
    122 => '🏦', // Assets
    128 => '💰', // Income
    129 => '💵', // Salary
    130 => '💼', // Business Income
    131 => '📈', // Interest Income
    132 => '🔄', // Reimbursement
    133 => '🏠', // Housing
    134 => '🏠', // Rent / Mortgage
    135 => '⚡', // Electric
    136 => '💧', // Water
    137 => '🌐', // Internet
    138 => '🚗', // Transportation
    139 => '⛽', // Fuel
    140 => '🚘', // Car Insurance
    141 => '🔧', // Car Maintenance
    142 => '🍽️', // Food
    143 => '🛒', // Groceries
    144 => '🍴', // Dining Out
    145 => '👤', // Personal
    146 => '👕', // Clothing
    147 => '💪', // Health & Wellness
    148 => '📚', // Education
    149 => '💳', // Financial
    150 => '💳', // Credit Card Payment
    151 => '🏦', // Bank Fee
    152 => '🛡️', // Insurance
    153 => '📦', // Miscellaneous
    154 => '🎁', // Gifts
    155 => '✈️', // Travel
    217 => '❓', // Uncategorized
];

$stmt = $pdo->prepare('UPDATE categories SET icon = ? WHERE id = ?');

foreach ($icons as $id => $icon) {
    $stmt->execute([$icon, $id]);
    echo "Updated id $id with icon $icon\n";
}

echo "\nDone! Updated " . count($icons) . " categories.\n";
