'use strict';

const $ = (s, root = document) => root.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money = v => v == null ? 'Unknown' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));
const label = v => String(v || '').replaceAll('_',' ');
const state = {view:'shop',engine:'gemini',meta:{},offers:[],memories:[],graph:null,run:null,memoryRun:null,lastRun:null,busy:false,prompt:'',memoryDraft:'',useMemory:true,search:'',condition:'all',stock:'all',showHistory:false,selectedNode:'understand'};
const requestedUser = new URLSearchParams(location.search).get('user');
const USER = /^[a-zA-Z0-9_-]{1,60}$/.test(requestedUser||'') ? requestedUser : 'shopper-001';
const pages = {shop:'Shopping assistant',catalog:'Product catalog',memory:'Memory',architecture:'Architecture'};

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check the request fields and try again.');
  return data;
}

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.remove('show'),4200);
}

const productImages = {'AURA-ONE-BLK':'aura-one','FORM-STUDIO-WHT':'form-studio','ECHO-AIR-GRN':'echo-air','PULSE-LITE-BLU':'pulse-lite','AURA-PRO-BLK':'aura-pro','FORM-OPEN-SND':'form-open'};
function art(p) { return `<img class="product-art" src="/static/images/${productImages[p.product_id]||'aura-one'}.webp" alt="${esc(p.product_name||'Black wireless headphones')} — illustrative product image" loading="lazy" width="1024" height="1024">`; }

