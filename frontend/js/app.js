// GLOBAL STATE
window.STATE = {
  currentUser: null,
  token: null,
  posts: [],
  currentPage: 'home',
  currentConversation: null,
  deleteCallback: null
};

// Default avatar
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23667eea%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23764ba2%22%2F%3E%0A%3C%2FlinearGradient%3E%3C%2Fdefs%3E%0A%3Ccircle%20cx%3D%2264%22%20cy%3D%2264%22%20r%3D%2264%22%20fill%3D%22url%28%23g%29%22%2F%3E%0A%3Ccircle%20cx%3D%2264%22%20cy%3D%2252%22%20r%3D%2220%22%20fill%3D%22%23fff%22%20opacity%3D%220.95%22%2F%3E%0A%3Cpath%20d%3D%22M34%20112c5-19%2021-30%2030-30s25%2011%2030%2030%22%20fill%3D%22%23fff%22%20opacity%3D%220.95%22%2F%3E%0A%3C%2Fsvg%3E';

// INIT
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  
  if (token) {
    try {
      const { user } = await API.verifySession(token);
      STATE.currentUser = user;
      STATE.token = token;
      showApp();
      
      // Load route from hash
      const hash = window.location.hash.slice(2); // Remove #/
      const parts = hash.split('/').filter(Boolean);
      if (parts.length > 0) {
        loadPage(parts[0], parts[1]);
      } else {
        navigateTo('home');
      }
    } catch (error) {
      localStorage.removeItem('token');
      showLogin();
    }
  } else {
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
