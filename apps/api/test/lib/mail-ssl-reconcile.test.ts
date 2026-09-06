import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRYPOINT = readFileSync(
  join(import.meta.dirname, "../../../../apps/email/docker/entrypoint.sh"),
  "utf8",
);

describe("openship-mail SSL certificate reconciliation", () => {
  it("runs SSL certificate reconciliation before supervisord starts", () => {
    const sslReconcile = ENTRYPOINT.indexOf("reconcile SSL certificates from /etc/letsencrypt");
    const supervisor = ENTRYPOINT.indexOf('exec "$@"');

    expect(sslReconcile).toBeGreaterThan(-1);
    expect(supervisor).toBeGreaterThan(sslReconcile);
  });

  it("checks for both mail.$FIRST_DOMAIN and fallback $FIRST_DOMAIN certificate paths", () => {
    expect(ENTRYPOINT).toContain('"/etc/letsencrypt/live/mail.${FIRST_DOMAIN}/fullchain.pem"');
    expect(ENTRYPOINT).toContain('"/etc/letsencrypt/live/mail.${FIRST_DOMAIN}/privkey.pem"');
    expect(ENTRYPOINT).toContain('"/etc/letsencrypt/live/${FIRST_DOMAIN}/fullchain.pem"');
    expect(ENTRYPOINT).toContain('"/etc/letsencrypt/live/${FIRST_DOMAIN}/privkey.pem"');
  });

  it("links mounted certificates to Postfix and Dovecot daemon default paths", () => {
    expect(ENTRYPOINT).toContain(
      'ln -sf "$MAIL_CERT_DIR/fullchain.pem" /etc/ssl/certs/iRedMail.crt',
    );
    expect(ENTRYPOINT).toContain(
      'ln -sf "$MAIL_CERT_DIR/privkey.pem" /etc/ssl/private/iRedMail.key',
    );
  });
});
