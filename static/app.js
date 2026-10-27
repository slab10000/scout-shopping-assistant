'use strict';

const $ = (s, root = document) => root.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money = v => v == null ? 'Unknown' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));
const label = v => String(v || '').replaceAll('_',' ');
const state = {view:'shop',engine:'gemini',meta:{},offers:[],memories:[],graph:null,run:null,memoryRun:null,lastRun:null,busy:false,prompt:'',memoryDraft:'',useMemory:true,search:'',condition:'all',stock:'all',showHistory:false,selectedNode:'understand'};
const USER = 'shopper-001';
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

function art(product, hero = false) {
  const color = product.color || 'graphite';
  const palette = {graphite:['#4c4d59','#272936','#757782'],ivory:['#e5e0d2','#c4bdad','#faf8ed'],sage:['#a5b8a0','#6f876c','#d2dfcb'],blue:['#7e90b2','#485d86','#b8c4dc'],sand:['#c4ab89','#937c5c','#e6d8be']}[color];
  const [mid,dark,light] = palette;
  const uid = `p${++art.seq}`;
  if (product.form_factor === 'in-ear') return `<svg class="product-art" viewBox="0 0 230 220" role="img" aria-label="Illustration of ${esc(product.product_name)} earbuds"><defs><linearGradient id="${uid}" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><ellipse cx="117" cy="185" rx="62" ry="8" fill="${dark}" opacity=".1"/><rect x="53" y="95" width="127" height="78" rx="33" fill="${dark}"/><rect x="53" y="88" width="127" height="68" rx="30" fill="url(#${uid})"/><path d="M57 117h119" stroke="${dark}" opacity=".2" stroke-width="2"/><circle cx="115" cy="145" r="2" fill="${light}"/><g transform="rotate(-18 77 64)"><rect x="64" y="43" width="15" height="51" rx="7" fill="${mid}"/><ellipse cx="79" cy="46" rx="19" ry="14" fill="url(#${uid})"/><ellipse cx="87" cy="44" rx="7" ry="8" fill="${dark}"/></g><g transform="rotate(21 157 57)"><rect x="153" y="42" width="15" height="51" rx="7" fill="${mid}"/><ellipse cx="152" cy="45" rx="19" ry="14" fill="url(#${uid})"/><ellipse cx="144" cy="43" rx="7" ry="8" fill="${dark}"/></g></svg>`;
  return `<svg class="product-art" viewBox="0 0 230 240" role="img" aria-label="Illustration of ${esc(product.product_name || 'wireless headphones')}"><defs><linearGradient id="${uid}a" x1="0" x2="1" y2=".5"><stop stop-color="${light}"/><stop offset=".43" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="${uid}b" x1="0" x2="1"><stop stop-color="${dark}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs><ellipse cx="116" cy="215" rx="68" ry="8" fill="${dark}" opacity=".08"/><path d="M48 137V95c0-90 134-90 134 0v42" fill="none" stroke="${dark}" stroke-width="17"/><path d="M48 128V95c0-88 134-88 134 0v33" fill="none" stroke="url(#${uid}a)" stroke-width="13"/><path d="M56 94c0-77 118-77 118 0" fill="none" stroke="${light}" stroke-width="3" opacity=".3"/><path d="M49 119v35m133-35v35" stroke="${light}" stroke-width="7"/><g transform="rotate(-12 59 160)"><rect x="33" y="120" width="42" height="83" rx="19" fill="${dark}"/><rect x="37" y="119" width="39" height="81" rx="18" fill="url(#${uid}a)"/><rect x="65" y="127" width="15" height="66" rx="7" fill="${dark}"/><path d="M44 135v44" stroke="${light}" stroke-width="2" opacity=".25"/></g><g transform="rotate(12 172 160)"><rect x="156" y="120" width="42" height="83" rx="19" fill="${dark}"/><rect x="153" y="119" width="39" height="81" rx="18" fill="url(#${uid}b)"/><rect x="148" y="127" width="15" height="66" rx="7" fill="${dark}"/><path d="M184 134v43" stroke="${light}" stroke-width="2" opacity=".3"/></g><circle cx="181" cy="182" r="2" fill="${light}" opacity=".4"/></svg>`;
}
art.seq = 0;

