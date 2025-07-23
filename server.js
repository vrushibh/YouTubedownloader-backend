const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 5000;

// Simple cache for video info to avoid re-analysis
const videoInfoCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Middleware
app.use(cors());
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Use system Downloads directory
const os = require('os');
let downloadsDir;

// Detect Downloads folder more robustly
if (os.platform() === 'win32') {
  // Windows: Use USERPROFILE\Downloads
  downloadsDir = path.join(os.homedir(), 'Downloads');
} else if (os.platform() === 'darwin') {
  // macOS: Use ~/Downloads
  downloadsDir = path.join(os.homedir(), 'Downloads');
} else {
  // Linux and others: Use ~/Downloads
  downloadsDir = path.join(os.homedir(), 'Downloads');
}

// Create downloads directory if it doesn't exist (though it usually does)
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

console.log(`📁 Downloads directory detected: ${downloadsDir}`);

// Helper function to sanitize filename
const sanitizeFilename = (filename) => {
    return filename.replace(/[^\w\s.-]/gi, '').replace(/\s+/g, '_');
};

// Helper function to get video info using yt-dlp
const getVideoInfo = async (url) => {
    try {
        console.log(`Getting video info for: ${url}`);
        
        // Check cache first
        const cacheKey = url;
        const cachedInfo = videoInfoCache.get(cacheKey);
        if (cachedInfo && (Date.now() - cachedInfo.timestamp) < CACHE_DURATION) {
            console.log(`Using cached video info for: ${cachedInfo.data.title}`);
            return cachedInfo.data;
        }
        
        // Check if it's a playlist URL first
        if (url.includes('playlist') || url.includes('list=')) {
            throw new Error('This is a playlist URL. Please use the playlist download option instead.');
        }
        
        // Use faster approach - get only basic info without full metadata
        const command = `yt-dlp --dump-json --no-warnings --no-playlist "${url}"`;
        console.log(`Executing command: ${command}`);
        
        const { stdout, stderr } = await execPromise(command, { 
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer for analysis
            timeout: 30000 // 30 second timeout for analysis
        });
        
        if (stderr) {
            console.error('yt-dlp stderr:', stderr);
        }
        
        if (!stdout || stdout.trim() === '') {
            throw new Error('No output from yt-dlp');
        }
        
        // Handle multiple JSON objects (in case of playlists)
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        let info;
        
        if (lines.length > 1) {
            // Multiple JSON objects - take the first one (main video)
            console.log(`Found ${lines.length} JSON objects, using the first one`);
            info = JSON.parse(lines[0]);
        } else {
            // Single JSON object
            info = JSON.parse(stdout.trim());
        }
        
        if (!info.title) {
            throw new Error('Invalid video info - no title found');
        }
        
        console.log(`Successfully got video info: ${info.title}`);
        
        const videoInfo = {
            title: info.title,
            duration: info.duration,
            thumbnail: info.thumbnail,
            uploader: info.uploader,
            view_count: info.view_count
        };
        
        // Cache the result
        videoInfoCache.set(cacheKey, {
            data: videoInfo,
            timestamp: Date.now()
        });
        
        return videoInfo;
    } catch (error) {
        console.error('Error getting video info:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            url: url
        });
        
        // Provide more specific error messages
        if (error.message.includes('playlist URL')) {
            throw new Error('This is a playlist URL. Please select "Entire Playlist" as download type.');
        } else if (error.message.includes('maxBuffer')) {
            throw new Error('Video info too large. Try a different video or check if it\'s a very long video.');
        } else if (error.message.includes('No output from yt-dlp')) {
            throw new Error('yt-dlp failed to get video information. Please check if the URL is valid.');
        } else if (error.message.includes('Invalid video info')) {
            throw new Error('Could not parse video information. The video might be private or unavailable.');
        } else if (error.message.includes('JSON')) {
            throw new Error('Failed to parse video information. The video might be restricted or unavailable.');
        } else {
            throw new Error(`Failed to get video info: ${error.message}`);
        }
    }
};

