// api/sessions.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Get all active sessions
    const sessions = [];
    
    if (global.activeSessions) {
      for (const [sessionId, session] of global.activeSessions.entries()) {
        if (session.status === 'connected') {
          sessions.push({
            id: sessionId,
            phoneNumber: session.phoneNumber,
            connectedAt: session.connectedAt,
            lastActivity: session.connectedAt,
            githubUrl: session.githubUrl,
          });
        }
      }
    }
    
    res.status(200).json({ sessions });
  } catch (error) {
    console.error('Sessions list error:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch sessions',
    });
  }
}
