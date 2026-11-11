import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const SITE_URL = "https://sama-pack.store";
const CALLBACK_PATH = "/functions/v1/sama-social-platforms";
const MAX_BATCH = 10;
const META_VERSION = Deno.env.get("META_GRAPH_API_VERSION") ?? "";
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202610";

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Provider = "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube";
type Profile = {
  id: string;
  role: string;
  is_super_admin: boolean;
  admin_permissions: Record<string, boolean> | null;
  full_name: string | null;
  email: string | null;
};
type OAuthState = {
  state_hash: string;
  provider: Provider;
  created_by: string;
  redirect_path: string;
  expires_at: string;
};
type SocialAccount = {
  id: string;
  provider: Provider;
  provider_account_id: string;
  account_name: string;
  username: string;
  status: string;
  scopes: string[];
  token_expires_at: string | null;
};
type SocialTarget = {
  id: string;
  post_id: string;
  provider: Provider;
  social_account_id: string | null;
  caption: string;
  publication_mode: "automatic" | "approval" | "manual";
  status: string;
  provider_options: Record<string, unknown> | null;
  platform_post_id?: string | null;
};
type SocialPost = {
  id: string;
  title: string;
  body: string;
  media_asset_id: string | null;
  scheduled_at: string | null;
};
type SocialMedia = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
};

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = new Set([
    "https://sama-pack.store",
    "https://www.sama-pack.store",
    "https://sama-pack.netlify.app",
  ]);
  const accepted = Boolean(origin && (
    allowed.has(origin) ||
    /^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)
  ));
  return {
    "Access-Control-Allow-Origin": accepted ? origin! : SITE_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-worker-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: Record<string, unknown>, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

function safeSiteRedirect(path: string, query: Record<string, string>): string {
  const url = new URL(path.startsWith("/") ? path : "/?spAction=manage", SITE_URL);
  if (url.origin !== SITE_URL) return SITE_URL + "/?spAction=manage&social=error";
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value.slice(0, 120));
  return url.toString();
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async async function encryptionKey(): Promise<CryptoKey> {
  const { data, error } = await service.rpc("sama_get_social_token_encryption_key");
  if (error || typeof data !== "string" || !data) {
    throw new Error("La clé de chiffrement Social Desk n'est pas disponible dans Supabase Vault.");
  }
  const raw = base64Decode(data.trim());
  if (raw.byteLength !== 32) throw new Error("La clé de chiffrement Social Desk est invalide.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return base64Encode(iv) + "." + base64Encode(new Uint8Array(cipher));
}

async function decryptSecret(value: string): Promise<string> {
  const [ivText, cipherText] = value.split(".");
  if (!ivText || !cipherText) throw new Error("Jeton chiffré illisible.");
  const key = await encryptionKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64Decode(ivText) },
    key,
    base64Decode(cipherText),
  );
  return new TextDecoder().decode(plain);
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return typeof value === "string" ? value.split(/[,\s]+/).map(x => x.trim()).filter(Boolean) : [];
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, init);
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 400) }; }
  if (!response.ok) {
    const detail = data?.error_description || data?.error?.message || data?.message || data?.error || "Réponse API inattendue";
    throw new Error("API externe (" + response.status + "): " + String(detail).slice(0, 350));
  }
  if (data?.error && data.error.code && data.error.code !== "ok") {
    throw new Error("API externe : " + String(data.error.message || data.error.code).slice(0, 350));
  }
  return { data, response };
}

function formBody(entries: Record<string, string>): URLSearchParams {
  const form = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => form.set(key, value));
  return form;
}

function tokenExpiry(expiresIn: unknown): string | null {
  const seconds = Number(expiresIn);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
}

function redirectUri(): string {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL n'est pas configurée.");
  return SUPABASE_URL.replace(/\/+$/, "") + CALLBACK_PATH;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("Configuration serveur manquante : " + name + ".");
  return value;
}

async function callerFromRequest(req: Request): Promise<{ userId: string; profile: Profile }> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new Error("Session administrateur manquante.");
  const { data, error } = await service.auth.getUser(match[1]);
  if (error || !data.user) throw new Error("Session invalide. Reconnecte-toi à SAMA-PACK.");
  const { data: profile, error: profileError } = await service.from("profiles")
    .select("id,role,is_super_admin,admin_permissions,full_name,email")
    .eq("id", data.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "admin") throw new Error("Accès réservé aux administrateurs.");
  return { userId: data.user.id, profile: profile as Profile };
}

function hasPermission(profile: Profile, permission: string): boolean {
  return profile.is_super_admin === true || profile.admin_permissions?.[permission] === true;
}

