import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const SITE_URL = "https://sama-pack.store";

type EmailJob = {
  id: string;
  notification_id: string;
  recipient_email: string;
  recipient_role: string;
  notification_type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  attempt_count: number;
};

const COPY: Record<string, { intro: string; note?: string }> = {
  admin_invited: {
    intro: "Une mise à jour concernant les accès administrateur de SAMA-PACK nécessite votre attention.",
  },
  courier_identity_pending: {
    intro: "Un dossier d'identité de livreur vient d'être soumis et attend une vérification.",
  },
  courier_identity_review: {
    intro: "Le contrôle de votre dossier d'identité de livreur a été mis à jour.",
  },
  delivery_assigned: {
    intro: "Une livraison vient de vous être attribuée. Consultez les informations de la commande dans votre espace livreur.",
  },
  delivery_collection_pending: {
    intro: "Un encaissement déclaré par un livreur attend le contrôle de l'administration.",
  },
  delivery_collection_reviewed: {
    intro: "Le contrôle de l'encaissement déclaré pour une livraison est terminé.",
  },
  delivery_confirmation_code: {
    intro: "Voici l'information nécessaire pour confirmer la remise de votre commande.",
    note: "Important : ne communiquez ce code au livreur qu'au moment où le colis vous est physiquement remis.",
  },
  delivery_failed_admin: {
    intro: "Un livreur a signalé un échec de livraison. Le motif communiqué figure dans le détail ci-dessous.",
  },
  new_order: {
    intro: "Une nouvelle commande ou une commande confirmée après paiement nécessite le suivi de l'équipe.",
  },
  order_payment_confirmed: {
    intro: "Le paiement lié à votre commande a été enregistré. Le détail du montant restant, s'il y en a un, figure dans le message.",
  },
  order_status: {
    intro: "Le suivi de votre commande a été mis à jour. Retrouvez ci-dessous son nouvel état et les informations de paiement communiquées par SAMA-PACK.",
  },
  payment_required: {
    intro: "Une étape de paiement est nécessaire pour confirmer ou préparer votre commande.",
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] ?? ch);
}

