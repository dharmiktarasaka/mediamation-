import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  platform: { type: String, enum: ['instagram', 'facebook', 'pinterest', 'twitter', 'tumblr'], required: true },
  content: { type: String, required: true },
  media: [{
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true }
  }],
  scheduledAt: { type: Date, required: true },
  publishedAt: { type: Date },
  status: {
    type: String,
    enum: ['scheduled', 'publishing', 'published', 'failed'],
    default: 'scheduled',
  },
  error: { type: String },
  platformPostId: { type: String },
}, { timestamps: true });

postSchema.index({ user: 1, status: 1 });
postSchema.index({ scheduledAt: 1, status: 1 });

export default mongoose.model('Post', postSchema);
