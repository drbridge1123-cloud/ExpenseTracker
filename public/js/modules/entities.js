/**
 * Entities Management Module
 * Manages Vendors, Customers, Employees - Table Layout
 */

// State
let entitiesState = {
    entities: [],
    types: [],
    currentType: null,
    searchTerm: ''
};

// Load entities for a specific type page
async function loadEntitiesByType(type) {
    entitiesState.currentType = type;
    entitiesState.searchTerm = '';

    // Clear search input
    const searchInput = document.getElementById(type + 's-search');
    if (searchInput) searchInput.value = '';

    const container = document.getElementById(type + 's-table-container');
    const empty = document.getElementById(type + 's-empty');

    // Show loading state
    if (container) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: #94a3b8;">
                <div style="font-size: 14px;">Loading ${type}s...</div>
            </div>
        `;
    }
    if (empty) empty.style.display = 'none';

    const userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        const result = await apiGet('/entities/', {
            user_id: userId,
            type: type,
            include_inactive: '1',
            all: 1
        });

        if (result.success) {
            entitiesState.entities = result.data.entities || [];
            entitiesState.types = result.data.types || [];
            renderEntityTable(type);
        } else {
            showToast(result.message || 'Error loading ' + type + 's', 'error');
            if (container) container.innerHTML = '';
            if (empty) empty.style.display = 'block';
        }
    } catch (e) {
        console.error('Error loading entities:', e);
        showToast('Error loading ' + type + 's', 'error');
        if (container) container.innerHTML = '';
        if (empty) empty.style.display = 'block';
    }
}

// Page loaders
async function loadVendorsPage() {
    await loadEntitiesByType('vendor');
}

async function loadCustomersPage() {
    await loadEntitiesByType('customer');
}

async function loadEmployeesPage() {
    await loadEntitiesByType('employee');
}

// Render table
function renderEntityTable(type) {
    const container = document.getElementById(type + 's-table-container');
    const empty = document.getElementById(type + 's-empty');

    if (!container) {
        console.error('Entity table container not found for type:', type);
        return;
    }

    let filtered = entitiesState.entities;

    // Apply search
    if (entitiesState.searchTerm) {
        const search = entitiesState.searchTerm.toLowerCase();
        filtered = filtered.filter(e =>
            (e.name || '').toLowerCase().includes(search) ||
            (e.display_name || '').toLowerCase().includes(search) ||
            (e.company_name || '').toLowerCase().includes(search) ||
            (e.entity_code || '').toLowerCase().includes(search) ||
            (e.email || '').toLowerCase().includes(search) ||
            (e.phone || '').toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (empty) {
            empty.style.display = 'block';
        } else {
            container.innerHTML = `
                <div style="padding: 60px 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.6;">
                        ${type === 'vendor' ? '🏢' : type === 'customer' ? '👤' : '👔'}
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">
                        No ${type}s yet
                    </div>
                    <div style="font-size: 14px; color: #64748b; margin-bottom: 16px;">
                        Add your first ${type} to get started
                    </div>
                    <button onclick="showAddEntityModal('${type}')" class="btn btn-primary">
                        Add ${type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                </div>
            `;
        }
        return;
    }

    if (empty) empty.style.display = 'none';

    const typeColors = {
        vendor: '#3b82f6',
        customer: '#10b981',
        employee: '#8b5cf6'
    };
    const color = typeColors[type] || '#6366f1';

    // Different columns based on type
    const isVendor = type === 'vendor';
    const isCustomer = type === 'customer';

    // Vendor: Company Name, Email, Phone, Fax, Address
    // Customer: Name, Case #, Email, Phone, Address
    // Employee: Name, Email, Phone, Address
    let headers;
    if (isVendor) {
        headers = `<th style="width: 50px;"></th>
           <th>Company Name</th>
           <th>Email</th>
           <th>Phone</th>
           <th>Fax</th>
           <th>Address</th>
           <th style="width: 80px;">Actions</th>`;
    } else if (isCustomer) {
        headers = `<th style="width: 50px;"></th>
           <th>Name</th>
           <th>Case #</th>
           <th>Email</th>
           <th>Phone</th>
           <th>Address</th>
           <th style="width: 80px;">Actions</th>`;
    } else {
        headers = `<th style="width: 50px;"></th>
           <th>Name</th>
           <th>Email</th>
           <th>Phone</th>
           <th>Address</th>
           <th style="width: 80px;">Actions</th>`;
    }

    container.innerHTML = `
        <table class="entity-table">
            <thead>
                <tr>${headers}</tr>
            </thead>
            <tbody>
                ${filtered.map(entity => {
                    const initials = getInitials(entity.name);
                    const address = formatAddress(entity);

                    // Different row structure based on type
                    const rowCells = isVendor
                        ? `<td>
                                <div class="entity-avatar-small" style="background: ${color};">
                                    ${initials}
                                </div>
                            </td>
                            <td>
                                <div class="entity-name-cell">
                                    <span class="entity-primary-name">${escapeHtml(entity.name)}</span>
                                    ${entity.display_name && entity.display_name !== entity.name ?
                                        `<span class="entity-display-name">${escapeHtml(entity.display_name)}</span>` : ''}
                                </div>
                            </td>
                            <td>
                                ${entity.email ?
                                    `<a href="mailto:${escapeHtml(entity.email)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.email)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td>
                                ${entity.phone ?
                                    `<a href="tel:${escapeHtml(entity.phone)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.phone)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td>${entity.fax ? escapeHtml(entity.fax) : '<span class="text-muted">-</span>'}</td>
                            <td class="entity-address-cell">${address || '<span class="text-muted">-</span>'}</td>
                            <td>
                                <button class="entity-action-btn" onclick="event.stopPropagation(); editEntity(${entity.id})">
                                    Edit
                                </button>
                            </td>`
                        : isCustomer ? `<td>
                                <div class="entity-avatar-small" style="background: ${color};">
                                    ${initials}
                                </div>
                            </td>
                            <td>
                                <div class="entity-name-cell">
                                    <span class="entity-primary-name">${escapeHtml(entity.name)}</span>
                                </div>
                            </td>
                            <td>${entity.entity_code ? escapeHtml(entity.entity_code) : '<span class="text-muted">-</span>'}</td>
                            <td>
                                ${entity.email ?
                                    `<a href="mailto:${escapeHtml(entity.email)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.email)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td>
                                ${entity.phone ?
                                    `<a href="tel:${escapeHtml(entity.phone)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.phone)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td class="entity-address-cell">${address || '<span class="text-muted">-</span>'}</td>
                            <td>
                                <button class="entity-action-btn" onclick="event.stopPropagation(); editEntity(${entity.id})">
                                    Edit
                                </button>
                            </td>`
                        : `<td>
                                <div class="entity-avatar-small" style="background: ${color};">
                                    ${initials}
                                </div>
                            </td>
                            <td>
                                <div class="entity-name-cell">
                                    <span class="entity-primary-name">${escapeHtml(entity.name)}</span>
                                    ${entity.display_name && entity.display_name !== entity.name ?
                                        `<span class="entity-display-name">${escapeHtml(entity.display_name)}</span>` : ''}
                                </div>
                            </td>
                            <td>
                                ${entity.email ?
                                    `<a href="mailto:${escapeHtml(entity.email)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.email)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td>
                                ${entity.phone ?
                                    `<a href="tel:${escapeHtml(entity.phone)}" class="entity-link" onclick="event.stopPropagation();">${escapeHtml(entity.phone)}</a>` :
                                    '<span class="text-muted">-</span>'}
                            </td>
                            <td class="entity-address-cell">${address || '<span class="text-muted">-</span>'}</td>
                            <td>
                                <button class="entity-action-btn" onclick="event.stopPropagation(); editEntity(${entity.id})">
                                    Edit
                                </button>
                            </td>`;

                    return `<tr onclick="editEntity(${entity.id})" style="cursor: pointer;">${rowCells}</tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="entity-table-footer">
            <span>${filtered.length} ${type}${filtered.length !== 1 ? 's' : ''}</span>
        </div>
    `;
}

// Get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Format location for table
function formatLocation(entity) {
    const parts = [];
    if (entity.city) parts.push(entity.city);
    if (entity.state) parts.push(entity.state);
    return parts.join(', ');
}

// Format full address for display
function formatAddress(entity) {
    const parts = [];
    if (entity.address_line1) parts.push(entity.address_line1);
    if (entity.city) {
        let cityState = entity.city;
        if (entity.state) cityState += ', ' + entity.state;
        if (entity.zip_code) cityState += ' ' + entity.zip_code;
        parts.push(cityState);
    }
    return parts.join(', ');
}

// Search entities by type
function searchEntitiesByType(type, term) {
    entitiesState.searchTerm = term;
    renderEntityTable(type);
}

// Configure modal fields based on entity type
function configureModalFields(type) {
    const companyGroup = document.getElementById('entity-company-group');
    const nameGroup = document.getElementById('entity-name-group');
    const faxGroup = document.getElementById('entity-fax-group');

    if (type === 'vendor') {
        // Vendor: show company and fax, hide name
        companyGroup.style.display = 'block';
        nameGroup.style.display = 'none';
        faxGroup.style.display = 'block';
    } else {
        // Customer/Employee: show name, hide company and fax
        companyGroup.style.display = 'none';
        nameGroup.style.display = 'block';
        faxGroup.style.display = 'none';
    }
}

// Show add entity modal with pre-selected type
function showAddEntityModal(presetType) {
    document.getElementById('entity-modal-title').textContent = getModalTitle(presetType, false);
    document.getElementById('entity-id').value = '';
    document.getElementById('entity-type').value = presetType || '';

    // Configure fields based on type
    configureModalFields(presetType);

    document.getElementById('entity-name').value = '';
    document.getElementById('entity-display-name').value = '';
    document.getElementById('entity-company').value = '';
    document.getElementById('entity-email').value = '';
    document.getElementById('entity-phone').value = '';
    document.getElementById('entity-fax').value = '';
    document.getElementById('entity-address1').value = '';
    document.getElementById('entity-address2').value = '';
    document.getElementById('entity-city').value = '';
    document.getElementById('entity-state').value = '';
    document.getElementById('entity-zip').value = '';
    document.getElementById('entity-notes').value = '';
    document.getElementById('entity-delete-btn').style.display = 'none';

    const modal = document.getElementById('entity-modal');
    modal.style.display = 'flex';

    // If opened from trust check modal, set higher z-index to appear above it
    if (window.pendingEntitySource === 'trust-check') {
        modal.style.zIndex = '999999';
    } else {
        modal.style.zIndex = '';  // Reset to CSS default
    }

    setTimeout(() => modal.classList.add('open'), 10);

    // Setup phone formatting
    setupEntityPhoneFormatting();

    // Focus on first visible field
    const focusField = presetType === 'vendor' ? 'entity-company' : 'entity-name';
    setTimeout(() => document.getElementById(focusField).focus(), 100);
}

function getModalTitle(type, isEdit) {
    const titles = {
        'vendor': isEdit ? 'Edit Vendor' : 'Add New Vendor',
        'customer': isEdit ? 'Edit Customer' : 'Add New Customer',
        'employee': isEdit ? 'Edit Employee' : 'Add New Employee'
    };
    return titles[type] || (isEdit ? 'Edit Contact' : 'Add New Contact');
}

// Edit entity
function editEntity(id) {
    const entity = entitiesState.entities.find(e => e.id == id);
    if (!entity) {
        fetchAndEditEntity(id);
        return;
    }
    populateEditForm(entity);
}

async function fetchAndEditEntity(id) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        const result = await apiGet('/entities/', { id: id, user_id: userId });
        if (result.success && result.data.entity) {
            populateEditForm(result.data.entity);
        } else {
            showToast('Contact not found', 'error');
        }
    } catch (e) {
        showToast('Error loading contact', 'error');
    }
}

function populateEditForm(entity) {
    document.getElementById('entity-modal-title').textContent = getModalTitle(entity.type_code, true);
    document.getElementById('entity-id').value = entity.id;
    document.getElementById('entity-type').value = entity.type_code || '';

    // Configure fields based on type
    configureModalFields(entity.type_code);

    document.getElementById('entity-name').value = entity.name || '';
    document.getElementById('entity-display-name').value = entity.display_name || '';
    document.getElementById('entity-company').value = entity.company_name || '';
    document.getElementById('entity-email').value = entity.email || '';
    document.getElementById('entity-phone').value = formatEntityPhone(entity.phone || '');
    document.getElementById('entity-fax').value = entity.fax || '';
    document.getElementById('entity-address1').value = entity.address_line1 || '';
    document.getElementById('entity-address2').value = entity.address_line2 || '';
    document.getElementById('entity-city').value = entity.city || '';
    document.getElementById('entity-state').value = entity.state || '';
    document.getElementById('entity-zip').value = entity.zip_code || '';
    document.getElementById('entity-notes').value = entity.notes || '';
    document.getElementById('entity-delete-btn').style.display = 'inline-block';

    const modal = document.getElementById('entity-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);

    // Setup phone formatting
    setupEntityPhoneFormatting();
}

// Close entity modal
function closeEntityModal() {
    const modal = document.getElementById('entity-modal');
    modal.classList.remove('open');
    setTimeout(() => {
        modal.style.display = 'none';
        modal.style.zIndex = '';  // Reset z-index
    }, 300);

    // Clear pending source flags
    window.pendingEntitySource = null;
    window.pendingEntityName = null;
}

// Save entity
async function saveEntity() {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    const entityId = document.getElementById('entity-id').value;
    const type = document.getElementById('entity-type').value;

    // Get the appropriate primary field based on type
    let name, companyName;
    if (type === 'vendor') {
        companyName = document.getElementById('entity-company').value.trim();
        name = companyName; // For vendor, company name is the name
        if (!companyName) {
            showToast('Please enter a company name', 'error');
            return;
        }
    } else {
        name = document.getElementById('entity-name').value.trim();
        companyName = ''; // Customer/Employee don't have company
        if (!name) {
            showToast('Please enter a name', 'error');
            return;
        }
    }

    if (!type) {
        showToast('Please select a type', 'error');
        return;
    }

    const data = {
        user_id: userId,
        type: type,
        name: name,
        display_name: document.getElementById('entity-display-name').value.trim() || name,
        company_name: companyName,
        email: document.getElementById('entity-email').value.trim(),
        phone: document.getElementById('entity-phone').value.trim(),
        fax: type === 'vendor' ? document.getElementById('entity-fax').value.trim() : '',
        address_line1: document.getElementById('entity-address1').value.trim(),
        address_line2: document.getElementById('entity-address2').value.trim(),
        city: document.getElementById('entity-city').value.trim(),
        state: document.getElementById('entity-state').value.trim(),
        zip_code: document.getElementById('entity-zip').value.trim(),
        notes: document.getElementById('entity-notes').value.trim()
    };

    if (entityId) {
        data.id = parseInt(entityId);
    }

    try {
        const result = await (entityId ? apiPut('/entities/', data) : apiPost('/entities/', data));

        if (result.success) {
            showToast(entityId ? 'Updated successfully' : 'Created successfully', 'success');

            // If created from trust check modal, auto-fill the payee field BEFORE closing modal
            // (closeEntityModal clears pendingEntitySource)
            if (!entityId && window.pendingEntitySource === 'trust-check' && result.data?.entity) {
                const newEntity = result.data.entity;

                const payeeInput = document.getElementById('trust-check-payee');
                const entityIdInput = document.getElementById('trust-check-entity-id');
                const entitySelected = document.getElementById('trust-check-entity-selected');

                if (payeeInput) payeeInput.value = newEntity.display_name || newEntity.name;
                if (entityIdInput) entityIdInput.value = newEntity.id;

                // Update selected entity display
                if (entitySelected) {
                    entitySelected.style.display = 'block';
                    const nameEl = document.getElementById('trust-check-entity-name');
                    const addrEl = document.getElementById('trust-check-entity-address');
                    if (nameEl) nameEl.textContent = newEntity.display_name || newEntity.name;
                    // Show type name (Vendor, Customer, etc.) instead of address
                    if (addrEl) addrEl.textContent = newEntity.type_name || type.charAt(0).toUpperCase() + type.slice(1);
                }

                // Add to trustChecksState.entities if available
                if (typeof trustChecksState !== 'undefined' && trustChecksState.entities) {
                    trustChecksState.entities.push({
                        id: newEntity.id,
                        name: newEntity.name,
                        display_name: newEntity.display_name || newEntity.name,
                        type_name: newEntity.type_name || type.charAt(0).toUpperCase() + type.slice(1)
                    });
                    trustChecksState.selectedEntityId = newEntity.id;
                }
            }

            closeEntityModal();

            if (entitiesState.currentType) {
                await loadEntitiesByType(entitiesState.currentType);
            }
        } else {
            showToast(result.message || 'Error saving', 'error');
        }
    } catch (e) {
        console.error('Error saving entity:', e);
        showToast('Error saving', 'error');
    }
}

// Delete entity
async function deleteEntity() {
    const entityId = document.getElementById('entity-id').value;
    if (!entityId) return;

    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
        const result = await apiDelete('/entities/?id=' + entityId);

        if (result.success) {
            showToast('Deleted successfully', 'success');
            closeEntityModal();

            if (entitiesState.currentType) {
                await loadEntitiesByType(entitiesState.currentType);
            }
        } else {
            showToast(result.message || 'Error deleting', 'error');
        }
    } catch (e) {
        console.error('Error deleting entity:', e);
        showToast('Error deleting', 'error');
    }
}

// API helper for PUT
async function apiPut(endpoint, data) {
    const baseUrl = window.API_BASE_URL || '/expensetracker/api/v1';
    const response = await fetch(baseUrl + endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

// Format phone number as (XXX) XXX-XXXX
function formatEntityPhone(value) {
    if (!value) return '';
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = digits.substring(0, 10);
    // Format based on length
    if (limited.length === 0) {
        return '';
    } else if (limited.length <= 3) {
        return `(${limited}`;
    } else if (limited.length <= 6) {
        return `(${limited.substring(0, 3)}) ${limited.substring(3)}`;
    } else {
        return `(${limited.substring(0, 3)}) ${limited.substring(3, 6)}-${limited.substring(6)}`;
    }
}

// Setup phone formatting on input
function setupEntityPhoneFormatting() {
    const phoneInput = document.getElementById('entity-phone');
    if (phoneInput && !phoneInput.dataset.formattingSetup) {
        phoneInput.dataset.formattingSetup = 'true';
        phoneInput.addEventListener('input', (e) => {
            e.target.value = formatEntityPhone(e.target.value);
        });
    }
}

// Export functions
window.loadVendorsPage = loadVendorsPage;
window.loadCustomersPage = loadCustomersPage;
window.loadEmployeesPage = loadEmployeesPage;
window.searchEntitiesByType = searchEntitiesByType;
window.showAddEntityModal = showAddEntityModal;
window.editEntity = editEntity;
window.closeEntityModal = closeEntityModal;
window.saveEntity = saveEntity;
window.deleteEntity = deleteEntity;
window.formatEntityPhone = formatEntityPhone;
