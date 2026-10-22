#!/usr/bin/env python3
"""Transforme les catalogues produits/outils SAMA-PACK en deux pages autonomes.

Prérequis : le correctif « prospects et catalogues individuels » doit déjà être
appliqué à index.html, app.js et styles.css. Ce script simule par défaut ;
utiliser --apply pour enregistrer les modifications après les contrôles.
"""
from __future__ import annotations
import argparse
import difflib
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

PAGE_CSS_MARKER = "/* ===== SAMA-PACK separate individual catalog pages ===== */"

PAGE_CSS = r'''

/* ===== SAMA-PACK separate individual catalog pages ===== */
.individual-catalog-section { min-height:calc(100vh - 190px); }
.individual-catalog-section .section-head { align-items:flex-end; }
.individual-catalog-section .section-head > div:first-child p { max-width:560px; margin:8px 0 0; color:var(--muted); font-size:14px; }
.individual-catalog-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
@media (max-width:900px) { .individual-catalog-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:700px) {
  .mobile-bottom-nav { grid-template-columns:repeat(6,minmax(0,1fr)); }
  .mobile-nav-item small { font-size:8px; }
  .individual-catalog-section { min-height:calc(100vh - 150px); padding:34px 0 42px; }
  .individual-catalog-section .section-head { gap:14px; margin-bottom:18px; }
  .individual-catalog-section .section-head > div:first-child p { font-size:12px; line-height:1.5; }
  .individual-catalog-section .controls { width:100%; gap:8px; }
  .individual-catalog-section .controls .input { width:100%; min-width:0; }
  .individual-catalog-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .individual-catalog-grid .product-card { min-width:0; border-radius:14px; }
  .individual-catalog-grid .pack-visual { min-height:112px; padding:8px; }
  .individual-catalog-grid .product-photo { max-height:112px; }
  .individual-catalog-grid .product-body { gap:8px; padding:11px; }
  .individual-catalog-grid .product-name { font-size:13px; line-height:1.3; overflow-wrap:anywhere; }
  .individual-catalog-grid .price { font-size:16px; }
  .individual-catalog-grid .product-actions { display:grid; grid-template-columns:1fr; gap:6px; }
  .individual-catalog-grid .product-actions .btn { width:100%; min-height:36px; padding:8px 5px; font-size:11px; }
}
'''


def replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise ValueError(f"{label}: attendu une occurrence, trouvé {count}.")
    return src.replace(old, new, 1)


def main_content(catalog_type: str) -> str:
    if catalog_type == "product":
        eyebrow = "CATALOGUE INDIVIDUEL"
        title = "Produits de nettoyage"
        description = "Les produits de nettoyage vendus à l’unité pour compléter vos packs."
    else:
        eyebrow = "MATÉRIELS & ACCESSOIRES"
        title = "Outils de nettoyage"
        description = "Les outils et matériels pour l’entretien quotidien."
    return f'''<main>
<section id="catalogue" class="section individual-catalog-section alt">
  <div class="wrap">
    <div class="section-head">
      <div><div class="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>
      <div class="controls">
        <input id="searchBox" class="input" type="search" placeholder="Rechercher un article…" aria-label="Rechercher un article">
        <select id="categoryFilter" class="input" aria-label="Filtrer par catégorie"><option value="all">Toutes les catégories</option></select>
      </div>
    </div>
    <div id="productGrid" class="product-grid individual-catalog-grid"></div>
    <div id="productPagination" class="product-pagination" aria-label="Pagination du catalogue"></div>
  </div>
</section>
</main>'''


