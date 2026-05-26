import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Auto-configure from CLOUDINARY_URL or individual credentials
if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a local file to Cloudinary and deletes the local temporary file.
 * Automatically handles both images and videos.
 */
export const uploadLocalFileToCloudinary = async (filePath, mimeType) => {
  const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';

  console.log(`[Cloudinary] Uploading ${filePath} (${resourceType}) to cloud...`);

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: 'mediamation',
    });

    // Clean up local temp file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Cloudinary] Cleaned up local temp file: ${filePath}`);
      }
    } catch (unlinkError) {
      console.error(`[Cloudinary] Failed to delete temp file ${filePath}:`, unlinkError.message);
    }

    // Return HTTPS URL
    return result.secure_url;
  } catch (error) {
    console.error(`[Cloudinary] Upload error:`, error.message);
    
    // Clean up local file even on failure
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {}

    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};
