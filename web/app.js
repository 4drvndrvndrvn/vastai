// Studio Remote: the front end for studio_web.py. Plain ES module, no build step.

/* ═══════════════════════════ helpers ═══════════════════════════ */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style") {
      for (const [name, v] of Object.entries(value)) {
        if (name.startsWith("--")) node.style.setProperty(name, v);
        else node.style[name] = v;
      }
    } else if (key === "html") node.innerHTML = value; // only ever our own icon markup
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const ICONS = {
  play: '<path d="M5 3.4v9.2l7.6-4.6z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.4" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  external: '<path d="M9 2.8h4.2V7M13.2 2.8 7.5 8.5M11.5 9.5v3.7H2.8V4.5h3.7"/>',
  camera: '<path d="M2.4 5.4h2.3L6 3.6h4l1.3 1.8h2.3v7.2H2.4z"/><circle cx="8" cy="9" r="2.3"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  file: '<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5M6 8.5h4.5M6 11h4.5"/>',
  wrench: '<path d="M10.3 2.2a3.3 3.3 0 0 0-3.9 4.4L2.3 10.7a1.4 1.4 0 0 0 2 2l4.1-4.1a3.3 3.3 0 0 0 4.4-3.9l-2 2-1.8-.4-.4-1.8z"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>',
  search: '<circle cx="7" cy="7" r="4.3"/><path d="m10.3 10.3 3.2 3.2"/>',
  text: '<path d="M3 4h10M3 8h7M3 12h10"/>',
  target: '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"/>',
  download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  copy: '<rect x="5.2" y="5.2" width="8.3" height="8.3" rx="1.5"/><path d="M3 10.6V3.8c0-.5.3-.8.8-.8h6.8"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  chevron: '<path d="m6 4 4 4-4 4"/>',
  theme: '<circle cx="8" cy="8" r="5.3"/><path d="M8 2.7v10.6a5.3 5.3 0 0 0 0-10.6z" fill="currentColor"/>',
  command: '<path d="M6 6V4.6A1.6 1.6 0 1 0 4.6 6H6zm0 0h4m-4 0v4m4-4V4.6A1.6 1.6 0 1 1 11.4 6H10zm0 0v4m0 0h1.4A1.6 1.6 0 1 1 10 11.4V10zm0 0H6m0 0v1.4A1.6 1.6 0 1 1 4.6 10H6z"/>',
  monitor: '<rect x="2" y="2.8" width="12" height="8.2" rx="1.3"/><path d="M6 13.6h4M8 11v2.6"/>',
  server: '<rect x="2.5" y="2.5" width="11" height="4.5" rx="1.1"/><rect x="2.5" y="9" width="11" height="4.5" rx="1.1"/><path d="M5 4.75h.01M5 11.25h.01"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>',
  bolt: '<path d="M9 1.5 4 9h4l-1 5.5L12 7H8z"/>',
  check: '<path d="m3.5 8.5 3 3 6-7"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  tree: '<path d="M2.5 3h4v3h-4zM9.5 7h4v3h-4zM9.5 12h4v2.4h-4z"/><path d="M4.5 6v7.2h5M4.5 8.5h5"/>',
  list: '<path d="M6.2 4h7M6.2 8h7M6.2 12h7"/><circle cx="3.2" cy="4" r=".9" fill="currentColor"/><circle cx="3.2" cy="8" r=".9" fill="currentColor"/><circle cx="3.2" cy="12" r=".9" fill="currentColor"/>',
  key: '<circle cx="5.5" cy="10.5" r="3"/><path d="m7.6 8.4 5.4-5.4M11 5l1.6 1.6"/>',
  globe: '<circle cx="8" cy="8" r="5.6"/><path d="M2.4 8h11.2M8 2.4c1.6 1.6 2.3 3.5 2.3 5.6S9.6 12 8 13.6C6.4 12 5.7 10.1 5.7 8S6.4 4 8 2.4z"/>',
  // class icons
  script: '<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M6 8h4.5M6 10.6h4.5M6 5.4h2"/>',
  part: '<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6"/>',
  model: '<path d="M8 2.2 13.5 5 8 7.8 2.5 5z"/><path d="m2.5 8 5.5 2.8L13.5 8M2.5 11l5.5 2.8 5.5-2.8"/>',
  folder: '<path d="M2 4.2c0-.4.3-.7.7-.7h3.4l1.5 1.6h5.7c.4 0 .7.3.7.7v6.5c0 .4-.3.7-.7.7H2.7a.7.7 0 0 1-.7-.7z"/>',
  service: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6 5 5M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/>',
  gui: '<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M2 6.2h12"/>',
  light: '<path d="M6 12.5h4M6.5 14.2h3M8 1.8a4 4 0 0 0-2.3 7.3c.4.3.6.8.6 1.3v.6h3.4v-.6c0-.5.2-1 .6-1.3A4 4 0 0 0 8 1.8z"/>',
  sound: '<path d="M2.5 6h2.3L8.5 3v10L4.8 10H2.5z"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.7 4a5.6 5.6 0 0 1 0 8"/>',
  person: '<circle cx="8" cy="5" r="2.6"/><path d="M3 14c.5-3 2.6-4.6 5-4.6s4.5 1.6 5 4.6"/>',
  terrain: '<path d="M1.5 13 6 6l2.6 3.6L10.6 7l3.9 6z"/>',
  link: '<path d="M6.8 9.2 9.2 6.8"/><path d="M7.4 4.8 8.6 3.6a2.6 2.6 0 0 1 3.8 3.8l-1.2 1.2M8.6 11.2l-1.2 1.2a2.6 2.6 0 0 1-3.8-3.8l1.2-1.2"/>',
  image: '<rect x="2.2" y="3" width="11.6" height="10" rx="1.6"/><circle cx="6" cy="6.6" r="1.2"/><path d="m2.5 12 3.8-3.6 2.6 2.4 1.8-1.6 3 2.6"/>',
  value: '<path d="M3 5h10M3 8h10M3 11h6"/>',
  spark: '<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2"/>',
  dot: '<circle cx="8" cy="8" r="2.4" fill="currentColor"/>',
};

function icon(name, cls = "") {
  return `<svg class="ico ${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;
}

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`sr.${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sr.${key}`, JSON.stringify(value));
    } catch { /* storage unavailable: settings just won't persist */ }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = {};
  if (method !== "GET") headers["X-Studio-Remote"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new HttpError(0, "Can't reach Studio Remote's local server. Is studio_web.py still running?");
  }
  const type = res.headers.get("Content-Type") || "";
  const data = type.includes("application/json") ? await res.json().catch(() => null) : await res.blob();
  if (!res.ok) throw new HttpError(res.status, (data && data.error) || `HTTP ${res.status}`);
  return data;
}
const api = { get: (path) => request("GET", path), post: (path, body = {}) => request("POST", path, body) };

const fmtMoney = (n, digits = 2) => (n == null || Number.isNaN(Number(n)) ? "—" : `$${Number(n).toFixed(digits)}`);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s % 60}s`;
}
function fmtAgo(ms) {
  if (!ms) return "never";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 3 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function tryJson(text) {
  if (typeof text !== "string") return undefined;
  const t = text.trim();
  if (!t || !"[{".includes(t[0])) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** JSON in a tool reply, even when some prose surrounds it. */
function extractJson(text) {
  const direct = tryJson(text);
  if (direct !== undefined || typeof text !== "string") return direct;
  const starts = ["[", "{"].map((c) => [c, text.indexOf(c)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  for (const [open, start] of starts) {
    const end = text.lastIndexOf(open === "[" ? "]" : "}");
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch { /* try the other bracket */ }
    }
  }
  return undefined;
}

const textOf = (result) => (result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
const imagesOf = (result) =>
  (result?.content || []).filter((c) => c.type === "image" && c.data).map((c) => `data:${c.mimeType || "image/png"};base64,${c.data}`);

function luaString(value) {
  const escapes = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  return `"${String(value).replace(/[\\"\n\r\t\x00-\x1f]/g, (c) => escapes[c] ?? `\\${String(c.charCodeAt(0)).padStart(3, "0")}`)}"`;
}
const stripGame = (path) => String(path).replace(/^game\./, "");
const parentOf = (path) => (path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "");
const depthOf = (path) => path.split(".").length - 1;
const isScriptClass = (cls) => /^(Script|LocalScript|ModuleScript)$/.test(cls || "");

function parseVector(raw) {
  if (Array.isArray(raw) && raw.length >= 3 && raw.every((n) => typeof n === "number")) return raw.slice(0, 3);
  if (raw && typeof raw === "object" && ["X", "Y", "Z"].every((k) => typeof raw[k] === "number")) return [raw.X, raw.Y, raw.Z];
  if (typeof raw !== "string") return null;
  const nums = raw.split(",").map((n) => Number(n.trim()));
  return nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite) ? nums.slice(0, 3) : null;
}

async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = el("textarea", { style: { position: "fixed", opacity: "0" } });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast(label, "success", { timeout: 1600 });
}

async function withBusy(button, fn) {
  if (!button) return fn();
  button.classList.add("busy");
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.classList.remove("busy");
    button.disabled = false;
  }
}

function every(interval, fn) {
  let timer = null;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (!document.hidden) {
      try {
        await fn();
      } catch (err) {
        console.warn(err);
      }
    }
    if (!stopped) timer = setTimeout(tick, typeof interval === "function" ? interval() : interval);
  };
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/* ═══════════════════════════ UI primitives ═══════════════════════════ */

function toast(message, kind = "info", { timeout = 4500, action } = {}) {
  const node = el("div", { class: `toast toast-${kind}`, role: kind === "error" ? "alert" : "status" }, el("div", { class: "toast-msg" }, message));
  const dismiss = () => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 220);
  };
  if (action) node.append(el("button", { class: "btn btn-sm", type: "button", onclick: () => { action.run(); dismiss(); } }, action.label));
  node.append(el("button", { class: "icon-btn", type: "button", "aria-label": "Dismiss", html: icon("close"), onclick: dismiss }));
  $("#toasts").append(node);
  requestAnimationFrame(() => node.classList.add("show"));
  if (timeout) setTimeout(dismiss, timeout);
  const all = $$("#toasts .toast");
  if (all.length > 4) all[0].remove();
}

/** A modal dialog. Resolves true/false, or an object of field values (null when cancelled). */
function dialog({ title, body, confirm = "OK", cancel = "Cancel", danger = false, fields = null }) {
  return new Promise((resolve) => {
    const root = $("#modal");
    const inputs = (fields || []).map((field) => {
      const input = field.options
        ? el("select", { class: "input" }, field.options.map((o) => el("option", { value: o, selected: o === field.value }, o)))
        : el("input", { class: "input mono", placeholder: field.placeholder || "", value: field.value || "", spellcheck: "false", autocomplete: "off" });
      return { field, input };
    });
    const cancelValue = fields ? null : false;
    const okButton = el("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, type: "button" }, confirm);
    const cancelButton = el("button", { class: "btn", type: "button" }, cancel);
    const box = el(
      "div",
      { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("h3", {}, title),
      (Array.isArray(body) ? body : [body]).filter(Boolean).map((text) => el("p", {}, text)),
      inputs.length
        ? el("div", { class: "form" }, inputs.map(({ field, input }) =>
            el("label", { class: "field" }, el("span", { class: "field-name" }, field.label), input, field.help ? el("span", { class: "field-help" }, field.help) : null)))
        : null,
      el("div", { class: "modal-actions" }, cancelButton, okButton),
    );
    const finish = (value) => {
      root.hidden = true;
      root.replaceChildren();
      root.onmousedown = null;
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const submit = () => finish(inputs.length ? Object.fromEntries(inputs.map(({ field, input }) => [field.name, input.value.trim()])) : true);
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(cancelValue);
      } else if (event.key === "Enter" && event.target.tagName !== "TEXTAREA" && event.target.tagName !== "BUTTON") {
        event.preventDefault();
        submit();
      }
    };
    okButton.addEventListener("click", submit);
    cancelButton.addEventListener("click", () => finish(cancelValue));
    root.onmousedown = (event) => {
      if (event.target === root) finish(cancelValue);
    };
    root.replaceChildren(box);
    root.hidden = false;
    document.addEventListener("keydown", onKey, true);
    (inputs[0]?.input || okButton).focus();
  });
}

function skeletonRows(count = 6) {
  return el("div", { class: "skeleton-rows" }, Array.from({ length: count }, (_, i) =>
    el("div", { class: "skeleton", style: { width: `${55 + ((i * 37) % 40)}%` } })));
}

function errorBox(message, retry) {
  return el("div", { class: "error-box" }, el("div", {}, message), retry ? el("button", { class: "btn btn-sm", type: "button", onclick: retry }, "Try again") : null);
}

function emptyState(iconName, title, text) {
  return el("div", { class: "empty-state" }, el("div", { class: "big-icon", html: icon(iconName) }), el("strong", {}, title), text ? el("span", { class: "muted" }, text) : null);
}

/** JSON pretty-printed with syntax colours, built from text nodes only. */
function jsonView(value) {
  const text = JSON.stringify(value, null, 2) ?? String(value);
  const pre = el("pre", { class: "json" });
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    pre.append(text.slice(last, match.index));
    const [token, str, colon, bool, nul, num] = match;
    if (str) {
      pre.append(el("span", { class: colon ? "k" : "s" }, str));
      if (colon) pre.append(colon);
    } else if (bool) pre.append(el("span", { class: "b" }, bool));
    else if (nul) pre.append(el("span", { class: "z" }, nul));
    else if (num) pre.append(el("span", { class: "n" }, num));
    else pre.append(token);
    last = match.index + token.length;
  }
  pre.append(text.slice(last));
  return pre;
}

/** Renders an MCP tool result: text (pretty JSON when it is JSON), images and resources. */
function renderResultBody(result) {
  const body = el("div", { class: "result-body" });
  const content = result?.content || [];
  if (!content.length) body.append(el("pre", { class: "muted" }, "(empty result)"));
  for (const item of content) {
    if (item.type === "text") {
      const data = tryJson(item.text);
      body.append(data !== undefined ? jsonView(data) : el("pre", {}, item.text));
    } else if (item.type === "image" && item.data) {
      body.append(el("img", { src: `data:${item.mimeType || "image/png"};base64,${item.data}`, alt: "Tool image" }));
    } else {
      body.append(jsonView(item.resource || item));
    }
  }
  if (result?.structuredContent && !content.length) body.append(jsonView(result.structuredContent));
  return body;
}

