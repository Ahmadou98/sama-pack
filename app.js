/* =========================================================
   SAMA-PACK
   Boutique + Gestion commerciale + Supabase
   ========================================================= */

const SUPABASE_URL = "https://tbxxrnhcfuaeaatlrdtr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo";

const REST_URL = `${SUPABASE_URL}/rest/v1`;
const CART_KEY = "sama_pack_cart_v2";
const ADMIN_TOKEN_KEY = "sama_pack_admin_token";

let products = [];
let db = {
  settings: {
    company: "SAMA-PACK",
    whatsapp: "221770000000",
    deliveryFee: 1500,
    currency: "FCFA"
  },
  cart: [],
  orders: [],
  customers: [],
  stock: [],
  suppliers: [],
  expenses: [],
  quotes: []
};

/* =========================================================
   IMAGES 
   ========================================================= */

const imageById = {
  SP01: "images/Pack Grand Ménage.jpeg",
  SP02: "images/Pack hygiène bébé.jpeg",
  SP03: "images/Pack Mini-Menage.jpeg",
  SP04: "images/Pack douche.jpeg",
  SP05: "images/Pack keur gui.jpeg",
  SP06: "images/Pack cuisine.jpeg",
  SP07: "images/Pack linge.jpeg",
  SP08: "images/Pack Fraicheur.jpeg",
 
  SP10: "images/Pack eco coloc.jpeg"
};

function imageSrc(id, fallback = "") {
  const path = imageById[id] || fallback || "";
  return path ? encodeURI(path) : "";
}

/* =========================================================
   OUTILS
   ========================================================= */

function cleanName(name) {
  return String(name ?? "")
    .replace(/[🧼👶🧽💼🍳🌸🏡🎉🏪]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeProduct(p) {
  return {
    id: p.id,
    name: cleanName(p.name),
    cat: p.category ?? p.cat ?? "",
    price: Number(p.price ?? 0),
    desc: p.description ?? p.desc ?? "",
    items: Array.isArray(p.items) ? p.items : [],
    image_path: p.image_path || imageById[p.id] || "",
    active: p.active !== false
  };
}

function money(n) {
  return new Intl.NumberFormat("fr-FR")
    .format(Math.round(Number(n) || 0)) + " FCFA";
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2300);
}

function getP(id) {
  return products.find(p => p.id === id) || null;
}

/* =========================================================
   SUPABASE HTTP
   ========================================================= */

async function supabaseFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error_description ||
      data?.error ||
      "Erreur de connexion à Supabase.";

    throw new Error(message);
  }

  return data;
}

async function supabaseGet(table, query = "") {
  return supabaseFetch(
    `${REST_URL}/${table}${query}`
  );
}

async function supabaseRpc(functionName, params = {}) {
  return supabaseFetch(
    `${REST_URL}/rpc/${functionName}`,
    {
      method: "POST",
      body: JSON.stringify(params)
    }
  );
}

/* =========================================================
   CART LOCAL
   Le panier reste local.
   Les commandes, clients, stock, etc. sont dans Supabase.
   ========================================================= */

function loadCart() {
  try {
    db.cart =
      JSON.parse(
        localStorage.getItem(CART_KEY)
      ) || [];
  } catch {
    db.cart = [];
  }
}

function saveCart() {
  localStorage.setItem(
    CART_KEY,
    JSON.stringify(db.cart)
  );
}

/* =========================================================
   CHARGEMENT BOUTIQUE
   ========================================================= */

async function loadShopData() {
  const [productData, settingsData] =
    await Promise.all([

      supabaseGet(
        "products",
        "?select=id,name,category,price,description,items,image_path,active&active=eq.true&order=id"
      ),

      supabaseGet(
        "settings",
        "?select=company,whatsapp,delivery_fee,currency&id=eq.true"
      )
    ]);

  products = (productData || [])
    .map(normalizeProduct);

  if (!products.length) {
    products =
      (window.SAMA_PRODUCTS || [])
        .map(p =>
          normalizeProduct({
            ...p,
            category: p.cat,
            description: p.desc,
            image_path: imageById[p.id]
          })
        );
  }

  if (settingsData?.[0]) {
    db.settings = {
      company:
        settingsData[0].company ||
        "SAMA-PACK",

      whatsapp:
        settingsData[0].whatsapp ||
        "221770000000",

      deliveryFee:
        Number(
          settingsData[0].delivery_fee ?? 0
        ),

      currency:
        settingsData[0].currency ||
        "FCFA"
    };
  }
}

/* =========================================================
   WHATSAPP
   ========================================================= */

function whatsappUrl(message) {
  const number =
    String(
      db.settings.whatsapp || ""
    ).replace(/\D/g, "");

  if (!number) return "#";

  return (
    `https://wa.me/${number}` +
    `?text=${encodeURIComponent(message)}`
  );
}

function openWA(message) {
  const url = whatsappUrl(message);

  if (url === "#") {
    toast(
      "Configure le numéro WhatsApp dans Gestion > Paramètres."
    );
    return;
  }

  window.open(
    url,
    "_blank",
    "noopener"
  );
}

/* =========================================================
   BOUTIQUE
   ========================================================= */

async function initShop() {

  loadCart();

  try {
    await loadShopData();
  } catch (error) {

    console.error(error);

    products =
      (window.SAMA_PRODUCTS || [])
        .map(p =>
          normalizeProduct({
            ...p,
            category: p.cat,
            description: p.desc,
            image_path: imageById[p.id]
          })
        );

    toast(
      "Connexion base de données indisponible. Catalogue local chargé."
    );
  }

  const year =
    document.getElementById("year");

  if (year) {
    year.textContent =
      new Date().getFullYear();
  }

  const categoryFilter =
    document.getElementById(
      "categoryFilter"
    );

  if (categoryFilter) {

    const categories = [
      ...new Set(
        products.map(p => p.cat)
      )
    ];

    categoryFilter.innerHTML =
      '<option value="all">Toutes les catégories</option>' +
      categories
        .map(
          category =>
            `<option value="${esc(category)}">${esc(category)}</option>`
        )
        .join("");
  }

  renderTop();
  renderProducts();
  updateCartCount();
  updateContact();

  const searchBox =
    document.getElementById(
      "searchBox"
    );

  if (searchBox) {
    searchBox.addEventListener(
      "input",
      renderProducts
    );
  }

  if (categoryFilter) {
    categoryFilter.addEventListener(
      "change",
      renderProducts
    );
  }

  const cartButton =
    document.getElementById(
      "openCartBtn"
    );

  if (cartButton) {
    cartButton.onclick =
      renderCartModal;
  }

  const heroWhatsApp =
    document.getElementById(
      "heroWhatsApp"
    );

  if (heroWhatsApp) {
    heroWhatsApp.onclick =
      () =>
        openWA(
          "Bonjour SAMA-PACK, je souhaite passer une commande."
        );
  }

  const contactWhatsApp =
    document.getElementById(
      "contactWhatsApp"
    );

  if (contactWhatsApp) {
    contactWhatsApp.onclick =
      () =>
        openWA(
          "Bonjour SAMA-PACK, je souhaite avoir plus d'informations."
        );
  }

  const quoteBtn =
    document.getElementById(
      "quoteBtn"
    );

  if (quoteBtn) {
    quoteBtn.onclick =
      openQuoteModal;
  }

  const adminBtn =
    document.getElementById(
      "adminBtn"
    );

  if (adminBtn) {
    adminBtn.onclick =
      openAdmin;
  }

  const footerAdmin =
    document.getElementById(
      "footerAdmin"
    );

  if (footerAdmin) {
    footerAdmin.onclick = e => {
      e.preventDefault();
      openAdmin();
    };
  }

  const viewShopBtn =
    document.getElementById(
      "viewShopBtn"
    );

  if (viewShopBtn) {
    viewShopBtn.onclick =
      closeAdmin;
  }

  const closeAdminBtn =
    document.getElementById(
      "closeAdminBtn"
    );

  if (closeAdminBtn) {
    closeAdminBtn.onclick =
      closeAdmin;
  }
}

