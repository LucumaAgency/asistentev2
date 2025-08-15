// Endpoint temporal para verificar el estado de Calendar para IA
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config();

// GET /api/test/ai-calendar-status
router.get('/ai-calendar-status', async (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  let db;
  
  try {
    // 1. Conectar a BD
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_assistant_db'
    });
    status.checks.database = '✅ Conectado';
    
    // 2. Verificar usuarios con tokens
    const [tokensResult] = await db.execute(`
      SELECT 
        COUNT(*) as count,
        MAX(created_at) as last_created,
        MAX(updated_at) as last_updated
      FROM user_tokens 
      WHERE service = 'google_calendar' AND access_token IS NOT NULL
    `);
    
    status.checks.tokens = {
      count: tokensResult[0].count,
      lastCreated: tokensResult[0].last_created,
      lastUpdated: tokensResult[0].last_updated
    };
    
    // 3. Verificar modo Calendar
    const [modeResult] = await db.execute(`
      SELECT id, mode_id, name FROM modes WHERE mode_id = 'calendar' OR name LIKE '%Calendar%' OR name LIKE '%Calend%'
    `);
    
    status.checks.calendarMode = modeResult.length > 0 ? {
      found: true,
      id: modeResult[0].id,
      mode_id: modeResult[0].mode_id,
      name: modeResult[0].name
    } : {
      found: false
    };
    
    // 4. Verificar sesiones recientes en modo calendar
    const [sessionsResult] = await db.execute(`
      SELECT COUNT(*) as count, MAX(created_at) as last_created
      FROM chat_sessions 
      WHERE mode_id = 'calendar' OR mode_id = '2'
    `);
    
    status.checks.calendarSessions = {
      count: sessionsResult[0].count,
      lastCreated: sessionsResult[0].last_created
    };
    
    // 5. Verificar usuario actual (si hay auth)
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace('Bearer ', '');
      const jwt = require('jsonwebtoken');
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [userResult] = await db.execute(
          'SELECT id, email, google_id FROM users WHERE id = ?',
          [decoded.userId]
        );
        
        if (userResult.length > 0) {
          const user = userResult[0];
          
          // Verificar tokens del usuario
          const [userTokens] = await db.execute(
            'SELECT access_token, refresh_token, expires_at FROM user_tokens WHERE user_id = ? AND service = ?',
            [user.id, 'google_calendar']
          );
          
          status.currentUser = {
            id: user.id,
            email: user.email,
            hasTokens: userTokens.length > 0,
            tokenDetails: userTokens.length > 0 ? {
              hasAccessToken: !!userTokens[0].access_token,
              hasRefreshToken: !!userTokens[0].refresh_token,
              expiresAt: userTokens[0].expires_at
            } : null
          };
        }
      } catch (jwtError) {
        status.currentUser = { error: 'Invalid JWT token' };
      }
    } else {
      status.currentUser = { error: 'No authorization header' };
    }
    
    // 6. Resumen
    status.summary = {
      ready: status.checks.tokens.count > 0 && status.checks.calendarMode.found,
      issues: []
    };
    
    if (status.checks.tokens.count === 0) {
      status.summary.issues.push('❌ No hay tokens de Calendar guardados - necesitas autorizar Calendar primero');
    }
    
    if (!status.checks.calendarMode.found) {
      status.summary.issues.push('❌ Modo Calendar no configurado en BD');
    }
    
    if (status.currentUser && !status.currentUser.hasTokens) {
      status.summary.issues.push('⚠️ Usuario actual no tiene tokens de Calendar');
    }
    
    if (status.summary.issues.length === 0) {
      status.summary.message = '✅ Todo listo para usar Calendar con IA';
    }
    
  } catch (error) {
    status.error = error.message;
    status.checks.database = '❌ Error: ' + error.message;
  } finally {
    if (db) await db.end();
  }
  
  res.json(status);
});

module.exports = router;