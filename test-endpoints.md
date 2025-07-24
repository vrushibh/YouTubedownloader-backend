# Test Endpoints After Deployment

## 🔍 **Test Your Backend Endpoints**

After deploying to Render, test these endpoints:

### 1. **Health Check**
```
GET https://youtubedownloader-backend-6ey1.onrender.com/health
```

### 2. **Test yt-dlp Installation**
```
GET https://youtubedownloader-backend-6ey1.onrender.com/test-yt-dlp
```

### 3. **Test Downloads Path**
```
GET https://youtubedownloader-backend-6ey1.onrender.com/downloads-path
```

### 4. **Test Video Info**
```
POST https://youtubedownloader-backend-6ey1.onrender.com/info
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

## 🚨 **Common Issues & Solutions**

### If yt-dlp test fails:
- Check Render logs for installation errors
- The build command should be: `npm install && chmod +x install-yt-dlp.sh && ./install-yt-dlp.sh`

### If endpoints return 404:
- Make sure you're using the correct URL
- Check that the deployment completed successfully

### If you get CORS errors:
- The backend is configured to allow requests from localhost:3000
- Check that your frontend is making requests to the correct backend URL

## 📊 **Expected Responses**

### Health Check Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-24T04:48:58.000Z",
  "environment": "production",
  "port": "10000"
}
```

### yt-dlp Test Response:
```json
{
  "success": true,
  "ytDlpVersion": "2024.03.10",
  "message": "yt-dlp is working correctly"
}
``` 