/** A code editor: CodeMirror when it loaded, otherwise a plain textarea. */
function createEditor(host, { value = "", readOnly = false, onRun, onSave, onChange } = {}) {
  const keys = {};
  if (onRun) keys["Ctrl-Enter"] = keys["Cmd-Enter"] = () => onRun();
  if (onSave) keys["Ctrl-S"] = keys["Cmd-S"] = () => onSave();
  if (window.CodeMirror) {
    const cm = window.CodeMirror(host, {
      value,
      mode: "lua",
      theme: "studio",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      readOnly,
      extraKeys: {
        ...keys,
        Tab: (editor) => (editor.somethingSelected() ? editor.indentSelection("add") : editor.replaceSelection("\t")),
        "Shift-Tab": (editor) => editor.indentSelection("subtract"),
      },
    });
    if (onChange) cm.on("change", () => onChange(cm.getValue()));
    return {
      getValue: () => cm.getValue(),
      setValue(text) {
        cm.setValue(text);
        cm.clearHistory();
      },
      setReadOnly(flag) {
        cm.setOption("readOnly", flag);
        cm.getWrapperElement().classList.toggle("CodeMirror-readonly", Boolean(flag));
      },
      focus: () => cm.focus(),
      refresh: () => cm.refresh(),
      jumpTo(line) {
        const at = { line: Math.max(0, line - 1), ch: 0 };
        cm.setCursor(at);
        cm.scrollIntoView(at, 120);
        cm.addLineClass(at.line, "background", "cm-flash");
        setTimeout(() => cm.removeLineClass(at.line, "background", "cm-flash"), 1800);
      },
    };
  }
  const area = el("textarea", { class: "editor-fallback", spellcheck: "false" });
  area.value = value;
  area.readOnly = readOnly;
  host.append(area);
  area.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === "Enter" && onRun) {
      event.preventDefault();
      onRun();
    } else if (mod && event.key.toLowerCase() === "s" && onSave) {
      event.preventDefault();
      onSave();
    } else if (event.key === "Tab") {
      event.preventDefault();
      area.setRangeText("\t", area.selectionStart, area.selectionEnd, "end");
    }
  });
  if (onChange) area.addEventListener("input", () => onChange(area.value));
  return {
    getValue: () => area.value,
    setValue: (text) => { area.value = text; },
    setReadOnly: (flag) => { area.readOnly = flag; },
    focus: () => area.focus(),
    refresh() {},
    jumpTo(line) {
      const lines = area.value.split("\n");
      const offset = lines.slice(0, Math.max(0, line - 1)).join("\n").length;
      area.focus();
      area.setSelectionRange(offset, offset);
    },
  };
}

/* ═══════════════════════════ class icons ═══════════════════════════ */

const SERVICES = new Set([
  "Workspace", "Players", "Lighting", "MaterialService", "ReplicatedFirst", "ReplicatedStorage", "ServerScriptService",
  "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Teams", "SoundService", "TextChatService", "Chat",
  "LocalizationService", "TestService", "VoiceChatService", "StarterPlayerScripts", "StarterCharacterScripts",
]);
const CLASS_STYLES = [
  [(c) => c === "Script", "script", "#3fb950"],
  [(c) => c === "LocalScript", "script", "#4c9dff"],
  [(c) => c === "ModuleScript", "script", "#b083f0"],
  [(c) => SERVICES.has(c) || /Service$/.test(c), "service", "#8ea6d8"],
  [(c) => c === "Terrain", "terrain", "#4ade80"],
  [(c) => /Part$|^(MeshPart|UnionOperation|NegateOperation|IntersectOperation|Seat|VehicleSeat|SpawnLocation)$/.test(c), "part", "#f0954a"],
  [(c) => /^(Model|Actor|WorldModel)$/.test(c), "model", "#e3b341"],
  [(c) => /^(Folder|Configuration)$/.test(c), "folder", "#d6b25c"],
  [(c) => /Gui$|^(Frame|ScrollingFrame|CanvasGroup|TextLabel|TextButton|TextBox|ImageLabel|ImageButton|ViewportFrame|VideoFrame)$|^UI/.test(c), "gui", "#2ec4b6"],
  [(c) => /Light$/.test(c), "light", "#f6d365"],
  [(c) => /^Sound/.test(c), "sound", "#f472b6"],
  [(c) => c === "Camera", "camera", "#38bdf8"],
  [(c) => /^(Remote|Bindable|Unreliable)(Event|Function)$/.test(c), "bolt", "#f87171"],
  [(c) => /Value$/.test(c), "value", "#94a3b8"],
  [(c) => /^(Humanoid|Player|HumanoidDescription)$/.test(c), "person", "#86efac"],
  [(c) => /Constraint$|^(Weld|WeldConstraint|Motor6D|Attachment|Bone)$/.test(c), "link", "#a5b4fc"],
  [(c) => /^(Decal|Texture|SurfaceAppearance|MaterialVariant|Sky)$/.test(c), "image", "#fb923c"],
  [(c) => /Emitter$|^(Beam|Trail|Fire|Smoke|Sparkles|Explosion|Highlight)$/.test(c), "spark", "#fbbf24"],
  [(c) => /^(Animation|Animator|AnimationController|KeyframeSequence)$/.test(c), "play", "#c4b5fd"],
  [(c) => /^(Tool|HopperBin)$/.test(c), "wrench", "#fdba74"],
];

function classIcon(className) {
  const match = CLASS_STYLES.find(([test]) => test(className || ""));
  const [, name, color] = match || [null, "dot", "#7b859a"];
  return el("span", { class: "cls-icon", style: { "--c": color }, html: icon(name) });
}

/* ═══════════════════════════ state & routing ═══════════════════════════ */

const S = {
  overview: null,
  overviewError: null,
  view: "loading",
  studios: [],
  studioId: store.get("studioId", null),
  studiosRaw: "",
  studiosCheckedAt: 0,
  mcpError: null,
  studioFailures: 0,
  studio: { playing: false, types: ["Edit"], raw: "" },
  job: { id: null, lines: [], total: 0, next: 0, summary: null },
  dismissedJob: store.get("dismissedJob", null),
  showJob: false,
  centerTab: store.get("centerTab", "viewport"),
};

const jobRunning = () => S.overview?.job?.status === "running";
const mcpAvailable = () => Boolean(S.overview && (S.overview.mcp_ready || S.overview.mcp_override));

function computeView() {
  const o = S.overview;
  if (!o) return "loading";
  const job = o.job;
  if (job && (job.status === "running" || S.showJob || (job.status !== "done" && job.id !== S.dismissedJob))) return "job";
  if (!o.mcp_override) {
    if (!o.instance) return "rent";
    if (o.instance.status !== "running") return "starting";
    if (!o.mcp_ready) return "setup";
  }
  return S.studios.length ? "ide" : "connect";
}

const VIEWS = {
  rent: { enter: () => rent.loaded || rent.load(), render: () => rent.render() },
  job: { render: () => jobView.render() },
  starting: { render: () => renderStarting() },
  connect: { enter: () => connect.enter(), leave: () => connect.leave(), render: () => connect.render() },
  ide: { enter: () => ide.enter(), leave: () => ide.leave() },
};

function updateView() {
  const next = computeView();
  if (next !== S.view) {
    VIEWS[S.view]?.leave?.();
    S.view = next;
    for (const view of $$(".view")) view.classList.toggle("active", view.id === `view-${next}`);
    VIEWS[next]?.enter?.();
    renderTopbar();
  }
  VIEWS[next]?.render?.();
}

async function refreshOverview() {
  try {
    S.overview = await api.get("/api/overview");
    if (S.overviewError) toast("Reconnected to the local server", "success", { timeout: 2000 });
    S.overviewError = null;
  } catch (err) {
    if (!S.overviewError) toast(err.message, "error", { timeout: 8000 });
    S.overviewError = err;
  }
  await syncJob();
  renderTopbar();
  if (drawer.isOpen()) renderDrawer();
  updateView();
}

async function syncJob() {
  const summary = S.overview?.job;
  if (!summary) return;
  if (summary.id !== S.job.id) S.job = { id: summary.id, lines: [], total: 0, next: 0, summary: null };
  const previous = S.job.summary?.status;
  if (summary.lines > S.job.next || summary.status !== previous) {
    try {
      const { job } = await api.get(`/api/jobs/current?since=${S.job.next}`);
      if (job && job.id === S.job.id) {
        if (job.from > S.job.next) addJobLines([`… ${job.from - S.job.next} earlier lines not shown …`]);
        addJobLines(job.new_lines);
        S.job.next = job.next;
        S.job.summary = job;
      }
    } catch (err) {
      console.warn(err);
    }
  }
  const status = S.job.summary?.status;
  if (previous === "running" && status && status !== "running") onJobFinished(S.job.summary);
}

function addJobLines(lines) {
  S.job.lines.push(...lines);
  S.job.total += lines.length;
  if (S.job.lines.length > 4000) S.job.lines.splice(0, S.job.lines.length - 4000);
}

function onJobFinished(job) {
  if (job.status === "done") {
    toast(`${job.title}: done`, "success");
    S.showJob = false;
    tools.reset();
    S.studioFailures = 0;
    pollStudios();
  } else if (job.status === "failed") {
    toast(`${job.title} failed. The log shows why.`, "error", { timeout: 9000 });
  } else {
    toast(`${job.title} was stopped`, "warn");
  }
}

async function startJob(body, { confirmText } = {}) {
  try {
    await api.post("/api/jobs", body);
    S.showJob = true;
    S.dismissedJob = null;
    if (confirmText) toast(confirmText, "info", { timeout: 2500 });
    drawer.close();
    await refreshOverview();
  } catch (err) {
    toast(err.message, "error");
  }
}

const runSetup = (phase) => startJob({ action: "setup", phase });

async function destroyMachine() {
  const inst = S.overview?.instance;
  const ok = await dialog({
    title: "Destroy this machine?",
    body: [
      `Instance ${inst ? `#${inst.id} (${inst.gpu})` : ""} and everything on its disk are deleted, including your Studio sign-in and any place you haven't published or saved elsewhere.`,
      "Billing stops right away.",
    ],
    confirm: "Destroy machine",
    danger: true,
  });
  if (ok) startJob({ action: "down" });
}

