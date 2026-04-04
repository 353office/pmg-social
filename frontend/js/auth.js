// AUTH HANDLERS - ALL CALLABLE FROM HTML

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');
  try {
    const result = await API.login(username, password);
    if (result.requires_2fa) {
      STATE.pending2FAToken = result.temp_login_token;
      document.getElementById('login-password-group').classList.add('hidden');
      document.getElementById('login-2fa-group').classList.remove('hidden');
      document.getElementById('login-submit-btn').textContent = 'Потвърди 2FA';
      document.getElementById('username').disabled = true;
      document.getElementById('password').disabled = true;
      document.getElementById('two-factor-code').focus();
      return;
    }
    STATE.currentUser = result.user;
    await afterSuccessfulLogin();
  } catch (error) {
    errorEl.textContent = error.message || 'Грешно потребителско име или парола';
    errorEl.classList.remove('hidden');
  }
}

async function handleTwoFactorSubmit() {
  const code = document.getElementById('two-factor-code').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');
  try {
    const result = await API.loginTwoFactor(STATE.pending2FAToken, code);
    STATE.currentUser = result.user;
    STATE.pending2FAToken = null;
    await afterSuccessfulLogin();
  } catch (error) {
    errorEl.textContent = error.message || 'Невалиден 2FA код';
    errorEl.classList.remove('hidden');
  }
}

async function afterSuccessfulLogin() {
  resetLoginForm();
  showApp();
  const hash = window.location.hash.slice(2);
  const parts = hash.split('/').filter(Boolean);
  if (parts.length > 0) loadPage(parts[0], parts[1]);
  else navigateTo('home');
}

function resetLoginForm() {
  document.getElementById('login-password-group').classList.remove('hidden');
  document.getElementById('login-2fa-group').classList.add('hidden');
  document.getElementById('login-submit-btn').textContent = 'Вход';
  document.getElementById('username').disabled = false;
  document.getElementById('password').disabled = false;
  document.getElementById('two-factor-code').value = '';
  STATE.pending2FAToken = null;
}

async function handleLogout() {
  try { await API.logout(); } catch (error) { console.error('Logout error:', error); }
  STATE.currentUser = null;
  STATE.posts = [];
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  resetLoginForm();
  showLogin();
}
