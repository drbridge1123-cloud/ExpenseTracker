// =====================================================
// Data Management Module
// =====================================================
// Dependencies: state, apiGet, apiPost, showToast, formatCurrency

// State
if (!window._dataManagementState) {
    window._dataManagementState = {
        currentTab: 'export',
        activityLog: []
    };
}
const dataManagementState = window._dataManagementState;

// =====================================================
// Activity Log Functions
// =====================================================

function addActivityLog(entry) {
    // entry: { type: 'import'|'export'|'backup'|'restore', status: 'success'|'error', title, data }
    const logEntry = {
        id: Date.now(),
        timestamp: new Date(),
        ...entry
    };
    dataManagementState.activityLog.unshift(logEntry);
    // Keep last 20 entries
    if (dataManagementState.activityLog.length > 20) {
        dataManagementState.activityLog.pop();
    }
    renderActivityLog();
}

function renderActivityLog() {
    // Update card preview
    updateActivityLogPreview();

    // Render in modal if open
    const modalContainer = document.getElementById('activity-log-modal-content');
    if (modalContainer) {
        renderActivityLogContent(modalContainer);
    }
}

function updateActivityLogPreview() {
    const badge = document.getElementById('dm-activity-badge');
    const preview = document.getElementById('activity-log-preview');

    if (dataManagementState.activityLog.length === 0) {
        if (badge) badge.style.display = 'none';
        if (preview) {
            preview.innerHTML = `
                <div class="activity-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    <span>No recent activity</span>
                </div>
            `;
        }
    } else {
        const count = dataManagementState.activityLog.length;
        if (badge) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        }

        if (preview) {
            // Show last 3 activities
            const recentLogs = dataManagementState.activityLog.slice(0, 3);

            preview.innerHTML = `
                <div class="activity-preview-list">
                    ${recentLogs.map(entry => {
                        const time = entry.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        const iconSvg = entry.status === 'success'
                            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
                            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

                        let badges = '';
                        if (entry.data?.imported !== undefined && entry.data.imported > 0) {
                            badges += `<span class="activity-mini-badge imported" data-entry-id="${entry.id}" data-section="imported">${entry.data.imported}</span>`;
                        }
                        if (entry.data?.checks_matched?.length > 0) {
                            badges += `<span class="activity-mini-badge matched" data-entry-id="${entry.id}" data-section="matched">${entry.data.checks_matched.length} matched</span>`;
                        }
                        if (entry.data?.skipped !== undefined && entry.data.skipped > 0) {
                            badges += `<span class="activity-mini-badge skipped" data-entry-id="${entry.id}" data-section="skipped">${entry.data.skipped} skip</span>`;
                        }
                        if (entry.data?.errors?.length > 0) {
                            badges += `<span class="activity-mini-badge error" data-entry-id="${entry.id}" data-section="errors">${entry.data.errors.length} err</span>`;
                        }

                        return `
                            <div class="activity-preview-item" data-entry-id="${entry.id}">
                                <div class="activity-preview-icon ${entry.status}">${iconSvg}</div>
                                <div class="activity-preview-content">
                                    <div class="activity-preview-title">${entry.title}</div>
                                    <div class="activity-preview-meta">${time}</div>
                                </div>
                                <div class="activity-preview-badges">${badges}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${dataManagementState.activityLog.length > 3 ? `
                    <div class="activity-view-all">
                        View all ${dataManagementState.activityLog.length} activities
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </div>
                ` : ''}
            `;

            // Add event listeners for badges (more reliable than inline onclick)
            preview.querySelectorAll('.activity-mini-badge').forEach(badge => {
                badge.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    const entryId = this.dataset.entryId; // Keep as string to avoid precision issues
                    const section = this.dataset.section;
                    console.log('Badge clicked:', entryId, section); // Debug
                    showActivityLogModalForEntry(entryId, section);
                });
            });

            // Add event listeners for preview items
            preview.querySelectorAll('.activity-preview-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (!e.target.closest('.activity-mini-badge')) {
                        e.stopPropagation();
                        const entryId = this.dataset.entryId; // Keep as string
                        showActivityLogModalForEntry(entryId);
                    }
                });
            });

            // Add click handler for the card itself
            const card = document.getElementById('activity-log-card');
            if (card && !card.dataset.listenerAdded) {
                card.dataset.listenerAdded = 'true';
                card.addEventListener('click', function(e) {
                    // Only open modal if not clicking on a badge
                    if (!e.target.closest('.activity-mini-badge')) {
                        showActivityLogModal();
                    }
                });
            }
        }
    }
}

function renderActivityLogContent(container) {
    if (dataManagementState.activityLog.length === 0) {
        container.innerHTML = `
            <div class="dm-log-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <p>No activity yet</p>
                <span>Import or export data to see results here</span>
            </div>
        `;
        return;
    }

    container.innerHTML = dataManagementState.activityLog.map(entry => {
        const time = entry.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const date = entry.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const iconSvg = entry.status === 'success'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        let badges = '';
        if (entry.data?.imported !== undefined) {
            badges += `<span class="dm-log-badge imported clickable-badge" data-section="imported" data-entry-id="${entry.id}" onclick="event.stopPropagation(); scrollToLogSection(this)">${entry.data.imported} imported</span>`;
        }
        if (entry.data?.checks_matched?.length > 0) {
            badges += `<span class="dm-log-badge clickable-badge" data-section="matched" data-entry-id="${entry.id}" onclick="event.stopPropagation(); scrollToLogSection(this)" style="background:#dbeafe;color:#2563eb">${entry.data.checks_matched.length} matched</span>`;
        }
        if (entry.data?.skipped !== undefined && entry.data.skipped > 0) {
            badges += `<span class="dm-log-badge skipped clickable-badge" data-section="skipped" data-entry-id="${entry.id}" onclick="event.stopPropagation(); scrollToLogSection(this)">${entry.data.skipped} skipped</span>`;
        }
        if (entry.data?.checks_mismatched?.length > 0) {
            badges += `<span class="dm-log-badge error clickable-badge" data-section="mismatched" data-entry-id="${entry.id}" onclick="event.stopPropagation(); scrollToLogSection(this)">${entry.data.checks_mismatched.length} mismatch</span>`;
        }
        if (entry.data?.errors?.length > 0) {
            badges += `<span class="dm-log-badge error clickable-badge" data-section="errors" data-entry-id="${entry.id}" onclick="event.stopPropagation(); scrollToLogSection(this)">${entry.data.errors.length} errors</span>`;
        }
        if (entry.data?.exported !== undefined) {
            badges += `<span class="dm-log-badge imported">${entry.data.exported} exported</span>`;
        }

        let bodyContent = '';

        // Imported details section
        if (entry.data?.imported_details?.length > 0) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5 class="dm-log-section-header" onclick="toggleLogSection(this)">
                        <span>Imported Items (${entry.data.imported_details.length})</span>
                        <svg class="dm-section-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
                    </h5>
                    <div class="dm-log-list dm-log-section-content" style="display:none; max-height: 300px; overflow-y: auto;">
                        ${entry.data.imported_details.map(item => `
                            <div class="dm-log-item">
                                <span class="dm-log-item-date">${item.date || ''}</span>
                                <span class="dm-log-item-desc">${(item.description || '').substring(0, 40)}</span>
                                <span class="dm-log-item-amount" style="color:#059669">${item.amount ? '$' + Math.abs(item.amount).toFixed(2) : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Skipped details section
        if (entry.data?.skipped_details?.length > 0) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5 class="dm-log-section-header" onclick="toggleLogSection(this)">
                        <span style="color:#f59e0b">⚠ Skipped Items (${entry.data.skipped_details.length})</span>
                        <svg class="dm-section-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="transform:rotate(180deg)"><polyline points="6 9 12 15 18 9"/></svg>
                    </h5>
                    <div class="dm-log-list dm-log-section-content" style="max-height: 300px; overflow-y: auto;">
                        ${entry.data.skipped_details.map(item => `
                            <div class="dm-log-item" style="background:#fef3c7">
                                <span class="dm-log-item-reason" style="color:#92400e;font-weight:500">${item.reason}</span>
                                <span class="dm-log-item-desc">${(item.description || '').substring(0, 40)}</span>
                                <span class="dm-log-item-amount">${item.amount ? '$' + Math.abs(item.amount).toFixed(2) : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (entry.data?.skipped > 0) {
            // Show skipped count even if details not available
            bodyContent += `
                <div class="dm-log-section">
                    <h5 class="dm-log-section-header">
                        <span style="color:#f59e0b">⚠ Skipped Items (${entry.data.skipped})</span>
                    </h5>
                    <div class="dm-log-list dm-log-section-content" style="padding:12px;color:#92400e;background:#fef3c7;border-radius:6px;">
                        ${entry.data.skipped} item(s) were skipped (details not available for this import)
                    </div>
                </div>
            `;
        }

        // Matched checks section
        if (entry.data?.checks_matched?.length > 0) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5 class="dm-log-section-header" onclick="toggleLogSection(this)">
                        <span style="color:#059669">✓ Matched Checks (${entry.data.checks_matched.length})</span>
                        <svg class="dm-section-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
                    </h5>
                    <div class="dm-log-list dm-log-section-content" style="display:none; max-height: 200px; overflow-y: auto;">
                        ${entry.data.checks_matched.map(check => `
                            <div class="dm-log-item" style="background:#d1fae5">
                                <span class="dm-log-item-desc" style="color:#065f46">Check #${check.check_number} - ${check.payee || 'Unknown'}</span>
                                <span class="dm-log-item-amount" style="color:#059669">$${Math.abs(parseFloat(check.amount) || 0).toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Mismatched checks section
        if (entry.data?.checks_mismatched?.length > 0) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5 class="dm-log-section-header" onclick="toggleLogSection(this)">
                        <span style="color:#dc2626">⚠ Amount Mismatches (${entry.data.checks_mismatched.length})</span>
                        <svg class="dm-section-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
                    </h5>
                    <div class="dm-log-list dm-log-section-content" style="max-height: 200px; overflow-y: auto;">
                        ${entry.data.checks_mismatched.map(check => `
                            <div class="dm-log-item" style="background:#fee2e2">
                                <span class="dm-log-item-desc" style="color:#991b1b">Check #${check.check_number}: Expected $${Math.abs(parseFloat(check.check_amount) || 0).toFixed(2)}, Bank charged $${Math.abs(parseFloat(check.imported_amount) || 0).toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Errors section
        if (entry.data?.errors?.length > 0) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5>Errors</h5>
                    <div class="dm-log-list">
                        ${entry.data.errors.map(err => `
                            <div class="dm-log-item">
                                <span class="dm-log-item-desc" style="color:#dc2626">${err}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Error message for failed operations
        if (entry.status === 'error' && entry.data?.message) {
            bodyContent += `
                <div class="dm-log-section">
                    <h5>Error Details</h5>
                    <div class="dm-log-item" style="background:#fee2e2">
                        <span class="dm-log-item-desc" style="color:#dc2626">${entry.data.message}</span>
                    </div>
                </div>
            `;
        }

        const hasBody = bodyContent.length > 0;

        return `
            <div class="dm-log-entry" data-id="${entry.id}">
                <div class="dm-log-header" ${hasBody ? `onclick="toggleLogEntry(${entry.id})"` : ''}>
                    <div class="dm-log-title">
                        <div class="dm-log-icon ${entry.status}">${iconSvg}</div>
                        <div class="dm-log-info">
                            <h4>${entry.title}</h4>
                            <span>${date} at ${time}</span>
                        </div>
                    </div>
                    <div class="dm-log-meta">
                        ${badges}
                        ${hasBody ? '<svg class="dm-log-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
                    </div>
                </div>
                ${hasBody ? `<div class="dm-log-body">${bodyContent}</div>` : ''}
            </div>
        `;
    }).join('');

    // Add click handlers for badges in modal
    setTimeout(() => {
        container.querySelectorAll('.clickable-badge').forEach(badge => {
            badge.style.cursor = 'pointer';
            badge.addEventListener('click', function(e) {
                e.stopPropagation();
                const section = this.dataset.section;
                const entryId = this.dataset.entryId;
                const entry = container.querySelector(`.dm-log-entry[data-id="${entryId}"]`);

                if (entry) {
                    // Expand the entry
                    entry.classList.add('expanded');

                    // Find and expand the specific section
                    const sectionMap = {
                        'imported': 'Imported Items',
                        'skipped': 'Skipped Items',
                        'matched': 'Matched Checks',
                        'mismatched': 'Amount Mismatches',
                        'errors': 'Errors'
                    };
                    const sectionTitle = sectionMap[section];

                    if (sectionTitle) {
                        const headers = entry.querySelectorAll('.dm-log-section-header');
                        headers.forEach(header => {
                            if (header.textContent.includes(sectionTitle)) {
                                const content = header.nextElementSibling;
                                if (content) {
                                    content.style.display = 'block';
                                    const icon = header.querySelector('.dm-section-toggle');
                                    if (icon) icon.style.transform = 'rotate(180deg)';
                                }
                                // Scroll to this section
                                setTimeout(() => {
                                    header.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 50);
                            }
                        });
                    }
                }
            });
        });
    }, 0);
}

function toggleLogEntry(id) {
    const entry = document.querySelector(`.dm-log-entry[data-id="${id}"]`);
    if (entry) {
        entry.classList.toggle('expanded');
    }
}

// Scroll to specific section when badge is clicked
function scrollToLogSection(badge) {
    const section = badge.dataset.section;
    const entryId = badge.dataset.entryId;
    const entry = document.querySelector(`.dm-log-entry[data-id="${entryId}"]`);

    if (entry) {
        // Expand the entry
        entry.classList.add('expanded');

        // Find and expand the specific section
        const sectionMap = {
            'imported': 'Imported Items',
            'skipped': 'Skipped Items',
            'matched': 'Matched Checks',
            'mismatched': 'Amount Mismatches',
            'errors': 'Errors'
        };
        const sectionTitle = sectionMap[section];

        if (sectionTitle) {
            const headers = entry.querySelectorAll('.dm-log-section-header');
            headers.forEach(header => {
                if (header.textContent.includes(sectionTitle)) {
                    const content = header.nextElementSibling;
                    if (content) {
                        content.style.display = 'block';
                        const icon = header.querySelector('.dm-section-toggle');
                        if (icon) icon.style.transform = 'rotate(180deg)';
                    }
                    // Scroll to this section
                    setTimeout(() => {
                        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 50);
                }
            });
        }
    }
}

function toggleLogSection(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.dm-section-toggle');
    if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        if (icon) {
            icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
}

function clearActivityLog() {
    if (dataManagementState.activityLog.length === 0) return;
    if (confirm('Clear all activity log entries?')) {
        dataManagementState.activityLog = [];
        renderActivityLog();
        // Close modal if open
        const modal = document.getElementById('activity-log-modal');
        if (modal) modal.remove();
    }
}

// =====================================================
// Activity Log Modal
// =====================================================

function showActivityLogModal() {
    // Remove existing modal if any
    const existingModal = document.getElementById('activity-log-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'activity-log-modal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content activity-log-modal">
            <div class="modal-header">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div class="dm-card-icon dm-icon-gray" style="width:36px;height:36px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0;font-size:1.125rem;">Activity Log</h3>
                        <p style="margin:0;font-size:0.75rem;color:#64748b;">Import/Export results</p>
                    </div>
                </div>
                <button class="modal-close" onclick="closeActivityLogModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body" style="padding:0;">
                <div class="dm-activity-log" id="activity-log-modal-content" style="max-height:60vh;overflow-y:auto;padding:16px;">
                    <!-- Content rendered here -->
                </div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <button class="btn btn-secondary btn-sm" onclick="clearActivityLogFromModal()" ${dataManagementState.activityLog.length === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="margin-right:4px;">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Clear Log
                </button>
                <button class="btn btn-primary" onclick="closeActivityLogModal()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add modal styles if not present
    if (!document.getElementById('activity-log-modal-styles')) {
        const styles = document.createElement('style');
        styles.id = 'activity-log-modal-styles';
        styles.textContent = `
            .activity-log-modal {
                max-width: 600px;
                width: 90%;
            }
            .activity-log-modal .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
            }
            .activity-log-modal .modal-close {
                background: none;
                border: none;
                cursor: pointer;
                color: #64748b;
                padding: 4px;
                border-radius: 6px;
                transition: all 0.15s;
            }
            .activity-log-modal .modal-close:hover {
                background: #f1f5f9;
                color: #1e293b;
            }
            .activity-log-modal .modal-footer {
                padding: 12px 20px;
                border-top: 1px solid var(--border-color);
            }
            .btn-sm {
                padding: 6px 12px;
                font-size: 13px;
            }
        `;
        document.head.appendChild(styles);
    }

    // Render content
    const container = document.getElementById('activity-log-modal-content');
    console.log('Rendering modal content. Activity log entries:', dataManagementState.activityLog.length);
    console.log('Entries:', dataManagementState.activityLog.map(e => ({ id: e.id, title: e.title })));
    renderActivityLogContent(container);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeActivityLogModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeActivityLogModal();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function closeActivityLogModal() {
    const modal = document.getElementById('activity-log-modal');
    if (modal) modal.remove();
}

function showActivityLogModalForEntry(entryId, section = null) {
    showActivityLogModal();
    // After modal is open, expand the target entry and optionally the specific section
    setTimeout(() => {
        // Look in the modal container specifically
        const modalContainer = document.getElementById('activity-log-modal-content');
        if (!modalContainer) {
            console.error('Modal container not found');
            return;
        }

        // Find entry by data-id (use string comparison to avoid number precision issues)
        const entry = modalContainer.querySelector(`.dm-log-entry[data-id="${entryId}"]`);
        console.log('Looking for entry:', entryId, 'Found:', entry);

        if (entry) {
            entry.classList.add('expanded');
            entry.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // If a specific section is requested, expand it
            if (section) {
                const sectionMap = {
                    'imported': 'Imported Items',
                    'skipped': 'Skipped Items',
                    'matched': 'Matched Checks',
                    'mismatched': 'Amount Mismatches',
                    'errors': 'Errors'
                };
                const sectionTitle = sectionMap[section];
                if (sectionTitle) {
                    const headers = entry.querySelectorAll('.dm-log-section-header');
                    headers.forEach(header => {
                        if (header.textContent.includes(sectionTitle)) {
                            const content = header.nextElementSibling;
                            if (content && content.style.display === 'none') {
                                content.style.display = 'block';
                                const icon = header.querySelector('.dm-section-toggle');
                                if (icon) icon.style.transform = 'rotate(180deg)';
                            }
                            // Scroll to this section
                            setTimeout(() => {
                                header.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 100);
                        }
                    });
                }
            }
        } else {
            // Debug: show all entries in the modal
            const allEntries = modalContainer.querySelectorAll('.dm-log-entry');
            console.log('All entries in modal:', allEntries.length);
            allEntries.forEach(e => console.log('Entry data-id:', e.dataset.id));
        }
    }, 100);
}

function clearActivityLogFromModal() {
    if (dataManagementState.activityLog.length === 0) return;
    if (confirm('Clear all activity log entries?')) {
        dataManagementState.activityLog = [];
        renderActivityLog();
        closeActivityLogModal();
    }
}

// =====================================================
// Main Functions
// =====================================================

function loadDataManagementPage() {
    setupDataManagementTabs();
    setupExportOptions();
    loadAccountsForImport();
    setupImportFormatToggle();
}

// Toggle transfer account visibility based on import format
function setupImportFormatToggle() {
    const formatSelect = document.getElementById('dm-import-format');
    const transferGroup = document.getElementById('dm-transfer-account-group');

    if (formatSelect && transferGroup) {
        // Show transfer account for both Chase and AMEX (both have payment transactions)
        transferGroup.style.display = 'block';
    }
}

// Load accounts for Chase import dropdown
async function loadAccountsForImport() {
    try {
        // Only show active accounts (matches Accounts page)
        const response = await fetch(`${API_BASE}/accounts/index.php?user_id=${state.currentUser}`);
        const result = await response.json();
        if (result.success && result.data && result.data.accounts) {
            const accounts = result.data.accounts;

            // Populate main import account dropdown
            const select = document.getElementById('dm-import-account');
            if (select) {
                select.innerHTML = '<option value="">Select account...</option>';
                accounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = account.account_name;
                    select.appendChild(option);
                });
            }

            // Populate transfer account dropdown (for payments - bank accounts only)
            const transferSelect = document.getElementById('dm-transfer-account');
            if (transferSelect) {
                transferSelect.innerHTML = '<option value="">Skip payments / No transfer account</option>';
                // Only show checking/savings accounts as transfer targets
                const bankAccounts = accounts.filter(a =>
                    a.account_type === 'checking' || a.account_type === 'savings'
                );
                bankAccounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = account.account_name;
                    transferSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load accounts:', error);
    }
}


function setupDataManagementTabs() {
    document.querySelectorAll('.dm-nav-item').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.dm-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.dm-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab + '-content';
            document.getElementById(tabId)?.classList.add('active');
            dataManagementState.currentTab = btn.dataset.tab;
        };
    });
}

function setupExportOptions() {
    // Modern checkbox cards don't need additional setup
    // The CSS handles the visual states via :checked pseudo-class
}

// =====================================================
// Export Functions
// =====================================================

async function exportSelectedData() {
    const selected = Array.from(document.querySelectorAll('input[name="dm-export"]:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showToast('Please select at least one data type', 'warning');
        return;
    }

    const loading = document.getElementById('dm-export-loading');
    loading?.classList.add('active');

    try {
        for (const type of selected) {
            await exportDataAsXlsx(type);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        addActivityLog({
            type: 'export',
            status: 'success',
            title: `Export: ${selected.join(', ')}`,
            data: { exported: selected.length }
        });
        showToast(`${selected.length} file(s) exported as Excel`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        addActivityLog({
            type: 'export',
            status: 'error',
            title: 'Export Failed',
            data: { message: error.message }
        });
        showToast('Export failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

/**
 * Export data as XLSX file using ExcelJS
 */
async function exportDataAsXlsx(type) {
    const Excel = typeof ExcelJS !== 'undefined' ? ExcelJS : window.ExcelJS;
    if (!Excel) {
        console.warn('ExcelJS not loaded, falling back to CSV');
        window.open(`${API_BASE}/export/${type}.php?user_id=${state.currentUser}`);
        return;
    }

    const workbook = new Excel.Workbook();
    workbook.creator = 'Expense Tracker';
    workbook.created = new Date();

    // Common styles
    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
        }
    };

    const applyRowStyle = (row, isAlt) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
            if (isAlt) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
            }
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        });
    };

    switch (type) {
        case 'transactions':
            await exportTransactionsXlsx(workbook, headerStyle, applyRowStyle);
            break;
        case 'categories':
            await exportCategoriesXlsx(workbook, headerStyle, applyRowStyle);
            break;
        case 'accounts':
            await exportAccountsXlsx(workbook, headerStyle, applyRowStyle);
            break;
        case 'rules':
            await exportRulesXlsx(workbook, headerStyle, applyRowStyle);
            break;
        case 'recurring':
            await exportRecurringXlsx(workbook, headerStyle, applyRowStyle);
            break;
        case 'budgets':
            await exportBudgetsXlsx(workbook, headerStyle, applyRowStyle);
            break;
    }

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}

async function exportTransactionsXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/transactions/?user_id=${state.currentUser}&limit=100000`);
    const result = await response.json();
    const data = result.success ? (result.data.transactions || []) : [];

    const sheet = workbook.addWorksheet('Transactions');
    sheet.columns = [
        { width: 12 }, { width: 12 }, { width: 30 }, { width: 30 },
        { width: 20 }, { width: 12 }, { width: 10 }, { width: 10 },
        { width: 15 }, { width: 20 }, { width: 15 }
    ];

    // Title
    const titleRow = sheet.addRow(['Transactions Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:K1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:K2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    // Header
    const headers = ['Date', 'Post Date', 'Description', 'Original Desc', 'Vendor', 'Amount', 'Currency', 'Type', 'Account', 'Category', 'Status'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    // Data
    data.forEach((t, i) => {
        const row = sheet.addRow([
            t.transaction_date,
            t.post_date || '',
            t.description || '',
            t.original_description || '',
            t.vendor_name || '',
            parseFloat(t.amount) || 0,
            t.currency || 'USD',
            t.transaction_type || '',
            t.account_name || '',
            t.category_name || '',
            t.status || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
        row.getCell(6).numFmt = '#,##0.00';
        const amt = parseFloat(t.amount) || 0;
        row.getCell(6).font = { color: { argb: amt < 0 ? 'FFE74C3C' : 'FF27AE60' } };
    });
}

async function exportCategoriesXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/categories/?user_id=${state.currentUser}`);
    const result = await response.json();
    const data = result.success ? result.data : [];

    const sheet = workbook.addWorksheet('Categories');
    sheet.columns = [
        { width: 25 }, { width: 12 }, { width: 10 }, { width: 12 },
        { width: 12 }, { width: 20 }
    ];

    const titleRow = sheet.addRow(['Categories Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:F1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:F2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headers = ['Name', 'Type', 'Icon', 'Color', 'Sort Order', 'Parent'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    // Flatten hierarchical categories
    const flatCategories = [];
    const flatten = (cats, parent = null) => {
        cats.forEach(c => {
            flatCategories.push({ ...c, parent_name: parent });
            if (c.subcategories) flatten(c.subcategories, c.name);
        });
    };
    flatten(data);

    flatCategories.forEach((c, i) => {
        const row = sheet.addRow([
            c.name || '',
            c.category_type || '',
            c.icon || '',
            c.color || '',
            c.sort_order || 0,
            c.parent_name || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
        // Color indicator
        if (c.category_type === 'expense') {
            row.getCell(2).font = { color: { argb: 'FFE74C3C' } };
        } else if (c.category_type === 'income') {
            row.getCell(2).font = { color: { argb: 'FF27AE60' } };
        }
    });
}

async function exportAccountsXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/accounts/?user_id=${state.currentUser}`);
    const result = await response.json();
    const data = result.success ? result.data : [];

    const sheet = workbook.addWorksheet('Accounts');
    sheet.columns = [
        { width: 25 }, { width: 15 }, { width: 15 }, { width: 10 },
        { width: 15 }, { width: 15 }, { width: 20 }
    ];

    const titleRow = sheet.addRow(['Accounts Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:G1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:G2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headers = ['Account Name', 'Type', 'Balance', 'Currency', 'Credit Limit', 'Interest Rate', 'Institution'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    let totalBalance = 0;
    data.forEach((a, i) => {
        const balance = parseFloat(a.current_balance) || 0;
        totalBalance += balance;
        const row = sheet.addRow([
            a.account_name || '',
            a.account_type || '',
            balance,
            a.currency || 'USD',
            parseFloat(a.credit_limit) || '',
            a.interest_rate ? `${a.interest_rate}%` : '',
            a.institution_name || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
        row.getCell(3).numFmt = '#,##0.00';
        row.getCell(5).numFmt = '#,##0.00';
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['', 'Total:', totalBalance]);
    totalRow.font = { bold: true };
    totalRow.getCell(3).numFmt = '#,##0.00';
    totalRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
}

async function exportRulesXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/rules/?user_id=${state.currentUser}`);
    const result = await response.json();
    const data = result.success ? result.data : [];

    const sheet = workbook.addWorksheet('Categorization Rules');
    sheet.columns = [
        { width: 25 }, { width: 15 }, { width: 15 }, { width: 30 },
        { width: 10 }, { width: 12 }, { width: 20 }
    ];

    const titleRow = sheet.addRow(['Categorization Rules Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:G1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:G2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headers = ['Rule Name', 'Match Field', 'Match Type', 'Match Value', 'Priority', 'Hit Count', 'Category'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    data.forEach((r, i) => {
        const row = sheet.addRow([
            r.rule_name || '',
            r.match_field || '',
            r.match_type || '',
            r.match_value || '',
            r.priority || 0,
            r.hit_count || 0,
            r.category_name || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
    });
}

async function exportRecurringXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/recurring/?user_id=${state.currentUser}`);
    const result = await response.json();
    const data = result.success ? result.data : [];

    const sheet = workbook.addWorksheet('Recurring Transactions');
    sheet.columns = [
        { width: 25 }, { width: 20 }, { width: 12 }, { width: 10 },
        { width: 12 }, { width: 15 }, { width: 15 }, { width: 20 }
    ];

    const titleRow = sheet.addRow(['Recurring Transactions Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:H1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:H2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headers = ['Description', 'Vendor', 'Amount', 'Type', 'Frequency', 'Next Date', 'Account', 'Category'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    data.forEach((r, i) => {
        const row = sheet.addRow([
            r.description || '',
            r.vendor_name || '',
            parseFloat(r.amount) || 0,
            r.transaction_type || '',
            r.frequency || '',
            r.next_occurrence || '',
            r.account_name || '',
            r.category_name || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
        row.getCell(3).numFmt = '#,##0.00';
    });
}

async function exportBudgetsXlsx(workbook, headerStyle, applyRowStyle) {
    const response = await fetch(`${API_BASE}/budgets/?user_id=${state.currentUser}`);
    const result = await response.json();
    const data = result.success ? result.data : [];

    const sheet = workbook.addWorksheet('Budgets');
    sheet.columns = [
        { width: 25 }, { width: 12 }, { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 }, { width: 20 }
    ];

    const titleRow = sheet.addRow(['Budgets Export']);
    titleRow.font = { bold: true, size: 16 };
    sheet.mergeCells('A1:G1');
    titleRow.alignment = { horizontal: 'center' };

    const dateRow = sheet.addRow([`Exported: ${new Date().toLocaleDateString()}`]);
    dateRow.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:G2');
    dateRow.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headers = ['Budget Name', 'Type', 'Amount', 'Start Date', 'End Date', 'Alert %', 'Category'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: false }, (cell) => Object.assign(cell, headerStyle));

    data.forEach((b, i) => {
        const row = sheet.addRow([
            b.budget_name || '',
            b.budget_type || '',
            parseFloat(b.amount) || 0,
            b.start_date || '',
            b.end_date || '',
            b.alert_threshold || '',
            b.category_name || ''
        ]);
        applyRowStyle(row, i % 2 === 1);
        row.getCell(3).numFmt = '#,##0.00';
    });
}

// =====================================================
// Import Functions
// =====================================================

function updateImportFileName(input) {
    const label = document.getElementById('dm-import-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
    }
}

async function importData() {
    const fileInput = document.getElementById('dm-import-file');
    const resultBox = document.getElementById('dm-import-result');
    const accountId = document.getElementById('dm-import-account')?.value;
    const transferAccountId = document.getElementById('dm-transfer-account')?.value;
    const importFormat = document.getElementById('dm-import-format')?.value || 'chase';

    if (!fileInput?.files[0]) {
        showToast('Please select a CSV or ZIP file', 'warning');
        return;
    }

    const loading = document.getElementById('dm-import-loading');
    loading?.classList.add('active');
    if (resultBox) {
        resultBox.className = 'dm-result-box';
        resultBox.style.display = 'none';
    }

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('csv_file', fileInput.files[0]);
    formData.append('format', importFormat);

    // Only add account_id if selected
    if (accountId) {
        formData.append('account_id', accountId);
    }

    // Add transfer account for payment tracking (double-entry) - for both Chase and AMEX
    if (transferAccountId) {
        formData.append('transfer_account_id', transferAccountId);
    }

    try {
        // Step 1: Call preview API first to detect duplicates
        const previewResponse = await fetch(`${API_BASE}/import/preview.php`, {
            method: 'POST',
            body: formData
        });

        const previewResult = await previewResponse.json();
        const fileName = fileInput.files[0]?.name || 'Unknown file';

        if (!previewResult.success) {
            addActivityLog({
                type: 'import',
                status: 'error',
                title: `Import Failed: ${fileName}`,
                data: { message: previewResult.message || 'Preview failed' }
            });
            showToast(previewResult.message || 'Preview failed', 'error');
            loading?.classList.remove('active');
            return;
        }

        // Check if there's anything that needs user review
        const summary = previewResult.data.summary || {};
        const hasDuplicateGroups = previewResult.data.duplicate_groups?.length > 0;
        const hasExistingInDb = (summary.existing_in_db || 0) > 0;
        const hasPayments = (summary.payments || 0) > 0;
        const needsReview = hasDuplicateGroups || hasExistingInDb || hasPayments;

        if (needsReview) {
            // Show preview modal for user to review and select
            loading?.classList.remove('active');
            showImportPreview(previewResult.data, fileName, importFormat, transferAccountId);
        } else {
            // 100% unique - proceed with direct import (no modal needed)
            loading?.classList.remove('active');
            await confirmImportDirect(previewResult.data, fileName, importFormat, transferAccountId);
        }

    } catch (error) {
        console.error('Import error:', error);
        addActivityLog({
            type: 'import',
            status: 'error',
            title: `Import Failed: ${fileInput.files[0]?.name || 'Unknown'}`,
            data: { message: error.message }
        });
        showToast('Import failed', 'error');
        loading?.classList.remove('active');
    }
}

// =====================================================
// Import Preview Functions (2-step import with duplicate selection)
// =====================================================

// Store preview data for later use
window._importPreviewData = null;
window._importPreviewFileName = '';
window._importPreviewFormat = '';
window._importPreviewTransferAccountId = null;

function showImportPreview(previewData, fileName, importFormat, transferAccountId) {
    window._importPreviewData = previewData;
    window._importPreviewFileName = fileName;
    window._importPreviewFormat = importFormat;
    window._importPreviewTransferAccountId = transferAccountId;

    const overlay = document.getElementById('import-preview-overlay');
    if (!overlay) {
        console.error('Import preview modal not found');
        return;
    }

    // Populate summary section
    const summaryEl = document.getElementById('import-preview-summary');
    if (summaryEl) {
        const summary = previewData.summary || {};
        summaryEl.innerHTML = `
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                <div style="background:#dbeafe;padding:8px 14px;border-radius:8px;text-align:center;min-width:80px;">
                    <div style="font-size:20px;font-weight:600;color:#1d4ed8;">${summary.total || 0}</div>
                    <div style="font-size:11px;color:#3b82f6;text-transform:uppercase;">Total</div>
                </div>
                <div style="background:#d1fae5;padding:8px 14px;border-radius:8px;text-align:center;min-width:80px;">
                    <div style="font-size:20px;font-weight:600;color:#059669;">${summary.unique || 0}</div>
                    <div style="font-size:11px;color:#10b981;text-transform:uppercase;">Unique</div>
                </div>
                <div style="background:#fef3c7;padding:8px 14px;border-radius:8px;text-align:center;min-width:80px;">
                    <div style="font-size:20px;font-weight:600;color:#d97706;">${summary.duplicate_items || 0}</div>
                    <div style="font-size:11px;color:#f59e0b;text-transform:uppercase;">Duplicates</div>
                </div>
                <div style="background:#f1f5f9;padding:8px 14px;border-radius:8px;text-align:center;min-width:80px;">
                    <div style="font-size:20px;font-weight:600;color:#64748b;">${summary.existing_in_db || 0}</div>
                    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Existing</div>
                </div>
                <div style="background:#fef2f2;padding:8px 14px;border-radius:8px;text-align:center;min-width:80px;">
                    <div style="font-size:20px;font-weight:600;color:#dc2626;">${summary.payments || 0}</div>
                    <div style="font-size:11px;color:#ef4444;text-transform:uppercase;">Payments</div>
                </div>
            </div>
        `;
    }

    // Populate duplicate groups section (main selection area)
    const duplicatesEl = document.getElementById('import-preview-duplicates');
    if (duplicatesEl && previewData.duplicate_groups?.length > 0) {
        duplicatesEl.innerHTML = `
            <div style="margin-bottom:16px;">
                <h4 style="margin:0 0 8px;color:#d97706;font-size:15px;display:flex;align-items:center;gap:8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Duplicate Groups - Select which to import
                </h4>
                <p style="margin:0;font-size:13px;color:#64748b;">
                    These transactions appear multiple times in your CSV with identical date, description, and amount.
                    Select which ones are real separate transactions to import.
                </p>
            </div>
            ${previewData.duplicate_groups.map((group, gIdx) => `
                <div class="duplicate-group" data-group-idx="${gIdx}" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                        <div style="flex:1;">
                            <div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${group.description}</div>
                            <div style="font-size:13px;color:#64748b;">${group.date} &bull; ${group.count} identical transactions</div>
                        </div>
                        <div style="font-weight:600;color:${group.amount < 0 ? '#dc2626' : '#059669'};font-size:16px;">
                            ${group.amount < 0 ? '-' : '+'}$${Math.abs(group.amount).toFixed(2)}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                        <span style="font-size:12px;color:#78716c;margin-right:4px;line-height:28px;">Import:</span>
                        ${Array.from({length: group.count + 1}, (_, i) => `
                            <button type="button"
                                class="dup-count-btn ${i === 0 ? 'selected' : ''}"
                                data-group="${gIdx}"
                                data-count="${i}"
                                onclick="selectDuplicateCount(${gIdx}, ${i})"
                                style="padding:4px 12px;border-radius:6px;border:1px solid #d4d4d4;background:${i === 0 ? '#1d4ed8' : '#fff'};color:${i === 0 ? '#fff' : '#374151'};font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;">
                                ${i === 0 ? 'None' : i === group.count ? 'All ' + i : i}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        `;
    } else {
        duplicatesEl.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;">No duplicate groups found</p>';
    }

    // Populate unique transactions section
    const uniqueEl = document.getElementById('import-preview-unique');
    const uniqueListEl = document.getElementById('import-preview-unique-list');
    if (uniqueEl && previewData.unique?.length > 0) {
        uniqueEl.style.display = 'block';
        uniqueListEl.innerHTML = previewData.unique.map(txn => `
            <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">
                <div style="flex:1;">
                    <div style="color:#1e293b;">${txn.description.substring(0, 50)}</div>
                    <div style="color:#9ca3af;font-size:12px;">${txn.date}</div>
                </div>
                <div style="font-weight:500;color:${txn.amount < 0 ? '#dc2626' : '#059669'};">
                    ${txn.amount < 0 ? '-' : '+'}$${Math.abs(txn.amount).toFixed(2)}
                </div>
            </div>
        `).join('');
    } else {
        uniqueEl.style.display = 'none';
    }

    // Populate existing in DB section (with checkboxes to force import)
    const existingEl = document.getElementById('import-preview-existing');
    const existingListEl = document.getElementById('import-preview-existing-list');
    if (existingEl && previewData.existing_in_db?.length > 0) {
        existingEl.style.display = 'block';
        existingListEl.innerHTML = previewData.existing_in_db.map((txn, idx) => `
            <div class="skip-item existing-item" data-idx="${idx}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;cursor:pointer;" onclick="toggleSkipItem('existing', ${idx})">
                <input type="checkbox" class="existing-checkbox" data-idx="${idx}" style="width:16px;height:16px;cursor:pointer;" onclick="event.stopPropagation(); toggleSkipItem('existing', ${idx}, this.checked)">
                <div style="flex:1;">
                    <div style="color:#6b7280;">${txn.description.substring(0, 50)}</div>
                    <div style="color:#9ca3af;font-size:12px;">${txn.date}</div>
                </div>
                <div style="font-weight:500;color:${txn.amount < 0 ? '#dc2626' : '#059669'};">
                    ${txn.amount < 0 ? '-' : '+'}$${Math.abs(txn.amount).toFixed(2)}
                </div>
            </div>
        `).join('');
    } else {
        existingEl.style.display = 'none';
    }

    // Populate payments section (with checkboxes to force import)
    const paymentsEl = document.getElementById('import-preview-payments');
    const paymentsListEl = document.getElementById('import-preview-payments-list');
    if (paymentsEl && previewData.payments?.length > 0) {
        paymentsEl.style.display = 'block';
        paymentsListEl.innerHTML = previewData.payments.map((txn, idx) => `
            <div class="skip-item payment-item" data-idx="${idx}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;background:#fef3c7;cursor:pointer;" onclick="toggleSkipItem('payment', ${idx})">
                <input type="checkbox" class="payment-checkbox" data-idx="${idx}" style="width:16px;height:16px;cursor:pointer;" onclick="event.stopPropagation(); toggleSkipItem('payment', ${idx}, this.checked)">
                <div style="flex:1;">
                    <div style="color:#92400e;">${txn.description.substring(0, 50)}</div>
                    <div style="color:#b45309;font-size:12px;">${txn.date}</div>
                </div>
                <div style="font-weight:500;color:#059669;">
                    +$${Math.abs(txn.amount).toFixed(2)}
                </div>
            </div>
        `).join('');
    } else {
        paymentsEl.style.display = 'none';
    }

    // Update footer count
    updateImportPreviewCount();

    // Show modal
    overlay.classList.add('active');
}

function selectDuplicateCount(groupIdx, count) {
    // Update button states for this group
    const groupEl = document.querySelector(`.duplicate-group[data-group-idx="${groupIdx}"]`);
    if (groupEl) {
        groupEl.querySelectorAll('.dup-count-btn').forEach(btn => {
            const btnCount = parseInt(btn.dataset.count);
            const isSelected = btnCount === count;
            btn.classList.toggle('selected', isSelected);
            btn.style.background = isSelected ? '#1d4ed8' : '#fff';
            btn.style.color = isSelected ? '#fff' : '#374151';
        });
    }

    // Update footer count
    updateImportPreviewCount();
}

// Toggle skip item checkbox (existing_in_db or payment)
function toggleSkipItem(type, idx, forceState = null) {
    const checkboxClass = type === 'existing' ? 'existing-checkbox' : 'payment-checkbox';
    const checkbox = document.querySelector(`.${checkboxClass}[data-idx="${idx}"]`);

    if (checkbox) {
        if (forceState !== null) {
            checkbox.checked = forceState;
        } else {
            checkbox.checked = !checkbox.checked;
        }

        // Update row visual state
        const row = checkbox.closest('.skip-item');
        if (row) {
            row.style.opacity = checkbox.checked ? '1' : '0.6';
            row.style.background = checkbox.checked
                ? (type === 'existing' ? '#dbeafe' : '#d1fae5')
                : (type === 'existing' ? '#fff' : '#fef3c7');
        }
    }

    // Update footer count
    updateImportPreviewCount();
}

function updateImportPreviewCount() {
    const countEl = document.getElementById('import-preview-count');
    const confirmBtn = document.getElementById('confirm-import-btn');

    if (!countEl || !window._importPreviewData) return;

    // Count unique transactions
    const uniqueCount = window._importPreviewData.unique?.length || 0;

    // Count selected duplicates
    let duplicateCount = 0;
    document.querySelectorAll('.duplicate-group').forEach(groupEl => {
        const selectedBtn = groupEl.querySelector('.dup-count-btn.selected');
        if (selectedBtn) {
            duplicateCount += parseInt(selectedBtn.dataset.count) || 0;
        }
    });

    // Count checked existing_in_db items (force import)
    const existingCheckedCount = document.querySelectorAll('.existing-checkbox:checked').length;

    // Count checked payment items (force import)
    const paymentCheckedCount = document.querySelectorAll('.payment-checkbox:checked').length;

    const totalToImport = uniqueCount + duplicateCount + existingCheckedCount + paymentCheckedCount;
    countEl.innerHTML = `<strong>${totalToImport}</strong> transaction${totalToImport !== 1 ? 's' : ''} will be imported`;

    // Update confirm button text
    if (confirmBtn) {
        confirmBtn.textContent = `Import ${totalToImport} Transaction${totalToImport !== 1 ? 's' : ''}`;
        confirmBtn.disabled = totalToImport === 0;
    }
}

function togglePreviewSection(section) {
    const listEl = document.getElementById(`import-preview-${section}-list`);
    if (listEl) {
        listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
    }
}

function closeImportPreview() {
    const overlay = document.getElementById('import-preview-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    // Clear stored data
    window._importPreviewData = null;
    window._importPreviewFileName = '';
    window._importPreviewFormat = '';
    window._importPreviewTransferAccountId = null;

    // Clear file input
    const fileInput = document.getElementById('dm-import-file');
    if (fileInput) {
        fileInput.value = '';
        updateImportFileName(fileInput);
    }
}

async function confirmImportPreview() {
    if (!window._importPreviewData) {
        showToast('No preview data available', 'error');
        return;
    }

    const previewData = window._importPreviewData;
    const fileName = window._importPreviewFileName;

    // Collect transactions to import
    const transactionsToImport = [];

    // Add all unique transactions
    if (previewData.unique) {
        previewData.unique.forEach(txn => {
            transactionsToImport.push({
                date: txn.date,
                description: txn.description,
                amount: txn.amount
            });
        });
    }

    // Add selected duplicates from each group
    const duplicateGroups = previewData.duplicate_groups || [];
    document.querySelectorAll('.duplicate-group').forEach((groupEl, gIdx) => {
        const selectedBtn = groupEl.querySelector('.dup-count-btn.selected');
        const selectedCount = selectedBtn ? parseInt(selectedBtn.dataset.count) : 0;

        if (selectedCount > 0 && duplicateGroups[gIdx]) {
            const group = duplicateGroups[gIdx];
            // Add the requested number of copies
            for (let i = 0; i < selectedCount; i++) {
                transactionsToImport.push({
                    date: group.date,
                    description: group.description,
                    amount: group.amount
                });
            }
        }
    });

    // Add checked existing_in_db items (force import)
    document.querySelectorAll('.existing-checkbox:checked').forEach(checkbox => {
        const idx = parseInt(checkbox.dataset.idx);
        const txn = previewData.existing_in_db?.[idx];
        if (txn) {
            transactionsToImport.push({
                date: txn.date,
                description: txn.description,
                amount: txn.amount
            });
        }
    });

    // Add checked payment items (force import)
    document.querySelectorAll('.payment-checkbox:checked').forEach(checkbox => {
        const idx = parseInt(checkbox.dataset.idx);
        const txn = previewData.payments?.[idx];
        if (txn) {
            transactionsToImport.push({
                date: txn.date,
                description: txn.description,
                amount: txn.amount
            });
        }
    });

    if (transactionsToImport.length === 0) {
        showToast('No transactions selected to import', 'warning');
        return;
    }

    // Show loading
    const loading = document.getElementById('dm-import-loading');
    loading?.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/import/confirm.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser,
                account_id: previewData.account_id,
                transactions: transactionsToImport
            })
        });

        const result = await response.json();

        if (result.success) {
            // Close modal
            closeImportPreview();

            // Get indices of force-imported existing/payment items
            const forceImportedExistingIndices = new Set(
                Array.from(document.querySelectorAll('.existing-checkbox:checked'))
                    .map(cb => parseInt(cb.dataset.idx))
            );
            const forceImportedPaymentIndices = new Set(
                Array.from(document.querySelectorAll('.payment-checkbox:checked'))
                    .map(cb => parseInt(cb.dataset.idx))
            );

            // Calculate actual skipped (exclude force-imported)
            const existingSkipped = (previewData.existing_in_db || []).filter((_, idx) => !forceImportedExistingIndices.has(idx));
            const paymentsSkipped = (previewData.payments || []).filter((_, idx) => !forceImportedPaymentIndices.has(idx));
            const skippedCount = existingSkipped.length + paymentsSkipped.length;

            const duplicateSkipped = (previewData.summary?.duplicate_items || 0) -
                transactionsToImport.filter(t =>
                    duplicateGroups.some(g => g.date === t.date && g.description === t.description)
                ).length;

            // Add to activity log
            addActivityLog({
                type: 'import',
                status: 'success',
                title: `Import: ${fileName}`,
                data: {
                    imported: result.data.imported,
                    skipped: skippedCount + Math.max(0, duplicateSkipped),
                    imported_details: result.data.imported_details,
                    skipped_details: [
                        ...existingSkipped.map(t => ({
                            reason: 'Already exists',
                            description: t.description,
                            amount: t.amount,
                            date: t.date
                        })),
                        ...paymentsSkipped.map(t => ({
                            reason: 'Payment',
                            description: t.description,
                            amount: t.amount,
                            date: t.date
                        }))
                    ],
                    errors: result.data.errors
                }
            });

            showToast(`Imported ${result.data.imported} transaction${result.data.imported !== 1 ? 's' : ''}`, 'success');

            // Refresh transactions if on transactions page
            if (typeof loadTransactions === 'function') {
                loadTransactions();
            }
            // Refresh dashboard if visible
            if (typeof loadDashboard === 'function') {
                loadDashboard();
            }
        } else {
            addActivityLog({
                type: 'import',
                status: 'error',
                title: `Import Failed: ${fileName}`,
                data: { message: result.message || 'Import failed' }
            });
            showToast(result.message || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Confirm import error:', error);
        addActivityLog({
            type: 'import',
            status: 'error',
            title: `Import Failed: ${fileName}`,
            data: { message: error.message }
        });
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// Direct import when no duplicate groups exist
async function confirmImportDirect(previewData, fileName, importFormat, transferAccountId) {
    // If no unique transactions, just show summary
    if (!previewData.unique || previewData.unique.length === 0) {
        const skippedCount = (previewData.existing_in_db?.length || 0) + (previewData.payments?.length || 0);

        addActivityLog({
            type: 'import',
            status: 'success',
            title: `Import: ${fileName}`,
            data: {
                imported: 0,
                skipped: skippedCount,
                skipped_details: [
                    ...(previewData.existing_in_db || []).map(t => ({
                        reason: 'Already exists',
                        description: t.description,
                        amount: t.amount,
                        date: t.date
                    })),
                    ...(previewData.payments || []).map(t => ({
                        reason: 'Payment',
                        description: t.description,
                        amount: t.amount,
                        date: t.date
                    }))
                ]
            }
        });

        showToast(`No new transactions to import (${skippedCount} skipped)`, 'info');

        // Clear file input
        const fileInput = document.getElementById('dm-import-file');
        if (fileInput) {
            fileInput.value = '';
            updateImportFileName(fileInput);
        }
        return;
    }

    // Prepare transactions from unique list
    const transactionsToImport = previewData.unique.map(txn => ({
        date: txn.date,
        description: txn.description,
        amount: txn.amount
    }));

    const loading = document.getElementById('dm-import-loading');
    loading?.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/import/confirm.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser,
                account_id: previewData.account_id,
                transactions: transactionsToImport
            })
        });

        const result = await response.json();

        if (result.success) {
            const skippedCount = (previewData.existing_in_db?.length || 0) + (previewData.payments?.length || 0);

            addActivityLog({
                type: 'import',
                status: 'success',
                title: `Import: ${fileName}`,
                data: {
                    imported: result.data.imported,
                    skipped: skippedCount,
                    imported_details: result.data.imported_details,
                    skipped_details: [
                        ...(previewData.existing_in_db || []).map(t => ({
                            reason: 'Already exists',
                            description: t.description,
                            amount: t.amount,
                            date: t.date
                        })),
                        ...(previewData.payments || []).map(t => ({
                            reason: 'Payment',
                            description: t.description,
                            amount: t.amount,
                            date: t.date
                        }))
                    ],
                    errors: result.data.errors
                }
            });

            showToast(`Imported ${result.data.imported} transaction${result.data.imported !== 1 ? 's' : ''}`, 'success');

            // Clear file input
            const fileInput = document.getElementById('dm-import-file');
            if (fileInput) {
                fileInput.value = '';
                updateImportFileName(fileInput);
            }

            // Refresh transactions if on transactions page
            if (typeof loadTransactions === 'function') {
                loadTransactions();
            }
            // Refresh dashboard if visible
            if (typeof loadDashboard === 'function') {
                loadDashboard();
            }
        } else {
            addActivityLog({
                type: 'import',
                status: 'error',
                title: `Import Failed: ${fileName}`,
                data: { message: result.message || 'Import failed' }
            });
            showToast(result.message || 'Import failed', 'error');
        }
    } catch (error) {
        console.error('Direct import error:', error);
        addActivityLog({
            type: 'import',
            status: 'error',
            title: `Import Failed: ${fileName}`,
            data: { message: error.message }
        });
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// Expose import preview functions globally
window.showImportPreview = showImportPreview;
window.selectDuplicateCount = selectDuplicateCount;
window.updateImportPreviewCount = updateImportPreviewCount;
window.togglePreviewSection = togglePreviewSection;
window.closeImportPreview = closeImportPreview;
window.confirmImportPreview = confirmImportPreview;
window.confirmImportDirect = confirmImportDirect;
window.toggleSkipItem = toggleSkipItem;

// =====================================================
// Backup Functions
// =====================================================

async function createFullBackup() {
    const loading = document.getElementById('dm-backup-loading');
    loading?.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/backup/create.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.currentUser })
        });

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'backup.zip';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            addActivityLog({
                type: 'backup',
                status: 'success',
                title: `Backup: ${filename}`,
                data: { exported: 1 }
            });
            showToast('Backup downloaded', 'success');
        } else {
            const result = await response.json();
            addActivityLog({
                type: 'backup',
                status: 'error',
                title: 'Backup Failed',
                data: { message: result.message || 'Unknown error' }
            });
            showToast('Backup failed: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Backup error:', error);
        addActivityLog({
            type: 'backup',
            status: 'error',
            title: 'Backup Failed',
            data: { message: error.message }
        });
        showToast('Backup failed: ' + error.message, 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Restore Functions
// =====================================================

function updateRestoreFileName(input) {
    const label = document.getElementById('dm-restore-file-name');
    if (label) {
        label.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
    }
}

async function restoreBackup() {
    const fileInput = document.getElementById('dm-restore-file');
    const mode = document.querySelector('input[name="dm-restore-mode"]:checked')?.value || 'merge';
    const resultBox = document.getElementById('dm-restore-result');

    if (!fileInput?.files[0]) {
        showToast('Please select a backup ZIP file', 'warning');
        return;
    }

    if (mode === 'replace') {
        if (!confirm('WARNING: This will delete ALL your existing data before restoring. Are you sure?')) {
            return;
        }
    }

    const loading = document.getElementById('dm-restore-loading');
    loading?.classList.add('active');
    if (resultBox) {
        resultBox.className = 'dm-result-box';
        resultBox.style.display = 'none';
    }

    const formData = new FormData();
    formData.append('user_id', state.currentUser);
    formData.append('mode', mode);
    formData.append('backup_file', fileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE}/restore/upload.php`, {
            method: 'POST',
            body: formData
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error('Server response:', text);
            throw new Error('Server returned invalid response');
        }

        const fileName = fileInput.files[0]?.name || 'Unknown file';

        if (result.success) {
            // Calculate total imported
            let totalImported = 0;
            if (result.data.stats?.data) {
                for (const stat of Object.values(result.data.stats.data)) {
                    totalImported += stat.imported || 0;
                }
            }

            addActivityLog({
                type: 'restore',
                status: 'success',
                title: `Restore: ${fileName}`,
                data: { imported: totalImported, mode: result.data.mode }
            });
            showToast('Backup restored successfully', 'success');
            fileInput.value = '';
            updateRestoreFileName(fileInput);
        } else {
            addActivityLog({
                type: 'restore',
                status: 'error',
                title: `Restore Failed: ${fileName}`,
                data: { message: result.message || 'Restore failed' }
            });
            showToast(result.message || 'Restore failed', 'error');
        }
    } catch (error) {
        console.error('Restore error:', error);
        addActivityLog({
            type: 'restore',
            status: 'error',
            title: `Restore Failed: ${fileInput.files[0]?.name || 'Unknown'}`,
            data: { message: error.message }
        });
        showToast('Restore failed', 'error');
    } finally {
        loading?.classList.remove('active');
    }
}

// =====================================================
// Check Match Success Modal
// =====================================================

function showCheckMatchedModal(matchedChecks, mismatchedChecks = null) {
    // Remove existing modal if any
    const existingModal = document.getElementById('check-matched-modal');
    if (existingModal) existingModal.remove();

    const formatCurrency = (amount) => {
        const num = parseFloat(amount) || 0;
        return '$' + Math.abs(num).toFixed(2);
    };

    const totalAmount = matchedChecks.reduce((sum, check) => sum + Math.abs(parseFloat(check.amount) || 0), 0);

    const checksHtml = matchedChecks.map(check => `
        <div class="matched-item">
            <div class="matched-info">
                <span class="check-number">Check #${check.check_number}</span>
                <span class="payee">${check.payee || 'Unknown'}</span>
            </div>
            <span class="amount">${formatCurrency(check.amount)}</span>
        </div>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'check-matched-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content check-matched-modal">
            <div class="modal-header success">
                <div class="modal-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <h3>Checks Matched & Cleared</h3>
            </div>
            <div class="modal-body">
                <div class="success-summary">
                    <div class="summary-stat">
                        <span class="stat-value">${matchedChecks.length}</span>
                        <span class="stat-label">Check${matchedChecks.length > 1 ? 's' : ''} Cleared</span>
                    </div>
                    <div class="summary-stat">
                        <span class="stat-value">${formatCurrency(totalAmount)}</span>
                        <span class="stat-label">Total Amount</span>
                    </div>
                </div>
                <div class="matched-list">
                    ${checksHtml}
                </div>
                ${mismatchedChecks?.length > 0 ? `
                    <div class="mismatch-notice">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span>${mismatchedChecks.length} check${mismatchedChecks.length > 1 ? 's have' : ' has'} amount mismatch</span>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeCheckMatchedModal(${mismatchedChecks?.length > 0 ? 'true' : 'false'})">
                    ${mismatchedChecks?.length > 0 ? 'View Mismatches' : 'Close'}
                </button>
                <button class="btn btn-primary" onclick="goToWriteChecksFromMatched()">View in Write Checks</button>
            </div>
        </div>
    `;

    // Store mismatched checks for showing after
    if (mismatchedChecks?.length > 0) {
        window._pendingMismatchedChecks = mismatchedChecks;
    }

    document.body.appendChild(modal);

    // Add styles if not present
    if (!document.getElementById('check-matched-styles')) {
        const styles = document.createElement('style');
        styles.id = 'check-matched-styles';
        styles.textContent = `
            .check-matched-modal {
                max-width: 450px;
            }
            .modal-header.success {
                background: linear-gradient(135deg, #059669 0%, #047857 100%);
                color: white;
                padding: 1.5rem;
                border-radius: 12px 12px 0 0;
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            .modal-header.success h3 {
                margin: 0;
                font-size: 1.25rem;
            }
            .success-summary {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            .summary-stat {
                flex: 1;
                background: #d1fae5;
                border-radius: 8px;
                padding: 1rem;
                text-align: center;
            }
            .summary-stat .stat-value {
                display: block;
                font-size: 1.5rem;
                font-weight: 600;
                color: #059669;
            }
            .summary-stat .stat-label {
                font-size: 0.75rem;
                color: #065f46;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .matched-list {
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
            }
            .matched-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #f3f4f6;
            }
            .matched-item:last-child {
                border-bottom: none;
            }
            .matched-info {
                display: flex;
                flex-direction: column;
                gap: 0.125rem;
            }
            .matched-info .check-number {
                font-weight: 600;
                color: #1f2937;
            }
            .matched-info .payee {
                font-size: 0.875rem;
                color: #6b7280;
            }
            .matched-item .amount {
                font-weight: 600;
                color: #059669;
            }
            .mismatch-notice {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-top: 1rem;
                padding: 0.75rem;
                background: #fef3c7;
                border-radius: 8px;
                color: #92400e;
                font-size: 0.875rem;
            }
            .mismatch-notice svg {
                flex-shrink: 0;
                color: #f59e0b;
            }
        `;
        document.head.appendChild(styles);
    }
}

function closeCheckMatchedModal(showMismatches = false) {
    const modal = document.getElementById('check-matched-modal');
    if (modal) modal.remove();

    if (showMismatches && window._pendingMismatchedChecks?.length > 0) {
        showCheckMismatchModal(window._pendingMismatchedChecks);
        window._pendingMismatchedChecks = null;
    }
}

function goToWriteChecksFromMatched() {
    closeCheckMatchedModal(false);
    window._pendingMismatchedChecks = null;
    if (typeof navigateTo === 'function') {
        navigateTo('checks');
    } else {
        window.location.hash = '#checks';
    }
}

// =====================================================
// Check Mismatch Warning Modal
// =====================================================

function showCheckMismatchModal(mismatchedChecks) {
    // Remove existing modal if any
    const existingModal = document.getElementById('check-mismatch-modal');
    if (existingModal) existingModal.remove();

    const formatCurrency = (amount) => {
        const num = parseFloat(amount) || 0;
        return '$' + Math.abs(num).toFixed(2);
    };

    const checksHtml = mismatchedChecks.map(check => `
        <div class="mismatch-item">
            <div class="mismatch-header">
                <span class="check-number">Check #${check.check_number}</span>
                <span class="payee">${check.payee || 'Unknown'}</span>
            </div>
            <div class="mismatch-details">
                <div class="amount-row">
                    <span class="label">Expected (Check):</span>
                    <span class="amount">${formatCurrency(check.check_amount)}</span>
                </div>
                <div class="amount-row">
                    <span class="label">Actual (Bank):</span>
                    <span class="amount">${formatCurrency(check.imported_amount)}</span>
                </div>
                <div class="amount-row difference">
                    <span class="label">Difference:</span>
                    <span class="amount">${formatCurrency(Math.abs(check.check_amount) - Math.abs(check.imported_amount))}</span>
                </div>
            </div>
        </div>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'check-mismatch-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content check-mismatch-modal">
            <div class="modal-header warning">
                <div class="modal-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <h3>Check Amount Mismatch</h3>
            </div>
            <div class="modal-body">
                <p class="warning-text">The following checks have different amounts than recorded. Please review manually:</p>
                <div class="mismatch-list">
                    ${checksHtml}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeCheckMismatchModal()">Close</button>
                <button class="btn btn-primary" onclick="goToWriteChecks()">Go to Write Checks</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add styles if not present
    if (!document.getElementById('check-mismatch-styles')) {
        const styles = document.createElement('style');
        styles.id = 'check-mismatch-styles';
        styles.textContent = `
            .check-mismatch-modal {
                max-width: 500px;
            }
            .modal-header.warning {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: white;
                padding: 1.5rem;
                border-radius: 12px 12px 0 0;
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            .modal-header.warning h3 {
                margin: 0;
                font-size: 1.25rem;
            }
            .modal-icon {
                background: rgba(255,255,255,0.2);
                padding: 0.5rem;
                border-radius: 8px;
            }
            .warning-text {
                color: #92400e;
                background: #fef3c7;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                margin-bottom: 1rem;
                font-size: 0.875rem;
            }
            .mismatch-list {
                max-height: 300px;
                overflow-y: auto;
            }
            .mismatch-item {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 0.75rem;
            }
            .mismatch-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.75rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid #e5e7eb;
            }
            .check-number {
                font-weight: 600;
                color: #1f2937;
            }
            .payee {
                color: #6b7280;
                font-size: 0.875rem;
            }
            .mismatch-details {
                font-size: 0.875rem;
            }
            .amount-row {
                display: flex;
                justify-content: space-between;
                padding: 0.25rem 0;
            }
            .amount-row .label {
                color: #6b7280;
            }
            .amount-row .amount {
                font-weight: 500;
            }
            .amount-row.difference {
                margin-top: 0.5rem;
                padding-top: 0.5rem;
                border-top: 1px dashed #e5e7eb;
                color: #dc2626;
            }
            .amount-row.difference .amount {
                color: #dc2626;
            }
        `;
        document.head.appendChild(styles);
    }
}

function closeCheckMismatchModal() {
    const modal = document.getElementById('check-mismatch-modal');
    if (modal) modal.remove();
}

function goToWriteChecks() {
    closeCheckMismatchModal();
    if (typeof navigateTo === 'function') {
        navigateTo('checks');
    } else {
        window.location.hash = '#checks';
    }
}

// =====================================================
// Expose Functions Globally
// =====================================================
window.loadDataManagementPage = loadDataManagementPage;
window.exportSelectedData = exportSelectedData;
window.updateImportFileName = updateImportFileName;
window.importData = importData;
window.createFullBackup = createFullBackup;
window.updateRestoreFileName = updateRestoreFileName;
window.restoreBackup = restoreBackup;
window.loadAccountsForImport = loadAccountsForImport;
window.toggleLogEntry = toggleLogEntry;
window.scrollToLogSection = scrollToLogSection;
window.toggleLogSection = toggleLogSection;
window.clearActivityLog = clearActivityLog;
window.showActivityLogModal = showActivityLogModal;
window.closeActivityLogModal = closeActivityLogModal;
window.showActivityLogModalForEntry = showActivityLogModalForEntry;
window.clearActivityLogFromModal = clearActivityLogFromModal;
window.showCheckMismatchModal = showCheckMismatchModal;
window.closeCheckMismatchModal = closeCheckMismatchModal;
window.goToWriteChecks = goToWriteChecks;
window.showCheckMatchedModal = showCheckMatchedModal;
window.closeCheckMatchedModal = closeCheckMatchedModal;
window.goToWriteChecksFromMatched = goToWriteChecksFromMatched;

// =====================================================
// Pending Duplicates Modal Functions
// =====================================================

// Store pending duplicates data
window._pendingDuplicatesData = [];
window._pendingDuplicatesAccountId = null;

function showPendingDuplicatesModal(duplicates, accountId) {
    if (!duplicates || duplicates.length === 0) return;

    window._pendingDuplicatesData = duplicates;
    window._pendingDuplicatesAccountId = accountId;

    const overlay = document.getElementById('pending-duplicates-overlay');
    const countEl = document.getElementById('pending-dup-count');
    const listEl = document.getElementById('pending-dup-list');
    const selectAllEl = document.getElementById('pending-dup-select-all');

    if (!overlay || !listEl) return;

    // Update count
    if (countEl) countEl.textContent = duplicates.length;

    // Reset select all checkbox
    if (selectAllEl) selectAllEl.checked = false;

    // Render duplicates list
    listEl.innerHTML = duplicates.map((dup, index) => `
        <div class="pending-dup-item" data-index="${index}" onclick="togglePendingDuplicate(${index})">
            <input type="checkbox" id="pending-dup-${index}" onclick="event.stopPropagation()">
            <div class="pending-dup-item-content">
                <div class="pending-dup-item-desc">${dup.description}</div>
                <div class="pending-dup-item-meta">
                    <span>${dup.date}</span>
                    <span class="pending-dup-existing">Existing transaction #${dup.existing_id}</span>
                </div>
            </div>
            <div class="pending-dup-item-amount ${dup.amount < 0 ? '' : 'positive'}">
                ${dup.amount < 0 ? '-' : '+'}$${Math.abs(dup.amount).toFixed(2)}
            </div>
        </div>
    `).join('');

    // Add click handlers to checkboxes
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb, index) => {
        cb.addEventListener('change', function(e) {
            const item = this.closest('.pending-dup-item');
            if (item) {
                item.classList.toggle('selected', this.checked);
            }
            updateSelectAllState();
        });
    });

    // Show modal
    overlay.classList.add('active');
}

function togglePendingDuplicate(index) {
    const checkbox = document.getElementById(`pending-dup-${index}`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    }
}

function toggleAllPendingDuplicates() {
    const selectAll = document.getElementById('pending-dup-select-all');
    const checkboxes = document.querySelectorAll('#pending-dup-list input[type="checkbox"]');

    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        const item = cb.closest('.pending-dup-item');
        if (item) {
            item.classList.toggle('selected', selectAll.checked);
        }
    });
}

function updateSelectAllState() {
    const selectAll = document.getElementById('pending-dup-select-all');
    const checkboxes = document.querySelectorAll('#pending-dup-list input[type="checkbox"]');
    const checkedCount = document.querySelectorAll('#pending-dup-list input[type="checkbox"]:checked').length;

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
}

function closePendingDuplicatesModal() {
    const overlay = document.getElementById('pending-duplicates-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    window._pendingDuplicatesData = [];
    window._pendingDuplicatesAccountId = null;
}

async function importSelectedDuplicates() {
    const checkboxes = document.querySelectorAll('#pending-dup-list input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
        showToast('Please select at least one transaction to import', 'warning');
        return;
    }

    // Get selected indices
    const selectedIndices = Array.from(checkboxes).map(cb => {
        return parseInt(cb.id.replace('pending-dup-', ''));
    });

    // Get selected duplicates data
    const selectedDuplicates = selectedIndices.map(idx => window._pendingDuplicatesData[idx]);

    try {
        const response = await fetch(`${API_BASE}/import/duplicates.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser,
                account_id: window._pendingDuplicatesAccountId,
                transactions: selectedDuplicates
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`${result.data.imported} duplicate transaction(s) imported`, 'success');
            closePendingDuplicatesModal();

            // Refresh transactions if on transactions page
            if (typeof loadTransactions === 'function') {
                loadTransactions();
            }
            // Refresh dashboard if visible
            if (typeof loadDashboard === 'function') {
                loadDashboard();
            }
        } else {
            showToast(result.message || 'Failed to import duplicates', 'error');
        }
    } catch (error) {
        console.error('Import duplicates error:', error);
        showToast('Failed to import duplicates', 'error');
    }
}

// Expose pending duplicates functions globally
window.showPendingDuplicatesModal = showPendingDuplicatesModal;
window.closePendingDuplicatesModal = closePendingDuplicatesModal;
window.togglePendingDuplicate = togglePendingDuplicate;
window.toggleAllPendingDuplicates = toggleAllPendingDuplicates;
window.importSelectedDuplicates = importSelectedDuplicates;
