# MonMon Dashboard - Deployment Instructions

## Quick Deploy to Render (Free)

1. **Create a Render account:** https://render.com (sign up with email or GitHub)

2. **Create a new Web Service:**
   - Click "New +" → "Web Service"
   - Choose "Deploy from Git repository" OR "Deploy without Git"

3. **If using Git:**
   - Connect your GitHub/GitLab
   - Select this repository
   
4. **If deploying without Git (easier):**
   - Upload the following files as a ZIP:
     - `index.html`
     - `server.js`
     - `package.json`
     - `README.md`

5. **Configure:**
   - **Name:** `monmon-dashboard` (or anything you want)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free`

6. **Deploy!**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - You'll get a public URL like: `https://monmon-dashboard.onrender.com`

## Alternative: Deploy to Vercel

1. Install Vercel CLI: `npm install -g vercel`
2. Run: `vercel --prod` in this directory
3. Follow prompts
4. Get instant public URL

## Alternative: Deploy to Railway

1. Go to https://railway.app
2. Click "Start a New Project" → "Deploy from GitHub repo"
3. Connect repo and deploy
4. Get public URL

---

**For Rich:** Share the public URL with Symone. She can bookmark it on her phone and refresh throughout the day.