function updateContact() {
  const el =
    document.getElementById(
      "contactPhone"
    );

  if (!el) return;

  el.textContent =
    db.settings.whatsapp
      ? "+" +
        String(
          db.settings.whatsapp
        ).replace(/\D/g, "")
      : "Numéro à configurer";
}

/* =========================================================
   TOP VENTES
   ========================================================= */

function renderTop() {

  const target =
    document.getElementById(
      "heroTopPacks"
    );

  if (!target) return;

  const tops =
    products.slice(0, 3);

  target.innerHTML =
    tops
      .map(p => {

        const image =
          imageSrc(
            p.id,
            p.image_path
          );

        return `
          <div class="mini-pack">

            <div
              class="mini-icon"
              style="
                width:76px;
                height:76px;
                min-width:76px;
                display:flex;
                align-items:center;
                justify-content:center;
                overflow:hidden;
                border-radius:14px;
                background:#f8fafc;
              "
            >

              ${
                image
                  ? `
                    <img
                      src="${image}"
                      alt="${esc(p.name)}"
                      style="
                        width:100%;
                        height:100%;
                        object-fit:contain;
                        display:block;
                      "
                    >
                  `
                  : "📦"
              }

            </div>

            <div>

              <strong>
                ${esc(p.name)}
              </strong>

              <small>
                ${money(p.price)}
              </small>

            </div>

          </div>
        `;

      })
      .join("");
}

/* =========================================================
   CATALOGUE
   ========================================================= */

function renderProducts() {

  const searchBox =
    document.getElementById(
      "searchBox"
    );

  const categoryFilter =
    document.getElementById(
      "categoryFilter"
    );

  const productGrid =
    document.getElementById(
      "productGrid"
    );

  if (
    !searchBox ||
    !categoryFilter ||
    !productGrid
  ) {
    return;
  }

  const q =
    searchBox.value
      .toLowerCase()
      .trim();

  const category =
    categoryFilter.value;

  const filtered =
    products.filter(p => {

      if (!p.active) return false;

      const searchable =
        p.name
          .toLowerCase()
          .includes(q) ||

        p.desc
          .toLowerCase()
          .includes(q) ||

        p.cat
          .toLowerCase()
          .includes(q);

      return (
        searchable &&
        (
          category === "all" ||
          p.cat === category
        )
      );
    });

  productGrid.innerHTML =
    filtered
      .map(
        productCard
      )
      .join("") ||
    '<div class="empty">Aucun pack trouvé.</div>';
}

/* =========================================================
   CARTE PRODUIT
   ========================================================= */

function productCard(p) {

  const image =
    imageSrc(
      p.id,
      p.image_path
    );

  return `
    <article class="product-card">

      <div
        class="pack-visual"
        style="
          width:100%;
          min-height:340px;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        "
      >

        <div
          class="pack-box"
          style="
            width:100%;
            height:340px;
            display:flex;
            align-items:center;
            justify-content:center;
            overflow:hidden;
            position:relative;
          "
        >

          ${
            image
              ? `
                <img
                  src="${image}"
                  alt="${esc(p.name)}"
                  loading="lazy"
                  style="
                    display:block;
                    width:100%;
                    height:100%;
                    object-fit:contain;
                    border-radius:14px;
                  "
                >
              `
              : `
                <div
                  style="
                    font-size:60px;
                  "
                >
                  📦
                </div>
              `
          }

          <div class="pack-code">
            ${p.id}
          </div>

        </div>
      </div>

      <div class="product-body">

        <div class="product-cat">
          ${esc(p.cat)}
        </div>

        <div class="product-name">
          ${esc(p.name)}
        </div>

        <div class="product-desc">
          ${esc(p.desc)}
        </div>

        <div class="price-row">

          <div class="price">
            ${money(p.price)}
          </div>

          <span class="small-note">
            TTC
          </span>

        </div>

        <div class="product-actions">

          <button
            class="btn ghost"
            onclick="openProduct('${p.id}')"
          >
            Détails
          </button>

          <button
            class="btn primary"
            onclick="addToCart('${p.id}')"
          >
            Ajouter
          </button>

        </div>

      </div>

    </article>
  `;
}

/* =========================================================
   PRODUIT — DÉTAILS
   ========================================================= */

function openProduct(id) {

  const p = getP(id);

  if (!p) {
    toast("Produit introuvable.");
    return;
  }

  const image =
    imageSrc(
      p.id,
      p.image_path
    );

  showModal(`
    <div class="modal-head">

      <div>

        <div class="eyebrow">
          ${esc(p.cat)}
        </div>

        <h2>
          ${esc(p.name)}
        </h2>

      </div>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <div
      style="
        width:100%;
        margin:15px 0 30px;
        display:flex;
        justify-content:center;
        align-items:center;
      "
    >

      ${
        image
          ? `
            <img
              src="${image}"
              alt="${esc(p.name)}"
              style="
                display:block;
                width:100%;
                max-width:950px;
                height:auto;
                max-height:650px;
                object-fit:contain;
                border-radius:16px;
              "
            >
          `
          : `
            <div
              style="
                height:400px;
                width:100%;
                display:flex;
                justify-content:center;
                align-items:center;
                font-size:80px;
              "
            >
              📦
            </div>
          `
      }

    </div>

    <p>
      ${esc(p.desc)}
    </p>

    <ul class="pack-items">

      ${
        p.items
          .map(
            item =>
              `<li>${esc(item)}</li>`
          )
          .join("")
      }

    </ul>

    <div class="price-row">

      <div class="price">
        ${money(p.price)}
      </div>

      <button
        class="btn primary"
        onclick="
          addToCart('${p.id}');
          closeModal();
          renderProducts();
        "
      >
        Ajouter au panier
      </button>

    </div>
  `);
}

