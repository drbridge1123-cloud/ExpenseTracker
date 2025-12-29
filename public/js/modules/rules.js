// =====================================================
// Rules Module
// =====================================================
// Dependencies: state, apiGet, apiPost, apiRequest, showToast, openModal, closeModal,
//               buildHierarchicalCategoryOptions, buildHierarchicalCategoryOptionsWithSelected, getCategoryIcon

// State
if (!window._rulesState) {
    window._rulesState = {
        search: '',
        categoryFilter: '',
        typeFilter: '',
        statusFilter: ''
    };
}
const rulesState = window._rulesState;

// =====================================================
// Main Functions
// =====================================================

async function loadRules() {
    // Load categories if not available (needed for category filter and icons)
    if (!state.categories || state.categories.length === 0) {
        const catData = await apiGet('/categories/', {
            user_id: state.currentUser,
            include_stats: '1'
        });
        if (catData.success) {
            state.categories = catData.data.categories;
        }
    }

    const data = await apiGet('/rules/', {
        user_id: state.currentUser
    });

    if (data.success) {
        state.rules = data.data.rules;
        renderGroupedRules();
        updateRulesStats();
        populateCategoryFilter();
    }

    setupRulesEventListeners();
}

function setupRulesEventListeners() {
    // Add Rule button
    document.getElementById('add-rule-btn').onclick = () => showAddRuleModal();

    // Search
    const searchInput = document.getElementById('rules-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            rulesState.search = e.target.value.toLowerCase();
            renderGroupedRules();
        };
    }

    // Category filter
    const categoryFilter = document.getElementById('rules-category-filter');
    if (categoryFilter) {
        categoryFilter.onchange = (e) => {
            rulesState.categoryFilter = e.target.value;
            renderGroupedRules();
        };
    }

    // Type filter
    const typeFilter = document.getElementById('rules-type-filter');
    if (typeFilter) {
        typeFilter.onchange = (e) => {
            rulesState.typeFilter = e.target.value;
            renderGroupedRules();
        };
    }

    // Status filter
    const statusFilter = document.getElementById('rules-status-filter');
    if (statusFilter) {
        statusFilter.onchange = (e) => {
            rulesState.statusFilter = e.target.value;
            renderGroupedRules();
        };
    }

    // Expand/Collapse All
    document.getElementById('rules-expand-all')?.addEventListener('click', () => {
        document.querySelectorAll('.rules-category-group').forEach(g => g.classList.add('expanded'));
    });

    document.getElementById('rules-collapse-all')?.addEventListener('click', () => {
        document.querySelectorAll('.rules-category-group').forEach(g => g.classList.remove('expanded'));
    });
}

function populateCategoryFilter() {
    const filter = document.getElementById('rules-category-filter');
    if (!filter) return;

    // Get unique categories from rules
    const categoryMap = new Map();
    state.rules.forEach(rule => {
        if (!categoryMap.has(rule.category_id)) {
            categoryMap.set(rule.category_id, {
                id: rule.category_id,
                name: rule.category_name,
                type: rule.category_type
            });
        }
    });

    const ruleCategories = Array.from(categoryMap.values());
    const ruleCategoryIds = new Set(ruleCategories.map(c => c.id));

    // Filter state.categories to only include those used in rules
    const filteredCategories = state.categories.filter(c => ruleCategoryIds.has(c.id));

    // Build hierarchical options using the same structure
    const parentCategories = filteredCategories.filter(c => !c.parent_id || c.parent_id == 0);
    const childCategories = filteredCategories.filter(c => c.parent_id && c.parent_id != 0);

    // Group by type
    const expenseParents = parentCategories.filter(c => c.category_type === 'expense');
    const incomeParents = parentCategories.filter(c => c.category_type === 'income');

    let html = '<option value="">All Categories</option>';

    if (expenseParents.length > 0 || childCategories.some(c => state.categories.find(p => p.id == c.parent_id)?.category_type === 'expense')) {
        html += '<optgroup label="── Expenses ──">';
        expenseParents.sort((a, b) => a.name.localeCompare(b.name)).forEach(parent => {
            html += `<option value="${parent.id}" style="color: #2563eb; font-weight: bold;">${parent.name}</option>`;
            const children = childCategories.filter(c => c.parent_id == parent.id).sort((a, b) => a.name.localeCompare(b.name));
            children.forEach(child => {
                html += `<option value="${child.id}">&nbsp;&nbsp;&nbsp;↳ ${child.name}</option>`;
            });
        });
        html += '</optgroup>';
    }

    if (incomeParents.length > 0 || childCategories.some(c => state.categories.find(p => p.id == c.parent_id)?.category_type === 'income')) {
        html += '<optgroup label="── Income ──">';
        incomeParents.sort((a, b) => a.name.localeCompare(b.name)).forEach(parent => {
            html += `<option value="${parent.id}" style="color: #2563eb; font-weight: bold;">${parent.name}</option>`;
            const children = childCategories.filter(c => c.parent_id == parent.id).sort((a, b) => a.name.localeCompare(b.name));
            children.forEach(child => {
                html += `<option value="${child.id}">&nbsp;&nbsp;&nbsp;↳ ${child.name}</option>`;
            });
        });
        html += '</optgroup>';
    }

    filter.innerHTML = html;
}

