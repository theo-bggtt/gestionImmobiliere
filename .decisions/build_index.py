#!/usr/bin/env python3
"""Regenere index.html a partir de decisions.json."""
import json, html

d = json.load(open("decisions.json", encoding="utf-8"))
dec = d["decisions"]
total = len(dec)
done = sum(1 for x in dec if x["status"] == "chosen")
pct = round(done * 100 / total)

CATS = {"technical": "Technique", "visual": "Visuel", "interaction": "Interaction",
        "ia": "Archi info", "strategy": "Stratégie"}

items = []
first_pending = True
for i, x in enumerate(dec, 1):
    cat = x["category"]; lbl = CATS.get(cat, cat)
    summ = html.escape(x["summary"]); title = html.escape(x["title"])
    if x["status"] == "chosen":
        cls, status = "resolved", '<span class="chosen-text">Choisi : Option %s &mdash; %s</span>' % (
            x["chosenOption"], html.escape(x["chosenTitle"] or ""))
    elif x.get("htmlFile") and first_pending:
        cls, status = "pending", '<span class="pending-text">En attente de ton choix</span>'
        first_pending = False
    else:
        cls, status = "future", '<span class="future-text">À venir</span>'
    inner = '''      <div class="decision-number-badge">%d</div>
      <div class="decision-info">
        <h3>%s</h3>
        <div class="decision-meta">
          <span class="landing-category-badge %s">%s</span>
          <span class="decision-status">%s</span>
        </div>
        <p class="decision-summary">%s</p>
      </div>''' % (i, title, cat, lbl, status, summ)
    if cls == "future":
        items.append('    <div class="decision-item future">\n%s\n    </div>' % inner)
    else:
        items.append('    <a href="%s" class="decision-item %s">\n%s\n      <span class="arrow-icon">&rarr;</span>\n    </a>'
                     % (x["htmlFile"], cls, inner))

arch = ""
if d.get("archived"):
    rows = "".join('      <li><strong>%s</strong> &mdash; %s</li>\n' % (html.escape(a["title"]), html.escape(a["raison"]))
                   for a in d["archived"])
    arch = '''
  <div class="archive-box">
    <h3>Décisions archivées</h3>
    <ul>
%s    </ul>
    <p>Les pages sont conservées dans <code>archive/</code>.</p>
  </div>
''' % rows

CSS = """*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f1f5f9; color: #1a1a2e; min-height: 100vh; padding: 2rem; line-height: 1.6; }
.container { max-width: 900px; margin: 0 auto; }
header { text-align: center; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; }
header h1 { font-size: 1.6rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
.project-description { font-size: 1rem; color: #475569; margin-top: 0.5rem; }
.context-chips { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-top: 0.85rem; }
.chip { background: white; border: 1px solid #e2e8f0; border-radius: 999px; padding: 4px 12px; font-size: 0.72rem; color: #475569; }
.chip strong { color: #0f172a; }
.progress-section { margin: 1.5rem 0; }
.progress-label { font-size: 0.85rem; color: #64748b; margin-bottom: 0.5rem; display: flex; justify-content: space-between; }
.progress-bar { width: 100%; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.progress-fill { height: 100%; background: #059669; border-radius: 999px; transition: width 0.3s ease; }
.decision-list { display: flex; flex-direction: column; gap: 1rem; }
.decision-item { background: white; border-radius: 12px; padding: 1.25rem 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 2px solid #e2e8f0; text-decoration: none; color: inherit; display: flex; align-items: center; gap: 1rem; transition: border-color 0.2s; }
.decision-item:hover { border-color: #6366f1; }
.decision-item.resolved { border-left: 4px solid #059669; }
.decision-item.pending { border-left: 4px solid #f59e0b; }
.decision-item.future { border-left: 4px solid #cbd5e1; opacity: 0.62; cursor: default; }
.decision-item.future:hover { border-color: #e2e8f0; }
.decision-number-badge { width: 36px; height: 36px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; }
.decision-item.resolved .decision-number-badge { background: #ecfdf5; color: #059669; }
.decision-item.pending .decision-number-badge { background: #fffbeb; color: #d97706; }
.decision-item.future .decision-number-badge { background: #f1f5f9; color: #94a3b8; }
.decision-info { flex: 1; }
.decision-info h3 { font-size: 1rem; font-weight: 600; color: #0f172a; }
.decision-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; flex-wrap: wrap; }
.landing-category-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.landing-category-badge.strategy { background: #fef3c7; color: #b45309; }
.landing-category-badge.technical { background: #ede9fe; color: #6d28d9; }
.landing-category-badge.visual { background: #fce7f3; color: #be185d; }
.landing-category-badge.interaction { background: #e0f2fe; color: #0369a1; }
.landing-category-badge.ia { background: #ecfdf5; color: #047857; }
.decision-status { font-size: 0.8rem; color: #64748b; }
.decision-status .chosen-text { color: #059669; font-weight: 600; }
.decision-status .pending-text { color: #d97706; font-weight: 600; }
.decision-status .future-text { color: #94a3b8; font-weight: 600; }
.decision-summary { font-size: 0.8rem; color: #64748b; margin-top: 0.25rem; }
.arrow-icon { color: #94a3b8; font-size: 1.1rem; flex-shrink: 0; }
.archive-box { margin-top: 2rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 1rem 1.25rem; }
.archive-box h3 { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 0.5rem; }
.archive-box ul { list-style: none; padding: 0; }
.archive-box li { font-size: 0.78rem; color: #64748b; line-height: 1.5; padding: 0.2rem 0; }
.archive-box li strong { color: #475569; }
.archive-box p { font-size: 0.72rem; color: #94a3b8; margin-top: 0.5rem; }
.archive-box code { background: #e2e8f0; border-radius: 3px; padding: 1px 5px; }
.footer-note { text-align: center; margin-top: 2rem; font-size: 0.8rem; color: #94a3b8; }"""

c = d["context"]
out = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hub des décisions — %s</title>
<style>
%s
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Hub des décisions</h1>
    <p class="project-description">%s</p>
    <div class="context-chips">
      <span class="chip">Séquence : <strong>l'app d'abord, la vente ensuite</strong></span>
      <span class="chip">Marché visé : <strong>%s</strong></span>
      <span class="chip">Horizon : <strong>long cours</strong></span>
    </div>
  </header>

  <div class="progress-section">
    <div class="progress-label"><span>%d décision sur %d</span><span>%d%%</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width: %d%%"></div></div>
  </div>

  <div class="decision-list">
%s
  </div>
%s
  <p class="footer-note">Pour revenir sur un choix : dis à Claude « pour decision-001 je veux l'option C finalement »</p>
</div>
</body>
</html>
''' % (html.escape(d["projectName"]), CSS, html.escape(d["projectDescription"]),
       html.escape(c["marche"]), done, total, pct, pct, "\n".join(items), arch)

open("index.html", "w", encoding="utf-8").write(out)
print("index.html regenere :", done, "/", total, "(", pct, "% )")
