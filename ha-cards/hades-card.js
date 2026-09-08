/**
 * Hades Card — Custom Lovelace Card
 * Two font size variables: title_size and subtitle_size
 * All text uses one of these two sizes consistently.
 */

const ACCENT_COLORS = {
  blue:   { hex: "#3B82F6", bg: "#1e3a5f", label: "Blue"   },
  orange: { hex: "#F97316", bg: "#3d1f00", label: "Orange" },
  pink:   { hex: "#EC4899", bg: "#3d0020", label: "Pink"   },
  green:  { hex: "#22C55E", bg: "#0d2e1a", label: "Green"  },
  purple: { hex: "#A855F7", bg: "#2d1a4a", label: "Purple" },
  white:  { hex: "#E5E7EB", bg: "#1f2937", label: "White"  },
};

const CARD_TYPES = {
  person:            "Person Chores Today",
  calendar:          "Calendar (single source)",
  combined_calendar: "Calendar (all sources)",
};

// Default sizes
const DEFAULT_TITLE_SIZE    = 20;
const DEFAULT_SUBTITLE_SIZE = 13;

// BASE_STYLES uses CSS vars --title and --sub set inline on .hades-card
const BASE_STYLES = `
  :host { display: block; }
  .hades-card {
    background: #111827;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 16px;
    font-family: var(--primary-font-family, sans-serif);
    color: #fff;
    box-sizing: border-box;
  }

  .cal-title-bar { font-size: var(--title); font-weight: 700; color: #fff; margin-bottom: 12px; }
  .cal-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 8px;
  }
  .cal-time       { font-size: var(--sub); color: rgba(255,255,255,0.4); white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
  .cal-event-name { font-size: var(--sub); color: rgba(255,255,255,0.9); flex: 1; }
  .cal-loc        { font-size: var(--sub); color: rgba(255,255,255,0.35); margin-top: 2px; }

  .avatar {
    width: calc(var(--title) * 2.2);
    height: calc(var(--title) * 2.2);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: var(--title);
    flex-shrink: 0;
  }
  .person-name { font-size: var(--title); font-weight: 700; color: #fff; }
  .pts         { font-size: var(--sub); margin-top: 2px; }

  .chore-row {
    display: flex; justify-content: space-between;
    padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
    align-items: center;
  }
  .chore-name { font-size: var(--sub); }
  .chore-pts  { font-size: var(--sub); }
  .done-name  { text-decoration: line-through; color: #4CAF50; opacity: 0.8; }
  .done-pts   { color: #4CAF50; }
  .pend-name  { color: rgba(255,255,255,0.85); }
  .pend-pts   { color: rgba(255,255,255,0.4); }

  .progress-track {
    background: rgba(255,255,255,0.1);
    border-radius: 4px; height: 6px; margin-top: 12px;
  }
  .progress-fill  { height: 6px; border-radius: 4px; }
  .progress-label { font-size: var(--sub); color: rgba(255,255,255,0.3); margin-top: 4px; }

  .badge {
    font-size: var(--sub); color: #4CAF50;
    background: rgba(76,175,80,0.15);
    border-radius: 20px; padding: 2px 10px; margin-left: 8px;
  }
  .cal-allday     { font-size: var(--sub); padding: 1px 8px; border-radius: 20px; font-weight: 600; flex-shrink: 0; margin-top: 2px; }
  .no-events      { color: rgba(255,255,255,0.3); font-size: var(--sub); padding: 8px 0; }
`;


// ── Main Card ─────────────────────────────────────────────────────────────────

class HadesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass   = null;
  }

  setConfig(config) {
    if (!config.card_type) throw new Error("card_type is required");
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() { return 3; }

  _accent() {
    return ACCENT_COLORS[this._config.accent || "blue"] || ACCENT_COLORS.blue;
  }

  _titleSize() {
    return parseFloat(this._config.title_size ?? DEFAULT_TITLE_SIZE);
  }

  _subSize() {
    return parseFloat(this._config.subtitle_size ?? DEFAULT_SUBTITLE_SIZE);
  }

  _state(id)  { return this._hass?.states?.[id]; }
  _attr(id)   { return this._state(id)?.attributes || {}; }

  _render() {
    if (!this._hass || !this._config) return;
    const type = this._config.card_type;
    let inner = "";
    let cardClass = "hades-card";

    switch (type) {
      case "person":             inner = this._renderPerson();           break;
      case "calendar":           inner = this._renderCalendar();         break;
      case "combined_calendar":  inner = this._renderCombinedCalendar(); break;
      default:            inner = `<div class="no-events">Unknown card type: ${type}</div>`;
    }

    // Inject CSS vars with px included so var(--title) works directly
    const cssVars = `--title:${this._titleSize()}px;--sub:${this._subSize()}px`;

    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}</style>
      <div class="${cardClass}" style="${cssVars}">${inner}</div>
    `;
  }

  // ── Person ──────────────────────────────────────────────────────────────────
  // Reads two native HA helpers, no custom sensor/integration needed:
  //  - entity:        an input_text holding a JSON array like
  //                    [{"n":"Empty Trash","s":"p"},{"n":"Feed Cats","s":"c"}]
  //                    s: "p" pending, "c" complete, "k" skip
  //  - points_entity:  an input_number holding that person's points total

  _renderPerson() {
    const accent   = this._accent();
    const name     = this._config.display_name || "Person";
    const initials = this._config.initials || name[0];

    const rawState = this._state(this._config.entity || "")?.state;
    let chores = [];
    if (rawState && rawState !== "unknown" && rawState !== "unavailable") {
      try { chores = JSON.parse(rawState); } catch (e) { chores = []; }
      if (!Array.isArray(chores)) chores = [];
    }

    const pointsRaw = this._config.points_entity ? this._state(this._config.points_entity)?.state : null;
    const pts = (pointsRaw != null && pointsRaw !== "unknown" && pointsRaw !== "unavailable")
      ? (parseFloat(pointsRaw) || 0) : 0;

    const done    = chores.filter(c => c.s === "c");
    const pending = chores.filter(c => c.s === "p" || !c.s);
    const skipped = chores.filter(c => c.s === "k");
    const total   = chores.length;
    const barPct  = total > 0 ? Math.round((done.length / total) * 100) : 0;
    const allDone = total > 0 && pending.length === 0;
    const badge   = allDone ? `<span class="badge">✓ All done!</span>` : "";

    let choresHtml = "";
    done.forEach(c    => { choresHtml += `<div class="chore-row"><span class="chore-name done-name">${c.n}</span></div>`; });
    pending.forEach(c => { choresHtml += `<div class="chore-row"><span class="chore-name pend-name">${c.n}</span></div>`; });
    if (!choresHtml) choresHtml = `<div class="no-events">No chores today</div>`;

    return `
      <div style="display:flex;align-items:center;margin-bottom:12px;gap:12px">
        <div class="avatar" style="background:${accent.bg};color:${accent.hex}">${initials}</div>
        <div>
          <div class="person-name">${name} ${badge}</div>
          <div class="pts" style="color:${accent.hex}">★ ${pts} pts</div>
        </div>
      </div>
      ${choresHtml}
      <div class="progress-track"><div class="progress-fill" style="background:${accent.hex};width:${barPct}%"></div></div>
      <div class="progress-label">${done.length}/${total}</div>`;
  }

  // ── Calendar (single source) ────────────────────────────────────────────────

  _renderCalendar() {
    const accent  = this._accent();
    const title   = this._config.display_name || "Today's Events";
    const attr    = this._attr(this._config.entity || "");
    const events  = attr?.events || [];
    const color   = attr?.color || accent.hex;

    let rows = `<div class="cal-title-bar">${title}</div>`;
    if (!events.length) {
      rows += `<div class="no-events">No events today</div>`;
    } else {
      events.forEach(e => {
        rows += this._calEventRow(e, color, attr?.calendar_name || title);
      });
    }
    return rows;
  }

  // ── Combined Calendar (all sources merged) ───────────────────────────────────

  _renderCombinedCalendar() {
    const title = this._config.display_name || "Today";

    // Collect all hades calendar sensors
    const calEntities = Object.keys(this._hass.states)
      .filter(id => id.startsWith("sensor.hades") && id.includes("calendar") && id.includes("today"))
      .sort();

    if (!calEntities.length) {
      return `<div class="cal-title-bar">${title}</div><div class="no-events">No calendars configured</div>`;
    }

    // Build legend
    const legend = [];
    const allEvents = [];

    calEntities.forEach(id => {
      const attr  = this._hass.states[id]?.attributes || {};
      const color = attr.color || "#E5E7EB";
      const name  = attr.calendar_name || id;
      const events = Array.isArray(attr.events) ? attr.events : [];

      legend.push({ name, color });
      events.forEach(e => allEvents.push({ ...e, _calName: name, _calColor: color }));
    });

    // Sort: all-day first, then by start time
    allEvents.sort((a, b) => {
      if (a.all_day && !b.all_day) return -1;
      if (!a.all_day && b.all_day) return 1;
      return (a.start || "").localeCompare(b.start || "");
    });

    // Legend HTML
    const legendHtml = legend.map(l => `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${l.color};flex-shrink:0;display:inline-block"></span>
        <span style="font-size:var(--sub);color:rgba(255,255,255,0.5)">${l.name}</span>
      </div>`).join("");

    // Events HTML
    let eventsHtml = "";
    if (!allEvents.length) {
      eventsHtml = `<div class="no-events">No events today</div>`;
    } else {
      allEvents.forEach(e => {
        eventsHtml += this._calEventRow(e, e._calColor, e._calName);
      });
    }

    return `
      <div class="cal-title-bar">${title}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.07)">
        ${legendHtml}
      </div>
      ${eventsHtml}`;
  }

  _calEventRow(e, color, calName) {
    const timeHtml = e.all_day
      ? `<span class="cal-allday" style="background:${color}22;color:${color}">All Day</span>`
      : `<span class="cal-time">${e.start}${e.end ? " – " + e.end : ""}</span>`;

    return `
      <div class="cal-row">
        <div style="width:3px;align-self:stretch;background:${color};flex-shrink:0;border-radius:0"></div>
        <div style="flex:1;min-width:0">
          <span class="cal-event-name">${e.title}</span>
          ${e.location ? `<div class="cal-loc">📍 ${e.location}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          ${timeHtml}
          <span style="font-size:var(--sub);background:${color}22;color:${color};border-radius:20px;padding:1px 8px;white-space:nowrap">${calName}</span>
        </div>
      </div>`;
  }

}


