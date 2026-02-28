// PROFILE AND POST DETAIL PAGES

async function showUserProfile(userId) {
  const contentEl = document.getElementById('profile-content');
  contentEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const profile = await API.getUserProfile(userId);
    const isOwnProfile = profile.id === STATE.currentUser.id;
    
    const roleLabel = getRoleLabel(profile.role);
    const avatarUrl = profile.profile_picture || DEFAULT_AVATAR;
    
    contentEl.innerHTML = `
      <div class="profile-header">
        <div class="profile-info">
          <img src="${avatarUrl}" class="profile-avatar-large" onerror="this.src='${DEFAULT_AVATAR}'">
          <div class="profile-header-text">
            <div class="profile-name">${escapeHtml(profile.full_name)}</div>
            <div class="profile-username">@${profile.username}</div>
          </div>
        </div>
      </div>
      
      <div class="profile-details">
        ${profile.bio ? `<div class="profile-bio">${escapeHtml(profile.bio)}</div>` : ''}
        
        <div class="profile-stats">
          <div class="profile-stat">
            <strong>${profile.posts.length}</strong> публикации
          </div>
          <div class="profile-stat">
            <span class="badge badge-${profile.role}">${roleLabel}</span>
            ${profile.class_grade ? ` ${profile.class_grade}${profile.class_letter} клас` : ''}
          </div>
        </div>
        
        ${isOwnProfile ? 
          `<button class="btn btn-primary" onclick="showEditProfileModal()">Редактирай профил</button>` :
          ''
        }
      </div>
      
      <div class="profile-posts">
        ${profile.posts.length === 0 ? 
          '<div class="empty-state">Няма публикации</div>' :
          (await Promise.all(profile.posts.map(post => renderPost(post)))).join('')
        }
      </div>
    `;
    
    document.getElementById('profile-title').textContent = profile.full_name;
  } catch (error) {
    console.error('Profile error:', error);
    contentEl.innerHTML = '<div class="empty-state">Грешка при зареждане на профила</div>';
  }
}

function showEditProfileModal() {
  document.getElementById('edit-bio').value = STATE.currentUser.bio || '';
  document.getElementById('edit-profile-picture').value = STATE.currentUser.profile_picture || '';
  showModal('edit-profile-modal');
}

async function handleUpdateProfile(event) {
  event.preventDefault();
  
  const bio = document.getElementById('edit-bio').value;
  const profilePicture = document.getElementById('edit-profile-picture').value;
  
  try {
    const updatedUser = await API.updateProfile(STATE.currentUser.id, STATE.currentUser.id, bio, profilePicture);
    
    STATE.currentUser.bio = updatedUser.bio;
    STATE.currentUser.profile_picture = updatedUser.profile_picture;
    
    // Update avatar in sidebar
    const avatarUrl = getAvatarUrl(STATE.currentUser);
    document.getElementById('user-avatar').src = avatarUrl;
    document.getElementById('composer-avatar').src = avatarUrl;
    
    closeModal('edit-profile-modal');
    showNotification('Профилът е обновен!');
    showUserProfile(STATE.currentUser.id);
  } catch (error) {
    showError(error.message);
  }
}

async function showPostDetail(postId) {
  const contentEl = document.getElementById('post-detail-content');
  contentEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const post = await API.getPost(postId);
    const comments = await API.getComments(postId);
    const isLiked = await API.checkLiked(postId, STATE.currentUser.id).then(r => r.liked);
    
    const roleLabel = getRoleLabel(post.role);
    const avatarUrl = post.profile_picture || DEFAULT_AVATAR;
    
    contentEl.innerHTML = `
      <div class="post-detail">
        <div class="post-detail-main">
          <div class="post-header">
            <img src="${avatarUrl}" class="post-avatar" onclick="navigateTo('profile', '${post.user_id}')" onerror="this.src='${DEFAULT_AVATAR}'">
            <div class="post-author">
              <span class="author-name" onclick="navigateTo('profile', '${post.user_id}')">${escapeHtml(post.full_name)}</span>
              <span class="badge badge-${post.role}">${roleLabel}</span>
              <div class="author-meta">@${post.username} · ${formatDate(post.created_at)}</div>
            </div>
          </div>
          
          <div class="post-detail-content">${escapeHtml(post.content)}</div>
          
          ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" class="post-image" onerror="this.style.display='none'">` : ''}
          
          <div class="post-detail-timestamp">${new Date(post.created_at).toLocaleString('bg-BG')}</div>
          
          <div class="post-detail-stats">
            <div class="post-detail-stat">
              <strong>${post.like_count}</strong> харесвания
            </div>
            <div class="post-detail-stat">
              <strong>${comments.length}</strong> коментара
            </div>
          </div>
          
          <div class="post-actions">
            <div class="post-action ${isLiked ? 'liked' : ''}" onclick="handleToggleLike('${post.id}')">
              <span>${isLiked ? '❤️' : '🤍'}</span>
              <span id="like-count-${post.id}">${post.like_count}</span>
            </div>
          </div>
        </div>
        
        <div class="replies-section">
          <h3 class="replies-title">Коментари</h3>
          
          ${comments.map(c => renderComment(c, post.id)).join('')}
          
          <div class="comment-input-section">
            <input type="text" class="comment-input" placeholder="Добави коментар..." id="comment-input-${post.id}" onkeypress="if(event.key==='Enter') handleAddComment('${post.id}')">
            <button class="btn btn-primary" onclick="handleAddComment('${post.id}')">➤</button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Post detail error:', error);
    contentEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}
