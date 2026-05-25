import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { accountsAPI, postsAPI } from '../api/index.js';
import { signInWithPopup, FacebookAuthProvider } from 'firebase/auth';
import { auth, facebookProvider } from '../config/firebase.js';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [showInstaHelp, setShowInstaHelp] = useState(false);
  const [showInstaModal, setShowInstaModal] = useState(false);
  const [instaUsername, setInstaUsername] = useState('');
  const [instaPassword, setInstaPassword] = useState('');
  const [instaCode, setInstaCode] = useState('');
  const [instaStep, setInstaStep] = useState(1); // 1 = Login details, 2 = Code verification
  const [connectingInsta, setConnectingInsta] = useState(false);

  useEffect(() => {
    accountsAPI.list().then((res) => setAccounts(res.data));
    postsAPI.list({ status: 'scheduled' }).then((res) => setPosts(res.data));

    if (searchParams.get('connected') === 'facebook') {
      toast.success('Facebook account connected successfully!');
    } else if (searchParams.get('error') === 'facebook_auth_failed') {
      toast.error('Failed to connect Facebook account.');
    } else if (searchParams.get('error') === 'no_pages_found') {
      toast.error('Connected successfully, but no Facebook Pages were found. Make sure you own/manage a Page and selected it during login.');
    } else if (searchParams.get('connected') === 'pinterest') {
      toast.success('Pinterest account connected successfully!');
    } else if (searchParams.get('error') === 'pinterest_auth_failed') {
      toast.error('Failed to connect Pinterest account.');
    } else if (searchParams.get('connected') === 'twitter') {
      toast.success('Twitter (X) account connected successfully!');
    } else if (searchParams.get('error') === 'twitter_auth_failed') {
      toast.error('Failed to connect Twitter (X) account.');
    }
  }, [searchParams]);

  const handleConnectFacebook = async () => {
    try {
      const res = await accountsAPI.facebookAuth();
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start Facebook authentication.');
    }
  };

  const handleConnectPinterest = async () => {
    try {
      const res = await accountsAPI.pinterestAuth();
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start Pinterest authentication.');
    }
  };

  const handleConnectTwitter = async () => {
    try {
      const res = await accountsAPI.twitterAuth();
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start Twitter (X) authentication.');
    }
  };

  const handleConnectInstagram = () => {
    setShowInstaModal(true);
    setInstaStep(1);
    setInstaUsername('');
    setInstaPassword('');
    setInstaCode('');
  };

  const handlePrivateInstaSubmit = async (e) => {
    e.preventDefault();
    if (!instaUsername) return;

    setConnectingInsta(true);
    try {
      if (instaStep === 1) {
        if (!instaPassword) return;
        const res = await accountsAPI.connectInstagramPrivate({
          username: instaUsername.replace(/^@/, '').trim(),
          password: instaPassword.trim(),
        });
        
        if (res.data?.status === 'challenge_required') {
          toast.success(res.data.message);
          setInstaStep(2);
        } else {
          toast.success('Instagram account connected successfully!');
          setShowInstaModal(false);
          setInstaUsername('');
          setInstaPassword('');
          accountsAPI.list().then((res) => setAccounts(res.data));
        }
      } else {
        if (!instaCode) return;
        await accountsAPI.connectInstagramPrivate({
          username: instaUsername.replace(/^@/, '').trim(),
          code: instaCode.trim(),
        });
        toast.success('Instagram account connected successfully!');
        setShowInstaModal(false);
        setInstaUsername('');
        setInstaPassword('');
        setInstaCode('');
        setInstaStep(1);
        accountsAPI.list().then((res) => setAccounts(res.data));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect Instagram account.');
    } finally {
      setConnectingInsta(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Welcome, {user?.name}</h2>
        <button className="btn-logout" onClick={logout}>Logout</button>
      </div>

      <div className="cards">
        <div className="card">
          <h3>Connected Accounts</h3>
          {accounts.length === 0 ? (
            <p className="empty">No accounts connected</p>
          ) : (
            <ul className="account-list">
              {accounts.map((acc) => (
                <li key={acc._id}>
                  <span className={`platform-badge ${acc.platform}`}>{acc.platform}</span>
                  {acc.name}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={handleConnectFacebook}>
              + Connect Facebook
            </button>
            <button 
              className="btn-primary" 
              style={{ background: 'var(--ig)' }} 
              onClick={handleConnectInstagram}
            >
              + Connect Instagram
            </button>
            <button 
              className="btn-primary" 
              style={{ background: '#bd081c' }} 
              onClick={handleConnectPinterest}
            >
              + Connect Pinterest
            </button>
            <button 
              className="btn-primary" 
              style={{ background: '#1da1f2' }} 
              onClick={handleConnectTwitter}
            >
              + Connect Twitter
            </button>
          </div>

          <div style={{ marginTop: '14px' }}>
            <button 
              type="button" 
              onClick={() => setShowInstaHelp(!showInstaHelp)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              {showInstaHelp ? 'Hide requirements' : 'Need help connecting Instagram?'}
            </button>
            {showInstaHelp && (
              <div className="insta-help-box">
                <h4>Instagram Requirements:</h4>
                <ol>
                  <li>Must be a <strong>Professional Account</strong> (Creator or Business). Personal accounts are not supported by the Meta API.</li>
                  <li>Must be <strong>linked to a Facebook Page</strong> where you are an Admin.</li>
                  <li>When signing in, you must select <strong>both</strong> the page and the linked Instagram account and accept all scopes.</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Upcoming Posts</h3>
          {posts.length === 0 ? (
            <p className="empty">No scheduled posts</p>
          ) : (
            <ul className="post-list">
              {posts.slice(0, 5).map((post) => (
                <li key={post._id}>
                  <strong>{post.platform}</strong> — {new Date(post.scheduledAt).toLocaleString()}
                  <p className="preview">{post.content.slice(0, 80)}...</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showInstaModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3 style={{ marginBottom: '8px' }}>Connect Instagram Profile</h3>
            
            {instaStep === 1 ? (
              <>
                <p className="subtitle" style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px', lineHeight: '1.4' }}>
                  Connect directly using your Instagram username and password. No Meta configuration, App review, or Facebook developer settings needed!
                </p>
                <form onSubmit={handlePrivateInstaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input
                    type="text"
                    placeholder="Instagram Username (e.g. taylorswift)"
                    value={instaUsername}
                    onChange={(e) => setInstaUsername(e.target.value)}
                    required
                    disabled={connectingInsta}
                  />
                  <input
                    type="password"
                    placeholder="Instagram Password"
                    value={instaPassword}
                    onChange={(e) => setInstaPassword(e.target.value)}
                    required
                    disabled={connectingInsta}
                  />
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button 
                      type="button" 
                      className="btn-logout" 
                      onClick={() => setShowInstaModal(false)}
                      disabled={connectingInsta}
                      style={{ padding: '10px 16px', margin: 0, fontSize: '14px' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      disabled={connectingInsta}
                      style={{ padding: '10px 20px', fontSize: '14px' }}
                    >
                      {connectingInsta ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="subtitle" style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px', lineHeight: '1.4' }}>
                  Instagram requires verification to trust this login attempt. Please enter the security code sent to your email or mobile device.
                </p>
                <form onSubmit={handlePrivateInstaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input
                    type="text"
                    placeholder="Verification Code (e.g. 123456)"
                    value={instaCode}
                    onChange={(e) => setInstaCode(e.target.value)}
                    required
                    disabled={connectingInsta}
                  />
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button 
                      type="button" 
                      className="btn-logout" 
                      onClick={() => { setInstaStep(1); setInstaCode(''); }}
                      disabled={connectingInsta}
                      style={{ padding: '10px 16px', margin: 0, fontSize: '14px' }}
                    >
                      Back
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      disabled={connectingInsta}
                      style={{ padding: '10px 20px', fontSize: '14px' }}
                    >
                      {connectingInsta ? 'Verifying...' : 'Verify Code'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
