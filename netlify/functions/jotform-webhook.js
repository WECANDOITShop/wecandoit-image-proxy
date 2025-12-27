// netlify/functions/jotform-webhook.js
const crypto = require('crypto');
const querystring = require('querystring');

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
}, 60 * 60 * 1000); // Run every hour

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
      console.log('Received webhook, content-type:', event.headers['content-type']);
      console.log('Body (first 200 chars):', event.body.substring(0, 200));

      let rawData;
      
      // Jotform sends form-encoded data, not JSON
      if (event.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        const parsed = querystring.parse(event.body);
        // Jotform wraps everything in 'rawRequest' parameter
        rawData = JSON.parse(parsed.rawRequest || '{}');
      } else {
        rawData = JSON.parse(event.body);
      }

      console.log('Parsed data keys:', Object.keys(rawData));

      const submissionID = rawData.submissionID;
      const formID = rawData.formID;
      
      console.log('Submission ID:', submissionID);
      console.log('Form ID:', formID);

      // Find file upload fields and other data
      let frontURL = '';
      let backURL = '';
      let returnUrl = '';
      
      // Jotform sends answers as an object with question IDs as keys
      Object.keys(rawData).forEach(key => {
        const answer = rawData[key];
        
        // Skip if not an answer object
        if (!answer || typeof answer !== 'object') return;
        
        const name = (answer.name || '').toLowerCase();
        const text = (answer.text || '').toLowerCase();
        const prettyFormat = (answer.prettyFormat || '').toLowerCase();
        
        console.log(`Field ${key}:`, { name, text, type: answer.type });
        
        // Check for file uploads
        if (answer.type === 'control_fileupload' || answer.answer) {
          // File upload field - answer is a URL or array of URLs
          const fileUrl = Array.isArray(answer.answer) ? answer.answer[0] : answer.answer;
          
          if (fileUrl && typeof fileUrl === 'string') {
            if (name.includes('front') || text.includes('front')) {
              frontURL = fileUrl;
              console.log('Found front URL:', fileUrl);
            } else if (name.includes('back') || text.includes('back')) {
              backURL = fileUrl;
              console.log('Found back URL:', fileUrl);
            }
          }
        }
        
        // Check for returnUrl hidden field
        if (answer.answer && typeof answer.answer === 'string') {
          if (name.includes('returnurl') || answer.answer.includes('wecandoitshop.com')) {
            returnUrl = answer.answer;
            console.log('Found returnUrl:', returnUrl);
          }
        }
      });

      console.log('Extracted:', { frontURL, backURL, returnUrl });

      if (!returnUrl) {
        console.error('Missing returnUrl!');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing returnUrl' })
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
