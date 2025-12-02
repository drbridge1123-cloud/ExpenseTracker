// =====================================================
// Custom Report Builder Module
// =====================================================
// Dependencies: state, apiGet, apiPost, showToast, showLoading, hideLoading, formatCurrency, getCategoryIcon

// State
if (!window._customReportState) {
    window._customReportState = {
        selectedCategories: new Set(),
        reportData: null
    };
}
const customReportState = window._customReportState;

// =====================================================
// Main Functions
// =====================================================

async function initCustomReport() {
    // Load categories if not available
    if (!state.categories || state.categories.length === 0) {
        const catData = await apiGet('/categories/', {
            user_id: state.currentUser,
            include_stats: '1'
        });
        if (catData.success) {
            state.categories = catData.data.categories;
        }
    }
    renderCRCategoryList();

    // Period selector
    const periodSelect = document.getElementById('cr-period');
    if (periodSelect) {
        periodSelect.onchange = () => {
            const customDates = document.getElementById('cr-custom-dates');
            customDates.style.display = periodSelect.value === 'custom' ? 'flex' : 'none';
        };
    }

    // Select All / Clear buttons (remove old listeners first by cloning)
    const selectAllBtn = document.getElementById('cr-select-all');
    const selectNoneBtn = document.getElementById('cr-select-none');
    const generateBtn = document.getElementById('cr-generate');

    if (selectAllBtn && !selectAllBtn.dataset.initialized) {
        selectAllBtn.dataset.initialized = 'true';
        selectAllBtn.addEventListener('click', () => {
            state.categories.forEach(cat => customReportState.selectedCategories.add(cat.id));
            renderCRCategoryList();
            updateSelectedCount();
        });
    }

    if (selectNoneBtn && !selectNoneBtn.dataset.initialized) {
        selectNoneBtn.dataset.initialized = 'true';
        selectNoneBtn.addEventListener('click', () => {
            customReportState.selectedCategories.clear();
            renderCRCategoryList();
            updateSelectedCount();
        });
    }

    // Generate button
    if (generateBtn && !generateBtn.dataset.initialized) {
        generateBtn.dataset.initialized = 'true';
        generateBtn.addEventListener('click', generateCustomReport);
    }
}

