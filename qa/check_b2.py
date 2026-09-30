from playwright.sync_api import sync_playwright
import json
pages = ['pools','earn','lend']
results = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1440,'height':900})
    for name in pages:
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        try:
            pg.goto(f'http://localhost:8765/{name}', wait_until='networkidle', timeout=30000)
        except Exception as e:
            errs.append('nav: '+str(e))
        pg.wait_for_timeout(5000)
        pg.screenshot(path=f'qa/{name}.png', full_page=True)
        results[name] = errs
        print(name, len(errs), errs[:5])
        pg._listeners.clear() if False else None
        b.close(); b = p.chromium.launch(); pg = b.new_page(viewport={'width':1440,'height':900})
    b.close()
json.dump(results, open('qa/batchB2.txt','w'), indent=1)
