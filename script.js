// ---- Utilities ----
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');

// Global state
let state = {
  parties: {
    "Alpha": { color: "#1f77b4" },
    "Beta": { color: "#ff7f0e" },
    "Gamma": { color: "#2ca02c" }
  },
  districts: {},
  totalSeats: 15
};

// Attach hover handlers to districts
function attachToDistricts(svgRoot){
  const districts = svgRoot.querySelectorAll('[data-district], path[id^="d-"]');
  districts.forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', e => onDistrictHover(e, el));
    el.addEventListener('mouseleave', e => onDistrictOut(e, el));
    el.addEventListener('mousemove', e => onDistrictMove(e, el));
  });
}

function onDistrictHover(e, el){
  const id = el.getAttribute('data-district') || el.id;
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

function renderTooltipFor(districtId){
  const info = state.districts[districtId];
  if(!info){
    tooltip.innerHTML = '<div class="district-name">No data</div><div style="color:var(--muted)">No results yet.</div>';
    return;
  }
  const total = info.totalVotes || info.candidates.reduce((s,c)=>s+(c.votes||0),0);
  const rows = info.candidates.map(c=>{
    const party = c.party || '—';
    const color = (state.parties[party] && state.parties[party].color) || '#999';
    const pct = total ? ((c.votes||0)/total*100).toFixed(1) : '0.0';
    return `<div class="candidate-row">
              <div class="candidate-left">
                <div class="party-pill" style="background:${color}"></div>
                <div>
                  <div style="font-weight:600">${c.name}</div>
                  <div style="font-size:12px;color:var(--muted)">${party}</div>
                </div>
              </div>
              <div class="votes">${c.votes || 0} <small style="color:var(--muted)">(${pct}%)</small></div>
            </div>`;
  }).join('');
  tooltip.innerHTML = `<div class="district-name">${info.name || districtId}</div>${rows}<div style="margin-top:8px;color:var(--muted);font-size:12px">Total votes: ${total}</div>`;
}

// Apply results: recolor districts + update widgets
function applyResults(){
  const svg = svgWrapper.querySelector('svg');
  if(!svg) return;
  const districtEls = svg.querySelectorAll('[data-district], path[id^="d-"]');
  districtEls.forEach(el=>{
    const id = el.getAttribute('data-district') || el.id;
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
  const seatCounts = {};
  Object.values(state.districts).forEach(d=>{
    if(d && d.candidates && d.candidates.length){
      const winner = d.candidates.slice().sort((a,b)=> (b.votes||0) - (a.votes||0))[0];
      if(winner && winner.party){
        seatCounts[winner.party] = (seatCounts[winner.party]||0) + 1;
      }
    }
  });
  const svg = qs('#seats'); svg.innerHTML = '';
  const total = state.totalSeats || 15;
  const seats = new Array(total).fill({color:'#d7d7d7'});
  let seatList = [];
  Object.keys(state.parties).forEach(p=>{
    const n = seatCounts[p]||0;
    for(let i=0;i<n;i++) seatList.push(p);
  });
  for(let i=0;i<seatList.length && i<total;i++){
    const p = seatList[i]; seats[i] = {color: state.parties[p].color || '#999'};
  }
  const segW = 12, gap = 3, startX = 10, startY = 14;
  for(let i=0;i<total;i++){
    const g = document.createElementNS('http://www.w3.org/2000/svg','rect');
    g.setAttribute('x', startX + i*(segW+gap));
    g.setAttribute('y', startY);
    g.setAttribute('width', segW);
    g.setAttribute('height', segW);
    g.setAttribute('rx', 2);
    g.setAttribute('ry', 2);
    g.setAttribute('fill', seats[i].color);
    g.setAttribute('stroke', '#fff');
    svg.appendChild(g);
  }
  qs('#seat-summary').textContent = seatList.length + ' / ' + total + ' decided';
}

// Legend
function renderLegend(){
  const legend = qs('#legend'); legend.innerHTML = '';
  Object.keys(state.parties).forEach(p=>{
    const color = state.parties[p].color || '#999';
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.marginBottom='6px';
    row.innerHTML = `<div style="width:18px;height:12px;background:${color};border-radius:3px"></div><div style="font-weight:600">${p}</div>`;
    legend.appendChild(row);
  });
}

// Reset button
qs('#reset-map').addEventListener('click', ()=>{
  const svg = svgWrapper.querySelector('svg');
  if(!svg) return;
  svg.querySelectorAll('[data-district], path[id^="d-"]').forEach(el=>el.setAttribute('fill','#d7d7d7'));
});

// Upload SVG
qs('#svg-file').addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    svgWrapper.innerHTML = ev.target.result;
    const svg = svgWrapper.querySelector('svg');
    if(svg){ attachToDistricts(svg); applyResults(); }
  }
  reader.readAsText(f);
});

// On load
window.addEventListener('DOMContentLoaded', ()=>{
  const svg = svgWrapper.querySelector('svg');
  attachToDistricts(svg);
  applyResults();
});
