# Hades HA Plugins

Monorepo for all Hades Home Assistant custom integrations and cards.

## Structure

```
ha-plugins/
├── install.sh          — installer, pulls this repo down and deploys it
├── bootstrap.sh         — tiny recovery script, keep a copy OFF the HA box
├── ha-household/        — Hades Household Integration (chores + calendars)
└── ha-cards/             — Custom Lovelace cards (hades-card.js, etc.)
```

`ha-auth` (JumpCloud OIDC SSO) has been retired and removed from this repo.

## Install

`/config/.hades_vault` and `~/install.sh` both get wiped by Home Assistant
updates, so there's nothing durable on the box itself to bootstrap from
anymore. Recovery works like this instead:

1. Keep a copy of `bootstrap.sh` **somewhere that isn't the HA box** —
   password manager, notes app, a private gist, wherever you'll actually
   have it after a wipe. It has your Vault client credentials hardcoded on
   purpose (see the comment at the top of the file) since there's nowhere
   local left to read them from.
2. Any time you need to (re)install — first setup, or after an HA update
   wiped things — paste `bootstrap.sh` into an SSH session and run it. It
   fetches a fresh GitHub token from Hades Vault, downloads `install.sh`
   from this repo, and runs it for you.
3. `bootstrap.sh` forwards any arguments straight through to `install.sh`,
   so it supports the same plugin selection:

```bash
# Install everything
./bootstrap.sh

# Install specific plugins only
./bootstrap.sh household
./bootstrap.sh cards
```

If `~/install.sh` already exists and you just want to repull without going
through Vault again, you can also run it directly — it just needs
`GITHUB_TOKEN` in the environment:

```bash
export GITHUB_TOKEN=ghp_...   # manual/debug use only
./install.sh household
```

## HA Box

| Thing | Value |
|-------|-------|
| HA box IP | `10.72.16.61` |
| SSH port | `2309` |
| SSH user | `root` |
| SSH command | `ssh root@10.72.16.61 -p 2309` |

## Plugins

### ha-household
Chore tracking + CalDAV/iCal calendars. Exposes sensors and calendar entities.
- Domain: `hades_household`
- Installed to: `/config/custom_components/hades_household/`

### ha-cards
Custom Lovelace cards.
- Installed to: `/config/www/`
- Register in HA: Settings → Dashboards → Resources → `/local/<card>.js`

## Rules

- Always modify files in GitHub and repull — never edit files directly on the server
- Repull: `./install.sh` (or `./bootstrap.sh` if install.sh itself is gone), then restart HA
- A plain integration **Reload** is not always enough after a household update —
  new/changed Python files often need a full **Settings → System → Restart**
- JS card changes: bump the resource URL version (`?v=N`) + hard refresh the
  browser. If a card keeps behaving like the old version after a bump+refresh,
  verify the actual bytes on disk (`wc -l` / `grep` the file on the server)
  before assuming it's just a caching issue.