async function refreshConnection(button) {
  await withBusy(button, async () => {
    try {
      await api.post("/api/connection/refresh");
      toast("Connection details refreshed", "success");
      await refreshOverview();
      pollStudios();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function desktopUrl() {
  return S.overview?.instance?.status === "running" ? S.overview?.urls?.desktop_url : null;
}

function openDesktop() {
  const url = desktopUrl();
  if (url) window.open(url, "_blank", "noopener");
  else toast("The desktop is available once a machine is running and set up.", "warn");
}

/* ═══════════════════════════ top bar & drawer ═══════════════════════════ */

function costLine(inst) {
  if (!inst?.start_date) return "";
  const seconds = Date.now() / 1000 - inst.start_date;
  return `${fmtDuration(seconds)} · ${fmtMoney((inst.dph * seconds) / 3600)}`;
}

function machineStatus() {
  const o = S.overview;
  if (!o) return { dot: S.overviewError ? "error" : "none", main: S.overviewError ? "Local server offline" : "Connecting…", sub: "" };
  const inst = o.instance;
  if (o.job?.status === "running") return { dot: "busy", main: o.job.title, sub: inst ? inst.gpu : "" };
  if (!inst) {
    return {
      dot: o.mcp_override ? "running" : "none",
      main: o.mcp_override ? "Custom MCP endpoint" : "No machine",
      sub: o.credit != null ? `${fmtMoney(o.credit)} credit` : "",
    };
  }
  const running = inst.status === "running";
  return { dot: running ? "running" : "busy", main: `${inst.gpu} · ${fmtMoney(inst.dph, 3)}/hr`, sub: running ? costLine(inst) : capitalize(inst.status) };
}

function renderTopbar() {
  const status = machineStatus();
  $("#pill-dot").dataset.status = status.dot;
  $("#pill-main").textContent = status.main;
  $("#pill-sub").textContent = status.sub;
  $("#btn-desktop").hidden = !desktopUrl();
  $("#studio-controls").hidden = S.view !== "ide";
  renderStudioControls();
}

function renderStudioControls() {
  const select = $("#studio-select");
  const current = [...select.options].map((o) => `${o.value}:${o.textContent}`).join("|");
  const wanted = S.studios.map((s) => `${s.id}:${s.name}`).join("|");
  if (current !== wanted) select.replaceChildren(...S.studios.map((s) => el("option", { value: s.id }, s.name)));
  if (S.studioId) select.value = S.studioId;
  const playing = S.studio.playing;
  const badge = $("#mode-badge");
  badge.dataset.mode = playing ? "play" : "edit";
  badge.textContent = playing ? "Playing" : "Edit";
  $("#btn-play").disabled = playing;
  $("#btn-stop").disabled = !playing;
}

const drawer = {
  isOpen: () => $("#drawer").classList.contains("open"),
  open() {
    renderDrawer(true);
    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#scrim").hidden = false;
  },
  close() {
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#scrim").hidden = true;
  },
};

function drawerSection(title, ...content) {
  return el("section", { class: "drawer-section" }, el("h3", {}, title), ...content);
}

function stat(label, value, { id, wide } = {}) {
  return el("div", { class: `stat${wide ? " wide" : ""}` }, el("span", {}, label), el("strong", { id, title: String(value ?? "") }, value ?? "—"));
}

function codeBlock(text, label = "Copied") {
  return el("div", { class: "codeblock" }, el("pre", {}, text),
    el("button", { class: "icon-btn", type: "button", title: "Copy", "aria-label": "Copy", html: icon("copy"), onclick: () => copyText(text, label) }));
}

function actionButton(iconName, label, onclick, { extra = "", needsIdle = false } = {}) {
  return el("button", { class: `btn ${extra}`, type: "button", disabled: needsIdle && jobRunning(), onclick },
    el("span", { html: icon(iconName), style: { display: "contents" } }), label);
}

let drawerSignature = "";

function renderDrawer(force = false) {
  const o = S.overview || {};
  const inst = o.instance;
  const urls = o.urls;
  // Re-render only when something visible changed, so a click isn't lost to a refresh.
  const signature = JSON.stringify([inst?.id, inst?.status, o.credit, urls?.mcp_url, S.job.summary?.id, S.job.summary?.status, jobRunning(), o.mcp_override, o.auto_signin]);
  if (!force && signature === drawerSignature) return;
  drawerSignature = signature;
  const sections = [];

  if (inst) {
    const hoursLeft = o.credit != null && inst.dph ? o.credit / inst.dph : null;
    sections.push(drawerSection("This machine",
      el("div", { class: "stat-grid" },
        stat("Status", capitalize(inst.status)),
        stat("Price", `${fmtMoney(inst.dph, 3)}/hr`),
        stat("Running for", inst.start_date ? fmtDuration(Date.now() / 1000 - inst.start_date) : "—", { id: "drawer-uptime" }),
        stat("Spent so far", inst.start_date ? fmtMoney((inst.dph * (Date.now() / 1000 - inst.start_date)) / 3600) : "—", { id: "drawer-spent" }),
        stat("GPU", inst.gpu),
        stat("vCPU · RAM", `${inst.vcpus} · ${inst.ram_gb} GB`),
        stat("CPU", `${inst.cpu || "Unknown"}${inst.cpu_score ? `  (speed ~${inst.cpu_score})` : ""}`, { wide: true }),
        stat("Location", inst.location || "—"),
        stat("Instance", `#${inst.id}`),
        stat("Studio sign-in", o.auto_signin ? `Automatic, as ${o.auto_signin}` : "By hand (no login in .env)", { wide: true }),
        stat("Credit left", o.credit != null ? `${fmtMoney(o.credit)}${hoursLeft ? ` · ~${Math.floor(hoursLeft)} h` : ""}` : "—", { wide: true }),
      )));
    const actions = el("div", { class: "action-list" });
    if (desktopUrl()) actions.append(actionButton("external", "Open the desktop", openDesktop, { extra: "btn-primary" }));
    if (inst.status === "running" && urls?.portal_url) actions.append(actionButton("globe", "Open Vast's instance portal", () => window.open(urls.portal_url, "_blank", "noopener")));
    if (inst.ssh) actions.append(actionButton("key", "Copy the SSH command", () => copyText(inst.ssh, "SSH command copied")));
    if (inst.status === "running") {
      actions.append(...[
        actionButton("play", "Relaunch Roblox Studio", () => runSetup("launch"), { needsIdle: true }),
        o.auto_signin ? actionButton("person", `Sign in again as ${o.auto_signin} (restarts Studio)`, () => runSetup("signin"), { needsIdle: true }) : null,
        actionButton("wrench", "Repair the MCP bridge", () => runSetup("bridge"), { needsIdle: true }),
        actionButton("bolt", "Run the full setup again", () => runSetup("all"), { needsIdle: true }),
        actionButton("refresh", "Refresh connection details", (event) => refreshConnection(event.currentTarget), { needsIdle: true }),
      ].filter(Boolean));
    }
    actions.append(actionButton("trash", "Destroy machine", destroyMachine, { extra: "btn-danger", needsIdle: true }));
    sections.push(drawerSection("Actions", actions));
  } else {
    sections.push(drawerSection("This machine",
      el("p", {}, o.mcp_override ? "Using a custom MCP endpoint (--mcp-url); no machine is recorded." : "No machine is running."),
      o.credit != null ? el("div", { class: "stat-grid" }, stat("Vast credit", fmtMoney(o.credit), { wide: true })) : null));
  }

  if (urls?.mcp_url && inst) {
    const claude = `claude mcp add --transport http roblox-studio-vast ${urls.mcp_url} --header "Authorization: Bearer ${urls.token}"`;
    const json = JSON.stringify({ mcpServers: { "roblox-studio-vast": { type: "http", url: urls.mcp_url, headers: { Authorization: `Bearer ${urls.token}` } } } }, null, 2);
    sections.push(drawerSection("Connect an MCP client",
      el("p", {}, "Let an AI client drive Studio too. Claude Code:"),
      codeBlock(claude, "Command copied"),
      el("p", { style: { marginTop: "10px" } }, "Clients with a JSON config (Cursor, VS Code, your NanoGPT chat app):"),
      codeBlock(json, "Config copied"),
      el("p", { style: { marginTop: "10px" } }, "This port is plain HTTP. For an encrypted link, run “python roblox_studio_vast.py tunnel” and use http://127.0.0.1:8765/mcp without a token.")));
  }

  const job = S.job.summary;
  if (job) {
    const chip = { running: "", done: "ok", failed: "err", stopped: "warn" }[job.status] || "";
    sections.push(drawerSection("Last operation",
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" } },
        el("div", {}, el("strong", {}, job.title), el("div", { class: "muted small" }, `${fmtTime(job.started * 1000)}${job.ended ? ` · took ${fmtDuration(job.ended - job.started)}` : ""}`)),
        el("span", { class: `chip ${chip}` }, capitalize(job.status))),
      el("button", { class: "btn btn-sm", type: "button", style: { marginTop: "10px" }, onclick: () => { S.showJob = true; drawer.close(); updateView(); } }, "Show the log")));
  }
  $("#drawer-body").replaceChildren(...sections);
}

/* ═══════════════════════════ rent ═══════════════════════════ */

function shortCpu(name) {
  return (name || "Unknown CPU")
    .replace(/^\d+(st|nd|rd|th) Gen\s+/i, "")
    .replace(/\b(AMD|Intel\(R\)|Intel)\s+/gi, "")
    .replace(/\s+(\d+-Core(s)?( Processor)?|Processor|with Radeon Graphics|CPU @.*)$/gi, "")
    .replace(/\s+\d+-Cores?$/i, "")
    .trim();
}

function speedBar(score) {
  const pct = score ? clamp(((score - 1500) / (5000 - 1500)) * 100, 6, 100) : 0;
  return el("div", { class: "speed-bar", title: score ? `Single-thread speed ~${score}` : "Unknown CPU" }, el("i", { style: { width: `${pct}%` } }));
}

const rent = {
  loaded: false,
  loading: false,
  offers: [],
  count: 0,
  error: null,
  seq: 0,
  params() {
    return { max_price: $("#f-price").value || "0.6", min_cpu_score: $("#f-cpu").value, gpu: $("#f-gpu").value.trim() };
  },
  async load() {
    const seq = ++this.seq;
    this.loading = true;
    this.error = null;
    this.render();
    try {
      const p = this.params();
      const query = new URLSearchParams({ max_price: p.max_price, min_cpu_score: p.min_cpu_score });
      if (p.gpu) query.set("gpu", p.gpu);
      const res = await api.get(`/api/offers?${query}`);
      if (seq !== this.seq) return;
      this.offers = res.offers;
      this.count = res.count;
    } catch (err) {
      if (seq !== this.seq) return;
      this.error = err.message;
      this.offers = [];
    }
    this.loading = false;
    this.loaded = true;
    this.render();
  },
  /** Called on every status refresh: only the table is rebuilt, and only when its data changed. */
  render() {
    const o = S.overview;
    $("#rent-credit").textContent = fmtMoney(o?.credit);
    const note = $("#rent-note");
    const notes = [];
    if (o?.gone) notes.push(`Your last machine (#${o.instance_id}) no longer exists, so a new one is needed.`);
    if (o?.error) notes.push(`Vast.ai: ${o.error}`);
    note.hidden = !notes.length;
    note.textContent = notes.join(" ");
    const signature = JSON.stringify([this.loading, this.error, this.offers.map((x) => [x.id, x.dph]), jobRunning()]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderTable();
    }
    $("#rent-best").disabled = !this.offers.length || jobRunning();
  },
  renderTable() {
    const box = $("#offers");
    if (this.loading && !this.offers.length) box.replaceChildren(skeletonRows(5));
    else if (this.error) box.replaceChildren(errorBox(this.error, () => this.load()));
    else if (!this.offers.length) {
      box.replaceChildren(emptyState("search", "No machines match", "Raise the max price, pick a lower CPU tier, or clear the GPU filter."));
    } else {
      const rows = this.offers.map((offer, i) =>
        el("tr", { class: i === 0 ? "best" : "" },
          el("td", {},
            el("div", { class: "cell-main" }, offer.gpu, i === 0 ? el("span", { class: "tag", style: { marginLeft: "8px" } }, "Best value") : null),
            el("div", { class: "cell-sub" }, `${offer.vcpus} vCPU · ${offer.ram_gb} GB RAM`)),
          el("td", {},
            el("div", { class: "speed" }, speedBar(offer.cpu_score),
              el("div", {}, el("div", { class: "cell-main" }, shortCpu(offer.cpu)), el("div", { class: "cell-sub" }, `speed ~${offer.cpu_score ?? "?"}`)))),
          el("td", {},
            el("div", {}, offer.location || "—"),
            el("div", { class: "cell-sub" }, `${offer.net_down} Mbps · ${((offer.reliability || 0) * 100).toFixed(1)}% uptime`)),
          el("td", { class: "num" }, el("div", { class: "price" }, fmtMoney(offer.dph, 3)), el("div", { class: "cell-sub" }, "per hour")),
          el("td", { class: "num" }, el("button", { class: "btn btn-sm", type: "button", disabled: jobRunning(), onclick: () => startRent(offer) }, "Rent")),
        ));
      box.replaceChildren(el("table", { class: "grid" },
        el("thead", {}, el("tr", {}, el("th", {}, "GPU"), el("th", {}, "CPU"), el("th", {}, "Where"), el("th", { class: "num" }, "Price"), el("th", {}))),
        el("tbody", {}, rows)));
      if (this.count > this.offers.length) box.append(el("div", { class: "muted small", style: { padding: "8px 14px" } }, `Showing the ${this.offers.length} cheapest of ${this.count}.`));
    }
  },
};

async function startRent(offer) {
  const target = offer || rent.offers[0];
  if (!target) return;
  const p = rent.params();
  const ok = await dialog({
    title: offer ? `Rent this ${offer.gpu}?` : "Rent the cheapest machine?",
    body: [
      `${target.gpu} with ${shortCpu(target.cpu)}, ${target.vcpus} vCPU and ${target.ram_gb} GB RAM in ${target.location || "an unknown location"}: ${fmtMoney(target.dph, 3)}/hr.`,
      "Billing starts when the machine is created and runs until you destroy it. Setup takes about 10 minutes.",
      offer ? null : "If a machine doesn't work out, it's destroyed and the next cheapest one is tried.",
    ],
    confirm: "Rent and set up",
  });
  if (!ok) return;
  await startJob({
    action: "up",
    offer_id: offer ? offer.id : undefined,
    max_price: Number(p.max_price),
    min_cpu_score: Number(p.min_cpu_score),
    gpu: p.gpu || undefined,
  });
}

/* ═══════════════════════════ job view ═══════════════════════════ */

const STAGES = [
  { label: "Find and rent a machine", hint: "Cheapest machine with a fast CPU", re: /^(Vast account credit|offer \d+:)/ },
  { label: "Boot and connect", hint: "Download the desktop image and check its public ports", re: /^Created instance \d+/ },
  { label: "Check the machine", hint: "Linux kernel, GPU and Vulkan", re: /^==> (Checking the machine|Waiting for the KDE desktop)/ },
  { label: "Install TuxBlox", hint: "Your fork's latest release from GitHub", re: /^==> (Looking up TuxBlox|Installing TuxBlox|TuxBlox .*already installed)/ },
  { label: "Launch Roblox Studio", hint: "The first start downloads Studio", re: /^==> (Setting up automatic Studio sign-in|Restarting Roblox Studio|Starting Roblox Studio|Roblox Studio is already running|Waiting for Roblox Studio)/ },
  { label: "Start the MCP bridge", hint: "Publishes Studio's MCP server with token auth", re: /^==> (Installing mcp-proxy|Configuring the MCP bridge|Waiting for the MCP bridge)/ },
  { label: "Ready", hint: "Sign in to Studio on the desktop", re: /^Desktop \(browser\):/ },
];
const PHASE_RANGE = { all: [2, 6], check: [2, 2], install: [3, 3], launch: [4, 4], signin: [4, 4], bridge: [5, 6] };

function jobStages(job) {
  const summary = job.summary;
  const [first, last] = summary.action === "up" ? [0, 6] : PHASE_RANGE[summary.phase] || [2, 6];
  let stage = first;
  const notes = [];
  for (const line of job.lines) {
    const failed = line.match(/^Machine (\S+) did not work: (.*)$/);
    if (failed) {
      notes.push(`Machine ${failed[1]} didn't work: ${failed[2]} It was destroyed and the next one is being tried.`);
      stage = first;
      continue;
    }
    for (let i = last; i > stage; i--) {
      if (STAGES[i].re.test(line)) {
        stage = i;
        break;
      }
    }
  }
  return { first, last, stage, notes };
}

function lineClass(line) {
  if (/^==> /.test(line)) return "t-head";
  if (/\b(ERROR|Error|did not work|failed|Traceback)\b/.test(line)) return "t-err";
  if (/^WARNING|\bwarning\b/i.test(line)) return "t-warn";
  if (/^(Desktop \(browser\)|MCP \(|Roblox Studio is running|MCP bridge is answering|Created instance|Destroyed)/.test(line)) return "t-ok";
  if (/^\s+(still waiting|loading|running)/.test(line)) return "t-dim";
  return "";
}

const jobView = {
  renderedId: null,
  rendered: 0,
  render() {
    const job = S.job;
    const summary = job.summary;
    if (!summary) return;
    const running = summary.status === "running";
    $("#job-title").textContent = summary.title;
    const elapsed = (summary.ended || Date.now() / 1000) - summary.started;
    $("#job-meta").textContent = `Started ${fmtTime(summary.started * 1000)} · ${fmtDuration(elapsed)}${running ? " so far" : ""}`;
    const chip = $("#job-status");
    chip.className = `chip ${{ running: "", done: "ok", failed: "err", stopped: "warn" }[summary.status] || ""}`;
    const label = { running: "Running", done: "Done", failed: "Failed", stopped: "Stopped" }[summary.status] || summary.status;
    chip.replaceChildren(...(running ? [el("span", { class: "spinner sm" }), label] : [label]));

    const steps = $("#job-steps");
    const notes = $("#job-notes");
    if (summary.action === "down") {
      steps.replaceChildren();
      notes.replaceChildren();
    } else {
      const { first, last, stage, notes: failures } = jobStages(job);
      const items = [];
      for (let i = first; i <= last; i++) {
        let state = "todo";
        if (summary.status === "done" || i < stage) state = "done";
        else if (i === stage) state = running ? "active" : "failed";
        const bullet = el("span", { class: "bullet", html: state === "done" ? icon("check") : state === "failed" ? icon("close") : "" });
        if (state !== "done" && state !== "failed") bullet.textContent = String(i - first + 1);
        items.push(el("li", { class: `step ${state}` }, bullet, el("div", {}, el("div", { class: "step-label" }, STAGES[i].label), el("div", { class: "step-hint" }, STAGES[i].hint))));
      }
      steps.replaceChildren(...items);
      notes.replaceChildren(...failures.map((text) => el("div", { class: "note warn" }, text)));
    }

    const term = $("#job-log");
    if (this.renderedId !== job.id) {
      term.replaceChildren();
      this.renderedId = job.id;
      this.rendered = 0;
    }
    const atBottom = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
    const dropped = job.total - job.lines.length;
    const fragment = document.createDocumentFragment();
    for (let i = Math.max(this.rendered - dropped, 0); i < job.lines.length; i++) {
      const line = job.lines[i];
      fragment.append(el("div", { class: lineClass(line) }, line || " "));
    }
    term.append(fragment);
    this.rendered = job.total;
    while (term.childElementCount > 4000) term.firstChild.remove();
    if (atBottom) term.scrollTop = term.scrollHeight;

    const hasMachine = Boolean(S.overview?.instance);
    $("#job-stop").hidden = !running;
    $("#job-dismiss").hidden = running;
    $("#job-dismiss").textContent = summary.status === "done" ? "Continue" : summary.action === "up" ? "Back to machines" : "Close";
    $("#job-retry").hidden = running || summary.status === "done" || summary.action !== "setup";
    $("#job-destroy").hidden = running || !hasMachine || summary.action === "down" || summary.status === "done";
  },
};

function renderStarting() {
  const inst = S.overview?.instance;
  if (!inst) return;
  const titles = {
    loading: "The machine is starting",
    created: "The machine is being created",
    scheduling: "Waiting for the host",
    exited: "The machine has stopped",
    offline: "The machine's host is offline",
  };
  $("#starting-title").textContent = titles[inst.status] || `The machine is ${inst.status}`;
  $("#starting-msg").textContent = inst.message || "This page updates by itself.";
}

/* ═══════════════════════════ connect view ═══════════════════════════ */

const connect = {
  stop: null,
  busy: false,
  url: null,
  enter() {
    this.stop?.();
    this.stop = every(5000, () => ($("#shot-auto").checked ? this.shot() : null));
    setTimeout(pollStudios, 0);
  },
  leave() {
    this.stop?.();
    this.stop = null;
  },
  async shot(force = false) {
    if (this.busy && !force) return;
    if (!S.overview?.instance) {
      $("#connect-shot-empty").textContent = "The preview needs a rented machine.";
      return;
    }
    this.busy = true;
    try {
      const blob = await api.get(`/api/desktop/screenshot?ts=${Date.now()}`);
      const url = URL.createObjectURL(blob);
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = url;
      const img = $("#connect-shot-img");
      img.src = url;
      img.hidden = false;
      $("#connect-shot-empty").hidden = true;
      $("#connect-shot-meta").textContent = `Updated ${fmtTime(Date.now())} · click to open the full desktop`;
    } catch (err) {
      $("#connect-shot-meta").textContent = `Preview unavailable: ${err.message}`;
      if ($("#connect-shot-img").hidden) $("#connect-shot-empty").textContent = "No preview yet";
    } finally {
      this.busy = false;
    }
  },
  render() {
    const account = S.overview?.auto_signin;
    $("#connect-signin-title").textContent = account ? "Studio signs in by itself" : "Sign in to Roblox Studio";
    $("#connect-signin-text").textContent = account
      ? `As ${account}. Give it a minute; if Roblox shows a captcha or a check, finish it on the desktop.`
      : "Use the login window that's already open. To skip this, put ROBLOX_USERNAME and ROBLOX_PASSWORD in .env.";
    $("#connect-status").textContent = S.mcpError ? "Can't reach the MCP server" : "Waiting for Studio to connect…";
    $("#connect-substatus").textContent = S.mcpError || (S.studiosCheckedAt ? `Last checked ${fmtAgo(S.studiosCheckedAt)} · checks every 3 seconds` : "Checking now…");
    $("#connect-raw").textContent = S.studiosRaw || S.mcpError || "—";
    $("#connect-desktop").disabled = !desktopUrl();
  },
};

/* ═══════════════════════════ MCP calls & studios ═══════════════════════════ */

const tools = {
  list: null,
  map: new Map(),
  loading: null,
  reset() {
    this.list = null;
    this.map.clear();
    this.loading = null;
  },
  async load(refresh = false) {
    if (this.list && !refresh) return this.list;
    if (this.loading && !refresh) return this.loading;
    this.loading = api.get(`/api/mcp/tools${refresh ? "?refresh=1" : ""}`)
      .then((res) => {
        this.list = res.tools || [];
        this.map = new Map(this.list.map((t) => [t.name, t]));
        toolsPane.renderList();
        return this.list;
      })
      .finally(() => { this.loading = null; });
    return this.loading;
  },
};

function needsStudio(name) {
  const tool = tools.map.get(name);
  if (tool) return Boolean(tool.inputSchema?.properties?.studio_id);
  return name !== "list_roblox_studios";
}

class ToolError extends Error {
  constructor(message, result) {
    super(message);
    this.result = result;
  }
}

async function callTool(name, args = {}, { timeout, quiet = false } = {}) {
  const fullArgs = { ...args };
  if (needsStudio(name) && fullArgs.studio_id === undefined) {
    if (!S.studioId) throw new Error("No Roblox Studio is connected");
    fullArgs.studio_id = S.studioId;
  }
  const entry = activity.begin(name, fullArgs, quiet);
  let res;
  try {
    res = await api.post("/api/mcp/call", { name, arguments: fullArgs, timeout });
  } catch (err) {
    entry.fail(err);
    throw err;
  }
  entry.end(res.result, res.ms);
  if (res.result?.isError) throw new ToolError(textOf(res.result) || `${name} failed`, res.result);
  return res.result;
}

function setStudios(list) {
  const previous = S.studioId;
  S.studios = list;
  if (!list.some((s) => s.id === S.studioId)) S.studioId = (list.find((s) => s.active) || list[0])?.id || null;
  if (S.studioId) store.set("studioId", S.studioId);
  renderStudioControls();
  if (S.view === "ide" && previous && S.studioId && previous !== S.studioId) onStudioChanged();
}

async function pollStudios() {
  if (!mcpAvailable() || !["connect", "ide"].includes(computeView())) return;
  try {
    const res = await api.get("/api/mcp/studios");
    S.studiosRaw = res.raw;
    S.mcpError = null;
    S.studioFailures = 0;
    if (!res.studios.length && S.view === "ide") toast("Roblox Studio disconnected from MCP", "warn");
    setStudios(res.studios);
  } catch (err) {
    S.mcpError = err.message;
    S.studioFailures += 1;
    // One hiccup shouldn't throw you out of the editor.
    if (S.view !== "ide" || S.studioFailures >= 3) {
      if (S.view === "ide") toast(`Lost the MCP connection: ${err.message}`, "error");
      setStudios([]);
    }
  }
  S.studiosCheckedAt = Date.now();
  updateView();
}

function parseStudioState(text) {
  const data = extractJson(text);
  let types = null;
  let playing = null;
  const scan = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      const k = key.toLowerCase();
      if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string") && /type|datamodel|available/.test(k)) types = v;
      else if (typeof v === "boolean" && /play|running|testing/.test(k)) playing = v;
      else if (typeof v === "string" && /play|state|mode/.test(k)) {
        if (/edit|stopped|idle/i.test(v)) playing = false;
        else if (/play|run|test|client|server/i.test(v)) playing = true;
      } else if (v && typeof v === "object") scan(v);
    }
  };
  scan(data);
  if (!types) {
    const found = ["Edit", "Client", "Server"].filter((t) => new RegExp(`\\b${t}\\b`).test(text));
    if (found.length) types = found;
  }
  if (playing === null && types) playing = !types.includes("Edit");
  if (playing === null) playing = /\b(playing|running|play mode)\b/i.test(text) && !/\bedit mode\b/i.test(text);
  return { playing: Boolean(playing), types: types?.length ? types : ["Edit"], raw: text };
}

async function refreshStudioState() {
  if (S.view !== "ide" || !S.studioId) return;
  try {
    const result = await callTool("get_studio_state", {}, { quiet: true, timeout: 20 });
    S.studio = parseStudioState(textOf(result));
  } catch {
    return;
  }
  renderStudioControls();
  syncDatamodelSelects();
}

function syncDatamodelSelects() {
  const types = S.studio.types;
  const preferred = S.studio.playing ? (types.includes("Server") ? "Server" : types[0]) : types.includes("Edit") ? "Edit" : types[0];
  for (const id of ["#explorer-dm", "#luau-dm"]) {
    const select = $(id);
    const options = [...select.options].map((o) => o.value).join(",");
    const current = select.value;
    if (options !== types.join(",")) select.replaceChildren(...types.map((t) => el("option", { value: t }, t)));
    const next = types.includes(current) ? current : preferred;
    select.value = next;
    // Reload when the tree was (or is being) built from a data model that no longer applies.
    if (id === "#explorer-dm" && explorer.lastDm && next !== explorer.lastDm) explorer.reload();
  }
}

async function setPlaying(start) {
  const button = start ? $("#btn-play") : $("#btn-stop");
  await withBusy(button, async () => {
    try {
      await callTool("start_stop_play", { is_start: start }, { timeout: 120 });
      toast(start ? "Playtest started" : "Back in edit mode", "success", { timeout: 2200 });
    } catch (err) {
      toast(err.message, "error");
    }
  });
  setTimeout(refreshStudioState, 900);
  setTimeout(refreshStudioState, 3000);
}

function onStudioChanged() {
  explorer.expanded = new Set(store.get(`expanded:${S.studioId}`, []));
  props.clear();
  explorer.reload();
  output.reset();
  refreshStudioState();
}

/* ═══════════════════════════ IDE shell ═══════════════════════════ */

const ide = {
  initialized: false,
  stops: [],
  enter() {
    if (!this.initialized) {
      this.initialized = true;
      luau.init();
      scripts.init();
      props.clear();
    }
    tools.load().catch((err) => toast(`Couldn't load the tool list: ${err.message}`, "error"));
    explorer.expanded = new Set(store.get(`expanded:${S.studioId}`, []));
    explorer.reload();
    this.stops.push(every(4000, refreshStudioState));
    this.stops.push(every(2500, () => output.poll()));
    switchTab(S.centerTab);
  },
  leave() {
    for (const stop of this.stops) stop();
    this.stops = [];
  },
};

function switchTab(tab) {
  if (!["viewport", "luau", "script", "tools"].includes(tab)) tab = "viewport";
  S.centerTab = tab;
  store.set("centerTab", tab);
  for (const button of $$("#center-tabs [data-tab]")) button.classList.toggle("active", button.dataset.tab === tab);
  for (const panel of $$(".pane-center > .tab-panels > .tab-panel")) panel.classList.toggle("active", panel.dataset.panel === tab);
  if (tab === "luau") luau.editor?.refresh();
  if (tab === "script") scripts.editor?.refresh();
  if (tab === "tools" && !toolsPane.selected) toolsPane.renderList();
}

function initSplitters() {
  const grid = $("#ide");
  const sizes = { left: 272, right: 320, bottom: 220, ...store.get("paneSizes", {}) };
  const apply = () => {
    grid.style.setProperty("--left", `${sizes.left}px`);
    grid.style.setProperty("--right", `${sizes.right}px`);
    grid.style.setProperty("--bottom", `${sizes.bottom}px`);
  };
  apply();
  for (const bar of $$(".splitter", grid)) {
    bar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      bar.setPointerCapture(event.pointerId);
      bar.classList.add("dragging");
      const which = bar.dataset.split;
      const start = { x: event.clientX, y: event.clientY, ...sizes };
      const move = (e) => {
        if (which === "left") sizes.left = clamp(start.left + e.clientX - start.x, 180, 560);
        else if (which === "right") sizes.right = clamp(start.right - (e.clientX - start.x), 220, 620);
        else sizes.bottom = clamp(start.bottom - (e.clientY - start.y), 80, window.innerHeight * 0.7);
        apply();
      };
      const up = () => {
        bar.classList.remove("dragging");
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
        store.set("paneSizes", sizes);
        luau.editor?.refresh();
        scripts.editor?.refresh();
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
    bar.addEventListener("dblclick", () => {
      Object.assign(sizes, { left: 272, right: 320, bottom: 220 });
      apply();
      store.set("paneSizes", sizes);
    });
  }
}

/* ═══════════════════════════ explorer ═══════════════════════════ */

const explorer = {
  nodes: new Map(),
  roots: [],
  expanded: new Set(),
  selected: null,
  visible: [],
  loading: false,
  error: null,
  search: null,
  gen: 0,
  lastDm: null,
  dm: () => $("#explorer-dm").value || "Edit",
  async fetch(args) {
    this.lastDm = this.dm();
    const result = await callTool("search_game_tree", { datamodel_type: this.lastDm, ...args }, { timeout: 60 });
    const text = textOf(result);
    const data = extractJson(text);
    const items = Array.isArray(data) ? data : [data?.results, data?.instances, data?.items].find(Array.isArray);
    if (!items) throw new Error(text.slice(0, 300) || "search_game_tree sent an unexpected reply");
    return items;
  },
  ingest(items, under = null) {
    const created = [];
    for (const item of items) {
      const path = item?.fullPath || item?.path;
      if (!path) continue;
      let node = this.nodes.get(path);
      if (!node) {
        node = { path, name: item.name ?? path.split(".").pop(), className: item.className || "Instance", children: [], loaded: false };
        this.nodes.set(path, node);
        created.push(node);
      }
      if (item.name) node.name = item.name;
      if (item.className) node.className = item.className;
      if (item.unexploredChildCount != null) node.childCount = item.unexploredChildCount;
      if (item.childSummary) node.childSummary = item.childSummary;
    }
    for (const node of created) {
      const parent = this.nodes.get(parentOf(node.path));
      if (parent) {
        if (!parent.children.includes(node.path)) parent.children.push(node.path);
        parent.loaded = parent.loaded || parent.path === under;
      } else if (under === null && !this.roots.includes(node.path)) {
        this.roots.push(node.path);
      }
    }
  },
  hasChildren: (node) => node.children.length > 0 || node.childCount > 0 || Boolean(node.childSummary),
  async reload() {
    const gen = ++this.gen;
    this.nodes.clear();
    this.roots = [];
    this.loading = true;
    this.error = null;
    this.render();
    try {
      this.ingest(await this.fetch({ max_depth: 1, head_limit: 500 }));
      if (gen !== this.gen) return;
      this.loading = false;
      this.render();
      const saved = [...this.expanded].sort((a, b) => depthOf(a) - depthOf(b));
      for (const path of saved) {
        if (gen !== this.gen) return;
        if (this.nodes.has(path)) await this.loadChildren(path, gen).catch(() => this.expanded.delete(path));
        else this.expanded.delete(path);
      }
    } catch (err) {
      if (gen === this.gen) this.error = err.message;
    }
    if (gen === this.gen) {
      this.loading = false;
      this.render();
    }
  },
  async loadChildren(path, gen = this.gen) {
    const node = this.nodes.get(path);
    if (!node) return;
    node.loadingKids = true;
    this.render();
    try {
      const items = await this.fetch({ path, max_depth: 1, head_limit: 1000 });
      if (gen !== this.gen) return;
      this.ingest(items, path);
      node.loaded = true;
      node.more = node.childCount ? Math.max(node.childCount - node.children.length, 0) : 0;
    } finally {
      node.loadingKids = false;
      if (gen === this.gen) this.render();
    }
  },
  saveExpanded() {
    if (S.studioId) store.set(`expanded:${S.studioId}`, [...this.expanded].slice(-300));
  },
  async toggle(path) {
    if (this.expanded.has(path)) {
      this.expanded.delete(path);
      this.saveExpanded();
      this.render();
      return;
    }
    this.expanded.add(path);
    this.saveExpanded();
    this.render();
    const node = this.nodes.get(path);
    if (node && !node.loaded) {
      try {
        await this.loadChildren(path);
      } catch (err) {
        toast(err.message, "error");
        this.expanded.delete(path);
        this.render();
      }
    }
  },
  select(path) {
    this.selected = path;
    for (const row of $$("#tree .tree-row")) {
      const on = row.dataset.path === path;
      row.classList.toggle("selected", on);
      row.setAttribute("aria-selected", String(on));
      if (on) row.scrollIntoView({ block: "nearest" });
    }
    props.load(path);
    if (window.innerWidth <= 860) $("#ide").classList.remove("show-explorer");
  },
  async reveal(path) {
    this.search = null;
    $("#explorer-search").value = "";
    $("#explorer-search-clear").hidden = true;
    const parts = path.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join(".");
      const node = this.nodes.get(ancestor);
      if (!node) break;
      this.expanded.add(ancestor);
      if (!node.loaded) await this.loadChildren(ancestor).catch(() => {});
    }
    this.saveExpanded();
    this.render();
    this.select(path);
  },
  async runSearch(query) {
    if (!query) {
      this.search = null;
      this.render();
      return;
    }
    this.search = { query, loading: true, items: [] };
    this.render();
    try {
      const items = await this.fetch({ keywords: query, max_depth: 10, head_limit: 200 });
      if (this.search?.query === query) this.search = { query, loading: false, items };
    } catch (err) {
      if (this.search?.query === query) this.search = { query, loading: false, items: [], error: err.message };
    }
    this.render();
  },
  onKey(event) {
    if (this.search) return;
    const rows = this.visible;
    if (!rows.length) return;
    let i = rows.indexOf(this.selected);
    const node = this.nodes.get(this.selected);
    switch (event.key) {
      case "ArrowDown":
        i = Math.min(i + 1, rows.length - 1);
        break;
      case "ArrowUp":
        i = Math.max(i - 1, 0);
        break;
      case "ArrowRight":
        if (node && this.hasChildren(node) && !this.expanded.has(node.path)) {
          event.preventDefault();
          this.toggle(node.path);
          return;
        }
        i = Math.min(i + 1, rows.length - 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (node && this.expanded.has(node.path)) this.toggle(node.path);
        else if (this.selected && this.nodes.has(parentOf(this.selected))) this.select(parentOf(this.selected));
        return;
      case "Enter":
        event.preventDefault();
        if (node && isScriptClass(node.className)) scripts.open(node.path);
        else if (node) this.toggle(node.path);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.select(rows[Math.max(i, 0)]);
  },
  row(node, depth) {
    const kids = this.hasChildren(node);
    const open = this.expanded.has(node.path);
    const selected = node.path === this.selected;
    return el("div", {
      class: `tree-row${selected ? " selected" : ""}`,
      role: "treeitem",
      "aria-selected": String(selected),
      "aria-expanded": kids ? String(open) : null,
      "data-path": node.path,
      title: `${node.className} · ${node.path}`,
      style: { paddingLeft: `${depth * 14 + 6}px` },
    },
    el("span", { class: `caret${kids ? "" : " none"}${open ? " open" : ""}`, html: icon("chevron") }),
    classIcon(node.className),
    el("span", { class: "tree-name" }, node.name),
    node.loadingKids ? el("span", { class: "spinner sm" }) : null);
  },
  render() {
    const tree = $("#tree");
    if (this.search) {
      const { query, loading, items, error } = this.search;
      if (loading) return tree.replaceChildren(skeletonRows(6));
      if (error) return tree.replaceChildren(errorBox(error, () => this.runSearch(query)));
      tree.replaceChildren(
        el("div", { class: "search-meta" }, items.length ? `${items.length}${items.length >= 200 ? "+" : ""} matches · double-click to show in tree` : `Nothing named like “${query}”`),
        ...items.filter((item) => item?.fullPath || item?.path).map((item) => {
          const path = item.fullPath || item.path;
          return el("div", {
            class: `tree-row search-hit${path === this.selected ? " selected" : ""}`,
            "data-path": path,
            "data-search": "1",
            "data-class": item.className || "",
            title: path,
            style: { paddingLeft: "10px" },
          }, classIcon(item.className), el("span", { class: "tree-name" }, item.name || path.split(".").pop()), el("span", { class: "tree-class" }, parentOf(path) || "game"));
        }),
      );
      return;
    }
    if (this.loading && !this.roots.length) return tree.replaceChildren(skeletonRows(10));
    if (this.error && !this.roots.length) return tree.replaceChildren(errorBox(this.error, () => this.reload()));
    if (!this.roots.length) return tree.replaceChildren(el("div", { class: "empty" }, "Nothing to show yet."));
    const fragment = document.createDocumentFragment();
    const visible = [];
    const visit = (path, depth) => {
      const node = this.nodes.get(path);
      if (!node) return;
      visible.push(path);
      fragment.append(this.row(node, depth));
      if (!this.expanded.has(path)) return;
      const pad = { paddingLeft: `${(depth + 1) * 14 + 26}px` };
      if (node.loadingKids && !node.children.length) fragment.append(el("div", { class: "tree-loading", style: pad }, el("span", { class: "spinner sm" }), "Loading…"));
      for (const child of node.children) visit(child, depth + 1);
      if (node.more > 0) fragment.append(el("div", { class: "tree-more", style: pad }, `${node.more} more not shown · use Find to narrow down`));
    };
    for (const root of this.roots) visit(root, 0);
    this.visible = visible;
    tree.replaceChildren(fragment);
  },
};

/* ═══════════════════════════ properties ═══════════════════════════ */

const NOT_EDITABLE = new Set(["ClassName", "Parent", "UniqueId", "uniqueId"]);

function colorOf(key, text) {
  if (!/colou?r/i.test(key)) return null;
  if (/^#[0-9a-f]{6}$/i.test(text.trim())) return text.trim();
  const nums = text.split(",").map((n) => Number(n.trim()));
  if (nums.length !== 3 || !nums.every(Number.isFinite)) return null;
  const scale = nums.every((n) => n <= 1) ? 255 : 1;
  return `rgb(${nums.map((n) => Math.round(clamp(n * scale, 0, 255))).join(", ")})`;
}

function luaLiteral(key, value, original) {
  if (typeof value === "boolean") return String(value);
  if (typeof original === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${key} needs a number`);
    return String(n);
  }
  const text = String(value).trim();
  if (/^Enum\.\w+\.\w+$/.test(text)) return text;
  const nums = text.split(",").map((n) => Number(n.trim()));
  if (typeof original === "string" && parseVector(original) && nums.every(Number.isFinite)) {
    if (/colou?r/i.test(key) && nums.length === 3) return nums.some((n) => n > 1) ? `Color3.fromRGB(${nums.join(", ")})` : `Color3.new(${nums.join(", ")})`;
    if (nums.length === 3) return `Vector3.new(${nums.join(", ")})`;
    if (nums.length === 2) return `Vector2.new(${nums.join(", ")})`;
  }
  return luaString(value);
}

const props = {
  path: null,
  data: null,
  error: null,
  loading: false,
  filter: "",
  seq: 0,
  timer: null,
  matchCount: 1,
  clear() {
    this.path = null;
    this.data = null;
    this.render();
    viewport.updateLookAt();
  },
  load(path) {
    clearTimeout(this.timer);
    this.path = path;
    this.loading = true;
    this.error = null;
    this.render();
    this.timer = setTimeout(() => this.fetch(path), 140);
  },
  async fetch(path = this.path) {
    if (!path) return;
    const seq = ++this.seq;
    try {
      const result = await callTool("inspect_instance", { path });
      if (seq !== this.seq) return;
      const data = extractJson(textOf(result));
      if (!data || typeof data !== "object") throw new Error(textOf(result) || "inspect_instance sent an unexpected reply");
      this.data = Array.isArray(data.matches) ? data.matches[0] : data;
      this.matchCount = Array.isArray(data.matches) ? data.matches.length : 1;
      this.error = null;
    } catch (err) {
      if (seq !== this.seq) return;
      this.data = null;
      this.error = err.message;
    }
    this.loading = false;
    this.render();
    viewport.updateLookAt();
  },
  property(...names) {
    const p = this.data?.properties || {};
    for (const name of names) if (p[name] !== undefined) return p[name];
    return undefined;
  },
  position() {
    return parseVector(this.property("CFrame.Position", "Position", "WorldPivot.Position", "Pivot.Position", "PrimaryPart.Position"));
  },
  size() {
    return parseVector(this.property("Size", "ExtentsSize"));
  },
  async setProp(key, value) {
    const original = this.data?.properties?.[key];
    const path = stripGame(this.data?.path || this.path);
    let literal;
    try {
      literal = luaLiteral(key, value, original);
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    const code = [
      "local inst = game",
      `for name in string.gmatch(${luaString(path)}, "[^%.]+") do`,
      "\tinst = inst:FindFirstChild(name)",
      `\tassert(inst, ${luaString(`Instance not found: ${path}`)})`,
      "end",
      `inst[${luaString(key)}] = ${literal}`,
      `return tostring(inst[${luaString(key)}])`,
    ].join("\n");
    try {
      await callTool("execute_luau", { code, datamodel_type: explorer.dm() });
      toast(`${key} updated`, "success", { timeout: 1800 });
    } catch (err) {
      toast(`Couldn't set ${key}: ${err.message}`, "error", { timeout: 7000 });
    }
    if (key === "Name" && typeof value === "string") {
      const parent = parentOf(this.path);
      this.path = parent ? `${parent}.${value}` : value;
      explorer.selected = this.path;
      explorer.reload();
    }
    this.fetch(this.path);
  },
  editCell(cell, key, value) {
    if (cell.querySelector("input")) return;
    const input = el("input", { value: String(value), spellcheck: "false" });
    cell.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit && input.value !== String(value)) this.setProp(key, input.value);
      else this.render();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(false));
  },
  valueCell(key, value) {
    const editable = !key.includes(".") && !NOT_EDITABLE.has(key) && ["boolean", "number", "string"].includes(typeof value);
    const cell = el("div", { class: `v${editable && typeof value !== "boolean" ? " editable" : ""}`, title: typeof value === "object" ? JSON.stringify(value) : String(value) });
    if (typeof value === "boolean") {
      cell.append(el("button", { class: `toggle${value ? " on" : ""}`, type: "button", disabled: !editable, onclick: () => this.setProp(key, !value) },
        el("span", { class: "box", html: value ? icon("check") : "" }), String(value)));
    } else if (value === null || value === undefined) {
      cell.append(el("span", { class: "null" }, "nil"));
    } else if (typeof value === "number") {
      cell.append(el("span", { class: "num" }, Number.isInteger(value) ? String(value) : String(Math.round(value * 1e4) / 1e4)));
    } else if (typeof value === "object") {
      cell.append(el("span", {}, JSON.stringify(value)));
    } else {
      const color = colorOf(key, value);
      if (color) cell.append(el("span", { class: "swatch", style: { background: color } }));
      cell.append(el("span", {}, value === "" ? "\u00a0" : value));
    }
    if (editable && typeof value !== "boolean") cell.addEventListener("click", () => this.editCell(cell, key, value));
    return cell;
  },
  kv(entries) {
    const grid = el("div", { class: "kv" });
    for (const [key, value] of entries) grid.append(el("div", { class: "k", title: key }, key), this.valueCell(key, value));
    return grid;
  },
  render() {
    const box = $("#props");
    if (!this.path) return box.replaceChildren(emptyState("list", "Nothing selected", "Select an instance in the Explorer to see and edit its properties."));
    if (this.error) return box.replaceChildren(errorBox(this.error, () => this.fetch()));
    if (!this.data) return box.replaceChildren(skeletonRows(12));
    const d = this.data;
    const path = d.path || this.path;
    const name = d.name || path.split(".").pop();
    const className = d.className || "Instance";
    const filter = this.filter.toLowerCase();
    const properties = Object.entries(d.properties || {}).filter(([k]) => !filter || k.toLowerCase().includes(filter));
    const attributes = Object.entries(d.attributes || {}).filter(([k]) => !filter || k.toLowerCase().includes(filter));
    const children = d.children || {};
    const position = this.position();

    const actions = el("div", { class: "props-actions" });
    if (isScriptClass(className)) actions.append(el("button", { class: "btn btn-sm", type: "button", onclick: () => scripts.open(path) }, el("span", { html: icon("file"), style: { display: "contents" } }), "Open script"));
    if (position) actions.append(el("button", { class: "btn btn-sm", type: "button", onclick: () => { switchTab("viewport"); viewport.lookAtSelection(); } }, el("span", { html: icon("target"), style: { display: "contents" } }), "Look at"));
    actions.append(el("button", { class: "btn btn-sm", type: "button", onclick: () => this.fetch() }, el("span", { html: icon("refresh"), style: { display: "contents" } }), "Refresh"));

    const filterBox = el("div", { class: "search-box props-filter" }, el("span", { html: icon("search"), style: { display: "contents" } }),
      el("input", { placeholder: "Filter properties", value: this.filter, oninput: (e) => { this.filter = e.target.value; this.renderSoon(); } }));

    const sections = [
      el("div", { class: "props-head" },
        el("div", { class: "props-title" }, classIcon(className), el("strong", { title: name }, name), el("span", { class: "badge" }, className),
          this.loading ? el("span", { class: "spinner sm" }) : null),
        el("div", { class: "props-path" }, el("span", {}, path),
          el("button", { class: "icon-btn tiny", type: "button", title: "Copy path", "aria-label": "Copy path", html: icon("copy"), onclick: () => copyText(path, "Path copied") })),
        this.matchCount > 1 ? el("div", { class: "muted small" }, `${this.matchCount} instances share this path; showing the first.`) : null,
        actions),
      filterBox,
      el("details", { class: "props-section", open: true }, el("summary", {}, `Properties · ${properties.length}`),
        properties.length ? this.kv(properties) : el("div", { class: "empty" }, filter ? "No matching properties." : "No readable properties.")),
    ];
    if (attributes.length || (!filter && d.attributes)) {
      sections.push(el("details", { class: "props-section", open: true }, el("summary", {}, `Attributes · ${attributes.length}`),
        attributes.length ? this.kv(attributes) : el("div", { class: "empty" }, "No attributes.")));
    }
    const kids = Array.isArray(children.immediateChildren) ? children.immediateChildren : [];
    if (children.childrenCount != null || kids.length) {
      const list = el("div", { class: "kv" });
      for (const child of kids.slice(0, 200)) {
        const childPath = stripGame(child.path || "");
        list.append(
          el("div", { class: "k" }, classIcon(child.className), "\u00a0", child.className || ""),
          el("div", { class: "v" }, el("span", { class: "child-link", title: childPath, onclick: () => explorer.reveal(childPath) }, childPath.split(".").pop())),
        );
      }
      sections.push(el("details", { class: "props-section", open: kids.length <= 30 },
        el("summary", {}, `Children · ${children.childrenCount ?? kids.length}${children.totalDescendants != null ? ` (${children.totalDescendants} descendants)` : ""}`),
        kids.length ? list : el("div", { class: "empty" }, "No children.")));
    }
    const focused = document.activeElement?.closest?.(".props-filter") ? document.activeElement : null;
    const caret = focused?.selectionStart;
    box.replaceChildren(...sections);
    if (focused) {
      const input = box.querySelector(".props-filter input");
      input.focus();
      input.setSelectionRange(caret, caret);
    }
  },
  renderSoon() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 80);
  },
};

