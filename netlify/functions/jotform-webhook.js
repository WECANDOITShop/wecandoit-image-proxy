// netlify/functions/jotform-webhook.js
const crypto = require('crypto');
const querystring = require('querystring');

// Simple in-memory storage
const submissions = new Map();

// Cleanup old submissions
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
      console.log('Body length:', event.body ? event.body.length : 0);

      let rawData = null;

      // METHOD 1: Try parsing event.body as querystring (most common)
      try {
        const parsed = querystring.parse(event.body);
        console.log('Method 1 - Querystring parsed keys:', Object.keys(parsed));
        
        if (parsed.rawRequest) {
          console.log('Found rawRequest in querystring');
          rawData = JSON.parse(parsed.rawRequest);
          console.log('✅ Method 1 SUCCESS');
        }
      } catch (e) {
        console.log('Method 1 failed:', e.message);
      }

      // METHOD 2: Try direct JSON parse
      if (!rawData) {
        try {
          rawData = JSON.parse(event.body);
          console.log('✅ Method 2 SUCCESS - Direct JSON');
        } catch (e) {
          console.log('Method 2 failed:', e.message);
        }
      }

      // METHOD 3: Try decoding then parsing
      if (!rawData) {
        try {
          const decoded = decodeURIComponent(event.body);
          rawData = JSON.parse(decoded);
          console.log('✅ Method 3 SUCCESS - Decoded JSON');
        } catch (e) {
          console.log('Method 3 failed:', e.message);
        }
      }

      // METHOD 4: Look for JSON anywhere in the body
      if (!rawData) {
        try {
          const jsonMatch = event.body.match(/\{[\s\S]*"submissionID"[\s\S]*\}/);
          if (jsonMatch) {
            rawData = JSON.parse(jsonMatch[0]);
            console.log('✅ Method 4 SUCCESS - Extracted JSON from body');
          }
        } catch (e) {
          console.log('Method 4 failed:', e.message);
        }
      }

      if (!rawData) {
        console.error('❌ All parsing methods failed');
        console.log('Body preview:', event.body.substring(0, 500));
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Could not parse submission data' })
        };
      }

      console.log('✅ Successfully parsed submission data');
      console.log('Submission ID:', rawData.submissionID);
      console.log('Form ID:', rawData.formID);

      const submissionID = rawData.submissionID;
      const formID = rawData.formID;
      
      // Extract file URLs and returnUrl
      let frontURL = '';
      let backURL = '';
      let returnUrl = '';
      
      Object.keys(rawData).forEach(key => {
        const field = rawData[key];
        
        if (!field || typeof field !== 'object') return;
        
        const name = (field.name || '').toLowerCase();
        const answer = field.answer;
        
        console.log(`Field "${name}": type=${field.type}, hasAnswer=${!!answer}`);
        
        // Check for returnUrl
        if (name === 'returnurl' || name.includes('return')) {
          returnUrl = answer || field.text || field.prettyFormat || '';
          console.log('Found returnUrl:', returnUrl);
        }
        
        // Check for file uploads
        if (field.type === 'control_fileupload' && answer) {
          const fileUrl = Array.isArray(answer) ? answer[0] : answer;
          
          if (typeof fileUrl === 'string' && fileUrl.includes('jotform.com')) {
            if (name.includes('front') || name.includes('upload front')) {
              frontURL = fileUrl;
              console.log('Found FRONT file');
            } else if (name.includes('back')) {
              backURL = fileUrl;
              console.log('Found BACK file');
            }
          }
        }
      });

      console.log('Final extraction:', { 
        hasFront: !!frontURL, 
        hasBack: !!backURL, 
        hasReturn: !!returnUrl 
      });

      if (!returnUrl) {
        console.error('❌ Missing returnUrl!');
        console.log('Dumping all fields for inspection:');
        Object.keys(rawData).slice(0, 20).forEach(key => {
          const field = rawData[key];
          if (field && typeof field === 'object') {
            console.log(`  ${key}: name="${field.name}", answer="${field.answer}"`);
          }
        });
        
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
      console.log('Submissions in memory:', submissions.size);

      // Redirect
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set('artwork_token', token);

      console.log('Redirecting to:', redirectUrl.toString().substring(0, 100) + '...');

      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': redirectUrl.toString()
        },
        body: ''
      };

    } catch (error) {
      console.error('❌ Fatal error:', error);
      console.error('Stack:', error.stack);
      
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
        body: JSON.stringify({ error: 'Missing token parameter' })
      };
    }

    const submission = submissions.get(token);
    
    if (!submission) {
      console.log('Token not found:', token);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Submission not found' })
      };
    }

    console.log('✅ Retrieved submission');

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
