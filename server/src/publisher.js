import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Resolve a media URL to a local file (if it was uploaded to this server)
const getLocalFile = (mediaUrl) => {
  const filename = mediaUrl.split('/').pop();
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return { path: filePath, filename };
  }
  if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
    throw new Error('This post contains a local media URL (localhost), but the file does not exist on this server. Please create a new post in the deployed environment and upload the media.');
  }
  return null;
};

// Helper to get a public URL for Instagram (uploads to tmpfiles.org if localhost/127.0.0.1)
const getPublicUrl = async (url) => {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const local = getLocalFile(url);
    if (local) {
      console.log(`[Instagram] Localhost URL detected: ${url}. Uploading to tmpfiles.org for public access...`);
      try {
        const form = new FormData();
        form.append('file', fs.createReadStream(local.path), { filename: local.filename });
        const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        if (data && data.status === 'success' && data.data && data.data.url) {
          const publicUrl = data.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
          console.log(`[Instagram] Uploaded successfully. Public URL: ${publicUrl}`);
          return publicUrl;
        }
      } catch (err) {
        console.error('[Instagram] tmpfiles.org upload failed:', err.message);
      }
    }
    throw new Error(
      'Instagram cannot access localhost URLs. Expose your server using a tunnel or host images publicly.'
    );
  }
  return url;
};

// Upload a single photo and publish it immediately (with caption)
const uploadPhoto = async (pageId, accessToken, mediaUrl, caption) => {
  const local = getLocalFile(mediaUrl);
  if (local) {
    const form = new FormData();
    // Explicitly pass filename so form-data sets the correct Content-Disposition header
    // (critical on Windows where path.basename would use backslashes otherwise)
    form.append('source', fs.createReadStream(local.path), { filename: local.filename });
    form.append('caption', caption || '');
    form.append('access_token', accessToken);
    const { data } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      form,
      { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
    );
    return data;
  }
  // Fallback: use public URL
  const { data } = await axios.post(`https://graph.facebook.com/v21.0/${pageId}/photos`, null, {
    params: { url: mediaUrl, caption: caption || '', access_token: accessToken },
  });
  return data;
};

// Upload a video and publish it immediately (with description)
const uploadVideo = async (pageId, accessToken, mediaUrl, description) => {
  const local = getLocalFile(mediaUrl);
  if (local) {
    const form = new FormData();
    form.append('source', fs.createReadStream(local.path), { filename: local.filename });
    form.append('description', description || '');
    form.append('access_token', accessToken);
    const { data } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/videos`,
      form,
      { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
    );
    return data;
  }
  // Fallback: use public URL
  const { data } = await axios.post(`https://graph.facebook.com/v21.0/${pageId}/videos`, null, {
    params: { file_url: mediaUrl, description: description || '', access_token: accessToken },
  });
  return data;
};

// Upload a photo as unpublished (to get its ID for use in a multi-photo feed post)
const uploadPhotoUnpublished = async (pageId, accessToken, mediaUrl) => {
  const local = getLocalFile(mediaUrl);
  if (local) {
    const form = new FormData();
    form.append('source', fs.createReadStream(local.path), { filename: local.filename });
    form.append('published', 'false');
    form.append('temporary', 'true');
    form.append('access_token', accessToken);
    const { data } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      form,
      { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
    );
    return data;
  }
  // Fallback: use public URL
  const { data } = await axios.post(`https://graph.facebook.com/v21.0/${pageId}/photos`, null, {
    params: { url: mediaUrl, published: false, temporary: true, access_token: accessToken },
  });
  return data;
};

export const publishToFacebook = async (post, account) => {
  try {
    console.log(`[Facebook] Publishing post ${post._id} with ${post.media.length} media item(s)`);

    if (post.media.length === 1) {
      const { type, url } = post.media[0];
      if (type === 'image') {
        const result = await uploadPhoto(account.pageId, account.accessToken, url, post.content);
        console.log(`[Facebook] Single image posted successfully:`, result);
        return result;
      }
      if (type === 'video') {
        const result = await uploadVideo(account.pageId, account.accessToken, url, post.content);
        console.log(`[Facebook] Single video posted successfully:`, result);
        return result;
      }
    }

    if (post.media.length > 1) {
      const publishedMedia = [];
      for (const { type, url } of post.media) {
        if (type === 'image') {
          const { id } = await uploadPhotoUnpublished(account.pageId, account.accessToken, url);
          publishedMedia.push({ media_fbid: id });
        }
      }
      if (publishedMedia.length > 0) {
        // MUST use /feed (not /photos) when using attached_media
        const { data } = await axios.post(
          `https://graph.facebook.com/v21.0/${account.pageId}/feed`,
          null,
          {
            params: {
              message: post.content,
              attached_media: JSON.stringify(publishedMedia),
              access_token: account.accessToken,
            },
          }
        );
        console.log(`[Facebook] Multi-image post published:`, data);
        return data;
      }
    }

    // Text-only post
    const { data } = await axios.post(
      `https://graph.facebook.com/v21.0/${account.pageId}/feed`,
      null,
      { params: { message: post.content, access_token: account.accessToken } }
    );
    console.log(`[Facebook] Text-only post published:`, data);
    return data;
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`[Facebook] Publishing error:`, error.response?.data || error.message);
    throw new Error(`Facebook publishing failed: ${errMsg}`);
  }
};

