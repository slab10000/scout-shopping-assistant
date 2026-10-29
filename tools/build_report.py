"""Build the report and architecture SVG with the bundled PDF runtime."""
from __future__ import annotations
from html import escape
import json
from pathlib import Path
import re
import struct
from urllib.request import urlopen

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable, Image

ROOT=Path(__file__).resolve().parents[1]
FONT_ROOT=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype'
if FONT_ROOT.exists():
    pdfmetrics.registerFont(TTFont('Scout',str(FONT_ROOT/'DejaVuSans.ttf')))
    pdfmetrics.registerFont(TTFont('ScoutBold',str(FONT_ROOT/'DejaVuSans-Bold.ttf')))
    pdfmetrics.registerFontFamily('Scout',normal='Scout',bold='ScoutBold')
    FONT,BOLD='Scout','ScoutBold'
else:
    FONT,BOLD='Helvetica','Helvetica-Bold'

graph=json.loads(urlopen('http://127.0.0.1:8000/api/architecture').read())
(ROOT/'architecture.mmd').write_text(graph['mermaid'],encoding='utf-8')
(ROOT/'evidence'/'graph.json').write_text(json.dumps(graph,indent=2),encoding='utf-8')

positions={
 '__start__':(36,70),'intake':(195,70),'understand':(375,70),'retrieve_memory':(555,70),'plan_search':(735,70),'search_catalog':(915,70),
 'unsupported':(375,205),'clarify':(555,205),'insufficient':(735,205),'compare_offers':(915,335),
 'confirm_purchase':(195,335),'approve_purchase':(375,335),'recommend':(555,335),'no_matches':(915,460),'cancel_purchase':(375,460),
 'form_memory':(195,610),'approve_memory':(375,610),'save_memory':(555,610),'finish_memory':(735,610),'__end__':(915,610)}
titles={'__start__':'START','intake':'Start a thread','understand':'Understand request','retrieve_memory':'Retrieve memory','plan_search':'Plan the search','search_catalog':'Search the CSV','compare_offers':'Compare offers','recommend':'Recommend','approve_purchase':'Human approval','confirm_purchase':'Confirm simulation','cancel_purchase':'Cancel purchase','clarify':'Clarify budget','no_matches':'No suitable offers','unsupported':'Outside catalog','insufficient':'Need information','form_memory':'Form a memory','approve_memory':'Approve memory','save_memory':'Save preference','finish_memory':'Finish without write','__end__':'END'}
svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1130 735" role="img" aria-label="Scout actual LangGraph architecture">',
 '<rect width="1130" height="735" fill="#fcfbff"/>',
 '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="m0 0 10 5-10 5" fill="#b7a9cb"/></marker></defs>',
 '<text x="36" y="32" font-family="Arial,sans-serif" font-size="13" fill="#8a6eaa">SHOPPING WORKFLOW</text>',
 '<text x="36" y="574" font-family="Arial,sans-serif" font-size="13" fill="#8a6eaa">MEMORY FORMATION WITH SEPARATE CONSENT</text>']
for edge in graph['edges']:
    ax,ay=positions[edge['source']];bx,by=positions[edge['target']];w,h=148,57
    if ay==by:
        forward=bx>ax;x1=ax+(w if forward else 0);x2=bx+(0 if forward else w)
        if abs(bx-ax)>205:
            step=13 if forward else -13
            d=f'M{x1},{ay+h/2} H{x1+step} V{ay-24} H{x2-step} V{by+h/2} H{x2}'
        else:d=f'M{x1},{ay+h/2} H{x2}'
    else:
        x1=ax+w/2;y1=ay+(h if by>ay else 0);x2=bx+w/2;y2=by+(0 if by>ay else h)
        if edge['target']=='__end__':d=f'M{ax+w},{ay+h/2} H1090 V{by-30} H{x2} V{y2}'
        elif edge['source']=='intake' and edge['target']=='form_memory':d=f'M{x1},{ay+h} V155 H175 V{by+h/2} H{bx}'
        elif edge['source']=='clarify' and edge['target']=='understand':d=f'M{ax},{ay+h/2} H{x2} V{by+h}'
        else:d=f'M{x1},{y1} V{(y1+y2)/2} H{x2} V{y2}'
    dash=' stroke-dasharray="5 4"' if edge['conditional'] else ''
    svg.append(f'<path d="{d}" fill="none" stroke="#b7a9cb" stroke-width="1.4"{dash} marker-end="url(#arrow)"/>')
