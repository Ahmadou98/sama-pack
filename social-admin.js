(() => {
  "use strict";

  const PROVIDERS = [
    { key: "facebook", label: "Facebook", short: "f" },
    { key: "instagram", label: "Instagram", short: "ig" },
    { key: "tiktok", label: "TikTok", short: "tt" },
    { key: "linkedin", label: "LinkedIn", short: "in" },
    { key: "youtube", label: "YouTube", short: "yt" }
  ];
  const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map(item => [item.key, item]));
  const STATUS_LABELS = {
    draft: "Brouillon",
    pending_approval: "En attente de validation",
    scheduled: "Programmation enregistrée",
    publishing: "En cours",
    published: "Publiée",
    partially_published: "Partiellement publiée",
    failed: "Échec",
    cancelled: "Annulée"
  };
  const TARGET_STATUS_LABELS = {
    awaiting_connection: "Compte à connecter",
    draft: "Brouillon",
    scheduled: "Programmée",
    manual_required: "Action manuelle requise",
    publishing: "En cours de publication",
    published: "Publiée",
    failed: "Échec",
    cancelled: "Annulée"
  };
  const ALLOWED_MEDIA_TYPES = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime"
  ]);
  const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[char]);
  }

  function dakarParts(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dakar", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  }

  function dakarDayStart(offsetDays = 0) {
    const parts = dakarParts();
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays));
    return date;
  }

  function dayKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function dayHeading(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Africa/Dakar", weekday: "short", day: "numeric", month: "short"
    }).format(date);
  }

  function dateLabel(value) {
    if (!value) return "Non programmée";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date invalide";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Africa/Dakar", dateStyle: "medium", timeStyle: "short"
    }).format(date);
  }

  function timeLabel(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Africa/Dakar", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  }

  function localInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dakar",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value || "";
    return get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute");
  }

  function inputToIso(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error("La date de programmation n’est pas valide.");
    return new Date(Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5])
    )).toISOString();
  }

  function statusMarkup(status) {
    const label = STATUS_LABELS[status] || status || "Inconnu";
    const css = status === "published" ? "is-success"
      : status === "failed" ? "is-danger"
      : status === "pending_approval" ? "is-warning"
      : status === "scheduled" ? "is-info" : "";
    return '<span class="social-status ' + css + '">' + esc(label) + "</span>";
  }

  function providerMarkup(provider, mode) {
    const item = PROVIDER_BY_KEY[provider];
    if (!item) return "";
    const manualOnly = provider === "tiktok";
    const selectedMode = manualOnly ? "manual" : mode;
    const choices = manualOnly
      ? '<option value="automatic" disabled>Automatique indisponible</option><option value="approval" disabled>Validation automatique indisponible</option><option value="manual" selected>Publication manuelle</option>'
      : '<option value="automatic"' + (selectedMode === "automatic" ? " selected" : "") + '>Automatique</option>' +
        '<option value="approval"' + (!selectedMode || selectedMode === "approval" ? " selected" : "") + '>Après validation</option>' +
        '<option value="manual"' + (selectedMode === "manual" ? " selected" : "") + '>Manuelle</option>';
    return '<label class="social-provider-option">' +
      '<span class="social-provider-main"><input type="checkbox" name="provider" value="' + item.key + '" checked>' +
      '<span class="social-provider-mark social-provider-' + item.key + '">' + esc(item.short) + '</span>' +
      '<span class="social-provider-name">' + esc(item.label) + '</span></span>' +
      '<select class="input social-mode-select" name="mode_' + item.key + '" aria-label="Mode de publication pour ' + esc(item.label) + '">' +
      choices + '</select></label>' +
      (manualOnly ? '<small class="social-muted">Copier le texte, publier dans TikTok, puis confirmer le lien.</small>' : '');
  }

  function groupTargets(targets) {
    const result = new Map();
    (targets || []).forEach(target => {
      const list = result.get(target.post_id) || [];
      list.push(target);
      result.set(target.post_id, list);
    });
    return result;
  }

  function renderAccounts(accounts, ctx) {
    const byProvider = new Map();
    (accounts || []).forEach(account => {
      const list = byProvider.get(account.provider) || [];
      list.push(account);
      byProvider.set(account.provider, list);
    });
    return PROVIDERS.map(provider => {
      const connected = byProvider.get(provider.key) || [];
      const active = connected.filter(account => account.status === "connected");
      const description = connected.length
        ? connected.map(account =>
            '<span class="social-account-name">' + esc(account.account_name || account.username || "Compte connecté") + '</span>' +
            (account.status === "connected"
              ? (ctx.canManageAccounts ? '<button class="social-disconnect-button" type="button" data-social-disconnect="' + esc(account.id) + '">Déconnecter</button>' : '')
              : '<small class="social-muted">Connexion à renouveler</small>')
          ).join("")
        : '<span class="social-account-empty">Aucun compte connecté</span>';
      const isManualOnly = provider.key === "tiktok";
      const readiness = ctx.providerConfig?.[provider.key] || null;
      const configured = readiness?.ready === true;
      const missing = Array.isArray(readiness?.missing) ? readiness.missing : [];
      const badge = active.length
        ? '<span class="social-status is-success">' + active.length + ' connecté(s)</span>'
        : isManualOnly
          ? '<span class="social-status is-warning">Publication manuelle</span>'
          : configured
            ? '<span class="social-status">Prêt à connecter</span>'
            : '<span class="social-status is-warning">OAuth à configurer</span>';
      const connect = ctx.canManageAccounts && !isManualOnly
        ? '<button class="btn small secondary social-connect-button" type="button" data-social-connect="' + provider.key + '"' +
          (configured ? '' : ' disabled title="' + esc(missing.length ? 'Secrets manquants : ' + missing.join(', ') : 'Vérification de configuration indisponible') + '"') + '>' +
          (configured ? (active.length ? 'Ajouter un compte' : 'Connecter') : 'Configuration requise') + '</button>' +
          (!configured ? '<small class="social-muted">Secrets serveur manquants : ' + esc(missing.join(', ') || 'configuration non vérifiée') + '</small>' : '')
        : '';
      const descriptionText = isManualOnly
        ? "Publication manuelle : TikTok ne sera pas automatisé depuis cet outil interne."
        : provider.key === "youtube" ? "Chaînes et téléversement vidéo."
        : provider.key === "linkedin" ? "Profil membre ou page autorisée."
        : "Pages et comptes professionnels.";
      return '<article class="social-account-card">' +
        '<div class="social-account-card-top"><span class="social-provider-mark social-provider-' + provider.key + '">' + esc(provider.short) + '</span>' + badge + '</div>' +
        '<strong>' + esc(provider.label) + '</strong>' + description +
        '<small class="social-muted">' + descriptionText + '</small>' +
        connect +
        '</article>';
    }).join("");
  }

  function renderCalendar(posts) {
    const scheduled = (posts || []).filter(post => post.scheduled_at && !["cancelled", "published"].includes(post.status));
    const byDate = new Map();
    scheduled.forEach(post => {
      const key = dayKey(new Date(post.scheduled_at));
      const list = byDate.get(key) || [];
      list.push(post);
      byDate.set(key, list);
    });
    const days = Array.from({ length: 14 }, (_, index) => dakarDayStart(index));
    return '<div class="social-calendar-grid">' + days.map(date => {
      const key = dayKey(date);
      const items = (byDate.get(key) || []).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      return '<article class="social-calendar-day"><div class="social-calendar-date">' + esc(dayHeading(date)) +
        '<strong>' + items.length + '</strong></div>' +
        (items.length ? items.map(post => '<div class="social-calendar-event"><time>' + esc(timeLabel(post.scheduled_at)) +
          '</time><span>' + esc(post.title) + '</span></div>').join("") :
          '<span class="social-calendar-empty">Aucune publication</span>') +
        '</article>';
    }).join("") + '</div>';
  }

  function renderPlatformActivity(targets) {
    const rows = PROVIDERS.map(provider => {
      const matching = (targets || []).filter(target => target.provider === provider.key);
      const published = matching.filter(target => target.status === "published").length;
      const failed = matching.filter(target => target.status === "failed").length;
      const pending = matching.filter(target => ["scheduled", "publishing", "manual_required", "awaiting_connection", "draft"].includes(target.status)).length;
      return '<article class="social-platform-activity"><div class="social-platform-activity-name"><span class="social-provider-mark social-provider-' + provider.key + '">' + esc(provider.short) + '</span><strong>' + esc(provider.label) + '</strong></div><div class="social-platform-activity-counts"><span><strong>' + published + '</strong> publiées</span><span><strong>' + pending + '</strong> en attente</span><span><strong>' + failed + '</strong> échecs</span></div></article>';
    }).join("");
    return '<div class="social-platform-activity-list">' + rows + '</div>';
  }

  function renderPostRows(posts, targetsByPost, canManage, canPublish) {
    if (!posts.length) {
      return '<div class="social-empty-state"><span class="social-empty-icon">✎</span><h3>Aucune publication enregistrée</h3><p>Prépare le premier contenu de SAMA-PACK et choisis les réseaux à cibler.</p></div>';
    }
    return posts.map(post => {
      const targets = targetsByPost.get(post.id) || [];
      const channels = targets.map(target => {
        const provider = PROVIDER_BY_KEY[target.provider];
        const label = provider ? provider.label : target.provider;
        const targetStatus = TARGET_STATUS_LABELS[target.status] || target.status;
        return '<span class="social-channel-chip" title="' + esc(target.error_message || target.permalink || "") + '">' +
          esc(label) + '<small>' + esc(targetStatus) + '</small>' +
          (target.error_message ? '<small class="social-channel-error">' + esc(target.error_message) + '</small>' : '') +
          (target.permalink ? '<a href="' + esc(target.permalink) + '" target="_blank" rel="noopener noreferrer">Voir</a>' : '') +
          '</span>';
      }).join("");
      const media = post.media_asset_id ? '<span class="social-media-indicator">Média joint</span>' : "";
      let actions = "";
      if (post.status === "pending_approval" && canPublish) {
        actions += '<button class="btn small primary" type="button" data-social-approve="' + esc(post.id) + '">Valider</button>';
      }
      if (canPublish && targets.some(target => target.status === "failed")) {
        actions += '<button class="btn small secondary" type="button" data-social-retry="' + esc(post.id) + '">Réessayer</button>';
      }
      const manualTargetsReady = targets.filter(target =>
        target.status === "manual_required" &&
        (!post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now())
      );
      if (canManage) {
        manualTargetsReady.forEach(target => {
          const provider = PROVIDER_BY_KEY[target.provider];
          if (!provider) return;
          actions += '<button class="btn small ghost" type="button" data-social-copy-manual="' + esc(target.id) + '">Copier ' + esc(provider.label) + '</button>' +
            '<button class="btn small secondary" type="button" data-social-open-manual="' + esc(target.id) + '">Ouvrir ' + esc(provider.label) + '</button>';
          if (canPublish) {
            actions += '<button class="btn small primary" type="button" data-social-confirm-manual="' + esc(target.id) + '">Confirmer</button>';
          }
        });
      }
      if (canManage && !["published", "publishing", "partially_published"].includes(post.status)) {
        actions += '<button class="btn small ghost" type="button" data-social-edit="' + esc(post.id) + '">Modifier</button>' +
          '<button class="btn small danger" type="button" data-social-delete="' + esc(post.id) + '">Supprimer</button>';
      }
      return '<article class="social-post-card">' +
        '<div class="social-post-copy"><div class="social-post-title-line"><h4>' + esc(post.title || "Publication sans titre") + '</h4>' + statusMarkup(post.status) + '</div>' +
        '<p>' + esc(post.body || "") + '</p><div class="social-post-meta"><span>' + esc(dateLabel(post.scheduled_at)) + '</span>' + media + '</div>' +
        '<div class="social-channel-list">' + (channels || '<span class="social-muted">Aucune plateforme sélectionnée</span>') + '</div></div>' +
        '<div class="social-post-actions">' + actions + '</div></article>';
    }).join("");
  }

  async function loadData(client) {
    const [accountsResult, postsResult] = await Promise.all([
      client.from("social_accounts")
        .select("id,provider,provider_account_id,account_name,username,profile_url,avatar_url,status,scopes,token_expires_at,connected_at,created_at")
        .order("provider", { ascending: true }),
      client.from("social_posts")
        .select("id,title,body,status,scheduled_at,media_asset_id,created_by,approved_by,approved_at,created_at,updated_at")
        .order("created_at", { ascending: false }).limit(100)
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (postsResult.error) throw postsResult.error;
    const posts = postsResult.data || [];
    const ids = posts.map(post => post.id);
    let targets = [];
    if (ids.length) {
      const targetResult = await client.from("social_post_targets")
        .select("id,post_id,provider,social_account_id,publication_mode,status,scheduled_at,published_at,permalink,error_message,platform_post_id,provider_options,caption")
        .in("post_id", ids);
      if (targetResult.error) throw targetResult.error;
      targets = targetResult.data || [];
    }
    return {
      accounts: accountsResult.data || [],
      posts,
      targets,
      targetsByPost: groupTargets(targets)
    };
  }

  async function uploadMedia(client, userId, file) {
    if (!file) return null;
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      throw new Error("Format média non pris en charge. Utilise JPG, PNG, WebP, GIF, MP4 ou MOV.");
    }
    if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) {
      throw new Error("Le fichier doit peser moins de 100 Mo.");
    }
    const safeName = file.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "media";
    const path = userId + "/" + crypto.randomUUID() + "-" + safeName;
    const bucket = client.storage.from("sama-social-media");
    const upload = await bucket.upload(path, file, {
      cacheControl: "3600", contentType: file.type, upsert: false
    });
    if (upload.error) throw upload.error;
    const asset = await client.from("social_media_assets").insert({
      storage_path: path,
      original_name: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: userId
    }).select("id").single();
    if (asset.error) {
      await bucket.remove([path]);
      throw asset.error;
    }
    return asset.data.id;
  }

  function buildMarkup(data, ctx) {
    const canManage = Boolean(ctx.canManage);
    const canPublish = Boolean(ctx.canPublish);
    const connectedCount = data.accounts.filter(account => account.status === "connected").length;
    const draftCount = data.posts.filter(post => post.status === "draft").length;
    const approvalCount = data.posts.filter(post => post.status === "pending_approval").length;
    const scheduledCount = data.posts.filter(post => ["scheduled", "partially_published"].includes(post.status)).length;
    const publishedCount = data.targets.filter(target => target.status === "published").length;
    const composer = canManage
      ? '<section class="panel social-composer-panel"><div class="social-section-heading"><div><span class="eyebrow">STUDIO DE CONTENU</span><h3 id="socialComposerTitle">Préparer une publication</h3><p>Rédige une fois, puis choisis le mode de diffusion pour chaque réseau.</p></div><span class="social-step-number">01</span></div>' +
        '<form id="socialPostForm" class="social-post-form">' +
        '<label class="social-field full">Nom interne<input class="input" name="title" maxlength="160" required placeholder="Ex. Offre Grand Ménage de novembre"></label>' +
        '<label class="social-field full">Texte de la publication<textarea class="input" name="body" maxlength="5000" rows="5" required placeholder="Rédige le message de SAMA-PACK…"></textarea><small>Le texte commun sert de base à chaque plateforme. Les adaptations spécifiques seront ajoutées ensuite.</small></label>' +
        '<div class="social-form-section full"><div class="social-form-section-title"><strong>Plateformes ciblées</strong><span>Choisis les réseaux à utiliser et leur mode.</span></div><div class="social-provider-grid">' +
        PROVIDERS.map(provider => providerMarkup(provider.key, "approval")).join("") +
        '</div></div>' +
        '<details class="social-caption-adaptations full"><summary>Adapter le texte pour chaque réseau (facultatif)</summary><div class="social-caption-grid">' +
        PROVIDERS.map(provider => '<label class="social-field">' + esc(provider.label) + '<textarea class="input" name="caption_' + provider.key + '" rows="3" maxlength="5000" placeholder="Laisser vide pour utiliser le texte commun."></textarea></label>').join("") +
        '</div></details>' +
        '<label class="social-field">Date et heure souhaitées<input class="input" name="scheduled_at" type="datetime-local" min="' + esc(localInputValue(new Date()).slice(0, 16)) + '"><small>Heure de Dakar (UTC+0).</small></label>' +
        '<label class="social-field">Photo ou vidéo<input class="input" name="media" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"><small>Image ou vidéo, 100 Mo maximum.</small></label>' +
        '<label class="social-field">Visibilité YouTube<select class="input" name="youtube_privacy"><option value="public">Publique</option><option value="unlisted">Non répertoriée</option><option value="private">Privée</option></select><small>YouTube ne reçoit que des vidéos par cette API.</small></label>' +
        '<div class="social-composer-notice full"><strong>Avant l’envoi :</strong> chaque réseau doit être connecté avec ses autorisations officielles. Les publications automatiques ne sont lancées qu’après validation et à la date prévue. Les formats non pris en charge restent à publier manuellement.</div>' +
        '<div class="social-form-actions full"><button class="btn primary" type="submit" id="socialSavePostBtn">Enregistrer le contenu</button><button class="btn ghost" type="button" id="socialResetPostBtn">Effacer</button><span id="socialFormFeedback" role="status" aria-live="polite"></span></div>' +
        '</form></section>'
      : '<section class="panel social-composer-panel"><div class="social-section-heading"><div><span class="eyebrow">STUDIO DE CONTENU</span><h3>Accès en consultation</h3><p>La création et les modifications nécessitent une permission spécifique.</p></div></div></section>';

    return '<div class="social-admin">' +
      '<div id="socialOauthFeedback" class="social-api-notice social-feedback-notice" hidden role="status" aria-live="polite"></div>' +
      '<section class="social-welcome"><div><span class="eyebrow">MARKETING & COMMUNICATION</span><h2>Réseaux sociaux SAMA-PACK</h2><p>Centralise les contenus, le calendrier et les comptes officiels de la marque.</p></div><div class="social-welcome-mark" aria-hidden="true">SP</div></section>' +
      '<section class="social-stat-grid">' +
      '<article class="social-stat-card"><span>Comptes connectés</span><strong>' + connectedCount + '<small> / 5 réseaux</small></strong></article>' +
      '<article class="social-stat-card"><span>Brouillons</span><strong>' + draftCount + '</strong></article>' +
      '<article class="social-stat-card"><span>À valider</span><strong>' + approvalCount + '</strong></article>' +
      '<article class="social-stat-card"><span>Programmations</span><strong>' + scheduledCount + '</strong></article>' +
      '<article class="social-stat-card"><span>Publications confirmées</span><strong>' + publishedCount + '</strong></article>' +
      '</section>' +
      '<section class="social-api-notice"><span class="social-notice-icon" aria-hidden="true">i</span><div><strong>Publication sécurisée et contrôlée</strong><p>Les autorisations OAuth sont vérifiées pour chaque réseau. Les jetons sont conservés chiffrés côté serveur. Les comptes, programmations et résultats ne sont marqués comme connectés ou publiés qu’après confirmation de la plateforme.</p></div></section>' +
      '<section class="social-section"><div class="social-section-heading"><div><span class="eyebrow">COMPTES OFFICIELS</span><h3>Plateformes connectées</h3><p>Connecte les comptes après configuration des identifiants développeur requis.</p></div><span class="social-step-number">02</span></div><div class="social-account-grid">' +
      renderAccounts(data.accounts, ctx) +
      '</div></section>' +
      composer +
      '<section class="social-section"><div class="social-section-heading"><div><span class="eyebrow">CALENDRIER ÉDITORIAL</span><h3>Les 14 prochains jours</h3><p>Programmations enregistrées dans Social Desk, en heure de Dakar.</p></div><div class="social-calendar-actions">' +
      (canPublish ? '<button class="btn small primary" type="button" id="socialRunDueBtn">Exécuter les publications dues</button>' : '') +
      '<span class="social-step-number">03</span></div></div>' +
      renderCalendar(data.posts) + '</section>' +
      '<section class="social-section"><div class="social-section-heading"><div><span class="eyebrow">ACTIVITÉ PAR PLATEFORME</span><h3>Publications confirmées</h3><p>Nombre de publications confirmées par la plateforme ; les vues, commentaires et interactions dépendront des permissions Analytics disponibles.</p></div><span class="social-step-number">04</span></div>' +
      renderPlatformActivity(data.targets) + '</section>' +
      '<section class="social-section"><div class="social-section-heading"><div><span class="eyebrow">SUIVI ÉDITORIAL</span><h3>Publications récentes</h3><p>Derniers contenus enregistrés dans l’espace SAMA-PACK.</p></div><span class="social-step-number">05</span></div>' +
      '<div id="socialPostsList" class="social-post-list">' + renderPostRows(data.posts, data.targetsByPost, canManage, canPublish) + '</div></section>' +
      '<p class="social-security-footnote">Les jetons OAuth ne seront jamais accessibles dans le navigateur. Ils seront stockés chiffrés côté serveur lors de l’intégration des connexions.</p>' +
      '</div>';
  }

  async function loadProviderConfiguration(ctx) {
    if (!ctx.canManageAccounts) return {};
    try {
      const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
        body: { action: "configuration" }
      });
      if (error || data?.ok !== true || !data.providers) return {};
      return data.providers;
    } catch (error) {
      console.warn("Social Desk OAuth configuration is not readable yet.", error);
      return {};
    }
  }

  async function mount(ctx) {
    const root = ctx && ctx.root;
    if (!root || !ctx.client) return;
    if (!ctx.canView) {
      root.innerHTML = '<div class="panel"><h3>Accès refusé</h3><p>Tu ne disposes pas de la permission nécessaire pour consulter les réseaux sociaux.</p></div>';
      return;
    }
    root.innerHTML = '<div class="panel social-loading"><span class="admin-loading-spinner" aria-hidden="true"></span><p>Chargement de la gestion des réseaux sociaux…</p></div>';
    try {
      const [data, providerConfig] = await Promise.all([
        loadData(ctx.client),
        loadProviderConfiguration(ctx)
      ]);
      ctx.data = data;
      ctx.providerConfig = providerConfig;
      root.innerHTML = buildMarkup(data, ctx);
      bind(root, ctx);
      const url = new URL(window.location.href);
      const socialStatus = url.searchParams.get("social");
      if (socialStatus) {
        const feedback = root.querySelector("#socialOauthFeedback");
        const provider = url.searchParams.get("provider") || "";
        const count = url.searchParams.get("count") || "";
        const reason = url.searchParams.get("reason") || "";
        if (feedback) {
          feedback.hidden = false;
          if (socialStatus === "connected") {
            feedback.innerHTML = '<span class="social-notice-icon" aria-hidden="true">✓</span><div><strong>Compte(s) relié(s)</strong><p>' +
              esc(provider.toUpperCase()) + ' · ' + esc(count || "Connexion") + ' compte(s) enregistré(s). Tu peux maintenant préparer les publications compatibles.</p></div>';
        } else {
            feedback.innerHTML = '<span class="social-notice-icon" aria-hidden="true">!</span><div><strong>Connexion non terminée</strong><p>' +
              esc(reason || "La plateforme n’a pas autorisé la connexion. Vérifie les paramètres OAuth et réessaie.") + '</p></div>';
          }
        }
        ["social","provider","count","reason"].forEach(key => url.searchParams.delete(key));
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    } catch (error) {
      console.error("SAMA-PACK social admin failed:", error);
      root.innerHTML = '<div class="panel social-error"><h3>Module réseaux sociaux indisponible</h3><p>' +
        esc(error && error.message ? error.message : "La base de données n’a pas répondu.") +
        '</p><p class="small-note">Vérifie que la migration sociale a été appliquée et que les permissions du compte sont actives.</p><button class="btn ghost" type="button" id="socialRetryBtn">Réessayer</button></div>';
      root.querySelector("#socialRetryBtn")?.addEventListener("click", () => mount(ctx));
    }
  }

  function setFeedback(root, message, isError) {
    const output = root.querySelector("#socialFormFeedback");
    if (!output) return;
    output.textContent = message;
    output.classList.toggle("is-error", Boolean(isError));
    output.classList.toggle("is-success", !isError && Boolean(message));
  }

  function resetComposer(root) {
    const form = root.querySelector("#socialPostForm");
    if (!form) return;
    form.reset();
    delete form.dataset.postId;
    form.querySelectorAll('input[name="provider"]').forEach(input => { input.checked = true; });
    form.querySelectorAll(".social-mode-select").forEach(select => { select.value = select.name === "mode_tiktok" ? "manual" : "approval"; });
    const heading = root.querySelector("#socialComposerTitle");
    if (heading) heading.textContent = "Préparer une publication";
    const save = root.querySelector("#socialSavePostBtn");
    if (save) save.textContent = "Enregistrer le contenu";
    setFeedback(root, "", false);
  }

  async function savePost(ctx, form) {
    if (!ctx.canManage) throw new Error("La permission de création de contenus est requise.");
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const body = String(formData.get("body") || "").trim();
    const providers = [...form.querySelectorAll('input[name="provider"]:checked')].map(input => input.value);
    const scheduledAt = inputToIso(String(formData.get("scheduled_at") || ""));
    const file = formData.get("media");
    if (!title || title.length > 160) throw new Error("Le nom interne doit contenir entre 1 et 160 caractères.");
    if (!body || body.length > 5000) throw new Error("Le texte doit contenir entre 1 et 5 000 caractères.");
    if (!providers.length) throw new Error("Choisis au moins une plateforme.");
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) throw new Error("Choisis une date et une heure futures.");

    const selectedModes = {};
    providers.forEach(provider => {
      const select = form.querySelector('[name="mode_' + provider + '"]');
      const mode = select ? select.value : "approval";
      if (!["automatic", "approval", "manual"].includes(mode)) throw new Error("Mode de publication invalide.");
      selectedModes[provider] = mode;
    });

    const existingId = form.dataset.postId || "";
    const existing = existingId ? ctx.data.posts.find(post => post.id === existingId) : null;
    if (existingId && !existing) throw new Error("Cette publication n’existe plus. Actualise le module.");
    let mediaAssetId = existing?.media_asset_id || null;
    if (file instanceof File && file.size > 0) {
      mediaAssetId = await uploadMedia(ctx.client, ctx.currentUser.id, file);
    }

    const requiresApproval = scheduledAt && providers.some(provider => selectedModes[provider] === "approval");
    const postStatus = scheduledAt
      ? (requiresApproval ? "pending_approval" : "scheduled")
      : "draft";
    const payload = {
      title,
      body,
      status: postStatus,
      scheduled_at: scheduledAt,
      media_asset_id: mediaAssetId,
      updated_at: new Date().toISOString()
    };

    let postId = existingId;
    if (existingId) {
      const updated = await ctx.client.from("social_posts").update(payload).eq("id", existingId);
      if (updated.error) throw updated.error;
    } else {
      const inserted = await ctx.client.from("social_posts").insert({
        ...payload,
        created_by: ctx.currentUser.id
      }).select("id").single();
      if (inserted.error) throw inserted.error;
      postId = inserted.data.id;
    }

    const oldTargets = ctx.data.targets.filter(target => target.post_id === postId);
    const oldByProvider = new Map(oldTargets.map(target => [target.provider, target]));
    for (const provider of providers) {
      const account = ctx.data.accounts.find(item => item.provider === provider && item.status === "connected") || null;
      const targetPayload = {
        post_id: postId,
        provider,
        social_account_id: account?.id || null,
        caption: String(formData.get("caption_" + provider) || "").trim() || body,
        publication_mode: provider === "tiktok" ? "manual" : selectedModes[provider],
        status: provider === "tiktok" || selectedModes[provider] === "manual" ? "manual_required"
          : !account ? "awaiting_connection"
          : scheduledAt ? "scheduled" : "draft",
        scheduled_at: scheduledAt,
        provider_options: provider === "youtube"
          ? { privacy_status: String(formData.get("youtube_privacy") || "public") }
          : {},
        updated_at: new Date().toISOString()
      };
      const old = oldByProvider.get(provider);
      const result = old
        ? await ctx.client.from("social_post_targets").update(targetPayload).eq("id", old.id)
        : await ctx.client.from("social_post_targets").insert(targetPayload);
      if (result.error) throw result.error;
      oldByProvider.delete(provider);
    }
    for (const old of oldByProvider.values()) {
      const removed = await ctx.client.from("social_post_targets").delete().eq("id", old.id);
      if (removed.error) throw removed.error;
    }
    return { status: postStatus, scheduledAt };
  }

  async function approvePost(ctx, postId) {
    if (!ctx.canPublish) throw new Error("La permission de validation est requise.");
    const result = await ctx.client.rpc("sama_approve_social_post", { p_post_id: postId });
    if (result.error) throw result.error;
    if (!result.data?.ok) throw new Error(result.data?.message || "La programmation n’a pas été validée.");
  }

  async function refresh(ctx, root) {
    const data = await loadData(ctx.client);
    ctx.data = data;
    root.innerHTML = buildMarkup(data, ctx);
    bind(root, ctx);
  }

  function bind(root, ctx) {
    root.querySelectorAll("[data-social-connect]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canManageAccounts) return;
        const provider = button.dataset.socialConnect;
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = "Connexion…";
        try {
          const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
            body: { action: "connect", provider }
          });
          if (error || !data?.authorization_url) throw new Error(data?.error || error?.message || "Impossible d'ouvrir la connexion OAuth.");
          window.location.assign(data.authorization_url);
        } catch (error) {
          button.disabled = false;
          button.textContent = oldText;
          window.alert(error && error.message ? error.message : "Connexion impossible.");
        }
      });
    });

    root.querySelectorAll("[data-social-disconnect]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canManageAccounts) return;
        if (!window.confirm("Déconnecter ce compte social ? Les publications déjà enregistrées seront conservées.")) return;
        button.disabled = true;
        try {
          const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
            body: { action: "disconnect", account_id: button.dataset.socialDisconnect }
          });
          if (error || !data?.ok) throw new Error(data?.error || error?.message || "Déconnexion impossible.");
          await refresh(ctx, root);
        } catch (error) {
          button.disabled = false;
          window.alert(error && error.message ? error.message : "Déconnexion impossible.");
        }
      });
    });

    const runDueButton = root.querySelector("#socialRunDueBtn");
    if (runDueButton && ctx.canPublish) {
      runDueButton.addEventListener("click", async () => {
        if (!window.confirm("Lancer maintenant les publications dont la date est arrivée et qui sont validées ? Cette action peut publier publiquement sur les comptes connectés.")) return;
        runDueButton.disabled = true;
        runDueButton.textContent = "Publication en cours…";
        try {
          const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
            body: { action: "run_due" }
          });
          if (error || !data) throw new Error(data?.error || error?.message || "Le moteur de publication n'a pas répondu.");
          await refresh(ctx, root);
          const feedback = root.querySelector("#socialOauthFeedback");
          if (feedback) {
            feedback.hidden = false;
            feedback.innerHTML = '<span class="social-notice-icon" aria-hidden="true">✓</span><div><strong>Traitement terminé</strong><p>' +
              Number(data.published || 0) + ' publiée(s), ' + Number(data.processing || 0) +
              ' en cours, ' + Number(data.failed || 0) + ' en échec. Les détails sont visibles sur chaque réseau.</p></div>';
          }
        } catch (error) {
          runDueButton.disabled = false;
          runDueButton.textContent = "Réessayer les publications dues";
          window.alert(error && error.message ? error.message : "Exécution impossible.");
        }
      });
    }

    const form = root.querySelector("#socialPostForm");
    if (form) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const button = root.querySelector("#socialSavePostBtn");
        if (button) { button.disabled = true; button.textContent = "Enregistrement…"; }
        setFeedback(root, "", false);
        try {
          const result = await savePost(ctx, form);
          const message = result.status === "pending_approval"
            ? "Contenu enregistré. Il attend la validation du responsable."
            : result.scheduledAt
              ? "Programmation éditoriale enregistrée. Aucun réseau n’a encore reçu la publication."
              : "Brouillon enregistré.";
          await refresh(ctx, root);
          const newFeedback = root.querySelector("#socialFormFeedback");
          if (newFeedback) newFeedback.textContent = message;
        } catch (error) {
          setFeedback(root, error && error.message ? error.message : "Enregistrement impossible.", true);
          if (button) { button.disabled = false; button.textContent = form.dataset.postId ? "Enregistrer les modifications" : "Enregistrer le contenu"; }
        }
      });
      root.querySelector("#socialResetPostBtn")?.addEventListener("click", () => resetComposer(root));
    }

    root.querySelectorAll("[data-social-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const post = ctx.data.posts.find(item => item.id === button.dataset.socialEdit);
        const editForm = root.querySelector("#socialPostForm");
        if (!post || !editForm) return;
        const targets = ctx.data.targets.filter(item => item.post_id === post.id);
        editForm.dataset.postId = post.id;
        editForm.elements.title.value = post.title || "";
        editForm.elements.body.value = post.body || "";
        targets.forEach(target => {
          const caption = editForm.querySelector('[name="caption_' + target.provider + '"]');
          if (caption) caption.value = target.caption || "";
        });
        editForm.elements.scheduled_at.value = localInputValue(post.scheduled_at);
        editForm.elements.youtube_privacy.value = String(targets.find(item => item.provider === "youtube")?.provider_options?.privacy_status || "public");
        editForm.querySelectorAll('input[name="provider"]').forEach(input => {
          const target = targets.find(item => item.provider === input.value);
          input.checked = Boolean(target);
          const mode = editForm.querySelector('[name="mode_' + input.value + '"]');
          if (mode) mode.value = target?.publication_mode || "approval";
        });
        const heading = root.querySelector("#socialComposerTitle");
        if (heading) heading.textContent = "Modifier la publication";
        const save = root.querySelector("#socialSavePostBtn");
        if (save) save.textContent = "Enregistrer les modifications";
        setFeedback(root, "Modification du contenu sélectionné.", false);
        editForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    root.querySelectorAll("[data-social-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canManage) return;
        if (!window.confirm("Supprimer définitivement ce contenu et ses cibles de publication ?")) return;
        button.disabled = true;
        try {
          const result = await ctx.client.from("social_posts").delete().eq("id", button.dataset.socialDelete);
          if (result.error) throw result.error;
          await refresh(ctx, root);
        } catch (error) {
          button.disabled = false;
          window.alert(error && error.message ? error.message : "Suppression impossible.");
        }
      });
    });

    root.querySelectorAll("[data-social-retry]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canPublish) return;
        if (!window.confirm("Réessayer les cibles de publication en échec pour ce contenu ?")) return;
        button.disabled = true;
        try {
          const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
            body: { action: "retry_post", post_id: button.dataset.socialRetry }
          });
          if (error || !data) throw new Error(data?.error || error?.message || "Nouvel essai impossible.");
          await refresh(ctx, root);
        } catch (error) {
          button.disabled = false;
          window.alert(error && error.message ? error.message : "Nouvel essai impossible.");
        }
      });
    });

    const manualPlatformUrls = {
      facebook: "https://www.facebook.com/",
      instagram: "https://www.instagram.com/",
      tiktok: "https://www.tiktok.com/upload",
      linkedin: "https://www.linkedin.com/feed/",
      youtube: "https://studio.youtube.com/"
    };

    root.querySelectorAll("[data-social-copy-manual]").forEach(button => {
      button.addEventListener("click", async () => {
        const target = ctx.data.targets.find(item => item.id === button.dataset.socialCopyManual);
        const post = target && ctx.data.posts.find(item => item.id === target.post_id);
        if (!target || !post) return;
        const caption = target.caption || post.body || "";
        try {
          await navigator.clipboard.writeText(caption);
          button.textContent = "Texte copié";
        } catch {
          window.prompt("Copie le texte de la publication :", caption);
        }
      });
    });

    root.querySelectorAll("[data-social-open-manual]").forEach(button => {
      button.addEventListener("click", () => {
        const target = ctx.data.targets.find(item => item.id === button.dataset.socialOpenManual);
        const url = target && manualPlatformUrls[target.provider];
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    });

    root.querySelectorAll("[data-social-confirm-manual]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canPublish) return;
        const target = ctx.data.targets.find(item => item.id === button.dataset.socialConfirmManual);
        if (!target) return;
        const raw = window.prompt("Colle le lien de la publication après l'avoir publiée sur " + (PROVIDER_BY_KEY[target.provider]?.label || target.provider) + " :");
        if (!raw) return;
        button.disabled = true;
        try {
          const { data, error } = await ctx.client.functions.invoke("sama-social-platforms", {
            body: { action: "confirm_manual_target", target_id: target.id, permalink: raw.trim() }
          });
          if (error || data?.ok !== true) throw new Error(data?.error || error?.message || "Confirmation impossible.");
          await refresh(ctx, root);
        } catch (error) {
          button.disabled = false;
          window.alert(error && error.message ? error.message : "Confirmation impossible.");
        }
      });
    });

    root.querySelectorAll("[data-social-approve]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!ctx.canPublish) return;
        button.disabled = true;
        try {
          await approvePost(ctx, button.dataset.socialApprove);
          await refresh(ctx, root);
        } catch (error) {
          button.disabled = false;
          window.alert(error && error.message ? error.message : "Validation impossible.");
        }
      });
    });
  }

  window.SamaPackSocialAdmin = { mount };
})();