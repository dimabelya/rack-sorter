'use strict';

// Rack Line Sorter
//
// Takes a pasted list of space-separated lines, groups them by one column,
// and lets you tick each line off. Everything is kept in this browser only.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE = [
  'SRV-A114  host  edge  pdu2  58  c0  f09  cat6   2m',
  'SRV-A115  host  edge  pdu1  58  c1  f12  cat6   2m',
  'SRV-B201  stor  core  pdu2  61  c0  f09  sfp28  3m',
  'SRV-B202  stor  core  pdu2  61  c3  f04  sfp28  3m',
  'SRV-A116  host  edge  pdu1  58  c2  f12  cat6   1m',
  'SRV-C330  host  mgmt  pdu1  64  c0  f04  cat6   2m',
  'SRV-B203  stor  core  pdu1  61  c1  f09  sfp28  5m',
  'SRV-C331  host  mgmt  pdu2  64  c2  f12  cat6   2m',
  'SRV-A117  host  edge  pdu2  58  c3  f04  cat6   2m',
].join('\n');

// Column 7 of the sample (index 6) is the "f09" field, so the example opens
// grouped the way the example is meant to be read.
const SAMPLE_GROUP_COLUMN = 6;

// Group name used for lines that are too short to have the chosen column.
const MISSING = '(no value)';

const STORAGE_KEY = 'rack-sorter';

// The highlighter colours, in the order they appear in the palette. 'clear'
// is handled separately: it is an eraser, not a colour, so it is never stored.
const COLOURS = ['red', 'green', 'yellow'];

// Notes are meant to be a few words, so the input stops accepting text here
// rather than silently cutting a long one short.
const NOTE_MAX = 120;

// Sorts "f04" before "f09" before "f12", and "rack2" before "rack10",
// because numeric:true compares digit runs as numbers instead of text.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Page elements
// ---------------------------------------------------------------------------

const el = {
  text:    document.getElementById('text'),
  clear:   document.getElementById('clear'),
  example: document.getElementById('example'),
  fields:  document.getElementById('fields'),
  sortBy:  document.getElementById('sortBy'),
  filter:  document.getElementById('filter'),
  summary: document.getElementById('summary'),
  uncheck: document.getElementById('uncheck'),
  copy:    document.getElementById('copy'),
  status:  document.getElementById('status'),
  hl:        document.getElementById('hl'),
  hlButton:  document.getElementById('hlButton'),
  hlLabel:   document.getElementById('hlLabel'),
  hlPalette: document.getElementById('hlPalette'),
  jump:    document.getElementById('jump'),
  groups:  document.getElementById('groups'),
};

// ---------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------

// Three pieces of per-line data, all keyed by line.key:
//   done   - a Set of ticked lines
//   notes  - a Map of line -> note text
//   colors - a Map of line -> highlighter colour
// Sets and Maps are converted on the way in and out, because JSON has no
// way to represent either one.
const state = loadState();

function loadState() {
  const fresh = {
    text: SAMPLE,
    groupBy: SAMPLE_GROUP_COLUMN,
    sortBy: null,
    filter: '',
    done: new Set(),
    notes: new Map(),
    colors: new Map(),
  };

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null; // unreadable or corrupt - fall back to a fresh state
  }
  if (saved === null || typeof saved !== 'object') return fresh;

  // Every field is checked, so a half-written or hand-edited entry in storage
  // can never put the app into a broken state.
  return {
    text:    typeof saved.text === 'string' ? saved.text : fresh.text,
    groupBy: isColumn(saved.groupBy) ? saved.groupBy : 0,
    sortBy:  isColumn(saved.sortBy) ? saved.sortBy : null,
    filter:  typeof saved.filter === 'string' ? saved.filter : '',
    done:    new Set(Array.isArray(saved.done) ? saved.done.filter(k => typeof k === 'string') : []),
    notes:   readMap(saved.notes, text => typeof text === 'string' && text.trim() !== '',
                                  text => text.slice(0, NOTE_MAX)),
    colors:  readMap(saved.colors, colour => COLOURS.includes(colour), colour => colour),
  };
}

