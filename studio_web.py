#!/usr/bin/env python3
"""Studio Remote: a local web interface for Roblox Studio on Vast.ai.

  python studio_web.py                      opens http://127.0.0.1:8787
  python studio_web.py --port 9000 --no-browser
  python studio_web.py --mcp-url http://127.0.0.1:8765/mcp
                                            use an SSH tunnel ('roblox_studio_vast.py tunnel')
                                            instead of the machine's public MCP port

Rent and manage the machine, watch its desktop, and drive Roblox Studio through its
MCP server: explorer, properties, viewport captures, a Luau console, script editing,
live output and every MCP tool. It listens on 127.0.0.1 only and shares .env, the
state file and remote_setup.sh with roblox_studio_vast.py, which it runs for the long
operations (rent, setup, destroy).
"""

from __future__ import annotations

import argparse
import base64
import itertools
import json
import os
import re
import ssl
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import roblox_studio_vast as rsv  # noqa: E402  (shared config, Vast client and SSH helpers)

WEB_DIR = HERE / "web"
CLI = HERE / "roblox_studio_vast.py"
SSH_ARGS = argparse.Namespace(ssh_key=None)
MAX_JOB_LINES = 4000
MCP_PROTOCOL = "2025-06-18"
CONTENT_TYPES = {  # explicit, because Windows' registry can map .js to text/plain
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
}
CSP = (
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; "
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)


class Settings:
    port = 8787
    mcp_url: str | None = None    # --mcp-url overrides the MCP endpoint from the state file
    mcp_token: str | None = None


# Host names a request may be addressed to. Any port is fine, so an SSH tunnel can use a
# different local port; a page on another site name (DNS rebinding) is still turned away.
LOCAL_HOSTNAMES = {"127.0.0.1", "localhost", "::1"}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class Raw:
    """A non-JSON response body."""

    def __init__(self, data: bytes, content_type: str):
        self.data = data
        self.content_type = content_type


class Cached:
    """Calls fn(key) at most once every `ttl` seconds per key."""

    def __init__(self, ttl: float, fn):
        self.ttl, self.fn = ttl, fn
        self.lock = threading.Lock()
        self.values: dict = {}

    def get(self, key=None):
        with self.lock:
            hit = self.values.get(key)
            if hit and time.time() - hit[0] < self.ttl:
                return hit[1]
        value = self.fn(key)
        with self.lock:
            self.values[key] = (time.time(), value)
        return value

    def clear(self):
        with self.lock:
            self.values.clear()


# Keys that came from .env rather than the real environment. Jobs drop them so the CLI they
# run reads .env afresh, and picks up edits made while this server is running.
DOTENV_KEYS = rsv.load_dotenv(HERE / ".env")
VAST = rsv.Vast(os.environ.get("VAST_API_KEY", ""))
INSTANCE = Cached(4, lambda instance_id: VAST.instance(instance_id))
CREDIT = Cached(60, lambda _: VAST.account().get("credit"))
TEMPLATE = Cached(3600, lambda _: VAST.template(rsv.TEMPLATE_HASH))


# ---- machine ----------------------------------------------------------------------


def clean_cpu(name: str | None) -> str | None:
    return " ".join((name or "").replace("™", "").replace("®", "").split()) or None


def instance_view(inst: dict) -> dict:
    endpoints = rsv.ssh_endpoints(inst)
    return {
        "id": inst.get("id"),
        "status": rsv.instance_status(inst),
        "intended": inst.get("intended_status"),
        "message": " ".join((inst.get("status_msg") or "").split())[:240],
        "gpu": inst.get("gpu_name"),
        "cpu": clean_cpu(inst.get("cpu_name")),
        "cpu_score": rsv.cpu_speed_score(inst.get("cpu_name")),
        "vcpus": round(inst.get("cpu_cores_effective") or 0),
        "ram_gb": round((inst.get("cpu_ram") or 0) / 1000),
        "dph": inst.get("dph_total") or 0,
        "start_date": inst.get("start_date"),
        "ip": (inst.get("public_ipaddr") or "").strip(),
        "location": inst.get("geolocation"),
        "ssh": f"ssh -p {endpoints[0][1]} root@{endpoints[0][0]}" if endpoints else None,
    }


