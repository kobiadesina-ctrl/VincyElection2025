/************************************************************
 * Design upgrades, minus 25/75 ticks:
 * - Party banner, smooth transitions (+ reduced-motion support)
 * - Tooltip: roomy, scrollable, mobile tap-to-pin; icon never overlaps text
 * - Black text everywhere; swing remains green/red
 * - Keyboard focus support; ESC to close tooltip
 * - Reconnect banner on fetch failures
 * - ARIA labels for seat squares; live last-updated
 ************************************************************/

// ---------- DOM helpers ----------
const qs = s => document.querySelector(s);
const svgWrapper = qs('#svg-wrapper');
const tooltip = qs('#tooltip');
const pvBar = qs('#pv-bar');
const seatsRow = qs('#seats-row');
const lastUpdatedEl = qs('#last-updated');
const reconnectEl = qs('#reconnect');
const fmtInt = new Intl.NumberFormat('en-US');

// ---------- Global state ----------
let state = {
  parties: {
    "Unity Labour Party": { color: "#ed2633" },     // ULP declared color
    "New Democratic Party": { color: "#f5c02c" }    // NDP declared color
  },
  leadTint: { ULP: "#fedfad", NDP: "#fedda6" },     // leading tints
  districts: {},
  totalSeats: 15,
  lastUpdated: null
};

// Short aliases (for convenience)
state.parties["ULP"] = state.parties["Unity Labour Party"];
state.parties["NDP"] = state.parties["New Democratic Party"];

// ---------- Candidates (static names used in tooltips) ----------
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
        declared: { NDP: 0, ULP: 0 }, // {NDP:0/1, ULP:0/1}
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

// ---------- Canonical naming for SVG keys ----------
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

// ---------- Map element targeting ----------
let districtTargets = new Map();
const originalOrder = new WeakMap(); // element -> { parent, nextSibling }

function isMarker(el){ return el && el.hasAttribute('id') && el.hasAttribute('data-district'); }
function isPaintable(el){
  if(!el) return false;
  return ['path','polygon','rect','ellipse','circle'].includes(el.tagName);
}

// Hover/focus handling including z-order bring-to-front
function attachHoverAndFocus(key, targets){
  const enter = e => {
    const name = canonicalName(key);
    renderTooltipFor(name);
    showTooltipAt(e.clientX || (e.touches && e.touches[0]?.clientX) || 0,
                  e.clientY || (e.touches && e.touches[0]?.clientY) || 0);

    // bring to front
    targets.forEach(t=>{
      if(!originalOrder.has(t)) originalOrder.set(t, { parent: t.parentNode, next: t.nextSibling });
      t.parentNode.appendChild(t);
      t.classList.add('district-hover');
    });
  };
  const leave = () => {
    if (!tooltipPinned) tooltip.style.display = 'none';
    targets.forEach(t=>{
      const rec = originalOrder.get(t);
      if(rec && rec.parent) rec.parent.insertBefore(t, rec.next);
      t.classList.remove('district-hover');
    });
  };
  const move = e => {
    if (!tooltipPinned) {
      showTooltipAt(e.clientX, e.clientY);
    }
  };

  // Mouse
  targets.forEach(el=>{
    el.style.cursor = 'pointer';
    el.setAttribute('tabindex','0'); // keyboard focusable
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    // Focus/blur
    el.addEventListener('focus', (e)=>{
      renderTooltipFor(canonicalName(key));
      const bb = el.getBoundingClientRect();
      showTooltipAt(bb.right + 8, bb.top + 8);
      targets.forEach(t=>{
        if(!originalOrder.has(t)) originalOrder.set(t, { parent: t.parentNode, next: t.nextSibling });
        t.parentNode.appendChild(t);
        t.classList.add('district-hover');
      });
    });
    el.addEventListener('blur', leave);

    // Click/tap to pin
    el.addEventListener('click', (e)=>{
      tooltipPinned = !tooltipPinned;
      if (!tooltipPinned) tooltip.style.display = 'none';
      e.stopPropagation();
    });
    // Touchstart to pin (mobile)
    el.addEventListener('touchstart', (e)=>{
      tooltipPinned = true;
      enter(e);
      e.stopPropagation();
    }, {passive:true});
  });
}

