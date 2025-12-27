// netlify/functions/jotform-webhook.js
// DIAGNOSTIC VERSION - Logs everything

exports.handler = async (event, context) => {
  console.log('=== WEBHOOK DIAGNOSTIC ===');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  console.log('Body type:', typeof event.body);
  console.log('Body length:', event.body ? event.body.length : 0);
  console.log('Body (first 1000 chars):', event.body ? event.body.substring(0, 1000) : 'EMPTY');
  console.log('Body (raw):', event.body);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // For now, just log and return success
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Webhook received - check logs',
      bodyLength: event.body ? event.body.length : 0
    })
  };
};
