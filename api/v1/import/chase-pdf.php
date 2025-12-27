<?php
/**
 * Chase PDF Statement Parser API
 * Extracts ending balance and transactions from Chase bank statement PDFs
 */

// Suppress warnings from being output (they break JSON response)
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

// Start output buffering to catch any stray output
ob_start();

require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../vendor/autoload.php';

use Smalot\PdfParser\Parser;

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

// Handle CORS preflight
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Check if file was uploaded
if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
        UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
        UPLOAD_ERR_EXTENSION => 'A PHP extension stopped the file upload'
    ];
    $errorCode = $_FILES['pdf']['error'] ?? UPLOAD_ERR_NO_FILE;
    errorResponse($errorMessages[$errorCode] ?? 'Upload error', 400);
}

$file = $_FILES['pdf'];

// Validate file type
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if ($mimeType !== 'application/pdf') {
    errorResponse('Invalid file type. Please upload a PDF file.', 400);
}

try {
    error_log('PDF Upload: Starting parse for file: ' . $file['name'] . ', size: ' . $file['size']);

    $parser = new Parser();
    $pdf = $parser->parseFile($file['tmp_name']);

    error_log('PDF Upload: Parser succeeded, getting text');
    $text = $pdf->getText();

    error_log('PDF Upload: Text length: ' . strlen($text));

    // Parse Chase statement
    $result = parseChasePdf($text);

    error_log('PDF Upload: Parse complete, result keys: ' . implode(', ', array_keys($result)));
    error_log('PDF Upload: ending_balance = ' . ($result['ending_balance'] ?? 'null'));
    error_log('PDF Upload: raw_text_preview = ' . ($result['raw_text_preview'] ?? 'null'));

    // Check if JSON encoding works
    $jsonTest = json_encode($result);
    if ($jsonTest === false) {
        error_log('PDF Upload: JSON encode failed: ' . json_last_error_msg());
        // Try to fix encoding issues
        $preview = $result['raw_text_preview'] ?? '';
        $result['raw_text_preview'] = $preview ? mb_convert_encoding($preview, 'UTF-8', 'UTF-8') : '';
        foreach ($result['transactions'] as &$tx) {
            if (!empty($tx['description'])) {
                $tx['description'] = mb_convert_encoding($tx['description'], 'UTF-8', 'UTF-8');
            }
        }
    }

    error_log('PDF Upload: Sending successResponse now');

    // Manually output JSON to ensure it works
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Encoding: identity'); // Disable compression
    header('Cache-Control: no-cache');
    $output = json_encode([
        'success' => true,
        'message' => 'Success',
        'data' => $result
    ], JSON_UNESCAPED_UNICODE);

    if ($output === false) {
        error_log('PDF Upload: Final JSON encode failed: ' . json_last_error_msg());
        // Strip problematic data
        unset($result['raw_text_preview']);
        $result['transactions'] = [];
        $output = json_encode([
            'success' => true,
            'message' => 'Success',
            'data' => $result
        ]);
    }

    error_log('PDF Upload: Output length: ' . strlen($output));

    // Discard any buffered output (warnings, etc.) and send clean JSON
    while (ob_get_level()) {
        ob_end_clean();
    }

    // Set headers again after clearing buffers
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Length: ' . strlen($output));

    echo $output;
    exit;

} catch (Throwable $e) {
    error_log('PDF Parse Error: ' . $e->getMessage());
    error_log('PDF Parse Error trace: ' . $e->getTraceAsString());
    errorResponse('Failed to parse PDF: ' . $e->getMessage(), 500);
}

/**
 * Parse Chase bank statement PDF text
 */