// Rebuilds a Map from a stored plain object, keeping only the entries that
// pass `accept`. Anything else in storage is dropped rather than trusted.
function readMap(stored, accept, clean) {
  const map = new Map();
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return map;

  for (const [key, value] of Object.entries(stored)) {
    if (typeof key === 'string' && accept(value)) map.set(key, clean(value));
  }
  return map;
}

function isColumn(value) {
  return Number.isInteger(value) && value >= 0;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      text:    state.text,
      groupBy: state.groupBy,
      sortBy:  state.sortBy,
      filter:  state.filter,
      done:    [...state.done],
      notes:   Object.fromEntries(state.notes),
      colors:  Object.fromEntries(state.colors),
    }));
  } catch {
    setStatus('Could not save to this browser. Your work will be lost if you reload.');
  }
}

// Notes are typed a character at a time, and rewriting the whole of storage
// on every keystroke would be wasteful, so those writes are batched.
let saveTimer;

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 300);
}

// Writes a batched save out early, so closing the tab right after typing a
// note cannot lose it.
function flushSave() {
  clearTimeout(saveTimer);
  saveState();
}

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

// ---------------------------------------------------------------------------
// Reading the pasted text
// ---------------------------------------------------------------------------

// Turns the textarea into line objects:
//   raw    - the line with outer whitespace removed, spacing inside kept
//   fields - the line split into columns
//   key    - the identity used to remember a tick
//
// The key is the line text plus how many times that exact text has already
// appeared. Two identical lines therefore get keys "...\n0" and "...\n1" and
// tick independently, and because a trimmed line can never contain a newline
// the two parts can never be confused with each other.
function parseLines(text) {
  const timesSeen = new Map();
  const lines = [];

  for (const rawLine of text.split('\n')) {
    const raw = rawLine.trim(); // also removes the \r of Windows line endings
    if (raw === '') continue;

    const n = timesSeen.get(raw) || 0;
    timesSeen.set(raw, n + 1);

    lines.push({ raw, fields: raw.split(/\s+/), key: raw + '\n' + n });
  }
  return lines;
}

function columnCountOf(lines) {
  return lines.reduce((most, line) => Math.max(most, line.fields.length), 0);
}

