#!/usr/bin/env python3
"""Safely add customer ratings and written reviews to the SAMA-PACK storefront.

The database objects are provisioned separately in the connected Supabase project.
This script patches only app.js and styles.css; run without --apply for a dry run.
"""
from __future__ import annotations
import argparse
import difflib
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

HELPERS = r'''  function renderProductRatingSummary(productId) {
    const stats = productReviewStats[String(productId)];
    const average = Number(stats?.average || 0);
    const count = Number(stats?.count || 0);
    const rounded = Math.max(0, Math.min(5, Math.round(average)));
    const stars = Array.from({ length: 5 }, (_, index) => `<span class="${index < rounded ? "is-filled" : ""}" aria-hidden="true">★</span>`).join("");
    const starHtml = `<span class="rating-stars" aria-label="${count ? average.toFixed(1).replace(".", ",") : "0"} sur 5">${stars}</span>`;
    return `<div class="product-rating-summary ${count ? "has-reviews" : "is-empty"}">${starHtml}${count ? `<strong>${average.toFixed(1).replace(".", ",")}</strong><span>(${count} ${count > 1 ? "avis" : "avis"})</span>` : `<span>Pas encore d’avis</span>`}</div>`;
  }

  async function loadProductReviewStats() {
    if (!client) return;
    const { data, error } = await client.from("product_review_stats")
      .select("product_id,average_rating,review_count");
    if (error) {
      console.warn("Notes des produits indisponibles pour le moment.", error);
      return;
    }
    productReviewStats = Object.create(null);
    (data || []).forEach(row => {
      productReviewStats[String(row.product_id)] = {
        average: Number(row.average_rating) || 0,
        count: Number(row.review_count) || 0
      };
    });
  }

  function productReviewFormHtml(productId, ownReview) {
    if (!currentUser) {
      return `<div class="review-signin-prompt"><p>Connecte-toi à ton compte client pour noter ce pack et partager ton expérience.</p><button type="button" class="btn ghost" onclick="openAccountModal()">Se connecter</button></div>`;
    }
    const selectedRating = Math.max(1, Math.min(5, Number(ownReview?.rating) || 5));
    const stars = [1, 2, 3, 4, 5].map(value => `<button type="button" class="review-star-choice ${value <= selectedRating ? "is-selected" : ""}" data-rating="${value}" aria-label="${value} ${value === 1 ? "étoile" : "étoiles"}" aria-pressed="${value === selectedRating ? "true" : "false"}" onclick="selectReviewRating(this, ${value})">★</button>`).join("");
    return `<div class="review-form-wrap"><h4>${ownReview ? "Modifier votre avis" : "Donner votre avis"}</h4><p class="review-form-hint">Votre prénom sera affiché avec votre commentaire.</p><form id="productReviewForm" data-product-id="${esc(productId)}"><div class="review-rating-field"><span class="review-form-label">Votre note</span><div class="review-star-picker" role="group" aria-label="Choisir une note sur cinq étoiles">${stars}</div><input type="hidden" name="rating" value="${selectedRating}"></div><label class="review-form-label" for="productReviewText">Votre avis</label><textarea id="productReviewText" name="review" class="input review-textarea" required minlength="5" maxlength="1000" placeholder="Qu’avez-vous pensé de ce pack ?" rows="4">${esc(ownReview?.review || "")}</textarea><div class="review-form-footer"><span>5 à 1 000 caractères</span><button type="submit" class="btn primary">${ownReview ? "Mettre à jour mon avis" : "Publier mon avis"}</button></div></form></div>`;
  }

  function selectReviewRating(button, rating) {
    const form = button?.closest("form");
    if (!form) return;
    const input = form.querySelector('input[name="rating"]');
    if (input) input.value = String(rating);
    form.querySelectorAll(".review-star-choice").forEach(star => {
      const value = Number(star.dataset.rating);
      star.classList.toggle("is-selected", value <= rating);
      star.setAttribute("aria-pressed", value === rating ? "true" : "false");
    });
  }

  async function renderProductReviews(productId) {
    const panel = $("productReviewsPanel");
    if (!client || !panel || panel.dataset.productId !== String(productId)) return;
    const viewerId = currentUser?.id || null;
    const { data: rows, error } = await client.from("product_reviews")
      .select("id,product_id,rating,review,display_name,created_at")
      .eq("product_id", String(productId))
      .order("created_at", { ascending: false })
      .limit(30);
    if (!panel.isConnected || panel.dataset.productId !== String(productId)) return;
    if (error) {
      console.warn("Impossible de charger les avis du produit.", error);
      panel.innerHTML = `<div class="review-load-error">Les avis ne sont pas disponibles pour le moment. Réessaie un peu plus tard.</div>`;
      return;
    }

    let ownReview = null;
    if (viewerId) {
      const ownResult = await client.from("product_reviews")
        .select("rating,review")
        .eq("product_id", String(productId))
        .eq("user_id", viewerId)
        .maybeSingle();
      if (!ownResult.error) ownReview = ownResult.data || null;
      else console.warn("Impossible de charger l’avis du client.", ownResult.error);
    }
    if (!panel.isConnected || panel.dataset.productId !== String(productId)) return;
    if (viewerId !== (currentUser?.id || null)) ownReview = null;

    // Fallback for rendering this product if the aggregate view is temporarily unavailable.
    if (!productReviewStats[String(productId)] && rows?.length) {
      productReviewStats[String(productId)] = {
        average: rows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / rows.length,
        count: rows.length
      };
    }
    const reviewItems = (rows || []).map(row => `<article class="product-review-item"><div class="product-review-item-head"><strong>${esc(row.display_name || "Client")}</strong><time datetime="${esc(row.created_at || "")}">${esc(fmtDate(row.created_at))}</time></div><div class="review-item-rating" aria-label="Note : ${Number(row.rating)} sur 5">${Array.from({ length: 5 }, (_, index) => `<span class="${index < Number(row.rating) ? "is-filled" : ""}" aria-hidden="true">★</span>`).join("")}</div><p>${esc(row.review)}</p></article>`).join("");
    const stats = productReviewStats[String(productId)];
    const summary = stats?.count ? `${stats.count} ${stats.count > 1 ? "avis" : "avis"}` : `${(rows || []).length} avis`;
    panel.innerHTML = `<div class="product-review-section-head"><h3>Avis clients</h3><span>${esc(summary)}</span></div>${productReviewFormHtml(productId, ownReview)}<div class="product-review-list">${reviewItems || `<p class="review-empty">Pas encore d’avis pour ce pack. Soyez le premier à partager votre expérience.</p>`}</div>`;
    const ratingSummary = $("productRatingSummaryDetail");
    if (ratingSummary) ratingSummary.innerHTML = renderProductRatingSummary(productId);

    const form = panel.querySelector("#productReviewForm");
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      if (!currentUser) {
        toast("Connecte-toi pour publier un avis.", true);
        openAccountModal();
        return;
      }
      const formData = new FormData(form);
      const rating = Number(formData.get("rating"));
      const review = String(formData.get("review") || "").trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast("Choisis une note de 1 à 5 étoiles.", true);
      if (review.length < 5 || review.length > 1000) return toast("L’avis doit contenir entre 5 et 1 000 caractères.", true);
      const userId = currentUser.id;
      setBusy(form, true, "Publication…");
      try {
        const { error: saveError } = await client.from("product_reviews").upsert({
          product_id: String(productId), user_id: userId, rating, review
        }, { onConflict: "product_id,user_id" });
        if (saveError) {
          toast(errorMessage(saveError), true);
          return;
        }
        toast("Merci ! Ton avis a bien été enregistré.");
        await loadProductReviewStats();
        renderProducts();
        const detailSummary = $("productRatingSummaryDetail");
        if (detailSummary) detailSummary.innerHTML = renderProductRatingSummary(productId);
        await renderProductReviews(productId);
      } catch (saveError) {
        toast(errorMessage(saveError), true);
      } finally {
        if (form.isConnected) setBusy(form, false);
      }
    };
  }

'''

