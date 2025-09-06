#!/bin/bash

# Homepage Dynamic IP Update Script
# This script automatically updates hardcoded IP addresses in homepage configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOMEPAGE_CONFIG_DIR="$SCRIPT_DIR/../homepage/config"
SERVICES_FILE="$HOMEPAGE_CONFIG_DIR/services.yaml"
LOG_FILE="$SCRIPT_DIR/update-homepage-ip.log"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Get current IP address
get_current_ip() {
    # Try multiple methods to get the IP address
    local ip=""
    
    # Method 1: hostname -I
    ip=$(hostname -I | awk '{print $1}' 2>/dev/null) && [[ -n "$ip" ]] && echo "$ip" && return
    
    # Method 2: ip route
    ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+') && [[ -n "$ip" ]] && echo "$ip" && return
    
    # Method 3: ifconfig (fallback)
    ip=$(ifconfig 2>/dev/null | grep -E "inet.*192\.168\." | awk '{print $2}' | head -1) && [[ -n "$ip" ]] && echo "$ip" && return
    
    log_message "ERROR: Could not determine current IP address"
    exit 1
}

# Get current IP from services.yaml
get_current_config_ip() {
    grep -oP 'http://\K[0-9.]+' "$SERVICES_FILE" | head -1
}

# Update IP addresses in services.yaml
update_services_config() {
    local old_ip="$1"
    local new_ip="$2"
    
    log_message "Updating services.yaml: $old_ip -> $new_ip"
    
    # Create backup
    cp "$SERVICES_FILE" "$SERVICES_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Update all IP addresses
    sed -i "s|http://$old_ip:|http://$new_ip:|g" "$SERVICES_FILE"
    
    log_message "Services configuration updated successfully"
}

# Restart homepage container
restart_homepage() {
    log_message "Restarting homepage container..."
    cd "$SCRIPT_DIR/../homepage"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose restart
    else
        docker compose restart
    fi
    
    log_message "Homepage container restarted"
}

# Main function
main() {
    log_message "Starting homepage IP update check..."
    
    # Check if services file exists
    if [[ ! -f "$SERVICES_FILE" ]]; then
        log_message "ERROR: Services file not found: $SERVICES_FILE"
        exit 1
    fi
    
    # Get current system IP
    current_ip=$(get_current_ip)
    log_message "Current system IP: $current_ip"
    
    # Get IP from configuration
    config_ip=$(get_current_config_ip)
    log_message "Current config IP: $config_ip"
    
    # Check if update is needed
    if [[ "$current_ip" == "$config_ip" ]]; then
        log_message "IP addresses match. No update needed."
        exit 0
    fi
    
    log_message "IP address change detected. Updating configuration..."
    
    # Update configuration
    update_services_config "$config_ip" "$current_ip"
    
    # Restart homepage
    restart_homepage
    
    log_message "Homepage IP update completed successfully!"
}

# Run main function
main "$@"