for key in graph['nodes']:
    x,y=positions[key]
    human=key in {'approve_memory','approve_purchase','clarify'}
    fill='#fff7e8' if human else '#ffffff';stroke='#d6bd85' if human else '#d3c3e7'
    svg.extend([f'<rect x="{x}" y="{y}" width="148" height="57" rx="9" fill="{fill}" stroke="{stroke}"/>',
        f'<text x="{x+10}" y="{y+23}" fill="#695077" font-family="Arial,sans-serif" font-size="11.5">{escape(titles[key])}</text>',
        f'<text x="{x+10}" y="{y+42}" fill="#9c89aa" font-family="monospace" font-size="8.8">{escape(key)}</text>'])
svg.append('<text x="36" y="718" font-family="Arial,sans-serif" font-size="11" fill="#8c789e">Actual app.get_graph() nodes and edges. Dotted edges are conditional. Gold nodes pause for human input.</text></svg>')
(ROOT/'architecture.svg').write_text('\n'.join(svg),encoding='utf-8')

INK=colors.HexColor('#292638');PURPLE=colors.HexColor('#6960cc');MUTED=colors.HexColor('#71687c');LINE=colors.HexColor('#e3ddeb')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyScout',fontName=FONT,fontSize=9.6,leading=13.2,textColor=INK,spaceAfter=6))
styles.add(ParagraphStyle(name='SmallScout',fontName=FONT,fontSize=8.4,leading=11.4,textColor=MUTED,spaceAfter=5))
styles.add(ParagraphStyle(name='TitleScout',fontName=BOLD,fontSize=21,leading=26,textColor=INK,spaceAfter=4))
styles.add(ParagraphStyle(name='HeadScout',fontName=BOLD,fontSize=11.5,leading=15,textColor=INK,spaceBefore=7,spaceAfter=4))
styles.add(ParagraphStyle(name='TableScout',fontName=FONT,fontSize=8.5,leading=12,textColor=INK))
def P(text,style='BodyScout'):return Paragraph(text,styles[style])

class Diagram(Flowable):
    def __init__(self):super().__init__();self.width=528;self.height=153
    def draw(self):
        c=self.canv
        labels=[('Understand',6,110),('Retrieve memory',140,110),('Plan search',274,110),('CSV tool',408,110),
                ('Compare offers',408,59),('Recommend',274,59),('Human approval',140,59),('Confirm or cancel',6,59)]
        c.setLineWidth(.75)
        for text,x,y in labels:
            c.setFillColor(colors.HexColor('#f5f1fd') if 'approval' not in text else colors.HexColor('#fff6e8'))
            c.setStrokeColor(LINE);c.roundRect(x,y,114,32,5,fill=1,stroke=1)
            c.setFillColor(INK);c.setFont(FONT,8.2);c.drawCentredString(x+57,y+12,text)
        for a,b,y in [(120,140,126),(254,274,126),(388,408,126),(408,388,75),(274,254,75),(140,120,75)]:
            c.setStrokeColor(PURPLE);c.line(a,y,b,y);direction=1 if b>a else -1;c.line(b-4*direction,y-2,b,y);c.line(b-4*direction,y+2,b,y)
        c.line(465,110,465,91);c.line(463,95,465,91);c.line(467,95,465,91)
        c.setFont(FONT,8);c.setFillColor(MUTED)
        c.drawString(7,35,'Separate memory path: Form preference  >  Human approval  >  Save or finish without a write')
        c.drawString(7,19,'Conditional paths: clarify missing budget; stop unsupported requests or unmatched offers.')
        c.drawString(7,3,'Full graph: Architecture tab, architecture.svg, and the generated architecture.mmd file.')

