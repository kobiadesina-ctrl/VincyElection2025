/************************************************************
 * Election Map — robust SVG binding + results rendering
 * - Binds district IDs (markers) to their paintable shapes
 * - Colors via inline style (beats class/CSS inside SVG)
 * - Map colors match seat-row rules (declared vs leading)
 * - Popular vote bar with 50% marker above
 * - Seat row packs NDP from left, ULP from right
 ************************************************************/

// ---------- DOM helpers ----------
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');

// ---------- Global state ----------
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" }, // ULP declared color
    "New Democratic Party": { color: "#f5c02c" } // NDP declared color
  },
  leadTint: { ULP: "#f77e81", NDP: "#fedda6" }, // leading but not declared
  districts: {},
  totalSeats: 15,
  lastUpdated: null
};

// Expose short codes to same colors
state.parties["ULP"] = state.parties["Unity Labour Party"];
state.parties["NDP"] = state.parties["New Democratic Party"];

// ---------- Candidates ----------
const CANDIDATE_CONFIG = {
  "North Windward":         { NDP: "Shevern John",         ULP: "Grace Walters"      },
  "North Central Windward": { NDP: "Chieftain Neptune",    ULP: "Ralph Gonsalves"    },
  "South Central Windward": { NDP: "Israel Bruce",         ULP: "Saboto Caesar"      },
  "South Windward":         { NDP: "Andrew John",          ULP: "Daron John"         },
  "Marriaqua":              { NDP: "Philip Jackson",       ULP: "Jimmy Prince"       },
  "East St. George":        { NDP: "Laverne Gibson-Velox", ULP: "Camillo Gonsalves"  },
  "West St. George":        { NDP: "Kaschaka Cupid",       ULP: "Curtis King"        },
  "East Kingstown":         { NDP: "Fitz Bramble",         ULP: "Luke Browne"        },
  "Central Kingstown":      { NDP: "St Clair Leacock",     ULP: "Marvin Fraser"      },
  "West Kingstown":         { NDP: "Daniel Cummings",      ULP: "Keisal Peters"      },
  "South Leeward":          { NDP: "Nigel Stephenson",     ULP: "Grenville Williams" },
  "Central Leeward":        { NDP: "Conroy Huggins",       ULP: "Orando Brewster"    },
  "North Leeward":          { NDP: "Kishore Shallow",      ULP: "Carlos James"       },
  "Northern Grenadines":    { NDP: "Godwin Friday",        ULP: "Carlos Williams"    },
  "Southern Grenadines":    { NDP: "Terrance Ollivierre",  ULP: "Chevonne Stewart"   },
};

function seedCandidates() {
  Object.entries(CANDIDATE_CONFIG).forEach(([name, pair]) => {
    if (!state.districts[name]) {
      state.districts[name] = {
        name,
        declared: 0, // 0 = leading only; 1 = declared
        candidates: [
          { party: "NDP", name: pair.NDP, votes: 0, swing: "0.0%" },
          { party: "ULP", name: pair.ULP, votes: 0, swing: "0.0%" },
        ],
        totalVotes: 0
      };
    }
  });
}
seedCandidates();

// ---------- Canonical naming from SVG IDs ----------
const ID_TO_NAME = {
  EG: "East St. George",
  WG: "West St. George",
  SG: "Southern Grenadines",
  NG: "Northern Grenadines",
  EK: "East Kingstown",
  CK: "Central Kingstown",
  WK: "West Kingstown",
  NC: "North Central Windward",
  NW: "North Windward",
  SC: "South Central Windward",
  SW: "South Windward",
  SL: "South Leeward",
  NL: "North Leeward",
  CL: "Central Leeward",
  MQ: "Marriaqua",
};
const canonicalName = raw => ID_TO_NAME[raw] || raw;

// ---------- SVG district mapping ----------
// Map<"NW", Array<paintable elements>>
let districtTargets = new Map();

function isMarker(el) {
  return el && el.hasAttribute('id') && el.hasAttribute('data-district');
}
function isPaintable(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === 'path' || t === 'polygon' || t === 'rect' || t === 'ellipse' || t === 'circle';
}

function buildDistrictTargets(svg) {
  districtTargets = new Map();

  // Build a single ordered list of markers + paintables
  const ordered = Array.from(svg.querySelectorAll('[id][data-district], path, polygon, rect, ellipse, circle'));

  let currentKey = null;
  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];

    if (isMarker(el)) {
      // New district starts
      currentKey = el.getAttribute('id') || el.getAttribute('data-district');
      if (!districtTargets.has(currentKey)) districtTargets.set(currentKey, []);
      // Also attach hover listeners to the marker itself (optional)
      attachHoverForMarker(el, currentKey);
      continue;
    }

    // Assign subsequent paintables to currentKey until next marker
    if (currentKey && isPaintable(el)) {
      el.dataset.districtRef = currentKey;
      // Store original fill once
      if (!el.dataset.origfill) {
        const orig = el.style.fill || el.getAttribute('fill') || window.getComputedStyle(el).fill;
        el.dataset.origfill = (orig && orig !== 'none') ? orig : '#d7d7d7';
      }
      districtTargets.get(currentKey).push(el);
      attachHoverForPaintable(el, currentKey);
    }
  }
}