function parseChasePdf(string $text): array {
    // Log first 1000 chars of raw text for debugging
    error_log('PDF Upload: Raw text first 1000 chars: ' . substr($text, 0, 1000));

    // Clean the raw text preview - remove control characters that break JSON
    $rawPreview = substr($text, 0, 500);
    // Use simple string replacement instead of preg_replace with unicode
    $cleanPreview = str_replace(["\r", "\n", "\t"], ' ', $rawPreview ?: '');
    $cleanPreview = preg_replace('/[^\x20-\x7E]/', '', $cleanPreview); // Keep only printable ASCII

    $result = [
        'bank' => 'chase',
        'account_number_last4' => null,
        'statement_period' => [
            'start' => null,
            'end' => null
        ],
        'beginning_balance' => null,
        'ending_balance' => null,
        'deposits_total' => null,
        'withdrawals_total' => null,
        'transactions' => [],
        'raw_text_preview' => $cleanPreview
    ];

    // Clean up text
    $text = str_replace("\r", "\n", $text);
    $lines = explode("\n", $text);
    $fullText = implode(' ', array_map('trim', $lines));

    // Extract Account Number (last 4 digits)
    if (preg_match('/Account\s*(?:Number|#)?[:\s]*[\d\*\-]*(\d{4})\b/i', $fullText, $matches)) {
        $result['account_number_last4'] = $matches[1];
    }

    // Extract Statement Period - Chase format: "November 1 through November 28, 2025"
    if (preg_match('/(\w+\s+\d{1,2})\s*(?:through|to|-)\s*(\w+\s+\d{1,2},?\s*\d{4})/i', $fullText, $matches)) {
        $startStr = $matches[1];
        $endStr = $matches[2];

        // Extract year from end date
        if (preg_match('/(\d{4})/', $endStr, $yearMatch)) {
            $year = $yearMatch[1];
            // Add year to start date if not present
            if (!preg_match('/\d{4}/', $startStr)) {
                $startStr .= ', ' . $year;
            }
        }

        $startDate = strtotime($startStr);
        $endDate = strtotime($endStr);

        if ($startDate) {
            $result['statement_period']['start'] = date('Y-m-d', $startDate);
        }
        if ($endDate) {
            $result['statement_period']['end'] = date('Y-m-d', $endDate);
        }
    }

    // Extract Beginning Balance - Chase shows "Beginning Balance" with amount
    if (preg_match('/Beginning\s*Balance[:\s]*\$?([\d,]+\.?\d*)/i', $fullText, $matches)) {
        $result['beginning_balance'] = parseAmount($matches[1]);
    }

    // Extract Ending Balance - multiple patterns for Chase
    // Chase format: "Ending Balance 173 $3,892,860.56" (173 is instance count)
    $endingBalancePatterns = [
        '/Ending\s*Balance\s+\d+\s+\$?([\d,]+\.\d{2})/i',       // "Ending Balance 173 $3,892,860.56"
        '/Ending\s*Balance\s*\$\s*([\d,]+\.\d{2})/i',           // "Ending Balance $3,892,860.56"
        '/Ending\s*Balance[:\s]+\$?\s*([\d,]+\.\d{2})/i',       // "Ending Balance: 3,892,860.56"
        '/Statement\s*Ending\s*Balance\s*\$?\s*([\d,]+\.\d{2})/i',
        '/Closing\s*Balance\s*\$?\s*([\d,]+\.\d{2})/i',
        '/Balance\s*on\s*\w+\s*\d+[:\s]*\$?\s*([\d,]+\.\d{2})/i'
    ];

    // Log fullText for debugging (first 500 chars)
    error_log('PDF Upload: fullText first 500 chars: ' . substr($fullText, 0, 500));

    foreach ($endingBalancePatterns as $pattern) {
        if (preg_match($pattern, $fullText, $matches)) {
            $amount = parseAmount($matches[1]);
            error_log('PDF Upload: Pattern matched: ' . $pattern . ' => raw: ' . $matches[1] . ', parsed: ' . $amount);
            // Sanity check: ending balance should be > $100 for a real statement
            if ($amount > 100) {
                $result['ending_balance'] = $amount;
                break;
            }
        }
    }

    // If no balance found, try to find any large dollar amount after "Ending Balance"
    if ($result['ending_balance'] === null) {
        error_log('PDF Upload: No ending balance found with standard patterns, trying fallback');
        // Look for pattern like "Ending Balance" followed by dollar amount anywhere
        if (preg_match('/Ending\s*Balance.*?\$?([\d,]+\.\d{2})/is', $fullText, $matches)) {
            $amount = parseAmount($matches[1]);
            error_log('PDF Upload: Fallback pattern matched: ' . $matches[1] . ' => ' . $amount);
            if ($amount > 100) {
                $result['ending_balance'] = $amount;
            }
        }
    }

    // Extract Deposits/Credits Total
    if (preg_match('/(?:Deposits?\s*(?:and\s*)?(?:Other\s*)?(?:Additions?|Credits?)?)[:\s]*\$?([\d,]+\.?\d*)/i', $fullText, $matches)) {
        $result['deposits_total'] = parseAmount($matches[1]);
    }

    // Extract Withdrawals/Debits Total
    if (preg_match('/(?:(?:Electronic\s*)?Withdrawals?|Checks?\s*(?:Paid)?|Debits?)[:\s]*-?\$?([\d,]+\.?\d*)/i', $fullText, $matches)) {
        $result['withdrawals_total'] = parseAmount($matches[1]);
    }

    // Extract individual transactions
    $result['transactions'] = extractChaseTransactions($text);

    return $result;
}

