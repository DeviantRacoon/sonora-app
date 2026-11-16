#!/usr/bin/env bash
set -euo pipefail

mkdir -p netlify/server/bin
curl -fsSL --retry 3 https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp_linux -o netlify/server/bin/yt-dlp
curl -fsSL --retry 3 https://registry.npmjs.org/@ffmpeg-installer/linux-x64/-/linux-x64-4.1.0.tgz | tar -xz -C netlify/server/bin --strip-components=1 package/ffmpeg
curl -fsSL --retry 3 https://registry.npmjs.org/@ffprobe-installer/linux-x64/-/linux-x64-5.2.0.tgz | tar -xz -C netlify/server/bin --strip-components=1 package/ffprobe
chmod +x netlify/server/bin/yt-dlp netlify/server/bin/ffmpeg netlify/server/bin/ffprobe
