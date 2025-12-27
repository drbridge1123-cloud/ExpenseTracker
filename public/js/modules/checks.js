// =====================================================
// Checks Module - v20251225d
// =====================================================
// Dependencies: state, apiGet, apiPost, formatCurrency, formatDate, showToast, buildHierarchicalCategoryOptions

// State
if (!window._checksState) {
    window._checksState = {
        checksData: null,
        nextCheckNumbers: {},
        currentCheckFilter: ''
    };
}
const checksState = window._checksState;

let checksData = checksState.checksData;
let nextCheckNumbers = checksState.nextCheckNumbers;
let currentCheckFilter = checksState.currentCheckFilter;

// =====================================================
// Main Functions
// =====================================================

async function loadChecksPage() {
    document.getElementById('check-date').value = new Date().toISOString().split('T')[0];
    await Promise.all([loadChecks(), loadCheckAccounts(), loadCheckCategories()]);
    updateCheckPreview();

    // Add form submit handler
    const checkForm = document.getElementById('check-form');
    if (checkForm && !checkForm.dataset.initialized) {
        checkForm.dataset.initialized = 'true';
        checkForm.addEventListener('submit', saveCheck);
    }

    // Add month change handler for budgets
    const budgetMonth = document.getElementById('budget-month');
    if (budgetMonth && !budgetMonth.dataset.initialized) {
        budgetMonth.dataset.initialized = 'true';
        budgetMonth.addEventListener('change', loadBudgets);
    }
}

const DEFAULT_START_CHECK_NUMBER = 3100;

async function loadChecks() {
    const params = { user_id: state.currentUser };
    if (currentCheckFilter) params.status = currentCheckFilter;

    try {
        const result = await apiGet('/checks/', params);
        if (result.success) {
            checksData = result.data;
            checksState.checksData = checksData;
            nextCheckNumbers = result.data.next_check_numbers || {};
            checksState.nextCheckNumbers = nextCheckNumbers;
            renderChecks();
            updateChecksSummary();
            // Set next check number for new checks
            setNextCheckNumber();
        }
    } catch (error) {
        console.error('Error loading checks:', error);
    }
}

// Calculate and set the next check number
function setNextCheckNumber() {
    const checkNumberInput = document.getElementById('check-number');
    const checkIdInput = document.getElementById('check-id');

    // Only set for new checks (not editing)
    if (!checkNumberInput || (checkIdInput && checkIdInput.value)) return;

    const checks = checksData?.checks || [];
    if (checks.length === 0) {
        checkNumberInput.value = DEFAULT_START_CHECK_NUMBER;
    } else {
        // Find the highest check number and add 1
        const maxNumber = Math.max(...checks.map(c => parseInt(c.check_number) || 0));
        checkNumberInput.value = Math.max(maxNumber + 1, DEFAULT_START_CHECK_NUMBER);
    }
    updateCheckPreview();
}

