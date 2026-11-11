(() => {
  "use strict";

  const GUIDE_URL = "/telecharger-application.html";
  const KEYS = {
    pending: "sama-pack:pwa-suggestion:pending-at",
    cooldown: "sama-pack:pwa-suggestion:next-allowed-at",
    never: "sama-pack:pwa-suggestion:never-show"
  };
  const DAY = 86400000;
  const MIN_DELAY = 45000;
  const RANDOM_DELAY = 90000;
  const SNOOZE_DAYS = 30;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isMobile = () =>
    window.matchMedia("(max-width: 760px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  function storageGet(key) {
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, String(value)); }
    catch { /* Ne jamais bloquer la boutique si le stockage est indisponible. */ }
  }

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); }
    catch { /* Ne jamais bloquer la boutique si le stockage est indisponible. */ }
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const registerWorker = () => {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      }).catch((error) => {
        console.warn("SAMA-PACK : enregistrement du mode hors connexion indisponible.", error);
      });
    };

    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });
  }

  if (isStandalone() || !isMobile()) return;

  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (currentPath === GUIDE_URL || storageGet(KEYS.never) === "1") return;

  const cooldown = Number(storageGet(KEYS.cooldown) || 0);
  if (Number.isFinite(cooldown) && cooldown > Date.now()) return;

  let pendingAt = Number(storageGet(KEYS.pending) || 0);
  let lastInteractionAt = 0;
  let timerId = 0;
  let suggestion = null;
  let closing = false;

  function clearTimer() {
    if (timerId) window.clearTimeout(timerId);
    timerId = 0;
  }

  function setCooldown(days) {
    storageSet(KEYS.cooldown, Date.now() + days * DAY);
    storageRemove(KEYS.pending);
    pendingAt = 0;
  }

  function isSafeToShow() {
    if (document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;

    if (document.querySelector(
      'dialog[open], [role="dialog"]:not([hidden]), [aria-modal="true"]:not([hidden])'
    )) return false;

    const active = document.activeElement;
    if (active && active.matches &&
        active.matches("input, textarea, select, [contenteditable='true']")) return false;

    return true;
  }

  function removeSuggestion() {
    if (!suggestion || closing) return;
    closing = true;
    suggestion.classList.remove("is-visible");
    suggestion.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      suggestion?.remove();
      suggestion = null;
    }, 230);
  }

  function buildSuggestion() {
    const card = document.createElement("aside");
    card.className = "pwa-install-suggestion";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Suggestion pour installer SAMA-PACK");
    card.setAttribute("aria-hidden", "false");
    card.innerHTML = `
      <div class="pwa-suggestion-top">
        <span class="pwa-suggestion-mark" aria-hidden="true">S</span>
        <div class="pwa-suggestion-brand">
          <span class="pwa-suggestion-eyebrow">VOTRE BOUTIQUE, À PORTÉE DE MAIN</span>
          <strong>SAMA-PACK</strong>
        </div>
        <button class="pwa-suggestion-close" type="button" aria-label="Fermer la suggestion">×</button>
      </div>
      <h2>Retrouvez SAMA-PACK sur votre écran d’accueil.</h2>
      <p>Ajoutez la boutique à votre téléphone pour y accéder en un geste, sans télécharger d’APK.</p>
      <a class="pwa-suggestion-primary" href="${GUIDE_URL}">
        Voir le guide d’installation <span aria-hidden="true">→</span>
      </a>
      <div class="pwa-suggestion-actions">
        <button type="button" data-pwa-later>Plus tard</button>
        <button type="button" data-pwa-never>Ne plus me montrer</button>
      </div>
    `;

    card.querySelector(".pwa-suggestion-close").addEventListener("click", () => {
      setCooldown(SNOOZE_DAYS);
      removeSuggestion();
    });
    card.querySelector("[data-pwa-later]").addEventListener("click", () => {
      setCooldown(SNOOZE_DAYS);
      removeSuggestion();
    });
    card.querySelector("[data-pwa-never]").addEventListener("click", () => {
      storageSet(KEYS.never, "1");
      storageRemove(KEYS.pending);
      storageRemove(KEYS.cooldown);
      pendingAt = 0;
      removeSuggestion();
    });
    card.querySelector(".pwa-suggestion-primary").addEventListener("click", () => {
      setCooldown(60);
    });

    return card;
  }

  function showSuggestion() {
    if (suggestion || closing || !isSafeToShow()) return false;

    setCooldown(SNOOZE_DAYS);
    suggestion = buildSuggestion();
    document.body.appendChild(suggestion);
    window.requestAnimationFrame(() => suggestion?.classList.add("is-visible"));
    return true;
  }

  function attemptToShow() {
    timerId = 0;
    if (!pendingAt || suggestion || closing || Date.now() < pendingAt) return;

    const interactionIsRecent = lastInteractionAt > 0 &&
      Date.now() - lastInteractionAt < 45000;
    if (!interactionIsRecent || !isSafeToShow()) return;

    showSuggestion();
  }

  function scheduleSuggestion() {
    clearTimer();
    if (!pendingAt || suggestion || closing) return;
    timerId = window.setTimeout(attemptToShow, Math.max(0, pendingAt - Date.now()));
  }

  function recordInteraction(event) {
    if (suggestion || closing) return;
    lastInteractionAt = Date.now();

    if (!pendingAt) {
      pendingAt = Date.now() + MIN_DELAY + Math.floor(Math.random() * RANDOM_DELAY);
      storageSet(KEYS.pending, pendingAt);
      scheduleSuggestion();
      return;
    }

    if (pendingAt <= Date.now()) {
      const target = event && event.target;
      const isControl = target && target.closest &&
        target.closest("a, button, input, textarea, select, [contenteditable='true']");
      if (!isControl) {
        clearTimer();
        timerId = window.setTimeout(attemptToShow, 400);
      }
    }
  }

  // Le délai aléatoire commence après une interaction réelle et survit à la navigation.
  if (pendingAt > 0) scheduleSuggestion();

  ["pointerdown", "touchstart", "scroll", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, recordInteraction, {
      passive: eventName !== "keydown"
    });
  });
})();