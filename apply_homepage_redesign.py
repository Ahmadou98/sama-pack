#!/usr/bin/env python3
"""Safely patch the current SAMA-PACK storefront homepage.

Run in the repository root:
  python apply_homepage_redesign.py          # validates without writing
  python apply_homepage_redesign.py --apply  # backs up and writes all three files
"""
from __future__ import annotations
import argparse
import difflib
import shutil
import sys
from datetime import datetime
from pathlib import Path


def replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected exactly 1 match, found {count}. No files were changed.")
    return src.replace(old, new, 1)


def replace_first(src: str, old: str, new: str, label: str) -> str:
    if old not in src:
        raise ValueError(f"{label}: source fragment not found. No files were changed.")
    return src.replace(old, new, 1)


def update_app(app: str) -> str:
    app = replace_once(app, '  const PROMO_ROTATE_MS = 5000;', '  const PROMO_ROTATE_MS = 6500;', 'carousel interval')
    app = replace_once(app, '  let promoCarouselTimer = null;', '  let promoCarouselTimer = null;\n  let promoCountdownTimer = null;', 'countdown timer state')
    app = replace_once(app, '  let appSettings = { company: "SAMA-PACK", whatsapp: "", deliveryFee: 1500, currency: "FCFA" };', '  let appSettings = { company: "SAMA-PACK", whatsapp: "", deliveryFee: 1500, currency: "FCFA", homepageBackgroundUrl: "" };', 'settings state')
    app = replace_first(app, 'promo_label: String(p.promo_label || "Offre spéciale") };', 'promo_label: String(p.promo_label || "Offre spéciale"), promo_end_at: p.promo_end_at || null };', 'fallback product expiry')
    app = replace_once(app, '''  function hasPromotion(p) {
    if (!p || p.promo_active !== true || p.promo_price == null || p.promo_price === "") return false;
    const regular = Number(p.price), special = Number(p.promo_price);
    return Number.isFinite(regular) && Number.isFinite(special) && special >= 0 && special < regular;
  }''', '''  function hasPromotion(p) {
    if (!p || p.promo_active !== true || p.promo_price == null || p.promo_price === "") return false;
    if (p.promo_end_at) { const end = new Date(p.promo_end_at).getTime(); if (Number.isFinite(end) && end <= Date.now()) return false; }
    const regular = Number(p.price), special = Number(p.promo_price);
    return Number.isFinite(regular) && Number.isFinite(special) && special >= 0 && special < regular;
  }''', 'promotion expiry')
    app = replace_once(app, '.select("id,name,category,price,description,items,image_path,active,promo_active,promo_price,promo_label")', '.select("id,name,category,price,description,items,image_path,active,promo_active,promo_price,promo_label,promo_end_at")', 'product select fields')
    app = replace_once(app, '.select("id,company,whatsapp,delivery_fee,currency").eq("id", true).maybeSingle();', '.select("id,company,whatsapp,delivery_fee,currency,homepage_background_url").eq("id", true).maybeSingle();', 'public settings select')
    app = replace_once(app, 'appSettings = { company: setting.company || "SAMA-PACK", whatsapp: String(setting.whatsapp || ""), deliveryFee: Number(setting.delivery_fee || 0), currency: setting.currency || "FCFA" };', 'appSettings = { company: setting.company || "SAMA-PACK", whatsapp: String(setting.whatsapp || ""), deliveryFee: Number(setting.delivery_fee || 0), currency: setting.currency || "FCFA", homepageBackgroundUrl: String(setting.homepage_background_url || "") };\n      applyHomepageBackground();', 'settings mapping')
    app = replace_once(app, '    updateContact(); updateCategoryFilter(); renderTop(); renderProducts(); updateCartCount();', '    updateContact(); updateCategoryFilter(); renderTop(); renderProducts(); renderPromoCarousel(); updateCartCount();', 'refresh live promotions')
    app = replace_once(app, '''  function updateContact() {
    const contact = $("contactPhone"); const n = waNumber();
    if (contact) contact.textContent = n ? "+" + n : "WhatsApp à configurer";
  }''', '''  function updateContact() {
    const contact = $("contactPhone"); const n = waNumber();
    if (contact) contact.textContent = n ? "+" + n : "WhatsApp à configurer";
  }
  function applyHomepageBackground() {
    const hero = $("home");
    if (!hero) return;
    const src = String(appSettings.homepageBackgroundUrl || "").trim();
    if (!/^https:\\/\\//i.test(src)) { hero.classList.remove("has-custom-bg"); hero.style.removeProperty("--hero-custom-background"); return; }
    const safeSrc = src.replace(/["\\\r\n]/g, "");
    hero.style.setProperty("--hero-custom-background", `url("${safeSrc}")`);
    hero.classList.add("has-custom-bg");
  }''', 'homepage background helper')
    old_promo = '''  function renderPromoCarousel() {
    const section = $("promoSection"), carousel = $("promoCarousel"), dots = $("promoDots");
    if (!section || !carousel) return;
    const promos = products.filter(p => p.active && hasPromotion(p));
    section.classList.toggle("hidden", promos.length === 0);
    const topPacks = $("heroTopPacks");
    if (topPacks) topPacks.classList.toggle("hidden", promos.length > 0);
    const arrows = $("promoArrows");
    if (arrows) arrows.classList.toggle("hidden", promos.length < 2);
    if (!promos.length) {
      carousel.innerHTML = "";
      if (dots) dots.innerHTML = "";
      currentPromoIndex = 0;
      return;
    }
    currentPromoIndex = ((currentPromoIndex % promos.length) + promos.length) % promos.length;
    const p = promos[currentPromoIndex];
    carousel.innerHTML = `<article class="promo-card promo-slide-in"><div class="promo-image">${promoImageOnly(p)}</div><div class="promo-copy"><span class="promo-label">${esc(p.promo_label || "Offre spéciale")}</span><h3>${esc(p.name)}</h3><div class="promo-price-line"><strong>${money(getEffectivePrice(p))}</strong><del>${money(p.price)}</del></div><div class="promo-actions"><button class="btn ghost small" onclick="openProduct('${esc(p.id)}')">Détails</button><button class="btn primary small" onclick="addToCart('${esc(p.id)}')">Ajouter</button></div></div></article>`;
    if (dots) dots.innerHTML = promos.map((item, index) => `<button class="promo-dot ${index === currentPromoIndex ? "active" : ""}" aria-label="Afficher la promotion ${index + 1}" aria-current="${index === currentPromoIndex ? "true" : "false"}" onclick="goToPromo(${index})"></button>`).join("");
  }'''
    new_promo = '''  function renderPromoCarousel() {
    const section = $("promoSection"), carousel = $("promoCarousel"), dots = $("promoDots");
    if (!section || !carousel) return;
    const promos = products.filter(p => p.active && hasPromotion(p));
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
  }'''
    app = replace_once(app, old_promo, new_promo, 'flash sale carousel function')
    app = replace_once(app, '''  function startPromoCarousel() {
    if (promoCarouselTimer) window.clearInterval(promoCarouselTimer);
    promoCarouselTimer = window.setInterval(() => {
      const count = products.filter(p => p.active && hasPromotion(p)).length;
      if (count > 1) { currentPromoIndex = (currentPromoIndex + 1) % count; renderPromoCarousel(); }
    }, PROMO_ROTATE_MS);
  }''', '''  function startPromoCarousel() {
    if (promoCarouselTimer) window.clearInterval(promoCarouselTimer);
    if (promoCountdownTimer) window.clearInterval(promoCountdownTimer);
    promoCarouselTimer = window.setInterval(() => {
      const count = products.filter(p => p.active && hasPromotion(p)).length;
      if (count > 1) { currentPromoIndex = (currentPromoIndex + 1) % count; renderPromoCarousel(); }
    }, PROMO_ROTATE_MS);
    promoCountdownTimer = window.setInterval(updatePromoCountdowns, 1000);
    updatePromoCountdowns();
  }''', 'carousel auto-rotation and countdown')
    app = replace_once(app, '  function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }', '  function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); }\n  function toLocalDateTimeInput(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }', 'datetime helper')
    old_admin = '''  async function adminSettings() {
    const [{ data, error }, { data: notificationSettings, error: notificationError }] = await Promise.all([
      client.from("settings").select("id,company,whatsapp,delivery_fee,currency").eq("id",true).maybeSingle(),
      client.from("notification_settings").select("id,order_notification_email").eq("id",true).maybeSingle()
    ]);
    if (error) throw error;
    if (notificationError) console.warn("Impossible de lire les paramètres e-mail.", notificationError);
    const s = data || appSettings;
    const notificationEmail = notificationSettings?.order_notification_email || "";
    return `<div class="panel"><h3>Paramètres de Sama-Pack</h3><form id="settingsForm" class="admin-form"><label>Nom de l’entreprise<input class="input" name="company" required value="${esc(s.company||"SAMA-PACK")}"></label><label>WhatsApp professionnel (ex. 22177…)<input class="input" name="whatsapp" value="${esc(s.whatsapp||"")}"></label><label>Frais de livraison par défaut (FCFA)<input class="input" name="delivery_fee" type="number" min="0" step="1" value="${Number(s.delivery_fee||0)}"></label><label>Devise<input class="input" name="currency" required maxlength="10" value="${esc(s.currency||"FCFA")}"></label><label class="full">E-mail recevant les nouvelles commandes et demandes de devis<input class="input" name="order_notification_email" type="email" placeholder="gestion@sama-pack.store" value="${esc(notificationEmail)}"></label><button class="btn primary full" type="submit">Enregistrer les paramètres</button></form><p class="small-note">Pour activer les e-mails, configure aussi RESEND_API_KEY et RESEND_FROM_EMAIL dans Supabase → Edge Functions → Secrets.</p></div>`;
  }'''
    new_admin = '''  async function adminSettings() {
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
  }'''
    app = replace_once(app, old_admin, new_admin, 'admin settings form')
    old_payload = 'const fd = new FormData(form); const uploadFile = fd.get("image_file"); const promoPriceInput = String(fd.get("promo_price")||"").trim(); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:Number(fd.get("price")),description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",promo_active:fd.get("promo_active")==="on",promo_price:promoPriceInput === "" ? null : Number(promoPriceInput),promo_label:String(fd.get("promo_label")||"Offre spéciale").trim() || "Offre spéciale" };'
    new_payload = 'const fd = new FormData(form); const uploadFile = fd.get("image_file"); const promoPriceInput = String(fd.get("promo_price")||"").trim(); const promoEndInput = String(fd.get("promo_end_at")||"").trim(); const payload = { name:String(fd.get("name")||"").trim(),category:String(fd.get("category")||"").trim(),price:Number(fd.get("price")),description:String(fd.get("description")||"").trim(),items:String(fd.get("items")||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),image_path:String(fd.get("image_path")||"").trim(),active:fd.get("active")==="on",promo_active:fd.get("promo_active")==="on",promo_price:promoPriceInput === "" ? null : Number(promoPriceInput),promo_label:String(fd.get("promo_label")||"Vente flash").trim() || "Vente flash",promo_end_at:promoEndInput ? new Date(promoEndInput).toISOString() : null };'
    app = replace_once(app, old_payload, new_payload, 'promo end timestamp payload')
    app = replace_once(app, 'if (payload.promo_active && (!Number.isFinite(payload.promo_price) || payload.promo_price < 0 || payload.promo_price >= payload.price)) { setBusy(form,false); return toast("Le prix promotionnel doit être positif et inférieur au prix normal.",true); }', 'if (payload.promo_active && (!Number.isFinite(payload.promo_price) || payload.promo_price < 0 || payload.promo_price >= payload.price)) { setBusy(form,false); return toast("Le prix promotionnel doit être positif et inférieur au prix normal.",true); } if (payload.promo_active && payload.promo_end_at && new Date(payload.promo_end_at).getTime() <= Date.now()) { setBusy(form,false); return toast("La fin de la vente flash doit être dans le futur.",true); }', 'validate promo end date')
    app = replace_once(app, '<label>Texte de la promotion<input class="input" name="promo_label" maxlength="80" placeholder="Offre spéciale" value="${esc(editing?.promo_label||"Offre spéciale")}"></label><p class="small-note">Le prix promotionnel doit être inférieur au prix normal. La remise est appliquée au panier et à la commande.</p>', '<label>Texte de la promotion<input class="input" name="promo_label" maxlength="80" placeholder="Vente flash" value="${esc(editing?.promo_label||"Vente flash")}"></label><label class="full">Date et heure de fin de la vente flash<input class="input" type="datetime-local" name="promo_end_at" value="${esc(toLocalDateTimeInput(editing?.promo_end_at))}"></label><p class="small-note">Le prix promotionnel doit être inférieur au prix normal. La date de fin déclenche le compte à rebours et désactive la réduction automatiquement à son échéance.</p>', 'admin pack promo end field')
    old_handler = '    if (view === "settings") { const form=$("settingsForm"); if(form) form.onsubmit=async e=>{e.preventDefault();setBusy(form,true,"Enregistrement…");const f=new FormData(form);const {error}=await client.from("settings").update({company:String(f.get("company")||"").trim(),whatsapp:String(f.get("whatsapp")||"").replace(/\\D/g,""),delivery_fee:Number(f.get("delivery_fee")),currency:String(f.get("currency")||"FCFA").trim()}).eq("id",true);if(error){setBusy(form,false);return toast(errorMessage(error),true);}const emailResult=await client.from("notification_settings").update({order_notification_email:String(f.get("order_notification_email")||"").trim()}).eq("id",true);setBusy(form,false);if(emailResult.error)return toast("Paramètres boutique enregistrés, mais l’e-mail n’a pas pu être enregistré : "+errorMessage(emailResult.error),true);toast("Paramètres et e-mail de notification enregistrés.");await loadPublicData();}; }'
    new_handler = '''    if (view === "settings") {
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
        if (homepageBackgroundUrl && !/^https:\\/\\//i.test(homepageBackgroundUrl)) {
          setBusy(form, false);
          return toast("L’URL de l’image doit commencer par https://.", true);
        }
        const {error} = await client.from("settings").update({
          company:String(f.get("company")||"").trim(),
          whatsapp:String(f.get("whatsapp")||"").replace(/\\D/g,""),
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
    }'''
    app = replace_once(app, old_handler, new_handler, 'save settings handler')
    app = replace_once(app, '    if ($("openCartBtn")) $("openCartBtn").onclick = renderCartModal;', '    if ($("openCartBtn")) $("openCartBtn").onclick = renderCartModal;\n    document.querySelectorAll("[data-mobile-action=cart]").forEach(b => b.addEventListener("click", renderCartModal));\n    document.querySelectorAll("[data-mobile-action=account]").forEach(b => b.addEventListener("click", openAccountModal));', 'mobile navigation action handlers')
    return app


