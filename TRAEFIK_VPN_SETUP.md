# Traefik & WireGuard VPN Setup Guide

This guide will walk you through setting up Traefik as a reverse proxy and wg-easy for WireGuard VPN, making your services available publicly with automatic SSL certificates.

## Prerequisites

- ✅ Domain name purchased and configured
- ✅ Cloudflare account (free tier works)
- ✅ Router configured to forward ports 80, 443, and 51820
- ✅ Static IP or dynamic DNS configured

## Step 1: Domain & DNS Setup

### 1.1 Configure Cloudflare
1. Add your domain to Cloudflare
2. Update your domain's nameservers to Cloudflare's
3. Wait for DNS propagation (can take up to 24 hours)

### 1.2 Create DNS Records
Create these A records in Cloudflare:
```
A    @           your-public-ip     Auto
A    traefik     your-public-ip     Auto  
A    vpn         your-public-ip     Auto
A    home        your-public-ip     Auto
A    ha          your-public-ip     Auto
```

### 1.3 Get Cloudflare API Credentials
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create new token with these permissions:
   - Zone:Zone:Read
   - Zone:DNS:Edit
3. Copy the token and your email

## Step 2: Environment Configuration

### 2.1 Traefik Setup
```bash
cd traefik
cp env.example .env
```

Edit `.env` with your values:
```bash
DOMAIN=yourdomain.com
CF_API_EMAIL=your-email@example.com
CF_API_KEY=your-cloudflare-api-token
TRAEFIK_AUTH=admin:$2y$10$your-hash-here
```

Generate password hash:
```bash
# Install htpasswd if not available
sudo apt install apache2-utils

# Generate hash
htpasswd -nb admin yourpassword
# Copy the output to TRAEFIK_AUTH
```

### 2.2 WireGuard Setup
```bash
cd ../wg-easy
cp env.example .env
```

Edit `.env`:
```bash
DOMAIN=yourdomain.com
WG_HOST=vpn.yourdomain.com
WG_PASSWORD=your-secure-vpn-password
WG_AUTH=admin:$2y$10$your-hash-here
```

## Step 3: Create Traefik Network

```bash
# From the root directory
docker network create traefik
```

## Step 4: Start Services

### 4.1 Start Traefik First
```bash
cd traefik
docker compose up -d
```

### 4.2 Start WireGuard VPN
```bash
cd ../wg-easy
docker compose up -d
```

### 4.3 Start All Other Services
```bash
cd ..
docker compose up -d
```

## Step 5: Configure Public Services

### 5.1 Homepage (Public Dashboard)
Add these labels to `homepage/docker-compose.yml`:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.homepage.rule=Host(`home.${DOMAIN}`)"
  - "traefik.http.routers.homepage.entrypoints=websecure"
  - "traefik.http.routers.homepage.tls.certresolver=cloudflare"
  - "traefik.http.services.homepage.loadbalancer.server.port=3000"
```

### 5.2 Home Assistant (Public Access)
Add these labels to `home-assistant/docker-compose.yml`:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.homeassistant.rule=Host(`ha.${DOMAIN}`)"
  - "traefik.http.routers.homeassistant.entrypoints=websecure"
  - "traefik.http.routers.homeassistant.tls.certresolver=cloudflare"
  - "traefik.http.services.homeassistant.loadbalancer.server.port=8123"
```

### 5.3 Other Services
You can make any service public by adding similar labels. For example, Pi-hole:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.pihole.rule=Host(`pihole.${DOMAIN}`)"
  - "traefik.http.routers.pihole.entrypoints=websecure"
  - "traefik.http.routers.pihole.tls.certresolver=cloudflare"
  - "traefik.http.services.pihole.loadbalancer.server.port=8053"
```

## Step 6: Access Your Services

### Public URLs (HTTPS)
- **Homepage**: https://home.yourdomain.com
- **Home Assistant**: https://ha.yourdomain.com
- **Traefik Dashboard**: https://traefik.yourdomain.com
- **VPN Management**: https://vpn.yourdomain.com

### Local URLs (HTTP)
- **Homepage**: http://your-pi-ip:3000
- **Home Assistant**: http://your-pi-ip:8123
- **Traefik Dashboard**: http://your-pi-ip:8080

## Step 7: VPN Client Setup

1. Access https://vpn.yourdomain.com
2. Login with your credentials
3. Download the WireGuard configuration file
4. Install WireGuard client on your device
5. Import the configuration file
6. Connect to VPN

## Security Considerations

### Public vs Private Services
- **Public**: Homepage, Home Assistant (if desired)
- **VPN Only**: Traefik dashboard, VPN management
- **Local Only**: System monitoring, print server

### Access Control
- Use strong passwords for all services
- Consider IP whitelisting for sensitive services
- Regularly update passwords and certificates

## Troubleshooting

### SSL Certificate Issues
- Check Cloudflare API credentials
- Verify DNS records are pointing to your IP
- Check Traefik logs: `docker logs traefik`

### VPN Connection Issues
- Ensure port 51820 is forwarded on your router
- Check wg-easy logs: `docker logs wg-easy`
- Verify firewall rules allow UDP traffic

### Service Not Accessible
- Check if service has Traefik labels
- Verify service is running: `docker ps`
- Check Traefik dashboard for routing issues

## Maintenance

### SSL Certificates
- Traefik automatically renews Let's Encrypt certificates
- Certificates are stored in `traefik/certs/`
- Monitor expiration dates in Traefik dashboard

### Updates
- Regularly update Docker images
- Monitor security advisories
- Backup configuration files

## Next Steps

1. **Customize URLs**: Change subdomains to match your preferences
2. **Add More Services**: Make other services publicly accessible
3. **Monitoring**: Set up alerts for certificate expiration
4. **Backup**: Automate backup of configuration and certificates

## Support

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [wg-easy GitHub](https://github.com/WeeJeWel/wg-easy)
- [Cloudflare Help](https://support.cloudflare.com/)
- Check service logs for specific error messages