// Keeps the chosen columns inside the range the current text actually has.
function clampColumns(columnCount) {
  const before = state.groupBy + ':' + state.sortBy;

  if (state.groupBy >= columnCount) state.groupBy = 0;
  if (state.sortBy !== null && (state.sortBy >= columnCount || state.sortBy === state.groupBy)) {
    state.sortBy = null;
  }
  if (state.groupBy + ':' + state.sortBy !== before) saveState();
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

// Returns [{ key, lines }], groups sorted by name and, if a sort column is
// chosen, lines sorted inside each group.
function buildGroups(lines) {
  const byName = new Map();

  for (const line of lines) {
    const name = line.fields[state.groupBy] ?? MISSING;
    let group = byName.get(name);
    if (group === undefined) {
      group = { key: name, lines: [] };
      byName.set(name, group);
    }
    group.lines.push(line);
  }

  const groups = [...byName.values()].sort((a, b) => collator.compare(a.key, b.key));

  if (state.sortBy !== null) {
    for (const group of groups) {
      group.lines.sort((a, b) =>
        collator.compare(a.fields[state.sortBy] ?? '', b.fields[state.sortBy] ?? '') ||
        collator.compare(a.raw, b.raw));
    }
  }
  return groups;
}

function filterGroups(groups) {
  const needle = state.filter.trim().toLowerCase();
  if (needle === '') return groups;
  return groups.filter(group => group.key.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// What is on screen right now. Each entry keeps the nodes that have to be
// refreshed when a tick changes, so ticking never redraws the whole list.
let view = [];

// Totals for the summary line.
let totals = { lines: 0, groups: 0, shownGroups: 0 };

function render() {
  const lines = parseLines(state.text);
  const columnCount = columnCountOf(lines);
  clampColumns(columnCount);

  drawChips(lines, columnCount);
  drawSortOptions(lines, columnCount); // may clear an impossible sort column

  const groups = buildGroups(lines);
  const shown = filterGroups(groups);

  totals = { lines: lines.length, groups: groups.length, shownGroups: shown.length };

  drawGroups(shown, lines.length);
  drawJump(shown);
  refreshTicks();
}

// One chip per column, labelled with the column number and the value that
// column holds on the first line, as a reminder of what the column is.
function drawChips(lines, columnCount) {
  el.fields.replaceChildren();

  if (columnCount === 0) {
    el.fields.append(makeHint('Paste some lines first.'));
    return;
  }

  const chips = [];
  for (let i = 0; i < columnCount; i++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(i === state.groupBy));
    chip.append(
      makeSpan(String(i + 1), 'chip-num'),
      makeSpan(lines[0].fields[i] ?? '-'),
    );
    chip.addEventListener('click', () => {
      state.groupBy = i;
      if (state.sortBy === i) state.sortBy = null;
      saveState();
      render();
      // render() rebuilt the chips, so focus the fresh copy of this one.
      el.fields.children[i]?.focus();
    });
    chips.push(chip);
  }
  el.fields.append(...chips);
}

function drawSortOptions(lines, columnCount) {
  el.sortBy.replaceChildren();
  el.sortBy.append(makeOption('As pasted', ''));

  for (let i = 0; i < columnCount; i++) {
    if (i === state.groupBy) continue; // sorting by the group column does nothing
    el.sortBy.append(makeOption(`Column ${i + 1} (${lines[0].fields[i] ?? '-'})`, String(i)));
  }

  el.sortBy.value = state.sortBy === null ? '' : String(state.sortBy);

  // If the wanted column is not in the list, the assignment above leaves the
  // select on "As pasted"; make the state agree with what is displayed.
  if (el.sortBy.value === '' && state.sortBy !== null) {
    state.sortBy = null;
    saveState();
  }

  el.sortBy.disabled = columnCount === 0;
}

function drawGroups(groups, lineCount) {
  el.groups.replaceChildren();
  view = [];

  if (lineCount === 0) {
    el.groups.append(makeEmpty('Paste lines above. Each line is split into columns on spaces.'));
    return;
  }
  if (groups.length === 0) {
    el.groups.append(makeEmpty(`No group name contains "${state.filter.trim()}".`));
    return;
  }

  for (const group of groups) {
    const count = makeSpan('', 'group-count');

    const head = document.createElement('div');
    head.className = 'group-head';
    head.append(makeSpan(group.key, 'group-key'), count);

    const list = document.createElement('ul');
    list.className = 'lines';
    for (const line of group.lines) list.append(makeLineItem(line));

    const section = document.createElement('section');
    section.className = 'group';
    section.append(head, list);

    el.groups.append(section);
    view.push({ group, section, head, count, jump: null });
  }
}

// A real <input type="checkbox"> inside a <label>, so the whole row is
// clickable and the keyboard and screen reader behaviour comes from the
// browser rather than from code here.
//
// The note field sits in the row but OUTSIDE the label on purpose: anything
// inside the label would tick the line when tapped.
function makeLineItem(line) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.done.has(line.key);

  const item = document.createElement('li');
  item.classList.toggle('done', box.checked);

  const label = document.createElement('label');
  label.append(box, makeLineText(line));
  item.append(label, makeNoteField(line));

  paintRow(item, state.colors.get(line.key));

  // Tapping a row means "colour this line" while the highlighter is armed,
  // and "tick this line" otherwise. Cancelling the click stops the box from
  // changing, which also means no 'change' event and no tick.
  //
  // This listener is on the checkbox rather than the label because clicking a
  // label makes the browser dispatch a second click on its control: a handler
  // on the label would see every tap twice. It also means the keyboard is
  // covered for free, since Space on a focused checkbox fires a click too.
  box.addEventListener('click', event => {
    if (armed === null) return;
    event.preventDefault();
    applyColour(line, item);
  });

  box.addEventListener('change', () => {
    if (box.checked) state.done.add(line.key);
    else state.done.delete(line.key);

    item.classList.toggle('done', box.checked);
    saveState();
    refreshTicks();
  });

  return item;
}

// A quiet one-line text field at the right-hand end of the row. It has no
// border of its own until it is hovered or focused, so a list with no notes
// in it looks exactly as it did before.
function makeNoteField(line) {
  const note = document.createElement('input');
  note.type = 'text';
  note.className = 'note';
  note.maxLength = NOTE_MAX;
  note.value = state.notes.get(line.key) ?? '';
  note.autocomplete = 'off';
  note.spellcheck = false;
  note.setAttribute('aria-label', 'Note');
  showNote(note);

  note.addEventListener('input', () => {
    // The trimmed value decides whether a note exists, but the untrimmed one
    // is what gets stored, so the field always shows exactly what is saved.
    if (note.value.trim() === '') state.notes.delete(line.key);
    else state.notes.set(line.key, note.value);

    showNote(note);
    queueSave();
  });

  note.addEventListener('change', flushSave);
  note.addEventListener('keydown', event => {
    if (event.key === 'Enter') note.blur();
  });

  return note;
}

function showNote(note) {
  note.classList.toggle('filled', note.value !== '');
  note.title = note.value;   // the whole note, for one too long to fit
}

// Puts a row into exactly one colour class, or none. `colour` is undefined
// for a line that has never been highlighted.
function paintRow(item, colour) {
  for (const name of COLOURS) item.classList.toggle('hl-' + name, name === colour);
  item.classList.toggle('hl', colour !== undefined);
}

// Prints the line with its original spacing, highlighting the group column
// and the sort column. Splitting on /(\s+)/ keeps the runs of spaces as their
// own pieces, so nothing about the layout is lost.
function makeLineText(line) {
  const span = makeSpan('', 'line-text');
  let column = 0;

  for (const piece of line.raw.split(/(\s+)/)) {
    if (piece === '') continue;

    if (/^\s/.test(piece)) {
      span.append(piece); // whitespace: copy it through untouched
      continue;
    }
    if (column === state.groupBy || column === state.sortBy) {
      const mark = document.createElement('mark');
      mark.textContent = piece;
      span.append(mark);
    } else {
      span.append(piece);
    }
    column++;
  }
  return span;
}

function drawJump(groups) {
  el.jump.replaceChildren();
  if (groups.length < 2) return;

  for (const entry of view) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jump-item';
    button.append(
      makeSpan(entry.group.key),
      makeSpan(String(entry.group.lines.length), 'jump-count'),
    );
    button.addEventListener('click', () => {
      entry.section.scrollIntoView({ block: 'start' });
    });

    entry.jump = button;
    el.jump.append(button);
  }
}