const waitForInstagramMedia = async (containerId, accessToken, maxAttempts = 15, delayMs = 3000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Instagram] Checking container ${containerId} status (Attempt ${attempt}/${maxAttempts})...`);
      const { data } = await axios.get(`https://graph.facebook.com/v21.0/${containerId}`, {
        params: {
          fields: 'status_code,error',
          access_token: accessToken
        }
      });
      
      const statusCode = data.status_code;
      console.log(`[Instagram] Container ${containerId} status: ${statusCode}`);
      
      if (statusCode === 'FINISHED') {
        return true;
      }
      
      if (statusCode === 'ERROR') {
        const errorMsg = data.error || 'Unknown container processing error';
        throw new Error(`Media processing failed on Instagram side: ${errorMsg}`);
      }
    } catch (err) {
      if (err.message.includes('Media processing failed')) {
        throw err;
      }
      console.warn(`[Instagram] Error checking container status on attempt ${attempt}:`, err.message);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Timeout waiting for Instagram media to finish processing on Meta servers.');
};

export const publishToInstagram = async (post, account) => {
  try {
    console.log(`[Instagram] Publishing post ${post._id} with ${post.media.length} media item(s)`);

    if (account.isPrivateApi) {
      const { IgApiClient } = await import('instagram-private-api');
      const { readFileSync } = await import('fs');
      
      const ig = new IgApiClient();
      ig.state.generateDevice(account.instagramUsername);
      
      // Load Instagram session cookie
      try {
        const parsedCookies = JSON.parse(account.instagramCookie);
        await ig.state.deserializeCookieJar(parsedCookies);
      } catch (e) {
        await ig.state.cookieJar.setCookie(
          `sessionid=${account.instagramCookie}; Domain=instagram.com; Path=/; Secure; HttpOnly`,
          'https://instagram.com'
        );
      }

      let result;

      // 1x1 black pixel base64 JPEG for cover fallback
      const blackCoverBuffer = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        'base64'
      );

      if (post.media.length === 1) {
        const { type, url } = post.media[0];
        const filePath = getLocalFile(url);
        const fileBuffer = readFileSync(filePath);

        if (type === 'image') {
          result = await ig.publish.photo({
            file: fileBuffer,
            caption: post.content,
          });
        } else if (type === 'video') {
          result = await ig.publish.video({
            video: fileBuffer,
            coverImage: blackCoverBuffer,
            caption: post.content,
          });
        }
        console.log('[Instagram Private API] Single media post published successfully');
        return result;
      }

      if (post.media.length > 1) {
        const items = post.media.map(media => {
          const filePath = getLocalFile(media.url);
          const fileBuffer = readFileSync(filePath);
          if (media.type === 'image') {
            return {
              file: fileBuffer,
            };
          } else {
            return {
              video: fileBuffer,
              coverImage: blackCoverBuffer,
            };
          }
        });

        result = await ig.publish.album({
          items,
          caption: post.content,
        });
        console.log('[Instagram Private API] Carousel post published successfully');
        return result;
      }

      throw new Error('Instagram requires at least one image or video to publish a post.');
    }

    if (!account.instagramBusinessId) {
      throw new Error('No Instagram Business Account ID configured for this account');
    }

    if (post.media.length === 1) {
      const { type, url } = post.media[0];
      const publicUrl = await getPublicUrl(url);

      const params = { caption: post.content, access_token: account.accessToken };
      if (type === 'image') params.image_url = publicUrl;
      if (type === 'video') { params.video_url = publicUrl; params.media_type = 'REELS'; }

      const { data: container } = await axios.post(
        `https://graph.facebook.com/v21.0/${account.instagramBusinessId}/media`,
        null,
        { params }
      );
      
      // Wait for container to finish processing
      await waitForInstagramMedia(container.id, account.accessToken);

      const { data } = await axios.post(
        `https://graph.facebook.com/v21.0/${account.instagramBusinessId}/media_publish`,
        null,
        { params: { creation_id: container.id, access_token: account.accessToken } }
      );
      console.log(`[Instagram] Single media published:`, data);
      return data;
    }

    if (post.media.length > 1) {
      const children = [];
      for (const { type, url } of post.media) {
        const publicUrl = await getPublicUrl(url);
        let params = { is_carousel_item: true, access_token: account.accessToken };
        if (type === 'image') {
          params.image_url = publicUrl;
        } else if (type === 'video') {
          params.video_url = publicUrl;
          params.media_type = 'VIDEO';
        }

        const { data: mediaItem } = await axios.post(
          `https://graph.facebook.com/v21.0/${account.instagramBusinessId}/media`,
          null,
          { params }
        );
        children.push(mediaItem.id);
      }

      // Wait for all child containers to finish processing
      console.log(`[Instagram] Waiting for all ${children.length} carousel item containers to finish processing...`);
      for (const childId of children) {
        await waitForInstagramMedia(childId, account.accessToken);
      }

      if (children.length > 0) {
        const { data: carousel } = await axios.post(
          `https://graph.facebook.com/v21.0/${account.instagramBusinessId}/media`,
          null,
          {
            params: {
              caption: post.content,
              media_type: 'CAROUSEL',
              children: children.join(','),
              access_token: account.accessToken,
            },
          }
        );
        
        // Wait for the carousel container to finish processing
        await waitForInstagramMedia(carousel.id, account.accessToken);

        const { data } = await axios.post(
          `https://graph.facebook.com/v21.0/${account.instagramBusinessId}/media_publish`,
          null,
          { params: { creation_id: carousel.id, access_token: account.accessToken } }
        );
        console.log(`[Instagram] Carousel published:`, data);
        return data;
      }
    }

    // Text-only — Instagram doesn't support text-only posts, skip gracefully
    throw new Error('Instagram requires at least one image or video to publish a post.');
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`[Instagram] Publishing error:`, error.response?.data || error.message);
    throw new Error(`Instagram publishing failed: ${errMsg}`);
  }
};

