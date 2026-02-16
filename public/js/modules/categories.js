// =====================================================
// Categories Module (Chart of Accounts)
// Extracted from app.js for better code organization
// =====================================================

// Dependencies: This module requires the following globals from app.js:
// - state (global state object)
// - API_BASE (API base URL)
// - apiGet, apiPost, apiDelete, apiRequest (API functions)
// - formatCurrency, formatDate (utility functions)
// - showToast, showLoading, hideLoading (UI functions)
// - openModal, closeModal (modal functions)
// - buildHierarchicalCategoryOptions, buildHierarchicalCategoryOptionsWithSelected

// State for Chart of Accounts
// Use window object to avoid duplicate declaration with app.js
if (!window._coaState) {
    window._coaState = {
        searchTerm: '',
        typeFilter: '',
        expandedCategories: new Set()
    };
}
const coaState = window._coaState;

// Track selected category in 2-panel layout
// Using getter/setter for selectedCategoryId
let selectedCategoryId = null;

// Drag and drop state
let draggedCategoryId = null;

// Detail panel state for search/sort
if (!window._detailPanelState) {
    window._detailPanelState = {
        categoryId: null,
        transactions: [],
        searchQuery: '',
        sortBy: 'date',
        sortOrder: 'desc',
        selectedIds: new Set()
    };
}
const detailPanelState = window._detailPanelState;

// Track last clicked checkbox for shift-select
let lastClickedTxnIndex = null;

// State for category detail modal sorting/filtering
if (!window._categoryDetailState) {
    window._categoryDetailState = {
        transactions: [],
        sortBy: 'date',
        sortOrder: 'desc',
        searchQuery: '',
        categoryId: null,
        categoryName: '',
        icon: '',
        canDelete: false,
        isUncategorized: false
    };
}
const categoryDetailState = window._categoryDetailState;

// Search debounce timer
let searchDebounceTimer = null;
let detailSearchTimer = null;

// =====================================================
// Helper Functions
// =====================================================