PRODUCT_SECTION = r'''  function productCard(p) {
    const photo = p.image_path ? `<img class="product-photo" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    return `<article class="product-card"><div class="pack-visual ${p.image_path ? "has-photo" : ""}">${photo}<div class="pack-box ${p.image_path ? "photo-fallback" : ""}" ${p.image_path ? "style=\"display:none\"" : ""}><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div>${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body"><div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div>${renderProductRatingSummary(p.id)}<div class="price-row">${priceDisplayHtml(p)}<span class="small-note">TTC</span></div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')">Ajouter</button></div></div></article>`;
  }
  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const photo = p.image_path ? `<img class="product-photo product-photo-detail" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" onerror="this.style.display='none'">` : `<div class="pack-visual"><div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div></div>`;
    showModal(`<div class="modal-head"><div><div class="eyebrow">${esc(p.cat)}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>${photo}<div id="productRatingSummaryDetail">${renderProductRatingSummary(p.id)}</div><p>${esc(p.desc)}</p><ul class="pack-items">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul><div class="price-row">${priceDisplayHtml(p)}<button class="btn primary" onclick="addToCart('${esc(p.id)}');closeModal()">Ajouter au panier</button></div><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="${esc(p.id)}"><p class="review-loading">Chargement des avis…</p></section>`);
    void renderProductReviews(p.id);
  }
'''

