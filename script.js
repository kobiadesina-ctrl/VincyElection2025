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
  totalSeats: 15
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
          { party: "NDP", name: pair.NDP, votes: 0 },
          { party: "ULP", name: pair.ULP, votes: 0 },
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
// Tooltip renderer (always renders default layout)
// --------------------
function renderTooltipFor(districtId){
  // Normalize (e.g., "NW" -> "North Windward")
  const nameKey = canonicalName(districtId);

  // Prefer seeded data; if missing, synthesize from CANDIDATE_CONFIG so we never show "No data"
  let info = state.districts[nameKey];
  if(!info){
    const cfg = CANDIDATE_CONFIG && CANDIDATE_CONFIG[nameKey];
    info = cfg ? {
      name: nameKey,
      candidates: [
        { party: "NDP", name: cfg.NDP, votes: 0 },
        { party: "ULP", name: cfg.ULP, votes: 0 }
      ],
      totalVotes: 0
    } : { name: nameKey, candidates: [], totalVotes: 0 };
  }

  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s,c)=>s+(c.votes||0),0);

  // Party meta + logos
  const partyMeta = (p) => {
    const meta = {
      color: (state.parties[p] && state.parties[p].color) || '#999',
      short: p,
      logo: null
    };
    if (p === 'NDP') meta.logo = 'NDP logo.png';
    if (p === 'ULP') meta.logo = 'ULP logo.png';
    return meta;
  };

  const rows = candidates.length ? candidates.map(c=>{
    const meta = partyMeta(c.party || '—');
    const pct = total ? ((c.votes||0)/total*100).toFixed(1) : '0.0';
    const logoImg = meta.logo
      ? `<img class="party-logo" src="${meta.logo}" alt="${c.party} logo" />`
      : '';
    return `
      <div class="tt-row">
        <div class="tt-col party-cell">
          <span class="party-chip" style="background:${meta.color}"></span>
          <span class="party-name">${meta.short}</span>
        </div>
        <div class="tt-col candidate-cell">
          ${logoImg}<span class="candidate-name">${c.name || '—'}</span>
        </div>
        <div class="tt-col votes-cell">${c.votes || 0}</div>
        <div class="tt-col share-cell">${pct}%</div>
      </div>
    `;
  }).join('') : '<div style="color:var(--muted)">No results yet.</div>';

  tooltip.innerHTML = `
    <div class="district-name">${info.name || nameKey}</div>
    <div class="tt-header">
      <div class="tt-col">Party</div>
      <div class="tt-col">Candidate</div>
      <div class="tt-col">Votes</div>
      <div class="tt-col">Share</div>
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
}

// Popular vote bar
function renderPopularVote(){
  const partyTotals = {};
  let totalVotes = 0;
  Object.values(state.districts).forEach(d=>{
    (d.candidates||[]).forEach(c=>{
      partyTotals[c.party] = (partyTotals[c.party] || 0) + (c.votes||0);
      totalVotes += (c.votes||0);
    });
  });
  const pvBar = qs('#pv-bar'); pvBar.innerHTML = '';
  Object.keys(state.parties).forEach(p=>{
    const v = partyTotals[p] || 0;
    const w = totalVotes ? (v/totalVotes*100) : 0;
    if(w>0){
      const seg = document.createElement('div');
      seg.className = 'pv-seg';
      seg.style.width = w + '%';
      seg.style.background = state.parties[p].color || '#999';
      seg.textContent = Math.round(w) + '%';
      seg.title = p + ': ' + v + ' votes';
      pvBar.appendChild(seg);
    }
  });
  qs('#pv-total').textContent = totalVotes + ' votes';
}

// Seats widget
function renderSeats(){
  const svg = qs('#seats'); svg.innerHTML = '';
  const total = state.totalSeats || 15;

  // build seat data with winner info and lead margin
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

  // arrange seats in semicircle: rows 5-4-3-2-1
  const rows = [5,4,3,2,1];
  const radius = 10;
  const centerX = 130;
  const spacingX = 20;
  const spacingY = 14;
  const startY = radius + (rows.length-1)*spacingY;
  let idx = 0;
  for(let r=0;r<rows.length && idx<total;r++){
    const n = rows[r];
    const y = startY - r*spacingY;
    for(let i=0;i<n && idx<total;i++,idx++){
      const seat = seatData[idx];
      const x = centerX + (i - (n-1)/2)*spacingX;
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', radius);
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
  }
  qs('#seat-summary').textContent = decided + ' / ' + total + ' decided';
}

// Legend
function renderLegend(){
  const legend = qs('#legend'); legend.innerHTML = '';
  Object.keys(state.parties).forEach(p=>{
    const color = state.parties[p].color || '#999';
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
// File input + reset
// --------------------
function bindUI(){
  const fileInput = qs('#svg-file');
  const resetBtn = qs('#reset-map');

  if(fileInput){
    fileInput.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const text = String(ev.target.result);
        loadSVG(text);
      };
      reader.readAsText(f);
    });
  }

  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      // zero out votes but keep candidates
      Object.values(state.districts).forEach(d=>{
        d.totalVotes = 0;
        (d.candidates||[]).forEach(c=> c.votes = 0);
      });
      applyResults();
    });
  }
}

// --------------------
// Init (auto-load map.svg if present)
// --------------------
document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();

  // 1) Use inline <svg> if present
  const inlineSVG = svgWrapper.querySelector('svg');
  if (inlineSVG) {
    loadSVG(inlineSVG.outerHTML);
    return;
  }

  // 2) Otherwise, auto-load default map.svg from same folder
  fetch('map.svg', { cache: 'no-store' })
    .then(res => res.ok ? res.text() : null)
    .then(text => { if (text) loadSVG(text); })
    .catch(() => {/* user can upload manually */});
});
