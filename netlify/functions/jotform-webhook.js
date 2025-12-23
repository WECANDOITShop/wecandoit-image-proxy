// netlify/functions/jotform-webhook.js
// Handles Jotform submissions and stores artwork data

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Webhook received');
    
    // Parse the form data from Jotform
    const body = JSON.parse(event.body);
    const rawFormData = body.rawRequest || '';
    
    // Parse the raw form data (Jotform sends it as URL-encoded)
    const formData = new URLSearchParams(rawFormData);
    
    // Extract the data we need
    const returnUrl = formData.get('returnUrl') || '';
    const uploadedFile = formData.get('q3_uploadFront') || formData.get('q3') || '';
    
    console.log('Return URL:', returnUrl);
    console.log('Uploaded file:', uploadedFile.substring(0, 100));
    
    if (!returnUrl) {
      throw new Error('No return URL provided');
    }
    
    if (!uploadedFile) {
      throw new Error('No file uploaded');
    }
    
    // Parse the uploaded file (Jotform returns it as a URL or JSON string)
    let fileUrl = uploadedFile;
    
    // If it's a JSON string with file info, parse it
    if (uploadedFile.startsWith('[') || uploadedFile.startsWith('{')) {
      try {
        const parsed = JSON.parse(uploadedFile);
        if (Array.isArray(parsed) && parsed.length > 0) {
          fileUrl = parsed[0];
        } else if (parsed.url) {
          fileUrl = parsed.url;
        }
      } catch (e) {
        console.log('Not JSON, using as-is');
      }
    }
    
    console.log('File URL:', fileUrl);
    
    // Determine if this is front or back based on form ID
    const submissionId = body.submissionID || '';
    const formId = body.formID || '';
    const isFrontForm = formId === '253427435509157';
    const param = isFrontForm ? 'front' : 'back';
    
    console.log('Form ID:', formId);
    console.log('Is front form:', isFrontForm);
    
    // Build the redirect URL
    const redirectUrl = new URL(decodeURIComponent(returnUrl));
    redirectUrl.searchParams.set(param, fileUrl);
    redirectUrl.searchParams.set('jotform_submission', submissionId);
    
    const finalUrl = redirectUrl.toString();
    console.log('Redirecting to:', finalUrl.substring(0, 150));
    
    // Return a redirect response
    return {
      statusCode: 302,
      headers: {
        ...headers,
        'Location': finalUrl
      },
      body: JSON.stringify({
        message: 'Redirecting...',
        url: finalUrl
      })
    };
    
  } catch (error) {
    console.error('Webhook error:', error);
    
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
