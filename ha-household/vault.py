"""Hades Vault client — internal to ha-household."""
from __future__ import annotations

import logging
import os
import time

import aiohttp

from homeassistant.core import HomeAssistant

from .const import (
    CONF_VAULT_URL,
    CONF_VAULT_CLIENT_ID,
    CONF_VAULT_CLIENT_SECRET,
)

_LOGGER = logging.getLogger(__name__)

VAULT_ENV_FILE = "/config/.hades_vault"

# In-memory cache: secret_name -> {token, expires_at}
_CACHE: dict[str, dict] = {}
_TTL = 55  # seconds


def load_vault_env() -> dict:
    """
    Read /config/.hades_vault env file written by install.sh.
    Returns a dict of key=value pairs. Returns {} if file doesn't exist.

    NOTE: This does blocking file I/O. Never call this directly from
    async code — always go through load_vault_env_async(), which runs
    this in HA's executor instead of the event loop.
    """
    if not os.path.exists(VAULT_ENV_FILE):
        return {}
    result = {}
    try:
        with open(VAULT_ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                result[key.strip()] = value.strip()
    except Exception as e:
        _LOGGER.warning("Could not read %s: %s", VAULT_ENV_FILE, e)
    return result


async def load_vault_env_async(hass: HomeAssistant) -> dict:
    """Async-safe wrapper — runs load_vault_env() in HA's executor."""
    return await hass.async_add_executor_job(load_vault_env)


def _write_vault_env(env: dict) -> bool:
    """
    Blocking write of the env dict back to VAULT_ENV_FILE.
    Never call this directly from async code — always go through
    save_vault_secret_async().
    """
    try:
        lines = [f"{k}={v}\n" for k, v in env.items()]
        with open(VAULT_ENV_FILE, "w") as f:
            f.writelines(lines)
        os.chmod(VAULT_ENV_FILE, 0o600)
        _LOGGER.info("Vault secret updated in %s", VAULT_ENV_FILE)
        return True
    except Exception as e:
        _LOGGER.error("Could not update %s: %s", VAULT_ENV_FILE, e)
        return False


def save_vault_secret(new_secret: str) -> bool:
    """
    Update VAULT_CLIENT_SECRET in /config/.hades_vault.
    Called when the user updates the secret via the HA options flow.
    Returns True on success.

    NOTE: This does blocking file I/O (a read then a write). Never call
    this directly from async code — always go through
    save_vault_secret_async(), which runs it in HA's executor.
    """
    env = load_vault_env()
    env["VAULT_CLIENT_SECRET"] = new_secret
    return _write_vault_env(env)


async def save_vault_secret_async(hass: HomeAssistant, new_secret: str) -> bool:
    """Async-safe wrapper — runs save_vault_secret() in HA's executor."""
    return await hass.async_add_executor_job(save_vault_secret, new_secret)


async def get_vault_config_async(
    hass: HomeAssistant, entry_data: dict
) -> tuple[str, str, str]:
    """
    Async-safe version of get_vault_config.
    Return (vault_url, client_id, client_secret).
    Priority: /config/.hades_vault > config entry data.
    Client ID is always read from the env file if present (immutable from UI).
    """
    env = await load_vault_env_async(hass)
    vault_url     = env.get("VAULT_URL")            or entry_data.get(CONF_VAULT_URL, "")
    client_id     = env.get("VAULT_CLIENT_ID")      or entry_data.get(CONF_VAULT_CLIENT_ID, "")
    client_secret = env.get("VAULT_CLIENT_SECRET")  or entry_data.get(CONF_VAULT_CLIENT_SECRET, "")
    return vault_url.rstrip("/"), client_id, client_secret


async def get_vault_token(hass: HomeAssistant, entry_data: dict, secret_name: str) -> str | None:
    """
    Fetch a token from Hades Vault for secret_name.
    Reads credentials from /config/.hades_vault first, falls back to config entry data.
    Results are cached for 55 seconds.
    """
    now = time.monotonic()
    cached = _CACHE.get(secret_name)
    if cached and cached["expires_at"] > now:
        return cached["token"]

    vault_url, client_id, client_secret = await get_vault_config_async(hass, entry_data)

    if not vault_url or not client_id or not client_secret:
        _LOGGER.debug("Vault not configured (url=%s, id=%s)", vault_url, bool(client_id))
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
                    _LOGGER.error("Vault returned no token for %s: %s", secret_name, result)
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


async def resolve_api_key(
    hass: HomeAssistant,
    entry_data: dict,
    secret_name: str,
    fallback_key: str = "",
) -> str:
    """
    Return the best available API key.
    Tries Vault first, falls back to raw key if vault is not configured or fails.
    """
    if secret_name:
        token = await get_vault_token(hass, entry_data, secret_name)
        if token:
            return token
    return fallback_key
