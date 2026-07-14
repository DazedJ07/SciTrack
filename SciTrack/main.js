/*
  SciTrack - Core JavaScript Controller
  Research Title: SCITRACK: THE DEVELOPMENT OF AN RFID-BASED BORROWING SYSTEM FOR SCIENCE LABORATORY EQUIPMENT AT DE LA SALLE UNIVERSITY - DASMARIÑAS SENIOR HIGH SCHOOL
  Copyright (c) 2026 Medina et al. (Wagwag, S.L., Medina, J.C., Mercado, G.G., Onofre, L.S., Pradas, J.M., Santos, E.Z., Zabala, J. Jr.)
  Strictly Proprietary - All Rights Reserved
*/
const { createClient } = supabase;

const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = window.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_KEY === 'YOUR_SUPABASE_KEY' || !SUPABASE_URL || !SUPABASE_KEY) {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('config-warning-banner')?.classList.remove('hidden');
    });
    console.error("Supabase credentials missing! Please configure config.js based on config.example.js.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allTransactionData = [];
let allBorrowedData = [];
let allStudentsData = [];
let inventoryData = []; 
window.cartItems = [];
let isMaintenanceMode = false; 

const toBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); r.onerror = e => rej(e); });
function escapeHtml(str) { return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]) : ''; }
function getAdminActorLabel() {
    if (!currentUser) return 'Unknown Admin';
    const display = currentUser.full_name || currentUser.username || currentUser.student_number || 'Unknown Admin';
    const role = currentUser.role ? String(currentUser.role).toUpperCase() : 'ADMIN';
    return `${display} (${role})`;
}
async function logAdminActivity(actionType, details) {
    if (!currentUser) return;
    try {
        await sb.from('activity_logs').insert([{
            admin_user: getAdminActorLabel(),
            action_type: String(actionType || 'Action').trim(),
            details: String(details || '').trim()
        }]);
    } catch (err) {
        console.warn('Activity log insert failed:', err);
    }
}
function getStudentDisplayName(tag) {
    if (!tag) return '';
    const student = allStudentsData.find(s => s.student_number === tag || s.username === tag);
    return student ? (student.full_name || student.username || student.student_number) : tag;
}
function getIncidentRecordKey(record) {
    if (record?.id != null) return { field: 'id', value: record.id };
    if (record?.incident_id != null) return { field: 'incident_id', value: record.incident_id };
    if (record?.report_id != null) return { field: 'report_id', value: record.report_id };
    if (record?.record_id != null) return { field: 'record_id', value: record.record_id };
    return null;
}

window.showPopup = (msg, isError = false) => {
    const container = document.getElementById('toast-container');
    if (!container) { alert(msg); return; }
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.innerHTML = `<span class="material-symbols-outlined text-sm">${isError ? 'error' : 'check_circle'}</span>${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 400); }, 3500);
}

window.showActionPopup = (message, title = 'Confirmed!') => {
    const popup = document.getElementById('action-popup');
    if (!popup) return showPopup(message);
    document.getElementById('action-popup-title').textContent = title;
    document.getElementById('action-popup-msg').textContent = message;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 2800);
}

window.toggleSignUp = (show) => {
    const signIn = document.getElementById('signin-panel');
    const signUp = document.getElementById('signup-panel');
    if (show) { signIn.classList.add('hidden'); signUp.classList.remove('hidden'); signUp.classList.add('login-form-enter'); }
    else { signUp.classList.add('hidden'); signIn.classList.remove('hidden'); signIn.classList.add('login-form-enter'); }
}

// ================= GSAP NAVIGATION =================
window.switchTab = (tabId, btn = null) => {
    if (currentUser && currentUser.role === 'admin' && tabId.startsWith('dev-')) {
        return showPopup("Access Denied: Developer feature.");
    }
    document.querySelectorAll('.gsap-tab').forEach(c => {
        c.classList.remove('active-tab'); 
        gsap.set(c, { opacity: 0, y: 20, display: 'none' }); 
    });

    const tab = document.getElementById(`tab-${tabId}`);
    if (tab) {
        tab.classList.add('active-tab'); 
        gsap.to(tab, { opacity: 1, y: 0, duration: 0.3, display: 'block' });
    }
    if (btn) {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if (tabId === 'scanner') setTimeout(() => document.getElementById('rfid_input')?.focus(), 300);
}

// ================= INIT & MAINTENANCE =================
async function initializeSystem() {
    try {
        const { data: settings } = await sb.from('system_settings').select('*').eq('id', 1).single();
        if (settings && settings.maintenance_active) {
            isMaintenanceMode = true;
            document.getElementById('maintenance-overlay')?.classList.remove('hidden');
        }
    } catch (e) { console.warn("Init Warning: Settings table not found."); }
}

async function restoreSession() {
    const savedSession = localStorage.getItem('scitrack_admin_session');
    if (!savedSession) return;
    try {
        const parsed = JSON.parse(savedSession);
        if (parsed.username) loginSystem(parsed);
    } catch (e) { localStorage.removeItem('scitrack_admin_session'); }
}

async function initializeApp() {
    await restoreSession();
    await initializeSystem();
    await loadNotificationsFromDB();
    // Only load dashboard if user is already logged in
    if (currentUser) {
        await loadDashboardData();
    }
}

initializeApp();

// Close notification panel and modal when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notification-panel');
    const modal = document.getElementById('notification-modal');
    const notifButton = document.querySelector('button[onclick*="toggleNotificationPanel"]');
    const isClickOnNotifButton = notifButton && notifButton.contains(e.target);
    const isClickOnPanel = panel && panel.contains(e.target);
    
    if (panel && !isClickOnNotifButton && !isClickOnPanel) {
        panel.classList.add('hidden');
    }
    
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        closeNotificationModal();
    }
});

// ================= AUTHENTICATION & DEV CLICK =================
let logoClicks = 0, logoClickTimer;
document.getElementById('main-logo')?.addEventListener('click', () => {
    logoClicks++; clearTimeout(logoClickTimer); logoClickTimer = setTimeout(() => logoClicks = 0, 1500);
    if (logoClicks >= 5) {
        logoClicks = 0; document.body.className = 'mode-dev-login antialiased h-screen w-screen overflow-hidden flex';
        document.getElementById('view-login').classList.add('hidden'); document.getElementById('view-dev-login').classList.remove('hidden');
    }
});

let maintLogoClicks = 0, maintLogoTimer;
document.getElementById('maintenance-logo')?.addEventListener('click', () => {
    maintLogoClicks++; clearTimeout(maintLogoTimer); maintLogoTimer = setTimeout(() => maintLogoClicks = 0, 2000);
    if (maintLogoClicks >= 10) { maintLogoClicks = 0; document.getElementById('maintenance-dev-login').classList.remove('hidden'); }
});

window.abortDevLogin = () => {
    document.body.className = 'mode-login antialiased h-screen w-screen overflow-hidden flex';
    document.getElementById('view-dev-login').classList.add('hidden'); document.getElementById('view-login').classList.remove('hidden');
}

window.openConfirmModal = ({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', onConfirm = async () => {} } = {}) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        if (confirm(message)) return onConfirm();
        return;
    }
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    confirmBtn.textContent = confirmText;
    confirmBtn.onclick = async () => {
        closeConfirmModal();
        try { await onConfirm(); } catch (err) { console.error(err); }
    };
    modal.classList.remove('hidden');
}

window.closeConfirmModal = () => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    if (confirmBtn) confirmBtn.onclick = null;
}

window.clearInventoryFilters = () => {
    const search = document.getElementById('inventory-filter-search');
    const category = document.getElementById('inventory-filter-category');
    if (search) search.value = '';
    if (category) category.value = '';
    applyInventoryFilters();
}

function renderHomeRecentActivity() {
    const homeRecent = document.getElementById('home-recent-table');
    if (!homeRecent) return;
    const groupedRecent = groupTransactionsByScanEvent(allTransactionData).slice(0, 5);
    homeRecent.innerHTML = groupedRecent.map(t => `
        <tr class="border-b border-gray-50 hover:bg-gray-50"><td class="py-4 px-2 font-bold text-gray-900 text-sm">${escapeHtml(getStudentDisplayName(t.username))}</td><td class="py-4 px-2 text-gray-500 text-sm font-medium">${escapeHtml(t.equipment_name)}</td><td class="py-4 px-2 text-right"><span class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest ${t.action_type === 'borrow' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-500'}">${escapeHtml(t.action_type)}</span></td></tr>
    `).join('');
}

function formatEquipmentSummary(items) {
    const counts = {};
    items.forEach(name => {
        const label = String(name || '').trim();
        if (!label) return;
        counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([name, count]) => `${name}${count > 1 ? ` (x${count})` : ''}`)
        .join('\n');
}

function groupTransactionsByScanEvent(transactions) {
    const groupedMap = new Map();
    (transactions || []).forEach(t => {
        const key = [
            t.username || '',
            t.action_type || '',
            t.custodian || '',
            t.timestamp || ''
        ].join('|');
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                ...t,
                _equipmentNames: [],
                _rawRows: []
            });
        }
        const group = groupedMap.get(key);
        group._equipmentNames.push(t.equipment_name || 'Unnamed Item');
        group._rawRows.push(t);
    });
    return Array.from(groupedMap.values())
        .map(group => ({
            ...group,
            equipment_name: formatEquipmentSummary(group._equipmentNames),
            item_count: group._equipmentNames.length
        }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function renderInventoryRows(items) {
    return items.map(i => {
        const imageUrl = escapeHtml(i.image_url || 'Items/1.png');
        const itemName = escapeHtml(i.name || 'Unnamed Item');
        const itemDesc = escapeHtml(i.description || 'Lab Equipment');
        const itemCategory = escapeHtml(i.category || 'N/A');
        // Escape quotes for onclick attributes
        const safeName = (i.name || '').replace(/'/g, "\\'");
        const safeImage = (i.image_url || '').replace(/'/g, "\\'");
        const safeCategory = (i.category || '').replace(/'/g, "\\'");
        const safeDescription = (i.description || '').replace(/'/g, "\\'");
        const stockCount = i.available || 0;
        const stockStatus = stockCount <= 0 ? 'Out of Stock' : stockCount <= 2 ? 'Low Stock' : 'In Stock';
        const statusClass = stockCount <= 0 ? 'bg-red-50 text-red-600 border-red-100' : stockCount <= 2 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100';
        return `
                    <tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors">
                        <td class="px-8 py-6">
                            <div class="flex items-center gap-6">
                                <img src="${imageUrl}" onerror="this.src='https://via.placeholder.com/60'" class="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-sm">
                                <div class="break-words whitespace-normal"><div class="font-bold text-gray-900 text-lg">${itemName}</div><div class="text-sm text-gray-500">${itemDesc}</div></div>
                            </div>
                        </td>
                        <td class="px-8 py-6 text-center"><span class="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-widest">${itemCategory}</span></td>
                        <td class="px-8 py-6 text-base font-mono text-gray-500 text-center">SCI-${String(i.id).padStart(4, '0')}</td>
                        <td class="px-8 py-6 text-center">
                            <div class="flex items-center justify-center gap-3">
                                <span class="font-extrabold text-gray-900 text-2xl">${stockCount}</span>
                                <span class="px-3 py-1 ${statusClass} rounded text-[10px] font-bold uppercase tracking-widest border">${stockStatus}</span>
                            </div>
                        </td>
                        <td class="px-8 py-6 text-right whitespace-nowrap">
                            <button class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-xl text-sm font-bold transition-all mr-3 shadow-sm" onclick="openEquipmentEditModal(${i.id}, '${safeName}', ${stockCount}, '${safeImage}', '${safeCategory}', '${safeDescription}')">Edit</button>
                            <button class="bg-red-50 hover:bg-red-500 hover:text-white text-red-600 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm" onclick="document.getElementById('am_item_id').value='${escapeHtml(i.id)}'; deleteEquipmentItem()">Delete</button>
                        </td>
                    </tr>`;
    }).join('');
}

function populateInventoryFilterOptions() {
    const select = document.getElementById('inventory-filter-category');
    if (!select) return;
    const categories = Array.from(new Set(inventoryData.map(i => (i.category || 'Unspecified').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">All Categories</option>` + categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
}

window.applyInventoryFilters = () => {
    const body = document.getElementById('inventory-table-body');
    if (!body) return;
    const searchQuery = (document.getElementById('inventory-filter-search')?.value || '').trim().toLowerCase();
    const category = (document.getElementById('inventory-filter-category')?.value || '').trim().toLowerCase();
    const filtered = inventoryData.filter(item => {
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const cat = (item.category || 'Unspecified').toLowerCase();
        const matchesSearch = !searchQuery || name.includes(searchQuery) || desc.includes(searchQuery) || cat.includes(searchQuery);
        const matchesCategory = !category || cat === category;
        return matchesSearch && matchesCategory;
    });
    body.innerHTML = filtered.length ? renderInventoryRows(filtered) : `<tr><td colspan="5" class="px-8 py-12 text-center text-sm text-gray-500">No inventory items match your filter criteria.</td></tr>`;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('inventory-filter-category')) populateInventoryFilterOptions();
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isMaintenanceMode) return showPopup('System locked for maintenance.', true);
    const user = document.getElementById('loginUser').value.trim(), pass = document.getElementById('loginPass').value.trim();
    document.getElementById('loading-screen')?.classList.remove('hidden');
    try {
        const { data, error } = await sb.from('accounts').select('*').eq('username', user).eq('password', pass).limit(1);
        if (error) throw error;
        if (data && data.length > 0) loginSystem(data[0]); else showPopup('Invalid Credentials.', true);
    } catch (err) { showPopup('System Error', true); } finally { document.getElementById('loading-screen')?.classList.add('hidden'); }
});

