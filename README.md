# YouTube Downloader Backend

A Node.js backend server for downloading YouTube videos and audio using yt-dlp.

## Features

- Download YouTube videos in various formats
- Download audio-only files
- Download entire playlists
- Get video information and available formats
- RESTful API endpoints

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Install yt-dlp globally:
```bash
npm install -g yt-dlp
```

3. Start the development server:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

## Deployment on Render

### Prerequisites

1. Make sure your code is pushed to a Git repository (GitHub, GitLab, etc.)
2. Have a Render account

### Deployment Steps

1. **Connect to Render:**
   - Go to [render.com](https://render.com)
   - Sign up/login to your account
   - Click "New +" and select "Web Service"

2. **Connect your repository:**
   - Connect your GitHub/GitLab account
   - Select your YouTube downloader repository

3. **Configure the service:**
   - **Name:** `youtube-downloader-backend` (or any name you prefer)
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm install -g yt-dlp`
   - **Start Command:** `npm start`
   - **Plan:** Choose the plan that fits your needs

4. **Environment Variables (Optional):**
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render will set this automatically)

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your application

### Important Notes for Render Deployment

- The app uses a temporary downloads directory (`temp_downloads/`) on Render
- Files are automatically cleaned up by Render's ephemeral filesystem
- The `yt-dlp` tool is installed globally during the build process
- Health check endpoint available at `/health`

## API Endpoints

- `GET /` - Server status
- `GET /health` - Health check
- `POST /api/video-info` - Get video information
- `POST /api/download-video` - Download video
- `POST /api/download-audio` - Download audio
- `POST /api/download-playlist` - Download playlist
- `POST /api/formats` - Get available formats
- `GET /api/downloads-path` - Get downloads path info

## Troubleshooting

### Common Issues on Render

1. **Build fails:**
   - Check that `yt-dlp` is properly installed
   - Verify all dependencies are in `package.json`

2. **Service doesn't start:**
   - Check the logs in Render dashboard
   - Verify the start command is correct

3. **Downloads not working:**
   - The app uses temporary storage on Render
   - Files are cleaned up automatically
   - Consider using cloud storage for persistent files

4. **yt-dlp not found:**
   - Make sure the global installation is included in build command
   - Check that the PATH includes global npm packages

## Environment Variables

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)

## License

MIT 