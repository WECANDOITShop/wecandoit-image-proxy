// netlify/functions/jotform-webhook.js
const crypto = require('crypto');

// Simple in-memory storage
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

// Parse multipart/form-data manually
function parseMultipart(body, boundary) {
  const fields = {};
  
  // Split by boundary (handle both --boundary and --boundary--)
  const delimiter = '--' + boundary;
  const parts = body.split(delimiter);
  
  console.log('Total parts found:', parts.length);
  
  parts.forEach((part, index) => {
    // Skip empty parts and closing boundary
    if (!part || part.trim() === '' || part.trim() === '--') return;
    
    // Look for Content-Disposition header
    const headerMatch = part.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!headerMatch) {
      console.log(`Part ${index}: No name found`);
      return;
    }
    
    const fieldName = headerMatch[1];
    console.log(`Part ${index}: Found field "${fieldName}"`);
    
    // Find where headers end (double line break)
    const headerEndMatch = part.match(/\r?\n\r?\n/);
    if (!headerEndMatch) {
      console.log(`Part ${index}: No header end found`);
      return;
    }
    
    // Extract value after headers
    const headerEndIndex = headerEndMatch.index + headerEndMatch[0].length;
    let value = part.substring(headerEndIndex);
    
    // Clean up trailing whitespace and boundary markers
    value = value.replace(/\r?\n--$/, '').trim();
    
    console.log(`Part ${index}: Value length = ${value.length}`);
    
    fields[fieldName] = value;
  });
  
  return fields;
}

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
      const contentType = event.headers['content-type'] || '';
      console.log('Content-Type:', contentType);

      let rawData = null;

      // Extract boundary from content-type
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      
      if (boundaryMatch) {
        const boundary = boundaryMatch[1].replace(/"/g, '');
        console.log('Boundary:', boundary);
        
        // Parse multipart data
        const fields = parseMultipart(event.body, boundary);
        console.log('Parsed fields:', Object.keys(fields));
        
        // Jotform sends the actual data in 'rawRequest' field
        if (fields.rawRequest) {
          console.log('Found rawRequest field');
          try {
            rawData = JSON.parse(fields.rawRequest);
            console.log('✅ Parsed rawRequest as JSON');
          } catch (e) {
            console.error('Failed to parse rawRequest:', e.message);
          }
        } else {
          console.log('Available fields:', Object.keys(fields));
          // Try to find JSON in any field
          for (const [key, value] of Object.entries(fields)) {
            if (value.startsWith('{')) {
              try {
                rawData = JSON.parse(value);
                console.log('✅ Found JSON in field:', key);
                break;
              } catch (e) {}
            }
          }
        }
      }

      if (!rawData) {
        console.error('❌ Could not extract submission data');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Could not parse submission data' })
        };
      }

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
        
        // Check for returnUrl field
        if (name === 'returnurl' || key.toLowerCase() === 'returnurl') {
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

      console.log('Final extraction:', { 
        hasFront: !!frontURL, 
        hasBack: !!backURL, 
        hasReturn: !!returnUrl 
      });

      if (!returnUrl) {
        console.error('❌ Missing returnUrl!');
        console.log('All fields:', Object.keys(rawData));
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

      // Redirect back to product page with token
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
      console.error('❌ Webhook error:', error);
      console.error('Stack:', error.stack);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: error.message
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
