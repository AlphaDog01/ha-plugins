"""Sensors for Hades Household Integration."""
from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv, entity_platform
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_CALENDARS,
    COORDINATOR_CALENDARS,
    CONF_CHORES_WEBHOOK_ID,
    CHORES_PEOPLE,
)
from .webhook import (
    chores_data_store,
    chores_update_signal,
    async_dispatch_webhook_payload,
)
from .entity_cleanup import async_purge_stale_entities

_LOGGER = logging.getLogger(__name__)

_DEVICE_INFO = {
    "identifiers": {(DOMAIN, "hades_household")},
    "name":         "Hades Household",
    "manufacturer": "Hades",
    "model":        "Household Integration",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up all Hades Household sensors."""
    coordinators   = hass.data[DOMAIN][entry.entry_id]
    calendar_coord = coordinators[COORDINATOR_CALENDARS]

    entities: list[SensorEntity] = []

    # ── Calendar sensors ──────────────────────────────────────────────────────
    calendars = entry.options.get(CONF_CALENDARS, entry.data.get(CONF_CALENDARS, []))
    for cal in calendars:
        entities.append(HadesCalendarTodaySensor(calendar_coord, cal["name"]))

    # ── Chores sensors (webhook-driven, one per person) ───────────────────────
    chores_webhook_id = entry.options.get(
        CONF_CHORES_WEBHOOK_ID, entry.data.get(CONF_CHORES_WEBHOOK_ID, "")
    ).strip()
    if chores_webhook_id:
        for person in CHORES_PEOPLE:
            entities.append(HadesPersonChoresSensor(hass, entry.entry_id, person))

        # Entity-scoped action — this is what makes "Set Chore" selectable in
        # the Automation editor by TARGETING an entity (e.g. pick
        # sensor.hades_mike_chores_today under "Targets"), instead of a bare
        # domain service where you'd have to type the person by hand. Only
        # HadesPersonChoresSensor entities respond to it; calendar sensors
        # on this same platform are untouched (they just won't offer it).
        platform = entity_platform.async_get_current_platform()
        platform.async_register_entity_service(
            "set_chore",
            {
                vol.Required("action", default="add"): vol.In(["add", "complete", "skip", "reset"]),
                vol.Optional("chore_name"): cv.string,
                vol.Optional("chore_points", default=0): vol.Coerce(int),
            },
            "async_set_chore",
        )

    # Purge any sensor entity left in the registry from a past design
    # (old chores/points/rewards/reminders/leaderboard/meal sensors, etc.)
    # that the current code no longer creates.
    valid_unique_ids = {e._attr_unique_id for e in entities if getattr(e, "_attr_unique_id", None)}
    async_purge_stale_entities(hass, entry, "sensor", valid_unique_ids)

    async_add_entities(entities, True)


# ── Base ──────────────────────────────────────────────────────────────────────

class HadesBaseSensor(CoordinatorEntity, SensorEntity):
    """Base class for coordinator-driven (polled) Hades sensors."""

    def __init__(self, coordinator, unique_suffix: str, name: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id       = f"hades_household_{unique_suffix}"
        self._attr_name            = name
        self._attr_has_entity_name = False

    @property
    def device_info(self):
        return _DEVICE_INFO


# ── Calendar Sensors ──────────────────────────────────────────────────────────

class HadesCalendarTodaySensor(HadesBaseSensor):
    """Sensor for a calendar's today events — state is event count."""

    def __init__(self, coordinator, calendar_name: str) -> None:
        slug = calendar_name.lower().replace(" ", "_")
        super().__init__(
            coordinator,
            f"calendar_{slug}_today",
            f"Hades Calendar {calendar_name} Today",
        )
        self._calendar_name = calendar_name

    @property
    def state(self) -> int:
        data     = self.coordinator.data or {}
        cal_data = data.get(self._calendar_name, {})
        return cal_data.get("event_count", 0)

    @property
    def extra_state_attributes(self) -> dict:
        data     = self.coordinator.data or {}
        cal_data = data.get(self._calendar_name, {})
        attrs    = {
            "events":        cal_data.get("events", []),
            "event_count":   cal_data.get("event_count", 0),
            "calendar_name": self._calendar_name,
            "color":         cal_data.get("color", "#3B82F6"),
        }
        if "error" in cal_data:
            attrs["error"] = cal_data["error"]
        return attrs

    @property
    def icon(self) -> str:
        return "mdi:calendar-today"


# ── Chores Sensor (webhook push, not coordinator-polled) ───────────────────────

class HadesPersonChoresSensor(SensorEntity):
    """One person's chores today — full pending/completed/skipped lists,
    written directly from the chores webhook payload. Pushed instantly via
    dispatcher signal when a matching webhook POST arrives; no polling.

    Also exposes the `hades_household.set_chore` entity action (registered
    in async_setup_entry above), so this entity is directly targetable from
    the Automation editor's action picker — no need to know its person key,
    just target the entity.
    """

    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry_id: str, person: str) -> None:
        self._hass      = hass
        self._entry_id  = entry_id
        self._person    = person
        self._attr_unique_id = f"hades_household_{person}_chores_today"
        self._attr_name      = f"Hades {person.title()} Chores Today"
        self._attr_icon      = "mdi:checkbox-marked-circle-outline"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self._hass,
                chores_update_signal(self._person),
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    def _data(self) -> dict:
        store = chores_data_store(self._hass, self._entry_id)
        return store.get(self._person, {})

    @property
    def state(self) -> int:
        return len(self._data().get("pending", []))

    @property
    def extra_state_attributes(self) -> dict:
        d         = self._data()
        pending   = d.get("pending", [])
        completed = d.get("completed", [])
        skipped   = d.get("skipped", [])
        total     = len(pending) + len(completed) + len(skipped)
        pct       = round((len(completed) / total) * 100, 1) if total > 0 else 0
        return {
            "pending":            pending,
            "completed":          completed,
            "skipped":            skipped,
            "total_chores":       total,
            "completion_percent": pct,
            "points_total":       d.get("points_total", 0),
        }

    @property
    def device_info(self):
        return _DEVICE_INFO

    async def async_set_chore(self, action: str = "add", chore_name: str | None = None, chore_points: int = 0) -> None:
        """Handler for the hades_household.set_chore entity action."""
        payload = {
            "type":   "chores",
            "person": self._person,
            "chore": None if action == "reset" else {
                "name":   chore_name,
                "points": chore_points,
                "action": action,
            },
        }
        await async_dispatch_webhook_payload(self._hass, payload)
