import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const text = (value: unknown) => String(value ?? "").trim();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function normalizeSenegalPhone(value: unknown): string | null {
  let digits = text(value).replace(/\D/g, "");
  if (digits.startsWith("00221")) digits = digits.slice(2);
  if (digits.startsWith("221")) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 9) return null;
  return "+221" + digits;
}

type SmsJob = {
  outbox_id: string;
  notification_id: string;
  phone: string | null;
  title: string;
  message: string;
  attempt_count: number;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    console.error("SMS worker: configuration Supabase manquante.");
    return json({ error: "Configuration serveur indisponible." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cronToken = req.headers.get("x-sms-cron-token") || "";
  const { data: tokenValid, error: tokenError } = await admin.rpc(
    "sama_validate_notification_sms_worker_token",
    { p_token: cronToken },
  );
  if (tokenError || tokenValid !== true) {
    return json({ error: "Accès non autorisé." }, 401);
  }

  const clientId = Deno.env.get("ORANGE_SMS_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("ORANGE_SMS_CLIENT_SECRET") || "";
  const senderName = (Deno.env.get("ORANGE_SMS_SENDER_NAME") || "").trim();
  if (!clientId || !clientSecret || !senderName) {
    // Leave the queue untouched until Orange has validated the SAMA-PACK sender name
    // and the credentials have been added as Edge Function secrets.
    return json({
      ok: false,
      configured: false,
      missing: [
        ...(!clientId ? ["ORANGE_SMS_CLIENT_ID"] : []),
        ...(!clientSecret ? ["ORANGE_SMS_CLIENT_SECRET"] : []),
        ...(!senderName ? ["ORANGE_SMS_SENDER_NAME"] : []),
      ],
    }, 503);
  }
  if (senderName.length > 11 || !/^[A-Za-z0-9 ]+$/.test(senderName)) {
    return json({ error: "Le sender name Orange doit contenir au maximum 11 caractères alphanumériques ou espaces." }, 503);
  }

  let token = "";
  const getOrangeToken = async (): Promise<string> => {
    const basic = btoa(clientId + ":" + clientSecret);
    const response = await fetch("https://api.orange.com/oauth/v3/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      throw new Error("Authentification Orange impossible (HTTP " + response.status + ").");
    }
    return String(payload.access_token);
  };

  const sendOrangeSms = async (to: string, message: string): Promise<string> => {
    if (!token) token = await getOrangeToken();

    const senderAddress = "tel:+2210000";
    const endpoint = "https://api.orange.com/smsmessaging/v1/outbound/" +
      encodeURIComponent(senderAddress) + "/requests";
    const requestBody = {
      outboundSMSMessageRequest: {
        address: "tel:" + to,
        senderAddress,
        senderName,
        outboundSMSTextMessage: { message },
      },
    };

    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // Orange access tokens expire after one hour. Refresh once if an expiry is reported.
    if (response.status === 401) {
      token = await getOrangeToken();
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error("Orange SMS HTTP " + response.status + ": " + responseText.slice(0, 500));
    }

    let resourceId = "";
    try {
      const payload = JSON.parse(responseText);
      const resourceUrl = payload?.outboundSMSMessageRequest?.resourceURL || "";
      resourceId = String(resourceUrl).split("/").filter(Boolean).pop() || "";
    } catch {
      // Orange may return an empty body with HTTP 201; the HTTP success is still authoritative.
    }
    return resourceId;
  };

  const { data: jobs, error: claimError } = await admin.rpc(
    "sama_claim_notification_sms_batch",
    { p_limit: 40 },
  );
  if (claimError) {
    console.error("SMS worker: claim failed:", claimError.message);
    return json({ error: "Impossible de récupérer la file SMS." }, 500);
  }

  const batch = (jobs || []) as SmsJob[];
  if (!batch.length) return json({ ok: true, processed: 0, sent: 0, skipped: 0, failed: 0 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < batch.length; index++) {
    const job = batch[index];
    const phone = normalizeSenegalPhone(job.phone);

    if (!phone) {
      const { error } = await admin.rpc("sama_finish_notification_sms_job", {
        p_outbox_id: job.outbox_id,
        p_status: "skipped",
        p_provider_message_id: null,
        p_error: "Numéro de téléphone absent ou invalide dans le profil destinataire.",
      });
      if (error) console.error("SMS worker: unable to close invalid-phone job", job.outbox_id, error.message);
      skipped++;
      continue;
    }

    try {
      const smsText = [text(job.title), text(job.message)].filter(Boolean).join("\n");
      const providerId = await sendOrangeSms(phone, smsText);
      const { error: finishError } = await admin.rpc("sama_finish_notification_sms_job", {
        p_outbox_id: job.outbox_id,
        p_status: "sent",
        p_provider_message_id: providerId,
        p_error: "",
      });
      if (finishError) throw new Error("SMS envoyé mais statut non enregistré : " + finishError.message);
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur Orange SMS inconnue.";
      const { error: finishError } = await admin.rpc("sama_finish_notification_sms_job", {
        p_outbox_id: job.outbox_id,
        p_status: "failed",
        p_provider_message_id: null,
        p_error: message,
      });
      if (finishError) console.error("SMS worker: unable to record failure", job.outbox_id, finishError.message);
      console.error("SMS worker: send failed for job", job.outbox_id, message.slice(0, 350));
      failed++;
    }

    // Orange Sénégal limits throughput to 5 transactions per second.
    if (index < batch.length - 1) await delay(250);
  }

  return json({ ok: true, processed: batch.length, sent, skipped, failed });
});
