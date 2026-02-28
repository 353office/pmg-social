// MESSAGES HANDLERS - ALL CALLABLE FROM HTML

async function loadConversations() {
  if (!STATE.currentUser) return;
  
  const listEl = document.getElementById('conversations-list');
  listEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const conversations = await API.getConversations(STATE.currentUser.id);
    
    if (conversations.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Няма съобщения</div>';
      return;
    }
    
    listEl.innerHTML = conversations.map(conv => `
      <div class="conversation-item ${STATE.currentConversation === conv.id ? 'active' : ''}" 
           onclick="loadConversation('${conv.id}', '${escapeHtml(conv.name || 'Разговор')}')">
        <div class="conversation-name">${escapeHtml(conv.name || 'Разговор')}</div>
        <div class="conversation-preview">${escapeHtml(conv.last_message || 'Няма съобщения')}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Conversations error:', error);
    listEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

async function loadConversation(conversationId, conversationName) {
  STATE.currentConversation = conversationId;
  
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const messages = await API.getMessages(conversationId);
    
    chatArea.innerHTML = `
      <div class="chat-header">${escapeHtml(conversationName)}</div>
      <div class="chat-messages" id="chat-messages">
        ${messages.length === 0 ? 
          '<div class="empty-state">Няма съобщения</div>' :
          messages.map(msg => `
            <div class="message ${msg.sender_id === STATE.currentUser.id ? 'own' : ''}">
              ${msg.sender_id !== STATE.currentUser.id ? 
                `<div class="message-sender">${escapeHtml(msg.sender_name)}</div>` : 
                ''}
              <div class="message-content">${escapeHtml(msg.content)}</div>
              ${(msg.sender_id === STATE.currentUser.id || STATE.currentUser.role === 'admin') ? `<button class="message-delete-btn" title="Изтрий" onclick="handleDeleteMessage('${msg.id}', '${conversationId}', '${escapeHtml(conversationName)}')"><i data-lucide="trash-2"></i></button>` : ''}
              ${msg.created_at ? `<div class="message-meta">${formatClockTime(msg.created_at)}</div>` : ``}
</div>
          `).join('')
        }
      </div>
      <div class="chat-input-container">
        <input type="text" class="chat-input" id="message-input" 
               placeholder="Напиши съобщение..." 
               onkeypress="if(event.key==='Enter') handleSendMessage()">
        <button class="btn btn-primary" onclick="handleSendMessage()">Изпрати</button>
      </div>
    `;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    
    // Scroll to bottom
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    
    // Update conversations list
    await loadConversations();
  } catch (error) {
    console.error('Messages error:', error);
    chatArea.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

async function handleSendMessage() {
  const input = document.getElementById('message-input');
  const content = input?.value.trim();
  
  if (!content || !STATE.currentConversation) return;
  
  try {
    await API.sendMessage(STATE.currentUser.id, STATE.currentConversation, content);
    input.value = '';
    
    // Get conversation name
    const convItem = document.querySelector('.conversation-item.active .conversation-name');
    const convName = convItem ? convItem.textContent : 'Разговор';
    
    await loadConversation(STATE.currentConversation, convName);
  } catch (error) {
    showError(error.message);
  }
}

function showNewMessageModal() {
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-search-results').innerHTML = '';
  showModal('new-message-modal');
}

let userSearchTimeout;

function handleUserSearch() {
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(async () => {
    const query = document.getElementById('user-search-input').value.trim();
    const resultsEl = document.getElementById('user-search-results');
    
    if (query.length < 2) {
      resultsEl.innerHTML = '';
      return;
    }
    
    try {
      const users = await API.searchUsers(query);
      
      if (users.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">Няма резултати</div>';
        return;
      }
      
      resultsEl.innerHTML = users.map(user => {
        const avatarUrl = user.profile_picture || DEFAULT_AVATAR;
        return `
          <div class="user-result" onclick="createOrOpenConversation('${user.id}', '${escapeHtml(user.full_name)}')">
            <img src="${avatarUrl}" class="user-result-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
            <div class="user-result-info">
              <div class="user-result-name">${escapeHtml(user.full_name)}</div>
              <div class="user-result-meta">
                @${user.username}
                ${user.class_grade ? ` · ${user.class_grade}${user.class_letter}` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      showError(error.message);
    }
  }, 300);
}

async function createOrOpenConversation(userId, userName) {
  closeModal('new-message-modal');
  
  try {
    // Create new conversation
    const conversation = await API.createConversation(
      [STATE.currentUser.id, userId],
      false,
      null,
      STATE.currentUser.id
    );
    
    showPage('messages');
    await loadConversations();
    await loadConversation(conversation.id, userName);
  } catch (error) {
    // Conversation might already exist, just load conversations
    showPage('messages');
    await loadConversations();
  }
}



async function handleDeleteMessage(messageId, conversationId, conversationName) {
  if (!STATE.currentUser) return;
  if (!confirm('Сигурни ли сте, че искате да изтриете това съобщение?')) return;

  try {
    await API.deleteMessage(messageId, STATE.currentUser.id);
    // Reload current conversation and conversations list (last_message preview)
    await loadConversation(conversationId, conversationName);
    await loadConversations();
  } catch (error) {
    showError(error.message || 'Грешка при изтриване');
  }
}

function formatClockTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