async function attemptRFIDLogin(code) {
    if (!code) return;
    const cardCode = code.replace(/[\r\n]+/g, '').trim();
    if (!cardCode) return;
    document.getElementById('loading-screen')?.classList.remove('hidden');
    try {
        const { data, error } = await sb.from('accounts').select('*').in('role', ['admin', 'dev', 'superadmin']);
        if (error) throw error;
        const account = data && data.find(a => (a.username || '').toString() === cardCode || (a.student_number || '').toString() === cardCode);
        if (account) {
            loginSystem(account);
        } else {
            showPopup('Card not recognized for admin login.', true);
        }
    } catch (err) {
        showPopup('Login error.', true);
    } finally {
        document.getElementById('loading-screen')?.classList.add('hidden');
    }
}
let loginRFIDTimeout;
document.getElementById('login_rfid_input')?.addEventListener('input', (e) => {
    clearTimeout(loginRFIDTimeout);
    loginRFIDTimeout = setTimeout(() => {
        const code = e.target.value.trim();
        if (code) {
            attemptRFIDLogin(code);
            e.target.value = '';
        }
    }, 500);
});
document.getElementById('login_rfid_input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(loginRFIDTimeout);
        const code = e.target.value.trim();
        if (code) {
            attemptRFIDLogin(code);
        }
        e.target.value = '';
    }
});

document.getElementById('maintenance-dev-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('mDevUser').value.trim(), pass = document.getElementById('mDevPass').value.trim();
    try {
        const { data, error } = await sb.from('accounts').select('*').eq('username', user).eq('password', pass).in('role', ['dev', 'superadmin']).limit(1);
        if (data && data.length > 0) {
            // Allow privileged login during maintenance without changing global maintenance state.
            document.getElementById('maintenance-overlay').classList.add('hidden');
            loginSystem(data[0]);
        } else { showPopup('Override Failed.', true); }
    } catch (err) { showPopup('DB Error.', true); }
});

document.getElementById('devManualForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('devUser').value.trim(), pass = document.getElementById('devPass').value.trim();
    try {
        const { data, error } = await sb.from('accounts').select('*').eq('username', user).eq('password', pass).in('role', ['dev', 'superadmin']).limit(1);
        if (data && data.length > 0) { document.getElementById('view-dev-login').classList.add('hidden'); loginSystem(data[0]); } else { showPopup('Denied.', true); }
    } catch (err) { showPopup('Error.', true); }
});

document.getElementById('dev_rfid_input')?.addEventListener('input', (e) => {
    clearTimeout(window.devRFIDTimeout);
    window.devRFIDTimeout = setTimeout(() => {
        const code = e.target.value.trim();
        if (code) {
            document.getElementById('devUser').value = code;
            document.getElementById('devPass').focus();
            e.target.value = '';
        }
    }, 500);
});
document.getElementById('dev_rfid_input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(window.devRFIDTimeout);
        const code = e.target.value.trim();
        if (code) {
            document.getElementById('devUser').value = code;
            document.getElementById('devPass').focus();
        }
        e.target.value = '';
    }
});

// ================= SIGN UP =================
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const user = document.getElementById('signupUser').value.trim();
    const pass = document.getElementById('signupPass').value.trim();
    const passConfirm = document.getElementById('signupPassConfirm').value.trim();
    const dept = document.getElementById('signupDept').value.trim();
    const orgId = document.getElementById('signupOrgId').value.trim();
    if (orgId !== '2026') return showPopup('Invalid Organization ID.', true);
    if (pass !== passConfirm) return showPopup('Passwords do not match.', true);
    if (pass.length < 4) return showPopup('Password must be at least 4 characters.', true);
    document.getElementById('loading-screen')?.classList.remove('hidden');
    try {
        const { data: existing } = await sb.from('accounts').select('username').eq('username', user).limit(1);
        if (existing && existing.length > 0) { showPopup('Username already exists.', true); return; }
        const payload = { role: 'admin', username: user, password: pass, full_name: name, section: dept, student_number: user };
        const { error } = await sb.from('accounts').insert([payload]);
        if (error) throw error;
        showPopup('Account created successfully!');
        toggleSignUp(false);
        document.getElementById('loginUser').value = user;
        document.getElementById('loginPass').value = pass;
    } catch (err) { showPopup('Error creating account: ' + (err.message || 'Unknown'), true); }
    finally { document.getElementById('loading-screen')?.classList.add('hidden'); }
});

window.logoutSequence = () => { localStorage.removeItem('scitrack_admin_session'); location.reload(); }

function loginSystem(user) {
    currentUser = user;
    const avatarFallback = localStorage.getItem(`scitrack_admin_avatar_${user.username}`);
    if (!user.avatar_url && avatarFallback) user.avatar_url = avatarFallback;
    localStorage.setItem('scitrack_admin_session', JSON.stringify(user));

    document.getElementById('view-login')?.classList.add('hidden');
    document.getElementById('view-dashboard')?.classList.remove('hidden');
    document.body.className = 'mode-admin-dash antialiased h-screen w-screen overflow-hidden flex'; 

    // Attach logout listeners AFTER DOM is visible
    setTimeout(() => {
        document.querySelectorAll('.btn-logout').forEach(btn => {
            btn.removeEventListener('click', logoutSequence);
            btn.addEventListener('click', logoutSequence);
        });
    }, 50);
    document.querySelectorAll('.gsap-tab').forEach(c => { c.classList.remove('active-tab'); gsap.set(c, { opacity: 0, y: 20, display: 'none' }); });
    
    const homeTab = document.getElementById('tab-home');
    if (homeTab) { homeTab.classList.add('active-tab'); gsap.to(homeTab, { opacity: 1, y: 0, duration: 0.3, display: 'block' }); }
    
    updateAdminProfileUI(user);
    if (user.role === 'dev' || user.role === 'superadmin') { document.getElementById('dev-links')?.classList.remove('hidden'); document.getElementById('dev-badge')?.classList.remove('hidden'); loadDevData(); }
    loadNotificationsFromDB();
    loadDashboardData();
}

function updateAdminProfileUI(user) {
    const portalTitle = user.role === 'superadmin' ? 'SUPER ADMIN PORTAL' : 'Admin Portal';
    const portalEl = document.getElementById('portal-title');
    if (portalEl) portalEl.textContent = portalTitle;
    
    document.querySelectorAll('#userNameDisplay').forEach(el => el.textContent = user.full_name || user.username);
    document.querySelectorAll('#userSectorDisplay').forEach(el => el.textContent = user.section || user.adviser || 'Unassigned');
    if(document.getElementById('ap_username')) document.getElementById('ap_username').value = user.username;
    if(document.getElementById('ap_fullname')) document.getElementById('ap_fullname').value = user.full_name || '';
    if(document.getElementById('ap_sector')) document.getElementById('ap_sector').value = user.section || user.adviser || '';

    const avatarURL = user.avatar_url || localStorage.getItem(`scitrack_admin_avatar_${user.username}`);
    document.querySelectorAll('#sidebar-avatar').forEach(img => {
        if (avatarURL) { img.src = avatarURL; img.classList.remove('hidden'); img.nextElementSibling.classList.add('hidden'); }
    });
}

