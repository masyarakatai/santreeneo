export default async function handler(req: any, res: any) {
  const oauthBaseUrl = process.env.QURAN_OAUTH2_BASE_URL || "https://prelive-oauth2.quran.foundation";
  const parseCookies = (cookieHeader?: string) => {
    const out: Record<string, string> = {};
    if (!cookieHeader) return out;
    for (const pair of cookieHeader.split(";")) {
      const [rawKey, ...rawVal] = pair.trim().split("=");
      if (!rawKey) continue;
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join("="));
    }
    return out;
  };

  const { code, error, error_description, state } = req.query || {};
  if (error) return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(error_description || error)}`);
  if (!code) return res.redirect('/?quran_login=error&reason=no_code_received');

  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies.quran_oauth_state;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const secureCookie = protocol === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `quran_oauth_state=; Path=/api/auth/quran/callback; HttpOnly; SameSite=Lax${secureCookie}; Max-Age=0`);
  if (!state || !expectedState || state !== expectedState) return res.redirect('/?quran_login=error&reason=invalid_state');

  try {
    const host = req.headers.host || req.headers['x-forwarded-host'];
    const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;
    const authHeader = 'Basic ' + Buffer.from(`${process.env.QURAN_CLIENT_ID}:${process.env.QURAN_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch(`${oauthBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      const msg = tokenData.error_description || tokenData.error || 'Token exchange failed';
      return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(msg)}`);
    }
    const hashParts = [`access_token=${encodeURIComponent(tokenData.access_token)}`];
    if (tokenData.id_token) hashParts.push(`id_token=${encodeURIComponent(tokenData.id_token)}`);
    return res.redirect(`/?quran_login=success#${hashParts.join('&')}`);
  } catch (e: any) {
    return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(e?.message || 'callback_failed')}`);
  }
}
