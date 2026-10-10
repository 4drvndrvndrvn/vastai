#!/usr/bin/env bash
# Runs on the Vast.ai instance as root; roblox_studio_vast.py pipes it over SSH.
#
# On Vast's "Linux Desktop Container" image (KDE on Xvfb :20, desktop user "user") it:
#   1. checks the machine can run TuxBlox (Linux 6.7+, Vulkan),
#   2. installs TuxBlox for the desktop user from a GitHub release of $TUXBLOX_REPO
#      (a fork's ready-to-run bundle, not the official installer),
#   3. starts Roblox Studio on the desktop through TuxBlox, signed in automatically when
#      the local script uploaded a Roblox login (the fork's --magictoken),
#   4. serves Studio's built-in MCP server (stdio, via TuxBlox's studio-mcp helper)
#      over HTTP on 127.0.0.1:$BRIDGE_PORT with mcp-proxy, kept alive by supervisor.
# The instance's Caddy proxy publishes $BRIDGE_PORT on $PUBLIC_PORT with token auth
# (the PORTAL_CONFIG entry added by roblox_studio_vast.py).
#
# Usage: remote_setup.sh <phase>
#   all      check + install + launch + bridge
#   check    machine requirements, wait for the desktop
#   install  install TuxBlox
#   launch   start Roblox Studio (no-op if it is running)
#   signin   apply an uploaded Roblox login and restart Studio so it signs in
#   bridge   (re)install and restart the MCP bridge
#   status   show what is running
#   info     print KEY=VALUE lines for the local script
set -euo pipefail

PHASE="${1:-all}"
DESKTOP_USER="${DESKTOP_USER:-user}"
BRIDGE_PORT="${BRIDGE_PORT:-18765}"
PUBLIC_PORT="${PUBLIC_PORT:-8765}"
MCP_PROXY_VERSION="${MCP_PROXY_VERSION:-0.12.0}"
# mcp-proxy 0.12.0 asks for mcp>=1.17 with no upper bound, but mcp 2.x removed APIs it imports.
MCP_SDK_VERSION="${MCP_SDK_VERSION:-1.30.0}"
# TuxBlox comes from this GitHub repository's releases: its CI publishes a ready-to-run
# bundle (TuxBlox-<version>-<commit>-linux-x86_64.tar.zst) whose folder is the install.
TUXBLOX_REPO="${TUXBLOX_REPO:-4drvndrvndrvn/tuxblox}"
TUXBLOX_RELEASE="${TUXBLOX_RELEASE:-latest}"  # a release tag such as v3.1.0-fork.5, or "latest"
EXIT_UNSUITABLE=42  # tells the local script to try a different machine

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

id "$DESKTOP_USER" >/dev/null 2>&1 || die "user '$DESKTOP_USER' does not exist; is this the Linux Desktop image?"
USER_HOME="$(getent passwd "$DESKTOP_USER" | cut -d: -f6)"
# Commands run as the desktop user inherit this directory. It must be one they can
# open: libarchive (TuxBlox's unzipper) opens "." and fails with EACCES in /root.
cd "$USER_HOME"
TB_DIR="$USER_HOME/.tuxblox"
STATE_DIR="$USER_HOME/.local/share/studio-mcp"
DESKTOP_ENV_FILE="$STATE_DIR/desktop.env"
BRIDGE_VENV="$STATE_DIR/venv"
STUDIO_LOG="$STATE_DIR/studio-launch.log"
BRIDGE_LOG=/var/log/portal/studio-mcp-bridge.log
MCP_EXE_GLOB="$TB_DIR/runtime/pfx/drive_c/users/*/AppData/Local/Roblox/Versions/*/StudioMCP.exe"
RELEASE_MARKER="$TB_DIR/.installed-release"  # "<repo> <tag>" of the bundle unpacked into $TB_DIR
LOGIN_FILE=/root/studio-setup/roblox-login  # "USERNAME:PASSWORD" uploaded by roblox_studio_vast.py, root-only
SIGNIN_FILE="$TB_DIR/sign-in"               # where TuxBlox keeps the account it signs Studio in with

