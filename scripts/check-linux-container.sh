#!/usr/bin/env bash
# Run the already packaged app against Ubuntu userspace; the host kernel is shared.
set -euo pipefail
CODEGO_UBUNTU="${1:-24.04}"
case "$CODEGO_UBUNTU" in 22.04|24.04) ;; *) echo 'Uso: bash scripts/check-linux-container.sh 22.04|24.04' >&2; exit 2;; esac
CODEGO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEGO_EVIDENCE="$CODEGO_ROOT/reports/container-ubuntu-$CODEGO_UBUNTU"
mkdir -p "$CODEGO_EVIDENCE"
test -x "$CODEGO_ROOT/dist/linux-unpacked/codego-examguard"
docker run --rm --memory=2g --cpus=2 --security-opt no-new-privileges \
  --mount "type=bind,source=$CODEGO_ROOT/dist/linux-unpacked,target=/app,readonly" \
  --mount "type=bind,source=$CODEGO_EVIDENCE,target=/evidence" \
  "ubuntu:$CODEGO_UBUNTU" sh -ec '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    . /etc/os-release
    audio=libasound2
    if [ "$VERSION_ID" = "24.04" ]; then audio=libasound2t64; fi
    apt-get install -y -qq --no-install-recommends python3 ca-certificates libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 "$audio" libgtk-3-0 libxshmfence1 fonts-dejavu-core
    cp /etc/os-release /evidence/os-release.txt
    python3 --version > /evidence/python-version.txt
    mkdir -p /tmp/codego-home
    export HOME=/tmp/codego-home
    cd /tmp
    /app/codego-examguard --self-test-report=/evidence/packaged.json --disable-gpu --ozone-platform=headless --ozone-override-screen-size=1440,900 --no-sandbox
  '
