import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const ALLOWED_ORIGINS = new Set([
  "https://sama-pack.store",
  "https://www.sama-pack.store",
  "https://sama-pack.ahmadoulaminediouf39.workers.dev",
]);
function cors(origin: string | null) {
  const allowed = !!origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://sama-pack.store",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const clean = (value: unknown) => String(value ?? "").trim();
function validFilePath(path: string, userId: string, side: "front" | "back") {
  if (!path.startsWith(userId + "/")) return false;
  const name = path.slice(userId.length + 1);
  return new RegExp("^[a-f0-9-]{36}_" + side + "\\.(?:jpg|jpeg|png|webp)$", "i").test(name);
}
async function existsInStorage(admin: ReturnType<typeof createClient>, path: string, userId: string) {
  const name = path.slice(userId.length + 1);
  const { data, error } = await admin.storage.from("courier-identity").list(userId, { limit: 100, search: name });
  if (error) throw new Error("Impossible de vérifier la photo de la pièce : " + error.message);
  return (data || []).some(item => item.name === name);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin) && !/^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)) {
    return json({ error: "Origine non autorisée." }, 403, origin);
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!url || !publishable || !secret || !authorization) return json({ error: "Configuration ou session manquante." }, 500, origin);

  const caller = createClient(url, publishable, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401, origin);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,role,is_super_admin,full_name,email").eq("id", user.id).maybeSingle();
  if (profileError || !profile) return json({ error: "Profil introuvable." }, 403, origin);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "Corps JSON invalide." }, 400, origin); }
  const action = clean(payload.action);
  const isOwner = profile.role === "admin" && profile.is_super_admin === true;

  try {
    if (action === "submit") {
      if (profile.role !== "courier") return json({ error: "Cette démarche est réservée aux comptes livreurs." }, 403, origin);
      const documentType = clean(payload.document_type);
      const legalName = clean(payload.legal_name);
      const documentNumber = clean(payload.document_number).replace(/\\s+/g, " ");
      const issuingCountry = clean(payload.issuing_country) || "Sénégal";
      const expiresOn = clean(payload.expires_on) || null;
      const frontPath = clean(payload.front_image_path);
      const backPath = clean(payload.back_image_path);
      const consent = payload.consent === true;
      if (!["national_id", "passport"].includes(documentType)) return json({ error: "Choisis une carte nationale d’identité ou un passeport." }, 400, origin);
      if (legalName.length < 2 || legalName.length > 160) return json({ error: "Le nom complet doit correspondre à la pièce officielle." }, 400, origin);
      if (documentNumber.length < 4 || documentNumber.length > 50 || !/^[a-zA-Z0-9 ./-]+$/.test(documentNumber)) return json({ error: "Numéro de pièce invalide." }, 400, origin);
      if (issuingCountry.length < 2 || issuingCountry.length > 80) return json({ error: "Pays de délivrance invalide." }, 400, origin);
      if (expiresOn && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn)) || new Date(expiresOn + "T23:59:59Z").getTime() < Date.now())) {
        return json({ error: "La date d’expiration est invalide ou dépassée." }, 400, origin);
      }
      if (!consent) return json({ error: "Confirme la notice d’utilisation des données personnelles pour envoyer ta pièce." }, 400, origin);
      if (!validFilePath(frontPath, user.id, "front")) return json({ error: "La photo du recto de la pièce est obligatoire." }, 400, origin);
      if (documentType === "national_id" && !validFilePath(backPath, user.id, "back")) return json({ error: "La photo du verso de la carte nationale est obligatoire." }, 400, origin);
      if (documentType === "passport" && backPath) return json({ error: "Pour un passeport, seule la page d’identité est requise." }, 400, origin);
      if (!(await existsInStorage(admin, frontPath, user.id))) return json({ error: "La photo du recto n’a pas été correctement téléversée." }, 400, origin);
      if (backPath && !(await existsInStorage(admin, backPath, user.id))) return json({ error: "La photo du verso n’a pas été correctement téléversée." }, 400, origin);

      const { data: existing } = await admin.from("courier_identity_documents")
        .select("verification_status,front_image_path,back_image_path").eq("courier_id", user.id).maybeSingle();
      if (existing?.verification_status === "approved") return json({ error: "Ton identité est déjà validée. Contacte l’administrateur pour demander une nouvelle vérification." }, 409, origin);
      const now = new Date().toISOString();
      const { error: saveError } = await admin.from("courier_identity_documents").upsert({
        courier_id: user.id,
        document_type: documentType,
        legal_name: legalName,
        document_number: documentNumber,
        issuing_country: issuingCountry,
        expires_on: expiresOn,
        front_image_path: frontPath,
        back_image_path: backPath || null,
        verification_status: "pending",
        rejection_reason: "",
        submitted_at: now,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      }, { onConflict: "courier_id" });
      if (saveError) throw new Error("Enregistrement du dossier impossible : " + saveError.message);
      const obsoletePaths = [existing?.front_image_path, existing?.back_image_path]
        .filter((path): path is string => Boolean(path) && path !== frontPath && path !== backPath);
      if (obsoletePaths.length) {
        const { error: cleanupError } = await admin.storage.from("courier-identity").remove(obsoletePaths);
        if (cleanupError) console.warn("Anciennes photos d’identité non supprimées :", cleanupError.message);
      }
      const { data: owners } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_super_admin", true);
      for (const owner of owners || []) {
        await admin.from("notifications").insert({
          recipient_user_id: owner.id,
          type: "courier_identity_pending",
          title: "Pièce d’identité d’un livreur à vérifier",
          message: (profile.full_name || user.email || "Un livreur") + " a soumis ses informations d’identification.",
          entity_type: "courier_identity",
          entity_id: user.id,
        });
      }
      return json({ ok: true, message: "Pièce envoyée. Ton accès aux livraisons sera activé après vérification par l’administrateur général." }, 200, origin);
    }

    if (action === "review") {
      if (!isOwner) return json({ error: "Seul l’administrateur général peut vérifier les pièces d’identité." }, 403, origin);
      const courierId = clean(payload.courier_id);
      const decision = clean(payload.decision);
      const note = clean(payload.note).slice(0, 1000);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courierId)) return json({ error: "Référence livreur invalide." }, 400, origin);
      if (!["approved", "rejected"].includes(decision)) return json({ error: "Décision de vérification invalide." }, 400, origin);
      if (decision === "rejected" && note.length < 5) return json({ error: "Indique le motif du rejet pour que le livreur puisse corriger son dossier." }, 400, origin);
      const { data: target, error: targetError } = await admin.from("profiles").select("id,role,full_name,email").eq("id", courierId).maybeSingle();
      if (targetError || !target || target.role !== "courier") return json({ error: "Compte livreur introuvable." }, 404, origin);
      const { data: document, error: documentError } = await admin.from("courier_identity_documents")
        .select("courier_id,verification_status,expires_on").eq("courier_id", courierId).maybeSingle();
      if (documentError || !document) return json({ error: "Dossier d’identité introuvable." }, 404, origin);
      if (document.verification_status !== "pending") return json({ error: "Ce dossier a déjà été traité. Actualise la liste des vérifications." }, 409, origin);
      if (decision === "approved" && document.expires_on && new Date(document.expires_on + "T23:59:59Z").getTime() < Date.now()) {
        return json({ error: "Cette pièce est arrivée à expiration. Demande au livreur une pièce valide." }, 409, origin);
      }
      const now = new Date().toISOString();
      const { error: updateError } = await admin.from("courier_identity_documents").update({
        verification_status: decision,
        rejection_reason: decision === "rejected" ? note : "",
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      }).eq("courier_id", courierId);
      if (updateError) throw new Error("Décision impossible : " + updateError.message);
      await admin.from("notifications").insert({
        recipient_user_id: courierId,
        type: "courier_identity_review",
        title: decision === "approved" ? "Identité vérifiée" : "Pièce d’identité à corriger",
        message: decision === "approved"
          ? "Ton identité a été validée. Tu peux maintenant accéder à ton espace livreur et recevoir des livraisons."
          : "Ton dossier d’identité a été refusé. Motif : " + note + " Tu peux envoyer une nouvelle pièce depuis ton espace livreur.",
        entity_type: "courier_identity",
        entity_id: courierId,
      });
      return json({ ok: true, message: decision === "approved" ? "Identité validée. Le livreur peut désormais recevoir des livraisons." : "Dossier rejeté. Le livreur a reçu le motif et peut soumettre une nouvelle pièce." }, 200, origin);
    }

    return json({ error: "Action non reconnue." }, 400, origin);
  } catch (error) {
    console.error("sama-courier-identity error:", error instanceof Error ? error.message : String(error));
    return json({ error: error instanceof Error ? error.message : "Erreur serveur inattendue." }, 500, origin);
  }
});