// VeriNote Content Script
// Scans text, highlights claims, displays glassmorphic overlays, and handles real-time WebSockets.

let ws = null;
let activeTooltipEl = null;
let currentHighlightNode = null;
let currentClaimData = null;
let selectedRange = null;

// Predefined claims to automatically highlight on load (matches database.json keys)
const PREDEFINED_CLAIMS = [
  { id: "claim_ng_001", claim: "Nigeria's external reserves increased by $10 billion in the last six months.", status: "False" },
  { id: "claim_ng_002", claim: "The government has fully eliminated the fuel subsidy, saving 2 trillion Naira.", status: "Misleading" },
  { id: "claim_ng_003", claim: "Nigeria's inflation rate dropped to 12% in the second quarter.", status: "False" },
  { id: "claim_ng_004", claim: "The 700-kilometer Lagos-Calabar coastal highway has been completely paved and commissioned.", status: "Misleading" }
];

let isScannerEnabled = true;

// 1. Initialize tooltips, floating triggers, and WebSockets
function init() {
  createTooltipElement();
  createFloatingTrigger();
  connectWS();
  
  // Read initial enabled state
  chrome.storage.local.get({ scannerEnabled: true }, (result) => {
    isScannerEnabled = result.scannerEnabled;
    if (isScannerEnabled) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(runAutoHighlight, 1000);
      } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(runAutoHighlight, 1000));
      }
    }
  });
  
  setupSelectionListener();
  setupDocumentClickListeners();
  setupMessageListener();
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggle_scanner') {
      isScannerEnabled = message.enabled;
      if (!isScannerEnabled) {
        // Remove all active highlights dynamically
        document.querySelectorAll('.verinote-highlight').forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            const textNode = document.createTextNode(el.textContent);
            parent.replaceChild(textNode, el);
          }
        });
        hideTooltip();
        floatingTrigger.style.display = 'none';
      } else {
        runAutoHighlight();
      }
    }
  });
}

// 2. WebSocket Connection for Real-Time Consensus Updates
function connectWS() {
  try {
    ws = new WebSocket('ws://localhost:3000');

    ws.onopen = () => {
      console.log('[VeriNote] Connected to consensus WebSocket server.');
      // Resubscribe to any active highlights on the page
      document.querySelectorAll('.verinote-highlight').forEach(el => {
        const id = el.getAttribute('data-claim-id');
        if (id) {
          ws.send(JSON.stringify({ type: 'subscribe', claimId: id }));
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'vote_update') {
          console.log('[VeriNote] Real-time consensus update received:', data);
          
          // Update the DOM tooltip in real-time if it's currently showing this claim
          if (currentClaimData && currentClaimData.id === data.claimId) {
            currentClaimData.consensus = data.consensus;
            currentClaimData.votesHelpful = data.votesHelpful;
            currentClaimData.votesNotHelpful = data.votesNotHelpful;
            renderTooltipContent(currentClaimData);
          }
        }
      } catch (err) {
        console.error('[VeriNote] WS message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[VeriNote] WebSocket server offline. Reconnecting in 3s...');
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch (e) {
    console.error('[VeriNote] WebSocket initialization failed:', e);
  }
}

// 3. Create Glassmorphism Tooltip Element in DOM
let tooltipContainer = null;
function createTooltipElement() {
  tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'verinote-tooltip';
  document.body.appendChild(tooltipContainer);
}

// 4. Create Floating Trigger Button for Text Selections
let floatingTrigger = null;
function createFloatingTrigger() {
  floatingTrigger = document.createElement('button');
  floatingTrigger.className = 'verinote-floating-btn';
  // Style the floating trigger directly in JS or CSS
  Object.assign(floatingTrigger.style, {
    position: 'absolute',
    display: 'none',
    zIndex: 2147483646,
    background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '20px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'sans-serif',
    transition: 'transform 0.15s ease'
  });
  floatingTrigger.innerHTML = '🔍 Fact-Check with VeriNote';
  
  floatingTrigger.addEventListener('mouseenter', () => {
    floatingTrigger.style.transform = 'scale(1.05)';
  });
  floatingTrigger.style.transition = 'transform 0.2s';
  floatingTrigger.addEventListener('mouseleave', () => {
    floatingTrigger.style.transform = 'scale(1)';
  });

  floatingTrigger.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent text deselection
    if (selectedRange) {
      triggerVerification(selectedRange);
    }
  });

  document.body.appendChild(floatingTrigger);
}

// 5. Automatic Document Scanning for Predefined Claims
function runAutoHighlight() {
  PREDEFINED_CLAIMS.forEach(item => {
    highlightTextInDOM(item.claim, item.id, item.status);
  });
  setupHighlightListeners();
}

function highlightTextInDOM(textToFind, claimId, status) {
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textVal = node.nodeValue;
      const index = textVal.toLowerCase().indexOf(textToFind.toLowerCase());
      
      if (index !== -1) {
        const parent = node.parentNode;
        // Avoid nested highlights or script/style blocks
        if (
          parent && 
          !parent.classList.contains('verinote-highlight') && 
          parent.tagName !== 'SCRIPT' && 
          parent.tagName !== 'STYLE' && 
          parent.tagName !== 'TEXTAREA' && 
          parent.tagName !== 'INPUT'
        ) {
          const matchedText = textVal.substring(index, index + textToFind.length);
          const beforeText = textVal.substring(0, index);
          const afterText = textVal.substring(index + textToFind.length);

          const beforeNode = document.createTextNode(beforeText);
          const afterNode = document.createTextNode(afterText);

          const span = document.createElement('span');
          span.className = 'verinote-highlight';
          span.setAttribute('data-claim-id', claimId);
          span.setAttribute('data-status', status);
          span.textContent = matchedText;

          parent.insertBefore(beforeNode, node);
          parent.insertBefore(span, node);
          parent.insertBefore(afterNode, node);
          parent.removeChild(node);
          
          // Subscribe this claim for WS updates
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribe', claimId: claimId }));
          }
        }
      }
    } else {
      // Loop backwards because children are modified during replacement
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        walk(node.childNodes[i]);
      }
    }
  }
  walk(document.body);
}

