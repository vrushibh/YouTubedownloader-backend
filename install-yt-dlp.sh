#!/bin/bash

# Install yt-dlp on Render
echo "Installing yt-dlp..."

# Download yt-dlp binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp

# Make it executable
chmod a+rx /usr/local/bin/yt-dlp

# Verify installation
yt-dlp --version

echo "yt-dlp installation completed!" 