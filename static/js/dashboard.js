// ===== Firebase Configuration =====
const firebaseConfig = {
    apiKey: "AIzaSyDsqneb8imZFwcQf5EcIRYTZMhfcGCv184",
    authDomain: "automate-outbounds.firebaseapp.com",
    projectId: "automate-outbounds",
    storageBucket: "automate-outbounds.firebasestorage.app",
    messagingSenderId: "778759891509",
    appId: "1:778759891509:web:9e64fde0e3b136d80c9f7c",
    measurementId: "G-MFB2W354GK"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== Auth Guard — redirect to login if not signed in =====
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = '/login';
        return;
    }

    // Verify token with backend
    try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });
        const data = await res.json();

        if (!res.ok || !data.verified) {
            console.error('Backend auth verification failed');
            await auth.signOut();
            window.location.href = '/login';
            return;
        }

        console.log(`[Auth] Verified: ${data.email} (${data.uid})`);
    } catch (err) {
        console.error('Backend auth check error:', err);
        await auth.signOut();
        window.location.href = '/login';
        return;
    }

    // Populate user info in sidebar
    document.getElementById('user-name').textContent = user.displayName || 'User';
    document.getElementById('user-email').textContent = user.email;

    // Avatar initials
    const avatarEl = document.getElementById('user-avatar');
    if (user.displayName) {
        const initials = user.displayName.split(' ').map(n => n[0]).join('').toUpperCase();
        avatarEl.innerHTML = `<span style="font-size:14px;font-weight:700;color:var(--primary-light)">${initials}</span>`;
    }

    // Load saved contacts for this user
    loadSavedContacts(user.uid);
    loadSimpleRetrySettings(user.uid);
});

// ===== Sign Out =====
document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        // Clear backend session cookie
        await fetch('/api/auth/logout', { method: 'POST' });
        // Sign out from Firebase client
        await auth.signOut();
        window.location.href = '/login';
    } catch (error) {
        console.error('Sign out error:', error);
    }
});

// ===== Sidebar Navigation =====
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

