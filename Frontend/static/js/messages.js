(function(){
  const listPanel = document.getElementById('msg-list-panel');
  const chatPanel = document.getElementById('msg-chat-panel');
  const backBtn = document.getElementById('msg-back-btn');
  const convItems = document.querySelectorAll('.msg-conv-item');
  const chatName = document.getElementById('chat-name');
  const chatAvatar = document.getElementById('chat-avatar');
  const bubbleArea = document.getElementById('msg-bubble-area');
  const inputForm = document.getElementById('msg-input-form');
  const input = document.getElementById('msg-input');
  const searchInput = document.getElementById('msg-search');

  function isMobile(){ return window.innerWidth <= 720; }

  convItems.forEach(item => {
    item.addEventListener('click', function(){
      convItems.forEach(i => i.classList.remove('active'));
      this.classList.add('active');

      chatName.textContent = this.dataset.name;
      chatAvatar.textContent = this.dataset.avatar;

      // NOTE: ini masih dummy — nanti diganti fetch riwayat chat asli dari backend
      // berdasarkan this.dataset.id

      if(isMobile()){
        listPanel.classList.add('hide');
        chatPanel.classList.add('show');
      }
    });
  });

  backBtn.addEventListener('click', function(){
    listPanel.classList.remove('hide');
    chatPanel.classList.remove('show');
  });

  inputForm.addEventListener('submit', function(e){
    e.preventDefault();
    const text = input.value.trim();
    if(!text) return;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble me';
    const now = new Date();
    const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    bubble.innerHTML = `<p></p><span class="bubble-time">${time}</span>`;
    bubble.querySelector('p').textContent = text;

    bubbleArea.appendChild(bubble);
    bubbleArea.scrollTop = bubbleArea.scrollHeight;
    input.value = '';

    // NOTE: Haven't sent it to the backend yet—just need to add a POST fetch to `/api/messages` once that's ready.
  });

  searchInput.addEventListener('input', function(){
    const q = this.value.toLowerCase();
    convItems.forEach(item => {
      const match = item.dataset.name.toLowerCase().includes(q);
      item.style.display = match ? 'flex' : 'none';
    });
  });
})();