#!/usr/bin/env python3
"""Rent a Vast.ai Linux desktop, run Roblox Studio on it through TuxBlox, and
publish Studio's built-in MCP server so MCP clients can drive Studio remotely.

  python roblox_studio_vast.py offers          list machines that fit (free, rents nothing)
  python roblox_studio_vast.py up              rent the cheapest fit and set everything up
  python roblox_studio_vast.py status          instance state, URLs and an MCP check
  python roblox_studio_vast.py wait-mcp        wait until Studio answers over MCP
  python roblox_studio_vast.py setup [PHASE]   re-run the on-instance setup
                                               (all, check, install, launch, bridge, status)
  python roblox_studio_vast.py tunnel          forward the MCP server to localhost over SSH
  python roblox_studio_vast.py ssh             open a shell on the instance
  python roblox_studio_vast.py down            destroy the instance (stops billing)

The Vast API key comes from VAST_API_KEY or a .env file next to this script.
SSH uses your normal ssh setup (~/.ssh keys, agent, config); the key from
--ssh-key, or ~/.ssh/id_ed25519.pub / id_rsa.pub, is also attached to the instance.

Only the Python standard library and the `ssh` command are needed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / ".vast-roblox-state.json"
KNOWN_HOSTS = HERE / ".vast_known_hosts"
BAD_MACHINES_FILE = HERE / ".vast_bad_machines.json"  # machines that failed before; skipped
CLIENT_CONFIG_FILE = HERE / "mcp-client-config.json"
REMOTE_SCRIPT = HERE / "remote_setup.sh"

VAST_API = "https://console.vast.ai/api/v0"
TEMPLATE_HASH = "07fd4c405aef10347e8cac7b04453021"  # Vast's "Linux Desktop Container" (KDE, Selkies, Caddy portal)
LABEL = "roblox-studio-mcp"

PUBLIC_PORT = 8765    # Caddy listens here with token auth; Vast maps it to a random external port
BRIDGE_PORT = 18765   # mcp-proxy on 127.0.0.1 inside the instance
DESKTOP_PORT = 6100   # Selkies desktop in the browser
PORTAL_PORT = 1111    # Vast Instance Portal
MCP_PORTAL_ENTRY = f"localhost:{PUBLIC_PORT}:{BRIDGE_PORT}:/:Roblox Studio MCP"

# TuxBlox refuses kernels older than 6.7 and a container runs on the host kernel.
# Ubuntu 24.04+ hosts ship 6.8 or newer; remote_setup.sh checks uname -r as well.
HOST_OS_VERSIONS = ["24.04", "24.10", "25.04", "25.10", "26.04", "26.10"]
EXIT_UNSUITABLE = 42  # remote_setup.sh exit code for "wrong machine, try another"


class VastError(RuntimeError):
    pass


# ---- config ------------------------------------------------------------------


def load_dotenv(path: Path) -> set[str]:
    """Loads KEY=VALUE lines into the environment, without overriding variables that are
    already set (an empty one counts as unset). Returns the keys it set."""
    loaded: set[str] = set()
    if not path.exists():
        return loaded
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not os.environ.get(key):
            os.environ[key] = value.strip().strip("'\"")
            loaded.add(key)
    return loaded


def roblox_login() -> str | None:
    """'USERNAME:PASSWORD' for Studio's automatic sign-in, from ROBLOX_USERNAME and
    ROBLOX_PASSWORD (in .env); None when neither is set."""
    username = os.environ.get("ROBLOX_USERNAME", "").strip()
    password = os.environ.get("ROBLOX_PASSWORD", "")
    if not username and not password:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_]{3,20}", username):
        raise VastError("ROBLOX_USERNAME must be a Roblox username (3-20 letters, digits or _)")
    if not password or "\n" in password or "\r" in password:
        raise VastError("ROBLOX_PASSWORD is empty or spans more than one line")
    return f"{username}:{password}"


def login_username() -> str | None:
    """The account Studio signs in with automatically, if one is configured and valid."""
    try:
        login = roblox_login()
    except VastError:
        return None
    return login.split(":", 1)[0] if login else None


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def confirm(question: str, default: bool = False) -> bool:
    if not sys.stdin.isatty():
        return default
    suffix = " [Y/n] " if default else " [y/N] "
    answer = input(question + suffix).strip().lower()
    return default if not answer else answer in ("y", "yes")


# ---- Vast REST API -------------------------------------------------------------


class Vast:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def request(self, method: str, path: str, *, body=None, query: dict | None = None, auth: bool = True):
        url = VAST_API + path
        if query:
            url += "?" + urllib.parse.urlencode(
                {k: v if isinstance(v, str) else json.dumps(v) for k, v in query.items()}
            )
        headers = {"Accept": "application/json", "User-Agent": "roblox-studio-vast"}
        if auth:
            if not self.api_key:
                raise VastError("VAST_API_KEY is not set (put it in .env next to this script)")
            headers["Authorization"] = f"Bearer {self.api_key}"
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                detail = json.loads(raw)
                detail = detail.get("msg") or detail.get("error") or detail
            except ValueError:
                detail = raw[:300].decode(errors="replace")
            raise VastError(f"{method} {path} failed with HTTP {err.code}: {detail}") from None
        result = json.loads(raw) if raw else {}
        if isinstance(result, dict) and result.get("success") is False:
            raise VastError(f"{method} {path} failed: {result.get('msg') or result.get('error') or result}")
        return result

    def account(self) -> dict:
        return self.request("GET", "/users/current/")

    def template(self, hash_id: str) -> dict:
        res = self.request(
            "GET", "/template/", auth=False,
            query={"select_cols": ["*"], "select_filters": {"hash_id": {"eq": hash_id}}},
        )
        templates = res.get("templates") or []
        if not templates:
            raise VastError(f"Vast template {hash_id} not found")
        return templates[0]

    def offers(self, query: dict) -> list[dict]:
        return self.request("POST", "/bundles/", body=query, auth=False).get("offers") or []

    def create(self, offer_id: int, payload: dict) -> dict:
        return self.request("PUT", f"/asks/{offer_id}/", body=payload)

    def instance(self, instance_id: int) -> dict | None:
        return self.request("GET", f"/instances/{instance_id}/", query={"owner": "me"}).get("instances")

    def destroy(self, instance_id: int) -> None:
        self.request("DELETE", f"/instances/{instance_id}/", body={})

    def attach_ssh_key(self, instance_id: int, public_key: str) -> None:
        self.request("POST", f"/instances/{instance_id}/ssh/", body={"ssh_key": public_key})


def parse_docker_env(env_string: str) -> dict:
    """Turns a template's '-p 1111:1111 -e KEY="v w"' string into the API's env dict."""
    result: dict = {}
    tokens = shlex.split(env_string or "")
    i = 0
    while i < len(tokens) - 1:
        flag, value = tokens[i], tokens[i + 1]
        if flag == "-p":
            result[f"-p {value}"] = "1"
        elif flag == "-e" and "=" in value:
            key, val = value.split("=", 1)
            result[key] = val
        i += 2 if flag in ("-p", "-e", "-h", "-v", "-n") else 1
    return result


def cpu_speed_score(name: str | None) -> int | None:
    """Rough single-thread speed of a CPU model on a PassMark-like scale, from its name.

    Roblox Studio is mostly single-threaded, so this, rather than core count or the
    clock Vast reports, decides whether it runs smoothly. Reference points: old Xeon
    E5 v4 ~2000, EPYC Zen 3 ~2600, Core i7-10700K ~3050, Ryzen 5000 ~3350,
    Core 12th gen ~3900, Ryzen 7000 ~4100. None means the model is not recognised.
    """
    if not name:
        return None
    n = " ".join(re.sub(r"[^a-z0-9 \-]", " ", name.lower()).split())

    if m := re.search(r"core ultra [3579] (\d)\d\d", n):
        return 3800 if m.group(1) == "1" else 4800
    if m := re.search(r"\bi([3579]) ?-?(\d{4,5})([a-z]*)", n):
        tier, digits, suffix = m.group(1), m.group(2), m.group(3)
        gen = int(digits[:2]) if len(digits) == 5 else int(digits[0])
        score = {2: 1800, 3: 1950, 4: 2250, 5: 2250, 6: 2500, 7: 2700, 8: 2800, 9: 2950,
                 10: 3050, 11: 3400, 12: 3900, 13: 4300, 14: 4500}.get(gen)
        if score is None:
            return None
        score -= {"3": 400, "5": 200}.get(tier, 0)
        if "k" not in suffix and "hx" not in suffix:
            score -= 200
        if "u" in suffix:
            score -= 300
        return score
    if "ryzen ai" in n:
        return 4000
    if m := re.search(r"threadripper (?:pro )?(\d)\d{3}", n):
        return {1: 2000, 2: 2200, 3: 2650, 5: 3300, 7: 4000, 9: 4400}.get(int(m.group(1)))
    if m := re.search(r"ryzen [3579] (?:pro )?(\d)\d{3}([a-z]*)", n):
        series, suffix = int(m.group(1)), m.group(2)
        score = {1: 2000, 2: 2250, 3: 2650, 4: 2700, 5: 3350, 6: 3400, 7: 4100, 8: 3900, 9: 4600}.get(series)
        if score and "g" in suffix and series < 8:
            score -= 150
        if score and "u" in suffix:
            score -= 300
        return score
    if m := re.search(r"epyc (\d)([0-9a-z])([0-9a-z])(\d)", n):
        family, gen = m.group(1), int(m.group(4))
        base = {
            "7": {1: 1700, 2: 2100, 3: 2600},
            "9": {4: 2800, 5: 3100},
            "4": {4: 3900, 5: 4400},
            "8": {4: 2400},
        }.get(family, {}).get(gen)
        if base and "f" in (m.group(2), m.group(3)):  # frequency-optimised parts, e.g. 74F3
            base += 400
        return base
    if "xeon" in n:
        if m := re.search(r"\be3-\d{4}[a-z]* ?v(\d)", n):
            return {1: 1800, 2: 1950, 3: 2200, 4: 2200, 5: 2450, 6: 2600}.get(int(m.group(1)))
        if m := re.search(r"\be[57]-\d{4}[a-z]* ?v(\d)", n):
            return {1: 1500, 2: 1650, 3: 1900, 4: 2050}.get(int(m.group(1)))
        if re.search(r"\be[357]-\d{4}", n):
            return 1500
        if m := re.search(r"(bronze|silver|gold|platinum) \d(\d)\d\d", n):
            base = {1: 1850, 2: 2100, 3: 2400, 4: 2800, 5: 2900}.get(int(m.group(2)), 3000)
            return base - {"bronze": 600, "silver": 250}.get(m.group(1), 0)
        if re.search(r"\bw[3579]-\d{4}", n):
            return 3500
        if m := re.search(r"\bw-(\d)\d{3}", n):
            return 2900 if m.group(1) == "1" else 2700
        if m := re.search(r"\be-2(\d)\d\d", n):
            return {1: 2600, 2: 2800, 3: 3300, 4: 3600}.get(int(m.group(1)), 2600)
        if re.search(r"\b[xelw]\d{4}\b", n):
            return 1200
        return None
    if "pentium" in n or "celeron" in n:
        return 1500
    return None


# Datacenter GPUs with no (or crippled) graphics pipelines; Studio needs real Vulkan graphics.
NO_GRAPHICS_GPU = re.compile(r"\b(A100|A800|H100|H200|H800|GH200|B100|B200|GB200)\b", re.I)


def fits_studio(offer: dict, args) -> bool:
    if NO_GRAPHICS_GPU.search(offer.get("gpu_name") or ""):
        return False
    score = cpu_speed_score(offer.get("cpu_name"))
    if score is None:
        return args.allow_unknown_cpu
    return score >= args.min_cpu_score


def find_offers(vast: "Vast", args, template: dict) -> list[dict]:
    """Cheapest first, keeping only machines fast enough for Roblox Studio that have not failed before."""
    bad = load_bad_machines()
    return [o for o in vast.offers(offer_query(args, template))
            if fits_studio(o, args) and o.get("machine_id") not in bad]


def offer_query(args, template: dict) -> dict:
    query = json.loads(template.get("extra_filters") or "{}")
    query.update({
        "verified": {"eq": True},
        "rentable": {"eq": True},
        "rented": {"eq": False},
        "type": "on-demand",
        "num_gpus": {"eq": 1},
        "cpu_arch": {"in": ["amd64"]},  # TuxBlox is x86-64 only
        "os_version": {"in": HOST_OS_VERSIONS},
        "direct_port_count": {"gte": 16},
        "reliability2": {"gte": args.min_reliability},
        "inet_down": {"gte": args.min_download},
        "cpu_ram": {"gte": args.min_ram * 1000},
        "cpu_cores_effective": {"gte": args.min_cpus},
        "disk_space": {"gte": args.disk},
        "dph_total": {"lte": args.max_price},
        "allocated_storage": args.disk,
        "order": [["dph_total", "asc"]],
        "limit": 400,  # filtered further by CPU speed in find_offers
    })
    if args.gpu:
        query["gpu_name"] = {"in": [g.replace("_", " ") for g in args.gpu]}
    return query


def format_offer(o: dict) -> str:
    cpu = " ".join((o.get("cpu_name") or "unknown CPU").replace("™", "").replace("®", "").split())
    score = cpu_speed_score(o.get("cpu_name"))
    return (
        f"offer {o['id']}: {o.get('gpu_name')} | ${o.get('dph_total', 0):.3f}/hr | "
        f"{cpu} (speed ~{score or '?'}) | "
        f"{o.get('cpu_cores_effective', 0):.0f} vCPU, {o.get('cpu_ram', 0) / 1000:.0f} GB RAM | "
        f"net {o.get('inet_down', 0):.0f} Mbps down | host Ubuntu {o.get('os_version')} | "
        f"reliability {o.get('reliability2', 0) * 100:.1f}% | {o.get('geolocation') or '?'}"
    )


def build_create_payload(template: dict, disk: int) -> dict:
    env = parse_docker_env(template.get("env") or "")
    env[f"-p {PUBLIC_PORT}:{PUBLIC_PORT}"] = "1"
    portal = env.get("PORTAL_CONFIG", "")
    env["PORTAL_CONFIG"] = f"{portal}|{MCP_PORTAL_ENTRY}" if portal else MCP_PORTAL_ENTRY
    # The template supplies image, launch mode and onstart; the full env is sent so the
    # result is the same whether Vast merges it with the template's env or replaces it.
    return {
        "client_id": "me",
        "template_hash_id": TEMPLATE_HASH,
        "image": None,
        "env": env,
        "disk": disk,
        "label": LABEL,
        "price": None,
        "extra": None,
        "onstart": None,
        "image_login": None,
        "python_utf8": False,
        "lang_utf8": False,
        "use_jupyter_lab": False,
        "jupyter_dir": None,
        "force": False,
        "cancel_unavail": True,
        "user": None,
    }


# ---- instance helpers --------------------------------------------------------------


def instance_status(inst: dict) -> str:
    return inst.get("actual_status") or inst.get("cur_state") or "scheduling"


def host_port(inst: dict, port: int) -> str | None:
    try:
        return str(inst["ports"][f"{port}/tcp"][0]["HostPort"])
    except (KeyError, IndexError, TypeError):
        return None


def ssh_endpoints(inst: dict) -> list[tuple[str, int]]:
    """Direct (public IP) first, then Vast's SSH proxy."""
    out = []
    direct = host_port(inst, 22)
    if direct and inst.get("public_ipaddr"):
        out.append((inst["public_ipaddr"].strip(), int(direct)))
    if inst.get("ssh_host") and inst.get("ssh_port"):
        # Jupyter-mode images run their own sshd one port above the proxy port.
        bump = 1 if "jupyter" in (inst.get("image_runtype") or "") else 0
        out.append((str(inst["ssh_host"]).strip(), int(inst["ssh_port"]) + bump))
    return out


