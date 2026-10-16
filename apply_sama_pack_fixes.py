#!/usr/bin/env python3
# Applique les améliorations demandées à SAMA-PACK.
# Depuis la racine du dépôt : python apply_sama_pack_fixes.py --apply
from pathlib import Path
import argparse
import re
import sys

def replace_once(src, old, new, label):
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: une occurrence attendue, {count} trouvée(s).")
    return src.replace(old, new, 1)

def replace_span(src, start, end, new, label):
    a = src.find(start)
    b = src.find(end, a + len(start))
    if a < 0 or b < 0 or src.find(start, a + len(start)) >= 0:
        raise RuntimeError(f"{label}: bloc introuvable ou non unique.")
    return src[:a] + new + src[b:]

def modify_app(js):
    js = replace_once(js, '  const CART_KEY = "sama_pack_cart_v2";',
        '  const CART_KEY = "sama_pack_cart_v2";\n  const PRODUCTS_PER_PAGE = 20;\n  const PROMO_ROTATE_MS = 5000;\n  let currentProductPage = 1;\n  let currentPromoIndex = 0;\n  let promoCarouselTimer = null;', "État pagination")
    js = replace_once(js,
        '    return { id: String(p.id), name: String(p.name || "Pack"), cat: String(p.cat || p.category || "Autre"), category: String(p.cat || p.category || "Autre"), price: Number(p.price || 0), desc: String(p.desc || p.description || ""), description: String(p.desc || p.description || ""), items: Array.isArray(p.items) ? p.items : [], image_path: p.image_path || "", active: p.active !== false };',
        '    return { id: String(p.id), name: String(p.name || "Pack"), cat: String(p.cat || p.category || "Autre"), category: String(p.cat || p.category || "Autre"), price: Number(p.price || 0), desc: String(p.desc || p.description || ""), description: String(p.desc || p.description || ""), items: Array.isArray(p.items) ? p.items : [], image_path: p.image_path || "", active: p.active !== false, promo_active: p.promo_active === true, promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale") };',
        "Normalisation du catalogue de secours")
    js = replace_once(js,
        '    return { ...p, id: String(p.id), cat: String(p.category || p.cat || "Autre"), category: String(p.category || p.cat || "Autre"), price: Number(p.price || 0), desc: String(p.description || p.desc || ""), description: String(p.description || p.desc || ""), items: Array.isArray(p.items) ? p.items : [], image_path: String(p.image_path || ""), active: p.active !== false };',
        '    return { ...p, id: String(p.id), cat: String(p.category || p.cat || "Autre"), category: String(p.category || p.cat || "Autre"), price: Number(p.price || 0), desc: String(p.description || p.desc || ""), description: String(p.description || p.desc || ""), items: Array.isArray(p.items) ? p.items : [], image_path: String(p.image_path || ""), active: p.active !== false, promo_active: p.promo_active === true, promo_price: p.promo_price == null || p.promo_price === "" ? null : Number(p.promo_price), promo_label: String(p.promo_label || "Offre spéciale") };',
        "Normalisation du produit")
    js = replace_once(js, "  function loadCart() {", r'''  function hasPromotion(p) {
    if (!p || p.promo_active !== true || p.promo_price == null || p.promo_price === "") return false;
    const regular = Number(p.price), special = Number(p.promo_price);
    return Number.isFinite(regular) && Number.isFinite(special) && special >= 0 && special < regular;
  }
  function getEffectivePrice(p) { return hasPromotion(p) ? Number(p.promo_price) : Number(p?.price || 0); }
  function priceDisplayHtml(p) {
    if (!hasPromotion(p)) return `<div class="price">${money(p.price)}</div>`;
    return `<div class="promo-price-block"><div class="price">${money(getEffectivePrice(p))}</div><div class="old-price">${money(p.price)}</div></div><span class="promo-label">${esc(p.promo_label || "Offre spéciale")}</span>`;
  }
  function loadCart() {''', "Calcul des prix promotionnels")
    js = replace_once(js, '.select("id,name,category,price,description,items,image_path,active")',
        '.select("id,name,category,price,description,items,image_path,active,promo_active,promo_price,promo_label")', "Lecture des promotions")
    js = replace_span(js, "  function renderTop() {", "  function imageOrEmoji(", r'''  function renderTop() {
    const el = $("heroTopPacks"); if (!el) return;
    const tops = products.filter(p => p.active).sort((a,b) => Number(hasPromotion(b)) - Number(hasPromotion(a))).slice(0, 3);
    el.innerHTML = tops.map(p => `<div class="mini-pack"><div class="mini-icon">${iconById[p.id] || "📦"}</div><div><strong>${esc(p.name)}</strong><small>${money(getEffectivePrice(p))}${hasPromotion(p) ? " · Promo" : ""}</small></div></div>`).join("") || '<div class="empty">Les packs seront bientôt disponibles.</div>';
  }
  function renderPromoCarousel() {
    const section = $("promoSection"), carousel = $("promoCarousel"), dots = $("promoDots");
    if (!section || !carousel) return;
    const promos = products.filter(p => p.active && hasPromotion(p));
    section.classList.toggle("hidden", promos.length === 0);
    if (!promos.length) { carousel.innerHTML = ""; if (dots) dots.innerHTML = ""; currentPromoIndex = 0; return; }
    currentPromoIndex = ((currentPromoIndex % promos.length) + promos.length) % promos.length;
    const p = promos[currentPromoIndex];
    carousel.innerHTML = `<article class="promo-card"><div class="promo-image">${imageOrEmoji(p, "promo-visual")}</div><div class="promo-copy"><span class="eyebrow">OFFRE DU MOMENT</span><h3>${esc(p.name)}</h3><p>${esc(p.desc || "")}</p><div class="promo-price-line"><strong>${money(getEffectivePrice(p))}</strong><del>${money(p.price)}</del><span class="promo-label">${esc(p.promo_label || "Offre spéciale")}</span></div><div class="promo-actions"><button class="btn primary" onclick="addToCart('${esc(p.id)}')">Ajouter au panier</button><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Voir le pack</button></div><small>Offre valable 24h.</small></div></article>`;
    if (dots) dots.innerHTML = promos.map((item, index) => `<button class="promo-dot ${index === currentPromoIndex ? "active" : ""}" aria-label="Afficher la promotion ${index + 1}" aria-current="${index === currentPromoIndex ? "true" : "false"}" onclick="goToPromo(${index})"></button>`).join("");
  }
  function movePromo(direction) {
    const count = products.filter(p => p.active && hasPromotion(p)).length;
    if (count < 2) return;
    currentPromoIndex = (currentPromoIndex + direction + count) % count;
    renderPromoCarousel();
  }
  function goToPromo(index) { currentPromoIndex = Math.max(0, Number(index) || 0); renderPromoCarousel(); }
  function startPromoCarousel() {
    if (promoCarouselTimer) window.clearInterval(promoCarouselTimer);
    promoCarouselTimer = window.setInterval(() => {
      const count = products.filter(p => p.active && hasPromotion(p)).length;
      if (count > 1) { currentPromoIndex = (currentPromoIndex + 1) % count; renderPromoCarousel(); }
    }, PROMO_ROTATE_MS);
  }
''', "Carrousel des promotions")
    js = replace_span(js, "  function renderProducts() {", "  function openProduct(id) {", r'''  function renderProducts() {
    const grid = $("productGrid"); if (!grid) return;
    const q = String($("searchBox")?.value || "").toLowerCase().trim();
    const c = $("categoryFilter")?.value || "all";
    const arr = products.filter(p => p.active && (c === "all" || p.cat === c) && [p.name,p.desc,p.cat,...p.items].join(" ").toLowerCase().includes(q));
    const pages = Math.max(1, Math.ceil(arr.length / PRODUCTS_PER_PAGE));
    currentProductPage = Math.min(Math.max(1, currentProductPage), pages);
    const start = (currentProductPage - 1) * PRODUCTS_PER_PAGE;
    grid.innerHTML = arr.slice(start, start + PRODUCTS_PER_PAGE).map(productCard).join("") || '<div class="empty">Aucun pack trouvé. Essaie une autre recherche.</div>';
    const pagination = $("productPagination");
    if (pagination) pagination.innerHTML = arr.length > PRODUCTS_PER_PAGE ? `<button class="btn ghost small" ${currentProductPage === 1 ? "disabled" : ""} onclick="goToProductPage(${currentProductPage - 1})">← Précédent</button><span>Page ${currentProductPage} / ${pages} · ${arr.length} packs</span><button class="btn ghost small" ${currentProductPage === pages ? "disabled" : ""} onclick="goToProductPage(${currentProductPage + 1})">Suivant →</button>` : "";
  }
  function goToProductPage(page) {
    currentProductPage = Math.max(1, Number(page) || 1);
    renderProducts();
    $("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function productCard(p) {
    const photo = p.image_path ? `<img class="product-photo" src="${esc(/^https?:\/\//i.test(p.image_path) ? p.image_path : p.image_path.replace(/^\//,""))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    return `<article class="product-card"><div class="pack-visual ${p.image_path ? "has-photo" : ""}">${photo}<div class="pack-box ${p.image_path ? "photo-fallback" : ""}" ${p.image_path ? "style=\"display:none\"" : ""}><div class="emoji">${iconById[p.id] || "📦"}</div><div class="pack-code">${esc(p.id)}</div></div>${hasPromotion(p) ? `<span class="product-promo-ribbon">${esc(p.promo_label || "Promo")}</span>` : ""}</div><div class="product-body"><div class="product-cat">${esc(p.cat)}</div><div class="product-name">${esc(p.name)}</div><div class="product-desc">${esc(p.desc)}</div><div class="price-row">${priceDisplayHtml(p)}<span class="small-note">TTC</span></div><div class="product-actions"><button class="btn ghost" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary" onclick="addToCart('${esc(p.id)}')">Ajouter</button></div></div></article>`;
  }
''', "Pagination et cartes produit")
    js = replace_once(js,
        '<div class="price-row"><div class="price">${money(p.price)}</div><button class="btn primary" onclick="addToCart(\'${esc(p.id)}\');closeModal()">Ajouter au panier</button></div>',
        '<div class="price-row">${priceDisplayHtml(p)}<button class="btn primary" onclick="addToCart(\'${esc(p.id)}\');closeModal()">Ajouter au panier</button></div>',
        "Prix de la fiche produit")
    js = replace_once(js,
        'function cartTotals() { const subtotal = cart.reduce((sum, i) => sum + (getP(i.id)?.price || 0) * i.qty, 0);',
        'function cartTotals() { const subtotal = cart.reduce((sum, i) => sum + getEffectivePrice(getP(i.id)) * i.qty, 0);',
        "Total du panier")
    js = replace_once(js, '${money(p.price)} / pack</div></div><div class="qty">', '${money(getEffectivePrice(p))} / pack</div></div><div class="qty">', "Prix unitaire du panier")
    js = replace_span(js, "  async function markNotificationRead(id) {", "\n\n  function checkoutModal() {", r'''  async function markNotificationRead(id) {
    if (!client || !currentUser) return toast("Connecte-toi pour modifier tes notifications.", true);
    const { data, error } = await client.rpc("sama_mark_notification_read", { p_notification_id: id });
    if (error) return toast(errorMessage(error), true);
    if (data === false) return toast("Cette notification n’a pas pu être marquée comme lue.", true);
    const readAt = new Date().toISOString();
    userNotifications = userNotifications.map(n => n.id === id ? { ...n, read_at: n.read_at || readAt } : n);
    updateAccountButtons();
    await loadAndShowNotifications();
    toast("Notification marquée comme lue.");
  }''', "Correction des notifications")
    js = replace_once(js,
        '<input class="input full" name="image_path" maxlength="500" placeholder="Chemin de l’image ou URL (facultatif)" value="${esc(editing?.image_path||"")}"><label class="full">Photo du pack',
        '<input class="input full" name="image_path" maxlength="500" placeholder="Chemin de l’image ou URL (facultatif)" value="${esc(editing?.image_path||"")}"><div class="promo-admin-fields full"><label class="check-label"><input type="checkbox" name="promo_active" ${editing?.promo_active===true ? "checked" : ""}> Afficher ce pack dans les promotions</label><label>Prix promotionnel (FCFA)<input class="input" name="promo_price" type="number" min="0" step="1" placeholder="Ex. 12 000" value="${editing?.promo_price == null ? "" : Number(editing.promo_price)}"></label><label>Texte de la promotion<input class="input" name="promo_label" maxlength="80" placeholder="Offre spéciale" value="${esc(editing?.promo_label||"Offre spéciale")}"></label><p class="small-note">Le prix promotionnel doit être inférieur au prix normal. La remise est appliquée au panier et à la commande.</p></div><label class="full">Photo du pack',
        "Champs de promotion dans l’admin")
    js = replace_once(js,
        'const fd = new FormData(form); const uploadFile = fd.get("image_file"); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:Number(fd.get("price")),description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on" };',
        'const fd = new FormData(form); const uploadFile = fd.get("image_file"); const promoPriceInput = String(fd.get("promo_price")||"").trim(); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:Number(fd.get("price")),description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",promo_active:fd.get("promo_active")==="on",promo_price:promoPriceInput === "" ? null : Number(promoPriceInput),promo_label:String(fd.get("promo_label")||"Offre spéciale").trim() || "Offre spéciale" };',
        "Sauvegarde des promotions")
    js = replace_once(js,
        'if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0) { setBusy(form,false); return toast("Complète le nom, la catégorie, le prix, la description et la composition.",true); }',
        'if (!payload.name || !payload.category || !payload.description || !payload.items.length || !Number.isFinite(payload.price) || payload.price < 0) { setBusy(form,false); return toast("Complète le nom, la catégorie, le prix, la description et la composition.",true); } if (payload.promo_active && (!Number.isFinite(payload.promo_price) || payload.promo_price < 0 || payload.promo_price >= payload.price)) { setBusy(form,false); return toast("Le prix promotionnel doit être positif et inférieur au prix normal.",true); } if (!payload.promo_active && !Number.isFinite(payload.promo_price)) payload.promo_price = null;',
        "Validation du prix promotionnel")
    pattern = re.compile(r'  async function adminSettings\(\) \{[\s\S]*?\n  \}\n  function bindAdmin\(view\) \{')
    if len(pattern.findall(js)) != 1:
        raise RuntimeError("Bloc des paramètres de gestion introuvable ou non unique.")
    js = pattern.sub(r'''  async function adminSettings() {
    const [{ data, error }, { data: notificationSettings, error: notificationError }] = await Promise.all([
      client.from("settings").select("id,company,whatsapp,delivery_fee,currency").eq("id",true).maybeSingle(),
      client.from("notification_settings").select("id,order_notification_email").eq("id",true).maybeSingle()
    ]);
    if (error) throw error;
    if (notificationError) console.warn("Impossible de lire les paramètres e-mail.", notificationError);
    const s = data || appSettings;
    const notificationEmail = notificationSettings?.order_notification_email || "";
    return `<div class="panel"><h3>Paramètres de Sama-Pack</h3><form id="settingsForm" class="admin-form"><label>Nom de l’entreprise<input class="input" name="company" required value="${esc(s.company||"SAMA-PACK")}"></label><label>WhatsApp professionnel (ex. 22177…)<input class="input" name="whatsapp" value="${esc(s.whatsapp||"")}"></label><label>Frais de livraison par défaut (FCFA)<input class="input" name="delivery_fee" type="number" min="0" step="1" value="${Number(s.delivery_fee||0)}"></label><label>Devise<input class="input" name="currency" required maxlength="10" value="${esc(s.currency||"FCFA")}"></label><label class="full">E-mail recevant les nouvelles commandes et demandes de devis<input class="input" name="order_notification_email" type="email" placeholder="gestion@sama-pack.store" value="${esc(notificationEmail)}"></label><button class="btn primary full" type="submit">Enregistrer les paramètres</button></form><p class="small-note">Pour activer les e-mails, configure aussi RESEND_API_KEY et RESEND_FROM_EMAIL dans Supabase → Edge Functions → Secrets.</p></div>`;
  }
  function bindAdmin(view) {''', js, count=1)
    js = replace_once(js,
        'if (view === "settings") { const form=$("settingsForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("settings").update({company:String(f.get("company")||"").trim(),whatsapp:String(f.get("whatsapp")||"").replace(/\\D/g,""),delivery_fee:Number(f.get("delivery_fee")),currency:String(f.get("currency")||"FCFA").trim()}).eq("id",true);setBusy(form,false);if(error)return toast(errorMessage(error),true);toast("Paramètres enregistrés.");await loadPublicData();}; }',
        'if (view === "settings") { const form=$("settingsForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("settings").update({company:String(f.get("company")||"").trim(),whatsapp:String(f.get("whatsapp")||"").replace(/\\D/g,""),delivery_fee:Number(f.get("delivery_fee")),currency:String(f.get("currency")||"FCFA").trim()}).eq("id",true);if(error){setBusy(form,false);return toast(errorMessage(error),true);}const emailResult=await client.from("notification_settings").update({order_notification_email:String(f.get("order_notification_email")||"").trim()}).eq("id",true);setBusy(form,false);if(emailResult.error)return toast("Paramètres boutique enregistrés, mais l’e-mail n’a pas pu être enregistré : "+errorMessage(emailResult.error),true);toast("Paramètres et e-mail de notification enregistrés.");await loadPublicData();}; }',
        "Enregistrement de l’adresse destinataire")
    js = replace_once(js, 'if (search) search.addEventListener("input",renderProducts);', 'if (search) search.addEventListener("input",() => { currentProductPage = 1; renderProducts(); });', "Réinitialisation pagination recherche")
    js = replace_once(js, 'if(category) category.addEventListener("change",renderProducts);', 'if(category) category.addEventListener("change",() => { currentProductPage = 1; renderProducts(); });', "Réinitialisation pagination catégorie")
    js = replace_once(js, 'updateCategoryFilter(); renderTop(); renderProducts(); updateCartCount(); updateContact();', 'updateCategoryFilter(); renderTop(); renderProducts(); renderPromoCarousel(); startPromoCarousel(); updateCartCount(); updateContact();', "Démarrage du carrousel")
    js = replace_once(js, 'const rows = await readRows("products"); products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop();', 'const rows = await readRows("products"); products = rows.map(normalizeProduct); updateCategoryFilter(); renderProducts(); renderTop(); renderPromoCarousel();', "Rafraîchissement des promotions après édition")
    js = replace_once(js,
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus});',
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo});',
        "Export des fonctions publiques")
    if r'\n        if (payload.promo_active' in js:
        raise RuntimeError("Saut de ligne échappé imprévu dans le code JS.")
    return js

