import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
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

function paymentConfig() {
  const mode = (Deno.env.get("PAYDUNYA_MODE") || "test").trim().toLowerCase();
  const master = (Deno.env.get("PAYDUNYA_MASTER_KEY") || "").trim();
  const privateKey = (Deno.env.get("PAYDUNYA_PRIVATE_KEY") || "").trim();
  const token = (Deno.env.get("PAYDUNYA_TOKEN") || "").trim();
  if (!["test", "live"].includes(mode) || !master || !privateKey || !token) throw new Error("Configuration PayDunya manquante ou invalide.");
  return {
    mode,
    master,
    privateKey,
    token,
    baseUrl: mode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1",
  };
}
function paydunyaHeaders(cfg: ReturnType<typeof paymentConfig>) {
  return { "Content-Type": "application/json", "PAYDUNYA-MASTER-KEY": cfg.master, "PAYDUNYA-PRIVATE-KEY": cfg.privateKey, "PAYDUNYA-TOKEN": cfg.token };
}
async function verifyInvoice(cfg: ReturnType<typeof paymentConfig>, token: string) {
  const response = await fetch(`${cfg.baseUrl}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
    method: "GET", headers: paydunyaHeaders(cfg),
  });
  if (!response.ok) throw new Error(`Vérification PayDunya indisponible (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.response_code !== "00") throw new Error("La facture n'a pas pu être vérifiée auprès de PayDunya.");
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

async function finalizePayment(admin: ReturnType<typeof createClient>, tx: any, invoice: any, mode: string, forceEmail = false) {
  const token = text(invoice?.invoice?.token || invoice?.token);
  if (!token || token !== tx.provider_token) throw new Error("Jeton de facture incorrect.");
  const state = text(invoice?.status).toLowerCase();

  if (state === "pending") return { state: "pending" };
  if (state === "cancelled" || state === "failed") {
    await admin.from("payment_transactions").update({
      status: state === "cancelled" ? "cancelled" : "failed", updated_at: new Date().toISOString(),
    }).eq("id", tx.id).neq("status", "completed");
    return { state };
  }
  if (state !== "completed") return { state: state || "unknown" };

  const invoiceAmount = num(invoice?.invoice?.total_amount ?? invoice?.total_amount);
  if (Math.abs(invoiceAmount - num(tx.amount)) > 0.5) throw new Error("Le montant reçu ne correspond pas à celui de la transaction.");
  const now = new Date().toISOString();
  const { error: updateTxError } = await admin.from("payment_transactions").update({
    status: "completed", provider_transaction_id: token, verified_at: now, updated_at: now,
  }).eq("id", tx.id);
  if (updateTxError) throw updateTxError;

  const { data: order, error: orderError } = await admin.from("orders")
    .select("id,user_id,status,payment_choice,payment_status,total,delivery,amount_paid,customer_name,customer_phone,delivery_address,delivery_zone,subtotal")
    .eq("id", tx.order_id).maybeSingle();
  if (orderError || !order) throw new Error("Commande associée introuvable.");

  const { data: completed, error: completedError } = await admin.from("payment_transactions")
    .select("id,amount")
    .eq("order_id", tx.order_id).eq("status", "completed");
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
      state: "completed",
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
  let nextStatus = order.status;
  let nextPaymentStatus = fullyPaid ? "paid" : amountPaid > 0 ? "partially_paid" : "pending";
  if (order.status === "cancelled") {
    nextPaymentStatus = "refund_review";
  } else if (["awaiting_payment", "awaiting_delivery_payment"].includes(order.status)) {
    if (tx.purpose === "full" && fullyPaid && Math.abs(num(tx.amount) - num(order.total)) <= 0.5) {
      nextStatus = "new";
    } else if (tx.purpose === "delivery" && num(order.delivery) > 0 && num(tx.amount) >= num(order.delivery)) {
      nextStatus = "new";
      nextPaymentStatus = fullyPaid ? "paid" : "partially_paid";
    }
  }

  const { error: updateOrderError } = await admin.from("orders").update({
    status: nextStatus, payment_status: nextPaymentStatus, amount_paid: amountPaid, updated_at: now,
  }).eq("id", order.id);
  if (updateOrderError) throw updateOrderError;

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
  return { state: "completed", order_id: order.id, order_status: nextStatus, payment_status: nextPaymentStatus, amount_paid: amountPaid, confirmation_email_status: confirmationEmailStatus };
}

async function parseCallback(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const rawData = form.get("data");
    if (typeof rawData === "string") {
      try { return JSON.parse(rawData); } catch { return null; }
    }
    return null;
  }
  const raw = await req.text();
  try {
    const body = JSON.parse(raw);
    if (typeof body?.data === "string") {
      try { return JSON.parse(body.data); } catch { return null; }
    }
    return body?.data || body;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = resolveNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Configuration Supabase serveur incomplète." }, 500);

    const data = await parseCallback(req);
    const invoiceToken = text(data?.invoice?.token || data?.token);
    if (!invoiceToken) return json({ ok: true, ignored: true, reason: "Jeton de facture absent." });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: tx, error: txError } = await admin.from("payment_transactions")
      .select("*").eq("provider", "paydunya").eq("provider_token", invoiceToken).maybeSingle();
    if (txError) throw txError;
    if (!tx) return json({ ok: true, ignored: true, reason: "Aucune transaction correspondante." });

    const cfg = paymentConfig();
    // Ne jamais faire confiance au statut envoyé dans le callback : vérifier la facture directement auprès de PayDunya.
    const verifiedInvoice = await verifyInvoice(cfg, invoiceToken);
    const result = await finalizePayment(admin, tx, verifiedInvoice, cfg.mode);
    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur callback paiement.";
    console.error("SAMA-PACK payment webhook error:", message);
    return json({ ok: false, error: "Le callback nécessite une nouvelle tentative de traitement." }, 500);
  }
});
