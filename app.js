const SAMPLE = `SRV-A114  host  edge  pdu2  58  c0  f09  cat6  2m
SRV-A115  host  edge  pdu1  58  c1  f12  cat6  2m
SRV-B201  stor  core  pdu2  61  c0  f09  sfp28 3m
SRV-B202  stor  core  pdu2  61  c3  f04  sfp28 3m
SRV-A116  host  edge  pdu1  58  c2  f12  cat6  1m
SRV-C330  host  mgmt  pdu1  64  c0  f04  cat6  2m
SRV-B203  stor  core  pdu1  61  c1  f09  sfp28 5m
SRV-C331  host  mgmt  pdu2  64  c2  f12  cat6  2m
SRV-A117  host  edge  pdu2  58  c3  f04  cat6  2m`;

const $ = id => document.getElementById(id);
const input = $('input'), fieldsEl = $('fields'), groupsEl = $('groups'), filterEl = $('filter');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let groupCol = store.get('rls.col', 6);
let thenCol = store.get('rls.then', null);
let done = new Set(store.get('rls.done', []));
input.value = store.get('rls.text', SAMPLE);
filterEl.value = store.get('rls.filter', '');

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const parse = () => input.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => ({ raw: l, f: l.split(/\s+/) }));
const esc = s => s.replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function renderFields(rows) {
  fieldsEl.innerHTML = '';
  if (!rows.length) { fieldsEl.innerHTML = '<span class="hint">Paste some lines first.</span>'; return; }
  const max = Math.max(...rows.map(r => r.f.length));
  const ref = rows[0].f;
  for (let i = 0; i < max; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (i === thenCol ? ' then' : '');
    b.setAttribute('aria-pressed', i === groupCol || i === thenCol);
    b.innerHTML = `<i>${i + 1}</i>${esc(ref[i] ?? '—')}`;
    b.title = i === groupCol ? 'Grouping by this field' : i === thenCol ? 'Sorting inside groups by this field' : '';
    b.onclick = () => {
      if (i === groupCol) { groupCol = thenCol ?? i; thenCol = null; }
      else if (i === thenCol) thenCol = null;
      else if (groupCol == null) groupCol = i;
      else if (thenCol == null) thenCol = i;
      else { groupCol = i; thenCol = null; }
      store.set('rls.col', groupCol); store.set('rls.then', thenCol);
      render();
    };
    fieldsEl.appendChild(b);
  }
}

let lastGroups = [];
function render() {
  const rows = parse();
  store.set('rls.text', input.value);
  if (rows.length && groupCol != null && groupCol >= Math.max(...rows.map(r => r.f.length))) groupCol = 0;
  renderFields(rows);

  const map = new Map();
  for (const r of rows) {
    const k = r.f[groupCol] ?? '(missing)';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const q = filterEl.value.trim().toLowerCase();
  let groups = [...map.entries()].sort((a, b) => collator.compare(a[0], b[0]));
  const total = groups.length;
  if (q) groups = groups.filter(([k]) => k.toLowerCase().includes(q));
  for (const [, list] of groups) {
    if (thenCol != null) list.sort((a, b) => collator.compare(a.f[thenCol] ?? '', b.f[thenCol] ?? '') || collator.compare(a.raw, b.raw));
  }
  lastGroups = groups;

  const shown = groups.reduce((n, [, l]) => n + l.length, 0);
  const shownDone = groups.reduce((n, [, l]) => n + l.filter(r => done.has(r.raw)).length, 0);
  $('summary').innerHTML = `<span><b>${rows.length}</b> lines</span><span><b>${total}</b> groups${q ? ` · <b>${groups.length}</b> match` : ''}</span><span><b>${shownDone}/${shown}</b> checked</span>`;

  $('jump').innerHTML = groups.length > 1 ? groups.map(([k, l], i) =>
    `<a href="#g${i}" class="${l.every(r => done.has(r.raw)) ? 'alldone' : ''}">${esc(k)} <span class="n">${l.length}</span></a>`).join('') : '';

  if (!rows.length) { groupsEl.innerHTML = '<div class="empty">Paste lines above. Each line is split into fields on spaces.</div>'; return; }
  if (!groups.length) { groupsEl.innerHTML = `<div class="empty">No group matches “${esc(q)}”.</div>`; return; }

  groupsEl.innerHTML = groups.map(([k, list], gi) => {
    const d = list.filter(r => done.has(r.raw)).length;
    return `<div class="group" id="g${gi}">
      <div class="ghead ${d === list.length ? 'complete' : ''}"><span class="gkey">${esc(k)}</span><span class="gcount">${d}/${list.length} done</span></div>
      <ul class="lines">${list.map(r => `<li data-raw="${esc(r.raw)}" class="${done.has(r.raw) ? 'done' : ''}" role="checkbox" aria-checked="${done.has(r.raw)}" tabindex="0"><span class="box"></span><span class="txt">${
        r.f.map((t, i) => i === groupCol || i === thenCol ? `<mark>${esc(t)}</mark>` : esc(t)).join(' ')
      }</span></li>`).join('')}</ul></div>`;
  }).join('');
}

function toggle(li) {
  const raw = li.dataset.raw;
  done.has(raw) ? done.delete(raw) : done.add(raw);
  store.set('rls.done', [...done]);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
groupsEl.addEventListener('click', e => { const li = e.target.closest('li'); if (li) toggle(li); });
groupsEl.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.matches('li')) { e.preventDefault(); toggle(e.target); } });

let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 150); });
filterEl.addEventListener('input', () => { store.set('rls.filter', filterEl.value); render(); });
$('clearBtn').onclick = () => { input.value = ''; render(); input.focus(); };
$('sampleBtn').onclick = () => { input.value = SAMPLE; groupCol = 6; thenCol = null; store.set('rls.col', 6); store.set('rls.then', null); render(); };
$('resetDone').onclick = () => { done = new Set(); store.set('rls.done', []); render(); };

function flash(msg) { $('toast').textContent = msg; setTimeout(() => $('toast').textContent = '', 2000); }
$('copyBtn').onclick = async () => {
  const text = lastGroups.map(([k, l]) => `== ${k} (${l.length}) ==\n` + l.map(r => r.raw).join('\n')).join('\n\n');
  try { await navigator.clipboard.writeText(text); flash('Copied grouped list'); }
  catch { flash('This browser blocked copying. Select the lines by hand instead.'); }
};

render();
