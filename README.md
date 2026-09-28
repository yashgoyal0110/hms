# Klinvo

**Klinvo** is a hospital operations platform (HMS/HIS). The name comes from *klinik* (clinic): hospital operations in one flow. It covers registration and EMR, OPD, IPD, OT, diagnostics, pharmacy, billing, insurance, accounts and analytics.

It is built with a React front end, an Express API and MongoDB, and the whole stack runs from one `docker compose` file. The demo tenant is *City Care Multispeciality Hospital*.

Live demo: **https://hms.yashgoyal.sbs**

Container, volume and network names keep the `hms-` prefix. It's infrastructure only, and renaming it would detach the existing database volume.

## Modules

| Area | What it covers |
|---|---|
| Patient registration & EMR | UHID generation, demographics, allergies, chronic conditions, insurance, duplicate detection, full clinical timeline |
| OPD | Doctor queue, vitals, clinical notes, diagnoses (ICD-10), e-prescription, investigations, follow-up, printable prescription |
| Appointments & queue | Doctor availability and slot booking, check-in with token numbers, doctor-wise queue, public token display (`/display/queue`) |
| IPD | Admission with bed allocation and deposit, nursing and doctor notes, vitals chart, bed transfer, discharge summary |
| Wards & beds | Live bed board, bed status (cleaning, maintenance, reserved), ward and tariff management |
| Operation theatre | Theatre scheduling with clash detection, WHO safety checklist, operative notes, automatic OT billing |
| Laboratory & radiology | Order worklists, sample collection, result entry with automatic H/L/critical flags, reports, test catalogue |
| Pharmacy | Prescription-driven dispensing, FEFO batch deduction, batch/expiry tracking, low-stock and expiry alerts, sales register |
| Inventory & purchase | Store items, departmental issues, suppliers, purchase orders, goods receipt with batch capture |
| Billing | Automatic charge capture from every department, running IPD bills, payments, receipts, discounts, refunds, GST-ready invoices |
| Insurance | Claim filing from invoices, TPA workflow (review, query, approval, settlement), settlement posted to the bill |
| Accounting | Automatic ledger from receipts, expense recording, profit & loss, payment-mode analysis |
| Staff management | Staff directory, roles, departments, doctor OPD availability and fees, weekly duty roster |
| Reports & analytics | Revenue, OPD/IPD statistics, doctor performance, top diagnoses, tests and medicines, demographics, CSV export |
| Patient communication | SMS/WhatsApp/email templates, automatic event notifications, bulk messaging, delivery log; in-app staff notifications |
| Security & data | Role-based access for 8 roles, audit trail, account lockout, rate limiting, daily automated backups with download |

## Architecture

```
Internet ──HTTPS──> host nginx (TLS via Let's Encrypt) ──> 127.0.0.1:8095
                                                              │
                     docker compose project "hms-yashgoyal"   ▼
                  ┌────────────────────────────────────────────────────┐
                  │ hms-web    nginx: React build + /api reverse proxy │
                  │ hms-api    Node 22 / Express REST API              │
                  │ hms-mongo  MongoDB 7 (not exposed to the host)     │
                  │ hms-backup scheduled + on-demand mongodump          │
                  └────────────────────────────────────────────────────┘
```

* Every container, volume and network is namespaced `hms-*` / `hms-yashgoyal*`, so the stack runs alongside other apps on the same VM without clashes.
* Only `hms-web` publishes a port, and it binds to `127.0.0.1:8095`. MongoDB is reachable only on the internal Docker network.

## DNS

At your domain provider for `yashgoyal.sbs`:

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| A | `hms` | `34.47.247.40` | 300 |

