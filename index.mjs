import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multiple API endpoints to try
const API_ENDPOINTS = [
  'https://tikwm.com/api/',
  'https://www.tikwm.com/api/',
  'https://api.tikwm.com/video/info',
  'https://tikdown.org/api/ajaxSearch',
  'https://musicaldown.com/download'
];

async function testNetworkConnectivity() {
  console.log('🔍 Testing network connectivity...');
  
  try {
    // Test with a reliable service first
    const testResponse = await fetch('https://httpbin.org/status/200', { 
      signal: AbortSignal.timeout(5000) 
    });
    if (testResponse.ok) {
      console.log('✅ Internet connection is working');
      return true;
    }
  } catch (error) {
    console.log('❌ Network connectivity test failed:', error.message);
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
      console.log(`🔄 Trying: ${apiUrl}`);
      
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!res.ok) {
        console.log(`❌ ${apiUrl} returned ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      
      if (data.data && data.data.play) {
        return {
          videoUrl: data.data.play,
          title: data.data.title || 'tiktok_video'
        };
      }
      
      console.log(`❌ ${apiUrl} returned invalid data structure`);
    } catch (error) {
      console.log(`❌ ${apiUrl} failed:`, error.message);
    }
  }
  
  return null;
}

async function tryAlternativeAPI(url) {
  try {
    console.log('🔄 Trying alternative API method...');
    
    // Extract video ID from URL
    const videoIdMatch = url.match(/video\/(\d+)/);
    if (!videoIdMatch) {
      throw new Error('Could not extract video ID from URL');
    }
    
    const videoId = videoIdMatch[1];
    
    // Try a different approach - sometimes direct video URLs work
    const possibleVideoUrls = [
      `https://v16-webapp.tiktok.com/video/tos/maliva/${videoId}/`,
      `https://v19-webapp.tiktok.com/video/tos/maliva/${videoId}/`
    ];
    
    for (const testUrl of possibleVideoUrls) {
      try {
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok && response.headers.get('content-type')?.includes('video')) {
          return {
            videoUrl: testUrl,
            title: `tiktok_${videoId}`
          };
        }
      } catch (e) {
        // Continue to next URL
      }
    }
    
    return null;
  } catch (error) {
    console.log('❌ Alternative API method failed:', error.message);
    return null;
  }
}

async function downloadTikTok(url) {
  try {
    console.log(`🔍 Fetching video info for: ${url}`);
    
    // Test network connectivity first
    const networkOk = await testNetworkConnectivity();
    if (!networkOk) {
      console.error('❌ Network connectivity issues detected. Please check your internet connection.');
      return;
    }
    
    // Try TikWm API first
    let videoData = await tryTikWmAPI(url);
    
    // If TikWm fails, try alternative methods
    if (!videoData) {
      console.log('🔄 Primary API failed, trying alternative methods...');
      videoData = await tryAlternativeAPI(url);
    }
    
    if (!videoData) {
      console.error('❌ All API methods failed. The video might be private, deleted, or the APIs are down.');
      console.log('💡 Suggestions:');
      console.log('   1. Check if the TikTok URL is correct and accessible');
      console.log('   2. Try again later (APIs might be temporarily down)');
      console.log('   3. Use a VPN if you suspect geo-blocking');
      console.log('   4. Try a different TikTok downloader tool');
      return;
    }
    
    const { videoUrl, title } = videoData;
    console.log(`📹 Video URL found: ${videoUrl}`);
    
    // Generate filename
    const videoId = url.match(/video\/(\d+)/)?.[1] || 'tiktok_video';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
    const fileName = path.join(__dirname, `${sanitizedTitle}_${videoId}.mp4`);
    
    console.log(`⬇️ Downloading to: ${fileName}`);
    
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
    
    console.log(`✅ Successfully downloaded: ${fileName}`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timed out. The server might be slow or unresponsive.');
    } else if (error.code === 'ENOTFOUND') {
      console.error("🌐 DNS resolution failed. Try using a different DNS server (8.8.8.8 or 1.1.1.1)");
    } else if (error.code === 'ECONNREFUSED') {
      console.error("🚫 Connection refused. The server might be blocking your requests.");
    }
  }
}

const inputUrl = process.argv[2];
if (!inputUrl) {
  console.log("Usage: node index.mjs \"<tiktok-url>\"");
  console.log("Example: node index.mjs \"https://www.tiktok.com/@user/video/1234567890\"");
  process.exit(1);
}

// Validate TikTok URL format
if (!inputUrl.includes('tiktok.com')) {
  console.error("❌ Please provide a valid TikTok URL");
  process.exit(1);
}

downloadTikTok(inputUrl);
