import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import Account from '../models/Account.js';
import { IgApiClient, IgCheckpointError } from 'instagram-private-api';
import { buildAuthorizationHeader } from '../utils/oauth1.js';

const router = Router();
const TWITTER_OAUTH_VERIFIER = 'twitter_oauth_verifier_key_mediamation_static_v2';
let clientUrl = process.env.CLIENT_URL || 'https://mediamation.vercel.app';
if (!clientUrl.startsWith('http://') && !clientUrl.startsWith('https://')) {
  clientUrl = 'https://mediamation.vercel.app';
}
clientUrl = clientUrl.replace(/\/$/, '');

router.get('/', protect, async (req, res) => {
  try {
    const accounts = await Account.find({ user: req.user._id });
    res.json(accounts);
  } catch (error) {
    console.error('[accounts GET /]', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const account = await Account.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    console.error('[accounts DELETE /:id]', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post('/connect-facebook', protect, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ message: 'Access token is required' });
  }

  try {
    const pagesRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { 
        fields: 'name,access_token,picture,instagram_business_account',
        access_token: accessToken 
      },
    });

    for (const page of pagesRes.data.data) {
      await Account.findOneAndUpdate(
        { platformUserId: page.id, platform: 'facebook' },
        {
          user: req.user._id,
          platform: 'facebook',
          platformUserId: page.id,
          name: page.name,
          avatar: page.picture?.data?.url,
          accessToken: page.access_token,
          pageId: page.id,
        },
        { upsert: true, new: true }
      );

      if (page.instagram_business_account) {
        await Account.findOneAndUpdate(
          { platformUserId: page.instagram_business_account.id, platform: 'instagram' },
          {
            user: req.user._id,
            platform: 'instagram',
            platformUserId: page.instagram_business_account.id,
            name: `${page.name} (Instagram)`,
            accessToken: page.access_token,
            pageId: page.id,
            instagramBusinessId: page.instagram_business_account.id,
          },
          { upsert: true, new: true }
        );
      }
    }

    res.json({ message: 'Accounts connected successfully' });
  } catch (error) {
    console.error('Connect Facebook error:', error.response?.data || error.message);
    res.status(500).json({ message: error.message });
  }
});

const challengeCache = new Map();