(If you use Cloudflare, set the record to *DNS only* (grey cloud) so the Let's Encrypt HTTP challenge and renewals work.)

## Deployment

### First-time server setup (already done on `gcp-vm`)

```bash
# 1. Code lives in ~/hms-yashgoyal ; create the environment file
cp .env.example .env         # then set strong values:
openssl rand -hex 24         # -> MONGO_PASSWORD
openssl rand -hex 48         # -> JWT_SECRET
# 2. Start the stack
sudo docker compose up -d --build
# 3. Reverse proxy + TLS (host nginx)
sudo cp deploy/nginx-hms.conf /etc/nginx/sites-available/hms.yashgoyal.sbs
sudo ln -s /etc/nginx/sites-available/hms.yashgoyal.sbs /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hms.yashgoyal.sbs --redirect
```

The certificate renews automatically through the `certbot.timer` systemd timer.

### Redeploying from a workstation

```bash
./deploy.sh      # packs the source (no secrets, no node_modules), ships it over gcloud SSH, rebuilds on the VM
```

The script never uploads `.env` or the GCP credential file. The server keeps its own `.env`.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB` | Database credentials (internal network only) |
| `JWT_SECRET` | Session signing key, 32 characters minimum |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | The first administrator account, created only when no administrator exists |
| `WEB_PORT` | Localhost port that host nginx proxies to (default 8095) |
| `SEED_DEMO` | `true` loads the demo hospital data once, into an empty database |
| `DEMO_MODE` | `true` shows the demo-account shortcuts on the sign-in page |
| `BACKUP_INTERVAL_HOURS`, `BACKUP_RETENTION_DAYS` | Backup schedule and retention |
| `SMTP_*` | Email delivery. Without it, email messages are logged but not sent |
| `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN`, `SMS_SENDER_ID` | SMS/WhatsApp gateway. The API POSTs `{to, message, channel, sender}` with a Bearer token; point it at your provider or a small adapter |
| `TZ` | Time zone for reports and day boundaries (default `Asia/Kolkata`) |

## Demo accounts

When `DEMO_MODE=true`, the sign-in page lists these accounts. Click one to fill in its credentials, or double-click to sign in. All of them use the password `Demo@1234`.

| Role | Email |
|---|---|
| Administrator | admin@demo.hms |
| Doctor | dr.mehta@demo.hms (9 more doctors: dr.rao, dr.kulkarni, dr.kapoor, dr.singh, dr.khan, dr.nair, dr.malhotra, dr.iyer, dr.joshi) |
| Nurse | nurse.priya@demo.hms |
| Front office | reception@demo.hms |
| Pharmacist | pharmacy@demo.hms |
| Lab technician | lab@demo.hms |
| Radiologist | radiology@demo.hms |
| Accountant | accounts@demo.hms |

The system administrator account from `.env` (`ADMIN_EMAIL`) is separate from the demo accounts.

### Live demo data

With `SEED_DEMO=true`, a demo activity simulator (`backend/src/seed/simulator.js`) keeps the demo current as days pass:

* **Daily rollover:** closes out the previous day's visits, finalises pending reports, discharges and admits patients (occupancy stays at about 30%), and writes nursing rounds. It also registers new patients, books day-care surgeries, posts monthly expenses, restocks pharmacy, and keeps a rolling 7-day appointment book (Sundays off). If the server was down, it catches up on missed days, up to 14.
* **Every 10 minutes:** today's clinic follows the clock. Patients check in and get tokens, go into consultation, and are completed with prescriptions, bills, pharmacy sales and some lab orders. Today's surgeries start and finish on schedule.

Only appointments the simulator created are advanced automatically. A consultation someone has edited is never completed behind their back. The simulator is off when `SEED_DEMO=false`.

The registration form has a **Fill demo patient** button (demo mode only). It fills in a new, unique patient each time.

### Going live with real data

1. Set `SEED_DEMO=false` and `DEMO_MODE=false` in `.env`.
2. Start from an empty database: `sudo docker compose down -v`, which **deletes all data**, then `sudo docker compose up -d`.
3. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, change the password, then set up the hospital profile, departments, staff, wards, tariffs, test catalogue and medicines.

## Operations

```bash
cd ~/hms-yashgoyal
sudo docker compose ps                       # status
sudo docker compose logs -f hms-api          # API logs
sudo docker compose restart hms-api          # restart a service
```

### Backups

* Automatic: a gzip-compressed `mongodump` archive every `BACKUP_INTERVAL_HOURS`, kept for `BACKUP_RETENTION_DAYS` days, in the `hms_backups` volume.
* On demand: **Settings & Security → Backups → Back up now**, which also lists the archives for download.
* Restore:

```bash
set -a; . ./.env; set +a
sudo docker exec -i hms-mongo mongorestore --archive --gzip --drop \
  -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin < hms-YYYYMMDD-HHMMSS.archive.gz
```

### Health and verification

* `GET /api/public/health` reports API and database status. The container healthcheck uses it.
* `backend/scripts/smoke-test.mjs` is an end-to-end workflow test covering 69 checks: every role, RBAC denials, OPD→lab→pharmacy→billing, IPD→OT→discharge→insurance, purchasing and reports. Run it against demo data:

```bash
sudo docker exec -i hms-api node --input-type=module - < backend/scripts/smoke-test.mjs
```

It creates a test patient and related records, so don't run it against a live hospital database.

## Security

* Passwords are hashed with bcrypt (cost 12). New passwords must meet a complexity policy.
* An account locks for 15 minutes after 5 failed sign-ins. The sign-in and API endpoints are rate-limited.
* Sessions use HttpOnly, Secure, SameSite=Strict cookies. They expire after 12 hours and are revoked when the password changes.
* The server checks role-based permissions on every endpoint. The UI hides actions the role can't perform.
* Every sign-in, failed sign-in and data change is written to an audit trail, kept for 2 years.
* Input is sanitised against NoSQL injection. Helmet sets the security headers. The database is never exposed publicly.

## Local development

```bash
docker run -d -p 127.0.0.1:27017:27017 --name hms-dev-mongo mongo:7
cd backend && npm install && SEED_DEMO=true DEMO_MODE=true npm run dev     # API on :4000
cd frontend && npm install && npm run dev                                  # UI on :5173 (proxies /api)
```

## Project layout

```
backend/   Express API (src/routes, src/models, src/services, src/seed) + Dockerfile
frontend/  React (Vite) app, nginx config + Dockerfile
backup/    backup.sh used by the hms-backup container
deploy/    host nginx vhost
docker-compose.yml, .env.example, deploy.sh
```
