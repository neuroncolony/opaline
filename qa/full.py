import json,urllib.request,sys
from playwright.sync_api import sync_playwright
B='http://localhost:8765'
a=json.load(urllib.request.urlopen(B+'/api/assets'))['assets']
aid=[x for x in a if x['chains'] and x['volume']>1e5][0]['id']
req=urllib.request.Request(B+'/api/share',data=json.dumps({"name":"QA","items":[{"id":a[0]['id'],"w":50},{"id":a[1]['id'],"w":50}]}).encode(),headers={'Content-Type':'application/json'})
sid=json.load(urllib.request.urlopen(req))['id']
urls=['/','/markets','/asset/'+aid,'/compare','/issuers','/issuer/xstocks','/watchlist','/baskets','/basket/'+sid,'/strategies','/pools','/earn','/lend','/swap','/orders','/auto-invest','/alerts','/agent','/portfolio','/docs']
with sync_playwright() as p:
    b=p.chromium.launch()
    for u in urls:
        for vw in [(1440,900),(390,844)]:
            errs=[]; pg=b.new_page(viewport={'width':vw[0],'height':vw[1]})
            pg.on('pageerror',lambda e:errs.append('PE '+str(e)[:160])); pg.on('console',lambda m:m.type=='error' and 'Failed to load resource' not in m.text and errs.append('CE '+m.text[:160]))
            try: pg.goto(B+u,wait_until='networkidle',timeout=30000)
            except Exception as e: errs.append('NAV '+str(e)[:80])
            pg.wait_for_timeout(3500)
            ow=pg.evaluate('document.documentElement.scrollWidth>innerWidth+2')
            if vw[0]==1440:
                pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))"); pg.wait_for_timeout(700)
                pg.screenshot(path='qa/s_'+(u.strip('/').split('/')[0] or 'home')+'.png')
            print(u,vw[0],'OVERFLOW' if ow else '',errs[:3]); pg.close()
