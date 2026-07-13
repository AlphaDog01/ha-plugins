/**
 * hades-budget-card.js  v12
 *
 * custom:hades-budget-card        — TV: current month only, no tabs, footer at bottom
 * custom:hades-budget-all-card    — Desktop: 3-tab month selector, scrollable
 * custom:hades-budget-week-card   — Compact current week card
 * custom:hades-budget-mobile-card — Mobile: stacked weeks, sticky footer, large fonts
 *
 * Resource: /local/hades-budget-card.js?v=11
 */

const BUDGET_API = 'https://nexus.cnyhades.com/api/budget';

// ── Vault token cache ─────────────────────────────────────────────────────────
let _vaultToken = null;
let _vaultExpiry = 0;

async function getHeaders(hass) {
  const now = Date.now();
  if (_vaultToken && now < _vaultExpiry) {
    return { 'X-API-Key': _vaultToken };
  }

  try {
    const result = await hass.callApi('GET', 'hades_household/vault_token/budget-api');
    const token = result?.token;

    if (token) {
      _vaultToken = token;
      _vaultExpiry = now + 55_000;
      return { 'X-API-Key': token };
    }

    console.warn('[hades-budget-card] No token returned from vault_token endpoint.');
    return {};
  } catch (e) {
    console.error('[hades-budget-card] vault_token endpoint failed:', e);
    return {};
  }
}