// 6. Text Selection Detection for Interactive Live Fact Checking
function setupSelectionListener() {
  document.addEventListener('mouseup', () => {
    if (!isScannerEnabled) {
      floatingTrigger.style.display = 'none';
      selectedRange = null;
      return;
    }
    
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    // Require a sensible text length to search (15-250 characters)
    if (text.length > 15 && text.length < 250) {
      selectedRange = selection.getRangeAt(0).cloneRange();
      const rect = selectedRange.getBoundingClientRect();
      
      // Position floating button slightly above the selection center
      floatingTrigger.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 80}px`;
      floatingTrigger.style.top = `${rect.top + window.scrollY - 36}px`;
      floatingTrigger.style.display = 'flex';
    } else {
      floatingTrigger.style.display = 'none';
      selectedRange = null;
    }
  });
}

// 7. Request Verification from API via Background Worker
function triggerVerification(range) {
  floatingTrigger.innerHTML = '⚡ Checking...';
  const text = range.toString();

  chrome.runtime.sendMessage({ type: 'verify_text', text: text }, (response) => {
    floatingTrigger.innerHTML = '🔍 Fact-Check with VeriNote';
    floatingTrigger.style.display = 'none';

    if (response && response.success && response.data.found) {
      const claimData = response.data.data;
      
      // Inject highlight wrapping
      const span = document.createElement('span');
      span.className = 'verinote-highlight';
      span.setAttribute('data-claim-id', claimData.id);
      span.setAttribute('data-status', claimData.status);
      
      try {
        range.surroundContents(span);
        // Subscribe to real-time updates for this new claim
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'subscribe', claimId: claimData.id }));
        }
        setupHighlightListeners();
        showTooltip(span, claimData);
      } catch (err) {
        console.error('[VeriNote] Failed to surround selected contents:', err);
        // Alert fallback if selection spans multiple element block boundaries
        alert(`VeriNote Check: [${claimData.status}] ${claimData.explanation}`);
      }
    } else {
      console.log('[VeriNote] Text not matched or verification failed.');
    }
    // Clear selection
    window.getSelection().removeAllRanges();
  });
}

// 8. Tooltip Position & Event Listeners Setup
function setupHighlightListeners() {
  const highlights = document.querySelectorAll('.verinote-highlight');
  
  highlights.forEach(el => {
    // Prevent duplicate listener bindings
    if (el.getAttribute('data-has-listener') === 'true') return;
    el.setAttribute('data-has-listener', 'true');

    el.addEventListener('mouseenter', (e) => {
      const claimId = el.getAttribute('data-claim-id');
      
      // Fetch details from server or local cache (for predefined ones)
      fetch(`http://localhost:3000/api/claims`)
        .then(res => res.json())
        .then(claimsList => {
          const claimData = claimsList.find(c => c.id === claimId);
          if (claimData) {
            showTooltip(el, claimData);
          }
        })
        .catch(err => {
          console.error('[VeriNote] Failed to fetch claim data on hover:', err);
        });
    });

    el.addEventListener('mouseleave', (e) => {
      // Small buffer delay to allow moving mouse into the tooltip card itself
      setTimeout(() => {
        if (!tooltipContainer.matches(':hover') && !el.matches(':hover')) {
          hideTooltip();
        }
      }, 100);
    });
  });
}

tooltipContainer?.addEventListener('mouseleave', () => {
  if (currentHighlightNode && !currentHighlightNode.matches(':hover')) {
    hideTooltip();
  }
});