def update_html(html: str) -> str:
    old_card = '''    <div class="hero-card promo-hero-card">
      <div class="hero-card-head">
        <span>🏷️ Offres &amp; packs</span>
        <div id="promoArrows" class="promo-arrows" aria-label="Navigation des promotions">
          <button class="btn ghost small" type="button" onclick="movePromo(-1)" aria-label="Promotion précédente">←</button>
          <button class="btn ghost small" type="button" onclick="movePromo(1)" aria-label="Promotion suivante">→</button>
        </div>
      </div>
      <div id="promoSection" class="promo-inline-section hidden" aria-label="Offres promotionnelles">
        <div id="promoCarousel" aria-live="polite"></div>
        <div id="promoDots" class="promo-dots" aria-label="Choisir une promotion"></div>
      </div>
      <div id="heroTopPacks" class="top-packs"></div>
    </div>'''
    new_card = '''    <div class="hero-card discovery-hero-card">
      <div class="hero-card-head">
        <span>Nos packs à découvrir</span>
        <small>Des solutions pour chaque besoin</small>
      </div>
      <div id="heroTopPacks" class="top-packs"></div>
      <a class="hero-discovery-link" href="#catalogue">Parcourir tout le catalogue <span aria-hidden="true">→</span></a>
    </div>'''
    html = replace_once(html, old_card, new_card, 'hero panel placement')
    flash_section = '''
<section id="promoSection" class="flash-section section hidden" aria-label="Vente flash">
  <div class="wrap">
    <div class="flash-section-header">
      <div>
        <div class="eyebrow">OFFRES À DURÉE LIMITÉE</div>
        <h2>Vente flash <span class="flash-title-mark">⚡</span></h2>
        <p>Les offres du moment, à ne pas laisser passer.</p>
      </div>
      <div id="promoArrows" class="promo-arrows flash-arrows" aria-label="Navigation des ventes flash">
        <button class="btn ghost" type="button" onclick="movePromo(-1)" aria-label="Vente flash précédente">←</button>
        <button class="btn ghost" type="button" onclick="movePromo(1)" aria-label="Vente flash suivante">→</button>
      </div>
    </div>
    <div id="promoCarousel" class="flash-carousel" aria-live="polite"></div>
    <div id="promoDots" class="promo-dots flash-dots" aria-label="Choisir une vente flash"></div>
  </div>
</section>
'''
    marker = '<section id="catalogue" class="section">'
    if html.count(marker) != 1:
        raise ValueError('catalogue insertion point not unique; no files were changed')
    html = html.replace(marker, flash_section + '\n' + marker, 1)
    mobile_nav = '''
<nav class="mobile-bottom-nav" aria-label="Navigation rapide">
  <a href="#home" class="mobile-nav-item"><span aria-hidden="true">⌂</span><small>Accueil</small></a>
  <a href="#catalogue" class="mobile-nav-item"><span aria-hidden="true">▦</span><small>Catalogue</small></a>
  <a href="#promoSection" class="mobile-nav-item"><span aria-hidden="true">⚡</span><small>Vente flash</small></a>
  <button type="button" class="mobile-nav-item" data-mobile-action="cart"><span aria-hidden="true">🛒</span><small>Panier</small></button>
  <button type="button" class="mobile-nav-item" data-mobile-action="account"><span aria-hidden="true">♙</span><small>Compte</small></button>
</nav>
'''
    html = replace_once(html, '</main>\n\n<footer class="footer">', '</main>\n' + mobile_nav + '\n<footer class="footer">', 'fixed mobile navigation')
    return html


