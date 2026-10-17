import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import session from "express-session";
import cookieParser from 'cookie-parser';
import { getGeoInfo } from "./utils/geolocation";
import { emailService } from "./services/email-service";
import { sanitizeUser } from "./utils/sanitize-user"; import { requestIdFor, sendContainmentError } from "./security-containment";

function retiredRegistrationIdentity(): {
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
  lifecycleOperationId: string;
  guestCapabilityHash: string;
} {
  throw new Error("Native registration cannot establish a server-owned identity");
}

// Helper functions for device detection
export function extractBrowserInfo(userAgent: string): { name: string, version: string } {
  const browserRegexes = [
    { name: 'Chrome', regex: /Chrome\/([0-9.]+)/ },
    { name: 'Firefox', regex: /Firefox\/([0-9.]+)/ },
    { name: 'Safari', regex: /Version\/([0-9.]+).*Safari/ },
    { name: 'Edge', regex: /Edg(e)?\/([0-9.]+)/ },
    { name: 'Opera', regex: /OPR\/([0-9.]+)/ },
    { name: 'IE', regex: /MSIE ([0-9.]+)/ }
  ];

  for (const browser of browserRegexes) {
    const match = userAgent.match(browser.regex);
    if (match) {
      return {
        name: browser.name,
        version: match[1] || match[2] || ''
      };
    }
  }

  return { name: 'Unknown', version: '' };
}

export function extractOSInfo(userAgent: string): { name: string, version: string } {
  const osRegexes = [
    { name: 'Windows', regex: /Windows NT ([0-9.]+)/ },
    { name: 'macOS', regex: /Mac OS X ([0-9_]+)/ },
    { name: 'iOS', regex: /iPhone OS ([0-9_]+)/ },
    { name: 'Android', regex: /Android ([0-9.]+)/ },
    { name: 'Linux', regex: /Linux/ }
  ];

  for (const os of osRegexes) {
    const match = userAgent.match(os.regex);
    if (match) {
      // Convert underscore version format to dot format if needed
      const version = match[1] ? match[1].replace(/_/g, '.') : '';
      return { name: os.name, version };
    }
  }

  return { name: 'Unknown', version: '' };
}

export function extractDeviceInfo(userAgent: string): { type: string, model: string } {
  // Check if mobile
  if (/mobi|android|iphone|ipad|ipod/i.test(userAgent.toLowerCase())) {
    if (/ipad/i.test(userAgent)) {
      return { type: 'tablet', model: 'iPad' };
    } else if (/iphone/i.test(userAgent)) {
      return { type: 'mobile', model: 'iPhone' };
    } else if (/android/i.test(userAgent)) {
      if (/tablet|sm-t|mediapad/i.test(userAgent)) {
        return { type: 'tablet', model: extractDeviceModel(userAgent) };
      } else {
        return { type: 'mobile', model: extractDeviceModel(userAgent) };
      }
    }
    return { type: 'mobile', model: extractDeviceModel(userAgent) };
  }

  // Default to desktop
  return { type: 'desktop', model: extractDeviceModel(userAgent) };
}

export function extractDeviceModel(userAgent: string): string {
  // Extract device model from user agent string (simplified version)
  // This is a simplified approach, can be enhanced for better accuracy
  const modelMatches = userAgent.match(/\(([^;]+);/);
  if (modelMatches && modelMatches[1]) {
    return modelMatches[1].trim();
  }

  return 'Unknown';
}

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

// Constants for consistent hashing
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${derivedKey.toString('hex')}.${salt.toString('hex')}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hash, saltHex] = stored.split('.');
    if (!hash || !saltHex) {
      console.error('Invalid stored password format');
      return false;
    }

    const salt = Buffer.from(saltHex, 'hex');
    const derivedKey = await scryptAsync(supplied, salt, KEY_LENGTH) as Buffer;
    const suppliedHash = derivedKey.toString('hex');

    return hash === suppliedHash;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

