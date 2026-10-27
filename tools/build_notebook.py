"""Regenerate the notebook by actually executing its offline code cells."""
import contextlib
import io
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
cells=[]
def md(text):
    cells.append({"cell_type":"markdown","metadata":{},"source":text.splitlines(keepends=True)})
def code(text):
    cells.append({"cell_type":"code","metadata":{},"source":text.splitlines(keepends=True),"execution_count":None,"outputs":[]})

md("""# Scout Shopping Assistant Project 1

One Gemini-powered LangGraph agent with a sample CSV tool, checkpointed approval, and approved cross-thread memory. This notebook imports the same `shopping_assistant.py` implementation used by the webapp. The implementation has lab-style `# %%` sections and small node functions.

The executed cells below use **Sample engine (no LLM)** and scripted mock-human decisions to make this walkthrough repeatable. Use the explicit live option below or the webapp to call Gemini. All catalog records and purchases are fictional or simulated.

Keep this notebook beside the Python files and CSV. Install once with `%pip install -r requirements.txt` in a separate cell, then restart the kernel and run all cells in order. Python 3.12 was used for verification.
""")
md("## Imports and the same application\n\nStateGraph controls execution. InMemorySaver holds per-thread checkpoints; InMemoryStore holds approved preferences for reuse by a new thread.")
code("""from shopping_assistant import ShoppingService, records
from run_demo import demonstrate

service = ShoppingService()
USER_ID = 'notebook-student'
print('Engine: Sample engine (no LLM). Data: fictional headphones.csv.')
print('Catalog offers:', len(__import__('shopping_assistant').read_catalog()))
""")
md("## Actual LangGraph schema\n\nThe frontend Architecture tab renders these same nodes and edges. The Mermaid definition is generated from the compiled graph, rather than a separately invented workflow.")
code("""print(service.architecture()['mermaid'])
""")
md("## Required scenarios\n\nThe harness supplies explicit mock-human approval or rejection through actual `interrupt()` and `Command(resume=...)` calls. A normal request is followed by two approved preferences, a new shopping thread, rejection, correction, a temporary exception, and a no-match request.")
code("""results, checks = demonstrate(service, engine='sample', user_id=USER_ID)
assert all('FAIL' not in line for line in checks)
""")
md("## Inspect the paused state and comparison\n\nA separate state object and thread ID exist for each request. In Gemini mode, compare_offers calls the model with the request, applied preferences, search results, and validated shortlist to produce comparison bullets. Recommend receives that comparison and the request/preferences, selects one eligible offer, and writes a paragraph explaining why it wins. The sample engine below uses local rules with the same output structure. At purchase approval, no confirmation has occurred and the next node is `approve_purchase`.")
code("""paused = results['later_using_two_memories']
print('Thread:', paused['thread_id'])
print('Waiting node:', paused['next'])
print('Confirmed before approval:', paused['confirmed'])
print('Retrieved keys:', [m['key'] for m in paused['selected_memories']])
print('Effective constraints:', paused['effective_constraints'])
print('Rejected outcome:', results['purchase_rejected']['status'])
for offer in paused['comparison']['analysis']['offers']:
    print('Compared offer:', offer['offer_id'])
    for bullet in offer['bullets']:
        print(' -', bullet)
print('Why this product:', paused['recommendation']['explanation'])
""")
md("## Memory use and correction\n\nBoth records are formed in earlier threads. A correction supersedes the condition preference after approval while preserving the original provenance. A purchase-specific exception is not a new general preference.")
code("""print('Without memory:', results['normal_paused']['recommendation']['offer_id'])
print('With two memories:', results['later_using_two_memories']['recommendation']['offer_id'])
print('After correction:', results['later_after_correction']['effective_constraints']['condition'])
for memory in records(service.store, USER_ID, history=True):
    print(memory['key'], memory['value'], memory['status'], 'source:', memory['source_thread'])
print('Temporary input:', results['temporary_not_saved']['status'])
""")
md("## Regression verification\n\nThese checks use sample rules or explicit invalid-output stubs. They exercise graph control, money calculations, memory boundaries, and HTTP safeguards, rather than estimating Gemini accuracy.")
code("""import unittest
import sys
import project_tests
suite = unittest.defaultTestLoader.loadTestsFromModule(project_tests)
test_result = unittest.TextTestRunner(stream=sys.stdout, verbosity=1).run(suite)
assert test_result.wasSuccessful()
""")
md("""## Explicit live Gemini option

Set `RUN_LIVE = True` to use a working Gemini model. The hidden prompt reads a key into process memory. The live result pauses at real user approval and does not automatically confirm a purchase. Do not save API keys in notebook source or outputs.
""")
code("""RUN_LIVE = False
if RUN_LIVE:
    import getpass
    live_service = ShoppingService(getpass.getpass('Google API key (hidden): '))
    live_result = live_service.start('live-student', 'Find new over-ear headphones under $150 with noise cancellation.')
    print('Status:', live_result['status'])
    print('Pending:', live_result.get('pending'))
else:
    print('Live cell disabled. Enable explicitly or use the webapp Gemini engine.')
""")
md("""## Scope and limitations

Memory and unfinished checkpoints clear on process or kernel restart. Simulated user IDs demonstrate scoped access, not production authentication. Product lookup is CSV-only; costs exclude tax and live verification. Gemini errors remain errors and never silently select sample rules. See `README.md` and the two-page report for setup, test evidence, limitations, and the contribution statement.
""")

scope={"__name__":"notebook_execution"}
count=0
for cell in cells:
    if cell['cell_type']!='code':continue
    count+=1
    output=io.StringIO()
    with contextlib.redirect_stdout(output):
        exec(''.join(cell['source']),scope)
    cell['execution_count']=count
    cell['outputs']=[{"output_type":"stream","name":"stdout","text":output.getvalue().splitlines(keepends=True)}] if output.getvalue() else []
notebook={"cells":cells,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"language_info":{"name":"python","version":"3.12.12"}},"nbformat":4,"nbformat_minor":5}
for i,cell in enumerate(cells):cell['id']=f'scout-cell-{i:02d}'
(ROOT/'Project_1_Shopping_Assistant.ipynb').write_text(json.dumps(notebook,indent=2),encoding='utf-8')
print(f'Created notebook with {count} successfully executed code cells.')