function updateRulesStats() {
    const total = state.rules.length;
    const active = state.rules.filter(r => r.hit_count > 0).length;
    const unused = state.rules.filter(r => r.hit_count === 0).length;
    const totalHits = state.rules.reduce((sum, r) => sum + (parseInt(r.hit_count) || 0), 0);

    document.getElementById('rules-total').textContent = total;
    document.getElementById('rules-active').textContent = active;
    document.getElementById('rules-unused').textContent = unused;
    document.getElementById('rules-total-hits').textContent = totalHits.toLocaleString();
}

function getFilteredRules() {
    return state.rules.filter(rule => {
        // Search filter
        if (rulesState.search) {
            const searchMatch =
                (rule.rule_name || '').toLowerCase().includes(rulesState.search) ||
                (rule.match_value || '').toLowerCase().includes(rulesState.search) ||
                (rule.category_name || '').toLowerCase().includes(rulesState.search);
            if (!searchMatch) return false;
        }

        // Category filter
        if (rulesState.categoryFilter && rule.category_id != rulesState.categoryFilter) {
            return false;
        }

        // Type filter
        if (rulesState.typeFilter && rule.category_type !== rulesState.typeFilter) {
            return false;
        }

        // Status filter
        if (rulesState.statusFilter === 'active' && rule.hit_count === 0) {
            return false;
        }
        if (rulesState.statusFilter === 'unused' && rule.hit_count > 0) {
            return false;
        }

        return true;
    });
}

function renderGroupedRules() {
    const container = document.getElementById('rules-content');
    if (!container) return;

    const filteredRules = getFilteredRules();

    if (filteredRules.length === 0) {
        if (state.rules.length === 0) {
            container.innerHTML = `
                <div class="rules-empty">
                    <div class="rules-empty-icon">📋</div>
                    <div class="rules-empty-text">No categorization rules yet</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="rules-no-results">
                    No rules match your filters
                </div>
            `;
        }
        return;
    }

    // Group rules by category
    const grouped = {};
    filteredRules.forEach(rule => {
        const catId = rule.category_id;
        if (!grouped[catId]) {
            grouped[catId] = {
                id: catId,
                name: rule.category_name,
                type: rule.category_type,
                color: rule.category_color,
                icon: rule.category_icon,
                rules: [],
                totalHits: 0
            };
        }
        grouped[catId].rules.push(rule);
        grouped[catId].totalHits += parseInt(rule.hit_count) || 0;
    });

    // Sort groups by category name
    const sortedGroups = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    // Render groups
    container.innerHTML = sortedGroups.map(group => {
        const icon = getCategoryIcon(group.icon);
        const rulesHtml = group.rules.map(rule => {
            const isUnused = rule.hit_count === 0;
            return `
                <div class="rule-item ${isUnused ? 'unused' : ''}">
                    <div class="rule-name">${rule.rule_name || rule.match_value}</div>
                    <div>
                        <code class="rule-match">${rule.match_field}: ${rule.match_type} "${rule.match_value}"</code>
                    </div>
                    <div class="rule-priority">${rule.priority}</div>
                    <div class="rule-hits ${isUnused ? 'unused' : 'active'}">${rule.hit_count}</div>
                    <div class="rule-actions">
                        <button class="rule-edit-btn" onclick="editRule(${rule.id})">Edit</button>
                        <button class="rule-delete-btn" onclick="deleteRule(${rule.id})">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="rules-category-group" data-category="${group.id}">
                <div class="rules-category-header" onclick="toggleRulesGroup(this)">
                    <div class="rules-category-toggle">▼</div>
                    <div class="rules-category-info">
                        <span class="rules-category-icon">${icon}</span>
                        <span class="rules-category-name">${group.name}</span>
                        <span class="rules-category-type ${group.type}">${group.type}</span>
                    </div>
                    <div class="rules-category-count">${group.rules.length} rule${group.rules.length !== 1 ? 's' : ''}</div>
                    <div class="rules-category-hits">${group.totalHits.toLocaleString()} hits</div>
                </div>
                <div class="rules-list">
                    <div class="rules-list-header">
                        <div>Rule Name</div>
                        <div>Match Pattern</div>
                        <div>Priority</div>
                        <div>Hits</div>
                        <div>Actions</div>
                    </div>
                    ${rulesHtml}
                </div>
            </div>
        `;
    }).join('');
}

function toggleRulesGroup(header) {
    const group = header.closest('.rules-category-group');
    group.classList.toggle('expanded');
}

function showAddRuleModal() {
    openModal('Add Categorization Rule', `
        <form id="add-rule-form">
            <div class="form-group">
                <label>Rule Name (optional)</label>
                <input type="text" class="form-input" name="rule_name">
            </div>
            <div class="form-group">
                <label>Match Field</label>
                <select class="form-select" name="match_field">
                    <option value="description">Description</option>
                    <option value="vendor">Vendor</option>
                    <option value="memo">Memo</option>
                    <option value="any">Any Field</option>
                </select>
            </div>
            <div class="form-group">
                <label>Match Type</label>
                <select class="form-select" name="match_type">
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts With</option>
                    <option value="ends_with">Ends With</option>
                    <option value="exact">Exact Match</option>
                </select>
            </div>
            <div class="form-group">
                <label>Match Value</label>
                <input type="text" class="form-input" name="match_value" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select class="form-select" name="category_id" id="rule-category-select" required>
                    ${buildHierarchicalCategoryOptions(false)}
                </select>
            </div>
            <div class="form-group">
                <label>Priority (lower = higher priority)</label>
                <input type="number" class="form-input" name="priority" value="100">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Create Rule</button>
        </form>
    `);

    // Initialize custom category dropdown
    setTimeout(() => {
        if (typeof initCustomCategoryDropdown === 'function' && state.categories) {
            initCustomCategoryDropdown('rule-category-select', state.categories, 'Select category');
        }
    }, 50);

    document.getElementById('add-rule-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const result = await apiPost('/rules/', {
            user_id: state.currentUser,
            rule_name: formData.get('rule_name'),
            match_field: formData.get('match_field'),
            match_type: formData.get('match_type'),
            match_value: formData.get('match_value'),
            category_id: parseInt(formData.get('category_id')),
            priority: parseInt(formData.get('priority'))
        });

        if (result.success) {
            showToast('Rule created successfully', 'success');
            closeModal();
            await loadRules();
        } else {
            showToast(result.message || 'Error creating rule', 'error');
        }
    };
}

