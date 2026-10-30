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
  const FALLBACK_PRODUCTS = [];
  const iconById = {SP01:"🧼",SP02:"👶",SP03:"🧽",SP04:"🧼",SP05:"💼",SP06:"🍳",SP07:"🌸",SP08:"🏡",SP09:"🎉",SP10:"🏪"};
  const $ = (id) => document.getElementById(id);

  let client = null;
  let products = [];
  let catalogLoadFailed = false;
  let currentUser = null;
  let currentProfile = null;
  let accountButtonAvatarUrl = "";
  let accountButtonAvatarPath = "";
  let accountAvatarRequestId = 0;
  let profilePhotoPreviewUrl = null;
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
  let currentBusinessAccount = null;
  let currentSalesReferralCode = "";
  let cachedExpenses = [];
  let cachedSuppliers = [];
  let appSettings = { company: "SAMA-PACK", whatsapp: "", contactEmail: "", deliveryFee: 1500, currency: "FCFA", homepageBackgroundUrl: "" };
  let cart = loadCart();
  let budgetBuilderState = { budget: 5000, category: "all", items: [] };

  function normalizeFallbackProduct(p) {
    return { id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"), name: String(p.name || "Pack"), cat: String(p.cat || p.category || "Autre"), category: String(p.cat || p.category || "Autre"), price: Number(p.price || 0), desc: String(p.desc || p.description || ""), description: String(p.desc || p.description || ""), items: Array.isArray(p.items) ? p.items : [], image_path: p.image_path || "", image_paths: Array.isArray(p.image_paths) ? p.image_paths : [], active: p.active !== false, promo_active: p.promo_active === true, promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale"), promo_end_at: p.promo_end_at || null };
  }
  function normalizeProduct(p) {
    return { ...p, id: String(p.id), public_ref: String(p.public_ref || p.id), availability_status: String(p.availability_status || "available"), catalog_type: String(p.catalog_type || "pack"), cat: String(p.category || p.cat || "Autre"), category: String(p.category || p.cat || "Autre"), price: Number(p.price || 0), desc: String(p.description || p.desc || ""), description: String(p.description || p.desc || ""), items: Array.isArray(p.items) ? p.items : [], image_path: String(p.image_path || ""), image_paths: Array.isArray(p.image_paths) ? p.image_paths : [], active: p.active !== false, promo_active: p.promo_active === true && (!p.promo_end_at || (Number.isFinite(new Date(p.promo_end_at).getTime()) && new Date(p.promo_end_at).getTime() > Date.now())), promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale") };
  }
  function getProductImages(p) {
    const paths = Array.isArray(p?.image_paths) ? p.image_paths : [];
    const legacy = String(p?.image_path || "").trim();
    return [...new Set([...paths, legacy].map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8);
  }
  function resolveProductImageUrl(path) {
    const value = String(path || "").trim();
    return /^https?:\/\//i.test(value) ? value : value.replace(/^\//, "");
  }
  function selectProductImage(button) {
    const gallery = button?.closest(".product-detail-gallery");
    const main = gallery?.querySelector(".product-photo-detail");
    const source = button?.dataset?.imageSrc;
    if (!main || !source) return;
    main.src = source;
    main.alt = button.dataset.imageAlt || main.alt;
    gallery.querySelectorAll(".product-image-thumb").forEach(item => item.classList.toggle("is-active", item === button));
  }
  function normalizeWhatsAppNumber(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 9 && /^[37]/.test(digits)) digits = "221" + digits;
    else if (digits.length === 10 && digits.startsWith("0")) digits = "221" + digits.slice(1);
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
  }
  function testWhatsAppNumber(inputId) {
    const input = $(inputId);
    const number = normalizeWhatsAppNumber(input?.value);
    if (!number) return toast("Saisis un numéro valide avec son indicatif (ex. +221 77 123 45 67).", true);
    window.open("https://wa.me/" + number + "?text=" + encodeURIComponent("Bonjour, je vérifie ce numéro WhatsApp pour mon compte SAMA-PACK."), "_blank", "noopener,noreferrer");
    toast("WhatsApp est ouvert. Vérifie si le numéro est joignable dans l’application.");
  }
  function profileDeliveryAddress(profile) {
    const p = profile || {};
    return [p.delivery_address, p.delivery_landmark ? "Repère : " + p.delivery_landmark : "", p.delivery_instructions ? "Instructions : " + p.delivery_instructions : ""].filter(Boolean).join(" — ").slice(0, 300);
  }
  function profileDeliveryZone(profile) {
    const p = profile || {};
    return [p.delivery_region, p.delivery_city, p.delivery_commune, p.delivery_neighborhood].filter(Boolean).join(", ").slice(0, 300);
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
    if (p.promo_started_at) { const start = new Date(p.promo_started_at).getTime(); if (!Number.isFinite(start) || start > Date.now()) return false; }
    if (p.promo_end_at) { const end = new Date(p.promo_end_at).getTime(); if (!Number.isFinite(end) || end <= Date.now()) return false; }
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
    const { data, error } = await client.from("profiles").select("id,full_name,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,delivery_landmark,delivery_instructions,email,role,is_super_admin,admin_permissions,invited_by,created_at,avatar_path,marketing_opt_in").eq("id", user.id).maybeSingle();
    if (error) { console.warn("Profile unavailable", error); return null; }
    return data;
  }
  function isAdmin() { return currentProfile?.role === "admin"; }
  function isCourier() { return currentProfile?.role === "courier"; }
  function isGeneralAdmin() { return isAdmin() && currentProfile?.is_super_admin === true; }
  function hasAdminPermission(permission) { return isGeneralAdmin() || (isAdmin() && currentProfile?.admin_permissions?.[permission] === true); }
  const ADMIN_VIEW_PERMISSION = {
    dashboard: "dashboard.view", orders: "orders.view", customers: "customers.view",
    prospects: "prospects.view", quotes: "quotes.view", sales_codes: "sales_codes.view",
    packs: "catalog.view", products: "catalog.view", catalogs: "catalog.view",
    stock: "stock.view", expenses: "expenses.submit", deliveries: "orders.view"
  };
  function canViewAdminView(view) {
    if (isGeneralAdmin()) return true;
    // Any authenticated administrator can always return to the dashboard.
    // Dashboard queries remain scoped by database RLS and permission-aware reads.
    if (view === "deliveries") return isGeneralAdmin();
    if (view === "contacts" && isAdmin()) return true;
    if (view === "dashboard" && isAdmin()) return true;
    const permission = ADMIN_VIEW_PERMISSION[view];
    return Boolean(permission && hasAdminPermission(permission));
  }
  function adminViewDeniedMessage() {
    return "Ton compte ne dispose pas de la permission nécessaire pour ouvrir ce module.";
  }


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
    const canCreateProspect = hasAdminPermission("prospects.create");
    const canUpdateProspect = hasAdminPermission("prospects.update");
    const showProspectForm = editing ? canUpdateProspect : canCreateProspect;
    const formHtml = showProspectForm ? `<div class="panel prospect-form-panel"><div class="section-head"><div><div class="eyebrow">SUIVI COMMERCIAL</div><h3>${editing ? "Modifier le prospect" : "Ajouter un prospect"}</h3></div>${editing ? '<button type="button" class="btn ghost small" onclick="editProspect(\'\')">Annuler</button>' : ""}</div>
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
      </form></div>` : '<div class="panel"><h3>Prospection</h3><p class="small-note">Tu peux consulter les prospects accessibles, mais tu n’as pas la permission de créer ou modifier des fiches.</p></div>';

    const listHtml = rows?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Prospect</th><th>Coordonnées</th><th>Suivi</th><th>Responsable</th><th>Actions</th></tr></thead><tbody>${rows.map(row => `<tr>
      <td><strong>${esc(row.full_name)}</strong><br><span class="small-note">${esc(row.company || "Structure non renseignée")}</span>${row.position ? `<br><span class="small-note">${esc(row.position)}</span>` : ""}</td>
      <td>${row.phone ? `<div>${esc(row.phone)}</div>` : ""}${row.email ? `<div>${esc(row.email)}</div>` : ""}${row.address ? `<div class="small-note">${esc(row.address)}</div>` : ""}</td>
      <td>${hasAdminPermission("prospects.update") ? `<label class="prospect-status-field"><span class="small-note">${esc(prospectStatusLabel(row.status))}</span><select class="input" aria-label="Statut de ${esc(row.full_name)}" onchange="setProspectStatus('${esc(row.id)}',this.value)">${PROSPECT_STATUSES.map(([value,label]) => `<option value="${value}" ${row.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : `<span class="small-note">${esc(prospectStatusLabel(row.status))}</span>`}${row.notes ? `<details class="prospect-notes"><summary>Notes</summary><p>${esc(row.notes)}</p></details>` : ""}</td>
      <td><strong>${esc(assignedLabels[row.created_by] || "Administrateur")}</strong></td>
      <td><div class="prospect-actions">${hasAdminPermission("prospects.update") ? `<button class="btn ghost small" onclick="editProspect('${esc(row.id)}')">Modifier</button>` : ""}${hasAdminPermission("prospects.delete") ? `<button class="btn ghost small danger" onclick="deleteProspect('${esc(row.id)}')">Supprimer</button>` : ""}</div></td>
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
    if (id && !hasAdminPermission("prospects.update")) return toast("Tu n’as pas la permission de modifier les prospects.", true);
    editingProspectId = id || null;
    await renderProspectsAdmin();
    if (editingProspectId) $("adminContent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function setProspectStatus(id, status) {
    if (!hasAdminPermission("prospects.update")) return toast("Cette action n’est pas autorisée.", true);
    if (!PROSPECT_STATUSES.some(option => option[0] === status)) return toast("Statut de prospect invalide.", true);
    const { error } = await client.from("prospects").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast("Statut du prospect mis à jour.");
    await renderProspectsAdmin();
  }

  async function deleteProspect(id) {
    if (!hasAdminPermission("prospects.delete")) return toast("Cette action n’est pas autorisée.", true);
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
      .select("id,public_ref,availability_status,name,catalog_type,category,price,description,items,image_path,image_paths,active,promo_active,promo_price,promo_label,promo_started_at,promo_end_at")
      .in("catalog_type", ["product", "tool"])
      .order("name", { ascending: true });
    if (error) {
      host.innerHTML = '<div class="panel"><h3>Catalogue individuel</h3><p>Impossible de charger les produits et outils.</p></div>';
      console.warn("Individual catalog load failed", error);
      return toast(errorMessage(error), true);
    }
    if (!isGeneralAdmin()) {
      const visible = (rows || []).filter(p => p.active === true);
      host.innerHTML = '<div class="panel"><div class="admin-panel-head"><h3>Produits et outils publiés</h3><span class="small-note">Consultation uniquement. Coûts fournisseurs, marges et publications sont réservés au propriétaire.</span></div>' +
        (visible.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Article</th><th>Type</th><th>Prix public</th><th>Disponibilité</th></tr></thead><tbody>' +
          visible.map(function(p) { return '<tr><td>' + esc(p.public_ref || p.id) + '</td><td><strong>' + esc(p.name) + '</strong><br><span class="small-note">' + esc(p.category || "") + '</span></td><td>' + (p.catalog_type === "tool" ? "Outil" : "Produit") + '</td><td>' + money(p.price) + '</td><td>' + availabilityBadgeHtml(p) + '</td></tr>'; }).join("") +
          '</tbody></table></div>' : '<div class="empty">Aucun produit ou outil publié.</div>') + '</div>';
      return;
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
        <label class="full">Image principale (URL HTTPS ou chemin)<input class="input" name="image_path" maxlength="1000" value="${esc(current.image_path || "")}" placeholder="https://… ou images/produit.jpg"></label><p class="small-note full">Photos actuellement enregistrées : ${getProductImages(current).length}. Jusqu’à 8 photos par article.</p><label class="full">Photos supplémentaires (JPG, PNG ou WebP · 5 Mo maximum par photo)<input class="input" name="image_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label class="check-label full"><input type="checkbox" name="replace_images"> Remplacer les photos actuelles par les nouvelles (ou les supprimer si aucune photo n’est choisie)</label>
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
        const productId = editingCatalogItemId || ("CAT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase());
        const replaceImages = data.get("replace_images") === "on";
        let existingImages = replaceImages ? [] : getProductImages(current);
        if (!replaceImages && payload.image_path && !existingImages.includes(payload.image_path)) existingImages.unshift(payload.image_path);
        const imageUpload = await uploadProductImages(data.getAll("image_files"), productId, existingImages);
        if (imageUpload.error) return toast(imageUpload.error, true);
        payload.image_paths = imageUpload.images;
        payload.image_path = payload.image_paths[0] || (replaceImages ? "" : payload.image_path);
        if (payload.active && !payload.image_paths.length && !(editingCatalogItemId && current.active === true)) return toast("Ajoute au moins une photo avant de publier cet article.", true);
        let result;
        if (editingCatalogItemId) {
          result = await client.from("products").update(payload).eq("id", productId);
        } else {
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
    if (active && !getProductImages(product).length) return toast("Ajoute au moins une photo à cet article avant de le publier.", true);
    if (!window.confirm(`Confirmer : ${action} cet article dans le catalogue ?`)) return;
    const { error } = await client.from("products").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(active ? "Article publié." : "Article masqué du catalogue.");
    await loadPublicData();
    await renderIndividualCatalogAdmin();
  }

  async function uploadProductImages(files, productId, existingImages = []) {
    const selected = Array.from(files || []).filter(file => file instanceof File && file.size > 0);
    if (selected.length + existingImages.length > 8) return { error: "Un article peut contenir au maximum 8 photos. Retire des photos ou coche le remplacement." };
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (selected.some(file => !allowed.includes(file.type) || file.size > 5 * 1024 * 1024)) {
      return { error: "Chaque photo doit être au format JPG, PNG ou WebP et peser 5 Mo maximum." };
    }
    const images = [...existingImages];
    for (const file of selected) {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = String(productId) + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      const { data, error } = await client.storage.from("sama-pack-products").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (error) return { error: "Envoi d’une photo impossible : " + errorMessage(error) };
      images.push(client.storage.from("sama-pack-products").getPublicUrl(data.path).data.publicUrl);
    }
    return { images: [...new Set(images)].slice(0, 8) };
  }

  async function loadPublicData() {
    if (!client) return;
    const { data: rows, error } = await client.from("products")
      .select("id,public_ref,availability_status,name,catalog_type,category,price,description,items,image_path,image_paths,active,promo_active,promo_price,promo_label,promo_started_at,promo_end_at")
      .order("id", { ascending: true });
    if (!error && Array.isArray(rows)) {
      products = rows.map(normalizeProduct);
      catalogLoadFailed = false;
    } else {
      products = [];
      catalogLoadFailed = true;
      console.warn("Catalogue distant indisponible; les prix de secours ne sont pas utilisés.", error);
    }
    const [{ data: setting, error: settingError }, { data: notificationSettings, error: notificationError }] = await Promise.all([
      client.from("settings").select("id,company,whatsapp,delivery_fee,currency,homepage_background_url").eq("id", true).maybeSingle(),
      client.from("notification_settings").select("id,order_notification_email").eq("id", true).maybeSingle()
    ]);
    if (!settingError && setting) {
      appSettings = { company: setting.company || "SAMA-PACK", whatsapp: String(setting.whatsapp || ""), contactEmail: String(notificationSettings?.order_notification_email || ""), deliveryFee: Number(setting.delivery_fee || 0), currency: setting.currency || "FCFA", homepageBackgroundUrl: String(setting.homepage_background_url || "") };
      applyHomepageBackground();
    } else if (settingError) console.warn("Paramètres distants indisponibles.", settingError);
    if (notificationError) console.warn("Adresse e-mail de contact indisponible.", notificationError);
    await loadProductReviewStats();
    const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active && p.catalog_type === "pack").length);
    updateContact(); updateCategoryFilter(); renderTop(); renderProducts(); renderPromoCarousel(); updateCartCount();
    if (document.body?.dataset?.productDetail === "true") renderSEOProductPage();
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
    const email = String(appSettings.contactEmail || "").trim();
    const card = document.querySelector(".contact-card");
    const intro = $("contactText");
    if (card) {
      const rows = [];
      if (n) rows.push('<div class="contact-detail"><strong>WhatsApp</strong><p id="contactPhone"></p></div>');
      if (email) rows.push('<div class="contact-detail"><strong>E-mail</strong><p><a id="contactEmailLink"></a></p></div>');
      if (n) rows.push('<button class="btn secondary" id="contactWhatsApp">Ouvrir WhatsApp</button>');
      if (!rows.length) {
        card.innerHTML = '<div class="contact-icon">ⓘ</div><div><strong>Besoin d’aide ?</strong><p>Retrouvez les étapes de commande et les réponses aux questions fréquentes.</p></div><a class="btn secondary" href="comment-ca-marche.html">Voir le guide client</a>';
      } else {
        card.innerHTML = '<div class="contact-icon">💬</div><div class="contact-details-list">' + rows.join("") + '</div>';
        const phone = $("contactPhone"); if (phone) phone.textContent = "+" + n;
        const emailLink = $("contactEmailLink");
        if (emailLink) { emailLink.href = "mailto:" + email; emailLink.textContent = email; }
        const button = $("contactWhatsApp"); if (button) button.onclick = () => openWA("Bonjour " + String(appSettings.company || "SAMA-PACK") + ", je souhaite avoir plus d’informations sur vos produits.");
      }
    }
    if (intro) intro.textContent = (n || email)
      ? "Contacte " + String(appSettings.company || "SAMA-PACK") + " avec les coordonnées officielles configurées dans la boutique."
      : "Consultez notre guide client ou envoyez une demande de devis à notre équipe.";
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
  function updateSEOProductMeta(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.setAttribute("content", String(value || ""));
  }
  function renderSEOProductPage() {
    const host = $("seoProductRoot");
    if (!host) return;
    let ref = "";
    try { ref = new URLSearchParams(window.location.search).get("ref") || ""; } catch { ref = ""; }
    const p = products.find(item => item.active && (item.id === ref || item.public_ref === ref));
    const canonical = p ? "https://sama-pack.store/fiche-produit.html?ref=" + encodeURIComponent(p.id) : "https://sama-pack.store/fiche-produit.html";
    const canonicalNode = document.querySelector('link[rel="canonical"]');
    if (canonicalNode) canonicalNode.setAttribute("href", canonical);
    if (!p) {
      document.title = catalogLoadFailed ? "Catalogue indisponible | SAMA-PACK" : "Article indisponible | SAMA-PACK";
      updateSEOProductMeta('meta[name="description"]', "Consultez les produits de nettoyage et les packs disponibles chez SAMA-PACK à Dakar.");
      updateSEOProductMeta('meta[name="robots"]', "noindex,follow");
      updateSEOProductMeta('meta[property="og:title"]', document.title);
      updateSEOProductMeta('meta[property="og:description"]', "Retournez au catalogue SAMA-PACK pour consulter les articles disponibles.");
      updateSEOProductMeta('meta[property="og:url"]', canonical);
      $("seoProductCategory").textContent = "Fiche indisponible";
      host.innerHTML = '<div class="panel"><h1>' + (catalogLoadFailed ? "Catalogue temporairement indisponible" : "Article introuvable") + '</h1><p>' + (catalogLoadFailed ? "Les données et prix n’ont pas pu être actualisés. Réessaie dans quelques instants." : "Cette fiche n’est pas publiée ou la référence n’existe plus.") + '</p><div class="hero-actions"><a class="btn primary" href="/#catalogue">Voir les packs</a><a class="btn ghost" href="produits.html">Voir les produits</a></div><button class="btn ghost" type="button" onclick="window.location.reload()">Réessayer</button></div>';
      const jsonld = $("productJsonLd"); if (jsonld) jsonld.textContent = "{}";
      return;
    }
    const title = p.name + " | SAMA-PACK à Dakar";
    const plainDesc = String(p.desc || p.description || ("Découvrez " + p.name + " chez SAMA-PACK à Dakar.")).replace(/\s+/g, " ").trim();
    const description = plainDesc.length > 155 ? plainDesc.slice(0,152).replace(/\s+\S*$/,"") + "…" : plainDesc;
    document.title = title;
    updateSEOProductMeta('meta[name="description"]', description);
    updateSEOProductMeta('meta[name="robots"]', "index,follow,max-image-preview:large");
    updateSEOProductMeta('meta[property="og:title"]', title);
    updateSEOProductMeta('meta[property="og:description"]', description);
    updateSEOProductMeta('meta[property="og:url"]', canonical);
    const category = String(p.cat || p.category || (p.catalog_type === "pack" ? "Packs ménagers" : "Produits de nettoyage"));
    $("seoProductCategory").textContent = category;
    const paths = getProductImages(p);
    const images = paths.map(path => {
      try { return new URL(resolveProductImageUrl(path), window.location.origin + "/").href; }
      catch { return ""; }
    }).filter(Boolean);
    const picture = paths.length
      ? '<div class="seo-product-photo-wrap"><img class="seo-product-photo" src="' + esc(resolveProductImageUrl(paths[0])) + '" alt="' + esc(p.name) + '" loading="eager" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><div class="product-placeholder" style="display:none">' + cleaningBottleSvg() + '</div></div>'
      : '<div class="seo-product-photo-wrap"><div class="product-placeholder">' + cleaningBottleSvg() + '</div></div>';
    const list = Array.isArray(p.items) && p.items.length
      ? '<h2>Composition et caractéristiques</h2><ul class="seo-product-list">' + p.items.map(item => '<li>' + esc(item) + '</li>').join("") + '</ul>'
      : "";
    const status = p.availability_status === "out_of_stock" ? "Actuellement en rupture de stock." : "Article disponible à la commande, sous réserve de confirmation au moment de valider le panier.";
    host.innerHTML = '<article class="seo-product-layout">' + picture + '<div class="seo-product-info"><div class="eyebrow">' + esc(category) + ' · ' + esc(publicProductRef(p)) + '</div><h1>' + esc(p.name) + '</h1><div id="seoProductRatingSummary">' + renderProductRatingSummary(p.id) + '</div><p>' + esc(p.desc || p.description || "") + '</p><p class="small-note">' + esc(status) + '</p>' + list + '<div class="seo-product-price">' + priceDisplayHtml(p) + '</div><div class="product-actions"><button class="btn primary" type="button" id="seoAddToCartBtn" ' + (canSellProduct(p) ? "" : "disabled") + '>' + (p.availability_status === "out_of_stock" ? "Rupture de stock" : canSellProduct(p) ? "Ajouter au panier" : "Prix à confirmer") + '</button><button class="btn ghost" type="button" id="seoOpenCartBtn">Voir le panier</button></div><a class="btn ghost" href="' + (p.catalog_type === "product" ? "produits.html" : p.catalog_type === "tool" ? "outils.html" : "/#catalogue") + '">Retour au catalogue</a></div></article><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="' + esc(p.id) + '"><p class="review-loading">Chargement des avis…</p></section>';
    $("seoAddToCartBtn")?.addEventListener("click", () => addToCart(p.id));
    $("seoOpenCartBtn")?.addEventListener("click", renderCartModal);
    const offer = { "@type":"Offer", "priceCurrency":"XOF", "price":getEffectivePrice(p), "availability":p.availability_status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", "url":canonical };
    const schema = { "@context":"https://schema.org", "@type":"Product", "name":p.name, "description":plainDesc, "sku":publicProductRef(p), "offers":offer };
    if (images.length) schema.image = images;
    if (p.brand) schema.brand = { "@type":"Brand", "name":p.brand };
    const jsonld = $("productJsonLd"); if (jsonld) jsonld.textContent = JSON.stringify(schema);
    if (!isGeneralAdmin()) void renderProductReviews(p.id);
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
    grid.innerHTML = catalogLoadFailed
      ? '<div class="product-load-error"><strong>Le catalogue est momentanément indisponible.</strong><p>Pour éviter de te présenter des prix obsolètes, les articles ne sont pas affichés. Vérifie ta connexion puis réessaie.</p><button class="btn ghost" type="button" onclick="window.location.reload()">Réessayer</button></div>'
      : arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || '<div class="empty">' + (currentType === "product" ? "Aucun produit ne correspond à votre recherche." : "Aucun pack ne correspond à votre recherche.") + '</div>';
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
    const images = getProductImages(p);
    const path = images[0] || "";
    const hasImage = Boolean(path);
    const src = resolveProductImageUrl(path);
    const photo = hasImage ? `<img class="product-photo" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : "";
    const fallback = `<div class="product-placeholder ${hasImage ? "photo-fallback" : ""}" ${hasImage ? 'style="display:none"' : ""}>${cleaningBottleSvg()}</div>`;
    const out = p.availability_status === "out_of_stock";
    const canAdd = canSellProduct(p);
    const description = p.catalog_type === "product" && p.desc ? `<p class="product-desc">${esc(p.desc)}</p>` : "";
    return `<article class="product-card"><div class="pack-visual ${hasImage ? "has-photo" : ""}">${photo}${fallback}${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body">${availabilityBadgeHtml(p)}<div class="product-cat">${esc(p.cat)}</div><a class="product-name-link" href="fiche-produit.html?ref=${encodeURIComponent(p.id)}">${esc(p.name)}</a>${description}${renderProductRatingSummary(p.id)}<div class="price-row">${priceDisplayHtml(p)}</div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')" ${canAdd ? "" : "disabled"}>${out ? "Rupture" : canAdd ? "Ajouter" : "Prix à confirmer"}</button></div></div></article>`;
  }

  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const images = getProductImages(p);
    const path = images[0] || "";
    const src = resolveProductImageUrl(path);
    const photo = path
      ? '<div class="product-detail-gallery"><div class="product-detail-image-wrap"><img class="product-photo product-photo-detail" src="' + esc(src) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><div class="product-placeholder" style="display:none">' + cleaningBottleSvg() + '</div></div>' +
        (images.length > 1 ? '<div class="product-image-thumbnails" aria-label="Photos du produit">' + images.map((image, index) => '<button type="button" class="product-image-thumb ' + (index === 0 ? 'is-active' : '') + '" data-image-src="' + esc(resolveProductImageUrl(image)) + '" data-image-alt="' + esc(p.name + ' — photo ' + (index + 1)) + '" onclick="selectProductImage(this)" aria-label="Afficher la photo ' + (index + 1) + '"><img src="' + esc(resolveProductImageUrl(image)) + '" alt="" loading="lazy"></button>').join('') + '</div>' : '') + '</div>'
      : '<div class="product-detail-placeholder product-placeholder">' + cleaningBottleSvg() + '</div>';
    const canAdd = canSellProduct(p);
    showModal('<div class="modal-head"><div><div class="eyebrow">' + esc(p.cat) + '</div><h2>' + esc(p.name) + '</h2></div><button class="close" onclick="closeModal()">✕</button></div>' + photo + '<div class="product-detail-meta">' + availabilityBadgeHtml(p) + '</div><div id="productRatingSummaryDetail">' + renderProductRatingSummary(p.id) + '</div><p>' + esc(p.desc) + '</p><ul class="pack-items">' + p.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul><div class="price-row">' + priceDisplayHtml(p) + '<button class="btn primary" ' + (canAdd ? 'onclick="addToCart(\'' + esc(p.id) + '\');closeModal()"' : 'disabled') + '>' + (p.availability_status === "out_of_stock" ? "Rupture de stock" : canAdd ? "Ajouter au panier" : "Prix à confirmer") + '</button></div><section id="productReviewsPanel" class="product-reviews-panel" data-product-id="' + esc(p.id) + '"><p class="review-loading">Chargement des avis…</p></section>');
    if (!isGeneralAdmin()) void renderProductReviews(p.id);
  }

  function addToCart(id) {
    if (isGeneralAdmin()) return toast("Le compte administrateur général n’utilise pas les fonctions d’achat client.", true);
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
    if (isGeneralAdmin()) return toast("Le panier client n’est pas disponible pour l’administrateur général.");
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
    if (isGeneralAdmin()) return toast("Le composeur de pack est réservé aux clients.");
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
    if (isGeneralAdmin()) return toast("Le panier client n’est pas disponible pour l’administrateur général.");
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
    if (isGeneralAdmin()) return toast("La recommandation de commandes est une fonction client.");
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

  async function openAccountModal() {
    if (!currentUser) { renderAuthForm("login"); return; }

    // Afficher immédiatement une fenêtre : l'espace compte ne doit pas sembler inactif
    // pendant le chargement des données du profil commercial ou client.
    showModal('<div class="modal-head"><div><div class="eyebrow">ESPACE COMPTE</div><h2>Mon compte</h2></div><button class="close" onclick="closeModal()" aria-label="Fermer">✕</button></div><div class="loading-panel"><p>Chargement de ton espace compte…</p></div>');
    try {
      await showAccountHome();
    } catch (error) {
      console.error("Impossible d’ouvrir l’espace compte.", error);
      showModal('<div class="modal-head"><div><div class="eyebrow">ESPACE COMPTE</div><h2>Mon compte</h2></div><button class="close" onclick="closeModal()" aria-label="Fermer">✕</button></div><div class="inline-message">Le compte n’a pas pu être chargé. Réessaie.</div><div class="form-actions"><button class="btn primary" type="button" id="retryOpenAccount">Réessayer</button><button class="btn ghost" type="button" onclick="closeModal()">Fermer</button></div>');
      const retryButton = $("retryOpenAccount");
      if (retryButton) retryButton.onclick = openAccountModal;
      toast("Impossible de charger Mon compte. Réessaie.", true);
    }
  }
  function passwordVisibilityToggleHtml(inputId) {
    return '<button type="button" class="password-visibility-toggle" data-password-toggle="' + inputId + '" aria-controls="' + inputId + '" aria-label="Afficher le mot de passe" aria-pressed="false">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
      '</button>';
  }

  function bindPasswordVisibilityToggles(scope = document) {
    const eye = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const eyeOff = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"></path><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>';
    scope.querySelectorAll("[data-password-toggle]").forEach(button => {
      if (button.dataset.passwordToggleBound === "true") return;
      button.dataset.passwordToggleBound = "true";
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        const visible = input.type === "password";
        input.type = visible ? "text" : "password";
        button.setAttribute("aria-pressed", visible ? "true" : "false");
        button.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
        button.innerHTML = visible ? eyeOff : eye;
      });
    });
  }

  function renderAuthForm(mode = "login", message = "") {
    const signup = mode === "signup";
    showModal(`<div class="modal-head"><div><div class="eyebrow">ESPACE CLIENT</div><h2>${signup ? "Créer un compte" : "Se connecter"}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p class="muted">Crée ton compte pour commander directement sur Sama-Pack, retrouver tes commandes et recevoir des notifications.</p>${message ? `<div class="inline-message">${esc(message)}</div>` : ""}<form id="authForm" class="checkout-grid">
      <label class="full ${signup ? "" : "hidden"}">Nom complet<input class="input" name="full_name" placeholder="Nom complet" autocomplete="name" ${signup ? "required minlength=2 maxlength=120" : ""}></label>
      <label class="full">Adresse e-mail<input class="input" name="email" type="email" required maxlength="254" placeholder="Adresse e-mail" autocomplete="email"></label>
      <label class="${signup ? "" : "hidden"}">WhatsApp (obligatoire)<input class="input" id="signupPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+221 77 123 45 67" ${signup ? "required maxlength=25" : "disabled"}></label>
      <div class="${signup ? "" : "hidden"} auth-whatsapp-test"><button class="btn ghost small" id="testSignupWhatsappBtn" type="button">Tester dans WhatsApp</button><p class="small-note">Le test ouvre WhatsApp ; il ne confirme pas automatiquement l’existence du compte.</p></div>
      <label class="${signup ? "" : "hidden"}">Téléphone supplémentaire (facultatif)<input class="input" name="phone_secondary" type="tel" inputmode="tel" autocomplete="tel" placeholder="+221 …" ${signup ? "maxlength=25" : "disabled"}></label>
      <label class="${signup ? "" : "hidden"}">Région<input class="input" name="delivery_region" maxlength="100" placeholder="Ex. Dakar" ${signup ? "required" : "disabled"}></label>
      <label class="${signup ? "" : "hidden"}">Ville<input class="input" name="delivery_city" maxlength="100" placeholder="Ex. Dakar" ${signup ? "required" : "disabled"}></label>
      <label class="${signup ? "" : "hidden"}">Commune<input class="input" name="delivery_commune" maxlength="100" placeholder="Ex. Parcelles Assainies" ${signup ? "required" : "disabled"}></label>
      <label class="${signup ? "" : "hidden"}">Quartier<input class="input" name="delivery_neighborhood" maxlength="120" placeholder="Ex. Unité 15" ${signup ? "required" : "disabled"}></label>
      <label class="full ${signup ? "" : "hidden"}">Adresse précise<input class="input" name="delivery_address" maxlength="300" placeholder="Rue, numéro, bâtiment…" ${signup ? "required" : "disabled"}></label>
      <label class="full ${signup ? "" : "hidden"}">Repère pour le livreur (facultatif)<input class="input" name="delivery_landmark" maxlength="200" placeholder="Ex. près de la pharmacie…"></label>
      <label class="full ${signup ? "" : "hidden"}">Instructions de livraison (facultatif)<textarea class="input" name="delivery_instructions" maxlength="500" rows="2" placeholder="Précisions utiles au livreur"></textarea></label>
      <label class="full marketing-consent ${signup ? "" : "hidden"}"><span><input type="checkbox" name="marketing_opt_in" value="true" ${signup ? "" : "disabled"}> J’accepte de recevoir par e-mail les ventes flash, promotions et nouveautés de SAMA-PACK.</span><small>Tu pourras retirer ton accord à tout moment depuis ton compte ou le lien de désabonnement.</small></label>
      <label class="full password-field">Mot de passe<span class="password-input-wrap"><input class="input" id="authPassword" name="password" type="password" required minlength="8" placeholder="Mot de passe (8 caractères minimum)" autocomplete="${signup ? "new-password" : "current-password"}">${passwordVisibilityToggleHtml("authPassword")}</span></label>
      <label class="full password-field ${signup ? "" : "hidden"}">Confirmer le mot de passe<span class="password-input-wrap"><input class="input" id="authPasswordConfirmation" name="password_confirmation" type="password" minlength="8" placeholder="Confirme ton mot de passe" autocomplete="new-password" ${signup ? "required" : "disabled"}>${passwordVisibilityToggleHtml("authPasswordConfirmation")}</span></label>
      <div class="full auth-actions"><button class="btn primary full" type="submit">${signup ? "Créer mon compte" : "Se connecter"}</button><button class="link-btn dark-link" type="button" onclick="renderAuthForm('${signup ? "login" : "signup"}')">${signup ? "J’ai déjà un compte" : "Créer un compte client"}</button>${signup ? "" : '<button class="link-btn dark-link" type="button" onclick="resetPassword()">Mot de passe oublié ?</button>'}</div>
    </form><p class="small-note">Tes commandes et coordonnées ne seront accessibles qu’à toi et aux administrateurs autorisés.</p>`);
    const form = $("authForm");
    bindPasswordVisibilityToggles(form);
    const testSignupButton = $("testSignupWhatsappBtn");
    if (testSignupButton) testSignupButton.onclick = () => testWhatsAppNumber("signupPhone");
    form.onsubmit = async (e) => {
      e.preventDefault(); if (authBusy) return; authBusy = true; setBusy(form, true, signup ? "Création du compte…" : "Connexion…");
      const fd = new FormData(form); const email = String(fd.get("email") || "").trim().toLowerCase(); const password = String(fd.get("password") || "");
      const passwordConfirmation = String(fd.get("password_confirmation") || "");
      if (signup && password !== passwordConfirmation) {
        setBusy(form, false); authBusy = false;
        return toast("Les deux mots de passe ne correspondent pas.", true);
      }
      const signupProfile = {
        full_name: String(fd.get("full_name") || "").trim(),
        phone: normalizeWhatsAppNumber(fd.get("phone")),
        phone_secondary: String(fd.get("phone_secondary") || "").trim() ? normalizeWhatsAppNumber(fd.get("phone_secondary")) : "",
        delivery_region: String(fd.get("delivery_region") || "").trim(),
        delivery_city: String(fd.get("delivery_city") || "").trim(),
        delivery_commune: String(fd.get("delivery_commune") || "").trim(),
        delivery_neighborhood: String(fd.get("delivery_neighborhood") || "").trim(),
        delivery_address: String(fd.get("delivery_address") || "").trim(),
        delivery_landmark: String(fd.get("delivery_landmark") || "").trim(),
        delivery_instructions: String(fd.get("delivery_instructions") || "").trim(),
        marketing_opt_in: ["on", "true"].includes(String(fd.get("marketing_opt_in") || ""))
      };
      if (signup) {
        if (!signupProfile.phone) { setBusy(form, false); authBusy = false; return toast("Le numéro WhatsApp doit être valide (ex. +221 77 123 45 67).", true); }
        if (String(fd.get("phone_secondary") || "").trim() && !signupProfile.phone_secondary) { setBusy(form, false); authBusy = false; return toast("Le numéro supplémentaire n’est pas valide.", true); }
        if (!signupProfile.full_name || !signupProfile.delivery_region || !signupProfile.delivery_city || !signupProfile.delivery_commune || !signupProfile.delivery_neighborhood || !signupProfile.delivery_address) { setBusy(form, false); authBusy = false; return toast("Complète ton nom et toutes les informations obligatoires de livraison.", true); }
      }
      try {
        if (signup) {
          const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: "https://sama-pack.store/", data: { ...signupProfile, account_type: "customer" } } });
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

  function customerProfileFormHtml(profile) {
    const p = profile || {};
    const fullName = String(p.full_name || currentUser?.user_metadata?.full_name || "Client SAMA-PACK").trim();
    const initials = fullName.split(/\\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "SP";
    const email = currentUser?.email || p.email || "";
    const zone = profileDeliveryZone(p);
    const address = [p.delivery_address, p.delivery_landmark ? "Repère : " + p.delivery_landmark : "", p.delivery_instructions ? "Instructions : " + p.delivery_instructions : ""].filter(Boolean).join(" · ");
    const isComplete = Boolean(p.full_name && p.phone && p.delivery_region && p.delivery_city && p.delivery_commune && p.delivery_neighborhood && p.delivery_address);
    const summaryItem = (label, value, full = false) => '<div class="profile-summary-item' + (full ? ' is-full' : '') + '"><span>' + label + '</span><strong>' + esc(value || "À renseigner") + '</strong></div>';
    const field = (label, name, value, placeholder, required = false, full = false) =>
      '<label class="' + (full ? 'full' : '') + '">' + label + '<input class="input" name="' + name + '" value="' + esc(value || '') + '" maxlength="300" placeholder="' + placeholder + '"' + (required ? ' required' : '') + '></label>';
    return '<section class="panel account-profile-panel">' +
      '<div class="profile-card-header"><button type="button" class="profile-avatar" id="toggleProfileDetails" aria-label="Afficher mes informations" aria-expanded="false" aria-controls="profileDetails">' + (p.avatar_url ? '<img class="profile-avatar-image" src="' + esc(p.avatar_url) + '" alt="Photo de profil">' : esc(initials)) + '</button><div class="profile-card-heading"><div class="eyebrow">ESPACE CLIENT</div><h3>Mon profil</h3><p class="small-note">Appuie sur le rond pour consulter tes informations personnelles.</p></div></div>' +
      '<div id="profileDetails" class="profile-details hidden">' +
      '<div class="profile-details-heading"><div><h3>' + esc(fullName) + '</h3><p class="small-note">' + esc(email) + '</p><span class="profile-completion ' + (isComplete ? 'is-complete' : 'is-incomplete') + '">' + (isComplete ? 'Profil renseigné' : 'Profil à compléter') + '</span></div></div>' +
      '<section class="profile-photo-settings" aria-labelledby="profilePhotoTitle">' +
      '<div class="profile-photo-preview-wrap">' + (p.avatar_url ? '<img id="profilePhotoPreview" class="profile-photo-preview" src="' + esc(p.avatar_url) + '" alt="Aperçu de la photo de profil">' : '<div id="profilePhotoPlaceholder" class="profile-photo-placeholder">' + esc(initials) + '</div><img id="profilePhotoPreview" class="profile-photo-preview hidden" alt="Aperçu de la nouvelle photo">') + '</div>' +
      '<div class="profile-photo-content"><div><h4 id="profilePhotoTitle">Photo de profil <span class="profile-photo-optional">Facultative</span></h4><p class="small-note">Recommandée pour personnaliser ton compte.</p></div>' +
      '<label class="profile-photo-input-label">Choisir une photo<input class="input" id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
      '<p class="small-note profile-photo-help">JPG, PNG ou WebP · 2 Mo maximum. Ta photo reste privée.</p>' +
      '<div class="profile-photo-actions"><button type="button" class="btn primary small" id="saveProfilePhotoBtn" disabled>Enregistrer la photo</button>' + (p.avatar_path ? '<button type="button" class="btn ghost small" id="removeProfilePhotoBtn">Retirer la photo</button>' : '') + '</div></div></section>' +
      '<div class="profile-summary-heading"><div><h4>Mes informations</h4><p class="small-note">Tes coordonnées sont conservées pour accélérer tes prochaines commandes.</p></div><button class="btn primary small" id="editProfileBtn" type="button">Modifier le profil</button></div>' +
      '<div class="profile-summary-grid" id="profileSummary">' +
      summaryItem('Nom complet', fullName) +
      summaryItem('Adresse e-mail', email) +
      summaryItem('WhatsApp principal', p.phone) +
      summaryItem('Téléphone supplémentaire', p.phone_secondary || 'Non renseigné') +
      summaryItem('Zone de livraison', zone, true) +
      summaryItem('Adresse de livraison', address, true) +
      summaryItem('E-mails promotionnels', p.marketing_opt_in ? 'Acceptés' : 'Non activés') +
      '</div>' +
      '<form id="profileForm" class="checkout-grid profile-edit-form hidden">' +
      '<div class="profile-edit-heading full"><div><h4>Modifier mes coordonnées</h4><p class="small-note">L’adresse e-mail est protégée et ne peut pas être modifiée ici.</p></div></div>' +
      '<label class="full">Adresse e-mail (non modifiable)<input class="input" type="email" value="' + esc(email) + '" disabled readonly></label>' +
      field('Nom complet', 'full_name', p.full_name, 'Nom et prénom', true, true) +
      '<label>WhatsApp obligatoire<input class="input" id="profilePhone" name="phone" type="tel" inputmode="tel" value="' + esc(p.phone || '') + '" placeholder="+221 77 123 45 67" required maxlength="25"></label>' +
      '<div class="profile-whatsapp-test"><button class="btn ghost small" id="testProfileWhatsappBtn" type="button">Tester dans WhatsApp</button><p class="small-note">Ce test ouvre WhatsApp, sans vérification automatique par Meta.</p></div>' +
      '<label>Téléphone supplémentaire (facultatif)<input class="input" name="phone_secondary" type="tel" inputmode="tel" value="' + esc(p.phone_secondary || '') + '" placeholder="+221 …" maxlength="25"></label>' +
      field('Région', 'delivery_region', p.delivery_region, 'Ex. Dakar', true) +
      field('Ville', 'delivery_city', p.delivery_city, 'Ex. Dakar', true) +
      field('Commune', 'delivery_commune', p.delivery_commune, 'Ex. Parcelles Assainies', true) +
      field('Quartier', 'delivery_neighborhood', p.delivery_neighborhood, 'Ex. Unité 15', true) +
      field('Adresse précise', 'delivery_address', p.delivery_address, 'Rue, numéro, bâtiment…', true, true) +
      '<label class="full">Repère pour le livreur (facultatif)<input class="input" name="delivery_landmark" value="' + esc(p.delivery_landmark || '') + '" maxlength="200" placeholder="Ex. près de la pharmacie…"></label>' +
      '<label class="full">Instructions de livraison (facultatif)<textarea class="input" name="delivery_instructions" maxlength="500" rows="2" placeholder="Précisions utiles au livreur">' + esc(p.delivery_instructions || '') + '</textarea></label>' +
      '<label class="full marketing-consent"><span><input type="checkbox" name="marketing_opt_in" ' + (p.marketing_opt_in ? 'checked' : '') + '> Recevoir les promotions, ventes flash et nouveautés par e-mail.</span><small>Ce choix est facultatif et modifiable à tout moment.</small></label>' +
      '<div class="profile-edit-actions full"><button class="btn primary" type="submit">Enregistrer les modifications</button><button class="btn ghost" id="cancelProfileEditBtn" type="button">Annuler</button></div></form>' +
      '</div></section>';
  }

  async function saveCustomerProfile(form) {
    if (!currentUser || !form) return;
    const fd = new FormData(form);
    const name = String(fd.get('full_name') || '').trim();
    const phone = normalizeWhatsAppNumber(fd.get('phone'));
    const secondaryRaw = String(fd.get('phone_secondary') || '').trim();
    const phoneSecondary = secondaryRaw ? normalizeWhatsAppNumber(secondaryRaw) : '';
    const delivery = {
      delivery_region: String(fd.get('delivery_region') || '').trim(),
      delivery_city: String(fd.get('delivery_city') || '').trim(),
      delivery_commune: String(fd.get('delivery_commune') || '').trim(),
      delivery_neighborhood: String(fd.get('delivery_neighborhood') || '').trim(),
      delivery_address: String(fd.get('delivery_address') || '').trim(),
      delivery_landmark: String(fd.get('delivery_landmark') || '').trim(),
      delivery_instructions: String(fd.get('delivery_instructions') || '').trim()
    };
    if (name.length < 2 || !phone) return toast('Vérifie ton nom et ton numéro WhatsApp.', true);
    if (secondaryRaw && !phoneSecondary) return toast('Le numéro supplémentaire n’est pas valide.', true);
    if (!delivery.delivery_region || !delivery.delivery_city || !delivery.delivery_commune || !delivery.delivery_neighborhood || !delivery.delivery_address) return toast('Complète toutes les informations obligatoires de livraison.', true);
    const profilePayload = { full_name: name, phone, phone_secondary: phoneSecondary || '', marketing_opt_in: fd.get('marketing_opt_in') === 'on', ...delivery, updated_at: new Date().toISOString() };
    setBusy(form, true, 'Enregistrement…');
    try {
      const { error: authError } = await client.auth.updateUser({ data: { full_name: name, phone } });
      if (authError) throw authError;
      const { data, error } = await client.from('profiles').update(profilePayload).eq('id', currentUser.id)
        .select('id,full_name,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,delivery_landmark,delivery_instructions,email,role,is_super_admin,invited_by,created_at,avatar_path,marketing_opt_in').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Aucune modification du profil n’a été enregistrée.');
      currentProfile = data;
      toast('Tes coordonnées de livraison ont été mises à jour.');
      await showAccountHome();
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      if (form.isConnected) setBusy(form, false);
    }
  }

  async function uploadCustomerProfilePhoto(fileInput) {
    if (!currentUser || !fileInput) return;
    const file = fileInput.files?.[0];
    if (!file) return toast("Choisis d’abord une photo.", true);
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) return toast("Format non pris en charge. Utilise une image JPG, PNG ou WebP.", true);
    if (file.size > 2 * 1024 * 1024) return toast("La photo doit faire 2 Mo maximum.", true);

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const oldPath = currentProfile?.avatar_path || "";
    const path = currentUser.id + "/profile-" + Date.now() + "." + ext;
    const button = $("saveProfilePhotoBtn");
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = "Envoi…"; }

    try {
      const bucket = client.storage.from("sama-pack-avatars");
      const { error: uploadError } = await bucket.upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { data, error: profileError } = await client.from("profiles")
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq("id", currentUser.id)
        .select("id,avatar_path")
        .maybeSingle();
      if (profileError || !data) {
        await bucket.remove([path]);
        if (profileError) throw profileError;
        throw new Error("La photo a été envoyée mais le profil n’a pas été mis à jour.");
      }

      currentProfile = { ...(currentProfile || {}), avatar_path: path };
      await refreshAccountButtonAvatar();
      if (oldPath && oldPath !== path) {
        const { error: cleanupError } = await bucket.remove([oldPath]);
        if (cleanupError) console.warn("Ancienne photo non supprimée", cleanupError);
      }
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
      profilePhotoPreviewUrl = null;
      toast("Photo de profil enregistrée.");
      await showAccountHome();
      $("toggleProfileDetails")?.click();
    } catch (error) {
      toast(errorMessage(error), true);
      if (button) { button.disabled = false; button.textContent = button.dataset.oldText || "Enregistrer la photo"; }
    }
  }

  async function removeCustomerProfilePhoto() {
    if (!currentUser || !currentProfile?.avatar_path) return;
    const oldPath = currentProfile.avatar_path;
    const button = $("removeProfilePhotoBtn");
    if (button) { button.disabled = true; button.textContent = "Retrait…"; }
    try {
      const { data, error } = await client.from("profiles")
        .update({ avatar_path: null, updated_at: new Date().toISOString() })
        .eq("id", currentUser.id)
        .select("id,avatar_path")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("La photo n’a pas pu être retirée du profil.");
      currentProfile = { ...(currentProfile || {}), avatar_path: null };
      await refreshAccountButtonAvatar();
      const { error: removeError } = await client.storage.from("sama-pack-avatars").remove([oldPath]);
      if (removeError) console.warn("La photo retirée du profil n’a pas pu être supprimée du stockage", removeError);
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
      profilePhotoPreviewUrl = null;
      toast("Photo de profil retirée.");
      await showAccountHome();
      $("toggleProfileDetails")?.click();
    } catch (error) {
      toast(errorMessage(error), true);
      if (button) { button.disabled = false; button.textContent = "Retirer la photo"; }
    }
  }

  async function saveGeneralAdminProfile(form) {
    if (!currentUser || !client || !form) return;
    const fd = new FormData(form);
    const name = String(fd.get("full_name") || "").trim();
    const phoneRaw = String(fd.get("phone") || "").trim();
    const phone = normalizeWhatsAppNumber(phoneRaw);
    const secondaryRaw = String(fd.get("phone_secondary") || "").trim();
    const phoneSecondary = secondaryRaw ? normalizeWhatsAppNumber(secondaryRaw) : "";
    if (name.length < 2) return toast("Saisis ton nom complet (au moins 2 caractères).", true);
    if (!phone) return toast("Saisis un numéro WhatsApp valide.", true);
    if (secondaryRaw && !phoneSecondary) return toast("Le téléphone supplémentaire n’est pas valide.", true);

    setBusy(form, true, "Enregistrement…");
    try {
      const { error: authError } = await client.auth.updateUser({ data: { full_name: name, phone } });
      if (authError) throw authError;
      const { data, error } = await client.from("profiles")
        .update({ full_name: name, phone, phone_secondary: phoneSecondary, updated_at: new Date().toISOString() })
        .eq("id", currentUser.id)
        .select("id,full_name,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,delivery_landmark,delivery_instructions,email,role,is_super_admin,invited_by,created_at,avatar_path")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Aucune modification du profil n’a été enregistrée.");
      currentProfile = data;
      await refreshAccountButtonAvatar();
      toast("Les informations de ton profil ont été mises à jour.");
      await showAccountHome();
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      if (form.isConnected) setBusy(form, false);
    }
  }

  async function showGeneralAdminHome() {
    const profile = currentProfile || {};
    const displayName = String(profile.full_name || currentUser?.email || "Administrateur général");
    const initialsParts = displayName.trim().split(/[\s._-]+/).filter(Boolean);
    const initials = (initialsParts.length > 1
      ? initialsParts[0].charAt(0) + initialsParts[initialsParts.length - 1].charAt(0)
      : (initialsParts[0] || "AG").slice(0, 2)).toUpperCase();
    const email = String(currentUser?.email || profile.email || "");
    let avatarUrl = "";
    if (profile.avatar_path && client) {
      const { data, error } = await client.storage.from("sama-pack-avatars").createSignedUrl(profile.avatar_path, 60 * 60);
      if (error) console.warn("Photo du profil administrateur indisponible", error);
      else avatarUrl = data?.signedUrl || "";
      accountButtonAvatarPath = profile.avatar_path;
      accountButtonAvatarUrl = avatarUrl;
      updateAccountButtons();
    }
    const avatarMarkup = avatarUrl
      ? '<img src="' + esc(avatarUrl) + '" alt="Photo de profil">'
      : esc(initials);
    const profilePhotoMarkup = avatarUrl
      ? '<img id="profilePhotoPreview" class="profile-photo-preview" src="' + esc(avatarUrl) + '" alt="Aperçu de la photo de profil">'
      : '<div id="profilePhotoPlaceholder" class="profile-photo-placeholder">' + esc(initials) + '</div><img id="profilePhotoPreview" class="profile-photo-preview hidden" alt="Aperçu de la nouvelle photo">';
    showModal(
      '<div class="modal-head general-admin-modal-head"><div><div class="eyebrow">ESPACE DE PILOTAGE</div><h2>Compte administrateur général</h2><p class="small-note">Gère tes coordonnées et la sécurité de ton compte SAMA-PACK.</p></div><button class="close" onclick="closeModal()" aria-label="Fermer">✕</button></div>' +
      '<section class="general-admin-identity"><div class="general-admin-avatar" aria-hidden="true">' + avatarMarkup + '</div><div><span class="general-admin-role">ADMINISTRATEUR GÉNÉRAL</span><h3>' + esc(displayName) + '</h3><p>' + esc(email) + '</p><span class="general-admin-status">Accès de gestion actif</span></div></section>' +
      '<section class="general-admin-control"><div><span class="general-admin-kicker">GESTION DE LA BOUTIQUE</span><h3>Administration SAMA-PACK</h3><p>Accède aux commandes, clients, produits, stocks, fournisseurs, devis, comptes administrateurs et paramètres depuis le panneau de gestion.</p></div><button class="btn primary full" type="button" onclick="closeModal();openAdmin()">Ouvrir le panneau de gestion</button></section>' +
      '<section class="general-admin-control general-admin-profile-control"><div><span class="general-admin-kicker">INFORMATIONS PERSONNELLES</span><h3>Mon profil</h3><p>Modifie ton nom et tes numéros de contact. L’adresse e-mail de connexion ne peut pas être changée depuis cet écran.</p></div>' +
        '<section class="profile-photo-settings general-admin-profile-photo" aria-labelledby="profilePhotoTitle">' +
          '<div class="profile-photo-preview-wrap">' + profilePhotoMarkup + '</div>' +
          '<div class="profile-photo-content"><div><h4 id="profilePhotoTitle">Photo de profil <span class="profile-photo-optional">Facultative</span></h4><p class="small-note">JPG, PNG ou WebP · 2 Mo maximum. Ta photo reste privée.</p></div>' +
          '<label class="profile-photo-input-label">Choisir une photo<input class="input" id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
          '<div class="profile-photo-actions"><button type="button" class="btn primary small" id="saveProfilePhotoBtn" disabled>Enregistrer la photo</button>' + (profile.avatar_path ? '<button type="button" class="btn ghost small" id="removeProfilePhotoBtn">Retirer la photo</button>' : '') + '</div></div></section>' +
        '<form id="generalAdminProfileForm" class="checkout-grid general-admin-profile-form">' +
          '<label class="full">Adresse e-mail de connexion<input class="input" type="email" value="' + esc(email) + '" disabled readonly></label>' +
          '<label class="full">Nom complet<input class="input" name="full_name" value="' + esc(profile.full_name || "") + '" maxlength="150" required autocomplete="name" placeholder="Prénom et nom"></label>' +
          '<label>WhatsApp principal<input class="input" name="phone" type="tel" inputmode="tel" value="' + esc(profile.phone || "") + '" required maxlength="25" autocomplete="tel" placeholder="+221 77 123 45 67"></label>' +
          '<label>Téléphone supplémentaire (facultatif)<input class="input" name="phone_secondary" type="tel" inputmode="tel" value="' + esc(profile.phone_secondary || "") + '" maxlength="25" placeholder="+221 …"></label>' +
          '<button class="btn primary full" type="submit">Enregistrer les informations</button></form></section>' +
      '<section class="general-admin-control general-admin-security"><div><span class="general-admin-kicker">SÉCURITÉ</span><h3>Mot de passe</h3><p>Modifie le mot de passe de ce compte administrateur.</p></div><form id="generalAdminPasswordForm" class="checkout-grid">' +
        '<label class="full password-field">Nouveau mot de passe<span class="password-input-wrap"><input class="input" id="generalAdminNewPassword" name="password" type="password" minlength="8" required placeholder="8 caractères minimum" autocomplete="new-password">' + passwordVisibilityToggleHtml("generalAdminNewPassword") + '</span></label>' +
        '<label class="full password-field">Confirmer le mot de passe<span class="password-input-wrap"><input class="input" id="generalAdminConfirmPassword" name="password_confirmation" type="password" minlength="8" required placeholder="Confirme le nouveau mot de passe" autocomplete="new-password">' + passwordVisibilityToggleHtml("generalAdminConfirmPassword") + '</span></label>' +
        '<button class="btn secondary full" type="submit">Mettre à jour le mot de passe</button></form></section>' +
      '<button class="btn ghost full account-signout" type="button" onclick="signOut()">Se déconnecter</button>'
    );

    const accountModalCard = document.querySelector(".modal-card");
    if (accountModalCard) accountModalCard.classList.add("general-admin-account-modal");

    const profileForm = $("generalAdminProfileForm");
    if (profileForm) profileForm.onsubmit = async event => {
      event.preventDefault();
      await saveGeneralAdminProfile(profileForm);
    };

    const profilePhotoInput = $("profilePhotoInput");
    const saveProfilePhotoBtn = $("saveProfilePhotoBtn");
    if (profilePhotoInput && saveProfilePhotoBtn) {
      profilePhotoInput.onchange = () => {
        const file = profilePhotoInput.files?.[0];
        saveProfilePhotoBtn.disabled = !file;
        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          profilePhotoInput.value = "";
          saveProfilePhotoBtn.disabled = true;
          return toast("Format non pris en charge. Utilise une image JPG, PNG ou WebP.", true);
        }
        if (file && file.size > 2 * 1024 * 1024) {
          profilePhotoInput.value = "";
          saveProfilePhotoBtn.disabled = true;
          return toast("La photo doit faire 2 Mo maximum.", true);
        }
        const preview = $("profilePhotoPreview");
        const placeholder = $("profilePhotoPlaceholder");
        if (file && preview) {
          if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
          profilePhotoPreviewUrl = URL.createObjectURL(file);
          preview.src = profilePhotoPreviewUrl;
          preview.classList.remove("hidden");
          if (placeholder) placeholder.classList.add("hidden");
        } else if (preview) {
          preview.classList.toggle("hidden", !currentProfile?.avatar_path);
          if (placeholder) placeholder.classList.toggle("hidden", Boolean(currentProfile?.avatar_path));
        }
      };
      saveProfilePhotoBtn.onclick = () => uploadCustomerProfilePhoto(profilePhotoInput);
    }
    const removeProfilePhotoBtn = $("removeProfilePhotoBtn");
    if (removeProfilePhotoBtn) removeProfilePhotoBtn.onclick = removeCustomerProfilePhoto;

    const form = $("generalAdminPasswordForm");
    if (form) {
      bindPasswordVisibilityToggles(form);
      form.onsubmit = async event => {
        event.preventDefault();
        const fd = new FormData(form);
        const password = String(fd.get("password") || "");
        const confirmation = String(fd.get("password_confirmation") || "");
        if (password.length < 8) return toast("Choisis au moins 8 caractères.", true);
        if (password !== confirmation) return toast("Les deux mots de passe ne correspondent pas.", true);
        setBusy(form, true, "Mise à jour…");
        const { error } = await client.auth.updateUser({ password });
        if (error) toast(errorMessage(error), true);
        else { toast("Mot de passe administrateur mis à jour."); form.reset(); }
        setBusy(form, false);
      };
    }
  }
  async function showAccountHome() {
    if (!currentUser) { renderAuthForm("login"); return; }
    if (isGeneralAdmin()) { await showGeneralAdminHome(); return; }
    const p = currentProfile || await getProfile();
    let profileAvatarUrl = "";
    if (p?.avatar_path) {
      const { data: avatarData, error: avatarError } = await client.storage.from("sama-pack-avatars").createSignedUrl(p.avatar_path, 60 * 60);
      if (avatarError) console.warn("Photo de profil indisponible", avatarError);
      else profileAvatarUrl = avatarData?.signedUrl || "";
    }
    const profileForDisplay = { ...(p || {}), avatar_url: profileAvatarUrl };
    const businessResult = await client.from("business_accounts").select("*").eq("owner_user_id", currentUser.id).maybeSingle();
    currentBusinessAccount = businessResult.error ? null : (businessResult.data || null);
    const { data: activeSalesCode } = await client.from("sales_referral_codes").select("code,label").eq("owner_user_id", currentUser.id).eq("active", true).maybeSingle();
    const salesLinkHtml = activeSalesCode?.code ? '<div class="panel account-referral-launch"><div><strong>Ton code commercial : </strong><code>' + esc(activeSalesCode.code) + '</code><p class="small-note">Partage ton lien pour rattacher les commandes et devis que tu apportes à ton activité.</p></div><button class="btn secondary" onclick="copySalesLink(\'' + esc(activeSalesCode.code) + '\')">Copier mon lien</button></div>' : "";
    // Le rafraîchissement des rappels tourne en arrière-plan : une erreur ou un délai
    // sur cette fonction ne doit pas empêcher l'affichage de Mon compte.
    client.rpc("sama_notify_due_replenishment_reminders")
      .then(({ error }) => { if (error) console.warn("Due replenishment reminder check failed", error); })
      .catch(error => console.warn("Due replenishment reminder check failed", error));
    await loadNotifications();
    const { data: rows, error } = await client.from("orders").select("id,created_at,status,total,subtotal,delivery,customer_name,customer_phone,delivery_address,delivery_zone,slot,payment_choice,payment_status,amount_paid").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(15);
    const orders = error ? [] : (rows || []);
    const subscriptionResult = await client.from("replenishment_subscriptions").select("*").eq("user_id", currentUser.id).order("next_reminder_at", { ascending: true });
    cachedSubscriptions = subscriptionResult.error ? [] : (subscriptionResult.data || []);
    if (subscriptionResult.error) console.warn("Replenishment subscriptions unavailable", subscriptionResult.error);
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
    const accountNotificationsHtml = userNotifications.length ? userNotifications.map(n => '<article class="notification-item ' + (n.read_at ? 'read' : 'unread') + '"><div class="notification-title">' + esc(n.title) + '</div><div class="notification-message">' + esc(n.message) + '</div><div class="notification-meta">' + esc(fmtDate(n.created_at)) + (n.read_at ? ' · Lue' : ' · <button class="link-btn dark-link" onclick="markNotificationRead(\'' + esc(n.id) + '\')">Marquer comme lue</button>') + '</div></article>').join("") : '<div class="empty compact-empty">Aucune notification pour le moment.</div>';
    showModal(
      '<div class="modal-head account-modal-header"><div><div class="eyebrow">ESPACE CLIENT</div><h2>Mon compte</h2><p class="small-note">Retrouve tes commandes et paramètres ici.</p></div><div class="account-header-actions"><button type="button" class="account-menu-toggle" id="accountMenuToggle" aria-expanded="false" aria-controls="accountTabsMenu" aria-label="Ouvrir le menu du compte"><span></span><span></span><span></span></button><button class="close" onclick="closeModal()" aria-label="Fermer">✕</button></div></div>' +
      '<div class="account-workspace">' +
        '<nav id="accountTabsMenu" class="account-tabs" role="tablist" aria-label="Rubriques du compte">' +
          '<button type="button" class="account-tab is-active" role="tab" aria-selected="true" data-account-tab="profile"><span class="account-tab-icon">◉</span><span>Mon profil</span></button>' +
          '<button type="button" class="account-tab" role="tab" aria-selected="false" data-account-tab="orders"><span class="account-tab-icon">▤</span><span>Commandes</span><span class="account-tab-count">' + orders.length + '</span></button>' +
          '<button type="button" class="account-tab" role="tab" aria-selected="false" data-account-tab="replenishments"><span class="account-tab-icon">↻</span><span>Rappels</span></button>' +
          '<button type="button" class="account-tab" role="tab" aria-selected="false" data-account-tab="notifications"><span class="account-tab-icon">♧</span><span>Alertes</span><span class="account-tab-count">' + userNotifications.filter(n=>!n.read_at).length + '</span></button>' +
          '<button type="button" class="account-tab" role="tab" aria-selected="false" data-account-tab="security"><span class="account-tab-icon">⌑</span><span>Sécurité</span></button>' +
        '</nav>' +
        '<section class="account-tab-panel" id="accountTab-profile" role="tabpanel">' +
          salesLinkHtml + customerProfileFormHtml(profileForDisplay) +
          '<div class="panel account-business-launch"><div><h3>Vous êtes un professionnel ?</h3><p class="small-note">Enregistrez votre entreprise, demandez des devis détaillés et retrouvez ses commandes en quantité.</p></div><button class="btn secondary" onclick="openB2BWorkspace()">Espace professionnel</button></div>' +
        '</section>' +
        '<section class="account-tab-panel hidden" id="accountTab-orders" role="tabpanel">' +
          '<div class="account-section-heading"><div><div class="eyebrow">ACTIVITÉ</div><h3>Mes commandes</h3><p class="small-note">Consulte le suivi, le paiement, le solde et le créneau de livraison.</p></div><span class="account-section-badge">' + orders.length + ' commande(s)</span></div>' +
          '<div class="panel account-orders">' + orderHtml + '</div>' +
        '</section>' +
        '<section class="account-tab-panel hidden" id="accountTab-replenishments" role="tabpanel">' +
          '<div class="account-section-heading"><div><div class="eyebrow">PLANIFICATION</div><h3>Mes réapprovisionnements</h3><p class="small-note">Programme des rappels sans déclencher automatiquement de commande ni de paiement.</p></div><button class="btn primary small" onclick="openSubscriptionEditor()">+ Nouveau rappel</button></div>' +
          '<div class="panel account-subscriptions">' + subscriptionsHtml + '</div>' +
        '</section>' +
        '<section class="account-tab-panel hidden" id="accountTab-notifications" role="tabpanel">' +
          '<div class="account-section-heading"><div><div class="eyebrow">CENTRE D’ALERTES</div><h3>Mes notifications</h3><p class="small-note">Retrouve les informations importantes liées à ton compte et à tes commandes.</p></div><button class="btn secondary small" onclick="enableBrowserNotifications()">Activer les alertes</button></div>' +
          '<div class="notification-list account-notification-list" id="accountNotificationList">' + accountNotificationsHtml + '</div>' +
        '</section>' +
        '<section class="account-tab-panel hidden" id="accountTab-security" role="tabpanel">' +
          '<div class="account-section-heading"><div><div class="eyebrow">PROTECTION</div><h3>Sécurité du compte</h3><p class="small-note">Gère ton mot de passe et ferme ta session lorsque tu as terminé.</p></div></div>' +
          '<div class="panel account-password"><h3>' + (currentUser?.last_sign_in_at ? "Changer mon mot de passe" : "Définir un mot de passe") + '</h3><form id="changePasswordForm" class="checkout-grid">' +
            '<label class="full password-field">Nouveau mot de passe<span class="password-input-wrap"><input class="input" id="newAccountPassword" name="password" type="password" minlength="8" required placeholder="Nouveau mot de passe (8 caractères minimum)" autocomplete="new-password">' + passwordVisibilityToggleHtml("newAccountPassword") + '</span></label>' +
            '<label class="full password-field">Confirmer le mot de passe<span class="password-input-wrap"><input class="input" id="confirmAccountPassword" name="password_confirmation" type="password" minlength="8" required placeholder="Confirme le nouveau mot de passe" autocomplete="new-password">' + passwordVisibilityToggleHtml("confirmAccountPassword") + '</span></label>' +
            '<button class="btn primary full" type="submit">Enregistrer le mot de passe</button></form></div>' +
          '<button class="btn ghost full account-signout" onclick="signOut()">Se déconnecter</button>' +
        '</section>' +
      '</div>'
    );
    const accountModalCard = document.querySelector(".modal-card");
    if (accountModalCard) accountModalCard.classList.add("account-modal-card");
    const accountTabButtons = [...document.querySelectorAll("[data-account-tab]")];
    const accountMenuToggle = $("accountMenuToggle");
    const accountTabsMenu = $("accountTabsMenu");
    const setAccountMenuOpen = (open) => {
      if (!accountTabsMenu || !accountMenuToggle) return;
      const isMobile = window.matchMedia("(max-width: 600px)").matches;
      const expanded = isMobile && open;
      accountTabsMenu.classList.toggle("hidden", isMobile && !expanded);
      accountTabsMenu.classList.toggle("account-menu-open", expanded);
      accountMenuToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      accountMenuToggle.setAttribute("aria-label", expanded ? "Fermer le menu du compte" : "Ouvrir le menu du compte");
    };
    setAccountMenuOpen(false);
    if (accountMenuToggle) accountMenuToggle.onclick = () => setAccountMenuOpen(accountTabsMenu?.classList.contains("hidden"));
    window.matchMedia("(max-width: 600px)").addEventListener("change", () => setAccountMenuOpen(false));
    const activateAccountTab = (tabName) => {
      accountTabButtons.forEach(button => {
        const active = button.dataset.accountTab === tabName;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      document.querySelectorAll(".account-tab-panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== "accountTab-" + tabName));
      setAccountMenuOpen(false);
    };
    accountTabButtons.forEach(button => button.addEventListener("click", () => activateAccountTab(button.dataset.accountTab)));

    const profileDetails = $("profileDetails");
    const profileDetailsToggle = $("toggleProfileDetails");
    const setProfileDetailsVisible = (visible) => {
      if (!profileDetails || !profileDetailsToggle) return;
      profileDetails.classList.toggle("hidden", !visible);
      profileDetailsToggle.setAttribute("aria-expanded", visible ? "true" : "false");
      profileDetailsToggle.setAttribute("aria-label", visible ? "Masquer mes informations" : "Afficher mes informations");
      profileDetailsToggle.classList.toggle("is-expanded", visible);
    };
    if (profileDetailsToggle) profileDetailsToggle.onclick = () => setProfileDetailsVisible(profileDetails.classList.contains("hidden"));

    const profilePhotoInput = $("profilePhotoInput");
    const saveProfilePhotoBtn = $("saveProfilePhotoBtn");
    if (profilePhotoInput && saveProfilePhotoBtn) {
      profilePhotoInput.onchange = () => {
        const file = profilePhotoInput.files?.[0];
        saveProfilePhotoBtn.disabled = !file;
        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          profilePhotoInput.value = "";
          saveProfilePhotoBtn.disabled = true;
          return toast("Format non pris en charge. Utilise une image JPG, PNG ou WebP.", true);
        }
        if (file && file.size > 2 * 1024 * 1024) {
          profilePhotoInput.value = "";
          saveProfilePhotoBtn.disabled = true;
          return toast("La photo doit faire 2 Mo maximum.", true);
        }
        const preview = $("profilePhotoPreview");
        const placeholder = $("profilePhotoPlaceholder");
        if (file && preview) {
          if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
          profilePhotoPreviewUrl = URL.createObjectURL(file);
          preview.src = profilePhotoPreviewUrl;
          preview.classList.remove("hidden");
          if (placeholder) placeholder.classList.add("hidden");
        } else if (preview) {
          preview.classList.toggle("hidden", !currentProfile?.avatar_path);
          if (placeholder) placeholder.classList.toggle("hidden", Boolean(currentProfile?.avatar_path));
        }
      };
      saveProfilePhotoBtn.onclick = () => uploadCustomerProfilePhoto(profilePhotoInput);
    }
    const removeProfilePhotoBtn = $("removeProfilePhotoBtn");
    if (removeProfilePhotoBtn) removeProfilePhotoBtn.onclick = removeCustomerProfilePhoto;

    const profileEditBtn = $("editProfileBtn");
    const profileSummary = $("profileSummary");
    const profileForm = $("profileForm");
    const cancelProfileEditBtn = $("cancelProfileEditBtn");
    const toggleProfileEdit = (editing) => {
      if (editing) setProfileDetailsVisible(true);
      if (profileSummary) profileSummary.classList.toggle("hidden", editing);
      if (profileEditBtn) profileEditBtn.classList.toggle("hidden", editing);
      if (profileForm) profileForm.classList.toggle("hidden", !editing);
      if (editing) $("profilePhone")?.focus();
    };
    if (profileEditBtn) profileEditBtn.onclick = () => toggleProfileEdit(true);
    if (cancelProfileEditBtn) cancelProfileEditBtn.onclick = () => {
      if (profileForm) profileForm.reset();
      toggleProfileEdit(false);
    };
    const profileWhatsappTest = $("testProfileWhatsappBtn");
    if (profileWhatsappTest) profileWhatsappTest.onclick = () => testWhatsAppNumber("profilePhone");
    if (profileForm) profileForm.onsubmit = async e => { e.preventDefault(); await saveCustomerProfile(profileForm); };
    const pw = $("changePasswordForm");
    if (pw) {
      bindPasswordVisibilityToggles(pw);
      pw.onsubmit = async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const password = String(fd.get("password") || "");
        const confirmation = String(fd.get("password_confirmation") || "");
        if (password.length < 8) return toast("Choisis au moins 8 caractères.", true);
        if (password !== confirmation) return toast("Les deux mots de passe ne correspondent pas.", true);
        setBusy(form, true, "Enregistrement…");
        const { error } = await client.auth.updateUser({ password });
        if (error) toast(errorMessage(error), true);
        else { toast("Mot de passe mis à jour."); form.reset(); }
        setBusy(form, false);
      };
    }
    const bootstrap = $("bootstrapAdminForm"); if (bootstrap) bootstrap.onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; setBusy(form, true, "Configuration…"); const token = String(new FormData(form).get("bootstrap_token") || "").trim(); const { data, error } = await client.rpc("sama_bootstrap_first_admin", { p_token: token }); setBusy(form, false); if (error) return toast(errorMessage(error), true); await syncAuth(currentUser); closeModal(); toast(data?.message || "Compte administrateur configuré."); };
  }
  async function signOut() { await client.auth.signOut(); await syncAuth(null); closeModal(); toast("Tu es déconnecté."); }
  async function syncAuth(user) {
    const nextUser = user || null;
    if (!nextUser || nextUser.id !== currentUser?.id) currentBusinessAccount = null;
    currentUser = nextUser; currentProfile = currentUser ? await getProfile(currentUser) : null;
    setupAccountPresence(currentUser);
    updateAccountButtons();
    await refreshAccountButtonAvatar();
    await loadNotifications();
    setupNotificationsRealtime();
    if (isAdmin()) { updateCategoryFilter(); renderProducts(); }
    if (document.body?.dataset?.productDetail === "true") renderSEOProductPage();
  }
  function updateAccountButtons() {
    document.body.classList.toggle("general-admin-mode", isGeneralAdmin());
    const accountBtn = $("accountBtn");
    if (accountBtn) {
      if (!currentUser) {
        accountBtn.classList.remove("account-nav-user");
        accountBtn.removeAttribute("title");
        accountBtn.setAttribute("aria-label", "Se connecter à son compte");
        if (accountBtn.dataset.accountMarkup !== "Connexion") {
          accountBtn.innerHTML = "Connexion";
          accountBtn.dataset.accountMarkup = "Connexion";
        }
      } else {
        const label = currentProfile?.role === "admin" ? "Compte admin" : "Mon compte";
        const sourceName = String(currentProfile?.full_name || currentUser.email || "SAMA-PACK").trim().replace(/@.*$/, "");
        const parts = sourceName.split(/[\\s._-]+/).filter(Boolean);
        const initials = (parts.length > 1
          ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0))
          : (parts[0] || "SP").slice(0, 2)).toUpperCase();
        const avatarUrl = accountButtonAvatarPath && accountButtonAvatarPath === currentProfile?.avatar_path
          ? accountButtonAvatarUrl
          : "";
        const avatarContent = avatarUrl
          ? `<img src="${esc(avatarUrl)}" alt="" loading="eager">`
          : esc(initials || "SP");
        const markup = `<span class="account-nav-avatar" aria-hidden="true">${avatarContent}</span><span class="account-nav-label">${label}</span>`;
        accountBtn.classList.add("account-nav-user");
        accountBtn.setAttribute("aria-label", label + " : ouvrir mon espace");
        accountBtn.title = "Ouvrir " + label.toLowerCase();
        if (accountBtn.dataset.accountMarkup !== markup) {
          accountBtn.innerHTML = markup;
          accountBtn.dataset.accountMarkup = markup;
        }
      }
    }
    const courierDesktopLink = $("courierDesktopLink");
    if (courierDesktopLink) courierDesktopLink.classList.toggle("hidden", !isCourier());
    const courierMobileLink = $("courierMobileLink");
    if (courierMobileLink) courierMobileLink.classList.toggle("hidden", !isCourier());
    const adminBtn = $("adminBtn");
    if (adminBtn) { adminBtn.textContent = "Gestion"; adminBtn.classList.toggle("hidden", !isAdmin()); }
    const mobileManageBtn = $("mobileManageBtn");
    if (mobileManageBtn) mobileManageBtn.classList.toggle("hidden", !isAdmin());
    const footerAdminSection = $("footerAdminSection");
    if (footerAdminSection) footerAdminSection.classList.toggle("hidden", !isAdmin());
    const adminFlag = $("adminFlag"); if (adminFlag) adminFlag.textContent = isAdmin() ? `Connecté : ${currentProfile?.full_name || currentUser?.email || "Administrateur"}` : "Espace réservé aux administrateurs";
    const n = userNotifications.filter(x => !x.read_at).length; const badge = $("notificationCount");
    if (badge) { badge.textContent = String(n > 99 ? "99+" : n); badge.classList.toggle("hidden", n === 0); }
  }

  async function refreshAccountButtonAvatar() {
    const requestId = ++accountAvatarRequestId;
    const userId = currentUser?.id || "";
    const path = currentProfile?.avatar_path || "";
    if (!client || !userId || !path) {
      accountButtonAvatarUrl = "";
      accountButtonAvatarPath = "";
      updateAccountButtons();
      return;
    }
    if (accountButtonAvatarPath === path && accountButtonAvatarUrl) {
      updateAccountButtons();
      return;
    }
    const { data, error } = await client.storage.from("sama-pack-avatars").createSignedUrl(path, 60 * 60);
    if (requestId !== accountAvatarRequestId || userId !== currentUser?.id) return;
    accountButtonAvatarPath = path;
    accountButtonAvatarUrl = error ? "" : (data?.signedUrl || "");
    if (error) console.warn("Photo de profil de l’en-tête indisponible", error);
    updateAccountButtons();
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
    const accountList = $("accountNotificationList");
    if (accountList) {
      accountList.innerHTML = html;
      document.querySelector('[data-account-tab="notifications"]')?.click();
      return;
    }
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
    if (isGeneralAdmin()) return toast("La commande en ligne est réservée aux comptes clients.");
    if (!cart.length) return toast("Ton panier est vide.", true);
    const unavailableLines = cart.filter(line => { const p = getP(line.id); return !canSellProduct(p); });
    if (unavailableLines.length) return toast("Retire les articles en rupture ou sans prix confirmé du panier avant de commander.", true);
    if (!currentUser) { closeModal(); renderAuthForm("login", "Connecte-toi ou crée un compte pour confirmer ta commande en ligne."); return; }
    const totals = cartTotals(); const profile = currentProfile || {};
    const savedAddress = profileDeliveryAddress(profile);
    const savedZone = profileDeliveryZone(profile);
    const deliveryAllowed = Number(totals.delivery) > 0;
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Finaliser la commande</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <form id="checkoutForm" class="checkout-grid">
        <p class="small-note full">Les coordonnées de ton profil sont préremplies. Modifie-les ici seulement si cette commande doit être livrée ailleurs.</p>
        <input class="input full" name="name" required minlength="2" maxlength="120" placeholder="Nom complet" value="${esc(profile.full_name || currentUser.user_metadata?.full_name || "")}">
        <input class="input" name="phone" required minlength="8" maxlength="25" placeholder="WhatsApp" value="${esc(profile.phone || currentUser.user_metadata?.phone || "")}">
        <input class="input" name="zone" placeholder="Zone / quartier" maxlength="300" value="${esc(savedZone)}">
        <input class="input full" name="address" required minlength="4" maxlength="300" placeholder="Adresse de livraison" value="${esc(savedAddress)}">
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
      const orderPhone = normalizeWhatsAppNumber(f.get("phone"));
      if (!orderPhone) return toast("Saisis un numéro WhatsApp valide pour cette commande.", true);
      const paymentChoice = String(f.get("payment_choice") || "pay_now");
      if (paymentChoice === "pay_later" && !deliveryAllowed) return toast("Le paiement plus tard exige des frais de livraison à régler maintenant.", true);
      setBusy(form, true, "Création de la commande…");
      const payload = {
        customer: { name: String(f.get("name") || "").trim(), phone: orderPhone, address: String(f.get("address") || "").trim(), zone: String(f.get("zone") || "").trim() },
        slot: String(f.get("slot") || "").trim(),
        payment_choice: paymentChoice,
        business_account_id: currentBusinessAccount?.id || null,
        sales_referral_code: getSalesReferralCode(),
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


  function b2bProductOptions(selectedId) {
    const available = replenishmentProducts();
    if (!available.length) return '<option value="" selected disabled>Aucun article disponible</option>';
    return '<option value="" disabled ' + (selectedId ? '' : 'selected') + '>Choisir un produit ou un pack</option>' +
      available.map(function (p) {
        return '<option value="' + esc(p.id) + '" ' + (String(p.id) === String(selectedId || "") ? "selected" : "") + '>' + esc(p.name) + ' — ' + money(getEffectivePrice(p)) + '</option>';
      }).join("");
  }
  function b2bProductLineHtml(value) {
    const p = value || {};
    const quantity = p.quantity == null || p.quantity === "" ? "" : Math.max(1, Math.min(99, Number(p.quantity) || 1));
    return '<div class="b2b-product-line"><label><span>Produit / pack</span><select class="input" name="b2b_product_id" required>' + b2bProductOptions(p.product_id || "") + '</select></label><label class="b2b-product-quantity"><span>Quantité</span><input class="input" name="b2b_quantity" type="number" min="1" max="99" value="' + quantity + '" placeholder="Ex. 12" required></label><button type="button" class="btn small ghost b2b-remove-line" onclick="removeB2BLine(this)" aria-label="Retirer cette ligne" title="Retirer cet article">✕</button></div>';
  }
  function b2bEmptySelectionHtml() {
    return '<div class="b2b-empty-selection"><span class="b2b-empty-selection-icon" aria-hidden="true">＋</span><strong>Aucun article ajouté</strong><p>Choisis toi-même les produits ou packs et les quantités dont ton entreprise a besoin.</p><span class="small-note">Aucune référence n’est présélectionnée.</span></div>';
  }
  function addB2BLine() {
    const host = $("b2bProductLines");
    if (!host) return;
    if (host.querySelectorAll(".b2b-product-line").length >= 20) return toast("Maximum 20 références par demande.", true);
    host.querySelector(".b2b-empty-selection")?.remove();
    host.insertAdjacentHTML("beforeend", b2bProductLineHtml({}));
    const rows = host.querySelectorAll(".b2b-product-line");
    rows[rows.length - 1]?.querySelector('[name="b2b_product_id"]')?.focus();
  }
  function removeB2BLine(button) {
    const row = button?.closest(".b2b-product-line");
    const host = $("b2bProductLines");
    if (!row || !host) return;
    row.remove();
    if (!host.querySelector(".b2b-product-line")) host.innerHTML = b2bEmptySelectionHtml();
  }
  function readB2BLines() {
    const host = $("b2bProductLines");
    if (!host) throw new Error("Sélection d’articles indisponible.");
    const lines = [];
    for (const row of host.querySelectorAll(".b2b-product-line")) {
      const id = String(row.querySelector('[name="b2b_product_id"]')?.value || "");
      const rawQuantity = String(row.querySelector('[name="b2b_quantity"]')?.value || "").trim();
      if (!id && !rawQuantity) continue;
      if (!id) throw new Error("Choisis un produit ou un pack pour chaque ligne renseignée.");
      const quantity = Number(rawQuantity);
      const product = getP(id);
      if (!product || !canSellProduct(product)) throw new Error("Un article choisi n’est plus disponible. Actualise la liste.");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Chaque quantité doit être comprise entre 1 et 99.");
      const duplicate = lines.find(item => item.product_id === product.id);
      if (duplicate) duplicate.quantity = Math.min(99, duplicate.quantity + quantity);
      else lines.push({ product_id: product.id, product_name: product.name, quantity, unit_price: getEffectivePrice(product) });
    }
    if (!lines.length) throw new Error("Ajoute toi-même au moins un produit ou pack avant de continuer.");
    return lines;
  }
  async function saveB2BProfileFromForm() {
    if (!currentUser) throw new Error("Connecte-toi pour enregistrer ton entreprise.");
    const form = $("b2bWorkspaceForm");
    if (!form) throw new Error("Formulaire professionnel indisponible.");
    const fd = new FormData(form);
    const payload = {
      owner_user_id: currentUser.id,
      company_name: String(fd.get("company_name") || "").trim(),
      sector: String(fd.get("sector") || "").trim(),
      contact_name: String(fd.get("contact_name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      address: String(fd.get("address") || "").trim(),
      delivery_zone: String(fd.get("delivery_zone") || "").trim(),
      updated_at: new Date().toISOString()
    };
    if (payload.company_name.length < 2 || payload.contact_name.length < 2 || payload.phone.replace(/\D/g, "").length < 8) {
      throw new Error("Renseigne l’entreprise, le contact et un téléphone valide.");
    }
    if (!payload.sector) throw new Error("Choisis le secteur d’activité de ton entreprise.");
    const result = await client.from("business_accounts").upsert(payload, { onConflict: "owner_user_id" }).select("*").single();
    if (result.error) throw result.error;
    currentBusinessAccount = result.data;
    return result.data;
  }
  async function openB2BWorkspace() {
    if (isGeneralAdmin()) return toast("L’espace client professionnel n’est pas disponible pour l’administrateur général.");
    if (!currentUser) {
      renderAuthForm("login", "Connecte-toi ou crée un compte pour enregistrer ton entreprise, demander des devis et retrouver ses commandes.");
      return;
    }
    const accountResult = await client.from("business_accounts").select("*").eq("owner_user_id", currentUser.id).maybeSingle();
    if (accountResult.error) return toast("Espace professionnel indisponible : " + errorMessage(accountResult.error), true);
    currentBusinessAccount = accountResult.data || null;
    const account = currentBusinessAccount || {};
    const [quoteResult, orderResult] = await Promise.all([
      client.from("quotes").select("id,created_at,company,need,message,status").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(10),
      account.id
        ? client.from("orders").select("id,created_at,status,total,amount_paid").eq("user_id", currentUser.id).eq("business_account_id", account.id).order("created_at", { ascending: false }).limit(10)
        : Promise.resolve({ data: [], error: null })
    ]);
    const quotes = quoteResult.error ? [] : (quoteResult.data || []);
    const orders = orderResult.error ? [] : (orderResult.data || []);
    const quoteHtml = quotes.length
      ? '<div class="b2b-history-list">' + quotes.map(function (q) {
          const message = String(q.message || "");
          const excerpt = message.length > 160 ? message.slice(0, 157) + "…" : message;
          return '<article class="b2b-history-item"><div class="b2b-history-item-top"><div><span class="b2b-history-ref">DEMANDE DE DEVIS</span><strong>' + esc(q.need || q.id) + '</strong></div><span class="b2b-status">' + esc(statusLabel(q.status)) + '</span></div><p>' + esc(excerpt || "Aucune précision complémentaire.") + '</p><div class="b2b-history-meta"><span>' + esc(q.id) + '</span><span>' + esc(fmtDate(q.created_at)) + '</span></div></article>';
        }).join("") + '</div>'
      : '<div class="b2b-empty-history"><strong>Aucune demande de devis</strong><p>Tes demandes envoyées seront visibles ici.</p></div>';
    const orderHtml = orders.length
      ? '<div class="b2b-history-list">' + orders.map(function (o) {
          return '<article class="b2b-history-item"><div class="b2b-history-item-top"><div><span class="b2b-history-ref">COMMANDE</span><strong>' + esc(o.id) + '</strong></div><span class="b2b-status">' + esc(statusLabel(o.status)) + '</span></div><div class="b2b-order-money"><div><span>Total</span><strong>' + money(o.total) + '</strong></div><div><span>Déjà payé</span><strong>' + money(o.amount_paid || 0) + '</strong></div></div><div class="b2b-history-meta"><span>' + esc(fmtDate(o.created_at)) + '</span><button class="btn small ghost" onclick="reorderOrder(\'' + esc(o.id) + '\')">Recommander cette commande</button></div></article>';
        }).join("") + '</div>'
      : '<div class="b2b-empty-history"><strong>Aucune commande professionnelle</strong><p>Les commandes passées depuis cet espace apparaîtront ici.</p></div>';
    const sectors = ["Bureau", "Restaurant", "Hôtel", "Commerce", "Nettoyage professionnel", "École / association", "Autre"];
    const sectorOptions = sectors.map(function (x) {
      return '<option value="' + esc(x) + '" ' + (account.sector === x ? "selected" : "") + '>' + esc(x) + '</option>';
    }).join("");
    showModal(
      '<div class="modal-head b2b-modal-head"><div><div class="eyebrow">ESPACE PROFESSIONNEL · B2B</div><h2>Espace professionnel</h2><p class="small-note">Un espace de travail pour gérer les achats de ton entreprise.</p></div><button class="close" onclick="closeModal()" aria-label="Fermer l’espace professionnel">✕</button></div>' +
      '<div class="b2b-workspace-intro"><div><span class="b2b-intro-kicker">COMMANDES & DEVIS</span><h3>Garde la main sur tes achats.</h3><p>Choisis librement tes références et tes quantités. Aucune sélection automatique n’est faite à ta place.</p></div><div class="b2b-intro-mark" aria-hidden="true">B2B</div></div>' +
      '<div class="b2b-overview-grid">' +
        '<div class="b2b-overview-card"><span class="b2b-overview-icon" aria-hidden="true">▤</span><div><strong>' + orders.length + '</strong><span>Commandes récentes</span></div></div>' +
        '<div class="b2b-overview-card"><span class="b2b-overview-icon" aria-hidden="true">▧</span><div><strong>' + quotes.length + '</strong><span>Devis récents</span></div></div>' +
        '<div class="b2b-overview-card"><span class="b2b-overview-icon" aria-hidden="true">✓</span><div><strong>' + (account.id ? 'Enregistré' : 'À renseigner') + '</strong><span>Profil entreprise</span></div></div>' +
      '</div>' +
      '<form id="b2bWorkspaceForm" class="b2b-workspace-form">' +
        '<section class="b2b-form-section">' +
          '<div class="b2b-section-title"><div><span class="b2b-section-kicker">ÉTAPE 1</span><h3>Profil de l’entreprise</h3><p class="small-note">Ces informations seront reprises dans les demandes professionnelles.</p></div><span class="b2b-section-badge ' + (account.id ? 'is-saved' : '') + '">' + (account.id ? 'Profil enregistré' : 'Nouveau profil') + '</span></div>' +
          '<div class="b2b-form-grid">' +
            '<label class="b2b-field-full"><span>Nom de l’entreprise ou de la structure</span><input class="input" name="company_name" required minlength="2" maxlength="180" value="' + esc(account.company_name || "") + '" placeholder="Nom de ta structure"></label>' +
            '<label><span>Secteur d’activité</span><select class="input" name="sector" required><option value="" disabled ' + (account.sector ? '' : 'selected') + '>Choisir un secteur</option>' + sectorOptions + '</select></label>' +
            '<label><span>Personne de contact</span><input class="input" name="contact_name" required minlength="2" maxlength="120" value="' + esc(account.contact_name || currentProfile?.full_name || "") + '" placeholder="Nom du contact"></label>' +
            '<label><span>Téléphone professionnel</span><input class="input" name="phone" type="tel" required minlength="8" maxlength="30" value="' + esc(account.phone || currentProfile?.phone || "") + '" placeholder="Numéro à joindre"></label>' +
            '<label><span>E-mail professionnel (facultatif)</span><input class="input" name="email" type="email" maxlength="254" value="' + esc(account.email || currentUser.email || "") + '" placeholder="contact@entreprise.sn"></label>' +
            '<label class="b2b-field-full"><span>Adresse de livraison (facultatif)</span><input class="input" name="address" maxlength="300" value="' + esc(account.address || "") + '" placeholder="Adresse de l’entreprise ou du site"></label>' +
            '<label class="b2b-field-full"><span>Zone ou quartier de livraison (facultatif)</span><input class="input" name="delivery_zone" maxlength="120" value="' + esc(account.delivery_zone || "") + '" placeholder="Ex. Dakar, Almadies"></label>' +
          '</div>' +
          '<div class="b2b-profile-save-row"><span class="small-note">Les champs obligatoires sont signalés dans le formulaire.</span><button class="btn secondary" type="submit">Enregistrer le profil</button></div>' +
        '</section>' +
        '<section class="b2b-form-section">' +
          '<div class="b2b-section-title"><div><span class="b2b-section-kicker">ÉTAPE 2</span><h3>Mes articles et quantités</h3><p class="small-note">Sélectionne uniquement les références dont tu as besoin.</p></div><button class="btn small secondary" type="button" onclick="addB2BLine()">＋ Ajouter un article</button></div>' +
          '<p class="b2b-selection-note"><span aria-hidden="true">ⓘ</span> Jusqu’à 20 références par demande. Rien n’est présélectionné ; la quantité est à saisir pour chaque ligne.</p>' +
          '<div id="b2bProductLines">' + b2bEmptySelectionHtml() + '</div>' +
        '</section>' +
        '<section class="b2b-form-section">' +
          '<div class="b2b-section-title"><div><span class="b2b-section-kicker">ÉTAPE 3</span><h3>Précisions (facultatif)</h3><p class="small-note">Ajoute des instructions utiles pour préparer le devis.</p></div></div>' +
          '<label class="b2b-notes-field"><span>Message pour SAMA-PACK</span><textarea class="input" name="message" maxlength="1800" placeholder="Conditionnement, délai souhaité, instructions de livraison…"></textarea></label>' +
          '<div class="b2b-action-row"><button class="btn primary" type="button" onclick="submitB2BQuantityOrder()">Ajouter au panier</button><button class="btn secondary" type="button" onclick="submitB2BQuote()">Demander un devis détaillé</button></div>' +
        '</section>' +
      '</form>' +
      '<div class="b2b-history-grid">' +
        '<section class="panel b2b-history-panel"><div class="b2b-section-title"><div><span class="b2b-section-kicker">SUIVI</span><h3>Commandes précédentes</h3><p class="small-note">Les 10 dernières commandes professionnelles.</p></div></div>' + orderHtml + '</section>' +
        '<section class="panel b2b-history-panel"><div class="b2b-section-title"><div><span class="b2b-section-kicker">SUIVI</span><h3>Demandes de devis</h3><p class="small-note">Les 10 dernières demandes transmises.</p></div></div>' + quoteHtml + '</section>' +
      '</div>'
    );
    const workspaceCard = document.querySelector(".modal-card");
    if (workspaceCard) workspaceCard.classList.add("b2b-workspace-modal");
    const form = $("b2bWorkspaceForm");
    if (form) form.onsubmit = async function (event) {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Enregistrement…"; }
      try {
        const result = await saveB2BProfileFromForm();
        const profileUpdate = await client.from("profiles").update({ full_name: result.contact_name, phone: result.phone }).eq("id", currentUser.id);
        if (profileUpdate.error) throw profileUpdate.error;
        currentProfile = Object.assign({}, currentProfile || {}, { full_name: result.contact_name, phone: result.phone });
        toast("Profil professionnel enregistré.");
        await openB2BWorkspace();
      } catch (error) {
        toast(errorMessage(error), true);
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Enregistrer le profil"; }
      }
    };
  }
  async function submitB2BQuantityOrder() {
    try{const account=await saveB2BProfileFromForm(),lines=readB2BLines();for(const item of lines){const existing=cart.find(entry=>entry.id===item.product_id);if(existing)existing.qty=Math.min(99,existing.qty+item.quantity);else cart.push({id:item.product_id,qty:Math.min(99,item.quantity)});}currentBusinessAccount=account;saveCart();updateCartCount();closeModal();renderCartModal();toast("Articles professionnels ajoutés au panier. Vérifie les quantités avant de confirmer.");}catch(error){toast(errorMessage(error),true);}
  }
  async function submitB2BQuote() {
    try{
      const account=await saveB2BProfileFromForm(),lines=readB2BLines(),amount=lines.reduce(function(sum,item){return sum+item.quantity*item.unit_price;},0);
      const details=lines.map(function(item){return item.quantity+" × "+item.product_name+" — prix indicatif unitaire "+money(item.unit_price);}).join("\n");
      const extras=String($("b2bWorkspaceForm")?.querySelector('[name="message"]')?.value||"").trim();
      const payload={company:account.company_name,phone:account.phone,email:account.email||currentUser.email||"",need:"Devis B2B détaillé — "+lines.length+" référence(s)",
        message:"Secteur : "+account.sector+"\nContact : "+account.contact_name+"\nZone : "+(account.delivery_zone||"à préciser")+"\n\nArticles et quantités :\n"+details+"\n\nValeur indicative avant vérification : "+money(amount)+(extras?"\n\nPrécisions : "+extras:""),
        business_account_id:account.id,sales_referral_code:getSalesReferralCode()};
      const result=await client.rpc("sama_create_quote",{p_payload:payload});if(result.error)throw result.error;if(!result.data?.ok)throw new Error("La demande de devis n’a pas pu être enregistrée.");
      toast("Demande de devis envoyée : "+String(result.data.id||""));await openB2BWorkspace();
    }catch(error){toast(errorMessage(error),true);}
  }
  async function setOrderDeliveryCost(id, rawValue) {
    if(!isGeneralAdmin())return toast("Seul le propriétaire peut modifier les coûts de livraison.",true);const amount=Number(rawValue);if(!Number.isFinite(amount)||amount<0)return toast("Saisis un coût de livraison valide.",true);
    const {error}=await client.from("orders").update({delivery_cost_actual:amount}).eq("id",id);if(error)return toast(errorMessage(error),true);
    const row=cachedOrders.find(o=>o.id===id);if(row)row.delivery_cost_actual=amount;toast("Coût réel de livraison enregistré.");
  }
  async function toggleSalesCode(id, active) {
    if(!hasAdminPermission("sales_codes.manage_own"))return toast("Cette action n’est pas autorisée.",true);
    const {error}=await client.from("sales_referral_codes").update({active:Boolean(active),updated_at:new Date().toISOString()}).eq("id",id);
    if(error)return toast(errorMessage(error),true);toast(active?"Code commercial activé.":"Code commercial suspendu.");await showAdminView("sales_codes");
  }
  async function deleteSalesCode(id) {
    if(!isGeneralAdmin())return toast("Seul le propriétaire peut supprimer un code commercial.",true);if(!window.confirm("Supprimer ce code commercial ? Les ventes déjà attribuées restent historisées."))return;
    const {error}=await client.from("sales_referral_codes").delete().eq("id",id);if(error)return toast(errorMessage(error),true);toast("Code commercial supprimé.");await showAdminView("sales_codes");
  }
  async function adminSalesCodes() {
    const results=await Promise.all([
      client.from("sales_referral_codes").select("*").order("created_at",{ascending:false}),
      client.from("profiles").select("id,full_name,email,role").eq("role","admin").order("created_at",{ascending:true}),
      client.from("orders").select("id,total,status,sales_referral_code,sales_referrer_user_id"),
      client.from("quotes").select("id,status,sales_referral_code,sales_referrer_user_id")
    ]);
    results.forEach(function(r){if(r.error)throw r.error;});
    const codes=results[0].data||[],people=results[1].data||[],orders=results[2].data||[],quotes=results[3].data||[],personById=new Map(people.map(function(p){return [p.id,p];}));
    const profileOptions=people.filter(function(p){return isGeneralAdmin() || p.id===currentUser.id;}).map(function(p){return '<option value="'+esc(p.id)+'">'+esc(p.full_name||p.email||p.id)+' ('+esc(p.role||"client")+')</option>';}).join("");
    const rows=codes.map(function(code){
      const p=personById.get(code.owner_user_id)||{},attributed=orders.filter(function(o){return o.sales_referrer_user_id===code.owner_user_id||o.sales_referral_code===code.code;});
      const revenue=attributed.filter(function(o){return !["cancelled","awaiting_payment","awaiting_delivery_payment"].includes(o.status);}).reduce(function(sum,o){return sum+Number(o.total||0);},0);
      const quoteCount=quotes.filter(function(q){return q.sales_referrer_user_id===code.owner_user_id||q.sales_referral_code===code.code;}).length;
      const controls=(isGeneralAdmin()||hasAdminPermission("sales_codes.manage_own"))
        ? '<div class="account-order-actions"><button class="btn small ghost" onclick="toggleSalesCode(\''+esc(code.id)+'\','+(!code.active)+')">'+(code.active?"Suspendre":"Réactiver")+'</button>'+(isGeneralAdmin()?'<button class="btn small danger" onclick="deleteSalesCode(\''+esc(code.id)+'\')">Supprimer</button>':'')+'</div>'
        : '<span class="small-note">Lecture seule</span>';
      return '<tr><td><strong>'+esc(p.full_name||p.email||"Membre")+'</strong><br><code>'+esc(code.code)+'</code><br><span class="small-note">'+esc(code.label||"")+'</span></td><td>'+attributed.length+'</td><td>'+money(revenue)+'</td><td>'+quoteCount+'</td><td>'+(code.active?'<span class="status delivered">Actif</span>':'<span class="status cancelled">Suspendu</span>')+'</td><td>'+controls+'</td></tr>';
    }).join("");
    const canCreateCode = isGeneralAdmin() || hasAdminPermission("sales_codes.manage_own");
    const createForm = canCreateCode
      ? '<div class="panel"><div class="eyebrow">ATTRIBUTION DES VENTES</div><h3>'+(isGeneralAdmin()?"Créer un code commercial":"Mon code commercial")+'</h3><p class="small-note">Partage un lien comme <code>https://sama-pack.store/?ref=ALMINE</code>. Le code est vérifié côté serveur lors de la commande ou du devis.</p><form id="salesCodeForm" class="admin-form"><label>'+(isGeneralAdmin()?"Membre de l’équipe":"Compte associé")+'<select class="input" name="owner_user_id" required>'+profileOptions+'</select></label><label>Code unique<input class="input" name="code" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_-]{3,30}" placeholder="ALMINE"></label><label class="full">Libellé / campagne<input class="input" name="label" maxlength="120" placeholder="Prospection entreprises / membre"></label><button class="btn primary full" type="submit">Créer le code</button></form></div>'
      : "";
    return createForm+'<div class="panel"><div class="admin-panel-head"><h3>Performance des codes ('+codes.length+')</h3><span class="small-note">Les résultats affichés correspondent aux dossiers auxquels ton compte a accès.</span></div>'+(codes.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Membre / code</th><th>Commandes attribuées</th><th>CA attribué</th><th>Devis</th><th>État</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty">Aucun code commercial. Crée un code pour commencer.</div>')+'</div>';
  }
  async function adminProfitability() {
    if (!isGeneralAdmin()) throw new Error("La rentabilité est réservée au propriétaire."); const {data,error}=await client.rpc("sama_get_order_profitability");if(error)throw error;
    const rows=data||[],included=rows.filter(function(row){return !["cancelled","awaiting_payment","awaiting_delivery_payment"].includes(row.status);});
    const revenue=included.reduce(function(sum,row){return sum+Number(row.revenue||0);},0),productCost=included.reduce(function(sum,row){return sum+Number(row.product_cost||0);},0),
      fees=included.reduce(function(sum,row){return sum+Number(row.estimated_payment_fee||0);},0),deliveryCosts=included.reduce(function(sum,row){return sum+Number(row.delivery_cost_actual||0);},0),
      margin=included.reduce(function(sum,row){return sum+Number(row.estimated_contribution_margin||0);},0),incomplete=included.filter(function(row){return !row.cost_data_complete;}).length;
    const table=rows.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Date</th><th>CA</th><th>Coût produits</th><th>Frais paiement estimés</th><th>Livraison réelle</th><th>Marge contributive estimée</th><th>Coûts</th></tr></thead><tbody>'+rows.map(function(row){return '<tr><td>'+esc(row.order_id)+'<br><span class="small-note">'+esc(row.customer_name||"Client")+'</span></td><td>'+esc(fmtDate(row.created_at))+'</td><td>'+money(row.revenue)+'</td><td>'+money(row.product_cost)+'</td><td>'+money(row.estimated_payment_fee)+' ('+Number(row.payment_fee_percent||0).toLocaleString("fr-FR")+'%)</td><td>'+money(row.delivery_cost_actual)+'</td><td><strong>'+money(row.estimated_contribution_margin)+'</strong></td><td>'+(row.cost_data_complete?'<span class="status delivered">Complets</span>':'<span class="status awaiting_delivery_payment">Incomplets</span>')+'</td></tr>';}).join("")+'</tbody></table></div>':'<div class="empty">Aucune commande à analyser pour le moment.</div>';
    return '<div class="dashboard-welcome"><div><div class="eyebrow">ANALYSE FINANCIÈRE</div><h2>Rentabilité des commandes</h2><p>Les frais de paiement sont estimés avec le taux configuré. Les coûts produits proviennent des coûts d’achat ou de stock saisis. Renseigne les coûts réels de livraison dans le tableau des commandes.</p></div><button class="btn ghost small" onclick="showAdminView(\'profitability\')">Actualiser</button></div>'+
      '<div class="dashboard-kpis"><article class="dashboard-kpi revenue"><span class="dashboard-kpi-label">Chiffre d’affaires</span><strong>'+money(revenue)+'</strong><small>Hors annulées et paiements non confirmés</small></article><article class="dashboard-kpi orders"><span class="dashboard-kpi-label">Coût des produits</span><strong>'+money(productCost)+'</strong><small>Coûts enregistrés</small></article><article class="dashboard-kpi pending"><span class="dashboard-kpi-label">Frais de paiement</span><strong>'+money(fees)+'</strong><small>Estimation, pas relevé du prestataire</small></article><article class="dashboard-kpi average"><span class="dashboard-kpi-label">Coûts de livraison</span><strong>'+money(deliveryCosts)+'</strong><small>Coûts réels renseignés</small></article><article class="dashboard-kpi published"><span class="dashboard-kpi-label">Marge contributive estimée</span><strong>'+money(margin)+'</strong><small>'+incomplete+' commande(s) avec coûts incomplets</small></article></div><div class="panel"><div class="admin-panel-head"><h3>Détail par commande</h3><span class="small-note">Les coûts absents sont signalés comme incomplets.</span></div>'+table+'</div>';
  }


  async function copySalesLink(code) {
    const safeCode = String(code || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!safeCode) return toast("Code commercial invalide.", true);
    const link = window.location.origin + "/?ref=" + encodeURIComponent(safeCode);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      toast("Lien commercial copié : " + link);
    } catch { window.prompt("Copie ce lien commercial :", link); }
  }

  function openQuoteModal() {
    if (isGeneralAdmin()) return toast("La demande de devis client est réservée aux clients professionnels.");
    showModal(`<div class="modal-head"><div><div class="eyebrow">B2B</div><h2>Demander un devis</h2></div><button class="close" onclick="closeModal()">✕</button></div><form id="quoteForm" class="checkout-grid"><input class="input" name="company" required maxlength="150" placeholder="Entreprise / structure"><input class="input" name="phone" required maxlength="30" placeholder="Téléphone"><input class="input full" name="need" required maxlength="250" placeholder="Besoin (ex. 20 packs professionnels par mois)"><input class="input full" name="email" type="email" placeholder="E-mail (facultatif)"><textarea class="input full" name="message" maxlength="2000" placeholder="Précisions"></textarea><button class="btn primary full" type="submit">Envoyer la demande de devis</button></form>`);
    const form = $("quoteForm"); form.onsubmit = async e => {
      e.preventDefault(); setBusy(form, true, "Envoi…"); const f = new FormData(form);
      const payload = { company: String(f.get("company") || "").trim(), phone: String(f.get("phone") || "").trim(), need: String(f.get("need") || "").trim(), email: String(f.get("email") || "").trim(), message: String(f.get("message") || "").trim(), sales_referral_code: getSalesReferralCode() };
      const { data, error } = await client.rpc("sama_create_quote", { p_payload: payload }); setBusy(form, false);
      if (error) return toast(errorMessage(error), true);
      closeModal(); toast(`Demande de devis envoyée (${data?.id || "enregistrée"}).`);
    };
  }

  async function openAdmin() {
    if (!currentUser) { openAccountModal(); toast("Connecte-toi avec un compte administrateur."); return; }
    // Refresh the role/permissions before deciding which modules to display.
    // This avoids stale client state after permission changes or an account switch.
    try {
      const refreshedProfile = await getProfile(currentUser);
      if (refreshedProfile) currentProfile = refreshedProfile;
    } catch (error) {
      console.warn("Impossible d’actualiser le profil avant l’ouverture de la gestion.", error);
    }
    if (!isAdmin()) {
      const { data: adminCheck, error: adminCheckError } = await client.rpc("sama_is_admin");
      if (adminCheckError || adminCheck !== true) { toast("Ce compte n’a pas les droits d’administration.", true); return; }
      // The database confirms the role; retry the profile read once before denying access.
      const retryProfile = await getProfile(currentUser);
      if (retryProfile) currentProfile = retryProfile;
      if (!isAdmin()) { toast("Le compte est administrateur, mais son profil n’a pas pu être chargé. Actualise la page et reconnecte-toi si nécessaire.", true); return; }
    }
    $("adminPanel").classList.remove("hidden"); await showAdminView("dashboard");
  }
  function setAdminMobileMenuOpen(open) {
    const sidebar = $("adminSidebar");
    const toggle = $("adminMenuToggle");
    if (!sidebar || !toggle) return;
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const expanded = isMobile && Boolean(open);
    sidebar.classList.toggle("is-open", expanded);
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.setAttribute("aria-label", expanded ? "Fermer le menu de gestion" : "Ouvrir le menu de gestion");
  }
  function closeAdmin() {
    setAdminMobileMenuOpen(false);
    $("adminPanel").classList.add("hidden");
    stopDashboardPresencePolling();
  }
  function statusLabel(status) { return ({new:"Reçue",confirmed:"Confirmée",processing:"En préparation",prepared:"Préparée",out_for_delivery:"En cours de livraison",delivered:"Livrée",cancelled:"Annulée",awaiting_payment:"Paiement intégral en attente",awaiting_delivery_payment:"Frais de livraison à payer",won:"Gagné",lost:"Perdu"})[status] || status || "—"; }
  function paymentStatusLabel(status) { return ({unpaid:"Non payé",pending:"Paiement en attente",partially_paid:"Partiellement payé",paid:"Payé",failed:"Échec du paiement",refund_review:"Paiement à vérifier / rembourser"})[status] || status || "Non renseigné"; }
  function actionLabel(action) { return ({pack_created:"Pack créé",pack_updated:"Pack modifié",pack_deleted:"Pack supprimé",order_status_changed:"Statut de commande modifié",order_placed:"Commande passée",admin_bootstrap:"Premier administrateur configuré",admin_invited:"Administrateur invité",admin_removed:"Droits administrateur retirés",settings_updated:"Paramètres modifiés",stock_created:"Stock créé",stock_updated:"Stock modifié",supplier_created:"Fournisseur ajouté",supplier_updated:"Fournisseur modifié",supplier_deleted:"Fournisseur supprimé",expense_created:"Dépense ajoutée",expense_updated:"Dépense modifiée",expense_deleted:"Dépense supprimée",quote_created:"Demande de devis reçue",quote_updated:"Devis modifié",quote_deleted:"Devis supprimé"})[action] || action || "Action"; }
  function updateAdminContext() {
    const name = String(currentProfile?.full_name || currentUser?.email || "Compte de gestion");
    const role = currentProfile?.is_super_admin === true ? "Administrateur général" : "Administrateur";
    const context = $("adminContext");
    if (context) context.textContent = role + " · " + name;
    const flag = $("adminFlag");
    if (flag) flag.textContent = "Connecté : " + name + " · " + role;
  }

  function applyAdminNavigationSearch() {
    const query = String($("adminNavSearch")?.value || "").trim().toLocaleLowerCase("fr");
    let visibleTotal = 0;
    document.querySelectorAll(".admin-nav-group").forEach(group => {
      const buttons = [...group.querySelectorAll(".side-btn")];
      let visible = 0;
      buttons.forEach(button => {
        const match = !query || button.textContent.toLocaleLowerCase("fr").includes(query);
        button.classList.toggle("admin-nav-hidden", !match);
        if (match) visible++;
      });
      group.classList.toggle("admin-nav-group-empty", visible === 0);
      visibleTotal += visible;
    });
    const noResults = $("adminNavNoResults");
    if (noResults) noResults.classList.toggle("hidden", visibleTotal > 0);
  }

  function applyAdminResultSearch() {
    const query = String($("adminGlobalSearch")?.value || "").trim().toLocaleLowerCase("fr");
    document.querySelectorAll("#adminContent .table-wrap").forEach(wrap => {
      const rows = [...wrap.querySelectorAll("tbody tr")];
      let visible = 0;
      rows.forEach(row => {
        const match = !query || row.textContent.toLocaleLowerCase("fr").includes(query);
        row.hidden = !match;
        if (match) visible++;
      });
      let note = wrap.nextElementSibling?.classList.contains("admin-no-match") ? wrap.nextElementSibling : null;
      if (!note && rows.length) {
        note = document.createElement("p");
        note.className = "admin-no-match small-note";
        note.textContent = "Aucun résultat ne correspond à cette recherche.";
        wrap.insertAdjacentElement("afterend", note);
      }
      if (note) note.classList.toggle("hidden", !query || visible > 0 || !rows.length);
    });
  }

  async function showAdminView(view) {
    stopDashboardPresencePolling();
    if (!isAdmin()) { closeAdmin(); return toast("Accès administrateur requis.", true); }
    if (!canViewAdminView(view)) return toast(adminViewDeniedMessage(), true);
    currentAdminView = view; editingProductId = (view === "packs" || view === "products") ? editingProductId : null;
    const navSearch = $("adminNavSearch"); if (navSearch) navSearch.value = "";
    document.querySelectorAll(".admin-nav-group").forEach(group => group.classList.remove("admin-nav-group-empty"));
    const navNoResults = $("adminNavNoResults"); if (navNoResults) navNoResults.classList.add("hidden");
    document.querySelectorAll(".side-btn").forEach(b => {
      const allowed = canViewAdminView(b.dataset.view);
      b.classList.toggle("hidden", !allowed);
      b.classList.remove("admin-nav-hidden");
      b.classList.toggle("active", allowed && (b.dataset.view === view || (view === "products" && b.dataset.view === "packs")));
    });
    const globalSearch = $("adminGlobalSearch"); if (globalSearch) globalSearch.value = "";
    updateAdminContext();
    const titles = {dashboard:"Tableau de bord",orders:"Commandes",customers:"Clients",stock:"Stock",products:"Packs",packs:"Packs",catalogs:"Produits & outils",prospects:"Prospection",admins:"Comptes administrateurs",activity:"Journal des actions",suppliers:"Fournisseurs",expenses:"Dépenses",quotes:"Devis professionnels",settings:"Paramètres",profitability:"Rentabilité",sales_codes:"Codes commerciaux",marketing:"Campagnes e-mail",contacts:"Messages de contact",deliveries:"SAMA-PACK Livraison"};
    $("adminTitle").textContent = titles[view] || "Gestion";
    $("adminContent").innerHTML = '<div class="panel loading-panel">Chargement des données…</div>';
    try {
      if (view === "prospects") { await renderProspectsAdmin(); applyAdminResultSearch(); return; }
      if (view === "catalogs") { await renderIndividualCatalogAdmin(); applyAdminResultSearch(); return; }
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
      else if (view === "marketing") html = await adminMarketing();
      else if (view === "contacts") html = await adminContacts();
      else if (view === "deliveries") html = await adminDeliveries();
      else if (view === "profitability") html = await adminProfitability();
      else if (view === "sales_codes") html = await adminSalesCodes();
      else if (view === "settings") html = await adminSettings();
      $("adminContent").innerHTML = html;
      bindAdmin(view);
      if (view === "marketing") { const button = $("sendMonthlyMarketingBtn"); if (button) button.onclick = sendMonthlyMarketingNow; }
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
    const dashboardWarnings = [];
    const readDashboardRows = async (table, columns = "*") => {
      try { return await readRows(table, columns); }
      catch (error) {
        console.warn("Données du tableau de bord temporairement indisponibles :", table, error);
        dashboardWarnings.push(table);
        return [];
      }
    };
    const [orders, stock, expenses, quotes, productRows] = await Promise.all([
      hasAdminPermission("orders.view") ? readDashboardRows("orders") : Promise.resolve([]),
      hasAdminPermission("stock.view") ? readDashboardRows("stock", "product_id,quantity,min_quantity,updated_at") : Promise.resolve([]),
      (isGeneralAdmin() || hasAdminPermission("expenses.submit")) ? readDashboardRows("expenses") : Promise.resolve([]),
      hasAdminPermission("quotes.view") ? readDashboardRows("quotes") : Promise.resolve([]),
      readDashboardRows("products")
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
    let stockValue = 0;
    if (isGeneralAdmin()) {
      const costResult = await client.from("product_costs").select("product_id,supplier_price");
      if (!costResult.error) {
        const costs = new Map((costResult.data || []).map(row => [row.product_id, Number(row.supplier_price || 0)]));
        stockValue = stock.reduce((sum,row) => sum + Number(row.quantity || 0) * Number(costs.get(row.product_id) || 0), 0);
      }
    }
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
    return `${dashboardWarnings.length ? '<div class="panel dashboard-data-warning"><strong>Tableau de bord partiellement chargé.</strong><p>Certains indicateurs sont momentanément indisponibles. Les autres rubriques restent accessibles. Réessaie l’actualisation pour récupérer les données manquantes.</p></div>' : ''}<div class="dashboard-welcome"><div><div class="eyebrow">PILOTAGE COMMERCIAL</div><h2>Vue d’ensemble de SAMA-PACK</h2><p>Suivi des ventes, des commandes, du catalogue et des réapprovisionnements.</p></div><button class="btn ghost small" onclick="showAdminView('dashboard')">Actualiser les données</button></div>
      <div class="dashboard-kpis">${cards.map(card=>`<article class="dashboard-kpi ${card.css}"><span class="dashboard-kpi-label">${esc(card.label)}</span><strong ${card.live ? 'id="activeAccountsCount"' : ""}>${esc(card.value)}</strong><small ${card.live ? 'id="activeAccountsLastUpdated"' : ""}>${esc(card.note)}</small></article>`).join("")}</div>
      <section class="admin-quick-actions" aria-label="Raccourcis de gestion">
        <button class="admin-quick-action" type="button" onclick="showAdminView('orders')"><span class="admin-quick-icon">▤</span><span><strong>Traiter les commandes</strong><small>Suivre paiement, préparation et livraison</small></span><span class="admin-quick-arrow">→</span></button>
        <button class="admin-quick-action" type="button" onclick="showAdminView('packs')"><span class="admin-quick-icon">▣</span><span><strong>Mettre à jour les packs</strong><small>Prix, marges, photos et ventes flash</small></span><span class="admin-quick-arrow">→</span></button>
        <button class="admin-quick-action" type="button" onclick="showAdminView('catalogs')"><span class="admin-quick-icon">▤</span><span><strong>Gérer produits et outils</strong><small>Catalogue distinct des packs</small></span><span class="admin-quick-arrow">→</span></button>
        <button class="admin-quick-action" type="button" onclick="showAdminView('prospects')"><span class="admin-quick-icon">◎</span><span><strong>Développer la clientèle</strong><small>Prospects et suivi commercial</small></span><span class="admin-quick-arrow">→</span></button>
      </section>
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
  async function adminDeliveries() {
    if (!isGeneralAdmin()) throw new Error("Seul l’administrateur général peut gérer les livreurs.");
    const [courierResult, orderResult, eventResult] = await Promise.all([
      client.from("profiles").select("id,full_name,email,phone,last_seen_at,created_at")
        .eq("role","courier").order("created_at",{ascending:false}),
      client.from("orders").select("id,created_at,status,customer_name,customer_phone,delivery_address,delivery_zone,slot,total,amount_paid,payment_status,assigned_courier_id,delivery_attempt_status,delivery_failure_reason")
        .in("status",["prepared","out_for_delivery"]).order("created_at",{ascending:false}).limit(250),
      client.from("order_delivery_events").select("id,order_id,courier_id,actor_user_id,note,amount,payment_method,created_at")
        .eq("event_type","collection_recorded").eq("review_status","pending").order("created_at",{ascending:false}).limit(250)
    ]);
    if (courierResult.error) throw courierResult.error;
    if (orderResult.error) throw orderResult.error;
    if (eventResult.error) throw eventResult.error;
    const couriers = courierResult.data || [];
    const orders = orderResult.data || [];
    const pendingEvents = eventResult.data || [];
    const courierNames = Object.fromEntries(couriers.map(row => [row.id, row.full_name || row.email || "Livreur"]));
    const courierRows = couriers.length ? couriers.map(row =>
      '<tr><td><strong>' + esc(row.full_name || "Sans nom") + '</strong><br><span class="small-note">' + esc(row.email || "") + '</span></td>' +
      '<td>' + esc(row.phone || "—") + '</td><td>' + esc(row.last_seen_at ? fmtDate(row.last_seen_at) : "Jamais connecté") + '</td>' +
      '<td>' + esc(fmtDate(row.created_at)) + '</td></tr>'
    ).join("") : "";
    const assignmentRows = orders.length ? orders.map(order => {
      const eligible = order.status === "prepared" || (order.status === "out_for_delivery" && order.delivery_attempt_status === "failed");
      const options = '<option value="">Non attribuée</option>' + couriers.map(c =>
        '<option value="' + esc(c.id) + '"' + (order.assigned_courier_id === c.id ? " selected" : "") + '>' + esc(c.full_name || c.email || "Livreur") + '</option>'
      ).join("");
      const statusLabelText = order.delivery_attempt_status === "failed" ? "Échec à reprogrammer"
        : order.status === "out_for_delivery" ? "En cours de livraison"
        : "Prête pour livraison";
      return '<tr><td><strong>' + esc(order.id) + '</strong><br><span class="small-note">' + esc(fmtDate(order.created_at)) + '</span></td>' +
        '<td>' + esc(order.customer_name || "Client") + '<br><span class="small-note">' + esc(order.customer_phone || "") + '</span><br><span class="small-note">' + esc([order.delivery_address,order.delivery_zone].filter(Boolean).join(" · ")) + '</span></td>' +
        '<td>' + money(order.total) + '<br><span class="small-note">Payé : ' + money(order.amount_paid || 0) + '</span></td>' +
        '<td><span class="status">' + esc(statusLabelText) + '</span>' +
          (order.delivery_failure_reason ? '<p class="small-note">' + esc(order.delivery_failure_reason) + '</p>' : '') + '</td>' +
        '<td><select class="input delivery-assignment-select" data-order-id="' + esc(order.id) + '" data-previous-value="' + esc(order.assigned_courier_id || "") + '"' + (!eligible || !couriers.length ? " disabled" : "") + '>' + options + '</select></td></tr>';
    }).join("") : "";
    const pendingOrderIds = [...new Set(pendingEvents.map(row => row.order_id))];
    let pendingOrders = [];
    if (pendingOrderIds.length) {
      const result = await client.from("orders").select("id,customer_name,total,amount_paid").in("id",pendingOrderIds);
      if (result.error) throw result.error;
      pendingOrders = result.data || [];
    }
    const orderById = Object.fromEntries(pendingOrders.map(row => [row.id,row]));
    const pendingRows = pendingEvents.length ? pendingEvents.map(item => {
      const order = orderById[item.order_id] || {};
      return '<tr><td><strong>' + esc(item.order_id) + '</strong><br><span class="small-note">' + esc(order.customer_name || "Client") + '</span></td>' +
        '<td>' + esc(courierNames[item.courier_id] || "Livreur") + '</td>' +
        '<td><strong>' + money(item.amount) + '</strong><br><span class="small-note">' + esc(({cash:"Espèces",wave:"Wave",orange_money:"Orange Money",other:"Autre"})[item.payment_method] || item.payment_method) + '</span></td>' +
        '<td>' + esc(fmtDate(item.created_at)) + '<br><span class="small-note">Solde avant validation : ' + money(Math.max(0,Number(order.total||0)-Number(order.amount_paid||0))) + '</span></td>' +
        '<td><input class="input" data-delivery-review-note="' + esc(item.id) + '" maxlength="500" placeholder="Note (facultative)"><div class="account-order-actions">' +
        '<button type="button" class="btn small primary" data-event-id="' + esc(item.id) + '" data-delivery-review="validated">Valider</button>' +
        '<button type="button" class="btn small danger" data-event-id="' + esc(item.id) + '" data-delivery-review="rejected">Rejeter</button></div></td></tr>';
    }).join("") : "";
    return '<div class="panel"><div class="admin-panel-head"><div><h3>Gestion des livreurs (' + couriers.length + ')</h3><p class="small-note">Invitations nominatives. Le livreur se connecte avec son adresse e-mail et son mot de passe.</p></div><button class="btn small ghost" onclick="showAdminView(\'deliveries\')">Actualiser</button></div>' +
      '<form id="courierInviteForm" class="admin-form"><label>Nom complet<input class="input" name="full_name" required minlength="2" maxlength="120" placeholder="Nom du livreur"></label><label>Adresse e-mail<input class="input" name="email" type="email" required maxlength="254" placeholder="livreur@exemple.sn"></label><label>Téléphone<input class="input" name="phone" type="tel" maxlength="40" placeholder="+221 …"></label><button class="btn primary full" type="submit">Inviter un livreur</button></form>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Livreur</th><th>Téléphone</th><th>Dernière activité</th><th>Compte créé</th></tr></thead><tbody>' + (courierRows || '<tr><td colspan="4">Aucun livreur invité pour le moment.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="panel"><div class="admin-panel-head"><div><h3>Attribution des livraisons (' + orders.length + ')</h3><p class="small-note">Les commandes doivent être prêtes avant attribution. Une livraison en cours ne peut être réattribuée qu’après un échec enregistré.</p></div></div>' +
      (orders.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Client / adresse</th><th>Montant</th><th>État livraison</th><th>Livreur affecté</th></tr></thead><tbody>' + assignmentRows + '</tbody></table></div>' : '<div class="empty">Aucune commande prête ou en cours de livraison.</div>') + '</div>' +
      '<div class="panel"><div class="admin-panel-head"><div><h3>Encaissements à rapprocher (' + pendingEvents.length + ')</h3><p class="small-note">Les montants déclarés par les livreurs ne deviennent pas des paiements confirmés avant validation.</p></div></div>' +
      (pendingEvents.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Commande / client</th><th>Livreur</th><th>Montant reçu</th><th>Date</th><th>Décision</th></tr></thead><tbody>' + pendingRows + '</tbody></table></div>' : '<div class="empty">Aucun encaissement en attente de validation.</div>') + '</div>';
  }

  async function adminOrders() {
    const orders = await loadOrdersWithItems();
    let assignableAdmins = [];
    if (isGeneralAdmin()) {
      const adminResult = await client.from("profiles").select("id,full_name,email")
        .eq("role","admin").eq("is_super_admin",false).order("created_at",{ascending:true});
      if (adminResult.error) throw adminResult.error;
      assignableAdmins = adminResult.data || [];
    }
    return `<div class="panel"><div class="admin-panel-head"><h3>Commandes (${orders.length})</h3><button class="btn ghost small" onclick="showAdminView('orders')">Actualiser</button></div><p class="small-note">Les commandes en attente de paiement ne doivent pas être préparées. Les frais de livraison doivent être encaissés et confirmés avant le départ du livreur.</p>${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Paiement reçu</th><th>Statut</th>${isGeneralAdmin() ? "<th>Attribuée à</th><th>Coût livraison réel (FCFA)</th>" : ""}<th>Détails</th></tr></thead><tbody>${orders.map(o=>{
      const pendingPayment = ["awaiting_payment","awaiting_delivery_payment"].includes(o.status);
      const options = pendingPayment ? [o.status,"cancelled"] : ["new","confirmed","processing","prepared","out_for_delivery","delivered","cancelled"];
      const quoteChar = String.fromCharCode(39);
      const statusCell = hasAdminPermission("orders.update_status")
        ? '<select class="input" onchange="setOrderStatus(' + quoteChar + esc(o.id) + quoteChar + ',this.value)">' + options.map(s => '<option ' + (o.status === s ? 'selected' : '') + ' value="' + s + '">' + esc(statusLabel(s)) + '</option>').join("") + '</select>'
        : '<span class="status">' + esc(statusLabel(o.status)) + '</span>';
      const selectedAdmin = o.assigned_admin_id || o.sales_referrer_user_id || "";
      const assignmentCell = isGeneralAdmin()
        ? "<td><select class=\"input\" aria-label=\"Attribuer la commande\" onchange=\"setOrderAssigned('" + esc(o.id) + "',this.value)\"><option value=\"\">Non attribuée</option>" +
          assignableAdmins.map(a => '<option value="' + esc(a.id) + '"' + (selectedAdmin === a.id ? " selected" : "") + '>' + esc(a.full_name || a.email || "Administrateur") + '</option>').join("") +
          '</select></td>'
        : "";
      const deliveryCostCell = isGeneralAdmin()
        ? "<td><input class=\"input profit-delivery-input\" type=\"number\" min=\"0\" step=\"1\" aria-label=\"Coût réel livraison\" value=\"" + Number(o.delivery_cost_actual || 0) + "\" onchange=\"setOrderDeliveryCost('" + esc(o.id) + "',this.value)\"></td>"
        : "";
      return `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name)}<br><span class="small-note">${esc(o.customer_phone)}</span></td><td>${money(o.total)}</td><td>${money(o.amount_paid || 0)}<br><span class="small-note">${esc(paymentStatusLabel(o.payment_status))}</span></td><td>${statusCell}</td>${assignmentCell}${deliveryCostCell}<td><div class="account-order-actions"><button class="btn small ghost" onclick="showOrder('${esc(o.id)}')">Voir</button><button class="btn small secondary" onclick="openOrderWhatsApp('${esc(o.id)}')">WhatsApp</button></div></td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment.</div>'}</div>`;
  }

  function showOrder(id) {
    const o = cachedOrders.find(x => x.id === id); if (!o) return toast("Commande introuvable.", true);
    const customer = cachedCustomers.find(c => c.id === o.customer_id) || {};
    const lines = cachedOrderItems.filter(x => x.order_id === o.id);
    const name = o.customer_name || customer.name || "Client"; const phone = o.customer_phone || customer.phone || "";
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE</div><h2>${esc(o.id)}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p><strong>${esc(name)}</strong> · ${esc(phone)}<br>${esc(o.delivery_address || customer.address || "")} ${esc(o.delivery_zone || customer.zone || "")}<br><span class="small-note">Créée le ${esc(fmtDate(o.created_at))}</span></p>${orderTrackingHtml(o)}<ul class="pack-items">${lines.map(i=>`<li>${Number(i.quantity)} × ${esc(i.product_name)} — ${money(i.unit_price)}</li>`).join("") || "<li>Détails des lignes indisponibles pour cette ancienne commande.</li>"}</ul><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(o.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(o.delivery)}</strong></div><div class="summary-row"><span>Mode de paiement</span><strong>${esc(o.payment_choice || o.payment || "Non renseigné")}</strong></div><div class="summary-row"><span>Créneau de livraison</span><strong>${esc(o.slot || "À convenir")}</strong></div><div class="summary-row"><span>Statut du paiement</span><strong>${esc(paymentStatusLabel(o.payment_status))}</strong></div><div class="summary-row"><span>Déjà encaissé</span><strong>${money(o.amount_paid || 0)}</strong></div><div class="summary-row"><span>Solde restant</span><strong>${money(Math.max(0, Number(o.total || 0)-Number(o.amount_paid || 0)))}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>${["awaiting_payment","awaiting_delivery_payment"].includes(o.status) ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(o.id)}')">Reprendre le paiement</button>` : ""}`);
  }
  async function setOrderStatus(id, status) {
    if (!hasAdminPermission("orders.update_status")) return toast("Accès refusé.", true);
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
  async function setOrderAssigned(id, assignedAdminId) {
    if (!isGeneralAdmin()) return toast("Seul le propriétaire peut attribuer les commandes.", true);
    const { error } = await client.from("orders").update({ assigned_admin_id: assignedAdminId || null }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(assignedAdminId ? "Commande attribuée." : "Attribution retirée.");
    await showAdminView("orders");
  }
  window.setOrderAssigned = setOrderAssigned;
  async function adminCustomers() {
    const customerRows = await readRows("customers");
    cachedCustomers = customerRows;
    let assignableAdmins = [];
    if (isGeneralAdmin()) {
      const adminResult = await client.from("profiles").select("id,full_name,email")
        .eq("role","admin").eq("is_super_admin",false).order("created_at",{ascending:true});
      if (adminResult.error) throw adminResult.error;
      assignableAdmins = adminResult.data || [];
    }

    const profileRows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from("profiles")
        .select("id,full_name,email,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,marketing_opt_in,role,created_at")
        .eq("role", "customer").order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      profileRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const profilesById = new Map(profileRows.map(row => [row.id, row]));
    const profilesByPhone = new Map();
    profileRows.forEach(profile => {
      const key = normalizeCustomerWhatsapp(profile.phone);
      if (!key) return;
      if (!profilesByPhone.has(key)) profilesByPhone.set(key, []);
      profilesByPhone.get(key).push(profile);
    });
    const matchedProfileIds = new Set();
    const enriched = customerRows.map(customer => {
      let profile = customer.user_id ? profilesById.get(customer.user_id) || null : null;
      if (!profile) {
        const matches = profilesByPhone.get(normalizeCustomerWhatsapp(customer.phone)) || [];
        if (matches.length === 1) profile = matches[0];
      }
      if (profile) matchedProfileIds.add(profile.id);
      return { ...customer, profile, list_id: String(customer.id) };
    });
    profileRows.forEach(profile => {
      if (!matchedProfileIds.has(profile.id)) {
        enriched.push({
          id: "profile:" + profile.id,
          list_id: "profile:" + profile.id,
          name: profile.full_name || "Client SAMA-PACK",
          phone: profile.phone || "",
          address: profile.delivery_address || "",
          zone: [profile.delivery_region, profile.delivery_city, profile.delivery_commune, profile.delivery_neighborhood].filter(Boolean).join(", "),
          orders_count: 0,
          last_order_at: null,
          created_at: profile.created_at,
          updated_at: profile.created_at,
          user_id: profile.id,
          profile,
        });
      }
    });

    const subscribedCount = profileRows.filter(profile => profile.marketing_opt_in === true).length;
    const tableHtml = enriched.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Contact</th><th>Zone</th><th>Commandes</th><th>Dernière commande</th><th>E-mails commerciaux</th>' + (isGeneralAdmin() ? '<th>Responsable</th>' : '') + '<th>Fiche</th></tr></thead><tbody>' +
      enriched.slice().sort((a,b) => new Date(b.last_order_at || b.created_at || 0) - new Date(a.last_order_at || a.created_at || 0)).map(customer => {
        const profile = customer.profile || {};
        const name = profile.full_name || customer.name || "Client";
        const email = profile.email || "";
        const subscribed = profile.marketing_opt_in === true;
        const assignedAdminId = customer.assigned_admin_id || "";
        const customerId = String(customer.id || "");
        const assignmentCell = isGeneralAdmin()
          ? (customerId.startsWith("profile:")
            ? '<td><span class="small-note">Pas encore de fiche client</span></td>'
            : '<td><select class="input" aria-label="Attribuer le client" onchange="setCustomerAssigned(\'' + esc(customerId) + '\',this.value)"><option value="">Non attribué</option>' +
              assignableAdmins.map(a => '<option value="' + esc(a.id) + '"' + (assignedAdminId === a.id ? ' selected' : '') + '>' + esc(a.full_name || a.email || "Administrateur") + '</option>').join("") +
              '</select></td>')
          : "";
        return '<tr><td><strong>' + esc(name) + '</strong><br><span class="small-note">' + esc(email || "E-mail non renseigné") + '</span></td>' +
          '<td>' + esc(profile.phone || customer.phone || "—") + (profile.phone_secondary ? '<br><span class="small-note">Secondaire : ' + esc(profile.phone_secondary) + '</span>' : '') + '</td>' +
          '<td>' + esc([profile.delivery_commune, profile.delivery_neighborhood].filter(Boolean).join(" · ") || customer.zone || "—") + '</td>' +
          '<td>' + Number(customer.orders_count || 0) + '</td><td>' + esc(fmtDate(customer.last_order_at)) + '</td>' +
          '<td><span class="status ' + (subscribed ? 'delivered' : 'cancelled') + '">' + (subscribed ? 'Abonné' : 'Non abonné') + '</span></td>' +
          assignmentCell +
          '<td><button class="btn small secondary" type="button" onclick="showCustomerProfile(\'' + esc(customer.list_id) + '\')">Fiche client</button></td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="empty">Aucun client enregistré pour le moment.</div>';
    return '<div class="panel admin-customers-intro"><div class="admin-panel-head"><h3>Clients et fiches clients (' + enriched.length + ')</h3><span class="small-note">' + subscribedCount + ' compte(s) autorisent les e-mails commerciaux.</span></div><p class="small-note">Les comptes clients inscrits et les clients historiques sont listés. Ouvre une fiche pour consulter les coordonnées, les commandes, les paiements, les devis et les rappels, puis contacter le client sur WhatsApp.</p>' + tableHtml + '</div>';
  }

  async function setCustomerAssigned(customerId, assignedAdminId) {
    if (!isGeneralAdmin()) return toast("Seul le propriétaire peut attribuer les clients.", true);
    if (!customerId || String(customerId).startsWith("profile:")) return toast("Cette fiche ne possède pas encore d’enregistrement client modifiable.", true);
    const { error } = await client.from("customers").update({
      assigned_admin_id: assignedAdminId || null,
      updated_at: new Date().toISOString()
    }).eq("id", customerId);
    if (error) return toast(errorMessage(error), true);
    toast(assignedAdminId ? "Client attribué à l’associé." : "Attribution du client retirée.");
    await showAdminView("customers");
  }
  window.setCustomerAssigned = setCustomerAssigned;

  async function showCustomerProfile(customerId) {
    if (!isAdmin()) return toast("Accès réservé aux administrateurs.", true);
    if (!customerId) return toast("Référence client manquante.", true);
    const profileReference = String(customerId).startsWith("profile:");
    const requestedProfileId = profileReference ? String(customerId).slice("profile:".length) : null;
    let customer = null;
    let profile = null;
    if (profileReference) {
      const result = await client.from("profiles")
        .select("id,full_name,email,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,delivery_landmark,delivery_instructions,role,created_at,avatar_path,marketing_opt_in")
        .eq("id", requestedProfileId).eq("role", "customer").maybeSingle();
      if (result.error || !result.data) return toast(errorMessage(result.error || new Error("Client introuvable.")), true);
      profile = result.data;
      customer = {
        id: "profile:" + profile.id,
        user_id: profile.id,
        name: profile.full_name || "Client SAMA-PACK",
        phone: profile.phone || "",
        address: profile.delivery_address || "",
        zone: [profile.delivery_region, profile.delivery_city, profile.delivery_commune, profile.delivery_neighborhood].filter(Boolean).join(", "),
        orders_count: 0,
        last_order_at: null,
        created_at: profile.created_at,
        updated_at: profile.created_at,
      };
    } else {
      const { data, error } = await client.from("customers")
        .select("id,name,phone,address,zone,orders_count,last_order_at,created_at,updated_at,user_id")
        .eq("id", customerId).maybeSingle();
      if (error || !data) return toast(errorMessage(error || new Error("Client introuvable.")), true);
      customer = data;
    }

    const orderColumns = "id,customer_id,user_id,created_at,status,slot,payment,subtotal,delivery,total,customer_name,customer_phone,delivery_address,delivery_zone,payment_choice,payment_status,amount_paid,updated_at,delivery_cost_actual";
    let orderQuery = client.from("orders").select(orderColumns);
    orderQuery = profileReference
      ? orderQuery.eq("user_id", requestedProfileId)
      : orderQuery.eq("customer_id", customerId);
    const primaryOrderResult = await orderQuery.order("created_at", { ascending: false }).limit(100);
    if (primaryOrderResult.error) return toast(errorMessage(primaryOrderResult.error), true);
    let linkedProfileId = customer.user_id || (primaryOrderResult.data || []).find(order => order.user_id)?.user_id || null;
    if (!requestedProfileId && !linkedProfileId) {
      const normalizedPhone = normalizeCustomerWhatsapp(customer.phone);
      if (normalizedPhone) {
        const phoneProfileResult = await client.from("profiles").select("id")
          .eq("role", "customer").eq("phone", normalizedPhone).limit(2);
        if (!phoneProfileResult.error && phoneProfileResult.data?.length === 1) linkedProfileId = phoneProfileResult.data[0].id;
      }
    }
    const profileId = requestedProfileId || linkedProfileId;

    let quotes = [], subscriptions = [], reviews = [], userOrders = [], notifications = [], businessAccount = null;
    if (profileId) {
      const [profileResult, linkedOrdersResult, quotesResult, subscriptionsResult, reviewsResult, notificationResult, businessResult] = await Promise.all([
        client.from("profiles").select("id,full_name,email,phone,phone_secondary,delivery_region,delivery_city,delivery_commune,delivery_neighborhood,delivery_address,delivery_landmark,delivery_instructions,role,created_at,avatar_path,marketing_opt_in").eq("id", profileId).maybeSingle(),
        client.from("orders").select(orderColumns).eq("user_id", profileId).order("created_at", { ascending: false }).limit(100),
        client.from("quotes").select("id,company,phone,email,need,message,status,created_at").eq("user_id", profileId).order("created_at", { ascending: false }).limit(30),
        client.from("replenishment_subscriptions").select("id,label,frequency,next_reminder_at,status,created_at").eq("user_id", profileId).order("next_reminder_at", { ascending: true }).limit(30),
        client.from("product_reviews").select("id,product_id,rating,review,display_name,created_at").eq("user_id", profileId).order("created_at", { ascending: false }).limit(30),
        client.from("notifications").select("id,type,title,message,entity_type,entity_id,read_at,created_at").eq("recipient_user_id", profileId).order("created_at", { ascending: false }).limit(40),
        client.from("business_accounts").select("id,company_name,sector,contact_name,phone,email,address,delivery_zone,created_at,updated_at").eq("owner_user_id", profileId).maybeSingle()
      ]);
      if (profileResult.error) console.warn("Fiche profil client partielle", profileResult.error);
      else profile = profileResult.data || null;
      if (linkedOrdersResult.error) console.warn("Historique par compte indisponible", linkedOrdersResult.error);
      else userOrders = linkedOrdersResult.data || [];
      quotes = quotesResult.error ? [] : (quotesResult.data || []);
      subscriptions = subscriptionsResult.error ? [] : (subscriptionsResult.data || []);
      reviews = reviewsResult.error ? [] : (reviewsResult.data || []);
      notifications = notificationResult.error ? [] : (notificationResult.data || []);
      businessAccount = businessResult.error ? null : (businessResult.data || null);
    } else {
      const quoteResult = await client.from("quotes").select("id,company,phone,email,need,message,status,created_at")
        .eq("phone", customer.phone).order("created_at", { ascending: false }).limit(20);
      quotes = quoteResult.error ? [] : (quoteResult.data || []);
    }

    const orderMap = new Map();
    [...(primaryOrderResult.data || []), ...userOrders].forEach(order => orderMap.set(order.id, order));
    const orders = [...orderMap.values()].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
    const orderIds = orders.map(order => order.id);
    let orderItems = [];
    if (orderIds.length) {
      const itemResult = await client.from("order_items")
        .select("id,order_id,product_id,product_name,quantity,unit_price")
        .in("order_id", orderIds);
      if (itemResult.error) console.warn("Lignes de commande client indisponibles", itemResult.error);
      else orderItems = itemResult.data || [];
    }

    let avatarUrl = "";
    if (profile?.avatar_path) {
      const { data: signed, error } = await client.storage.from("sama-pack-avatars").createSignedUrl(profile.avatar_path, 60 * 60);
      if (!error) avatarUrl = signed?.signedUrl || "";
    }

    cachedOrders = orders;
    cachedOrderItems = orderItems;
    cachedCustomers = [customer];
    const orderItemsById = new Map();
    orderItems.forEach(item => {
      if (!orderItemsById.has(item.order_id)) orderItemsById.set(item.order_id, []);
      orderItemsById.get(item.order_id).push(item);
    });
    const name = profile?.full_name || customer.name || "Client";
    const phone = profile?.phone || customer.phone || "";
    const secondaryPhone = profile?.phone_secondary || "";
    const email = profile?.email || quotes.find(quote => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(quote.email || "")))?.email || "";
    const zone = [profile?.delivery_region, profile?.delivery_city, profile?.delivery_commune, profile?.delivery_neighborhood].filter(Boolean).join(" · ") || customer.zone || "";
    const address = [profile?.delivery_address || customer.address, profile?.delivery_landmark ? "Repère : " + profile.delivery_landmark : "", profile?.delivery_instructions ? "Instructions : " + profile.delivery_instructions : ""].filter(Boolean).join(" · ");
    const whatsapp = normalizeCustomerWhatsapp(phone);
    const whatsappHref = /^[1-9]\d{7,14}$/.test(whatsapp) ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Bonjour " + name + ", je vous contacte depuis SAMA-PACK au sujet de vos commandes et de vos besoins en produits de nettoyage et d’hygiène.") : "";
    const nonCancelled = orders.filter(order => order.status !== "cancelled");
    const totalOrders = Math.max(Number(customer.orders_count || 0), orders.length);
    const totalValue = nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const paidValue = nonCancelled.reduce((sum, order) => sum + Number(order.amount_paid || 0), 0);
    const balanceValue = nonCancelled.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0)), 0);
    const deliveredCount = orders.filter(order => order.status === "delivered").length;
    const identityMarkup = avatarUrl
      ? '<img src="' + esc(avatarUrl) + '" alt="" class="customer-detail-avatar-image">'
      : '<span class="customer-detail-avatar-fallback">' + esc(name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part => part.charAt(0)).join("").toUpperCase() || "CL") + '</span>';
    const orderMarkup = orders.length ? orders.map(order => {
      const lines = orderItemsById.get(order.id) || [];
      const itemsMarkup = lines.length
        ? '<ul class="customer-order-items">' + lines.map(item => '<li>' + Number(item.quantity) + ' × ' + esc(item.product_name) + ' — ' + money(item.unit_price) + '</li>').join("") + '</ul>'
        : '<p class="small-note">Détail des articles indisponible pour cette commande.</p>';
      const balance = Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0));
      return '<article class="customer-history-order"><div class="customer-history-order-head"><div><strong>' + esc(order.id) + '</strong><span class="small-note">' + esc(fmtDate(order.created_at)) + '</span></div><span class="status ' + esc(order.status) + '">' + esc(statusLabel(order.status)) + '</span><strong>' + money(order.total) + '</strong></div>' +
        itemsMarkup +
        '<div class="customer-history-order-meta"><span>Mode : ' + esc(order.payment_choice || order.payment || "—") + '</span><span>Paiement : ' + esc(paymentStatusLabel(order.payment_status)) + '</span><span>Encaissé : ' + money(order.amount_paid || 0) + '</span><span>Solde : ' + money(balance) + '</span></div>' +
        (order.slot ? '<p class="small-note">Créneau : ' + esc(order.slot) + '</p>' : '') +
        ((order.delivery_address || order.delivery_zone) ? '<p class="small-note">Livraison : ' + esc([order.delivery_address, order.delivery_zone].filter(Boolean).join(" · ")) + '</p>' : '') +
        '<button class="btn ghost small" type="button" onclick="showOrder(\'' + esc(order.id) + '\')">Voir le détail de la commande</button></article>';
    }).join("") : '<div class="empty">Aucune commande liée à cette fiche.</div>';
    const quoteMarkup = quotes.length ? '<div class="customer-detail-list">' + quotes.map(quote => '<article class="customer-detail-list-item"><strong>' + esc(quote.company || "Demande de devis") + '</strong><span class="status ' + esc(quote.status) + '">' + esc(statusLabel(quote.status)) + '</span><p>' + esc(quote.need || "") + '</p><small>' + esc(fmtDate(quote.created_at)) + (quote.email ? " · " + esc(quote.email) : "") + '</small></article>').join("") + '</div>' : '<p class="small-note">Aucune demande de devis liée à ce compte.</p>';
    const subscriptionMarkup = subscriptions.length ? '<div class="customer-detail-list">' + subscriptions.map(item => '<article class="customer-detail-list-item"><strong>' + esc(item.label) + '</strong><span class="status ' + (item.status === "active" ? "delivered" : "processing") + '">' + esc(item.status === "active" ? "Actif" : item.status) + '</span><p>' + esc(frequencyLabel(item.frequency)) + ' · prochaine échéance : ' + esc(fmtDate(item.next_reminder_at)) + '</p></article>').join("") + '</div>' : '<p class="small-note">Aucun rappel de réapprovisionnement programmé.</p>';
    const reviewsMarkup = reviews.length ? '<div class="customer-detail-list">' + reviews.map(review => '<article class="customer-detail-list-item"><strong>' + esc(getP(String(review.product_id))?.name || String(review.product_id)) + ' · ' + Number(review.rating) + '/5</strong><p>' + esc(review.review || "") + '</p><small>' + esc(fmtDate(review.created_at)) + '</small></article>').join("") + '</div>' : '<p class="small-note">Aucun avis produit publié par ce client.</p>';
    const businessMarkup = businessAccount
      ? '<div class="customer-detail-info-grid"><div><span>Structure</span><strong>' + esc(businessAccount.company_name || "—") + '</strong></div><div><span>Secteur</span><strong>' + esc(businessAccount.sector || "—") + '</strong></div><div><span>Contact structure</span><strong>' + esc(businessAccount.contact_name || "—") + '</strong></div><div><span>Téléphone professionnel</span><strong>' + esc(businessAccount.phone || "—") + '</strong></div><div><span>E-mail professionnel</span><strong>' + esc(businessAccount.email || "—") + '</strong></div><div class="customer-detail-info-full"><span>Adresse / zone de livraison</span><strong>' + esc([businessAccount.address, businessAccount.delivery_zone].filter(Boolean).join(" · ") || "—") + '</strong></div></div>'
      : '<p class="small-note">Aucun compte professionnel associé à ce client.</p>';
    const notificationMarkup = notifications.length
      ? '<div class="customer-detail-list">' + notifications.map(note => '<article class="customer-detail-list-item"><strong>' + esc(note.title || note.type || "Notification") + '</strong><span class="status ' + (note.read_at ? "" : "processing") + '">' + (note.read_at ? "Lue" : "Non lue") + '</span><p>' + esc(note.message || "") + '</p><small>' + esc(fmtDate(note.created_at)) + (note.entity_id ? " · " + esc(note.entity_id) : "") + '</small></article>').join("") + '</div>'
      : '<p class="small-note">Aucune notification conservée pour ce compte.</p>';
    showModal(
      '<div class="modal-head customer-detail-modal-head"><div><div class="eyebrow">CRM · DOSSIER CLIENT</div><h2>Fiche client</h2><p class="small-note">Informations et historique consolidés depuis SAMA-PACK.</p></div><button class="close" type="button" onclick="closeModal()" aria-label="Fermer">✕</button></div>' +
      '<section class="customer-detail-identity">' + identityMarkup + '<div class="customer-detail-identity-copy"><span class="customer-detail-kicker">' + esc(profile?.role === "customer" ? "Compte client" : "Fiche client") + '</span><h3>' + esc(name) + '</h3><p>' + esc(email || "Adresse e-mail non renseignée") + '</p><small>Client depuis ' + esc(fmtDate(customer.created_at)) + '</small></div></section>' +
      '<div class="customer-detail-contact-actions">' + (whatsappHref ? '<a class="btn primary" href="' + esc(whatsappHref) + '" target="_blank" rel="noopener noreferrer">Discuter avec lui sur WhatsApp</a>' : '<span class="small-note">Numéro WhatsApp non valide ou non renseigné.</span>') + (email ? '<a class="btn ghost" href="mailto:' + esc(email) + '">Envoyer un e-mail</a>' : '') + '</div>' +
      '<section class="customer-detail-stats"><article><span>Commandes</span><strong>' + totalOrders + '</strong></article><article><span>Livrées</span><strong>' + deliveredCount + '</strong></article><article><span>Valeur des commandes non annulées</span><strong>' + money(totalValue) + '</strong></article><article><span>Montant encaissé</span><strong>' + money(paidValue) + '</strong></article><article><span>Solde restant estimé</span><strong>' + money(balanceValue) + '</strong></article><article><span>Dernière commande</span><strong>' + esc(fmtDate(customer.last_order_at) || "—") + '</strong></article></section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Coordonnées et livraison</h3></div><div class="customer-detail-info-grid">' +
      '<div><span>WhatsApp principal</span><strong>' + esc(phone || "Non renseigné") + '</strong></div><div><span>Téléphone secondaire</span><strong>' + esc(secondaryPhone || "Non renseigné") + '</strong></div>' +
      '<div><span>Zone</span><strong>' + esc(zone || "Non renseignée") + '</strong></div><div class="customer-detail-info-full"><span>Adresse précise</span><strong>' + esc(address || "Non renseignée") + '</strong></div>' +
      '<div><span>E-mails commerciaux</span><strong>' + (profile?.marketing_opt_in ? 'Consentement actif' : 'Non activés') + '</strong></div><div><span>Compte créé</span><strong>' + esc(fmtDate(profile?.created_at || customer.created_at)) + '</strong></div></div></section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Historique des commandes</h3><span>' + orders.length + ' affichée(s), jusqu’à 100</span></div>' + orderMarkup + '</section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Devis professionnels</h3></div>' + quoteMarkup + '</section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Rappels de réapprovisionnement</h3></div>' + subscriptionMarkup + '</section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Compte professionnel</h3></div>' + businessMarkup + '</section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Notifications du compte</h3><span>' + notifications.length + ' récente(s)</span></div>' + notificationMarkup + '</section>' +
      '<section class="customer-detail-section"><div class="customer-detail-section-heading"><h3>Avis publiés</h3></div>' + reviewsMarkup + '</section>'
    );
    const modalCard = document.querySelector(".modal-card");
    if (modalCard) modalCard.classList.add("admin-customer-detail-modal");
  }

  async function adminStock() {
    const stockResult = await client.from("stock").select("product_id,quantity,min_quantity,updated_at");
    if (stockResult.error) throw stockResult.error;
    const productResult = await client.from("products").select("id,public_ref,name,category,catalog_type,price,active,availability_status").order("name",{ascending:true});
    if (productResult.error) throw productResult.error;
    let links = [], suppliers = [], stockCosts = new Map(), stockSuppliers = new Map();
    if (isGeneralAdmin()) {
      const [linkResult,supplierResult,costResult] = await Promise.all([
        client.from("product_supplier_links").select("product_id,supplier_id,supplier_ref"),
        client.from("suppliers").select("id,name").order("name",{ascending:true}),
        client.rpc("sama_get_stock_procurement")
      ]);
      if (linkResult.error) throw linkResult.error;
      if (supplierResult.error) throw supplierResult.error;
      if (costResult.error) throw costResult.error;
      links = linkResult.data || [];
      suppliers = supplierResult.data || [];
      stockCosts = new Map((costResult.data || []).map(row => [row.product_id, Number(row.unit_cost || 0)]));
      stockSuppliers = new Map((costResult.data || []).map(row => [row.product_id, String(row.supplier || "")]));
    }
    const rows = (stockResult.data || []).map(row => isGeneralAdmin()
      ? { ...row, unit_cost: Number(stockCosts.get(row.product_id) || 0), supplier: stockSuppliers.get(row.product_id) || "" }
      : row);
    stockRows = rows;
    products = (productResult.data || []).map(normalizeProduct);
    const supplierById = new Map(suppliers.map(s => [s.id,s]));
    const linkByProduct = new Map(links.map(link => [link.product_id,{...link,supplier_name:supplierById.get(link.supplier_id)?.name || ""}]));
    const currentProducts = products.slice().sort((a,b) => String(a.name).localeCompare(String(b.name),"fr"));
    const tableRows = currentProducts.map(p => {
      const s = rows.find(x => x.product_id === p.id) || {quantity:0,min_quantity:0,supplier:""};
      const link = linkByProduct.get(p.id) || {};
      const supplierLabel = isGeneralAdmin()
        ? esc(link.supplier_name || s.supplier || "—") + (link.supplier_ref ? '<br><span class="small-note">Réf. ' + esc(link.supplier_ref) + '</span>' : "")
        : '<span class="small-note">Réservé au propriétaire</span>';
      const unitCost = Number(stockCosts.get(p.id) || 0);
      const stockCostCell = isGeneralAdmin()
        ? '<td><input class="input stock-field" type="number" min="0" step="0.01" aria-label="Coût unitaire du stock" data-stock-id="' + esc(p.id) + '" data-stock-key="unit_cost" value="' + unitCost + '"><br><span class="small-note">Valeur : ' + money(Number(s.quantity || 0) * unitCost) + '</span></td>'
        : "";
      const searchText = [p.public_ref,p.id,p.name,p.category,link.supplier_name,link.supplier_ref,s.supplier].join(" ").toLowerCase();
      return '<tr data-stock-search-row data-search="' + esc(searchText) + '">' +
        '<td><strong>' + esc(p.public_ref || p.id) + '</strong><br>' + esc(p.name) + '<br><span class="small-note">' + esc(p.category || p.cat || "") + '</span></td>' +
        '<td>' + supplierLabel + '</td>' + stockCostCell +
        '<td><input class="input stock-field" type="number" min="0" step="1" aria-label="Quantité en stock" data-stock-id="' + esc(p.id) + '" data-stock-key="quantity" ' + (!isGeneralAdmin() && !hasAdminPermission("stock.update") ? "disabled" : "") + ' value="' + Number(s.quantity||0) + '"></td>' +
        '<td><input class="input stock-field" type="number" min="0" step="1" aria-label="Seuil d’alerte" data-stock-id="' + esc(p.id) + '" data-stock-key="min_quantity" ' + (!isGeneralAdmin() && !hasAdminPermission("stock.update") ? "disabled" : "") + ' value="' + Number(s.min_quantity||0) + '"></td>' +
        '<td><select class="input stock-field" aria-label="Disponibilité au catalogue" data-stock-id="' + esc(p.id) + '" data-stock-key="availability_status" ' + (!isGeneralAdmin() && !hasAdminPermission("stock.update") ? "disabled" : "") + '><option value="available" ' + (p.availability_status !== "out_of_stock" ? "selected" : "") + '>Disponible</option><option value="out_of_stock" ' + (p.availability_status === "out_of_stock" ? "selected" : "") + '>Rupture de stock</option></select><div>' + availabilityBadgeHtml(p) + '</div></td>' +
        '</tr>';
    }).join("");
    return '<div class="panel"><div class="admin-panel-head"><h3>Stock, réception et réapprovisionnement</h3><span class="small-note">Les coûts d’achat sont confidentiels et ne sont pas exposés dans ce module. Une quantité positive ne modifie pas le prix de vente.</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Référence / article</th><th>Fournisseur associé / réf.</th>' + (isGeneralAdmin() ? '<th>Coût d’achat / valeur</th>' : '') + '<th>Quantité</th><th>Seuil</th><th>Disponibilité catalogue</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
      '<p class="small-note">Les changements sont enregistrés à la sortie du champ. Les prix fournisseur et les marges restent accessibles uniquement au propriétaire.</p></div>';
  }


  function nextProductId() {
    let max = 0; for (const p of products) { const m = /^SP(\d+)$/i.exec(p.id); if (m) max = Math.max(max, Number(m[1])); }
    return "SP" + String(max + 1).padStart(2, "0");
  }
  async function adminPacks() {
    const baseRows = await readRows("products");
    if (!isGeneralAdmin()) {
      const rows = baseRows.filter(p => p.catalog_type === "pack" && p.active === true);
      return '<div class="panel"><div class="admin-panel-head"><h3>Packs publiés</h3><span class="small-note">Consultation uniquement. Les prix, promotions, coûts et publications sont réservés au propriétaire.</span></div>' +
        (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Pack</th><th>Prix affiché</th><th>Disponibilité</th></tr></thead><tbody>' +
          rows.map(p => '<tr><td>' + esc(p.public_ref || p.id) + '</td><td><strong>' + esc(p.name) + '</strong><br><span class="small-note">' + esc(p.category || "") + '</span></td><td>' + money(p.price) + '</td><td>' + availabilityBadgeHtml(p) + '</td></tr>').join("") +
          '</tbody></table></div>' : '<div class="empty">Aucun pack publié.</div>') + '</div>';
    }
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
    return `<div class="panel"><div class="admin-panel-head"><h3>${formTitle}</h3><span class="small-note">ID interne : ${esc(idLabel)} · Réf. publique : ${esc(editing?.public_ref || "attribuée automatiquement")}</span></div><form id="packForm" class="admin-form"><label class="full">Référence publique SAMA-PACK<input class="input" readonly value="${esc(editing?.public_ref || "Attribuée automatiquement à l’enregistrement")}"></label><label class="full">Nom du pack<input class="input" name="name" required maxlength="150" placeholder="Nom du pack" value="${esc(editing?.name||"")}"></label><label>Catégorie<input class="input" name="category" required maxlength="80" placeholder="Catégorie" value="${esc(editing?.cat||"")}"></label><label>Fournisseur associé<select class="input" name="supplier_id">${supplierOptions}</select></label><label>Référence chez le fournisseur<input class="input" name="supplier_ref" maxlength="100" placeholder="Réf. fournisseur (facultatif)" value="${esc(editing?.supplier_ref||"")}"></label><label>Coût d’achat total du pack (FCFA HT)<input class="input" name="supplier_price" type="number" min="0" step="0.01" placeholder="Coût de revient du pack" value="${editing?.supplier_price == null ? "" : Number(editing.supplier_price)}"></label><label>Marge souhaitée / majoration (%)<input class="input" name="margin_percent" type="number" min="0" max="1000" step="0.1" placeholder="Ex. 30" value="${editing?.margin_percent == null ? "" : Number(editing.margin_percent)}"></label><label>Prix du colis fournisseur (FCFA HT)<input class="input" name="supplier_carton_price" type="number" min="0" step="0.01" value="${editing?.carton_price == null ? "" : Number(editing.carton_price)}" placeholder="Optionnel"></label><label>Unités / lots par colis<input class="input" name="supplier_units_per_carton" maxlength="80" value="${esc(editing?.units_per_carton||"")}" placeholder="Ex. 12 pièces / colis"></label><label>Prix de vente calculé (FCFA)<input class="input selling-price-input" name="price" type="number" min="0" step="1" required placeholder="Prix en FCFA" value="${editing ? Number(editing.price) : ""}" ${editing?.supplier_price != null && editing?.margin_percent != null ? "readonly" : ""}></label><label>Disponibilité<select class="input" name="availability_status"><option value="available" ${(editing?.availability_status || "out_of_stock") === "available" ? "selected" : ""}>Disponible</option><option value="out_of_stock" ${(editing?.availability_status || "out_of_stock") === "out_of_stock" ? "selected" : ""}>Rupture de stock</option></select></label><p class="small-note price-calculation-feedback full" data-pricing-feedback>Renseigne le coût d’achat et la marge souhaitée pour calculer le prix de vente automatiquement.</p><textarea class="input full" name="description" required maxlength="1500" placeholder="Description du pack">${esc(editing?.desc||"")}</textarea><textarea class="input full" name="items" required placeholder="Composition : un élément par ligne">${esc(itemsStr)}</textarea><input class="input full" name="image_path" maxlength="500" placeholder="Chemin de l’image ou URL (facultatif)" value="${esc(editing?.image_path||"")}"><div class="promo-admin-fields full"><label class="check-label"><input type="checkbox" name="promo_active" ${editing?.promo_active===true && (!editing?.promo_end_at || (Number.isFinite(new Date(editing.promo_end_at).getTime()) && new Date(editing.promo_end_at).getTime() > Date.now())) ? "checked" : ""}> Afficher ce pack dans les promotions</label><label>Prix promotionnel (FCFA)<input class="input" name="promo_price" type="number" min="0" step="1" placeholder="Ex. 12 000" value="${editing?.promo_price == null ? "" : Number(editing.promo_price)}"></label><label>Texte de la promotion<input class="input" name="promo_label" maxlength="80" placeholder="Vente flash" value="${esc(editing?.promo_label||"Vente flash")}"></label><label class="full">Date et heure de fin de la vente flash<input class="input" type="datetime-local" name="promo_end_at" value="${esc(toLocalDateTimeInput(editing?.promo_end_at))}"></label><p class="small-note">Le prix promotionnel doit être inférieur au prix normal. La date de fin désactive la réduction à son échéance.</p></div><p class="small-note full">Photos actuellement enregistrées : ${getProductImages(editing || {}).length}. Jusqu’à 8 photos par pack.</p><label class="full">Photos du pack (JPG, PNG ou WebP · 5 Mo maximum par photo)<input class="input" name="image_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label class="check-label full"><input type="checkbox" name="replace_images"> Remplacer les photos actuelles par les nouvelles (ou les supprimer si aucune photo n’est choisie)</label><label class="check-label full"><input type="checkbox" name="active" ${editing?.active===true?"checked":""}> Publier ce pack dans le catalogue</label><div class="form-actions full"><button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Créer le pack masqué"}</button>${editing ? `<button class="btn ghost" type="button" onclick="cancelPackEdit()">Annuler</button>` : ""}</div></form></div><div style="height:16px"></div><div class="panel"><div class="admin-panel-head"><h3>Catalogue complet (${rows.filter(p=>p.catalog_type === "pack").length} packs)</h3><span class="small-note">Les packs masqués restent dans la gestion et le stock.</span></div>${tableHtml}</div>`;
  }

  function editPack(id) { editingProductId = id; showAdminView("packs"); }
  function cancelPackEdit() { editingProductId = null; showAdminView("packs"); }
  async function togglePack(id, active) {
    const product = getP(id);
    if (active && (!product || Number(product.price) <= 0)) return toast("Renseigne un prix de vente supérieur à zéro avant la publication.", true);
    if (active && !getProductImages(product).length) return toast("Ajoute au moins une photo à ce pack avant de le publier.", true);
    const { error } = await client.from("products").update({ active }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(active ? "Pack publié dans le catalogue." : "Pack masqué du catalogue."); await loadPublicData(); await showAdminView("packs");
  }
  const ASSOCIATE_PERMISSION_OPTIONS = [
    ["dashboard.view", "Tableau de bord", "Consulter les indicateurs liés aux dossiers attribués."],
    ["orders.view", "Commandes attribuées", "Consulter les commandes associées à ce compte."],
    ["orders.update_status", "Étapes de commande", "Mettre à jour le statut des commandes attribuées."],
    ["customers.view", "Fiches clients attribuées", "Consulter les fiches liées à sa clientèle."],
    ["prospects.view", "Voir ses prospects", "Consulter les prospects créés par ce compte."],
    ["prospects.create", "Créer des prospects", "Ajouter de nouveaux prospects à son portefeuille."],
    ["prospects.update", "Modifier ses prospects", "Modifier les fiches prospects dont il est responsable."],
    ["prospects.delete", "Supprimer ses prospects", "Supprimer uniquement ses propres prospects."],
    ["quotes.view", "Devis attribués", "Consulter les devis attribués à ce compte."],
    ["quotes.update_status", "Statut des devis", "Mettre à jour le suivi de ses devis."],
    ["sales_codes.view", "Code commercial personnel", "Consulter son propre code et ses résultats attribués."],
    ["sales_codes.manage_own", "Gérer son code personnel", "Créer ou suspendre son code, sans gérer ceux des autres."],
    ["catalog.view", "Consultation du catalogue", "Voir les articles publiés sans coûts d'achat ni publication."],
    ["stock.view", "Consulter le stock", "Voir les quantités et seuils de réapprovisionnement."],
    ["stock.update", "Modifier les quantités", "Mettre à jour les quantités et disponibilités, sans toucher aux prix."],
    ["expenses.submit", "Soumettre des dépenses", "Déclarer des dépenses en attente de validation par le propriétaire."]
  ];

  async function showAdminPermissionsEditor(id) {
    if (!isGeneralAdmin()) return toast("Seul le propriétaire peut modifier les permissions.", true);
    const result = await client.from("profiles")
      .select("id,full_name,email,role,is_super_admin,admin_permissions")
      .eq("id", id).eq("role", "admin").maybeSingle();
    if (result.error || !result.data || result.data.is_super_admin) return toast("Compte administrateur introuvable ou protégé.", true);
    const target = result.data;
    const current = target.admin_permissions || {};
    const fields = ASSOCIATE_PERMISSION_OPTIONS.map(function(item) {
      const key = item[0], label = item[1], description = item[2];
      return '<label class="permission-option"><span class="permission-option-copy"><strong>' + esc(label) +
        '</strong><small>' + esc(description) + '</small></span><input type="checkbox" name="permission" value="' +
        esc(key) + '"' + (current[key] === true ? ' checked' : '') + '></label>';
    }).join("");
    showModal(
      '<div class="modal-head"><div><div class="eyebrow">GESTION DES ACCÈS</div><h2>Permissions de ' +
      esc(target.full_name || target.email || "l’administrateur") +
      '</h2><p class="small-note">Les paramètres globaux, les coûts fournisseurs, la rentabilité complète, le journal d’audit et les autres comptes restent réservés au propriétaire.</p></div>' +
      '<button class="close" type="button" onclick="closeModal()" aria-label="Fermer">✕</button></div>' +
      '<form id="adminPermissionsForm"><div class="permission-option-list">' + fields +
      '</div><div class="form-actions"><button class="btn primary" type="submit">Enregistrer les permissions</button>' +
      '<button class="btn ghost" type="button" onclick="closeModal()">Annuler</button></div></form>'
    );
    const form = $("adminPermissionsForm");
    if (!form) return;
    form.onsubmit = async function(event) {
      event.preventDefault();
      setBusy(form, true, "Enregistrement…");
      const permissions = {};
      form.querySelectorAll('input[name="permission"]').forEach(function(input) {
        permissions[input.value] = input.checked;
      });
      try {
        const result = await client.rpc("sama_update_admin_permissions", {
          p_target_user_id: id,
          p_permissions: permissions
        });
        if (result.error || result.data?.ok !== true) throw result.error || new Error(result.data?.message || "Les permissions n’ont pas pu être enregistrées.");
        closeModal();
        toast("Permissions de l’administrateur mises à jour.");
        await showAdminView("admins");
      } catch (error) {
        toast(errorMessage(error), true);
      } finally {
        if (form.isConnected) setBusy(form, false);
      }
    };
  }
  window.showAdminPermissionsEditor = showAdminPermissionsEditor;

  async function adminAccounts() {
    const { data, error } = await client.from("profiles")
      .select("id,full_name,phone,email,role,is_super_admin,admin_permissions,invited_by,created_at")
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
      return `<tr><td><strong>${esc(a.full_name || "Sans nom")}</strong><br><span class="small-note">${general ? "Propriétaire de l’espace" : "Compte administrateur"}</span></td><td>${esc(a.email || "—")}<br><span class="small-note">${esc(a.phone || "")}</span></td><td><span class="status ${general ? "delivered" : "processing"}">${general ? "Administrateur général" : "Administrateur"}</span></td><td>${general ? "—" : esc(inviterLabels[a.invited_by] || (a.invited_by ? "Administrateur général" : "Ancien compte"))}</td><td>${esc(fmtDate(a.created_at))}</td>${isGeneralAdmin ? `<td>${canRemove ? `<button class="btn small secondary" onclick="showAdminPermissionsEditor('${esc(a.id)}')">Permissions</button><button class="btn small danger" onclick="removeAdmin('${esc(a.id)}')">Retirer les droits</button>` : `<span class="small-note">${general ? "Compte protégé" : "Ton compte"}</span>`}</td>` : ""}</tr>`;
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
    const rows = await readRows("expenses");
    cachedExpenses = rows;
    const approved = rows.filter(row => row.approval_status === "approved");
    const pending = rows.filter(row => row.approval_status === "pending");
    const totalApproved = approved.reduce((sum,row) => sum + Number(row.amount || 0),0);
    const statusLabel = row => row.approval_status === "approved" ? "Validée" : row.approval_status === "rejected" ? "Refusée" : "En attente";
    const statusCss = row => row.approval_status === "approved" ? "delivered" : row.approval_status === "rejected" ? "cancelled" : "processing";
    const table = rows.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Dépense</th><th>Catégorie</th><th>Montant</th><th>Statut</th>' + (isGeneralAdmin() ? '<th>Actions</th>' : '') + '</tr></thead><tbody>' +
        rows.slice().sort((a,b) => new Date(b.expense_date)-new Date(a.expense_date)).map(row =>
          '<tr><td>' + esc(row.expense_date) + '</td><td><strong>' + esc(row.label) + '</strong></td><td>' + esc(row.category || "") + '</td><td>' + money(row.amount) + '</td><td><span class="status ' + statusCss(row) + '">' + statusLabel(row) + '</span></td>' +
          (isGeneralAdmin() ? '<td>' + (row.approval_status === "pending" ? '<div class="table-actions"><button class="btn small primary" onclick="setExpenseApproval(\'' + esc(row.id) + '\',\'approved\')">Valider</button><button class="btn small danger" onclick="setExpenseApproval(\'' + esc(row.id) + '\',\'rejected\')">Refuser</button></div>' : '<span class="small-note">' + esc(row.approved_by ? "Traitement effectué" : "—") + '</span>') + '</td>' : '') +
          '</tr>'
        ).join("") + '</tbody></table></div>'
      : '<div class="empty">' + (isGeneralAdmin() ? "Aucune dépense enregistrée." : "Tu n’as soumis aucune dépense.") + '</div>';
    return '<div class="panel"><h3>Soumettre une dépense</h3><p class="small-note">' +
      (isGeneralAdmin() ? "Les dépenses saisies par le propriétaire sont validées immédiatement. Les demandes des associés doivent être approuvées ici." : "Tes dépenses sont soumises au propriétaire et restent en attente jusqu’à sa validation.") +
      '</p><form id="expenseForm" class="admin-form"><input class="input" name="label" required maxlength="200" placeholder="Libellé"><input class="input" type="number" min="0" step="1" name="amount" required placeholder="Montant FCFA"><input class="input" name="category" placeholder="Catégorie"><input class="input" type="date" name="date" value="' + new Date().toISOString().slice(0,10) + '"><button class="btn primary full" type="submit">Soumettre la dépense</button></form></div>' +
      '<div style="height:16px"></div><div class="panel"><div class="admin-panel-head"><h3>' + (isGeneralAdmin() ? "Suivi des dépenses" : "Mes dépenses soumises") + '</h3><span class="small-note">' +
      (isGeneralAdmin() ? "Dépenses validées : " + money(totalApproved) + " · En attente : " + pending.length : "Les montants affichés ne sont pas des dépenses validées tant que le propriétaire ne les a pas approuvés.") +
      '</span></div>' + table + '</div>';
  }

  async function setExpenseApproval(id, status) {
    if (!isGeneralAdmin()) return toast("Seul le propriétaire peut valider une dépense.", true);
    if (!["approved","rejected"].includes(status)) return toast("Décision invalide.", true);
    const { error } = await client.from("expenses").update({
      approval_status: status,
      approved_by: status === "approved" ? currentUser.id : null,
      approved_at: status === "approved" ? new Date().toISOString() : null
    }).eq("id", id).eq("approval_status", "pending");
    if (error) return toast(errorMessage(error), true);
    toast(status === "approved" ? "Dépense validée." : "Dépense refusée.");
    await showAdminView("expenses");
  }
  window.setExpenseApproval = setExpenseApproval;

  async function adminMarketing() {
    const [campaigns, subscriberCountResult] = await Promise.all([
      readRows("customer_email_campaigns", "id,campaign_key,campaign_type,subject,product_id,status,recipients_total,recipients_sent,recipients_failed,error_message,created_at,completed_at"),
      client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer").eq("marketing_opt_in", true)
    ]);
    if (subscriberCountResult.error) throw subscriberCountResult.error;
    const subscribers = Number(subscriberCountResult.count || 0);
    const sorted = campaigns.slice().sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const sent = campaigns.reduce((total, row) => total + Number(row.recipients_sent || 0), 0);
    const promotionCount = campaigns.filter(row => row.campaign_type === "promotion").length;
    const monthCount = campaigns.filter(row => row.campaign_type === "monthly").length;
    const statusLabelForCampaign = status => ({processing:"En cours",sent:"Envoyée",partial:"Partielle",failed:"Échec",skipped:"Sans envoi"})[status] || status || "—";
    const statusCss = status => ({processing:"processing",sent:"delivered",partial:"processing",failed:"cancelled",skipped:""})[status] || "";
    const history = sorted.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Campagne</th><th>Objet</th><th>Statut</th><th>Envois réussis</th><th>Échecs</th><th>Détail</th></tr></thead><tbody>' +
        sorted.map(row => '<tr><td>' + esc(fmtDate(row.created_at)) + '</td><td>' + (row.campaign_type === "promotion" ? "Promotion" : "Mensuelle") + '</td><td><strong>' + esc(row.subject) + '</strong></td><td><span class="status ' + statusCss(row.status) + '">' + statusLabelForCampaign(row.status) + '</span></td><td>' + Number(row.recipients_sent || 0) + ' / ' + Number(row.recipients_total || 0) + '</td><td>' + Number(row.recipients_failed || 0) + '</td><td>' + esc(row.error_message || "—") + '</td></tr>').join("") +
        '</tbody></table></div>'
      : '<div class="empty">Aucune campagne commerciale n’a encore été envoyée.</div>';
    return '<section class="marketing-admin-hero"><div><div class="eyebrow">FIDÉLISATION CLIENT</div><h3>Campagnes e-mail SAMA-PACK</h3><p>Les e-mails promotionnels sont envoyés aux clients qui ont explicitement accepté de les recevoir. Les e-mails de commande restent indépendants de ce consentement.</p></div></section>' +
      '<section class="marketing-admin-stats"><article class="marketing-admin-stat"><span>Clients abonnés</span><strong>' + subscribers + '</strong><small>Consentement commercial actif</small></article>' +
      '<article class="marketing-admin-stat"><span>Campagnes promotion</span><strong>' + promotionCount + '</strong><small>Envoi lors de l’activation d’une vente flash</small></article>' +
      '<article class="marketing-admin-stat"><span>Campagnes mensuelles</span><strong>' + monthCount + '</strong><small>Programmées le 1er à 08 h, heure de Dakar</small></article>' +
      '<article class="marketing-admin-stat"><span>E-mails envoyés</span><strong>' + sent + '</strong><small>Total cumulé depuis l’activation</small></article></section>' +
      '<section class="panel marketing-admin-schedule"><div><div class="eyebrow">AUTOMATISATION</div><h4>Le prochain rendez-vous client</h4><p>Le premier jour de chaque mois à 08 h, SAMA-PACK présente quelques essentiels disponibles et les promotions en cours. Chaque client reçoit un e-mail individuel avec un lien de désabonnement.</p><p class="small-note">Une vente flash publiée déclenche automatiquement un message dédié. Modifier le prix, la durée ou le texte d’une promotion active peut déclencher une nouvelle campagne pour cette nouvelle version.</p></div>' +
      (isGeneralAdmin() ? '<button class="btn primary marketing-send-now" type="button" id="sendMonthlyMarketingBtn">Envoyer la campagne du mois maintenant</button>' : '<p class="small-note">L’envoi manuel est réservé à l’administrateur général.</p>') +
      '</section><section class="panel marketing-admin-history"><div class="admin-panel-head"><h3>Historique des campagnes (' + campaigns.length + ')</h3><button class="btn ghost small" type="button" onclick="showAdminView(\'marketing\')">Actualiser</button></div>' + history + '</section>';
  }

  async function sendMonthlyMarketingNow() {
    if (!isGeneralAdmin()) return toast("Seul l’administrateur général peut lancer une campagne manuellement.", true);
    if (!window.confirm("Envoyer maintenant la campagne mensuelle à tous les clients ayant accepté les e-mails commerciaux ? Chaque client recevra un message personnalisé. Cette action envoie de vrais e-mails.")) return;
    const button = $("sendMonthlyMarketingBtn");
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = "Préparation de la campagne…"; }
    try {
      const { data, error } = await client.functions.invoke("sama-customer-marketing", { body: { action: "monthly" } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || errorMessage(error || new Error("La campagne n’a pas pu être envoyée.")));
      toast(data?.message || "Campagne mensuelle traitée.");
      await showAdminView("marketing");
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      const currentButton = $("sendMonthlyMarketingBtn");
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = currentButton.dataset.oldText || "Envoyer la campagne du mois maintenant"; delete currentButton.dataset.oldText; }
    }
  }

  async function adminContacts() {
    if (!isAdmin()) throw new Error("Accès administrateur requis.");
    const { data, error } = await client.from("contact_messages")
      .select("id,full_name,email,phone,subject,message,status,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    const rows = data || [];
    const labels = {new:"Nouveau",read:"Lu",replied:"Répondu",closed:"Clôturé"};
    const badge = status => '<span class="status-badge status-' + esc(status) + '">' + esc(labels[status] || status) + '</span>';
    const body = rows.map(row => '<tr>' +
      '<td>' + esc(new Date(row.created_at).toLocaleString("fr-FR")) + '</td>' +
      '<td><strong>' + esc(row.full_name) + '</strong><br><a href="mailto:' + esc(row.email) + '">' + esc(row.email) + '</a>' +
      (row.phone ? '<br><span class="small-note">' + esc(row.phone) + '</span>' : '') + '</td>' +
      '<td><strong>' + esc(row.subject) + '</strong><p class="contact-message-body">' + esc(row.message).replace(/\n/g,"<br>") + '</p></td>' +
      '<td>' + badge(row.status) + '<select class="input contact-message-status" aria-label="Statut du message" data-contact-message-id="' + esc(row.id) + '">' +
      Object.entries(labels).map(([value,label]) => '<option value="' + value + '"' + (row.status===value?' selected':'') + '>' + label + '</option>').join("") +
      '</select></td></tr>').join("");
    const counts = {new:rows.filter(r=>r.status==="new").length,read:rows.filter(r=>r.status==="read").length,replied:rows.filter(r=>r.status==="replied").length,closed:rows.filter(r=>r.status==="closed").length};
    return '<div class="panel"><div class="admin-panel-head"><div><h3>Messages du formulaire de contact (' + rows.length + ')</h3><p class="small-note">Messages reçus via la page Contact. Les changements de statut sont enregistrés.</p></div><button class="btn small ghost" onclick="showAdminView(\'contacts\')">Actualiser</button></div>' +
      '<div class="stats-grid"><div class="stat-card"><span>Nouveaux</span><strong>' + counts.new + '</strong></div><div class="stat-card"><span>Lus</span><strong>' + counts.read + '</strong></div><div class="stat-card"><span>Répondus</span><strong>' + counts.replied + '</strong></div><div class="stat-card"><span>Clôturés</span><strong>' + counts.closed + '</strong></div></div>' +
      (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Reçu le</th><th>Contact</th><th>Objet et message</th><th>Suivi</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="empty">Aucun message reçu pour le moment.</div>') + '</div>';
  }

  async function updateContactMessageStatus(id, status) {
    if (!isAdmin()) return toast("Accès administrateur requis.", true);
    if (!["new","read","replied","closed"].includes(status)) return toast("Statut de message invalide.", true);
    const { error } = await client.from("contact_messages").update({status,updated_at:new Date().toISOString()}).eq("id",id);
    if (error) return toast("Le statut n’a pas pu être enregistré : " + errorMessage(error), true);
    toast("Statut du message mis à jour.");
    await showAdminView("contacts");
  }

  async function adminQuotes() {
    const rows = await readRows("quotes");
    cachedQuotes = rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    let assignableAdmins = [];
    if (isGeneralAdmin()) {
      const adminResult = await client.from("profiles").select("id,full_name,email")
        .eq("role","admin").eq("is_super_admin",false).order("created_at",{ascending:true});
      if (adminResult.error) throw adminResult.error;
      assignableAdmins = adminResult.data || [];
    }
    const tableRows = cachedQuotes.map(q => {
      const selectedAdmin = q.assigned_admin_id || q.sales_referrer_user_id || "";
      const quoteChar = String.fromCharCode(39);
      const statusCell = hasAdminPermission("quotes.update_status")
        ? '<select class="input" onchange="setQuoteStatus(' + quoteChar + esc(q.id) + quoteChar + ',this.value)">' + ["new","processing","won","lost"].map(s => '<option ' + (q.status === s ? 'selected' : '') + ' value="' + s + '">' + esc(statusLabel(s)) + '</option>').join("") + '</select>'
        : '<span class="status">' + esc(statusLabel(q.status)) + '</span>';
      const assignmentCell = isGeneralAdmin()
        ? "<td><select class=\"input\" aria-label=\"Attribuer le devis\" onchange=\"setQuoteAssigned('" + esc(q.id) + "',this.value)\"><option value=\"\">Non attribué</option>" +
          assignableAdmins.map(a => '<option value="' + esc(a.id) + '"' + (selectedAdmin === a.id ? " selected" : "") + '>' + esc(a.full_name || a.email || "Administrateur") + '</option>').join("") +
          '</select></td>'
        : "";
      return `<tr><td>${esc(q.id)}</td><td>${esc(fmtDate(q.created_at))}</td><td>${esc(q.company)}</td><td>${esc(q.need)}<br><span class="small-note">${esc(q.message||"")}</span></td><td>${esc(q.phone)}<br><span class="small-note">${esc(q.email||"")}</span></td>${assignmentCell}<td>${statusCell}</td></tr>`;
    }).join("");
    return `<div class="panel"><h3>Demandes de devis (${rows.length})</h3>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Structure</th><th>Besoin</th><th>Contact</th>${isGeneralAdmin() ? "<th>Attribué à</th>" : ""}<th>Statut</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : '<div class="empty">Aucune demande de devis.</div>'}</div>`;
  }
  async function setQuoteAssigned(id, assignedAdminId) {
    if (!isGeneralAdmin()) return toast("Seul le propriétaire peut attribuer les devis.", true);
    const { error } = await client.from("quotes").update({ assigned_admin_id: assignedAdminId || null }).eq("id", id);
    if (error) return toast(errorMessage(error), true);
    toast(assignedAdminId ? "Devis attribué." : "Attribution retirée.");
    await showAdminView("quotes");
  }
  window.setQuoteAssigned = setQuoteAssigned;

  async function adminSettings() {
    const [{ data, error }, { data: notificationSettings, error: notificationError }] = await Promise.all([
      client.from("settings").select("id,company,whatsapp,delivery_fee,currency,homepage_background_url,payment_fee_percent").eq("id",true).maybeSingle(),
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
      <label>Taux de frais de paiement estimé (%)<input class="input" name="payment_fee_percent" type="number" min="0" max="100" step="0.01" value="${Number(s.payment_fee_percent||0)}"></label>
      <label>Devise<input class="input" name="currency" required maxlength="10" value="${esc(s.currency||"FCFA")}"></label>
      <label class="full">Image de fond de l’accueil (JPG, PNG ou WebP · 5 Mo maximum)<input class="input" name="homepage_background_file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label class="full">Ou URL HTTPS de l’image de fond<input class="input" name="homepage_background_url" type="url" placeholder="https://…" value="${esc(backgroundUrl)}"></label>
      ${backgroundUrl ? `<div class="homepage-bg-preview-wrap full"><span class="small-note">Image actuellement enregistrée</span><img class="homepage-bg-preview" src="${esc(backgroundUrl)}" alt="Aperçu du fond de l’accueil"></div>` : '<p class="small-note full">Aucune image personnalisée : le fond vert clair par défaut sera utilisé.</p>'}
      <p class="small-note full">Si tu sélectionnes un fichier, il remplace l’URL ci-dessus. Pour revenir au fond par défaut, vide l’URL et enregistre sans choisir de fichier.</p>
      <label class="full">E-mail de contact officiel et de réception des commandes/devis<input class="input" name="order_notification_email" type="email" placeholder="Adresse e-mail professionnelle" value="${esc(notificationEmail)}"></label>
      <button class="btn primary full" type="submit">Enregistrer les paramètres</button>
    </form><p class="small-note">Pour activer les e-mails, configure aussi RESEND_API_KEY et RESEND_FROM_EMAIL dans Supabase → Edge Functions → Secrets.</p></div>`;
  }
  function bindAdmin(view) {
    if (view === "packs" || view === "products") {
      const form = $("packForm"); if (form) { bindProductPriceCalculator(form); form.onsubmit = async e => {
        e.preventDefault(); if (!isAdmin()) return toast("Accès refusé.", true); setBusy(form,true,"Enregistrement…");
        const fd = new FormData(form); const pricing = readProductPricing(fd); if (pricing.error) { setBusy(form,false); return toast(pricing.error,true); } const uploadFiles = fd.getAll("image_files"); const promoPriceInput = String(fd.get("promo_price")||"").trim(); const promoEndInput = String(fd.get("promo_end_at")||"").trim(); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:pricing.salePrice,description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",availability_status:fd.get("availability_status")==="available"?"available":"out_of_stock",promo_active:fd.get("promo_active")==="on",promo_price:promoPriceInput === "" ? null : Number(promoPriceInput),promo_label:String(fd.get("promo_label")||"Vente flash").trim() || "Vente flash",promo_end_at:promoEndInput ? new Date(promoEndInput).toISOString() : null };
        if (payload.active && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant la publication.",true); } if (payload.availability_status === "available" && payload.price <= 0) { setBusy(form,false); return toast("Définis un prix de vente supérieur à zéro avant de marquer le pack disponible.",true); } if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0) { setBusy(form,false); return toast("Complète le nom, la catégorie, le prix, la description et la composition.",true); } if (payload.promo_active && (!Number.isFinite(payload.promo_price) || payload.promo_price < 0 || payload.promo_price >= payload.price)) { setBusy(form,false); return toast("Le prix promotionnel doit être positif et inférieur au prix normal.",true); } if (payload.promo_active && payload.promo_end_at && new Date(payload.promo_end_at).getTime() <= Date.now()) { setBusy(form,false); return toast("La fin de la vente flash doit être dans le futur.",true); } if (!payload.promo_active && !Number.isFinite(payload.promo_price)) payload.promo_price = null;
        if (payload.image_path && !/^https:\/\//i.test(payload.image_path) && /^(?:javascript:|data:|vbscript:)/i.test(payload.image_path)) { setBusy(form,false); return toast("Le chemin de l’image n’est pas valide.",true); }
        let productId = editingProductId || nextProductId();
        const replaceImages = fd.get("replace_images") === "on";
        let existingImages = replaceImages ? [] : getProductImages(editingProductId ? getP(editingProductId) : null);
        if (!replaceImages && payload.image_path && !existingImages.includes(payload.image_path)) existingImages.unshift(payload.image_path);
        const imageUpload = await uploadProductImages(uploadFiles, productId, existingImages);
        if (imageUpload.error) { setBusy(form,false); return toast(imageUpload.error,true); }
        payload.image_paths = imageUpload.images;
        payload.image_path = payload.image_paths[0] || (replaceImages ? "" : payload.image_path);
        if (payload.active && !payload.image_paths.length && !(editingProductId && getP(editingProductId)?.active === true)) { setBusy(form,false); return toast("Ajoute au moins une photo avant de publier ce pack.",true); }
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
    if (view === "deliveries") {
      const inviteForm = $("courierInviteForm");
      if (inviteForm) inviteForm.onsubmit = async event => {
        event.preventDefault();
        if (!isGeneralAdmin()) return toast("Seul l’administrateur général peut inviter un livreur.", true);
        const fd = new FormData(inviteForm);
        setBusy(inviteForm, true, "Invitation…");
        try {
          const { data, error } = await client.functions.invoke("sama-delivery-ops", { body: {
            action:"invite_courier", full_name:String(fd.get("full_name")||"").trim(),
            email:String(fd.get("email")||"").trim(), phone:String(fd.get("phone")||"").trim()
          }});
          if (error || data?.error) throw new Error(data?.error || errorMessage(error));
          inviteForm.reset();
          toast(data?.message || "Invitation envoyée.");
          await showAdminView("deliveries");
        } catch (error) {
          toast(errorMessage(error), true);
        } finally {
          if (inviteForm.isConnected) setBusy(inviteForm, false);
        }
      };
      document.querySelectorAll(".delivery-assignment-select").forEach(select => {
        select.addEventListener("change", async () => {
          const previous = select.dataset.previousValue || "";
          try {
            select.disabled = true;
            const { data, error } = await client.functions.invoke("sama-delivery-ops", { body: {
              action:"assign_courier", order_id:select.dataset.orderId, courier_id:select.value
            }});
            if (error || data?.error) throw new Error(data?.error || errorMessage(error));
            toast(data?.message || "Attribution mise à jour.");
            await showAdminView("deliveries");
          } catch (error) {
            select.value = previous;
            toast(errorMessage(error), true);
          } finally {
            if (select.isConnected) select.disabled = false;
          }
        });
      });
      document.querySelectorAll("[data-delivery-review]").forEach(button => {
        button.addEventListener("click", async () => {
          const decision = button.dataset.deliveryReview;
          const eventId = button.dataset.eventId;
          const noteInput = document.querySelector('[data-delivery-review-note="' + eventId + '"]');
          const note = String(noteInput?.value || "").trim();
          if (!window.confirm(decision === "validated" ? "Confirmer que cet encaissement a bien été reçu ?" : "Rejeter cet encaissement déclaré ?")) return;
          try {
            button.disabled = true;
            const { data, error } = await client.functions.invoke("sama-delivery-ops", { body: {
              action:"review_collection", event_id:eventId, decision, note
            }});
            if (error || data?.error) throw new Error(data?.error || errorMessage(error));
            toast(data?.message || "Encaissement traité.");
            await showAdminView("deliveries");
          } catch (error) {
            button.disabled = false;
            toast(errorMessage(error), true);
          }
        });
      });
    }
    if (view === "contacts") {
      document.querySelectorAll(".contact-message-status").forEach(select => {
        select.addEventListener("change", () => updateContactMessageStatus(select.dataset.contactMessageId, select.value));
      });
    }
    if (view === "stock") {
      document.querySelectorAll(".stock-field").forEach(input => {
      input.addEventListener("change", async () => {
        const productId = input.dataset.stockId; const key = input.dataset.stockKey; let val = input.value;
        if (key === "availability_status") {
          if (!["available","out_of_stock"].includes(val)) { toast("Disponibilité invalide.",true); return showAdminView("stock"); }
          if (val === "available" && Number(getP(productId)?.price || 0) <= 0) { toast("Définis un prix de vente avant de marquer l’article disponible.",true); return showAdminView("stock"); }
          if (!isGeneralAdmin() && !hasAdminPermission("stock.update")) { toast("Cette action n’est pas autorisée.", true); return showAdminView("stock"); }
          const { error } = await client.from("products").update({ availability_status: val, updated_at: new Date().toISOString() }).eq("id", productId);
          if (error) return toast(errorMessage(error),true);
          const product = getP(productId); if (product) product.availability_status = val;
          toast("Disponibilité mise à jour."); await loadPublicData(); return showAdminView("stock");
        }
        if (!isGeneralAdmin() && !hasAdminPermission("stock.update")) { toast("Tu peux consulter le stock, mais pas le modifier.", true); return showAdminView("stock"); }
        if (key !== "supplier") { val = Number(val); if (!Number.isFinite(val) || val < 0) { toast("Valeur numérique invalide.",true); return showAdminView("stock"); } }
        const existing = stockRows.find(x=>x.product_id===productId);
        if (key === "supplier") { toast("La gestion des fournisseurs est réservée au propriétaire.", true); return showAdminView("stock"); }
        const row = { product_id: productId, quantity: Number(existing?.quantity||0), min_quantity: Number(existing?.min_quantity||0), ...(isGeneralAdmin() ? { supplier: existing?.supplier||"", unit_cost: Number(existing?.unit_cost||0) } : {}) };
        row[key] = val;
        const writeRow = { product_id: productId, quantity: row.quantity, min_quantity: row.min_quantity, ...(isGeneralAdmin() ? { unit_cost: Number(row.unit_cost||0) } : {}) };
        const { error } = await client.from("stock").upsert(writeRow,{onConflict:"product_id"});
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
    if (view === "expenses") { const form=$("expenseForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const owner=isGeneralAdmin();const {error}=await client.from("expenses").insert({id:"DEP-"+crypto.randomUUID().slice(0,8).toUpperCase(),label:String(f.get("label")||"").trim(),amount:Number(f.get("amount")),category:String(f.get("category")||"").trim(),expense_date:String(f.get("date")||new Date().toISOString().slice(0,10)),submitted_by:currentUser.id,approval_status:owner?"approved":"pending",approved_by:owner?currentUser.id:null,approved_at:owner?new Date().toISOString():null});setBusy(form,false);if(error)return toast(errorMessage(error),true);toast(owner?"Dépense enregistrée et validée.":"Dépense soumise au propriétaire pour validation.");await showAdminView("expenses");}; }
    if (view === "quotes") { /* Le statut est enregistré dans le gestionnaire ci-dessous. */ }
    if (view === "settings") {
      const form = $("settingsForm");
      if (form) form.onsubmit = async e => {
        e.preventDefault();
        if (!isGeneralAdmin()) return toast("Seul le propriétaire peut modifier les paramètres de la plateforme.", true);
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
          payment_fee_percent:Math.max(0,Math.min(100,Number(f.get("payment_fee_percent")||0))),
          currency:String(f.get("currency")||"FCFA").trim(),
          homepage_background_url: homepageBackgroundUrl
        }).eq("id",true);
        if (error) { setBusy(form,false); return toast(errorMessage(error),true); }
        const emailResult = await client.from("notification_settings").update({order_notification_email:String(f.get("order_notification_email")||"").trim()}).eq("id",true);
        setBusy(form,false);
        if (emailResult.error) { await loadPublicData(); return toast("Paramètres boutique enregistrés, mais l’e-mail n’a pas pu être enregistré : "+errorMessage(emailResult.error),true); }
        toast("Paramètres enregistrés. Le WhatsApp et l’e-mail de contact sont mis à jour sur la boutique.");
        await loadPublicData();
        await showAdminView("settings");
      };
    }
    if (view === "sales_codes") {
      const form = $("salesCodeForm");
      if (form) form.onsubmit = async event => {
        event.preventDefault();
        if (!hasAdminPermission("sales_codes.manage_own")) return toast("Tu ne peux pas créer de code commercial avec les permissions actuelles.", true);
        const fd = new FormData(form);
        const code = String(fd.get("code") || "").trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code)) return toast("Le code doit contenir 3 à 30 caractères : lettres, chiffres, tiret ou souligné.", true);
        const payload = { owner_user_id:String(fd.get("owner_user_id")||""), code, label:String(fd.get("label")||"").trim(), active:true, created_by:currentUser.id };
        const { error } = await client.from("sales_referral_codes").insert(payload);
        if (error) return toast(errorMessage(error), true);
        toast("Code commercial créé : " + code);
        await showAdminView("sales_codes");
      };
    }
    if (view === "orders" || view === "quotes") { /* les sélecteurs déclaratifs utilisent les fonctions globales */ }
  }
  async function setQuoteStatus(id,status) {
    if(!hasAdminPermission("quotes.update_status")) return toast("Accès refusé.",true);
    if(!["new","processing","won","lost"].includes(status)) return toast("Statut invalide.",true);
    const {error}=await client.from("quotes").update({status}).eq("id",id);
    if(error) return toast(errorMessage(error),true);
    toast("Statut du devis modifié."); await showAdminView("quotes");
  }


  function captureSalesReferral() {
    try {
      const params = new URLSearchParams(window.location.search || ""), raw = params.get("ref") || params.get("code") || "";
      const normalized = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
      if (normalized.length >= 3) { localStorage.setItem("sama_pack_sales_referral_code_v1", normalized); currentSalesReferralCode = normalized; }
      else currentSalesReferralCode = localStorage.getItem("sama_pack_sales_referral_code_v1") || "";
    } catch { currentSalesReferralCode = ""; }
    return currentSalesReferralCode;
  }
  function getSalesReferralCode() {
    if (currentSalesReferralCode) return currentSalesReferralCode;
    try { currentSalesReferralCode = localStorage.getItem("sama_pack_sales_referral_code_v1") || ""; } catch { currentSalesReferralCode = ""; }
    return currentSalesReferralCode;
  }

  function initShop() {
    captureSalesReferral();
    if ($("year")) $("year").textContent = String(new Date().getFullYear());
    const search = $("searchBox"); if (search) search.addEventListener("input",() => { currentProductPage = 1; renderProducts(); });
    const category = $("categoryFilter"); if(category) category.addEventListener("change",() => { currentProductPage = 1; renderProducts(); });
    if ($("openCartBtn")) $("openCartBtn").onclick = renderCartModal;
    if ($("budgetPackBuilderBtn")) $("budgetPackBuilderBtn").onclick = openBudgetPackBuilder;
    document.querySelectorAll("[data-mobile-action=cart]").forEach(b => b.addEventListener("click", renderCartModal));
    document.querySelectorAll("[data-mobile-action=account]").forEach(b => b.addEventListener("click", openAccountModal));
    const mobileNav = $("mobileMenuShell");
    const mobileMenuToggle = $("mobileMenuToggle");
    const closeMobileNav = () => {
      if (!mobileNav || !mobileMenuToggle) return;
      mobileNav.classList.remove("is-open");
      mobileMenuToggle.setAttribute("aria-expanded", "false");
      mobileMenuToggle.setAttribute("aria-label", "Ouvrir le menu");
    };
    if (mobileNav && mobileMenuToggle) {
      mobileMenuToggle.addEventListener("click", () => {
        const isOpen = !mobileNav.classList.contains("is-open");
        mobileNav.classList.toggle("is-open", isOpen);
        mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
        mobileMenuToggle.setAttribute("aria-label", isOpen ? "Fermer le menu" : "Ouvrir le menu");
      });
      mobileNav.querySelectorAll(".mobile-nav-menu .mobile-nav-item").forEach(item => {
        item.addEventListener("click", closeMobileNav);
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMobileNav();
      });
      document.addEventListener("click", event => {
        if (!mobileNav.contains(event.target)) closeMobileNav();
      });
      window.addEventListener("resize", () => {
        if (!window.matchMedia("(max-width: 700px)").matches) closeMobileNav();
      });
    }
    if ($("heroWhatsApp")) $("heroWhatsApp").onclick = () => document.getElementById("catalogue").scrollIntoView({behavior:"smooth"});
    if ($("contactWhatsApp")) $("contactWhatsApp").onclick = () => openWA("Bonjour Sama-Pack, je souhaite avoir plus d’informations sur vos packs.");
    if ($("quoteBtn")) $("quoteBtn").onclick = openQuoteModal;
    if ($("businessSpaceBtn")) $("businessSpaceBtn").onclick = openB2BWorkspace;
    if ($("adminBtn")) $("adminBtn").onclick = openAdmin;
    if ($("mobileManageBtn")) $("mobileManageBtn").onclick = openAdmin;
    if ($("footerAdmin")) $("footerAdmin").onclick = e => { e.preventDefault(); openAdmin(); };
    if ($("viewShopBtn")) $("viewShopBtn").onclick = closeAdmin;
    if ($("viewShopBtnSide")) $("viewShopBtnSide").onclick = closeAdmin;
    if ($("closeAdminBtn")) $("closeAdminBtn").onclick = closeAdmin;
    if ($("adminRefreshBtn")) $("adminRefreshBtn").onclick = () => showAdminView(currentAdminView || "dashboard");
    if ($("adminAccountBtn")) $("adminAccountBtn").onclick = openAccountModal;
    if ($("adminNavSearch")) $("adminNavSearch").addEventListener("input", applyAdminNavigationSearch);
    if ($("adminGlobalSearch")) $("adminGlobalSearch").addEventListener("input", applyAdminResultSearch);
    if ($("accountBtn")) $("accountBtn").onclick = openAccountModal;
    if ($("notificationBtn")) $("notificationBtn").onclick = loadAndShowNotifications;
    const adminMenuToggle = $("adminMenuToggle");
    if (adminMenuToggle) adminMenuToggle.onclick = () => setAdminMobileMenuOpen(!$("adminSidebar")?.classList.contains("is-open"));
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 900px)").matches) setAdminMobileMenuOpen(false);
    });
    document.querySelectorAll(".side-btn").forEach(b => b.addEventListener("click", () => {
      setAdminMobileMenuOpen(false);
      showAdminView(b.dataset.view);
    }));
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
  Object.assign(window,{updateContactMessageStatus,openProduct,addToCart,closeModal,changeQty,checkoutModal,retryOrderPayment,resendPaymentConfirmation,showAccountHome,reorderOrder,openBudgetPackBuilder,suggestBudgetPack,changeBudgetBuilderQty,addBudgetPackToCart,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem,removeAdmin,openSubscriptionEditor,addSubscriptionLine,removeSubscriptionLine,toggleSubscriptionStatus,prepareSubscriptionOrder,advanceSubscriptionReminder,deleteSubscription,openOrderWhatsApp,openB2BWorkspace,addB2BLine,removeB2BLine,submitB2BQuantityOrder,submitB2BQuote,setOrderDeliveryCost,toggleSalesCode,deleteSalesCode,copySalesLink,showCustomerProfile,sendMonthlyMarketingNow});
  start().catch(err => { console.error(err); toast("Initialisation impossible. Recharge la page ou contacte l’administrateur.",true); });
})();