/* ═══════════════════════════ viewport ═══════════════════════════ */

const viewport = {
  counter: store.get("captureCounter", 0),
  timer: null,
  busy: false,
  image: null,
  target: null,
  showImage(src) {
    const box = $("#viewport");
    let img = box.querySelector("img");
    if (!img) {
      img = el("img", { alt: "Studio viewport" });
      box.replaceChildren(img);
    }
    img.src = src;
  },
  showMessage(text, isError = false) {
    $("#viewport").replaceChildren(isError ? errorBox(text, () => this.capture()) : el("pre", { class: "muted" }, text));
  },
  async capture(camera) {
    if (this.busy || !S.studioId) return;
    this.busy = true;
    const box = $("#viewport");
    const live = !camera && Number($("#vp-auto").value) > 0;
    box.classList.add("busy");
    const badge = el("div", { class: "busy-badge" }, el("span", { class: "spinner sm" }), "Capturing…");
    if (!live) box.append(badge);
    const started = performance.now();
    try {
      const args = { capture_id: live ? "ScreenCapture_0" : `ScreenCapture_${++this.counter}` };
      if (!live) store.set("captureCounter", this.counter);
      if (camera) {
        args.camera_position = camera.position;
        args.look_at_position = camera.lookAt;
      }
      const result = await callTool("screen_capture", args, { quiet: live, timeout: 60 });
      const images = imagesOf(result);
      if (images.length) {
        this.image = images[0];
        this.showImage(images[0]);
      } else {
        this.showMessage(textOf(result) || "Studio returned no image.");
      }
      $("#vp-meta").textContent = `${fmtTime(Date.now())} · ${Math.round(performance.now() - started)} ms`;
      $("#vp-download").disabled = !this.image;
    } catch (err) {
      if (!this.image) this.showMessage(err.message, true);
      if (!live) toast(err.message, "error");
    } finally {
      this.busy = false;
      box.classList.remove("busy");
      badge.remove();
    }
  },
  setAuto(seconds) {
    clearInterval(this.timer);
    this.timer = null;
    store.set("viewportAuto", seconds);
    if (seconds > 0) {
      this.timer = setInterval(() => {
        if (S.view === "ide" && S.centerTab === "viewport" && !document.hidden) this.capture();
      }, seconds * 1000);
      if (S.view === "ide") this.capture();
    }
  },
  updateLookAt() {
    this.target = props.position();
    $("#vp-look").disabled = !this.target;
  },
  lookAtSelection() {
    const target = this.target || props.position();
    if (!target) return;
    const size = props.size();
    const reach = Math.max(14, (size ? Math.max(...size.map(Math.abs)) : 6) * 2.4);
    const position = [target[0] + reach, target[1] + reach * 0.65, target[2] + reach].map((n) => Math.round(n * 100) / 100);
    $("#vp-pos").value = position.join(", ");
    $("#vp-look-at").value = target.map((n) => Math.round(n * 100) / 100).join(", ");
    this.capture({ position, lookAt: target });
  },
  download() {
    if (!this.image) return;
    const link = el("a", { href: this.image, download: `studio-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.png` });
    document.body.append(link);
    link.click();
    link.remove();
  },
};