// SSO Cookie-based authentication middleware
function checkSSOCookie(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip SSO check if user is already authenticated
    if (req.isAuthenticated()) {
      return next();
    }

    // Check for SSO cookie
    const ssoCookie = req.cookies?.localtunes_cross_domain_auth;
    if (!ssoCookie) {
      return next();
    }

    console.log('🔍 Checking SSO cookie authentication');

    // Parse the cookie data
    let cookieData;
    try {
      // The cookie value is URL-encoded, so we need to decode it first
      const decodedCookie = decodeURIComponent(ssoCookie);
      cookieData = JSON.parse(decodedCookie);
    } catch (error) {
      console.log('⚠️ Failed to parse SSO cookie:', error);
      return next();
    }

    // Validate required fields
    if (!cookieData.auth_token || !cookieData.auth_user || !cookieData.expiresAt) {
      console.log('⚠️ SSO cookie missing required fields');
      return next();
    }

    // Check if cookie is expired
    const now = Date.now();
    if (now > cookieData.expiresAt) {
      console.log('⚠️ SSO cookie has expired');
      return next();
    }

    // Parse user data from auth_user field
    let userData;
    try {
      userData = JSON.parse(cookieData.auth_user);
    } catch (error) {
      console.log('⚠️ Failed to parse user data from SSO cookie:', error);
      return next();
    }

    // Validate user data
    if (!userData.id || !userData.username) {
      console.log('⚠️ SSO cookie user data missing required fields');
      return next();
    }

    console.log('✅ Valid SSO cookie found, creating session for user:', userData.username);

    // Create a user object compatible with SelectUser type
    const ssoUser: SelectUser = {
      id: userData.id,
      username: userData.username,
      email: userData.email || null,
      password: '', // Don't store password from SSO
      otp: userData.otp || null,
      otpExpiry: userData.otpExpiry ? new Date(userData.otpExpiry) : null,
      emailVerificationToken: userData.emailVerificationToken || null,
      emailVerificationExpiry: userData.emailVerificationExpiry ? new Date(userData.emailVerificationExpiry) : null,
      isEmailVerified: userData.isEmailVerified || false,
      isAdmin: userData.isAdmin || false,
      createdAt: userData.createdAt ? new Date(userData.createdAt) : new Date(),
      updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : new Date(),
      guestUrl: userData.guestUrl || 'sso-guest',
      venueName: userData.venueName || 'SSO Venue',
      theme: userData.theme || { primary: '#6E56CF' },
      allowSongRequests: userData.allowSongRequests !== undefined ? userData.allowSongRequests : true,
      allowGuestPlayOnDevice: userData.allowGuestPlayOnDevice !== undefined ? userData.allowGuestPlayOnDevice : true,
      allowPlaylistSharing: userData.allowPlaylistSharing !== undefined ? userData.allowPlaylistSharing : false,
      allowRecentlyPlayedVisibility: userData.allowRecentlyPlayedVisibility !== undefined ? userData.allowRecentlyPlayedVisibility : true,
      allowQueueVisibility: userData.allowQueueVisibility !== undefined ? userData.allowQueueVisibility : false,
      accountManagerId: userData.accountManagerId || null,
      musicQueueRevision: Number(userData.musicQueueRevision ?? 0),
    };

    // Create a session for the SSO user
    req.login(ssoUser, (err) => {
      if (err) {
        console.error('❌ Failed to create session for SSO user:', err);
        return next();
      }

      console.log('✅ SSO authentication successful, session created for user:', ssoUser.username);

      // Save the session
      req.session.save((err) => {
        if (err) {
          console.error('❌ Failed to save SSO session:', err);
        } else {
          console.log('✅ SSO session saved successfully');
        }
        next();
      });
    });

  } catch (error) {
    console.error('❌ SSO cookie authentication error:', error);
    next();
  }
}

