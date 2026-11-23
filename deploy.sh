#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Pulling latest code..."
git reset --hard
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Restarting finlens with PM2..."
if pm2 describe finlens-api > /dev/null; then
  pm2 restart finlens-api --update-env
else
  pm2 start dist/main.js --name finlens-api
fi

pm2 save
