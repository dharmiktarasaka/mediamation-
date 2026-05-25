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
    }).populate('account');

    for (const post of due) {
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