// Helper function to get playlist info using yt-dlp
const getPlaylistInfo = async (url) => {
    try {
        console.log(`Getting playlist info for: ${url}`);
        const command = `yt-dlp --dump-json --flat-playlist --no-warnings "${url}"`;
        console.log(`Executing command: ${command}`);
        
        const { stdout, stderr } = await execPromise(command, { 
            maxBuffer: 1024 * 1024 * 20, // 20MB buffer for playlists
            timeout: 30000 // 30 second timeout for playlist analysis
        });
        
        if (stderr) {
            console.error('yt-dlp stderr:', stderr);
        }
        
        if (!stdout || stdout.trim() === '') {
            throw new Error('No output from yt-dlp for playlist');
        }
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('No playlist entries found');
        }
        
        const entries = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch (parseError) {
                console.error('Failed to parse playlist entry:', line);
                return null;
            }
        }).filter(entry => entry !== null);
        
        if (entries.length === 0) {
            throw new Error('No valid playlist entries found');
        }
        
        // Get playlist title with smaller buffer
        const titleCommand = `yt-dlp --get-filename -o "%(playlist_title)s" --no-warnings "${url}"`;
        const { stdout: titleStdout } = await execPromise(titleCommand, { 
            maxBuffer: 1024 * 1024 * 2, // 2MB buffer for title
            timeout: 15000 // 15 second timeout for title
        });
        const playlistTitle = titleStdout.trim().split('\n')[0];
        
        console.log(`Successfully got playlist info: ${playlistTitle} (${entries.length} videos)`);
        
        return {
            title: playlistTitle || 'YouTube Playlist',
            entries: entries
        };
    } catch (error) {
        console.error('Error getting playlist info:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            url: url
        });
        
        // Provide more specific error messages
        if (error.message.includes('maxBuffer')) {
            throw new Error('Playlist too large. Try a smaller playlist or individual videos.');
        } else if (error.message.includes('No output from yt-dlp')) {
            throw new Error('yt-dlp failed to get playlist information. Please check if the URL is valid.');
        } else if (error.message.includes('No playlist entries')) {
            throw new Error('No videos found in playlist. The playlist might be private or empty.');
        } else if (error.message.includes('No valid playlist entries')) {
            throw new Error('Could not parse playlist information. The playlist might be restricted or unavailable.');
        } else {
            throw new Error(`Failed to get playlist info: ${error.message}`);
        }
    }
};

