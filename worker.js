const SITE_URL = "https://sama-pack.store";
const SUPABASE_URL = "https://tbxxrnhcfuaeaatlrdtr.supabase.co";
// Clé publishable déjà utilisée par la boutique. Les règles RLS limitent les lectures publiques aux fiches actives.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo";
const PRODUCT_COLUMNS = [
  "id", "public_ref", "name", "category", "price", "description", "items",
  "image_path", "image_paths", "active", "catalog_type", "availability_status",
  "brand", "sale_unit", "max_delivery_hours", "promo_active", "promo_price", "promo_started_at",
  "promo_end_at", "updated_at", "created_at"
].join(",");

const STATIC_PAGES = [
  "/", "/produits.html", "/outils.html", "/comment-ca-marche.html",
  "/contact.html", "/conditions-vente.html", "/livraison-retours.html",
  "/confidentialite.html", "/telecharger-application.html"
];

const PWA_ASSET_VERSION = "20261111-mobile-pwa-suggestion-v1";
const PWA_JS_SOURCE = "(() => {\n  \"use strict\";\n\n  const GUIDE_URL = \"/telecharger-application.html\";\n  const KEYS = {\n    pending: \"sama-pack:pwa-suggestion:pending-at\",\n    cooldown: \"sama-pack:pwa-suggestion:next-allowed-at\",\n    never: \"sama-pack:pwa-suggestion:never-show\"\n  };\n  const DAY = 86400000;\n  const MIN_DELAY = 45000;\n  const RANDOM_DELAY = 90000;\n  const SNOOZE_DAYS = 30;\n\n  const isStandalone = () =>\n    window.matchMedia(\"(display-mode: standalone)\").matches ||\n    window.navigator.standalone === true;\n\n  const isMobile = () =>\n    window.matchMedia(\"(max-width: 760px)\").matches ||\n    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);\n\n  function storageGet(key) {\n    try { return window.localStorage.getItem(key); }\n    catch { return null; }\n  }\n\n  function storageSet(key, value) {\n    try { window.localStorage.setItem(key, String(value)); }\n    catch { /* Ne jamais bloquer la boutique si le stockage est indisponible. */ }\n  }\n\n  function storageRemove(key) {\n    try { window.localStorage.removeItem(key); }\n    catch { /* Ne jamais bloquer la boutique si le stockage est indisponible. */ }\n  }\n\n  if (\"serviceWorker\" in navigator && window.isSecureContext) {\n    const registerWorker = () => {\n      navigator.serviceWorker.register(\"/sw.js\", {\n        scope: \"/\",\n        updateViaCache: \"none\"\n      }).catch((error) => {\n        console.warn(\"SAMA-PACK : enregistrement du mode hors connexion indisponible.\", error);\n      });\n    };\n\n    if (document.readyState === \"complete\") registerWorker();\n    else window.addEventListener(\"load\", registerWorker, { once: true });\n  }\n\n  if (isStandalone() || !isMobile()) return;\n\n  const currentPath = window.location.pathname.replace(/\\/+$/, \"\") || \"/\";\n  if (currentPath === GUIDE_URL || storageGet(KEYS.never) === \"1\") return;\n\n  const cooldown = Number(storageGet(KEYS.cooldown) || 0);\n  if (Number.isFinite(cooldown) && cooldown > Date.now()) return;\n\n  let pendingAt = Number(storageGet(KEYS.pending) || 0);\n  let lastInteractionAt = 0;\n  let timerId = 0;\n  let suggestion = null;\n  let closing = false;\n\n  function clearTimer() {\n    if (timerId) window.clearTimeout(timerId);\n    timerId = 0;\n  }\n\n  function setCooldown(days) {\n    storageSet(KEYS.cooldown, Date.now() + days * DAY);\n    storageRemove(KEYS.pending);\n    pendingAt = 0;\n  }\n\n  function isSafeToShow() {\n    if (document.visibilityState !== \"visible\") return false;\n    if (typeof document.hasFocus === \"function\" && !document.hasFocus()) return false;\n\n    if (document.querySelector(\n      'dialog[open], [role=\"dialog\"]:not([hidden]), [aria-modal=\"true\"]:not([hidden])'\n    )) return false;\n\n    const active = document.activeElement;\n    if (active && active.matches &&\n        active.matches(\"input, textarea, select, [contenteditable='true']\")) return false;\n\n    return true;\n  }\n\n  function removeSuggestion() {\n    if (!suggestion || closing) return;\n    closing = true;\n    suggestion.classList.remove(\"is-visible\");\n    suggestion.setAttribute(\"aria-hidden\", \"true\");\n    window.setTimeout(() => {\n      suggestion?.remove();\n      suggestion = null;\n    }, 230);\n  }\n\n  function buildSuggestion() {\n    const card = document.createElement(\"aside\");\n    card.className = \"pwa-install-suggestion\";\n    card.setAttribute(\"role\", \"region\");\n    card.setAttribute(\"aria-label\", \"Suggestion pour installer SAMA-PACK\");\n    card.setAttribute(\"aria-live\", \"polite\");\n    card.setAttribute(\"aria-atomic\", \"true\");\n    card.innerHTML = `\n      <div class=\"pwa-suggestion-top\">\n        <span class=\"pwa-suggestion-mark\" aria-hidden=\"true\">S</span>\n        <div class=\"pwa-suggestion-brand\">\n          <span class=\"pwa-suggestion-eyebrow\">VOTRE BOUTIQUE, À PORTÉE DE MAIN</span>\n          <strong>SAMA-PACK</strong>\n        </div>\n        <button class=\"pwa-suggestion-close\" type=\"button\" aria-label=\"Fermer la suggestion\">×</button>\n      </div>\n      <h2>Retrouvez SAMA-PACK sur votre écran d’accueil.</h2>\n      <p>Ajoutez la boutique à votre téléphone pour y accéder en un geste, sans télécharger d’APK.</p>\n      <a class=\"pwa-suggestion-primary\" href=\"${GUIDE_URL}\">\n        Voir le guide d’installation <span aria-hidden=\"true\">→</span>\n      </a>\n      <div class=\"pwa-suggestion-actions\">\n        <button type=\"button\" data-pwa-later>Plus tard</button>\n        <button type=\"button\" data-pwa-never>Ne plus me montrer</button>\n      </div>\n    `;\n\n    card.querySelector(\".pwa-suggestion-close\").addEventListener(\"click\", () => {\n      setCooldown(SNOOZE_DAYS);\n      removeSuggestion();\n    });\n    card.querySelector(\"[data-pwa-later]\").addEventListener(\"click\", () => {\n      setCooldown(SNOOZE_DAYS);\n      removeSuggestion();\n    });\n    card.querySelector(\"[data-pwa-never]\").addEventListener(\"click\", () => {\n      storageSet(KEYS.never, \"1\");\n      storageRemove(KEYS.pending);\n      storageRemove(KEYS.cooldown);\n      pendingAt = 0;\n      removeSuggestion();\n    });\n    card.querySelector(\".pwa-suggestion-primary\").addEventListener(\"click\", () => {\n      setCooldown(60);\n    });\n\n    return card;\n  }\n\n  function showSuggestion() {\n    if (suggestion || closing || !isSafeToShow()) return false;\n\n    setCooldown(SNOOZE_DAYS);\n    suggestion = buildSuggestion();\n    document.body.appendChild(suggestion);\n    window.requestAnimationFrame(() => suggestion?.classList.add(\"is-visible\"));\n    return true;\n  }\n\n  function attemptToShow() {\n    timerId = 0;\n    if (!pendingAt || suggestion || closing || Date.now() < pendingAt) return;\n\n    const interactionIsRecent = lastInteractionAt > 0 &&\n      Date.now() - lastInteractionAt < 45000;\n    if (!interactionIsRecent || !isSafeToShow()) return;\n\n    showSuggestion();\n  }\n\n  function scheduleSuggestion() {\n    clearTimer();\n    if (!pendingAt || suggestion || closing) return;\n    timerId = window.setTimeout(attemptToShow, Math.max(0, pendingAt - Date.now()));\n  }\n\n  function recordInteraction(event) {\n    if (suggestion || closing) return;\n    lastInteractionAt = Date.now();\n\n    if (!pendingAt) {\n      pendingAt = Date.now() + MIN_DELAY + Math.floor(Math.random() * RANDOM_DELAY);\n      storageSet(KEYS.pending, pendingAt);\n      scheduleSuggestion();\n      return;\n    }\n\n    if (pendingAt <= Date.now()) {\n      const target = event && event.target;\n      const isControl = target && target.closest &&\n        target.closest(\"a, button, input, textarea, select, [contenteditable='true']\");\n      if (!isControl) {\n        clearTimer();\n        timerId = window.setTimeout(attemptToShow, 400);\n      }\n    }\n  }\n\n  // Le délai aléatoire commence après une interaction réelle et survit à la navigation.\n  if (pendingAt > 0) scheduleSuggestion();\n\n  [\"pointerdown\", \"touchstart\", \"scroll\", \"keydown\"].forEach((eventName) => {\n    window.addEventListener(eventName, recordInteraction, {\n      passive: eventName !== \"keydown\"\n    });\n  });\n})();";
const PWA_CSS_SOURCE = ".pwa-install-suggestion {\n  position: fixed;\n  z-index: 12000;\n  inset: auto 12px calc(12px + env(safe-area-inset-bottom, 0px));\n  width: min(calc(100% - 24px), 430px);\n  margin-inline: auto;\n  padding: 17px 17px 13px;\n  border: 1px solid #dce9df;\n  border-radius: 19px;\n  background: rgba(255, 255, 255, .98);\n  color: #1d2e23;\n  box-shadow: 0 15px 44px rgba(20, 49, 31, .19);\n  opacity: 0;\n  transform: translateY(18px);\n  pointer-events: none;\n  transition: opacity .22s ease, transform .22s ease;\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n}\n\n.pwa-install-suggestion.is-visible {\n  opacity: 1;\n  transform: translateY(0);\n  pointer-events: auto;\n}\n\n.pwa-suggestion-top {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-bottom: 12px;\n}\n\n.pwa-suggestion-mark {\n  display: grid;\n  flex: 0 0 38px;\n  width: 38px;\n  height: 38px;\n  place-items: center;\n  border-radius: 12px;\n  background: #166534;\n  color: #fff;\n  font-size: 17px;\n  font-weight: 900;\n  letter-spacing: -.04em;\n}\n\n.pwa-suggestion-brand {\n  display: grid;\n  gap: 2px;\n  min-width: 0;\n}\n\n.pwa-suggestion-eyebrow {\n  color: #718276;\n  font-size: 9px;\n  font-weight: 800;\n  letter-spacing: .075em;\n  line-height: 1.3;\n}\n\n.pwa-suggestion-brand strong {\n  color: #17452b;\n  font-size: 12px;\n  font-weight: 900;\n  letter-spacing: .035em;\n}\n\n.pwa-suggestion-close {\n  display: grid;\n  flex: 0 0 30px;\n  width: 30px;\n  height: 30px;\n  margin-left: auto;\n  place-items: center;\n  border: 0;\n  border-radius: 50%;\n  background: #f3f6f3;\n  color: #647368;\n  font-size: 22px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.pwa-suggestion-close:hover,\n.pwa-suggestion-close:focus-visible {\n  background: #e8efe9;\n  outline: 2px solid #9fbea8;\n  outline-offset: 2px;\n}\n\n.pwa-install-suggestion h2 {\n  margin: 0 0 6px;\n  color: #173b27;\n  font-size: 16px;\n  font-weight: 850;\n  line-height: 1.32;\n  letter-spacing: -.02em;\n}\n\n.pwa-install-suggestion p {\n  margin: 0 0 13px;\n  color: #627267;\n  font-size: 12px;\n  line-height: 1.5;\n}\n\n.pwa-suggestion-primary {\n  display: flex;\n  width: 100%;\n  min-height: 43px;\n  align-items: center;\n  justify-content: center;\n  gap: 9px;\n  padding: 10px 13px;\n  border: 0;\n  border-radius: 11px;\n  background: #166534;\n  color: #fff;\n  font-size: 12px;\n  font-weight: 850;\n  line-height: 1.25;\n  text-align: center;\n  text-decoration: none;\n  transition: background .15s ease, transform .15s ease;\n}\n\n.pwa-suggestion-primary:hover,\n.pwa-suggestion-primary:focus-visible {\n  background: #14532d;\n  outline: 2px solid #a3c9ae;\n  outline-offset: 2px;\n}\n\n.pwa-suggestion-primary:active {\n  transform: translateY(1px);\n}\n\n.pwa-suggestion-actions {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-top: 9px;\n}\n\n.pwa-suggestion-actions button {\n  min-height: 32px;\n  padding: 5px 2px;\n  border: 0;\n  background: transparent;\n  color: #68776d;\n  font: inherit;\n  font-size: 11px;\n  font-weight: 650;\n  cursor: pointer;\n}\n\n.pwa-suggestion-actions button:last-child {\n  color: #78857c;\n  text-decoration: underline;\n  text-decoration-color: #c4cec7;\n  text-underline-offset: 3px;\n}\n\n.pwa-suggestion-actions button:hover,\n.pwa-suggestion-actions button:focus-visible {\n  color: #174b2d;\n  outline: 2px solid #a3c9ae;\n  outline-offset: 2px;\n  border-radius: 5px;\n}\n\n@media (min-width: 761px) {\n  .pwa-install-suggestion { display: none !important; }\n}\n\n@media (max-width: 380px) {\n  .pwa-install-suggestion {\n    inset-inline: 8px;\n    width: calc(100% - 16px);\n    padding: 15px 14px 11px;\n  }\n  .pwa-install-suggestion h2 { font-size: 15px; }\n  .pwa-suggestion-actions button { font-size: 10px; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .pwa-install-suggestion,\n  .pwa-suggestion-primary {\n    transition: none;\n  }\n}";
const SHARED_HEADER_SOURCE = "/* SAMA-PACK — contrôleur unique de l’en-tête boutique */\n(() => {\n  \"use strict\";\n  const sharedHeaderMarkup = `<header class=\"topbar info-floating-header\">\n  <div class=\"wrap nav\">\n    <a class=\"brand\" href=\"/#home\" aria-label=\"SAMA-PACK, accueil\"><span class=\"brand-mark\">S</span><span>SAMA<span>-PACK</span></span></a>\n    <nav class=\"desktop-nav\" aria-label=\"Navigation principale\">\n      <a href=\"/#home\">Accueil</a>\n      <details class=\"desktop-nav-more\">\n        <summary>Catalogue et packs <span aria-hidden=\"true\">⌄</span></summary>\n        <div class=\"desktop-nav-dropdown\">\n          <a href=\"/#catalogue\">Packs de nettoyage</a>\n          <a href=\"produits.html\">Produits à l’unité ou par colis</a>\n          <a href=\"outils.html\">Outils de nettoyage</a>\n        </div>\n      </details>\n      <a href=\"comment-ca-marche.html\">Comment ça marche</a>\n      <a href=\"/#b2b\">Professionnels</a>\n      <details class=\"desktop-nav-more\">\n        <summary>Aide &amp; contact <span aria-hidden=\"true\">⌄</span></summary>\n        <div class=\"desktop-nav-dropdown\">\n          <a href=\"contact.html\">Nous contacter</a>\n          <a href=\"livraison-retours.html\">Livraison et retours</a>\n          <a href=\"conditions-vente.html\">Conditions de vente</a>\n          <a href=\"confidentialite.html\">Confidentialité</a>\n          <a href=\"telecharger-application.html\">Guide d’installation</a>\n        </div>\n      </details>\n    </nav>\n    <div class=\"nav-actions\">\n      <button class=\"icon-btn\" id=\"openCartBtn\" data-header-action=\"cart\" type=\"button\" aria-label=\"Panier\" title=\"Panier\">🛒 <span id=\"cartCount\">0</span></button>\n      <button class=\"icon-btn notification-btn\" id=\"notificationBtn\" data-header-action=\"notifications\" type=\"button\" aria-label=\"Notifications\" title=\"Notifications\">🔔 <span id=\"notificationCount\" class=\"notification-count hidden\">0</span></button>\n      <button class=\"btn small ghost\" id=\"accountBtn\" data-header-action=\"account\" type=\"button\">Connexion</button>\n      <div class=\"mobile-menu-shell\" id=\"mobileMenuShell\">\n        <button class=\"mobile-menu-toggle\" id=\"mobileMenuToggle\" type=\"button\" aria-label=\"Ouvrir le menu\" aria-controls=\"infoFloatingMenu\" aria-expanded=\"false\">\n          <span class=\"mobile-menu-icon\" aria-hidden=\"true\"><i></i><i></i><i></i></span>\n        </button>\n        <nav id=\"infoFloatingMenu\" class=\"mobile-nav-menu\" aria-label=\"Menu principal\">\n          <a class=\"mobile-nav-item\" href=\"/#home\"><span aria-hidden=\"true\">⌂</span><small>Accueil</small></a>\n          <details class=\"mobile-nav-group\">\n            <summary class=\"mobile-nav-item\"><small>Catalogue et packs</small><span class=\"mobile-nav-group-chevron\" aria-hidden=\"true\">⌄</span></summary>\n            <div class=\"mobile-nav-submenu\">\n              <a href=\"/#catalogue\">Packs de nettoyage</a>\n              <a href=\"produits.html\">Produits à l’unité ou par colis</a>\n              <a href=\"outils.html\">Outils de nettoyage</a>\n            </div>\n          </details>\n          <a class=\"mobile-nav-item\" href=\"comment-ca-marche.html\"><span aria-hidden=\"true\">ⓘ</span><small>Comment ça marche</small></a>\n          <a class=\"mobile-nav-item\" href=\"/#b2b\"><span aria-hidden=\"true\">▤</span><small>Professionnels</small></a>\n          <button class=\"mobile-nav-item\" id=\"mobilePushEnableBtn\" data-header-action=\"push\" type=\"button\"><span aria-hidden=\"true\">🔔</span><small>Activer les notifications</small></button>\n          <details class=\"mobile-nav-group\">\n            <summary class=\"mobile-nav-item\"><small>Aide &amp; contact</small><span class=\"mobile-nav-group-chevron\" aria-hidden=\"true\">⌄</span></summary>\n            <div class=\"mobile-nav-submenu\">\n              <a href=\"contact.html\">Nous contacter</a>\n              <a href=\"livraison-retours.html\">Livraison et retours</a>\n              <a href=\"conditions-vente.html\">Conditions de vente</a>\n              <a href=\"confidentialite.html\">Confidentialité</a>\n              <a href=\"telecharger-application.html\">Guide d’installation</a>\n            </div>\n          </details>\n          <button type=\"button\" id=\"mobileManageBtn\" data-header-action=\"manage\" class=\"mobile-nav-item hidden\" aria-label=\"Ouvrir la gestion\"><span aria-hidden=\"true\">⚙</span><small>Gestion</small></button>\n          <button id=\"deliverySignOut\" class=\"mobile-nav-item\" type=\"button\" hidden>Déconnexion</button>\n        </nav>\n      </div>\n      <button class=\"btn small ghost hidden\" id=\"adminBtn\" data-header-action=\"manage\" type=\"button\">Gestion</button>\n    </div>\n  </div>\n</header>`;\n  const headerMount = document.getElementById(\"siteHeaderMount\");\n  if (headerMount && !document.querySelector(\".info-floating-header\")) {\n    headerMount.outerHTML = sharedHeaderMarkup;\n  }\n  const header = document.querySelector(\".info-floating-header\");\n  if (!header || header.dataset.sharedHeaderReady === \"true\") return;\n\n  if (!document.querySelector('script[data-sama-web-push]')) {\n    const pushScript = document.createElement(\"script\");\n    pushScript.src = \"/web-push.js?v=20261110-webpush-v1\";\n    pushScript.async = true;\n    pushScript.dataset.samaWebPush = \"true\";\n    document.head.appendChild(pushScript);\n  }\n\n  // Après un vrai rechargement manuel, revenir à l’accueil pour remettre les ventes flash en évidence.\n  // Les retours de paiement, les actions demandées par lien et les autres espaces restent intacts.\n  try {\n    const navigationEntry = window.performance?.getEntriesByType?.(\"navigation\")?.[0];\n    const legacyNavigationType = window.performance?.navigation?.type;\n    const isReload = navigationEntry?.type === \"reload\" || (!navigationEntry && legacyNavigationType === 1);\n    const pathname = window.location.pathname.replace(/\\/+$/, \"\") || \"/\";\n    const storefrontPaths = new Set([\n      \"/\", \"/index.html\", \"/produits.html\", \"/outils.html\", \"/fiche-produit.html\",\n      \"/comment-ca-marche.html\", \"/conditions-vente.html\", \"/confidentialite.html\",\n      \"/contact.html\", \"/livraison-retours.html\", \"/telecharger-application.html\"\n    ]);\n    if (isReload && storefrontPaths.has(pathname)) {\n      const params = new URLSearchParams(window.location.search || \"\");\n      const returnParams = [\n        \"spAction\", \"connexion\", \"token\",\n        \"paydunya_order_id\", \"paydunya_cancelled_order_id\",\n        \"paytech_order_id\", \"paytech_cancelled_order_id\"\n      ];\n      const isSpecialReturn = returnParams.some(key => params.has(key));\n      const isHome = pathname === \"/\" || pathname === \"/index.html\";\n      if (!isSpecialReturn && (!isHome || window.location.hash)) {\n        window.location.replace(\"/\");\n        return;\n      }\n    }\n  } catch (error) {\n    console.warn(\"Réinitialisation de la page d’accueil ignorée.\", error);\n  }\n\n  header.dataset.sharedHeaderReady = \"true\";\n\n  // En-tête intelligent : compact au scroll et parallaxe légère du visuel principal.\n  const reducedMotion = window.matchMedia?.(\"(prefers-reduced-motion: reduce)\")?.matches === true;\n  const hero = document.querySelector(\"#home.hero\");\n  let scrollFramePending = false;\n  const updateScrollVisuals = () => {\n    const scrolled = window.scrollY > 24;\n    header.classList.toggle(\"is-scrolled\", scrolled);\n    if (hero && !reducedMotion && hero.classList.contains(\"has-custom-bg\")) {\n      const shift = Math.max(-34, Math.min(34, -hero.getBoundingClientRect().top * 0.075));\n      hero.style.setProperty(\"--hero-parallax-y\", shift.toFixed(1) + \"px\");\n    }\n    scrollFramePending = false;\n  };\n  const onWindowScroll = () => {\n    if (scrollFramePending) return;\n    scrollFramePending = true;\n    window.requestAnimationFrame(updateScrollVisuals);\n  };\n  window.addEventListener(\"scroll\", onWindowScroll, { passive: true });\n  updateScrollVisuals();\n\n  const shell = header.querySelector(\".mobile-menu-shell\");\n  const toggle = header.querySelector(\".mobile-menu-toggle\");\n  const menu = header.querySelector(\".mobile-nav-menu\");\n\n  const closeMenu = () => {\n    if (!shell || !toggle) return;\n    shell.classList.remove(\"is-open\");\n    menu?.querySelectorAll(\".mobile-nav-group\").forEach(group => { group.open = false; });\n    toggle.setAttribute(\"aria-expanded\", \"false\");\n    toggle.setAttribute(\"aria-label\", \"Ouvrir le menu\");\n  };\n\n  if (shell && toggle && menu) {\n    toggle.addEventListener(\"click\", event => {\n      event.preventDefault();\n      event.stopPropagation();\n      const open = !shell.classList.contains(\"is-open\");\n      shell.classList.toggle(\"is-open\", open);\n      toggle.setAttribute(\"aria-expanded\", String(open));\n      toggle.setAttribute(\"aria-label\", open ? \"Fermer le menu\" : \"Ouvrir le menu\");\n    });\n    menu.querySelectorAll(\"a, button.mobile-nav-item\").forEach(item => {\n      item.addEventListener(\"click\", closeMenu);\n    });\n    document.addEventListener(\"click\", event => {\n      if (!shell.contains(event.target)) closeMenu();\n    });\n    document.addEventListener(\"keydown\", event => {\n      if (event.key === \"Escape\") closeMenu();\n    });\n  }\n\n  const desktopMoreMenus = Array.from(header.querySelectorAll(\".desktop-nav-more\"));\n  if (desktopMoreMenus.length) {\n    desktopMoreMenus.forEach(desktopMore => {\n      desktopMore.querySelectorAll(\"a\").forEach(link => {\n        link.addEventListener(\"click\", () => { desktopMore.open = false; });\n      });\n      desktopMore.addEventListener(\"toggle\", () => {\n        if (desktopMore.open) {\n          desktopMoreMenus.forEach(other => {\n            if (other !== desktopMore) other.open = false;\n          });\n        }\n      });\n    });\n    document.addEventListener(\"click\", event => {\n      desktopMoreMenus.forEach(desktopMore => {\n        if (!desktopMore.contains(event.target)) desktopMore.open = false;\n      });\n    });\n    document.addEventListener(\"keydown\", event => {\n      if (event.key === \"Escape\") desktopMoreMenus.forEach(menu => { menu.open = false; });\n    });\n  }\n\n  const homeAction = action => {\n    const url = new URL(\"/\", window.location.origin);\n    url.searchParams.set(\"spAction\", action);\n    window.location.assign(url.pathname + url.search);\n  };\n\n  header.addEventListener(\"click\", event => {\n    const button = event.target.closest(\"[data-header-action]\");\n    if (!button || !header.contains(button)) return;\n    const action = button.dataset.headerAction;\n    const actionMap = {\n      cart: \"cart\",\n      account: \"account\",\n      notifications: \"notifications\",\n      manage: \"manage\",\n      push: \"push\"\n    };\n    const method = actionMap[action];\n    if (!method) return;\n    event.preventDefault();\n    closeMenu();\n\n    const handlers = window.SamaPackHeaderActions;\n    if (handlers && typeof handlers[method] === \"function\") {\n      handlers[method]();\n      return;\n    }\n    homeAction(method);\n  });\n})();\n";
const PWA_INSTALL_PAGE = "<!doctype html>\n<html lang=\"fr\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n  <meta name=\"theme-color\" content=\"#166534\">\n  <meta name=\"description\" content=\"Installez la boutique SAMA-PACK sur l’écran d’accueil de votre Android ou iPhone, directement depuis votre navigateur.\">\n  <meta name=\"robots\" content=\"index,follow,max-image-preview:large\">\n  <link rel=\"canonical\" href=\"https://sama-pack.store/telecharger-application.html\">\n  <meta property=\"og:type\" content=\"website\">\n  <meta property=\"og:site_name\" content=\"SAMA-PACK\">\n  <meta property=\"og:title\" content=\"Installer SAMA-PACK sur votre téléphone\">\n  <meta property=\"og:description\" content=\"Accédez à SAMA-PACK depuis l’écran d’accueil, avec l’installation PWA.\">\n  <meta property=\"og:url\" content=\"https://sama-pack.store/telecharger-application.html\">\n  <meta property=\"og:image\" content=\"https://sama-pack.store/icons/icon-512.png\">\n  <title>Installer SAMA-PACK | Android et iPhone</title>\n  <link rel=\"manifest\" href=\"/manifest.webmanifest\">\n  <link rel=\"icon\" type=\"image/png\" sizes=\"192x192\" href=\"/icons/icon-192.png\">\n  <link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/icons/apple-touch-icon.png\">\n  <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n  <meta name=\"apple-mobile-web-app-title\" content=\"SAMA-PACK\">\n  <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"default\">\n  <link rel=\"stylesheet\" href=\"styles.css?v=20261105-product-delivery-hours-v1\">\n  <link rel=\"stylesheet\" href=\"/pwa.css?v=20261111-mobile-pwa-suggestion-v1\">\n  <script src=\"header.js?v=20261111-mobile-pwa-suggestion-v1\" defer></script>\n  <script src=\"/pwa.js?v=20261111-mobile-pwa-suggestion-v1\" defer></script>\n  <style>\n    .app-download-page{padding-bottom:60px}\n    .app-download-hero{padding:58px 0 35px;background:radial-gradient(circle at 88% 5%,#d9f4e0 0,transparent 34%),linear-gradient(135deg,#f7fbf8 0,#fff 58%,#effaf2 100%)}\n    .app-download-hero-inner{max-width:850px;text-align:center}\n    .app-download-hero h1{margin:10px 0 14px;font-size:clamp(32px,5vw,52px);line-height:1.06;letter-spacing:-.04em;color:#153b27}\n    .app-download-hero p{max-width:720px;margin:0 auto;color:#52675a;font-size:16px;line-height:1.7}\n    .app-download-brand{display:inline-flex;align-items:center;gap:12px;margin-bottom:12px}\n    .app-download-brand img{width:66px;height:66px;border-radius:18px;box-shadow:0 10px 24px rgba(22,101,52,.16)}\n    .app-download-brand span{font-weight:900;font-size:17px;letter-spacing:.04em;color:#166534}\n    .app-download-wrap{width:min(960px,92vw);margin:0 auto}\n    .app-platform-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:28px}\n    .app-platform-card{display:flex;flex-direction:column;align-items:flex-start;min-width:0;padding:24px;border:1px solid #dfe9e2;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.045)}\n    .app-platform-icon{display:grid;place-items:center;width:48px;height:48px;margin-bottom:14px;border-radius:14px;background:#edf8f0;color:#166534;font-size:21px;font-weight:900}\n    .app-platform-card h2{margin:0 0 8px;font-size:22px;letter-spacing:-.025em;color:#1a3324}\n    .app-platform-card>p{margin:0 0 15px;color:#5d6e62;font-size:14px;line-height:1.65}\n    .app-download-primary{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin-top:auto;padding:12px 16px;border:0;border-radius:12px;background:#166534;color:#fff;font:inherit;font-weight:850;text-align:center;text-decoration:none}\n    .app-download-status{min-height:36px;margin:12px 0 0;color:#617366;font-size:12px;line-height:1.5}\n    .app-download-status.success{color:#17643a;font-weight:700}\n    .app-download-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}\n    .app-download-meta span{padding:6px 9px;border:1px solid #e2ece4;border-radius:999px;background:#f8fbf9;color:#627267;font-size:11px;font-weight:750}\n    .app-install-guide{margin-top:25px;padding:24px;border:1px solid #e2eae4;border-radius:18px;background:#fbfdfb}\n    .app-install-guide h2{margin:0 0 17px;font-size:22px;color:#183b27}\n    .app-guide-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}\n    .app-guide-columns h3{margin:0 0 9px;font-size:15px;color:#166534}\n    .app-guide-columns ol{margin:0;padding-left:20px;color:#516358;font-size:13px;line-height:1.8}\n    .app-download-note{margin:18px 0 0;padding:13px 15px;border-radius:12px;background:#eef8f0;color:#405b48;font-size:12px;line-height:1.65}\n    .app-download-faq{margin-top:27px}\n    .app-download-faq h2{margin:0 0 13px;color:#183b27;font-size:22px}\n    .app-download-faq details{padding:15px 17px;border:1px solid #e2eae4;border-radius:12px;background:#fff}\n    .app-download-faq details+details{margin-top:9px}\n    .app-download-faq summary{cursor:pointer;color:#264a33;font-size:14px;font-weight:800}\n    .app-download-faq details p{margin:9px 0 0;color:#5e6e63;font-size:13px;line-height:1.65}\n    @media(max-width:720px){\n      .app-download-hero{padding:37px 0 24px}\n      .app-download-hero p{font-size:14px;text-align:left}\n      .app-download-hero-inner{text-align:left}\n      .app-download-brand img{width:54px;height:54px;border-radius:15px}\n      .app-platform-grid,.app-guide-columns{grid-template-columns:1fr}\n      .app-platform-card{padding:19px}\n      .app-install-guide{padding:18px}\n    }\n  </style>\n</head>\n<body class=\"app-download-page\">\n  <div id=\"siteHeaderMount\"></div>\n  <main>\n    <section class=\"app-download-hero\">\n      <div class=\"app-download-wrap app-download-hero-inner\">\n        <div class=\"app-download-brand\">\n          <img src=\"/icons/icon-192.png\" alt=\"Icône SAMA-PACK\" width=\"66\" height=\"66\">\n          <span>SAMA-PACK</span>\n        </div>\n        <div class=\"eyebrow\">BOUTIQUE WEB INSTALLABLE</div>\n        <h1>SAMA-PACK, directement sur votre écran d’accueil.</h1>\n        <p>Installez la boutique depuis votre navigateur. Retrouvez vos produits, votre panier et vos commandes sans télécharger de fichier APK.</p>\n      </div>\n    </section>\n\n    <section class=\"app-download-wrap\">\n      <div class=\"app-platform-grid\">\n        <article class=\"app-platform-card\">\n          <div class=\"app-platform-icon\" aria-hidden=\"true\">A</div>\n          <div class=\"eyebrow\">ANDROID</div>\n          <h2>Installer depuis Chrome</h2>\n          <p>Ouvrez SAMA-PACK dans Chrome, puis utilisez la commande d’installation du navigateur pour ajouter la boutique à votre écran d’accueil.</p>\n          <a class=\"app-download-primary\" href=\"/\" aria-label=\"Ouvrir SAMA-PACK dans votre navigateur Android\">Ouvrir SAMA-PACK</a>\n          <div class=\"app-download-status success\">Installation PWA : aucun APK à télécharger.</div>\n          <div class=\"app-download-meta\"><span>Android</span><span>Installation gratuite</span></div>\n        </article>\n\n        <article class=\"app-platform-card\">\n          <div class=\"app-platform-icon\" aria-hidden=\"true\"></div>\n          <div class=\"eyebrow\">IPHONE</div>\n          <h2>Ajouter à l’écran d’accueil</h2>\n          <p>Ouvrez SAMA-PACK dans Safari et ajoutez la boutique à votre écran d’accueil. Elle s’ouvrira ensuite dans sa propre fenêtre.</p>\n          <a class=\"app-download-primary\" href=\"/\" aria-label=\"Ouvrir SAMA-PACK dans Safari\">Ouvrir SAMA-PACK</a>\n          <div class=\"app-download-status success\">Installation PWA depuis Safari, sans App Store.</div>\n          <div class=\"app-download-meta\"><span>iPhone / iPad</span><span>Installation gratuite</span></div>\n        </article>\n      </div>\n\n      <section class=\"app-install-guide\" aria-labelledby=\"appInstallGuideTitle\">\n        <h2 id=\"appInstallGuideTitle\">Comment installer SAMA-PACK ?</h2>\n        <div class=\"app-guide-columns\">\n          <div><h3>Sur Android</h3><ol>\n            <li>Ouvrez <strong>sama-pack.store</strong> dans Chrome.</li>\n            <li>Appuyez sur le menu ⋮ du navigateur.</li>\n            <li>Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».</li>\n            <li>Confirmez l’installation.</li>\n          </ol></div>\n          <div><h3>Sur iPhone</h3><ol>\n            <li>Ouvrez <strong>sama-pack.store</strong> dans Safari.</li>\n            <li>Appuyez sur le bouton Partager.</li>\n            <li>Choisissez « Sur l’écran d’accueil ».</li>\n            <li>Appuyez sur « Ajouter ».</li>\n          </ol></div>\n        </div>\n        <p class=\"app-download-note\">SAMA-PACK est une application Web progressive (PWA). Elle utilise le site officiel et ses services existants. Une connexion Internet reste nécessaire pour actualiser les prix, les stocks et les commandes.</p>\n      </section>\n\n      <section class=\"app-download-faq\" aria-labelledby=\"appDownloadFaqTitle\">\n        <h2>À savoir</h2>\n        <details><summary>Faut-il télécharger un fichier ou passer par un store ?</summary>\n          <p>Non. L’installation se fait directement depuis le navigateur. Aucun APK ni téléchargement depuis un store n’est nécessaire.</p>\n        </details>\n        <details><summary>Est-ce que mes commandes restent synchronisées ?</summary>\n          <p>Oui. La PWA utilise le même compte client et les mêmes commandes que le site SAMA-PACK.</p>\n        </details>\n        <details><summary>Les notifications fonctionnent-elles ?</summary>\n          <p>Les notifications Web dépendent du navigateur, de l’appareil et des autorisations que vous accordez. Activez-les depuis votre compte lorsque l’option est disponible.</p>\n        </details>\n      </section>\n    </section>\n  </main>\n</body>\n</html>";