function groupedCatalog() {
  const products = new Map();
  for (const o of state.offers) {
    if (state.condition !== 'all' && o.condition !== state.condition) continue;
    if (state.stock === 'available' && !o.in_stock) continue;
    if (state.search && !`${o.product_name} ${o.retailer} ${o.model}`.toLowerCase().includes(state.search.toLowerCase())) continue;
    if (!products.has(o.product_id)) products.set(o.product_id,[]);
    products.get(o.product_id).push(o);
  }
  return [...products.values()].map(offers=>{
    const sorted = [...offers].sort((a,b)=>Number(a.total_price ?? Infinity)-Number(b.total_price ?? Infinity));
    const best = sorted.find(o=>o.in_stock) || sorted[0];
    return {...best, offer_count:offers.length, group:true};
  });
}

function productCard(o, {recommended=false,group=false}={}) {
  return `<article class="product-card ${recommended?'recommended':''}"><div class="product-image ${esc(o.color)}">${recommended?`<span class="pill purple">${icon('spark')}Scout's pick</span>`:group?`<span class="pill">${o.offer_count} sample offers</span>`:`<span class="pill">${esc(o.condition)}</span>`}${art(o)}</div><div class="product-info"><div class="product-brand">${esc(o.brand)} · ${esc(o.form_factor)}</div><h3>${esc(o.product_name)}</h3><div class="product-features">${o.noise_cancelling?'Noise cancelling':'Standard audio'} · ${o.battery_hours}h battery</div><div class="product-price"><strong>${money(o.total_price)}</strong><span>${group?'from, delivered':'incl. shipping'}</span></div><button class="offer-detail" data-product="${esc(o.product_id)}">${group?'Explore offers':esc(o.retailer)} ${icon('chevron')}</button></div></article>`;
}

const shoppingSteps = [
  ['understand','Understand your request','Extract structured requirements'],
  ['retrieve_memory','Recall your preferences','Relevant, approved memories only'],
  ['plan_search','Make a search plan','A bounded plan for this request'],
  ['search_catalog','Search the catalog','Read matching offers from CSV'],
  ['compare_offers','Compare the options','Features, condition, and total cost'],
  ['recommend','Explain the best fit','A recommendation grounded in data'],
  ['approve_purchase','You make the call','Approval before a simulated action']
];
function inspector(run=state.run) {
  const done = new Set((run?.audit_log||[]).map(e=>e.node));
  const pending = new Set(run?.next || []);
  return `<aside class="run-aside"><div class="inspector"><div class="inspector-title"><h2>Behind the recommendation</h2>${icon('flow')}</div><p class="inspector-description">A small workflow. A clear reason for every step.</p><div class="workflow-steps">${shoppingSteps.map(([key,title,desc],i)=>`<div class="workflow-step ${done.has(key)?'done':pending.has(key)?'waiting':''}"><span class="step-number">${done.has(key)?icon('check'):i+1}</span><div class="step-copy"><strong>${title}</strong><span>${desc}</span></div></div>`).join('')}</div><div class="inspector-bottom"><div class="inspector-stat"><span>Information source</span><strong>headphones.csv</strong></div><div class="inspector-stat"><span>Memory</span><strong>${run?`${run.selected_memories?.length||0} retrieved`:'Approved preferences'}</strong></div><div class="inspector-stat"><span>Engine</span><strong>${run?esc(run.engine_label):state.engine==='gemini'?'Gemini':'Sample rules · no LLM'}</strong></div>${run?`<button class="secondary-button inspector-state" data-inspect>Inspect saved state ${icon('chevron')}</button>`:''}<button class="text-button" data-view="architecture">Explore the architecture ${icon('arrow')}</button></div></div><div class="tips-card">${icon('shield','tips-icon')}<h3>You're always in control</h3><p>Scout asks before saving a preference or confirming a simulated purchase.</p><button class="text-button" data-view="memory">Manage your memory ${icon('arrow')}</button></div></aside>`;
}

