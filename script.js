/************************************************************
 * Election Map — tooltip declared row uses DECLARED color,
 * black text except swing colors, mobile-safe icon spacing,
 * swing formatted as +#.#% / -#.#% (no "-+"), ULP lead tint updated,
 * seat counts per party under seat chart, party banner with logos.
 ************************************************************/

// ---------- DOM helpers ----------
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');
const fmtInt = new Intl.NumberFormat('en-US');

// ---------- Global state ----------
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" },     // ULP declared color
    "New Democratic Party": { color: "#f5c02c" }    // NDP declared color
  },
  // Leading (not declared) tints
  leadTint: { ULP: "#fedfad", NDP: "#fedda6" },     // ULP updated per request
  districts: {},
  totalSeats: 15,
  lastUpdated: null
};

// Short aliases
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

function seedCandidates(){
  Object.entries(CANDIDATE_CONFIG).forEach(([name, pair])=>{
    if(!state.districts[name]){
      state.districts[name] = {
        name,
        declared: { NDP: 0, ULP: 0 }, // two-column model
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

// ---------- Canonical naming ----------
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
const NAME_TO_LABEL = {
  "North Windward": "NORTH WINDWARD",
  "North Central Windward": "NORTH CENTRAL WINDWARD",
  "South Central Windward": "SOUTH CENTRAL WINDWARD",
  "South Windward": "SOUTH WINDWARD",
  "Marriaqua": "MARRIAQUA",
  "East St. George": "EAST ST. GEORGE",
  "West St. George": "WEST ST. GEORGE",
  "East Kingstown": "EAST KINGSTOWN",
  "Central Kingstown": "CENTRAL KINGSTOWN",
  "West Kingstown": "WEST KINGSTOWN",
  "South Leeward": "SOUTH LEEWARD",
  "Central Leeward": "CENTRAL LEEWARD",
  "North Leeward": "NORTH LEEWARD",
  "Northern Grenadines": "NORTHERN GRENADINES",
  "Southern Grenadines": "SOUTHERN GRENADINES",
};
const canonicalName = raw => ID_TO_NAME[raw] || raw;

// ---------- SVG district mapping ----------
let districtTargets = new Map();
const originalOrder = new WeakMap(); // element -> { parent, nextSibling }

function isMarker(el) { return el && el.hasAttribute('id') && el.hasAttribute('data-district'); }
function isPaintable(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === 'path' || t === 'polygon' || t === 'rect' || t === 'ellipse' || t === 'circle';
}

function attachHover(key, targets) {
  const enter = e => {
    const name = canonicalName(key);
    renderTooltipFor(name);
    showTooltipAt(e.clientX, e.clientY);

    // bring to front
    targets.forEach(t => {
      if (!originalOrder.has(t)) originalOrder.set(t, { parent: t.parentNode, next: t.nextSibling });
      t.parentNode.appendChild(t);
      t.classList.add('district-hover');
    });
  };
  const leave = () => {
    tooltip.style.display = 'none';
    targets.forEach(t => {
      const rec = originalOrder.get(t);
      if (rec && rec.parent) rec.parent.insertBefore(t, rec.next);
      t.classList.remove('district-hover');
    });
  };
  const move = e => showTooltipAt(e.clientX, e.clientY);

  targets.forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
  });
}

function buildTargetsByOrder(svg) {
  const map = new Map();
  const ordered = Array.from(svg.querySelectorAll('[id][data-district], path, polygon, rect, ellipse, circle'));
  let currentKey = null;
  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];
    if (isMarker(el)) {
      currentKey = el.getAttribute('id') || el.getAttribute('data-district');
      if (!map.has(currentKey)) map.set(currentKey, []);
      continue;
    }
    if (currentKey && isPaintable(el)) {
      if (!el.dataset.origfill) {
        const orig = el.style.fill || el.getAttribute('fill') || window.getComputedStyle(el).fill;
        el.dataset.origfill = (orig && orig !== 'none') ? orig : '#d7d7d7';
      }
      el.dataset.districtRef = currentKey;
      map.get(currentKey).push(el);
    }
  }
  return map;
}

function fallbackByInkscapeLabel(svg, key) {
  const name = canonicalName(key);
  const label = NAME_TO_LABEL[name];
  if (!label) return [];
  const sel = `[inkscape\\:label="${label}"]`;
  const containers = Array.from(svg.querySelectorAll(sel));
  const paints = [];
  containers.forEach(c => {
    if (isPaintable(c)) paints.push(c);
    paints.push(...c.querySelectorAll('path,polygon,rect,ellipse,circle'));
  });
  paints.forEach(el => {
    if (!el.dataset.origfill) {
      const orig = el.style.fill || el.getAttribute('fill') || window.getComputedStyle(el).fill;
      el.dataset.origfill = (orig && orig !== 'none') ? orig : '#d7d7d7';
    }
  });
  return paints;
}

function fallbackByHeuristic(svg, key) {
  const name = canonicalName(key);
  const words = (NAME_TO_LABEL[name] || name).toLowerCase().split(/\s+/).filter(Boolean);
  const paints = Array.from(svg.querySelectorAll('path,polygon,rect,ellipse,circle')).filter(el => {
    const id = (el.id || '').toLowerCase();
    const cls = (el.getAttribute('class') || '').toLowerCase();
    return words.some(w => id.includes(w) || cls.includes(w));
  });
  paints.forEach(el => {
    if (!el.dataset.origfill) {
      const orig = el.style.fill || el.getAttribute('fill') || window.getComputedStyle(el).fill;
      el.dataset.origfill = (orig && orig !== 'none') ? orig : '#d7d7d7';
    }
  });
  return paints;
}

function buildDistrictTargets(svg) {
  districtTargets = buildTargetsByOrder(svg);
  const expectedKeys = Object.keys(ID_TO_NAME);
  expectedKeys.forEach(key => {
    if (!districtTargets.has(key) || districtTargets.get(key).length === 0) {
      const fbA = fallbackByInkscapeLabel(svg, key);
      if (fbA.length) districtTargets.set(key, fbA);
      else {
        const fbB = fallbackByHeuristic(svg, key);
        if (fbB.length) districtTargets.set(key, fbB);
      }
    }
  });
  districtTargets.forEach((targets, key) => {
    if (!targets || targets.length === 0) {
      console.warn(`[map] No shapes found for district key "${key}".`);
      return;
    }
    attachHover(key, targets);
  });
}

// ---------- Utils ----------
function hexToRGBA(hex, a=0.22){
  // supports #rgb or #rrggbb
  let h = hex.replace('#','');
  if (h.length===3) h = h.split('').map(c=>c+c).join('');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// Swing: normalize for display only (+ added to non-negative, clean "-+")
function formatSwingDisplay(raw){
  if (raw == null || raw === "") return "0.0%";
  const s = String(raw).trim().replace(/^\-\+/, "-").replace(/^\+?\+/, "+");
  // extract sign & number
  const m = s.match(/^([+\-]?)(\d+(\.\d+)?)/);
  if (!m) return s; // leave as-is if not parseable
  const num = parseFloat((m[1] === "-" ? "-" : "") + m[2]);
  const val = isNaN(num) ? 0 : num;
  const sign = val < 0 ? "-" : "+";
  return `${sign}${Math.abs(val).toFixed(1)}%`;
}

// ---------- SVG loader ----------
function loadSVG(svgText){
  svgWrapper.innerHTML = svgText;
  const svg = svgWrapper.querySelector('svg');
  if(!svg) return;

  if(!svg.getAttribute('viewBox')){
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if(w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = '100%';
  svg.style.height = 'auto';

  buildDistrictTargets(svg);
  applyResults();
}

// ---------- Tooltip placement (mobile-safe clamping) ----------
function showTooltipAt(clientX, clientY){
  tooltip.style.display = 'block';
  const pad = 8;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = clientX + 12;
  let top = clientY + 12;

  if (left + tw + pad > vw) left = clientX - tw - 12;
  if (top + th + pad > vh) top = clientY - th - 12;

  left = Math.max(pad, Math.min(left, vw - tw - pad));
  top  = Math.max(pad, Math.min(top,  vh - th - pad));

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

// ---------- Tooltip renderer ----------
function renderTooltipFor(districtName){
  const info = state.districts[districtName] || {
    name: districtName, declared: {NDP:0,ULP:0}, candidates: [], totalVotes: 0
  };

  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s,c)=>s+(c.votes||0),0);

  // votes to determine leader (for info only)
  const ndp = candidates.find(c=>c.party==='NDP') || { votes:0, swing:"0.0%" };
  const ulp = candidates.find(c=>c.party==='ULP') || { votes:0, swing:"0.0%" };
  const vN = Number(ndp.votes||0), vU = Number(ulp.votes||0);
  const hasVotes = (vN + vU) > 0;
  const isTie = hasVotes && vN === vU;

  // Declared party (if any)
  const declaredN = Number(info.declared?.NDP||0) === 1;
  const declaredU = Number(info.declared?.ULP||0) === 1;
  let declaredParty = null;
  if (declaredN && !declaredU) declaredParty = 'NDP';
  else if (declaredU && !declaredN) declaredParty = 'ULP';
  else if (declaredN && declaredU) {
    if (vN > vU) declaredParty = 'NDP';
    else if (vU > vN) declaredParty = 'ULP';
  }

  // Declared row background = DECLARED color (semi-transparent)
  const declaredBg = declaredParty
    ? hexToRGBA(state.parties[declaredParty].color, 0.22)
    : 'transparent';

  // Order rows: declared first if exists
  const order = declaredParty ? [declaredParty, declaredParty === 'NDP' ? 'ULP' : 'NDP'] : ['NDP','ULP'];

  const partyColor = p => (state.parties[p] && state.parties[p].color) || '#999';
  const swingClass = s => (typeof s === 'string' && s.trim().startsWith('-')) ? 'swing-neg'
                       : (typeof s === 'string' && s.trim().startsWith('+')) ? 'swing-pos'
                       : 'swing-zero';
  const fmtPct = (v, t) => t ? ((v || 0) / t * 100).toFixed(1) : '0.0';

  const rows = order.map(p=>{
    const c = (p === 'NDP') ? ndp : ulp;
    const pct = fmtPct(c.votes, total);
    const sw = formatSwingDisplay(c.swing); // enforce + for non-negative, clean "-+"
    const isDeclaredForParty = (info.declared?.[p] === 1 || info.declared?.[p] === '1');
    const declaredIcon = isDeclaredForParty ? `<img src="Declaration.svg" alt="Declared" class="declared-icon" />` : '';

    const isDeclRow = (declaredParty === p);
    const rowCls = isDeclRow ? ' tt-row--declared' : '';
    const rowStyle = isDeclRow ? ` style="background:${declaredBg}"` : '';

    return `
      <div class="tt-row${rowCls}"${rowStyle}>
        <div class="tt-col party-cell">
          <span class="party-chip" style="background:${partyColor(p)}"></span>
          <span class="party-name">${p}</span>
        </div>
        <div class="tt-col candidate-cell">
          <span class="candidate-name">${c.name || '—'}</span>
          ${declaredIcon}
        </div>
        <div class="tt-col votes-cell">${fmtInt.format(c.votes || 0)}</div>
        <div class="tt-col share-cell">${pct}%</div>
        <div class="tt-col swing-cell ${swingClass(sw)}">${sw}</div>
      </div>
    `;
  }).join('');

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
    <div class="tt-total">Total votes: ${fmtInt.format(total)}</div>
  `;
}

// ---------- Apply results to map + widgets ----------
function applyResults(){
  const svg = svgWrapper.querySelector('svg');
  if(!svg) return;

  // Paint each district's shapes
  districtTargets.forEach((targets, key) => {
    if (!targets || !targets.length) return;

    const name = canonicalName(key);
    const info = state.districts[name];

    let fillColor = targets[0].dataset.origfill || '#d7d7d7';
    if (info && info.candidates && info.candidates.length) {
      const ndp = info.candidates.find(c => c.party === 'NDP') || { votes: 0 };
      const ulp = info.candidates.find(c => c.party === 'ULP') || { votes: 0 };
      const vN = Number(ndp.votes || 0);
      const vU = Number(ulp.votes || 0);
      const declaredN = Number(info.declared?.NDP || 0) === 1;
      const declaredU = Number(info.declared?.ULP || 0) === 1;

      const hasVotes = (vN + vU) > 0;
      const isTie = vN === vU && hasVotes;

      if (isTie) {
        fillColor = '#000000'; // tie with non-zero -> black
      } else if (declaredN && !declaredU) {
        fillColor = state.parties['NDP']?.color || '#999';
      } else if (declaredU && !declaredN) {
        fillColor = state.parties['ULP']?.color || '#999';
      } else if (declaredN && declaredU) {
        // contradictory; choose higher votes if any, else black
        if (vN > vU) fillColor = state.parties['NDP']?.color || '#999';
        else if (vU > vN) fillColor = state.parties['ULP']?.color || '#999';
        else fillColor = '#000000';
      } else {
        // no declaration: use leading tint if any
        if (!hasVotes) fillColor = targets[0].dataset.origfill || '#d7d7d7';
        else if (vN > vU) fillColor = state.leadTint.NDP;
        else if (vU > vN) fillColor = state.leadTint.ULP;
      }

      info.totalVotes = vN + vU;
    }

    targets.forEach(el => { el.style.fill = fillColor; });
  });

  renderPopularVote();
  renderSeatRow();
  renderLastUpdated();
}

// ---------- Popular vote ----------
function renderPopularVote(){
  const partyTotals = {};
  let totalVotes = 0;
  Object.values(state.districts).forEach(d=>{
    (d.candidates||[]).forEach(c=>{
      partyTotals[c.party] = (partyTotals[c.party] || 0) + (c.votes||0);
      totalVotes += (c.votes||0);
    });
  });

  const ndpVotes = partyTotals["NDP"] || 0;
  const ulpVotes = partyTotals["ULP"] || 0;
  const total = ndpVotes + ulpVotes;
  const ndpPct = total ? (ndpVotes/total*100) : 0;
  const ulpPct = total ? (ulpVotes/total*100) : 0;

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

  qs('#pv-total').textContent = `${fmtInt.format(total || 0)} votes`;
}

// ---------- Seat row & counts ----------
function renderSeatRow(){
  const cont = qs('#seats-row');
  if (!cont) return;
  cont.innerHTML = '';

  const ndpSeats = [];
  const ulpSeats = [];

  // counts
  let ndpDeclared = 0, ulpDeclared = 0, ndpLeading = 0, ulpLeading = 0;

  Object.entries(state.districts).forEach(([id,d])=>{
    const ndp = (d.candidates||[]).find(c=>c.party==='NDP') || {votes:0};
    const ulp = (d.candidates||[]).find(c=>c.party==='ULP') || {votes:0};
    const vN = Number(ndp.votes||0), vU = Number(ulp.votes||0);
    const declaredN = Number(d.declared?.NDP||0) === 1;
    const declaredU = Number(d.declared?.ULP||0) === 1;

    const hasVotes = (vN+vU)>0;
    const isTie = vN === vU && hasVotes;

    if (declaredN) ndpDeclared++;
    if (declaredU) ulpDeclared++;
    if (!declaredN && !declaredU && hasVotes && !isTie){
      if (vN > vU) ndpLeading++;
      else if (vU > vN) ulpLeading++;
    }

    if (!hasVotes) return;                          // no result -> blank
    if (isTie && !declaredN && !declaredU) return; // tie w/o declaration -> blank

    const lead = Math.abs(vN - vU);

    // seat belongs to declared party if declared, else leader
    let party = null, declaredFlag=false, color;
    if (declaredN && !declaredU) { party='NDP'; declaredFlag=true; color=state.parties['NDP']?.color||'#999'; }
    else if (declaredU && !declaredN) { party='ULP'; declaredFlag=true; color=state.parties['ULP']?.color||'#999'; }
    else if (declaredN && declaredU) {
      if (vN > vU) { party='NDP'; declaredFlag=true; color=state.parties['NDP']?.color||'#999'; }
      else if (vU > vN) { party='ULP'; declaredFlag=true; color=state.parties['ULP']?.color||'#999'; }
      else return; // both declared & tie -> skip
    } else {
      if (vN > vU) { party='NDP'; color=state.leadTint.NDP; }
      else if (vU > vN) { party='ULP'; color=state.leadTint.ULP; }
      else return; // tie but not declared -> skip
    }

    // tooltip lines for the seat square
    let tipLines = [];
    const declText = declaredN ? 'NDP' : (declaredU ? 'ULP' : null);
    if (declText && ((party==='NDP' && vN>=vU) || (party==='ULP' && vU>=vN))) {
      tipLines.push(`${declText} victory +${fmtInt.format(lead)}`);
    } else if (declText) {
      tipLines.push(`${declText} victory`);
      if (!isTie) {
        const leadingText = (vN > vU) ? 'NDP' : 'ULP';
        tipLines.push(`${leadingText} leading +${fmtInt.format(lead)}`);
      } else {
        tipLines.push(`Tie`);
      }
    } else {
      if (isTie) tipLines.push('Tie');
      else tipLines.push(`${party} leading +${fmtInt.format(lead)}`);
    }

    const seatObj = { district: d.name || id, party, declared: declaredFlag, lead, color, tipLines };
    if (party === 'NDP') ndpSeats.push(seatObj);
    else ulpSeats.push(seatObj);
  });

  // within each side: declared first, then largest lead
  ndpSeats.sort((a,b)=> (b.declared - a.declared) || (b.lead - a.lead));
  ulpSeats.sort((a,b)=> (b.declared - a.declared) || (b.lead - a.lead));

  const TOTAL = state.totalSeats || 15;
  const slots = new Array(TOTAL).fill(null);

  // Fill from left with NDP
  for (let i=0; i<ndpSeats.length && i<TOTAL; i++) slots[i] = ndpSeats[i];
  // Fill from right with ULP
  for (let j=0; j<ulpSeats.length && j<TOTAL; j++){
    const idx = TOTAL - 1 - j;
    if (!slots[idx]) slots[idx] = ulpSeats[j];
    else if (ulpSeats[j].lead > slots[idx].lead) slots[idx] = ulpSeats[j];
  }

  slots.forEach(seat=>{
    const div = document.createElement('div');
    div.className = 'seat-square';
    div.style.background = seat ? seat.color : '#d7d7d7';

    if (seat) {
      div.style.cursor = 'pointer';
      div.addEventListener('mouseenter', e=>{
        tooltip.innerHTML = `
          <div class="district-name">${seat.district}</div>
          ${seat.tipLines.map(l=>`<div>${l}</div>`).join('')}
        `;
        showTooltipAt(e.clientX, e.clientY);
      });
      div.addEventListener('mousemove', e=>showTooltipAt(e.clientX, e.clientY));
      div.addEventListener('mouseleave', ()=>{ tooltip.style.display='none'; });
    }
    cont.appendChild(div);
  });

  const declaredCount = slots.filter(s=>s && s.declared).length;
  qs('#seat-summary').textContent = `${declaredCount} / ${TOTAL} decided`;

  // Update party seat counts
  qs('#sc-ndp-declared').textContent = fmtInt.format(ndpDeclared);
  qs('#sc-ndp-leading').textContent  = fmtInt.format(ndpLeading);
  qs('#sc-ulp-declared').textContent = fmtInt.format(ulpDeclared);
  qs('#sc-ulp-leading').textContent  = fmtInt.format(ulpLeading);
}

// ---------- Last updated ----------
function renderLastUpdated(){
  const el = qs('#last-updated');
  if(!el) return;
  if(!state.lastUpdated){
    el.textContent = 'Last updated: —';
    return;
  }
  const d = new Date(state.lastUpdated);
  const fmt = new Intl.DateTimeFormat(undefined, {
      year:'numeric', month:'short', day:'2-digit',
      hour:'numeric', minute:'2-digit'
  });
  el.textContent = `Last updated: ${fmt.format(d)}`;
}

// ---------- Results polling ----------
const RESULTS_URL = 'results.json';
const POLL_MS = 7000;

function mergeResults(data){
  if(!data || !data.districts) return;

  if (data.updatedAt) state.lastUpdated = data.updatedAt;

  Object.entries(data.districts).forEach(([rawName, row])=>{
    const name = canonicalName(rawName);
    const d = state.districts[name];
    if(!d) return;

    // Two-column declaration model:
    if (row.declared && typeof row.declared === 'object') {
      d.declared = {
        NDP: Number(row.declared.NDP || 0),
        ULP: Number(row.declared.ULP || 0)
      };
    } else {
      // backward compatibility (single numeric)
      const single = Number(row.declared || 0);
      d.declared = { NDP: 0, ULP: 0 };
      if (single === 1) {
        const nVotes = Number((row.NDP && row.NDP.votes) || 0);
        const uVotes = Number((row.ULP && row.ULP.votes) || 0);
        if (nVotes >= uVotes) d.declared.NDP = 1; else d.declared.ULP = 1;
      }
    }

    const setParty = (partyKey) => {
      const entry = row[partyKey];
      let votes = 0, swingStr = "0.0%";
      if (typeof entry === 'number') {
        votes = entry;
      } else if (entry && typeof entry === 'object') {
        votes = Number(entry.votes || 0);
        if (entry.swing != null && entry.swing !== "") {
          swingStr = String(entry.swing);
        }
      }
      const cand = (d.candidates || []).find(c=>c.party === partyKey);
      if (cand) {
        cand.votes = votes;
        cand.swing = swingStr; // store raw; display will format
      }
    };

    setParty("NDP");
    setParty("ULP");

    d.totalVotes = (d.candidates||[]).reduce((s,c)=> s + (c.votes||0), 0);
  });
}

function startResultsPolling(){
  const tick = () => {
    fetch(`${RESULTS_URL}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) {
          mergeResults(json);
          applyResults();
        }
      })
      .catch(()=>{})
      .finally(()=> setTimeout(tick, POLL_MS));
  };
  tick();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', ()=>{
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
