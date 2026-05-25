import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { authAPI } from '../api/index.js';

export default function Settings() {
  const { user, setUser } = useAuth();
  
  const [aiProvider, setAiProvider] = useState(user?.aiProvider || 'mock');
  const [groqApiKey, setGroqApiKey] = useState(user?.groqApiKey || '');
  const [geminiApiKey, setGeminiApiKey] = useState(user?.geminiApiKey || '');
  
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authAPI.updateSettings({
        aiProvider,
        groqApiKey,
        geminiApiKey
      });
      
      // Update local state in Context
      setUser(res.data);
      toast.success('AI Settings updated successfully!');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>Application Settings</h2>
        <p className="subtitle">Configure AI integration models and custom developer API keys.</p>
      </div>

      <div className="card shadow-sm" style={{ maxWidth: '650px', marginTop: '24px' }}>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="aiProvider" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
              AI Provider for Caption Generation
            </label>
            <select
              id="aiProvider"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            >
              <option value="mock">Simulated Templates (No Key Required)</option>
              <option value="groq">Groq (Llama-3.2 Vision - Ultra Fast)</option>
              <option value="gemini">Google Gemini (Gemini-2.5 Flash)</option>
            </select>
            <p className="help-text" style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px' }}>
              Select which AI platform to use when generating hooks and captions for your uploads.
            </p>
          </div>

          {aiProvider === 'groq' && (
            <div className="form-group" style={{ marginTop: '20px' }}>
              <label htmlFor="groqApiKey" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Groq API Key
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="groqApiKey"
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  placeholder="gsk_..."
                  className="form-control"
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  className="btn-secondary btn-sm"
                  style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
                >
                  {showGroqKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="help-text" style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px' }}>
                Get your API key from the <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Groq Console</a>.
              </p>
            </div>
          )}

          {aiProvider === 'gemini' && (
            <div className="form-group" style={{ marginTop: '20px' }}>
              <label htmlFor="geminiApiKey" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Google Gemini API Key
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="geminiApiKey"
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="form-control"
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="btn-secondary btn-sm"
                  style={{ padding: '0 12px', whiteSpace: 'nowrap' }}
                >
                  {showGeminiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="help-text" style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px' }}>
                Get your API key from the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Google AI Studio</a>.
              </p>
            </div>
          )}

          <div style={{ marginTop: '28px', display: 'flex', gap: '12px' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              style={{ padding: '10px 24px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
