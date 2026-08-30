FROM alpine:3.22

ARG NAS_UID=1026
ARG NAS_GID=100

RUN apk add --no-cache openssh-server \
    && group_name="$(awk -F: -v gid="$NAS_GID" '$3 == gid { print $1; exit }' /etc/group)" \
    && if [ -z "$group_name" ]; then group_name=nasreaders; addgroup -g "$NAS_GID" "$group_name"; fi \
    && adduser -D -H -u "$NAS_UID" -G "$group_name" -s /sbin/nologin nasreader \
    && passwd -d nasreader \
    && mkdir -p /srv/sftp/nas /bootstrap /state /run/sshd \
    && chown root:root /srv/sftp /srv/sftp/nas /bootstrap /state \
    && chmod 0755 /srv/sftp /srv/sftp/nas /bootstrap \
    && chmod 0700 /state

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod 0755 /usr/local/bin/entrypoint.sh \
    && chmod 0600 /etc/ssh/sshd_config

EXPOSE 2222

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
