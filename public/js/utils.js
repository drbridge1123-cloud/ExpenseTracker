/**
 * Utility Functions for Expense Tracker
 */

// Format currency (USD)
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Format date
export function formatDate(dateString, format = 'default') {
    if (!dateString) return '';
    const date = new Date(dateString);

    // Check for invalid date
    if (isNaN(date.getTime())) return dateString;

    if (format === 'short') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (format === 'long') {
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else if (format === 'input') {
        return date.toISOString().split('T')[0];
    }

    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format date for two-line display (Month Day / Year)
export function formatDateTwoLines(dateString) {
    if (!dateString) return { main: '', year: '' };
    const date = new Date(dateString);

    if (isNaN(date.getTime())) return { main: dateString, year: '' };

    return {
        main: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        year: date.getFullYear().toString()
    };
}

// Format date to ISO (YYYY-MM-DD)
export function formatDateISO(date) {
    if (!date) return '';
    if (typeof date === 'string') date = new Date(date);
    return date.toISOString().split('T')[0];
}

// Capitalize first letter
export function capitalizeFirst(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function (m) { return map[m]; });
}

// Generate a random ID
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Debounce function for search inputs
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// UI Helpers
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

export function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('active');
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

// =====================================================
// Legacy Compatibility
// =====================================================
// Make functions globally available so app.js can use them without being a module yet
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTwoLines = formatDateTwoLines;
window.formatDateISO = formatDateISO;
window.capitalizeFirst = capitalizeFirst;
window.escapeHtml = escapeHtml;
window.generateId = generateId;
window.debounce = debounce;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
