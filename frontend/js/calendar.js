// CALENDAR HANDLERS - ALL CALLABLE FROM HTML

async function loadCalendar() {
  if (!STATE.currentUser) return;
  
  const contentEl = document.getElementById('calendar-content');
  contentEl.innerHTML = '<div class="loading">Зареждане...</div>';
  
  try {
    const events = await API.getCalendar(STATE.currentUser.id);
    
    if (events.length === 0) {
      contentEl.innerHTML = '<div class="empty-state">Няма предстоящи събития</div>';
      return;
    }
    
    contentEl.innerHTML = events.map(event => `
      <div class="event-card ${event.event_type}" onclick="showEventDetail('${event.id}')">
        <div class="event-title">${escapeHtml(event.title)}</div>
        <div class="event-meta">
          📅 ${formatDate(event.event_date)}
          ${event.event_time ? ` · ${event.event_time}` : ''}
        </div>
        ${event.location ? `<div class="event-meta">📍 ${escapeHtml(event.location)}</div>` : ''}
        ${event.class_grade ? `<div class="event-meta">📚 ${event.class_grade}${event.class_letter} клас</div>` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error('Calendar error:', error);
    contentEl.innerHTML = '<div class="empty-state">Грешка при зареждане</div>';
  }
}

async function loadCalendarWidget() {
  if (!STATE.currentUser) return;
  
  try {
    const events = await API.getCalendar(STATE.currentUser.id);
    const widgetEl = document.getElementById('calendar-widget');
    
    if (events.length === 0) {
      widgetEl.innerHTML = '<div class="widget-item">Няма предстоящи събития</div>';
      return;
    }
    
    widgetEl.innerHTML = events.slice(0, 5).map(event => `
      <div class="widget-item" onclick="showEventDetail('${event.id}')">
        <div class="item-title">${escapeHtml(event.title)}</div>
        <div class="item-meta">${formatDate(event.event_date)}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Calendar widget error:', error);
  }
}

async function showEventDetail(eventId) {
  try {
    const event = await API.getEvent(eventId);
    const canDelete = (event.created_by === STATE.currentUser.id) || (STATE.currentUser.role === 'admin');

    document.getElementById('event-detail-title').textContent = event.title;
    document.getElementById('event-detail-body').innerHTML = `
      <div style="display: grid; gap: 12px;">
        <div><strong>Дата:</strong> ${formatDate(event.event_date)}</div>
        ${event.event_time ? `<div><strong>Час:</strong> ${event.event_time}</div>` : ''}
        ${event.location ? `<div><strong>Локация:</strong> ${escapeHtml(event.location)}</div>` : ''}
        ${event.event_type ? `<div><strong>Тип:</strong> ${getEventTypeLabel(event.event_type)}</div>` : ''}
        ${event.class_grade ? `<div><strong>Клас:</strong> ${event.class_grade}${event.class_letter}</div>` : '<div><strong>За:</strong> Цялото училище</div>'}
        ${event.description ? `<div><strong>Описание:</strong><br>${escapeHtml(event.description)}</div>` : ''}
        <div><strong>Създадено от:</strong> ${escapeHtml(event.created_by_name)}</div>
        ${canDelete ? `
          <div style="margin-top:8px;">
            <button class="btn btn-danger" onclick="handleDeleteEvent('${event.id}')">Изтрий събитието</button>
          </div>
        ` : ''}
      </div>
    `;
    
    showModal('event-detail-modal');
  } catch (error) {
    showError(error.message);
  }
}

function getEventTypeLabel(type) {
  const labels = {
    'event': 'Събитие',
    'meeting': 'Среща',
    'exam': 'Изпит',
    'holiday': 'Ваканция'
  };
  return labels[type] || type;
}

function showCreateEventModal() {
  showModal('create-event-modal');
}

async function handleCreateEvent(event) {
  event.preventDefault();
  
  const formData = new FormData(event.target);
  const eventData = {
    title: formData.get('title'),
    description: formData.get('description'),
    location: formData.get('location'),
    event_date: formData.get('event_date'),
    event_time: formData.get('event_time'),
    event_type: formData.get('event_type'),
    class_grade: formData.get('class_grade') || null,
    class_letter: formData.get('class_letter') || null,
    created_by: STATE.currentUser.id
  };
  
  try {
    await API.createEvent(eventData);
    closeModal('create-event-modal');
    event.target.reset();
    await loadCalendar();
    await loadCalendarWidget();
    showNotification('Събитието е създадено!');
  } catch (error) {
    showError(error.message);
  }
}


async function handleDeleteEvent(eventId) {
  if (!confirm('Сигурни ли сте, че искате да изтриете това събитие?')) return;
  try {
    await API.deleteEvent(eventId, STATE.currentUser.id);
    hideModal('event-detail-modal');
    showNotification('Събитието е изтрито.');
    await loadCalendar();
    await loadCalendarWidget();
  } catch (error) {
    showError(error.message);
  }
}


function populateEventTimeSelect() {
  const select = document.getElementById('event-time-select');
  if (!select) return;

  // Don't repopulate if already filled
  if (select.options && select.options.length > 0) return;

  // 24-hour options every 30 minutes: 00:00 → 23:30
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const value = `${hh}:${mm}`;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
  }

  // Default to next half-hour
  const now = new Date();
  const minutes = now.getMinutes();
  const next = minutes < 30 ? '30' : '00';
  const hour = (minutes < 30) ? now.getHours() : (now.getHours() + 1) % 24;
  const defaultValue = `${String(hour).padStart(2,'0')}:${next}`;
  select.value = defaultValue;
}

document.addEventListener('DOMContentLoaded', populateEventTimeSelect);