/* =========================================================
   MODALE
   ========================================================= */

function showModal(body) {

  const root =
    document.getElementById(
      "modalRoot"
    );

  if (!root) return;

  root.innerHTML = `
    <div
      class="modal"
      style="
        position:fixed;
        inset:0;
        width:100vw;
        height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        box-sizing:border-box;
        overflow-y:auto;
        z-index:9999;
      "
      onclick="
        if(event.target===this)closeModal()
      "
    >

      <div
        class="modal-card"
        style="
          width:95vw !important;
          max-width:1100px !important;
          max-height:92vh !important;
          overflow-y:auto;
          box-sizing:border-box;
          margin:auto;
        "
      >

        ${body}

      </div>

    </div>
  `;
}

function closeModal() {
  const root =
    document.getElementById(
      "modalRoot"
    );

  if (root) {
    root.innerHTML = "";
  }
}

/* =========================================================
   PANIER
   ========================================================= */

function addToCart(id) {

  const product = getP(id);

  if (!product) {
    toast("Produit introuvable.");
    return;
  }

  const existing =
    db.cart.find(
      item => item.id === id
    );

  if (existing) {
    existing.qty++;
  } else {
    db.cart.push({
      id,
      qty:1
    });
  }

  saveCart();
  updateCartCount();

  toast(
    "Pack ajouté au panier."
  );
}

function updateCartCount() {

  const el =
    document.getElementById(
      "cartCount"
    );

  if (!el) return;

  el.textContent =
    db.cart.reduce(
      (sum, item) =>
        sum + Number(item.qty || 0),
      0
    );
}

function changeQty(id, amount) {

  const item =
    db.cart.find(
      x => x.id === id
    );

  if (!item) return;

  item.qty += amount;

  if (item.qty <= 0) {
    db.cart =
      db.cart.filter(
        x => x.id !== id
      );
  }

  saveCart();
  updateCartCount();
  renderCartModal();
}

function cartTotals() {

  const subtotal =
    db.cart.reduce(
      (sum, item) => {

        const product =
          getP(item.id);

        return product
          ? sum +
            product.price *
            Number(item.qty || 0)
          : sum;

      },
      0
    );

  const delivery =
    Number(
      db.settings.deliveryFee || 0
    );

  return {
    subtotal,
    delivery,
    total:
      subtotal + delivery
  };
}

function renderCartModal() {

  if (!db.cart.length) {

    showModal(`
      <div class="modal-head">

        <h2>
          Ton panier
        </h2>

        <button
          class="close"
          onclick="closeModal()"
        >
          ✕
        </button>

      </div>

      <div class="empty">

        Ton panier est vide.

        <br><br>

        <a
          class="btn primary"
          href="#catalogue"
          onclick="closeModal()"
        >
          Voir le catalogue
        </a>

      </div>
    `);

    return;
  }

  const totals =
    cartTotals();

  showModal(`
    <div class="modal-head">

      <div>

        <div class="eyebrow">
          COMMANDE
        </div>

        <h2>
          Ton panier
        </h2>

      </div>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <div class="cart-list">

      ${
        db.cart.map(item => {

          const p =
            getP(item.id);

          if (!p) return "";

          const image =
            imageSrc(
              p.id,
              p.image_path
            );

          return `
            <div class="cart-item">

              <div
                class="mini-icon"
                style="
                  width:70px;
                  height:70px;
                  min-width:70px;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  overflow:hidden;
                  border-radius:12px;
                  background:#f8fafc;
                "
              >

                ${
                  image
                    ? `
                      <img
                        src="${image}"
                        alt="${esc(p.name)}"
                        style="
                          width:100%;
                          height:100%;
                          object-fit:contain;
                          display:block;
                        "
                      >
                    `
                    : "📦"
                }

              </div>

              <div>

                <strong>
                  ${esc(p.name)}
                </strong>

                <div class="small-note">
                  ${money(p.price)} / pack
                </div>

              </div>

              <div class="qty">

                <button
                  onclick="
                    changeQty('${p.id}',-1)
                  "
                >
                  −
                </button>

                <b>
                  ${item.qty}
                </b>

                <button
                  onclick="
                    changeQty('${p.id}',1)
                  "
                >
                  +
                </button>

              </div>

            </div>
          `;

        }).join("")
      }

    </div>

    <div class="summary">

      <div class="summary-row">

        <span>
          Sous-total
        </span>

        <strong>
          ${money(totals.subtotal)}
        </strong>

      </div>

      <div class="summary-row">

        <span>
          Livraison
        </span>

        <strong>
          ${money(totals.delivery)}
        </strong>

      </div>

      <div class="summary-row total">

        <span>
          Total
        </span>

        <strong>
          ${money(totals.total)}
        </strong>

      </div>

    </div>

    <div style="height:12px"></div>

    <button
      class="btn primary full"
      onclick="checkoutModal()"
    >
      Passer la commande
    </button>
  `);
}

/* =========================================================
   COMMANDER
   ========================================================= */

function checkoutModal() {

  if (!db.cart.length) {
    toast("Ton panier est vide.");
    return;
  }

  const totals =
    cartTotals();

  showModal(`
    <div class="modal-head">

      <div>

        <div class="eyebrow">
          CHECKOUT
        </div>

        <h2>
          Finaliser la commande
        </h2>

      </div>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <form
      id="checkoutForm"
      class="checkout-grid"
    >

      <input
        class="input"
        name="name"
        required
        placeholder="Nom complet"
      >

      <input
        class="input"
        name="phone"
        required
        placeholder="Téléphone"
      >

      <input
        class="input full"
        name="address"
        required
        placeholder="Adresse de livraison"
      >

      <input
        class="input"
        name="zone"
        placeholder="Zone / quartier"
      >

      <input
        class="input"
        name="slot"
        placeholder="Créneau souhaité"
      >

      <select
        class="input full"
        name="pay"
      >

        <option>
          Paiement à la livraison
        </option>

        <option>
          À confirmer
        </option>

      </select>

      <div class="summary full">

        <div class="summary-row">

          <span>
            Total
          </span>

          <strong>
            ${money(totals.total)}
          </strong>

        </div>

        <div class="small-note">
          La commande sera enregistrée dans la base de données SAMA-PACK.
        </div>

      </div>

      <button
        class="btn primary full"
      >
        Confirmer la commande
      </button>

    </form>
  `);

  const form =
    document.getElementById(
      "checkoutForm"
    );

  if (!form) return;

  form.onsubmit =
    async e => {

      e.preventDefault();

      const button =
        form.querySelector(
          "button[type='submit'], button.btn.primary"
        );

      if (button) {
        button.disabled = true;
        button.textContent =
          "Enregistrement...";
      }

      const f =
        new FormData(form);

      const orderId =
        "CMD-" +
        Date.now()
          .toString()
          .slice(-7);

      const payload = {

        orderId,

        customer: {

          name:
            String(
              f.get("name") || ""
            ).trim(),

          phone:
            String(
              f.get("phone") || ""
            ).trim(),

          address:
            String(
              f.get("address") || ""
            ).trim(),

          zone:
            String(
              f.get("zone") || ""
            ).trim()
        },

        slot:
          String(
            f.get("slot") || ""
          ),

        payment:
          String(
            f.get("pay") ||
            "Paiement à la livraison"
          ),

        items:
          db.cart.map(
            item => ({
              id:item.id,
              qty:Number(
                item.qty || 1
              )
            })
          )
      };

      try {

        const result =
          await supabaseRpc(
            "sama_create_order",
            {
              p_payload:
                payload
            }
          );

        db.cart = [];
        saveCart();
        updateCartCount();

        closeModal();

        toast(
          "Commande enregistrée dans la base."
        );

        const order =
          result?.order || {};

        const lines =
          Array.isArray(
            order.items
          )
            ? order.items
                .map(
                  item =>
                    `${item.quantity} x ${item.product_name}`
                )
                .join("\n")
            : "";

        openWA(
          `Bonjour SAMA-PACK, je confirme la commande ${order.id || orderId}.\n\n` +
          `${lines}\n\n` +
          `Total: ${money(order.total || 0)}\n` +
          `Nom: ${payload.customer.name}\n` +
          `Téléphone: ${payload.customer.phone}\n` +
          `Adresse: ${payload.customer.address}`
        );

      } catch (error) {

        console.error(error);

        toast(
          "Impossible d'enregistrer la commande : " +
          error.message
        );

        if (button) {
          button.disabled = false;
          button.textContent =
            "Confirmer la commande";
        }
      }
    };
}