// Recounts the ticks and updates every number and "finished" mark on screen.
// Called after each tick instead of redrawing, so the page does not jump and
// the keyboard does not lose its place.
function refreshTicks() {
  let shownLines = 0;
  let shownTicked = 0;

  for (const entry of view) {
    const total = entry.group.lines.length;
    const ticked = entry.group.lines.reduce((n, line) => n + (state.done.has(line.key) ? 1 : 0), 0);

    entry.count.textContent = `${ticked}/${total} done`;
    entry.head.classList.toggle('complete', ticked === total);
    entry.jump?.classList.toggle('complete', ticked === total);

    shownLines += total;
    shownTicked += ticked;
  }

  const parts = [
    makeCount(String(totals.lines), totals.lines === 1 ? 'line' : 'lines'),
    makeCount(String(totals.groups), totals.groups === 1 ? 'group' : 'groups'),
  ];
  if (totals.shownGroups !== totals.groups) {
    parts.push(makeCount(String(totals.shownGroups), 'shown'));
  }
  parts.push(makeCount(`${shownTicked}/${shownLines}`, 'ticked'));

  el.summary.replaceChildren(...parts);
}

// ---------------------------------------------------------------------------
// Small node builders
//
// Every piece of pasted text reaches the page through .textContent or
// .append(string), which the browser always treats as text. No HTML is ever
// built from strings, so a line containing < or & cannot affect the page.
// ---------------------------------------------------------------------------