as_user() { runuser -u "$DESKTOP_USER" -- env HOME="$USER_HOME" USER="$DESKTOP_USER" LOGNAME="$DESKTOP_USER" "$@"; }

# Like as_user, with the KDE session's DISPLAY, D-Bus and runtime dir.
as_user_desktop() {
    as_user bash -c 'while IFS= read -r kv; do export "$kv"; done < "$0"; exec "$@"' "$DESKTOP_ENV_FILE" "$@"
}

# wait_until <seconds> <what> <command...>
wait_until() {
    local timeout=$1 what=$2
    shift 2
    local deadline=$((SECONDS + timeout))
    until "$@" >/dev/null 2>&1; do
        ((SECONDS < deadline)) || { warn "timed out after ${timeout}s waiting for $what"; return 1; }
        sleep 5
    done
}

kernel_ok() {
    local release major minor
    release=$(uname -r)
    major=${release%%.*}
    minor=${release#*.}
    minor=${minor%%[!0-9]*}
    ((major > 6 || (major == 6 && minor >= 7)))
}

desktop_up() { pgrep -u "$DESKTOP_USER" -x plasmashell >/dev/null; }
studio_running() { pgrep -u "$DESKTOP_USER" -f 'RobloxStudioBeta\.exe' >/dev/null; }
tuxblox_alive() { studio_running || pgrep -u "$DESKTOP_USER" -f "$TB_DIR" >/dev/null; }
find_tb() { find "$TB_DIR" -maxdepth 3 -type f -name "$1" -perm -u+x 2>/dev/null | head -n1 || true; }
studio_mcp_exe() { compgen -G "$MCP_EXE_GLOB" | head -n1 || true; }
versions_partial() { compgen -G "$TB_DIR/runtime/pfx/drive_c/users/*/AppData/Local/Roblox/Versions/*.partial" >/dev/null; }
tuxblox_window() { as_user_desktop wmctrl -l 2>/dev/null | grep -q ' TuxBlox$'; }

screenshot() {
    local size display
    display=$(sed -n 's/^DISPLAY=//p' "$DESKTOP_ENV_FILE")
    size=$(as_user_desktop xrandr 2>/dev/null | sed -n 's/.*current \([0-9]*\) x \([0-9]*\).*/\1x\2/p')
    as_user_desktop ffmpeg -loglevel error -y -f x11grab -video_size "${size:-1920x1080}" -i "${display:-:20}" \
        -frames:v 1 "$1" 2>/dev/null || true
}

portal_token() {
    local token=""
    if [[ -f /etc/Caddyfile ]]; then
        token=$(grep -oE 'Bearer [^"]+' /etc/Caddyfile | head -n1 | cut -d' ' -f2 || true)
    fi
    if [[ -z $token ]]; then
        token=$(tr '\0' '\n' </proc/1/environ | sed -n 's/^OPEN_BUTTON_TOKEN=//p' | head -n1 || true)
    fi
    printf '%s' "$token"
}

caddy_scheme() {
    if [[ -f /etc/Caddyfile ]] && grep -qE '^[[:space:]]*tls[[:space:]]' /etc/Caddyfile; then echo https; else echo http; fi
}

# mcp_ping <url> [curl args...]: succeeds when the URL answers an MCP initialize request.
mcp_ping() {
    local url=$1
    shift
    curl -ksSf -m 20 -o /dev/null "$url" "$@" \
        -H 'Content-Type: application/json' \
        -H 'Accept: application/json, text/event-stream' \
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"vast-setup-check","version":"1"}}}'
}

save_desktop_env() {
    local pid
    pid=$(pgrep -u "$DESKTOP_USER" -x plasmashell | head -n1)
    as_user mkdir -p "$STATE_DIR"
    # Read as the desktop user: root may not read another user's environ without CAP_SYS_PTRACE.
    as_user cat "/proc/$pid/environ" 2>/dev/null | tr '\0' '\n' |
        grep -E '^(DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|XAUTHORITY|PULSE_SERVER|XDG_SESSION_ID|XDG_SESSION_TYPE|XDG_CURRENT_DESKTOP|LANG|PATH|LD_LIBRARY_PATH)=' \
            >"$DESKTOP_ENV_FILE" || true
    grep -q '^DISPLAY=' "$DESKTOP_ENV_FILE" || echo "DISPLAY=:20" >>"$DESKTOP_ENV_FILE"
    chown "$DESKTOP_USER:" "$DESKTOP_ENV_FILE"
}