async function requirePermission(req: Request, permission: string) {
  const caller = await callerFromRequest(req);
  if (!hasPermission(caller.profile, permission)) {
    throw new Error("Ton compte ne dispose pas de la permission " + permission + ".");
  }
  return caller;
}

async function storeCredential(
  accountId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null,
  scopes: string[],
) {
  const [accessCipher, refreshCipher] = await Promise.all([
    encryptSecret(accessToken),
    refreshToken ? encryptSecret(refreshToken) : Promise.resolve(null),
  ]);
  const { error } = await service.from("social_credentials").upsert({
    social_account_id: accountId,
    access_token_ciphertext: accessCipher,
    refresh_token_ciphertext: refreshCipher,
    encryption_key_version: "v1",
    token_expires_at: expiresAt,
    scopes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "social_account_id" });
  if (error) throw new Error("Impossible de sécuriser le jeton du compte social : " + error.message);
}

async function saveAccount(input: {
  provider: Provider;
  providerId: string;
  name: string;
  username?: string;
  profileUrl?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: unknown;
  scopes?: string[];
  connectedBy: string;
}) {
  const { data, error } = await service.from("social_accounts").upsert({
    provider: input.provider,
    provider_account_id: input.providerId,
    account_name: input.name.slice(0, 160),
    username: String(input.username || "").slice(0, 160),
    profile_url: String(input.profileUrl || "").slice(0, 500),
    avatar_url: String(input.avatarUrl || "").slice(0, 1000),
    status: "connected",
    scopes: input.scopes || [],
    token_expires_at: tokenExpiry(input.expiresIn),
    connected_by: input.connectedBy,
    connected_at: new Date().toISOString(),
    last_error: "",
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,provider_account_id" })
    .select("id").single();
  if (error || !data?.id) throw new Error("Impossible d'enregistrer le compte " + input.provider + ".");
  await storeCredential(
    data.id,
    input.accessToken,
    input.refreshToken || null,
    tokenExpiry(input.expiresIn),
    input.scopes || [],
  );
}

async function startOAuth(provider: Provider, userId: string): Promise<string> {
  const state = randomToken(32);
  const stateHash = await sha256Hex(state);
  const record = {
    state_hash: stateHash,
    provider,
    created_by: userId,
    redirect_path: "/?spAction=manage&social=connected",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  const { error } = await service.from("social_oauth_states").insert(record);
  if (error) throw new Error("Impossible de préparer la connexion sécurisée : " + error.message);
  const callback = redirectUri();
  let url: URL;

  if (provider === "facebook" || provider === "instagram") {
    const appId = requiredEnv("META_APP_ID");
    requiredEnv("META_APP_SECRET");
    if (!META_VERSION) throw new Error("Configure META_GRAPH_API_VERSION avec une version Graph API active.");
    url = new URL("https://www.facebook.com/" + META_VERSION + "/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ].join(","));
  } else if (provider === "tiktok") {
    url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", requiredEnv("TIKTOK_CLIENT_KEY"));
    requiredEnv("TIKTOK_CLIENT_SECRET");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
  } else if (provider === "linkedin") {
    url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", requiredEnv("LINKEDIN_CLIENT_ID"));
    requiredEnv("LINKEDIN_CLIENT_SECRET");
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", Deno.env.get("LINKEDIN_SCOPES") || "openid profile w_member_social");
  } else {
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", requiredEnv("GOOGLE_CLIENT_ID"));
    requiredEnv("GOOGLE_CLIENT_SECRET");
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email https://www.googleapis.com/auth/youtube.upload");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
  }
  return url.toString();
}

async function consumeOAuthState(state: string): Promise<OAuthState> {
  if (!state || state.length > 200) throw new Error("État OAuth manquant ou invalide.");
  const stateHash = await sha256Hex(state);
  const { data, error } = await service.from("social_oauth_states")
    .select("state_hash,provider,created_by,redirect_path,expires_at,consumed_at")
    .eq("state_hash", stateHash)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) throw new Error("La demande de connexion a expiré ou a déjà été utilisée.");
  const { data: consumed, error: consumeError } = await service.from("social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", stateHash)
    .is("consumed_at", null)
    .select("state_hash,provider,created_by,redirect_path,expires_at")
    .maybeSingle();
  if (consumeError || !consumed) throw new Error("Cette demande de connexion a déjà été consommée.");
  return consumed as OAuthState;
}

async function metaCallback(code: string, state: OAuthState) {
  const appId = requiredEnv("META_APP_ID");
  const appSecret = requiredEnv("META_APP_SECRET");
  if (!META_VERSION) throw new Error("META_GRAPH_API_VERSION n'est pas configurée.");
  const callback = redirectUri();
  const shortToken = await fetchJson(
    "https://graph.facebook.com/" + META_VERSION + "/oauth/access_token?" + new URLSearchParams({
      client_id: appId, client_secret: appSecret, redirect_uri: callback, code,
    }),
  );
  const longToken = await fetchJson(
    "https://graph.facebook.com/" + META_VERSION + "/oauth/access_token?" + new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: String(shortToken.data.access_token),
    }),
  );
  const userToken = String(longToken.data.access_token || shortToken.data.access_token || "");
  if (!userToken) throw new Error("Meta n'a pas retourné de jeton utilisateur.");
  const pageResult = await fetchJson(
    "https://graph.facebook.com/" + META_VERSION + "/me/accounts?" + new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
      access_token: userToken,
    }),
  );
  const pages = Array.isArray(pageResult.data?.data) ? pageResult.data.data : [];
  if (!pages.length) throw new Error("Aucune Page Facebook administrée n'a été trouvée avec les autorisations accordées.");
  let saved = 0;
  for (const page of pages) {
    if (!page.id || !page.access_token) continue;
    const pageToken = String(page.access_token);
    await saveAccount({
      provider: "facebook",
      providerId: String(page.id),
      name: String(page.name || "Page Facebook"),
      username: String(page.id),
      profileUrl: "https://www.facebook.com/" + page.id,
      accessToken: pageToken,
      scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
      connectedBy: state.created_by,
    });
    saved++;
    const ig = page.instagram_business_account;
    if (ig?.id) {
      await saveAccount({
        provider: "instagram",
        providerId: String(ig.id),
        name: String(ig.username || page.name || "Instagram professionnel"),
        username: String(ig.username || ""),
        profileUrl: ig.username ? "https://www.instagram.com/" + ig.username : "",
        accessToken: pageToken,
        scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
        connectedBy: state.created_by,
      });
      saved++;
    }
  }
  if (!saved) throw new Error("Meta n'a retourné aucune Page publiable.");
  return { saved, provider: state.provider };
}