CSS_APPEND = r'''

/* ===== Avis clients et notes produits ===== */
.product-rating-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 16px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.25;
}
.product-rating-summary strong { color: #334155; font-size: 11px; font-weight: 850; }
.rating-stars, .review-item-rating { display: inline-flex; align-items: center; gap: 1px; white-space: nowrap; letter-spacing: .01em; }
.rating-stars { color: #d5dce2; font-size: 14px; line-height: 1; }
.rating-stars .is-filled, .review-item-rating .is-filled { color: #e5a323; }
.product-rating-summary.is-empty { gap: 5px; color: #87939e; }
.product-reviews-panel { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.product-review-section-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
.product-review-section-head h3 { margin: 0; font-size: 21px; letter-spacing: -.035em; }
.product-review-section-head > span { color: var(--muted); font-size: 12px; }
.review-form-wrap { padding: 17px; margin: 0 0 20px; border: 1px solid var(--line); border-radius: 16px; background: #f8fafc; }
.review-form-wrap h4 { margin: 0; font-size: 16px; letter-spacing: -.02em; }
.review-form-hint { margin: 5px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.review-rating-field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
.review-form-label { display: block; margin-bottom: 7px; color: #334155; font-size: 12px; font-weight: 800; }
.review-star-picker { display: flex; align-items: center; gap: 5px; }
.review-star-choice { padding: 0; border: 0; background: transparent; color: #cbd5e1; font-size: 30px; line-height: 1.05; cursor: pointer; transition: color .15s ease; }
.review-star-choice.is-selected { color: #e5a323; }
.review-star-choice:focus-visible { outline: 2px solid #166534; outline-offset: 3px; border-radius: 3px; }
.review-textarea { display: block; width: 100%; min-height: 100px; resize: vertical; padding: 12px; font-size: 14px; line-height: 1.55; }
.review-form-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.review-form-footer > span { color: var(--muted); font-size: 10px; }
.review-form-footer .btn { min-height: 42px; padding: 10px 14px; font-size: 12px; }
.review-signin-prompt { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 15px; margin-bottom: 20px; border: 1px solid var(--line); border-radius: 14px; background: #f8fafc; }
.review-signin-prompt p { flex: 1 1 200px; margin: 0; color: #475569; font-size: 13px; line-height: 1.55; }
.review-signin-prompt .btn { padding: 10px 13px; font-size: 12px; }
.product-review-list { display: grid; gap: 0; }
.product-review-item { padding: 15px 0; border-bottom: 1px solid #edf0f2; }
.product-review-item:first-child { padding-top: 2px; }
.product-review-item:last-child { border-bottom: 0; }
.product-review-item-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.product-review-item-head strong { color: #1e293b; font-size: 13px; font-weight: 850; }
.product-review-item-head time { color: #94a3b8; font-size: 10px; }
.review-item-rating { margin-top: 5px; color: #d5dce2; font-size: 13px; }
.product-review-item p { margin: 7px 0 0; color: #475569; font-size: 13px; line-height: 1.65; white-space: pre-line; overflow-wrap: anywhere; }
.review-empty, .review-loading, .review-load-error { margin: 0; padding: 17px; border-radius: 12px; background: #f8fafc; color: #64748b; font-size: 13px; line-height: 1.6; }
.review-load-error { color: #9f3434; background: #fff7f7; }
@media (max-width: 600px) {
  .product-rating-summary { font-size: 10px; }
  .rating-stars { font-size: 13px; }
  .product-reviews-panel { margin-top: 20px; padding-top: 16px; }
  .product-review-section-head h3 { font-size: 19px; }
  .review-form-wrap { padding: 13px; border-radius: 13px; }
  .review-star-choice { font-size: 32px; }
  .review-form-footer { align-items: stretch; }
  .review-form-footer .btn { width: 100%; }
  .product-review-item-head time { font-size: 10px; }
}
@media (prefers-reduced-motion: reduce) { .review-star-choice { transition: none; } }
'''


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise ValueError(f"{label}: attendu une occurrence, trouvé {count}.")
    return source.replace(old, new, 1)


