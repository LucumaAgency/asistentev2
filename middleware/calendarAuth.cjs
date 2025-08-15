const jwt = require('jsonwebtoken');
const GoogleCalendarService = require('../services/googleCalendar.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';

// Middleware para verificar y configurar tokens de Calendar
const calendarAuth = async (req, res, next) => {
  try {
    // Obtener el token JWT del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verificar el JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Obtener el user ID del token decodificado
    const userId = decoded.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no identificado' });
    }

    // Si no hay DB, continuar sin tokens de Calendar
    if (!req.db) {
      console.log('❌ ERROR CRÍTICO: No hay conexión a BD en calendarAuth');
      console.log('   req.db:', req.db);
      console.log('   userId:', userId);
      
      // Intentar obtener DB del módulo compartido como fallback
      try {
        const dbModule = require('../db-connection.cjs');
        const dbConnection = dbModule.getConnection();
        if (dbConnection) {
          console.log('✅ BD obtenida del módulo compartido');
          req.db = dbConnection;
        } else {
          console.log('❌ Módulo compartido tampoco tiene BD');
          return res.status(503).json({ 
            error: 'Servicio de Calendar no disponible - BD no conectada',
            details: 'La base de datos no está disponible'
          });
        }
      } catch (e) {
        console.error('❌ Error obteniendo BD del módulo:', e.message);
        return res.status(503).json({ 
          error: 'Servicio de Calendar no disponible',
          details: e.message
        });
      }
    }

    // Buscar tokens de Google Calendar en la BD
    console.log('🔍 Buscando tokens de Calendar para usuario:', userId);
    
    const [tokens] = await req.db.execute(
      `SELECT * FROM user_tokens 
       WHERE user_id = ? AND service = 'google_calendar' 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!tokens || tokens.length === 0) {
      console.log('⚠️ Usuario no tiene tokens de Calendar guardados');
      return res.status(403).json({ 
        error: 'No tienes autorización para Calendar', 
        needsAuth: true,
        authUrl: '/api/auth/google/auth-url'
      });
    }

    const userTokens = tokens[0];
    console.log('✅ Tokens encontrados para usuario:', userId);
    console.log('   - Access token:', userTokens.access_token ? 'Presente' : 'NO PRESENTE');
    console.log('   - Refresh token:', userTokens.refresh_token ? 'Presente' : 'NO PRESENTE');
    console.log('   - Expira:', userTokens.expires_at);

    // Verificar si el token expiró
    const now = new Date();
    const expiresAt = new Date(userTokens.expires_at);
    
    if (expiresAt <= now) {
      console.log('⚠️ Access token expirado, necesita refresh');
      // TODO: Implementar refresh token
      // Por ahora, pedir re-autorización
      return res.status(403).json({ 
        error: 'Token de Calendar expirado', 
        needsAuth: true,
        authUrl: '/api/auth/google/auth-url'
      });
    }

    // Crear instancia del servicio y configurar tokens
    const calendarService = new GoogleCalendarService();
    calendarService.setCredentials({
      access_token: userTokens.access_token,
      refresh_token: userTokens.refresh_token,
      token_type: 'Bearer',
      expiry_date: expiresAt.getTime()
    });

    // Adjuntar al request para uso en los endpoints
    req.calendarService = calendarService;
    req.userId = userId;
    req.userEmail = decoded.email;
    req.hasCalendarAccess = true;

    console.log('✅ Servicio de Calendar configurado para usuario:', decoded.email);
    
    next();
  } catch (error) {
    console.error('❌ Error en middleware de Calendar:', error);
    res.status(500).json({ error: 'Error verificando autorización de Calendar' });
  }
};

// Middleware opcional - no bloquea si no hay tokens
const calendarAuthOptional = async (req, res, next) => {
  try {
    // Obtener el token JWT del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.hasCalendarAccess = false;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    // Verificar el JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      req.hasCalendarAccess = false;
      return next();
    }

    const userId = decoded.id;
    
    if (!userId || !req.db) {
      req.hasCalendarAccess = false;
      return next();
    }

    // Buscar tokens de Google Calendar en la BD
    const [tokens] = await req.db.execute(
      `SELECT * FROM user_tokens 
       WHERE user_id = ? AND service = 'google_calendar' 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (tokens && tokens.length > 0) {
      const userTokens = tokens[0];
      const expiresAt = new Date(userTokens.expires_at);
      const now = new Date();
      
      if (expiresAt > now) {
        // Crear instancia del servicio y configurar tokens
        const calendarService = new GoogleCalendarService();
        calendarService.setCredentials({
          access_token: userTokens.access_token,
          refresh_token: userTokens.refresh_token,
          token_type: 'Bearer',
          expiry_date: expiresAt.getTime()
        });

        req.calendarService = calendarService;
        req.hasCalendarAccess = true;
        req.userId = userId;
        req.userEmail = decoded.email;
      } else {
        req.hasCalendarAccess = false;
      }
    } else {
      req.hasCalendarAccess = false;
    }
    
    next();
  } catch (error) {
    console.error('Error en calendarAuthOptional:', error);
    req.hasCalendarAccess = false;
    next();
  }
};

module.exports = { calendarAuth, calendarAuthOptional };