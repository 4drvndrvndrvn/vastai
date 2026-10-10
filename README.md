# Roblox Studio on Vast.ai

Runs Roblox Studio on a rented Vast.ai GPU machine (through TuxBlox, installed from the [4drvndrvndrvn/tuxblox](https://github.com/4drvndrvndrvn/tuxblox) fork's releases) and publishes Studio's built-in MCP server, so you can drive Studio from a web page or any MCP client.

## Quick start

1. Put your Vast API key in `.env` next to these files: `VAST_API_KEY=...`
2. Start the web interface:

   ```bash
   python studio_web.py
   ```

   It opens http://127.0.0.1:8787 in your browser.
3. Click **Rent the cheapest and set it up**. Setup takes about 10 minutes.
4. Open the remote desktop, sign in to Roblox Studio (or let it sign in by itself, see below), open a place, then turn on Assistant → ⋯ → Manage MCP Servers → **Enable Studio as MCP server**. The page switches to the editor as soon as Studio answers.

The machine bills by the hour until you destroy it (top bar → machine → **Destroy machine**, or `python roblox_studio_vast.py down`).

## The web interface (`studio_web.py`, `web/`)

- **Machine**: offers filtered for CPUs fast enough for Studio, renting with automatic failover, live setup progress, cost so far, and actions to relaunch Studio, repair the MCP bridge, or destroy the machine.
- **Explorer & Properties**: browse the game tree, search instances, and inspect properties. Click a value to change it (booleans, numbers, strings, enums, vectors and colours).
- **Viewport**: capture what Studio sees, auto-refresh, or point the camera at the selected instance.
- **Luau**: run code in the Edit, Client or Server data model, with snippets and run history.
- **Scripts**: find scripts by name or content, edit them, and save back to Studio (Ctrl+S). You can also create new scripts.
- **Tools**: every MCP tool Studio offers, with a form built from its schema, or raw JSON.
- **Output & Activity**: Studio's output log, live and filterable, plus every MCP call the page made.
- Play and Stop for playtests, a command palette (Ctrl+K), and light and dark themes.

It listens on 127.0.0.1 only. The MCP token stays on your PC, and requests from other websites are rejected.

Options: `--port 9000`, `--no-browser`, and `--mcp-url http://127.0.0.1:8765/mcp` to go through an SSH tunnel (`python roblox_studio_vast.py tunnel`) instead of the machine's public port.

## Command line (`roblox_studio_vast.py`)

| Command | What it does |
| --- | --- |
| `offers` | Lists machines that fit. Free. |
| `up` | Rents the cheapest fit and sets everything up. Tries another machine if one fails. |
| `status` | Shows the instance state, URLs and an MCP check. |
| `setup [all\|check\|install\|launch\|signin\|bridge]` | Re-runs setup steps on the machine. |
| `wait-mcp` | Waits until Studio answers over MCP. |
| `tunnel` | Forwards the MCP server to http://127.0.0.1:8765/mcp over SSH. |
| `ssh` / `down` | Opens a shell / destroys the machine. |

`remote_setup.sh` is what runs on the machine. It installs TuxBlox, starts Studio, and serves its MCP server with `mcp-proxy` behind the instance's token-protected Caddy proxy.

## Which TuxBlox gets installed

The newest GitHub release of [4drvndrvndrvn/tuxblox](https://github.com/4drvndrvndrvn/tuxblox/releases): its `TuxBlox-*-linux-x86_64.tar.zst` bundle is downloaded, checked against the SHA-256 GitHub publishes for it, and unpacked as `~/.tuxblox` on the machine. A newer release is picked up the next time setup runs; Roblox, its prefix and the launcher's settings are kept. To choose differently, add either of these to `.env`:

```
TUXBLOX_RELEASE=v3.1.0-fork.5    # pin one release instead of the newest
TUXBLOX_REPO=someone/tuxblox     # another repository with the same kind of release
```

TuxBlox's own auto-update is off by default, so the official build doesn't replace the fork.

## Automatic Studio sign-in

Put a Roblox login in `.env` and Studio signs in by itself, using the fork's `--magictoken`:

```
ROBLOX_USERNAME=YourAccount
ROBLOX_PASSWORD=its-password
```

The login is sent to the machine over SSH's standard input (never on a command line), handed to TuxBlox, which keeps it in `~/.tuxblox/sign-in` (owner-only), and the uploaded copy is deleted. It does sit on a rented machine whose host has root access, so use a throwaway account. If Roblox asks for a captcha or a verification step, finish it on the remote desktop. After changing the login, run `python roblox_studio_vast.py setup signin` (or **Sign in again** in the web interface's machine drawer), which applies it and restarts Studio.

## Running it on a VPS

Secrets live only in `.env`, which git ignores (as is every `.env.*` except `.env.example`), so the repository can be pushed anywhere and cloned on the VPS. The VPS needs Python 3.9+, git and the OpenSSH client; there are no pip packages.

1. Copy the secrets over SSH, or fill in a copy of `.env.example` on the VPS, then `chmod 600 .env` there.
2. Give the VPS an SSH key (`ssh-keygen -t ed25519`) and add its `.pub` on Vast's Keys page, so it can reach every machine you rent (`up` also attaches `~/.ssh/id_ed25519.pub` to the machines it rents itself).
3. Run `python3 studio_web.py --no-browser`, in tmux or as a systemd service like the one below. It reads `.env` from its own folder.
4. Open it from your PC through an SSH tunnel: `ssh -N -L 8787:127.0.0.1:8787 you@your-vps`, then http://127.0.0.1:8787. Don't publish port 8787: the page has no password and can rent machines.

```ini
# /etc/systemd/system/studio-remote.service
[Unit]
Description=Studio Remote
After=network-online.target
Wants=network-online.target

[Service]
User=you
WorkingDirectory=/home/you/vastai
ExecStart=/usr/bin/python3 studio_web.py --no-browser
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Which machine you rented is remembered per folder (`.vast-roblox-state.json`), so manage a machine from the place that rented it.

## Connecting other MCP clients

After setup, `mcp-client-config.json` holds the URL and token. The machine drawer in the web interface also shows a ready-made `claude mcp add` command. The public MCP port is plain HTTP; use `tunnel` if you want the traffic encrypted.

## Notes

- Machines that failed before are listed in `.vast_bad_machines.json` and skipped.
- TuxBlox needs Linux 6.7 or newer and NVIDIA Vulkan, so only Ubuntu 24.04+ hosts are used, and the setup checks both.
