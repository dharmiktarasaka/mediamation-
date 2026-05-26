import express from 'express';
import { protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import path from 'path';

import { generateAICaption } from '../utils/ai.js';

const router = express.Router();
const fileUrl = (req, filename) => {
  const host = req.get('host');
  const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
  return `${protocol}://${host}/uploads/${filename}`;
};
// Handle single file upload
router.post('/', protect, upload.single('media'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    res.json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: fileUrl(req, req.file.filename)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Handle multiple file upload
router.post('/multiple', protect, upload.array('media', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: fileUrl(req, file.filename)
    }));

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
  const { filename, mimetype, tone } = req.body;
  if (!filename || !mimetype) {
    return res.status(400).json({ message: 'filename and mimetype are required' });
  }

  try {
    const { caption, isMock, reason, error } = await generateAICaption(filename, mimetype, tone, req.user);
    res.json({ caption, isMock, reason, error });
  } catch (error) {
    console.error('[AI Caption Error]', error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;