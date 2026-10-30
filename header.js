/* SAMA-PACK — contrôleur unique de l’en-tête boutique */
(() => {
  "use strict";
  const header = document.querySelector(".info-floating-header");
  if (!header || header.dataset.sharedHeaderReady === "true") return;
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
