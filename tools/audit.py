#!/usr/bin/env python3
"""Public site audit: routes, security headers, JS syntax, dash rule.

Usage: python3 tools/audit.py [BASE]
Writes public/audit.json. Python 3 stdlib only.
"""
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://opaline-production.up.railway.app"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
UA = {"User-Agent": "LustreAudit/1.0"}
TIMEOUT = 15

ROUTES = ["/", "/markets", "/baskets", "/pools", "/earn", "/lend", "/strategies",
          "/issuers", "/compare", "/auto-invest", "/orders", "/agent", "/portfolio",
          "/watchlist", "/docs", "/swap", "/alerts", "/terms", "/privacy", "/risk",
          "/roadmap", "/security", "/yield", "/api/health"]

HEADER_RULES = [
    ("x-content-type-options", lambda h: "x-content-type-options" in h),
    ("x-frame-options or content-security-policy (frame-ancestors)",
     lambda h: "x-frame-options" in h or ("content-security-policy" in h and "frame-ancestors" in h.get("content-security-policy", ""))),
    ("referrer-policy", lambda h: "referrer-policy" in h),
    ("strict-transport-security", lambda h: "strict-transport-security" in h),
]

DASHES = {"\u2014": "em dash", "\u2013": "en dash"}


def get(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read()
            return r.status, dict((k.lower(), v) for k, v in r.headers.items()), body, int((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, dict((k.lower(), v) for k, v in e.headers.items()), b"", int((time.time() - t0) * 1000)
    except Exception as e:
        return 0, {}, b"", int((time.time() - t0) * 1000)


def node_check(path):
    """Run node --check on a file. Returns (ok, detail)."""
    if not shutil.which("node"):
        return None, "node not found, skipped"
    p = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    if p.returncode == 0:
        return True, "node --check OK"
    return False, "syntax error: " + p.stderr.strip().splitlines()[-1][:120] if p.stderr.strip() else "syntax error"


def extract_inline(html):
    """Return list of inline <script> block contents (no src attribute)."""
    out = []
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if re.search(r"\bsrc\s*=", attrs, re.I):
            continue
        out.append(body)
    return out


def main():
    groups = []

    # a) Routes
    checks = []
    for route in ROUTES:
        status, _, _, ms = get(route)
        checks.append({"name": "GET " + route, "ok": status == 200,
                       "detail": "%d, %dms" % (status, ms)})
    groups.append({"name": "Routes", "checks": checks})

    # b) Security headers on "/"
    status, headers, _, _ = get("/")
    checks = []
    for name, test in HEADER_RULES:
        ok = status == 200 and test(headers)
        checks.append({"name": name, "ok": bool(ok),
                       "detail": "present" if ok else "missing"})
    groups.append({"name": "Security headers", "checks": checks})

    # c) JS syntax
    checks = []
    node = shutil.which("node")
    for path in sorted(glob.glob(os.path.join(PUB, "*.js"))):
        if node is None:
            checks.append({"name": os.path.basename(path), "ok": True,
                           "detail": "skipped: node not found"})
            continue
        ok, detail = node_check(path)
        checks.append({"name": os.path.basename(path), "ok": ok, "detail": detail})
    for path in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        name = os.path.basename(path)
        if node is None:
            checks.append({"name": name + " (inline)", "ok": True,
                           "detail": "skipped: node not found"})
            continue
        with open(path, encoding="utf-8", errors="replace") as f:
            html = f.read()
        blocks = extract_inline(html)
        if not blocks:
            checks.append({"name": name + " (inline)", "ok": True, "detail": "no inline scripts"})
            continue
        ok_all, first_err = True, ""
        for i, block in enumerate(blocks):
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tf:
                tf.write(block)
                tmp = tf.name
            try:
                ok, detail = node_check(tmp)
                if ok is False:
                    ok_all = False
                    first_err = "block %d: %s" % (i + 1, detail)
            finally:
                os.unlink(tmp)
        checks.append({"name": name + " (inline)", "ok": ok_all,
                       "detail": "%d block(s), OK" % len(blocks) if ok_all else first_err})
    groups.append({"name": "JS syntax", "checks": checks})

    # d) Dash rule
    checks = []
    total = 0
    for path in (sorted(glob.glob(os.path.join(PUB, "*.html")))
                 + sorted(glob.glob(os.path.join(PUB, "*.js")))
                 + sorted(glob.glob(os.path.join(PUB, "*.css")))):
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        found = [(c, text.count(c)) for c in DASHES if c in text]
        n = sum(cnt for _, cnt in found)
        rel = os.path.relpath(path, ROOT)
        if n:
            total += n
            checks.append({"name": rel, "ok": False,
                           "detail": "%d dash char(s): %s" % (n, ", ".join("%s x%d" % (DASHES[c], cnt) for c, cnt in found))})
    checks.append({"name": "public/*.html, *.js, *.css", "ok": total == 0,
                   "detail": "%d em/en dashes found" % total if total else "0 em/en dashes"})
    groups.append({"name": "Dash rule", "checks": checks})

    all_checks = [c for g in groups for c in g["checks"]]
    passed = sum(1 for c in all_checks if c["ok"])
    result = {"ts": int(time.time()), "base": BASE,
              "summary": {"passed": passed, "failed": len(all_checks) - passed, "total": len(all_checks)},
              "groups": groups}
    out = os.path.join(PUB, "audit.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print("wrote %s: %d passed, %d failed, %d total" % (out, passed, len(all_checks) - passed, len(all_checks)))
    for g in groups:
        bad = [c["name"] for c in g["checks"] if not c["ok"]]
        print("  %-18s %d/%d%s" % (g["name"], len(g["checks"]) - len(bad), len(g["checks"]),
                                   ("  FAIL: " + ", ".join(bad)) if bad else ""))


if __name__ == "__main__":
    main()
