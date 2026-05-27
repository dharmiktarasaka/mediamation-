import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateToken, protect } from '../middleware/auth.js';
import axios from 'axios';
import Account from '../models/Account.js';

const router = Router();
let clientUrl = process.env.CLIENT_URL || 'https://mediamation.vercel.app';
if (!clientUrl.startsWith('http://') && !clientUrl.startsWith('https://')) {
  clientUrl = 'https://mediamation.vercel.app';
}
clientUrl = clientUrl.replace(/\/$/, '');

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

router.put('/settings', protect, async (req, res) => {
  try {
    const { aiProvider, groqApiKey, geminiApiKey } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (aiProvider !== undefined) user.aiProvider = aiProvider;
    if (groqApiKey !== undefined) user.groqApiKey = groqApiKey;
    if (geminiApiKey !== undefined) user.geminiApiKey = geminiApiKey;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/instagram/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.redirect(`${clientUrl}/dashboard?error=instagram_auth_failed`);
  }

  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/instagram/callback`;

    // 1. Get short-lived token
    const formData = new URLSearchParams();
    formData.append('client_id', process.env.INSTAGRAM_APP_ID);
    formData.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', redirectUri);
    formData.append('code', code);

    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, user_id } = tokenRes.data;

    // 2. Exchange for long-lived token
    const longLivedRes = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: access_token
      }
    });

    const longLivedToken = longLivedRes.data.access_token;
    const expiresSec = longLivedRes.data.expires_in || 5183999;
    const tokenExpiresAt = new Date(Date.now() + expiresSec * 1000);

    // 3. Get user profile
    const profileRes = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'id,username',
        access_token: longLivedToken
      }
    });

    const { id, username } = profileRes.data;

    // Save as Account in Database
    await Account.findOneAndUpdate(
      { platformUserId: id, platform: 'instagram' },
      {
        user: state,
        platform: 'instagram',
        platformUserId: id,
        name: username,
        accessToken: longLivedToken,
        tokenExpiresAt: tokenExpiresAt,
        instagramBusinessId: id,
      },
      { upsert: true, new: true }
    );

    res.redirect(`${clientUrl}/dashboard?connected=instagram`);
  } catch (error) {
    console.error('Instagram direct callback error:', error.response?.data || error.message);
    res.redirect(`${clientUrl}/dashboard?error=instagram_auth_failed`);
  }
});

export default router;
