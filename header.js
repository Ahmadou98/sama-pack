/* SAMA-PACK — contrôleur unique de l’en-tête boutique */
(() => {
  "use strict";
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

  const shell = header.querySelector(".mobile-menu-shell");
  const toggle = header.querySelector(".mobile-menu-toggle");
  const menu = header.querySelector(".mobile-nav-menu");

  const closeMenu = () => {
    if (!shell || !toggle) return;
    shell.classList.remove("is-open");
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

  const desktopMore = header.querySelector(".desktop-nav-more");
  if (desktopMore) {
    desktopMore.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => { desktopMore.open = false; });
    });
    document.addEventListener("click", event => {
      if (!desktopMore.contains(event.target)) desktopMore.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") desktopMore.open = false;
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
