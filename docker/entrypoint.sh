#!/bin/sh
# Recreate nginx temp dirs after a read-only root and tmpfs hide the image copies.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p \
    /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /var/run \
    /tmp
  chown -R nginx:nginx /var/cache/nginx
  chmod 1777 /tmp
fi
exec "$@"