function groupedCatalog(filtered=true) {
  const groups=new Map();
  for(const o of state.offers){
    if(filtered && state.condition!=='all' && o.condition!==state.condition)continue;
    if(filtered && state.stock==='available' && !o.in_stock)continue;
    if(filtered && state.search && !`${o.product_name} ${o.retailer} ${o.model}`.toLowerCase().includes(state.search.toLowerCase()))continue;
    if(!groups.has(o.product_id))groups.set(o.product_id,[]);
    groups.get(o.product_id).push(o);
  }
  return [...groups.values()].map(offers=>{
    const sorted=[...offers].sort((a,b)=>Number(a.total_price??Infinity)-Number(b.total_price??Infinity));
    const best=sorted.find(o=>o.in_stock&&o.total_price!=null)||sorted.find(o=>o.in_stock)||sorted[0];
    return {...best,offer_count:offers.length,group:true};
  });
}
function productCard(o,{recommended=false,group=false}={}){
  return `<article class="product-card ${recommended?'recommended':''}"><div class="product-image ${esc(o.color)}">${recommended?`<span class="pick-label">${icon('spark')}Scout’s pick</span>`:''}${art(o)}</div><div class="product-info"><span class="product-brand">${esc(o.brand)} / ${esc(o.form_factor)}</span><h3>${esc(o.product_name)}</h3><div class="product-features"><span>${o.noise_cancelling?'Noise cancelling':'Open to your world'}</span><span>${o.battery_hours}h battery · ${group?o.offer_count+' offers':esc(o.condition)}</span></div><div class="product-price"><strong>${money(o.total_price)}</strong><span>${group?'from, delivered':'delivered'}</span></div><button class="offer-detail" data-product="${esc(o.product_id)}">${group?'Compare offers':esc(o.retailer)} ${icon('arrow')}</button></div></article>`;
}
const shoppingSteps=[['understand','Understand','Turn your request into requirements'],['retrieve_memory','Recall','Bring in approved preferences'],['plan_search','Plan','Set a bounded search strategy'],['search_catalog','Search','Read the sample CSV offers'],['compare_offers','Compare','Check fit, stock, and delivered cost'],['recommend','Recommend','Explain the best eligible fit'],['approve_purchase','Your call','Wait for your explicit approval']];
function inspector(run=state.run){
  const done=new Set((run?.audit_log||[]).map(e=>e.node));const pending=new Set(run?.pending?run.next:[]);
  return `<aside class="run-aside"><div class="inspector"><div class="inspector-title"><h2>The thinking trail</h2>${icon('flow')}</div><p class="inspector-description">A clear path to a thoughtful choice.</p><div class="workflow-steps">${shoppingSteps.map(([key,title,desc],i)=>`<div class="workflow-step ${pending.has(key)?'waiting':done.has(key)?'done':''}"><span class="step-number">${done.has(key)&&!pending.has(key)?icon('check'):String(i+1).padStart(2,'0')}</span><div class="step-copy"><strong>${title}</strong><span>${desc}</span></div>${pending.has(key)?'<span class="waiting-dot"></span>':''}</div>`).join('')}</div><div class="inspector-bottom"><div class="inspector-stat"><span>Source</span><strong>headphones.csv</strong></div><div class="inspector-stat"><span>Preferences applied</span><strong>${run?.selected_memories?.filter(m=>m.applied).length||0}</strong></div><div class="inspector-stat"><span>Engine</span><strong>${esc(run?.engine_label||(state.engine==='gemini'?'Gemini':'Sample rules · no LLM'))}</strong></div>${run?'<button class="secondary-button" data-inspect>Inspect saved state '+icon('arrow')+'</button>':''}<button class="text-button" data-view="architecture">See the full workflow ${icon('arrow')}</button></div></div><div class="tips-card">${icon('shield','tips-icon')}<h3>You’re in the loop.</h3><p>Every saved preference and simulated purchase needs your approval.</p></div></aside>`;
}
function soundwave(){return `<svg class="soundwave" viewBox="0 0 600 380" fill="none" aria-hidden="true">${Array.from({length:12},(_,i)=>`<path d="M -40 ${125+i*13} C 70 ${40+i*14},130 ${305-i*9},225 ${178+i*4} S 380 ${30+i*17},640 ${135+i*12}"/>`).join('')}</svg>`;}
function composer(home=false){
  return `<div class="composer-wrap ${home?'home-composer':''}"><form id="shop-form" class="composer-card"><div class="composer-top">${icon('spark')}A GOOD FIND STARTS WITH YOU</div><label class="screen-reader" for="prompt">Your shopping request</label><textarea id="prompt" maxlength="2000" placeholder="I’m looking for wireless headphones under $150 for studying…" ${state.busy?'disabled':''}>${esc(state.prompt)}</textarea><div class="composer-bottom"><label class="memory-toggle"><input type="checkbox" id="use-memory" ${state.useMemory?'checked':''}>${icon('memory')}Use my preferences</label><button class="primary-button" type="submit" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':'Find my headphones '+icon('arrow')}</button></div></form><div class="prompt-chips">${[['Focused studying','Find new over-ear headphones under $150 for studying with noise cancellation.'],['On a budget','Find the cheapest wireless headphones under $90.'],['Long battery life','Find over-ear headphones under $150. Prioritize battery life.']].map(([title,prompt])=>`<button class="prompt-chip" data-prompt="${esc(prompt)}">${title} ${icon('plus')}</button>`).join('')}</div></div>`;
}
function constraintsRow(run){const c=run?.effective_constraints||{};return `<div class="constraints-row">${[c.budget&&`Under ${money(c.budget)}`,c.form_factor,c.condition&&`${c.condition==='any'?'New or refurbished':c.condition}`,c.noise_cancelling===true&&'Noise cancelling',c.min_battery_hours&&`Battery ≥ ${c.min_battery_hours}h`,c.priority&&`Priority: ${label(c.priority)}`].filter(Boolean).map(v=>`<span class="pill">${esc(v)}</span>`).join('')}</div>`;}
function runResult(run){
  if(!run)return '';
  const c=run.comparison||{};
  let html=`<div class="request-bubble"><span class="avatar">${USER==='shopper-001'?'BL':'S'}</span><p>${esc(run.request)}</p><span class="pill">Your request</span></div>${constraintsRow(run)}`;
  if(run.error)return html+`<div class="error-box"><h3>This step couldn’t finish.</h3><p>${esc(run.error)}</p><button class="secondary-button" data-settings>Connection settings</button></div>`;
  if(state.busy&&!run.pending&&!run.recommendation)return html+`<div class="loading-card"><span class="spinner"></span><div><h3>Connecting the dots…</h3><p>${esc(run.audit_log?.at(-1)?.detail||'Interpreting your request…')}</p></div></div>`;
  if(run.recommendation){const r=run.recommendation;
    html+=`<div class="answer-intro"><span class="assistant-avatar">${icon('spark')}</span><p>${esc(r.summary)}</p></div>`;
    const mem=(run.selected_memories||[]).filter(m=>m.applied);
    if(mem.length)html+=`<div class="memory-used">${icon('memory')}Made a little more you: ${mem.map(m=>`${esc(label(m.key))}: ${esc(m.value)}`).join(' · ')}</div>`;
    html+=`<div class="results-grid" data-count="${(c.shortlist||[]).length}">${(c.shortlist||[]).map(o=>productCard(o,{recommended:o.offer_id===r.offer_id})).join('')}</div><p class="offer-footnote">Known shipping included · Before tax · Fictional sample offers</p><div class="recommendation-notes"><h3>Why this fits</h3><ul class="reason-list">${(r.reasons||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>${r.tradeoffs?.length?`<p class="tradeoff">${r.tradeoffs.map(esc).join(' ')}</p>`:''}</div>`;
  }
  if(run.pending?.kind==='clarification')html+=`<div class="approval-card"><span class="mini-label">ONE QUICK DETAIL</span><h3>Let’s narrow it down.</h3><p>${esc(run.pending.question)}</p><form id="clarify-form" class="inline-clarify"><input class="text-input" id="clarification" placeholder="My budget is $150 including shipping" aria-label="Budget clarification" required maxlength="1000"><button class="primary-button" ${state.busy?'disabled':''}>Continue ${icon('arrow')}</button></form></div>`;
  if(run.pending?.kind==='purchase_approval'){const o=run.pending.offer;html+=`<div class="approval-card"><div class="approval-header"><span class="approval-icon">${icon('shield')}</span><div><span class="mini-label">YOUR CALL</span><h3>A good fit. Ready for your okay.</h3><p>${esc(o.product_name)} · ${esc(o.retailer)} · <strong>${money(o.total_price)}</strong> delivered, before tax.</p><small>This is a simulation. No real order, payment, or checkout.</small></div></div><div class="approval-actions"><button class="primary-button" data-resume="true" ${state.busy?'disabled':''}>${icon('check')}Confirm simulation</button><button class="secondary-button" data-resume="false" ${state.busy?'disabled':''}>Reject purchase</button></div></div>`;}
  if(['SIMULATED_CONFIRMED','CANCELLED'].includes(run.status))html+=`<div class="outcome-card ${run.confirmed?'':'cancelled'}">${icon(run.confirmed?'check':'close')}<p>${esc(run.response)}</p></div>`;
  if(['NO_MATCHES','UNSUPPORTED','NEEDS_INFORMATION'].includes(run.status))html+=`<div class="empty-state">${icon('search')}<h3>${run.status==='NO_MATCHES'?'No fit within these limits.':'Let’s adjust the request.'}</h3><p>${esc(run.response)}</p></div>`;
  if(run.plan)html+=`<details class="details-panel"><summary>The search plan <span>${esc(run.plan.query)}</span></summary><ol class="reason-list">${(run.plan.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p class="muted-small">Ranking: ${esc(label(run.plan.sort_by))}</p></details>`;
  if(c.excluded?.length||c.uncertain?.length)html+=`<details class="details-panel"><summary>Why other offers didn’t make the cut <span>${(c.excluded?.length||0)+(c.uncertain?.length||0)} offers</span></summary>${[...(c.excluded||[]),...(c.uncertain||[])].map(o=>`<div class="detail-row"><strong>${esc(o.product_name)} · ${esc(o.retailer)} · ${esc(o.offer_id)}</strong><span>${esc(o.reasons.join('; '))}</span></div>`).join('')}</details>`;
  return html+`<div class="run-meta"><span>${esc(run.engine_label)} · Thread ${esc(run.thread_id?.slice(0,8))}</span><button class="subtle-link" data-export>${icon('download')}Export run</button></div>`;
}
function shopView(){
 if(!state.run&&!state.busy)return `<section class="home-hero"><div class="hero-copy"><div class="page-eyebrow"><span class="tiny-star">✳</span> LESS SCROLLING. MORE LISTENING.</div><h1>Find your kind<br> of <em>sound.</em></h1><p class="hero-description">Tell us what matters. Scout brings the options,<br class="desktop-break"> the comparisons, and a little clarity.</p>${composer(true)}</div><div class="hero-visual"><img class="hero-photo" src="/static/images/hero-editorial.webp" width="1536" height="1024" alt="Black headphones above a softly lit sage stone pedestal">${soundwave()}<div class="hero-caption"><span></span> A thoughtful way to find your next favorite.</div></div></section><section class="starting-points"><div class="section-heading"><div><span class="mini-label">A LITTLE INSPIRATION</span><h2>A few good starting points.</h2></div><button class="text-button" data-view="catalog">Explore the catalog ${icon('arrow')}</button></div><div class="home-products">${groupedCatalog(false).slice(0,3).map(o=>productCard(o,{group:true})).join('')}</div><div class="home-trust"><span>${icon('grid')}6 products · 20 sample offers</span><span>${icon('memory')}Preferences with your permission</span><span>${icon('flow')}Every step, in the open</span></div></section>`;
 return `<div class="page-heading"><div><div class="page-eyebrow">LESS GUESSWORK. MORE GOOD CHOICES.</div><h1>A clearer <em>choice.</em></h1><p>All the details that matter, brought together.</p></div><button class="secondary-button" id="new-search" ${state.busy?'disabled':''}>${icon('plus')}New thread</button></div><div class="workbench"><section class="shop-main">${state.run?runResult(state.run):'<div class="loading-card"><span class="spinner"></span><div><h3>A little thinking goes a long way.</h3><p>Starting the LangGraph workflow…</p></div></div>'}${composer()}</section>${inspector()}</div>`;
}
function catalogView(){return `<div class="page-heading"><div><div class="page-eyebrow">FIND YOUR NEXT FAVORITE</div><h1>Meet the <em>contenders.</em></h1><p>A considered selection. Every offer, ready to compare.</p></div><div class="catalog-stats"><strong>${state.meta.products||6}<span>products</span></strong><strong>${state.meta.catalog_offers||20}<span>sample offers</span></strong><strong>${state.meta.retailers||3}<span>retailers</span></strong></div></div><div class="toolbar"><label class="search-field">${icon('search')}<input id="catalog-search" placeholder="Find a product or retailer…" aria-label="Search catalog" value="${esc(state.search)}"></label><div class="filters"><select id="condition-filter" aria-label="Product condition"><option value="all">All conditions</option><option value="new" ${state.condition==='new'?'selected':''}>New only</option><option value="refurbished" ${state.condition==='refurbished'?'selected':''}>Refurbished only</option></select><select id="stock-filter" aria-label="Stock availability"><option value="all">All availability</option><option value="available" ${state.stock==='available'?'selected':''}>In stock only</option></select></div><span class="source-label">${icon('box')}headphones.csv</span></div><div class="catalog-grid" id="catalog-grid">${catalogGrid()}</div><div class="feature-note">${icon('info')}Sample products, illustrative images, and fictional prices. “From” includes known shipping on available offers, before tax.</div>`;}
function catalogGrid(){const p=groupedCatalog();return p.length?p.map(o=>productCard(o,{group:true})).join(''):'<div class="empty-results">No products match these filters. Try another search.</div>';}
function memoryHeadline(m){
 const v=String(m.value);
 if(m.key==='form_factor')return `I prefer ${v} headphones.`;
 if(m.key==='condition')return v==='any'?'New or refurbished works for me.':`I prefer ${v} products.`;
 if(m.key==='noise_cancelling')return v==='true'?'I look for noise cancellation.':'Noise cancellation is optional.';
 if(m.key==='min_battery_hours')return `At least ${v} hours of battery life.`;
 if(m.key==='priority')return `I prioritize ${label(v)}.`;
 return m.text;
}
function memoryView(){
 const active=state.memories.filter(m=>m.status==='active');const visible=state.showHistory?state.memories:active;
 return `<div class="page-heading memory-heading"><div><div class="page-eyebrow">A LITTLE CONTEXT GOES A LONG WAY</div><h1>A little memory.<br> A better <em>match.</em></h1><p>The things that matter to you, remembered with your say-so.</p></div><div class="memory-sculpture" aria-hidden="true"><span class="memory-tile back">${icon('headphones')}</span><span class="memory-tile front">${icon('memory')}<i></i><i></i><i></i></span><span class="sculpture-star">✳</span></div></div><div class="memory-layout"><section><div class="section-heading"><h2>Your preferences <span class="count-badge">${active.length}</span></h2><label class="history-toggle"><input id="history-toggle" type="checkbox" ${state.showHistory?'checked':''}>Show history</label></div>${visible.length?visible.map(m=>`<article class="memory-card ${m.status==='superseded'?'superseded':''}"><span class="memory-card-icon">${icon(m.key==='form_factor'?'headphones':m.key==='condition'?'box':m.key==='min_battery_hours'?'clock':'spark')}</span><div class="memory-card-copy"><div class="badge-row"><span class="mini-label">${esc(label(m.key))}</span><span class="pill ${m.status==='active'?'green':'gray'}">${icon(m.status==='active'?'check':'clock')}${esc(m.status)}</span></div><h3>${esc(memoryHeadline(m))}</h3><div class="memory-meta"><span>${esc(label(m.memory_type))} · ${esc(m.scope)}</span><span>Approved ${esc(new Date(m.approved_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}))}</span></div><div class="memory-provenance">${icon('chat')}Source thread ${esc(m.source_thread.slice(0,8))} <span>· ${m.superseded_by?'Replaced by '+esc(m.superseded_by.slice(0,8)):'Available across new threads'}</span></div></div></article>`).join(''):`<div class="empty-state memory-empty">${icon('memory')}<h3>A fresh start, with room for you.</h3><p>Share a preference and review the proposal. Nothing is saved until you approve it.</p></div>`}<div class="memory-warning">${icon('info')}Approved preferences carry across new threads in this server session. They clear when the server restarts.</div></section><aside><form class="memory-form-panel" id="memory-form"><span class="form-symbol">${icon('plus')}</span><h2>Teach Scout a preference.</h2><p>A small detail can make your next find feel a little more you.</p><label class="field-label" for="memory-statement">What should Scout know?</label><textarea id="memory-statement" maxlength="1000" placeholder="I generally prefer over-ear headphones." ${state.busy?'disabled':''}>${esc(state.memoryDraft)}</textarea><button class="primary-button" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':'Propose a memory '+icon('arrow')}</button><div class="memory-examples"><span class="mini-label">A FEW IDEAS TO GET STARTED</span>${['I generally prefer over-ear headphones.','I generally buy new products only.','From now on, refurbished products are acceptable.','Refurbished is acceptable for this purchase.'].map(v=>`<button type="button" data-memory-example="${esc(v)}">${esc(v)} ${icon('plus')}</button>`).join('')}</div></form>${state.memoryRun?memoryResult(state.memoryRun):''}<div class="memory-promise">${icon('shield')}You review every proposal before it’s saved.</div></aside></div>`;
}
function memoryResult(run){
 if(run.error)return `<div class="error-box">${esc(run.error)}<button class="secondary-button" data-settings>Connection settings</button></div>`;
 if(!run.proposal)return state.busy?'<div class="loading-card"><span class="spinner"></span><p>Considering this preference…</p></div>':'';
 const p=run.proposal;
 return `<div class="memory-proposal"><div class="badge-row"><span class="mini-label">REVIEW YOUR PROPOSAL</span><span class="pill ${p.decision==='STORE'?'green':'amber'}">${esc(p.decision)}</span></div><h3>${p.text?esc(p.text):'No reusable preference proposed'}</h3><p>${esc(p.reason)}</p>${run.previous_memories?.length?`<div class="previous-memory"><span class="mini-label">PREVIOUSLY APPROVED</span><p>${run.previous_memories.map(m=>esc(m.value)).join(', ')}</p><small>Replaced only if you approve this proposal.</small></div>`:''}${run.pending?.kind==='memory_approval'?`<div class="approval-actions"><button class="primary-button" data-memory-resume="true" ${state.busy?'disabled':''}>${icon('check')}Approve memory</button><button class="secondary-button" data-memory-resume="false" ${state.busy?'disabled':''}>Reject memory</button></div>`:`<p class="memory-outcome">${icon(run.status==='MEMORY_SAVED'?'check':'info')}${esc(run.response||label(run.status))}</p>`}<button class="text-button" data-inspect-memory>Inspect this workflow ${icon('arrow')}</button><small class="muted-small">${esc(run.engine_label)} · ${esc(run.thread_id.slice(0,8))}</small></div>`;
}

