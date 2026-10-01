import { embeddedScene,canonicalScenePath } from '../experience/scene-adapter';
﻿export const chapters = [
 {id:'pretoria',name:'Pretoria',path:'/experience/pretoria',status:'Animated chapter'},
 {id:'johannesburg',name:'Johannesburg',path:'/experience/johannesburg',status:'Animated chapter'},
 {id:'kimberley',name:'Kimberley',path:'/experience/kimberley',status:'Animated chapter'},
 {id:'de-aar',name:'De Aar',path:'/experience/de-aar',status:'Junction preview'},
 {id:'beaufort-west',name:'Beaufort West',path:'/experience/beaufort-west',status:'Animated chapter'},
 {id:'matjiesfontein',name:'Matjiesfontein',path:'/experience/matjiesfontein',status:'Simplified animated draft'},
 {id:'worcester',name:'Worcester',path:'/experience/worcester',status:'Simplified animated draft'},
 {id:'cape-town',name:'Cape Town',path:'/experience/cape-town',status:'Animated finale'},
] as const;
export const journeyStorageKey='shosholoza:chapter-navigation:v1';
export function mountJourneyNavigation(path:string){
 if(embeddedScene||path.startsWith('/experience/'))return()=>{};
 const native=canonicalScenePath(path);if(native){location.replace('/experience/'+native);return()=>{};}
 const index=chapters.findIndex(chapter=>chapter.path===path);
 if(index<0)return()=>{};
 const chapter=chapters[index];
 try{localStorage.setItem(journeyStorageKey,JSON.stringify({last:chapter.id}));}catch{}
 const host=document.createElement('div');host.dataset.journeyNavigation='true';
 const shadow=host.attachShadow({mode:'open'});
 const top=path.startsWith('/animation')?'124px':'76px';
 const style=document.createElement('style');style.textContent=`
 :host{position:fixed;right:16px;top:${top};z-index:1000;font:14px system-ui;color:#f7eedb}*{box-sizing:border-box}details{position:relative}summary{list-style:none;cursor:pointer;background:#173330ee;border:1px solid #bda36c;border-radius:24px;padding:10px 16px;box-shadow:0 3px 15px #0003}summary::-webkit-details-marker{display:none}nav{position:absolute;right:0;top:48px;width:min(330px,calc(100vw - 24px));max-height:calc(100dvh - 150px);overflow:auto;padding:18px;background:#132b28fa;border:1px solid #a68f63;border-radius:14px;box-shadow:0 10px 40px #0007}h2{font:22px Georgia;margin:0 0 8px}p{font-size:12px;color:#c3d0c5;line-height:1.5}a{color:#f1d395;text-decoration:none}ol{list-style:none;margin:12px 0;padding:0}li{padding:9px 0;border-bottom:1px solid #ffffff18}li a{display:block}small{display:block;font-size:10px;color:#b8c6ba;margin-top:3px}[aria-current]{font-weight:bold;color:white}.pending{opacity:.6}.step-links{display:flex;justify-content:space-between;gap:10px;margin:15px 0}.step-links a{padding:9px;background:#ffffff12;border-radius:6px}a:focus-visible,summary:focus-visible{outline:3px solid #f9cc68;outline-offset:3px}@media(max-width:600px){:host{top:${path.startsWith('/animation')?'112px':'65px'};right:10px}summary{font-size:12px;padding:8px 12px}}
 `;
 const details=document.createElement('details');
 const summary=document.createElement('summary');summary.textContent=`Journey · ${index+1}/8`;details.append(summary);
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Connected animation chapters');
 const title=document.createElement('h2');title.textContent=chapter.name;nav.append(title);
 const intro=document.createElement('p');intro.textContent='One journey, each city’s own experience. Opening a chapter does not mark it completed.';nav.append(intro);
 const link=(name:string,path:string)=>{const a=document.createElement('a');a.href=path;a.textContent=name;return a;};
 const active=chapters.filter(c=>c.path),position=active.findIndex(c=>c.id===chapter.id);
 const steps=document.createElement('div');steps.className='step-links';
 if(position>0)steps.append(link('← '+active[position-1].name,active[position-1].path!));
 if(position<active.length-1)steps.append(link('Next: '+active[position+1].name+' →',active[position+1].path!));
 nav.append(steps);
 const list=document.createElement('ol');chapters.forEach((c,i)=>{const item=document.createElement('li');const label=link(`${i+1}. ${c.name}`,c.path);if(c.id===chapter.id)label.setAttribute('aria-current','page');const status=document.createElement('small');status.textContent=c.status;item.append(label,status);list.append(item);});nav.append(list);
 nav.append(link('Pretoria–Johannesburg connecting corridor','/corridor'));
 details.append(nav);shadow.append(style,details);document.body.append(host);
 const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){details.open=false;summary.focus();}};shadow.addEventListener('keydown',escape as EventListener);
 return()=>host.remove();
}
if(location.pathname.endsWith('.html'))mountJourneyNavigation(location.pathname);