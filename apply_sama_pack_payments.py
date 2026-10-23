#!/usr/bin/env python3
"""Patch SAMA-PACK frontend for PayDunya checkout and paid-delivery gating.

Run from the repository root. Default mode is dry-run; use --apply to write files.
"""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
APP = ROOT / "app.js"
CSS = ROOT / "styles.css"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: attendu exactement 1 occurrence, trouvé {count}. Aucun fichier n'a été modifié.")
    return source.replace(old, new, 1)


def patch_app(app: str) -> str:
    # Replace the checkout modal and add secure retry/return handling.
    start = app.find("  function checkoutModal() {")
    end = app.find("  function openQuoteModal() {", start)
    if start < 0 or end <= start:
        raise RuntimeError("Impossible de repérer les marqueurs du formulaire de commande. Aucun fichier n'a été modifié.")
    checkout = r'''  function checkoutModal() {
    if (!cart.length) return toast("Ton panier est vide.", true);
    const unavailableLines = cart.filter(line => { const p = getP(line.id); return !canSellProduct(p); });
    if (unavailableLines.length) return toast("Retire les articles en rupture ou sans prix confirmé du panier avant de commander.", true);
    if (!currentUser) { closeModal(); renderAuthForm("login", "Connecte-toi ou crée un compte pour confirmer ta commande en ligne."); return; }
    const totals = cartTotals(); const profile = currentProfile || {};
    const deliveryAllowed = Number(totals.delivery) > 0;
    showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE EN LIGNE</div><h2>Finaliser la commande</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <form id="checkoutForm" class="checkout-grid">
        <input class="input full" name="name" required minlength="2" maxlength="120" placeholder="Nom complet" value="${esc(profile.full_name || currentUser.user_metadata?.full_name || "")}">
        <input class="input" name="phone" required minlength="8" maxlength="25" placeholder="Téléphone" value="${esc(profile.phone || currentUser.user_metadata?.phone || "")}">
        <input class="input" name="zone" placeholder="Zone / quartier" maxlength="100">
        <input class="input full" name="address" required minlength="4" maxlength="300" placeholder="Adresse de livraison">
        <input class="input full" name="slot" placeholder="Créneau souhaité (facultatif)" maxlength="120">
        <div class="payment-choice-list full">
          <div class="eyebrow">COMMENT SOUHAITES-TU PAYER ?</div>
          <label class="payment-choice-card is-selected">
            <input type="radio" name="payment_choice" value="pay_now" checked>
            <span class="payment-choice-copy"><strong>Payer maintenant</strong><small>Règle la totalité de la commande via Wave, Orange Money ou un autre moyen disponible sur la page sécurisée.</small></span>
            <strong class="payment-choice-amount">${money(totals.total)}</strong>
          </label>
          <label class="payment-choice-card ${deliveryAllowed ? "" : "is-disabled"}">
            <input type="radio" name="payment_choice" value="pay_later" ${deliveryAllowed ? "" : "disabled"}>
            <span class="payment-choice-copy"><strong>Payer plus tard</strong><small>Tu règles les frais de livraison maintenant. Le solde des produits est payé à la livraison. Aucun livreur ne part avant confirmation de ce paiement.</small></span>
            <strong class="payment-choice-amount">${money(totals.delivery)}</strong>
          </label>
          ${deliveryAllowed ? "" : '<p class="small-note">Les frais de livraison sont nuls ou indisponibles : seul le paiement intégral est proposé.</p>'}
        </div>
        <div class="summary full">
          <div class="summary-row"><span>Sous-total des articles</span><strong>${money(totals.subtotal)}</strong></div>
          <div class="summary-row"><span>Frais de livraison</span><strong>${money(totals.delivery)}</strong></div>
          <div class="summary-row"><span>Total de la commande</span><strong>${money(totals.total)}</strong></div>
          <div class="summary-row total"><span>À payer maintenant</span><strong id="checkoutAmountNow">${money(totals.total)}</strong></div>
          <div class="summary-row"><span>Solde prévu à la livraison</span><strong id="checkoutAmountLater">0 FCFA</strong></div>
          <p id="paymentChoiceHint" class="small-note">Le paiement est confirmé par le prestataire avant que la commande passe en préparation.</p>
        </div>
        <button class="btn primary full" type="submit">Continuer vers le paiement sécurisé</button>
      </form>`);
    const form = $("checkoutForm");
    const syncPaymentChoice = () => {
      const selected = form.querySelector('input[name="payment_choice"]:checked')?.value || "pay_now";
      form.querySelectorAll(".payment-choice-card").forEach(card => card.classList.toggle("is-selected", card.querySelector('input[name="payment_choice"]')?.value === selected));
      const amountNow = selected === "pay_now" ? totals.total : totals.delivery;
      const amountLater = selected === "pay_now" ? 0 : totals.subtotal;
      if ($("checkoutAmountNow")) $("checkoutAmountNow").textContent = money(amountNow);
      if ($("checkoutAmountLater")) $("checkoutAmountLater").textContent = money(amountLater);
      if ($("paymentChoiceHint")) $("paymentChoiceHint").textContent = selected === "pay_now"
        ? "La commande ne sera confirmée qu’après vérification du paiement intégral par le prestataire."
        : "Seuls les frais de livraison sont payés maintenant. Le solde reste dû à la livraison. Pas de départ du livreur avant confirmation du paiement de la livraison.";
    };
    form.querySelectorAll('input[name="payment_choice"]').forEach(input => input.addEventListener("change", syncPaymentChoice));
    syncPaymentChoice();
    form.onsubmit = async e => {
      e.preventDefault();
      if (!currentUser) return toast("Reconnecte-toi avant de confirmer la commande.", true);
      const f = new FormData(form);
      const paymentChoice = String(f.get("payment_choice") || "pay_now");
      if (paymentChoice === "pay_later" && !deliveryAllowed) return toast("Le paiement plus tard exige des frais de livraison à régler maintenant.", true);
      setBusy(form, true, "Création de la commande…");
      const payload = {
        customer: { name: String(f.get("name") || "").trim(), phone: String(f.get("phone") || "").trim(), address: String(f.get("address") || "").trim(), zone: String(f.get("zone") || "").trim() },
        slot: String(f.get("slot") || "").trim(),
        payment_choice: paymentChoice,
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty }))
      };
      const { data, error } = await client.rpc("sama_place_order", { p_payload: payload });
      setBusy(form, false);
      if (error) return toast(errorMessage(error), true);
      const order = data?.order;
      if (!data?.ok || !order?.id) return toast("La commande n’a pas pu être préparée. Réessaie.", true);
      const profileUpdate = await client.from("profiles").update({full_name:payload.customer.name,phone:payload.customer.phone}).eq("id",currentUser.id);
      if (!profileUpdate.error) currentProfile = {...(currentProfile||{}),full_name:payload.customer.name,phone:payload.customer.phone};
      cart = []; saveCart(); updateCartCount();
      try { localStorage.setItem("sama_pack_pending_payment_v1", order.id); } catch { /* stockage facultatif */ }
      closeModal();
      await retryOrderPayment(order.id);
    };
  }

  async function paymentFunctionError(error, fallback) {
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json();
        if (body?.error) return String(body.error);
      }
    } catch { /* fallback below */ }
    return fallback || errorMessage(error);
  }

  async function retryOrderPayment(orderId) {
    if (!currentUser) { openAccountModal(); return toast("Connecte-toi pour reprendre le paiement.", true); }
    if (!orderId) {
      try { orderId = localStorage.getItem("sama_pack_pending_payment_v1") || ""; } catch { orderId = ""; }
    }
    if (!orderId) return toast("Aucune commande en attente de paiement n’a été trouvée.", true);
    toast("Préparation du paiement sécurisé…");
    const { data, error } = await client.functions.invoke("sama-payment-checkout", { body: { action: "create_checkout", order_id: orderId } });
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le paiement n’a pas pu être lancé. Vérifie que les clés PayDunya sont configurées dans les secrets Supabase.");
      showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT EN ATTENTE</div><h2>Commande ${esc(orderId)}</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <p>La commande n’est pas encore confirmée et ne sera pas préparée tant que le paiement requis n’est pas vérifié.</p>
        <div class="inline-message">${esc(message)}</div>
        <button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Réessayer le paiement</button>
        <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
      return;
    }
    if (data?.already_confirmed) {
      try { localStorage.removeItem("sama_pack_pending_payment_v1"); } catch { /* stockage facultatif */ }
      await showAccountHome();
      toast("Cette commande est déjà confirmée.");
      return;
    }
    if (!data?.payment_url) return toast("Le prestataire n’a pas renvoyé de lien de paiement. Réessaie.", true);
    window.location.assign(data.payment_url);
  }

  async function handlePaymentReturn() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const invoiceToken = params.get("token");
    if (!invoiceToken) return;
    if (!currentUser) {
      toast("Connecte-toi avec le compte utilisé pour cette commande afin de vérifier le paiement.", true);
      return;
    }
    let storedOrderId = "";
    try { storedOrderId = localStorage.getItem("sama_pack_pending_payment_v1") || ""; } catch { storedOrderId = ""; }
    const { data, error } = await client.functions.invoke("sama-payment-checkout", { body: { action: "verify_return", invoice_token: invoiceToken } });
    try {
      params.delete("token");
      const query = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? "?" + query : "") + window.location.hash);
    } catch { /* l'URL de retour reste utilisable même si l'historique est indisponible */ }
    const orderId = data?.order_id || data?.order?.id || storedOrderId;
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le statut du paiement n’a pas encore pu être vérifié.");
      showModal(`<div class="modal-head"><div><div class="eyebrow">VÉRIFICATION DU PAIEMENT</div><h2>Statut en cours de vérification</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <p>Ne relance pas un nouveau paiement si ton portefeuille a déjà été débité. Vérifie ton historique de transaction puis réessaie de vérifier ici.</p>
        <div class="inline-message">${esc(message)}</div>
        ${orderId ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Reprendre le paiement</button>` : ""}
        <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
      return;
    }
    if (data?.order_status === "new" && data?.order) {
      try { localStorage.removeItem("sama_pack_pending_payment_v1"); } catch { /* stockage facultatif */ }
      cart = []; saveCart(); updateCartCount();
      await loadNotifications();
      const order = data.order;
      showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT CONFIRMÉ</div><h2>Merci pour ta commande !</h2></div><button class="close" onclick="closeModal()">✕</button></div>
        <div class="confirmation-mark">✓</div>
        <p>Le prestataire a confirmé le paiement. La commande ${esc(order.id)} est maintenant enregistrée pour traitement.</p>
        <div class="summary">
          <div class="summary-row"><span>Montant de la commande</span><strong>${money(order.total)}</strong></div>
          <div class="summary-row"><span>Montant encaissé</span><strong>${money(order.amount_paid)}</strong></div>
          <div class="summary-row total"><span>Reste à payer</span><strong>${money(Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0)))}</strong></div>
        </div>
        <button class="btn primary full" onclick="showAccountHome()">Suivre ma commande</button>`);
      return;
    }
    showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT NON CONFIRMÉ</div><h2>La commande attend encore le paiement</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <p>Le prestataire n’a pas confirmé le paiement. Aucun livreur ne sera envoyé à ce stade.</p>
      <div class="inline-message">Statut du paiement : ${esc(data?.gateway_status || "en attente")}</div>
      ${orderId ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Réessayer le paiement</button>` : ""}
      <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
    await loadNotifications();
  }

'''
    app = app[:start] + checkout + app[end:]

    app = replace_once(
        app,
        'const { data: rows, error } = await client.from("orders").select("id,created_at,status,total,subtotal,delivery,customer_name,customer_phone,delivery_address,delivery_zone").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(15);',
        'const { data: rows, error } = await client.from("orders").select("id,created_at,status,total,subtotal,delivery,customer_name,customer_phone,delivery_address,delivery_zone,payment_choice,payment_status,amount_paid").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(15);',
        "Chargement compte client paiement",
    )
    old_order_html = r'''    const orderHtml = orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Date</th><th>Total</th><th>Statut</th></tr></thead><tbody>${orders.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${money(o.total)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty compact-empty">Tu n’as pas encore passé de commande en ligne.</div>';'''
    new_order_html = r'''    const orderHtml = orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Commande</th><th>Date</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Action</th></tr></thead><tbody>${orders.map(o => {
      const paymentPending = ["awaiting_payment","awaiting_delivery_payment"].includes(o.status);
      return `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${money(o.total)}</td><td><span class="small-note">${esc(paymentStatusLabel(o.payment_status))}</span><br><span class="small-note">Payé : ${money(o.amount_paid || 0)}</span></td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td><td>${paymentPending ? `<button class="btn small primary" onclick="retryOrderPayment('${esc(o.id)}')">Payer</button>` : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty compact-empty">Tu n’as pas encore passé de commande en ligne.</div>';'''
    app = replace_once(app, old_order_html, new_order_html, "Table historique commandes")

    app = replace_once(
        app,
        'function statusLabel(status) { return ({new:"Nouvelle",processing:"En préparation",delivered:"Livrée",cancelled:"Annulée",won:"Gagné",lost:"Perdu"})[status] || status || "—"; }',
        'function statusLabel(status) { return ({new:"Nouvelle",processing:"En préparation",delivered:"Livrée",cancelled:"Annulée",awaiting_payment:"Paiement intégral en attente",awaiting_delivery_payment:"Frais de livraison à payer",won:"Gagné",lost:"Perdu"})[status] || status || "—"; }\n  function paymentStatusLabel(status) { return ({unpaid:"Non payé",pending:"Paiement en attente",partially_paid:"Partiellement payé",paid:"Payé",failed:"Échec du paiement",refund_review:"Paiement à vérifier / rembourser"})[status] || status || "Non renseigné"; }',
        "Libellés de statut",
    )

    admin_start = app.find("  async function adminOrders() {")
    admin_end = app.find("  function showOrder(id) {", admin_start)
    if admin_start < 0 or admin_end <= admin_start:
        raise RuntimeError("Impossible de repérer adminOrders. Aucun fichier n'a été modifié.")
    new_admin_orders = r'''  async function adminOrders() {
    const orders = await loadOrdersWithItems();
    return `<div class="panel"><div class="admin-panel-head"><h3>Commandes (${orders.length})</h3><button class="btn ghost small" onclick="showAdminView('orders')">Actualiser</button></div><p class="small-note">Les commandes en attente de paiement ne doivent pas être préparées. Les frais de livraison doivent être encaissés et confirmés avant le départ du livreur.</p>${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Paiement reçu</th><th>Statut</th><th>Détails</th></tr></thead><tbody>${orders.map(o=>{
      const pendingPayment = ["awaiting_payment","awaiting_delivery_payment"].includes(o.status);
      const options = pendingPayment ? [o.status,"cancelled"] : ["new","processing","delivered","cancelled"];
      return `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name)}<br><span class="small-note">${esc(o.customer_phone)}</span></td><td>${money(o.total)}</td><td>${money(o.amount_paid || 0)}<br><span class="small-note">${esc(paymentStatusLabel(o.payment_status))}</span></td><td><select class="input" onchange="setOrderStatus('${esc(o.id)}',this.value)">${options.map(s=>`<option ${o.status===s?"selected":""} value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></td><td><button class="btn small ghost" onclick="showOrder('${esc(o.id)}')">Voir</button></td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment.</div>'}</div>`;
  }
'''
    app = app[:admin_start] + new_admin_orders + app[admin_end:]

    app = replace_once(
        app,
        r'''<div class="summary-row"><span>Paiement</span><strong>${esc(o.payment || "Paiement à la livraison")}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>''',
        r'''<div class="summary-row"><span>Mode choisi</span><strong>${esc(o.payment || "Non renseigné")}</strong></div><div class="summary-row"><span>Statut du paiement</span><strong>${esc(paymentStatusLabel(o.payment_status))}</strong></div><div class="summary-row"><span>Déjà encaissé</span><strong>${money(o.amount_paid || 0)}</strong></div><div class="summary-row"><span>Solde restant</span><strong>${money(Math.max(0, Number(o.total || 0)-Number(o.amount_paid || 0)))}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>${["awaiting_payment","awaiting_delivery_payment"].includes(o.status) ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(o.id)}')">Reprendre le paiement</button>` : ""}''',
        "Détails commande montant payé",
    )

    set_start = app.find("  async function setOrderStatus(id, status) {")
    set_end = app.find("  async function adminCustomers()", set_start)
    if set_start < 0 or set_end <= set_start:
        raise RuntimeError("Impossible de repérer setOrderStatus. Aucun fichier n'a été modifié.")
    new_set_status = r'''  async function setOrderStatus(id, status) {
    if (!isAdmin()) return toast("Accès refusé.", true);
    const allowed = ["new","processing","delivered","cancelled","awaiting_payment","awaiting_delivery_payment"];
    if (!allowed.includes(status)) return toast("Statut invalide.", true);
    const order = cachedOrders.find(row => row.id === id);
    if (order && ["awaiting_payment","awaiting_delivery_payment"].includes(order.status) && status !== "cancelled" && status !== order.status) {
      toast("Préparation bloquée : attends la confirmation du paiement requis.", true);
      return showAdminView("orders");
    }
    const { error } = await client.from("orders").update({ status }).eq("id", id);
    if (error) { toast(errorMessage(error), true); return showAdminView("orders"); }
    toast(status === "cancelled" ? "Commande annulée." : "Statut modifié. Le client sera notifié.");
    await showAdminView("orders");
  }
'''
    app = app[:set_start] + new_set_status + app[set_end:]

    app = replace_once(app,
        '    const validOrder = o => o.status !== "cancelled";',
        '    const validOrder = o => !["cancelled","awaiting_payment","awaiting_delivery_payment"].includes(o.status);\n    const awaitingPaymentOrders = orders.filter(o => ["awaiting_payment","awaiting_delivery_payment"].includes(o.status)).length;',
        "Filtre ventes dashboard")
    app = replace_once(app,
        '      { label: "Commandes à traiter", value: String(pendingOrders), note: "Nouvelles + en préparation", css: "pending" },',
        '      { label: "Commandes à traiter", value: String(pendingOrders), note: "Nouvelles + en préparation", css: "pending" },\n      { label: "Paiements en attente", value: String(awaitingPaymentOrders), note: "Aucune préparation avant confirmation", css: "payment-pending" },',
        "Indicateur paiements attente")

    app = replace_once(app,
        '    await syncAuth(data?.session?.user || null);\n    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => { void syncAuth(session?.user || null); }, 0); });',
        '    await syncAuth(data?.session?.user || null);\n    await handlePaymentReturn();\n    client.auth.onAuthStateChange((_event, session) => { setTimeout(async () => { await syncAuth(session?.user || null); await handlePaymentReturn(); }, 0); });',
        "Gestion retour paiement et authentification")
    app = replace_once(app,
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut',
        'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,retryOrderPayment,showAccountHome,signOut',
        "Exposition retry payment")
    return app


