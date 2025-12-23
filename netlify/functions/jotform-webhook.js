// netlify/functions/jotform-webhook.js
// Updated to handle Jotform's actual data format

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'text/html'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('=== Webhook received ===');
    console.log('Method:', event.httpMethod);
    console.log('Headers:', JSON.stringify(event.headers));
    console.log('Body (first 500 chars):', event.body ? event.body.substring(0, 500) : 'empty');
    
    // Jotform sends data as URL-encoded form data, not JSON
    const formData = new URLSearchParams(event.body);
    
    // Log all parameters
    console.log('Form parameters:');
    for (const [key, value] of formData.entries()) {
      const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
      console.log(`  ${key}: ${displayValue}`);
    }
    
    // Get returnUrl - it might be in rawRequest or as a direct parameter
    let returnUrl = formData.get('returnUrl') || '';
    
    // If returnUrl is in rawRequest, parse it
    if (!returnUrl) {
      const rawRequest = formData.get('rawRequest') || '';
      if (rawRequest) {
        const rawParams = new URLSearchParams(rawRequest);
        returnUrl = rawParams.get('returnUrl') || '';
      }
    }
    
    console.log('Return URL:', returnUrl);
    
    if (!returnUrl) {
      throw new Error('No returnUrl found in webhook data');
    }
    
    // Find the upload field - try various possible field names
    const possibleFields = [
      'q3_uploadFront',
      'q3_upload',
      'q3',
      'q4_uploadFront',
      'q4_upload',
      'q4',
      'uploadFront',
      'upload'
    ];
    
    let fileUrl = null;
    let foundField = null;
    
    for (const fieldName of possibleFields) {
      const value = formData.get(fieldName);
      if (value) {
        console.log(`Found upload field: ${fieldName} = ${value.substring(0, 200)}`);
        fileUrl = value;
        foundField = fieldName;
        break;
      }
    }
    
    // Also check rawRequest
    if (!fileUrl) {
      const rawRequest = formData.get('rawRequest') || '';
      if (rawRequest) {
        const rawParams = new URLSearchParams(rawRequest);
        for (const fieldName of possibleFields) {
          const value = rawParams.get(fieldName);
          if (value) {
            console.log(`Found upload field in rawRequest: ${fieldName} = ${value.substring(0, 200)}`);
            fileUrl = value;
            foundField = fieldName;
            break;
          }
        }
      }
    }
    
    if (!fileUrl) {
      console.error('No upload field found. Available fields:', Array.from(formData.keys()));
      throw new Error('No file uploaded - could not find upload field');
    }
    
    // Parse the file URL if it's JSON or an array
    if (fileUrl.startsWith('[') || fileUrl.startsWith('{')) {
      try {
        const parsed = JSON.parse(fileUrl);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Take the first item in the array
          fileUrl = typeof parsed[0] === 'string' ? parsed[0] : parsed[0].url || parsed[0].path;
        } else if (parsed.url) {
          fileUrl = parsed.url;
        } else if (parsed.path) {
          fileUrl = parsed.path;
        }
      } catch (e) {
        console.log('Not JSON, using value as-is');
      }
    }
    
    // If it's still just a filename, we need to construct the full URL
    if (!fileUrl.startsWith('http')) {
      // Get submission ID to potentially construct URL
      const submissionId = formData.get('submissionID') || formData.get('submission_id') || '';
      const formId = formData.get('formID') || '253427435509157';
      
      console.warn('File URL is not complete. Filename:', fileUrl);
      console.log('Submission ID:', submissionId);
      
      // Try to construct the full Jotform URL
      // Format: https://www.jotform.com/uploads/ACCOUNT/FORMID/SUBMISSIONID/FILENAME
      if (submissionId) {
        fileUrl = `https://www.jotform.com/uploads/WECANDOIT_admin/${formId}/${submissionId}/${fileUrl}`;
        console.log('Constructed URL:', fileUrl);
      } else {
        throw new Error('Cannot construct full file URL - no submission ID');
      }
    }
    
    console.log('Final file URL:', fileUrl);
    
    // Determine if front or back
    const formId = formData.get('formID') || '';
    const isFrontForm = formId === '253427435509157';
    const param = isFrontForm ? 'front' : 'back';
    
    console.log('Form ID:', formId);
    console.log('Parameter name:', param);
    
    // Build redirect URL
    const redirectUrl = new URL(decodeURIComponent(returnUrl));
    redirectUrl.searchParams.set(param, fileUrl);
    redirectUrl.searchParams.set('jotform_webhook', '1');
    
    const finalUrl = redirectUrl.toString();
    console.log('Redirecting to:', finalUrl.substring(0, 200));
    
    // Return HTML with meta refresh (more reliable than 302)
    return {
      statusCode: 200,
      headers,
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="refresh" content="0; url=${finalUrl}">
          <title>Redirecting...</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
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
            h2 { color: #333; margin: 0 0 10px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Upload Successful!</h2>
            <p>Redirecting back to your product...</p>
          </div>
          <script>
            // Fallback redirect in case meta refresh fails
            setTimeout(function() {
              window.location.href = ${JSON.stringify(finalUrl)};
            }, 100);
          </script>
        </body>
        </html>
      `
    };
    
  } catch (error) {
    console.error('=== Webhook error ===');
    console.error('Error message:', error.message);
    console.error('Stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Upload Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              max-width: 600px;
              margin: 0 auto;
            }
            .error {
              background: #ffebee;
              border-left: 4px solid #e74c3c;
              padding: 20px;
              border-radius: 4px;
            }
            h2 { color: #e74c3c; margin-top: 0; }
            pre {
              background: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Upload Error</h2>
            <p><strong>Error:</strong> ${error.message}</p>
            <p>Please try uploading again or contact support if the problem persists.</p>
            <pre>${error.stack}</pre>
          </div>
        </body>
        </html>
      `
    };
  }
};
