// Netlify Function: netlify/functions/convert-image.js
// This function downloads the Jotform image and converts it to base64

const fetch = require('node-fetch');

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

    // Fetch the image from Jotform
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Get the image as a buffer
    const buffer = await response.buffer();
    
    // Get content type
    const contentType = response.headers.get('content-type') || 'image/png';
    
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
