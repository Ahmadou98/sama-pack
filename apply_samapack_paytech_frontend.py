#!/usr/bin/env python3
"""Switch SAMA-PACK's browser checkout flow from PayDunya to PayTech.

Run from the root of the sama-pack repository. This script only edits app.js;
no credentials or payment data are read or written.
"""
from pathlib import Path
import shutil
import sys

path = Path("app.js")
if not path.is_file():
    print("ERREUR : app.js introuvable. Lance ce script depuis la racine du dépôt sama-pack.")
    sys.exit(1)

content = path.read_text(encoding="utf-8")
if '"sama-paytech-checkout"' in content and '"sama-payment-checkout"' not in content and 'params.get("paytech_order_id")' in content:
    print("app.js semble déjà relié à PayTech. Aucun changement effectué.")
    sys.exit(0)

start_marker = '  async function handlePaymentReturn() {'
end_marker = '  function openQuoteModal() {'
start = content.find(start_marker)
end = content.find(end_marker, start if start >= 0 else 0)
if start < 0 or end < 0:
    print("ERREUR : le bloc handlePaymentReturn attendu n’a pas été trouvé. Aucun fichier modifié.")
    sys.exit(1)

new_handler = r'''  async function handlePaymentReturn() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const paytechOrderId = params.get("paytech_order_id");
    const canceledOrderId = params.get("paytech_cancelled_order_id");
    const legacyToken = params.get("token");
    if (!paytechOrderId && !canceledOrderId && !legacyToken) return;

    const cleanupPaymentQuery = () => {
      try {
        params.delete("token");
        params.delete("paytech_order_id");
        params.delete("paytech_cancelled_order_id");
        const query = params.toString();
        window.history.replaceState({}, document.title, window.location.pathname + (query ? "?" + query : "") + window.location.hash);
      } catch { /* l'URL de retour reste utilisable même si l'historique est indisponible */ }
    };

    if (canceledOrderId) {
      cleanupPaymentQuery();
      try { localStorage.setItem("sama_pack_pending_payment_v1", canceledOrderId); } catch { /* stockage facultatif */ }
      toast("Paiement annulé. Aucun règlement n'est confirmé ; tu peux réessayer depuis Mes commandes.");
      if (currentUser) await showAccountHome();
      return;
    }

    if (!currentUser) {
      toast("Connecte-toi avec le compte utilisé pour cette commande afin de vérifier le paiement.", true);
      return;
    }

    let storedOrderId = "";
    try { storedOrderId = localStorage.getItem("sama_pack_pending_payment_v1") || ""; } catch { storedOrderId = ""; }
    const orderIdForCheck = paytechOrderId || storedOrderId;
    if (!orderIdForCheck && !legacyToken) {
      cleanupPaymentQuery();
      toast("Référence de commande absente. Ouvre Mes commandes pour vérifier le paiement.", true);
      return;
    }

    const { data, error } = await client.functions.invoke("sama-paytech-checkout", {
      body: { action: "verify_return", order_id: orderIdForCheck || undefined, invoice_token: legacyToken || undefined },
    });
    cleanupPaymentQuery();
    const orderId = data?.order_id || data?.order?.id || orderIdForCheck || storedOrderId;
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
        <p>PayTech a confirmé le paiement. La commande ${esc(order.id)} est maintenant enregistrée pour traitement.</p>
        <div class="summary">
          <div class="summary-row"><span>Montant de la commande</span><strong>${money(order.total)}</strong></div>
          <div class="summary-row"><span>Montant encaissé</span><strong>${money(order.amount_paid)}</strong></div>
          <div class="summary-row total"><span>Reste à payer</span><strong>${money(Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0)))}</strong></div>
        </div>
        <button class="btn primary full" onclick="showAccountHome()">Suivre ma commande</button>`);
      return;
    }
    showModal(`<div class="modal-head"><div><div class="eyebrow">PAIEMENT NON CONFIRMÉ</div><h2>La commande attend encore le paiement</h2></div><button class="close" onclick="closeModal()">✕</button></div>
      <p>PayTech n’a pas encore confirmé le paiement. Aucun livreur ne sera envoyé à ce stade.</p>
      <div class="inline-message">Statut du paiement : ${esc(data?.gateway_status || "en attente")}</div>
      ${orderId ? `<button class="btn primary full" onclick="retryOrderPayment('${esc(orderId)}')">Réessayer le paiement</button>` : ""}
      <button class="btn ghost full" onclick="showAccountHome()">Voir mes commandes</button>`);
    await loadNotifications();
  }

'''

updated = content[:start] + new_handler + content[end:]
old_count = updated.count('"sama-payment-checkout"')
updated = updated.replace('"sama-payment-checkout"', '"sama-paytech-checkout"')
updated = updated.replace(
    "Vérifie que les clés PayDunya sont configurées dans les secrets Supabase.",
    "Vérifie que les clés PayTech sont configurées dans les secrets Supabase."
)
if '"sama-paytech-checkout"' not in updated:
    print("ERREUR : le nom de la fonction PayTech n’a pas été injecté. Aucun fichier modifié.")
    sys.exit(1)

backup = path.with_suffix(".js.before_paytech.bak")
if not backup.exists():
    shutil.copy2(path, backup)
path.write_text(updated, encoding="utf-8", newline="")
print("Modification terminée.")
print(f"Appels de l’ancienne fonction remplacés : {old_count}")
print(f"Appels restants à sama-payment-checkout : {updated.count('sama-payment-checkout')}")
print(f"Appels à sama-paytech-checkout : {updated.count('sama-paytech-checkout')}")
print(f"Sauvegarde créée : {backup}")
