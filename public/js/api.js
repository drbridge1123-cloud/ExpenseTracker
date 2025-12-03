// API Configuration - Auto-detect base path from current URL
const API_BASE = (() => {
    // Get the base path from current location
    const pathParts = window.location.pathname.split('/');
    // Find the app folder (first non-empty path segment that's not 'public')
    const appFolder = pathParts.find((part, index) => index > 0 && part !== '' && part !== 'public');
    // Return the API base path
    return appFolder ? '/' + appFolder + '/api/v1' : '/api/v1';
})();

// API Helpers
async function apiGet(endpoint, params = {}) {
    const url = new URL(API_BASE + endpoint, window.location.origin);
    Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            url.searchParams.append(key, params[key]);
        }
    });

    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('API GET error:', error);
        return { success: false, message: error.message };
    }
}

async function apiPost(endpoint, data) {
    return apiRequest(endpoint, 'POST', data);
}

async function apiDelete(endpoint) {
    try {
        const response = await fetch(API_BASE + endpoint, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return await response.json();
    } catch (error) {
        console.error('API DELETE error:', error);
        return { success: false, message: error.message };
    }
}

async function apiRequest(endpoint, method, data) {
    const options = {
        method,
        headers: {}
    };

    if (data instanceof FormData) {
        // Let browser set Content-Type for FormData
        options.body = data;
    } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(API_BASE + endpoint, options);
        return await response.json();
    } catch (error) {
        console.error(`API ${method} error:`, error);
        return { success: false, message: error.message };
    }
}

// Export for module usage
export { API_BASE, apiGet, apiPost, apiDelete, apiRequest };

// Legacy Compatibility
window.API_BASE = API_BASE;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiDelete = apiDelete;
window.apiRequest = apiRequest;
