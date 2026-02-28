// ROUTER

function navigateTo(page, param) {
  let hash = `#/${page}`;
  if (param) hash += `/${param}`;
  const same = window.location.hash === hash;
  window.location.hash = hash;
  if (same && typeof loadPage === 'function') loadPage(page, param);
}

function loadPage(page, param) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  
  // Layout tweaks per page
  document.body.classList.toggle('page-messages', page === 'messages');
// Update nav
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  // NOTE: index 2 is the notifications dropdown (not a routed page), so items below shift by +1.
  const navMap = { home: 0, search: 1, calendar: 3, clubs: 4, messages: 5, admin: 6 };
  if (navMap[page] !== undefined) {
    document.querySelectorAll('.nav-item')[navMap[page]].classList.add('active');
  }
  
  // Show target page
  let pageEl;
  switch(page) {
    case 'home':
      pageEl = document.getElementById('page-home');
      pageEl.classList.add('active');
      loadFeed();
      break;
      
    case 'search':
      pageEl = document.getElementById('page-search');
      pageEl.classList.add('active');
      break;
      
    case 'calendar':
      pageEl = document.getElementById('page-calendar');
      pageEl.classList.add('active');
      loadCalendar();
      break;
      
    case 'clubs':
      pageEl = document.getElementById('page-clubs');
      pageEl.classList.add('active');
      loadClubs();
      break;
      
    case 'club':
      pageEl = document.getElementById('page-club-detail');
      pageEl.classList.add('active');
      if (param) showClubDetail(param);
      break;
      
    case 'messages':
      pageEl = document.getElementById('page-messages');
      pageEl.classList.add('active');
      loadConversations();
      break;
      
    case 'admin':
      pageEl = document.getElementById('page-admin');
      pageEl.classList.add('active');
      loadAdminPanel();
      break;
      
    case 'profile':
      pageEl = document.getElementById('page-profile');
      pageEl.classList.add('active');
      if (param) showUserProfile(param);
      break;
      
    case 'post':
      pageEl = document.getElementById('page-post');
      pageEl.classList.add('active');
      if (param) showPostDetail(param);
      break;
      
    default:
      navigateTo('home');
      break;
  }

  // Refresh icons after dynamic render
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Handle hash changes (only when logged in)
window.addEventListener('hashchange', () => {
  if (window.STATE && window.STATE.currentUser) {
    const hash = window.location.hash.slice(2); // Remove #/
    const parts = hash.split('/').filter(Boolean);
    loadPage(parts[0] || 'home', parts[1]);
  }
});