function buildTargetsByOrder(svg){
  const map = new Map();
  const ordered = Array.from(svg.querySelectorAll('[id][data-district], path, polygon, rect, ellipse, circle'));
  let currentKey = null;
  for(let i=0;i<ordered.length;i++){
    const el = ordered[i];
    if (isMarker(el)){
      currentKey = el.getAttribute('id') || el.getAttribute('data-district');
      if(!map.has(currentKey)) map.set(currentKey, []);
      continue;
    }
    if(currentKey && isPaintable(el)){
      if(!el.dataset.origfill){
        const orig = el.style.fill || el.getAttribute('fill') || getComputedStyle(el).fill;
        el.dataset.origfill = (orig && orig !== 'none') ? orig : '#d7d7d7';
      }
      el.dataset.districtRef = currentKey;
      map.get(currentKey).push(el);
    }
  }
  return map;
}

function buildDistrictTargets(svg){
  districtTargets = buildTargetsByOrder(svg);
  // Attach handlers
  districtTargets.forEach((targets, key)=>{
    if(!targets || targets.length===0) return;
    attachHoverAndFocus(key, targets);
  });
}

// ---------- Tooltip position / pinning ----------
let tooltipPinned = false;

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

document.addEventListener('click', ()=>{
  if (tooltipPinned) {
    tooltipPinned = false;
    tooltip.style.display = 'none';
  }
});

