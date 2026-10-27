# Scout Shopping Assistant

Scout is a Project 1 prototype with one Gemini-powered LangGraph agent, a sample CSV information source, explicit state, human approval, and reusable user memory. Its local webapp has Shopping, Catalog, Memory, and Architecture tabs. The Architecture tab reads the actual graph and highlights the latest execution path.

All product names, retailer offers, prices, stock information, and purchase confirmations are fictional samples or simulations. Product lookup reads `headphones.csv`; there is no internet search or real checkout.

![Scout shopping assistant frontend](evidence/catalog-expansion/catalog-expansion-home.png)

## Get the project

```sh
git clone https://github.com/slab10000/scout-shopping-assistant.git
cd scout-shopping-assistant
```

## Start the webapp

Use Python 3.12, as in the labs. From the project folder:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python webapp.py
```

Open <http://127.0.0.1:8000>. On Windows, activate with `.venv\Scripts\activate`. On this Mac, `Start Scout.command` also starts the server and reuses an existing local environment.

Open the connection settings using the gear button, enter a Google API key, and choose an available Gemini model. The default is `gemini-3.1-flash-lite`; `--model` or `GEMINI_MODEL` can change it. Gemini 3.5 Flash was also tested but returned intermittent high-demand responses. The earlier labs' model may no longer be available for generation on a particular account.

Keys entered through Settings stay in server memory. They are never written to the catalog, source, checkpoint, run export, browser storage, or submission archive. The connection panel makes a small validation call before replacing the current configuration. For hidden terminal entry instead:

```sh
python webapp.py --prompt-key
```

An existing `GOOGLE_API_KEY` environment variable is also supported. Do not include its value in source or submission files. Server restart clears the connection unless that environment variable is present.

The header's **Sample engine · no LLM** option runs the same graph using deliberately limited local rules. Select it explicitly for practice without a key. Gemini errors never silently switch engines. The live engine may return quota, timeout, schema-validation, or model-availability errors; the frontend reports them without approving or completing an action.

## Shopping and approval

Try:

```text
Find new over-ear headphones under $150 with noise cancellation. Find the cheapest offer.
```

Scout validates extracted constraints, retrieves relevant preferences, writes a search strategy, binds the validated constraints into a structured plan, reads the CSV, compares known delivered totals, and prepares a recommendation. Open the search-plan panel to inspect the actual steps and the exclusions panel to see rejected or uncertain offers.

The graph pauses at `approve_purchase`. **Confirm simulation** resumes with `True`; **Reject purchase** resumes with `False`. Only the approved branch reaches the separate simulation node. There is no external order or payment. Missing budgets trigger a clarification interrupt before a tool search. No-match requests stop without increasing the budget.

Use **Inspect saved state** to inspect checkpoint values and the waiting node. **Export run** downloads the actual state and audit log. **New thread** creates another execution history; approved user memory remains available in the same running server. A new request does not implicitly continue a previous request or inherit its budget.

## Memory demonstration

In the Memory tab, propose these statements one at a time and approve each exact proposal:

```text
I generally prefer over-ear headphones.
I generally buy new products only.
```

Start a new shopping thread with:

```text
Find the cheapest wireless headphones under $150 with noise cancellation.
```

Both approved memories are retrieved and applied. With **Use my preferences** unchecked, the same request has different eligible offers. The browser uses the simulated identity `shopper-001`. For an isolated browser demonstration, open `http://127.0.0.1:8000/?user=demo-name`; this selects a separate memory namespace and is not authentication. The API and CLI also accept explicit simulated user IDs.

Propose and approve this correction:

```text
From now on, refurbished products are acceptable.
```

The new condition record supersedes the old one. **Show history** displays the old value, source thread, approval timestamp, and replacement link. The next shopping thread retrieves the active replacement. Rejecting the correction retains the old value. Repeating an identical approved preference does not duplicate the active record.

`STORE` means eligible for approval, not already written. `TEMPORARY` input, such as “Refurbished is acceptable for this purchase,” is not stored as a general preference. Sensitive, third-party, and unsupported candidates return `HUMAN_REVIEW`, which ends without a write and asks for a supported safe preference. This small prototype supports bounded fit, condition, noise-cancellation, battery, and ranking preferences rather than arbitrary autobiographical memory.

## Expanded catalog