const pageMeta = {
    'call': {
        title: 'Call',
        subtitle: 'Make individual or automated outbound calls'
    },
    'add-lead': {
        title: 'Add Lead',
        subtitle: 'Upload and manage your contact leads'
    },
    'logs': {
        title: 'Logs',
        subtitle: 'View call history and detailed logs'
    }
};

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = link.dataset.page;

        // Update active nav
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show page
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${pageName}`).classList.add('active');

        // Update topbar
        pageTitle.textContent = pageMeta[pageName].title;
        pageSubtitle.textContent = pageMeta[pageName].subtitle;

        // Close mobile sidebar
        closeMobileSidebar();
    });
});

// ===== Mobile Sidebar =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');

function openMobileSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
}

function closeMobileSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

mobileMenuBtn.addEventListener('click', openMobileSidebar);
overlay.addEventListener('click', closeMobileSidebar);

// ===== Quick Call Button (calls backend /api/outbound/call) =====
document.getElementById('btn-start-call')?.addEventListener('click', async () => {
    const number = document.getElementById('call-number').value.trim();
    if (!number) {
        alert('Please enter a phone number');
        return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const btn = document.getElementById('btn-start-call');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calling...';
    btn.disabled = true;

    try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/outbound/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ destination: number })
        });
        const data = await res.json();

        if (data.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Call Initiated!';
            btn.style.background = 'var(--success)';
        } else {
            btn.innerHTML = '<i class="fas fa-times"></i> Failed';
            btn.style.background = 'var(--error)';
            alert(data.message || 'Call failed');
        }
    } catch (err) {
        console.error('Call error:', err);
        btn.innerHTML = '<i class="fas fa-times"></i> Error';
        btn.style.background = 'var(--error)';
        alert('Network error. Please try again.');
    }

    setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '';
        btn.disabled = false;
    }, 2500);
});

// ===== File Upload & Contacts =====
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const btnUpload = document.getElementById('btn-upload');
const contactsPreview = document.getElementById('contacts-preview');
const contactsTbody = document.getElementById('contacts-tbody');
const contactsCount = document.getElementById('contacts-count');
const validCountEl = document.getElementById('valid-count');
const invalidCountEl = document.getElementById('invalid-count');
const btnSaveContacts = document.getElementById('btn-save-contacts');
const btnClearUpload = document.getElementById('btn-clear-upload');

let parsedContacts = []; // { name, phone, valid }

if (btnUpload) {
    btnUpload.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
}

if (uploadArea) {
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'rgba(108, 60, 224, 0.06)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) {
            processUploadedFile(file);
        }
    });
}

if (fileInput) {
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            processUploadedFile(fileInput.files[0]);
        }
    });
}

// Normalize phone number to 91XXXXXXXXXX format:
//   +91XXXXXXXXXX  →  91XXXXXXXXXX  (strip leading +)
//   91XXXXXXXXXX   →  91XXXXXXXXXX  (already correct)
//   0XXXXXXXXXX    →  91XXXXXXXXXX  (strip leading 0, add 91)
//   XXXXXXXXXX     →  91XXXXXXXXXX  (bare 10-digit, add 91)
//   Other formats  →  returned as-is (digits only, no +)
function normalizePhone(phone) {
    // Strip all non-digit characters except leading +
    let raw = String(phone).trim();
    // Remove spaces, dashes, dots, parens
    raw = raw.replace(/[\s\-().]/g, '');

    // Remove leading +
    if (raw.startsWith('+')) {
        raw = raw.slice(1);
    }

    // Already has country code 91 and is 12 digits → correct
    if (/^91\d{10}$/.test(raw)) {
        return raw;
    }

    // Starts with 0 followed by 10 digits (e.g. 09876543210) → strip 0, add 91
    if (/^0\d{10}$/.test(raw)) {
        return '91' + raw.slice(1);
    }

    // Bare 10-digit number → add 91
    if (/^\d{10}$/.test(raw)) {
        return '91' + raw;
    }

    // Any other format — return digits only (no +), let validation catch it
    return raw.replace(/\D/g, '');
}

// Validate phone number — must be 12 digits starting with 91
function isValidPhone(phone) {
    if (!phone) return false;
    const normalized = normalizePhone(String(phone));
    return /^91\d{10}$/.test(normalized);
}

// Find a column by possible header names
function findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h && h.toString().toLowerCase().trim() === name);
        if (idx !== -1) return idx;
    }
    // Partial match
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h && h.toString().toLowerCase().trim().includes(name));
        if (idx !== -1) return idx;
    }
    return -1;
}

// Process uploaded Excel/CSV file
function processUploadedFile(file) {
    const validExts = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
        alert('Please upload a valid Excel (.xlsx, .xls) or CSV (.csv) file.');
        return;
    }

    // Update upload area to show file info
    uploadArea.innerHTML = `
        <i class="fas fa-file-excel" style="color: var(--success);"></i>
        <h3>${file.name}</h3>
        <p style="color: var(--text-secondary);">${(file.size / 1024).toFixed(1)} KB — Parsing...</p>
    `;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

            if (rows.length < 2) {
                alert('File is empty or has no data rows.');
                resetUploadArea();
                return;
            }

            const headers = rows[0];
            const nameCol = findColumn(headers, ['name', 'full name', 'contact name', 'first name', 'contact']);
            const phoneCol = findColumn(headers, ['phone', 'phone number', 'mobile', 'mobile number', 'tel', 'telephone', 'number', 'cell']);

            if (phoneCol === -1) {
                alert('Could not find a "phone" column in the file. Please ensure your file has a column with header like "phone", "mobile", or "number".');
                resetUploadArea();
                return;
            }

            parsedContacts = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
                const phone = String(row[phoneCol] || '').trim();

                if (!phone) continue; // Skip empty rows

                const valid = isValidPhone(phone);
                parsedContacts.push({
                    name: name || 'Unknown',
                    phone: normalizePhone(phone),
                    rawPhone: phone,
                    valid
                });
            }

            if (parsedContacts.length === 0) {
                alert('No contacts found in the file.');
                resetUploadArea();
                return;
            }

            renderContactsPreview();

            // Update upload area
            uploadArea.innerHTML = `
                <i class="fas fa-file-excel" style="color: var(--success);"></i>
                <h3>${file.name}</h3>
                <p style="color: var(--text-secondary);">${(file.size / 1024).toFixed(1)} KB — ${parsedContacts.length} contacts extracted</p>
            `;
        } catch (err) {
            console.error('Error parsing file:', err);
            alert('Failed to parse the file. Please check the file format.');
            resetUploadArea();
        }
    };
    reader.readAsArrayBuffer(file);
}

function resetUploadArea() {
    parsedContacts = [];
    contactsPreview.style.display = 'none';
    fileInput.value = '';
    uploadArea.innerHTML = `
        <i class="fas fa-cloud-upload-alt"></i>
        <h3>Upload Excel or CSV</h3>
        <p>Drag & drop your file here, or click to browse</p>
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" hidden>
        <button class="btn-upload" id="btn-upload">Browse Files</button>
    `;
    // Re-bind events for new elements
    const newFileInput = document.getElementById('file-input');
    const newBtnUpload = document.getElementById('btn-upload');
    newBtnUpload.addEventListener('click', (e) => {
        e.stopPropagation();
        newFileInput.click();
    });
    newFileInput.addEventListener('change', () => {
        if (newFileInput.files[0]) {
            processUploadedFile(newFileInput.files[0]);
        }
    });
}

function renderContactsPreview() {
    contactsTbody.innerHTML = '';
    let validCount = 0;
    let invalidCount = 0;

    parsedContacts.forEach((c, i) => {
        if (c.valid) validCount++;
        else invalidCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.phone)}</td>
            <td>
                ${c.valid
                    ? '<span class="status-tag completed"><i class="fas fa-check-circle"></i> Valid</span>'
                    : '<span class="status-tag failed"><i class="fas fa-exclamation-circle"></i> Invalid</span>'}
            </td>
        `;
        contactsTbody.appendChild(tr);
    });

    validCountEl.textContent = validCount;
    invalidCountEl.textContent = invalidCount;
    contactsCount.textContent = `${parsedContacts.length} Contacts`;
    contactsPreview.style.display = 'block';
    btnSaveContacts.disabled = validCount === 0;
}

