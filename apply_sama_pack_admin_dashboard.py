#!/usr/bin/env python3
"""Safely upgrades SAMA-PACK's admin dashboard and administrator management UI.

Run from the repository root:
  python apply_sama_pack_admin_dashboard.py          # dry run
  python apply_sama_pack_admin_dashboard.py --apply  # write changes + backups
"""
from __future__ import annotations
import argparse
import datetime as dt
import re
import shutil
from pathlib import Path

ROOT = Path.cwd()
APP = ROOT / "app.js"
CSS = ROOT / "styles.css"
MARKER = "/* ===== SAMA-PACK admin dashboard charts + super admin management ===== */"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: attendu exactement 1 occurrence, trouvé {count}. Aucun fichier n'a été écrit.")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, new: str, label: str) -> str:
    if text.count(start) != 1 or text.count(end) != 1:
        raise RuntimeError(f"{label}: ancres absentes ou ambiguës. Aucun fichier n'a été écrit.")
    a = text.index(start)
    b = text.index(end, a + len(start))
    if b <= a:
        raise RuntimeError(f"{label}: ordre des ancres invalide. Aucun fichier n'a été écrit.")
    return text[:a] + new.rstrip() + "\n" + text[b:]


DASHBOARD_BLOCK = r'''  function dashboardCompactMoney(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  function dashboardLineChart(points) {
    const w = 760, h = 270, left = 58, right = 22, top = 24, bottom = 48;
    const plotW = w - left - right, plotH = h - top - bottom;
    const values = points.map(p => Math.max(0, Number(p.value) || 0));
    const maxValue = Math.max(1, ...values);
    const xAt = i => left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yAt = value => top + plotH - (Math.max(0, value) / maxValue) * plotH;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(Number(p.value) || 0).toFixed(1)}`).join(" ");
    const grid = [0, .25, .5, .75, 1].map(t => {
      const y = top + plotH * (1 - t), value = maxValue * t;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${w-right}" y2="${y.toFixed(1)}" class="dashboard-chart-gridline"/><text x="${left-10}" y="${(y+4).toFixed(1)}" text-anchor="end" class="dashboard-chart-axis">${esc(dashboardCompactMoney(value))}</text>`;
    }).join("");
    const pointsSvg = points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(Number(p.value)||0).toFixed(1)}" r="3.5" class="dashboard-chart-point"><title>${esc(p.label)} : ${money(p.value)}</title></circle>`).join("");
    const labelIdx = [...new Set([0, Math.floor((points.length-1)/3), Math.floor(2*(points.length-1)/3), Math.max(0, points.length-1)])];
    const labels = labelIdx.map(i => `<text x="${xAt(i).toFixed(1)}" y="${h-18}" text-anchor="middle" class="dashboard-chart-axis">${esc(points[i]?.label || "")}</text>`).join("");
    return `<div class="dashboard-line-wrap"><div class="dashboard-chart-summary"><span>Ventes non annulées</span><strong>${money(values.reduce((sum, n) => sum + n, 0))}</strong></div><svg class="dashboard-line-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe des ventes quotidiennes sur les 14 derniers jours"><title>Ventes quotidiennes sur les 14 derniers jours</title>${grid}<path d="${path}" class="dashboard-chart-line"/>${pointsSvg}${labels}</svg><p class="small-note">Montants issus des commandes enregistrées, hors commandes annulées. Ce graphique ne confirme pas les paiements effectivement encaissés.</p></div>`;
  }

  function dashboardDonutChart(statuses) {
    const total = statuses.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const radius = 48, circumference = 2 * Math.PI * radius;
    let offset = 0;
    const ring = total > 0 ? statuses.filter(x => x.value > 0).map(item => {
      const length = circumference * Number(item.value) / total;
      const circle = `<circle cx="80" cy="80" r="${radius}" class="dashboard-donut-segment ${item.css}" stroke-dasharray="${length.toFixed(2)} ${(circumference-length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(item.label)} : ${Number(item.value)}</title></circle>`;
      offset += length;
      return circle;
    }).join("") : `<circle cx="80" cy="80" r="${radius}" class="dashboard-donut-empty"/>`;
    const legend = statuses.map(item => `<div class="dashboard-chart-legend-item"><span class="dashboard-legend-dot ${item.css}"></span><span>${esc(item.label)}</span><strong>${Number(item.value || 0)}</strong></div>`).join("");
    return `<div class="dashboard-donut-layout"><svg class="dashboard-donut-svg" viewBox="0 0 160 160" role="img" aria-label="Répartition des commandes par statut"><title>Répartition des commandes</title><g transform="rotate(-90 80 80)">${ring}</g><text x="80" y="76" class="dashboard-donut-total">${total}</text><text x="80" y="96" class="dashboard-donut-caption">commandes</text></svg><div class="dashboard-chart-legend">${legend}</div></div>`;
  }

  function dashboardAvailabilityChart(available, outOfStock) {
    const total = Math.max(1, Number(available || 0) + Number(outOfStock || 0));
    const rows = [
      { label: "Disponible", value: Number(available || 0), css: "available" },
      { label: "Rupture de stock", value: Number(outOfStock || 0), css: "out" }
    ];
    return `<div class="dashboard-availability-bars">${rows.map(row => `<div class="dashboard-availability-row"><div><span>${esc(row.label)}</span><strong>${row.value}</strong></div><div class="dashboard-bar-track"><span class="dashboard-bar-fill ${row.css}" style="width:${Math.min(100, Math.max(0, row.value / total * 100)).toFixed(1)}%"></span></div></div>`).join("")}<p class="small-note">Disponibilité déclarée dans le catalogue. Les nouveaux articles SNAD restent en rupture jusqu’à validation physique du stock.</p></div>`;
  }

  async function adminDashboard() {
    const [orders, stock, expenses, quotes, productRows] = await Promise.all([
      readRows("orders"), readRows("stock"), readRows("expenses"), readRows("quotes"), readRows("products")
    ]);
    const sortedOrders = [...orders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    cachedOrders = sortedOrders; stockRows = stock; cachedExpenses = expenses; cachedQuotes = quotes;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
    const last30Start = new Date(dayStart); last30Start.setDate(last30Start.getDate() - 29);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const validOrder = o => o.status !== "cancelled";
    const revenue30 = orders.filter(o => validOrder(o) && new Date(o.created_at) >= last30Start).reduce((sum,o) => sum + Number(o.total || 0), 0);
    const revenueMonth = orders.filter(o => validOrder(o) && new Date(o.created_at) >= monthStart).reduce((sum,o) => sum + Number(o.total || 0), 0);
    const pendingOrders = orders.filter(o => ["new","processing"].includes(o.status)).length;
    const deliveredOrders = orders.filter(o => o.status === "delivered");
    const averageDelivered = deliveredOrders.length ? deliveredOrders.reduce((sum,o) => sum + Number(o.total || 0), 0) / deliveredOrders.length : 0;
    const stockValue = stock.reduce((sum,row) => sum + Number(row.quantity || 0) * Number(row.unit_cost || 0), 0);
    const lowStockRows = stock.filter(row => Number(row.min_quantity || 0) > 0 && Number(row.quantity || 0) <= Number(row.min_quantity || 0));
    const newQuotes = quotes.filter(q => q.status === "new").length;
    const expenseTotal = expenses.reduce((sum,row) => sum + Number(row.amount || 0), 0);
    const monthExpenses = expenses.filter(row => {
      const d = new Date(`${row.expense_date || row.created_at || ""}`);
      return Number.isFinite(d.getTime()) && d >= monthStart;
    }).reduce((sum,row) => sum + Number(row.amount || 0), 0);
    const published = productRows.filter(p => p.active && Number(p.price || 0) > 0).length;
    const available = productRows.filter(p => p.availability_status === "available" && Number(p.price || 0) > 0).length;
    const outOfStock = productRows.filter(p => p.availability_status !== "available" || Number(p.price || 0) <= 0).length;
    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const chartDays = Array.from({ length: 14 }, (_, index) => {
      const d = new Date(dayStart); d.setDate(d.getDate() - (13 - index));
      return { key: dayKey(d), label: d.toLocaleDateString("fr-SN", { day: "2-digit", month: "short" }).replace(/\.$/, ""), value: 0 };
    });
    const dayLookup = new Map(chartDays.map(point => [point.key, point]));
    orders.forEach(order => {
      if (!validOrder(order) || !order.created_at) return;
      const created = new Date(order.created_at);
      const target = dayLookup.get(dayKey(created));
      if (target) target.value += Number(order.total || 0);
    });
    const statusCounts = [
      { label: "Nouvelles", value: orders.filter(o=>o.status === "new").length, css: "new" },
      { label: "En préparation", value: orders.filter(o=>o.status === "processing").length, css: "processing" },
      { label: "Livrées", value: orders.filter(o=>o.status === "delivered").length, css: "delivered" },
      { label: "Annulées", value: orders.filter(o=>o.status === "cancelled").length, css: "cancelled" }
    ];
    const recent = sortedOrders.slice(0, 8);
    const cards = [
      { label: "Ventes sur 30 jours", value: money(revenue30), note: "Hors commandes annulées", css: "revenue" },
      { label: "Commandes à traiter", value: String(pendingOrders), note: "Nouvelles + en préparation", css: "pending" },
      { label: "Commandes au total", value: String(orders.length), note: "Historique enregistré", css: "orders" },
      { label: "Panier moyen livré", value: money(averageDelivered), note: `${deliveredOrders.length} commande(s) livrée(s)`, css: "average" },
      { label: "Articles publiés", value: String(published), note: "Prix de vente renseigné", css: "published" },
      { label: "Articles en rupture", value: String(outOfStock), note: "Disponibilité à vérifier", css: "stockout" }
    ];
    return `<div class="dashboard-welcome"><div><div class="eyebrow">PILOTAGE COMMERCIAL</div><h2>Vue d’ensemble de SAMA-PACK</h2><p>Suivi des ventes, des commandes, du catalogue et des réapprovisionnements.</p></div><button class="btn ghost small" onclick="showAdminView('dashboard')">Actualiser les données</button></div>
      <div class="dashboard-kpis">${cards.map(card=>`<article class="dashboard-kpi ${card.css}"><span class="dashboard-kpi-label">${esc(card.label)}</span><strong>${esc(card.value)}</strong><small>${esc(card.note)}</small></article>`).join("")}</div>
      <div class="dashboard-chart-grid dashboard-chart-grid-main">
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">TENDANCE · 14 JOURS</div><h3>Évolution des ventes</h3></div><span class="dashboard-chart-pill">${money(revenue30)} / 30 j</span></div>${dashboardLineChart(chartDays)}</section>
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">SUIVI DES COMMANDES</div><h3>Répartition par statut</h3></div></div>${dashboardDonutChart(statusCounts)}</section>
      </div>
      <div class="dashboard-chart-grid dashboard-chart-grid-secondary">
        <section class="panel dashboard-chart-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">DISPONIBILITÉ</div><h3>État du catalogue</h3></div><button class="btn ghost small" onclick="showAdminView('stock')">Gérer le stock</button></div>${dashboardAvailabilityChart(available, outOfStock)}</section>
        <section class="panel dashboard-alert-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">ACTIONS À SUIVRE</div><h3>Points de vigilance</h3></div></div><div class="dashboard-alert-list"><div class="dashboard-alert-item ${lowStockRows.length ? "is-warning" : ""}"><span class="dashboard-alert-icon">${lowStockRows.length ? "!" : "✓"}</span><div><strong>${lowStockRows.length} référence(s) sous le seuil de stock</strong><small>Vérifie les quantités à réapprovisionner.</small></div><button class="btn ghost small" onclick="showAdminView('stock')">Voir</button></div><div class="dashboard-alert-item ${newQuotes ? "is-warning" : ""}"><span class="dashboard-alert-icon">${newQuotes ? "!" : "✓"}</span><div><strong>${newQuotes} devis en attente</strong><small>Demandes reçues qui nécessitent un suivi.</small></div><button class="btn ghost small" onclick="showAdminView('quotes')">Voir</button></div><div class="dashboard-alert-item"><span class="dashboard-alert-icon">₣</span><div><strong>Dépenses du mois : ${money(monthExpenses)}</strong><small>Dépenses enregistrées au total : ${money(expenseTotal)}.</small></div><button class="btn ghost small" onclick="showAdminView('expenses')">Voir</button></div><div class="dashboard-alert-item"><span class="dashboard-alert-icon">▦</span><div><strong>Valeur du stock enregistré : ${money(stockValue)}</strong><small>Selon les quantités et coûts saisis dans Stock.</small></div><button class="btn ghost small" onclick="showAdminView('stock')">Voir</button></div></div></section>
      </div>
      <section class="panel dashboard-recent-panel"><div class="dashboard-panel-heading"><div><div class="eyebrow">DERNIÈRES ACTIVITÉS</div><h3>Commandes récentes</h3></div><button class="btn ghost small" onclick="showAdminView('orders')">Toutes les commandes</button></div>${recent.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${recent.map(o=>`<tr><td><strong>${esc(o.id)}</strong></td><td>${esc(fmtDate(o.created_at))}</td><td>${esc(o.customer_name || "Client historique")}<br><span class="small-note">${esc(o.customer_phone || "")}</span></td><td>${money(o.total)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td><td><button class="btn ghost small" onclick="showOrder('${esc(o.id)}')">Détails</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune commande pour le moment. Les nouvelles commandes apparaîtront ici.</div>'}</section>
      <p class="small-note dashboard-data-footnote">Dernière actualisation : ${esc(now.toLocaleString("fr-SN", { dateStyle: "medium", timeStyle: "short" }))}. Les indicateurs s’appuient sur les enregistrements actuels de Supabase.</p>`;
  }
'''

