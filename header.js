/* SAMA-PACK — contrôleur unique de l’en-tête boutique */
(() => {
  "use strict";
  const sharedHeaderMarkup = `<header class="topbar info-floating-header">
  <div class="wrap nav">
    <a class="brand" href="/#home" aria-label="SAMA-PACK, accueil"><span class="brand-mark">S</span><span>SAMA<span>-PACK</span></span></a>
    <nav class="desktop-nav" aria-label="Navigation principale">
      <a href="/#home">Accueil</a>
      <details class="desktop-nav-more">
        <summary>Catalogue et packs <span aria-hidden="true">⌄</span></summary>
        <div class="desktop-nav-dropdown">
          <a href="/#catalogue">Packs de nettoyage</a>
          <a href="produits.html">Produits à l’unité ou par colis</a>
          <a href="outils.html">Outils de nettoyage</a>
        </div>
      </details>
      <a href="comment-ca-marche.html">Comment ça marche</a>
      <a href="/#b2b">Professionnels</a>
      <details class="desktop-nav-more">
        <summary>Aide &amp; contact <span aria-hidden="true">⌄</span></summary>
        <div class="desktop-nav-dropdown">
          <a href="contact.html">Nous contacter</a>
          <a href="livraison-retours.html">Livraison et retours</a>
          <a href="conditions-vente.html">Conditions de vente</a>
          <a href="confidentialite.html">Confidentialité</a>
        </div>
      </details>
    </nav>
    <div class="nav-actions">
      <button class="icon-btn" id="openCartBtn" data-header-action="cart" type="button" aria-label="Panier" title="Panier">🛒 <span id="cartCount">0</span></button>
      <button class="icon-btn notification-btn" id="notificationBtn" data-header-action="notifications" type="button" aria-label="Notifications" title="Notifications">🔔 <span id="notificationCount" class="notification-count hidden">0</span></button>
      <button class="btn small ghost" id="accountBtn" data-header-action="account" type="button">Connexion</button>
      <div class="mobile-menu-shell" id="mobileMenuShell">
        <button class="mobile-menu-toggle" id="mobileMenuToggle" type="button" aria-label="Ouvrir le menu" aria-controls="infoFloatingMenu" aria-expanded="false">
          <span class="mobile-menu-icon" aria-hidden="true"><i></i><i></i><i></i></span>
        </button>
        <nav id="infoFloatingMenu" class="mobile-nav-menu" aria-label="Menu principal">
          <a class="mobile-nav-item" href="/#home"><span aria-hidden="true">⌂</span><small>Accueil</small></a>
          <details class="mobile-nav-group">
            <summary class="mobile-nav-item"><small>Catalogue et packs</small><span class="mobile-nav-group-chevron" aria-hidden="true">⌄</span></summary>
            <div class="mobile-nav-submenu">
              <a href="/#catalogue">Packs de nettoyage</a>
              <a href="produits.html">Produits à l’unité ou par colis</a>
              <a href="outils.html">Outils de nettoyage</a>
            </div>
          </details>
          <a class="mobile-nav-item" href="comment-ca-marche.html"><span aria-hidden="true">ⓘ</span><small>Comment ça marche</small></a>
          <a class="mobile-nav-item" href="/#b2b"><span aria-hidden="true">▤</span><small>Professionnels</small></a>
          <details class="mobile-nav-group">
            <summary class="mobile-nav-item"><small>Aide &amp; contact</small><span class="mobile-nav-group-chevron" aria-hidden="true">⌄</span></summary>
            <div class="mobile-nav-submenu">
              <a href="contact.html">Nous contacter</a>
              <a href="livraison-retours.html">Livraison et retours</a>
              <a href="conditions-vente.html">Conditions de vente</a>
              <a href="confidentialite.html">Confidentialité</a>
            </div>
          </details>
          <button type="button" id="mobileManageBtn" data-header-action="manage" class="mobile-nav-item hidden" aria-label="Ouvrir la gestion"><span aria-hidden="true">⚙</span><small>Gestion</small></button>
          <button id="deliverySignOut" class="mobile-nav-item" type="button" hidden>Déconnexion</button>
        </nav>
      </div>
      <button class="btn small ghost hidden" id="adminBtn" data-header-action="manage" type="button">Gestion</button>
    </div>
  </div>
</header>`;
  const headerMount = document.getElementById("siteHeaderMount");
  if (headerMount && !document.querySelector(".info-floating-header")) {
    headerMount.outerHTML = sharedHeaderMarkup;
  }
  const header = document.querySelector(".info-floating-header");
  if (!header || header.dataset.sharedHeaderReady === "true") return;

  // Après un vrai rechargement manuel, revenir à l’accueil pour remettre les ventes flash en évidence.
  // Les retours de paiement, les actions demandées par lien et les autres espaces restent intacts.
  try {
    const navigationEntry = window.performance?.getEntriesByType?.("navigation")?.[0];
    const legacyNavigationType = window.performance?.navigation?.type;
    const isReload = navigationEntry?.type === "reload" || (!navigationEntry && legacyNavigationType === 1);
    const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    const storefrontPaths = new Set([
      "/", "/index.html", "/produits.html", "/outils.html", "/fiche-produit.html",
      "/comment-ca-marche.html", "/conditions-vente.html", "/confidentialite.html",
      "/contact.html", "/livraison-retours.html"
    ]);
    if (isReload && storefrontPaths.has(pathname)) {
      const params = new URLSearchParams(window.location.search || "");
      const returnParams = [
        "spAction", "connexion", "token",
        "paydunya_order_id", "paydunya_cancelled_order_id",
        "paytech_order_id", "paytech_cancelled_order_id"
      ];
      const isSpecialReturn = returnParams.some(key => params.has(key));
      const isHome = pathname === "/" || pathname === "/index.html";
      if (!isSpecialReturn && (!isHome || window.location.hash)) {
        window.location.replace("/");
        return;
      }
    }
  } catch (error) {
    console.warn("Réinitialisation de la page d’accueil ignorée.", error);
  }

  header.dataset.sharedHeaderReady = "true";

  // En-tête intelligent : compact au scroll et parallaxe légère du visuel principal.
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const hero = document.querySelector("#home.hero");
  let scrollFramePending = false;
  const updateScrollVisuals = () => {
    const scrolled = window.scrollY > 24;
    header.classList.toggle("is-scrolled", scrolled);
    if (hero && !reducedMotion && hero.classList.contains("has-custom-bg")) {
      const shift = Math.max(-34, Math.min(34, -hero.getBoundingClientRect().top * 0.075));
      hero.style.setProperty("--hero-parallax-y", shift.toFixed(1) + "px");
    }
    scrollFramePending = false;
  };
  const onWindowScroll = () => {
    if (scrollFramePending) return;
    scrollFramePending = true;
    window.requestAnimationFrame(updateScrollVisuals);
  };
  window.addEventListener("scroll", onWindowScroll, { passive: true });
  updateScrollVisuals();

  const shell = header.querySelector(".mobile-menu-shell");
  const toggle = header.querySelector(".mobile-menu-toggle");
  const menu = header.querySelector(".mobile-nav-menu");

  const closeMenu = () => {
    if (!shell || !toggle) return;
    shell.classList.remove("is-open");
    menu?.querySelectorAll(".mobile-nav-group").forEach(group => { group.open = false; });
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Ouvrir le menu");
  };

  if (shell && toggle && menu) {
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const open = !shell.classList.contains("is-open");
      shell.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    });
    menu.querySelectorAll("a, button.mobile-nav-item").forEach(item => {
      item.addEventListener("click", closeMenu);
    });
    document.addEventListener("click", event => {
      if (!shell.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });
  }

  const desktopMoreMenus = Array.from(header.querySelectorAll(".desktop-nav-more"));
  if (desktopMoreMenus.length) {
    desktopMoreMenus.forEach(desktopMore => {
      desktopMore.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => { desktopMore.open = false; });
      });
      desktopMore.addEventListener("toggle", () => {
        if (desktopMore.open) {
          desktopMoreMenus.forEach(other => {
            if (other !== desktopMore) other.open = false;
          });
        }
      });
    });
    document.addEventListener("click", event => {
      desktopMoreMenus.forEach(desktopMore => {
        if (!desktopMore.contains(event.target)) desktopMore.open = false;
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") desktopMoreMenus.forEach(menu => { menu.open = false; });
    });
  }

  const homeAction = action => {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("spAction", action);
    window.location.assign(url.pathname + url.search);
  };

  header.addEventListener("click", event => {
    const button = event.target.closest("[data-header-action]");
    if (!button || !header.contains(button)) return;
    const action = button.dataset.headerAction;
    const actionMap = {
      cart: "cart",
      account: "account",
      notifications: "notifications",
      manage: "manage"
    };
    const method = actionMap[action];
    if (!method) return;
    event.preventDefault();
    closeMenu();

    const handlers = window.SamaPackHeaderActions;
    if (handlers && typeof handlers[method] === "function") {
      handlers[method]();
      return;
    }
    homeAction(method);
  });
})();
