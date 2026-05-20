import { oauthBaseUrl, oauthScope } from "../../lib/api-common";

export default function handler(req: any, res: any) {
  try {
    const clientId = process.env.QURAN_CLIENT_ID;
    if (!clientId) return res.redirect('/?quran_login=error&reason=missing_client_id');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host || req.headers['x-forwarded-host'];
    if (!host) return res.redirect('/?quran_login=error&reason=missing_host');
    const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const secureCookie = protocol === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `quran_oauth_state=${encodeURIComponent(state)}; Path=/api/auth/quran/callback; HttpOnly; SameSite=Lax${secureCookie}; Max-Age=600`);
    const authUrl = `${oauthBaseUrl}/oauth2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(oauthScope)}&state=${state}`;
    return res.redirect(authUrl);
  } catch {
    return res.redirect('/?quran_login=error&reason=auth_init_failed');
  }
}
