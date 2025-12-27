// netlify/functions/jotform-webhook.js
const crypto = require('crypto');

// In-memory storage (replace with database for production)
const submissions = new Map();

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
      const rawData = JSON.parse(event.body);
      console.log('Received Jotform webhook:', rawData);

      // Extract submission data
      const submissionID = rawData.submissionID;
      const formID = rawData.formID;
      
      // Find file upload fields
      let frontURL = '';
      let backURL = '';
      
      // Jotform sends form data as an object with question IDs as keys
      Object.keys(rawData).forEach(key => {
        const field = rawData[key];
        
        // Check if it's a file upload field
        if (field && typeof field === 'object' && field.url) {
          const fieldName = field.name || '';
          
          if (/front/i.test(fieldName)) {
            frontURL = field.url;
          } else if (/back/i.test(fieldName)) {
            backURL = field.url;
          }
        }
      });

      // Get returnUrl from hidden field or construct it
      const returnUrl = rawData.returnUrl || rawData.q_returnUrl;
      
      if (!returnUrl) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing returnUrl' })
        };
      }

      // Generate token for this submission
      const token = crypto.randomBytes(16).toString('hex');
      
      // Store submission data
      submissions.set(token, {
        submissionID,
        formID,
        frontURL,
        backURL,
        timestamp: Date.now()
      });

      console.log('Stored submission:', token, { frontURL, backURL });

      // Redirect back to product page with token
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set('artwork_token', token);

      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': redirectUrl.toString()
        },
        body: ''
      };

    } catch (error) {
      console.error('Webhook error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error.message })
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
        body: JSON.stringify({ error: 'Missing token' })
      };
    }

    const submission = submissions.get(token);
    
    if (!submission) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Submission not found' })
      };
    }

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
