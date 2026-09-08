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
  calendar:          "Calendar (single source)",
  combined_calendar: "Calendar (all sources)",
  meal:              "Meal Plan — Today",
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

  /* ── Title class ── */
  .t  { font-size: var(--title); }

  /* ── Subtitle class ── */
  .s  { font-size: var(--sub); }

  .cal-title-bar { font-size: var(--title); font-weight: 700; color: #fff; margin-bottom: 12px; }
  .cal-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 8px;
  }
  .cal-time       { font-size: var(--sub); color: rgba(255,255,255,0.4); white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
  .cal-event-name { font-size: var(--sub); color: rgba(255,255,255,0.9); flex: 1; }
  .cal-loc        { font-size: var(--sub); color: rgba(255,255,255,0.35); margin-top: 2px; }
  .cal-allday     { font-size: var(--sub); padding: 1px 8px; border-radius: 20px; font-weight: 600; flex-shrink: 0; margin-top: 2px; }
  .no-events      { color: rgba(255,255,255,0.3); font-size: var(--sub); padding: 8px 0; }

  /* ── Meal Card ── */
  .meal-photo {
    width: calc(100% + 32px);
    margin: -16px -16px 14px;
    height: 180px;
    object-fit: cover;
    border-radius: 20px 20px 0 0;
    display: block;
  }
  .meal-emoji-hero {
    width: calc(100% + 32px);
    margin: -16px -16px 14px;
    height: 120px;
    display: flex; align-items: center; justify-content: center;
    font-size: 56px;
    background: rgba(255,255,255,0.04);
    border-radius: 20px 20px 0 0;
  }
  .meal-header { margin-bottom: 10px; }
  .meal-day-badge {
    display: inline-flex; flex-direction: column; align-items: center;
    border-radius: 10px; padding: 4px 12px; margin-bottom: 8px;
    min-width: 52px;
  }
  .meal-day-label { font-size: 9px; font-weight: 700; letter-spacing: .1em; opacity: .8; }
  .meal-day-num   { font-size: calc(var(--title) * 1.1); font-weight: 700; line-height: 1.1; }
  .meal-title {
    font-weight: 700; line-height: 1.25;
    color: #fff; margin-bottom: 8px;
  }
  .meal-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .meal-tag {
    font-size: var(--sub); padding: 3px 10px;
    border-radius: 999px; font-weight: 600;
  }
  .meal-note {
    border-left: 3px solid; border-radius: 0;
    padding: 8px 12px; font-size: var(--sub);
    line-height: 1.5; margin-bottom: 10px;
  }
  .meal-section-label {
    font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; margin: 12px 0 8px;
  }
  .meal-ingr-list { display: flex; flex-direction: column; gap: 0; }
  .meal-ingr-row {
    display: flex; align-items: baseline; gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .meal-ingr-row:last-child { border-bottom: none; }
  .meal-ingr-dot  { font-size: 7px; flex-shrink: 0; margin-top: 2px; }
  .meal-ingr-name { flex: 1; color: rgba(255,255,255,0.85); }
  .meal-ingr-qty  { color: rgba(255,255,255,0.35); white-space: nowrap; }
  .meal-steps-list { display: flex; flex-direction: column; gap: 6px; }
  .meal-step-row  { display: flex; align-items: flex-start; gap: 10px; }
  .meal-step-num  {
    border-radius: 6px; width: 20px; height: 20px; min-width: 20px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; flex-shrink: 0; margin-top: 1px;
  }
  .meal-step-text { flex: 1; line-height: 1.45; }
  .meal-empty { text-align: center; padding: 24px 0; }
  .meal-empty-text { font-size: var(--title); font-weight: 700; color: rgba(255,255,255,0.4); }
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
      case "calendar":           inner = this._renderCalendar();         break;
      case "combined_calendar":  inner = this._renderCombinedCalendar(); break;
      case "meal":               inner = this._renderMeal();             break;
      default:            inner = `<div class="no-events">Unknown card type: ${type}</div>`;
    }

    // Inject CSS vars with px included so var(--title) works directly
    const cssVars = `--title:${this._titleSize()}px;--sub:${this._subSize()}px`;

    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}</style>
      <div class="${cardClass}" style="${cssVars}">${inner}</div>
    `;
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

  // ── Meal ─────────────────────────────────────────────────────────────────────

  _renderMeal() {
    const accent  = this._accent();
    const entity  = this._config.entity || "sensor.hades_meal_today";
    const attr    = this._attr(entity);
    const title   = this._state(entity)?.state ?? "No meal plan";
    const day     = attr.day_number;
    const emoji   = attr.emoji   || "🍽";
    const method  = attr.method  || "";
    const portions= attr.portions || 7;
    const photo   = attr.photo   || null;
    const ingredients = Array.isArray(attr.ingredients) ? attr.ingredients : [];
    const steps       = Array.isArray(attr.steps)       ? attr.steps       : [];
    const diabetic    = attr.diabetic_note || "";
    const prepNote    = attr.prep_notes    || "";
    const isWeekend   = attr.weekend;
    const isRepeat    = attr.repeat;

    if (title === "No meal plan") {
      return `
        <div class="meal-empty">
          <div style="font-size:40px;margin-bottom:8px">🍽</div>
          <div class="meal-empty-text">No active meal plan</div>
          <div class="s" style="color:rgba(255,255,255,0.3);margin-top:4px">Set a start date in the Meal Planner admin</div>
        </div>`;
    }

    // ── Photo / Emoji hero ───────────────────────────────────────────────────
    const heroHtml = photo
      ? `<img src="${photo}" class="meal-photo" alt="${title}">`
      : `<div class="meal-emoji-hero">${emoji}</div>`;

    // ── Day badge ────────────────────────────────────────────────────────────
    const badgeColor = isWeekend ? "#fbbf24" : accent.hex;
    const badgeBg    = isWeekend ? "rgba(251,191,36,0.15)" : accent.bg;
    const badgeLabel = isWeekend ? "WEEKEND" : isRepeat ? "REPEAT" : "DAY";
    const dayBadge   = day != null
      ? `<div class="meal-day-badge" style="background:${badgeBg};color:${badgeColor}">
           <span class="meal-day-label">${badgeLabel}</span>
           <span class="meal-day-num">${day}</span>
         </div>`
      : "";

    // ── Tags ─────────────────────────────────────────────────────────────────
    const tags = [
      method   ? `<span class="meal-tag" style="background:${accent.bg};color:${accent.hex}">${method}</span>` : "",
      portions ? `<span class="meal-tag" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.5)">${portions} portions</span>` : "",
      isWeekend? `<span class="meal-tag" style="background:rgba(251,191,36,0.12);color:#fbbf24">📅 Fresh day</span>` : "",
    ].filter(Boolean).join("");

    // ── Diabetic / prep notes ────────────────────────────────────────────────
    const notesHtml = [
      diabetic ? `<div class="meal-note" style="border-color:${accent.hex};color:${accent.hex};background:${accent.bg}">💡 ${diabetic}</div>` : "",
      prepNote ? `<div class="meal-note" style="border-color:#fbbf24;color:#a08040;background:rgba(251,191,36,0.08)">🧊 ${prepNote}</div>` : "",
    ].filter(Boolean).join("");

    // ── Ingredients ──────────────────────────────────────────────────────────
    const maxIngr = this._config.max_ingredients ?? 6;
    const ingrRows = ingredients.slice(0, maxIngr).map(ing => {
      const isObj  = typeof ing === "object" && ing !== null;
      const item   = isObj ? (ing.item || "") : ing;
      const qty    = isObj ? (ing.qty  || "") : "";
      return `<div class="meal-ingr-row">
        <span class="meal-ingr-dot" style="color:${accent.hex}">◆</span>
        <span class="meal-ingr-name s">${item}</span>
        ${qty ? `<span class="meal-ingr-qty s">${qty}</span>` : ""}
      </div>`;
    }).join("");
    const ingrMore = ingredients.length > maxIngr
      ? `<div class="s" style="color:rgba(255,255,255,0.25);margin-top:4px">+${ingredients.length - maxIngr} more</div>`
      : "";

    // ── Steps ────────────────────────────────────────────────────────────────
    const showSteps = this._config.show_steps !== false;
    const maxSteps  = this._config.max_steps ?? 5;
    const stepsHtml = showSteps ? steps.slice(0, maxSteps).map((s, i) => {
      const isMealPrep = typeof s === "string" && s.startsWith("MEAL PREP");
      const numBg      = isMealPrep ? accent.bg   : "rgba(255,255,255,0.07)";
      const numColor   = isMealPrep ? accent.hex  : "rgba(255,255,255,0.4)";
      const textColor  = isMealPrep ? accent.hex  : "rgba(255,255,255,0.8)";
      return `<div class="meal-step-row">
        <span class="meal-step-num s" style="background:${numBg};color:${numColor}">${i + 1}</span>
        <span class="meal-step-text s" style="color:${textColor}">${s}</span>
      </div>`;
    }).join("") : "";
    const stepsMore = showSteps && steps.length > maxSteps
      ? `<div class="s" style="color:rgba(255,255,255,0.25);margin-top:4px">+${steps.length - maxSteps} more steps</div>`
      : "";

    return `
      ${heroHtml}
      <div class="meal-header">
        ${dayBadge}
        <div class="meal-title t">${title}</div>
        <div class="meal-tags">${tags}</div>
      </div>
      ${notesHtml}
      ${ingredients.length ? `
        <div class="meal-section-label s" style="color:${accent.hex}">INGREDIENTS</div>
        <div class="meal-ingr-list">${ingrRows}${ingrMore}</div>` : ""}
      ${showSteps && steps.length ? `
        <div class="meal-section-label s" style="color:${accent.hex}">STEPS</div>
        <div class="meal-steps-list">${stepsHtml}${stepsMore}</div>` : ""}
    `;
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

  _hadesEntities(filter) {
    if (!this._hass) return [];
    return Object.keys(this._hass.states)
      .filter(id => id.startsWith("sensor.hades") || id.startsWith("calendar.hades"))
      .filter(id => filter ? id.includes(filter) : true)
      .sort();
  }

  _entityOptions(filter) {
    return this._hadesEntities(filter).map(id =>
      `<option value="${id}" ${this._config.entity === id ? "selected" : ""}>${id}</option>`
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
    if (t === "calendar") return "calendar";
    return "";
  }

  _extraFields() {
    const t = this._config.card_type;
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

      <label>Entity<br>
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
  description: "Household calendars and meal plan — with live font sizing.",
  preview:     true,
});
