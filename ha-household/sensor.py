"""Sensors for Hades Household Integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_CALENDARS,
    COORDINATOR_CALENDARS,
)

_LOGGER = logging.getLogger(__name__)


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

    async_add_entities(entities, True)


# ── Base ──────────────────────────────────────────────────────────────────────

class HadesBaseSensor(CoordinatorEntity, SensorEntity):
    """Base class for Hades sensors."""

    def __init__(self, coordinator, unique_suffix: str, name: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id       = f"hades_household_{unique_suffix}"
        self._attr_name            = name
        self._attr_has_entity_name = False

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, "hades_household")},
            "name":         "Hades Household",
            "manufacturer": "Hades",
            "model":        "Household Integration",
        }


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