document.getElementById('adminProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullname = document.getElementById('ap_fullname').value, sector = document.getElementById('ap_sector').value;
    let avatarToSave = currentUser?.avatar_url || null;
    if (document.getElementById('ap_avatar').files.length > 0) {
        avatarToSave = await toBase64(document.getElementById('ap_avatar').files[0]);
        localStorage.setItem(`scitrack_admin_avatar_${currentUser.username}`, avatarToSave);
    }
    try {
        await sb.from('accounts').update({ full_name: fullname, section: sector, avatar_url: avatarToSave }).eq('username', currentUser.username);
        currentUser.full_name = fullname; currentUser.section = sector; currentUser.avatar_url = avatarToSave;
        localStorage.setItem('scitrack_admin_session', JSON.stringify(currentUser));
        updateAdminProfileUI(currentUser); showPopup('Profile saved successfully.');
    } catch (err) { showPopup('Error: ' + err.message, true); }
});

// ================= DATA LOADING =================
async function loadDashboardData() {
    try {
        const { data: inv } = await sb.from('equipment').select('*').order('name');
        if (inv) {
            inventoryData = inv;
            const lowStockItems = inv.filter(i => (i.available || 0) <= 2);
            populateInventoryFilterOptions();
            applyInventoryFilters();
            if(document.getElementById('stat-avail')) document.getElementById('stat-avail').textContent = inv.reduce((sum, i) => sum + (i.available || 0), 0);
            if(document.getElementById('rfid_item_select')) document.getElementById('rfid_item_select').innerHTML = inv.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${i.available || 0} Units)</option>`).join('');
            if(document.getElementById('settings-attention-count')) document.getElementById('settings-attention-count').textContent = `${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'} need review`;
            if(document.getElementById('settings-attention-desc')) document.getElementById('settings-attention-desc').textContent = lowStockItems.length > 0 ? 'Low stock and out-of-stock items are highlighted in inventory.' : 'Inventory levels are healthy.';
            if(document.getElementById('settings-attention-badge')) document.getElementById('settings-attention-badge').className = lowStockItems.length > 0 ? 'status-badge offline' : 'status-badge online';
        }

        const { data: tx } = await sb.from('transactions').select('*').order('timestamp', { ascending: false });
        if (tx) {
            allTransactionData = tx;
            // Calculate active borrowed items
            const activeLoansMap = {};
            tx.forEach(t => {
                const key = `${t.username}\t${t.equipment_name}`;
                if (!activeLoansMap[key]) activeLoansMap[key] = { borrow: 0, return: 0, lastBorrow: null };
                if (t.action_type === 'borrow') {
                    activeLoansMap[key].borrow++;
                    if (!activeLoansMap[key].lastBorrow || new Date(t.timestamp) > new Date(activeLoansMap[key].lastBorrow)) {
                        activeLoansMap[key].lastBorrow = t.timestamp;
                    }
                } else if (t.action_type === 'return') {
                    activeLoansMap[key].return++;
                }
            });
            allBorrowedData = Object.keys(activeLoansMap).filter(key => activeLoansMap[key].borrow > activeLoansMap[key].return).map(key => {
                const [username, equipment_name] = key.split('\t');
                return { username, equipment_name, timestamp: activeLoansMap[key].lastBorrow };
            });
            if(document.getElementById('stat-borrowed')) document.getElementById('stat-borrowed').textContent = allBorrowedData.length;
            renderHomeRecentActivity();
        }

        const { data: users } = await sb.from('accounts').select('*').eq('role', 'student');
        if (users) {
            allStudentsData = users;
            if(document.getElementById('stat-users')) document.getElementById('stat-users').textContent = allStudentsData.length;
            renderHomeRecentActivity();
            if(window.applyStudentFilters) window.applyStudentFilters();
        }

        const { data: inc } = await sb.from('incident_reports').select('*').order('created_at', { ascending: false });
        if (inc) {
            const activeIncidents = inc.filter(i => !i.type?.startsWith('[ARCHIVED]'));
            const archivedIncidents = inc.filter(i => i.type?.startsWith('[ARCHIVED]'));
            if(document.getElementById('stat-incidents')) document.getElementById('stat-incidents').textContent = activeIncidents.length;
            if(document.getElementById('incident-active-count')) document.getElementById('incident-active-count').textContent = `${activeIncidents.length} active`;
            if(document.getElementById('incident-archived-count')) document.getElementById('incident-archived-count').textContent = `${archivedIncidents.length} archived`;
            const incBody = document.getElementById('incident-table-body');
            if(incBody) incBody.innerHTML = activeIncidents.map(i => {
                const recordKey = getIncidentRecordKey(i);
                const actionButtons = recordKey ? `<button onclick="archiveIncident('${recordKey.value}','${recordKey.field}')" class="text-xs font-bold text-gray-400 hover:text-black mr-4 uppercase tracking-widest">Archive</button><button onclick="deleteIncident('${recordKey.value}','${recordKey.field}')" class="bg-red-50 text-red-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest">Delete</button>` : '<span class="text-xs text-gray-400">No action ID</span>';
                return `<tr class="border-b border-gray-100 hover:bg-red-50/30 transition-colors"><td class="p-4 text-sm font-medium text-gray-500">${escapeHtml(i.incident_date)}</td><td class="p-4 font-extrabold text-red-500 text-sm uppercase tracking-widest">${escapeHtml(i.type)}</td><td class="p-4 text-base font-bold break-words whitespace-normal">${escapeHtml(i.apparatus)}</td><td class="p-4 text-sm font-mono font-bold">${escapeHtml(i.student_number)}</td><td class="p-4 font-medium break-words whitespace-normal text-sm">${escapeHtml(i.teacher_in_charge)}</td><td class="p-4 text-xs text-gray-400 break-words whitespace-normal">${escapeHtml(i.reported_by)}</td><td class="p-4 text-right whitespace-nowrap">${actionButtons}</td></tr>`;
            }).join('');
            const archivedBody = document.getElementById('archived-incident-table-body');
            if(archivedBody) archivedBody.innerHTML = archivedIncidents.map(i => {
                const recordKey = getIncidentRecordKey(i);
                const incidentType = escapeHtml((i.type || '').replace(/^\[ARCHIVED\]\s*/i, ''));
                const actionButtons = recordKey ? `<button onclick="restoreIncident('${recordKey.value}','${recordKey.field}')" class="text-xs font-bold text-primary hover:text-black mr-4 uppercase tracking-widest">Restore</button><button onclick="deleteIncident('${recordKey.value}','${recordKey.field}')" class="bg-red-50 text-red-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest">Delete</button>` : '<span class="text-xs text-gray-400">No action ID</span>';
                return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors"><td class="p-4 text-sm font-medium text-gray-500">${escapeHtml(i.incident_date)}</td><td class="p-4 font-extrabold text-gray-500 text-sm uppercase tracking-widest">${incidentType}</td><td class="p-4 text-base font-bold break-words whitespace-normal">${escapeHtml(i.apparatus)}</td><td class="p-4 text-sm font-mono font-bold">${escapeHtml(i.student_number)}</td><td class="p-4 font-medium break-words whitespace-normal text-sm">${escapeHtml(i.teacher_in_charge)}</td><td class="p-4 text-xs text-gray-400 break-words whitespace-normal">${escapeHtml(i.reported_by)}</td><td class="p-4 text-right whitespace-nowrap">${actionButtons}</td></tr>`;
            }).join('');
        }

        // Load maintenance status for dashboard display
        try {
            const { data: settings } = await sb.from('system_settings').select('*').eq('id', 1).single();
            if (settings) {
                const badge = document.getElementById('dash-maintenance-badge');
                const statusText = document.getElementById('dash-maintenance-status');
                const msgEl = document.getElementById('dash-maintenance-msg');
                if (badge && statusText) {
                    if (settings.maintenance_active) {
                        badge.className = 'status-badge offline';
                        statusText.textContent = 'Maintenance Active';
                    } else {
                        badge.className = 'status-badge online';
                        statusText.textContent = 'Operational';
                    }
                }
                if (msgEl) msgEl.textContent = settings.maintenance_message || 'All systems running normally.';
                const updateEl = document.getElementById('dash-last-update');
                if (updateEl) updateEl.textContent = 'Last checked: ' + new Date().toLocaleString();
                // Service updates display
                const svcTitle = document.getElementById('dash-service-title');
                const svcDesc = document.getElementById('dash-service-desc');
                if (svcTitle && svcDesc && settings) {
                    const title = settings.service_update_title ? String(settings.service_update_title).trim() : '';
                    const desc = settings.service_update_desc ? String(settings.service_update_desc).trim() : '';
                    const cache = getServiceUpdateCache();
                    const effectiveTitle = title || cache?.title || '';
                    const effectiveDesc = desc || cache?.desc || '';
                    if (effectiveTitle !== '' || effectiveDesc !== '') {
                        svcTitle.textContent = effectiveTitle || 'Service Update';
                        svcDesc.textContent = effectiveDesc !== '' ? effectiveDesc : '(No description provided)';
                    } else {
                        svcTitle.textContent = 'No Updates';
                        svcDesc.textContent = 'No updates posted yet.';
                    }
                }
            }
        } catch(e) {
            console.warn('Settings fetch warning:', e);
            const svcTitle = document.getElementById('dash-service-title');
            const svcDesc = document.getElementById('dash-service-desc');
            const cache = getServiceUpdateCache();
            if (svcTitle && svcDesc) {
                if (cache?.title || cache?.desc) {
                    svcTitle.textContent = cache.title || 'Service Update';
                    svcDesc.textContent = cache.desc || '(No description provided)';
                } else {
                    svcTitle.textContent = 'No Updates';
                    svcDesc.textContent = 'No updates posted yet.';
                }
            }
        }

        // Usage Insights
        updateUsageInsights();
        
        if(window.applyFilters) window.applyFilters();
        if(window.applyStudentFilters) window.applyStudentFilters();

    } catch (e) { console.error('Data Load Error', e); }
}

