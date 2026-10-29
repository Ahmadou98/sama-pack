import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const SITE_URL = "https://sama-pack.store";
const FUNCTION_URL = SUPABASE_URL + "/functions/v1/sama-customer-marketing";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = new Set([
  "https://sama-pack.store",
  "https://www.sama-pack.store",
  "https://sama-pack.ahmadoulaminediouf39.workers.dev",
]);

function corsHeaders(origin: string | null) {
  const permitted = Boolean(origin && (
    allowedOrigins.has(origin) ||
    /^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)
  ));
  return {
    "Access-Control-Allow-Origin": permitted ? origin! : SITE_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sama-internal-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function html(body: string, status = 200, origin: string | null = null) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch] ?? ch);
}

function money(value: unknown): string {
  return (Number(value) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " FCFA";
}

function fmtDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Dakar", day: "2-digit", month: "long", year: "numeric",
  }).format(d);
}

function emailValid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    value.trim().length <= 254;
}

function getMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dakar", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return year + "-" + month;
}

function firstName(fullName: unknown): string {
  const name = String(fullName ?? "").trim();
  return name.split(/\s+/).filter(Boolean)[0] || "Bonjour";
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function isAdminOrInternal(req: Request): Promise<boolean> {
  const suppliedInternalToken = req.headers.get("x-sama-internal-token") ?? "";
  if (suppliedInternalToken) {
    const { data: settings, error } = await supabase.from("notification_settings")
      .select("webhook_token").eq("id", true).maybeSingle();
    if (!error && settings?.webhook_token &&
      await constantTimeEqual(suppliedInternalToken, String(settings.webhook_token))) {
      return true;
    }
  }

  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) return false;
  const { data: authData, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !authData.user) return false;
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("role,is_super_admin").eq("id", authData.user.id).maybeSingle();
  return !profileError && profile?.role === "admin" && profile?.is_super_admin === true;
}

async function unsubscribeByToken(token: string, origin: string | null) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return html(unsubscribePage(false), 200, origin);
  }
  const { error } = await supabase.from("profiles")
    .update({ marketing_opt_in: false, updated_at: new Date().toISOString() })
    .eq("marketing_unsubscribe_token", token)
    .eq("role", "customer")
    .eq("marketing_opt_in", true);
  if (error) {
    console.error("Unsubscribe update failed", error.message);
    return html(unsubscribePage(false), 500, origin);
  }
  return html(unsubscribePage(true), 200, origin);
}

function unsubscribePage(ok: boolean): string {
  return "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>Préférences e-mail · SAMA-PACK</title><body style=\"margin:0;background:#f3f7f3;font-family:Arial,sans-serif;color:#183426\">" +
    "<main style=\"max-width:560px;margin:8vh auto;padding:28px 22px;background:#fff;border:1px solid #dfebdf;border-radius:18px;text-align:center\">" +
    "<div style=\"font-size:12px;font-weight:900;letter-spacing:.16em;color:#267348\">SAMA-PACK</div>" +
    "<h1 style=\"font-size:25px;margin:18px 0 10px\">" + (ok ? "Préférence enregistrée" : "Lien traité") + "</h1>" +
    "<p style=\"color:#5a6c60;line-height:1.7\">" + (ok
      ? "Tu ne recevras plus nos e-mails promotionnels. Les messages nécessaires au suivi de tes commandes restent inchangés."
      : "Si ce lien était valide, ton désabonnement a été pris en compte. Tu peux fermer cette page.") + "</p>" +
    "<a href=\"" + SITE_URL + "\" style=\"display:inline-block;margin-top:10px;padding:12px 18px;border-radius:10px;background:#176b43;color:#fff;font-weight:800;text-decoration:none\">Retour à SAMA-PACK</a>" +
    "</main></body></html>";
}

async function getMarketingSubscribers() {
  const byEmail = new Map<string, { id: string; full_name: string; email: string; marketing_unsubscribe_token: string }>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("profiles")
      .select("id,full_name,email,marketing_unsubscribe_token")
      .eq("role", "customer").eq("marketing_opt_in", true)
      .order("email", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw new Error("Impossible de charger les clients abonnés aux e-mails.");
    for (const row of data ?? []) {
      const email = String(row.email ?? "").trim().toLowerCase();
      if (!emailValid(email) || !row.marketing_unsubscribe_token) continue;
      if (!byEmail.has(email)) {
        byEmail.set(email, {
          id: String(row.id),
          full_name: String(row.full_name ?? ""),
          email,
          marketing_unsubscribe_token: String(row.marketing_unsubscribe_token),
        });
      }
    }
    if (!data || data.length < pageSize) break;
  }
  return [...byEmail.values()];
}