export function setupAuth(app: Express) {
  // Ensure required secrets are available — fail hard in production
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || !process.env.COOKIE_SECRET)) {
    throw new Error('SESSION_SECRET and COOKIE_SECRET environment variables must be set in production');
  }
  const sessionSecret = process.env.SESSION_SECRET || 'dev-only-session-secret';
  const cookieSecret = process.env.COOKIE_SECRET || 'dev-only-cookie-secret';

  // Determine the correct domain for cookies based on the request
  const getDomainFromReq = (req: any): string | undefined => {
    const host = req.headers?.host || '';

    // Examples: 
    // - c126e283-bf76-415e-88ef-a2a78e347c9a-00-3bmhn9lgr6c8q.riker.replit.dev
    // - live-tunes-tandavkrishnash.replit.app

    // Extract the base domain from the host
    const replitDomains = ['.replit.dev', '.replit.app', '.repl.co'];

    // Check if host contains any Replit domains
    for (const domain of replitDomains) {
      if (host.includes(domain)) {
        // For Replit domains, we don't need to set domain explicitly
        // This allows the browser to handle it automatically
        return undefined;
      }
    }

    // For custom domains, you may need specific logic
    return undefined; // Let browser set the default domain
  };

  // Configure session settings for optimal persistence
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    name: 'cosmic.sid',
    rolling: true, // Extend session lifetime on each request
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for better persistence
      path: '/'
      // Domain will be set dynamically per request
    }
  };

  // Configure cookie parser with secret
  app.use(cookieParser(cookieSecret));

  // Proxy trust is configured once by app.ts from the explicit bounded hop count.

  // Log session setup with more details
  console.log('Session setup with PostgreSQL store', {
    secure: sessionSettings.cookie?.secure,
    sameSite: sessionSettings.cookie?.sameSite,
    maxAge: sessionSettings.cookie?.maxAge
  });

  // Create session middleware with dynamic domain handling
  const sessionMiddleware = session(sessionSettings);
  app.set('music session middleware', sessionMiddleware);

  // Wrap the session middleware to handle domain dynamically
  app.use((req, res, next) => {
    // Override the cookie settings dynamically for this request
    if (sessionSettings.cookie) {
      // Get the domain based on the current request
      const domain = getDomainFromReq(req);

      // Log session cookie configuration to debug
      console.log('Cookie configuration for request:', {
        host: req.headers.host,
        domain,
        secure: sessionSettings.cookie.secure,
        sameSite: sessionSettings.cookie.sameSite
      });

      // Store the original cookie path value
      // The session middleware will use this to generate cookies for this request
      if (domain) {
        // When we have a domain, set it explicitly
        (req as any)._sessionCookieDomain = domain;
      }
    }

    // Call the regular session middleware with our enriched request
    sessionMiddleware(req, res, next);
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // Embedded clients must never synthesize a native session from a browser
  // cookie. The standalone local-account session remains the only native path.

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('Login attempt:', { username, passwordLength: password.length });

        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log('User not found:', username);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log('Found user:', {
          id: user.id,
          username: user.username,
          passwordFormat: user.password ? `${user.password.substring(0, 20)}...` : 'null',
          passwordLength: user.password ? user.password.length : 0
        });

        const passwordValid = await comparePasswords(password, user.password);
        console.log('Password validation:', { username, valid: passwordValid });

        if (!passwordValid) {
          console.log('Invalid password for user:', username);
          return done(null, false, { message: "Invalid username or password" });
        }

        return done(null, user);
      } catch (error) {
        console.error('Authentication error:', error);
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('Deserializing user:', id);
      const user = await storage.getUser(id);
      if (!user) {
        console.log('User not found during deserialization:', id);
        return done(null, false);
      }
      console.log('Successfully deserialized user:', user.id);
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Login endpoint with enhanced error handling and logging
  app.post("/api/login", (req, res, next) => {
    console.log('Login request:', {
      username: req.body.username,
      passwordLength: req.body.password?.length,
      sessionID: req.sessionID,
      cookies: req.cookies
    });

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }

      if (!user) {
        console.log('Authentication failed:', info?.message);
        return sendContainmentError(res, 401, "AUTH_INVALID", requestIdFor(req));
      }

      req.session.regenerate((rotationError) => {
        if (rotationError) return next(rotationError);
        req.login(user, (err) => {
          if (err) {
            console.error('Session creation error:', err);
            return next(err);
          }

        // Ensure session is saved before sending response
        req.session.save(async (err) => {
          if (err) {
            console.error('Session save error:', err);
            return next(err);
          }
          console.log('Login successful:', {
            id: user.id,
            username: user.username,
            sessionID: req.sessionID
          });

          // Extract device information and save session
          try {
            const userAgent = req.headers['user-agent'] || '';
            const ipAddress = (
              req.headers['x-forwarded-for'] as string ||
              req.socket.remoteAddress ||
              'Unknown'
            ).split(',')[0].trim();

            // Extract device info
            const deviceInfo = extractDeviceInfo(userAgent);
            const browserInfo = extractBrowserInfo(userAgent);
            const osInfo = extractOSInfo(userAgent);

            // Get geolocation data from IP
            const { countryCode, region, geoData } = getGeoInfo(ipAddress);
            console.log('Geolocation data:', { countryCode, region, ipAddress });

            // Create a new session record
            await storage.createUserSession(
              user.id,
              req.sessionID,
              ipAddress,
              {
                device: {
                  type: deviceInfo.type,
                  model: deviceInfo.model
                },
                browser: browserInfo,
                os: osInfo,
                isMobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent.toLowerCase()),
                language: req.headers['accept-language'] || 'en-US'
              },
              countryCode,
              region,
              geoData ? JSON.stringify(geoData) : null
            );

            console.log('Device session recorded for user:', user.id);
          } catch (error) {
            console.error('Failed to save device session:', error);
            // Continue anyway - this is non-critical functionality
          }

            res.json(sanitizeUser(user));
          });
        });
      });
    })(req, res, next);
  });

  // Registration endpoint
  app.post("/api/register", async (req, res) => {
    return sendContainmentError(res, 410, "LEGACY_IDENTITY_ROUTE_REMOVED", requestIdFor(req));
    /* c8 ignore start -- retained only until the retired registration body is removed. */
    try {
      console.log('Registration attempt:', {
        username: req.body.username,
        venueName: req.body.venueName,
        hasEmail: !!req.body.email,
        hasPhoneNumber: !!req.body.phoneNumber,
        countryCode: req.body.countryCode || null,
        passwordLength: req.body.password?.length
      });

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log('Registration failed - username exists:', req.body.username);
        return res.status(400).json({
          message: "Username already exists"
        });
      }

      // Check if email is already in use if provided
      if (req.body.email) {
        const userWithEmail = await storage.getUserByEmail(req.body.email);
        if (userWithEmail) {
          console.log('Registration failed - email exists:', req.body.email);
          return res.status(400).json({
            message: "Email address is already in use"
          });
        }
      }

      // Extract phone information
      const phoneNumber = req.body.phoneNumber || null;
      const countryCode = req.body.countryCode || null;

      // Remove phone-related fields from user registration data
      const { phoneNumber: _, countryCode: __, ...userData } = req.body;

      // Hash password and create user
      console.log('Hashing password for user:', req.body.username);
      const hashedPassword = await hashPassword(userData.password);
      console.log('Password hashed successfully:', {
        username: req.body.username,
        hashedPasswordLength: hashedPassword.length,
        hashedPasswordFormat: `${hashedPassword.substring(0, 20)}...`
      });

      const user = await storage.createUser({
        ...userData,
        ...retiredRegistrationIdentity(),
        password: hashedPassword,
        isEmailVerified: false // Ensure new users start with unverified email
      });

      console.log('User registered successfully:', {
        id: user.id,
        username: user.username,
        storedPasswordLength: user.password ? user.password.length : 0
      });

      // Create user profile if phone information is provided
      if (phoneNumber && countryCode) {
        try {
          await storage.createUserProfile(user.id, {
            phoneNumber,
            countryCode,
            firstName: '',
            lastName: '',
          });
          console.log('User profile created with phone info:', { phoneNumber, countryCode });
        } catch (profileError) {
          console.error('Failed to create user profile with phone info:', profileError);
          // Continue with registration even if profile creation fails
        }
      }

      // Send verification email if email was provided
      let emailSent = false;
      if (req.body.email) {
        try {
          const { success, message, error } = await emailService.sendEmailVerification(
            user.id,
            req.body.email,
            user.username
          );

          emailSent = success;

          if (!success) {
            console.error('Failed to send verification email:', error);
          } else {
            console.log('Verification email sent successfully');
          }
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
        }
      }

      // Rotate before post-registration login so a supplied session identifier
      // cannot survive the authentication boundary.
      req.session.regenerate((rotationError) => {
        if (rotationError) return res.status(500).json({ message: "Registration succeeded but login failed" });
        req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return res.status(500).json({ message: "Registration succeeded but login failed" });
        }

        // Ensure session is saved
        req.session.save(async (err) => {
          if (err) {
            console.error('Session save error after registration:', err);
            return res.status(500).json({ message: "Registration succeeded but session save failed" });
          }

          // Extract device information and save session for new registration
          try {
            const userAgent = req.headers['user-agent'] || '';
            const ipAddress = (
              req.headers['x-forwarded-for'] as string ||
              req.socket.remoteAddress ||
              'Unknown'
            ).split(',')[0].trim();

            // Extract device info
            const deviceInfo = extractDeviceInfo(userAgent);
            const browserInfo = extractBrowserInfo(userAgent);
            const osInfo = extractOSInfo(userAgent);

            // Get geolocation data from IP
            const { countryCode: geoCountryCode, region, geoData } = getGeoInfo(ipAddress);
            console.log('Geolocation data for new registration:', { geoCountryCode, region, ipAddress });

            // Create a new session record
            await storage.createUserSession(
              user.id,
              req.sessionID,
              ipAddress,
              {
                device: {
                  type: deviceInfo.type,
                  model: deviceInfo.model
                },
                browser: browserInfo,
                os: osInfo,
                isMobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent.toLowerCase()),
                language: req.headers['accept-language'] || 'en-US'
              },
              geoCountryCode,
              region,
              geoData ? JSON.stringify(geoData) : null
            );

            console.log('Device session recorded for new registration:', user.id);
          } catch (sessionError) {
            console.error('Failed to save device session after registration:', sessionError);
            // Continue anyway - this is non-critical functionality
          }

          // Include emailVerificationSent flag in the response
          res.status(201).json({
            ...sanitizeUser(user),
            emailVerificationSent: emailSent
          });
        });
      });
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        message: "Registration failed",
        error: "Unknown error"
      });
    }
    /* c8 ignore stop */
  });

  app.post("/api/logout", (req, res, next) => {
    console.log('Logout request received');
    if (req.session) {
      const sessionID = req.sessionID;
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
          return next(err);
        }
        storage.sessionStore.destroy(sessionID, (err) => {
          if (err) {
            console.error('Session store destruction error:', err);
          }

          // Get the domain based on the current request (same as login)
          const domain = getDomainFromReq(req);

          // Clear cookies with the same settings as they were set
          // This is crucial - cookie clearing must match cookie setting params
          const cookieOptions = {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const
          };

          // Only add domain if it was explicitly set
          if (domain) {
            (cookieOptions as any).domain = domain;
          }

          // Log cookie clearing options
          console.log('Clearing cookies with options:', {
            ...cookieOptions,
            host: req.headers.host,
            domain
          });

          // Clear main session cookie and any potential fallbacks
          res.clearCookie('cosmic.sid', cookieOptions);
          res.clearCookie('connect.sid', cookieOptions);

          // Clear SSO cookie (non-httpOnly cookie)
          const ssoCookieOptions = {
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const
          };

          // Only add domain if it was explicitly set
          if (domain) {
            (ssoCookieOptions as any).domain = domain;
          }

          res.clearCookie('localtunes_cross_domain_auth', ssoCookieOptions);

          console.log('Logout successful, all cookies cleared with options');
          res.sendStatus(200);
        });
      });
    } else {
      res.sendStatus(200);
    }
  });

  // Check authentication status
  app.get("/api/check", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ authenticated: true, user: sanitizeUser(req.user) });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  // CSRF token endpoint
  app.get("/api/csrf-token", (req, res) => {
    // Generate a simple CSRF token
    const token = randomBytes(32).toString('hex');

    // Set the token as a cookie
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Allow client-side access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Match session cookie settings
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    res.json({ token });
  });
}
