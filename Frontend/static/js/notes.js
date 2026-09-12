(function(){
  const listView = document.getElementById('notes-list-view');
  const editorView = document.getElementById('note-editor-view');
  const notesGrid = document.getElementById('notes-grid');
  const notesEmpty = document.getElementById('notes-empty');
  const searchInput = document.getElementById('notes-search');
  const newNoteBtn = document.getElementById('new-note-btn');
  const backBtn = document.getElementById('editor-back-btn');
  const titleInput = document.getElementById('note-title-input');
  const contentInput = document.getElementById('note-content-input');
  const editorStatus = document.getElementById('editor-status');
  const pinBtn = document.getElementById('pin-note-btn');
  const deleteBtn = document.getElementById('delete-note-btn');
  const colorBar = document.getElementById('color-bar');

  let allNotes = [];
  let currentNoteId = null;
  let currentColor = 'default';
  let currentPinned = false;
  let saveTimeout = null;

  function timeAgo(dateStr){
    const diffSec = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z')) / 1000);
    if(diffSec < 60) return 'just now';
    if(diffSec < 3600) return Math.floor(diffSec/60) + ' minutes ago';
    if(diffSec < 86400) return Math.floor(diffSec/3600) + ' hours ago';
    return Math.floor(diffSec/86400) + ' days ago';
  }

  function renderNotes(notes){
    notesGrid.innerHTML = '';
    notesEmpty.style.display = notes.length === 0 ? 'block' : 'none';

    notes.forEach(n => {
      const card = document.createElement('div');
      card.className = 'note-card' + (n.color !== 'default' ? ` color-${n.color}` : '');
      card.innerHTML = `
        <div class="note-card-title"></div>
        <div class="note-card-snippet"></div>
        <div class="note-card-footer">
          <span class="note-card-time"></span>
          <span class="note-pin-icon">${n.pinned ? '📌' : ''}</span>
        </div>
      `;
      card.querySelector('.note-card-title').textContent = n.title || '(Tanpa judul)';
      card.querySelector('.note-card-snippet').textContent = n.content;
      card.querySelector('.note-card-time').textContent = timeAgo(n.updated_at);
      card.addEventListener('click', () => openEditor(n));
      notesGrid.appendChild(card);
    });
  }

  async function loadNotes(){
    const res = await fetch('/api/notes');
    const data = await res.json();
    if(data.status === 'success'){
      allNotes = data.notes;
      renderNotes(allNotes);
    }
  }

  searchInput.addEventListener('input', function(){
    const q = this.value.toLowerCase();
    const filtered = allNotes.filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
    renderNotes(filtered);
  });

  function openEditor(note){
    currentNoteId = note.id;
    currentColor = note.color;
    currentPinned = note.pinned;
    titleInput.value = note.title;
    contentInput.value = note.content;
    editorStatus.textContent = 'Tersimpan';
    updateColorSelection();
    updatePinIcon();
    listView.style.display = 'none';
    editorView.style.display = 'block';
  }

  function closeEditor(){
    editorView.style.display = 'none';
    listView.style.display = 'block';
    loadNotes();
  }

  function updateColorSelection(){
    colorBar.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', sw.dataset.color === currentColor);
    });
  }
  function updatePinIcon(){
    pinBtn.textContent = currentPinned ? '📌' : '📍';
  }

  async function saveNote(){
    if(!currentNoteId) return;
    editorStatus.textContent = 'Saving...';
    await fetch(`/api/notes/${currentNoteId}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        title: titleInput.value,
        content: contentInput.value,
        color: currentColor,
        pinned: currentPinned
      })
    });
    editorStatus.textContent = 'Saved';
  }

  function scheduleSave(){
    editorStatus.textContent = 'Typing...';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 800);
  }

  titleInput.addEventListener('input', scheduleSave);
  contentInput.addEventListener('input', scheduleSave);

  colorBar.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      currentColor = sw.dataset.color;
      updateColorSelection();
      saveNote();
    });
  });

  pinBtn.addEventListener('click', () => {
    currentPinned = !currentPinned;
    updatePinIcon();
    saveNote();
  });

  deleteBtn.addEventListener('click', async () => {
    if(!confirm('Delete this note?')) return;
    await fetch(`/api/notes/${currentNoteId}`, { method: 'DELETE' });
    closeEditor();
  });

  backBtn.addEventListener('click', async () => {
    clearTimeout(saveTimeout);
    await saveNote();
    closeEditor();
  });

  newNoteBtn.addEventListener('click', async () => {
    const res = await fetch('/api/notes', { method: 'POST' });
    const data = await res.json();
    if(data.status === 'success'){
      openEditor({ id: data.note_id, title: '', content: '', color: 'default', pinned: false, updated_at: new Date().toISOString() });
      titleInput.focus();
    }
  });

  loadNotes();
})();