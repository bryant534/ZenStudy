(function(){
  const tabBtns = document.querySelectorAll('.tab-btn');
  const feedPanel = document.getElementById('tab-feed');
  const chatPanel = document.getElementById('tab-chat');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      feedPanel.classList.toggle('active', target === 'feed');
      chatPanel.classList.toggle('active', target === 'chat');
      if(target === 'chat') scrollChatToBottom();
    });
  });

  // ================= FEED =================
  const postInput = document.getElementById('post-input');
  const postSubmitBtn = document.getElementById('post-submit-btn');
  const postList = document.getElementById('post-list');

  function timeAgo(dateStr){
    const diffSec = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z')) / 1000);
    if(diffSec < 60) return 'just now';
    if(diffSec < 3600) return Math.floor(diffSec/60) + ' minutes ago';
    if(diffSec < 86400) return Math.floor(diffSec/3600) + ' hours ago';
    return Math.floor(diffSec/86400) + ' days ago';
  }

  function renderPost(p){
    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="post-head">
        <div class="msg-avatar">${p.username[0].toUpperCase()}</div>
        <div><strong>${p.username}</strong><br><span>${timeAgo(p.created_at)}</span></div>
      </div>
      <div class="post-content"></div>
      <div class="post-actions">
        <button class="post-action-btn like-btn ${p.liked_by_me ? 'liked' : ''}">❤️ <span class="like-count">${p.like_count}</span></button>
        <button class="post-action-btn comment-toggle-btn">💬 <span class="comment-count">${p.comment_count}</span></button>
      </div>
      <div class="comment-section">
        <div class="comment-list"></div>
        <div class="comment-input-row">
          <input type="text" class="comment-input" placeholder="Tulis komentar...">
          <button class="comment-send-btn">Kirim</button>
        </div>
      </div>
    `;
    card.querySelector('.post-content').textContent = p.content;

    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', async () => {
      const res = await fetch(`/api/posts/${p.id}/like`, { method: 'POST' });
      const data = await res.json();
      if(data.status === 'success'){
        likeBtn.classList.toggle('liked', data.liked);
        likeBtn.querySelector('.like-count').textContent = data.like_count;
      }
    });

    const commentSection = card.querySelector('.comment-section');
    const commentList = card.querySelector('.comment-list');
    const commentToggleBtn = card.querySelector('.comment-toggle-btn');

    async function loadComments(){
      const res = await fetch(`/api/posts/${p.id}/comments`);
      const data = await res.json();
      commentList.innerHTML = '';
      if(data.status === 'success'){
        data.comments.forEach(c => {
          const div = document.createElement('div');
          div.className = 'comment-item';
          div.innerHTML = `<strong></strong><span></span>`;
          div.querySelector('strong').textContent = c.username + ':';
          div.querySelector('span').textContent = c.content;
          commentList.appendChild(div);
        });
      }
    }

    commentToggleBtn.addEventListener('click', () => {
      commentSection.classList.toggle('show');
      if(commentSection.classList.contains('show')) loadComments();
    });

    const commentInput = card.querySelector('.comment-input');
    card.querySelector('.comment-send-btn').addEventListener('click', async () => {
      const text = commentInput.value.trim();
      if(!text) return;
      const res = await fetch(`/api/posts/${p.id}/comments`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ content: text })
      });
      const data = await res.json();
      if(data.status === 'success'){
        commentInput.value = '';
        loadComments();
        const countEl = card.querySelector('.comment-count');
        countEl.textContent = parseInt(countEl.textContent, 10) + 1;
      }
    });

    return card;
  }

  async function loadPosts(){
    const res = await fetch('/api/posts');
    const data = await res.json();
    if(data.status !== 'success') return;
    postList.innerHTML = '';
    data.posts.forEach(p => postList.appendChild(renderPost(p)));
  }

  postSubmitBtn.addEventListener('click', async () => {
    const text = postInput.value.trim();
    if(!text) return;
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content: text })
    });
    const data = await res.json();
    if(data.status === 'success'){
      postInput.value = '';
      loadPosts();
    }
  });

  loadPosts();

  // ================= CHAT =================
  const bubbleArea = document.getElementById('chat-bubble-area');
  const chatForm = document.getElementById('chat-input-form');
  const chatInput = document.getElementById('chat-input');
  let lastMessageId = 0;

  function scrollChatToBottom(){
    bubbleArea.scrollTop = bubbleArea.scrollHeight;
  }

  function renderMessage(m){
    const isMe = m.username === window.CURRENT_USERNAME;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (isMe ? 'me' : 'other');
    bubble.innerHTML = `<span class="bubble-author"></span><span class="bubble-text"></span>`;
    bubble.querySelector('.bubble-author').textContent = m.username;
    bubble.querySelector('.bubble-text').textContent = m.content;
    bubbleArea.appendChild(bubble);
    lastMessageId = Math.max(lastMessageId, m.id);
  }

  async function pollChat(){
    try{
      const res = await fetch(`/api/chat_messages?since_id=${lastMessageId}`);
      const data = await res.json();
      if(data.status === 'success' && data.messages.length > 0){
        data.messages.forEach(renderMessage);
        scrollChatToBottom();
      }
    }catch(e){ /* retry again in the next poll */ }
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if(!text) return;
    chatInput.value = '';
    await fetch('/api/chat_messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content: text })
    });
    pollChat();
  });

  pollChat();
  setInterval(pollChat, 3000);
})();