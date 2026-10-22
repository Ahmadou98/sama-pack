#!/usr/bin/env python3
"""Ajoute la prospection admin et les catalogues individuels produits/outils à SAMA-PACK.

La migration Supabase correspondante a déjà été appliquée au projet SAMA-PACK.
Par défaut, le script simule les changements. Ajouter --apply pour écrire les fichiers.
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

CSS_MARKER = "/* ===== SAMA-PACK prospects + individual cleaning catalogues ===== */"

HTML_SECTIONS = r'''
<section id="produits" class="section individual-catalog-section alt">
  <div class="wrap">
    <div class="section-head">
      <div><div class="eyebrow">CATALOGUE INDIVIDUEL</div><h2>Produits de nettoyage</h2><p>Les produits à l’unité pour compléter vos packs.</p></div>
    </div>
    <div id="individualProductGrid" class="product-grid individual-catalog-grid"></div>
  </div>
</section>

<section id="outils" class="section individual-catalog-section">
  <div class="wrap">
    <div class="section-head">
      <div><div class="eyebrow">MATÉRIELS & ACCESSOIRES</div><h2>Outils de nettoyage</h2><p>Les équipements et accessoires pour l’entretien quotidien.</p></div>
    </div>
    <div id="cleaningToolGrid" class="product-grid individual-catalog-grid"></div>
  </div>
</section>
'''

ADMIN_FUNCTIONS = r'''  let editingProspectId = null;
  let editingCatalogItemId = null;

  const PROSPECT_STATUSES = [
    ["to_contact", "À prospecter"],
    ["contacted", "Contacté"],
    ["interested", "Intéressé"],
    ["converted", "Devenu client"],
    ["not_interested", "Pas intéressé"]
  ];

  function renderIndividualCatalogs() {
    const productGrid = $("individualProductGrid");
    const toolGrid = $("cleaningToolGrid");
    if (productGrid) {
      const items = products.filter(p => p.active && p.catalog_type === "product");
      productGrid.innerHTML = items.map(productCard).join("") || '<div class="empty individual-catalog-empty">Les produits de nettoyage à l’unité seront bientôt disponibles.</div>';
    }
    if (toolGrid) {
      const items = products.filter(p => p.active && p.catalog_type === "tool");
      toolGrid.innerHTML = items.map(productCard).join("") || '<div class="empty individual-catalog-empty">Les outils et matériels de nettoyage seront bientôt disponibles.</div>';
    }
  }

  function prospectStatusLabel(status) {
    return (PROSPECT_STATUSES.find(option => option[0] === status) || ["", status || "À prospecter"])[1];
  }

  async function renderProspectsAdmin() {
    const host = $("adminContent");
    if (!host || !client || !isAdmin()) return;
    const { data: rows, error } = await client.from("prospects")
      .select("id,full_name,company,email,phone,position,address,source,notes,status,created_by,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      host.innerHTML = '<div class="panel"><h3>Prospection</h3><p>Impossible de charger les prospects. Vérifie la connexion et les autorisations.</p></div>';
      console.warn("Prospects load failed", error);
      return toast(errorMessage(error), true);
    }

    const assignedIds = [...new Set((rows || []).map(row => row.created_by).filter(Boolean))];
    const assignedLabels = Object.create(null);
    if (assignedIds.length) {
      const { data: admins, error: adminsError } = await client.from("profiles").select("id,full_name,email").in("id", assignedIds);
      if (!adminsError) (admins || []).forEach(admin => {
        assignedLabels[admin.id] = admin.full_name || admin.email || "Administrateur";
      });
    }
    const editing = editingProspectId ? (rows || []).find(row => row.id === editingProspectId) : null;
    if (editingProspectId && !editing) {
      editingProspectId = null;
      toast("Ce prospect n’est pas accessible ou n’existe plus.", true);
    }
    const current = editing || {};
    const statusOptions = PROSPECT_STATUSES.map(([value, label]) => `<option value="${value}" ${current.status === value ? "selected" : ""}>${label}</option>`).join("");
    const formHtml = `<div class="panel prospect-form-panel"><div class="section-head"><div><div class="eyebrow">SUIVI COMMERCIAL</div><h3>${editing ? "Modifier le prospect" : "Ajouter un prospect"}</h3></div>${editing ? '<button type="button" class="btn ghost small" onclick="editProspect(\'\')">Annuler</button>' : ""}</div>
      <p class="small-note">Chaque prospect est attribué à l’administrateur connecté. Il faut au moins un numéro de téléphone ou une adresse e-mail.</p>
      <form id="prospectForm" class="admin-form">
        <label>Nom complet *<input class="input" name="full_name" required minlength="2" maxlength="160" value="${esc(current.full_name || "")}" placeholder="Nom du contact"></label>
        <label>Entreprise / structure<input class="input" name="company" maxlength="180" value="${esc(current.company || "")}" placeholder="Entreprise"></label>
        <label>Téléphone<input class="input" name="phone" maxlength="40" value="${esc(current.phone || "")}" placeholder="+221 …"></label>
        <label>E-mail<input class="input" name="email" type="email" maxlength="254" value="${esc(current.email || "")}" placeholder="contact@entreprise.sn"></label>
        <label>Fonction<input class="input" name="position" maxlength="140" value="${esc(current.position || "")}" placeholder="Responsable achats…"></label>
        <label>Adresse / zone<input class="input" name="address" maxlength="300" value="${esc(current.address || "")}" placeholder="Dakar, quartier…"></label>
        <label>Origine du contact<input class="input" name="source" maxlength="120" value="${esc(current.source || "")}" placeholder="Visite, recommandation…"></label>
        <label>Statut<select class="input" name="status">${PROSPECT_STATUSES.map(([value,label]) => `<option value="${value}" ${(current.status || "to_contact") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="full">Notes de prospection<textarea class="input" name="notes" maxlength="2000" rows="3" placeholder="Besoins, prochaines actions, compte rendu…">${esc(current.notes || "")}</textarea></label>
        <div class="full"><button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Ajouter le prospect"}</button></div>
      </form></div>`;

    const listHtml = rows?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Prospect</th><th>Coordonnées</th><th>Suivi</th><th>Responsable</th><th>Actions</th></tr></thead><tbody>${rows.map(row => `<tr>
      <td><strong>${esc(row.full_name)}</strong><br><span class="small-note">${esc(row.company || "Structure non renseignée")}</span>${row.position ? `<br><span class="small-note">${esc(row.position)}</span>` : ""}</td>
      <td>${row.phone ? `<div>${esc(row.phone)}</div>` : ""}${row.email ? `<div>${esc(row.email)}</div>` : ""}${row.address ? `<div class="small-note">${esc(row.address)}</div>` : ""}</td>
      <td><label class="prospect-status-field"><span class="small-note">${esc(prospectStatusLabel(row.status))}</span><select class="input" aria-label="Statut de ${esc(row.full_name)}" onchange="setProspectStatus('${esc(row.id)}',this.value)">${PROSPECT_STATUSES.map(([value,label]) => `<option value="${value}" ${row.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>${row.notes ? `<details class="prospect-notes"><summary>Notes</summary><p>${esc(row.notes)}</p></details>` : ""}</td>
      <td><strong>${esc(assignedLabels[row.created_by] || "Administrateur")}</strong></td>
      <td><div class="prospect-actions"><button class="btn ghost small" onclick="editProspect('${esc(row.id)}')">Modifier</button><button class="btn ghost small danger" onclick="deleteProspect('${esc(row.id)}')">Supprimer</button></div></td>
    </tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun prospect pour le moment. Ajoute le premier contact avec le formulaire ci-dessus.</div>';
    host.innerHTML = `${formHtml}<div class="panel"><div class="section-head"><div><div class="eyebrow">CARNET DE PROSPECTION</div><h3>Prospects accessibles (${(rows || []).length})</h3></div></div>${listHtml}</div>`;

    const form = $("prospectForm");
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        full_name: String(data.get("full_name") || "").trim(),
        company: String(data.get("company") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        position: String(data.get("position") || "").trim(),
        address: String(data.get("address") || "").trim(),
        source: String(data.get("source") || "").trim(),
        notes: String(data.get("notes") || "").trim(),
        status: String(data.get("status") || "to_contact"),
        updated_at: new Date().toISOString()
      };
      if (!payload.phone && !payload.email) return toast("Renseigne au moins un téléphone ou une adresse e-mail.", true);
      if (payload.full_name.length < 2) return toast("Le nom du prospect est trop court.", true);
      setBusy(form, true, editingProspectId ? "Enregistrement…" : "Ajout…");
      try {
        let result;
        if (editingProspectId) {
          result = await client.from("prospects").update(payload).eq("id", editingProspectId);
        } else {
          result = await client.from("prospects").insert({ ...payload, created_by: currentUser.id });
        }
        if (result.error) return toast(errorMessage(result.error), true);
        editingProspectId = null;
        toast("Prospect enregistré.");
        await renderProspectsAdmin();
      } catch (err) {
        toast(errorMessage(err), true);
      } finally {
        if (form.isConnected) setBusy(form, false);
      }
    };
  }

  async function editProspect(id) {
    editingProspectId = id || null;
    await renderProspectsAdmin();
    if (editingProspectId) $("adminContent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function setProspectStatus(id, status) {
    if (!PROSPECT_STATUSES.some(option => option[0] === status)) return toast("Statut de prospect invalide.", true);
    const { error } = await client.from("prospects").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast("Statut du prospect mis à jour.");
    await renderProspectsAdmin();
  }

  async function deleteProspect(id) {
    if (!window.confirm("Supprimer définitivement ce prospect ? Cette action est irréversible.")) return;
    const { error } = await client.from("prospects").delete().eq("id", id);
    if (error) return toast(errorMessage(error), true);
    if (editingProspectId === id) editingProspectId = null;
    toast("Prospect supprimé.");
    await renderProspectsAdmin();
  }

  async function renderIndividualCatalogAdmin() {
    const host = $("adminContent");
    if (!host || !client || !isAdmin()) return;
    const { data: rows, error } = await client.from("products")
      .select("id,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")
      .in("catalog_type", ["product", "tool"])
      .order("name", { ascending: true });
    if (error) {
      host.innerHTML = '<div class="panel"><h3>Catalogue individuel</h3><p>Impossible de charger les produits et outils.</p></div>';
      console.warn("Individual catalog load failed", error);
      return toast(errorMessage(error), true);
    }
    const editing = editingCatalogItemId ? (rows || []).find(row => row.id === editingCatalogItemId) : null;
    if (editingCatalogItemId && !editing) {
      editingCatalogItemId = null;
      toast("Cet article n’est pas accessible ou n’existe plus.", true);
    }
    const current = editing || {};
    const itemsText = Array.isArray(current.items) ? current.items.join("\n") : "";
    const formHtml = `<div class="panel"><div class="section-head"><div><div class="eyebrow">CATALOGUE CLIENT</div><h3>${editing ? "Modifier un article" : "Ajouter un produit ou un outil"}</h3></div>${editing ? '<button type="button" class="btn ghost small" onclick="editCatalogItem(\'\')">Annuler</button>' : ""}</div>
      <p class="small-note">Les articles actifs seront visibles dans leur catalogue et pourront être ajoutés au panier. Les packs restent gérés dans « Gestion des packs ».</p>
      <form id="individualCatalogForm" class="admin-form">
        <label>Type d’article *<select class="input" name="catalog_type" required><option value="product" ${(current.catalog_type || "product") === "product" ? "selected" : ""}>Produit de nettoyage</option><option value="tool" ${current.catalog_type === "tool" ? "selected" : ""}>Outil / matériel de nettoyage</option></select></label>
        <label>Nom *<input class="input" name="name" required minlength="2" maxlength="180" value="${esc(current.name || "")}" placeholder="Ex. Nettoyant sol 1 L"></label>
        <label>Catégorie<input class="input" name="category" maxlength="100" value="${esc(current.category || "")}" placeholder="Lessive, désinfection…"></label>
        <label>Prix de vente (FCFA) *<input class="input" name="price" type="number" required min="0" step="1" value="${Number(current.price || 0)}"></label>
        <label class="full">Description<textarea class="input" name="description" maxlength="1200" rows="3" placeholder="Présente clairement l’article et son usage.">${esc(current.description || "")}</textarea></label>
        <label class="full">Image (URL HTTPS ou chemin de l’image)<input class="input" name="image_path" maxlength="1000" value="${esc(current.image_path || "")}" placeholder="https://… ou images/produit.jpg"></label>
        <label class="full">Contenu / caractéristiques (une ligne par élément)<textarea class="input" name="items" maxlength="3000" rows="4" placeholder="Format : 1 L&#10;Usage : sols carrelés&#10;Précautions : …">${esc(itemsText)}</textarea></label>
        <label class="catalog-active-check"><input type="checkbox" name="active" ${current.active === false ? "" : "checked"}> Article visible dans le catalogue</label>
        <div class="full"><button class="btn primary" type="submit">${editing ? "Enregistrer l’article" : "Ajouter au catalogue"}</button></div>
      </form></div>`;
    const listHtml = rows?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Article</th><th>Type</th><th>Prix</th><th>Visibilité</th><th>Actions</th></tr></thead><tbody>${rows.map(row => `<tr>
      <td><strong>${esc(row.name)}</strong><br><span class="small-note">${esc(row.category || "Sans catégorie")}</span></td>
      <td>${row.catalog_type === "tool" ? "Outil / matériel" : "Produit de nettoyage"}</td>
      <td>${money(row.price)}</td><td>${row.active ? '<span class="status delivered">Visible</span>' : '<span class="status cancelled">Masqué</span>'}</td>
      <td><div class="prospect-actions"><button class="btn ghost small" onclick="editCatalogItem('${esc(row.id)}')">Modifier</button><button class="btn ghost small" onclick="archiveCatalogItem('${esc(row.id)}',${row.active ? "false" : "true"})">${row.active ? "Masquer" : "Publier"}</button></div></td>
    </tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun produit individuel ni outil enregistré. Utilise le formulaire pour ajouter le premier article.</div>';
    host.innerHTML = `${formHtml}<div class="panel"><div class="section-head"><div><div class="eyebrow">GESTION DES ARTICLES</div><h3>Produits et outils enregistrés (${(rows || []).length})</h3></div></div>${listHtml}</div>`;

    const form = $("individualCatalogForm");
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const price = Number(data.get("price"));
      if (name.length < 2 || !Number.isFinite(price) || price < 0) return toast("Vérifie le nom et le prix de l’article.", true);
      const payload = {
        name,
        catalog_type: data.get("catalog_type") === "tool" ? "tool" : "product",
        category: String(data.get("category") || "").trim() || (data.get("catalog_type") === "tool" ? "Outils de nettoyage" : "Produits de nettoyage"),
        price,
        description: String(data.get("description") || "").trim(),
        image_path: String(data.get("image_path") || "").trim(),
        items: String(data.get("items") || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean),
        active: form.querySelector('[name="active"]').checked,
        updated_at: new Date().toISOString()
      };
      setBusy(form, true, editingCatalogItemId ? "Enregistrement…" : "Ajout…");
      try {
        let result;
        if (editingCatalogItemId) {
          result = await client.from("products").update(payload).eq("id", editingCatalogItemId);
        } else {
          const id = `CAT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          result = await client.from("products").insert({ ...payload, id, promo_active: false, promo_price: null, promo_label: "Offre spéciale" });
        }
        if (result.error) return toast(errorMessage(result.error), true);
        editingCatalogItemId = null;
        toast("Article enregistré dans le catalogue.");
        await loadPublicData();
        await renderIndividualCatalogAdmin();
      } catch (err) {
        toast(errorMessage(err), true);
      } finally {
        if (form.isConnected) setBusy(form, false);
      }
    };
  }

  async function editCatalogItem(id) {
    editingCatalogItemId = id || null;
    await renderIndividualCatalogAdmin();
    if (editingCatalogItemId) $("adminContent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function archiveCatalogItem(id, active) {
    const action = active ? "rendre visible" : "masquer";
    if (!window.confirm(`Confirmer : ${action} cet article dans le catalogue ?`)) return;
    const { error } = await client.from("products").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(active ? "Article publié." : "Article masqué du catalogue.");
    await loadPublicData();
    await renderIndividualCatalogAdmin();
  }

'''

CSS_APPEND = r'''

/* ===== SAMA-PACK prospects + individual cleaning catalogues ===== */
.individual-catalog-section .section-head { align-items: end; }
.individual-catalog-section .section-head p { margin: 8px 0 0; font-size: 14px; }
.individual-catalog-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.individual-catalog-empty { grid-column: 1 / -1; }
.prospect-form-panel { margin-bottom: 22px; }
.prospect-form-panel h3, #adminContent > .panel h3 { margin: 3px 0 0; }
.prospect-status-field { display: grid; gap: 5px; min-width: 135px; }
.prospect-status-field .input { max-width: 175px; padding: 8px; font-size: 12px; }
.prospect-notes { margin-top: 7px; max-width: 220px; color: #475569; font-size: 12px; }
.prospect-notes summary { cursor: pointer; font-weight: 700; color: var(--green); }
.prospect-notes p { white-space: pre-wrap; overflow-wrap: anywhere; }
.prospect-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.prospect-actions .btn { padding: 7px 9px; font-size: 11px; }
.prospect-actions .btn.danger { color: #9f3434; border-color: #f2d4d4; }
.catalog-active-check { display: flex !important; align-items: center; gap: 9px !important; color: var(--ink) !important; }
.catalog-active-check input { width: 16px; height: 16px; accent-color: var(--green); }
@media (max-width: 900px) {
  .individual-catalog-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .individual-catalog-section { padding: 44px 0; }
  .individual-catalog-section .section-head { margin-bottom: 17px; }
  .individual-catalog-section .section h2,
  .individual-catalog-section h2 { font-size: 27px; }
  .individual-catalog-section .section-head p { font-size: 12px; line-height: 1.5; }
  .individual-catalog-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .individual-catalog-grid .product-card { border-radius: 14px; }
  .individual-catalog-grid .pack-visual { min-height: 112px; padding: 8px; }
  .individual-catalog-grid .product-photo { max-height: 112px; }
  .individual-catalog-grid .product-body { gap: 8px; padding: 11px; }
  .individual-catalog-grid .product-cat { font-size: 9px; }
  .individual-catalog-grid .product-name { font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
  .individual-catalog-grid .price { font-size: 16px; }
  .individual-catalog-grid .product-actions { display: grid; grid-template-columns: 1fr; gap: 6px; }
  .individual-catalog-grid .product-actions .btn { width: 100%; min-height: 36px; padding: 8px 5px; font-size: 11px; }
  .prospect-form-panel .section-head { flex-direction: row; align-items: center; }
  .prospect-actions { flex-direction: column; align-items: stretch; }
  .prospect-actions .btn { width: 100%; }
}
'''


def replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise ValueError(f"{label}: attendu une occurrence, trouvé {count}.")
    return src.replace(old, new, 1)


def patch_html(html: str) -> str:
    if 'id="individualProductGrid"' in html or 'data-view="prospects"' in html:
        raise ValueError("Les sections de catalogues/prospection semblent déjà présentes dans index.html.")
    old_nav = '''    <nav class="desktop-nav">
      <a href="#catalogue">Catalogue</a>
      <a href="#how">Comment ça marche</a>
      <a href="#b2b">Professionnels</a>
      <a href="#contact">Contact</a>
    </nav>'''
    new_nav = '''    <nav class="desktop-nav">
      <a href="#catalogue">Packs</a>
      <a href="#produits">Produits</a>
      <a href="#outils">Outils</a>
      <a href="#how">Comment ça marche</a>
      <a href="#b2b">Professionnels</a>
      <a href="#contact">Contact</a>
    </nav>'''
    html = replace_once(html, old_nav, new_nav, "menu principal")
    old_mobile = '''<nav class="mobile-bottom-nav" aria-label="Navigation rapide">
  <a href="#home" class="mobile-nav-item"><span aria-hidden="true">⌂</span><small>Accueil</small></a>
  <a href="#catalogue" class="mobile-nav-item"><span aria-hidden="true">▦</span><small>Catalogue</small></a>
  <a href="#promoSection" class="mobile-nav-item"><span aria-hidden="true">⚡</span><small>Vente flash</small></a>
  <button type="button" class="mobile-nav-item" data-mobile-action="cart"><span aria-hidden="true">🛒</span><small>Panier</small></button>
  <button type="button" class="mobile-nav-item" data-mobile-action="account"><span aria-hidden="true">♙</span><small>Compte</small></button>
</nav>'''
    new_mobile = '''<nav class="mobile-bottom-nav" aria-label="Navigation rapide">
  <a href="#home" class="mobile-nav-item"><span aria-hidden="true">⌂</span><small>Accueil</small></a>
  <a href="#catalogue" class="mobile-nav-item"><span aria-hidden="true">▦</span><small>Packs</small></a>
  <a href="#produits" class="mobile-nav-item"><span aria-hidden="true">◫</span><small>Produits</small></a>
  <a href="#outils" class="mobile-nav-item"><span aria-hidden="true">⚒</span><small>Outils</small></a>
  <button type="button" class="mobile-nav-item" data-mobile-action="cart"><span aria-hidden="true">🛒</span><small>Panier</small></button>
</nav>'''
    html = replace_once(html, old_mobile, new_mobile, "navigation mobile")
    html = replace_once(html,
        '      <button class="side-btn" data-view="packs">🧺 Gestion des packs</button>\n',
        '      <button class="side-btn" data-view="packs">🧺 Gestion des packs</button>\n      <button class="side-btn" data-view="catalogs">🧴 Produits &amp; outils</button>\n      <button class="side-btn" data-view="prospects">🎯 Prospection</button>\n',
        "menu administrateur")
    html = replace_once(html, '\n<section id="how" class="section alt">', '\n' + HTML_SECTIONS + '\n<section id="how" class="section alt">', "sections catalogue individuel")
    for marker in ['id="individualProductGrid"', 'id="cleaningToolGrid"', 'data-view="catalogs"', 'data-view="prospects"', 'id="productGrid"', 'id="openCartBtn"', 'id="accountBtn"', 'src="app.js"']:
        if marker not in html:
            raise ValueError(f"Contrôle HTML échoué : {marker} manquant.")
    if '<!-- <div class="hero-card discovery-hero-card">' not in html:
        raise ValueError("Le bloc « Nos packs à découvrir » ne semble plus commenté; arrêt par précaution.")
    return html


def patch_app(app: str) -> str:
    if 'async function renderProspectsAdmin()' in app or 'function renderIndividualCatalogs()' in app:
        raise ValueError("Les fonctionnalités prospects/catalogues semblent déjà présentes dans app.js.")
    app = replace_once(app,
        'return { id: String(p.id), name: String(p.name || "Pack"),',
        'return { id: String(p.id), catalog_type: String(p.catalog_type || "pack"), name: String(p.name || "Pack"),',
        "type de catalogue dans le catalogue de secours")
    app = replace_once(app,
        'return { ...p, id: String(p.id), cat: String(p.category || p.cat || "Autre"),',
        'return { ...p, id: String(p.id), catalog_type: String(p.catalog_type || "pack"), cat: String(p.category || p.cat || "Autre"),',
        "type de catalogue dans les produits Supabase")
    app = replace_once(app,
        '.select("id,name,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")',
        '.select("id,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")',
        "lecture du type de catalogue")
    app = replace_once(app,
        'const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active).length);',
        'const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active && p.catalog_type === "pack").length);',
        "compteur des packs uniquement")
    app = replace_once(app,
        'const categories = [...new Set(products.filter(p => p.active || isAdmin()).map(p => p.cat).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));',
        'const categories = [...new Set(products.filter(p => p.catalog_type === "pack" && (p.active || isAdmin())).map(p => p.cat).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));',
        "catégories du catalogue de packs")
    app = replace_once(app,
        'const tops = products.filter(p => p.active).sort((a,b) => Number(hasPromotion(b)) - Number(hasPromotion(a))).slice(0, 3);',
        'const tops = products.filter(p => p.active && p.catalog_type === "pack").sort((a,b) => Number(hasPromotion(b)) - Number(hasPromotion(a))).slice(0, 3);',
        "packs vedettes uniquement")
    app = replace_once(app,
        'const arr = products.filter(p => p.active && (c === "all" || p.cat === c) && [p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));',
        'const arr = products.filter(p => p.active && p.catalog_type === "pack" && (c === "all" || p.cat === c) && [p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));',
        "catalogue d’accueil réservé aux packs")
    app = app.replace('products.filter(p => p.active && hasPromotion(p))', 'products.filter(p => p.active && p.catalog_type === "pack" && hasPromotion(p))')
    if 'products.filter(p => p.active && hasPromotion(p))' in app:
        raise ValueError("Impossible de limiter les ventes flash aux packs.")

    # Render the two individual catalogues whenever the main pack grid is refreshed.
    import re
    render_boundary = re.compile(r'(  function renderProducts\(\) \{[\s\S]*?)(\n  }\n  function goToProductPage\(page\) \{)')
    app, render_count = render_boundary.subn(r'\1\n    renderIndividualCatalogs();\2', app, count=1)
    if render_count != 1:
        raise ValueError("Impossible d’insérer le rendu des catalogues individuels après renderProducts().")
    app = replace_once(app, '  async function loadPublicData() {\n', ADMIN_FUNCTIONS + '  async function loadPublicData() {\n', "fonctions de catalogue et de prospection")

    import re
    router_pattern = re.compile(r"(^[ \t]*async function showAdminView\s*\(view\)\s*\{\s*)", re.MULTILINE)
    router_injected = r'''\1    if (view === "prospects" || view === "catalogs") {
      if (!isAdmin()) return toast("Cette action n’est pas autorisée pour ce compte.", true);
      currentAdminView = view;
      document.querySelectorAll(".side-btn").forEach(button => button.classList.toggle("active", button.dataset.view === view));
      const title = $("adminTitle");
      if (title) title.textContent = view === "prospects" ? "Prospection" : "Produits & outils";
      if (view === "prospects") await renderProspectsAdmin();
      else await renderIndividualCatalogAdmin();
      return;
    }
'''
    app, route_count = router_pattern.subn(router_injected, app, count=1)
    if route_count != 1:
        raise ValueError("Impossible d’insérer les nouveaux écrans dans showAdminView(view).")

    import re
    match = re.search(r'Object\.assign\(window,\{([\s\S]*?)\}\);', app)
    if not match:
        raise ValueError("Impossible de trouver l’exposition des fonctions de l’application dans Object.assign(window, …).")
    function_names = ["editProspect", "deleteProspect", "setProspectStatus", "editCatalogItem", "archiveCatalogItem"]
    body = match.group(1)
    for name in function_names:
        if not re.search(rf'\b{re.escape(name)}\b', body):
            body = body.rstrip() + "," + name
    app = app[:match.start(1)] + body + app[match.end(1):]

    expected = ['function renderIndividualCatalogs()', 'async function renderProspectsAdmin()', 'async function renderIndividualCatalogAdmin()', 'data.get("catalog_type")', 'catalog_type === "pack"', 'editProspect,deleteProspect']
    for marker in expected:
        if marker not in app:
            raise ValueError(f"Contrôle app.js échoué : {marker} absent.")
    return app


def patch_css(css: str) -> str:
    if CSS_MARKER in css:
        raise ValueError("Le style des nouveaux catalogues semble déjà présent dans styles.css.")
    return css.rstrip() + CSS_APPEND + "\n"


def check_js(source: str) -> tuple[bool, str]:
    node = shutil.which("node")
    if not node:
        return True, "Node.js absent : contrôle de syntaxe reporté."
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
        f.write(source); name = f.name
    try:
        result = subprocess.run([node, "--check", name], capture_output=True, text=True, timeout=20)
        return result.returncode == 0, (result.stderr or result.stdout).strip()
    finally:
        Path(name).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ajoute la prospection admin et deux catalogues individuels à SAMA-PACK.")
    parser.add_argument("--apply", action="store_true", help="écrit les modifications après les contrôles")
    parser.add_argument("--directory", default=".", help="racine du dépôt SAMA-PACK")
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    names = ("app.js", "index.html", "styles.css")
    paths = {name: root / name for name in names}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        print("Fichiers manquants :\n" + "\n".join(missing), file=sys.stderr)
        return 2
    original = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}
    try:
        updated = {
            "app.js": patch_app(original["app.js"]),
            "index.html": patch_html(original["index.html"]),
            "styles.css": patch_css(original["styles.css"]),
        }
        ok, message = check_js(updated["app.js"])
        if not ok:
            raise ValueError("Erreur de syntaxe app.js :\n" + message)
    except Exception as exc:
        print(f"Contrôle arrêté : {exc}", file=sys.stderr)
        print("Aucun fichier n’a été écrit.", file=sys.stderr)
        return 3

    print("Contrôles réussis :")
    print("  ✓ Accueil et catalogue des packs conservés; bloc « Nos packs à découvrir » laissé commenté")
    print("  ✓ Catalogues individuels des produits de nettoyage et outils ajoutés")
    print("  ✓ Formulaire admin d’ajout/modification/masquage des articles ajouté")
    print("  ✓ Carnet de prospection avec modification, suppression et statuts ajouté")
    print("  ✓ Sécurité de visibilité des prospects appliquée côté Supabase")
    print("  ✓ Syntaxe JavaScript vérifiée" if shutil.which("node") else "  ✓ Contrôles structurels terminés (Node.js non disponible)")
    for name in names:
        diff = list(difflib.unified_diff(original[name].splitlines(), updated[name].splitlines(), fromfile=name, tofile=name + ".new", n=1))
        print(f"  {name}: {len(original[name])} -> {len(updated[name])} caractères; {len(diff)} lignes de diff")
    if not args.apply:
        print("\nSimulation uniquement. Aucun fichier n’a été écrit. Relance avec --apply pour appliquer le correctif.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backups = []
    try:
        for name, path in paths.items():
            backup = path.with_name(path.name + f".bak-{stamp}")
            shutil.copy2(path, backup)
            backups.append(backup)
        for name, path in paths.items():
            path.write_text(updated[name], encoding="utf-8")
    except Exception as exc:
        for name, path in paths.items():
            backup = next((b for b in backups if b.name.startswith(path.name + ".bak-")), None)
            if backup and backup.exists(): shutil.copy2(backup, path)
        print(f"Erreur d’écriture; restauration tentée : {exc}", file=sys.stderr)
        return 4
    print("\nCorrectif appliqué. Sauvegardes :")
    for backup in backups: print("  " + backup.name)
    print("\nEnsuite : node --check app.js && git diff --check, inspecte git diff, puis publie index.html, app.js et styles.css.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
