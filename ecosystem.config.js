{
  "apps": [
    {
      "name": "culbridge-api",
      "script": "shipment-results-api.js",
      "instances": "max",
      "exec_mode": "cluster",
      "watch": false,
      "env": {
        "NODE_ENV": "production",
        "PORT": 8009
      },
      "env_development": {
        "NODE_ENV": "development",
        "PORT": 8009
      },
      "error_file": "./logs/culbridge-error.log",
      "out_file": "./logs/culbridge-out.log",
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "merge_logs": true,
      "max_memory_restart": "1G",
      "restart_delay": 4000,
      "max_restarts": 10,
      "min_uptime": "10s",
      "kill_timeout": 5000,
      "listen_timeout": 3000,
      "shutdown_with_message": true
    },
    {
      "name": "culbridge-worker",
      "script": "queue/async-queue.js",
      "instances": 5,
      "exec_mode": "fork",
      "watch": false,
      "env": {
        "NODE_ENV": "production",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": 6379
      },
      "error_file": "./logs/worker-error.log",
      "out_file": "./logs/worker-out.log",
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "max_memory_restart": "512M",
      "restart_delay": 4000,
      "max_restarts": 10,
      "min_uptime": "10s"
    }
  ]
}