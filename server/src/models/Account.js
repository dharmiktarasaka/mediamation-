import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['instagram', 'facebook', 'pinterest', 'twitter'], required: true },
  platformUserId: { type: String },
  name: { type: String },
  avatar: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiresAt: { type: Date },
  pageId: { type: String },
  instagramBusinessId: { type: String },
  instagramUsername: { type: String },
  instagramPassword: { type: String },
  instagramCookie: { type: String },
  isPrivateApi: { type: Boolean, default: false },
}, { timestamps: true });

accountSchema.index({ user: 1, platform: 1 });
accountSchema.index({ platformUserId: 1, platform: 1 }, { unique: true });

export default mongoose.model('Account', accountSchema);
