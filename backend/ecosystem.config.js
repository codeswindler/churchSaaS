module.exports = {
  apps: [
    {
      name: 'churchsaas-api',
      script: 'dist/main.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3200,
      },
    },
  ],
};
