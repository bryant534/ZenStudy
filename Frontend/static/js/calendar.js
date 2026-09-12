(function(){
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  let today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed
  let selectedDateKey = null;
  let eventsCache = {}; // { "2026-09-04": [{id, title, time}, ...] }

  const gridEl = document.getElementById('cal-grid');
  const titleEl = document.getElementById('cal-title');
  const modalOverlay = document.getElementById('cal-modal-overlay');
  const modalDateEl = document.getElementById('cal-modal-date');
  const eventListEl = document.getElementById('cal-event-list');
  const form = document.getElementById('cal-event-form');
  const timeInput = document.getElementById('cal-event-time');
  const textInput = document.getElementById('cal-event-text');

  function dateKey(y,m,d){
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  async function fetchMonthEvents(){
    const res = await fetch(`/api/calendar_events?year=${viewYear}&month=${viewMonth + 1}`);
    const data = await res.json();
    eventsCache = data.status === 'success' ? data.events : {};
    renderCalendar();
  }

  function renderCalendar(){
    titleEl.textContent = `${monthNames[viewMonth]} ${viewYear}`;
    gridEl.innerHTML = '';

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for(let i = 0; i < totalCells; i++){
      const dayNum = i - firstDay + 1;
      let cellYear = viewYear, cellMonth = viewMonth, cellDay = dayNum, outside = false;

      if(dayNum < 1){
        cellMonth = (viewMonth - 1 + 12) % 12;
        cellYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        cellDay = daysInPrevMonth + dayNum;
        outside = true;
      } else if(dayNum > daysInMonth){
        cellMonth = (viewMonth + 1) % 12;
        cellYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        cellDay = dayNum - daysInMonth;
        outside = true;
      }

      const key = dateKey(cellYear, cellMonth, cellDay);
      const isToday = key === dateKey(today.getFullYear(), today.getMonth(), today.getDate());

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (outside ? ' outside' : '') + (isToday ? ' today' : '');
      cell.dataset.key = key;
      cell.dataset.y = cellYear; cell.dataset.m = cellMonth; cell.dataset.d = cellDay;

      const num = document.createElement('div');
      num.className = 'date-num';
      num.textContent = cellDay;
      cell.appendChild(num);

      const dayEvents = (eventsCache[key] || []).slice().sort((a,b)=>a.time.localeCompare(b.time));
      dayEvents.slice(0,2).forEach(ev=>{
        const chip = document.createElement('div');
        chip.className = 'cal-chip';
        chip.textContent = `${ev.time} ${ev.title}`;
        cell.appendChild(chip);
      });
      if(dayEvents.length > 2){
        const more = document.createElement('div');
        more.className = 'cal-chip-more';
        more.textContent = `+${dayEvents.length - 2} lagi`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => openModal(key, cellYear, cellMonth, cellDay));
      gridEl.appendChild(cell);
    }
  }

  function openModal(key, y, m, d){
    selectedDateKey = key;
    modalDateEl.textContent = `${d} ${monthNames[m]} ${y}`;
    renderEventList();
    timeInput.value = '';
    textInput.value = '';
    modalOverlay.classList.add('show');
  }
  function closeModal(){
    modalOverlay.classList.remove('show');
  }

  function renderEventList(){
    const list = (eventsCache[selectedDateKey] || []).slice().sort((a,b)=>a.time.localeCompare(b.time));
    eventListEl.innerHTML = '';
    if(list.length === 0){
      eventListEl.innerHTML = '<li style="justify-content:center;color:var(--ink-soft)">Belum ada kegiatan</li>';
      return;
    }
    list.forEach(ev => {
      const li = document.createElement('li');
      li.innerHTML = `<span><span class="ev-time">${ev.time}</span>${ev.title}</span>`;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => deleteEvent(ev.id));
      li.appendChild(delBtn);
      eventListEl.appendChild(li);
    });
  }

  async function deleteEvent(eventId){
    await fetch(`/api/calendar_events/${eventId}`, { method: 'DELETE' });
    eventsCache[selectedDateKey] = (eventsCache[selectedDateKey] || []).filter(ev => ev.id !== eventId);
    renderEventList();
    renderCalendar();
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!timeInput.value || !textInput.value.trim()) return; // jam & kegiatan wajib

    const res = await fetch('/api/calendar_events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDateKey,
        time: timeInput.value,
        title: textInput.value.trim()
      })
    });
    const data = await res.json();
    if(data.status !== 'success'){
      alert(data.message || 'Failed to save event');
      return;
    }

    if(!eventsCache[selectedDateKey]) eventsCache[selectedDateKey] = [];
    eventsCache[selectedDateKey].push(data.event);

    timeInput.value = '';
    textInput.value = '';
    renderEventList();
    renderCalendar();
  });

  document.getElementById('cal-modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function(e){
    if(e.target === modalOverlay) closeModal();
  });

  document.getElementById('cal-prev').addEventListener('click', function(){
    viewMonth--; if(viewMonth < 0){ viewMonth = 11; viewYear--; }
    fetchMonthEvents();
  });
  document.getElementById('cal-next').addEventListener('click', function(){
    viewMonth++; if(viewMonth > 11){ viewMonth = 0; viewYear++; }
    fetchMonthEvents();
  });
  document.getElementById('cal-today-btn').addEventListener('click', function(){
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    fetchMonthEvents();
  });

  fetchMonthEvents();
})();