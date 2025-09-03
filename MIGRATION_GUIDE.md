# Migration Guide: Homer → Homepage

This guide will help you migrate from Homer to Homepage dashboard while maintaining all your services.

## What's Changed

- **Dashboard**: Homer → Homepage
- **Port**: Now 3000 (Homepage's default port)
- **Features**: Enhanced with Docker integration, widgets, and modern UI
- **Configuration**: YAML-based instead of Homer's custom format

## Migration Steps

### 1. Stop Homer Service

```bash
cd homer
docker compose down
```

### 2. Setup Homepage

```bash
# Copy environment file
cp homepage/env.example homepage/.env

# Start Homepage
cd ../homepage
docker compose up -d
```

### 3. Verify Migration

- Access your new dashboard at: http://your-pi-ip:3000
- All your services should be automatically discovered
- The layout will be similar but with enhanced features

### 4. Customize (Optional)

Edit the configuration files in `homepage/config/`:
- `settings.yaml` - Change theme, colors, language
- `services.yaml` - Reorganize service groups
- `bookmarks.yaml` - Add external links

### 5. Remove Homer (After Verification)

```bash
# Only after confirming Homepage works correctly
cd ../homer
docker compose down
# Optionally remove the directory if no longer needed
```

## What You'll Gain

✅ **Better Docker Integration**: Automatic container discovery
✅ **Modern UI**: Responsive design with dark/light themes
✅ **Widgets**: Interactive elements for Home Assistant and Pi-hole
✅ **Better Organization**: Logical service grouping
✅ **LAN Access**: Available to all devices on your network
✅ **Easier Configuration**: Standard YAML format

## Troubleshooting

### Dashboard Not Loading
- Check if Homepage container is running: `docker ps`
- Verify port 8080 is accessible
- Check container logs: `docker logs homepage`

### Services Not Showing
- Ensure Docker socket is properly mounted
- Check if services are running: `docker ps`
- Verify service URLs in `config/services.yaml`

### Widgets Not Working
- Check API keys in `config/services.yaml`
- Verify service URLs are accessible from Homepage container
- Check browser console for errors

## Rollback Plan

If you need to rollback to Homer:

```bash
# Stop Homepage
cd homepage
docker compose down

# Restart Homer
cd ../homer
docker compose up -d
```

## Support

- [Homepage Documentation](https://homepage.0xcc.pw/)
- [GitHub Issues](https://github.com/benphelps/homepage/issues)
- Check the `homepage/README.md` for detailed configuration options
