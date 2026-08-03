const port = process.env.PORT || "3000";

module.exports = {
  apps: [
    {
      name: "baahi-sync",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: `start -H 0.0.0.0 -p ${port}`,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        PORT: port,
      },
    },
  ],
};
