#!/usr/bin/env bash
set -e
cd /opt/openhands
case "${1:-status}" in
  start)   docker compose up -d ;;
  stop)    docker compose stop ;;
  restart) docker compose restart ;;
  status)  docker compose ps ;;
  logs)    docker compose logs -f --tail=150 ;;
  update)
    docker compose pull
    docker compose up -d
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|update}"
    exit 1
    ;;
esac
