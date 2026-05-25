import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);

    // Drop incorrect email index from the accounts collection if it exists
    try {
      const db = conn.connection.db;
      const collections = await db.listCollections({ name: 'accounts' }).toArray();
      if (collections.length > 0) {
        const indexes = await db.collection('accounts').indexes();
        const hasEmailIndex = indexes.some(idx => idx.name === 'email_1');
        if (hasEmailIndex) {
          console.log('Found incorrect email_1 index on accounts collection. Dropping it...');
          await db.collection('accounts').dropIndex('email_1');
          console.log('Successfully dropped email_1 index.');
        }
      }
    } catch (indexError) {
      console.warn('Warning: Could not drop email_1 index on accounts:', indexError.message);
    }
  } catch (error) {
    console.error(`MongoDB error: ${error.message}`);
    process.exit(1);
  }
};
