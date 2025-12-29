// =====================================================
// Budgets Module
// =====================================================
// Dependencies: state, apiGet, apiPost, apiDelete, formatCurrency, showToast

// State
if (!window._budgetsState) {
    window._budgetsState = {
        budgetsData: null,
        currentBudgetEditId: null
    };
}
const budgetsState = window._budgetsState;

// Local references for convenience
let budgetsData = budgetsState.budgetsData;
let currentBudgetEditId = budgetsState.currentBudgetEditId;

// =====================================================
// Main Functions
// =====================================================

async function loadBudgetsPage() {
    const monthInput = document.getElementById('budget-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }
    await loadBudgets();
}

async function loadBudgets() {
    const monthInput = document.getElementById('budget-month');
    const month = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);

    try {
        const result = await apiGet('/budgets/', { user_id: state.currentUser, month: month });
        if (result.success) {
            budgetsData = result.data;
            budgetsState.budgetsData = budgetsData;
            renderBudgets();
            updateBudgetsSummary();
        }
    } catch (error) {
        console.error('Error loading budgets:', error);
    }
}

function renderBudgets() {
    const container = document.getElementById('budgets-list');
    if (!container || !budgetsData) return;

    const budgets = budgetsData.budgets || [];

    if (budgets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💰</div>
                <p>No budgets set yet. Click "Add Budget" to get started!</p>
            </div>
        `;
        return;
    }

    const statusText = { 'on_track': 'On Track', 'warning': 'Warning', 'over_budget': 'Over Budget' };

    container.innerHTML = budgets.map(budget => `
        <div class="budget-card" onclick="editBudget(${budget.id}, ${budget.category_id}, ${budget.budget_amount})">
            <div class="budget-icon" style="background: ${budget.category_color || '#6366f1'}20; color: ${budget.category_color || '#6366f1'}">
                ${budget.category_icon || '📁'}
            </div>
            <div class="budget-info">
                <div class="budget-name">${budget.category_name}</div>
                <div class="budget-amounts">
                    <span>Spent: ${formatCurrency(budget.spent)}</span>
                    <span>Budget: ${formatCurrency(budget.budget_amount)}</span>
                    <span>Remaining: ${formatCurrency(budget.remaining)}</span>
                </div>
                <div class="budget-progress">
                    <div class="budget-progress-bar" style="width: ${Math.min(budget.percent_used, 100)}%; background: ${getStatusColor(budget.status)}"></div>
                </div>
            </div>
            <div class="budget-actions">
                <div class="budget-percent ${budget.status}">${budget.percent_used}%</div>
                <div class="budget-status ${budget.status}">${statusText[budget.status] || 'Unknown'}</div>
            </div>
        </div>
    `).join('');
}

function updateBudgetsSummary() {
    if (!budgetsData) return;
    const { summary } = budgetsData;

    const totalBudgetEl = document.getElementById('total-budget');
    const totalSpentEl = document.getElementById('total-spent');
    if (totalBudgetEl) totalBudgetEl.textContent = formatCurrency(summary.total_budget);
    if (totalSpentEl) totalSpentEl.textContent = formatCurrency(summary.total_spent);

    const remaining = document.getElementById('total-remaining');
    if (remaining) {
        remaining.textContent = formatCurrency(summary.total_remaining);
        remaining.className = 'budgets-card-value ' + (summary.total_remaining >= 0 ? 'income' : 'expense');
    }

    const progressBar = document.getElementById('overall-progress-bar');
    if (progressBar) {
        const percent = Math.min(summary.overall_percent, 100);
        progressBar.style.width = percent + '%';
        progressBar.className = 'budgets-progress-fill' + (summary.overall_percent > 100 ? ' over' : summary.overall_percent > 75 ? ' warning' : '');
    }

    const progressSpent = document.getElementById('progress-spent');
    const progressPercent = document.getElementById('progress-percent');
    const progressBudget = document.getElementById('progress-budget');
    if (progressSpent) progressSpent.textContent = formatCurrency(summary.total_spent) + ' spent';
    if (progressPercent) progressPercent.textContent = summary.overall_percent + '%';
    if (progressBudget) progressBudget.textContent = formatCurrency(summary.total_budget) + ' budget';
}

function getStatusColor(status) {
    switch (status) {
        case 'on_track': return '#10b981';
        case 'warning': return '#f59e0b';
        case 'over_budget': return '#ef4444';
        default: return '#6366f1';
    }
}

function openAddBudgetModal() {
    currentBudgetEditId = null;
    budgetsState.currentBudgetEditId = null;
    document.getElementById('budget-modal-title').textContent = 'Add Budget';
    document.getElementById('budget-id').value = '';
    document.getElementById('budget-amount').value = '';
    document.getElementById('budget-period').value = 'monthly';
    document.getElementById('budget-delete-btn').style.display = 'none';
    document.getElementById('budget-category').disabled = false;

    // Populate category dropdown with unbudgeted categories
    populateBudgetCategories();

    document.getElementById('budget-modal').classList.add('active');
}

function editBudget(id, categoryId, amount) {
    currentBudgetEditId = id;
    budgetsState.currentBudgetEditId = id;
    document.getElementById('budget-modal-title').textContent = 'Edit Budget';
    document.getElementById('budget-id').value = id;
    document.getElementById('budget-amount').value = amount;
    document.getElementById('budget-delete-btn').style.display = 'inline-block';

    // Populate categories and select the current one
    populateBudgetCategories(categoryId);
    document.getElementById('budget-category').value = categoryId;
    document.getElementById('budget-category').disabled = true; // Can't change category when editing

    document.getElementById('budget-modal').classList.add('active');
}

function closeBudgetModal() {
    document.getElementById('budget-modal').classList.remove('active');
    currentBudgetEditId = null;
    budgetsState.currentBudgetEditId = null;
}

function populateBudgetCategories(currentCategoryId = null) {
    const select = document.getElementById('budget-category');
    select.innerHTML = '<option value="">Select a category...</option>';

    // If editing, add current category
    const budgetData = budgetsState.budgetsData;
    if (currentCategoryId && budgetData) {
        const currentBudget = budgetData.budgets.find(b => b.category_id == currentCategoryId);
        if (currentBudget) {
            const icon = currentBudget.category_icon && currentBudget.category_icon.trim() ? currentBudget.category_icon : '📁';
            select.innerHTML += `<option value="${currentBudget.category_id}">${icon} ${currentBudget.category_name}</option>`;
        }
        return; // When editing, only show current category
    }

    // Add unbudgeted categories - organized hierarchically
    if (budgetData && budgetData.unbudgeted_categories) {
        const categories = budgetData.unbudgeted_categories;

        // Separate parents and children
        const parents = categories.filter(c => !c.parent_id);
        const children = categories.filter(c => c.parent_id);

        // Group children by parent
        const childrenByParent = {};
        children.forEach(child => {
            if (!childrenByParent[child.parent_id]) {
                childrenByParent[child.parent_id] = [];
            }
            childrenByParent[child.parent_id].push(child);
        });

        // Sort parents by sort_order
        parents.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        // Build hierarchical options
        parents.forEach(parent => {
            const icon = parent.icon && parent.icon.trim() ? parent.icon : '📁';
            select.innerHTML += `<option value="${parent.id}">${icon} ${parent.name}</option>`;

            // Add children under this parent
            const kids = childrenByParent[parent.id] || [];
            kids.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            kids.forEach(child => {
                const childIcon = child.icon && child.icon.trim() ? child.icon : '📁';
                select.innerHTML += `<option value="${child.id}">&nbsp;&nbsp;&nbsp;&nbsp;${childIcon} ${child.name}</option>`;
            });
        });

        // Add orphan children (parent might have budget already set)
        children.forEach(child => {
            if (!parents.find(p => p.id === child.parent_id)) {
                const icon = child.icon && child.icon.trim() ? child.icon : '📁';
                const parentLabel = child.parent_name ? `[${child.parent_name}] ` : '';
                select.innerHTML += `<option value="${child.id}">${icon} ${parentLabel}${child.name}</option>`;
            }
        });

        // Initialize custom dropdown with unbudgeted categories
        if (typeof initCustomCategoryDropdown === 'function' && !currentCategoryId) {
            // Map unbudgeted_categories to the format expected by custom dropdown
            const dropdownCategories = categories.map(c => ({
                id: c.id,
                name: c.name,
                parent_id: c.parent_id,
                category_type: c.category_type || 'expense',
                sort_order: c.sort_order || 0
            }));
            initCustomCategoryDropdown('budget-category', dropdownCategories, 'Select a category...');
        }
    }
}

async function saveBudget(event) {
    event.preventDefault();

    const categoryId = document.getElementById('budget-category').value;
    const amount = parseFloat(document.getElementById('budget-amount').value);
    const periodType = document.getElementById('budget-period').value;

    if (!categoryId) {
        showToast('Please select a category', 'error');
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    try {
        const result = await apiPost('/budgets/', {
            user_id: state.currentUser,
            category_id: parseInt(categoryId),
            amount: amount,
            period_type: periodType
        });

        if (result.success) {
            showToast(result.message || 'Budget saved successfully', 'success');
            closeBudgetModal();
            await loadBudgets();
        } else {
            showToast(result.message || 'Failed to save budget', 'error');
        }
    } catch (error) {
        console.error('Error saving budget:', error);
        showToast('Error saving budget', 'error');
    }
}

async function deleteBudget() {
    if (!currentBudgetEditId) return;

    if (!confirm('Are you sure you want to delete this budget?')) {
        return;
    }

    try {
        const result = await apiDelete(`/budgets/?id=${currentBudgetEditId}`);

        if (result.success) {
            showToast('Budget deleted', 'success');
            closeBudgetModal();
            await loadBudgets();
        } else {
            showToast(result.message || 'Failed to delete budget', 'error');
        }
    } catch (error) {
        console.error('Error deleting budget:', error);
        showToast('Error deleting budget', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadBudgetsPage = loadBudgetsPage;
window.loadBudgets = loadBudgets;
window.openAddBudgetModal = openAddBudgetModal;
window.editBudget = editBudget;
window.closeBudgetModal = closeBudgetModal;
window.saveBudget = saveBudget;
window.deleteBudget = deleteBudget;