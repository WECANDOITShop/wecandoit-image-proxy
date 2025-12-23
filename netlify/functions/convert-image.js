// netlify/functions/convert-image.js
// No dependencies version - uses built-in Node.js modules only

const https = require('https');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get image URL from query parameter
    const params = event.queryStringParameters || {};
    const imageUrl = params.url;

    if (!imageUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing url parameter',
          usage: '/.netlify/functions/convert-image?url=IMAGE_URL'
        })
      };
    }

    // Validate it's a Jotform URL
    if (!imageUrl.includes('jotform.com')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Only Jotform URLs are allowed' 
        })
      };
    }

    console.log('Fetching image:', imageUrl);

    // Fetch the image using native https module
    const buffer = await fetchImage(imageUrl);
    
    // Detect content type from URL or default to PNG
    const contentType = imageUrl.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : 'image/png';
    
    // Convert to base64
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    console.log('Success! Converted:', buffer.length, 'bytes to', dataUrl.length, 'chars');

    // Return the base64 data URL
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dataUrl: dataUrl,
        originalSize: buffer.length,
        base64Size: dataUrl.length,
        contentType: contentType
      })
    };

  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

/**
 * Fetch image using native https module (no dependencies needed)
 */
function fetchImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log('Following redirect to:', redirectUrl);
        return resolve(fetchImage(redirectUrl));
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
      
      response.on('error', (error) => {
        reject(error);
      });
      
    }).on('error', (error) => {
      reject(error);
    });
  });
}
