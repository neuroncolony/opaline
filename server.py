#!/usr/bin/env python3
"""Opaline server: live RWA market data, routing proxy and static site.

Stdlib only. Background threads refresh caches so page loads never wait on
upstream rate limits. Snapshots persist under DATA_DIR (seed/ ships a copy).
"""
import gzip, json, urllib.error, os, re, secrets, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
SEED = os.path.join(ROOT, "seed")
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(ROOT, "data"))
os.makedirs(DATA_DIR, exist_ok=True)
PORT = int(os.environ.get("PORT", "8080"))
CG = "https://api.coingecko.com/api/v3"
CG_KEY = os.environ.get("OPALINE_CG_KEY", "")
UA = "Mozilla/5.0 (compatible; LustreRWA/1.0)"

CATEGORIES = [
    ("tokenized-stock", "stock"), ("tokenized-exchange-traded-funds-etfs", "etf"),
    ("tokenized-gold", "commodity"), ("tokenized-silver", "commodity"),
    ("tokenized-commodities", "commodity"), ("tokenized-treasuries", "treasury"),
    ("tokenized-money-market-fund-mmfs", "treasury"), ("tokenized-private-credit", "credit"),
    ("tokenized-pre-ipo-stocks", "preipo"),
]
INDEX_CATEGORIES = ["index-coin", "jupiter-dtf", "ondo-intelligent-portfolios"]

PLATFORM_CHAIN = {
    "ethereum": 1, "base": 8453, "arbitrum-one": 42161, "optimistic-ethereum": 10,
    "polygon-pos": 137, "binance-smart-chain": 56, "avalanche": 43114, "mantle": 5000,
    "solana": 1151111081099710, "ink": 57073, "gnosis": 100, "linea": 59144,
    "scroll": 534352, "zksync": 324, "blast": 81457, "sonic": 146, "unichain": 130,
    "berachain": 80094, "sei-v2": 1329, "celo": 42220,
}

def _m(*words):
    return lambda n, s: any(w in n for w in words)

ISSUERS = [
    ("xstocks", "xStocks", lambda n, s: "xstock" in n),
    ("ondo", "Ondo Global Markets", lambda n, s: "(ondo" in n or "ondo tokenized" in n or (s.endswith("on") and len(s) > 3 and "ondo" in n)),
    ("bstocks", "bStocks", _m("bstock")),
    ("robinhood", "Robinhood", _m("robinhood")),
    ("dinari", "Dinari", _m("dinari")),
    ("backed", "Backed", _m("backed")),
    ("prestocks", "PreStocks", _m("prestock")),
    ("paxos", "Paxos", lambda n, s: "pax gold" in n or s == "paxg"),
    ("tether", "Tether", lambda n, s: "tether gold" in n or s == "xaut"),
    ("blackrock", "BlackRock", lambda n, s: "blackrock" in n or s == "buidl"),
    ("franklin", "Franklin Templeton", lambda n, s: "franklin" in n or s == "benji"),
    ("superstate", "Superstate", lambda n, s: "superstate" in n or s in ("ustb", "uscc")),
    ("maple", "Maple", _m("syrup", "maple")),
    ("centrifuge", "Centrifuge", _m("centrifuge", "janus", "anemoy")),
    ("matrixdock", "Matrixdock", lambda n, s: "matrixdock" in n or s in ("xaum", "stbt")),
    ("openeden", "OpenEden", lambda n, s: "openeden" in n or s in ("tbill", "usdo")),
    ("ondofi", "Ondo Finance", lambda n, s: s in ("usdy", "ousg") or "ondo" in n),
    ("wisdomtree", "WisdomTree", _m("wisdomtree")),
    ("spiko", "Spiko", _m("spiko")),
]

_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_lock = threading.Lock()
STATE = {"assets": [], "assets_ts": 0, "platforms": {}, "indexes": [], "indexes_ts": 0,
         "yields": [], "yields_ts": 0}
CACHE = {}

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

