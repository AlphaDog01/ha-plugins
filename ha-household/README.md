# Hades Household Integration

A custom Home Assistant integration for household calendars and meal planning.

---

## What It Does

- **Calendars** — Fetches any iCal (`.ics`) URL or CalDAV source and exposes a clean sensor per calendar with today's events as attributes
- **Meal Planner** — Optionally polls a Meal Planner host for today's meal
- **Extensible** — Built to easily add new modules (weather, shopping lists, etc.) without restructuring

> Chore tracking, points, rewards, reminders, and budget features have been
> removed from this integration — that data now lives in a different tool.

---

## Sensors

### Calendars (per calendar you add)
| Sensor | State | Key Attributes |
|--------|-------|----------------|
| `sensor.hades_calendar_<name>_today` | # events today | `events[]`, `event_count`, `calendar_name` |

#### Event object shape
```json
{
  "title": "Team Meeting",
  "start": "9:00 AM",
  "end": "10:00 AM",
  "all_day": false,
  "location": "Room 101"
}
```

### Meal Planner (optional — only if a meal host is configured)
| Sensor | State | Key Attributes |
|--------|-------|----------------|
| `sensor.hades_meal_today` | Meal title | `photo`, `method` |

---

## Installation

This plugin lives in the `AlphaDog01/ha-plugins` monorepo (`ha-household/` folder), installed via the repo's shared `install.sh` — see the top-level repo README for the full bootstrap/install flow.

Quick version:
1. Run `bootstrap.sh` (fetches a fresh GitHub token from Hades Vault, pulls `install.sh`, and runs it)
2. `install.sh household` installs just this plugin to `/config/custom_components/hades_household/`
3. Restart HA: Settings → System → Restart (a plain integration Reload isn't always enough for new/changed Python files)
4. Go to Settings → Integrations → Add → search **Hades Household**
5. Follow the 2-step setup wizard (optional Meal Planner host → optional first calendar)

---

## Adding More Calendars Later

Settings → Integrations → Hades Household → **Configure** → Add a calendar

---

## Adding New Modules (Future)

1. Add a new coordinator class in `__init__.py`
2. Add new sensor classes in `sensor.py`
3. Add config flow steps in `config_flow.py` if needed
4. Add constants to `const.py`

The coordinator pattern means each module polls independently on its own schedule.

---

## Rules

- Always modify files in GitHub and repull — never edit directly on the server
- Repull: `./install.sh household` (or re-run `bootstrap.sh` if `~/install.sh` was wiped by an HA update) then restart HA
- SSH: `ssh root@10.72.16.61 -p 2309`