function makeEmail(job: EmailJob): { subject: string; html: string; text: string } {
  const title = String(job.title || "Nouvelle notification SAMA-PACK").trim().slice(0, 160);
  const message = String(job.message || "").trim();
  const copy = COPY[job.notification_type] ?? {
    intro: "Vous avez reçu une nouvelle notification concernant votre compte ou votre activité sur SAMA-PACK.",
  };
  const subject = "SAMA-PACK — " + title;
  const noteHtml = copy.note
    ? '<div style="margin:18px 0;padding:14px 16px;border-left:4px solid #d97706;background:#fff7ed;color:#7c2d12;border-radius:8px;font-size:14px;line-height:1.6">' + escapeHtml(copy.note) + "</div>"
    : "";
  const html =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:24px 12px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#17251d">' +
    '<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e1e9e3;border-radius:14px;overflow:hidden">' +
    '<div style="padding:24px 26px;background:#176b43;color:#fff">' +
    '<div style="font-size:12px;letter-spacing:2px;font-weight:700">SAMA-PACK</div>' +
    '<div style="font-size:22px;line-height:1.3;font-weight:700;margin-top:12px">' + escapeHtml(title) + "</div>" +
    '<div style="font-size:13px;line-height:1.5;margin-top:8px;color:#e5f4e9">Notification de votre espace SAMA-PACK</div>' +
    "</div>" +
    '<div style="padding:26px">' +
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.65">Bonjour,</p>' +
    '<p style="margin:0 0 18px;font-size:15px;line-height:1.65">' + escapeHtml(copy.intro) + "</p>" +
    '<div style="padding:16px 18px;background:#f7faf8;border:1px solid #e4ece6;border-radius:10px">' +
    '<div style="font-size:12px;font-weight:700;letter-spacing:.5px;color:#64748b;text-transform:uppercase;margin-bottom:9px">Détail de la notification</div>' +
    '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(message || title) + "</div>" +
    "</div>" + noteHtml +
    '<p style="margin:20px 0 22px;font-size:14px;line-height:1.6;color:#475569">Cette notification est également consultable dans votre espace SAMA-PACK.</p>' +
    '<a href="' + SITE_URL + '" style="display:inline-block;padding:12px 18px;background:#176b43;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Ouvrir SAMA-PACK</a>' +
    "</div>" +
    '<div style="padding:16px 26px;background:#f8faf9;border-top:1px solid #e6ece8;color:#64748b;font-size:12px;line-height:1.6">' +
    "Message automatique lié à votre compte SAMA-PACK. Ne répondez pas directement à cet e-mail si votre adresse de réponse n'est pas surveillée." +
    "</div></div></body></html>";
  const text = [
    "SAMA-PACK — " + title,
    "",
    "Bonjour,",
    copy.intro,
    "",
    "Détail :",
    message || title,
    copy.note ? "" : null,
    copy.note || null,
    "",
    "Cette notification est également consultable dans votre espace SAMA-PACK.",
    SITE_URL,
  ].filter((line) => line !== null).join("\n");
  return { subject, html, text };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Méthode non autorisée." }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Notification email worker: configuration Supabase manquante.");
    return json({ ok: false, error: "Configuration serveur Supabase indisponible." }, 503);
  }
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.error("Notification email worker: variables Resend manquantes.");
    return json({ ok: false, error: "Resend n'est pas entièrement configuré côté serveur." }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cronToken = req.headers.get("x-email-cron-token") ?? "";
  const { data: tokenValid, error: tokenError } = await supabase.rpc(
    "sama_validate_notification_email_worker_token",
    { p_token: cronToken },
  );
  if (tokenError || tokenValid !== true) return json({ ok: false, error: "Accès non autorisé." }, 401);

  const { data: jobs, error: claimError } = await supabase.rpc(
    "sama_claim_notification_email_batch",
    { p_limit: 5 },
  );
  if (claimError) {
    console.error("Notification email worker: impossible de réserver les e-mails.", claimError.message);
    return json({ ok: false, error: "Impossible de récupérer la file d'e-mails." }, 500);
  }

  const batch = (jobs ?? []) as EmailJob[];
  if (batch.length === 0) {
    return json({ ok: true, configured: true, processed: 0, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (let index = 0; index < batch.length; index++) {
    const job = batch[index];
    try {
      const email = makeEmail(job);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [job.recipient_email],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      const responseText = await response.text();
      if (!response.ok) {
        const reason = "Resend HTTP " + response.status + ": " + responseText.slice(0, 700);
        const { error: finishError } = await supabase.rpc("sama_finish_notification_email_job", {
          p_outbox_id: job.id,
          p_status: "failed",
          p_provider_message_id: null,
          p_error: reason,
        });
        if (finishError) console.error("Unable to record failed email job", job.id, finishError.message);
        failed++;
      } else {
        let providerId: string | null = null;
        try {
          const payload = JSON.parse(responseText);
          providerId = typeof payload.id === "string" ? payload.id : null;
        } catch {
          // Resend normally returns a JSON id; a successful HTTP response remains authoritative.
        }
        const { error: finishError } = await supabase.rpc("sama_finish_notification_email_job", {
          p_outbox_id: job.id,
          p_status: "sent",
          p_provider_message_id: providerId,
          p_error: "",
        });
        if (finishError) {
          console.error("Email sent but database status update failed", job.id, finishError.message);
          failed++;
        } else {
          sent++;
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur réseau inconnue.";
      const { error: finishError } = await supabase.rpc("sama_finish_notification_email_job", {
        p_outbox_id: job.id,
        p_status: "failed",
        p_provider_message_id: null,
        p_error: reason.slice(0, 900),
      });
      if (finishError) console.error("Unable to record email transport failure", job.id, finishError.message);
      failed++;
    }

    if (index < batch.length - 1) await wait(1000);
  }

  return json({ ok: true, configured: true, processed: batch.length, sent, failed });
});