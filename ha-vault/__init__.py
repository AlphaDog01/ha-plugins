"""Hades Vault — token broker client for Home Assistant."""
import logging
import time
import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# In-memory token cache: secret_name -> { token, expires_at }
_TOKEN_CACHE: dict = {}
_CACHE_TTL = 55  # seconds (Nexus caches 60s, we refresh 5s early)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN] = entry.data
    _LOGGER.info("Hades Vault initialized (url=%s)", entry.data.get("vault_url"))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True


async def get_vault_token(hass: HomeAssistant, secret_name: str) -> str | None:
    """
    Fetch a token from Hades Vault for the given secret_name.
    Uses the vault config stored in the hades_vault config entry.
    Results are cached for 55 seconds.
    """
    now = time.monotonic()
    cached = _TOKEN_CACHE.get(secret_name)
    if cached and cached["expires_at"] > now:
        return cached["token"]

    data = hass.data.get(DOMAIN)
    if not data:
        _LOGGER.error("Hades Vault not configured — no config entry found")
        return None

    vault_url    = data.get("vault_url", "").rstrip("/")
    client_id    = data.get("client_id", "")
    client_secret = data.get("client_secret", "")

    if not vault_url or not client_id or not client_secret:
        _LOGGER.error("Hades Vault config incomplete (url=%s, client_id=%s)", vault_url, client_id)
        return None

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{vault_url}/vault/token",
                json={
                    "client_id":    client_id,
                    "client_secret": client_secret,
                    "secret_name":  secret_name,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    _LOGGER.error(
                        "Hades Vault token request failed: %s — %s", resp.status, text
                    )
                    return None
                result = await resp.json()
                token = result.get("value") or result.get("token") or result.get("secret")
                if not token:
                    _LOGGER.error("Hades Vault returned no token: %s", result)
                    return None

                _TOKEN_CACHE[secret_name] = {
                    "token":      token,
                    "expires_at": now + _CACHE_TTL,
                }
                _LOGGER.debug("Hades Vault: fetched token for %s", secret_name)
                return token

    except aiohttp.ClientError as e:
        _LOGGER.error("Hades Vault connection error: %s", e)
        return None
    except Exception as e:
        _LOGGER.exception("Hades Vault unexpected error: %s", e)
        return None
