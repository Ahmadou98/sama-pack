import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_CONTACT = "mailto:commercial.samapack@gmail.com";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "Server configuration incomplete." }, 500);

  const suppliedToken = req.headers.get("x-web-push-worker-token") ?? "";
  if (!suppliedToken) return json({ ok: false, error: "Unauthorized." }, 401);

  const { data: authorized, error: authError } = await supabase.rpc(
    "sama_validate_web_push_worker_token",
    { p_token: suppliedToken },
  );
  if (authError || authorized !== true) return json({ ok: false, error: "Unauthorized." }, 401);

  const { data: vapidJson, error: vapidError } = await supabase.rpc("sama_get_web_push_private_key");
  if (vapidError || typeof vapidJson !== "string" || !vapidJson) {
    console.error("Web Push VAPID configuration unavailable", vapidError);
    return json({ ok: false, error: "Push configuration unavailable." }, 503);
  }

  let appServer: webpush.ApplicationServer;
  try {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidJson), { extractable: false });
    appServer = await webpush.ApplicationServer.new({
      contactInformation: VAPID_CONTACT,
      vapidKeys,
    });
  } catch (error) {
    console.error("Web Push VAPID key could not be loaded", error);
    return json({ ok: false, error: "Push configuration invalid." }, 500);
  }

  const { data: jobs, error: claimError } = await supabase.rpc(
    "sama_claim_web_push_batch",
    { p_limit: 25 },
  );
  if (claimError) {
    console.error("Could not claim Web Push jobs", claimError);
    return json({ ok: false, error: "Could not claim push jobs." }, 500);
  }

  let processed = 0;
  let delivered = 0;
  let retried = 0;

  for (const job of (jobs ?? [])) {
    processed += 1;
    const { data: payload, error: payloadError } = await supabase.rpc(
      "sama_get_web_push_job",
      { p_outbox_id: job.outbox_id },
    );

    if (payloadError || !payload) {
      await supabase.rpc("sama_finish_web_push_job", {
        p_outbox_id: job.outbox_id,
        p_status: "failed",
        p_error: "Impossible de récupérer le contenu de la notification.",
      });
      retried += 1;
      continue;
    }

    const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
    const notificationId = String(payload.notification_id ?? job.notification_id);
    const pushMessage = JSON.stringify({
      title: String(payload.title ?? "SAMA-PACK"),
      body: String(payload.message ?? "Une mise à jour est disponible dans votre compte."),
      url: "/?spAction=notifications",
      notificationId,
      tag: "sama-" + notificationId,
    });

    const outcomes = await Promise.all(subscriptions.map(async (item: {
      endpoint?: string;
      p256dh?: string;
      auth?: string;
    }) => {
      if (!item.endpoint || !item.p256dh || !item.auth) return "failed";
      try {
        const subscriber = appServer.subscribe({
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        });
        await subscriber.pushTextMessage(pushMessage, {
          ttl: 86400,
          urgency: webpush.Urgency.High,
          topic: notificationId.replaceAll("-", "").slice(0, 32),
        });
        return "sent";
      } catch (error) {
        const status = error instanceof webpush.PushMessageError ? error.response.status : 0;
        if (status === 404 || status === 410) {
          await supabase.rpc("sama_delete_web_push_subscription", { p_endpoint: item.endpoint });
          return "expired";
        }
        let endpointHost = "unknown";
        try { endpointHost = new URL(item.endpoint!).host; } catch { /* invalid endpoint */ }
        console.error("Web Push delivery failed", { status, endpointHost });
        return "failed";
      }
    }));

    const failures = outcomes.filter((value) => value === "failed").length;
    const successes = outcomes.filter((value) => value === "sent").length;
    const { error: finishError } = await supabase.rpc("sama_finish_web_push_job", {
      p_outbox_id: job.outbox_id,
      p_status: failures > 0 ? "failed" : "sent",
      p_error: failures > 0 ? String(failures) + " appareil(s) n'ont pas accepté la notification." : "",
    });

    if (finishError) {
      console.error("Could not finish Web Push job", finishError);
      retried += 1;
    } else if (failures > 0) {
      retried += 1;
    } else {
      delivered += successes;
    }
  }

  return json({ ok: true, processed, delivered, retried });
});
