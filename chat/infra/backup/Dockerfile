FROM alpine:3.20
RUN apk add --no-cache postgresql16-client rclone tzdata bash
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
 && echo "0 3 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
# Busybox crond in the foreground; logs go to `docker compose logs backup`.
CMD ["crond", "-f", "-l", "8"]