function unsubscribeUrl(token: string): string {
  return FUNCTION_URL + "?action=unsubscribe&token=" + encodeURIComponent(token);
}

function emailShell(greeting: string, body: string, token: string, preheader: string): string {
  return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SAMA-PACK</title></head>" +
    "<body style=\"margin:0;padding:0;background:#f2f6f2;font-family:Arial,Helvetica,sans-serif;color:#1b3022\">" +
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">" + escapeHtml(preheader) + "</div>" +
    "<main style=\"max-width:640px;margin:22px auto;background:#fff;border:1px solid #e0e9e1;border-radius:18px;overflow:hidden\">" +
    "<header style=\"padding:25px 26px;background:#176b43;color:#fff\"><div style=\"font-size:12px;font-weight:900;letter-spacing:3px\">SAMA-PACK</div>" +
    "<p style=\"margin:8px 0 0;color:#e2f6e7;font-size:13px\">Packs de nettoyage et d’hygiène livrés à Dakar</p></header>" +
    "<section style=\"padding:26px\"><p style=\"margin:0 0 16px;font-size:15px\">Bonjour " + escapeHtml(greeting) + ",</p>" +
    body +
    "<p style=\"margin:24px 0 0;color:#54675a;font-size:13px;line-height:1.65\">L’équipe SAMA-PACK<br>Des essentiels du quotidien, plus simplement.</p></section>" +
    "<footer style=\"padding:18px 26px;background:#f7faf7;border-top:1px solid #e6eee7;color:#728075;font-size:11px;line-height:1.7\">" +
    "Tu reçois cet e-mail parce que tu as accepté les communications commerciales de SAMA-PACK.<br>" +
    "<a href=\"" + unsubscribeUrl(token) + "\" style=\"color:#176b43;text-decoration:underline\">Ne plus recevoir les e-mails promotionnels</a> · " +
    "<a href=\"" + SITE_URL + "\" style=\"color:#176b43\">SAMA-PACK</a></footer></main></body></html>";
}

function promotionMessage(product: any, subscriber: any) {
  const regular = Number(product.price) || 0;
  const promo = Number(product.promo_price) || 0;
  const discount = regular > 0 ? Math.max(0, Math.round((1 - promo / regular) * 100)) : 0;
  const label = String(product.promo_label || "Vente flash");
  const categoryLink = product.catalog_type === "pack" ? SITE_URL + "/#catalogue" : SITE_URL + "/produits.html";
  const endLine = product.promo_end_at
    ? "<p style=\"margin:10px 0;color:#6a776e;font-size:12px\">Offre valable jusqu’au " + escapeHtml(fmtDate(product.promo_end_at)) + ", sous réserve de disponibilité.</p>"
    : "<p style=\"margin:10px 0;color:#6a776e;font-size:12px\">Offre valable dans la limite des stocks disponibles.</p>";
  const body = "<div style=\"margin:0 0 12px;color:#247447;font-size:11px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase\">" + escapeHtml(label) + "</div>" +
    "<h1 style=\"margin:0 0 12px;font-size:25px;line-height:1.25;color:#183b28\">" + escapeHtml(product.name) + "</h1>" +
    "<p style=\"margin:0 0 18px;color:#536459;font-size:14px;line-height:1.7\">" + escapeHtml(product.description || "Un essentiel à retrouver dans le catalogue SAMA-PACK.") + "</p>" +
    "<div style=\"padding:18px;border:1px solid #dcebe0;border-radius:14px;background:#f5faf5\">" +
    "<div style=\"font-size:12px;color:#69776d\">Prix habituel : <span style=\"text-decoration:line-through\">" + money(regular) + "</span></div>" +
    "<div style=\"margin:5px 0;font-size:29px;font-weight:900;color:#176b43\">" + money(promo) + "</div>" +
    (discount > 0 ? "<span style=\"display:inline-block;padding:5px 9px;border-radius:999px;background:#e1f5e6;color:#176b43;font-size:11px;font-weight:900\">-" + discount + " %</span>" : "") +
    "</div>" + endLine +
    "<p style=\"margin:18px 0;color:#536459;font-size:14px;line-height:1.7\">Consulte cette offre et retrouve nos autres essentiels de nettoyage et d’hygiène en ligne.</p>" +
    "<p style=\"margin:24px 0 4px\"><a href=\"" + categoryLink + "\" style=\"display:inline-block;padding:13px 20px;border-radius:10px;background:#176b43;color:#fff;text-decoration:none;font-size:14px;font-weight:800\">Découvrir l’offre</a></p>";
  return {
    subject: "Vente flash SAMA-PACK : " + String(product.name) + " à " + money(promo),
    preheader: String(product.name) + " en promotion à " + money(promo) + (discount ? " (-" + discount + " %)." : "."),
    html: emailShell(firstName(subscriber.full_name), body, subscriber.marketing_unsubscribe_token, String(product.name) + " en vente flash."),
    text: "Bonjour " + firstName(subscriber.full_name) + ",\n\n" + product.name + "\n" + (product.description || "") +
      "\nPrix habituel : " + money(regular) + "\nPrix promotionnel : " + money(promo) +
      (product.promo_end_at ? "\nOffre valable jusqu’au " + fmtDate(product.promo_end_at) + "." : "") +
      "\n\nDécouvrir : " + categoryLink + "\n\nPour arrêter les e-mails promotionnels : " + unsubscribeUrl(subscriber.marketing_unsubscribe_token) + "\nSAMA-PACK",
  };
}