// Note the default of '': assigning textContent unconditionally matters,
// because a column whose value is the string '0' is falsy in JavaScript and
// a `if (text)` test here would have silently dropped it.
function makeSpan(text = '', className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

function makeCount(number, label) {
  const span = makeSpan();
  const bold = document.createElement('b');
  bold.textContent = number;
  span.append(bold, ' ' + label);
  return span;
}

function makeOption(text, value) {
  const option = document.createElement('option');
  option.textContent = text;
  option.value = value;
  return option;
}

function makeHint(text) {
  return makeSpan(text, 'hint');
}

function makeEmpty(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

let statusTimer;

function setStatus(message) {
  el.status.textContent = message;
  clearTimeout(statusTimer);
  if (message !== '') {
    statusTimer = setTimeout(() => { el.status.textContent = ''; }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Highlighter
//
// `armed` is the colour that tapping a row will apply: null for off, 'clear'
// to erase, or one of COLOURS. It is deliberately NOT saved, so a reload
// always comes back in normal ticking mode and the ticks cannot be a trap.
// ---------------------------------------------------------------------------

let armed = null;
let paletteOpen = false;

function setArmed(colour) {
  armed = colour;
  closePalette();
  document.body.classList.toggle('is-highlighting', armed !== null);

  if (armed === null) {
    el.hlButton.removeAttribute('data-colour');
    el.hlButton.classList.remove('armed');
    el.hlLabel.textContent = 'Highlight';
    setStatus('Highlighter off. Tapping a line ticks it again.');
    return;
  }

  el.hlButton.dataset.colour = armed;
  el.hlButton.classList.add('armed');
  el.hlLabel.textContent = armed === 'clear' ? 'Erase' : capitalise(armed);
  setStatus(armed === 'clear'
    ? 'Erase on. Tap lines to remove their colour.'
    : `Highlighter: ${armed}. Tap lines to colour them.`);
}

function applyColour(line, item) {
  if (armed === 'clear') state.colors.delete(line.key);
  else state.colors.set(line.key, armed);

  paintRow(item, state.colors.get(line.key));
  saveState();
}

// Rebuilt each time it opens, so the pressed swatch and the presence of the
// off switch always match the real state.
function drawPalette() {
  el.hlPalette.replaceChildren();

  for (const colour of [...COLOURS, 'clear']) {
    el.hlPalette.append(makeSwatchButton(colour));
  }

  if (armed !== null) {
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'hl-stop';
    stop.textContent = 'Stop highlighting';
    stop.addEventListener('click', () => setArmed(null));
    el.hlPalette.append(stop);
  }
}

function makeSwatchButton(colour) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hl-swatch-button';
  button.dataset.colour = colour;
  button.setAttribute('aria-pressed', String(armed === colour));
  button.append(
    makeSpan('', 'hl-swatch'),
    makeSpan(colour === 'clear' ? 'Clear colour' : capitalise(colour)),
  );
  button.addEventListener('click', () => setArmed(colour));
  return button;
}

function openPalette() {
  drawPalette();
  paletteOpen = true;
  el.hlPalette.hidden = false;
  el.hlButton.setAttribute('aria-expanded', 'true');
}

function closePalette() {
  paletteOpen = false;
  el.hlPalette.hidden = true;
  el.hlButton.setAttribute('aria-expanded', 'false');
}

function capitalise(word) {
  return word[0].toUpperCase() + word.slice(1);
}

el.hlButton.addEventListener('click', () => {
  if (paletteOpen) closePalette();
  else openPalette();
});

// A tap anywhere else on the page closes the palette. The highlighter stays
// armed: only the menu closes.
document.addEventListener('click', event => {
  if (paletteOpen && event.target instanceof Node && !el.hl.contains(event.target)) closePalette();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;

  // Escape while writing a note means "leave the field", not "stop highlighting".
  if (event.target instanceof HTMLElement && event.target.classList.contains('note')) {
    event.target.blur();
    return;
  }
  if (paletteOpen) closePalette();
  else if (armed !== null) setArmed(null);
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

// The textarea redraws a short moment after typing stops, so holding a key or
// pasting a long list does not redraw once per character.
let typingTimer;

el.text.addEventListener('input', () => {
  state.text = el.text.value;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { saveState(); render(); }, 150);
});

el.filter.addEventListener('input', () => {
  state.filter = el.filter.value;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { saveState(); render(); }, 150);
});

el.sortBy.addEventListener('change', () => {
  state.sortBy = el.sortBy.value === '' ? null : Number(el.sortBy.value);
  saveState();
  render();
});

el.clear.addEventListener('click', () => {
  const warning = 'Clear the pasted lines?\n\nTicks are kept, so pasting the same lines back restores them.';
  if (state.text.trim() !== '' && !confirm(warning)) return;

  state.text = '';
  el.text.value = '';
  clearTimeout(typingTimer);
  saveState();
  render();
  el.text.focus();
});

el.example.addEventListener('click', () => {
  const replacing = state.text.trim() !== '' && state.text !== SAMPLE;
  if (replacing && !confirm('Replace the pasted lines with the example?')) return;

  state.text = SAMPLE;
  el.text.value = SAMPLE;
  state.groupBy = SAMPLE_GROUP_COLUMN;
  state.sortBy = null;
  clearTimeout(typingTimer);
  saveState();
  render();
});

el.uncheck.addEventListener('click', () => {
  if (state.done.size === 0) {
    setStatus('Nothing is ticked.');
    return;
  }
  if (!confirm(`Clear all ${state.done.size} remembered tick(s)? This cannot be undone.`)) return;

  state.done.clear();
  saveState();
  render();
  setStatus('Cleared every tick.');
});

el.copy.addEventListener('click', () => {
  if (view.length === 0) {
    setStatus('There is nothing to copy.');
    return;
  }
  // A line with a note is copied as "<line>  # <note>". Colours have no
  // sensible plain-text form, so they are not copied.
  const text = view
    .map(entry => `== ${entry.group.key} (${entry.group.lines.length}) ==\n` +
                  entry.group.lines.map(line => {
                    const note = state.notes.get(line.key);
                    return note === undefined ? line.raw : `${line.raw}  # ${note.trim()}`;
                  }).join('\n'))
    .join('\n\n');

  copyToClipboard(text);
});

// Two ways to copy, because the modern one is refused by some browsers when
// the page is opened straight off disk as a file:// address.
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => setStatus('Copied the grouped list.'),
      () => copyTheOldWay(text));
  } else {
    copyTheOldWay(text);
  }
}

function copyTheOldWay(text) {
  const wasFocused = document.activeElement;

  const scratch = document.createElement('textarea');
  scratch.className = 'offscreen';
  scratch.value = text;
  scratch.readOnly = true;
  document.body.append(scratch);
  scratch.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  scratch.remove();
  if (wasFocused instanceof HTMLElement) wasFocused.focus();

  setStatus(copied
    ? 'Copied the grouped list.'
    : 'This browser blocked copying. Select the lines by hand instead.');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

el.text.value = state.text;
el.filter.value = state.filter;
render();
