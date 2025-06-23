import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import http from 'http';
import { parse } from 'url';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your existing TikTok download functions
async function testNetworkConnectivity() {
  try {
    const testResponse = await fetch('https://httpbin.org/status/200', { 
      signal: AbortSignal.timeout(5000) 
    });
    return testResponse.ok;
  } catch (error) {
    return false;
  }
}

async function tryTikWmAPI(url) {
  const endpoints = [
    `https://tikwm.com/api/?url=${encodeURIComponent(url)}`,
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
  ];
  
  for (const apiUrl of endpoints) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!res.ok) continue;
      
      const data = await res.json();
      
      if (data.data && data.data.play) {
        return {
          videoUrl: data.data.play,
          title: data.data.title || 'tiktok_video'
        };
      }
      
      // Check for specific error messages
      if (data.msg) {
        if (data.msg.includes('private') || data.msg.includes('friends')) {
          return 'PRIVATE';
        } else if (data.msg.includes('not found') || data.msg.includes('deleted')) {
          return 'NOT_FOUND';
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return null;
}

async function downloadTikTokVideo(url, downloadPath = __dirname) {
  try {
    // Test network connectivity first
    const networkOk = await testNetworkConnectivity();
    if (!networkOk) {
      throw new Error('Network connectivity issues detected');
    }
    
    // Try TikWm API
    let videoData = await tryTikWmAPI(url);
    
    // Handle privacy restrictions
    if (videoData === 'PRIVATE') {
      throw new Error('This video is private or friends-only and cannot be downloaded');
    }
    
    if (videoData === 'NOT_FOUND') {
      throw new Error('Video not found. It may have been deleted or the URL is incorrect');
    }
    
    if (!videoData) {
      throw new Error('Failed to fetch video data from all APIs');
    }
    
    const { videoUrl, title } = videoData;
    
    // Generate filename
    const videoId = url.match(/video\/(\d+)/)?.[1] || 'tiktok_video';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
    const fileName = path.join(downloadPath, `${sanitizedTitle}_${videoId}.mp4`);
    
    // Download video
    const videoRes = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!videoRes.ok) {
      throw new Error(`Video download failed: ${videoRes.status} ${videoRes.statusText}`);
    }
    
    const fileStream = fs.createWriteStream(fileName);
    await pipeline(videoRes.body, fileStream);
    
    return {
      success: true,
      fileName: path.basename(fileName),
      fullPath: fileName,
      title: title
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Web server
const server = http.createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Serve HTML page
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('HTML file not found. Make sure index.html exists in the same directory.');
    }
    return;
  }
  
  // Handle download API
  if (pathname === '/api/download' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { urls, downloadPath } = data;
        
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No URLs provided' }));
          return;
        }
        
        // Validate and create download directory
        let targetPath = downloadPath || path.join(__dirname, 'downloads');
        
        if (!fs.existsSync(targetPath)) {
          try {
            fs.mkdirSync(targetPath, { recursive: true });
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Cannot create download directory: ' + error.message }));
            return;
          }
        }
        
        // Download all videos
        const results = [];
        for (const url of urls) {
          if (url.trim() && url.includes('tiktok.com')) {
            const result = await downloadTikTokVideo(url.trim(), targetPath);
            results.push({
              url: url.trim(),
              ...result
            });
          } else {
            results.push({
              url: url.trim(),
              success: false,
              error: 'Invalid TikTok URL'
            });
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error: ' + error.message }));
      }
    });
    
    return;
  }
  
  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 TikTok Downloader Web Interface running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://127.0.0.1:${PORT}`);
  console.log(`\n📁 Default download location: ${path.join(__dirname, 'downloads')}`);
  console.log(`\n🛑 Press Ctrl+C to stop the server`);
});
