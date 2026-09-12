let timeLeft = localStorage.getItem("timeLeft") || 1500;
        let timerId;
        let isRunning = false;
        let timeStudied = 0;

        function updateDisplay() {
            let minutes = Math.floor(timeLeft / 60);
            let seconds = timeLeft % 60;
            document.getElementById("time-display").innerText = 
                (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
        }

        function startTimer() {
            if (!isRunning) {
                isRunning = true;
                timerId = setInterval(() => {
                    if(timeLeft > 0) {
                        timeLeft--;
                        timeStudied++;
                        updateDisplay();
                    } else {
                        clearInterval(timerId);
                        isRunning = false;
                        alert("Time is up! Great job focusing.");
                        saveStudyData();
                    }
                }, 1000);
            }
        }

        function stopTimer() { 
            clearInterval(timerId); 
            isRunning = false; 
            if (timeStudied >= 900) {
                saveStudyData(); 
            }
        }
        
        function saveStudyData() {
            let minutesStudied = Math.floor(timeStudied / 60);
            if (minutesStudied < 1) return;

            fetch('/save_study_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ duration_minutes: minutesStudied })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Study time saved:", data);
                timeStudied = 0; 
            })
            .catch(error => console.error('Error:', error));
        }

function toggleSidebar(){
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
    }
document.getElementById('overlay').addEventListener('click', toggleSidebar);

// Search launcher
const searchInput = document.getElementById('app-search');
const searchResults = document.getElementById('search-results');
if(searchInput){
  searchInput.addEventListener('focus', () => searchResults.classList.add('show'));
  searchInput.addEventListener('input', function(){
    const q = this.value.toLowerCase().trim();
    searchResults.querySelectorAll('a').forEach(a => {
      const match = a.dataset.keywords.includes(q) || a.textContent.toLowerCase().includes(q);
      a.classList.toggle('hidden', q.length > 0 && !match);
    });
  });
  document.addEventListener('click', function(e){
    if(!e.target.closest('.search-box')) searchResults.classList.remove('show');
  });
}

// Mini preview calendar in workspace card
const miniNums = document.getElementById('mini-cal-nums');
const miniLabel = document.getElementById('mini-cal-label');

if(miniNums){
  const monthNames = [
    "Januari","Februari","Maret","April",
    "Mei","Juni","Juli","Agustus",
    "September","Oktober","November","Desember"
  ];

  const now = new Date();

  miniLabel.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  // sum of a day in this month
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  // start from yesterday
  const startDay = Math.max(1, now.getDate() - 1);


  for(let i = startDay; i <= Math.min(startDay + 3, daysInMonth); i++){
    const span = document.createElement('span');
    span.textContent = i;
    miniNums.appendChild(span);
  }
}

// Mini preview 1 week in calendar block
const weekPreview = document.getElementById('mini-week-preview');
if(weekPreview){
  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());

  for(let i = 0; i < 7; i++){
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();

    const cell = document.createElement('div');
    cell.className = 'mw-cell' + (isToday ? ' today' : '');
    cell.innerHTML = `<span class="mw-day">${dayLabels[i]}</span><span class="mw-date">${d.getDate()}</span>`;
    weekPreview.appendChild(cell);
  }
}

// Live timer for people who are currently studying in the workspace
const activeItems = document.querySelectorAll('.active-study-item');
function formatDuration(totalSeconds){
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(h > 0 ? m : m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
activeItems.forEach(item => {
  let seconds = parseInt(item.dataset.seconds, 10) || 0;
  const timerEl = item.querySelector('.active-timer');
  timerEl.textContent = formatDuration(seconds);
  setInterval(() => {
    seconds++;
    timerEl.textContent = formatDuration(seconds);
  }, 1000);
});

(function(){
  window.toggleSidebar = function(){
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  };
  const overlay = document.getElementById('overlay');
  if(overlay) overlay.addEventListener('click', () => window.toggleSidebar());

  const searchInput = document.getElementById('app-search');
  const searchResults = document.getElementById('search-results');
  if(searchInput){
    searchInput.addEventListener('focus', () => searchResults.classList.add('show'));
    searchInput.addEventListener('input', function(){
      const q = this.value.toLowerCase().trim();
      searchResults.querySelectorAll('a').forEach(a => {
        const match = a.dataset.keywords.includes(q) || a.textContent.toLowerCase().includes(q);
        a.classList.toggle('hidden', q.length > 0 && !match);
      });
    });
    document.addEventListener('click', e => { if(!e.target.closest('.search-box')) searchResults.classList.remove('show'); });
  }

  const weekPreview = document.getElementById('mini-week-preview');
  if(weekPreview){
    const dayLabels = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    for(let i = 0; i < 7; i++){
      const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
      const isToday = d.toDateString() === now.toDateString();
      const cell = document.createElement('div');
      cell.className = 'mw-cell' + (isToday ? ' today' : '');
      cell.innerHTML = `<span class="mw-day">${dayLabels[i]}</span><span class="mw-date">${d.getDate()}</span>`;
      weekPreview.appendChild(cell);
    }
  }

  function formatDuration(totalSeconds){
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  const activeList = document.getElementById('active-study-list');
  let localTimers = {};

  function tickAll(){
    document.querySelectorAll('.active-study-item').forEach(item => {
      let seconds = parseInt(item.dataset.seconds, 10) || 0;
      seconds++;
      item.dataset.seconds = seconds;
      const timerEl = item.querySelector('.active-timer');
      if(timerEl) timerEl.textContent = formatDuration(seconds);
    });
  }
  document.querySelectorAll('.active-study-item').forEach(item => {
    const timerEl = item.querySelector('.active-timer');
    if(timerEl) timerEl.textContent = formatDuration(parseInt(item.dataset.seconds,10) || 0);
  });
  setInterval(tickAll, 1000);

  async function refreshActiveList(){
    try{
      const res = await fetch('/api/active_sessions');
      const data = await res.json();
      if(data.status !== 'success') return;

      activeList.innerHTML = '';
      if(data.active_list.length === 0){
        activeList.innerHTML = '<p class="empty-state"> No one is studying right now.</p>';
        return;
      }
      data.active_list.forEach(a => {
        const div = document.createElement('div');
        div.className = 'active-study-item';
        div.dataset.seconds = a.elapsed_seconds;
        div.innerHTML = `
          <div class="msg-avatar">${a.username[0].toUpperCase()}</div>
          <div class="active-study-info"><strong>${a.username}</strong><span class="active-topic">${a.topic}</span></div>
          <div class="active-timer-wrap"><span class="live-dot"></span><span class="active-timer">${formatDuration(a.elapsed_seconds)}</span></div>
        `;
        activeList.appendChild(div);
      });
    }catch(e){ /* let it if it's failed to fetch, let the old data */ }
  }
  if(activeList) setInterval(refreshActiveList, 20000);
})();