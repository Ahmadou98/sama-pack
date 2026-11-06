(() => {
  "use strict";

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const registerWorker = () => {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      }).catch((error) => {
        console.warn("SAMA-PACK : enregistrement du mode hors connexion indisponible.", error);
      });
    };

    if (document.readyState === "complete") {
      registerWorker();
    } else {
      window.addEventListener("load", registerWorker, { once: true });
    }
  }

  if (isStandalone()) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);
  let deferredInstallPrompt = null;
  let installed = false;
  const installButtons = [];

  function hideInstallButtons() {
    installButtons.forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
    });
  }

  function buildInstructionsDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "pwa-install-dialog";
    dialog.setAttribute("aria-labelledby", "pwaInstallTitle");

    let steps;
    if (isIOS) {
      steps = [
        "Ouvrez SAMA-PACK dans Safari.",
        "Touchez le bouton Partager (le carré avec une flèche vers le haut).",
        "Choisissez « Sur l’écran d’accueil », puis « Ajouter »."
      ];
    } else if (isAndroid) {
      steps = [
        "Ouvrez SAMA-PACK dans Chrome ou dans votre navigateur.",
        "Ouvrez le menu ⋮ du navigateur.",
        "Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil », puis confirmez."
      ];
    } else {
      steps = [
        "Ouvrez le menu de votre navigateur ou l’icône d’installation dans la barre d’adresse.",
        "Choisissez « Installer SAMA-PACK » ou « Installer cette page comme application ».",
        "Confirmez l’installation."
      ];
    }

    const list = steps.map((step) => "<li>" + step + "</li>").join("");
    dialog.innerHTML =
      '<h2 id="pwaInstallTitle">Installer SAMA-PACK</h2>' +
      "<p>Retrouvez la boutique directement depuis l’écran d’accueil de votre téléphone ou de votre ordinateur.</p>" +
      "<ol>" + list + "</ol>" +
      '<p class="pwa-install-note">Une connexion Internet reste nécessaire pour consulter les stocks et les prix à jour, se connecter et valider une commande.</p>' +
      '<button class="pwa-install-close" type="button">Compris</button>';

    dialog.querySelector(".pwa-install-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openInstructions() {
    let dialog = document.querySelector(".pwa-install-dialog");
    if (!dialog) dialog = buildInstructionsDialog();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function createInstallButton(label, className, mobile) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("data-pwa-install", "true");
    button.setAttribute("aria-label", "Installer l’application SAMA-PACK");
    if (mobile) {
      button.innerHTML = '<span aria-hidden="true">↓</span><small>' + label + "</small>";
    } else {
      button.textContent = label;
    }

    button.addEventListener("click", async () => {
      if (installed || isStandalone()) return;

      if (deferredInstallPrompt) {
        const promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        try {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice && choice.outcome === "accepted") {
            installed = true;
            hideInstallButtons();
            return;
          }
        } catch (error) {
          console.warn("SAMA-PACK : la demande d’installation n’a pas abouti.", error);
        }
      }

      openInstructions();
    });

    return button;
  }

  function mountInstallButtons() {
    const header = document.querySelector(".info-floating-header");
    if (!header) return;

    const actions = header.querySelector(".nav-actions");
    const mobileMenu = header.querySelector("#infoFloatingMenu");

    if (actions && !actions.querySelector("[data-pwa-install]")) {
      const desktopButton = createInstallButton(
        "Installer",
        "btn small ghost pwa-install-desktop",
        false
      );
      const menuShell = actions.querySelector(".mobile-menu-shell");
      actions.insertBefore(desktopButton, menuShell || null);
      installButtons.push(desktopButton);
    }

    if (mobileMenu && !mobileMenu.querySelector("[data-pwa-install]")) {
      const mobileButton = createInstallButton(
        "Installer SAMA-PACK",
        "mobile-nav-item pwa-install-mobile",
        true
      );
      const manageButton = mobileMenu.querySelector("#mobileManageBtn");
      mobileMenu.insertBefore(mobileButton, manageButton || null);
      installButtons.push(mobileButton);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountInstallButtons, { once: true });
  } else {
    mountInstallButtons();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    hideInstallButtons();
  });
})();