/* =========================================================
   DEVIS PUBLIC
   ========================================================= */

function openQuoteModal() {

  showModal(`
    <div class="modal-head">

      <div>

        <div class="eyebrow">
          B2B
        </div>

        <h2>
          Demander un devis
        </h2>

      </div>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <form
      id="quoteForm"
      class="checkout-grid"
    >

      <input
        class="input"
        name="company"
        required
        placeholder="Entreprise / structure"
      >

      <input
        class="input"
        name="phone"
        required
        placeholder="Téléphone"
      >

      <input
        class="input full"
        name="need"
        required
        placeholder="Besoin (ex. 20 packs pro / mois)"
      >

      <input
        class="input"
        name="email"
        placeholder="Email"
      >

      <textarea
        class="input full"
        name="message"
        placeholder="Précisions"
      ></textarea>

      <button
        class="btn primary full"
      >
        Envoyer la demande
      </button>

    </form>
  `);

  const form =
    document.getElementById(
      "quoteForm"
    );

  if (!form) return;

  form.onsubmit =
    async e => {

      e.preventDefault();

      const button =
        form.querySelector(
          "button.btn.primary"
        );

      if (button) {
        button.disabled = true;
        button.textContent =
          "Enregistrement...";
      }

      const f =
        new FormData(form);

      const quote = {

        id:
          "DEV-" +
          Date.now()
            .toString()
            .slice(-7),

        company:
          String(
            f.get("company") || ""
          ).trim(),

        phone:
          String(
            f.get("phone") || ""
          ).trim(),

        email:
          String(
            f.get("email") || ""
          ).trim(),

        need:
          String(
            f.get("need") || ""
          ).trim(),

        message:
          String(
            f.get("message") || ""
          ).trim()
      };

      try {

        const result =
          await supabaseRpc(
            "sama_create_quote",
            {
              p_payload:
                quote
            }
          );

        closeModal();

        toast(
          "Demande de devis enregistrée."
        );

        openWA(
          `Bonjour SAMA-PACK, demande de devis ${result?.id || quote.id}.\n` +
          `Structure: ${quote.company}\n` +
          `Besoin: ${quote.need}\n` +
          `Téléphone: ${quote.phone}\n` +
          `${quote.message || ""}`
        );

      } catch (error) {

        console.error(error);

        toast(
          "Impossible d'enregistrer le devis : " +
          error.message
        );

        if (button) {
          button.disabled = false;
          button.textContent =
            "Envoyer la demande";
        }
      }
    };
}

/* =========================================================
   ADMIN — API
   ========================================================= */

function getAdminToken() {
  return sessionStorage.getItem(
    ADMIN_TOKEN_KEY
  );
}

function setAdminToken(token) {
  sessionStorage.setItem(
    ADMIN_TOKEN_KEY,
    token
  );
}

function clearAdminToken() {
  sessionStorage.removeItem(
    ADMIN_TOKEN_KEY
  );
}

async function adminRpc(
  functionName,
  extra = {}
) {

  const token =
    getAdminToken();

  if (!token) {
    throw new Error(
      "Session de gestion inexistante."
    );
  }

  return supabaseRpc(
    functionName,
    {
      p_token: token,
      ...extra
    }
  );
}

/* =========================================================
   OUVRIR GESTION
   ========================================================= */

async function openAdmin() {

  const currentToken =
    getAdminToken();

  if (currentToken) {

    try {

      await adminRpc(
        "sama_admin_dashboard"
      );

      document
        .getElementById(
          "adminPanel"
        )
        .classList
        .remove("hidden");

      await showAdminView(
        "dashboard"
      );

      return;

    } catch {
      clearAdminToken();
    }
  }

  const pin =
    prompt(
      "Code d’accès à la gestion commerciale :"
    );

  if (pin === null) {
    return;
  }

  try {

    const token =
      await supabaseRpc(
        "sama_admin_login",
        {
          p_pin:
            String(pin)
        }
      );

    setAdminToken(token);

    document
      .getElementById(
        "adminPanel"
      )
      .classList
      .remove("hidden");

    await showAdminView(
      "dashboard"
    );

  } catch (error) {

    console.error(error);

    toast(
      "Accès refusé : " +
      error.message
    );
  }
}

function closeAdmin() {

  const panel =
    document.getElementById(
      "adminPanel"
    );

  if (panel) {
    panel.classList.add(
      "hidden"
    );
  }
}

/* =========================================================
   NAVIGATION ADMIN
   ========================================================= */

const adminTitles = {
  dashboard:"Dashboard",
  orders:"Commandes",
  customers:"Clients",
  products:"Stock",
  suppliers:"Fournisseurs",
  expenses:"Dépenses",
  quotes:"Devis",
  settings:"Paramètres"
};

document
  .querySelectorAll(
    ".side-btn"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () =>
        showAdminView(
          button.dataset.view
        )
    );

  });

