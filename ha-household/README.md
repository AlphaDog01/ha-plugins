# Hades Household Integration

A custom Home Assistant integration for household calendars, with a generic
Hades Vault credential store any future module can use.

---

## What It Does

- **Calendars** — Fetches any iCal (`.ics`) URL or CalDAV source and exposes a clean sensor per calendar with today's events as attributes
- **Hades Vault** — Optional. Configure Vault URL / Client ID / Client Secret / Secret Name once, and any future module (a new card, a new API integration) can call `vault.get_vault_token()` to fetch a short-lived token instead of hardcoding a key. A browser-facing bridge (`http.py`) also lets Lovelace cards request that token via `hass.callApi('GET', 'hades_household/vault_token/<secret_name>')` without the raw client secret ever reaching the browser.
- **Extensible** — Built to easily add new modules (weather, shopping lists, etc.) without restructuring

> Chore tracking, points, rewards, reminders, budget, and meal planner
> features have been removed from this integration — that data now lives in
> different tools. The Vault credential system stays, ready for whatever's
> wired up next.

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

---

## Hades Vault Setup

Set during initial config, or later via Settings → Integrations → Hades
Household → **Configure** → Update Vault Credentials:

| Field | Notes |
|-------|-------|
| Vault URL | e.g. `http://10.72.16.21:33167` |
| Vault Client ID | Set by `install.sh`'s bootstrap into `/config/.hades_vault`; read-only from the UI once set |
| Vault Client Secret | Rotatable from the options flow |
| Vault Secret Name | The single secret name this install is authorized to fetch tokens for |

`/config/.hades_vault` (written by `install.sh`) takes priority over the
config entry for URL/Client ID/Secret, so credentials survive an HA restore
even if the config entry itself gets reset.

---

## Installation

This plugin lives in the `AlphaDog01/ha-plugins` monorepo (`ha-household/` folder), installed via the repo's shared `install.sh` — see the top-level repo README for the full bootstrap/install flow.

Quick version:
1. Run `bootstrap.sh` (fetches a fresh GitHub token from Hades Vault, pulls `install.sh`, and runs it)
2. `install.sh household` installs just this plugin to `/config/custom_components/hades_household/`
3. Restart HA: Settings → System → Restart (a plain integration Reload isn't always enough for new/changed Python files)
4. Go to Settings → Integrations → Add → search **Hades Household**
5. Follow the 2-step setup wizard (optional Vault credentials → optional first calendar)

---

## Adding More Calendars Later

Settings → Integrations → Hades Household → **Configure** → Add a calendar

---

## Adding New Modules (Future)

1. Add a new coordinator class in `__init__.py`
2. Add new sensor classes in `sensor.py`
3. Add config flow steps in `config_flow.py` if needed
4. Add constants to `const.py`
5. If it needs its own API key, use `vault.resolve_api_key(hass, entry_data, entry_data[CONF_VAULT_SECRET_NAME], fallback_key)` server-side, or the `http.py` bridge + `hass.callApi()` pattern for browser-side cards

The coordinator pattern means each module polls independently on its own schedule.

---

## Rules

- Always modify files in GitHub and repull — never edit directly on the server
- Repull: `./install.sh household` (or re-run `bootstrap.sh` if `~/install.sh` was wiped by an HA update) then restart HA
- SSH: `ssh root@10.72.16.61 -p 2309`