window.applyFilters = () => {
    const bSearch = document.getElementById('filter_borrowed_search')?.value.toLowerCase() || '';
    const bSort = document.getElementById('filter_borrowed_sort')?.value || 'newest';
    let filteredB = allBorrowedData.filter(t => t.username.toLowerCase().includes(bSearch) || t.equipment_name.toLowerCase().includes(bSearch));
    if (bSort === 'oldest') filteredB.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const bBody = document.getElementById('borrowed-table-body');
    if(bBody) {
        bBody.innerHTML = filteredB.map(t => `<tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors"><td class="px-8 py-6 font-mono text-base font-bold text-gray-500">${escapeHtml(t.username)}</td><td class="px-8 py-6 font-bold text-gray-900 text-lg break-words whitespace-normal">${escapeHtml(t.equipment_name)}</td><td class="px-8 py-6 text-sm font-medium text-gray-500 text-right">${new Date(t.timestamp).toLocaleString()}</td></tr>`).join('');
    }

    const hSearch = document.getElementById('filter_history_search')?.value.toLowerCase() || '';
    const hTime = document.getElementById('filter_history_time')?.value || 'all';
    const hSort = document.getElementById('filter_history_sort')?.value || 'newest';
    let filteredH = allTransactionData.filter(t => {
        const custodianValue = (t.custodian || '').toString().toLowerCase();
        const studentName = getStudentDisplayName(t.username).toLowerCase();
        return studentName.includes(hSearch) || t.username.toLowerCase().includes(hSearch) || t.equipment_name.toLowerCase().includes(hSearch) || custodianValue.includes(hSearch);
    });
    if (hTime === 'today') { const now = new Date().toDateString(); filteredH = filteredH.filter(t => new Date(t.timestamp).toDateString() === now); }
    if (hSort === 'oldest') filteredH.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const groupedHistory = groupTransactionsByScanEvent(filteredH);
    window.currentFilteredHistory = groupedHistory; 
    
    const hBody = document.getElementById('history-table-body');
    if(hBody) {
        hBody.innerHTML = groupedHistory.map(t => `<tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors"><td class="px-8 py-6 font-mono text-base font-bold text-gray-500">${escapeHtml(getStudentDisplayName(t.username))}</td><td class="px-8 py-6 font-semibold text-gray-900 text-sm break-words whitespace-pre-line">${escapeHtml(t.equipment_name)}</td><td class="px-8 py-6 text-sm font-semibold text-gray-500 break-words whitespace-normal">${escapeHtml(t.custodian || 'N/A')}</td><td class="px-8 py-6 text-center"><span class="px-4 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-widest ${t.action_type === 'borrow' ? 'bg-primary-light text-primary border border-primary/20' : 'bg-gray-100 text-gray-600 border border-gray-200'}">${escapeHtml(t.action_type)}</span></td><td class="px-8 py-6 text-right text-sm font-medium text-gray-400">${new Date(t.timestamp).toLocaleString()}</td></tr>`).join('');
    }
}

window.applyStudentFilters = () => {
    const sSearch = document.getElementById('filter_student_search')?.value.toLowerCase() || '';
    const sSec = document.getElementById('filter_student_section')?.value.toLowerCase() || '';
    const sSort = document.getElementById('filter_student_sort')?.value || 'az';
    let fStudents = allStudentsData.filter(s => (s.username.toLowerCase().includes(sSearch) || (s.full_name || '').toLowerCase().includes(sSearch)) && (s.section || '').toLowerCase().includes(sSec));
    if (sSort === 'az') fStudents.sort((a,b) => (a.full_name || '').localeCompare(b.full_name || '')); else fStudents.sort((a,b) => (b.full_name || '').localeCompare(a.full_name || ''));

    const sBody = document.getElementById('students-table-body');
    if(sBody) {
        sBody.innerHTML = fStudents.map(s => `<tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors"><td class="px-8 py-6 font-mono text-base font-bold text-gray-500">${escapeHtml(s.student_number)}</td><td class="px-8 py-6 font-extrabold text-gray-900 text-lg break-words whitespace-normal">${escapeHtml(s.full_name)}</td><td class="px-8 py-6 text-base font-medium break-words whitespace-normal">${escapeHtml(s.section)}</td><td class="px-8 py-6 text-base font-medium break-words whitespace-normal">${escapeHtml(s.adviser || 'N/A')}</td><td class="px-8 py-6 text-right whitespace-nowrap"><button class="bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl text-xs font-bold mr-3 shadow-sm transition-colors uppercase tracking-widest" onclick="triggerStudentProfile('${s.student_number}')">Profile</button><button class="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors uppercase tracking-widest shadow-sm" onclick="deleteStudent('${s.username}')">Remove</button></td></tr>`).join('');
    }
}

// ================= EXPORTS & CRUD =================
window.exportDataCSV = () => {
    const dataToExport = window.currentFilteredHistory || allTransactionData;
    if (!dataToExport.length) return showPopup("No data to export.");
    const headers = "Date/Time,Student ID,Item,Action,Assisted By\n";
    const rows = dataToExport.map(t => `"${new Date(t.timestamp).toLocaleString()}","${t.username}","${t.equipment_name}","${String(t.action_type || '').toUpperCase()}","${t.custodian || 'N/A'}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `SciTrack_History_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); window.URL.revokeObjectURL(url);
}
window.exportDataPDF = (containerId, prefix) => {
    const el = document.getElementById(containerId);
    if(el) html2pdf().set({ margin: 0.5, filename: `SciTrack_${prefix}_${new Date().toISOString().split('T')[0]}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' } }).from(el).save();
}
window.exportInventoryCSV = () => {
    if (!inventoryData || !inventoryData.length) return showPopup('No inventory data to export.', true);
    const headers = 'Item Name,Category,Serial Number,Available\n';
    const rows = inventoryData.map(item => `"${escapeHtml(item.name)}","${escapeHtml(item.category || '')}","SCI-${String(item.id).padStart(4, '0')}","${item.available || 0}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `SciTrack_Inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); window.URL.revokeObjectURL(url);
}
window.deleteStudent = async (username) => {
    openConfirmModal({
        title: 'Delete Student',
        message: `Delete student account ${username}? This action cannot be undone.`,
        confirmText: 'Delete',
        onConfirm: async () => {
            try { await sb.from('accounts').delete().eq('username', username); showPopup('Student removed.'); loadDashboardData(); } catch(err) { showPopup('Error.', true); }
        }
    });
}
window.triggerStudentProfile = (identifier) => {
    const student = allStudentsData.find(s => s.student_number === identifier || s.username === identifier);
    if (!student) return showPopup('Student not found.');
    document.getElementById('sp_avatar').src = student.avatar_url || 'https://via.placeholder.com/80';
    document.getElementById('sp_name').textContent = student.full_name || 'Unregistered';
    document.getElementById('sp_id').textContent = student.student_number;
    document.getElementById('sp_section').textContent = student.section || 'N/A';
    document.getElementById('sp_adviser').textContent = student.adviser || 'N/A';
    document.getElementById('sp_email').textContent = student.email || 'N/A';
    document.getElementById('sp_phone').textContent = student.phone || 'N/A';

    const studentHistory = allTransactionData.filter(t => t.username === student.username);
    const activeLoans = {};
    studentHistory.forEach(t => { if (!activeLoans[t.equipment_name]) activeLoans[t.equipment_name] = 0; if (t.action_type === 'borrow') activeLoans[t.equipment_name]++; else if (t.action_type === 'return') activeLoans[t.equipment_name]--; });
    const activeHtml = Object.keys(activeLoans).filter(k => activeLoans[k] > 0).map(k => `<li class="font-bold text-gray-900 bg-white p-3 rounded-xl border border-emerald-100 shadow-sm break-words whitespace-normal">${escapeHtml(k)} <span class="text-primary ml-1">(${activeLoans[k]}x)</span></li>`).join('');
    document.getElementById('sp_active_loans').innerHTML = activeHtml || '<li style="list-style:none;color:#9ca3af;">No active equipment.</li>';
    document.getElementById('sp_history_table').innerHTML = studentHistory.slice(0, 15).map(t => `<tr class="hover:bg-gray-50"><td class="p-4"><strong class="${t.action_type === 'borrow' ? 'text-primary bg-primary-light px-2 py-1 rounded' : 'text-gray-500 bg-gray-100 px-2 py-1 rounded'} uppercase text-[10px] tracking-widest">${t.action_type}</strong></td><td class="p-4 font-bold text-gray-700 break-words whitespace-normal">${escapeHtml(t.equipment_name)}</td><td class="p-4 text-xs font-medium text-gray-400">${new Date(t.timestamp).toLocaleDateString()}</td></tr>`).join('');
    document.getElementById('student-profile-modal').classList.remove('hidden');
}
document.getElementById('rfid_profile_trigger')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); triggerStudentProfile(e.target.value.trim()); e.target.value = ''; }
});

// Registration
let lockedRfidForReg = "";
window.verifyNewRFID = () => {
    const input = document.getElementById('reg_scan_input').value.trim();
    if (!input) return showPopup('Please scan an RFID card first.', true);
    if (allStudentsData.find(s => s.student_number === input)) return showPopup('RFID already linked.', true);
    lockedRfidForReg = input; document.getElementById('locked_rfid_display').textContent = lockedRfidForReg;
    document.getElementById('register-step-1').classList.add('hidden'); document.getElementById('register-step-2').classList.remove('hidden');
}
window.resetRegistration = () => { lockedRfidForReg = ""; document.getElementById('reg_scan_input').value = ""; document.getElementById('studentRegForm').reset(); document.getElementById('register-step-2').classList.add('hidden'); document.getElementById('register-step-1').classList.remove('hidden'); setTimeout(() => document.getElementById('reg_scan_input')?.focus(), 100); }

let regTimeout;
document.getElementById('reg_scan_input')?.addEventListener('input', () => {
    clearTimeout(regTimeout);
    regTimeout = setTimeout(() => {
        const code = document.getElementById('reg_scan_input').value.trim();
        if (code) verifyNewRFID();
    }, 500);
});
document.getElementById('reg_scan_input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(regTimeout);
        verifyNewRFID();
    }
});
document.getElementById('studentRegForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { role: 'student', full_name: document.getElementById('sr_name').value, student_number: lockedRfidForReg, username: lockedRfidForReg, password: lockedRfidForReg, section: document.getElementById('sr_section').value, phone: document.getElementById('sr_phone').value, email: document.getElementById('sr_email').value };
    if (document.getElementById('sr_avatar').files.length > 0) payload.avatar_url = await toBase64(document.getElementById('sr_avatar').files[0]);
    try { await sb.from('accounts').insert([payload]); showPopup(`Student Registered Successfully.`); resetRegistration(); loadDashboardData(); } catch (err) { showPopup('Error: Duplicate ID?', true); }
});