function fmt(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function styleColor(s) {
  return { strong: '#00D4A8', tight: '#F97316', zero: '#EF4444', 'rent-week': '#A855F7' }[s] || '#94A3B8';
}
function styleLabel(s) {
  return { strong: 'Healthy', tight: 'Tight', zero: 'Zero Out', 'rent-week': 'Rent Week' }[s] || s;
}
function tagBadge(tag) {
  const map = {
    ach:     { label: 'ACH',     bg: 'rgba(79,195,247,0.18)',  color: '#4FC3F7' },
    early:   { label: 'Early',   bg: 'rgba(0,212,168,0.18)',   color: '#00D4A8' },
    split:   { label: 'Split',   bg: 'rgba(255,193,7,0.18)',   color: '#FFC107' },
    locked:  { label: 'Locked',  bg: 'rgba(239,68,68,0.18)',   color: '#EF4444' },
    onemain: { label: 'OneMain', bg: 'rgba(168,85,247,0.18)',  color: '#A855F7' },
    rent:    { label: 'Rent',    bg: 'rgba(192,132,252,0.18)', color: '#C084FC' },
  };
  const t = map[tag];
  if (!t) return '';
  return `<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${t.bg};color:${t.color};font-weight:700;white-space:nowrap;letter-spacing:0.3px">${t.label}</span>`;
}
function donut(pct, color, size) {
  const s = size||80, r = s*0.37, cx = s/2, cy = s/2, sw = s*0.08;
  const circ = 2*Math.PI*r, dash = Math.min(pct,100)/100*circ;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${dash} ${circ}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy+1}" text-anchor="middle" dominant-baseline="middle"
      fill="${color}" font-size="${s*0.18}" font-weight="700"
      font-family="DM Sans,sans-serif">${Math.round(pct)}%</text>
  </svg>`;
}

const DOLLAR_SVG  = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#4FC3F7" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/></svg>`;
const BILLS_SVG   = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F87171" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>`;
const SURPLUS_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00D4A8" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;

const BG_MAIN   = 'linear-gradient(160deg,#0d1b2e 0%,#080f1a 100%)';
const BG_HEADER = 'linear-gradient(160deg,#0c1829 0%,#070e1a 100%)';
const BG_WEEK   = 'linear-gradient(160deg,#101e33 0%,#090f1d 100%)';
const BG_FOOTER = 'linear-gradient(160deg,#0e1c30 0%,#080f1a 100%)';

const BASE_CSS = `
  :host { display: block; font-family: 'DM Sans','Segoe UI',sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .card {
    background: ${BG_MAIN};
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; overflow: hidden; color: #E2E8F0;
  }
  .loading, .error { padding: 40px; text-align: center; color: rgba(255,255,255,0.3); font-size: 14px; }
  .error { color: #EF4444; }
  .spinner {
    width: 26px; height: 26px;
    border: 3px solid rgba(255,255,255,0.08); border-top-color: #00D4A8;
    border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const HEADER_CSS = `
  .header {
    display: flex; align-items: center;
    padding: 10px 16px;
    background: ${BG_HEADER};
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .h-icon {
    width: 44px; height: 44px; border-radius: 10px;
    background: linear-gradient(135deg,rgba(79,195,247,0.2),rgba(0,212,168,0.1));
    border: 1px solid rgba(79,195,247,0.2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-right: 12px;
  }
  .h-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.28); margin-bottom: 1px; }
  .h-total   { font-size: 26px; font-weight: 800; color: #fff; line-height: 1; letter-spacing: -0.5px; }
  .h-sub     { font-size: 9px; color: rgba(255,255,255,0.22); margin-top: 2px; }
  .h-right   { margin-left: auto; display: flex; align-items: center; gap: 0; }
  .h-div     { width: 1px; height: 36px; background: rgba(255,255,255,0.07); margin: 0 18px; flex-shrink: 0; }
  .h-person  { text-align: right; }
  .h-p-lbl   { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.28); margin-bottom: 2px; }
  .h-p-val   { font-size: 18px; font-weight: 700; line-height: 1; }
`;

const WEEK_CSS = `
  .week-row { display: flex; gap: 8px; padding: 8px; flex-wrap: wrap; }
  .wk {
    flex: 1; min-width: 280px;
    background: ${BG_WEEK};
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px; overflow: hidden;
    display: flex; flex-direction: column;
    border-top: 3px solid transparent;
  }
  .wk-head {
    padding: 8px 10px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex; align-items: flex-start; justify-content: space-between; gap: 4px;
  }
  .wk-num  { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .wk-date { font-size: 9px; color: rgba(255,255,255,0.32); margin-top: 2px; }
  .wk-badge { font-size: 8px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.3px; white-space: nowrap; flex-shrink: 0; }
  .wk-stats {
    display: grid; grid-template-columns: repeat(3,1fr);
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .wk-s-lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: rgba(255,255,255,0.25); margin-bottom: 2px; }
  .wk-s-val { font-size: 13px; font-weight: 700; }
  .wk-bills { padding: 4px 10px; flex: 1; }
  .br { display: flex; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 4px; }
  .br:last-child { border-bottom: none; }
  .br-info { flex: 1; min-width: 0; }
  .br-name { font-size: 11px; font-weight: 500; color: #CBD5E1; }
  .br-note { font-size: 9px; color: rgba(255,255,255,0.24); margin-top: 1px; }
  .br-tags { display: flex; gap: 2px; flex-wrap: wrap; justify-content: flex-end; }
  .br-amt  { font-size: 11px; font-weight: 700; color: #F87171; white-space: nowrap; min-width: 46px; text-align: right; }
  .wk-note { padding: 5px 10px 7px; font-size: 9px; color: rgba(255,255,255,0.25); line-height: 1.4; border-top: 1px solid rgba(255,255,255,0.04); }
  @media (max-width: 600px) {
    .week-row { flex-wrap: wrap; }
    .wk { min-width: 100%; }
  }
`;

const FOOTER_CSS = `
  .footer {
    background: ${BG_FOOTER};
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .f-inner { display: flex; align-items: center; padding: 12px 20px; gap: 0; }
  .f-block { display: flex; align-items: center; gap: 12px; flex: 1; }
  .f-ico { width: 40px; height: 40px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .f-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.28); margin-bottom: 3px; }
  .f-val { font-size: 22px; font-weight: 800; line-height: 1; }
  .f-sub { font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 3px; }
  .f-div { width: 1px; height: 44px; background: rgba(255,255,255,0.07); margin: 0 22px; flex-shrink: 0; }
  .f-donut-wrap { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .f-d-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.28); margin-bottom: 3px; }
  .f-d-val { font-size: 22px; font-weight: 800; line-height: 1; }
  .f-d-sub { font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 3px; }
`;

function renderHeader(d, meta, mikeTot, heatherTot) {
  return `
    <div class="header">
      <div class="h-icon">${DOLLAR_SVG}</div>
      <div class="h-main">
        <div class="h-eyebrow">Total Month Income</div>
        <div class="h-total">${fmt(d.total_income)}</div>
        <div class="h-sub">${meta.sub||''}</div>
      </div>
      <div class="h-right">
        <div class="h-div"></div>
        <div class="h-person">
          <div class="h-p-lbl">Mike</div>
          <div class="h-p-val" style="color:#00D4A8">${fmt(mikeTot)}</div>
        </div>
        <div class="h-div"></div>
        <div class="h-person">
          <div class="h-p-lbl">Heather</div>
          <div class="h-p-val" style="color:#A855F7">${fmt(heatherTot)}</div>
        </div>
        <div class="h-div"></div>
        <div class="h-person">
          <div class="h-p-lbl">Total Income</div>
          <div class="h-p-val" style="color:#4FC3F7">${fmt(d.total_income)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderWeekRow(weeks) {
  let html = `<div class="week-row">`;
  weeks.forEach((w, i) => {
    const sc = styleColor(w.style);
    const sl = styleLabel(w.style);
    const bc = w.balance_left>500?'#00D4A8':w.balance_left>0?'#F97316':'#EF4444';
    const bills = (w.bills||[]).map(b=>`
      <div class="br">
        <div class="br-info">
          <div class="br-name">${b.name}</div>
          ${b.note?`<div class="br-note">${b.note}</div>`:''}
        </div>
        <div class="br-tags">${(b.tags||[]).map(tagBadge).join('')}</div>
        <div class="br-amt">-${fmt(b.amount)}</div>
      </div>`).join('')
      ||`<div style="font-size:10px;color:rgba(255,255,255,0.2);padding:4px 0">No bills</div>`;
    html += `
      <div class="wk" style="border-top-color:${sc}">
        <div class="wk-head">
          <div>
            <div class="wk-num" style="color:${sc}">Week ${i+1}</div>
            <div class="wk-date">${w.date} — ${w.day}</div>
          </div>
          <span class="wk-badge" style="background:${sc}22;color:${sc}">${sl}</span>
        </div>
        <div class="wk-stats">
          <div><div class="wk-s-lbl">Income</div><div class="wk-s-val" style="color:#4CAF50">${fmt(w.income?.total)}</div></div>
          <div><div class="wk-s-lbl">↑ Bills</div><div class="wk-s-val" style="color:#F87171">${fmt(w.bills_total)}</div></div>
          <div><div class="wk-s-lbl">Left Over</div><div class="wk-s-val" style="color:${bc}">${fmt(w.balance_left)}</div></div>
        </div>
        <div class="wk-bills">${bills}</div>
        ${w.note?`<div class="wk-note">${w.note}</div>`:''}
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

function renderFooter(d) {
  const surplus  = d.surplus||0;
  const sc       = surplus>1000?'#00D4A8':surplus>0?'#F97316':'#EF4444';
  const leftPct  = d.total_income>0?(surplus/d.total_income)*100:0;
  const billsPct = d.total_income>0?(d.total_bills/d.total_income)*100:0;
  const txCount  = (d.weeks||[]).reduce((s,w)=>s+(w.bills||[]).length,0);
  return `
    <div class="footer">
      <div class="f-inner">
        <div class="f-block">
          <div class="f-ico" style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.15)">${BILLS_SVG}</div>
          <div>
            <div class="f-lbl">Total Bills</div>
            <div class="f-val" style="color:#F87171">${fmt(d.total_bills)}</div>
            <div class="f-sub">${Math.round(billsPct)}% of income · ${txCount} transactions</div>
          </div>
        </div>
        <div class="f-div"></div>
        <div class="f-block">
          <div class="f-ico" style="background:rgba(0,212,168,0.12);border:1px solid rgba(0,212,168,0.15)">${SURPLUS_SVG}</div>
          <div>
            <div class="f-lbl">Total Left Over</div>
            <div class="f-val" style="color:${sc}">${fmt(surplus)}</div>
            <div class="f-sub">Remaining after bills</div>
          </div>
        </div>
        <div class="f-div"></div>
        <div class="f-donut-wrap">
          ${donut(leftPct, sc, 72)}
          <div>
            <div class="f-d-lbl">Left Over</div>
            <div class="f-d-val" style="color:${sc}">${Math.round(leftPct)}%</div>
            <div class="f-d-sub">of total income</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 — hades-budget-card (TV)
// ══════════════════════════════════════════════════════════════════════════════
class HadesBudgetCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._data=null;this._loading=true;this._error=null;this._initialized=false;this._hass=null;}
  setConfig(c){this._config=c;}
  set hass(h){this._hass=h;if(!this._initialized){this._initialized=true;this._render();this._load();}}
  async _load(){
    try{
      const HEADERS=await getHeaders(this._hass);const r1=await fetch(`${BUDGET_API}/v1/months`,{headers:HEADERS});
      const j1=await r1.json(); const months=j1.months||[];
      if(!months.length){this._error='No budget data';this._loading=false;this._render();return;}
      const now=new Date();
      const names=['january','february','march','april','may','june','july','august','september','october','november','december'];
      const curId=`${names[now.getMonth()]}-${now.getFullYear()}`;
      const target=months.find(m=>m.id===curId)||months[0];
      const r2=await fetch(`${BUDGET_API}/v1/month/${target.id}`,{headers:HEADERS});
      this._data=await r2.json(); this._meta=target; this._loading=false; this._render();
    }catch(e){this._error='Failed to load';this._loading=false;this._render();}
  }
  _render(){
    const sh=this.shadowRoot;
    sh.innerHTML=`<style>${BASE_CSS}${HEADER_CSS}${WEEK_CSS}${FOOTER_CSS}.card{display:flex;flex-direction:column;}.card-body{flex:1;}</style><div class="card" id="root"></div>`;
    const root=sh.getElementById('root');
    if(this._loading){root.innerHTML=`<div class="loading"><div class="spinner"></div>Loading…</div>`;return;}
    if(this._error){root.innerHTML=`<div class="error">${this._error}</div>`;return;}
    const d=this._data; const meta=this._meta||{};
    const mikeTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.mike||0),0);
    const heatherTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.heather||0),0);
    root.innerHTML=`${renderHeader(d,meta,mikeTot,heatherTot)}<div class="card-body">${renderWeekRow(d.weeks||[])}</div>${renderFooter(d)}`;
  }
  getCardSize(){return 10;} static getStubConfig(){return {};}
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 2 — hades-budget-all-card (Desktop)
// ══════════════════════════════════════════════════════════════════════════════
class HadesBudgetAllCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._months=[];this._activeId=null;this._monthData=null;this._loading=true;this._error=null;this._initialized=false;this._hass=null;}
  setConfig(c){this._config=c;}
  set hass(h){this._hass=h;if(!this._initialized){this._initialized=true;this._render();this._loadMonths();}}
  async _loadMonths(){
    try{
      const HEADERS=await getHeaders(this._hass);const r=await fetch(`${BUDGET_API}/v1/months`,{headers:HEADERS});
      const j=await r.json(); this._months=j.months||[];
      if(this._months.length){this._activeId=this._months[0].id;await this._loadMonth(this._activeId);}
      else{this._loading=false;this._render();}
    }catch(e){this._error='Failed to load';this._loading=false;this._render();}
  }
  async _loadMonth(id){
    this._loading=true;this._render();
    try{
      const HEADERS=await getHeaders(this._hass);const r=await fetch(`${BUDGET_API}/v1/month/${id}`,{headers:HEADERS});
      this._monthData=await r.json(); this._loading=false; this._render();
    }catch(e){this._error='Failed to load month';this._loading=false;this._render();}
  }
  _render(){
    const sh=this.shadowRoot;
    sh.innerHTML=`<style>${BASE_CSS}${HEADER_CSS}${WEEK_CSS}${FOOTER_CSS}
      .tabs{display:flex;background:linear-gradient(90deg,#080f1a,#0a1220);border-bottom:1px solid rgba(255,255,255,0.06);}
      .tab{flex:1;padding:11px 0;text-align:center;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.28);background:transparent;border:none;cursor:pointer;position:relative;transition:color 0.2s;}
      .tab:hover{color:rgba(255,255,255,0.6);}.tab.active{color:#4FC3F7;}
      .tab.active::after{content:'';position:absolute;bottom:0;left:25%;right:25%;height:2px;background:linear-gradient(90deg,#4FC3F7,#00D4A8);border-radius:2px 2px 0 0;}
      .body{max-height:78vh;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
      .footer{margin:0 8px 8px;border:1px solid rgba(255,255,255,0.07);border-radius:10px;}
    </style><div class="card" id="root"></div>`;
    const root=sh.getElementById('root');
    root.innerHTML=`<div class="tabs">${this._months.map(m=>`<button class="tab ${m.id===this._activeId?'active':''}" data-id="${m.id}">${m.name} ${m.year}</button>`).join('')}</div><div class="body" id="body"></div>`;
    root.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.id!==this._activeId){this._activeId=btn.dataset.id;this._loadMonth(this._activeId);}}));
    const body=root.querySelector('#body');
    if(this._loading){body.innerHTML=`<div class="loading"><div class="spinner"></div>Loading…</div>`;return;}
    if(this._error){body.innerHTML=`<div class="error">${this._error}</div>`;return;}
    const d=this._monthData; if(!d){body.innerHTML=`<div class="loading">No data</div>`;return;}
    const meta=this._months.find(m=>m.id===this._activeId)||{};
    const mikeTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.mike||0),0);
    const heatherTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.heather||0),0);
    body.innerHTML=`${renderHeader(d,meta,mikeTot,heatherTot)}${renderWeekRow(d.weeks||[])}${renderFooter(d)}`;
  }
  getCardSize(){return 10;} static getStubConfig(){return {};}
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 3 — hades-budget-week-card (Compact week)
// ══════════════════════════════════════════════════════════════════════════════
class HadesBudgetWeekCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._week=null;this._loading=true;this._error=null;this._initialized=false;this._hass=null;}
  setConfig(c){this._config=c;}
  set hass(h){this._hass=h;if(!this._initialized){this._initialized=true;this._render();this._loadWeek();}}
  async _loadWeek(){
    try{const HEADERS=await getHeaders(this._hass);const r=await fetch(`${BUDGET_API}/v1/week/current`,{headers:HEADERS});this._week=await r.json();this._loading=false;this._render();}
    catch(e){this._error='Failed to load week';this._loading=false;this._render();}
  }
  _render(){
    const sh=this.shadowRoot;
    sh.innerHTML=`<style>${BASE_CSS}
      .card{padding:0;}
      .banner{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:${BG_HEADER};border-bottom:1px solid rgba(255,255,255,0.06);border-top:3px solid transparent;}
      .b-eyebrow{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.28);margin-bottom:4px;}
      .b-title{font-size:18px;font-weight:700;color:#E2E8F0;}
      .b-date{font-size:11px;color:rgba(255,255,255,0.32);margin-top:3px;}
      .b-badge{font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;letter-spacing:0.4px;}
      .stats-row{display:grid;grid-template-columns:repeat(4,1fr);background:${BG_MAIN};border-bottom:1px solid rgba(255,255,255,0.05);}
      .sc{padding:11px 16px;border-right:1px solid rgba(255,255,255,0.05);}
      .sc:last-child{border-right:none;}
      .sc-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.28);margin-bottom:4px;}
      .sc-val{font-size:18px;font-weight:700;}
      .bills-section{padding:10px 18px 6px;}
      .bills-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.25);padding:4px 0 8px;}
      .br{display:flex;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:6px;}
      .br:last-child{border-bottom:none;}
      .br-name{font-size:13px;color:#CBD5E1;}
      .br-note{font-size:10px;color:rgba(255,255,255,0.26);margin-top:1px;}
      .br-tags{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;}
      .br-amt{font-size:13px;font-weight:700;color:#F87171;white-space:nowrap;min-width:60px;text-align:right;}
      .bottom{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:${BG_FOOTER};border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;}
      .bot-note{font-size:11px;color:rgba(255,255,255,0.28);flex:1;padding-right:14px;}
      .bot-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.28);text-align:right;margin-bottom:2px;}
      .bot-val{font-size:24px;font-weight:800;text-align:right;}
    </style><div class="card" id="root"></div>`;
    const root=sh.getElementById('root');
    if(this._loading){root.innerHTML=`<div class="loading"><div class="spinner"></div>Loading…</div>`;return;}
    if(this._error){root.innerHTML=`<div class="error">${this._error}</div>`;return;}
    const w=this._week; const sc=styleColor(w.style); const sl=styleLabel(w.style);
    const bc=w.balance_left>500?'#00D4A8':w.balance_left>0?'#F97316':'#EF4444';
    const bills=(w.bills||[]).map(b=>`
      <div class="br">
        <div style="flex:1;min-width:0"><div class="br-name">${b.name}</div>${b.note?`<div class="br-note">${b.note}</div>`:''}</div>
        <div class="br-tags">${(b.tags||[]).map(tagBadge).join('')}</div>
        <div class="br-amt">-${fmt(b.amount)}</div>
      </div>`).join('')||`<div style="font-size:13px;color:rgba(255,255,255,0.28);padding:10px 0">No bills this week</div>`;
    root.innerHTML=`
      <div class="banner" style="border-top-color:${sc}">
        <div>
          <div class="b-eyebrow">Current Pay Week · ${w.month_name} ${w.year}</div>
          <div class="b-title">${w.label}</div>
          <div class="b-date">${w.day} · ${w.date}</div>
        </div>
        <span class="b-badge" style="background:${sc}22;color:${sc}">${sl}</span>
      </div>
      <div class="stats-row">
        ${w.income.mike!=null?`<div class="sc"><div class="sc-lbl">Mike</div><div class="sc-val" style="color:#00D4A8">${fmt(w.income.mike)}</div></div>`:''}
        ${w.income.heather!=null?`<div class="sc"><div class="sc-lbl">Heather</div><div class="sc-val" style="color:#A855F7">${fmt(w.income.heather)}</div></div>`:''}
        <div class="sc"><div class="sc-lbl">Total In</div><div class="sc-val" style="color:#4FC3F7">${fmt(w.income.total)}</div></div>
        <div class="sc"><div class="sc-lbl">Bills Out</div><div class="sc-val" style="color:#F87171">${fmt(w.bills_total)}</div></div>
      </div>
      <div class="bills-section"><div class="bills-title">Bills This Week</div>${bills}</div>
      <div class="bottom">
        <div class="bot-note">${w.note||''}</div>
        <div><div class="bot-lbl">Left Over</div><div class="bot-val" style="color:${bc}">${fmt(w.balance_left)}</div></div>
      </div>`;
  }
  getCardSize(){return 5;} static getStubConfig(){return {};}
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 4 — hades-budget-mobile-card (Mobile)
// ══════════════════════════════════════════════════════════════════════════════
class HadesBudgetMobileCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._data=null;this._loading=true;this._error=null;this._initialized=false;this._hass=null;}
  setConfig(c){this._config=c;}
  set hass(h){this._hass=h;if(!this._initialized){this._initialized=true;this._render();this._load();}}
  async _load(){
    try{
      const HEADERS=await getHeaders(this._hass);const r1=await fetch(`${BUDGET_API}/v1/months`,{headers:HEADERS});
      const j1=await r1.json(); const months=j1.months||[];
      if(!months.length){this._error='No budget data';this._loading=false;this._render();return;}
      const now=new Date();
      const names=['january','february','march','april','may','june','july','august','september','october','november','december'];
      const curId=`${names[now.getMonth()]}-${now.getFullYear()}`;
      const target=months.find(m=>m.id===curId)||months[0];
      const r2=await fetch(`${BUDGET_API}/v1/month/${target.id}`,{headers:HEADERS});
      this._data=await r2.json(); this._meta=target; this._loading=false; this._render();
    }catch(e){this._error='Failed to load';this._loading=false;this._render();}
  }
  _render(){
    const sh=this.shadowRoot;
    sh.innerHTML=`
      <style>
        :host{display:block;font-family:'DM Sans','Segoe UI',sans-serif;}
        *{box-sizing:border-box;margin:0;padding:0;}
        .card{background:${BG_MAIN};border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;color:#E2E8F0;display:flex;flex-direction:column;}
        .loading,.error{padding:40px;text-align:center;color:rgba(255,255,255,0.3);font-size:15px;}
        .error{color:#EF4444;}
        .spinner{width:28px;height:28px;border:3px solid rgba(255,255,255,0.08);border-top-color:#00D4A8;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 12px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .header{padding:16px 16px 14px;background:${BG_HEADER};border-bottom:1px solid rgba(255,255,255,0.06);}
        .h-eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.28);margin-bottom:4px;}
        .h-total{font-size:36px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px;margin-bottom:14px;}
        .h-tiles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
        .h-tile{background:rgba(255,255,255,0.05);border-radius:10px;padding:10px 12px;}
        .h-tile-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.28);margin-bottom:4px;}
        .h-tile-val{font-size:20px;font-weight:700;line-height:1;}
        .body{flex:1;overflow-y:auto;padding:10px 10px 6px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
        .wk{background:${BG_WEEK};border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;margin-bottom:10px;border-top:3px solid transparent;}
        .wk-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .wk-num{font-size:15px;font-weight:800;letter-spacing:0.5px;}
        .wk-date{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .wk-badge{font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;letter-spacing:0.3px;white-space:nowrap;}
        .wk-stats{display:grid;grid-template-columns:repeat(3,1fr);padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);gap:4px;}
        .wk-s-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(255,255,255,0.28);margin-bottom:3px;}
        .wk-s-val{font-size:18px;font-weight:700;}
        .wk-bills{padding:6px 14px 8px;}
        .br{display:flex;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px;}
        .br:last-child{border-bottom:none;}
        .br-info{flex:1;min-width:0;}
        .br-name{font-size:14px;font-weight:500;color:#CBD5E1;}
        .br-note{font-size:11px;color:rgba(255,255,255,0.26);margin-top:2px;}
        .br-tags{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;}
        .br-amt{font-size:14px;font-weight:700;color:#F87171;white-space:nowrap;min-width:60px;text-align:right;}
        .footer{position:sticky;bottom:0;background:${BG_FOOTER};border-top:1px solid rgba(255,255,255,0.1);padding:12px 16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;z-index:10;}
        .f-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.28);margin-bottom:3px;}
        .f-val{font-size:22px;font-weight:800;line-height:1;}
        .f-sub{font-size:10px;color:rgba(255,255,255,0.25);margin-top:3px;}
      </style>
      <div class="card" id="root"></div>`;
    const root=sh.getElementById('root');
    if(this._loading){root.innerHTML=`<div class="loading"><div class="spinner"></div>Loading…</div>`;return;}
    if(this._error){root.innerHTML=`<div class="error">${this._error}</div>`;return;}
    const d=this._data; const meta=this._meta||{};
    const mikeTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.mike||0),0);
    const heatherTot=(d.weeks||[]).reduce((s,w)=>s+(w.income?.heather||0),0);
    const surplus=d.surplus||0;
    const sc=surplus>1000?'#00D4A8':surplus>0?'#F97316':'#EF4444';
    const billsPct=d.total_income>0?Math.round((d.total_bills/d.total_income)*100):0;
    const txCount=(d.weeks||[]).reduce((s,w)=>s+(w.bills||[]).length,0);
    const weeksHtml=(d.weeks||[]).map((w,i)=>{
      const wc=styleColor(w.style); const wl=styleLabel(w.style);
      const bc=w.balance_left>500?'#00D4A8':w.balance_left>0?'#F97316':'#EF4444';
      const bills=(w.bills||[]).map(b=>`
        <div class="br">
          <div class="br-info">
            <div class="br-name">${b.name}</div>
            ${b.note?`<div class="br-note">${b.note}</div>`:''}
          </div>
          <div class="br-tags">${(b.tags||[]).map(tagBadge).join('')}</div>
          <div class="br-amt">-${fmt(b.amount)}</div>
        </div>`).join('')
        ||`<div style="font-size:13px;color:rgba(255,255,255,0.25);padding:8px 0">No bills this week</div>`;
      return `
        <div class="wk" style="border-top-color:${wc}">
          <div class="wk-head">
            <div>
              <div class="wk-num" style="color:${wc}">Week ${i+1} of ${d.weeks.length}</div>
              <div class="wk-date">${w.date} — ${w.day}</div>
            </div>
            <span class="wk-badge" style="background:${wc}22;color:${wc}">${wl}</span>
          </div>
          <div class="wk-stats">
            <div><div class="wk-s-lbl">Income</div><div class="wk-s-val" style="color:#4CAF50">${fmt(w.income?.total)}</div></div>
            <div><div class="wk-s-lbl">Bills</div><div class="wk-s-val" style="color:#F87171">${fmt(w.bills_total)}</div></div>
            <div><div class="wk-s-lbl">Left</div><div class="wk-s-val" style="color:${bc}">${fmt(w.balance_left)}</div></div>
          </div>
          <div class="wk-bills">${bills}</div>
        </div>`;
    }).join('');
    root.innerHTML=`
      <div class="header">
        <div class="h-eyebrow">${meta.name||''} ${meta.year||''} · Total Income</div>
        <div class="h-total">${fmt(d.total_income)}</div>
        <div class="h-tiles">
          <div class="h-tile"><div class="h-tile-lbl">Mike</div><div class="h-tile-val" style="color:#00D4A8">${fmt(mikeTot)}</div></div>
          <div class="h-tile"><div class="h-tile-lbl">Heather</div><div class="h-tile-val" style="color:#A855F7">${fmt(heatherTot)}</div></div>
          <div class="h-tile"><div class="h-tile-lbl">Weeks</div><div class="h-tile-val" style="color:#4FC3F7">${(d.weeks||[]).length}</div></div>
        </div>
      </div>
      <div class="body">${weeksHtml}</div>
      <div class="footer">
        <div><div class="f-lbl">Total Bills</div><div class="f-val" style="color:#F87171">${fmt(d.total_bills)}</div><div class="f-sub">${billsPct}% of income</div></div>
        <div><div class="f-lbl">Left Over</div><div class="f-val" style="color:${sc}">${fmt(surplus)}</div><div class="f-sub">after all bills</div></div>
        <div><div class="f-lbl">Transactions</div><div class="f-val" style="color:#4FC3F7">${txCount}</div><div class="f-sub">this month</div></div>
      </div>`;
  }
  getCardSize(){return 12;} static getStubConfig(){return {};}
}

// ─── Register ─────────────────────────────────────────────────────────────────
customElements.define('hades-budget-card',        HadesBudgetCard);
customElements.define('hades-budget-all-card',    HadesBudgetAllCard);
customElements.define('hades-budget-week-card',   HadesBudgetWeekCard);
customElements.define('hades-budget-mobile-card', HadesBudgetMobileCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: 'hades-budget-card',        name: 'Hades Budget — TV (Current Month)',    description: 'Current month only, no tabs, footer at bottom' },
  { type: 'hades-budget-all-card',    name: 'Hades Budget — Desktop (All Months)',  description: '3-tab month selector, scrollable' },
  { type: 'hades-budget-week-card',   name: 'Hades Budget — Current Week',          description: 'Compact current pay week bill list' },
  { type: 'hades-budget-mobile-card', name: 'Hades Budget — Mobile',                description: 'Stacked weeks, large fonts, sticky footer' }
);
