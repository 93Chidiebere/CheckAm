import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Initialize dotenv and configuration
dotenv.config();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'database.json');

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// Load database from file or Supabase into memory
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
let isSupabaseEnabled = false;

if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL_HERE') {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isSupabaseEnabled = true;
    console.log('[Database] Supabase cloud client initialized successfully.');
  } catch (e) {
    console.error('[Database] Failed to initialize Supabase client:', e);
  }
}

let claimsDb = [];

async function loadClaims() {
  if (isSupabaseEnabled) {
    try {
      const { data, error } = await supabase
        .from('claims')
        .select('*');
      
      if (!error && data) {
        claimsDb = data.map(item => ({
          id: item.id,
          claim: item.claim,
          status: item.status,
          consensus: item.consensus || 0,
          votesHelpful: item.votes_helpful || 0,
          votesNotHelpful: item.votes_not_helpful || 0,
          explanation: item.explanation,
          citations: item.citations || []
        }));
        console.log(`[Database] Loaded ${claimsDb.length} claims from Supabase.`);
      } else {
        console.error('[Database] Supabase load failed, falling back to database.json:', error);
        loadLocalJson();
      }
    } catch (e) {
      console.error('[Database] Supabase connection error, falling back to database.json:', e);
      loadLocalJson();
    }
  } else {
    loadLocalJson();
  }
}

function loadLocalJson() {
  try {
    if (fs.existsSync(DB_PATH)) {
      claimsDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      console.log(`[Database] Loaded ${claimsDb.length} mock claims from local database.json.`);
    } else {
      fs.writeFileSync(DB_PATH, JSON.stringify([]));
    }
  } catch (error) {
    console.error('[Database] Error loading local database:', error);
  }
}

// Function to save database updates locally
const saveDbLocal = () => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(claimsDb, null, 2));
  } catch (error) {
    console.error('[Database] Error saving local database:', error);
  }
};

// Initialize Gemini Client
let genAI = null;
let isGeminiEnabled = false;

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    isGeminiEnabled = true;
    console.log('[AI] Gemini API client initialized successfully.');
  } catch (e) {
    console.error('[AI] Failed to initialize Gemini API client:', e);
  }
} else {
  console.log('[AI] Gemini API Key is missing or placeholder. Running in Offline Mock Database mode.');
}

/**
 * Perform AI Verification using Gemini with Search Grounding
 */
async function verifyClaimWithAI(text) {
  if (!isGeminiEnabled) return null;

  try {
    // We use gemini-1.5-flash or gemini-2.5-flash. Let's use gemini-1.5-flash as it is extremely fast and cost-effective.
    // Try to use Google Search tool for live grounding.
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      // We pass googleSearchRetrieval to enable live Google search-grounding.
      tools: [{
        googleSearchRetrieval: {
          dynamicRetrievalConfig: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.3
          }
        }
      }]
    });

    const systemInstruction = `You are a real-time fact-checking assistant for the Chrome Extension 'VeriNote'. 
Analyze the input statement and determine if it is factually "True", "False", or "Misleading". 
Provide a concise, objective 1-2 sentence explanation of the facts.
Include 1 or 2 verified source citations containing a title and a web URL.
You MUST respond with a JSON object in this exact schema:
{
  "status": "True" | "False" | "Misleading",
  "explanation": "1-2 sentence factual explanation.",
  "citations": [
    { "title": "Source Article Title", "url": "https://source-url.com" }
  ]
}`;

    const prompt = `Fact check the following statement:\n"${text}"`;

    const result = await model.generateContent({
      contents: prompt,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      },
      systemInstruction: systemInstruction
    });

    const responseText = result.response.text();
    console.log('[AI] Gemini raw response:', responseText);

    const parsed = JSON.parse(responseText);
    
    // Create a new claim record
    const claimRecord = {
      id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      claim: text,
      status: parsed.status || 'Unverified',
      consensus: 100, // Starts at 100% since AI verified it
      votesHelpful: 1,
      votesNotHelpful: 0,
      explanation: parsed.explanation || 'No details available.',
      citations: parsed.citations || []
    };

    return claimRecord;
  } catch (error) {
    console.error('[AI] Error verifying claim with Gemini:', error);
    // Try a fallback call without tools if search grounding was rejected/errored
    try {
      console.log('[AI] Attempting fallback call without tools...');
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Fact-check this claim. Respond in JSON.
Claim: "${text}"
Schema: { "status": "True"|"False"|"Misleading", "explanation": "text", "citations": [{"title": "name", "url": "link"}] }`;
      
      const result = await fallbackModel.generateContent({
        contents: prompt,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      });
      const parsed = JSON.parse(result.response.text());
      return {
        id: `ai_${Date.now()}`,
        claim: text,
        status: parsed.status || 'Unverified',
        consensus: 100,
        votesHelpful: 1,
        votesNotHelpful: 0,
        explanation: parsed.explanation,
        citations: parsed.citations || []
      };
    } catch (fallbackError) {
      console.error('[AI] Fallback verification failed:', fallbackError);
      return null;
    }
  }
}

// --- HTTP API Endpoints ---

// Check a query text for matching fact check notes
app.post('/api/verify', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text field is required' });
  }

  const query = text.trim().toLowerCase();

  // If Supabase is enabled, refresh memory cache to pick up external modifications
  if (isSupabaseEnabled) {
    await loadClaims();
  }

  // 1. Search database for an exact or substring match
  const matchedClaim = claimsDb.find(item => 
    query.includes(item.claim.toLowerCase()) || 
    item.claim.toLowerCase().includes(query)
  );

  if (matchedClaim) {
    console.log(`[API] Matched claim: "${matchedClaim.claim}"`);
    return res.json({ found: true, data: matchedClaim });
  }

  // 2. If no mock claim matches and Gemini is enabled, query Gemini API
  if (isGeminiEnabled) {
    console.log(`[API] Querying Gemini for live verification of: "${text}"`);
    const newClaim = await verifyClaimWithAI(text);
    if (newClaim) {
      // Add to local cache list
      claimsDb.push(newClaim);
      saveDbLocal();

      // Insert new claim into Supabase
      if (isSupabaseEnabled) {
        try {
          const { error } = await supabase
            .from('claims')
            .insert([{
              id: newClaim.id,
              claim: newClaim.claim,
              status: newClaim.status,
              consensus: newClaim.consensus,
              votes_helpful: newClaim.votesHelpful,
              votes_not_helpful: newClaim.votesNotHelpful,
              explanation: newClaim.explanation,
              citations: newClaim.citations
            }]);
          if (error) console.error('[Database] Supabase insert failed:', error);
          else console.log('[Database] Live AI claim saved to Supabase.');
        } catch (e) {
          console.error('[Database] Supabase insert connection error:', e);
        }
      }
      return res.json({ found: true, data: newClaim });
    }
  }

  // 3. Fallback: claim not found / unverified
  return res.json({ found: false, message: 'No existing notes. Ask community or check back later.' });
});

// Get all claims (useful for popup or database explorer)
app.get('/api/claims', async (req, res) => {
  if (isSupabaseEnabled) {
    await loadClaims();
  }
  res.json(claimsDb);
});

// Start HTTP Server
const server = app.listen(PORT, async () => {
  await loadClaims();
  console.log(`[Server] VeriNote backend running on port ${PORT}`);
  console.log(`[Server] Web API: http://localhost:${PORT}/api/verify`);
});