async function showAdminView(view) {

  document
    .querySelectorAll(
      ".side-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.view === view
      );

    });

  const title =
    document.getElementById(
      "adminTitle"
    );

  const content =
    document.getElementById(
      "adminContent"
    );

  if (title) {
    title.textContent =
      adminTitles[view] ||
      "Gestion";
  }

  if (!content) return;

  content.innerHTML =
    `
      <div
        class="panel"
        style="padding:30px;text-align:center"
      >
        Chargement...
      </div>
    `;

  try {

    let html = "";

    switch (view) {

      case "dashboard":
        html =
          await renderDashboard();
        break;

      case "orders":
        html =
          await renderOrders();
        break;

      case "customers":
        html =
          await renderCustomers();
        break;

      case "products":
        html =
          await renderStock();
        break;

      case "suppliers":
        html =
          await renderSuppliers();
        break;

      case "expenses":
        html =
          await renderExpenses();
        break;

      case "quotes":
        html =
          await renderQuotes();
        break;

      case "settings":
        html =
          await renderSettings();
        break;

      default:
        html =
          '<div class="empty">Page inconnue.</div>';
    }

    content.innerHTML = html;

    bindAdmin(view);

  } catch (error) {

    console.error(error);

    clearAdminToken();

    closeAdmin();

    toast(
      "Session de gestion expirée ou erreur : " +
      error.message
    );
  }
}

/* =========================================================
   DASHBOARD ADMIN
   ========================================================= */

async function renderDashboard() {

  const data =
    await adminRpc(
      "sama_admin_dashboard"
    );

  db.orders =
    data.recentOrders || [];

  return `

    <div class="admin-cards">

      <div class="kpi">
        <div class="label">
          CA commandes
        </div>
        <div class="value">
          ${money(data.ca || 0)}
        </div>
      </div>

      <div class="kpi">
        <div class="label">
          Commandes en cours
        </div>
        <div class="value">
          ${data.pending || 0}
        </div>
      </div>

      <div class="kpi">
        <div class="label">
          Valeur stock
        </div>
        <div class="value">
          ${money(data.stockValue || 0)}
        </div>
      </div>

      <div class="kpi">
        <div class="label">
          Alertes stock
        </div>
        <div class="value">
          ${data.low || 0}
        </div>
      </div>

    </div>

    <div class="admin-grid">

      <div class="panel">

        <h3>
          Dernières commandes
        </h3>

        ${
          (data.recentOrders || []).length
            ? `
              <div class="table-wrap">

                <table class="table">

                  <tr>
                    <th>ID</th>
                    <th>Client</th>
                    <th>Total</th>
                    <th>Statut</th>
                  </tr>

                  ${
                    data.recentOrders
                      .map(
                        order => `
                          <tr>

                            <td>
                              ${esc(order.id)}
                            </td>

                            <td>
                              ${esc(
                                order.customer?.name ||
                                ""
                              )}
                            </td>

                            <td>
                              ${money(
                                order.total
                              )}
                            </td>

                            <td>
                              <span
                                class="status ${esc(order.status)}"
                              >
                                ${esc(order.status)}
                              </span>
                            </td>

                          </tr>
                        `
                      )
                      .join("")
                  }

                </table>

              </div>
            `
            : `
              <div class="empty">
                Aucune commande.
              </div>
            `
        }

      </div>

      <div class="panel">

        <h3>
          À surveiller
        </h3>

        <p>
          Stock faible :
          <strong>
            ${data.low || 0}
          </strong>
        </p>

        <p>
          Demandes de devis :
          <strong>
            ${data.newQuotes || 0}
          </strong>
        </p>

        <p>
          Dépenses enregistrées :
          <strong>
            ${money(
              data.expenseTotal || 0
            )}
          </strong>
        </p>

      </div>

    </div>
  `;
}

/* =========================================================
   COMMANDES ADMIN
   ========================================================= */

async function renderOrders() {

  const data =
    await adminRpc(
      "sama_admin_orders"
    );

  db.orders =
    data.orders || [];

  if (!db.orders.length) {

    return `
      <div class="panel">
        <h3>
          Commandes (0)
        </h3>

        <div class="empty">
          Aucune commande pour le moment.
        </div>
      </div>
    `;
  }

  return `
    <div class="panel">

      <h3>
        Commandes (${db.orders.length})
      </h3>

      <div class="table-wrap">

        <table class="table">

          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Client</th>
            <th>Total</th>
            <th>Statut</th>
            <th>Action</th>
          </tr>

          ${
            db.orders
              .map(
                order => `

                  <tr>

                    <td>
                      ${esc(order.id)}
                    </td>

                    <td>
                      ${
                        order.created_at
                          ? new Date(
                              order.created_at
                            ).toLocaleDateString(
                              "fr-FR"
                            )
                          : "—"
                      }
                    </td>

                    <td>

                      ${esc(
                        order.customer?.name ||
                        ""
                      )}

                      <br>

                      <span class="small-note">
                        ${esc(
                          order.customer?.phone ||
                          ""
                        )}
                      </span>

                    </td>

                    <td>
                      ${money(order.total)}
                    </td>

                    <td>

                      <select
                        class="input"
                        onchange="
                          setOrderStatus(
                            '${order.id}',
                            this.value
                          )
                        "
                      >

                        ${
                          [
                            "new",
                            "processing",
                            "delivered",
                            "cancelled"
                          ]
                          .map(
                            status => `
                              <option
                                value="${status}"
                                ${
                                  order.status === status
                                    ? "selected"
                                    : ""
                                }
                              >
                                ${status}
                              </option>
                            `
                          )
                          .join("")
                        }

                      </select>

                    </td>

                    <td>

                      <button
                        class="btn small ghost"
                        onclick="
                          showOrder('${order.id}')
                        "
                      >
                        Voir
                      </button>

                    </td>

                  </tr>
                `
              )
              .join("")
          }

        </table>

      </div>

    </div>
  `;
}

function showOrder(id) {

  const order =
    db.orders.find(
      o => o.id === id
    );

  if (!order) {
    toast(
      "Commande introuvable."
    );
    return;
  }

  showModal(`

    <div class="modal-head">

      <div>

        <div class="eyebrow">
          COMMANDE
        </div>

        <h2>
          ${esc(order.id)}
        </h2>

      </div>

      <button
        class="close"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>

    <p>

      <strong>
        ${esc(
          order.customer?.name || ""
        )}
      </strong>

      ·

      ${esc(
        order.customer?.phone || ""
      )}

      <br>

      ${esc(
        order.customer?.address || ""
      )}

      ${order.customer?.zone
        ? " — " +
          esc(
            order.customer.zone
          )
        : ""}

    </p>

    <ul class="pack-items">

      ${
        (order.items || [])
          .map(
            item => `
              <li>
                ${item.quantity} ×
                ${esc(
                  item.product_name ||
                  ""
                )}
              </li>
            `
          )
          .join("")
      }

    </ul>

    <div class="summary">

      <div class="summary-row">

        <span>
          Sous-total
        </span>

        <strong>
          ${money(order.subtotal)}
        </strong>

      </div>

      <div class="summary-row">

        <span>
          Livraison
        </span>

        <strong>
          ${money(order.delivery)}
        </strong>

      </div>

      <div class="summary-row total">

        <span>
          Total
        </span>

        <strong>
          ${money(order.total)}
        </strong>

      </div>

    </div>
  `);
}