def offer_view(o: dict) -> dict:
    return {
        "id": o["id"],
        "machine_id": o.get("machine_id"),
        "gpu": o.get("gpu_name"),
        "cpu": clean_cpu(o.get("cpu_name")),
        "cpu_score": rsv.cpu_speed_score(o.get("cpu_name")),
        "vcpus": round(o.get("cpu_cores_effective") or 0),
        "ram_gb": round((o.get("cpu_ram") or 0) / 1000),
        "dph": o.get("dph_total"),
        "net_down": round(o.get("inet_down") or 0),
        "reliability": o.get("reliability2"),
        "location": o.get("geolocation"),
        "host_os": o.get("os_version"),
    }


def mcp_endpoint() -> tuple[str | None, str | None]:
    if Settings.mcp_url:
        return Settings.mcp_url, Settings.mcp_token
    urls = rsv.load_state().get("urls") or {}
    return urls.get("mcp_url"), urls.get("token")


def dotenv_value(key: str) -> str:
    """A setting as .env says it now (it may have been edited since startup), else the environment's."""
    try:
        for line in (HERE / ".env").read_text(encoding="utf-8").splitlines():
            name, sep, value = line.strip().partition("=")
            if sep and not name.startswith("#") and name.strip() == key:
                return value.strip().strip("'\"")
    except OSError:
        pass
    return "" if key in DOTENV_KEYS else os.environ.get(key, "")


def auto_signin_user() -> str | None:
    """The Roblox account Studio signs in with automatically, when .env has a usable login."""
    username, password = dotenv_value("ROBLOX_USERNAME").strip(), dotenv_value("ROBLOX_PASSWORD")
    if password and re.fullmatch(r"[A-Za-z0-9_]{3,20}", username):
        return username
    return None


def overview(query: dict, body: dict) -> dict:
    state = rsv.load_state()
    out = {
        "instance": None,
        "instance_id": state.get("instance_id"),
        "gone": False,
        "error": None,
        "urls": None,
        "credit": None,
        "job": JOBS.summary(),
        "mcp_override": bool(Settings.mcp_url),
        "auto_signin": auto_signin_user(),
        "bad_machines": len(rsv.load_bad_machines()),
    }
    try:
        out["credit"] = CREDIT.get()
    except rsv.VastError as err:
        out["error"] = str(err)
    if state.get("instance_id"):
        try:
            inst = INSTANCE.get(state["instance_id"])
            if inst:
                out["instance"] = instance_view(inst)
            else:
                out["gone"] = True
        except rsv.VastError as err:
            out["error"] = str(err)
    urls = state.get("urls") or {}
    if urls:
        out["urls"] = {k: urls.get(k) for k in ("desktop_url", "portal_url", "mcp_url", "mcp_sse_url", "token", "scheme")}
    running = bool(out["instance"]) and out["instance"]["status"] == "running"
    out["mcp_ready"] = bool(mcp_endpoint()[0]) and (running or bool(Settings.mcp_url))
    return out


def offers(query: dict, body: dict) -> dict:
    def number(name, default, cast=float):
        try:
            return cast(query.get(name, default))
        except ValueError:
            raise ApiError(400, f"{name} must be a number") from None

    args = argparse.Namespace(
        max_price=number("max_price", 0.6),
        gpu=[query["gpu"]] if query.get("gpu") else None,
        disk=60,
        min_ram=number("min_ram", 16, int),
        min_cpus=number("min_cpus", 6, int),
        min_download=300,
        min_reliability=0.97,
        min_cpu_score=number("min_cpu_score", 3000, int),
        allow_unknown_cpu=False,
    )
    found = rsv.find_offers(VAST, args, TEMPLATE.get())
    return {"offers": [offer_view(o) for o in found[:30]], "count": len(found)}


