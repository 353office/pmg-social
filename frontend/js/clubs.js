// CLUBS HANDLERS - ALL CALLABLE FROM HTML

async function loadClubs() {
  const contentEl = document.getElementById('clubs-content');
  contentEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const clubs = await API.getClubs();
    
    if (clubs.length === 0) {
      contentEl.innerHTML = '<div class="empty-state">Няма налични клубове</div>';
      return;
    }
    
    contentEl.innerHTML = clubs.map(club => `
      <div class="club-card" onclick=\"navigateTo('club','${club.id}')\">
        <div class="club-icon">${getClubIcon(club.name)}</div>
        <div class="club-name">${escapeHtml(club.name)}</div>
        <div class="club-description">${escapeHtml(club.description || 'Без описание')}</div>
        <div class="club-meta">
          👥 ${club.member_count} ${club.member_count === 1 ? 'член' : 'членове'}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Clubs error:', error);
    contentEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

async function loadClubsWidget() {
  try {
    const clubs = await API.getClubs();
    const widgetEl = document.getElementById('clubs-widget');
    
    if (clubs.length === 0) {
      widgetEl.innerHTML = '<div class="widget-item">Няма налични клубове</div>';
      return;
    }
    
    widgetEl.innerHTML = clubs.slice(0, 5).map(club => `
      <div class="widget-item" onclick=\"navigateTo('club','${club.id}')\">
        <div class="item-title">${getClubIcon(club.name)} ${escapeHtml(club.name)}</div>
        <div class="item-meta">${club.member_count} членове</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Clubs widget error:', error);
  }
}

async function showClubDetail(clubId) {
  // Prevent "flash" of previous club: show loading immediately and ignore stale responses
  const reqId = `${Date.now()}-${Math.random()}`;
  STATE._clubDetailReqId = reqId;

  document.getElementById('club-detail-title').textContent = 'Зареждане...';
  document.getElementById('club-detail-content').innerHTML = '<div class="loading">Зареждане...</div>';

  try {
    const club = await API.getClub(clubId);
    const { isMember } = await API.checkMembership(clubId, STATE.currentUser.id);

    // If user clicked another club while we were loading, ignore this response
    if (STATE._clubDetailReqId !== reqId) return;
    
    document.getElementById('club-detail-title').textContent = club.name;
    
    document.getElementById('club-detail-content').innerHTML = `
      <div class="club-detail-header">
        <div class="club-detail-icon">${getClubIcon(club.name)}</div>
        <div class="club-detail-info">
          <h2 class="club-detail-name">${escapeHtml(club.name)}</h2>
          <p class="club-detail-description">${escapeHtml(club.description || 'Без описание')}</p>
          <div class="club-detail-meta">
            ${club.meeting_schedule ? `<div>📅 <strong>График:</strong> ${escapeHtml(club.meeting_schedule)}</div>` : ''}
            ${club.meeting_location ? `<div>📍 <strong>Локация:</strong> ${escapeHtml(club.meeting_location)}</div>` : ''}
            <div>👤 <strong>Лидер:</strong> ${escapeHtml(club.leader_name)}</div>
            <div>👥 <strong>Членове:</strong> ${club.member_count}</div>
          </div>
          ${isMember ? 
            `<button class="btn btn-danger" onclick="handleLeaveClub('${club.id}')">Напусни клуба</button>` :
            `<button class="btn btn-primary" onclick="handleJoinClub('${club.id}')">Присъедини се</button>`
          }
        </div>
      </div>

      ${((club.leader_id && club.leader_id === STATE.currentUser.id) || STATE.currentUser.role === 'admin') ? `
        <div style="margin-top:12px;">
          <button class="btn btn-danger" onclick="handleDeleteClub('${club.id}')">Изтрий клуба</button>
        </div>
      ` : ''}

      
      <div class="club-section">
        <h3 class="club-section-title">Членове (${club.members.length})</h3>
        ${club.members.map(member => {
          const avatarUrl = member.profile_picture || DEFAULT_AVATAR;
          return `
            <div class="club-member">
              <img src="${avatarUrl}" class="club-member-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
              <div class="club-member-info">
                <div class="club-member-name">
                  ${escapeHtml(member.full_name)}
                  ${member.member_role === 'leader' ? ' 👑' : ''}
                </div>
                <div class="club-member-meta">
                  ${member.class_grade ? `${member.class_grade}${member.class_letter} клас` : getRoleLabel(member.role)}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    
  } catch (error) {
    showError(error.message);
  }
}

async function handleJoinClub(clubId) {
  try {
    await API.joinClub(clubId, STATE.currentUser.id);
    showNotification('Успешно се присъединихте към клуба!');
    await showClubDetail(clubId);
    await loadClubsWidget();
  } catch (error) {
    showError(error.message);
  }
}

async function handleLeaveClub(clubId) {
  confirmDeleteAction('Сигурни ли сте, че искате да напуснете този клуб?', async () => {
    try {
      await API.leaveClub(clubId, STATE.currentUser.id);
      showNotification('Напуснахте клуба');
      showPage('clubs');
      await loadClubs();
      await loadClubsWidget();
    } catch (error) {
      showError(error.message);
    }
  });
}

function showCreateClubModal() {
  showModal('create-club-modal');
}

async function handleCreateClub(event) {
  event.preventDefault();
  
  const formData = new FormData(event.target);
  const clubData = {
    name: formData.get('name'),
    description: formData.get('description'),
    meeting_schedule: formData.get('meeting_schedule'),
    meeting_location: formData.get('meeting_location'),
    leader_id: STATE.currentUser.id
  };
  
  try {
    await API.createClub(clubData);
    closeModal('create-club-modal');
    event.target.reset();
    await loadClubs();
    await loadClubsWidget();
    showNotification('Клубът е създаден!');
  } catch (error) {
    showError(error.message);
  }
}


async function handleDeleteClub(clubId) {
  if (!confirm('Сигурни ли сте, че искате да изтриете този клуб?')) return;
  try {
    await API.deleteClub(clubId, STATE.currentUser.id);
    showNotification('Клубът е изтрит.');

    // Refresh sidebar widget immediately
    try { await loadClubsWidget(); } catch {}

    navigateTo('clubs');
  } catch (error) {
    showError(error.message);
  }
}