const nodeInfo = {
  __start__:['START','Entry point','Graph execution begins here.'],
  intake:['01','Start a thread','Initialize a fresh execution state and route shopping or memory input.'],
  understand:['02','Understand request','Gemini extracts typed constraints from explicit request text. A sample engine uses labeled rules.'],
  retrieve_memory:['03','Retrieve memory','Read this user’s active records. Rank by relevance, importance, and recency. Current explicit constraints take precedence.'],
  clarify:['?','Clarify budget','interrupt() pauses for the missing budget. Command(resume=…) supplies the answer to the same thread.'],
  plan_search:['04','Plan the search','Gemini produces a structured search plan. Python validates that it preserves every effective constraint.'],
  search_catalog:['05','Search the CSV','The Python tool reads headphones.csv and executes model matching from the validated plan.'],
  compare_offers:['06','Compare offers','Python filters stock and hard constraints, calculates decimal item-and-shipping totals, and ranks equivalent offers.'],
  recommend:['07','Recommend','Gemini chooses an ID from the validated shortlist and explains its fit. Unknown IDs cannot prepare an action.'],
  approve_purchase:['08','Human approval','interrupt() checkpoints the exact proposed offer. A strict boolean resume value selects confirmation or cancellation.'],
  confirm_purchase:['✓','Confirm simulation','A separate node verifies approval and records a simulated confirmation. No real order or payment occurs.'],
  cancel_purchase:['×','Cancel purchase','The rejection branch finishes without a purchase confirmation.'],
  no_matches:['!','No suitable offers','Explain why no eligible offer has a known delivered cost. Never silently increase the budget or relax a requirement.'],
  unsupported:['!','Outside catalog','Stop unsupported categories before executing the CSV tool.'],
  insufficient:['!','Need information','Stop after two unsuccessful budget clarification attempts.'],
  form_memory:['M1','Form a memory','Semantic judgment proposes STORE, TEMPORARY, or HUMAN_REVIEW. Deterministic guards screen sensitive or temporary input.'],
  approve_memory:['M2','Approve memory','Show the exact canonical record and any previous value. Memory consent is independent of purchase approval.'],
  save_memory:['M3','Save preference','Write only after approval. Deduplicate equal values and supersede corrections while retaining history and provenance.'],
  finish_memory:['M4','Finish without write','Temporary input, uncertain candidates, and rejected proposals do not enter the reusable store.'],
  __end__:['END','End this run','The graph has reached a terminal branch. Ending is not equivalent to approval.']
};
const positions={__start__:[30,68],intake:[205,68],understand:[380,68],retrieve_memory:[555,68],plan_search:[730,68],search_catalog:[905,68],unsupported:[380,204],clarify:[555,204],insufficient:[730,204],compare_offers:[905,330],recommend:[730,330],approve_purchase:[555,330],confirm_purchase:[380,330],cancel_purchase:[555,452],no_matches:[905,452],form_memory:[205,595],approve_memory:[380,595],save_memory:[555,595],finish_memory:[730,595],__end__:[905,595]};
function graphStatus(key){const r=state.lastRun;if(!r)return 'idle';if(r.error&&r.next?.includes(key))return 'error';if(r.pending&&r.next?.includes(key))return 'pending';if(state.busy&&!r.pending&&!r.error&&r.next?.includes(key))return 'running';if((r.audit_log||[]).some(e=>e.node===key)||key==='__start__')return 'visited';if(key==='__end__'&&!r.pending&&!r.error&&!state.busy&&!r.next?.length)return 'visited';return 'idle';}
function graphSvg(){
 if(!state.graph)return '';
 const run=state.lastRun,events=run?.audit_log||[];
 const sequence=['__start__',...events.map(e=>e.node),...(run?.pending||state.busy?run?.next||[]:[])];
 const doneEdges=new Set(sequence.slice(1).map((n,i)=>`${sequence[i]}:${n}`));
 if(run&&!run.pending&&!run.error&&!state.busy&&!run.next?.length&&events.length)doneEdges.add(`${events.at(-1).node}:__end__`);
 const edges=state.graph.edges.map(e=>{
  const a=positions[e.source],b=positions[e.target];if(!a||!b)return '';
  const [ax,ay]=a,[bx,by]=b,w=148,h=57;let d;
  if(ay===by){const f=bx>ax,x1=ax+(f?w:0),x2=bx+(f?0:w);d=Math.abs(bx-ax)>190?`M${x1} ${ay+h/2} H${x1+(f?12:-12)} V${ay-24} H${x2-(f?12:-12)} V${by+h/2} H${x2}`:`M${x1} ${ay+h/2} H${x2}`;}
  else if(e.target==='__end__'){const lane=by-27;d=`M${ax+w} ${ay+h/2} H1080 V${lane} H${bx+w/2} V${by}`;}
  else if(e.source==='intake'&&e.target==='form_memory')d=`M${ax+w/2} ${ay+h} V165 H174 V${by+h/2} H${bx}`;
  else if(e.source==='clarify'&&e.target==='understand')d=`M${ax} ${ay+h/2} H${bx+w/2} V${by+h}`;
  else{const x1=ax+w/2,y1=ay+(by>ay?h:0),x2=bx+w/2,y2=by+(by>ay?0:h);d=`M${x1} ${y1} V${(y1+y2)/2} H${x2} V${y2}`;}
  const visited=doneEdges.has(`${e.source}:${e.target}`),current=visited&&['pending','running'].includes(graphStatus(e.target));
  return `<path class="graph-edge ${e.conditional?'conditional':''} ${visited?'visited':''} ${current?'current':''}" d="${d}" marker-end="url(#arrow-${current?'current':visited?'visited':'default'})"><title>${esc(e.source)} → ${esc(e.target)}${e.label?': '+esc(e.label):''}</title></path>`;
 }).join('');
 const nodes=state.graph.nodes.map(key=>{const pos=positions[key],info=nodeInfo[key];if(!pos||!info)return '';const [x,y]=pos,s=graphStatus(key);return `<g class="graph-node ${s} ${state.selectedNode===key?'selected':''}" data-node="${key}" tabindex="0" role="button" aria-label="${esc(info[1])}: ${s==='idle'?'not executed':s==='visited'?'executed':s}"><rect x="${x}" y="${y}" width="148" height="57" rx="9"/><circle cx="${x+132}" cy="${y+15}" r="3"/><text class="node-number" x="${x+12}" y="${y+18}">${esc(info[0])}${s==='pending'?' · YOUR CALL':s==='visited'?' · DONE':''}</text><text class="node-title" x="${x+12}" y="${y+38}">${esc(info[1])}</text></g>`;}).join('');
 return `<svg viewBox="0 0 1110 693" xmlns="http://www.w3.org/2000/svg" aria-label="Actual LangGraph workflow with all ${state.graph.nodes.length} nodes and conditional memory routes" role="group"><defs>${['default','visited','current'].map(c=>`<marker id="arrow-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrow-${c}" d="m0 0 10 5-10 5"/></marker>`).join('')}</defs><rect class="memory-lane" x="15" y="547" width="1065" height="125" rx="12"/><text class="graph-caption" x="30" y="33">SHOPPING · FROM REQUEST TO YOUR DECISION</text><text class="graph-caption" x="30" y="574">MEMORY · SAME AGENT, SEPARATE APPROVAL</text>${edges}${nodes}</svg>`;
}
function architectureView(){
 const run=state.lastRun,info=nodeInfo[state.selectedNode],status=graphStatus(state.selectedNode),event=run?.audit_log?.findLast(e=>e.node===state.selectedNode);
 const routes=(state.graph?.edges||[]).filter(e=>e.source===state.selectedNode);
 return `<div class="page-heading"><div><div class="page-eyebrow">BUILT TO BE UNDERSTOOD</div><h1>Every step, in the <em>open.</em></h1><p>One stateful agent. A visible plan. You, in control.</p></div><button class="secondary-button" id="download-graph">${icon('download')}Export Mermaid</button></div><div class="architecture-layout"><section class="graph-panel"><div class="graph-toolbar"><div><h2>Scout’s LangGraph</h2><span>${state.graph?.nodes.length||20} nodes · ${run?esc(run.engine_label)+' · '+esc(run.thread_id.slice(0,8)):'Choose a node to explore'}</span></div><div class="graph-legend"><span><i></i>Not run</span><span><i class="visited"></i>Executed</span><span><i class="pending"></i>Waiting</span></div></div><div class="graph-canvas" data-zoom="${state.graphZoom||'fit'}">${graphSvg()}</div><div class="graph-bottom"><span>${icon('info')}Dashed connections are conditional routes.</span><button class="subtle-link" id="graph-zoom">${icon('search')}${state.graphZoom==='detail'?'Fit diagram':'Enlarge diagram'}</button></div></section><aside class="node-inspector"><div class="inspector-eyebrow">${icon('flow')}NODE EXPLORER</div><span class="node-index">${esc(info[0])}</span><h2>${esc(info[1])}</h2><code>${esc(state.selectedNode)}</code><span class="pill ${status==='pending'?'amber':status==='visited'?'green':''}">${status==='idle'?'Not executed':status==='visited'?'Executed':status==='pending'?'Waiting for you':label(status)}</span><p>${esc(info[2])}</p><div class="node-routes"><span class="mini-label">NEXT POSSIBLE STEPS</span>${routes.length?routes.map(e=>`<button data-node="${esc(e.target)}">${esc(nodeInfo[e.target]?.[1]||e.target)} <span>${esc(e.label||'next')} ${icon('arrow')}</span></button>`).join(''):'<p>This branch has ended.</p>'}</div>${event?`<div class="node-event"><span class="mini-label">LATEST ACTUAL EVENT</span><p>${esc(event.detail)}</p></div>`:''}${run?'<button class="secondary-button" data-inspect-last>Inspect saved state '+icon('arrow')+'</button>':'<div class="node-hint">Start a shopping or memory request to see its actual path light up.</div>'}</aside></div><div class="architecture-principles"><article><span class="principle-icon">${icon('chat')}</span><div><h3>State follows the thread.</h3><p>InMemorySaver checkpoints the request, plan, offers, and approval. An interrupt resumes that same execution.</p></div><span class="pill">thread_id</span></article><article><span class="principle-icon">${icon('memory')}</span><div><h3>Memory follows you.</h3><p>InMemoryStore retrieves approved preferences across new threads. Both stores clear on server restart.</p></div><span class="pill">user_id</span></article></div><div class="architecture-bottom"><details class="details-panel"><summary>Exact graph from LangGraph <span>Mermaid source</span></summary><pre class="code-block">${esc(state.graph?.mermaid||'Loading…')}</pre></details><details class="details-panel"><summary>Latest execution trace <span>${run?esc(run.status):'No run yet'}</span></summary>${run?(run.audit_log||[]).map(e=>`<div class="detail-row"><strong>${esc(e.node)}</strong><span>${esc(e.detail)}</span></div>`).join(''):'<p>Start a request to inspect its node events.</p>'}</details></div><p class="diagram-notice">Nodes and edges are read from app.get_graph(). Highlights reflect actual events and the saved waiting node.</p>`;
}