def running_instance() -> dict:
    instance_id = rsv.load_state().get("instance_id")
    if not instance_id:
        raise ApiError(409, "No machine is running")
    inst = INSTANCE.get(instance_id)
    if not inst or rsv.instance_status(inst) != "running":
        raise ApiError(409, "The machine is not running")
    return inst


def refresh_connection(query: dict, body: dict) -> dict:
    """Re-reads the instance token and ports over SSH (e.g. after the instance restarted)."""
    inst = VAST.instance(running_instance()["id"])
    info = rsv.remote_info(inst, SSH_ARGS)
    if not info.get("TOKEN"):
        raise ApiError(502, "Could not read the instance's access token over SSH")
    urls = rsv.endpoints(inst, info)
    state = rsv.load_state()
    state["urls"] = urls
    rsv.save_state(state)
    rsv.write_client_config(urls)
    INSTANCE.clear()
    MCP.reset()
    return {"urls": urls}


SCREENSHOT_SCRIPT = r"""
cd /tmp
D=$(sed -n 's/^DISPLAY=//p' /home/user/.local/share/studio-mcp/desktop.env 2>/dev/null); D=${D:-:20}
S=$(runuser -u user -- env DISPLAY=$D xrandr 2>/dev/null | sed -n 's/.*current \([0-9]*\) x \([0-9]*\).*/\1x\2/p' | head -n1)
echo __IMG__
runuser -u user -- env DISPLAY=$D ffmpeg -loglevel error -f x11grab -video_size ${S:-1920x1080} -i $D \
    -frames:v 1 -vf "scale='min(1600,iw)':-2" -q:v 4 -f mjpeg - | base64 -w0
echo
echo __END__
"""
SHOT_LOCK = threading.Lock()
LAST_SHOT = {"at": 0.0, "data": b""}


def desktop_screenshot(query: dict, body: dict) -> Raw:
    inst = running_instance()
    with SHOT_LOCK:
        if LAST_SHOT["data"] and time.time() - LAST_SHOT["at"] < 1.5:
            return Raw(LAST_SHOT["data"], "image/jpeg")
        command = rsv.ssh_command(inst, SSH_ARGS, "-T", "-o", "BatchMode=yes") + ["bash -s"]
        try:
            res = subprocess.run(command, input=SCREENSHOT_SCRIPT.encode(), capture_output=True, timeout=45)
        except subprocess.TimeoutExpired:
            raise ApiError(504, "The desktop screenshot timed out") from None
        out = res.stdout
        start, end = out.find(b"__IMG__"), out.find(b"__END__")
        data = base64.b64decode(out[start + 7:end].strip()) if 0 <= start < end else b""
        if not data:
            detail = res.stderr.decode(errors="replace").strip().splitlines()
            raise ApiError(502, "Could not capture the desktop" + (f": {detail[-1]}" if detail else ""))
        LAST_SHOT.update(at=time.time(), data=data)
        return Raw(data, "image/jpeg")


# ---- long operations (run roblox_studio_vast.py) ---------------------------------


