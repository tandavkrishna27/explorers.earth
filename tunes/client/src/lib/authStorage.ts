/**
 * Client-side authentication persistence utilities
 * This provides a fallback mechanism when server-side sessions fail
 * Now supports both cookie-based and localStorage-based SSO
 */

import { User as SelectUser } from "@shared/schema";

// Local storage keys
const AUTH_USER_KEY = 'auth_user';
const AUTH_TOKEN_KEY = 'auth_token';
const SSO_TIMESTAMP_KEY = 'sso_timestamp';

// Cookie-based SSO key
const SSO_COOKIE_KEY = 'localtunes_cross_domain_auth';

// Cookie reading utility
function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  
  try {
    const value = document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='))
      ?.split('=')[1];
    
    return value ? decodeURIComponent(value) : null;
  } catch (error) {
    console.error('Failed to read cookie:', error);
    return null;
  }
}

// Parse SSO cookie data
function parseSSOCookie(): any | null {
  try {
    const cookieValue = getCookieValue(SSO_COOKIE_KEY);
    if (!cookieValue) return null;
    
    // The cookie value is URL-encoded, so we need to decode it first
    const decodedValue = decodeURIComponent(cookieValue);
    const cookieData = JSON.parse(decodedValue);
    
    // Validate required fields
    if (!cookieData.auth_token || !cookieData.auth_user || !cookieData.expiresAt) {
      console.log('⚠️ SSO cookie missing required fields');
      return null;
    }
    
    // Check if cookie is expired
    const now = Date.now();
    if (now > cookieData.expiresAt) {
      console.log('⚠️ SSO cookie has expired');
      return null;
    }
    
    return cookieData;
  } catch (error) {
    console.error('Failed to parse SSO cookie:', error);
    return null;
  }
}

// Save user data to local storage
export function saveUserToStorage(user: SelectUser): void {
  try {
    // Remove sensitive information before storing
    const { password, ...safeUser } = user as any;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(safeUser));
    
    // Generate and store a simple token with expiry
    const token = {
      value: crypto.randomUUID(), // Modern browsers have this
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
    };
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(token));
    
    console.log('User data saved to local storage for persistence');
  } catch (error) {
    console.error('Failed to save user to local storage:', error);
  }
}

// Load user data from local storage
export function loadUserFromStorage(): SelectUser | null {
  try {
    // First check for SSO authentication data
    const ssoAuth = checkSSOAuth();
    if (ssoAuth) {
      console.log('✅ Found valid SSO authentication data');
      return ssoAuth;
    }
    
    // Check if regular token exists and is valid
    const tokenJson = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!tokenJson) return null;
    
    const token = JSON.parse(tokenJson);
    if (Date.now() > token.expires) {
      // Token expired, clear storage
      clearAuthStorage();
      return null;
    }
    
    // Token valid, get user data
    const userJson = localStorage.getItem(AUTH_USER_KEY);
    if (!userJson) return null;
    
    return JSON.parse(userJson);
  } catch (error) {
    console.error('Failed to load user from local storage:', error);
    return null;
  }
}