def fetch_json(url, timeout=25, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip"}
    if CG_KEY and url.startswith(CG):
        h["x-cg-demo-api-key"] = CG_KEY
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with _OPENER.open(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw)

def save(name, obj):
    tmp = os.path.join(DATA_DIR, name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, os.path.join(DATA_DIR, name))

def load(name, default):
    for d in (DATA_DIR, SEED):
        p = os.path.join(d, name)
        if os.path.exists(p):
            try:
                with open(p) as f:
                    return json.load(f)
            except Exception:
                pass
    return default

def cached(key, ttl, fn):
    now = time.time()
    hit = CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        val = fn()
    except Exception:
        if hit:
            return hit[1]
        raise
    CACHE[key] = (now + ttl, val)
    if len(CACHE) > 800:
        for k in sorted(CACHE, key=lambda k: CACHE[k][0])[:200]:
            CACHE.pop(k, None)
    return val

def issuer_of(name, symbol):
    n, s = (name or "").lower(), (symbol or "").lower()
    for iid, label, fn in ISSUERS:
        if fn(n, s):
            return iid, label
    return "other", "Independent"

def underlying_of(symbol, issuer):
    s = (symbol or "").upper()
    if issuer == "xstocks" and s.endswith("X") and len(s) > 1: return s[:-1]
    if issuer == "ondo" and s.endswith("ON") and len(s) > 2: return s[:-2]
    if issuer == "dinari" and s.endswith(".D"): return s[:-2]
    if issuer in ("bstocks", "backed") and s.startswith("B") and len(s) > 2: return s[1:]
    if issuer == "robinhood" and s.endswith("R") and len(s) > 2: return s
    return s

def enrich(coin, klass):
    iid, ilabel = issuer_of(coin.get("name"), coin.get("symbol"))
    chains = []
    for p, addr in (STATE["platforms"].get(coin["id"]) or {}).items():
        cid = PLATFORM_CHAIN.get(p)
        if cid and addr:
            chains.append({"platform": p, "chainId": cid, "address": addr})
    spark = (coin.get("sparkline_in_7d") or {}).get("price") or []
    spark = [x for x in spark if x is not None]
    if len(spark) > 42:
        step = len(spark) / 42.0
        spark = [spark[int(i * step)] for i in range(42)]
    return {
        "id": coin["id"], "symbol": (coin.get("symbol") or "").upper(), "name": coin.get("name"),
        "image": coin.get("image"), "class": klass, "issuer": iid, "issuerName": ilabel,
        "underlying": underlying_of(coin.get("symbol"), iid),
        "price": coin.get("current_price"), "mcap": coin.get("market_cap") or 0,
        "volume": coin.get("total_volume") or 0,
        "ch1h": coin.get("price_change_percentage_1h_in_currency"),
        "ch24h": coin.get("price_change_percentage_24h_in_currency", coin.get("price_change_percentage_24h")),
        "ch7d": coin.get("price_change_percentage_7d_in_currency"),
        "high24": coin.get("high_24h"), "low24": coin.get("low_24h"), "ath": coin.get("ath"),
        "supply": coin.get("circulating_supply"), "spark": [round(x, 6) for x in spark],
        "chains": chains,
    }

def cg_markets(category):
    return fetch_json(f"{CG}/coins/markets?vs_currency=usd&category={category}&order=market_cap_desc"
                      "&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d")

def refresh_platforms():
    try:
        rows = fetch_json(f"{CG}/coins/list?include_platform=true", timeout=90)
        m = {r["id"]: r.get("platforms") or {} for r in rows}
        with _lock:
            STATE["platforms"] = m
        save("platforms.json", m)
        log("platforms", len(m))
        for a in STATE["assets"] + STATE["indexes"]:
            a["chains"] = [{"platform": p, "chainId": PLATFORM_CHAIN[p], "address": ad}
                           for p, ad in (m.get(a["id"]) or {}).items() if p in PLATFORM_CHAIN and ad]
    except Exception as e:
        log("platforms fail", e)

def refresh_assets():
    seen, out, ok = set(), [], 0
    for cat, klass in CATEGORIES:
        try:
            rows = cg_markets(cat); ok += 1
            for c in rows:
                if c["id"] in seen or not c.get("current_price"):
                    continue
                seen.add(c["id"]); out.append(enrich(c, klass))
        except Exception as e:
            log("cat fail", cat, e)
        time.sleep(1.2 if CG_KEY else 7)
    if ok >= 4 and len(out) > 20:
        out.sort(key=lambda a: -(a["mcap"] or 0))
        with _lock:
            STATE["assets"], STATE["assets_ts"] = out, time.time()
        save("assets.json", {"ts": STATE["assets_ts"], "assets": out})
        log("assets", len(out), "cats ok", ok)

def refresh_indexes():
    seen, out = set(), []
    for cat in INDEX_CATEGORIES:
        try:
            for c in cg_markets(cat):
                if c["id"] in seen or not c.get("current_price") or not c.get("market_cap"):
                    continue
                seen.add(c["id"]); a = enrich(c, "basket"); a["category"] = cat; out.append(a)
        except Exception as e:
            log("index fail", cat, e)
        time.sleep(1.2 if CG_KEY else 7)
    if out:
        out.sort(key=lambda a: -(a["mcap"] or 0))
        with _lock:
            STATE["indexes"], STATE["indexes_ts"] = out[:120], time.time()
        save("indexes.json", {"ts": STATE["indexes_ts"], "indexes": STATE["indexes"]})
        log("indexes", len(out))

RWA_WORDS = ("xstock", "treasur", "tbill", "t-bill", "paxg", "xaut", "buidl", "ustb", "usdy",
             "ousg", "syrup", "benji", "usyc", "jtrsy", "stbt", "usdtb", "gold")

def refresh_yields():
    try:
        rows = fetch_json("https://yields.llama.fi/pools", timeout=120)["data"]
        syms = {a["symbol"].upper() for a in STATE["assets"] if len(a["symbol"]) >= 3}
        out = []
        for p in rows:
            sym = (p.get("symbol") or "").upper()
            parts = set(re.split(r"[-_/ +]", sym))
            hit = bool(parts & syms) or any(w in sym.lower() for w in RWA_WORDS) or p.get("category") == "RWA"
            if not hit or (p.get("tvlUsd") or 0) < 25000 or (p.get("apy") or 0) > 400:
                continue
            out.append({"pool": p.get("pool"), "project": p.get("project"), "chain": p.get("chain"),
                        "symbol": p.get("symbol"), "tvl": p.get("tvlUsd"), "apy": p.get("apy"),
                        "apyBase": p.get("apyBase"), "apyReward": p.get("apyReward"),
                        "apy30d": p.get("apyMean30d"), "il": p.get("ilRisk"), "exposure": p.get("exposure"),
                        "stable": p.get("stablecoin"), "meta": p.get("poolMeta"),
                        "underlying": p.get("underlyingTokens") or [], "borrow": None})
        out.sort(key=lambda p: -(p["tvl"] or 0))
        out = out[:600]
        try:
            bm = {x["pool"]: x for x in fetch_json("https://yields.llama.fi/lendBorrow", timeout=90)}
            for p in out:
                x = bm.get(p["pool"])
                if x and (x.get("totalBorrowUsd") is not None or x.get("apyBaseBorrow") is not None):
                    p["borrow"] = {k: x.get(k) for k in ("apyBaseBorrow", "apyRewardBorrow", "ltv", "totalSupplyUsd",
                                                        "totalBorrowUsd", "debtCeilingUsd", "borrowable")}
        except Exception as e:
            log("lendBorrow fail", e)
        with _lock:
            STATE["yields"], STATE["yields_ts"] = out, time.time()
        save("yields.json", {"ts": STATE["yields_ts"], "yields": out})
        log("yields", len(out))
    except Exception as e:
        log("yields fail", e)

def worker():
    d = load("assets.json", {}); STATE["assets"], STATE["assets_ts"] = d.get("assets", []), d.get("ts", 0)
    d = load("indexes.json", {}); STATE["indexes"], STATE["indexes_ts"] = d.get("indexes", []), d.get("ts", 0)
    d = load("yields.json", {}); STATE["yields"], STATE["yields_ts"] = d.get("yields", []), d.get("ts", 0)
    STATE["platforms"] = load("platforms.json", {})
    last = {"a": STATE["assets_ts"], "i": STATE["indexes_ts"], "y": STATE["yields_ts"], "p": time.time() if STATE["platforms"] else 0}
    while True:
        now = time.time()
        try:
            if now - last["p"] > 86400:
                refresh_platforms(); last["p"] = time.time()
            if now - last["a"] > 240:
                refresh_assets(); last["a"] = time.time()
            if now - last["i"] > 1800:
                refresh_indexes(); last["i"] = time.time()
            if now - last["y"] > 1800:
                refresh_yields(); last["y"] = time.time()
        except Exception as e:
            log("worker", e)
        time.sleep(15)

_shares = None
def shares():
    global _shares
    if _shares is None:
        _shares = load("shares.json", {})
    return _shares

LIFI_ALLOW = re.compile(r"^(quote|status|tokens|token|chains|tools|gas/prices|wallets/0x[0-9a-fA-F]{40}/balances)$")

ROUTES = {"": "index", "markets": "markets", "baskets": "baskets", "pools": "pools", "earn": "earn",
          "lend": "lend", "strategies": "strategies", "issuers": "issuers", "compare": "compare",
          "auto-invest": "auto-invest", "orders": "orders", "agent": "agent", "portfolio": "portfolio",
          "watchlist": "watchlist", "docs": "docs", "swap": "swap", "alerts": "alerts",
          "terms": "terms", "privacy": "privacy", "risk": "risk", "yield": "yield", "roadmap": "roadmap", "security": "security"}
PREFIX_ROUTES = {"asset": "asset", "basket": "basket", "issuer": "issuer"}
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
        ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"}


class H(BaseHTTPRequestHandler):
    server_version = "Opaline"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype="application/json", cache="no-store"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, separators=(",", ":")).encode()
        elif isinstance(body, str):
            body = body.encode()
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 1200 and not ctype.startswith("image/png")
        if gz:
            body = gzip.compress(body, 6)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if gz:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        try:
            if u.path.startswith("/api/"):
                return self.api(u.path[5:], urllib.parse.parse_qs(u.query), u.query)
            return self.static(u.path)
        except Exception as e:
            log("err", u.path, repr(e)[:200])
            return self.send(502, {"error": "Upstream data source is busy, try again in a moment."})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64000:
            return self.send(413, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self.send(400, {"error": "bad json"})
        if u.path == "/api/share":
            items = body.get("items")
            if not isinstance(items, list) or not (1 <= len(items) <= 20):
                return self.send(400, {"error": "A basket needs 1 to 20 assets."})
            clean = []
            for it in items:
                try:
                    clean.append({"id": re.sub(r"[^a-z0-9-]", "", str(it["id"]).lower())[:80],
                                  "w": round(max(0.0, min(100.0, float(it["w"]))), 2)})
                except Exception:
                    return self.send(400, {"error": "bad item"})
            s = shares()
            if len(s) > 20000:
                return self.send(429, {"error": "share store full"})
            sid = secrets.token_urlsafe(6).replace("-", "a").replace("_", "b")
            s[sid] = {"name": str(body.get("name") or "Untitled basket")[:60], "note": str(body.get("note") or "")[:280],
                      "items": clean, "author": re.sub(r"[^0-9a-fA-Fx]", "", str(body.get("author") or ""))[:42],
                      "ts": int(time.time()), "views": 0}
            with _lock:
                save("shares.json", s)
            return self.send(200, {"id": sid})
        return self.send(404, {"error": "not found"})

    def api(self, p, q, rawq):
        g = lambda k, d=None: (q.get(k) or [d])[0]
        if p == "health":
            return self.send(200, {"ok": True, "assets": len(STATE["assets"]), "assetsAge": int(time.time() - STATE["assets_ts"]),
                                   "yields": len(STATE["yields"]), "indexes": len(STATE["indexes"])})
        if p == "assets":
            return self.send(200, {"ts": STATE["assets_ts"], "assets": STATE["assets"]}, cache="public, max-age=20")
        if p == "baskets":
            return self.send(200, {"ts": STATE["indexes_ts"], "indexes": STATE["indexes"]}, cache="public, max-age=60")
        if p == "yields":
            return self.send(200, {"ts": STATE["yields_ts"], "yields": STATE["yields"]}, cache="public, max-age=120")
        if p == "issuers":
            agg = {}
            for a in STATE["assets"]:
                x = agg.setdefault(a["issuer"], {"id": a["issuer"], "name": a["issuerName"], "count": 0, "mcap": 0,
                                                "volume": 0, "classes": {}, "chains": set(), "top": []})
                x["count"] += 1; x["mcap"] += a["mcap"] or 0; x["volume"] += a["volume"] or 0
                x["classes"][a["class"]] = x["classes"].get(a["class"], 0) + 1
                x["chains"].update(c["chainId"] for c in a["chains"])
                if len(x["top"]) < 6:
                    x["top"].append({"id": a["id"], "symbol": a["symbol"], "image": a["image"]})
            out = sorted(agg.values(), key=lambda x: -x["mcap"])
            for x in out:
                x["chains"] = sorted(x["chains"])
            return self.send(200, {"issuers": out}, cache="public, max-age=60")
        m = re.match(r"^asset/([a-z0-9-]{1,90})$", p)
        if m:
            cid = m.group(1)
            def f():
                d = fetch_json(f"{CG}/coins/{cid}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false")
                md = d.get("market_data") or {}
                return {"id": d["id"], "name": d["name"], "symbol": (d.get("symbol") or "").upper(),
                        "description": re.sub(r"<[^>]+>", "", (d.get("description") or {}).get("en") or "")[:2000],
                        "home": ((d.get("links") or {}).get("homepage") or [""])[0],
                        "categories": d.get("categories") or [], "image": (d.get("image") or {}).get("large"),
                        "platforms": d.get("platforms") or {},
                        "detail_platforms": {k: v.get("decimal_place") for k, v in (d.get("detail_platforms") or {}).items() if v},
                        "price": (md.get("current_price") or {}).get("usd"), "mcap": (md.get("market_cap") or {}).get("usd"),
                        "fdv": (md.get("fully_diluted_valuation") or {}).get("usd"), "volume": (md.get("total_volume") or {}).get("usd"),
                        "ath": (md.get("ath") or {}).get("usd"), "atl": (md.get("atl") or {}).get("usd"),
                        "supply": md.get("circulating_supply"), "total_supply": md.get("total_supply"),
                        "ch24h": md.get("price_change_percentage_24h"), "ch7d": md.get("price_change_percentage_7d"),
                        "ch30d": md.get("price_change_percentage_30d"), "ch1y": md.get("price_change_percentage_1y")}
            return self.send(200, cached("asset:" + cid, 600, f), cache="public, max-age=120")
        m = re.match(r"^chart/([a-z0-9-]{1,90})$", p)
        if m:
            cid, days = m.group(1), g("days", "30")
            if days not in ("1", "7", "30", "90", "180", "365", "max"):
                days = "30"
            def f():
                d = fetch_json(f"{CG}/coins/{cid}/market_chart?vs_currency=usd&days={days}")
                pts = d.get("prices") or []
                if len(pts) > 360:
                    step = len(pts) / 360.0
                    pts = [pts[int(i * step)] for i in range(360)] + [pts[-1]]
                return {"prices": [[int(t), round(v, 6)] for t, v in pts],
                        "volumes": [[int(t), round(v, 2)] for t, v in (d.get("total_volumes") or [])[-120:]]}
            ttl = 300 if days in ("1", "7") else 1800
            return self.send(200, cached(f"chart:{cid}:{days}", ttl, f), cache="public, max-age=120")
        if p == "pools":
            qq = re.sub(r"[^A-Za-z0-9. ]", "", g("q", ""))[:30]
            if not qq:
                return self.send(400, {"error": "q required"})
            def f():
                d = fetch_json("https://api.dexscreener.com/latest/dex/search?q=" + urllib.parse.quote(qq))
                out = []
                for x in (d.get("pairs") or [])[:60]:
                    out.append({"chain": x.get("chainId"), "dex": x.get("dexId"), "url": x.get("url"),
                                "pair": x.get("pairAddress"), "base": x.get("baseToken"), "quote": x.get("quoteToken"),
                                "price": x.get("priceUsd"), "liq": (x.get("liquidity") or {}).get("usd"),
                                "vol24": (x.get("volume") or {}).get("h24"), "ch24": (x.get("priceChange") or {}).get("h24"),
                                "txns": (x.get("txns") or {}).get("h24"), "labels": x.get("labels") or [],
                                "created": x.get("pairCreatedAt")})
                return {"pairs": out}
            return self.send(200, cached("pools:" + qq.lower(), 180, f), cache="public, max-age=60")
        m = re.match(r"^share/([A-Za-z0-9]{4,16})$", p)
        if m:
            s = shares().get(m.group(1))
            if not s:
                return self.send(404, {"error": "not found"})
            s["views"] = s.get("views", 0) + 1
            return self.send(200, s)
        if p == "shares":
            s = shares()
            top = sorted(({"id": k, **v} for k, v in s.items()), key=lambda x: -(x.get("views", 0) * 3 + x["ts"] / 86400))[:30]
            return self.send(200, {"shares": top})
        if p.startswith("lifi/"):
            sub = p[5:]
            if not LIFI_ALLOW.match(sub):
                return self.send(404, {"error": "route not allowed"})
            url = "https://li.quest/v1/" + sub + ("?" + rawq if rawq else "")
            ttl = {"chains": 3600, "tools": 3600, "tokens": 900, "token": 300, "gas/prices": 60}.get(sub, 0)
            def f():
                h = {}
                if os.environ.get("LIFI_API_KEY"):
                    h["x-lifi-api-key"] = os.environ["LIFI_API_KEY"]
                return fetch_json(url, timeout=40, headers=h)
            try:
                data = cached("lifi:" + url, ttl, f) if ttl else f()
            except urllib.error.HTTPError as e:
                try:
                    detail = json.loads(e.read())
                except Exception:
                    detail = {"message": str(e)}
                return self.send(e.code if e.code < 500 else 502, {"error": detail.get("message") or "No route found", "code": detail.get("code")})
            return self.send(200, data, cache=("public, max-age=%d" % min(ttl, 300)) if ttl else "no-store")
        return self.send(404, {"error": "unknown endpoint"})

    def static(self, path):
        path = urllib.parse.unquote(path)
        if ".." in path:
            return self.send(400, "bad path", "text/plain")
        seg = path.strip("/").split("/")
        page = None
        if len(seg) == 1 and seg[0] in ROUTES:
            page = ROUTES[seg[0]]
        elif len(seg) == 2 and seg[0] in PREFIX_ROUTES:
            page = PREFIX_ROUTES[seg[0]]
        if page:
            fp = os.path.join(PUBLIC, page + ".html")
        else:
            fp = os.path.join(PUBLIC, path.lstrip("/"))
        if not os.path.isfile(fp):
            fp404 = os.path.join(PUBLIC, "404.html")
            with open(fp404, "rb") as f:
                return self.send(404, f.read(), "text/html; charset=utf-8")
        ext = os.path.splitext(fp)[1].lower()
        with open(fp, "rb") as f:
            data = f.read()
        cache = "no-cache" if ext == ".html" else "public, max-age=300"
        return self.send(200, data, MIME.get(ext, "application/octet-stream"), cache)


if __name__ == "__main__":
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    srv.daemon_threads = True
    log("Opaline on", PORT, "data", DATA_DIR)
    srv.serve_forever()