function render() {
  document.title = `Scout — ${pages[state.view]}`;
  $('#engine-label').textContent=state.engine==='gemini'?(state.meta.connected?'Gemini connected':'Connect Gemini'):'Sample · no LLM';
  $('#profile-button').textContent=USER==='shopper-001'?'BL':'S';
  $('#profile-button').title=`Workspace: ${USER}`;
  document.querySelectorAll('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===state.view);el.setAttribute('aria-current',el.dataset.view===state.view?'page':'false');});
  $('#memory-count').textContent=state.memories.filter(r=>r.status==='active').length;
  $('#connection-dot').classList.toggle('connected',state.meta.connected&&state.engine==='gemini');
  $('#engine-select').value=state.engine;
  $('#engine-select').disabled=state.busy;
  $('#content').innerHTML=(state.runError?`<div class="error-box" role="alert">${esc(state.runError)}</div>`:'')+({shop:shopView,catalog:catalogView,memory:memoryView,architecture:architectureView}[state.view])();
  bind();
}
function navigate(view) {state.view=view;render();window.scrollTo({top:0,behavior:'instant'});}

async function refreshMemories(){ const r=await api(`/api/memories?user_id=${USER}`);state.memories=r.records; }

async function runJob(job,mode) {
  while(true) {
    const data=await api(`/api/jobs/${job.job_id}?user_id=${USER}`);
    if(data.result) {
      const prior=state[mode==='remember'?'memoryRun':'run'];
      if(data.result.pending && !prior?.pending)state.selectedNode=data.result.next?.[0]||'intake';
      if(!data.result.pending && prior?.pending)state.selectedNode=data.result.audit_log?.at(-1)?.node||'intake';
      state[mode==='remember'?'memoryRun':'run']=data.result;
      state.lastRun=data.result;
    }
    if(data.state==='error') throw new Error(data.error);
    if(data.state==='complete') break;
    render();
    await new Promise(resolve=>setTimeout(resolve,650));
  }
  await refreshMemories();
}

async function startRun(request,mode='shop') {
  if(state.busy)return toast('Wait for the current step to finish.');
  if(!request.trim())return toast('Add a request first.');
  state.runError='';
  state.lastRun=null;
  state.selectedNode='intake';
  state.busy=true;
  state[mode==='remember'?'memoryRun':'run']=null;
  if(mode==='shop')state.prompt='';
  render();
  try {
    const job=await api('/api/runs',{user_id:USER,request,mode,engine:state.engine,use_memory:state.useMemory});
    await runJob(job,mode);
  }catch(error){state.runError=error.message;toast(error.message);if(!state.meta.connected&&state.engine==='gemini')openSettings();}
  finally{state.busy=false;render();if(mode==='remember'&&state.view==='memory'&&state.memoryRun?.pending)document.querySelector('.memory-proposal')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
}

async function resumeRun(value,mode='shop') {
  const run=state[mode==='remember'?'memoryRun':'run'];
  if(state.busy||!run)return;
  state.busy=true;render();
  try {await runJob(await api(`/api/runs/${run.thread_id}/resume`,{user_id:USER,value}),mode);}
  catch(error){toast(error.message);}
  finally{state.busy=false;render();}
}

function inspect(run) {
  if(!run)return;
  openModal(`<div class="modal-header"><h2>Saved workflow state</h2><button class="icon-button" data-close aria-label="Close state">${icon('close')}</button></div><p class="modal-intro">Thread ${esc(run.thread_id)} · ${esc(run.engine_label)}<br>Next node: ${esc(run.next?.join(', ')||'END')} · Status: ${esc(run.status)}</p><pre class="code-block">${esc(JSON.stringify(run,null,2))}</pre>`);
}
function download(name,content,type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openModal(html) {$('#modal-content').innerHTML=html;const heading=$('#modal-content h2');if(heading){heading.id='modal-title';$('#modal').setAttribute('aria-labelledby','modal-title');}$('#modal-content').querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#modal').close()));if(!$('#modal').open)$('#modal').showModal();}

function openSettings() {
  openModal(`<div class="modal-header"><h2>Connect Gemini</h2><button class="icon-button" data-close aria-label="Close settings">${icon('close')}</button></div><p class="modal-intro">Use a live Gemini model for the full assistant. The key is held only in this Python server's memory and is never included in a run export.</p><form class="settings-form" id="settings-form"><div><label class="field-label" for="api-key">Google API key</label><input id="api-key" class="text-input" type="password" autocomplete="off" placeholder="Paste your API key" required></div><div><label class="field-label" for="model-name">Gemini model</label><input id="model-name" class="text-input" value="${esc(state.meta.model||'gemini-3.1-flash-lite')}" required></div><p>Connecting performs a small validation call. Alternatively, choose “Sample engine · no LLM” in the header to explore the same graph with limited local rules.</p><div id="settings-error" role="status"></div><button class="primary-button" type="submit">Test and connect ${icon('arrow')}</button></form>`);
  $('#settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#settings-form button[type=submit]');button.disabled=true;button.textContent='Testing connection…';
    try{const r=await api('/api/settings',{api_key:$('#api-key').value,model:$('#model-name').value});$('#api-key').value='';state.meta={...state.meta,...r};state.engine='gemini';$('#modal').close();render();toast('Gemini connected. The key stays in server memory.');}
    catch(error){$('#settings-error').textContent=error.message;}
    finally{button.disabled=false;button.textContent='Test and connect';}
  });
}

function productDetails(id) {
  const offers=state.offers.filter(o=>o.product_id===id);if(!offers.length)return;
  const p=offers[0];
  openModal(`<div class="modal-header"><h2>Compare retailer offers</h2><button class="icon-button" data-close aria-label="Close product details">${icon('close')}</button></div><div class="modal-product">${art(p)}<div><div class="product-brand">${esc(p.brand)} · ${esc(p.form_factor)}</div><h3>${esc(p.product_name)}</h3><p>${p.noise_cancelling?'Noise cancelling':'Standard audio'} · ${p.battery_hours}h battery · ${esc(p.color)}</p><span class="pill purple">Fictional product · Sample prices</span></div></div><div class="table-wrap"><table class="offer-table"><thead><tr><th>Retailer</th><th>Condition</th><th>Item</th><th>Shipping</th><th>Total</th><th>Stock</th></tr></thead><tbody>${offers.map(o=>`<tr><td>${esc(o.retailer)}</td><td>${esc(o.condition)}</td><td>${money(o.price)}</td><td>${o.shipping_cost==='0.00'?'Free':money(o.shipping_cost)}</td><td><strong>${money(o.total_price)}</strong></td><td><span class="pill ${o.in_stock?'green':'gray'}">${o.in_stock?'In stock':'Unavailable'}</span></td></tr>`).join('')}</tbody></table></div><p class="offer-footnote">Exact model ${esc(p.product_id)}. Totals exclude tax. Unknown shipping is not counted as free.</p><button class="primary-button" id="ask-product">Ask Scout about this product ${icon('arrow')}</button>`);
  $('#ask-product').addEventListener('click',()=>{$('#modal').close();state.prompt=`Compare ${p.product_name} offers under $${p.product_name==='Aura Pro'?'200':'150'}. Find the best delivered price.`;state.run=null;navigate('shop');$('#prompt').focus();});
}

function bind() {
  $('#content').querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  $('#content').querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>productDetails(b.dataset.product)));
  $('#content').querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{state.prompt=b.dataset.prompt;$('#prompt').value=state.prompt;$('#prompt').focus();}));
  $('#content').querySelectorAll('[data-settings]').forEach(b=>b.addEventListener('click',openSettings));
  $('#shop-form')?.addEventListener('submit',e=>{e.preventDefault();startRun($('#prompt').value);});
  $('#prompt')?.addEventListener('input',e=>state.prompt=e.target.value);
  $('#prompt')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#shop-form').requestSubmit();}});
  $('#use-memory')?.addEventListener('change',e=>state.useMemory=e.target.checked);
  $('#new-search')?.addEventListener('click',()=>{if(state.busy)return toast('Wait for the current step to finish.');state.run=null;state.prompt='';render();$('#prompt').focus();});
  $('#clarify-form')?.addEventListener('submit',e=>{e.preventDefault();resumeRun({text:$('#clarification').value});});
  $('#content').querySelectorAll('[data-resume]').forEach(b=>b.addEventListener('click',()=>resumeRun(b.dataset.resume==='true')));
  $('#content').querySelectorAll('[data-memory-resume]').forEach(b=>b.addEventListener('click',()=>resumeRun(b.dataset.memoryResume==='true','remember')));
  $('[data-inspect]')?.addEventListener('click',()=>inspect(state.run));
  $('[data-inspect-memory]')?.addEventListener('click',()=>inspect(state.memoryRun));
  $('[data-inspect-last]')?.addEventListener('click',()=>inspect(state.lastRun));
  $('[data-export]')?.addEventListener('click',()=>download(`scout-run-${state.run.thread_id.slice(0,8)}.json`,JSON.stringify(state.run,null,2)));
  $('#memory-form')?.addEventListener('submit',e=>{e.preventDefault();state.memoryDraft=$('#memory-statement').value;startRun(state.memoryDraft,'remember');});
  $('#memory-statement')?.addEventListener('input',e=>state.memoryDraft=e.target.value);
  $('#content').querySelectorAll('[data-memory-example]').forEach(b=>b.addEventListener('click',()=>{state.memoryDraft=b.dataset.memoryExample;$('#memory-statement').value=state.memoryDraft;$('#memory-statement').focus();}));
  $('#history-toggle')?.addEventListener('change',e=>{state.showHistory=e.target.checked;render();});
  $('#catalog-search')?.addEventListener('input',e=>{state.search=e.target.value;$('#catalog-grid').innerHTML=catalogGrid();$('#catalog-grid').querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>productDetails(b.dataset.product)));});
  $('#condition-filter')?.addEventListener('change',e=>{state.condition=e.target.value;render();});
  $('#stock-filter')?.addEventListener('change',e=>{state.stock=e.target.value;render();});
  $('#graph-zoom')?.addEventListener('click',()=>{state.graphZoom=state.graphZoom==='detail'?'fit':'detail';render();});
  $('#download-graph')?.addEventListener('click',()=>download('scout-langgraph.mmd',state.graph.mermaid,'text/plain'));
  $('#content').querySelectorAll('[data-node]').forEach(node=>{const choose=()=>{state.selectedNode=node.dataset.node;render();};node.addEventListener('click',choose);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});});
}

document.querySelectorAll('.site-header [data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$('#profile-button').addEventListener('click',()=>toast(`Simulated workspace: ${USER}`));
$('#footer-architecture').addEventListener('click',()=>navigate('architecture'));
$('#top-settings').addEventListener('click',openSettings);
$('#engine-select').addEventListener('change',e=>{if(state.busy){e.target.value=state.engine;return toast('Wait for this run to finish before changing engines.');}state.engine=e.target.value;render();toast(state.engine==='sample'?'Sample engine selected: local rules, no LLM calls.':'Gemini selected: live model calls.');});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});

async function initialize() {
  try{
    const [meta,catalog,graph]=await Promise.all([api('/api/meta'),api('/api/catalog'),api('/api/architecture')]);
    state.meta=meta;state.offers=catalog.offers;state.graph=graph;await refreshMemories();render();
  }catch(error){$('#content').innerHTML=`<div class="error-box">${esc(error.message)} Refresh the page after starting the Python server.</div>`;}
}
initialize();