// Cart Logic
window.toggleRFIDMode = () => { setTimeout(() => document.getElementById('rfid_input')?.focus(), 100); }
window.addEquipmentToCart = () => {
    const select = document.getElementById('rfid_item_select');
    if (!select.value) return;
    const item = inventoryData.find(i => i.id == select.value);
    if (!item) return showPopup('Selected item not found.', true);
    const action = document.querySelector('input[name="rfid_action"]:checked')?.value || 'borrow';
    const qty = Math.max(1, parseInt(document.getElementById('cart_qty').value, 10) || 1);
    const total = window.cartItems.reduce((sum, c) => sum + c.qty, 0);
    if (total >= 10) return showPopup('Max 10 items allowed.', true);
    const existing = window.cartItems.find(c => c.id == select.value);

    if (action === 'return') {
        // Returning items should not be restricted by current available stock.
        const roomLeft = 10 - total;
        const qtyToAdd = Math.min(qty, roomLeft);
        if (existing) existing.qty += qtyToAdd;
        else window.cartItems.push({ id: select.value, name: select.options[select.selectedIndex].text.split(' (')[0], qty: qtyToAdd });
        if (qtyToAdd < qty) showPopup('Only added up to cart limit (10).', true);
        renderCartUI();
        return;
    }

    // Borrowing must never exceed available stock.
    const existingQty = existing ? existing.qty : 0;
    const remainingStock = Math.max(0, (item.available || 0) - existingQty);
    if (remainingStock <= 0) return showPopup('Not enough stock for this item.', true);
    const roomLeft = 10 - total;
    const qtyToAdd = Math.min(qty, remainingStock, roomLeft);
    if (qtyToAdd <= 0) return showPopup('Cannot add more items.', true);
    if (qtyToAdd < qty) showPopup(`Only ${qtyToAdd} unit(s) can be added based on stock/cart limit.`, true);

    if (existing) existing.qty += qtyToAdd;
    else window.cartItems.push({ id: select.value, name: select.options[select.selectedIndex].text.split(' (')[0], qty: qtyToAdd });
    renderCartUI();
}
window.removeEquipmentFromCart = (index) => { window.cartItems.splice(index, 1); renderCartUI(); }
function renderCartUI() {
    const list = document.getElementById('cart-list');
    const total = window.cartItems.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cart-counter').textContent = `${total}/10`;
    if (!window.cartItems.length) { list.innerHTML = `<li class="text-gray-400 text-sm font-medium italic p-2">List is empty.</li>`; return; }
    list.innerHTML = window.cartItems.map((item, i) => `<li class="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm"><span class="font-bold text-gray-800 break-words whitespace-normal">${i + 1}. ${escapeHtml(item.name)} (x${item.qty})</span><button type="button" class="text-red-500 font-bold hover:bg-red-50 w-8 h-8 rounded-full transition-colors flex items-center justify-center" onclick="removeEquipmentFromCart(${i})">×</button></li>`).join('');
}

let rfidTimeout;
document.getElementById('rfid_input')?.addEventListener('input', () => {
    clearTimeout(rfidTimeout);
    rfidTimeout = setTimeout(async () => {
        const code = document.getElementById('rfid_input').value.trim();
        if (code) {
            document.getElementById('loading-screen').classList.remove('hidden');
            const action = document.querySelector('input[name="rfid_action"]:checked').value;
            if (action === 'borrow') await processBorrow(code);
            else await processAutoReturn(code);
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('rfid_input').value = '';
            document.getElementById('rfid_input').focus();
        }
    }, 500);
});
document.getElementById('rfid_input')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(rfidTimeout);
        const code = e.target.value.trim();
        if (code) {
            document.getElementById('loading-screen').classList.remove('hidden');
            const action = document.querySelector('input[name="rfid_action"]:checked').value;
            if (action === 'borrow') await processBorrow(code);
            else await processAutoReturn(code);
            document.getElementById('loading-screen').classList.add('hidden');
        }
        e.target.value = '';
        e.target.focus();
    }
});

async function processBorrow(rfidCode) {
    if (!window.cartItems.length) return showPopup('Cart is empty.');
    // Final stock gate: prevents borrowing unavailable items even if UI state is stale.
    for (const cartItem of window.cartItems) {
        const invItem = inventoryData.find(i => String(i.id) === String(cartItem.id));
        if (!invItem || (invItem.available || 0) < (cartItem.qty || 0)) {
            return showPopup(`Cannot borrow "${cartItem.name}". Available: ${invItem?.available || 0}, requested: ${cartItem.qty || 0}.`, true);
        }
    }
    const student = allStudentsData.find(s => s.student_number === rfidCode);
    if (!student) return showPopup('Unregistered RFID.');
    const txs = [], stockUpdates = {};
    window.cartItems.forEach(item => {
        for (let i = 0; i < item.qty; i++) {
            txs.push({ username: student.student_number || student.username, equipment_name: item.name, action_type: 'borrow' });
        }
        stockUpdates[item.id] = (stockUpdates[item.id] || 0) - item.qty;
    });
    const totalBorrowed = window.cartItems.reduce((sum, item) => sum + item.qty, 0);
    try {
        const { error: txError } = await sb.from('transactions').insert(txs);
        if (txError) throw txError;
        for (const [id, adj] of Object.entries(stockUpdates)) {
            const currentItem = inventoryData.find(i => i.id == id);
            if (currentItem) await sb.from('equipment').update({ available: Math.max(0, currentItem.available + adj) }).eq('id', id);
        }
        await logAdminActivity(
            'Borrow Facilitated',
            `${student.full_name || student.student_number || student.username} borrowed ${totalBorrowed} item${totalBorrowed === 1 ? '' : 's'}`
        );
        showActionPopup(`${student.full_name || student.student_number} borrowed ${totalBorrowed} item${totalBorrowed === 1 ? '' : 's'}.`, 'Confirmed!');
        const borrowSummary = `${student.full_name || student.student_number} borrowed ${totalBorrowed} item${totalBorrowed === 1 ? '' : 's'}.`;
        const borrowedItemsLabel = window.cartItems.map(item => `${item.name}${item.qty > 1 ? ` (x${item.qty})` : ''}`).join('\n');
        await addNotification('Equipment Borrowed', borrowSummary, 'borrow');
        await sendBorrowNotification(student, borrowSummary, borrowedItemsLabel);
        window.cartItems = [];
        renderCartUI();
        await loadDashboardData();
        if (currentUser && ['dev', 'superadmin'].includes(currentUser.role)) await loadDevData();
    } catch (err) { showPopup('Error: ' + (err.message || 'Unable to complete borrow.'), true); }
}

async function sendTransactionEmail(user, message, type, equipmentLabel = '') {
    if (!user?.email) return;
    if (!window.emailjs) {
        console.warn('EmailJS SDK is not loaded.');
        return;
    }
    const now = new Date();
    const params = {
        to_name: user.full_name || user.username || user.student_number || 'Student',
        to_email: user.email,
        // Keep `message` as equipment label for templates that name it "Equipment Name".
        message: equipmentLabel || message || '',
        equipment_name: equipmentLabel || 'N/A',
        summary: message || '',
        action_type: String(type || '').toUpperCase(),
        dateString: now.toLocaleDateString(),
        timeString: now.toLocaleTimeString()
    };
    try {
        await window.emailjs.send('service_scitrack', 'template_scitrack', params);
    } catch (e) {
        console.error('Email send failed:', e);
        showPopup('Transaction saved, but email failed to send.', true);
    }
}

async function sendBorrowNotification(student, message, equipmentLabel) {
    await sendTransactionEmail(student, message, 'borrow', equipmentLabel);
}

async function processAutoReturn(rfidCode) {
    const student = allStudentsData.find(s => s.student_number === rfidCode);
    if (!student) return showPopup('Unregistered RFID.');
    const studentHistory = allTransactionData.filter(t => t.username === (student.student_number || student.username));
    const activeLoans = {};
    studentHistory.forEach(t => {
        if (!activeLoans[t.equipment_name]) activeLoans[t.equipment_name] = 0;
        if (t.action_type === 'borrow') activeLoans[t.equipment_name]++;
        else if (t.action_type === 'return') activeLoans[t.equipment_name]--;
    });
    const activeItemNames = Object.keys(activeLoans).filter(k => activeLoans[k] > 0);
    if (activeItemNames.length === 0) return showPopup('No pending items to return.');
    const returnQtyByItem = {};
    if (window.cartItems.length > 0) {
        // Return exactly what admin selected in cart (single or multiple items).
        for (const cartItem of window.cartItems) {
            const itemName = cartItem.name;
            const borrowedQty = activeLoans[itemName] || 0;
            if (borrowedQty <= 0) {
                return showPopup(`"${itemName}" is not currently borrowed by this student.`, true);
            }
            returnQtyByItem[itemName] = Math.min(Math.max(1, cartItem.qty || 1), borrowedQty);
        }
    } else {
        // Fallback: return selected dropdown item with quantity input.
        const selectedItemId = document.getElementById('rfid_item_select')?.value;
        const selectedItem = inventoryData.find(i => String(i.id) === String(selectedItemId));
        const selectedItemName = selectedItem?.name || '';
        if (!selectedItemName) return showPopup('Select an equipment item to return first.');
        if (!activeLoans[selectedItemName] || activeLoans[selectedItemName] <= 0) {
            return showPopup('Selected item is not currently borrowed by this student.', true);
        }
        const requestedQty = Math.max(1, parseInt(document.getElementById('cart_qty')?.value, 10) || 1);
        returnQtyByItem[selectedItemName] = Math.min(requestedQty, activeLoans[selectedItemName]);
    }
    const itemsToReturn = Object.keys(returnQtyByItem);
    if (itemsToReturn.length === 0) return showPopup('No valid return items selected.', true);

    const txs = [], stockUpdates = {};
    let totalReturned = 0;
    itemsToReturn.forEach(itemName => {
        const qty = returnQtyByItem[itemName];
        for (let i = 0; i < qty; i++) {
            txs.push({ username: student.student_number || student.username, equipment_name: itemName, action_type: 'return' });
            totalReturned++;
        }
        const itemObj = inventoryData.find(i => i.name === itemName);
        if (itemObj) stockUpdates[itemObj.id] = (stockUpdates[itemObj.id] || 0) + qty;
    });
    try {
        const { error: txError } = await sb.from('transactions').insert(txs);
        if (txError) throw txError;
        for (const [id, adj] of Object.entries(stockUpdates)) {
            const currentItem = inventoryData.find(i => i.id == id);
            if (currentItem) await sb.from('equipment').update({ available: currentItem.available + adj }).eq('id', id);
        }
        await logAdminActivity(
            'Return Facilitated',
            `${student.full_name || student.student_number || student.username} returned ${totalReturned} item${totalReturned === 1 ? '' : 's'}`
        );
        showActionPopup(`${student.full_name || student.student_number} returned ${totalReturned} item${totalReturned === 1 ? '' : 's'}.`, 'Confirmed!');
        const returnSummary = `${student.full_name || student.student_number} returned ${totalReturned} item${totalReturned === 1 ? '' : 's'}.`;
        const returnedItemsLabel = itemsToReturn.map(itemName => `${itemName}${returnQtyByItem[itemName] > 1 ? ` (x${returnQtyByItem[itemName]})` : ''}`).join('\n');
        await addNotification('Equipment Returned', returnSummary, 'return');
        await sendReturnNotification(student, returnSummary, returnedItemsLabel);
        window.cartItems = [];
        renderCartUI();
        await loadDashboardData();
        if (currentUser && ['dev', 'superadmin'].includes(currentUser.role)) await loadDevData();
    } catch (err) { showPopup('Error: ' + (err.message || 'Unable to complete return.'), true); }
}

