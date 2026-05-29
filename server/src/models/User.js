import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/crypto.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  firebaseUid: { type: String, unique: true, sparse: true },
  aiProvider: { type: String, enum: ['groq', 'gemini', 'mock'], default: 'mock' },
  groqApiKey: { type: String, default: '' },
  geminiApiKey: { type: String, default: '' },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  // Encrypt password if modified
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  
  // Encrypt AI API keys
  if (this.groqApiKey) this.groqApiKey = encrypt(this.groqApiKey);
  if (this.geminiApiKey) this.geminiApiKey = encrypt(this.geminiApiKey);
  
  next();
});

userSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update) {
    if (update.groqApiKey) update.groqApiKey = encrypt(update.groqApiKey);
    if (update.geminiApiKey) update.geminiApiKey = encrypt(update.geminiApiKey);

    if (update.$set) {
      if (update.$set.groqApiKey) update.$set.groqApiKey = encrypt(update.$set.groqApiKey);
      if (update.$set.geminiApiKey) update.$set.geminiApiKey = encrypt(update.$set.geminiApiKey);
    }
  }
  next();
});

function decryptUser(doc) {
  if (doc) {
    if (doc.groqApiKey) doc.groqApiKey = decrypt(doc.groqApiKey);
    if (doc.geminiApiKey) doc.geminiApiKey = decrypt(doc.geminiApiKey);
  }
}

userSchema.post('init', decryptUser);
userSchema.post('save', decryptUser);
userSchema.post('findOneAndUpdate', decryptUser);

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);

