// =====================================================
// Admin Panel Module
// =====================================================
// Dependencies: state, API_BASE, formatDate, showToast

// State
if (!window._adminState) {
    window._adminState = {
        adminUsersData: [],
        roles: [],
        permissions: {}
    };
}
const adminState = window._adminState;

let adminUsersData = adminState.adminUsersData;

// =====================================================
// Main Functions
// =====================================================

async function loadAdminPage() {
    try {
        // Load admin data, roles, and permissions in parallel
        const [adminResponse, rolesResponse, permsResponse] = await Promise.all([
            fetch(`${API_BASE}/admin/`, { credentials: 'include' }),
            fetch(`${API_BASE}/admin/roles.php`, { credentials: 'include' }),
            fetch(`${API_BASE}/admin/permissions.php?grouped=true`, { credentials: 'include' })
        ]);

        const adminResult = await adminResponse.json();
        const rolesResult = await rolesResponse.json();
        const permsResult = await permsResponse.json();

        if (adminResult.success) {
            adminUsersData = adminResult.data.users || [];
            adminState.adminUsersData = adminUsersData;
            renderAdminStats(adminResult.data.stats);
            renderAdminUsers(adminUsersData);
        }

        if (rolesResult.success) {
            adminState.roles = rolesResult.data.roles || [];
            renderRolesSection();
            populateRoleSelects();
        }

        if (permsResult.success) {
            adminState.permissions = permsResult.data.permissions || {};
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

    container.innerHTML = users.map(user => {
        const role = adminState.roles.find(r => r.id == user.role_id);
        const roleName = role ? role.role_label : (user.is_admin ? 'Admin' : 'Staff');
        const roleClass = role ? role.role_name : (user.is_admin ? 'admin' : 'staff');

        return `
        <div class="admin-user-card ${user.is_active ? '' : 'inactive'}">
            <div class="user-avatar-large">${(user.display_name || user.username).charAt(0).toUpperCase()}</div>
            <div class="user-card-info">
                <div class="user-card-name">
                    ${user.display_name || user.username}
                    <span class="badge badge-role badge-${roleClass}">${roleName}</span>
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
    `}).join('');
}

// =====================================================
// Role & Permission Management
// =====================================================

function switchAdminTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `admin-tab-${tabName}`);
    });
}

function renderRolesSection() {
    const container = document.getElementById('roles-grid');
    if (!container) return;

    const roles = adminState.roles;

    if (roles.length === 0) {
        container.innerHTML = '<div class="empty-state">No roles defined</div>';
        return;
    }

    container.innerHTML = roles.map(role => {
        const permissions = role.permissions || [];
        const userCount = role.user_count || 0;

        return `
        <div class="role-card" data-role-id="${role.id}">
            <div class="role-card-header">
                <div class="role-card-title">
                    <div class="role-icon">
                        ${getRoleIcon(role.role_name)}
                    </div>
                    <div>
                        <div class="role-name">${role.role_label || role.role_name}</div>
                        <div class="role-description">${role.description || 'No description'}</div>
                    </div>
                </div>
                <div class="role-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openRoleModal(${role.id})">Edit</button>
                    ${!role.is_system ? `<button class="btn btn-sm btn-danger" onclick="deleteRole(${role.id}, '${role.role_label || role.role_name}')">Delete</button>` : ''}
                </div>
            </div>
            <div class="role-permissions-summary">
                <h5>${permissions.length} Permissions</h5>
                <div class="permissions-tags">
                    ${permissions.slice(0, 4).map(p => `<span class="permission-tag">${formatPermissionKey(p)}</span>`).join('')}
                    ${permissions.length > 4 ? `<span class="permission-tag more">+${permissions.length - 4} more</span>` : ''}
                </div>
            </div>
        </div>
    `}).join('');
}

function getRoleIcon(roleName) {
    const icons = {
        admin: '👑',
        manager: '👔',
        staff: '👤'
    };
    return icons[roleName] || '🔐';
}

function formatPermissionKey(key) {
    return key.split('.').pop().replace(/_/g, ' ');
}

function populateRoleSelects() {
    const selects = document.querySelectorAll('.role-select, #edit-user-role');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = adminState.roles.map(role =>
            `<option value="${role.id}">${role.role_label}</option>`
        ).join('');
        if (currentValue) select.value = currentValue;
    });
}

function openRoleModal(roleId = null) {
    const modal = document.getElementById('role-modal');
    const title = document.getElementById('role-modal-title');
    const form = document.getElementById('role-form');

    form.reset();
    document.getElementById('edit-role-id').value = '';

    // First render permissions grid, then set checked state
    renderPermissionsGrid();

    if (roleId) {
        title.textContent = 'Edit Role';
        const role = adminState.roles.find(r => r.id == roleId);
        if (role) {
            document.getElementById('edit-role-id').value = role.id;
            document.getElementById('edit-role-name').value = role.role_label || role.role_name;
            document.getElementById('edit-role-description').value = role.description || '';

            // Disable role name for system roles
            document.getElementById('edit-role-name').disabled = role.is_system;

            // Check permissions
            (role.permissions || []).forEach(permKey => {
                const checkbox = document.querySelector(`#role-permissions-grid input[value="${permKey}"]`);
                if (checkbox) checkbox.checked = true;
            });

            // Update category select-all checkboxes
            updateSelectAllCheckboxes();
        }
    } else {
        title.textContent = 'Add Role';
        document.getElementById('edit-role-name').disabled = false;
    }

    modal.classList.add('active');
}