async function setOrderStatus(
  id,
  status
) {

  try {

    await adminRpc(
      "sama_admin_set_order_status",
      {
        p_id: id,
        p_status: status
      }
    );

    await showAdminView(
      "orders"
    );

    toast(
      "Statut de la commande mis à jour."
    );

  } catch (error) {

    toast(
      error.message
    );
  }
}

/* =========================================================
   CLIENTS ADMIN
   ========================================================= */

async function renderCustomers() {

  const data =
    await adminRpc(
      "sama_admin_customers"
    );

  db.customers =
    data.customers || [];

  return `

    <div class="panel">

      <h3>
        Clients (${db.customers.length})
      </h3>

      ${
        db.customers.length
          ? `
            <div class="table-wrap">

              <table class="table">

                <tr>

                  <th>
                    Nom
                  </th>

                  <th>
                    Téléphone
                  </th>

                  <th>
                    Zone
                  </th>

                  <th>
                    Commandes
                  </th>

                  <th>
                    Dernière commande
                  </th>

                </tr>

                ${
                  db.customers
                    .map(
                      customer => `

                        <tr>

                          <td>
                            ${esc(
                              customer.name
                            )}
                          </td>

                          <td>
                            ${esc(
                              customer.phone
                            )}
                          </td>

                          <td>
                            ${esc(
                              customer.zone ||
                              ""
                            )}
                          </td>

                          <td>
                            ${Number(
                              customer.orders_count ||
                              0
                            )}
                          </td>

                          <td>
                            ${
                              customer.last_order_at
                                ? new Date(
                                    customer.last_order_at
                                  ).toLocaleDateString(
                                    "fr-FR"
                                  )
                                : "—"
                            }
                          </td>

                        </tr>
                      `
                    )
                    .join("")
                }

              </table>

            </div>
          `
          : `
            <div class="empty">
              Les clients apparaîtront après les premières commandes.
            </div>
          `
      }

    </div>
  `;
}

/* =========================================================
   STOCK ADMIN
   ========================================================= */

async function renderStock() {

  const data =
    await adminRpc(
      "sama_admin_stock"
    );

  db.stock =
    data.stock || [];

  if (!db.stock.length) {

    return `
      <div class="panel">
        <h3>
          Stock et réapprovisionnement
        </h3>

        <div class="empty">
          Aucun stock configuré.
        </div>
      </div>
    `;
  }

  return `

    <div class="panel">

      <h3>
        Stock et réapprovisionnement
      </h3>

      <div class="table-wrap">

        <table class="table">

          <tr>

            <th>
              Pack
            </th>

            <th>
              Qté
            </th>

            <th>
              Seuil
            </th>

            <th>
              Coût unitaire
            </th>

            <th>
              Prix vente
            </th>

            <th>
              Valeur
            </th>

            <th>
              Fournisseur
            </th>

            <th>
              Action
            </th>

          </tr>

          ${
            db.stock
              .map(
                stock => {

                  const product =
                    stock.product ||
                    {};

                  const low =
                    Number(
                      stock.quantity
                    ) <=
                    Number(
                      stock.min_quantity
                    ) &&
                    Number(
                      stock.min_quantity
                    ) > 0;

                  return `

                    <tr>

                      <td>
                        ${esc(
                          product.name ||
                          stock.product_id
                        )}
                      </td>

                      <td>

                        <input
                          class="input"
                          style="width:80px"
                          type="number"
                          min="0"
                          value="${Number(
                            stock.quantity ||
                            0
                          )}"
                          onchange="
                            updateStockField(
                              '${stock.product_id}',
                              'quantity',
                              this.value
                            )
                          "
                        >

                      </td>

                      <td>

                        <input
                          class="input"
                          style="width:80px"
                          type="number"
                          min="0"
                          value="${Number(
                            stock.min_quantity ||
                            0
                          )}"
                          onchange="
                            updateStockField(
                              '${stock.product_id}',
                              'min_quantity',
                              this.value
                            )
                          "
                        >

                      </td>

                      <td>

                        <input
                          class="input"
                          style="width:110px"
                          type="number"
                          min="0"
                          value="${Number(
                            stock.unit_cost ||
                            0
                          )}"
                          onchange="
                            updateStockField(
                              '${stock.product_id}',
                              'unit_cost',
                              this.value
                            )
                          "
                        >

                      </td>

                      <td>

                        <input
                          class="input"
                          style="width:110px"
                          type="number"
                          min="0"
                          value="${Number(
                            product.price ||
                            0
                          )}"
                          onchange="
                            updateProductPrice(
                              '${stock.product_id}',
                              this.value
                            )
                          "
                        >

                      </td>

                      <td>
                        ${money(
                          Number(
                            stock.quantity ||
                            0
                          ) *
                          Number(
                            stock.unit_cost ||
                            0
                          )
                        )}
                      </td>

                      <td>

                        <input
                          class="input"
                          value="${esc(
                            stock.supplier ||
                            ""
                          )}"
                          onchange="
                            updateStockField(
                              '${stock.product_id}',
                              'supplier',
                              this.value
                            )
                          "
                        >

                      </td>

                      <td>

                        ${
                          low
                            ? `
                              <span
                                class="status cancelled"
                              >
                                À commander
                              </span>
                            `
                            : `
                              <span
                                class="status delivered"
                              >
                                OK
                              </span>
                            `
                        }

                      </td>

                    </tr>

                  `;
                }
              )
              .join("")
          }

        </table>

      </div>

    </div>
  `;
}

async function updateStockField(
  productId,
  field,
  value
) {

  const stock =
    db.stock.find(
      x =>
        x.product_id ===
        productId
    );

  if (!stock) return;

  const payload = {

    product_id:
      productId,

    quantity:
      field === "quantity"
        ? Number(value)
        : Number(
            stock.quantity || 0
          ),

    min_quantity:
      field === "min_quantity"
        ? Number(value)
        : Number(
            stock.min_quantity || 0
          ),

    unit_cost:
      field === "unit_cost"
        ? Number(value)
        : Number(
            stock.unit_cost || 0
          ),

    supplier:
      field === "supplier"
        ? value
        : stock.supplier || ""
  };

  try {

    await adminRpc(
      "sama_admin_update_stock",
      {
        p_payload:
          payload
      }
    );

    toast(
      "Stock enregistré."
    );

  } catch (error) {

    toast(
      error.message
    );
  }
}