def patch_app(app: str) -> str:
    if 'function loadProductReviewStats()' in app or 'id="productReviewsPanel"' in app:
        raise ValueError("Des éléments d’avis semblent déjà présents dans app.js; aucune modification effectuée.")
    app = replace_once(app, '  let currentProductPage = 1;\n', '  let currentProductPage = 1;\n  let productReviewStats = Object.create(null);\n', 'cache des notes')
    app = replace_once(
        app,
        '  async function loadPublicData() {\n',
        HELPERS + '  async function loadPublicData() {\n',
        'fonctions avis clients'
    )
    app = replace_once(
        app,
        '    const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active).length);\n',
        '    await loadProductReviewStats();\n    const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active).length);\n',
        'chargement des notes avant le catalogue'
    )
    start = app.find('  function productCard(p) {')
    end = app.find('  function addToCart(id) {', start if start >= 0 else 0)
    if start < 0 or end < 0 or app.find('  function productCard(p) {', start + 1) >= 0:
        raise ValueError('Impossible de délimiter de façon unique les fonctions de la carte produit et de la fiche produit.')
    app = app[:start] + PRODUCT_SECTION + '\n' + app[end:]
    app = replace_once(
        app,
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo});',
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating});',
        'exposition du sélecteur d’étoiles'
    )
    return app


def check_js_syntax(source: str) -> tuple[bool, str]:
    node = shutil.which('node')
    if not node:
        return True, 'Node.js absent : contrôle de syntaxe ignoré (le script recommande node --check après application).'
    with tempfile.NamedTemporaryFile('w', suffix='.js', encoding='utf-8', delete=False) as temp:
        temp.write(source)
        name = temp.name
    try:
        check = subprocess.run([node, '--check', name], capture_output=True, text=True, timeout=20)
        return check.returncode == 0, (check.stderr or check.stdout).strip()
    finally:
        Path(name).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='Ajoute les notes 5 étoiles et les avis aux produits SAMA-PACK.')
    parser.add_argument('--apply', action='store_true', help='écrit les changements après tous les contrôles')
    parser.add_argument('--directory', default='.', help='racine du dépôt SAMA-PACK')
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    paths = {'app.js': root / 'app.js', 'styles.css': root / 'styles.css'}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        print('Fichiers manquants :\n' + '\n'.join(missing), file=sys.stderr)
        return 2
    original = {name: path.read_text(encoding='utf-8') for name, path in paths.items()}
    try:
        updated = {
            'app.js': patch_app(original['app.js']),
            'styles.css': original['styles.css'].rstrip() + CSS_APPEND + '\n'
        }
        if '/* ===== Avis clients et notes produits ===== */' in original['styles.css']:
            raise ValueError('Le style des avis semble déjà présent dans styles.css; aucune modification effectuée.')
        if not all(mark in updated['app.js'] for mark in [
            'function loadProductReviewStats()', 'function renderProductReviews(productId)',
            'id="productReviewsPanel"', 'selectReviewRating', 'renderProductRatingSummary(p.id)'
        ]):
            raise ValueError('Un contrôle après modification a échoué.')
        syntax_ok, syntax_message = check_js_syntax(updated['app.js'])
        if not syntax_ok:
            print('Erreur de syntaxe JavaScript détectée :\n' + syntax_message, file=sys.stderr)
            return 4
    except Exception as exc:
        print(f'Contrôle arrêté : {exc}', file=sys.stderr)
        print('Aucun fichier n’a été écrit.', file=sys.stderr)
        return 3

    print('Contrôles réussis :')
    print('  ✓ Notes et moyenne chargées depuis product_review_stats')
    print('  ✓ Avis affichés dans la fiche produit')
    print('  ✓ Formulaire réservé aux comptes connectés; un avis modifiable par client et par produit')
    print('  ✓ Notes et commentaires échappés avant affichage')
    print('  ✓ Syntaxe JavaScript vérifiée' if shutil.which('node') else '  ✓ Contrôles de structure réussis')
    for name in paths:
        diff = list(difflib.unified_diff(original[name].splitlines(), updated[name].splitlines(), fromfile=name, tofile=name + '.new', n=1))
        print(f'  {name}: {len(original[name])} -> {len(updated[name])} caractères; {len(diff)} lignes de diff')
    if not args.apply:
        print('\nSimulation uniquement. Relance avec --apply pour écrire les deux fichiers.')
        return 0

    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backups = []
    try:
        for name, path in paths.items():
            backup = path.with_name(path.name + f'.bak-{stamp}')
            shutil.copy2(path, backup)
            backups.append(backup)
        for name, path in paths.items():
            path.write_text(updated[name], encoding='utf-8')
    except Exception as exc:
        for name, path in paths.items():
            backup = next((b for b in backups if b.name.startswith(path.name + '.bak-')), None)
            if backup and backup.exists():
                shutil.copy2(backup, path)
        print(f'Erreur d’écriture; restauration tentée : {exc}', file=sys.stderr)
        return 5

    print('\nCorrectif appliqué. Sauvegardes :')
    for backup in backups:
        print('  ' + backup.name)
    print('\nEnsuite, exécute : node --check app.js && git diff --check')
    print('Inspecte git diff, puis publie uniquement app.js et styles.css.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
