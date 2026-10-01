const base = process.env.CITY_BASE || 'http://127.0.0.1:8791';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
await page.goto(`${base}/animation`);
await page.waitForFunction(()=>document.querySelector('main')?.dataset.ready==='true',null,{timeout:120000});
console.log('Scene ready');
await page.getByRole('button',{name:'Window view',exact:true}).click();
console.log('Window clicked',await page.evaluate(()=>({fov:window.__railScene.camera.fov,controls:window.__railScene.controls.enabled})));
await page.waitForFunction(()=>window.__railScene.camera.fov===62 && !window.__railScene.controls.enabled);
const before=await page.evaluate(()=>window.__railScene.camera.position.toArray());
await page.getByRole('button',{name:'Right window',exact:true}).click();
assert.notDeepEqual(await page.evaluate(()=>window.__railScene.camera.position.toArray()),before);
await mkdir('evidence/passenger-window',{recursive:true});
await page.screenshot({path:'evidence/passenger-window/right.png'});
await page.getByRole('button',{name:'Left window',exact:true}).click();
await page.screenshot({path:'evidence/passenger-window/left.png'});
await page.getByRole('button',{name:'Alongside',exact:true}).click();
await page.waitForFunction(()=>window.__railScene.camera.fov===45 && window.__railScene.controls.enabled);
assert.deepEqual(errors,[]);console.log('PASS window sides, camera ownership, field of view and orbit restoration; zero page errors');
}finally{await browser.close();}
