// api/request-pairing.js
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { Octokit } = require("@octokit/rest");

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_URL = process.env.GITHUB_REPO_URL; // Format: owner/repo

// Parse GitHub repo
const parseGithubRepo = () => {
  if (!GITHUB_REPO_URL) throw new Error('GITHUB_REPO_URL not set');
  const match = GITHUB_REPO_URL.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  // Direct format: owner/repo
  const parts = GITHUB_REPO_URL.split('/');
  return { owner: parts[0], repo: parts[1] };
};

// Initialize Octokit
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Store active sessions in memory
if (!global.activeSessions) {
  global.activeSessions = new Map();
}

// Upload session to GitHub
async function uploadSessionToGithub(phoneNumber, sessionPath) {
  try {
    const { owner, repo } = parseGithubRepo();
    const sessionFolder = `sessions/${phoneNumber}`;
    
    // Read all files in session directory
    const files = fs.readdirSync(sessionPath);
    
    for (const file of files) {
      const filePath = path.join(sessionPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const base64Content = Buffer.from(content).toString('base64');
      
      try {
        // Try to get existing file
        const { data: existingFile } = await octokit.repos.getContent({
          owner,
          repo,
          path: `${sessionFolder}/${file}`,
        }).catch(() => ({ data: null }));
        
        // Create or update file
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: `${sessionFolder}/${file}`,
          message: `Update session file for ${phoneNumber}`,
          content: base64Content,
          sha: existingFile?.sha,
        });
        
        console.log(`✅ Uploaded ${file} to GitHub`);
      } catch (error) {
        console.error(`Error uploading ${file}:`, error.message);
      }
    }
    
    const githubUrl = `https://github.com/${owner}/${repo}/tree/main/${sessionFolder}`;
    console.log(`✅ Session uploaded to GitHub: ${githubUrl}`);
    return githubUrl;
  } catch (error) {
    console.error('Error uploading to GitHub:', error);
    throw error;
  }
}

// Main pairing function
async function startPairing(phoneNumber) {
  const sessionId = `session_${phoneNumber}_${Date.now()}`;
  const sessionPath = path.join('/tmp', 'sessions', phoneNumber);
  
  // Create session directory
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu("Chrome"),
      connectTimeoutMs: 60000,
    });
    
    // Store session info
    global.activeSessions.set(sessionId, {
      phoneNumber,
      status: 'waiting',
      sock,
      saveCreds,
      sessionPath,
    });
    
    // Request pairing code
    let pairingCode = null;
    if (!state.creds.registered) {
      const code = await sock.requestPairingCode(phoneNumber);
      pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
      console.log(`📱 Pairing code for ${phoneNumber}: ${pairingCode}`);
    }
    
    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const session = global.activeSessions.get(sessionId);
      
      if (connection === 'open') {
        console.log(`✅ ${phoneNumber} connected!`);
        
        // Update session status
        session.status = 'connected';
        session.connectedAt = Date.now();
        
        // Upload to GitHub
        try {
          const githubUrl = await uploadSessionToGithub(phoneNumber, sessionPath);
          session.githubUrl = githubUrl;
          console.log(`✅ Session files uploaded to GitHub`);
        } catch (error) {
          console.error('GitHub upload failed:', error);
        }
      } else if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (!shouldReconnect) {
          console.log(`❌ ${phoneNumber} logged out`);
          session.status = 'disconnected';
          
          // Clean up session directory
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        }
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    return { sessionId, pairingCode };
  } catch (error) {
    console.error('Pairing error:', error);
    throw error;
  }
}

// API Handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Validate phone number
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      return res.status(400).json({ error: 'Phone number cannot start with 0' });
    }
    
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      return res.status(400).json({ error: 'Phone number must be 10-15 digits' });
    }
    
    // Start pairing
    const { sessionId, pairingCode } = await startPairing(cleanNumber);
    
    res.status(200).json({
      success: true,
      sessionId,
      pairingCode,
      phoneNumber: cleanNumber,
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate pairing code',
    });
  }
}