def make_catalog_page(shell_html: str, catalog_type: str) -> str:
    page = re.sub(r'<main>[\s\S]*?</main>', main_content(catalog_type), shell_html, count=1)
    if page.count('<main>') != 1 or page.count('id="productGrid"') != 1:
        raise ValueError(f"Structure principale invalide pour la page {catalog_type}.")
    page = replace_once(page, '<body>', f'<body data-catalog-type="{catalog_type}">', f"type de page {catalog_type}")

    if catalog_type == "product":
        title = "SAMA-PACK | Produits de nettoyage à l’unité"
        description = "Achetez vos produits de nettoyage à l’unité avec SAMA-PACK à Dakar. Consultez le catalogue et commandez en ligne."
        canonical = "https://sama-pack.store/produits.html"
    else:
        title = "SAMA-PACK | Outils et matériels de nettoyage"
        description = "Découvrez les outils et matériels de nettoyage disponibles chez SAMA-PACK à Dakar. Consultez le catalogue et commandez en ligne."
        canonical = "https://sama-pack.store/outils.html"

    page = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', page, count=1, flags=re.S)
    page = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{description}">', page, count=1)
    page = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{canonical}">', page, count=1)
    page = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title}">', page, count=1)
    page = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{description}">', page, count=1)
    page = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{canonical}">', page, count=1)

    # Les sections appartenant à l’accueil restent accessibles depuis chaque page.
    for anchor in ("home", "catalogue", "how", "b2b", "contact"):
        page = page.replace(f'href="#{anchor}"', f'href="index.html#{anchor}"')
    page = page.replace('href="#produits"', 'href="produits.html"')
    page = page.replace('href="#outils"', 'href="outils.html"')
    return page


def patch_app_for_pages(app: str) -> str:
    if "function renderIndividualCatalogs()" not in app or "async function renderProspectsAdmin()" not in app:
        raise ValueError(
            "Le correctif précédent (prospection + catalogues individuels) ne semble pas appliqué à app.js. "
            "Applique d’abord ce correctif, puis relance celui-ci."
        )

    if "function getCurrentCatalogType()" not in app:
        app = replace_once(
            app,
            '  function updateCategoryFilter() {',
            '''  function getCurrentCatalogType() {
    const value = document.body?.dataset?.catalogType;
    return value === "product" || value === "tool" ? value : "pack";
  }

  function updateCategoryFilter() {''',
            "détection de la page de catalogue ouverte"
        )

    # Catégories du filtre : packs sur l’accueil, produits ou outils sur leurs pages.
    categories_pattern = re.compile(r'(?m)^\s*const categories = \[\.\.\.new Set\(products\.filter\(p => p\.catalog_type === "(?:pack|product|tool)"[^\n]+\n')
    updated, count = categories_pattern.subn(
        '    const pageType = getCurrentCatalogType();\n'
        '    const categories = [...new Set(products.filter(p => p.catalog_type === pageType && (p.active || isAdmin())).map(p => p.cat).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));\n',
        app, count=1
    )
    if count == 0:
        # The previous patch may already contain the dynamic filter.
        if 'const categories = [...new Set(products.filter(p => p.catalog_type === pageType' not in app:
            raise ValueError("Impossible d’adapter le filtre des catégories à la page ouverte.")
        updated = app
    app = updated

    # The principal grid filters the current page's type; the flash carousel remains packs-only.
    arr_pattern = re.compile(r'(?m)^\s*const arr = products\.filter\(p => p\.active && p\.catalog_type === "(?:pack|product|tool)"[^\n]+\n')
    updated, count = arr_pattern.subn(
        '    const currentType = getCurrentCatalogType();\n'
        '    const arr = products.filter(p => p.active && p.catalog_type === currentType && (c === "all" || p.cat === c) && [p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));\n',
        app, count=1
    )
    if count == 0:
        if 'const arr = products.filter(p => p.active && p.catalog_type === currentType' not in app:
            raise ValueError("Impossible d’adapter la grille d’articles à la page ouverte.")
        updated = app
    app = updated

    if 'function getCurrentCatalogType()' not in app:
        raise ValueError("La détection du type de catalogue n’a pas été ajoutée.")
    if 'catalog_type === "pack" && (c === "all"' in app:
        raise ValueError("Le catalogue principal utilise encore le filtre fixe des packs.")
    return app


