import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { hamster } from '../src/visuals.js';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const display = (await readFile('public/fonts/bricolage-grotesque-latin.woff2')).toString('base64');
const body = (await readFile('public/fonts/dm-sans-latin.woff2')).toString('base64');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>@font-face{font-family:Display;src:url(data:font/woff2;base64,${display});font-weight:400 800}@font-face{font-family:Body;src:url(data:font/woff2;base64,${body});font-weight:400 700}*{box-sizing:border-box}body{margin:0;background:#f8f3e7;color:#302a25;padding:66px;font-family:Body}header{font-size:24px;font-weight:600;display:flex;align-items:center;gap:12px}header svg{width:40px;height:40px}h1{font-family:Display;font-size:100px;line-height:1.05;letter-spacing:-5px;margin:48px 0 18px;font-weight:700}p{font-size:27px;line-height:1.6;margin:0;max-width:580px}small{font-size:22px;display:block;margin-top:44px;color:#696151}.mascot{position:absolute;right:90px;top:160px;width:280px;height:300px;background:#dad1e8;border:3px solid #302a25;border-radius:50%;display:grid;place-items:center;transform:rotate(6deg)}.mascot svg{width:190px;height:210px;transform:rotate(-6deg)}.moon{position:absolute;right:334px;top:136px;background:#d4e4b2;border:3px solid #302a25;border-radius:22px;font-size:36px;padding:12px 24px;transform:rotate(-10deg)}.bolt{position:absolute;right:68px;top:433px;background:#f7b28e;border:3px solid #302a25;border-radius:22px;font-size:36px;padding:12px 24px;transform:rotate(8deg)}</style><header>${hamster()} Squeek arcade</header><h1>Nap or Sprint?</h1><p>A tiny prediction arcade.<br>One very real hamster.</p><small>Make your call. Outwit the Professor. Collect a little art.</small><div class="mascot">${hamster()}</div><div class="moon">☾ Nap</div><div class="bolt">ϟ Sprint</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'public/og-image.png' });
  console.log('Created public/og-image.png (1200 × 630).');
} finally { await browser.close(); }