async function refreshPinterestToken(account) {
  try {
    const pinterestBaseUrl = process.env.PINTEREST_USE_SANDBOX === 'true' ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
    const response = await axios.post(`${pinterestBaseUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    account.accessToken = access_token;
    if (refresh_token) {
      account.refreshToken = refresh_token;
    }
    account.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await account.save();
    return access_token;
  } catch (err) {
    console.error('[Pinterest Token Refresh Failed]', err.response?.data || err.message);
    throw new Error('Failed to refresh Pinterest authorization. Please reconnect your Pinterest account.');
  }
}

export const publishToPinterest = async (post, account) => {
  try {
    console.log(`[Pinterest] Publishing post ${post._id}`);
    const pinterestBaseUrl = process.env.PINTEREST_USE_SANDBOX === 'true' ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';

    let accessToken = account.accessToken;
    // Check if token needs to be refreshed
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      console.log(`[Pinterest] Access token expired, refreshing...`);
      accessToken = await refreshPinterestToken(account);
    }

    // Step 1: Resolve board_id
    let boardId;
    try {
      const boardsRes = await axios.get(`${pinterestBaseUrl}/boards`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (boardsRes.data && boardsRes.data.items && boardsRes.data.items.length > 0) {
        // Find a board containing 'mediamation' (case-insensitive)
        const existingMediamationBoard = boardsRes.data.items.find(
          b => b.name && b.name.toLowerCase().includes('mediamation')
        );
        if (existingMediamationBoard) {
          boardId = existingMediamationBoard.id;
          console.log(`[Pinterest] Using existing Mediamation board: ${existingMediamationBoard.name} (${boardId})`);
        } else {
          // Fallback to the first available board
          boardId = boardsRes.data.items[0].id;
          console.log(`[Pinterest] Using first available board: ${boardsRes.data.items[0].name} (${boardId})`);
        }
      }
    } catch (e) {
      console.error('[Pinterest] Error fetching boards:', e.response?.data || e.message);
    }

    // If no board was found, create one
    if (!boardId) {
      console.log(`[Pinterest] Creating 'Mediamation Board'...`);
      try {
        const boardCreateRes = await axios.post(`${pinterestBaseUrl}/boards`, {
          name: 'Mediamation Board',
          description: 'Auto-created board for scheduled posts',
          privacy: 'PUBLIC'
        }, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        boardId = boardCreateRes.data.id;
        console.log(`[Pinterest] Created board successfully. ID: ${boardId}`);
      } catch (e) {
        console.error('[Pinterest] Error creating board:', e.response?.data || e.message);
        
        // Check if the failure is due to the board already existing
        const isDuplicateError = 
          e.response?.data?.message?.toLowerCase().includes('already have a board') ||
          e.message?.toLowerCase().includes('already have a board') ||
          e.response?.data?.message?.toLowerCase().includes('duplicate') ||
          e.response?.status === 409;
        
        if (isDuplicateError) {
          console.log('[Pinterest] Board already exists. Fetching existing boards to retrieve ID...');
          try {
            const boardsRes = await axios.get(`${pinterestBaseUrl}/boards`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (boardsRes.data && boardsRes.data.items) {
              const existingMediamationBoard = boardsRes.data.items.find(
                b => b.name && b.name.toLowerCase().includes('mediamation')
              );
              if (existingMediamationBoard) {
                boardId = existingMediamationBoard.id;
                console.log(`[Pinterest] Successfully recovered board ID for Mediamation: ${existingMediamationBoard.name} (${boardId})`);
              }
            }
          } catch (fetchError) {
            console.error('[Pinterest] Failed to fetch boards during duplicate recovery:', fetchError.response?.data || fetchError.message);
          }
        }
        
        if (!boardId) {
          throw new Error(`Failed to create Pinterest board: ${e.response?.data?.message || e.message}`);
        }
      }
    }

    // Step 2: Handle media conversion (Pins require an image)
    const firstMedia = post.media[0];
    if (!firstMedia) {
      throw new Error('Pinterest posts (Pins) require at least one image.');
    }

    const localFile = getLocalFile(firstMedia.url);
    let mediaSource;

    if (localFile) {
      console.log(`[Pinterest] Local file detected. Converting to base64...`);
      const fileBuffer = fs.readFileSync(localFile.path);
      const base64Data = fileBuffer.toString('base64');
      const ext = path.extname(localFile.path).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      if (ext === '.gif') contentType = 'image/gif';

      mediaSource = {
        source_type: 'image_base64',
        content_type: contentType,
        data: base64Data
      };
    } else {
      console.log(`[Pinterest] Using public media URL: ${firstMedia.url}`);
      mediaSource = {
        source_type: 'image_url',
        url: firstMedia.url
      };
    }

    // Step 3: Create the Pin
    const pinPayload = {
      board_id: boardId,
      title: post.content.split('\n')[0].slice(0, 100) || 'Scheduled Pin',
      description: post.content.slice(0, 800),
      media_source: mediaSource
    };

    console.log(`[Pinterest] Creating Pin on board ${boardId}...`);
    const pinRes = await axios.post(`${pinterestBaseUrl}/pins`, pinPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[Pinterest] Pin created successfully! ID: ${pinRes.data.id}`);
    return pinRes.data;

  } catch (error) {
    console.error('[Pinterest Publishing Error]', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message);
  }
};

