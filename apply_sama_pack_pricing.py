#!/usr/bin/env python3
"""Add protected supplier-cost fields and automatic sale-price calculation to SAMA-PACK.

Run from the repository root:
  python apply_sama_pack_pricing.py          # dry run
  python apply_sama_pack_pricing.py --apply  # create backups and modify app.js/styles.css

The Supabase table public.product_costs and its RLS/price trigger have already been
created and tested in the connected SAMA-PACK project. This script only changes the
front-end source; it does not execute SQL or publish any products.
"""
from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: motif attendu une seule fois, trouvé {count}. Aucun fichier n'a été modifié.")
    return source.replace(old, new, 1)


def build_app_patch(src: str) -> tuple[str, list[str]]:
    changes: list[str] = []
    def rep(old: str, new: str, label: str) -> None:
        nonlocal src
        src = replace_once(src, old, new, label)
        changes.append(label)

    helpers = '''  function readProductPricing(formData) {
    const supplierRaw = String(formData.get("supplier_price") ?? "").trim();
    const marginRaw = String(formData.get("margin_percent") ?? "").trim();
    const supplierPrice = supplierRaw === "" ? null : Number(supplierRaw);
    const marginPercent = marginRaw === "" ? null : Number(marginRaw);
    if (supplierPrice !== null && (!Number.isFinite(supplierPrice) || supplierPrice < 0)) return { error: "Le prix fournisseur doit être un nombre positif ou nul." };
    if (marginPercent !== null && (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 1000)) return { error: "La marge doit être comprise entre 0 et 1 000 %." };
    const enteredPrice = String(formData.get("price") ?? "").trim();
    const manualPrice = enteredPrice === "" ? 0 : Number(enteredPrice);
    if (!Number.isFinite(manualPrice) || manualPrice < 0) return { error: "Le prix de vente doit être un nombre positif ou nul." };
    const salePrice = supplierPrice !== null && marginPercent !== null ? Math.round(supplierPrice * (1 + marginPercent / 100)) : manualPrice;
    return { supplierPrice, marginPercent, salePrice };
  }

  async function saveProductPricing(productId, pricing) {
    if (pricing.supplierPrice === null && pricing.marginPercent === null) {
      const { error } = await client.from("product_costs").delete().eq("product_id", String(productId));
      return error || null;
    }
    const { error } = await client.from("product_costs").upsert({
      product_id: String(productId), supplier_price: pricing.supplierPrice,
      margin_percent: pricing.marginPercent, updated_at: new Date().toISOString()
    }, { onConflict: "product_id" });
    return error || null;
  }

  function bindProductPriceCalculator(form) {
    if (!form || form.dataset.priceCalculatorBound === "true") return;
    const supplierField = form.querySelector('[name="supplier_price"]');
    const marginField = form.querySelector('[name="margin_percent"]');
    const saleField = form.querySelector('[name="price"]');
    const feedback = form.querySelector("[data-pricing-feedback]");
    if (!supplierField || !marginField || !saleField) return;
    form.dataset.priceCalculatorBound = "true";
    const recalculate = () => {
      const supplierRaw = String(supplierField.value || "").trim();
      const marginRaw = String(marginField.value || "").trim();
      if (supplierRaw === "" || marginRaw === "") {
        saleField.readOnly = false;
        if (feedback) feedback.textContent = "Renseigne le prix fournisseur et la marge souhaitée pour calculer le prix automatiquement. Tant qu’une valeur manque, tu peux saisir le prix de vente manuellement.";
        return;
      }
      const supplierPrice = Number(supplierRaw);
      const marginPercent = Number(marginRaw);
      if (!Number.isFinite(supplierPrice) || supplierPrice < 0 || !Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 1000) {
        saleField.readOnly = false;
        if (feedback) feedback.textContent = "Vérifie le prix fournisseur et la marge (de 0 à 1 000 %).";
        return;
      }
      const calculated = Math.round(supplierPrice * (1 + marginPercent / 100));
      saleField.value = String(calculated);
      saleField.readOnly = true;
      if (feedback) feedback.textContent = "Prix calculé : " + money(calculated) + " (coût fournisseur " + money(supplierPrice) + " + majoration de " + marginPercent + " %).";
    };
    supplierField.addEventListener("input", recalculate);
    marginField.addEventListener("input", recalculate);
    recalculate();
  }

'''
    rep('  async function renderIndividualCatalogAdmin() {', helpers + '  async function renderIndividualCatalogAdmin() {', "ajout des fonctions de calcul")
    rep(
        '    const editing = editingCatalogItemId ? (rows || []).find(row => row.id === editingCatalogItemId) : null;',
        '''    const { data: costRows, error: costError } = await client.from("product_costs").select("product_id,supplier_price,margin_percent");
    if (costError) {
      host.innerHTML = '<div class="panel"><h3>Catalogue individuel</h3><p>Impossible de charger les prix fournisseurs.</p></div>';
      console.warn("Product costs load failed", costError);
      return toast(errorMessage(costError), true);
    }
    const costsById = new Map((costRows || []).map(row => [row.product_id, row]));
    const catalogRows = (rows || []).map(row => ({ ...row, ...(costsById.get(row.id) || { supplier_price: null, margin_percent: null }) }));
    const editing = editingCatalogItemId ? catalogRows.find(row => row.id === editingCatalogItemId) : null;''',
        "chargement sécurisé des coûts produits")
    rep(
        '      <p class="small-note">Les articles actifs seront visibles dans leur catalogue et pourront être ajoutés au panier. Les packs restent gérés dans « Gestion des packs ».</p>',
        '      <p class="small-note">Les nouveaux articles sont masqués par défaut. Ajoute leur image puis utilise « Publier » quand ils sont prêts. Les packs restent gérés dans « Gestion des packs ».</p>',
        "note de publication manuelle")
    rep(
        r'''<label>Prix de vente (FCFA) *<input class="input" name="price" type="number" required min="0" step="1" value="${Number(current.price || 0)}"></label>''',
        r'''<label>Prix fournisseur / coût d’achat (FCFA)<input class="input" name="supplier_price" type="number" min="0" step="1" value="${current.supplier_price == null ? "" : Number(current.supplier_price)}" placeholder="Coût par unité ou par pack"></label>
         <label>Marge souhaitée / majoration (%)<input class="input" name="margin_percent" type="number" min="0" max="1000" step="0.1" value="${current.margin_percent == null ? "" : Number(current.margin_percent)}" placeholder="Ex. 30"></label>
         <label>Prix de vente calculé (FCFA) *<input class="input selling-price-input" name="price" type="number" required min="0" step="1" value="${Number(current.price || 0)}" ${current.supplier_price != null && current.margin_percent != null ? "readonly" : ""}></label>
         <p class="small-note price-calculation-feedback full" data-pricing-feedback>Renseigne le prix fournisseur et la marge souhaitée pour calculer automatiquement le prix de vente.</p>''',
        "champs prix fournisseur/marge dans Produits et outils")
    rep(
        r'''<label class="catalog-active-check"><input type="checkbox" name="active" ${current.active === false ? "" : "checked"}> Article visible dans le catalogue</label>''',
        r'''<label class="catalog-active-check"><input type="checkbox" name="active" ${editing && current.active ? "checked" : ""}> Article visible dans le catalogue</label>''',
        "nouveaux produits et outils masqués par défaut")
    rep('<th>Article</th><th>Type</th><th>Prix</th><th>Visibilité</th><th>Actions</th>', '<th>Article</th><th>Type</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Visibilité</th><th>Actions</th>', "colonnes du tableau Produits et outils")
    rep(
        r'''<td>${money(row.price)}</td><td>${row.active ? '<span class="status delivered">Visible</span>' : '<span class="status cancelled">Masqué</span>'}</td>''',
        r'''<td>${row.supplier_price == null ? "—" : money(row.supplier_price)}</td><td>${row.margin_percent == null ? "—" : Number(row.margin_percent) + " %"}</td><td>${money(row.price)}</td><td>${row.active ? '<span class="status delivered">Visible</span>' : '<span class="status cancelled">Masqué</span>'}</td>''',
        "valeurs coût et marge dans Produits et outils")
    rep(
        r'''const listHtml = rows?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Article</th><th>Type</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Visibilité</th><th>Actions</th></tr></thead><tbody>${rows.map(row => `''',
        r'''const listHtml = catalogRows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Article</th><th>Type</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Visibilité</th><th>Actions</th></tr></thead><tbody>${catalogRows.map(row => `''',
        "rendu du tableau Produits et outils")
    rep('<h3>Produits et outils enregistrés (${(rows || []).length})</h3>', '<h3>Produits et outils enregistrés (${catalogRows.length})</h3>' , "compteur Produits et outils")
    rep(
        r'''<button class="btn primary" type="submit">${editing ? "Enregistrer l’article" : "Ajouter au catalogue"}</button>''',
        r'''<button class="btn primary" type="submit">${editing ? "Enregistrer l’article" : "Créer l’article masqué"}</button>''',
        "libellé clair pour les nouveaux articles masqués")
    rep(
        '    const form = $("individualCatalogForm");\n    if (!form) return;\n    form.onsubmit = async event => {',
        '    const form = $("individualCatalogForm");\n    if (!form) return;\n    bindProductPriceCalculator(form);\n    form.onsubmit = async event => {',
        "activation du calcul Produits et outils")
    rep(
        '      const price = Number(data.get("price"));\n      if (name.length < 2 || !Number.isFinite(price) || price < 0) return toast("Vérifie le nom et le prix de l’article.", true);',
        '      const pricing = readProductPricing(data);\n      if (name.length < 2) return toast("Le nom de l’article doit contenir au moins 2 caractères.", true);\n      if (pricing.error) return toast(pricing.error, true);\n      const price = pricing.salePrice;',
        "validation du calcul Produits et outils")
    rep(
        r'''      try {
        let result;
        if (editingCatalogItemId) {
          result = await client.from("products").update(payload).eq("id", editingCatalogItemId);
        } else {
          const id = `CAT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          result = await client.from("products").insert({ ...payload, id, promo_active: false, promo_price: null, promo_label: "Offre spéciale" });
        }
        if (result.error) return toast(errorMessage(result.error), true);
        editingCatalogItemId = null;''',
        r'''      try {
        let result;
        let productId;
        if (editingCatalogItemId) {
          productId = editingCatalogItemId;
          result = await client.from("products").update(payload).eq("id", productId);
        } else {
          productId = `CAT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          result = await client.from("products").insert({ ...payload, id: productId, promo_active: false, promo_price: null, promo_label: "Offre spéciale" });
        }
        if (result.error) return toast(errorMessage(result.error), true);
        const pricingError = await saveProductPricing(productId, pricing);
        if (pricingError) return toast("Article enregistré, mais le coût fournisseur ou la marge n’a pas pu être enregistré : " + errorMessage(pricingError), true);
        editingCatalogItemId = null;''',
        "enregistrement sécurisé des coûts Produits et outils")
    rep(
        '    const rows = await readRows("products"); products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop(); renderPromoCarousel();',
        '''    const baseRows = await readRows("products");
    const { data: costRows, error: costError } = await client.from("product_costs").select("product_id,supplier_price,margin_percent");
    if (costError) throw costError;
    const costsById = new Map((costRows || []).map(row => [row.product_id, row]));
    const rows = baseRows.map(row => ({ ...row, ...(costsById.get(row.id) || { supplier_price: null, margin_percent: null }) }));
    products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop(); renderPromoCarousel();''',
        "chargement des coûts protégés pour les packs")
    rep(
        r'''<input class="input" name="price" type="number" min="0" step="1" required placeholder="Prix en FCFA" value="${editing ? Number(editing.price) : ""}">''',
        r'''<label>Prix fournisseur / coût d’achat (FCFA)<input class="input" name="supplier_price" type="number" min="0" step="1" value="${editing?.supplier_price == null ? "" : Number(editing.supplier_price)}" placeholder="Coût total du pack"></label><label>Marge souhaitée / majoration (%)<input class="input" name="margin_percent" type="number" min="0" max="1000" step="0.1" value="${editing?.margin_percent == null ? "" : Number(editing.margin_percent)}" placeholder="Ex. 30"></label><label>Prix de vente calculé (FCFA)<input class="input selling-price-input" name="price" type="number" min="0" step="1" required placeholder="Prix en FCFA" value="${editing ? Number(editing.price) : ""}" ${editing?.supplier_price != null && editing?.margin_percent != null ? "readonly" : ""}></label><p class="small-note price-calculation-feedback full" data-pricing-feedback>Renseigne le coût total du pack et la marge pour calculer le prix de vente automatiquement.</p>''',
        "champs prix fournisseur/marge dans Gestion des packs")
    rep(
        r'''<label class="check-label full"><input type="checkbox" name="active" ${editing?.active===false?"":"checked"}> Publier ce pack dans le catalogue</label>''',
        r'''<label class="check-label full"><input type="checkbox" name="active" ${editing?.active===true?"checked":""}> Publier ce pack dans le catalogue</label>''',
        "nouveaux packs masqués par défaut")
    rep(
        r'''<button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Ajouter le pack"}</button>''',
        r'''<button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Créer le pack masqué"}</button>''',
        "libellé clair pour les nouveaux packs masqués")
    rep('<tr><th>Pack</th><th>Catégorie</th><th>Prix</th><th>Visibilité</th><th>Actions</th></tr>', '<tr><th>Pack</th><th>Catégorie</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Visibilité</th><th>Actions</th></tr>', "colonnes du tableau des packs")
    rep(
        r'''<td>${money(p.price)}</td><td><span class="status ${p.active?"delivered":"cancelled"}">''',
        r'''<td>${p.supplier_price == null ? "—" : money(p.supplier_price)}</td><td>${p.margin_percent == null ? "—" : Number(p.margin_percent) + " %"}</td><td>${money(p.price)}</td><td><span class="status ${p.active?"delivered":"cancelled"}">''',
        "valeurs coût et marge dans le tableau des packs")
    rep('const form = $("packForm"); if (form) form.onsubmit = async e => {', 'const form = $("packForm"); if (form) { bindProductPriceCalculator(form); form.onsubmit = async e => {', "activation du calcul dans le formulaire des packs")
    rep(
        'const fd = new FormData(form); const uploadFile = fd.get("image_file");',
        'const fd = new FormData(form); const pricing = readProductPricing(fd); if (pricing.error) { setBusy(form,false); return toast(pricing.error,true); } const uploadFile = fd.get("image_file");',
        "validation prix fournisseur/marge des packs")
    rep('price:Number(fd.get("price"))', 'price:pricing.salePrice', "prix de vente calculé des packs")
    rep(
        '''        let result;
        if (editingProductId) result = await client.from("products").update(payload).eq("id",editingProductId);
        else result = await client.from("products").insert({id:productId,...payload});
        setBusy(form,false);
        if (result.error) return toast(errorMessage(result.error),true);
        const wasEditing = Boolean(editingProductId); editingProductId = null; toast(wasEditing ? "Pack modifié." : "Nouveau pack ajouté."); await loadPublicData(); await showAdminView("packs");
      };
    }
    if (view === "stock")''',
        '''        let result;
        if (editingProductId) result = await client.from("products").update(payload).eq("id",editingProductId);
        else result = await client.from("products").insert({id:productId,...payload});
        if (result.error) { setBusy(form,false); return toast(errorMessage(result.error),true); }
        const pricingError = await saveProductPricing(productId, pricing);
        setBusy(form,false);
        if (pricingError) return toast("Pack enregistré, mais le coût fournisseur ou la marge n’a pas pu être enregistré : " + errorMessage(pricingError),true);
        const wasEditing = Boolean(editingProductId); editingProductId = null; toast(wasEditing ? "Pack modifié." : "Nouveau pack ajouté."); await loadPublicData(); await showAdminView("packs");
      };
      }
    }
    if (view === "stock")''',
        "enregistrement coût/marge et fermeture du formulaire packs")

    return src, changes