/* ═══════════════════════════ Luau console ═══════════════════════════ */

const DEFAULT_LUAU = `-- Runs inside Roblox Studio. Ctrl+Enter to run.
-- The value you return shows below; print() goes to the Output panel.
local counts = {}
for _, inst in ipairs(workspace:GetDescendants()) do
\tcounts[inst.ClassName] = (counts[inst.ClassName] or 0) + 1
end

local lines = {}
for className, n in pairs(counts) do
\ttable.insert(lines, string.format("%-18s %d", className, n))
end
table.sort(lines)
return table.concat(lines, "\\n")
`;

const SNIPPETS = [
  ["List Workspace", 'local lines = {}\nfor _, child in ipairs(workspace:GetChildren()) do\n\ttable.insert(lines, child.ClassName .. "  " .. child.Name)\nend\nreturn table.concat(lines, "\\n")'],
  ["Count parts", 'local count = 0\nfor _, inst in ipairs(workspace:GetDescendants()) do\n\tif inst:IsA("BasePart") then count += 1 end\nend\nreturn count .. " parts in Workspace"'],
  ["Spawn a glowing cube", 'local part = Instance.new("Part")\npart.Name = "HelloFromStudioRemote"\npart.Size = Vector3.new(6, 6, 6)\npart.Position = Vector3.new(0, 12, 0)\npart.Anchored = true\npart.Material = Enum.Material.Neon\npart.Color = Color3.fromRGB(76, 141, 255)\npart.Parent = workspace\nreturn part:GetFullName()'],
  ["Sunset lighting", 'local Lighting = game:GetService("Lighting")\nLighting.ClockTime = 17.8\nLighting.Brightness = 2\nreturn "ClockTime is now " .. Lighting.ClockTime'],
  ["Studio selection", 'local selection = game:GetService("Selection"):Get()\nlocal names = {}\nfor _, inst in ipairs(selection) do\n\ttable.insert(names, inst:GetFullName())\nend\nreturn #names > 0 and table.concat(names, "\\n") or "Nothing is selected in Studio"'],
  ["Players (during play)", 'local names = {}\nfor _, player in ipairs(game:GetService("Players"):GetPlayers()) do\n\ttable.insert(names, player.Name)\nend\nreturn #names .. " player(s): " .. table.concat(names, ", ")'],
  ["Print to Output", 'print("Hello from Studio Remote at " .. os.date("%X"))\nwarn("This line is a warning")\nreturn "Check the Output panel"'],
];

