"""Hades Vault client — internal to ha-household."""
from __future__ import annotations

import logging
import time

import aiohttp
from homeassistant.core import HomeAssistant

from .const import CONF_VAULT_URL, CONF_VAULT_CLIENT_ID, CONF_VAULT_CLIENT_SECRET

_LOGGER = logging.getLogger(__name__)

# In-memory cache: secret_name -> {token, expires_at}
_CACHE: dict[str, dict] = {}
_TTL = 55  # seconds — Nexus caches 60s, refresh 5s early


async def get_vault_token(hass: HomeAssistant, entry_data: dict, secret_name: str) -> str | None:
    """
    Fetch a token from Hades Vault for secret_name.
    Uses vault config from the config entry data dict.
    Results are cached for 55 seconds.
    """
    now = time.monotonic()
    cached = _CACHE.get(secret_name)
    if cached and cached["expires_at"] > now:
        return cached["token"]

    vault_url     = entry_data.get(CONF_VAULT_URL, "").rstrip("/")
    client_id     = entry_data.get(CONF_VAULT_CLIENT_ID, "")
    client_secret = entry_data.get(CONF_VAULT_CLIENT_SECRET, "")

    if not vault_url or not client_id or not client_secret:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{vault_url}/vault/token",
                json={
                    "client_id":     client_id,
                    "client_secret": client_secret,
                    "secret_name":   secret_name,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    _LOGGER.error("Vault token request failed: %s — %s", resp.status, text)
                    return None
                result = await resp.json()
                token = result.get("value") or result.get("token") or result.get("secret")
                if not token:
                    _LOGGER.error("Vault returned no token: %s", result)
                    return None
                _CACHE[secret_name] = {"token": token, "expires_at": now + _TTL}
                _LOGGER.debug("Vault: fetched token for %s", secret_name)
                return token
    except aiohttp.ClientError as e:
        _LOGGER.error("Vault connection error: %s", e)
        return None
    except Exception as e:
        _LOGGER.exception("Vault unexpected error: %s", e)
        return None


async def resolve_api_key(hass: HomeAssistant, entry_data: dict, secret_name: str, fallback_key: str = "") -> str:
    """
    Return the best available API key.
    Tries Vault first, falls back to raw key if vault is not configured or fails.
    """
    if secret_name and entry_data.get(CONF_VAULT_URL):
        token = await get_vault_token(hass, entry_data, secret_name)
        if token:
            return token
    return fallback_key
