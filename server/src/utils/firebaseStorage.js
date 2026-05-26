import admin from 'firebase-admin';
import fs from 'fs';

/**
 * Uploads a local file to Firebase Storage bucket and deletes the local temporary file.
 * Falls back to signed URLs if the bucket is not public.
 */
export const uploadLocalFileToFirebase = async (filePath, originalName, mimeType) => {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  }

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
  const bucket = admin.storage().bucket(bucketName);
  
  const destination = `media/${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  
  console.log(`[Firebase Storage] Uploading ${filePath} to gs://${bucketName}/${destination}...`);

  try {
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
      },
    });

    const fileRef = bucket.file(destination);
    let publicUrl;

    try {
      // Make the file publicly readable
      await fileRef.makePublic();
      publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
      console.log(`[Firebase Storage] File made public: ${publicUrl}`);
    } catch (makePublicError) {
      console.warn(`[Firebase Storage] makePublic failed, falling back to signed URL:`, makePublicError.message);
      // Fallback: Generate a long-lived URL (e.g. 50 years into the future)
      const [signedUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-01-2076', // Far in the future
      });
      publicUrl = signedUrl;
    }

    // Safely delete the local temporary file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Firebase Storage] Cleaned up local temp file: ${filePath}`);
      }
    } catch (unlinkError) {
      console.error(`[Firebase Storage] Failed to delete temp file ${filePath}:`, unlinkError.message);
    }

    return publicUrl;
  } catch (error) {
    console.error(`[Firebase Storage] Upload error:`, error.message);
    // If the storage bucket is not enabled/found, give a descriptive explanation
    if (error.message.includes('bucket') || error.code === 404) {
      throw new Error('Firebase Storage is not enabled. Please go to your Firebase Console (console.firebase.google.com), click on "Storage", and click "Get Started" to enable your storage bucket.');
    }
    throw error;
  }
};
