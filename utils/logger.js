const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create a custom logger
const logger = winston.createLogger({
  level: process.env.LOGGING_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ebay-listing-service' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log')
    }),
    // If we're not in production, log to the console as well
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Logging utility methods
module.exports = {
  info: (message, meta) => {
    logger.info(message, meta);
  },
  error: (message, error) => {
    logger.error(message, error);
  },
  warn: (message, meta) => {
    logger.warn(message, meta);
  },
  debug: (message, meta) => {
    logger.debug(message, meta);
  },
  logEbayTransaction: (transactionDetails) => {
    logger.info('eBay Transaction', {
      transactionId: transactionDetails.id,
      type: transactionDetails.type,
      status: transactionDetails.status
    });
  }
};