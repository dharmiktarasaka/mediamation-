import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { postsAPI, uploadAPI } from '../api/index.js';

export default function History() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  // Modal Editing States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editMedia, setEditMedia] = useState([]);
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadProgress, setEditUploadProgress] = useState('');
  const [editTone, setEditTone] = useState('attractive');
  const [generatingEditCaption, setGeneratingEditCaption] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await postsAPI.list({});
      setPosts(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load post history');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await postsAPI.remove(id);
      toast.success('Post deleted successfully');
      loadPosts();
    } catch (err) {
      toast.error('Failed to delete post');
    }
  };

  // Convert Date from Backend to Local ISO string (for datetime-local input)
  const formatLocalDate = (dateString) => {
    const d = new Date(dateString);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const handleOpenEditModal = (post) => {
    setEditingPostId(post._id);
    setEditContent(post.content);
    setEditScheduledAt(formatLocalDate(post.scheduledAt));
    setEditMedia(post.media.map(m => ({
      url: m.url,
      type: m.type
    })));
    setIsEditModalOpen(true);
  };

  const handleEditMediaChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setEditUploading(true);
    setEditUploadProgress(`Uploading 1 of ${files.length}...`);

    try {
      for (let i = 0; i < files.length; i++) {
        setEditUploadProgress(`Uploading ${i + 1} of ${files.length}...`);
        const formData = new FormData();
        formData.append('media', files[i]);

        const res = await uploadAPI.upload(formData);
        const uploadedFile = res.data.file;

        setEditMedia(prev => [...prev, {
          url: uploadedFile.url,
          type: uploadedFile.mimetype.startsWith('video/') ? 'video' : 'image'
        }]);
      }
      toast.success('Media added successfully!');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to upload media');
    } finally {
      setEditUploading(false);
      setEditUploadProgress('');
      e.target.value = '';
    }
  };

  const handleRemoveEditMedia = (index) => {
    setEditMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveEditMedia = (index, direction) => {
    setEditMedia(prev => {
      const updated = [...prev];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < updated.length) {
        const temp = updated[index];
        updated[index] = updated[targetIndex];
        updated[targetIndex] = temp;
      }
      return updated;
    });
  };

  const handleGenerateEditCaption = async () => {
    const imageFile = editMedia.find(file => file.type === 'image');
    if (!imageFile) {
      toast.error('Please upload or ensure at least one image in the gallery to generate a caption.');
      return;
    }

    setGeneratingEditCaption(true);
    try {
      const filename = imageFile.url.split('/').pop();
      const res = await uploadAPI.generateCaption({
        filename,
        mimetype: 'image/jpeg',
        tone: editTone,
      });
      setEditContent(res.data.caption);
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
      toast.error(err.response?.data?.message || 'Failed to generate AI caption');
    } finally {
      setGeneratingEditCaption(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      const utcScheduledAt = new Date(editScheduledAt).toISOString();
      await postsAPI.update(editingPostId, {
        content: editContent,
        scheduledAt: utcScheduledAt,
        media: editMedia
      });
      toast.success('Post updated successfully!');
      setIsEditModalOpen(false);
      loadPosts();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update post');
    }
  };

  // Filter posts client-side
  const filteredPosts = posts.filter(post => {
    const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
    const matchesPlatform = platformFilter === 'all' || post.platform === platformFilter;
    return matchesStatus && matchesPlatform;
  });

  return (
    <div className="history-page">
      <div className="page-header">
        <h2>Posting History & Queue</h2>
        <div className="filter-bar">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Platform</label>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="all">All Platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="pinterest">Pinterest</option>
              <option value="twitter">Twitter (X)</option>
              <option value="tumblr">Tumblr</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <span className="loading-spinner"></span>
          <p>Loading your history...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="card empty-state">
          <p className="empty">No posts match the selected filters.</p>
        </div>
      ) : (
        <div className="posts-grid">
          {filteredPosts.map((post) => (
            <div key={post._id} className={`post-item-card ${post.status}`}>
              <div className="post-header-meta">
                <span className={`platform-badge ${post.platform}`}>{post.platform}</span>
                <span className={`status-badge ${post.status}`}>{post.status}</span>
              </div>
              
              <div className="post-account-info">
                <strong>{post.account?.name || 'Account'}</strong>
                <span className="post-date-label">
                  {post.status === 'published' ? 'Published' : 'Scheduled'}:{' '}
                  {new Date(post.scheduledAt).toLocaleString()}
                </span>
              </div>

              <p className="post-body-text">{post.content}</p>

              {post.media && post.media.length > 0 && (
                <div className="post-media-gallery">
                  {post.media.map((item, idx) => (
                    <div key={idx} className="post-media-thumbnail">
                      {item.type === 'image' ? (
                        <img src={item.url} alt="post media" />
                      ) : (
                        <video src={item.url} muted controls={false}></video>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {post.status === 'failed' && post.error && (
                <div className="post-error-banner">
                  <strong>Error:</strong> {post.error}
                </div>
              )}

              <div className="post-card-actions">
                {post.status !== 'published' && post.status !== 'publishing' && (
                  <button 
                    className="btn-edit btn-sm"
                    onClick={() => handleOpenEditModal(post)}
                  >
                    Edit Post
                  </button>
                )}
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

      {/* Edit Post Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card animate-fade-in">
            <div className="modal-header">
              <h3>Edit Post Configuration</h3>
              <button className="btn-close" onClick={() => setIsEditModalOpen(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <div className="textarea-header" style={{ marginBottom: '8px' }}>
                  <label>Post Content</label>
                  {editMedia.some(f => f.type === 'image') && (
                    <div className="ai-controls-wrapper">
                      <select
                        value={editTone}
                        onChange={(e) => setEditTone(e.target.value)}
                        className="select-ai-tone"
                        disabled={generatingEditCaption}
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
                        onClick={handleGenerateEditCaption}
                        disabled={generatingEditCaption}
                      >
                        {generatingEditCaption ? 'Generating...' : 'AI Write'}
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  required
                  placeholder="What would you like to say?"
                />
              </div>

              <div className="form-group">
                <label>Media Carousel (Manage existing or upload more)</label>
                <div className="media-upload">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleEditMediaChange}
                    disabled={editUploading}
                    multiple
                  />
                  {editUploading && (
                    <div className="upload-progress-container">
                      <span className="upload-spinner"></span>
                      <p className="upload-progress-text">{editUploadProgress || 'Uploading...'}</p>
                    </div>
                  )}

                  {editMedia.length > 0 && (
                    <div className="media-preview-carousel-container">
                      <h5>Carousel Preview (Reorder items using arrows):</h5>
                      <div className="media-preview-carousel">
                        {editMedia.map((file, index) => (
                          <div key={index} className="media-carousel-item">
                            <span className="media-badge">{index + 1}</span>
                            {file.type === 'image' ? (
                              <img src={file.url} alt="thumbnail" />
                            ) : (
                              <video src={file.url} controls={false} muted></video>
                            )}
                            <div className="media-carousel-actions">
                              <button
                                type="button"
                                className="btn-carousel-action"
                                disabled={index === 0}
                                onClick={() => handleMoveEditMedia(index, 'left')}
                              >
                                &larr;
                              </button>
                              <button
                                type="button"
                                className="btn-carousel-action remove"
                                onClick={() => handleRemoveEditMedia(index)}
                              >
                                &times;
                              </button>
                              <button
                                type="button"
                                className="btn-carousel-action"
                                disabled={index === editMedia.length - 1}
                                onClick={() => handleMoveEditMedia(index, 'right')}
                              >
                                &rarr;
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={editUploading || generatingEditCaption}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