router.post('/connect-instagram-private', protect, async (req, res) => {
  const { username, password, code } = req.body;
  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  // Helper to serialize state
  const serializeState = async (ig) => {
    const cookies = await ig.state.serializeCookieJar();
    return {
      deviceString: ig.state.deviceString,
      build: ig.state.build,
      uuid: ig.state.uuid,
      phoneId: ig.state.phoneId,
      adid: ig.state.adid,
      cookies: JSON.stringify(cookies),
      password,
    };
  };

  // Helper to deserialize state
  const restoreState = async (ig, state) => {
    ig.state.deviceString = state.deviceString;
    ig.state.build = state.build;
    ig.state.uuid = state.uuid;
    ig.state.phoneId = state.phoneId;
    ig.state.adid = state.adid;
    await ig.state.deserializeCookieJar(JSON.parse(state.cookies));
  };

  try {
    const ig = new IgApiClient();

    // --- Step 2: Verification Code Submitted ---
    if (code) {
      const cachedState = challengeCache.get(username);
      if (!cachedState) {
        return res.status(400).json({ message: 'No active session found for this username. Please try logging in again.' });
      }

      ig.state.generateDevice(username);
      await restoreState(ig, cachedState);

      console.log(`[Instagram Challenge] Submitting verification code for ${username}...`);
      const challengeResponse = await ig.challenge.sendSecurityCode(code);
      console.log(`[Instagram Challenge] Challenge response:`, challengeResponse);

      // Successfully logged in! Clean up cache
      challengeCache.delete(username);

      // Verify and get user info
      const loggedInUser = await ig.account.currentUser();
      const avatarUrl = loggedInUser.profile_pic_url || null;

      // Extract cookies for storage
      const finalCookies = await ig.state.serializeCookieJar();

      const account = await Account.findOneAndUpdate(
        { platformUserId: username, platform: 'instagram' },
        {
          user: req.user._id,
          platform: 'instagram',
          platformUserId: username,
          name: `@${username}`,
          avatar: avatarUrl,
          instagramUsername: username,
          instagramCookie: JSON.stringify(finalCookies), // Save full cookie jar as string!
          isPrivateApi: true,
        },
        { upsert: true, new: true }
      );

      return res.json({ status: 'success', message: 'Instagram account connected successfully', account });
    }

    // --- Step 1: Initial Login Request ---
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    ig.state.generateDevice(username);
    await ig.simulate.preLoginFlow();

    try {
      console.log(`[Instagram Login] Attempting login for ${username}...`);
      const loggedInUser = await ig.account.login(username, password);
      console.log(`[Instagram Login] Success!`);

      const avatarUrl = loggedInUser.profile_pic_url || null;
      const finalCookies = await ig.state.serializeCookieJar();

      const account = await Account.findOneAndUpdate(
        { platformUserId: username, platform: 'instagram' },
        {
          user: req.user._id,
          platform: 'instagram',
          platformUserId: username,
          name: `@${username}`,
          avatar: avatarUrl,
          instagramUsername: username,
          instagramCookie: JSON.stringify(finalCookies),
          isPrivateApi: true,
        },
        { upsert: true, new: true }
      );

      return res.json({ status: 'success', message: 'Instagram account connected successfully', account });
    } catch (loginError) {
      // Check if checkpoint/verification is required
      const isCheckpoint = 
        loginError instanceof IgCheckpointError || 
        loginError.name === 'IgCheckpointError' || 
        (loginError.message && (
          loginError.message.includes('checkpoint') ||
          loginError.message.includes('email to help you') ||
          loginError.message.includes('challenge') ||
          loginError.message.includes('checkpoint_required')
        ));

      if (isCheckpoint) {
        console.log(`[Instagram Login] Checkpoint required for ${username}. Requesting security code...`);
        
        try {
          // Initiate challenge flow
          await ig.challenge.auto(true);
          
          // Cache the session state
          const state = await serializeState(ig);
          challengeCache.set(username, state);

          return res.json({
            status: 'challenge_required',
            message: 'Instagram requires verification. A security code has been sent to your email/phone. Please enter it below.',
            apiPath: ig.state.checkpoint?.api_path
          });
        } catch (challengeError) {
          console.error('[Instagram Challenge Error]', challengeError);
          // If auto challenge fails, it usually means Instagram sent a direct security link instead of a code
          return res.status(400).json({
            message: 'Instagram security lock triggered: "We can send you an email to help you get back into your account". Please check your email inbox and click the Instagram login link/button to authorize this login, then try again.'
          });
        }
      }
      throw loginError;
    }

  } catch (error) {
    console.error('[Instagram Private API error]', error);
    let userMessage = error.message;
    if (error.name === 'IgLoginBadPasswordError') {
      userMessage = 'Incorrect password. Please verify your Instagram password.';
    } else if (error.name === 'IgLoginInvalidUserError') {
      userMessage = 'The username does not exist. Please check your spelling.';
    } else {
      userMessage = `Failed to connect Instagram: ${error.message}`;
    }
    res.status(400).json({ message: userMessage });
  }
});

router.get('/facebook', protect, (req, res) => {
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&state=${req.user._id}&scope=pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,pages_show_list,business_management`;
  res.json({ url });
});

router.get('/facebook/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    const shortLivedToken = tokenRes.data.access_token;

    // Exchange short-lived token for a long-lived (60-day) user token
    const longLivedRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = longLivedRes.data.access_token;

    const pagesRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { 
        fields: 'name,access_token,picture,instagram_business_account',
        access_token: longLivedToken 
      },
    });

    console.log('=== FACEBOOK PAGES RESPONSE ===');
    console.log(JSON.stringify(pagesRes.data, null, 2));
    console.log('================================');

    for (const page of pagesRes.data.data) {
      await Account.findOneAndUpdate(
        { platformUserId: page.id, platform: 'facebook' },
        {
          user: state,
          platform: 'facebook',
          platformUserId: page.id,
          name: page.name,
          avatar: page.picture?.data?.url,
          accessToken: page.access_token,
          pageId: page.id,
        },
        { upsert: true, new: true }
      );

      if (page.instagram_business_account) {
        await Account.findOneAndUpdate(
          { platformUserId: page.instagram_business_account.id, platform: 'instagram' },
          {
            user: state,
            platform: 'instagram',
            platformUserId: page.instagram_business_account.id,
            name: `${page.name} (Instagram)`,
            accessToken: page.access_token,
            pageId: page.id,
            instagramBusinessId: page.instagram_business_account.id,
          },
          { upsert: true, new: true }
        );
      }
    }

    if (!pagesRes.data.data || pagesRes.data.data.length === 0) {
      return res.redirect(`${clientUrl}/dashboard?error=no_pages_found`);
    }

    res.redirect(`${clientUrl}/dashboard?connected=facebook`);
  } catch (error) {
    console.error('Facebook callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=facebook_auth_failed`);
  }
});

router.get('/instagram', protect, (req, res) => {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/api/auth/instagram/callback`;

  const url = `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_business_basic,instagram_business_content_publish&response_type=code&state=${req.user._id}`;
  res.json({ url });
});

router.get('/pinterest', protect, (req, res) => {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/api/accounts/pinterest/callback`;

  const url = `https://www.pinterest.com/oauth/?client_id=${process.env.PINTEREST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=boards:read,boards:write,pins:read,pins:write,user_accounts:read&state=${req.user._id}`;
  res.json({ url });
});

