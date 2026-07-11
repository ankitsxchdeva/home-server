#!/bin/sh
# CUPS backend: write raw job data straight to the kernel usblp device.
# Device URI form: usblp:/dev/usb/lp0
# Kept in /etc/cups (persisted bind mount); copied to /usr/lib/cups/backend/usblp.
if [ $# -eq 0 ]; then
  echo "direct usblp:/dev/usb/lp0 \"Beeprt\" \"USB printer via kernel usblp\""
  exit 0
fi
dev="${DEVICE_URI#usblp:}"
if [ -n "$6" ]; then
  exec cat "$6" > "$dev"
else
  exec cat > "$dev"
fi
