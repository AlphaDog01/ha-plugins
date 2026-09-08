"""Calendar platform for Hades Household Integration."""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_CALENDARS,
    COORDINATOR_CALENDARS,
    CALENDAR_TYPE_CALDAV,
    CALENDAR_TYPE_ICAL,
)
from .entity_cleanup import async_purge_stale_entities

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Hades calendar entities."""
    coordinators = hass.data[DOMAIN][entry.entry_id]
    calendar_coord = coordinators[COORDINATOR_CALENDARS]

    calendars = entry.options.get(CONF_CALENDARS, entry.data.get(CONF_CALENDARS, []))

    entities = []
    for cal in calendars:
        entities.append(HadesCalendarEntity(hass, calendar_coord, cal))

    # Purge any calendar entity left in the registry for a calendar that's
    # since been removed via Configure > Remove a calendar.
    valid_unique_ids = {e._attr_unique_id for e in entities if getattr(e, "_attr_unique_id", None)}
    async_purge_stale_entities(hass, entry, "calendar", valid_unique_ids)

    async_add_entities(entities, True)


class HadesCalendarEntity(CoordinatorEntity, CalendarEntity):
    """A calendar entity backed by CalDAV or iCal."""

    def __init__(self, hass: HomeAssistant, coordinator, cal_config: dict) -> None:
        super().__init__(coordinator)
        self._hass       = hass
        self._cal_config = cal_config
        self._name       = cal_config.get("name", "Calendar")
        self._color      = cal_config.get("color", "#3B82F6")
        self._type       = cal_config.get("type", CALENDAR_TYPE_ICAL)
        self._url        = cal_config.get("url", "")
        self._username   = cal_config.get("username", "")
        self._password   = cal_config.get("password", "")
        self._filter     = cal_config.get("filter", "")
        slug = self._name.lower().replace(" ", "_")
        self._attr_unique_id = f"hades_household_calendar_{slug}"
        self._attr_name      = self._name

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, "hades_household")},
            "name": "Hades Household",
            "manufacturer": "Hades",
            "model": "Household Integration",
        }

    @property
    def event(self) -> CalendarEvent | None:
        """Return the next upcoming event (from today's coordinator cache)."""
        data     = self.coordinator.data or {}
        cal_data = data.get(self._name, {})
        events   = cal_data.get("events", [])
        if not events:
            return None
        e     = events[0]
        today = date.today()
        try:
            if e.get("all_day"):
                start = datetime.combine(today, datetime.min.time())
                end   = datetime.combine(today + timedelta(days=1), datetime.min.time())
            else:
                start = self._parse_time(today, e.get("start", ""))
                end   = self._parse_time(today, e.get("end", "")) or start + timedelta(hours=1)
            return CalendarEvent(
                start=start, end=end,
                summary=e.get("title", "Untitled"),
                location=e.get("location", ""),
            )
        except Exception:
            return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Fetch events for any date range HA requests — full calendar support."""
        if self._type == CALENDAR_TYPE_CALDAV:
            return await self._fetch_caldav_range(start_date, end_date)
        else:
            return await self._fetch_ical_range(start_date, end_date)

    # ── CalDAV range fetch ────────────────────────────────────────────────────

    async def _fetch_caldav_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Fetch CalDAV events for the requested date range."""
        def _sync_fetch():
            import caldav

            client    = caldav.DAVClient(
                url=self._url, username=self._username, password=self._password
            )
            principal = client.principal()
            calendars = principal.calendars()

            if self._filter:
                calendars = [
                    c for c in calendars
                    if self._filter.lower() in (c.name or "").lower()
                ]

            results = []
            for calendar in calendars:
                try:
                    raw = calendar.date_search(
                        start=start_date, end=end_date, expand=True
                    )
                    for evt in raw:
                        try:
                            vevent   = evt.vobject_instance.vevent
                            summary  = str(getattr(vevent, "summary",  type("", (), {"value": "Untitled"})()).value)
                            location = str(getattr(vevent, "location", type("", (), {"value": ""})()).value)
                            dtstart  = vevent.dtstart.value
                            dtend_obj = getattr(vevent, "dtend", None)
                            dtend    = dtend_obj.value if dtend_obj else None

                            if isinstance(dtstart, datetime):
                                if dtstart.tzinfo:
                                    dtstart = dtstart.astimezone()
                                if isinstance(dtend, datetime) and dtend.tzinfo:
                                    dtend = dtend.astimezone()
                                elif not isinstance(dtend, datetime):
                                    dtend = dtstart + timedelta(hours=1)
                                results.append(CalendarEvent(
                                    start=dtstart, end=dtend,
                                    summary=summary, location=location,
                                ))
                            elif isinstance(dtstart, date):
                                end_d = dtend if isinstance(dtend, date) else dtstart + timedelta(days=1)
                                results.append(CalendarEvent(
                                    start=dtstart, end=end_d,
                                    summary=summary, location=location,
                                ))
                        except Exception as err:
                            _LOGGER.debug("Skipping CalDAV event: %s", err)
                except Exception as err:
                    _LOGGER.debug("Skipping CalDAV calendar in range fetch: %s", err)

            return results

        try:
            return await self._hass.async_add_executor_job(_sync_fetch)
        except Exception as err:
            _LOGGER.warning("CalDAV range fetch failed for '%s': %s", self._name, err)
            return []

    # ── iCal range fetch ──────────────────────────────────────────────────────

    async def _fetch_ical_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Fetch iCal URL and filter to the requested date range."""
        import aiohttp
        from icalendar import Calendar
        from zoneinfo import ZoneInfo

        # Use HA's configured timezone
        ha_tz = ZoneInfo(self._hass.config.time_zone)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self._url, timeout=aiohttp.ClientTimeout(total=15)
                ) as resp:
                    resp.raise_for_status()
                    raw = await resp.read()
        except Exception as err:
            _LOGGER.warning("iCal fetch failed for '%s': %s", self._name, err)
            return []

        def _parse():
            results = []
            try:
                cal = Calendar.from_ical(raw)
            except Exception as err:
                _LOGGER.error("iCal parse error: %s", err)
                return []

            # Convert range boundaries using HA's timezone
            if start_date.tzinfo is not None:
                start_d = start_date.astimezone(ha_tz).date()
            else:
                start_d = start_date.date()
            if end_date.tzinfo is not None:
                end_d = end_date.astimezone(ha_tz).date()
            else:
                end_d = end_date.date()

            for component in cal.walk():
                if component.name != "VEVENT":
                    continue
                try:
                    dtstart  = component.get("DTSTART")
                    dtend    = component.get("DTEND")
                    summary  = str(component.get("SUMMARY",  "Untitled"))
                    location = str(component.get("LOCATION", ""))

                    if dtstart is None:
                        continue

                    start_val = dtstart.dt
                    end_val   = dtend.dt if dtend else None

                    if isinstance(start_val, datetime):
                        # Ensure timezone-aware so HA displays in correct local time
                        if start_val.tzinfo is not None:
                            start_val = start_val.astimezone(ha_tz)
                        else:
                            start_val = start_val.replace(tzinfo=ha_tz)
                        if isinstance(end_val, datetime):
                            if end_val.tzinfo is not None:
                                end_val = end_val.astimezone(ha_tz)
                            else:
                                end_val = end_val.replace(tzinfo=ha_tz)
                        else:
                            end_val = start_val + timedelta(hours=1)
                    elif isinstance(start_val, date):
                        if not isinstance(end_val, date):
                            end_val = start_val + timedelta(days=1)
                        # All-day events stay as date objects — HA handles these correctly
                        results.append(CalendarEvent(
                            start=start_val, end=end_val,
                            summary=summary, location=location,
                        ))
                        continue
                    else:
                        continue

                    results.append(CalendarEvent(
                        start=start_val, end=end_val,
                        summary=summary, location=location,
                    ))
                except Exception as err:
                    _LOGGER.debug("Skipping iCal event: %s", err)

            return results

        try:
            return await self._hass.async_add_executor_job(_parse)
        except Exception as err:
            _LOGGER.warning("iCal range parse failed for '%s': %s", self._name, err)
            return []

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _parse_time(self, day: date, time_str: str) -> datetime | None:
        if not time_str or time_str == "All Day":
            return None
        try:
            return datetime.strptime(f"{day} {time_str}", "%Y-%m-%d %I:%M %p")
        except Exception:
            return None

    @property
    def extra_state_attributes(self) -> dict:
        data     = self.coordinator.data or {}
        cal_data = data.get(self._name, {})
        return {
            "color":         self._color,
            "calendar_name": self._name,
            "events":        cal_data.get("events", []),
            "event_count":   cal_data.get("event_count", 0),
        }
