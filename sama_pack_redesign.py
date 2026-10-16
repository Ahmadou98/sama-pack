#!/usr/bin/env python3
"""Apply the SAMA-PACK compact promotions/catalogue and admin-visibility redesign.
Run from the repository root in GitHub Codespaces: python sama_pack_redesign.py
"""
from pathlib import Path
import subprocess
import sys

FILES = ("app.js", "index.html", "styles.css")
root = Path.cwd()
if any(not (root / name).is_file() for name in FILES):
    sys.exit("ERREUR : lance ce script depuis la racine du dépôt SAMA-PACK (app.js, index.html, styles.css).")

original = {name: (root / name).read_text(encoding="utf-8") for name in FILES}
app, html, css = original["app.js"], original["index.html"], original["styles.css"]

# Avoid applying the same redesign twice.
if 'class="promo-hero-card"' in html and 'class="promo-card promo-slide-in"' in app and "SAMA-PACK — accueil et catalogue compacts" in css:
    sys.exit("Le redesign semble déjà appliqué. Aucun fichier n'a été modifié.")

old_hero = '''    <div class="hero-card">
      <div class="hero-card-head"><span>✨ Découvrez nos packs</span><small>Entretien au quotidien</small></div>
      <div class="hero-image-wrap">
        <img class="hero-feature-image" src="images/Pack Grand Ménage.jpeg" alt="Pack Grand Ménage proposé par Sama-Pack" loading="eager" fetchpriority="high">
      </div>
      <div id="heroTopPacks" class="top-packs"></div>
      <div class="hero-note">Choisis ton pack, commande directement sur le site et suis l’évolution de ta commande depuis ton compte.</div>
    </div>'''
new_hero = '''    <div class="hero-card promo-hero-card">
      <div class="hero-card-head">
        <span>🏷️ Offres &amp; packs</span>
        <div id="promoArrows" class="promo-arrows" aria-label="Navigation des promotions">
          <button class="btn ghost small" type="button" onclick="movePromo(-1)" aria-label="Promotion précédente">←</button>
          <button class="btn ghost small" type="button" onclick="movePromo(1)" aria-label="Promotion suivante">→</button>
        </div>
      </div>
      <div id="promoSection" class="promo-inline-section hidden" aria-label="Offres promotionnelles">
        <div id="promoCarousel" aria-live="polite"></div>
        <div id="promoDots" class="promo-dots" aria-label="Choisir une promotion"></div>
      </div>
      <div id="heroTopPacks" class="top-packs"></div>
    </div>'''
if old_hero not in html:
    sys.exit("ERREUR : le bloc d'accueil ne correspond pas à la version attendue. Aucun fichier n'a été écrit.")
html = html.replace(old_hero, new_hero, 1)

# Delete the previous large, full-width promo section; it now sits in the hero card.
section_start = html.find('<section id="promoSection"')
if section_start >= 0:
    section_end = html.find("</section>", section_start)
    if section_end < 0:
        sys.exit("ERREUR : section promo non terminée. Aucun fichier n'a été écrit.")
    html = html[:section_start] + html[section_end + len("</section>"):]

admin_btn_old = '<button class="btn small ghost" id="adminBtn">Gestion</button>'
admin_btn_new = '<button class="btn small ghost hidden" id="adminBtn">Gestion</button>'
if admin_btn_old not in html:
    sys.exit("ERREUR : bouton Gestion introuvable. Aucun fichier n'a été écrit.")
html = html.replace(admin_btn_old, admin_btn_new, 1)

footer_old = '<div><strong>Gestion</strong><a href="#" id="footerAdmin"></a><small>Comptes individuels, commandes et historique sécurisés.</small></div>'
footer_new = '<div id="footerAdminSection" class="hidden"><strong>Espace administrateur</strong><a href="#" id="footerAdmin">Ouvrir la gestion</a><small>Réservé aux administrateurs.</small></div>'
if footer_old not in html:
    sys.exit("ERREUR : bloc de gestion du pied de page introuvable. Aucun fichier n'a été écrit.")
html = html.replace(footer_old, footer_new, 1)

# Replace the large promo panel with a compact card containing no product description.
fn_start = app.find("  function renderPromoCarousel() {")
fn_end = app.find("  function movePromo(direction) {", fn_start)
if fn_start < 0 or fn_end < 0:
    sys.exit("ERREUR : fonction renderPromoCarousel introuvable. Aucun fichier n'a été écrit.")
