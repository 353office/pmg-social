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


function formatClockTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
