"""Build the report and architecture SVG with the bundled PDF runtime."""
from __future__ import annotations
from html import escape
import json
from pathlib import Path
import re
from urllib.request import urlopen

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable

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
styles.add(ParagraphStyle(name='BodyScout',fontName=FONT,fontSize=10.5,leading=15,textColor=INK,spaceAfter=9))
styles.add(ParagraphStyle(name='SmallScout',fontName=FONT,fontSize=8.4,leading=12,textColor=MUTED,spaceAfter=7))
styles.add(ParagraphStyle(name='TitleScout',fontName=BOLD,fontSize=23,leading=29,textColor=INK,spaceAfter=8))
styles.add(ParagraphStyle(name='HeadScout',fontName=BOLD,fontSize=12.5,leading=17,textColor=INK,spaceBefore=10,spaceAfter=7))
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
tests=(ROOT/'evidence'/'catalog-expansion'/'test_output.txt').read_text()
count=re.search(r'Ran (\d+) tests',tests).group(1)
story=[P('Scout Shopping Assistant','TitleScout'),P('ITS 58100 | Project 1 | One memory enabled agent','SmallScout'),
 P('Scout helps a user choose wireless headphones by turning a natural-language request into a constrained search and a justified comparison. One Gemini-powered LangGraph workflow uses a CSV information source and approved preferences across separate interactions. The local webapp adds Shopping, Catalog, Memory, and Architecture tabs.'),
 P('Problem and input','HeadScout'),
 P('Example: “Find wireless headphones under $150 for studying; prioritize noise cancellation.” The sample catalog contains 110 fictional offers across 36 models and three simulated retailers. Output includes a shortlist, known item-and-shipping totals before tax, exclusions, uncertainty, and a proposed simulated purchase.'),
 P('Workflow and execution control','HeadScout'),Diagram(),Spacer(1,10),
 P('The implementation retains the labs’ TypedDict state, small node functions, partial updates, conditional edges, and audit log. Gemini extracts requirements and writes search steps, recommendations, and memory proposals. Python binds the exact validated filters to the plan and enforces schemas, decimal arithmetic, and approved offer IDs. The executable plan drives the CSV tool and comparison policy.'),
 P('The graph pauses with interrupt() before a simulated purchase or memory write. A strict boolean passed through Command(resume=...) selects approval or rejection in the same thread. The side effect runs in a later node and checks approval again. Rejection cancels; no real order, payment, or retailer action exists.'),
 P('Design decisions','HeadScout'),
 P('Current explicit constraints override remembered defaults. Unknown shipping cannot win a delivered-cost comparison. Only equivalent model, variant, and condition offers are interchangeable. Hard constraints precede ranking, and no-match requests stop without relaxing the budget. Gemini errors stay visible and never silently enable the explicitly labeled sample engine.'),
 PageBreak(),P('Memory and verification','TitleScout'),
 P('Thread state and reusable preferences','HeadScout'),
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
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#efebfa')),('BOX',(0,0),(-1,-1),.6,LINE),('INNERGRID',(0,0),(-1,-1),.4,LINE),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
story.append(table)
story.extend([Spacer(1,10),P(f'{count} local regression checks passed using the labeled sample engine and invalid-output stubs. They cover real graph pauses, strict consent, repeat-resume prevention, totals, unknown shipping, memory correction and history, temporary exceptions, duplicate handling, and scoped access. The executed notebook has seven code cells. Demo decisions are scripted mock-human inputs through actual interrupts.','SmallScout')])
if live_complete:
    metadata_path=ROOT/'evidence'/'gemini'/'run_metadata.json'
    live_model=json.loads(metadata_path.read_text()).get('model','Gemini Flash') if metadata_path.exists() else 'configured Gemini Flash model'
    story.append(P(f'Earlier live Gemini scenarios passed on the original six-model catalog: normal confirmation, two approved records, retrieval, rejection, correction, and no matches. Preserved evidence/gemini identifies those original live states; the expanded catalog was verified with the sample engine. Model: {escape(live_model)}. Captured reruns may vary; earlier tests encountered provider quota and high-demand responses.','SmallScout'))
else:
    story.append(P('Live Gemini request extraction, planning, recommendation, and memory proposals were verified, but provider quota and high-demand responses interrupted the full live scenario run. Partial states are in evidence/gemini. The sample engine’s complete results do not claim live LLM execution.','SmallScout'))
story.extend([P('Limitations and contributions','HeadScout'),
 P('The app is a local educational prototype. Simulated user IDs and ownership checks are not production authentication. Memory is not durable, catalog data is fictional, prices exclude tax, and Gemini prose may require review. No multiple-agent coordination, shared memory, real shopping API, or checkout is included.','SmallScout'),
 P('Team 1, three equal parts. <b>Blas Moreno Laguna:</b> LangGraph workflow, Gemini nodes, routing, and approval. <b>Yasaa Usman Ahmad Khan:</b> memory policy, approval, retrieval, correction, and memory tests. <b>Mohammad Noman Hussain:</b> CSV tool, comparison, web app, diagram, and report. All shared testing and the demo. Prepared with Codex assistance.','SmallScout')])

def footer(canvas,doc):
    canvas.setFont(FONT,8);canvas.setFillColor(MUTED);canvas.drawString(42,23,'Scout | Agentic AI Project 1');canvas.drawRightString(570,23,str(doc.page))
doc=SimpleDocTemplate(str(ROOT/'Project_1_Report.pdf'),pagesize=letter,rightMargin=42,leftMargin=42,topMargin=35,bottomMargin=36,title='Scout Shopping Assistant Project 1',author='Team 1: Blas Moreno Laguna, Yasaa Usman Ahmad Khan, Mohammad Noman Hussain')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Built Project_1_Report.pdf, architecture.svg, architecture.mmd; live complete:',live_complete)