function monthlyMessage(subscriber: any, monthLabel: string, products: any[]) {
  const cards = products.slice(0, 3).map((product) => {
    const onPromo = product.promo_active === true &&
      product.promo_price != null &&
      Number(product.promo_price) >= 0 &&
      Number(product.promo_price) < Number(product.price) &&
      (!product.promo_end_at || new Date(product.promo_end_at).getTime() > Date.now());
    const price = onPromo ? Number(product.promo_price) : Number(product.price);
    const link = product.catalog_type === "pack" ? SITE_URL + "/#catalogue" : SITE_URL + "/produits.html";
    return "<article style=\"padding:14px 0;border-bottom:1px solid #e8eee9\">" +
      "<div style=\"font-size:10px;font-weight:900;letter-spacing:1px;color:" + (onPromo ? "#247447" : "#6b7b6f") + ";text-transform:uppercase\">" +
      (onPromo ? "EN PROMOTION" : escapeHtml(product.category || "À découvrir")) + "</div>" +
      "<h3 style=\"margin:7px 0;color:#203d2b;font-size:16px\">" + escapeHtml(product.name) + "</h3>" +
      "<p style=\"margin:0 0 10px;color:#5c6d61;font-size:13px;line-height:1.6\">" + escapeHtml(product.description || "Un indispensable disponible au catalogue.") + "</p>" +
      "<strong style=\"font-size:17px;color:#176b43\">" + money(price) + "</strong>" +
      (onPromo ? " <span style=\"color:#849087;font-size:12px;text-decoration:line-through\">" + money(product.price) + "</span>" : "") +
      "<div style=\"margin-top:10px\"><a href=\"" + link + "\" style=\"color:#176b43;font-size:12px;font-weight:800\">Voir le catalogue →</a></div></article>";
  }).join("");
  const body = "<div style=\"color:#247447;font-size:11px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase\">LE RENDEZ-VOUS DU MOIS</div>" +
    "<h1 style=\"margin:8px 0 13px;font-size:27px;line-height:1.23;color:#183b28\">Un nouveau mois, des essentiels bien organisés.</h1>" +
    "<p style=\"color:#536459;font-size:14px;line-height:1.8\">Pour commencer " + escapeHtml(monthLabel) +
    " sereinement, pense à renouveler tes produits de nettoyage et d’hygiène. SAMA-PACK regroupe des packs pratiques et des articles du quotidien, avec livraison à Dakar.</p>" +
    (cards ? "<div style=\"margin:20px 0\">" + cards + "</div>" : "") +
    "<div style=\"margin:20px 0;padding:16px;border-radius:13px;background:#f4f9f4\"><strong style=\"font-size:15px;color:#1d402b\">Tu as un besoin précis ?</strong>" +
    "<p style=\"margin:7px 0 0;color:#596b5e;font-size:13px;line-height:1.7\">Parcours les packs, sélectionne les articles qui te conviennent et retrouve les informations de commande sur notre boutique.</p></div>" +
    "<p style=\"margin:24px 0 4px\"><a href=\"" + SITE_URL + "/#catalogue\" style=\"display:inline-block;padding:13px 20px;border-radius:10px;background:#176b43;color:#fff;text-decoration:none;font-size:14px;font-weight:800\">Visiter la boutique</a></p>";
  const subject = "Le rendez-vous de " + monthLabel + " chez SAMA-PACK";
  return {
    subject,
    preheader: "Commence le mois avec des essentiels de nettoyage et d’hygiène livrés à Dakar.",
    html: emailShell(firstName(subscriber.full_name), body, subscriber.marketing_unsubscribe_token, subject),
    text: "Bonjour " + firstName(subscriber.full_name) + ",\n\nUn nouveau mois commence. SAMA-PACK te propose des packs de nettoyage et d’hygiène, ainsi que des articles du quotidien livrés à Dakar.\n\n" +
      products.slice(0, 3).map((p) => p.name + " — " + money(p.promo_active && Number(p.promo_price) < Number(p.price) ? p.promo_price : p.price)).join("\n") +
      "\n\nVisiter la boutique : " + SITE_URL + "/#catalogue\nPour arrêter les e-mails promotionnels : " +
      unsubscribeUrl(subscriber.marketing_unsubscribe_token) + "\nSAMA-PACK",
  };
}

