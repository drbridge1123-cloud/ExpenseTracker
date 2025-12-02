// =====================================================
// Admin Panel Module
// =====================================================
// Dependencies: state, API_BASE, formatDate, showToast

// State
if (!window._adminState) {
    window._adminState = {
        adminUsersData: []
    };
}
const adminState = window._adminState;

let adminUsersData = adminState.adminUsersData;

// =====================================================
// Main Functions
// =====================================================

async function loadAdminPage() {
    try {
        const response = await fetch(`${API_BASE}/admin/`, {
            credentials: 'include'
        });
        const result = await response.json();

        if (result.success) {
            adminUsersData = result.data.users || [];
            adminState.adminUsersData = adminUsersData;
            renderAdminStats(result.data.stats);
            renderAdminUsers(adminUsersData);
        } else {
            showToast(result.message || 'Failed to load admin data', 'error');
        }
    } catch (error) {
        console.error('Admin load error:', error);
        showToast('Error loading admin data', 'error');
    }
}

function renderAdminStats(stats) {
    if (!stats) return;

    const totalUsersEl = document.getElementById('stat-total-users');
    const activeUsersEl = document.getElementById('stat-active-users');
    const adminUsersEl = document.getElementById('stat-admin-users');
    const totalTxnEl = document.getElementById('stat-total-transactions');

    if (totalUsersEl) totalUsersEl.textContent = stats.total_users || 0;
    if (activeUsersEl) activeUsersEl.textContent = stats.active_users || 0;
    if (adminUsersEl) adminUsersEl.textContent = stats.admin_users || 0;
    if (totalTxnEl) totalTxnEl.textContent = formatNumber(stats.total_transactions || 0);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function renderAdminUsers(users) {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state">No users found</div>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="admin-user-card ${user.is_active ? '' : 'inactive'}">
            <div class="user-avatar-large">${(user.display_name || user.username).charAt(0).toUpperCase()}</div>
            <div class="user-card-info">
                <div class="user-card-name">
                    ${user.display_name || user.username}
                    ${user.is_admin ? '<span class="badge badge-admin">Admin</span>' : ''}
                    ${!user.is_active ? '<span class="badge badge-inactive">Inactive</span>' : ''}
                </div>
                <div class="user-card-email">${user.email}</div>
                <div class="user-card-meta">
                    <span>@${user.username}</span>
                    <span>•</span>
                    <span>${user.transaction_count || 0} transactions</span>
                    <span>•</span>
                    <span>${user.account_count || 0} accounts</span>
                    ${user.last_login ? `<span>• Last login: ${formatDate(user.last_login)}</span>` : ''}
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-sm btn-secondary" onclick="editUser(${user.id})">Edit</button>
                <button class="btn btn-sm btn-secondary" onclick="openResetPasswordModal(${user.id}, '${user.username}')">Reset Password</button>
                <button class="btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleUserActive(${user.id})">
                    ${user.is_active ? 'Deactivate' : 'Activate'}
                </button>
                ${user.id != state.currentUser ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id}, '${user.username}')">Delete</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openUserModal(userId = null) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const title = document.getElementById('user-modal-title');
    const passwordHint = document.getElementById('password-hint');

    form.reset();
    document.getElementById('edit-user-id').value = '';

    if (userId) {
        title.textContent = 'Edit User';
        passwordHint.textContent = '(leave blank to keep current)';
        document.getElementById('edit-password').required = false;

        const user = adminUsersData.find(u => u.id == userId);
        if (user) {
            document.getElementById('edit-user-id').value = user.id;
            document.getElementById('edit-username').value = user.username;
            document.getElementById('edit-email').value = user.email;
            document.getElementById('edit-display-name').value = user.display_name || '';
            document.getElementById('edit-is-active').checked = user.is_active == 1;
            document.getElementById('edit-is-admin').checked = user.is_admin == 1;
        }
    } else {
        title.textContent = 'Add User';
        passwordHint.textContent = '(required for new user)';
        document.getElementById('edit-password').required = true;
        document.getElementById('edit-is-active').checked = true;
    }

    modal.classList.add('active');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.remove('active');
}

async function saveUser(event) {
    event.preventDefault();

    const id = document.getElementById('edit-user-id').value;
    const data = {
        username: document.getElementById('edit-username').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        display_name: document.getElementById('edit-display-name').value.trim(),
        is_active: document.getElementById('edit-is-active').checked ? 1 : 0,
        is_admin: document.getElementById('edit-is-admin').checked ? 1 : 0
    };

    const password = document.getElementById('edit-password').value;
    if (password) {
        data.password = password;
    }

    if (id) {
        data.id = parseInt(id);
    }

    try {
        const response = await fetch(`${API_BASE}/admin/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message || 'User saved', 'success');
            closeUserModal();
            await loadAdminPage();
        } else {
            showToast(result.message || 'Failed to save user', 'error');
        }
    } catch (error) {
        console.error('Save user error:', error);
        showToast('Error saving user', 'error');
    }
}

function editUser(userId) {
    openUserModal(userId);
}

async function toggleUserActive(userId) {
    try {
        const response = await fetch(`${API_BASE}/admin/?action=toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: userId })
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            await loadAdminPage();
        } else {
            showToast(result.message || 'Failed to toggle user status', 'error');
        }
    } catch (error) {
        console.error('Toggle user error:', error);
        showToast('Error updating user', 'error');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This will delete all their data and cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/?id=${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            await loadAdminPage();
        } else {
            showToast(result.message || 'Failed to delete user', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('Error deleting user', 'error');
    }
}

function openResetPasswordModal(userId, username) {
    document.getElementById('reset-user-id').value = userId;
    document.getElementById('reset-username').textContent = username;
    document.getElementById('reset-password-form').reset();
    document.getElementById('reset-password-modal').classList.add('active');
}

function closeResetPasswordModal() {
    document.getElementById('reset-password-modal').classList.remove('active');
}

async function submitResetPassword(event) {
    event.preventDefault();

    const userId = document.getElementById('reset-user-id').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/?action=reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: parseInt(userId), password: newPassword })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Password reset successfully', 'success');
            closeResetPasswordModal();
        } else {
            showToast(result.message || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Reset password error:', error);
        showToast('Error resetting password', 'error');
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadAdminPage = loadAdminPage;
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.saveUser = saveUser;
window.editUser = editUser;
window.toggleUserActive = toggleUserActive;
window.deleteUser = deleteUser;
window.openResetPasswordModal = openResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.submitResetPassword = submitResetPassword;
