import { google } from 'googleapis';

// OAuth Provider Configuration
export const oauthProviderClient = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
);

// SEO Tool Configuration
export const seoToolClient = new google.auth.OAuth2(
  process.env.GOOGLE_SEO_CLIENT_ID,
  process.env.GOOGLE_SEO_CLIENT_SECRET,
  process.env.GOOGLE_SEO_REDIRECT_URI
);

// Initialize Google APIs with SEO Tool Client
export const searchConsole = google.searchconsole('v1');
export const pagespeedInsights = google.pagespeedonline('v5');

// Scopes for different services
export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

export const SEO_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly'
];

// Helper function to get configured client based on service
export const getGoogleClient = (service: 'oauth' | 'seo') => {
  return service === 'oauth' ? oauthProviderClient : seoToolClient;
};