function renderCRCategoryList() {
    const container = document.getElementById('cr-category-list');
    if (!container || !state.categories) return;

    // Group categories by parent
    const parents = state.categories.filter(c => !c.parent_id || c.parent_id == 0);
    const childrenByParent = {};

    state.categories.forEach(cat => {
        if (cat.parent_id && cat.parent_id != 0) {
            if (!childrenByParent[cat.parent_id]) {
                childrenByParent[cat.parent_id] = [];
            }
            childrenByParent[cat.parent_id].push(cat);
        }
    });

    let html = '';

    parents.forEach(parent => {
        const children = childrenByParent[parent.id] || [];
        const isChecked = customReportState.selectedCategories.has(parent.id);
        const icon = getCategoryIcon(parent.icon);

        html += `
            <div class="cr-category-group">
                <div class="cr-category-parent" onclick="toggleCRCategory(${parent.id}, event)">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} data-id="${parent.id}">
                    <span class="cr-category-icon">${icon}</span>
                    <span class="cr-category-name">${parent.name}</span>
                    <span class="cr-category-type ${parent.category_type}">${parent.category_type}</span>
                </div>
        `;

        if (children.length > 0) {
            html += '<div class="cr-category-children">';
            children.forEach(child => {
                const childChecked = customReportState.selectedCategories.has(child.id);
                html += `
                    <div class="cr-category-child" onclick="toggleCRCategory(${child.id}, event)">
                        <input type="checkbox" ${childChecked ? 'checked' : ''} data-id="${child.id}">
                        <span class="cr-category-name">${child.name}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += '</div>';
    });

    container.innerHTML = html;
}

function toggleCRCategory(categoryId, event) {
    event.stopPropagation();

    if (customReportState.selectedCategories.has(categoryId)) {
        customReportState.selectedCategories.delete(categoryId);
    } else {
        customReportState.selectedCategories.add(categoryId);
    }

    // Update checkbox
    const checkbox = document.querySelector(`.cr-category-list input[data-id="${categoryId}"]`);
    if (checkbox) {
        checkbox.checked = customReportState.selectedCategories.has(categoryId);
    }

    updateSelectedCount();
}

function updateSelectedCount() {
    const countEl = document.getElementById('cr-selected-count');
    if (countEl) {
        const count = customReportState.selectedCategories.size;
        countEl.textContent = `${count} selected`;
    }
}

async function generateCustomReport() {
    const categoryIds = Array.from(customReportState.selectedCategories);

    if (categoryIds.length === 0) {
        showToast('Please select at least one category', 'error');
        return;
    }

    const period = document.getElementById('cr-period').value;
    const startDate = document.getElementById('cr-start-date')?.value;
    const endDate = document.getElementById('cr-end-date')?.value;

    showLoading();

    const result = await apiPost('/reports/custom.php', {
        user_id: state.currentUser,
        category_ids: categoryIds,
        period: period,
        start_date: startDate,
        end_date: endDate
    });

    hideLoading();

    if (result.success) {
        customReportState.reportData = result.data;
        renderCustomReportResults(result.data);
    } else {
        showToast(result.message || 'Failed to generate report', 'error');
    }
}

function renderCustomReportResults(data) {
    const container = document.getElementById('cr-results');
    if (!container) return;

    const { summary, categories, monthly_trend, pie_chart, period } = data;

    // Generate pie chart SVG
    const pieChartSVG = generatePieChartSVG(pie_chart);

    // Generate bar chart for monthly trend (last 6 months)
    const recentMonths = monthly_trend.slice(-6);
    const maxMonthlyValue = Math.max(...recentMonths.map(m => Math.max(m.income, m.expense))) || 1;

    let barChartHTML = '';
    recentMonths.forEach(month => {
        const expensePct = (month.expense / maxMonthlyValue) * 100;
        barChartHTML += `
            <div class="cr-bar-item">
                <div class="cr-bar-label">${month.label}</div>
                <div class="cr-bar-track">
                    <div class="cr-bar-fill expense" style="width: ${expensePct}%"></div>
                </div>
                <div class="cr-bar-value">${formatCurrency(month.expense)}</div>
            </div>
        `;
    });

    // Generate category table rows
    let tableRows = '';
    let sortedCategories = [...categories].sort((a, b) => b.total - a.total);

    sortedCategories.forEach(cat => {
        const icon = getCategoryIcon(cat.icon);
        const avgMonthly = summary.num_months > 0 ? cat.total / summary.num_months : 0;

        tableRows += `
            <tr>
                <td>
                    <div class="cr-cat-name">
                        <span class="cr-cat-icon">${icon}</span>
                        ${cat.name}
                    </div>
                </td>
                <td><span class="cr-category-type ${cat.type}">${cat.type}</span></td>
                <td class="text-right">${formatCurrency(cat.total)}</td>
                <td class="text-right">${formatCurrency(avgMonthly)}</td>
                <td class="text-right">${cat.percentage}%</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="cr-results-content">
            <!-- Period Header -->
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 18px; font-weight: 600; color: #0f172a; margin: 0 0 4px 0;">
                    Custom Report: ${summary.num_categories} Categories
                </h3>
                <p style="font-size: 13px; color: #64748b; margin: 0;">${period.label}</p>
            </div>

            <!-- Summary Cards -->
            <div class="cr-summary-cards">
                <div class="cr-summary-card">
                    <div class="cr-summary-card-label">Total Income</div>
                    <div class="cr-summary-card-value income">${formatCurrency(summary.total_income)}</div>
                </div>
                <div class="cr-summary-card">
                    <div class="cr-summary-card-label">Total Expenses</div>
                    <div class="cr-summary-card-value expense">${formatCurrency(summary.total_expense)}</div>
                </div>
                <div class="cr-summary-card">
                    <div class="cr-summary-card-label">Monthly Avg</div>
                    <div class="cr-summary-card-value neutral">${formatCurrency(summary.avg_monthly_expense)}</div>
                </div>
                <div class="cr-summary-card">
                    <div class="cr-summary-card-label">Net</div>
                    <div class="cr-summary-card-value ${summary.net >= 0 ? 'income' : 'expense'}">
                        ${formatCurrency(summary.net)}
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="cr-charts-row">
                <!-- Pie Chart -->
                <div class="cr-chart-card">
                    <h4>Distribution by Category</h4>
                    <div class="cr-pie-chart">
                        ${pieChartSVG}
                        <div class="cr-pie-legend">
                            ${pie_chart.slice(0, 5).map(item => `
                                <div class="cr-pie-legend-item">
                                    <div class="cr-pie-legend-color" style="background: ${item.color}"></div>
                                    <div class="cr-pie-legend-name">${item.name}</div>
                                    <div class="cr-pie-legend-pct">${item.percentage}%</div>
                                </div>
                            `).join('')}
                            ${pie_chart.length > 5 ? `<div class="cr-pie-legend-item" style="color:#94a3b8;">+ ${pie_chart.length - 5} more</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Monthly Trend -->
                <div class="cr-chart-card">
                    <h4>Monthly Trend</h4>
                    <div class="cr-bar-chart">
                        ${barChartHTML}
                    </div>
                </div>
            </div>

            <!-- Category Table -->
            <div class="cr-table-section">
                <h4>Category Breakdown</h4>
                <table class="cr-table">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Type</th>
                            <th class="text-right">Total</th>
                            <th class="text-right">Monthly Avg</th>
                            <th class="text-right">% of Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="2">Total Selected</td>
                            <td class="text-right">${formatCurrency(summary.total_income + summary.total_expense)}</td>
                            <td class="text-right">${formatCurrency(summary.avg_monthly_income + summary.avg_monthly_expense)}</td>
                            <td class="text-right">100%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

function generatePieChartSVG(data) {
    if (!data || data.length === 0) {
        return '<svg class="cr-pie-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e2e8f0"/></svg>';
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
        return '<svg class="cr-pie-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e2e8f0"/></svg>';
    }

    let currentAngle = -90; // Start from top
    let paths = '';

    data.forEach(item => {
        const percentage = item.value / total;
        const angle = percentage * 360;

        if (percentage > 0) {
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;

            const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
            const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
            const x2 = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
            const y2 = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);

            const largeArc = angle > 180 ? 1 : 0;

            if (percentage >= 0.9999) {
                // Full circle
                paths += `<circle cx="50" cy="50" r="40" fill="${item.color}"/>`;
            } else {
                paths += `<path d="M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${item.color}"/>`;
            }

            currentAngle = endAngle;
        }
    });

    return `<svg class="cr-pie-svg" viewBox="0 0 100 100">${paths}</svg>`;
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.initCustomReport = initCustomReport;
window.toggleCRCategory = toggleCRCategory;
window.generateCustomReport = generateCustomReport;