class Jobs:
    def __init__(self):
        self.lock = threading.Lock()
        self.job: dict | None = None
        self.ids = itertools.count(int(time.time()))

    def summary(self) -> dict | None:
        job = self.job
        if not job:
            return None
        keys = ("id", "action", "phase", "title", "status", "returncode", "started", "ended")
        return {k: job[k] for k in keys} | {"lines": job["dropped"] + len(job["lines"])}

    def start(self, action: str, phase: str | None, cli_args: list[str], title: str) -> dict:
        with self.lock:
            if self.job and self.job["status"] == "running":
                raise ApiError(409, f"“{self.job['title']}” is still running")
            self.job = {
                "id": next(self.ids), "action": action, "phase": phase, "title": title, "status": "running",
                "returncode": None, "started": time.time(), "ended": None, "lines": [], "dropped": 0,
                "proc": None, "stop": False,
            }
            job = self.job
        threading.Thread(target=self._run, args=(job, cli_args), daemon=True).start()
        return self.summary()

    def _run(self, job: dict, cli_args: list[str]) -> None:
        env = {k: v for k, v in os.environ.items() if k not in DOTENV_KEYS}
        env.update(PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        try:
            proc = subprocess.Popen(
                [sys.executable, "-u", str(CLI), *cli_args], cwd=str(HERE), env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            )
        except OSError as err:
            job["lines"].append(f"Could not start roblox_studio_vast.py: {err}")
            self._finish(job, -1)
            return
        job["proc"] = proc
        for raw in proc.stdout:
            job["lines"].append(raw.decode("utf-8", "replace").rstrip("\r\n"))
            extra = len(job["lines"]) - MAX_JOB_LINES
            if extra > 0:
                del job["lines"][:extra]
                job["dropped"] += extra
        self._finish(job, proc.wait())

    def _finish(self, job: dict, returncode: int) -> None:
        job["returncode"] = returncode
        job["status"] = "stopped" if job["stop"] else ("done" if returncode == 0 else "failed")
        job["ended"] = time.time()
        INSTANCE.clear()
        CREDIT.clear()
        MCP.reset()

    def view(self, since: int) -> dict | None:
        job = self.job
        if not job:
            return None
        lines, dropped = job["lines"], job["dropped"]
        start = max(since - dropped, 0)
        new = lines[start:]
        return self.summary() | {"from": dropped + start, "new_lines": new, "next": dropped + start + len(new)}

    def stop(self) -> dict:
        job = self.job
        if not job or job["status"] != "running" or not job["proc"]:
            raise ApiError(409, "Nothing is running")
        job["stop"] = True
        job["proc"].terminate()
        return self.summary()


JOBS = Jobs()
SETUP_TITLES = {
    "all": "Set up Roblox Studio on the machine",
    "check": "Check the machine",
    "install": "Install TuxBlox",
    "launch": "Launch Roblox Studio",
    "signin": "Sign Studio in to Roblox",
    "bridge": "Repair the MCP bridge",
}


def start_job(query: dict, body: dict) -> dict:
    action = body.get("action")
    if action == "up":
        args = ["up", "-y", "--no-browser", "--no-wait"]
        try:
            if body.get("offer_id"):
                args += ["--offer-id", str(int(body["offer_id"]))]
            if body.get("max_price") is not None:
                args += ["--max-price", str(float(body["max_price"]))]
            if body.get("min_cpu_score") is not None:
                args += ["--min-cpu-score", str(int(body["min_cpu_score"]))]
        except (TypeError, ValueError):
            raise ApiError(400, "offer_id, max_price and min_cpu_score must be numbers") from None
        if body.get("gpu"):
            args += ["--gpu", str(body["gpu"])]
        return JOBS.start("up", None, args, "Rent a machine and set it up")
    if action == "setup":
        phase = body.get("phase", "all")
        if phase not in SETUP_TITLES:
            raise ApiError(400, f"unknown setup phase {phase!r}")
        return JOBS.start("setup", phase, ["setup", phase, "--no-browser", "--no-wait"], SETUP_TITLES[phase])
    if action == "down":
        return JOBS.start("down", None, ["down", "-y"], "Destroy the machine")
    raise ApiError(400, f"unknown action {action!r}")


def current_job(query: dict, body: dict) -> dict:
    try:
        since = int(query.get("since", 0))
    except ValueError:
        since = 0
    return {"job": JOBS.view(since)}


def stop_job(query: dict, body: dict) -> dict:
    return {"job": JOBS.stop()}


# ---- MCP -----------------------------------------------------------------------------


class McpError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def parse_event_stream(body: str, want_id) -> dict | None:
    """Finds the JSON-RPC reply with id `want_id` in a text/event-stream body."""
    data: list[str] = []
    for line in body.splitlines() + [""]:
        if line.startswith("data:"):
            data.append(line[5:][1:] if line[5:6] == " " else line[5:])
        elif line == "" and data:
            try:
                message = json.loads("\n".join(data))
            except ValueError:
                message = None
            data = []
            if isinstance(message, dict) and message.get("id") == want_id and ("result" in message or "error" in message):
                return message
    return None


class McpClient:
    """A small MCP client for Streamable HTTP (JSON or event-stream replies)."""

    def __init__(self, url: str, token: str | None):
        self.url, self.token = url, token
        self.session_id: str | None = None
        self.protocol: str | None = None
        self.server_info: dict | None = None
        self.ids = itertools.count(1)
        self.ssl = ssl._create_unverified_context()  # Vast instance certificates come from Vast's own CA

    def _post(self, message: dict, timeout: float) -> dict | None:
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        if self.protocol:
            headers["MCP-Protocol-Version"] = self.protocol
        req = urllib.request.Request(self.url, data=json.dumps(message).encode(), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout, context=self.ssl) as res:
            self.session_id = res.headers.get("Mcp-Session-Id") or self.session_id
            content_type = res.headers.get("Content-Type", "")
            body = res.read().decode("utf-8", errors="replace")
        if "id" not in message:
            return None
        if "text/event-stream" in content_type:
            return parse_event_stream(body, message["id"])
        return json.loads(body) if body.strip() else None

    def request(self, method: str, params: dict | None, timeout: float) -> dict:
        message = {"jsonrpc": "2.0", "id": next(self.ids), "method": method, "params": params or {}}
        reply = self._post(message, timeout)
        if reply is None:
            raise McpError(f"The MCP server sent no reply to {method}")
        if "error" in reply:
            error = reply["error"] or {}
            raise McpError(error.get("message") or json.dumps(error))
        return reply.get("result") or {}

    def initialize(self) -> None:
        result = self.request("initialize", {
            "protocolVersion": MCP_PROTOCOL,
            "capabilities": {},
            "clientInfo": {"name": "studio-remote", "version": "1.0"},
        }, timeout=30)
        self.server_info = result.get("serverInfo")
        self.protocol = result.get("protocolVersion") or MCP_PROTOCOL
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=30)


