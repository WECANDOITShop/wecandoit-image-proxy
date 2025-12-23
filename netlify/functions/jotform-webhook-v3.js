// netlify/functions/jotform-webhook.js
// Version 3: Extract returnUrl from Jotform's slug parameter

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/html'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('=== Webhook received ===');
    
    // Parse form data
    const formData = new URLSearchParams(event.body);
    
    // Log all parameters for debugging
    console.log('All parameters:');
    for (const [key, value] of formData.entries()) {
      const display = value.length > 200 ? value.substring(0, 200) + '...' : value;
      console.log(`  ${key}: ${display}`);
    }
    
    // Get form metadata
    const formId = formData.get('formID') || '';
    const submissionId = formData.get('submissionID') || '';
    
    console.log('Form ID:', formId);
    console.log('Submission ID:', submissionId);
    
    // Try to get returnUrl from multiple sources
    let returnUrl = null;
    
    // Method 1: Direct parameter
    returnUrl = formData.get('returnUrl');
    if (returnUrl) console.log('Found returnUrl in direct params');
    
    // Method 2: In rawRequest
    if (!returnUrl) {
      const rawRequest = formData.get('rawRequest') || '';
      if (rawRequest) {
        const rawParams = new URLSearchParams(rawRequest);
        returnUrl = rawParams.get('returnUrl');
        if (returnUrl) console.log('Found returnUrl in rawRequest');
      }
    }
    
    // Method 3: In slug (Jotform sometimes puts iframe params here)
    if (!returnUrl) {
      const slug = formData.get('slug') || '';
      if (slug) {
        const match = slug.match(/returnUrl=([^&]+)/);
        if (match) {
          returnUrl = decodeURIComponent(match[1]);
          console.log('Found returnUrl in slug');
        }
      }
    }
    
    // Method 4: Check if it's embedded in any other field
    if (!returnUrl) {
      for (const [key, value] of formData.entries()) {
        if (value && value.includes('wecandoitshop.com')) {
          console.log(`Found URL-like value in ${key}:`, value.substring(0, 100));
          // Try to extract it
          const urlMatch = value.match(/(https?:\/\/[^\s"']+)/);
          if (urlMatch) {
            returnUrl = urlMatch[1];
            console.log('Extracted URL from', key);
            break;
          }
        }
      }
    }
    
    if (!returnUrl) {
      throw new Error('No returnUrl found. Please check Squarespace iframe is passing ?returnUrl= parameter');
    }
    
    console.log('Return URL:', returnUrl);
    
    // Find uploaded file
    const possibleFields = [
      'q3_uploadFront', 'q3_upload', 'q3',
      'q4_uploadFront', 'q4_upload', 'q4',
      'q5_uploadFront', 'q5_upload', 'q5'
    ];
    
    let fileUrl = null;
    
    for (const field of possibleFields) {
      const value = formData.get(field);
      if (value) {
        console.log(`Found file in ${field}:`, value.substring(0, 100));
        fileUrl = value;
        break;
      }
    }
    
    if (!fileUrl) {
      // Also check rawRequest
      const rawRequest = formData.get('rawRequest') || '';
      if (rawRequest) {
        const rawParams = new URLSearchParams(rawRequest);
        for (const field of possibleFields) {
          const value = rawParams.get(field);
          if (value) {
            console.log(`Found file in rawRequest.${field}:`, value.substring(0, 100));
            fileUrl = value;
            break;
          }
        }
      }
    }
    
    if (!fileUrl) {
      throw new Error('No file uploaded');
    }
    
    // Parse file URL if needed
    if (fileUrl.startsWith('[') || fileUrl.startsWith('{')) {
      try {
        const parsed = JSON.parse(fileUrl);
        if (Array.isArray(parsed) && parsed.length > 0) {
          fileUrl = typeof parsed[0] === 'string' ? parsed[0] : (parsed[0].url || parsed[0]);
        }
      } catch (e) {
        console.log('Not JSON array');
      }
    }
    
    // If still not a full URL, construct it
    if (!fileUrl.startsWith('http')) {
      if (submissionId && formId) {
        fileUrl = `https://www.jotform.com/uploads/WECANDOIT_admin/${formId}/${submissionId}/${fileUrl}`;
        console.log('Constructed URL:', fileUrl);
      } else {
        throw new Error('Cannot construct file URL - missing submission ID');
      }
    }
    
    console.log('File URL:', fileUrl);
    
    // Determine front or back
    const isFrontForm = formId === '253427435509157';
    const param = isFrontForm ? 'front' : 'back';
    
    // Build redirect
    const redirectUrl = new URL(decodeURIComponent(returnUrl));
    redirectUrl.searchParams.set(param, fileUrl);
    
    const finalUrl = redirectUrl.toString();
    console.log('Redirecting to:', finalUrl.substring(0, 200));
    
    // Return redirect page
    return {
      statusCode: 200,
      headers,
      body: `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${finalUrl}">
  <title>Upload Complete</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .box {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>✅ Upload Successful!</h2>
    <p>Redirecting back to product...</p>
  </div>
  <script>
    setTimeout(() => window.location.href = ${JSON.stringify(finalUrl)}, 100);
  </script>
</body>
</html>
      `
    };
    
  } catch (error) {
    console.error('=== Error ===');
    console.error(error.message);
    console.error(error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h2>Upload Error</h2>
  <p>${error.message}</p>
  <p>Check Netlify logs for details.</p>
</body>
</html>
      `
    };
  }
};
