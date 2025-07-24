# Render Deployment Checklist

## Before Deployment

- [ ] Code is pushed to GitHub/GitLab repository
- [ ] All files are committed and pushed
- [ ] `package.json` has correct scripts and dependencies
- [ ] `render.yaml` is present (optional but helpful)
- [ ] `.dockerignore` is present to optimize build
- [ ] `install-yt-dlp.sh` script is present

## Render Configuration

### Required Settings:
- **Environment:** Node
- **Build Command:** `npm install && chmod +x install-yt-dlp.sh && ./install-yt-dlp.sh`
- **Start Command:** `npm start`
- **Plan:** Choose appropriate plan (Free tier works for testing)

### Environment Variables (Optional):
- `NODE_ENV`: `production`
- `PORT`: `10000` (Render sets this automatically)

## Common Issues & Solutions

### 1. Build Fails
**Error:** `yt-dlp: command not found`
**Solution:** Make sure build command includes the yt-dlp installation script

### 2. Service Won't Start
**Error:** `Port already in use`
**Solution:** Use `process.env.PORT` in server.js (already done)

### 3. Downloads Not Working
**Issue:** Files disappear after download
**Solution:** This is expected on Render - files are temporary. Consider cloud storage for persistence.

### 4. Timeout Issues
**Issue:** Long downloads timeout
**Solution:** Render has request timeout limits. Consider streaming responses.

## Testing After Deployment

1. Check health endpoint: `https://your-app.onrender.com/health`
2. Test root endpoint: `https://your-app.onrender.com/`
3. Test video info endpoint with a YouTube URL
4. Check Render logs for any errors

## Monitoring

- Use Render dashboard to monitor logs
- Check `/health` endpoint for service status
- Monitor resource usage in Render dashboard

## Troubleshooting Commands

```bash
# Check if yt-dlp is installed
which yt-dlp

# Check Node.js version
node --version

# Check npm version
npm --version

# Test local build
npm install && chmod +x install-yt-dlp.sh && ./install-yt-dlp.sh
npm start
``` 