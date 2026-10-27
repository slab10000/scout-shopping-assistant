'use strict';

const $ = (s, root = document) => root.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money = v => v == null ? 'Unknown' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));
const label = v => String(v || '').replaceAll('_',' ');
const state = {view:'shop',engine:'gemini',meta:{},offers:[],memories:[],graph:null,graphSource:null,run:null,memoryRun:null,lastRun:null,busy:false,prompt:'',memoryDraft:'',useMemory:true,search:'',condition:'all',stock:'all',showHistory:false,selectedNode:'understand'};
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

const productImages = {
  "AURA-ONE-BLK": "aura-one",
  "FORM-STUDIO-WHT": "form-studio",
  "ECHO-AIR-GRN": "echo-air",
  "PULSE-LITE-BLU": "pulse-lite",
  "AURA-PRO-BLK": "aura-pro",
  "FORM-OPEN-SND": "form-open",
  "AURA-ARC-BLK": "aura-arc",
  "AURA-TRAVEL-SND": "aura-travel",
  "AURA-COMPACT-BLU": "aura-compact",
  "AURA-MAX-WHT": "aura-max",
  "AURA-BEAM-GRN": "aura-beam",
  "FORM-FOCUS-BLK": "form-focus",
  "FORM-LOFT-WHT": "form-loft",
  "FORM-FOLD-SND": "form-fold",
  "FORM-CALM-GRN": "form-calm",
  "FORM-BUDS-WHT": "form-buds",
  "ECHO-MINI-GRN": "echo-mini",
  "ECHO-PLUS-BLK": "echo-plus",
  "ECHO-SPORT-BLU": "echo-sport",
  "ECHO-FLOW-SND": "echo-flow",
  "ECHO-NIGHT-BLK": "echo-night",
  "PULSE-GO-BLU": "pulse-go",
  "PULSE-MOVE-GRN": "pulse-move",
  "PULSE-FOCUS-BLK": "pulse-focus",
  "PULSE-CLOUD-WHT": "pulse-cloud",
  "PULSE-SPRINT-BLK": "pulse-sprint",
  "VALE-STUDIO-SND": "vale-studio",
  "VALE-AIR-WHT": "vale-air",
  "VALE-POCKET-GRN": "vale-pocket",
  "VALE-COMMUTE-BLK": "vale-commute",
  "VALE-DRIFT-BLU": "vale-drift",
  "ORBIT-CORE-BLK": "orbit-core",
  "ORBIT-MINI-WHT": "orbit-mini",
  "ORBIT-LONGPLAY-SND": "orbit-longplay",
  "ORBIT-FLEX-BLU": "orbit-flex",
  "ORBIT-QUIET-GRN": "orbit-quiet"
};
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
const shoppingSteps=[['understand','Understand','Turn your request into requirements'],['retrieve_memory','Recall','Bring in approved preferences'],['plan_search','Plan','Set a bounded search strategy'],['search_catalog','Search','Read the sample CSV offers'],['compare_offers','Compare','Compare the options in bullet points'],['recommend','Recommend','Choose one and explain why it wins'],['approve_purchase','Your call','Wait for your explicit approval']];
function inspector(run=state.run){
  const done=new Set((run?.audit_log||[]).map(e=>e.node));const pending=new Set(run?.pending?run.next:[]);
  return `<aside class="run-aside"><div class="inspector"><div class="inspector-title"><h2>The thinking trail</h2>${icon('flow')}</div><p class="inspector-description">A clear path to a thoughtful choice.</p><div class="workflow-steps">${shoppingSteps.map(([key,title,desc],i)=>`<div class="workflow-step ${pending.has(key)?'waiting':done.has(key)?'done':''}"><span class="step-number">${done.has(key)&&!pending.has(key)?icon('check'):String(i+1).padStart(2,'0')}</span><div class="step-copy"><strong>${title}</strong><span>${desc}</span></div>${pending.has(key)?'<span class="waiting-dot"></span>':''}</div>`).join('')}</div><div class="inspector-bottom"><div class="inspector-stat"><span>Source</span><strong>headphones.csv</strong></div><div class="inspector-stat"><span>Preferences applied</span><strong>${run?.selected_memories?.filter(m=>m.applied).length||0}</strong></div><div class="inspector-stat"><span>Engine</span><strong>${esc(run?.engine_label||(state.engine==='gemini'?'Gemini':'Sample rules · no LLM'))}</strong></div>${run?'<button class="secondary-button" data-inspect>Inspect saved state '+icon('arrow')+'</button>':''}<button class="text-button" data-view="architecture">See the full workflow ${icon('arrow')}</button></div></div><div class="tips-card">${icon('shield','tips-icon')}<h3>You’re in the loop.</h3><p>Every saved preference and simulated purchase needs your approval.</p></div></aside>`;
}
function soundwave(){return `<svg class="soundwave" viewBox="0 0 600 380" fill="none" aria-hidden="true">${Array.from({length:12},(_,i)=>`<path d="M -40 ${125+i*13} C 70 ${40+i*14},130 ${305-i*9},225 ${178+i*4} S 380 ${30+i*17},640 ${135+i*12}"/>`).join('')}</svg>`;}
function composer(home=false){
  return `<div class="composer-wrap ${home?'home-composer':''}"><form id="shop-form" class="composer-card"><div class="composer-top">${icon('spark')}A GOOD FIND STARTS WITH YOU</div><label class="screen-reader" for="prompt">Your shopping request</label><textarea id="prompt" maxlength="2000" placeholder="I’m looking for wireless headphones under $150 for studying…" ${state.busy?'disabled':''}>${esc(state.prompt)}</textarea><div class="composer-bottom"><label class="memory-toggle"><input type="checkbox" id="use-memory" ${state.useMemory?'checked':''}>${icon('memory')}Use my preferences</label><button class="primary-button" type="submit" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':'Find my headphones '+icon('arrow')}</button></div></form><div class="prompt-chips">${[['Focused studying','Find new over-ear headphones under $150 for studying with noise cancellation.'],['On a budget','Find the cheapest wireless headphones under $90.'],['Long battery life','Find over-ear headphones under $150. Prioritize battery life.']].map(([title,prompt])=>`<button class="prompt-chip" data-prompt="${esc(prompt)}">${title} ${icon('plus')}</button>`).join('')}</div></div>`;
}
function constraintsRow(run){const c=run?.effective_constraints||{};return `<div class="constraints-row">${[c.budget&&`Under ${money(c.budget)}`,c.form_factor,c.condition&&`${c.condition==='any'?'New or refurbished':c.condition}`,c.noise_cancelling===true&&'Noise cancelling',c.min_battery_hours&&`Battery ≥ ${c.min_battery_hours}h`,c.priority&&`Priority: ${label(c.priority)}`].filter(Boolean).map(v=>`<span class="pill">${esc(v)}</span>`).join('')}</div>`;}
function comparisonNotes(comparison){
  const analysis=comparison.analysis;
  if(!analysis)return '';
  const offers=new Map((comparison.shortlist||[]).map(o=>[o.offer_id,o]));
  return `<section class="model-comparison" aria-label="Product comparison"><div class="comparison-heading"><div><span class="mini-label">THE COMPARISON</span><h3>The options, side by side.</h3></div>${icon('grid')}</div><div class="comparison-entries">${analysis.offers.map(entry=>{const o=offers.get(entry.offer_id);if(!o)return '';return `<article class="comparison-item"><h4>${esc(o.product_name)}</h4><p class="comparison-offer">${esc(o.retailer)} · ${money(o.total_price)} delivered</p><ul class="comparison-bullets">${entry.bullets.map(point=>`<li>${esc(point)}</li>`).join('')}</ul></article>`;}).join('')}</div><ul class="comparison-takeaways">${analysis.takeaways.map(point=>`<li>${esc(point)}</li>`).join('')}</ul></section>`;
}
function runResult(run){
  if(!run)return '';
  const c=run.comparison||{};
  let html=`<div class="request-bubble"><span class="avatar">${USER==='shopper-001'?'BL':'S'}</span><p>${esc(run.request)}</p><span class="pill">Your request</span></div>${constraintsRow(run)}`;
  html+=comparisonNotes(c);
  if(run.error)return html+`<div class="error-box"><h3>This step couldn’t finish.</h3><p>${esc(run.error)}</p><button class="secondary-button" data-settings>Connection settings</button></div>`;
  if(state.busy&&!run.pending&&!run.recommendation)return html+`<div class="loading-card"><span class="spinner"></span><div><h3>Connecting the dots…</h3><p>${esc(run.audit_log?.at(-1)?.detail||'Interpreting your request…')}</p></div></div>`;
  if(run.recommendation){const r=run.recommendation;
    html+=`<div class="answer-intro"><span class="assistant-avatar">${icon('spark')}</span><p>${esc(r.summary)}</p></div>`;
    const mem=(run.selected_memories||[]).filter(m=>m.applied);
    if(mem.length)html+=`<div class="memory-used">${icon('memory')}Made a little more you: ${mem.map(m=>`${esc(label(m.key))}: ${esc(m.value)}`).join(' · ')}</div>`;
    html+=`<div class="results-grid" data-count="${(c.shortlist||[]).length}">${(c.shortlist||[]).map(o=>productCard(o,{recommended:o.offer_id===r.offer_id})).join('')}</div><p class="offer-footnote">Known shipping included · Before tax · Fictional sample offers</p><div class="recommendation-notes"><h3>Why Scout chose this one</h3>${r.explanation?`<p class="recommendation-explanation">${esc(r.explanation)}</p>`:''}<ul class="reason-list">${(r.reasons||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>${r.tradeoffs?.length?`<p class="tradeoff">${r.tradeoffs.map(esc).join(' ')}</p>`:''}</div>`;
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
 if(!state.run&&!state.busy)return `<section class="home-hero"><div class="hero-copy"><div class="page-eyebrow"><span class="tiny-star">✳</span> LESS SCROLLING. MORE LISTENING.</div><h1>Find your kind<br> of <em>sound.</em></h1><p class="hero-description">Tell us what matters. Scout brings the options,<br class="desktop-break"> the comparisons, and a little clarity.</p>${composer(true)}</div><div class="hero-visual"><img class="hero-photo" src="/static/images/hero-editorial.webp" width="1536" height="1024" alt="Black headphones above a softly lit sage stone pedestal">${soundwave()}<div class="hero-caption"><span></span> A thoughtful way to find your next favorite.</div></div></section><section class="starting-points"><div class="section-heading"><div><span class="mini-label">A LITTLE INSPIRATION</span><h2>A few good starting points.</h2></div><button class="text-button" data-view="catalog">Explore the catalog ${icon('arrow')}</button></div><div class="home-products">${groupedCatalog(false).slice(0,3).map(o=>productCard(o,{group:true})).join('')}</div><div class="home-trust"><span>${icon('grid')}${state.meta.products??groupedCatalog(false).length} products · ${state.meta.catalog_offers??state.offers.length} sample offers</span><span>${icon('memory')}Preferences with your permission</span><span>${icon('flow')}Every step, in the open</span></div></section>`;
 return `<div class="page-heading"><div><div class="page-eyebrow">LESS GUESSWORK. MORE GOOD CHOICES.</div><h1>A clearer <em>choice.</em></h1><p>All the details that matter, brought together.</p></div><button class="secondary-button" id="new-search" ${state.busy?'disabled':''}>${icon('plus')}New thread</button></div><div class="workbench"><section class="shop-main">${state.run?runResult(state.run):'<div class="loading-card"><span class="spinner"></span><div><h3>A little thinking goes a long way.</h3><p>Starting the LangGraph workflow…</p></div></div>'}${composer()}</section>${inspector()}</div>`;
}
function catalogView(){return `<div class="page-heading"><div><div class="page-eyebrow">FIND YOUR NEXT FAVORITE</div><h1>Meet the <em>contenders.</em></h1><p>A considered selection. Every offer, ready to compare.</p></div><div class="catalog-stats"><strong>${state.meta.products??groupedCatalog(false).length}<span>products</span></strong><strong>${state.meta.catalog_offers??state.offers.length}<span>sample offers</span></strong><strong>${state.meta.retailers||3}<span>retailers</span></strong></div></div><div class="toolbar"><label class="search-field">${icon('search')}<input id="catalog-search" placeholder="Find a product or retailer…" aria-label="Search catalog" value="${esc(state.search)}"></label><div class="filters"><select id="condition-filter" aria-label="Product condition"><option value="all">All conditions</option><option value="new" ${state.condition==='new'?'selected':''}>New only</option><option value="refurbished" ${state.condition==='refurbished'?'selected':''}>Refurbished only</option></select><select id="stock-filter" aria-label="Stock availability"><option value="all">All availability</option><option value="available" ${state.stock==='available'?'selected':''}>In stock only</option></select></div><span class="source-label">${icon('box')}headphones.csv</span></div><div class="catalog-grid" id="catalog-grid">${catalogGrid()}</div><div class="feature-note">${icon('info')}Sample products, illustrative images, and fictional prices. “From” includes known shipping on available offers, before tax.</div>`;}
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
  plan_search:['04','Plan the search','Gemini writes the search strategy. Python binds the exact validated filters, ranking, and result limit.'],
  search_catalog:['05','Search the CSV','The Python tool reads headphones.csv and executes model matching from the validated plan.'],
  compare_offers:['06','Compare offers','Python checks eligibility and delivered totals. Gemini receives your request, applied preferences, search results, and validated shortlist, then writes comparative bullet points and takeaways for every shortlisted offer.'],
  recommend:['07','Recommend','Gemini receives the comparison, your request, applied preferences, and offer facts. It chooses one eligible offer and writes a paragraph explaining why it wins over the alternatives. Python checks the selected ID before preparing an action.'],
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
function graphStatus(key){const r=state.lastRun;if(!r)return 'idle';if(r.error&&r.next?.includes(key))return 'error';if(r.pending&&r.next?.includes(key))return 'pending';if(state.busy&&!r.pending&&!r.error&&r.next?.includes(key))return 'running';if((r.audit_log||[]).some(e=>e.node===key)||key==='__start__')return 'visited';if(key==='__end__'&&!r.pending&&!r.error&&!state.busy&&!r.next?.length)return 'visited';return 'idle';}
function nativeGraphMatches(){return !!state.graphSource && state.graphSource.mermaid===state.graph?.mermaid;}
function graphSvg(){
 if(!nativeGraphMatches())return '<div class="empty-state"><h3>The diagram needs an update.</h3><p>Regenerate the native graph assets with <code>python tools/build_architecture.py --render</code>.</p></div>';
 const diagram=state.graphSource.diagram,[x,y,w,h]=diagram.view_box;
 const nodes=state.graph.nodes.map(key=>{const b=diagram.bounds[key];return `<g id="native-node-${esc(key)}" class="native-node ${state.selectedNode===key?'selected':''}" data-node="${esc(key)}" role="button" tabindex="0" aria-pressed="${state.selectedNode===key}" aria-label="${esc(key)} — view Python code"><title>${esc(key)} · Click to see its Python code</title><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius}"/></g>`;}).join('');
 return `<svg class="native-langgraph" viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Scout’s native LangGraph diagram, with all ${state.graph.nodes.length} clickable nodes"><image href="${esc(diagram.image)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true"/>${nodes}</svg>`;
}
function highlightPython(source){
 const pattern=/(?:[rbufRBUF]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|#[^\n]*|\b(?:def|class|return|if|elif|else|for|in|is|not|and|or|from|import|as|raise|with|try|except|finally|pass|lambda|yield)\b|\b(?:True|False|None)\b|\b\d+(?:\.\d+)?\b/g;
 let html='',end=0;
 for(const match of source.matchAll(pattern)){
  html+=esc(source.slice(end,match.index));const value=match[0];
  const kind=value.startsWith('#')?'comment':/^[rbufRBUF]*["']/.test(value)?'string':/^\d/.test(value)?'number':'keyword';
  html+=`<span class="py-${kind}">${esc(value)}</span>`;end=match.index+value.length;
 }
 return html+esc(source.slice(end));
}
function sourceCodeCard(record,copyId,heading='Node function'){
 return `<section class="python-source"><div class="source-heading"><span>${esc(heading)}</span><button class="subtle-link" data-copy-source="${esc(copyId)}">Copy code</button></div><div class="source-location">${esc(record.file)}:${record.line}${record.end_line!==record.line?'–'+record.end_line:''}</div><pre class="python-code" tabindex="0" aria-label="${esc(record.name)} Python source"><code>${highlightPython(record.code)}</code></pre></section>`;
}
function sourceRecord(id){
 const source=state.graphSource;if(!source)return null;
 if(id==='construction')return source.construction;
 if(id==='state-schema')return source.state_schema;
 const [node,type,index]=id.split(':');const detail=source.node_details[node];
 return type==='helper'?detail?.helpers?.[Number(index)]:type==='route'?detail?.routing?.[Number(index)]:detail;
}
async function copySource(id){
 const record=sourceRecord(id);if(!record)return;
 try{await navigator.clipboard.writeText(record.code);toast('Python code copied.');}
 catch{toast('Select the code in the panel to copy it.');}
}
function openGraphConstruction(){
 if(!state.graphSource)return;
 openModal(`<div class="modal-header"><div><span class="mini-label">THE SAME BUILDER USED BY THE AGENT</span><h2>Graph construction</h2></div><button class="icon-button" data-close aria-label="Close graph construction">${icon('close')}</button></div><p class="modal-intro">The actual node registry, edges, conditional branches, and compile call from <code>build_graph()</code>. Drawing this graph makes no LLM calls.</p>${sourceCodeCard(state.graphSource.construction,'construction','StateGraph builder')}<details class="source-support"><summary>ShoppingState · the shared state schema</summary>${sourceCodeCard(state.graphSource.state_schema,'state-schema','TypedDict state')}</details>`);
 $('#modal-content').querySelectorAll('[data-copy-source]').forEach(button=>button.addEventListener('click',()=>copySource(button.dataset.copySource)));
}
function selectGraphNode(key){
 if(!state.graph?.nodes.includes(key))return;
 state.selectedNode=key;render();
 document.getElementById(`native-node-${key}`)?.focus({preventScroll:true});
 if(matchMedia('(max-width: 900px)').matches)$('#node-inspector')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
}
function architectureView(){
 const run=state.lastRun,key=state.selectedNode,info=nodeInfo[key]||[key,key,''],status=graphStatus(key);
 const detail=state.graphSource?.node_details?.[key];
 const event=run?.audit_log?.findLast(e=>e.node===key);
 const routes=(state.graph?.edges||[]).filter(e=>e.source===key);
 const code=detail?`${detail.kind==='builtin'?'<div class="builtin-note">LangGraph provides this marker. The code below shows its actual graph wiring; it has no custom node function.</div>':''}${sourceCodeCard(detail,`${key}:node`,detail.kind==='builtin'?'Graph wiring':'Actual node function')}${detail.reads.length||detail.writes.length?`<div class="node-state-fields">${[['Reads state directly',detail.reads],['Returns state fields',detail.writes]].map(([label,fields])=>`<div><span>${label}</span><div>${fields.length?fields.map(field=>`<code>${esc(field)}</code>`).join(''):'<span>None</span>'}</div></div>`).join('')}</div>`:''}${detail.routing?.map((r,i)=>`<details class="source-support"><summary>${esc(r.name)}</summary>${sourceCodeCard(r,`${key}:route:${i}`,'Actual graph edge')}</details>`).join('')||''}${detail.helpers.length?`<div class="support-heading">Supporting code <span>${detail.helpers.length}</span></div>${detail.helpers.map((r,i)=>`<details class="source-support"><summary>${esc(r.name)}</summary>${sourceCodeCard(r,`${key}:helper:${i}`,'Called by this node')}</details>`).join('')}`:''}`:'<p class="node-hint">Node source is unavailable. Regenerate the architecture assets.</p>';
 return `<div class="page-heading"><div><div class="page-eyebrow">BUILT TO BE UNDERSTOOD</div><h1>Every step, in the <em>open.</em></h1><p>The original LangGraph diagram. Click any node to read its Python code.</p></div><div class="architecture-actions"><button class="secondary-button" data-graph-source>${icon('flow')}Graph construction</button><button class="secondary-button" id="download-graph">${icon('download')}Export Mermaid</button></div></div><div class="architecture-layout native-architecture"><section class="graph-panel native-panel" aria-label="Native LangGraph diagram"><div class="graph-toolbar"><div><h2>Scout’s LangGraph</h2><span>${state.graph?.nodes.length||20} nodes · Native LangGraph rendering${run?' · '+esc(run.thread_id.slice(0,8)):''}</span></div><span class="native-diagram-badge">${icon('info')}Click a node to explore</span></div><div class="graph-canvas native-graph-canvas" data-zoom="${state.graphZoom||'fit'}">${graphSvg()}</div><div class="graph-bottom"><span>Original image · Native node positions · Actual Python source</span><button class="subtle-link" id="graph-zoom">${icon('search')}${state.graphZoom==='detail'?'Fit diagram':'Enlarge diagram'}</button></div></section><aside class="node-inspector native-inspector" id="node-inspector" aria-label="Selected node code and explanation"><div class="inspector-eyebrow">${icon('flow')}NODE EXPLORER<button class="subtle-link node-back" data-graph-back>Back to graph ↑</button></div><div class="node-explanation" aria-live="polite"><code class="node-id">${esc(key)}</code><div class="node-title-row"><h2>${esc(info[1])}</h2><span class="pill ${status==='pending'?'amber':status==='visited'?'green':''}">${status==='idle'?'Not executed':status==='visited'?'Executed':status==='pending'?'Waiting for you':label(status)}</span></div><p>${esc(info[2])}</p></div>${code}<div class="node-routes"><span class="mini-label">NEXT POSSIBLE STEPS</span>${routes.length?routes.map(e=>`<button data-node="${esc(e.target)}">${esc(e.target)} <span>${esc(e.label||'next')} ${icon('arrow')}</span></button>`).join(''):'<p>This branch has ended.</p>'}</div>${event?`<div class="node-event"><span class="mini-label">LATEST ACTUAL EVENT</span><p>${esc(event.detail)}</p></div>`:''}${run?'<button class="secondary-button" data-inspect-last>Inspect saved state '+icon('arrow')+'</button>':''}</aside></div><div class="architecture-principles"><article><span class="principle-icon">${icon('chat')}</span><div><h3>State follows the thread.</h3><p>InMemorySaver checkpoints the request, plan, offers, and approval. An interrupt resumes that same execution.</p></div><span class="pill">thread_id</span></article><article><span class="principle-icon">${icon('memory')}</span><div><h3>Memory follows you.</h3><p>InMemoryStore retrieves approved preferences across new threads. Both stores clear on server restart.</p></div><span class="pill">user_id</span></article></div><div class="architecture-bottom"><details class="details-panel"><summary>Exact graph from LangGraph <span>Mermaid source</span></summary><pre class="code-block">${esc(state.graph?.mermaid||'Loading…')}</pre></details><details class="details-panel"><summary>Latest execution trace <span>${run?esc(run.status):'No run yet'}</span></summary>${run?(run.audit_log||[]).map(e=>`<div class="detail-row"><strong>${esc(e.node)}</strong><span>${esc(e.detail)}</span></div>`).join(''):'<p>Start a request to inspect its node events.</p>'}</details></div><p class="diagram-notice">The diagram is the original image generated by app.get_graph().draw_mermaid_png(). Source snippets are extracted from shopping_assistant.py.</p>`;
}

function render() {
  const previousCanvas=$('.native-graph-canvas');
  const diagramScroll=previousCanvas?{left:previousCanvas.scrollLeft,top:previousCanvas.scrollTop}:null;
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
  if(diagramScroll){const canvas=$('.native-graph-canvas');if(canvas){canvas.scrollLeft=diagramScroll.left;canvas.scrollTop=diagramScroll.top;}}
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
  const knownTotals=offers.filter(o=>o.in_stock&&o.total_price!=null).map(o=>Number(o.total_price));
  const suggestedBudget=knownTotals.length?Math.ceil(Math.max(...knownTotals)/50)*50:150;
  openModal(`<div class="modal-header"><h2>Compare retailer offers</h2><button class="icon-button" data-close aria-label="Close product details">${icon('close')}</button></div><div class="modal-product">${art(p)}<div><div class="product-brand">${esc(p.brand)} · ${esc(p.form_factor)}</div><h3>${esc(p.product_name)}</h3><p>${p.noise_cancelling?'Noise cancelling':'Standard audio'} · ${p.battery_hours}h battery · ${esc(p.color)}</p><span class="pill purple">Fictional product · Sample prices</span></div></div><div class="table-wrap"><table class="offer-table"><thead><tr><th>Retailer</th><th>Condition</th><th>Item</th><th>Shipping</th><th>Total</th><th>Stock</th></tr></thead><tbody>${offers.map(o=>`<tr><td>${esc(o.retailer)}</td><td>${esc(o.condition)}</td><td>${money(o.price)}</td><td>${o.shipping_cost==='0.00'?'Free':money(o.shipping_cost)}</td><td><strong>${money(o.total_price)}</strong></td><td><span class="pill ${o.in_stock?'green':'gray'}">${o.in_stock?'In stock':'Unavailable'}</span></td></tr>`).join('')}</tbody></table></div><p class="offer-footnote">Exact model ${esc(p.product_id)}. Totals exclude tax. Unknown shipping is not counted as free.</p><button class="primary-button" id="ask-product">Ask Scout about this product ${icon('arrow')}</button>`);
  $('#ask-product').addEventListener('click',()=>{$('#modal').close();state.prompt=`Compare ${p.product_name} offers under $${suggestedBudget}. Find the best delivered price.`;state.run=null;navigate('shop');$('#prompt').focus();});
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
  $('#content').querySelectorAll('[data-copy-source]').forEach(button=>button.addEventListener('click',()=>copySource(button.dataset.copySource)));
  $('[data-graph-source]')?.addEventListener('click',openGraphConstruction);
  $('[data-graph-back]')?.addEventListener('click',()=>document.getElementById(`native-node-${state.selectedNode}`)?.scrollIntoView({block:'center',inline:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));
  $('#graph-zoom')?.addEventListener('click',()=>{state.graphZoom=state.graphZoom==='detail'?'fit':'detail';render();});
  $('#download-graph')?.addEventListener('click',()=>download('scout-langgraph.mmd',state.graph.mermaid,'text/plain'));
  $('#content').querySelectorAll('[data-node]').forEach(node=>{const choose=()=>selectGraphNode(node.dataset.node);node.addEventListener('click',choose);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});});
}

document.querySelectorAll('.site-header [data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$('#profile-button').addEventListener('click',()=>toast(`Simulated workspace: ${USER}`));
$('#footer-architecture').addEventListener('click',()=>navigate('architecture'));
$('#top-settings').addEventListener('click',openSettings);
$('#engine-select').addEventListener('change',e=>{if(state.busy){e.target.value=state.engine;return toast('Wait for this run to finish before changing engines.');}state.engine=e.target.value;render();toast(state.engine==='sample'?'Sample engine selected: local rules, no LLM calls.':'Gemini selected: live model calls.');});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});

async function initialize() {
  try{
    const [meta,catalog,graph,graphSource]=await Promise.all([api('/api/meta'),api('/api/catalog'),api('/api/architecture'),api('/static/architecture/scout-native.json').catch(()=>null)]);
    state.meta=meta;state.offers=catalog.offers;state.graph=graph;state.graphSource=graphSource;await refreshMemories();render();
  }catch(error){$('#content').innerHTML=`<div class="error-box">${esc(error.message)} Refresh the page after starting the Python server.</div>`;}
}
initialize();
