import admin from 'firebase-admin';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Uploads a local file to Firebase Storage bucket and deletes the local temporary file.
 * Generates a persistent, public download URL using a download token metadata attribute.
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
    // Generate a unique token for the download URL
    const downloadToken = crypto.randomBytes(16).toString('hex');

    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        }
      },
    });

    // Construct the direct Firebase download URL
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destination)}?alt=media&token=${downloadToken}`;
    console.log(`[Firebase Storage] File uploaded successfully. Public URL: ${publicUrl}`);

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
    console.error(`[Firebase Storage] Upload error details:`, error);
    throw new Error(`Firebase Storage error: ${error.message} (Bucket: ${bucketName})`);
  }
};