async function sendReturnNotification(student, message, equipmentLabel) {
    await sendTransactionEmail(student, message, 'return', equipmentLabel);
}

// Equip Logic
window.openEquipmentModal = () => { document.getElementById('equipmentForm').reset(); document.getElementById('equipment-modal').classList.remove('hidden'); }
window.closeEquipmentModal = () => document.getElementById('equipment-modal').classList.add('hidden');
document.getElementById('equipmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: document.getElementById('equip_name').value, available: parseInt(document.getElementById('equip_qty').value) || 0, category: document.getElementById('equip_category').value, description: document.getElementById('equip_desc').value };
    if (document.getElementById('equip_image_file').files.length > 0) payload.image_url = await toBase64(document.getElementById('equip_image_file').files[0]);
    try { await sb.from('equipment').insert([payload]); await logAdminActivity('Inventory Added', `Added equipment: ${payload.name || 'Unnamed item'}`); showPopup('Item Added Successfully.'); closeEquipmentModal(); loadDashboardData(); } catch (e) { showPopup('Error adding item.', true); }
});
window.openEquipmentEditModal = (id, name, avail, image_url, cat, desc) => {
    document.getElementById('am_item_id').value = id; document.getElementById('am_name').value = name; document.getElementById('am_qty').value = avail; document.getElementById('am_category').value = cat || ''; document.getElementById('admin-manage-modal').classList.remove('hidden');
}
document.getElementById('adminManageForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('am_item_id').value;
    const updates = { name: document.getElementById('am_name').value, available: parseInt(document.getElementById('am_qty').value) || 0, category: document.getElementById('am_category').value };
    if (document.getElementById('am_image_file').files.length > 0) updates.image_url = await toBase64(document.getElementById('am_image_file').files[0]);
    try { await sb.from('equipment').update(updates).eq('id', id); await logAdminActivity('Inventory Updated', `Updated equipment #${id}: ${updates.name || 'Unnamed item'}`); showPopup('Item Updated.'); document.getElementById('admin-manage-modal').classList.add('hidden'); loadDashboardData(); } catch (e) { showPopup('Error updating item.', true); }
});
window.deleteEquipmentItem = async () => {
    const id = document.getElementById('am_item_id').value;
    if (!id) return showPopup('No item selected.', true);
    openConfirmModal({
        title: 'Delete Equipment',
        message: 'Permanently delete this equipment item? This cannot be undone.',
        confirmText: 'Delete',
        onConfirm: async () => {
            try { await sb.from('equipment').delete().eq('id', id); await logAdminActivity('Inventory Deleted', `Deleted equipment #${id}`); showPopup('Item Deleted.'); document.getElementById('admin-manage-modal').classList.add('hidden'); loadDashboardData(); } catch (e) { showPopup('Error deleting item.', true); }
        }
    });
}

// Incidents
window.openIncidentModal = () => document.getElementById('incident-modal').classList.remove('hidden');
document.getElementById('incidentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { type: document.getElementById('inc_type').value, incident_date: document.getElementById('inc_date').value, student_number: document.getElementById('inc_student').value, teacher_in_charge: document.getElementById('inc_teacher').value, apparatus: document.getElementById('inc_apparatus').value, description: document.getElementById('inc_desc').value, reported_by: currentUser.username };
    try { await sb.from('incident_reports').insert([payload]); await logAdminActivity('Incident Logged', `Filed incident: ${payload.type || 'Incident'} (${payload.apparatus || 'No item'})`); showPopup('Incident Logged.'); document.getElementById('incident-modal').classList.add('hidden'); loadDashboardData(); } catch (err) { showPopup('Error logging incident.', true); }
});
window.archiveIncident = (id, field = 'id') => {
    if (!id) return showPopup('Cannot archive: missing incident identifier.', true);
    openConfirmModal({
        title: 'Archive Incident',
        message: 'Archive this incident so it is moved to the archived list. It can be restored later.',
        confirmText: 'Archive',
        onConfirm: async () => {
            try {
                const incident = await sb.from('incident_reports').select('type').eq(field, id).single();
                if (incident.error) throw incident.error;
                if (!incident.data) return showPopup('Incident not found.', true);
                await sb.from('incident_reports').update({ type: '[ARCHIVED] ' + incident.data.type }).eq(field, id);
                await logAdminActivity('Incident Archived', `Archived incident ${id}`);
                loadDashboardData();
                showPopup('Incident archived.');
            } catch (err) {
                console.error('Archive incident failed', err);
                showPopup('Error archiving incident.', true);
            }
        }
    });
}
window.deleteIncident = (id, field = 'id') => {
    if (!id) return showPopup('Cannot delete: missing incident identifier.', true);
    openConfirmModal({
        title: 'Delete Incident',
        message: 'Permanently delete this incident report? This action cannot be undone.',
        confirmText: 'Delete',
        onConfirm: async () => {
            try {
                const result = await sb.from('incident_reports').delete().eq(field, id);
                if (result.error) throw result.error;
                await logAdminActivity('Incident Deleted', `Deleted incident ${id}`);
                loadDashboardData();
                showPopup('Incident deleted.');
            } catch (err) {
                console.error('Delete incident failed', err);
                showPopup('Error deleting incident.', true);
            }
        }
    });
}
window.restoreIncident = (id, field = 'id') => {
    if (!id) return showPopup('Cannot restore: missing incident identifier.', true);
    openConfirmModal({
        title: 'Restore Incident',
        message: 'Restore this archived incident to the active list?',
        confirmText: 'Restore',
        onConfirm: async () => {
            try {
                const incident = await sb.from('incident_reports').select('type').eq(field, id).single();
                if (incident.error) throw incident.error;
                if (!incident.data) return showPopup('Incident not found.', true);
                const restoredType = (incident.data.type || '').replace(/^\[ARCHIVED\]\s*/i, '');
                await sb.from('incident_reports').update({ type: restoredType }).eq(field, id);
                await logAdminActivity('Incident Restored', `Restored incident ${id}`);
                loadDashboardData();
                showPopup('Incident restored.');
            } catch (err) {
                console.error('Restore incident failed', err);
                showPopup('Error restoring incident.', true);
            }
        }
    });
}

// Dev 
let lockedAdminRfid = "";
window.verifyNewAdminRFID = () => {
    const input = document.getElementById('admin_reg_scan_input').value.trim(); if (!input) return showPopup('Scan first.');
    lockedAdminRfid = input; document.getElementById('locked_admin_rfid_display').textContent = input; document.getElementById('admin-reg-step-1').classList.add('hidden'); document.getElementById('admin-reg-step-2').classList.remove('hidden');
}
window.resetAdminRegistration = () => { lockedAdminRfid = ""; document.getElementById('admin_reg_scan_input').value = ""; document.getElementById('addAdminForm').reset(); document.getElementById('admin-reg-step-2').classList.add('hidden'); document.getElementById('admin-reg-step-1').classList.remove('hidden'); }

// Add Student Modal
let lockedStudentRfidForAdd = "";
window.verifyNewStudentRFID = () => {
    const input = document.getElementById('student_add_scan_input').value.trim();
    if (!input) return showPopup('Please scan an RFID card first.', true);
    if (allStudentsData.find(s => s.student_number === input)) return showPopup('Student RFID already registered.', true);
    lockedStudentRfidForAdd = input;
    document.getElementById('locked_student_rfid_display').textContent = lockedStudentRfidForAdd;
    document.getElementById('student-add-step-1').classList.add('hidden');
    document.getElementById('student-add-step-2').classList.remove('hidden');
}
window.resetStudentAddition = () => {
    lockedStudentRfidForAdd = "";
    document.getElementById('student_add_scan_input').value = "";
    document.getElementById('addStudentForm').reset();
    document.getElementById('student-add-step-2').classList.add('hidden');
    document.getElementById('student-add-step-1').classList.remove('hidden');
}
window.closeAddStudentModal = () => {
    document.getElementById('add-student-modal').classList.add('hidden');
    resetStudentAddition();
}

document.getElementById('student_add_scan_input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        verifyNewStudentRFID();
    }
});
document.getElementById('addStudentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { role: 'student', full_name: document.getElementById('sa_name').value, student_number: lockedStudentRfidForAdd, username: lockedStudentRfidForAdd, password: lockedStudentRfidForAdd, section: document.getElementById('sa_section').value, phone: document.getElementById('sa_phone').value, email: document.getElementById('sa_email').value };
    try {
        const { error } = await sb.from('accounts').insert([payload]);
        if (error) throw error;
        showPopup('Student Added Successfully.');
        await addNotification('Student Added', `${document.getElementById('sa_name').value} has been added to the registry.`, 'student');
        await loadNotificationsFromDB();
        closeAddStudentModal();
        await loadDashboardData();
    } catch (err) {
        console.error('Error adding student:', err);
        showPopup('Error adding student: ' + (err.message || 'Duplicate ID or database error'), true);
    }
});


document.getElementById('admin_reg_scan_input')?.addEventListener('input', () => {
    clearTimeout(adminRegTimeout);
    adminRegTimeout = setTimeout(() => {
        const code = document.getElementById('admin_reg_scan_input').value.trim();
        if (code) verifyNewAdminRFID();
    }, 500);
});
document.getElementById('admin_reg_scan_input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(adminRegTimeout);
        verifyNewAdminRFID();
    }
});
window.closeAddAdminModal = () => { document.getElementById('add-admin-modal').classList.add('hidden'); resetAdminRegistration(); }
document.getElementById('addAdminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { role: 'admin', student_number: lockedAdminRfid, username: lockedAdminRfid, password: lockedAdminRfid, full_name: document.getElementById('na_name').value, section: document.getElementById('na_sector').value, email: document.getElementById('na_email').value, phone: document.getElementById('na_phone').value };
    try {
        const { error } = await sb.from('accounts').insert([payload]);
        if (error) throw error;
        showPopup('Admin Provisioned.');
        await addNotification('Admin Added', `${payload.full_name || payload.username} was added as admin.`, 'admin');
        await loadNotificationsFromDB();
        closeAddAdminModal();
        await loadDevData();
        await loadDashboardData();
    } catch (err) { showPopup('Error creating admin: ' + (err.message || 'Unknown database error'), true); }
});
window.deleteAdmin = async (username) => {
    openConfirmModal({
        title: 'Revoke Admin',
        message: `Revoke ${username}? This will remove their administrative access.`,
        confirmText: 'Revoke',
        onConfirm: async () => {
            try { await sb.from('accounts').delete().eq('username', username); loadDevData(); showPopup('Admin Revoked.'); } catch (err) { showPopup('Error.', true); }
        }
    });
}

