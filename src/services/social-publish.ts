import { store } from '../db/store';
import { Client, CreativeVariant } from '../models/schemas';

// ── Meta (Facebook + Instagram) ──

const META_API = 'https://graph.facebook.com/v21.0';

export function getMetaAuthUrl(clientId: string, redirectUri: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error('META_APP_ID not configured');
  const scopes = 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management';
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${clientId}&response_type=code`;
}

export async function exchangeMetaCode(code: string, redirectUri: string): Promise<{ access_token: string; user_id: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('META_APP_ID/SECRET not configured');

  // Exchange code for short-lived token
  const res = await fetch(`${META_API}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Exchange for long-lived token
  const longRes = await fetch(`${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${data.access_token}`);
  const longData = await longRes.json();
  if (longData.error) throw new Error(longData.error.message);

  // Get user ID
  const meRes = await fetch(`${META_API}/me?access_token=${longData.access_token}`);
  const me = await meRes.json();

  return { access_token: longData.access_token, user_id: me.id };
}

export async function getMetaPages(accessToken: string): Promise<Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string } }>> {
  const res = await fetch(`${META_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${accessToken}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data || [];
}

export async function publishToFacebook(client: Client, variant: CreativeVariant): Promise<{ id: string; post_id: string }> {
  const meta = client.meta_config;
  if (!meta?.page_access_token || !meta?.page_id) throw new Error('Facebook page not connected');

  const copy = variant.copy_json as any;
  const media = variant.media_plan_json as any;
  const heroImg = media?.hero_image || (media?.selected_images || [])[0];
  const message = copy.primary_text || copy.caption || '';

  let postId: string;
  if (heroImg) {
    // Photo post
    const res = await fetch(`${META_API}/${meta.page_id}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: heroImg, message, access_token: meta.page_access_token }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    postId = data.post_id || data.id;
  } else {
    // Text-only post
    const res = await fetch(`${META_API}/${meta.page_id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: meta.page_access_token }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    postId = data.id;
  }

  return { id: postId, post_id: postId };
}

export async function publishToInstagram(client: Client, variant: CreativeVariant): Promise<{ id: string }> {
  const meta = client.meta_config;
  if (!meta?.page_access_token || !meta?.instagram_account_id) throw new Error('Instagram not connected');

  const copy = variant.copy_json as any;
  const media = variant.media_plan_json as any;
  const heroImg = media?.hero_image || (media?.selected_images || [])[0];
  if (!heroImg) throw new Error('Instagram requires an image');

  const caption = copy.caption || copy.primary_text || '';
  const hashtags = (copy.hashtags || []).join(' ');
  const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

  // Step 1: Create media container
  const createRes = await fetch(`${META_API}/${meta.instagram_account_id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: heroImg, caption: fullCaption, access_token: meta.page_access_token }),
  });
  const container = await createRes.json();
  if (container.error) throw new Error(container.error.message);

  // Step 2: Publish
  const pubRes = await fetch(`${META_API}/${meta.instagram_account_id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: meta.page_access_token }),
  });
  const pub = await pubRes.json();
  if (pub.error) throw new Error(pub.error.message);

  return { id: pub.id };
}

// ── TikTok ──

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

export function getTikTokAuthUrl(clientId: string, redirectUri: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) throw new Error('TIKTOK_CLIENT_KEY not configured');
  const scopes = 'user.info.basic,video.publish,video.upload';
  return `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${clientId}`;
}

export async function exchangeTikTokCode(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token: string; open_id: string }> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error('TIKTOK credentials not configured');

  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey, client_secret: clientSecret,
      code, grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    open_id: data.open_id,
  };
}

export async function getTikTokUserInfo(accessToken: string): Promise<{ display_name: string; open_id: string }> {
  const res = await fetch(`${TIKTOK_API}/user/info/?fields=display_name,open_id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.data?.user || {};
}
