# Opaline page build spec

Opaline is an original, self-custodial marketplace for tokenized real-world assets (stocks, ETFs, gold, treasuries).
Stack: static HTML pages in `projects/opaline/public/`, served by `projects/opaline/server.py` (already done, do NOT edit it),
shared CSS `public/styles.css` and shared JS `public/shell.js` (already done; read both fully before writing pages, do NOT edit them).
Reference page to imitate for structure and quality: `public/index.html`.

## Hard rules
- NEVER use em dashes or en dashes (the characters U+2014 and U+2013) anywhere: text, code, comments. Use periods, commas, colons, parentheses.
- All copy is original, confident and clean. No disclaimers like "honest limits". Never mention any competitor.
- No external JS libraries or CDNs. Vanilla JS only, inline `<script>` at the end of each page, run inside `document.addEventListener('DOMContentLoaded', async () => { ... })` (shell.js is `defer`, so `window.O` exists then).
- Every page = `_head.txt` with `__TITLE__` and `__DESC__` replaced (use sed or python), then `<main>` ... `</main>`, optional `<style>` for page-only CSS, `<script>`, then `</body></html>`. Header, footer, aura background, theme, wallet, command palette are injected by shell.js automatically. Do not add your own header/footer.
- Content goes inside `<main><section class="wrap">...`. Start with a `.page-head` containing `<span class="eyebrow rv">`, `<h1 class="title rv rv-1">Words with <em>italic gradient</em></h1>`, `<p class="lead rv rv-2">`.
- Use `.rv` / `.rv-1..4` classes for scroll reveal on cards and sections (auto-observed, also for dynamically inserted nodes).
- Every data-driven region shows a `.skel` skeleton while loading, and an `.empty` state (`<div class="empty"><span class="serif">Title</span>text</div>`) on no data or error. Never leave a blank area or a raw error.
- Must work on mobile (<=680px): use `.grid.g2/.g3/.g4` (they collapse), `.tbl-wrap` for tables (horizontal scroll).
- All user-entered or API text must go through `O.esc()` before innerHTML.
- No console errors. Test each page: `python3 - <<EOF` with playwright is available (`from playwright.sync_api import sync_playwright`), server running at http://localhost:8765 (start one with `cd projects/opaline && PORT=8765 python3 server.py &` if `curl -s localhost:8765/api/health` fails). Load each page, wait 4s, collect `page.on('console')` errors and `pageerror`, screenshot to `projects/opaline/qa/<page>.png` at 1440x900 full_page and 390x844.

## CSS classes available (styles.css)
Layout: `.wrap .grid .g2 .g3 .g4 .row .between .wrapf .col .sp .sp-lg .page-head .divider`
Type: `.eyebrow h1.title .h2 .lead .serif .mono .muted .faint .up .down .grad-text` (`<em>` inside .title/.h2 = gradient italic)
Cards: `.card` (+ `.hover` lift, `.spot` cursor glow, `.flat`, tints `.tint-lav .tint-mint .tint-peach .tint-sky .tint-rose .tint-butter`), `.stat` with `.k .v .s`
Controls: `.btn` + `.btn-primary .btn-grad .btn-soft .btn-ghost .btn-danger .btn-sm .btn-lg .btn-block .magnet`, `.icon-btn`, `.chip` (+ `.lav .mint .peach .sky .rose .butter`), `.tabs > button.on`, `.input` (input/select/textarea), `.search` (wrap: svg + input.input), `.lbl`, `.field`
Tables: `.tbl-wrap > table.tbl` with `th[data-k]` sortable, `th.r/td.r` right aligned, `.asset-cell` (img + div with b + small), `.star`
Misc: `.skel` (give height), `.empty`, `.pulse`, `.kv` rows (two spans), `.bar-track > .bar-fill` (style width), `.route-step`, `.pie-legend span.sw`, `.marquee > .marquee-track`, `.tick`

## window.O API (shell.js)
Formatting: `O.usd(v, decimals?)`, `O.compact(v, prefix='$')` (1.2B), `O.pct(v, d=2)` (+1.23%), `O.pctCls(v)` -> 'up'|'down', `O.num(v, d)`, `O.short(addr)`, `O.ago(ms)`, `O.esc(s)`, `O.h(html)` -> element, `O.$ / O.$$`
UI: `O.img(src, alt)` -> `<img>` html with fallback, `O.classChip(cls)`, `O.CLASS` map {stock, etf, commodity, treasury, credit, preipo, basket} -> {label, tint}, `O.starBtn(assetId)` watchlist star html (click handled globally),
 `O.spark(arr, w, h)` svg html, `O.areaChart(el, [[tsMs, value],...], {height, fmt})` interactive chart, `O.donut([{label,value,color}], size, stroke)` svg html, `O.PALETTE` (10 pastel hex colors),
 `O.toast(html, 'ok'|'err'|'')`, `O.modal(titleHtml, bodyHtmlOrEl, {wide, onClose})` -> {el, body, close}, `O.confirm(title, text, okLabel)` -> Promise<bool>,
 `O.countUp(el, number, fmtFn)`, `O.reveal()`, `O.sortable(theadEl, state{key,dir}, redrawFn)` + `O.sortBy(arr, state)`, `O.icon.<name>` svg strings (search, swap, wallet, chart, layers, drop, leaf, bank, spark, target, repeat, building, scale, bell, book, star, pie, x, down, sun, moon, menu)
