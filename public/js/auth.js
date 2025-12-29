import { apiGet, apiPost } from './api.js';
import { state } from './state.js';
import { showToast, showLoading, hideLoading } from './utils.js';

// Setup login form
export function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // register-form has onsubmit attribute in HTML, so no need to add listener here
}

// Check if user is already logged in
export async function checkAuthSession() {
    const data = await apiGet('/auth/?action=check');

    if (data.success && data.data.logged_in) {
        state.isLoggedIn = true;
        state.currentUser = data.data.user.id;
        state.userData = data.data.user;
        state.isAdmin = data.data.user.is_admin === 1;

        // Update UI with user info
        updateUserInfo();
        return true;
    }

    return false;
}

export async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showToast('Please enter username and password', 'error');
        return;
    }

    showLoading();

    const result = await apiPost('/auth/', { username, password });

    hideLoading();

    if (result.success) {
        state.isLoggedIn = true;
        state.currentUser = result.data.user.id;
        state.userData = result.data.user;
        state.isAdmin = result.data.user.is_admin === 1;

        showToast('Login successful', 'success');

        // Call global showMainApp if available
        if (window.showMainApp) {
            window.showMainApp();
        } else {
            location.reload();
        }
    } else {
        showToast(result.message || 'Login failed', 'error');
    }
}

export async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    if (data.password !== data.confirm_password) {
        showToast('Passwords do not match', 'error');
        return;
    }

    showLoading();

    const result = await apiPost('/auth/?action=register', data);

    hideLoading();

    if (result.success) {
        showToast('Registration successful! Please login.', 'success');
        showLogin(); // Switch to login view
    } else {
        showToast(result.message || 'Registration failed', 'error');
    }
}

export async function logout() {
    const result = await apiPost('/auth/?action=logout', {});

    if (result.success) {
        state.isLoggedIn = false;
        state.currentUser = null;
        state.userData = null;

        // Call global showLoginPage if available
        if (window.showLoginPage) {
            window.showLoginPage();
        } else {
            location.reload();
        }
    }
}

function updateUserInfo() {
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('current-user-name');
    const roleEl = document.getElementById('current-user-role');
    const topbarNameEl = document.getElementById('topbar-user-name');

    if (state.userData) {
        const displayName = state.userData.display_name || state.userData.username;

        if (avatarEl) {
            avatarEl.textContent = (displayName || 'U').charAt(0).toUpperCase();
        }
        if (nameEl) {
            nameEl.textContent = displayName;
        }
        if (topbarNameEl) {
            topbarNameEl.textContent = displayName;
        }
        if (roleEl) {
            roleEl.textContent = state.isAdmin ? 'Administrator' : 'User';
        }
    }
}

// Helper to switch between login and register forms
export function showRegister() {
    document.getElementById('register-modal').classList.add('active');
}

export function showLogin() {
    document.getElementById('register-modal').classList.remove('active');
    document.getElementById('register-form').reset();
}

// Legacy Compatibility
window.setupLoginForm = setupLoginForm;
window.checkAuthSession = checkAuthSession;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.handleLogout = logout;
window.showRegister = showRegister;
window.showRegisterForm = showRegister; // Map old name to new function
window.closeRegisterModal = showLogin; // Map old name to new function
window.showLogin = showLogin;
window.updateUserInfo = updateUserInfo;