sample_dir=ROOT/'evidence'/'catalog-expansion'/'sample'
sample=json.loads((sample_dir/'scenarios.json').read_text())
live_path=ROOT/'evidence'/'gemini'/'scenarios.json'
live=json.loads(live_path.read_text()) if live_path.exists() else {}
live_complete=all(live.get(k,{}).get('status')==v for k,v in {'normal_approved':'SIMULATED_CONFIRMED','memory_fit_saved':'MEMORY_SAVED','memory_condition_saved':'MEMORY_SAVED','later_using_two_memories':'WAITING_APPROVAL','purchase_rejected':'CANCELLED','correction_saved':'MEMORY_SAVED','later_after_correction':'WAITING_APPROVAL','temporary_not_saved':'NOT_STORED','memory_rejected':'MEMORY_REJECTED','no_matching_offer':'NO_MATCHES'}.items())
tests=(ROOT/'evidence'/'llm-comparison'/'test_output.txt').read_text()
count=re.search(r'Ran (\d+) tests',tests).group(1)
REPO='https://github.com/slab10000/scout-shopping-assistant'
styles.add(ParagraphStyle(name='BulletScout',parent=styles['SmallScout'],leftIndent=11,bulletIndent=0,spaceAfter=2.5))
def B(text):return Paragraph(text,styles['BulletScout'],bulletText='•')
story=[P('Scout Shopping Assistant','TitleScout'),P('ITS 58100 | Project 1 | Team 1: Blas Moreno Laguna, Yasaa Usman Ahmad Khan, Mohammad Noman Hussain','SmallScout'),
 P(f'Code repository: <a href="{REPO}" color="#6960cc">{REPO.removeprefix("https://")}</a>','SmallScout'),
 P('Scout helps a user choose wireless headphones by turning a natural-language request into a constrained search, a reasoned comparison, and a recommendation that waits for human approval. One Gemini-powered LangGraph workflow uses a CSV information source and approved preferences across separate interactions. The local web app has Shopping, Catalog, Memory, and Architecture tabs.'),
 P('Example: “Find wireless headphones under $150 for studying; prioritize noise cancellation.” The sample catalog contains 110 fictional offers across 36 models and three simulated retailers. Output includes a shortlist, known item-and-shipping totals before tax, exclusions, uncertainty, and a proposed simulated purchase.'),
 P('Workflow and execution control','HeadScout'),Diagram(),Spacer(1,6),
 P('The implementation follows the labs: TypedDict state, small node functions, partial updates, conditional edges, and an audit log. Gemini extracts requirements, writes the search strategy, compares the shortlist, recommends one offer, and proposes memories. Python binds the validated filters to the plan and enforces schemas, decimal arithmetic, and allowed offer IDs.'),
 P('Comparison and recommendation are two separate Gemini calls. compare_offers sends the request, applied preferences, all CSV search results, and the validated shortlist; Gemini returns two to four bullets per offer plus overall takeaways. recommend receives that comparison and writes one paragraph on why the chosen offer beats the alternatives. Python rejects invented, missing, or duplicate offer IDs.'),
 P('The graph pauses with interrupt() before a simulated purchase or memory write. A strict boolean passed through Command(resume=...) selects approval or rejection in the same thread, and the side effect runs in a later node that checks approval again. No real order or payment exists.'),
 P('Design decisions','HeadScout'),
 P('Current constraints override remembered defaults. Unknown shipping cannot win a delivered-cost comparison, and only identical model, variant, and condition offers are interchangeable. No-match requests stop without relaxing the budget, and Gemini errors never silently switch to the sample engine.'),
 P('Thread state and reusable memory','HeadScout'),
 P('InMemorySaver checkpoints each thread_id: request, constraints, plan, offers, approval, status, and events. InMemoryStore holds approved records under the user’s shopping namespace. A new thread retrieves relevant active records without inheriting the old approval or execution state. Both backends clear on process restart.'),
 P('Memory formation separates STORE candidates, TEMPORARY context, and HUMAN_REVIEW. Only supported, canonical fit, condition, feature, and ranking preferences can be saved after approval. Ranking uses relevance, importance, and deterministic timestamp-based recency. A correction supersedes the old active record while preserving its source, approval time, and replacement link.'),
 P('Recorded scenarios','HeadScout')]
rows=[['Scenario','Expected behavior','Observed sample result'],
 ['Normal request','Pause, then confirm simulation',sample['normal_approved']['status']],
 ['Later thread with two records','Apply over-ear and new-only preferences',f"{len(sample['later_using_two_memories']['selected_memories'])} records; {sample['later_using_two_memories']['recommendation']['offer_id']} selected"],
 ['Rejected purchase','No confirmation node',sample['purchase_rejected']['status']],
 ['Approved correction','Replace new-only with any condition',sample['later_after_correction']['effective_constraints']['condition']],
 ['Temporary exception','No reusable write',sample['temporary_not_saved']['status']],
 ['Rejected memory','Keep store unchanged',sample['memory_rejected']['status']],
 ['No suitable offer','Stop without action',sample['no_matching_offer']['status']]]
table=Table([[P(escape(str(cell)),'TableScout') for cell in row] for row in rows],colWidths=[128,220,180],repeatRows=1)
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#efebfa')),('BOX',(0,0),(-1,-1),.6,LINE),('INNERGRID',(0,0),(-1,-1),.4,LINE),('TOPPADDING',(0,0),(-1,-1),3.5),('BOTTOMPADDING',(0,0),(-1,-1),3.5),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
story.append(table)
story.extend([Spacer(1,6),P(f'{count} local regression checks pass with the labeled sample engine, covering graph pauses, strict consent, money totals, unknown shipping, memory correction, temporary exceptions, scoped access, the comparison handoff, and invented offer IDs. Demo decisions are scripted mock-human inputs through real interrupts.','SmallScout')])
if live_complete:
    metadata_path=ROOT/'evidence'/'gemini'/'run_metadata.json'
    live_model=json.loads(metadata_path.read_text()).get('model','Gemini Flash') if metadata_path.exists() else 'configured Gemini Flash model'
    story.append(P(f'Live Gemini runs ({escape(live_model)}) passed the normal, two-memory, retrieval, rejection, correction, and no-match scenarios on the original catalog. A later live run verified the comparison handoff with all 110 search results and two applied preferences (evidence/llm-comparison). Some attempts hit provider quota or high-demand errors.','SmallScout'))