// Build hierarchical category options for select dropdowns
function buildHierarchicalCategoryOptions(includeUncategorized = true, typeFilter = null) {
    // Filter by type if specified
    let filteredCategories = state.categories;
    if (typeFilter) {
        filteredCategories = state.categories.filter(c => c.category_type === typeFilter);
    }

    // Separate parents and children
    const parentCategories = filteredCategories.filter(c => !c.parent_id || c.parent_id == 0);
    const childCategories = filteredCategories.filter(c => c.parent_id && c.parent_id != 0);

    // Group children by parent
    const childrenByParent = {};
    childCategories.forEach(child => {
        const parentKey = String(child.parent_id);
        if (!childrenByParent[parentKey]) {
            childrenByParent[parentKey] = [];
        }
        childrenByParent[parentKey].push(child);
    });

    // Sort parents by type (expense first) then sort_order
    parentCategories.sort((a, b) => {
        if (a.category_type !== b.category_type) {
            return a.category_type === 'expense' ? -1 : 1;
        }
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    let options = '';
    let currentType = null;

    parentCategories.forEach(parent => {
        // Add optgroup for type change
        if (parent.category_type !== currentType) {
            if (currentType !== null) {
                options += '</optgroup>';
            }
            const typeLabel = parent.category_type === 'expense' ? '📤 Expenses' : '📥 Income';
            options += `<optgroup label="${typeLabel}">`;
            currentType = parent.category_type;
        }

        const children = childrenByParent[String(parent.id)] || [];

        // Skip uncategorized if requested
        if (!includeUncategorized && parent.slug === 'uncategorized') {
            return;
        }

        // Parent option (blue color, bold)
        options += `<option value="${parent.id}" style="color: #2563eb; font-weight: bold;">${parent.name}</option>`;

        // Child options with indent - sort by sort_order
        children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        children.forEach(child => {
            options += `<option value="${child.id}" style="color: #6b7280;">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${child.name}</option>`;
        });
    });

    if (currentType !== null) {
        options += '</optgroup>';
    }

    return options;
}

// Build hierarchical category options with a selected value
function buildHierarchicalCategoryOptionsWithSelected(selectedId, includeUncategorized = true, typeFilter = null) {
    let filteredCategories = state.categories;
    if (typeFilter) {
        filteredCategories = state.categories.filter(c => c.category_type === typeFilter);
    }

    const parentCategories = filteredCategories.filter(c => !c.parent_id || c.parent_id == 0);
    const childCategories = filteredCategories.filter(c => c.parent_id && c.parent_id != 0);

    const childrenByParent = {};
    childCategories.forEach(child => {
        const parentKey = String(child.parent_id);
        if (!childrenByParent[parentKey]) {
            childrenByParent[parentKey] = [];
        }
        childrenByParent[parentKey].push(child);
    });

    parentCategories.sort((a, b) => {
        if (a.category_type !== b.category_type) {
            return a.category_type === 'expense' ? -1 : 1;
        }
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    let options = '';
    let currentType = null;

    parentCategories.forEach(parent => {
        if (parent.category_type !== currentType) {
            if (currentType !== null) {
                options += '</optgroup>';
            }
            const typeLabel = parent.category_type === 'expense' ? '📤 Expenses' : '📥 Income';
            options += `<optgroup label="${typeLabel}">`;
            currentType = parent.category_type;
        }

        const children = childrenByParent[String(parent.id)] || [];

        if (!includeUncategorized && parent.slug === 'uncategorized') {
            return;
        }

        const isParentSelected = parent.id === selectedId || parent.id == selectedId;
        options += `<option value="${parent.id}" ${isParentSelected ? 'selected' : ''} style="color: #2563eb; font-weight: bold;">${parent.name}</option>`;

        children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        children.forEach(child => {
            const isChildSelected = child.id === selectedId || child.id == selectedId;
            options += `<option value="${child.id}" ${isChildSelected ? 'selected' : ''} style="color: #6b7280;">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${child.name}</option>`;
        });
    });

    if (currentType !== null) {
        options += '</optgroup>';
    }

    return options;
}

// Expose globally
window.buildHierarchicalCategoryOptions = buildHierarchicalCategoryOptions;
window.buildHierarchicalCategoryOptionsWithSelected = buildHierarchicalCategoryOptionsWithSelected;

// =====================================================
// Main Functions
// =====================================================

// Cache to prevent redundant API calls
let categoriesCache = {
    data: null,
    timestamp: 0,
    userId: null
};
const CACHE_TTL = 30000; // 30 seconds

async function loadCategories(forceRefresh = false) {
    const userId = state.currentUser;
    const now = Date.now();

    // Use cache if valid and not forcing refresh
    if (!forceRefresh &&
        categoriesCache.data &&
        categoriesCache.userId === userId &&
        (now - categoriesCache.timestamp) < CACHE_TTL) {
        state.categories = categoriesCache.data;
        renderChartOfAccounts();
        setupCoaEventListeners();
        return;
    }

    const data = await apiGet('/categories/', {
        user_id: userId,
        include_stats: '1',
        include_accounts: '1'  // Include bank accounts under Assets for Chart of Accounts view
    });

    if (data.success) {
        state.categories = data.data.categories;
        // Update cache
        categoriesCache = {
            data: data.data.categories,
            timestamp: now,
            userId: userId
        };
        renderChartOfAccounts();
    }

    // Setup event listeners
    setupCoaEventListeners();
}

// Invalidate cache when data changes
function invalidateCategoriesCache() {
    categoriesCache.timestamp = 0;
}

function setupCoaEventListeners() {
    // Add Category button
    const addBtn = document.getElementById('add-category-btn');
    if (addBtn) {
        addBtn.onclick = () => showAddCategoryModal();
    }

    // Search
    const searchInput = document.getElementById('coa-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            coaState.searchTerm = e.target.value.toLowerCase();
            renderChartOfAccounts();
        };
    }

    // Type filter
    const typeFilter = document.getElementById('coa-type-filter');
    if (typeFilter) {
        typeFilter.onchange = (e) => {
            coaState.typeFilter = e.target.value;
            renderChartOfAccounts();
        };
    }

    // Expand/Collapse All
    const expandAllBtn = document.getElementById('coa-expand-all');
    if (expandAllBtn) {
        expandAllBtn.onclick = () => {
            state.categories.forEach(cat => {
                if (!cat.parent_id || cat.parent_id == 0) {
                    coaState.expandedCategories.add(String(cat.id));
                }
            });
            renderChartOfAccounts();
        };
    }

    const collapseAllBtn = document.getElementById('coa-collapse-all');
    if (collapseAllBtn) {
        collapseAllBtn.onclick = () => {
            coaState.expandedCategories.clear();
            renderChartOfAccounts();
        };
    }

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('coa-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.coa-row-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        };
    }

    // Close action menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.coa-action-btn') && !e.target.closest('.coa-action-menu')) {
            document.querySelectorAll('.coa-action-menu.show').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });

    // Zoom controls
    const zoomBtns = document.querySelectorAll('.coa-zoom-btn');
    const zoomWrapper = document.getElementById('coa-zoom-wrapper');
    if (zoomBtns.length && zoomWrapper) {
        zoomBtns.forEach(btn => {
            btn.onclick = () => {
                const zoomLevel = btn.getAttribute('data-zoom');

                // Update active state
                zoomBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Apply zoom
                zoomWrapper.classList.remove('zoom-50', 'zoom-75', 'zoom-100');
                zoomWrapper.classList.add(`zoom-${zoomLevel}`);
            };
        });
    }
}

// Expand/Collapse all categories
function expandAllCategories() {
    state.categories.forEach(cat => {
        if (!cat.parent_id || cat.parent_id == 0) {
            coaState.expandedCategories.add(String(cat.id));
        }
        // Also expand subcategories
        coaState.expandedCategories.add(String(cat.id));
    });
    renderChartOfAccounts();
}

function collapseAllCategories() {
    coaState.expandedCategories.clear();
    renderChartOfAccounts();
}

function renderChartOfAccounts() {
    const container = document.getElementById('coa-content');
    if (!container) return;

    // Check if we're in IOLTA mode - only show IOLTA account and its sub-accounts
    const isIoltaMode = typeof getAccountType === 'function' && getAccountType() === 'iolta';

    // In IOLTA mode, auto-expand IOLTA account
    if (isIoltaMode) {
        const ioltaAccount = state.categories.find(c => c.account_type === 'iolta');
        if (ioltaAccount) {
            coaState.expandedCategories.add(String(ioltaAccount.id));
        }
    }

    // First, filter by type only
    let typeFilteredCategories = state.categories.filter(cat => {
        // IOLTA mode: only show IOLTA account and trust sub-accounts (no Assets folder)
        if (isIoltaMode) {
            // Keep IOLTA account
            if (cat.account_type === 'iolta') return true;
            // Keep trust sub-accounts only
            if (cat.is_trust_sub_account) return true;
            // Hide everything else (Assets, Income, Housing, other bank accounts, etc.)
            return false;
        }

        // General/Cost mode: hide IOLTA account and trust sub-accounts
        if (cat.account_type === 'iolta') return false;
        if (cat.is_trust_sub_account) return false;

        if (coaState.typeFilter && cat.category_type !== coaState.typeFilter) {
            return false;
        }
        return true;
    });

    // If there's a search term, find matching categories and their parents
    let filteredCategories;
    if (coaState.searchTerm) {
        const matchingIds = new Set();
        const parentIdsToInclude = new Set();

        // Find all categories that match the search term
        typeFilteredCategories.forEach(cat => {
            if (cat.name.toLowerCase().includes(coaState.searchTerm)) {
                matchingIds.add(cat.id);
                // If this is a child, also include its parent (and grandparent)
                if (cat.parent_id && cat.parent_id != 0) {
                    parentIdsToInclude.add(cat.parent_id);
                    // Find grandparent
                    const parent = typeFilteredCategories.find(p => p.id === cat.parent_id || p.id == cat.parent_id);
                    if (parent && parent.parent_id) {
                        parentIdsToInclude.add(parent.parent_id);
                    }
                }
            }
        });

        // Include matching categories and parents of matching children
        filteredCategories = typeFilteredCategories.filter(cat => {
            return matchingIds.has(cat.id) || parentIdsToInclude.has(cat.id);
        });

        // Auto-expand parents that have matching children
        parentIdsToInclude.forEach(parentId => {
            coaState.expandedCategories.add(String(parentId));
        });
    } else {
        filteredCategories = typeFilteredCategories;
    }

    // Separate parents (no parent_id) and children (has parent_id)
    // In IOLTA mode, treat IOLTA account as top-level parent
    let parentCategories = filteredCategories.filter(c => {
        if (isIoltaMode) {
            // IOLTA account is the top-level parent
            return c.account_type === 'iolta';
        }
        return !c.parent_id || c.parent_id == 0;
    });
    const childCategories = filteredCategories.filter(c => {
        if (isIoltaMode) {
            // Trust sub-accounts are children of IOLTA
            return c.is_trust_sub_account;
        }
        return c.parent_id && c.parent_id != 0;
    });

    // Sort parent categories: Assets first (normal mode), then by category_type and sort_order
    parentCategories.sort((a, b) => {
        // Assets always first (in normal mode)
        if (a.slug === 'assets') return -1;
        if (b.slug === 'assets') return 1;
        // Then by category_type
        if (a.category_type !== b.category_type) {
            const typeOrder = { 'income': 1, 'expense': 2, 'transfer': 3, 'other': 4 };
            return (typeOrder[a.category_type] || 5) - (typeOrder[b.category_type] || 5);
        }
        // Then by sort_order
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    // Group children by parent (multi-level support)
    const childrenByParent = {};
    childCategories.forEach(child => {
        const parentKey = String(child.parent_id);
        if (!childrenByParent[parentKey]) {
            childrenByParent[parentKey] = [];
        }
        childrenByParent[parentKey].push(child);
    });

    // Helper function to render sub-items recursively
    const renderSubItems = (children, level = 1) => {
        let subHtml = '';
        children.forEach(child => {
            const childId = String(child.id);
            const grandChildren = childrenByParent[childId] || [];
            const hasGrandChildren = grandChildren.length > 0;
            const isGrandExpanded = coaState.expandedCategories.has(childId);

            // For bank accounts, show current_balance; for categories, show total_amount
            let childBalance = child.is_account ? (child.current_balance || 0) : (child.total_amount || 0);

            // For IOLTA parent accounts, sum up child balances
            if (child.account_type === 'iolta' && hasGrandChildren) {
                childBalance = grandChildren.reduce((sum, gc) => sum + (gc.current_balance || 0), 0);
            }

            const childBalanceClass = childBalance === 0 ? 'zero' : (childBalance >= 0 ? 'positive' : 'negative');
            const isChildSelected = selectedCategoryId === child.id;
            const isAccount = child.is_account;
            const isTrustSubAccount = child.is_trust_sub_account;
            const isIoltaParent = child.account_type === 'iolta';
            const indent = level * 16;

            // For IOLTA accounts with sub-accounts, make them expandable
            if (isIoltaParent && hasGrandChildren) {
                subHtml += `
                    <div class="sub-item iolta-parent ${isChildSelected ? 'selected' : ''}"
                         data-category-id="${child.id}"
                         style="padding-left: ${indent}px;"
                         onclick="toggleIoltaExpand(event, '${childId}')">
                        <span class="iolta-toggle">${isGrandExpanded ? '▼' : '▶'}</span>
                        <span class="sub-icon">⚖️</span>
                        <span class="sub-name">${child.name}</span>
                        <span class="sub-count">[${grandChildren.length}]</span>
                        <span class="sub-balance ${childBalanceClass}">${formatCurrency(Math.abs(childBalance))}</span>
                    </div>
                `;

                // Render grandchildren (trust sub-accounts)
                if (hasGrandChildren) {
                    subHtml += `<div class="trust-sub-items ${isGrandExpanded ? '' : 'collapsed'}" data-trust-subs="${childId}">`;
                    subHtml += renderSubItems(grandChildren, level + 1);
                    subHtml += `</div>`;
                }
            } else {
                // Regular sub-item (categories or trust sub-accounts)
                const subItemClass = isTrustSubAccount ? 'trust-sub-account' : '';

                // Trust sub-accounts should be clickable to show details
                const clickHandler = isTrustSubAccount
                    ? `selectTrustSubAccount('${child.id}', event)`
                    : (isAccount ? '' : `selectCategory(${child.id}, event)`);

                subHtml += `
                    <div class="sub-item ${isChildSelected ? 'selected' : ''} ${isAccount ? 'is-bank-account' : ''} ${subItemClass}"
                         data-category-id="${child.id}"
                         style="padding-left: ${indent}px;"
                         onclick="${clickHandler}">
                        <span class="sub-name" ${isAccount ? '' : `ondblclick="startInlineEdit(event, ${child.id}, '${child.name.replace(/'/g, "\\'")}')"`}>${child.name}</span>
                        <span class="sub-balance ${childBalanceClass}">${formatCurrency(Math.abs(childBalance))}</span>
                    </div>
                `;
            }
        });
        return subHtml;
    };

    // Build HTML for 2-panel sidebar list
    let html = '';
    let accountCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    parentCategories.forEach(cat => {
        const catId = String(cat.id);
        const children = childrenByParent[catId] || [];
        const hasChildren = children.length > 0;
        const isExpanded = coaState.expandedCategories.has(catId);
        const icon = getCategoryIcon(cat.icon);
        const isAssetContainer = cat.slug === 'assets' || cat.is_asset_container;

        // Calculate balance (total_amount from stats)
        // Skip Assets category and bank accounts from balance calculation
        let balance = 0;
        let totalWithChildren = 0;

        if (!isAssetContainer) {
            balance = cat.total_amount || 0;
            totalWithChildren = balance;
            children.forEach(child => {
                // Skip bank account children
                if (!child.is_account) {
                    totalWithChildren += (child.total_amount || 0);
                }
            });

            // Track totals by type (exclude Assets/other)
            if (cat.category_type === 'income') {
                totalIncome += totalWithChildren;
            } else if (cat.category_type === 'expense') {
                totalExpense += totalWithChildren;
            }
        }

        accountCount++;

        // Determine balance display class
        const balanceClass = totalWithChildren === 0 ? 'zero' : (totalWithChildren >= 0 ? 'positive' : 'negative');
        const isSelected = selectedCategoryId === cat.id;

        // Parent category item
        html += `
            <div class="category-parent ${isSelected ? 'selected' : ''}"
                 data-parent-id="${catId}"
                 data-category-id="${cat.id}"
                 data-sort-order="${cat.sort_order || 0}"
                 draggable="true"
                 ondragstart="handleCategoryDragStart(event, ${cat.id})"
                 ondragover="handleCategoryDragOver(event)"
                 ondrop="handleCategoryDrop(event, ${cat.id})"
                 ondragend="handleCategoryDragEnd(event)"
                 onclick="handleCategoryParentClick(event, '${catId}', ${hasChildren}, ${cat.id})">
                <span class="cat-icon">${icon}</span>
                <div class="cat-info">
                    <div class="cat-name">
                        <span class="cat-name-text" ondblclick="startInlineEdit(event, ${cat.id}, '${cat.name.replace(/'/g, "\\'")}')">${cat.name}</span>
                        ${hasChildren ? `<span class="cat-toggle">${isExpanded ? '▼' : '▶'}</span>` : ''}
                        ${hasChildren ? `<span class="cat-count">[${children.length}]</span>` : ''}
                    </div>
                </div>
                <span class="cat-balance ${balanceClass}">${formatCurrency(Math.abs(totalWithChildren))}</span>
            </div>
        `;

        // Sub items (with recursive support for trust sub-accounts)
        if (hasChildren) {
            html += `<div class="sub-items ${isExpanded ? '' : 'collapsed'}" data-subs="${catId}">`;
            html += renderSubItems(children, 1);
            html += `</div>`;
        }
    });

    // No results
    if (parentCategories.length === 0) {
        html = `
            <div class="coa-no-results">
                <div class="coa-no-results-icon">📁</div>
                <div class="coa-no-results-text">No accounts found</div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Set initial max-height for expanded wrappers
    // Must set child heights first, then parent heights (bottom-up)
    document.querySelectorAll('.trust-sub-items:not(.collapsed)').forEach(wrapper => {
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
    });
    // Use setTimeout to ensure child heights are calculated first
    setTimeout(() => {
        document.querySelectorAll('.sub-items:not(.collapsed)').forEach(wrapper => {
            wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
        });
    }, 10);

    // Update footer stats
    const countEl = document.getElementById('coa-count');
    const incomeEl = document.getElementById('coa-total-income');
    const expenseEl = document.getElementById('coa-total-expense');

    if (countEl) countEl.textContent = accountCount;
    if (incomeEl) incomeEl.textContent = formatCurrency(totalIncome);
    if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);
}

// Toggle IOLTA sub-accounts expansion
function toggleIoltaExpand(event, ioltaId) {
    event.stopPropagation();

    const subItems = document.querySelector(`[data-trust-subs="${ioltaId}"]`);
    const parentRow = event.target.closest('.iolta-parent');
    const toggleIcon = parentRow?.querySelector('.iolta-toggle');

    if (subItems) {
        const isCollapsed = subItems.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            subItems.classList.remove('collapsed');
            subItems.style.maxHeight = subItems.scrollHeight + 'px';
            coaState.expandedCategories.add(ioltaId);
            if (toggleIcon) toggleIcon.textContent = '▼';

            // Update parent wrapper height to accommodate expanded children
            const parentWrapper = subItems.closest('.sub-items');
            if (parentWrapper) {
                setTimeout(() => {
                    parentWrapper.style.maxHeight = parentWrapper.scrollHeight + 'px';
                }, 20);
            }
        } else {
            // Collapse
            subItems.classList.add('collapsed');
            subItems.style.maxHeight = '0';
            coaState.expandedCategories.delete(ioltaId);
            if (toggleIcon) toggleIcon.textContent = '▶';

            // Update parent wrapper height
            const parentWrapper = subItems.closest('.sub-items');
            if (parentWrapper) {
                setTimeout(() => {
                    parentWrapper.style.maxHeight = parentWrapper.scrollHeight + 'px';
                }, 250); // Wait for collapse animation
            }
        }
    }
}

// =====================================================
// Drag and Drop for Category Sorting
// =====================================================

function handleCategoryDragStart(event, categoryId) {
    draggedCategoryId = categoryId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', categoryId);
}

function handleCategoryDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('.category-parent');
    if (target && !target.classList.contains('dragging')) {
        // Remove drag-over class from all
        document.querySelectorAll('.category-parent.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        target.classList.add('drag-over');
    }
}

function handleCategoryDragEnd(event) {
    event.target.classList.remove('dragging');
    document.querySelectorAll('.category-parent.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    draggedCategoryId = null;
}

async function handleCategoryDrop(event, targetCategoryId) {
    event.preventDefault();

    const target = event.target.closest('.category-parent');
    if (target) {
        target.classList.remove('drag-over');
    }

    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
        return;
    }

    // Get only parent categories (same level sorting)
    const parentCategories = state.categories.filter(c => !c.parent_id || c.parent_id == 0);

    // Find indices
    const draggedIndex = parentCategories.findIndex(c => c.id == draggedCategoryId);
    const targetIndex = parentCategories.findIndex(c => c.id == targetCategoryId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder array
    const [removed] = parentCategories.splice(draggedIndex, 1);
    parentCategories.splice(targetIndex, 0, removed);

    // Build new sort order
    const newOrder = parentCategories.map((cat, index) => ({
        id: cat.id,
        sort_order: index
    }));

    // Update server
    try {
        const result = await apiPost('/categories/reorder.php', {
            user_id: state.currentUser === 3 ? 3 : null,
            order: newOrder
        });

        if (result.success) {
            // Update local state
            newOrder.forEach(item => {
                const cat = state.categories.find(c => c.id === item.id);
                if (cat) cat.sort_order = item.sort_order;
            });

            // Re-sort categories
            state.categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            renderChartOfAccounts();
            showToast('Order saved', 'success');
        } else {
            showToast('Failed to save order', 'error');
        }
    } catch (error) {
        console.error('Reorder error:', error);
        showToast('Error saving order', 'error');
    }
}

// =====================================================
// Inline Editing
// =====================================================

function startInlineEdit(event, categoryId, currentName) {
    event.stopPropagation();
    event.preventDefault();

    const target = event.target;
    const originalText = currentName;
    const originalWidth = target.offsetWidth;

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'inline-edit-input';
    input.style.width = Math.max(originalWidth, 100) + 'px';

    // Replace text with input
    target.innerHTML = '';
    target.appendChild(input);
    input.focus();
    input.select();

    // Handle save on blur or Enter
    const saveEdit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== originalText) {
            await updateCategoryName(categoryId, newName);
        } else {
            target.textContent = originalText;
        }
    };

    // Handle cancel on Escape
    const cancelEdit = () => {
        target.textContent = originalText;
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            input.removeEventListener('blur', saveEdit);
            cancelEdit();
        }
    });
}

