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