// Check for SSO authentication data (cookies first, then localStorage fallback)
export function checkSSOAuth(): SelectUser | null {
  try {
    // First, try cookie-based SSO
    const cookieAuth = checkCookieSSO();
    if (cookieAuth) {
      console.log('✅ Found valid cookie-based SSO authentication');
      return cookieAuth;
    }
    
    // Fallback to localStorage-based SSO
    const localStorageAuth = checkLocalStorageSSO();
    if (localStorageAuth) {
      console.log('✅ Found valid localStorage-based SSO authentication');
      return localStorageAuth;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to check SSO authentication:', error);
    return null;
  }
}

// Check cookie-based SSO authentication
function checkCookieSSO(): SelectUser | null {
  try {
    const cookieData = parseSSOCookie();
    if (!cookieData) return null;
    
    console.log('🔍 Checking cookie-based SSO authentication data');
    
    // Parse the user data from the auth_user field (it's a JSON string)
    const userData = JSON.parse(cookieData.auth_user);
    
    // Create a user object compatible with SelectUser type
    const ssoUser: SelectUser = {
      id: userData.id || 'sso-user',
      username: userData.username || 'sso-user',
      email: userData.email || null,
      password: '', // Don't store password
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
    
    return ssoUser;
  } catch (error) {
    console.error('Failed to check cookie-based SSO:', error);
    return null;
  }
}

// Check localStorage-based SSO authentication (existing logic)
function checkLocalStorageSSO(): SelectUser | null {
  try {
    const authToken = localStorage.getItem('auth_token');
    const authUser = localStorage.getItem('auth_user');
    const ssoTimestamp = localStorage.getItem(SSO_TIMESTAMP_KEY);
    
    if (authToken && authUser && ssoTimestamp) {
      console.log('🔍 Checking localStorage-based SSO authentication data');
      
      // Check if SSO data is recent (within last 5 minutes)
      const now = Date.now();
      const timestamp = parseInt(ssoTimestamp);
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      if (timestamp > fiveMinutesAgo) {
        console.log('✅ localStorage SSO authentication is recent and valid');
        
        // Parse the user data from SSO
        const userData = JSON.parse(authUser);
        
        // Create a user object compatible with SelectUser type
        const ssoUser: SelectUser = {
          id: userData.id || 'sso-user',
          username: userData.username || authUser,
          email: userData.email || null,
          password: '', // Don't store password
          otp: userData.otp || null,
          otpExpiry: userData.otpExpiry ? new Date(userData.otpExpiry) : null,
          emailVerificationToken: userData.emailVerificationToken || null,
          emailVerificationExpiry: userData.emailVerificationExpiry ? new Date(userData.emailVerificationExpiry) : null,
          isEmailVerified: userData.isEmailVerified || false,
          isAdmin: userData.isAdmin || false,
          createdAt: userData.createdAt || new Date(),
          updatedAt: userData.updatedAt || new Date(),
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
        
        return ssoUser;
      } else {
        console.log('⚠️ localStorage SSO authentication data is too old, clearing');
        clearSSOAuth();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to check localStorage-based SSO:', error);
    return null;
  }
}

// Clear all authentication data from storage
export function clearAuthStorage(): void {
  try {
    // Clear localStorage
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(SSO_TIMESTAMP_KEY);
    
    // Clear SSO cookie
    if (typeof document !== 'undefined') {
      document.cookie = 'localtunes_cross_domain_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'cosmic.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'connect.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    
    console.log('Auth storage and cookies cleared');
  } catch (error) {
    console.error('Failed to clear auth storage:', error);
  }
}

// Clear only SSO authentication data
export function clearSSOAuth(): void {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem(SSO_TIMESTAMP_KEY);
    
    // Clear SSO cookie
    if (typeof document !== 'undefined') {
      document.cookie = 'localtunes_cross_domain_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    
    console.log('SSO auth storage and cookies cleared');
  } catch (error) {
    console.error('Failed to clear SSO auth storage:', error);
  }
}

// Check if user has valid SSO authentication (for redirecting from login page)
export function hasValidSSOAuth(): boolean {
  try {
    // First check cookie-based SSO (without creating user object)
    const cookieData = parseSSOCookie();
    if (cookieData) {
      console.log('✅ Valid cookie-based SSO found');
      return true;
    }
    
    // Then check localStorage-based SSO (without creating user object)
    const authToken = localStorage.getItem('auth_token');
    const authUser = localStorage.getItem('auth_user');
    const ssoTimestamp = localStorage.getItem(SSO_TIMESTAMP_KEY);
    
    if (authToken && authUser && ssoTimestamp) {
      // Check if SSO data is recent (within last 5 minutes)
      const now = Date.now();
      const timestamp = parseInt(ssoTimestamp);
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      if (timestamp > fiveMinutesAgo) {
        console.log('✅ Valid localStorage-based SSO found');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Failed to check SSO authentication:', error);
    return false;
  }
}

// Check if we have valid auth data in storage
export function hasValidAuthData(): boolean {
  return loadUserFromStorage() !== null;
}
