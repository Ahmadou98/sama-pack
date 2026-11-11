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
  let html = await assetResponse.text();
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


const SOCIAL_ADMIN_JS = "(() => {\n  \"use strict\";\n\n  const PROVIDERS = [\n    { key: \"facebook\", label: \"Facebook\", short: \"f\" },\n    { key: \"instagram\", label: \"Instagram\", short: \"ig\" },\n    { key: \"tiktok\", label: \"TikTok\", short: \"tt\" },\n    { key: \"linkedin\", label: \"LinkedIn\", short: \"in\" },\n    { key: \"youtube\", label: \"YouTube\", short: \"yt\" }\n  ];\n  const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map(item => [item.key, item]));\n  const STATUS_LABELS = {\n    draft: \"Brouillon\",\n    pending_approval: \"En attente de validation\",\n    scheduled: \"Programmation enregistrée\",\n    publishing: \"En cours\",\n    published: \"Publiée\",\n    partially_published: \"Partiellement publiée\",\n    failed: \"Échec\",\n    cancelled: \"Annulée\"\n  };\n  const TARGET_STATUS_LABELS = {\n    awaiting_connection: \"Compte à connecter\",\n    draft: \"Brouillon\",\n    scheduled: \"Programmée\",\n    manual_required: \"Action manuelle requise\",\n    publishing: \"En cours de publication\",\n    published: \"Publiée\",\n    failed: \"Échec\",\n    cancelled: \"Annulée\"\n  };\n  const ALLOWED_MEDIA_TYPES = new Set([\n    \"image/jpeg\", \"image/png\", \"image/webp\", \"image/gif\",\n    \"video/mp4\", \"video/quicktime\"\n  ]);\n  const MAX_MEDIA_BYTES = 100 * 1024 * 1024;\n\n  function esc(value) {\n    return String(value == null ? \"\" : value).replace(/[&<>\"']/g, char => ({\n      \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", \"\\\"\": \"&quot;\", \"'\": \"&#39;\"\n    })[char]);\n  }\n\n  function dakarParts(value = new Date()) {\n    const date = value instanceof Date ? value : new Date(value);\n    return new Intl.DateTimeFormat(\"en-CA\", {\n      timeZone: \"Africa/Dakar\", year: \"numeric\", month: \"2-digit\", day: \"2-digit\"\n    }).formatToParts(date).reduce((result, part) => {\n      if (part.type !== \"literal\") result[part.type] = part.value;\n      return result;\n    }, {});\n  }\n\n  function dakarDayStart(offsetDays = 0) {\n    const parts = dakarParts();\n    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays));\n    return date;\n  }\n\n  function dayKey(date) {\n    return date.toISOString().slice(0, 10);\n  }\n\n  function dayHeading(date) {\n    return new Intl.DateTimeFormat(\"fr-FR\", {\n      timeZone: \"Africa/Dakar\", weekday: \"short\", day: \"numeric\", month: \"short\"\n    }).format(date);\n  }\n\n  function dateLabel(value) {\n    if (!value) return \"Non programmée\";\n    const date = new Date(value);\n    if (!Number.isFinite(date.getTime())) return \"Date invalide\";\n    return new Intl.DateTimeFormat(\"fr-FR\", {\n      timeZone: \"Africa/Dakar\", dateStyle: \"medium\", timeStyle: \"short\"\n    }).format(date);\n  }\n\n  function timeLabel(value) {\n    if (!value) return \"\";\n    return new Intl.DateTimeFormat(\"fr-FR\", {\n      timeZone: \"Africa/Dakar\", hour: \"2-digit\", minute: \"2-digit\"\n    }).format(new Date(value));\n  }\n\n  function localInputValue(value) {\n    if (!value) return \"\";\n    const date = new Date(value);\n    if (!Number.isFinite(date.getTime())) return \"\";\n    const parts = new Intl.DateTimeFormat(\"en-CA\", {\n      timeZone: \"Africa/Dakar\",\n      year: \"numeric\", month: \"2-digit\", day: \"2-digit\",\n      hour: \"2-digit\", minute: \"2-digit\", hourCycle: \"h23\"\n    }).formatToParts(date);\n    const get = type => parts.find(part => part.type === type)?.value || \"\";\n    return get(\"year\") + \"-\" + get(\"month\") + \"-\" + get(\"day\") + \"T\" + get(\"hour\") + \":\" + get(\"minute\");\n  }\n\n  function inputToIso(value) {\n    if (!value) return null;\n    const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(value);\n    if (!match) throw new Error(\"La date de programmation n’est pas valide.\");\n    return new Date(Date.UTC(\n      Number(match[1]), Number(match[2]) - 1, Number(match[3]),\n      Number(match[4]), Number(match[5])\n    )).toISOString();\n  }\n\n  function statusMarkup(status) {\n    const label = STATUS_LABELS[status] || status || \"Inconnu\";\n    const css = status === \"published\" ? \"is-success\"\n      : status === \"failed\" ? \"is-danger\"\n      : status === \"pending_approval\" ? \"is-warning\"\n      : status === \"scheduled\" ? \"is-info\" : \"\";\n    return '<span class=\"social-status ' + css + '\">' + esc(label) + \"</span>\";\n  }\n\n  function providerMarkup(provider, mode) {\n    const item = PROVIDER_BY_KEY[provider];\n    if (!item) return \"\";\n    const manualOnly = provider === \"tiktok\";\n    const selectedMode = manualOnly ? \"manual\" : mode;\n    const choices = manualOnly\n      ? '<option value=\"automatic\" disabled>Automatique indisponible</option><option value=\"approval\" disabled>Validation automatique indisponible</option><option value=\"manual\" selected>Publication manuelle</option>'\n      : '<option value=\"automatic\"' + (selectedMode === \"automatic\" ? \" selected\" : \"\") + '>Automatique</option>' +\n        '<option value=\"approval\"' + (!selectedMode || selectedMode === \"approval\" ? \" selected\" : \"\") + '>Après validation</option>' +\n        '<option value=\"manual\"' + (selectedMode === \"manual\" ? \" selected\" : \"\") + '>Manuelle</option>';\n    return '<label class=\"social-provider-option\">' +\n      '<span class=\"social-provider-main\"><input type=\"checkbox\" name=\"provider\" value=\"' + item.key + '\" checked>' +\n      '<span class=\"social-provider-mark social-provider-' + item.key + '\">' + esc(item.short) + '</span>' +\n      '<span class=\"social-provider-name\">' + esc(item.label) + '</span></span>' +\n      '<select class=\"input social-mode-select\" name=\"mode_' + item.key + '\" aria-label=\"Mode de publication pour ' + esc(item.label) + '\">' +\n      choices + '</select></label>' +\n      (manualOnly ? '<small class=\"social-muted\">Copier le texte, publier dans TikTok, puis confirmer le lien.</small>' : '');\n  }\n\n  function groupTargets(targets) {\n    const result = new Map();\n    (targets || []).forEach(target => {\n      const list = result.get(target.post_id) || [];\n      list.push(target);\n      result.set(target.post_id, list);\n    });\n    return result;\n  }\n\n  function renderAccounts(accounts, ctx) {\n    const byProvider = new Map();\n    (accounts || []).forEach(account => {\n      const list = byProvider.get(account.provider) || [];\n      list.push(account);\n      byProvider.set(account.provider, list);\n    });\n    return PROVIDERS.map(provider => {\n      const connected = byProvider.get(provider.key) || [];\n      const active = connected.filter(account => account.status === \"connected\");\n      const description = connected.length\n        ? connected.map(account =>\n            '<span class=\"social-account-name\">' + esc(account.account_name || account.username || \"Compte connecté\") + '</span>' +\n            (account.status === \"connected\"\n              ? (ctx.canManageAccounts ? '<button class=\"social-disconnect-button\" type=\"button\" data-social-disconnect=\"' + esc(account.id) + '\">Déconnecter</button>' : '')\n              : '<small class=\"social-muted\">Connexion à renouveler</small>')\n          ).join(\"\")\n        : '<span class=\"social-account-empty\">Aucun compte connecté</span>';\n      const isManualOnly = provider.key === \"tiktok\";\n      const readiness = ctx.providerConfig?.[provider.key] || null;\n      const configured = readiness?.ready === true;\n      const missing = Array.isArray(readiness?.missing) ? readiness.missing : [];\n      const badge = active.length\n        ? '<span class=\"social-status is-success\">' + active.length + ' connecté(s)</span>'\n        : isManualOnly\n          ? '<span class=\"social-status is-warning\">Publication manuelle</span>'\n          : configured\n            ? '<span class=\"social-status\">Prêt à connecter</span>'\n            : '<span class=\"social-status is-warning\">OAuth à configurer</span>';\n      const connect = ctx.canManageAccounts && !isManualOnly\n        ? '<button class=\"btn small secondary social-connect-button\" type=\"button\" data-social-connect=\"' + provider.key + '\"' +\n          (configured ? '' : ' disabled title=\"' + esc(missing.length ? 'Secrets manquants : ' + missing.join(', ') : 'Vérification de configuration indisponible') + '\"') + '>' +\n          (configured ? (active.length ? 'Ajouter un compte' : 'Connecter') : 'Configuration requise') + '</button>' +\n          (!configured ? '<small class=\"social-muted\">Secrets serveur manquants : ' + esc(missing.join(', ') || 'configuration non vérifiée') + '</small>' : '')\n        : '';\n      const descriptionText = isManualOnly\n        ? \"Publication manuelle : TikTok ne sera pas automatisé depuis cet outil interne.\"\n        : provider.key === \"youtube\" ? \"Chaînes et téléversement vidéo.\"\n        : provider.key === \"linkedin\" ? \"Profil membre ou page autorisée.\"\n        : \"Pages et comptes professionnels.\";\n      return '<article class=\"social-account-card\">' +\n        '<div class=\"social-account-card-top\"><span class=\"social-provider-mark social-provider-' + provider.key + '\">' + esc(provider.short) + '</span>' + badge + '</div>' +\n        '<strong>' + esc(provider.label) + '</strong>' + description +\n        '<small class=\"social-muted\">' + descriptionText + '</small>' +\n        connect +\n        '</article>';\n    }).join(\"\");\n  }\n\n  function renderCalendar(posts) {\n    const scheduled = (posts || []).filter(post => post.scheduled_at && ![\"cancelled\", \"published\"].includes(post.status));\n    const byDate = new Map();\n    scheduled.forEach(post => {\n      const key = dayKey(new Date(post.scheduled_at));\n      const list = byDate.get(key) || [];\n      list.push(post);\n      byDate.set(key, list);\n    });\n    const days = Array.from({ length: 14 }, (_, index) => dakarDayStart(index));\n    return '<div class=\"social-calendar-grid\">' + days.map(date => {\n      const key = dayKey(date);\n      const items = (byDate.get(key) || []).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));\n      return '<article class=\"social-calendar-day\"><div class=\"social-calendar-date\">' + esc(dayHeading(date)) +\n        '<strong>' + items.length + '</strong></div>' +\n        (items.length ? items.map(post => '<div class=\"social-calendar-event\"><time>' + esc(timeLabel(post.scheduled_at)) +\n          '</time><span>' + esc(post.title) + '</span></div>').join(\"\") :\n          '<span class=\"social-calendar-empty\">Aucune publication</span>') +\n        '</article>';\n    }).join(\"\") + '</div>';\n  }\n\n  function renderPlatformActivity(targets) {\n    const rows = PROVIDERS.map(provider => {\n      const matching = (targets || []).filter(target => target.provider === provider.key);\n      const published = matching.filter(target => target.status === \"published\").length;\n      const failed = matching.filter(target => target.status === \"failed\").length;\n      const pending = matching.filter(target => [\"scheduled\", \"publishing\", \"manual_required\", \"awaiting_connection\", \"draft\"].includes(target.status)).length;\n      return '<article class=\"social-platform-activity\"><div class=\"social-platform-activity-name\"><span class=\"social-provider-mark social-provider-' + provider.key + '\">' + esc(provider.short) + '</span><strong>' + esc(provider.label) + '</strong></div><div class=\"social-platform-activity-counts\"><span><strong>' + published + '</strong> publiées</span><span><strong>' + pending + '</strong> en attente</span><span><strong>' + failed + '</strong> échecs</span></div></article>';\n    }).join(\"\");\n    return '<div class=\"social-platform-activity-list\">' + rows + '</div>';\n  }\n\n  function renderPostRows(posts, targetsByPost, canManage, canPublish) {\n    if (!posts.length) {\n      return '<div class=\"social-empty-state\"><span class=\"social-empty-icon\">✎</span><h3>Aucune publication enregistrée</h3><p>Prépare le premier contenu de SAMA-PACK et choisis les réseaux à cibler.</p></div>';\n    }\n    return posts.map(post => {\n      const targets = targetsByPost.get(post.id) || [];\n      const channels = targets.map(target => {\n        const provider = PROVIDER_BY_KEY[target.provider];\n        const label = provider ? provider.label : target.provider;\n        const targetStatus = TARGET_STATUS_LABELS[target.status] || target.status;\n        return '<span class=\"social-channel-chip\" title=\"' + esc(target.error_message || target.permalink || \"\") + '\">' +\n          esc(label) + '<small>' + esc(targetStatus) + '</small>' +\n          (target.error_message ? '<small class=\"social-channel-error\">' + esc(target.error_message) + '</small>' : '') +\n          (target.permalink ? '<a href=\"' + esc(target.permalink) + '\" target=\"_blank\" rel=\"noopener noreferrer\">Voir</a>' : '') +\n          '</span>';\n      }).join(\"\");\n      const media = post.media_asset_id ? '<span class=\"social-media-indicator\">Média joint</span>' : \"\";\n      let actions = \"\";\n      if (post.status === \"pending_approval\" && canPublish) {\n        actions += '<button class=\"btn small primary\" type=\"button\" data-social-approve=\"' + esc(post.id) + '\">Valider</button>';\n      }\n      if (canPublish && targets.some(target => target.status === \"failed\")) {\n        actions += '<button class=\"btn small secondary\" type=\"button\" data-social-retry=\"' + esc(post.id) + '\">Réessayer</button>';\n      }\n      const manualTargetsReady = targets.filter(target =>\n        target.status === \"manual_required\" &&\n        (!post.scheduled_at || new Date(post.scheduled_at).getTime() <= Date.now())\n      );\n      if (canManage) {\n        manualTargetsReady.forEach(target => {\n          const provider = PROVIDER_BY_KEY[target.provider];\n          if (!provider) return;\n          actions += '<button class=\"btn small ghost\" type=\"button\" data-social-copy-manual=\"' + esc(target.id) + '\">Copier ' + esc(provider.label) + '</button>' +\n            '<button class=\"btn small secondary\" type=\"button\" data-social-open-manual=\"' + esc(target.id) + '\">Ouvrir ' + esc(provider.label) + '</button>';\n          if (canPublish) {\n            actions += '<button class=\"btn small primary\" type=\"button\" data-social-confirm-manual=\"' + esc(target.id) + '\">Confirmer</button>';\n          }\n        });\n      }\n      if (canManage && ![\"published\", \"publishing\", \"partially_published\"].includes(post.status)) {\n        actions += '<button class=\"btn small ghost\" type=\"button\" data-social-edit=\"' + esc(post.id) + '\">Modifier</button>' +\n          '<button class=\"btn small danger\" type=\"button\" data-social-delete=\"' + esc(post.id) + '\">Supprimer</button>';\n      }\n      return '<article class=\"social-post-card\">' +\n        '<div class=\"social-post-copy\"><div class=\"social-post-title-line\"><h4>' + esc(post.title || \"Publication sans titre\") + '</h4>' + statusMarkup(post.status) + '</div>' +\n        '<p>' + esc(post.body || \"\") + '</p><div class=\"social-post-meta\"><span>' + esc(dateLabel(post.scheduled_at)) + '</span>' + media + '</div>' +\n        '<div class=\"social-channel-list\">' + (channels || '<span class=\"social-muted\">Aucune plateforme sélectionnée</span>') + '</div></div>' +\n        '<div class=\"social-post-actions\">' + actions + '</div></article>';\n    }).join(\"\");\n  }\n\n  async function loadData(client) {\n    const [accountsResult, postsResult] = await Promise.all([\n      client.from(\"social_accounts\")\n        .select(\"id,provider,provider_account_id,account_name,username,profile_url,avatar_url,status,scopes,token_expires_at,connected_at,created_at\")\n        .order(\"provider\", { ascending: true }),\n      client.from(\"social_posts\")\n        .select(\"id,title,body,status,scheduled_at,media_asset_id,created_by,approved_by,approved_at,created_at,updated_at\")\n        .order(\"created_at\", { ascending: false }).limit(100)\n    ]);\n    if (accountsResult.error) throw accountsResult.error;\n    if (postsResult.error) throw postsResult.error;\n    const posts = postsResult.data || [];\n    const ids = posts.map(post => post.id);\n    let targets = [];\n    if (ids.length) {\n      const targetResult = await client.from(\"social_post_targets\")\n        .select(\"id,post_id,provider,social_account_id,publication_mode,status,scheduled_at,published_at,permalink,error_message,platform_post_id,provider_options,caption\")\n        .in(\"post_id\", ids);\n      if (targetResult.error) throw targetResult.error;\n      targets = targetResult.data || [];\n    }\n    return {\n      accounts: accountsResult.data || [],\n      posts,\n      targets,\n      targetsByPost: groupTargets(targets)\n    };\n  }\n\n  async function uploadMedia(client, userId, file) {\n    if (!file) return null;\n    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {\n      throw new Error(\"Format média non pris en charge. Utilise JPG, PNG, WebP, GIF, MP4 ou MOV.\");\n    }\n    if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) {\n      throw new Error(\"Le fichier doit peser moins de 100 Mo.\");\n    }\n    const safeName = file.name.normalize(\"NFKD\").replace(/[\\u0300-\\u036f]/g, \"\")\n      .replace(/[^a-zA-Z0-9._-]+/g, \"-\").slice(-100) || \"media\";\n    const path = userId + \"/\" + crypto.randomUUID() + \"-\" + safeName;\n    const bucket = client.storage.from(\"sama-social-media\");\n    const upload = await bucket.upload(path, file, {\n      cacheControl: \"3600\", contentType: file.type, upsert: false\n    });\n    if (upload.error) throw upload.error;\n    const asset = await client.from(\"social_media_assets\").insert({\n      storage_path: path,\n      original_name: file.name.slice(0, 255),\n      mime_type: file.type,\n      size_bytes: file.size,\n      uploaded_by: userId\n    }).select(\"id\").single();\n    if (asset.error) {\n      await bucket.remove([path]);\n      throw asset.error;\n    }\n    return asset.data.id;\n  }\n\n  function buildMarkup(data, ctx) {\n    const canManage = Boolean(ctx.canManage);\n    const canPublish = Boolean(ctx.canPublish);\n    const connectedCount = data.accounts.filter(account => account.status === \"connected\").length;\n    const draftCount = data.posts.filter(post => post.status === \"draft\").length;\n    const approvalCount = data.posts.filter(post => post.status === \"pending_approval\").length;\n    const scheduledCount = data.posts.filter(post => [\"scheduled\", \"partially_published\"].includes(post.status)).length;\n    const publishedCount = data.targets.filter(target => target.status === \"published\").length;\n    const composer = canManage\n      ? '<section class=\"panel social-composer-panel\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">STUDIO DE CONTENU</span><h3 id=\"socialComposerTitle\">Préparer une publication</h3><p>Rédige une fois, puis choisis le mode de diffusion pour chaque réseau.</p></div><span class=\"social-step-number\">01</span></div>' +\n        '<form id=\"socialPostForm\" class=\"social-post-form\">' +\n        '<label class=\"social-field full\">Nom interne<input class=\"input\" name=\"title\" maxlength=\"160\" required placeholder=\"Ex. Offre Grand Ménage de novembre\"></label>' +\n        '<label class=\"social-field full\">Texte de la publication<textarea class=\"input\" name=\"body\" maxlength=\"5000\" rows=\"5\" required placeholder=\"Rédige le message de SAMA-PACK…\"></textarea><small>Le texte commun sert de base à chaque plateforme. Les adaptations spécifiques seront ajoutées ensuite.</small></label>' +\n        '<div class=\"social-form-section full\"><div class=\"social-form-section-title\"><strong>Plateformes ciblées</strong><span>Choisis les réseaux à utiliser et leur mode.</span></div><div class=\"social-provider-grid\">' +\n        PROVIDERS.map(provider => providerMarkup(provider.key, \"approval\")).join(\"\") +\n        '</div></div>' +\n        '<details class=\"social-caption-adaptations full\"><summary>Adapter le texte pour chaque réseau (facultatif)</summary><div class=\"social-caption-grid\">' +\n        PROVIDERS.map(provider => '<label class=\"social-field\">' + esc(provider.label) + '<textarea class=\"input\" name=\"caption_' + provider.key + '\" rows=\"3\" maxlength=\"5000\" placeholder=\"Laisser vide pour utiliser le texte commun.\"></textarea></label>').join(\"\") +\n        '</div></details>' +\n        '<label class=\"social-field\">Date et heure souhaitées<input class=\"input\" name=\"scheduled_at\" type=\"datetime-local\" min=\"' + esc(localInputValue(new Date()).slice(0, 16)) + '\"><small>Heure de Dakar (UTC+0).</small></label>' +\n        '<label class=\"social-field\">Photo ou vidéo<input class=\"input\" name=\"media\" type=\"file\" accept=\"image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime\"><small>Image ou vidéo, 100 Mo maximum.</small></label>' +\n        '<label class=\"social-field\">Visibilité YouTube<select class=\"input\" name=\"youtube_privacy\"><option value=\"public\">Publique</option><option value=\"unlisted\">Non répertoriée</option><option value=\"private\">Privée</option></select><small>YouTube ne reçoit que des vidéos par cette API.</small></label>' +\n        '<div class=\"social-composer-notice full\"><strong>Avant l’envoi :</strong> chaque réseau doit être connecté avec ses autorisations officielles. Les publications automatiques ne sont lancées qu’après validation et à la date prévue. Les formats non pris en charge restent à publier manuellement.</div>' +\n        '<div class=\"social-form-actions full\"><button class=\"btn primary\" type=\"submit\" id=\"socialSavePostBtn\">Enregistrer le contenu</button><button class=\"btn ghost\" type=\"button\" id=\"socialResetPostBtn\">Effacer</button><span id=\"socialFormFeedback\" role=\"status\" aria-live=\"polite\"></span></div>' +\n        '</form></section>'\n      : '<section class=\"panel social-composer-panel\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">STUDIO DE CONTENU</span><h3>Accès en consultation</h3><p>La création et les modifications nécessitent une permission spécifique.</p></div></div></section>';\n\n    return '<div class=\"social-admin\">' +\n      '<div id=\"socialOauthFeedback\" class=\"social-api-notice social-feedback-notice\" hidden role=\"status\" aria-live=\"polite\"></div>' +\n      '<section class=\"social-welcome\"><div><span class=\"eyebrow\">MARKETING & COMMUNICATION</span><h2>Réseaux sociaux SAMA-PACK</h2><p>Centralise les contenus, le calendrier et les comptes officiels de la marque.</p></div><div class=\"social-welcome-mark\" aria-hidden=\"true\">SP</div></section>' +\n      '<section class=\"social-stat-grid\">' +\n      '<article class=\"social-stat-card\"><span>Comptes connectés</span><strong>' + connectedCount + '<small> / 5 réseaux</small></strong></article>' +\n      '<article class=\"social-stat-card\"><span>Brouillons</span><strong>' + draftCount + '</strong></article>' +\n      '<article class=\"social-stat-card\"><span>À valider</span><strong>' + approvalCount + '</strong></article>' +\n      '<article class=\"social-stat-card\"><span>Programmations</span><strong>' + scheduledCount + '</strong></article>' +\n      '<article class=\"social-stat-card\"><span>Publications confirmées</span><strong>' + publishedCount + '</strong></article>' +\n      '</section>' +\n      '<section class=\"social-api-notice\"><span class=\"social-notice-icon\" aria-hidden=\"true\">i</span><div><strong>Publication sécurisée et contrôlée</strong><p>Les autorisations OAuth sont vérifiées pour chaque réseau. Les jetons sont conservés chiffrés côté serveur. Les comptes, programmations et résultats ne sont marqués comme connectés ou publiés qu’après confirmation de la plateforme.</p></div></section>' +\n      '<section class=\"social-section\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">COMPTES OFFICIELS</span><h3>Plateformes connectées</h3><p>Connecte les comptes après configuration des identifiants développeur requis.</p></div><span class=\"social-step-number\">02</span></div><div class=\"social-account-grid\">' +\n      renderAccounts(data.accounts, ctx) +\n      '</div></section>' +\n      composer +\n      '<section class=\"social-section\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">CALENDRIER ÉDITORIAL</span><h3>Les 14 prochains jours</h3><p>Programmations enregistrées dans Social Desk, en heure de Dakar.</p></div><div class=\"social-calendar-actions\">' +\n      (canPublish ? '<button class=\"btn small primary\" type=\"button\" id=\"socialRunDueBtn\">Exécuter les publications dues</button>' : '') +\n      '<span class=\"social-step-number\">03</span></div></div>' +\n      renderCalendar(data.posts) + '</section>' +\n      '<section class=\"social-section\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">ACTIVITÉ PAR PLATEFORME</span><h3>Publications confirmées</h3><p>Nombre de publications confirmées par la plateforme ; les vues, commentaires et interactions dépendront des permissions Analytics disponibles.</p></div><span class=\"social-step-number\">04</span></div>' +\n      renderPlatformActivity(data.targets) + '</section>' +\n      '<section class=\"social-section\"><div class=\"social-section-heading\"><div><span class=\"eyebrow\">SUIVI ÉDITORIAL</span><h3>Publications récentes</h3><p>Derniers contenus enregistrés dans l’espace SAMA-PACK.</p></div><span class=\"social-step-number\">05</span></div>' +\n      '<div id=\"socialPostsList\" class=\"social-post-list\">' + renderPostRows(data.posts, data.targetsByPost, canManage, canPublish) + '</div></section>' +\n      '<p class=\"social-security-footnote\">Les jetons OAuth ne seront jamais accessibles dans le navigateur. Ils seront stockés chiffrés côté serveur lors de l’intégration des connexions.</p>' +\n      '</div>';\n  }\n\n  async function loadProviderConfiguration(ctx) {\n    if (!ctx.canManageAccounts) return {};\n    try {\n      const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n        body: { action: \"configuration\" }\n      });\n      if (error || data?.ok !== true || !data.providers) return {};\n      return data.providers;\n    } catch (error) {\n      console.warn(\"Social Desk OAuth configuration is not readable yet.\", error);\n      return {};\n    }\n  }\n\n  async function mount(ctx) {\n    const root = ctx && ctx.root;\n    if (!root || !ctx.client) return;\n    if (!ctx.canView) {\n      root.innerHTML = '<div class=\"panel\"><h3>Accès refusé</h3><p>Tu ne disposes pas de la permission nécessaire pour consulter les réseaux sociaux.</p></div>';\n      return;\n    }\n    root.innerHTML = '<div class=\"panel social-loading\"><span class=\"admin-loading-spinner\" aria-hidden=\"true\"></span><p>Chargement de la gestion des réseaux sociaux…</p></div>';\n    try {\n      const [data, providerConfig] = await Promise.all([\n        loadData(ctx.client),\n        loadProviderConfiguration(ctx)\n      ]);\n      ctx.data = data;\n      ctx.providerConfig = providerConfig;\n      root.innerHTML = buildMarkup(data, ctx);\n      bind(root, ctx);\n      const url = new URL(window.location.href);\n      const socialStatus = url.searchParams.get(\"social\");\n      if (socialStatus) {\n        const feedback = root.querySelector(\"#socialOauthFeedback\");\n        const provider = url.searchParams.get(\"provider\") || \"\";\n        const count = url.searchParams.get(\"count\") || \"\";\n        const reason = url.searchParams.get(\"reason\") || \"\";\n        if (feedback) {\n          feedback.hidden = false;\n          if (socialStatus === \"connected\") {\n            feedback.innerHTML = '<span class=\"social-notice-icon\" aria-hidden=\"true\">✓</span><div><strong>Compte(s) relié(s)</strong><p>' +\n              esc(provider.toUpperCase()) + ' · ' + esc(count || \"Connexion\") + ' compte(s) enregistré(s). Tu peux maintenant préparer les publications compatibles.</p></div>';\n        } else {\n            feedback.innerHTML = '<span class=\"social-notice-icon\" aria-hidden=\"true\">!</span><div><strong>Connexion non terminée</strong><p>' +\n              esc(reason || \"La plateforme n’a pas autorisé la connexion. Vérifie les paramètres OAuth et réessaie.\") + '</p></div>';\n          }\n        }\n        [\"social\",\"provider\",\"count\",\"reason\"].forEach(key => url.searchParams.delete(key));\n        window.history.replaceState({}, \"\", url.pathname + (url.search ? url.search : \"\") + url.hash);\n      }\n    } catch (error) {\n      console.error(\"SAMA-PACK social admin failed:\", error);\n      root.innerHTML = '<div class=\"panel social-error\"><h3>Module réseaux sociaux indisponible</h3><p>' +\n        esc(error && error.message ? error.message : \"La base de données n’a pas répondu.\") +\n        '</p><p class=\"small-note\">Vérifie que la migration sociale a été appliquée et que les permissions du compte sont actives.</p><button class=\"btn ghost\" type=\"button\" id=\"socialRetryBtn\">Réessayer</button></div>';\n      root.querySelector(\"#socialRetryBtn\")?.addEventListener(\"click\", () => mount(ctx));\n    }\n  }\n\n  function setFeedback(root, message, isError) {\n    const output = root.querySelector(\"#socialFormFeedback\");\n    if (!output) return;\n    output.textContent = message;\n    output.classList.toggle(\"is-error\", Boolean(isError));\n    output.classList.toggle(\"is-success\", !isError && Boolean(message));\n  }\n\n  function resetComposer(root) {\n    const form = root.querySelector(\"#socialPostForm\");\n    if (!form) return;\n    form.reset();\n    delete form.dataset.postId;\n    form.querySelectorAll('input[name=\"provider\"]').forEach(input => { input.checked = true; });\n    form.querySelectorAll(\".social-mode-select\").forEach(select => { select.value = select.name === \"mode_tiktok\" ? \"manual\" : \"approval\"; });\n    const heading = root.querySelector(\"#socialComposerTitle\");\n    if (heading) heading.textContent = \"Préparer une publication\";\n    const save = root.querySelector(\"#socialSavePostBtn\");\n    if (save) save.textContent = \"Enregistrer le contenu\";\n    setFeedback(root, \"\", false);\n  }\n\n  async function savePost(ctx, form) {\n    if (!ctx.canManage) throw new Error(\"La permission de création de contenus est requise.\");\n    const formData = new FormData(form);\n    const title = String(formData.get(\"title\") || \"\").trim();\n    const body = String(formData.get(\"body\") || \"\").trim();\n    const providers = [...form.querySelectorAll('input[name=\"provider\"]:checked')].map(input => input.value);\n    const scheduledAt = inputToIso(String(formData.get(\"scheduled_at\") || \"\"));\n    const file = formData.get(\"media\");\n    if (!title || title.length > 160) throw new Error(\"Le nom interne doit contenir entre 1 et 160 caractères.\");\n    if (!body || body.length > 5000) throw new Error(\"Le texte doit contenir entre 1 et 5 000 caractères.\");\n    if (!providers.length) throw new Error(\"Choisis au moins une plateforme.\");\n    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) throw new Error(\"Choisis une date et une heure futures.\");\n\n    const selectedModes = {};\n    providers.forEach(provider => {\n      const select = form.querySelector('[name=\"mode_' + provider + '\"]');\n      const mode = select ? select.value : \"approval\";\n      if (![\"automatic\", \"approval\", \"manual\"].includes(mode)) throw new Error(\"Mode de publication invalide.\");\n      selectedModes[provider] = mode;\n    });\n\n    const existingId = form.dataset.postId || \"\";\n    const existing = existingId ? ctx.data.posts.find(post => post.id === existingId) : null;\n    if (existingId && !existing) throw new Error(\"Cette publication n’existe plus. Actualise le module.\");\n    let mediaAssetId = existing?.media_asset_id || null;\n    if (file instanceof File && file.size > 0) {\n      mediaAssetId = await uploadMedia(ctx.client, ctx.currentUser.id, file);\n    }\n\n    const requiresApproval = scheduledAt && providers.some(provider => selectedModes[provider] === \"approval\");\n    const postStatus = scheduledAt\n      ? (requiresApproval ? \"pending_approval\" : \"scheduled\")\n      : \"draft\";\n    const payload = {\n      title,\n      body,\n      status: postStatus,\n      scheduled_at: scheduledAt,\n      media_asset_id: mediaAssetId,\n      updated_at: new Date().toISOString()\n    };\n\n    let postId = existingId;\n    if (existingId) {\n      const updated = await ctx.client.from(\"social_posts\").update(payload).eq(\"id\", existingId);\n      if (updated.error) throw updated.error;\n    } else {\n      const inserted = await ctx.client.from(\"social_posts\").insert({\n        ...payload,\n        created_by: ctx.currentUser.id\n      }).select(\"id\").single();\n      if (inserted.error) throw inserted.error;\n      postId = inserted.data.id;\n    }\n\n    const oldTargets = ctx.data.targets.filter(target => target.post_id === postId);\n    const oldByProvider = new Map(oldTargets.map(target => [target.provider, target]));\n    for (const provider of providers) {\n      const account = ctx.data.accounts.find(item => item.provider === provider && item.status === \"connected\") || null;\n      const targetPayload = {\n        post_id: postId,\n        provider,\n        social_account_id: account?.id || null,\n        caption: String(formData.get(\"caption_\" + provider) || \"\").trim() || body,\n        publication_mode: provider === \"tiktok\" ? \"manual\" : selectedModes[provider],\n        status: provider === \"tiktok\" || selectedModes[provider] === \"manual\" ? \"manual_required\"\n          : !account ? \"awaiting_connection\"\n          : scheduledAt ? \"scheduled\" : \"draft\",\n        scheduled_at: scheduledAt,\n        provider_options: provider === \"youtube\"\n          ? { privacy_status: String(formData.get(\"youtube_privacy\") || \"public\") }\n          : {},\n        updated_at: new Date().toISOString()\n      };\n      const old = oldByProvider.get(provider);\n      const result = old\n        ? await ctx.client.from(\"social_post_targets\").update(targetPayload).eq(\"id\", old.id)\n        : await ctx.client.from(\"social_post_targets\").insert(targetPayload);\n      if (result.error) throw result.error;\n      oldByProvider.delete(provider);\n    }\n    for (const old of oldByProvider.values()) {\n      const removed = await ctx.client.from(\"social_post_targets\").delete().eq(\"id\", old.id);\n      if (removed.error) throw removed.error;\n    }\n    return { status: postStatus, scheduledAt };\n  }\n\n  async function approvePost(ctx, postId) {\n    if (!ctx.canPublish) throw new Error(\"La permission de validation est requise.\");\n    const result = await ctx.client.rpc(\"sama_approve_social_post\", { p_post_id: postId });\n    if (result.error) throw result.error;\n    if (!result.data?.ok) throw new Error(result.data?.message || \"La programmation n’a pas été validée.\");\n  }\n\n  async function refresh(ctx, root) {\n    const data = await loadData(ctx.client);\n    ctx.data = data;\n    root.innerHTML = buildMarkup(data, ctx);\n    bind(root, ctx);\n  }\n\n  function bind(root, ctx) {\n    root.querySelectorAll(\"[data-social-connect]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canManageAccounts) return;\n        const provider = button.dataset.socialConnect;\n        button.disabled = true;\n        const oldText = button.textContent;\n        button.textContent = \"Connexion…\";\n        try {\n          const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n            body: { action: \"connect\", provider }\n          });\n          if (error || !data?.authorization_url) throw new Error(data?.error || error?.message || \"Impossible d'ouvrir la connexion OAuth.\");\n          window.location.assign(data.authorization_url);\n        } catch (error) {\n          button.disabled = false;\n          button.textContent = oldText;\n          window.alert(error && error.message ? error.message : \"Connexion impossible.\");\n        }\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-disconnect]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canManageAccounts) return;\n        if (!window.confirm(\"Déconnecter ce compte social ? Les publications déjà enregistrées seront conservées.\")) return;\n        button.disabled = true;\n        try {\n          const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n            body: { action: \"disconnect\", account_id: button.dataset.socialDisconnect }\n          });\n          if (error || !data?.ok) throw new Error(data?.error || error?.message || \"Déconnexion impossible.\");\n          await refresh(ctx, root);\n        } catch (error) {\n          button.disabled = false;\n          window.alert(error && error.message ? error.message : \"Déconnexion impossible.\");\n        }\n      });\n    });\n\n    const runDueButton = root.querySelector(\"#socialRunDueBtn\");\n    if (runDueButton && ctx.canPublish) {\n      runDueButton.addEventListener(\"click\", async () => {\n        if (!window.confirm(\"Lancer maintenant les publications dont la date est arrivée et qui sont validées ? Cette action peut publier publiquement sur les comptes connectés.\")) return;\n        runDueButton.disabled = true;\n        runDueButton.textContent = \"Publication en cours…\";\n        try {\n          const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n            body: { action: \"run_due\" }\n          });\n          if (error || !data) throw new Error(data?.error || error?.message || \"Le moteur de publication n'a pas répondu.\");\n          await refresh(ctx, root);\n          const feedback = root.querySelector(\"#socialOauthFeedback\");\n          if (feedback) {\n            feedback.hidden = false;\n            feedback.innerHTML = '<span class=\"social-notice-icon\" aria-hidden=\"true\">✓</span><div><strong>Traitement terminé</strong><p>' +\n              Number(data.published || 0) + ' publiée(s), ' + Number(data.processing || 0) +\n              ' en cours, ' + Number(data.failed || 0) + ' en échec. Les détails sont visibles sur chaque réseau.</p></div>';\n          }\n        } catch (error) {\n          runDueButton.disabled = false;\n          runDueButton.textContent = \"Réessayer les publications dues\";\n          window.alert(error && error.message ? error.message : \"Exécution impossible.\");\n        }\n      });\n    }\n\n    const form = root.querySelector(\"#socialPostForm\");\n    if (form) {\n      form.addEventListener(\"submit\", async event => {\n        event.preventDefault();\n        const button = root.querySelector(\"#socialSavePostBtn\");\n        if (button) { button.disabled = true; button.textContent = \"Enregistrement…\"; }\n        setFeedback(root, \"\", false);\n        try {\n          const result = await savePost(ctx, form);\n          const message = result.status === \"pending_approval\"\n            ? \"Contenu enregistré. Il attend la validation du responsable.\"\n            : result.scheduledAt\n              ? \"Programmation éditoriale enregistrée. Aucun réseau n’a encore reçu la publication.\"\n              : \"Brouillon enregistré.\";\n          await refresh(ctx, root);\n          const newFeedback = root.querySelector(\"#socialFormFeedback\");\n          if (newFeedback) newFeedback.textContent = message;\n        } catch (error) {\n          setFeedback(root, error && error.message ? error.message : \"Enregistrement impossible.\", true);\n          if (button) { button.disabled = false; button.textContent = form.dataset.postId ? \"Enregistrer les modifications\" : \"Enregistrer le contenu\"; }\n        }\n      });\n      root.querySelector(\"#socialResetPostBtn\")?.addEventListener(\"click\", () => resetComposer(root));\n    }\n\n    root.querySelectorAll(\"[data-social-edit]\").forEach(button => {\n      button.addEventListener(\"click\", () => {\n        const post = ctx.data.posts.find(item => item.id === button.dataset.socialEdit);\n        const editForm = root.querySelector(\"#socialPostForm\");\n        if (!post || !editForm) return;\n        const targets = ctx.data.targets.filter(item => item.post_id === post.id);\n        editForm.dataset.postId = post.id;\n        editForm.elements.title.value = post.title || \"\";\n        editForm.elements.body.value = post.body || \"\";\n        targets.forEach(target => {\n          const caption = editForm.querySelector('[name=\"caption_' + target.provider + '\"]');\n          if (caption) caption.value = target.caption || \"\";\n        });\n        editForm.elements.scheduled_at.value = localInputValue(post.scheduled_at);\n        editForm.elements.youtube_privacy.value = String(targets.find(item => item.provider === \"youtube\")?.provider_options?.privacy_status || \"public\");\n        editForm.querySelectorAll('input[name=\"provider\"]').forEach(input => {\n          const target = targets.find(item => item.provider === input.value);\n          input.checked = Boolean(target);\n          const mode = editForm.querySelector('[name=\"mode_' + input.value + '\"]');\n          if (mode) mode.value = target?.publication_mode || \"approval\";\n        });\n        const heading = root.querySelector(\"#socialComposerTitle\");\n        if (heading) heading.textContent = \"Modifier la publication\";\n        const save = root.querySelector(\"#socialSavePostBtn\");\n        if (save) save.textContent = \"Enregistrer les modifications\";\n        setFeedback(root, \"Modification du contenu sélectionné.\", false);\n        editForm.scrollIntoView({ behavior: \"smooth\", block: \"start\" });\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-delete]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canManage) return;\n        if (!window.confirm(\"Supprimer définitivement ce contenu et ses cibles de publication ?\")) return;\n        button.disabled = true;\n        try {\n          const result = await ctx.client.from(\"social_posts\").delete().eq(\"id\", button.dataset.socialDelete);\n          if (result.error) throw result.error;\n          await refresh(ctx, root);\n        } catch (error) {\n          button.disabled = false;\n          window.alert(error && error.message ? error.message : \"Suppression impossible.\");\n        }\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-retry]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canPublish) return;\n        if (!window.confirm(\"Réessayer les cibles de publication en échec pour ce contenu ?\")) return;\n        button.disabled = true;\n        try {\n          const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n            body: { action: \"retry_post\", post_id: button.dataset.socialRetry }\n          });\n          if (error || !data) throw new Error(data?.error || error?.message || \"Nouvel essai impossible.\");\n          await refresh(ctx, root);\n        } catch (error) {\n          button.disabled = false;\n          window.alert(error && error.message ? error.message : \"Nouvel essai impossible.\");\n        }\n      });\n    });\n\n    const manualPlatformUrls = {\n      facebook: \"https://www.facebook.com/\",\n      instagram: \"https://www.instagram.com/\",\n      tiktok: \"https://www.tiktok.com/upload\",\n      linkedin: \"https://www.linkedin.com/feed/\",\n      youtube: \"https://studio.youtube.com/\"\n    };\n\n    root.querySelectorAll(\"[data-social-copy-manual]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        const target = ctx.data.targets.find(item => item.id === button.dataset.socialCopyManual);\n        const post = target && ctx.data.posts.find(item => item.id === target.post_id);\n        if (!target || !post) return;\n        const caption = target.caption || post.body || \"\";\n        try {\n          await navigator.clipboard.writeText(caption);\n          button.textContent = \"Texte copié\";\n        } catch {\n          window.prompt(\"Copie le texte de la publication :\", caption);\n        }\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-open-manual]\").forEach(button => {\n      button.addEventListener(\"click\", () => {\n        const target = ctx.data.targets.find(item => item.id === button.dataset.socialOpenManual);\n        const url = target && manualPlatformUrls[target.provider];\n        if (url) window.open(url, \"_blank\", \"noopener,noreferrer\");\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-confirm-manual]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canPublish) return;\n        const target = ctx.data.targets.find(item => item.id === button.dataset.socialConfirmManual);\n        if (!target) return;\n        const raw = window.prompt(\"Colle le lien de la publication après l'avoir publiée sur \" + (PROVIDER_BY_KEY[target.provider]?.label || target.provider) + \" :\");\n        if (!raw) return;\n        button.disabled = true;\n        try {\n          const { data, error } = await ctx.client.functions.invoke(\"sama-social-platforms\", {\n            body: { action: \"confirm_manual_target\", target_id: target.id, permalink: raw.trim() }\n          });\n          if (error || data?.ok !== true) throw new Error(data?.error || error?.message || \"Confirmation impossible.\");\n          await refresh(ctx, root);\n        } catch (error) {\n          button.disabled = false;\n          window.alert(error && error.message ? error.message : \"Confirmation impossible.\");\n        }\n      });\n    });\n\n    root.querySelectorAll(\"[data-social-approve]\").forEach(button => {\n      button.addEventListener(\"click\", async () => {\n        if (!ctx.canPublish) return;\n        button.disabled = true;\n        try {\n          await approvePost(ctx, button.dataset.socialApprove);\n          await refresh(ctx, root);\n        } catch (error) {\n          button.disabled = false;\n          window.alert(error && error.message ? error.message : \"Validation impossible.\");\n        }\n      });\n    });\n  }\n\n  window.SamaPackSocialAdmin = { mount };\n})();";
const SOCIAL_ADMIN_CSS = "/* SAMA-PACK — module de gestion des réseaux sociaux */\n.social-admin{display:grid;gap:22px;min-width:0}\n.social-welcome{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:26px 30px;border:1px solid #dcebe0;border-radius:20px;background:linear-gradient(120deg,#f2faf4,#fff)}\n.social-welcome h2{margin:7px 0;font-size:clamp(23px,3vw,31px);letter-spacing:-.04em;color:#173b27}\n.social-welcome p{margin:0;color:#64756b;font-size:14px}\n.social-welcome-mark{display:grid;place-items:center;width:62px;height:62px;flex:0 0 62px;border-radius:18px;background:#176b43;color:#fff;font-size:21px;font-weight:900;letter-spacing:-.06em}\n.social-stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}\n.social-stat-card{display:grid;gap:7px;padding:17px 18px;border:1px solid #e4ebe5;border-radius:15px;background:#fff}\n.social-stat-card>span{color:#64756b;font-size:12px}\n.social-stat-card strong{color:#173b27;font-size:27px;line-height:1.1;font-weight:850}\n.social-stat-card strong small{font-size:12px;color:#809087;font-weight:600}\n.social-api-notice{display:flex;gap:13px;align-items:flex-start;padding:16px 18px;border:1px solid #d9e7f5;border-radius:14px;background:#f5f9ff;color:#284a68}\n.social-notice-icon{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;background:#dcecff;color:#275b8c;font-weight:900}\n.social-api-notice strong{display:block;font-size:13px}\n.social-api-notice p{margin:4px 0 0;font-size:12px;line-height:1.6;color:#526d86}\n.social-section{display:grid;gap:13px;min-width:0}\n.social-section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}\n.social-section-heading h3{margin:5px 0 4px;font-size:19px;letter-spacing:-.025em;color:#173b27}\n.social-section-heading p{margin:0;color:#718078;font-size:12px;line-height:1.5}\n.social-step-number{display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;border-radius:11px;background:#eff7f1;color:#176b43;font-weight:850;font-size:12px}\n.social-account-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px}\n.social-account-card{display:grid;align-content:start;gap:9px;min-width:0;padding:14px;border:1px solid #e4ebe5;border-radius:15px;background:#fff}\n.social-account-card-top{display:flex;align-items:center;justify-content:space-between;gap:7px}\n.social-provider-mark{display:grid;place-items:center;width:31px;height:31px;border-radius:10px;background:#eff5f1;color:#176b43;font-size:12px;font-weight:900;text-transform:uppercase}\n.social-provider-facebook{background:#edf3ff;color:#2459a8}\n.social-provider-instagram{background:#fff0f5;color:#ad3d72}\n.social-provider-tiktok{background:#eef0f2;color:#111827}\n.social-provider-linkedin{background:#edf6ff;color:#16669b}\n.social-provider-youtube{background:#fff0f0;color:#b42318}\n.social-account-card>strong{font-size:13px;color:#20372a}\n.social-account-name{display:block;overflow-wrap:anywhere;font-size:12px;color:#176b43}\n.social-account-empty{font-size:11px;color:#849187}\n.social-muted{font-size:11px;line-height:1.45;color:#87938c}\n.social-status{display:inline-flex;align-items:center;width:max-content;max-width:100%;padding:4px 8px;border-radius:999px;background:#f1f5f2;color:#5f6f64;font-size:10px;font-weight:800;line-height:1.2}\n.social-status.is-success{background:#e7f7ed;color:#176b43}\n.social-status.is-danger{background:#fff0ef;color:#b42318}\n.social-status.is-warning{background:#fff7e6;color:#96630c}\n.social-status.is-info{background:#edf5ff;color:#225b92}\n.social-composer-panel{padding:22px}\n.social-post-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin-top:17px}\n.social-field{display:grid;align-content:start;gap:6px;color:#33493b;font-size:12px;font-weight:750}\n.social-field .input{width:100%;min-width:0}\n.social-field textarea{min-height:124px;resize:vertical;line-height:1.55}\n.social-field small{color:#819087;font-size:10px;font-weight:450;line-height:1.45}\n.social-field.full,.social-form-section.full,.social-composer-notice.full,.social-form-actions.full{grid-column:1/-1}\n.social-form-section{display:grid;gap:10px}\n.social-form-section-title{display:flex;justify-content:space-between;gap:10px;align-items:baseline}\n.social-form-section-title strong{font-size:12px;color:#33493b}\n.social-form-section-title span{font-size:10px;color:#87938c}\n.social-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n.social-provider-option{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 10px;border:1px solid #e4ebe5;border-radius:12px;background:#fff}\n.social-provider-main{display:flex;align-items:center;gap:8px;min-width:0}\n.social-provider-main input{accent-color:#176b43}\n.social-provider-name{font-size:11px;font-weight:800;color:#31463a}\n.social-mode-select{width:145px;max-width:48%;padding:7px 8px;font-size:10px}\n.social-composer-notice{padding:11px 13px;border-radius:11px;background:#f4f8f5;color:#68796e;font-size:11px;line-height:1.55}\n.social-composer-notice strong{color:#315842}\n.social-form-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}\n.social-form-actions #socialFormFeedback{font-size:11px;color:#176b43}\n.social-form-actions #socialFormFeedback.is-error{color:#b42318}\n.social-form-actions #socialFormFeedback.is-success{color:#176b43}\n.social-post-list{display:grid;gap:10px}\n.social-post-card{display:flex;justify-content:space-between;gap:18px;padding:16px 17px;border:1px solid #e4ebe5;border-radius:15px;background:#fff}\n.social-post-copy{display:grid;gap:8px;min-width:0}\n.social-post-title-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap}\n.social-post-title-line h4{margin:0;color:#213b2a;font-size:14px}\n.social-post-copy>p{margin:0;max-width:760px;color:#65736b;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}\n.social-post-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#87938c;font-size:10px}\n.social-media-indicator{padding:3px 7px;border-radius:999px;background:#f1f5f2;color:#5f6f64}\n.social-channel-list{display:flex;gap:6px;flex-wrap:wrap}\n.social-channel-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #e5ece7;border-radius:8px;color:#53675a;font-size:10px}\n.social-channel-chip small{color:#8a968e;font-size:9px}\n.social-post-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;flex:0 0 auto}\n.social-post-actions .btn{min-height:33px;padding:7px 9px;font-size:10px}\n.social-empty-state{padding:30px 20px;border:1px dashed #cfdbd1;border-radius:15px;text-align:center;background:#fbfdfb}\n.social-empty-icon{display:grid;place-items:center;width:40px;height:40px;margin:0 auto 10px;border-radius:13px;background:#eff7f1;color:#176b43;font-size:23px}\n.social-empty-state h3{margin:0 0 6px;color:#254431;font-size:15px}\n.social-empty-state p{margin:0;color:#829087;font-size:11px}\n.social-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}\n.social-calendar-day{display:grid;align-content:start;gap:8px;min-height:100px;padding:10px;border:1px solid #e4ebe5;border-radius:12px;background:#fff}\n.social-calendar-date{display:flex;justify-content:space-between;align-items:center;gap:5px;color:#52675a;font-size:10px;font-weight:750;text-transform:capitalize}\n.social-calendar-date strong{display:grid;place-items:center;min-width:20px;height:20px;border-radius:7px;background:#eff7f1;color:#176b43;font-size:10px}\n.social-calendar-event{display:grid;gap:3px;padding:7px;border-left:2px solid #176b43;border-radius:5px;background:#f5faf6}\n.social-calendar-event time{color:#176b43;font-size:9px;font-weight:850}\n.social-calendar-event span{color:#43594a;font-size:9px;line-height:1.3;overflow-wrap:anywhere}\n.social-calendar-empty{color:#a2ada5;font-size:9px;line-height:1.4}\n.social-loading{display:flex;align-items:center;gap:12px}\n.social-loading p{margin:0;color:#718078;font-size:12px}\n.social-error{border-color:#f1d4d2}\n.social-error h3{margin-top:0;color:#9f2f28}\n.social-error p{font-size:12px;color:#68796e;overflow-wrap:anywhere}\n.social-security-footnote{margin:0;color:#88938c;font-size:10px;line-height:1.5}\n@media(max-width:1100px){.social-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.social-account-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.social-calendar-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}\n@media(max-width:760px){.social-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.social-account-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.social-post-card{display:grid}.social-post-actions{justify-content:flex-start}.social-composer-panel{padding:16px}.social-calendar-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:540px){.social-welcome{padding:19px}.social-welcome-mark{width:48px;height:48px;flex-basis:48px}.social-post-form{grid-template-columns:1fr}.social-field.full,.social-form-section.full,.social-composer-notice.full,.social-form-actions.full{grid-column:1}.social-provider-grid{grid-template-columns:1fr}.social-mode-select{max-width:52%}.social-section-heading h3{font-size:17px}.social-stat-card{padding:13px}.social-stat-card strong{font-size:23px}}\n\n.social-account-name{margin-top:2px}\n.social-disconnect-button{justify-self:start;padding:4px 7px;border:1px solid #ead8d6;border-radius:7px;background:#fff;color:#9e3d37;font-size:10px;font-weight:700;cursor:pointer}\n.social-disconnect-button:hover{background:#fff5f4}\n.social-connect-button{justify-self:start;margin-top:3px}\n.social-calendar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}\n.social-calendar-actions .btn{white-space:nowrap}\n.social-channel-chip{flex-wrap:wrap}\n.social-channel-chip a{color:#176b43;font-size:9px;font-weight:800;text-decoration:underline}\n.social-channel-error{flex-basis:100%;color:#a33f35!important;font-size:9px!important;line-height:1.35}\n.social-feedback-notice[hidden]{display:none}\n.social-feedback-notice{display:flex;align-items:flex-start}\n@media(max-width:760px){.social-calendar-actions{justify-content:flex-start}}\n\n.social-caption-adaptations{border:1px solid #e4ebe5;border-radius:12px;padding:12px 14px;background:#fbfdfb}\n.social-caption-adaptations summary{cursor:pointer;font-size:12px;font-weight:800;color:#315842}\n.social-caption-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}\n.social-caption-grid textarea{min-height:74px;resize:vertical}\n.social-platform-activity-list{display:grid;gap:9px}\n.social-platform-activity{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:13px 15px;border:1px solid #e4ebe5;border-radius:13px;background:#fff}\n.social-platform-activity-name{display:flex;align-items:center;gap:9px;min-width:140px}\n.social-platform-activity-name strong{font-size:12px;color:#31463a}\n.social-platform-activity-counts{display:flex;gap:16px;flex-wrap:wrap;color:#829087;font-size:10px}\n.social-platform-activity-counts strong{color:#234b32;font-size:14px;margin-right:3px}\n@media(max-width:620px){.social-caption-grid{grid-template-columns:1fr}.social-platform-activity{align-items:flex-start;flex-direction:column}.social-platform-activity-counts{gap:12px}}\n";

