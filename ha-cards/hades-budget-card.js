/**
 * hades-budget-card.js  v13
 *
 * Dark modern budget theme with three-month tabs on desktop and mobile.
 *
 * custom:hades-budget-card        — Current month overview
 * custom:hades-budget-all-card    — Desktop, three month tabs
 * custom:hades-budget-week-card   — Compact current week
 * custom:hades-budget-mobile-card — Mobile, three month tabs
 *
 * Resource: /local/hades-budget-card.js?v=13
 */

const BUDGET_API = 'https://nexus.cnyhades.com/api/budget';

// ── Vault token cache ────────────────────────────────────────────────────────
let _vaultToken = null;
let _vaultExpiry = 0;
let _vaultPromise = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readVaultConfig(hass, cardConfig = {}) {
  const normalize = (raw = {}) => ({
    vaultUrl:
      raw.vault_url ||
      raw.vaultUrl ||
      raw.url ||
      '',
    clientId:
      raw.vault_client_id ||
      raw.client_id ||
      raw.clientId ||
      '',
    clientSecret:
      raw.vault_client_secret ||
      raw.client_secret ||
      raw.clientSecret ||
      '',
    secretName:
      raw.vault_secret_budget ||
      raw.secret_name ||
      raw.secretName ||
      'budget-api',
  });

  // Optional per-card configuration. This is useful when a dashboard loads
  // before the sensor that publishes the shared Vault attributes.
  const direct = normalize(cardConfig);
  if (direct.vaultUrl && direct.clientId && direct.clientSecret) return direct;

  const states = hass?.states ? Object.values(hass.states) : [];

  // A configured entity can be supplied explicitly:
  // vault_entity: sensor.hades_household_config
  if (cardConfig.vault_entity && hass?.states?.[cardConfig.vault_entity]) {
    const explicit = normalize(hass.states[cardConfig.vault_entity].attributes || {});
    if (explicit.vaultUrl && explicit.clientId && explicit.clientSecret) return explicit;
  }

  // Prefer the original household sensor naming convention.
  const preferred = states.find(state =>
    state?.entity_id?.startsWith('sensor.hades_household_') &&
    state?.attributes?.vault_url
  );
  if (preferred) {
    const value = normalize(preferred.attributes);
    if (value.vaultUrl && value.clientId && value.clientSecret) return value;
  }

  // Desktop dashboards can initialize before the specifically named sensor is
  // restored. Search all entities for a complete Vault attribute set.
  const anyVaultEntity = states.find(state => {
    const value = normalize(state?.attributes || {});
    return value.vaultUrl && value.clientId && value.clientSecret;
  });
  if (anyVaultEntity) return normalize(anyVaultEntity.attributes);

  // Existing manual browser fallback retained.
  if (window._hadesVaultConfig) {
    const value = normalize(window._hadesVaultConfig);
    if (value.vaultUrl && value.clientId && value.clientSecret) return value;
  }

  // Optional persisted fallback. Nothing is written here automatically.
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage?.getItem('hadesVaultConfig');
      if (!raw) continue;
      const value = normalize(JSON.parse(raw));
      if (value.vaultUrl && value.clientId && value.clientSecret) return value;
    } catch (_) {
      // Ignore blocked storage or malformed optional fallback data.
    }
  }

  return null;
}

async function getHeaders(hass, cardConfig = {}) {
  const now = Date.now();

  if (_vaultToken && now < _vaultExpiry) {
    return { 'X-API-Key': _vaultToken };
  }

  // Prevent several cards from requesting a Vault token simultaneously.
  if (_vaultPromise) return _vaultPromise;

  _vaultPromise = (async () => {
    let vault = null;

    // HA may set the card's hass property before all restored states are ready,
    // especially on a desktop dashboard. Retry the state lookup briefly.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      vault = readVaultConfig(hass, cardConfig);
      if (vault) break;
      await sleep(250);
    }

    if (!vault) {
      console.warn(
        '[hades-budget-card] Vault not configured after retry. ' +
        'Checked card config, configured vault_entity, HA states, window fallback, and browser storage.'
      );
      return {};
    }

    try {
      const response = await fetch(`${vault.vaultUrl}/vault/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: vault.clientId,
          client_secret: vault.clientSecret,
          secret_name: vault.secretName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vault token request returned ${response.status}`);
      }

      const data = await response.json();
      const token = data.value || data.token || data.secret || '';

      if (!token) {
        throw new Error('Vault response did not contain a token value');
      }

      _vaultToken = token;
      _vaultExpiry = Date.now() + 55_000;
      return { 'X-API-Key': token };
    } catch (error) {
      console.error('[hades-budget-card] Vault error:', error);
      return {};
    }
  })();

  try {
    return await _vaultPromise;
  } finally {
    _vaultPromise = null;
  }
}