function attachHoverForMarker(marker, key) {
  marker.style.cursor = 'pointer';
  marker.addEventListener('mouseenter', e => {
    const name = canonicalName(key);
    renderTooltipFor(name);
    tooltip.style.display = 'block';
    onTooltipMove(e);
    // add hover stroke to all paintables in this district
    const targets = districtTargets.get(key) || [];
    targets.forEach(t => t.classList.add('district-hover'));
  });
  marker.addEventListener('mousemove', onTooltipMove);
  marker.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    const targets = districtTargets.get(key) || [];
    targets.forEach(t => t.classList.remove('district-hover'));
  });
}

function attachHoverForPaintable(el, key) {
  el.style.cursor = 'pointer';
  el.addEventListener('mouseenter', e => {
    const name = canonicalName(key);
    renderTooltipFor(name);
    tooltip.style.display = 'block';
    onTooltipMove(e);
    // hover styling for all shapes in the district
    const targets = districtTargets.get(key) || [];
    targets.forEach(t => t.classList.add('district-hover'));
  });
  el.addEventListener('mousemove', onTooltipMove);
  el.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    const targets = districtTargets.get(key) || [];
    targets.forEach(t => t.classList.remove('district-hover'));
  });
}

// ---------- SVG loader ----------
function loadSVG(svgText) {
  svgWrapper.innerHTML = svgText;
  const svg = svgWrapper.querySelector('svg');
  if (!svg) return;

  if (!svg.getAttribute('viewBox')) {
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = '100%';
  svg.style.height = 'auto';

  // Build robust district mapping
  buildDistrictTargets(svg);

  // Apply initial colors
  applyResults();
}

// ---------- Tooltip positioning ----------
function onTooltipMove(e) {
  const pad = 12;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let left = e.clientX + 12;
  let top = e.clientY + 12;
  if (left + tw + pad > window.innerWidth) left = e.clientX - tw - 16;
  if (top + th + pad > window.innerHeight) top = e.clientY - th - 16;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

// ---------- Tooltip renderer ----------
function renderTooltipFor(districtName) {
  const info = state.districts[districtName] || {
    name: districtName,
    declared: 0,
    candidates: [],
    totalVotes: 0
  };

  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s, c) => s + (c.votes || 0), 0);

  const partyColor = p => (state.parties[p] && state.parties[p].color) || '#999';
  const swingClass = s => s?.trim().startsWith('+') ? 'swing-pos' : (s?.trim().startsWith('-') ? 'swing-neg' : 'swing-zero');
  const fmtPct = (v, t) => t ? ((v || 0) / t * 100).toFixed(1) : '0.0';
  const normSwing = s => {
    if (typeof s !== 'string') return '0.0%';
    const m = s.trim().match(/^([+\-]?)(\d+(\.\d+)?)/);
    if (m) return `${m[1] || (parseFloat(m[2]) === 0 ? '' : '+')}${(+m[2]).toFixed(1)}%`;
    return '0.0%';
  };

  const rows = candidates.length ? candidates.map(c => {
    const pct = fmtPct(c.votes, total);
    const sw = normSwing(c.swing);
    return `
      <div class="tt-row">
        <div class="tt-col party-cell">
          <span class="party-chip" style="background:${partyColor(c.party)}"></span>
          <span class="party-name">${c.party}</span>
        </div>
        <div class="tt-col candidate-cell"><span class="candidate-name">${c.name || '—'}</span></div>
        <div class="tt-col votes-cell">${c.votes || 0}</div>
        <div class="tt-col share-cell">${pct}%</div>
        <div class="tt-col swing-cell ${swingClass(sw)}">${sw}</div>
      </div>
    `;
  }).join('') : '<div style="color:var(--muted)">No results yet.</div>';

  tooltip.innerHTML = `
    <div class="district-name">${info.name || districtName}</div>
    <div class="tt-header">
      <div class="tt-col party-cell">Party</div>
      <div class="tt-col candidate-cell">Candidate</div>
      <div class="tt-col votes-cell">Votes</div>
      <div class="tt-col share-cell">Share</div>
      <div class="tt-col swing-cell">Swing</div>
    </div>
    ${rows}
    <div class="tt-total">Total votes: ${total}</div>
  `;
}

