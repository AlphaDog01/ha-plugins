"""Generic webhook dispatcher for ha-household.

ONE native Home Assistant webhook (homeassistant.components.webhook — the
same mechanism the core Automation "Webhook" trigger uses under the hood,
wired up in Python instead). Every payload carries a "type" field
("chores", and later "bills", "meals", etc.). Each type has its own small
handler function registered once via register_webhook_type(); the
dispatcher just looks up the right one and calls it. No Jinja, no
`template:` integration, no per-type webhook IDs or automations.

To add a new type later:
  1. Write a handler: def _handle_<type>_payload(hass, payload) -> None
  2. register_webhook_type("<type>", _handle_<type>_payload)
That's the entire integration surface — the dispatcher, the webhook
registration, and the aiohttp plumbing never need to change.

The exact same handler functions are reachable from the set_chores service
(see __init__.py) via async_dispatch_webhook_payload(), so the webhook and
the Developer Tools > Actions test path always share one code path.

── Chores payload ──────────────────────────────────────────────────────────
Simple by design — one person, one chore action per call:
{
  "type": "chores",           # optional, defaults to "chores"
  "person": "mike",           # one of CHORES_PEOPLE, case-insensitive
  "chore": {
    "name": "Feed Cats",
    "points": 10,
    "action": "add"           # "add" | "complete" | "skip" | "reset"
  }
}
- "add": puts the chore in pending (removing any same-named entry from the
  other lists first, so re-adding is safe/idempotent).
- "complete" / "skip": moves it into that list and, for "complete", adds
  its points to the running points_total.
- "reset": clears all three lists and points_total for that person. The
  "chore" key can be omitted entirely for a reset call.
"""
from __future__ import annotations

import inspect
import logging
from typing import Awaitable, Callable

from aiohttp import web
from homeassistant.components import webhook
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, CHORES_PEOPLE

_LOGGER = logging.getLogger(__name__)

TypeHandler = Callable[[HomeAssistant, dict], "None | Awaitable[None]"]

# type name -> handler. Populated by register_webhook_type() calls at the
# bottom of this file (and by any future module that wants its own type).
_TYPE_HANDLERS: dict[str, TypeHandler] = {}


def register_webhook_type(type_name: str, handler: TypeHandler) -> None:
    """Register the handler for a payload `type`. Call once at import time."""
    _TYPE_HANDLERS[type_name.strip().lower()] = handler


async def async_dispatch_webhook_payload(hass: HomeAssistant, payload: dict) -> None:
    """Route a payload dict to its registered type handler.

    Used by both the actual webhook (JSON body straight off the wire) and
    the hades_household.set_chores service (a dict built from service call
    fields) — one code path, two entry points.
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")

    type_name = str(payload.get("type", "chores")).strip().lower()
    handler = _TYPE_HANDLERS.get(type_name)
    if handler is None:
        raise ValueError(f"no handler registered for type '{type_name}' — known types: {list(_TYPE_HANDLERS)}")

    result = handler(hass, payload)
    if inspect.isawaitable(result):
        await result


async def _handle_webhook(hass: HomeAssistant, webhook_id: str, request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except ValueError:
        return web.json_response({"error": "invalid JSON body"}, status=400)

    try:
        await async_dispatch_webhook_payload(hass, payload)
    except ValueError as err:
        return web.json_response({"error": str(err)}, status=400)

    return web.json_response({"success": True, "type": str(payload.get("type", "chores")).lower()})


async def async_register_chores_webhook(hass: HomeAssistant, webhook_id: str) -> None:
    """Register the (single, shared, all-types) webhook."""
    webhook.async_register(
        hass,
        DOMAIN,
        "Hades Household Webhook",
        webhook_id,
        _handle_webhook,
        local_only=True,
    )


async def async_unregister_chores_webhook(hass: HomeAssistant, webhook_id: str) -> None:
    """Unregister the webhook (e.g. on unload, or before re-registering a new ID)."""
    webhook.async_unregister(hass, webhook_id)


# ── Shared chores data store + push signal ──────────────────────────────────

def chores_data_store(hass: HomeAssistant, entry_id: str) -> dict:
    """Return (creating if needed) the in-memory per-person chores store for this entry."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    entry_data  = domain_data.setdefault(entry_id, {})
    return entry_data.setdefault("chores_data", {})


def chores_update_signal(person: str) -> str:
    """Dispatcher signal name a person's sensor listens on for push updates."""
    return f"{DOMAIN}_chores_updated_{person}"


def _empty_person_data() -> dict:
    return {"pending": [], "completed": [], "skipped": [], "points_total": 0}


# ── "chores" type handler ────────────────────────────────────────────────────

def handle_chores_payload(hass: HomeAssistant, payload: dict) -> None:
    """Apply one chores payload: {person, chore: {name, points, action}}."""
    person = str(payload.get("person", "")).strip().lower()
    if person not in CHORES_PEOPLE:
        raise ValueError(f"unknown person '{person}' — must be one of {CHORES_PEOPLE}")

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        raise ValueError("Hades Household is not configured")
    entry_id = entries[0].entry_id

    store = chores_data_store(hass, entry_id)
    person_data = store.setdefault(person, _empty_person_data())

    chore = payload.get("chore")
    action = str((chore or {}).get("action", "add")).strip().lower() if chore else "reset"

    if action == "reset":
        store[person] = _empty_person_data()
    else:
        name = (chore or {}).get("name")
        if not name:
            raise ValueError("chore.name is required unless action is 'reset'")
        points = (chore or {}).get("points", 0)

        # Remove any existing entry with this name from all three lists first —
        # makes re-sending the same chore (e.g. re-adding after a correction) safe.
        for key in ("pending", "completed", "skipped"):
            person_data[key] = [c for c in person_data[key] if c.get("name") != name]

        entry_obj = {"name": name, "points": points}
        if action == "add":
            person_data["pending"].append(entry_obj)
        elif action == "complete":
            person_data["completed"].append(entry_obj)
            person_data["points_total"] = person_data.get("points_total", 0) + points
        elif action == "skip":
            person_data["skipped"].append(entry_obj)
        else:
            raise ValueError(f"unknown chore action '{action}' — must be add, complete, skip, or reset")

    async_dispatcher_send(hass, chores_update_signal(person))
    _LOGGER.debug("Chores updated for %s (action=%s)", person, action)


register_webhook_type("chores", handle_chores_payload)