Data: `await O.api(path, {ttl})` GET `/api/<path>` JSON (throws Error with message on failure), `await O.assets()` -> Asset[], `await O.assetMap()` -> {id: Asset}
Storage: `O.store.get(key, default)`, `O.store.set(key, value)` (localStorage JSON, prefix opal:, fires window event 'opal:store'), `O.uid()`, `O.watch.list() / has(id) / toggle(id)`
Wallet: `O.wallet` = {account, chainId, provider, connect(), ensure() -> account|false, disconnect(), switchChain(id), balances(addr) -> {chainId: [{address,symbol,decimals,amount(string wei),priceUSD,name,logoURI}]}, on(fn) (called on account/chain change)}; `O.CHAINS` {chainId: {name, exp}}, `O.chainName(id)`
Trading: `O.buy(assetOrId, {side:'buy'|'sell', amount, title, kind, ref, onDone})` opens the full trade sheet (quote, approve, execute, track). Any element with `data-buy="<assetId>"` (optional `data-side="sell"`) opens it on click.
 `O.openSwap({asset?, toChain?, toToken?, toSymbol?, toLogo?, fromChain?, fromToken?, amount?, title?, kind?, ref?, onDone?})`,
 `O.bestChain(asset)` -> {chainId, address} or null, `O.quote({fromChain,toChain,fromToken,toToken,fromAmount(units string),fromAddress?,toAddress?,slippage})` -> LI.FI quote, `O.execute(quote, {kind, ref})` -> txHash,
 `O.tokens(chainId)` LI.FI token list, `O.stableOn(chainId)` USDC token, `O.toUnits(amount, decimals)` BigInt, `O.fromUnits(wei, dec)` number, `O.NATIVE`, `O.isSol(chainId)`, `O.explorerTx(chainId, hash)`
 `O.history.list()` -> [{id, hash, ts, status PENDING|DONE|FAILED, fromChain, toChain, from{symbol,amount,logo}, to{symbol,amount,logo}, usd, kind, ref}]
Watchers (already run every 45s on every page): `O.store 'alerts'` [{id(assetId), type 'above'|'below'|'move', value, created, fired?, firedAt?}],
 `'orders'` [{oid, id(assetId), symbol, side 'buy'|'sell', limit, usd, status 'open'|'triggered'|'filled'|'cancelled'|'expired', created, expires?, triggeredAt?, triggerPrice?}],
 `'dca'` [{pid, name, items:[{id, w}], amount(usd per run), freq 'daily'|'weekly'|'biweekly'|'monthly', next(ms), due?, paused?, runs:[{ts, usd}] , created}], `O.DCA_MS` freq->ms, `O.notify(title, body)`, `O.askNotify()` -> bool.

## Asset object (from O.assets())
{id (coingecko id), symbol, name, image, class ('stock'|'etf'|'commodity'|'treasury'|'credit'|'preipo'), issuer (slug), issuerName, underlying (ticker, e.g. NVDA, same for all issuers of NVIDIA),
 price, mcap, volume, ch1h, ch24h, ch7d (percent numbers, may be null), high24, low24, ath, supply, spark [~42 numbers over 7d], chains [{platform, chainId, address}]}
~560 assets. Issuers include xStocks, Ondo Global Markets, bStocks, Dinari, Robinhood, Backed, Tether, BlackRock ... and 'Independent'.

## Server endpoints
GET /api/assets {ts, assets}; GET /api/asset/<id> {id,name,symbol,description,home,categories,image,platforms{platform:address},price,mcap,fdv,volume,ath,atl,supply,total_supply,ch24h,ch7d,ch30d,ch1y};
GET /api/chart/<id>?days=1|7|30|90|180|365|max {prices:[[ms,v]], volumes:[[ms,v]]};
GET /api/issuers {issuers:[{id,name,count,mcap,volume,classes{cls:n},chains[chainId],top[{id,symbol,image}]}]};
GET /api/baskets {ts, indexes: Asset-like objects with class 'basket' and category (on-chain index tokens)};
GET /api/yields {ts, yields:[{pool,project,chain,symbol,tvl,apy,apyBase,apyReward,apy30d,il,exposure,stable,meta,underlying[],borrow:null|{apyBaseBorrow,apyRewardBorrow,ltv,totalSupplyUsd,totalBorrowUsd,debtCeilingUsd,borrowable}}]} (DefiLlama pool id in `pool`; link https://defillama.com/yields/pool/<pool>);
GET /api/pools?q=<symbol> {pairs:[{chain,dex,url,pair,base{address,name,symbol},quote{...},price,liq,vol24,ch24,txns{buys,sells},labels,created}]};
POST /api/share {name, note, author, items:[{id, w}]} -> {id}; GET /api/share/<id> -> {name,note,items,author,ts,views}; GET /api/shares -> {shares:[{id,name,items,ts,views,...}]}
GET /api/lifi/<quote|status|tokens|token|chains|tools|gas/prices|wallets/<addr>/balances>?... proxy of li.quest v1.
Clean URLs: /markets /baskets /pools /earn /lend /strategies /issuers /compare /auto-invest /orders /agent /portfolio /watchlist /docs /swap /alerts map to <name>.html; /asset/<id> -> asset.html, /basket/<id> -> basket.html, /issuer/<id> -> issuer.html (read id from location.pathname.split('/')[2]).
