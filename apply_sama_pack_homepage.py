#!/usr/bin/env python3
"""Safe, focused SAMA-PACK homepage layout patch.

Run from the repository root:
    python apply_sama_pack_homepage.py          # dry run
    python apply_sama_pack_homepage.py --apply  # write changes + backups

Only index.html and styles.css are changed. app.js is intentionally untouched.
"""
from __future__ import annotations

import argparse
import difflib
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

CSS_MARKER = "/* ===== SAMA-PACK home: simple image-first layout ===== */"

CSS_APPEND = r'''

/* ===== SAMA-PACK home: simple image-first layout ===== */
/* Place the existing flash-sales carousel where the removed discovery panel was. */
.hero-grid {
  grid-template-columns: minmax(0, 1.03fr) minmax(310px, .97fr);
  align-items: center;
  gap: clamp(26px, 4vw, 54px);
}
.hero-content { min-width: 0; }
.hero-promo-panel.flash-section {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  scroll-margin-top: 90px;
}
.hero-promo-panel .wrap {
  width: 100%;
  max-width: none;
  margin: 0;
}
.hero-promo-panel .flash-section-header {
  margin-bottom: 14px;
  align-items: center;
  gap: 12px;
}
.hero-promo-panel .flash-section-header h2 {
  color: var(--ink);
  margin: 0;
  font-size: clamp(25px, 2.7vw, 32px);
  line-height: 1.08;
  letter-spacing: -.04em;
}
.hero-promo-panel .flash-title-mark { display: none; }
.hero-promo-panel .flash-section-header p {
  color: #64748b;
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.5;
}
.hero-promo-panel .flash-arrows { gap: 6px; padding: 0; }
.hero-promo-panel .flash-arrows .btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
  font-size: 17px;
}
.hero-promo-panel .flash-slide {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(226,232,240,.9);
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(15,23,42,.10);
}
.hero-promo-panel .flash-photo {
  min-height: 170px;
  height: 170px;
  padding: 12px 18px;
  background: #f7faf7;
}
.hero-promo-panel .flash-photo::before { display: none; }
.hero-promo-panel .flash-photo .promo-visual,
.hero-promo-panel .flash-photo .product-image-frame {
  min-height: 145px;
  height: 100%;
}
.hero-promo-panel .flash-photo .product-photo {
  width: 100%;
  height: 145px;
  max-height: 145px;
  object-fit: contain;
  filter: none;
}
.hero-promo-panel .flash-content {
  min-width: 0;
  gap: 11px;
  margin: 0;
  padding: 17px 18px 18px;
  border: 0;
  border-top: 1px solid #edf1ee;
  border-radius: 0;
  color: var(--ink);
  background: #fff;
  box-shadow: none;
}
.hero-promo-panel .flash-kickers { gap: 8px; align-items: center; }
.hero-promo-panel .flash-badge {
  padding: 5px 8px;
  border-radius: 6px;
  background: #eaf6ed;
  color: #166534;
  font-size: 9px;
  letter-spacing: .08em;
}
.hero-promo-panel .flash-offer-label { color: #64748b; font-size: 11px; }
.hero-promo-panel .flash-copy-main h3 {
  color: #0f172a;
  margin: 0;
  font-size: clamp(18px, 2vw, 23px);
  line-height: 1.2;
  letter-spacing: -.025em;
}
.hero-promo-panel .flash-copy-main p {
  color: #64748b;
  margin: 7px 0 0;
  font-size: 12px;
  line-height: 1.55;
}
.hero-promo-panel .flash-price-row { gap: 9px; }
.hero-promo-panel .flash-price-row strong {
  color: #166534;
  font-size: clamp(25px, 2.5vw, 31px);
  letter-spacing: -.04em;
}
.hero-promo-panel .flash-price-row del { color: #94a3b8; font-size: 12px; }
.hero-promo-panel .flash-discount {
  padding: 4px 6px;
  border-radius: 5px;
  background: #eef7ef;
  color: #166534;
  font-size: 10px;
}
.hero-promo-panel .flash-countdown {
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid #e5eee7;
  border-radius: 9px;
  background: #f7faf7;
}
.hero-promo-panel .flash-countdown span {
  color: #64748b;
  font-size: 8px;
  letter-spacing: .08em;
}
.hero-promo-panel .flash-countdown strong {
  color: #1e293b;
  font-size: 13px;
}
.hero-promo-panel .flash-countdown.is-open strong { font-size: 12px; }
.hero-promo-panel .promo-actions { display: grid; grid-template-columns: 1fr 1.2fr; gap: 8px; }
.hero-promo-panel .flash-detail-btn,
.hero-promo-panel .flash-add-btn {
  min-width: 0;
  min-height: 41px;
  padding: 9px 8px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 800;
  box-shadow: none;
}
.hero-promo-panel .flash-detail-btn {
  color: #334155;
  background: #fff;
  border: 1px solid #dbe4dd;
}
.hero-promo-panel .flash-add-btn { color: #fff; background: #166534; }
.hero-promo-panel .flash-add-btn:hover { background: #14532d; transform: none; }
.hero-promo-panel .flash-dots { margin-top: 11px; }
.hero-promo-panel .flash-dots .promo-dot { background: #cbd5ce; }
.hero-promo-panel .flash-dots .promo-dot.active { background: #166534; }
.hero-promo-panel .flash-empty {
  min-height: 0;
  display: block;
  padding: 22px;
  border: 1px solid rgba(226,232,240,.95);
  border-radius: 17px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 10px 26px rgba(15,23,42,.08);
}
.hero-promo-panel .flash-empty-icon { display: none; }
.hero-promo-panel .flash-empty strong { font-size: 18px; color: #0f172a; }
.hero-promo-panel .flash-empty p { color: #64748b; margin: 7px 0 15px; font-size: 13px; }

/* The custom image is now the real hero background; the text sits on top. */
.hero.has-custom-bg {
  position: relative;
  isolation: isolate;
  color: #fff;
  background-color: #173d29;
  background-image: linear-gradient(
    100deg,
    rgba(4, 27, 16, .64) 0%,
    rgba(4, 27, 16, .43) 50%,
    rgba(4, 27, 16, .27) 100%
  ), var(--hero-custom-background);
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}
.hero.has-custom-bg .eyebrow { color: #c5f0d1; }
.hero.has-custom-bg h1 { color: #fff; text-shadow: 0 1px 12px rgba(0,0,0,.12); }
.hero.has-custom-bg h1 span { color: #b5edc6; }
.hero.has-custom-bg .hero-content > p { color: rgba(255,255,255,.91); }
.hero.has-custom-bg .trust-row strong { color: #fff; }
.hero.has-custom-bg .trust-row span { color: rgba(255,255,255,.78); }
.hero.has-custom-bg .btn.secondary {
  color: #fff;
  background: rgba(255,255,255,.13);
  border: 1px solid rgba(255,255,255,.62);
}
.hero.has-custom-bg .btn.secondary:hover { background: rgba(255,255,255,.22); }
.hero.has-custom-bg .hero-promo-panel .flash-section-header h2 { color: #fff; }
.hero.has-custom-bg .hero-promo-panel .flash-section-header p { color: rgba(255,255,255,.82); }
.hero.has-custom-bg .hero-promo-panel .flash-arrows .btn {
  color: #fff;
  border-color: rgba(255,255,255,.45);
  background: rgba(255,255,255,.10);
}
.hero.has-custom-bg .hero-promo-panel .flash-arrows .btn:hover { background: rgba(255,255,255,.2); }

@media (max-width: 900px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
    max-width: 780px;
  }
  .hero-promo-panel { max-width: 620px; }
  .hero.has-custom-bg {
    background-image: linear-gradient(
      180deg,
      rgba(4, 27, 16, .43) 0%,
      rgba(4, 27, 16, .57) 52%,
      rgba(4, 27, 16, .62) 100%
    ), var(--hero-custom-background);
    background-position: center 38%;
  }
}
@media (max-width: 600px) {
  .hero { padding: 38px 0 44px; }
  .hero-grid { gap: 26px; }
  h1 { font-size: clamp(36px, 9.5vw, 47px); line-height: 1.02; }
  .hero.has-custom-bg { background-position: center 32%; }
  .hero-content > p { font-size: 15px; line-height: 1.65; }
  .hero-actions { gap: 9px; margin: 21px 0 0; }
  .trust-row { gap: 17px; margin-top: 25px; }
  .trust-row strong { font-size: 21px; }
  .trust-row span { font-size: 10px; }
  .hero-promo-panel .flash-section-header { margin-bottom: 11px; }
  .hero-promo-panel .flash-section-header h2 { font-size: 26px; }
  .hero-promo-panel .flash-section-header p { max-width: 235px; font-size: 12px; }
  .hero-promo-panel .flash-photo { height: 158px; min-height: 158px; }
  .hero-promo-panel .flash-photo .promo-visual,
  .hero-promo-panel .flash-photo .product-image-frame { min-height: 132px; }
  .hero-promo-panel .flash-photo .product-photo { height: 132px; max-height: 132px; }
  .hero-promo-panel .flash-content { padding: 15px; gap: 10px; }
  .hero-promo-panel .flash-copy-main h3 { font-size: 20px; }
  .hero-promo-panel .flash-price-row strong { font-size: 25px; }
  .hero-promo-panel .flash-detail-btn,
  .hero-promo-panel .flash-add-btn { min-height: 42px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-promo-panel .flash-slide,
  .hero-promo-panel .flash-photo img,
  .hero-promo-panel .flash-detail-btn,
  .hero-promo-panel .flash-add-btn { animation: none !important; transition: none !important; }
}
'''


