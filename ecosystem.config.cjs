module.exports = {
  apps: [
    {
      name: "boatrace",
      cwd: __dirname,
      script: "node_modules/.bin/tsx",
      args: "server/src/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: 8090,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      watch: false,
    },
  ],
};
