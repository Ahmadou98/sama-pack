/* Sama-Pack V2 — Supabase Auth, commandes en ligne, comptes administrateurs, audit et notifications. */
(() => {
  "use strict";

  const SUPABASE_URL = "https://tbxxrnhcfuaeaatlrdtr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo"; // clé publique uniquement; RLS protège les données.
  const CART_KEY = "sama_pack_cart_v2";
  const PRODUCTS_PER_PAGE = 20;
  const PROMO_ROTATE_MS = 6500;
  let currentProductPage = 1;
  let productReviewStats = Object.create(null);
  let currentPromoIndex = 0;
  let promoCarouselTimer = null;
  let promoCountdownTimer = null;
  const FALLBACK_PRODUCTS = window.SAMA_PRODUCTS || [];
  const iconById = {SP01:"🧼",SP02:"👶",SP03:"🧽",SP04:"🧼",SP05:"💼",SP06:"🍳",SP07:"🌸",SP08:"🏡",SP09:"🎉",SP10:"🏪"};
  const $ = (id) => document.getElementById(id);

  let client = null;
  let products = FALLBACK_PRODUCTS.map(normalizeFallbackProduct);
  let currentUser = null;
  let currentProfile = null;
  let adminInitialized = true;
  let userNotifications = [];
  let notificationsChannel = null;
  let authBusy = false;
  let editingProductId = null;
  let currentAdminView = "dashboard";
  let stockRows = [];
  let cachedOrders = [];
  let cachedOrderItems = [];
  let cachedCustomers = [];
  let cachedQuotes = [];
  let cachedExpenses = [];
  let cachedSuppliers = [];
  let appSettings = { company: "SAMA-PACK", whatsapp: "", deliveryFee: 1500, currency: "FCFA", homepageBackgroundUrl: "" };
  let cart = loadCart();

  function normalizeFallbackProduct(p) {
    return { id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"), name: String(p.name || "Pack"), cat: String(p.cat || p.category || "Autre"), category: String(p.cat || p.category || "Autre"), price: Number(p.price || 0), desc: String(p.desc || p.description || ""), description: String(p.desc || p.description || ""), items: Array.isArray(p.items) ? p.items : [], image_path: p.image_path || "", active: p.active !== false, promo_active: p.promo_active === true, promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale"), promo_end_at: p.promo_end_at || null };
  }
  function normalizeProduct(p) {
    return { ...p, id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"), cat: String(p.category || p.cat || "Autre"), category: String(p.category || p.cat || "Autre"), price: Number(p.price || 0), desc: String(p.description || p.desc || ""), description: String(p.description || p.desc || ""), items: Array.isArray(p.items) ? p.items : [], image_path: String(p.image_path || ""), active: p.active !== false, promo_active: p.promo_active === true, promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale") };
  }
  function publicProductRef(p) { return String(p?.public_ref || p?.id || ""); }
  function availabilityStatusLabel(status) { return status === "out_of_stock" ? "Rupture de stock" : "Disponible"; }
  function availabilityBadgeHtml(p) {
    const out = p?.availability_status === "out_of_stock";
    return `<span class="availability-badge ${out ? "is-out" : "is-available"}">${out ? "Rupture de stock" : "Disponible"}</span>`;
  }
  function canSellProduct(p) { return Boolean(p && p.active && p.availability_status !== "out_of_stock" && Number(p.price) > 0); }

  function hasPromotion(p) {
    if (!p || p.promo_active !== true || p.promo_price == null || p.promo_price === "") return false;
    if (p.promo_end_at) { const end = new Date(p.promo_end_at).getTime(); if (Number.isFinite(end) && end <= Date.now()) return false; }
    const regular = Number(p.price), special = Number(p.promo_price);
    return Number.isFinite(regular) && Number.isFinite(special) && special >= 0 && special < regular;
  }
  function getEffectivePrice(p) { return hasPromotion(p) ? Number(p.promo_price) : Number(p?.price || 0); }
  function priceDisplayHtml(p) {
    if (!hasPromotion(p)) return `<div class="price">${money(p.price)}</div>`;
    return `<div class="promo-price-block"><div class="price">${money(getEffectivePrice(p))}</div><div class="old-price">${money(p.price)}</div></div><span class="promo-label">${esc(p.promo_label || "Offre spéciale")}</span>`;
  }
  function loadCart() {
    try { const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(value) ? value.filter(x => x && typeof x.id === "string" && Number(x.qty) > 0).map(x => ({ id: x.id, qty: Math.min(99, Math.max(1, Number(x.qty) || 1)) })) : []; }
    catch { return []; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Le panier fonctionne aussi en mémoire si le navigateur bloque le stockage. */ } }
  function money(n) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + " FCFA"; }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
  function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }
  function toLocalDateTimeInput(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
  function toast(message, isError = false) {
    const el = $("toast"); if (!el) return;
    el.textContent = message; el.classList.toggle("toast-error", Boolean(isError)); el.classList.add("show");
    clearTimeout(toast._timer); toast._timer = setTimeout(() => el.classList.remove("show"), 3500);
  }
  function setBusy(form, busy, buttonText) {
    if (!form) return;
    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (button) { if (busy) { button.dataset.oldText = button.textContent; button.disabled = true; button.textContent = buttonText || "Traitement…"; } else { button.disabled = false; if (button.dataset.oldText) button.textContent = button.dataset.oldText; delete button.dataset.oldText; } }
  }
  function errorMessage(error) {
    const raw = String(error?.message || error?.error_description || "Une erreur est survenue.");
    if (/Invalid login credentials/i.test(raw)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(raw)) return "Confirme d’abord ton adresse e-mail grâce au lien reçu.";
    if (/already registered|User already registered/i.test(raw)) return "Un compte utilise déjà cet e-mail. Connecte-toi plutôt.";
    if (/password should be at least/i.test(raw)) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (/row-level security|permission denied|not allowed/i.test(raw)) return "Cette action n’est pas autorisée pour ce compte.";
    return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
  }
  function getP(id) { return products.find(p => p.id === id) || null; }
  function waNumber() { const n = String(appSettings.whatsapp || "").replace(/\D/g, ""); return (!n || n === "221770000000") ? "" : n; }
  function whatsappUrl(msg) { const n = waNumber(); return n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : "#"; }
  function openWA(msg) { const url = whatsappUrl(msg); if (url === "#") { toast("Le numéro WhatsApp professionnel doit être configuré dans Gestion → Paramètres.", true); return; } window.open(url, "_blank", "noopener,noreferrer"); }

  async function getProfile(user = currentUser) {
    if (!client || !user) return null;
    const { data, error } = await client.from("profiles").select("id,full_name,phone,email,role,created_at").eq("id", user.id).maybeSingle();
    if (error) { console.warn("Profile unavailable", error); return null; }
    return data;
  }
  async function isAdminInitialized() {
    if (!client) return true;
    const { data, error } = await client.rpc("sama_admin_initialized");
    if (error) { console.warn("Admin bootstrap state unavailable", error); return true; }
    return Boolean(data);
  }
  function isAdmin() { return currentProfile?.role === "admin"; }

  function renderProductRatingSummary(productId) {
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

  let editingProspectId = null;
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

  function readProductPricing(formData) {
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

  async function saveProductSupplierLink(productId, formData, currentLink = null) {
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

  async function renderIndividualCatalogAdmin() {
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

  async function editCatalogItem(id) {
    editingCatalogItemId = id || null;
    await renderIndividualCatalogAdmin();
    if (editingCatalogItemId) $("adminContent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function archiveCatalogItem(id, active) {
    const action = active ? "rendre visible" : "masquer";
    const product = getP(id);
    if (active && (!product || Number(product.price) <= 0)) return toast("Renseigne un prix de vente supérieur à zéro avant la publication.", true);
    if (!window.confirm(`Confirmer : ${action} cet article dans le catalogue ?`)) return;
    const { error } = await client.from("products").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(active ? "Article publié." : "Article masqué du catalogue.");
    await loadPublicData();
    await renderIndividualCatalogAdmin();
  }

  async function loadPublicData() {
    if (!client) return;
    const { data: rows, error } = await client.from("products")
      .select("id,public_ref,availability_status,name,catalog_type,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")
      .order("id", { ascending: true });
    if (!error && Array.isArray(rows)) products = rows.map(normalizeProduct);
    else console.warn("Catalogue distant indisponible; affichage du catalogue de secours.", error);
    const { data: setting, error: settingError } = await client.from("settings")
      .select("id,company,whatsapp,delivery_fee,currency,homepage_background_url").eq("id", true).maybeSingle();
    if (!settingError && setting) {
      appSettings = { company: setting.company || "SAMA-PACK", whatsapp: String(setting.whatsapp || ""), deliveryFee: Number(setting.delivery_fee || 0), currency: setting.currency || "FCFA", homepageBackgroundUrl: String(setting.homepage_background_url || "") };
      applyHomepageBackground();
    } else if (settingError) console.warn("Paramètres distants indisponibles.", settingError);
    await loadProductReviewStats();
    const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active && p.catalog_type === "pack").length);
    updateContact(); updateCategoryFilter(); renderTop(); renderProducts(); renderPromoCarousel(); updateCartCount();
  }
  function getCurrentCatalogType() {
    const value = document.body?.dataset?.catalogType;
    return value === "product" || value === "tool" ? value : "pack";
  }

  function updateCategoryFilter() {
    const filter = $("categoryFilter"); if (!filter) return;
    const old = filter.value || "all";
    const pageType = getCurrentCatalogType();
    const categories = [...new Set(products.filter(p => p.catalog_type === pageType && (p.active || isAdmin())).map(p => p.cat).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));
    filter.innerHTML = '<option value="all">Toutes les catégories</option>' + categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    filter.value = categories.includes(old) ? old : "all";
  }
  function updateContact() {
    const contact = $("contactPhone"); const n = waNumber();
    if (contact) contact.textContent = n ? "+" + n : "WhatsApp à configurer";
  }
  function applyHomepageBackground() {
    const hero = $("home");
    if (!hero) return;

    const src = String(appSettings.homepageBackgroundUrl || "").trim();

    if (!src.toLowerCase().startsWith("https://")) {
      hero.classList.remove("has-custom-bg");
      hero.style.removeProperty("--hero-custom-background");
      return;
    }

    const safeSrc = encodeURI(src);
    hero.style.setProperty(
      "--hero-custom-background",
      `url("${safeSrc}")`
    );
    hero.classList.add("has-custom-bg");
  }

  function renderTop() {
    const el = $("heroTopPacks"); if (!el) return;
    const tops = products.filter(p => p.active && p.catalog_type === "pack").sort((a,b) => Number(hasPromotion(b)) - Number(hasPromotion(a))).slice(0, 3);
    el.innerHTML = tops.map(p => `<div class="mini-pack"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><small>${esc(publicProductRef(p))} · ${availabilityStatusLabel(p.availability_status)} · ${money(getEffectivePrice(p))}${hasPromotion(p) ? " · Promo" : ""}</small></div></div>`).join("") || '<div class="empty">Les packs seront bientôt disponibles.</div>';
  }
  function promoImageOnly(p) {
  const path = String(p.image_path || "").trim();

  if (!path) {
    return '<div class="promo-visual promo-visual-empty"></div>';
  }

  const src = /^https?:\/\//i.test(path)
    ? path
    : path.replace(/^\//, "");

  return `<div class="promo-visual product-image-frame">
    <img
      class="product-photo"
      src="${esc(src)}"
      alt="${esc(p.name)}"
      loading="lazy"
    >
  </div>`;
}
  function renderPromoCarousel() {
    const section = $("promoSection"), carousel = $("promoCarousel"), dots = $("promoDots");
    if (!section || !carousel) return;
    const promos = products.filter(p => p.active && p.catalog_type === "pack" && p.availability_status !== "out_of_stock" && Number(p.price) > 0 && hasPromotion(p));
    section.classList.remove("hidden");
    const topPacks = $("heroTopPacks");
    if (topPacks) topPacks.classList.remove("hidden");
    const arrows = $("promoArrows");
    if (arrows) arrows.classList.toggle("hidden", promos.length < 2);
    if (!promos.length) {
      carousel.innerHTML = '<div class="flash-empty"><span class="flash-empty-icon">✦</span><div><strong>Aucune vente flash pour le moment</strong><p>De nouvelles offres seront affichées ici. En attendant, découvre tous nos packs.</p><a class="btn primary" href="#catalogue">Explorer le catalogue</a></div></div>';
      if (dots) dots.innerHTML = "";
      currentPromoIndex = 0;
      return;
    }
    currentPromoIndex = ((currentPromoIndex % promos.length) + promos.length) % promos.length;
    const p = promos[currentPromoIndex];
    const discount = p.price > 0 ? Math.round((1 - getEffectivePrice(p) / Number(p.price)) * 100) : 0;
    const countdown = p.promo_end_at
      ? `<div class="flash-countdown" data-countdown-end="${esc(p.promo_end_at)}"><span>FIN DE L’OFFRE DANS</span><strong>--j : --h : --m : --s</strong></div>`
      : '<div class="flash-countdown is-open"><span>OFFRE EN COURS</span><strong>Prix spécial disponible</strong></div>';
    const description = String(p.desc || p.description || "Profite de cette offre spéciale SAMA-PACK.").trim();
    carousel.innerHTML = `<article class="flash-slide promo-slide-in">
      <div class="flash-photo">${promoImageOnly(p)}</div>
      <div class="flash-content">
        <div class="flash-kickers"><span class="flash-badge">⚡ VENTE FLASH</span><span class="flash-offer-label">${esc(p.promo_label || "Prix spécial")}</span></div>
        <div class="flash-copy-main"><h3>${esc(p.name)}</h3><p>${esc(description.length > 150 ? description.slice(0,147) + "…" : description)}</p></div>
        <div class="flash-price-row"><strong>${money(getEffectivePrice(p))}</strong><del>${money(p.price)}</del><span class="flash-discount">−${discount}%</span></div>
        ${countdown}
        <div class="promo-actions"><button class="btn flash-detail-btn" onclick="openProduct('${esc(p.id)}')">Voir le pack</button><button class="btn flash-add-btn" onclick="addToCart('${esc(p.id)}')">Ajouter au panier&nbsp; +</button></div>
      </div>
    </article>`;
    if (dots) dots.innerHTML = promos.map((item, index) => `<button class="promo-dot ${index === currentPromoIndex ? "active" : ""}" aria-label="Afficher la vente flash ${index + 1}" aria-current="${index === currentPromoIndex ? "true" : "false"}" onclick="goToPromo(${index})"></button>`).join("");
    updatePromoCountdowns();
  }
  function updatePromoCountdowns() {
    let expired = false;
    document.querySelectorAll("[data-countdown-end]").forEach(el => {
      const end = new Date(el.dataset.countdownEnd || "").getTime();
      if (!Number.isFinite(end)) return;
      const remaining = end - Date.now();
      if (remaining <= 0) { expired = true; return; }
      const seconds = Math.floor(remaining / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      const pad = n => String(n).padStart(2, "0");
      const strong = el.querySelector("strong");
      if (strong) strong.textContent = `${days}j : ${pad(hours)}h : ${pad(minutes)}m : ${pad(secs)}s`;
    });
    if (expired) { renderProducts(); renderPromoCarousel(); }
  }
  function movePromo(direction) {
    const count = products.filter(p => p.active && p.catalog_type === "pack" && p.availability_status !== "out_of_stock" && Number(p.price) > 0 && hasPromotion(p)).length;
    if (count < 2) return;
    currentPromoIndex = (currentPromoIndex + direction + count) % count;
    renderPromoCarousel();
  }
  function goToPromo(index) { currentPromoIndex = Math.max(0, Number(index) || 0); renderPromoCarousel(); }
  function startPromoCarousel() {
    if (promoCarouselTimer) window.clearInterval(promoCarouselTimer);
    if (promoCountdownTimer) window.clearInterval(promoCountdownTimer);
    promoCarouselTimer = window.setInterval(() => {
      const count = products.filter(p => p.active && p.catalog_type === "pack" && p.availability_status !== "out_of_stock" && Number(p.price) > 0 && hasPromotion(p)).length;
      if (count > 1) { currentPromoIndex = (currentPromoIndex + 1) % count; renderPromoCarousel(); }
    }, PROMO_ROTATE_MS);
    promoCountdownTimer = window.setInterval(updatePromoCountdowns, 1000);
    updatePromoCountdowns();
  }
  function imageOrEmoji(p, klass = "pack-visual") {
    const fallback = `<div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div>`;
    if (!p.image_path) return `<div class="${klass}">${fallback}</div>`;
    const path = p.image_path;
    const src = /^https?:\/\//i.test(path) ? path : path.replace(/^\//, "");
    return `<div class="${klass} product-image-frame"><img class="product-photo" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('product-image-frame');this.parentElement.innerHTML='${fallback.replace(/'/g,"&#039;").replace(/`/g,"&#096;")}'"></div>`;
  }
  function renderProducts() {
    const grid = $("productGrid"); if (!grid) return;
    const q = String($("searchBox")?.value || "").toLowerCase().trim();
    const c = $("categoryFilter")?.value || "all";
    const currentType = getCurrentCatalogType();
    const arr = products.filter(p => p.active && p.catalog_type === currentType && (c === "all" || p.cat === c) && [p.name,p.public_ref,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));
    const pages = Math.max(1, Math.ceil(arr.length / PRODUCTS_PER_PAGE));
    currentProductPage = Math.min(Math.max(1, currentProductPage), pages);
    const start = (currentProductPage - 1) * PRODUCTS_PER_PAGE;
    grid.innerHTML = arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || '<div class="empty">Aucun pack trouvé. Essaie une autre recherche.</div>';
    const pagination = $("productPagination");
    if (pagination) pagination.innerHTML = arr.length > PRODUCTS_PER_PAGE ? `<button class="btn ghost small" ${currentProductPage === 1 ? "disabled" : ""} onclick="goToProductPage(${currentProductPage - 1})">← Précédent</button><span>Page ${currentProductPage} / ${pages} · ${arr.length} packs</span><button class="btn ghost small" ${currentProductPage === pages ? "disabled" : ""} onclick="goToProductPage(${currentProductPage + 1})">Suivant →</button>` : "";
    renderIndividualCatalogs();
  }
  function goToProductPage(page) {
    currentProductPage = Math.max(1, Number(page) || 1);
    renderProducts();
    $("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function productCard(p) {
    const photo = p.image_path ? `<img class="product-photo" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    const out = p.availability_status === "out_of_stock";
    const canAdd = canSellProduct(p);
    return `<article class="product-card"><div class="pack-visual ${p.image_path ? "has-photo" : ""}">${photo}<div class="pack-box ${p.image_path ? "photo-fallback" : ""}" ${p.image_path ? "style=\"display:none\"" : ""}><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div>${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body">${availabilityBadgeHtml(p)}<div class="product-reference">Réf. SAMA-PACK : <strong>${esc(publicProductRef(p))}</strong></div><div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div>${renderProductRatingSummary(p.id)}<div class="price-row">${priceDisplayHtml(p)}<span class="small-note">TTC</span></div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')" ${canAdd ? "" : "disabled"}>${out ? "Rupture" : canAdd ? "Ajouter" : "Prix à confirmer"}</button></div></div></article>`;
  }

  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const photo = p.image_path ? `<img class="product-photo product-photo-detail" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" onerror="this.style.display='none'">` : `<div class="pack-visual"><div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(publicProductRef(p))}</div></div></div>`;
    const canAdd = canSellProduct(p);
    showModal(`<div class="modal-head"><div><div class="eyebrow">${esc(p.cat)}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>${photo}<div class="product-detail-meta"><span class="product-reference">Réf. SAMA-PACK : <strong>${esc(publicProductRef(p))}</strong></span>${availabilityBadgeHtml(p)}</div><div id="productRatingSummaryDetail">${renderProductRatingSummary(p.id)}</div><p>${esc(p.desc)}</p><ul class="pack-items">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul><div class="price-row">${priceDisplayHtml(p)}<button class="btn primary" ${canAdd ? `onclick="addToCart('${esc(p.id)}');closeModal()"` : "disabled"}>${p.availability_status === "out_of_stock" ? "Rupture de stock" : canAdd ? "Ajouter au panier" : "Prix à confirmer"}</button></div><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="${esc(p.id)}"><p class="review-loading">Chargement des avis…</p></section>`);
    void renderProductReviews(p.id);
  }

  function addToCart(id) {
    const p = getP(id); if (!p || !p.active) { toast("Cet article n’est plus publié.", true); return; } if (p.availability_status === "out_of_stock") { toast("Cet article est en rupture de stock.", true); return; } if (Number(p.price) <= 0) { toast("Le prix de cet article doit être confirmé avant la commande.", true); return; }
    const line = cart.find(i => i.id === id);
    if (line) line.qty = Math.min(99, line.qty + 1); else cart.push({ id, qty: 1 });
    saveCart(); updateCartCount(); toast("Pack ajouté au panier.");
  }
  function updateCartCount() { const el = $("cartCount"); if (el) el.textContent = String(cart.reduce((sum, i) => sum + i.qty, 0)); }
  function saveAndRenderCart() { saveCart(); updateCartCount(); renderCartModal(); }
  function cartTotals() { const subtotal = cart.reduce((sum, i) => sum + getEffectivePrice(getP(i.id)) * i.qty, 0); const delivery = Number(appSettings.deliveryFee || 0); return { subtotal, delivery, total: subtotal + delivery }; }
  function showModal(body) { $("modalRoot").innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-card">${body}</div></div>`; }
  function closeModal() { $("modalRoot").innerHTML = ""; }
  function renderCartModal() {
    if (!cart.length) { showModal(`<div class="modal-head"><h2>Ton panier</h2><button class="close" onclick="closeModal()">✕</button></div><div class="empty">Ton panier est vide.<br><br><a class="btn primary" href="#catalogue" onclick="closeModal()">Voir le catalogue</a></div>`); return; }
    const t = cartTotals();
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Ton panier</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="cart-list">${cart.map(i => { const p = getP(i.id); if (!p) return ""; return `<div class="cart-item"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(getEffectivePrice(p))} / pack</div></div><div class="qty"><button onclick="changeQty('${esc(p.id)}',-1)" aria-label="Retirer une unité">−</button><b>${i.qty}</b><button onclick="changeQty('${esc(p.id)}',1)" aria-label="Ajouter une unité">+</button></div></div>`; }).join("")}</div><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(t.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(t.delivery)}</strong></div><div class="summary-row total"><span>Total estimé</span><strong>${money(t.total)}</strong></div></div><p class="small-note">Le total définitif est calculé et validé par le serveur au moment de confirmer la commande.</p><button class="btn primary full" onclick="checkoutModal()">Passer la commande</button>`);
  }
  function changeQty(id, delta) { const x = cart.find(i => i.id === id); if (!x) return; x.qty += delta; if (x.qty <= 0) cart = cart.filter(i => i.id !== id); if (x.qty > 99) x.qty = 99; saveAndRenderCart(); }

  function openAccountModal() {
    if (currentUser) { showAccountHome(); return; }
    renderAuthForm("login");
  }
  function renderAuthForm(mode = "login", message = "") {
    const signup = mode === "signup";
    showModal(`<div class="modal-head"><div><div class="eyebrow">ESPACE CLIENT</div><h2>${signup ? "Créer un compte" : "Se connecter"}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p class="muted">Crée ton compte pour commander directement sur Sama-Pack, retrouver tes commandes et recevoir des notifications.</p>${message ? `<div class="inline-message">${esc(message)}</div>` : ""}<form id="authForm" class="checkout-grid"><input class="input full ${signup ? "" : "hidden"}" name="full_name" placeholder="Nom complet" autocomplete="name" ${signup ? "required minlength=2" : ""}><input class="input ${signup ? "" : "full"}" name="email" type="email" required placeholder="Adresse e-mail" autocomplete="email"><input class="input ${signup ? "" : "hidden"}" name="phone" placeholder="Téléphone (facultatif)" autocomplete="tel" ${signup ? "" : "disabled"} ${signup ? "" : "value=\"\""}><input class="input full" name="password" type="password" required minlength="8" placeholder="Mot de passe (8 caractères minimum)" autocomplete="${signup ? "new-password" : "current-password"}"><div class="full auth-actions"><button class="btn primary full" type="submit">${signup ? "Créer mon compte" : "Se connecter"}</button><button class="link-btn dark-link" type="button" onclick="renderAuthForm('${signup ? "login" : "signup"}')">${signup ? "J’ai déjà un compte" : "Créer un compte client"}</button>${signup ? "" : `<button class="link-btn dark-link" type="button" onclick="resetPassword()">Mot de passe oublié ?</button>`}</div></form><p class="small-note">Tes commandes et coordonnées ne seront accessibles qu’à toi et aux administrateurs autorisés.</p>`);
    const form = $("authForm");
    form.onsubmit = async (e) => {
      e.preventDefault(); if (authBusy) return; authBusy = true; setBusy(form, true, signup ? "Création du compte…" : "Connexion…");
      const fd = new FormData(form); const email = String(fd.get("email") || "").trim().toLowerCase(); const password = String(fd.get("password") || "");
      try {
        if (signup) {
          const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: "https://sama-pack.store/", data: { full_name: String(fd.get("full_name") || "").trim(), phone: String(fd.get("phone") || "").trim() } } });
          if (error) throw error;
          if (data.session) { await syncAuth(data.user); closeModal(); toast("Compte créé. Bienvenue sur Sama-Pack !"); }
          else { renderAuthForm("login", "Compte créé. Vérifie ta boîte e-mail et clique sur le lien de confirmation avant de te connecter."); }
        } else {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await syncAuth(data.user); closeModal(); toast("Connexion réussie.");
        }
      } catch (err) { toast(errorMessage(err), true); setBusy(form, false); }
      finally { authBusy = false; }
    };
  }
  async function resetPassword() {
    const emailInput = $("authForm")?.querySelector('[name="email"]'); const email = String(emailInput?.value || "").trim().toLowerCase();
    if (!email) { toast("Saisis ton adresse e-mail d’abord.", true); return; }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: "https://sama-pack.store/" });
    if (error) toast(errorMessage(error), true); else toast("Lien de réinitialisation envoyé si cette adresse existe.");
  }
  async function showAccountHome() {
    if (!currentUser) { renderAuthForm("login"); return; }
    const p = currentProfile || await getProfile();
    const { data: rows, error } = await client.from("orders").select("id,created_at,status,total,subtotal,delivery,customer_name,customer_phone,delivery_address,delivery_zone").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(15);
    const orders = error ? [] : (rows || []);
    const initialized = await isAdminInitialized(); adminInitialized = initialized;
    const orderHtml = orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Date</th><th>Total</th><th>Statut</th></tr></thead><tbody>${orders.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${money(o.total)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty compact-empty">Tu n’as pas encore passé de commande en ligne.</div>';
    showModal(`<div class="modal-head"><div><div class="eyebrow">MON COMPTE</div><h2>${esc(p?.full_name || currentUser.email || "Client")}</h2><p class="small-note">${esc(currentUser.email || "")}</p></div><button class="close" onclick="closeModal()">✕</button></div><div class="account-buttons"><button class="btn secondary" onclick="enableBrowserNotifications()">🔔 Activer les alertes du navigateur</button><button class="btn ghost" onclick="loadAndShowNotifications()">Mes notifications (${userNotifications.filter(n=>!n.read_at).length})</button></div><div class="panel account-orders"><h3>Mes commandes</h3>${orderHtml}</div><div class="panel account-password"><h3>${currentUser?.last_sign_in_at ? "Sécurité du compte" : "Définir un mot de passe"}</h3><form id="changePasswordForm" class="checkout-grid"><input class="input full" name="password" type="password" minlength="8" required placeholder="Nouveau mot de passe (8 caractères minimum)"><button class="btn ghost full" type="submit">Enregistrer le mot de passe</button></form></div>${!initialized ? `<div class="panel bootstrap-panel"><h3>Configurer le premier administrateur</h3><p>Cette option n’apparaît que tant qu’aucun administrateur n’est configuré. Utilise le code initial transmis par le propriétaire.</p><form id="bootstrapAdminForm" class="checkout-grid"><input class="input full" name="bootstrap_token" autocomplete="off" required placeholder="Code initial du propriétaire"><button class="btn primary full" type="submit">Devenir le premier administrateur</button></form></div>` : ""}<button class="btn ghost full" onclick="signOut()">Se déconnecter</button>`);
    const pw = $("changePasswordForm"); pw.onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; const password = String(new FormData(form).get("password") || ""); if (password.length < 8) return toast("Choisis au moins 8 caractères.", true); setBusy(form, true, "Enregistrement…"); const { error } = await client.auth.updateUser({ password }); if (error) toast(errorMessage(error), true); else { toast("Mot de passe mis à jour."); form.reset(); } setBusy(form, false); };
    const bootstrap = $("bootstrapAdminForm"); if (bootstrap) bootstrap.onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; setBusy(form, true, "Configuration…"); const token = String(new FormData(form).get("bootstrap_token") || "").trim(); const { data, error } = await client.rpc("sama_bootstrap_first_admin", { p_token: token }); setBusy(form, false); if (error) return toast(errorMessage(error), true); await syncAuth(currentUser); closeModal(); toast(data?.message || "Compte administrateur configuré."); };
  }
  async function signOut() { await client.auth.signOut(); await syncAuth(null); closeModal(); toast("Tu es déconnecté."); }
  async function syncAuth(user) {
    currentUser = user || null; currentProfile = currentUser ? await getProfile(currentUser) : null;
    adminInitialized = await isAdminInitialized();
    updateAccountButtons();
    await loadNotifications();
    setupNotificationsRealtime();
    if (isAdmin()) { updateCategoryFilter(); renderProducts(); }
  }
  function updateAccountButtons() {
    const accountBtn = $("accountBtn"); if (accountBtn) accountBtn.textContent = currentUser ? (currentProfile?.role === "admin" ? "Compte admin" : "Mon compte") : "Connexion";
    const adminBtn = $("adminBtn");
    if (adminBtn) { adminBtn.textContent = "Gestion"; adminBtn.classList.toggle("hidden", !isAdmin()); }
    const footerAdminSection = $("footerAdminSection");
    if (footerAdminSection) footerAdminSection.classList.toggle("hidden", !isAdmin());
    const adminFlag = $("adminFlag"); if (adminFlag) adminFlag.textContent = isAdmin() ? `Connecté : ${currentProfile?.full_name || currentUser?.email || "Administrateur"}` : "Espace réservé aux administrateurs";
    const n = userNotifications.filter(x => !x.read_at).length; const badge = $("notificationCount");
    if (badge) { badge.textContent = String(n > 99 ? "99+" : n); badge.classList.toggle("hidden", n === 0); }
  }
  async function loadNotifications() {
    if (!client || !currentUser) { userNotifications = []; updateAccountButtons(); return; }
    const { data, error } = await client.from("notifications").select("id,type,title,message,entity_type,entity_id,read_at,created_at").eq("recipient_user_id", currentUser.id).order("created_at", { ascending: false }).limit(30);
    if (error) { console.warn("Notification load failed", error); return; }
    userNotifications = data || []; updateAccountButtons();
  }
  function setupNotificationsRealtime() {
    if (!client) return;
    if (notificationsChannel) { client.removeChannel(notificationsChannel); notificationsChannel = null; }
    if (!currentUser) return;
    const userId = currentUser.id;
    notificationsChannel = client.channel(`sama-pack-notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` }, payload => {
        if (!payload?.new?.id) return;
        userNotifications = [payload.new, ...userNotifications.filter(n => n.id !== payload.new.id)].slice(0, 30);
        updateAccountButtons(); toast(payload.new.title || "Nouvelle notification");
        if (document.visibilityState === "visible" && window.Notification?.permission === "granted") {
          try { new Notification(payload.new.title || "Sama-Pack", { body: payload.new.message || "Nouvelle information", icon: "/favicon.ico" }); } catch { /* Notifications du navigateur facultatives. */ }
        }
      }).subscribe();
  }
  async function enableBrowserNotifications() {
    if (!("Notification" in window)) return toast("Ce navigateur ne prend pas en charge les notifications du système.", true);
    const permission = await Notification.requestPermission();
    if (permission === "granted") { toast("Alertes du navigateur activées."); const unread = userNotifications.find(n => !n.read_at); if (unread) new Notification(unread.title, { body: unread.message }); }
    else toast("Les notifications restent visibles dans ton espace de compte.");
  }
  async function loadAndShowNotifications() {
    if (!currentUser) { renderAuthForm("login", "Connecte-toi pour consulter tes notifications et suivre tes commandes."); return; }
    await loadNotifications();
    const html = userNotifications.length ? userNotifications.map(n => `<div class="notification-item ${n.read_at ? "read" : "unread"}"><div class="notification-title">${esc(n.title)}</div><div class="notification-message">${esc(n.message)}</div><div class="notification-meta">${esc(fmtDate(n.created_at))} ${n.read_at ? "· Lue" : `<button class="link-btn dark-link" onclick="markNotificationRead('${esc(n.id)}')">Marquer comme lue</button>`}</div></div>`).join("") : '<div class="empty">Aucune notification pour le moment.</div>';
    showModal(`<div class="modal-head"><div><div class="eyebrow">CENTRE DE NOTIFICATIONS</div><h2>Notifications</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="notification-list">${html}</div><div style="height:12px"></div><button class="btn ghost full" onclick="showAccountHome()">Retour à mon compte</button>`);
  }
  async function markNotificationRead(id) {
    if (!client || !currentUser) return toast("Connecte-toi pour modifier tes notifications.", true);
    const { data, error } = await client.rpc("sama_mark_notification_read", { p_notification_id: id });
    if (error) return toast(errorMessage(error), true);
    if (data === false) return toast("Cette notification n’a pas pu être marquée comme lue.", true);
    const readAt = new Date().toISOString();
    userNotifications = userNotifications.map(n => n.id === id ? { ...n, read_at: n.read_at || readAt } : n);
    updateAccountButtons();
    await loadAndShowNotifications();
    toast("Notification marquée comme lue.");
  }

  function checkoutModal() {
    if (!cart.length) return toast("Ton panier est vide.", true);
    const unavailableLines = cart.filter(line => { const p = getP(line.id); return !canSellProduct(p); });
    if (unavailableLines.length) return toast("Retire les articles en rupture ou sans prix confirmé du panier avant de commander.", true);
    if (!currentUser) { closeModal(); renderAuthForm("login", "Connecte-toi ou crée un compte pour confirmer ta commande sans passer par WhatsApp."); return; }
    const total = cartTotals(); const profile = currentProfile || {};
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Finaliser la commande</h2></div><button class="close" onclick="closeModal()">✕</button></div><form id="checkoutForm" class="checkout-grid"><input class="input full" name="name" required minlength="2" maxlength="120" placeholder="Nom complet" value="${esc(profile.full_name || currentUser.user_metadata?.full_name || "")}"><input class="input" name="phone" required minlength="8" maxlength="25" placeholder="Téléphone" value="${esc(profile.phone || currentUser.user_metadata?.phone || "")}"><input class="input" name="zone" placeholder="Zone / quartier" maxlength="100"><input class="input full" name="address" required minlength="4" maxlength="300" placeholder="Adresse de livraison"><input class="input full" name="slot" placeholder="Créneau souhaité (facultatif)" maxlength="120"><select class="input full" name="payment"><option>Paiement à la livraison</option><option>À confirmer</option></select><div class="summary full"><div class="summary-row"><span>Estimation</span><strong>${money(total.total)}</strong></div><div class="small-note">Le montant final est recalculé côté serveur. Une confirmation apparaîtra dans ton compte.</div></div><button class="btn primary full" type="submit">Confirmer ma commande</button></form>`);
    const form = $("checkoutForm");
    form.onsubmit = async e => {
      e.preventDefault(); if (!currentUser) return toast("Reconnecte-toi avant de confirmer la commande.", true);
      setBusy(form, true, "Enregistrement de la commande…"); const f = new FormData(form);
      const payload = {
        customer: { name: String(f.get("name") || "").trim(), phone: String(f.get("phone") || "").trim(), address: String(f.get("address") || "").trim(), zone: String(f.get("zone") || "").trim() },
        slot: String(f.get("slot") || "").trim(), payment: String(f.get("payment") || "Paiement à la livraison"),
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty }))
      };
      const { data, error } = await client.rpc("sama_place_order", { p_payload: payload });
      setBusy(form, false);
      if (error) return toast(errorMessage(error), true);
      const order = data?.order;
      if (!data?.ok || !order?.id) return toast("La commande n’a pas pu être confirmée. Réessaie.", true);
      const profileUpdate = await client.from("profiles").update({full_name:payload.customer.name,phone:payload.customer.phone}).eq("id",currentUser.id);
      if (!profileUpdate.error) currentProfile = {...(currentProfile||{}),full_name:payload.customer.name,phone:payload.customer.phone};
      cart = []; saveCart(); updateCartCount(); closeModal();
      toast(`Commande ${order.id} enregistrée !`);
      showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE CONFIRMÉE</div><h2>Merci pour ta commande !</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="confirmation-mark">✓</div><p>Ta commande est enregistrée dans Sama-Pack. Tu peux la suivre depuis ton compte sans passer par WhatsApp.</p><div class="summary"><div class="summary-row"><span>Référence</span><strong>${esc(order.id)}</strong></div><div class="summary-row"><span>Sous-total</span><strong>${money(order.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(order.delivery)}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(order.total)}</strong></div></div><div style="height:12px"></div><button class="btn primary full" onclick="showAccountHome()">Suivre ma commande</button>`);
      await loadNotifications();
    };
  }

  function openQuoteModal() {
    showModal(`<div class="modal-head"><div><div class="eyebrow">B2B</div><h2>Demander un devis</h2></div><button class="close" onclick="closeModal()">✕</button></div><form id="quoteForm" class="checkout-grid"><input class="input" name="company" required maxlength="150" placeholder="Entreprise / structure"><input class="input" name="phone" required maxlength="30" placeholder="Téléphone"><input class="input full" name="need" required maxlength="250" placeholder="Besoin (ex. 20 packs professionnels par mois)"><input class="input full" name="email" type="email" placeholder="E-mail (facultatif)"><textarea class="input full" name="message" maxlength="2000" placeholder="Précisions"></textarea><button class="btn primary full" type="submit">Envoyer la demande de devis</button></form>`);
    const form = $("quoteForm"); form.onsubmit = async e => {
      e.preventDefault(); setBusy(form, true, "Envoi…"); const f = new FormData(form);
      const payload = { company: String(f.get("company") || "").trim(), phone: String(f.get("phone") || "").trim(), need: String(f.get("need") || "").trim(), email: String(f.get("email") || "").trim(), message: String(f.get("message") || "").trim() };
      const { data, error } = await client.rpc("sama_create_quote", { p_payload: payload }); setBusy(form, false);
      if (error) return toast(errorMessage(error), true);
      closeModal(); toast(`Demande de devis envoyée (${data?.id || "enregistrée"}).`);
    };
  }

  async function openAdmin() {
    if (!currentUser) { openAccountModal(); toast("Connecte-toi avec un compte administrateur."); return; }
    if (!isAdmin()) { toast("Ce compte n’a pas les droits d’administration.", true); return; }
    $("adminPanel").classList.remove("hidden"); await showAdminView("dashboard");
  }
  function closeAdmin() { $("adminPanel").classList.add("hidden"); }
  function statusLabel(status) { return ({new:"Nouvelle",processing:"En préparation",delivered:"Livrée",cancelled:"Annulée",won:"Gagné",lost:"Perdu"})[status] || status || "—"; }
  function actionLabel(action) { return ({pack_created:"Pack créé",pack_updated:"Pack modifié",pack_deleted:"Pack supprimé",order_status_changed:"Statut de commande modifié",order_placed:"Commande passée",admin_bootstrap:"Premier administrateur configuré",admin_invited:"Administrateur invité",settings_updated:"Paramètres modifiés",stock_created:"Stock créé",stock_updated:"Stock modifié",supplier_created:"Fournisseur ajouté",supplier_updated:"Fournisseur modifié",supplier_deleted:"Fournisseur supprimé",expense_created:"Dépense ajoutée",expense_updated:"Dépense modifiée",expense_deleted:"Dépense supprimée",quote_created:"Demande de devis reçue",quote_updated:"Devis modifié",quote_deleted:"Devis supprimé"})[action] || action || "Action"; }
  async function showAdminView(view) {
        if (view === "prospects" || view === "catalogs") {
      if (!isAdmin()) return toast("Cette action n’est pas autorisée pour ce compte.", true);
      currentAdminView = view;
      document.querySelectorAll(".side-btn").forEach(button => button.classList.toggle("active", button.dataset.view === view));
      const title = $("adminTitle");
      if (title) title.textContent = view === "prospects" ? "Prospection" : "Produits & outils";
      if (view === "prospects") await renderProspectsAdmin();
      else await renderIndividualCatalogAdmin();
      return;
    }
if (!isAdmin()) { closeAdmin(); return toast("Accès administrateur requis.", true); }
    currentAdminView = view; editingProductId = view === "packs" ? editingProductId : null;
    document.querySelectorAll(".side-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    const titles = {dashboard:"Tableau de bord",orders:"Commandes",customers:"Clients",stock:"Stock",products:"Gestion des packs",admins:"Administrateurs",activity:"Journal des actions",suppliers:"Fournisseurs",expenses:"Dépenses",quotes:"Devis",settings:"Paramètres"};
    $("adminTitle").textContent = titles[view] || "Gestion";
    $("adminContent").innerHTML = '<div class="panel loading-panel">Chargement des données…</div>';
    try {
      let html = "";
      if (view === "dashboard") html = await adminDashboard();
      else if (view === "orders") html = await adminOrders();
      else if (view === "customers") html = await adminCustomers();
      else if (view === "stock") html = await adminStock();
      else if (view === "products" || view === "packs") html = await adminPacks();
      else if (view === "admins") html = await adminAccounts();
      else if (view === "activity") html = await adminActivity();
      else if (view === "suppliers") html = await adminSuppliers();
      else if (view === "expenses") html = await adminExpenses();
      else if (view === "quotes") html = await adminQuotes();
      else if (view === "settings") html = await adminSettings();
      $("adminContent").innerHTML = html;
      bindAdmin(view);
    } catch (error) {
      console.error("Admin view failed", error);
      $("adminContent").innerHTML = `<div class="panel"><h3>Chargement impossible</h3><p>${esc(errorMessage(error))}</p><button class="btn ghost" onclick="showAdminView('${esc(view)}')">Réessayer</button></div>`;
    }
  }
  async function readRows(table, columns = "*") {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw error;
    return data || [];
  }
  async function adminDashboard() {
    const [orders, stock, expenses, quotes, packRows] = await Promise.all([
      readRows("orders"), readRows("stock"), readRows("expenses"), readRows("quotes"), readRows("products")
    ]);
    cachedOrders = orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); stockRows = stock; cachedExpenses = expenses; cachedQuotes = quotes;
    const ca = orders.filter(o => o.status !== "cancelled").reduce((s,o) => s + Number(o.total || 0), 0);
    const pending = orders.filter(o => ["new","processing"].includes(o.status)).length;
    const stockValue = stock.reduce((s,x) => s + Number(x.quantity || 0) * Number(x.unit_cost || 0), 0);
    const low = stock.filter(x => Number(x.min_quantity || 0) > 0 && Number(x.quantity || 0) <= Number(x.min_quantity || 0)).length;
    const recent = orders.slice(0, 7);
    return `<div class="admin-cards"><div class="kpi"><div class="label">Chiffre d’affaires enregistré</div><div class="value">${money(ca)}</div></div><div class="kpi"><div class="label">Commandes à traiter</div><div class="value">${pending}</div></div><div class="kpi"><div class="label">Valeur du stock</div><div class="value">${money(stockValue)}</div></div><div class="kpi"><div class="label">Packs actifs</div><div class="value">${packRows.filter(p=>p.active).length}</div></div></div><div class="admin-grid"><div class="panel"><h3>Commandes récentes</h3>${recent.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Client</th><th>Total</th><th>Statut</th></tr></thead><tbody>${recent.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(o.customer_name || "Client historique")}</td><td>${money(o.total)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande.</div>'}<button class="btn ghost small" onclick="showAdminView('orders')">Voir toutes les commandes</button></div><div class="panel"><h3>À surveiller</h3><p>Stock sous le seuil : <strong>${low}</strong></p><p>Demandes de devis : <strong>${quotes.filter(q=>q.status === "new").length}</strong></p><p>Dépenses enregistrées : <strong>${money(expenses.reduce((s,x)=>s+Number(x.amount||0),0))}</strong></p><p>Administrateur connecté : <strong>${esc(currentProfile?.full_name || currentUser.email)}</strong></p></div></div>`;
  }
  async function loadOrdersWithItems() {
    const [orders, customers] = await Promise.all([readRows("orders"), readRows("customers")]);
    const sorted = orders.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    let items = [];
    if (sorted.length) { const result = await client.from("order_items").select("id,order_id,product_id,product_name,quantity,unit_price").in("order_id", sorted.map(o => o.id)); if (result.error) throw result.error; items = result.data || []; }
    cachedOrders = sorted; cachedCustomers = customers; cachedOrderItems = items;
    return sorted.map(o => {
      const customer = customers.find(c => c.id === o.customer_id) || {};
      return { ...o, customer_name: o.customer_name || customer.name || "Client", customer_phone: o.customer_phone || customer.phone || "", delivery_address: o.delivery_address || customer.address || "", delivery_zone: o.delivery_zone || customer.zone || "", items: items.filter(i => i.order_id === o.id) };
    });
  }
  async function adminOrders() {
    const orders = await loadOrdersWithItems();
    return `<div class="panel"><div class="admin-panel-head"><h3>Commandes (${orders.length})</h3><button class="btn ghost small" onclick="showAdminView('orders')">Actualiser</button></div>${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th>Détails</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name)}<br><span class="small-note">${esc(o.customer_phone)}</span></td><td>${money(o.total)}</td><td><select class="input" onchange="setOrderStatus('${esc(o.id)}',this.value)">${["new","processing","delivered","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></td><td><button class="btn small ghost" onclick="showOrder('${esc(o.id)}')">Voir</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment.</div>'}</div>`;
  }
  function showOrder(id) {
    const o = cachedOrders.find(x => x.id === id); if (!o) return toast("Commande introuvable.", true);
    const customer = cachedCustomers.find(c => c.id === o.customer_id) || {};
    const lines = cachedOrderItems.filter(x => x.order_id === o.id);
    const name = o.customer_name || customer.name || "Client"; const phone = o.customer_phone || customer.phone || "";
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE</div><h2>${esc(o.id)}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p><strong>${esc(name)}</strong> · ${esc(phone)}<br>${esc(o.delivery_address || customer.address || "")} ${esc(o.delivery_zone || customer.zone || "")}<br><span class="small-note">Créée le ${esc(fmtDate(o.created_at))}</span></p><ul class="pack-items">${lines.map(i=>`<li>${Number(i.quantity)} × ${esc(i.product_name)} — ${money(i.unit_price)}</li>`).join("") || "<li>Détails des lignes indisponibles pour cette ancienne commande.</li>"}</ul><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(o.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(o.delivery)}</strong></div><div class="summary-row"><span>Paiement</span><strong>${esc(o.payment || "Paiement à la livraison")}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>`);
  }
  async function setOrderStatus(id, status) {
    if (!isAdmin()) return toast("Accès refusé.", true);
    const allowed = ["new","processing","delivered","cancelled"];
    if (!allowed.includes(status)) return toast("Statut invalide.", true);
    const { error } = await client.from("orders").update({ status }).eq("id", id);
    if (error) { toast(errorMessage(error), true); return showAdminView("orders"); }
    toast("Statut modifié. Le client sera notifié si sa commande est associée à un compte."); await showAdminView("orders");
  }
  async function adminCustomers() {
    const rows = await readRows("customers"); cachedCustomers = rows;
    return `<div class="panel"><div class="admin-panel-head"><h3>Clients (${rows.length})</h3><span class="small-note">Les comptes inscrits peuvent consulter leurs propres commandes.</span></div>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Nom</th><th>Téléphone</th><th>Zone</th><th>Commandes</th><th>Dernière commande</th></tr></thead><tbody>${rows.sort((a,b)=>new Date(b.last_order_at||0)-new Date(a.last_order_at||0)).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.zone || "")}</td><td>${Number(c.orders_count || 0)}</td><td>${esc(fmtDate(c.last_order_at))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Les clients apparaîtront après leurs premières commandes.</div>'}</div>`;
  }
  async function adminStock() {
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

  function nextProductId() {
    let max = 0; for (const p of products) { const m = /^SP(\d+)$/i.exec(p.id); if (m) max = Math.max(max, Number(m[1])); }
    return "SP" + String(max + 1).padStart(2, "0");
  }
  async function adminPacks() {
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

  function editPack(id) { editingProductId = id; showAdminView("packs"); }
  function cancelPackEdit() { editingProductId = null; showAdminView("packs"); }
  async function togglePack(id, active) {
    const product = getP(id);
    if (active && (!product || Number(product.price) <= 0)) return toast("Renseigne un prix de vente supérieur à zéro avant la publication.", true);
    const { error } = await client.from("products").update({ active }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(active ? "Pack publié dans le catalogue." : "Pack masqué du catalogue."); await loadPublicData(); await showAdminView("packs");
  }
  async function adminAccounts() {
    const { data, error } = await client.from("profiles").select("id,full_name,phone,email,role,created_at").order("created_at", { ascending: true });
    if (error) throw error;
    const admins = (data || []).filter(p=>p.role === "admin");
    return `<div class="panel"><h3>Inviter un administrateur</h3><p>Chaque administrateur utilise son propre compte. Les actions enregistrées dans le journal seront attribuées à son nom.</p><form id="inviteAdminForm" class="admin-form"><input class="input" name="full_name" required minlength="2" placeholder="Nom complet"><input class="input" name="email" type="email" required placeholder="Adresse e-mail"><button class="btn primary full" type="submit">Envoyer l’invitation</button></form><p class="small-note">L’invitation est envoyée par e-mail. Vérifie la configuration e-mail de Supabase si elle n’arrive pas.</p></div><div style="height:16px"></div><div class="panel"><h3>Administrateurs (${admins.length})</h3>${admins.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Nom</th><th>Compte</th><th>Rôle</th><th>Créé le</th></tr></thead><tbody>${admins.map(a=>`<tr><td>${esc(a.full_name||"Sans nom")}</td><td>${esc(a.email||"—")}<br><span class="small-note">${esc(a.phone||"")}</span></td><td><span class="status processing">Administrateur</span></td><td>${esc(fmtDate(a.created_at))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun administrateur n’est configuré.</div>'}</div>`;
  }
  async function adminActivity() {
    const { data, error } = await client.from("audit_logs").select("id,actor_user_id,actor_label,action,entity_type,entity_id,details,created_at").order("created_at", { ascending: false }).limit(150);
    if (error) throw error;
    return `<div class="panel"><div class="admin-panel-head"><h3>Journal des actions</h3><span class="small-note">150 dernières actions au maximum.</span></div>${data?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Compte</th><th>Action</th><th>Élément</th><th>Détails</th></tr></thead><tbody>${data.map(a=>`<tr><td>${esc(fmtDate(a.created_at))}</td><td>${esc(a.actor_label||"Système")}</td><td>${esc(actionLabel(a.action))}</td><td>${esc(a.entity_type)} ${esc(a.entity_id)}</td><td>${esc(formatAuditDetails(a.details))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Les actions effectuées après cette mise à jour apparaîtront ici.</div>'}</div>`;
  }
  function formatAuditDetails(details) { if (!details) return "—"; if (typeof details === "string") return details; return Object.entries(details).map(([k,v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ").slice(0, 240) || "—"; }
  async function adminSuppliers() {
    const rows = await readRows("suppliers"); cachedSuppliers = rows;
    return `<div class="panel"><h3>Ajouter un fournisseur</h3><form id="supplierForm" class="admin-form"><input class="input" name="name" required placeholder="Nom du fournisseur"><input class="input" name="phone" placeholder="Téléphone"><input class="input full" name="family" placeholder="Famille de produits"><input class="input full" name="terms" placeholder="MOQ / délai / conditions"><button class="btn primary full" type="submit">Ajouter le fournisseur</button></form></div><div style="height:16px"></div><div class="panel"><h3>Fournisseurs (${rows.length})</h3>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fournisseur</th><th>Téléphone</th><th>Famille</th><th>Conditions</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.phone||"")}</td><td>${esc(s.family||"")}</td><td>${esc(s.terms||"")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun fournisseur enregistré.</div>'}</div>`;
  }
  async function adminExpenses() {
    const rows = await readRows("expenses"); cachedExpenses = rows;
    return `<div class="panel"><h3>Enregistrer une dépense</h3><form id="expenseForm" class="admin-form"><input class="input" name="label" required maxlength="200" placeholder="Libellé"><input class="input" type="number" min="0" step="1" name="amount" required placeholder="Montant FCFA"><input class="input" name="category" placeholder="Catégorie"><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0,10)}"><button class="btn primary full" type="submit">Enregistrer la dépense</button></form></div><div style="height:16px"></div><div class="panel"><h3>Dépenses — Total ${money(rows.reduce((s,x)=>s+Number(x.amount||0),0))}</h3>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Montant</th></tr></thead><tbody>${rows.sort((a,b)=>new Date(b.expense_date)-new Date(a.expense_date)).map(e=>`<tr><td>${esc(e.expense_date)}</td><td>${esc(e.label)}</td><td>${esc(e.category||"")}</td><td>${money(e.amount)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune dépense enregistrée.</div>'}</div>`;
  }
  async function adminQuotes() {
    const rows = await readRows("quotes"); cachedQuotes = rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return `<div class="panel"><h3>Demandes de devis (${rows.length})</h3>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Structure</th><th>Besoin</th><th>Contact</th><th>Statut</th></tr></thead><tbody>${cachedQuotes.map(q=>`<tr><td>${esc(q.id)}</td><td>${esc(fmtDate(q.created_at))}</td><td>${esc(q.company)}</td><td>${esc(q.need)}<br><span class="small-note">${esc(q.message||"")}</span></td><td>${esc(q.phone)}<br><span class="small-note">${esc(q.email||"")}</span></td><td><select class="input" onchange="setQuoteStatus('${esc(q.id)}',this.value)">${["new","processing","won","lost"].map(s=>`<option ${q.status===s?"selected":""} value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune demande de devis.</div>'}</div>`;
  }
  async function adminSettings() {
    const [{ data, error }, { data: notificationSettings, error: notificationError }] = await Promise.all([
      client.from("settings").select("id,company,whatsapp,delivery_fee,currency,homepage_background_url").eq("id",true).maybeSingle(),
      client.from("notification_settings").select("id,order_notification_email").eq("id",true).maybeSingle()
    ]);
    if (error) throw error;
    if (notificationError) console.warn("Impossible de lire les paramètres e-mail.", notificationError);
    const s = data || appSettings;
    const notificationEmail = notificationSettings?.order_notification_email || "";
    const backgroundUrl = String(s.homepage_background_url || "");
    return `<div class="panel"><h3>Paramètres de Sama-Pack</h3><form id="settingsForm" class="admin-form">
      <label>Nom de l’entreprise<input class="input" name="company" required value="${esc(s.company||"SAMA-PACK")}"></label>
      <label>WhatsApp professionnel (ex. 22177…)<input class="input" name="whatsapp" value="${esc(s.whatsapp||"")}"></label>
      <label>Frais de livraison par défaut (FCFA)<input class="input" name="delivery_fee" type="number" min="0" step="1" value="${Number(s.delivery_fee||0)}"></label>
      <label>Devise<input class="input" name="currency" required maxlength="10" value="${esc(s.currency||"FCFA")}"></label>
      <label class="full">Image de fond de l’accueil (JPG, PNG ou WebP · 5 Mo maximum)<input class="input" name="homepage_background_file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label class="full">Ou URL HTTPS de l’image de fond<input class="input" name="homepage_background_url" type="url" placeholder="https://…" value="${esc(backgroundUrl)}"></label>
      ${backgroundUrl ? `<div class="homepage-bg-preview-wrap full"><span class="small-note">Image actuellement enregistrée</span><img class="homepage-bg-preview" src="${esc(backgroundUrl)}" alt="Aperçu du fond de l’accueil"></div>` : '<p class="small-note full">Aucune image personnalisée : le fond vert clair par défaut sera utilisé.</p>'}
      <p class="small-note full">Si tu sélectionnes un fichier, il remplace l’URL ci-dessus. Pour revenir au fond par défaut, vide l’URL et enregistre sans choisir de fichier.</p>
      <label class="full">E-mail recevant les nouvelles commandes et demandes de devis<input class="input" name="order_notification_email" type="email" placeholder="gestion@sama-pack.store" value="${esc(notificationEmail)}"></label>
      <button class="btn primary full" type="submit">Enregistrer les paramètres</button>
    </form><p class="small-note">Pour activer les e-mails, configure aussi RESEND_API_KEY et RESEND_FROM_EMAIL dans Supabase → Edge Functions → Secrets.</p></div>`;
  }
  function bindAdmin(view) {
    if (view === "packs" || view === "products") {
      const packSearch = $("packAdminSearch"); if (packSearch) packSearch.addEventListener("input", () => { const q=packSearch.value.toLowerCase().trim(); document.querySelectorAll("tr[data-admin-search-row]").forEach(row => { row.hidden = !row.dataset.search.includes(q); }); });
      const form = $("packForm"); if (form) { bindProductPriceCalculator(form); form.onsubmit = async e => {
        e.preventDefault(); if (!isAdmin()) return toast("Accès refusé.", true); setBusy(form,true,"Enregistrement…");
        const fd = new FormData(form); const pricing = readProductPricing(fd); if (pricing.error) { setBusy(form,false); return toast(pricing.error,true); } const uploadFile = fd.get("image_file"); const promoPriceInput = String(fd.get("promo_price")||"").trim(); const promoEndInput = String(fd.get("promo_end_at")||"").trim(); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:pricing.salePrice,description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",availability_status:fd.get("availability_status")==="available"?"available":"out_of_stock",promo_active:fd.get("promo_active")==="on",promo_price:promoPriceInput === "" ? null : Number(promoPriceInput),promo_label:String(fd.get("promo_label")||"Vente flash").trim() || "Vente flash",promo_end_at:promoEndInput ? new Date(promoEndInput).toISOString() : null };
        if (payload.active && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant la publication.",true); } if (payload.availability_status === "available" && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant de marquer le pack disponible.",true); } if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0) { setBusy(form,false); return toast("Complète le nom, la catégorie, le prix, la description et la composition.",true); } if (payload.promo_active && (!Number.isFinite(payload.promo_price) || payload.promo_price < 0 || payload.promo_price >= payload.price)) { setBusy(form,false); return toast("Le prix promotionnel doit être positif et inférieur au prix normal.",true); } if (payload.promo_active && payload.promo_end_at && new Date(payload.promo_end_at).getTime() <= Date.now()) { setBusy(form,false); return toast("La fin de la vente flash doit être dans le futur.",true); } if (!payload.promo_active && !Number.isFinite(payload.promo_price)) payload.promo_price = null;
        if (payload.image_path && !/^https:\/\//i.test(payload.image_path) && /^(?:javascript:|data:|vbscript:)/i.test(payload.image_path)) { setBusy(form,false); return toast("Le chemin de l’image n’est pas valide.",true); }
        let productId = editingProductId || nextProductId();
        if (uploadFile instanceof File && uploadFile.size > 0) {
          const allowed = ["image/jpeg","image/png","image/webp"];
          if (!allowed.includes(uploadFile.type) || uploadFile.size > 5 * 1024 * 1024) { setBusy(form,false); return toast("Choisis une image JPG, PNG ou WebP de 5 Mo maximum.",true); }
          const ext = uploadFile.type === "image/jpeg" ? "jpg" : uploadFile.type === "image/png" ? "png" : "webp";
          const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
          const { data:uploaded, error:uploadError } = await client.storage.from("sama-pack-products").upload(path,uploadFile,{cacheControl:"3600",upsert:false,contentType:uploadFile.type});
          if (uploadError) { setBusy(form,false); return toast("Envoi de la photo impossible : " + errorMessage(uploadError),true); }
          payload.image_path = client.storage.from("sama-pack-products").getPublicUrl(uploaded.path).data.publicUrl;
        }
        let result;
        if (editingProductId) result = await client.from("products").update(payload).eq("id",editingProductId);
        else result = await client.from("products").insert({id:productId,...payload});
        if (result.error) { setBusy(form,false); return toast(errorMessage(result.error),true); }
        const pricingError = await saveProductPricing(productId, pricing);
        if (pricingError) { setBusy(form,false); return toast("Pack enregistré, mais le coût fournisseur ou la marge n’a pas pu être enregistré : " + errorMessage(pricingError),true); }
        const supplierError = await saveProductSupplierLink(productId, fd);
        setBusy(form,false);
        if (supplierError) return toast("Pack enregistré, mais l’association fournisseur n’a pas pu être enregistrée : " + errorMessage(supplierError),true);
        const wasEditing = Boolean(editingProductId); editingProductId = null; toast(wasEditing ? "Pack modifié." : "Nouveau pack ajouté."); await loadPublicData(); await showAdminView("packs");
      };
      }
    }
    if (view === "stock") {
      const stockSearch = $("stockArticleSearch");
      if (stockSearch) stockSearch.addEventListener("input", () => { const q = stockSearch.value.toLowerCase().trim(); document.querySelectorAll("tr[data-stock-search-row]").forEach(row => { row.hidden = !row.dataset.search.includes(q); }); });
      document.querySelectorAll(".stock-field").forEach(input => {
      input.addEventListener("change", async () => {
        const productId = input.dataset.stockId; const key = input.dataset.stockKey; let val = input.value;
        if (key === "availability_status") {
          if (!["available","out_of_stock"].includes(val)) { toast("Disponibilité invalide.",true); return showAdminView("stock"); }
          if (val === "available" && Number(getP(productId)?.price || 0) <= 0) { toast("Définis un prix de vente avant de marquer l’article disponible.",true); return showAdminView("stock"); }
          const { error } = await client.from("products").update({ availability_status: val, updated_at: new Date().toISOString() }).eq("id", productId);
          if (error) return toast(errorMessage(error),true);
          const product = getP(productId); if (product) product.availability_status = val;
          toast("Disponibilité mise à jour."); await loadPublicData(); return showAdminView("stock");
        }
        if (key !== "supplier") { val = Number(val); if (!Number.isFinite(val) || val < 0) { toast("Valeur numérique invalide.",true); return showAdminView("stock"); } }
        const existing = stockRows.find(x=>x.product_id===productId);
        const row = { product_id: productId, quantity: Number(existing?.quantity||0), min_quantity: Number(existing?.min_quantity||0), unit_cost: Number(existing?.unit_cost||0), supplier: existing?.supplier||"" };
        row[key] = val;
        const { error } = await client.from("stock").upsert(row,{onConflict:"product_id"});
        if (error) toast(errorMessage(error),true); else { const idx = stockRows.findIndex(x=>x.product_id===productId); if (idx>=0) stockRows[idx]=row; else stockRows.push(row);
          if (key === "quantity") { const newStatus = Number(val) > 0 ? "available" : "out_of_stock"; const { error:statusError } = await client.from("products").update({ availability_status:newStatus, updated_at:new Date().toISOString() }).eq("id",productId); if (statusError) return toast("Stock enregistré, disponibilité non mise à jour : " + errorMessage(statusError),true); await loadPublicData(); }
          toast("Stock enregistré."); }
      });
      });
    }
    if (view === "admins") { const form = $("inviteAdminForm"); if (form) form.onsubmit = async e => {
      e.preventDefault(); setBusy(form,true,"Envoi de l’invitation…"); const fd=new FormData(form);
      const { data, error } = await client.functions.invoke("sama-invite-admin",{body:{full_name:String(fd.get("full_name")||"").trim(),email:String(fd.get("email")||"").trim().toLowerCase()}});
      setBusy(form,false); if(error || data?.error) return toast(errorMessage(error || data),true);
      toast(data?.message || "Invitation envoyée."); await showAdminView("admins");
    }; }
    if (view === "suppliers") { const form=$("supplierForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("suppliers").insert({name:String(f.get("name")||"").trim(),phone:String(f.get("phone")||"").trim(),family:String(f.get("family")||"").trim(),terms:String(f.get("terms")||"").trim()});setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Fournisseur ajouté.");await showAdminView("suppliers");}; }
    if (view === "expenses") { const form=$("expenseForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("expenses").insert({id:"DEP-"+crypto.randomUUID().slice(0,8).toUpperCase(),label:String(f.get("label")||"").trim(),amount:Number(f.get("amount")),category:String(f.get("category")||"").trim(),expense_date:String(f.get("date")||new Date().toISOString().slice(0,10))});setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Dépense enregistrée.");await showAdminView("expenses");}; }
    if (view === "quotes") { /* Le statut est enregistré dans le gestionnaire ci-dessous. */ }
    if (view === "settings") {
      const form = $("settingsForm");
      if (form) form.onsubmit = async e => {
        e.preventDefault();
        if (!isAdmin()) return toast("Accès refusé.", true);
        setBusy(form, true, "Enregistrement…");
        const f = new FormData(form);
        const file = f.get("homepage_background_file");
        let homepageBackgroundUrl = String(f.get("homepage_background_url") || "").trim();
        if (file instanceof File && file.size > 0) {
          const allowed = ["image/jpeg", "image/png", "image/webp"];
          if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
            setBusy(form, false);
            return toast("Choisis une image JPG, PNG ou WebP de 5 Mo maximum.", true);
          }
          const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
          const path = `site-assets/homepage-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
          const { data: uploaded, error: uploadError } = await client.storage.from("sama-pack-products").upload(path, file, {cacheControl:"3600",upsert:false,contentType:file.type});
          if (uploadError) { setBusy(form, false); return toast("Envoi de l’image de fond impossible : " + errorMessage(uploadError), true); }
          homepageBackgroundUrl = client.storage.from("sama-pack-products").getPublicUrl(uploaded.path).data.publicUrl;
        }
        if (homepageBackgroundUrl && !/^https:\/\//i.test(homepageBackgroundUrl)) {
          setBusy(form, false);
          return toast("L’URL de l’image doit commencer par https://.", true);
        }
        const {error} = await client.from("settings").update({
          company:String(f.get("company")||"").trim(),
          whatsapp:String(f.get("whatsapp")||"").replace(/\D/g,""),
          delivery_fee:Number(f.get("delivery_fee")),
          currency:String(f.get("currency")||"FCFA").trim(),
          homepage_background_url: homepageBackgroundUrl
        }).eq("id",true);
        if (error) { setBusy(form,false); return toast(errorMessage(error),true); }
        const emailResult = await client.from("notification_settings").update({order_notification_email:String(f.get("order_notification_email")||"").trim()}).eq("id",true);
        setBusy(form,false);
        if (emailResult.error) { await loadPublicData(); return toast("Paramètres boutique enregistrés, mais l’e-mail n’a pas pu être enregistré : "+errorMessage(emailResult.error),true); }
        toast("Paramètres, image de fond et e-mail de notification enregistrés.");
        await loadPublicData();
        await showAdminView("settings");
      };
    }
    if (view === "orders" || view === "quotes") { /* les sélecteurs déclaratifs utilisent les fonctions globales */ }
  }
  async function setQuoteStatus(id,status) {
    if(!isAdmin()) return toast("Accès refusé.",true);
    if(!["new","processing","won","lost"].includes(status)) return toast("Statut invalide.",true);
    const {error}=await client.from("quotes").update({status}).eq("id",id);
    if(error) return toast(errorMessage(error),true);
    toast("Statut du devis modifié."); await showAdminView("quotes");
  }

  function initShop() {
    if ($("year")) $("year").textContent = String(new Date().getFullYear());
    const search = $("searchBox"); if (search) search.addEventListener("input",() => { currentProductPage = 1; renderProducts(); });
    const category = $("categoryFilter"); if(category) category.addEventListener("change",() => { currentProductPage = 1; renderProducts(); });
    if ($("openCartBtn")) $("openCartBtn").onclick = renderCartModal;
    document.querySelectorAll("[data-mobile-action=cart]").forEach(b => b.addEventListener("click", renderCartModal));
    document.querySelectorAll("[data-mobile-action=account]").forEach(b => b.addEventListener("click", openAccountModal));
    if ($("heroWhatsApp")) $("heroWhatsApp").onclick = () => document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});
    if ($("contactWhatsApp")) $("contactWhatsApp").onclick = () => openWA("Bonjour Sama-Pack, je souhaite avoir plus d’informations sur vos packs.");
    if ($("quoteBtn")) $("quoteBtn").onclick = openQuoteModal;
    if ($("adminBtn")) $("adminBtn").onclick = openAdmin;
    if ($("footerAdmin")) $("footerAdmin").onclick = e => { e.preventDefault(); openAdmin(); };
    if ($("viewShopBtn")) $("viewShopBtn").onclick = closeAdmin;
    if ($("viewShopBtnSide")) $("viewShopBtnSide").onclick = closeAdmin;
    if ($("closeAdminBtn")) $("closeAdminBtn").onclick = closeAdmin;
    if ($("accountBtn")) $("accountBtn").onclick = openAccountModal;
    if ($("notificationBtn")) $("notificationBtn").onclick = loadAndShowNotifications;
    document.querySelectorAll(".side-btn").forEach(b => b.addEventListener("click",() => showAdminView(b.dataset.view)));
    updateCategoryFilter(); renderTop(); renderProducts(); renderPromoCarousel(); startPromoCarousel(); updateCartCount(); updateContact();
  }

  async function start() {
    initShop();
    if (!window.supabase?.createClient) { toast("La bibliothèque de connexion n’a pas pu charger. Recharge la page.",true); return; }
    client = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    await loadPublicData();
    const {data,error}=await client.auth.getSession();
    if(error) console.warn("Session check:",error);
    await syncAuth(data?.session?.user || null);
    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => { void syncAuth(session?.user || null); }, 0); });
  }

  // Functions called by inline storefront/admin controls.
  Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem});
  start().catch(err => { console.error(err); toast("Initialisation impossible. Recharge la page ou contacte l’administrateur.",true); });
})();
