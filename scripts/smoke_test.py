"""
Browser smoke test (optional dev tool).
Runs the production build in headless Chrome at several viewport sizes,
plays a few actions through the real UI, and fails on any console error.

Usage:  npm run build && npx vite preview --port 4173 &
        python3 scripts/smoke_test.py [--chrome /path/to/chrome] [--out qa-screens]
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

VIEWPORTS = {
    "desktop-1440": (1440, 900, False),
    "desktop-1280": (1280, 720, False),
    "tablet-768": (768, 1024, True),
    "mobile-390": (390, 844, True),
    "mobile-landscape": (844, 390, True),
}

def run(url, chrome, out):
    os.makedirs(out, exist_ok=True)
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome, args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]) if chrome else p.chromium.launch()
        for name, (w, h, mobile) in VIEWPORTS.items():
            ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_selector(".title-screen", timeout=15000)
            page.screenshot(path=f"{out}/{name}-1-title.png")
            # New island via the UI
            page.get_by_text("New island").first.click()
            # Island size picker: each choice must stick (regression: clicks fell through to "Small").
            for label, tiles in (("Large", 80), ("Small", 48), ("Medium", 64)):
                page.locator('button[data-size]', has_text=label).click()
                on = page.locator('button[data-size].on').inner_text()
                if on != label:
                    failures.append(f"{name}: picked {label} island but {on} is selected")
            page.locator('button[data-size]', has_text="Large").click()
            page.get_by_text("Found settlement").click()
            page.wait_for_timeout(200)
            size = page.evaluate("() => window.__tinyEmpires.ctrl.state.size")
            if size != 80:
                failures.append(f"{name}: chose Large but world size is {size}")
            page.wait_for_timeout(600)
            page.screenshot(path=f"{out}/{name}-2-start.png")
            # Place a farm by clicking its card then a valid tile on the map.
            page.locator('.bcard[data-type="farm"]').click()
            tile = page.evaluate("""() => {
              const { ctrl, scene } = window.__tinyEmpires;
              const s = ctrl.state, wld = ctrl.world, th = s.buildings[0];
              const cam = scene.cameras.main;
              for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                const x = th.x + dx, y = th.y + dy;
                const t = wld.terrain[y * wld.size + x];
                if ((t === 3 || t === 6) && !s.buildings.some(b => b.x === x && b.y === y)) {
                  const sx = (x * 16 + 8 - cam.worldView.x) * cam.zoom, sy = (y * 16 + 8 - cam.worldView.y) * cam.zoom;
                  const el = document.elementFromPoint(sx, sy);
                  if (el && el.tagName === 'CANVAS') return { x, y, sx, sy };
                }
              }
              return null;
            }""")
            if tile:
                if mobile:
                    page.touchscreen.tap(tile["sx"], tile["sy"])
                else:
                    page.mouse.click(tile["sx"], tile["sy"])
                page.wait_for_timeout(300)
            farms = page.evaluate("() => window.__tinyEmpires.ctrl.state.buildings.filter(b => b.type === 'farm').length")
            if farms < 1:
                failures.append(f"{name}: farm placement via UI failed (tile={tile})")
            page.keyboard.press("Escape")
            # Fast-forward the simulation for a while and open panels.
            page.evaluate("() => { const c = window.__tinyEmpires.ctrl; for (let i = 0; i < 40; i++) c.update(1000); }")
            page.wait_for_timeout(300)
            page.screenshot(path=f"{out}/{name}-3-farm.png")
            page.locator(".tool-btn", has_text="Research").click()
            page.wait_for_timeout(250)
            page.screenshot(path=f"{out}/{name}-4-research.png")
            page.keyboard.press("Escape")
            # Save/load round trip in the real browser.
            same = page.evaluate("""() => {
              const c = window.__tinyEmpires.ctrl;
              const before = JSON.stringify(c.state);
              c.saveSlot('slot1');
              const err = c.loadSlot('slot1');
              return err === null && JSON.stringify(c.state) === before;
            }""")
            if not same:
                failures.append(f"{name}: save/load mismatch")
            # Night time & event screenshot
            page.evaluate("() => { const c = window.__tinyEmpires.ctrl; c.state.tick = 100; c.bus.emit('changed'); }")
            page.wait_for_timeout(200)
            page.screenshot(path=f"{out}/{name}-5-night.png")
            if errors:
                failures.append(f"{name}: console errors: {errors[:5]}")
            ctx.close()
        browser.close()
    return failures

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4173/")
    ap.add_argument("--chrome", default=None)
    ap.add_argument("--out", default="qa-screens")
    a = ap.parse_args()
    f = run(a.url, a.chrome, a.out)
    print(json.dumps({"failures": f}, indent=2))
    sys.exit(1 if f else 0)
