const SITE_URL = "https://sama-pack.store";
const SUPABASE_URL = "https://tbxxrnhcfuaeaatlrdtr.supabase.co";
// Clé publishable déjà utilisée par la boutique. Les règles RLS limitent les lectures publiques aux fiches actives.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo";
const PRODUCT_COLUMNS = [
  "id", "public_ref", "name", "category", "price", "description", "items",
  "image_path", "image_paths", "active", "catalog_type", "availability_status",
  "brand", "sale_unit", "promo_active", "promo_price", "promo_started_at",
  "promo_end_at", "updated_at", "created_at"
].join(",");

const STATIC_PAGES = [
  "/", "/produits.html", "/outils.html", "/comment-ca-marche.html",
  "/contact.html", "/conditions-vente.html", "/livraison-retours.html",
  "/confidentialite.html"
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
    return env.ASSETS.fetch(request);
  }
};
