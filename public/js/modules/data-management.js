// =====================================================
// Data Management Module
// =====================================================
// Dependencies: state, apiGet, apiPost, showToast, formatCurrency

// State
if (!window._dataManagementState) {
    window._dataManagementState = {
        currentTab: 'export'
    };
}
const dataManagementState = window._dataManagementState;

// =====================================================
// Main Functions
// =====================================================

function loadDataManagementPage() {
    setupDataManagementTabs();
    setupExportOptions();
}

function setupDataManagementTabs() {
    document.querySelectorAll('.dm-nav-item').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.dm-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.dm-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab + '-content';
            document.getElementById(tabId)?.classList.add('active');
            dataManagementState.currentTab = btn.dataset.tab;
        };
    });
}

function setupExportOptions() {
    // Modern checkbox cards don't need additional setup
    // The CSS handles the visual states via :checked pseudo-class
}

// =====================================================
// Export Functions
// =====================================================

async function exportSelectedData() {
    const selected = Array.from(document.querySelectorAll('input[name="dm-export"]:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showToast('Please select at least one data type', 'warning');
        return;
    }

    const loading = document.getElementById('dm-export-loading');
    loading?.classList.add('active');

    try {
        for (const type of selected) {
            const url = `${API_BASE}/export/${type}.php?user_id=${state.currentUser}`;

            const link = document.createElement('a');
            link.href = url;
            link.download = `export_${type}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await new Promise(resolve => setTimeout(resolve, 500));
        }
        showToast(`${selected.length} file(s) exported`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Import Functions
// =====================================================

function updateImportFileName(input) {
    const label = document.getElementById('dm-import-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
    }
}

async function importData() {
    const type = document.getElementById('dm-import-type')?.value;
    const fileInput = document.getElementById('dm-import-file');
    const resultBox = document.getElementById('dm-import-result');

    if (!fileInput?.files[0]) {
        showToast('Please select a CSV file', 'warning');
        return;
    }

    const loading = document.getElementById('dm-import-loading');
    loading?.classList.add('active');
    if (resultBox) {
        resultBox.className = 'dm-result-box';
        resultBox.style.display = 'none';
    }

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('csv_file', fileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE}/import/${type}.php`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            if (resultBox) {
                resultBox.className = 'dm-result-box success';
                resultBox.innerHTML = `
                    <strong>Import successful!</strong><br>
                    Imported: ${result.data.imported}<br>
                    Skipped: ${result.data.skipped}
                    ${result.data.errors?.length ? '<br>Errors: ' + result.data.errors.slice(0, 3).join(', ') : ''}
                `;
                resultBox.style.display = 'block';
            }
            showToast(`Imported ${result.data.imported} records`, 'success');
            fileInput.value = '';
            updateImportFileName(fileInput);
        } else {
            if (resultBox) {
                resultBox.className = 'dm-result-box error';
                resultBox.textContent = result.message || 'Import failed';
                resultBox.style.display = 'block';
            }
            showToast(result.message || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Import error:', error);
        if (resultBox) {
            resultBox.className = 'dm-result-box error';
            resultBox.textContent = 'Import failed: ' + error.message;
            resultBox.style.display = 'block';
        }
        showToast('Import failed', 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Backup Functions
// =====================================================

async function createFullBackup() {
    const loading = document.getElementById('dm-backup-loading');
    loading?.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/backup/create.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.currentUser })
        });

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'backup.zip';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('Backup downloaded', 'success');
        } else {
            const result = await response.json();
            showToast('Backup failed: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Backup error:', error);
        showToast('Backup failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Restore Functions
// =====================================================

function updateRestoreFileName(input) {
    const label = document.getElementById('dm-restore-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
    }
}

async function restoreBackup() {
    const fileInput = document.getElementById('dm-restore-file');
    const mode = document.querySelector('input[name="dm-restore-mode"]:checked')?.value || 'merge';
    const resultBox = document.getElementById('dm-restore-result');

    if (!fileInput?.files[0]) {
        showToast('Please select a backup ZIP file', 'warning');
        return;
    }

    if (mode === 'replace') {
        if (!confirm('WARNING: This will delete ALL your existing data before restoring. Are you sure?')) {
            return;
        }
    }

    const loading = document.getElementById('dm-restore-loading');
    loading?.classList.add('active');
    if (resultBox) {
        resultBox.className = 'dm-result-box';
        resultBox.style.display = 'none';
    }

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('mode', mode);
    formData.append('backup_file', fileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE}/restore/upload.php`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            let statsHtml = '';
            if (result.data.stats?.data) {
                statsHtml = '<div class="dm-stats-grid">';
                for (const [table, stat] of Object.entries(result.data.stats.data)) {
                    statsHtml += `
                        <div class="dm-stat-item">
                            <div class="dm-stat-label">${table}</div>
                            <div class="dm-stat-value">${stat.imported || 0}</div>
                        </div>
                    `;
                }
                statsHtml += '</div>';
            }

            if (resultBox) {
                resultBox.className = 'dm-result-box success';
                resultBox.innerHTML = `
                    <strong>Restore successful!</strong><br>
                    Mode: ${result.data.mode}<br>
                    Backup created: ${result.data.backup_created}
                    ${statsHtml}
                `;
                resultBox.style.display = 'block';
            }
            showToast('Backup restored successfully', 'success');
            fileInput.value = '';
            updateRestoreFileName(fileInput);
        } else {
            if (resultBox) {
                resultBox.className = 'dm-result-box error';
                resultBox.textContent = result.message || 'Restore failed';
                resultBox.style.display = 'block';
            }
            showToast(result.message || 'Restore failed', 'error');
        }
    } catch (error) {
        console.error('Restore error:', error);
        if (resultBox) {
            resultBox.className = 'dm-result-box error';
            resultBox.textContent = 'Restore failed: ' + error.message;
            resultBox.style.display = 'block';
        }
        showToast('Restore failed', 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadDataManagementPage = loadDataManagementPage;
window.exportSelectedData = exportSelectedData;
window.updateImportFileName = updateImportFileName;
window.importData = importData;
window.createFullBackup = createFullBackup;
window.updateRestoreFileName = updateRestoreFileName;
window.restoreBackup = restoreBackup;
