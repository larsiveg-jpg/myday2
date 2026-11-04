// MyDay 2.0 – prisstasjon (Cloudflare Worker)
//
// Holder Kassalapp-nøkkelen hemmelig og gir appen priser fra Oda.
// Bare innloggede MyDay-brukere (Firebase) slipper inn.
//
// Hemmelighet (Settings → Variables and Secrets):
//   KASSAL_KEY  – API-nøkkel fra kassal.app/api
//
// Endepunkter (alle krever  Authorization: Bearer <Firebase ID-token>):
//   GET /search?q=melk        → { items: [{ ean, name, brand, image, price, unitPrice, unit }] }
//   GET /ean/7038010009457     → { item: { ean, name, brand, image, price, ... } | null }
//   GET /prices?ean=a,b,c      → { prices: { a: 24.9, b: null, ... } }

const FIREBASE_PROJECT = "myday2-28db4";
const ALLOWED_EMAILS = ["larsiveg@gmail.com", "thalkinrud@gmail.com"];
const ALLOWED_ORIGINS = ["https://larsiveg-jpg.github.io", "http://localhost:8765"];
const KASSAL = "https://kassal.app/api/v1";
const STORE_CODE = /^ODA/i;          // Oda (Kassalapp-kode ODA_NO)
const STORE_NAME = /^oda$/i;
const CACHE_SECONDS = 6 * 60 * 60;  // mellomlagre Kassalapp-svar i 6 timer
const MAX_EANS = 30;

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return json({ error: "method" }, 405);
    if (!env.KASSAL_KEY) return json({ error: "Mangler KASSAL_KEY" }, 500);

    try {
      await verifyFirebaseUser(req.headers.get("Authorization"));
    } catch (e) {
      return json({ error: "Ikke innlogget" }, 401);
    }

    const url = new URL(req.url);
    const kassal = path => kassalGet(path, env.KASSAL_KEY, ctx);

    try {
      if (url.pathname === "/search") {
        const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
        if (q.length < 2) return json({ items: [] });
        const r = await kassal(`/products?search=${encodeURIComponent(q)}&size=100&exclude_without_ean=1`);
        const seen = new Set(), items = [];
        for (const p of (r && r.data) || []) {
          if (!p.ean || seen.has(p.ean) || !isStore(p.store)) continue;
          const price = priceOf(p.current_price);
          if (price == null) continue;
          seen.add(p.ean);
          items.push(simplify(p, price));
          if (items.length >= 25) break;
        }
        return json({ items });
      }

      const eanMatch = url.pathname.match(/^\/ean\/(\d{8,14})$/);
      if (eanMatch) return json({ item: await lookupEan(eanMatch[1], kassal) });

      if (url.pathname === "/prices") {
        const eans = (url.searchParams.get("ean") || "").split(",").filter(e => /^\d{8,14}$/.test(e)).slice(0, MAX_EANS);
        const prices = {};
        await Promise.all(eans.map(async ean => {
          const item = await lookupEan(ean, kassal).catch(() => undefined);
          if (item !== undefined) prices[ean] = item ? item.price : null;
        }));
        return json({ prices });
      }

      return json({ error: "Ukjent adresse" }, 404);
    } catch (e) {
      return json({ error: e.status === 429 ? "For mange forespørsler, prøv igjen om litt" : "Kassalapp svarte ikke" }, e.status === 429 ? 429 : 502);
    }
  },
};

/* ---------- Kassalapp ---------- */

function isStore(store) {
  return !!store && (STORE_CODE.test(store.code || "") || STORE_NAME.test((store.name || "").trim()));
}
function priceOf(cp) {
  if (cp == null) return null;
  const n = typeof cp === "object" ? cp.price : cp;
  return typeof n === "number" && isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function simplify(p, price) {
  const up = p.current_unit_price != null ? p.current_unit_price
    : (p.current_price && typeof p.current_price === "object" ? p.current_price.unit_price : null);
  return {
    ean: String(p.ean),
    name: p.name || "",
    brand: p.brand || "",
    image: p.image || "",
    price,
    unitPrice: typeof up === "number" ? Math.round(up * 100) / 100 : null,
    unit: p.weight_unit || "",
  };
}

// null = finnes ikke hos Oda, undefined (kastet) = feil
async function lookupEan(ean, kassal) {
  const r = await kassal(`/products/ean/${ean}`);
  const data = r && r.data;
  if (!data || !Array.isArray(data.products)) return null;
  const hit = data.products.find(p => isStore(p.store) && priceOf(p.current_price) != null);
  if (hit) return simplify({ ...hit, ean: data.ean || ean }, priceOf(hit.current_price));
  // Finnes, men ikke hos Oda: gi navn og bilde uten pris
  const any = data.products[0];
  return any ? { ...simplify({ ...any, ean: data.ean || ean }, null), price: null } : null;
}

async function kassalGet(path, key, ctx) {
  const cacheKey = new Request("https://kassal-cache.myday" + path);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const res = await fetch(KASSAL + path, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error("kassal " + res.status); e.status = res.status; throw e; }
  const body = await res.text();
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` },
  })));
  return JSON.parse(body);
}

/* ---------- Firebase ID-token (RS256) ---------- */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks = null, jwksUntil = 0;

async function getKey(kid) {
  if (!jwks || Date.now() > jwksUntil) {
    const res = await fetch(JWKS_URL);
    const maxAge = Number((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
    jwks = (await res.json()).keys || [];
    jwksUntil = Date.now() + maxAge * 1000;
  }
  const jwk = jwks.find(k => k.kid === kid);
  if (!jwk) throw new Error("ukjent nøkkel");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));

async function verifyFirebaseUser(header) {
  const token = (header || "").replace(/^Bearer\s+/i, "");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("token");
  const head = JSON.parse(new TextDecoder().decode(b64url(h)));
  const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (head.alg !== "RS256") throw new Error("alg");
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== FIREBASE_PROJECT) throw new Error("aud");
  if (claims.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT) throw new Error("iss");
  if (!(claims.exp > now) || !(claims.iat <= now + 300)) throw new Error("exp");
  if (!ALLOWED_EMAILS.includes(String(claims.email || "").toLowerCase())) throw new Error("email");
  const key = await getKey(head.kid);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(h + "." + p));
  if (!ok) throw new Error("signatur");
  return claims;
}
