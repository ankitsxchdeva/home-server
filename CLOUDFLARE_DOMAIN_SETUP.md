# Cloudflare Domain Setup Guide

This guide will walk you through setting up Cloudflare for your domain `ankit.casa` to work with your home server's Traefik and WireGuard VPN setup.

## Prerequisites

- ✅ Domain name purchased (ankit.casa)
- ✅ Access to your domain registrar's control panel
- ✅ Google Fiber internet connection (dynamic IP)
- ✅ Home server running on Raspberry Pi

## Step 1: Add Domain to Cloudflare

### 1.1 Create Cloudflare Account
1. Go to [cloudflare.com](https://cloudflare.com)
2. Click "Sign Up" and create a free account
3. Verify your email address

### 1.2 Add Your Domain
1. In Cloudflare dashboard, click "Add a Site"
2. Enter your domain: `ankit.casa`
3. Click "Add Site"
4. Select the **Free plan** (sufficient for home server)

### 1.3 Cloudflare Will Scan Your Domain
- Cloudflare will automatically detect existing DNS records
- This may take a few minutes
- You'll see a list of current DNS records

## Step 2: Update Nameservers at Domain Registrar

### 2.1 Get Cloudflare Nameservers
After adding your domain, Cloudflare will show you **2 nameservers** to use:
```
Nameserver 1: ns1.cloudflare.com
Nameserver 2: ns2.cloudflare.com
```

### 2.2 Update at Your Domain Provider
1. **Go to your domain registrar** (where you bought ankit.casa)
2. **Find DNS/Nameserver settings**
3. **Replace existing nameservers** with Cloudflare's:
   ```
   OLD nameservers (replace these):
   - ns1.yourregistrar.com
   - ns2.yourregistrar.com
   
   NEW nameservers (use these):
   - ns1.cloudflare.com
   - ns2.cloudflare.com
   ```

### 2.3 Common Domain Providers
- **Namecheap**: Domain List → Manage → Domain → Nameservers
- **GoDaddy**: My Domains → DNS → Nameservers
- **Google Domains**: Select domain → DNS → Nameservers
- **Porkbun**: Domains → Manage → Nameservers

### 2.4 Wait for Propagation
- **DNS changes can take 24-48 hours** to fully propagate
- **You can check progress** using [whatsmydns.net](https://whatsmydns.net)
- **Enter your domain** and check nameserver propagation

## Step 3: Configure DNS Records in Cloudflare

### 3.1 Access DNS Settings
1. In Cloudflare dashboard, click on your domain `ankit.casa`
2. Go to **DNS** tab in the left sidebar
3. Click **"Add record"**

### 3.2 Create A Records
Create these A records for your home server:

#### **Root Domain Record:**
```
Type: A
Name: @ (or leave blank for root domain)
IPv4 address: 1.1.1.1 (placeholder - doesn't matter with proxy)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Traefik Dashboard:**
```
Type: A
Name: traefik
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **VPN Management:**
```
Type: A
Name: vpn
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Homepage Dashboard:**
```
Type: A
Name: home
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Home Assistant:**
```
Type: A
Name: ha
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Pi-hole:**
```
Type: A
Name: pihole
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Uptime Kuma:**
```
Type: A
Name: uptime
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **Glances:**
```
Type: A
Name: glances
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **NetAlertX:**
```
Type: A
Name: netalert
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

#### **CUPS Print Server:**
```
Type: A
Name: print
IPv4 address: 1.1.1.1 (placeholder)
Proxy status: Proxied (orange cloud)
TTL: Auto
```

### 3.3 Why Use Placeholder IPs?
- **With Cloudflare proxy enabled** (orange cloud), the IP doesn't matter
- **Cloudflare routes traffic** to your actual server automatically
- **Dynamic IP changes** won't break your setup
- **Traffic goes through Cloudflare** first, then to your server

## Step 4: Enable Cloudflare Proxy

### 4.1 Verify Proxy Status
- **Orange cloud icon** = Proxied (traffic goes through Cloudflare)
- **Gray cloud icon** = DNS only (traffic goes directly to your server)

### 4.2 Benefits of Proxied Mode
- ✅ **Automatic SSL certificates** (HTTPS)
- ✅ **DDoS protection**
- ✅ **IP changes don't matter**
- ✅ **Better security**
- ✅ **No dynamic DNS needed**

### 4.3 When to Use DNS Only
- **Local network access** (point to your Pi's local IP)
- **Direct server access** (bypass Cloudflare)
- **Custom SSL certificates**

## Step 5: Get Cloudflare API Credentials

### 5.1 Create API Token
1. In Cloudflare dashboard, click your profile icon → **"My Profile"**
2. Go to **"API Tokens"** tab
3. Click **"Create Token"**

### 5.2 Token Permissions
Use **"Custom token"** with these permissions:
```
Zone:Zone:Read
Zone:DNS:Edit
```

### 5.3 Zone Resources
- **Include**: Specific zone
- **Zone**: ankit.casa

### 5.4 Copy Token
- **Save the token** - you won't see it again
- **Copy your email** address
- **Use these in your Traefik .env file**

## Step 6: Test Your Setup

### 6.1 Check DNS Propagation
1. Go to [whatsmydns.net](https://whatsmydns.net)
2. Enter `ankit.casa`
3. Check that nameservers show Cloudflare
4. Wait for all locations to show Cloudflare

### 6.2 Test Domain Resolution
```bash
# From any computer
nslookup ankit.casa
nslookup traefik.ankit.casa
nslookup vpn.ankit.casa
```

### 6.3 Expected Results
- **Nameservers**: Should show Cloudflare nameservers
- **IP addresses**: May show Cloudflare IPs (this is normal with proxy)

## Step 7: Configure Your Home Server

### 7.1 Update Traefik Environment
```bash
cd traefik
cp env.example .env
```

Edit `.env`:
```bash
DOMAIN=ankit.casa
CF_API_EMAIL=your-email@example.com
CF_API_KEY=your-cloudflare-api-token
TRAEFIK_AUTH=admin:$2y$10$your-hash-here
```

### 7.2 Update WireGuard Environment
```bash
cd ../wg-easy
cp env.example .env
```

Edit `.env`:
```bash
DOMAIN=ankit.casa
WG_HOST=vpn.ankit.casa
WG_PASSWORD=your-secure-vpn-password
WG_AUTH=admin:$2y$10$your-hash-here
```

## Step 8: Start Your Services

### 8.1 Create Traefik Network
```bash
docker network create traefik
```

### 8.2 Start Services
```bash
# Start Traefik first
cd traefik && docker compose up -d

# Start VPN
cd ../wg-easy && docker compose up -d

# Start everything else
cd .. && docker compose up -d
```

## Step 9: Access Your Services

### 9.1 Public URLs (HTTPS via Cloudflare)
- **VPN Management**: https://vpn.ankit.casa (public access)

### 9.2 VPN-Only URLs (HTTPS via Cloudflare)
- **Traefik Dashboard**: https://traefik.ankit.casa
- **Homepage**: https://home.ankit.casa
- **Home Assistant**: https://ha.ankit.casa
- **Pi-hole**: https://pihole.ankit.casa
- **Uptime Kuma**: https://uptime.ankit.casa
- **Glances**: https://glances.ankit.casa
- **NetAlertX**: https://netalert.ankit.casa
- **CUPS Print Server**: https://print.ankit.casa

### 9.3 Local URLs (HTTP, direct access)
- **Homepage**: http://192.168.1.100:3000
- **Home Assistant**: http://192.168.1.100:8123
- **Traefik Dashboard**: http://192.168.1.100:8080
- **Pi-hole**: http://192.168.1.100:8053
- **Uptime Kuma**: http://192.168.1.100:3001
- **Glances**: http://192.168.1.100:61208
- **NetAlertX**: http://192.168.1.100:20211
- **CUPS Print Server**: http://192.168.1.100:631

## Troubleshooting

### DNS Not Working
- **Wait longer** for propagation (can take 24-48 hours)
- **Check nameservers** are correctly set at registrar
- **Verify Cloudflare** shows domain as active

### SSL Certificate Issues
- **Check API credentials** in Traefik .env file
- **Verify DNS records** are proxied (orange cloud)
- **Check Traefik logs**: `docker logs traefik`

### Services Not Accessible
- **Ensure Traefik is running**: `docker ps`
- **Check network**: `docker network ls`
- **Verify labels** are correctly set in docker-compose files

## Security Considerations

### What Cloudflare Provides
- ✅ **DDoS protection**
- ✅ **SSL certificates**
- ✅ **Basic security filtering**
- ✅ **Traffic routing**

### What You Still Need
- 🔒 **Strong passwords** for all services
- 🔒 **Firewall rules** on your router
- 🔒 **Regular updates** of Docker images
- 🔒 **Backup** of configuration files

## Next Steps

1. **Add Traefik labels** to make services public
2. **Configure local DNS** for faster LAN access
3. **Set up monitoring** for certificate expiration
4. **Implement backup** strategy for configurations

## Support Resources

- [Cloudflare Help Center](https://support.cloudflare.com/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [DNS Propagation Checker](https://whatsmydns.net/)
- [Cloudflare Status Page](https://www.cloudflarestatus.com/)

## Quick Reference

### Important URLs
- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Domain Registrar**: Your domain provider's control panel
- **DNS Check**: https://whatsmydns.net

### Key Commands
```bash
# Check DNS resolution
nslookup ankit.casa

# Check Traefik status
docker ps | grep traefik

# View Traefik logs
docker logs traefik

# Restart services
docker compose restart
```

### File Locations
- **Traefik config**: `traefik/.env`
- **VPN config**: `wg-easy/.env`
- **Docker compose**: `docker-compose.yml`

---

**Note**: This setup uses Cloudflare's proxy mode, which means traffic goes through Cloudflare before reaching your server. This provides automatic SSL, DDoS protection, and handles dynamic IP changes automatically.
