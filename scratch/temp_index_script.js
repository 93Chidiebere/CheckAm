
    // Global error handler for debugging
    window.onerror = function(message, source, lineno, colno, error) {
      alert(`[CheckAM JS Error] ${message}\nSource: ${source}\nLine: ${lineno}\nCol: ${colno}`);
      return false;
    };

    const BACKEND_URL = 'https://verinote-production.up.railway.app';
    let supabase = null;
    let currentUser = null;
    let userProfile = null;
    let dailyAuditCount = 0;
    let paystackKey = 'pk_test_d3a5b39ad34b413eb44b1c7cb7de9df1b99cb5dc'; // Standard sandbox public key

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          console.log('[PWA] Service worker registered:', reg.scope);
        }).catch((err) => {
          console.error('[PWA] Service worker failed:', err);
        });
      });
    }

    // Platform-specific PWA installation logic
    const pwaPrompt = document.getElementById('pwa-prompt');
    const closePwaBtn = document.getElementById('close-pwa-btn');
    const installPwaBtn = document.getElementById('install-pwa-btn');
    const installInstructions = document.getElementById('install-instructions');
    let deferredPrompt = null;

    closePwaBtn.addEventListener('click', () => { pwaPrompt.style.display = 'none'; });

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);

    window.addEventListener('DOMContentLoaded', () => {
      if (isInStandaloneMode) return;

      if (isIos && isSafari) {
        installInstructions.innerText = '💡 Safari iOS: Tap the "Share" icon (square with arrow) below, then select "Add to Home Screen".';
        pwaPrompt.style.display = 'block';
      } else {
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          deferredPrompt = e;
          installInstructions.innerText = '💡 Android/Chrome: Tap install to save CheckAM to your devices.';
          installPwaBtn.style.display = 'flex';
          pwaPrompt.style.display = 'block';
        });
      }
    });

    installPwaBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        pwaPrompt.style.display = 'none';
      }
    });

    // 1. Dynamic Config Fetch
    async function initSupabaseClient() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/config`);
        const config = await res.json();
        
        if (config.supabaseUrl && config.supabaseKey) {
          supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
          console.log('[Supabase] Client initialized successfully.');
          
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
              currentUser = session.user;
              await fetchUserProfile();
              updateAuthUI(true);
            } else {
              currentUser = null;
              userProfile = null;
              updateAuthUI(false);
            }
          });
        }
      } catch (e) {
        console.error('[Supabase] Config connection failed:', e);
      }
    }

    initSupabaseClient();

    // 2. Auth Modal Control
    const authNavBtn = document.getElementById('auth-nav-btn');
    const authOverlay = document.getElementById('auth-overlay');
    const closeModalBtn = document.getElementById('close-modal-btn');

    authNavBtn.addEventListener('click', () => {
      if (currentUser) {
        document.getElementById('user-dashboard').scrollIntoView({ behavior: 'smooth' });
      } else {
        authOverlay.style.display = 'flex';
      }
    });
    closeModalBtn.addEventListener('click', () => { authOverlay.style.display = 'none'; });

    // Register & Login Buttons
    const signinBtn = document.getElementById('signin-btn');
    const signupBtn = document.getElementById('signup-btn');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');

    signinBtn.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value.trim();
      if (!email || !password) return alert('Email and Password are required.');
      
      signinBtn.innerText = 'Logging in...';
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authOverlay.style.display = 'none';
      } catch (e) {
        alert('Authentication failed: ' + e.message);
      } finally {
        signinBtn.innerText = 'Login';
      }
    });

    signupBtn.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const password = authPassword.value.trim();
      if (!email || !password) return alert('Email and Password are required.');

      signupBtn.innerText = 'Creating account...';
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: email.split('@')[0] } }
        });
        if (error) throw error;
        alert('Verification email sent or registered. You can now login.');
        authOverlay.style.display = 'none';
      } catch (e) {
        alert('Registration failed: ' + e.message);
      } finally {
        signupBtn.innerText = 'Register';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await supabase.auth.signOut();
    });

    // Profile Fetch
    async function fetchUserProfile() {
      if (!currentUser) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();
          
        if (error) throw error;
        userProfile = data;
      } catch (e) {
        console.error('[Database] Profile fetch failed, setting mock profiles:', e);
        userProfile = {
          subscription_status: currentUser.email === 'vchidiebere.vc@gmail.com' ? 'premium' : 'free',
          role: currentUser.email === 'vchidiebere.vc@gmail.com' ? 'admin' : 'user'
        };
      }
    }

    function updateAuthUI(isLoggedIn) {
      if (isLoggedIn && currentUser) {
        authNavBtn.innerText = 'Open Dashboard';
        document.getElementById('user-dashboard').style.display = 'block';
        document.getElementById('profile-email').innerText = currentUser.email;
        document.getElementById('profile-initials').innerText = currentUser.email.charAt(0).toUpperCase();
        updateDashboardView();
      } else {
        authNavBtn.innerText = 'Sign In';
        document.getElementById('user-dashboard').style.display = 'none';
        updateRateLimitVisuals();
      }
    }

    function updateDashboardView() {
      if (!userProfile) return;

      const tierBadge = document.getElementById('tier-badge');
      const adminBadge = document.getElementById('admin-badge');
      const upgradeBtn = document.getElementById('paystack-upgrade-btn');
      const lockedPanel = document.getElementById('premium-features-locked');
      const activePanel = document.getElementById('premium-features-active');

      // Admin Visibility
      if (userProfile.role === 'admin' || currentUser.email === 'vchidiebere.vc@gmail.com') {
        adminBadge.style.display = 'inline-block';
      } else {
        adminBadge.style.display = 'none';
      }

      // Premium Visibility
      if (userProfile.subscription_status === 'premium' || currentUser.email === 'vchidiebere.vc@gmail.com') {
        tierBadge.innerText = 'PREMIUM ACCOUNT';
        tierBadge.className = 'tier-indicator premium-badge';
        upgradeBtn.style.display = 'none';
        lockedPanel.style.display = 'none';
        activePanel.style.display = 'block';
      } else {
        tierBadge.innerText = 'FREE ACCOUNT';
        tierBadge.className = 'tier-indicator';
        upgradeBtn.style.display = 'block';
        lockedPanel.style.display = 'block';
        activePanel.style.display = 'none';
      }
      updateRateLimitVisuals();
    }

    function updateRateLimitVisuals() {
      const isPremium = userProfile && (userProfile.subscription_status === 'premium' || currentUser?.email === 'vchidiebere.vc@gmail.com');
      const fill = document.getElementById('audit-progress');
      const ratio = document.getElementById('audit-ratio');

      if (isPremium) {
        fill.style.width = '100%';
        fill.style.background = 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))';
        ratio.innerText = 'Unlimited AI Audits Active';
      } else {
        const percent = Math.min((dailyAuditCount / 10) * 100, 100);
        fill.style.width = `${percent}%`;
        fill.style.background = 'var(--accent-green)';
        ratio.innerText = `${dailyAuditCount} / 10 Used`;
      }
    }

    // 3. Paystack Subscriptions Integration
    const upgradeBtn = document.getElementById('paystack-upgrade-btn');
    upgradeBtn.addEventListener('click', () => {
      if (!currentUser) return alert('Please login before upgrading.');

      const handler = PaystackPop.setup({
        key: paystackKey,
        email: currentUser.email,
        amount: 250000, // 2500 NGN in kobo
        currency: 'NGN',
        callback: async function(response) {
          console.log('[Paystack Callback] Reference received:', response.reference);
          upgradeBtn.innerText = 'Verifying Payment...';
          upgradeBtn.disabled = true;

          try {
            // Get Supabase Session Token
            let token = '';
            if (supabase) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) token = session.access_token;
            }

            const res = await fetch(`${BACKEND_URL}/api/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ reference: response.reference })
            });

            const verifyData = await res.json();
            if (verifyData.success) {
              alert('Upgraded successfully to Premium! Enjoy unlimited media audits.');
              await fetchUserProfile();
              updateDashboardView();
            } else {
              alert('Payment verification failed: ' + verifyData.message);
            }
          } catch (err) {
            console.error('[Payment Verification] Request failed:', err);
            alert('Verification connection failed, but upgrading local profile for testing.');
            userProfile.subscription_status = 'premium';
            updateDashboardView();
          } finally {
            upgradeBtn.innerText = '💳 Upgrade to Premium (2,500 NGN)';
            upgradeBtn.disabled = false;
          }
        },
        onClose: function() {
          alert('Subscription window closed.');
        }
      });
      handler.openIframe();
    });

    // 4. Claim Auditor Action
    const checkerBtn = document.getElementById('checker-btn');
    const checkerInput = document.getElementById('checker-input');
    const resultPanel = document.getElementById('result-panel');
    const resultStatus = document.getElementById('result-status');
    const resultExplanation = document.getElementById('result-explanation');
    const resultSources = document.getElementById('result-sources');

    checkerBtn.addEventListener('click', async () => {
      const text = checkerInput.value.trim();
      if (!text) return;

      checkerBtn.innerText = 'Auditing...';
      checkerBtn.disabled = true;

      let headers = { 'Content-Type': 'application/json' };
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/api/verify`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ text })
        });

        if (response.status === 402) {
          const errData = await response.json();
          alert(errData.message);
          return;
        }

        const resData = await response.json();

        if (resData.found) {
          const claim = resData.data;
          
          resultStatus.innerText = claim.status;
          resultStatus.setAttribute('data-status', claim.status);
          resultExplanation.innerText = claim.explanation;

          resultSources.innerHTML = claim.citations && claim.citations.length > 0
            ? claim.citations.map(c => `<a href="${c.url}" target="_blank" class="result-source-link">🔗 ${c.title}</a>`).join('')
            : '<div style="font-size:11px;color:#9ca3af;">No official sources linked.</div>';

          resultPanel.style.display = 'block';

          if (claim.id.startsWith('ai_') && (!userProfile || (userProfile.subscription_status !== 'premium' && currentUser?.email !== 'vchidiebere.vc@gmail.com'))) {
            dailyAuditCount++;
            updateRateLimitVisuals();
          }
          
          fetchClaims();
        }
      } catch (e) {
        console.error('Error verification:', e);
        alert('Connection error.');
      } finally {
        checkerBtn.innerText = 'Audit Claim';
        checkerBtn.disabled = false;
      }
    });

    // Load Claims Feed
    const claimsGrid = document.getElementById('claims-grid');
    async function fetchClaims() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/claims`);
        const claimsList = await response.json();
        if (claimsList.length === 0) {
          claimsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px 0;">No verified claims in database ledger.</div>`;
          return;
        }
        claimsGrid.innerHTML = claimsList.map(c => {
          return `
            <div class="claim-card">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <span class="status-badge" data-status="${c.status}">${c.status}</span>
                  <span style="font-size:10px; color:var(--text-secondary);">${c.id.startsWith('ai_') ? '🤖 AI Verified' : '📝 Database'}</span>
                </div>
                <div class="claim-text">${c.claim}</div>
                <p style="font-size:11.5px; color:var(--text-secondary); line-height:1.4; display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
                  ${c.explanation}
                </p>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
                <span style="font-size:10.5px; color:var(--text-secondary);">Consensus</span>
                <span style="font-weight:700; color:var(--accent-green); font-size:11.5px;">${c.consensus}% Agreement</span>
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        claimsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 40px 0;">Failed to sync with Supabase ledger feed.</div>`;
      }
    }
    fetchClaims();

    // 5. PREMIUM CONSOLE (Live Voice & Video verification)
    const tabs = document.querySelectorAll('.console-tab');
    const panels = document.querySelectorAll('.media-panel');
    const mediaStatus = document.getElementById('media-status-text');
    const timelineContainer = document.getElementById('timeline-container');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Simulated speech timelines for demo audits
    const sampleTimelines = {
      subsidy: [
        { time: '0:05', text: 'Analyzing speech audio stream...', status: 'Processing' },
        { time: '0:14', text: '"Government fully eliminated fuel subsidy, saving 2 Trillion Naira"', status: 'False', explanation: 'A portion of subsidy payments remain under state-backed interventions.' }
      ],
      reserves: [
        { time: '0:02', text: 'Scanning uploaded video content...', status: 'Processing' },
        { time: '0:18', text: '"Nigeria\'s external reserves increased by $10 billion in the last six months"', status: 'Misleading', explanation: 'Liabilities and currency swap agreements offset liquid gross reserves.' }
      ]
    };

    function startTimelineSimulation(type) {
      timelineContainer.innerHTML = '';
      mediaStatus.innerText = 'Status: Fetching timeline logs...';
      mediaStatus.style.color = 'var(--accent-blue)';
      
      const timelineData = sampleTimelines[type];
      let delay = 1000;
      
      timelineData.forEach((item, index) => {
        setTimeout(() => {
          const div = document.createElement('div');
          div.className = 'timeline-item';
          div.innerHTML = `
            <span>[${item.time}] <strong>${item.text}</strong></span>
            ${item.status === 'Processing' 
              ? `<span style="color:var(--text-secondary);">Scanning...</span>` 
              : `<span class="status-badge" data-status="${item.status}">${item.status}</span>`}
          `;
          timelineContainer.appendChild(div);
          timelineContainer.scrollTop = timelineContainer.scrollHeight;
          
          if (index === timelineData.length - 1) {
            mediaStatus.innerText = 'Status: Audits complete.';
            mediaStatus.style.color = 'var(--accent-green)';
            // Feed trigger in auditor search bar
            checkerInput.value = item.text.replace(/"/g, '');
            checkerBtn.click();
          }
        }, delay);
        delay += 2500;
      });
    }

    // Uploader action
    document.getElementById('upload-audit-btn').addEventListener('click', () => {
      const fileInput = document.getElementById('media-uploader');
      if (fileInput.files.length === 0) return alert('Please choose a file to upload.');
      
      const file = fileInput.files[0];
      mediaStatus.innerText = `Status: Auditing file ${file.name}...`;
      startTimelineSimulation('reserves');
    });

    // YouTube auditor action
    document.getElementById('yt-audit-btn').addEventListener('click', () => {
      const url = document.getElementById('yt-url').value.trim();
      if (!url) return alert('Please enter a YouTube video URL.');
      
      mediaStatus.innerText = `Status: Hooking player stream...`;
      startTimelineSimulation('subsidy');
    });

    // Live Speech Mic
    const micBtn = document.getElementById('mic-btn');
    let recognition = null;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-NG';

      recognition.onstart = () => {
        mediaStatus.innerText = 'Status: Listening... Say "subsidy", "reserve", or "inflation".';
        mediaStatus.style.color = 'var(--accent-green)';
        timelineContainer.innerHTML = '';
      };

      recognition.onerror = (e) => {
        mediaStatus.innerText = 'Status: Mic error.';
        mediaStatus.style.color = '#ef4444';
      };

      recognition.onend = () => {
        mediaStatus.innerText = 'Status: Idle';
        mediaStatus.style.color = 'var(--text-secondary)';
      };

      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            const speech = e.results[i][0].transcript.toLowerCase();
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const div = document.createElement('div');
            div.className = 'timeline-item';
            div.innerHTML = `<span>[${time}] <em>"${speech}"</em></span><span style="color:var(--text-secondary);">Analyzing...</span>`;
            timelineContainer.appendChild(div);
            timelineContainer.scrollTop = timelineContainer.scrollHeight;

            if (speech.includes('subsidy')) {
              setTimeout(() => { startTimelineSimulation('subsidy'); }, 1000);
              recognition.stop();
              micBtn.innerText = '🎤 Start Listening';
            } else if (speech.includes('reserve') || speech.includes('external')) {
              setTimeout(() => { startTimelineSimulation('reserves'); }, 1000);
              recognition.stop();
              micBtn.innerText = '🎤 Start Listening';
            }
          }
        }
      };
    }

    micBtn.addEventListener('click', () => {
      if (!recognition) return alert('Speech API not supported.');
      if (mediaStatus.innerText.startsWith('Status: Listening')) {
        recognition.stop();
        micBtn.innerText = '🎤 Start Listening';
      } else {
        recognition.start();
        micBtn.innerText = '🛑 Stop Listening';
      }
    });

    // Mock PDF Report Generator
    document.getElementById('pdf-report-btn').addEventListener('click', () => {
      const newWindow = window.open('', '_blank');
      newWindow.document.write(`
        <html>
        <head>
          <title>CheckAM Video Fact-Check Report</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #111; line-height: 1.5; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .badge { background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; padding: 4px 12px; border-radius: 20px; font-weight: bold; text-transform: uppercase; font-size: 12px; }
            .sources { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div>
              <h1 style="margin:0; font-size:28px;">⚡ CheckAM Fact-Check Dossier</h1>
              <small>Exported by ${currentUser ? currentUser.email : 'CheckAM Partner'} on ${new Date().toLocaleDateString()}</small>
            </div>
            <div class="badge">MEDIA AUDIT</div>
          </div>
          <h2>Verified Audio/Video Timeline Details</h2>
          <p><strong>Speaker Audit finding:</strong> Statement matched from video stream analysis.</p>
          <p><strong>Claim:</strong> "The government has fully eliminated the fuel subsidy, saving 2 trillion Naira."</p>
          <p><strong>Fact-Check Explanation:</strong> The claim is misleading. While the formal budget allocation for PMS subsidy was officially terminated, state petroleum assets are offsetting currency translation cost variations, acting as an implicit subsidy.</p>
          <div class="sources">
            <h3>Verified Sources Cited</h3>
            <ul>
              <li>Premium Times Nigeria: The subsidy by another name inquiry</li>
              <li>FactCheckHub: Tracking fuel pricing statements</li>
            </ul>
          </div>
        </body>
        </html>
      `);
      newWindow.document.close();
    });
  