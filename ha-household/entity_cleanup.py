"""Shared entity-registry cleanup helper for ha-household.

Home Assistant does NOT remove an entity from the registry just because the
code that created it goes away — it just sits there reporting "unavailable"
forever. This integration has been through several rounds of removing
sensor types (chores/points/rewards/reminders/leaderboard from the old
API-backed design, then the meal planner, then the person/summary/stat card
types), so without this, stale entities from every one of those rounds
would still be hanging around.

async_purge_stale_entities() runs on every setup/reload: it looks at every
registry entry tied to this config entry for one platform ("sensor",
"calendar", ...), and removes any whose unique_id isn't in the set the
current code is actually about to create. Self-healing — the next time a
sensor type gets removed from the code, its leftover entities are cleaned
up automatically on the next reload, with no manual registry surgery.
"""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

_LOGGER = logging.getLogger(__name__)


def async_purge_stale_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    entity_domain: str,
    valid_unique_ids: set[str],
) -> None:
    """Remove this entry's registry entries in `entity_domain` (e.g. "sensor")
    whose unique_id isn't in `valid_unique_ids`.
    """
    registry = er.async_get(hass)
    existing = er.async_entries_for_config_entry(registry, entry.entry_id)
    for reg_entry in existing:
        if reg_entry.domain != entity_domain:
            continue
        if reg_entry.unique_id not in valid_unique_ids:
            _LOGGER.info(
                "Removing stale %s entity no longer created by current code: "
                "%s (unique_id=%s)",
                entity_domain, reg_entry.entity_id, reg_entry.unique_id,
            )
            registry.async_remove(reg_entry.entity_id)
