#!/usr/bin/env bash
#
# Creates a local certificate authority and a server certificate so the dev
# server can be served over HTTPS on the LAN.
#
# Why this is needed: iOS only registers a service worker in a *secure
# context*. localhost is exempt; a LAN IP is not. Without HTTPS the iPhone
# cannot install the PWA or receive Web Push at all.
#
# Uses the openssl that ships with macOS — no Homebrew, no downloads.
#
# Usage:  ./scripts/make-lan-cert.sh [lan-ip]
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/certs"

LAN_IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
if [ -z "$LAN_IP" ]; then
  echo "Could not detect a LAN IP. Pass one explicitly:" >&2
  echo "  ./scripts/make-lan-cert.sh 192.168.1.133" >&2
  exit 1
fi

mkdir -p "$DIR"

# The CA is created once and reused. Regenerating it would invalidate the
# trust you established on the phone, so only create it when missing.
if [ ! -f "$DIR/rootCA.pem" ]; then
  echo "Creating local certificate authority…"
  openssl genrsa -out "$DIR/rootCA-key.pem" 2048 2>/dev/null
  openssl req -x509 -new -nodes \
    -key "$DIR/rootCA-key.pem" -sha256 -days 1825 \
    -subj "/CN=LiveScores Local CA/O=LiveScores Dev" \
    -out "$DIR/rootCA.pem" 2>/dev/null
  echo "  -> $DIR/rootCA.pem  (install this on the iPhone)"
else
  echo "Reusing existing CA at $DIR/rootCA.pem"
fi

echo "Issuing server certificate for $LAN_IP…"
openssl genrsa -out "$DIR/lan-key.pem" 2048 2>/dev/null
openssl req -new -key "$DIR/lan-key.pem" -subj "/CN=$LAN_IP" \
  -out "$DIR/lan.csr" 2>/dev/null

# Modern clients ignore CN entirely and require subjectAltName.
cat > "$DIR/lan.ext" <<EOF
subjectAltName = IP:$LAN_IP, IP:127.0.0.1, DNS:localhost
extendedKeyUsage = serverAuth
basicConstraints = CA:FALSE
EOF

# iOS rejects leaf certificates valid for more than 398 days.
openssl x509 -req -in "$DIR/lan.csr" \
  -CA "$DIR/rootCA.pem" -CAkey "$DIR/rootCA-key.pem" -CAcreateserial \
  -out "$DIR/lan.pem" -days 397 -sha256 -extfile "$DIR/lan.ext" 2>/dev/null

rm -f "$DIR/lan.csr" "$DIR/lan.ext"

cat <<EOF

Done. Certificates are in ./certs (gitignored).

  Dev server will serve:  https://$LAN_IP:5173

On the iPhone, once only:
  1. AirDrop or email certs/rootCA.pem to the phone
  2. Open it -> Settings offers "Profile Downloaded" -> Install
  3. Settings > General > About > Certificate Trust Settings
     -> enable full trust for "LiveScores Local CA"

Re-run this script if your LAN IP changes; the CA (and the phone's trust)
stays valid, only the server certificate is reissued.
EOF