async function loadCheckAccounts() {
    try {
        const result = await apiGet('/accounts/', { user_id: state.currentUser });
        if (result.success) {
            const accounts = result.data.accounts.filter(a => a.account_type === 'checking');
            const select = document.getElementById('check-account');
            if (select) {
                select.innerHTML = '<option value="">Select account</option>' +
                    accounts.map(a => `<option value="${a.id}">${a.account_name}</option>`).join('');
            }
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

async function loadCheckCategories() {
    try {
        const result = await apiGet('/categories/', { user_id: state.currentUser });
        if (result.success) {
            const categories = result.data.categories || [];
            const select = document.getElementById('check-category');
            if (select) {
                // Filter expense categories for checks
                const expenseCategories = categories.filter(c =>
                    c.category_type === 'expense'
                );

                // Group by parent using optgroup for better UX
                const parents = expenseCategories.filter(c => !c.parent_id);
                const children = expenseCategories.filter(c => c.parent_id);

                let options = '<option value="">Select category</option>';

                parents.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                parents.forEach(parent => {
                    const subs = children.filter(c => c.parent_id === parent.id);
                    if (subs.length > 0) {
                        // Parent with children - use optgroup
                        options += `<optgroup label="${parent.name}">`;
                        subs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                        subs.forEach(sub => {
                            options += `<option value="${sub.id}">${sub.name}</option>`;
                        });
                        options += '</optgroup>';
                    } else {
                        // Parent without children - show as option
                        options += `<option value="${parent.id}">${parent.name}</option>`;
                    }
                });

                select.innerHTML = options;
            }
        }
    } catch (error) {
        console.error('Error loading categories for checks:', error);
    }
}

function renderChecks() {
    const container = document.getElementById('checks-list');
    if (!container || !checksData) return;

    const checks = checksData.checks || [];

    if (checks.length === 0) {
        container.innerHTML = `
            <div class="register-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c9a962" stroke-width="1.5">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <path d="M3 10h18"/>
                </svg>
                <p>No checks found</p>
            </div>
        `;
        return;
    }

    // Render as register items for banking theme
    container.innerHTML = checks.map(check => `
        <div class="register-item" onclick="editCheck(${check.id})">
            <div class="register-item-number">#${check.check_number}</div>
            <div class="register-item-details">
                <div class="register-item-payee">${check.payee}</div>
                <div class="register-item-memo">${check.memo || ''}</div>
            </div>
            <div>
                <div class="register-item-amount">${formatCurrency(check.amount)}</div>
                <div class="register-item-date">${formatDateShort(check.check_date)}</div>
                <span class="register-item-status ${check.status}">${check.status}</span>
            </div>
        </div>
    `).join('');
}

function updateChecksSummary() {
    if (!checksData) return;
    const summary = checksData.summary || {};

    const pendingCount = document.getElementById('pending-count');
    const pendingAmount = document.getElementById('pending-amount');
    if (pendingCount) pendingCount.textContent = summary.pending_count || 0;
    if (pendingAmount) pendingAmount.textContent = formatCurrency(summary.pending_amount || 0);
}

function filterChecks(status, element) {
    currentCheckFilter = status;
    checksState.currentCheckFilter = status;
    // Support both old and new class names
    document.querySelectorAll('.checks-filter-tab, .register-tab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');
    loadChecks();
}

function updateNextCheckNumber() {
    const accountId = document.getElementById('check-account').value;
    if (accountId && nextCheckNumbers[accountId]) {
        document.getElementById('check-number').value = nextCheckNumbers[accountId];
    } else if (accountId) {
        document.getElementById('check-number').value = '1001';
    }
    updateCheckPreview();
}

function updateCheckPreview() {
    const amount = parseFloat(document.getElementById('check-amount')?.value) || 0;

    // Update amount in words (this element exists in new design)
    const previewWords = document.getElementById('preview-amount-words');
    if (previewWords) previewWords.textContent = numberToWords(amount);

    // Legacy preview elements (for backwards compatibility)
    const previewNumber = document.getElementById('preview-number');
    const previewDate = document.getElementById('preview-date');
    const previewPayee = document.getElementById('preview-payee');
    const previewAmount = document.getElementById('preview-amount');
    const previewMemo = document.getElementById('preview-memo');

    if (previewNumber) {
        const number = document.getElementById('check-number')?.value || '----';
        previewNumber.textContent = number;
    }
    if (previewDate) {
        const date = document.getElementById('check-date')?.value;
        previewDate.textContent = date ? formatDateShort(date) : '--/--/----';
    }
    if (previewPayee) {
        const payee = document.getElementById('check-payee')?.value || '';
        previewPayee.textContent = payee;
    }
    if (previewAmount) previewAmount.textContent = amount.toFixed(2);
    if (previewMemo) {
        const memo = document.getElementById('check-memo')?.value || '';
        previewMemo.textContent = memo;
    }
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function numberToWords(amount) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const dollars = Math.floor(amount);
    const cents = Math.round((amount - dollars) * 100);

    let words = '';
    if (dollars === 0) words = 'Zero';
    else if (dollars < 20) words = ones[dollars];
    else if (dollars < 100) words = tens[Math.floor(dollars / 10)] + (dollars % 10 ? ' ' + ones[dollars % 10] : '');
    else if (dollars < 1000) {
        words = ones[Math.floor(dollars / 100)] + ' Hundred';
        if (dollars % 100) words += ' ' + (dollars % 100 < 20 ? ones[dollars % 100] : tens[Math.floor((dollars % 100) / 10)] + (dollars % 10 ? ' ' + ones[dollars % 10] : ''));
    } else {
        const thousands = Math.floor(dollars / 1000);
        words = (thousands < 20 ? ones[thousands] : tens[Math.floor(thousands / 10)] + (thousands % 10 ? ' ' + ones[thousands % 10] : '')) + ' Thousand';
        if (dollars % 1000) words += ' ' + numberToWords(dollars % 1000).split(' and')[0];
    }

    return words + ' and ' + cents.toString().padStart(2, '0') + '/100 dollars';
}

// Check if check number is already used (for new checks only)
function isCheckNumberUsed(checkNumber, excludeId = null) {
    const checks = checksData?.checks || [];
    return checks.some(c =>
        c.check_number == checkNumber &&
        (excludeId === null || c.id != excludeId)
    );
}

async function saveCheck(e) {
    e.preventDefault();

    // Default to Chase Checking account (ID: 522)
    const DEFAULT_CHECK_ACCOUNT_ID = 522;

    const checkNumber = document.getElementById('check-number').value;
    const checkId = document.getElementById('check-id').value;

    // For new checks, validate check number is not already used
    if (!checkId && isCheckNumberUsed(checkNumber)) {
        showToast(`Check #${checkNumber} already exists. Please use a different number.`, 'error');
        return;
    }

    const data = {
        user_id: state.currentUser,
        account_id: DEFAULT_CHECK_ACCOUNT_ID,
        check_number: checkNumber,
        payee: document.getElementById('check-payee').value,
        amount: parseFloat(document.getElementById('check-amount').value),
        check_date: document.getElementById('check-date').value,
        memo: document.getElementById('check-memo').value,
        category_id: document.getElementById('check-category').value || null,
        status: 'pending',
        create_transaction: true
    };

    if (checkId) data.id = parseInt(checkId);

    try {
        const result = await apiPost('/checks/', data);
        if (result.success) {
            showToast(result.message || 'Check saved');
            resetCheckForm();
            loadChecks();
        } else {
            showToast(result.message || 'Error saving check', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error saving check', 'error');
    }
}

function resetCheckForm() {
    const form = document.getElementById('check-form');
    if (form) form.reset();
    document.getElementById('check-id').value = '';
    document.getElementById('check-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('create-transaction').checked = true;
    document.getElementById('check-status').value = 'pending';
    // Hide delete button when creating new check
    const deleteBtn = document.getElementById('delete-check-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    // Set next check number
    setNextCheckNumber();
}

function editCheck(id) {
    const check = checksData?.checks?.find(c => c.id === id);
    if (!check) return;

    document.getElementById('check-id').value = id;
    document.getElementById('check-account').value = check.account_id;
    document.getElementById('check-number').value = check.check_number;
    document.getElementById('check-date').value = check.check_date;
    document.getElementById('check-payee').value = check.payee;
    document.getElementById('check-amount').value = check.amount;
    document.getElementById('check-memo').value = check.memo || '';
    document.getElementById('check-category').value = check.category_id || '';
    document.getElementById('check-status').value = check.status || 'pending';

    // Show delete button when editing
    const deleteBtn = document.getElementById('delete-check-btn');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';

    updateCheckPreview();
    document.querySelector('#page-checks .checks-form-card')?.scrollIntoView({ behavior: 'smooth' });
}

async function deleteCheck() {
    const checkId = document.getElementById('check-id').value;
    if (!checkId) return;

    const check = checksData?.checks?.find(c => c.id === parseInt(checkId));
    const checkNumber = check?.check_number || checkId;

    if (!confirm(`Are you sure you want to delete Check #${checkNumber}?`)) {
        return;
    }

    try {
        const result = await apiDelete(`/checks/?id=${checkId}`);
        if (result.success) {
            showToast('Check deleted');
            resetCheckForm();
            loadChecks();
        } else {
            showToast(result.message || 'Error deleting check', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error deleting check', 'error');
    }
}

function printCheck() {
    window.print();
}

// Save check from button click (not form submit)
async function saveCheckFromButton() {
    // Default to Chase Checking account (ID: 522)
    const DEFAULT_CHECK_ACCOUNT_ID = 522;

    const checkNumber = document.getElementById('check-number').value;
    const checkId = document.getElementById('check-id').value;

    // Validation
    if (!checkNumber) {
        showToast('Please enter a check number', 'error');
        return;
    }

    // For new checks, validate check number is not already used
    if (!checkId && isCheckNumberUsed(checkNumber)) {
        showToast(`Check #${checkNumber} already exists. Please use a different number.`, 'error');
        return;
    }

    const data = {
        user_id: state.currentUser,
        account_id: DEFAULT_CHECK_ACCOUNT_ID,
        check_number: checkNumber,
        payee: document.getElementById('check-payee').value,
        amount: parseFloat(document.getElementById('check-amount').value),
        check_date: document.getElementById('check-date').value,
        memo: document.getElementById('check-memo').value,
        category_id: document.getElementById('check-category').value || null,
        status: 'pending',
        create_transaction: true
    };

    if (!data.payee) {
        showToast('Please enter payee name', 'error');
        return;
    }
    if (!data.amount || data.amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    if (!data.check_date) {
        showToast('Please select a date', 'error');
        return;
    }

    if (checkId) data.id = parseInt(checkId);

    try {
        const result = await apiPost('/checks/', data);
        if (result.success) {
            showToast(result.message || 'Check saved');
            resetCheckForm();
            loadChecks();
        } else {
            showToast(result.message || 'Error saving check', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error saving check', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadChecksPage = loadChecksPage;
window.loadChecks = loadChecks;
window.filterChecks = filterChecks;
window.updateNextCheckNumber = updateNextCheckNumber;
window.updateCheckPreview = updateCheckPreview;
window.saveCheck = saveCheck;
window.saveCheckFromButton = saveCheckFromButton;
window.resetCheckForm = resetCheckForm;
window.editCheck = editCheck;
window.deleteCheck = deleteCheck;
window.printCheck = printCheck;

