// ---- Utilities ----
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');

// --------------------
// Global state
// --------------------
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" }, // declared color
    "New Democratic Party": { color: "#f5c02c" } // declared color
  },
  // additional colors for leading-but-undeclared
  leadTint: {
    ULP: "#f77e81",
    NDP: "#fedda6"
  },
  districts: {},
  totalSeats: 15,
  lastUpdated: null
};

// --------------------
// Party aliases + Candidate seeding
// --------------------
state.parties["ULP"] = state.parties["Unity Labour Party"];
state.parties["NDP"] = state.parties["New Democratic Party"];

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
        declared: 0, // 0 leading-only, 1 declared
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

// --------------------
// ID -> Name normalization for SVG
// --------------------
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

// --------------------
// District hookup
// --------------------
function attachToDistricts(svgRoot){
  const districts = svgRoot.querySelectorAll('[data-district], path[id^="d-"], path[id]');
  districts.forEach(el => {
    if (!el.dataset.origfill) {
      const orig = el.getAttribute('fill');
      el.dataset.origfill = (orig && orig.trim()) ? orig : '#d7d7d7';
    }
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', e => onDistrictHover(e, el));
    el.addEventListener('mouseleave', e => onDistrictOut(e, el));
    el.addEventListener('mousemove', e => onDistrictMove(e, el));
  });
}

// --------------------
// SVG loader
// --------------------
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
  attachToDistricts(svg);
  applyResults();
}

