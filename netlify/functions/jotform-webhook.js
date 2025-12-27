// netlify/functions/jotform-webhook.js
const crypto = require('crypto');

// Simple in-memory storage (use database for production)
const submissions = new Map();

// Cleanup old submissions after 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of submissions.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) {
      submissions.delete(token);
    }
  }
}, 60 * 60 * 1000);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // POST - Receive webhook from Jotform
  if (event.httpMethod === 'POST') {
    try {
      console.log('=== JOTFORM WEBHOOK ===');
      console.log('Content-Type:', event.headers['content-type']);

      // Jotform sends data as application/x-www-form-urlencoded
      // The body is a giant URL-encoded string
      
      // Decode the URL-encoded body manually
      const decoded = decodeURIComponent(event.body);
      console.log('Decoded body (first 500 chars):', decoded.substring(0, 500));
      
      // Try to parse as JSON
      let rawData;
      try {
        rawData = JSON.parse(decoded);
      } catch (e) {
        console.log('Not direct JSON, trying to extract JSON...');
        
        // Sometimes Jotform wraps it - look for JSON structure
        const jsonMatch = decoded.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not find JSON in body');
        }
      }

      console.log('Parsed submission data');
      console.log('Submission ID:', rawData.submissionID);
      console.log('Form ID:', rawData.formID);

      const submissionID = rawData.submissionID;
      const formID = rawData.formID;
      
      // Find file upload fields and returnUrl
      let frontURL = '';
      let backURL = '';
      let returnUrl = '';
      
      // Iterate through all fields in the submission
      Object.keys(rawData).forEach(key => {
        const field = rawData[key];
        
        if (!field || typeof field !== 'object') return;
        
        const name = (field.name || '').toLowerCase();
        const answer = field.answer;
        
        console.log(`Field ${key}: name="${name}", type="${field.type}"`);
        
        // Check for returnUrl field
        if (name === 'returnurl' || key === 'returnurl') {
          returnUrl = answer || field.text || '';
          console.log('Found returnUrl:', returnUrl);
        }
        
        // Check for file uploads
        if (field.type === 'control_fileupload' && answer) {
          const fileUrl = Array.isArray(answer) ? answer[0] : answer;
          
          if (typeof fileUrl === 'string' && fileUrl.includes('jotform.com')) {
            if (name.includes('front') || name.includes('upload front')) {
              frontURL = fileUrl;
              console.log('Found front file:', fileUrl.substring(0, 80));
            } else if (name.includes('back')) {
              backURL = fileUrl;
              console.log('Found back file:', fileUrl.substring(0, 80));
            }
          }
        }
      });

      console.log('Extracted:', { frontURL: !!frontURL, backURL: !!backURL, returnUrl: !!returnUrl });

      if (!returnUrl) {
        console.error('❌ Missing returnUrl!');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing returnUrl field' })
        };
      }

      // Generate token
      const token = crypto.randomBytes(16).toString('hex');
      
      // Store submission
      submissions.set(token, {
        submissionID,
        formID,
        frontURL,
        backURL,
        timestamp: Date.now()
      });

      console.log('✅ Stored submission with token:', token);
      console.log('Total submissions in memory:', submissions.size);

      // Redirect back to product page with token
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set('artwork_token', token);

      console.log('Redirecting to:', redirectUrl.toString());

      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': redirectUrl.toString()
        },
        body: ''
      };

    } catch (error) {
      console.error('❌ Webhook error:', error);
      console.error('Stack:', error.stack);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: error.message,
          stack: error.stack
        })
      };
    }
  }

  // GET - Fetch submission by token
  if (event.httpMethod === 'GET') {
    const token = event.queryStringParameters?.token;
    
    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing token parameter' })
      };
    }

    const submission = submissions.get(token);
    
    if (!submission) {
      console.log('Token not found:', token);
      console.log('Available tokens:', Array.from(submissions.keys()));
      
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Submission not found' })
      };
    }

    console.log('✅ Retrieved submission for token:', token);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(submission)
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
