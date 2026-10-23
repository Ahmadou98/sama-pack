#!/usr/bin/env python3
"""Nettoyage UI SAMA-PACK. À exécuter depuis la racine du dépôt GitHub Codespaces.

Ne modifie ni la base de données, ni les packs, ni les fonctions de paiement/authentification.
Crée des sauvegardes locales hors du dépôt avant d'écrire les fichiers.
"""
from pathlib import Path
from datetime import datetime
import re
import tempfile
import sys

ROOT = Path.cwd()
REQUIRED = ["index.html", "produits.html", "outils.html", "app.js", "styles.css"]
missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
if missing:
    sys.exit("ERREUR : lance ce script depuis la racine du dépôt sama-pack. Fichiers manquants : " + ", ".join(missing))

backup_dir = Path(tempfile.mkdtemp(prefix="samapack-cleanup-backup-"))
originals = {name: (ROOT / name).read_text(encoding="utf-8") for name in REQUIRED}


def replace_regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    matches = list(re.finditer(pattern, source, flags=re.S))
    if len(matches) != 1:
        raise ValueError(f"{label} : {len(matches)} occurrence(s), une seule attendue. Aucun fichier n'a été écrit.")
    return source[:matches[0].start()] + replacement + source[matches[0].end():]


def replace_if_present(source: str, old: str, new: str, marker: str, label: str) -> str:
    if old in source:
        return source.replace(old, new, 1)
    if marker in source:
        return source
    raise ValueError(f"Texte attendu introuvable ({label}). Aucun fichier n'a été écrit.")


def mobile_nav(kind: str) -> str:
    packs = "#catalogue" if kind == "index" else "index.html#catalogue"
    return f'''<nav class="mobile-bottom-nav" aria-label="Navigation rapide">
  <a href="{packs}" class="mobile-nav-item"><span aria-hidden="true">▦</span><small>Packs</small></a>
  <a href="produits.html" class="mobile-nav-item"><span aria-hidden="true">◫</span><small>Produits</small></a>
  <a href="comment-ca-marche.html" class="mobile-nav-item"><span aria-hidden="true">ⓘ</span><small>Aide</small></a>
  <button type="button" class="mobile-nav-item" data-mobile-action="cart"><span aria-hidden="true">🛒</span><small>Panier</small></button>
  <button type="button" class="mobile-nav-item" data-mobile-action="account"><span aria-hidden="true">♙</span><small>Compte</small></button>
</nav>'''


def rewrite_nav(source: str, kind: str) -> str:
    source = source.replace('      <a href="outils.html">Outils</a>\n', '')
    source = source.replace('      <a href="#how">Comment ça marche</a>', '      <a href="comment-ca-marche.html">Comment ça marche</a>')
    source = source.replace('      <a href="index.html#how">Comment ça marche</a>', '      <a href="comment-ca-marche.html">Comment ça marche</a>')
    source = source.replace('<a href="#catalogue">Catalogue</a><a href="#b2b">Professionnels</a><a href="#contact">Contact</a>',
        '<a href="#catalogue">Catalogue</a><a href="comment-ca-marche.html">Comment ça marche</a><a href="#b2b">Professionnels</a><a href="#contact">Contact</a>')
    source = source.replace('<a href="index.html#catalogue">Catalogue</a><a href="index.html#b2b">Professionnels</a><a href="index.html#contact">Contact</a>',
        '<a href="index.html#catalogue">Catalogue</a><a href="comment-ca-marche.html">Comment ça marche</a><a href="index.html#b2b">Professionnels</a><a href="index.html#contact">Contact</a>')
    return replace_regex_once(source, r'<nav class="mobile-bottom-nav" aria-label="Navigation rapide">.*?</nav>', mobile_nav(kind), f"navigation mobile {kind}")

# Homepage: move the explanation into a standalone guide page and retain a small teaser.
index_new = rewrite_nav(originals["index.html"], "index")
if re.search(r'<section id="how" class="section alt">.*?</section>', index_new, flags=re.S):
    index_new = replace_regex_once(index_new, r'<section id="how" class="section alt">.*?</section>', '''<section class="section alt">
  <div class="wrap how-teaser">
    <div><div class="eyebrow">PARCOURS CLIENT</div><h2>Commander en toute simplicité.</h2>
      <p>Découvrez comment choisir vos articles, confirmer votre commande, effectuer le paiement et suivre son avancement depuis votre compte.</p></div>
    <a class="btn primary" href="comment-ca-marche.html">Voir le guide client</a>
  </div>
</section>''', "aperçu Comment ça marche")
elif 'class="how-teaser"' not in index_new:
    raise ValueError("Section Comment ça marche introuvable. Aucun fichier n’a été écrit.")
index_new = index_new.replace('<h1>Les bons produits de nettoyage, <span>dans un seul pack.</span></h1>', '<h1>Les essentiels du nettoyage, <span>au bon endroit.</span></h1>')
index_new = index_new.replace('<p>Des packs prêts à commander pour la maison, les familles, les commerces, les bureaux et les événements.</p>', '<p>Des solutions de nettoyage et d’hygiène pour la maison et les professionnels, disponibles en packs ou à l’unité.</p>')

# Individual products: concise, customer-oriented wording; packs and their data are left intact.
products_new = rewrite_nav(originals["produits.html"], "products")
products_new = products_new.replace('<div><div class="eyebrow">CATALOGUE INDIVIDUEL</div><h2>Produits de nettoyage</h2>', '<div><div class="eyebrow">À L’UNITÉ</div><h2>Produits de nettoyage</h2>')
products_new = products_new.replace('<p>Les produits de nettoyage vendus à l’unité pour compléter vos packs.</p>', '<p>Choisissez vos produits à l’unité, consultez leurs caractéristiques et vérifiez leur disponibilité avant de les ajouter au panier.</p>')