def fail(message: str) -> int:
    print(f"ARRÊT : {message}", file=sys.stderr)
    print("Aucun fichier n’a été écrit.", file=sys.stderr)
    return 2


def transform_html(html: str) -> str:
    opening = '<section id="promoSection" class="flash-section section hidden" aria-label="Vente flash">'
    if html.count(opening) != 1:
        raise ValueError(f"La section Vente flash attendue doit apparaître une seule fois (trouvé : {html.count(opening)}).")
    if 'class="hero-promo-panel' in html:
        raise ValueError("La vente flash semble déjà déplacée dans l’accueil; rien n’a été appliqué.")

    start = html.index(opening)
    end_tag = html.index("</section>", start) + len("</section>")
    promo_block = html[start:end_tag]
    if html.index('<section id="home"') > start or html.index('<section id="catalogue"') < end_tag:
        raise ValueError("La section Vente flash n’est pas à l’emplacement attendu.")

    # Preserve the carousel and every ID used by app.js; only change its layout wrapper.
    promo_block = promo_block.replace(
        'class="flash-section section hidden"',
        'class="flash-section hero-promo-panel hidden"',
        1,
    )
    if 'id="promoCarousel"' not in promo_block or 'id="promoArrows"' not in promo_block or 'id="promoDots"' not in promo_block:
        raise ValueError("Un identifiant du carrousel manque dans la section Vente flash.")

    # Remove the former, full-width placement before Catalogue.
    html = html[:start] + html[end_tag:]

    # Keep the user's commented-out Discovery card untouched and put flash sales after it,
    # as the visible replacement in the existing right-hand hero column.
    comment_pattern = re.compile(
        r'    <!-- <div class="hero-card discovery-hero-card">.*?    </div> -->',
        re.DOTALL,
    )
    comments = list(comment_pattern.finditer(html))
    if len(comments) != 1:
        raise ValueError(f"Le bloc Découvrir nos packs commenté doit rester unique (trouvé : {len(comments)}).")
    insert_at = comments[0].end()
    html = html[:insert_at] + "\n\n    " + promo_block + html[insert_at:]

    # Do not let nested .wrap width calculations exceed the new right column.
    required_ids = [
        'id="openCartBtn"', 'id="notificationBtn"', 'id="accountBtn"',
        'id="heroWhatsApp"', 'id="productGrid"', 'id="searchBox"',
        'id="categoryFilter"', 'id="modalRoot"', 'id="adminPanel"',
        'src="app.js"', 'id="promoSection"', 'id="promoCarousel"',
        'id="promoArrows"', 'id="promoDots"',
    ]
    missing = [item for item in required_ids if item not in html]
    if missing:
        raise ValueError("Des éléments fonctionnels attendus ont disparu : " + ", ".join(missing))
    if html.count('id="promoSection"') != 1:
        raise ValueError("L’identifiant promoSection est dupliqué ou absent.")
    if '<!-- <div class="hero-card discovery-hero-card">' not in html:
        raise ValueError("Le bloc commenté Découvrir nos packs a été altéré; aucun changement ne sera écrit.")
    return html


