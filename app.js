/* Sama-Pack V2 — Supabase Auth, commandes en ligne, comptes administrateurs, audit et notifications. */
(() => {
  "use strict";

  const SUPABASE_URL = "https://tbxxrnhcfuaeaatlrdtr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo"; // clé publique uniquement; RLS protège les données.
  const CART_KEY = "sama_pack_cart_v2";
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
  let appSettings = { company: "SAMA-PACK", whatsapp: "", deliveryFee: 1500, currency: "FCFA" };
  let cart = loadCart();

  function normalizeFallbackProduct(p) {
    return { id: String(p.id), name: String(p.name || "Pack"), cat: String(p.cat || p.category || "Autre"), category: String(p.cat || p.category || "Autre"), price: Number(p.price || 0), desc: String(p.desc || p.description || ""), description: String(p.desc || p.description || ""), items: Array.isArray(p.items) ? p.items : [], image_path: p.image_path || "", active: p.active !== false };
  }
  function normalizeProduct(p) {
    return { ...p, id: String(p.id), cat: String(p.category || p.cat || "Autre"), category: String(p.category || p.cat || "Autre"), price: Number(p.price || 0), desc: String(p.description || p.desc || ""), description: String(p.description || p.desc || ""), items: Array.isArray(p.items) ? p.items : [], image_path: String(p.image_path || ""), active: p.active !== false };
  }
  function loadCart() {
    try { const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(value) ? value.filter(x => x && typeof x.id === "string" && Number(x.qty) > 0).map(x => ({ id: x.id, qty: Math.min(99, Math.max(1, Number(x.qty) || 1)) })) : []; }
    catch { return []; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Le panier fonctionne aussi en mémoire si le navigateur bloque le stockage. */ } }
  function money(n) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + " FCFA"; }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
  function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }
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

  async function loadPublicData() {
    if (!client) return;
    const { data: rows, error } = await client.from("products")
      .select("id,name,category,price,description,items,image_path,active")
      .order("id", { ascending: true });
    if (!error && Array.isArray(rows)) products = rows.map(normalizeProduct);
    else console.warn("Catalogue distant indisponible; affichage du catalogue de secours.", error);
    const { data: setting, error: settingError } = await client.from("settings")
      .select("id,company,whatsapp,delivery_fee,currency").eq("id", true).maybeSingle();
    if (!settingError && setting) {
      appSettings = { company: setting.company || "SAMA-PACK", whatsapp: String(setting.whatsapp || ""), deliveryFee: Number(setting.delivery_fee || 0), currency: setting.currency || "FCFA" };
    } else if (settingError) console.warn("Paramètres distants indisponibles.", settingError);
    const count = $("packCount"); if (count) count.textContent = String(products.filter(p => p.active).length);
    updateContact(); updateCategoryFilter(); renderTop(); renderProducts(); updateCartCount();
  }
  function updateCategoryFilter() {
    const filter = $("categoryFilter"); if (!filter) return;
    const old = filter.value || "all";
    const categories = [...new Set(products.filter(p => p.active || isAdmin()).map(p => p.cat).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));
    filter.innerHTML = '<option value="all">Toutes les catégories</option>' + categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    filter.value = categories.includes(old) ? old : "all";
  }
  function updateContact() {
    const contact = $("contactPhone"); const n = waNumber();
    if (contact) contact.textContent = n ? "+" + n : "WhatsApp à configurer";
  }
  function renderTop() {
    const el = $("heroTopPacks"); if (!el) return;
    const tops = products.filter(p => p.active).slice(0, 3);
    el.innerHTML = tops.map(p => `<div class="mini-pack"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><small>${money(p.price)}</small></div></div>`).join("") || '<div class="empty">Les packs seront bientôt disponibles.</div>';
  }
  function imageOrEmoji(p, klass = "pack-visual") {
    const fallback = `<div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div>`;
    if (!p.image_path) return `<div class="${klass}">${fallback}</div>`;
    const path = p.image_path;
    const src = /^https?:\/\//i.test(path) ? path : path.replace(/^\//, "");
    return `<div class="${klass} product-image-frame"><img class="product-photo" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('product-image-frame');this.parentElement.innerHTML='${fallback.replace(/'/g,"&#039;").replace(/`/g,"&#096;")}'"></div>`;
  }
  function renderProducts() {
    const grid = $("productGrid"); if (!grid) return;
    const q = String($("searchBox")?.value || "").toLowerCase().trim();
    const c = $("categoryFilter")?.value || "all";
    const arr = products.filter(p => p.active && (c === "all" || p.cat === c) && [p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));
    grid.innerHTML = arr.map(productCard).join("") || '<div class="empty">Aucun pack trouvé. Essaie une autre recherche.</div>';
  }
  function productCard(p) {
    const photo = p.image_path ? `<img class="product-photo" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    return `<article class="product-card"><div class="pack-visual ${p.image_path ? "has-photo" : ""}">${photo}<div class="pack-box ${p.image_path ? "photo-fallback" : ""}" ${p.image_path ? "style=\"display:none\"" : ""}><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div></div><div class="product-body"><div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div><div class="product-desc">${esc(p.desc)}</div><div class="price-row"><div class="price">${money(p.price)}</div><span class="small-note">TTC</span></div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')">Ajouter</button></div></div></article>`;
  }
  function openProduct(id) {
    const p = getP(id); if (!p) return;
    const photo = p.image_path ? `<img class="product-photo product-photo-detail" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" onerror="this.style.display='none'">` : `<div class="pack-visual"><div class="pack-box"><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div></div>`;
    showModal(`<div class="modal-head"><div><div class="eyebrow">${esc(p.cat)}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>${photo}<p>${esc(p.desc)}</p><ul class="pack-items">${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul><div class="price-row"><div class="price">${money(p.price)}</div><button class="btn primary" onclick="addToCart('${esc(p.id)}');closeModal()">Ajouter au panier</button></div>`);
  }
  function addToCart(id) {
    const p = getP(id); if (!p || !p.active) { toast("Ce pack n’est plus disponible.", true); return; }
    const line = cart.find(i => i.id === id);
    if (line) line.qty = Math.min(99, line.qty + 1); else cart.push({ id, qty: 1 });
    saveCart(); updateCartCount(); toast("Pack ajouté au panier.");
  }
  function updateCartCount() { const el = $("cartCount"); if (el) el.textContent = String(cart.reduce((sum, i) => sum + i.qty, 0)); }
  function saveAndRenderCart() { saveCart(); updateCartCount(); renderCartModal(); }
  function cartTotals() { const subtotal = cart.reduce((sum, i) => sum + (getP(i.id)?.price || 0) * i.qty, 0); const delivery = Number(appSettings.deliveryFee || 0); return { subtotal, delivery, total: subtotal + delivery }; }
  function showModal(body) { $("modalRoot").innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-card">${body}</div></div>`; }
  function closeModal() { $("modalRoot").innerHTML = ""; }
  function renderCartModal() {
    if (!cart.length) { showModal(`<div class="modal-head"><h2>Ton panier</h2><button class="close" onclick="closeModal()">✕</button></div><div class="empty">Ton panier est vide.<br><br><a class="btn primary" href="#catalogue" onclick="closeModal()">Voir le catalogue</a></div>`); return; }
    const t = cartTotals();
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Ton panier</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="cart-list">${cart.map(i => { const p = getP(i.id); if (!p) return ""; return `<div class="cart-item"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(p.price)} / pack</div></div><div class="qty"><button onclick="changeQty('${esc(p.id)}',-1)" aria-label="Retirer une unité">−</button><b>${i.qty}</b><button onclick="changeQty('${esc(p.id)}',1)" aria-label="Ajouter une unité">+</button></div></div>`; }).join("")}</div><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(t.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(t.delivery)}</strong></div><div class="summary-row total"><span>Total estimé</span><strong>${money(t.total)}</strong></div></div><p class="small-note">Le total définitif est calculé et validé par le serveur au moment de confirmer la commande.</p><button class="btn primary full" onclick="checkoutModal()">Passer la commande</button>`);
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
    const adminBtn = $("adminBtn"); if (adminBtn) adminBtn.textContent = isAdmin() ? "Gestion" : "Gestion";
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
    const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_user_id", currentUser.id);
    if (error) return toast(errorMessage(error), true);
    userNotifications = userNotifications.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n); updateAccountButtons(); loadAndShowNotifications();
  }

  function checkoutModal() {
    if (!cart.length) return toast("Ton panier est vide.", true);
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
    const rows = await readRows("stock"); stockRows = rows;
    return `<div class="panel"><div class="admin-panel-head"><h3>Stock et réapprovisionnement</h3><span class="small-note">Les modifications sont enregistrées dans la base de données.</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Pack</th><th>Quantité</th><th>Seuil</th><th>Coût d’achat</th><th>Valeur stock</th><th>Fournisseur</th></tr></thead><tbody>${products.map(p=>{const s=rows.find(x=>x.product_id===p.id)||{quantity:0,min_quantity:0,unit_cost:0,supplier:""};return `<tr><td>${esc(p.name)}<br><span class="small-note">${esc(p.id)}</span></td><td><input class="input stock-field" type="number" min="0" data-stock-id="${esc(p.id)}" data-stock-key="quantity" value="${Number(s.quantity||0)}"></td><td><input class="input stock-field" type="number" min="0" data-stock-id="${esc(p.id)}" data-stock-key="min_quantity" value="${Number(s.min_quantity||0)}"></td><td><input class="input stock-field" type="number" min="0" data-stock-id="${esc(p.id)}" data-stock-key="unit_cost" value="${Number(s.unit_cost||0)}"></td><td>${money(Number(s.quantity||0)*Number(s.unit_cost||0))}</td><td><input class="input stock-field" data-stock-id="${esc(p.id)}" data-stock-key="supplier" value="${esc(s.supplier||"")}" placeholder="Fournisseur"></td></tr>`}).join("")}</tbody></table></div><p class="small-note">Une modification est enregistrée lorsque tu quittes le champ. Les seuils servent à repérer les produits à réapprovisionner.</p></div>`;
  }
  function nextProductId() {
    let max = 0; for (const p of products) { const m = /^SP(\d+)$/i.exec(p.id); if (m) max = Math.max(max, Number(m[1])); }
    return "SP" + String(max + 1).padStart(2, "0");
  }
  async function adminPacks() {
    const rows = await readRows("products"); products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop();
    const editing = editingProductId ? products.find(p => p.id === editingProductId) : null;
    const itemsStr = editing ? editing.items.join("\n") : "";
    const formTitle = editing ? `Modifier ${editing.id}` : "Ajouter un nouveau pack";
    const idLabel = editing ? editing.id : nextProductId();
    return `<div class="panel"><div class="admin-panel-head"><h3>${formTitle}</h3><span class="small-note">ID proposé : ${esc(idLabel)}</span></div><form id="packForm" class="admin-form"><input class="input full" name="name" required maxlength="150" placeholder="Nom du pack" value="${esc(editing?.name||"")}"><input class="input" name="category" required maxlength="80" placeholder="Catégorie" value="${esc(editing?.cat||"")}"><input class="input" name="price" type="number" min="0" step="1" required placeholder="Prix en FCFA" value="${editing ? Number(editing.price) : ""}"><textarea class="input full" name="description" required maxlength="1500" placeholder="Description du pack">${esc(editing?.desc||"")}</textarea><textarea class="input full" name="items" required placeholder="Composition : un élément par ligne">${esc(itemsStr)}</textarea><input class="input full" name="image_path" maxlength="500" placeholder="Chemin de l’image ou URL (facultatif)" value="${esc(editing?.image_path||"")}"><label class="full">Photo du pack (facultatif, JPG/PNG/WebP, 5 Mo maximum)<input class="input" name="image_file" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="check-label full"><input type="checkbox" name="active" ${editing?.active===false?"":"checked"}> Publier ce pack dans le catalogue</label><div class="form-actions full"><button class="btn primary" type="submit">${editing ? "Enregistrer les modifications" : "Ajouter le pack"}</button>${editing ? `<button class="btn ghost" type="button" onclick="cancelPackEdit()">Annuler</button>` : ""}</div></form></div><div style="height:16px"></div><div class="panel"><div class="admin-panel-head"><h3>Catalogue complet (${rows.length} packs)</h3><span class="small-note">Les packs masqués restent dans la gestion et le stock.</span></div>${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Pack</th><th>Catégorie</th><th>Prix</th><th>Visibilité</th><th>Actions</th></tr></thead><tbody>${rows.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><span class="small-note">${esc(p.id)}</span></td><td>${esc(p.cat)}</td><td>${money(p.price)}</td><td><span class="status ${p.active?"delivered":"cancelled"}">${p.active?"Publié":"Masqué"}</span></td><td><div class="table-actions"><button class="btn small ghost" onclick="editPack('${esc(p.id)}')">Modifier</button><button class="btn small ${p.active?"ghost":"secondary"}" onclick="togglePack('${esc(p.id)}',${!p.active})">${p.active?"Masquer":"Publier"}</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun pack disponible.</div>'}</div>`;
  }
  function editPack(id) { editingProductId = id; showAdminView("packs"); }
  function cancelPackEdit() { editingProductId = null; showAdminView("packs"); }
  async function togglePack(id, active) {
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
    const { data, error } = await client.from("settings").select("id,company,whatsapp,delivery_fee,currency").eq("id",true).maybeSingle();
    if (error) throw error;
    const s = data || appSettings;
    return `<div class="panel"><h3>Paramètres de Sama-Pack</h3><form id="settingsForm" class="admin-form"><label>Nom de l’entreprise<input class="input" name="company" required value="${esc(s.company||"SAMA-PACK")}"></label><label>WhatsApp professionnel (ex. 22177…)<input class="input" name="whatsapp" value="${esc(s.whatsapp||"")}"></label><label>Frais de livraison par défaut (FCFA)<input class="input" name="delivery_fee" type="number" min="0" step="1" value="${Number(s.delivery_fee||0)}"></label><label>Devise<input class="input" name="currency" required maxlength="10" value="${esc(s.currency||"FCFA")}"></label><button class="btn primary full" type="submit">Enregistrer les paramètres</button></form><p class="small-note">Le code administrateur par PIN n’est plus utilisé. Les accès sont gérés par compte individuel.</p></div>`;
  }
  function bindAdmin(view) {
    if (view === "packs" || view === "products") {
      const form = $("packForm"); if (form) form.onsubmit = async e => {
        e.preventDefault(); if (!isAdmin()) return toast("Accès refusé.", true); setBusy(form,true,"Enregistrement…");
        const fd = new FormData(form); const uploadFile = fd.get("image_file"); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:Number(fd.get("price")),description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on" };
        if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0) { setBusy(form,false); return toast("Complète le nom, la catégorie, le prix, la description et la composition.",true); }
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
        setBusy(form,false);
        if (result.error) return toast(errorMessage(result.error),true);
        const wasEditing = Boolean(editingProductId); editingProductId = null; toast(wasEditing ? "Pack modifié." : "Nouveau pack ajouté."); await loadPublicData(); await showAdminView("packs");
      };
    }
    if (view === "stock") document.querySelectorAll(".stock-field").forEach(input => {
      input.addEventListener("change", async () => {
        const productId = input.dataset.stockId; const key = input.dataset.stockKey; let val = input.value;
        if (key !== "supplier") { val = Number(val); if (!Number.isFinite(val) || val < 0) { toast("Valeur numérique invalide.",true); return showAdminView("stock"); } }
        const existing = stockRows.find(x=>x.product_id===productId);
        const row = { product_id: productId, quantity: Number(existing?.quantity||0), min_quantity: Number(existing?.min_quantity||0), unit_cost: Number(existing?.unit_cost||0), supplier: existing?.supplier||"" };
        row[key] = val;
        const { error } = await client.from("stock").upsert(row,{onConflict:"product_id"});
        if (error) toast(errorMessage(error),true); else { const idx = stockRows.findIndex(x=>x.product_id===productId); if (idx>=0) stockRows[idx]=row; else stockRows.push(row); toast("Stock enregistré."); }
      });
    });
    if (view === "admins") { const form = $("inviteAdminForm"); if (form) form.onsubmit = async e => {
      e.preventDefault(); setBusy(form,true,"Envoi de l’invitation…"); const fd=new FormData(form);
      const { data, error } = await client.functions.invoke("sama-invite-admin",{body:{full_name:String(fd.get("full_name")||"").trim(),email:String(fd.get("email")||"").trim().toLowerCase()}});
      setBusy(form,false); if(error || data?.error) return toast(errorMessage(error || data),true);
      toast(data?.message || "Invitation envoyée."); await showAdminView("admins");
    }; }
    if (view === "suppliers") { const form=$("supplierForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("suppliers").insert({name:String(f.get("name")||"").trim(),phone:String(f.get("phone")||"").trim(),family:String(f.get("family")||"").trim(),terms:String(f.get("terms")||"").trim()});setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Fournisseur ajouté.");await showAdminView("suppliers");}; }
    if (view === "expenses") { const form=$("expenseForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("expenses").insert({id:"DEP-"+crypto.randomUUID().slice(0,8).toUpperCase(),label:String(f.get("label")||"").trim(),amount:Number(f.get("amount")),category:String(f.get("category")||"").trim(),expense_date:String(f.get("date")||new Date().toISOString().slice(0,10))});setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Dépense enregistrée.");await showAdminView("expenses");}; }
    if (view === "quotes") { /* Le statut est enregistré dans le gestionnaire ci-dessous. */ }
    if (view === "settings") { const form=$("settingsForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("settings").update({company:String(f.get("company")||"").trim(),whatsapp:String(f.get("whatsapp")||"").replace(/\D/g,""),delivery_fee:Number(f.get("delivery_fee")),currency:String(f.get("currency")||"FCFA").trim()}).eq("id",true);setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Paramètres enregistrés.");await loadPublicData();}; }
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
    const search = $("searchBox"); if (search) search.addEventListener("input",renderProducts);
    const category = $("categoryFilter"); if(category) category.addEventListener("change",renderProducts);
    if ($("openCartBtn")) $("openCartBtn").onclick = renderCartModal;
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
    updateCategoryFilter(); renderTop(); renderProducts(); updateCartCount(); updateContact();
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
  Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus});
  start().catch(err => { console.error(err); toast("Initialisation impossible. Recharge la page ou contacte l’administrateur.",true); });
})();