def error_reason(err: Exception) -> str:
    reason = getattr(err, "reason", None) or err
    return str(reason) or type(reason).__name__


class RemoteMcp:
    """One shared MCP session with the machine's Studio MCP bridge."""

    def __init__(self):
        self.lock = threading.Lock()
        self.client: McpClient | None = None
        self.tools_cache: list | None = None

    def reset(self) -> None:
        with self.lock:
            self.client, self.tools_cache = None, None

    def _connect(self) -> McpClient:
        url, token = mcp_endpoint()
        if not url:
            raise ApiError(409, "The MCP server is not set up yet")
        with self.lock:
            if self.client and self.client.url == url and self.client.token == token:
                return self.client
        client = McpClient(url, token)
        try:
            client.initialize()
        except urllib.error.HTTPError as err:
            hint = "check the access token" if err.code in (401, 403) else "is the MCP bridge running?"
            raise ApiError(502, f"The MCP server answered HTTP {err.code} ({hint})") from None
        except McpError as err:
            raise ApiError(502, f"The MCP server refused to start a session: {err.message}") from None
        except (urllib.error.URLError, OSError, ValueError) as err:
            raise ApiError(502, f"Cannot reach the MCP server at {url}: {error_reason(err)}") from None
        with self.lock:
            self.client = client
        return client

    def call(self, method: str, params: dict | None, timeout: float = 120) -> dict:
        name = (params or {}).get("name", method)
        for attempt in (1, 2):
            client = self._connect()
            try:
                return client.request(method, params, timeout)
            except urllib.error.HTTPError as err:
                # A 404/400 means the bridge forgot our session (it restarted), and the call
                # never ran, so reconnecting and retrying once is safe.
                if attempt == 1 and err.code in (400, 404):
                    self.reset()
                    continue
                raise ApiError(502, f"The MCP server answered HTTP {err.code}") from None
            except McpError as err:
                raise ApiError(422, err.message) from None
            except TimeoutError:
                raise ApiError(504, f"“{name}” did not answer within {int(timeout)} s") from None
            except (urllib.error.URLError, OSError, ValueError) as err:
                if isinstance(getattr(err, "reason", None), TimeoutError):
                    raise ApiError(504, f"“{name}” did not answer within {int(timeout)} s") from None
                self.reset()
                raise ApiError(502, f"Lost the connection to the MCP server: {error_reason(err)}") from None
        raise ApiError(502, "The MCP session could not be re-established")

    def tools(self, refresh: bool = False) -> list:
        if self.tools_cache is not None and not refresh:
            return self.tools_cache
        tools, cursor = [], None
        for _ in range(20):
            result = self.call("tools/list", {"cursor": cursor} if cursor else {}, timeout=30)
            tools += result.get("tools") or []
            cursor = result.get("nextCursor")
            if not cursor:
                break
        self.tools_cache = tools
        return tools

    def server_info(self) -> dict | None:
        client = self.client
        return client.server_info if client else None