// ---------- Tooltip renderer ----------
function hexToRGBA(hex, a=0.22){
  let h = hex.replace('#','');
  if(h.length===3) h = h.split('').map(c=>c+c).join('');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// Swing display: keep “+” for non-negative, “-” for negative; strip any “-+”
function formatSwingDisplay(raw){
  if (raw == null || raw === "") return "0.0%";
  const s = String(raw).trim().replace(/^\-\+/, "-").replace(/^\+?\+/, "+");
  const m = s.match(/^([+\-]?)(\d+(\.\d+)?)/);
  if (!m) return s;
  const num = parseFloat((m[1] === "-" ? "-" : "") + m[2]);
  const val = isNaN(num) ? 0 : num;
  const sign = val < 0 ? "-" : "+";
  return `${sign}${Math.abs(val).toFixed(1)}%`;
}

function renderTooltipFor(districtName){
  const info = state.districts[districtName] || {
    name: districtName, declared: {NDP:0,ULP:0}, candidates: [], totalVotes: 0
  };

  const candidates = info.candidates || [];
  const total = info.totalVotes ?? candidates.reduce((s,c)=>s+(c.votes||0),0);

  const ndp = candidates.find(c=>c.party==='NDP') || { votes:0, swing:"0.0%" };
  const ulp = candidates.find(c=>c.party==='ULP') || { votes:0, swing:"0.0%" };
  const vN = Number(ndp.votes||0), vU = Number(ulp.votes||0);

  const declaredN = Number(info.declared?.NDP||0) === 1;
  const declaredU = Number(info.declared?.ULP||0) === 1;
  let declaredParty = null;
  if (declaredN && !declaredU) declaredParty = 'NDP';
  else if (declaredU && !declaredN) declaredParty = 'ULP';
  else if (declaredN && declaredU) {
    // both declared: prefer higher vote if any
    if (vN > vU) declaredParty = 'NDP';
    else if (vU > vN) declaredParty = 'ULP';
  }

  // Declared row background = DECLARED party color (subtle alpha)
  const declaredBg = declaredParty ? hexToRGBA(state.parties[declaredParty].color, 0.22) : 'transparent';

  const order = declaredParty ? [declaredParty, declaredParty === 'NDP' ? 'ULP' : 'NDP'] : ['NDP','ULP'];
  const partyColor = p => (state.parties[p] && state.parties[p].color) || '#999';
  const swingClass = s => (String(s).trim().startsWith('-') ? 'swing-neg' :
                           String(s).trim().startsWith('+') ? 'swing-pos' : 'swing-zero');
  const pct = (v,t)=> t ? ((v||0)/t*100).toFixed(1) : '0.0';

  const rows = order.map(p=>{
    const c = (p==='NDP') ? ndp : ulp;
    const share = pct(c.votes, total);
    const sw = formatSwingDisplay(c.swing);
    const isDeclRow = (declaredParty === p);
    const rowCls = isDeclRow ? ' tt-row--declared' : '';
    const rowStyle = isDeclRow ? ` style="background:${declaredBg}"` : '';
    const hasDeclIcon = (info.declared?.[p] === 1 || info.declared?.[p] === '1');

    return `
      <div class="tt-row${rowCls}"${rowStyle}>
        <div class="tt-col party-cell">
          <span class="party-chip" style="background:${partyColor(p)}"></span>
          <span class="party-name">${p}</span>
        </div>
        <div class="tt-col candidate-cell">
          <span class="candidate-name">${c.name || '—'}</span>
          ${hasDeclIcon ? `<img src="Declaration.svg" alt="Declared" class="declared-icon" />` : ''}
        </div>
        <div class="tt-col votes-cell">${fmtInt.format(c.votes || 0)}</div>
        <div class="tt-col share-cell">${share}%</div>
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

  // Paint each district
  districtTargets.forEach((targets, key)=>{
    if (!targets || !targets.length) return;
    const name = canonicalName(key);
    const info = state.districts[name];
    let fillColor = targets[0].dataset.origfill || '#d7d7d7';

    if (info && info.candidates && info.candidates.length){
      const ndp = info.candidates.find(c=>c.party==='NDP') || { votes:0 };
      const ulp = info.candidates.find(c=>c.party==='ULP') || { votes:0 };
      const vN = Number(ndp.votes||0), vU = Number(ulp.votes||0);
      const declaredN = Number(info.declared?.NDP||0) === 1;
      const declaredU = Number(info.declared?.ULP||0) === 1;

      const hasVotes = (vN + vU) > 0;
      const isTie = vN === vU && hasVotes;

      if (isTie) {
        fillColor = '#000'; // tie & non-zero
      } else if (declaredN && !declaredU) {
        fillColor = state.parties['NDP']?.color || '#999';
      } else if (declaredU && !declaredN) {
        fillColor = state.parties['ULP']?.color || '#999';
      } else if (declaredN && declaredU) {
        if (vN > vU) fillColor = state.parties['NDP']?.color || '#999';
        else if (vU > vN) fillColor = state.parties['ULP']?.color || '#999';
        else fillColor = '#000';
      } else {
        if (!hasVotes) fillColor = targets[0].dataset.origfill || '#d7d7d7';
        else if (vN > vU) fillColor = state.leadTint.NDP;
        else if (vU > vN) fillColor = state.leadTint.ULP;
      }

      info.totalVotes = vN + vU;
    }

    targets.forEach(el=>{ el.style.fill = fillColor; });
  });

  renderPopularVote();
  renderSeatRow();
  renderLastUpdated();
}

// ---------- Popular vote ----------
function renderPopularVote(){
  const totals = { NDP:0, ULP:0 };
  Object.values(state.districts).forEach(d=>{
    (d.candidates||[]).forEach(c=>{
      if (c.party==='NDP' || c.party==='ULP'){
        totals[c.party] += (c.votes||0);
      }
    });
  });

  const ndpVotes = totals.NDP;
  const ulpVotes = totals.ULP;
  const total = ndpVotes + ulpVotes;
  const ndpPct = total ? ndpVotes/total*100 : 0;
  const ulpPct = total ? ulpVotes/total*100 : 0;

  pvBar.classList.remove('is-loading');
  pvBar.innerHTML = '';

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

  qs('#pv-total').textContent = `${fmtInt.format(total)} votes`;
}

// ---------- Seat row & counts ----------
function renderSeatRow(){
  seatsRow.classList.remove('is-loading');
  seatsRow.innerHTML = '';

  const ndpSeats = [];
  const ulpSeats = [];

  let ndpDeclared=0, ulpDeclared=0, ndpLeading=0, ulpLeading=0;

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
      if (vN>vU) ndpLeading++; else if (vU>vN) ulpLeading++;
    }

    if (!hasVotes) return;                          // no result -> blank
    if (isTie && !declaredN && !declaredU) return; // tie w/o declaration -> blank

    const lead = Math.abs(vN - vU);

    // seat belongs to declared party if declared, else leader
    let party=null, declaredFlag=false, color;
    if (declaredN && !declaredU){ party='NDP'; declaredFlag=true; color=state.parties['NDP'].color; }
    else if (declaredU && !declaredN){ party='ULP'; declaredFlag=true; color=state.parties['ULP'].color; }
    else if (declaredN && declaredU){
      if (vN>vU){ party='NDP'; declaredFlag=true; color=state.parties['NDP'].color; }
      else if (vU>vN){ party='ULP'; declaredFlag=true; color=state.parties['ULP'].color; }
      else return;
    } else {
      if (vN>vU){ party='NDP'; color=state.leadTint.NDP; }
      else if (vU>vN){ party='ULP'; color=state.leadTint.ULP; }
      else return;
    }

    const seatObj = { district: d.name || id, party, declared: declaredFlag, lead, color,
      tipLines: buildSeatTipLines(declaredN, declaredU, vN, vU) };
    if (party==='NDP') ndpSeats.push(seatObj); else ulpSeats.push(seatObj);
  });

  // sort: declared first, then biggest lead
  ndpSeats.sort((a,b)=> (b.declared - a.declared) || (b.lead - a.lead));
  ulpSeats.sort((a,b)=> (b.declared - a.declared) || (b.lead - a.lead));

  const TOTAL = state.totalSeats || 15;
  const slots = new Array(TOTAL).fill(null);
  // NDP from left
  for(let i=0;i<ndpSeats.length && i<TOTAL;i++) slots[i]=ndpSeats[i];
  // ULP from right
  for(let j=0;j<ulpSeats.length && j<TOTAL;j++){
    const idx = TOTAL-1-j;
    if(!slots[idx]) slots[idx]=ulpSeats[j];
    else if (ulpSeats[j].lead > slots[idx].lead) slots[idx]=ulpSeats[j];
  }

  slots.forEach(seat=>{
    const div = document.createElement('div');
    div.className = 'seat-square';
    div.style.background = seat ? seat.color : '#d7d7d7';
    if (seat){
      div.setAttribute('role','button');
      div.setAttribute('tabindex','0');
      const aria = seat.tipLines.join('. ');
      div.setAttribute('aria-label', `${seat.district}. ${aria}`);
      div.style.cursor='pointer';
      div.addEventListener('mouseenter', e=>{
        tooltip.innerHTML = `<div class="district-name">${seat.district}</div>${seat.tipLines.map(l=>`<div>${l}</div>`).join('')}`;
        showTooltipAt(e.clientX, e.clientY);
      });
      div.addEventListener('mousemove', e=>showTooltipAt(e.clientX, e.clientY));
      div.addEventListener('mouseleave', ()=>{ if(!tooltipPinned) tooltip.style.display='none'; });
      div.addEventListener('focus', ()=>{
        const bb = div.getBoundingClientRect();
        tooltip.innerHTML = `<div class="district-name">${seat.district}</div>${seat.tipLines.map(l=>`<div>${l}</div>`).join('')}`;
        showTooltipAt(bb.right+8, bb.top+8);
      });
      div.addEventListener('blur', ()=>{ if(!tooltipPinned) tooltip.style.display='none'; });
      div.addEventListener('click', e=>{ tooltipPinned=!tooltipPinned; if(!tooltipPinned) tooltip.style.display='none'; e.stopPropagation(); });
    }
    seatsRow.appendChild(div);
  });

  const declaredCount = slots.filter(s=>s && s.declared).length;
  qs('#seat-summary').textContent = `${declaredCount} / ${TOTAL} decided`;

  // Update per-party counts line
  qs('#sc-ndp-declared').textContent = fmtInt.format(ndpDeclared);
  qs('#sc-ndp-leading').textContent  = fmtInt.format(ndpLeading);
  qs('#sc-ulp-declared').textContent = fmtInt.format(ulpDeclared);
  qs('#sc-ulp-leading').textContent  = fmtInt.format(ulpLeading);
}

function buildSeatTipLines(declaredN, declaredU, vN, vU){
  const hasVotes = (vN+vU)>0;
  const isTie = hasVotes && vN===vU;
  const lead = Math.abs(vN - vU);
  const lines = [];
  const leader = vN>vU ? 'NDP' : (vU>vN ? 'ULP' : null);

  if (declaredN && !declaredU){
    if (leader==='NDP') lines.push(`NDP victory +${fmtInt.format(lead)}`); else lines.push(`NDP victory`);
  } else if (declaredU && !declaredN){
    if (leader==='ULP') lines.push(`ULP victory +${fmtInt.format(lead)}`); else lines.push(`ULP victory`);
  } else if (declaredN && declaredU){
    if (leader==='NDP') lines.push(`NDP victory +${fmtInt.format(lead)}`);
    else if (leader==='ULP') lines.push(`ULP victory +${fmtInt.format(lead)}`);
    else lines.push(`Declared (tie)`);
  } else {
    if (isTie) lines.push('Tie');
    else if (leader) lines.push(`${leader} leading +${fmtInt.format(lead)}`);
  }
  return lines;
}

// ---------- Last updated ----------
function renderLastUpdated(){
  if(!state.lastUpdated){
    lastUpdatedEl.textContent = 'Last updated: —';
    return;
  }
  const d = new Date(state.lastUpdated);
  const fmt = new Intl.DateTimeFormat(undefined, {
    year:'numeric', month:'short', day:'2-digit', hour:'numeric', minute:'2-digit'
  });
  lastUpdatedEl.textContent = `Last updated: ${fmt.format(d)}`;
}

// ---------- Results polling ----------
const RESULTS_URL = 'results.json';
const POLL_MS = 7000;
let hadFailure = false;

function mergeResults(data){
  if(!data || !data.districts) return;
  if (data.updatedAt) state.lastUpdated = data.updatedAt;

  Object.entries(data.districts).forEach(([rawName, row])=>{
    const name = canonicalName(rawName);
    const d = state.districts[name];
    if(!d) return;

    // declared object {NDP, ULP}
    if (row.declared && typeof row.declared === 'object'){
      d.declared = { NDP: Number(row.declared.NDP||0), ULP: Number(row.declared.ULP||0) };
    } else {
      // backward-compat (single number)
      const single = Number(row.declared||0);
      d.declared = { NDP:0, ULP:0 };
      if (single===1){
        const n = Number(row?.NDP?.votes||0);
        const u = Number(row?.ULP?.votes||0);
        if (n>=u) d.declared.NDP=1; else d.declared.ULP=1;
      }
    }

    const setParty = (partyKey)=>{
      const entry = row[partyKey];
      let votes=0, swingStr="0.0%";
      if (typeof entry==='number'){ votes=entry; }
      else if (entry && typeof entry==='object'){
        votes = Number(entry.votes||0);
        if (entry.swing!=null && entry.swing!=="") swingStr = String(entry.swing);
      }
      const cand = (d.candidates||[]).find(c=>c.party===partyKey);
      if (cand){ cand.votes=votes; cand.swing=swingStr; }
    };
    setParty('NDP'); setParty('ULP');

    d.totalVotes = (d.candidates||[]).reduce((s,c)=>s+(c.votes||0),0);
  });
}

function startResultsPolling(){
  const tick = () => {
    fetch(`${RESULTS_URL}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => {
        hadFailure = false;
        reconnectEl.hidden = true;
        if (json) {
          mergeResults(json);
          applyResults();
        }
      })
      .catch(()=> {
        if (!hadFailure){
          hadFailure = true;
          reconnectEl.hidden = false;
        }
      })
      .finally(()=> setTimeout(tick, POLL_MS));
  };
  tick();
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

// ---------- Init & global keys ----------
document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape'){
    tooltipPinned = false;
    tooltip.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', ()=>{
  // Load map.svg (lazy)
  const inlineSVG = svgWrapper.querySelector('svg');
  if (inlineSVG) {
    loadSVG(inlineSVG.outerHTML);
  } else {
    fetch('map.svg', { cache: 'no-store' })
      .then(res => res.ok ? res.text() : null)
      .then(text => { if (text) loadSVG(text); })
      .catch(()=>{});
  }
  // Start polling results
  startResultsPolling();
});
