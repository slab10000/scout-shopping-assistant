# Shopping Assistant Project 1 Plan

Build one Gemini-powered LangGraph assistant that helps a user choose wireless headphones from a sample CSV catalog containing offers from several simulated retailers. The assistant interprets the request, retrieves approved preferences, plans and executes a catalog search, compares suitable offers, explains its recommendation, and requests approval before a simulated purchase confirmation.

The product information comes exclusively from the CSV for this milestone. All products, prices, stock information, retailer offers, and purchase actions used in the demonstration must be clearly identified as sample data or simulations.

## Libraries and code structure

Follow the previous labs: Python, `TypedDict` state, small node functions returning dictionary updates, `StateGraph`, conditional edges, and an accumulated audit log. Use `ChatGoogleGenerativeAI` from `langchain-google-genai`, with Pydantic schemas for structured model outputs as in Week 5. Keep the Gemini model configurable and validate the selected model during implementation.

Use `InMemorySaver` for per-thread execution state and `InMemoryStore` for approved reusable user memory. Read the catalog with Python's standard `csv` module. Add the requested local web frontend with Shopping, Catalog, Memory, and Architecture tabs, served by FastAPI. The Architecture tab reads actual LangGraph nodes, edges, and execution events. Product research remains CSV-only; the application uses no live shopping API, persistent database, or multiple agents.

## Catalog design

Use approximately 15 to 20 offers across three simulated retailers, with several offers for the same model. Include useful comparison cases: a low item price with high shipping, an out-of-stock offer, a refurbished offer, an offer with unknown shipping, and models that differ in fit or noise cancellation.

| Field | Purpose |
| --- | --- |
| `offer_id` | Unique retailer offer identifier |
| `product_id` | Shared identifier for the exact model and variant |
| `brand`, `product_name`, `model` | Product identification |
| `retailer` | Simulated seller name |
| `price`, `shipping_cost`, `currency` | Comparable costs; blank shipping means unknown |
| `condition`, `in_stock` | Eligibility and purchase condition |
| `form_factor`, `noise_cancelling`, `battery_hours` | Features used to match the request |

Start with USD and a clearly stated comparison of item price plus known shipping, before tax. Use fictional model and retailer names. Do not invent real retailer links or describe sample prices as current internet prices.

## Shopping workflow

1. **Understand the request.** Gemini produces validated constraints: exact model or category, budget, intended use, required features, and optional priorities.
2. **Retrieve memory.** Select relevant active records from the current user's namespace. Merge them with explicit request constraints; the current request takes precedence.
3. **Clarify when necessary.** Pause for missing essential information, then resume the same thread with the supplied details.
4. **Plan the search.** Gemini proposes bounded, structured search parameters such as model, condition, features, and result limit. Python validates the supported fields. The search function consumes these parameters so the plan controls execution.
5. **Search the CSV.** A Python tool reads the catalog and returns matching offer records. Record the tool invocation and returned offer IDs in the audit log.
6. **Validate and compare.** Python validates records, checks hard constraints and stock, groups equivalent offers, calculates known costs, and retains reasons for exclusion. Budget relaxation requires user input.
7. **Recommend.** Gemini explains a shortlist using only eligible offer IDs and supplied evidence. Construct prices and comparison tables directly from the validated records. With no suitable offers, explain the constraint conflict and request a revised request.
8. **Request action approval.** Show the selected offer and cost details, then pause with `interrupt()`. Resume with an explicit boolean decision. A separate node confirms the simulated purchase on approval or cancels on rejection.

Different models may be compared for suitability, but only offers with the same exact model, variant, and condition are interchangeable for a lowest-price comparison. Unknown shipping is never zero and prevents a definitive claim about the cheapest delivered offer. Use decimal arithmetic for money.

All these nodes belong to one assistant workflow. The prototype does not need independent planner, researcher, or reviewer agents.

## State and reusable memory

Thread state contains the request, extracted and effective constraints, selected memories, search plan, retrieved offers, comparison, proposed action, approval decision, status, and audit log. New requests use new `thread_id` values. Approval resumes use the original thread ID.

Approved reusable records live under a user namespace such as `("users", user_id, "shopping")`. Each record contains a key, memory type, value or concise text, scope, timestamp, source thread, and active or superseded status. A later thread uses the same `user_id` to retrieve these records without inheriting the earlier workflow's execution state.

The initial two records are:

- A semantic preference scoped to headphones: prefers over-ear fit.
- A semantic preference scoped to shopping: generally buys new products only.

Adapt Lab 3's memory policy. Reusable explicit preferences become `STORE` candidates; temporary budgets, one-purchase exceptions, catalog stock, and tool errors stay in thread state. Unclear or risky candidates use `HUMAN_REVIEW` or are declined. A STORE candidate still needs separate approval before any memory write. Purchase approval never grants memory approval.

For the small catalog demonstration, reuse Lab 3's deterministic relevance, importance, and timestamp-based recency ranking, with a relevance gate and at most three selected records. An unrelated category preference must not influence the current purchase.

An explicit correction such as "From now on, refurbished products are acceptable" creates a proposed replacement for the condition preference. After approval, mark the prior record superseded and retrieve only the active replacement. Preserve the old record and source. "Refurbished is acceptable for this purchase" changes only the current request.

Both the store and the checkpointer are in memory. Cross-thread reuse works within the same Python process or notebook kernel; restarting clears both. Durable memory can be added at a later milestone.

## Demonstration and verification

| Scenario | Expected evidence |
| --- | --- |
| Normal request | Live Gemini interpretation and plan, CSV tool call, valid comparison, recommendation, and approved simulated confirmation |
| Form reusable memory | Show two separately identified records and the approval decisions that allow storage |
| Later request | A fresh thread for the same user retrieves both records and applies them to the search or comparison |
| Memory correction | An approved change replaces the active condition preference and affects a subsequent request |
| Rejected action | The graph pauses, resumes with rejection, and reaches cancellation without simulated confirmation |
| Rejected memory | No new or replacement record is committed |
| Temporary exception | A purchase-specific condition takes precedence for that thread without overwriting the general preference |

Use fixed sample data for reproducible expected results. Stub LLM outputs only in clearly labeled local checks; the submitted main demonstrations must use a working Gemini model. Capture actual states and results rather than printing expected outcomes as evidence.

## Deliverables and implementation order

Keep the submission similar to Labs 2 and 3: `shopping_assistant.py` with `# %%` sections, a matching notebook, `headphones.csv`, `project_tests.py`, `requirements.txt`, `README.md`, an architecture diagram, an evidence folder, and a 1 to 2 page report covering results, limitations, and individual contributions.

Implement the catalog and deterministic comparison functions first, then the Gemini request and planning nodes, then checkpointed clarification and action approval, then memory formation, retrieval, and correction. Finish by running and capturing the required scenarios, preparing the notebook and report, and checking setup instructions from a clean environment.

The assignment source is `ITS 58100 - Project requirement documentation-- Agentic AI.docx`. Reference implementations are the Lab 1 Gemini integration, Lab 2 execution controls, Lab 3 memory policy and correction logic, and Week 5 structured outputs and Store API.
