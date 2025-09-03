# VPN-Only Service Configuration

This guide shows how to make your services accessible only through VPN or local network.

## 🔒 **VPN-Only Access Pattern**

### **For Any Service, Add These Labels:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.service-name.rule=Host(`subdomain.ankit.casa`)"
  - "traefik.http.routers.service-name.entrypoints=websecure"
  - "traefik.http.routers.service-name.tls.certresolver=cloudflare"
  - "traefik.http.routers.service-name.middlewares=vpn-only"
  - "traefik.http.services.service-name.loadbalancer.server.port=PORT_NUMBER"
```

## 🏠 **Homepage Dashboard (VPN-Only)**

### **Add to `homepage/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.homepage.rule=Host(`home.ankit.casa`)"
  - "traefik.http.routers.homepage.entrypoints=websecure"
  - "traefik.http.routers.homepage.tls.certresolver=cloudflare"
  - "traefik.http.routers.homepage.middlewares=vpn-only"
  - "traefik.http.services.homepage.loadbalancer.server.port=3000"
```

## 🏠 **Home Assistant (VPN-Only)**

### **Add to `home-assistant/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.homeassistant.rule=Host(`ha.ankit.casa`)"
  - "traefik.http.routers.homeassistant.entrypoints=websecure"
  - "traefik.http.routers.homeassistant.tls.certresolver=cloudflare"
  - "traefik.http.routers.homeassistant.middlewares=vpn-only"
  - "traefik.http.services.homeassistant.loadbalancer.server.port=8123"
```

## 🛡️ **Pi-hole (VPN-Only)**

### **Add to `pihole/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.pihole.rule=Host(`pihole.ankit.casa`)"
  - "traefik.http.routers.pihole.entrypoints=websecure"
  - "traefik.http.routers.pihole.tls.certresolver=cloudflare"
  - "traefik.http.routers.pihole.middlewares=vpn-only"
  - "traefik.http.services.pihole.loadbalancer.server.port=8053"
```

## 📊 **Uptime Kuma (VPN-Only)**

### **Add to `uptime-kuma/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.uptime-kuma.rule=Host(`uptime.ankit.casa`)"
  - "traefik.http.routers.uptime-kuma.entrypoints=websecure"
  - "traefik.http.routers.uptime-kuma.tls.certresolver=cloudflare"
  - "traefik.http.routers.uptime-kuma.middlewares=vpn-only"
  - "traefik.http.services.uptime-kuma.loadbalancer.server.port=3001"
```

## 🔍 **Glances (VPN-Only)**

### **Add to `glances/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.glances.rule=Host(`glances.ankit.casa`)"
  - "traefik.http.routers.glances.entrypoints=websecure"
  - "traefik.http.routers.glances.tls.certresolver=cloudflare"
  - "traefik.http.routers.glances.middlewares=vpn-only"
  - "traefik.http.services.glances.loadbalancer.server.port=61208"
```

## 🌐 **NetAlertX (VPN-Only)**

### **Add to `netalertx/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.netalertx.rule=Host(`netalert.ankit.casa`)"
  - "traefik.http.routers.netalertx.entrypoints=websecure"
  - "traefik.http.routers.netalertx.tls.certresolver=cloudflare"
  - "traefik.http.routers.netalertx.middlewares=vpn-only"
  - "traefik.http.services.netalertx.loadbalancer.server.port=20211"
```

## 🖨️ **CUPS Print Server (VPN-Only)**

### **Add to `cups/docker-compose.yml`:**
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.cups.rule=Host(`print.ankit.casa`)"
  - "traefik.http.routers.cups.entrypoints=websecure"
  - "traefik.http.routers.cups.tls.certresolver=cloudflare"
  - "traefik.http.routers.cups.middlewares=vpn-only"
  - "traefik.http.services.cups.loadbalancer.server.port=631"
```

## 🔐 **Access Control Summary**

### **Public Access (Internet):**
- **VPN Management**: `https://vpn.ankit.casa`

### **VPN-Only Access:**
- **Homepage**: `https://home.ankit.casa`
- **Home Assistant**: `https://ha.ankit.casa`
- **Traefik Dashboard**: `https://traefik.ankit.casa`
- **Pi-hole**: `https://pihole.ankit.casa`
- **Uptime Kuma**: `https://uptime.ankit.casa`
- **Glances**: `https://glances.ankit.casa`
- **NetAlertX**: `https://netalert.ankit.casa`
- **CUPS**: `https://print.ankit.casa`

### **Local Network Access:**
- **All services**: Accessible via local IP addresses
- **No VPN required** when on your home network

## 🚀 **Implementation Steps**

### **1. Add Labels to Services:**
- Copy the label examples above
- Add them to each service's `docker-compose.yml`
- Replace `service-name` with actual service name
- Replace `PORT_NUMBER` with actual port

### **2. Restart Services:**
```bash
# Restart individual services after adding labels
cd service-name && docker compose restart

# Or restart everything
docker compose restart
```

### **3. Test Access:**
- **From internet**: Only VPN management should work
- **From VPN**: All services should work via HTTPS URLs
- **From LAN**: All services work via local IPs

## 🛡️ **Security Benefits**

### **What This Achieves:**
- ✅ **No public attack surface** for sensitive services
- ✅ **Professional HTTPS URLs** for VPN users
- ✅ **Local network access** still works
- ✅ **Centralized access control** via Traefik
- ✅ **SSL certificates** for all services

### **Access Patterns:**
```
Internet → VPN Management (public)
VPN → All Services (HTTPS, secure)
LAN → All Services (HTTP, local)
```

## 🔧 **Troubleshooting**

### **Service Not Accessible:**
- Check if labels are correctly added
- Verify Traefik is running: `docker ps | grep traefik`
- Check Traefik logs: `docker logs traefik`
- Ensure VPN-only middleware is configured

### **VPN Access Issues:**
- Verify VPN is connected
- Check if you're in the 10.8.0.0/24 range
- Test with `curl -I https://service.ankit.casa`

---

**Note**: This configuration ensures maximum security while maintaining professional access to your services through VPN.