const luau = {
  editor: null,
  runs: store.get("luauRuns", []),
  running: false,
  init() {
    this.editor = createEditor($("#luau-editor"), {
      value: store.get("luauCode", DEFAULT_LUAU),
      onRun: () => this.run(),
      onChange: (code) => store.set("luauCode", code),
    });
    $("#luau-snippets").append(...SNIPPETS.map(([name], i) => el("option", { value: String(i) }, name)));
    this.renderRuns();
  },
  async run() {
    if (this.running) return;
    const code = this.editor.getValue();
    if (!code.trim()) return;
    const datamodel = $("#luau-dm").value || "Edit";
    this.running = true;
    const button = $("#luau-run");
    button.classList.add("busy");
    const started = performance.now();
    const entry = { code, datamodel, at: Date.now() };
    try {
      const result = await callTool("execute_luau", { code, datamodel_type: datamodel }, { timeout: 300 });
      entry.ok = true;
      entry.text = textOf(result) || "(no return value)";
    } catch (err) {
      entry.ok = false;
      entry.text = err.message;
    }
    entry.ms = Math.round(performance.now() - started);
    this.runs.unshift(entry);
    this.runs = this.runs.slice(0, 40);
    store.set("luauRuns", this.runs);
    this.renderRuns();
    this.running = false;
    button.classList.remove("busy");
    setTimeout(() => output.poll(true), 300);
  },
  renderRuns() {
    const box = $("#luau-runs");
    if (!this.runs.length) {
      box.replaceChildren(el("div", { class: "empty" }, "Results of your runs appear here. Anything you print() shows in the Output panel below."));
      return;
    }
    box.replaceChildren(...this.runs.map((run) =>
      el("div", { class: `run${run.ok ? "" : " err"}` },
        el("div", { class: "run-head" },
          el("span", { class: `badge ${run.ok ? "ok" : "err"}` }, run.ok ? "OK" : "Error"),
          el("code", { title: run.code }, run.code.split("\n").find((l) => l.trim() && !l.trim().startsWith("--")) || run.code.split("\n")[0]),
          el("span", {}, `${run.datamodel} · ${run.ms} ms · ${fmtTime(run.at)}`),
          el("button", { class: "icon-btn", type: "button", title: "Put this code back in the editor", "aria-label": "Restore code", html: icon("refresh"), onclick: () => { this.editor.setValue(run.code); this.editor.focus(); } }),
          el("button", { class: "icon-btn", type: "button", title: "Copy result", "aria-label": "Copy result", html: icon("copy"), onclick: () => copyText(run.text) })),
        el("pre", {}, run.text))));
  },
};

/* ═══════════════════════════ scripts ═══════════════════════════ */

/** script_read numbers its lines as "12→text"; returns the bare source when every line has a number. */
function parseNumbered(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)(?:→|\t|\|)(.*)$/);
    if (!match) return { source: text, exact: false };
    out.push(match[2]);
  }
  return { source: out.join("\n"), exact: out.length > 0 };
}

function parseScriptHits(text) {
  const hits = [];
  const add = (path, line, preview) => path && hits.push({ path: stripGame(String(path)), line: line ? Number(line) : null, preview: preview ? String(preview) : "" });
  const data = extractJson(text);
  const list = Array.isArray(data) ? data : [data?.results, data?.matches, data?.scripts].find(Array.isArray);
  if (list) {
    for (const item of list) {
      if (typeof item === "string") add(item);
      else if (item && typeof item === "object") add(item.path || item.fullPath || item.file || item.target_file || item.script, item.line || item.lineNumber, item.text || item.match || item.content || item.preview || item.name);
    }
    if (hits.length) return { hits, plain: [] };
  }
  const plain = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(?:[-*•]|\d+[.)])?\s*((?:game\.)?[A-Za-z_][\w ]*(?:\.[\w ]+)+?)(?:\s*[:(,]\s*(?:line\s*)?(\d+)\)?)?(?:\s*[:\-–]\s*(.*))?$/i);
    if (match && match[1].includes(".")) add(match[1].trim(), match[2], match[3]);
    else plain.push(line);
  }
  return { hits, plain };
}

const scripts = {
  editor: null,
  path: null,
  original: "",
  exact: false,
  recent: store.get("recentScripts", []),
  init() {
    this.editor = createEditor($("#script-editor"), { value: "", readOnly: true, onSave: () => this.save(), onChange: () => this.updateState() });
    this.renderRecent();
  },
  dirty() {
    return Boolean(this.path) && this.exact && this.editor.getValue() !== this.original;
  },
  updateState() {
    $("#script-dirty").hidden = !this.dirty();
    $("#script-save").disabled = !this.dirty();
    $("#script-reload").disabled = !this.path;
    $("#script-ro").hidden = !this.path || this.exact;
  },
  async open(path, line) {
    const target = path.startsWith("game.") ? path : `game.${path}`;
    if (this.dirty() && target !== this.path) {
      const ok = await dialog({ title: "Discard unsaved changes?", body: `Your edits to ${this.path} haven't been saved.`, confirm: "Discard" , danger: true });
      if (!ok) return;
    }
    switchTab("script");
    $("#script-path").textContent = target;
    $("#script-empty").hidden = true;
    try {
      const result = await callTool("script_read", { target_file: target });
      const { source, exact } = parseNumbered(textOf(result));
      this.path = target;
      this.original = source;
      this.exact = exact;
      this.editor.setValue(source);
      this.editor.setReadOnly(!exact);
      this.editor.refresh();
      if (line) this.editor.jumpTo(line);
      this.recent = [stripGame(target), ...this.recent.filter((p) => p !== stripGame(target))].slice(0, 15);
      store.set("recentScripts", this.recent);
      this.renderRecent();
    } catch (err) {
      toast(err.message, "error");
      if (!this.path) $("#script-empty").hidden = false;
      $("#script-path").textContent = this.path || "No script open";
    }
    this.updateState();
  },
  async reload() {
    if (!this.path) return;
    if (this.dirty()) {
      const ok = await dialog({ title: "Reload and lose your changes?", body: "The script is read again from Studio.", confirm: "Reload", danger: true });
      if (!ok) return;
    }
    this.original = this.editor.getValue();
    await this.open(this.path);
  },
  async save() {
    if (!this.dirty()) return;
    const current = this.editor.getValue();
    await withBusy($("#script-save"), async () => {
      try {
        await callTool("multi_edit", { file_path: this.path, edits: [{ old_string: this.original, new_string: current }], datamodel_type: "Edit" }, { timeout: 60 });
        this.original = current;
        toast("Saved to Studio", "success", { timeout: 1800 });
      } catch (err) {
        toast(`Couldn't save: ${err.message}${S.studio.playing ? " (scripts can only be edited in edit mode)" : ""}`, "error", { timeout: 8000 });
      }
    });
    this.updateState();
  },
  async create() {
    const values = await dialog({
      title: "New script",
      body: "Creates the script in Studio and opens it here.",
      confirm: "Create",
      fields: [
        { name: "path", label: "Path", value: "ServerScriptService.NewScript", help: "Dot path; the parent must exist." },
        { name: "className", label: "Type", options: ["Script", "LocalScript", "ModuleScript"], value: "Script" },
      ],
    });
    if (!values?.path) return;
    const path = stripGame(values.path);
    const starter = values.className === "ModuleScript" ? "local module = {}\n\nreturn module\n" : 'print("Hello from " .. script:GetFullName())\n';
    try {
      await callTool("multi_edit", { file_path: `game.${path}`, className: values.className, edits: [{ old_string: "", new_string: starter }], datamodel_type: "Edit" });
      toast(`Created ${path}`, "success");
      await this.open(path);
      explorer.reload();
    } catch (err) {
      toast(`Couldn't create the script: ${err.message}`, "error", { timeout: 8000 });
    }
  },
  async search(kind, query) {
    if (!query) return;
    const title = $("#script-results-title");
    const box = $("#script-results");
    title.hidden = false;
    title.textContent = kind === "grep" ? `Matches for “${query}”` : `Scripts like “${query}”`;
    box.replaceChildren(skeletonRows(4));
    try {
      const result = kind === "grep" ? await callTool("script_grep", { query }) : await callTool("script_search", { keywords: query });
      const { hits, plain } = parseScriptHits(textOf(result));
      const items = hits.map((hit) =>
        el("button", { class: "list-item", type: "button", title: hit.path, onclick: () => this.open(hit.path, hit.line) },
          el("span", { class: "li-icon" }, classIcon("Script")),
          el("span", { class: "li-main" }, `${hit.path.split(".").pop()}${hit.line ? `:${hit.line}` : ""}`),
          el("span", { class: "li-sub" }, hit.preview || hit.path)));
      box.replaceChildren(...items, ...plain.slice(0, 50).map((line) => el("div", { class: "plain" }, line)));
      if (!items.length && !plain.length) box.replaceChildren(el("div", { class: "empty" }, "No results."));
    } catch (err) {
      box.replaceChildren(errorBox(err.message));
    }
  },
  renderRecent() {
    const box = $("#script-recent");
    if (!this.recent.length) return box.replaceChildren(el("div", { class: "empty" }, "Scripts you open show up here."));
    box.replaceChildren(...this.recent.map((path) =>
      el("button", { class: `list-item${this.path && stripGame(this.path) === path ? " active" : ""}`, type: "button", title: path, onclick: () => this.open(path) },
        el("span", { class: "li-icon" }, classIcon("Script")),
        el("span", { class: "li-main" }, path.split(".").pop()),
        el("span", { class: "li-sub" }, parentOf(path)))));
  },
};

/* ═══════════════════════════ tools playground ═══════════════════════════ */

const TOOL_GROUPS = [
  ["Data model", ["search_game_tree", "inspect_instance", "subagent"]],
  ["Luau", ["execute_luau"]],
  ["Scripts", ["script_read", "script_search", "script_grep", "multi_edit"]],
  ["Playtesting", ["get_studio_state", "start_stop_play", "get_console_output", "screen_capture"]],
  ["Player input", ["character_navigation", "user_keyboard_input", "user_mouse_input"]],
  ["Assets & generation", ["search_asset", "insert_asset", "generate_mesh", "generate_material", "generate_procedural_model", "wait_job_finished", "segment_mesh", "upload_image", "store_image"]],
  ["Plugins", ["list_plugin_guis", "capture_plugin_gui"]],
  ["Docs & skills", ["http_get", "skill"]],
  ["Session", ["list_roblox_studios"]],
];