function composer() {
  return `<form id="shop-form" class="composer-card"><div class="composer-top">${icon('spark')}ASK SCOUT</div><label class="screen-reader" for="prompt">Your shopping request</label><textarea id="prompt" maxlength="2000" placeholder="I'd like wireless headphones under $150 for studying…" ${state.busy?'disabled':''}>${esc(state.prompt)}</textarea><div class="composer-bottom"><label class="memory-toggle"><input type="checkbox" id="use-memory" ${state.useMemory?'checked':''}>${icon('memory')}Use my preferences</label><button class="send-button" type="submit" aria-label="Find headphones" ${state.busy?'disabled':''}>${icon('up')}</button></div></form><div class="prompt-chips">${[['For focused studying','Find new over-ear headphones under $150 for studying with noise cancellation.'],['Best on a budget','Find the cheapest wireless headphones under $90.'],['Long battery life','Find over-ear headphones under $150. Prioritize battery life.']].map(([title,prompt])=>`<button class="prompt-chip" data-prompt="${esc(prompt)}">${title} ${icon('plus')}</button>`).join('')}</div>`;
}

function constraintsRow(run) {
  const c = run?.effective_constraints || {};
  return `<div class="constraints-row">${[
    c.budget && `Under ${money(c.budget)}`,c.form_factor,c.condition && `${c.condition==='any'?'New or refurbished':c.condition}`,c.noise_cancelling===true && 'Noise cancelling',c.min_battery_hours && `Battery ≥ ${c.min_battery_hours}h`,c.priority && `Priority: ${label(c.priority)}`
  ].filter(Boolean).map(v=>`<span class="pill">${esc(v)}</span>`).join('')}</div>`;
}

