// API Configuration - Auto-detect base path from current URL
const APP_BASE = (() => {
    // Get the base path from current location
    const pathParts = window.location.pathname.split('/');
    // Find the app folder (first non-empty path segment that's not 'public' and not a file)
    const appFolder = pathParts.find((part, index) => index > 0 && part !== '' && part !== 'public' && !part.includes('.'));
    // Return the app base path
    return appFolder ? '/' + appFolder : '';
})();

const API_BASE = APP_BASE + '/api/v1';

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
        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
        }
        return await response.json();
    } catch (error) {
        console.error('API GET error:', error);
        return { success: false, message: error.message };
    }
}

async function apiPost(endpoint, data) {
    return apiRequest(endpoint, 'POST', data);
}

async function apiPut(endpoint, data) {
    return apiRequest(endpoint, 'PUT', data);
}

async function apiDelete(endpoint, data = null) {
    try {
        const options = {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // If data provided, send as JSON body
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(API_BASE + endpoint, options);
        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
        }
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
        if (!response.ok) {
            // Try to parse error response body for detailed message
            try {
                const errorData = await response.json();
                return { success: false, message: errorData.message || `HTTP ${response.status}: ${response.statusText}` };
            } catch {
                return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
            }
        }
        return await response.json();
    } catch (error) {
        console.error(`API ${method} error:`, error);
        return { success: false, message: error.message };
    }
}

// Export for module usage
export { APP_BASE, API_BASE, apiGet, apiPost, apiPut, apiDelete, apiRequest };

// Legacy Compatibility
window.APP_BASE = APP_BASE;
window.API_BASE = API_BASE;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.apiRequest = apiRequest;
