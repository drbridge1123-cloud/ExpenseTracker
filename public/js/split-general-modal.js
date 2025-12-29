/**
 * Split General Transaction Modal
 * Split one expense/income across multiple categories
 */

// State for split modal
const generalSplitModalState = {
    totalAmount: 0,
    lines: [
        { category_id: null, category_name: '', amount: 0, description: '' },
        { category_id: null, category_name: '', amount: 0, description: '' }
    ],
    categories: [],
    accounts: []
};

function getGeneralSplitUserId() {
    return window.getCurrentUserId ? window.getCurrentUserId() : 1;
}

function openGeneralSplitModal() {
    // Reset state
    generalSplitModalState.totalAmount = 0;
    generalSplitModalState.lines = [
        { category_id: null, category_name: '', amount: 0, description: '' },
        { category_id: null, category_name: '', amount: 0, description: '' }
    ];

    // Create modal if not exists
    let modal = document.getElementById('general-split-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'general-split-modal';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; justify-content: center; align-items: center;';
        modal.innerHTML = getGeneralSplitModalHtml();
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    loadGeneralSplitData();
    renderGeneralSplitLines();

    // Set default date
    const dateInput = document.getElementById('general-split-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

function closeGeneralSplitModal() {
    const modal = document.getElementById('general-split-modal');
    if (modal) modal.style.display = 'none';
}

function getGeneralSplitModalHtml() {
    return `
        <div style="width: 700px; max-width: 95%; max-height: 90vh; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column;">
            <!-- Header -->
            <div style="padding: 20px 24px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 24px;">&#128200;</span>
                        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: white;">Split Transaction</h2>
                    </div>
                    <button onclick="closeGeneralSplitModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
                </div>
            </div>

            <!-- Body -->
            <div style="flex: 1; overflow-y: auto; padding: 24px;">
                <form id="general-split-form" onsubmit="submitGeneralSplit(event)">
                    <!-- Top row: Account, Date, Type -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Account *</label>
                            <select id="general-split-account" required style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                                <option value="">Select Account</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Date *</label>
                            <input type="date" id="general-split-date" required style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Type</label>
                            <select id="general-split-type" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                            </select>
                        </div>
                    </div>

                    <!-- Description and Total -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Description *</label>
                            <input type="text" id="general-split-description" required placeholder="e.g., Office Supplies" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Total Amount *</label>
                            <input type="number" id="general-split-total" required step="0.01" min="0.01" placeholder="0.00"
                                   oninput="updateGeneralSplitTotal(this.value)"
                                   style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; text-align: right;">
                        </div>
                    </div>

                    <!-- Vendor and Check# -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Vendor</label>
                            <input type="text" id="general-split-vendor" placeholder="Vendor name (optional)" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px;">Check/Ref #</label>
                            <input type="text" id="general-split-check" placeholder="Check or reference # (optional)" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Split Lines Section -->
                    <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                        <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Category Split</h3>
                            <button type="button" onclick="addGeneralSplitLine()"
                                    style="padding: 6px 12px; background: #6366f1; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">
                                + Add Line
                            </button>
                        </div>

                        <!-- Split Lines Table -->
                        <div id="general-split-lines" style="max-height: 250px; overflow-y: auto;">
                            <!-- Lines rendered dynamically -->
                        </div>

                        <!-- Totals Row -->
                        <div style="padding: 12px 16px; background: #f1f5f9; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
                            <div>
                                <span style="font-size: 13px; color: #64748b;">Allocated:</span>
                                <span id="general-split-allocated" style="font-size: 15px; font-weight: 700; color: #1e293b; margin-left: 8px;">$0.00</span>
                            </div>
                            <div>
                                <span style="font-size: 13px; color: #64748b;">Remaining:</span>
                                <span id="general-split-remaining" style="font-size: 15px; font-weight: 700; margin-left: 8px;">$0.00</span>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Footer -->
            <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" onclick="closeGeneralSplitModal()"
                        style="padding: 10px 20px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
                    Cancel
                </button>
                <button type="button" onclick="submitGeneralSplit(event)" id="general-split-submit-btn"
                        style="padding: 10px 24px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Save Split
                </button>
            </div>
        </div>
    `;
}

async function loadGeneralSplitData() {
    try {
        const userId = getGeneralSplitUserId();

        // Load accounts and categories in parallel
        const [accountsResult, categoriesResult] = await Promise.all([
            apiGet(`/accounts/index.php?user_id=${userId}`),
            apiGet(`/categories/index.php?user_id=${userId}`)
        ]);

        // Populate accounts dropdown
        const accountSelect = document.getElementById('general-split-account');
        if (accountSelect && accountsResult.success) {
            const accounts = accountsResult.data.accounts || [];
            generalSplitModalState.accounts = accounts;

            accountSelect.innerHTML = '<option value="">Select Account</option>';
            accounts.forEach(acc => {
                if (acc.account_type !== 'iolta') { // Exclude IOLTA accounts
                    accountSelect.innerHTML += `<option value="${acc.id}">${acc.account_name}</option>`;
                }
            });
        }

        // Store categories for split lines
        if (categoriesResult.success) {
            generalSplitModalState.categories = categoriesResult.data.categories || [];
        }
    } catch (error) {
        console.error('Error loading split data:', error);
    }
}

function renderGeneralSplitLines() {
    const container = document.getElementById('general-split-lines');
    if (!container) return;

    let html = '';
    generalSplitModalState.lines.forEach((line, index) => {
        html += `
            <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: 2fr 100px 1.5fr 40px; gap: 12px; align-items: center;">
                <div style="position: relative;">
                    <input type="text" placeholder="Select category..."
                           value="${escapeHtml(line.category_name)}"
                           data-index="${index}"
                           onfocus="showGeneralCategoryDropdown(${index})"
                           oninput="filterGeneralCategories(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                    <div id="general-category-dropdown-${index}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 1000;">
                    </div>
                </div>
                <div>
                    <input type="number" placeholder="0.00" step="0.01" min="0"
                           value="${line.amount || ''}"
                           oninput="updateGeneralSplitAmount(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box; text-align: right;">
                </div>
                <div>
                    <input type="text" placeholder="Description (optional)"
                           value="${escapeHtml(line.description)}"
                           oninput="updateGeneralSplitDescription(${index}, this.value)"
                           style="width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                </div>
                <div>
                    <button type="button" onclick="removeGeneralSplitLine(${index})"
                            style="width: 28px; height: 28px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;"
                            ${generalSplitModalState.lines.length <= 2 ? 'disabled' : ''}>
                        &times;
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateGeneralSplitTotals();
}

function showGeneralCategoryDropdown(index) {
    // Hide all other dropdowns
    document.querySelectorAll('[id^="general-category-dropdown-"]').forEach(d => d.style.display = 'none');

    const dropdown = document.getElementById(`general-category-dropdown-${index}`);
    if (dropdown) {
        dropdown.style.display = 'block';
        renderGeneralCategoryList(index, generalSplitModalState.categories);
    }
}

function filterGeneralCategories(index, query) {
    const q = query.toLowerCase();
    const filtered = generalSplitModalState.categories.filter(c =>
        c.name.toLowerCase().includes(q)
    );
    renderGeneralCategoryList(index, filtered);
}

function renderGeneralCategoryList(index, categories) {
    const dropdown = document.getElementById(`general-category-dropdown-${index}`);
    if (!dropdown) return;

    if (!categories || categories.length === 0) {
        dropdown.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 13px;">No categories found</div>';
        return;
    }

    dropdown.innerHTML = categories.map(cat => `
        <div onclick="selectGeneralCategory(${index}, ${cat.id}, '${escapeHtml(cat.name)}')"
             style="padding: 10px 12px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: background 0.15s;"
             onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">
            ${cat.icon ? `<span>${cat.icon}</span>` : ''}
            <span>${escapeHtml(cat.name)}</span>
            ${cat.parent_name ? `<span style="color: #94a3b8; font-size: 11px;">(${escapeHtml(cat.parent_name)})</span>` : ''}
        </div>
    `).join('');
}

function selectGeneralCategory(index, categoryId, categoryName) {
    generalSplitModalState.lines[index].category_id = categoryId;
    generalSplitModalState.lines[index].category_name = categoryName;

    // Update input and hide dropdown
    const input = document.querySelector(`[data-index="${index}"]`);
    if (input) input.value = categoryName;

    const dropdown = document.getElementById(`general-category-dropdown-${index}`);
    if (dropdown) dropdown.style.display = 'none';
}

function updateGeneralSplitTotal(value) {
    generalSplitModalState.totalAmount = parseFloat(value) || 0;
    updateGeneralSplitTotals();
}

function updateGeneralSplitAmount(index, value) {
    generalSplitModalState.lines[index].amount = parseFloat(value) || 0;
    updateGeneralSplitTotals();
}

function updateGeneralSplitDescription(index, value) {
    generalSplitModalState.lines[index].description = value;
}

function addGeneralSplitLine() {
    generalSplitModalState.lines.push({ category_id: null, category_name: '', amount: 0, description: '' });
    renderGeneralSplitLines();
}

function removeGeneralSplitLine(index) {
    if (generalSplitModalState.lines.length > 2) {
        generalSplitModalState.lines.splice(index, 1);
        renderGeneralSplitLines();
    }
}

function updateGeneralSplitTotals() {
    const allocated = generalSplitModalState.lines.reduce((sum, line) => sum + (line.amount || 0), 0);
    const remaining = generalSplitModalState.totalAmount - allocated;

    const allocatedEl = document.getElementById('general-split-allocated');
    const remainingEl = document.getElementById('general-split-remaining');

    if (allocatedEl) {
        allocatedEl.textContent = '$' + allocated.toFixed(2);
    }

    if (remainingEl) {
        remainingEl.textContent = '$' + remaining.toFixed(2);
        remainingEl.style.color = Math.abs(remaining) < 0.01 ? '#10b981' : '#ef4444';
    }
}

async function submitGeneralSplit(event) {
    if (event) event.preventDefault();

    const submitBtn = document.getElementById('general-split-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        // Get form values
        const accountId = document.getElementById('general-split-account')?.value;
        const date = document.getElementById('general-split-date')?.value;
        const type = document.getElementById('general-split-type')?.value || 'expense';
        const description = document.getElementById('general-split-description')?.value;
        const totalAmount = parseFloat(document.getElementById('general-split-total')?.value) || 0;
        const vendor = document.getElementById('general-split-vendor')?.value;
        const checkNumber = document.getElementById('general-split-check')?.value;

        // Validate
        if (!accountId) throw new Error('Please select an account');
        if (!date) throw new Error('Please enter a date');
        if (!description) throw new Error('Please enter a description');
        if (totalAmount <= 0) throw new Error('Please enter a valid total amount');

        // Validate splits
        const validLines = generalSplitModalState.lines.filter(l => l.category_id && l.amount > 0);
        if (validLines.length < 2) throw new Error('At least 2 valid split lines are required');

        const splitTotal = validLines.reduce((sum, l) => sum + l.amount, 0);
        if (Math.abs(splitTotal - totalAmount) > 0.01) {
            throw new Error(`Split amounts ($${splitTotal.toFixed(2)}) must equal total ($${totalAmount.toFixed(2)})`);
        }

        // Prepare data - make amount negative for expenses
        const finalAmount = type === 'expense' ? -Math.abs(totalAmount) : Math.abs(totalAmount);

        const data = {
            user_id: getGeneralSplitUserId(),
            account_id: parseInt(accountId),
            transaction_date: date,
            transaction_type: type,
            description: description,
            total_amount: finalAmount,
            vendor_name: vendor || null,
            check_number: checkNumber || null,
            splits: validLines.map(l => ({
                category_id: l.category_id,
                amount: type === 'expense' ? -Math.abs(l.amount) : Math.abs(l.amount),
                description: l.description || description
            }))
        };

        const result = await apiPost('/transactions/split.php', data);

        if (result.success) {
            closeGeneralSplitModal();

            if (typeof showToast === 'function') {
                showToast(`Split transaction created: $${Math.abs(totalAmount).toFixed(2)} across ${validLines.length} categories`, 'success');
            }

            // Refresh transactions list if on transactions page
            if (typeof loadTransactions === 'function') {
                loadTransactions();
            }
        } else {
            throw new Error(result.message || 'Failed to create split transaction');
        }
    } catch (error) {
        console.error('General split error:', error);
        alert(error.message || 'Error creating split transaction');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Split';
        }
    }
}

// Hide dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('[data-index]') && !e.target.closest('[id^="general-category-dropdown-"]')) {
        document.querySelectorAll('[id^="general-category-dropdown-"]').forEach(d => d.style.display = 'none');
    }
});

// Local escapeHtml helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export for global access
window.openGeneralSplitModal = openGeneralSplitModal;
window.closeGeneralSplitModal = closeGeneralSplitModal;
window.addGeneralSplitLine = addGeneralSplitLine;
window.removeGeneralSplitLine = removeGeneralSplitLine;
window.showGeneralCategoryDropdown = showGeneralCategoryDropdown;
window.filterGeneralCategories = filterGeneralCategories;
window.selectGeneralCategory = selectGeneralCategory;
window.updateGeneralSplitTotal = updateGeneralSplitTotal;
window.updateGeneralSplitAmount = updateGeneralSplitAmount;
window.updateGeneralSplitDescription = updateGeneralSplitDescription;
window.submitGeneralSplit = submitGeneralSplit;