CSS_APPEND = r'''

/* ===== Accueil SAMA-PACK : ventes flash immersives + fond administrable ===== */
.hero.has-custom-bg {
  background-image: linear-gradient(90deg, rgba(248,252,249,.96) 0%, rgba(255,255,255,.89) 48%, rgba(239,250,242,.62) 100%), var(--hero-custom-background);
  background-size: cover; background-position: center; background-repeat: no-repeat;
}
.hero.has-custom-bg .hero-card { background: rgba(255,255,255,.91); backdrop-filter: blur(12px); }
.discovery-hero-card { align-self: stretch; display:flex; flex-direction:column; justify-content:center; }
.discovery-hero-card .hero-card-head { display:flex; align-items:flex-start; flex-direction:column; gap:4px; }
.discovery-hero-card .hero-card-head>span { font-size:18px; font-weight:950; letter-spacing:-.03em; }
.discovery-hero-card .hero-card-head small { color:var(--muted); font-size:12px; font-weight:500; }
.discovery-hero-card .top-packs { gap:12px; }
.discovery-hero-card .mini-pack { padding:13px; border-radius:17px; transition:transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.discovery-hero-card .mini-pack:hover { transform:translateY(-2px); border-color:#b4d8bf; box-shadow:0 10px 24px rgba(23,107,67,.08); }
.discovery-hero-card .mini-icon { width:48px; height:48px; border-radius:15px; font-size:22px; flex-shrink:0; }
.hero-discovery-link { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:16px; padding:12px 14px; border-radius:13px; background:#ecfdf3; color:var(--green); font-weight:850; font-size:13px; }
.hero-discovery-link span { font-size:20px; }

/* Large, image-first Vente flash carousel */
.flash-section { background:linear-gradient(180deg,#f4f8f4 0%,#fff 100%); padding-top:62px; padding-bottom:66px; scroll-margin-top:88px; }
.flash-section-header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:24px; }
.flash-section-header h2 { margin:6px 0 0; font-size:clamp(32px,4.5vw,50px); line-height:1.04; letter-spacing:-.055em; }
.flash-section-header p { margin:10px 0 0; color:var(--muted); font-size:15px; }
.flash-title-mark { color:#ef8b24; }
.flash-arrows { display:flex; gap:8px; padding-bottom:4px; }
.flash-arrows .btn { width:46px; height:46px; padding:0; border-radius:14px; font-size:21px; }
.flash-slide { position:relative; isolation:isolate; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr); align-items:stretch; min-height:405px; overflow:hidden; border-radius:30px; background:linear-gradient(125deg,#e3f7e9 0%,#d2f0dc 50%,#0b5a36 50%,#073f29 100%); box-shadow:0 24px 58px rgba(18,75,43,.17); }
.flash-photo { position:relative; min-width:0; min-height:405px; padding:32px 26px 32px 34px; display:grid; place-items:center; overflow:hidden; background:radial-gradient(ellipse at 50% 48%,rgba(255,255,255,.98),rgba(235,249,239,.80) 64%,rgba(218,242,225,.20) 100%); }
.flash-photo::before { content:"SAMA-PACK"; position:absolute; left:25px; bottom:15px; color:rgba(22,107,67,.11); font-size:clamp(32px,5vw,64px); font-weight:1000; letter-spacing:-.07em; line-height:1; pointer-events:none; }
.flash-photo .promo-visual, .flash-photo .product-image-frame { position:relative; z-index:1; display:grid; place-items:center; width:100%; min-height:325px; height:100%; background:transparent; }
.flash-photo .product-photo { display:block; width:100%; height:335px; max-height:335px; object-fit:contain; filter:drop-shadow(0 18px 22px rgba(24,63,37,.14)); }
.flash-photo .promo-visual-empty { min-height:325px; }
.flash-content { position:relative; z-index:2; align-self:center; display:flex; flex-direction:column; gap:18px; min-width:0; margin:28px 0 28px -28px; padding:34px clamp(24px,3.2vw,44px); border:1px solid rgba(255,255,255,.22); border-radius:25px; color:#fff; background:linear-gradient(135deg,rgba(10,91,53,.95),rgba(4,59,36,.99)); box-shadow:0 18px 40px rgba(0,0,0,.15); }
.flash-kickers { display:flex; flex-wrap:wrap; gap:9px; align-items:center; }
.flash-badge { display:inline-flex; align-items:center; gap:5px; padding:7px 11px; background:#ffddae; border-radius:999px; color:#863b08; font-size:10px; letter-spacing:.09em; font-weight:1000; }
.flash-offer-label { color:#d3fbe0; font-size:12px; font-weight:800; }
.flash-copy-main h3 { margin:0; font-size:clamp(27px,3vw,39px); line-height:1.05; letter-spacing:-.045em; overflow-wrap:anywhere; }
.flash-copy-main p { margin:12px 0 0; color:rgba(255,255,255,.78); font-size:14px; line-height:1.65; }
.flash-price-row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.flash-price-row strong { color:#fff; font-size:clamp(28px,3vw,38px); font-weight:1000; line-height:1.1; letter-spacing:-.05em; }
.flash-price-row del { color:rgba(255,255,255,.6); font-size:14px; }
.flash-discount { padding:5px 8px; background:#ffdca7; color:#813c09; border-radius:8px; font-size:12px; font-weight:950; }
.flash-countdown { display:flex; flex-direction:column; gap:5px; border:1px solid rgba(255,255,255,.19); border-radius:13px; padding:11px 13px; background:rgba(255,255,255,.08); }
.flash-countdown span { color:rgba(255,255,255,.68); font-size:9px; font-weight:950; letter-spacing:.13em; }
.flash-countdown strong { color:#fff; font-size:17px; font-variant-numeric:tabular-nums; letter-spacing:.03em; }
.flash-countdown.is-open { flex-direction:row; justify-content:space-between; align-items:center; gap:10px; }
.flash-countdown.is-open strong { font-size:12px; letter-spacing:0; }
.flash-slide .promo-actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:0; }
.flash-detail-btn,.flash-add-btn { border-radius:12px; min-height:46px; padding:12px 15px; font-size:13px; font-weight:900; }
.flash-detail-btn { background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.28); color:#fff; }
.flash-detail-btn:hover { background:rgba(255,255,255,.18); }
.flash-add-btn { background:#d3fbe0; color:#075331; box-shadow:0 8px 18px rgba(0,0,0,.12); }
.flash-add-btn:hover { background:#fff; transform:translateY(-1px); }
.flash-dots { display:flex; justify-content:center; gap:8px; margin-top:19px; }
.flash-dots:empty { display:none; }
.flash-dots .promo-dot { border:0; width:8px; height:8px; padding:0; border-radius:999px; background:#c9d8ce; cursor:pointer; transition:width .2s ease,background .2s ease; }
.flash-dots .promo-dot.active { width:26px; background:var(--green); }
.flash-empty { display:flex; align-items:center; gap:22px; min-height:210px; padding:clamp(24px,5vw,50px); border:1px solid #dcebe0; border-radius:25px; background:linear-gradient(115deg,#f1fbf4,#fff); }
.flash-empty-icon { flex:0 0 68px; width:68px; height:68px; display:grid; place-items:center; border-radius:20px; background:#d8f7e2; color:#0c7947; font-size:34px; }
.flash-empty strong { font-size:22px; letter-spacing:-.03em; }
.flash-empty p { color:var(--muted); margin:6px 0 18px; font-size:14px; }
.homepage-bg-preview-wrap { display:grid; gap:8px; }
.homepage-bg-preview { width:min(420px,100%); max-height:160px; object-fit:cover; border-radius:13px; border:1px solid var(--line); }

/* Fixed mobile shortcuts: users jump straight to the section they need */
.mobile-bottom-nav { display:none; }
html { scroll-padding-top:88px; }
@media (max-width:900px) {
  .flash-slide { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .flash-content { padding:28px 24px; }
  .flash-photo { padding:24px 18px; }
}
@media (max-width:700px) {
  body { padding-bottom:calc(86px + env(safe-area-inset-bottom)); }
  .mobile-bottom-nav { position:fixed; left:50%; bottom:calc(8px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:45; width:min(560px,calc(100% - 18px)); display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px; padding:7px 5px; border:1px solid rgba(220,233,224,.95); border-radius:20px; background:rgba(255,255,255,.96); box-shadow:0 10px 34px rgba(9,49,27,.20); backdrop-filter:blur(18px); }
  .mobile-nav-item { min-width:0; min-height:55px; padding:5px 1px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:13px; background:transparent; color:#53645a; cursor:pointer; }
  .mobile-nav-item span { font-size:20px; line-height:1.1; }
  .mobile-nav-item small { font-size:9px; font-weight:850; white-space:nowrap; }
  .mobile-nav-item:hover,.mobile-nav-item:focus-visible { color:var(--green); background:#edf9f0; outline:none; }
  .flash-section { padding:38px 0 42px; }
  .flash-section-header { align-items:center; gap:12px; margin-bottom:17px; }
  .flash-section-header h2 { font-size:33px; }
  .flash-section-header p { max-width:260px; font-size:12px; line-height:1.5; }
  .flash-arrows { gap:5px; }
  .flash-arrows .btn { width:38px; height:38px; font-size:18px; }
  .flash-slide { display:flex; flex-direction:column; min-height:0; border-radius:23px; background:#083f2a; }
  .flash-photo { min-height:235px; height:235px; padding:15px 20px 0; }
  .flash-photo::before { left:12px; bottom:7px; font-size:32px; }
  .flash-photo .promo-visual,.flash-photo .product-image-frame { min-height:210px; }
  .flash-photo .product-photo { height:215px; max-height:215px; }
  .flash-content { margin:-34px 11px 11px; padding:22px 19px; gap:14px; border-radius:19px; }
  .flash-copy-main h3 { font-size:27px; }
  .flash-copy-main p { font-size:12px; margin-top:8px; }
  .flash-price-row strong { font-size:29px; }
  .flash-price-row del { font-size:12px; }
  .flash-countdown strong { font-size:15px; }
  .flash-slide .promo-actions { display:grid; grid-template-columns:1fr 1.2fr; }
  .flash-detail-btn,.flash-add-btn { padding:10px 8px; font-size:12px; }
  .flash-empty { min-height:0; gap:14px; padding:22px 17px; border-radius:20px; align-items:flex-start; }
  .flash-empty-icon { flex-basis:48px; width:48px; height:48px; border-radius:15px; font-size:25px; }
  .flash-empty strong { font-size:17px; }
  .flash-empty p { font-size:12px; line-height:1.6; }
  .hero.has-custom-bg { background-image:linear-gradient(90deg,rgba(250,253,250,.94),rgba(255,255,255,.82)),var(--hero-custom-background); }
  .discovery-hero-card .mini-pack { padding:10px; }
  .toast { bottom:calc(92px + env(safe-area-inset-bottom)); right:12px; left:12px; text-align:center; }
}
@media (prefers-reduced-motion:reduce) {
  .flash-slide,.flash-photo img,.mobile-nav-item { animation:none!important; transition:none!important; }
}
'''