// Explicit update command instead of upsert to avoid RLS block issues if ID exists
window.toggleMaintenanceMode = async () => { 
    isMaintenanceMode = !isMaintenanceMode; 
    const btn = document.getElementById('maintenance-toggle-btn');
    if (btn) btn.textContent = isMaintenanceMode ? 'Deactivate' : 'Activate';
    try { 
        await sb.from('system_settings').update({ maintenance_active: isMaintenanceMode }).eq('id', 1); 
        await logAdminActivity('Maintenance Toggled', `Maintenance mode turned ${isMaintenanceMode ? 'ON' : 'OFF'}`);
        showPopup(`Maintenance Mode ${isMaintenanceMode ? 'ON' : 'OFF'}`); 
        loadDevData(); 
    } catch (err) { showPopup('Error toggling maintenance.', true); } 
}
window.saveMaintenanceMessage = async () => {
    try {
        const messageInput = document.getElementById('dev_maintenance_msg');
        const message = messageInput?.value.trim() || '';
        await sb.from('system_settings').update({ maintenance_message: message }).eq('id', 1);
        if (messageInput) messageInput.value = '';
        await logAdminActivity('Maintenance Message Updated', `Updated maintenance message: ${message || '(cleared)'}`);
        showPopup('Message Saved.');
    } catch (err) { showPopup('Error saving message.', true); }
}

async function loadDevData() {
    const { data: admins } = await sb.from('accounts').select('*').in('role', ['admin', 'dev', 'superadmin']);
    if (admins && document.getElementById('dev-admins-table')) { document.getElementById('dev-admins-table').innerHTML = admins.map(a => `<tr class="hover:bg-slate-50 border-b border-gray-100 transition-colors"><td class="px-8 py-6 font-mono font-bold text-gray-500">${escapeHtml(a.student_number)}</td><td class="px-8 py-6 font-bold text-gray-900">${escapeHtml(a.username)}</td><td class="px-8 py-6"><span class="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold rounded-lg uppercase tracking-widest">${escapeHtml(a.role)}</span></td><td class="px-8 py-6 text-right">${(a.role !== 'dev') ? `<button class="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors uppercase tracking-widest" onclick="deleteAdmin('${a.username}')">Revoke</button>` : '<span class="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Root Protected</span>'}</td></tr>`).join(''); }
    const activityTable = document.getElementById('dev-activity-table');
    const { data: logs, error: logsError } = await sb.from('activity_logs').select('*').order('timestamp', { ascending: false }).limit(50);
    if (activityTable) {
        if (logsError) {
            activityTable.innerHTML = `<tr><td colspan="4" class="px-8 py-12 text-center text-red-500 font-medium">Unable to load activity logs. Check activity_logs table permissions.</td></tr>`;
        } else if (!logs || logs.length === 0) {
            activityTable.innerHTML = `<tr><td colspan="4" class="px-8 py-12 text-center text-gray-500 font-medium">No activity logs yet.</td></tr>`;
        } else {
            activityTable.innerHTML = logs.map(l => `<tr class="hover:bg-slate-50 border-b border-gray-100 transition-colors"><td class="px-8 py-6 text-xs font-medium text-gray-500">${new Date(l.timestamp).toLocaleString()}</td><td class="px-8 py-6 font-bold text-gray-900">${escapeHtml(l.admin_user)}</td><td class="px-8 py-6 font-extrabold text-emerald-600 text-sm break-words whitespace-normal">${escapeHtml(l.action_type)}</td><td class="px-8 py-6 text-sm font-medium break-words whitespace-normal">${escapeHtml(l.details)}</td></tr>`).join('');
        }
    }
    const btn = document.getElementById('maintenance-toggle-btn');
    if(btn) { btn.textContent = isMaintenanceMode ? 'Deactivate Maintenance' : 'Activate Maintenance'; btn.className = isMaintenanceMode ? 'bg-emerald-500 hover:bg-emerald-600 transition-colors text-white px-6 py-3 rounded-xl font-bold shadow-md' : 'bg-red-500 hover:bg-red-600 transition-colors text-white px-6 py-3 rounded-xl font-bold shadow-md'; }
    const statusEl = document.getElementById('settings-maint-status');
    if(statusEl) { statusEl.textContent = isMaintenanceMode ? 'ACTIVE \u2014 Standard admins are locked out' : 'Inactive \u2014 System is online'; statusEl.className = isMaintenanceMode ? 'text-sm font-bold text-red-600' : 'text-sm font-bold text-emerald-600'; }
    // Load service update into settings fields
    try {
        const { data: settings } = await sb.from('system_settings').select('*').eq('id', 1).single();
        if (settings) {
            if(document.getElementById('dev_maintenance_msg')) document.getElementById('dev_maintenance_msg').value = settings.maintenance_message || '';
            const cache = getServiceUpdateCache();
            const dbTitle = settings.service_update_title ? String(settings.service_update_title).trim() : '';
            const dbDesc = settings.service_update_desc ? String(settings.service_update_desc).trim() : '';
            const effectiveTitle = dbTitle || cache?.title || '';
            const effectiveDesc = dbDesc || cache?.desc || '';
            if(document.getElementById('service_update_title')) document.getElementById('service_update_title').value = '';
            if(document.getElementById('service_update_desc')) document.getElementById('service_update_desc').value = '';
            const svcTitle = document.getElementById('dash-service-title');
            const svcDesc = document.getElementById('dash-service-desc');
            if (svcTitle && svcDesc) {
                if (effectiveTitle || effectiveDesc) {
                    svcTitle.textContent = effectiveTitle || 'Service Update';
                    svcDesc.textContent = effectiveDesc || '(No description provided)';
                } else {
                    svcTitle.textContent = 'No Updates';
                    svcDesc.textContent = 'No updates posted yet.';
                }
            }
        }
    } catch(e) {
        const cache = getServiceUpdateCache();
        if(document.getElementById('service_update_title')) document.getElementById('service_update_title').value = '';
        if(document.getElementById('service_update_desc')) document.getElementById('service_update_desc').value = '';
        const svcTitle = document.getElementById('dash-service-title');
        const svcDesc = document.getElementById('dash-service-desc');
        if (svcTitle && svcDesc) {
            if (cache?.title || cache?.desc) {
                svcTitle.textContent = cache.title || 'Service Update';
                svcDesc.textContent = cache.desc || '(No description provided)';
            } else {
                svcTitle.textContent = 'No Updates';
                svcDesc.textContent = 'No updates posted yet.';
            }
        }
    }
}

// ================= NOTIFICATIONS =================
let allNotifications = [];
let currentViewingNotifId = null;
const LEGACY_NOTIFICATION_KEY = 'scitrack_notifications';

function getNotificationStorageKey() {
    if (currentUser?.username) return `scitrack_notifications_${currentUser.username}`;
    return LEGACY_NOTIFICATION_KEY;
}

function getNotificationDescription(notif) {
    if (!notif || typeof notif !== 'object') return '';
    return String(notif.description ?? notif.desc ?? notif.message ?? '').trim();
}

function getNotificationReaderKey() {
    if (!currentUser?.username) return '';
    return `${currentUser.role || 'admin'}:${currentUser.username}`;
}

function getNotificationContentParts(notif) {
    const title = String(notif?.title || 'Notification').trim() || 'Notification';
    const desc = getNotificationDescription(notif);
    if ((notif?.type || '').toLowerCase() === 'update') {
        const lines = desc.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return {
            title,
            subTitle: lines[0] || '',
            detail: lines.slice(1).join(' ') || ''
        };
    }
    return { title, subTitle: '', detail: desc };
}

const SERVICE_UPDATE_CACHE_KEY = 'scitrack_service_update_cache';

function saveServiceUpdateCache(title, desc, time = null) {
    const payload = {
        title: String(title || '').trim(),
        desc: String(desc || '').trim(),
        time: time || new Date().toISOString()
    };
    localStorage.setItem(SERVICE_UPDATE_CACHE_KEY, JSON.stringify(payload));
    return payload;
}

function getServiceUpdateCache() {
    try {
        const raw = localStorage.getItem(SERVICE_UPDATE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            title: String(parsed.title || '').trim(),
            desc: String(parsed.desc || '').trim(),
            time: parsed.time || null
        };
    } catch (_) {
        return null;
    }
}

function saveNotificationsToStorage() {
    const toSave = allNotifications.map(n => ({ ...n, timestamp: n.timestamp.toISOString() }));
    localStorage.setItem(getNotificationStorageKey(), JSON.stringify(toSave));
    console.log('Notifications saved:', toSave.length, 'items');
}

function loadNotificationsFromStorage() {
    if (!currentUser?.username) {
        allNotifications = [];
        setTimeout(() => updateNotificationDisplay(), 100);
        return;
    }
    try {
        const scopedKey = getNotificationStorageKey();
        const saved = localStorage.getItem(scopedKey);
        const legacySaved = localStorage.getItem(LEGACY_NOTIFICATION_KEY);
        const source = saved || legacySaved;
        if (!source) {
            allNotifications = [];
            setTimeout(() => updateNotificationDisplay(), 100);
            return;
        }
        const parsed = JSON.parse(source);
        allNotifications = parsed.map(n => ({
            ...n,
            description: getNotificationDescription(n),
            timestamp: new Date(n.timestamp)
        }));
        // Ensure DOM is ready before updating display
        setTimeout(() => updateNotificationDisplay(), 100);
    } catch (e) {
        console.warn('Error loading notifications from storage:', e);
        localStorage.removeItem(getNotificationStorageKey());
        allNotifications = [];
        setTimeout(() => updateNotificationDisplay(), 100);
    }
}

function canUserSeeNotification(n) {
    if (!currentUser?.username || !n) return false;
    const roleMatch = !n.target_role || n.target_role === currentUser.role;
    const userMatch = !n.target_username || n.target_username === currentUser.username;
    return roleMatch && userMatch;
}

