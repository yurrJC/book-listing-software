// config/config.staging.js
require('dotenv').config({ path: '.env.staging' });

module.exports = {
  environment: 'staging',
  server: {
    port: process.env.PORT || 3000
  },
  ebay: {
    apiKey: process.env.EBAY_STAGING_API_KEY,
    apiSecret: process.env.EBAY_STAGING_API_SECRET,
    appId: process.env.EBAY_STAGING_APP_ID,
    certId: process.env.EBAY_STAGING_CERT_ID,
    devId: process.env.EBAY_STAGING_DEV_ID,
    ruName: process.env.EBAY_STAGING_RUNAME
  },
  logging: {
    level: process.env.LOGGING_LEVEL || 'debug',
    file: './logs/staging.log'
  },
  client: {
    baseUrl: process.env.CLIENT_BASE_URL || 'http://localhost:3000'
  },
  features: {
    enableDetailedLogging: true,
    enablePerformanceMonitoring: true
  }
};