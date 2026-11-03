import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, enturClientName } from "./config.js?v=20261103-10";

/* ---------- Hjelpere ---------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtLong = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" });
const fmtClock = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });
const evEnd = e => (e.endDate && e.endDate > e.date) ? e.endDate : e.date;
const covers = (e, k) => e.date <= k && k <= evEnd(e);
const isMulti = e => evEnd(e) !== e.date;
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
const svg = (d, size = 20) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${d}</svg>`;
const ICON_TRASH = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
const ICON_STAR = '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" stroke-linejoin="round"/>';

const today = new Date(); today.setHours(0, 0, 0, 0);
let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = iso(today);
let events = [], shop = [], stops = [];
let me = null, unsubs = [];

$("todayLbl").textContent = "Uke " + isoWeek(today);

function setStatus(msg, color = "warning") {
  $("status").hidden = !msg; $("statusText").textContent = msg || "";
  $("status").setAttribute("data-color", color);
}
function para(text, size = "sm", cls) {
  const p = document.createElement("p"); p.className = "ds-paragraph" + (cls ? " " + cls : "");
  p.setAttribute("data-size", size); p.setAttribute("data-variant", "short"); p.textContent = text; return p;
}
function iconBtn(label, onclick) {
  const b = document.createElement("button"); b.type = "button"; b.className = "ds-button";
  b.setAttribute("data-icon", ""); b.setAttribute("data-variant", "tertiary"); b.setAttribute("data-color", "neutral");
  b.setAttribute("aria-label", label); b.innerHTML = svg(ICON_TRASH); b.onclick = () => onclick(b); return b;
}
function emptyLi(text) { const li = document.createElement("li"); li.appendChild(para(text, "sm", "myday-subtle")); return li; }
const who = e => !e.by ? "" : (me && e.by === me.uid ? "deg" : (e.byName || "den andre"));

/* ---------- Firebase ---------- */
const configured = !String(firebaseConfig.apiKey).includes("LIM-INN");
let auth, db;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

