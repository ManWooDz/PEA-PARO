# Deploying PEA-PARO to AWS (EC2 + Docker Compose)

A single EC2 box runs three containers — **Caddy** (HTTPS reverse proxy),
**frontend** (Next.js), **backend** (FastAPI + CBC solver). Caddy serves both on
one origin, so there is no CORS to configure and the browser talks only HTTPS.

```
                    ┌──────────────── EC2 instance ────────────────┐
  Browser ──HTTPS──▶│ Caddy :443  ──/api/*──▶ backend  :8000        │
                    │             ──/*──────▶ frontend :3000        │
                    └───────────────────────────────────────────────┘
```

**Cost:** a `t3.medium` is ~$0.046/hr (~$34/mo if left on). Your $2000 credit
lasts the whole hackathon and then some. **Stop the instance when not demoing**
to save credit (you keep the disk; you only pay for storage while stopped).

---

## Phase 1 — Launch the EC2 instance (AWS Console)

1. Console → **EC2** → **Launch instance**.
2. **Name:** `pea-paro`.
3. **AMI:** Ubuntu Server 24.04 LTS (x86_64).
4. **Instance type:** `t3.medium` (4 GB RAM — `next build` needs the headroom;
   `t3.small` can OOM during the build).
5. **Key pair:** Create one (e.g. `pea-key`), download the `.pem`. Keep it safe —
   it is your SSH login.
6. **Network settings → Edit → Security group** — add three inbound rules:
   | Type | Port | Source |
   |------|------|--------|
   | SSH | 22 | My IP |
   | HTTP | 80 | Anywhere (0.0.0.0/0) |
   | HTTPS | 443 | Anywhere (0.0.0.0/0) |
   (80 is required so Caddy can complete the Let's Encrypt HTTP challenge.)
7. **Storage:** 20 GB gp3 is plenty.
8. **Launch instance**, then open it and copy the **Public IPv4 address**
   (e.g. `13.250.1.2`).

---

## Phase 2 — Connect and install Docker

From your machine (PowerShell). First lock down the key file once:

```powershell
icacls "C:\path\to\pea-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i "C:\path\to\pea-key.pem" ubuntu@<PUBLIC_IP>
```

On the server, install Docker + the compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu        # run docker without sudo
exit                                  # log out so the group takes effect
```

SSH back in, then verify:

```bash
ssh -i "C:\path\to\pea-key.pem" ubuntu@<PUBLIC_IP>
docker run --rm hello-world           # should print "Hello from Docker!"
```

---

## Phase 3 — Get the code and the data onto the box

The forecast CSVs are in git, but **`Historical_Load_All.csv` is gitignored** —
you must copy it up separately, or the backend falls back to synthetic data
(home-page KPIs and the MILP grid cap would be wrong).

On the server — clone and make the data folder:

```bash
git clone https://github.com/ManWooDz/PEA-PARO.git
mkdir -p ~/PEA-PARO/docs/data
```

From your machine (new PowerShell window) — copy the one CSV up:

```powershell
scp -i "C:\path\to\pea-key.pem" `
  "C:\Users\Hp\Desktop\itot\pea hackathon\PEA-PARO\docs\data\Historical_Load_All.csv" `
  ubuntu@<PUBLIC_IP>:~/PEA-PARO/docs/data/
```

---

## Phase 4 — Configure and launch

On the server:

```bash
cd ~/PEA-PARO
cp .env.deploy.example .env
nano .env      # set SITE_ADDRESS=<PUBLIC_IP-with-dashes>.sslip.io  e.g. 13-250-1-2.sslip.io
```

`sslip.io` is a free wildcard-DNS service: `13-250-1-2.sslip.io` resolves to
`13.250.1.2`, which is what lets Caddy get a real HTTPS cert without buying a
domain. Use **dashes**, not dots, in the IP part.

Build and start everything:

```bash
docker compose up -d --build      # first build ~3–5 min (frontend is the slow part)
docker compose logs -f            # watch; Ctrl-C to stop watching (containers keep running)
```

Open **`https://<PUBLIC_IP-with-dashes>.sslip.io`** in a browser. Done. 🎉
(The first request may take a few seconds while Caddy fetches the certificate.)

---

## Operating it

```bash
docker compose ps                 # status
docker compose logs -f backend    # one service's logs
docker compose restart backend    # restart one service
docker compose down               # stop everything (containers removed, data volumes kept)

# Deploy new code after you push to GitHub:
cd ~/PEA-PARO && git pull && docker compose up -d --build
```

**Save credit:** in the EC2 console, **Stop** the instance when you are not
demoing (Instance state → Stop). **Start** it again before the demo — the public
IP changes on stop/start unless you attach an Elastic IP, so update `SITE_ADDRESS`
in `.env` and re-run `docker compose up -d` if it changed. (Allocating an Elastic
IP keeps the address fixed; it is free while attached to a running instance.)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `next build` killed / OOM | Use `t3.medium`, or add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| Browser cert warning / no HTTPS | Ports 80 **and** 443 must be open; `SITE_ADDRESS` must match the real public IP; check `docker compose logs caddy` |
| Home-page KPIs look random | `Historical_Load_All.csv` missing — confirm `ls ~/PEA-PARO/docs/data/` shows it, then `docker compose restart backend` |
| Forecast/dispatch empty | Forecast CSVs missing — they are in git, so ensure the clone succeeded (`ls backend/data/forecasts/C/`) |
| Site unreachable | Security group inbound 80/443 open? Instance running? `docker compose ps` all "Up"? |
