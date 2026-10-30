import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SITE_URL = "https://sama-pack.store";
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function resolveNamedKey(jsonVariable: string, singleVariable: string, legacyVariable: string): string {
  const single = Deno.env.get(singleVariable) || Deno.env.get(legacyVariable) || "";
  if (single) return single;
  try {
    const values = JSON.parse(Deno.env.get(jsonVariable) || "{}");
    if (typeof values.default === "string" && values.default) return values.default;
    const first = Object.values(values).find(value => typeof value === "string" && value);
    return typeof first === "string" ? first : "";
  } catch {
    return "";
  }
}
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function paymentErrorDetails(error: unknown): { message: string; code: string; details: string; hint: string } {
  if (error instanceof Error) {
    return { message: error.message, code: "", details: "", hint: "" };
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return {
      message: text(value.message || value.error_description || value.error),
      code: text(value.code),
      details: text(value.details),
      hint: text(value.hint),
    };
  }
  return { message: text(error), code: "", details: "", hint: "" };
}
function paymentConfig() {
  const mode = (Deno.env.get("PAYDUNYA_MODE") || "test").trim().toLowerCase();
  // Secrets copied from dashboards may contain accidental leading/trailing whitespace.
  const master = (Deno.env.get("PAYDUNYA_MASTER_KEY") || "").trim();
  const privateKey = (Deno.env.get("PAYDUNYA_PRIVATE_KEY") || "").trim();
  const token = (Deno.env.get("PAYDUNYA_TOKEN") || "").trim();
  if (!["test", "live"].includes(mode)) throw new Error("PAYDUNYA_MODE doit être défini sur test ou live.");
  if (!master || !privateKey || !token) throw new Error("Le paiement en ligne n'est pas encore configuré. Les clés PayDunya doivent être ajoutées dans les secrets Supabase.");
  return { mode, master, privateKey, token, baseUrl: mode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1" };
}
function paydunyaHeaders(cfg: ReturnType<typeof paymentConfig>) {
  return { "Content-Type": "application/json", "PAYDUNYA-MASTER-KEY": cfg.master, "PAYDUNYA-PRIVATE-KEY": cfg.privateKey, "PAYDUNYA-TOKEN": cfg.token };
}
async function verifyInvoice(cfg: ReturnType<typeof paymentConfig>, token: string) {
  const response = await fetch(`${cfg.baseUrl}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: "GET", headers: paydunyaHeaders(cfg) });
  if (!response.ok) throw new Error(`Vérification PayDunya indisponible (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.response_code !== "00") throw new Error("PayDunya n'a pas pu vérifier cette facture.");
  return data;
}

function escapePaymentEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch] ?? ch);
}
function safePayDunyaReceiptUrl(invoice: any, mode: string): string {
  const raw = text(invoice?.invoice?.receipt_url || invoice?.receipt_url);
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const pathPrefix = mode === "test" ? "/sandbox-checkout/receipt/pdf/" : "/checkout/receipt/pdf/";
    if (u.protocol !== "https:" || !["paydunya.com", "app.paydunya.com"].includes(u.hostname)
      || u.username || u.password || (u.port && u.port !== "443")
      || !u.pathname.startsWith(pathPrefix) || !u.pathname.toLowerCase().endsWith(".pdf")) return "";
    return u.toString();
  } catch { return ""; }
}
async function sendPaymentConfirmation(
  admin: ReturnType<typeof createClient>, tx: any, order: any, invoice: any,
  amountPaid: number, paymentStatus: string, orderStatus: string, mode: string, force = false,
): Promise<string> {
  const now = new Date().toISOString();
  const receiptUrl = safePayDunyaReceiptUrl(invoice, mode);

  if (force) {
    const { data: reset, error: resetError } = await admin.from("payment_transactions")
      .update({ confirmation_email_status: "pending", confirmation_email_error: null, receipt_url: receiptUrl || null, updated_at: now })
      .eq("id", tx.id).neq("confirmation_email_status", "sending").select("id").maybeSingle();
    if (resetError) {
      console.error("Could not prepare payment confirmation resend:", resetError.message);
      return "failed";
    }
    if (!reset) {
      const { data: current } = await admin.from("payment_transactions").select("confirmation_email_status").eq("id", tx.id).maybeSingle();
      return text(current?.confirmation_email_status) || "sending";
    }
  }

  const { data: claim, error: claimError } = await admin.from("payment_transactions")
    .update({ confirmation_email_status: "sending", confirmation_email_error: null, receipt_url: receiptUrl || null, updated_at: now })
    .eq("id", tx.id).in("confirmation_email_status", ["pending", "failed"]).select("id").maybeSingle();
  if (claimError) {
    console.error("Could not claim payment confirmation email:", claimError.message);
    return "failed";
  }
  if (!claim) {
    const { data: current } = await admin.from("payment_transactions").select("confirmation_email_status").eq("id", tx.id).maybeSingle();
    return text(current?.confirmation_email_status) || "sending";
  }

  const setEmailStatus = async (status: string, errorMessage = "") => {
    const { error } = await admin.from("payment_transactions").update({
      confirmation_email_status: status,
      confirmation_email_sent_at: status === "sent" ? new Date().toISOString() : null,
      confirmation_email_error: errorMessage.slice(0, 300),
      receipt_url: receiptUrl || null,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);
    if (error) console.error("Could not save payment email status:", error.message);
  };

  try {
    const resendKey = text(Deno.env.get("RESEND_API_KEY"));
    const fromEmail = text(Deno.env.get("RESEND_FROM_EMAIL"));
    if (!resendKey || !fromEmail) throw new Error("Les secrets RESEND_API_KEY ou RESEND_FROM_EMAIL ne sont pas configurés.");

    let customerEmail = "";
    if (order.user_id) {
      const { data: authResult, error: authError } = await admin.auth.admin.getUserById(String(order.user_id));
      if (!authError) customerEmail = text(authResult?.user?.email);
    }
    if (!customerEmail) customerEmail = text(invoice?.customer?.email || invoice?.invoice?.customer?.email);
    if (!customerEmail || customerEmail.length > 254 || !customerEmail.includes("@")
      || customerEmail.includes(" ") || customerEmail.startsWith("@") || customerEmail.endsWith("@")) {
      throw new Error("Aucune adresse e-mail client valide n'est disponible pour cette commande.");
    }

    let attachments: any[] = [];
    if (receiptUrl) {
      try {
        const pdfResponse = await fetch(receiptUrl, { signal: AbortSignal.timeout(10000) });
        if (pdfResponse.ok) {
          const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
          const signature = String.fromCharCode(...bytes.slice(0, 4));
          if (bytes.length > 0 && bytes.length <= 4 * 1024 * 1024 && signature === "%PDF") {
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            attachments = [{ filename: "Recu-PayDunya-" + String(order.id) + ".pdf", content: btoa(binary) }];
          }
        }
      } catch {
        console.warn("PayDunya PDF attachment unavailable; email will include the validated receipt link.");
      }
    }

    const total = num(order.total);
    const remaining = Math.max(0, total - amountPaid);
    let summary = "";
    if (orderStatus === "cancelled" || paymentStatus === "refund_review") {
      summary = "Le paiement a bien été reçu par PayDunya, mais la commande est annulée et doit être examinée par notre équipe. Ce message ne confirme pas une livraison.";
    } else if (paymentStatus === "paid") {
      summary = "Le paiement intégral de votre commande a été confirmé.";
    } else if (tx.purpose === "delivery") {
      summary = "Les frais de livraison ont été payés et vérifiés. Le solde des produits reste à régler à la livraison.";
    } else {
      summary = "Votre paiement a été confirmé. Le solde éventuel reste à régler selon les modalités de votre commande.";
    }

    if (mode === "test") summary = "ENVIRONNEMENT DE TEST — ce paiement est simulé et ne prouve pas un débit réel. " + summary;

    const htmlReceiptLink = receiptUrl
      ? '<p style="margin:24px 0"><a href="' + escapePaymentEmailHtml(receiptUrl) + '" style="display:inline-block;background:#176b43;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Télécharger le reçu PDF PayDunya</a></p>'
      : '<p style="color:#64748b">Le reçu PDF n’est pas disponible dans la réponse du prestataire. Conservez cet e-mail comme confirmation de paiement.</p>';
    const rows = [
      ["Commande", String(order.id)],
      ["Date", new Date().toLocaleString("fr-FR", { timeZone: "Africa/Dakar" })],
      ["Moyen de paiement", "PayDunya"],
      ["Montant de cette transaction", num(tx.amount).toLocaleString("fr-FR") + " FCFA"],
      ["Total de la commande", total.toLocaleString("fr-FR") + " FCFA"],
      ["Total reçu à ce jour", amountPaid.toLocaleString("fr-FR") + " FCFA"],
      ["Reste à payer", remaining.toLocaleString("fr-FR") + " FCFA"],
    ].map(([label, value]) => '<tr><td style="padding:9px 12px;color:#64748b;border-bottom:1px solid #e2e8f0">' + escapePaymentEmailHtml(label) + '</td><td style="padding:9px 12px;font-weight:600;border-bottom:1px solid #e2e8f0">' + escapePaymentEmailHtml(value) + '</td></tr>').join("");

    const html = '<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7f4;font-family:Arial,sans-serif;color:#17251d"><div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e2e8e0;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#176b43;color:#fff"><div style="font-size:12px;letter-spacing:2px;font-weight:bold">SAMA-PACK</div><h1 style="font-size:23px;margin:10px 0 4px">Paiement confirmé</h1><p style="margin:0;color:#e4f7e9">Commande ' + escapePaymentEmailHtml(order.id) + '</p></div><div style="padding:22px 20px 0"><p>Bonjour ' + escapePaymentEmailHtml(order.customer_name || "cher client") + ',</p><p>' + escapePaymentEmailHtml(summary) + '</p></div><table style="border-collapse:collapse;width:100%;font-size:14px;padding:12px 20px">' + rows + '</table><div style="padding:0 20px 20px">' + htmlReceiptLink + '<p style="font-size:12px;color:#64748b">Cet e-mail est une confirmation automatique émise par SAMA-PACK à la suite de la vérification du paiement auprès de PayDunya.</p></div></div></body></html>';
    const plain = "SAMA-PACK — Paiement confirmé\nCommande : " + order.id + "\nBonjour " + String(order.customer_name || "cher client") + ",\n" + summary + "\nMontant de cette transaction : " + num(tx.amount) + " FCFA\nTotal de commande : " + total + " FCFA\nMontant payé : " + amountPaid + " FCFA\nReste à payer : " + remaining + " FCFA" + (receiptUrl ? "\nReçu PDF PayDunya : " + receiptUrl : "");

    const payload: any = { from: fromEmail, to: [customerEmail], subject: "SAMA-PACK — " + (mode === "test" ? "[TEST] " : "") + "Paiement confirmé : " + String(order.id), html, text: plain };
    if (attachments.length) payload.attachments = attachments;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + resendKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error("Resend HTTP " + response.status + ": " + responseText.slice(0, 180));
    await setEmailStatus("sent");
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur d’envoi de la confirmation e-mail.";
    await setEmailStatus("failed", message);
    console.error("SAMA-PACK payment confirmation email failed:", JSON.stringify({ order_id: order.id, message: message.slice(0, 250) }));
    return "failed";
  }
}

async function settleTransaction(admin: ReturnType<typeof createClient>, tx: any, invoice: any, mode: string, forceEmail = false) {
  const verifiedInvoiceToken = text(invoice?.invoice?.token || invoice?.token);
  if (!verifiedInvoiceToken || verifiedInvoiceToken !== tx.provider_token) throw new Error("Le jeton de facture vérifié ne correspond pas à la transaction.");
  const gatewayStatus = text(invoice?.status).toLowerCase();
  if (gatewayStatus === "pending") {
    const { data: order } = await admin.from("orders").select("id,status,payment_status").eq("id", tx.order_id).maybeSingle();
    return { gateway_status: "pending", order_status: order?.status || null, payment_status: order?.payment_status || null };
  }
  if (gatewayStatus === "cancelled" || gatewayStatus === "failed") {
    const localStatus = gatewayStatus === "cancelled" ? "cancelled" : "failed";
    await admin.from("payment_transactions").update({ status: localStatus, updated_at: new Date().toISOString() }).eq("id", tx.id).neq("status", "completed");
    const { data: order } = await admin.from("orders").select("id,status,payment_status").eq("id", tx.order_id).maybeSingle();
    return { gateway_status: gatewayStatus, order_status: order?.status || null, payment_status: order?.payment_status || null, order_id: tx.order_id };
  }
  if (gatewayStatus !== "completed") return { gateway_status: gatewayStatus || "unknown", order_id: tx.order_id };
  const invoiceAmount = num(invoice?.invoice?.total_amount ?? invoice?.total_amount);
  if (Math.abs(invoiceAmount - num(tx.amount)) > 0.5) throw new Error("Le montant vérifié par PayDunya ne correspond pas au montant attendu.");

  const now = new Date().toISOString();
  const { error: txUpdateError } = await admin.from("payment_transactions").update({ status: "completed", provider_transaction_id: verifiedInvoiceToken, verified_at: now, updated_at: now }).eq("id", tx.id);
  if (txUpdateError) throw txUpdateError;
  const { data: order, error: orderError } = await admin.from("orders").select("id,status,payment_choice,payment_status,total,delivery,amount_paid,user_id,customer_name,customer_phone,delivery_address,delivery_zone,subtotal").eq("id", tx.order_id).maybeSingle();
  if (orderError || !order) throw new Error("Commande associée à ce paiement introuvable.");
  const { data: completed, error: completedError } = await admin.from("payment_transactions").select("id,amount").eq("order_id", tx.order_id).eq("status", "completed");
  if (completedError) throw completedError;

  const completedAmount = (completed || []).reduce((sum: number, row: any) => sum + num(row.amount), 0);
  const expectedOnlineAmount = order.payment_choice === "pay_now" ? num(order.total) : num(order.delivery);
  if (order.status !== "cancelled" && expectedOnlineAmount > 0 && completedAmount > expectedOnlineAmount + 0.5) {
    const { data: existingAlert, error: alertCheckError } = await admin.from("notifications")
      .select("id").eq("type", "payment_overpayment_review").eq("entity_type", "order").eq("entity_id", order.id).limit(1);
    if (alertCheckError) throw alertCheckError;
    if (!existingAlert?.length) {
      const { data: admins, error: adminsError } = await admin.from("profiles").select("id").eq("role", "admin");
      if (adminsError) throw adminsError;
      if (admins?.length) {
        const overpaymentAmount = completedAmount - expectedOnlineAmount;
        const { error: alertError } = await admin.from("notifications").insert(admins.map((profile: any) => ({
          recipient_user_id: profile.id,
          type: "payment_overpayment_review",
          title: "Écart de paiement à examiner",
          message: `Les transactions confirmées de la commande ${order.id} totalisent ${Math.round(completedAmount)} FCFA au lieu de ${Math.round(expectedOnlineAmount)} FCFA. Écart : ${Math.round(overpaymentAmount)} FCFA. La commande n'a pas été réglée automatiquement.`,
          entity_type: "order",
          entity_id: order.id,
        })));
        if (alertError) throw alertError;
      }
    }
    return {
      gateway_status: "completed",
      order_id: order.id,
      order_status: order.status,
      payment_status: order.payment_status,
      amount_paid: num(order.amount_paid),
      expected_online_amount: expectedOnlineAmount,
      overpayment_amount: completedAmount - expectedOnlineAmount,
      manual_review_required: true,
    };
  }
  const amountPaid = Math.min(num(order.total), completedAmount);
  const fullyPaid = amountPaid >= num(order.total);
  const isPendingOrder = ["awaiting_payment", "awaiting_delivery_payment"].includes(order.status);
  let nextStatus = order.status;
  let nextPaymentStatus = fullyPaid ? "paid" : amountPaid > 0 ? "partially_paid" : "pending";
  if (order.status === "cancelled") {
    nextPaymentStatus = "refund_review";
  } else if (isPendingOrder) {
    if (tx.purpose === "full" && fullyPaid && Math.abs(num(tx.amount) - num(order.total)) <= 0.5) {
      nextStatus = "new";
    } else if (tx.purpose === "delivery" && num(tx.amount) >= num(order.delivery) && num(order.delivery) > 0) {
      nextStatus = "new";
      nextPaymentStatus = fullyPaid ? "paid" : "partially_paid";
    }
  }
  const { error: orderUpdateError } = await admin.from("orders").update({ status: nextStatus, payment_status: nextPaymentStatus, amount_paid: amountPaid, updated_at: now }).eq("id", order.id);
  if (orderUpdateError) throw orderUpdateError;

  if (order.status === "cancelled") {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if (admins?.length) {
      await admin.from("notifications").insert(admins.map((p: any) => ({
        recipient_user_id: p.id, type: "payment_review", title: "Paiement à examiner",
        message: `Un paiement a été reçu pour la commande annulée ${order.id}. Vérifie la transaction et détermine si un remboursement est nécessaire.`,
        entity_type: "order", entity_id: order.id,
      })));
    }
  }
  const confirmationEmailStatus = await sendPaymentConfirmation(admin, tx, order, invoice, amountPaid, nextPaymentStatus, nextStatus, mode, forceEmail);
  return { gateway_status: "completed", order_id: order.id, order_status: nextStatus, payment_status: nextPaymentStatus, amount_paid: amountPaid, confirmation_email_status: confirmationEmailStatus };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = resolveNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
    const serviceKey = resolveNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuration Supabase serveur incomplète." }, 500);
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Connecte-toi pour gérer ce paiement." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action || "create_checkout");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "verify_return") {
      const invoiceToken = text(body?.invoice_token);
      const requestedOrderId = text(body?.order_id);
      if (!invoiceToken && !requestedOrderId) {
        return json({ error: "Référence de paiement ou de commande absente." }, 400);
      }

      let txQuery = admin.from("payment_transactions").select("*")
        .eq("provider", "paydunya").eq("user_id", user.id);
      if (invoiceToken) txQuery = txQuery.eq("provider_token", invoiceToken);
      else txQuery = txQuery.eq("order_id", requestedOrderId).order("created_at", { ascending: false });

      const { data: txRows, error: txError } = await txQuery.limit(invoiceToken ? 1 : 10);
      if (txError) throw txError;
      const candidates = Array.isArray(txRows) ? txRows : [];
      const tx = invoiceToken
        ? candidates[0]
        : (candidates.find((row: any) => row.status === "completed" && row.verified_at)
          || candidates.find((row: any) => row.provider_token && ["pending", "creating"].includes(row.status))
          || candidates.find((row: any) => row.provider_token));

      if (!tx || !tx.provider_token || (requestedOrderId && tx.order_id !== requestedOrderId)) {
        return json({ error: "Aucune transaction PayDunya vérifiable n'a été trouvée pour cette commande et ce compte." }, 404);
      }
      if (invoiceToken && invoiceToken !== tx.provider_token) {
        return json({ error: "Cette facture ne correspond pas à la commande demandée." }, 403);
      }

      const cfg = paymentConfig();
      const invoice = await verifyInvoice(cfg, text(tx.provider_token));
      const result = await settleTransaction(admin, tx, invoice, cfg.mode);
      const { data: refreshed, error: refreshError } = await admin.from("orders")
        .select("id,status,payment_status,amount_paid,delivery,subtotal,total,payment_choice")
        .eq("id", tx.order_id).eq("user_id", user.id).maybeSingle();
      if (refreshError) throw refreshError;

      return json({
        ok: result.gateway_status === "completed" && refreshed?.status === "new",
        ...result,
        order: refreshed || null,
      });
    }

if (action === "send_payment_confirmation") {
      const orderId = text(body?.order_id);
      if (!orderId || orderId.length > 100) return json({ error: "Référence de commande invalide." }, 400);
      const { data: order, error: orderError } = await admin.from("orders")
        .select("id,user_id,status,payment_choice,payment_status,subtotal,delivery,total,customer_name,customer_phone,delivery_address,delivery_zone,amount_paid")
        .eq("id", orderId).eq("user_id", user.id).maybeSingle();
      if (orderError || !order) return json({ error: "Commande introuvable ou non accessible pour ce compte." }, 404);
      if (!["paid", "partially_paid"].includes(order.payment_status)) {
        return json({ error: "Aucun paiement vérifié ne permet encore d'envoyer un reçu pour cette commande." }, 409);
      }
      const { data: tx, error: txError } = await admin.from("payment_transactions").select("*")
        .eq("provider", "paydunya").eq("order_id", order.id).eq("user_id", user.id).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (txError || !tx) return json({ error: "Aucune transaction PayDunya confirmée n'a été trouvée pour cette commande." }, 409);
      const cfg = paymentConfig();
      const invoice = await verifyInvoice(cfg, text(tx.provider_token));
      const result = await settleTransaction(admin, tx, invoice, cfg.mode, true);
      if (result.gateway_status !== "completed") {
        return json({ error: "PayDunya ne confirme pas encore ce paiement. Aucune nouvelle confirmation n'a été envoyée.", ...result }, 409);
      }
      return json({ ok: result.confirmation_email_status === "sent", ...result });
    }

    if (action !== "create_checkout") return json({ error: "Action de paiement inconnue." }, 400);
    const orderId = text(body?.order_id);
    if (!orderId || orderId.length > 100) return json({ error: "Référence de commande invalide." }, 400);
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,user_id,status,payment_choice,payment_status,subtotal,delivery,total,customer_name,customer_phone,amount_paid")
      .eq("id", orderId).eq("user_id", user.id).maybeSingle();
    if (orderError || !order) return json({ error: "Commande introuvable ou non accessible pour ce compte." }, 404);

    const expectedStatus = order.payment_choice === "pay_now" ? "awaiting_payment" : "awaiting_delivery_payment";
    if (order.status === "new" && ["paid","partially_paid"].includes(order.payment_status)) {
      return json({ ok: true, already_confirmed: true, order_status: order.status, payment_status: order.payment_status });
    }

    // Before opening or reusing a checkout, recover any server-verified
    // transaction left completed by an earlier return/callback failure.
    const { data: verifiedTransactions, error: verifiedTxError } = await admin.from("payment_transactions")
      .select("*")
      .eq("provider", "paydunya")
      .eq("order_id", order.id)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (verifiedTxError) throw verifiedTxError;

    if (verifiedTransactions?.length) {
      const verifiedTx = verifiedTransactions.find((row: any) => row.provider_token) || null;
      if (verifiedTx) {
        const cfg = paymentConfig();
        const invoice = await verifyInvoice(cfg, text(verifiedTx.provider_token));
        const recovered = await settleTransaction(admin, verifiedTx, invoice, cfg.mode);
        const { data: refreshed, error: refreshedError } = await admin.from("orders")
          .select("id,status,payment_status,amount_paid,total")
          .eq("id", order.id).eq("user_id", user.id).maybeSingle();
        if (refreshedError) throw refreshedError;

        if (recovered.gateway_status === "completed" && refreshed?.status === "new") {
          return json({
            ok: true,
            already_confirmed: true,
            recovered_existing_payment: true,
            order_status: refreshed.status,
            payment_status: refreshed.payment_status,
            amount_paid: refreshed.amount_paid,
          });
        }
        if (recovered.gateway_status === "pending") {
          return json({
            error: "Une transaction existe déjà et son statut est encore en attente chez PayDunya. Ne relance pas un paiement ; vérifie à nouveau dans quelques instants.",
            verification_pending: true,
            order_status: refreshed?.status || order.status,
          }, 409);
        }
        return json({
          error: "Une transaction a déjà été enregistrée pour cette commande. Aucune nouvelle facture n'a été créée. Contacte SAMA-PACK pour vérifier son statut.",
          verification_pending: true,
          gateway_status: recovered.gateway_status,
          order_status: refreshed?.status || order.status,
        }, 409);
      }
    }

    if (order.status !== expectedStatus || order.payment_status === "paid") return json({ error: "Cette commande n'attend plus ce paiement.", order_status: order.status }, 409);
    const purpose = order.payment_choice === "pay_now" ? "full" : "delivery";
    const amount = purpose === "full" ? num(order.total) : num(order.delivery);
    if (amount <= 0) return json({ error: "Le montant à payer est invalide." }, 400);
    const cfg = paymentConfig();

    const { data: activeTx, error: activeTxError } = await admin.from("payment_transactions")
      .select("id,provider,status,checkout_url,provider_token,created_at,amount")
      .eq("order_id", order.id).eq("purpose", purpose).in("status", ["creating","pending"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeTxError) throw activeTxError;
    const activeAgeMs = activeTx ? Date.now() - new Date(activeTx.created_at).getTime() : 0;
    if (activeTx?.provider === "paydunya" && activeTx.status === "pending" && activeTx.checkout_url) {
      // A pending local session can already be completed at the gateway.
      // Always verify the existing invoice before sending the customer back
      // to it, so a prior debit is reconciled instead of prompting another payment.
      if (!activeTx.provider_token) {
        return json({
          error: "Une session de paiement existe déjà, mais sa référence PayDunya est absente. Ne paie pas à nouveau ; contacte SAMA-PACK pour vérification.",
          verification_pending: true,
        }, 409);
      }
      const existingInvoice = await verifyInvoice(cfg, text(activeTx.provider_token));
      const existingResult = await settleTransaction(admin, activeTx, existingInvoice, cfg.mode);
      const { data: refreshedOrder, error: refreshedOrderError } = await admin.from("orders")
        .select("id,status,payment_status,amount_paid,total")
        .eq("id", order.id).eq("user_id", user.id).maybeSingle();
      if (refreshedOrderError) throw refreshedOrderError;

      if (existingResult.gateway_status === "completed" && refreshedOrder?.status === "new") {
        return json({
          ok: true,
          already_confirmed: true,
          recovered_existing_payment: true,
          order_status: refreshedOrder.status,
          payment_status: refreshedOrder.payment_status,
          amount_paid: refreshedOrder.amount_paid,
        });
      }
      if (existingResult.gateway_status === "pending") {
        return json({
          ok: true,
          payment_url: activeTx.checkout_url,
          reused: true,
          amount: num(activeTx.amount),
          purpose,
          provider: "paydunya",
        });
      }
      return json({
        error: "PayDunya indique que cette session ne peut pas être relancée automatiquement. Aucune nouvelle facture n'a été créée ; contacte SAMA-PACK pour vérifier la transaction.",
        verification_pending: true,
        gateway_status: existingResult.gateway_status,
      }, 409);
    }
    if (activeTx?.status === "creating" && activeAgeMs < 180_000) {
      return json({ error: "La session de paiement est en cours de création. Réessaie dans quelques secondes." }, 409);
    }
    if (activeTx?.provider !== "paydunya" && activeTx?.status === "pending" && activeAgeMs < 24 * 60 * 60 * 1000) {
      return json({ error: "Une ancienne session PayTech est encore récente pour cette commande. Vérifie qu'aucun paiement n'a été effectué avant de réessayer." }, 409);
    }
    if (activeTx) {
      const { error: expireError } = await admin.from("payment_transactions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", activeTx.id).in("status", ["creating","pending"]);
      if (expireError) throw expireError;
    }

    const { data: tx, error: insertError } = await admin.from("payment_transactions").insert({
      order_id: order.id, user_id: user.id, provider: "paydunya", purpose, amount, currency: "XOF", status: "creating",
    }).select("id").single();
    if (insertError || !tx) {
      if (insertError?.code === "23505") return json({ error: "Une autre session de paiement est déjà en préparation. Réessaie dans quelques secondes." }, 409);
      throw insertError || new Error("Impossible de préparer le paiement.");
    }

    try {
      const label = purpose === "full" ? `Paiement intégral commande ${order.id}` : `Frais de livraison commande ${order.id}`;
      const checkoutPayload = {
        invoice: {
          items: { item_0: {
            name: purpose === "full" ? `Commande SAMA-PACK ${order.id}` : `Frais de livraison — commande ${order.id}`,
            quantity: 1, unit_price: String(Math.round(amount)), total_price: String(Math.round(amount)),
            description: purpose === "full" ? "Règlement intégral de la commande" : "Paiement obligatoire avant confirmation et préparation",
          } },
          total_amount: Math.round(amount),
          description: label,
          customer: { name: order.customer_name || "", email: user.email || "", phone: order.customer_phone || "" },
        },
        store: { name: Deno.env.get("PAYDUNYA_STORE_NAME") || "SAMA-PACK", website_url: SITE_URL, phone: Deno.env.get("SAMA_PACK_PHONE") || "" },
        custom_data: { order_id: order.id, payment_transaction_id: tx.id, purpose },
        actions: {
          return_url: SITE_URL + "/",
          cancel_url: SITE_URL + "/?paydunya_cancelled_order_id=" + encodeURIComponent(order.id),
          callback_url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/sama-payment-webhook`,
        },
      };
      const apiResponse = await fetch(`${cfg.baseUrl}/checkout-invoice/create`, {
        method: "POST", headers: paydunyaHeaders(cfg), body: JSON.stringify(checkoutPayload),
      });
      const gateway = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok || gateway?.response_code !== "00" || !gateway?.token || !gateway?.response_text) {
        const providerMessage = text(gateway?.response_text || gateway?.description || gateway?.message || gateway?.error).slice(0, 300);
        const credentialDiagnostics = {
          mode: cfg.mode,
          master_key_length: cfg.master.length,
          master_key_contains_asterisks: cfg.master.includes("*"),
          master_key_has_internal_whitespace: /\s/.test(cfg.master),
          private_key_length: cfg.privateKey.length,
          private_key_kind: cfg.privateKey.startsWith("test_private_") ? "test" : cfg.privateKey.startsWith("live_private_") ? "live" : "unrecognized",
          token_length: cfg.token.length,
          token_contains_asterisks: cfg.token.includes("*"),
          private_key_contains_asterisks: cfg.privateKey.includes("*"),
        };
        console.error("PayDunya invoice creation rejected:", JSON.stringify({
          http_status: apiResponse.status,
          response_code: gateway?.response_code ?? null,
          response_text: providerMessage,
          credentials: credentialDiagnostics,
          has_token: Boolean(gateway?.token),
          has_response_text: Boolean(gateway?.response_text),
        }));
        if (cfg.master.includes("*") || cfg.privateKey.includes("*") || cfg.token.includes("*")) {
          throw new Error("Une clé PayDunya semble contenir des astérisques masqués. Dans PayDunya, utilise le bouton « Copier » pour copier la valeur réelle, puis remplace le secret correspondant dans Supabase.");
        }
        if (!apiResponse.ok || gateway?.response_code !== "00") {
          const detail = providerMessage || "PayDunya n'a fourni aucun détail.";
          throw new Error(`PayDunya a refusé la création de la facture (HTTP ${apiResponse.status}, code ${String(gateway?.response_code ?? "absent")}): ${detail}`);
        }
        throw new Error("PayDunya a répondu sans fournir le jeton ou l'URL de paiement attendus. Consulte les journaux serveur.");
      }
      let checkoutUrl: URL;
      try {
        checkoutUrl = new URL(String(gateway.response_text).trim());
      } catch {
        console.error("PayDunya checkout URL is not an absolute URL:", JSON.stringify({
          response_text_type: typeof gateway.response_text,
          response_text_length: String(gateway.response_text ?? "").length,
          response_text_starts_https: String(gateway.response_text ?? "").trim().startsWith("https://"),
        }));
        throw new Error("PayDunya a renvoyé une adresse de paiement invalide. Aucune redirection n'a été effectuée.");
      }
      // PayDunya's documented examples use app.paydunya.com, but this account's
      // successful test invoice creation returned paydunya.com. Permit only these
      // exact HTTPS hosts and the expected invoice path for the selected mode.
      const isKnownPayDunyaHost = ["app.paydunya.com", "paydunya.com", "payment.paydunya.com"].includes(checkoutUrl.hostname);
      const isHttps = checkoutUrl.protocol === "https:";
      const hasSafeAuthority = !checkoutUrl.username && !checkoutUrl.password && (!checkoutUrl.port || checkoutUrl.port === "443");
      const pathParts = checkoutUrl.pathname.split("/").filter(Boolean);
      const isExpectedCheckoutPath = cfg.mode === "test"
        ? pathParts.length === 3 && pathParts[0] === "sandbox-checkout" && pathParts[1] === "invoice" && /^[A-Za-z0-9_-]+$/.test(pathParts[2])
        : (
            (pathParts.length === 3 && pathParts[0] === "checkout" && pathParts[1] === "invoice" && /^[A-Za-z0-9_-]+$/.test(pathParts[2]))
            || (checkoutUrl.hostname === "payment.paydunya.com" && pathParts.length === 2 && pathParts[0] === "payment" && /^[A-Za-z0-9_-]+$/.test(pathParts[1]))
          );
      if (!isHttps || !isKnownPayDunyaHost || !hasSafeAuthority || !isExpectedCheckoutPath) {
        console.error("PayDunya checkout URL rejected by allowlist:", JSON.stringify({
          mode: cfg.mode,
          protocol: checkoutUrl.protocol,
          hostname: checkoutUrl.hostname,
          path_prefix: checkoutUrl.pathname.split("/").slice(0, 4).join("/"),
          path_segment_count: pathParts.length,
          has_username: Boolean(checkoutUrl.username),
          has_password: Boolean(checkoutUrl.password),
          has_nonstandard_port: Boolean(checkoutUrl.port && checkoutUrl.port !== "443"),
          has_query: Boolean(checkoutUrl.search),
          has_fragment: Boolean(checkoutUrl.hash),
        }));
        throw new Error("PayDunya a renvoyé une adresse de paiement inattendue. Le lien a été bloqué par sécurité. Vérifie les journaux de paiement avant de réessayer.");
      }
      const { error: updateTxError } = await admin.from("payment_transactions").update({
        provider_token: String(gateway.token), checkout_url: checkoutUrl.toString(), status: "pending", updated_at: new Date().toISOString(),
      }).eq("id", tx.id);
      if (updateTxError) throw updateTxError;
      return json({ ok: true, payment_url: checkoutUrl.toString(), amount, purpose, mode: cfg.mode });
    } catch (error) {
      await admin.from("payment_transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
      throw error;
    }
  } catch (error) {
    const diagnostic = paymentErrorDetails(error);
    const message = diagnostic.message || "Erreur de paiement inattendue.";
    const status = message.includes("pas encore configuré") ? 503 : 500;
    console.error("SAMA-PACK payment checkout error:", JSON.stringify({
      message: message.slice(0, 500),
      code: diagnostic.code,
      details: diagnostic.details.slice(0, 500),
      hint: diagnostic.hint.slice(0, 300),
    }));
    const publicMessage = message.includes("Un associé peut uniquement mettre à jour le statut de sa commande")
      ? "Le paiement a été vérifié, mais la confirmation de la commande n'a pas été finalisée. Ne relance pas un nouveau paiement ; utilise « Vérifier le paiement »."
      : message;
    return json({ error: publicMessage }, status);
  }
});