function pwaAssetResponse(request, body, contentType) {
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    }
  });
}

function patchPwaAssetReferences(html) {
  return String(html)
    .replaceAll("pwa.js?v=20261106-pwa-v1", "pwa.js?v=" + PWA_ASSET_VERSION)
    .replaceAll("pwa.css?v=20261106-pwa-v1", "pwa.css?v=" + PWA_ASSET_VERSION)
    .replaceAll("header.js?v=20261110-webpush-v2", "header.js?v=" + PWA_ASSET_VERSION)
    .replaceAll("header.js?v=20261110-webpush-v1", "header.js?v=" + PWA_ASSET_VERSION);
}

async function servePatchedSiteHtml(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok || request.method === "HEAD") {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  const html = patchPwaAssetReferences(await response.text());
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
const REMOVED_ANDROID_ASSETS = new Set([
  "/downloads/SAMA-PACK.apk",
  "/downloads/SAMA-PACK.apk.sha256",
  "/downloads/version.json",
  "/.well-known/assetlinks.json"
]);

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
  });
}

function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteImageUrl(value) {
  let path = String(value || "").trim();
  if (!path) return "";
  const githubPrefix = "https://raw.githubusercontent.com/Ahmadou98/sama-pack/main/";
  if (path.startsWith(githubPrefix)) {
    path = "https://cdn.jsdelivr.net/gh/Ahmadou98/sama-pack@main/" + path.slice(githubPrefix.length);
  }
  try {
    const url = new URL(path, SITE_URL + "/");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function productImages(product) {
  const candidates = Array.isArray(product.image_paths) ? product.image_paths.slice() : [];
  if (product.image_path) candidates.push(product.image_path);
  return Array.from(new Set(candidates.map(absoluteImageUrl).filter(Boolean))).slice(0, 8);
}

function hasPromotion(product) {
  if (product.promo_active !== true || product.promo_price == null) return false;
  const now = Date.now();
  if (product.promo_started_at) {
    const start = new Date(product.promo_started_at).getTime();
    if (!Number.isFinite(start) || start > now) return false;
  }
  if (product.promo_end_at) {
    const end = new Date(product.promo_end_at).getTime();
    if (!Number.isFinite(end) || end <= now) return false;
  }
  const regular = Number(product.price);
  const special = Number(product.promo_price);
  return Number.isFinite(regular) && Number.isFinite(special) && special >= 0 && special < regular;
}

function effectivePrice(product) {
  return hasPromotion(product) ? Number(product.promo_price) : Number(product.price || 0);
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Prix à confirmer";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

function saleUnitLabel(product) {
  if (product.catalog_type === "pack") return "par pack";
  return product.sale_unit === "carton" ? "par colis" : "à l’unité";
}

function getCategory(product) {
  return cleanText(product.category) || (product.catalog_type === "pack" ? "Packs ménagers" : product.catalog_type === "tool" ? "Outils de nettoyage" : "Produits d’entretien");
}

function getDescription(product) {
  return cleanText(product.description) || ("Découvrez " + cleanText(product.name) + " chez SAMA-PACK. Consultez le prix et la disponibilité pour une commande à Dakar.");
}

function metaDescription(product) {
  const base = cleanText(product.name) + " : " + getDescription(product) + " Disponible chez SAMA-PACK à Dakar.";
  if (base.length <= 160) return base;
  return base.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

async function supabaseGet(path) {
  const response = await fetch(SUPABASE_URL + path, {
    method: "GET",
    headers: {
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Accept": "application/json"
    }
  });
  if (!response.ok) throw new Error("Supabase returned HTTP " + response.status);
  return response.json();
}

async function findPublishedProduct(ref) {
  if (!ref || ref.length > 180) return null;
  for (const column of ["id", "public_ref"]) {
    const query = new URLSearchParams();
    query.set("select", PRODUCT_COLUMNS);
    query.set("active", "eq.true");
    query.set(column, "eq." + ref);
    query.set("limit", "1");
    const rows = await supabaseGet("/rest/v1/products?" + query.toString());
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  return null;
}

function deliveryBadgeHtml(product) {
  const candidate = Number(product.max_delivery_hours);
  const hours = Number.isSafeInteger(candidate) && candidate >= 1 ? candidate : 24;
  return '<div class="product-delivery-badge" role="note" aria-label="Délai maximum de livraison : ' + hours + ' heures">' +
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
      '<path d="M2.5 5.5h9v9h-9zM11.5 8.5h3l3 3v3h-6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<circle cx="6" cy="15.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.4"></circle>' +
      '<circle cx="14.5" cy="15.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.4"></circle>' +
    '</svg><span>Livraison sous <strong>' + hours + 'h</strong></span></div>';
}

function buildProductMarkup(product, images) {
  const name = cleanText(product.name) || "Produit SAMA-PACK";
  const category = getCategory(product);
  const description = getDescription(product);
  const status = product.availability_status === "out_of_stock"
    ? "Actuellement en rupture de stock."
    : "Disponible à la commande, sous réserve de confirmation au moment de valider le panier.";
  const image = images.length
    ? '<div class="seo-product-photo-wrap"><img class="seo-product-photo" src="' + escapeHtml(images[0]) + '" alt="' + escapeHtml(name) + '" loading="eager" decoding="async" fetchpriority="high"></div>'
    : '<div class="seo-product-photo-wrap"><div class="product-placeholder">Image non disponible</div></div>';
  const items = Array.isArray(product.items) ? product.items : [];
  const itemList = items.length
    ? '<h2>Composition et caractéristiques</h2><ul class="seo-product-list">' + items.map(function (item) {
        const text = typeof item === "string" ? item : item && typeof item === "object" ? (item.name || item.label || JSON.stringify(item)) : String(item);
        return "<li>" + escapeHtml(cleanText(text)) + "</li>";
      }).join("") + "</ul>"
    : "";
  const price = effectivePrice(product);
  const priceHtml = price > 0
    ? '<div class="seo-product-price"><span class="price current-price">' + escapeHtml(money(price)) + '</span> <small class="price-unit-label">' + escapeHtml(saleUnitLabel(product)) + '</small></div>'
    : '<div class="seo-product-price">Prix à confirmer</div>';
  const reference = cleanText(product.public_ref || product.id);
  const deliveryBadge = deliveryBadgeHtml(product);
  return '<article class="seo-product-layout">' +
    image +
    '<div class="seo-product-info">' +
      '<div class="eyebrow">' + escapeHtml(category) + (reference ? " · " + escapeHtml(reference) : "") + '</div>' +
      '<h1>' + escapeHtml(name) + '</h1>' +
      '<p>' + escapeHtml(description) + '</p>' +
      '<p class="small-note">' + escapeHtml(status) + '</p>' +
      itemList +
      priceHtml +
      '<a class="btn primary" href="/#catalogue">Commander chez SAMA-PACK</a>' +
      deliveryBadge +
      '<a class="btn ghost" href="' + escapeHtml(product.catalog_type === "tool" ? "outils.html" : product.catalog_type === "product" ? "produits.html" : "/#catalogue") + '">Retour au catalogue</a>' +
    '</div>' +
  '</article>';
}

function replaceMeta(html, attribute, key, value) {
  const expression = new RegExp("<meta\\s+" + attribute + "=[\"']" + key + "[\"'][^>]*>", "i");
  const tag = '<meta ' + attribute + '="' + escapeHtml(key) + '" content="' + escapeHtml(value) + '">';
  return expression.test(html) ? html.replace(expression, tag) : html.replace("</head>", tag + "\n</head>");
}

function setPageTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escapeHtml(title) + "</title>");
}

function replaceJsonLd(html, schema) {
  const tag = '<script type="application/ld+json" id="productJsonLd">' +
    JSON.stringify(schema).replace(/</g, "\\u003c") +
    "</script>";
  const expression = /<script\b[^>]*id=["']productJsonLd["'][^>]*>[\s\S]*?<\/script>/i;
  return expression.test(html) ? html.replace(expression, tag) : html.replace("</head>", tag + "\n</head>");
}

function setHtmlResponse(assetResponse, html, cacheControl) {
  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", cacheControl || "public, max-age=60");
  headers.delete("content-length");
  return new Response(html, { status: assetResponse.status, statusText: assetResponse.statusText, headers: headers });
}

async function serveProductPage(request, env) {
  const assetResponse = await env.ASSETS.fetch(new URL("/fiche-produit.html", request.url).toString());
  if (!assetResponse.ok) return assetResponse;
  const ref = new URL(request.url).searchParams.get("ref") || "";
  let html = patchPwaAssetReferences(await assetResponse.text());
  let product = null;
  if (ref) product = await findPublishedProduct(ref);

  if (!product) {
    html = setPageTitle(html, "Article indisponible | SAMA-PACK");
    html = replaceMeta(html, "name", "description", "Consultez les produits d’entretien et les packs disponibles chez SAMA-PACK à Dakar.");
    html = replaceMeta(html, "name", "robots", "noindex,follow");
    html = replaceMeta(html, "property", "og:title", "Article indisponible | SAMA-PACK");
    html = replaceMeta(html, "property", "og:description", "Cette fiche n’est pas publiée ou la référence n’existe plus.");
    html = replaceMeta(html, "property", "og:url", request.url);
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/i, "");
    html = replaceJsonLd(html, {});
    html = html.replace("<!-- SAMA_SEO_PRODUCT_CONTENT -->", '<div class="panel"><h1>Article indisponible</h1><p>Cette fiche n’est pas publiée ou la référence n’existe plus.</p><a class="btn primary" href="/#catalogue">Voir le catalogue</a></div>');
    return setHtmlResponse(assetResponse, html, "public, max-age=30");
  }

  const canonical = SITE_URL + "/fiche-produit.html?ref=" + encodeURIComponent(product.id);
  const title = cleanText(product.name) + " | SAMA-PACK à Dakar";
  const description = metaDescription(product);
  const images = productImages(product);
  const category = getCategory(product);
  html = setPageTitle(html, title);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "name", "robots", "index,follow,max-image-preview:large");
  html = replaceMeta(html, "property", "og:type", "product");
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", canonical);
  if (images.length) html = replaceMeta(html, "property", "og:image", images[0]);
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/i, "");
  html = html.replace("</head>", '<link rel="canonical" href="' + escapeHtml(canonical) + '">\n</head>');

  const offer = {
    "@type": "Offer",
    "url": canonical,
    "priceCurrency": "XOF",
    "availability": product.availability_status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"
  };
  const price = effectivePrice(product);
  if (price > 0) offer.price = Number(price.toFixed(2));
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": cleanText(product.name),
    "description": getDescription(product),
    "sku": cleanText(product.public_ref || product.id),
    "category": category,
    "offers": offer
  };
  if (images.length) schema.image = images;
  if (cleanText(product.brand)) schema.brand = { "@type": "Brand", "name": cleanText(product.brand) };
  html = replaceJsonLd(html, schema);
  html = html.replace("<!-- SAMA_SEO_PRODUCT_CONTENT -->", buildProductMarkup(product, images));
  return setHtmlResponse(assetResponse, html, "public, max-age=60");
}

