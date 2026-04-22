const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const path = require('path');
const fs   = require('fs');
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

let usersDb = null;
let profilesDb = null;
let log = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

// ── Is auth enabled? ─────────────────────────────────────────────────────────
// Auth is enabled only when at least one provider is configured.
function isEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID || process.env.GITHUB_CLIENT_ID);
}

// ── Initialize ────────────────────────────────────────────────────────────────
function init(opts) {
  const baseDir = opts.baseDir;
  log = opts.log || log;
  profilesDb = opts.profilesDb;

  if (!isEnabled()) {
    log.info('Auth disabled — no GOOGLE_CLIENT_ID or GITHUB_CLIENT_ID in .env. Running in open mode.');
    return;
  }

  // users database
  const usersFile = path.join(baseDir, 'users.json');
  usersDb = low(new FileSync(usersFile));
  usersDb.defaults({ users: [] }).write();

  // Passport serialization
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const user = usersDb.get('users').find({ id }).value();
    done(null, user || null);
  });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

  // Google strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${baseUrl}/auth/google/callback`
    }, (accessToken, refreshToken, profile, done) => {
      const user = findOrCreateUser('google', profile.id, {
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || ''
      });
      done(null, user);
    }));
    log.info('Google OAuth configured');
  }

  // GitHub strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${baseUrl}/auth/github/callback`
    }, (accessToken, refreshToken, profile, done) => {
      const user = findOrCreateUser('github', profile.id, {
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || profile.username || ''
      });
      done(null, user);
    }));
    log.info('GitHub OAuth configured');
  }
}

// ── Find or create a user from OAuth profile ──────────────────────────────────
function findOrCreateUser(provider, providerId, info) {
  const id = `${provider}_${providerId}`;
  let user = usersDb.get('users').find({ id }).value();
  if (user) {
    // update name/email in case they changed
    usersDb.get('users').find({ id }).assign({
      email: info.email || user.email,
      name: info.name || user.name,
      lastLogin: new Date().toISOString()
    }).write();
    user = usersDb.get('users').find({ id }).value();
    log.info(`User logged in: ${user.name} (${user.email}) via ${provider}`);
    return user;
  }

  // new user — first user becomes admin
  const isFirst = usersDb.get('users').value().length === 0;
  const newUser = {
    id,
    provider,
    providerId,
    email: info.email || '',
    name: info.name || '',
    isAdmin: isFirst,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
  usersDb.get('users').push(newUser).write();
  log.info(`New user created: ${newUser.name} (${newUser.email}) via ${provider}${isFirst ? ' [ADMIN]' : ''}`);
  return newUser;
}

// ── Auth routes ───────────────────────────────────────────────────────────────
function addRoutes(app) {
  // Always register auth status endpoint
  app.get('/api/auth/me', (req, res) => {
    if (!isEnabled() || !req.isAuthenticated?.()) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        isAdmin: req.user.isAdmin,
        provider: req.user.provider
      }
    });
  });

  if (!isEnabled()) return;

  app.use(passport.initialize());
  app.use(passport.session());

  // Google
  if (process.env.GOOGLE_CLIENT_ID) {
    app.get('/auth/google', passport.authenticate('google', {
      scope: ['profile', 'email']
    }));
    app.get('/auth/google/callback', passport.authenticate('google', {
      failureRedirect: '/login'
    }), (req, res) => res.redirect('/'));
  }

  // GitHub
  if (process.env.GITHUB_CLIENT_ID) {
    app.get('/auth/github', passport.authenticate('github', {
      scope: ['user:email']
    }));
    app.get('/auth/github/callback', passport.authenticate('github', {
      failureRedirect: '/login'
    }), (req, res) => res.redirect('/'));
  }

  // Logout
  app.get('/auth/logout', (req, res) => {
    const name = req.user?.name || 'unknown';
    req.logout(() => {
      log.info(`User logged out: ${name}`);
      res.redirect('/login');
    });
  });

  // Login page
  app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    res.send(loginPage());
  });
}

