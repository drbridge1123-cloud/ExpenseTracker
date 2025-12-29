// =====================================================
// Import Module
// =====================================================
// Dependencies: state, API_BASE, apiGet, showToast, showLoading, hideLoading

// =====================================================
// Main Functions
// =====================================================

async function loadImportPage() {
    // Load accounts (general mode only - exclude IOLTA client ledgers)
    if (state.accounts.length === 0) {
        const accountsData = await apiGet('/accounts/', { user_id: state.currentUser, account_mode: 'general' });
        if (accountsData.success) {
            state.accounts = accountsData.data.accounts;
        }
    }

    // Populate account select
    const accountSelect = document.getElementById('import-account');
    accountSelect.innerHTML = '<option value="">Choose account...</option>' +
        state.accounts.map(a => `<option value="${a.id}">${a.account_name}</option>`).join('');

    // Load institutions
    const institutions = [
        { code: 'CHASE', name: 'Chase Bank (Checking/Savings)' },
        { code: 'CHASE_CC', name: 'Chase Credit Card' },
        { code: 'BOFA', name: 'Bank of America' },
        { code: 'WF', name: 'Wells Fargo' },
        { code: 'CAPONE', name: 'Capital One' },
        { code: 'AMEX', name: 'American Express' },
        { code: 'DISCOVER', name: 'Discover' },
        { code: 'CITI', name: 'Citi Bank' },
        { code: 'ROBINHOOD', name: 'Robinhood' },
        { code: 'GENERIC', name: 'Generic CSV' }
    ];

    const institutionSelect = document.getElementById('import-institution');
    institutionSelect.innerHTML = '<option value="">Choose bank format...</option>' +
        institutions.map(i => `<option value="${i.code}">${i.name}</option>`).join('');

    // Setup form submission
    document.getElementById('import-form').onsubmit = handleImport;

    // Setup file input change handler to show selected filename
    const fileInput = document.getElementById('import-file');
    const fileUploadText = document.querySelector('.file-upload-text span');

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            fileUploadText.textContent = e.target.files[0].name;
            fileUploadText.style.color = 'var(--primary)';
        } else {
            fileUploadText.textContent = 'Drop CSV file here or click to browse';
            fileUploadText.style.color = '';
        }
    });

    // Load import history
    await loadImportHistory();
}

async function handleImport(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('account_id', document.getElementById('import-account').value);
    formData.append('institution_code', document.getElementById('import-institution').value);
    formData.append('csv_file', document.getElementById('import-file').files[0]);

    showLoading();

    try {
        const response = await fetch(`${API_BASE}/transactions/import.php`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        hideLoading();

        // 409 Conflict = duplicate file
        if (response.status === 409) {
            showToast('This file was already imported. Please select a different file.', 'warning');
            return;
        }

        const resultDiv = document.getElementById('import-result');
        resultDiv.style.display = 'block';

        if (result.success) {
            resultDiv.className = 'import-result success';
            resultDiv.innerHTML = `
                <strong>Import Successful!</strong><br>
                Imported: ${result.data.imported} transactions<br>
                Duplicates skipped: ${result.data.duplicates}
            `;
            showToast('Import completed successfully!', 'success');
            await loadImportHistory();
            // Reset file input
            document.getElementById('import-file').value = '';
        } else {
            resultDiv.className = 'import-result error';
            resultDiv.innerHTML = `<strong>Import Failed:</strong> ${result.message}`;
            showToast('Import failed: ' + result.message, 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Import error: ' + error.message, 'error');
    }
}

async function loadImportHistory() {
    // This would need an API endpoint to get import history
    // For now, show placeholder
    document.getElementById('import-history').innerHTML = `
        <tr><td colspan="6" class="text-center text-muted">Import history will appear here</td></tr>
    `;
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadImportPage = loadImportPage;
window.handleImport = handleImport;
window.loadImportHistory = loadImportHistory;