// --- WebSocket Real-Time Broadcast Server ---
const wss = new WebSocketServer({ server });

// Track active WebSocket connections and subscription channels
const clients = new Map(); // ws client -> Set of claimIds they are watching

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected.');
  clients.set(ws, new Set());

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WebSocket] Received:', data);

      if (data.type === 'subscribe') {
        const claimId = data.claimId;
        clients.get(ws).add(claimId);
        console.log(`[WebSocket] Client subscribed to updates for claim: ${claimId}`);
      }

      if (data.type === 'vote') {
        const { claimId, vote } = data;
        const claim = claimsDb.find(c => c.id === claimId);

        if (claim) {
          if (vote === 'helpful') {
            claim.votesHelpful = (claim.votesHelpful || 0) + 1;
          } else if (vote === 'not_helpful') {
            claim.votesNotHelpful = (claim.votesNotHelpful || 0) + 1;
          }

          // Recalculate consensus rating
          const totalVotes = claim.votesHelpful + claim.votesNotHelpful;
          claim.consensus = totalVotes > 0 ? Math.round((claim.votesHelpful / totalVotes) * 100) : 0;

          saveDbLocal();
          console.log(`[WebSocket] Vote cast on ${claimId} (${vote}). New consensus: ${claim.consensus}%`);

          // Update in Supabase cloud database
          if (isSupabaseEnabled) {
            try {
              const { error } = await supabase
                .from('claims')
                .update({
                  votes_helpful: claim.votesHelpful,
                  votes_not_helpful: claim.votesNotHelpful,
                  consensus: claim.consensus
                })
                .eq('id', claim.id);
              if (error) console.error('[Database] Supabase vote update failed:', error);
              else console.log('[Database] Supabase vote registered successfully.');
            } catch (e) {
              console.error('[Database] Supabase vote update connection error:', e);
            }
          }

          // Broadcast the update to all clients subscribed to this claim
          const broadcastData = JSON.stringify({
            type: 'vote_update',
            claimId: claimId,
            consensus: claim.consensus,
            votesHelpful: claim.votesHelpful,
            votesNotHelpful: claim.votesNotHelpful
          });

          for (const [client, subscriptions] of clients.entries()) {
            if (client.readyState === 1 && subscriptions.has(claimId)) {
              client.send(broadcastData);
            }
          }
        } else {
          console.log(`[WebSocket] Vote ignored: claim ID ${claimId} not found.`);
        }
      }
    } catch (e) {
      console.error('[WebSocket] Error processing message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected.');
    clients.delete(ws);
  });
});
