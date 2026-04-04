// GLOBAL STATE
window.STATE = {
  currentUser: null,
  token: localStorage.getItem('school_session_token'),
  pending2FAToken: null,
  preferences: { theme: 'light', accentColor: 'blue', twoFactorEnabled: false },
  posts: [],
  currentPage: 'home',
  currentConversation: null,
  deleteCallback: null
};

// Default avatar
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23667eea%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23764ba2%22%2F%3E%0A%3C%2FlinearGradient%3E%3C%2Fdefs%3E%0A%3Ccircle%20cx%3D%2264%22%20cy%3D%2264%22%20r%3D%2264%22%20fill%3D%22url%28%23g%29%22%2F%3E%0A%3Ccircle%20cx%3D%2264%22%20cy%3D%2252%22%20r%3D%2220%22%20fill%3D%22%23fff%22%20opacity%3D%220.95%22%2F%3E%0A%3Cpath%20d%3D%22M34%20112c5-19%2021-30%2030-30s25%2011%2030%2030%22%20fill%3D%22%23fff%22%20opacity%3D%220.95%22%2F%3E%0A%3C%2Fsvg%3E';

// INIT
document.addEventListener('DOMContentLoaded', async () => {
  applyPreferencesFromStorage();
  try {
    const { user } = await API.verifySession();
    STATE.currentUser = user;
    showApp();
    const hash = window.location.hash.slice(2);
    const parts = hash.split('/').filter(Boolean);
    if (parts.length > 0) loadPage(parts[0], parts[1]);
    else navigateTo('home');
  } catch (error) {
    STATE.token = null;
    localStorage.removeItem('school_session_token');
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  
  // Set user avatar
  const avatarUrl = STATE.currentUser.profile_picture || DEFAULT_AVATAR;
  document.getElementById('user-avatar').src = avatarUrl;
  document.getElementById('composer-avatar').src = avatarUrl;
  document.getElementById('user-avatar').onerror = function() { this.src = DEFAULT_AVATAR; };
  document.getElementById('composer-avatar').onerror = function() { this.src = DEFAULT_AVATAR; };
  
  // Set user info
  document.getElementById('user-name').textContent = STATE.currentUser.full_name;
  
  let roleText = getRoleLabel(STATE.currentUser.role);
  if (STATE.currentUser.class_grade) {
    roleText += ` ${STATE.currentUser.class_grade}${STATE.currentUser.class_letter}`;
  }
  document.getElementById('user-role').textContent = roleText;
  
  // Hide composer for parents
  if (STATE.currentUser.role === 'parent') {
    document.getElementById('post-composer').style.display = 'none';
  }
  
  // Show admin nav for admins
  if (STATE.currentUser.role === 'admin') {
    document.getElementById('admin-nav').style.display = 'flex';
  }
  
  // Show event button for teachers and admins
  const addEventBtn = document.getElementById('add-event-btn');
  if (addEventBtn) {
    if (STATE.currentUser.role === 'teacher' || STATE.currentUser.role === 'admin') {
      addEventBtn.style.display = 'inline-block';
    } else if (STATE.currentUser.role === 'student' || STATE.currentUser.role === 'parent') {
      addEventBtn.style.display = 'none';
    }
  }
  
  // Hide club create for parents
  if (STATE.currentUser.role === 'parent') {
    const addClubBtn = document.getElementById('add-club-btn');
    if (addClubBtn) addClubBtn.style.display = 'none';
  }
  
  loadUserPreferences();

  // Load widgets
  loadCalendarWidget();
  loadClubsWidget();

  // Default feed filter to show everything the user can see.
  STATE.feedFilter = 'class';
  const feedSel = document.getElementById('post-visibility');
  if (feedSel) feedSel.value = 'class';
  
  // Start notification polling
  startNotificationPolling();
}

// Utilities
function getAvatarUrl(user) {
  return user.profile_picture || DEFAULT_AVATAR;
}

function getRoleLabel(role) {
  const labels = {
    'admin': 'Администратор',
    'moderator': 'Модератор',
    'teacher': 'Учител',
    'student': 'Ученик',
    'parent': 'Родител'
  };
  return labels[role] || role;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'преди секунди';
  if (diff < 3600) return `преди ${Math.floor(diff / 60)}м`;
  if (diff < 86400) return `преди ${Math.floor(diff / 3600)}ч`;
  if (diff < 604800) return `преди ${Math.floor(diff / 86400)}д`;
  return date.toLocaleDateString('bg-BG');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Modals
function showModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Notifications
function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.classList.remove('hidden');
  if (isError) {
    notification.classList.add('error');
  } else {
    notification.classList.remove('error');
  }
  
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

function showError(message) {
  showNotification(message, true);
}

// Delete confirmation
function confirmDeleteAction(message, callback) {
  document.getElementById('delete-message').textContent = message;
  STATE.deleteCallback = callback;
  showModal('delete-modal');
}

function confirmDelete() {
  if (STATE.deleteCallback) {
    STATE.deleteCallback();
    STATE.deleteCallback = null;
  }
  closeModal('delete-modal');
}

// Club icons
function getClubIcon(clubName) {
  const icons = {
    'Робототехника': '🤖',
    'Драматичен театър': '🎭',
    'Футболен отбор': '⚽',
    'Литературен клуб': '📚',
    'Музикална група': '🎵',
    'Изобразително изкуство': '🎨',
    'Шахматен клуб': '♟️',
    'Волейболен отбор': '🏐',
    'Баскетболен отбор': '🏀',
    'Фотография': '📷',
    'Дебатен клуб': '🗣️',
    'Еко клуб': '🌱'
  };
  return icons[clubName] || '🎯';
}


function normalizeAccent(accentColor) {
  if (accentColor === 'red') return 'rose';
  return accentColor || 'blue';
}

function applyPreferences(theme, accentColor) {
  document.body.dataset.theme = theme || 'light';
  document.body.dataset.accent = normalizeAccent(accentColor);
}

function applyPreferencesFromStorage() {
  const theme = localStorage.getItem('school_theme') || 'light';
  const accentColor = normalizeAccent(localStorage.getItem('school_accent') || 'blue');
  STATE.preferences.theme = theme;
  STATE.preferences.accentColor = accentColor;
  applyPreferences(theme, accentColor);
}

async function loadUserPreferences() {
  applyPreferencesFromStorage();
  try {
    const prefs = await API.getPreferences();
    STATE.preferences.theme = prefs.theme || 'light';
    STATE.preferences.accentColor = normalizeAccent(prefs.accent_color || 'blue');
    STATE.preferences.twoFactorEnabled = !!prefs.two_factor_enabled;
    localStorage.setItem('school_theme', STATE.preferences.theme);
    localStorage.setItem('school_accent', normalizeAccent(STATE.preferences.accentColor));
    applyPreferences(STATE.preferences.theme, STATE.preferences.accentColor);
    syncSettingsUI();
  } catch (error) {
    console.error('Preferences error:', error);
  }
}

function syncSettingsUI() {
  const themeSelect = document.getElementById('theme-select');
  const accentButtons = document.querySelectorAll('.accent-swatch');
  if (themeSelect) themeSelect.value = STATE.preferences.theme || 'light';
  accentButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.accent === STATE.preferences.accentColor));
  const status = document.getElementById('twofa-status');
  if (status) status.textContent = STATE.preferences.twoFactorEnabled ? 'Включена' : 'Изключена';
}

function openSettingsModal() {
  syncSettingsUI();
  showModal('settings-modal');
}

async function handleThemeChange(value) {
  STATE.preferences.theme = value;
  localStorage.setItem('school_theme', value);
  applyPreferences(value, STATE.preferences.accentColor);
  try { await API.savePreferences(value, STATE.preferences.accentColor); } catch (error) { console.error(error); }
}

async function handleAccentChange(value) {
  STATE.preferences.accentColor = normalizeAccent(value);
  localStorage.setItem('school_accent', normalizeAccent(value));
  applyPreferences(STATE.preferences.theme, STATE.preferences.accentColor);
  syncSettingsUI();
  try { await API.savePreferences(STATE.preferences.theme, STATE.preferences.accentColor); } catch (error) { console.error(error); }
}

async function handleSetup2FA() {
  try {
    const setup = await API.setup2FA();
    document.getElementById('twofa-secret').textContent = setup.secret;
    document.getElementById('twofa-uri').value = setup.otpauth_url;
    document.getElementById('twofa-setup-box').classList.remove('hidden');
  } catch (error) {
    showError(error.message);
  }
}

async function handleVerify2FASetup() {
  try {
    const code = document.getElementById('twofa-verify-code').value.trim();
    await API.verify2FASetup(code);
    STATE.preferences.twoFactorEnabled = true;
    document.getElementById('twofa-setup-box').classList.add('hidden');
    document.getElementById('twofa-verify-code').value = '';
    syncSettingsUI();
    showNotification('2FA е включена');
  } catch (error) {
    showError(error.message);
  }
}

async function handleDisable2FA() {
  const password = prompt('Въведи паролата си, за да изключиш 2FA');
  if (!password) return;
  try {
    await API.disable2FA(password);
    STATE.preferences.twoFactorEnabled = false;
    syncSettingsUI();
    showNotification('2FA е изключена');
  } catch (error) {
    showError(error.message);
  }
}

async function refreshCurrentView(postId = null) {
  const hash = window.location.hash.slice(2);
  const parts = hash.split('/').filter(Boolean);
  const page = parts[0] || 'home';
  const param = parts[1];
  if (page === 'home') return loadFeed();
  if (page === 'post') return showPostDetail(postId || param);
  if (page === 'profile') return showUserProfile(param || STATE.currentUser.id);
  return Promise.resolve();
}
