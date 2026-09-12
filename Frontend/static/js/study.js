(function(){
  const setupView = document.getElementById('study-setup');
  const activeView = document.getElementById('study-active');
  const doneView = document.getElementById('study-done');

  const topicInput = document.getElementById('topic-input');
  const durationBtns = document.querySelectorAll('.duration-btn');
  const musicBtns = document.querySelectorAll('.music-btn');
  const videoToggle = document.getElementById('video-toggle');
  const videoIdInput = document.getElementById('video-id-input');
  const startBtn = document.getElementById('start-btn');

  const videoFrameWrap = document.getElementById('video-frame-wrap');
  const ytFrame = document.getElementById('yt-frame');
  const timerProgress = document.getElementById('timer-progress');
  const timerDisplay = document.getElementById('timer-display');
  const timerTopicLabel = document.getElementById('timer-topic-label');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const doneSummary = document.getElementById('done-summary');

  let selectedMinutes = 60;
  let selectedTrack = 'none';
  let topic = 'Study';
  let totalSeconds = 0;
  let remainingSeconds = 0;
  let timerInterval = null;
  let isPaused = false;
  const CIRCUMFERENCE = 2 * Math.PI * 90;

  durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      durationBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMinutes = parseInt(btn.dataset.minutes, 10);
    });
  });

  musicBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      musicBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTrack = btn.dataset.track;
    });
  });

  videoToggle.addEventListener('change', function(){
    videoIdInput.style.display = this.checked ? 'block' : 'none';
  });

  function extractYoutubeId(input){
    if(!input) return null;
    const match = input.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{11})/);
    if(match) return match[1];
    if(input.length === 11) return input;
    return null;
  }

  function playSelectedTrack(){
    if(selectedTrack === 'none') return;
    const audio = document.getElementById('audio-' + selectedTrack);
    if(audio){ audio.volume = 0.5; audio.play().catch(()=>{}); }
  }
  function stopAllTracks(){
    document.querySelectorAll('audio').forEach(a => { a.pause(); a.currentTime = 0; });
  }

  function formatTime(sec){
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateProgressRing(){
    const fraction = remainingSeconds / totalSeconds;
    timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
  }

  async function startSession(){
    topic = topicInput.value.trim() || 'Belajar';
    totalSeconds = selectedMinutes * 60;
    remainingSeconds = totalSeconds;

    timerTopicLabel.textContent = topic;
    timerDisplay.textContent = formatTime(remainingSeconds);
    timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    updateProgressRing();

    if(videoToggle.checked){
      const vid = extractYoutubeId(videoIdInput.value.trim()) || 'jfKfPfyJRdk'; // fallback: lofi study stream
      ytFrame.src = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1`;
      videoFrameWrap.style.display = 'block';
    }

    playSelectedTrack();

    try{
      await fetch('/api/study/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, planned_minutes: selectedMinutes })
      });
    }catch(e){ /* keep continuing if failed to send to server */ }

    setupView.style.display = 'none';
    activeView.style.display = 'flex';

    timerInterval = setInterval(() => {
      if(isPaused) return;
      remainingSeconds--;
      timerDisplay.textContent = formatTime(remainingSeconds);
      updateProgressRing();
      if(remainingSeconds <= 0){
        finishSession(true);
      }
    }, 1000);
  }

  startBtn.addEventListener('click', startSession);

  pauseBtn.addEventListener('click', function(){
    isPaused = !isPaused;
    this.textContent = isPaused ? '▶ Continue' : '⏸ Pause';
    document.querySelectorAll('audio').forEach(a => { if(isPaused) a.pause(); else if(a.id === 'audio-' + selectedTrack) a.play().catch(()=>{}); });
  });

  stopBtn.addEventListener('click', () => finishSession(false));

  async function finishSession(completed){
    clearInterval(timerInterval);
    stopAllTracks();

    const elapsedMinutes = Math.max(1, Math.round((totalSeconds - remainingSeconds) / 60));

    try{
      await fetch('/api/study/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_minutes: elapsedMinutes })
      });
    }catch(e){ /* keep continuing if failed to send to server */ }

    activeView.style.display = 'none';
    doneView.style.display = 'flex';
    doneSummary.textContent = completed
      ? `You are studying ${topic} for ${selectedMinutes} minutes. Keep it up!`
      : `You studied ${topic} for ${elapsedMinutes} minutes. Good job!`;
  }

  const floatBtn = document.getElementById('float-btn');
const motivationEl = document.getElementById('motivation-text');
const floatingContent = document.getElementById('floating-widget-content');
const originalParent = floatingContent ? floatingContent.parentElement : null;

const motivations = [
  "Keep focus, you can do it! 💪",
  "Almost there, don't give up!",
  "Small progress is still progress.",
  "You are stronger than your excuses.",
  "Focus for 10 more minutes, then take a break."
];
let motivationIndex = 0;
setInterval(() => {
  if(!motivationEl) return;
  motivationIndex = (motivationIndex + 1) % motivations.length;
  motivationEl.textContent = motivations[motivationIndex];
}, 15000);

if(floatBtn){
  floatBtn.addEventListener('click', async () => {
    if(!('documentPictureInPicture' in window)){
      alert('Browser kamu belum mendukung fitur ini. Pakai Chrome atau Edge versi terbaru ya.');
      return;
    }

    const pipWindow = await documentPictureInPicture.requestWindow({ width: 380, height: 260 });

    [...document.styleSheets].forEach(sheet => {
      try{
        const cssText = [...sheet.cssRules].map(r => r.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssText;
        pipWindow.document.head.appendChild(style);
      }catch(e){ /* skip cross-origin stylesheets if you have */ }
    });

    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.background = '#1D1B2C';
    pipWindow.document.body.appendChild(floatingContent);

    pipWindow.addEventListener('pagehide', () => {
      if(originalParent) originalParent.insertBefore(floatingContent, originalParent.firstChild);
    });
  });
}
})();