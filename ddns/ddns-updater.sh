#!/bin/bash

# Dynamic DNS Updater for Cloudflare
# Updates domain A records when public IP changes

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
    source "$SCRIPT_DIR/.env"
else
    echo "❌ Error: .env file not found in $SCRIPT_DIR"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required variables
if [ -z "$CF_API_EMAIL" ] || [ -z "$CF_API_KEY" ] || [ -z "$CF_ZONE_ID" ] || [ -z "$DOMAIN" ]; then
    echo "❌ Error: Missing required environment variables"
    echo "Please check your .env file contains: CF_API_EMAIL, CF_API_KEY, CF_ZONE_ID, DOMAIN"
    exit 1
fi

# Get current public IP
CURRENT_IP=$(curl -4 -s ifconfig.me 2>/dev/null || curl -4 -s ipinfo.io/ip)

if [ -z "$CURRENT_IP" ]; then
    echo "❌ Could not get current public IP"
    exit 1
fi

# Function to update a DNS record
update_dns_record() {
    local record_name="$1"
    local record_type="A"
    
    # Get current DNS record
    local dns_response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=$record_name&type=$record_type" \
      -H "Authorization: Bearer $CF_API_KEY" \
      -H "Content-Type: application/json")
    
    local dns_ip=$(echo "$dns_response" | jq -r '.result[0].content // "none"')
    local record_id=$(echo "$dns_response" | jq -r '.result[0].id // "none"')
    
    echo "$(date): Checking $record_name"
    echo "  Current IP: $CURRENT_IP"
    echo "  DNS IP: $dns_ip"
    
    if [ "$record_id" = "none" ] || [ "$record_id" = "null" ]; then
        echo "  ⚠️  No A record found for $record_name - skipping"
        return 0
    fi
    
    # Update if IPs don't match
    if [ "$CURRENT_IP" != "$dns_ip" ]; then
        echo "  🔄 IP changed! Updating DNS record..."
        
        local update_result=$(curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$record_id" \
          -H "Authorization: Bearer $CF_API_KEY" \
          -H "Content-Type: application/json" \
          --data "{\"content\":\"$CURRENT_IP\"}")
        
        local success=$(echo "$update_result" | jq -r '.success // false')
        
        if [ "$success" = "true" ]; then
            echo "  ✅ $record_name updated successfully!"
            echo "$(date): Updated $record_name from $dns_ip to $CURRENT_IP" >> "$SCRIPT_DIR/ddns.log"
        else
            echo "  ❌ Failed to update $record_name"
            echo "$update_result" | jq '.errors // .'
            echo "$(date): FAILED to update $record_name - $(echo "$update_result" | jq -c '.errors // .')" >> "$SCRIPT_DIR/ddns.log"
        fi
    else
        echo "  ✅ No update needed for $record_name"
    fi
}

# Update root domain and VPN subdomain
update_dns_record "$DOMAIN"
update_dns_record "vpn.$DOMAIN"

echo "$(date): DDNS check completed"