router.get('/pinterest/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/accounts/pinterest/callback`;
    const pinterestBaseUrl = process.env.PINTEREST_USE_SANDBOX === 'true' ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
    // Exchange authorization code for access token
    const tokenRes = await axios.post(`${pinterestBaseUrl}/oauth/token`, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch Pinterest user info to get username/avatar
    const userRes = await axios.get(`${pinterestBaseUrl}/user_account`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const pinterestUser = userRes.data;
    const name = pinterestUser.username || 'Pinterest User';
    const platformUserId = pinterestUser.username;
    const avatar = pinterestUser.profile_image || null;

    await Account.findOneAndUpdate(
      { platformUserId, platform: 'pinterest' },
      {
        user: state,
        platform: 'pinterest',
        platformUserId,
        name: `@${name}`,
        avatar,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },
      { upsert: true, new: true }
    );

    res.redirect(`${clientUrl}/dashboard?connected=pinterest`);
  } catch (error) {
    console.error('Pinterest callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=pinterest_auth_failed`);
  }
});

router.get('/twitter', protect, (req, res) => {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/api/accounts/twitter/callback`;

  const codeChallenge = crypto
    .createHash('sha256')
    .update(TWITTER_OAUTH_VERIFIER)
    .digest('base64url');
  
  const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access%20media.write&state=${req.user._id}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  res.json({ url });
});

router.get('/twitter/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/accounts/twitter/callback`;

    const tokenRes = await axios.post('https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID,
        redirect_uri: redirectUri,
        code_verifier: TWITTER_OAUTH_VERIFIER,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch user details from Twitter API v2
    const userRes = await axios.get('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      },
      params: {
        'user.fields': 'profile_image_url'
      }
    });

    const twitterUser = userRes.data?.data;
    const name = twitterUser?.username || 'Twitter User';
    const platformUserId = twitterUser?.id;
    const avatar = twitterUser?.profile_image_url || null;

    await Account.findOneAndUpdate(
      { platformUserId, platform: 'twitter' },
      {
        user: state,
        platform: 'twitter',
        platformUserId,
        name: `@${name}`,
        avatar,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },
      { upsert: true, new: true }
    );

    res.redirect(`${clientUrl}/dashboard?connected=twitter`);
  } catch (error) {
    console.error('Twitter callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=twitter_auth_failed`);
  }
});

// Tumblr Temporary Secret Model (for OAuth 1.0a handshake)
const TumblrTempSchema = new mongoose.Schema({
  oauthToken: { type: String, required: true, unique: true },
  oauthTokenSecret: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Auto-delete after 15 minutes to save space
TumblrTempSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

// Avoid compiling the model multiple times in development watch mode
const TumblrTemp = mongoose.models.TumblrTemp || mongoose.model('TumblrTemp', TumblrTempSchema);

// Tumblr OAuth 1.0a Initiate
router.get('/tumblr', protect, async (req, res) => {
  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const callbackUrl = `${protocol}://${host}/api/accounts/tumblr/callback`;

    const url = 'https://www.tumblr.com/oauth/request_token';
    const authHeader = buildAuthorizationHeader(
      'POST',
      url,
      { oauth_callback: callbackUrl },
      process.env.TUMBLR_CONSUMER_KEY,
      process.env.TUMBLR_CONSUMER_SECRET
    );

    const resToken = await axios.post(url, new URLSearchParams({ oauth_callback: callbackUrl }), {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });

    const params = new URLSearchParams(resToken.data);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      console.error('Tumblr Request Token missing in response:', resToken.data);
      return res.status(400).json({ message: 'Failed to request token from Tumblr' });
    }

    // Save temporary secret to associate with oauthToken in callback
    await TumblrTemp.create({
      oauthToken,
      oauthTokenSecret,
      user: req.user._id,
    });

    const redirectUrl = `https://www.tumblr.com/oauth/authorize?oauth_token=${oauthToken}`;
    res.json({ url: redirectUrl });
  } catch (error) {
    console.error('Tumblr auth initiate error:', error.response?.data || error.message);
    res.status(500).json({ message: error.message });
  }
});

// Tumblr OAuth 1.0a Callback
router.get('/tumblr/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  if (!oauth_token || !oauth_verifier) {
    console.error('Missing parameters in Tumblr callback:', req.query);
    return res.redirect(`${clientUrl}/dashboard?error=tumblr_auth_failed`);
  }

  try {
    // Retrieve the temporary secret and user ID
    const tempRecord = await TumblrTemp.findOne({ oauthToken: oauth_token });
    if (!tempRecord) {
      console.error('No temp record found for oauth_token:', oauth_token);
      return res.redirect(`${clientUrl}/dashboard?error=tumblr_auth_failed`);
    }

    const { oauthTokenSecret: tempSecret, user: userId } = tempRecord;

    const url = 'https://www.tumblr.com/oauth/access_token';
    const authHeader = buildAuthorizationHeader(
      'POST',
      url,
      { oauth_verifier },
      process.env.TUMBLR_CONSUMER_KEY,
      process.env.TUMBLR_CONSUMER_SECRET,
      oauth_token,
      tempSecret
    );

    const resToken = await axios.post(url, new URLSearchParams({ oauth_verifier }), {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });

    const params = new URLSearchParams(resToken.data);
    const accessToken = params.get('oauth_token');
    const tokenSecret = params.get('oauth_token_secret');

    if (!accessToken || !tokenSecret) {
      console.error('Missing tokens in Tumblr access token exchange:', resToken.data);
      return res.redirect(`${clientUrl}/dashboard?error=tumblr_auth_failed`);
    }

    // Fetch user info to save blog(s)
    const userInfoUrl = 'https://api.tumblr.com/v2/user/info';
    const infoAuthHeader = buildAuthorizationHeader(
      'GET',
      userInfoUrl,
      {},
      process.env.TUMBLR_CONSUMER_KEY,
      process.env.TUMBLR_CONSUMER_SECRET,
      accessToken,
      tokenSecret
    );

    const infoRes = await axios.get(userInfoUrl, {
      headers: {
        'Authorization': infoAuthHeader,
      }
    });

    const user = infoRes.data.response.user;
    if (!user || !user.blogs || user.blogs.length === 0) {
      console.error('No blogs found in Tumblr user info:', infoRes.data);
      return res.redirect(`${clientUrl}/dashboard?error=no_blogs_found`);
    }

    for (const blog of user.blogs) {
      await Account.findOneAndUpdate(
        { platformUserId: blog.name, platform: 'tumblr' },
        {
          user: userId,
          platform: 'tumblr',
          platformUserId: blog.name,
          name: blog.title || blog.name,
          avatar: `https://api.tumblr.com/v2/blog/${blog.name}.tumblr.com/avatar/64`,
          accessToken: accessToken,
          tokenSecret: tokenSecret,
          pageId: blog.name,
        },
        { upsert: true, new: true }
      );
    }

    // Clean up temporary record
    await TumblrTemp.deleteOne({ _id: tempRecord._id });

    res.redirect(`${clientUrl}/dashboard?connected=tumblr`);
  } catch (error) {
    console.error('Tumblr callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=tumblr_auth_failed`);
  }
});