// ── Middleware: require authentication ─────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!isEnabled()) return next(); // no-auth dev mode
  // skip auth for login page, auth routes, and static assets
  if (req.path === '/login' || req.path.startsWith('/auth/')) return next();
  if (!req.isAuthenticated()) {
    // API calls get 401, page requests get redirect
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
    return res.redirect('/login');
  }
  next();
}

// ── Middleware: check profile access ──────────────────────────────────────────
// Called after requireProfile — checks that the authenticated user owns this profile or is admin
function requireProfileAccess(req, res, next) {
  if (!isEnabled()) return next(); // no-auth dev mode
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.isAdmin) return next(); // admins access all profiles

  const profileId = req.headers['x-profile-id'];
  const profile = profilesDb.get('profiles').find({ id: profileId }).value();
  if (!profile) return next(); // let requireProfile handle 404
  if (profile.ownerId && profile.ownerId !== user.id) {
    return res.status(403).json({ error: 'Access denied to this profile' });
  }
  next();
}

// ── Get profiles visible to a user ────────────────────────────────────────────
function visibleProfiles(user) {
  if (!isEnabled() || !usersDb) return null; // null = show all (dev mode)
  const all = profilesDb.get('profiles').value();
  if (user?.isAdmin) return all;
  return all.filter(p => !p.ownerId || p.ownerId === user?.id);
}

// ── Manage admins ─────────────────────────────────────────────────────────────
function setAdmin(userId, isAdmin) {
  if (!usersDb) return false;
  const user = usersDb.get('users').find({ id: userId }).value();
  if (!user) return false;
  usersDb.get('users').find({ id: userId }).assign({ isAdmin }).write();
  log.info(`Admin ${isAdmin ? 'granted' : 'revoked'} for ${user.name} (${userId})`);
  return true;
}

// ── Login page HTML ───────────────────────────────────────────────────────────
function loginPage() {
  const hasGoogle = !!process.env.GOOGLE_CLIENT_ID;
  const hasGithub = !!process.env.GITHUB_CLIENT_ID;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NuTrack — Sign in</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
           background:#FAF9F6; display:flex; justify-content:center; align-items:center; min-height:100vh; }
    .card { background:#fff; border-radius:16px; padding:2.5rem; width:100%; max-width:380px;
            box-shadow:0 2px 16px rgba(0,0,0,.08); text-align:center; }
    h1 { font-size:24px; color:#2D2D2A; margin-bottom:6px; }
    .sub { font-size:14px; color:#6b6a64; margin-bottom:2rem; }
    .btn { display:flex; align-items:center; justify-content:center; gap:10px; width:100%;
           padding:12px 20px; border-radius:8px; font-size:15px; font-weight:500;
           text-decoration:none; margin-bottom:12px; transition:all .15s; cursor:pointer; border:none; }
    .btn-google { background:#fff; color:#333; border:1.5px solid #ddd; }
    .btn-google:hover { background:#f5f5f5; border-color:#bbb; }
    .btn-github { background:#24292e; color:#fff; }
    .btn-github:hover { background:#3a3f44; }
    .btn svg { width:20px; height:20px; }
    .footer { font-size:11px; color:#999; margin-top:1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🥗 NuTrack</h1>
    <p class="sub">Sign in to access your nutrition tracker</p>
    ${hasGoogle ? `<a href="/auth/google" class="btn btn-google">
      <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Sign in with Google
    </a>` : ''}
    ${hasGithub ? `<a href="/auth/github" class="btn btn-github">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
      Sign in with GitHub
    </a>` : ''}
    ${!hasGoogle && !hasGithub ? '<p style="color:#999">No OAuth providers configured. Add GOOGLE_CLIENT_ID or GITHUB_CLIENT_ID to .env</p>' : ''}
    <div class="footer">Your data stays on this server. We only use your name and email for login.</div>
  </div>
</body>
</html>`;
}

module.exports = {
  isEnabled,
  init,
  addRoutes,
  requireAuth,
  requireProfileAccess,
  visibleProfiles,
  setAdmin
};