async function tiktokCallback(code: string, state: OAuthState) {
  const tokenResult = await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  const token = tokenResult.data;
  if (!token.access_token || !token.open_id) throw new Error("TikTok n'a pas retourné un jeton valide.");
  const profile = await fetchJson(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url",
    { headers: { Authorization: "Bearer " + token.access_token } },
  );
  const user = profile.data?.data?.user || {};
  await saveAccount({
    provider: "tiktok",
    providerId: String(token.open_id),
    name: String(user.display_name || user.username || "Compte TikTok"),
    username: String(user.username || ""),
    profileUrl: user.username ? "https://www.tiktok.com/@" + user.username : "",
    avatarUrl: String(user.avatar_url || ""),
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    expiresIn: token.expires_in,
    scopes: parseScopes(token.scope),
    connectedBy: state.created_by,
  });
  return { saved: 1, provider: "tiktok" };
}

async function linkedinCallback(code: string, state: OAuthState) {
  const tokenResult = await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "authorization_code",
      code,
      client_id: requiredEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requiredEnv("LINKEDIN_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
    }),
  });
  const token = tokenResult.data;
  if (!token.access_token) throw new Error("LinkedIn n'a pas retourné de jeton.");
  const profileResult = await fetchJson("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: "Bearer " + token.access_token },
  });
  const profile = profileResult.data || {};
  if (!profile.sub) throw new Error("LinkedIn n'a pas retourné l'identifiant du membre.");
  await saveAccount({
    provider: "linkedin",
    providerId: String(profile.sub),
    name: String(profile.name || "Compte LinkedIn"),
    username: String(profile.email || ""),
    profileUrl: "",
    avatarUrl: String(profile.picture || ""),
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    expiresIn: token.expires_in,
    scopes: parseScopes(token.scope || Deno.env.get("LINKEDIN_SCOPES")),
    connectedBy: state.created_by,
  });
  return { saved: 1, provider: "linkedin" };
}

async function youtubeCallback(code: string, state: OAuthState) {
  const tokenResult = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const token = tokenResult.data;
  if (!token.access_token) throw new Error("Google n'a pas retourné de jeton.");
  const channelResult = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: "Bearer " + token.access_token },
  });
  const channel = channelResult.data?.items?.[0];
  if (!channel?.id) throw new Error("Aucune chaîne YouTube n'est associée à ce compte Google.");
  await saveAccount({
    provider: "youtube",
    providerId: String(channel.id),
    name: String(channel.snippet?.title || "Chaîne YouTube"),
    username: String(channel.snippet?.customUrl || ""),
    profileUrl: "https://www.youtube.com/channel/" + channel.id,
    avatarUrl: String(channel.snippet?.thumbnails?.default?.url || ""),
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    expiresIn: token.expires_in,
    scopes: parseScopes(token.scope || "https://www.googleapis.com/auth/youtube.upload"),
    connectedBy: state.created_by,
  });
  return { saved: 1, provider: "youtube" };
}

