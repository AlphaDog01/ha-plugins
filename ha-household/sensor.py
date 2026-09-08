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
    CONF_MEAL_HOST,
    COORDINATOR_CALENDARS,
    COORDINATOR_MEALS,
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

    # ── Meal sensor (optional — only if meal_host configured) ────────────────
    meal_host = entry.options.get(CONF_MEAL_HOST, entry.data.get(CONF_MEAL_HOST, ""))
    if meal_host and COORDINATOR_MEALS in coordinators:
        entities.append(HadesMealTodaySensor(coordinators[COORDINATOR_MEALS]))

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


# ── Meal Sensors ──────────────────────────────────────────────────────────────

class HadesMealTodaySensor(HadesBaseSensor):
    """Today's meal — state is the meal title."""

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "meal_today", "Hades Meal Today")

    def _today(self) -> dict:
        return (self.coordinator.data or {}).get("today", {})

    @property
    def state(self) -> str:
        return self._today().get("title", "No meal plan")

    @property
    def extra_state_attributes(self) -> dict:
        d = self._today()
        return {
            "photo":  d.get("photo"),
            "method": d.get("method"),
        }

    @property
    def icon(self) -> str:
        return "mdi:silverware-fork-knife"


class HadesRecipesSensor(HadesBaseSensor):
    """Full recipe vault — state is recipe count, attributes hold the list.

    entity_id: sensor.hades_recipes
    Use in the hades-card with card_type: meal_recipes to browse the vault.
    """

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "recipes", "Hades Recipes")

    def _recipes(self) -> list:
        return (self.coordinator.data or {}).get("recipes", [])

    @property
    def state(self) -> int:
        return len(self._recipes())

    @property
    def extra_state_attributes(self) -> dict:
        recipes = self._recipes()
        # Slim each recipe down for HA attribute size limits — drop base64 photo
        # from the list view (it's still available on the today sensor per meal)
        slim = []
        for r in recipes:
            slim.append({
                "id":           r.get("id"),
                "title":        r.get("title"),
                "emoji":        r.get("emoji", "🍽"),
                "method":       r.get("method"),
                "portions":     r.get("portions", 7),
                "weekend_only": r.get("weekend_only", False),
                "categories":   r.get("categories", []),
                "has_photo":    bool(r.get("photo")),
                # Include ingredients + steps — useful for card display
                "ingredients":  r.get("ingredients", []),
                "steps":        r.get("steps", []),
                "diabetic_note":r.get("diabetic_note", ""),
            })
        return {
            "recipes":      slim,
            "total":        len(slim),
            "methods":      list({r["method"] for r in slim if r.get("method")}),
        }

    @property
    def icon(self) -> str:
        return "mdi:book-open-variant"


class HadesMealPlanSensor(HadesBaseSensor):
    """Active meal plan summary — state is plan name, attributes have the schedule.

    entity_id: sensor.hades_meal_plan
    """

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "meal_plan", "Hades Meal Plan")

    def _plan(self) -> dict:
        return (self.coordinator.data or {}).get("plan", {})

    @property
    def state(self) -> str:
        plan = self._plan()
        return plan.get("name") or plan.get("plan_name") or "No active plan"

    @property
    def extra_state_attributes(self) -> dict:
        plan = self._plan()
        raw  = plan.get("raw_json", {})
        days = plan.get("days", [])

        return {
            "plan_name":    plan.get("name") or raw.get("plan_name"),
            "generated_at": plan.get("generated_at"),
            "start_date":   plan.get("start_date"),
            "is_active":    plan.get("is_active", False),
            "total_days":   len(days),
            # Day schedule — title + emoji per day, no photos (size)
            "schedule": [
                {
                    "day":     d.get("day"),
                    "weekend": d.get("weekend", False),
                    "repeat":  d.get("repeat", False),
                    "title":   d.get("recipe_title"),
                    "emoji":   d.get("recipe_emoji", "🍽"),
                }
                for d in days
            ],
        }

    @property
    def icon(self) -> str:
        return "mdi:calendar-month"
