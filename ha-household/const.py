"""Constants for Hades Household Integration."""

DOMAIN = "hades_household"

# ── Chores ────────────────────────────────────────────────────────────────────
CONF_CHORES_HOST     = "chores_host"
CONF_CHORES_API_KEY  = "chores_api_key"
CONF_TRACKED_PEOPLE  = "tracked_people"

# ── Hades Vault ───────────────────────────────────────────────────────────────
CONF_VAULT_URL           = "vault_url"
CONF_VAULT_CLIENT_ID     = "vault_client_id"
CONF_VAULT_CLIENT_SECRET = "vault_client_secret"
CONF_VAULT_SECRET_CHORES = "vault_secret_chores"
CONF_VAULT_SECRET_BUDGET = "vault_secret_budget"

CHORES_UPDATE_INTERVAL = 5  # minutes

# ── Calendars ─────────────────────────────────────────────────────────────────
CONF_CALENDARS          = "calendars"
CONF_CALENDAR_NAME      = "calendar_name"
CONF_CALENDAR_URL       = "calendar_url"
CONF_CALENDAR_TYPE      = "calendar_type"
CONF_CALENDAR_USERNAME  = "calendar_username"
CONF_CALENDAR_PASSWORD  = "calendar_password"
CONF_CALENDAR_COLOR     = "calendar_color"
CONF_CALENDAR_FILTER    = "calendar_filter"

CALENDAR_TYPE_ICAL   = "ical"
CALENDAR_TYPE_CALDAV = "caldav"

CALENDAR_COLORS = {
    "#3B82F6": "Blue",
    "#F97316": "Orange",
    "#EC4899": "Pink",
    "#22C55E": "Green",
    "#A855F7": "Purple",
    "#EF4444": "Red",
    "#F59E0B": "Yellow",
    "#14B8A6": "Teal",
    "#E5E7EB": "White",
}

CALENDAR_UPDATE_INTERVAL = 30  # minutes

# ── Coordinator keys ──────────────────────────────────────────────────────────
COORDINATOR_CHORES    = "chores"
COORDINATOR_CALENDARS = "calendars"

# ── Reminders ─────────────────────────────────────────────────────────────────
COORDINATOR_REMINDERS     = "reminders"
REMINDERS_UPDATE_INTERVAL = 1  # minutes — poll frequently so notifications fire fast

# ── Meal Planner ──────────────────────────────────────────────────────────────
CONF_MEAL_HOST          = "meal_host"
COORDINATOR_MEALS       = "meals"
MEALS_UPDATE_INTERVAL   = 10  # minutes
