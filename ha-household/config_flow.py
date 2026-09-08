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

from .const import (
    DOMAIN,
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
)

_LOGGER = logging.getLogger(__name__)


class HadesHouseholdConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the config flow for Hades Household Integration."""

    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Step 1 — Meal Planner connection (optional)."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        errors: dict = {}

        if user_input is not None:
            meal_host = user_input.get(CONF_MEAL_HOST, "").strip()
            if meal_host:
                ok = await self._test_meal_host(meal_host)
                if not ok:
                    errors["base"] = "cannot_connect"

            if not errors:
                self._data[CONF_MEAL_HOST] = meal_host
                return await self.async_step_calendars()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Optional(CONF_MEAL_HOST, default="http://10.72.16.57:3000"): str,
            }),
            errors=errors,
        )

    async def async_step_calendars(self, user_input: dict | None = None) -> FlowResult:
        """Step 2 — Optionally add a first calendar."""
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

    async def _test_meal_host(self, meal_host: str) -> bool:
        try:
            session = async_get_clientsession(self.hass)
            async with session.get(
                f"{meal_host.rstrip('/')}/api/today",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                return resp.status in (200, 404)
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
        self._edit_name: str = ""

    async def async_step_init(self, user_input: dict | None = None) -> FlowResult:
        """Show options menu."""
        return self.async_show_menu(
            step_id="init",
            menu_options={
                "add_calendar":     "Add a calendar",
                "edit_calendar":    "Edit a calendar",
                "remove_calendar":  "Remove a calendar",
                "update_meal_host": "Update Meal Planner URL",
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
                # async_create_entry() below changes entry.options, which
                # already fires the update listener (entry.add_update_listener
                # in __init__.py) and triggers a reload — no need to also
                # schedule one explicitly here.
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

    def _save(self) -> FlowResult:
        # async_create_entry()'s `data` REPLACES entry.options wholesale — it
        # does not merge. Start from the existing options so a calendar-only
        # save (add/edit/remove) doesn't silently drop any other option key
        # that was set on a previous, unrelated save.
        data = dict(self._entry.options)
        data[CONF_CALENDARS] = self._calendars
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