// ---------- Apply results to map + widgets ----------
function applyResults() {
  const svg = svgWrapper.querySelector('svg');
  if (!svg) return;

  // Paint each district's actual shapes
  districtTargets.forEach((targets, key) => {
    if (!targets || !targets.length) return;

    const name = canonicalName(key);
    const info = state.districts[name];

    // Default = original fill (or grey)
    let fillColor = targets[0].dataset.origfill || '#d7d7d7';

    if (info && info.candidates && info.candidates.length) {
      const ndp = info.candidates.find(c => c.party === 'NDP') || { votes: 0 };
      const ulp = info.candidates.find(c => c.party === 'ULP') || { votes: 0 };
      const vN = Number(ndp.votes || 0);
      const vU = Number(ulp.votes || 0);
      const declared = Number(info.declared || 0) === 1;

      if (vN === 0 && vU === 0) {
        fillColor = targets[0].dataset.origfill || '#d7d7d7';
      } else if (vN === vU) {
        // tie -> neutral grey (to match seat-row neutrality)
        fillColor = targets[0].dataset.origfill || '#d7d7d7';
      } else if (vN > vU) {
        fillColor = declared ? (state.parties['NDP']?.color || '#999') : state.leadTint.NDP;
      } else {
        fillColor = declared ? (state.parties['ULP']?.color || '#999') : state.leadTint.ULP;
      }

      // cache total
      info.totalVotes = vN + vU;
    }

    // Inline style fill on every paintable (overrides class-based fills)
    targets.forEach(el => { el.style.fill = fillColor; });
  });

  renderPopularVote();
  renderSeatRow();
  renderLegendBasics();
  renderLastUpdated();
}

// ---------- Popular vote (2 segments) ----------
function renderPopularVote() {
  const partyTotals = {};
  let totalVotes = 0;
  Object.values(state.districts).forEach(d => {
    (d.candidates || []).forEach(c => {
      partyTotals[c.party] = (partyTotals[c.party] || 0) + (c.votes || 0);
      totalVotes += (c.votes || 0);
    });
  });

  const ndpVotes = partyTotals["NDP"] || 0;
  const ulpVotes = partyTotals["ULP"] || 0;
  const total = ndpVotes + ulpVotes;
  const ndpPct = total ? (ndpVotes / total * 100) : 0;
  const ulpPct = total ? (ulpVotes / total * 100) : 0;

  const pvBar = qs('#pv-bar'); pvBar.innerHTML = '';

  const ndpSeg = document.createElement('div');
  ndpSeg.className = 'pv-seg ndp';
  ndpSeg.style.width = ndpPct + '%';
  ndpSeg.textContent = ndpPct.toFixed(1) + '%';

  const ulpSeg = document.createElement('div');
  ulpSeg.className = 'pv-seg ulp';
  ulpSeg.style.width = ulpPct + '%';
  ulpSeg.textContent = ulpPct.toFixed(1) + '%';

  pvBar.appendChild(ndpSeg);
  pvBar.appendChild(ulpSeg);

  qs('#pv-total').textContent = (total || 0) + ' votes';
}

// ---------- Seat row (pack left/right) ----------
function renderSeatRow() {
  const cont = qs('#seats-row');
  if (!cont) return;
  cont.innerHTML = '';

  const ndpSeats = [];
  const ulpSeats = [];

  Object.entries(state.districts).forEach(([id, d]) => {
    const ndp = (d.candidates || []).find(c => c.party === 'NDP') || { votes: 0 };
    const ulp = (d.candidates || []).find(c => c.party === 'ULP') || { votes: 0 };
    const vN = Number(ndp.votes || 0), vU = Number(ulp.votes || 0);
    if (vN === 0 && vU === 0) return;   // no result
    if (vN === vU) return;               // tie -> not counting as seat

    const declared = Number(d.declared || 0) === 1;
    const lead = Math.abs(vN - vU);

    if (vN > vU) {
      ndpSeats.push({
        district: d.name || id,
        party: 'NDP',
        declared,
        lead,
        color: declared ? (state.parties['NDP']?.color || '#999') : state.leadTint.NDP
      });
    } else {
      ulpSeats.push({
        district: d.name || id,
        party: 'ULP',
        declared,
        lead,
        color: declared ? (state.parties['ULP']?.color || '#999') : state.leadTint.ULP
      });
    }
  });

  // within each side: declared first, then largest lead
  ndpSeats.sort((a, b) => (b.declared - a.declared) || (b.lead - a.lead));
  ulpSeats.sort((a, b) => (b.declared - a.declared) || (b.lead - a.lead));

  const TOTAL = state.totalSeats || 15;
  const slots = new Array(TOTAL).fill(null);

  // Fill from left with NDP
  for (let i = 0; i < ndpSeats.length && i < TOTAL; i++) slots[i] = ndpSeats[i];
  // Fill from right with ULP
  for (let j = 0; j < ulpSeats.length && j < TOTAL; j++) {
    const idx = TOTAL - 1 - j;
    if (!slots[idx]) slots[idx] = ulpSeats[j];
    else if (ulpSeats[j].lead > slots[idx].lead) slots[idx] = ulpSeats[j]; // resolve rare collision
  }

  // Render the 15 squares (blanks are grey)
  slots.forEach(seat => {
    const div = document.createElement('div');
    div.className = 'seat-square';
    div.style.background = seat ? seat.color : '#d7d7d7';

    if (seat) {
      div.style.cursor = 'pointer';
      div.addEventListener('mouseenter', e => {
        const line2 = `${seat.party} ${seat.declared ? 'victory' : 'leading'} +${seat.lead}`;
        tooltip.innerHTML = `
          <div class="district-name">${seat.district}</div>
          <div>${line2}</div>
        `;
        tooltip.style.display = 'block';
        onTooltipMove(e);
      });
      div.addEventListener('mousemove', onTooltipMove);
      div.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    }
    cont.appendChild(div);
  });

  const declaredCount = slots.filter(s => s && s.declared).length;
  qs('#seat-summary').textContent = `${declaredCount} / ${TOTAL} decided`;
}

