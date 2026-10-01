export const scenePages:Record<string,string>={pretoria:'/animation',johannesburg:'/johannesburg.html',kimberley:'/kimberley.html','de-aar':'/de-aar','beaufort-west':'/beaufort-west.html',matjiesfontein:'/animation/matjiesfontein',worcester:'/animation/worcester','cape-town':'/cape-town'};
export const embeddedScene=new URLSearchParams(location.search).get('sceneOnly')==='1';
export function canonicalScenePath(path:string){return Object.entries(scenePages).find(([,page])=>page===path)?.[0];}
export type Action={label:string;disabled:boolean;run:()=>void};
const visible=(e:HTMLElement)=>!e.hidden&&!e.closest('[hidden]')&&e.style.display!=='none';
/** Same-origin adapter: calls the existing scene controls, preserving each runtime. */
export function sceneControls(doc:Document,id:string){
 const buttons=Array.from(doc.querySelectorAll<HTMLButtonElement>('button')).filter(visible);
 const byText=(re:RegExp)=>buttons.find(b=>re.test(b.textContent?.trim()??''));
 const byId=(name:string)=>doc.getElementById(name) as HTMLButtonElement|null;
 const react=['pretoria','matjiesfontein','worcester'].includes(id);
 const run=react?byText(/^(Start|Pause) journey$/):id==='johannesburg'?byId('play'):id==='kimberley'?byId('btn-run-chapter'):id==='beaufort-west'?byId('play'):id==='de-aar'?byText(/^(Play junction|Replay preview|Pause|Resume)/):byText(/^(Begin the finale|Replay chapter|Pause|Resume)$/);
 const pause=react?run:id==='johannesburg'?run:id==='kimberley'?byId('btn-pause'):id==='beaufort-west'?byId('pause'):byText(/^(Pause|Resume)$/);
 const sound=react?byText(/Sound (on|off)/):byId(id==='kimberley'?'btn-sound':'sound')??byText(/^Train sound/);
 const range=doc.querySelector<HTMLInputElement>(react?'input[aria-label="Animation route position"]':id==='johannesburg'?'#seek':id==='de-aar'?'input[aria-label="Director timeline"]':'input[data-shared-timeline]');
 const bridged=[0,1,2,3].map(i=>byId('shared-camera-'+i));
 const cameras=bridged.every(Boolean)?bridged:react?['Alongside','Behind the train','Wide view','Window view'].map(name=>byText(new RegExp('^'+name+'$'))):id==='johannesburg'?['platform','follow','skyline','concourse'].map(byId):[null,null,null,null];
 const times=react?['Dawn','Midday','Dusk','Night'].map(name=>byText(new RegExp('^'+name+'$'))):[null,null,null,null];
 const timeSelect=doc.querySelector<HTMLSelectElement>('#shared-time,#time');
 const status=doc.querySelector<HTMLElement>('#status,.chapter-controls [role=status]')?.textContent??'';
 const title=doc.querySelector<HTMLElement>(react?'.station-visit h2':id==='kimberley'?'#location-title':id==='beaufort-west'?'#story-title':id==='cape-town'?'.cape-card h1':id==='de-aar'?'.chapter-context h1':'#arrival-card h2')?.textContent??'';
 const body=doc.querySelector<HTMLElement>(react?'.station-visit p':id==='kimberley'?'#location-body':id==='beaufort-west'?'#story-body':id==='cape-town'?'.cape-card p[aria-live]':id==='de-aar'?'.chapter-context>p:nth-of-type(2)':'#arrival-card p')?.textContent??'';
 const primary=new Set([run,pause,sound,...cameras,...times]);
 const actions=buttons.filter(b=>!primary.has(b)&&!b.closest('header,[data-journey-navigation],.animation-debug,#shared-engine-controls')&&!/Hide panels|Show journey|Journey guide|Close journey|Place labels|Left window|Right window|Sound/.test(b.textContent??''));
 const selects=Array.from(doc.querySelectorAll<HTMLSelectElement>('select')).filter(visible);
 const error=doc.querySelector<HTMLElement>('#error:not([hidden]),[role=alert]:not([hidden])');
 const ready=react?doc.querySelector('.animation-ride')?.getAttribute('data-ready')==='true':id==='de-aar'?!!doc.querySelector('[data-ready=true]'):id==='cape-town'?!!run&&!run.disabled:id==='kimberley'?!!doc.querySelector('canvas')&&(!run?.disabled||!!pause&&!pause.disabled):!!doc.querySelector('canvas')&&!/Loading|Preparing/i.test(status);
 return {landmarkVisit:byId('visit-union-buildings'),landmarkReturn:byId('return-pretoria-train')??byText(/^(Back to the train|Return to train)$/),landmarkPause:byId('pause-pretoria-landmark'),ready,run,pause,sound,range,cameras,times,timeSelect,status,title,body,actions,selects,error:error&&visible(error)?error.textContent:'',
 change(element:HTMLInputElement|HTMLSelectElement,value:string){const win=doc.defaultView!;const proto=element.tagName==='SELECT'?(win as unknown as {HTMLSelectElement:typeof HTMLSelectElement}).HTMLSelectElement.prototype:(win as unknown as {HTMLInputElement:typeof HTMLInputElement}).HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));}};
}
export function concealSceneChrome(doc:Document){
 if(doc.getElementById('shared-shell-style'))return;
 const style=doc.createElement('style');style.id='shared-shell-style';style.textContent=`
 body>header,body>footer,body>section,body>aside,body>#timeline,body>#progress,body>#toast,body>.city-explorer,body>[data-journey-navigation],body>#error{visibility:hidden!important;pointer-events:none!important}
 .animation-ride>:not(.animation-world),.cape-finale>:not(.cape-world),.deaar>:not(.deaar-map),[data-journey-navigation]{visibility:hidden!important;pointer-events:none!important}
 .maplibregl-ctrl-top-right{display:none!important} body>#director-panel,body>#time-machine-panel,body>.cinematic-bar{visibility:hidden!important;pointer-events:none!important}
 body{margin:0!important}iframe{border:0}
 `;doc.head.append(style);
}