function handleErr(e) {
  const c = e && e.code;
  if (c === "permission-denied") setStatus("Kontoen din har ikke tilgang. Sjekk at e-postadressen står i Firestore-reglene.", "danger");
  else if (c === "unavailable") setStatus("Får ikke kontakt med databasen. Sjekk nettet.", "warning");
  else setStatus("Endringen ble ikke lagret. Prøv igjen.", "danger");
}
async function add(col, data) {
  try { await addDoc(collection(db, col), { ...data, by: me.uid, byName: me.name, createdAt: Date.now() }); setStatus(""); return true; }
  catch (e) { handleErr(e); return false; }
}
async function patch(col, id, data) { try { await updateDoc(doc(db, col, id), data); } catch (e) { handleErr(e); } }
async function remove(col, id, btn) {
  if (btn) btn.disabled = true;
  try { await deleteDoc(doc(db, col, id)); } catch (e) { handleErr(e); if (btn) btn.disabled = false; }
}
function listen(col, assign, after) {
  unsubs.push(onSnapshot(collection(db, col), snap => {
    assign(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    after();
  }, handleErr));
}

/* ---------- Visninger ---------- */
const tabs = ["hjem", "kalender", "handleliste", "avganger"];
function currentTab() { return tabs.includes(location.hash.slice(1)) ? location.hash.slice(1) : "hjem"; }
const showsDepartures = () => ["hjem", "avganger"].includes(currentTab());
function showTab() {
  if (!me) return;
  const t = currentTab();
  tabs.forEach(n => { $("v-" + n).hidden = n !== t; });
  document.querySelectorAll(".myday-bottom-nav a").forEach(a => a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (t === "hjem") renderHome();
  if (showsDepartures()) refreshDepartures();
}
addEventListener("hashchange", showTab);

function showLogin() {
  me = null; unsubs.forEach(u => u()); unsubs = [];
  tabs.forEach(n => { $("v-" + n).hidden = true; });
  $("nav").hidden = true; $("signoutRow").hidden = true; $("v-login").hidden = false;
}
function showApp(user) {
  me = { uid: user.uid, name: user.displayName || (user.email || "").split("@")[0] };
  $("v-login").hidden = true; $("nav").hidden = false; $("signoutRow").hidden = false;
  listen("events", a => events = a, () => { renderCal(); renderDay(); renderHome(); });
  listen("shopping", a => shop = a, renderShop);
  listen("stops", a => stops = a, () => { renderStops(); renderHome(); refreshDepartures(); });
  renderCal(); renderDay(); renderShop(); renderStops(); renderHome();
  showTab();
}

if (!configured) {
  setStatus("Appen er ikke koblet til Firebase ennå. Lim inn verdiene i config.js (se README).", "info");
} else {
  onAuthStateChanged(auth, u => u ? showApp(u) : showLogin());
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("loginBtn"); $("loginErr").hidden = true; $("loginPw").removeAttribute("aria-invalid");
  btn.setAttribute("aria-busy", "true");
  try { await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPw").value); $("loginPw").value = ""; }
  catch (err) {
    $("loginErr").textContent = err && err.code === "auth/network-request-failed" ? "Får ikke kontakt. Sjekk nettet og prøv igjen." : "Feil e-post eller passord.";
    $("loginErr").hidden = false; $("loginPw").setAttribute("aria-invalid", "true");
  }
  btn.removeAttribute("aria-busy");
});
$("signOut").onclick = () => signOut(auth);

/* ---------- Trykk og hold ---------- */
const LONG_PRESS_MS = 2000;
function addLongPress(el, onLong) {
  let timer = null, x = 0, y = 0;
  const cancel = () => { clearTimeout(timer); timer = null; el.removeAttribute("data-holding"); };
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    x = e.clientX; y = e.clientY;
    el.setAttribute("data-holding", "");
    timer = setTimeout(() => {
      timer = null; el.removeAttribute("data-holding");
      if (navigator.vibrate) navigator.vibrate(15);
      onLong();
    }, LONG_PRESS_MS);
  });
  el.addEventListener("pointermove", e => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => el.addEventListener(t, cancel));
  el.addEventListener("contextmenu", e => e.preventDefault());
}