function showTooltip(anchorNode, claimData) {
  currentHighlightNode = anchorNode;
  currentClaimData = claimData;
  
  renderTooltipContent(claimData);
  
  tooltipContainer.classList.add('visible');
  positionTooltip(anchorNode);
}

function hideTooltip() {
  tooltipContainer.classList.remove('visible');
  currentHighlightNode = null;
  currentClaimData = null;
}

function positionTooltip(anchorNode) {
  const rect = anchorNode.getBoundingClientRect();
  
  // Center alignment horizontally
  let leftPos = rect.left + window.scrollX + (rect.width - 340) / 2;
  // Position above the text. Subtract height of tooltip (approx 200px) + padding
  let topPos = rect.top + window.scrollY - 190;
  
  // Boundary safety checks
  if (leftPos < 10) leftPos = 10;
  if (leftPos + 350 > window.innerWidth) leftPos = window.innerWidth - 350;
  if (rect.top < 200) {
    // If there is no space above, show below the line
    topPos = rect.bottom + window.scrollY + 10;
  }
  
  tooltipContainer.style.left = `${leftPos}px`;
  tooltipContainer.style.top = `${topPos}px`;
}

// 9. Build and Render Glassmorphic Tooltip Card Content Dynamically
function renderTooltipContent(claim) {
  if (!tooltipContainer) return;
  
  const citationsHtml = claim.citations && claim.citations.length > 0 
    ? claim.citations.map(c => `<a href="${c.url}" target="_blank" class="verinote-source-item">🔗 ${c.title}</a>`).join('')
    : '<div style="font-size:11px;color:#9ca3af;">No official sources linked yet.</div>';

  const totalVotes = (claim.votesHelpful || 0) + (claim.votesNotHelpful || 0);
  const consensusPercent = totalVotes > 0 ? Math.round((claim.votesHelpful / totalVotes) * 100) : 100;

  tooltipContainer.innerHTML = `
    <div class="verinote-header">
      <span class="verinote-logo">⚡ VeriNote</span>
      <span class="verinote-badge" data-status="${claim.status}">${claim.status}</span>
    </div>
    <div class="verinote-body">
      ${claim.explanation}
    </div>
    <div class="verinote-sources">
      <div class="verinote-sources-title">Verified Sources</div>
      ${citationsHtml}
    </div>
    <div class="verinote-voting-section">
      <div class="verinote-consensus-bar-wrapper">
        <div class="verinote-consensus-label">
          <span>Community Consensus</span>
          <span>${consensusPercent}% Agreement</span>
        </div>
        <div class="verinote-consensus-bar">
          <div class="verinote-consensus-fill" style="width: ${consensusPercent}%"></div>
        </div>
      </div>
      <div class="verinote-vote-buttons">
        <button class="verinote-vote-btn" id="verinote-vote-up" data-id="${claim.id}">
          👍 Helpful (${claim.votesHelpful || 0})
        </button>
        <button class="verinote-vote-btn" id="verinote-vote-down" data-id="${claim.id}">
          👎 Not Helpful (${claim.votesNotHelpful || 0})
        </button>
      </div>
    </div>
  `;

  // Bind voting buttons
  const upBtn = tooltipContainer.querySelector('#verinote-vote-up');
  const downBtn = tooltipContainer.querySelector('#verinote-vote-down');

  upBtn.addEventListener('click', () => castVote(claim.id, 'helpful'));
  downBtn.addEventListener('click', () => castVote(claim.id, 'not_helpful'));
}

// Send vote transaction via WebSockets
function castVote(claimId, voteType) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log(`[VeriNote] Sending live vote (${voteType}) for claim: ${claimId}`);
    ws.send(JSON.stringify({
      type: 'vote',
      claimId: claimId,
      vote: voteType
    }));
    
    // Add micro-animation effect
    const btnId = voteType === 'helpful' ? '#verinote-vote-up' : '#verinote-vote-down';
    const activeClass = voteType === 'helpful' ? 'active-helpful' : 'active-nothelpful';
    const button = tooltipContainer.querySelector(btnId);
    if (button) {
      button.classList.add(activeClass);
      button.style.transform = 'scale(0.95)';
      setTimeout(() => button.style.transform = 'scale(1)', 150);
    }
  } else {
    alert('Consensus server is offline. Real-time voting is temporarily disabled.');
  }
}

// 10. Document-wide Event Handler for Tooltip Dismissal
function setupDocumentClickListeners() {
  document.addEventListener('click', (e) => {
    // Hide tooltip if clicking outside of the highlight trigger and the tooltip itself
    if (
      tooltipContainer && 
      !tooltipContainer.contains(e.target) && 
      !e.target.classList.contains('verinote-highlight')
    ) {
      hideTooltip();
    }
  });
}

// Execute initialization
init();