def update_css(css: str) -> str:
    marker = '/* ===== Accueil SAMA-PACK : ventes flash immersives + fond administrable ===== */'
    if marker in css:
        raise ValueError('Homepage redesign CSS already seems present; refusing to append twice.')
    return css.rstrip() + CSS_APPEND + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description='Patch SAMA-PACK home, flash sales, and mobile navigation.')
    parser.add_argument('--apply', action='store_true', help='write the changes after all matching checks pass')
    parser.add_argument('--directory', default='.', help='repository root (default: current directory)')
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    names = ('app.js', 'index.html', 'styles.css')
    paths = {name: root / name for name in names}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        print('Fichiers manquants :\n' + '\n'.join(missing), file=sys.stderr)
        print('Place ce script à la racine du dépôt SAMA-PACK et relance-le.', file=sys.stderr)
        return 2
    original = {name: paths[name].read_text(encoding='utf-8') for name in names}
    try:
        updated = {
            'app.js': update_app(original['app.js']),
            'index.html': update_html(original['index.html']),
            'styles.css': update_css(original['styles.css']),
        }
    except Exception as exc:
        print(f'Contrôle arrêté : {exc}', file=sys.stderr)
        print('Aucun fichier n’a été écrit.', file=sys.stderr)
        return 3
    assertions = {
        'upload image de fond dans les paramètres': 'homepage_background_file' in updated['app.js'],
        'stockage URL du fond': 'homepage_background_url: homepageBackgroundUrl' in updated['app.js'],
        'compte à rebours des promos': 'data-countdown-end' in updated['app.js'] and 'updatePromoCountdowns' in updated['app.js'],
        'date de fin éditable dans Gestion → Packs': 'name="promo_end_at"' in updated['app.js'],
        'section vente flash en pleine largeur': 'class="flash-section section hidden"' in updated['index.html'],
        'navigation mobile rapide': 'class="mobile-bottom-nav"' in updated['index.html'],
        'styles responsive ajoutés': '/* ===== Accueil SAMA-PACK' in updated['styles.css'],
    }
    if not all(assertions.values()):
        print('Échec des assertions : ' + repr(assertions), file=sys.stderr)
        return 4
    print('Vérifications réussies :')
    for label in assertions:
        print('  ✓ ' + label)
    for name in names:
        diff = list(difflib.unified_diff(original[name].splitlines(), updated[name].splitlines(), fromfile=name, tofile=name + '.new', n=1))
        print(f'  {name}: {len(original[name])} -> {len(updated[name])} caractères, {len(diff)} lignes de diff')
    if not args.apply:
        print('\nSimulation uniquement. Aucun fichier n’a été écrit. Relance avec --apply pour appliquer les changements.')
        return 0
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backups = []
    try:
        for name in names:
            backup = paths[name].with_name(paths[name].name + f'.bak-{stamp}')
            shutil.copy2(paths[name], backup)
            backups.append(backup)
        for name in names:
            paths[name].write_text(updated[name], encoding='utf-8')
    except Exception as exc:
        for name in names:
            # restore from backup if one was made
            backup = next((b for b in backups if b.name.startswith(paths[name].name + '.bak-')), None)
            if backup and backup.exists():
                shutil.copy2(backup, paths[name])
        print(f'Erreur d’écriture; tentative de restauration effectuée : {exc}', file=sys.stderr)
        return 5
    print('\nModifications appliquées. Sauvegardes créées :')
    for backup in backups:
        print('  ' + str(backup.name))
    print('\nÉtape suivante : exécute `node --check app.js` puis `git diff --check`, inspecte `git diff`, puis commit/push dans GitHub Codespaces.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
