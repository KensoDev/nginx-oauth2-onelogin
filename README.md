# nginx-oauth2-onelogin

Note: In this design oauth2-proxy is not your reverse proxy. It does one thing: authenticate. Nginx handles the actual routing.

This is a minimal, constraint-first example of OAuth2/OIDC authentication with OneLogin. The setup deliberately uses oauth2-proxy as auth-only (via `static://200`), not as an application proxy. That's not just cosmetic—it's a design decision that keeps responsibilities clear.

## How This Actually Works

```
┌─────────┐
│ Browser │
└────┬────┘
     │
     │ 1. GET /
     ▼
┌──────────────────────────────────────────────────────────────┐
│ Nginx (Port 80)                                              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ location / {                                        │    │
│  │   auth_request /_oauth2_auth;  ◄──┐                │    │
│  │   ...                              │                │    │
│  │ }                                  │                │    │
│  └────────────────────────────────────┼────────────────┘    │
│                                       │                     │
│  ┌────────────────────────────────────┼─────────────────┐   │
│  │ location = /_oauth2_auth {         │                 │   │
│  │   internal;                        │                 │   │
│  │   proxy_pass http://oauth2-proxy:4180/oauth2/auth;  │   │
│  │ }                                  │                 │   │
│  └────────────────────────────────────┼─────────────────┘   │
└───────────────────────────────────────┼──────────────────────┘
                                        │
                        2. Is user authenticated?
                                        │
                                        ▼
                        ┌───────────────────────────┐
                        │ oauth2-proxy (Port 4180)  │
                        │                           │
                        │ --upstream=static://200   │
                        │                           │
                        │ Checks cookie,            │
                        │ validates session,        │
                        │ returns 200 or 401        │
                        └───────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌───────────────┐             ┌─────────────────┐
            │ 401: No Auth  │             │ 200: Authed     │
            └───────┬───────┘             └────────┬────────┘
                    │                              │
        3. Redirect to OneLogin           4. Forward user info
                    │                         (email, groups)
                    ▼                              │
        ┌──────────────────────┐                  │
        │ OneLogin OIDC        │                  │
        │                      │                  ▼
        │ User logs in,        │          ┌──────────────────┐
        │ returns to callback  │          │ Node.js App      │
        └──────────────────────┘          │ (Port 3000)      │
                                          │                  │
                                          │ Reads headers:   │
                                          │ X-Forwarded-*    │
                                          └──────────────────┘
```

**What's happening:**

1. Browser hits Nginx
2. Nginx asks oauth2-proxy: "Is this user authenticated?" (via internal `/_oauth2_auth`)
3. oauth2-proxy checks the cookie
   - **No valid session?** Returns 401 → Nginx redirects to OneLogin
   - **Valid session?** Returns 200 + user headers → Nginx forwards to your app
4. Your app gets clean headers with user info and never thinks about auth

The key: oauth2-proxy **never sees your application traffic**. It's a gatekeeper, not a middleman.

## Getting This Running

### Step 1: OneLogin Setup

Log into your OneLogin admin panel and create an OIDC app. The important bits:

- **Applications** → **Add App** → **OpenId Connect (OIDC)**
- **Redirect URIs**: `http://localhost/oauth2/callback`
- Save it, grab your **Client ID** and **Client Secret**
- Note your subdomain (the `mycompany` part of `mycompany.onelogin.com`)

That's it. OneLogin's OIDC implementation is straightforward—no weird quirks here.

### Step 2: Environment File

```bash
cp .env.example .env
```

Fill in the blanks:

```bash
ONELOGIN_SUBDOMAIN=mycompany
ONELOGIN_CLIENT_ID=abc123...
ONELOGIN_CLIENT_SECRET=def456...
APP_HOST=localhost
COOKIE_SECRET=$(python -c 'import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')
```

The cookie secret needs to be 32 random bytes. That Python one-liner handles it. Don't hardcode `changeme` in production.

### Step 3: Start Everything

```bash
docker-compose up --build
```

Three containers spin up: Nginx, oauth2-proxy, and a Node.js app. First build takes a minute.

### Step 4: Test It

Open http://localhost. You'll bounce to OneLogin, log in, and land back at a page showing your email and groups.

If it doesn't work, check `docker-compose logs oauth2-proxy`. Usually it's a typo in the client ID or callback URL mismatch.

### The Minimal Flags That Matter

The `docker-compose.yml` oauth2-proxy config is intentionally stripped down:

```yaml
--provider=oidc
--oidc-issuer-url=https://...onelogin.com/oidc/2
--client-id=${ONELOGIN_CLIENT_ID}
--client-secret=${ONELOGIN_CLIENT_SECRET}
--redirect-url=http://localhost/oauth2/callback
--upstream=static://200           # ← Notice me: If you choose to have oauth2-proxy as your reverse proxy, this needs to be your actual upstream
--cookie-secret=${COOKIE_SECRET}
--email-domain=*                  # Accept any email (tighten in prod)
--set-xauthrequest=true           # Pass user info to Nginx
--pass-user-headers=true
--scope=openid email profile groups
```

## What Your App Sees

When a user is authenticated, your Node.js app (or Python, Go, whatever) receives these headers:

```
X-Forwarded-Email: user@company.com
X-Forwarded-User: user
X-Forwarded-Groups: engineering,admins
X-Access-Token: eyJhbGc...
```

The example `app/server.js` just displays them. In a real app, you'd use these for:
- Authorization decisions ("Is this user in the `admins` group?")
- Audit logs ("user@company.com deleted resource X")
- User context (show email in the navbar)

Your app **never handles OAuth flows**. It reads headers. That's it.

## Adding Group-Based Access Control

Want to restrict access to users in a specific OneLogin group? Add this flag to `docker-compose.yml`:

```yaml
- --allowed-group=engineering
```

Now only users in the `engineering` group get through. Everyone else hits a 403.

I left this commented out because "just work" means accepting any authenticated user. But group enforcement is one line if you need it.

## Real-World Modifications

This example uses `http://localhost` and `--cookie-secure=false` because it's meant to run locally. In production:

1. Change `APP_HOST` to your real domain
2. Use HTTPS (Let's Encrypt + Nginx)
3. Set `--cookie-secure=true`
4. Tighten `--email-domain` (or keep `*` if you trust your IdP)
5. Consider `--session-store-type=redis` for multi-instance deployments

But start here. Get it working in 5 minutes, then layer in production concerns.

## License

MIT
