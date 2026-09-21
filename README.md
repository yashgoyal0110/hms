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
