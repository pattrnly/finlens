  GNU nano 6.2                                                                              deploy.sh
#!/bin/bash
set -e

echo "🚀 Pulling latest code..."
git reset --hard
git pull origin master

echo "📦 Installing dependencies..."
npm install --omit=dev

echo "🔁 Restarting finlens with PM2..."
# pm2 update

# If process exists -> restart, else -> start
if pm2 describe finlens-api > /dev/null; then
  pm2 restart finlens-api --update-env
else
  pm2 start src/app.js --name finlens-api   # adjust entry file if different
fi

pm2 save