ADMIN_ACCOUNTS_BLOCK = r'''  async function adminAccounts() {
    const { data, error } = await client.from("profiles")
      .select("id,full_name,phone,email,role,is_super_admin,invited_by,created_at")
      .eq("role", "admin").order("created_at", { ascending: true });
    if (error) throw error;
    const admins = data || [];
    const isGeneralAdmin = currentProfile?.is_super_admin === true;
    const inviterIds = [...new Set(admins.map(row => row.invited_by).filter(Boolean))];
    const inviterLabels = Object.create(null);
    if (inviterIds.length) {
      const { data: inviters, error: inviterError } = await client.from("profiles")
        .select("id,full_name,email").in("id", inviterIds);
      if (!inviterError) (inviters || []).forEach(row => { inviterLabels[row.id] = row.full_name || row.email || "Administrateur"; });
    }
    const invitePanel = isGeneralAdmin
      ? `<div class="panel admin-invite-panel"><div class="eyebrow">ACCÈS ET SÉCURITÉ</div><h3>Inviter un administrateur</h3><p>Seul l’administrateur général peut ajouter ou retirer des accès administrateur. Chaque compte doit rester nominatif.</p><form id="inviteAdminForm" class="admin-form"><label>Nom complet<input class="input" name="full_name" required minlength="2" maxlength="120" placeholder="Nom complet"></label><label>Adresse e-mail<input class="input" name="email" type="email" required maxlength="254" placeholder="personne@entreprise.sn"></label><button class="btn primary full" type="submit">Envoyer l’invitation</button></form><p class="small-note">L’invité reçoit un lien par e-mail. La journalisation conserve l’auteur de l’invitation.</p></div>`
      : `<div class="panel admin-permission-note"><h3>Gestion des accès</h3><p>Tu peux consulter la liste des administrateurs, mais seul l’administrateur général peut inviter un administrateur ou lui retirer ses droits.</p></div>`;
    const tableHtml = admins.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Administrateur</th><th>Compte</th><th>Niveau d’accès</th><th>Invité par</th><th>Depuis</th>${isGeneralAdmin ? "<th>Actions</th>" : ""}</tr></thead><tbody>${admins.map(a => {
      const general = a.is_super_admin === true;
      const canRemove = isGeneralAdmin && !general && a.id !== currentUser?.id;
      return `<tr><td><strong>${esc(a.full_name || "Sans nom")}</strong><br><span class="small-note">${general ? "Propriétaire de l’espace" : "Compte administrateur"}</span></td><td>${esc(a.email || "—")}<br><span class="small-note">${esc(a.phone || "")}</span></td><td><span class="status ${general ? "delivered" : "processing"}">${general ? "Administrateur général" : "Administrateur"}</span></td><td>${general ? "—" : esc(inviterLabels[a.invited_by] || (a.invited_by ? "Administrateur général" : "Ancien compte"))}</td><td>${esc(fmtDate(a.created_at))}</td>${isGeneralAdmin ? `<td>${canRemove ? `<button class="btn small danger" onclick="removeAdmin('${esc(a.id)}')">Retirer les droits</button>` : `<span class="small-note">${general ? "Compte protégé" : "Ton compte"}</span>`}</td>` : ""}</tr>`;
    }).join("")}</tbody></table></div>` : '<div class="empty">Aucun administrateur n’est enregistré.</div>';
    return `${invitePanel}<div class="panel admin-accounts-list"><div class="dashboard-panel-heading"><div><div class="eyebrow">ACCÈS AU BACK-OFFICE</div><h3>Administrateurs (${admins.length})</h3></div><span class="small-note">${isGeneralAdmin ? "Tu es administrateur général." : "Consultation uniquement."}</span></div>${tableHtml}<p class="small-note">« Retirer les droits » transforme le compte en compte client et le retire de cette liste. L’historique des commandes et des actions est conservé.</p></div>`;
  }

  async function removeAdmin(id) {
    if (currentProfile?.is_super_admin !== true) return toast("Seul l’administrateur général peut retirer les droits d’un administrateur.", true);
    if (!id || id === currentUser?.id) return toast("Tu ne peux pas retirer tes propres droits administrateur général.", true);
    const target = (await client.from("profiles").select("full_name,email,is_super_admin").eq("id", id).maybeSingle()).data;
    if (target?.is_super_admin) return toast("L’administrateur général est protégé.", true);
    const label = target?.full_name || target?.email || "cet administrateur";
    if (!window.confirm(`Retirer les droits administrateur de ${label} ? Le compte restera disponible comme compte client et l’historique sera conservé.`)) return;
    const { data, error } = await client.functions.invoke("sama-remove-admin", { body: { user_id: id } });
    if (error || data?.error) return toast(data?.error || errorMessage(error), true);
    toast(data?.message || "Droits administrateur retirés.");
    await showAdminView("admins");
  }
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Améliore le tableau de bord et sécurise la gestion des administrateurs SAMA-PACK.")
    parser.add_argument("--apply", action="store_true", help="écrit les modifications; sinon, simulation uniquement")
    args = parser.parse_args()
    if not APP.exists() or not CSS.exists():
        print("ERREUR : lance ce script depuis la racine du dépôt contenant app.js et styles.css.")
        return 2

    app = APP.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    if "function dashboardLineChart(points)" in app and "async function removeAdmin(id)" in app and MARKER in css:
        print("Les modifications du tableau de bord et de la gestion des admins semblent déjà présentes. Aucun changement appliqué.")
        return 0

    original_app, original_css = app, css
    app = replace_once(
        app,
        'client.from("profiles").select("id,full_name,phone,email,role,created_at").eq("id", user.id).maybeSingle()',
        'client.from("profiles").select("id,full_name,phone,email,role,is_super_admin,invited_by,created_at").eq("id", user.id).maybeSingle()',
        "chargement du rôle d’administrateur général"
    )
    app = app.replace(
        'admin_invited:"Administrateur invité",settings_updated:"Paramètres modifiés"',
        'admin_invited:"Administrateur invité",admin_removed:"Droits administrateur retirés",settings_updated:"Paramètres modifiés"'
    )
    if app == original_app:
        raise RuntimeError("Aucune modification du rôle n’a été appliquée; code source différent de la version attendue.")

    app = replace_between(app, '  async function adminDashboard() {', '  async function loadOrdersWithItems() {', DASHBOARD_BLOCK, "nouveau tableau de bord avec graphiques")
    # replace_between includes the end marker in replacement; avoid duplicate indentation from the helper.
    app = replace_between(app, '  async function adminAccounts() {', '  async function adminActivity() {', ADMIN_ACCOUNTS_BLOCK, "gestion des admins et suppression des droits")
    window_old = 'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem});'
    window_new = 'Object.assign(window,{openProduct,addToCart,closeModal,changeQty,checkoutModal,showAccountHome,signOut,renderAuthForm,resetPassword,enableBrowserNotifications,loadAndShowNotifications,markNotificationRead,showAdminView,editPack,cancelPackEdit,togglePack,setOrderStatus,showOrder,setQuoteStatus,goToProductPage,movePromo,goToPromo,selectReviewRating,editProspect,deleteProspect,setProspectStatus,editCatalogItem,archiveCatalogItem,removeAdmin});'
    app = replace_once(app, window_old, window_new, "exposition du bouton de retrait d’accès")

    css_addition = r'''/* ===== SAMA-PACK admin dashboard charts + super admin management ===== */
