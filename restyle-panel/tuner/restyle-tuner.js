// Restyle tuner (dev only): a live panel for flipping a surface between
// style variants, tuning them, trimming the options down and saving the
// result as JSON.
//
// The surface declares a SPEC and always calls applyRestyle(root, SPEC,
// SPEC.defaults); every variant is plain CSS keyed on attributes and custom
// properties on that root:
//
//   choice option `id`  ->  data-rs-<id>="<value>"
//   range option `id`   ->  --rs-<id>: <value><unit>
//
// The tuner is just another writer of the same attributes, so a preset that
// comes back only has to be copied into SPEC.defaults.
//
//   const SPEC = {
//     panel: 'source-tiles',
//     groups: [{ title: 'Layout', options: [
//       { id: 'layout', type: 'choice', label: 'Arrange', choices: [{ value: 'grid', label: 'Grid' }] },
//       { id: 'gap', type: 'range', label: 'Gap', min: 4, max: 40, step: 2, unit: 'px' },
//     ] }],
//     themes: [{ name: 'Gallery', values: { layout: 'grid', gap: 24 } }],
//     defaults: { layout: 'grid', gap: 16 },
//   };
//   applyRestyle(root, SPEC, SPEC.defaults);
//   const tuner = restyleEnabled() ? createRestyleTuner({ target: root, spec: SPEC, onChange }) : null;
//
// Header buttons:
//   Reset       values back to SPEC.defaults and every deleted item restored
//   Load        a saved preset back in, each value checked against the spec
//   Save        downloads a preset  { kind: 'restyle-preset', panel, basedOn, values }
//   Save panel  downloads the trimmed panel  { kind: 'restyle-panel', panel, removed, spec }
//
// A small x to the left of each theme, section header and control (shown on
// hover) deletes that item from the tuner. Deleted options stop being written
// to the root, so their CSS falls back to its base rule; Save panel records
// what is left so the source spec and CSS can be pruned to match.
//
// Values and deletions persist per panel in localStorage 'restyle:<panel>'
// (a dev convenience).

const PRESET_KIND = 'restyle-preset';
const PANEL_KIND = 'restyle-panel';

const BRUSH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z"/><path d="M9.2 12c-2.3 0-4 1.8-4 4 0 1.6-.9 2.8-2.6 3.4 1.2 1 2.8 1.6 4.6 1.6 3.3 0 4.8-2.5 4.8-4.4"/></svg>';
const CROSS = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const allOptions = (spec) => spec.groups.flatMap((g) => g.options);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function restyleEnabled() {
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    || new URLSearchParams(location.search).has('restyle');
}

