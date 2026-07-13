/**
 * Hades Manage Card
 * Full parent management panel for the Hades chore system.
 * Tabs: Chores | People | Rewards
 *
 * Retheme: matches the dark palette used by hades-budget-card.js and
 * hades-chores-card.js (radial-gradient panel, Inter font, same accent
 * colors). No functional changes — all service calls are unchanged.
 */

const MANAGE_STYLES = `
  :host {
    display:block;
    font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  * { box-sizing:border-box; }

  .manage-card {
    --line:rgba(255,255,255,.075);
    --muted:#7E899A;
    background:
      radial-gradient(circle at 15% -10%,rgba(69,104,220,.22),transparent 32%),
      radial-gradient(circle at 95% 5%,rgba(42,221,169,.10),transparent 25%),
      #090D14;
    border:1px solid rgba(255,255,255,.08);
    border-radius:22px;
    color:#F6F8FC;
    overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.34);
  }

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
    letter-spacing:.3px;
    text-transform:uppercase;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    text-align:center;
    transition:background .2s,color .2s,transform .2s;
  }

  .tab:hover { color:#D9E1EF; }
  .tab:active { transform:scale(.98); }

  .tab.active {
    color:#FFFFFF;
    background:linear-gradient(135deg,#27344A,#1B2638);
    box-shadow:0 5px 15px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.07);
  }

  .panel { padding:16px; }

  .panel-header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:14px;
  }

  .panel-title { font-size:16px; font-weight:800; color:#FFFFFF; }

  .add-btn {
    background:#67D4FF;
    color:#090D14;
    border:none;
    border-radius:20px;
    padding:7px 16px;
    font-size:13px;
    font-weight:800;
    cursor:pointer;
    transition:opacity .15s;
  }

  .add-btn:hover { opacity:.85; }

  .list-row {
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:12px 10px;
    border-radius:12px;
    cursor:pointer;
    transition:background .12s;
    gap:10px;
  }

  .list-row:hover { background:rgba(255,255,255,.05); }
  .list-row + .list-row { border-top:1px solid var(--line); }

  .row-main { flex:1; min-width:0; }

  .row-name {
    font-size:14px;
    font-weight:650;
    color:#DBE2ED;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  .row-sub {
    font-size:12px;
    color:var(--muted);
    margin-top:2px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  .row-badge {
    font-size:11px;
    font-weight:800;
    padding:3px 10px;
    border-radius:20px;
    flex-shrink:0;
  }

  .badge-active   { background:rgba(57,229,140,.12);  color:#39E58C; }
  .badge-inactive { background:rgba(255,255,255,.08); color:var(--muted); }
  .badge-points   { background:rgba(103,212,255,.12); color:#67D4FF; }

  .row-arrow { color:rgba(255,255,255,.2); font-size:16px; flex-shrink:0; }
  .empty { color:var(--muted); font-size:13px; padding:16px 0; text-align:center; }

  .overlay {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.7);
    z-index:9998;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
  }

  .modal {
    background:
      radial-gradient(circle at 15% -10%,rgba(69,104,220,.18),transparent 32%),
      #0D1420;
    border:1px solid rgba(255,255,255,.1);
    border-radius:20px;
    padding:24px;
    width:100%;
    max-width:520px;
    max-height:90vh;
    overflow-y:auto;
    z-index:9999;
    position:relative;
    color:#F6F8FC;
  }

  .modal-title {
    font-size:18px;
    font-weight:800;
    color:#FFFFFF;
    margin-bottom:20px;
    padding-right:32px;
  }

  .close-btn {
    position:absolute;
    top:20px;
    right:20px;
    background:rgba(255,255,255,.1);
    border:none;
    color:#fff;
    width:28px;
    height:28px;
    border-radius:50%;
    font-size:16px;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    line-height:1;
  }

  .field { margin-bottom:16px; }

  .field-label {
    font-size:11px;
    font-weight:800;
    letter-spacing:1.5px;
    text-transform:uppercase;
    color:var(--muted);
    margin-bottom:6px;
    display:block;
  }

  .field input[type="text"],
  .field input[type="number"],
  .field select,
  .field textarea {
    width:100%;
    background:#090D14;
    color:#F6F8FC;
    border:1px solid rgba(255,255,255,.12);
    border-radius:10px;
    padding:10px 12px;
    font-size:14px;
    font-family:inherit;
    outline:none;
    transition:border-color .15s;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus { border-color:#67D4FF; }

  .field textarea { resize:vertical; min-height:72px; }
  .field select option { background:#0D1420; }

  .field-row { display:flex; gap:12px; }
  .field-row .field { flex:1; }

  .checkbox-group {
    background:#090D14;
    border:1px solid rgba(255,255,255,.12);
    border-radius:10px;
    padding:8px 12px;
  }

  .checkbox-item {
    display:flex;
    align-items:center;
    gap:10px;
    padding:7px 0;
    border-bottom:1px solid rgba(255,255,255,.05);
    cursor:pointer;
  }

  .checkbox-item:last-child { border-bottom:none; }

  .checkbox-item input[type="checkbox"] {
    width:16px;
    height:16px;
    accent-color:#67D4FF;
    cursor:pointer;
    flex-shrink:0;
  }

  .checkbox-label { font-size:14px; color:rgba(255,255,255,.85); flex:1; }
  .field-hint { font-size:11px; color:var(--muted); margin-top:5px; }

  .toggle-row {
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:10px 0;
  }

  .toggle-label { font-size:14px; color:rgba(255,255,255,.85); }

  .toggle { position:relative; width:44px; height:24px; flex-shrink:0; }
  .toggle input { opacity:0; width:0; height:0; }

  .toggle-slider {
    position:absolute;
    inset:0;
    background:rgba(255,255,255,.15);
    border-radius:24px;
    cursor:pointer;
    transition:background .2s;
  }

  .toggle-slider::before {
    content:"";
    position:absolute;
    width:18px;
    height:18px;
    left:3px;
    top:3px;
    background:#fff;
    border-radius:50%;
    transition:transform .2s;
  }

  .toggle input:checked + .toggle-slider { background:#67D4FF; }
  .toggle input:checked + .toggle-slider::before { transform:translateX(20px); }

  .modal-footer {
    display:flex;
    justify-content:flex-end;
    gap:10px;
    margin-top:24px;
    padding-top:16px;
    border-top:1px solid var(--line);
  }

  .btn-cancel {
    background:rgba(255,255,255,.08);
    color:rgba(255,255,255,.7);
    border:none;
    border-radius:20px;
    padding:9px 20px;
    font-size:14px;
    font-weight:700;
    cursor:pointer;
  }

  .btn-save {
    background:#67D4FF;
    color:#090D14;
    border:none;
    border-radius:20px;
    padding:9px 20px;
    font-size:14px;
    font-weight:800;
    cursor:pointer;
    transition:opacity .15s;
  }

  .btn-save:hover { opacity:.85; }

  .btn-danger {
    background:rgba(255,112,133,.15);
    color:#FF7085;
    border:none;
    border-radius:20px;
    padding:9px 20px;
    font-size:14px;
    font-weight:800;
    cursor:pointer;
    margin-right:auto;
  }

  .btn-complete {
    background:rgba(57,229,140,.15);
    color:#39E58C;
    border:1px solid rgba(57,229,140,.3);
    border-radius:20px;
    padding:9px 20px;
    font-size:14px;
    font-weight:800;
    cursor:pointer;
    transition:opacity .15s;
    width:100%;
    margin-bottom:12px;
  }

  .btn-complete:hover { opacity:.85; }
  .btn-complete:disabled { opacity:.3; cursor:not-allowed; }

  .chore-list {
    background:#090D14;
    border:1px solid rgba(255,255,255,.08);
    border-radius:10px;
    padding:8px 12px;
    margin-bottom:16px;
  }

  .chore-list-item {
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:6px 0;
    border-bottom:1px solid rgba(255,255,255,.05);
    font-size:13px;
  }

  .chore-list-item:last-child { border-bottom:none; }

  .chore-list-item.done { color:var(--muted); text-decoration:line-through; }
  .chore-list-item.pending { color:rgba(255,255,255,.85); }

  .chore-pts { color:var(--muted); font-size:12px; }
  .chore-pts.pending { color:#39E58C; }

  .points-row {
    display:flex;
    align-items:center;
    gap:8px;
    margin-top:8px;
  }

  .points-row input {
    width:80px;
    background:#090D14;
    color:#F6F8FC;
    border:1px solid rgba(255,255,255,.12);
    border-radius:8px;
    padding:7px 10px;
    font-size:13px;
    text-align:center;
  }

  .points-row input[type="text"] { flex:1; width:auto; text-align:left; }

  .btn-add-pts {
    background:rgba(57,229,140,.15);
    color:#39E58C;
    border:none;
    border-radius:8px;
    padding:7px 12px;
    font-size:12px;
    font-weight:800;
    cursor:pointer;
  }

  .btn-sub-pts {
    background:rgba(255,112,133,.15);
    color:#FF7085;
    border:none;
    border-radius:8px;
    padding:7px 12px;
    font-size:12px;
    font-weight:800;
    cursor:pointer;
  }

  .saving { opacity:.5; pointer-events:none; }

  .completing {
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    color:#39E58C;
    font-size:13px;
    padding:8px 0;
  }
`;