async function updateCategoryName(categoryId, newName) {
    try {
        const response = await fetch(`${API_BASE}/categories/update.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: categoryId,
                name: newName
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Category renamed', 'success');
            await loadCategories(true);
            if (selectedCategoryId) {
                selectCategory(selectedCategoryId);
            }
        } else {
            showToast(data.message || 'Failed to rename', 'error');
            renderChartOfAccounts();
        }
    } catch (error) {
        console.error('Rename error:', error);
        showToast('Error renaming category', 'error');
        renderChartOfAccounts();
    }
}

// =====================================================
// Category Selection and Detail Panel
// =====================================================

function handleCategoryParentClick(event, parentId, hasChildren, categoryId) {
    event.stopPropagation();

    const parentRow = document.querySelector(`[data-parent-id="${parentId}"]`);
    const subItems = document.querySelector(`[data-subs="${parentId}"]`);

    if (hasChildren && subItems) {
        const isCollapsed = subItems.classList.contains('collapsed');
        const toggleIcon = parentRow.querySelector('.cat-toggle');

        if (isCollapsed) {
            // Expand
            subItems.classList.remove('collapsed');
            subItems.style.maxHeight = subItems.scrollHeight + 'px';
            coaState.expandedCategories.add(parentId);
            if (toggleIcon) toggleIcon.textContent = '▼';
        } else {
            // Collapse
            subItems.classList.add('collapsed');
            subItems.style.maxHeight = '0';
            coaState.expandedCategories.delete(parentId);
            if (toggleIcon) toggleIcon.textContent = '▶';
        }
    }

    // Always select the category (show in detail panel)
    selectCategory(categoryId, event);
}

function selectCategory(categoryId, event) {
    if (event) event.stopPropagation();

    selectedCategoryId = categoryId;

    // Update selection UI
    document.querySelectorAll('.category-parent, .sub-item').forEach(el => {
        el.classList.remove('selected');
    });

    const selectedEl = document.querySelector(`[data-category-id="${categoryId}"]`);
    if (selectedEl) {
        selectedEl.classList.add('selected');
    }

    // Load and show detail panel
    loadCategoryDetail(categoryId);
}

/**
 * Select a trust sub-account and show its details
 */
function selectTrustSubAccount(accountId, event) {
    if (event) event.stopPropagation();

    selectedCategoryId = accountId;

    // Update selection UI
    document.querySelectorAll('.category-parent, .sub-item').forEach(el => {
        el.classList.remove('selected');
    });

    const selectedEl = document.querySelector(`[data-category-id="${accountId}"]`);
    if (selectedEl) {
        selectedEl.classList.add('selected');
    }

    // Load and show detail panel for trust sub-account
    loadTrustSubAccountDetail(accountId);
}

/**
 * Load detail panel for a trust sub-account (client ledger)
 */
async function loadTrustSubAccountDetail(accountId) {
    const emptyState = document.getElementById('coa-detail-empty');
    const detailContent = document.getElementById('coa-detail-content');

    if (!emptyState || !detailContent) return;

    // Find account data from state.categories
    const account = state.categories.find(c => c.id === accountId);
    if (!account) return;

    // Hide empty state, show detail
    emptyState.style.display = 'none';
    detailContent.style.display = 'flex';

    // Populate header
    document.getElementById('detail-icon').textContent = '👤';
    document.getElementById('detail-name').textContent = account.name;

    const typeBadge = document.getElementById('detail-type');
    typeBadge.textContent = 'Trust';
    typeBadge.className = 'detail-type-badge trust';

    // Get linked client ID for fetching transactions
    const clientId = account.linked_client_id;

    // Populate stats - for trust accounts, show balance info
    document.getElementById('detail-this-month').textContent = formatCurrency(account.current_balance || 0);
    document.getElementById('detail-last-month').textContent = '-';
    document.getElementById('detail-all-time').textContent = formatCurrency(account.current_balance || 0);
    document.getElementById('detail-txn-count').textContent = '-';

    // Populate info
    document.getElementById('detail-parent').textContent = 'IOLTA';
    document.getElementById('detail-system').textContent = 'No';

    // Hide edit/delete buttons for trust accounts
    const editBtn = document.getElementById('detail-edit-btn');
    const deleteBtn = document.getElementById('detail-delete-btn');
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';

    // Load trust transactions for this client
    await loadTrustTransactions(clientId, accountId);

    // Setup view all button
    document.getElementById('detail-view-all-btn').onclick = () => {
        // Could open client ledger modal in the future
    };
}

/**
 * Load trust transactions for a client
 */
async function loadTrustTransactions(clientId, accountId) {
    const container = document.getElementById('detail-txn-list');
    if (!container) return;

    if (!clientId) {
        container.innerHTML = '<div class="empty-state">No client linked</div>';
        return;
    }

    container.innerHTML = '<div class="loading">Loading transactions...</div>';

    try {
        const userId = window.currentUserId || 1;
        const response = await fetch(`/expensetracker/api/v1/trust/transactions.php?user_id=${userId}&client_id=${clientId}&limit=10`);
        const data = await response.json();

        if (!data.success || !data.data.transactions || data.data.transactions.length === 0) {
            container.innerHTML = '<div class="empty-state">No transactions yet</div>';
            // Update transaction count
            document.getElementById('detail-txn-count').textContent = '0';
            return;
        }

        const transactions = data.data.transactions;
        document.getElementById('detail-txn-count').textContent = data.data.total_count || transactions.length;

        let html = '';
        transactions.forEach(txn => {
            const isDeposit = parseFloat(txn.amount) > 0;
            const amountClass = isDeposit ? 'positive' : 'negative';
            const typeIcon = isDeposit ? '↓' : '↑';

            html += `
                <div class="detail-txn-item">
                    <div class="txn-info">
                        <span class="txn-type-icon ${amountClass}">${typeIcon}</span>
                        <div class="txn-details">
                            <div class="txn-desc">${txn.description || txn.transaction_type}</div>
                            <div class="txn-date">${formatDate(txn.transaction_date)}</div>
                        </div>
                    </div>
                    <div class="txn-amount ${amountClass}">${formatCurrency(Math.abs(txn.amount))}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading trust transactions:', error);
        container.innerHTML = '<div class="empty-state">Error loading transactions</div>';
    }
}

async function loadCategoryDetail(categoryId) {
    const emptyState = document.getElementById('coa-detail-empty');
    const detailContent = document.getElementById('coa-detail-content');

    if (!emptyState || !detailContent) return;

    // Find category data
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) return;

    // Hide empty state, show detail
    emptyState.style.display = 'none';
    detailContent.style.display = 'flex';

    // Populate header
    const icon = getCategoryIcon(category.icon);
    document.getElementById('detail-icon').textContent = icon;
    document.getElementById('detail-name').textContent = category.name;

    const typeBadge = document.getElementById('detail-type');
    typeBadge.textContent = category.category_type;
    typeBadge.className = 'detail-type-badge ' + category.category_type;

    // Populate stats
    document.getElementById('detail-this-month').textContent = formatCurrency(category.month_total || 0);
    document.getElementById('detail-last-month').textContent = formatCurrency(category.last_month_total || 0);
    document.getElementById('detail-all-time').textContent = formatCurrency(category.total_amount || 0);
    document.getElementById('detail-txn-count').textContent = category.transaction_count || 0;

    // Populate info
    document.getElementById('detail-parent').textContent = category.parent_name || 'None';
    document.getElementById('detail-system').textContent = (category.is_system || category.slug === 'uncategorized') ? 'Yes' : 'No';

    // Setup edit/delete buttons
    const editBtn = document.getElementById('detail-edit-btn');
    const deleteBtn = document.getElementById('detail-delete-btn');
    const isSystem = category.is_system || category.slug === 'uncategorized';

    editBtn.onclick = () => editCategory(categoryId);
    deleteBtn.onclick = () => deleteCategory(categoryId);
    editBtn.style.display = isSystem ? 'none' : '';
    deleteBtn.style.display = isSystem ? 'none' : '';

    // Load transactions
    await loadDetailTransactions(categoryId);

    // Setup view all button
    document.getElementById('detail-view-all-btn').onclick = () => openCategoryDetailModal(categoryId);
}

