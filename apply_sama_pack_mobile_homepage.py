#!/usr/bin/env python3
"""Apply a mobile-only, app-style homepage refinement to SAMA-PACK.

Default mode is a dry run. Pass --apply to back up styles.css and append the
scoped mobile overrides. index.html and app.js are checked but never modified.
"""
from __future__ import annotations

import argparse
import difflib
import shutil
import sys
from datetime import datetime
from pathlib import Path

MARKER = "/* ===== SAMA-PACK mobile home: compact app-style layout ===== */"
CSS_APPEND = r'''

/* ===== SAMA-PACK mobile home: compact app-style layout ===== */
/* Scoped to phones: desktop composition and other pages stay unchanged. */
@media (max-width: 600px) {
  .topbar { background: rgba(255,255,255,.96); }
  .nav { height: 58px; gap: 8px; }
  .brand { gap: 7px; flex: 0 0 auto; font-size: 14px; }
  .brand-mark { width: 32px; height: 32px; border-radius: 10px; }
  .nav-actions { gap: 5px; flex-shrink: 0; }
  .icon-btn { min-width: 35px; padding: 7px 8px; border-radius: 10px; font-size: 13px; }
  .nav-actions .btn.small { padding: 8px 9px; font-size: 11px; border-radius: 10px; }

  .hero {
    padding: 22px 0 24px;
    overflow: hidden;
  }
  .hero-grid {
    width: min(100% - 28px, 520px);
    max-width: 520px;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  .hero-content { min-width: 0; }
  .hero-content .eyebrow {
    font-size: 9px;
    line-height: 1.3;
    letter-spacing: .12em;
  }
  .hero-content h1 {
    max-width: 15ch;
    margin: 8px 0 9px;
    font-size: clamp(31px, 8.2vw, 38px);
    line-height: 1.03;
    letter-spacing: -.045em;
    text-wrap: balance;
  }
  .hero-content > p {
    max-width: 36ch;
    margin: 0;
    font-size: 13px;
    line-height: 1.48;
  }
  .hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    margin: 15px 0 0;
  }
  .hero-actions .btn {
    min-width: 0;
    min-height: 42px;
    padding: 9px 7px;
    border-radius: 10px;
    font-size: 11px;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
  }
  .hero.has-custom-bg .hero-actions .btn.primary {
    color: #14532d;
    background: #f4fff7;
    border: 1px solid rgba(255,255,255,.7);
  }
  .trust-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    margin-top: 14px;
    padding-top: 11px;
    border-top: 1px solid rgba(100,116,139,.2);
  }
  .trust-row > div {
    min-width: 0;
    align-items: center;
    padding: 0 4px;
    text-align: center;
  }
  .trust-row > div + div { border-left: 1px solid rgba(100,116,139,.2); }
  .trust-row strong { font-size: 18px; line-height: 1.15; }
  .trust-row span { margin-top: 3px; font-size: 9px; line-height: 1.25; }
  .hero.has-custom-bg .trust-row { border-top-color: rgba(255,255,255,.25); }
  .hero.has-custom-bg .trust-row > div + div { border-left-color: rgba(255,255,255,.22); }

  /* Flash offer appears as a compact product module, not a second long page. */
  .hero-promo-panel { width: 100%; max-width: none; min-width: 0; }
  .hero-promo-panel .flash-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 9px;
  }
  .hero-promo-panel .flash-section-header > div:first-child { min-width: 0; }
  .hero-promo-panel .flash-section-header .eyebrow {
    font-size: 8px;
    letter-spacing: .12em;
  }
  .hero-promo-panel .flash-section-header h2 {
    margin: 3px 0 0;
    font-size: 22px;
    line-height: 1.08;
  }
  .hero-promo-panel .flash-section-header p { display: none; }
  .hero-promo-panel .flash-arrows { flex: 0 0 auto; gap: 5px; }
  .hero-promo-panel .flash-arrows .btn {
    width: 31px;
    height: 31px;
    border-radius: 9px;
    font-size: 15px;
  }
  .hero-promo-panel .flash-slide {
    display: grid;
    grid-template-columns: minmax(88px, .36fr) minmax(0, .64fr);
    align-items: stretch;
    min-height: 0;
    border: 1px solid #e2e8e4;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(15,23,42,.08);
  }
  .hero-promo-panel .flash-photo {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: auto;
    padding: 8px;
    background: #f3f7f4;
  }
  .hero-promo-panel .flash-photo .promo-visual,
  .hero-promo-panel .flash-photo .product-image-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: 0;
  }
  .hero-promo-panel .flash-photo .product-photo {
    display: block;
    width: 100%;
    height: 124px;
    max-height: 124px;
    object-fit: contain;
    filter: none;
  }
  .hero-promo-panel .flash-content {
    min-width: 0;
    align-self: stretch;
    gap: 7px;
    margin: 0;
    padding: 10px 10px 11px;
    border: 0;
    border-left: 1px solid #edf1ee;
    border-radius: 0 13px 13px 0;
    color: #0f172a;
    background: #fff;
    box-shadow: none;
  }
  .hero-promo-panel .flash-kickers { display: flex; flex-wrap: wrap; gap: 4px; }
  .hero-promo-panel .flash-badge {
    padding: 4px 6px;
    border-radius: 5px;
    background: #eaf5ed;
    color: #166534;
    font-size: 0;
    line-height: 1.1;
    letter-spacing: .06em;
  }
  .hero-promo-panel .flash-badge::after {
    content: "VENTE FLASH";
    font-size: 8px;
    font-weight: 900;
  }
  .hero-promo-panel .flash-offer-label {
    min-width: 0;
    color: #64748b;
    font-size: 9px;
    line-height: 1.3;
  }
  .hero-promo-panel .flash-copy-main h3 {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    margin: 0;
    color: #0f172a;
    font-size: 15px;
    line-height: 1.17;
    letter-spacing: -.02em;
    overflow-wrap: anywhere;
  }
  .hero-promo-panel .flash-copy-main p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    margin: 4px 0 0;
    color: #64748b;
    font-size: 10px;
    line-height: 1.35;
  }
  .hero-promo-panel .flash-price-row { flex-wrap: wrap; align-items: baseline; gap: 5px 7px; }
  .hero-promo-panel .flash-price-row strong {
    color: #166534;
    font-size: 19px;
    line-height: 1.1;
    letter-spacing: -.035em;
  }
  .hero-promo-panel .flash-price-row del { color: #94a3b8; font-size: 9px; }
  .hero-promo-panel .flash-discount {
    padding: 3px 5px;
    border-radius: 4px;
    background: #eef7ef;
    color: #166534;
    font-size: 8px;
  }
  .hero-promo-panel .flash-countdown {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 5px 6px;
    border: 1px solid #e5eee7;
    border-radius: 7px;
    background: #f7faf7;
  }
  .hero-promo-panel .flash-countdown span { font-size: 6px; letter-spacing: .04em; }
  .hero-promo-panel .flash-countdown strong { font-size: 9px; white-space: nowrap; }
  .hero-promo-panel .flash-countdown.is-open { display: none; }
  .hero-promo-panel .promo-actions {
    display: grid;
    grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
    gap: 5px;
    margin-top: 0;
  }
  .hero-promo-panel .flash-detail-btn,
  .hero-promo-panel .flash-add-btn {
    min-width: 0;
    min-height: 34px;
    padding: 7px 4px;
    border-radius: 7px;
    font-size: 9px;
    line-height: 1.15;
    white-space: normal;
    overflow-wrap: anywhere;
    box-shadow: none;
  }
  .hero-promo-panel .flash-detail-btn { color: #334155; background: #fff; border: 1px solid #dbe4dd; }
  .hero-promo-panel .flash-add-btn { color: #fff; background: #166534; }
  .hero-promo-panel .flash-add-btn:hover { transform: none; background: #14532d; }
  .hero-promo-panel .flash-dots { margin-top: 8px; }
  .hero-promo-panel .flash-dots .promo-dot { width: 6px; height: 6px; }
  .hero-promo-panel .flash-dots .promo-dot.active { width: 18px; }
  .hero-promo-panel .flash-empty {
    min-height: 0;
    display: block;
    padding: 13px;
    border: 1px solid #e2e8e4;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(15,23,42,.07);
  }
  .hero-promo-panel .flash-empty strong { display: block; font-size: 14px; line-height: 1.3; }
  .hero-promo-panel .flash-empty p { display: block; margin: 5px 0 10px; font-size: 11px; line-height: 1.45; }
  .hero-promo-panel .flash-empty .btn { min-height: 38px; padding: 9px 12px; border-radius: 9px; font-size: 11px; }

  /* Lighter, controlled crop so the uploaded photo remains recognizable. */
  .hero.has-custom-bg {
    background-image: linear-gradient(
      180deg,
      rgba(4,27,16,.34) 0%,
      rgba(4,27,16,.46) 44%,
      rgba(4,27,16,.55) 100%
    ), var(--hero-custom-background);
    background-position: center 34%;
    background-size: cover;
  }
  .hero.has-custom-bg .hero-content > p { color: rgba(255,255,255,.94); }
  .hero.has-custom-bg .hero-actions .btn.secondary { background: rgba(255,255,255,.12); }
}

@media (max-width: 380px) {
  .hero-grid { width: calc(100% - 24px); gap: 16px; }
  .hero-content h1 { font-size: 30px; max-width: 14ch; }
  .hero-content > p { font-size: 12px; }
  .hero-actions .btn { padding-inline: 5px; font-size: 10px; }
  .trust-row span { font-size: 8px; }
  .hero-promo-panel .flash-slide { grid-template-columns: minmax(78px, .32fr) minmax(0, .68fr); }
  .hero-promo-panel .flash-photo .product-photo { height: 112px; max-height: 112px; }
  .hero-promo-panel .flash-content { padding: 9px 8px; gap: 6px; }
  .hero-promo-panel .flash-copy-main h3 { font-size: 14px; }
  .hero-promo-panel .flash-copy-main p { display: none; }
  .hero-promo-panel .flash-price-row strong { font-size: 17px; }
  .hero-promo-panel .flash-detail-btn,
  .hero-promo-panel .flash-add-btn { font-size: 8px; padding-inline: 3px; }
}
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Compact the SAMA-PACK homepage on mobile without changing app behavior.")
    parser.add_argument("--apply", action="store_true", help="back up styles.css and append the mobile-only overrides")
    parser.add_argument("--directory", default=".", help="repository root (default: current directory)")
    args = parser.parse_args()

    root = Path(args.directory).resolve()
    html_path = root / "index.html"
    css_path = root / "styles.css"
    app_path = root / "app.js"
    for path in (html_path, css_path, app_path):
        if not path.is_file():
            print(f"Fichier introuvable : {path.name}", file=sys.stderr)
            return 2

    html = html_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")
    if MARKER in css:
        print("Le correctif mobile semble déjà présent. Aucun fichier modifié.", file=sys.stderr)
        return 3

    checks = {
        "la vente flash est bien dans l’accueil": 'id="promoSection" class="flash-section hero-promo-panel' in html,
        "le bloc Nos packs à découvrir reste commenté": '<!-- <div class="hero-card discovery-hero-card">' in html,
        "les styles actuels de la vente flash existent": ".hero-promo-panel .flash-slide" in css,
        "la navigation mobile existe": 'class="mobile-bottom-nav"' in html,
        "le panier, les notifications et la connexion sont conservés": all(x in html for x in ('id="openCartBtn"', 'id="notificationBtn"', 'id="accountBtn"')),
    }
    if not all(checks.values()):
        print("Contrôles arrêtés :", file=sys.stderr)
        for label, ok in checks.items():
            print(f"  {'✓' if ok else '✗'} {label}", file=sys.stderr)
        print("Aucun fichier modifié.", file=sys.stderr)
        return 4

    updated = css.rstrip() + CSS_APPEND + "\n"
    print("Contrôles réussis :")
    for label in checks:
        print(f"  ✓ {label}")
    print(f"styles.css : {len(css):,} → {len(updated):,} caractères")
    diff = difflib.unified_diff(css.splitlines(), updated.splitlines(), fromfile="styles.css", tofile="styles.css (mobile compact)", n=1)
    print(f"Diff calculé : {sum(1 for _ in diff)} lignes")

    if not args.apply:
        print("\nSimulation uniquement : aucun fichier n’a été écrit. Relance avec --apply pour appliquer le correctif.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = css_path.with_name(f"styles.css.bak-{stamp}")
    shutil.copy2(css_path, backup)
    try:
        css_path.write_text(updated, encoding="utf-8")
    except Exception as exc:
        shutil.copy2(backup, css_path)
        print(f"Erreur d’écriture; styles.css restauré depuis la sauvegarde : {exc}", file=sys.stderr)
        return 5

    print(f"\nCorrectif appliqué. Sauvegarde : {backup.name}")
    print("Aucun changement apporté à index.html ou app.js.")
    print("Étape suivante : exécute `git diff --check`, puis vérifie `git diff -- styles.css` avant le commit.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