/* ---------- Kalender ---------- */
function renderCal() {
  $("monthLbl").textContent = fmtMonth.format(viewMonth);
  const cal = $("cal"); cal.textContent = "";
  ["ma", "ti", "on", "to", "fr", "lø", "sø"].forEach(d => { const e = document.createElement("div"); e.className = "myday-cal__dow"; e.textContent = d; cal.appendChild(e); });
  const start = new Date(viewMonth); start.setDate(1 - ((viewMonth.getDay() + 6) % 7));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== viewMonth.getMonth()) break;
    const k = iso(d);
    const b = document.createElement("button"); b.type = "button"; b.className = "myday-day ds-focus"; b.textContent = d.getDate();
    if (d.getMonth() !== viewMonth.getMonth()) b.setAttribute("data-other", "");
    if (k === iso(today)) b.setAttribute("data-today", "");
    b.setAttribute("aria-pressed", k === selected ? "true" : "false");
    const has = events.some(e => covers(e, k));
    b.setAttribute("aria-label", fmtLong.format(d) + (has ? ", har avtaler" : ""));
    if (has) { const dot = document.createElement("span"); dot.className = "myday-day__dot"; b.appendChild(dot); }
    const pick = () => { selected = k; if (d.getMonth() !== viewMonth.getMonth()) viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCal(); renderDay(); };
    b.onclick = () => { if (b.dataset.longpressed) { delete b.dataset.longpressed; return; } pick(); };
    addLongPress(b, () => { b.dataset.longpressed = "1"; pick(); openNewEvent("center"); });
    cal.appendChild(b);
  }
}
function evItem(e, showDate) {
  const li = document.createElement("li"); li.className = "myday-event";
  const t = document.createElement("span"); t.className = "myday-event__time";
  t.textContent = isMulti(e) ? (e.time || "Flere dager") : (e.time ? e.time + (e.endTime ? "\n–" + e.endTime : "") : "Hele dagen");
  const body = document.createElement("div"); body.className = "myday-event__body";
  if (isMulti(e)) {
    const tag = document.createElement("span"); tag.className = "ds-tag"; tag.setAttribute("data-size", "sm"); tag.style.justifySelf = "start";
    tag.textContent = fmtShort.format(parse(e.date)) + (e.time ? " " + e.time : "") + " – " + fmtShort.format(parse(evEnd(e))) + (e.endTime ? " " + e.endTime : "");
    body.appendChild(tag);
  } else if (showDate) { const p = para(fmtLong.format(parse(e.date)), "xs", "myday-subtle myday-cap"); body.appendChild(p); }
  const title = para(e.title, "md"); title.style.fontWeight = "var(--ds-font-weight-medium)"; body.appendChild(title);
  const w = who(e); if (w) body.appendChild(para("Lagt til av " + w, "xs", "myday-subtle"));
  li.append(t, body, iconBtn("Slett " + e.title, b => remove("events", e.id, b)));
  return li;
}
const sortEv = (a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00"));
function renderDay() {
  $("selLbl").textContent = selected === iso(today) ? "I dag" : fmtLong.format(parse(selected));
  const list = $("dayEvents"); list.textContent = "";
  const day = events.filter(e => covers(e, selected)).sort(sortEv);
  if (!day.length) list.appendChild(emptyLi("Ingen avtaler denne dagen."));
  day.forEach(e => list.appendChild(evItem(e, false)));
  const up = $("upList"); up.textContent = "";
  const end = new Date(today); end.setDate(end.getDate() + 14);
  const coming = events.filter(e => e.date <= iso(end) && evEnd(e) >= iso(today)).sort(sortEv);
  if (!coming.length) up.appendChild(emptyLi("Ingenting planlagt de neste to ukene."));
  coming.forEach(e => up.appendChild(evItem(e, true)));
}
$("prevM").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCal(); };
$("nextM").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCal(); };

/* ---------- Ny avtale ---------- */
const dlg = $("newDlg");
const allDay = () => $("evAllDay").checked;
function syncEndMin() { const s = $("evStart").value, e = $("evEnd"); e.min = s; if (e.value && e.value < s) e.value = ""; }
function clearErrors() { ["evTitleErr", "evEndErr"].forEach(id => $(id).hidden = true); ["evTitle", "evEnd"].forEach(id => $(id).removeAttribute("aria-invalid")); }
// placement: "bottom" = bunnark (knappen), "center" = dialog midt på (trykk og hold i kalenderen)
function openNewEvent(placement) {
  clearErrors();
  const s = $("evStart"); s.value = allDay() ? selected : selected + "T" + (s.value.slice(11, 16) || "09:00");
  $("evEnd").value = ""; syncEndMin();
  dlg.setAttribute("data-placement", placement);
  dlgOpenedAt = Date.now();
  dlg.showModal(); $("evTitle").focus();
}
$("openNew").onclick = () => openNewEvent("bottom");
$("cancelNew").onclick = () => dlg.close();
let dlgOpenedAt = 0;
// ignorer klikket som kommer når fingeren slippes rett etter trykk-og-hold
dlg.addEventListener("click", e => { if (e.target === dlg && Date.now() - dlgOpenedAt > 600) dlg.close(); });
$("evStart").addEventListener("change", syncEndMin);
$("evAllDay").addEventListener("change", () => {
  const ad = allDay();
  [["evStart", "09:00"], ["evEnd", "10:00"]].forEach(([id, def]) => { const el = $(id); const v = el.value; el.type = ad ? "date" : "datetime-local"; el.value = v ? (ad ? v.slice(0, 10) : v + "T" + def) : ""; });
  syncEndMin();
});
$("evForm").addEventListener("submit", async ev => {
  ev.preventDefault(); clearErrors();
  const title = $("evTitle").value.trim(), sv = $("evStart").value, ev2 = $("evEnd").value, ad = allDay();
  if (!title) { $("evTitleErr").hidden = false; $("evTitle").setAttribute("aria-invalid", "true"); $("evTitle").focus(); return; }
  if (!sv) { $("evStart").focus(); return; }
  if (ev2 && ev2 < sv) { $("evEndErr").hidden = false; $("evEnd").setAttribute("aria-invalid", "true"); return; }
  const date = sv.slice(0, 10), time = ad ? "" : sv.slice(11, 16);
  let endDate = ev2 ? ev2.slice(0, 10) : "";
  const endTime = (ev2 && !ad) ? ev2.slice(11, 16) : "";
  if (endDate === date) endDate = "";
  const btn = $("evAdd"); btn.setAttribute("aria-busy", "true");
  const ok = await add("events", { title, date, endDate, time, endTime });
  btn.removeAttribute("aria-busy");
  if (ok) { $("evTitle").value = ""; $("evEnd").value = ""; dlg.close(); selected = date; const d = parse(date); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCal(); renderDay(); }
});