else:
    story.append(P('Live Gemini request extraction, planning, recommendation, and memory proposals were verified, but provider quota and high-demand responses interrupted the full live scenario run. Partial states are in evidence/gemini. The sample engine’s complete results do not claim live LLM execution.','SmallScout'))
team=Table([[P(escape(c),'TableScout') for c in row] for row in [
 ['Member','Part','Main responsibilities'],
 ['Blas Moreno Laguna','Agent workflow and Gemini','LangGraph state and routing; Gemini understanding, planning, comparison, and recommendation; purchase approval'],
 ['Yasaa Usman Ahmad Khan','Reusable memory','Memory policy and approval; user namespaces; ranking and retrieval; corrections and history; memory tests'],
 ['Mohammad Noman Hussain','Catalog, web app, documentation','CSV catalog, search tool, and offer totals; web frontend; architecture diagram, notebook, report, and evidence']]],
 colWidths=[112,108,308],repeatRows=1)
team.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#efebfa')),('BOX',(0,0),(-1,-1),.6,LINE),('INNERGRID',(0,0),(-1,-1),.4,LINE),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
story.extend([P('Team 1 contributions','HeadScout'),team,Spacer(1,5),
 P('All three members shared the problem definition, workflow design review, scenario testing, and the live demonstration.','SmallScout'),
 P('Instructor discussion and next steps','HeadScout'),
 P('We reviewed Scout with the professor. The discussion focused on three directions for Project 2: replacing the fixed CSV with live product data through real APIs, adding more tools, and supporting multiple users with their own threads. Our plan follows the Week 8 and Week 9 material on role-based agents and shared memory.','SmallScout'),
 B('<b>Live search APIs.</b> Tavily web search for product pages and reviews, plus Rainforest API (Amazon) and BlueCart API (Walmart) for structured prices, stock, and shipping. Each result keeps its source, retailer, and timestamp so stale prices can be refreshed. The CSV stays as an offline fallback and test fixture.'),
 B('<b>More tools.</b> A price-history tracker that stores price snapshots to spot real discounts, a zip-code tax and shipping estimator, a review summarizer limited to retrieved review text, a coupon checker, and a simulated price-drop alert. Purchases remain simulated and approval-gated.'),
 B('<b>Collaborating agents.</b> A Planner that reads private preferences, a Researcher that calls the live APIs but cannot read private memory, and a Reviewer that checks prices and sources but cannot approve a purchase, with read and write permissions defined per role.'),
 B('<b>Multi-user threads and persistence.</b> At least two simulated shoppers, each with a private memory namespace and several threads, plus a shared deal board that holds only validated, user-approved records. One user cannot read another user’s private data. SQLite-backed memory and checkpoints will survive a restart.'),
 P('Limitations','HeadScout'),
 P('Scout is a local prototype: simulated user IDs are not real authentication, memory clears on restart, the catalog is fictional, and prices exclude tax. Live APIs, multiple agents, and shared memory are Project 2 work.','SmallScout')])
native=ROOT/'static'/'architecture'/'scout-native.png'
with native.open('rb') as handle:
    handle.read(16);png_w,png_h=struct.unpack('>II',handle.read(8))
scale=min(528/png_w,560/png_h)
story.extend([PageBreak(),P('Appendix: Architecture diagram','HeadScout'),
 P('The native LangGraph rendering from app.get_graph(), the same image shown in the web app’s Architecture tab. Solid edges are fixed steps; dotted edges are conditional routes. Gemini runs in understand, plan_search, compare_offers, recommend, and form_memory. search_catalog is the CSV tool. retrieve_memory and save_memory read and write the user’s InMemoryStore namespace, while InMemorySaver checkpoints each thread. clarify, approve_purchase, and approve_memory pause for a human decision.','SmallScout'),
 Spacer(1,6),Image(str(native),width=png_w*scale,height=png_h*scale)])

def footer(canvas,doc):
    canvas.setFont(FONT,8);canvas.setFillColor(MUTED);canvas.drawString(42,23,'Scout | Agentic AI Project 1 | Team 1');canvas.drawRightString(570,23,str(doc.page))
doc=SimpleDocTemplate(str(ROOT/'Project_1_Report.pdf'),pagesize=letter,rightMargin=42,leftMargin=42,topMargin=35,bottomMargin=36,title='Scout Shopping Assistant Project 1',author='Team 1: Blas Moreno Laguna, Yasaa Usman Ahmad Khan, Mohammad Noman Hussain')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Built Project_1_Report.pdf, architecture.svg, architecture.mmd; live complete:',live_complete)
