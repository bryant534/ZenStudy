(function(){
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let currentDate = new Date();
  let selectedHour = null;
  let dayEvents = [];

  const timeline = document.getElementById('schedule-timeline');
  const dayNameEl = document.getElementById('schedule-day-name');
  const dateFullEl = document.getElementById('schedule-date-full');
  const modalOverlay = document.getElementById('sch-modal-overlay');
  const modalHourEl = document.getElementById('sch-modal-hour');
  const timeInput = document.getElementById('sch-event-time');
  const textInput = document.getElementById('sch-event-text');
  const form = document.getElementById('sch-event-form');

  function dateKey(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function updateHeader(){
    dayNameEl.textContent = dayNames[currentDate.getDay()];
    dateFullEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }

  function renderTimeline(){
    timeline.innerHTML = '';
    for(let hour = 0; hour < 24; hour++){
      const row = document.createElement('div');
      row.className = 'schedule-hour-row';

      const label = document.createElement('div');
      label.className = 'schedule-hour-label';
      label.textContent = `${String(hour).padStart(2,'0')}:00`;
      row.appendChild(label);

      const content = document.createElement('div');
      content.className = 'schedule-hour-content';

      const hourEvents = dayEvents.filter(ev => parseInt(ev.time.split(':')[0], 10) === hour);
      hourEvents.forEach(ev => {
        const note = document.createElement('div');
        note.className = 'schedule-note';
        note.innerHTML = `<span class="schedule-note-text"></span><button class="schedule-note-delete">×</button>`;
        note.querySelector('.schedule-note-text').textContent = `${ev.time} — ${ev.title}`;
        note.querySelector('.schedule-note-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteEvent(ev.id);
        });
        note.addEventListener('click', () => openModal(hour, ev));
        content.appendChild(note);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'schedule-add-btn';
      addBtn.textContent = '+ Add activity';
      addBtn.addEventListener('click', () => openModal(hour, null));
      content.appendChild(addBtn);

      row.appendChild(content);
      timeline.appendChild(row);
    }
  }

  function openModal(hour, existingEvent){
    selectedHour = hour;
    modalHourEl.textContent = `${String(hour).padStart(2,'0')}:00`;
    if(existingEvent){
      timeInput.value = existingEvent.time;
      textInput.value = existingEvent.title;
      form.dataset.editId = existingEvent.id;
    } else {
      timeInput.value = `${String(hour).padStart(2,'0')}:00`;
      textInput.value = '';
      delete form.dataset.editId;
    }
    modalOverlay.classList.add('show');
  }
  function closeModal(){
    modalOverlay.classList.remove('show');
  }

  async function loadDayEvents(){
    const res = await fetch(`/api/day_events?date=${dateKey(currentDate)}`);
    const data = await res.json();
    dayEvents = data.status === 'success' ? data.events : [];
    renderTimeline();
  }

  async function deleteEvent(id){
    await fetch(`/api/calendar_events/${id}`, { method: 'DELETE' });
    loadDayEvents();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!timeInput.value || !textInput.value.trim()) return;

    if(form.dataset.editId){
      await fetch(`/api/calendar_events/${form.dataset.editId}`, { method: 'DELETE' });
    }

    await fetch('/api/calendar_events', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: dateKey(currentDate),
        time: timeInput.value,
        title: textInput.value.trim()
      })
    });

    closeModal();
    loadDayEvents();
  });

  document.getElementById('sch-modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

  document.getElementById('day-prev').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    updateHeader();
    loadDayEvents();
  });
  document.getElementById('day-next').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    updateHeader();
    loadDayEvents();
  });
  document.getElementById('day-today-btn').addEventListener('click', () => {
    currentDate = new Date();
    updateHeader();
    loadDayEvents();
  });

  updateHeader();
  loadDayEvents();
})();