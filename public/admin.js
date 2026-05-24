// admin.js — tile editor: load config on open, add/edit/delete/reorder, save

let tiles = [];

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadConfig);

document.getElementById('add-btn').addEventListener('click', () => {
  tiles.push({ name: 'New Service', url: 'https://', logo: '', color: '#ffffff', newTab: false, tmdb_provider_id: null });
  renderList();
  document.querySelectorAll('.tile-row').item(tiles.length - 1)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.getElementById('save-btn').addEventListener('click', saveConfig);

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Server ${res.status}`);
    tiles = await res.json();
  } catch (err) {
    showStatus('Could not load config from server.', true);
    console.error(err);
    return;
  }
  renderList();
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderList() {
  const list  = document.getElementById('tile-list');
  const empty = document.getElementById('empty-state');

  list.innerHTML = '';

  if (tiles.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  tiles.forEach((tile, i) => list.appendChild(buildRow(tile, i)));
}

// ── Row builder ───────────────────────────────────────────────────────────────

function buildRow(tile, index) {
  const row         = document.createElement('div');
  row.className     = 'tile-row';

  // Drag handle (cosmetic)
  const handle       = document.createElement('div');
  handle.className   = 'tile-handle';
  handle.textContent = '⠿';
  row.appendChild(handle);

  // Fields
  const fields     = document.createElement('div');
  fields.className = 'tile-fields';

  fields.appendChild(makeTextField('Name',     tile.name,      v => (tiles[index].name  = v)));
  fields.appendChild(makeTextField('URL',      tile.url,       v => (tiles[index].url   = v)));
  fields.appendChild(makeTextField('Logo URL', tile.logo || '', v => (tiles[index].logo  = v)));

  const colorLabel       = document.createElement('label');
  colorLabel.textContent = 'Color';
  const colorInput       = document.createElement('input');
  colorInput.type        = 'color';
  colorInput.value       = tile.color || '#ffffff';
  colorInput.addEventListener('input', e => (tiles[index].color = e.target.value));
  colorLabel.appendChild(colorInput);
  fields.appendChild(colorLabel);

  const tmdbLabel       = document.createElement('label');
  tmdbLabel.textContent = 'TMDB ID';
  const tmdbInput       = document.createElement('input');
  tmdbInput.type        = 'number';
  tmdbInput.value       = tile.tmdb_provider_id ?? '';
  tmdbInput.placeholder = 'e.g. 15';
  tmdbInput.min         = '1';
  tmdbInput.addEventListener('input', e => {
    const v = e.target.value.trim();
    tiles[index].tmdb_provider_id = v ? parseInt(v, 10) : null;
  });
  tmdbLabel.appendChild(tmdbInput);
  fields.appendChild(tmdbLabel);

  // New-tab checkbox spans all columns
  const checkLabel     = document.createElement('label');
  checkLabel.className = 'field-newtab';
  const checkInput     = document.createElement('input');
  checkInput.type      = 'checkbox';
  checkInput.checked   = !!tile.newTab;
  checkInput.addEventListener('change', e => (tiles[index].newTab = e.target.checked));
  checkLabel.appendChild(checkInput);
  checkLabel.appendChild(document.createTextNode('Open in new tab'));
  fields.appendChild(checkLabel);

  row.appendChild(fields);

  // Actions
  const actions     = document.createElement('div');
  actions.className = 'tile-actions';

  const upBtn     = makeIconBtn('↑', 'Move up',   () => moveItem(index, -1));
  upBtn.disabled  = index === 0;

  const downBtn   = makeIconBtn('↓', 'Move down', () => moveItem(index, +1));
  downBtn.disabled = index === tiles.length - 1;

  const delBtn      = document.createElement('button');
  delBtn.className  = 'btn-danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete "${tile.name}"?`)) {
      tiles.splice(index, 1);
      renderList();
    }
  });

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(delBtn);
  row.appendChild(actions);

  return row;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTextField(labelText, value, onChange) {
  const label       = document.createElement('label');
  label.textContent = labelText;
  const input       = document.createElement('input');
  input.type        = 'text';
  input.value       = value;
  input.placeholder = labelText;
  input.addEventListener('input', e => onChange(e.target.value));
  label.appendChild(input);
  return label;
}

function makeIconBtn(text, title, onClick) {
  const btn       = document.createElement('button');
  btn.className   = 'btn-icon';
  btn.textContent = text;
  btn.title       = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function moveItem(index, dir) {
  const next = index + dir;
  if (next < 0 || next >= tiles.length) return;
  [tiles[index], tiles[next]] = [tiles[next], tiles[index]];
  renderList();
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveConfig() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  showStatus('Saving…', false);

  try {
    const res  = await fetch('/api/config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tiles }),
    });
    const body = await res.json();

    if (!res.ok) {
      showStatus(body.error || 'Save failed', true);
    } else {
      showStatus('Saved ✓', false);
      setTimeout(() => showStatus('', false), 3000);
    }
  } catch (err) {
    showStatus('Network error', true);
  } finally {
    saveBtn.disabled = false;
  }
}

function showStatus(msg, isError) {
  const el       = document.getElementById('save-status');
  el.textContent = msg;
  el.className   = 'save-status' + (isError ? ' is-error' : '');
}