// --------------------
// Hover + Tooltip
// --------------------
function onDistrictHover(e, el){
  const raw = el.getAttribute('data-district') || el.id || '';
  const id = canonicalName(raw);
  if (el.parentNode) el.parentNode.appendChild(el);
  el.classList.add('district-hover');
  renderTooltipFor(id);
  tooltip.style.display = 'block';
  onDistrictMove(e, el);
}
function onDistrictOut(e, el){
  el.classList.remove('district-hover');
  tooltip.style.display = 'none';
}
function onDistrictMove(e){
  const pad = 12;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let left = e.clientX + 12;
  let top = e.clientY + 12;
  if(left + tw + pad > window.innerWidth) left = e.clientX - tw - 16;
  if(top + th + pad > window.innerHeight) top = e.clientY - th - 16;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

// --------------------
// Tooltip renderer (with Swing column)
// --------------------
function renderTooltipFor(districtId){
  const nameKey = canonicalName(districtId);

  let info = state.districts[nameKey];
  if(!info){
    const cfg = CANDIDATE_CONFIG && CANDIDATE_CONFIG[nameKey];
    info = cfg ? {
      name: nameKey,
      declared: 0,
      candidates: [
        { party: "NDP", name: cfg.NDP, votes: 0, swing: "0.0%" },
        { party: "ULP", name: cfg.ULP, votes: 0, swing: "0.0%" }
      ],
      totalVotes: 0
    } : { name: nameKey, declared:0, candidates: [], totalVotes: 0 };
  }

  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s,c)=>s+(c.votes||0),0);

  const partyMeta = (p) => ({
    color: (state.parties[p] && state.parties[p].color) || '#999',
    short: p
  });

  const swingClass = (s) => s?.trim().startsWith('+') ? 'swing-pos' : (s?.trim().startsWith('-') ? 'swing-neg' : 'swing-zero');
  const fmtSwing = (s) => {
    if (typeof s !== 'string') return '0.0%';
    const t = s.trim();
    if (t === '0' || t === '0%' || t === '+0%' || t === '-0%') return '0.0%';
    const m = t.match(/^([+\-]?)(\d+(\.\d+)?)/);
    if (m) return `${m[1] || (parseFloat(m[2])===0 ? '' : '+')}${(+m[2]).toFixed(1)}%`;
    return t;
  };

  const rows = candidates.length ? candidates.map(c=>{
    const meta = partyMeta(c.party || '—');
    const pct = total ? ((c.votes||0)/total*100).toFixed(1) : '0.0';
    const sw = fmtSwing(c.swing);
    return `
      <div class="tt-row">
        <div class="tt-col party-cell">
          <span class="party-chip" style="background:${meta.color}"></span>
          <span class="party-name">${meta.short}</span>
        </div>
        <div class="tt-col candidate-cell">
          <span class="candidate-name">${c.name || '—'}</span>
        </div>
        <div class="tt-col votes-cell">${c.votes || 0}</div>
        <div class="tt-col share-cell">${pct}%</div>
        <div class="tt-col swing-cell ${swingClass(sw)}">${sw}</div>
      </div>
    `;
  }).join('') : '<div style="color:var(--muted)">No results yet.</div>';

  tooltip.innerHTML = `
    <div class="district-name">${info.name || nameKey}</div>
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

// --------------------
// Apply results + widgets
// --------------------
function applyResults(){
  const svg = svgWrapper.querySelector('svg');
  if(!svg) return;

  const districtEls = svg.querySelectorAll('[data-district], path[id^="d-"], path[id]');
  districtEls.forEach(el=>{
    const raw = el.getAttribute('data-district') || el.id || '';
    const id = canonicalName(raw);
    const info = state.districts[id];

    let fillColor = el.dataset.origfill || '#d7d7d7';

    if (info && info.candidates && info.candidates.length) {
      const ndp = info.candidates.find(c => c.party === 'NDP') || { votes: 0 };
      const ulp = info.candidates.find(c => c.party === 'ULP') || { votes: 0 };
      const vN = Number(ndp.votes || 0);
      const vU = Number(ulp.votes || 0);

      if (vN === 0 && vU === 0) {
        fillColor = el.dataset.origfill || '#d7d7d7';
      } else if (vN === vU) {
        fillColor = '#000000'; // non-zero tie
      } else if (vN > vU) {
        fillColor = (state.parties['NDP'] && state.parties['NDP'].color) || '#999';
      } else {
        fillColor = (state.parties['ULP'] && state.parties['ULP'].color) || '#999';
      }

      info.totalVotes = vN + vU;
    }

    el.setAttribute('fill', fillColor);
    if(!el.classList.contains('district-hover')) el.setAttribute('stroke','transparent');
  });

  renderPopularVote();
  renderSeatRow();
  renderLegend();
  renderLastUpdated();
}

// Popular vote: 2-segment stacked bar with vertical 50% marker
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
  const total = totalVotes || (ndpVotes + ulpVotes);
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

  qs('#pv-total').textContent = (totalVotes || 0) + ' votes';
}

// Seat row: 15 squares, coloring rules per declared/leading
function renderSeatRow(){
  const cont = qs('#seats-row');
  if (!cont) return;
  cont.innerHTML = '';

  // Build seat data from districts (alphabetical)
  const districts = Object.entries(state.districts)
    .sort((a,b)=> (a[1].name||a[0]).localeCompare(b[1].name||b[0]));

  const seats = [];
  districts.forEach(([id,d])=>{
    const ndp = (d.candidates||[]).find(c=>c.party==='NDP') || {votes:0};
    const ulp = (d.candidates||[]).find(c=>c.party==='ULP') || {votes:0};
    const vN = Number(ndp.votes||0), vU = Number(ulp.votes||0);
    const diff = Math.abs(vN - vU);

    let party = null;
    let color = '#d7d7d7'; // default grey
    if (vN === 0 && vU === 0) {
      // keep default
    } else if (vN === vU) {
      // tie non-zero → black (but instruction only for map; for seats unspecified)
      // We'll keep default grey in seat row when tied to avoid implying a winner.
      color = '#d7d7d7';
    } else if (vN > vU) {
      party = 'NDP';
      color = d.declared ? (state.parties['NDP']?.color || '#999') : (state.leadTint.NDP);
    } else {
      party = 'ULP';
      color = d.declared ? (state.parties['ULP']?.color || '#999') : (state.leadTint.ULP);
    }

    seats.push({
      district: d.name || id,
      party,
      declared: !!d.declared,
      lead: diff,
      color
    });
  });

  // Ensure exactly 15 squares
  while (seats.length < (state.totalSeats||15)) {
    seats.push({ district: null, party:null, declared:false, lead:0, color:'#d7d7d7' });
  }
  seats.length = state.totalSeats || 15;

  // Render squares
  seats.forEach(seat=>{
    const div = document.createElement('div');
    div.className = 'seat-square';
    div.style.background = seat.color;
    if (seat.district) {
      div.style.cursor = 'pointer';
      div.addEventListener('mouseenter', e=>{
        const status = seat.party
          ? (seat.declared ? 'victory' : 'leading')
          : (seat.lead>0 ? 'leading' : 'No results');
        const line2 = seat.party
          ? `${seat.party} ${seat.declared ? 'victory' : 'leading'} +${seat.lead}`
          : (seat.lead>0 ? `Tie +${seat.lead}` : 'No results');
        tooltip.innerHTML = `
          <div class="district-name">${seat.district}</div>
          <div>${line2}</div>
        `;
        tooltip.style.display='block';
        onDistrictMove(e);
      });
      div.addEventListener('mousemove', e=>onDistrictMove(e));
      div.addEventListener('mouseleave', ()=>{ tooltip.style.display='none'; });
    }
    cont.appendChild(div);
  });

  // Summary: count declared seats
  const declaredCount = seats.filter(s=>s.declared && s.party).length;
  qs('#seat-summary').textContent = `${declaredCount} / ${state.totalSeats||15} decided`;
}

// Legend: full names
function renderLegend(){
  const legend = qs('#legend'); legend.innerHTML = '';
  const items = [
    { label: "Unity Labour Party", color: state.parties["ULP"].color },
    { label: "New Democratic Party", color: state.parties["NDP"].color }
  ];
  items.forEach(it=>{
    const row = document.createElement('div');
    row.style.display='flex';
    row.style.alignItems='center';
    row.style.gap='8px';
    row.style.marginBottom='6px';

    const pill = document.createElement('span');
    pill.style.width='14px';
    pill.style.height='14px';
    pill.style.borderRadius='3px';
    pill.style.display='inline-block';
    pill.style.background = it.color;

    const label = document.createElement('span');
    label.textContent = it.label;

    row.appendChild(pill);
    row.appendChild(label);
    legend.appendChild(row);
  });
}

// --------------------
// Last updated label
// --------------------
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

// --------------------
// Results polling (Option A): results.json
// --------------------
const RESULTS_URL = 'results.json';
const POLL_MS = 7000;

function normalizeSwing(val){
  if (val == null) return "0.0%";
  if (typeof val === 'string') {
    const m = val.trim().match(/^([+\-]?)(\d+(\.\d+)?)/);
    if (!m) return "0.0%";
    const sign = m[1] || (parseFloat(m[2])===0 ? '' : '+');
    return `${sign}${(+m[2]).toFixed(1)}%`;
  }
  if (typeof val === 'number') {
    const sign = val === 0 ? '' : (val > 0 ? '+' : '');
    return `${sign}${Math.abs(val).toFixed(1)}%`;
  }
  return "0.0%";
}

function mergeResults(data){
  if(!data || !data.districts) return;

  if (data.updatedAt) {
    state.lastUpdated = data.updatedAt;
  }

  Object.entries(data.districts).forEach(([rawName, row])=>{
    const name = canonicalName(rawName);
    const d = state.districts[name];
    if(!d) return;

    // declared flag at district level: 0 or 1
    if (typeof row.declared !== 'undefined') {
      d.declared = Number(row.declared) === 1 ? 1 : 0;
    }

    const setParty = (partyKey) => {
      const entry = row[partyKey];
      let votes = 0, swing = "0.0%";
      if (typeof entry === 'number') {
        votes = entry;
      } else if (entry && typeof entry === 'object') {
        votes = Number(entry.votes || 0);
        swing = normalizeSwing(entry.swing);
      }
      const cand = (d.candidates || []).find(c=>c.party === partyKey);
      if (cand) {
        cand.votes = votes;
        cand.swing = swing;
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

// --------------------
// Init (auto-load map.svg; start polling)
// --------------------
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
