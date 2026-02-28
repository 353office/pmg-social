// ADMIN PANEL

async function loadAdminPanel() {
  if (!STATE.currentUser || STATE.currentUser.role !== 'admin') {
    showError('Admin access required');
    showPage('feed');
    return;
  }
  
  const contentEl = document.getElementById('admin-content');
  contentEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const users = await API.getAllUsers(STATE.currentUser.id);
    
    // Calculate stats
    const stats = {
      total: users.length,
      students: users.filter(u => u.role === 'student').length,
      teachers: users.filter(u => u.role === 'teacher').length,
      parents: users.filter(u => u.role === 'parent').length
    };
    
    contentEl.innerHTML = `
      <div class="admin-stats">
        <div class="stat-card">
          <div class="stat-number">${stats.total}</div>
          <div class="stat-label">Общо потребители</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.students}</div>
          <div class="stat-label">Ученици</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.teachers}</div>
          <div class="stat-label">Учители</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.parents}</div>
          <div class="stat-label">Родители</div>
        </div>
      </div>
      
      <div class="users-table">
        <div class="table-header">Всички потребители</div>
        <div class="users-list">
          ${users.map(user => renderUserRow(user)).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Admin panel error:', error);
    contentEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

function renderUserRow(user) {
  const roleLabel = getRoleLabel(user.role);
  const canDelete = user.id !== STATE.currentUser.id; // Can't delete yourself
  const avatarUrl = user.profile_picture || DEFAULT_AVATAR;
  
  return `
    <div class="user-row">
      <div class="user-info">
        <img src="${avatarUrl}" class="user-table-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="user-details">
          <div class="user-name-table">${escapeHtml(user.full_name)}</div>
          <div class="user-username">@${escapeHtml(user.username)}</div>
        </div>
      </div>
      <div class="user-email">${escapeHtml(user.email || 'Няма email')}</div>
      <div>
        <span class="user-role-badge badge-${user.role}">${roleLabel}</span>
      </div>
      <div class="user-class">
        ${user.class_grade ? `${user.class_grade}${user.class_letter} клас` : '-'}
      </div>
      <div>
        ${canDelete ? 
          `<button class="btn-icon" onclick="handleDeleteUser('${user.id}', '${escapeHtml(user.full_name)}')" title="Изтрий">🗑️</button>` :
          '<span style="color: #536471; font-size: 12px;">Вие</span>'
        }
      </div>
    </div>
  `;
}

function showCreateUserModal() {
  document.getElementById('create-user-form').reset();
  document.getElementById('class-fields').style.display = 'none';
  showModal('create-user-modal');
}

function handleRoleChange(event) {
  const role = event.target.value;
  const classFields = document.getElementById('class-fields');
  
  if (role === 'student' || role === 'teacher') {
    classFields.style.display = 'block';
  } else {
    classFields.style.display = 'none';
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  
  const formData = new FormData(event.target);
  const userData = {
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    role: formData.get('role'),
    class_grade: formData.get('class_grade') || null,
    class_letter: formData.get('class_letter') || null
  };
  
  // Validate
  if (!userData.full_name || !userData.email || !userData.role) {
    showError('Моля, попълнете всички задължителни полета');
    return;
  }
  
  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userData.email)) {
    showError('Невалиден email адрес');
    return;
  }
  
  // If student or teacher, require class
  if ((userData.role === 'student' || userData.role === 'teacher') && (!userData.class_grade || !userData.class_letter)) {
    showError('Моля, въведете клас за ученик/учител');
    return;
  }
  
  try {
    const createdUser = await API.createUser(STATE.currentUser.id, userData);
    
    closeModal('create-user-modal');
    
    // Show the generated credentials
    document.getElementById('created-username').textContent = createdUser.username;
    document.getElementById('created-password').textContent = createdUser.password;
    document.getElementById('created-email').textContent = createdUser.email;
    
    showModal('user-created-modal');
    
    // Reload user list
    await loadAdminPanel();
    
  } catch (error) {
    showError(error.message);
  }
}

function copyPassword() {
  const password = document.getElementById('created-password').textContent;
  
  // Try modern clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(password).then(() => {
      showNotification('Паролата е копирана!');
    }).catch(err => {
      // Fallback
      fallbackCopyPassword(password);
    });
  } else {
    // Fallback for older browsers
    fallbackCopyPassword(password);
  }
}

function fallbackCopyPassword(password) {
  const textarea = document.createElement('textarea');
  textarea.value = password;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    showNotification('Паролата е копирана!');
  } catch (err) {
    showError('Не може да се копира автоматично. Моля, копирайте ръчно.');
  }
  
  document.body.removeChild(textarea);
}

function closeUserCreatedModal() {
  closeModal('user-created-modal');
  document.getElementById('created-username').textContent = '';
  document.getElementById('created-password').textContent = '';
  document.getElementById('created-email').textContent = '';
}

async function handleDeleteUser(userId, userName) {
  confirmDeleteAction(
    `Сигурни ли сте, че искате да изтриете ${userName}? Това ще изтрие всички техни публикации, коментари и съобщения.`,
    async () => {
      try {
        await API.deleteUser(userId, STATE.currentUser.id);
        showNotification('Потребителят е изтрит');
        await loadAdminPanel();
      } catch (error) {
        showError(error.message);
      }
    }
  );
}