The catalog contains 36 fictional models and 110 offers across the same three sample retailers. The latest expansion adds 30 independently illustrated models and 90 offers while preserving the original 20 rows. All three form factors, six brands, five colors, ANC and standard audio, varied battery life, new and refurbished conditions, stock exclusions, and unknown shipping are represented. The practice engine recognizes full model names and product IDs directly from the CSV. Gemini extracts the requested model from the request. Gemini writes search steps; Python binds the exact validated filters, ranking, and result limit, so planning cannot introduce extra requirements for unfamiliar models. The frontend counts and suggested product budgets are derived from current offers.

Earlier Gemini and frontend-v2 evidence is preserved as a record of the original catalog. `evidence/catalog-expansion/` captures verification of the current catalog, including a live Gemini request for Orbit Longplay and the updated sample scenarios. The exact prompts for all 30 new images are collected in `tools/catalog_image_prompts.json`.

## Frontend design

The responsive webapp implements the approved Scout concepts: warm ivory, deep green, orange actions, editorial serif headings, and horizontal navigation. Shopping includes a photographic hero, animated SVG soundwaves, a live reasoning trail, price comparisons, and explicit approval controls. Catalog has searchable offer cards and retailer comparison dialogs. Memory shows readable preferences, approval provenance, correction history, and the exact proposal before saving. Architecture renders every real graph node and edge as interactive SVG, with execution highlights, a node inspector, diagram enlargement, state inspection, and Mermaid export.

All 37 illustrative images were generated with the built-in image generation tool. Thirty-six transparent product cutouts and one editorial hero are served locally as WebP from `static/images/`; their prompts are recorded in `tools/image_assets.json` and `tools/image_batch_a.json`, `tools/image_batch_b.json`, and `tools/image_batch_c.json`. The 30 added product specifications are listed in `tools/catalog_expansion.json`. Product images illustrate fictional catalog entries and are not manufacturer photographs. The conceptual screen images are not embedded as application screens.

DM Sans and Instrument Serif are served from `static/fonts/`, with their SIL Open Font License texts included. There are no runtime font or image downloads, and no added JavaScript framework or backend dependency. Animations respect reduced-motion preferences. The mobile Architecture diagram scrolls within its own frame to keep node labels readable.

`evidence/frontend-v2/verification.json` records browser verification with the explicitly selected sample engine and an isolated user namespace. The redesign retains the existing Gemini connection, Python implementation, CSV information source, and approval boundaries. Browser-only view state still resets on refresh.

## Architecture and lab continuity

`shopping_assistant.py` uses `# %%` sections, `TypedDict`, small node functions, partial dictionary updates, `StateGraph`, and conditional edges. Gemini integration follows Lab 1; interrupts, strict boolean decisions, checkpoints, and thread IDs follow Lab 2; memory selection and corrections adapt Lab 3; Pydantic output schemas and `InMemoryStore` follow Week 5.

Shopping path:

```text
intake → understand → retrieve_memory → plan_search → search_catalog
       → compare_offers → recommend → approve_purchase
       → confirm_purchase OR cancel_purchase → END
```

Memory path:

```text
intake → form_memory → approve_memory → save_memory → END
                    ↘ temporary/review/rejected → finish_memory → END
```

`InMemorySaver` stores a thread's state and unfinished interrupts. `InMemoryStore` holds approved records under `("users", user_id, "shopping")`. A new thread can retrieve the same user's records without copying old state. Both clear on Python process or kernel restart; persistent storage is outside this milestone.

Memory ranking uses `0.65 * relevance + 0.25 * importance + 0.10 * recency`, where `recency = 1 / (1 + age_days / 30)`. Only active records with relevance at least 0.5 are eligible, with at most three selected. Explicit current constraints override remembered defaults. A general condition preference is scoped to shopping; fit and feature preferences are scoped to headphones.

Catalog comparison uses decimal arithmetic. Unknown shipping cannot win a delivered-cost comparison. Stock, condition, feature, and budget requirements are hard filters. Equivalent offers share exact model/variant and condition; the cheapest known delivered offer is selected before different models are ranked. Price, battery, and noise-cancellation priorities use deterministic ordering. Balanced ranking uses manual weights: 55% inverse cost, 25% battery hours normalized by 60, and 20% ANC presence. This is a transparent comparison policy, not a quality or review rating.

## Tests and captured scenarios

```sh
python project_tests.py
python run_demo.py
python run_demo.py --server http://127.0.0.1:8000 --engine gemini --output-dir evidence/gemini
```

