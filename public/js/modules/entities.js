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

// Show add entity modal with pre-selected type (Professional Style)
function showAddEntityModal(presetType) {
    openProfessionalEntityModal(null, presetType);
}

// Professional Entity Modal (Same style as Cost/Trust Client modals)
function openProfessionalEntityModal(entity, presetType) {
    var modal = document.getElementById('professional-entity-modal');
    if (modal) modal.remove();

    var isEdit = !!entity;
    var type = entity ? entity.type_code : presetType;
    var title = getModalTitle(type, isEdit);
    var isVendor = type === 'vendor';

    modal = document.createElement('div');
    modal.id = 'professional-entity-modal';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center; padding: 20px;';

    // If opened from trust check modal, increase z-index
    if (window.pendingEntitySource === 'trust-check') {
        modal.style.zIndex = '999999';
    }

    var entityId = entity ? entity.id : '';
    var name = entity ? (entity.name || '') : '';
    var displayName = entity ? (entity.display_name || '') : '';
    var company = entity ? (entity.company_name || '') : '';
    var entityCode = entity ? (entity.entity_code || '') : '';
    var email = entity ? (entity.email || '') : '';
    var phone = entity ? formatEntityPhone(entity.phone || '') : '';
    var fax = entity ? (entity.fax || '') : '';
    var address1 = entity ? (entity.address_line1 || '') : '';
    var address2 = entity ? (entity.address_line2 || '') : '';
    var city = entity ? (entity.city || '') : '';
    var stateCode = entity ? (entity.state || '') : '';
    var zip = entity ? (entity.zip_code || '') : '';
    var notes = entity ? (entity.notes || '') : '';

    var inputStyle = 'width: 100%; padding: 11px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #fff; transition: all 0.15s ease; outline: none;';
    var inputFocus = "this.style.borderColor='#059669'; this.style.boxShadow='0 0 0 3px rgba(5,150,105,0.1)'";
    var inputBlur = "this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'";

    modal.innerHTML = `
        <div style="width: 480px; max-width: 95%; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
            <div style="padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 17px; font-weight: 600; color: #1e293b;">${title}</h2>
                <button onclick="closeProfessionalEntityModal()" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: none; border-radius: 6px; font-size: 16px; color: #64748b; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">&times;</button>
            </div>

            <form id="professional-entity-form" onsubmit="saveProfessionalEntity(event)" style="padding: 20px 24px;">
                <input type="hidden" id="prof-entity-id" value="${entityId}">
                <input type="hidden" id="prof-entity-type" value="${type}">

                ${isVendor ? `
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Company Name <span style="color: #ef4444;">*</span></label>
                    <input type="text" id="prof-entity-company" required value="${company}" placeholder="Company or business name"
                           style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                </div>
                ` : `
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Name <span style="color: #ef4444;">*</span></label>
                        <input type="text" id="prof-entity-name" required value="${name}" placeholder="Full name"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Case #</label>
                        <input type="text" id="prof-entity-code" value="${entityCode}" placeholder="Case number"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>
                `}

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Display Name <span style="color: #94a3b8; font-weight: 400;">(for checks)</span></label>
                    <input type="text" id="prof-entity-display-name" value="${displayName}" placeholder="Name as printed on checks"
                           style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Email</label>
                        <input type="email" id="prof-entity-email" value="${email}" placeholder="email@example.com"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                    <div>
                        <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone</label>
                        <input type="tel" id="prof-entity-phone" value="${phone}" placeholder="(555) 123-4567"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}" oninput="this.value=formatEntityPhone(this.value)">
                    </div>
                </div>

                ${isVendor ? `
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Fax</label>
                    <input type="tel" id="prof-entity-fax" value="${fax}" placeholder="(555) 123-4568"
                           style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                </div>
                ` : ''}

                <div style="margin-bottom: 16px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                    <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Address</label>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="prof-entity-address1" value="${address1}" placeholder="Street address"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="margin-bottom: 10px;">
                        <input type="text" id="prof-entity-address2" value="${address2}" placeholder="Suite, unit, building (optional)"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>

                    <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 10px;">
                        <input type="text" id="prof-entity-city" value="${city}" placeholder="City"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="prof-entity-state" value="${stateCode}" placeholder="State" maxlength="2"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                        <input type="text" id="prof-entity-zip" value="${zip}" placeholder="Zip"
                               style="${inputStyle}" onfocus="${inputFocus}" onblur="${inputBlur}">
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">Notes</label>
                    <textarea id="prof-entity-notes" rows="2" placeholder="Additional notes (optional)"
                              style="${inputStyle} resize: vertical; min-height: 60px;" onfocus="${inputFocus}" onblur="${inputBlur}">${notes}</textarea>
                </div>

                <div style="display: flex; justify-content: ${isEdit ? 'space-between' : 'flex-end'}; gap: 10px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                    ${isEdit ? `
                    <button type="button" onclick="deleteProfessionalEntity()"
                            style="padding: 10px 20px; background: #fff; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
                            onmouseover="this.style.background='#fef2f2'; this.style.borderColor='#f87171'" onmouseout="this.style.background='#fff'; this.style.borderColor='#fecaca'">Delete</button>
                    ` : ''}
                    <div style="display: flex; gap: 10px;">
                        <button type="button" onclick="closeProfessionalEntityModal()"
                                style="padding: 10px 20px; background: #fff; color: #64748b; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
                                onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0'">Cancel</button>
                        <button type="submit"
                                style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; box-shadow: 0 1px 2px rgba(5,150,105,0.2);"
                                onmouseover="this.style.background='#047857'; this.style.boxShadow='0 2px 4px rgba(5,150,105,0.3)'" onmouseout="this.style.background='#059669'; this.style.boxShadow='0 1px 2px rgba(5,150,105,0.2)'">Save</button>
                    </div>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // Focus on first field
    setTimeout(() => {
        const focusField = isVendor ? 'prof-entity-company' : 'prof-entity-name';
        document.getElementById(focusField)?.focus();
    }, 100);
}

function closeProfessionalEntityModal() {
    var modal = document.getElementById('professional-entity-modal');
    if (modal) modal.remove();
    window.pendingEntitySource = null;
}

async function saveProfessionalEntity(event) {
    event.preventDefault();

    var id = document.getElementById('prof-entity-id').value;
    var type = document.getElementById('prof-entity-type').value;
    var isVendor = type === 'vendor';

    var userId = state.currentUser || localStorage.getItem('currentUser');

    var data = {
        user_id: userId,
        type: type,
        name: isVendor ? '' : document.getElementById('prof-entity-name')?.value || '',
        display_name: document.getElementById('prof-entity-display-name')?.value || null,
        company_name: isVendor ? document.getElementById('prof-entity-company')?.value || '' : '',
        entity_code: isVendor ? '' : document.getElementById('prof-entity-code')?.value || '',
        email: document.getElementById('prof-entity-email')?.value || '',
        phone: document.getElementById('prof-entity-phone')?.value.replace(/\D/g, '') || '',
        fax: isVendor ? document.getElementById('prof-entity-fax')?.value || '' : '',
        address_line1: document.getElementById('prof-entity-address1')?.value || '',
        address_line2: document.getElementById('prof-entity-address2')?.value || '',
        city: document.getElementById('prof-entity-city')?.value || '',
        state: document.getElementById('prof-entity-state')?.value || '',
        zip_code: document.getElementById('prof-entity-zip')?.value || '',
        notes: document.getElementById('prof-entity-notes')?.value || ''
    };

    if (id) data.id = id;

    try {
        var result;
        if (id) {
            result = await apiPut('/entities/', data);
        } else {
            result = await apiPost('/entities/', data);
        }

        if (result.success) {
            closeProfessionalEntityModal();

            // Handle callback for trust check modal
            if (window.pendingEntitySource === 'trust-check' && typeof window.onEntityCreated === 'function') {
                window.onEntityCreated(result.data?.entity || { id: result.data?.id, ...data });
            }

            // Refresh entity list
            if (entitiesState.currentType) {
                await loadEntitiesByType(entitiesState.currentType);
            }

            showToast(id ? 'Contact updated' : 'Contact added', 'success');
        } else {
            showToast(result.message || 'Error saving contact', 'error');
        }
    } catch (error) {
        console.error('Error saving entity:', error);
        showToast('Error saving contact', 'error');
    }
}

async function deleteProfessionalEntity() {
    var id = document.getElementById('prof-entity-id').value;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this contact?')) return;

    var userId = state.currentUser || localStorage.getItem('currentUser');

    try {
        var result = await apiDelete('/entities/', { id: id, user_id: userId });

        if (result.success) {
            closeProfessionalEntityModal();
            if (entitiesState.currentType) {
                await loadEntitiesByType(entitiesState.currentType);
            }
            showToast('Contact deleted', 'success');
        } else {
            showToast(result.message || 'Error deleting contact', 'error');
        }
    } catch (error) {
        console.error('Error deleting entity:', error);
        showToast('Error deleting contact', 'error');
    }
}

function getModalTitle(type, isEdit) {
    const titles = {
        'vendor': isEdit ? 'Edit Vendor' : 'Add New Vendor',
        'customer': isEdit ? 'Edit Customer' : 'Add New Customer',
        'employee': isEdit ? 'Edit Employee' : 'Add New Employee'
    };
    return titles[type] || (isEdit ? 'Edit Contact' : 'Add New Contact');
}

// Edit entity (use professional modal)
function editEntity(id) {
    const entity = entitiesState.entities.find(e => e.id == id);
    if (!entity) {
        fetchAndEditEntity(id);
        return;
    }
    openProfessionalEntityModal(entity, entity.type_code);
}

async function fetchAndEditEntity(id) {
    const userId = state.currentUser || localStorage.getItem('currentUser');
    try {
        const result = await apiGet('/entities/', { id: id, user_id: userId });
        if (result.success && result.data.entity) {
            openProfessionalEntityModal(result.data.entity, result.data.entity.type_code);
        } else {
            showToast('Contact not found', 'error');
        }
    } catch (e) {
        showToast('Error loading contact', 'error');
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

// Export functions
window.loadVendorsPage = loadVendorsPage;
window.loadCustomersPage = loadCustomersPage;
window.loadEmployeesPage = loadEmployeesPage;
window.searchEntitiesByType = searchEntitiesByType;
window.showAddEntityModal = showAddEntityModal;
window.editEntity = editEntity;
window.openProfessionalEntityModal = openProfessionalEntityModal;
window.closeProfessionalEntityModal = closeProfessionalEntityModal;
window.saveProfessionalEntity = saveProfessionalEntity;
window.deleteProfessionalEntity = deleteProfessionalEntity;
window.formatEntityPhone = formatEntityPhone;