async function oauthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateValue = url.searchParams.get("state") || "";
  let state: OAuthState | null = null;
  try {
    if (url.searchParams.has("error")) {
      const error = url.searchParams.get("error_description") || url.searchParams.get("error") || "Autorisation refusée";
      if (stateValue) {
        try { state = await consumeOAuthState(stateValue); } catch { /* invalid state is intentionally not echoed */ }
      }
      return redirect(safeSiteRedirect(state?.redirect_path || "/?spAction=manage", {
        social: "error",
        reason: error.slice(0, 100),
      }));
    }
    state = await consumeOAuthState(stateValue);
    const { data: connectingProfile, error: connectingProfileError } = await service.from("profiles")
      .select("id,role,is_super_admin,admin_permissions,full_name,email")
      .eq("id", state.created_by).maybeSingle();
    if (connectingProfileError || !connectingProfile || connectingProfile.role !== "admin" ||
      !hasPermission(connectingProfile as Profile, "social.accounts.manage")) {
      throw new Error("Les droits de connexion aux comptes sociaux ont été retirés avant la fin de l'autorisation.");
    }
    const code = url.searchParams.get("code") || "";
    if (!code) throw new Error("Code d'autorisation manquant.");
    let result: { saved: number; provider: string };
    if (state.provider === "facebook" || state.provider === "instagram") result = await metaCallback(code, state);
    else if (state.provider === "tiktok") result = await tiktokCallback(code, state);
    else if (state.provider === "linkedin") result = await linkedinCallback(code, state);
    else result = await youtubeCallback(code, state);
    return redirect(safeSiteRedirect(state.redirect_path, {
      social: "connected",
      provider: result.provider,
      count: String(result.saved),
    }));
  } catch (error) {
    console.error("SAMA-PACK social OAuth callback failed", {
      provider: state?.provider || "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    const redirectPath = state?.redirect_path || "/?spAction=manage";
    const url = new URL(safeSiteRedirect(redirectPath, { social: "error" }));
    return redirect(url.toString());
  }
}

async function refreshCredential(account: SocialAccount) {
  const { data: credential, error } = await service.from("social_credentials")
    .select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,scopes")
    .eq("social_account_id", account.id).maybeSingle();
  if (error || !credential) throw new Error("Jeton du compte social introuvable. Reconnecte le compte.");
  let accessToken = await decryptSecret(credential.access_token_ciphertext);
  const refreshCipher = credential.refresh_token_ciphertext;
  const expiresAt = credential.token_expires_at || account.token_expires_at;
  const expiry = expiresAt ? new Date(expiresAt).getTime() : Number.POSITIVE_INFINITY;
  if (expiry > Date.now() + 5 * 60 * 1000) return accessToken;
  if (!refreshCipher) throw new Error("Le jeton de ce compte a expiré. Reconnecte le compte social.");
  const refreshToken = await decryptSecret(refreshCipher);
  let result: any = null;
  if (account.provider === "tiktok") {
    result = (await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
        client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })).data;
  } else if (account.provider === "youtube") {
    result = (await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: requiredEnv("GOOGLE_CLIENT_ID"),
        client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })).data;
  } else if (account.provider === "linkedin") {
    result = (await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requiredEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requiredEnv("LINKEDIN_CLIENT_SECRET"),
      }),
    })).data;
  } else {
    throw new Error("Ce compte Meta doit être reconnecté pour renouveler son autorisation.");
  }
  if (!result?.access_token) throw new Error("Le renouvellement du jeton a échoué. Reconnecte le compte.");
  accessToken = String(result.access_token);
  const refresh = result.refresh_token ? String(result.refresh_token) : refreshToken;
  await storeCredential(
    account.id,
    accessToken,
    refresh,
    tokenExpiry(result.expires_in),
    parseScopes(result.scope || credential.scopes),
  );
  await service.from("social_accounts").update({
    token_expires_at: tokenExpiry(result.expires_in),
    status: "connected",
    last_error: "",
    updated_at: new Date().toISOString(),
  }).eq("id", account.id);
  return accessToken;
}

async function assetForTarget(mediaId: string | null): Promise<{ asset: SocialMedia; url: string } | null> {
  if (!mediaId) return null;
  const { data: asset, error } = await service.from("social_media_assets")
    .select("id,storage_path,mime_type,size_bytes")
    .eq("id", mediaId).maybeSingle();
  if (error || !asset) throw new Error("Le média associé à la publication est introuvable.");
  const { data: signed, error: signError } = await service.storage
    .from("sama-social-media")
    .createSignedUrl(asset.storage_path, 60 * 60 * 4);
  if (signError || !signed?.signedUrl) throw new Error("Impossible de préparer le média pour la plateforme.");
  return { asset: asset as SocialMedia, url: signed.signedUrl };
}

