(function(){
  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  const dateInput = document.getElementById('todo-date-input');
  const activeList = document.getElementById('todo-list-active');
  const doneList = document.getElementById('todo-list-done');
  const emptyState = document.getElementById('todo-empty');

  function formatDue(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const diffDays = Math.round((d - today) / 86400000);
    const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return { label, overdue: diffDays < 0 };
  }

  function renderTodo(t){
    const item = document.createElement('div');
    item.className = 'todo-item' + (t.is_done ? ' done' : '');
    item.dataset.id = t.id;

    const check = document.createElement('div');
    check.className = 'todo-checkbox' + (t.is_done ? ' checked' : '');
    check.textContent = t.is_done ? '✓' : '';
    check.addEventListener('click', async () => {
      const newDone = !t.is_done;
      await fetch(`/api/todos/${t.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ is_done: newDone })
      });
      loadTodos();
    });

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = t.task;

    item.appendChild(check);
    item.appendChild(text);

    if(t.due_date){
      const due = formatDue(t.due_date);
      const dueSpan = document.createElement('span');
      dueSpan.className = 'todo-due' + (due.overdue && !t.is_done ? ' overdue' : '');
      dueSpan.textContent = due.label;
      item.appendChild(dueSpan);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'todo-delete-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async () => {
      await fetch(`/api/todos/${t.id}`, { method: 'DELETE' });
      loadTodos();
    });
    item.appendChild(delBtn);

    return item;
  }

  async function loadTodos(){
    const res = await fetch('/api/todos');
    const data = await res.json();
    if(data.status !== 'success') return;

    activeList.innerHTML = '';
    doneList.innerHTML = '';

    const active = data.todos.filter(t => !t.is_done);
    const done = data.todos.filter(t => t.is_done);

    active.forEach(t => activeList.appendChild(renderTodo(t)));
    done.forEach(t => doneList.appendChild(renderTodo(t)));

    emptyState.style.display = data.todos.length === 0 ? 'block' : 'none';
    document.querySelectorAll('.todo-section').forEach((sec, i) => {
      const list = i === 0 ? active : done;
      sec.style.display = list.length === 0 ? 'none' : 'block';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = input.value.trim();
    if(!task) return;

    await fetch('/api/todos', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ task, due_date: dateInput.value || null })
    });
    input.value = '';
    dateInput.value = '';
    loadTodos();
  });

  loadTodos();
})();