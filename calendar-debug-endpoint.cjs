// Endpoint temporal para debugging de Calendar
// Agregar esto a server.cjs temporalmente

const dbModule = require('./db-connection.cjs');

function setupCalendarDebug(app) {
  // Endpoint para verificar el estado de Calendar
  app.get('/api/calendar/debug-status', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let userId = null;
      let hasAuth = false;
      
      // Verificar JWT si existe
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const jwt = require('jsonwebtoken');
          const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.id;
          hasAuth = true;
        } catch (e) {
          console.log('Error verificando JWT:', e.message);
        }
      }
      
      // Obtener conexión de BD
      const db = dbModule.getConnection();
      let tokensInfo = null;
      
      if (db && userId) {
        try {
          const [tokens] = await db.execute(
            `SELECT user_id, service, 
             SUBSTRING(access_token, 1, 30) as access_preview,
             SUBSTRING(refresh_token, 1, 30) as refresh_preview,
             expires_at, created_at, updated_at
             FROM user_tokens 
             WHERE user_id = ? AND service = 'google_calendar'`,
            [userId]
          );
          
          if (tokens && tokens.length > 0) {
            tokensInfo = {
              found: true,
              userIdInDB: tokens[0].user_id,
              service: tokens[0].service,
              hasAccessToken: !!tokens[0].access_preview,
              hasRefreshToken: !!tokens[0].refresh_preview,
              expiresAt: tokens[0].expires_at,
              createdAt: tokens[0].created_at,
              updatedAt: tokens[0].updated_at,
              isExpired: new Date(tokens[0].expires_at) <= new Date()
            };
          } else {
            tokensInfo = { found: false, message: 'No tokens found for user' };
          }
        } catch (dbError) {
          tokensInfo = { error: dbError.message };
        }
      }
      
      // Verificar configuración de Google
      const googleConfig = {
        clientId: !!process.env.GOOGLE_CLIENT_ID,
        clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'not set'
      };
      
      res.json({
        status: 'Calendar Debug Info',
        timestamp: new Date().toISOString(),
        auth: {
          hasAuthHeader: !!authHeader,
          hasValidJWT: hasAuth,
          userId: userId,
          userIdType: typeof userId
        },
        database: {
          isConnected: !!db,
          moduleHasConnection: !!dbModule.getConnection()
        },
        tokens: tokensInfo,
        googleConfig: googleConfig,
        middleware: {
          reqDbWouldExist: 'Check server logs for req.db status'
        }
      });
      
    } catch (error) {
      res.status(500).json({
        error: 'Debug endpoint error',
        message: error.message,
        stack: error.stack
      });
    }
  });
  
  console.log('✅ Calendar debug endpoint configurado en /api/calendar/debug-status');
}

module.exports = { setupCalendarDebug };