function runResult(run) {
  if (!run) return '';
  const comparison = run.comparison || {};
  let html = `<div class="run-meta"><span>${esc(run.engine_label)} · Thread ${esc(run.thread_id?.slice(0,8))} · Sample data</span><button class="subtle-link" data-export>${icon('download')}Export run</button></div><div class="request-bubble"><span class="avatar">BL</span><p>${esc(run.request)}</p></div>`;
  if (run.error) return html + `<div class="error-box"><p>${esc(run.error)}</p><button class="secondary-button" data-settings>Connection settings</button></div>`;
  if (state.busy && !run.pending && !run.recommendation) return html + `<div class="loading-card"><span class="spinner"></span><div><h3>Scout is working on it</h3><p>${esc(run.audit_log?.at(-1)?.detail || 'Interpreting your request…')}</p></div></div>`;
  if (run.recommendation) {
    const r = run.recommendation;
    html += `<div class="answer-intro"><span class="assistant-avatar">${icon('spark')}</span><div><h2>A few good options. One clear fit.</h2><p>${esc(r.summary)}</p></div></div>${constraintsRow(run)}`;
    const mem = (run.selected_memories||[]).filter(r=>r.applied);
    if (mem.length) html += `<div class="memory-used">${icon('memory')}Personalized with ${mem.length} approved preference${mem.length>1?'s':''}: ${mem.map(m=>`${esc(label(m.key))}: ${esc(m.value)}`).join(' · ')}</div>`;
    html += `<details class="details-panel search-plan"><summary>The search plan · ${esc(run.plan?.query)}</summary><ol class="reason-list">${(run.plan?.steps||[]).map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="muted-small">Executed by search_catalog · Ranking: ${esc(label(run.plan?.sort_by))}</p></details><div class="product-grid">${(comparison.shortlist||[]).map(o=>productCard(o,{recommended:o.offer_id===r.offer_id})).join('')}</div><div class="offer-footnote">Totals include known shipping, before tax. All offers are fictional samples.</div><ul class="reason-list">${r.reasons.map(v=>`<li>${esc(v)}</li>`).join('')}${r.tradeoffs.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`;
  }
  if (run.pending?.kind === 'clarification') html += `<div class="approval-card"><h3>A little more detail</h3><p>${esc(run.pending.question)}</p><form id="clarify-form" class="inline-clarify"><input class="text-input" id="clarification" placeholder="My budget is $150 including shipping" aria-label="Budget clarification" required maxlength="1000"><button class="primary-button" ${state.busy?'disabled':''}>Continue ${icon('arrow')}</button></form></div>`;
  if (run.pending?.kind === 'purchase_approval') {
    const o = run.pending.offer;
    html += `<div class="approval-card"><div class="approval-header">${icon('shield')}<div><h3>Your choice, your approval</h3><p>Confirm ${esc(o.product_name)} from ${esc(o.retailer)} for ${money(o.total_price)} before tax?<br>This is a simulation. No real order, payment, or checkout.</p></div></div><div class="approval-actions"><button class="primary-button" data-resume="true" ${state.busy?'disabled':''}>${icon('check')}Confirm simulation</button><button class="secondary-button" data-resume="false" ${state.busy?'disabled':''}>Reject purchase</button></div></div>`;
  }
  if (run.status==='SIMULATED_CONFIRMED' || run.status==='CANCELLED') html += `<div class="outcome-card ${run.status==='CANCELLED'?'cancelled':''}">${icon(run.confirmed?'check':'close')}<span>${esc(run.response)}</span></div>`;
  if (['NO_MATCHES','UNSUPPORTED','NEEDS_INFORMATION'].includes(run.status)) html += `<div class="empty-state">${icon('search')}<h3>${run.status==='NO_MATCHES'?'No suitable offer this time':'Let’s adjust the request'}</h3><p>${esc(run.response)}</p></div>`;
  if (comparison.excluded?.length || comparison.uncertain?.length) html += `<details class="details-panel"><summary>Why other offers were not shortlisted · ${(comparison.excluded?.length||0)+(comparison.uncertain?.length||0)} offers</summary>${[...(comparison.excluded||[]),...(comparison.uncertain||[])].map(o=>`<div class="detail-row"><strong>${esc(o.product_name)} · ${esc(o.retailer)} · ${esc(o.offer_id)}</strong><span>${esc(o.reasons.join('; '))}</span></div>`).join('')}</details>`;
  return html;
}

function shopView() {
  return `<div class="page-heading"><div><div class="page-eyebrow">A LITTLE HELP FINDING THE RIGHT THING</div><h1>Your next good find.</h1><p>Tell Scout what matters. We'll take it from there.</p></div>${state.run?`<button class="secondary-button heading-action" id="new-search">${icon('plus')}New thread</button>`:''}</div><div class="workbench"><section class="shop-main">${!state.run&&!state.busy?`<div class="hero"><span class="hero-orbit"></span><span class="hero-orbit second"></span><div class="page-eyebrow">LESS SCROLLING. MORE LISTENING.</div><h2>Find headphones<br>that <em>fit your life.</em></h2><p>A thoughtful comparison of features, prices, and the things you care about.</p><span class="pill">${icon('headphones')}6 products · 3 sample retailers · Your preferences</span><div class="hero-product">${art({color:'graphite',product_name:'sample wireless headphones'})}</div></div>`:''}${state.run?runResult(state.run):state.busy?`<div class="loading-card"><span class="spinner"></span><div><h3>Scout is thinking</h3><p>Starting the LangGraph workflow…</p></div></div>`:''}${composer()}${!state.run&&!state.busy?`<div class="section-heading"><h2>A few finds from the catalog</h2><button class="subtle-link" data-view="catalog">Explore all products ${icon('arrow')}</button></div><div class="product-grid">${groupedCatalog().slice(0,3).map(o=>productCard(o,{group:true})).join('')}</div><div class="feature-note">${icon('info')}A university prototype with sample products and a real, inspectable workflow.</div>`:''}</section>${inspector()}</div>`;
}

