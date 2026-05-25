import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import admin from 'firebase-admin';

let firebaseAdminReady = false;

const hasFirebaseConfig = 
  process.env.FIREBASE_PROJECT_ID && 
  process.env.FIREBASE_PROJECT_ID !== 'your-project-id' &&
  process.env.FIREBASE_CLIENT_EMAIL && 
  process.env.FIREBASE_CLIENT_EMAIL !== 'your-client-email' &&
  process.env.FIREBASE_PRIVATE_KEY && 
  process.env.FIREBASE_PRIVATE_KEY !== 'your-private-key';

if (hasFirebaseConfig) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    firebaseAdminReady = true;
    console.log('[Firebase Admin] Initialized successfully');
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
  }
} else {
  console.log('[Firebase Admin] Environment variables missing or using placeholders. Falling back to local JWT auth.');
}

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const token = header.split(' ')[1];

  if (firebaseAdminReady) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      let user = await User.findOne({ firebaseUid: decodedToken.uid });
      if (!user) {
        user = await User.findOneAndUpdate(
          { email: decodedToken.email },
          {
            firebaseUid: decodedToken.uid,
            name: decodedToken.name || decodedToken.email.split('@')[0],
            email: decodedToken.email,
          },
          { upsert: true, new: true }
        );
      }
      req.user = user;
      return next();
    } catch (err) {
      // Fallback to local JWT if firebase token validation fails
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized' });
  }
};

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};
