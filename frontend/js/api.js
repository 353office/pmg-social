// SINGLE SOURCE OF TRUTH FOR ALL API CALLS
const API = {
  BASE_URL: `${(window.API_BASE_URL || 'http://localhost:3001')}/api`,
  
  async request(endpoint, options = {}) {
    const url = `${this.BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };
    
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
  
  // Auth
  async login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  
  async verifySession(token) {
    return this.request('/verify-session', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },
  
  async logout(token) {
    return this.request('/logout', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },
  
  // Users
  async searchUsers(query) {
    return this.request(`/users/search/${encodeURIComponent(query)}`);
  },
  
  async getUserProfile(userId) {
    return this.request(`/users/${userId}/profile`);
  },
  
  async updateProfile(userId, currentUserId, bio, profilePicture) {
    return this.request(`/users/${userId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ current_user_id: currentUserId, bio, profile_picture: profilePicture })
    });
  },
  
  async getAllUsers(adminId) {
    return this.request(`/users?admin_id=${adminId}`);
  },
  
  async createUser(adminId, userData) {
    return this.request('/users/create', {
      method: 'POST',
      body: JSON.stringify({ admin_id: adminId, ...userData })
    });
  },
  
  async deleteUser(userId, adminId) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify({ admin_id: adminId })
    });
  },
  
  async searchUsersForMention(query) {
    return this.request(`/users/mention-search/${encodeURIComponent(query)}`);
  },
  
  // Feed
  async getFeed(userId) {
    return this.request(`/feed/${userId}`);
  },
  
  // Posts
  async createPost(user_id, content, visibility, image_url, attachments) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ user_id, content, visibility, image_url, attachments })
    });
  },
  
  async getPost(postId) {
    return this.request(`/posts/${postId}`);
  },
  
  async deletePost(postId, userId) {
    return this.request(`/posts/${postId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
  },
  
  // Likes
  async toggleLike(postId, userId) {
    return this.request(`/posts/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },
  
  async checkLiked(postId, userId) {
    return this.request(`/posts/${postId}/liked/${userId}`);
  },
  
  // Comments
  async getComments(postId) {
    return this.request(`/posts/${postId}/comments`);
  },
  
  async addComment(postId, userId, content) {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, content })
    });
  },
  
  async deleteComment(commentId, userId) {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
  },
  
  // Notifications
  async getNotifications(userId) {
    return this.request(`/notifications/${userId}`);
  },
  
  async getUnreadCount(userId) {
    return this.request(`/notifications/${userId}/unread-count`);
  },
  
  async markNotificationRead(notificationId) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PATCH'
    });
  },
  
  async markAllNotificationsRead(userId) {
    return this.request(`/notifications/${userId}/read-all`, {
      method: 'PATCH'
    });
  },
  
  // Attachments
  async getPostAttachments(postId) {
    return this.request(`/posts/${postId}/attachments`);
  },
  
  // Calendar
  async getCalendar(userId) {
    return this.request(`/calendar?userId=${userId}`);
  },
  
  async getEvent(eventId) {
    return this.request(`/calendar/${eventId}`);
  },
  
  async createEvent(eventData) {
    return this.request('/calendar', {
      method: 'POST',
      body: JSON.stringify(eventData)
    });
  },
  
  // Clubs
  async getClubs() {
    return this.request('/clubs');
  },
  
  async getClub(clubId) {
    return this.request(`/clubs/${clubId}`);
  },
  
  async checkMembership(clubId, userId) {
    return this.request(`/clubs/${clubId}/is-member/${userId}`);
  },
  
  async createClub(clubData) {
    return this.request('/clubs', {
      method: 'POST',
      body: JSON.stringify(clubData)
    });
  },
  
  async joinClub(clubId, userId) {
    return this.request(`/clubs/${clubId}/join`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },
  
  async leaveClub(clubId, userId) {
    return this.request(`/clubs/${clubId}/leave`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
  },
  
  // Messages
  async getConversations(userId) {
    return this.request(`/messages/conversations/${userId}`);
  },
  
  async getMessages(conversationId) {
    return this.request(`/messages/${conversationId}`);
  },
  
  async createConversation(participants, isGroup, name, createdBy) {
    return this.request('/messages/conversations', {
      method: 'POST',
      body: JSON.stringify({ participants, is_group: isGroup, name, created_by: createdBy })
    });
  },
  
  async sendMessage(senderId, conversationId, content) {
    return this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ sender_id: senderId, conversation_id: conversationId, content })
    });
  }
};