function catalogView() {
  return `<div class="page-heading"><div><div class="page-eyebrow">THE INFORMATION BEHIND EVERY FIND</div><h1>A small catalog. Real comparisons.</h1><p>Fictional headphones and retailer offers, loaded directly from headphones.csv.</p></div><span class="pill purple">${icon('box')}CSV information source</span></div><div class="stat-row">${[[state.meta.products,'Distinct headphone models','headphones'],[state.meta.catalog_offers,'Offers to compare','grid'],[state.meta.retailers,'Simulated retailers','box']].map(([v,title,i])=>`<div class="stat-card"><span class="stat-icon">${icon(i)}</span><div><strong>${v||0}</strong><span>${title}</span></div></div>`).join('')}</div><div class="toolbar"><label class="search-field">${icon('search')}<input id="catalog-search" placeholder="Search products or retailers…" aria-label="Search catalog" value="${esc(state.search)}"></label><div class="filters"><select id="condition-filter" aria-label="Product condition"><option value="all">All conditions</option><option value="new" ${state.condition==='new'?'selected':''}>New only</option><option value="refurbished" ${state.condition==='refurbished'?'selected':''}>Refurbished only</option></select><select id="stock-filter" aria-label="Stock availability"><option value="all">All availability</option><option value="available" ${state.stock==='available'?'selected':''}>In stock only</option></select></div></div><div class="catalog-grid" id="catalog-grid">${catalogGrid()}</div><div class="feature-note">${icon('info')}“From” includes known shipping on available offers. Open a product to compare condition and seller details. Tax is excluded.</div>`;
}
function catalogGrid() { const products=groupedCatalog(); return products.length?products.map(o=>productCard(o,{group:true})).join(''):'<div class="empty-results">No catalog products match those filters.</div>'; }

function memoryView() {
  const active = state.memories.filter(m=>m.status==='active');
  const visible = state.showHistory?state.memories:active;
  const run = state.memoryRun;
  return `<div class="page-heading"><div><div class="page-eyebrow">A LITTLE CONTEXT GOES A LONG WAY</div><h1>Preferences worth remembering.</h1><p>You choose what Scout keeps. A new conversation can pick up what matters.</p></div><span class="pill purple">${active.length} active ${active.length===1?'memory':'memories'}</span></div><div class="memory-layout"><section><div class="section-heading"><h2>Your approved preferences</h2><label class="history-toggle"><input id="history-toggle" type="checkbox" ${state.showHistory?'checked':''}>Show history</label></div>${visible.length?visible.map(m=>`<article class="memory-card ${m.status==='superseded'?'superseded':''}"><div class="badge-row"><span class="pill ${m.status==='active'?'green':'gray'}">${icon(m.status==='active'?'check':'clock')}${esc(m.status)}</span><span class="pill">${esc(m.memory_type)}</span><span class="pill purple">${esc(m.scope)}</span></div><p>${esc(m.text)}</p><small>Approved ${esc(new Date(m.approved_at).toLocaleString())}</small><div class="memory-meta"><span>Key: ${esc(m.key)} · Source: ${esc(m.source_thread.slice(0,8))}</span><span>${m.superseded_by?'Replaced by a newer approved preference':'Available across new threads'}</span></div></article>`).join(''):`<div class="empty-state">${icon('memory')}<h3>A fresh start</h3><p>Tell Scout a reusable shopping preference. Nothing is saved until you approve the exact proposal.</p></div>`}<div class="memory-warning">${icon('info')}Preferences are stored in InMemoryStore under your user namespace. They survive new threads in this session and clear when the Python server restarts.</div>${run?memoryResult(run):''}</section><aside><form class="memory-form-panel" id="memory-form"><h2>Teach Scout a preference</h2><p>A useful habit or preference can make your next search a little more personal.</p><label class="field-label" for="memory-statement">What should Scout know?</label><textarea id="memory-statement" maxlength="1000" placeholder="I generally prefer over-ear headphones." ${state.busy?'disabled':''}>${esc(state.memoryDraft)}</textarea><button class="primary-button" ${state.busy?'disabled':''}>${state.busy?'<span class="spinner"></span>':icon('plus')}Propose a memory</button><div class="memory-examples"><span class="mini-label">TRY AN EXAMPLE</span>${['I generally prefer over-ear headphones.','I generally buy new products only.','From now on, refurbished products are acceptable.','Refurbished is acceptable for this purchase.'].map(v=>`<button type="button" data-memory-example="${esc(v)}">${esc(v)}</button>`).join('')}</div></form><div class="tips-card">${icon('shield','tips-icon')}<h3>A preference is a proposal</h3><p>Temporary budgets and one-purchase exceptions stay in the current thread. Corrections require fresh approval and preserve earlier history.</p></div></aside></div>`;
}