async function updateTarget(
  targetId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await service.from("social_post_targets").update({
    status,
    ...extra,
    updated_at: new Date().toISOString(),
  }).eq("id", targetId).select("post_id").single();
  if (error) throw new Error("Impossible d'enregistrer le résultat de publication : " + error.message);
  const postId = data.post_id;
  const { data: targets, error: readError } = await service.from("social_post_targets")
    .select("status").eq("post_id", postId);
  if (readError) return;
  const statuses = (targets || []).map((item: { status: string }) => item.status);
  const published = statuses.filter(status => status === "published").length;
  const pending = statuses.filter(status => ["scheduled", "publishing", "draft", "awaiting_connection", "manual_required"].includes(status)).length;
  const failed = statuses.filter(status => status === "failed").length;
  let parentStatus = "scheduled";
  if (published > 0 && pending === 0 && failed === 0) parentStatus = "published";
  else if (published > 0 && (pending > 0 || failed > 0)) parentStatus = "partially_published";
  else if (published === 0 && failed > 0 && pending === 0) parentStatus = "failed";
  await service.from("social_posts").update({
    status: parentStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", postId);
}

async function readTargetContext(target: SocialTarget) {
  const [{ data: post, error: postError }, { data: account, error: accountError }] = await Promise.all([
    service.from("social_posts").select("id,title,body,media_asset_id,scheduled_at").eq("id", target.post_id).single(),
    target.social_account_id
      ? service.from("social_accounts").select("id,provider,provider_account_id,account_name,username,status,scopes,token_expires_at").eq("id", target.social_account_id).single()
      : Promise.resolve({ data: null, error: new Error("Aucun compte social lié.") } as any),
  ]);
  if (postError || !post) throw new Error("Publication introuvable.");
  if (accountError || !account) throw new Error("Compte social non connecté.");
  if (account.provider !== target.provider || account.status !== "connected") throw new Error("Compte social indisponible ou non connecté.");
  return { post: post as SocialPost, account: account as SocialAccount };
}

async function publishFacebook(
  account: SocialAccount, token: string, post: SocialPost, media: { asset: SocialMedia; url: string } | null,
) {
  if (!META_VERSION) throw new Error("META_GRAPH_API_VERSION n'est pas configurée.");
  const pageId = account.provider_account_id;
  const url = "https://graph.facebook.com/" + META_VERSION + "/" + pageId;
  const form = new URLSearchParams({ access_token: token });
  let endpoint = url + "/feed";
  if (media) {
    if (media.asset.mime_type.startsWith("image/")) {
      endpoint = url + "/photos";
      form.set("url", media.url);
      form.set("caption", post.body);
    } else if (media.asset.mime_type.startsWith("video/")) {
      endpoint = url + "/videos";
      form.set("file_url", media.url);
      form.set("description", post.body);
      form.set("title", post.title.slice(0, 255));
    } else throw new Error("Ce type de média n'est pas pris en charge par Facebook.");
  } else {
    form.set("message", post.body);
  }
  const result = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const id = String(result.data?.post_id || result.data?.id || "");
  if (!id) throw new Error("Facebook n'a pas retourné l'identifiant de la publication.");
  return { providerPostId: id, permalink: "https://www.facebook.com/" + id };
}

async function publishInstagram(
  account: SocialAccount, token: string, post: SocialPost, media: { asset: SocialMedia; url: string } | null,
) {
  if (!META_VERSION) throw new Error("META_GRAPH_API_VERSION n'est pas configurée.");
  if (!media) throw new Error("Instagram nécessite une photo JPEG ou une vidéo MP4.");
  const base = "https://graph.facebook.com/" + META_VERSION + "/" + account.provider_account_id;
  const form = new URLSearchParams({ caption: post.body, access_token: token });
  if (media.asset.mime_type === "image/jpeg") {
    form.set("image_url", media.url);
  } else if (media.asset.mime_type === "video/mp4") {
    form.set("media_type", "REELS");
    form.set("video_url", media.url);
    form.set("share_to_feed", "true");
  } else {
    throw new Error("Instagram via l'API accepte ici uniquement JPG ou MP4. Convertis le média puis réessaie.");
  }
  const container = await fetchJson(base + "/media", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const containerId = String(container.data?.id || "");
  if (!containerId) throw new Error("Instagram n'a pas créé de conteneur média.");
  let ready = false;
  for (let attempt = 0; attempt < 18; attempt++) {
    const status = await fetchJson(base + "/" + containerId + "?" + new URLSearchParams({
      fields: "status_code,status",
      access_token: token,
    }));
    const code = String(status.data?.status_code || "");
    if (code === "FINISHED") { ready = true; break; }
    if (code === "ERROR" || code === "EXPIRED") throw new Error("Instagram n'a pas pu traiter le média : " + String(status.data?.status || code));
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  if (!ready) throw new Error("Instagram traite encore le média. Relance la publication après quelques minutes.");
  const published = await fetchJson(base + "/media_publish", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ creation_id: containerId, access_token: token }),
  });
  const id = String(published.data?.id || "");
  if (!id) throw new Error("Instagram n'a pas confirmé la publication.");
  let permalink = "";
  try {
    const detail = await fetchJson(base + "/" + id + "?" + new URLSearchParams({ fields: "permalink", access_token: token }));
    permalink = String(detail.data?.permalink || "");
  } catch { /* permalink is optional */ }
  return { providerPostId: id, permalink };
}

async function publishTikTok(
  account: SocialAccount, token: string, post: SocialPost, media: { asset: SocialMedia; url: string } | null,
  options: Record<string, unknown>,
) {
  if (!media) throw new Error("TikTok exige une vidéo ou une photo. Les publications texte seules doivent être finalisées dans l'application TikTok.");
  if (media.asset.mime_type !== "video/mp4") {
    throw new Error("La publication automatique de photos TikTok nécessite une URL de média hébergée sur un domaine vérifié dans TikTok Developer. Ce média reste à publier manuellement.");
  }
  const creator = await fetchJson("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({}),
  });
  const privacyOptions = creator.data?.data?.privacy_level_options || [];
  const requestedPrivacy = String(options.privacy_level || "SELF_ONLY");
  const privacy = privacyOptions.includes(requestedPrivacy) ? requestedPrivacy : "SELF_ONLY";
  const bytesResponse = await fetch(media.url);
  if (!bytesResponse.ok) throw new Error("Impossible de lire la vidéo hébergée pour TikTok.");
  const video = new Uint8Array(await bytesResponse.arrayBuffer());
  if (video.byteLength !== Number(media.asset.size_bytes)) throw new Error("Taille de la vidéo incohérente pendant le transfert TikTok.");
  const chunkSize = 10 * 1024 * 1024;
  const totalChunks = Math.ceil(video.byteLength / chunkSize);
  const init = await fetchJson("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: post.title.slice(0, 150),
        privacy_level: privacy,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.byteLength,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    }),
  });
  const publishId = String(init.data?.data?.publish_id || "");
  const uploadUrl = String(init.data?.data?.upload_url || "");
  if (!publishId || !uploadUrl) throw new Error("TikTok n'a pas initialisé le transfert vidéo.");
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize;
    const endExclusive = Math.min(start + chunkSize, video.byteLength);
    const chunk = video.slice(start, endExclusive);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": "bytes " + start + "-" + (endExclusive - 1) + "/" + video.byteLength,
      },
      body: chunk,
    });
    if (!response.ok) throw new Error("TikTok a refusé le bloc vidéo " + (index + 1) + " (HTTP " + response.status + ").");
  }
  const status = await fetchJson("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const state = String(status.data?.data?.status || "");
  if (state === "FAILED") throw new Error("TikTok a refusé la publication : " + String(status.data?.data?.fail_reason || "raison inconnue"));
  const postIds = status.data?.data?.publicaly_available_post_id || [];
  return {
    providerPostId: publishId,
    permalink: Array.isArray(postIds) && postIds[0] && account.username
      ? "https://www.tiktok.com/@" + account.username + "/video/" + postIds[0]
      : "",
    pending: state !== "PUBLISH_COMPLETE",
    pendingMessage: state !== "PUBLISH_COMPLETE" ? "Vidéo transférée à TikTok. Le traitement est encore en cours." : "",
  };
}