async function updateProductPrice(
  productId,
  price
) {

  const stock =
    db.stock.find(
      x =>
        x.product_id ===
        productId
    );

  if (!stock) return;

  try {

    await adminRpc(
      "sama_admin_update_product",
      {
        p_id: productId,
        p_price:
          Number(price),
        p_active:
          true
      }
    );

    const product =
      products.find(
        p =>
          p.id ===
          productId
      );

    if (product) {
      product.price =
        Number(price);
    }

    toast(
      "Prix enregistré."
    );

  } catch (error) {

    toast(
      error.message
    );
  }
}

/* =========================================================
   FOURNISSEURS
   ========================================================= */

async function renderSuppliers() {

  const data =
    await adminRpc(
      "sama_admin_suppliers"
    );

  db.suppliers =
    data.suppliers || [];

  return `

    <div class="panel">

      <h3>
        Fournisseurs
      </h3>

      <form
        id="supplierForm"
        class="admin-form"
      >

        <input
          class="input"
          name="name"
          required
          placeholder="Nom fournisseur"
        >

        <input
          class="input"
          name="phone"
          placeholder="Téléphone"
        >

        <input
          class="input full"
          name="family"
          placeholder="Famille de produits"
        >

        <input
          class="input full"
          name="terms"
          placeholder="MOQ / délai / conditions"
        >

        <button
          class="btn primary full"
        >
          Ajouter fournisseur
        </button>

      </form>

    </div>

    <div style="height:16px"></div>

    <div class="panel">

      ${
        db.suppliers.length
          ? `
            <table class="table">

              <tr>

                <th>
                  Fournisseur
                </th>

                <th>
                  Téléphone
                </th>

                <th>
                  Famille
                </th>

                <th>
                  Conditions
                </th>

              </tr>

              ${
                db.suppliers
                  .map(
                    supplier => `

                      <tr>

                        <td>
                          ${esc(
                            supplier.name
                          )}
                        </td>

                        <td>
                          ${esc(
                            supplier.phone
                          )}
                        </td>

                        <td>
                          ${esc(
                            supplier.family
                          )}
                        </td>

                        <td>
                          ${esc(
                            supplier.terms
                          )}
                        </td>

                      </tr>
                    `
                  )
                  .join("")
              }

            </table>
          `
          : `
            <div class="empty">
              Ajoute tes fournisseurs pour suivre prix, MOQ et délais.
            </div>
          `
      }

    </div>
  `;
}

/* =========================================================
   DÉPENSES
   ========================================================= */

async function renderExpenses() {

  const data =
    await adminRpc(
      "sama_admin_expenses"
    );

  db.expenses =
    data.expenses || [];

  const total =
    db.expenses.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.amount || 0
        ),
      0
    );

  return `

    <div class="panel">

      <h3>
        Dépenses — Total ${money(total)}
      </h3>

      <form
        id="expenseForm"
        class="admin-form"
      >

        <input
          class="input"
          name="label"
          required
          placeholder="Libellé"
        >

        <input
          class="input"
          type="number"
          min="0"
          name="amount"
          required
          placeholder="Montant FCFA"
        >

        <input
          class="input"
          name="category"
          placeholder="Catégorie"
        >

        <input
          class="input"
          type="date"
          name="date"
          value="${new Date()
            .toISOString()
            .slice(0,10)}"
        >

        <button
          class="btn primary full"
        >
          Enregistrer
        </button>

      </form>

    </div>

    <div style="height:16px"></div>

    <div class="panel">

      ${
        db.expenses.length
          ? `
            <table class="table">

              <tr>

                <th>
                  Date
                </th>

                <th>
                  Libellé
                </th>

                <th>
                  Catégorie
                </th>

                <th>
                  Montant
                </th>

              </tr>

              ${
                db.expenses
                  .map(
                    expense => `

                      <tr>

                        <td>
                          ${esc(
                            expense.expense_date
                          )}
                        </td>

                        <td>
                          ${esc(
                            expense.label
                          )}
                        </td>

                        <td>
                          ${esc(
                            expense.category ||
                            ""
                          )}
                        </td>

                        <td>
                          ${money(
                            expense.amount
                          )}
                        </td>

                      </tr>
                    `
                  )
                  .join("")
              }

            </table>
          `
          : `
            <div class="empty">
              Aucune dépense.
            </div>
          `
      }

    </div>
  `;
}

/* =========================================================
   DEVIS ADMIN
   ========================================================= */

async function renderQuotes() {

  const data =
    await adminRpc(
      "sama_admin_quotes"
    );

  db.quotes =
    data.quotes || [];

  return `

    <div class="panel">

      <h3>
        Demandes de devis (${db.quotes.length})
      </h3>

      ${
        db.quotes.length
          ? `

            <table class="table">

              <tr>

                <th>
                  ID
                </th>

                <th>
                  Structure
                </th>

                <th>
                  Besoin
                </th>

                <th>
                  Téléphone
                </th>

                <th>
                  Statut
                </th>

              </tr>

              ${
                db.quotes
                  .map(
                    quote => `

                      <tr>

                        <td>
                          ${esc(
                            quote.id
                          )}
                        </td>

                        <td>
                          ${esc(
                            quote.company
                          )}
                        </td>

                        <td>
                          ${esc(
                            quote.need
                          )}
                        </td>

                        <td>
                          ${esc(
                            quote.phone ||
                            ""
                          )}
                        </td>

                        <td>

                          <select
                            class="input"
                            onchange="
                              setQuoteStatus(
                                '${quote.id}',
                                this.value
                              )
                            "
                          >

                            ${
                              [
                                "new",
                                "processing",
                                "won",
                                "lost"
                              ]
                              .map(
                                status => `
                                  <option
                                    value="${status}"
                                    ${
                                      quote.status === status
                                        ? "selected"
                                        : ""
                                    }
                                  >
                                    ${status}
                                  </option>
                                `
                              )
                              .join("")
                            }

                          </select>

                        </td>

                      </tr>
                    `
                  )
                  .join("")
              }

            </table>

          `
          : `
            <div class="empty">
              Aucune demande de devis.
            </div>
          `
      }

    </div>
  `;
}

async function setQuoteStatus(
  id,
  status
) {

  try {

    await adminRpc(
      "sama_admin_set_quote_status",
      {
        p_id: id,
        p_status: status
      }
    );

    await showAdminView(
      "quotes"
    );

    toast(
      "Statut du devis mis à jour."
    );

  } catch (error) {

    toast(
      error.message
    );
  }
}

/* =========================================================
   PARAMÈTRES ADMIN
   ========================================================= */

