/* SAMA-PACK — template partagé du back-office.
   Injecté avant app.js : tous les contrôles globaux ont donc leurs IDs
   disponibles avant l'initialisation des gestionnaires d'événements. */
(() => {
  "use strict";

  const currentScript = document.currentScript;
  if (!currentScript || document.getElementById("adminPanel")) return;

  /* Un seul shell est réutilisé par toutes les rubriques administratives. */
  const markup = `
    <div id="adminPanel" class="admin-overlay hidden">
      <div class="admin-shell">
        <aside class="admin-sidebar" id="adminSidebar" aria-label="Navigation de gestion">
          <header class="admin-sidebar-header">
            <a class="brand admin-brand" href="/" aria-label="SAMA-PACK, revenir à la boutique">
              <span class="brand-mark" aria-hidden="true">S</span>
              <span>SAMA<span>-PACK</span></span>
            </a>
            <button class="admin-menu-toggle" id="adminMenuToggle" type="button"
              aria-controls="adminSidebarContent" aria-expanded="false"
              aria-label="Ouvrir le menu de gestion">
              <span class="admin-menu-icon" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>Menu</span>
            </button>
          </header>

          <div class="admin-sidebar-content" id="adminSidebarContent">
            <button class="admin-profile-trigger" id="adminAccountBtn" type="button"
              aria-label="Ouvrir mon compte administrateur">
              <span class="admin-profile-avatar" id="adminUserAvatar" aria-hidden="true">SP</span>
              <span class="admin-profile-copy">
                <strong id="adminUserName">Compte de gestion</strong>
                <span class="admin-profile-role" id="adminFlag">Administrateur</span>
              </span>
              <svg class="admin-profile-chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <label class="admin-nav-search" for="adminNavSearch">
              <span>Navigation rapide</span>
              <span class="admin-nav-search-field">
                <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <input id="adminNavSearch" class="input" type="search"
                  placeholder="Rechercher une rubrique…" autocomplete="off">
              </span>
            </label>

            <nav class="admin-navigation" id="adminSidebarNavigation" aria-label="Rubriques d'administration">
              <section class="admin-nav-group" aria-label="Pilotage">
                <span class="admin-nav-heading">PILOTAGE</span>
                <button class="side-btn active" type="button" data-view="dashboard"><span class="admin-nav-icon" aria-hidden="true">▦</span><span>Tableau de bord</span></button>
                <button class="side-btn" type="button" data-view="orders"><span class="admin-nav-icon" aria-hidden="true">▤</span><span>Commandes</span></button>
              </section>

              <section class="admin-nav-group" id="adminDeliveryNavGroup" aria-label="Livraisons">
                <span class="admin-nav-heading">LIVRAISONS</span>
                <button class="side-btn" type="button" data-view="deliveries"><span class="admin-nav-icon" aria-hidden="true">↗</span><span>Gestion des livreurs et livraisons</span></button>
              </section>

              <section class="admin-nav-group" aria-label="Clientèle et ventes">
                <span class="admin-nav-heading">CLIENTÈLE &amp; VENTES</span>
                <button class="side-btn" type="button" data-view="customers"><span class="admin-nav-icon" aria-hidden="true">♙</span><span>Clients</span></button>
                <button class="side-btn" type="button" data-view="prospects"><span class="admin-nav-icon" aria-hidden="true">◎</span><span>Prospection</span></button>
                <button class="side-btn" type="button" data-view="quotes"><span class="admin-nav-icon" aria-hidden="true">▧</span><span>Devis professionnels</span></button>
                <button class="side-btn" type="button" data-view="sales_codes"><span class="admin-nav-icon" aria-hidden="true">⌁</span><span>Codes commerciaux</span></button>
              </section>

              <section class="admin-nav-group" aria-label="Catalogue et opérations">
                <span class="admin-nav-heading">CATALOGUE &amp; OPÉRATIONS</span>
                <button class="side-btn" type="button" data-view="packs"><span class="admin-nav-icon" aria-hidden="true">▣</span><span>Packs</span></button>
                <button class="side-btn" type="button" data-view="catalogs"><span class="admin-nav-icon" aria-hidden="true">▤</span><span>Produits &amp; outils</span></button>
                <button class="side-btn" type="button" data-view="stock"><span class="admin-nav-icon" aria-hidden="true">▦</span><span>Stock</span></button>
                <button class="side-btn" type="button" data-view="suppliers"><span class="admin-nav-icon" aria-hidden="true">⇄</span><span>Fournisseurs</span></button>
              </section>

              <section class="admin-nav-group" aria-label="Finances">
                <span class="admin-nav-heading">FINANCES</span>
                <button class="side-btn" type="button" data-view="expenses"><span class="admin-nav-icon" aria-hidden="true">₣</span><span>Dépenses</span></button>
                <button class="side-btn" type="button" data-view="profitability"><span class="admin-nav-icon" aria-hidden="true">↗</span><span>Rentabilité</span></button>
              </section>

              <section class="admin-nav-group" aria-label="Administration">
                <span class="admin-nav-heading">ADMINISTRATION</span>
                <button class="side-btn" type="button" data-view="admins"><span class="admin-nav-icon" aria-hidden="true">♧</span><span>Comptes administrateurs</span></button>
                <button class="side-btn" type="button" data-view="activity"><span class="admin-nav-icon" aria-hidden="true">◷</span><span>Journal des actions</span></button>
                <button class="side-btn" type="button" data-view="contacts"><span class="admin-nav-icon" aria-hidden="true">✉</span><span>Messages de contact</span></button>
                <button class="side-btn" type="button" data-view="marketing"><span class="admin-nav-icon" aria-hidden="true">↗</span><span>Campagnes e-mail</span></button>
                <button class="side-btn" type="button" data-view="settings"><span class="admin-nav-icon" aria-hidden="true">⚙</span><span>Paramètres</span></button>
              </section>
            </nav>

            <div id="adminNavNoResults" class="admin-nav-no-results hidden">Aucune rubrique trouvée.</div>

            <footer class="sidebar-foot">
              <button class="admin-close-management" id="closeAdminBtn" type="button">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v12h4M11 6l4 4-4 4m4-4H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Fermer la gestion</span>
              </button>
            </footer>
          </div>
        </aside>

        <main class="admin-main">
          <header class="admin-top admin-page-header">
            <div class="admin-top-heading">
              <nav class="admin-breadcrumbs" aria-label="Fil d'ariane">
                <span>Administration</span>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span id="adminBreadcrumb" aria-current="page">Tableau de bord</span>
              </nav>
              <h1 id="adminTitle">Tableau de bord</h1>
              <p id="adminContext" class="admin-context">Gestion commerciale · SAMA-PACK</p>
            </div>

            <div class="admin-header-actions">
              <div class="admin-icon-toolbar" role="group" aria-label="Actions globales">
                <button class="admin-icon-button" id="adminRefreshBtn" type="button"
                  title="Actualiser la rubrique" aria-label="Actualiser la rubrique">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.4 7.6A6.8 6.8 0 0 0 4.2 5.4L2.8 7M2.8 7V3.9M2.8 7h3.2M3.6 12.4a6.8 6.8 0 0 0 12.2 2.2l1.4-1.6m0 0v3.1m0-3.1h-3.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="admin-icon-button admin-notification-action" id="adminNotificationBtn" type="button"
                  title="Notifications administrateur" aria-label="Ouvrir les notifications">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.2 7.8a5.2 5.2 0 0 0-10.4 0c0 6-2 6-2 7.3h14.4c0-1.3-2-1.3-2-7.3ZM8 17h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="sr-only">Notifications</span>
                  <span id="adminNotificationCount" class="admin-notification-badge hidden">0</span>
                </button>
              </div>
              <button class="admin-store-button" id="viewShopBtn" type="button">
                <span>Voir la boutique</span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M6 5h9v9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </header>

          <div class="admin-actionbar" id="adminActionBar">
            <label class="admin-global-search" for="adminGlobalSearch">
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input id="adminGlobalSearch" type="search" placeholder="Filtrer les résultats affichés…" autocomplete="off">
            </label>
            <div class="admin-view-tools" id="adminViewTools" aria-label="Filtres de la rubrique"></div>
          </div>

          <section id="adminContent" class="admin-content" aria-label="Contenu de la rubrique" aria-live="polite">
            <div class="panel loading-panel"><div class="admin-loading-spinner" aria-hidden="true"></div><p>Chargement des données…</p></div>
          </section>

          <footer class="admin-footer">
            <span>SAMA-PACK <span aria-hidden="true">·</span> Gestion commerciale</span>
            <span>Espace de gestion sécurisé</span>
          </footer>
        </main>
      </div>
    </div>`;

  currentScript.insertAdjacentHTML("beforebegin", markup);
})();