# Tools page remains functional for the admin, but no longer exposes an empty public catalog.
tools_new = rewrite_nav(originals["outils.html"], "tools")
if re.search(r'<section id="catalogue" class="section individual-catalog-section alt">.*?</section>', tools_new, flags=re.S):
    tools_new = replace_regex_once(tools_new, r'<section id="catalogue" class="section individual-catalog-section alt">.*?</section>', '''<section class="section alt">
  <div class="wrap catalog-unavailable">
    <div class="eyebrow">CATALOGUE</div><h1>Outils de nettoyage</h1>
    <p>Notre sélection d’outils n’est pas encore publiée. En attendant, retrouvez les produits d’entretien disponibles à l’unité ou choisissez un pack prêt à commander.</p>
    <div class="catalog-unavailable-actions"><a class="btn primary" href="produits.html">Voir les produits à l’unité</a><a class="btn ghost" href="index.html#catalogue">Découvrir les packs</a></div>
  </div>
</section>''', "page outils")
elif 'class="catalog-unavailable"' not in tools_new:
    raise ValueError("Section Outils introuvable. Aucun fichier n’a été écrit.")
tools_new = tools_new.replace('<meta name="description" content="Découvrez les outils et matériels de nettoyage disponibles chez SAMA-PACK à Dakar. Consultez le catalogue et commandez en ligne.">', '<meta name="description" content="Découvrez les produits de nettoyage à l’unité et les packs SAMA-PACK à Dakar.">')
tools_new = tools_new.replace('<meta property="og:title" content="SAMA-PACK | Outils et matériels de nettoyage">', '<meta property="og:title" content="SAMA-PACK | Produits de nettoyage à Dakar">')
tools_new = tools_new.replace('<title>SAMA-PACK | Outils et matériels de nettoyage</title>', '<title>SAMA-PACK | Produits de nettoyage à Dakar</title>')

# Replace customer-visible emoji/SKU placeholders; preserve cart, review, checkout, PayTech, and admin logic.
app_new = originals["app.js"]
bottle_helper = r'''function cleaningBottleSvg() {
    return `<svg class="cleaning-bottle-icon" viewBox="0 0 64 80" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 7h16v8l7 7v46a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V27a5 5 0 0 1 5-5h6z" fill="#dcfce7" stroke="#166534" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M24 7h16M27 15h10M18 37h24" fill="none" stroke="#166534" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="21" y="46" width="21" height="14" rx="2" fill="#fff" stroke="#86b99a" stroke-width="1.8"/>
      <path d="M25 51h13M25 55h9" stroke="#86b99a" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }

  '''
if 'function cleaningBottleSvg()' not in app_new:
    if '  function productCard(p) {' not in app_new:
        raise ValueError('Fonction productCard introuvable. Aucun fichier n’a été écrit.')
    app_new = app_new.replace('  function productCard(p) {', '  ' + bottle_helper + 'function productCard(p) {', 1)

new_product_card = r'''  function productCard(p) {
    const path = String(p.image_path || "").trim();
    const hasImage = Boolean(path);
    const src = /^https?:\/\//i.test(path) ? path : path.replace(/^\//, "");
    const photo = hasImage ? `<img class="product-photo" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : "";
    const fallback = `<div class="product-placeholder ${hasImage ? "photo-fallback" : ""}" ${hasImage ? 'style="display:none"' : ""}>${cleaningBottleSvg()}</div>`;
    const out = p.availability_status === "out_of_stock";
    const canAdd = canSellProduct(p);
    const description = p.catalog_type === "product" && p.desc ? `<p class="product-desc">${esc(p.desc)}</p>` : "";
    return `<article class="product-card"><div class="pack-visual ${hasImage ? "has-photo" : ""}">${photo}${fallback}${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body">${availabilityBadgeHtml(p)}<div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div>${description}${renderProductRatingSummary(p.id)}<div class="price-row">${priceDisplayHtml(p)}</div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')" ${canAdd ? "" : "disabled"}>${out ? "Rupture" : canAdd ? "Ajouter" : "Prix à confirmer"}</button></div></div></article>`;
  }

  function openProduct(id) {'''
app_new = replace_regex_once(app_new, r'  function productCard\(p\) \{.*?\n  \}\n\n  function openProduct\(id\) \{', new_product_card, "cartes produits")
new_open_product = r'''  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const path = String(p.image_path || "").trim();
    const src = /^https?:\/\//i.test(path) ? path : path.replace(/^\//, "");
    const photo = path
      ? `<div class="product-detail-image-wrap"><img class="product-photo product-photo-detail" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="product-placeholder" style="display:none">${cleaningBottleSvg()}</div></div>`
      : `<div class="product-detail-placeholder product-placeholder">${cleaningBottleSvg()}</div>`;
    const canAdd = canSellProduct(p);
    showModal(`<div class="modal-head"><div><div class="eyebrow">${esc(p.cat)}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>${photo}<div class="product-detail-meta">${availabilityBadgeHtml(p)}</div><div id="productRatingSummaryDetail">${renderProductRatingSummary(p.id)}</div><p>${esc(p.desc)}</p><ul class="pack-items">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul><div class="price-row">${priceDisplayHtml(p)}<button class="btn primary" ${canAdd ? `onclick="addToCart('${esc(p.id)}');closeModal()"` : "disabled"}>${p.availability_status === "out_of_stock" ? "Rupture de stock" : canAdd ? "Ajouter au panier" : "Prix à confirmer"}</button></div><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="${esc(p.id)}"><p class="review-loading">Chargement des avis…</p></section>`);
    void renderProductReviews(p.id);
  }

  function addToCart(id) {'''