function firstLine(text) {
  return String(text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
}

function schemaType(schema) {
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  return type || (schema.enum ? "string" : schema.properties ? "object" : schema.items ? "array" : "any");
}

function buildField(name, schema, required) {
  const type = schemaType(schema);
  const head = el("span", { class: "field-name" }, name, required ? el("span", { class: "req", title: "Required" }, "*") : null,
    el("span", { class: "field-type" }, schema.enum ? "choice" : type));
  let input;
  let read;
  if (name === "studio_id") {
    const studio = S.studios.find((s) => s.id === S.studioId);
    return { name, node: el("div", { class: "field" }, head, el("div", { class: "auto" }, el("span", { class: "badge accent" }, "auto"), studio ? studio.name : "the selected Studio")), read: () => undefined };
  }
  if (schema.enum) {
    input = el("select", { class: "input" }, required ? null : el("option", { value: "" }, "—"), schema.enum.map((v) => el("option", { value: String(v) }, String(v))));
    read = () => (input.value === "" ? undefined : schema.enum.find((v) => String(v) === input.value));
  } else if (type === "boolean") {
    input = el("select", { class: "input" }, el("option", { value: "" }, "—"), el("option", { value: "true" }, "true"), el("option", { value: "false" }, "false"));
    read = () => (input.value === "" ? undefined : input.value === "true");
  } else if (type === "number" || type === "integer") {
    input = el("input", { class: "input mono", type: "number", step: type === "integer" ? "1" : "any" });
    read = () => (input.value === "" ? undefined : Number(input.value));
  } else if (type === "array" && ["number", "integer"].includes(schemaType(schema.items || {}))) {
    input = el("input", { class: "input mono", placeholder: "comma-separated, e.g. 0, 10, 0", autocomplete: "off" });
    read = () => (input.value.trim() === "" ? undefined : input.value.split(/[\s,]+/).filter(Boolean).map(Number));
  } else if (type === "array" || type === "object" || type === "any") {
    input = el("textarea", { class: "input mono", rows: 4, spellcheck: "false", placeholder: type === "array" ? "[ … ] as JSON" : "{ … } as JSON" });
    read = () => {
      const value = input.value.trim();
      if (!value) return undefined;
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`${name} must be valid JSON`);
      }
    };
  } else {
    const tall = name === "code" ? 9 : /prompt|content|new_string|old_string|description/.test(name) ? 3 : 0;
    input = tall ? el("textarea", { class: "input mono", rows: tall, spellcheck: "false" }) : el("input", { class: "input mono", autocomplete: "off", spellcheck: "false" });
    read = () => (input.value === "" ? undefined : input.value);
  }
  if (schema.default !== undefined) input.value = typeof schema.default === "object" ? JSON.stringify(schema.default) : String(schema.default);
  const node = el("label", { class: "field" }, head, input, schema.description ? el("span", { class: "field-help" }, schema.description) : null);
  return { name, node, read, input, required };
}

const toolsPane = {
  selected: null,
  fields: [],
  raw: false,
  renderList() {
    const box = $("#tool-list");
    if (!tools.list) {
      box.replaceChildren(tools.loading ? skeletonRows(8) : el("div", { class: "empty" }, "The tool list loads when Studio is connected."));
      if (!this.selected) $("#tool-main").replaceChildren(emptyState("wrench", "Every MCP tool, one click away", "Pick a tool on the left. Its form is built from the tool's own schema."));
      return;
    }
    const filter = $("#tool-filter").value.trim().toLowerCase();
    const matches = tools.list.filter((t) => !filter || t.name.toLowerCase().includes(filter) || (t.description || "").toLowerCase().includes(filter));
    const grouped = new Set();
    const nodes = [];
    for (const [group, names] of TOOL_GROUPS) {
      const inGroup = names.map((n) => matches.find((t) => t.name === n)).filter(Boolean);
      inGroup.forEach((t) => grouped.add(t.name));
      if (inGroup.length) nodes.push(el("div", { class: "tool-group" }, group), ...inGroup.map((t) => this.item(t)));
    }
    const rest = matches.filter((t) => !grouped.has(t.name));
    if (rest.length) nodes.push(el("div", { class: "tool-group" }, "Other"), ...rest.map((t) => this.item(t)));
    box.replaceChildren(...(nodes.length ? nodes : [el("div", { class: "empty" }, "No tools match.")]));
    if (!this.selected) $("#tool-main").replaceChildren(emptyState("wrench", "Every MCP tool, one click away", `${tools.list.length} tools from Studio's MCP server. Pick one on the left; its form is built from the tool's own schema.`));
  },
  item(tool) {
    return el("button", { class: `tool-item${tool.name === this.selected ? " active" : ""}`, type: "button", onclick: () => this.select(tool.name) },
      el("code", {}, tool.name), el("span", {}, firstLine(tool.description)));
  },
  select(name) {
    const tool = tools.map.get(name);
    if (!tool) return;
    this.selected = name;
    this.raw = false;
    this.renderList();
    const schema = tool.inputSchema || {};
    const required = new Set(schema.required || []);
    this.fields = Object.entries(schema.properties || {}).map(([field, sub]) => buildField(field, sub || {}, required.has(field)));
    this.fields.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
    const dm = this.fields.find((f) => f.name === "datamodel_type");
    const wanted = S.studio.playing ? "Server" : "Edit";
    if (dm?.input && [...dm.input.options].some((o) => o.value === wanted)) dm.input.value = wanted;
    const desc = el("div", { class: "tool-desc" }, tool.description || "No description.");
    const more = el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { desc.classList.toggle("open"); more.textContent = desc.classList.contains("open") ? "Show less" : "Show more"; } }, "Show more");
    const form = el("form", { class: "form", onsubmit: (e) => { e.preventDefault(); this.run(); } }, this.fields.map((f) => f.node));
    const rawArea = el("textarea", { class: "input mono", rows: 10, spellcheck: "false", hidden: true });
    const rawToggle = el("button", { class: "btn btn-ghost", type: "button", onclick: () => this.toggleRaw(form, rawArea, rawToggle) }, "Edit as JSON");
    const runButton = el("button", { class: "btn btn-primary", type: "button", id: "tool-run", onclick: () => this.run() }, el("span", { html: icon("play"), style: { display: "contents" } }), "Run tool");
    $("#tool-main").replaceChildren(...[
      el("div", { class: "tool-title" }, el("h3", {}, tool.name), tool.annotations?.readOnlyHint ? el("span", { class: "badge ok" }, "read-only") : null,
        tool.annotations?.destructiveHint ? el("span", { class: "badge warn" }, "changes things") : null),
      desc,
      (tool.description || "").length > 280 ? more : null,
      form,
      rawArea,
      el("div", { class: "form-actions" }, runButton, rawToggle, el("span", { class: "muted small" }, "Calls are listed in the Activity panel below.")),
      el("div", { id: "tool-result" }),
    ].filter(Boolean));
    this.form = form;
    this.rawArea = rawArea;
  },
  collect() {
    if (this.raw) {
      const value = this.rawArea.value.trim();
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        throw new Error("The arguments aren't valid JSON");
      }
    }
    const args = {};
    for (const field of this.fields) {
      const value = field.read();
      if (value !== undefined) args[field.name] = value;
      else if (field.required && field.name !== "studio_id") throw new Error(`${field.name} is required`);
    }
    return args;
  },
  toggleRaw(form, area, button) {
    try {
      if (!this.raw) area.value = JSON.stringify(this.collect(), null, 2);
    } catch {
      area.value = "{}";
    }
    this.raw = !this.raw;
    form.hidden = this.raw;
    area.hidden = !this.raw;
    button.textContent = this.raw ? "Use the form" : "Edit as JSON";
  },
  async run() {
    const name = this.selected;
    if (!name) return;
    let args;
    try {
      args = this.collect();
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    const out = $("#tool-result");
    const started = performance.now();
    await withBusy($("#tool-run"), async () => {
      let result;
      let error;
      try {
        result = await callTool(name, args, { timeout: 600 });
      } catch (err) {
        if (err instanceof ToolError) result = err.result;
        else error = err;
      }
      const ms = Math.round(performance.now() - started);
      if (error) {
        out.replaceChildren(el("div", { class: "result is-error" }, el("div", { class: "result-head" }, el("span", { class: "badge err" }, "Failed"), `${ms} ms`), el("div", { class: "result-body" }, el("pre", {}, error.message))));
        return;
      }
      const text = textOf(result);
      out.replaceChildren(el("div", { class: `result${result?.isError ? " is-error" : ""}` },
        el("div", { class: "result-head" },
          el("span", { class: `badge ${result?.isError ? "err" : "ok"}` }, result?.isError ? "Tool error" : "OK"),
          `${ms} ms`,
          el("div", { class: "toolbar-spacer" }),
          text ? el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyText(text) }, "Copy text") : null,
          el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyText(JSON.stringify(result, null, 2)) }, "Copy JSON")),
        renderResultBody(result)));
    });
  },
};

/* ═══════════════════════════ output ═══════════════════════════ */

function levelOf(type, message) {
  const t = String(type || "").toLowerCase();
  if (/error/.test(t)) return "error";
  if (/warn/.test(t)) return "warn";
  if (t && /info|output|print/.test(t)) return "info";
  const m = String(message || "");
  if (/^\s*(error|.*:\d+: )|stack begin|script '.*', line \d+/i.test(m)) return "error";
  if (/^\s*(warn|warning)\b/i.test(m)) return "warn";
  return "info";
}

function parseConsole(text) {
  const data = extractJson(text);
  const list = Array.isArray(data) ? data : [data?.output, data?.messages, data?.logs, data?.entries, data?.lines].find(Array.isArray);
  if (list) {
    return list.map((entry) => {
      if (typeof entry === "string") return { text: entry, level: levelOf("", entry), time: null };
      const message = entry.message ?? entry.text ?? entry.msg ?? JSON.stringify(entry);
      const time = entry.timestamp ?? entry.time ?? null;
      return { text: String(message), level: levelOf(entry.messageType ?? entry.type ?? entry.level, message), time };
    });
  }
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const match = line.match(/^\s*\[?(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\]?\s*(?:-+\s*)?(.*)$/);
    const body = match ? match[2] : line;
    return { text: body, level: levelOf("", body), time: match ? match[1] : null };
  });
}

function formatLogTime(time) {
  if (time == null) return "";
  if (typeof time === "number") return fmtTime(time > 1e12 ? time : time * 1000);
  return String(time).replace(/^.*T/, "").slice(0, 8);
}

const output = {
  entries: [],
  hidden: 0,
  paused: false,
  busy: false,
  lastText: null,
  levels: new Set(store.get("outputLevels", ["info", "warn", "error"])),
  filter: "",
  error: null,
  reset() {
    this.entries = [];
    this.hidden = 0;
    this.lastText = null;
    this.render();
  },
  async poll(force = false) {
    if (this.busy || (this.paused && !force) || S.view !== "ide" || !S.studioId) return;
    this.busy = true;
    try {
      const result = await callTool("get_console_output", {}, { quiet: true, timeout: 20 });
      const text = textOf(result);
      this.error = null;
      if (text !== this.lastText) {
        this.lastText = text;
        this.entries = parseConsole(text);
        if (this.entries.length < this.hidden) this.hidden = 0;
        this.render();
      }
    } catch (err) {
      if (this.error !== err.message) {
        this.error = err.message;
        this.render();
      }
    } finally {
      this.busy = false;
    }
  },
  render() {
    const box = $("#output");
    const visible = this.entries.slice(this.hidden);
    const filter = this.filter.toLowerCase();
    const shown = visible.filter((e) => this.levels.has(e.level) && (!filter || e.text.toLowerCase().includes(filter)));
    const errors = visible.filter((e) => e.level === "error").length;
    const count = $("#output-count");
    count.textContent = errors ? String(errors) : visible.length ? String(visible.length) : "";
    count.classList.toggle("err", errors > 0);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    const rows = shown.slice(-1500).map((e) =>
      el("div", { class: `log-line ${e.level}` }, el("span", { class: "log-time" }, formatLogTime(e.time)), el("span", { class: "log-msg" }, e.text)));
    if (!rows.length) {
      rows.push(el("div", { class: "empty" }, this.error ? `Output unavailable: ${this.error}` : visible.length ? "No lines match the filter." : "Output from Studio (print, warn, errors) shows up here."));
    }
    box.replaceChildren(...rows);
    if (atBottom) box.scrollTop = box.scrollHeight;
  },
  clear() {
    this.hidden = this.entries.length;
    this.render();
  },
};

/* ═══════════════════════════ activity ═══════════════════════════ */

