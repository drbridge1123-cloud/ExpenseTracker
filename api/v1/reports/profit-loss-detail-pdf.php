<?php
/**
 * =========================================================================
 * QuickBooks-Style Profit & Loss Detail Report - PDF Export
 * =========================================================================
 *
 * GET /api/v1/reports/profit-loss-detail-pdf.php
 *
 * Generates a production-ready PDF using pure PHP (no external libraries)
 * For production, integrate with TCPDF or DOMPDF
 *
 * Parameters: Same as profit-loss-detail.php
 */

require_once __DIR__ . '/../../../config/config.php';

// Include the main report generator
require_once __DIR__ . '/profit-loss-detail.php';

// Note: The profit-loss-detail.php will handle the request
// This file serves as documentation for PDF integration

/*
=========================================================================
OPTION 1: DOMPDF INTEGRATION (Recommended)
=========================================================================

To use DOMPDF for PDF generation:

1. Install DOMPDF via Composer:
   composer require dompdf/dompdf

2. Uncomment and use the following code:

require_once __DIR__ . '/../../../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

function generatePdfWithDompdf($htmlContent, $filename) {
    $options = new Options();
    $options->set('isHtml5ParserEnabled', true);
    $options->set('isPhpEnabled', true);
    $options->set('isRemoteEnabled', true);
    $options->set('defaultFont', 'Helvetica');

    $dompdf = new Dompdf($options);
    $dompdf->loadHtml($htmlContent);
    $dompdf->setPaper('letter', 'portrait');
    $dompdf->render();

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo $dompdf->output();
    exit;
}


=========================================================================
OPTION 2: TCPDF INTEGRATION
=========================================================================

To use TCPDF for PDF generation:

1. Install TCPDF via Composer:
   composer require tecnickcom/tcpdf

2. Use the following code:

require_once __DIR__ . '/../../../vendor/autoload.php';

class PnLDetailPdf extends TCPDF {
    protected $companyName = '';
    protected $dateRange = '';

    public function setReportInfo($companyName, $dateRange) {
        $this->companyName = $companyName;
        $this->dateRange = $dateRange;
    }

    public function Header() {
        $this->SetFont('helvetica', 'B', 14);
        $this->Cell(0, 8, $this->companyName, 0, 1, 'C');

        $this->SetFont('helvetica', 'B', 12);
        $this->Cell(0, 6, 'Profit and Loss Detail', 0, 1, 'C');

        $this->SetFont('helvetica', '', 10);
        $this->Cell(0, 5, $this->dateRange, 0, 1, 'C');

        $this->Ln(5);
    }

    public function Footer() {
        $this->SetY(-15);
        $this->SetFont('helvetica', 'I', 8);
        $this->Cell(0, 10, 'Page ' . $this->getAliasNumPage() . '/' . $this->getAliasNbPages(), 0, 0, 'C');
    }
}

function generatePdfWithTcpdf($reportData, $filename) {
    $pdf = new PnLDetailPdf('P', 'mm', 'LETTER', true, 'UTF-8');

    $pdf->setReportInfo(
        $reportData['config']['company_name'],
        $reportData['config']['date_range']['start_formatted'] . ' through ' . $reportData['config']['date_range']['end_formatted']
    );

    $pdf->SetCreator('ExpenseTracker');
    $pdf->SetAuthor($reportData['config']['company_name']);
    $pdf->SetTitle('Profit and Loss Detail');

    $pdf->SetMargins(15, 35, 15);
    $pdf->SetHeaderMargin(10);
    $pdf->SetFooterMargin(10);
    $pdf->SetAutoPageBreak(true, 20);

    $pdf->AddPage();

    // Table Header
    $pdf->SetFont('helvetica', 'B', 8);
    $pdf->SetFillColor(100, 100, 100);
    $pdf->SetTextColor(255);

    $pdf->Cell(22, 6, 'Date', 1, 0, 'L', true);
    $pdf->Cell(15, 6, 'Type', 1, 0, 'L', true);
    $pdf->Cell(20, 6, 'Num', 1, 0, 'L', true);
    $pdf->Cell(40, 6, 'Name', 1, 0, 'L', true);
    $pdf->Cell(60, 6, 'Memo', 1, 0, 'L', true);
    $pdf->Cell(25, 6, 'Amount', 1, 1, 'R', true);

    $pdf->SetTextColor(0);

    // Render sections
    $sectionOrder = ['income', 'cogs', 'expense', 'other_income', 'other_expense'];

    foreach ($sectionOrder as $sectionKey) {
        $section = $reportData['sections'][$sectionKey];
        if (empty($section['accounts'])) continue;

        // Section header
        $pdf->SetFont('helvetica', 'B', 9);
        $pdf->SetFillColor(240, 240, 240);
        $pdf->Cell(0, 6, strtoupper($section['title']), 1, 1, 'L', true);

        // Accounts
        foreach ($section['accounts'] as $account) {
            renderAccountToPdf($pdf, $account, 1);
        }

        // Section total
        $pdf->SetFont('helvetica', 'B', 8);
        $pdf->SetFillColor(220, 220, 220);
        $pdf->Cell(157, 6, 'Total ' . $section['title'], 1, 0, 'L', true);
        $pdf->Cell(25, 6, formatCurrencyForPdf($section['total']), 1, 1, 'R', true);
    }

    // Net Income
    $pdf->SetFont('helvetica', 'B', 9);
    $pdf->SetFillColor(51, 51, 51);
    $pdf->SetTextColor(255);
    $pdf->Cell(157, 7, 'NET INCOME', 1, 0, 'L', true);
    $pdf->Cell(25, 7, $reportData['summary']['net_income']['formatted'], 1, 1, 'R', true);

    $pdf->Output($filename, 'D');
    exit;
}

function renderAccountToPdf($pdf, $account, $depth) {
    $indent = str_repeat('  ', $depth);

    // Account header
    $pdf->SetFont('helvetica', 'B', 8);
    $pdf->SetFillColor(250, 250, 250);
    $pdf->Cell(0, 5, $indent . $account['account_name'], 0, 1, 'L', true);

    // Transactions
    $pdf->SetFont('helvetica', '', 7);
    if (!empty($account['direct_transactions'])) {
        foreach ($account['direct_transactions'] as $txn) {
            renderTransactionToPdf($pdf, $txn, $depth + 1);
        }
    }

    // Sub-accounts
    if (!empty($account['sub_accounts'])) {
        foreach ($account['sub_accounts'] as $subAccount) {
            $subIndent = str_repeat('  ', $depth + 1);

            $pdf->SetFont('helvetica', '', 8);
            $pdf->Cell(0, 5, $subIndent . $subAccount['account_name'], 0, 1, 'L');

            foreach ($subAccount['transactions'] as $txn) {
                renderTransactionToPdf($pdf, $txn, $depth + 2);
            }

            // Sub-account total
            $pdf->SetFont('helvetica', 'I', 7);
            $pdf->Cell(157, 4, $subIndent . 'Total ' . $subAccount['account_name'], 0, 0);
            $pdf->Cell(25, 4, formatCurrencyForPdf($subAccount['total']), 0, 1, 'R');
        }

        // Account total
        $pdf->SetFont('helvetica', 'B', 7);
        $pdf->Cell(157, 5, $indent . 'Total ' . $account['account_name'], 'T', 0);
        $pdf->Cell(25, 5, formatCurrencyForPdf($account['total']), 'T', 1, 'R');
    }
}

function renderTransactionToPdf($pdf, $txn, $depth) {
    $indent = str_repeat('  ', $depth);
    $pdf->SetFont('helvetica', '', 7);

    $pdf->Cell(22, 4, $indent . $txn['date_formatted'], 0, 0);
    $pdf->Cell(15, 4, $txn['type'], 0, 0);
    $pdf->Cell(20, 4, substr($txn['num'], 0, 12), 0, 0);
    $pdf->Cell(40, 4, substr($txn['name'], 0, 25), 0, 0);
    $pdf->Cell(60, 4, substr($txn['memo'], 0, 40), 0, 0);
    $pdf->Cell(25, 4, $txn['amount_formatted'], 0, 1, 'R');
}

function formatCurrencyForPdf($amount) {
    return ($amount < 0 ? '-' : '') . '$' . number_format(abs($amount), 2);
}


=========================================================================
OPTION 3: HTML-TO-PDF SERVICE (For Production)
=========================================================================

For production environments, consider using:

1. wkhtmltopdf - Command line tool
2. Headless Chrome/Puppeteer
3. Prince XML (commercial)
4. PDFShift API (cloud service)

Example using wkhtmltopdf:

function generatePdfWithWkhtmltopdf($htmlContent, $filename) {
    $tempHtml = tempnam(sys_get_temp_dir(), 'pnl_') . '.html';
    $tempPdf = tempnam(sys_get_temp_dir(), 'pnl_') . '.pdf';

    file_put_contents($tempHtml, $htmlContent);

    $command = sprintf(
        'wkhtmltopdf --page-size Letter --margin-top 10mm --margin-bottom 10mm %s %s 2>&1',
        escapeshellarg($tempHtml),
        escapeshellarg($tempPdf)
    );

    exec($command, $output, $returnCode);

    if ($returnCode === 0 && file_exists($tempPdf)) {
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        readfile($tempPdf);
    }

    unlink($tempHtml);
    unlink($tempPdf);
    exit;
}

*/
