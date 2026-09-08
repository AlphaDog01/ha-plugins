"""Constants for Hades Household Integration."""

DOMAIN = "hades_household"

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
COORDINATOR_CALENDARS = "calendars"

# ── Meal Planner ──────────────────────────────────────────────────────────────
CONF_MEAL_HOST          = "meal_host"
COORDINATOR_MEALS       = "meals"
MEALS_UPDATE_INTERVAL   = 10  # minutes