function summarizeArgs(args) {
  return Object.entries(args || {})
    .filter(([k]) => k !== "studio_id")
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 60 ? `${v.slice(0, 60)}…` : v) : JSON.stringify(v)}`)
    .join("  ");
}

function previewResult(result) {
  if (!result) return "";
  return (result.content || []).map((c) => (c.type === "text" ? c.text : c.type === "image" ? `[image, ${Math.round((c.data || "").length * 0.75 / 1024)} KB]` : JSON.stringify(c))).join("\n").slice(0, 6000);
}

const activity = {
  items: [],
  seq: 0,
  open: new Set(),
  begin(name, args, quiet) {
    const item = { id: ++this.seq, name, args, at: Date.now(), status: "running", ms: null, result: null, error: null };
    const add = () => {
      this.items.unshift(item);
      if (this.items.length > 300) this.items.length = 300;
      this.renderSoon();
    };
    if (!quiet) add();
    return {
      end: (result, ms) => {
        item.status = result?.isError ? "err" : "ok";
        item.ms = ms;
        item.result = result;
        if (quiet && result?.isError) add();
        this.renderSoon();
      },
      fail: (err) => {
        item.status = "err";
        item.error = err.message;
        if (quiet) add();
        this.renderSoon();
      },
    };
  },
  renderSoon() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = null;
      this.render();
    });
  },
  render() {
    const box = $("#activity");
    const count = $("#activity-count");
    const running = this.items.filter((i) => i.status === "running").length;
    count.textContent = running ? String(running) : "";
    if (!this.items.length) return box.replaceChildren(el("div", { class: "empty" }, "Every MCP call this page makes is listed here, with its arguments, result and timing."));
    const rows = [];
    for (const item of this.items) {
      const status = item.status === "running" ? el("span", { class: "spinner sm" }) : el("span", { class: `act-status ${item.status}`, html: icon(item.status === "ok" ? "check" : "close") });
      rows.push(el("div", { class: "act-row", "data-id": String(item.id), onclick: () => { this.open.has(item.id) ? this.open.delete(item.id) : this.open.add(item.id); this.render(); } },
        el("span", { class: "t" }, fmtTime(item.at)), status, el("code", {}, item.name), el("span", { class: "args" }, summarizeArgs(item.args)),
        el("span", { class: "ms" }, item.ms != null ? `${item.ms} ms` : "")));
      if (this.open.has(item.id)) {
        rows.push(el("div", { class: "act-detail" },
          el("div", { class: "label" }, "Arguments"), jsonView(item.args),
          el("div", { class: "label" }, item.error ? "Error" : "Result"), el("pre", {}, item.error || previewResult(item.result) || "…")));
      }
    }
    box.replaceChildren(...rows);
  },
};

/* ═══════════════════════════ command palette ═══════════════════════════ */

function fuzzyScore(text, query) {
  const t = text.toLowerCase();
  const at = t.indexOf(query);
  if (at >= 0) return 1000 - at;
  let from = 0;
  let score = 0;
  for (const ch of query) {
    const found = t.indexOf(ch, from);
    if (found < 0) return 0;
    score += found === from ? 3 : 1;
    from = found + 1;
  }
  return score;
}

const palette = {
  items: [],
  index: 0,
  isOpen: () => !$("#palette").hidden,
  commands() {
    const inIde = S.view === "ide";
    const list = [
      { label: "Capture the viewport", hint: "Viewport", when: inIde, run: () => { switchTab("viewport"); viewport.capture(); } },
      { label: "Run the Luau editor", hint: "Ctrl+Enter", when: inIde, run: () => { switchTab("luau"); luau.run(); } },
      { label: "Start a playtest", hint: "Play", when: inIde && !S.studio.playing, run: () => setPlaying(true) },
      { label: "Stop the playtest", hint: "Stop", when: inIde && S.studio.playing, run: () => setPlaying(false) },
      { label: "Find a script…", hint: "Scripts", when: inIde, run: () => { switchTab("script"); $("#script-find").focus(); } },
      { label: "Search inside scripts…", hint: "Scripts", when: inIde, run: () => { switchTab("script"); $("#script-grep").focus(); } },
      { label: "New script…", hint: "Scripts", when: inIde, run: () => scripts.create() },
      { label: "Find an instance…", hint: "Explorer", when: inIde, run: () => $("#explorer-search").focus() },
      { label: "Reload the Explorer", hint: "Explorer", when: inIde, run: () => explorer.reload() },
      { label: "Open the remote desktop", hint: "New tab", when: Boolean(desktopUrl()), run: openDesktop },
      { label: "Machine details", hint: "Cost, actions, MCP client setup", when: Boolean(S.overview), run: () => drawer.open() },
      { label: "Relaunch Roblox Studio", hint: "Machine", when: S.overview?.instance?.status === "running" && !jobRunning(), run: () => runSetup("launch") },
      { label: "Repair the MCP bridge", hint: "Machine", when: S.overview?.instance?.status === "running" && !jobRunning(), run: () => runSetup("bridge") },
      { label: "Destroy the machine", hint: "Stops billing", when: Boolean(S.overview?.instance) && !jobRunning(), run: destroyMachine },
      { label: "Switch light / dark theme", hint: "Appearance", when: true, run: toggleTheme },
    ];
    if (inIde && tools.list) for (const tool of tools.list) list.push({ label: `Tool: ${tool.name}`, hint: firstLine(tool.description), when: true, run: () => { switchTab("tools"); toolsPane.select(tool.name); } });
    return list.filter((c) => c.when);
  },
  open() {
    $("#palette").hidden = false;
    const input = $("#palette-input");
    input.value = "";
    this.refresh();
    input.focus();
  },
  close() {
    $("#palette").hidden = true;
  },
  refresh() {
    const query = $("#palette-input").value.trim().toLowerCase();
    const all = this.commands();
    this.items = query
      ? all.map((c) => [c, Math.max(fuzzyScore(c.label, query), fuzzyScore(c.hint || "", query) / 4)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c)
      : all;
    this.index = 0;
    this.render();
  },
  render() {
    const box = $("#palette-list");
    if (!this.items.length) return box.replaceChildren(el("div", { class: "empty" }, "Nothing matches."));
    box.replaceChildren(...this.items.slice(0, 60).map((item, i) =>
      el("button", { class: `palette-item${i === this.index ? " active" : ""}`, type: "button", role: "option", "aria-selected": String(i === this.index), onclick: () => this.choose(i), onmousemove: () => { if (this.index !== i) { this.index = i; this.render(); } } },
        el("span", { class: "pi-label" }, item.label), el("span", { class: "pi-hint" }, item.hint || ""))));
    box.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  },
  choose(i = this.index) {
    const item = this.items[i];
    this.close();
    item?.run();
  },
  onKey(event) {
    if (event.key === "ArrowDown") this.index = Math.min(this.index + 1, this.items.length - 1);
    else if (event.key === "ArrowUp") this.index = Math.max(this.index - 1, 0);
    else if (event.key === "Enter") return this.choose();
    else if (event.key === "Escape") return this.close();
    else return;
    event.preventDefault();
    this.render();
  },
};

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("theme", next);
}

/* ═══════════════════════════ wiring ═══════════════════════════ */

function bindEvents() {
  // top bar
  $("#machine-pill").addEventListener("click", () => (drawer.isOpen() ? drawer.close() : drawer.open()));
  $("#drawer-close").addEventListener("click", () => drawer.close());
  $("#scrim").addEventListener("click", () => drawer.close());
  $("#btn-desktop").addEventListener("click", openDesktop);
  $("#btn-theme").addEventListener("click", toggleTheme);
  $("#btn-palette").addEventListener("click", () => palette.open());
  $("#btn-play").addEventListener("click", () => setPlaying(true));
  $("#btn-stop").addEventListener("click", () => setPlaying(false));
  $("#studio-select").addEventListener("change", (event) => {
    S.studioId = event.target.value;
    store.set("studioId", S.studioId);
    onStudioChanged();
  });

  // rent
  let filterTimer = null;
  for (const id of ["#f-price", "#f-cpu", "#f-gpu"]) {
    $(id).addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => rent.load(), 450);
    });
  }
  $("#f-refresh").addEventListener("click", () => rent.load());
  $("#rent-best").addEventListener("click", () => startRent(null));

  // job
  $("#job-stop").addEventListener("click", async () => {
    const ok = await dialog({
      title: "Stop this operation?",
      body: ["Work that already started on the machine may keep going, and a rented machine keeps billing until you destroy it."],
      confirm: "Stop",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post("/api/jobs/stop");
    } catch (err) {
      toast(err.message, "error");
    }
    refreshOverview();
  });
  $("#job-dismiss").addEventListener("click", () => {
    S.showJob = false;
    S.dismissedJob = S.job.id;
    store.set("dismissedJob", S.job.id);
    updateView();
  });
  $("#job-retry").addEventListener("click", () => {
    const summary = S.job.summary;
    if (summary?.action === "setup") runSetup(summary.phase || "all");
  });
  $("#job-destroy").addEventListener("click", destroyMachine);
  $("#job-copy").addEventListener("click", () => copyText(S.job.lines.join("\n"), "Log copied"));

  // shared buttons
  document.addEventListener("click", (event) => {
    const setup = event.target.closest("[data-setup]");
    if (setup) runSetup(setup.dataset.setup);
    if (event.target.closest("[data-action='destroy']")) destroyMachine();
  });
  $("#setup-refresh").addEventListener("click", (event) => refreshConnection(event.currentTarget));
  $("#connect-refresh").addEventListener("click", (event) => refreshConnection(event.currentTarget));
  $("#connect-desktop").addEventListener("click", openDesktop);
  $("#connect-shot").addEventListener("click", openDesktop);
  $("#shot-refresh").addEventListener("click", () => connect.shot(true));
  $("#shot-auto").addEventListener("change", (event) => store.set("shotAuto", event.target.checked));
  $("#shot-auto").checked = store.get("shotAuto", true);

  // tabs and narrow-screen panes
  $("#center-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) switchTab(button.dataset.tab);
  });
  $("#bottom-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    const tab = button.dataset.tab;
    for (const b of $$("#bottom-tabs [data-tab]")) b.classList.toggle("active", b === button);
    for (const panel of $$(".pane-bottom .tab-panel")) panel.classList.toggle("active", panel.dataset.panel === tab);
    for (const group of $$(".bottom-tools")) group.hidden = group.dataset.for !== tab;
    if (tab === "activity") activity.render();
  });
  $("#toggle-explorer").addEventListener("click", () => $("#ide").classList.toggle("show-explorer"));
  $("#toggle-props").addEventListener("click", () => $("#ide").classList.toggle("show-props"));

  // explorer
  const tree = $("#tree");
  tree.addEventListener("click", (event) => {
    const row = event.target.closest(".tree-row");
    if (!row) return;
    if (event.target.closest(".caret") && !row.dataset.search) explorer.toggle(row.dataset.path);
    else explorer.select(row.dataset.path);
  });
  tree.addEventListener("dblclick", (event) => {
    const row = event.target.closest(".tree-row");
    if (!row) return;
    const node = explorer.nodes.get(row.dataset.path);
    const className = node?.className || row.dataset.class;
    if (isScriptClass(className)) scripts.open(row.dataset.path);
    else if (row.dataset.search) explorer.reveal(row.dataset.path);
    else explorer.toggle(row.dataset.path);
  });
  tree.addEventListener("keydown", (event) => explorer.onKey(event));
  $("#explorer-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("#explorer-search").value.trim();
    $("#explorer-search-clear").hidden = !query;
    explorer.runSearch(query);
  });
  $("#explorer-search").addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#explorer-search-clear").click();
  });
  $("#explorer-search-clear").addEventListener("click", () => {
    $("#explorer-search").value = "";
    $("#explorer-search-clear").hidden = true;
    explorer.runSearch("");
  });
  $("#explorer-refresh").addEventListener("click", () => explorer.reload());
  $("#explorer-dm").addEventListener("change", () => explorer.reload());
  $("#props-refresh").addEventListener("click", () => props.fetch());

  // viewport
  $("#vp-capture").addEventListener("click", () => viewport.capture());
  $("#vp-auto").addEventListener("change", (event) => viewport.setAuto(Number(event.target.value)));
  $("#vp-look").addEventListener("click", () => viewport.lookAtSelection());
  $("#vp-download").addEventListener("click", () => viewport.download());
  $("#vp-camera-toggle").addEventListener("click", (event) => {
    const row = $("#vp-camera");
    row.hidden = !row.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!row.hidden));
  });
  $("#vp-camera").addEventListener("submit", (event) => {
    event.preventDefault();
    const position = parseVector($("#vp-pos").value);
    const lookAt = parseVector($("#vp-look-at").value);
    if (!position || !lookAt) {
      toast("Enter both positions as three numbers, e.g. 20, 15, 20", "warn");
      return;
    }
    viewport.capture({ position, lookAt });
  });

  // luau
  $("#luau-run").addEventListener("click", () => luau.run());
  $("#luau-clear").addEventListener("click", () => {
    luau.runs = [];
    store.set("luauRuns", []);
    luau.renderRuns();
  });
  $("#luau-snippets").addEventListener("change", (event) => {
    const snippet = SNIPPETS[Number(event.target.value)];
    event.target.value = "";
    if (!snippet) return;
    luau.editor.setValue(snippet[1]);
    store.set("luauCode", snippet[1]);
    luau.editor.focus();
  });

  // scripts
  $("#script-find-form").addEventListener("submit", (event) => {
    event.preventDefault();
    scripts.search("find", $("#script-find").value.trim());
  });
  $("#script-grep-form").addEventListener("submit", (event) => {
    event.preventDefault();
    scripts.search("grep", $("#script-grep").value.trim());
  });
  $("#script-save").addEventListener("click", () => scripts.save());
  $("#script-reload").addEventListener("click", () => scripts.reload());
  $("#script-new").addEventListener("click", () => scripts.create());

  // tools
  $("#tool-filter").addEventListener("input", () => toolsPane.renderList());

  // output & activity
  $("#output-filter").addEventListener("input", (event) => {
    output.filter = event.target.value;
    output.render();
  });
  for (const button of $$("#output-levels button")) {
    button.classList.toggle("on", output.levels.has(button.dataset.level));
    button.addEventListener("click", () => {
      const level = button.dataset.level;
      output.levels.has(level) ? output.levels.delete(level) : output.levels.add(level);
      button.classList.toggle("on", output.levels.has(level));
      store.set("outputLevels", [...output.levels]);
      output.render();
    });
  }
  $("#output-pause").addEventListener("click", (event) => {
    output.paused = !output.paused;
    const button = event.currentTarget;
    button.classList.toggle("on", output.paused);
    button.innerHTML = icon(output.paused ? "play" : "pause");
    button.title = output.paused ? "Resume live output" : "Pause live output";
    if (!output.paused) output.poll(true);
  });
  $("#output-clear").addEventListener("click", () => output.clear());
  $("#activity-clear").addEventListener("click", () => {
    activity.items = activity.items.filter((i) => i.status === "running");
    activity.render();
  });

  // palette & shortcuts
  $("#palette-input").addEventListener("input", () => palette.refresh());
  $("#palette-input").addEventListener("keydown", (event) => palette.onKey(event));
  $("#palette").addEventListener("mousedown", (event) => {
    if (event.target === $("#palette")) palette.close();
  });
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      palette.isOpen() ? palette.close() : palette.open();
    } else if (mod && event.key.toLowerCase() === "s" && S.view === "ide" && S.centerTab === "script") {
      event.preventDefault();
      scripts.save();
    } else if (event.key === "Escape") {
      if (palette.isOpen()) palette.close();
      else if (drawer.isOpen()) drawer.close();
      else $("#ide").classList.remove("show-explorer", "show-props");
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (scripts.dirty?.()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshOverview();
  });
}

function tick() {
  const inst = S.overview?.instance;
  if (inst?.status === "running" && inst.start_date) {
    $("#pill-sub").textContent = costLine(inst);
    const uptime = $("#drawer-uptime");
    if (uptime) uptime.textContent = fmtDuration(Date.now() / 1000 - inst.start_date);
    const spent = $("#drawer-spent");
    if (spent) spent.textContent = fmtMoney((inst.dph * (Date.now() / 1000 - inst.start_date)) / 3600);
  }
  if (S.view === "job" && S.job.summary?.status === "running") {
    const summary = S.job.summary;
    $("#job-meta").textContent = `Started ${fmtTime(summary.started * 1000)} · ${fmtDuration(Date.now() / 1000 - summary.started)} so far`;
  }
  if (S.view === "connect") connect.render();
}

function init() {
  for (const node of $$("[data-icon]")) {
    const holder = document.createElement("span");
    holder.innerHTML = icon(node.dataset.icon);
    node.replaceWith(holder.firstChild);
  }
  for (const id of ["#explorer-dm", "#luau-dm"]) $(id).replaceChildren(el("option", { value: "Edit" }, "Edit"));
  bindEvents();
  initSplitters();
  const auto = store.get("viewportAuto", 0);
  $("#vp-auto").value = String(auto);
  if (auto) viewport.setAuto(auto);
  output.render();
  activity.render();
  toolsPane.renderList();
  every(() => (jobRunning() ? 1500 : 5000), refreshOverview);
  every(() => (S.view === "connect" ? 3000 : 9000), pollStudios);
  setInterval(tick, 1000);
}

init();
