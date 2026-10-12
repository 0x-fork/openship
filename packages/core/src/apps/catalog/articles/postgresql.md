## PostgreSQL with pgAdmin

This stack includes PostgreSQL and the pgAdmin project's own container. PostgreSQL stays on the private project network; pgAdmin has a separate generated login and can use an Openship domain.

## Connect

The Connection card contains the private `DATABASE_URL`, database password, and pgAdmin credentials. pgAdmin is preloaded with the database server; enter the separate database password when connecting. Its login password does not grant database access by itself. Use **Use in a project** for application connections or **Open in localhost** for a local client.

The `openship` database role is the instance administrator. Create a restricted role in pgAdmin for applications that need fewer permissions. The stack does not expose PostgreSQL publicly or configure public PostgreSQL TLS.

## Persistence and backups

The database and pgAdmin configuration have separate persistent volumes. Take a database backup before upgrades. Changing PostgreSQL major versions requires migration or dump/restore; changing the image tag alone is insufficient.

[PostgreSQL image](https://hub.docker.com/_/postgres) · [pgAdmin container deployment](https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment.html)
