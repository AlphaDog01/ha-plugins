"""Hades Household Integration."""
from __future__ import annotations

import logging
from datetime import timedelta, datetime, date

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    CONF_CALENDARS,
    CALENDAR_UPDATE_INTERVAL,
    COORDINATOR_CALENDARS,
    CONF_MEAL_HOST,
    COORDINATOR_MEALS,
    MEALS_UPDATE_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "calendar"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hades Household from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    calendar_coordinator = HadesCalendarCoordinator(hass, entry)
    await calendar_coordinator.async_config_entry_first_refresh()

    coordinators = {
        COORDINATOR_CALENDARS: calendar_coordinator,
    }

    # ── Meal coordinator (optional — only if meal_host configured) ────────────
    meal_host = entry.options.get(CONF_MEAL_HOST, entry.data.get(CONF_MEAL_HOST, "")).strip()
    if meal_host:
        meal_coordinator = HadesMealCoordinator(hass, meal_host)
        await meal_coordinator.async_config_entry_first_refresh()
        coordinators[COORDINATOR_MEALS] = meal_coordinator

    hass.data[DOMAIN][entry.entry_id] = coordinators

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


# ── Calendar Coordinator ──────────────────────────────────────────────────────

class HadesCalendarCoordinator(DataUpdateCoordinator):
    """Coordinator for iCal and CalDAV calendar feeds."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.calendars: list[dict] = entry.options.get(
            CONF_CALENDARS, entry.data.get(CONF_CALENDARS, [])
        )
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_calendars",
            update_interval=timedelta(minutes=CALENDAR_UPDATE_INTERVAL),
        )

    async def _fetch_ical_url(self, url: str) -> bytes:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                resp.raise_for_status()
                return await resp.read()

    async def _fetch_caldav(self, url: str, username: str, password: str, cal_filter: str = "") -> list[dict]:
        import caldav

        def _sync_fetch():
            today = date.today()
            start = datetime(today.year, today.month, today.day, 0, 0, 0)
            end   = datetime(today.year, today.month, today.day, 23, 59, 59)

            client    = caldav.DAVClient(url=url, username=username, password=password)
            principal = client.principal()
            calendars = principal.calendars()

            if cal_filter:
                calendars = [
                    c for c in calendars
                    if cal_filter.lower() in (c.name or "").lower()
                ]

            events = []
            for calendar in calendars:
                try:
                    results = calendar.date_search(start=start, end=end, expand=True)
                    for evt in results:
                        try:
                            vevent   = evt.vobject_instance.vevent
                            summary  = str(getattr(vevent, 'summary',  type('', (), {'value': 'Untitled'})()).value)
                            location = str(getattr(vevent, 'location', type('', (), {'value': ''})()).value)
                            dtstart  = vevent.dtstart.value
                            dtend    = getattr(vevent, 'dtend', None)
                            dtend    = dtend.value if dtend else None

                            if isinstance(dtstart, datetime):
                                if dtstart.tzinfo:
                                    dtstart = dtstart.astimezone()
                                start_str = dtstart.strftime("%-I:%M %p")
                                end_str   = ""
                                if isinstance(dtend, datetime):
                                    if dtend.tzinfo:
                                        dtend = dtend.astimezone()
                                    end_str = dtend.strftime("%-I:%M %p")
                                all_day = False
                            else:
                                start_str = "All Day"
                                end_str   = ""
                                all_day   = True

                            events.append({
                                "title":    summary,
                                "start":    start_str,
                                "end":      end_str,
                                "all_day":  all_day,
                                "location": location,
                            })
                        except Exception as err:
                            _LOGGER.debug("Skipping CalDAV event: %s", err)
                except Exception as err:
                    _LOGGER.debug("Skipping CalDAV calendar: %s", err)

            events.sort(key=lambda e: (not e["all_day"], e["start"]))
            return events

        return await self.hass.async_add_executor_job(_sync_fetch)

    def _parse_today_events(self, ical_bytes: bytes) -> list[dict]:
        try:
            from icalendar import Calendar
        except ImportError:
            _LOGGER.error("icalendar library not available")
            return []

        today  = date.today()
        events = []

        try:
            cal = Calendar.from_ical(ical_bytes)
        except Exception as err:
            _LOGGER.error("Failed to parse iCal data: %s", err)
            return []

        for component in cal.walk():
            if component.name != "VEVENT":
                continue
            try:
                dtstart  = component.get("DTSTART")
                dtend    = component.get("DTEND")
                summary  = str(component.get("SUMMARY", "Untitled"))
                location = str(component.get("LOCATION", ""))

                if dtstart is None:
                    continue

                start_val = dtstart.dt
                end_val   = dtend.dt if dtend else None

                if isinstance(start_val, datetime):
                    if start_val.tzinfo is not None:
                        start_date = start_val.astimezone().date()
                    else:
                        start_date = start_val.date()
                    all_day   = False
                    start_str = start_val.strftime("%-I:%M %p")
                    end_str   = ""
                    if isinstance(end_val, datetime):
                        if end_val.tzinfo is not None:
                            end_val = end_val.astimezone()
                        end_str = end_val.strftime("%-I:%M %p")
                elif isinstance(start_val, date):
                    start_date = start_val
                    all_day    = True
                    start_str  = "All Day"
                    end_str    = ""
                else:
                    continue

                if start_date != today:
                    continue

                events.append({
                    "title":    summary,
                    "start":    start_str,
                    "end":      end_str,
                    "all_day":  all_day,
                    "location": location,
                })
            except Exception as err:
                _LOGGER.debug("Skipping event: %s", err)

        events.sort(key=lambda e: (not e["all_day"], e["start"]))
        return events

    async def _async_update_data(self) -> dict:
        from .const import CALENDAR_TYPE_CALDAV, CALENDAR_TYPE_ICAL

        result: dict = {}
        for cal in self.calendars:
            name     = cal.get("name", "unknown")
            cal_type = cal.get("type", CALENDAR_TYPE_ICAL)
            try:
                if cal_type == CALENDAR_TYPE_CALDAV:
                    events = await self._fetch_caldav(
                        url        = cal.get("url", ""),
                        username   = cal.get("username", ""),
                        password   = cal.get("password", ""),
                        cal_filter = cal.get("filter", ""),
                    )
                else:
                    raw    = await self._fetch_ical_url(cal.get("url", ""))
                    events = await self.hass.async_add_executor_job(
                        self._parse_today_events, raw
                    )

                result[name] = {
                    "events":      events,
                    "event_count": len(events),
                    "type":        cal_type,
                    "color":       cal.get("color", "#3B82F6"),
                }
            except Exception as err:
                _LOGGER.warning("Failed to fetch calendar '%s': %s", name, err)
                result[name] = {
                    "events":      [],
                    "event_count": 0,
                    "type":        cal_type,
                    "color":       cal.get("color", "#3B82F6"),
                    "error":       str(err),
                }
        return result


# ── Meal Coordinator ──────────────────────────────────────────────────────────

class HadesMealCoordinator(DataUpdateCoordinator):
    """Coordinator for Hades Meal Planner — polls /api/today every 10 minutes."""

    def __init__(self, hass: HomeAssistant, host: str) -> None:
        self.host = host.rstrip("/")
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_meals",
            update_interval=timedelta(minutes=MEALS_UPDATE_INTERVAL),
        )

    async def _async_update_data(self) -> dict:
        url = f"{self.host}/api/today"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 404:
                        return {"today": {"title": "No meal plan", "photo": None, "method": None}}
                    resp.raise_for_status()
                    data = await resp.json()
                    return {"today": data}
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Meal planner unreachable: {err}") from err