async function refreshTwitterToken(account) {
  try {
    const response = await axios.post('https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: process.env.TWITTER_CLIENT_ID,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    account.accessToken = access_token;
    if (refresh_token) {
      account.refreshToken = refresh_token;
    }
    account.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await account.save();
    return access_token;
  } catch (err) {
    console.error('[Twitter Token Refresh Failed]', err.response?.data || err.message);
    throw new Error('Failed to refresh Twitter authorization. Please reconnect your Twitter account.');
  }
}

export const publishToTwitter = async (post, account) => {
  try {
    console.log(`[Twitter] Publishing post ${post._id}`);

    let accessToken = account.accessToken;
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      console.log(`[Twitter] Access token expired, refreshing...`);
      accessToken = await refreshTwitterToken(account);
    }

    const mediaIds = [];

    // Step 1: Upload media if exists
    for (const file of post.media) {
      const localFile = getLocalFile(file.url);
      if (localFile) {
        console.log(`[Twitter] Uploading local file: ${localFile.filename} to Twitter...`);
        const form = new FormData();
        form.append('media', fs.createReadStream(localFile.path), { filename: localFile.filename });
        
        const uploadRes = await axios.post('https://upload.twitter.com/1.1/media/upload.json', form, {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (uploadRes.data && uploadRes.data.media_id_string) {
          mediaIds.push(uploadRes.data.media_id_string);
        }
      } else {
        console.log(`[Twitter] Fetching remote file for upload: ${file.url}`);
        const response = await axios.get(file.url, { responseType: 'stream' });
        const form = new FormData();
        form.append('media', response.data, { filename: 'upload_image.jpg' });

        const uploadRes = await axios.post('https://upload.twitter.com/1.1/media/upload.json', form, {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (uploadRes.data && uploadRes.data.media_id_string) {
          mediaIds.push(uploadRes.data.media_id_string);
        }
      }
    }

    // Step 2: Build the tweet payload
    const payload = {
      text: post.content
    };

    if (mediaIds.length > 0) {
      payload.media = {
        media_ids: mediaIds
      };
    }

    // Step 3: Publish the Tweet
    console.log(`[Twitter] Sending Tweet creation request...`);
    const tweetRes = await axios.post('https://api.twitter.com/2/tweets', payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[Twitter] Tweet published successfully! ID: ${tweetRes.data?.data?.id}`);
    return tweetRes.data?.data;

  } catch (error) {
    console.error('[Twitter Publishing Error]', error.response?.data || error.message);
    throw new Error(error.response?.data?.detail || error.response?.data?.message || error.message);
  }
};
