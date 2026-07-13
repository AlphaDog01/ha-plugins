"""HTTP views for ha-household — exposes vault tokens to the frontend
without ever handing the raw client secret to the browser.
"""
from __future__ import annotations

import logging

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .vault import get_vault_token

_LOGGER = logging.getLogger(__name__)

# Only these secret names may be requested by the frontend.
# Add new ones here deliberately — never let the URL param be
# passed straight through to get_vault_token() unchecked.
ALLOWED_SECRETS = {"budget-api", "chores-api"}


class HadesVaultTokenView(HomeAssistantView):
    """GET /api/hades_household/vault_token/{secret_name}

    Returns a short-lived Vault token for an allow-listed secret name.
    Requires a normal authenticated HA session/token — same auth the
    frontend already uses for every other /api/ call via hass.callApi().
    The raw client_id/client_secret never leave the backend.
    """

    url = "/api/hades_household/vault_token/{secret_name}"
    name = "api:hades_household:vault_token"
    requires_auth = True

    async def get(self, request: web.Request, secret_name: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]

        if secret_name not in ALLOWED_SECRETS:
            return self.json_message(
                f"Unknown secret_name '{secret_name}'", status_code=400
            )

        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            return self.json_message(
                "Hades Household is not configured", status_code=503
            )

        # If you ever run multiple entries, adjust this to pick the
        # right one — most setups will just have the one.
        entry_data = entries[0].data

        token = await get_vault_token(hass, entry_data, secret_name)

        if not token:
            return self.json_message(
                "Could not obtain a Vault token", status_code=502
            )

        return self.json({"token": token})


async def async_register_views(hass: HomeAssistant) -> None:
    """Call this once from async_setup_entry (or async_setup)."""
    hass.http.register_view(HadesVaultTokenView())
