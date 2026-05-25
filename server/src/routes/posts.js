import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Post from '../models/Post.js';
import Account from '../models/Account.js';

const router = Router();

router.get('/', protect, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (from || to) {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = new Date(from);
      if (to) filter.scheduledAt.$lte = new Date(to);
    }

    const posts = await Post.find(filter)
      .populate('account', 'name platform avatar')
      .sort({ scheduledAt: -1 });
    res.json(posts);
  } catch (error) {
    console.error('[posts GET /]', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post('/', protect, [
  body('accountId').notEmpty(),
  body('content').notEmpty(),
  body('scheduledAt').isISO8601(),
  body('media').isArray().optional(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const account = await Account.findOne({
      _id: req.body.accountId,
      user: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Process media array if provided
    const media = req.body.media || [];

    const post = await Post.create({
      user: req.user._id,
      account: account._id,
      platform: account.platform,
      content: req.body.content,
      media: media,
      scheduledAt: new Date(req.body.scheduledAt),
    });

    await post.populate('account', 'name platform avatar');
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const { content, media, scheduledAt } = req.body;
    const post = await Post.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ message: 'Cannot edit an already published post' });
    }

    if (content !== undefined) post.content = content;
    if (media !== undefined) post.media = media;
    if (scheduledAt !== undefined) {
      post.scheduledAt = new Date(scheduledAt);
      // Re-schedule a failed post when editing and saving it
      if (post.status === 'failed') {
        post.status = 'scheduled';
        post.error = undefined;
      }
    }

    await post.save();
    await post.populate('account', 'name platform avatar');
    res.json(post);
  } catch (error) {
    console.error('[posts PUT /:id]', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  const post = await Post.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!post) return res.status(404).json({ message: 'Post not found' });
  res.json({ message: 'Post deleted successfully' });
});

export default router;
