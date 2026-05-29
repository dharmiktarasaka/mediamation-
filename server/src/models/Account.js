import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';

const accountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['instagram', 'facebook', 'pinterest', 'twitter', 'tumblr', 'google'], required: true },
  platformUserId: { type: String },
  name: { type: String },
  avatar: { type: String },
  accessToken: { type: String },
  tokenSecret: { type: String },
  refreshToken: { type: String },
  tokenExpiresAt: { type: Date },
  pageId: { type: String },
  instagramBusinessId: { type: String },
  instagramUsername: { type: String },
  instagramPassword: { type: String },
  instagramCookie: { type: String },
  isPrivateApi: { type: Boolean, default: false },
}, { timestamps: true });

accountSchema.pre('save', function (next) {
  if (this.accessToken) this.accessToken = encrypt(this.accessToken);
  if (this.tokenSecret) this.tokenSecret = encrypt(this.tokenSecret);
  if (this.refreshToken) this.refreshToken = encrypt(this.refreshToken);
  if (this.instagramPassword) this.instagramPassword = encrypt(this.instagramPassword);
  if (this.instagramCookie) this.instagramCookie = encrypt(this.instagramCookie);
  next();
});

accountSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update) {
    if (update.accessToken) update.accessToken = encrypt(update.accessToken);
    if (update.tokenSecret) update.tokenSecret = encrypt(update.tokenSecret);
    if (update.refreshToken) update.refreshToken = encrypt(update.refreshToken);
    if (update.instagramPassword) update.instagramPassword = encrypt(update.instagramPassword);
    if (update.instagramCookie) update.instagramCookie = encrypt(update.instagramCookie);

    if (update.$set) {
      if (update.$set.accessToken) update.$set.accessToken = encrypt(update.$set.accessToken);
      if (update.$set.tokenSecret) update.$set.tokenSecret = encrypt(update.$set.tokenSecret);
      if (update.$set.refreshToken) update.$set.refreshToken = encrypt(update.$set.refreshToken);
      if (update.$set.instagramPassword) update.$set.instagramPassword = encrypt(update.$set.instagramPassword);
      if (update.$set.instagramCookie) update.$set.instagramCookie = encrypt(update.$set.instagramCookie);
    }
  }
  next();
});

function decryptAccount(doc) {
  if (doc) {
    if (doc.accessToken) doc.accessToken = decrypt(doc.accessToken);
    if (doc.tokenSecret) doc.tokenSecret = decrypt(doc.tokenSecret);
    if (doc.refreshToken) doc.refreshToken = decrypt(doc.refreshToken);
    if (doc.instagramPassword) doc.instagramPassword = decrypt(doc.instagramPassword);
    if (doc.instagramCookie) doc.instagramCookie = decrypt(doc.instagramCookie);
  }
}

accountSchema.post('init', decryptAccount);
accountSchema.post('save', decryptAccount);
accountSchema.post('findOneAndUpdate', decryptAccount);

accountSchema.index({ user: 1, platform: 1 });
accountSchema.index({ platformUserId: 1, platform: 1 }, { unique: true });

export default mongoose.model('Account', accountSchema);

