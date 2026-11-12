import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axeDest = path.join(process.cwd(), 'src/renderer/axe.min.js');
fs.copyFileSync(require.resolve('axe-core/axe.min.js'), axeDest);
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; env.MATEPAD_QUIET='1';
fs.rmSync('/tmp/mp-a11y',{recursive:true,force:true});
const app=await electron.launch({args:['.','--demo','--lang=en','--profile=/tmp/mp-a11y'],cwd:process.cwd(),env});
const page=await app.firstWindow();
await page.waitForFunction(()=>window.__companionReady===true,null,{timeout:20000});
await page.addScriptTag({url:'./axe.min.js'});
for (const view of ['guide','device','unlock','settings']) {
  await page.evaluate((v)=>window.__companionSetView(v), view);
  await page.waitForTimeout(300);
  const res=await page.evaluate(async()=>{
    const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});
    return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target.join(' '))}));
  });
  const serious=res.filter(v=>['serious','critical'].includes(v.impact));
  console.log(view, 'violations', res.length, 'serious', serious.length, JSON.stringify(serious));
  const light=await page.evaluate(async()=>{
    await window.companion.setTheme('light');
    await new Promise(r=>setTimeout(r,300));
    const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}});
    return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target.join(' '))}));
  });
  const lightSerious=light.filter(v=>['serious','critical'].includes(v.impact));
  console.log(view, 'light violations', light.length, 'serious', lightSerious.length, JSON.stringify(lightSerious));
  await page.evaluate(()=>window.companion.setTheme('dark'));
}
await app.close();
fs.rmSync(axeDest, { force: true });
