module.exports = {
    apps: [
      {
        name: "ebay-lister-server",
        script: "./server.js",
        cwd: "./",
        env_staging: {
          NODE_ENV: "staging",
          PORT: 3000
        },
        env_production: {
          NODE_ENV: "production",
          PORT: 80
        },
        watch: false,
        max_memory_restart: "500M",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        error_file: "./logs/pm2-server-error.log",
        out_file: "./logs/pm2-server-output.log"
      },
      {
        name: "ebay-lister-client",
        script: "serve",
        cwd: "./client",
        env_staging: {
          PM2_SERVE_PATH: "./build",
          PM2_SERVE_PORT: 3001,
          NODE_ENV: "staging"
        },
        env_production: {
          PM2_SERVE_PATH: "./build",
          PM2_SERVE_PORT: 80,
          NODE_ENV: "production"
        },
        env: {
          PM2_SERVE_SPA: "true"
        }
      }
    ]
  };