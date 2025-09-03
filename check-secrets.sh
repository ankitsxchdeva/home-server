#!/bin/bash
# Script to check for sensitive files before committing

echo "🔍 Checking for sensitive files..."

# Define sensitive file patterns
sensitive_patterns=(
    "*.env"
    "secrets.yaml"
    "*.db"
    "*.db-wal"
    "*.db-shm"
    "*.log"
    "printers.conf"
    "cupsd.conf"
    "known_devices.yaml"
    "ip_bans.yaml"
    ".google.token"
)

# Check staged files
staged_files=$(git diff --cached --name-only 2>/dev/null)
sensitive_staged=""

if [ -n "$staged_files" ]; then
    for pattern in "${sensitive_patterns[@]}"; do
        matches=$(echo "$staged_files" | grep -E "$pattern" || true)
        if [ -n "$matches" ]; then
            sensitive_staged="$sensitive_staged$matches\n"
        fi
    done
fi

# Check for secrets in file contents
echo "🔎 Scanning staged files for potential secrets..."
potential_secrets=""

if [ -n "$staged_files" ]; then
    while IFS= read -r file; do
        if [[ "$file" == *.yaml ]] || [[ "$file" == *.yml ]] || [[ "$file" == *.py ]]; then
            # Check for common secret patterns
            if git show ":$file" 2>/dev/null | grep -qE "(password|token|key|secret).*:.*[a-zA-Z0-9]{20,}"; then
                potential_secrets="$potential_secrets$file (contains potential secrets)\n"
            fi
        fi
    done <<< "$staged_files"
fi

# Report results
if [ -n "$sensitive_staged" ] || [ -n "$potential_secrets" ]; then
    echo "❌ SECURITY WARNING: Sensitive files detected!"
    echo ""
    
    if [ -n "$sensitive_staged" ]; then
        echo "🚨 Sensitive files staged for commit:"
        echo -e "$sensitive_staged"
    fi
    
    if [ -n "$potential_secrets" ]; then
        echo "⚠️  Files with potential secrets:"
        echo -e "$potential_secrets"
    fi
    
    echo ""
    echo "🛠️  To fix:"
    echo "1. Remove sensitive files: git reset HEAD <file>"
    echo "2. Add files to .gitignore if needed"
    echo "3. Move secrets to .env files or secrets.yaml"
    echo ""
    exit 1
else
    echo "✅ No sensitive files detected in staged changes"
    echo "🔒 Safe to commit!"
    exit 0
fi