/* ---------- Handleliste ---------- */
function renderShop() {
  const ul = $("shopList"); ul.textContent = "";
  const items = [...shop].sort((a, b) => (a.done - b.done) || (a.createdAt - b.createdAt));
  const left = shop.filter(s => !s.done).length;
  $("shopCount").hidden = !shop.length; $("shopCount").textContent = left + " igjen";
  $("navBadge").hidden = !left; $("navBadge").setAttribute("data-count", String(left));
  $("navCountSr").textContent = left ? ", " + left + " varer igjen" : "";
  $("clearRow").hidden = !shop.some(s => s.done);
  if (!items.length) { ul.appendChild(emptyLi("Listen er tom. Skriv inn en vare over.")); return; }
  items.forEach(s => {
    const li = document.createElement("li"); li.className = "myday-item"; if (s.done) li.setAttribute("data-done", "");
    const f = document.createElement("ds-field"); f.className = "ds-field";
    const cb = document.createElement("input"); cb.className = "ds-input"; cb.type = "checkbox"; cb.id = "c-" + s.id; cb.checked = !!s.done;
    cb.onchange = () => patch("shopping", s.id, { done: cb.checked });
    const lb = document.createElement("label"); lb.htmlFor = cb.id; lb.textContent = s.text;
    f.append(cb, lb);
    const w = who(s); if (w && w !== "deg") { const d = document.createElement("p"); d.setAttribute("data-field", "description"); d.textContent = "Lagt til av " + w; f.appendChild(d); }
    li.append(f, iconBtn("Fjern " + s.text, b => remove("shopping", s.id, b)));
    ul.appendChild(li);
  });
}
$("shopForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const parts = $("shopText").value.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return;
  $("shopText").value = "";
  for (const text of parts) await add("shopping", { text, done: false });
  $("shopText").focus();
});
$("clearDone").onclick = async () => {
  const btn = $("clearDone"); btn.setAttribute("aria-busy", "true");
  for (const s of shop.filter(s => s.done)) await remove("shopping", s.id);
  btn.removeAttribute("aria-busy");
};

/* ---------- Entur ---------- */
const ENTUR_HEADERS = { "ET-Client-Name": enturClientName };
const MODES = { bus: "Buss", rail: "Tog", tram: "Trikk", metro: "T-bane", water: "Båt", coach: "Ekspressbuss", air: "Fly" };
const DEP_QUERY = `query($id: String!) {
  stopPlace(id: $id) {
    name
    estimatedCalls(timeRange: 7200, numberOfDepartures: 8) {
      realtime cancellation aimedDepartureTime expectedDepartureTime
      destinationDisplay { frontText }
      quay { publicCode }
      serviceJourney { line { publicCode transportMode presentation { colour textColour } } }
    }
  }
}`;
const departures = {};   // stopId -> { calls, error, at }