// =====================================================
// Detail Panel Transactions
// =====================================================

async function loadDetailTransactions(categoryId) {
    const container = document.getElementById('detail-txn-list');
    if (!container) return;

    detailPanelState.categoryId = categoryId;
    detailPanelState.searchQuery = '';
    detailPanelState.sortBy = 'date';
    detailPanelState.sortOrder = 'desc';
    detailPanelState.selectedIds = new Set();

    // Reset UI controls
    const searchInput = document.getElementById('detail-txn-search');
    const sortSelect = document.getElementById('detail-txn-sort');
    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'date';

    try {
        const response = await fetch(`${API_BASE}/transactions/index.php?user_id=${state.currentUser}&category_id=${categoryId}&limit=10000`);
        const data = await response.json();

        if (!data.success || !data.data.transactions || data.data.transactions.length === 0) {
            detailPanelState.transactions = [];
            container.innerHTML = '<div class="detail-txn-empty">No transactions</div>';
            return;
        }

        detailPanelState.transactions = data.data.transactions;
        renderDetailTransactions();
    } catch (error) {
        console.error('Error loading transactions:', error);
        container.innerHTML = '<div class="detail-txn-empty">Error loading transactions</div>';
    }
}

function renderDetailTransactions() {
    const container = document.getElementById('detail-txn-list');
    if (!container) return;

    const category = state.categories.find(c => c.id === detailPanelState.categoryId);
    const isSubCategory = category && category.parent_id;

    // Filter by search
    let filtered = detailPanelState.transactions;
    if (detailPanelState.searchQuery) {
        const query = detailPanelState.searchQuery.toLowerCase();
        filtered = filtered.filter(txn => {
            const desc = (txn.description || txn.vendor_name || '').toLowerCase();
            const account = (txn.account_name || '').toLowerCase();
            return desc.includes(query) || account.includes(query);
        });
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (detailPanelState.sortBy) {
            case 'date':
                cmp = new Date(a.transaction_date) - new Date(b.transaction_date);
                break;
            case 'amount':
                cmp = Math.abs(a.amount) - Math.abs(b.amount);
                break;
            case 'account':
                cmp = (a.account_name || '').localeCompare(b.account_name || '');
                break;
            case 'description':
                cmp = (a.description || '').localeCompare(b.description || '');
                break;
        }
        return detailPanelState.sortOrder === 'desc' ? -cmp : cmp;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="detail-txn-empty">No matching transactions</div>';
        return;
    }

    let html = '';
    filtered.forEach(txn => {
        const date = new Date(txn.transaction_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const amountClass = txn.amount >= 0 ? 'positive' : 'negative';
        const accountName = txn.account_name || 'Unknown';
        const isChecked = detailPanelState.selectedIds.has(txn.id);

        html += `
            <div class="detail-txn-row ${isSubCategory ? 'is-sub' : ''}" data-txn-id="${txn.id}">
                <div class="detail-txn-checkbox">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="toggleDetailTxnSelect(${txn.id}, this.checked, event)">
                </div>
                <div class="detail-txn-date">${date}</div>
                <div class="detail-txn-desc">${txn.description || txn.vendor_name || 'No description'}</div>
                <div class="detail-txn-account">${accountName}</div>
                <div class="detail-txn-amount ${amountClass}">${formatCurrency(Math.abs(txn.amount))}</div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateBulkCategorizeButton();
}

function handleDetailSearch(value) {
    clearTimeout(detailSearchTimer);
    detailSearchTimer = setTimeout(() => {
        detailPanelState.searchQuery = value;
        renderDetailTransactions();
        updateBulkCategorizeButton();
    }, 300);
}

function handleDetailSort(sortBy) {
    if (detailPanelState.sortBy === sortBy) {
        detailPanelState.sortOrder = detailPanelState.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
        detailPanelState.sortBy = sortBy;
        detailPanelState.sortOrder = 'desc';
    }
    renderDetailTransactions();
}

function toggleDetailTxnSelect(txnId, isSelected, event) {
    const filtered = getFilteredTransactions();
    const currentIndex = filtered.findIndex(txn => txn.id === txnId);

    // Shift+click for range selection
    if (event && event.shiftKey && lastClickedTxnIndex !== null && currentIndex !== -1 && lastClickedTxnIndex !== currentIndex) {
        event.preventDefault();

        const start = Math.min(lastClickedTxnIndex, currentIndex);
        const end = Math.max(lastClickedTxnIndex, currentIndex);

        for (let i = start; i <= end; i++) {
            detailPanelState.selectedIds.add(filtered[i].id);
        }

        lastClickedTxnIndex = currentIndex;
        renderDetailTransactions();
        updateBulkCategorizeButton();
    } else {
        if (isSelected) {
            detailPanelState.selectedIds.add(txnId);
        } else {
            detailPanelState.selectedIds.delete(txnId);
        }
        lastClickedTxnIndex = currentIndex;
        updateBulkCategorizeButton();
    }
}

function selectAllTransactions() {
    const filtered = getFilteredTransactions();
    filtered.forEach(txn => detailPanelState.selectedIds.add(txn.id));
    renderDetailTransactions();
}

function deselectAllTransactions() {
    detailPanelState.selectedIds.clear();
    renderDetailTransactions();
}

function getFilteredTransactions() {
    let filtered = detailPanelState.transactions;

    if (detailPanelState.searchQuery) {
        const query = detailPanelState.searchQuery.toLowerCase();
        filtered = filtered.filter(txn => {
            const desc = (txn.description || '').toLowerCase();
            const vendor = (txn.vendor_name || '').toLowerCase();
            const account = (txn.account_name || '').toLowerCase();
            return desc.includes(query) || vendor.includes(query) || account.includes(query);
        });
    }

    filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (detailPanelState.sortBy) {
            case 'date':
                cmp = new Date(a.transaction_date) - new Date(b.transaction_date);
                break;
            case 'amount':
                cmp = Math.abs(a.amount) - Math.abs(b.amount);
                break;
            case 'account':
                cmp = (a.account_name || '').localeCompare(b.account_name || '');
                break;
            case 'description':
                cmp = (a.description || '').localeCompare(b.description || '');
                break;
        }
        return detailPanelState.sortOrder === 'desc' ? -cmp : cmp;
    });

    return filtered;
}

function updateBulkCategorizeButton() {
    const moveBtn = document.getElementById('btn-bulk-categorize');
    const deleteBtn = document.getElementById('btn-bulk-delete');

    const selectedCount = detailPanelState.selectedIds.size;

    if (selectedCount > 0) {
        if (moveBtn) {
            moveBtn.style.display = 'inline-flex';
            moveBtn.textContent = `Move (${selectedCount})`;
        }
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-flex';
            deleteBtn.textContent = `Delete (${selectedCount})`;
        }
    } else {
        if (moveBtn) moveBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
}

// =====================================================
// Bulk Operations
// =====================================================

async function deleteSelectedDetailTransactions() {
    const selectedIds = Array.from(detailPanelState.selectedIds);

    if (selectedIds.length === 0) {
        showToast('No transactions selected', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} transaction(s)?`)) {
        return;
    }

    try {
        showLoading();

        const response = await fetch(`${API_BASE}/transactions/delete.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`${data.data.deleted_count} transaction(s) deleted`, 'success');

            detailPanelState.selectedIds.clear();

            const currentCategoryId = detailPanelState.categoryId;
            const currentSearch = detailPanelState.searchQuery;
            const currentSortBy = detailPanelState.sortBy;
            const currentSortOrder = detailPanelState.sortOrder;

            await loadCategories(true);

            if (currentCategoryId) {
                selectCategory(currentCategoryId);

                setTimeout(() => {
                    detailPanelState.searchQuery = currentSearch;
                    detailPanelState.sortBy = currentSortBy;
                    detailPanelState.sortOrder = currentSortOrder;

                    const searchInput = document.getElementById('detail-txn-search');
                    const sortSelect = document.getElementById('detail-txn-sort');
                    if (searchInput) searchInput.value = currentSearch;
                    if (sortSelect) sortSelect.value = currentSortBy;

                    renderDetailTransactions();
                }, 100);
            }
        } else {
            showToast(data.message || 'Failed to delete transactions', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Error deleting transactions', 'error');
    } finally {
        hideLoading();
    }
}

function openBulkCategorizeModal() {
    const selectedCount = detailPanelState.selectedIds.size;
    if (selectedCount === 0) return;

    const selectedTxns = detailPanelState.transactions.filter(txn =>
        detailPanelState.selectedIds.has(txn.id)
    );

    // Update count badge
    document.getElementById('bulk-cat-count-badge').textContent = selectedCount;

    // Render selected transaction items
    const itemsContainer = document.getElementById('bulk-cat-items');
    itemsContainer.innerHTML = selectedTxns.map(txn => {
        const amount = parseFloat(txn.amount) || 0;
        const amountClass = amount < 0 ? 'negative' : 'positive';
        const amountText = amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`;
        return `
            <div class="bulk-cat-item">
                <span class="bulk-cat-item-desc">${txn.description || txn.vendor_name || 'No description'}</span>
                <span class="bulk-cat-item-amount ${amountClass}">${amountText}</span>
            </div>
        `;
    }).join('');

    // Populate category select
    populateBulkCategorySelect();

    // Pre-fill rule settings based on first selected transaction
    if (selectedTxns.length > 0) {
        const firstTxn = selectedTxns[0];
        const description = firstTxn.description || firstTxn.vendor_name || '';

        document.getElementById('bulk-rule-name').value = description.substring(0, 30).toUpperCase();
        document.getElementById('bulk-rule-value').value = description;
        document.getElementById('bulk-rule-priority').value = 50;

        // Reset match type to 'contains'
        document.querySelector('input[name="bulk-match-type"][value="contains"]').checked = true;
    }

    // Show rule settings if checkbox is checked
    toggleRuleSettings();

    // Reset existing rule warning
    document.getElementById('existing-rule-warning').style.display = 'none';

    document.getElementById('bulk-categorize-overlay').classList.add('open');
}

function closeBulkCategorizeModal() {
    document.getElementById('bulk-categorize-overlay').classList.remove('open');
    // Reset custom dropdown
    if (typeof resetCustomDropdown === 'function') {
        resetCustomDropdown('bulk-cat-select', 'Select category');
    }
}

function toggleRuleSettings() {
    const checkbox = document.getElementById('bulk-cat-create-rule');
    const settings = document.getElementById('bulk-cat-rule-settings');
    if (settings) {
        settings.style.display = checkbox.checked ? 'block' : 'none';
    }
}

function toggleRuleSettings() {
    const checkbox = document.getElementById('bulk-cat-create-rule');
    const settings = document.getElementById('bulk-cat-rule-settings');
    if (settings) {
        settings.style.display = checkbox.checked ? 'block' : 'none';
    }
}

function populateBulkCategorySelect() {
    const select = document.getElementById('bulk-cat-select');
    select.innerHTML = '<option value="">Select category...</option>' + buildHierarchicalCategoryOptions(false);

    // Initialize custom dropdown if available
    if (typeof initCustomCategoryDropdown === 'function' && state.categories) {
        // Filter out uncategorized and accounts
        const categories = state.categories.filter(c =>
            c.slug !== 'uncategorized' &&
            !c.is_account &&
            c.category_type !== 'asset'
        );
        initCustomCategoryDropdown('bulk-cat-select', categories, 'Select category');
    }
}

// Check for existing similar rules
async function checkExistingRules(matchValue) {
    try {
        const response = await fetch(`${API_BASE}/rules/?user_id=${state.currentUser}&search=${encodeURIComponent(matchValue)}`);
        const data = await response.json();

        if (data.success && data.data.rules && data.data.rules.length > 0) {
            const warning = document.getElementById('existing-rule-warning');
            const text = document.getElementById('existing-rule-text');
            const similarRule = data.data.rules[0];
            text.textContent = `Similar rule exists: "${similarRule.rule_name}" → ${similarRule.category_name}`;
            warning.style.display = 'flex';
        } else {
            document.getElementById('existing-rule-warning').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking rules:', error);
    }
}

// Check for existing similar rules
async function checkExistingRules(matchValue) {
    try {
        const response = await fetch(`${API_BASE}/rules/?user_id=${state.currentUser}&search=${encodeURIComponent(matchValue)}`);
        const data = await response.json();

        if (data.success && data.data.rules && data.data.rules.length > 0) {
            const warning = document.getElementById('existing-rule-warning');
            const text = document.getElementById('existing-rule-text');
            const similarRule = data.data.rules[0];
            text.textContent = `Similar rule exists: "${similarRule.rule_name}" → ${similarRule.category_name}`;
            warning.style.display = 'flex';
        } else {
            document.getElementById('existing-rule-warning').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking rules:', error);
    }
}

async function executeBulkCategorize() {
    const categoryId = document.getElementById('bulk-cat-select').value;
    const createRule = document.getElementById('bulk-cat-create-rule').checked;
    const selectedIds = Array.from(detailPanelState.selectedIds);

    if (!categoryId) {
        showToast('Please select a category', 'error');
        return;
    }

    if (selectedIds.length === 0) {
        showToast('No transactions selected', 'error');
        return;
    }

    // Build rule data if creating rule
    let ruleData = null;
    if (createRule) {
        const ruleName = document.getElementById('bulk-rule-name').value.trim();
        const matchField = document.getElementById('bulk-rule-field').value;
        const matchType = document.querySelector('input[name="bulk-match-type"]:checked')?.value || 'contains';
        const matchValue = document.getElementById('bulk-rule-value').value.trim();
        const priority = parseInt(document.getElementById('bulk-rule-priority').value) || 50;

        if (!ruleName || !matchValue) {
            showToast('Please fill in rule name and match value', 'error');
            return;
        }

        ruleData = {
            rule_name: ruleName,
            match_field: matchField,
            match_type: matchType,
            match_value: matchValue,
            priority: priority
        };
    }

    try {
        showLoading();

        const requestBody = {
            user_id: state.currentUser,
            transaction_ids: selectedIds,
            category_id: parseInt(categoryId),
            create_rule: createRule
        };

        // Add rule data if provided
        if (ruleData) {
            requestBody.rule_data = ruleData;
        }

        const response = await fetch(`${API_BASE}/transactions/bulk-categorize.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.success) {
            const updated = data.data.updated || 0;
            const ruleCreated = data.data.rule_created;

            let message = `${updated} transactions moved`;
            if (ruleCreated) {
                message += ' and rule created';
            }

            showToast(message, 'success');
            closeBulkCategorizeModal();

            detailPanelState.selectedIds.clear();

            const currentCategoryId = detailPanelState.categoryId;
            const currentSearch = detailPanelState.searchQuery;
            const currentSortBy = detailPanelState.sortBy;
            const currentSortOrder = detailPanelState.sortOrder;

            await loadCategories(true);

            if (currentCategoryId) {
                selectCategory(currentCategoryId);

                setTimeout(() => {
                    detailPanelState.searchQuery = currentSearch;
                    detailPanelState.sortBy = currentSortBy;
                    detailPanelState.sortOrder = currentSortOrder;

                    const searchInput = document.getElementById('detail-txn-search');
                    const sortSelect = document.getElementById('detail-txn-sort');
                    if (searchInput) searchInput.value = currentSearch;
                    if (sortSelect) sortSelect.value = currentSortBy;

                    renderDetailTransactions();
                }, 100);
            }
        } else {
            showToast(data.message || 'Failed to move transactions', 'error');
        }
    } catch (error) {
        console.error('Bulk categorize error:', error);
        showToast('Error moving transactions', 'error');
    } finally {
        hideLoading();
    }
}

// =====================================================
// Legacy/Helper Functions
// =====================================================

function handleParentRowClick(event, categoryId, hasChildren) {
    if (hasChildren) {
        toggleCoaExpand(categoryId);
    }
}

function handleCoaParentClick(event, parentId, hasChildren, categoryId) {
    handleCategoryParentClick(event, parentId, hasChildren, categoryId);
}

function handleCoaParentDblClick(event, categoryId) {
    event.preventDefault();
    event.stopPropagation();
    openCategoryDetailModal(categoryId);
}

function getDetailType(category) {
    const detailTypes = {
        'expense': 'Operating Expense',
        'income': 'Operating Income',
        'transfer': 'Bank Transfer',
        'other': 'Other'
    };
    return detailTypes[category.category_type] || 'Other';
}

function toggleCoaExpand(categoryId) {
    const catId = String(categoryId);
    if (coaState.expandedCategories.has(catId)) {
        coaState.expandedCategories.delete(catId);
    } else {
        coaState.expandedCategories.add(catId);
    }
    renderChartOfAccounts();
}

function toggleCoaActionMenu(categoryId) {
    event.stopPropagation();
    document.querySelectorAll('.coa-action-menu.show').forEach(menu => {
        if (menu.id !== `coa-menu-${categoryId}`) {
            menu.classList.remove('show');
        }
    });
    const menu = document.getElementById(`coa-menu-${categoryId}`);
    if (menu) {
        menu.classList.toggle('show');
    }
}

function editCategory(categoryId) {
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) return;

    document.querySelectorAll('.coa-action-menu.show').forEach(menu => menu.classList.remove('show'));

    showAddCategoryModal(category.parent_id, category.category_type, category);
}

function renderCategories(grouped) {
    renderChartOfAccounts();
}

function getCategoryIcon(iconName) {
    const iconMap = {
        'briefcase': '💼',
        'laptop': '💻',
        'trending-up': '📈',
        'rotate-ccw': '🔄',
        'plus-circle': '➕',
        'home': '🏠',
        'zap': '⚡',
        'shopping-cart': '🛒',
        'utensils': '🍽️',
        'car': '🚗',
        'fuel': '⛽',
        'heart': '❤️',
        'shield': '🛡️',
        'film': '🎬',
        'shopping-bag': '🛍️',
        'gift': '🎁',
        'book': '📚',
        'plane': '✈️',
        'smartphone': '📱',
        'coffee': '☕',
        'music': '🎵',
        'dollar-sign': '💵',
        'credit-card': '💳',
        'percent': '💯',
        'tag': '🏷️',
        'folder': '📁',
        'banknote': '💵',
        'wrench': '🔧',
        'repeat': '🔁',
        'alert-circle': '⚠️',
        'file-text': '📄',
        'smile': '😊',
        'help-circle': '❓'
    };
    return iconMap[iconName] || '📁';
}

async function deleteCategory(categoryId, categoryName, transactionCount) {
    // If called without parameters, get them from state
    if (categoryName === undefined) {
        const category = state.categories.find(c => c.id === categoryId);
        if (!category) return;
        categoryName = category.name;
        transactionCount = category.transaction_count || 0;
    }

    if (transactionCount > 0) {
        const confirmed = confirm(`"${categoryName}" has ${transactionCount} transactions. These will be moved to Uncategorized. Continue?`);
        if (!confirmed) return;
    } else {
        const confirmed = confirm(`Delete category "${categoryName}"?`);
        if (!confirmed) return;
    }

    showLoading();

    const result = await apiRequest('/categories/', 'DELETE', { id: categoryId });

    hideLoading();

    if (result.success) {
        showToast('Category deleted', 'success');
        await loadCategories(true);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

// =====================================================
// Category Detail Modal
// =====================================================

async function showCategoryDetail(categoryId, categoryName, icon, canDelete = false) {
    showLoading();

    const data = await apiGet('/transactions/', {
        user_id: state.currentUser,
        category_id: categoryId,
        all: 1
    });

    hideLoading();

    if (!data.success) {
        showToast('Failed to load transactions', 'error');
        return;
    }

    const transactions = data.data.transactions || [];
    const isUncategorized = categoryName.toLowerCase() === 'uncategorized';
    const transactionCount = transactions.length;

    categoryDetailState = {
        transactions: transactions,
        sortBy: 'date',
        sortOrder: 'desc',
        searchQuery: '',
        categoryId,
        categoryName,
        icon,
        canDelete,
        isUncategorized
    };
    state.categoryDetailTransactions = transactions;
    state.selectedTransactionIds = [];

    renderCategoryDetailModal();
}

function renderCategoryDetailModal() {
    const { transactions, sortBy, sortOrder, searchQuery, categoryId, categoryName, icon, canDelete, isUncategorized } = categoryDetailState;

    // Filter transactions
    let filtered = transactions;
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = transactions.filter(t =>
            t.description.toLowerCase().includes(query) ||
            (state.accounts.find(a => a.id === t.account_id)?.account_name || '').toLowerCase().includes(query)
        );
    }

    // Sort transactions
    filtered = [...filtered].sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'date':
                comparison = new Date(a.transaction_date) - new Date(b.transaction_date);
                break;
            case 'amount':
                comparison = Math.abs(a.amount) - Math.abs(b.amount);
                break;
            case 'account':
                const accA = state.accounts.find(acc => acc.id === a.account_id)?.account_name || '';
                const accB = state.accounts.find(acc => acc.id === b.account_id)?.account_name || '';
                comparison = accA.localeCompare(accB);
                break;
            case 'description':
                comparison = (a.description || '').localeCompare(b.description || '');
                break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
    });

    const transactionCount = transactions.length;

    const total = transactions.reduce((sum, t) => {
        return sum + (t.transaction_type === 'credit' ? t.amount : -Math.abs(t.amount));
    }, 0);

    // Build Smart Suggestions for Uncategorized
    let smartSuggestHtml = '';
    if (isUncategorized && transactions.length > 0) {
        const suggestions = buildSmartSuggestions(transactions);
        if (suggestions.length > 0) {
            smartSuggestHtml = `
                <div class="smart-suggest-section">
                    <h4>Smart Suggestions</h4>
                    <div class="smart-suggest-list">
                        ${suggestions.map(s => `
                            <div class="smart-suggest-item" onclick="applySuggestion('${escapeHtml(s.pattern)}', ${s.count})">
                                <div class="suggest-info">
                                    <span class="suggest-pattern">"${escapeHtml(s.pattern)}"</span>
                                    <span class="suggest-count">${s.count} transactions</span>
                                </div>
                                <button class="btn btn-sm btn-primary">Categorize All</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    // Build toolbar with search and sort
    const toolbarHtml = `
        <div class="cd-modal-toolbar">
            <div class="cd-search-box">
                <input type="text" id="cd-modal-search" placeholder="Search transactions..."
                       value="${searchQuery}" onkeyup="handleCategoryDetailSearch(this.value)">
            </div>
            <div class="cd-sort-controls">
                <button class="cd-sort-btn ${sortBy === 'date' ? 'active' : ''}" onclick="sortCategoryDetail('date')" title="Sort by Date">
                    Date ${sortBy === 'date' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                </button>
                <button class="cd-sort-btn ${sortBy === 'amount' ? 'active' : ''}" onclick="sortCategoryDetail('amount')" title="Sort by Amount">
                    Amount ${sortBy === 'amount' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                </button>
                <button class="cd-sort-btn ${sortBy === 'account' ? 'active' : ''}" onclick="sortCategoryDetail('account')" title="Sort by Account">
                    Account ${sortBy === 'account' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                </button>
            </div>
        </div>
    `;

    // Build transactions list
    let transactionsHtml = '';
    if (filtered.length === 0) {
        transactionsHtml = `<p class="text-muted text-center" style="padding: 20px;">${searchQuery ? 'No matching transactions' : 'No transactions in this category'}</p>`;
    } else {
        transactionsHtml = `
            <div class="category-transactions-list">
                ${isUncategorized ? `
                    <div class="bulk-actions-bar" id="bulk-actions-bar" style="display: none;">
                        <span id="selected-count">0 selected</span>
                        <select id="bulk-category-select" class="form-select" style="width: auto; display: inline-block; margin: 0 10px;">
                            <option value="">Select category...</option>
                            ${state.categories.filter(c => c.slug !== 'uncategorized').map(c =>
                                `<option value="${c.id}">${c.name}</option>`
                            ).join('')}
                        </select>
                        <button class="btn btn-sm btn-primary" onclick="applyBulkCategorize()">Apply</button>
                        <label style="margin-left: 15px; font-size: 0.85rem;">
                            <input type="checkbox" id="bulk-create-rule"> Create rule
                        </label>
                    </div>
                    <div class="select-all-row">
                        <label>
                            <input type="checkbox" id="select-all-transactions" onchange="toggleSelectAll(this)">
                            Select All
                        </label>
                    </div>
                ` : ''}
                ${filtered.map(t => {
                    const account = state.accounts.find(a => a.id === t.account_id);
                    const accountName = account ? account.account_name : 'Unknown';
                    return `
                    <div class="category-transaction-item ${isUncategorized ? 'selectable' : 'editable'}">
                        ${isUncategorized ? `
                            <input type="checkbox" class="transaction-checkbox" data-id="${t.id}" onclick="event.stopPropagation(); updateBulkSelection()">
                        ` : ''}
                        <div class="transaction-date">${formatDate(t.transaction_date)}</div>
                        <div class="transaction-desc" onclick="${isUncategorized ? `toggleTransactionSelect(event, ${t.id})` : `showEditTransaction(${t.id})`}" style="cursor: pointer;">${t.description}</div>
                        <div class="transaction-account">${accountName}</div>
                        <div class="transaction-amount ${t.transaction_type === 'credit' ? 'text-success' : 'text-danger'}">
                            ${t.transaction_type === 'credit' ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                        </div>
                        <div class="transaction-actions">
                            <button class="move-category-btn" onclick="event.stopPropagation(); showMoveCategory(${t.id}, '${escapeHtml(t.description)}', ${categoryId})">
                                Move
                            </button>
                            <button class="btn btn-xs btn-outline edit-btn" onclick="event.stopPropagation(); showEditTransaction(${t.id})">
                                Edit
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    openModal(`${icon} ${categoryName}`, `
        <div class="category-detail-summary">
            <div class="summary-item">
                <span class="summary-label">Total Transactions</span>
                <span class="summary-value">${transactions.length}${searchQuery ? ` (${filtered.length} shown)` : ''}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Total Amount</span>
                <span class="summary-value ${total >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(Math.abs(total))}</span>
            </div>
        </div>
        ${toolbarHtml}
        ${smartSuggestHtml}
        <h4 style="margin: 20px 0 10px; font-size: 0.9rem; color: var(--text-secondary);">
            ${isUncategorized ? 'Select transactions to categorize' : 'Transactions (click Move to change category)'}
        </h4>
        ${transactionsHtml}
        ${canDelete ? `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color); text-align: right;">
                <button class="btn btn-danger" onclick="deleteCategory(${categoryId}, '${categoryName}', ${transactionCount})">
                    Delete Category
                </button>
            </div>
        ` : ''}
    `, 'modal-lg');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, "\\'");
}

function handleCategoryDetailSearch(value) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        categoryDetailState.searchQuery = value;
        renderCategoryDetailModal();
        setTimeout(() => {
            const input = document.getElementById('cd-modal-search');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }, 10);
    }, 300);
}

function sortCategoryDetail(field) {
    if (categoryDetailState.sortBy === field) {
        categoryDetailState.sortOrder = categoryDetailState.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
        categoryDetailState.sortBy = field;
        categoryDetailState.sortOrder = 'desc';
    }
    renderCategoryDetailModal();
}

function buildSmartSuggestions(transactions) {
    const patterns = {};

    transactions.forEach(t => {
        const desc = t.description.toUpperCase();
        const words = desc.split(/\s+/);
        if (words.length > 0) {
            const pattern = words.slice(0, 2).join(' ').trim();
            if (pattern.length >= 3) {
                if (!patterns[pattern]) {
                    patterns[pattern] = { count: 0, transactions: [] };
                }
                patterns[pattern].count++;
                patterns[pattern].transactions.push(t.id);
            }
        }
    });

    return Object.entries(patterns)
        .filter(([_, data]) => data.count >= 2)
        .map(([pattern, data]) => ({
            pattern,
            count: data.count,
            transactionIds: data.transactions
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
}

// =====================================================
// Transaction Edit/Move Functions
// =====================================================

function showQuickCategorize(transactionId, description) {
    openModal('🏷️ Quick Categorize', `
        <div class="quick-categorize-form">
            <div class="form-group">
                <label>Transaction</label>
                <div class="transaction-preview">${description}</div>
            </div>
            <div class="form-group">
                <label>Select Category</label>
                <select id="quick-category-select" class="form-select">
                    <option value="">Choose category...</option>
                    ${buildHierarchicalCategoryOptions(false)}
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="quick-create-rule" checked>
                    Create rule for similar transactions
                </label>
                <div class="rule-preview" id="rule-preview" style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                    Rule: description contains "${description.split(' ').slice(0, 3).join(' ')}"
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="applyQuickCategorize(${transactionId})">Apply</button>
            </div>
        </div>
    `);
}

async function showEditTransaction(transactionId) {
    let transaction = state.categoryDetailTransactions?.find(t => t.id === transactionId);

    if (!transaction) {
        showLoading();
        const data = await apiGet('/transactions/', {
            user_id: state.currentUser,
            id: transactionId
        });
        hideLoading();

        if (data.success && data.data.transactions?.length > 0) {
            transaction = data.data.transactions[0];
        } else {
            showToast('Transaction not found', 'error');
            return;
        }
    }

    const receiptsData = await apiGet('/receipts/', { transaction_id: transactionId });
    const receipts = receiptsData.success ? receiptsData.data.receipts : [];

    const categoryOptions = buildHierarchicalCategoryOptionsWithSelected(transaction.category_id);

    const reimbursementStatusOptions = `
        <option value="" ${!transaction.reimbursement_status ? 'selected' : ''}>Not Reimbursable</option>
        <option value="pending" ${transaction.reimbursement_status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="submitted" ${transaction.reimbursement_status === 'submitted' ? 'selected' : ''}>Submitted</option>
        <option value="reimbursed" ${transaction.reimbursement_status === 'reimbursed' ? 'selected' : ''}>Reimbursed</option>
    `;

    const receiptsHtml = receipts.length > 0 ? `
        <div class="attached-receipts" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            ${receipts.map(r => `
                <div class="receipt-thumb" style="position: relative; width: 60px; height: 60px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color); cursor: pointer;" onclick="viewReceiptFromTransaction(${r.id})">
                    ${r.file_type.startsWith('image/')
                        ? `<img src="${API_BASE}/../${r.file_path}" style="width: 100%; height: 100%; object-fit: cover;">`
                        : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); font-size: 20px;">📄</div>`
                    }
                    <button type="button" onclick="event.stopPropagation(); detachReceiptFromTransaction(${r.id}, ${transactionId})" style="position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%; background: var(--color-danger); border: none; color: white; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&#215;</button>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color: var(--text-secondary); font-size: 13px; margin-top: 8px;">No receipts attached</p>';

    openModal('Edit Transaction', `
        <form id="edit-transaction-form" onsubmit="saveTransaction(event, ${transactionId})">
            <div class="form-group">
                <label>Date</label>
                <input type="date" class="form-control" id="edit-txn-date" value="${transaction.transaction_date && transaction.transaction_date !== '0000-00-00' ? transaction.transaction_date : ''}" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <input type="text" class="form-control" id="edit-txn-desc" value="${escapeHtml(transaction.description)}" required>
            </div>
            <div class="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" class="form-control" id="edit-txn-amount" value="${Math.abs(transaction.amount)}" required>
            </div>
            <div class="form-group">
                <label>Type</label>
                <select class="form-control" id="edit-txn-type" onchange="toggleTransferAccountField()">
                    <option value="debit" ${transaction.transaction_type === 'debit' ? 'selected' : ''}>Expense (Debit)</option>
                    <option value="credit" ${transaction.transaction_type === 'credit' ? 'selected' : ''}>Income (Credit)</option>
                    <option value="transfer" ${transaction.transaction_type === 'transfer' ? 'selected' : ''}>Transfer</option>
                </select>
            </div>
            <div class="form-group" id="transfer-account-group" style="display: ${transaction.transaction_type === 'transfer' ? 'block' : 'none'};">
                <label>Transfer From (Bank Account)</label>
                <select class="form-control" id="edit-txn-transfer-account">
                    <option value="">Select bank account...</option>
                </select>
                <small style="color: var(--text-secondary); font-size: 12px;">Select the bank account this payment came from</small>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select class="form-control" id="edit-txn-category">
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Memo (Optional)</label>
                <textarea class="form-control" id="edit-txn-memo" rows="2">${escapeHtml(transaction.memo || '')}</textarea>
            </div>

            <div class="form-group" style="border-top: 1px solid var(--border-color); padding-top: 15px; margin-top: 15px;">
                <label>Reimbursement Status</label>
                <select class="form-control" id="edit-txn-reimbursement">
                    ${reimbursementStatusOptions}
                </select>
            </div>

            <div class="form-group" style="border-top: 1px solid var(--border-color); padding-top: 15px; margin-top: 15px;">
                <label style="display: flex; align-items: center; justify-content: space-between;">
                    <span>Receipts</span>
                    <button type="button" class="btn btn-sm btn-outline" onclick="uploadReceiptForTransaction(${transactionId})" style="font-size: 12px; padding: 4px 10px;">
                        + Add Receipt
                    </button>
                </label>
                <div id="txn-receipts-container">
                    ${receiptsHtml}
                </div>
            </div>

            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" style="flex: 1;">Save Changes</button>
                <button type="button" class="btn btn-danger" onclick="deleteTransactionFromCategories(${transactionId})">Delete</button>
            </div>
        </form>
    `);

    // Load bank accounts for transfer dropdown
    loadTransferAccountsForEdit(transaction.transfer_account_id);
}

// Load bank accounts for transfer dropdown in edit modal
async function loadTransferAccountsForEdit(currentTransferAccountId) {
    try {
        const response = await apiGet('/accounts/', { user_id: state.currentUser, include_inactive: 1 });
        if (response.success && response.data.accounts) {
            const select = document.getElementById('edit-txn-transfer-account');
            if (select) {
                select.innerHTML = '<option value="">Select bank account...</option>';
                // Only show checking/savings accounts
                const bankAccounts = response.data.accounts.filter(a =>
                    a.account_type === 'checking' || a.account_type === 'savings'
                );
                bankAccounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = account.account_name + (account.is_active == 1 ? '' : ' (inactive)');
                    if (currentTransferAccountId && account.id == currentTransferAccountId) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load transfer accounts:', error);
    }
}

// Toggle transfer account field visibility based on transaction type
function toggleTransferAccountField() {
    const type = document.getElementById('edit-txn-type')?.value;
    const transferGroup = document.getElementById('transfer-account-group');
    if (transferGroup) {
        transferGroup.style.display = type === 'transfer' ? 'block' : 'none';
    }
}

async function saveTransaction(event, transactionId) {
    event.preventDefault();

    const date = document.getElementById('edit-txn-date').value;
    const description = document.getElementById('edit-txn-desc').value;
    const amount = parseFloat(document.getElementById('edit-txn-amount').value);
    const type = document.getElementById('edit-txn-type').value;
    const categoryId = parseInt(document.getElementById('edit-txn-category').value);
    const memo = document.getElementById('edit-txn-memo').value;
    const reimbursementStatus = document.getElementById('edit-txn-reimbursement')?.value || null;
    const transferAccountId = document.getElementById('edit-txn-transfer-account')?.value || null;

    showLoading();

    const updateData = {
        id: transactionId,
        transaction_date: date,
        description: description,
        amount: type === 'debit' || type === 'transfer' ? -Math.abs(amount) : Math.abs(amount),
        transaction_type: type,
        category_id: categoryId,
        memo: memo,
        reimbursement_status: reimbursementStatus
    };

    // Include transfer_account_id for transfer transactions
    if (type === 'transfer') {
        updateData.transfer_account_id = transferAccountId ? parseInt(transferAccountId) : null;
    }

    const result = await apiPost('/transactions/update.php', updateData);

    hideLoading();

    if (result.success) {
        showToast('Transaction updated!', 'success');
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

async function deleteTransactionFromCategories(transactionId) {
    if (!confirm('Are you sure you want to delete this transaction?')) {
        return;
    }

    showLoading();

    const result = await apiDelete('/transactions/', { id: transactionId });

    hideLoading();

    if (result.success) {
        showToast('Transaction deleted!', 'success');
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

function showMoveCategory(transactionId, description, currentCategoryId) {
    openModal('Move to Category', `
        <div style="margin-bottom: 15px;">
            <strong>Transaction:</strong><br>
            <span style="color: var(--text-secondary);">${description}</span>
        </div>
        <div class="form-group">
            <label>Select New Category</label>
            <select class="form-control" id="move-category-select">
                <option value="">Choose category...</option>
                ${buildHierarchicalCategoryOptions(false)}
            </select>
        </div>
        <div class="form-group">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="move-create-rule">
                Create rule for similar transactions
            </label>
        </div>
        <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px;">
            <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" style="flex: 1;" onclick="applyMoveCategory(${transactionId})">
                Move Transaction
            </button>
        </div>
    `);
}

async function applyMoveCategory(transactionId) {
    const categoryId = document.getElementById('move-category-select').value;
    const createRule = document.getElementById('move-create-rule').checked;

    if (!categoryId) {
        showToast('Please select a category', 'warning');
        return;
    }

    showLoading();

    const result = await apiPost('/transactions/update.php', {
        id: transactionId,
        category_id: parseInt(categoryId),
        create_rule: createRule
    });

    hideLoading();

    if (result.success) {
        showToast('Transaction moved!', 'success');
        if (result.data.rule_created) {
            showToast('Rule created for similar transactions', 'info');
        }
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

async function applyQuickCategorize(transactionId) {
    const categoryId = document.getElementById('quick-category-select').value;
    const createRule = document.getElementById('quick-create-rule').checked;

    if (!categoryId) {
        showToast('Please select a category', 'warning');
        return;
    }

    showLoading();

    const result = await apiPost('/transactions/update.php', {
        id: transactionId,
        category_id: parseInt(categoryId),
        create_rule: createRule
    });

    hideLoading();

    if (result.success) {
        showToast('Transaction categorized!', 'success');
        if (result.data.rule_created) {
            showToast('Rule created for similar transactions', 'info');
        }
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

function toggleTransactionSelect(event, transactionId) {
    if (event.target.type === 'checkbox' || event.target.classList.contains('quick-categorize-btn')) {
        return;
    }

    const checkbox = event.currentTarget.querySelector('.transaction-checkbox');
    checkbox.checked = !checkbox.checked;
    updateBulkSelection();
}

function toggleSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.transaction-checkbox');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    updateBulkSelection();
}

function updateBulkSelection() {
    const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
    const count = checkboxes.length;
    const bulkBar = document.getElementById('bulk-actions-bar');
    const countSpan = document.getElementById('selected-count');

    state.selectedTransactionIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    if (count > 0) {
        bulkBar.style.display = 'flex';
        countSpan.textContent = `${count} selected`;
    } else {
        bulkBar.style.display = 'none';
    }
}

async function applyBulkCategorize() {
    const categoryId = document.getElementById('bulk-category-select').value;
    const createRule = document.getElementById('bulk-create-rule').checked;

    if (!categoryId) {
        showToast('Please select a category', 'warning');
        return;
    }

    if (state.selectedTransactionIds.length === 0) {
        showToast('No transactions selected', 'warning');
        return;
    }

    showLoading();

    const result = await apiPost('/transactions/bulk-update.php', {
        transaction_ids: state.selectedTransactionIds,
        category_id: parseInt(categoryId),
        create_rule: createRule
    });

    hideLoading();

    if (result.success) {
        showToast(`${result.data.updated} transactions categorized!`, 'success');
        if (result.data.rule_created) {
            showToast('Rule created for similar transactions', 'info');
        }
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

async function applySuggestion(pattern, count) {
    openModal('💡 Apply Suggestion', `
        <div class="suggestion-apply-form">
            <div class="form-group">
                <label>Pattern Found</label>
                <div class="pattern-preview">"${pattern}" - ${count} transactions</div>
            </div>
            <div class="form-group">
                <label>Select Category</label>
                <select id="suggestion-category-select" class="form-select">
                    <option value="">Choose category...</option>
                    ${buildHierarchicalCategoryOptions(false)}
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="suggestion-create-rule" checked>
                    Create rule for future transactions
                </label>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="applySuggestionCategory('${escapeHtml(pattern)}')">
                    Apply to ${count} transactions
                </button>
            </div>
        </div>
    `);
}

async function applySuggestionCategory(pattern) {
    const categoryId = document.getElementById('suggestion-category-select').value;
    const createRule = document.getElementById('suggestion-create-rule').checked;

    if (!categoryId) {
        showToast('Please select a category', 'warning');
        return;
    }

    showLoading();

    const result = await apiPost('/transactions/bulk-categorize-pattern.php', {
        user_id: state.currentUser,
        pattern: pattern,
        category_id: parseInt(categoryId),
        create_rule: createRule
    });

    hideLoading();

    if (result.success) {
        showToast(`${result.data.updated} transactions categorized!`, 'success');
        if (result.data.rule_created) {
            showToast('Rule created: ' + pattern, 'info');
        }
        closeModal();
        await loadPageData(state.currentPage);
    } else {
        showToast('Error: ' + result.message, 'error');
    }
}

// =====================================================
// Add/Edit Category Modal
// =====================================================

function showAddCategoryModal(parentId = null, parentType = null, editCategory = null) {
    const isEdit = editCategory !== null;

    const parentCategories = state.categories.filter(c => !c.parent_id && c.slug !== 'uncategorized');

    const parentOptions = parentCategories.map(c =>
        `<option value="${c.id}" data-type="${c.category_type}" ${c.id === parentId ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    const modalTitle = isEdit ? 'Edit Account' : (parentId ? 'Add Sub-account' : 'Add Account');
    const buttonText = isEdit ? 'Save Changes' : 'Create Account';
    const defaultColor = isEdit ? (editCategory.color || '#3b82f6') : '#3b82f6';
    const defaultName = isEdit ? editCategory.name : '';
    const defaultType = isEdit ? editCategory.category_type : (parentType || 'expense');

    openModal(modalTitle, `
        <form id="add-category-form">
            <div class="form-group">
                <label>Account Name</label>
                <input type="text" class="form-input" name="name" value="${defaultName}" required>
            </div>
            <div class="form-group">
                <label>Parent Account (Optional)</label>
                <select class="form-select" name="parent_id" id="parent-category-select">
                    <option value="">-- None (Top Level) --</option>
                    ${parentOptions}
                </select>
            </div>
            <div class="form-group" id="type-group">
                <label>Type</label>
                <select class="form-select" name="category_type" id="category-type-select" required>
                    <option value="expense" ${defaultType === 'expense' ? 'selected' : ''}>Expense</option>
                    <option value="income" ${defaultType === 'income' ? 'selected' : ''}>Income</option>
                    <option value="transfer" ${defaultType === 'transfer' ? 'selected' : ''}>Transfer</option>
                    <option value="other" ${defaultType === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" name="color" value="${defaultColor}">
            </div>
            <button type="submit" class="btn btn-primary btn-block">${buttonText}</button>
        </form>
    `);

    const parentSelect = document.getElementById('parent-category-select');
    const typeSelect = document.getElementById('category-type-select');
    const typeGroup = document.getElementById('type-group');

    if (parentId && parentType) {
        typeSelect.value = parentType;
        typeGroup.style.display = 'none';
    }

    parentSelect.onchange = () => {
        const selectedOption = parentSelect.options[parentSelect.selectedIndex];
        if (selectedOption.value) {
            const parentType = selectedOption.dataset.type;
            typeSelect.value = parentType;
            typeGroup.style.display = 'none';
        } else {
            typeGroup.style.display = 'block';
        }
    };

    document.getElementById('add-category-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        if (isEdit) {
            const result = await apiRequest('/categories/update.php', 'POST', {
                id: editCategory.id,
                user_id: state.currentUser,
                name: formData.get('name'),
                category_type: formData.get('category_type'),
                color: formData.get('color'),
                parent_id: formData.get('parent_id') || null
            });

            if (result.success) {
                showToast('Account updated successfully', 'success');
                closeModal();
                await loadCategories(true);
            } else {
                showToast('Error updating account', 'error');
            }
        } else {
            const result = await apiPost('/categories/', {
                user_id: state.currentUser,
                name: formData.get('name'),
                category_type: formData.get('category_type'),
                color: formData.get('color'),
                parent_id: formData.get('parent_id') || null
            });

            if (result.success) {
                showToast('Account created successfully', 'success');
                closeModal();
                await loadCategories(true);
            } else {
                showToast('Error creating account', 'error');
            }
        }
    };
}

// =====================================================
// Expose Functions to Window (for HTML onclick handlers)
// =====================================================

window.loadCategories = loadCategories;
window.setupCoaEventListeners = setupCoaEventListeners;
window.expandAllCategories = expandAllCategories;
window.collapseAllCategories = collapseAllCategories;
window.renderChartOfAccounts = renderChartOfAccounts;
window.handleCategoryDragStart = handleCategoryDragStart;
window.handleCategoryDragOver = handleCategoryDragOver;
window.handleCategoryDragEnd = handleCategoryDragEnd;
window.handleCategoryDrop = handleCategoryDrop;
window.startInlineEdit = startInlineEdit;
window.updateCategoryName = updateCategoryName;
window.handleCategoryParentClick = handleCategoryParentClick;
window.selectCategory = selectCategory;
window.selectTrustSubAccount = selectTrustSubAccount;
window.loadTrustSubAccountDetail = loadTrustSubAccountDetail;
window.loadTrustTransactions = loadTrustTransactions;
window.loadCategoryDetail = loadCategoryDetail;
window.loadDetailTransactions = loadDetailTransactions;
window.renderDetailTransactions = renderDetailTransactions;
window.handleDetailSearch = handleDetailSearch;
window.handleDetailSort = handleDetailSort;
window.toggleDetailTxnSelect = toggleDetailTxnSelect;
window.selectAllTransactions = selectAllTransactions;
window.deselectAllTransactions = deselectAllTransactions;
window.getFilteredTransactions = getFilteredTransactions;
window.updateBulkCategorizeButton = updateBulkCategorizeButton;
window.deleteSelectedDetailTransactions = deleteSelectedDetailTransactions;
window.openBulkCategorizeModal = openBulkCategorizeModal;
window.closeBulkCategorizeModal = closeBulkCategorizeModal;
window.populateBulkCategorySelect = populateBulkCategorySelect;
window.executeBulkCategorize = executeBulkCategorize;
window.toggleRuleSettings = toggleRuleSettings;
window.checkExistingRules = checkExistingRules;
window.handleParentRowClick = handleParentRowClick;
window.handleCoaParentClick = handleCoaParentClick;
window.handleCoaParentDblClick = handleCoaParentDblClick;
window.getDetailType = getDetailType;
window.toggleCoaExpand = toggleCoaExpand;
window.toggleCoaActionMenu = toggleCoaActionMenu;
window.editCategory = editCategory;
window.renderCategories = renderCategories;
window.getCategoryIcon = getCategoryIcon;
window.deleteCategory = deleteCategory;
window.showCategoryDetail = showCategoryDetail;
window.renderCategoryDetailModal = renderCategoryDetailModal;
window.escapeHtml = escapeHtml;
window.handleCategoryDetailSearch = handleCategoryDetailSearch;
window.sortCategoryDetail = sortCategoryDetail;
window.buildSmartSuggestions = buildSmartSuggestions;
window.showQuickCategorize = showQuickCategorize;
window.showEditTransaction = showEditTransaction;
window.saveTransaction = saveTransaction;
window.loadTransferAccountsForEdit = loadTransferAccountsForEdit;
window.toggleTransferAccountField = toggleTransferAccountField;
window.deleteTransactionFromCategories = deleteTransactionFromCategories;
window.showMoveCategory = showMoveCategory;
window.applyMoveCategory = applyMoveCategory;
window.applyQuickCategorize = applyQuickCategorize;
window.toggleTransactionSelect = toggleTransactionSelect;
window.toggleSelectAll = toggleSelectAll;
window.updateBulkSelection = updateBulkSelection;
window.applyBulkCategorize = applyBulkCategorize;
window.applySuggestion = applySuggestion;
window.applySuggestionCategory = applySuggestionCategory;
window.showAddCategoryModal = showAddCategoryModal;
window.toggleIoltaExpand = toggleIoltaExpand;

// Export state for external access
window.coaState = coaState;
window.detailPanelState = detailPanelState;
window.categoryDetailState = categoryDetailState;