MCP = RemoteMcp()


def content_text(result: dict) -> str:
    return "\n".join(c.get("text", "") for c in result.get("content") or [] if c.get("type") == "text")


def parse_studios(text: str) -> list[dict]:
    try:
        data = json.loads(text)
    except ValueError:
        return []
    if isinstance(data, dict):
        data = data.get("studios", data.get("instances", []))
    studios = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict):
            continue
        studio_id = item.get("id") or item.get("studio_id") or item.get("studioId")
        if studio_id:
            studios.append({
                "id": str(studio_id),
                "name": item.get("name") or str(studio_id),
                "active": item.get("active"),
                "place_id": item.get("place_id") or item.get("placeId"),
            })
    return studios


def mcp_tools(query: dict, body: dict) -> dict:
    return {"tools": MCP.tools(refresh=query.get("refresh") == "1"), "server": MCP.server_info()}


def mcp_studios(query: dict, body: dict) -> dict:
    result = MCP.call("tools/call", {"name": "list_roblox_studios", "arguments": {}}, timeout=30)
    text = content_text(result)
    return {"studios": parse_studios(text), "raw": text}


def mcp_call(query: dict, body: dict) -> dict:
    name = body.get("name")
    if not isinstance(name, str) or not name:
        raise ApiError(400, "name is required")
    arguments = body.get("arguments") or {}
    if not isinstance(arguments, dict):
        raise ApiError(400, "arguments must be an object")
    try:
        timeout = min(max(float(body.get("timeout") or 120), 5), 900)
    except (TypeError, ValueError):
        timeout = 120
    started = time.time()
    result = MCP.call("tools/call", {"name": name, "arguments": arguments}, timeout=timeout)
    return {"result": result, "ms": round((time.time() - started) * 1000)}


def mcp_reset(query: dict, body: dict) -> dict:
    MCP.reset()
    return {"ok": True}


# ---- HTTP ------------------------------------------------------------------------------

ROUTES = {
    ("GET", "/api/overview"): overview,
    ("GET", "/api/offers"): offers,
    ("POST", "/api/jobs"): start_job,
    ("GET", "/api/jobs/current"): current_job,
    ("POST", "/api/jobs/stop"): stop_job,
    ("GET", "/api/desktop/screenshot"): desktop_screenshot,
    ("POST", "/api/connection/refresh"): refresh_connection,
    ("GET", "/api/mcp/tools"): mcp_tools,
    ("GET", "/api/mcp/studios"): mcp_studios,
    ("POST", "/api/mcp/call"): mcp_call,
    ("POST", "/api/mcp/reset"): mcp_reset,
}


