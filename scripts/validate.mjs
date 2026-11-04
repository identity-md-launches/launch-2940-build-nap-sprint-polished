// Exercises the production export at a gateway-like /preview/ subpath.
// Synthetic API fixtures are used only in this checker, never in the application.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startPreview } from './preview.mjs';
import { fixture, settlement, NOW } from '../test/fixtures.js';
import { decodeChallenge } from '../src/engine.js';
const playwright = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const axeModule = process.env.AXE_MODULE ? await import(pathToFileURL(process.env.AXE_MODULE).href) : await import('@axe-core/playwright');
const AxeBuilder = axeModule.default?.default ?? axeModule.default ?? axeModule.AxeBuilder;
await mkdir('artifacts/screenshots', { recursive: true });
await mkdir('test/scratch/validation', { recursive: true });
const report = { generatedAt: new Date().toISOString(), productionSubpath: '/preview/', checks: [], accessibility: [], browserVersions: {}, screenshots: [], limitations: [] };
const server = await startPreview();
const browser = await playwright.chromium.launch({ headless: true });
report.browserVersions.chromium = browser.version();
const errors = [];
async function check(name, fn) { try { const detail = await fn(); report.checks.push({ name, passed: true, ...(detail ? { detail } : {}) }); console.log('PASS '+name); } catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.error('FAIL '+name+': '+error.message); throw error; } }
async function screenshot(page, name, fullPage = false) { const path = `artifacts/screenshots/${name}.png`; await page.screenshot({ path, fullPage, animations: 'disabled' }); report.screenshots.push(path); }
async function text(page, selector, expected) { await page.locator(selector).filter({ hasText: expected }).first().waitFor({ timeout: 10000 }); }
async function stored(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('nap-or-sprint:player:v1'))); }
async function safeLayout(page, width) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `horizontal overflow at ${width}`); }
async function routeData(context, model) {
  await context.route('https://api.squeekchain.com/v1/**', route => {
    if (model.offline) return route.abort('failed');
    const status = route.request().url().endsWith('/status');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(status ? model.data.status : model.data.history) });
  });
}
async function audit(page, name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  report.accessibility.push({ name, violations: result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,targets:v.nodes.map(n=>n.target)})) });
  assert.equal(result.violations.length,0, `${name}: ${result.violations.map(v=>v.id).join(', ')}`);
}
let webkit;
try {
  const live = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const livePage = await live.newPage();
  const hosts = new Set();
  livePage.on('pageerror', error => errors.push(error.message));
  livePage.on('request', request => { const url = new URL(request.url()); if (url.origin !== new URL(server.url).origin) hosts.add(url.hostname); });
  await check('Real public API and local assets load at a static subpath', async()=>{
    await livePage.goto(server.url, { waitUntil: 'networkidle' });
    await livePage.waitForFunction(()=>document.querySelector('#round-title')?.textContent?.includes('#'), null, {timeout:15000});
    assert.equal(errors.length,0); assert.deepEqual([...hosts],['api.squeekchain.com']);
    assert.equal(await livePage.evaluate(()=>document.fonts.check('700 48px "Bricolage Grotesque"') && document.fonts.check('400 14px "DM Sans"')),true);
    await screenshot(livePage,'live-mobile-390');
    for(const width of [320,390,820,1440]) await safeLayout(livePage,width);
    await screenshot(livePage,'live-desktop-1440',true);
    return { round: await livePage.locator('#round-title').textContent(), externalHosts:[...hosts], widths:[320,390,820,1440] };
  });
  await live.close();

  const model={data:fixture(),offline:false};
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
  await routeData(context,model);
  const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:NOW});
  await page.goto(server.url); await text(page,'#round-title','2001');
  await check('Product and primary call action fit the first 390 × 844 screen',async()=>{
    const bounds=await page.locator('.prediction-submit').boundingBox(); assert.ok(bounds.y+bounds.height<=844,JSON.stringify(bounds));
    assert.equal(await page.locator('.prediction-submit').isEnabled(),true);
    await text(page,'.wheel-rpm','22.5 rpm');
    await screenshot(page,'open-round-mobile-390');
    return {buttonBottom:Math.round(bounds.y+bounds.height),data:'controlled API fixture'};
  });
  await check('Three-step onboarding, help panel and focus restoration',async()=>{
    for(let i=0;i<3;i++) await page.locator('[data-action=onboarding]').click();
    assert.equal(await page.locator('.coach').count(),0);
    await page.locator('#help-button').focus(); await page.keyboard.press('Enter');
    await text(page,'#dialog-title','small guide'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'help-button');
  });
  await check('Nickname and opt-in sound persist',async()=>{
    await page.locator('#profile-button').click(); await page.locator('#nickname').fill('Ada Café'); await page.locator('#profile-form button[type=submit]').click();
    await page.locator('#sound-toggle').click(); assert.equal((await stored(page)).sound,true);
    await page.locator('#sound-toggle').click(); assert.equal((await stored(page)).sound,false);
    assert.equal((await stored(page)).nickname,'Ada Café');
  });
  await check('Keyboard prediction validation, saving and pre-lock updates',async()=>{
    await page.locator('.prediction-submit').focus(); await page.keyboard.press('Enter'); await text(page,'#prediction-error','Choose Nap or Sprint');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'call-nap');
    assert.equal(await page.locator('.nap-choice').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await screenshot(page,'keyboard-focus-390');
    await page.keyboard.press('Space'); await page.locator('.prediction-submit').click();
    assert.equal((await stored(page)).calls[0].call,'NAP');
    assert.ok((await stored(page)).achievements.first);
    await page.locator('.sprint-choice').click(); await page.locator('.prediction-submit').click(); await text(page,'#prediction-error','Choose a block bracket');
    await page.locator('.bracket-choice').nth(1).click(); await page.locator('.prediction-submit').click();
    const call=(await stored(page)).calls[0]; assert.equal(call.call,'SPRINT'); assert.equal(call.bracket,'11-30'); assert.equal(call.lockedAt,null);
  });
  await check('Live refresh preserves expanded hints and keyboard focus',async()=>{
    await page.locator('#model-summary').focus(); await page.keyboard.press('Enter');
    const before=(await stored(page)).lastSeen; await page.clock.fastForward(10001);
    await page.waitForFunction(before=>JSON.parse(localStorage.getItem('nap-or-sprint:player:v1')).lastSeen>before,before);
    assert.equal(await page.locator('.model-details').evaluate(e=>e.open),true); assert.equal(await page.evaluate(()=>document.activeElement.id),'model-summary');
    await page.keyboard.press('Enter');
  });
  let challengeURL;
  await check('Challenge creation locks a real saved call and copies a UTF-8 hash link',async()=>{
    await page.locator('[data-action=challenge]').click(); await page.locator('#challenge-form button[type=submit]').click();
    challengeURL=await page.locator('#challenge-link').inputValue(); const challenge=decodeChallenge(new URL(challengeURL).hash);
    assert.equal(challenge.nickname,'Ada Café'); assert.equal(challenge.call,'SPRINT'); assert.equal(challenge.bracket,'11-30');
    await page.locator('[data-action=copy-link]').click(); assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),challengeURL);
    assert.equal(await page.locator('#dialog-toast').isVisible(),true); assert.equal(await page.locator('#toast-region').isVisible(),false);
    await page.keyboard.press('Escape'); assert.ok((await stored(page)).calls[0].lockedAt);
    assert.equal(await page.locator('#call-nap').isDisabled(),true); assert.equal(await page.locator('.prediction-submit').isDisabled(),true);
  });
  const friendContext=await browser.newContext({viewport:{width:390,height:844}}); await routeData(friendContext,model);
  const friend=await friendContext.newPage(); friend.on('pageerror',error=>errors.push(error.message)); await friend.clock.install({time:NOW});
  let replyURL;
  await check('Friend receives the challenge, locks an independent call and returns a reply',async()=>{
    await friend.goto(challengeURL); await text(friend,'.duel-notice','Ada Café'); await text(friend,'#round-title','2001');
    await friend.locator('.nap-choice').click(); await friend.locator('.prediction-submit').click();
    await text(friend,'#dialog-title','Send your answer'); replyURL=await friend.locator('#challenge-link').inputValue();
    assert.equal(decodeChallenge(new URL(replyURL).hash).versus.nickname,'Ada Café'); assert.ok((await stored(friend)).calls[0].lockedAt);
    await page.evaluate(hash=>{location.hash=hash},new URL(replyURL).hash);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nap-or-sprint:player:v1')).duels.length===1);
    assert.equal((await stored(page)).duels[0].theirCall,'NAP');
    await friend.keyboard.press('Escape');
  });
  let exported;
  await check('JSON export produces a complete local progress backup',async()=>{
    await page.locator('#profile-button').click(); const pending=page.waitForEvent('download'); await page.locator('[data-action=export]').click(); const download=await pending;
    await download.saveAs('test/scratch/validation/progress.json'); exported=JSON.parse(await readFile('test/scratch/validation/progress.json','utf8'));
    assert.equal(exported.app,'nap-or-sprint'); assert.equal(exported.state.duels.length,1); assert.equal(exported.state.calls.length,1); await page.keyboard.press('Escape');
  });
  await check('Returning after settlement resolves pending calls and shows an away summary',async()=>{
    await page.goto('about:blank');
    const newNow=NOW+16*60_000; model.data=fixture(newNow,2001,false);
    model.data.history.recentSettlements[0]=settlement(2001,220,18,NOW+15*60_000);
    model.data.status.builder.anchor.confirmedAt=new Date(NOW+15*60_000).toISOString();
    await page.clock.setSystemTime(newNow); await page.goto(replyURL); await text(page,'.notice','While you were away');
    const state=await stored(page); assert.equal(state.calls[0].result.points,30); assert.equal(state.gallery.length,1); assert.ok(state.achievements.duel);
    await page.locator('[data-action=away]').click(); await page.locator('#game-dialog [data-result="2001"]').click(); await text(page,'#dialog-title','read the hamster right');
    await screenshot(page,'result-reveal-mobile-390');
    assert.match(await page.locator('.result-explorer').getAttribute('href'),/^https:\/\/sepolia\.etherscan\.io\/tx\/0x/);
    await page.keyboard.press('Escape');
    await friend.goto('about:blank'); await friend.clock.setSystemTime(newNow); await friend.goto(challengeURL); await text(friend,'.notice','While you were away');
    assert.equal((await stored(friend)).calls[0].result.points,0);
    await page.locator('.view-nav [data-view=duels]').click(); await text(page,'.duel-outcome','You won · 25–0');
  });
  await check('Gallery filtering, deterministic art, PNG cards and X sharing work',async()=>{
    await page.locator('.view-nav [data-view=gallery]').click(); assert.equal(await page.locator('.art-piece').count(),1);
    const art=await page.locator('.art-open canvas').evaluate(canvas=>canvas.toDataURL());
    await page.locator('[data-filter=nap]').click(); await text(page,'#view-content','No pieces in this mood');
    await page.locator('[data-filter=sprint]').click(); assert.equal(await page.locator('.art-open canvas').evaluate(canvas=>canvas.toDataURL()),art);
    await page.locator('.art-open').click();
    const pending=page.waitForEvent('download'); await page.locator('#game-dialog [data-download]').click(); const download=await pending;
    await download.saveAs('test/scratch/validation/art-card.png'); const png=await readFile('test/scratch/validation/art-card.png');
    assert.equal(png.subarray(1,4).toString(),'PNG'); assert.equal(png.readUInt32BE(16),1200); assert.equal(png.readUInt32BE(20),1300);
    const popupPromise=page.waitForEvent('popup'); const cardDownload=page.waitForEvent('download'); await page.locator('#game-dialog [data-share]').click();
    const popup=await popupPromise; await cardDownload; assert.match(popup.url(),/(twitter|x)\.com\/intent\/tweet|about:blank/); await popup.close();
    await page.keyboard.press('Escape'); await screenshot(page,'earned-art-mobile-390');
  });
  await check('All four views pass automated WCAG checks and reflow at 320 and 820',async()=>{
    for(const view of ['play','gallery','achievements','duels']) {
      await page.locator(`.view-nav [data-view=${view}]`).click(); await safeLayout(page,320); await audit(page,view+' at 320'); await safeLayout(page,820);
    }
    await page.setViewportSize({width:390,height:844}); await page.locator('.view-nav [data-view=achievements]').click(); await screenshot(page,'badges-mobile-390');
  });
  await check('Import previews replacement, rejects malformed files and restores a valid backup',async()=>{
    await page.locator('#profile-button').click();
    await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{invalid')}); await text(page,'#import-feedback',/JSON|Unexpected|Expected/);
    assert.equal((await stored(page)).gallery.length,1);
    await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))}); await text(page,'#import-preview','Replace this browser');
    await page.locator('[data-action=cancel-import]').click(); assert.equal((await stored(page)).gallery.length,1);
    await page.locator('#import-file').setInputFiles([]);
    await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))}); await text(page,'#import-preview','Replace this browser'); await page.locator('[data-action=confirm-import]').click();
    assert.equal((await stored(page)).calls[0].result.points,30); assert.equal((await stored(page)).nickname,'Ada Café');
  });
  await check('Offline mode keeps last good data and preserves unresolved calls',async()=>{
    await page.locator('.view-nav [data-view=play]').click();
    await page.locator('.nap-choice').click(); await page.locator('.prediction-submit').click();
    const before=await stored(page); assert.equal(before.calls.length,2); assert.equal(before.calls[1].result,undefined);
    model.offline=true; await page.reload(); await text(page,'.offline-notice','Offline');
    const after=await stored(page); assert.equal(after.calls[1].result,undefined); assert.equal(after.calls[0].result.points,30); assert.equal(await page.locator('.prediction-submit').isDisabled(),true);
    await page.locator('#profile-button').click(); await audit(page,'profile dialog'); await page.keyboard.press('Escape');
    model.offline=false;
  });
  await check('Automatic deadline locking cannot be extended by later cadence changes',async()=>{
    const c=(await stored(page)).calls[1];
    const latest=Date.parse(model.data.history.recentSettlements[0].blockTimestamp);
    model.data.history.recentSettlements.forEach((s,i)=>{s.blockTimestamp=new Date(latest-i*30*60_000).toISOString();});
    await page.locator('[data-action=refresh]').click(); await text(page,'.state-label','Live');
    assert.equal((await stored(page)).calls[1].lockAt,c.lockAt);
    await page.locator('.sprint-choice').click(); await page.locator('.bracket-choice').first().click(); await text(page,'.saved-call-line','Unsaved changes');
    await page.clock.setSystemTime(c.lockAt+1000); await page.clock.runFor(1100);
    assert.ok((await stored(page)).calls[1].lockedAt); assert.equal(await page.locator('#call-sprint').isDisabled(),true);
    assert.equal(await page.locator('#call-nap').isChecked(),true); assert.equal((await stored(page)).calls[1].call,'NAP');
    assert.equal((await stored(page)).calls[1].lockAt,c.lockAt);
  });
  await check('Reduced motion stops all infinite wheel and sleep animations',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect.getTiming().iterations===Infinity).length),0);
  });
  await check('First visit without API data has a recoverable honest empty state',async()=>{
    const emptyContext=await browser.newContext({viewport:{width:390,height:844}}); await routeData(emptyContext,{offline:true,data:fixture()}); const empty=await emptyContext.newPage(); await empty.goto(server.url);
    await text(empty,'.offline-notice','Offline'); await text(empty,'#round-title','The next round'); assert.equal(await empty.locator('.prediction-submit').isDisabled(),true); await safeLayout(empty,320); await emptyContext.close();
  });
  await check('A background tab returning after a long gap gets an away summary',async()=>{
    const backgroundModel={data:fixture(NOW,3000),offline:false};
    const backgroundContext=await browser.newContext({viewport:{width:390,height:844}}); await routeData(backgroundContext,backgroundModel);
    const background=await backgroundContext.newPage(); await background.clock.install({time:NOW}); await background.goto(server.url); await text(background,'#round-title','3001');
    await background.locator('.nap-choice').click(); await background.locator('.prediction-submit').click();
    await background.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
    const later=NOW+16*60_000; backgroundModel.data=fixture(later,3001,false); backgroundModel.data.history.recentSettlements[0]=settlement(3001,0,0,NOW+15*60_000);
    await background.clock.setSystemTime(later);
    await background.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
    await text(background,'.notice','While you were away'); assert.equal((await stored(background)).calls[0].result.points,15); await backgroundContext.close();
  });
  await check('Actual closure and already indexed results block retrospective calls',async()=>{
    for(const kind of ['oracle','history']) {
      const data=fixture(Date.now(),4000); if(kind==='oracle')data.status.oracle.latestClosure.lastRound='4001';
      else data.history.recentSettlements.unshift(settlement(4001,40,4,Date.now()-1000));
      const context=await browser.newContext({viewport:{width:390,height:844}});await routeData(context,{data,offline:false}); const page=await context.newPage(); await page.goto(server.url);
      await text(page,'#round-title','4001'); await text(page,'#prediction-form','already closed');
      assert.equal(await page.locator('.prediction-submit').count(),0); assert.equal((await stored(page)).calls.length,0); await context.close();
    }
  });
  await check('Long collections load in batches and batched settlements still make unique round art',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844}}); await routeData(context,model); const page=await context.newPage(); await page.clock.install({time:NOW+16*60_000}); await page.goto(server.url); await text(page,'#round-title','2002');
    const sample=JSON.parse(JSON.stringify(exported)); const original=JSON.parse(JSON.stringify((await stored(friend)).calls[0]));
    original.call='NAP'; original.bracket=null; original.result.correct=true; original.result.settlement={from:6999,through:7020,work:0,blocks:0,timestamp:NOW+15*60_000,hash:'0x'+ 'a'.repeat(64),source:'settlement'};
    sample.state.calls=Array.from({length:20},(_,i)=>({...JSON.parse(JSON.stringify(original)),round:7000+i,rival:{...original.rival,round:7000+i}})); sample.state.duels=[];sample.state.sent=[];sample.state.rivals=[];
    await page.locator('#profile-button').click(); await page.locator('#import-file').setInputFiles({name:'collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))}); await text(page,'#import-preview','Replace this browser'); await page.locator('[data-action=confirm-import]').click();
    await page.locator('.view-nav [data-view=gallery]').click(); assert.equal(await page.locator('.art-piece').count(),12);
    const urls=await page.locator('.art-open canvas').evaluateAll(canvases=>canvases.map(c=>c.toDataURL())); assert.equal(new Set(urls).size,12);
    await page.locator('[data-action=more-art]').click(); assert.equal(await page.locator('.art-piece').count(),20);assert.equal(await page.locator('[data-action=more-art]').count(),0);
    await context.close();
  });
  await check('No application script errors in the exercised flows',async()=>{assert.deepEqual(errors,[]);});
  await context.close(); await friendContext.close();

  if (process.env.SKIP_WEBKIT === '1') report.limitations.push('WebKit was not checked on this host: its system dependencies and headless initialization were unavailable. Chromium covers the rendered and interaction checks.');
  else try { webkit=await playwright.webkit.launch({headless:true,timeout:10000}); report.browserVersions.webkit=webkit.version(); }
  catch(error) { report.limitations.push('WebKit could not launch: '+error.message.split('\n').filter(Boolean).slice(0,2).join(' ')); }
  if(webkit) await check('WebKit completes the primary keyboard prediction flow',async()=>{
    const context=await webkit.newContext({viewport:{width:390,height:844}}); await routeData(context,{data:fixture(Date.now()),offline:false}); const page=await context.newPage(); await page.goto(server.url); await text(page,'#round-title','2001');
    await page.locator('#call-nap').focus(); await page.keyboard.press('Space'); await page.locator('.prediction-submit').click(); assert.equal((await stored(page)).calls[0].call,'NAP');
    await page.locator('[data-action=lock-now]').click(); await page.locator('[data-action=confirm-lock]').click(); assert.ok((await stored(page)).calls[0].lockedAt);
    await page.locator('#help-button').click(); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>document.activeElement.id),'help-button'); await safeLayout(page,320); await context.close();
  });
} catch(error) { process.exitCode=1; console.error(error.message); }
finally {
  if(webkit) await webkit.close(); await browser.close(); await server.close();
  report.passed=report.checks.every(c=>c.passed); report.total=report.checks.length;
  await writeFile('artifacts/interaction-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(`${report.checks.filter(c=>c.passed).length}/${report.total} interaction checks passed.`);
}