function editRule(id) {
    const rule = state.rules.find(r => r.id == id);
    if (!rule) {
        showToast('Rule not found', 'error');
        return;
    }

    openModal('Edit Categorization Rule', `
        <form id="edit-rule-form">
            <input type="hidden" name="id" value="${rule.id}">
            <div class="form-group">
                <label>Rule Name (optional)</label>
                <input type="text" class="form-input" name="rule_name" value="${rule.rule_name || ''}">
            </div>
            <div class="form-group">
                <label>Match Field</label>
                <select class="form-select" name="match_field">
                    <option value="description" ${rule.match_field === 'description' ? 'selected' : ''}>Description</option>
                    <option value="vendor" ${rule.match_field === 'vendor' ? 'selected' : ''}>Vendor</option>
                    <option value="memo" ${rule.match_field === 'memo' ? 'selected' : ''}>Memo</option>
                    <option value="any" ${rule.match_field === 'any' ? 'selected' : ''}>Any Field</option>
                </select>
            </div>
            <div class="form-group">
                <label>Match Type</label>
                <select class="form-select" name="match_type">
                    <option value="contains" ${rule.match_type === 'contains' ? 'selected' : ''}>Contains</option>
                    <option value="starts_with" ${rule.match_type === 'starts_with' ? 'selected' : ''}>Starts With</option>
                    <option value="ends_with" ${rule.match_type === 'ends_with' ? 'selected' : ''}>Ends With</option>
                    <option value="exact" ${rule.match_type === 'exact' ? 'selected' : ''}>Exact Match</option>
                </select>
            </div>
            <div class="form-group">
                <label>Match Value</label>
                <input type="text" class="form-input" name="match_value" value="${rule.match_value || ''}" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select class="form-select" name="category_id" id="rule-category-select-edit" required>
                    ${buildHierarchicalCategoryOptionsWithSelected(rule.category_id)}
                </select>
            </div>
            <div class="form-group">
                <label>Priority (lower = higher priority)</label>
                <input type="number" class="form-input" name="priority" value="${rule.priority || 100}">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Update Rule</button>
        </form>
    `);

    // Initialize custom category dropdown with current selection
    setTimeout(() => {
        if (typeof initCustomCategoryDropdown === 'function' && state.categories) {
            initCustomCategoryDropdown('rule-category-select-edit', state.categories, 'Select category');
            // Set current value
            const category = state.categories.find(c => c.id == rule.category_id);
            if (category && typeof setCustomDropdownValue === 'function') {
                setCustomDropdownValue('rule-category-select-edit', rule.category_id, category.name);
            }
        }
    }, 50);

    document.getElementById('edit-rule-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const result = await apiRequest('/rules/', 'PUT', {
            id: parseInt(formData.get('id')),
            rule_name: formData.get('rule_name'),
            match_field: formData.get('match_field'),
            match_type: formData.get('match_type'),
            match_value: formData.get('match_value'),
            category_id: parseInt(formData.get('category_id')),
            priority: parseInt(formData.get('priority'))
        });

        if (result.success) {
            showToast('Rule updated successfully', 'success');
            closeModal();
            await loadRules();
        } else {
            showToast(result.message || 'Error updating rule', 'error');
        }
    };
}

async function deleteRule(id) {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    const result = await apiRequest('/rules/', 'DELETE', { id });

    if (result.success) {
        showToast('Rule deleted', 'success');
        await loadRules();
    } else {
        showToast('Error deleting rule', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadRules = loadRules;
window.toggleRulesGroup = toggleRulesGroup;
window.showAddRuleModal = showAddRuleModal;
window.editRule = editRule;
window.deleteRule = deleteRule;