class Handler(BaseHTTPRequestHandler):
    server_version = "StudioRemote"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep the console quiet; errors are printed separately
        pass

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")

    def handle_request(self, method: str) -> None:
        # Only answer requests addressed to this machine by name, which blocks DNS rebinding.
        try:
            hostname = urllib.parse.urlsplit("//" + (self.headers.get("Host") or "")).hostname
        except ValueError:
            hostname = None
        if hostname not in LOCAL_HOSTNAMES:
            self.send_body(403, b"Forbidden", "text/plain")
            return
        url = urllib.parse.urlsplit(self.path)
        if url.path.startswith("/api/"):
            self.handle_api(method, url)
        elif method == "GET":
            self.serve_static(url.path)
        else:
            self.send_json(405, {"error": "method not allowed"})

    def handle_api(self, method: str, url) -> None:
        # The custom header forces a CORS preflight, which this server never approves,
        # so other websites cannot make your browser call these endpoints.
        if method == "POST" and self.headers.get("X-Studio-Remote") != "1":
            self.send_json(403, {"error": "missing X-Studio-Remote header"})
            return
        route = ROUTES.get((method, url.path))
        if not route:
            self.send_json(404, {"error": "not found"})
            return
        try:
            body = self.read_json() if method == "POST" else {}
            result = route(dict(urllib.parse.parse_qsl(url.query)), body)
        except ApiError as err:
            self.send_json(err.status, {"error": err.message})
            return
        except rsv.VastError as err:
            self.send_json(502, {"error": str(err)})
            return
        except Exception as err:  # noqa: BLE001 - report anything unexpected to the page
            traceback.print_exc()
            self.send_json(500, {"error": f"{type(err).__name__}: {err}"})
            return
        if isinstance(result, Raw):
            self.send_body(200, result.data, result.content_type)
        else:
            self.send_json(200, result)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 10_000_000:
            raise ApiError(413, "request too large")
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise ApiError(400, "invalid JSON") from None
        if not isinstance(data, dict):
            raise ApiError(400, "expected a JSON object")
        return data

    def serve_static(self, path: str) -> None:
        if path in ("/", "/index.html"):
            name = "index.html"
        elif path.startswith("/static/"):
            name = urllib.parse.unquote(path[len("/static/"):])
        else:
            self.send_body(404, b"Not found", "text/plain")
            return
        root = WEB_DIR.resolve()
        file = (root / name).resolve()
        if root not in file.parents or not file.is_file():
            self.send_body(404, b"Not found", "text/plain")
            return
        content_type = CONTENT_TYPES.get(file.suffix.lower(), "application/octet-stream")
        self.send_body(200, file.read_bytes(), content_type)

    def send_json(self, status: int, data) -> None:
        self.send_body(status, json.dumps(data).encode(), "application/json")

    def send_body(self, status: int, data: bytes, content_type: str) -> None:
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", CSP)
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Studio Remote: web interface for Roblox Studio on Vast.ai")
    parser.add_argument("--port", type=int, default=8787, help="local port (default 8787)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    parser.add_argument("--mcp-url", help="MCP endpoint to use instead of the machine's public port, "
                                          "e.g. an SSH tunnel: http://127.0.0.1:8765/mcp")
    parser.add_argument("--mcp-token", help="bearer token for --mcp-url (an SSH tunnel needs none)")
    args = parser.parse_args()

    Settings.port = args.port
    Settings.mcp_url, Settings.mcp_token = args.mcp_url, args.mcp_token
    if not (WEB_DIR / "index.html").exists():
        sys.exit(f"Missing {WEB_DIR / 'index.html'}; keep the web folder next to studio_web.py.")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as err:
        sys.exit(f"Cannot listen on port {args.port} ({err}). Is Studio Remote already running? Try --port.")
    server.daemon_threads = True

    url = f"http://127.0.0.1:{args.port}/"
    print(f"Studio Remote is running at {url}  (Ctrl+C to stop)")
    if not os.environ.get("VAST_API_KEY"):
        print("Note: VAST_API_KEY is not set (.env), so renting and machine status won't work.")
    if not args.no_browser:
        threading.Timer(0.8, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
