(() => {
  "use strict";
  const API_URL="https://tbxxrnhcfuaeaatlrdtr.supabase.co";
  const PUBLIC_KEY="sb_publishable_lDAKRHFWyUYZ-tb23hbbnQ_96zF9Iwo";
  const DEFAULT_MESSAGE="Notre site est temporairement indisponible pour une opération de maintenance. Nous serons de retour très bientôt.";
  const reveal=()=>document.documentElement.classList.remove("maintenance-checking");
  function showMaintenance(message) {
    const screen=document.createElement("main"); screen.id="siteMaintenanceScreen"; screen.className="site-maintenance-screen";
    screen.setAttribute("role","status"); screen.setAttribute("aria-live","polite");
    const card=document.createElement("section"); card.className="site-maintenance-card";
    const mark=document.createElement("div"); mark.className="site-maintenance-mark"; mark.setAttribute("aria-hidden","true"); mark.textContent="S";
    const brand=document.createElement("span"); brand.className="site-maintenance-eyebrow"; brand.textContent="SAMA-PACK";
    const title=document.createElement("h1"); title.textContent="Site temporairement en maintenance";
    const copy=document.createElement("p"); copy.className="site-maintenance-message"; copy.textContent=String(message||DEFAULT_MESSAGE);
    const note=document.createElement("p"); note.className="site-maintenance-note"; note.textContent="Notre équipe travaille à rétablir le service. Merci de votre patience.";
    card.append(mark,brand,title,copy,note); screen.append(card); document.body.replaceChildren(screen); reveal();
  }
  const fallback=window.setTimeout(reveal,7000);
  fetch(API_URL+"/rest/v1/site_control?select=maintenance_mode,maintenance_message&id=eq.true",{
    method:"GET",cache:"no-store",headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+PUBLIC_KEY,Accept:"application/json"}
  }).then(response=>{if(!response.ok)throw new Error("Maintenance status unavailable");return response.json();})
    .then(rows=>{const control=Array.isArray(rows)?rows[0]:null;if(control?.maintenance_mode===true)showMaintenance(control.maintenance_message);else reveal();})
    .catch(error=>{console.warn("SAMA-PACK maintenance check unavailable.",error);reveal();})
    .finally(()=>window.clearTimeout(fallback));
})();