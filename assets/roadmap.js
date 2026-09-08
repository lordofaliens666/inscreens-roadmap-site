/* InScreens roadmap — rendering, editing, persistence.
   Data comes from data/<key>.js as window.ROADMAP. Working state lives in
   localStorage; "Экспорт" writes a fresh data file to commit back to the repo. */

(function () {
  'use strict';

  var DATA = window.ROADMAP;
  if (!DATA) { document.body.innerHTML = '<p style="padding:40px">Не загружен файл данных.</p>'; return; }

  var KEY = 'inscreens.roadmap.' + DATA.key + '.v1';
  var STATUS = { todo: 'Не начато', wip: 'В работе', done: 'Готово' };

  // ---------- state ----------
  var S = load();

  function fresh() {
    return JSON.parse(JSON.stringify({
      key: DATA.key, rev: DATA.rev || 1, title: DATA.title, lede: DATA.lede, accent: DATA.accent,
      facts: DATA.facts || [], stages: DATA.stages
    }));
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); if (s && Array.isArray(s.stages)) return s; }
    } catch (e) {}
    return fresh();
  }

  // Файл роадмапа мог обновиться уже после того, как человек начал его вести.
  // Тогда берём тексты из файла, а отметки — из браузера, по совпадающим id.
  function mergeFromFile(saved) {
    var progress = {};
    saved.stages.forEach(function (st) {
      st.tasks.forEach(function (t) {
        progress[t.id] = {
          status: t.status, blocker: t.blocker,
          subs: (t.subs || []).reduce(function (a, s) { a[s.id] = s.done; return a; }, {})
        };
      });
    });
    var seen = {};
    var next = fresh();
    next.stages.forEach(function (st) {
      st.tasks.forEach(function (t) {
        seen[t.id] = true;
        var p = progress[t.id];
        if (!p) return;
        t.status = p.status;
        if (p.blocker !== undefined) t.blocker = p.blocker;
        (t.subs || []).forEach(function (s) { if (p.subs[s.id] !== undefined) s.done = p.subs[s.id]; });
      });
    });
    // задачи, добавленные в браузере, не теряем
    saved.stages.forEach(function (st) {
      var target = next.stages.filter(function (x) { return x.id === st.id; })[0]
        || next.stages[next.stages.length - 1];
      st.tasks.forEach(function (t) { if (!seen[t.id]) target.tasks.push(t); });
    });
    return next;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  var UI = { edit: false, hideDone: false, open: {} };
  try { UI = Object.assign(UI, JSON.parse(localStorage.getItem(KEY + '.ui') || '{}')); } catch (e) {}
  function saveUI() { try { localStorage.setItem(KEY + '.ui', JSON.stringify(UI)); } catch (e) {} }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rich(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }
  function statusOf(t) {
    if (t.status === 'done') return 'done';
    var subs = t.subs || [];
    if (subs.length) {
      var d = subs.filter(function (s) { return s.done; }).length;
      if (d === subs.length && d > 0) return 'done';
      if (d > 0) return 'wip';
    }
    return t.status || 'todo';
  }
  function allTasks() {
    return S.stages.reduce(function (a, st) { return a.concat(st.tasks); }, []);
  }
  function findTask(id) {
    for (var i = 0; i < S.stages.length; i++) {
      var t = S.stages[i].tasks.filter(function (x) { return x.id === id; })[0];
      if (t) return { task: t, stage: S.stages[i] };
    }
    return null;
  }

  var CHECK = '<svg viewBox="0 0 12 12"><path d="M2 6.3 4.6 9 10 3"/></svg>';
  var CARET = '<svg class="caret" width="13" height="13" viewBox="0 0 12 12" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

  // ---------- render ----------
  function taskHTML(t, stage, idx, len) {
    var st = statusOf(t);
    var subs = t.subs || [];
    var done = subs.filter(function (s) { return s.done; }).length;
    var ed = UI.edit;
    return '' +
      '<article class="card ' + st + (UI.open[t.id] ? ' open' : '') + '" data-id="' + t.id + '">' +
        '<div class="card-head" data-act="toggle">' +
          '<button class="mark" data-act="cycle" aria-label="Сменить статус" title="Сменить статус">' +
            (st === 'done' ? CHECK : '') + '</button>' +
          '<div class="card-title">' +
            '<h3' + (ed ? ' contenteditable="true" data-act="edit-title"' : '') + '>' + esc(t.title) + '</h3>' +
            '<div class="card-meta">' +
              (t.blocker ? '<span class="tag blocker">Блокер</span>' : '') +
              '<span class="tag st-' + st + '">' + STATUS[st] + '</span>' +
              (subs.length ? '<span class="prog">' + done + '/' + subs.length + '</span>' : '') +
            '</div>' +
          '</div>' + CARET +
        '</div>' +
        '<div class="card-body">' +
          (t.notes || []).map(function (n, i) {
            return '<div class="note-row"><p class="note' + (n.slice(0, 2) === '! ' ? ' flag' : '') + '"' +
              (ed ? ' contenteditable="true" data-act="edit-note" data-i="' + i + '"' : '') + '>' +
              rich(n.slice(0, 2) === '! ' ? n.slice(2) : n) + '</p>' +
              (ed ? '<button class="x" data-act="delnote" data-i="' + i + '" title="Удалить абзац">✕</button>' : '') +
              '</div>';
          }).join('') +
          (subs.length
            ? '<ul class="subs">' + subs.map(function (s) {
                return '<li class="' + (s.done ? 'on' : '') + '">' +
                  '<input type="checkbox" ' + (s.done ? 'checked' : '') + ' data-act="sub" data-sub="' + s.id + '" aria-label="' + esc(s.t) + '">' +
                  '<span class="txt"' + (ed ? ' contenteditable="true" data-act="edit-sub" data-sub="' + s.id + '"' : '') + '>' + esc(s.t) + '</span>' +
                  '<button class="x" data-act="delsub" data-sub="' + s.id + '" title="Удалить">✕</button></li>';
              }).join('') + '</ul>'
            : '<p class="hint">Подзадач нет.</p>') +
          '<div class="row-add">' +
            '<input class="line" placeholder="Добавить подзадачу…" data-act="subinput">' +
            '<button class="mini" data-act="addsub">Добавить</button>' +
          '</div>' +
          '<div class="card-foot">' +
            (ed ? '<button class="mini" data-act="addnote">+ Абзац</button>' : '') +
            (ed ? '<button class="mini" data-act="blocker">' + (t.blocker ? '− Снять блокер' : '⚑ Блокер') + '</button>' : '') +
            '<button class="mini" data-act="up"' + (idx === 0 ? ' disabled' : '') + '>↑ Выше</button>' +
            '<button class="mini" data-act="down"' + (idx === len - 1 ? ' disabled' : '') + '>↓ Ниже</button>' +
            '<button class="mini del" data-act="deltask">Удалить задачу</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render() {
    document.documentElement.setAttribute('data-accent', S.accent || 'teal');
    document.body.classList.toggle('edit', UI.edit);

    var host = document.getElementById('stages');
    host.innerHTML = S.stages.map(function (stage, si) {
      var visible = stage.tasks.filter(function (t) {
        return !(UI.hideDone && statusOf(t) === 'done');
      });
      var done = stage.tasks.filter(function (t) { return statusOf(t) === 'done'; }).length;
      var pc = stage.tasks.length ? Math.round(done / stage.tasks.length * 100) : 0;
      return '<section class="stage" data-stage="' + stage.id + '">' +
        '<div class="stage-head">' +
          '<span class="stage-n">' + String(si + 1).padStart(2, '0') + '</span>' +
          '<h2' + (UI.edit ? ' contenteditable="true" data-act="edit-stage"' : '') + '>' + esc(stage.name) + '</h2>' +
          '<div class="stage-bar"><i style="width:' + pc + '%"></i></div>' +
          '<span class="stage-count">' + done + '/' + stage.tasks.length + '</span>' +
        '</div>' +
        (stage.note ? '<p class="stage-note"' + (UI.edit ? ' contenteditable="true" data-act="edit-stagenote"' : '') + '>' + rich(stage.note) + '</p>' : '') +
        '<div class="stage-list">' +
          (visible.length
            ? visible.map(function (t) {
                return taskHTML(t, stage, stage.tasks.indexOf(t), stage.tasks.length);
              }).join('')
            : '<div class="empty">' + (stage.tasks.length ? 'Всё выполнено.' : 'Задач нет.') + '</div>') +
          '<div class="row-add"><input class="line" placeholder="Добавить задачу в этап…" data-act="taskinput">' +
            '<button class="mini" data-act="addtask">Добавить</button></div>' +
        '</div></section>';
    }).join('');

    var tasks = allTasks();
    var doneN = tasks.filter(function (t) { return statusOf(t) === 'done'; }).length;
    var pct = tasks.length ? Math.round(doneN / tasks.length * 100) : 0;
    document.getElementById('pct').textContent = pct + '%';
    document.getElementById('totalTxt').textContent = doneN + ' из ' + tasks.length + ' задач';
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('editBtn').classList.toggle('on', UI.edit);
    document.getElementById('editBtn').textContent = UI.edit ? '✓ Редактирование' : 'Редактировать';
    document.getElementById('hideBtn').textContent = UI.hideDone ? 'Показать выполненные' : 'Скрыть выполненные';
    save(); saveUI();
  }

  // ---------- events ----------
  document.getElementById('stages').addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    var act = el && el.dataset.act;
    var stageEl = e.target.closest('[data-stage]');
    var stage = stageEl && S.stages.filter(function (s) { return s.id === stageEl.dataset.stage; })[0];
    var cardEl = e.target.closest('.card');
    var t = cardEl ? findTask(cardEl.dataset.id).task : null;

    if (act === 'addtask' || (act === 'taskinput' && false)) {
      var ti = stageEl.querySelector('[data-act="taskinput"]');
      if (ti.value.trim()) {
        var id = uid();
        stage.tasks.push({ id: id, title: ti.value.trim(), status: 'todo', notes: [], subs: [] });
        UI.open[id] = true; render();
      }
      return;
    }
    if (!t) return;

    if (act === 'cycle') {
      e.stopPropagation();
      var cur = statusOf(t);
      t.status = cur === 'todo' ? 'wip' : cur === 'wip' ? 'done' : 'todo';
      if (t.status === 'done') (t.subs || []).forEach(function (s) { s.done = true; });
      if (t.status === 'todo') (t.subs || []).forEach(function (s) { s.done = false; });
      return render();
    }
    if (act === 'toggle') {
      if (UI.edit && e.target.closest('[contenteditable]')) return;
      UI.open[t.id] = !UI.open[t.id]; return render();
    }
    if (act === 'sub') {
      var s = t.subs.filter(function (x) { return x.id === el.dataset.sub; })[0];
      s.done = el.checked;
      if (t.status === 'done' && !s.done) t.status = 'wip';
      return render();
    }
    if (act === 'delsub') {
      t.subs = t.subs.filter(function (x) { return x.id !== el.dataset.sub; }); return render();
    }
    if (act === 'addsub') {
      var inp = cardEl.querySelector('[data-act="subinput"]');
      if (inp.value.trim()) { t.subs.push({ id: uid(), t: inp.value.trim(), done: false }); render(); }
      return;
    }
    if (act === 'addnote') { t.notes = t.notes || []; t.notes.push('Новый абзац'); return render(); }
    if (act === 'delnote') { t.notes.splice(+el.dataset.i, 1); return render(); }
    if (act === 'blocker') { t.blocker = !t.blocker; return render(); }
    if (act === 'up' || act === 'down') {
      var arr = findTask(t.id).stage.tasks, i = arr.indexOf(t), j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return;
      arr.splice(i, 1); arr.splice(j, 0, t); return render();
    }
    if (act === 'deltask') {
      if (confirm('Удалить задачу «' + t.title + '»?')) {
        var st2 = findTask(t.id).stage;
        st2.tasks = st2.tasks.filter(function (x) { return x !== t; }); render();
      }
      return;
    }
  });

  document.getElementById('stages').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var a = e.target.dataset.act;
    if (a === 'subinput') { e.preventDefault(); e.target.closest('.card').querySelector('[data-act="addsub"]').click(); }
    if (a === 'taskinput') { e.preventDefault(); e.target.closest('[data-stage]').querySelector('[data-act="addtask"]').click(); }
    if (e.target.isContentEditable && a !== 'edit-note' && a !== 'edit-stagenote') { e.preventDefault(); e.target.blur(); }
  });

  // inline editing: commit on blur
  document.getElementById('stages').addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.dataset || !el.isContentEditable) return;
    var act = el.dataset.act, txt = el.innerText.trim();
    var cardEl = el.closest('.card');
    var stageEl = el.closest('[data-stage]');
    var stage = stageEl && S.stages.filter(function (s) { return s.id === stageEl.dataset.stage; })[0];

    if (act === 'edit-stage' && stage) { if (txt) stage.name = txt; return render(); }
    if (act === 'edit-stagenote' && stage) { stage.note = txt; return render(); }
    if (!cardEl) return;
    var t = findTask(cardEl.dataset.id).task;
    if (act === 'edit-title') { if (txt) t.title = txt; return render(); }
    if (act === 'edit-sub') {
      var s = t.subs.filter(function (x) { return x.id === el.dataset.sub; })[0];
      if (txt) s.t = txt; return render();
    }
    if (act === 'edit-note') {
      var i = +el.dataset.i, was = t.notes[i], flag = was.slice(0, 2) === '! ';
      t.notes[i] = (flag ? '! ' : '') + txt;
      return render();
    }
  });

  document.getElementById('editBtn').addEventListener('click', function () { UI.edit = !UI.edit; render(); });
  document.getElementById('hideBtn').addEventListener('click', function () { UI.hideDone = !UI.hideDone; render(); });
  document.getElementById('addStage').addEventListener('click', function () {
    var n = prompt('Название этапа:');
    if (n && n.trim()) { S.stages.push({ id: uid(), name: n.trim(), note: '', tasks: [] }); render(); }
  });
  document.getElementById('resetBtn').addEventListener('click', function () {
    if (confirm('Вернуть роадмап к версии из файла data/' + DATA.key + '.js? Все изменения в браузере пропадут.')) {
      S = fresh(); UI.open = {}; render();
    }
  });

  // ---------- export / import ----------
  function fileText() {
    return '/* InScreens roadmap data — ' + S.title + '\n' +
      '   Отредактировано в браузере и выгружено ' + new Date().toISOString().slice(0, 10) + '.\n' +
      '   Можно править прямо здесь: текст задач, абзацы (**жирный**, "! " в начале = врезка), подзадачи. */\n\n' +
      'window.ROADMAP = ' + JSON.stringify(S, null, 2) + ';\n';
  }
  var dlg = document.getElementById('dlg');
  function showExport(txt, name) {
    document.getElementById('dlgText').value = txt;
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) {}
    dlg.showModal();
  }
  document.getElementById('exportBtn').addEventListener('click', function () {
    // On the password-gated site the export is re-encrypted, so plaintext
    // never leaves the browser. Without a gate it is the plain data file.
    if (window.__GATE && window.__GATE.encryptFile) {
      window.__GATE.encryptFile(S).then(function (txt) {
        showExport(txt, DATA.key + '.enc.js');
      }, function (err) { alert('Не удалось зашифровать: ' + err.message); });
    } else {
      showExport(fileText(), DATA.key + '.js');
    }
  });
  document.getElementById('dlgCopy').addEventListener('click', function () {
    var ta = document.getElementById('dlgText');
    ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value);
    else document.execCommand('copy');
    this.textContent = 'Скопировано';
    var b = this; setTimeout(function () { b.textContent = 'Скопировать'; }, 1500);
  });
  document.getElementById('dlgApply').addEventListener('click', function () {
    var raw = document.getElementById('dlgText').value;
    var m = raw.indexOf('{');
    try {
      var obj = JSON.parse(raw.slice(m, raw.lastIndexOf('}') + 1));
      if (!obj.stages) throw new Error('нет stages');
      S = obj; dlg.close(); render();
    } catch (err) { alert('Не разобрал JSON: ' + err.message); }
  });
  document.getElementById('dlgClose').addEventListener('click', function () { dlg.close(); });

  // ---------- theme ----------
  var themeBtn = document.getElementById('themeBtn');
  try {
    var saved = localStorage.getItem('inscreens.roadmap.theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {}
  themeBtn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var isDark = cur ? cur === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('inscreens.roadmap.theme', next); } catch (e) {}
  });

  // ---------- update notice ----------
  function updateNotice() {
    if (!DATA.rev || S.rev === DATA.rev) return;
    var bar = document.createElement('div');
    bar.className = 'notice';
    bar.innerHTML = '<p>Файл роадмапа обновился — в нём есть задачи, которых нет в вашей версии. ' +
      'Обновление берёт тексты из файла, а ваши статусы и галочки переносит по совпадающим задачам; ' +
      'задачи, добавленные вами в браузере, остаются.</p>' +
      '<div class="notice-act"><button class="btn" id="noticeYes">Обновить</button>' +
      '<button class="btn ghost" id="noticeNo">Оставить как есть</button></div>';
    var host = document.getElementById('stages');
    host.parentNode.insertBefore(bar, host);
    bar.querySelector('#noticeYes').addEventListener('click', function () {
      S = mergeFromFile(S); bar.remove(); render();
    });
    bar.querySelector('#noticeNo').addEventListener('click', function () {
      S.rev = DATA.rev; bar.remove(); save();
    });
  }

  // ---------- head ----------
  document.getElementById('rTitle').innerHTML = rich(S.title);
  document.getElementById('rLede').textContent = S.lede || '';
  var facts = document.getElementById('facts');
  if (S.facts && S.facts.length) {
    facts.innerHTML = '<dl>' + S.facts.map(function (f) {
      return '<dt>' + esc(f.k) + '</dt><dd>' + rich(f.v) + '</dd>';
    }).join('') + '</dl>';
  } else if (facts) {
    facts.remove();
  }

  render();
  updateNotice();
})();
