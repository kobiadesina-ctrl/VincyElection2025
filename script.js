+37
-27

// ---- Utilities ----
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');

// Global state
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" },
    "New Democratic Party": { color: "#f5c02c" },
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

function onDistrictHover(e, el){
  const id = el.getAttribute('data-district') || el.id;

  // bring to front
  el.parentNode.appendChild(el);

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
  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s,c)=>s+(c.votes||0),0);
  const rows = candidates.length
    ? candidates.map(c=>{
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
      }).join('')
    : '<div style="color:var(--muted)">No results yet.</div>';
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
  reader.onload = ev => loadSVG(ev.target.result);
  reader.readAsText(f);
});


// On load
window.addEventListener('DOMContentLoaded', ()=>{
  fetch('map.svg')
    .then(r => r.text())
    .then(loadSVG)
    .catch(err => console.error("Could not load map.svg", err));
});




