import cron from 'node-cron';
import Post from './models/Post.js';
import Account from './models/Account.js';
import { publishToFacebook, publishToInstagram, publishToPinterest, publishToTwitter } from './publisher.js';

export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const due = await Post.find({
      status: 'scheduled',
      scheduledAt: { $lte: now },
    });

    for (const duePost of due) {
      // Atomically lock the post by changing status to 'publishing'
      const post = await Post.findOneAndUpdate(
        { _id: duePost._id, status: 'scheduled' },
        { status: 'publishing' },
        { new: true }
      ).populate('account');

      // If post is null, it means another server instance has already locked it
      if (!post) {
        console.log(`[Scheduler] Post ${duePost._id} is already being processed by another server instance. Skipping.`);
        continue;
      }

      if (!post.account) {
        post.status = 'failed';
        post.error = 'The associated social media account was disconnected or not found.';
        await post.save();
        console.warn(`[Scheduler] Post ${post._id} failed: Account not found.`);
        continue;
      }

      try {
        let result;
        if (post.platform === 'facebook') {
          result = await publishToFacebook(post, post.account);
        } else if (post.platform === 'instagram') {
          result = await publishToInstagram(post, post.account);
        } else if (post.platform === 'pinterest') {
          result = await publishToPinterest(post, post.account);
        } else if (post.platform === 'twitter') {
          result = await publishToTwitter(post, post.account);
        }

        post.status = 'published';
        post.publishedAt = new Date();
        post.platformPostId = result?.id;
        await post.save();
        console.log(`Published post ${post._id} to ${post.platform}`);
      } catch (error) {
        post.status = 'failed';
        post.error = error.message;
        await post.save();
        console.error(`Failed to publish post ${post._id}:`, error.message);
      }
    }
  });
};