router.get('/google', protect, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ 
      message: 'Google Client ID or Client Secret is not loaded in the server. Please check your .env file and RESTART your backend server.' 
    });
  }

  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/api/accounts/google/callback`;

  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
    'profile',
    'email'
  ];

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID.trim()}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&state=${req.user._id}&access_type=offline&prompt=consent`;
  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/accounts/google/callback`;

    // 1. Exchange auth code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // 2. Fetch Google user info (to display avatar and name)
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    const profile = userRes.data;
    const userName = profile.name || 'Google Business User';
    const userAvatar = profile.picture || null;

    // 3. Fetch Google Business Profile Accounts
    const accountsRes = await axios.get('https://mybusiness.googleapis.com/v4/accounts', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const googleAccounts = accountsRes.data.accounts || [];
    let locationsConnectedCount = 0;

    // 4. Fetch Locations for each Account and store them in the DB
    for (const gAccount of googleAccounts) {
      const locationsRes = await axios.get(`https://mybusiness.googleapis.com/v4/${gAccount.name}/locations`, {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      const locations = locationsRes.data.locations || [];
      for (const loc of locations) {
        // Use full location resource name (e.g. accounts/{accountId}/locations/{locationId}) as platformUserId
        const platformUserId = loc.name; 
        const name = loc.title || loc.locationName || userName;

        const updateData = {
          user: state,
          platform: 'google',
          platformUserId,
          name: `${name} (Google)`,
          avatar: userAvatar,
          accessToken: access_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        };

        if (refresh_token) {
          updateData.refreshToken = refresh_token;
        }

        await Account.findOneAndUpdate(
          { platformUserId, platform: 'google' },
          updateData,
          { upsert: true, new: true }
        );
        locationsConnectedCount++;
      }
    }

    if (locationsConnectedCount === 0) {
      return res.redirect(`${clientUrl}/dashboard?error=no_gmb_locations_found`);
    }

    res.redirect(`${clientUrl}/dashboard?connected=google`);
  } catch (error) {
    console.error('Google GMB callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=google_auth_failed`);
  }
});

export default router;