app_new = replace_regex_once(app_new, r'  function openProduct\(id\) \{.*?\n  \}\n\n  function addToCart\(id\) \{', new_open_product, "fiche produit")
app_new = replace_if_present(app_new,
 'grid.innerHTML = arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || \'<div class="empty">Aucun pack trouvé. Essaie une autre recherche.</div>\';',
 'grid.innerHTML = arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || \'<div class="empty">\' + (currentType === "product" ? "Aucun produit ne correspond à votre recherche." : "Aucun pack ne correspond à votre recherche.") + \'</div>\';',
 'currentType === "product" ? "Aucun produit', 'catalogue vide')
app_new = replace_if_present(app_new, 'toast("Pack ajouté au panier.");', 'toast("Article ajouté au panier.");', 'toast("Article ajouté au panier.");', 'confirmation panier')
old_cart_icon = '<div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(getEffectivePrice(p))} / pack</div></div>'
new_cart_icon = '<div class="cart-product-icon">${cleaningBottleSvg()}</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(getEffectivePrice(p))} / ${p.catalog_type === "product" ? "unité" : "pack"}</div></div>'
app_new = replace_if_present(app_new, old_cart_icon, new_cart_icon, 'cart-product-icon', 'icône et libellé du panier')
new_contact = r'''  function updateContact() {
    const n = waNumber();
    const card = document.querySelector(".contact-card");
    const intro = $("contactText");
    if (n) {
      if (card && !$("contactPhone")) card.innerHTML = '<div class="contact-icon">✉</div><div><strong>WhatsApp</strong><p id="contactPhone"></p></div><button class="btn secondary" id="contactWhatsApp">Ouvrir WhatsApp</button>';
      const phone = $("contactPhone"); if (phone) phone.textContent = "+" + n;
      const button = $("contactWhatsApp"); if (button) button.onclick = () => openWA("Bonjour SAMA-PACK, je souhaite avoir plus d’informations sur vos produits.");
      if (intro) intro.textContent = "Notre équipe répond à vos questions sur les produits et les commandes.";
      return;
    }
    if (intro) intro.textContent = "Consultez notre guide client ou envoyez une demande de devis à notre équipe.";
    if (card) card.innerHTML = '<div class="contact-icon">ⓘ</div><div><strong>Besoin d’aide ?</strong><p>Retrouvez les étapes de commande et les réponses aux questions fréquentes.</p></div><a class="btn secondary" href="comment-ca-marche.html">Voir le guide client</a>';
  }

  function applyHomepageBackground() {'''
app_new = replace_regex_once(app_new, r'  function updateContact\(\) \{.*?\n  \}\n  function applyHomepageBackground\(\) \{', new_contact, "contact client")

css_new = originals["styles.css"]
css_marker = "/* Nettoyage SAMA-PACK : interface client claire et fiches produits homogènes */"
if css_marker not in css_new:
    css_new += r'''

/* Nettoyage SAMA-PACK : interface client claire et fiches produits homogènes */
.how-teaser{display:flex;align-items:center;justify-content:space-between;gap:28px}.how-teaser>div{max-width:760px}.how-teaser h2{margin:7px 0 10px}.how-teaser p{margin:0;color:var(--muted);font-size:15px;line-height:1.7}.how-teaser>.btn{flex-shrink:0}
.product-card .product-desc{font-size:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;min-height:0}.product-placeholder{width:100%;min-height:165px;display:grid;place-items:center;background:linear-gradient(135deg,#f0fdf4,#fff)}.product-placeholder .cleaning-bottle-icon{width:66px;height:84px;display:block}.product-card .pack-visual.has-photo .product-placeholder.photo-fallback{height:190px;min-height:190px;padding:0}
.product-detail-image-wrap{position:relative;min-height:220px;display:grid;place-items:center;margin:12px 0 16px;border-radius:14px;overflow:hidden;background:#f8fafc}.product-detail-image-wrap .product-photo-detail{width:100%;height:auto;min-height:220px;max-height:300px;object-fit:contain;margin:0;padding:12px}.product-detail-image-wrap .product-placeholder{position:absolute;inset:0;height:100%;min-height:220px}.product-detail-placeholder{margin:12px 0 16px;border-radius:14px;overflow:hidden}.product-detail-placeholder.product-placeholder{min-height:220px}.product-detail-placeholder .cleaning-bottle-icon{width:82px;height:108px}
.cart-product-icon{width:42px;height:46px;flex:0 0 42px;display:grid;place-items:center;background:#ecfdf5;border-radius:12px}.cart-product-icon .cleaning-bottle-icon{width:22px;height:31px}
.catalog-unavailable{min-height:48vh;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:14px}.catalog-unavailable h1{font-size:clamp(32px,4vw,48px);margin:0;line-height:1.08}.catalog-unavailable p{max-width:660px;margin:0;color:var(--muted);font-size:16px;line-height:1.75}.catalog-unavailable-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
@media(max-width:700px){.how-teaser{align-items:stretch;flex-direction:column;gap:18px}.how-teaser>.btn{width:100%}.catalog-unavailable{min-height:55vh}.catalog-unavailable-actions{width:100%;flex-direction:column}.catalog-unavailable-actions .btn{width:100%}}
'''

