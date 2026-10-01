import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.CITY_BASE || 'http://127.0.0.1:8791';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:850},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/animation`);
 await page.waitForFunction(()=>document.querySelector('main')?.dataset.ready==='true',null,{timeout:120000});
 await page.locator('.animation-saved > summary').click();
 await page.getByRole('button',{name:'Save NZASM',exact:true}).click();
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download itinerary',exact:true}).click();
 const download=await pending;assert.equal(download.suggestedFilename(),'shosholoza-pretoria-saved-places.txt');
 const body=await readFile(await download.path(),'utf8');
 assert.ok(body.includes('NZASM'));assert.ok(body.includes('Coordinates:'));assert.ok(body.includes('not a record of physical visits'));
 assert.deepEqual(errors,[]);console.log('PASS live itinerary download contains saved place, coordinates and attribution; no page errors');
} finally {await browser.close();}