// Route to get video/playlist information
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Check if it's a playlist
        if (url.includes('playlist') || url.includes('list=')) {
            const playlistInfo = await getPlaylistInfo(url);
            res.json({
                type: 'playlist',
                data: playlistInfo
            });
        } else {
            const videoInfo = await getVideoInfo(url);
            res.json({
                type: 'video',
                data: videoInfo
            });
        }
    } catch (error) {
        console.error('Error getting info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to download single video
app.post('/api/download/video', async (req, res) => {
    try {
        const { url, quality = 'highest' } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Get video info first
        const info = await getVideoInfo(url);
        const sanitizedTitle = sanitizeFilename(info.title);
        const filename = `${sanitizedTitle}.%(ext)s`;
        const outputPath = path.join(downloadsDir, filename);

        // Use ONLY combined formats or notify user about quality limitation
        let formatSelector;
        
        // Optimized for speed: Use 720p as default for faster downloads
        if (quality === '360p' || quality === '240p' || quality === '144p') {
            // These have true combined formats - fastest
            formatSelector = '18'; // 360p combined (best available combined)
        } else if (quality === '4k') {
                formatSelector = '313+140/401+140/bestvideo[height<=2160]+bestaudio';
            } else if (quality === '1440p') {
                formatSelector = '271+140/400+140/bestvideo[height<=1440]+bestaudio';
            } else if (quality === '1080p') {
                formatSelector = '137+140/248+140/399+140/bestvideo[height<=1080]+bestaudio';
            } else if (quality === '720p') {
                formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
            } else if (quality === '480p') {
                formatSelector = '135+140/244+140/397+140/bestvideo[height<=480]+bestaudio';
            } else if (quality === 'highest') {
            // For fastest downloads, use 720p instead of highest
            console.log('Using 720p for faster download instead of highest quality');
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        } else {
            // Default: 720p for speed (was 360p)
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        }

        // Download using yt-dlp with proper merging and cleanup
        const command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 --audio-multistreams --no-keep-video --embed-metadata --add-metadata -o "${outputPath}" --no-warnings "${url}"`;
        
        console.log(`Downloading with command: ${command}`);
        
        const childProcess = exec(command, { 
            maxBuffer: 1024 * 1024 * 100 // 100MB buffer for downloads
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('Download error:', error);
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Download failed: ' + error.message });
                }
                return;
            }
            
            // Clean up any temporary files
            const cleanupTempFiles = () => {
                try {
                    const allFiles = fs.readdirSync(downloadsDir);
                    const tempFiles = allFiles.filter(file => 
                        file.includes(sanitizedTitle) && (
                            file.includes('.temp') || 
                            file.includes('.part') || 
                            file.includes('.webm') ||
                            file.includes('.m4a') ||
                            file.includes('.f140') ||
                            file.includes('.f313') ||
                            file.includes('.f401') ||
                            file.includes('.f137') ||
                            file.includes('.f136') ||
                            file.includes('.f135') ||
                            file.includes('.f244') ||
                            file.includes('.f247') ||
                            file.includes('.f248') ||
                            file.includes('.f271') ||
                            file.includes('.f398') ||
                            file.includes('.f399') ||
                            file.includes('.f400') ||
                            (file.includes('.mp4') && !file.endsWith('.mp4')) // Remove partial MP4 files
                        )
                    );
                    
                    tempFiles.forEach(tempFile => {
                        try {
                            fs.unlinkSync(path.join(downloadsDir, tempFile));
                            console.log(`Cleaned up temp file: ${tempFile}`);
                        } catch (cleanupError) {
                            console.log(`Could not clean up ${tempFile}:`, cleanupError.message);
                        }
                    });
                } catch (cleanupError) {
                    console.log('Cleanup error:', cleanupError.message);
                }
            };
            
            // Run cleanup multiple times to ensure all files are removed
            setTimeout(cleanupTempFiles, 3000);
            setTimeout(cleanupTempFiles, 5000);
            setTimeout(cleanupTempFiles, 8000);
            
            // Final cleanup - remove ALL files except the final MP4
            setTimeout(() => {
                try {
                    const allFiles = fs.readdirSync(downloadsDir);
                    const finalMP4Files = allFiles.filter(file => 
                        file.startsWith(sanitizedTitle) && file.endsWith('.mp4')
                    );
                    
                    // If we have multiple MP4 files, keep only the largest one (the merged file)
                    if (finalMP4Files.length > 1) {
                        const fileStats = finalMP4Files.map(file => ({
                            name: file,
                            size: fs.statSync(path.join(downloadsDir, file)).size
                        }));
                        
                        // Sort by size (largest first) and remove smaller files
                        fileStats.sort((a, b) => b.size - a.size);
                        
                        // Remove all except the largest file
                        fileStats.slice(1).forEach(file => {
                            try {
                                fs.unlinkSync(path.join(downloadsDir, file.name));
                                console.log(`Removed smaller MP4 file: ${file.name}`);
                            } catch (error) {
                                console.log(`Could not remove ${file.name}:`, error.message);
                            }
                        });
                    }
                    
                    // Remove any remaining non-MP4 files
                    const remainingFiles = allFiles.filter(file => 
                        file.includes(sanitizedTitle) && !file.endsWith('.mp4')
                    );
                    
                    remainingFiles.forEach(file => {
                        try {
                            fs.unlinkSync(path.join(downloadsDir, file));
                            console.log(`Final cleanup removed: ${file}`);
                        } catch (error) {
                            console.log(`Could not remove ${file}:`, error.message);
                        }
                    });
                } catch (error) {
                    console.log('Final cleanup error:', error.message);
                }
            }, 10000); // Wait 10 seconds for all merging to complete
            
            // Find the final MP4 file
            const files = fs.readdirSync(downloadsDir).filter(file => 
                file.startsWith(sanitizedTitle) && file.endsWith('.mp4')
            );
            
            if (files.length > 0) {
                if (!res.headersSent) {
                    res.json({
                        success: true,
                        filename: files[0],
                        downloadUrl: `/downloads/${files[0]}`,
                        message: `Successfully downloaded: ${files[0]}`
                    });
                }
            } else {
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download completed but MP4 file not found' });
                }
            }
        });
        
        // Handle process timeout
        setTimeout(() => {
            if (childProcess.killed === false) {
                childProcess.kill();
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download timeout after 10 minutes' });
                }
            }
        }, 600000); // 10 minutes timeout

    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ error: error.message });
    }
});

// Unified download endpoint that handles all types
app.post('/api/download', async (req, res) => {
    try {
        const { url, type = 'video', quality = 'highest' } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Route to appropriate download handler based on type
        if (type === 'playlist') {
            return handlePlaylistDownload(req, res);
        } else if (type === 'audio') {
            return handleAudioDownload(req, res);
        } else {
            return handleVideoDownload(req, res);
        }

    } catch (error) {
        console.error('Error in unified download:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function for video downloads
async function handleVideoDownload(req, res) {
    try {
        const { url, quality = 'highest' } = req.body;
        
        // Get video info first
        const info = await getVideoInfo(url);
        const sanitizedTitle = sanitizeFilename(info.title);
        const filename = `${sanitizedTitle}.%(ext)s`;
        const outputPath = path.join(downloadsDir, filename);

        // Use ONLY combined formats or notify user about quality limitation
        let formatSelector;
        
        // Optimized for speed: Use 720p as default for faster downloads
        if (quality === '360p' || quality === '240p' || quality === '144p') {
            // These have true combined formats - fastest
            formatSelector = '18'; // 360p combined (best available combined)
        } else if (quality === '4k') {
            formatSelector = '313+140/401+140/bestvideo[height<=2160]+bestaudio';
        } else if (quality === '1440p') {
            formatSelector = '271+140/400+140/bestvideo[height<=1440]+bestaudio';
        } else if (quality === '1080p') {
            formatSelector = '137+140/248+140/399+140/bestvideo[height<=1080]+bestaudio';
        } else if (quality === '720p') {
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        } else if (quality === '480p') {
            formatSelector = '135+140/244+140/397+140/bestvideo[height<=480]+bestaudio';
        } else if (quality === 'highest') {
            // For fastest downloads, use 720p instead of highest
            console.log('Using 720p for faster download instead of highest quality');
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        } else {
            // Default: 720p for speed (was 360p)
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        }

        // Download using yt-dlp with proper merging and cleanup
        const command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 --audio-multistreams --no-keep-video --embed-metadata --add-metadata -o "${outputPath}" --no-warnings "${url}"`;
        
        console.log(`Downloading with command: ${command}`);
        
        const childProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Download error:', error);
                if (!res.headersSent) {
                return res.status(500).json({ error: 'Download failed: ' + error.message });
                }
                return;
            }
            
            // Clean up any temporary files
            const cleanupTempFiles = () => {
                try {
                    const allFiles = fs.readdirSync(downloadsDir);
                    const tempFiles = allFiles.filter(file => 
                        file.includes(sanitizedTitle) && (
                            file.includes('.temp') || 
                            file.includes('.part') || 
                            file.includes('.webm') ||
                            file.includes('.m4a') ||
                            file.includes('.f140') ||
                            file.includes('.f313') ||
                            file.includes('.f401') ||
                            file.includes('.f137') ||
                            file.includes('.f136') ||
                            file.includes('.f135') ||
                            file.includes('.f244') ||
                            file.includes('.f247') ||
                            file.includes('.f248') ||
                            file.includes('.f271') ||
                            file.includes('.f398') ||
                            file.includes('.f399') ||
                            file.includes('.f400') ||
                            (file.includes('.mp4') && !file.endsWith('.mp4')) // Remove partial MP4 files
                        )
                    );
                    
                    tempFiles.forEach(tempFile => {
                        try {
                            fs.unlinkSync(path.join(downloadsDir, tempFile));
                            console.log(`Cleaned up temp file: ${tempFile}`);
                        } catch (cleanupError) {
                            console.log(`Could not clean up ${tempFile}:`, cleanupError.message);
                        }
                    });
                } catch (cleanupError) {
                    console.log('Cleanup error:', cleanupError.message);
                }
            };
            
            // Run cleanup multiple times to ensure all files are removed
            setTimeout(cleanupTempFiles, 3000);
            setTimeout(cleanupTempFiles, 5000);
            setTimeout(cleanupTempFiles, 8000);
            
            // Final cleanup - remove ALL files except the final MP4
            setTimeout(() => {
                try {
                    const allFiles = fs.readdirSync(downloadsDir);
                    const finalMP4Files = allFiles.filter(file => 
                        file.startsWith(sanitizedTitle) && file.endsWith('.mp4')
                    );
                    
                    // If we have multiple MP4 files, keep only the largest one (the merged file)
                    if (finalMP4Files.length > 1) {
                        const fileStats = finalMP4Files.map(file => ({
                            name: file,
                            size: fs.statSync(path.join(downloadsDir, file)).size
                        }));
                        
                        // Sort by size (largest first) and remove smaller files
                        fileStats.sort((a, b) => b.size - a.size);
                        
                        // Remove all except the largest file
                        fileStats.slice(1).forEach(file => {
                            try {
                                fs.unlinkSync(path.join(downloadsDir, file.name));
                                console.log(`Removed smaller MP4 file: ${file.name}`);
                            } catch (error) {
                                console.log(`Could not remove ${file.name}:`, error.message);
                            }
                        });
                    }
                    
                    // Remove any remaining non-MP4 files
                    const remainingFiles = allFiles.filter(file => 
                        file.includes(sanitizedTitle) && !file.endsWith('.mp4')
                    );
                    
                    remainingFiles.forEach(file => {
                        try {
                            fs.unlinkSync(path.join(downloadsDir, file));
                            console.log(`Final cleanup removed: ${file}`);
                        } catch (error) {
                            console.log(`Could not remove ${file}:`, error.message);
                        }
                    });
                } catch (error) {
                    console.log('Final cleanup error:', error.message);
                }
            }, 10000); // Wait 10 seconds for all merging to complete
            
            // Find the final MP4 file
            const files = fs.readdirSync(downloadsDir).filter(file => 
                file.startsWith(sanitizedTitle) && file.endsWith('.mp4')
            );
            
            if (files.length > 0) {
                if (!res.headersSent) {
                res.json({
                    success: true,
                    filename: files[0],
                    downloadUrl: `/downloads/${files[0]}`,
                    message: `Successfully downloaded: ${files[0]}`
                });
                }
            } else {
                if (!res.headersSent) {
                res.status(500).json({ error: 'Download completed but MP4 file not found' });
                }
            }
        });
        
        // Handle process timeout
        setTimeout(() => {
            if (childProcess.killed === false) {
                childProcess.kill();
                if (!res.headersSent) {
                res.status(500).json({ error: 'Download timeout after 10 minutes' });
                }
            }
        }, 600000); // 10 minutes timeout

    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ error: error.message });
    }
}