const FREQ_LABELS = {
  daily:         "Daily",
  weekly:        "Weekly",
  specific_days: "Specific Days",
  interval:      "Every N Days",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Sensor prefix for chore sensors
const SENSOR_PREFIX = "sensor.hades_household_hades_";

class HadesManage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config     = {};
    this._hass       = null;
    this._tab        = "chores";
    this._modal      = null;
    this._saving     = false;
    this._completing = null; // person id currently being completed
  }

  setConfig(config) { this._config = config; this._render(); }
  set hass(hass)    { this._hass = hass; this._render(); }
  getCardSize()     { return 6; }

  _summary() {
    return this._hass?.states?.["sensor.hades_household_hades_today_summary"]?.attributes || {};
  }

  _chores()  { return this._summary().chores  || []; }
  _rewards() { return this._summary().rewards || []; }
  _people()  { return this._summary().people  || []; }

  _personChores(personId) {
    // Get pending and completed chores for a specific person from their sensor
    const pid    = String(personId);
    const people = this._people();
    const person = people.find(p => p.id === personId);
    if (!person) return { pending: [], completed: [] };
    const slug   = person.name.toLowerCase().replace(/ /g, "_");
    const sensor = this._hass?.states?.[`${SENSOR_PREFIX}${slug}_chores_today`]?.attributes || {};
    return {
      pending:   sensor.pending   || [],
      completed: sensor.completed || [],
    };
  }

  _render() {
    if (!this._hass || !this._config) return;

    let panelHtml = "";
    if (this._tab === "chores")  panelHtml = this._renderChores();
    if (this._tab === "people")  panelHtml = this._renderPeople();
    if (this._tab === "rewards") panelHtml = this._renderRewards();

    const modalHtml = this._modal ? this._renderModal() : "";

    this.shadowRoot.innerHTML = `
      <style>${MANAGE_STYLES}</style>
      <div class="manage-card">
        <div class="tabs-shell">
          <div class="tabs" role="tablist" aria-label="Manage section">
            <button class="tab ${this._tab === "chores"  ? "active" : ""}" data-tab="chores" role="tab" aria-selected="${this._tab === "chores"}">🧹 Chores</button>
            <button class="tab ${this._tab === "people"  ? "active" : ""}" data-tab="people" role="tab" aria-selected="${this._tab === "people"}">👤 People</button>
            <button class="tab ${this._tab === "rewards" ? "active" : ""}" data-tab="rewards" role="tab" aria-selected="${this._tab === "rewards"}">🎁 Rewards</button>
          </div>
        </div>
        <div class="panel">${panelHtml}</div>
      </div>
      ${modalHtml}
    `;

    this._attachListeners();
  }

  _renderChores() {
    const chores = this._chores();
    let rows = "";

    if (!chores.length) {
      rows = `<div class="empty">No chores defined yet</div>`;
    } else {
      chores.forEach(c => {
        const assignedNames = this._assignedNames(c);
        const freqLabel     = FREQ_LABELS[c.frequency_type] || c.frequency_type;
        const activeClass   = c.active ? "badge-active" : "badge-inactive";
        const activeLabel   = c.active ? "Active" : "Inactive";
        rows += `
          <div class="list-row" data-action="edit-chore" data-id="${c.id}">
            <div class="row-main">
              <div class="row-name">${c.name}</div>
              <div class="row-sub">${freqLabel} · ${assignedNames} · ${c.points} pts</div>
            </div>
            <span class="row-badge ${activeClass}">${activeLabel}</span>
            <span class="row-arrow">›</span>
          </div>`;
      });
    }

    return `
      <div class="panel-header">
        <div class="panel-title">Chore Definitions</div>
        <button class="add-btn" data-action="add-chore">+ Add Chore</button>
      </div>
      ${rows}`;
  }

  _assignedNames(chore) {
    const people   = this._people();
    const assigned = chore.assigned_people || [];
    if (!assigned.length) return "Unassigned";
    return assigned
      .map(a => {
        const pid    = typeof a === "object" ? a.id : a;
        const person = people.find(p => p.id === pid);
        return person ? person.name : `#${pid}`;
      })
      .join(", ");
  }

  _renderPeople() {
    const people = this._people();
    let rows = "";

    if (!people.length) {
      rows = `<div class="empty">No people found</div>`;
    } else {
      people.forEach(p => {
        const chores      = this._personChores(p.id);
        const pendingCount = chores.pending.length;
        const doneCount    = chores.completed.length;
        rows += `
          <div class="list-row" data-action="edit-person" data-id="${p.id}">
            <div class="row-main">
              <div class="row-name">${p.name}</div>
              <div class="row-sub">${p.role === "parent" ? "Parent" : "Child"} · ${pendingCount} pending · ${doneCount} done today</div>
            </div>
            <span class="row-badge badge-points">⭐ ${p.points_total} pts</span>
            <span class="row-arrow">›</span>
          </div>`;
      });
    }

    return `
      <div class="panel-header">
        <div class="panel-title">Household Members</div>
      </div>
      ${rows}`;
  }

  _renderRewards() {
    const rewards = this._rewards();
    let rows = "";

    if (!rewards.length) {
      rows = `<div class="empty">No rewards defined yet</div>`;
    } else {
      rewards.forEach(r => {
        rows += `
          <div class="list-row" data-action="edit-reward" data-id="${r.id}">
            <div class="row-main">
              <div class="row-name">${r.icon || "🎁"} ${r.name}</div>
              <div class="row-sub">${r.description || "No description"}</div>
            </div>
            <span class="row-badge badge-points">⭐ ${r.points_required}</span>
            <span class="row-arrow">›</span>
          </div>`;
      });
    }

    return `
      <div class="panel-header">
        <div class="panel-title">Rewards Catalog</div>
        <button class="add-btn" data-action="add-reward">+ Add Reward</button>
      </div>
      ${rows}`;
  }

  _renderModal() {
    const { type, data } = this._modal;
    switch (type) {
      case "add-chore":    return this._modalChore(null);
      case "edit-chore":   return this._modalChore(data);
      case "edit-person":  return this._modalPerson(data);
      case "add-reward":   return this._modalReward(null);
      case "edit-reward":  return this._modalReward(data);
      default: return "";
    }
  }

  _modalChore(chore) {
    const isEdit     = !!chore;
    const title      = isEdit ? `Edit — ${chore.name}` : "Add Chore";
    const people     = this._people();
    const assigned   = (chore?.assigned_people || []).map(a => typeof a === "object" ? a.id : a);
    const freqType   = chore?.frequency_type || "daily";

    const peopleChecks = people.map(p => `
      <label class="checkbox-item">
        <input type="checkbox" name="person" value="${p.id}" ${assigned.includes(p.id) ? "checked" : ""}>
        <span class="checkbox-label">${p.name}</span>
      </label>`).join("");

    const freqDaysField = (freqType === "specific_days" || freqType === "weekly") ? `
      <div class="field">
        <label class="field-label">Days of Week</label>
        <div class="checkbox-group">
          ${DAY_NAMES.map((d, i) => {
            const days = (chore?.frequency_days || "").split(",").map(x => parseInt(x.trim()));
            return `<label class="checkbox-item">
              <input type="checkbox" name="freq_day" value="${i}" ${days.includes(i) ? "checked" : ""}>
              <span class="checkbox-label">${d}</span>
            </label>`;
          }).join("")}
        </div>
      </div>` : "";

    const intervalField = freqType === "interval" ? `
      <div class="field">
        <label class="field-label">Every N Days</label>
        <input type="number" id="f_interval" min="1" value="${chore?.frequency_interval || 1}">
      </div>` : "";

    const activeToggle = isEdit ? `
      <div class="field">
        <label class="field-label">Status</label>
        <div class="toggle-row">
          <span class="toggle-label">Chore is active</span>
          <label class="toggle">
            <input type="checkbox" id="f_active" ${chore?.active ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>` : "";

    return `
      <div class="overlay" data-action="close-modal">
        <div class="modal" id="chore-modal">
          <div class="modal-title">${title}</div>
          <button class="close-btn" data-action="close-modal">✕</button>

          <div class="field">
            <label class="field-label">Chore Name</label>
            <input type="text" id="f_name" value="${chore?.name || ""}">
          </div>

          <div class="field">
            <label class="field-label">Description</label>
            <textarea id="f_desc">${chore?.description || ""}</textarea>
          </div>

          <div class="field">
            <label class="field-label">Assigned To</label>
            <div class="checkbox-group">${peopleChecks}</div>
            <div class="field-hint">Select multiple for round-robin rotation</div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label">Frequency</label>
              <select id="f_freq">
                <option value="daily"         ${freqType === "daily"         ? "selected" : ""}>Daily</option>
                <option value="weekly"        ${freqType === "weekly"        ? "selected" : ""}>Weekly</option>
                <option value="specific_days" ${freqType === "specific_days" ? "selected" : ""}>Specific Days</option>
                <option value="interval"      ${freqType === "interval"      ? "selected" : ""}>Every N Days</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label">Due Time</label>
              <input type="text" id="f_due_time" value="${chore?.due_time || "20:00:00"}" placeholder="20:00:00">
            </div>
          </div>

          ${freqDaysField}
          ${intervalField}

          <div class="field-row">
            <div class="field">
              <label class="field-label">Points</label>
              <input type="number" id="f_points" min="0" value="${chore?.points ?? 10}">
            </div>
            <div class="field">
              <label class="field-label">Est. Minutes</label>
              <input type="number" id="f_minutes" min="1" value="${chore?.estimated_minutes ?? 15}">
            </div>
          </div>

          <div class="field">
            <label class="field-label">Category</label>
            <input type="text" id="f_category" value="${chore?.category || "general"}" placeholder="general">
          </div>

          ${activeToggle}

          <div class="modal-footer">
            <button class="btn-cancel" data-action="close-modal">Cancel</button>
            <button class="btn-save ${this._saving ? "saving" : ""}"
                    data-action="${isEdit ? "save-chore" : "create-chore"}"
                    data-id="${chore?.id || ""}">
              ${isEdit ? "Save Changes" : "Add Chore"}
            </button>
          </div>
        </div>
      </div>`;
  }

  _modalPerson(person) {
    const chores       = this._personChores(person.id);
    const pending      = chores.pending;
    const completed    = chores.completed;
    const hasPending   = pending.length > 0;
    const isCompleting = this._completing === person.id;

    // Build chore list
    let choreListHtml = "";
    if (!pending.length && !completed.length) {
      choreListHtml = `<div style="color:var(--muted);font-size:13px;padding:8px 0">No chores today</div>`;
    } else {
      completed.forEach(c => {
        choreListHtml += `<div class="chore-list-item done">
          <span>✓ ${c.name}</span>
          <span class="chore-pts">+${c.points}</span>
        </div>`;
      });
      pending.forEach(c => {
        choreListHtml += `<div class="chore-list-item pending">
          <span>${c.name}</span>
          <span class="chore-pts pending">+${c.points}</span>
        </div>`;
      });
    }

    const completeBtn = hasPending ? `
      <button class="btn-complete ${isCompleting ? "saving" : ""}"
              data-action="complete-all-chores"
              data-id="${person.id}"
              ${isCompleting ? "disabled" : ""}>
        ${isCompleting ? "⏳ Completing..." : `✓ Mark All ${pending.length} Chore${pending.length > 1 ? "s" : ""} Complete`}
      </button>` : `
      <button class="btn-complete" disabled>
        ✓ All Chores Done!
      </button>`;

    return `
      <div class="overlay" data-action="close-modal">
        <div class="modal">
          <div class="modal-title">${person.name}</div>
          <button class="close-btn" data-action="close-modal">✕</button>

          <div class="field">
            <label class="field-label">Current Points</label>
            <div style="font-size:28px;font-weight:800;color:#67D4FF;padding:8px 0">⭐ ${person.points_total}</div>
          </div>

          <div class="field">
            <label class="field-label">Today's Chores</label>
            <div class="chore-list">${choreListHtml}</div>
            ${completeBtn}
          </div>

          <div class="field">
            <label class="field-label">Adjust Points Manually</label>
            <div class="points-row">
              <input type="number" id="pts_amount" placeholder="0" style="width:90px">
              <input type="text"   id="pts_reason" placeholder="Reason (required)">
              <button class="btn-add-pts" data-action="add-points" data-id="${person.id}">+ Add</button>
              <button class="btn-sub-pts" data-action="sub-points" data-id="${person.id}">− Deduct</button>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>`;
  }

  _modalReward(reward) {
    const isEdit = !!reward;
    const title  = isEdit ? `Edit — ${reward.name}` : "Add Reward";

    return `
      <div class="overlay" data-action="close-modal">
        <div class="modal">
          <div class="modal-title">${title}</div>
          <button class="close-btn" data-action="close-modal">✕</button>

          <div class="field-row">
            <div class="field" style="flex:0 0 70px">
              <label class="field-label">Icon</label>
              <input type="text" id="r_icon" value="${reward?.icon || "🎁"}" style="text-align:center;font-size:20px">
            </div>
            <div class="field">
              <label class="field-label">Reward Name</label>
              <input type="text" id="r_name" value="${reward?.name || ""}">
            </div>
          </div>

          <div class="field">
            <label class="field-label">Description</label>
            <input type="text" id="r_desc" value="${reward?.description || ""}">
          </div>

          <div class="field">
            <label class="field-label">Points Required</label>
            <input type="number" id="r_points" min="1" value="${reward?.points_required || 100}">
          </div>

          <div class="modal-footer">
            ${isEdit ? `<button class="btn-danger" data-action="delete-reward" data-id="${reward.id}">Delete</button>` : ""}
            <button class="btn-cancel" data-action="close-modal">Cancel</button>
            <button class="btn-save ${this._saving ? "saving" : ""}"
                    data-action="${isEdit ? "save-reward" : "create-reward"}"
                    data-id="${reward?.id || ""}">
              ${isEdit ? "Save Changes" : "Add Reward"}
            </button>
          </div>
        </div>
      </div>`;
  }

  _attachListeners() {
    const root = this.shadowRoot;

    root.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => {
        this._tab   = el.dataset.tab;
        this._modal = null;
        this._render();
      });
    });

    root.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = el.dataset.action;
        const id     = parseInt(el.dataset.id) || null;

        switch (action) {
          case "add-chore":
            this._modal = { type: "add-chore", data: null };
            this._render();
            break;

          case "edit-chore": {
            const chore = this._chores().find(c => c.id === id);
            if (chore) { this._modal = { type: "edit-chore", data: chore }; this._render(); }
            break;
          }

          case "edit-person": {
            const person = this._people().find(p => p.id === id);
            if (person) { this._modal = { type: "edit-person", data: person }; this._render(); }
            break;
          }

          case "add-reward":
            this._modal = { type: "add-reward", data: null };
            this._render();
            break;

          case "edit-reward": {
            const reward = this._rewards().find(r => r.id === id);
            if (reward) { this._modal = { type: "edit-reward", data: reward }; this._render(); }
            break;
          }

          case "close-modal":
            if (el.classList.contains("overlay") || el.classList.contains("close-btn") || el.classList.contains("btn-cancel")) {
              this._modal      = null;
              this._completing = null;
              this._render();
            }
            break;

          case "complete-all-chores": this._doCompleteAllChores(id); break;
          case "create-chore":        this._doCreateChore();         break;
          case "save-chore":          this._doSaveChore(id);         break;
          case "create-reward":       this._doCreateReward();        break;
          case "save-reward":         this._doSaveReward(id);        break;
          case "delete-reward":       this._doDeleteReward(id);      break;
          case "add-points":          this._doAdjustPoints(id, 1);   break;
          case "sub-points":          this._doAdjustPoints(id, -1);  break;
        }
      });
    });

    const freqSel = root.getElementById("f_freq");
    if (freqSel) {
      freqSel.addEventListener("change", () => {
        if (this._modal) {
          this._modal.data = { ...(this._modal.data || {}), frequency_type: freqSel.value };
          this._render();
        }
      });
    }

    const modal = root.querySelector(".modal");
    if (modal) {
      modal.addEventListener("click", e => e.stopPropagation());
    }
  }

  _readChoreForm() {
    const root = this.shadowRoot;

    const checkedPeople = [...root.querySelectorAll('input[name="person"]:checked')]
      .map(cb => parseInt(cb.value));

    const freqType = root.getElementById("f_freq")?.value || "daily";

    let freqDays = null;
    if (freqType === "specific_days" || freqType === "weekly") {
      const checked = [...root.querySelectorAll('input[name="freq_day"]:checked')]
        .map(cb => cb.value);
      freqDays = checked.join(",") || null;
    }

    const assignType = checkedPeople.length > 1 ? "round_robin" : "fixed";

    return {
      name:               root.getElementById("f_name")?.value?.trim()     || "",
      description:        root.getElementById("f_desc")?.value?.trim()     || "",
      category:           root.getElementById("f_category")?.value?.trim() || "general",
      assignment_type:    assignType,
      assigned_people:    checkedPeople,
      frequency_type:     freqType,
      frequency_interval: parseInt(root.getElementById("f_interval")?.value || 1),
      frequency_days:     freqDays,
      due_time:           root.getElementById("f_due_time")?.value?.trim() || "20:00:00",
      points:             parseInt(root.getElementById("f_points")?.value   || 10),
      estimated_minutes:  parseInt(root.getElementById("f_minutes")?.value  || 15),
      active:             root.getElementById("f_active")?.checked ?? true,
    };
  }

  _readRewardForm() {
    const root = this.shadowRoot;
    return {
      name:            root.getElementById("r_name")?.value?.trim()   || "",
      description:     root.getElementById("r_desc")?.value?.trim()   || "",
      points_required: parseInt(root.getElementById("r_points")?.value || 100),
      icon:            root.getElementById("r_icon")?.value?.trim()   || "🎁",
    };
  }

  // ── Complete all pending chores for a person ─────────────────────────────────

  async _doCompleteAllChores(personId) {
    const chores  = this._personChores(personId);
    const pending = chores.pending;

    if (!pending.length) return;

    this._completing = personId;
    this._render();

    try {
      // Complete each pending instance sequentially
      for (const chore of pending) {
        await this._hass.callService("hades_household", "complete_chore", {
          instance_id: chore.id,
          person_id:   personId,
        });
      }
      this._completing = null;
      this._modal      = null;
      this._render();
    } catch (err) {
      console.error("complete_all_chores failed", err);
      this._completing = null;
      this._render();
    }
  }

  async _doCreateChore() {
    const payload = this._readChoreForm();
    if (!payload.name) { alert("Chore name is required"); return; }
    this._saving = true;
    this._render();
    try {
      await this._hass.callService("hades_household", "create_chore", payload);
      this._modal  = null;
      this._saving = false;
      this._render();
    } catch (err) {
      console.error("create_chore failed", err);
      this._saving = false;
      this._render();
    }
  }

  async _doSaveChore(choreId) {
    const payload = this._readChoreForm();
    if (!payload.name) { alert("Chore name is required"); return; }
    this._saving = true;
    this._render();
    try {
      await this._hass.callService("hades_household", "update_chore", {
        chore_id: choreId,
        ...payload,
      });
      this._modal  = null;
      this._saving = false;
      this._render();
    } catch (err) {
      console.error("update_chore failed", err);
      this._saving = false;
      this._render();
    }
  }

  async _doCreateReward() {
    const payload = this._readRewardForm();
    if (!payload.name) { alert("Reward name is required"); return; }
    this._saving = true;
    this._render();
    try {
      await this._hass.callService("hades_household", "create_reward", payload);
      this._modal  = null;
      this._saving = false;
      this._render();
    } catch (err) {
      console.error("create_reward failed", err);
      this._saving = false;
      this._render();
    }
  }

  async _doSaveReward(rewardId) {
    const payload = this._readRewardForm();
    if (!payload.name) { alert("Reward name is required"); return; }
    this._saving = true;
    this._render();
    try {
      await this._hass.callService("hades_household", "update_chore", {
        chore_id: rewardId,
        ...payload,
      });
      this._modal  = null;
      this._saving = false;
      this._render();
    } catch (err) {
      console.error("save_reward failed", err);
      this._saving = false;
      this._render();
    }
  }

  async _doDeleteReward(rewardId) {
    if (!confirm("Delete this reward?")) return;
    try {
      await this._hass.callService("notify", "notify", {
        title:   "Reward Deletion Requested",
        message: `Please delete reward ID ${rewardId} from the Hades API manually.`,
      });
      this._modal = null;
      this._render();
    } catch (err) {
      console.error("delete_reward failed", err);
    }
  }

  async _doAdjustPoints(personId, direction) {
    const root   = this.shadowRoot;
    const amount = Math.abs(parseInt(root.getElementById("pts_amount")?.value || 0));
    const reason = root.getElementById("pts_reason")?.value?.trim() || "";

    if (!amount || amount <= 0) { alert("Enter a point amount"); return; }
    if (!reason)                { alert("Reason is required");    return; }

    const points = direction * amount;
    try {
      await this._hass.callService("hades_household", "adjust_points", {
        person_id: personId,
        points:    points,
        reason:    reason,
      });
      this._modal = null;
      this._render();
    } catch (err) {
      console.error("adjust_points failed", err);
    }
  }
}

// ── GUI Editor ────────────────────────────────────────────────────────────────

class HadesManageEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass   = null;
  }

  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(hass)    { this._hass = hass; this._render(); }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; color: #ccc; font-size: 13px; font-family:Inter,sans-serif; }
        p { color: rgba(255,255,255,0.5); line-height: 1.6; }
      </style>
      <p>🏠 Hades Management Panel</p>
      <p>No configuration needed — this card automatically reads all chores, people, and rewards from the Hades Household integration.</p>
      <p>Just add this card to your parent dashboard and everything is managed from here.</p>
    `;
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

customElements.define("hades-manage", HadesManage);
customElements.define("hades-manage-editor", HadesManageEditor);

HadesManage.getConfigElement = () => document.createElement("hades-manage-editor");
HadesManage.getStubConfig    = () => ({});

window.customCards = window.customCards || [];
window.customCards.push({
  type:        "hades-manage",
  name:        "Hades Management Panel",
  description: "Full parent management panel for chores, people, and rewards.",
  preview:     true,
});