async function getCurrentMonthlyProducts() {
  const { data, error } = await supabase.from("products")
    .select("id,public_ref,name,category,catalog_type,price,description,active,availability_status,promo_active,promo_price,promo_label,promo_end_at,updated_at")
    .eq("active", true).eq("availability_status", "available")
    .order("updated_at", { ascending: false }).limit(20);
  if (error) throw new Error("Impossible de charger les articles pour la campagne mensuelle.");
  const rows = data ?? [];
  const activePromotions = rows.filter((p) =>
    p.promo_active === true && p.promo_price != null &&
    Number(p.promo_price) >= 0 && Number(p.promo_price) < Number(p.price) &&
    (!p.promo_end_at || new Date(p.promo_end_at).getTime() > Date.now())
  );
  return (activePromotions.length ? activePromotions : rows).slice(0, 3);
}

async function getPromotionProduct(productId: string) {
  const { data, error } = await supabase.from("products")
    .select("id,public_ref,name,category,catalog_type,price,description,active,availability_status,promo_active,promo_price,promo_label,promo_end_at,promo_started_at")
    .eq("id", productId).maybeSingle();
  if (error || !data) throw new Error("L’article ou le pack de cette promotion est introuvable.");
  if (data.active !== true || data.promo_active !== true || data.availability_status !== "available" ||
      data.promo_price == null || Number(data.promo_price) < 0 || Number(data.promo_price) >= Number(data.price) ||
      (data.promo_end_at && new Date(data.promo_end_at).getTime() <= Date.now())) {
    throw new Error("Cet article n’est pas dans une promotion active et publiable.");
  }
  return data;
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendCampaign(action: "promotion" | "monthly", payload: Record<string, unknown>) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { ok: false, httpStatus: 503, error: "L’envoi d’e-mails n’est pas configuré (RESEND_API_KEY et RESEND_FROM_EMAIL)." };
  }

  let product: any = null;
  let campaignType: "promotion" | "monthly" = action;
  let campaignKey: string;
  let subject: string;
  let monthLabel = "";
  let monthlyProducts: any[] = [];
  if (action === "promotion") {
    const productId = typeof payload.product_id === "string" ? payload.product_id.trim() : "";
    const eventKey = typeof payload.event_key === "string" ? payload.event_key.trim() : "";
    if (!productId || productId.length > 120 || !eventKey || eventKey.length > 100) {
      return { ok: false, httpStatus: 400, error: "Référence de promotion invalide." };
    }
    product = await getPromotionProduct(productId);
    campaignKey = "promotion:" + product.id + ":" + eventKey;
    subject = "Vente flash SAMA-PACK : " + String(product.name) + " à " + money(product.promo_price);
  } else {
    const monthKey = getMonthKey();
    campaignKey = "monthly:" + monthKey;
    const monthName = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Dakar", month: "long" }).format(new Date());
    monthLabel = monthName.charAt(0).toLocaleUpperCase("fr") + monthName.slice(1);
    subject = "Le rendez-vous de " + monthLabel + " chez SAMA-PACK";
    monthlyProducts = await getCurrentMonthlyProducts();
  }

  let campaign: any;
  const { data: existing, error: existingError } = await supabase.from("customer_email_campaigns")
    .select("id,campaign_key,campaign_type,subject,status,product_id,recipients_total,recipients_sent,recipients_failed")
    .eq("campaign_key", campaignKey).maybeSingle();
  if (existingError) throw new Error("Impossible de vérifier les campagnes déjà envoyées.");

  if (existing?.status === "sent") {
    return {
      ok: true, duplicate: true, campaign_id: existing.id, status: existing.status,
      recipients_sent: existing.recipients_sent, recipients_failed: existing.recipients_failed,
      message: "Cette campagne a déjà été traitée.",
    };
  }

  if (existing) {
    campaign = existing;
  } else {
    const { data: inserted, error: insertError } = await supabase.from("customer_email_campaigns")
      .insert({
        campaign_key: campaignKey,
        campaign_type: campaignType,
        subject,
        product_id: product?.id ?? null,
        status: "processing",
      })
      .select("id,campaign_key,campaign_type,subject,status,product_id,recipients_total,recipients_sent,recipients_failed")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: retryCampaign } = await supabase.from("customer_email_campaigns")
          .select("id,campaign_key,campaign_type,subject,status,product_id,recipients_total,recipients_sent,recipients_failed")
          .eq("campaign_key", campaignKey).maybeSingle();
        if (retryCampaign) return { ok: true, duplicate: true, campaign_id: retryCampaign.id, status: retryCampaign.status, message: "Campagne déjà prise en charge." };
      }
      throw new Error("Impossible d’enregistrer la campagne e-mail.");
    }
    campaign = inserted;
  }

  const subscribers = await getMarketingSubscribers();
  const { data: previousRecipients, error: previousError } = await supabase.from("customer_email_campaign_recipients")
    .select("id,email,status").eq("campaign_id", campaign.id);
  if (previousError) throw new Error("Impossible de vérifier les envois individuels.");

  if (subscribers.length === 0 && (!previousRecipients || previousRecipients.length === 0)) {
    await supabase.from("customer_email_campaigns").update({
      status: "skipped", recipients_total: 0, recipients_sent: 0, recipients_failed: 0,
      error_message: "Aucun client n’a accepté les e-mails promotionnels.", completed_at: new Date().toISOString(),
    }).eq("id", campaign.id);
    return { ok: true, campaign_id: campaign.id, status: "skipped", recipients_sent: 0, recipients_failed: 0, message: "Aucun client abonné aux e-mails commerciaux." };
  }

  if (subscribers.length) {
    const newRecipients = subscribers.map((s) => ({
      campaign_id: campaign.id, profile_id: s.id, email: s.email, status: "pending",
    }));
    const { error: upsertError } = await supabase.from("customer_email_campaign_recipients")
      .upsert(newRecipients, { onConflict: "campaign_id,email", ignoreDuplicates: true });
    if (upsertError) throw new Error("Impossible de préparer la liste des destinataires.");
  }

  const subscriberByEmail = new Map(subscribers.map((s) => [s.email, s]));
  const { data: allRecipients, error: recipientsError } = await supabase.from("customer_email_campaign_recipients")
    .select("id,email,status").eq("campaign_id", campaign.id).order("email", { ascending: true });
  if (recipientsError) throw new Error("Impossible de lire la liste des destinataires.");

  const notEligible = (allRecipients ?? []).filter((r) =>
    r.status !== "sent" && !subscriberByEmail.has(String(r.email).toLowerCase())
  );
  for (const recipient of notEligible) {
    await supabase.from("customer_email_campaign_recipients")
      .update({ status: "skipped", error_message: "Désabonné ou consentement non actif." })
      .eq("id", recipient.id);
  }

  const targets = (allRecipients ?? []).filter((r) =>
    (r.status === "pending" || r.status === "failed") &&
    subscriberByEmail.has(String(r.email).toLowerCase())
  );
  const batchSize = 100;
  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const messages = chunk.map((recipient) => {
      const subscriber = subscriberByEmail.get(String(recipient.email).toLowerCase())!;
      const message = action === "promotion"
        ? promotionMessage(product, subscriber)
        : monthlyMessage(subscriber, monthLabel, monthlyProducts);
      const emailPayload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: [subscriber.email],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: {
          "List-Unsubscribe": "<" + unsubscribeUrl(subscriber.marketing_unsubscribe_token) + ">",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
      return { recipient, subscriber, payload: emailPayload };
    });

    const idempotency = "sama-pack-" + await sha256Hex(campaign.id + "|" + messages.map((m) => m.subscriber.email).join("|"));
    let response: Response;
    let responseBody: any = null;
    try {
      response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency,
        },
        body: JSON.stringify(messages.map((m) => m.payload)),
      });
      responseBody = await response.json().catch(() => null);
    } catch {
      responseBody = { message: "Connexion au fournisseur d’e-mail impossible." };
      response = new Response(null, { status: 502 });
    }

    if (!response.ok || !Array.isArray(responseBody?.data) || responseBody.data.length !== messages.length) {
      const reason = String(responseBody?.message || responseBody?.error?.message || ("Resend HTTP " + response.status)).slice(0, 500);
      for (const m of messages) {
        await supabase.from("customer_email_campaign_recipients")
          .update({ status: "failed", error_message: reason }).eq("id", m.recipient.id);
      }
      continue;
    }

    for (let j = 0; j < messages.length; j++) {
      const m = messages[j];
      const provider = responseBody.data[j];
      await supabase.from("customer_email_campaign_recipients")
        .update({
          status: "sent",
          provider_message_id: String(provider?.id || ""),
          sent_at: new Date().toISOString(),
          error_message: "",
        }).eq("id", m.recipient.id);
    }
  }

  const { data: totals, error: totalsError } = await supabase.from("customer_email_campaign_recipients")
    .select("status").eq("campaign_id", campaign.id);
  if (totalsError) throw new Error("Les e-mails ont été traités, mais le bilan de campagne n’a pas pu être calculé.");
  const all = totals ?? [];
  const sent = all.filter((r) => r.status === "sent").length;
  const failed = all.filter((r) => r.status === "failed" || r.status === "pending").length;
  const eligibleOrSent = all.filter((r) => r.status !== "skipped").length;
  const finalStatus = eligibleOrSent === 0 ? "skipped" : failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  const { error: finishError } = await supabase.from("customer_email_campaigns")
    .update({
      status: finalStatus,
      recipients_total: eligibleOrSent,
      recipients_sent: sent,
      recipients_failed: failed,
      error_message: failed ? failed + " e-mail(s) restent à traiter ou ont échoué." : "",
      completed_at: new Date().toISOString(),
    }).eq("id", campaign.id);
  if (finishError) console.error("Campaign totals could not be updated", finishError.message);

  return {
    ok: finalStatus === "sent" || finalStatus === "skipped" || sent > 0,
    campaign_id: campaign.id,
    status: finalStatus,
    recipients_total: eligibleOrSent,
    recipients_sent: sent,
    recipients_failed: failed,
    message: finalStatus === "sent"
      ? "Campagne envoyée à " + sent + " client(s)."
      : finalStatus === "skipped"
      ? "Aucun envoi nécessaire."
      : "Campagne terminée partiellement : " + sent + " envoyé(s), " + failed + " en échec ou en attente.",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const requestUrl = new URL(req.url);
  const queryAction = requestUrl.searchParams.get("action") ?? "";
  if ((req.method === "GET" || req.method === "POST") && queryAction === "unsubscribe") {
    return await unsubscribeByToken(requestUrl.searchParams.get("token") ?? "", origin);
  }
  if (req.method !== "POST") return json({ ok: false, error: "Méthode non autorisée." }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "Configuration du serveur incomplète." }, 500, origin);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ ok: false, error: "Corps de requête invalide." }, 400, origin); }

  const action = payload.action;
  if (action !== "promotion" && action !== "monthly") {
    return json({ ok: false, error: "Type de campagne inconnu." }, 400, origin);
  }
  if (!await isAdminOrInternal(req)) {
    return json({ ok: false, error: "Accès réservé aux administrateurs autorisés." }, 401, origin);
  }

  try {
    const result = await sendCampaign(action, payload);
    return json(result as Record<string, unknown>, typeof (result as any).httpStatus === "number" ? (result as any).httpStatus : 200, origin);
  } catch (error) {
    console.error("SAMA-PACK customer campaign failed", error);
    const message = error instanceof Error ? error.message : "La campagne e-mail n’a pas pu être traitée.";
    return json({ ok: false, error: message }, 500, origin);
  }
});