function getStatusClass(status) {
    switch (status) {
        case 'called':      return 'completed';   // green
        case 'calling':     return 'calling';      // blue/teal
        case 'pending':     return 'no-answer';    // orange/yellow
        case 'no-answer':   return 'no-answer';    // orange
        case 'busy':        return 'failed';       // red
        case 'failed':      return 'failed';       // red
        default:            return 'no-answer';    // fallback orange
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear upload
btnClearUpload?.addEventListener('click', () => {
    resetUploadArea();
    contactsCount.textContent = '0 Contacts';
});

// Save contacts to Firestore
btnSaveContacts?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const validContacts = parsedContacts.filter(c => c.valid);
    if (validContacts.length === 0) {
        alert('No valid contacts to save.');
        return;
    }

    btnSaveContacts.disabled = true;
    btnSaveContacts.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking duplicates...';

    try {
        // 1. De-duplicate within the uploaded file itself (keep first occurrence per phone)
        const seenInFile = new Set();
        const uniqueUploaded = [];
        for (const c of validContacts) {
            const phone = c.phone.replace(/\D/g, ''); // normalize to digits only
            if (!seenInFile.has(phone)) {
                seenInFile.add(phone);
                uniqueUploaded.push(c);
            }
        }

        // 2. Check against already-saved contacts in Firestore
        const existingPhones = new Set(
            currentSavedContacts.map(c => c.phone.replace(/\D/g, ''))
        );

        const newContacts = uniqueUploaded.filter(c => {
            const phone = c.phone.replace(/\D/g, '');
            return !existingPhones.has(phone);
        });

        const duplicateCount = validContacts.length - newContacts.length;

        if (newContacts.length === 0) {
            alert(`All ${validContacts.length} contacts already exist. No new leads to save.`);
            btnSaveContacts.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save Leads';
            btnSaveContacts.disabled = false;
            return;
        }

        btnSaveContacts.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const batch = db.batch();
        const uploadedAt = firebase.firestore.FieldValue.serverTimestamp();

        newContacts.forEach(c => {
            const docRef = db.collection('contacts').doc();
            batch.set(docRef, {
                name: c.name,
                phone: c.phone,
                userId: user.uid,
                status: 'pending',
                uploadedAt
            });
        });

        await batch.commit();

        // Success feedback
        let msg = `${newContacts.length} Leads Saved!`;
        if (duplicateCount > 0) {
            msg += ` (${duplicateCount} duplicates skipped)`;
        }
        btnSaveContacts.innerHTML = `<i class="fas fa-check"></i> ${msg}`;
        btnSaveContacts.style.background = 'var(--success)';

        setTimeout(() => {
            resetUploadArea();
            contactsCount.textContent = '0 Contacts';
            btnSaveContacts.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save Leads';
            btnSaveContacts.style.background = '';
            btnSaveContacts.disabled = false;
        }, 3000);
    } catch (error) {
        console.error('Error saving contacts:', error);
        alert('Failed to save contacts. Please try again.');
        btnSaveContacts.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save Leads';
        btnSaveContacts.disabled = false;
    }
});

// ===== Saved Contacts (Real-time from Firestore) =====
const savedContactsList = document.getElementById('saved-contacts-list');
const savedContactsEmpty = document.getElementById('saved-contacts-empty');
const savedContactsCount = document.getElementById('saved-contacts-count');
const automationControls = document.getElementById('automation-controls');

// Add Lead page elements
const savedLeadsList = document.getElementById('saved-leads-list');
const savedLeadsEmpty = document.getElementById('saved-leads-empty');
const leadListCount = document.getElementById('lead-list-count');

let currentSavedContacts = []; // Shared across saved contacts + automation

function loadSavedContacts(uid) {
    db.collection('contacts')
        .where('userId', '==', uid)
        .orderBy('uploadedAt', 'desc')
        .onSnapshot((snapshot) => {
            const contacts = [];
            snapshot.forEach(doc => {
                contacts.push({ id: doc.id, ...doc.data() });
            });
            currentSavedContacts = contacts;
            renderSavedContacts(contacts);
            renderSavedLeads(contacts);
        }, (error) => {
            console.error('Error loading saved contacts:', error);
        });
}

function renderSavedContacts(contacts) {
    // Remove old items, keep empty state
    savedContactsList.querySelectorAll('.saved-contact-item').forEach(el => el.remove());

    // Remove existing "Delete All" button if any
    const existingDeleteAll = savedContactsList.parentElement.querySelector('.btn-delete-all-contacts');
    if (existingDeleteAll) existingDeleteAll.remove();

    if (contacts.length === 0) {
        savedContactsEmpty.style.display = 'flex';
        savedContactsCount.textContent = '0 Contacts';
        automationControls.style.display = 'none';
        return;
    }

    savedContactsEmpty.style.display = 'none';
    savedContactsCount.textContent = `${contacts.length} Contacts`;
    automationControls.style.display = 'block';

    contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'saved-contact-item';
        item.innerHTML = `
            <div class="saved-contact-icon">
                <i class="fas fa-user"></i>
            </div>
            <div class="saved-contact-info">
                <div class="saved-contact-name">${escapeHtml(contact.name)}</div>
                <div class="saved-contact-phone">${escapeHtml(contact.phone)}</div>
            </div>
            <span class="status-tag ${getStatusClass(contact.status)}">${contact.status || 'pending'}</span>
        `;
        savedContactsList.appendChild(item);
    });
}

