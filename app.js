
const products = window.SAMA_PRODUCTS || [];
const KEY = "sama_pack_v1";
const imageById = {
  SP01: "images/Pack Grand Ménage.jpeg",
  SP02: "images/Pack hygiène bébé.jpeg",
  SP03: "images/Pack Mini-Menage.jpeg",
  SP04: "images/Pack douche.jpeg",
  SP05: "images/Pack keur gui.jpeg",
  SP06: "images/Pack cuisine.jpeg",
  SP07: "images/Pack linge.jpeg",
  SP08: "images/Pack Fraicheur.jpeg",
  SP09: "images/Pack Ceremonie.jpeg",
  SP10: "images/Pack eco coloc.jpeg"
};
const iconById={SP01:"🧼",SP02:"👶",SP03:"🧽",SP04:"🧼",SP05:"💼",SP06:"🍳",SP07:"🌸",SP08:"🏡",SP09:"🎉",SP10:"🏪"};
const defaults = {
  settings:{company:"SAMA-PACK",whatsapp:"221770000000",deliveryFee:1500,adminPin:"0000",currency:"FCFA"},
  cart:[],
  orders:[],customers:[],stock:products.map(p=>({id:p.id,qty:0,min:0,supplier:"",cost:0})),
  suppliers:[],expenses:[],quotes:[],activity:[],productSettings:Object.fromEntries(products.map(p=>[p.id,{price:p.price,active:true}]))
};
function load(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(defaults)}catch{return structuredClone(defaults)}}
let db=load();
products.forEach(p=>{if(!db.productSettings)db.productSettings={};if(!db.productSettings[p.id])db.productSettings[p.id]={price:p.price,active:true}});
function save(){localStorage.setItem(KEY,JSON.stringify(db));}
function money(n){return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n)||0))+" FCFA"}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2300)}
function getP(id){const p=products.find(x=>x.id===id);if(!p)return null;return {...p,price:Number(db.productSettings?.[id]?.price ?? p.price),active:db.productSettings?.[id]?.active!==false}}
function log(action,detail){db.activity.unshift({at:new Date().toISOString(),action,detail});db.activity=db.activity.slice(0,100);save()}
function whatsappUrl(msg){const n=(db.settings.whatsapp||"").replace(/\D/g,"");return n?`https://wa.me/${n}?text=${encodeURIComponent(msg)}`:"#"}
function openWA(msg){const u=whatsappUrl(msg); if(u==="#"){toast("Configure le numéro WhatsApp dans Gestion > Paramètres.");return} window.open(u,"_blank","noopener")}
function initShop(){
  document.getElementById("year").textContent=new Date().getFullYear();
  const cats=[...new Set(products.map(p=>p.cat))]; document.getElementById("categoryFilter").innerHTML='<option value="all">Toutes les catégories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
  renderTop(); renderProducts();
  document.getElementById("searchBox").addEventListener("input",renderProducts);
  document.getElementById("categoryFilter").addEventListener("change",renderProducts);
  document.getElementById("openCartBtn").onclick=renderCartModal;
  document.getElementById("heroWhatsApp").onclick=()=>openWA("Bonjour SAMA-PACK, je souhaite passer une commande.");
  document.getElementById("contactWhatsApp").onclick=()=>openWA("Bonjour SAMA-PACK, je souhaite avoir plus d'informations.");
  document.getElementById("quoteBtn").onclick=()=>openQuoteModal();
  document.getElementById("adminBtn").onclick=openAdmin;
  document.getElementById("footerAdmin").onclick=(e)=>{e.preventDefault();openAdmin()};
  document.getElementById("viewShopBtn").onclick=closeAdmin;
  updateContact();
}
function updateContact(){document.getElementById("contactPhone").textContent=db.settings.whatsapp?("+"+db.settings.whatsapp.replace(/\D/g,"")):"Numéro à configurer"}
function renderTop(){
 const tops=products.slice(0,3); document.getElementById("heroTopPacks").innerHTML=tops.map(p=>`<div class="mini-pack"><div class="mini-icon">${iconById[p.id]||"📦"}</div><div><strong>${esc(p.name)}</strong><small>${money(p.price)}</small></div></div>`).join("");
}
function renderProducts(){
 const q=document.getElementById("searchBox").value.toLowerCase().trim(), c=document.getElementById("categoryFilter").value;
 const arr=products.filter(p=>getP(p.id).active&&(c==="all"||p.cat===c)&&(p.name.toLowerCase().includes(q)||p.desc.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q)));
 document.getElementById("productGrid").innerHTML=arr.map(p=>productCard(p)).join("")||'<div class="empty">Aucun pack trouvé.</div>';
}
function openProduct(id){
  const p=getP(id);
  const image=imageById[p.id]||"";

 function showModal(body){
  document.getElementById("modalRoot").innerHTML=`
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
      onclick="if(event.target===this)closeModal()"
    >
      <div
        class="modal-card"
        style="
          width:95vw !important;
          max-width:1100px !important;
          min-width:0 !important;
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
function addToCart(id){const x=db.cart.find(i=>i.id===id);if(x)x.qty++;else db.cart.push({id,qty:1});save();updateCartCount();toast("Pack ajouté au panier.");}
function updateCartCount(){document.getElementById("cartCount").textContent=db.cart.reduce((s,i)=>s+i.qty,0)}
function openProduct(id){
  const p=getP(id);
  const image=imageById[p.id]||"";

  showModal(`
    <div class="modal-head">
      <div>
        <div class="eyebrow">${esc(p.cat)}</div>
        <h2>${esc(p.name)}</h2>
      </div>
      <button class="close" onclick="closeModal()">✕</button>
    </div>

    <div class="pack-visual" style="margin:20px 0;">
      <div class="pack-box" style="height:320px;">
        <img
          src="${image}"
          alt="${esc(p.name)}"
          style="display:block;width:100%;height:100%;object-fit:contain;border-radius:14px;"
        >
        <div class="pack-code">${p.id}</div>
      </div>
    </div>

    <p>${esc(p.desc)}</p>

    <ul class="pack-items">
      ${p.items.map(i=>`<li>${esc(i)}</li>`).join("")}
    </ul>

    <div class="price-row">
      <div class="price">${money(p.price)}</div>
      <button class="btn primary" onclick="addToCart('${p.id}');closeModal();renderProducts()">
        Ajouter au panier
      </button>
    </div>
  `);
}
function showModal(body){
  document.getElementById("modalRoot").innerHTML=`
    <div class="modal" onclick="if(event.target===this)closeModal()">
      <div class="modal-card" style="width:min(900px,94vw);max-width:900px;">
        ${body}
      </div>
    </div>`;
}
function closeModal(){document.getElementById("modalRoot").innerHTML=""}
function cartTotals(){const subtotal=db.cart.reduce((s,i)=>s+getP(i.id).price*i.qty,0);const delivery=db.settings.deliveryFee||0;return {subtotal,delivery,total:subtotal+delivery}}
function renderCartModal(){if(!db.cart.length){showModal(`<div class="modal-head"><h2>Ton panier</h2><button class="close" onclick="closeModal()">✕</button></div><div class="empty">Ton panier est vide.<br><br><a class="btn primary" href="#catalogue" onclick="closeModal()">Voir le catalogue</a></div>`);return}const t=cartTotals();showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE</div><h2>Ton panier</h2></div><button class="close" onclick="closeModal()">✕</button></div><div class="cart-list">${db.cart.map(i=>{const p=getP(i.id);return `<div class="cart-item"><div class="mini-icon">📦</div><div><strong>${esc(p.name)}</strong><div class="small-note">${money(p.price)} / pack</div></div><div class="qty"><button onclick="changeQty('${p.id}',-1)">−</button><b>${i.qty}</b><button onclick="changeQty('${p.id}',1)">+</button></div></div>`}).join("")}</div><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(t.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(t.delivery)}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(t.total)}</strong></div></div><div style="height:12px"></div><button class="btn primary full" onclick="checkoutModal()">Passer la commande</button>`)}
function changeQty(id,d){const x=db.cart.find(i=>i.id===id);if(!x)return;x.qty+=d;if(x.qty<=0)db.cart=db.cart.filter(i=>i.id!==id);save();updateCartCount();renderCartModal()}
function checkoutModal(){const t=cartTotals();showModal(`<div class="modal-head"><div><div class="eyebrow">CHECKOUT</div><h2>Finaliser la commande</h2></div><button class="close" onclick="closeModal()">✕</button></div><form id="checkoutForm" class="checkout-grid"><input class="input" name="name" required placeholder="Nom complet"><input class="input" name="phone" required placeholder="Téléphone"><input class="input full" name="address" required placeholder="Adresse de livraison"><input class="input" name="zone" placeholder="Zone / quartier"><input class="input" name="slot" placeholder="Créneau souhaité"><select class="input full" name="pay"><option>Paiement à la livraison</option><option>À confirmer</option></select><div class="summary full"><div class="summary-row"><span>Total</span><strong>${money(t.total)}</strong></div><div class="small-note">La commande sera enregistrée dans la gestion et préparée pour WhatsApp.</div></div><button class="btn primary full">Confirmer la commande</button></form>`);document.getElementById("checkoutForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const order={id:"CMD-"+Date.now().toString().slice(-7),createdAt:new Date().toISOString(),status:"new",customer:{name:f.get("name"),phone:f.get("phone"),address:f.get("address"),zone:f.get("zone")},slot:f.get("slot"),payment:f.get("pay"),items:db.cart.map(i=>({...i})),subtotal:t.subtotal,delivery:t.delivery,total:t.total};db.orders.unshift(order);let c=db.customers.find(x=>x.phone===order.customer.phone);if(c)c.lastOrder=order.createdAt;else db.customers.push({id:"CLI-"+Date.now().toString().slice(-6),...order.customer,orders:1,lastOrder:order.createdAt});db.cart=[];save();updateCartCount();log("Commande créée",order.id);closeModal();toast("Commande enregistrée.");const lines=order.items.map(i=>`${i.qty} x ${getP(i.id).name}`).join("\\n");openWA(`Bonjour SAMA-PACK, je confirme la commande ${order.id}.\\n\\n${lines}\\n\\nTotal: ${money(order.total)}\\nNom: ${order.customer.name}\\nTéléphone: ${order.customer.phone}\\nAdresse: ${order.customer.address}`);};}
function openQuoteModal(){showModal(`<div class="modal-head"><div><div class="eyebrow">B2B</div><h2>Demander un devis</h2></div><button class="close" onclick="closeModal()">✕</button></div><form id="quoteForm" class="checkout-grid"><input class="input" name="company" required placeholder="Entreprise / structure"><input class="input" name="phone" required placeholder="Téléphone"><input class="input full" name="need" required placeholder="Besoin (ex. 20 packs pro / mois)"><input class="input" name="email" placeholder="Email"><textarea class="input full" name="message" placeholder="Précisions"></textarea><button class="btn primary full">Envoyer la demande</button></form>`);document.getElementById("quoteForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const q={id:"DEV-"+Date.now().toString().slice(-7),createdAt:new Date().toISOString(),status:"new",company:f.get("company"),phone:f.get("phone"),email:f.get("email"),need:f.get("need"),message:f.get("message")};db.quotes.unshift(q);save();log("Demande de devis",q.id);closeModal();toast("Demande enregistrée.");openWA(`Bonjour SAMA-PACK, demande de devis ${q.id}.\\nStructure: ${q.company}\\nBesoin: ${q.need}\\nTéléphone: ${q.phone}\\n${q.message||""}`)}}

function openAdmin(){
 const pin=prompt("Code d’accès à la gestion commerciale :");
 if(pin!==db.settings.adminPin){toast("Code incorrect.");return}
 document.getElementById("adminPanel").classList.remove("hidden");showAdminView("dashboard");
}
function closeAdmin(){document.getElementById("adminPanel").classList.add("hidden")}
document.querySelectorAll(".side-btn").forEach(b=>b.addEventListener("click",()=>showAdminView(b.dataset.view)));
function showAdminView(view){document.querySelectorAll(".side-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));const titles={dashboard:"Dashboard",orders:"Commandes",customers:"Clients",products:"Stock",suppliers:"Fournisseurs",expenses:"Dépenses",quotes:"Devis",settings:"Paramètres"};document.getElementById("adminTitle").textContent=titles[view]||"Gestion";const r={dashboard:adminDashboard,orders:adminOrders,customers:adminCustomers,products:adminStock,suppliers:adminSuppliers,expenses:adminExpenses,quotes:adminQuotes,settings:adminSettings};document.getElementById("adminContent").innerHTML=r[view]();bindAdmin(view)}
function adminDashboard(){const ca=db.orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+o.total,0), pending=db.orders.filter(o=>["new","processing"].includes(o.status)).length, stockValue=db.stock.reduce((s,x)=>s+(x.qty*x.cost),0), low=db.stock.filter(x=>x.min>0&&x.qty<=x.min).length;return `<div class="admin-cards"><div class="kpi"><div class="label">CA commandes</div><div class="value">${money(ca)}</div></div><div class="kpi"><div class="label">Commandes en cours</div><div class="value">${pending}</div></div><div class="kpi"><div class="label">Valeur stock</div><div class="value">${money(stockValue)}</div></div><div class="kpi"><div class="label">Alertes stock</div><div class="value">${low}</div></div></div><div class="admin-grid"><div class="panel"><h3>Dernières commandes</h3>${db.orders.length?`<div class="table-wrap"><table class="table"><tr><th>ID</th><th>Client</th><th>Total</th><th>Statut</th></tr>${db.orders.slice(0,8).map(o=>`<tr><td>${o.id}</td><td>${esc(o.customer.name)}</td><td>${money(o.total)}</td><td><span class="status ${o.status}">${o.status}</span></td></tr>`).join("")}</table></div>`:'<div class="empty">Aucune commande.</div>'}</div><div class="panel"><h3>À surveiller</h3><p>Stock faible : <strong>${low}</strong></p><p>Demandes de devis : <strong>${db.quotes.filter(q=>q.status==="new").length}</strong></p><p>Dépenses enregistrées : <strong>${money(db.expenses.reduce((s,x)=>s+Number(x.amount||0),0))}</strong></p></div></div>`}
function adminOrders(){return `<div class="panel"><h3>Commandes (${db.orders.length})</h3>${db.orders.length?`<div class="table-wrap"><table class="table"><tr><th>ID</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th>Action</th></tr>${db.orders.map(o=>`<tr><td>${o.id}</td><td>${new Date(o.createdAt).toLocaleDateString("fr-FR")}</td><td>${esc(o.customer.name)}<br><span class="small-note">${esc(o.customer.phone)}</span></td><td>${money(o.total)}</td><td><select class="input" onchange="setOrderStatus('${o.id}',this.value)">${["new","processing","delivered","cancelled"].map(s=>`<option ${o.status===s?"selected":""} value="${s}">${s}</option>`).join("")}</select></td><td><button class="btn small ghost" onclick="showOrder('${o.id}')">Voir</button></td></tr>`).join("")}</table></div>`:'<div class="empty">Aucune commande pour le moment.</div>'}</div>`}
function showOrder(id){const o=db.orders.find(x=>x.id===id);showModal(`<div class="modal-head"><div><div class="eyebrow">COMMANDE</div><h2>${o.id}</h2></div><button class="close" onclick="closeModal()">✕</button></div><p><strong>${esc(o.customer.name)}</strong> · ${esc(o.customer.phone)}<br>${esc(o.customer.address)} ${esc(o.customer.zone||"")}</p><ul class="pack-items">${o.items.map(i=>`<li>${i.qty} × ${esc(getP(i.id).name)}</li>`).join("")}</ul><div class="summary"><div class="summary-row"><span>Sous-total</span><strong>${money(o.subtotal)}</strong></div><div class="summary-row"><span>Livraison</span><strong>${money(o.delivery)}</strong></div><div class="summary-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div>`)}
function setOrderStatus(id,status){const o=db.orders.find(x=>x.id===id);if(o){o.status=status;save();log("Statut commande",id+" → "+status);showAdminView("orders")}}
function adminCustomers(){return `<div class="panel"><h3>Clients (${db.customers.length})</h3>${db.customers.length?`<div class="table-wrap"><table class="table"><tr><th>Nom</th><th>Téléphone</th><th>Zone</th><th>Dernière commande</th></tr>${db.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.zone||"")}</td><td>${c.lastOrder?new Date(c.lastOrder).toLocaleDateString("fr-FR"):"—"}</td></tr>`).join("")}</table></div>`:'<div class="empty">Les clients apparaîtront après les premières commandes.</div>'}</div>`}
function adminStock(){const map=new Map(db.stock.map(x=>[x.id,x]));return `<div class="panel"><h3>Stock et réapprovisionnement</h3><div class="table-wrap"><table class="table"><tr><th>Pack</th><th>Qté</th><th>Seuil</th><th>Coût unitaire</th><th>Prix vente</th><th>Valeur</th><th>Fournisseur</th><th>Action</th></tr>${products.map(p=>{const s=map.get(p.id)||{qty:0,min:0,cost:0,supplier:""};return `<tr><td>${esc(p.name)}</td><td><input class="input" style="width:80px" type="number" value="${s.qty}" onchange="updateStock('${p.id}','qty',this.value)"></td><td><input class="input" style="width:80px" type="number" value="${s.min}" onchange="updateStock('${p.id}','min',this.value)"></td><td><input class="input" style="width:110px" type="number" value="${s.cost}" onchange="updateStock('${p.id}','cost',this.value)"></td><td><input class="input" style="width:110px" type="number" value="${getP(p.id).price}" onchange="updateProductSetting('${p.id}','price',this.value)"></td><td>${money((s.qty||0)*(s.cost||0))}</td><td><input class="input" value="${esc(s.supplier||"")}" onchange="updateStock('${p.id}','supplier',this.value)"></td><td>${s.min>0&&s.qty<=s.min?'<span class="status cancelled">À commander</span>':'<span class="status delivered">OK</span>'}</td></tr>`}).join("")}</table></div></div>`}
function updateProductSetting(id,k,v){if(!db.productSettings)db.productSettings={};if(!db.productSettings[id])db.productSettings[id]={price:0,active:true};db.productSettings[id][k]=k==="active"?Boolean(v):Number(v);save();renderProducts()}
function updateStock(id,k,v){let s=db.stock.find(x=>x.id===id);if(!s){s={id,qty:0,min:0,cost:0,supplier:""};db.stock.push(s)}s[k]=(k==="supplier"?v:Number(v));save()}
function adminSuppliers(){return `<div class="panel"><h3>Fournisseurs</h3><form id="supplierForm" class="admin-form"><input class="input" name="name" required placeholder="Nom fournisseur"><input class="input" name="phone" placeholder="Téléphone"><input class="input full" name="family" placeholder="Famille de produits"><input class="input full" name="terms" placeholder="MOQ / délai / conditions"><button class="btn primary full">Ajouter fournisseur</button></form></div><div style="height:16px"></div><div class="panel">${db.suppliers.length?`<table class="table"><tr><th>Fournisseur</th><th>Téléphone</th><th>Famille</th><th>Conditions</th></tr>${db.suppliers.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.phone)}</td><td>${esc(s.family)}</td><td>${esc(s.terms)}</td></tr>`).join("")}</table>`:'<div class="empty">Ajoute tes fournisseurs pour suivre prix, MOQ et délais.</div>'}</div>`}
function adminExpenses(){const total=db.expenses.reduce((s,x)=>s+Number(x.amount||0),0);return `<div class="panel"><h3>Dépenses — Total ${money(total)}</h3><form id="expenseForm" class="admin-form"><input class="input" name="label" required placeholder="Libellé"><input class="input" type="number" name="amount" required placeholder="Montant FCFA"><input class="input" name="category" placeholder="Catégorie"><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0,10)}"><button class="btn primary full">Enregistrer</button></form></div><div style="height:16px"></div><div class="panel">${db.expenses.length?`<table class="table"><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Montant</th></tr>${db.expenses.map(e=>`<tr><td>${e.date}</td><td>${esc(e.label)}</td><td>${esc(e.category||"")}</td><td>${money(e.amount)}</td></tr>`).join("")}</table>`:'<div class="empty">Aucune dépense.</div>'}</div>`}
function adminQuotes(){return `<div class="panel"><h3>Demandes de devis (${db.quotes.length})</h3>${db.quotes.length?`<table class="table"><tr><th>ID</th><th>Structure</th><th>Besoin</th><th>Téléphone</th><th>Statut</th></tr>${db.quotes.map(q=>`<tr><td>${q.id}</td><td>${esc(q.company)}</td><td>${esc(q.need)}</td><td>${esc(q.phone)}</td><td><select class="input" onchange="setQuoteStatus('${q.id}',this.value)">${["new","processing","won","lost"].map(s=>`<option ${q.status===s?"selected":""} value="${s}">${s}</option>`).join("")}</select></td></tr>`).join("")}</table>`:'<div class="empty">Aucune demande de devis.</div>'}</div>`}
function setQuoteStatus(id,status){const q=db.quotes.find(x=>x.id===id);if(q){q.status=status;save();showAdminView("quotes")}}
function adminSettings(){return `<div class="panel"><h3>Paramètres de l’entreprise</h3><form id="settingsForm" class="admin-form"><label>Nom<input class="input" name="company" value="${esc(db.settings.company)}"></label><label>WhatsApp (ex. 22177...)<input class="input" name="whatsapp" value="${esc(db.settings.whatsapp)}"></label><label>Frais livraison par défaut<input class="input" name="deliveryFee" type="number" value="${db.settings.deliveryFee}"></label><label>Code gestion<input class="input" name="adminPin" value="${esc(db.settings.adminPin)}"></label><label class="full">Devise<input class="input" name="currency" value="${esc(db.settings.currency)}"></label><button class="btn primary full">Enregistrer les paramètres</button></form><p class="small-note">V1 : les données sont stockées dans ce navigateur. Exporte régulièrement le JSON de sauvegarde.</p></div>`}
function bindAdmin(view){if(view==="suppliers"){document.getElementById("supplierForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);db.suppliers.unshift({id:"SUP-"+Date.now(),name:f.get("name"),phone:f.get("phone"),family:f.get("family"),terms:f.get("terms")});save();log("Fournisseur ajouté",f.get("name"));showAdminView("suppliers")}}
if(view==="expenses"){document.getElementById("expenseForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);db.expenses.unshift({id:"DEP-"+Date.now(),label:f.get("label"),amount:Number(f.get("amount")),category:f.get("category"),date:f.get("date")});save();log("Dépense ajoutée",f.get("label"));showAdminView("expenses")}}
if(view==="settings"){document.getElementById("settingsForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);db.settings={company:f.get("company"),whatsapp:f.get("whatsapp"),deliveryFee:Number(f.get("deliveryFee")),adminPin:f.get("adminPin"),currency:f.get("currency")};save();updateContact();toast("Paramètres enregistrés.");}}
}
document.getElementById("exportDataBtn").onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sama-pack-sauvegarde.json";a.click();URL.revokeObjectURL(a.href)}
document.getElementById("importDataInput").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{db=JSON.parse(r.result);save();location.reload()}catch{toast("Fichier JSON invalide.")}};r.readAsText(file)})
initShop();updateCartCount();
