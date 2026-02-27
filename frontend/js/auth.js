// AUTH HANDLERS - ALL CALLABLE FROM HTML

async function handleLogin(event) {
  event.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  
  errorEl.classList.add('hidden');
  
  try {
    const { user, token } = await API.login(username, password);
    
    STATE.currentUser = user;
    STATE.token = token;
    localStorage.setItem('token', token);
    
    showApp();
    // Ensure the initial route is loaded (otherwise feed may not render until the user navigates)
    navigateTo('home');
  } catch (error) {
    errorEl.textContent = error.message || 'Грешно потребителско име или парола';
    errorEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  try {
    if (STATE.token) {
      await API.logout(STATE.token);
    }
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  localStorage.removeItem('token');
  STATE.currentUser = null;
  STATE.token = null;
  STATE.posts = [];
  
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  
  showLogin();
}
