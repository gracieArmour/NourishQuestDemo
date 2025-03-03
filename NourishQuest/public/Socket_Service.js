const { Server } = require('socket.io');
const { processMessage, getConversationHistory } = require('./AI_Service');

let io;

const setupWebSocket = (server) => {
  // Create Socket.IO instance with CORS config
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Connection handler
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Authenticate connection
    socket.on('authenticate', async (data) => {
      try {
        const { userId, token } = data;
        
        console.log('Authentication attempt:', { userId: userId ? 'exists' : 'missing', tokenExists: !!token });
        
        // Allow a more lenient authentication during development
        if (!userId) {
          console.error('Authentication failed: No userId provided');
          socket.emit('error', { message: 'Authentication failed: Missing userId' });
          return;
        }
        
        // Store userId in socket for later use
        socket.data.userId = userId;
        socket.join(`user:${userId}`);
        
        // Get conversation history
        try {
          const history = await getConversationHistory(userId);
          console.log(`Sending history to user ${userId}, ${history.length} messages`);
          socket.emit('history', history);
        } catch (historyError) {
          console.error('Error fetching conversation history:', historyError);
          // Continue with authentication even if history fetch fails
        }
        
        socket.emit('authenticated', { success: true });
        console.log(`User ${userId} authenticated successfully`);
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('error', { message: 'Authentication failed: ' + (error.message || 'Unknown error') });
      }
    });
    
    // Message handler
    socket.on('message', async (data) => {
      try {
        // Ensure user is authenticated
        if (!socket.data.userId) {
          console.error('Message rejected: User not authenticated');
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }
        
        const { text } = data;
        const userId = socket.data.userId;
        
        console.log(`Processing message from user ${userId}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
        
        // Send typing indicator
        socket.emit('typing', { isTyping: true });
        
        // Process the message
        const aiResponse = await processMessage(userId, text);
        
        // Small delay to simulate thinking
        setTimeout(() => {
          // Stop typing indicator
          socket.emit('typing', { isTyping: false });
          
          // Send response
          socket.emit('message', {
            id: Date.now(),
            text: aiResponse.text,
            isAi: true,
            source: aiResponse.source,
            timestamp: new Date()
          });
          
          console.log(`Sent response to user ${userId} from source: ${aiResponse.source}`);
        }, 1000);
      } catch (error) {
        console.error('Message processing error:', error);
        socket.emit('error', { message: 'Failed to process message: ' + (error.message || 'Unknown error') });
        
        // Send a fallback message so the user isn't left hanging
        socket.emit('typing', { isTyping: false });
        socket.emit('message', {
          id: Date.now(),
          text: "I'm sorry, I'm having trouble processing your message right now. Please try again in a moment.",
          isAi: true,
          source: 'error',
          timestamp: new Date()
        });
      }
    });
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  return io;
};

// Simple session validation helper
const isValidSession = (token) => {
  // In a real implementation, this would verify against your session store
  // For now, we'll accept any non-empty token
  //return !!token;
  console.log('Validating token:', token ? token.substring(0, 10) + '...' : 'undefined');
  return true; 
};

// Get Socket.IO instance
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = {
  setupWebSocket,
  getIO
};
