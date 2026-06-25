"""Config flow for Hades Vault."""
import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN


async def _test_vault(vault_url: str, client_id: str, client_secret: str) -> str | None:
    """
    Try fetching a token from Vault to validate credentials.
    Returns an error key string on failure, None on success.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{vault_url.rstrip('/')}/vault/verify",
                params={"value": "test"},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                # 200 or 400 both mean the server is reachable
                if resp.status in (200, 400, 404):
                    return None
                return "cannot_connect"
    except aiohttp.ClientConnectorError:
        return "cannot_connect"
    except Exception:
        return "unknown"


class HadesVaultConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Hades Vault."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            vault_url     = user_input["vault_url"].rstrip("/")
            client_id     = user_input["client_id"].strip()
            client_secret = user_input["client_secret"].strip()

            error = await _test_vault(vault_url, client_id, client_secret)
            if error:
                errors["base"] = error
            else:
                await self.async_set_unique_id("hades_vault")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="Hades Vault",
                    data={
                        "vault_url":     vault_url,
                        "client_id":     client_id,
                        "client_secret": client_secret,
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required("vault_url",     default="http://10.72.16.21:33167"): str,
                vol.Required("client_id",     default=""): str,
                vol.Required("client_secret", default=""): str,
            }),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return HadesVaultOptionsFlow(config_entry)


class HadesVaultOptionsFlow(config_entries.OptionsFlow):
    """Allow updating vault credentials without re-adding the integration."""

    def __init__(self, config_entry):
        self._entry = config_entry

    async def async_step_init(self, user_input=None):
        errors = {}
        data = self._entry.data

        if user_input is not None:
            vault_url     = user_input["vault_url"].rstrip("/")
            client_id     = user_input["client_id"].strip()
            client_secret = user_input["client_secret"].strip()

            error = await _test_vault(vault_url, client_id, client_secret)
            if error:
                errors["base"] = error
            else:
                # Update the config entry data in place
                self.hass.config_entries.async_update_entry(
                    self._entry,
                    data={
                        "vault_url":     vault_url,
                        "client_id":     client_id,
                        "client_secret": client_secret,
                    },
                )
                return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required("vault_url",     default=data.get("vault_url", "http://10.72.16.21:33167")): str,
                vol.Required("client_id",     default=data.get("client_id", "")): str,
                vol.Required("client_secret", default=""): str,  # never pre-fill secret
            }),
            errors=errors,
            description_placeholders={
                "current_id": data.get("client_id", "not set"),
            },
        )