async function loadNotificationsFromDB() {
    if (!currentUser?.username) {
        allNotifications = [];
        updateNotificationDisplay();
        return;
    }
    try {
        const { data: notifRows, error: notifErr } = await sb
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        if (notifErr) throw notifErr;
        const visibleRows = (notifRows || []).filter(canUserSeeNotification);

        const readerKey = getNotificationReaderKey();
        const { data: readRows, error: readErr } = await sb
            .from('notification_reads')
            .select('notification_id')
            .eq('username', readerKey);
        if (readErr) throw readErr;
        const readSet = new Set((readRows || []).map(r => r.notification_id));

        allNotifications = visibleRows.map(n => ({
            id: n.id,
            title: n.title || 'Notification',
            description: getNotificationDescription(n),
            type: n.type || 'update',
            timestamp: new Date(n.created_at || Date.now()),
            read: readSet.has(n.id)
        }));
        saveNotificationsToStorage();
        updateNotificationDisplay();
    } catch (err) {
        console.warn('DB notifications load failed, using local cache:', err);
        loadNotificationsFromStorage();
    }
}

window.toggleNotificationPanel = () => {
    const panel = document.getElementById('notification-panel');
    panel.classList.toggle('hidden');
};

window.addNotification = async (title, description = '', type = 'update', options = {}) => {
    const safeTitle = String(title || '').trim() || 'Notification';
    const safeDescription = String(description || '').trim();
    const targetRole = options.target_role || options.targetRole || null;
    const targetUsername = options.target_username || options.targetUsername || null;
    try {
        let data = null;
        let error = null;
        const fullPayload = {
            title: safeTitle,
            description: safeDescription,
            type,
            created_by: currentUser?.username || null,
            target_role: targetRole,
            target_username: targetUsername
        };
        const fullInsert = await sb.from('notifications').insert([fullPayload]).select('*').single();
        data = fullInsert.data;
        error = fullInsert.error;
        if (error) {
            // Fallback for older/minimal notifications table schema.
            const basicInsert = await sb.from('notifications').insert([{
                title: safeTitle,
                description: safeDescription,
                type
            }]).select('*').single();
            data = basicInsert.data;
            error = basicInsert.error;
        }
        if (error) throw error;
        const notif = {
            id: data.id,
            title: String(data.title || safeTitle).trim() || 'Notification',
            description: getNotificationDescription(data),
            type: data.type || type,
            timestamp: new Date(data.created_at || Date.now()),
            read: false
        };
        if (canUserSeeNotification(data)) {
            allNotifications.unshift(notif);
            saveNotificationsToStorage();
            updateNotificationDisplay();
        }
    } catch (err) {
        // Fallback to local if DB insert fails
        const notif = { title: safeTitle, description: safeDescription, type, timestamp: new Date(), id: Date.now(), read: false };
        allNotifications.unshift(notif);
        saveNotificationsToStorage();
        updateNotificationDisplay();
        console.warn('Notification insert failed, using local fallback:', err);
        showPopup('Notification saved locally only. Check Supabase notifications table/policies.', true);
    }
    showPopup(`${safeTitle}${safeDescription ? ' — ' + safeDescription : ''}`);
};

window.updateNotificationDisplay = () => {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notif-badge');
    const unreadCount = allNotifications.filter(n => !n.read).length;
    
    if (allNotifications.length === 0) {
        list.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No notifications</div>';
        badge.classList.add('hidden');
        return;
    }
    
    if (unreadCount === 0) {
        badge.classList.add('hidden');
    } else {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
    }
    
    list.innerHTML = allNotifications.map(n => {
        const parts = getNotificationContentParts(n);
        return `
        <div class="p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 cursor-pointer ${n.read ? 'opacity-60' : ''}" onclick="openNotificationModal('${n.id}')">
            <div class="flex justify-between items-start gap-2 mb-2">
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-gray-900 text-sm ${n.read ? 'text-gray-500' : ''} break-words">${escapeHtml(parts.title)}</h4>
                    ${parts.subTitle ? `<p class="text-xs font-semibold text-gray-700 mt-1 break-words">${escapeHtml(parts.subTitle)}</p>` : ''}
                    ${parts.detail ? `<p class="text-xs text-gray-600 mt-1 break-words" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(parts.detail)}</p>` : ''}
                </div>
                <span class="text-[10px] text-gray-400 whitespace-nowrap">${n.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            ${!n.read ? '<span class="inline-block w-2 h-2 bg-primary rounded-full"></span>' : ''}
        </div>
    `;
    }).join('');
};

window.openNotificationModal = (notifId) => {
    const id = parseInt(notifId, 10) || notifId;
    const notif = allNotifications.find(n => n.id === id);
    if (!notif) return;
    
    currentViewingNotifId = id;
    const parts = getNotificationContentParts(notif);
    document.getElementById('modal-notif-title').textContent = parts.title;
    if (parts.subTitle && parts.detail) {
        document.getElementById('modal-notif-desc').textContent = `${parts.subTitle}\n\n${parts.detail}`;
    } else {
        document.getElementById('modal-notif-desc').textContent = parts.subTitle || parts.detail || '(No description provided)';
    }
    
    const markBtn = document.getElementById('modal-mark-read-btn');
    if (notif.read) {
        markBtn.textContent = 'Already marked as read';
        markBtn.disabled = true;
        markBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        markBtn.textContent = 'Mark as Read';
        markBtn.disabled = false;
        markBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    document.getElementById('notification-modal').classList.remove('hidden');
};

window.closeNotificationModal = () => {
    document.getElementById('notification-modal').classList.add('hidden');
    currentViewingNotifId = null;
};

window.markCurrentNotifAsRead = () => {
    if (currentViewingNotifId === null) return;
    markAsRead(currentViewingNotifId);
    closeNotificationModal();
};

window.markAsRead = (notifId) => {
    const notif = allNotifications.find(n => n.id === notifId);
    if (notif) notif.read = true;
    saveNotificationsToStorage();
    updateNotificationDisplay();
    if (currentUser?.username) {
        const readerKey = getNotificationReaderKey();
        sb.from('notification_reads')
            .upsert([{ notification_id: notifId, username: readerKey, read_at: new Date().toISOString() }], { onConflict: 'notification_id,username' })
            .then(({ error }) => { if (error) console.warn('Failed to sync read status:', error); });
    }
};

window.markAllAsRead = async () => {
    allNotifications.forEach(n => n.read = true);
    saveNotificationsToStorage();
    updateNotificationDisplay();
    if (!currentUser?.username || allNotifications.length === 0) return;
    const readerKey = getNotificationReaderKey();
    const rows = allNotifications.map(n => ({
        notification_id: n.id,
        username: readerKey,
        read_at: new Date().toISOString()
    }));
    const { error } = await sb.from('notification_reads').upsert(rows, { onConflict: 'notification_id,username' });
    if (error) console.warn('Failed to sync mark-all-read:', error);
};

// ================= SERVICE UPDATES =================
window.saveServiceUpdate = async () => {
    const title = document.getElementById('service_update_title')?.value.trim();
    const desc = document.getElementById('service_update_desc')?.value.trim();
    if (!title) return showPopup('Please enter an update title.', true);
    saveServiceUpdateCache(title, desc);
    try {
        const payload = {
            service_update_title: title,
            service_update_desc: desc,
            service_update_time: new Date().toISOString()
        };
        const updateRes = await sb.from('system_settings').update(payload).eq('id', 1).select('id');
        if (updateRes.error) throw updateRes.error;
        if (!updateRes.data || updateRes.data.length === 0) {
            const insertRes = await sb.from('system_settings').insert([{ id: 1, ...payload }]);
            if (insertRes.error) throw insertRes.error;
        }
        
        // Update the dashboard immediately
        const svcTitle = document.getElementById('dash-service-title');
        const svcDesc = document.getElementById('dash-service-desc');
        if (svcTitle) svcTitle.textContent = title;
        if (svcDesc) svcDesc.textContent = desc && desc.trim() ? desc : '(No description provided)';
        
        // Clear the form
        const titleInput = document.getElementById('service_update_title');
        const descInput = document.getElementById('service_update_desc');
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        
        // Add notification
        await addNotification('Service Update Published', `${title}\n${desc || '(No description provided)'}`, 'update');
        await logAdminActivity('Service Update Published', `${title} - ${desc || '(No description provided)'}`);
        
        // Refresh dashboard data
        await loadDashboardData();
    } catch (err) {
        // Keep the update usable in-app even if DB schema is not ready yet.
        const svcTitle = document.getElementById('dash-service-title');
        const svcDesc = document.getElementById('dash-service-desc');
        if (svcTitle) svcTitle.textContent = title;
        if (svcDesc) svcDesc.textContent = desc && desc.trim() ? desc : '(No description provided)';
        const titleInput = document.getElementById('service_update_title');
        const descInput = document.getElementById('service_update_desc');
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        await addNotification('Service Update Published', `${title}\n${desc || '(No description provided)'}`, 'update');
        await logAdminActivity('Service Update Published', `${title} - ${desc || '(No description provided)'}`);
        showPopup('Update saved locally. Database columns for service updates are missing or restricted.', true);
        await loadDashboardData();
    }
}

// ================= USAGE INSIGHTS =================
function updateUsageInsights() {
    const container = document.getElementById('usage-insights-content');
    const totalEl = document.getElementById('usage-insights-total');
    if (!container) return;

    // Count how many times each equipment was borrowed
    const borrowCounts = {};
    allTransactionData.forEach(t => {
        if (t.action_type === 'borrow') {
            borrowCounts[t.equipment_name] = (borrowCounts[t.equipment_name] || 0) + 1;
        }
    });

    const sorted = Object.entries(borrowCounts).sort((a, b) => b[1] - a[1]);
    const totalBorrows = sorted.reduce((sum, [, count]) => sum + count, 0);

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-sm opacity-80">No borrowing data yet.</p>';
        return;
    }

    // Show top 3 most borrowed items with progress bars
    const top = sorted.slice(0, 3);
    const maxCount = top[0][1];

    container.innerHTML = top.map(([name, count], i) => {
        const pct = Math.round((count / maxCount) * 100);
        const medal = i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : '\uD83E\uDD49';
        return `<div>
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-bold truncate flex-1">${medal} ${escapeHtml(name)}</span>
                <span class="text-xs opacity-70 ml-2">${count}x</span>
            </div>
            <div class="w-full bg-white/20 rounded-full h-1.5">
                <div class="bg-white/80 h-1.5 rounded-full transition-all" style="width: ${pct}%"></div>
            </div>
        </div>`;
    }).join('');

    if (totalEl) totalEl.textContent = `${totalBorrows} total borrows across ${sorted.length} items`;
}