function closeRoleModal() {
    document.getElementById('role-modal').classList.remove('active');
}

function renderPermissionsGrid() {
    const container = document.getElementById('role-permissions-grid');
    if (!container) return;

    const permissions = adminState.permissions;

    if (!permissions || Object.keys(permissions).length === 0) {
        container.innerHTML = '<div class="empty-state">No permissions available</div>';
        return;
    }

    let html = '';
    for (const [category, perms] of Object.entries(permissions)) {
        html += `
            <div class="permission-category">
                <div class="permission-category-header">
                    <input type="checkbox" class="select-all-category" data-category="${category}"
                           onchange="toggleCategoryPermissions(this, '${category}')">
                    <span class="permission-category-name">${category}</span>
                </div>
                <div class="permission-category-items">
                    ${perms.map(perm => `
                        <div class="permission-item">
                            <input type="checkbox" name="permissions[]" value="${perm.permission_key}"
                                   data-category="${category}" id="perm-${perm.id}">
                            <label for="perm-${perm.id}">${perm.permission_label}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function toggleCategoryPermissions(checkbox, category) {
    const checkboxes = document.querySelectorAll(`#role-permissions-grid input[data-category="${category}"]:not(.select-all-category)`);
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

function updateSelectAllCheckboxes() {
    document.querySelectorAll('.select-all-category').forEach(selectAll => {
        const category = selectAll.dataset.category;
        const checkboxes = document.querySelectorAll(`#role-permissions-grid input[data-category="${category}"]:not(.select-all-category)`);
        const checkedCount = document.querySelectorAll(`#role-permissions-grid input[data-category="${category}"]:not(.select-all-category):checked`).length;
        selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    });
}

async function saveRole(event) {
    event.preventDefault();

    const roleId = document.getElementById('edit-role-id').value;
    const permissions = Array.from(document.querySelectorAll('#role-permissions-grid input[name="permissions[]"]:checked'))
        .map(cb => cb.value);

    const roleName = document.getElementById('edit-role-name').value.trim();

    const data = {
        role_name: roleName.toLowerCase().replace(/\s+/g, '_'),
        role_label: roleName,
        description: document.getElementById('edit-role-description').value.trim(),
        permissions: permissions
    };

    if (roleId) {
        data.id = parseInt(roleId);
    }

    try {
        const response = await fetch(`${API_BASE}/admin/roles.php`, {
            method: roleId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message || 'Role saved successfully', 'success');
            closeRoleModal();
            await loadAdminPage();
        } else {
            showToast(result.message || 'Failed to save role', 'error');
        }
    } catch (error) {
        console.error('Save role error:', error);
        showToast('Error saving role', 'error');
    }
}

function editRole(roleId) {
    openRoleModal(roleId);
}

async function deleteRole(roleId, roleName) {
    if (!confirm(`Are you sure you want to delete the "${roleName}" role? Users with this role will need to be reassigned.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/roles.php?id=${roleId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            await loadAdminPage();
        } else {
            showToast(result.message || 'Failed to delete role', 'error');
        }
    } catch (error) {
        console.error('Delete role error:', error);
        showToast('Error deleting role', 'error');
    }
}

function openUserModal(userId = null) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const title = document.getElementById('user-modal-title');
    const passwordHint = document.getElementById('password-hint');
    const roleSelect = document.getElementById('edit-user-role');

    form.reset();
    document.getElementById('edit-user-id').value = '';

    // Populate role dropdown
    if (roleSelect && adminState.roles.length > 0) {
        roleSelect.innerHTML = '<option value="">Select role...</option>' +
            adminState.roles.map(role =>
                `<option value="${role.id}">${role.role_label || role.role_name}</option>`
            ).join('');
    }

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
            if (roleSelect) roleSelect.value = user.role_id || '';
        }
    } else {
        title.textContent = 'Add User';
        passwordHint.textContent = '(required for new user)';
        document.getElementById('edit-password').required = true;
        document.getElementById('edit-is-active').checked = true;
        if (roleSelect) roleSelect.value = '3'; // Default to staff
    }

    modal.classList.add('active');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.remove('active');
}

async function saveUser(event) {
    event.preventDefault();

    const id = document.getElementById('edit-user-id').value;
    const roleSelect = document.getElementById('edit-user-role');
    const data = {
        username: document.getElementById('edit-username').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        display_name: document.getElementById('edit-display-name').value.trim(),
        is_active: document.getElementById('edit-is-active').checked ? 1 : 0,
        is_admin: document.getElementById('edit-is-admin').checked ? 1 : 0,
        role_id: roleSelect ? parseInt(roleSelect.value) || 3 : 3
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

// Role management
window.switchAdminTab = switchAdminTab;
window.openRoleModal = openRoleModal;
window.closeRoleModal = closeRoleModal;
window.saveRole = saveRole;
window.editRole = editRole;
window.deleteRole = deleteRole;
window.toggleCategoryPermissions = toggleCategoryPermissions;