def build_css_patch(src: str) -> tuple[str, str]:
    old = '.catalog-active-check { display: flex !important; align-items: center; gap: 9px !important; color: var(--ink) !important; }\n.catalog-active-check input { width: 16px; height: 16px; accent-color: var(--green); }'
    new = old + '\n.price-calculation-feedback { grid-column: 1 / -1; margin: 0; padding: 10px 12px; border: 1px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; color: #166534; font-size: 12px; line-height: 1.5; }\n.selling-price-input[readonly] { background: #f8fafc; color: #166534; font-weight: 850; cursor: not-allowed; }'
    out = replace_once(src, old, new, "styles du calcul de prix")
    return out, "ajout des styles pour le calcul du prix de vente"


def main() -> int:
    parser = argparse.ArgumentParser(description="Ajoute les champs prix fournisseur et marge à SAMA-PACK.")
    parser.add_argument("--apply", action="store_true", help="Écrit les fichiers après sauvegarde des versions d’origine.")
    parser.add_argument("--root", default=".", help="Racine du dépôt (par défaut: dossier courant).")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    app_path = root / "app.js"
    css_path = root / "styles.css"
    if not app_path.exists() or not css_path.exists():
        print("ERREUR : app.js et styles.css doivent être présents. Lance ce script depuis la racine du dépôt SAMA-PACK.", file=sys.stderr)
        return 2
    app_src = app_path.read_text(encoding="utf-8")
    css_src = css_path.read_text(encoding="utf-8")
    required_markers = ['async function renderIndividualCatalogAdmin()', 'async function adminPacks()', 'function bindAdmin(view)', 'product_costs']
    for marker in required_markers[:3]:
        if marker not in app_src:
            print(f"ERREUR : la version du fichier app.js ne correspond pas au correctif attendu (marqueur absent : {marker}). Aucun fichier n'a été modifié.", file=sys.stderr)
            return 2
    if 'product_costs' in app_src and 'function bindProductPriceCalculator(form)' in app_src:
        print("Le correctif semble déjà appliqué : app.js contient déjà le calculateur de prix. Aucun fichier modifié.")
        return 0
    try:
        new_app, app_changes = build_app_patch(app_src)
        new_css, css_change = build_css_patch(css_src)
    except RuntimeError as exc:
        print(f"ERREUR : {exc}", file=sys.stderr)
        return 2
    # Structural sanity checks before writing.
    if new_app.count('function bindProductPriceCalculator(form)') != 1:
        print("ERREUR : vérification du calculateur échouée. Aucun fichier modifié.", file=sys.stderr)
        return 2
    if new_app.count('client.from("product_costs")') < 3:
        print("ERREUR : vérification des accès aux coûts échouée. Aucun fichier modifié.", file=sys.stderr)
        return 2
    if 'price-calculation-feedback' not in new_css or 'selling-price-input[readonly]' not in new_css:
        print("ERREUR : vérification des styles échouée. Aucun fichier modifié.", file=sys.stderr)
        return 2
    print("Contrôles réussis :")
    for change in app_changes:
        print(f"  - {change}")
    print(f"  - {css_change}")
    if not args.apply:
        print("\nMode simulation : aucun fichier n’a été modifié. Relance avec --apply pour appliquer le correctif.")
        return 0
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    app_backup = app_path.with_name(f"app.js.backup-pricing-{stamp}")
    css_backup = css_path.with_name(f"styles.css.backup-pricing-{stamp}")
    shutil.copy2(app_path, app_backup)
    shutil.copy2(css_path, css_backup)
    app_path.write_text(new_app, encoding="utf-8")
    css_path.write_text(new_css, encoding="utf-8")
    print("\nCorrectif appliqué.")
    print(f"Sauvegardes : {app_backup.name} et {css_backup.name}")
    print("Étapes de vérification à exécuter ensuite : node --check app.js puis git diff --check")
    print("Les nouveaux articles sont masqués par défaut ; ils ne sont pas publiés par ce script.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