def port_open(host: str, port: int, timeout: float = 5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ssh_endpoint(inst: dict) -> tuple[str, int] | None:
    """The first SSH endpoint that accepts TCP connections (direct preferred)."""
    endpoints = ssh_endpoints(inst)
    for host, port in endpoints:
        if port_open(host, port):
            return host, port
    return endpoints[0] if endpoints else None


def find_public_key(path: str | None) -> str | None:
    candidates = [Path(path).expanduser()] if path else [
        Path.home() / ".ssh" / "id_ed25519.pub",
        Path.home() / ".ssh" / "id_rsa.pub",
    ]
    for candidate in candidates:
        if candidate.suffix != ".pub":
            candidate = candidate.with_name(candidate.name + ".pub")
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    return None


def known_hosts_path() -> str:
    # Passed unquoted: some ssh builds (e.g. Git for Windows) reject quotes in -o values,
    # so fall back to a path without spaces when this folder has them.
    path = KNOWN_HOSTS if " " not in str(KNOWN_HOSTS) else Path.home() / ".ssh" / "vast_known_hosts"
    return path.as_posix()


def ssh_command(inst: dict, args, *extra: str, endpoint: tuple[str, int] | None = None) -> list[str]:
    ssh = shutil.which("ssh")
    if not ssh:
        raise VastError("the 'ssh' command was not found; install OpenSSH")
    endpoint = endpoint or ssh_endpoint(inst)
    if not endpoint:
        raise VastError("the instance has no SSH address yet")
    host, port = endpoint
    cmd = [
        ssh, "-p", str(port),
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"UserKnownHostsFile={known_hosts_path()}",
        "-o", "ServerAliveInterval=30",
        "-o", "ConnectTimeout=20",
    ]
    if args.ssh_key:
        cmd += ["-i", str(Path(args.ssh_key).expanduser())]
    return cmd + list(extra) + [f"root@{host}"]


# Longest each on-instance phase may take before the machine counts as not working.
PHASE_TIMEOUTS = {"all": 100 * 60, "check": 20 * 60, "install": 20 * 60, "launch": 45 * 60, "signin": 45 * 60,
                  "bridge": 10 * 60, "status": 2 * 60, "info": 2 * 60}


REMOTE_DIR = "/root/studio-setup"
SHORT_PHASES = ("status", "info")
# Passed through to remote_setup.sh when set (e.g. in .env): which GitHub repository's
# TuxBlox release to install, and which release (a tag, or "latest").
REMOTE_SETTINGS = ("TUXBLOX_REPO", "TUXBLOX_RELEASE")


def remote_script() -> bytes:
    return REMOTE_SCRIPT.read_bytes().replace(b"\r\n", b"\n")


def remote_env() -> str:
    """Environment assignments for remote_setup.sh, safe to place inside single quotes."""
    pairs = {"PUBLIC_PORT": str(PUBLIC_PORT), "BRIDGE_PORT": str(BRIDGE_PORT)}
    for key in REMOTE_SETTINGS:
        value = os.environ.get(key, "").strip()
        if not value:
            continue
        if not re.fullmatch(r"[A-Za-z0-9._/-]+", value):
            raise VastError(f"{key} may only contain letters, digits and . _ / -")
        pairs[key] = value
    return " ".join(f"{key}={value}" for key, value in pairs.items())


def run_remote(inst: dict, args, phase: str, capture: bool = False) -> subprocess.CompletedProcess:
    if phase not in SHORT_PHASES and not capture:
        return run_remote_detached(inst, args, phase)
    remote = f"{remote_env()} bash -s -- {shlex.quote(phase)}"
    timeout = PHASE_TIMEOUTS.get(phase)
    try:
        return subprocess.run(
            ssh_command(inst, args, "-T") + [remote],
            input=remote_script(),
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise VastError(f"setup phase '{phase}' did not finish within {timeout // 60} minutes") from None


def ssh_quick(inst: dict, args, command: str, input: bytes | None = None) -> subprocess.CompletedProcess | None:
    """One short SSH command; None when the connection fails or hangs."""
    try:
        res = subprocess.run(
            ssh_command(inst, args, "-T", "-o", "BatchMode=yes") + [command],
            input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90,
        )
    except subprocess.TimeoutExpired:
        return None
    return None if res.returncode == 255 else res  # 255: ssh itself failed


def upload_login(inst: dict, args) -> bool:
    """Sends the Roblox login for automatic sign-in to the instance through SSH's standard
    input (never a command line), into a root-only file that remote_setup.sh hands to
    TuxBlox and then deletes. False when no login is configured."""
    login = roblox_login()
    if not login:
        return False
    command = f"umask 077 && mkdir -p {REMOTE_DIR} && cat > {REMOTE_DIR}/roblox-login"
    for _ in range(3):
        res = ssh_quick(inst, args, command, input=login.encode())
        if res and res.returncode == 0:
            print(f"Uploaded the Roblox login for {login.split(':', 1)[0]}; Studio will sign in by itself.")
            return True
        time.sleep(5)
    raise VastError("could not upload the Roblox login over SSH")


def run_remote_detached(inst: dict, args, phase: str) -> subprocess.CompletedProcess:
    """Runs a phase in the background on the instance and follows its log over short SSH
    calls, so a dropped connection (some hosts reset long ones) does not kill the setup."""
    log, rc = f"{REMOTE_DIR}/{phase}.log", f"{REMOTE_DIR}/{phase}.rc"
    start = (
        f"mkdir -p {REMOTE_DIR} && cat > {REMOTE_DIR}/remote_setup.sh && rm -f {rc} && : > {log} && "
        f"setsid -f bash -c '{remote_env()} "
        f"bash {REMOTE_DIR}/remote_setup.sh {phase} > {log} 2>&1 < /dev/null; echo $? > {rc}'"
    )
    for _ in range(6):
        res = ssh_quick(inst, args, start, input=remote_script())
        if res and res.returncode == 0:
            break
        time.sleep(10)
    else:
        raise VastError(f"could not start setup phase '{phase}' over SSH")

    timeout = PHASE_TIMEOUTS.get(phase, 30 * 60)
    deadline = time.time() + timeout
    offset, lost_since = 0, None
    # rc is read before the log, so once it exists the log read after it is complete.
    poll = f"rc=$(cat {rc} 2>/dev/null); echo __BEGIN__; tail -c +{{offset}} {log}; echo; echo __RC__$rc"
    while True:
        time.sleep(5)
        res = ssh_quick(inst, args, poll.format(offset=offset + 1))
        if res is None:
            lost_since = lost_since or time.time()
            if time.time() - lost_since > 180:
                raise VastError(f"lost the SSH connection during setup phase '{phase}' for 3 minutes")
            continue
        lost_since = None
        out = res.stdout
        begin, end = out.find(b"__BEGIN__\n"), out.rfind(b"\n__RC__")
        if begin < 0 or end < 0:
            continue
        chunk = out[begin + len(b"__BEGIN__\n"):end]
        if chunk:
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
            offset += len(chunk)
        code = out[end + len(b"\n__RC__"):].strip()
        if code:
            return subprocess.CompletedProcess(args=phase, returncode=int(code))
        if time.time() > deadline:
            raise VastError(f"setup phase '{phase}' did not finish within {timeout // 60} minutes")


def remote_info(inst: dict, args) -> dict:
    res = run_remote(inst, args, "info", capture=True)
    info = {}
    for line in res.stdout.decode(errors="replace").splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            info[m.group(1)] = m.group(2)
    return info


def wait_until_usable(vast: Vast, instance_id: int, args) -> dict:
    """Waits for the instance to run with reachable public ports and working SSH.

    Raises VastError when it does not get there within --start-timeout /
    --connect-timeout, so the caller can drop the machine and try another.
    """
    print(f"Waiting up to {args.start_timeout} min for instance {instance_id} to start...")
    deadline = time.time() + args.start_timeout * 60
    last = None
    while True:
        inst = vast.instance(instance_id)
        if not inst:
            raise VastError(f"instance {instance_id} no longer exists")
        status = instance_status(inst)
        msg = " ".join((inst.get("status_msg") or "").split())[:140]
        line = f"  {status}" + (f": {msg}" if msg else "")
        if line != last:
            print(line)
            last = line
        if status == "running" and host_port(inst, 22) and inst.get("public_ipaddr"):
            break
        if status in ("exited", "offline") or inst.get("intended_status") == "stopped":
            raise VastError(f"instance {instance_id} is {status}: {msg}")
        if time.time() > deadline:
            raise VastError(f"instance {instance_id} did not start within {args.start_timeout} minutes")
        time.sleep(10)

    if not host_port(inst, PUBLIC_PORT):
        raise VastError(f"Vast did not map the MCP port {PUBLIC_PORT} on this machine")

    # The desktop and MCP links use the machine's public ports, so they have to be
    # reachable from here; some hosts' firewalls or NAT block them.
    ip, direct = inst["public_ipaddr"].strip(), int(host_port(inst, 22))
    print(f"Checking the public ports and SSH (up to {args.connect_timeout} min)...")
    deadline = time.time() + args.connect_timeout * 60
    error = ""
    while time.time() < deadline:
        if not port_open(ip, direct):
            error = f"public port {ip}:{direct} is unreachable (host firewall or NAT)"
        else:
            res = subprocess.run(
                ssh_command(inst, args, "-T", "-o", "BatchMode=yes", endpoint=(ip, direct)) + ["true"],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            )
            if res.returncode == 0:
                return inst
            error = "SSH login failed: " + res.stderr.decode(errors="replace").strip()[-300:]
        time.sleep(10)
    raise VastError(f"machine not usable after {args.connect_timeout} min: {error}")


def load_bad_machines() -> set[int]:
    try:
        return set(json.loads(BAD_MACHINES_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return set()


def mark_bad_machine(machine_id) -> None:
    if machine_id is None:
        return
    bad = load_bad_machines() | {int(machine_id)}
    BAD_MACHINES_FILE.write_text(json.dumps(sorted(bad)), encoding="utf-8")


# ---- minimal MCP client (Streamable HTTP) ------------------------------------------


class McpHttp:
    def __init__(self, url: str, token: str | None):
        self.url = url
        self.token = token
        self.session_id = None
        self.next_id = 1
        # Vast instance certificates are signed by Vast's own CA.
        self.ssl = ssl._create_unverified_context()

    def _post(self, message: dict):
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = urllib.request.Request(self.url, data=json.dumps(message).encode(), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=90, context=self.ssl) as res:
            self.session_id = res.headers.get("Mcp-Session-Id") or self.session_id
            content_type = res.headers.get("Content-Type", "")
            body = res.read().decode("utf-8", errors="replace")
        if "id" not in message:
            return None
        if "text/event-stream" in content_type:
            for line in body.splitlines():
                if line.startswith("data:"):
                    reply = json.loads(line[5:].strip())
                    if reply.get("id") == message["id"]:
                        return reply
            raise VastError("no reply in the MCP event stream")
        return json.loads(body)

    def rpc(self, method: str, params: dict | None = None) -> dict:
        message = {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params or {}}
        self.next_id += 1
        reply = self._post(message)
        if "error" in reply:
            raise VastError(f"MCP {method} failed: {reply['error']}")
        return reply["result"]

    def initialize(self) -> dict:
        result = self.rpc("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "roblox-studio-vast", "version": "1.0"},
        })
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return result

    def call_tool(self, name: str, arguments: dict | None = None) -> tuple[bool, str]:
        result = self.rpc("tools/call", {"name": name, "arguments": arguments or {}})
        text = "\n".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")
        return not result.get("isError"), text.strip()


def studio_connected(text: str) -> bool:
    """Whether a list_roblox_studios reply names at least one Studio, e.g. {"studios": [...]}."""
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    if isinstance(data, dict):
        data = data.get("studios", data.get("instances"))
    if isinstance(data, list):
        return len(data) > 0
    if not text or text.strip() in ("[]", "{}"):
        return False
    return not re.search(r"\b(no|not|zero|0)\b[^.\n]*\b(studio|instance|connected)", text, re.I)


# ---- output ---------------------------------------------------------------------------


def endpoints(inst: dict, info: dict) -> dict:
    ip = (inst.get("public_ipaddr") or "").strip()
    scheme = info.get("SCHEME") or "http"
    token = info.get("TOKEN") or ""
    out = {"token": token, "scheme": scheme}
    if host_port(inst, PUBLIC_PORT):
        out["mcp_url"] = f"{scheme}://{ip}:{host_port(inst, PUBLIC_PORT)}/mcp"
        out["mcp_sse_url"] = f"{scheme}://{ip}:{host_port(inst, PUBLIC_PORT)}/sse"
    if host_port(inst, DESKTOP_PORT):
        out["desktop_url"] = f"{scheme}://{ip}:{host_port(inst, DESKTOP_PORT)}/?token={token}"
    if host_port(inst, PORTAL_PORT):
        out["portal_url"] = f"{scheme}://{ip}:{host_port(inst, PORTAL_PORT)}/?token={token}"
    return out


def write_client_config(urls: dict) -> None:
    if "mcp_url" not in urls:
        return
    config = {
        "mcpServers": {
            "roblox-studio-vast": {
                "type": "http",
                "url": urls["mcp_url"],
                "headers": {"Authorization": f"Bearer {urls['token']}"},
            }
        }
    }
    CLIENT_CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")


def print_urls(urls: dict) -> None:
    print()
    if urls.get("desktop_url"):
        print(f"Desktop (browser):  {urls['desktop_url']}")
    if urls.get("portal_url"):
        print(f"Instance portal:    {urls['portal_url']}")
    if urls.get("mcp_url"):
        print(f"MCP (Streamable):   {urls['mcp_url']}")
        print(f"MCP (SSE):          {urls['mcp_sse_url']}")
        print(f"MCP auth header:    Authorization: Bearer {urls['token']}")
        print()
        print("Connect Claude Code:")
        print(f'  claude mcp add --transport http roblox-studio-vast {urls["mcp_url"]} '
              f'--header "Authorization: Bearer {urls["token"]}"')
        print(f"Other clients: see {CLIENT_CONFIG_FILE.name}")
        if urls.get("scheme") == "http":
            print("Note: this port is plain HTTP, so the token is not encrypted in transit. "
                  "'tunnel' gives you an SSH-encrypted local URL instead.")
    else:
        print("The MCP port was not published; use 'python roblox_studio_vast.py tunnel'.")


def next_steps() -> str:
    account = login_username()
    sign_in = (f"Studio signs in by itself as {account}; give it a minute (finish any captcha Roblox shows)."
               if account else "Sign in to Roblox Studio.")
    return f"""
Finish in Roblox Studio on the remote desktop (open the Desktop URL above):
  1. {sign_in}
  2. Open or create a place (e.g. Baseplate).
  3. Open Assistant, click ... > Manage MCP Servers, and turn on "Enable Studio as MCP server".
"""


# ---- commands --------------------------------------------------------------------------


def require_instance(vast: Vast) -> dict:
    state = load_state()
    if not state.get("instance_id"):
        raise VastError("no instance recorded; run 'up' first")
    inst = vast.instance(state["instance_id"])
    if not inst:
        raise VastError(f"instance {state['instance_id']} no longer exists; run 'up' to rent a new one")
    return inst


def cmd_offers(vast: Vast, args) -> None:
    template = vast.template(TEMPLATE_HASH)
    offers = find_offers(vast, args, template)
    if not offers:
        print("No machines match. Try a higher --max-price or a lower --min-cpu-score.")
        return
    for offer in offers[: args.count]:
        print(format_offer(offer))


def cmd_up(vast: Vast, args) -> None:
    state = load_state()
    if state.get("instance_id") and not args.new:
        existing = vast.instance(state["instance_id"])
        if existing:
            raise VastError(
                f"instance {state['instance_id']} is already recorded ({instance_status(existing)}). "
                "Use 'status' / 'setup', 'down' to destroy it, or 'up --new' to rent another."
            )

    roblox_login()  # a malformed login should stop us here, not count against a machine later
    account = vast.account()
    print(f"Vast account credit: ${account.get('credit', 0):.2f}")

    template = vast.template(TEMPLATE_HASH)
    if args.offer_id:
        offers = vast.offers({"id": {"eq": args.offer_id}, "allocated_storage": args.disk, "type": "on-demand"})
        if not offers:
            raise VastError(f"offer {args.offer_id} is not available")
    else:
        offers = find_offers(vast, args, template)
        if not offers:
            raise VastError("no machines match; try a higher --max-price or a lower --min-cpu-score")

    payload = build_create_payload(template, args.disk)
    public_key = find_public_key(args.ssh_key)
    tried = 0
    for offer in offers:
        if tried >= args.tries:
            break
        tried += 1
        print("\n" + format_offer(offer))
        if not args.yes and not confirm(f"Rent this machine (${offer['dph_total']:.3f}/hr plus bandwidth)?"):
            raise VastError("cancelled")

        try:
            created = vast.create(offer["id"], payload)
        except VastError as err:
            print(f"Could not rent offer {offer['id']}: {err}")
            continue
        instance_id = created.get("new_contract")
        if not instance_id:
            raise VastError(f"unexpected create response: {created}")
        state = {"instance_id": instance_id, "offer_id": offer["id"], "dph_total": offer["dph_total"],
                 "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
        save_state(state)
        print(f"Created instance {instance_id}. Billing has started; 'down' destroys it.")
        if public_key:
            try:
                vast.attach_ssh_key(instance_id, public_key)
            except VastError as err:
                print(f"(Could not attach your SSH key: {err}. Keys on your Vast account still work.)")

        try:
            inst = wait_until_usable(vast, instance_id, args)
            upload_login(inst, args)
            for phase in ("check", "install", "launch", "bridge"):
                res = run_remote(inst, args, phase)
                if res.returncode == EXIT_UNSUITABLE:
                    raise VastError("this machine cannot run TuxBlox/Studio properly (output above)")
                if res.returncode != 0:
                    raise VastError(f"setup phase '{phase}' failed (output above)")
        except VastError as err:
            # Any machine that does not work out is dropped and remembered, and the next one is tried.
            print(f"\nMachine {offer.get('machine_id')} did not work: {err}")
            vast.destroy(instance_id)
            STATE_FILE.unlink(missing_ok=True)
            mark_bad_machine(offer.get("machine_id"))
            print(f"Destroyed instance {instance_id}; trying the next machine.")
            continue
        except KeyboardInterrupt:
            print("\nInterrupted.")
            if confirm(f"Destroy instance {instance_id} so it stops billing?", default=True):
                vast.destroy(instance_id)
                STATE_FILE.unlink(missing_ok=True)
                print("Destroyed.")
            else:
                print("Kept. Re-run steps with 'setup <phase>', or 'down' to destroy it.")
            sys.exit(1)

        finish(vast, inst, args, state)
        return
    raise VastError(f"tried {tried} machine(s) without success; raise --tries or loosen the filters")


def finish(vast: Vast, inst: dict, args, state: dict) -> None:
    info = remote_info(inst, args)
    urls = endpoints(inst, info)
    state.update({"urls": urls})
    save_state(state)
    write_client_config(urls)
    print_urls(urls)
    print(next_steps())
    if urls.get("desktop_url") and not args.no_browser:
        webbrowser.open(urls["desktop_url"])
    if not args.no_wait and urls.get("mcp_url"):
        wait_for_studio(urls, timeout=args.wait_minutes * 60)


def wait_for_studio(urls: dict, timeout: int) -> None:
    print(f"Waiting for Studio to answer over MCP at {urls['mcp_url']} (Ctrl+C to stop waiting)...")
    deadline = time.time() + timeout
    last = None
    try:
        while time.time() < deadline:
            try:
                client = McpHttp(urls["mcp_url"], urls.get("token"))
                client.initialize()
                ok, text = client.call_tool("list_roblox_studios")
                line = text if ok else f"error: {text}"
                if line != last:
                    print(f"  list_roblox_studios -> {line[:300] or '(empty)'}")
                    last = line
                if ok and studio_connected(text):
                    print("\nRoblox Studio is connected. MCP clients can now control it remotely.")
                    return
            except (urllib.error.URLError, VastError, OSError, ValueError) as err:
                line = f"not reachable yet ({err})"
                if line != last:
                    print(f"  {line}")
                    last = line
            time.sleep(15)
        print("Stopped waiting. Run 'wait-mcp' again after enabling the MCP server in Studio.")
    except KeyboardInterrupt:
        print("\nStopped waiting. Run 'wait-mcp' to check again.")


def cmd_status(vast: Vast, args) -> None:
    inst = require_instance(vast)
    print(f"Instance {inst['id']}: {instance_status(inst)} | {inst.get('gpu_name')} | "
          f"${inst.get('dph_total', 0):.3f}/hr")
    if instance_status(inst) != "running":
        return
    run_remote(inst, args, "status")
    info = remote_info(inst, args)
    urls = endpoints(inst, info)
    state = load_state()
    state["urls"] = urls
    save_state(state)
    write_client_config(urls)
    print_urls(urls)
    if urls.get("mcp_url"):
        try:
            client = McpHttp(urls["mcp_url"], urls.get("token"))
            client.initialize()
            ok, text = client.call_tool("list_roblox_studios")
            print(f"\nlist_roblox_studios -> {text[:500] or '(empty)'}")
        except Exception as err:  # noqa: BLE001 - report any failure of the remote check
            print(f"\nMCP check over the public URL failed: {err}")


def cmd_wait_mcp(vast: Vast, args) -> None:
    inst = require_instance(vast)
    urls = endpoints(inst, remote_info(inst, args))
    if not urls.get("mcp_url"):
        raise VastError("the MCP port is not published on this instance; use 'tunnel'")
    wait_for_studio(urls, timeout=args.wait_minutes * 60)


def cmd_setup(vast: Vast, args) -> None:
    inst = require_instance(vast)
    if args.phase in ("all", "launch", "signin"):
        if not upload_login(inst, args) and args.phase == "signin":
            raise VastError("set ROBLOX_USERNAME and ROBLOX_PASSWORD in .env first")
    res = run_remote(inst, args, args.phase)
    if res.returncode != 0:
        print(f"Setup phase '{args.phase}' failed (exit {res.returncode}); see the output above.", file=sys.stderr)
        sys.exit(res.returncode)
    if args.phase in ("all", "bridge"):
        finish(vast, inst, args, load_state())


def cmd_tunnel(vast: Vast, args) -> None:
    inst = require_instance(vast)
    local = args.local_port
    print(f"MCP server: http://127.0.0.1:{local}/mcp (Streamable HTTP) or /sse, no token needed.")
    print("Keep this running; Ctrl+C closes the tunnel.")
    cmd = ssh_command(inst, args, "-N", "-L", f"127.0.0.1:{local}:127.0.0.1:{BRIDGE_PORT}")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        pass


def cmd_ssh(vast: Vast, args) -> None:
    inst = require_instance(vast)
    sys.exit(subprocess.run(ssh_command(inst, args)).returncode)


def cmd_down(vast: Vast, args) -> None:
    state = load_state()
    instance_id = args.instance_id or state.get("instance_id")
    if not instance_id:
        raise VastError("no instance recorded; pass an instance id")
    if not args.yes and not confirm(f"Destroy instance {instance_id}? Its disk is deleted."):
        raise VastError("cancelled")
    vast.destroy(instance_id)
    if state.get("instance_id") == instance_id:
        STATE_FILE.unlink(missing_ok=True)
    print(f"Destroyed instance {instance_id}; billing stopped.")


def main() -> None:
    load_dotenv(HERE / ".env")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ssh-key", help="private key for SSH (default: your normal ssh setup)")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_offer_filters(p):
        p.add_argument("--max-price", type=float, default=0.60, help="max $/hr (default 0.60)")
        p.add_argument("--gpu", action="append", help='GPU model, e.g. "RTX 4090" (repeatable)')
        p.add_argument("--disk", type=int, default=60, help="disk in GB (default 60)")
        p.add_argument("--min-ram", type=int, default=16, help="min RAM in GB (default 16)")
        p.add_argument("--min-cpus", type=int, default=6,
                       help="min vCPUs (default 6: Studio, Wine and the CPU-encoded desktop stream)")
        p.add_argument("--min-cpu-score", type=int, default=3000,
                       help="min single-thread CPU speed, see cpu_speed_score (default 3000 = Core i7-10700K / "
                            "Ryzen 5000 class; old Xeons and EPYC Zen 2/3 make Studio laggy)")
        p.add_argument("--allow-unknown-cpu", action="store_true", help="also accept CPU models not recognised")
        p.add_argument("--min-download", type=int, default=300, help="min download Mbps (default 300)")
        p.add_argument("--min-reliability", type=float, default=0.97, help="min reliability 0-1 (default 0.97)")

    def add_wait_flags(p):
        p.add_argument("--no-browser", action="store_true", help="don't open the desktop in your browser")
        p.add_argument("--no-wait", action="store_true", help="don't wait for Studio to answer over MCP")
        p.add_argument("--wait-minutes", type=int, default=60, help="how long to wait for Studio (default 60)")

    p = sub.add_parser("offers", help="list machines that fit")
    add_offer_filters(p)
    p.add_argument("--count", type=int, default=10)
    p.set_defaults(func=cmd_offers)

    p = sub.add_parser("up", help="rent a machine and set everything up")
    add_offer_filters(p)
    add_wait_flags(p)
    p.add_argument("--offer-id", type=int, help="rent this offer instead of the cheapest fit")
    p.add_argument("--tries", type=int, default=5, help="machines to try before giving up (default 5)")
    p.add_argument("--start-timeout", type=int, default=15,
                   help="minutes a machine gets to download the image and start (default 15)")
    p.add_argument("--connect-timeout", type=int, default=3,
                   help="minutes a running machine gets to accept connections on its public ports (default 3)")
    p.add_argument("--new", action="store_true", help="rent even if an instance is already recorded")
    p.add_argument("-y", "--yes", action="store_true", help="don't ask before renting")
    p.set_defaults(func=cmd_up)

    p = sub.add_parser("status", help="instance state, URLs and an MCP check")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("wait-mcp", help="wait until Studio answers over MCP")
    p.add_argument("--wait-minutes", type=int, default=60)
    p.set_defaults(func=cmd_wait_mcp)

    p = sub.add_parser("setup", help="re-run the on-instance setup")
    p.add_argument("phase", nargs="?", default="all",
                   choices=["all", "check", "install", "launch", "signin", "bridge", "status"])
    add_wait_flags(p)
    p.set_defaults(func=cmd_setup)

    p = sub.add_parser("tunnel", help="forward the MCP server to localhost over SSH")
    p.add_argument("--local-port", type=int, default=PUBLIC_PORT)
    p.set_defaults(func=cmd_tunnel)

    p = sub.add_parser("ssh", help="open a shell on the instance")
    p.set_defaults(func=cmd_ssh)

    p = sub.add_parser("down", help="destroy the instance")
    p.add_argument("instance_id", nargs="?", type=int)
    p.add_argument("-y", "--yes", action="store_true")
    p.set_defaults(func=cmd_down)

    args = parser.parse_args()
    vast = Vast(os.environ.get("VAST_API_KEY", ""))
    try:
        args.func(vast, args)
    except VastError as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
