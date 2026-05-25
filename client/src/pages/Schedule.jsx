import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { accountsAPI, postsAPI, uploadAPI } from '../api/index.js';

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [media, setMedia] = useState([]); // Store uploaded media
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [tone, setTone] = useState('attractive');
  const [form, setForm] = useState({
    accountId: '',
    content: '',
    scheduledAt: '',
    media: [],
  });

  const handleGenerateCaption = async () => {
    const imageFile = media.find(file => file.mimetype.startsWith('image/'));
    if (!imageFile) {
      toast.error('Please upload at least one image to generate a caption.');
      return;
    }

    setGeneratingCaption(true);
    try {
      const res = await uploadAPI.generateCaption({
        filename: imageFile.filename,
        mimetype: imageFile.mimetype,
        tone: tone,
      });
      setForm(prev => ({
        ...prev,
        content: res.data.caption
      }));
      if (res.data.isMock) {
        if (res.data.reason === 'api_error') {
          const isQuota = res.data.error?.toLowerCase().includes('quota') || res.data.error?.includes('429');
          if (isQuota) {
            toast.error(
              'Gemini API Daily Free Quota Exceeded (20 requests/day). Generated a simulated caption for you instead. Try again later or upgrade your key on Google AI Studio.',
              { duration: 10000 }
            );
          } else {
            toast.error(`Gemini API Error: ${res.data.error || 'Unknown error'}. Falling back to simulated caption.`, { duration: 8000 });
          }
        } else {
          toast((t) => (
            <span>
              ℹ️ Simulated caption. Add a valid <b>GEMINI_API_KEY</b> to your <b>server/.env</b> to analyze real images!
            </span>
          ), { duration: 8000 });
        }
      } else {
        toast.success('AI Caption generated successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to generate AI caption. Make sure GEMINI_API_KEY is configured in your server/.env');
    } finally {
      setGeneratingCaption(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('connected') === 'facebook') {
      toast.success('Facebook/Instagram connected!');
    }
    if (searchParams.get('error')) {
      toast.error('Failed to connect account');
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [accRes, postRes] = await Promise.all([
        accountsAPI.list(),
        postsAPI.list({}),
      ]);
      setAccounts(accRes.data);
      setPosts(postRes.data);
    } catch (err) {
      console.error('Failed to load data:', err.response?.data?.message || err.message);
      toast.error('Failed to load data. Please refresh the page.');
    }
  };

  const handleMediaChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(`Uploading 1 of ${files.length}...`);

    try {
      // Process files sequentially (one-by-one) to guarantee that the user's
      // selection order is preserved exactly in the uploaded media list.
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Uploading ${i + 1} of ${files.length}...`);
        const formData = new FormData();
        formData.append('media', files[i]);

        const res = await uploadAPI.upload(formData);
        setMedia(prev => [...prev, res.data.file]);
      }
      toast.success('All media uploaded successfully!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.message || 'Failed to upload media');
    } finally {
      setUploading(false);
      setUploadProgress('');
      e.target.value = ''; // Reset file input so the same files can be re-selected if needed
    }
  };

  const handleRemoveMedia = (index) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveMedia = (index, direction) => {
    setMedia(prev => {
      const updated = [...prev];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < updated.length) {
        // Swap elements
        const temp = updated[index];
        updated[index] = updated[targetIndex];
        updated[targetIndex] = temp;
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const transformedMedia = media.map(m => ({
        url: m.url,
        type: m.mimetype.startsWith('video/') ? 'video' : 'image'
      }));
      
      const utcScheduledAt = new Date(form.scheduledAt).toISOString();
      
      await postsAPI.create({
        ...form,
        scheduledAt: utcScheduledAt,
        media: transformedMedia
      });
      toast.success('Post scheduled!');
      setForm({ accountId: '', content: '', scheduledAt: '', media: [] });
      setMedia([]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to schedule post');
    }
  };

  const handleDelete = async (id) => {
    try {
      await postsAPI.remove(id);
      toast.success('Post deleted successfully');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete post');
    }
  };

  return (
    <div className="schedule-page">
      <div className="card form-card">
        <h3>Schedule New Post</h3>
        <form onSubmit={handleSubmit}>
          <select
            value={form.accountId}
            onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            required
          >
            <option value="">Select account</option>
            {accounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.platform} — {acc.name}
              </option>
            ))}
          </select>

          <div className="media-upload">
            <h4>Media Upload (Carousel Support)</h4>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleMediaChange}
              disabled={uploading}
              multiple
            />
            {uploading && (
              <div className="upload-progress-container">
                <span className="upload-spinner"></span>
                <p className="upload-progress-text">{uploadProgress || 'Uploading...'}</p>
              </div>
            )}

            {media.length > 0 && (
              <div className="media-preview-carousel-container">
                <h5>Carousel Preview (Reorder sequence using arrows):</h5>
                <div className="media-preview-carousel">
                  {media.map((file, index) => (
                    <div key={index} className="media-carousel-item">
                      <span className="media-badge">{index + 1}</span>
                      {file.mimetype.startsWith('image/') ? (
                        <img src={file.url} alt={file.originalname} />
                      ) : (
                        <video src={file.url} controls={false} muted></video>
                      )}
                      <div className="media-carousel-actions">
                        <button
                          type="button"
                          className="btn-carousel-action"
                          disabled={index === 0}
                          onClick={() => handleMoveMedia(index, 'left')}
                          title="Move Left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="carousel-btn-icon">
                            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="btn-carousel-action remove"
                          onClick={() => handleRemoveMedia(index)}
                          title="Remove"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="carousel-btn-icon remove-icon">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.587 7.402a.75.75 0 01.748.705l.3 6a.75.75 0 01-1.496.075l-.3-6a.75.75 0 01.748-.78zM12.16 7.478a.75.75 0 01.705.747l-.3 6a.75.75 0 01-1.496-.074l.3-6a.75.75 0 01.79-.673z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="btn-carousel-action"
                          disabled={index === media.length - 1}
                          onClick={() => handleMoveMedia(index, 'right')}
                          title="Move Right"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="carousel-btn-icon">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="textarea-header">
            <label>Post Content</label>
            {media.some(file => file.mimetype.startsWith('image/')) && (
              <div className="ai-controls-wrapper">
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="select-ai-tone"
                  disabled={generatingCaption}
                  title="Choose AI Tone"
                >
                  <option value="attractive">Attractive ✨</option>
                  <option value="professional">Professional 📈</option>
                  <option value="funny">Funny 😂</option>
                  <option value="personal">Personal 💬</option>
                  <option value="joy">Joy ☀️</option>
                  <option value="advertisement">Advertisement 📢</option>
                  <option value="marketing">Marketing 🎯</option>
                </select>
                <button
                  type="button"
                  className="btn-ai-generate"
                  onClick={handleGenerateCaption}
                  disabled={generatingCaption}
                  title="Generate AI Caption"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="ai-icon">
                    <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.845.813a.75.75 0 0 1 0 1.442l-2.845.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.845-.813a.75.75 0 0 1 0-1.442l2.845-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258.903a1.5 1.5 0 0 0 1.05 1.05l.903.258a.75.75 0 0 1 0 1.448l-.903.258a1.5 1.5 0 0 0-1.05 1.05l-.258.903a.75.75 0 0 1-1.448 0l-.258-.903a1.5 1.5 0 0 0-1.05-1.05l-.903-.258a.75.75 0 0 1 0-1.448l.903-.258a1.5 1.5 0 0 0 1.05-1.05l.258-.903A.75.75 0 0 1 18 1.5ZM11.25 21a.75.75 0 0 1 .728.568l.258.903a1.5 1.5 0 0 0 1.05 1.05l.903.258a.75.75 0 0 1 0 1.448l-.903.258a1.5 1.5 0 0 0-1.05 1.05l-.258.903a.75.75 0 0 1-1.448 0l-.258-.903a1.5 1.5 0 0 0-1.05-1.05l-.903-.258a.75.75 0 0 1 0-1.448l.903-.258a1.5 1.5 0 0 0 1.05-1.05l.258-.903A.75.75 0 0 1 11.25 21Z" clipRule="evenodd" />
                  </svg>
                  {generatingCaption ? 'Generating...' : 'AI Write'}
                </button>
              </div>
            )}
          </div>

          <textarea
            placeholder="Post content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={4}
            required
          />
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            required
          />
          <button type="submit" className="btn-primary">
            {uploading ? 'Uploading...' : 'Schedule'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Scheduled Posts</h3>
        {posts.length === 0 ? (
          <p className="empty">No posts yet</p>
        ) : (
          <div className="posts-list">
            {posts.map((post) => (
              <div key={post._id} className={`post-item ${post.status}`}>
                <div className="post-meta">
                  <span className={`platform-badge ${post.platform}`}>{post.platform}</span>
                  <span className={`status-badge ${post.status}`}>{post.status}</span>
                  <span className="post-date">{new Date(post.scheduledAt).toLocaleString()}</span>
                </div>
                <p className="post-content">{post.content}</p>
                {post.media && post.media.length > 0 && (
                  <div className="post-media">
                    {post.media.map((media, index) => (
                      <div key={index} className={`media-preview ${media.type}`}>
                        {media.type === 'image' ? (
                          <img src={media.url} alt="Post media" style={{maxWidth: '100px'}} />
                        ) : (
                          <video controls style={{maxWidth: '100px'}} src={media.url}></video>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {post.status === 'failed' && (
                  <p className="post-error">{post.error}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                  <button 
                    className="btn-danger btn-sm" 
                    onClick={() => handleDelete(post._id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
