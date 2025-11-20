// api/session-status/[sessionId].js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get session from global store
    const session = global.activeSessions?.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.status(200).json({
      status: session.status,
      phoneNumber: session.phoneNumber,
      connectedAt: session.connectedAt,
      githubUrl: session.githubUrl,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: error.message || 'Failed to check session status',
    });
  }
}