function memoryResult(run) {
  if (run.error) return `<div class="error-box">${esc(run.error)}<button class="secondary-button" data-settings>Connection settings</button></div>`;
  if (!run.proposal) return state.busy?'<div class="loading-card"><span class="spinner"></span><p>Evaluating the candidate preference…</p></div>':'';
  const p=run.proposal;
  return `<div class="memory-proposal"><div class="badge-row"><span class="pill ${p.decision==='STORE'?'purple':'amber'}">${esc(p.decision)}</span><span class="muted-small">Thread ${esc(run.thread_id.slice(0,8))} · ${esc(run.engine_label)}</span></div><h3 class="state-summary">${p.text?esc(p.text):'No reusable preference proposed'}</h3><p>${esc(p.reason)}</p>${run.previous_memories?.length?`<p>Earlier active value: ${run.previous_memories.map(m=>esc(m.value)).join(', ')}. This proposal replaces it only after approval.</p>`:''}${run.pending?.kind==='memory_approval'?`<div class="approval-actions"><button class="primary-button" data-memory-resume="true" ${state.busy?'disabled':''}>${icon('check')}Approve memory</button><button class="secondary-button" data-memory-resume="false" ${state.busy?'disabled':''}>Reject memory</button></div>`:`<p>${esc(run.response||label(run.status))}</p>`}<button class="text-button" data-inspect-memory>Inspect memory workflow ${icon('arrow')}</button></div>`;
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
const positions = {
  __start__:[36,70],intake:[195,70],understand:[375,70],retrieve_memory:[555,70],plan_search:[735,70],search_catalog:[915,70],
  unsupported:[375,205],clarify:[555,205],insufficient:[735,205],compare_offers:[915,335],
  confirm_purchase:[195,335],approve_purchase:[375,335],recommend:[555,335],no_matches:[915,460],cancel_purchase:[375,460],
  form_memory:[195,610],approve_memory:[375,610],save_memory:[555,610],finish_memory:[735,610],__end__:[915,610]
};

function graphSvg() {
  if (!state.graph) return '';
  const run=state.lastRun;
  const events=run?.audit_log||[];
  const visited=new Set(events.map(e=>e.node));
  const pending=new Set(run?.next||[]);
  const sequence=['__start__',...events.map(e=>e.node),...(run?.next||[])];
  const doneEdges=new Set(sequence.slice(1).map((node,i)=>`${sequence[i]}:${node}`));
  if(run&&!run.pending&&!state.busy&&events.length)doneEdges.add(`${events.at(-1).node}:__end__`);
  const edges=state.graph.edges.map(edge=>{
    const a=positions[edge.source],b=positions[edge.target];if(!a||!b)return '';
    const [ax,ay]=a,[bx,by]=b;const w=148,h=57;
    let path;
    if(Math.abs(ay-by)<1){
      const forward=bx>ax;const x1=ax+(forward?w:0),x2=bx+(forward?0:w);
      path=Math.abs(bx-ax)>205?`M${x1},${ay+h/2} H${x1+(forward?13:-13)} V${ay-24} H${x2-(forward?13:-13)} V${by+h/2} H${x2}`:`M${x1},${ay+h/2} L${x2},${by+h/2}`;
    }else{
      const x1=ax+w/2,y1=ay+(by>ay?h:0),x2=bx+w/2,y2=by+(by>ay?0:h);
      if(edge.target==='__end__') {const lane=by-30-(ax%3)*7;path=`M${ax+w},${ay+h/2} H1090 V${lane} H${x2} V${y2}`;}
      else if(edge.source==='intake'&&edge.target==='form_memory'){path=`M${ax+w/2},${ay+h} V155 H175 V${by+h/2} H${bx}`;}
      else if(edge.source==='clarify'&&edge.target==='understand'){path=`M${ax},${ay+h/2} H${bx+w/2} V${by+h}`;}
      else path=`M${x1},${y1} V${(y1+y2)/2} H${x2} V${y2}`;
    }
    const done=doneEdges.has(`${edge.source}:${edge.target}`);
    return `<path class="graph-edge ${edge.conditional?'conditional':''} ${done?'visited':''}" d="${path}" marker-end="url(#arrow-${done?'visited':'default'})"/>`;
  }).join('');
  const nodes=state.graph.nodes.map(key=>{
    const pos=positions[key],info=nodeInfo[key];if(!pos||!info)return '';
    const [x,y]=pos;const isPending=pending.has(key),isVisited=visited.has(key)||key==='__start__'&&!!run||key==='__end__'&&!!run&&!run.pending&&!state.busy;
    return `<g class="graph-node ${isVisited?'visited':''} ${isPending?'pending':''} ${state.selectedNode===key?'selected':''}" data-node="${key}" tabindex="0" role="button" aria-label="${esc(info[1])}: ${isPending?'waiting':isVisited?'executed':'not executed'}"><rect x="${x}" y="${y}" width="148" height="57" rx="9"/><text class="node-number" x="${x+12}" y="${y+18}">${esc(info[0])} ${isPending?'· WAITING':isVisited?'· EXECUTED':''}</text><text class="node-title" x="${x+12}" y="${y+37}">${esc(info[1])}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 1125 705" xmlns="http://www.w3.org/2000/svg" aria-label="Actual LangGraph workflow with conditional routes and memory branch" role="group"><defs><marker id="arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="m0 0 10 5-10 5" fill="#dfd6ea"/></marker><marker id="arrow-visited" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="m0 0 10 5-10 5" fill="#a69cdd"/></marker></defs><text class="graph-caption" x="36" y="35">SHOPPING WORKFLOW</text><text class="graph-caption" x="36" y="575">MEMORY FORMATION · SAME AGENT, SEPARATE CONSENT</text>${edges}${nodes}</svg>`;
}

function architectureView() {
  const run=state.lastRun;
  const info=nodeInfo[state.selectedNode];
  return `<div class="page-heading"><div><div class="page-eyebrow">THE WORKFLOW, OPEN FOR INSPECTION</div><h1>Nothing behind the curtain.</h1><p>One stateful LangGraph agent. Explore a node to see what happens there.</p></div><button class="secondary-button heading-action" id="download-graph">${icon('download')}Mermaid</button></div><div class="architecture-intro"><div class="architecture-card"><h3>${icon('flow')}State follows the thread</h3><p>InMemorySaver checkpoints the request, plan, offers, and approval state under a thread_id. An interrupt resumes that same execution history.</p></div><div class="architecture-card"><h3>${icon('memory')}Memory follows the user</h3><p>InMemoryStore keeps approved preferences under a user namespace. A new thread retrieves selected records without inheriting the old run's state.</p></div></div><section class="graph-panel"><div class="graph-toolbar"><h2>Scout's LangGraph${run?` · ${esc(run.thread_id?.slice(0,8))}`:''}</h2><div class="graph-legend"><span><i class="legend-dot"></i>Not executed</span><span><i class="legend-dot visited"></i>Executed</span><span><i class="legend-dot pending"></i>Waiting for you</span></div></div><div class="graph-canvas" id="graph-canvas">${graphSvg()}</div><div class="node-detail"><span class="pill purple">${esc(state.selectedNode)}</span><div><h3>${esc(info[1])}</h3><p>${esc(info[2])}</p></div></div></section><p class="diagram-notice">Nodes and edges come from app.get_graph(). Dotted lines are conditional routes. ${run?'Highlights reflect the latest actual execution and saved next node.':'Run a shopping or memory request to see its actual path highlighted.'}</p><div class="architecture-bottom"><details class="details-panel"><summary>Exact Mermaid graph · generated by LangGraph</summary><pre class="code-block">${esc(state.graph?.mermaid||'Loading…')}</pre></details><details class="details-panel" ${run?'open':''}><summary>Latest execution trace${run?' · '+esc(run.engine_label):''}</summary>${run?(run.audit_log||[]).map(e=>`<div class="detail-row"><strong>${esc(e.node)}</strong><span>${esc(e.detail)}</span></div>`).join(''):'<p class="state-summary">Start a request to inspect the actual node events.</p>'}${run?'<button class="text-button" data-inspect-last>Inspect checkpoint state →</button>':''}</details></div>`;
}

function render() {
  $('#page-name').textContent=pages[state.view];
  document.querySelectorAll('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===state.view);el.setAttribute('aria-current',el.dataset.view===state.view?'page':'false');});
  $('#memory-count').textContent=state.memories.filter(r=>r.status==='active').length;
  $('#connection-dot').classList.toggle('connected',state.meta.connected&&state.engine==='gemini');
  $('#engine-select').value=state.engine;
  $('#content').innerHTML=({shop:shopView,catalog:catalogView,memory:memoryView,architecture:architectureView}[state.view])();
  bind();
}
function navigate(view) {state.view=view;render();window.scrollTo({top:0,behavior:'instant'});}

async function refreshMemories(){ const r=await api(`/api/memories?user_id=${USER}`);state.memories=r.records; }

async function runJob(job,mode) {
  while(true) {
    const data=await api(`/api/jobs/${job.job_id}?user_id=${USER}`);
    if(data.result) {
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
  state.busy=true;
  state[mode==='remember'?'memoryRun':'run']=null;
  if(mode==='shop')state.prompt='';
  render();
  try {
    const job=await api('/api/runs',{user_id:USER,request,mode,engine:state.engine,use_memory:state.useMemory});
    await runJob(job,mode);
  }catch(error){toast(error.message);if(!state.meta.connected&&state.engine==='gemini')openSettings();}
  finally{state.busy=false;render();}
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
function openModal(html) {$('#modal-content').innerHTML=html;$('#modal-content').querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#modal').close()));if(!$('#modal').open)$('#modal').showModal();}

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
  $('#download-graph')?.addEventListener('click',()=>download('scout-langgraph.mmd',state.graph.mermaid,'text/plain'));
  $('#content').querySelectorAll('[data-node]').forEach(node=>{const choose=()=>{state.selectedNode=node.dataset.node;render();};node.addEventListener('click',choose);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});});
}

document.querySelectorAll('.sidebar [data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$('#settings-button').addEventListener('click',openSettings);
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
