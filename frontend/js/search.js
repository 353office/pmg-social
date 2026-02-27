// SEARCH HANDLERS - ALL CALLABLE FROM HTML

let searchTimeout;

function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const query = document.getElementById('search-input').value.trim();
    const activeTab = document.querySelector('.search-tab.active');
    
    if (!query) {
      document.getElementById('search-results-posts').innerHTML = '';
      document.getElementById('search-results-users').innerHTML = '';
      return;
    }
    
    if (activeTab.textContent === 'Публикации') {
      searchPosts(query);
    } else {
      searchUsers(query);
    }
  }, 300);
}

async function searchPosts(query) {
  const results = STATE.posts.filter(post => 
    post.content.toLowerCase().includes(query.toLowerCase()) ||
    post.full_name.toLowerCase().includes(query.toLowerCase())
  );
  
  const resultsEl = document.getElementById('search-results-posts');
  
  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="empty-state">Няма резултати</div>';
    return;
  }
  
  const postsHTML = await Promise.all(results.map(post => renderPost(post)));
  resultsEl.innerHTML = postsHTML.join('');
}

async function searchUsers(query) {
  try {
    const users = await API.searchUsers(query);
    const resultsEl = document.getElementById('search-results-users');
    
    if (users.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state">Няма резултати</div>';
      return;
    }
    
    resultsEl.innerHTML = users.map(user => {
      const avatarUrl = user.profile_picture || DEFAULT_AVATAR;
      const roleLabel = getRoleLabel(user.role);
      
      return `
        <div class="user-result" onclick="navigateTo('profile', '${user.id}')">
          <img src="${avatarUrl}" class="user-result-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
          <div class="user-result-info">
            <div class="user-result-name">${escapeHtml(user.full_name)}</div>
            <div class="user-result-meta">
              <span class="badge badge-${user.role}">${roleLabel}</span>
              ${user.class_grade ? ` ${user.class_grade}${user.class_letter} клас` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    showError(error.message);
  }
}

function switchSearchTab(tab) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelectorAll('.search-results').forEach(r => r.classList.remove('active'));
  document.getElementById(`search-results-${tab}`).classList.add('active');
  
  handleSearch();
}

function startDM(userId, userName) {
  // Start a conversation with this user
  showPage('messages');
  createOrOpenConversation(userId, userName);
}
