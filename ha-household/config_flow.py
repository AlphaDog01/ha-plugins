"""Config flow for Hades Household Integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_CHORES_HOST,
    CONF_CHORES_API_KEY,
    CONF_TRACKED_PEOPLE,
    CONF_CALENDARS,
    CONF_CALENDAR_NAME,
    CONF_CALENDAR_URL,
    CONF_CALENDAR_TYPE,
    CONF_CALENDAR_USERNAME,
    CONF_CALENDAR_PASSWORD,
    CONF_CALENDAR_COLOR,
    CONF_CALENDAR_FILTER,
    CONF_MEAL_HOST,
    CALENDAR_TYPE_ICAL,
    CALENDAR_TYPE_CALDAV,
    CALENDAR_COLORS,
    CONF_VAULT_URL,
    CONF_VAULT_CLIENT_ID,
    CONF_VAULT_CLIENT_SECRET,
    CONF_VAULT_SECRET_CHORES,
    CONF_VAULT_SECRET_BUDGET,
)

_LOGGER = logging.getLogger(__name__)


async def _fetch_people(hass, host: str, entry_data: dict) -> list[dict]:
    """Fetch people list from the Hades API."""
    from .vault import resolve_api_key
    api_key = await resolve_api_key(
        hass, entry_data,
        entry_data.get(CONF_VAULT_SECRET_CHORES, ""),
        entry_data.get(CONF_CHORES_API_KEY, ""),
    )
    session = async_get_clientsession(hass)
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key
    url = f"{host.rstrip('/')}/api/people"
    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
        resp.raise_for_status()
        data = await resp.json()
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data


class HadesHouseholdConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the config flow for Hades Household Integration."""

    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._people: list[dict] = []

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Step 1 — Chores API + Meal Planner connection."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        errors: dict = {}

        if user_input is not None:
            host    = user_input[CONF_CHORES_HOST].rstrip("/")
            api_key = user_input.get(CONF_CHORES_API_KEY, "")
            meal_host = user_input.get(CONF_MEAL_HOST, "").strip()

            try:
                entry_data = {
                    CONF_CHORES_HOST:         host,
                    CONF_CHORES_API_KEY:      api_key,
                    CONF_VAULT_URL:           user_input.get(CONF_VAULT_URL, "").strip(),
                    CONF_VAULT_CLIENT_ID:     user_input.get(CONF_VAULT_CLIENT_ID, "").strip(),
                    CONF_VAULT_CLIENT_SECRET: user_input.get(CONF_VAULT_CLIENT_SECRET, "").strip(),
                    CONF_VAULT_SECRET_CHORES: user_input.get(CONF_VAULT_SECRET_CHORES, "chores-api").strip(),
                    CONF_VAULT_SECRET_BUDGET: user_input.get(CONF_VAULT_SECRET_BUDGET, "budget-api").strip(),
                }
                people = await _fetch_people(self.hass, host, entry_data)
                if not people:
                    errors["base"] = "cannot_connect"
                else:
                    self._data.update(entry_data)
                    self._data[CONF_MEAL_HOST] = meal_host
                    self._people = people
                    return await self.async_step_people()
            except aiohttp.ClientConnectorError:
                errors["base"] = "cannot_connect"
            except aiohttp.ClientResponseError as err:
                if err.status in (401, 403):
                    errors["base"] = "invalid_auth"
                else:
                    errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Unexpected error connecting to Hades API")
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_CHORES_HOST,          default="http://10.72.16.21:33911"): str,
                vol.Optional(CONF_VAULT_URL,            default="http://10.72.16.21:33167"): str,
                vol.Optional(CONF_VAULT_CLIENT_ID,      default=""): str,
                vol.Optional(CONF_VAULT_CLIENT_SECRET,  default=""): str,
                vol.Optional(CONF_VAULT_SECRET_CHORES,  default="chores-api"): str,
                vol.Optional(CONF_VAULT_SECRET_BUDGET,  default="budget-api"): str,
                vol.Optional(CONF_CHORES_API_KEY,       default=""): str,
                vol.Optional(CONF_MEAL_HOST,            default="http://10.72.16.57:3000"): str,
            }),
            errors=errors,
        )

    async def async_step_people(self, user_input: dict | None = None) -> FlowResult:
        """Step 2 — Select tracked people."""
        errors: dict = {}

        people_options = {
            str(p["id"]): p.get("display_name") or p["name"]
            for p in self._people
        }

        if user_input is not None:
            tracked = user_input.get(CONF_TRACKED_PEOPLE, [])
            if not tracked:
                errors["base"] = "cannot_connect"
            else:
                self._data[CONF_TRACKED_PEOPLE] = tracked
                return await self.async_step_calendars()

        return self.async_show_form(
            step_id="people",
            data_schema=vol.Schema({
                vol.Required(
                    CONF_TRACKED_PEOPLE,
                    default=list(people_options.keys()),
                ): cv.multi_select(people_options),
            }),
            errors=errors,
        )

    async def async_step_calendars(self, user_input: dict | None = None) -> FlowResult:
        """Step 3 — Optionally add a first calendar."""
        errors: dict = {}

        if user_input is not None:
            name = user_input.get(CONF_CALENDAR_NAME, "").strip()
            url  = user_input.get(CONF_CALENDAR_URL, "").strip()

            if name and url:
                ok = await self._test_url(url)
                if not ok:
                    errors["base"] = "invalid_url"
                else:
                    self._data[CONF_CALENDARS] = [{"name": name, "url": url}]
                    return self._create_entry()
            else:
                self._data[CONF_CALENDARS] = []
                return self._create_entry()

        return self.async_show_form(
            step_id="calendars",
            data_schema=vol.Schema({
                vol.Optional(CONF_CALENDAR_NAME, default=""): str,
                vol.Optional(CONF_CALENDAR_URL, default=""): str,
            }),
            errors=errors,
        )

    def _create_entry(self) -> FlowResult:
        return self.async_create_entry(
            title="Hades Household",
            data=self._data,
        )

    async def _test_url(self, url: str) -> bool:
        try:
            session = async_get_clientsession(self.hass)
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                return resp.status < 400
        except Exception:
            return False

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HadesHouseholdOptionsFlow(config_entry)