// ===== Add Lead page — Saved Leads with delete =====
function renderSavedLeads(contacts) {
    if (!savedLeadsList) return;

    savedLeadsList.querySelectorAll('.saved-contact-item').forEach(el => el.remove());

    const existingDeleteAll = savedLeadsList.parentElement.querySelector('.btn-delete-all-contacts');
    if (existingDeleteAll) existingDeleteAll.remove();

    if (contacts.length === 0) {
        savedLeadsEmpty.style.display = 'flex';
        leadListCount.textContent = '0';
        return;
    }

    savedLeadsEmpty.style.display = 'none';
    leadListCount.textContent = contacts.length;

    contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'saved-contact-item';
        item.dataset.contactId = contact.id;
        item.innerHTML = `
            <div class="saved-contact-icon">
                <i class="fas fa-user"></i>
            </div>
            <div class="saved-contact-info">
                <div class="saved-contact-name">${escapeHtml(contact.name)}</div>
                <div class="saved-contact-phone">${escapeHtml(contact.phone)}</div>
            </div>
            <span class="status-tag ${getStatusClass(contact.status)}">${contact.status || 'pending'}</span>
            <button class="saved-contact-edit" title="Edit lead">
                <i class="fas fa-pen"></i>
            </button>
            <button class="saved-contact-delete" title="Delete lead">
                <i class="fas fa-trash"></i>
            </button>
        `;
        savedLeadsList.appendChild(item);

        // Edit button — switch to inline edit mode
        item.querySelector('.saved-contact-edit').addEventListener('click', () => {
            // Prevent multiple edits at once: collapse any other open edit forms
            savedLeadsList.querySelectorAll('.saved-contact-item.editing').forEach(el => {
                if (el !== item) collapseEditForm(el);
            });
            expandEditForm(item, contact);
        });

        // Delete button
        item.querySelector('.saved-contact-delete').addEventListener('click', async () => {
            if (confirm(`Delete lead ${contact.name} (${contact.phone})?`)) {
                try {
                    await db.collection('contacts').doc(contact.id).delete();
                } catch (err) {
                    console.error('Error deleting lead:', err);
                    alert('Failed to delete lead.');
                }
            }
        });
    });

    // Add "Delete All" button
    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.className = 'btn-call btn-delete-all-contacts';
    deleteAllBtn.style.cssText = 'background: var(--error); margin-top: 12px; width: 100%;';
    deleteAllBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete All Leads';
    savedLeadsList.parentElement.appendChild(deleteAllBtn);

    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm(`Delete all ${contacts.length} leads?`)) return;
        deleteAllBtn.disabled = true;
        deleteAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        try {
            const batch = db.batch();
            contacts.forEach(c => {
                batch.delete(db.collection('contacts').doc(c.id));
            });
            await batch.commit();
        } catch (err) {
            console.error('Error deleting all leads:', err);
            alert('Failed to delete leads.');
            deleteAllBtn.disabled = false;
            deleteAllBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete All Leads';
        }
    });
}

// ===== Inline Edit for Saved Leads =====
function expandEditForm(item, contact) {
    item.classList.add('editing');

    // Store original HTML to restore on cancel
    item._originalHTML = item.innerHTML;

    item.innerHTML = `
        <div class="saved-contact-icon editing-icon">
            <i class="fas fa-pen"></i>
        </div>
        <div class="inline-edit-form">
            <div class="inline-edit-row">
                <div class="inline-edit-field">
                    <label>Name</label>
                    <input type="text" class="form-input inline-edit-input" id="edit-name-${contact.id}" value="${escapeHtml(contact.name)}" placeholder="Contact name">
                </div>
                <div class="inline-edit-field">
                    <label>Phone</label>
                    <input type="tel" class="form-input inline-edit-input" id="edit-phone-${contact.id}" value="${escapeHtml(contact.phone)}" placeholder="+91 98765 43210">
                </div>
            </div>
            <div class="inline-edit-actions">
                <button class="btn-edit-save" title="Save changes">
                    <i class="fas fa-check"></i> Save
                </button>
                <button class="btn-edit-cancel" title="Cancel editing">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;

    // Focus name input
    const nameInput = item.querySelector(`#edit-name-${contact.id}`);
    nameInput.focus();
    nameInput.select();

    // Save handler
    item.querySelector('.btn-edit-save').addEventListener('click', async () => {
        const newName = item.querySelector(`#edit-name-${contact.id}`).value.trim();
        const newPhone = item.querySelector(`#edit-phone-${contact.id}`).value.trim();

        if (!newName) {
            alert('Name cannot be empty.');
            return;
        }
        if (!newPhone) {
            alert('Phone number cannot be empty.');
            return;
        }
        const normalizedPhone = normalizePhone(newPhone);
        if (!isValidPhone(normalizedPhone)) {
            alert('Please enter a valid phone number (7-15 digits).');
            return;
        }

        const saveBtn = item.querySelector('.btn-edit-save');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            await db.collection('contacts').doc(contact.id).update({
                name: newName,
                phone: normalizedPhone
            });
            // Firestore real-time listener will re-render the list automatically
        } catch (err) {
            console.error('Error updating lead:', err);
            alert('Failed to update lead. Please try again.');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
        }
    });

    // Cancel handler
    item.querySelector('.btn-edit-cancel').addEventListener('click', () => {
        collapseEditForm(item);
    });

    // Save on Enter key
    item.querySelectorAll('.inline-edit-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                item.querySelector('.btn-edit-save').click();
            }
            if (e.key === 'Escape') {
                collapseEditForm(item);
            }
        });
    });
}

function collapseEditForm(item) {
    if (item._originalHTML) {
        item.classList.remove('editing');
        item.innerHTML = item._originalHTML;
        delete item._originalHTML;
    }
}

// ===== Automation Engine — Sequential One-by-One Calls =====
const btnStartAutomate = document.getElementById('btn-start-automate');
const btnStopAutomate = document.getElementById('btn-stop-automate');
const btnContinueAutomate = document.getElementById('btn-continue-automate');
const automationProgress = document.getElementById('automation-progress');
const automationLog = document.getElementById('automation-log');
const automationLogBody = document.getElementById('automation-log-body');
const progressLabel = document.getElementById('progress-label');
const progressPercent = document.getElementById('progress-percent');
const progressBarFill = document.getElementById('progress-bar-fill');
const autoSuccessCount = document.getElementById('auto-success-count');
const autoFailCount = document.getElementById('auto-fail-count');
const autoPendingCount = document.getElementById('auto-pending-count');

