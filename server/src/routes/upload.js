import express from 'express';
import { protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { generateAICaption } from '../utils/ai.js';
import { uploadLocalFileToCloudinary } from '../utils/cloudinary.js';

const router = express.Router();

// Handle single file upload
router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const publicUrl = await uploadLocalFileToCloudinary(
      req.file.path,
      req.file.mimetype
    );

    res.json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: publicUrl
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Handle multiple file upload
router.post('/multiple', protect, upload.array('media', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const files = [];
    for (const file of req.files) {
      const publicUrl = await uploadLocalFileToCloudinary(
        file.path,
        file.mimetype
      );
      files.push({
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: publicUrl
      });
    }

    res.json({
      message: 'Files uploaded successfully',
      files: files
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Generate AI caption based on uploaded file
router.post('/generate-caption', protect, async (req, res) => {
  const { filename, mimetype, tone, url } = req.body;
  if (!filename || !mimetype) {
    return res.status(400).json({ message: 'filename and mimetype are required' });
  }

  try {
    const { caption, isMock, reason, error } = await generateAICaption(filename, mimetype, tone, req.user, url);
    res.json({ caption, isMock, reason, error });
  } catch (error) {
    console.error('[AI Caption Error]', error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;