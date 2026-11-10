(() => {
  "use strict";

  const VAPID_PUBLIC_KEY = "BKFri_3Am9t-cVejBPkoO2usGCYl0GknifBmVVU1JgmLhmmPI6O0oKTFPYTacOR-K4C4Yc9Crx8ZsAn5N3RwlIk";

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isInstalledOnHomeScreen() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function enable(client, user) {
    if (!user?.id) {
      throw new Error("Connecte-toi à ton compte SAMA-PACK avant d’activer les notifications.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("Ce navigateur ne prend pas en charge les notifications push.");
    }
    if (isIOS() && !isInstalledOnHomeScreen()) {
      throw new Error("Sur iPhone, ajoute d’abord SAMA-PACK à l’écran d’accueil depuis Safari, puis ouvre l’application et réessaie.");
    }

    // Permission is requested directly from the user's tap; Safari on iOS requires this gesture.
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Les notifications sont désactivées. Autorise-les dans les réglages de ton appareil.");
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none"
    });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(VAPID_PUBLIC_KEY)
      });
    }

    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys || {};
    if (!subscription.endpoint || !keys.p256dh || !keys.auth) {
      throw new Error("Le navigateur n’a pas fourni les informations nécessaires à l’abonnement.");
    }

    const { error } = await client.rpc("sama_register_web_push", {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent
    });
    if (error) throw new Error(error.message || "L’enregistrement de cet appareil a échoué.");

    return { ok: true, message: "Notifications activées sur cet appareil." };
  }

  window.SamaPackPush = { enable };
})();