function xmlEscape(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function lastModified(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

async function fetchAllPublishedProducts() {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const query = new URLSearchParams();
    query.set("select", "id,updated_at,created_at");
    query.set("active", "eq.true");
    query.set("order", "id.asc");
    query.set("limit", String(pageSize));
    query.set("offset", String(offset));
    const rows = await supabaseGet("/rest/v1/products?" + query.toString());
    if (!Array.isArray(rows)) throw new Error("Invalid product list returned by Supabase");
    all.push.apply(all, rows);
    if (rows.length < pageSize) break;
  }
  return all.slice(0, 50000 - STATIC_PAGES.length);
}

async function serveSitemap(request, env) {
  const products = await fetchAllPublishedProducts();
  const urls = STATIC_PAGES.map(function (path) {
    return "<url><loc>" + xmlEscape(SITE_URL + path) + "</loc></url>";
  });
  products.forEach(function (product) {
    if (!product.id) return;
    const loc = SITE_URL + "/fiche-produit.html?ref=" + encodeURIComponent(product.id);
    const modified = lastModified(product.updated_at || product.created_at);
    urls.push("<url><loc>" + xmlEscape(loc) + "</loc>" + (modified ? "<lastmod>" + modified + "</lastmod>" : "") + "</url>");
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>";
  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=60",
    "x-content-type-options": "nosniff"
  });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: headers });
  return new Response(xml, { status: 200, headers: headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // URL canonique : www.sama-pack.store redirige définitivement vers sama-pack.store.
    if (url.hostname.toLowerCase() === "www.sama-pack.store") {
      url.hostname = "sama-pack.store";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/pwa.js") {
        return pwaAssetResponse(request, PWA_JS_SOURCE, "application/javascript; charset=utf-8");
      }
      if (url.pathname === "/pwa.css") {
        return pwaAssetResponse(request, PWA_CSS_SOURCE, "text/css; charset=utf-8");
      }
      if (url.pathname === "/header.js") {
        return pwaAssetResponse(request, SHARED_HEADER_SOURCE, "application/javascript; charset=utf-8");
      }
      if (url.pathname === "/telecharger-application.html") {
        return new Response(request.method === "HEAD" ? null : PWA_INSTALL_PAGE, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff"
          }
        });
      }
      if (REMOVED_ANDROID_ASSETS.has(url.pathname)) {
        return new Response(null, {
          status: 410,
          headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "x-robots-tag": "noindex"
          }
        });
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") return env.ASSETS.fetch(request);
    if (url.pathname === "/sitemap.xml") {
      try {
        return await serveSitemap(request, env);
      } catch (error) {
        console.error("SAMA-PACK dynamic sitemap failed:", error && error.message ? error.message : "unknown error");
        return env.ASSETS.fetch(request);
      }
    }
    if (url.pathname === "/fiche-produit.html") {
      try {
        if (request.method === "HEAD") {
          const response = await serveProductPage(request, env);
          return new Response(null, { status: response.status, headers: response.headers });
        }
        return await serveProductPage(request, env);
      } catch (error) {
        console.error("SAMA-PACK product SEO rendering failed:", error && error.message ? error.message : "unknown error");
        return env.ASSETS.fetch(request);
      }
    }
    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      return servePatchedSiteHtml(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
