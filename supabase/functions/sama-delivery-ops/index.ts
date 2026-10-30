import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SITE_ORIGINS = new Set([
  "https://sama-pack.store",
  "https://www.sama-pack.store",
  "https://sama-pack.ahmadoulaminediouf39.workers.dev",
]);
function corsHeaders(origin: string | null) {
  const allowed = !!origin && (SITE_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin));
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
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
const labels: Record<string, string> = {
  assigned: "Livreur attribué",
  out_for_delivery: "Départ en livraison",
  delivery_confirmed: "Livraison confirmée",
  delivery_failed: "Livraison non effectuée",
  collection_recorded: "Encaissement déclaré",
  collection_validated: "Encaissement validé",
  collection_rejected: "Encaissement rejeté",
  delivery_return_requested: "Retour au dépôt demandé",
  delivery_return_confirmed: "Retour au dépôt confirmé",
};
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);
  if (origin && !SITE_ORIGINS.has(origin) && !/^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)) {
    return json({ error: "Origine non autorisée." }, 403, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !publishableKey || !serviceKey || !authorization) {
    return json({ error: "Configuration serveur ou session manquante." }, 500, origin);
  }

  const caller = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json({ error: "Session invalide. Reconnecte-toi." }, 401, origin);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,full_name,email,role,is_super_admin,admin_permissions")
    .eq("id", user.id).maybeSingle();
  if (profileError || !profile) return json({ error: "Profil utilisateur introuvable." }, 403, origin);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ error: "Corps de requête invalide." }, 400, origin); }
  const action = text(payload.action);
  const isOwner = profile.role === "admin" && profile.is_super_admin === true;
  const isCourier = profile.role === "courier";
  const isAdmin = profile.role === "admin";
  const notify = async (recipient: string, type: string, title: string, message: string, orderId: string) => {
    const { error } = await admin.from("notifications").insert({
      recipient_user_id: recipient, type, title, message, entity_type: "order", entity_id: orderId,
    });
    if (error) throw new Error("Notification impossible : " + error.message);
  };
  const event = async (row: Record<string, unknown>) => {
    const { error } = await admin.from("order_delivery_events").insert(row);
    if (error) throw new Error("Journal de livraison impossible : " + error.message);
  };
  const getAssignedOrder = async (orderId: string) => {
    const { data, error } = await admin.from("orders")
      .select("id,user_id,customer_name,customer_phone,delivery_address,delivery_zone,slot,total,delivery,amount_paid,payment_status,payment_choice,status,assigned_courier_id,delivery_attempt_status,delivery_failure_reason")
      .eq("id", orderId).maybeSingle();
    if (error) throw new Error("Lecture de la commande impossible : " + error.message);
    if (!data) throw new Error("Commande introuvable.");
    if (!isCourier || data.assigned_courier_id !== user.id) throw new Error("Cette commande ne t’est pas attribuée.");
    return data;
  };

  try {
    if (action === "cancel_delivery_return") {
      if (!isOwner) return json({ error: "Seul l’administrateur général peut annuler une livraison en cours et déclencher un retour au dépôt." }, 403, origin);
      const orderId = text(payload.order_id);
      if (!orderId) return json({ error: "Référence de commande manquante." }, 400, origin);
      const { data: order, error: orderError } = await admin.from("orders")
        .select("id,user_id,customer_name,status,assigned_courier_id,delivery_attempt_status,total,amount_paid")
        .eq("id", orderId).maybeSingle();
      if (orderError || !order) return json({ error: "Commande introuvable." }, 404, origin);
      if (order.status !== "out_for_delivery" || order.delivery_attempt_status !== "in_progress") {
        return json({ error: "Seule une commande actuellement en cours de livraison peut déclencher cette procédure de retour." }, 409, origin);
      }
      if (!order.assigned_courier_id) return json({ error: "Aucun livreur n’est affecté à cette commande." }, 409, origin);

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const salt = randomHex(16);
      const codeHash = await digest(salt + ":return:" + orderId + ":" + code);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: codeError } = await admin.from("delivery_return_confirmation_codes").upsert({
        order_id: orderId, courier_id: order.assigned_courier_id, code_hash: codeHash,
        salt, expires_at: expiresAt, attempts: 0, created_at: new Date().toISOString(),
        last_attempt_at: null, verified_at: null,
      }, { onConflict: "order_id" });
      if (codeError) throw new Error("Impossible de préparer le code de retour : " + codeError.message);

      const { data: updatedOrder, error: updateError } = await admin.from("orders").update({
        status: "cancelled",
        delivery_attempt_status: "return_pending",
        delivery_failure_reason: "Commande annulée pendant la livraison. Retour physique du colis chez SAMA-PACK requis.",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId).eq("status", "out_for_delivery")
        .eq("delivery_attempt_status", "in_progress")
        .select("id").maybeSingle();
      if (updateError) throw new Error("Annulation et retour non enregistrés : " + updateError.message);
      if (!updatedOrder) return json({ error: "La commande a changé d’état. Actualise la liste avant de réessayer." }, 409, origin);

      await admin.from("delivery_confirmation_codes").delete().eq("order_id", orderId);
      await event({
        order_id: orderId, courier_id: order.assigned_courier_id, actor_user_id: user.id,
        event_type: "delivery_return_requested",
        note: "Commande annulée pendant la livraison. Le colis doit être rapporté et contrôlé chez SAMA-PACK avant confirmation du retour.",
      });

      await notify(order.assigned_courier_id, "delivery_return_requested", "Retour au dépôt obligatoire",
        "La commande " + orderId + " a été annulée pendant ta tournée. Ne remets pas le colis au client. Rapporte tous les articles chez SAMA-PACK. Après réception et contrôle physique au dépôt, l’administrateur général te communiquera le code à saisir dans ton espace livreur. Le code de retour n’est pas communiqué à l’avance.", orderId);

      const { data: owners, error: ownersError } = await admin.from("profiles")
        .select("id").eq("role", "admin").eq("is_super_admin", true);
      if (ownersError) throw new Error("Impossible de préparer l’avis à l’administrateur général : " + ownersError.message);
      if (!owners?.length) throw new Error("Aucun administrateur général n’est configuré pour recevoir le code de retour.");
      for (const owner of owners) {
        await notify(owner.id, "delivery_return_code", "Code de contrôle du retour — " + orderId,
          "Commande " + orderId + " annulée pendant la livraison. Livre​​ur concerné : " + profile.full_name +
            ". Le colis doit être reçu et contrôlé physiquement chez SAMA-PACK avant de communiquer ce code au livreur : " + code +
            ". Code valable 24 heures. Ne le communique qu’après avoir récupéré et vérifié le colis.",
          orderId);
      }
      return json({
        ok: true,
        message: "Commande annulée. Le livreur a reçu l’ordre de retour et le code de contrôle a été envoyé à l’administrateur général."
      }, 200, origin);
    }

    if (action === "confirm_return") {
      if (!isCourier) return json({ error: "Accès réservé aux livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const code = text(payload.code);
      if (!/^\\d{6}$/.test(code)) return json({ error: "Saisis le code à six chiffres remis par l’administrateur au dépôt." }, 400, origin);
      const order = await getAssignedOrder(orderId);
      if (order.status !== "cancelled" || order.delivery_attempt_status !== "return_pending") {
        return json({ error: "Cette commande n’attend pas de confirmation de retour au dépôt." }, 409, origin);
      }
      const { data: storedCode, error: readCodeError } = await admin.from("delivery_return_confirmation_codes")
        .select("*").eq("order_id", orderId).eq("courier_id", user.id).maybeSingle();
      if (readCodeError || !storedCode) return json({ error: "Code de retour introuvable. Contacte l’administrateur général." }, 404, origin);
      if (storedCode.verified_at) return json({ error: "Ce retour a déjà été confirmé." }, 409, origin);
      if (new Date(storedCode.expires_at).getTime() < Date.now()) return json({ error: "Le code de retour a expiré. Demande à l’administrateur général de le renouveler." }, 410, origin);
      if (Number(storedCode.attempts || 0) >= 5) return json({ error: "Trop de tentatives. Contacte l’administrateur général." }, 429, origin);
      const suppliedHash = await digest(String(storedCode.salt) + ":return:" + orderId + ":" + code);
      if (!safeEqual(suppliedHash, String(storedCode.code_hash))) {
        await admin.from("delivery_return_confirmation_codes").update({
          attempts: Number(storedCode.attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        }).eq("order_id", orderId);
        return json({ error: "Code de retour incorrect. Vérifie le code donné par l’administrateur après réception du colis." }, 400, origin);
      }

      const now = new Date().toISOString();
      const { data: updatedOrder, error: updateError } = await admin.from("orders").update({
        delivery_attempt_status: "returned",
        updated_at: now,
      }).eq("id", orderId).eq("assigned_courier_id", user.id)
        .eq("status", "cancelled").eq("delivery_attempt_status", "return_pending")
        .select("id").maybeSingle();
      if (updateError) throw new Error("Confirmation du retour impossible : " + updateError.message);
      if (!updatedOrder) return json({ error: "L’état de retour a changé. Actualise tes livraisons." }, 409, origin);

      const { error: codeUpdateError } = await admin.from("delivery_return_confirmation_codes")
        .update({ verified_at: now }).eq("order_id", orderId).eq("courier_id", user.id);
      if (codeUpdateError) throw new Error("Retour enregistré, mais le code n’a pas pu être clôturé : " + codeUpdateError.message);
      await event({
        order_id: orderId, courier_id: user.id, actor_user_id: user.id,
        event_type: "delivery_return_confirmed",
        note: "Colis reçu et contrôlé chez SAMA-PACK. Retour confirmé par le code de dépôt.",
      });

      const { data: owners } = await admin.from("profiles")
        .select("id").eq("role", "admin").eq("is_super_admin", true);
      for (const owner of owners || []) {
        await notify(owner.id, "delivery_return_confirmed", "Retour du colis confirmé",
          "Le retour de la commande " + orderId + " a été confirmé par code au dépôt par " +
            (profile.full_name || user.email || "le livreur") + ". Le colis est enregistré comme retourné chez SAMA-PACK.",
          orderId);
      }
      if (order.user_id) {
        await notify(order.user_id, "delivery_return_confirmed_customer", "Retour du colis enregistré",
          "Le colis de ta commande annulée " + orderId + " a été reçu et enregistré chez SAMA-PACK. Notre équipe te communiquera les prochaines étapes.",
          orderId);
      }
      return json({ ok: true, message: "Retour confirmé. Le colis est enregistré comme reçu chez SAMA-PACK." }, 200, origin);
    }

    if (action === "invite_courier") {
      if (!isOwner) return json({ error: "Seul l’administrateur général peut inviter un livreur." }, 403, origin);
      const email = text(payload.email).toLowerCase();
      const fullName = text(payload.full_name).slice(0, 120);
      const phone = text(payload.phone).slice(0, 40);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Adresse e-mail invalide." }, 400, origin);
      if (fullName.length < 2) return json({ error: "Saisis le nom complet du livreur." }, 400, origin);
      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: "Impossible de vérifier les comptes existants." }, 502, origin);
      const existingUser = usersData.users.find(item => item.email?.toLowerCase() === email);
      let targetId = "";
      let inviteMessage = "";
      if (existingUser) {
        const { data: existingProfile, error: existingProfileError } = await admin.from("profiles")
          .select("role").eq("id", existingUser.id).maybeSingle();
        if (existingProfileError) {
          console.error("sama-delivery-ops existing profile lookup failed", existingProfileError.message);
          return json({ error: "Impossible de vérifier le compte déjà associé à cette adresse : " + existingProfileError.message }, 500, origin);
        }
        if (existingProfile?.role === "courier") {
          return json({
            ok: true,
            already_courier: true,
            invitation_pending: !existingUser.email_confirmed_at,
            message: existingUser.email_confirmed_at
              ? "Ce compte est déjà enregistré comme livreur. Il peut se connecter avec son mot de passe habituel."
              : "Ce compte est déjà enregistré comme livreur. Le lien d’invitation initial a déjà été envoyé : vérifie la boîte de réception et les courriers indésirables."
          }, 200, origin);
        }
        if (existingProfile?.role === "admin") {
          return json({ error: "Cette adresse appartient à un compte administrateur et ne peut pas être convertie en compte livreur." }, 409, origin);
        }

        // Un compte client existant peut être promu explicitement par le propriétaire.
        // Il conserve son identifiant et son mot de passe : aucun compte en doublon n'est créé.
        const { error: promoteError } = await caller.rpc("sama_provision_courier_profile", {
          p_user_id: existingUser.id,
          p_email: email,
          p_full_name: fullName,
          p_phone: phone || null,
        });
        if (promoteError) {
          console.error("sama-delivery-ops existing customer promotion failed", promoteError.message);
          return json({ error: "Le compte existe déjà, mais sa conversion en livreur a échoué : " + promoteError.message }, 500, origin);
        }
        return json({
          ok: true,
          promoted_existing_account: true,
          message: "Ce compte existait déjà : son rôle a été converti en livreur. La personne pourra se connecter avec son mot de passe habituel."
        }, 200, origin);
      }
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://sama-pack.store/livraisons.html",
        data: { full_name: fullName, account_type: "courier" },
      });
      if (inviteError || !invitation.user) return json({ error: inviteError?.message || "L’invitation n’a pas pu être envoyée." }, 400, origin);
      targetId = invitation.user.id;
      // Le rôle est attribué via une RPC sécurisée qui vérifie le super-administrateur
      // dans le contexte JWT de l'appelant. Éviter l'upsert service-role ici :
      // le garde-fou des profils exige une session propriétaire pour changer le rôle.
      const { error: profileProvisionError } = await caller.rpc("sama_provision_courier_profile", {
        p_user_id: targetId,
        p_email: email,
        p_full_name: fullName,
        p_phone: phone || null,
      });
      if (profileProvisionError) {
        console.error("sama-delivery-ops courier profile provisioning failed", profileProvisionError.message);
        return json({
          error: "L’invitation e-mail a été envoyée, mais la création du profil livreur a échoué : " + profileProvisionError.message,
          invitation_sent: true,
        }, 500, origin);
      }
      return json({ ok: true, message: "Invitation envoyée. Le livreur doit ouvrir le lien reçu, renseigner sa pièce officielle et créer son mot de passe dans le formulaire.", email }, 200, origin);
    }

    if (action === "assign_courier") {
      if (!isOwner) return json({ error: "Seul l’administrateur général peut attribuer les livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const courierId = text(payload.courier_id);
      if (!orderId) return json({ error: "Référence de commande manquante." }, 400, origin);
      const { data: order, error: orderError } = await admin.from("orders")
        .select("id,status,assigned_courier_id,delivery_attempt_status")
        .eq("id", orderId).maybeSingle();
      if (orderError || !order) return json({ error: "Commande introuvable." }, 404, origin);
      if (!["prepared", "out_for_delivery"].includes(order.status) ||
          (order.status === "out_for_delivery" && order.delivery_attempt_status !== "failed")) {
        return json({ error: "Un livreur peut être attribué lorsque la commande est prête, ou après un échec de livraison." }, 409, origin);
      }
      let courier: { id: string; full_name: string; email: string; phone: string } | null = null;
      if (courierId) {
        const { data, error } = await admin.from("profiles").select("id,full_name,email,phone,role").eq("id", courierId).maybeSingle();
        if (error || !data || data.role !== "courier") return json({ error: "Compte livreur invalide." }, 400, origin);
        const { data: identity, error: identityError } = await admin.from("courier_identity_documents")
          .select("verification_status").eq("courier_id", courierId).maybeSingle();
        if (identityError || identity?.verification_status !== "approved") {
          return json({ error: "Ce livreur n’a pas encore une pièce d’identité validée. Vérifie son dossier dans Gestion → Livraisons." }, 409, origin);
        }
        courier = data;
      }
      const oldCourierId = order.assigned_courier_id;
      const { error: updateError } = await admin.from("orders").update({
        assigned_courier_id: courier?.id || null,
        delivery_attempt_status: order.status === "out_for_delivery" ? "failed" : "not_started",
        delivery_failure_reason: order.status === "out_for_delivery" ? (order.delivery_failure_reason || "Livraison à reprogrammer.") : "",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      if (updateError) return json({ error: "Attribution impossible : " + updateError.message }, 500, origin);
      await event({ order_id: orderId, courier_id: courier?.id || oldCourierId, actor_user_id: user.id,
        event_type: courier ? "assigned" : "assignment_removed",
        note: courier ? "Commande attribuée à " + courier.full_name + "." : "Attribution du livreur retirée." });
      if (oldCourierId && oldCourierId !== courier?.id) {
        await notify(oldCourierId, "delivery_assignment_changed", "Attribution modifiée", "La commande " + orderId + " ne t’est plus attribuée.", orderId);
      }
      if (courier) {
        await notify(courier.id, "delivery_assigned", "Nouvelle livraison attribuée",
          "La commande " + orderId + " t’a été attribuée. Consulte ton espace livreur.", orderId);
        const { data: orderCustomer } = await admin.from("orders").select("user_id").eq("id", orderId).maybeSingle();
        if (orderCustomer?.user_id) {
          await notify(orderCustomer.user_id, "delivery_assigned", "Livreur attribué",
            "Un livreur a été affecté à ta commande " + orderId + ".", orderId);
        }
      }
      return json({ ok: true, message: courier ? "Livreur attribué." : "Attribution retirée." }, 200, origin);
    }

    if (action === "start_delivery") {
      if (!isCourier) return json({ error: "Accès réservé aux livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const order = await getAssignedOrder(orderId);
      const { data: identity, error: identityError } = await admin.from("courier_identity_documents")
        .select("verification_status").eq("courier_id", user.id).maybeSingle();
      if (identityError || identity?.verification_status !== "approved") {
        return json({ error: "Ton identité doit être validée par l’administrateur avant de démarrer une livraison." }, 403, origin);
      }
      if (!(order.status === "prepared" || (order.status === "out_for_delivery" && order.delivery_attempt_status === "failed"))) {
        return json({ error: "La commande doit être prête ou avoir un échec de livraison enregistré." }, 409, origin);
      }
      if (!order.user_id) return json({ error: "Cette commande ne dispose pas d’un compte client pour recevoir le code sécurisé. Demande à l’administrateur de gérer cette livraison." }, 409, origin);
      const paid = num(order.amount_paid), total = num(order.total), deliveryFee = num(order.delivery);
      if (order.payment_choice === "pay_now" && (order.payment_status !== "paid" || paid < total)) {
        return json({ error: "Le paiement intégral doit être confirmé avant le départ." }, 409, origin);
      }
      if (order.payment_choice !== "pay_now" && deliveryFee > 0 && paid < deliveryFee) {
        return json({ error: "Les frais de livraison doivent être encaissés avant le départ du livreur." }, 409, origin);
      }
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const salt = randomHex(16);
      const codeHash = await digest(salt + ":" + orderId + ":" + code);
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { error: codeError } = await admin.from("delivery_confirmation_codes").upsert({
        order_id: orderId, code_hash: codeHash, salt, expires_at: expiresAt, attempts: 0, created_at: new Date().toISOString(), verified_at: null,
      }, { onConflict: "order_id" });
      if (codeError) throw new Error("Impossible de préparer le code de remise : " + codeError.message);
      await notify(order.user_id, "delivery_confirmation_code", "Code de confirmation de livraison",
        "Ton code de remise pour la commande " + orderId + " est : " + code + ". Ne le communique au livreur qu’au moment où le colis est physiquement remis. Ce code expire dans 12 heures.",
        orderId);
      const { error: updateError } = await admin.from("orders").update({
        status: "out_for_delivery", delivery_attempt_status: "in_progress", delivery_failure_reason: "", updated_at: new Date().toISOString(),
      }).eq("id", orderId).eq("assigned_courier_id", user.id);
      if (updateError) throw new Error("Départ enregistré, mais le statut de commande n’a pas pu être mis à jour : " + updateError.message);
      await event({ order_id: orderId, courier_id: user.id, actor_user_id: user.id, event_type: "out_for_delivery", note: "Le livreur a démarré la livraison. Code transmis dans les notifications privées du client." });
      return json({ ok: true, message: "Départ enregistré. Le client a reçu son code de remise dans ses notifications." }, 200, origin);
    }

    if (action === "confirm_delivery") {
      if (!isCourier) return json({ error: "Accès réservé aux livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const code = text(payload.code);
      if (!/^\d{6}$/.test(code)) return json({ error: "Saisis le code à six chiffres communiqué par le client." }, 400, origin);
      const order = await getAssignedOrder(orderId);
      if (order.status !== "out_for_delivery" || order.delivery_attempt_status !== "in_progress") {
        return json({ error: "Cette commande n’est pas en cours de livraison." }, 409, origin);
      }
      const { data: storedCode, error: readCodeError } = await admin.from("delivery_confirmation_codes").select("*").eq("order_id", orderId).maybeSingle();
      if (readCodeError || !storedCode) return json({ error: "Code de remise introuvable. Relance la livraison ou contacte l’administrateur." }, 404, origin);
      if (storedCode.verified_at) return json({ error: "Ce code a déjà été utilisé." }, 409, origin);
      if (new Date(storedCode.expires_at).getTime() < Date.now()) return json({ error: "Le code a expiré. Demande à l’administrateur de relancer la livraison." }, 410, origin);
      if (Number(storedCode.attempts || 0) >= 5) return json({ error: "Trop de tentatives. Contacte l’administrateur pour réinitialiser le code." }, 429, origin);
      const suppliedHash = await digest(String(storedCode.salt) + ":" + orderId + ":" + code);
      if (!safeEqual(suppliedHash, String(storedCode.code_hash))) {
        await admin.from("delivery_confirmation_codes").update({ attempts: Number(storedCode.attempts || 0) + 1, last_attempt_at: new Date().toISOString() }).eq("order_id", orderId);
        return json({ error: "Code incorrect. Vérifie le code communiqué par le client." }, 400, origin);
      }
      const { data: collections, error: collectionError } = await admin.from("order_delivery_events")
        .select("amount").eq("order_id", orderId).eq("event_type", "collection_recorded").eq("review_status", "pending");
      if (collectionError) throw new Error("Vérification des encaissements impossible.");
      const pendingAmount = (collections || []).reduce((sum, row) => sum + num(row.amount), 0);
      // Seuls les encaissements déjà validés par l'administrateur sont comptés dans amount_paid.
      // Les déclarations encore en attente ne peuvent jamais solder une commande.
      if (num(order.amount_paid) + 0.01 < num(order.total)) {
        if (pendingAmount > 0.01) {
          return json({
            error: "Le livreur a déclaré " + Math.round(pendingAmount).toLocaleString("fr-FR") +
              " FCFA, mais cet encaissement attend encore la validation de l’administrateur général. La remise ne peut être clôturée qu’après validation."
          }, 409, origin);
        }
        return json({
          error: "Le solde restant doit être encaissé, puis validé par l’administrateur général avant de confirmer la remise."
        }, 409, origin);
      }
      const now = new Date().toISOString();
      const { error: updateError } = await admin.from("orders").update({
        status: "delivered", delivery_attempt_status: "delivered", delivery_failure_reason: "", updated_at: now,
      }).eq("id", orderId).eq("assigned_courier_id", user.id);
      if (updateError) throw new Error("La confirmation de livraison a échoué : " + updateError.message);
      await admin.from("delivery_confirmation_codes").update({ verified_at: now }).eq("order_id", orderId);
      await event({ order_id: orderId, courier_id: user.id, actor_user_id: user.id, event_type: "delivery_confirmed", note: "Remise confirmée par code client." });
      return json({ ok: true, message: "Livraison confirmée. Merci !" }, 200, origin);
    }

    if (action === "fail_delivery") {
      if (!isCourier) return json({ error: "Accès réservé aux livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const reason = text(payload.reason).slice(0, 1000);
      if (reason.length < 3) return json({ error: "Précise la raison de l’échec de livraison." }, 400, origin);
      const order = await getAssignedOrder(orderId);
      if (order.status !== "out_for_delivery" || order.delivery_attempt_status !== "in_progress") return json({ error: "Cette commande n’est pas en cours de livraison." }, 409, origin);

      // Charger le ou les administrateurs généraux avant le changement d'état.
      // Chaque destinataire reçoit une notification personnelle dans l'interface.
      const { data: owners, error: ownersError } = await admin.from("profiles")
        .select("id").eq("role", "admin").eq("is_super_admin", true);
      if (ownersError) throw new Error("Impossible de préparer la notification de l’administrateur général : " + ownersError.message);
      if (!owners?.length) throw new Error("Aucun administrateur général n’est configuré pour recevoir ce signalement.");

      const now = new Date().toISOString();
      const { error } = await admin.from("orders").update({
        delivery_attempt_status: "failed", delivery_failure_reason: reason, updated_at: now,
      }).eq("id", orderId).eq("assigned_courier_id", user.id);
      if (error) throw new Error("Impossible d’enregistrer l’échec : " + error.message);

      await admin.from("delivery_confirmation_codes").delete().eq("order_id", orderId);
      await event({ order_id: orderId, courier_id: user.id, actor_user_id: user.id, event_type: "delivery_failed", note: reason });

      const courierLabel = profile.full_name || user.email || "Le livreur";
      const notificationRows = owners.map(owner => ({
        recipient_user_id: owner.id,
        type: "delivery_failed_admin",
        title: "Échec de livraison signalé",
        message: courierLabel + " a signalé un échec pour la commande " + orderId + " (client : " +
          (order.customer_name || "Client") + "). Motif communiqué : " + reason,
        entity_type: "order",
        entity_id: orderId,
      }));
      if (order.user_id && !owners.some(owner => owner.id === order.user_id)) {
        notificationRows.push({
          recipient_user_id: order.user_id,
          type: "delivery_failed",
          title: "Livraison à reprogrammer",
          message: "La livraison de ta commande " + orderId + " n’a pas pu être effectuée. Motif : " + reason + ". SAMA-PACK te contactera pour convenir d’un nouveau passage.",
          entity_type: "order",
          entity_id: orderId,
        });
      }
      const { error: notificationsError } = await admin.from("notifications").insert(notificationRows);
      if (notificationsError) throw new Error("Échec enregistré, mais les notifications n’ont pas pu être créées : " + notificationsError.message);

      return json({ ok: true, message: "Échec de livraison enregistré. L’administrateur général a été notifié et pourra reprogrammer le passage." }, 200, origin);
    }

    if (action === "record_collection") {
      if (!isCourier) return json({ error: "Accès réservé aux livreurs." }, 403, origin);
      const orderId = text(payload.order_id);
      const amount = num(payload.amount);
      const method = text(payload.payment_method);
      const order = await getAssignedOrder(orderId);
      if (order.status !== "out_for_delivery" || order.delivery_attempt_status !== "in_progress") return json({ error: "L’encaissement se fait pendant une livraison en cours." }, 409, origin);
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Montant encaissé invalide." }, 400, origin);
      if (!["cash", "wave", "orange_money", "other"].includes(method)) return json({ error: "Mode d’encaissement invalide." }, 400, origin);
      const { data: collections, error: readError } = await admin.from("order_delivery_events")
        .select("amount").eq("order_id", orderId).eq("event_type", "collection_recorded").eq("review_status", "pending");
      if (readError) throw new Error("Vérification du solde impossible.");
      const alreadyRecorded = (collections || []).reduce((sum, row) => sum + num(row.amount), 0);
      const remaining = Math.max(0, num(order.total) - num(order.amount_paid) - alreadyRecorded);
      if (amount > remaining + 0.01) return json({ error: "Le montant dépasse le solde restant (" + Math.round(remaining).toLocaleString("fr-FR") + " FCFA)." }, 400, origin);
      await event({ order_id: orderId, courier_id: user.id, actor_user_id: user.id, event_type: "collection_recorded",
        note: "Encaissement déclaré par le livreur, en attente de validation administrative.",
        amount, payment_method: method, review_status: "pending" });
      const { data: owners } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_super_admin", true);
      for (const owner of owners || []) {
        await notify(owner.id, "delivery_collection_pending", "Encaissement à vérifier",
          "Le livreur a déclaré " + Math.round(amount).toLocaleString("fr-FR") + " FCFA pour la commande " + orderId + ". Validation requise.", orderId);
      }
      return json({ ok: true, message: "Encaissement enregistré, en attente de validation par l’administrateur." }, 200, origin);
    }

    if (action === "review_collection") {
      if (!isOwner) return json({ error: "Seul l’administrateur général peut valider un encaissement." }, 403, origin);
      const eventId = text(payload.event_id);
      const decision = text(payload.decision);
      const note = text(payload.note).slice(0, 1000);
      if (!eventId || !["validated", "rejected"].includes(decision)) return json({ error: "Décision ou référence invalide." }, 400, origin);
      const { data: record, error: recordError } = await admin.from("order_delivery_events")
        .select("id,order_id,courier_id,amount,payment_method,review_status,note")
        .eq("id", eventId).eq("event_type", "collection_recorded").maybeSingle();
      if (recordError || !record) return json({ error: "Encaissement introuvable." }, 404, origin);
      if (record.review_status !== "pending") return json({ error: "Cet encaissement a déjà été traité." }, 409, origin);
      if (decision === "validated") {
        const { data: order, error: orderError } = await admin.from("orders").select("id,total,amount_paid").eq("id", record.order_id).maybeSingle();
        if (orderError || !order) return json({ error: "Commande associée introuvable." }, 404, origin);
        const newAmountPaid = num(order.amount_paid) + num(record.amount);
        if (newAmountPaid > num(order.total) + 0.01) return json({ error: "Le montant dépasse le total de la commande. Vérifie le montant avant validation." }, 409, origin);
        const paymentStatus = newAmountPaid + 0.01 >= num(order.total) ? "paid" : "partially_paid";
        const { error: payError } = await admin.from("orders").update({
          amount_paid: newAmountPaid, payment_status: paymentStatus, updated_at: new Date().toISOString(),
        }).eq("id", order.id);
        if (payError) throw new Error("Encaissement reçu, mais rapprochement de la commande impossible : " + payError.message);
      }
      const now = new Date().toISOString();
      const { error: updateError } = await admin.from("order_delivery_events").update({
        review_status: decision, reviewed_by: user.id, reviewed_at: now, note: [text(record.note), note].filter(Boolean).join(" · ").slice(0,1000),
      }).eq("id", eventId);
      if (updateError) throw new Error("Décision d’encaissement impossible : " + updateError.message);
      await event({ order_id: record.order_id, courier_id: record.courier_id, actor_user_id: user.id,
        event_type: decision === "validated" ? "collection_validated" : "collection_rejected",
        note: note || (decision === "validated" ? "Encaissement validé par l’administrateur." : "Encaissement rejeté par l’administrateur."),
        amount: num(record.amount), payment_method: text(record.payment_method), review_status: decision });
      if (record.courier_id) await notify(record.courier_id, "delivery_collection_reviewed",
        decision === "validated" ? "Encaissement validé" : "Encaissement rejeté",
        Math.round(num(record.amount)).toLocaleString("fr-FR") + " FCFA pour la commande " + record.order_id + " : " + (decision === "validated" ? "validation confirmée." : "validation refusée."), record.order_id);
      return json({ ok: true, message: decision === "validated" ? "Encaissement validé et ajouté au montant payé de la commande." : "Encaissement rejeté." }, 200, origin);
    }

    return json({ error: "Action non reconnue." }, 400, origin);
  } catch (error) {
    console.error("sama-delivery-ops error", error instanceof Error ? error.message : String(error));
    return json({ error: error instanceof Error ? error.message : "Erreur serveur inattendue." }, 500, origin);
  }
});