async function apiJson(path, hass, cardConfig = {}) {
  const headers = await getHeaders(hass, cardConfig);
  const response = await fetch(`${BUDGET_API}${path}`, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Budget API ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
  }

  return response.json();
}

function fmt(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return '$' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function styleColor(style) {
  return {
    strong: '#39E58C',
    tight: '#FFB020',
    zero: '#FF5D73',
    'rent-week': '#A78BFA',
  }[style] || '#78A9FF';
}

function styleLabel(style) {
  return {
    strong: 'Healthy',
    tight: 'Tight',
    zero: 'Zero Out',
    'rent-week': 'Rent Week',
  }[style] || style || 'Planned';
}

function tagBadge(tag) {
  const map = {
    ach:     { label: 'ACH',     bg: 'rgba(56,189,248,.12)', color: '#67D4FF' },
    early:   { label: 'Early',   bg: 'rgba(57,229,140,.12)', color: '#39E58C' },
    split:   { label: 'Split',   bg: 'rgba(255,176,32,.12)', color: '#FFB020' },
    locked:  { label: 'Locked',  bg: 'rgba(255,93,115,.12)', color: '#FF7085' },
    onemain: { label: 'OneMain', bg: 'rgba(167,139,250,.12)', color: '#BDA7FF' },
    rent:    { label: 'Rent',    bg: 'rgba(192,132,252,.12)', color: '#D29AFF' },
  };

  const item = map[tag];
  if (!item) return '';

  return `<span class="tag" style="background:${item.bg};color:${item.color}">${item.label}</span>`;
}

const BASE_CSS = `
  :host {
    display:block;
    font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    color:#F6F8FC;
  }
  * { box-sizing:border-box; }
  button { font:inherit; }
  .card {
    --panel:#111722;
    --panel-2:#151D2A;
    --line:rgba(255,255,255,.075);
    --muted:#7E899A;
    --text:#F6F8FC;
    --green:#39E58C;
    --red:#FF7085;
    --blue:#67D4FF;
    --purple:#BDA7FF;
    background:
      radial-gradient(circle at 15% -10%,rgba(69,104,220,.22),transparent 32%),
      radial-gradient(circle at 95% 5%,rgba(42,221,169,.10),transparent 25%),
      #090D14;
    border:1px solid rgba(255,255,255,.08);
    border-radius:22px;
    overflow:hidden;
    color:var(--text);
    box-shadow:0 24px 70px rgba(0,0,0,.34);
  }
  .loading,.error,.empty {
    min-height:180px;
    display:grid;
    place-items:center;
    padding:40px 20px;
    color:var(--muted);
    text-align:center;
    font-size:14px;
  }
  .error { color:#FF7085; }
  .spinner {
    width:28px;height:28px;
    border:3px solid rgba(255,255,255,.08);
    border-top-color:#39E58C;
    border-radius:50%;
    animation:spin .7s linear infinite;
    margin:0 auto 12px;
  }
  @keyframes spin { to { transform:rotate(360deg); } }

  .tabs-shell {
    padding:14px 14px 0;
  }
  .tabs {
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:6px;
    padding:5px;
    border:1px solid var(--line);
    background:rgba(255,255,255,.035);
    border-radius:15px;
  }
  .tab {
    min-width:0;
    border:0;
    border-radius:11px;
    padding:10px 8px;
    color:#788496;
    background:transparent;
    cursor:pointer;
    font-size:12px;
    font-weight:750;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    transition:background .2s,color .2s,transform .2s;
  }
  .tab:hover { color:#D9E1EF; }
  .tab:active { transform:scale(.98); }
  .tab.active {
    color:#FFFFFF;
    background:linear-gradient(135deg,#27344A,#1B2638);
    box-shadow:0 5px 15px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.07);
  }

  .summary {
    padding:20px;
  }
  .summary-top {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:20px;
  }
  .eyebrow {
    margin-bottom:7px;
    color:#788496;
    font-size:10px;
    font-weight:800;
    letter-spacing:1.5px;
    text-transform:uppercase;
  }
  .month-title {
    margin:0;
    color:#FFFFFF;
    font-size:18px;
    font-weight:800;
  }
  .income {
    margin-top:8px;
    font-size:38px;
    font-weight:850;
    line-height:1;
    letter-spacing:-1.5px;
  }
  .health {
    display:inline-flex;
    align-items:center;
    gap:7px;
    padding:7px 10px;
    border-radius:999px;
    background:rgba(57,229,140,.10);
    color:#50E99A;
    font-size:11px;
    font-weight:800;
  }
  .health-dot {
    width:7px;height:7px;
    border-radius:50%;
    background:currentColor;
    box-shadow:0 0 10px currentColor;
  }
  .metric-grid {
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:9px;
    margin-top:18px;
  }
  .metric {
    min-width:0;
    padding:13px;
    border:1px solid var(--line);
    border-radius:14px;
    background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));
  }
  .metric-label {
    color:#778295;
    font-size:9px;
    font-weight:800;
    letter-spacing:.9px;
    text-transform:uppercase;
  }
  .metric-value {
    margin-top:5px;
    color:#FFFFFF;
    font-size:18px;
    font-weight:820;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  .weeks {
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px;
    padding:0 14px 14px;
  }
  .week {
    min-width:0;
    overflow:hidden;
    border:1px solid var(--line);
    border-radius:17px;
    background:linear-gradient(155deg,rgba(24,33,47,.96),rgba(14,20,30,.96));
  }
  .week-head {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:10px;
    padding:14px 14px 12px;
    border-bottom:1px solid rgba(255,255,255,.055);
  }
  .week-kicker {
    font-size:11px;
    font-weight:850;
    letter-spacing:.8px;
    text-transform:uppercase;
  }
  .week-date {
    margin-top:4px;
    color:#778295;
    font-size:11px;
  }
  .badge {
    padding:5px 8px;
    border-radius:999px;
    font-size:9px;
    font-weight:850;
    white-space:nowrap;
  }
  .week-stats {
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:6px;
    padding:11px 14px;
    border-bottom:1px solid rgba(255,255,255,.045);
  }
  .stat-label {
    color:#6E798B;
    font-size:8px;
    font-weight:800;
    letter-spacing:.7px;
    text-transform:uppercase;
  }
  .stat-value {
    margin-top:4px;
    font-size:14px;
    font-weight:800;
  }
  .bills {
    padding:5px 14px 9px;
  }
  .bill {
    display:flex;
    align-items:center;
    gap:8px;
    min-height:38px;
    padding:8px 0;
    border-bottom:1px solid rgba(255,255,255,.045);
  }
  .bill:last-child { border-bottom:0; }
  .bill-info { min-width:0; flex:1; }
  .bill-name {
    color:#DBE2ED;
    font-size:12px;
    font-weight:650;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .bill-note {
    margin-top:2px;
    color:#6F7A8C;
    font-size:10px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .bill-tags {
    display:flex;
    justify-content:flex-end;
    flex-wrap:wrap;
    gap:3px;
  }
  .tag {
    padding:3px 6px;
    border-radius:6px;
    font-size:8px;
    font-weight:850;
    letter-spacing:.2px;
    white-space:nowrap;
  }
  .bill-amount {
    min-width:55px;
    color:#FF7085;
    font-size:12px;
    font-weight:820;
    text-align:right;
    white-space:nowrap;
  }
  .no-bills {
    padding:12px 0 7px;
    color:#667183;
    font-size:11px;
  }
  .week-note {
    padding:0 14px 12px;
    color:#6F7A8C;
    font-size:10px;
    line-height:1.45;
  }

  @media (max-width:760px) {
    .card { border-radius:18px; }
    .tabs-shell { padding:10px 10px 0; }
    .tab { padding:10px 5px; font-size:11px; }
    .summary { padding:17px 14px 15px; }
    .summary-top { gap:10px; }
    .month-title { font-size:16px; }
    .income { font-size:34px; }
    .health { padding:6px 8px; font-size:9px; }
    .metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .metric { padding:11px; }
    .metric-value { font-size:17px; }
    .weeks { grid-template-columns:1fr; padding:0 10px 10px; }
    .week { border-radius:15px; }
    .week-head { padding:13px 12px 11px; }
    .week-stats { padding:10px 12px; }
    .bills { padding:5px 12px 8px; }
  }
`;

function selectThreeMonths(months) {
  if (!Array.isArray(months)) return [];
  return months.slice(0, 3);
}

function renderTabs(months, activeId) {
  return `
    <div class="tabs-shell">
      <div class="tabs" role="tablist" aria-label="Budget month">
        ${months.map(month => `
          <button
            class="tab ${month.id === activeId ? 'active' : ''}"
            data-id="${month.id}"
            role="tab"
            aria-selected="${month.id === activeId}"
          >${month.name} ${month.year}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function totals(data) {
  const weeks = data?.weeks || [];
  return {
    mike: weeks.reduce((sum, week) => sum + Number(week.income?.mike || 0), 0),
    heather: weeks.reduce((sum, week) => sum + Number(week.income?.heather || 0), 0),
    transactions: weeks.reduce((sum, week) => sum + (week.bills || []).length, 0),
  };
}

function renderSummary(data, meta) {
  const total = totals(data);
  const surplus = Number(data.surplus || 0);
  const surplusColor = surplus > 1000 ? '#39E58C' : surplus > 0 ? '#FFB020' : '#FF7085';
  const status = surplus > 1000 ? 'On Track' : surplus > 0 ? 'Watch Spending' : 'Over Budget';

  return `
    <section class="summary">
      <div class="summary-top">
        <div>
          <div class="eyebrow">Weekly household budget</div>
          <h2 class="month-title">${meta?.name || ''} ${meta?.year || ''}</h2>
          <div class="income">${fmt(data.total_income)}</div>
        </div>
        <div class="health" style="color:${surplusColor};background:${surplusColor}18">
          <span class="health-dot"></span>${status}
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <div class="metric-label">Mike</div>
          <div class="metric-value" style="color:#39E58C">${fmt(total.mike)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Heather</div>
          <div class="metric-value" style="color:#BDA7FF">${fmt(total.heather)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Bills</div>
          <div class="metric-value" style="color:#FF7085">${fmt(data.total_bills)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Left Over</div>
          <div class="metric-value" style="color:${surplusColor}">${fmt(surplus)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderWeeks(data) {
  const weeks = data?.weeks || [];

  return `
    <section class="weeks">
      ${weeks.map((week, index) => {
        const color = styleColor(week.style);
        const balance = Number(week.balance_left || 0);
        const balanceColor = balance > 500 ? '#39E58C' : balance > 0 ? '#FFB020' : '#FF7085';
        const bills = (week.bills || []).map(bill => `
          <div class="bill">
            <div class="bill-info">
              <div class="bill-name">${bill.name}</div>
              ${bill.note ? `<div class="bill-note">${bill.note}</div>` : ''}
            </div>
            <div class="bill-tags">${(bill.tags || []).map(tagBadge).join('')}</div>
            <div class="bill-amount">-${fmt(bill.amount)}</div>
          </div>
        `).join('') || `<div class="no-bills">No bills this week</div>`;

        return `
          <article class="week">
            <div class="week-head">
              <div>
                <div class="week-kicker" style="color:${color}">Week ${index + 1}</div>
                <div class="week-date">${week.date || ''}${week.day ? ` · ${week.day}` : ''}</div>
              </div>
              <span class="badge" style="background:${color}18;color:${color}">${styleLabel(week.style)}</span>
            </div>

            <div class="week-stats">
              <div>
                <div class="stat-label">Income</div>
                <div class="stat-value" style="color:#39E58C">${fmt(week.income?.total)}</div>
              </div>
              <div>
                <div class="stat-label">Bills</div>
                <div class="stat-value" style="color:#FF7085">${fmt(week.bills_total)}</div>
              </div>
              <div>
                <div class="stat-label">Left</div>
                <div class="stat-value" style="color:${balanceColor}">${fmt(balance)}</div>
              </div>
            </div>

            <div class="bills">${bills}</div>
            ${week.note ? `<div class="week-note">${week.note}</div>` : ''}
          </article>
        `;
      }).join('')}
    </section>
  `;
}

class MonthTabsBudgetCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._months = [];
    this._activeId = null;
    this._monthData = null;
    this._loading = true;
    this._error = null;
    this._initialized = false;
  }

  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadMonths();
      return;
    }

    // Keep the latest HA state object available during the retry window.
    // This matters when restored entities arrive after the first render.
    if (this._error?.includes('Vault')) {
      this._error = null;
      this._loadMonths();
    }
  }

  async _loadMonths() {
    this._loading = true;
    this._error = null;
    this._render();

    try {
      const json = await apiJson('/v1/months', this._hass, this._config);
      this._months = selectThreeMonths(json.months || []);

      if (!this._months.length) {
        this._loading = false;
        this._render();
        return;
      }

      const now = new Date();
      const monthNames = [
        'january','february','march','april','may','june',
        'july','august','september','october','november','december'
      ];
      const currentId = `${monthNames[now.getMonth()]}-${now.getFullYear()}`;
      this._activeId =
        this._months.find(month => month.id === currentId)?.id ||
        this._months[0].id;

      await this._loadMonth(this._activeId, false);
    } catch (error) {
      console.error('[hades-budget-card] Month list error:', error);
      this._error = error.message || 'Failed to load budget';
      this._loading = false;
      this._render();
    }
  }

  async _loadMonth(id, showLoading = true) {
    if (showLoading) {
      this._loading = true;
      this._error = null;
      this._render();
    }

    try {
      this._monthData = await apiJson(`/v1/month/${id}`, this._hass, this._config);
      this._loading = false;
      this._error = null;
      this._render();
    } catch (error) {
      console.error('[hades-budget-card] Month error:', error);
      this._error = error.message || 'Failed to load month';
      this._loading = false;
      this._render();
    }
  }

  _bindTabs() {
    this.shadowRoot.querySelectorAll('.tab').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id || id === this._activeId) return;
        this._activeId = id;
        this._loadMonth(id);
      });
    });
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}${this.extraCss || ''}</style>
      <div class="card">
        ${this._months.length ? renderTabs(this._months, this._activeId) : ''}
        ${
          this._loading
            ? `<div class="loading"><div><div class="spinner"></div>Loading budget…</div></div>`
            : this._error
              ? `<div class="error">${this._error}</div>`
              : !this._monthData
                ? `<div class="empty">No budget data available</div>`
                : `${renderSummary(
                    this._monthData,
                    this._months.find(month => month.id === this._activeId) || {}
                  )}${renderWeeks(this._monthData)}`
        }
      </div>
    `;

    this._bindTabs();
  }

  getCardSize() { return 10; }
  static getStubConfig() { return {}; }
}

class HadesBudgetAllCard extends MonthTabsBudgetCard {
  get extraCss() {
    return `
      .card { max-height:82vh; overflow-y:auto; scrollbar-width:thin; }
      .tabs-shell {
        position:sticky;
        top:0;
        z-index:20;
        padding-bottom:10px;
        background:linear-gradient(#090D14 78%,rgba(9,13,20,0));
        backdrop-filter:blur(14px);
      }
    `;
  }
}

class HadesBudgetMobileCard extends MonthTabsBudgetCard {
  get extraCss() {
    return `
      .card { max-height:none; }
      .tabs-shell {
        position:sticky;
        top:0;
        z-index:20;
        padding-bottom:9px;
        background:linear-gradient(#090D14 80%,rgba(9,13,20,0));
        backdrop-filter:blur(14px);
      }
      .summary { padding-top:12px; }
    `;
  }

  getCardSize() { return 12; }
}

class HadesBudgetCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._data = null;
    this._meta = null;
    this._loading = true;
    this._error = null;
    this._initialized = false;
  }

  setConfig(config) { this._config = config || {}; }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._load();
    }
  }

  async _load() {
    try {
      const monthList = await apiJson('/v1/months', this._hass, this._config);
      const months = monthList.months || [];
      if (!months.length) throw new Error('No budget data');

      const now = new Date();
      const names = [
        'january','february','march','april','may','june',
        'july','august','september','october','november','december'
      ];
      const currentId = `${names[now.getMonth()]}-${now.getFullYear()}`;
      this._meta = months.find(month => month.id === currentId) || months[0];
      this._data = await apiJson(`/v1/month/${this._meta.id}`, this._hass, this._config);
      this._loading = false;
      this._render();
    } catch (error) {
      console.error('[hades-budget-card] Current month error:', error);
      this._error = error.message || 'Failed to load';
      this._loading = false;
      this._render();
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}</style>
      <div class="card">
        ${
          this._loading
            ? `<div class="loading"><div><div class="spinner"></div>Loading budget…</div></div>`
            : this._error
              ? `<div class="error">${this._error}</div>`
              : `${renderSummary(this._data, this._meta)}${renderWeeks(this._data)}`
        }
      </div>
    `;
  }

  getCardSize() { return 10; }
  static getStubConfig() { return {}; }
}

class HadesBudgetWeekCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._week = null;
    this._loading = true;
    this._error = null;
    this._initialized = false;
  }

  setConfig(config) { this._config = config || {}; }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._load();
    }
  }

  async _load() {
    try {
      this._week = await apiJson('/v1/week/current', this._hass, this._config);
      this._loading = false;
      this._render();
    } catch (error) {
      console.error('[hades-budget-card] Current week error:', error);
      this._error = error.message || 'Failed to load week';
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const week = this._week;
    const mockData = week ? {
      total_income: week.income?.total || 0,
      total_bills: week.bills_total || 0,
      surplus: week.balance_left || 0,
      weeks: [week],
    } : null;

    const meta = week ? { name: week.month_name || 'Current', year: week.year || '' } : {};

    this.shadowRoot.innerHTML = `
      <style>
        ${BASE_CSS}
        .summary { padding-bottom:14px; }
        .metric-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .metric:nth-child(2) { display:none; }
        .weeks { grid-template-columns:1fr; }
      </style>
      <div class="card">
        ${
          this._loading
            ? `<div class="loading"><div><div class="spinner"></div>Loading current week…</div></div>`
            : this._error
              ? `<div class="error">${this._error}</div>`
              : `${renderSummary(mockData, meta)}${renderWeeks(mockData)}`
        }
      </div>
    `;
  }

  getCardSize() { return 5; }
  static getStubConfig() { return {}; }
}

if (!customElements.get('hades-budget-card')) {
  customElements.define('hades-budget-card', HadesBudgetCard);
}
if (!customElements.get('hades-budget-all-card')) {
  customElements.define('hades-budget-all-card', HadesBudgetAllCard);
}
if (!customElements.get('hades-budget-week-card')) {
  customElements.define('hades-budget-week-card', HadesBudgetWeekCard);
}
if (!customElements.get('hades-budget-mobile-card')) {
  customElements.define('hades-budget-mobile-card', HadesBudgetMobileCard);
}

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type:'hades-budget-card',
    name:'Hades Budget — Current Month',
    description:'Dark modern current-month budget overview'
  },
  {
    type:'hades-budget-all-card',
    name:'Hades Budget — Desktop',
    description:'Dark modern budget with three month tabs'
  },
  {
    type:'hades-budget-week-card',
    name:'Hades Budget — Current Week',
    description:'Dark modern current pay-week card'
  },
  {
    type:'hades-budget-mobile-card',
    name:'Hades Budget — Mobile',
    description:'Dark modern mobile budget with three month tabs'
  }
);
