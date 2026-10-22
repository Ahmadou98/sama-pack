#!/usr/bin/env python3
"""Apply SAMA-PACK catalogue enhancements to app.js and styles.css.

The Supabase schema and SNAD catalogue data were updated separately. This patcher
adds admin supplier linking/search, public SKU and availability badges, and
out-of-stock order guards to the frontend. Dry-run by default; pass --apply to write.
"""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

ROOT = Path.cwd()
APP = ROOT / "app.js"
CSS = ROOT / "styles.css"


def replace_once(text: str, old: str, new: str, label: str, changes: list[str]) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 matching anchor, found {count}")
    changes.append(label)
    return text.replace(old, new, 1)


def replace_function(text: str, function_name: str, next_marker: str, new_block: str,
                     label: str, changes: list[str]) -> str:
    start_pattern = re.compile(r"^  (?:async )?function " + re.escape(function_name) + r"\([^\n]*\) \{", re.M)
    start_match = start_pattern.search(text)
    if not start_match:
        raise RuntimeError(f"{label}: function {function_name} not found")
    end = text.find(next_marker, start_match.end())
    if end < 0:
        raise RuntimeError(f"{label}: end marker for {function_name} not found: {next_marker}")
    # Keep preceding whitespace and replace through the newline before the next function.
    text = text[:start_match.start()] + new_block.rstrip() + "\n\n" + text[end:]
    changes.append(label)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write changes (otherwise only simulate)")
    args = parser.parse_args()

    if not APP.is_file() or not CSS.is_file():
        print("ERREUR : place ce script à la racine du dépôt SAMA-PACK, à côté de app.js et styles.css.")
        return 2

    app = APP.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    original_app, original_css = app, css
    changes: list[str] = []

    # Core model + public UI helpers
    app = replace_once(
        app,
        'return { id: String(p.id), catalog_type: String(p.catalog_type || "pack"), name: String(p.name || "Pack"),',
        'return { id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"), name: String(p.name || "Pack"),',
        "normalize fallback product with SKU and availability", changes)
    app = replace_once(
        app,
        'return { ...p, id: String(p.id), catalog_type: String(p.catalog_type || "pack"),',
        'return { ...p, id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"),',
        "normalize product with SKU and availability", changes)
    app = replace_once(
        app,
        '  function hasPromotion(p) {',
        '''  function publicProductRef(p) { return String(p?.public_ref || p?.id || ""); }
  function availabilityStatusLabel(status) { return status === "out_of_stock" ? "Rupture de stock" : "Disponible"; }
  function availabilityBadgeHtml(p) {
    const out = p?.availability_status === "out_of_stock";
    return `<span class="availability-badge ${out ? "is-out" : "is-available"}">${out ? "Rupture de stock" : "Disponible"}</span>`;
  }
  function canSellProduct(p) { return Boolean(p && p.active && p.availability_status !== "out_of_stock" && Number(p.price) > 0); }

  function hasPromotion(p) {''',
        "add public SKU and availability helpers", changes)
    app = replace_once(
        app,
        '.select("id,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")\n      .order("id", { ascending: true });',
        '.select("id,public_ref,availability_status,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")\n      .order("id", { ascending: true });',
        "load public SKU and availability", changes)
    app = replace_once(
        app,
        '[p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q)',
        '[p.name,p.public_ref,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q)',
        "search public catalogue by SAMA-PACK reference", changes)
    app = replace_once(
        app,
        'const fallback = `<div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div>`;',
        'const fallback = `<div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div>`;',
        "show SAMA-PACK reference in featured pack visuals", changes)
    app = replace_once(
        app,
        """el.innerHTML = tops.map(p => `<div class="mini-pack"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><small>${money(getEffectivePrice(p))}${hasPromotion(p) ? " · Promo" : ""}</small></div></div>`).join("") || '<div class="empty">Les packs seront bientôt disponibles.</div>';""",
        """el.innerHTML = tops.map(p => `<div class="mini-pack"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><small>${esc(publicProductRef(p))} · ${availabilityStatusLabel(p.availability_status)} · ${money(getEffectivePrice(p))}${hasPromotion(p) ? " · Promo" : ""}</small></div></div>`).join("") || '<div class="empty">Les packs seront bientôt disponibles.</div>';""",
        "show public reference and availability on homepage featured packs", changes)
    promo_filter = 'products.filter(p => p.active && p.catalog_type === "pack" && hasPromotion(p))'
    promo_count = app.count(promo_filter)
    if promo_count < 1:
        raise RuntimeError("filter promo: expected at least one match, found 0")
    app = app.replace(promo_filter, 'products.filter(p => p.active && p.catalog_type === "pack" && p.availability_status !== "out_of_stock" && Number(p.price) > 0 && hasPromotion(p))')
    changes.append(f"exclude out-of-stock or unpriced packs from flash sales ({promo_count} places)")

    # Product card and detail window
    card = '''  function productCard(p) {
    const photo = p.image_path ? `<img class="product-photo" src="${esc(/^https?:\\/\\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\\//,""))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    const out = p.availability_status === "out_of_stock";
    const canAdd = canSellProduct(p);
    return `<article class="product-card"><div class="pack-visual ${p.image_path ? "has-photo" : ""}">${photo}<div class="pack-box ${p.image_path ? "photo-fallback" : ""}" ${p.image_path ? "style=\\"display:none\\"" : ""}><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div>${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body">${availabilityBadgeHtml(p)}<div class="product-reference">Réf. SAMA-PACK : <strong>${esc(publicProductRef(p))}</strong></div><div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div>${renderProductRatingSummary(p.id)}<div class="price-row">${priceDisplayHtml(p)}<span class="small-note">TTC</span></div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')" ${canAdd ? "" : "disabled"}>${out ? "Rupture" : canAdd ? "Ajouter" : "Prix à confirmer"}</button></div></div></article>`;
  }
'''
    app = replace_function(app, "productCard", "  function openProduct", card,
                           "show public SKU and availability on product cards", changes)
    detail = '''  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const photo = p.image_path ? `<img class="product-photo product-photo-detail" src="${esc(/^https?:\\/\\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\\//,""))}" alt="${esc(p.name)}" onerror="this.style.display='none'">` : `<div class="pack-visual"><div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div></div>`;
    const canAdd = canSellProduct(p);
    showModal(`<div class="modal-head"><div><div class="eyebrow">${esc(p.cat)}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>${photo}<div class="product-detail-meta"><span class="product-reference">Réf. SAMA-PACK : <strong>${esc(publicProductRef(p))}</strong></span>${availabilityBadgeHtml(p)}</div><div id="productRatingSummaryDetail">${renderProductRatingSummary(p.id)}</div><p>${esc(p.desc)}</p><ul class="pack-items">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul><div class="price-row">${priceDisplayHtml(p)}<button class="btn primary" ${canAdd ? `onclick="addToCart('${esc(p.id)}');closeModal()"` : "disabled"}>${p.availability_status === "out_of_stock" ? "Rupture de stock" : canAdd ? "Ajouter au panier" : "Prix à confirmer"}</button></div><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="${esc(p.id)}"><p class="review-loading">Chargement des avis…</p></section>`);
    void renderProductReviews(p.id);
  }
'''
    app = replace_function(app, "openProduct", "  function addToCart", detail,
                           "show public SKU and availability in product detail", changes)
    app = replace_once(
        app,
        'const p = getP(id); if (!p || !p.active) { toast("Ce pack n’est plus disponible.", true); return; }',
        'const p = getP(id); if (!p || !p.active) { toast("Cet article n’est plus publié.", true); return; } if (p.availability_status === "out_of_stock") { toast("Cet article est en rupture de stock.", true); return; } if (Number(p.price) <= 0) { toast("Le prix de cet article doit être confirmé avant la commande.", true); return; }',
        "block adding out-of-stock or unpriced item to cart", changes)
    app = replace_once(
        app,
        '    if (!cart.length) return toast("Ton panier est vide.", true);\n    if (!currentUser)',
        '    if (!cart.length) return toast("Ton panier est vide.", true);\n    const unavailableLines = cart.filter(line => { const p = getP(line.id); return !canSellProduct(p); });\n    if (unavailableLines.length) return toast("Retire les articles en rupture ou sans prix confirmé du panier avant de commander.", true);\n    if (!currentUser)',
        "prevent checkout of unavailable or unpriced articles", changes)

    # Secure supplier link saving helper
    app = replace_once(
        app,
        '  async function renderIndividualCatalogAdmin() {',
        '''  async function saveProductSupplierLink(productId, formData, currentLink = null) {
    const { data: savedLink, error: savedLinkError } = await client.from("product_supplier_links")
      .select("supplier_id,source_url,research_note").eq("product_id", String(productId)).maybeSingle();
    if (savedLinkError) return savedLinkError;
    const preservedLink = { ...(savedLink || {}), ...(currentLink || {}) };
    const supplierId = String(formData.get("supplier_id") || "").trim() || null;
    const keepSource = Boolean(supplierId && supplierId === (currentLink?.supplier_id || savedLink?.supplier_id));
    const supplierRef = String(formData.get("supplier_ref") || "").trim() || null;
    const cartonRaw = String(formData.get("supplier_carton_price") || "").trim();
    const unitsRaw = String(formData.get("supplier_units_per_carton") || "").trim();
    const cartonPrice = cartonRaw === "" ? null : Number(cartonRaw);
    if (cartonPrice !== null && (!Number.isFinite(cartonPrice) || cartonPrice < 0)) return new Error("Le prix fournisseur par colis doit être positif ou nul.");
    if (!supplierId && !supplierRef && cartonPrice === null && !unitsRaw) {
      const { error } = await client.from("product_supplier_links").delete().eq("product_id", String(productId));
      return error || null;
    }
    const payload = {
      product_id: String(productId), supplier_id: supplierId, supplier_ref: supplierRef,
      carton_price: cartonPrice, units_per_carton: unitsRaw || null,
      source_url: keepSource ? (preservedLink.source_url || null) : null,
      research_note: keepSource ? (preservedLink.research_note || null) : null,
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from("product_supplier_links").upsert(payload, { onConflict: "product_id" });
    return error || null;
  }

  async function renderIndividualCatalogAdmin() {''',
        "add admin-only supplier association helper", changes)

    # Replace complete product/tool manager function
    individual = r'''  async function renderIndividualCatalogAdmin() {
    const host = $("adminContent");
    if (!host || !client || !isAdmin()) return;
    const { data: rows, error } = await client.from("products")
      .select("id,public_ref,availability_status,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")
      .in("catalog_type", ["product", "tool"])
      .order("name", { ascending: true });
    if (error) {
      host.innerHTML = '<div class="panel"><h3>Catalogue individuel</h3><p>Impossible de charger les produits et outils.</p></div>';
      console.warn("Individual catalog load failed", error);
      return toast(errorMessage(error), true);
    }
    const [costResult, linkResult, supplierResult] = await Promise.all([
      client.from("product_costs").select("product_id,supplier_price,margin_percent"),
      client.from("product_supplier_links").select("product_id,supplier_id,supplier_ref,carton_price,units_per_carton,source_url,research_note"),
      client.from("suppliers").select("id,name").order("name", { ascending: true })
    ]);
    const dataError = costResult.error || linkResult.error || supplierResult.error;
    if (dataError) {
      host.innerHTML = '<div class="panel"><h3>Catalogue individuel</h3><p>Impossible de charger les prix ou les fournisseurs associés.</p></div>';
      console.warn("Catalog admin metadata load failed", dataError);
      return toast(errorMessage(dataError), true);
    }
    const costsById = new Map((costResult.data || []).map(row => [row.product_id, row]));
    const suppliers = supplierResult.data || [];
    const supplierById = new Map(suppliers.map(row => [row.id, row]));
    const linksById = new Map((linkResult.data || []).map(row => [row.product_id, row]));
    const catalogRows = (rows || []).map(row => {
      const link = linksById.get(row.id) || {};
      return { ...row, ...(costsById.get(row.id) || { supplier_price: null, margin_percent: null }),
        ...link, supplier_name: supplierById.get(link.supplier_id)?.name || "" };
    });
    const editing = editingCatalogItemId ? catalogRows.find(row => row.id === editingCatalogItemId) : null;
    if (editingCatalogItemId && !editing) {
      editingCatalogItemId = null;
      toast("Cet article n’est pas accessible ou n’existe plus.", true);
    }
    const current = editing || {};
    const itemsText = Array.isArray(current.items) ? current.items.join("\n") : "";
    const supplierOptions = '<option value="">— Aucun fournisseur associé —</option>' + suppliers.map(s => `<option value="${esc(s.id)}" ${current.supplier_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const formHtml = `<div class="panel"><div class="section-head"><div><div class="eyebrow">CATALOGUE CLIENT</div><h3>${editing ? "Modifier un article" : "Ajouter un produit ou un outil"}</h3></div>${editing ? '<button type="button" class="btn ghost small" onclick="editCatalogItem(\'\')">Annuler</button>' : ""}</div>
      <p class="small-note">Les nouveaux articles sont masqués par défaut. Les prix fournisseur, références internes fournisseur et coûts restent réservés à l’administration.</p>
      <form id="individualCatalogForm" class="admin-form">
        <label class="full">Référence publique SAMA-PACK<input class="input" readonly value="${esc(current.public_ref || "Attribuée automatiquement à l’enregistrement")}"></label>
        <label>Type d’article *<select class="input" name="catalog_type" required><option value="product" ${(current.catalog_type || "product") === "product" ? "selected" : ""}>Produit de nettoyage</option><option value="tool" ${current.catalog_type === "tool" ? "selected" : ""}>Outil / matériel de nettoyage</option></select></label>
        <label>Nom *<input class="input" name="name" required minlength="2" maxlength="180" value="${esc(current.name || "")}" placeholder="Ex. Nettoyant sol 1 L"></label>
        <label>Catégorie<input class="input" name="category" maxlength="100" value="${esc(current.category || "")}" placeholder="Lessive, désinfection…"></label>
        <label>Fournisseur associé<select class="input" name="supplier_id">${supplierOptions}</select></label>
        <label>Référence chez le fournisseur<input class="input" name="supplier_ref" maxlength="100" value="${esc(current.supplier_ref || "")}" placeholder="Ex. PROD-0150"></label>
        <label>Prix fournisseur / coût d’achat unitaire (FCFA HT)<input class="input" name="supplier_price" type="number" min="0" step="0.01" value="${current.supplier_price == null ? "" : Number(current.supplier_price)}" placeholder="Coût par unité ou par matériel"></label>
        <label>Marge souhaitée / majoration (%)<input class="input" name="margin_percent" type="number" min="0" max="1000" step="0.1" value="${current.margin_percent == null ? "" : Number(current.margin_percent)}" placeholder="Ex. 30"></label>
        <label>Prix du colis fournisseur (FCFA HT)<input class="input" name="supplier_carton_price" type="number" min="0" step="0.01" value="${current.carton_price == null ? "" : Number(current.carton_price)}" placeholder="Optionnel, tarif fournisseur"></label>
        <label>Unités / lots par colis<input class="input" name="supplier_units_per_carton" maxlength="80" value="${esc(current.units_per_carton || "")}" placeholder="Ex. 12 pièces / colis"></label>
        <label>Prix de vente calculé (FCFA) *<input class="input selling-price-input" name="price" type="number" required min="0" step="1" value="${Number(current.price || 0)}" ${current.supplier_price != null && current.margin_percent != null ? "readonly" : ""}></label>
        <label>Disponibilité au catalogue<select class="input" name="availability_status"><option value="available" ${(current.availability_status || "out_of_stock") === "available" ? "selected" : ""}>Disponible</option><option value="out_of_stock" ${(current.availability_status || "out_of_stock") === "out_of_stock" ? "selected" : ""}>Rupture de stock</option></select></label>
        <p class="small-note price-calculation-feedback full" data-pricing-feedback>Renseigne le coût fournisseur et la marge pour calculer automatiquement le prix de vente.</p>
        <label class="full">Description<textarea class="input" name="description" maxlength="1200" rows="4" placeholder="Description fidèle et vérifiée de l’article.">${esc(current.description || "")}</textarea></label>
        <label class="full">Image (URL HTTPS ou chemin de l’image)<input class="input" name="image_path" maxlength="1000" value="${esc(current.image_path || "")}" placeholder="https://… ou images/produit.jpg"></label>
        <label class="full">Caractéristiques visibles (une ligne par élément)<textarea class="input" name="items" maxlength="3000" rows="5" placeholder="Format, variante, usage, précautions vérifiées…">${esc(itemsText)}</textarea></label>
        <label class="catalog-active-check"><input type="checkbox" name="active" ${editing && current.active ? "checked" : ""}> Article visible dans le catalogue</label>
        <div class="full"><button class="btn primary" type="submit">${editing ? "Enregistrer l’article" : "Créer l’article masqué"}</button></div>
      </form></div>`;
    const listHtml = catalogRows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Réf. SAMA-PACK</th><th>Article</th><th>Fournisseur / réf. fournisseur</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Disponibilité</th><th>Publication</th><th>Actions</th></tr></thead><tbody>${catalogRows.map(row => `<tr data-admin-search-row data-search="${esc([row.public_ref,row.id,row.name,row.category,row.supplier_name,row.supplier_ref].join(" ").toLowerCase())}">
      <td><strong>${esc(row.public_ref || "—")}</strong></td><td><strong>${esc(row.name)}</strong><br><span class="small-note">${esc(row.category || "Sans catégorie")}</span>${row.source_url ? `<br><a href="${esc(row.source_url)}" target="_blank" rel="noopener noreferrer" title="${esc(row.research_note || "Source du produit")}">Consulter la source ↗</a>` : ""}</td>
      <td>${esc(row.supplier_name || "—")}<br><span class="small-note">${esc(row.supplier_ref || "Réf. non renseignée")}</span></td>
      <td>${row.supplier_price == null ? "—" : money(row.supplier_price)}${row.carton_price == null ? "" : `<br><span class="small-note">Colis : ${money(row.carton_price)} HT</span>`}</td><td>${row.margin_percent == null ? "—" : Number(row.margin_percent) + " %"}</td><td>${money(row.price)}</td>
      <td>${availabilityBadgeHtml(row)}</td><td>${row.active ? '<span class="status delivered">Publié</span>' : '<span class="status cancelled">Masqué</span>'}</td>
      <td><div class="prospect-actions"><button class="btn ghost small" onclick="editCatalogItem('${esc(row.id)}')">Modifier</button><button class="btn ghost small" onclick="archiveCatalogItem('${esc(row.id)}',${row.active ? "false" : "true"})">${row.active ? "Masquer" : "Publier"}</button></div></td>
    </tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun produit individuel ni outil enregistré.</div>';
    host.innerHTML = `${formHtml}<div class="panel"><div class="section-head"><div><div class="eyebrow">GESTION DES ARTICLES</div><h3>Produits et outils enregistrés (${catalogRows.length})</h3></div></div><label class="catalog-admin-search-label">Recherche par référence SAMA-PACK, désignation ou fournisseur<input class="input" id="catalogAdminSearch" type="search" placeholder="Ex. SP-PROD-120, vaisselle, SNAD…"></label>${listHtml}</div>`;
    const search = $("catalogAdminSearch");
    if (search) search.addEventListener("input", () => {
      const query = search.value.toLowerCase().trim();
      host.querySelectorAll("tr[data-admin-search-row]").forEach(row => { row.hidden = !row.dataset.search.includes(query); });
    });
    const form = $("individualCatalogForm");
    if (!form) return;
    bindProductPriceCalculator(form);
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const pricing = readProductPricing(data);
      if (name.length < 2) return toast("Le nom de l’article doit contenir au moins 2 caractères.", true);
      if (pricing.error) return toast(pricing.error, true);
      if (data.get("availability_status") === "available" && pricing.salePrice <= 0) return toast("Définis un prix de vente supérieur à zéro avant de marquer l’article disponible.", true);
      const payload = {
        name,
        catalog_type: data.get("catalog_type") === "tool" ? "tool" : "product",
        category: String(data.get("category") || "").trim() || (data.get("catalog_type") === "tool" ? "Outils de nettoyage" : "Produits de nettoyage"),
        price: pricing.salePrice,
        description: String(data.get("description") || "").trim(),
        image_path: String(data.get("image_path") || "").trim(),
        items: String(data.get("items") || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean),
        active: form.querySelector('[name="active"]').checked,
        availability_status: data.get("availability_status") === "available" ? "available" : "out_of_stock",
        updated_at: new Date().toISOString()
      };
      if (payload.active && payload.price <= 0) return toast("Définis un prix de vente supérieur à zéro avant la publication.", true);
      setBusy(form, true, editingCatalogItemId ? "Enregistrement…" : "Ajout…");
      try {
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
        const supplierError = await saveProductSupplierLink(productId, data, editing || {});
        if (supplierError) return toast("Article enregistré, mais l’association fournisseur n’a pas pu être enregistrée : " + errorMessage(supplierError), true);
        editingCatalogItemId = null;
        toast("Article et informations fournisseur enregistrés.");
        await loadPublicData();
        await renderIndividualCatalogAdmin();
      } catch (err) {
        toast(errorMessage(err), true);
      } finally {
        if (form.isConnected) setBusy(form, false);
      }
    };
  }
'''
    app = replace_function(app, "renderIndividualCatalogAdmin", "  async function editCatalogItem", individual,
                           "replace product/tool manager with supplier linking and search", changes)

    # Publishing should never expose zero-priced rows as purchasable.
    app = replace_once(
        app,
        '    const action = active ? "rendre visible" : "masquer";\n    if (!window.confirm(`Confirmer : ${action} cet article dans le catalogue ?`)) return;',
        '    const action = active ? "rendre visible" : "masquer";\n    const product = getP(id);\n    if (active && (!product || Number(product.price) <= 0)) return toast("Renseigne un prix de vente supérieur à zéro avant la publication.", true);\n    if (!window.confirm(`Confirmer : ${action} cet article dans le catalogue ?`)) return;',
        "prevent publishing zero-priced product/tool", changes)

    # Make inventory searchable across packs/products/materials and add availability control.
    stock_func = r'''  async function adminStock() {
    const [rows, productRows, linkResult, supplierResult] = await Promise.all([
      readRows("stock"),
      readRows("products"),
      client.from("product_supplier_links").select("product_id,supplier_id,supplier_ref"),
      client.from("suppliers").select("id,name").order("name", { ascending: true })
    ]);
    if (linkResult.error) throw linkResult.error;
    if (supplierResult.error) throw supplierResult.error;
    stockRows = rows;
    products = (productRows || []).map(normalizeProduct);
    const suppliers = supplierResult.data || [];
    const supplierById = new Map(suppliers.map(s => [s.id, s]));
    const linkByProduct = new Map((linkResult.data || []).map(link => [link.product_id, { ...link, supplier_name: supplierById.get(link.supplier_id)?.name || "" }]));
    const currentProducts = products.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), "fr"));
    return `<div class="panel"><div class="admin-panel-head"><h3>Stock, réception et réapprovisionnement</h3><span class="small-note">Recherche par référence SAMA-PACK, désignation ou fournisseur. Une quantité positive met l’article en disponibilité.</span></div><label class="catalog-admin-search-label">Rechercher un article<input class="input" id="stockArticleSearch" type="search" placeholder="Réf. SP-PROD-120, dégraissant, SNAD…"></label><div class="table-wrap"><table class="table"><thead><tr><th>Référence / article</th><th>Fournisseur associé / réf.</th><th>Quantité</th><th>Seuil</th><th>Coût d’achat (stock)</th><th>Valeur stock</th><th>Disponibilité catalogue</th></tr></thead><tbody>${currentProducts.map(p=>{const s=rows.find(x=>x.product_id===p.id)||{quantity:0,min_quantity:0,unit_cost:0,supplier:""};const link=linkByProduct.get(p.id)||{};const searchText=[p.public_ref,p.id,p.name,p.category,link.supplier_name,link.supplier_ref,s.supplier].join(" ").toLowerCase();return `<tr data-stock-search-row data-search="${esc(searchText)}"><td><strong>${esc(p.public_ref || p.id)}</strong><br>${esc(p.name)}<br><span class="small-note">${esc(p.category || p.cat || "")}</span></td><td>${esc(link.supplier_name || s.supplier || "—")}<br><span class="small-note">${esc(link.supplier_ref || "Réf. fournisseur non renseignée")}</span></td><td><input class="input stock-field" type="number" min="0" step="1" aria-label="Quantité en stock" data-stock-id="${esc(p.id)}" data-stock-key="quantity" value="${Number(s.quantity||0)}"></td><td><input class="input stock-field" type="number" min="0" step="1" aria-label="Seuil d’alerte" data-stock-id="${esc(p.id)}" data-stock-key="min_quantity" value="${Number(s.min_quantity||0)}"></td><td><input class="input stock-field" type="number" min="0" step="0.01" aria-label="Coût d’achat pour stock" data-stock-id="${esc(p.id)}" data-stock-key="unit_cost" value="${Number(s.unit_cost||0)}"></td><td>${money(Number(s.quantity||0)*Number(s.unit_cost||0))}</td><td><select class="input stock-field" aria-label="Disponibilité au catalogue" data-stock-id="${esc(p.id)}" data-stock-key="availability_status"><option value="available" ${p.availability_status !== "out_of_stock" ? "selected" : ""}>Disponible</option><option value="out_of_stock" ${p.availability_status === "out_of_stock" ? "selected" : ""}>Rupture de stock</option></select><div>${availabilityBadgeHtml(p)}</div></td></tr>`}).join("")}</tbody></table></div><p class="small-note">Les changements sont enregistrés à la sortie du champ. Utilise le formulaire de l’article pour changer le fournisseur associé. Les articles SNAD importés commencent à zéro et en rupture jusqu’à réception physique du stock.</p></div>`;
  }
'''
    app = replace_function(app, "adminStock", "  function nextProductId", stock_func,
                           "replace stock page with article search and availability selector", changes)

    # Packs admin: merge costing + supplier metadata, show new ref, availability and search, and add fields.
    packs_func = r'''  async function adminPacks() {
    const baseRows = await readRows("products");
    const [costResult, linkResult, supplierResult] = await Promise.all([
      client.from("product_costs").select("product_id,supplier_price,margin_percent"),
      client.from("product_supplier_links").select("product_id,supplier_id,supplier_ref,carton_price,units_per_carton,source_url,research_note"),
      client.from("suppliers").select("id,name").order("name", { ascending: true })
    ]);
    if (costResult.error) throw costResult.error;
    if (linkResult.error) throw linkResult.error;
    if (supplierResult.error) throw supplierResult.error;
    const costsById = new Map((costResult.data || []).map(row => [row.product_id, row]));
    const suppliers = supplierResult.data || [];
    const supplierById = new Map(suppliers.map(s => [s.id, s]));
    const linksById = new Map((linkResult.data || []).map(row => [row.product_id, row]));
    const rows = baseRows.map(row => {
      const link = linksById.get(row.id) || {};
      return { ...row, ...(costsById.get(row.id) || { supplier_price: null, margin_percent: null }),
        ...link, supplier_name: supplierById.get(link.supplier_id)?.name || "" };
    });
    products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop(); renderPromoCarousel();
    const editing = editingProductId ? products.find(p => p.id === editingProductId) : null;
    const itemsStr = editing ? editing.items.join("\n") : "";
    const formTitle = editing ? `Modifier ${editing.id}` : "Ajouter un nouveau pack";
    const idLabel = editing ? editing.id : nextProductId();
    const supplierOptions = '<option value="">— Aucun fournisseur associé —</option>' + suppliers.map(s => `<option value="${esc(s.id)}" ${editing?.supplier_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const tableHtml = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Réf. SAMA-PACK</th><th>Pack</th><th>Fournisseur / réf. fournisseur</th><th>Coût fournisseur</th><th>Marge</th><th>Prix de vente</th><th>Disponibilité</th><th>Publication</th><th>Actions</th></tr></thead><tbody>${rows.filter(p=>p.catalog_type === "pack").map(p=>`<tr data-admin-search-row data-search="${esc([p.public_ref,p.id,p.name,p.cat,p.supplier_name,p.supplier_ref].join(" ").toLowerCase())}"><td><strong>${esc(p.public_ref || "—")}</strong></td><td><strong>${esc(p.name)}</strong><br><span class="small-note">${esc(p.cat)}</span></td><td>${esc(p.supplier_name || "—")}<br><span class="small-note">${esc(p.supplier_ref || "Réf. non renseignée")}</span></td><td>${p.supplier_price == null ? "—" : money(p.supplier_price)}${p.carton_price == null ? "" : `<br><span class="small-note">Colis : ${money(p.carton_price)} HT</span>`}</td><td>${p.margin_percent == null ? "—" : Number(p.margin_percent)+" %"}</td><td>${money(p.price)}</td><td>${availabilityBadgeHtml(p)}</td><td><span class="status ${p.active?"delivered":"cancelled"}">${p.active?"Publié":"Masqué"}</span></td><td><div class="table-actions"><button class="btn small ghost" onclick="editPack('${esc(p.id)}')">Modifier</button><button class="btn small ${p.active?"ghost":"secondary"}" onclick="togglePack('${esc(p.id)}',${!p.active})">${p.active?"Masquer":"Publier"}</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun pack enregistré.</div>';
    return `<div class="panel"><div class="admin-panel-head"><h3>${formTitle}</h3><span class="small-note">ID interne : ${esc(idLabel)} · Réf. publique : ${esc(editing?.public_ref || "attribuée automatiquement")}</span></div><form id="packForm" class="admin-form"><label class="full">Référence publique SAMA-PACK<input class="input" readonly value="${esc(editing?.public_ref || "Attribuée automatiquement à l’enregistrement")}"></label><label class="full">Nom du pack<input class="input" name="name" required maxlength="150" placeholder="Nom du pack" value="${esc(editing?.name||"")}"></label><label>Catégorie<input class="input" name="category" required maxlength="80" placeholder="Catégorie" value="${esc(editing?.cat||"")}"></label><label>Fournisseur associé<select class="input" name="supplier_id">${supplierOptions}</select></label><label>Référence chez le fournisseur<input class="input" name="supplier_ref" maxlength="100" placeholder="Réf. fournisseur (facultatif)" value="${esc(editing?.supplier_ref||"")}"></label><label>Coût d’achat total du pack (FCFA HT)<input class="input" name="supplier_price" type="number" min="0" step="0.01" placeholder="Coût de revient du pack" value="${editing?.supplier_price == null ? "" : Number(editing.supplier_price)}"></label><label>Marge souhaitée / majoration (%)<input class="input" name="margin_percent" type="number" min="0" max="1000" step="0.1" placeholder="Ex. 30" value="${editing?.margin_percent == null ? "" : Number(editing.margin_percent)}"></label><label>Prix du colis fournisseur (FCFA HT)<input class="input" name="supplier_carton_price" type="number" min="0" step="0.01" value="${editing?.carton_price == null ? "" : Number(editing.carton_price)}" placeholder="Optionnel"></label><label>Unités / lots par colis<input class="input" name="supplier_units_per_carton" maxlength="80" value="${esc(editing?.units_per_carton||"")}" placeholder="Ex. 12 pièces / colis"></label><label>Prix de vente calculé (FCFA)<input class="input selling-price-input" name="price" type="number" min="0" step="1" required placeholder="Prix en FCFA" value="${editing ? Number(editing.price) : ""}" ${editing?.supplier_price != null && editing?.margin_percent != null ? "readonly" : ""}></label><label>Disponibilité<select class="input" name="availability_status"><option value="available" ${(editing?.availability_status || "out_of_stock") === "available" ? "selected" : ""}>Disponible</option><option value="out_of_stock" ${(editing?.availability_status || "out_of_stock") === "out_of_stock" ? "selected" : ""}>Rupture de stock</option></select></label><p class="small-note price-calculation-feedback full" data-pricing-feedback>Renseigne le coût d’achat et la marge souhaitée pour calculer le prix de vente automatiquement.</p><textarea class="input full" name="description" required maxlength="1500" placeholder="Description du pack">${esc(editing?.desc||"")}</textarea><textarea class="input full" name="items" required placeholder="Composition : un élément par ligne">${esc(itemsStr)}</textarea><input class="input full" name="image_path" maxlength="500" placeholder="Chemin de l’image ou URL (facultatif)" value="${esc(editing?.image_path||"")}"><div class="promo-admin-fields full"><label class="check-label"><input type="checkbox" name="promo_active" ${editing?.promo_active===true ? "checked" : ""}> Afficher ce pack dans les promotions</label><label>Prix promotionnel (FCFA)<input class="input" name="promo_price" type="number" min="0" step="1" placeholder="Ex. 12 000" value="${editing?.promo_price == null ? "" : Number(editing.promo_price)}"></label><label>Texte de la promotion<input class="input" name="promo_label" maxlength="80" placeholder="Vente flash" value="${esc(editing?.promo_label||"Vente flash")}"></label><label class="full">Date et heure de fin de la vente flash<input class="input" type="datetime-local" name="promo_end_at" value="${esc(toLocalDateTimeInput(editing?.promo_end_at))}"></label><p class="small-note">Le prix promotionnel doit être inférieur au prix normal. La date de fin désactive la réduction à son échéance.</p></div><label class="full">Photo du pack (facultatif, JPG/PNG/WebP, 5 Mo maximum)<input class="input" name="image_file" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="check-label full"><input type="checkbox" name="active" ${editing?.active===true?"checked":""}> Publier ce pack dans le catalogue</label><div class="form-actions full"><button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Créer le pack masqué"}</button>${editing ? `<button class="btn ghost" type="button" onclick="cancelPackEdit()">Annuler</button>` : ""}</div></form></div><div style="height:16px"></div><div class="panel"><div class="admin-panel-head"><h3>Catalogue complet (${rows.filter(p=>p.catalog_type === "pack").length} packs)</h3><span class="small-note">Les packs masqués restent dans la gestion et le stock.</span></div><label class="catalog-admin-search-label">Rechercher par référence, désignation ou fournisseur<input class="input" id="packAdminSearch" type="search" placeholder="Ex. SP-PACK-001, SNAD, Grand Ménage…"></label>${tableHtml}</div>`;
  }
'''
    app = replace_function(app, "adminPacks", "  function editPack", packs_func,
                           "replace pack manager with supplier linking and search", changes)

    # Publish guard for packs
    app = replace_once(
        app,
        '  async function togglePack(id, active) {\n    const { error } = await client.from("products").update({ active }).eq("id", id);',
        '  async function togglePack(id, active) {\n    const product = getP(id);\n    if (active && (!product || Number(product.price) <= 0)) return toast("Renseigne un prix de vente supérieur à zéro avant la publication.", true);\n    const { error } = await client.from("products").update({ active }).eq("id", id);',
        "prevent publishing zero-priced packs", changes)

    # Extend pack saving with availability and supplier link
    app = replace_once(
        app,
        'image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",promo_active:',
        'image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",availability_status:fd.get("availability_status")==="available"?"available":"out_of_stock",promo_active:',
        "save pack availability status", changes)
    app = replace_once(
        app,
        'if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0)',
        'if (payload.active && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant la publication.",true); } if (payload.availability_status === "available" && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant de marquer le pack disponible.",true); } if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0)',
        "validate pack price before publish/available status", changes)
    app = replace_once(
        app,
        'const pricingError = await saveProductPricing(productId, pricing);\n        setBusy(form,false);\n        if (pricingError) return toast("Pack enregistré, mais le coût fournisseur ou la marge n’a pas pu être enregistré : " + errorMessage(pricingError),true);',
        'const pricingError = await saveProductPricing(productId, pricing);\n        if (pricingError) { setBusy(form,false); return toast("Pack enregistré, mais le coût fournisseur ou la marge n’a pas pu être enregistré : " + errorMessage(pricingError),true); }\n        const supplierError = await saveProductSupplierLink(productId, fd);\n        setBusy(form,false);\n        if (supplierError) return toast("Pack enregistré, mais l’association fournisseur n’a pas pu être enregistrée : " + errorMessage(supplierError),true);',
        "save pack supplier association", changes)

    # Stock input behavior: search and availability status is a product update, not a stock row update.
    app = replace_once(
        app,
        '    if (view === "stock") document.querySelectorAll(".stock-field").forEach(input => {\n      input.addEventListener("change", async () => {\n        const productId = input.dataset.stockId; const key = input.dataset.stockKey; let val = input.value;\n        if (key !== "supplier")',
        '    if (view === "stock") {\n      const stockSearch = $("stockArticleSearch");\n      if (stockSearch) stockSearch.addEventListener("input", () => { const q = stockSearch.value.toLowerCase().trim(); document.querySelectorAll("tr[data-stock-search-row]").forEach(row => { row.hidden = !row.dataset.search.includes(q); }); });\n      document.querySelectorAll(".stock-field").forEach(input => {\n      input.addEventListener("change", async () => {\n        const productId = input.dataset.stockId; const key = input.dataset.stockKey; let val = input.value;\n        if (key === "availability_status") {\n          if (!["available","out_of_stock"].includes(val)) { toast("Disponibilité invalide.",true); return showAdminView("stock"); }\n          if (val === "available" && Number(getP(productId)?.price || 0) <= 0) { toast("Définis un prix de vente avant de marquer l’article disponible.",true); return showAdminView("stock"); }\n          const { error } = await client.from("products").update({ availability_status: val, updated_at: new Date().toISOString() }).eq("id", productId);\n          if (error) return toast(errorMessage(error),true);\n          const product = getP(productId); if (product) product.availability_status = val;\n          toast("Disponibilité mise à jour."); await loadPublicData(); return showAdminView("stock");\n        }\n        if (key !== "supplier")',
        "bind stock search and save public availability", changes)
    app = replace_once(
        app,
        '        const { error } = await client.from("stock").upsert(row,{onConflict:"product_id"});\n        if (error) toast(errorMessage(error),true); else { const idx = stockRows.findIndex(x=>x.product_id===productId); if (idx>=0) stockRows[idx]=row; else stockRows.push(row); toast("Stock enregistré."); }\n      });\n    });',
        '        const { error } = await client.from("stock").upsert(row,{onConflict:"product_id"});\n        if (error) toast(errorMessage(error),true); else { const idx = stockRows.findIndex(x=>x.product_id===productId); if (idx>=0) stockRows[idx]=row; else stockRows.push(row);\n          if (key === "quantity") { const newStatus = Number(val) > 0 ? "available" : "out_of_stock"; const { error:statusError } = await client.from("products").update({ availability_status:newStatus, updated_at:new Date().toISOString() }).eq("id",productId); if (statusError) return toast("Stock enregistré, disponibilité non mise à jour : " + errorMessage(statusError),true); await loadPublicData(); }\n          toast("Stock enregistré."); }\n      });\n      });\n    }',
        "synchronize stock quantity with availability status", changes)
    app = replace_once(
        app,
        '  Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem});',
        '  Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem});',
        "verify window exports remain stable", changes)

    # Bind pack-list search using bindAdmin, after the form setup.
    app = replace_once(
        app,
        '  function bindAdmin(view) {\n    if (view === "packs" || view === "products") {',
        '  function bindAdmin(view) {\n    if (view === "packs" || view === "products") {\n      const packSearch = $("packAdminSearch"); if (packSearch) packSearch.addEventListener("input", () => { const q=packSearch.value.toLowerCase().trim(); document.querySelectorAll("tr[data-admin-search-row]").forEach(row => { row.hidden = !row.dataset.search.includes(q); }); });',
        "bind pack manager search", changes)

    # CSS badges, SKU line, form layout, search input placement
    css_add = '''
/* SAMA-PACK catalogue references, availability and supplier-aware admin search */
.availability-badge{display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:100%;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;line-height:1.25;border:1px solid transparent}
.availability-badge.is-available{color:#166534;background:#dcfce7;border-color:#bbf7d0}
.availability-badge.is-out{color:#991b1b;background:#fee2e2;border-color:#fecaca}
.product-reference{display:block;color:var(--muted);font-size:11px;line-height:1.45;overflow-wrap:anywhere}
.product-reference strong{color:#334155;letter-spacing:.02em}
.product-detail-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:10px 0 14px}
.product-detail-meta .product-reference{margin:0}
.catalog-admin-search-label{display:grid;gap:7px;font-size:12px;color:var(--muted);margin:10px 0 16px;max-width:620px}
.catalog-admin-search-label .input{width:100%;min-width:0}
.selling-price-input[readonly]{background:#f0fdf4;border-color:#bbf7d0;color:#166534;font-weight:800}
tr[hidden]{display:none!important}
@media(max-width:600px){.product-card .availability-badge{font-size:10px}.product-reference{font-size:10px}.product-detail-meta{align-items:flex-start}}
'''
    if "/* SAMA-PACK catalogue references, availability and supplier-aware admin search */" in css:
        raise RuntimeError("CSS enhancement block already exists; check if the patch was previously applied.")
    css += "\n" + css_add
    changes.append("add catalogue and administration styles")

    if app == original_app or css == original_css:
        raise RuntimeError("No source changes were produced.")
    if "function availabilityBadgeHtml(p)" not in app or 'name="availability_status"' not in app or "product_supplier_links" not in app:
        raise RuntimeError("Validation failed: SKU, availability or supplier controls missing from patched app.js")

    print("Prévisualisation du correctif :")
    for idx, item in enumerate(changes, 1):
        print(f" {idx:02d}. {item}")
    print(f"\napp.js : {len(original_app.splitlines())} → {len(app.splitlines())} lignes")
    print(f"styles.css : {len(original_css.splitlines())} → {len(css.splitlines())} lignes")
    print("Vérifications syntaxiques automatiques exécutées par le script après écriture avec --apply : non ; lance node --check app.js ensuite.")

    if not args.apply:
        print("\nSIMULATION SEULEMENT : aucun fichier modifié. Relance avec --apply pour appliquer le correctif.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_app = ROOT / f"app.js.backup-{stamp}"
    backup_css = ROOT / f"styles.css.backup-{stamp}"
    shutil.copy2(APP, backup_app)
    shutil.copy2(CSS, backup_css)
    APP.write_text(app, encoding="utf-8")
    CSS.write_text(css, encoding="utf-8")
    print(f"\nCorrectif appliqué. Sauvegardes : {backup_app.name}, {backup_css.name}")
    print("Étape suivante : node --check app.js && git diff --check")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERREUR : {exc}", file=sys.stderr)
        raise SystemExit(1)
