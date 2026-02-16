<?php
/**
 * Ledger API
 * GET /api/v1/ledger?user_id=X - Get trial balance
 * GET /api/v1/ledger?user_id=X&account_id=Y - Get account ledger
 * GET /api/v1/ledger?user_id=X&journal_id=Z - Get journal entry details
 * POST /api/v1/ledger - Create journal entry
 */

require_once __DIR__ . '/../../../config/config.php';

setCorsHeaders();

$userId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : null;
if (!$userId) {
    errorResponse('User ID is required');
}

$ledger = new LedgerService($userId);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Get journal entry details
    if (!empty($_GET['journal_id'])) {
        $journalId = $_GET['journal_id'];
        $entry = $ledger->getJournalEntry($journalId);

        if ($entry) {
            successResponse($entry);
        } else {
            errorResponse('Journal entry not found', 404);
        }
    }

    // Get account ledger
    if (!empty($_GET['account_id'])) {
        $accountId = (int)$_GET['account_id'];
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $limit = (int)($_GET['limit'] ?? 100);
        $offset = (int)($_GET['offset'] ?? 0);

        $entries = $ledger->getAccountLedger($accountId, $startDate, $endDate, $limit, $offset);
        $balance = $ledger->getAccountBalance($accountId, $endDate);

        successResponse([
            'entries' => $entries,
            'balance' => $balance
        ]);
    }

    // Default: Get trial balance
    $asOfDate = $_GET['as_of_date'] ?? null;
    $trialBalance = $ledger->getTrialBalance($asOfDate);
    successResponse($trialBalance);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input)) {
        errorResponse('Invalid JSON input');
    }

    // Create journal entry
    if (!empty($input['lines'])) {
        $result = $ledger->createJournalEntry([
            'date' => $input['date'] ?? date('Y-m-d'),
            'type' => $input['type'] ?? 'standard',
            'description' => $input['description'] ?? '',
            'source_type' => $input['source_type'] ?? null,
            'source_id' => $input['source_id'] ?? null,
            'lines' => $input['lines']
        ]);

        if ($result['success']) {
            successResponse(['journal_id' => $result['journal_id']], $result['message']);
        } else {
            errorResponse($result['message']);
        }
    }

    // Simple expense entry
    if (!empty($input['expense_account_id']) && !empty($input['payment_account_id'])) {
        $result = $ledger->recordExpense(
            (int)$input['expense_account_id'],
            (int)$input['payment_account_id'],
            (float)$input['amount'],
            $input['date'] ?? date('Y-m-d'),
            $input['description'] ?? '',
            $input['transaction_id'] ?? null
        );

        if ($result['success']) {
            successResponse(['journal_id' => $result['journal_id']], $result['message']);
        } else {
            errorResponse($result['message']);
        }
    }

    // Simple income entry
    if (!empty($input['bank_account_id']) && !empty($input['income_account_id'])) {
        $result = $ledger->recordIncome(
            (int)$input['bank_account_id'],
            (int)$input['income_account_id'],
            (float)$input['amount'],
            $input['date'] ?? date('Y-m-d'),
            $input['description'] ?? '',
            $input['transaction_id'] ?? null
        );

        if ($result['success']) {
            successResponse(['journal_id' => $result['journal_id']], $result['message']);
        } else {
            errorResponse($result['message']);
        }
    }

    // Transfer
    if (!empty($input['from_account_id']) && !empty($input['to_account_id'])) {
        $result = $ledger->recordTransfer(
            (int)$input['from_account_id'],
            (int)$input['to_account_id'],
            (float)$input['amount'],
            $input['date'] ?? date('Y-m-d'),
            $input['description'] ?? 'Transfer'
        );

        if ($result['success']) {
            successResponse(['journal_id' => $result['journal_id']], $result['message']);
        } else {
            errorResponse($result['message']);
        }
    }

    errorResponse('Invalid request. Provide lines array or expense/income/transfer parameters.');
}

// Reversal endpoint
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $journalId = $_GET['journal_id'] ?? null;
    $reason = $_GET['reason'] ?? 'User requested reversal';

    if (!$journalId) {
        errorResponse('journal_id is required for reversal');
    }

    $result = $ledger->createReversalEntry($journalId, $reason);

    if ($result['success']) {
        successResponse(['reversal_journal_id' => $result['journal_id']], 'Reversal created');
    } else {
        errorResponse($result['message']);
    }
}

errorResponse('Method not allowed', 405);
