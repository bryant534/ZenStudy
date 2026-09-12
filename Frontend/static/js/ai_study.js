(function(){
  const tabBtns = document.querySelectorAll('.tab-btn');
  const materialInput = document.getElementById('material-input');
  const countPicker = document.getElementById('count-picker');
  const countBtns = document.querySelectorAll('.count-btn');
  const askSection = document.getElementById('ask-section');
  const questionInput = document.getElementById('question-input');
  const generateBtn = document.getElementById('generate-btn');
  const errorText = document.getElementById('error-text');
  const loadingState = document.getElementById('loading-state');
  const resultSection = document.getElementById('result-section');

  let currentMode = 'quiz';
  let selectedCount = 5;

  const modeLabels = { quiz: 'Make a quiz', flashcard: 'Make Flashcard', summary: 'Summary', ask: 'Ask AI' };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;

      generateBtn.textContent = modeLabels[currentMode];
      countPicker.style.display = (currentMode === 'quiz' || currentMode === 'flashcard') ? 'flex' : 'none';
      askSection.style.display = currentMode === 'ask' ? 'block' : 'none';
      materialInput.placeholder = currentMode === 'ask'
        ? 'Add material (opsional)...'
        : 'Paste your material here...';

      resultSection.style.display = 'none';
      errorText.style.display = 'none';
    });
  });

  countBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      countBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCount = parseInt(btn.dataset.count, 10);
    });
  });

  function showError(msg){
    errorText.textContent = msg;
    errorText.style.display = 'block';
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderQuiz(data){
    resultSection.innerHTML = '';
    let correctCount = 0;
    let answeredCount = 0;

    data.questions.forEach((q, qIndex) => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      const qDiv = document.createElement('div');
      qDiv.className = 'quiz-question';
      qDiv.textContent = `${qIndex + 1}. ${q.question}`;
      card.appendChild(qDiv);

      const explanation = document.createElement('div');
      explanation.className = 'quiz-explanation';
      explanation.textContent = q.explanation || '';

      q.options.forEach((opt, optIndex) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          if(card.dataset.answered) return;
          card.dataset.answered = 'true';
          answeredCount++;

          const allOptBtns = card.querySelectorAll('.quiz-option');
          allOptBtns.forEach((b, i) => {
            if(i === q.correct_index) b.classList.add('correct');
            else if(i === optIndex) b.classList.add('incorrect');
          });
          if(optIndex === q.correct_index) correctCount++;
          explanation.classList.add('show');

          if(answeredCount === data.questions.length){
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'quiz-score';
            scoreDiv.textContent = `Your score: ${correctCount} / ${data.questions.length}`;
            resultSection.appendChild(scoreDiv);
          }
        });
        card.appendChild(btn);
      });

      card.appendChild(explanation);
      resultSection.appendChild(card);
    });
  }

  function renderFlashcards(data){
    resultSection.innerHTML = '';
    const cards = data.cards;
    let currentIndex = 0;

    const wrap = document.createElement('div');
    wrap.className = 'flashcard-wrap';
    wrap.innerHTML = `
      <div class="flashcard" id="fc-el">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front" id="fc-front"></div>
          <div class="flashcard-face flashcard-back" id="fc-back"></div>
        </div>
      </div>
      <div class="flashcard-nav">
        <button id="fc-prev">←</button>
        <span id="fc-counter">1 / ${cards.length}</span>
        <button id="fc-next">→</button>
      </div>
      <span style="font-size:11.5px;color:var(--ink-soft);">Tap kartu untuk membalik</span>
    `;
    resultSection.appendChild(wrap);

    const fcEl = document.getElementById('fc-el');
    const fcFront = document.getElementById('fc-front');
    const fcBack = document.getElementById('fc-back');
    const fcCounter = document.getElementById('fc-counter');

    function showCard(i){
      fcEl.classList.remove('flipped');
      fcFront.textContent = cards[i].front;
      fcBack.textContent = cards[i].back;
      fcCounter.textContent = `${i + 1} / ${cards.length}`;
    }
    showCard(0);

    fcEl.addEventListener('click', () => fcEl.classList.toggle('flipped'));
    document.getElementById('fc-prev').addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + cards.length) % cards.length;
      showCard(currentIndex);
    });
    document.getElementById('fc-next').addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % cards.length;
      showCard(currentIndex);
    });
  }

  function renderSummary(data){
    resultSection.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'summary-box';

    const lines = data.summary.split('\n').filter(l => l.trim() !== '');
    let html = '';
    let inList = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      const formatted = escapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if(trimmed.startsWith('- ')){
        if(!inList){ html += '<ul>'; inList = true; }
        html += `<li>${formatted.slice(2)}</li>`;
      } else {
        if(inList){ html += '</ul>'; inList = false; }
        html += `<p>${formatted}</p>`;
      }
    });
    if(inList) html += '</ul>';

    box.innerHTML = html;
    resultSection.appendChild(box);
  }

  function renderAsk(data){
    resultSection.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'ask-answer-box';
    box.textContent = data.answer;
    resultSection.appendChild(box);
  }

  generateBtn.addEventListener('click', async () => {
    errorText.style.display = 'none';

    const material = materialInput.value.trim();
    const question = questionInput.value.trim();

    if(currentMode !== 'ask' && !material){
      showError('Tempel materi belajarmu dulu ya');
      return;
    }
    if(currentMode === 'ask' && !question){
      showError('Tulis pertanyaannya dulu ya');
      return;
    }

    generateBtn.disabled = true;
    loadingState.style.display = 'flex';
    resultSection.style.display = 'none';

    try{
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ mode: currentMode, material, question, count: selectedCount })
      });
      const data = await res.json();

      if(data.status !== 'success'){
        showError(data.message || 'Terjadi kesalahan, coba lagi');
        return;
      }

      resultSection.style.display = 'block';
      if(currentMode === 'quiz') renderQuiz(data.result);
      else if(currentMode === 'flashcard') renderFlashcards(data.result);
      else if(currentMode === 'summary') renderSummary(data.result);
      else if(currentMode === 'ask') renderAsk(data.result);

    }catch(e){
      showError('Failed to connect to server, please try again');
    }finally{
      generateBtn.disabled = false;
      loadingState.style.display = 'none';
    }
  });
})();