// FEED - Posts with images and clickable elements

function getCurrentFeedFilter() {
  const sel = document.getElementById('post-visibility');
  // If the selector isn't present (e.g. some pages), default to showing everything available.
  return sel?.value || 'class';
}

function filterPostsForFeed(posts, filterValue) {
  // The server already enforces visibility rules; this is purely a UI filter.
  // public: only public
  // grade: public + grade
  // class: public + grade + class (i.e. everything the user can see)
  if (filterValue === 'public') return posts.filter(p => p.visibility === 'public');
  if (filterValue === 'grade') return posts.filter(p => p.visibility === 'public' || p.visibility === 'grade');
  return posts;
}

function renderFeedPosts(posts) {
  const feedEl = document.getElementById('posts-feed');
  if (!feedEl) return;
  if (!posts || posts.length === 0) {
    feedEl.innerHTML = '<div class="empty-state">Няма публикации</div>';
    return;
  }

  feedEl.innerHTML = posts.map(post => renderPostSync(post)).join('');
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
  posts.forEach(post => loadPostInteractions(post.id));
}

function handleFeedFilterChange() {
  // Re-render instantly from cached posts (no reload required)
  const filterValue = getCurrentFeedFilter();
  STATE.feedFilter = filterValue;
  const filtered = filterPostsForFeed(STATE.posts || [], filterValue);
  renderFeedPosts(filtered);
}