// Helper function for audio downloads
async function handleAudioDownload(req, res) {
    try {
        const { url } = req.body;
        
        // Get video info first
        const info = await getVideoInfo(url);
        const sanitizedTitle = sanitizeFilename(info.title);
        const filename = `${sanitizedTitle}.%(ext)s`;
        const outputPath = path.join(downloadsDir, filename);

        // Download audio using yt-dlp
        const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath}" --no-warnings "${url}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Audio download error:', error);
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Audio download failed' });
                }
                return;
            }
            
            // Find the actual downloaded file
            const files = fs.readdirSync(downloadsDir).filter(file => 
                file.startsWith(sanitizedTitle) && file.endsWith('.mp3')
            );
            
            if (files.length > 0) {
                if (!res.headersSent) {
                    res.json({
                        success: true,
                        filename: files[0],
                        downloadUrl: `/downloads/${files[0]}`
                    });
                }
            } else {
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio download completed but file not found' });
                }
            }
        });

    } catch (error) {
        console.error('Error downloading audio:', error);
        res.status(500).json({ error: error.message });
    }
}

// Helper function for playlist downloads
async function handlePlaylistDownload(req, res) {
    try {
        const { url, quality = 'highest' } = req.body;
        
        // Get playlist info first
        const playlistInfo = await getPlaylistInfo(url);
        const sanitizedTitle = sanitizeFilename(playlistInfo.title);
        const playlistDir = path.join(downloadsDir, sanitizedTitle);
        
        if (!fs.existsSync(playlistDir)) {
            fs.mkdirSync(playlistDir, { recursive: true });
        }

        // Determine quality format - use same system as single videos
        let formatSelector;
        
        // Optimized for speed: Use 720p as default for faster downloads
        if (quality === '360p' || quality === '240p' || quality === '144p') {
            // These have true combined formats - fastest
            formatSelector = '18'; // 360p combined (best available combined)
        } else if (quality === '4k') {
            formatSelector = '313+140/401+140/bestvideo[height<=2160]+bestaudio';
        } else if (quality === '1440p') {
            formatSelector = '271+140/400+140/bestvideo[height<=1440]+bestaudio';
        } else if (quality === '1080p') {
            formatSelector = '137+140/248+140/399+140/bestvideo[height<=1080]+bestaudio';
        } else if (quality === '720p') {
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        } else if (quality === '480p') {
            formatSelector = '135+140/244+140/397+140/bestvideo[height<=480]+bestaudio';
        } else if (quality === 'highest') {
            // For fastest downloads, use 720p instead of highest
            console.log('Using 720p for faster download instead of highest quality');
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        } else {
            // Default: 720p for speed (was 360p)
            formatSelector = '136+140/247+140/398+140/bestvideo[height<=720]+bestaudio';
        }

        // Enhanced playlist download with progress tracking and better cleanup
        const outputPath = path.join(playlistDir, '%(title)s.%(ext)s');
        const command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 --audio-multistreams --no-keep-video --embed-metadata --add-metadata --newline --progress-template "download:%(progress.downloaded_bytes)s/%(progress.total_bytes)s" -o "${outputPath}" --no-warnings "${url}"`;
        
        console.log(`Downloading playlist with command: ${command}`);
        console.log(`Playlist: ${playlistInfo.title} (${playlistInfo.entries.length} videos) in ${quality} quality`);
        
        const childProcess = exec(command, { 
            maxBuffer: 1024 * 1024 * 200 // 200MB buffer for playlist downloads
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('Playlist download error:', error);
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Playlist download failed: ' + error.message });
                }
                return;
            }
            
            // Clean up temporary files after download
            setTimeout(() => {
                try {
                    const allFiles = fs.readdirSync(playlistDir);
                    const tempFiles = allFiles.filter(file => 
                        file.includes('.temp') || file.includes('.part') || 
                        (file.includes('.webm') && !file.endsWith('.mp4')) ||
                        (file.includes('.m4a') && !file.endsWith('.mp4'))
                    );
                    
                    tempFiles.forEach(tempFile => {
                        try {
                            fs.unlinkSync(path.join(playlistDir, tempFile));
                            console.log(`Cleaned up temp file: ${tempFile}`);
                        } catch (cleanupError) {
                            console.log(`Could not clean up ${tempFile}:`, cleanupError.message);
                        }
                    });
                } catch (cleanupError) {
                    console.log('Cleanup error:', cleanupError.message);
                }
            }, 5000); // Wait 5 seconds for merging to complete
            
            // Count downloaded files (only MP4 files)
            const downloadedFiles = fs.readdirSync(playlistDir).filter(file => file.endsWith('.mp4'));
            
            if (!res.headersSent) {
                res.json({
                    success: true,
                    message: `Playlist download completed! Downloaded ${downloadedFiles.length} videos.`,
                    folder: sanitizedTitle,
                    totalVideos: playlistInfo.entries.length,
                    downloadedVideos: downloadedFiles.length,
                    folderPath: playlistDir
                });
            }
        });
        
        // Handle process timeout (30 minutes for playlists)
        setTimeout(() => {
            if (childProcess.killed === false) {
                childProcess.kill();
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Playlist download timeout after 30 minutes' });
                }
            }
        }, 1800000); // 30 minutes timeout

    } catch (error) {
        console.error('Error downloading playlist:', error);
        res.status(500).json({ error: error.message });
    }
}

// Route to download playlist
app.post('/api/download/playlist', async (req, res) => {
    try {
        const { url, quality = 'best' } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Get playlist info first
        const playlistInfo = await getPlaylistInfo(url);
        const sanitizedTitle = sanitizeFilename(playlistInfo.title);
        const playlistDir = path.join(downloadsDir, sanitizedTitle);
        
        if (!fs.existsSync(playlistDir)) {
            fs.mkdirSync(playlistDir, { recursive: true });
        }

        // Determine quality format - support up to 4K with proper video+audio merging
        let formatSelector = 'best[ext=mp4]/best';
        if (quality === '4k') formatSelector = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[height<=2160]';
        else if (quality === '1440p') formatSelector = 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]';
        else if (quality === '1080p') formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]';
        else if (quality === '720p') formatSelector = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]';
        else if (quality === '480p') formatSelector = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]';
        else if (quality === '360p') formatSelector = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]';
        else if (quality === 'highest') formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';

        // Download playlist using yt-dlp with forced merging
        const outputPath = path.join(playlistDir, '%(title)s.%(ext)s');
        const command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" --no-warnings "${url}"`;
        
        console.log(`Downloading playlist with command: ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Playlist download error:', error);
                if (!res.headersSent) {
                return res.status(500).json({ error: 'Playlist download failed' });
                }
                return;
            }
            
            if (!res.headersSent) {
            res.json({
                success: true,
                message: 'Playlist download completed',
                folder: sanitizedTitle
            });
            }
        });

    } catch (error) {
        console.error('Error downloading playlist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to download audio only
app.post('/api/download/audio', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Get video info first
        const info = await getVideoInfo(url);
        const sanitizedTitle = sanitizeFilename(info.title);
        const filename = `${sanitizedTitle}.%(ext)s`;
        const outputPath = path.join(downloadsDir, filename);

        // Download audio using yt-dlp
        const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath}" --no-warnings "${url}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Audio download error:', error);
                if (!res.headersSent) {
                return res.status(500).json({ error: 'Audio download failed' });
                }
                return;
            }
            
            // Find the actual downloaded file
            const files = fs.readdirSync(downloadsDir).filter(file => 
                file.startsWith(sanitizedTitle) && file.endsWith('.mp3')
            );
            
            if (files.length > 0) {
                if (!res.headersSent) {
                res.json({
                    success: true,
                    filename: files[0],
                    downloadUrl: `/downloads/${files[0]}`
                });
                }
            } else {
                if (!res.headersSent) {
                res.status(500).json({ error: 'Audio download completed but file not found' });
                }
            }
        });

    } catch (error) {
        console.error('Error downloading audio:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to get downloads path
app.get('/api/downloads-path', (req, res) => {
    res.json({ 
        downloadsPath: downloadsDir,
        platform: os.platform(),
        homeDir: os.homedir()
    });
});

// Route to get available formats
app.post('/api/formats', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Get detailed formats using yt-dlp
        const command = `yt-dlp -F --no-warnings "${url}"`;
        const { stdout } = await execPromise(command);
        
        console.log('Available formats for:', url);
        console.log(stdout);
        
        // Parse the formats from yt-dlp output
        const lines = stdout.split('\n');
        const formatLines = lines.filter(line => 
            line.match(/^\d+/) && (line.includes('mp4') || line.includes('webm') || line.includes('m4a'))
        );
        
        const parsedFormats = formatLines.map(line => {
            const parts = line.trim().split(/\s+/);
            const formatId = parts[0];
            const ext = parts[1];
            const resolution = parts[2] || 'audio only';
            const hasAudio = line.includes('audio only') || !line.includes('video only');
            
            return {
                formatId,
                ext,
                resolution,
                hasAudio,
                fullLine: line.trim()
            };
        });
        
        // Standard quality options
        const formats = [
            { quality: 'Highest Quality', container: 'best', codecs: 'best available with audio' },
            { quality: '4K (2160p)', container: 'mp4', codecs: 'video+audio merged' },
            { quality: '1440p (2K)', container: 'mp4', codecs: 'video+audio merged' },
            { quality: '1080p (Full HD)', container: 'mp4', codecs: 'video+audio merged' },
            { quality: '720p (HD)', container: 'mp4', codecs: 'video+audio merged' },
            { quality: '480p', container: 'mp4', codecs: 'video+audio merged' },
            { quality: '360p', container: 'mp4', codecs: 'video+audio (guaranteed)' }
        ];

        res.json({ 
            formats,
            availableFormats: parsedFormats,
            rawOutput: stdout
        });
    } catch (error) {
        console.error('Error getting formats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'YouTube Downloader API Server is running!', port: PORT });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