.dashboard-welcome { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin:0 0 18px; }
.dashboard-welcome h2 { margin:4px 0 6px; font-size:clamp(22px,2.3vw,30px); letter-spacing:-.035em; }
.dashboard-welcome p { margin:0; color:var(--muted,#64748b); font-size:13px; line-height:1.55; }
.dashboard-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
.dashboard-kpi { --kpi-accent:#0f766e; position:relative; overflow:hidden; padding:18px 18px 16px; background:#fff; border:1px solid #e6ece8; border-radius:17px; box-shadow:0 5px 18px rgba(17,55,38,.035); min-width:0; }
.dashboard-kpi::before { content:""; position:absolute; top:0; left:0; width:4px; height:100%; background:var(--kpi-accent); }
.dashboard-kpi.revenue { --kpi-accent:#0b8063; }
.dashboard-kpi.pending { --kpi-accent:#bd7c18; }
.dashboard-kpi.orders { --kpi-accent:#4873b8; }
.dashboard-kpi.average { --kpi-accent:#7654ae; }
.dashboard-kpi.published { --kpi-accent:#16816c; }
.dashboard-kpi.stockout { --kpi-accent:#c24b46; }
.dashboard-kpi-label { display:block; color:#65736c; font-size:12px; font-weight:650; line-height:1.35; }
.dashboard-kpi strong { display:block; margin:9px 0 7px; color:#15372b; font-size:clamp(21px,2vw,29px); line-height:1.15; letter-spacing:-.035em; overflow-wrap:anywhere; }
.dashboard-kpi small { display:block; color:#819087; font-size:11px; line-height:1.4; }
.dashboard-chart-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr); gap:16px; margin-bottom:16px; align-items:stretch; }
.dashboard-chart-grid-secondary { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
.dashboard-chart-panel, .dashboard-alert-panel, .dashboard-recent-panel { min-width:0; padding:20px; }
.dashboard-panel-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; }
.dashboard-panel-heading h3 { margin:4px 0 0; font-size:17px; color:#16382c; }
.dashboard-panel-heading .eyebrow { font-size:10px; letter-spacing:.12em; color:#829188; font-weight:750; }
.dashboard-chart-pill { display:inline-flex; align-items:center; padding:7px 10px; border-radius:99px; background:#eef7f1; color:#167453; font-size:11px; font-weight:750; white-space:nowrap; }
.dashboard-line-wrap { min-width:0; }
.dashboard-chart-summary { display:flex; justify-content:space-between; align-items:center; gap:10px; margin:2px 0 4px; color:#69776f; font-size:12px; }
.dashboard-chart-summary strong { color:#15372b; font-size:14px; }
.dashboard-line-svg { width:100%; height:auto; display:block; overflow:visible; }
.dashboard-chart-gridline { stroke:#edf1ee; stroke-width:1; }
.dashboard-chart-axis { fill:#829087; font-size:10px; }
.dashboard-chart-line { fill:none; stroke:#16815f; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
.dashboard-chart-point { fill:#fff; stroke:#16815f; stroke-width:2.5; }
.dashboard-line-wrap > .small-note { margin:0; font-size:10px; line-height:1.5; }
.dashboard-donut-layout { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:18px; padding:10px 0 4px; }
.dashboard-donut-svg { width:min(168px,45%); min-width:125px; height:auto; overflow:visible; }
.dashboard-donut-segment { fill:none; stroke-width:15; stroke-linecap:butt; }
.dashboard-donut-segment.new, .dashboard-legend-dot.new { stroke:#e6a23c; background:#e6a23c; }
.dashboard-donut-segment.processing, .dashboard-legend-dot.processing { stroke:#4c88c7; background:#4c88c7; }
.dashboard-donut-segment.delivered, .dashboard-legend-dot.delivered { stroke:#19836a; background:#19836a; }
.dashboard-donut-segment.cancelled, .dashboard-legend-dot.cancelled { stroke:#c95b57; background:#c95b57; }
.dashboard-donut-empty { fill:none; stroke:#e7ece8; stroke-width:15; }
.dashboard-donut-total { fill:#15372b; text-anchor:middle; font-size:27px; font-weight:800; }
.dashboard-donut-caption { fill:#839087; text-anchor:middle; font-size:10px; }
.dashboard-chart-legend { flex:1; min-width:130px; display:grid; gap:11px; }
.dashboard-chart-legend-item { display:grid; grid-template-columns:10px minmax(0,1fr) auto; gap:8px; align-items:center; color:#637168; font-size:12px; }
.dashboard-chart-legend-item strong { color:#193c2e; font-size:12px; }
.dashboard-legend-dot { display:inline-block; width:9px; height:9px; border-radius:50%; }
.dashboard-availability-bars { padding:4px 0 0; }
.dashboard-availability-row { margin:0 0 20px; }
.dashboard-availability-row > div:first-child { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; color:#52645a; font-size:12px; }
.dashboard-availability-row strong { color:#193c2e; }
.dashboard-bar-track { width:100%; height:11px; overflow:hidden; border-radius:99px; background:#edf1ee; }
.dashboard-bar-fill { display:block; height:100%; border-radius:99px; min-width:0; }
.dashboard-bar-fill.available { background:#16815f; }
.dashboard-bar-fill.out { background:#d56a62; }
.dashboard-availability-bars .small-note { font-size:11px; line-height:1.5; }
.dashboard-alert-list { display:grid; gap:2px; }
.dashboard-alert-item { display:grid; grid-template-columns:30px minmax(0,1fr) auto; gap:10px; align-items:center; padding:12px 0; border-bottom:1px solid #eef1ee; }
.dashboard-alert-item:last-child { border-bottom:0; }
.dashboard-alert-icon { display:grid; place-items:center; width:29px; height:29px; border-radius:10px; background:#edf7f0; color:#167453; font-size:14px; font-weight:800; }
.dashboard-alert-item.is-warning .dashboard-alert-icon { background:#fff4df; color:#9a6614; }
.dashboard-alert-item strong { display:block; color:#284638; font-size:12px; line-height:1.45; }
.dashboard-alert-item small { display:block; margin-top:3px; color:#829087; font-size:10px; line-height:1.4; }
.dashboard-alert-item .btn { white-space:nowrap; }
.dashboard-recent-panel { margin-bottom:12px; }
.dashboard-data-footnote { margin:6px 0 0; text-align:right; font-size:10px; }
.admin-invite-panel { margin-bottom:16px; }
.admin-invite-panel h3, .admin-permission-note h3 { margin:5px 0 8px; }
.admin-invite-panel > p, .admin-permission-note p { color:#66766d; font-size:12px; line-height:1.6; }
.admin-invite-panel .admin-form { margin-top:12px; }
.admin-permission-note { border-left:4px solid #d5a24e; }
.admin-accounts-list .dashboard-panel-heading { align-items:center; }
.admin-accounts-list .table td { vertical-align:middle; }
.admin-accounts-list .btn.danger { border-color:#e9b8b4; color:#a33d37; background:#fff8f7; }
.admin-accounts-list .btn.danger:hover { background:#fff0ef; }
@media (min-width:1300px) { .dashboard-kpis { grid-template-columns:repeat(6,minmax(0,1fr)); } }
@media (max-width:1050px) { .dashboard-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); } .dashboard-chart-grid { grid-template-columns:minmax(0,1fr); } .dashboard-chart-grid-secondary { grid-template-columns:minmax(0,1fr); } }
@media (max-width:650px) {
  .dashboard-welcome { flex-direction:column; }
  .dashboard-welcome .btn { width:100%; }
  .dashboard-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
  .dashboard-kpi { padding:15px 13px 13px; border-radius:14px; }
  .dashboard-kpi strong { font-size:22px; }
  .dashboard-chart-panel, .dashboard-alert-panel, .dashboard-recent-panel { padding:15px 13px; }
  .dashboard-panel-heading { flex-direction:column; align-items:flex-start; }
  .dashboard-panel-heading > .btn, .dashboard-panel-heading > .dashboard-chart-pill { align-self:flex-start; }
  .dashboard-donut-layout { gap:8px; }
  .dashboard-donut-svg { width:135px; min-width:120px; }
  .dashboard-chart-legend { min-width:120px; }
  .dashboard-alert-item { grid-template-columns:28px minmax(0,1fr); }
  .dashboard-alert-item .btn { grid-column:2; justify-self:start; }
  .dashboard-data-footnote { text-align:left; }
}
'''
    if MARKER not in css:
        css = css.rstrip() + "\n\n" + css_addition + "\n"

    # Basic checks catch accidental partial or duplicate rewrites before writing any files.
    checks = {
        "dashboard chart helper": "function dashboardLineChart(points)" in app,
        "new dashboard": "Vue d’ensemble de SAMA-PACK" in app,
        "general admin check in UI": "currentProfile?.is_super_admin === true" in app,
        "remove admin function": "async function removeAdmin(id)" in app,
        "remove admin function exported": "archiveCatalogItem,removeAdmin});" in app,
        "admin invitation panel condition": "const invitePanel = isGeneralAdmin" in app,
        "CSS dashboard rules": MARKER in css and ".dashboard-chart-grid" in css,
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        raise RuntimeError("Vérifications échouées : " + ", ".join(failed) + ". Aucun fichier n'a été écrit.")

    if not args.apply:
        print("SIMULATION OK — aucune modification écrite.")
        for name in checks:
            print("  ✓", name)
        print("Prochaines étapes : python apply_sama_pack_admin_dashboard.py --apply")
        return 0

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(APP, APP.with_name(f"app.js.backup-{stamp}"))
    shutil.copy2(CSS, CSS.with_name(f"styles.css.backup-{stamp}"))
    APP.write_text(app, encoding="utf-8")
    CSS.write_text(css, encoding="utf-8")
    print("CORRECTIF APPLIQUÉ.")
    print(f"Sauvegardes : {APP.name}.backup-{stamp} et {CSS.name}.backup-{stamp}")
    print("Fichiers modifiés : app.js, styles.css")
    print("Le backend sécurisé sama-invite-admin / sama-remove-admin est déjà déployé sur Supabase.")
    print("Vérifie maintenant : node --check app.js ; git diff --check")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERREUR : {exc}")
        raise SystemExit(1)
