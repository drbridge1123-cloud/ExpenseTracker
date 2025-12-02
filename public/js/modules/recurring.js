// =====================================================
// Recurring Transactions Module
// =====================================================
// Dependencies: state, apiGet, apiPost, apiDelete, formatCurrency, formatDate, showToast, buildHierarchicalCategoryOptions

// State
if (!window._recurringState) {
    window._recurringState = {
        recurringData: null
    };
}
const recurringState = window._recurringState;

let recurringData = recurringState.recurringData;

// =====================================================
// Main Functions
// =====================================================

async function loadRecurringPage() {
    await loadRecurring();
}

async function loadRecurring() {
    try {
        const result = await apiGet('/recurring/', { user_id: state.currentUser });
        if (result.success) {
            recurringData = result.data;
            recurringState.recurringData = recurringData;
            renderRecurring();
            updateRecurringSummary();
        }
    } catch (error) {
        console.error('Error loading recurring:', error);
    }
}

function renderRecurring() {
    const container = document.getElementById('recurring-list');
    if (!container || !recurringData) return;

    const items = recurringData.recurring || [];

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔄</div>
                <p>No recurring transactions yet. Add subscriptions, rent, bills, etc.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const daysUntil = item.days_until;
        let nextText = '', nextClass = '';

        if (daysUntil === 0) { nextText = 'Due today'; nextClass = 'soon'; }
        else if (daysUntil === 1) { nextText = 'Due tomorrow'; nextClass = 'soon'; }
        else if (daysUntil <= 7) { nextText = `Due in ${daysUntil} days`; nextClass = 'soon'; }
        else if (item.next_occurrence) { nextText = `Next: ${formatDate(item.next_occurrence)}`; }

        return `
            <div class="recurring-card ${item.is_active ? '' : 'inactive'}" onclick="editRecurring(${item.id})">
                <div class="recurring-icon" style="background: ${item.category_color || '#6366f1'}20; color: ${item.category_color || '#6366f1'}">
                    ${item.category_icon || '🔄'}
                </div>
                <div class="recurring-info">
                    <h3>${item.description}</h3>
                    <div class="recurring-meta">
                        <span class="frequency-badge">${item.frequency}</span>
                        <span>${item.account_name || 'No account'}</span>
                        <span>${item.category_name || 'Uncategorized'}</span>
                    </div>
                </div>
                <div class="recurring-actions">
                    <div class="recurring-amount ${item.transaction_type}">
                        ${item.transaction_type === 'debit' ? '-' : '+'}${formatCurrency(item.amount)}
                    </div>
                    <div class="recurring-next ${nextClass}">${nextText}</div>
                    <button class="btn-delete-recurring" onclick="event.stopPropagation(); deleteRecurring(${item.id}, '${item.description}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateRecurringSummary() {
    if (!recurringData) return;
    const { summary } = recurringData;

    const totalActive = document.getElementById('recurring-total-active');
    const dueThisMonth = document.getElementById('recurring-due-this-month');
    const monthlyTotal = document.getElementById('recurring-monthly-total');

    if (totalActive) totalActive.textContent = summary.total_active;
    if (dueThisMonth) dueThisMonth.textContent = summary.upcoming_this_month;
    if (monthlyTotal) monthlyTotal.textContent = formatCurrency(summary.total_monthly_expenses);
}

async function openRecurringModal(id = null) {
    // Load accounts and categories for the selects
    await loadRecurringFormData();

    // Reset form
    document.getElementById('recurring-form').reset();
    document.getElementById('recurring-id').value = '';
    document.getElementById('recurring-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('recurring-modal-title').textContent = 'Add Recurring Transaction';
    updateDayOfMonthVisibility();

    // Hide delete button by default
    const deleteBtn = document.getElementById('recurring-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    if (id) {
        // Edit mode - load existing data
        await loadRecurringForEdit(id);
        document.getElementById('recurring-modal-title').textContent = 'Edit Recurring Transaction';
        // Show delete button in edit mode
        if (deleteBtn) deleteBtn.style.display = 'block';
    }

    document.getElementById('recurring-modal').classList.add('active');
}

function closeRecurringModal() {
    document.getElementById('recurring-modal').classList.remove('active');
}

async function loadRecurringFormData() {
    try {
        const [accountsResult, categoriesResult] = await Promise.all([
            apiGet('/accounts/', { user_id: state.currentUser }),
            apiGet('/categories/', { user_id: state.currentUser })
        ]);

        // Populate accounts
        const accountSelect = document.getElementById('recurring-account');
        if (accountSelect && accountsResult.success) {
            const accounts = accountsResult.data.accounts || [];
            accountSelect.innerHTML = '<option value="">Select account</option>' +
                accounts.map(a => `<option value="${a.id}">${a.account_name}</option>`).join('');
        }

        // Populate categories with hierarchical structure
        const categorySelect = document.getElementById('recurring-category');
        if (categorySelect && categoriesResult.success) {
            state.categories = categoriesResult.data.categories || [];
            categorySelect.innerHTML = '<option value="">Select category</option>' +
                buildHierarchicalCategoryOptions(false);
        }
    } catch (error) {
        console.error('Error loading recurring form data:', error);
    }
}

async function loadRecurringForEdit(id) {
    try {
        const result = await apiGet('/recurring/', { user_id: state.currentUser });
        if (result.success) {
            const recurring = result.data.recurring.find(r => r.id == id);
            if (recurring) {
                document.getElementById('recurring-id').value = recurring.id;
                document.getElementById('recurring-description').value = recurring.description || '';
                document.getElementById('recurring-amount').value = recurring.amount;
                document.getElementById('recurring-type').value = recurring.transaction_type || 'debit';
                document.getElementById('recurring-account').value = recurring.account_id || '';
                document.getElementById('recurring-category').value = recurring.category_id || '';
                document.getElementById('recurring-frequency').value = recurring.frequency || 'monthly';
                document.getElementById('recurring-day').value = recurring.day_of_month || '';
                document.getElementById('recurring-start').value = recurring.start_date || '';
                document.getElementById('recurring-end').value = recurring.end_date || '';
                document.getElementById('recurring-auto-create').checked = recurring.auto_create == 1;
                updateDayOfMonthVisibility();
            }
        }
    } catch (error) {
        console.error('Error loading recurring for edit:', error);
        showToast('Error loading recurring transaction', 'error');
    }
}

function updateDayOfMonthVisibility() {
    const frequency = document.getElementById('recurring-frequency').value;
    const dayGroup = document.getElementById('day-of-month-group');
    if (dayGroup) {
        // Show day of month only for monthly, quarterly, yearly
        dayGroup.style.display = ['monthly', 'quarterly', 'yearly'].includes(frequency) ? 'block' : 'none';
    }
}

async function saveRecurring(event) {
    event.preventDefault();

    const id = document.getElementById('recurring-id').value;
    const data = {
        user_id: state.currentUser,
        description: document.getElementById('recurring-description').value.trim(),
        amount: parseFloat(document.getElementById('recurring-amount').value),
        transaction_type: document.getElementById('recurring-type').value,
        account_id: document.getElementById('recurring-account').value,
        category_id: document.getElementById('recurring-category').value || null,
        frequency: document.getElementById('recurring-frequency').value,
        day_of_month: document.getElementById('recurring-day').value || null,
        start_date: document.getElementById('recurring-start').value,
        end_date: document.getElementById('recurring-end').value || null,
        auto_create: document.getElementById('recurring-auto-create').checked ? 1 : 0
    };

    if (id) {
        data.id = id;
    }

    try {
        const result = await apiPost('/recurring/', data);
        if (result.success) {
            showToast(id ? 'Recurring transaction updated' : 'Recurring transaction created', 'success');
            closeRecurringModal();
            await loadRecurring();
        } else {
            showToast(result.message || 'Error saving recurring transaction', 'error');
        }
    } catch (error) {
        console.error('Error saving recurring:', error);
        showToast('Error saving recurring transaction', 'error');
    }
}

async function editRecurring(id) {
    await openRecurringModal(id);
}

async function deleteRecurring(id) {
    if (!confirm('Are you sure you want to delete this recurring transaction?')) {
        return;
    }

    try {
        const result = await apiDelete(`/recurring/?id=${id}`);
        if (result.success) {
            showToast('Recurring transaction deleted', 'success');
            await loadRecurring();
        } else {
            showToast(result.message || 'Error deleting recurring transaction', 'error');
        }
    } catch (error) {
        console.error('Error deleting recurring:', error);
        showToast('Error deleting recurring transaction', 'error');
    }
}

async function deleteRecurringFromModal() {
    const id = document.getElementById('recurring-id').value;
    if (!id) return;

    if (confirm('Are you sure you want to delete this recurring transaction?')) {
        await deleteRecurring(id);
        closeRecurringModal();
    }
}

async function toggleRecurringActive(id, isActive) {
    try {
        const result = await apiGet('/recurring/', { user_id: state.currentUser });
        if (result.success) {
            const recurring = result.data.recurring.find(r => r.id == id);
            if (recurring) {
                const updateData = {
                    ...recurring,
                    user_id: state.currentUser,
                    is_active: isActive ? 1 : 0
                };

                const updateResult = await apiPost('/recurring/', updateData);
                if (updateResult.success) {
                    showToast(isActive ? 'Recurring activated' : 'Recurring paused', 'success');
                    await loadRecurring();
                }
            }
        }
    } catch (error) {
        console.error('Error toggling recurring:', error);
        showToast('Error updating recurring transaction', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadRecurringPage = loadRecurringPage;
window.loadRecurring = loadRecurring;
window.openRecurringModal = openRecurringModal;
window.closeRecurringModal = closeRecurringModal;
window.saveRecurring = saveRecurring;
window.editRecurring = editRecurring;
window.deleteRecurring = deleteRecurring;
window.deleteRecurringFromModal = deleteRecurringFromModal;
window.toggleRecurringActive = toggleRecurringActive;
window.updateDayOfMonthVisibility = updateDayOfMonthVisibility;
