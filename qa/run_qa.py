import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765"

def get(url):
    try:
        return json.load(urllib.request.urlopen(url, timeout=30))
    except Exception:
        return {}

health = get(BASE + "/api/health")
asset_id = ""
for a in get(BASE + "/api/assets").get("assets", []):
    if a.get("chains") and len(a["chains"]) >= 2 and a.get("class") == "stock":
        asset_id = a["id"]; break
print("asset:", asset_id, "assets:", health.get("assets"))

PAGES = [
    ("/markets", "markets"),
    ("/markets?class=etf", "markets_etf"),
    ("/asset/" + asset_id, "asset"),
    ("/compare", "compare"),
    ("/issuers", "issuers"),
    ("/issuer/xstocks", "issuer_xstocks"),
    ("/watchlist", "watchlist"),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for vw, vh, tag in [(1440, 900, "desktop"), (390, 844, "mobile")]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=1)
        for path, name in PAGES:
            page = ctx.new_page()
            errs = []
            page.on("console", lambda m, e=errs: e.append("console: " + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda ex, e=errs: e.append("pageerror: " + str(ex)))
            try:
                page.goto(BASE + path, wait_until="networkidle", timeout=45000)
            except Exception as ex:
                errs.append("goto: " + str(ex))
            page.wait_for_timeout(4000)
            page.screenshot(path=f"/data/workspace/projects/opaline/qa/{name}_{tag}.png", full_page=True)
            n = len(errs)
            print(f"{BASE+path} [{tag}] errors={n}")
            for e in errs[:12]:
                print("   ", e[:300])
            page.close()
        ctx.close()
    b.close()
