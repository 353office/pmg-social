// NOTIFICATIONS SYSTEM

let notifInterval;

async function loadNotifications() {
  if (!STATE.currentUser) return;
  
  try {
    const notifications = await API.getNotifications(STATE.currentUser.id);
    const listEl = document.getElementById('notif-list');
    
    if (notifications.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding: 40px 20px;">Няма известия</div>';
      return;
    }
    
    listEl.innerHTML = notifications.map(n => {
      const avatarUrl = n.actor_picture || DEFAULT_AVATAR;
      let message = '';
      if (n.type === 'like') message = 'хареса публикацията ти';
      else if (n.type === 'comment') message = 'коментира публикацията ти';
      else if (n.type === 'mention') message = 'те спомена';
      
      return `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.post_id || ''}')">
          <img src="${avatarUrl}" class="notif-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
          <div class="notif-content">
            <div><strong>${escapeHtml(n.actor_name)}</strong> ${message}</div>
            ${n.post_content ? `<div class="notif-preview">${escapeHtml(n.post_content.slice(0, 50))}...</div>` : ''}
            <div class="notif-time">${formatTime(n.created_at)}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load notifications error:', error);
  }
}

async function updateNotificationCount() {
  if (!STATE.currentUser) return;
  
  try {
    const { count } = await API.getUnreadCount(STATE.currentUser.id);
    const badge = document.getElementById('notif-badge');
    
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Update count error:', error);
  }
}

function toggleNotifications() {
  const dropdown = document.getElementById('notifications-dropdown');
  const isHidden = dropdown.classList.contains('hidden');
  
  // Close if open
  if (!isHidden) {
    dropdown.classList.add('hidden');
    return;
  }
  
  // Open and load
  dropdown.classList.remove('hidden');
  loadNotifications();
}

async function handleNotificationClick(notifId, postId) {
  try {
    await API.markNotificationRead(notifId);
    document.getElementById('notifications-dropdown').classList.add('hidden');
    
    if (postId) {
      navigateTo('post', postId);
    }
    
    updateNotificationCount();
    loadNotifications();
  } catch (error) {
    console.error('Notification click error:', error);
  }
}

async function markAllRead() {
  try {
    await API.markAllNotificationsRead(STATE.currentUser.id);
    loadNotifications();
    updateNotificationCount();
  } catch (error) {
    console.error('Mark all read error:', error);
  }
}

function startNotificationPolling() {
  updateNotificationCount();
  notifInterval = setInterval(updateNotificationCount, 30000); // Poll every 30s
}

function stopNotificationPolling() {
  if (notifInterval) {
    clearInterval(notifInterval);
    notifInterval = null;
  }
}

// Close notifications when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notifications-dropdown');
  const notifNav = document.querySelector('[onclick="toggleNotifications()"]');
  
  if (dropdown && !dropdown.contains(e.target) && !notifNav?.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});
