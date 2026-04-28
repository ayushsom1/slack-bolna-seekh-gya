const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body;
    
    // Handle both nested and flat structures from Bolna
    // Format 1: { status: "completed", execution: { id: ... } }
    // Format 2: { status: "completed", id: ..., transcript: ... } (flat)
    const status = payload.status || payload.execution?.status;
    
    // Extract execution data - handle both formats
    const exec = payload.execution || payload;
    const callId = exec.id || payload.id;
    const agentId = exec.agent_id || payload.agent_id;
    
    // Duration: try multiple fields
    const duration = exec.conversation_duration 
      || exec.telephony_data?.duration 
      || payload.conversation_duration 
      || null;
    
    // Format duration (remove decimals, handle string "0.0")
    let durationDisplay = 'N/A';
    if (duration) {
      const durNum = parseFloat(duration);
      if (!isNaN(durNum)) {
        durationDisplay = Math.floor(durNum) + 's';
      }
    }
    
    // Transcript - multiple possible locations
    const transcript = exec.transcript 
      || payload.transcript 
      || exec.extracted_data?.transcript 
      || '';
    
    let transcriptDisplay = transcript.trim() || 'No transcript available';
    if (transcriptDisplay.length > 3000) {
      transcriptDisplay = transcriptDisplay.substring(0, 3000) + '...';
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      message: 'Processing call',
      callId: callId,
      status: status,
      duration: durationDisplay
    }));

    if (!callId) {
      return res.status(400).json({ error: 'Missing call ID' });
    }

    // Process only completed calls
    if (status !== 'completed') {
      return res.status(200).json({ success: true, message: 'Skipped: not completed' });
    }

    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📞 Call Ended' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Call ID:*\n${callId}` },
            { type: 'mrkdwn', text: `*Agent ID:*\n${agentId || 'N/A'}` }
          ]
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Duration:*\n${durationDisplay}` }
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Transcript:*\n${transcriptDisplay}` }
        }
      ]
    };

    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    await axios.post(slackWebhookUrl, slackMessage, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      executionId: callId,
      message: 'Slack notification sent'
    }));

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: error.message
    }));
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
};