// ---------- Minimal party labels (declared colors) ----------
function renderLegendBasics() {
  const legend = qs('#legend'); legend.innerHTML = '';
  [
    { label: "Unity Labour Party", color: state.parties["ULP"].color },
    { label: "New Democratic Party", color: state.parties["NDP"].color }
  ].forEach(it => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '6px';

    const pill = document.createElement('span');
    pill.style.width = '14px';
    pill.style.height = '14px';
    pill.style.borderRadius = '3px';
    pill.style.display = 'inline-block';
    pill.style.background = it.color;

    const label = document.createElement('span');
    label.textContent = it.label;

    row.appendChild(pill);
    row.appendChild(label);
    legend.appendChild(row);
  });
}

// ---------- Last updated ----------
function renderLastUpdated() {
  const el = qs('#last-updated');
  if (!el) return;
  if (!state.lastUpdated) { el.textContent = 'Last updated: —'; return; }
  const d = new Date(state.lastUpdated);
  const fmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit'
  });
  el.textContent = `Last updated: ${fmt.format(d)}`;
}

// ---------- Results polling ----------
const RESULTS_URL = 'results.json';
const POLL_MS = 7000;

function normalizeSwing(val) {
  if (val == null) return "0.0%";
  if (typeof val === 'string') {
    const m = val.trim().match(/^([+\-]?)(\d+(\.\d+)?)/);
    if (!m) return "0.0%";
    const sign = m[1] || (parseFloat(m[2]) === 0 ? '' : '+');
    return `${sign}${(+m[2]).toFixed(1)}%`;
  }
  if (typeof val === 'number') {
    const sign = val === 0 ? '' : (val > 0 ? '+' : '');
    return `${sign}${Math.abs(val).toFixed(1)}%`;
  }
  return "0.0%";
}

function mergeResults(data) {
  if (!data || !data.districts) return;

  if (data.updatedAt) state.lastUpdated = data.updatedAt;

  Object.entries(data.districts).forEach(([rawName, row]) => {
    const name = canonicalName(rawName);
    const d = state.districts[name];
    if (!d) return;

    if (typeof row.declared !== 'undefined') {
      d.declared = Number(row.declared) === 1 ? 1 : 0;
    }

    const setParty = partyKey => {
      const entry = row[partyKey];
      let votes = 0, swing = "0.0%";
      if (typeof entry === 'number') {
        votes = entry;
      } else if (entry && typeof entry === 'object') {
        votes = Number(entry.votes || 0);
        swing = normalizeSwing(entry.swing);
      }
      const cand = (d.candidates || []).find(c => c.party === partyKey);
      if (cand) { cand.votes = votes; cand.swing = swing; }
    };

    setParty("NDP");
    setParty("ULP");

    d.totalVotes = (d.candidates || []).reduce((s, c) => s + (c.votes || 0), 0);
  });
}

function startResultsPolling() {
  const tick = () => {
    fetch(`${RESULTS_URL}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) { mergeResults(json); applyResults(); } })
      .catch(() => {})
      .finally(() => setTimeout(tick, POLL_MS));
  };
  tick();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  const inlineSVG = svgWrapper.querySelector('svg');
  if (inlineSVG) {
    loadSVG(inlineSVG.outerHTML);
  } else {
    fetch('map.svg', { cache: 'no-store' })
      .then(res => res.ok ? res.text() : null)
      .then(text => { if (text) loadSVG(text); })
      .catch(() => {});
  }
  startResultsPolling();
});
