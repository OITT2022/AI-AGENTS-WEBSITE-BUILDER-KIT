#!/bin/bash
# ──────────────────────────────────────────────────────────────
# EC2 Video Worker Setup Script
# Run on a fresh Amazon Linux 2023 / Ubuntu EC2 instance
# Recommended: t3.large (2 vCPU, 8GB RAM) or bigger
# ──────────────────────────────────────────────────────────────

set -e

echo "=== Installing system dependencies ==="

# Detect package manager
if command -v dnf &>/dev/null; then
  # Amazon Linux 2023
  sudo dnf update -y
  sudo dnf install -y git nodejs npm ffmpeg
elif command -v apt-get &>/dev/null; then
  # Ubuntu/Debian
  sudo apt-get update
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y git nodejs ffmpeg chromium-browser
fi

echo "=== Node $(node -v) | npm $(npm -v) | FFmpeg $(ffmpeg -version 2>&1 | head -1) ==="

echo "=== Cloning repository ==="
cd /home/ec2-user 2>/dev/null || cd /home/ubuntu 2>/dev/null || cd ~
git clone https://github.com/OITT2022/real-estate-marketing-agent.git app
cd app

echo "=== Installing dependencies ==="
npm ci
cd video-engine && npm ci && cd ..

echo "=== Building ==="
npm run build

echo "=== Creating .env ==="
cat > .env << 'ENVEOF'
# ── Database (same RDS as Amplify) ──
DB_PROVIDER=pg
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@your-rds-host.region.rds.amazonaws.com:5432/advplanner_ai_marketing_agent?sslmode=require

# ── Video Engine ──
VIDEO_ENGINE_ENABLED=true
VIDEO_TEMP_DIR=/tmp/video-renders
# FFMPEG_PATH=        # leave empty to use system FFmpeg
# VIDEO_CRF=28        # default 28, lower = higher quality
# VIDEO_MAX_BITRATE=5M
# VIDEO_PRESET=fast

# ── Storage (S3 for persistent video output) ──
STORAGE_PROVIDER=s3
S3_BUCKET=realestate-marketing-assets
AWS_REGION=eu-north-1
# S3_ACCESS_KEY_ID=   # or use EC2 IAM role (recommended)
# S3_SECRET_ACCESS_KEY=

# ── Server ──
PORT=3001
ENVEOF

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your RDS credentials and S3 config"
echo "  2. Install @aws-sdk/client-s3: npm install @aws-sdk/client-s3"
echo "  3. Start the worker: node -r dotenv/config dist/server.js"
echo "  4. Or use PM2: pm2 start dist/server.js --name video-worker -- -r dotenv/config"
echo "  5. Set VIDEO_WORKER_URL=http://<this-ec2-private-ip>:3001 in Amplify env vars"
echo ""
echo "Test: curl http://localhost:3001/api/video/render -X POST -H 'Content-Type: application/json' -d '{\"job\":{\"projectId\":\"test\",\"platform\":\"tiktok\",\"language\":\"he\",\"style\":\"luxury\",\"title\":\"Test\",\"images\":[{\"src\":\"https://picsum.photos/1080/1920\"}]}}'"