def modify_html(html):
    html = replace_once(html, '</section>\n\n<section id="catalogue" class="section">', '''</section>

<section id="promoSection" class="section promo-section hidden" aria-label="Offres promotionnelles">
  <div class="wrap">
    <div class="section-head promo-section-head">
      <div><div class="eyebrow">SÉLECTION SAMA-PACK</div><h2>Offres du moment</h2><p class="muted">Des réductions sélectionnées par notre équipe.</p></div>
      <div class="promo-arrows"><button class="btn ghost small" type="button" onclick="movePromo(-1)" aria-label="Promotion précédente">←</button><button class="btn ghost small" type="button" onclick="movePromo(1)" aria-label="Promotion suivante">→</button></div>
    </div>
    <div id="promoCarousel" aria-live="polite"></div>
    <div id="promoDots" class="promo-dots" aria-label="Choisir une promotion"></div>
  </div>
</section>

<section id="catalogue" class="section">''', "Section d’offres promotionnelles")
    return replace_once(html, '    <div id="productGrid" class="product-grid"></div>', '    <div id="productGrid" class="product-grid"></div>\n    <div id="productPagination" class="product-pagination" aria-label="Pagination du catalogue"></div>', "Contrôles de pagination")

def modify_css(css):
    if "SAMA-PACK: promotions, pagination et catalogue mobile à deux colonnes" in css:
        raise RuntimeError("Les styles ciblés semblent déjà avoir été ajoutés.")
    return css + r'''

/* SAMA-PACK: promotions, pagination et catalogue mobile à deux colonnes */
.promo-section { background:linear-gradient(180deg,#f0fdf4 0%,#fff 100%); }
.promo-section-head { align-items:center; }
.promo-section-head .muted { margin:10px 0 0; }
.promo-arrows { display:flex; gap:8px; flex-shrink:0; }
.promo-card { display:grid; grid-template-columns:minmax(0,0.95fr) minmax(0,1.05fr); overflow:hidden; border:1px solid #bbf7d0; border-radius:24px; background:#fff; box-shadow:0 18px 46px rgba(15,23,42,.08); min-height:300px; }
.promo-image { display:flex; align-items:center; justify-content:center; min-height:300px; padding:22px; background:linear-gradient(135deg,#dcfce7,#f8fafc); }
.promo-image .promo-visual { width:100%; min-height:250px; display:flex; align-items:center; justify-content:center; }
.promo-image .product-photo { width:100%; height:260px; min-height:260px; object-fit:contain; }
.promo-image .pack-box { width:190px; height:135px; }
.promo-copy { padding:30px; display:flex; flex-direction:column; align-items:flex-start; gap:12px; }
.promo-copy h3 { margin:0; font-size:clamp(22px,3vw,32px); line-height:1.15; }
.promo-copy p { margin:0; color:var(--muted); line-height:1.6; }
.promo-price-line { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin:2px 0; }
.promo-price-line strong { font-size:27px; font-weight:950; color:#166534; }
.promo-price-line del,.old-price { color:#94a3b8; font-size:13px; }
.promo-label,.product-promo-ribbon { background:#dc2626; color:#fff; border-radius:999px; font-size:11px; font-weight:850; padding:5px 9px; }
.promo-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
.promo-copy small { color:var(--muted); font-size:11px; margin-top:auto; }
.promo-dots { display:flex; justify-content:center; gap:8px; margin-top:16px; }
.promo-dot { width:9px; height:9px; padding:0; border:0; border-radius:999px; background:#bbf7d0; cursor:pointer; }
.promo-dot.active { width:25px; background:#15803d; }
.product-promo-ribbon { position:absolute; z-index:2; left:12px; top:12px; }
.promo-price-block { display:flex; flex-direction:column; align-items:flex-start; gap:1px; }
.price-row .promo-label { white-space:nowrap; }
.promo-admin-fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; border:1px dashed #bbf7d0; border-radius:14px; padding:12px; background:#f8fffb; }
.promo-admin-fields .check-label,.promo-admin-fields p { grid-column:1/-1; }
.product-pagination { display:flex; align-items:center; justify-content:center; gap:14px; padding-top:26px; color:var(--muted); font-size:13px; }
.product-pagination:empty { display:none; }
.product-pagination button:disabled { opacity:.45; cursor:not-allowed; }
@media(max-width:700px) {
  .promo-card { grid-template-columns:1fr; }
  .promo-image { min-height:175px; padding:12px; }
  .promo-image .promo-visual { min-height:170px; }
  .promo-image .product-photo { height:180px; min-height:180px; }
  .promo-copy { padding:18px; }
  .promo-copy h3 { font-size:22px; }
  .promo-section-head { flex-direction:row; align-items:center; }
  .promo-admin-fields { grid-template-columns:1fr; }
  .product-pagination { gap:8px; font-size:11px; padding-top:18px; flex-wrap:wrap; }
}
@media(max-width:600px) {
  .product-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:9px; }
  .product-card { min-width:0; border-radius:13px; }
  .product-card .pack-visual.has-photo .product-photo { height:145px; min-height:145px; padding:5px; object-fit:contain; }
  .product-card .pack-visual { min-height:145px; padding:8px; }
  .product-card .pack-box { width:100px; height:76px; border-radius:12px; }
  .product-card .pack-box .emoji { font-size:28px; }
  .product-card .pack-box .pack-code { font-size:10px; }
  .product-body { padding:10px; gap:7px; }
  .product-name { font-size:13px; line-height:1.25; overflow-wrap:anywhere; }
  .product-cat { font-size:9px; letter-spacing:.06em; }
  .product-desc { font-size:11px; line-height:1.35; min-height:0; }
  .product-card .price { font-size:15px; line-height:1.2; }
  .product-card .old-price { font-size:10px; }
  .product-card .promo-label { font-size:9px; padding:4px 6px; }
  .product-card .price-row { align-items:flex-start; gap:4px; flex-wrap:wrap; }
  .product-card .small-note { font-size:9px; }
  .product-actions { gap:5px; }
  .product-actions .btn { min-width:0; padding:8px 5px; font-size:10px; border-radius:9px; }
}
'''