def patch_html_and_pages(html: str) -> tuple[str, str, str]:
    if 'data-view="prospects"' not in html or 'data-view="catalogs"' not in html:
        raise ValueError(
            "Le menu d’administration Prospection/Produits & outils n’est pas présent. "
            "Applique d’abord le correctif précédent des fonctionnalités supplémentaires."
        )

    # Main nav: dedicated files, never in-page anchors.
    html = html.replace('href="#produits"', 'href="produits.html"')
    html = html.replace('href="#outils"', 'href="outils.html"')

    # Restore an account shortcut in the mobile nav while giving each catalogue its own destination.
    nav_pattern = re.compile(r'<nav class="mobile-bottom-nav" aria-label="Navigation rapide">[\s\S]*?</nav>')
    nav_match = nav_pattern.search(html)
    if not nav_match:
        raise ValueError("Navigation mobile introuvable.")
    mobile_nav = '''<nav class="mobile-bottom-nav" aria-label="Navigation rapide">
  <a href="#home" class="mobile-nav-item"><span aria-hidden="true">⌂</span><small>Accueil</small></a>
  <a href="#catalogue" class="mobile-nav-item"><span aria-hidden="true">▦</span><small>Packs</small></a>
  <a href="produits.html" class="mobile-nav-item"><span aria-hidden="true">◫</span><small>Produits</small></a>
  <a href="outils.html" class="mobile-nav-item"><span aria-hidden="true">⚒</span><small>Outils</small></a>
  <button type="button" class="mobile-nav-item" data-mobile-action="cart"><span aria-hidden="true">🛒</span><small>Panier</small></button>
  <button type="button" class="mobile-nav-item" data-mobile-action="account"><span aria-hidden="true">♙</span><small>Compte</small></button>
</nav>'''
    html = html[:nav_match.start()] + mobile_nav + html[nav_match.end():]

    # The inline sections are moved into their own documents. If this has already been
    # done once, leave index's main content alone and just regenerate the standalone pages.
    sections_pattern = re.compile(
        r'\s*<section id="produits" class="section individual-catalog-section alt">[\s\S]*?</section>'
        r'\s*<section id="outils" class="section individual-catalog-section">[\s\S]*?</section>\s*',
        re.M
    )
    html, sections_removed = sections_pattern.subn('\n', html, count=1)
    if sections_removed == 0 and ('id="individualProductGrid"' in html or 'id="cleaningToolGrid"' in html):
        raise ValueError("Les sections de catalogues intégrées à l’accueil n’ont pas pu être retirées proprement.")

    if 'id="individualProductGrid"' in html or 'id="cleaningToolGrid"' in html:
        raise ValueError("La page d’accueil contient encore les grilles des catalogues individuels.")
    if '<!-- <div class="hero-card discovery-hero-card">' not in html:
        raise ValueError("Le bloc « Nos packs à découvrir » n’est plus commenté; arrêt par précaution.")

    products_page = make_catalog_page(html, "product")
    tools_page = make_catalog_page(html, "tool")
    if products_page.count('data-catalog-type="product"') != 1 or tools_page.count('data-catalog-type="tool"') != 1:
        raise ValueError("Le type de catalogue n’est pas correctement défini sur les pages créées.")
    return html, products_page, tools_page