def transform_css(css: str) -> str:
    if CSS_MARKER in css:
        raise ValueError("Le patch de style semble déjà présent; aucun changement ne sera écrit.")
    if ".hero.has-custom-bg" not in css or ".flash-slide" not in css or ".flash-content" not in css:
        raise ValueError("Les styles de base attendus ne sont pas présents; aucun changement ne sera écrit.")
    return css.rstrip() + CSS_APPEND + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Réorganise l’accueil SAMA-PACK sans toucher aux fonctions JavaScript.")
    parser.add_argument("--apply", action="store_true", help="appliquer les modifications après les contrôles")
    parser.add_argument("--directory", default=".", help="racine du dépôt (par défaut : dossier courant)")
    args = parser.parse_args()

    root = Path(args.directory).resolve()
    paths = {name: root / name for name in ("index.html", "styles.css")}
    missing = [str(p) for p in paths.values() if not p.is_file()]
    if missing:
        return fail("fichiers manquants : " + ", ".join(missing) + ". Place le script à la racine du dépôt.")

    originals = {name: p.read_text(encoding="utf-8") for name, p in paths.items()}
    try:
        updated = {
            "index.html": transform_html(originals["index.html"]),
            "styles.css": transform_css(originals["styles.css"]),
        }
    except Exception as exc:
        return fail(str(exc))

    print("Contrôles réussis :")
    print("  ✓ La section Vente flash remplace visuellement la colonne commentée de l’accueil.")
    print("  ✓ Le bloc ‘Découvrir nos packs’ reste commenté et n’est pas réactivé.")
    print("  ✓ Les identifiants du catalogue, du panier, de la connexion, des notifications et du carrousel sont conservés.")
    print("  ✓ app.js ne sera pas modifié.")
    for name in paths:
        diff = list(difflib.unified_diff(
            originals[name].splitlines(), updated[name].splitlines(),
            fromfile=name, tofile=name + ".new", n=1
        ))
        print(f"  {name}: {len(originals[name])} → {len(updated[name])} caractères; {len(diff)} lignes de diff")

    if not args.apply:
        print("\nSimulation uniquement : aucun fichier n’a été modifié. Relance avec --apply pour appliquer le patch.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backups: list[Path] = []
    try:
        for name, path in paths.items():
            backup = path.with_name(path.name + f".bak-{stamp}")
            shutil.copy2(path, backup)
            backups.append(backup)
        for name, path in paths.items():
            path.write_text(updated[name], encoding="utf-8")
    except Exception as exc:
        # Best-effort rollback if a write fails mid-way.
        for backup in backups:
            original_name = backup.name.split(".bak-")[0]
            shutil.copy2(backup, root / original_name)
        return fail(f"échec d’écriture; restauration tentée : {exc}")

    print("\nPatch appliqué. Sauvegardes :")
    for backup in backups:
        print("  " + backup.name)
    print("\nVérifications à lancer avant publication :")
    print("  git diff --check")
    print("  git diff -- index.html styles.css")
    print("Puis commit et push. Aucun fichier JavaScript n’a été modifié.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