async function uploadLinkedInImage(token: string, author: string, media: { asset: SocialMedia; url: string }) {
  if (!["image/jpeg", "image/png", "image/gif"].includes(media.asset.mime_type)) {
    throw new Error("LinkedIn accepte ici les images JPG, PNG ou GIF. Les vidéos restent à publier manuellement.");
  }
  const initialized = await fetchJson("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Linkedin-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  });
  const uploadUrl = String(initialized.data?.value?.uploadUrl || "");
  const imageUrn = String(initialized.data?.value?.image || "");
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn n'a pas initialisé le transfert d'image.");
  const fileResponse = await fetch(media.url);
  if (!fileResponse.ok) throw new Error("Impossible de lire l'image à envoyer sur LinkedIn.");
  const bytes = await fileResponse.arrayBuffer();
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": media.asset.mime_type },
    body: bytes,
  });
  if (!upload.ok) throw new Error("LinkedIn a refusé le transfert d'image (HTTP " + upload.status + ").");
  return imageUrn;
}

async function publishLinkedIn(
  account: SocialAccount, token: string, post: SocialPost, media: { asset: SocialMedia; url: string } | null,
) {
  const author = "urn:li:person:" + account.provider_account_id;
  let content: Record<string, unknown> | undefined;
  if (media) {
    const imageUrn = await uploadLinkedInImage(token, author, media);
    content = { media: { id: imageUrn, title: { text: post.title.slice(0, 200) } } };
  }
  const payload: Record<string, unknown> = {
    author,
    commentary: post.body,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (content) payload.content = content;
  const result = await fetchJson("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Linkedin-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });
  const id = result.response.headers.get("x-restli-id") || result.data?.id || "";
  if (!id) throw new Error("LinkedIn n'a pas confirmé la création de la publication.");
  return { providerPostId: String(id), permalink: "" };
}

async function publishYouTube(
  account: SocialAccount, token: string, post: SocialPost, media: { asset: SocialMedia; url: string } | null,
) {
  if (!media || !media.asset.mime_type.startsWith("video/")) {
    throw new Error("YouTube Data API publie des vidéos. Les images et publications de communauté doivent être publiées manuellement.");
  }
  const init = await fetchJson(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": media.asset.mime_type,
        "X-Upload-Content-Length": String(media.asset.size_bytes),
      },
      body: JSON.stringify({
        snippet: {
          title: post.title.slice(0, 100),
          description: post.body.slice(0, 5000),
          categoryId: "22",
          tags: ["SAMA-PACK", "Sénégal", "Hygiène"],
        },
        status: {
          privacyStatus: String((post as any).youtube_privacy || "public"),
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  const uploadUrl = init.response.headers.get("location");
  if (!uploadUrl) throw new Error("Google n'a pas retourné l'URL de transfert YouTube.");
  const fileResponse = await fetch(media.url);
  if (!fileResponse.ok) throw new Error("Impossible de lire la vidéo hébergée pour YouTube.");
  const bytes = await fileResponse.arrayBuffer();
  if (bytes.byteLength !== Number(media.asset.size_bytes)) throw new Error("Taille de la vidéo incohérente pendant le transfert YouTube.");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": media.asset.mime_type,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  const resultText = await upload.text();
  let result: any = {};
  try { result = resultText ? JSON.parse(resultText) : {}; } catch { /* handled below */ }
  if (!upload.ok || !result.id) throw new Error("YouTube n'a pas confirmé le téléversement (HTTP " + upload.status + ").");
  return { providerPostId: String(result.id), permalink: "https://www.youtube.com/watch?v=" + result.id };
}

async function pollTikTokStatus(target: SocialTarget, account: SocialAccount, token: string) {
  const publishId = String(target.platform_post_id || "");
  const status = await fetchJson("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const result = status.data?.data || {};
  const state = String(result.status || "");
  if (state === "FAILED") {
    throw new Error("TikTok a refusé la publication : " + String(result.fail_reason || "raison inconnue"));
  }
  const ids = result.publicaly_available_post_id || [];
  return {
    providerPostId: publishId,
    permalink: Array.isArray(ids) && ids[0] && account.username
      ? "https://www.tiktok.com/@" + account.username + "/video/" + ids[0]
      : "",
    pending: state !== "PUBLISH_COMPLETE",
    pendingMessage: state !== "PUBLISH_COMPLETE" ? "TikTok traite encore la vidéo." : "",
  };
}

async function publishClaimedTarget(target: SocialTarget) {
  try {
    const { post, account } = await readTargetContext(target);
    const token = await refreshCredential(account);
    const media = await assetForTarget(post.media_asset_id);
    let result: {
      providerPostId: string;
      permalink: string;
      pending?: boolean;
      pendingMessage?: string;
    };
    if (target.provider === "tiktok" && target.platform_post_id) result = await pollTikTokStatus(target, account, token);
    else if (target.provider === "facebook") result = await publishFacebook(account, token, post, media);
    else if (target.provider === "instagram") result = await publishInstagram(account, token, post, media);
    else if (target.provider === "tiktok") result = await publishTikTok(account, token, post, media, target.provider_options || {});
    else if (target.provider === "linkedin") result = await publishLinkedIn(account, token, post, media);
    else result = await publishYouTube(account, token, post, media);
    await updateTarget(target.id, result.pending ? "publishing" : "published", {
      platform_post_id: result.providerPostId,
      permalink: result.permalink,
      published_at: result.pending ? null : new Date().toISOString(),
      error_code: "",
      error_message: result.pendingMessage || "",
    });
    return {
      id: target.id,
      provider: target.provider,
      ok: true,
      pending: Boolean(result.pending),
      message: result.pending ? result.pendingMessage : "Publication confirmée par " + target.provider + ".",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de publication inconnue.";
    try {
      await updateTarget(target.id, "failed", {
        error_code: "publication_failed",
        error_message: message.slice(0, 900),
      });
    } catch (writeError) {
      console.error("Could not save social publish failure", target.id, writeError);
    }
    return { id: target.id, provider: target.provider, ok: false, error: message };
  }
}

async function runDue(req: Request, internal: boolean, origin: string | null) {
  if (!internal) await requirePermission(req, "social.publish");
  const { data, error } = await service.rpc("sama_claim_social_targets", { p_limit: MAX_BATCH });
  if (error) throw new Error("La file de publication n'a pas pu être lue : " + error.message);
  const jobs = (data || []) as SocialTarget[];
  const results = [];
  for (const target of jobs) results.push(await publishClaimedTarget(target));
  const sent = results.filter(result => result.ok && !result.pending).length;
  const pending = results.filter(result => result.ok && result.pending).length;
  const failed = results.filter(result => !result.ok).length;
  return json({
    ok: failed === 0,
    processed: results.length,
    published: sent,
    processing: pending,
    failed,
    results,
  }, 200, origin);
}

async function disconnectAccount(req: Request, accountId: string) {
  const caller = await requirePermission(req, "social.accounts.manage");
  if (!accountId) throw new Error("Compte social manquant.");
  const { data: account, error: readError } = await service.from("social_accounts")
    .select("id,provider,provider_account_id,connected_by")
    .eq("id", accountId).maybeSingle();
  if (readError || !account) throw new Error("Compte social introuvable.");
  const { error: credentialError } = await service.from("social_credentials").delete().eq("social_account_id", accountId);
  if (credentialError) throw new Error("Impossible de retirer le jeton chiffré.");
  const { error } = await service.from("social_accounts").update({
    status: "disconnected",
    last_error: "",
    token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", accountId);
  if (error) throw new Error("Impossible de déconnecter le compte.");
  await service.from("audit_logs").insert({
    actor_user_id: caller.userId,
    actor_label: caller.profile.full_name || caller.profile.email || "Administrateur",
    action: "social_account_disconnected",
    entity_type: "social_account",
    entity_id: accountId,
    details: { provider: account.provider, provider_account_id: account.provider_account_id },
  });
  return { ok: true, message: "Compte social déconnecté." };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.has("code") || url.searchParams.has("error")) return await oauthCallback(req);
    return json({ ok: true, service: "SAMA-PACK social platforms", configured: Boolean(SUPABASE_URL && SERVICE_KEY) }, 200, origin);
  }

  if (req.method !== "POST") return json({ ok: false, error: "Méthode non autorisée." }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "Configuration Supabase incomplète." }, 503, origin);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ ok: false, error: "Corps JSON invalide." }, 400, origin); }

  const action = String(payload.action || "");
  try {
    if (action === "connect") {
      const provider = String(payload.provider || "") as Provider;
      if (!["facebook", "instagram", "tiktok", "linkedin", "youtube"].includes(provider)) {
        return json({ ok: false, error: "Plateforme non prise en charge." }, 400, origin);
      }
      const caller = await requirePermission(req, "social.accounts.manage");
      const authUrl = await startOAuth(provider, caller.userId);
      return json({ ok: true, authorization_url: authUrl }, 200, origin);
    }

    if (action === "disconnect") {
      const result = await disconnectAccount(req, String(payload.account_id || ""));
      return json(result, 200, origin);
    }

    if (action === "run_due") {
      return await runDue(req, false, origin);
    }

    if (action === "worker") {
      const supplied = req.headers.get("x-social-worker-token") || "";
      const { data: configured, error: secretError } = await service.rpc("sama_get_social_worker_token");
      if (secretError || typeof configured !== "string" || !configured || supplied.length !== configured.length) {
        return json({ ok: false, error: "Accès moteur refusé." }, 401, origin);
      }
      let diff = 0;
      for (let index = 0; index < supplied.length; index++) diff |= supplied.charCodeAt(index) ^ configured.charCodeAt(index);
      if (diff !== 0) return json({ ok: false, error: "Accès moteur refusé." }, 401, origin);
      return await runDue(req, true, origin);
    }

    return json({ ok: false, error: "Action inconnue." }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur inconnue.";
    const status = /session|permission|accès réservé|autorisé/i.test(message) ? 403 : 400;
    console.error("SAMA-PACK social platforms action failed", { action, error: message });
    return json({ ok: false, error: message }, status, origin);
  }
});
