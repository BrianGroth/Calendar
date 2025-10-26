/*
  Calendar App — app.js (v6)
  - Loads shared config from config/settings.json (preferences, holidays, repo, integrations.tripitIcalUrl)
  - Merges with local settings (keeps PAT local)
  - Trips overlay button uses shared TripIt URL by default
  - 2‑year future scrolling (current + 24 months), fixed month math
  - Weekday headers aligned as the first row of the grid
*/

;(() => {
  const DEFAULT_TZ = 'Europe/Amsterdam';
  const STATUS_EL = () => document.getElementById('status');

  // ---------------------------
  // Settings
  // ---------------------------
  const SETTINGS_KEY = 'calendar.settings.v1';
  const defaultSettings = {
    owner: '',
    repo: 'Calendar',
    token: '', // PAT (local only)
    timeFormat24h: true,
    weekStart: 1,
    timezone: DEFAULT_TZ,
    theme: 'light',
    tripitIcalUrl: '', // can be set by shared file integrations.tripitIcalUrl or local
    holidays: { usUrl: '', ukUrl: '', nlUrl: '' }
  };

  function loadLocalSettings(){
    try { const j = localStorage.getItem(SETTINGS_KEY); return j ? JSON.parse(j) : { ...defaultSettings }; }
    catch { return { ...defaultSettings }; }
  }
  function saveLocalSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  async function loadSharedSettings(){
    try {
      const res = await fetch('config/settings.json', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // ---------------------------
  // Utils
  // ---------------------------
  const pad=(n)=> n.toString().padStart(2,'0');
  const fmtMonthKey=(d)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const monthStart=(d)=> new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  const monthEnd=(d)=> new Date(Date.UTC(d.getFullYear(), d.getMonth()+1, 0, 23,59,59));
  const addMonths=(d,k)=> { const x=new Date(d.getFullYear(), d.getMonth(), 1); x.setMonth(x.getMonth()+k); return x; };
  const toISODateLocal=(d)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseISODate=(s)=> { const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd); };
  const formatTimeHHMM=(d)=> `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const announceStatus=(m)=> { const el=STATUS_EL(); if(el) el.textContent=m; console.log('[status]', m); };
  const consoleWarn=(m,e)=> console.warn(m, e? String(e).replace(/ghp_[A-Za-z0-9]+/g,'***'): '');
  const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=crypto.getRandomValues(new Uint8Array(1))[0]&15; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});

  // ---------------------------
  // GitHub (via lib/github.js)
  // ---------------------------
  const GH={
    async loadMonth(settings, y, m){
      const path=`data/${y}-${pad(m)}.json`;
      try{
        const res=await window.GitHubAPI.getFile(settings.owner, settings.repo, path, settings.token||undefined);
        if(!res) return {events:[], sha:null};
        const arr=JSON.parse(res.content||'[]');
        return {events:Array.isArray(arr)?arr:[], sha:res.sha||null};
      }catch(e){ consoleWarn('loadMonth', e); return {events:[], sha:null}; }
    },
    async saveMonth(settings, y, m, events, sha){
      const path=`data/${y}-${pad(m)}.json`;
      const body=JSON.stringify(events, null, 2);
      const msg=`feat(events): update ${y}-${pad(m)} (${events.length} record${events.length===1?'':'s'})`;
      return window.GitHubAPI.putFile(settings.owner, settings.repo, path, body, sha||undefined, settings.token, msg);
    }
  };

  // ---------------------------
  // Overlays (TripIt + Holidays)
  // ---------------------------
  const OverlayCache=new Map();
// Fetch an iCalendar feed and parse it.  TripIt feeds may not set CORS headers,
// causing a direct fetch to fail.  This helper first tries to fetch the URL
// directly; if that request fails (e.g. network error or non‑OK status), it
// falls back to a simple public CORS proxy.  Without this fallback the Trips
// overlay button silently does nothing when the TripIt URL cannot be loaded.
async function fetchICS(url) {
  // Attempt direct fetch first
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const txt = await res.text();
      return window.ICS.parseICS(txt);
    }
  } catch (e) {
    // Ignore errors and fall through to proxy below
  }
  // Fallback via CORS proxy when direct fetch fails (e.g. due to CORS)
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    const res2 = await fetch(proxyUrl, { cache: 'no-store' });
    if (!res2.ok) throw new Error('ICS fetch ' + res2.status);
    const txt2 = await res2.text();
    return window.ICS.parseICS(txt2);
  } catch (e) {
    // If the proxy also fails, propagate the error so the overlay can be skipped
    throw e;
  }
}

    function filterEventsToMonth(evts, monthDate){
    const s=monthStart(monthDate), e=monthEnd(monthDate);
    return evts.filter(x=>{ const d=x.start instanceof Date? x.start : new Date(x.start); return d>=s && d<=e; }).map(x=>({
      id:x.id||uuid(), title:x.summary||x.title||'Untitled', date:toISODateLocal(new Date(x.start)),
      startTime:x.start instanceof Date? formatTimeHHMM(x.start):'', endTime:x.end instanceof Date? formatTimeHHMM(x.end):'',
      notes:x.description||'', url:x.url||'', __overlay:true
    }));
  }
  async function getOverlay(key, url, monthDate){ if(!url) return []; const k=`${key}|${fmtMonthKey(monthDate)}`; if(OverlayCache.has(k)) return OverlayCache.get(k); try{ const raw=await fetchICS(url); const m=filterEventsToMonth(raw, monthDate); OverlayCache.set(k,m); return m; }catch(e){ consoleWarn('overlay '+key, e); return []; } }

  // ---------------------------
  // Calendar
  // ---------------------------
  class CalendarApp{
    constructor(rootId='monthsContainer'){
      this.settings = loadLocalSettings();
      this.root=document.getElementById(rootId); if(!this.root) throw new Error('#monthsContainer missing');
      this.root.classList.add('calendar-scroll');

      this.loadedKeys=new Set(); this.monthNodes=[]; this.current=new Date();
      this.maxFuture=addMonths(this.current, 24);

      this.observeSentinels();
      this.renderInitial();
      this.bindModal();

      // Fetch shared settings and merge
      loadSharedSettings().then(shared => {
        if (!shared) return;
        const { preferences = {}, holidays = {}, repo = {}, integrations = {} } = shared;
        this.settings.owner = repo.owner || this.settings.owner || '';
        this.settings.repo  = repo.name  || this.settings.repo  || 'Calendar';
        this.settings.timeFormat24h = preferences.timeFormat24h ?? this.settings.timeFormat24h;
        this.settings.weekStart = preferences.weekStart ?? this.settings.weekStart;
        this.settings.timezone = preferences.timezone ?? this.settings.timezone;
        this.settings.theme = preferences.theme ?? this.settings.theme;
        this.settings.holidays = { ...this.settings.holidays, ...holidays };
        if (integrations.tripitIcalUrl) {
          this.settings.tripitIcalUrl = integrations.tripitIcalUrl;
        }
        // re-render visible months to apply changes
        this.monthNodes.forEach(section => {
          const grid = section.querySelector('.month-grid');
          const key = section.dataset.monthKey;
          const date = parseISODate(key + '-01');
          this.renderGrid(date, grid, section.__events || []);
        });
        announceStatus('Loaded shared settings from config/settings.json');
      });
    }

    observeSentinels(){
      const top=document.createElement('div'); top.id='topSentinel'; top.style.height='1px'; this.root.prepend(top);
      const bottom=document.createElement('div'); bottom.id='bottomSentinel'; bottom.style.height='1px'; this.root.appendChild(bottom);

      const ioTop=new IntersectionObserver(es=>{ es.forEach(e=>{ if(!e.isIntersecting) return; const firstKey=this.monthNodes[0]?.dataset?.monthKey||fmtMonthKey(this.current); const [y,m]=firstKey.split('-').map(Number); const prev=new Date(y, (m-1)-1, 1); this.ensureMonth(prev); }); }, {root:this.root, threshold:0.9});
      ioTop.observe(top);

      const ioBottom=new IntersectionObserver(es=>{ es.forEach(e=>{ if(!e.isIntersecting) return; const lastKey=this.monthNodes[this.monthNodes.length-1]?.dataset?.monthKey||fmtMonthKey(this.current); const [y,m]=lastKey.split('-').map(Number); const base=new Date(y, m-1, 1); base.setMonth(base.getMonth()+1); if(base>this.maxFuture) return; this.ensureMonth(base); }); }, {root:this.root, threshold:0.9});
      ioBottom.observe(bottom);
    }

    async renderInitial(){
      const now=new Date();
      await this.ensureMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      await this.ensureMonth(new Date(now.getFullYear(), now.getMonth()-1, 1));
      const base=new Date(now.getFullYear(), now.getMonth(), 1); base.setMonth(base.getMonth()+1); if(base<=this.maxFuture) await this.ensureMonth(base);
    }

    async ensureMonth(d){
      const key=fmtMonthKey(d); if(this.loadedKeys.has(key)) return; this.loadedKeys.add(key);
      const section=await this.renderMonthSection(d);
      const insertBefore=this.monthNodes.find(n=> n.dataset.monthKey>key);
      if(insertBefore){ this.root.insertBefore(section, insertBefore); this.monthNodes.splice(this.monthNodes.indexOf(insertBefore),0,section); }
      else { this.root.appendChild(section); this.monthNodes.push(section); }
    }

    async renderMonthSection(date){
      const y=date.getFullYear(), m=date.getMonth()+1, key=fmtMonthKey(date);
      const wrap=document.createElement('section'); wrap.className='month-section'; wrap.dataset.monthKey=key; wrap.setAttribute('aria-label',`Month ${key}`);

      const header=document.createElement('header'); header.className='month-header';
      const title=document.createElement('h2'); title.textContent=new Intl.DateTimeFormat(undefined,{month:'long', year:'numeric'}).format(date); title.className='month-title'; header.appendChild(title);

      const toggles=document.createElement('div'); toggles.className='holiday-toggles';
      const mkBtn=(label,key)=>{ const b=document.createElement('button'); b.type='button'; b.className='holiday-toggle'; b.dataset.country=key; b.setAttribute('aria-pressed','false'); b.textContent=label; b.addEventListener('click', ()=> this.toggleOverlay(key, date, wrap, b)); return b; };
      toggles.appendChild(mkBtn('Trips','tripit'));
      toggles.appendChild(mkBtn('US','us'));
      toggles.appendChild(mkBtn('UK','uk'));
      toggles.appendChild(mkBtn('NL','nl'));
      header.appendChild(toggles);
      wrap.appendChild(header);

      const grid=document.createElement('div'); grid.className='month-grid'; grid.setAttribute('role','grid'); grid.setAttribute('aria-readonly','false'); wrap.appendChild(grid);

      const { events, sha }=await GH.loadMonth(this.settings, y, m); wrap.dataset.sha = sha||''; wrap.__events=Array.isArray(events)? events: [];
      await this.renderGrid(date, grid, wrap.__events);
      this.precacheOverlays(date).catch(()=>{});
      return wrap;
    }

    async precacheOverlays(d){
      const s=this.settings; const t=[];
      if(s.tripitIcalUrl) t.push(getOverlay('tripit', s.tripitIcalUrl, d));
      if(s.holidays.usUrl) t.push(getOverlay('us', s.holidays.usUrl, d));
      if(s.holidays.ukUrl) t.push(getOverlay('uk', s.holidays.ukUrl, d));
      if(s.holidays.nlUrl) t.push(getOverlay('nl', s.holidays.nlUrl, d));
      await Promise.allSettled(t);
    }

    async toggleOverlay(key, date, section, btn){
      const pressed = btn.getAttribute('aria-pressed')==='true';
      btn.setAttribute('aria-pressed', String(!pressed));
      const urls={ tripit: this.settings.tripitIcalUrl, us: this.settings.holidays.usUrl, uk: this.settings.holidays.ukUrl, nl: this.settings.holidays.nlUrl };
      const url = urls[key];
      if(!url){ announceStatus(`${key==='tripit'?'TripIt':'Holiday'} URL not configured.`); }
      const grid = section.querySelector('.month-grid'); if(!grid) return;
      const base = section.__events||[]; const overlay = !pressed && url? await getOverlay(key, url, date) : [];
      await this.renderGrid(date, grid, base.concat(overlay));
    }

    async renderGrid(date, grid, events){
      grid.innerHTML='';
      // Weekday header row (aligned to columns)
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(n=>{ const h=document.createElement('div'); h.className='weekday'; h.textContent=n; grid.appendChild(h); });

      const first=new Date(date.getFullYear(), date.getMonth(), 1);
      const firstWeekday=(first.getDay()+6)%7; // Monday-first
      const leading=firstWeekday;
      const daysInMonth=new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
      const totalCells = leading + daysInMonth + (7 - ((leading + daysInMonth) % 7 || 7));
      const todayISO=toISODateLocal(new Date());

      for(let i=0;i<totalCells;i++){
        const cell=document.createElement('div'); cell.className='day-cell'; cell.setAttribute('role','gridcell');
        const dayNum=i - leading + 1;
        if(i<leading || dayNum>daysInMonth){ cell.classList.add('outside'); grid.appendChild(cell); continue; }
        const cellDate=new Date(date.getFullYear(), date.getMonth(), dayNum); const iso=toISODateLocal(cellDate); cell.dataset.date=iso;
        const label=document.createElement('button'); label.type='button'; label.className='day-label'; label.textContent=String(dayNum); label.setAttribute('aria-label',`Add or view events for ${iso}`); label.addEventListener('click',()=> this.openEventModal({date:iso})); cell.appendChild(label);
        if(iso===todayISO) cell.classList.add('today');
        const list=document.createElement('ul'); list.className='event-list';
        events.filter(e=> e.date===iso).forEach(ev=>{ const li=document.createElement('li'); li.className='event-item' + (ev.__overlay?' overlay':''); const btn=document.createElement('button'); btn.type='button'; btn.className='event-btn'; const prefix=ev.startTime? `${ev.startTime} `:''; btn.textContent=`${prefix}${ev.title}`; btn.title=ev.notes||''; btn.addEventListener('click',()=>{ if(ev.__overlay && ev.url){ window.open(ev.url,'_blank'); } else { this.openEventModal(ev); } }); li.appendChild(btn); if(ev.url && ev.__overlay){ const a=document.createElement('a'); a.href=ev.url; a.target='_blank'; a.rel='noopener noreferrer'; a.className='event-link'; a.textContent='↗'; li.appendChild(a);} list.appendChild(li); });
        cell.appendChild(list); grid.appendChild(cell);
      }
    }

    // Modal CRUD
    bindModal(){
      this.modal=document.getElementById('eventModal'); if(!this.modal){ consoleWarn('No #eventModal'); return; }
      const $=(sel)=> this.modal.querySelector(sel);
      this.f={ id:$('#eventId'), title:$('#eventTitle'), date:$('#eventDate'), start:$('#eventStart'), end:$('#eventEnd'), notes:$('#eventNotes'), url:$('#eventUrl'), save:$('#saveEventBtn'), del:$('#deleteEventBtn'), cancel:$('#cancelEventBtn') };
      this.f.save?.addEventListener('click',()=> this.onSaveEvent()); this.f.del?.addEventListener('click',()=> this.onDeleteEvent()); this.f.cancel?.addEventListener('click',()=> this.closeModal());
      this.modal.addEventListener('keydown',(e)=>{ if(e.key==='Escape') this.closeModal(); });
    }

    openEventModal(ev){
      if(!this.modal) return;
      const isNew=!ev.id; const dflt={ id:'', title:'', date:toISODateLocal(new Date()), startTime:'', endTime:'', notes:'', url:'' };
      const data={...dflt, ...ev}; this.editingMonthKey=data.date.slice(0,7);
      this.f.id.value=data.id||''; this.f.title.value=data.title||''; this.f.date.value=data.date||''; this.f.start.value=data.startTime||''; this.f.end.value=data.endTime||''; this.f.notes.value=data.notes||''; this.f.url.value=data.url||'';
      if(this.f.del) this.f.del.style.display=isNew?'none':'';
      this.modal.showModal?.(); this.f.title?.focus();
    }

    closeModal(){ try{ this.modal.close?.(); }catch{} }
    findSectionByKey(key){ return this.monthNodes.find(n=> n.dataset.monthKey===key); }
    collectBaseEvents(section){ return Array.isArray(section.__events)? section.__events.filter(e=> !e.__overlay) : []; }

    async onSaveEvent(){
      const s=this.settings; if(!s.token||!s.owner||!s.repo){ announceStatus('Configure Owner/Repo and paste your GitHub token in Settings first.'); return; }
      const key=this.editingMonthKey; const section=this.findSectionByKey(key); if(!section) return;
      const ev={ id:this.f.id.value||uuid(), title:this.f.title.value.trim(), date:this.f.date.value, startTime:this.f.start.value, endTime:this.f.end.value, notes:this.f.notes.value, url:this.f.url.value };
      if(!ev.title||!ev.date){ announceStatus('Title and date are required.'); return; }
      let base=this.collectBaseEvents(section); const idx=base.findIndex(x=> x.id===ev.id); if(idx>=0) base[idx]=ev; else base.push(ev);
      try{ const y=Number(key.slice(0,4)), m=Number(key.slice(5,7)); const res=await GH.saveMonth(this.settings, y, m, base, section.dataset.sha||null); section.dataset.sha=res?.content?.sha || res?.sha || section.dataset.sha || ''; section.__events=base; announceStatus(`Saved to data/${key}.json`);
        const grid=section.querySelector('.month-grid'); const active=Array.from(section.querySelectorAll('.holiday-toggle[aria-pressed="true"]')).map(b=>b.dataset.country); let combo=base.slice(); for(const cc of active){ const urls={tripit:this.settings.tripitIcalUrl, us:this.settings.holidays.usUrl, uk:this.settings.holidays.ukUrl, nl:this.settings.holidays.nlUrl}; const u=urls[cc]; if(u){ const evts=await getOverlay(cc, u, parseISODate(key+'-01')); combo=combo.concat(evts); } } await this.renderGrid(parseISODate(key+'-01'), grid, combo);
      }catch(e){ consoleWarn('save fail', e); announceStatus('Save failed. Check token permissions and network.'); }
      this.closeModal();
    }

    async onDeleteEvent(){
      const key=this.editingMonthKey; const section=this.findSectionByKey(key); if(!section) return;
      const id=this.f.id.value; if(!id){ this.closeModal(); return; }
      let base=this.collectBaseEvents(section); base=base.filter(e=> e.id!==id);
      try{ const y=Number(key.slice(0,4)), m=Number(key.slice(5,7)); const res=await GH.saveMonth(this.settings, y, m, base, section.dataset.sha||null); section.dataset.sha=res?.content?.sha || res?.sha || section.dataset.sha || ''; section.__events=base; announceStatus(`Deleted. Saved to data/${key}.json`); const grid=section.querySelector('.month-grid'); await this.renderGrid(parseISODate(key+'-01'), grid, base); }catch(e){ consoleWarn('delete fail', e); announceStatus('Delete failed.'); }
      this.closeModal();
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{ try{ new CalendarApp('monthsContainer'); announceStatus('Calendar ready.'); }catch(e){ consoleWarn('init', e); announceStatus('Calendar failed to initialize.'); } });
})();