// ── GUI Editor ────────────────────────────────────────────────────────────────

class HadesCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass   = null;
  }

  setConfig(config) {
    const prev = JSON.stringify(this._config);
    this._config = { ...config };
    // Only re-render if card_type changed (needs different fields shown)
    // or if this is the first render (shadowRoot is empty)
    if (!this.shadowRoot.innerHTML || config.card_type !== JSON.parse(prev || "{}").card_type) {
      this._render();
    }
  }
  set hass(hass) { this._hass = hass; if (!this.shadowRoot.innerHTML) this._render(); }

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }

  _hadesEntities(prefixes) {
    if (!this._hass) return [];
    const list = Array.isArray(prefixes) ? prefixes : [prefixes];
    return Object.keys(this._hass.states)
      .filter(id => list.some(p => id.startsWith(p)))
      .sort();
  }

  _entityOptions(prefixes, configKey = "entity") {
    return this._hadesEntities(prefixes).map(id =>
      `<option value="${id}" ${this._config[configKey] === id ? "selected" : ""}>${id}</option>`
    ).join("");
  }

  _accentSwatches() {
    return Object.entries(ACCENT_COLORS).map(([key, val]) => `
      <div class="swatch ${this._config.accent === key ? "active" : ""}"
           data-accent="${key}" title="${val.label}"
           style="background:${val.hex}"></div>
    `).join("");
  }

  _typeOptions() {
    return Object.entries(CARD_TYPES).map(([key, label]) =>
      `<option value="${key}" ${this._config.card_type === key ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  _entityFilter() {
    const t = this._config.card_type;
    if (t === "person")   return ["input_text."];
    if (t === "calendar") return ["calendar."];
    return ["sensor.hades", "calendar.hades"];
  }

  _extraFields() {
    const t = this._config.card_type;
    if (t === "person") return `
      <label>Display Name<br>
        <input type="text" data-key="display_name" value="${this._config.display_name || ""}">
      </label>
      <label>Initials (avatar)<br>
        <input type="text" data-key="initials" value="${this._config.initials || ""}">
      </label>
      <label>Points Entity (input_number, optional)<br>
        <select data-key="points_entity">
          <option value="">-- none --</option>
          ${this._entityOptions(["input_number."], "points_entity")}
        </select>
      </label>`;
    if (t === "calendar") return `
      <label>Display Name<br>
        <input type="text" data-key="display_name" value="${this._config.display_name || "Today's Events"}">
      </label>`;
    return "";
  }

  _render() {
    if (!this._hass) return;

    const titleSize = this._config.title_size    ?? DEFAULT_TITLE_SIZE;
    const subSize   = this._config.subtitle_size ?? DEFAULT_SUBTITLE_SIZE;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; }
        label { display: block; margin-bottom: 12px; font-size: 13px; color: #ccc; }
        select, input[type="text"], input[type="number"] {
          display: block; width: 100%; margin-top: 4px;
          background: #1f2937; color: #fff;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          padding: 8px 10px; font-size: 13px; box-sizing: border-box;
        }
        .size-row {
          display: flex; align-items: center; gap: 10px; margin-top: 4px;
        }
        .size-row input[type="range"] {
          flex: 1; accent-color: #3B82F6;
        }
        .size-val {
          font-size: 13px; color: #fff; min-width: 36px; text-align: right;
        }
        .swatches { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .swatch {
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          border: 2px solid transparent; transition: border 0.15s;
        }
        .swatch.active { border: 2px solid #fff; }
        .section-title {
          font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.4);
          text-transform: uppercase; margin: 16px 0 8px;
        }
        hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0; }
      </style>

      <label>Card Type<br>
        <select data-key="card_type">${this._typeOptions()}</select>
      </label>

      <label>${this._config.card_type === "person" ? "Chores Entity (input_text)" : "Entity"}<br>
        <select data-key="entity">
          <option value="">-- select --</option>
          ${this._entityOptions(this._entityFilter())}
        </select>
      </label>

      ${this._extraFields()}

      <hr>
      <div class="section-title">Font Sizes</div>

      <label>Title Size (name, headings)
        <div class="size-row">
          <input type="range" data-key="title_size" min="10" max="40" step="1" value="${titleSize}">
          <span class="size-val" id="title-val">${titleSize}px</span>
        </div>
      </label>

      <label>Subtitle Size (details)
        <div class="size-row">
          <input type="range" data-key="subtitle_size" min="8" max="28" step="1" value="${subSize}">
          <span class="size-val" id="sub-val">${subSize}px</span>
        </div>
      </label>

      <hr>
      <div class="section-title">Accent Color</div>
      <div class="swatches">${this._accentSwatches()}</div>
    `;

    // ── Listeners ─────────────────────────────────────────────────────────────

    // Text / select inputs
    this.shadowRoot.querySelectorAll("select, input[type='text']").forEach(el => {
      el.addEventListener("change", () => {
        const key = el.dataset.key;
        if (!key) return;
        this._config = { ...this._config, [key]: el.value };
        this._fire(this._config);
        if (key === "card_type") this._render();
      });
    });

    // Range sliders — live preview on input, fire on change
    this.shadowRoot.querySelectorAll("input[type='range']").forEach(el => {
      const valEl = el.dataset.key === "title_size"
        ? this.shadowRoot.getElementById("title-val")
        : this.shadowRoot.getElementById("sub-val");

      el.addEventListener("input", () => {
        valEl.textContent = `${el.value}px`;
        // Fire immediately so the card re-renders live as you drag
        this._config = { ...this._config, [el.dataset.key]: parseFloat(el.value) };
        this._fire(this._config);
      });
    });

    // Accent swatches
    this.shadowRoot.querySelectorAll(".swatch").forEach(el => {
      el.addEventListener("click", () => {
        this._config = { ...this._config, accent: el.dataset.accent };
        this._fire(this._config);
        // Update swatch active states in place without full re-render
        this.shadowRoot.querySelectorAll(".swatch").forEach(s => {
          s.style.outline = s.dataset.accent === el.dataset.accent ? "2px solid #fff" : "none";
        });
      });
    });
  }
}


// ── Register ──────────────────────────────────────────────────────────────────

customElements.define("hades-card", HadesCard);
customElements.define("hades-card-editor", HadesCardEditor);

HadesCard.getConfigElement = () => document.createElement("hades-card-editor");
HadesCard.getStubConfig = () => ({
  card_type:     "calendar",
  entity:        "",
  accent:        "blue",
  title_size:    DEFAULT_TITLE_SIZE,
  subtitle_size: DEFAULT_SUBTITLE_SIZE,
});

window.customCards = window.customCards || [];
window.customCards.push({
  type:        "hades-card",
  name:        "Hades Card",
  description: "Household chores (per person), calendars — with live font sizing.",
  preview:     true,
});