async function fetchDepartures(id) {
  const r = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST", headers: { "Content-Type": "application/json", ...ENTUR_HEADERS },
    body: JSON.stringify({ query: DEP_QUERY, variables: { id } }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return (j.data && j.data.stopPlace && j.data.stopPlace.estimatedCalls) || [];
}
let refreshing = false;
async function refreshDepartures() {
  if (refreshing || !me || !showsDepartures() || document.hidden) return;
  refreshing = true;
  const list = currentTab() === "hjem" ? [favoriteStop()].filter(Boolean) : stops.filter(s => s.enturId);
  await Promise.all(list.map(async s => {
    try { departures[s.enturId] = { calls: await fetchDepartures(s.enturId), at: new Date() }; }
    catch (e) { departures[s.enturId] = { ...(departures[s.enturId] || {}), error: true }; }
  }));
  refreshing = false;
  renderStops(); renderHome();
}
setInterval(refreshDepartures, 30000);
setInterval(() => { if (me && currentTab() === "hjem") renderHome(); }, 60000);
document.addEventListener("visibilitychange", refreshDepartures);

function minutesText(dt) {
  const m = Math.round((dt - Date.now()) / 60000);
  if (m <= 0) return "Nå";
  if (m < 15) return m + " min";
  return fmtClock.format(dt);
}
function renderStops() {
  const box = $("stopCards"); box.textContent = "";
  const valid = stops.filter(s => s.enturId).sort((a, b) => a.createdAt - b.createdAt);
  if (!valid.length) {
    const c = document.createElement("div"); c.className = "ds-card";
    const b = document.createElement("div"); b.className = "ds-card__block";
    b.append(para("Ingen holdeplasser lagret ennå. Søk opp de dere bruker mest under, for eksempel nærmeste bussholdeplass og togstasjonen.", "sm", "myday-subtle"));
    c.appendChild(b); box.appendChild(c); return;
  }
  valid.forEach(s => {
    const card = document.createElement("section"); card.className = "ds-card myday-flat";
    const blk = document.createElement("div"); blk.className = "ds-card__block";
    const head = document.createElement("div"); head.className = "myday-stop__head";
    const nm = document.createElement("div"); nm.className = "myday-stop__name";
    const h = document.createElement("h2"); h.className = "ds-heading"; h.setAttribute("data-size", "xs"); h.textContent = s.name; nm.appendChild(h);
    if (s.place) nm.appendChild(para(s.place, "xs", "myday-subtle"));
    const fav = document.createElement("button"); fav.type = "button"; fav.className = "ds-button myday-fav";
    fav.setAttribute("data-icon", ""); fav.setAttribute("data-variant", "tertiary"); fav.setAttribute("data-color", "neutral");
    const isFav = favoriteStop() === s;
    fav.setAttribute("aria-pressed", isFav ? "true" : "false");
    fav.setAttribute("aria-label", isFav ? s.name + " er favoritt på Hjem" : "Vis " + s.name + " på Hjem");
    fav.innerHTML = svg(ICON_STAR);
    fav.onclick = () => setFavorite(s, fav);
    head.append(nm, fav, iconBtn("Fjern " + s.name, b => remove("stops", s.id, b)));
    blk.appendChild(head);
    blk.appendChild(departureList(departures[s.enturId]));
    const d = departures[s.enturId];
    if (d && d.at) blk.appendChild(para("Oppdatert " + fmtClock.format(d.at) + (d.error ? ", siste forsøk feilet" : ""), "xs", "myday-subtle"));
    card.appendChild(blk); box.appendChild(card);
  });
}

/* Linjefarger fra Entur (hex uten #). Faller tilbake til temafargen når Entur ikke oppgir farge. */
const HEX = /^[0-9a-f]{6}$/i;
function applyLineColour(el, pres) {
  const bg = pres && pres.colour, fg = pres && pres.textColour;
  if (!bg || !HEX.test(bg)) return;
  el.style.background = "#" + bg;
  if (fg && HEX.test(fg) && fg.toLowerCase() !== bg.toLowerCase()) { el.style.color = "#" + fg; return; }
  const [r, g, b] = [0, 2, 4].map(i => parseInt(bg.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  el.style.color = (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.4 ? "#000000" : "#ffffff";
}

/* Avgangsliste, brukt både på Hjem og Avganger */
// compact: bare linje, destinasjon og tid (Hjem)
function departureList(d, max, compact) {
  const ul = document.createElement("ul"); ul.className = "myday-departures";
  if (!d) {
    for (let i = 0; i < 3; i++) { const li = document.createElement("li"); li.innerHTML = '<span class="ds-skeleton" data-variant="text" aria-hidden="true"></span>'; ul.appendChild(li); }
    return ul;
  }
  if (d.error && !d.calls) { ul.appendChild(emptyLi("Fikk ikke hentet avganger. Prøver igjen om litt.")); return ul; }
  const calls = (d.calls || []).filter(c => new Date(c.expectedDepartureTime) > Date.now() - 60000).slice(0, max || 99);
  if (!calls.length) { ul.appendChild(emptyLi("Ingen avganger de neste to timene.")); return ul; }
  calls.forEach(c => {
    const li = document.createElement("li"); li.className = "myday-departure";
    if (c.cancellation) li.setAttribute("data-cancelled", "");
    const line = c.serviceJourney && c.serviceJourney.line || {};
    const ln = document.createElement("span"); ln.className = "myday-line"; ln.textContent = line.publicCode || "–";
    applyLineColour(ln, line.presentation);
    ln.setAttribute("aria-label", (MODES[line.transportMode] || "Linje") + " " + (line.publicCode || ""));
    const dest = document.createElement("span"); dest.className = "myday-departure__dest";
    dest.textContent = (c.destinationDisplay && c.destinationDisplay.frontText) || "";
    const sub = document.createElement("small");
    sub.textContent = c.quay && c.quay.publicCode ? "Plattform " + c.quay.publicCode : "";
    if (!sub.textContent) sub.hidden = true;
    if (!compact) dest.appendChild(sub);
    const exp = new Date(c.expectedDepartureTime), aim = new Date(c.aimedDepartureTime);
    const tm = document.createElement("span"); tm.className = "myday-departure__time";
    if (c.cancellation) {
      tm.textContent = fmtClock.format(aim);
      const tag = document.createElement("span"); tag.className = "ds-tag"; tag.setAttribute("data-color", "danger"); tag.setAttribute("data-size", "sm"); tag.textContent = "Innstilt";
      if (compact) { tag.className = "ds-sr-only"; tag.textContent = ", innstilt"; }
      dest.appendChild(tag);
    } else {
      tm.textContent = minutesText(exp);
      const late = Math.round((exp - aim) / 60000);
      const small = document.createElement("small");
      small.textContent = !c.realtime ? "rutetid" : (late >= 2 ? "ny tid, var " + fmtClock.format(aim) : "sanntid");
      if (!compact) tm.appendChild(small);
    }
    li.append(ln, dest, tm); ul.appendChild(li);
  });
  return ul;
}

/* Favoritt: den som er stjernemerket, ellers den første som ble lagret */
function favoriteStop() {
  const valid = stops.filter(s => s.enturId).sort((a, b) => a.createdAt - b.createdAt);
  return valid.find(s => s.favorite) || valid[0] || null;
}
async function setFavorite(s, btn) {
  btn.disabled = true;
  for (const o of stops) {
    const want = o.id === s.id;
    if (!!o.favorite !== want) await patch("stops", o.id, { favorite: want });
  }
  btn.disabled = false;
}

/* ---------- Hjem ---------- */
function endMoment(e) {
  const last = evEnd(e);
  if (e.endTime) { const d = parse(last); const [h, m] = e.endTime.split(":").map(Number); d.setHours(h, m); return d; }
  if (e.time && !isMulti(e)) { const d = parse(e.date); const [h, m] = e.time.split(":").map(Number); d.setHours(h + 1, m); return d; } // uten sluttid: regnes som passert en time etter start
  const d = parse(last); d.setHours(23, 59, 59); return d;
}
function renderHome() {
  if (!me) return;
  // Avganger fra favoritten
  const fav = favoriteStop();
  const depsBox = $("homeDeps"); depsBox.replaceChildren();
  $("homeStopHint").hidden = true;
  if (!fav) {
    $("homeStopName").textContent = "Neste avganger";
    depsBox.appendChild(emptyLi("Ingen holdeplass valgt. Søk opp en under Avganger og trykk på stjernen."));
  } else {
    $("homeStopName").textContent = fav.name;
    if (!fav.favorite) { $("homeStopHint").textContent = "Trykk på stjernen under Avganger for å velge en annen holdeplass her."; $("homeStopHint").hidden = false; }
    depsBox.replaceWith(Object.assign(departureList(departures[fav.enturId], 3, true), { id: "homeDeps" }));
  }

  // Resten av uka (mandag–søndag), uten passerte avtaler
  const now = new Date();
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  $("weekLbl").textContent = "Uke " + isoWeek(today);
  const box = $("weekList"); box.textContent = "";
  const left = events.filter(e => e.date <= iso(sunday) && evEnd(e) >= iso(today) && endMoment(e) > now).sort(sortEv);
  if (!left.length) { box.appendChild(para("Ingenting mer planlagt denne uka.", "sm", "myday-subtle")); return; }
  for (let d = new Date(today); d <= sunday; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    // flerdagsavtaler vises på første gjenværende dag
    const dayEvs = left.filter(e => (e.date > iso(today) ? e.date : iso(today)) === k);
    if (!dayEvs.length) continue;
    const g = document.createElement("div"); g.className = "myday-week__day";
    if (k === iso(today)) g.setAttribute("data-today", "");
    const h = document.createElement("h3"); h.className = "ds-heading"; h.setAttribute("data-size", "2xs");
    h.textContent = k === iso(today) ? "I dag" : fmtLong.format(d);
    const ul = document.createElement("ul"); ul.className = "myday-events";
    dayEvs.forEach(e => ul.appendChild(evItem(e, false)));
    g.append(h, ul); box.appendChild(g);
  }
}

/* Søk etter holdeplass */
let searchTimer, searchSeq = 0;
$("stopSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("stopSearch").value.trim();
  if (q.length < 2) { $("stopResults").textContent = ""; return; }
  searchTimer = setTimeout(() => searchStops(q), 300);
});
async function searchStops(q) {
  const seq = ++searchSeq;
  const ul = $("stopResults");
  try {
    const url = "https://api.entur.io/geocoder/v1/autocomplete?" + new URLSearchParams({ text: q, size: "6", layers: "venue", lang: "no" });
    const r = await fetch(url, { headers: ENTUR_HEADERS });
    const j = await r.json();
    if (seq !== searchSeq) return;
    ul.textContent = "";
    const feats = (j.features || []).filter(f => f.properties && String(f.properties.id).startsWith("NSR:StopPlace"));
    if (!feats.length) { ul.appendChild(emptyLi("Fant ingen holdeplasser.")); return; }
    feats.forEach(f => {
      const p = f.properties;
      const li = document.createElement("li");
      const b = document.createElement("button"); b.type = "button"; b.className = "ds-button"; b.setAttribute("data-variant", "tertiary");
      const place = [p.locality, p.county].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
      b.textContent = p.name + (place ? " · " + place : "");
      const already = stops.some(s => s.enturId === p.id);
      if (already) { b.disabled = true; b.textContent += " (lagret)"; }
      b.onclick = async () => {
        b.setAttribute("aria-busy", "true");
        const ok = await add("stops", { name: p.name, place, enturId: p.id });
        if (ok) { $("stopSearch").value = ""; ul.textContent = ""; }
        b.removeAttribute("aria-busy");
      };
      li.appendChild(b); ul.appendChild(li);
    });
  } catch (e) {
    if (seq !== searchSeq) return;
    ul.textContent = ""; ul.appendChild(emptyLi("Søket feilet. Sjekk nettet og prøv igjen."));
  }
}