def check_js(source: str) -> tuple[bool, str]:
    node = shutil.which("node")
    if not node:
        return True, "Node.js absent : contrôle de syntaxe reporté."
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
        f.write(source)
        name = f.name
    try:
        result = subprocess.run([node, "--check", name], capture_output=True, text=True, timeout=20)
        return result.returncode == 0, (result.stderr or result.stdout).strip()
    finally:
        Path(name).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sépare les catalogues SAMA-PACK en deux pages autonomes.")
    parser.add_argument("--apply", action="store_true", help="écrit les changements après les contrôles")
    parser.add_argument("--directory", default=".", help="racine du dépôt SAMA-PACK")
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    names = ("app.js", "index.html", "styles.css")
    paths = {name: root / name for name in names}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        print("Fichiers manquants :\n" + "\n".join(missing), file=sys.stderr)
        return 2

    originals = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}
    page_names = ("produits.html", "outils.html")
    page_paths = {name: root / name for name in page_names}
    existing_pages = {name: path.read_text(encoding="utf-8") for name, path in page_paths.items() if path.exists()}
    try:
        app_new = patch_app_for_pages(originals["app.js"])
        index_new, products_page, tools_page = patch_html_and_pages(originals["index.html"])
        css_new = originals["styles.css"]
        if "/* ===== SAMA-PACK prospects + individual cleaning catalogues ===== */" not in css_new:
            raise ValueError("Les styles du correctif précédent sont absents de styles.css. Applique d’abord le correctif précédent.")
        if PAGE_CSS_MARKER not in css_new:
            css_new = css_new.rstrip() + PAGE_CSS + "\n"

        updated = {"app.js": app_new, "index.html": index_new, "styles.css": css_new,
                   "produits.html": products_page, "outils.html": tools_page}
        ok, message = check_js(app_new)
        if not ok:
            raise ValueError("Erreur de syntaxe JavaScript :\n" + message)
        for name in page_names:
            page = updated[name]
            if page.count('id="productGrid"') != 1 or 'id="productPagination"' not in page:
                raise ValueError(f"Contrôle structurel échoué pour {name}.")
        if 'id="individualProductGrid"' in index_new or 'id="cleaningToolGrid"' in index_new:
            raise ValueError("Les grilles produits/outils sont encore intégrées à index.html.")
        if 'href="produits.html"' not in index_new or 'href="outils.html"' not in index_new:
            raise ValueError("Les liens de navigation vers les pages individuelles sont absents.")
    except Exception as exc:
        print(f"Contrôle arrêté : {exc}", file=sys.stderr)
        print("Aucun fichier n’a été écrit.", file=sys.stderr)
        return 3

    print("Contrôles réussis :")
    print("  ✓ La page d’accueil garde les packs; les grilles produits/outils sont déplacées")
    print("  ✓ produits.html et outils.html ont chacune leur propre catalogue")
    print("  ✓ Le catalogue affiché est filtré par type de page")
    print("  ✓ La navigation mobile conserve Panier et Compte")
    print("  ✓ Le JavaScript passe le contrôle de syntaxe" if shutil.which("node") else "  ✓ Contrôles structurels terminés (Node.js absent)")
    for name, new_text in updated.items():
        old_text = originals.get(name, existing_pages.get(name, ""))
        diff = list(difflib.unified_diff(old_text.splitlines(), new_text.splitlines(), fromfile=name, tofile=name + ".new", n=1))
        print(f"  {name}: {len(old_text)} -> {len(new_text)} caractères; {len(diff)} lignes de diff")
    if not args.apply:
        print("\nSimulation uniquement; aucun fichier n’a été écrit. Relance avec --apply pour appliquer les changements.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    targets = {**paths, **page_paths}
    backups: list[Path] = []
    try:
        for name, path in targets.items():
            if path.exists():
                backup = path.with_name(path.name + f".bak-{stamp}")
                shutil.copy2(path, backup)
                backups.append(backup)
        for name, path in targets.items():
            path.write_text(updated[name], encoding="utf-8")
    except Exception as exc:
        for name, path in targets.items():
            backup = next((item for item in backups if item.name.startswith(path.name + ".bak-")), None)
            if backup and backup.exists():
                shutil.copy2(backup, path)
        print(f"Erreur d’écriture; restauration tentée : {exc}", file=sys.stderr)
        return 4

    print("\nCorrectif appliqué. Sauvegardes créées :")
    for backup in backups:
        print("  " + backup.name)
    print("\nPublie les fichiers avec : git add index.html produits.html outils.html app.js styles.css")
    print('Puis : git commit -m "Separate product and cleaning-tool catalog pages" && git push')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