def main():
    parser = argparse.ArgumentParser(description="Correctifs SAMA-PACK")
    parser.add_argument("--apply", action="store_true", help="écrit les fichiers après vérification")
    parser.add_argument("--directory", default=".", help="chemin de la racine du dépôt")
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    paths = {n: root/n for n in ("app.js","index.html","styles.css")}
    absent = [str(p) for p in paths.values() if not p.is_file()]
    if absent:
        print("Fichiers introuvables:\n" + "\n".join(absent), file=sys.stderr)
        return 2
    originals = {n:p.read_text(encoding="utf-8") for n,p in paths.items()}
    try:
        changed = {
            "app.js": modify_app(originals["app.js"]),
            "index.html": modify_html(originals["index.html"]),
            "styles.css": modify_css(originals["styles.css"]),
        }
    except Exception as exc:
        print(f"Aucun fichier modifié; contrôle interrompu: {exc}", file=sys.stderr)
        return 3
    print("Contrôle à blanc réussi:")
    for n in paths:
        print(f"  {n}: {len(originals[n])} -> {len(changed[n])} caractères")
    print("Fonctions ajoutées: lecture notification via RPC, promotions dans l’admin, carrousel auto, pagination 20/page, 2 colonnes mobile et réglage e-mail.")
    if not args.apply:
        print("Aucun fichier écrit. Utilise --apply pour appliquer ces changements.")
        return 0
    for n,p in paths.items():
        p.write_text(changed[n], encoding="utf-8")
    print("Modifications écrites. Exécute git diff puis commit/push pour publier.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