let automationRunning = false;
let automationStopped = false;
let automationStopIndex = -1; // Track where automation was stopped
let automationLastContacts = []; // The contacts list from the last run
let automationSuccessCount = 0;
let automationFailCount = 0;

// How long to wait between calls if status polling is not available (ms)
const FALLBACK_CALL_WAIT_MS = 30000; // 30 seconds
// Max time to poll for call status before giving up (ms)
const POLL_TIMEOUT_MS = 300000; // 5 minutes
// Interval between status poll requests (ms)
const POLL_INTERVAL_MS = 5000; // 5 seconds

/**
 * Poll the backend for call status until the call is finished or timeout.
 * Returns an object: { status, recording_url, call_duration, call_id, ended_at }
 */
async function waitForCallCompletion(eventId, idToken, logIndex) {
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
        if (automationStopped) return { status: 'stopped' };

        try {
            const res = await fetch(`/api/outbound/call-status/${encodeURIComponent(eventId)}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            const data = await res.json();

            if (data.finished) {
                return {
                    status: data.status || 'completed',
                    recording_url: data.recording_url || null,
                    call_duration: data.call_duration || null,
                    call_id: data.call_id || null,
                    ended_at: data.ended_at || null,
                };
            }

            // Update the log to show current live status
            const statusText = data.status || 'in-progress';
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            let displayText = capitalize(statusText);
            if (statusText === 'answered' || statusText === 'in-progress') {
                displayText = `On call (${elapsed}s)`;
            } else if (statusText === 'initialized' || statusText === 'initiated') {
                displayText = `Ringing (${elapsed}s)`;
            } else {
                displayText = `${capitalize(statusText)} (${elapsed}s)`;
            }

            updateLogEntry(logIndex, 'calling', displayText);

        } catch (err) {
            console.error('[Poll] Error checking call status:', err);
            // Don't fail immediately, retry on next interval
        }

        await sleep(POLL_INTERVAL_MS);
    }

    // Timed out waiting for call to finish
    return { status: 'poll-timeout' };
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}

btnStartAutomate?.addEventListener('click', () => {
    if (automationRunning) return;
    if (currentSavedContacts.length === 0) {
        alert('No saved contacts to call.');
        return;
    }
    // Fresh start — reset stop index
    automationStopIndex = -1;
    automationSuccessCount = 0;
    automationFailCount = 0;
    btnContinueAutomate.style.display = 'none';
    startAutomation(currentSavedContacts, 0);
});

btnContinueAutomate?.addEventListener('click', () => {
    if (automationRunning) return;
    if (automationStopIndex < 0 || automationLastContacts.length === 0) {
        alert('Nothing to continue. Start a new automation.');
        return;
    }
    // Continue from where we stopped
    btnContinueAutomate.style.display = 'none';
    btnStartAutomate.style.display = 'none';
    startAutomation(automationLastContacts, automationStopIndex, true);
});

btnStopAutomate?.addEventListener('click', () => {
    automationStopped = true;
    btnStopAutomate.disabled = true;
    btnStopAutomate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping...';
});

async function startAutomation(contacts, startIndex = 0, isContinue = false) {
    automationRunning = true;
    automationStopped = false;
    automationStopIndex = -1;
    automationLastContacts = contacts;

    const total = contacts.length;
    let successCount = isContinue ? automationSuccessCount : 0;
    let failCount = isContinue ? automationFailCount : 0;

    // Show UI
    btnStartAutomate.style.display = 'none';
    btnContinueAutomate.style.display = 'none';
    btnStopAutomate.style.display = 'flex';
    btnStopAutomate.disabled = false;
    btnStopAutomate.innerHTML = '<i class="fas fa-stop"></i> Stop';
    automationProgress.style.display = 'block';
    automationLog.style.display = 'block';

    // Remove any previous completion banner
    const prevBanner = document.querySelector('.automation-complete-banner');
    if (prevBanner) prevBanner.remove();

    if (!isContinue) {
        // Fresh start — clear log and reset counters
        automationLogBody.innerHTML = '';
        updateProgress(0, total, 0, 0, total);

        // Pre-populate all log entries as "pending"
        contacts.forEach((c, i) => {
            addLogEntry(i, c.name, c.phone, 'pending');
        });
    } else {
        // Continue — update progress to reflect where we are
        updateProgress(startIndex, total, successCount, failCount, total - startIndex);
    }

    const user = auth.currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();

    for (let i = startIndex; i < total; i++) {
        if (automationStopped) break;

        const contact = contacts[i];
        const pending = total - i - 1;

        // Update current entry to "calling"
        updateLogEntry(i, 'calling');
        updateProgress(i + 1, total, successCount, failCount, pending);

        let callEventId = null;

        try {
            const res = await fetch('/api/outbound/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ destination: contact.phone })
            });
            const data = await res.json();

            if (data.success) {
                callEventId = data.data?.event_id || null;
                updateLogEntry(i, 'calling', 'In progress...');

                // Update Firestore status to "calling"
                try {
                    await db.collection('contacts').doc(contact.id).update({ status: 'calling' });
                } catch (_) { /* ignore */ }

                // ===== Wait for call to finish before proceeding =====
                if (callEventId) {
                    const result = await waitForCallCompletion(callEventId, idToken, i);
                    const finalStatus = result.status;

                    // Build Firestore update with call details
                    const firestoreUpdate = { status: finalStatus };
                    if (result.recording_url) firestoreUpdate.recordingUrl = result.recording_url;
                    if (result.call_duration) firestoreUpdate.callDuration = result.call_duration;
                    if (result.call_id) firestoreUpdate.callId = result.call_id;
                    if (result.ended_at) firestoreUpdate.endedAt = result.ended_at;
                    firestoreUpdate.eventId = callEventId;
                    firestoreUpdate.calledAt = firebase.firestore.FieldValue.serverTimestamp();

                    if (finalStatus === 'completed' || finalStatus === 'ended' || finalStatus === 'hangup') {
                        successCount++;
                        const durationText = result.call_duration ? ` (${result.call_duration}s)` : '';
                        updateLogEntry(i, 'success', `Completed${durationText}`);
                        firestoreUpdate.status = 'called';
                        try {
                            await db.collection('contacts').doc(contact.id).update(firestoreUpdate);
                        } catch (_) { /* ignore */ }
                    } else if (finalStatus === 'no-answer' || finalStatus === 'busy') {
                        failCount++;
                        updateLogEntry(i, 'failed', finalStatus === 'no-answer' ? 'No Answer' : 'Busy');
                        try {
                            await db.collection('contacts').doc(contact.id).update(firestoreUpdate);
                        } catch (_) { /* ignore */ }
                    } else if (finalStatus === 'poll-timeout') {
                        successCount++;
                        updateLogEntry(i, 'success', 'Initiated (timeout)');
                        firestoreUpdate.status = 'called';
                        try {
                            await db.collection('contacts').doc(contact.id).update(firestoreUpdate);
                        } catch (_) { /* ignore */ }
                    } else if (finalStatus === 'stopped') {
                        // User stopped automation — don't count
                        updateLogEntry(i, 'failed', 'Stopped');
                    } else {
                        failCount++;
                        updateLogEntry(i, 'failed', finalStatus || 'Failed');
                        firestoreUpdate.status = 'failed';
                        try {
                            await db.collection('contacts').doc(contact.id).update(firestoreUpdate);
                        } catch (_) { /* ignore */ }
                    }
                } else {
                    // No event_id returned — can't poll, use fallback delay
                    successCount++;
                    updateLogEntry(i, 'success', 'Initiated');
                    try {
                        await db.collection('contacts').doc(contact.id).update({ status: 'called' });
                    } catch (_) { /* ignore */ }

                    // Fallback: wait a fixed time before next call
                    if (i < total - 1 && !automationStopped) {
                        updateLogEntry(i, 'success', 'Initiated — waiting...');
                        await sleep(FALLBACK_CALL_WAIT_MS);
                    }
                }
            } else {
                failCount++;
                updateLogEntry(i, 'failed', data.message || 'Failed');
            }
        } catch (err) {
            failCount++;
            updateLogEntry(i, 'failed', 'Network error');
        }

        updateProgress(i + 1, total, successCount, failCount, total - i - 1);

        // Small gap between calls (even after completion, give 2s breathing room)
        if (i < total - 1 && !automationStopped) {
            await sleep(2000);
        }
    }

    // Done
    automationRunning = false;
    btnStopAutomate.style.display = 'none';

    if (automationStopped) {
        const remaining = total - successCount - failCount;
        // Save state so Continue can resume
        // Find the index of the first contact that wasn't completed
        // (the loop variable `i` from for-loop would have been incremented past the stopped one,
        // but we track stopped contacts in the log — find first still-pending)
        let resumeIndex = total; // default: nothing to resume
        for (let j = 0; j < total; j++) {
            const entry = document.getElementById(`log-entry-${j}`);
            if (entry) {
                const statusEl = entry.querySelector('.log-entry-status');
                if (statusEl && (statusEl.classList.contains('pending') || statusEl.textContent === 'Stopped')) {
                    resumeIndex = j;
                    break;
                }
            }
        }
        automationStopIndex = resumeIndex;
        automationSuccessCount = successCount;
        automationFailCount = failCount;

        updateProgress(successCount + failCount, total, successCount, failCount, remaining);
        progressBarFill.classList.remove('complete');

        // Show both Continue and Run Again buttons
        btnStartAutomate.style.display = 'flex';
        btnStartAutomate.innerHTML = '<i class="fas fa-redo"></i> Run Again';

        if (resumeIndex < total) {
            btnContinueAutomate.style.display = 'flex';
            btnContinueAutomate.innerHTML = `<i class="fas fa-forward"></i> Continue (${remaining} left)`;
        } else {
            btnContinueAutomate.style.display = 'none';
        }

        showCompletionBanner(`Automation stopped. ${successCount} succeeded, ${failCount} failed, ${remaining} remaining.`, true);
    } else {
        // Reset continue state
        automationStopIndex = -1;
        automationLastContacts = [];
        automationSuccessCount = 0;
        automationFailCount = 0;

        btnStartAutomate.style.display = 'flex';
        btnStartAutomate.innerHTML = '<i class="fas fa-redo"></i> Run Again';
        btnContinueAutomate.style.display = 'none';

        progressBarFill.classList.add('complete');
        showCompletionBanner(`All done! ${successCount} calls succeeded, ${failCount} failed out of ${total}.`, false);

        // Schedule auto-retry for failed/not-connected contacts after 1 hour
        scheduleRetryIfNeeded();
    }
}

function updateProgress(current, total, success, fail, pending) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressLabel.textContent = `Calling ${current} / ${total}`;
    progressPercent.textContent = `${pct}%`;
    progressBarFill.style.width = `${pct}%`;
    autoSuccessCount.textContent = success;
    autoFailCount.textContent = fail;
    autoPendingCount.textContent = pending;
}

function addLogEntry(index, name, phone, status) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.id = `log-entry-${index}`;
    entry.innerHTML = `
        <span class="log-entry-index">#${index + 1}</span>
        <div class="log-entry-icon ${status}">
            <i class="fas ${getLogIcon(status)}"></i>
        </div>
        <div class="log-entry-info">
            <div class="log-entry-name">${escapeHtml(name)}</div>
            <div class="log-entry-phone">${escapeHtml(phone)}</div>
        </div>
        <span class="log-entry-status ${status}">${getLogLabel(status)}</span>
    `;
    automationLogBody.appendChild(entry);
}

function updateLogEntry(index, status, message) {
    const entry = document.getElementById(`log-entry-${index}`);
    if (!entry) return;

    const icon = entry.querySelector('.log-entry-icon');
    icon.className = `log-entry-icon ${status}`;
    icon.innerHTML = `<i class="fas ${getLogIcon(status)}"></i>`;

    const statusEl = entry.querySelector('.log-entry-status');
    statusEl.className = `log-entry-status ${status}`;
    statusEl.textContent = message || getLogLabel(status);

    // Scroll into view
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getLogIcon(status) {
    switch (status) {
        case 'success': return 'fa-check';
        case 'failed': return 'fa-times';
        case 'calling': return 'fa-phone-alt fa-beat';
        default: return 'fa-clock';
    }
}

function getLogLabel(status) {
    switch (status) {
        case 'success': return 'Initiated';
        case 'failed': return 'Failed';
        case 'calling': return 'Calling...';
        default: return 'Pending';
    }
}

function showCompletionBanner(message, wasStopped) {
    const prevBanner = document.querySelector('.automation-complete-banner');
    if (prevBanner) prevBanner.remove();

    const banner = document.createElement('div');
    banner.className = `automation-complete-banner${wasStopped ? ' stopped' : ''}`;
    banner.innerHTML = `<i class="fas ${wasStopped ? 'fa-pause-circle' : 'fa-check-circle'}"></i> ${message}`;
    automationControls.appendChild(banner);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Auto Retry Logic (1 hour after all calls finish) =====
const RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour
let retryTimerId = null;
let retryCountdownInterval = null;

// Statuses that should be retried
const RETRY_STATUSES = ['failed', 'no-answer', 'busy', 'not-connected', 'not connected'];

function getContactsToRetry() {
    return currentSavedContacts.filter(c => RETRY_STATUSES.includes(c.status));
}

function showRetryBanner(retryContacts, delayMs) {
    removeRetryBanner();

    const banner = document.createElement('div');
    banner.id = 'retry-countdown-banner';
    banner.className = 'automation-complete-banner retry-pending';
    banner.innerHTML = `
        <div class="retry-banner-content">
            <i class="fas fa-redo-alt" style="color:var(--primary-light);font-size:18px;flex-shrink:0;"></i>
            <div class="retry-banner-text" style="flex:1;">
                <strong>${retryContacts.length} contact(s)</strong> (failed/not connected) will be auto-retried in
                <span id="retry-countdown-timer" style="font-weight:700;color:var(--primary-light);font-size:1.1em;">60:00</span>
            </div>
            <button id="btn-retry-now" style="background:var(--primary);color:#000;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.82rem;">
                <i class="fas fa-bolt"></i> Retry Now
            </button>
            <button id="btn-cancel-retry" style="background:var(--error);color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.82rem;">
                <i class="fas fa-times"></i> Cancel
            </button>
        </div>
    `;
    automationControls.appendChild(banner);

    // Apply flex layout inline
    banner.querySelector('.retry-banner-content').style.cssText =
        'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

    // Countdown timer
    let remaining = delayMs;
    retryCountdownInterval = setInterval(() => {
        remaining -= 1000;
        if (remaining <= 0) { clearInterval(retryCountdownInterval); return; }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const timerEl = document.getElementById('retry-countdown-timer');
        if (timerEl) timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }, 1000);

    document.getElementById('btn-cancel-retry')?.addEventListener('click', () => {
        cancelRetry();
        showCompletionBanner('Auto-retry cancelled.', true);
    });

    document.getElementById('btn-retry-now')?.addEventListener('click', () => {
        cancelRetry();
        triggerRetry();
    });
}

function removeRetryBanner() {
    document.getElementById('retry-countdown-banner')?.remove();
    if (retryCountdownInterval) { clearInterval(retryCountdownInterval); retryCountdownInterval = null; }
}

function cancelRetry() {
    if (retryTimerId) { clearTimeout(retryTimerId); retryTimerId = null; }
    removeRetryBanner();
}

async function triggerRetry() {
    const toRetry = getContactsToRetry();
    if (toRetry.length === 0) {
        showCompletionBanner('No contacts to retry.', true);
        return;
    }

    // Reset their Firestore status to pending before retrying
    try {
        const batch = db.batch();
        toRetry.forEach(c => {
            batch.update(db.collection('contacts').doc(c.id), { status: 'pending' });
        });
        await batch.commit();
    } catch (err) {
        console.error('[Retry] Failed to reset statuses:', err);
    }

    // Clear log and restart automation for failed contacts only
    automationLogBody.innerHTML = '';
    automationSuccessCount = 0;
    automationFailCount = 0;
    automationStopIndex = -1;
    btnContinueAutomate.style.display = 'none';

    showCompletionBanner(`Retrying ${toRetry.length} failed/not-connected contact(s)...`, false);
    await sleep(500);
    startAutomation(toRetry, 0);
}

function scheduleRetryIfNeeded() {
    cancelRetry();
    const toRetry = getContactsToRetry();
    if (toRetry.length === 0) return;
    showRetryBanner(toRetry, RETRY_DELAY_MS);
    retryTimerId = setTimeout(() => {
        removeRetryBanner();
        triggerRetry();
    }, RETRY_DELAY_MS);
}
// ===== Retry Settings =====
const pageMeta_settings = {
    title: 'Settings',
    subtitle: 'Configure auto retry and call preferences'
};

const retryPreset = document.getElementById('retry-preset');
const retryCustomGroup = document.getElementById('custom-retry-group');
const retryCustomMinutes = document.getElementById('retry-custom-minutes');
const currentRetryDisplay = document.getElementById('current-retry-display');
const btnSaveRetrySettings = document.getElementById('btn-save-retry-settings');
const retrySettingsSaved = document.getElementById('retry-settings-saved');

// Default retry interval in minutes
let retryIntervalMinutes = 60;

// Load saved retry interval from Firestore on startup
async function loadRetrySettings(uid) {
    try {
        const doc = await db.collection('userSettings').doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.retryIntervalMinutes) {
                retryIntervalMinutes = data.retryIntervalMinutes;
                updateRetryDisplay(retryIntervalMinutes);

                // Set preset dropdown
                const presets = ['30', '60', '120', '180', '360'];
                if (presets.includes(String(retryIntervalMinutes))) {
                    retryPreset.value = String(retryIntervalMinutes);
                } else {
                    retryPreset.value = 'custom';
                    retryCustomGroup.style.display = 'block';
                    retryCustomMinutes.value = retryIntervalMinutes;
                }
            }
        }
    } catch (err) {
        console.error('Error loading retry settings:', err);
    }
}

function updateRetryDisplay(minutes) {
    if (!currentRetryDisplay) return;
    if (minutes >= 60 && minutes % 60 === 0) {
        const hrs = minutes / 60;
        currentRetryDisplay.textContent = hrs === 1 ? '1 hour' : hrs + ' hours';
    } else {
        currentRetryDisplay.textContent = minutes + ' minutes';
    }
}

retryPreset?.addEventListener('change', () => {
    if (retryPreset.value === 'custom') {
        retryCustomGroup.style.display = 'block';
        retryCustomMinutes.focus();
    } else {
        retryCustomGroup.style.display = 'none';
    }
});

btnSaveRetrySettings?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    let minutes;
    if (retryPreset.value === 'custom') {
        minutes = parseInt(retryCustomMinutes.value);
        if (!minutes || minutes < 5 || minutes > 1440) {
            alert('Please enter a valid interval between 5 and 1440 minutes.');
            return;
        }
    } else if (retryPreset.value === '') {
        alert('Please select a retry interval.');
        return;
    } else {
        minutes = parseInt(retryPreset.value);
    }

    btnSaveRetrySettings.disabled = true;
    btnSaveRetrySettings.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        // Save to Firestore
        await db.collection('userSettings').doc(user.uid).set({
            retryIntervalMinutes: minutes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Also notify backend to update scheduler interval
        const idToken = await user.getIdToken();
        await fetch('/api/settings/retry-interval', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ minutes })
        });

        retryIntervalMinutes = minutes;
        updateRetryDisplay(minutes);

        retrySettingsSaved.style.display = 'block';
        setTimeout(() => { retrySettingsSaved.style.display = 'none'; }, 3000);
    } catch (err) {
        console.error('Error saving retry settings:', err);
        alert('Failed to save settings. Please try again.');
    } finally {
        btnSaveRetrySettings.disabled = false;
        btnSaveRetrySettings.innerHTML = '<i class="fas fa-save"></i> Save Settings';
    }
});

// ===== Simple Retry Interval (Saved Leads section) =====
const retryIntervalSelect = document.getElementById('retry-interval-select');
const retryCustomInput = document.getElementById('retry-custom-input');
const btnSaveRetry = document.getElementById('btn-save-retry');
const retrySavedMsg = document.getElementById('retry-saved-msg');

retryIntervalSelect?.addEventListener('change', () => {
    retryCustomInput.style.display = retryIntervalSelect.value === 'custom' ? 'inline-block' : 'none';
});

btnSaveRetry?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    let minutes;
    if (retryIntervalSelect.value === 'custom') {
        minutes = parseInt(retryCustomInput.value);
        if (!minutes || minutes < 5 || minutes > 1440) {
            alert('Enter a valid number between 5 and 1440 minutes.');
            return;
        }
    } else {
        minutes = parseInt(retryIntervalSelect.value);
    }

    try {
        // Save to Firestore
        await db.collection('userSettings').doc(user.uid).set({
            retryIntervalMinutes: minutes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        retryIntervalMinutes = minutes;
        retrySavedMsg.style.display = 'inline';
        setTimeout(() => { retrySavedMsg.style.display = 'none'; }, 2500);
    } catch (err) {
        console.error('Retry save error:', err);
        alert('Failed to save: ' + err.message);
    }
});

// Load saved interval on startup and set dropdown
async function loadSimpleRetrySettings(uid) {
    try {
        const doc = await db.collection('userSettings').doc(uid).get();
        if (doc.exists && doc.data().retryIntervalMinutes) {
            const saved = doc.data().retryIntervalMinutes;
            retryIntervalMinutes = saved;
            const presets = ['30', '60', '120', '180', '360'];
            if (retryIntervalSelect) {
                if (presets.includes(String(saved))) {
                    retryIntervalSelect.value = String(saved);
                } else {
                    retryIntervalSelect.value = 'custom';
                    retryCustomInput.style.display = 'inline-block';
                    retryCustomInput.value = saved;
                }
            }
        }
    } catch (err) { console.error('Error loading retry settings:', err); }
}