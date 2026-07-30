# CheckAM: Real-Time Bipartite Fact-Checking Network

> **Democratizing Truth and Combating Misinformation in Africa**

---

## 1. Project Inspiration
Public discourse in West Africa (and Nigeria in particular) is heavily impacted by polarized political narratives, policy exaggerations, and coordinated misinformation campaigns. Traditional fact-checking websites operate asynchronously—publishers release fact-checks days after a claim has already gone viral, meaning the correction rarely reaches the original audience.

**CheckAM** (Pidgin for *"Verify it"*) was built to bridge this latency gap. Our goal was to create an instant fact-checking layer that lives right inside the user's viewport (on any website, social media feed, or WhatsApp Web) and is driven by both **Grounded AI** and **Real-Time Cross-Community Consensus**.

---

## 2. Technical Implementation & Architecture

CheckAM consists of three core layers integrated into a single high-performance pipeline:
1. **Dynamic Extension overlay (Vercel Frontend)**: Automatically scans and highlights text segments on load.
2. **Grounded AI Verification Service (Railway Node.js Server)**: Queries Gemini 1.5 Flash using live Google Search grounding to verify new claims and map references.
3. **Decentralized Database (Supabase PostgreSQL & WebSockets)**: Stores claims, syncs profiles, and broadcasts vote modifications.

### Real-Time Community Notes Consensus Algorithm (X-Inspired)
To prevent polarized brigading, CheckAM implements a real-time translation of X's (Twitter) Community Notes matrix factorization model.

Let $R_{ui} \in \{-1, 1\}$ be the rating given by user $u$ to claim note $i$, where $1$ is Helpful and $-1$ is Not Helpful. The probability that a user rates a note as helpful is modeled using a logistic sigmoid function:

\[ P(R_{ui} = 1) = \sigma(\alpha_u + \beta_i + \gamma \cdot x_u y_i) \]

Where:
* \(\sigma(z) = \frac{1}{1 + e^{-z}}\) is the standard logistic function.
* \(\alpha_u\) is the user intercept (representing how lenient or critical user $u$ is).
* \(\beta_i\) is the note intercept, which represents the **intrinsic helpfulness/quality** of note $i$. This is the primary metric we compute.
* \(x_u \in [-1, 1]\) is the latent polarization parameter of user $u$ (political alignment).
* \(y_i \in [-1, 1]\) is the latent polarization parameter of note $i$.
* \(\gamma\) is a scaling factor.

#### The Real-Time Approximation
Running full matrix factorization gradient descent on every single WebSocket vote is computationally expensive. CheckAM implements a real-time approximation by tracking each voter's political alignment score \(x_u\) based on their historical vote correlation:

1. **User Polarization \(x_u\)**: Computed as the running average difference between the user's votes and the average community votes across all notes.
2. **Bipartite Weighted Consensus**: The consensus score \(C_i\) for note $i$ is calculated by weighting helpful votes higher if they come from users with **opposing polarization values** (i.e., different political alignments):

\[ W_{ui} = 1 + \lambda |x_u - y_i| \]

This ensures that if users who traditionally disagree on policy claims ($x_u > 0$ vs $x_u < 0$) *both* rate a claim note as helpful, the consensus rating rises rapidly. If a note is only upvoted by a single political faction (same \(x_u\)), the note remains flagged as `"Under Review"` or `"Polarized"`.

---

## 3. Key Learnings & Engineering Challenges

### Challenges Faced
* **Mixed Content HTTPS Restrictions**: Modern browsers block requests from secure HTTPS pages (like Vercel deployments) to local HTTP backends (`http://localhost:3000`). To resolve this, we mapped all background extension calls to cross-origin HTTPS endpoints via background service workers.
* **WebSocket Port Exposure on Railway**: Railway dynamic PORT assignments require Node.js servers to run HTTP and WebSocket listeners on the same physical port. We resolved this by binding the `ws` server directly to our Express HTTP server instance.
* **Bipartite Voter Tracking**: Distinguishing organic community agreement from coordinated user brigading. The real-time polarization scoring model handles this elegantly by analyzing voter histories on startup.

---

## 4. What We Learned
* **AI Grounding is Essential**: Raw Large Language Models (LLMs) hallucinate statistics. Grounding Gemini searches against actual news repositories (NBS, Central Bank data) is critical for policy audits.
* **PWA Capability**: PWAs combined with system Share Sheets are highly effective for bringing desktop-equivalent extension experiences to mobile Safari and Chrome readers.