phase_check() {
    log "Checking the machine"
    echo "kernel: $(uname -r)"
    if ! kernel_ok; then
        printf 'ERROR: TuxBlox needs Linux 6.7 or newer, and a container runs on the host kernel (%s).\n' "$(uname -r)" >&2
        exit "$EXIT_UNSUITABLE"
    fi
    nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null || warn "nvidia-smi is not available"

    log "Waiting for the KDE desktop"
    if ! wait_until 600 "the desktop (plasmashell)" desktop_up; then
        supervisorctl status || true
        die "the desktop did not start"
    fi
    save_desktop_env

    if ! ldconfig -p | grep -q 'libvulkan\.so\.1' || ! command -v vulkaninfo >/dev/null; then
        log "Installing the Vulkan loader and vulkaninfo"
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libvulkan1 mesa-vulkan-drivers vulkan-tools >/dev/null
    fi

    # Studio renders through DXVK on Vulkan. On a software driver (llvmpipe) it would
    # draw on the CPU and crawl, so a machine without NVIDIA Vulkan is no good.
    local devices
    devices=$(as_user_desktop vulkaninfo --summary 2>/dev/null | grep -E 'deviceName|driverName' || true)
    echo "Vulkan devices:"
    echo "${devices:-  (none found)}" | sed 's/^ */  /'
    if [[ -z $devices ]]; then
        warn "vulkaninfo listed no devices; continuing, but Studio may not render"
    elif ! grep -qi nvidia <<<"$devices"; then
        printf 'ERROR: Vulkan only sees a software renderer here, so Studio would render on the CPU.\n' >&2
        exit "$EXIT_UNSUITABLE"
    fi
}

# ensure_tool <command> <apt package>
ensure_tool() {
    command -v "$1" >/dev/null 2>&1 && return
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$2" >/dev/null
}

