import crypto from 'crypto';

const percentEncode = (str) => {
  if (str === null || str === undefined) return '';
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
};

const buildParameterString = (params) => {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
};

export const getOAuth1Signature = (method, url, oauthParams, requestParams, consumerSecret, tokenSecret = '') => {
  // Combine all parameters (oauth params + request params)
  const allParams = { ...oauthParams, ...requestParams };
  
  // Percent encode and sort parameters
  const parameterString = buildParameterString(allParams);
  
  // Build Signature Base String
  const baseUrl = url.split('?')[0];
  const signatureBaseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(parameterString)}`;
  
  // Build Signing Key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  
  // Compute HMAC-SHA1 signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64');
    
  return signature;
};

export const buildAuthorizationHeader = (method, url, requestParams, consumerKey, consumerSecret, token = '', tokenSecret = '', verifier = '') => {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };
  
  if (token) oauthParams.oauth_token = token;
  if (verifier) oauthParams.oauth_verifier = verifier;
  
  const signature = getOAuth1Signature(method, url, oauthParams, requestParams, consumerSecret, tokenSecret);
  
  oauthParams.oauth_signature = signature;
  
  const headerParts = Object.keys(oauthParams)
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
    .join(', ');
    
  return `OAuth ${headerParts}`;
};
