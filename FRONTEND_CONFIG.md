# Frontend Configuration Guide

## After Backend Deployment on Render

Once your backend is deployed on Render, you'll need to update your frontend configuration.

### 1. Get Your Backend URL

After deploying on Render, you'll get a URL like:
```
https://your-app-name.onrender.com
```

### 2. Update Frontend Configuration

In your frontend project, you'll need to update the API base URL:

#### If using React with environment variables:

Create or update `.env` file in your frontend directory:
```env
REACT_APP_API_URL=https://your-app-name.onrender.com
```

#### If using a config file:

Update your API configuration to point to the Render URL instead of localhost:5000.

### 3. Test the Connection

After updating the configuration:

1. **Test locally:**
   ```bash
   # In your frontend directory
   npm start
   ```
   - Your frontend will run on localhost:3000
   - It will connect to your Render backend

2. **Test the deployed frontend:**
   - Visit: https://you-tubedownloader-frontend.vercel.app/
   - It should now connect to your Render backend

### 4. CORS Configuration

The backend is already configured with CORS to allow requests from:
- `http://localhost:3000` (local development)
- `https://you-tubedownloader-frontend.vercel.app` (deployed frontend)

### 5. API Endpoints

Your frontend can now use these endpoints:

- **Health Check:** `GET https://your-app-name.onrender.com/health`
- **Video Info:** `POST https://your-app-name.onrender.com/api/info`
- **Download Video:** `POST https://your-app-name.onrender.com/api/download`
- **Download Audio:** `POST https://your-app-name.onrender.com/api/download/audio`
- **Download Playlist:** `POST https://your-app-name.onrender.com/api/download/playlist`

### 6. Troubleshooting

If you get CORS errors:
- Make sure your frontend URL is in the CORS configuration
- Check that the backend is running on Render

If downloads don't work:
- Remember that Render uses temporary storage
- Files are cleaned up automatically
- Consider implementing cloud storage for persistent files

## Example Frontend API Call

```javascript
// Example of how to call your backend API
const response = await fetch('https://your-app-name.onrender.com/api/info', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=VIDEO_ID'
  })
});

const data = await response.json();
console.log(data);
``` 