function patchSocialText(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    console.error("SAMA-PACK social asset patch point not found.");
    return source;
  }
  return source.replace(before, after);
}

function socialAdminResponse(body, request, contentType, cacheControl) {
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": cacheControl || "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff"
  });
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

async function serveSocialAdminAssets(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/social-admin.js") {
    return socialAdminResponse(SOCIAL_ADMIN_JS, request, "application/javascript; charset=utf-8");
  }
  if (url.pathname === "/social-admin.css") {
    return socialAdminResponse(SOCIAL_ADMIN_CSS, request, "text/css; charset=utf-8");
  }

  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;

  const path = url.pathname;
  if (path !== "/" && path !== "/index.html" && path !== "/admin-panel.js" && path !== "/app.js") return response;

  const nl = String.fromCharCode(10);
  let body = await response.text();

  if (path === "/" || path === "/index.html") {
    if (!body.includes("social-admin.css")) {
      body = body.replace("</head>", '<link rel="stylesheet" href="/social-admin.css?v=20261111-social-v1">' + nl + "</head>");
    }
    body = body.replace(
      'src="admin-panel.js?v=20261105-responsive-tables-click-view-v1"',
      'src="admin-panel.js?v=20261111-social-admin-v1"'
    );
    body = body.replace(
      '<script src="app.js?v=20261110-webpush-v2" defer></script>',
      '<script src="social-admin.js?v=20261111-social-v1" defer></script>' + nl +
      '<script src="app.js?v=20261111-social-admin-v1" defer></script>'
    );
  }

  if (path === "/admin-panel.js") {
    const before = '              <section class="admin-nav-group" aria-label="Administration">';
    const after = [
      '              <section class="admin-nav-group" aria-label="Marketing et communication">',
      '                <span class="admin-nav-heading">MARKETING &amp; COMMUNICATION</span>',
      '                <button class="side-btn" type="button" data-view="social"><span class="admin-nav-icon" aria-hidden="true">◎</span><span>Réseaux sociaux</span></button>',
      '              </section>',
      '',
      before
    ].join(nl);
    body = patchSocialText(body, before, after);
  }

  if (path === "/app.js") {
    body = patchSocialText(
      body,
      'stock: "stock.view", expenses: "expenses.submit", deliveries: "orders.view"',
      'stock: "stock.view", expenses: "expenses.submit", deliveries: "orders.view", social: "social.view"'
    );
    body = patchSocialText(
      body,
      'marketing:"Campagnes e-mail",contacts:"Messages de contact",deliveries:"SAMA-PACK Livraison"',
      'marketing:"Campagnes e-mail",social:"Réseaux sociaux",contacts:"Messages de contact",deliveries:"SAMA-PACK Livraison"'
    );
    body = patchSocialText(
      body,
      '      if (view === "prospects")',
      [
        '      if (view === "social") {',
        '        if (!window.SamaPackSocialAdmin || typeof window.SamaPackSocialAdmin.mount !== "function") {',
        '          throw new Error("Le module Réseaux sociaux n’a pas pu être chargé. Recharge la page.");',
        '        }',
        '        await window.SamaPackSocialAdmin.mount({',
        '          root: $("adminContent"), client, currentUser, currentProfile,',
        '          canView: canViewAdminView("social"),',
        '          canManage: hasAdminPermission("social.manage"),',
        '          canPublish: hasAdminPermission("social.publish"),',
        '          canManageAccounts: hasAdminPermission("social.accounts.manage")',
        '        });',
        '        return;',
        '      }',
        '      if (view === "prospects")'
      ].join(nl)
    );
    body = patchSocialText(
      body,
      '    ["expenses.submit", "Soumettre des dépenses", "Déclarer des dépenses en attente de validation par le propriétaire."]',
      [
        '    ["expenses.submit", "Soumettre des dépenses", "Déclarer des dépenses en attente de validation par le propriétaire."],',
        '    ["social.view", "Consulter les réseaux sociaux", "Voir les comptes, le calendrier et les publications SAMA-PACK."],',
        '    ["social.manage", "Créer et gérer les contenus", "Créer, modifier et programmer les publications et gérer les médias."],',
        '    ["social.publish", "Valider les publications", "Approuver les programmations préparées par un collaborateur."],',
        '    ["social.accounts.manage", "Gérer les comptes sociaux", "Autoriser la connexion et la révocation des comptes officiels."]'
      ].join(nl)
    );
    body = patchSocialText(
      body,
      '      else if (requestedAction === "manage") await openAdmin();',
      [
        '      else if (requestedAction === "manage") {',
        '        await openAdmin();',
        '        if (urlParams.get("view") === "social" && isAdmin()) await showAdminView("social");',
        '      }'
      ].join(nl)
    );
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  if (path === "/" || path === "/index.html") headers.set("cache-control", "no-store");
  return new Response(request.method === "HEAD" ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // URL canonique : www.sama-pack.store redirige définitivement vers sama-pack.store.
    if (url.hostname.toLowerCase() === "www.sama-pack.store") {
      url.hostname = "sama-pack.store";
      return Response.redirect(url.toString(), 301);
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
    return serveSocialAdminAssets(request, env);
  }
};