export function applyRestyle(root, spec, values) {
  for (const o of allOptions(spec)) {
    const v = values[o.id] !== undefined ? values[o.id] : spec.defaults[o.id];
    if (o.type === 'choice') root.setAttribute('data-rs-' + o.id, v);
    else root.style.setProperty('--rs-' + o.id, v + (o.unit || ''));
  }
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
}

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function createRestyleTuner({ target, spec, onChange = () => {} }) {
  const key = 'restyle:' + spec.panel;
  const noRemovals = () => ({ options: [], groups: [], themes: [] });
  let values = Object.assign({}, spec.defaults);
  let basedOn = 'defaults';
  let removed = noRemovals();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.values) { Object.assign(values, saved.values); basedOn = saved.basedOn || basedOn; }
    if (saved && saved.removed) removed = Object.assign(noRemovals(), saved.removed);
  } catch (e) { /* no storage */ }

  // The spec as trimmed by the x buttons. Deleted options are cleared from the
  // root so the panel shows its base CSS for them.
  function live() {
    const groups = spec.groups
      .filter((g) => !removed.groups.includes(g.title))
      .map((g) => Object.assign({}, g, { options: g.options.filter((o) => !removed.options.includes(o.id)) }))
      .filter((g) => g.options.length);
    const ids = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
    const pick = (vals) => Object.fromEntries(Object.entries(vals).filter(([k]) => ids.has(k)));
    return {
      panel: spec.panel,
      groups,
      themes: spec.themes.filter((t) => !removed.themes.includes(t.name)).map((t) => ({ name: t.name, values: pick(t.values) })),
      defaults: pick(spec.defaults),
    };
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rs-btn';
  btn.title = 'Restyle';
  btn.setAttribute('aria-label', 'Restyle');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = BRUSH;
  const card = document.createElement('div');
  card.className = 'rs-card';
  card.hidden = true;
  document.body.append(btn, card);

  const commit = () => {
    const cur = live();
    for (const o of allOptions(spec)) {
      if (cur.groups.some((g) => g.options.includes(o))) continue;
      if (o.type === 'choice') target.removeAttribute('data-rs-' + o.id);
      else target.style.removeProperty('--rs-' + o.id);
    }
    applyRestyle(target, cur, values);
    try { localStorage.setItem(key, JSON.stringify({ basedOn, values, removed })); } catch (e) { /* no storage */ }
    onChange(values);
  };

  const del = (kind, id, label) => `<button type="button" class="rs-del" data-del="${kind}" data-id="${esc(id)}" title="Delete" aria-label="Delete ${esc(label)}">${CROSS}</button>`;

  function sameAs(t) {
    return Object.keys(t.values).every((k) => t.values[k] === values[k]);
  }

  function build() {
    const cur = live();
    card.innerHTML = `<div class="rs-head"><span class="rs-title">Restyle</span>
      <button type="button" class="rs-hbtn" data-act="reset">Reset</button>
      <button type="button" class="rs-hbtn" data-act="load">Load</button>
      <button type="button" class="rs-hbtn" data-act="save-panel">Save panel</button>
      <button type="button" class="rs-hbtn rs-primary" data-act="save">Save</button></div>
      <div class="rs-body"></div>`;
    const body = card.querySelector('.rs-body');
    if (cur.themes.length) {
      body.insertAdjacentHTML('beforeend', `<div class="rs-group rs-themes"><div class="rs-h"><span>Themes</span></div>
        <div class="rs-chips">${cur.themes.map((t) => `<span class="rs-item">${del('theme', t.name, t.name)}<button type="button" class="rs-chip${sameAs(t) ? ' active' : ''}" data-theme="${esc(t.name)}">${esc(t.name)}</button></span>`).join('')}</div></div>`);
    }
    for (const g of cur.groups) {
      const sec = document.createElement('div');
      sec.className = 'rs-group';
      sec.innerHTML = `<div class="rs-h rs-item">${del('group', g.title, g.title)}<span>${esc(g.title)}</span></div>`;
      for (const o of g.options) {
        const row = document.createElement('div');
        row.className = 'rs-row rs-item';
        if (o.type === 'choice') {
          row.innerHTML = `${del('option', o.id, o.label)}<div class="rs-ctl"><span class="rs-label">${esc(o.label)}</span><div class="rs-chips">${o.choices.map((c) => (
            `<button type="button" class="rs-chip${values[o.id] === c.value ? ' active' : ''}" data-opt="${esc(o.id)}" data-v="${esc(c.value)}">${esc(c.label)}</button>`)).join('')}</div></div>`;
        } else {
          row.innerHTML = `${del('option', o.id, o.label)}<div class="rs-ctl"><span class="rs-label">${esc(o.label)}<output class="rs-out"></output></span>
            <input type="range" class="rs-range" min="${o.min}" max="${o.max}" step="${o.step}" value="${values[o.id]}" aria-label="${esc(o.label)}"></div>`;
          const input = row.querySelector('input');
          const out = row.querySelector('output');
          const show = () => { out.textContent = values[o.id] + (o.unit || ''); };
          show();
          input.addEventListener('input', () => {
            values[o.id] = Math.round(Number(input.value) * 1000) / 1000;
            show();
            commit();
            markThemes();
          });
        }
        sec.appendChild(row);
      }
      body.appendChild(sec);
    }
  }

  function markThemes() {
    const cur = live();
    card.querySelectorAll('[data-theme]').forEach((b) => {
      const t = cur.themes.find((x) => x.name === b.dataset.theme);
      b.classList.toggle('active', !!t && sameAs(t));
    });
  }

  card.addEventListener('click', (e) => {
    const gone = e.target.closest('[data-del]');
    const theme = e.target.closest('[data-theme]');
    const opt = e.target.closest('[data-opt]');
    const act = e.target.closest('[data-act]');
    if (gone) {
      const list = { option: removed.options, group: removed.groups, theme: removed.themes }[gone.dataset.del];
      if (!list.includes(gone.dataset.id)) list.push(gone.dataset.id);
    } else if (theme) {
      const t = live().themes.find((x) => x.name === theme.dataset.theme);
      values = Object.assign({}, spec.defaults, t.values);
      basedOn = t.name;
    } else if (opt) {
      const o = allOptions(spec).find((x) => x.id === opt.dataset.opt);
      values[o.id] = o.choices.find((c) => String(c.value) === opt.dataset.v).value;
    } else if (act && act.dataset.act === 'reset') {
      values = Object.assign({}, spec.defaults);
      basedOn = 'defaults';
      removed = noRemovals();
    } else if (act && act.dataset.act === 'load') {
      picker.click();
      return;
    } else if (act && act.dataset.act === 'save') {
      const cur = live();
      const kept = Object.fromEntries(Object.entries(values).filter(([k]) => k in cur.defaults));
      download('restyle-' + spec.panel + '-' + stamp() + '.json', { kind: PRESET_KIND, panel: spec.panel, basedOn, values: kept });
      return;
    } else if (act && act.dataset.act === 'save-panel') {
      const cur = live();
      cur.defaults = Object.fromEntries(Object.keys(cur.defaults).map((k) => [k, values[k]]));
      download('restyle-panel-' + spec.panel + '-' + stamp() + '.json', { kind: PANEL_KIND, panel: spec.panel, basedOn, removed, spec: cur });
      return;
    } else {
      return;
    }
    commit();
    build();
  });

  // Load: a saved preset (or a saved panel, for its values) back in, every
  // value checked against the spec; an unknown option, a choice not offered
  // or a range out of bounds is dropped.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.hidden = true;
  card.after(picker);
  picker.addEventListener('change', async () => {
    const file = picker.files && picker.files[0];
    picker.value = '';
    if (!file) return;
    let data = null;
    try { data = JSON.parse(await file.text()); } catch (e) { /* not JSON */ }
    const incoming = data && data.panel === spec.panel
      && (data.kind === PRESET_KIND ? data.values : data.kind === PANEL_KIND && data.spec ? data.spec.defaults : null);
    if (!incoming) {
      alert('Not a ' + spec.panel + ' preset.');
      return;
    }
    const next = Object.assign({}, spec.defaults);
    for (const o of allOptions(spec)) {
      const v = incoming[o.id];
      if (o.type === 'choice' ? o.choices.some((c) => c.value === v)
        : (typeof v === 'number' && v >= o.min && v <= o.max)) next[o.id] = v;
    }
    values = next;
    basedOn = data.basedOn || file.name;
    if (data.kind === PANEL_KIND && data.removed) removed = Object.assign(noRemovals(), data.removed);
    commit();
    build();
  });

  // Click the button to open, click it again to close. Nothing else opens or
  // closes the card: no hover, no outside click.
  btn.addEventListener('click', () => {
    const opening = card.hidden;
    if (opening) build();
    card.hidden = !opening;
    btn.classList.toggle('is-open', opening);
    btn.setAttribute('aria-expanded', String(opening));
  });

  commit();
  return {
    values: () => Object.assign({}, values),
    spec: live,
    sync: () => commit(),
    destroy: () => { btn.remove(); card.remove(); picker.remove(); },
  };
}