# Prints "tag|asset|url|sha256|size" for the bundle in release $TUXBLOX_RELEASE of $TUXBLOX_REPO
# ('|' rather than a tab, so an empty checksum doesn't collapse into its neighbour).
release_asset() {
    local api="https://api.github.com/repos/$TUXBLOX_REPO/releases/latest"
    [[ $TUXBLOX_RELEASE == latest ]] || api="https://api.github.com/repos/$TUXBLOX_REPO/releases/tags/$TUXBLOX_RELEASE"
    curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "$api" | jq -r '
        .tag_name as $tag
        | [.assets[] | select(.name | test("^TuxBlox-.*-linux-x86_64\\.tar\\.zst$"))][0]
        | select(. != null)
        | [$tag, .name, .browser_download_url, ((.digest // "") | sub("^sha256:"; "")), (.size | tostring)]
        | join("|")'
}

phase_install() {
    ensure_tool jq jq
    ensure_tool zstd zstd
    log "Looking up TuxBlox in github.com/$TUXBLOX_REPO ($TUXBLOX_RELEASE release)"
    local fields tag asset url sha size
    fields=$(release_asset) || die "could not read the $TUXBLOX_RELEASE release of $TUXBLOX_REPO from GitHub"
    [[ -n $fields ]] || die "the $TUXBLOX_RELEASE release of $TUXBLOX_REPO has no TuxBlox-*-linux-x86_64.tar.zst asset"
    IFS='|' read -r tag asset url sha size <<<"$fields"

    if [[ -x "$TB_DIR/TuxBloxLauncher" && "$(cat "$RELEASE_MARKER" 2>/dev/null)" == "$TUXBLOX_REPO $tag" ]]; then
        log "TuxBlox $tag from $TUXBLOX_REPO is already installed"
        return
    fi

    log "Downloading $asset ($((size / 1048576)) MB)"
    local file="/tmp/$asset"
    curl -fsSL --retry 3 -o "$file" "$url" || die "could not download $url"
    if [[ -n $sha ]]; then
        echo "$sha  $file" | sha256sum -c --quiet - || die "$asset does not match the SHA-256 GitHub published for it"
        echo "SHA-256 verified"
    else
        warn "the release publishes no checksum for $asset, so it can't be verified"
    fi

    if [[ -e $TB_DIR ]]; then
        # Replacing an earlier install, like the official installer's upgrade mode: runtime/
        # (the prefix with Roblox and its sign-in) and settings.json stay. Nothing may be
        # running from the old files while they are swapped.
        log "Replacing the TuxBlox in $TB_DIR (Roblox, its prefix and settings are kept)"
        pkill -u "$DESKTOP_USER" -f "$TB_DIR" 2>/dev/null || true
        sleep 2
    fi
    log "Unpacking into $TB_DIR"
    as_user mkdir -p "$TB_DIR/runtime"  # runtime/ holds the prefix; the official installer creates it too
    as_user tar --zstd -xf "$file" -C "$TB_DIR" --strip-components=1 --unlink-first
    rm -f "$file"
    [[ -x "$TB_DIR/TuxBloxLauncher" ]] || die "the bundle has no TuxBloxLauncher"
    printf '%s %s\n' "$TUXBLOX_REPO" "$tag" | as_user tee "$RELEASE_MARKER" >/dev/null
    local build
    build=$(as_user timeout 30 "$TB_DIR/TuxBloxLauncher" --version 2>/dev/null | head -n1 || true)
    echo "Installed TuxBlox $tag (build ${build:-unknown}) from github.com/$TUXBLOX_REPO"
}

# Hands a Roblox login uploaded by the local script to TuxBlox's --magictoken, which saves it
# to $SIGNIN_FILE (owner-only), turns on automatic sign-in, and from then on fills in and
# submits Studio's login page itself. Returns 1 when no login was uploaded.
apply_signin() {
    [[ -s $LOGIN_FILE ]] || return 1
    [[ -x "$TB_DIR/TuxBloxLauncher" ]] || die "TuxBlox is not installed (run the install phase)"
    local token
    token=$(<"$LOGIN_FILE")
    rm -f "$LOGIN_FILE"
    log "Setting up automatic Studio sign-in as ${token%%:*}"
    # With --version the launcher saves the account and exits without starting anything.
    if ! as_user timeout 60 "$TB_DIR/TuxBloxLauncher" --magictoken "$token" --version >/dev/null; then
        die "TuxBlox did not accept the Roblox login (does this build support --magictoken?)"
    fi
    [[ -s $SIGNIN_FILE ]] || die "TuxBlox did not save the Roblox login to $SIGNIN_FILE"
    echo "Studio will sign in by itself as ${token%%:*}"
}

# The username TuxBlox signs Studio in with, or nothing. The file percent-encodes it, but a
# Roblox username is only letters, digits and "_", which that encoding leaves alone.
signin_user() {
    [[ -r $SIGNIN_FILE ]] || return 0
    sed -n 's/^username=//p' "$SIGNIN_FILE" | head -n1
}

phase_launch() {
    [[ -f $DESKTOP_ENV_FILE ]] || save_desktop_env
    apply_signin || true
    if studio_running; then
        log "Roblox Studio is already running"
    else
        local launcher
        launcher=$(find_tb TuxBloxLauncher)
        [[ -n $launcher ]] || die "TuxBlox is not installed (run the install phase)"
        # A launcher or updater left over from an earlier attempt (e.g. showing an error) would block this one.
        pkill -u "$DESKTOP_USER" -f 'TuxBloxBootstrapper|TuxBloxLauncher' 2>/dev/null || true
        log "Starting Roblox Studio on the desktop (the first start downloads Studio)"
        as_user touch "$STUDIO_LOG"
        as_user_desktop env TUXBLOX_ROOT="$TB_DIR" setsid -f "$launcher" --launch-studio >>"$STUDIO_LOG" 2>&1 </dev/null
    fi

    log "Waiting for Roblox Studio to install and open"
    local deadline=$((SECONDS + 1800)) idle=0 stuck=0 next_note=$((SECONDS + 60))
    until [[ -n "$(studio_mcp_exe)" ]] && studio_running; do
        if tuxblox_alive; then idle=0; else idle=$((idle + 5)); fi
        if ((idle >= 60)); then
            tail -n 40 "$STUDIO_LOG" >&2 || true
            die "TuxBlox exited before Roblox Studio started (launcher log above)"
        fi
        # TuxBlox reports update failures in a dialog: its window stays open with no download
        # in progress and no Studio. Its text is not readable from here, so save a screenshot.
        if tuxblox_window && ! versions_partial && ! studio_running; then stuck=$((stuck + 5)); else stuck=0; fi
        if ((stuck >= 60)); then
            screenshot "$STATE_DIR/tuxblox-error.png"
            die "TuxBlox is showing an error dialog on the desktop (screenshot: $STATE_DIR/tuxblox-error.png)"
        fi
        if ((SECONDS >= deadline)); then
            tail -n 40 "$STUDIO_LOG" >&2 || true
            die "timed out waiting for Roblox Studio"
        fi
        if ((SECONDS >= next_note)); then
            echo "  still waiting... $(tail -n1 "$STUDIO_LOG" 2>/dev/null | cut -c1-150)"
            next_note=$((SECONDS + 60))
        fi
        sleep 5
    done
    echo "Roblox Studio is running; StudioMCP: $(studio_mcp_exe)"
}

phase_bridge() {
    [[ -f $DESKTOP_ENV_FILE ]] || save_desktop_env
    local studio_mcp
    studio_mcp=$(find_tb studio-mcp)
    [[ -n $studio_mcp ]] || die "TuxBlox's studio-mcp helper is missing under $TB_DIR"

    if ! as_user "$BRIDGE_VENV/bin/python" -c 'import mcp_proxy.__main__' >/dev/null 2>&1; then
        log "Installing mcp-proxy $MCP_PROXY_VERSION with mcp $MCP_SDK_VERSION (stdio -> HTTP bridge)"
        local uv
        uv=$(command -v uv || true)
        if [[ -n $uv ]]; then
            [[ -x "$BRIDGE_VENV/bin/python" ]] || as_user "$uv" venv --quiet --python '>=3.10' "$BRIDGE_VENV"
            as_user "$uv" pip install --quiet --python "$BRIDGE_VENV/bin/python" \
                "mcp-proxy==$MCP_PROXY_VERSION" "mcp==$MCP_SDK_VERSION"
        else
            [[ -x "$BRIDGE_VENV/bin/python" ]] || as_user python3 -m venv "$BRIDGE_VENV"
            as_user "$BRIDGE_VENV/bin/pip" install --quiet "mcp-proxy==$MCP_PROXY_VERSION" "mcp==$MCP_SDK_VERSION"
        fi
        as_user "$BRIDGE_VENV/bin/python" -c 'import mcp_proxy.__main__' || die "mcp-proxy does not import (see above)"
    fi

    log "Configuring the MCP bridge service"
    cat >/usr/local/bin/studio-mcp-bridge <<EOF
#!/bin/bash
# Serves Roblox Studio's MCP server (stdio, run through TuxBlox) over HTTP on
# 127.0.0.1:$BRIDGE_PORT: Streamable HTTP at /mcp, SSE at /sse.
# Run by supervisor as $DESKTOP_USER; Caddy publishes it on port $PUBLIC_PORT with token auth.
set -euo pipefail
while IFS= read -r kv; do export "\$kv"; done <"$DESKTOP_ENV_FILE"
export TUXBLOX_ROOT="$TB_DIR"
cd "\$HOME"
# StudioMCP.exe ships with Studio, so wait until TuxBlox has installed Studio.
until compgen -G "$MCP_EXE_GLOB" >/dev/null; do sleep 10; done
exec "$BRIDGE_VENV/bin/mcp-proxy" --host 127.0.0.1 --port $BRIDGE_PORT --pass-environment -- "$studio_mcp"
EOF
    chmod 755 /usr/local/bin/studio-mcp-bridge

    mkdir -p "$(dirname "$BRIDGE_LOG")"
    cat >/etc/supervisor/conf.d/studio-mcp-bridge.conf <<EOF
[program:studio-mcp-bridge]
command=/usr/local/bin/studio-mcp-bridge
user=$DESKTOP_USER
directory=$USER_HOME
environment=HOME="$USER_HOME",USER="$DESKTOP_USER",LOGNAME="$DESKTOP_USER"
autostart=true
autorestart=true
startsecs=3
startretries=1000000
stopasgroup=true
killasgroup=true
redirect_stderr=true
stdout_logfile=$BRIDGE_LOG
stdout_logfile_maxbytes=10MB
EOF
    supervisorctl reread >/dev/null
    supervisorctl update >/dev/null
    # Can report a spawn error while it backs off; the check below decides.
    supervisorctl restart studio-mcp-bridge >/dev/null || true

    log "Waiting for the MCP bridge on 127.0.0.1:$BRIDGE_PORT"
    if ! wait_until 180 "the MCP bridge" mcp_ping "http://127.0.0.1:$BRIDGE_PORT/mcp"; then
        tail -n 30 "$BRIDGE_LOG" >&2 || true
        die "the MCP bridge did not come up (log above)"
    fi
    echo "MCP bridge is answering on 127.0.0.1:$BRIDGE_PORT"

    if [[ -f /etc/Caddyfile ]] && grep -q "$BRIDGE_PORT" /etc/Caddyfile; then
        echo "Caddy publishes it on port $PUBLIC_PORT (token auth)"
    else
        warn "Caddy has no route to port $BRIDGE_PORT, so the MCP server is not published; use 'roblox_studio_vast.py tunnel' instead"
    fi
}

phase_signin() {
    apply_signin || die "no Roblox login was uploaded; set ROBLOX_USERNAME and ROBLOX_PASSWORD in .env"
    if studio_running; then
        # The login page is filled in when it loads, so a Studio that is already open restarts.
        log "Restarting Roblox Studio so it signs in"
        pkill -u "$DESKTOP_USER" -f 'RobloxStudioBeta\.exe' || true
        wait_until 90 "Roblox Studio to close" bash -c "! pgrep -u $DESKTOP_USER -f 'RobloxStudioBeta\\.exe'" || true
    fi
    phase_launch
}

phase_status() {
    local account
    account=$(signin_user)
    echo "kernel:        $(uname -r)"
    echo "desktop:       $(desktop_up && echo running || echo 'not running')"
    echo "TuxBlox:       $([[ -n "$(find_tb TuxBloxLauncher)" ]] && (cat "$RELEASE_MARKER" 2>/dev/null || echo 'installed (unknown source)') || echo 'not installed')"
    if [[ -n $account ]]; then echo "auto sign-in:  on, as $account"; else echo "auto sign-in:  off"; fi
    echo "Roblox Studio: $(studio_running && echo running || echo 'not running')"
    echo "StudioMCP.exe: $(studio_mcp_exe)"
    echo "bridge:        $(supervisorctl status studio-mcp-bridge 2>/dev/null || echo 'not configured')"
    echo "bridge check:  $(mcp_ping "http://127.0.0.1:$BRIDGE_PORT/mcp" && echo ok || echo failing)"
    if [[ -f $BRIDGE_LOG ]]; then
        echo "--- last bridge log lines ---"
        tail -n 8 "$BRIDGE_LOG"
    fi
}

phase_info() {
    echo "TOKEN=$(portal_token)"
    echo "SCHEME=$(caddy_scheme)"
    echo "KERNEL=$(uname -r)"
    echo "STUDIO_RUNNING=$(studio_running && echo yes || echo no)"
    echo "SIGNIN_USER=$(signin_user)"
}

case "$PHASE" in
    all)
        phase_check
        phase_install
        phase_launch
        phase_bridge
        ;;
    check) phase_check ;;
    install) phase_install ;;
    launch) phase_launch ;;
    signin) phase_signin ;;
    bridge) phase_bridge ;;
    status) phase_status ;;
    info) phase_info ;;
    *) die "unknown phase '$PHASE' (all, check, install, launch, signin, bridge, status, info)" ;;
esac