new_promo_fn = r'''  function renderPromoCarousel() {
    const section = $("promoSection"), carousel = $("promoCarousel"), dots = $("promoDots");
    if (!section || !carousel) return;
    const promos = products.filter(p => p.active && hasPromotion(p));
    section.classList.toggle("hidden", promos.length === 0);
    const topPacks = $("heroTopPacks");
    if (topPacks) topPacks.classList.toggle("hidden", promos.length > 0);
    const arrows = $("promoArrows");
    if (arrows) arrows.classList.toggle("hidden", promos.length < 2);
    if (!promos.length) {
      carousel.innerHTML = "";
      if (dots) dots.innerHTML = "";
      currentPromoIndex = 0;
      return;
    }
    currentPromoIndex = ((currentPromoIndex % promos.length) + promos.length) % promos.length;
    const p = promos[currentPromoIndex];
    carousel.innerHTML = `<article class="promo-card promo-slide-in"><div class="promo-image">${imageOrEmoji(p, "promo-visual")}</div><div class="promo-copy"><span class="promo-label">${esc(p.promo_label || "Offre spéciale")}</span><h3>${esc(p.name)}</h3><div class="promo-price-line"><strong>${money(getEffectivePrice(p))}</strong><del>${money(p.price)}</del></div><div class="promo-actions"><button class="btn ghost small" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary small" onclick="addToCart('${esc(p.id)}')">Ajouter</button></div></div></article>`;
    if (dots) dots.innerHTML = promos.map((item, index) => `<button class="promo-dot ${index === currentPromoIndex ? "active" : ""}" aria-label="Afficher la promotion ${index + 1}" aria-current="${index === currentPromoIndex ? "true" : "false"}" onclick="goToPromo(${index})"></button>`).join("");
  }
'''
app = app[:fn_start] + new_promo_fn + app[fn_end:]

catalogue_description = '<div class="product-desc">${esc(p.desc)}</div>'
if catalogue_description not in app:
    sys.exit("ERREUR : description de la carte catalogue introuvable. Aucun fichier n'a été écrit.")
app = app.replace(catalogue_description, "", 1)

admin_line = '    const adminBtn = $("adminBtn"); if (adminBtn) adminBtn.textContent = isAdmin() ? "Gestion" : "Gestion";'
admin_replacement = '''    const adminBtn = $("adminBtn");
    if (adminBtn) { adminBtn.textContent = "Gestion"; adminBtn.classList.toggle("hidden", !isAdmin()); }
    const footerAdminSection = $("footerAdminSection");
    if (footerAdminSection) footerAdminSection.classList.toggle("hidden", !isAdmin());'''
if admin_line not in app:
    sys.exit("ERREUR : mise à jour de visibilité admin introuvable. Aucun fichier n'a été écrit.")
app = app.replace(admin_line, admin_replacement, 1)

