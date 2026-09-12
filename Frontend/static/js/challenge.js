(function(){
  document.querySelectorAll('.challenge-block').forEach(block => {
    const startBtn = block.querySelector('.challenge-start-btn');
    const quizArea = block.querySelector('.challenge-quiz-area');
    const challengeId = block.dataset.id;

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      quizArea.style.display = 'block';
      quizArea.innerHTML = '<div class="challenge-loading">AI lagi nyiapin soal...</div>';

      try{
        const res = await fetch(`/api/challenge/${challengeId}/start`, { method: 'POST' });
        const data = await res.json();

        if(data.status !== 'success'){
          quizArea.innerHTML = `<p class="challenge-loading">${data.message || 'Gagal memuat soal'}</p>`;
          startBtn.disabled = false;
          return;
        }

        renderQuiz(data.questions, quizArea, challengeId, startBtn);
      }catch(e){
        quizArea.innerHTML = '<p class="challenge-loading">Gagal terhubung ke server</p>';
        startBtn.disabled = false;
      }
    });
  });

  function renderQuiz(questions, container, challengeId, startBtn){
    container.innerHTML = '';
    let correctCount = 0;
    let answeredCount = 0;

    questions.forEach((q, qIndex) => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.style.marginTop = qIndex === 0 ? '0' : '10px';

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

          card.querySelectorAll('.quiz-option').forEach((b, i) => {
            if(i === q.correct_index) b.classList.add('correct');
            else if(i === optIndex) b.classList.add('incorrect');
          });
          if(optIndex === q.correct_index) correctCount++;
          explanation.classList.add('show');

          if(answeredCount === questions.length){
            finishQuiz();
          }
        });
        card.appendChild(btn);
      });

      card.appendChild(explanation);
      container.appendChild(card);
    });

    async function finishQuiz(){
      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'quiz-score';
      scoreDiv.textContent = `Your score: ${correctCount} / ${questions.length}`;
      container.appendChild(scoreDiv);

      await fetch(`/api/challenge/${challengeId}/submit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ score: correctCount, total: questions.length })
      });

      startBtn.disabled = false;
      startBtn.textContent = 'Retry';
    }
  }
})();