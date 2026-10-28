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
  let cachedSubscriptions = [];
  let cachedExpenses = [];
  let cachedSuppliers = [];
  let appSettings = { company: "SAMA-PACK", whatsapp: "", deliveryFee: 1500, currency: "FCFA", homepageBackgroundUrl: "" };
  let cart = loadCart();
  let budgetBuilderState = { budget: 5000, category: "all", items: [] };

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
    const { data, error } = await client.from("profiles").select("id,full_name,phone,email,role,is_super_admin,invited_by,created_at").eq("id", user.id).maybeSingle();
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


  const ACCOUNT_PRESENCE_WINDOW_MS = 90 * 1000;
  let presenceHeartbeatTimer = null;
  let presenceVisibilityHandler = null;
  let presenceWriteInFlight = false;
  let activeAccountsRefreshTimer = null;

  async function recordAccountPresence(user = currentUser) {
    if (!client || !user || document.visibilityState === "hidden" || presenceWriteInFlight) return;
    presenceWriteInFlight = true;
    try {
      const { error } = await client.from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) console.warn("Mise à jour de présence indisponible", error);
    } catch (error) {
      console.warn("Mise à jour de présence indisponible", error);
    } finally {
      presenceWriteInFlight = false;
    }
  }

  function stopAccountPresence() {
    if (presenceHeartbeatTimer) window.clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
    if (presenceVisibilityHandler) document.removeEventListener("visibilitychange", presenceVisibilityHandler);
    presenceVisibilityHandler = null;
  }

  function setupAccountPresence(user) {
    stopAccountPresence();
    if (!user) return;
    const pulse = () => {
      if (document.visibilityState !== "hidden") void recordAccountPresence(user);
    };
    pulse();
    presenceHeartbeatTimer = window.setInterval(pulse, 30_000);
    presenceVisibilityHandler = () => {
      if (document.visibilityState === "visible") {
        pulse();
        if (currentAdminView === "dashboard") void refreshDashboardActiveAccounts();
      }
    };
    document.addEventListener("visibilitychange", presenceVisibilityHandler);
  }

  async function countActiveAccounts() {
    if (!client) throw new Error("Connexion à la base de données indisponible.");
    const cutoff = new Date(Date.now() - ACCOUNT_PRESENCE_WINDOW_MS).toISOString();
    const { count, error } = await client.from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", cutoff);
    if (error) throw error;
    return Number(count || 0);
  }

  function stopDashboardPresencePolling() {
    if (activeAccountsRefreshTimer) window.clearInterval(activeAccountsRefreshTimer);
    activeAccountsRefreshTimer = null;
  }

  async function refreshDashboardActiveAccounts() {
    if (!client || !isAdmin() || currentAdminView !== "dashboard") return;
    const value = $("activeAccountsCount");
    if (!value) return;
    try {
      value.textContent = String(await countActiveAccounts());
      const meta = $("activeAccountsLastUpdated");
      if (meta) meta.textContent = `Activité sur 90 s · actualisé à ${new Date().toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    } catch (error) {
      console.warn("Comptage des comptes actifs indisponible", error);
      if (value.textContent === "—") value.textContent = "N/D";
    }
  }

  function startDashboardPresencePolling() {
    stopDashboardPresencePolling();
    if (currentAdminView !== "dashboard") return;
    activeAccountsRefreshTimer = window.setInterval(() => {
      if (currentAdminView === "dashboard" && document.visibilityState === "visible") {
        void refreshDashboardActiveAccounts();
      }
    }, 30_000);
  }


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
    grid.innerHTML = arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || '<div class="empty">' + (currentType === "product" ? "Aucun produit ne correspond à votre recherche." : "Aucun pack ne correspond à votre recherche.") + '</div>';
    const pagination = $("productPagination");
    if (pagination) pagination.innerHTML = arr.length > PRODUCTS_PER_PAGE ? `<button class="btn ghost small" ${currentProductPage === 1 ? "disabled" : ""} onclick="goToProductPage(${currentProductPage - 1})">← Précédent</button><span>Page ${currentProductPage} / ${pages} · ${arr.length} packs</span><button class="btn ghost small" ${currentProductPage === pages ? "disabled" : ""} onclick="goToProductPage(${currentProductPage + 1})">Suivant →</button>` : "";
    renderIndividualCatalogs();
  }
  function goToProductPage(page) {
    currentProductPage = Math.max(1, Number(page) || 1);
    renderProducts();
    $("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cleaningBottleSvg() {
    return `<svg class="cleaning-bottle-icon" viewBox="0 0 64 80" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 7h16v8l7 7v46a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V27a5 5 0 0 1 5-5h6z" fill="#dcfce7" stroke="#166534" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M24 7h16M27 15h10M18 37h24" fill="none" stroke="#166534" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="21" y="46" width="21" height="14" rx="2" fill="#fff" stroke="#86b99a" stroke-width="1.8"/>
      <path d="M25 51h13M25 55h9" stroke="#86b99a" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }

  function productCard(p) {
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

  function openProduct(id) {
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

  function addToCart(id) {
    const p = getP(id); if (!p || !p.active) { toast("Cet article n’est plus publié.", true); return; } if (p.availability_status === "out_of_stock") { toast("Cet article est en rupture de stock.", true); return; } if (Number(p.price) <= 0) { toast("Le prix de cet article doit être confirmé avant la commande.", true); return; }
    const line = cart.find(i => i.id === id);
    if (line) line.qty = Math.min(99, line.qty + 1); else cart.push({ id, qty: 1 });
    saveCart(); updateCartCount(); toast("Article ajouté au panier.");
  }
  function updateCartCount() { const el = $("cartCount"); if (el) el.textContent = String(cart.reduce((sum, i) => sum + i.qty, 0)); }
  function saveAndRenderCart() { saveCart(); updateCartCount(); renderCartModal(); }
  function cartTotals() { const subtotal = cart.reduce((sum, i) => sum + getEffectivePrice(getP(i.id)) * i.qty, 0); const delivery = Number(appSettings.deliveryFee || 0); return { subtotal, delivery, total: subtotal + delivery }; }
  function showModal(body) { $("modalRoot").innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-card">${body}</div></div>`; }
  function closeModal() { $("modalRoot").innerHTML = ""; }
  function renderCartModal() {
    if (!cart.length) { showModal(`<div class="modal-head"><h2>Ton panier</h2><button class="close" onclick="closeModal()">✕</button></div><div class="empty">Ton panier est vide.<br><br><a class="btn primary" href="#catalogue" onclick="closeModal()">Voir le catalogue</a></div>`); return; }
    const t = cartTotals();
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Ton panier</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="cart-list">${cart.map(i => { const p = getP(i.id); if (!p) return ""; return `<div class="cart-item"><div class="cart-product-icon">${cleaningBottleSvg()}</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(getEffectivePrice(p))} / ${p.catalog_type === "product" ? "unité" : "pack"}</div></div><div class="qty"><button onclick="changeQty('${esc(p.id)}',-1)" aria-label="Retirer une unité">−</button><b>${i.qty}</b><button onclick="changeQty('${esc(p.id)}',1)" aria-label="Ajouter une unité">+</button></div></div>`; }).join("")}</div><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(t.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(t.delivery)}</strong></div><div class="summary-row total"><span>Total estimé</span><strong>${money(t.total)}</strong></div></div><button class="btn primary full" onclick="checkoutModal()">Passer la commande</button>`);
  }
  function changeQty(id, delta) { const x = cart.find(i => i.id === id); if (!x) return; x.qty += delta; if (x.qty <= 0) cart = cart.filter(i => i.id !== id); if (x.qty > 99) x.qty = 99; saveAndRenderCart(); }

  function getBudgetBuilderProducts(category = "all") {
    return products.filter(p => p && p.catalog_type !== "pack" && canSellProduct(p) &&
      (category === "all" || String(p.cat || "") === category));
  }
  function budgetBuilderImage(p) {
    const path = String(p?.image_path || "").trim();
    if (!path) return cleaningBottleSvg();
    const src = /^https?:\/\//i.test(path) ? path : path.replace(/^\//, "");
    return '<img class="budget-builder-thumb-img" src="' + esc(src) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\'">';
  }
  function openBudgetPackBuilder() {
    const available = getBudgetBuilderProducts("all");
    if (!available.length) {
      showModal('<div class="modal-head"><div><div class="eyebrow">PACK PERSONNALISÉ</div><h2>Compose ton pack</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="empty">Aucun produit individuel n’est actuellement disponible pour composer un pack. Réessaie lorsque le stock sera mis à jour.</div>');
      return;
    }
    budgetBuilderState = { budget: 5000, category: "all", items: [] };
    const categories = [...new Set(available.map(p => String(p.cat || "Autre")))].sort((a,b) => a.localeCompare(b, "fr"));
    const categoryOptions = '<option value="all">Tous les produits disponibles</option>' +
      categories.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join("");
    showModal('<section class="budget-builder-modal" aria-labelledby="budgetBuilderTitle">' +
      '<div class="modal-head"><div><div class="eyebrow">PACK PERSONNALISÉ</div><h2 id="budgetBuilderTitle">Compose ton pack selon ton budget</h2></div><button class="close" onclick="closeModal()" aria-label="Fermer">✕</button></div>' +
      '<p class="budget-builder-intro">Choisis ton budget et, si tu le souhaites, une catégorie. La proposition utilise uniquement les articles publiés, disponibles et dont le prix est confirmé.</p>' +
      '<form id="budgetBuilderForm" class="budget-builder-form">' +
        '<label for="budgetBuilderBudget">Ton budget (FCFA)</label><input id="budgetBuilderBudget" class="input" type="number" inputmode="numeric" min="500" max="250000" step="500" value="5000" required>' +
        '<label for="budgetBuilderCategory">Type de besoin</label><select id="budgetBuilderCategory" class="input">' + categoryOptions + '</select>' +
        '<button id="budgetBuilderSuggestBtn" class="btn secondary full" type="button">Proposer une sélection</button>' +
      '</form>' +
      '<div id="budgetBuilderResults" class="budget-builder-results" aria-live="polite"></div>' +
      '<div class="budget-builder-footer"><button id="budgetBuilderAddBtn" class="btn primary full" type="button" onclick="addBudgetPackToCart()" disabled>Ajouter mon pack au panier</button><p class="small-note">La proposition est modifiable. Les frais de livraison s’ajoutent au panier ; aucun paiement ne sera lancé automatiquement.</p></div>' +
      '</section>');
    $("budgetBuilderSuggestBtn").onclick = suggestBudgetPack;
    $("budgetBuilderForm").onsubmit = event => { event.preventDefault(); suggestBudgetPack(); };
    $("budgetBuilderCategory").onchange = suggestBudgetPack;
    $("budgetBuilderBudget").onchange = suggestBudgetPack;
    suggestBudgetPack();
  }
  function suggestBudgetPack() {
    const budgetInput = $("budgetBuilderBudget"), categoryInput = $("budgetBuilderCategory"), results = $("budgetBuilderResults");
    if (!budgetInput || !categoryInput || !results) return;
    const budget = Math.floor(Number(budgetInput.value));
    if (!Number.isFinite(budget) || budget < 500 || budget > 250000) {
      budgetBuilderState.items = [];
      results.innerHTML = '<div class="inline-message">Saisis un budget compris entre 500 et 250 000 FCFA.</div>';
      const addButton = $("budgetBuilderAddBtn");
      if (addButton) addButton.disabled = true;
      return;
    }
    const category = String(categoryInput.value || "all");
    const candidates = getBudgetBuilderProducts(category).map(p => ({ p, price: getEffectivePrice(p) }))
      .filter(x => Number.isFinite(x.price) && x.price > 0 && x.price <= budget)
      .sort((a,b) => a.price - b.price || String(a.p.name).localeCompare(String(b.p.name), "fr"));
    budgetBuilderState = { budget, category, items: [] };
    const buckets = new Map();
    candidates.forEach(x => {
      const key = String(x.p.cat || "Autre");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(x);
    });
    const chosen = new Set(), categoryCounts = new Map();
    let total = 0;
    const addCandidate = x => {
      if (!x || chosen.has(String(x.p.id)) || total + x.price > budget) return;
      const key = String(x.p.cat || "Autre");
      chosen.add(String(x.p.id));
      categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
      budgetBuilderState.items.push({ id: String(x.p.id), qty: 1 });
      total += x.price;
    };
    [...buckets.keys()].sort((a,b) => (Number(buckets.get(a)?.[0]?.price) || Infinity) - (Number(buckets.get(b)?.[0]?.price) || Infinity) || a.localeCompare(b, "fr")).forEach(key => addCandidate(buckets.get(key)?.[0]));
    const perCategoryCap = category === "all" ? 3 : 6;
    candidates.forEach(x => {
      const key = String(x.p.cat || "Autre");
      if ((categoryCounts.get(key) || 0) < perCategoryCap) addCandidate(x);
    });
    renderBudgetBuilderResults();
  }
  function renderBudgetBuilderResults() {
    const results = $("budgetBuilderResults"), addButton = $("budgetBuilderAddBtn");
    if (!results) return;
    const lines = budgetBuilderState.items.map(line => ({ ...line, product: getP(line.id) }))
      .filter(line => line.product && canSellProduct(line.product));
    const total = lines.reduce((sum, line) => sum + getEffectivePrice(line.product) * line.qty, 0);
    const remaining = Math.max(0, budgetBuilderState.budget - total);
    if (!lines.length) {
      results.innerHTML = '<div class="empty">Aucun article ne correspond à ce budget et à ce choix. Augmente ton budget ou choisis une autre catégorie.</div>';
      if (addButton) addButton.disabled = true;
      return;
    }
    results.innerHTML = '<div class="budget-builder-summary"><div><span>Ta sélection</span><strong>' + lines.length + (lines.length > 1 ? ' articles' : ' article') + '</strong></div><div><span>Total des produits</span><strong>' + money(total) + '</strong></div><div><span>Budget restant</span><strong>' + money(remaining) + '</strong></div></div>' +
      '<div class="budget-builder-list">' + lines.map(line => {
        const p = line.product;
        return '<article class="budget-builder-item"><div class="budget-builder-thumb">' + budgetBuilderImage(p) + '</div><div class="budget-builder-item-copy"><strong>' + esc(p.name) + '</strong><small>' + esc(p.cat || "Article") + ' · ' + money(getEffectivePrice(p)) + '</small></div><div class="qty budget-builder-qty"><button type="button" onclick="changeBudgetBuilderQty(\'' + esc(p.id) + '\',-1)" aria-label="Retirer une unité">−</button><b>' + line.qty + '</b><button type="button" onclick="changeBudgetBuilderQty(\'' + esc(p.id) + '\',1)" aria-label="Ajouter une unité">+</button></div></article>';
      }).join("") + '</div>';
    if (addButton) addButton.disabled = total <= 0 || total > budgetBuilderState.budget;
  }
  function changeBudgetBuilderQty(id, delta) {
    const line = budgetBuilderState.items.find(item => item.id === String(id)), product = getP(String(id));
    if (!product || !canSellProduct(product)) return toast("Cet article n’est plus disponible.", true);
    if (!line && delta > 0) {
      if (getEffectivePrice(product) > budgetBuilderState.budget) return toast("Cet article dépasse ton budget.", true);
      budgetBuilderState.items.push({ id: String(id), qty: 1 });
    } else if (line) {
      const nextQty = line.qty + Number(delta || 0);
      if (nextQty <= 0) budgetBuilderState.items = budgetBuilderState.items.filter(item => item.id !== String(id));
      else if (nextQty > 99) return toast("La quantité maximale est de 99 unités.", true);
      else {
        const totalWithoutLine = budgetBuilderState.items.filter(item => item.id !== String(id))
          .reduce((sum, item) => sum + getEffectivePrice(getP(item.id)) * item.qty, 0);
        if (totalWithoutLine + getEffectivePrice(product) * nextQty > budgetBuilderState.budget) return toast("Cette quantité dépasserait ton budget.", true);
        line.qty = nextQty;
      }
    }
    renderBudgetBuilderResults();
  }
  function addBudgetPackToCart() {
    const lines = budgetBuilderState.items.map(line => ({ ...line, product: getP(line.id) }));
    if (!lines.length || lines.some(line => !line.product || !canSellProduct(line.product))) return toast("La sélection contient un article indisponible. Génère une nouvelle proposition.", true);
    const total = lines.reduce((sum, line) => sum + getEffectivePrice(line.product) * line.qty, 0);
    if (total <= 0 || total > budgetBuilderState.budget) return toast("La sélection dépasse le budget. Ajuste les quantités.", true);
    lines.forEach(line => {
      const existing = cart.find(item => item.id === line.id);
      if (existing) existing.qty = Math.min(99, existing.qty + line.qty);
      else cart.push({ id: line.id, qty: Math.min(99, line.qty) });
    });
    saveCart(); updateCartCount(); renderCartModal();
    toast("Ton pack personnalisé a été ajouté au panier.");
  }
  async function reorderOrder(orderId) {
    if (!currentUser) return renderAuthForm("login", "Connecte-toi pour recommander les articles de cette commande.");
    const id = String(orderId || "").trim();
    if (!id) return toast("Référence de commande manquante.", true);
    const { data: order, error: orderError } = await client.from("orders")
      .select("id,user_id").eq("id", id).eq("user_id", currentUser.id).maybeSingle();
    if (orderError || !order) return toast("Cette commande est introuvable ou n’est pas accessible depuis ce compte.", true);
    const { data: rows, error } = await client.from("order_items")
      .select("product_id,product_name,quantity").eq("order_id", id);
    if (error) return toast("Les articles de cette ancienne commande ne sont pas accessibles pour le moment.", true);
    if (!rows?.length) return toast("Les détails des articles ne sont pas disponibles pour cette commande.", true);
    let added = 0; const unavailable = [];
    for (const row of rows) {
      const productId = String(row.product_id || ""), product = getP(productId);
      if (!product || !canSellProduct(product)) { unavailable.push(String(row.product_name || "Article indisponible")); continue; }
      const qty = Math.max(1, Math.min(99, Math.trunc(Number(row.quantity) || 1)));
      const existing = cart.find(item => item.id === productId);
      if (existing) existing.qty = Math.min(99, existing.qty + qty);
      else cart.push({ id: productId, qty });
      added++;
    }
    if (!added) return toast("Aucun article de cette commande n’est actuellement disponible à la vente.", true);
    saveCart(); updateCartCount(); renderCartModal();
    toast(unavailable.length ? added + " article(s) ajouté(s). Certains articles ne sont plus disponibles." : "Commande " + id + " reconstituée dans ton panier.");
  }

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

  const ORDER_TRACKING_STEPS = [
    { status: "new", label: "Reçue" },
    { status: "confirmed", label: "Confirmée" },
    { status: "processing", label: "En préparation" },
    { status: "prepared", label: "Préparée" },
    { status: "out_for_delivery", label: "En livraison" },
    { status: "delivered", label: "Livrée" }
  ];
  function orderTrackingHtml(order) {
    const status = String(order?.status || "new");
    if (["awaiting_payment", "awaiting_delivery_payment"].includes(status)) return '<div class="order-tracking-pending">Suivi disponible après confirmation du paiement.</div>';
    if (status === "cancelled") return '<div class="order-tracking-cancelled">Commande annulée</div>';
    const current = Math.max(0, ORDER_TRACKING_STEPS.findIndex(step => step.status === status));
    return '<ol class="order-track" aria-label="Progression de la commande">' + ORDER_TRACKING_STEPS.map((step, i) =>
      '<li class="' + (i < current ? "is-done" : i === current ? "is-current" : "") + '"><span class="order-track-dot">' + (i < current ? "✓" : String(i + 1)) + '</span><span class="order-track-label">' + esc(step.label) + '</span></li>'
    ).join("") + '</ol>';
  }
  function frequencyLabel(value) {
    return ({ weekly: "Chaque semaine", monthly: "Chaque mois", bimonthly: "Tous les deux mois", quarterly: "Tous les trois mois" })[value] || "Chaque mois";
  }
  function addFrequency(date, frequency) {
    const d = new Date(date);
    if (!Number.isFinite(d.getTime())) return new Date(Date.now() + 30 * 86400000);
    if (frequency === "weekly") { d.setDate(d.getDate() + 7); return d; }
    const months = frequency === "bimonthly" ? 2 : frequency === "quarterly" ? 3 : 1;
    const day = d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes(), 0, 0);
    target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
    return target;
  }
  function localDateTimeInput(value) {
    const d = value ? new Date(value) : new Date(Date.now() + 30 * 86400000);
    if (!Number.isFinite(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function replenishmentProducts() {
    return (products || []).filter(canSellProduct).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  }
  function subscriptionLineHtml(line) {
    const value = line || {};
    const options = replenishmentProducts().map(p => '<option value="' + esc(p.id) + '" ' + (String(p.id) === String(value.product_id || "") ? "selected" : "") + '>' + esc(p.name) + ' — ' + money(getEffectivePrice(p)) + '</option>').join("");
    return '<div class="subscription-line"><label class="subscription-product-field"><span>Produit ou pack</span><select class="input" name="product_id" required>' + (options || '<option value="">Aucun article disponible</option>') + '</select></label><label class="subscription-quantity-field"><span>Qté</span><input class="input" name="quantity" type="number" min="1" max="99" step="1" value="' + Math.max(1, Math.min(99, Number(value.quantity) || 1)) + '" required></label><button type="button" class="btn small ghost subscription-remove-line" onclick="removeSubscriptionLine(this)" aria-label="Retirer cet article" title="Retirer cet article">✕</button></div>';
  }
  async function openSubscriptionEditor(subscriptionId) {
    if (!currentUser) return renderAuthForm("login", "Connecte-toi pour programmer un réapprovisionnement.");
    let existing = null;
    if (subscriptionId) {
      const result = await client.from("replenishment_subscriptions").select("*").eq("id", subscriptionId).eq("user_id", currentUser.id).maybeSingle();
      if (result.error || !result.data) return toast("Ce rappel est introuvable ou inaccessible.", true);
      existing = result.data;
    }
    const seedItems = Array.isArray(existing?.items) && existing.items.length ? existing.items : [{ product_id: replenishmentProducts()[0]?.id || "", quantity: 1 }];
    const lines = seedItems.slice(0, 12).map(subscriptionLineHtml).join("");
    const panel = '<div class="modal-head"><div><div class="eyebrow">RÉAPPROVISIONNEMENT</div><h2>' + (existing ? "Modifier le rappel" : "Programmer un rappel") + '</h2><p class="small-note">Aucune commande ni aucun paiement ne sera lancé automatiquement.</p></div><button class="close" onclick="closeModal()">✕</button></div>' +
      '<form id="subscriptionForm" class="subscription-form"><input type="hidden" name="id" value="' + esc(existing?.id || "") + '"><input type="hidden" name="status" value="' + esc(existing?.status || "active") + '">' +
      '<label class="subscription-field"><span>Nom du rappel</span><input class="input" name="label" maxlength="120" minlength="2" required value="' + esc(existing?.label || "Réapprovisionnement mensuel") + '" placeholder="Ex. Stock ménage de la maison"></label>' +
      '<div class="subscription-lines-head"><strong>Produits et quantités</strong><span class="small-note">1 à 12 articles</span></div><div id="subscriptionLines">' + lines + '</div>' +
      '<button class="btn ghost small" type="button" onclick="addSubscriptionLine()">+ Ajouter un article</button>' +
      '<div class="subscription-schedule-grid"><label class="subscription-field"><span>Fréquence</span><select class="input" name="frequency"><option value="weekly" ' + (existing?.frequency === "weekly" ? "selected" : "") + '>Chaque semaine</option><option value="monthly" ' + (!existing || existing.frequency === "monthly" ? "selected" : "") + '>Chaque mois</option><option value="bimonthly" ' + (existing?.frequency === "bimonthly" ? "selected" : "") + '>Tous les deux mois</option><option value="quarterly" ' + (existing?.frequency === "quarterly" ? "selected" : "") + '>Tous les trois mois</option></select></label>' +
      '<label class="subscription-field"><span>Prochain rappel</span><input class="input" name="next_reminder_at" type="datetime-local" required value="' + esc(localDateTimeInput(existing?.next_reminder_at)) + '"></label></div>' +
      '<label class="subscription-field"><span>Téléphone WhatsApp</span><input class="input" name="phone" inputmode="tel" maxlength="25" value="' + esc(existing?.phone || currentProfile?.phone || currentUser.user_metadata?.phone || "") + '" placeholder="Ex. 77 123 45 67"></label>' +
      '<p class="small-note">À l’échéance, le rappel apparaît dans ton compte. Tu pourras ouvrir un message WhatsApp prérempli et le valider toi-même.</p><button class="btn primary full" type="submit">' + (existing ? "Enregistrer les modifications" : "Créer le rappel") + '</button></form>';
    showModal(panel);
    const form = $("subscriptionForm");
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      if (!currentUser) return toast("Reconnecte-toi pour enregistrer ce rappel.", true);
      const values = new FormData(form);
      const lineNodes = Array.from(form.querySelectorAll(".subscription-line"));
      if (!lineNodes.length || lineNodes.length > 12) return toast("Choisis entre 1 et 12 articles.", true);
      const chosen = [];
      for (const node of lineNodes) {
        const productId = String(node.querySelector('[name="product_id"]')?.value || "");
        const qty = Number(node.querySelector('[name="quantity"]')?.value);
        const product = getP(productId);
        if (!product || !canSellProduct(product)) return toast("Un article sélectionné n’est plus disponible. Modifie la liste.", true);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) return toast("Chaque quantité doit être comprise entre 1 et 99.", true);
        if (chosen.some(item => item.product_id === product.id)) return toast("Un même article ne peut apparaître qu’une fois. Ajuste sa quantité.", true);
        chosen.push({ product_id: product.id, product_name: product.name, quantity: qty, unit_price: getEffectivePrice(product) });
      }
      const parsedDate = new Date(String(values.get("next_reminder_at") || ""));
      if (!Number.isFinite(parsedDate.getTime())) return toast("Choisis une date valide pour le rappel.", true);
      const label = String(values.get("label") || "").trim();
      if (label.length < 2) return toast("Donne un nom à ce rappel.", true);
      const payload = { label, items: chosen, frequency: String(values.get("frequency") || "monthly"), next_reminder_at: parsedDate.toISOString(), phone: String(values.get("phone") || "").trim(), status: String(values.get("status") || "active"), updated_at: new Date().toISOString() };
      form.querySelectorAll("button,input,select").forEach(el => { if (el.type !== "hidden") el.disabled = true; });
      const id = String(values.get("id") || "");
      const result = id
        ? await client.from("replenishment_subscriptions").update(payload).eq("id", id).eq("user_id", currentUser.id)
        : await client.from("replenishment_subscriptions").insert({ ...payload, user_id: currentUser.id });
      if (result.error) {
        form.querySelectorAll("button,input,select").forEach(el => { el.disabled = false; });
        return toast(errorMessage(result.error), true);
      }
      closeModal(); toast(id ? "Rappel mis à jour." : "Rappel de réapprovisionnement créé.");
      await showAccountHome();
    };
  }
  function addSubscriptionLine() {
    const host = $("subscriptionLines");
    if (!host) return;
    if (host.querySelectorAll(".subscription-line").length >= 12) return toast("Un rappel peut contenir au maximum 12 articles.", true);
    host.insertAdjacentHTML("beforeend", subscriptionLineHtml({ product_id: replenishmentProducts()[0]?.id || "", quantity: 1 }));
  }
  function removeSubscriptionLine(button) {
    const row = button?.closest(".subscription-line"), host = $("subscriptionLines");
    if (!row || !host) return;
    if (host.querySelectorAll(".subscription-line").length <= 1) {
      const select = row.querySelector('[name="product_id"]'); if (select) select.selectedIndex = 0;
      const qty = row.querySelector('[name="quantity"]'); if (qty) qty.value = "1";
      return;
    }
    row.remove();
  }
  function renderSubscriptionsHtml(rows) {
    if (!rows.length) return '<div class="empty">Aucun rappel programmé. Choisis tes produits, quantités et fréquence.</div>';
    return '<div class="subscription-list">' + rows.map(sub => {
      const items = Array.isArray(sub.items) ? sub.items : [];
      const estimated = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
      const due = sub.status === "active" && new Date(sub.next_reminder_at).getTime() <= Date.now();
      const itemList = items.map(item => '<li>' + Number(item.quantity || 0) + ' × ' + esc(item.product_name || getP(item.product_id)?.name || "Article") + '</li>').join("");
      const status = sub.status === "paused" ? '<span class="status cancelled">Suspendu</span>' : (due ? '<span class="status awaiting_delivery_payment">À renouveler</span>' : '<span class="status delivered">Actif</span>');
      const nextDate = new Date(sub.next_reminder_at);
      const dateText = Number.isFinite(nextDate.getTime()) ? nextDate.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date à vérifier";
      const action = '<div class="subscription-actions"><button class="btn small ghost" onclick="openSubscriptionEditor(\'' + esc(sub.id) + '\')">Modifier</button>' +
        '<button class="btn small secondary" onclick="prepareSubscriptionOrder(\'' + esc(sub.id) + '\')">Renouveler via WhatsApp</button>' +
        '<button class="btn small ghost" onclick="toggleSubscriptionStatus(\'' + esc(sub.id) + '\',\'' + (sub.status === "active" ? "paused" : "active") + '\')">' + (sub.status === "active" ? "Suspendre" : "Réactiver") + '</button>' +
        (due ? '<button class="btn small ghost" onclick="advanceSubscriptionReminder(\'' + esc(sub.id) + '\')">Rappel traité · Planifier le suivant</button>' : '') +
        '<button class="btn small danger" onclick="deleteSubscription(\'' + esc(sub.id) + '\')">Supprimer</button></div>';
      return '<article class="subscription-card"><div class="subscription-card-head"><div><h4>' + esc(sub.label) + '</h4><p class="small-note">' + esc(frequencyLabel(sub.frequency)) + ' · Prochain rappel : ' + esc(dateText) + '</p></div>' + status + '</div><ul class="subscription-items">' + itemList + '</ul><div class="subscription-estimate">Montant indicatif au dernier prix connu : <strong>' + money(estimated) + '</strong><span>Prix et disponibilité à confirmer lors du renouvellement.</span></div>' + action + '</article>';
    }).join("") + '</div>';
  }
  function prepareSubscriptionOrder(id) {
    if (!currentUser) return renderAuthForm("login", "Connecte-toi pour préparer le renouvellement.");
    const sub = cachedSubscriptions.find(item => item.id === id && item.user_id === currentUser.id);
    if (!sub) return toast("Ce rappel est introuvable ou inaccessible.", true);
    const lines = (Array.isArray(sub.items) ? sub.items : []).map(item => "- " + Number(item.quantity || 0) + " x " + (item.product_name || getP(item.product_id)?.name || "Article")).join("\n");
    const message = 'Bonjour SAMA-PACK, je souhaite renouveler mon réapprovisionnement "' + sub.label + '".\n' + lines + '\nMerci de confirmer les disponibilités, les prix actuels et les frais de livraison avant de valider la commande.';
    openWA(message);
  }
  async function toggleSubscriptionStatus(id, nextStatus) {
    if (!currentUser || !["active", "paused"].includes(nextStatus)) return toast("Action non autorisée.", true);
    const sub = cachedSubscriptions.find(item => item.id === id && item.user_id === currentUser.id);
    if (!sub) return toast("Ce rappel est introuvable.", true);
    let nextDate = sub.next_reminder_at;
    if (nextStatus === "active" && new Date(nextDate).getTime() <= Date.now()) nextDate = addFrequency(new Date(), sub.frequency).toISOString();
    const { error } = await client.from("replenishment_subscriptions").update({ status: nextStatus, next_reminder_at: nextDate, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", currentUser.id);
    if (error) return toast(errorMessage(error), true);
    toast(nextStatus === "active" ? "Rappel réactivé." : "Rappel suspendu.");
    await showAccountHome();
  }
  async function advanceSubscriptionReminder(id) {
    if (!currentUser) return toast("Connecte-toi pour modifier ce rappel.", true);
    const sub = cachedSubscriptions.find(item => item.id === id && item.user_id === currentUser.id);
    if (!sub) return toast("Ce rappel est introuvable.", true);
    if (sub.status !== "active") return toast("Réactive le rappel avant de programmer la prochaine échéance.", true);
    const oldDate = new Date(sub.next_reminder_at);
    let nextDate = oldDate, loops = 0;
    while (nextDate.getTime() <= Date.now() && loops < 48) { nextDate = addFrequency(nextDate, sub.frequency); loops += 1; }
    if (nextDate.getTime() <= Date.now()) nextDate = addFrequency(new Date(), sub.frequency);
    const { error } = await client.from("replenishment_subscriptions").update({ next_reminder_at: nextDate.toISOString(), last_reminder_triggered_for: oldDate.toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", currentUser.id);
    if (error) return toast(errorMessage(error), true);
    toast("Rappel traité. La prochaine échéance est programmée.");
    await showAccountHome();
  }
  async function deleteSubscription(id) {
    if (!currentUser) return toast("Connecte-toi pour modifier tes rappels.", true);
    if (!window.confirm("Supprimer définitivement ce rappel de réapprovisionnement ?")) return;
    const { error } = await client.from("replenishment_subscriptions").delete().eq("id", id).eq("user_id", currentUser.id);
    if (error) return toast(errorMessage(error), true);
    toast("Rappel supprimé."); await showAccountHome();
  }
  function normalizeCustomerWhatsapp(phone) {
    let number = String(phone || "").replace(/\D/g, "");
    if (number.startsWith("00")) number = number.slice(2);
    if (number.length === 9) number = "221" + number;
    if (number.startsWith("0") && number.length === 10) number = "221" + number.slice(1);
    return number;
  }
  function openOrderWhatsApp(orderId) {
    if (!isAdmin()) return toast("Accès administrateur requis.", true);
    const order = cachedOrders.find(item => item.id === orderId);
    if (!order) return toast("Commande introuvable.", true);
    const phone = normalizeCustomerWhatsapp(order.customer_phone || cachedCustomers.find(c => c.id === order.customer_id)?.phone);
    if (!phone || phone.length < 9) return toast("Le numéro WhatsApp de ce client doit être vérifié.", true);
    const balance = Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0));
    const slot = String(order.slot || "").trim();
    const message = "Bonjour " + (order.customer_name || "") + ", point sur la commande " + order.id + " : " + statusLabel(order.status) + ". Total : " + money(order.total) + ". Déjà payé : " + money(order.amount_paid || 0) + ". Solde restant : " + money(balance) + (slot ? ". Créneau prévu : " + slot : "") + ".\nSAMA-PACK";
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }

  async function showAccountHome() {
    if (!currentUser) { renderAuthForm("login"); return; }
    const p = currentProfile || await getProfile();
    const dueResult = await client.rpc("sama_notify_due_replenishment_reminders");
    if (dueResult.error) console.warn("Due replenishment reminder check failed", dueResult.error);
    await loadNotifications();
    const { data: rows, error } = await client.from("orders").select("id,created_at,status,total,subtotal,delivery,customer_name,customer_phone,delivery_address,delivery_zone,slot,payment_choice,payment_status,amount_paid").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(15);
    const orders = error ? [] : (rows || []);
    const subscriptionResult = await client.from("replenishment_subscriptions").select("*").eq("user_id", currentUser.id).order("next_reminder_at", { ascending: true });
    cachedSubscriptions = subscriptionResult.error ? [] : (subscriptionResult.data || []);
    if (subscriptionResult.error) console.warn("Replenishment subscriptions unavailable", subscriptionResult.error);
    const initialized = await isAdminInitialized(); adminInitialized = initialized;
    const orderHtml = orders.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Date</th><th>Total</th><th>Paiement et solde</th><th>Suivi</th><th>Action</th></tr></thead><tbody>' + orders.map(o => {
      const paymentPending = ["awaiting_payment","awaiting_delivery_payment"].includes(o.status);
      const paymentActionHtml = paymentPending
        ? '<button class="btn small primary" onclick="retryOrderPayment(\'' + esc(o.id) + '\')">Payer</button>'
        : ["paid", "partially_paid"].includes(o.payment_status)
          ? '<button class="btn small ghost" onclick="resendPaymentConfirmation(\'' + esc(o.id) + '\')">Renvoyer le reçu</button>'
          : "";
      const balance = Math.max(0, Number(o.total || 0) - Number(o.amount_paid || 0));
      const slotHtml = o.slot ? '<div class="small-note order-slot"><strong>Créneau :</strong> ' + esc(o.slot) + '</div>' : '';
      const actionHtml = '<div class="account-order-actions">' + paymentActionHtml + '<button class="btn small ghost" onclick="reorderOrder(\'' + esc(o.id) + '\')">Recommander</button></div>';
      return '<tr><td><strong>' + esc(o.id) + '</strong></td><td>' + esc(fmtDate(o.created_at)) + '</td><td>' + money(o.total) + '</td><td><span class="small-note">' + esc(paymentStatusLabel(o.payment_status)) + '</span><br><span class="small-note">Payé : ' + money(o.amount_paid || 0) + '</span><br><span class="small-note">Solde : ' + money(balance) + '</span></td><td><span class="status ' + esc(o.status) + '">' + esc(statusLabel(o.status)) + '</span>' + orderTrackingHtml(o) + slotHtml + '</td><td>' + actionHtml + '</td></tr>';
    }).join("") + '</tbody></table></div>' : '<div class="empty compact-empty">Tu n’as pas encore passé de commande en ligne.</div>';
    const subscriptionsHtml = renderSubscriptionsHtml(cachedSubscriptions);
    showModal('<div class="modal-head"><div><div class="eyebrow">MON COMPTE</div><h2>' + esc(p?.full_name || currentUser.email || "Client") + '</h2><p class="small-note">' + esc(currentUser.email || "") + '</p></div><button class="close" onclick="closeModal()">✕</button></div>' +
      '<div class="account-buttons"><button class="btn secondary" onclick="enableBrowserNotifications()">🔔 Activer les alertes du navigateur</button><button class="btn ghost" onclick="loadAndShowNotifications()">Mes notifications (' + userNotifications.filter(n=>!n.read_at).length + ')</button></div>' +
      '<div class="panel account-orders"><div class="subscription-panel-heading"><h3>Mes commandes</h3><p class="small-note">Le suivi affiche l’avancement, le montant déjà payé, le solde et le créneau prévu.</p></div>' + orderHtml + '</div>' +
      '<div class="panel account-subscriptions"><div class="subscription-panel-heading"><div><h3>Mes réapprovisionnements</h3><p class="small-note">Programme tes rappels, modifie les produits ou suspends-les à tout moment. Aucune commande ou aucun paiement automatique.</p></div><button class="btn primary small" onclick="openSubscriptionEditor()">+ Nouveau rappel</button></div>' + subscriptionsHtml + '</div>' +
      '<div class="panel account-password"><h3>' + (currentUser?.last_sign_in_at ? "Sécurité du compte" : "Définir un mot de passe") + '</h3><form id="changePasswordForm" class="checkout-grid"><input class="input full" name="password" type="password" minlength="8" required placeholder="Nouveau mot de passe (8 caractères minimum)"><button class="btn ghost full" type="submit">Enregistrer le mot de passe</button></form></div>' +
      (!initialized ? '<div class="panel bootstrap-panel"><h3>Configurer le premier administrateur</h3><p>Cette option n’apparaît que tant qu’aucun administrateur n’est configuré. Utilise le code initial transmis par le propriétaire.</p><form id="bootstrapAdminForm" class="checkout-grid"><input class="input full" name="bootstrap_token" autocomplete="off" required placeholder="Code initial du propriétaire"><button class="btn primary full" type="submit">Devenir le premier administrateur</button></form></div>' : '') +
      '<button class="btn ghost full" onclick="signOut()">Se déconnecter</button>');
    const pw = $("changePasswordForm"); pw.onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; const password = String(new FormData(form).get("password") || ""); if (password.length < 8) return toast("Choisis au moins 8 caractères.", true); setBusy(form, true, "Enregistrement…"); const { error } = await client.auth.updateUser({ password }); if (error) toast(errorMessage(error), true); else { toast("Mot de passe mis à jour."); form.reset(); } setBusy(form, false); };
    const bootstrap = $("bootstrapAdminForm"); if (bootstrap) bootstrap.onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; setBusy(form, true, "Configuration…"); const token = String(new FormData(form).get("bootstrap_token") || "").trim(); const { data, error } = await client.rpc("sama_bootstrap_first_admin", { p_token: token }); setBusy(form, false); if (error) return toast(errorMessage(error), true); await syncAuth(currentUser); closeModal(); toast(data?.message || "Compte administrateur configuré."); };
  }
  async function signOut() { await client.auth.signOut(); await syncAuth(null); closeModal(); toast("Tu es déconnecté."); }
  async function syncAuth(user) {
    currentUser = user || null; currentProfile = currentUser ? await getProfile(currentUser) : null;
    setupAccountPresence(currentUser);
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
    if (!currentUser) { closeModal(); renderAuthForm("login", "Connecte-toi ou crée un compte pour confirmer ta commande en ligne."); return; }
    const totals = cartTotals(); const profile = currentProfile || {};
    const deliveryAllowed = Number(totals.delivery) > 0;
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Finaliser la commande</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <form id="checkoutForm" class="checkout-grid">
        <input class="input full" name="name" required minlength="2" maxlength="120" placeholder="Nom complet" value="${esc(profile.full_name || currentUser.user_metadata?.full_name || "")}">
        <input class="input" name="phone" required minlength="8" maxlength="25" placeholder="Téléphone" value="${esc(profile.phone || currentUser.user_metadata?.phone || "")}">
        <input class="input" name="zone" placeholder="Zone / quartier" maxlength="100">
        <input class="input full" name="address" required minlength="4" maxlength="300" placeholder="Adresse de livraison">
        <input class="input full" name="slot" placeholder="Créneau souhaité (facultatif)" maxlength="120">
        <div class="payment-choice-list full">
          <div class="eyebrow">COMMENT SOUHAITES-TU PAYER ?</div>
          <label class="payment-choice-card is-selected">
            <input type="radio" name="payment_choice" value="pay_now" checked>
            <span class="payment-choice-copy"><strong>Payer maintenant</strong><small>Règle la totalité de la commande via Wave, Orange Money ou un autre moyen disponible sur la page sécurisée.</small></span>
            <strong class="payment-choice-amount">${money(totals.total)}</strong>
          </label>
          <label class="payment-choice-card ${deliveryAllowed ? "" : "is-disabled"}">
            <input type="radio" name="payment_choice" value="pay_later" ${deliveryAllowed ? "" : "disabled"}>
            <span class="payment-choice-copy"><strong>Payer plus tard</strong><small>Tu règles les frais de livraison maintenant. Le solde des produits est payé à la livraison. Aucun livreur ne part avant confirmation de ce paiement.</small></span>
            <strong class="payment-choice-amount">${money(totals.delivery)}</strong>
          </label>
          ${deliveryAllowed ? "" : '<p class="small-note">Les frais de livraison sont nuls ou indisponibles : seul le paiement intégral est proposé.</p>'}
        </div>
        <div class="summary full">
          <div class="summary-row"><span>Sous-total des articles</span><strong>${money(totals.subtotal)}</strong></div>
          <div class="summary-row"><span>Frais de livraison</span><strong>${money(totals.delivery)}</strong></div>
          <div class="summary-row"><span>Total de la commande</span><strong>${money(totals.total)}</strong></div>
          <div class="summary-row total"><span>À payer maintenant</span><strong id="checkoutAmountNow">${money(totals.total)}</strong></div>
          <div class="summary-row"><span>Solde prévu à la livraison</span><strong id="checkoutAmountLater">0 FCFA</strong></div>
          <p id="paymentChoiceHint" class="small-note">Le paiement est confirmé par le prestataire avant que la commande passe en préparation.</p>
        </div>
        <button class="btn primary full" type="submit">Continuer vers le paiement sécurisé</button>
      </form>`);
    const form = $("checkoutForm");
    const syncPaymentChoice = () => {
      const selected = form.querySelector('input[name="payment_choice"]:checked')?.value || "pay_now";
      form.querySelectorAll(".payment-choice-card").forEach(card => card.classList.toggle("is-selected", card.querySelector('input[name="payment_choice"]')?.value === selected));
      const amountNow = selected === "pay_now" ? totals.total : totals.delivery;
      const amountLater = selected === "pay_now" ? 0 : totals.subtotal;
      if ($("checkoutAmountNow")) $("checkoutAmountNow").textContent = money(amountNow);
      if ($("checkoutAmountLater")) $("checkoutAmountLater").textContent = money(amountLater);
      if ($("paymentChoiceHint")) $("paymentChoiceHint").textContent = selected === "pay_now"
        ? "La commande ne sera confirmée qu’après vérification du paiement intégral par le prestataire."
        : "Seuls les frais de livraison sont payés maintenant. Le solde reste dû à la livraison. Pas de départ du livreur avant confirmation du paiement de la livraison.";
    };
    form.querySelectorAll('input[name="payment_choice"]').forEach(input => input.addEventListener("change", syncPaymentChoice));
    syncPaymentChoice();
    form.onsubmit = async e => {
      e.preventDefault();
      if (!currentUser) return toast("Reconnecte-toi avant de confirmer la commande.", true);
      const f = new FormData(form);
      const paymentChoice = String(f.get("payment_choice") || "pay_now");
      if (paymentChoice === "pay_later" && !deliveryAllowed) return toast("Le paiement plus tard exige des frais de livraison à régler maintenant.", true);
      setBusy(form, true, "Création de la commande…");
      const payload = {
        customer: { name: String(f.get("name") || "").trim(), phone: String(f.get("phone") || "").trim(), address: String(f.get("address") || "").trim(), zone: String(f.get("zone") || "").trim() },
        slot: String(f.get("slot") || "").trim(),
        payment_choice: paymentChoice,
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty }))
      };
      const { data, error } = await client.rpc("sama_place_order", { p_payload: payload });
      setBusy(form, false);
      if (error) return toast(errorMessage(error), true);
      const order = data?.order;
      if (!data?.ok || !order?.id) return toast("La commande n’a pas pu être préparée. Réessaie.", true);
      const profileUpdate = await client.from("profiles").update({full_name:payload.customer.name,phone:payload.customer.phone}).eq("id",currentUser.id);
      if (!profileUpdate.error) currentProfile = {...(currentProfile||{}),full_name:payload.customer.name,phone:payload.customer.phone};
      cart = []; saveCart(); updateCartCount();
      try { localStorage.setItem("sama_pack_pending_payment_v1", order.id); } catch { /* stockage facultatif */ }
      closeModal();
      await retryOrderPayment(order.id);
    };
  }

  async function paymentFunctionError(error, fallback) {
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json();
        if (body?.error) return String(body.error);
      }
    } catch { /* fallback below */ }
    return fallback || errorMessage(error);
  }

  async function retryOrderPayment(orderId) {
    if (!currentUser) { openAccountModal(); return toast("Connecte-toi pour reprendre le paiement.", true); }
    if (!orderId) {
      try { orderId = localStorage.getItem("sama_pack_pending_payment_v1") || ""; } catch { orderId = ""; }
    }
    if (!orderId) return toast("Aucune commande en attente de paiement n’a été trouvée.", true);
    toast("Préparation du paiement sécurisé…");
    const { data, error } = await client.functions.invoke("sama-payment-checkout", { body: { action: "create_checkout", order_id: orderId } });
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le paiement n’a pas pu être lancé. Vérifie que les clés PayDunya sont configurées dans les secrets Supabase.");
      showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT EN ATTENTE</div><h2>Commande ${esc(orderId)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <p>La commande n’est pas encore confirmée et ne sera pas préparée tant que le paiement requis n’est pas vérifié.</p>
        <div class="inline-message">${esc(message)}</div>
        <button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Réessayer le paiement</button>
        <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
      return;
    }
    if (data?.already_confirmed) {
      try { localStorage.removeItem("sama_pack_pending_payment_v1"); } catch { /* stockage facultatif */ }
      await showAccountHome();
      toast("Cette commande est déjà confirmée.");
      return;
    }
    if (!data?.payment_url) return toast("Le prestataire n’a pas renvoyé de lien de paiement. Réessaie.", true);
    window.location.assign(data.payment_url);
  }

  async function resendPaymentConfirmation(orderId) {
    if (!currentUser) { openAccountModal(); return toast("Connecte-toi pour recevoir ton reçu.", true); }
    if (!orderId) return toast("Référence de commande manquante.", true);
    toast("Vérification du paiement et envoi du reçu…");
    const { data, error } = await client.functions.invoke("sama-payment-checkout", {
      body: { action: "send_payment_confirmation", order_id: String(orderId) },
    });
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le reçu n’a pas pu être envoyé. Le statut du paiement reste consultable dans Mes commandes.");
      toast(message, true);
      return;
    }
    if (data?.confirmation_email_status === "sent") {
      toast("Confirmation et reçu envoyés à " + String(currentUser.email || "l’adresse e-mail du compte") + ".");
    } else if (data?.confirmation_email_status === "sending") {
      toast("L’envoi du reçu est déjà en cours. Vérifie ta boîte mail dans quelques instants.");
    } else {
      toast("Le paiement reste confirmé, mais l’e-mail n’a pas pu être envoyé. Réessaie ou contacte SAMA-PACK.", true);
    }
    await showAccountHome();
  }

  async function handlePaymentReturn() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const paydunyaOrderId = params.get("paydunya_order_id") || params.get("paytech_order_id");
    const canceledOrderId = params.get("paydunya_cancelled_order_id") || params.get("paytech_cancelled_order_id");
    const invoiceToken = params.get("token");
    if (!paydunyaOrderId && !canceledOrderId && !invoiceToken) return;

    const cleanupPaymentQuery = () => {
      try {
        params.delete("token");
        params.delete("paydunya_order_id");
        params.delete("paydunya_cancelled_order_id");
        params.delete("paytech_order_id");
        params.delete("paytech_cancelled_order_id");
        const query = params.toString();
        window.history.replaceState({}, document.title, window.location.pathname + (query ? "?" + query : "") + window.location.hash);
      } catch { /* l'URL de retour reste utilisable même si l'historique est indisponible */ }
    };

    if (canceledOrderId) {
      cleanupPaymentQuery();
      try { localStorage.setItem("sama_pack_pending_payment_v1", canceledOrderId); } catch { /* stockage facultatif */ }
      toast("Paiement annulé. Aucun règlement n'est confirmé ; tu peux réessayer depuis Mes commandes.");
      if (currentUser) await showAccountHome();
      return;
    }

    if (!currentUser) {
      toast("Connecte-toi avec le compte utilisé pour cette commande afin de vérifier le paiement.", true);
      return;
    }

    let storedOrderId = "";
    try { storedOrderId = localStorage.getItem("sama_pack_pending_payment_v1") || ""; } catch { storedOrderId = ""; }
    const orderIdForCheck = paydunyaOrderId || storedOrderId;
    if (!orderIdForCheck && !invoiceToken) {
      cleanupPaymentQuery();
      toast("Référence de commande absente. Ouvre Mes commandes pour vérifier le paiement.", true);
      return;
    }

    const { data, error } = await client.functions.invoke("sama-payment-checkout", {
      body: { action: "verify_return", order_id: orderIdForCheck || undefined, invoice_token: invoiceToken || undefined },
    });
    cleanupPaymentQuery();
    const orderId = data?.order_id || data?.order?.id || orderIdForCheck || storedOrderId;
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le statut du paiement n’a pas encore pu être vérifié.");
      showModal(`<div class="modal-head"><div><div class="eyebrow">VÉRIFICATION DU PAIEMENT</div><h2>Statut en cours de vérification</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <p>Ne relance pas un nouveau paiement si ton portefeuille a déjà été débité. Vérifie ton historique de transaction puis réessaie de vérifier ici.</p>
        <div class="inline-message">${esc(message)}</div>
        ${orderId ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Reprendre le paiement</button>` : ""}
        <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
      return;
    }
    if (data?.order_status === "new" && data?.order) {
      try { localStorage.removeItem("sama_pack_pending_payment_v1"); } catch { /* stockage facultatif */ }
      cart = []; saveCart(); updateCartCount();
      await loadNotifications();
      const order = data.order;
      showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT CONFIRMÉ</div><h2>Merci pour ta commande !</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <div class="confirmation-mark">✓</div>
        <p>PayDunya a confirmé le paiement. La commande ${esc(order.id)} est maintenant enregistrée pour traitement.</p>
        <div class="summary">
          <div class="summary-row"><span>Montant de la commande</span><strong>${money(order.total)}</strong></div>
          <div class="summary-row"><span>Montant encaissé</span><strong>${money(order.amount_paid)}</strong></div>
          <div class="summary-row total"><span>Reste à payer</span><strong>${money(Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0)))}</strong></div>
        </div>
        <button class="btn primary full" onclick="showAccountHome()">Suivre ma commande</button>`);
      return;
    }
    showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT NON CONFIRMÉ</div><h2>La commande attend encore le paiement</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <p>PayDunya n’a pas encore confirmé le paiement. Aucun livreur ne sera envoyé à ce stade.</p>
      <div class="inline-message">Statut du paiement : ${esc(data?.gateway_status || "en attente")}</div>
      ${orderId ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Réessayer le paiement</button>` : ""}
      <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
    await loadNotifications();
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
  function statusLabel(status) { return ({new:"Reçue",confirmed:"Confirmée",processing:"En préparation",prepared:"Préparée",out_for_delivery:"En cours de livraison",delivered:"Livrée",cancelled:"Annulée",awaiting_payment:"Paiement intégral en attente",awaiting_delivery_payment:"Frais de livraison à payer",won:"Gagné",lost:"Perdu"})[status] || status || "—"; }
  function paymentStatusLabel(status) { return ({unpaid:"Non payé",pending:"Paiement en attente",partially_paid:"Partiellement payé",paid:"Payé",failed:"Échec du paiement",refund_review:"Paiement à vérifier / rembourser"})[status] || status || "Non renseigné"; }
  function actionLabel(action) { return ({pack_created:"Pack créé",pack_updated:"Pack modifié",pack_deleted:"Pack supprimé",order_status_changed:"Statut de commande modifié",order_placed:"Commande passée",admin_bootstrap:"Premier administrateur configuré",admin_invited:"Administrateur invité",admin_removed:"Droits administrateur retirés",settings_updated:"Paramètres modifiés",stock_created:"Stock créé",stock_updated:"Stock modifié",supplier_created:"Fournisseur ajouté",supplier_updated:"Fournisseur modifié",supplier_deleted:"Fournisseur supprimé",expense_created:"Dépense ajoutée",expense_updated:"Dépense modifiée",expense_deleted:"Dépense supprimée",quote_created:"Demande de devis reçue",quote_updated:"Devis modifié",quote_deleted:"Devis supprimé"})[action] || action || "Action"; }
  async function showAdminView(view) {
    stopDashboardPresencePolling();
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
      if (view === "dashboard") startDashboardPresencePolling();
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
  function dashboardCompactMoney(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  function dashboardLineChart(points) {
    const w = 760, h = 270, left = 58, right = 22, top = 24, bottom = 48;
    const plotW = w - left - right, plotH = h - top - bottom;
    const values = points.map(p => Math.max(0, Number(p.value) || 0));
    const maxValue = Math.max(1, ...values);
    const xAt = i => left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yAt = value => top + plotH - (Math.max(0, value) / maxValue) * plotH;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(Number(p.value) || 0).toFixed(1)}`).join(" ");
    const grid = [0, .25, .5, .75, 1].map(t => {
      const y = top + plotH * (1 - t), value = maxValue * t;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${w-right}" y2="${y.toFixed(1)}" class="dashboard-chart-gridline"/><text x="${left-10}" y="${(y+4).toFixed(1)}" text-anchor="end" class="dashboard-chart-axis">${esc(dashboardCompactMoney(value))}</text>`;
    }).join("");
    const pointsSvg = points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(Number(p.value)||0).toFixed(1)}" r="3.5" class="dashboard-chart-point"><title>${esc(p.label)} : ${money(p.value)}</title></circle>`).join("");
    const labelIdx = [...new Set([0, Math.floor((points.length-1)/3), Math.floor(2*(points.length-1)/3), Math.max(0, points.length-1)])];
    const labels = labelIdx.map(i => `<text x="${xAt(i).toFixed(1)}" y="${h-18}" text-anchor="middle" class="dashboard-chart-axis">${esc(points[i]?.label || "")}</text>`).join("");
    return `<div class="dashboard-line-wrap"><div class="dashboard-chart-summary"><span>Ventes non annulées</span><strong>${money(values.reduce((sum, n) => sum + n, 0))}</strong></div><svg class="dashboard-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe des ventes quotidiennes sur les 14 derniers jours"><title>Ventes quotidiennes sur les 14 derniers jours</title>${grid}<path d="${path}" class="dashboard-chart-line"/>${pointsSvg}${labels}</svg><p class="small-note">Montants issus des commandes enregistrées, hors commandes annulées. Ce graphique ne confirme pas les paiements effectivement encaissés.</p></div>`;
  }

  function dashboardDonutChart(statuses) {
    const total = statuses.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const radius = 48, circumference = 2 * Math.PI * radius;
    let offset = 0;
    const ring = total > 0 ? statuses.filter(x => x.value > 0).map(item => {
      const length = circumference * Number(item.value) / total;
      const circle = `<circle cx="80" cy="80" r="${radius}" class="dashboard-donut-segment ${item.css}" stroke-dasharray="${length.toFixed(2)} ${(circumference-length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(item.label)} : ${Number(item.value)}</title></circle>`;
      offset += length;
      return circle;
    }).join("") : `<circle cx="80" cy="80" r="${radius}" class="dashboard-donut-empty"/>`;
    const legend = statuses.map(item => `<div class="dashboard-chart-legend-item"><span class="dashboard-legend-dot ${item.css}"></span><span>${esc(item.label)}</span><strong>${Number(item.value || 0)}</strong></div>`).join("");
    return `<div class="dashboard-donut-layout"><svg class="dashboard-donut-svg" viewBox="0 0 160 160" role="img" aria-label="Répartition des commandes par statut"><title>Répartition des commandes</title><g transform="rotate(-90 80 80)">${ring}</g><text x="80" y="76" class="dashboard-donut-total">${total}</text><text x="80" y="96" class="dashboard-donut-caption">commandes</text></svg><div class="dashboard-chart-legend">${legend}</div></div>`;
  }

  function dashboardAvailabilityChart(available, outOfStock) {
    const total = Math.max(1, Number(available || 0) + Number(outOfStock || 0));
    const rows = [
      { label: "Disponible", value: Number(available || 0), css: "available" },
      { label: "Rupture de stock", value: Number(outOfStock || 0), css: "out" }
    ];
    return `<div class="dashboard-availability-bars">${rows.map(row => `<div class="dashboard-availability-row"><div><span>${esc(row.label)}</span><strong>${row.value}</strong></div><div class="dashboard-bar-track"><span class="dashboard-bar-fill ${row.css}" style="width:${Math.min(100, Math.max(0, row.value / total * 100)).toFixed(1)}%"></span></div></div>`).join("")}<p class="small-note">Disponibilité déclarée dans le catalogue. Les nouveaux articles SNAD restent en rupture jusqu’à validation physique du stock.</p></div>`;
  }

  async function adminDashboard() {
    let activeAccounts = null;
    try { activeAccounts = await countActiveAccounts(); } catch (error) { console.warn("Comptes actifs indisponibles", error); }
    const [orders, stock, expenses, quotes, productRows] = await Promise.all([
      readRows("orders"), readRows("stock"), readRows("expenses"), readRows("quotes"), readRows("products")
    ]);
    const sortedOrders = [...orders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    cachedOrders = sortedOrders; stockRows = stock; cachedExpenses = expenses; cachedQuotes = quotes;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
    const last30Start = new Date(dayStart); last30Start.setDate(last30Start.getDate() - 29);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const validOrder = o => !["cancelled","awaiting_payment","awaiting_delivery_payment"].includes(o.status);
    const awaitingPaymentOrders = orders.filter(o => ["awaiting_payment","awaiting_delivery_payment"].includes(o.status)).length;
    const revenue30 = orders.filter(o => validOrder(o) && new Date(o.created_at) >= last30Start).reduce((sum,o) => sum + Number(o.total || 0), 0);
    const revenueMonth = orders.filter(o => validOrder(o) && new Date(o.created_at) >= monthStart).reduce((sum,o) => sum + Number(o.total || 0), 0);
    const pendingOrders = orders.filter(o => ["new","processing"].includes(o.status)).length;
    const deliveredOrders = orders.filter(o => o.status === "delivered");
    const averageDelivered = deliveredOrders.length ? deliveredOrders.reduce((sum,o) => sum + Number(o.total || 0), 0) / deliveredOrders.length : 0;
    const stockValue = stock.reduce((sum,row) => sum + Number(row.quantity || 0) * Number(row.unit_cost || 0), 0);
    const lowStockRows = stock.filter(row => Number(row.min_quantity || 0) > 0 && Number(row.quantity || 0) <= Number(row.min_quantity || 0));
    const newQuotes = quotes.filter(q => q.status === "new").length;
    const expenseTotal = expenses.reduce((sum,row) => sum + Number(row.amount || 0), 0);
    const monthExpenses = expenses.filter(row => {
      const d = new Date(`${row.expense_date || row.created_at || ""}`);
      return Number.isFinite(d.getTime()) && d >= monthStart;
    }).reduce((sum,row) => sum + Number(row.amount || 0), 0);
    const published = productRows.filter(p => p.active && Number(p.price || 0) > 0).length;
    const available = productRows.filter(p => p.availability_status === "available" && Number(p.price || 0) > 0).length;
    const outOfStock = productRows.filter(p => p.availability_status !== "available" || Number(p.price || 0) <= 0).length;
    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const chartDays = Array.from({ length: 14 }, (_, index) => {
      const d = new Date(dayStart); d.setDate(d.getDate() - (13 - index));
      return { key: dayKey(d), label: d.toLocaleDateString("fr-SN", { day: "2-digit", month: "short" }).replace(/\.$/, ""), value: 0 };
    });
    const dayLookup = new Map(chartDays.map(point => [point.key, point]));
    orders.forEach(order => {
      if (!validOrder(order) || !order.created_at) return;
      const created = new Date(order.created_at);
      const target = dayLookup.get(dayKey(created));
      if (target) target.value += Number(order.total || 0);
    });
    const statusCounts = [
      { label: "Nouvelles", value: orders.filter(o=>o.status === "new").length, css: "new" },
      { label: "En préparation", value: orders.filter(o=>o.status === "processing").length, css: "processing" },
      { label: "Livrées", value: orders.filter(o=>o.status === "delivered").length, css: "delivered" },
      { label: "Annulées", value: orders.filter(o=>o.status === "cancelled").length, css: "cancelled" }
    ];
    const recent = sortedOrders.slice(0, 8);
    const cards = [
      { label: "Ventes sur 30 jours", value: money(revenue30), note: "Hors commandes annulées", css: "revenue" },
      { label: "Commandes à traiter", value: String(pendingOrders), note: "Nouvelles + en préparation", css: "pending" },
      { label: "Paiements en attente", value: String(awaitingPaymentOrders), note: "Aucune préparation avant confirmation", css: "payment-pending" },
      { label: "Commandes au total", value: String(orders.length), note: "Historique enregistré", css: "orders" },
      { label: "Panier moyen livré", value: money(averageDelivered), note: `${deliveredOrders.length} commande(s) livrée(s)`, css: "average" },
      { label: "Articles publiés", value: String(published), note: "Prix de vente renseigné", css: "published" },
      { label: "Articles en rupture", value: String(outOfStock), note: "Disponibilité à vérifier", css: "stockout" },
      { label: "Comptes actifs maintenant", value: activeAccounts === null ? "—" : String(activeAccounts), note: `Activité sur 90 s · actualisé à ${now.toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, css: "active-users", live: true }
    ];
    return `<div class="dashboard-welcome"><div><div class="eyebrow">PILOTAGE COMMERCIAL</div><h2>Vue d’ensemble de SAMA-PACK</h2><p>Suivi des ventes, des commandes, du catalogue et des réapprovisionnements.</p></div><button class="btn ghost small" onclick="showAdminView('dashboard')">Actualiser les données</button></div>
      <div class="dashboard-kpis">${cards.map(card=>`<article class="dashboard-kpi ${card.css}"><span class="dashboard-kpi-label">${esc(card.label)}</span><strong ${card.live ? 'id="activeAccountsCount"' : ""}>${esc(card.value)}</strong><small ${card.live ? 'id="activeAccountsLastUpdated"' : ""}>${esc(card.note)}</small></article>`).join("")}</div>
      <div class="dashboard-chart-grid dashboard-chart-grid-main">
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">TENDANCE · 14 JOURS</div><h3>Évolution des ventes</h3></div><span class="dashboard-chart-pill">${money(revenue30)} / 30 j</span></div>${dashboardLineChart(chartDays)}</section>
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">SUIVI DES COMMANDES</div><h3>Répartition par statut</h3></div></div>${dashboardDonutChart(statusCounts)}</section>
      </div>
      <div class="dashboard-chart-grid dashboard-chart-grid-secondary">
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">DISPONIBILITÉ</div><h3>État du catalogue</h3></div><button class="btn ghost small" onclick="showAdminView('stock')">Gérer le stock</button></div>${dashboardAvailabilityChart(available, outOfStock)}</section>
        <section class="panel dashboard-alert-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">ACTIONS À SUIVRE</div><h3>Points de vigilance</h3></div></div><div class="dashboard-alert-list"><div class="dashboard-alert-item ${lowStockRows.length ? "is-warning" : ""}"><span class="dashboard-alert-icon">${lowStockRows.length ? "!" : "✓"}</span><div><strong>${lowStockRows.length} référence(s) sous le seuil de stock</strong><small>Vérifie les quantités à réapprovisionner.</small></div><button class="btn ghost small" onclick="showAdminView('stock')">Voir</button></div><div class="dashboard-alert-item ${newQuotes ? "is-warning" : ""}"><span class="dashboard-alert-icon">${newQuotes ? "!" : "✓"}</span><div><strong>${newQuotes} devis en attente</strong><small>Demandes reçues qui nécessitent un suivi.</small></div><button class="btn ghost small" onclick="showAdminView('quotes')">Voir</button></div><div class="dashboard-alert-item"><span class="dashboard-alert-icon">₣</span><div><strong>Dépenses du mois : ${money(monthExpenses)}</strong><small>Dépenses enregistrées au total : ${money(expenseTotal)}.</small></div><button class="btn ghost small" onclick="showAdminView('expenses')">Voir</button></div><div class="dashboard-alert-item"><span class="dashboard-alert-icon">▦</span><div><strong>Valeur du stock enregistré : ${money(stockValue)}</strong><small>Selon les quantités et coûts saisis dans Stock.</small></div><button class="btn ghost small" onclick="showAdminView('stock')">Voir</button></div></div></section>
      </div>
      <section class="panel dashboard-recent-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">DERNIÈRES ACTIVITÉS</div><h3>Commandes récentes</h3></div><button class="btn ghost small" onclick="showAdminView('orders')">Toutes les commandes</button></div>${recent.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${recent.map(o=>`<tr><td><strong>${esc(o.id)}</strong></td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name || "Client historique")}<br><span class="small-note">${esc(o.customer_phone || "")}</span></td><td>${money(o.total)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td><td><button class="btn ghost small" onclick="showOrder('${esc(o.id)}')">Détails</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment. Les nouvelles commandes apparaîtront ici.</div>'}</section>
      <p class="small-note dashboard-data-footnote">Dernière actualisation : ${esc(now.toLocaleString("fr-SN", { dateStyle: "medium", timeStyle: "short" }))}. Les indicateurs s’appuient sur les enregistrements actuels de Supabase.</p>`;
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
    return `<div class="panel"><div class="admin-panel-head"><h3>Commandes (${orders.length})</h3><button class="btn ghost small" onclick="showAdminView('orders')">Actualiser</button></div><p class="small-note">Les commandes en attente de paiement ne doivent pas être préparées. Les frais de livraison doivent être encaissés et confirmés avant le départ du livreur.</p>${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Paiement reçu</th><th>Statut</th><th>Détails</th></tr></thead><tbody>${orders.map(o=>{
      const pendingPayment = ["awaiting_payment","awaiting_delivery_payment"].includes(o.status);
      const options = pendingPayment ? [o.status,"cancelled"] : ["new","confirmed","processing","prepared","out_for_delivery","delivered","cancelled"];
      return `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name)}<br><span class="small-note">${esc(o.customer_phone)}</span></td><td>${money(o.total)}</td><td>${money(o.amount_paid || 0)}<br><span class="small-note">${esc(paymentStatusLabel(o.payment_status))}</span></td><td><select class="input" onchange="setOrderStatus('${esc(o.id)}',this.value)">${options.map(s=>`<option ${o.status===s?"selected":""} value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></td><td><div class="account-order-actions"><button class="btn small ghost" onclick="showOrder('${esc(o.id)}')">Voir</button><button class="btn small secondary" onclick="openOrderWhatsApp('${esc(o.id)}')">WhatsApp</button></div></td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment.</div>'}</div>`;
  }
  function showOrder(id) {
    const o = cachedOrders.find(x => x.id === id); if (!o) return toast("Commande introuvable.", true);
    const customer = cachedCustomers.find(c => c.id === o.customer_id) || {};
    const lines = cachedOrderItems.filter(x => x.order_id === o.id);
    const name = o.customer_name || customer.name || "Client"; const phone = o.customer_phone || customer.phone || "";
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE</div><h2>${esc(o.id)}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p><strong>${esc(name)}</strong> · ${esc(phone)}<br>${esc(o.delivery_address || customer.address || "")} ${esc(o.delivery_zone || customer.zone || "")}<br><span class="small-note">Créée le ${esc(fmtDate(o.created_at))}</span></p><ul class="pack-items">${lines.map(i=>`<li>${Number(i.quantity)} × ${esc(i.product_name)} — ${money(i.unit_price)}</li>`).join("") || "<li>Détails des lignes indisponibles pour cette ancienne commande.</li>"}</ul><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(o.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(o.delivery)}</strong></div><div class="summary-row"><span>Mode choisi</span><strong>${esc(o.payment || "Non renseigné")}</strong></div><div class="summary-row"><span>Statut du paiement</span><strong>${esc(paymentStatusLabel(o.payment_status))}</strong></div><div class="summary-row"><span>Déjà encaissé</span><strong>${money(o.amount_paid || 0)}</strong></div><div class="summary-row"><span>Solde restant</span><strong>${money(Math.max(0, Number(o.total || 0)-Number(o.amount_paid || 0)))}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>${["awaiting_payment","awaiting_delivery_payment"].includes(o.status) ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(o.id)}')">Reprendre le paiement</button>` : ""}`);
  }
  async function setOrderStatus(id, status) {
    if (!isAdmin()) return toast("Accès refusé.", true);
    const allowed = ["new","confirmed","processing","prepared","out_for_delivery","delivered","cancelled","awaiting_payment","awaiting_delivery_payment"];
    if (!allowed.includes(status)) return toast("Statut invalide.", true);
    const order = cachedOrders.find(row => row.id === id);
    if (order && ["awaiting_payment","awaiting_delivery_payment"].includes(order.status) && status !== "cancelled" && status !== order.status) {
      toast("Préparation bloquée : attends la confirmation du paiement requis.", true);
      return showAdminView("orders");
    }
    const { error } = await client.from("orders").update({ status }).eq("id", id);
    if (error) { toast(errorMessage(error), true); return showAdminView("orders"); }
    toast(status === "cancelled" ? "Commande annulée. La notification est ajoutée au compte du client." : "Statut modifié. Le client reçoit une notification dans son compte ; utilise le bouton WhatsApp pour lui préparer aussi un message.");
    await showAdminView("orders");
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
    const { data, error } = await client.from("profiles")
      .select("id,full_name,phone,email,role,is_super_admin,invited_by,created_at")
      .eq("role", "admin").order("created_at", { ascending: true });
    if (error) throw error;
    const admins = data || [];
    const isGeneralAdmin = currentProfile?.is_super_admin === true;
    const inviterIds = [...new Set(admins.map(row => row.invited_by).filter(Boolean))];
    const inviterLabels = Object.create(null);
    if (inviterIds.length) {
      const { data: inviters, error: inviterError } = await client.from("profiles")
        .select("id,full_name,email").in("id", inviterIds);
      if (!inviterError) (inviters || []).forEach(row => { inviterLabels[row.id] = row.full_name || row.email || "Administrateur"; });
    }
    const invitePanel = isGeneralAdmin
      ? `<div class="panel admin-invite-panel"><div class="eyebrow">ACCÈS ET SÉCURITÉ</div><h3>Inviter un administrateur</h3><p>Seul l’administrateur général peut ajouter ou retirer des accès administrateur. Chaque compte doit rester nominatif.</p><form id="inviteAdminForm" class="admin-form"><label>Nom complet<input class="input" name="full_name" required minlength="2" maxlength="120" placeholder="Nom complet"></label><label>Adresse e-mail<input class="input" name="email" type="email" required maxlength="254" placeholder="personne@entreprise.sn"></label><button class="btn primary full" type="submit">Envoyer l’invitation</button></form><p class="small-note">L’invité reçoit un lien par e-mail. La journalisation conserve l’auteur de l’invitation.</p></div>`
      : `<div class="panel admin-permission-note"><h3>Gestion des accès</h3><p>Tu peux consulter la liste des administrateurs, mais seul l’administrateur général peut inviter un administrateur ou lui retirer ses droits.</p></div>`;
    const tableHtml = admins.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Administrateur</th><th>Compte</th><th>Niveau d’accès</th><th>Invité par</th><th>Depuis</th>${isGeneralAdmin ? "<th>Actions</th>" : ""}</tr></thead><tbody>${admins.map(a => {
      const general = a.is_super_admin === true;
      const canRemove = isGeneralAdmin && !general && a.id !== currentUser?.id;
      return `<tr><td><strong>${esc(a.full_name || "Sans nom")}</strong><br><span class="small-note">${general ? "Propriétaire de l’espace" : "Compte administrateur"}</span></td><td>${esc(a.email || "—")}<br><span class="small-note">${esc(a.phone || "")}</span></td><td><span class="status ${general ? "delivered" : "processing"}">${general ? "Administrateur général" : "Administrateur"}</span></td><td>${general ? "—" : esc(inviterLabels[a.invited_by] || (a.invited_by ? "Administrateur général" : "Ancien compte"))}</td><td>${esc(fmtDate(a.created_at))}</td>${isGeneralAdmin ? `<td>${canRemove ? `<button class="btn small danger" onclick="removeAdmin('${esc(a.id)}')">Retirer les droits</button>` : `<span class="small-note">${general ? "Compte protégé" : "Ton compte"}</span>`}</td>` : ""}</tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty">Aucun administrateur n’est enregistré.</div>';
    return `${invitePanel}<div class="panel admin-accounts-list"><div class="dashboard-panel-heading"><div><div class="eyebrow">ACCÈS AU BACK-OFFICE</div><h3>Administrateurs (${admins.length})</h3></div><span class="small-note">${isGeneralAdmin ? "Tu es administrateur général." : "Consultation uniquement."}</span></div>${tableHtml}<p class="small-note">« Retirer les droits » transforme le compte en compte client et le retire de cette liste. L’historique des commandes et des actions est conservé.</p></div>`;
  }

  async function removeAdmin(id) {
    if (currentProfile?.is_super_admin !== true) return toast("Seul l’administrateur général peut retirer les droits d’un administrateur.", true);
    if (!id || id === currentUser?.id) return toast("Tu ne peux pas retirer tes propres droits administrateur général.", true);
    const target = (await client.from("profiles").select("full_name,email,is_super_admin").eq("id", id).maybeSingle()).data;
    if (target?.is_super_admin) return toast("L’administrateur général est protégé.", true);
    const label = target?.full_name || target?.email || "cet administrateur";
    if (!window.confirm(`Retirer les droits administrateur de ${label} ? Le compte restera disponible comme compte client et l’historique sera conservé.`)) return;
    const { data, error } = await client.functions.invoke("sama-remove-admin", { body: { user_id: id } });
    if (error || data?.error) return toast(data?.error || errorMessage(error), true);
    toast(data?.message || "Droits administrateur retirés.");
    await showAdminView("admins");
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
    if ($("budgetPackBuilderBtn")) $("budgetPackBuilderBtn").onclick = openBudgetPackBuilder;
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
    await handlePaymentReturn();
    client.auth.onAuthStateChange((_event, session) => { setTimeout(async () => { await syncAuth(session?.user || null); await handlePaymentReturn(); }, 0); });
  }

  // Functions called by inline storefront/admin controls.
  Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,retryOrderPayment,resendPaymentConfirmation,showAccountHome,reorderOrder,openBudgetPackBuilder,suggestBudgetPack,changeBudgetBuilderQty,addBudgetPackToCart,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem,removeAdmin,openSubscriptionEditor,addSubscriptionLine,removeSubscriptionLine,toggleSubscriptionStatus,prepareSubscriptionOrder,advanceSubscriptionReminder,deleteSubscription,openOrderWhatsApp});
  start().catch(err => { console.error(err); toast("Initialisation impossible. Recharge la page ou contacte l’administrateur.",true); });
})();
