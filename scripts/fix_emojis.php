<?php
/**
 * Fix broken emoji characters in JavaScript files
 * Replaces mojibake (broken UTF-8) with HTML entities
 */

$files = [
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta-ledger.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta-reconcile.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta-reports.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta-checks.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/iolta-staging.js',
    'c:/xampp/htdocs/expensetracker/public/js/modules/cost.js',
];

// Common mojibake patterns -> HTML entities
$replacements = [
    // Money bag (💰)
    "\xC3\xB0\xC5\xB8\xE2\x80\x99\xC2\xB0" => "&#128176;",
    "ðŸ'°" => "&#128176;",

    // Bank (🏦)
    "\xC3\xB0\xC5\xB8\xC2\xA6" => "&#127974;",
    "ðŸ¦" => "&#127974;",

    // Ledger (📒)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xE2\x80\x99" => "&#128210;",
    "ðŸ"'" => "&#128210;",

    // Balance scale (⚖️)
    "\xC3\xA2\xC5\xA1\xE2\x80\x93\xC3\xAF\xC2\xB8\x8F" => "&#9878;&#65039;",
    "âš–ï¸" => "&#9878;&#65039;",

    // Inbox (📥)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xC2\xA5" => "&#128229;",
    "ðŸ"¥" => "&#128229;",

    // Writing hand (✍️)
    "\xC3\xA2\xC5\x93\xC3\xAF\xC2\xB8\x8F" => "&#9997;&#65039;",
    "âœï¸" => "&#9997;&#65039;",

    // Money with wings (💸)
    "\xC3\xB0\xC5\xB8\xE2\x80\x99\xC2\xB8" => "&#128184;",
    "ðŸ'¸" => "&#128184;",

    // Check mark (✅)
    "\xC3\xA2\xC5\x93\xE2\x80\xA6" => "&#9989;",
    "âœ…" => "&#9989;",

    // Plus (➕)
    "\xC3\xA2\xC5\xBE\xE2\x80\x95" => "&#10133;",
    "âž•" => "&#10133;",

    // Warning (⚠️)
    "\xC3\xA2\xC5\xA1\xC2\xA0" => "&#9888;",
    "âš " => "&#9888;",

    // Chart increasing (📈)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xC2\x88" => "&#128200;",
    "ðŸ"ˆ" => "&#128200;",

    // House (🏠)
    "\xC3\xB0\xC5\xB8\xC2\x8F\xC2\xA0" => "&#127968;",
    "ðŸ " => "&#127968;",

    // Building (🏢)
    "\xC3\xB0\xC5\xB8\xC2\x8F\xC2\xA2" => "&#127970;",
    "ðŸ¢" => "&#127970;",

    // Document (📄)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xC2\x84" => "&#128196;",
    "ðŸ"„" => "&#128196;",

    // Clipboard (📋)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xE2\x80\xB9" => "&#128203;",
    "ðŸ"‹" => "&#128203;",

    // Search (🔍)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9D\xC2\x8D" => "&#128269;",
    "ðŸ"" => "&#128269;",

    // Printer (🖨️)
    "\xC3\xB0\xC5\xB8\xE2\x80\x93\xC2\xA8" => "&#128424;",
    "ðŸ–¨" => "&#128424;",

    // Calendar (📅)
    "\xC3\xB0\xC5\xB8\xE2\x80\x9C\xC2\x85" => "&#128197;",
    "ðŸ"…" => "&#128197;",

    // Gear (⚙️)
    "\xC3\xA2\xC5\xA1\xE2\x80\x99" => "&#9881;",
    "âš™" => "&#9881;",

    // Trash (🗑️)
    "\xC3\xB0\xC5\xB8\xE2\x80\x94\xE2\x80\x98" => "&#128465;",
    "ðŸ—'" => "&#128465;",

    // Edit pencil (✏️)
    "\xC3\xA2\xC5\x93\xC2\x8F" => "&#9999;",
    "âœ" => "&#9999;",

    // X mark (❌)
    "\xC3\xA2\xC5\x93\xC5\x93" => "&#10060;",
    "âŒ" => "&#10060;",

    // Green check (✓)
    "\xC3\xA2\xC5\x93\xE2\x80\x9C" => "&#10004;",
    "âœ"" => "&#10004;",

    // Arrow right (➡️)
    "\xC3\xA2\xC5\xBE\xC2\xA1" => "&#10145;",
    "âž¡" => "&#10145;",
];

$totalFixed = 0;

foreach ($files as $file) {
    if (!file_exists($file)) {
        echo "File not found: $file\n";
        continue;
    }

    $content = file_get_contents($file);
    $originalContent = $content;

    foreach ($replacements as $broken => $entity) {
        $count = substr_count($content, $broken);
        if ($count > 0) {
            $content = str_replace($broken, $entity, $content);
            echo "  Replaced '$broken' -> '$entity' ($count times)\n";
            $totalFixed += $count;
        }
    }

    if ($content !== $originalContent) {
        file_put_contents($file, $content);
        echo "Fixed: $file\n";
    } else {
        echo "No changes: $file\n";
    }
}

echo "\nTotal replacements: $totalFixed\n";