async function loadFeed() {
  if (!STATE.currentUser) return;
  
  const feedEl = document.getElementById('posts-feed');
  feedEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const posts = await API.getFeed(STATE.currentUser.id);
    STATE.posts = posts;

    // Apply the current UI filter immediately
    const filterValue = STATE.feedFilter || getCurrentFeedFilter();
    const filtered = filterPostsForFeed(posts, filterValue);
    
    renderFeedPosts(filtered);
    
  } catch (error) {
    console.error('Feed error:', error);
    feedEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

function renderPostSync(post) {
  const canDelete = post.user_id === STATE.currentUser.id || STATE.currentUser.role === 'admin';
  const roleLabel = getRoleLabel(post.role);
  const avatarUrl = post.profile_picture || DEFAULT_AVATAR;
  
  return `
    <div class="post" data-post-id="${post.id}">
      <div class="post-header">
        <img src="${avatarUrl}" class="post-avatar" onclick="navigateTo('profile', '${post.user_id}')" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="post-author">
          <div class="post-author-header">
            <div>
              <span class="author-name" onclick="navigateTo('profile', '${post.user_id}')">${escapeHtml(post.full_name)}</span>
              <span class="badge badge-${post.role}">${roleLabel}</span>
            </div>
            ${canDelete ? `<button class="btn-icon" onclick="handleDeletePost('${post.id}')" title="Изтрий"><i data-lucide="trash-2"></i></button>` : ''}
          </div>
          <div class="author-meta">
            ${post.class_grade && post.class_letter ? `${post.class_grade}${post.class_letter} клас · ` : ''}
            ${formatTime(post.created_at)}
          </div>
        </div>
      </div>
      
      <div class="post-content" onclick="navigateTo('post', '${post.id}')" style="cursor: pointer;">${escapeHtml(post.content)}</div>
      
      ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" class="post-image" onclick="navigateTo('post', '${post.id}')" onerror="this.style.display='none'">` : ''}
      
      <div class="post-actions">
        <div class="post-action" onclick="navigateTo('post', '${post.id}')">
          <span>💬</span>
          <span id="comment-count-${post.id}">${post.comment_count || 0}</span>
        </div>
        <div class="post-action" id="like-action-${post.id}" onclick="event.stopPropagation(); handleToggleLike('${post.id}')">
          <span>🤍</span>
          <span id="like-count-${post.id}">${post.like_count || 0}</span>
        </div>
      </div>
    </div>
  `;
}

async function loadPostInteractions(postId) {
  // Load liked status
  try {
    const result = await API.checkLiked(postId, STATE.currentUser.id);
    if (result.liked) {
      const likeAction = document.getElementById(`like-action-${postId}`);
      if (likeAction) {
        likeAction.classList.add('liked');
        likeAction.querySelector('span').textContent = '❤️';
      }
    }
  } catch (error) {
    console.error('Check liked error:', error);
  }
}

async function renderPost(post) {
  // This version is used for profile pages where we can wait
  let isLiked = false;
  try {
    const result = await API.checkLiked(post.id, STATE.currentUser.id);
    isLiked = result.liked;
  } catch (error) {
    console.error('Check liked error:', error);
  }
  
  let comments = [];
  try {
    comments = await API.getComments(post.id);
  } catch (error) {
    console.error('Comments error:', error);
  }
  
  const canDelete = post.user_id === STATE.currentUser.id || STATE.currentUser.role === 'admin';
  const roleLabel = getRoleLabel(post.role);
  const avatarUrl = post.profile_picture || DEFAULT_AVATAR;
  
  return `
    <div class="post" data-post-id="${post.id}">
      <div class="post-header">
        <img src="${avatarUrl}" class="post-avatar" onclick="navigateTo('profile', '${post.user_id}')" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="post-author">
          <div class="post-author-header">
            <div>
              <span class="author-name" onclick="navigateTo('profile', '${post.user_id}')">${escapeHtml(post.full_name)}</span>
              <span class="badge badge-${post.role}">${roleLabel}</span>
            </div>
            ${canDelete ? `<button class="btn-icon" onclick="handleDeletePost('${post.id}')" title="Изтрий"><i data-lucide="trash-2"></i></button>` : ''}
          </div>
          <div class="author-meta">
            ${post.class_grade && post.class_letter ? `${post.class_grade}${post.class_letter} клас · ` : ''}
            ${formatTime(post.created_at)}
          </div>
        </div>
      </div>
      
      <div class="post-content" onclick="navigateTo('post', '${post.id}')" style="cursor: pointer;">${escapeHtml(post.content)}</div>
      
      ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" class="post-image" onclick="navigateTo('post', '${post.id}')" onerror="this.style.display='none'">` : ''}
      
      <div class="post-actions">
        <div class="post-action" onclick="navigateTo('post', '${post.id}')">
          <span>💬</span>
          <span>${comments.length}</span>
        </div>
        <div class="post-action ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); handleToggleLike('${post.id}')">
          <span>${isLiked ? '❤️' : '🤍'}</span>
          <span id="like-count-${post.id}">${post.like_count || 0}</span>
        </div>
      </div>
    </div>
  `;
}

// Post composer
function updatePostButton() {
  const input = document.getElementById('post-input');
  const button = document.getElementById('post-button');
  button.disabled = !input.value.trim();
}

async function handleCreatePost() {
  const content = document.getElementById('post-input').value.trim();
  const visibility = document.getElementById('post-visibility').value;
  const imageUrl = document.getElementById('post-image-url').value.trim();
  
  if (!content) return;
  
  try {
    await API.createPost(STATE.currentUser.id, content, visibility, imageUrl || null);
    
    document.getElementById('post-input').value = '';
    document.getElementById('post-image-url').value = '';
    document.getElementById('post-button').disabled = true;
    
    await loadFeed();
    showNotification('Публикацията е добавена!');
  } catch (error) {
    showError(error.message);
  }
}

// Delete post
async function handleDeletePost(postId) {
  confirmDeleteAction('Сигурни ли сте, че искате да изтриете тази публикация?', async () => {
    try {
      await API.deletePost(postId, STATE.currentUser.id);
      await loadFeed();
      showNotification('Публикацията е изтрита');
    } catch (error) {
      showError(error.message);
    }
  });
}

// Like toggle
async function handleToggleLike(postId) {
  try {
    const result = await API.toggleLike(postId, STATE.currentUser.id);
    
    const likeAction = document.getElementById(`like-action-${postId}`);
    const likeCount = document.getElementById(`like-count-${postId}`);
    
    if (likeAction && likeCount) {
      if (result.liked) {
        likeAction.classList.add('liked');
        likeAction.querySelector('span').textContent = '❤️';
        likeCount.textContent = parseInt(likeCount.textContent) + 1;
      } else {
        likeAction.classList.remove('liked');
        likeAction.querySelector('span').textContent = '🤍';
        likeCount.textContent = parseInt(likeCount.textContent) - 1;
      }
    }
  } catch (error) {
    showError(error.message);
  }
}

// Add comment
async function handleAddComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  
  if (!content) return;
  
  try {
    await API.addComment(postId, STATE.currentUser.id, content);
    input.value = '';
    
    // Reload the post detail page
    showPostDetail(postId);
    showNotification('Коментарът е добавен');
  } catch (error) {
    showError(error.message);
  }
}

// Delete comment
async function handleDeleteComment(commentId, postId) {
  confirmDeleteAction('Изтрий този коментар?', async () => {
    try {
      await API.deleteComment(commentId, STATE.currentUser.id);
      showPostDetail(postId);
      showNotification('Коментарът е изтрит');
    } catch (error) {
      showError(error.message);
    }
  });
}

function renderComment(comment, postId) {
  const canDelete = comment.user_id === STATE.currentUser.id || STATE.currentUser.role === 'admin';
  const avatarUrl = comment.profile_picture || DEFAULT_AVATAR;
  
  return `
    <div class="comment" data-comment-id="${comment.id}">
      <img src="${avatarUrl}" class="comment-avatar" onclick="navigateTo('profile', '${comment.user_id}')" onerror="this.src='${DEFAULT_AVATAR}'">
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author" onclick="navigateTo('profile', '${comment.user_id}')">${escapeHtml(comment.full_name)}</span>
          <span class="comment-meta">
            ${comment.class_grade && comment.class_letter ? `${comment.class_grade}${comment.class_letter} · ` : ''}
            ${formatTime(comment.created_at)}
          </span>
          ${canDelete ? `<button class="btn-icon" onclick="handleDeleteComment('${comment.id}', '${postId}')" style="margin-left: auto;">🗑️</button>` : ''}
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
      </div>
    </div>
  `;
}