async function renderSettings() {

  const data =
    await adminRpc(
      "sama_admin_settings"
    );

  if (data.settings) {
    db.settings = {
      company:
        data.settings.company ||
        "SAMA-PACK",

      whatsapp:
        data.settings.whatsapp ||
        "",

      deliveryFee:
        Number(
          data.settings.deliveryFee ||
          0
        ),

      currency:
        data.settings.currency ||
        "FCFA"
    };
  }

  return `

    <div class="panel">

      <h3>
        Paramètres de l’entreprise
      </h3>

      <form
        id="settingsForm"
        class="admin-form"
      >

        <label>

          Nom

          <input
            class="input"
            name="company"
            value="${esc(
              db.settings.company
            )}"
          >

        </label>

        <label>

          WhatsApp

          <input
            class="input"
            name="whatsapp"
            value="${esc(
              db.settings.whatsapp
            )}"
            placeholder="22177..."
          >

        </label>

        <label>

          Frais livraison par défaut

          <input
            class="input"
            name="deliveryFee"
            type="number"
            min="0"
            value="${Number(
              db.settings.deliveryFee
            )}"
          >

        </label>

        <label>

          Nouveau code gestion

          <input
            class="input"
            name="adminPin"
            type="password"
            placeholder="Laisser vide pour conserver le code actuel"
          >

        </label>

        <label class="full">

          Devise

          <input
            class="input"
            name="currency"
            value="${esc(
              db.settings.currency
            )}"
          >

        </label>

        <button
          class="btn primary full"
        >
          Enregistrer les paramètres
        </button>

      </form>

      <p class="small-note">
        Les données commerciales sont maintenant enregistrées dans Supabase.
      </p>

    </div>
  `;
}

/* =========================================================
   FORMULAIRES ADMIN
   ========================================================= */

function bindAdmin(view) {

  if (view === "suppliers") {

    const form =
      document.getElementById(
        "supplierForm"
      );

    if (!form) return;

    form.onsubmit =
      async e => {

        e.preventDefault();

        const f =
          new FormData(form);

        try {

          await adminRpc(
            "sama_admin_add_supplier",
            {
              p_payload: {
                name:
                  String(
                    f.get("name") || ""
                  ).trim(),

                phone:
                  String(
                    f.get("phone") || ""
                  ).trim(),

                family:
                  String(
                    f.get("family") || ""
                  ).trim(),

                terms:
                  String(
                    f.get("terms") || ""
                  ).trim()
              }
            }
          );

          toast(
            "Fournisseur ajouté."
          );

          await showAdminView(
            "suppliers"
          );

        } catch (error) {

          toast(
            error.message
          );
        }
      };
  }

  if (view === "expenses") {

    const form =
      document.getElementById(
        "expenseForm"
      );

    if (!form) return;

    form.onsubmit =
      async e => {

        e.preventDefault();

        const f =
          new FormData(form);

        try {

          await adminRpc(
            "sama_admin_add_expense",
            {
              p_payload: {

                id:
                  "DEP-" +
                  Date.now(),

                label:
                  String(
                    f.get("label") || ""
                  ).trim(),

                amount:
                  Number(
                    f.get("amount") || 0
                  ),

                category:
                  String(
                    f.get("category") || ""
                  ).trim(),

                date:
                  String(
                    f.get("date") || ""
                  )
              }
            }
          );

          toast(
            "Dépense enregistrée."
          );

          await showAdminView(
            "expenses"
          );

        } catch (error) {

          toast(
            error.message
          );
        }
      };
  }

  if (view === "settings") {

    const form =
      document.getElementById(
        "settingsForm"
      );

    if (!form) return;

    form.onsubmit =
      async e => {

        e.preventDefault();

        const f =
          new FormData(form);

        try {

          await adminRpc(
            "sama_admin_update_settings",
            {
              p_payload: {

                company:
                  String(
                    f.get("company") ||
                    ""
                  ).trim(),

                whatsapp:
                  String(
                    f.get("whatsapp") ||
                    ""
                  ).trim(),

                deliveryFee:
                  Number(
                    f.get(
                      "deliveryFee"
                    ) || 0
                  ),

                currency:
                  String(
                    f.get("currency") ||
                    "FCFA"
                  ).trim(),

                adminPin:
                  String(
                    f.get("adminPin") ||
                    ""
                  ).trim()
              }
            }
          );

          db.settings = {

            company:
              String(
                f.get("company") ||
                ""
              ).trim(),

            whatsapp:
              String(
                f.get("whatsapp") ||
                ""
              ).trim(),

            deliveryFee:
              Number(
                f.get(
                  "deliveryFee"
                ) || 0
              ),

            currency:
              String(
                f.get("currency") ||
                "FCFA"
              ).trim()
          };

          updateContact();

          toast(
            "Paramètres enregistrés."
          );

          if (
            String(
              f.get("adminPin") ||
              ""
            ).trim()
          ) {

            clearAdminToken();

            closeAdmin();

            toast(
              "Le nouveau code est actif. Reconnecte-toi avec ce code."
            );
          }

        } catch (error) {

          toast(
            error.message
          );
        }
      };
  }
}

/* =========================================================
   EXPORT DES DONNÉES
   ========================================================= */

async function exportData() {

  try {

    const [
      dashboard,
      orders,
      customers,
      stock,
      suppliers,
      expenses,
      quotes,
      settings
    ] = await Promise.all([

      adminRpc(
        "sama_admin_dashboard"
      ),

      adminRpc(
        "sama_admin_orders"
      ),

      adminRpc(
        "sama_admin_customers"
      ),

      adminRpc(
        "sama_admin_stock"
      ),

      adminRpc(
        "sama_admin_suppliers"
      ),

      adminRpc(
        "sama_admin_expenses"
      ),

      adminRpc(
        "sama_admin_quotes"
      ),

      adminRpc(
        "sama_admin_settings"
      )
    ]);

    const exportObject = {

      exportedAt:
        new Date().toISOString(),

      settings:
        settings.settings,

      dashboard,

      orders:
        orders.orders || [],

      customers:
        customers.customers || [],

      stock:
        stock.stock || [],

      suppliers:
        suppliers.suppliers || [],

      expenses:
        expenses.expenses || [],

      quotes:
        quotes.quotes || []
    };

    const blob =
      new Blob(
        [
          JSON.stringify(
            exportObject,
            null,
            2
          )
        ],
        {
          type:
            "application/json"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const a =
      document.createElement(
        "a"
      );

    a.href = url;

    a.download =
      "sama-pack-sauvegarde.json";

    a.click();

    URL.revokeObjectURL(
      url
    );

    toast(
      "Sauvegarde exportée."
    );

  } catch (error) {

    toast(
      error.message
    );
  }
}

const exportDataBtn =
  document.getElementById(
    "exportDataBtn"
  );

if (exportDataBtn) {
  exportDataBtn.onclick =
    exportData;
}

/* =========================================================
   IMPORT
   La base est maintenant centralisée.
   On désactive l'ancien import local pour éviter
   de donner l'illusion qu'il restaure Supabase.
   ========================================================= */

const importDataInput =
  document.getElementById(
    "importDataInput"
  );

if (importDataInput) {

  importDataInput.addEventListener(
    "change",
    () => {

      toast(
        "L'import JSON vers Supabase sera ajouté dans une prochaine étape."
      );

      importDataInput.value = "";
    }
  );
}

/* =========================================================
   DÉMARRAGE
   ========================================================= */

initShop();