# All four graphics are private-data-free visual previews of actual customer-facing sections.
def svg_frame(title: str, content: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 660" role="img" aria-labelledby="title"><title id="title">{title}</title>
<rect width="1200" height="660" rx="24" fill="#edf4ef"/><rect x="24" y="24" width="1152" height="612" rx="20" fill="#fff" stroke="#dbe5dd" stroke-width="2"/>
<rect x="24" y="24" width="1152" height="74" rx="20" fill="#fff"/><text x="58" y="65" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#166534">SAMA-PACK</text><text x="58" y="85" font-family="Arial,sans-serif" font-size="10" letter-spacing="2" fill="#64746a">NETTOYAGE ET HYGIÈNE</text><text x="650" y="67" font-family="Arial,sans-serif" font-size="15" fill="#475569">Packs</text><text x="725" y="67" font-family="Arial,sans-serif" font-size="15" fill="#475569">Produits</text><text x="820" y="67" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#166534">Aide</text>{content}</svg>'''

bottle = '<rect x="0" y="0" width="92" height="76" rx="13" fill="#dcfce7" stroke="#a7d7b5" stroke-width="2"/><path d="M28 16h34v7l8 8v32a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V31l8-8z" fill="#fff" stroke="#166534" stroke-width="2"/><path d="M31 43h27M31 49h22" stroke="#86b99a" stroke-width="2"/>'
guide_catalog = svg_frame("Aperçu illustratif du catalogue SAMA-PACK", f'''
<rect x="52" y="120" width="1096" height="138" rx="16" fill="#f0fdf4"/><text x="82" y="155" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#166534">LE CATALOGUE</text><text x="82" y="196" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#17251d">Choisissez vos essentiels.</text><text x="82" y="225" font-family="Arial,sans-serif" font-size="15" fill="#475569">Prix, disponibilité et détails sont accessibles sur chaque fiche.</text><text x="55" y="300" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#17251d">Packs à découvrir</text>
<rect x="52" y="322" width="337" height="276" rx="14" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><rect x="52" y="322" width="337" height="119" rx="14" fill="#f4faf5"/><g transform="translate(174 340)">{bottle}</g><text x="72" y="470" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Pack Grand Ménage Mensuel</text><text x="72" y="499" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#166534">18 900 FCFA</text><rect x="72" y="526" width="132" height="42" rx="10" fill="#fff" stroke="#cbd5ce"/><text x="138" y="552" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" fill="#17251d">Détails</text><rect x="214" y="526" width="155" height="42" rx="10" fill="#166534"/><text x="291" y="552" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">Ajouter</text>
<rect x="431" y="322" width="337" height="276" rx="14" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><rect x="431" y="322" width="337" height="119" rx="14" fill="#f4faf5"/><g transform="translate(553 340)">{bottle}</g><text x="451" y="470" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Pack Mini-Ménage Éco</text><text x="451" y="499" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#166534">4 650 FCFA</text><rect x="451" y="526" width="132" height="42" rx="10" fill="#fff" stroke="#cbd5ce"/><text x="517" y="552" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" fill="#17251d">Détails</text><rect x="593" y="526" width="155" height="42" rx="10" fill="#166534"/><text x="670" y="552" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">Ajouter</text>
<rect x="810" y="322" width="337" height="276" rx="14" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><rect x="810" y="322" width="337" height="119" rx="14" fill="#f4faf5"/><g transform="translate(932 340)">{bottle}</g><text x="830" y="470" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Pack Douche et Soin Famille</text><text x="830" y="499" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#166534">13 900 FCFA</text><rect x="830" y="526" width="132" height="42" rx="10" fill="#fff" stroke="#cbd5ce"/><text x="896" y="552" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" fill="#17251d">Détails</text><rect x="972" y="526" width="155" height="42" rx="10" fill="#166534"/><text x="1049" y="552" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">Ajouter</text>''')
guide_cart = svg_frame("Aperçu illustratif du panier SAMA-PACK", f'''
<text x="62" y="142" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#166534">COMMANDE EN LIGNE</text><text x="62" y="182" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#17251d">Votre panier</text><text x="62" y="211" font-family="Arial,sans-serif" font-size="15" fill="#64746a">Vérifiez les quantités avant de continuer.</text>
<rect x="58" y="238" width="640" height="132" rx="14" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><rect x="79" y="260" width="86" height="88" rx="12" fill="#f0fdf4"/><g transform="translate(76 266) scale(.9)">{bottle}</g><text x="188" y="281" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#17251d">Pack Grand Ménage Mensuel</text><text x="188" y="310" font-family="Arial,sans-serif" font-size="16" fill="#166534">18 900 FCFA / pack</text><rect x="188" y="324" width="105" height="29" rx="7" fill="#f8fafc" stroke="#cbd5ce"/><text x="240" y="344" font-family="Arial,sans-serif" font-size="15" text-anchor="middle" fill="#17251d">−  1  +</text>
<rect x="58" y="386" width="640" height="132" rx="14" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><rect x="79" y="408" width="86" height="88" rx="12" fill="#f0fdf4"/><g transform="translate(76 414) scale(.9)">{bottle}</g><text x="188" y="429" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#17251d">Pack Mini-Ménage Éco</text><text x="188" y="458" font-family="Arial,sans-serif" font-size="16" fill="#166534">4 650 FCFA / pack</text><rect x="188" y="472" width="105" height="29" rx="7" fill="#f8fafc" stroke="#cbd5ce"/><text x="240" y="492" font-family="Arial,sans-serif" font-size="15" text-anchor="middle" fill="#17251d">−  1  +</text>
<rect x="730" y="238" width="408" height="280" rx="15" fill="#f8fafc" stroke="#dbe5dd" stroke-width="2"/><text x="761" y="278" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#17251d">Récapitulatif</text><text x="761" y="321" font-family="Arial,sans-serif" font-size="16" fill="#64746a">Sous-total</text><text x="1105" y="321" font-family="Arial,sans-serif" font-size="16" font-weight="700" text-anchor="end" fill="#17251d">23 550 FCFA</text><path d="M761 340h344" stroke="#dbe5dd" stroke-width="2"/><text x="761" y="375" font-family="Arial,sans-serif" font-size="16" fill="#64746a">Livraison</text><text x="1105" y="375" font-family="Arial,sans-serif" font-size="16" font-weight="700" text-anchor="end" fill="#17251d">1 500 FCFA</text><path d="M761 394h344" stroke="#dbe5dd" stroke-width="2"/><text x="761" y="433" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Total estimé</text><text x="1105" y="433" font-family="Arial,sans-serif" font-size="21" font-weight="700" text-anchor="end" fill="#166534">25 050 FCFA</text><rect x="761" y="456" width="344" height="43" rx="10" fill="#166534"/><text x="933" y="483" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">Passer la commande</text><rect x="58" y="551" width="1080" height="50" rx="11" fill="#f0fdf4"/><text x="81" y="582" font-family="Arial,sans-serif" font-size="14" fill="#365b43">Le total définitif est recalculé et validé par le serveur avant de confirmer.</text>''')
guide_payment = svg_frame("Aperçu illustratif du formulaire de paiement", '''
<text x="58" y="141" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#166534">FINALISATION</text><text x="58" y="180" font-family="Arial,sans-serif" font-size="29" font-weight="700" fill="#17251d">Vos informations de livraison</text><rect x="58" y="204" width="565" height="66" rx="10" fill="#fff" stroke="#cbd5ce" stroke-width="2"/><text x="77" y="230" font-family="Arial,sans-serif" font-size="12" fill="#64746a">Nom complet</text><text x="77" y="253" font-family="Arial,sans-serif" font-size="15" fill="#17251d">Votre nom</text><rect x="58" y="283" width="267" height="66" rx="10" fill="#fff" stroke="#cbd5ce" stroke-width="2"/><text x="77" y="309" font-family="Arial,sans-serif" font-size="12" fill="#64746a">Téléphone</text><text x="77" y="332" font-family="Arial,sans-serif" font-size="15" fill="#17251d">Votre numéro</text><rect x="339" y="283" width="284" height="66" rx="10" fill="#fff" stroke="#cbd5ce" stroke-width="2"/><text x="358" y="309" font-family="Arial,sans-serif" font-size="12" fill="#64746a">Zone / quartier</text><text x="358" y="332" font-family="Arial,sans-serif" font-size="15" fill="#17251d">Votre zone</text><rect x="58" y="362" width="565" height="66" rx="10" fill="#fff" stroke="#cbd5ce" stroke-width="2"/><text x="77" y="388" font-family="Arial,sans-serif" font-size="12" fill="#64746a">Adresse de livraison</text><text x="77" y="411" font-family="Arial,sans-serif" font-size="15" fill="#17251d">Rue, repère ou indication utile</text>
<text x="670" y="180" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#17251d">Choisissez le paiement</text><rect x="666" y="204" width="468" height="112" rx="13" fill="#f0fdf4" stroke="#166534" stroke-width="2"/><circle cx="696" cy="237" r="10" fill="#166534"/><circle cx="696" cy="237" r="4" fill="#fff"/><text x="720" y="240" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Payer maintenant</text><text x="720" y="269" font-family="Arial,sans-serif" font-size="14" fill="#475569">Régler le montant total sur la page</text><text x="720" y="290" font-family="Arial,sans-serif" font-size="14" fill="#475569">sécurisée du prestataire.</text><rect x="666" y="331" width="468" height="112" rx="13" fill="#fff" stroke="#dbe5dd" stroke-width="2"/><circle cx="696" cy="364" r="10" fill="#fff" stroke="#64746a" stroke-width="2"/><text x="720" y="367" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#17251d">Payer plus tard</text><text x="720" y="396" font-family="Arial,sans-serif" font-size="14" fill="#475569">Payer la livraison en ligne, puis le solde</text><text x="720" y="417" font-family="Arial,sans-serif" font-size="14" fill="#475569">des articles à la livraison.</text><rect x="666" y="458" width="468" height="51" rx="10" fill="#166534"/><text x="900" y="490" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">Continuer vers le paiement sécurisé</text><rect x="58" y="536" width="1076" height="65" rx="11" fill="#f8fafc" stroke="#dbe5dd"/><text x="80" y="562" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#166534">Paiement vérifié</text><text x="80" y="585" font-family="Arial,sans-serif" font-size="14" fill="#475569">La commande est mise à jour après confirmation du prestataire, pas simplement au retour.</text>''')
guide_tracking = svg_frame("Aperçu illustratif du suivi de commande", '''
<text x="58" y="143" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#166534">MON COMPTE</text><text x="58" y="182" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#17251d">Mes commandes</text><text x="58" y="210" font-family="Arial,sans-serif" font-size="15" fill="#64746a">Consultez le statut de vos commandes et le suivi des paiements.</text><rect x="56" y="236" width="1085" height="59" rx="9" fill="#f8fafc"/><text x="79" y="271" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#475569">COMMANDE</text><text x="303" y="271" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#475569">DATE</text><text x="475" y="271" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#475569">TOTAL</text><text x="636" y="271" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#475569">PAIEMENT</text><text x="811" y="271" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#475569">STATUT</text><path d="M56 295h1085" stroke="#dbe5dd" stroke-width="2"/><text x="79" y="343" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#17251d">CMD-EXEMPLE</text><text x="303" y="343" font-family="Arial,sans-serif" font-size="15" fill="#475569">Date de commande</text><text x="475" y="343" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#17251d">25 050 FCFA</text><text x="636" y="343" font-family="Arial,sans-serif" font-size="15" fill="#475569">Payé</text><rect x="811" y="320" width="140" height="32" rx="16" fill="#dcfce7"/><text x="881" y="341" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#166534">En préparation</text><rect x="965" y="315" width="148" height="40" rx="9" fill="#fff" stroke="#cbd5ce"/><text x="1039" y="340" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" fill="#17251d">Voir / reçu</text><rect x="56" y="402" width="1085" height="118" rx="14" fill="#f0fdf4"/><text x="83" y="443" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#166534">Retrouvez les informations de votre commande</text><text x="83" y="473" font-family="Arial,sans-serif" font-size="15" fill="#475569">Connectez-vous avec la même adresse e-mail pour consulter</text><text x="83" y="497" font-family="Arial,sans-serif" font-size="15" fill="#475569">l’évolution, le montant payé et le solde éventuel.</text><rect x="56" y="541" width="1085" height="57" rx="11" fill="#fff" stroke="#dbe5dd"/><circle cx="84" cy="570" r="10" fill="#dcfce7" stroke="#166534" stroke-width="2"/><path d="M79 570l4 4 7-8" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="108" y="575" font-family="Arial,sans-serif" font-size="14" fill="#475569">Exemple visuel uniquement : aucune donnée réelle de client n’est affichée.</text>''')

# Standalone client guide with four explanatory visuals and accurate payment/order guidance.
guide_html = r'''<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#166534">
<meta name="description" content="Guide SAMA-PACK : choisir un produit, commander en ligne, payer et suivre sa commande à Dakar."><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="https://sama-pack.store/comment-ca-marche.html"><meta property="og:type" content="website"><meta property="og:site_name" content="SAMA-PACK"><meta property="og:title" content="Comment commander sur SAMA-PACK"><meta property="og:description" content="Les étapes pour choisir vos produits, commander, payer et suivre votre livraison."><meta property="og:url" content="https://sama-pack.store/comment-ca-marche.html">
<title>Comment ça marche ? | SAMA-PACK</title><link rel="stylesheet" href="styles.css">
<style>
.guide-hero{padding:58px 0 50px;background:radial-gradient(circle at 90% 5%,#d6f2de 0,transparent 32%),linear-gradient(135deg,#f8fafc 0,#fff 55%,#f0fdf4 100%)}.guide-hero-inner{max-width:900px}.guide-hero h1{font-size:clamp(34px,5vw,58px);line-height:1.05;letter-spacing:-.04em;margin:12px 0 16px}.guide-hero p{max-width:780px;color:#475569;font-size:17px;line-height:1.7;margin:0}.guide-points{display:flex;gap:10px;flex-wrap:wrap;margin-top:25px}.guide-pill{border:1px solid #dbe5dd;background:#fff;border-radius:999px;padding:9px 13px;color:#166534;font-size:13px;font-weight:700}
.guide-content{padding:56px 0 72px}.guide-intro{max-width:800px;margin:0 auto 32px;text-align:center}.guide-intro h2{font-size:clamp(27px,3.4vw,38px);margin:0 0 10px;letter-spacing:-.035em}.guide-intro p{color:#64746a;font-size:15px;line-height:1.7;margin:0}.guide-step{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:34px;align-items:center;margin:0 0 34px;padding:26px;border:1px solid #e1e9e3;border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.035)}.guide-step:nth-of-type(even){grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)}.guide-step:nth-of-type(even) .guide-copy{order:2}.guide-step:nth-of-type(even) figure{order:1}.guide-step-number{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:13px;background:#dcfce7;color:#166534;font-size:15px;font-weight:900}.guide-copy h2{font-size:clamp(24px,3vw,32px);line-height:1.18;letter-spacing:-.03em;margin:14px 0 12px}.guide-copy p{color:#475569;font-size:15px;line-height:1.75;margin:0 0 12px}.guide-copy ul{padding-left:20px;margin:12px 0 0;color:#475569;font-size:14px;line-height:1.8}.guide-step figure{margin:0;min-width:0}.guide-step figure img{display:block;width:100%;height:auto;border:1px solid #dbe5dd;border-radius:14px;box-shadow:0 10px 25px rgba(22,101,52,.08)}.guide-step figcaption{margin:9px 2px 0;color:#64746a;font-size:11px;line-height:1.5}.guide-note{background:#f0fdf4;border:1px solid #dbe5dd;border-radius:14px;padding:14px 16px;margin-top:16px;color:#365b43;font-size:13px;line-height:1.65}
.guide-faq{background:#f8fafc;padding:58px 0}.guide-faq h2{text-align:center;font-size:clamp(27px,3.5vw,38px);letter-spacing:-.03em;margin:0 0 24px}.guide-faq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.guide-faq details{padding:18px 20px;background:#fff;border:1px solid #e1e9e3;border-radius:14px}.guide-faq summary{cursor:pointer;font-weight:800;color:#17251d;line-height:1.45}.guide-faq details p{margin:11px 0 0;font-size:14px;line-height:1.7;color:#475569}
.guide-cta{padding:56px 0}.guide-cta-inner{display:flex;align-items:center;justify-content:space-between;gap:24px;background:#f0fdf4;border:1px solid #dbe5dd;border-radius:22px;padding:30px}.guide-cta h2{font-size:clamp(25px,3vw,34px);letter-spacing:-.03em;margin:0 0 8px}.guide-cta p{margin:0;color:#475569;line-height:1.7;font-size:15px}.guide-cta-actions{display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0}.guide-footer{padding:24px 0;background:#fff;border-top:1px solid #e1e9e3}.guide-footer-inner{display:flex;justify-content:space-between;align-items:center;gap:18px;color:#64746a;font-size:12px}.guide-footer nav{display:flex;gap:16px;flex-wrap:wrap}.guide-footer a{color:#166534;text-decoration:none;font-weight:700}.guide-mobile-nav{display:none}
@media(max-width:900px){.guide-step,.guide-step:nth-of-type(even){grid-template-columns:1fr;gap:22px;padding:20px}.guide-step:nth-of-type(even) .guide-copy,.guide-step:nth-of-type(even) figure{order:initial}}
@media(max-width:700px){.guide-hero{padding:38px 0 32px}.guide-hero p{font-size:15px}.guide-content{padding:35px 0 45px}.guide-step{margin-bottom:22px}.guide-copy p{font-size:14px}.guide-faq{padding:42px 0}.guide-faq-grid{grid-template-columns:1fr}.guide-cta{padding:35px 0}.guide-cta-inner{align-items:stretch;flex-direction:column;padding:22px}.guide-cta-actions{flex-direction:column}.guide-cta-actions .btn{width:100%}.guide-footer-inner{flex-direction:column;align-items:flex-start}.guide-mobile-nav{position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:45;width:min(560px,calc(100% - 18px));display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:7px 5px;border:1px solid rgba(220,233,224,.95);border-radius:20px;background:rgba(255,255,255,.96);box-shadow:0 10px 34px rgba(9,49,27,.20);backdrop-filter:blur(18px)}.guide-mobile-nav a{min-width:0;min-height:51px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#475569;text-decoration:none;font-size:18px}.guide-mobile-nav small{font-size:10px;font-weight:700}body.guide-page{padding-bottom:calc(86px + env(safe-area-inset-bottom))}}
</style></head>
<body class="guide-page"><header class="topbar"><div class="wrap nav"><a class="brand" href="index.html#home"><span class="brand-mark">S</span><span>SAMA<span>-PACK</span></span></a><nav class="desktop-nav" aria-label="Navigation principale"><a href="index.html#catalogue">Packs</a><a href="produits.html">Produits</a><a href="comment-ca-marche.html" aria-current="page">Comment ça marche</a><a href="index.html#b2b">Professionnels</a><a href="index.html#contact">Contact</a></nav><div class="nav-actions"><a class="btn small primary" href="index.html#catalogue">Voir le catalogue</a></div></div></header>
<main><section class="guide-hero"><div class="wrap guide-hero-inner"><div class="eyebrow">GUIDE CLIENT SAMA-PACK</div><h1>Votre commande, de la sélection à la livraison.</h1><p>Retrouvez les étapes pour choisir les bons articles, passer commande en ligne, régler votre achat et suivre son avancement depuis votre compte.</p><div class="guide-points"><span class="guide-pill">Catalogue consultable</span><span class="guide-pill">Paiement vérifié</span><span class="guide-pill">Suivi depuis votre compte</span></div></div></section>
<section class="guide-content"><div class="wrap"><div class="guide-intro"><h2>Comment se déroule une commande ?</h2><p>Suivez ces quatre étapes. Les illustrations montrent les principales zones de la boutique sans utiliser de données personnelles.</p></div>
<article class="guide-step"><div class="guide-copy"><span class="guide-step-number">01</span><h2>Choisissez vos packs ou vos produits</h2><p>Parcourez <strong>Packs</strong> pour découvrir nos sélections prêtes à commander ou <strong>Produits</strong> pour acheter des articles à l’unité. Le prix et la disponibilité figurent sur les fiches.</p><ul><li>Utilisez la recherche ou le filtre par catégorie.</li><li>Ouvrez <strong>Détails</strong> pour consulter la description et les caractéristiques.</li><li>Ajoutez au panier les articles disponibles dont le prix est confirmé.</li></ul></div><figure><img src="images/guide-catalogue.svg" alt="Aperçu visuel du catalogue, des prix et des actions Détails et Ajouter"><figcaption>Aperçu illustratif du catalogue : prix, disponibilité et accès aux fiches.</figcaption></figure></article>
<article class="guide-step"><div class="guide-copy"><span class="guide-step-number">02</span><h2>Vérifiez votre panier</h2><p>Le panier récapitule les articles sélectionnés. Ajustez les quantités ou retirez une ligne avant de continuer.</p><ul><li>Vérifiez le nom et le prix de chaque article.</li><li>Le sous-total et les frais de livraison sont affichés dans le récapitulatif.</li><li>Le total définitif est recalculé et validé par le serveur au moment de confirmer la commande.</li></ul></div><figure><img src="images/guide-panier.svg" alt="Aperçu illustratif du panier avec les quantités, le sous-total, les frais de livraison et le total"><figcaption>Aperçu illustratif du panier et du récapitulatif de prix.</figcaption></figure></article>
<article class="guide-step"><div class="guide-copy"><span class="guide-step-number">03</span><h2>Renseignez la livraison et choisissez le paiement</h2><p>Connectez-vous ou créez un compte. Saisissez votre nom, votre téléphone et votre adresse. La zone ou le quartier aide à localiser la livraison ; le créneau horaire est facultatif.</p><ul><li><strong>Payer maintenant :</strong> vous réglez le montant total sur la page sécurisée du prestataire.</li><li><strong>Payer plus tard :</strong> si cette option est proposée, vous réglez les frais de livraison en ligne et le solde des articles à la livraison.</li></ul><div class="guide-note">Le prestataire affiche les moyens de paiement disponibles. La commande n’est pas considérée comme payée sur le seul retour du navigateur : la confirmation est vérifiée côté serveur.</div></div><figure><img src="images/guide-paiement.svg" alt="Aperçu illustratif du formulaire de livraison et des options de paiement"><figcaption>Aperçu illustratif du formulaire de commande et du choix de paiement.</figcaption></figure></article>
<article class="guide-step"><div class="guide-copy"><span class="guide-step-number">04</span><h2>Suivez votre commande depuis votre compte</h2><p>Connectez-vous avec la même adresse e-mail puis ouvrez votre espace client pour consulter vos commandes et leur statut.</p><ul><li>Le statut donne l’avancement, par exemple nouvelle, en préparation ou livrée.</li><li>Les informations de paiement affichent le montant réglé et le solde éventuel.</li><li>Quand un reçu est disponible, l’action correspondante apparaît sur la commande.</li></ul></div><figure><img src="images/guide-suivi.svg" alt="Aperçu illustratif de l’espace client et du suivi de commande"><figcaption>Aperçu illustratif ; les données affichées dans votre compte correspondent à vos propres commandes.</figcaption></figure></article>
</div></section>
<section class="guide-faq"><div class="wrap"><h2>Questions fréquentes</h2><div class="guide-faq-grid"><details><summary>Dois-je créer un compte pour commander ?</summary><p>Oui. Le compte permet de confirmer la commande en ligne, de retrouver l’historique et de consulter l’évolution des commandes.</p></details><details><summary>La commande est-elle confirmée dès que je reviens sur le site ?</summary><p>Pas automatiquement. Le statut est mis à jour après vérification de la transaction par le système de paiement. En cas de doute, consultez le statut dans votre compte.</p></details><details><summary>Que signifie « Payer plus tard » ?</summary><p>Lorsque cette option apparaît, les frais de livraison sont payés en ligne et le solde des articles reste à régler à la livraison. La préparation attend la confirmation du paiement exigé.</p></details><details><summary>Où consulter mes commandes ?</summary><p>Ouvrez « Connexion », connectez-vous avec la même adresse e-mail puis consultez « Mes commandes ».</p></details><details><summary>Dois-je passer par WhatsApp ?</summary><p>Non. Vous pouvez sélectionner les articles et confirmer votre commande directement sur la boutique. Le contact commercial sert à demander un renseignement ou un devis.</p></details><details><summary>Comment obtenir de l’aide pour un achat professionnel ?</summary><p>Utilisez la rubrique « Professionnels » pour envoyer une demande de devis et décrire les besoins de votre structure.</p></details></div></div></section>
<section class="guide-cta"><div class="wrap guide-cta-inner"><div><h2>Prêt à choisir vos articles ?</h2><p>Retrouvez les packs et les produits disponibles dans le catalogue SAMA-PACK.</p></div><div class="guide-cta-actions"><a class="btn primary" href="index.html#catalogue">Voir les packs</a><a class="btn ghost" href="produits.html">Voir les produits</a><a class="btn ghost" href="index.html#b2b">Demander un devis</a></div></div></section></main>
<footer class="guide-footer"><div class="wrap guide-footer-inner"><span>© 2026 SAMA-PACK</span><nav><a href="index.html">Accueil</a><a href="index.html#b2b">Professionnels</a><a href="index.html#contact">Contact</a></nav></div></footer>
<nav class="guide-mobile-nav" aria-label="Navigation rapide"><a href="index.html#catalogue"><span aria-hidden="true">▦</span><small>Packs</small></a><a href="produits.html"><span aria-hidden="true">◫</span><small>Produits</small></a><a href="comment-ca-marche.html"><span aria-hidden="true">ⓘ</span><small>Aide</small></a><a href="index.html#b2b"><span aria-hidden="true">▤</span><small>Devis</small></a><a href="index.html#contact"><span aria-hidden="true">✉</span><small>Contact</small></a></nav></body></html>'''

changes = {
    "index.html": index_new,
    "produits.html": products_new,
    "outils.html": tools_new,
    "app.js": app_new,
    "styles.css": css_new,
    "comment-ca-marche.html": guide_html,
    "images/guide-catalogue.svg": guide_catalog,
    "images/guide-panier.svg": guide_cart,
    "images/guide-paiement.svg": guide_payment,
    "images/guide-suivi.svg": guide_tracking,
}

# Structural checks happen before touching any file.
checks = {
    "index has a dedicated guide link": 'href="comment-ca-marche.html"' in index_new,
    "public nav no longer links to empty tools catalog": 'href="outils.html">Outils' not in index_new,
    "cart and admin remain in homepage": 'id="openCartBtn"' in index_new and 'id="adminPanel"' in index_new,
    "product page retains its catalog type and admin": 'data-catalog-type="product"' in products_new and 'id="adminPanel"' in products_new,
    "tools page retains its admin panel": 'id="adminPanel"' in tools_new,
    "PayTech and order actions retained": 'sama-paytech-checkout' in app_new and 'function retryOrderPayment(orderId)' in app_new and 'function handlePaymentReturn()' in app_new,
    "reviews retained": 'function renderProductReviews(productId)' in app_new and 'productReviewsPanel' in app_new,
    "guide visuals linked": all(f'images/guide-{n}.svg' in guide_html for n in ('catalogue','panier','paiement','suivi')),
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    sys.exit("Vérification préalable échouée : " + "; ".join(failed) + ". Aucun fichier n'a été écrit.")

# Save an external backup then apply all source+asset changes.
for rel in REQUIRED:
    (backup_dir / rel).parent.mkdir(parents=True, exist_ok=True)
    (backup_dir / rel).write_text(originals[rel], encoding="utf-8")
for rel, content in changes.items():
    target = ROOT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")

# Final sanity checks for files that the user will push.
for rel in changes:
    if not (ROOT / rel).is_file() or (ROOT / rel).stat().st_size == 0:
        sys.exit("Écriture incomplète : " + rel)
print("Nettoyage SAMA-PACK appliqué avec succès.")
print("Fichiers modifiés/créés :")
for rel in changes:
    print(f" - {rel}")
print("Vérifications :")
for name, ok in checks.items():
    print(f" - {'OK' if ok else 'ÉCHEC'} — {name}")
print("Sauvegarde de sécurité : " + str(backup_dir))
print("Étape suivante : git add app.js index.html produits.html outils.html styles.css comment-ca-marche.html images/guide-*.svg")
print('Puis : git commit -m "Nettoyer la boutique et documenter le parcours client" && git push')