The regression suite uses labeled sample rules and deliberately invalid-output stubs. It checks real LangGraph interrupts, consent, rejection, repeat-resume prevention, exact money totals, unknown shipping, constraints, namespace separation, corrections, history, temporary exceptions, duplicate records, and HTTP boundaries. It does not measure general LLM accuracy.

`run_demo.py` captures actual states for a normal request, two approved memories, later retrieval, rejected purchase, correction, temporary input, rejected memory, and no matching offers. Demo approval decisions are scripted mock-human responses passed through actual interrupts. Live starts are spaced to reduce model rate-limit pressure; each complete run still makes multiple model calls and may need account quota. Partial evidence is saved if a provider error interrupts a live run.

`evidence/sample` and `evidence/gemini` identify their engine in each captured state. `evidence/test_output.txt` contains regression results. Browser screenshots are labeled by their visible engine. The notebook demonstrates the same implementation and provides an explicit live-Gemini option.

The earlier captured submission includes 15 scenario states for each engine on the original six-model catalog. The expanded catalog passes 24 local checks; its updated sample scenarios are under `evidence/catalog-expansion/sample`. The live run used Gemini 3.1 Flash Lite. Provider high-demand and quota errors occurred during earlier attempts; the live harness continued from saved evidence in the same running server, retaining its original approved memory instead of replaying writes. `run_metadata.json` records that continuation. Use `--continue-evidence` only while that original server is still running; a server restart requires a fresh demo.

## Limitations and contributions

This is a local, single-process educational prototype. Run it on loopback. Simulated user IDs and server-side thread ownership checks demonstrate memory boundaries; they are not production authentication. Browser state is not restored after a page refresh, although the Python process retains its graph and memory. Up to 250 HTTP jobs are allowed per server session to bound demo accumulation.

Sample specifications are not independent product measurements. Gemini prose is constrained to supplied evidence but is not a general factual guarantee. The supported memory vocabulary and ranking policy are intentionally small. Price comparison excludes tax and live retailer verification. No shared memory, multi-agent coordination, database persistence, or real purchasing is implemented.

### Team 1 work split

The work is divided into three equal parts. Each member owns, tests, documents, and demonstrates one part.

| Member | Part | Main responsibilities | Main files |
| --- | --- | --- | --- |
| Blas Moreno Laguna | Agent workflow and Gemini integration | LangGraph state, nodes, and conditional routing; Gemini request understanding, search planning, and recommendation with Pydantic schemas; budget clarification; purchase approval, confirmation, and cancellation | `shopping_assistant.py` (state, graph, LLM nodes, approval nodes) |
| Yasaa Usman Ahmad Khan | Reusable memory | Memory formation policy (`STORE`, `TEMPORARY`, `HUMAN_REVIEW`); memory approval; `InMemoryStore` user namespaces; ranking and retrieval; corrections, superseded records, and history; memory tests and scenarios | `shopping_assistant.py` (memory nodes and ranking), memory cases in `project_tests.py` and `run_demo.py` |
| Mohammad Noman Hussain | Catalog tool, web app, and documentation | `headphones.csv`; CSV search tool and offer comparison with decimal totals; FastAPI backend and frontend; architecture diagram, notebook, report, and README; evidence capture | `headphones.csv`, `search_catalog` and comparison in `shopping_assistant.py`, `webapp.py`, `static/`, `architecture.*`, `Project_1_Report.pdf`, notebook |

Shared by all three: problem definition, workflow design review, scenario testing, and the live demonstration. Implementation and documentation were prepared with Codex assistance.

## Files

- `shopping_assistant.py`: core agent, tool, memory logic, service, and CLI.
- `webapp.py` and `static/`: local HTTP backend and responsive frontend.
- `headphones.csv`: 110 fictional offers across 36 models and three retailers.
- `Project_1_Shopping_Assistant.ipynb`: executed sample walkthrough and live option.
- `project_tests.py`, `run_demo.py`, and `evidence/`: verification and captured results.
- `architecture.mmd`, `architecture.svg`, and `Project_1_Report.pdf`: submission documentation.
- `requirements.txt`: tested direct dependencies.

CLI examples: `python shopping_assistant.py --sample`, or `python shopping_assistant.py` for a hidden Gemini key prompt. Prefix a CLI memory candidate with `remember:`.
