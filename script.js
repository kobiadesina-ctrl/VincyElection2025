// ---- Utilities ----
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');

// --------------------
// Global state
// --------------------
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" },
    "New Democratic Party": { color: "#f5c02c" },
  },
  districts: {},
  totalSeats: 15,
  lastUpdated: null
};

// --------------------
// Party aliases + Candidate seeding
// --------------------

// Party aliases (short codes)
state.parties["ULP"] = state.parties["Unity Labour Party"];
state.parties["NDP"] = state.parties["New Democratic Party"];

// Candidate roster (NDP vs ULP)
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
  // make map responsive
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

  // bring to front
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
function onDistrictMove(e, el){
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
      candidates: [
        { party: "NDP", name: cfg.NDP, votes: 0, swing: "0.0%" },
        { party: "ULP", name: cfg.ULP, votes: 0, swing: "0.0%" }
      ],
      totalVotes: 0
    } : { name: nameKey, candidates: [], totalVotes: 0 };
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

  // header cells carry same classes so CSS aligns headings like data cells
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
    if(info && info.candidates && info.candidates.length){
      const winner = info.candidates.slice().sort((a,b)=> (b.votes||0) - (a.votes||0))[0];
      const color = (state.parties[winner.party] && state.parties[winner.party].color) || '#999';
      el.setAttribute('fill', color);
    } else {
      el.setAttribute('fill','#d7d7d7');
    }
    if(!el.classList.contains('district-hover')) el.setAttribute('stroke','transparent');
  });

  renderPopularVote();
  renderSeats();
  renderLegend();
  renderLastUpdated();
}

// Popular vote: 2-segment stacked bar (NDP left, ULP right) with 50% dotted line
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

// Seats widget: hemicycle (true semicircle) with 15 seats
function renderSeats(){
  const svg = qs('#seats'); svg.innerHTML = '';
  const total = state.totalSeats || 15;

  // Build seat data
  const districts = Object.entries(state.districts)
    .sort((a,b)=> (a[1].name||a[0]).localeCompare(b[1].name||b[0]));
  const seatData = [];
  districts.forEach(([id,d])=>{
    if(d && d.candidates && d.candidates.length){
      const sorted = d.candidates.slice().sort((a,b)=> (b.votes||0) - (a.votes||0));
      const winner = sorted[0];
      const runner = sorted[1] || {votes:0};
      seatData.push({
        color: (state.parties[winner.party] && state.parties[winner.party].color) || '#999',
        district: d.name || id,
        party: winner.party,
        lead: (winner.votes||0) - (runner.votes||0)
      });
    } else {
      seatData.push({
        color: '#d7d7d7',
        district: d && d.name ? d.name : id
      });
    }
  });
  while(seatData.length < total) seatData.push({color:'#d7d7d7'});

  const decided = seatData.filter(s=>s.party).length;

  // Hemicycle coordinates: N points along a semicircle
  const N = total;
  const centerX = 130;
  const centerY = 110;   // bottom center
  const radius = 90;     // outer radius
  const seatR = 10;
  for(let i=0;i<N;i++){
    const t = (N === 1) ? 0.5 : i/(N-1);
    const ang = (Math.PI) - (t*Math.PI); // 180°..0°
    const x = centerX + radius * Math.cos(ang);
    const y = centerY - radius * Math.sin(ang);
    const seat = seatData[i];
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', x.toFixed(2));
    c.setAttribute('cy', y.toFixed(2));
    c.setAttribute('r', seatR);
    c.setAttribute('fill', seat.color);
    c.setAttribute('stroke', '#fff');
    if(seat.district){
      c.style.cursor = 'pointer';
      c.addEventListener('mouseenter', e=>{
        const text = seat.party
          ? `<div class="district-name">${seat.district}</div>${seat.party} +${seat.lead} votes`
          : `<div class="district-name">${seat.district}</div><div style="color:var(--muted)">No results</div>`;
        tooltip.innerHTML = text;
        tooltip.style.display = 'block';
        onDistrictMove(e);
      });
      c.addEventListener('mousemove', e=>onDistrictMove(e));
      c.addEventListener('mouseleave', ()=>{ tooltip.style.display='none'; });
    }
    svg.appendChild(c);
  }

  qs('#seat-summary').textContent = decided + ' / ' + total + ' decided';
}

// Legend: show only full party names (no short codes)
function renderLegend(){
  const legend = qs('#legend'); legend.innerHTML = '';
  const fullNames = ["Unity Labour Party", "New Democratic Party"];
  fullNames.forEach(p=>{
    const color = (state.parties[p] && state.parties[p].color) || '#999';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems='center';
    row.style.gap='8px';
    row.style.marginBottom='6px';

    const pill = document.createElement('span');
    pill.style.width='14px';
    pill.style.height='14px';
    pill.style.borderRadius='3px';
    pill.style.display='inline-block';
    pill.style.background = color;

    const label = document.createElement('span');
    label.textContent = p;

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
  // Pretty local time: e.g., Aug 22, 2025, 9:13 PM
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

  // track last updated
  if (data.updatedAt) {
    state.lastUpdated = data.updatedAt;
  }

  Object.entries(data.districts).forEach(([rawName, row])=>{
    const name = canonicalName(rawName);
    const d = state.districts[name];
    if(!d) return;

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
  // 1) Use inline <svg> if present
  const inlineSVG = svgWrapper.querySelector('svg');
  if (inlineSVG) {
    loadSVG(inlineSVG.outerHTML);
  } else {
    // 2) Otherwise, auto-load default map.svg from same folder
    fetch('map.svg', { cache: 'no-store' })
      .then(res => res.ok ? res.text() : null)
      .then(text => { if (text) loadSVG(text); })
      .catch(() => {/* no default map found */});
  }

  // Start polling for results.json
  startResultsPolling();
});