css_addition = r'''

/* SAMA-PACK — accueil et catalogue compacts */
.hero-card.promo-hero-card { min-width:0; padding:22px; border-radius:24px; overflow:hidden; }
.promo-hero-card .hero-card-head { gap:12px; margin-bottom:15px; }
.promo-hero-card .hero-card-head>span { font-size:15px; font-weight:900; letter-spacing:-.02em; }
.promo-hero-card .promo-arrows { gap:6px; }
.promo-hero-card .promo-arrows .btn { width:34px; height:34px; padding:0; font-size:15px; }
.promo-inline-section { min-width:0; }
.promo-card { display:grid; grid-template-columns:112px minmax(0,1fr); align-items:center; gap:14px; min-height:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; overflow:visible; }
.promo-image { width:112px; min-height:112px; max-height:112px; padding:8px; border-radius:16px; background:linear-gradient(140deg,#e8f7ec,#f8fafc); overflow:hidden; }
.promo-image .promo-visual { display:grid; place-items:center; width:100%; min-height:96px; }
.promo-image .product-photo { width:100%; height:96px; min-height:96px; object-fit:contain; }
.promo-image .pack-box { width:80px; height:62px; border-radius:13px; }
.promo-image .pack-box .emoji { font-size:25px; }
.promo-image .pack-box .pack-code { font-size:10px; }
.promo-copy { display:flex; align-items:flex-start; flex-direction:column; min-width:0; gap:7px; padding:0; }
.promo-copy h3 { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; margin:0; font-size:clamp(15px,1.5vw,19px); line-height:1.25; }
.promo-price-line { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; margin:0; }
.promo-price-line strong { font-size:20px; line-height:1.2; }
.promo-price-line del { font-size:12px; }
.promo-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
.promo-actions .btn { padding:8px 10px; font-size:12px; border-radius:10px; }
.promo-hero-card .promo-dots { margin-top:13px; }
.promo-hero-card .promo-dot { width:7px; height:7px; }
.promo-hero-card .promo-dot.active { width:21px; }
.promo-slide-in { animation:promo-enter-from-left 360ms cubic-bezier(.2,.7,.25,1) both; }
@keyframes promo-enter-from-left { from { opacity:0; transform:translateX(-22px); } to { opacity:1; transform:translateX(0); } }
.product-card .product-body { gap:12px; }
.product-card .product-name { overflow-wrap:anywhere; }
#footerAdminSection { display:flex; flex-direction:column; gap:8px; }
#footerAdminSection.hidden { display:none !important; }
@media(max-width:700px) {
  .hero-card.promo-hero-card { padding:15px; border-radius:18px; }
  .promo-hero-card .hero-card-head { margin-bottom:12px; }
  .promo-hero-card .hero-card-head>span { font-size:13px; }
  .promo-card { grid-template-columns:86px minmax(0,1fr); gap:10px; }
  .promo-image { width:86px; min-height:88px; max-height:88px; padding:5px; border-radius:13px; }
  .promo-image .promo-visual { min-height:76px; }
  .promo-image .product-photo { height:76px; min-height:76px; }
  .promo-image .pack-box { width:66px; height:52px; }
  .promo-copy { gap:6px; }
  .promo-copy h3 { font-size:14px; }
  .promo-price-line { gap:6px; }
  .promo-price-line strong { font-size:17px; }
  .promo-price-line del { font-size:10px; }
  .promo-label { font-size:9px; padding:4px 7px; }
  .promo-actions { gap:5px; }
  .promo-actions .btn { padding:7px 8px; font-size:11px; }
}
@media(prefers-reduced-motion:reduce) { .promo-slide-in { animation:none; } }
'''
if "SAMA-PACK — accueil et catalogue compacts" not in css:
    css += css_addition

# Guardrails: fail before writing if any requested behavior is not represented.
if html.count('id="promoSection"') != 1:
    sys.exit("ERREUR : il doit rester un seul widget de promotions. Aucun fichier n'a été écrit.")
if 'class="btn small ghost hidden" id="adminBtn"' not in html:
    sys.exit("ERREUR : accès admin non masqué par défaut. Aucun fichier n'a été écrit.")
if 'id="footerAdminSection" class="hidden"' not in html:
    sys.exit("ERREUR : colonne admin du pied de page non masquée. Aucun fichier n'a été écrit.")
if '<div class="product-desc">${esc(p.desc)}</div>' in app:
    sys.exit("ERREUR : une description reste dans la carte catalogue. Aucun fichier n'a été écrit.")
if 'promo-enter-from-left' not in css or 'class="promo-card promo-slide-in"' not in app:
    sys.exit("ERREUR : animation du carrousel absente. Aucun fichier n'a été écrit.")

# Write only after all transformation and integrity checks succeeded.
for name, content in (("app.js", app), ("index.html", html), ("styles.css", css)):
    (root / name).write_text(content, encoding="utf-8")

# Validate JavaScript syntax when Node.js is available; roll back if validation fails.
try:
    checked = subprocess.run(["node", "--check", "app.js"], text=True, capture_output=True)
    if checked.returncode:
        for name, content in original.items():
            (root / name).write_text(content, encoding="utf-8")
        sys.exit("ERREUR de syntaxe JavaScript : les trois fichiers ont été restaurés.\n" + checked.stderr)
    print("Vérification JavaScript : OK")
except FileNotFoundError:
    print("Node.js introuvable : vérification syntaxique automatique ignorée.")

print("Redesign appliqué aux trois fichiers : app.js, index.html, styles.css")
print("- Promotions compactes intégrées au bloc d'accueil, animation entrant depuis la gauche vers la droite.")
print("- Description supprimée des cartes catalogue; elle reste dans Détails.")
print("- Accès Gestion et colonne admin masqués aux visiteurs et clients; visibles uniquement pour les administrateurs connectés.")
print("Étape suivante : examine `git diff`, puis commit et push pour publier.")
