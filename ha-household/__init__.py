"""Hades Household Integration."""
from __future__ import annotations

import logging
from datetime import timedelta, datetime, date, timezone
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    CONF_CHORES_HOST,
    CONF_CHORES_API_KEY,
    CONF_TRACKED_PEOPLE,
    CONF_CALENDARS,
    CHORES_UPDATE_INTERVAL,
    CALENDAR_UPDATE_INTERVAL,
    COORDINATOR_CHORES,
    COORDINATOR_CALENDARS,
    COORDINATOR_REMINDERS,
    REMINDERS_UPDATE_INTERVAL,
    CONF_MEAL_HOST,
    COORDINATOR_MEALS,
    MEALS_UPDATE_INTERVAL,
    CONF_VAULT_SECRET_CHORES,
)
from .vault import resolve_api_key

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "calendar"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hades Household from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    chores_coordinator = HadesChoresCoordinator(hass, entry)
    await chores_coordinator.async_config_entry_first_refresh()

    calendar_coordinator = HadesCalendarCoordinator(hass, entry)
    await calendar_coordinator.async_config_entry_first_refresh()

    reminders_coordinator = HadesRemindersCoordinator(hass, entry)
    await reminders_coordinator.async_config_entry_first_refresh()

    coordinators = {
        COORDINATOR_CHORES:    chores_coordinator,
        COORDINATOR_CALENDARS: calendar_coordinator,
        COORDINATOR_REMINDERS: reminders_coordinator,
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

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _base_headers(content_type: bool = False) -> dict:
        api_key = await resolve_api_key(
            hass, entry.data,
            entry.data.get(CONF_VAULT_SECRET_CHORES, ""),
            entry.data.get(CONF_CHORES_API_KEY, ""),
        )
        headers = {}
        if api_key:
            headers["x-api-key"] = api_key
        if content_type:
            headers["Content-Type"] = "application/json"
        return headers

    def _host() -> str:
        return entry.data[CONF_CHORES_HOST].rstrip("/")

    async def _notify(title: str, message: str, notification_id: str) -> None:
        """Fire a phone notification AND create a persistent notification for audit trail."""
        # Phone push notification
        await hass.services.async_call(
            "notify", "notify",
            {"title": title, "message": message},
            blocking=False,
        )
        # Persistent notification — shows in Activity log with exact timestamp
        await hass.services.async_call(
            "persistent_notification", "create",
            {
                "title":           title,
                "message":         message,
                "notification_id": notification_id,
            },
            blocking=False,
        )
        _LOGGER.info("Notification sent [%s]: %s — %s", notification_id, title, message)

    # ── Reminder Services ─────────────────────────────────────────────────────

    async def handle_set_reminder(call):
        person_id = call.data["person_id"]
        text      = call.data["text"]
        session   = async_get_clientsession(hass)
        try:
            async with session.post(
                f"{_host()}/api/reminders/{person_id}",
                json={"text": text},
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                _LOGGER.info("Reminder set for person %s: %s", person_id, text)
        except Exception as err:
            _LOGGER.error("Failed to set reminder for person %s: %s", person_id, err)
        await reminders_coordinator.async_refresh()

    async def handle_clear_reminder(call):
        person_id = call.data["person_id"]
        session   = async_get_clientsession(hass)
        try:
            async with session.delete(
                f"{_host()}/api/reminders/{person_id}",
                headers=await _base_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                _LOGGER.info("Reminder cleared for person %s", person_id)
        except Exception as err:
            _LOGGER.error("Failed to clear reminder for person %s: %s", person_id, err)
        await reminders_coordinator.async_refresh()

    # ── Chore Services ────────────────────────────────────────────────────────

    async def handle_create_chore(call):
        payload = {
            "name":               call.data["name"],
            "description":        call.data.get("description", ""),
            "category":           call.data.get("category", "general"),
            "assignment_type":    call.data.get("assignment_type", "fixed"),
            "assigned_people":    call.data.get("assigned_people", []),
            "frequency_type":     call.data.get("frequency_type", "daily"),
            "frequency_interval": call.data.get("frequency_interval", 1),
            "frequency_days":     call.data.get("frequency_days", None),
            "due_time":           call.data.get("due_time", "20:00:00"),
            "points":             call.data.get("points", 10),
            "estimated_minutes":  call.data.get("estimated_minutes", 15),
        }
        session = async_get_clientsession(hass)
        try:
            async with session.post(
                f"{_host()}/api/chores",
                json=payload,
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                result = await resp.json()
                _LOGGER.info("Chore created: %s", result)
        except Exception as err:
            _LOGGER.error("Failed to create chore: %s", err)
        await chores_coordinator.async_refresh()

    async def handle_update_chore(call):
        chore_id = call.data["chore_id"]
        payload  = {}
        for field in [
            "name", "description", "category", "assignment_type",
            "assigned_people", "frequency_type", "frequency_interval",
            "frequency_days", "due_time", "points", "estimated_minutes", "active",
        ]:
            if field in call.data:
                payload[field] = call.data[field]

        if not payload:
            _LOGGER.warning("update_chore called with no fields to update")
            return

        session = async_get_clientsession(hass)
        try:
            async with session.put(
                f"{_host()}/api/chores/{chore_id}",
                json=payload,
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                _LOGGER.info("Chore %s updated", chore_id)
        except Exception as err:
            _LOGGER.error("Failed to update chore %s: %s", chore_id, err)
        await chores_coordinator.async_refresh()

    async def handle_complete_chore(call):
        instance_id = call.data["instance_id"]
        person_id   = call.data.get("person_id")
        session     = async_get_clientsession(hass)
        try:
            body = {}
            if person_id:
                body["completed_by"] = person_id
            async with session.patch(
                f"{_host()}/api/instances/{instance_id}/complete",
                json=body,
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                result = await resp.json()
                _LOGGER.info(
                    "Chore instance %s completed, points awarded: %s",
                    instance_id, result.get("data", {}).get("points_awarded", "?")
                )
        except Exception as err:
            _LOGGER.error("Failed to complete chore instance %s: %s", instance_id, err)
        await chores_coordinator.async_refresh()

    # ── Points Services ───────────────────────────────────────────────────────

    async def handle_adjust_points(call):
        person_id = call.data["person_id"]
        points    = call.data["points"]
        reason    = call.data["reason"]
        session   = async_get_clientsession(hass)
        try:
            async with session.post(
                f"{_host()}/api/points/adjust",
                json={"person_id": person_id, "points": points, "reason": reason},
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                result     = await resp.json()
                new_total  = result.get("new_total", "?")
                direction  = "awarded" if points > 0 else "deducted"
                _LOGGER.info(
                    "Points adjusted for person %s: %s pts — new total: %s",
                    person_id, points, new_total
                )
                # Notify parent of manual point adjustment
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                await _notify(
                    title   = f"⭐ Points {direction.title()}",
                    message = f"Person {person_id}: {abs(points)} pts {direction} — {reason} (new total: {new_total})",
                    notification_id = f"hades_points_{person_id}_{ts}",
                )
        except Exception as err:
            _LOGGER.error("Failed to adjust points for person %s: %s", person_id, err)
        await chores_coordinator.async_refresh()

    # ── Rewards Services ──────────────────────────────────────────────────────

    async def handle_create_reward(call):
        payload = {
            "name":            call.data["name"],
            "description":     call.data.get("description", ""),
            "points_required": call.data["points_required"],
            "icon":            call.data.get("icon", "🎁"),
        }
        session = async_get_clientsession(hass)
        try:
            async with session.post(
                f"{_host()}/api/points/rewards",
                json=payload,
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                result = await resp.json()
                _LOGGER.info("Reward created with id: %s", result.get("id"))
        except Exception as err:
            _LOGGER.error("Failed to create reward: %s", err)
        await chores_coordinator.async_refresh()

    async def handle_redeem_reward(call):
        reward_id   = call.data["reward_id"]
        person_id   = call.data["person_id"]
        person_name = call.data.get("person_name", f"Person {person_id}")
        reward_name = call.data.get("reward_name", f"Reward {reward_id}")
        session     = async_get_clientsession(hass)
        try:
            async with session.post(
                f"{_host()}/api/points/rewards/{reward_id}/redeem",
                json={"person_id": person_id},
                headers=await _base_headers(content_type=True),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json()
                if not data.get("success"):
                    error = data.get("error", "Unknown error")
                    _LOGGER.warning("Reward redemption failed: %s", error)
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    await _notify(
                        title           = "⚠️ Reward Redemption Failed",
                        message         = f"{person_name} tried to redeem '{reward_name}' but failed: {error}",
                        notification_id = f"hades_redeem_fail_{person_id}_{ts}",
                    )
                    return

                points_spent = data.get("points_spent", "?")
                new_total    = data.get("new_total", "?")
                _LOGGER.info(
                    "%s redeemed '%s' for %s pts — new total: %s",
                    person_name, reward_name, points_spent, new_total
                )
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                await _notify(
                    title           = "🎁 Reward Redeemed!",
                    message         = (
                        f"{person_name} redeemed: {reward_name} "
                        f"({points_spent} pts spent, {new_total} pts remaining)"
                    ),
                    notification_id = f"hades_redeem_{person_id}_{ts}",
                )

        except Exception as err:
            _LOGGER.error("Failed to redeem reward %s for person %s: %s", reward_id, person_id, err)
        await chores_coordinator.async_refresh()

    # ── Register all services ─────────────────────────────────────────────────

    hass.services.async_register(DOMAIN, "set_reminder",   handle_set_reminder)
    hass.services.async_register(DOMAIN, "clear_reminder", handle_clear_reminder)
    hass.services.async_register(DOMAIN, "create_chore",   handle_create_chore)
    hass.services.async_register(DOMAIN, "update_chore",   handle_update_chore)
    hass.services.async_register(DOMAIN, "complete_chore", handle_complete_chore)
    hass.services.async_register(DOMAIN, "adjust_points",  handle_adjust_points)
    hass.services.async_register(DOMAIN, "create_reward",  handle_create_reward)
    hass.services.async_register(DOMAIN, "redeem_reward",  handle_redeem_reward)

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


# ── Chores Coordinator ────────────────────────────────────────────────────────

class HadesChoresCoordinator(DataUpdateCoordinator):
    """Coordinator for Hades Chores API."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.host           = entry.data[CONF_CHORES_HOST].rstrip("/")
        self.api_key        = entry.data.get(CONF_CHORES_API_KEY, "")
        self.vault_secret   = entry.data.get(CONF_VAULT_SECRET_CHORES, "")
        self.entry_data     = entry.data
        self.tracked_people = entry.data.get(CONF_TRACKED_PEOPLE, [])
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_chores",
            update_interval=timedelta(minutes=CHORES_UPDATE_INTERVAL),
        )

    async def _fetch(self, path: str) -> Any:
        """Fetch from Hades API and unwrap {success, data} envelope."""
        url     = f"{self.host}{path}"
        api_key = await resolve_api_key(self.hass, self.entry_data, self.vault_secret, self.api_key)
        headers = {}
        if api_key:
            headers["x-api-key"] = api_key
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                json_data = await resp.json()
                if isinstance(json_data, dict) and "data" in json_data:
                    return json_data["data"]
                return json_data

    async def _async_update_data(self) -> dict:
        """Fetch all chores data from real API routes."""
        try:
            all_instances = await self._fetch("/api/instances/today")
            leaderboard   = await self._fetch("/api/dashboard/leaderboard")
            all_people    = await self._fetch("/api/people")
            all_chores    = await self._fetch("/api/chores")
            all_rewards   = await self._fetch("/api/points/rewards")

            data: dict = {}

            # Build points and name lookup from /api/people
            points_lookup: dict = {}
            name_lookup: dict   = {}
            if isinstance(all_people, list):
                for p in all_people:
                    pid                = str(p["id"])
                    points_lookup[pid] = p.get("points_total", 0)
                    name_lookup[pid]   = (p.get("display_name") or p["name"]).lower()

            # Slice instances per tracked person
            for person_id in self.tracked_people:
                pid       = str(person_id)
                completed = []
                pending   = []
                skipped   = []

                if isinstance(all_instances, list):
                    for inst in all_instances:
                        if str(inst.get("person_id", "")) != pid:
                            continue
                        obj = {
                            "id":           inst.get("id"),
                            "name":         inst.get("chore_name", ""),
                            "points":       inst.get("points", 0),
                            "completed_at": inst.get("completed_at"),
                        }
                        status = inst.get("status", "pending")
                        if status == "completed":
                            completed.append(obj)
                        elif status == "skipped":
                            skipped.append(obj)
                        else:
                            pending.append(obj)

                data[pid] = {
                    "completed":    completed,
                    "pending":      pending,
                    "skipped":      skipped,
                    "points_total": points_lookup.get(pid, 0),
                    "name":         name_lookup.get(pid, pid),
                }

            # Summary
            if isinstance(all_instances, list):
                total     = len(all_instances)
                completed = sum(1 for i in all_instances if i.get("status") == "completed")
                skipped   = sum(1 for i in all_instances if i.get("status") == "skipped")
                pending   = total - completed - skipped
                pct       = round((completed / total) * 100) if total > 0 else 0
                data["summary"] = {
                    "total":              total,
                    "completed":          completed,
                    "pending":            pending,
                    "skipped":            skipped,
                    "completion_percent": pct,
                    "all_done":           pending == 0 and total > 0,
                }
            else:
                data["summary"] = {
                    "total": 0, "completed": 0, "pending": 0,
                    "skipped": 0, "completion_percent": 0, "all_done": False,
                }

            data["leaderboard"] = leaderboard
            data["chores"]      = all_chores if isinstance(all_chores, list) else []
            data["rewards"]     = all_rewards if isinstance(all_rewards, list) else []

            # Full people list for management dashboard
            data["people"] = [
                {
                    "id":           p.get("id"),
                    "name":         p.get("display_name") or p.get("name", ""),
                    "role":         p.get("role", "child"),
                    "active":       p.get("active", 1),
                    "points_total": p.get("points_total", 0),
                }
                for p in (all_people if isinstance(all_people, list) else [])
            ]

            return data
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Chores API error: {err}") from err


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


# ── Reminders Coordinator ─────────────────────────────────────────────────────

class HadesRemindersCoordinator(DataUpdateCoordinator):
    """Coordinator for Hades Reminders API."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.host         = entry.data[CONF_CHORES_HOST].rstrip("/")
        self.api_key      = entry.data.get(CONF_CHORES_API_KEY, "")
        self.vault_secret = entry.data.get(CONF_VAULT_SECRET_CHORES, "")
        self.entry_data   = entry.data
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_reminders",
            update_interval=timedelta(minutes=REMINDERS_UPDATE_INTERVAL),
        )

    async def _fetch(self, path: str) -> Any:
        url     = f"{self.host}{path}"
        api_key = await resolve_api_key(self.hass, self.entry_data, self.vault_secret, self.api_key)
        headers = {}
        if api_key:
            headers["x-api-key"] = api_key
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                json_data = await resp.json()
                if isinstance(json_data, dict) and "data" in json_data:
                    return json_data["data"]
                return json_data

    async def _async_update_data(self) -> dict:
        try:
            reminders = await self._fetch("/api/reminders")
            result    = {}
            if isinstance(reminders, list):
                for r in reminders:
                    pid         = str(r["person_id"])
                    result[pid] = {
                        "id":          r["id"],
                        "text":        r["text"],
                        "created_at":  r.get("created_at"),
                        "person_name": r.get("display_name") or r.get("person_name", ""),
                    }
            return result
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Reminders API error: {err}") from err


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