def patch_css(css: str) -> str:
    marker = "/* SAMA-PACK payment checkout patch v1 */"
    if marker in css:
        raise RuntimeError("Le patch CSS de paiement semble déjà installé. Vérifie les fichiers avant de recommencer.")
    return css + r'''

/* SAMA-PACK payment checkout patch v1 */
.payment-choice-list { display:grid; gap:10px; padding-top:4px; }
.payment-choice-list > .eyebrow { margin-bottom:2px; }
.payment-choice-card { display:flex; align-items:flex-start; gap:12px; padding:14px; border:1px solid var(--line); border-radius:15px; background:#fff; cursor:pointer; transition:border-color .15s ease,background .15s ease,box-shadow .15s ease; }
.payment-choice-card.is-selected { border-color:#2a8a58; background:#f1faf3; box-shadow:0 0 0 2px rgba(34,197,94,.08); }
.payment-choice-card.is-disabled { opacity:.55; cursor:not-allowed; }
.payment-choice-card input { margin:4px 0 0; accent-color:#176b43; flex:0 0 auto; }
.payment-choice-copy { display:grid; gap:5px; flex:1; min-width:0; }
.payment-choice-copy strong { color:#143d29; font-size:14px; }
.payment-choice-copy small { color:#62746a; font-size:11px; line-height:1.55; }
.payment-choice-amount { flex:0 0 auto; color:#176b43; font-size:13px; white-space:nowrap; }
#paymentChoiceHint { margin:8px 0 0; line-height:1.5; }
.status.awaiting_payment,.status.awaiting_delivery_payment { color:#87570b; background:#fff4d9; border-color:#f0d69a; }
.dashboard-kpi.payment-pending { --kpi-accent:#c17f29; }
@media (min-width:1300px) { .dashboard-kpis { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media (max-width:600px) {
  .payment-choice-card { gap:8px; padding:12px 10px; }
  .payment-choice-copy strong { font-size:13px; }
  .payment-choice-copy small { font-size:10px; }
  .payment-choice-amount { font-size:11px; white-space:normal; text-align:right; }
}
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Ajoute le paiement PayDunya à SAMA-PACK (simulation par défaut).")
    parser.add_argument("--apply", action="store_true", help="Écrit app.js et styles.css après toutes les validations.")
    args = parser.parse_args()

    if not APP.is_file() or not CSS.is_file():
        print("ERREUR : lance ce script depuis la racine de sama-pack, à côté de app.js et styles.css.", file=sys.stderr)
        return 2

    app_original = APP.read_text(encoding="utf-8")
    css_original = CSS.read_text(encoding="utf-8")
    app_new = patch_app(app_original)
    css_new = patch_css(css_original)

    checks = {
        "formulaire des deux choix": 'name="payment_choice" value="pay_now" checked' in app_new and 'name="payment_choice" value="pay_later"' in app_new,
        "appel du Edge Function de paiement": 'functions.invoke("sama-payment-checkout"' in app_new,
        "vérification du retour fournisseur": 'action: "verify_return", invoice_token: invoiceToken' in app_new,
        "possibilité de reprendre un paiement": "async function retryOrderPayment(orderId)" in app_new,
        "commande d'attente exclue des ventes": '["cancelled","awaiting_payment","awaiting_delivery_payment"]' in app_new,
        "compteur des paiements en attente": 'label: "Paiements en attente"' in app_new,
        "CSS paiement présent": ".payment-choice-card.is-selected" in css_new,
        "une seule fonction checkout": app_new.count("function checkoutModal()") == 1,
        "une seule fonction de retour": app_new.count("async function handlePaymentReturn()") == 1,
    }
    failed = [label for label, passed in checks.items() if not passed]
    print("Vérifications préalables :")
    for label, passed in checks.items():
        print(f"  {'OK' if passed else 'ÉCHEC'} — {label}")
    if failed:
        print("ERREUR : vérification échouée : " + ", ".join(failed), file=sys.stderr)
        return 3

    if not args.apply:
        print("\nSIMULATION UNIQUEMENT : aucun fichier n'a été modifié.")
        print("Si tous les contrôles sont OK, relance avec : python apply_sama_pack_payments.py --apply")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    app_backup = APP.with_name(f"app.js.backup-payments-{stamp}")
    css_backup = CSS.with_name(f"styles.css.backup-payments-{stamp}")
    shutil.copy2(APP, app_backup)
    shutil.copy2(CSS, css_backup)
    APP.write_text(app_new, encoding="utf-8", newline="\n")
    CSS.write_text(css_new, encoding="utf-8", newline="\n")
    print("\nCorrectif appliqué.")
    print(f"Sauvegardes créées : {app_backup.name} et {css_backup.name}")
    print("Exécute maintenant : node --check app.js && git diff --check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