/**
 * Extract individual transactions from Chase statement
 */
function extractChaseTransactions(string $text): array {
    $transactions = [];
    $lines = explode("\n", $text);

    $currentYear = date('Y');
    $inTransactionSection = false;

    foreach ($lines as $line) {
        $line = trim($line);

        // Detect transaction section headers
        if (preg_match('/TRANSACTION\s*DETAIL|DEPOSITS?\s*AND\s*ADDITIONS|ELECTRONIC\s*WITHDRAWALS|CHECKS?\s*PAID/i', $line)) {
            $inTransactionSection = true;
            continue;
        }

        // Skip empty lines and headers
        if (empty($line) || strlen($line) < 10) {
            continue;
        }

        // Chase transaction pattern: MM/DD Description Amount [Balance]
        // Example: "11/05 REMOTE ONLINE DEPOSIT #1 16,000.00"
        // Example: "11/06 CHECK 1234 2,500.00"
        if (preg_match('/^(\d{1,2}\/\d{1,2})\s+(.+?)\s+([\d,]+\.?\d{0,2})(?:\s+([\d,]+\.?\d{0,2}))?$/', $line, $matches)) {
            $date = $matches[1];
            // Clean description - remove control characters
            $description = trim($matches[2] ?? '');
            $description = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $description) ?: '';
            $description = $description ? mb_convert_encoding($description, 'UTF-8', 'UTF-8') : '';
            $amount = parseAmount($matches[3]);
            $balance = isset($matches[4]) ? parseAmount($matches[4]) : null;

            // Add year to date
            $fullDate = $date . '/' . $currentYear;
            $timestamp = strtotime($fullDate);

            // Determine if deposit or withdrawal based on description
            $isDeposit = preg_match('/DEPOSIT|CREDIT|TRANSFER\s*IN|REFUND/i', $description);
            $isWithdrawal = preg_match('/CHECK|WITHDRAWAL|DEBIT|TRANSFER\s*OUT|PAYMENT/i', $description);

            // Extract check number if present
            $checkNumber = null;
            if (preg_match('/CHECK\s*#?\s*(\d+)/i', $description, $checkMatch)) {
                $checkNumber = $checkMatch[1];
            }

            $transactions[] = [
                'date' => $timestamp ? date('Y-m-d', $timestamp) : null,
                'description' => $description,
                'amount' => $isWithdrawal && $amount > 0 ? -$amount : $amount,
                'balance' => $balance,
                'check_number' => $checkNumber,
                'type' => $isDeposit ? 'deposit' : ($isWithdrawal ? 'withdrawal' : 'unknown')
            ];
        }
    }

    return $transactions;
}

/**
 * Parse amount string to float
 */
function parseAmount(string $amount): float {
    // Remove commas and convert to float
    $cleaned = str_replace([',', '$', ' '], '', $amount);
    return (float) $cleaned;
}
