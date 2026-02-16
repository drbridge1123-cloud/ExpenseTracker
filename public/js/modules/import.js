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

    // Setup file input change handler to show selected files
    const fileInput = document.getElementById('import-file');
    const fileUploadText = document.querySelector('.file-upload-text span');
    const selectedFilesList = document.getElementById('selected-files-list');

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            if (files.length === 1) {
                fileUploadText.textContent = files[0].name;
            } else {
                fileUploadText.textContent = `${files.length} files selected`;
            }
            fileUploadText.style.color = 'var(--primary)';

            // Show file list
            if (files.length > 1 || files[0].name.endsWith('.zip')) {
                selectedFilesList.style.display = 'block';
                selectedFilesList.innerHTML = Array.from(files).map(f =>
                    `<div class="selected-file-item">
                        <span class="file-icon">${f.name.endsWith('.zip') ? '📦' : '📄'}</span>
                        <span class="file-name">${f.name}</span>
                        <span class="file-size">(${formatFileSize(f.size)})</span>
                    </div>`
                ).join('');
            } else {
                selectedFilesList.style.display = 'none';
            }
        } else {
            fileUploadText.textContent = 'Drop CSV/ZIP files here or click to browse (multiple allowed)';
            fileUploadText.style.color = '';
            selectedFilesList.style.display = 'none';
        }
    });

    // Load import history
    await loadImportHistory();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function handleImport(e) {
    e.preventDefault();

    const files = document.getElementById('import-file').files;
    if (files.length === 0) {
        showToast('Please select at least one file', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('account_id', document.getElementById('import-account').value);
    formData.append('institution_code', document.getElementById('import-institution').value);

    // Append all files with array notation
    for (let i = 0; i < files.length; i++) {
        formData.append('csv_file[]', files[i]);
    }

    showLoading();

    try {
        const response = await fetch(`${API_BASE}/transactions/import.php`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        hideLoading();

        const resultDiv = document.getElementById('import-result');
        resultDiv.style.display = 'block';

        if (result.success) {
            // Build detailed result HTML
            let resultHtml = `
                <strong>Import Completed!</strong><br>
                <div class="import-summary">
                    <span>Total files: ${result.data.total_files}</span>
                    <span>Imported: ${result.data.imported} transactions</span>
                    <span>Duplicates: ${result.data.duplicates}</span>
                </div>
            `;

            // Show per-file results if multiple files
            if (result.data.file_results && result.data.file_results.length > 1) {
                resultHtml += '<div class="file-results"><strong>File Details:</strong><ul>';
                result.data.file_results.forEach(fr => {
                    const icon = fr.status === 'success' ? '✅' : (fr.status === 'skipped' ? '⏭️' : '❌');
                    resultHtml += `<li>${icon} ${fr.file}: `;
                    if (fr.status === 'success') {
                        resultHtml += `${fr.imported} imported, ${fr.duplicates} duplicates`;
                    } else if (fr.status === 'skipped') {
                        resultHtml += fr.message;
                    } else {
                        resultHtml += `Failed - ${fr.message}`;
                    }
                    resultHtml += '</li>';
                });
                resultHtml += '</ul></div>';
            }

            resultDiv.className = 'import-result success';
            resultDiv.innerHTML = resultHtml;
            showToast(`Import completed: ${result.data.imported} transactions imported!`, 'success');
            await loadImportHistory();

            // Reset form
            document.getElementById('import-file').value = '';
            document.querySelector('.file-upload-text span').textContent = 'Drop CSV/ZIP files here or click to browse (multiple allowed)';
            document.querySelector('.file-upload-text span').style.color = '';
            document.getElementById('selected-files-list').style.display = 'none';
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
