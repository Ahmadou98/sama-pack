#!/usr/bin/env python3
"""Add a customer 'Renvoyer le reçu' action to SAMA-PACK's account order list.
Run from the repository root in GitHub Codespaces:
    python apply_sama_pack_payment_receipt.py
"""
from pathlib import Path

APP = Path("app.js")
if not APP.is_file():
    raise SystemExit("Erreur : app.js introuvable. Lance ce script depuis la racine du dépôt sama-pack.")

src = APP.read_text(encoding="utf-8")
if "async function resendPaymentConfirmation(orderId)" in src:
    raise SystemExit("Le bouton de renvoi du reçu semble déjà installé. Aucune modification effectuée.")

lines = src.splitlines()
try:
    order_html_index = next(i for i, line in enumerate(lines) if "const orderHtml = orders.length" in line)
except StopIteration:
    raise SystemExit("Erreur : le bloc « Mes commandes » n'a pas été trouvé. Aucune modification effectuée.")

row_index = next((i for i in range(order_html_index, min(order_html_index + 12, len(lines)))
                  if "return `<tr><td>${esc(o.id)}</td>" in lines[i]), None)
if row_index is None:
    raise SystemExit("Erreur : la ligne des actions de commande n'a pas été trouvée. Aucune modification effectuée.")

replacement_rows = [
    '      const actionHtml = paymentPending',
    '        ? \'<button class="btn small primary" onclick="retryOrderPayment(\\\'\' + esc(o.id) + \'\\\')">Payer</button>\'',
    '        : ["paid", "partially_paid"].includes(o.payment_status)',
    '          ? \'<button class="btn small ghost" onclick="resendPaymentConfirmation(\\\'\' + esc(o.id) + \'\\\')">Renvoyer le reçu</button>\'',
    '          : "—";',
    '      return \'<tr><td>\' + esc(o.id) + \'</td><td>\' + esc(fmtDate(o.created_at)) + \'</td><td>\' + money(o.total) + \'</td><td><span class="small-note">\' + esc(paymentStatusLabel(o.payment_status)) + \'</span><br><span class="small-note">Payé : \' + money(o.amount_paid || 0) + \'</span></td><td><span class="status \' + esc(o.status) + \'">\' + esc(statusLabel(o.status)) + \'</span></td><td>\' + actionHtml + \'</td></tr>\';',
]
lines[row_index:row_index + 1] = replacement_rows
src = "\n".join(lines) + ("\n" if src.endswith("\n") else "")

insertion = '''  async function resendPaymentConfirmation(orderId) {
    if (!currentUser) { openAccountModal(); return toast("Connecte-toi pour recevoir ton reçu.", true); }
    if (!orderId) return toast("Référence de commande manquante.", true);
    toast("Vérification du paiement et envoi du reçu…");
    const { data, error } = await client.functions.invoke("sama-payment-checkout", {
      body: { action: "send_payment_confirmation", order_id: String(orderId) },
    });
    if (error || data?.error) {
      const message = data?.error || await paymentFunctionError(error, "Le reçu n’a pas pu être envoyé. Le statut du paiement reste consultable dans Mes commandes.");
      toast(message, true);
      return;
    }
    if (data?.confirmation_email_status === "sent") {
      toast("Confirmation et reçu envoyés à " + String(currentUser.email || "l’adresse e-mail du compte") + ".");
    } else if (data?.confirmation_email_status === "sending") {
      toast("L’envoi du reçu est déjà en cours. Vérifie ta boîte mail dans quelques instants.");
    } else {
      toast("Le paiement reste confirmé, mais l’e-mail n’a pas pu être envoyé. Réessaie ou contacte SAMA-PACK.", true);
    }
    await showAccountHome();
  }

'''
marker = "  async function handlePaymentReturn() {"
if marker not in src:
    raise SystemExit("Erreur : fonction handlePaymentReturn introuvable. Aucune modification effectuée.")
src = src.replace(marker, insertion + marker, 1)
old_export = "Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,retryOrderPayment,showAccountHome"
new_export = "Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,retryOrderPayment,resendPaymentConfirmation,showAccountHome"
if old_export not in src:
    raise SystemExit("Erreur : liste des fonctions exposées à l'interface introuvable. Vérifie la version du dépôt.")
src = src.replace(old_export, new_export, 1)
APP.write_text(src, encoding="utf-8")
print("Correctif appliqué à app.js.")
print("Prochaine étape : node --check app.js && git diff --check")
print('Puis : git add app.js && git commit -m "Add customer payment receipt resend" && git push')