class HadesHouseholdOptionsFlow(config_entries.OptionsFlow):
    """Handle options (Configure button in HA UI)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._entry = config_entry
        self._calendars: list[dict] = list(
            config_entry.options.get(
                CONF_CALENDARS,
                config_entry.data.get(CONF_CALENDARS, [])
            )
        )
        self._people_fetched: list[dict] = []
        self._edit_name: str = ""

    async def async_step_init(self, user_input: dict | None = None) -> FlowResult:
        """Show options menu."""
        return self.async_show_menu(
            step_id="init",
            menu_options={
                "add_calendar":    "Add a calendar",
                "edit_calendar":   "Edit a calendar",
                "remove_calendar": "Remove a calendar",
                "update_people":   "Update tracked people",
                "update_meal_host": "Update Meal Planner URL",
                "update_vault":    "Update Vault Credentials",
            },
        )

    # ── Meal Host ─────────────────────────────────────────────────────────────

    async def async_step_update_meal_host(self, user_input: dict | None = None) -> FlowResult:
        """Update the meal planner host URL."""
        errors: dict = {}
        current = self._entry.data.get(CONF_MEAL_HOST, "")

        if user_input is not None:
            meal_host = user_input.get(CONF_MEAL_HOST, "").strip()
            if meal_host:
                try:
                    session = async_get_clientsession(self.hass)
                    async with session.get(
                        f"{meal_host.rstrip('/')}/api/today",
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as resp:
                        if resp.status not in (200, 404):
                            errors["base"] = "cannot_connect"
                except Exception:
                    errors["base"] = "cannot_connect"

            if not errors:
                self.hass.async_create_task(
                    self.hass.config_entries.async_reload(self._entry.entry_id)
                )
                return self.async_create_entry(title="", data={**self._entry.options, CONF_MEAL_HOST: meal_host})

        return self.async_show_form(
            step_id="update_meal_host",
            data_schema=vol.Schema({
                vol.Optional(CONF_MEAL_HOST, default=current): str,
            }),
            errors=errors,
        )

    # ── Edit calendar ─────────────────────────────────────────────────────────

    async def async_step_edit_calendar(self, user_input: dict | None = None) -> FlowResult:
        """Pick which calendar to edit."""
        if not self._calendars:
            return self._save()

        if user_input is not None:
            self._edit_name = user_input.get(CONF_CALENDAR_NAME)
            return await self.async_step_edit_calendar_color()

        cal_names = {c["name"]: c["name"] for c in self._calendars}
        return self.async_show_form(
            step_id="edit_calendar",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): vol.In(cal_names),
            }),
        )

    async def async_step_edit_calendar_color(self, user_input: dict | None = None) -> FlowResult:
        """Edit the selected calendar's color."""
        cal = next((c for c in self._calendars if c["name"] == self._edit_name), None)
        if not cal:
            return self._save()

        if user_input is not None:
            self._calendars = [
                {**c, "color": user_input[CONF_CALENDAR_COLOR]}
                if c["name"] == self._edit_name else c
                for c in self._calendars
            ]
            return self._save()

        return self.async_show_form(
            step_id="edit_calendar_color",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_COLOR, default=cal.get("color", "#3B82F6")): vol.In(CALENDAR_COLORS),
            }),
        )

    # ── Add calendar ──────────────────────────────────────────────────────────

    async def async_step_add_calendar(self, user_input: dict | None = None) -> FlowResult:
        if user_input is not None:
            cal_type = user_input.get(CONF_CALENDAR_TYPE, CALENDAR_TYPE_ICAL)
            if cal_type == CALENDAR_TYPE_CALDAV:
                return await self.async_step_add_caldav()
            else:
                return await self.async_step_add_ical()

        return self.async_show_form(
            step_id="add_calendar",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_TYPE, default=CALENDAR_TYPE_ICAL): vol.In({
                    CALENDAR_TYPE_ICAL:   "iCal URL (.ics link)",
                    CALENDAR_TYPE_CALDAV: "CalDAV (iCloud, etc.)",
                }),
            }),
        )

    async def async_step_add_ical(self, user_input: dict | None = None) -> FlowResult:
        errors: dict = {}

        if user_input is not None:
            name  = user_input.get(CONF_CALENDAR_NAME, "").strip()
            url   = user_input.get(CONF_CALENDAR_URL, "").strip()
            color = user_input.get(CONF_CALENDAR_COLOR, "#3B82F6")
            if name and url:
                ok = await self._test_url(url)
                if not ok:
                    errors["base"] = "invalid_url"
                else:
                    self._calendars = [c for c in self._calendars if c["name"] != name]
                    self._calendars.append({
                        "name":  name,
                        "url":   url,
                        "type":  CALENDAR_TYPE_ICAL,
                        "color": color,
                    })
                    return self._save()
            else:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="add_ical",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): str,
                vol.Required(CONF_CALENDAR_URL): str,
                vol.Required(CONF_CALENDAR_COLOR, default="#3B82F6"): vol.In(CALENDAR_COLORS),
            }),
            errors=errors,
        )

    async def async_step_add_caldav(self, user_input: dict | None = None) -> FlowResult:
        errors: dict = {}

        if user_input is not None:
            name       = user_input.get(CONF_CALENDAR_NAME, "").strip()
            url        = user_input.get(CONF_CALENDAR_URL, "").strip()
            username   = user_input.get(CONF_CALENDAR_USERNAME, "").strip()
            password   = user_input.get(CONF_CALENDAR_PASSWORD, "").strip()
            color      = user_input.get(CONF_CALENDAR_COLOR, "#3B82F6")
            cal_filter = user_input.get(CONF_CALENDAR_FILTER, "").strip()

            if name and url and username and password:
                ok = await self._test_caldav(url, username, password)
                if not ok:
                    errors["base"] = "invalid_url"
                else:
                    self._calendars = [c for c in self._calendars if c["name"] != name]
                    self._calendars.append({
                        "name":     name,
                        "url":      url,
                        "username": username,
                        "password": password,
                        "type":     CALENDAR_TYPE_CALDAV,
                        "color":    color,
                        "filter":   cal_filter,
                    })
                    return self._save()
            else:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="add_caldav",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): str,
                vol.Required(CONF_CALENDAR_URL, default="https://caldav.icloud.com"): str,
                vol.Required(CONF_CALENDAR_USERNAME): str,
                vol.Required(CONF_CALENDAR_PASSWORD): str,
                vol.Optional(CONF_CALENDAR_FILTER, default=""): str,
                vol.Required(CONF_CALENDAR_COLOR, default="#3B82F6"): vol.In(CALENDAR_COLORS),
            }),
            errors=errors,
        )

    # ── Remove calendar ───────────────────────────────────────────────────────

    async def async_step_remove_calendar(self, user_input: dict | None = None) -> FlowResult:
        if not self._calendars:
            return self._save()

        if user_input is not None:
            name = user_input.get(CONF_CALENDAR_NAME)
            self._calendars = [c for c in self._calendars if c["name"] != name]
            return self._save()

        cal_names = {c["name"]: c["name"] for c in self._calendars}
        return self.async_show_form(
            step_id="remove_calendar",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): vol.In(cal_names),
            }),
        )

    # ── Update people ─────────────────────────────────────────────────────────

    async def async_step_update_people(self, user_input: dict | None = None) -> FlowResult:
        errors: dict = {}
        data = self._entry.data

        if not self._people_fetched:
            try:
                self._people_fetched = await _fetch_people(
                    self.hass,
                    data[CONF_CHORES_HOST],
                    data,
                )
            except Exception:
                errors["base"] = "cannot_connect"

        people_options = {
            str(p["id"]): p.get("display_name") or p["name"]
            for p in self._people_fetched
        }

        current = self._entry.options.get(
            CONF_TRACKED_PEOPLE,
            data.get(CONF_TRACKED_PEOPLE, list(people_options.keys())),
        )

        if user_input is not None and not errors:
            return self._save(tracked=user_input.get(CONF_TRACKED_PEOPLE, current))

        return self.async_show_form(
            step_id="update_people",
            data_schema=vol.Schema({
                vol.Required(CONF_TRACKED_PEOPLE, default=current): cv.multi_select(
                    people_options
                ),
            }),
            errors=errors,
        )

    async def async_step_update_vault(self, user_input=None) -> FlowResult:
        """Update Vault credentials."""
        errors: dict = {}
        data = self._entry.data

        if user_input is not None:
            new_data = {
                **data,
                CONF_VAULT_URL:           user_input.get(CONF_VAULT_URL, "").strip(),
                CONF_VAULT_CLIENT_ID:     user_input.get(CONF_VAULT_CLIENT_ID, "").strip(),
                CONF_VAULT_SECRET_CHORES: user_input.get(CONF_VAULT_SECRET_CHORES, "chores-api").strip(),
                CONF_VAULT_SECRET_BUDGET: user_input.get(CONF_VAULT_SECRET_BUDGET, "budget-api").strip(),
            }
            # Only update secret if a new one was entered
            new_secret = user_input.get(CONF_VAULT_CLIENT_SECRET, "").strip()
            if new_secret:
                new_data[CONF_VAULT_CLIENT_SECRET] = new_secret
            self.hass.config_entries.async_update_entry(self._entry, data=new_data)
            return self.async_create_entry(title="", data={**self._entry.options})

        return self.async_show_form(
            step_id="update_vault",
            data_schema=vol.Schema({
                vol.Optional(CONF_VAULT_URL,           default=data.get(CONF_VAULT_URL, "http://10.72.16.21:33167")): str,
                vol.Optional(CONF_VAULT_CLIENT_ID,     default=data.get(CONF_VAULT_CLIENT_ID, "")): str,
                vol.Optional(CONF_VAULT_CLIENT_SECRET, default=""): str,  # never pre-fill secret
                vol.Optional(CONF_VAULT_SECRET_CHORES, default=data.get(CONF_VAULT_SECRET_CHORES, "chores-api")): str,
                vol.Optional(CONF_VAULT_SECRET_BUDGET, default=data.get(CONF_VAULT_SECRET_BUDGET, "budget-api")): str,
            }),
            errors=errors,
        )

    def _save(self, tracked: list | None = None) -> FlowResult:
        data = {CONF_CALENDARS: self._calendars}
        if tracked is not None:
            data[CONF_TRACKED_PEOPLE] = tracked
        return self.async_create_entry(title="", data=data)

    async def _test_url(self, url: str) -> bool:
        try:
            session = async_get_clientsession(self.hass)
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                return resp.status < 400
        except Exception:
            return False

    async def _test_caldav(self, url: str, username: str, password: str) -> bool:
        def _sync_test():
            try:
                import caldav
                client = caldav.DAVClient(url=url, username=username, password=password)
                client.principal()
                return True
            except Exception:
                return False
        try:
            return await self.hass.async_add_executor_job(_sync_test)
        except Exception:
            return False
