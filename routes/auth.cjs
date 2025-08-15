const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';

// Log inicial de configuración
console.log('🔧 Configuración OAuth al iniciar:');
console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Definido' : '❌ No definido');
console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Definido' : '❌ No definido');
console.log('   GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || 'Usando default');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html'
);

// Scopes requeridos para Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar'
];

// Función para verificar el token de Google
const verifyGoogleToken = async (token) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID no está configurado en las variables de entorno');
    }

    console.log('🔐 Verificando token con Google...');
    console.log('   Client ID:', process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...');
    
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    console.log('✅ Token verificado exitosamente');
    const payload = ticket.getPayload();
    return {
      googleId: payload['sub'],
      email: payload['email'],
      name: payload['name'],
      picture: payload['picture'],
      emailVerified: payload['email_verified'],
      locale: payload['locale']
    };
  } catch (error) {
    console.error('Error verificando token de Google:', error);
    throw new Error('Token de Google inválido');
  }
};

// Funciones auxiliares de auth.cjs
const generateToken = (user) => {
  // IMPORTANTE: Usar el ID numérico de la BD, no el google_id
  // FIX CRÍTICO: Asegurar que user.id sea número
  const numericId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
  
  console.log('📌 generateToken - IDs:', {
    original_id: user.id,
    original_type: typeof user.id,
    numeric_id: numericId,
    numeric_type: typeof numericId,
    google_id: user.google_id
  });
  
  return jwt.sign(
    {
      id: numericId,  // SIEMPRE usar el ID numérico
      google_id: user.google_id,
      email: user.email,
      name: user.name,
      picture: user.picture
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Token inválido');
    }
    return decoded;
  } catch (error) {
    throw new Error('Refresh token inválido');
  }
};

// Función para crear o actualizar usuario
const createOrUpdateUser = async (db, googleData) => {
  try {
    if (!db) {
      // Si no hay BD, retornar usuario temporal
      return {
        id: googleData.googleId,
        email: googleData.email,
        name: googleData.name,
        picture: googleData.picture
      };
    }

    const [existingUsers] = await db.execute(
      'SELECT * FROM users WHERE google_id = ? OR email = ?',
      [googleData.googleId, googleData.email]
    );

    let userId;
    
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await db.execute(
        'UPDATE users SET google_id = ?, name = ?, picture = ?, last_login = NOW() WHERE id = ?',
        [googleData.googleId, googleData.name, googleData.picture, userId]
      );
    } else {
      const [result] = await db.execute(
        'INSERT INTO users (google_id, email, name, picture, locale, last_login) VALUES (?, ?, ?, ?, ?, NOW())',
        [googleData.googleId, googleData.email, googleData.name, googleData.picture, googleData.locale || 'es']
      );
      userId = result.insertId;
    }

    const [users] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    return users[0];
  } catch (error) {
    console.error('Error creando/actualizando usuario:', error);
    throw error;
  }
};

// Crear sesión
const createSession = async (db, userId, token, refreshToken) => {
  try {
    if (!db) return;
    
    await db.execute(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [userId]
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.execute(
      'INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [userId, token, refreshToken, expiresAt]
    );
  } catch (error) {
    console.error('Error creando sesión:', error);
    throw error;
  }
};

const createAuthRoutes = (db) => {
  // Test endpoint para verificar que las rutas están funcionando
  router.get('/test', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Auth routes working',
      hasDB: db ? true : false,
      timestamp: new Date().toISOString()
    });
  });

  // Obtener URL de autorización con scopes de Calendar
  router.get('/google/auth-url', (req, res) => {
    try {
      console.log('📍 Generando URL de autorización OAuth');
      console.log('   CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ No configurado');
      console.log('   CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ No configurado');
      console.log('   REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html');
      
      if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('GOOGLE_CLIENT_ID no está configurado');
      }
      
      // Generar URL manualmente si hay problemas con el client
      let authUrl;
      try {
        authUrl = client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent',
          redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html'
        });
      } catch (clientError) {
        console.log('⚠️ Error con OAuth2Client, generando URL manualmente');
        // Generar URL manualmente como fallback
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html';
        const scopeString = SCOPES.join(' ');
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scopeString)}&` +
          `access_type=offline&` +
          `prompt=consent`;
      }
      
      console.log('✅ URL generada:', authUrl ? 'OK' : 'ERROR');
      res.json({ authUrl });
    } catch (error) {
      console.error('❌ Error generando URL de autorización:', error.message);
      res.status(500).json({ error: 'Error generando URL de autorización: ' + error.message });
    }
  });

  // Login con Google (soporta tanto ID Token como Code Flow)
  router.post('/google', async (req, res) => {
    // Crear logger si está disponible
    let logger;
    try {
      const Logger = require('../utils/logger.cjs');
      logger = new Logger();
    } catch (e) {
      // Si no hay logger, usar console
      logger = { writeLog: console.log, logError: console.error };
    }
    
    try {
      console.log('📍 Recibiendo login con Google');
      console.log('   Tipo de auth:', req.body.code ? 'OAuth Code Flow' : req.body.credential ? 'ID Token' : 'Desconocido');
      console.log('   Body completo:', JSON.stringify(req.body).substring(0, 200));
      
      logger.writeLog('🔐 ==========POST /api/auth/google INICIO==========', {
        timestamp: new Date().toISOString(),
        hasCode: !!req.body.code,
        codeLength: req.body.code?.length,
        hasCredential: !!req.body.credential,
        origin: req.headers.origin,
        referer: req.headers.referer,
        authorization: req.headers.authorization ? 'Present' : 'Missing'
      });
      
      const { credential, code } = req.body;

      let googleData, googleTokens;

      // Si viene un código de autorización (OAuth Code Flow)
      if (code) {
        console.log('🔐 Procesando OAuth Code Flow - TENDREMOS TOKENS DE CALENDAR');
        console.log('🔐 Procesando código de autorización OAuth');
        console.log('   Código recibido:', code.substring(0, 20) + '...');
        
        try {
          console.log('   Redirect URI configurado:', process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html');
          
          const tokenResponse = await client.getToken({
            code: code,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/oauth-callback.html'
          });
          
          googleTokens = tokenResponse.tokens;
          console.log('✅ Tokens obtenidos de Google:');
          console.log('   - access_token:', googleTokens.access_token ? '✓' : '✗');
          console.log('   - refresh_token:', googleTokens.refresh_token ? '✓' : '✗');
          console.log('   - id_token:', googleTokens.id_token ? '✓' : '✗');
          console.log('   - scope:', googleTokens.scope);
          
          logger.writeLog('✅ Tokens OAuth obtenidos', {
            hasAccessToken: !!googleTokens.access_token,
            hasRefreshToken: !!googleTokens.refresh_token,
            hasIdToken: !!googleTokens.id_token,
            scope: googleTokens.scope
          });
        } catch (tokenError) {
          console.error('❌ Error obteniendo tokens:', tokenError.message);
          console.error('   Detalles:', tokenError.response?.data || tokenError);
          logger.writeLog('❌ Error intercambiando código por tokens', {
            error: tokenError.message,
            details: tokenError.response?.data,
            code: tokenError.code,
            statusCode: tokenError.response?.status
          });
          
          // Proporcionar mensaje de error más específico
          if (tokenError.message.includes('invalid_grant')) {
            throw new Error('El código de autorización expiró o ya fue usado. Por favor intenta de nuevo.');
          } else if (tokenError.message.includes('redirect_uri_mismatch')) {
            throw new Error('Error de configuración: El redirect URI no coincide con el configurado en Google.');
          } else {
            throw tokenError;
          }
        }
        
        // Verificar y decodificar el ID token
        const ticket = await client.verifyIdToken({
          idToken: googleTokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        googleData = {
          googleId: payload['sub'],
          email: payload['email'],
          name: payload['name'],
          picture: payload['picture'],
          emailVerified: payload['email_verified'],
          locale: payload['locale']
        };
      } 
      // Si viene un credential (ID Token directo - login simple)
      else if (credential) {
        console.log('🔍 Verificando token con Google...');
        console.log('   Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Configurado' : 'NO CONFIGURADO');
        googleData = await verifyGoogleToken(credential);
      } else {
        return res.status(400).json({ error: 'No se proporcionó credential ni code' });
      }

      if (!googleData.emailVerified) {
        return res.status(400).json({ error: 'Email no verificado' });
      }

      const user = await createOrUpdateUser(db, googleData);
      console.log('👤 Usuario después de createOrUpdateUser:');
      console.log('   ID numérico:', user.id, 'tipo:', typeof user.id);
      console.log('   Google ID:', user.google_id);
      console.log('   Email:', user.email);
      
      // CRITICAL FIX: Asegurar que el token use el ID numérico, no el google_id
      console.log('🔥 GENERANDO TOKEN - Usuario completo:', {
        id: user.id,
        idType: typeof user.id,
        google_id: user.google_id,
        email: user.email
      });
      
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Guardar tokens de Google si existen (para Calendar)
      console.log('🔍 Intentando guardar tokens:');
      console.log('   DB disponible:', !!db);
      console.log('   User ID:', user.id);
      console.log('   User Google ID:', user.google_id || googleData.googleId);
      console.log('   User Email:', user.email);
      console.log('   Tokens disponibles:', !!googleTokens);
      
      logger.writeLog('🔍 Verificando guardado de tokens OAuth', {
        dbAvailable: !!db,
        userId: user.id,
        userGoogleId: user.google_id || googleData.googleId,
        userEmail: user.email,
        hasTokens: !!googleTokens,
        tokenScopes: googleTokens?.scope
      });
      
      // DEBUG SUPER DETALLADO
      console.log('🔍🔍🔍 DEBUG SUPER DETALLADO - GUARDADO DE TOKENS');
      console.log('=========================================');
      console.log('1. VERIFICACIÓN DE CONDICIONES:');
      console.log('   db existe?:', !!db);
      console.log('   user existe?:', !!user);
      console.log('   user.id existe?:', !!user?.id);
      console.log('   user.id valor:', user?.id);
      console.log('   user.id tipo:', typeof user?.id);
      console.log('   googleTokens existe?:', !!googleTokens);
      console.log('   googleTokens es objeto?:', typeof googleTokens === 'object');
      console.log('   googleTokens.access_token existe?:', !!googleTokens?.access_token);
      console.log('   googleTokens.refresh_token existe?:', !!googleTokens?.refresh_token);
      console.log('');
      console.log('2. CONTENIDO DE googleTokens:');
      if (googleTokens) {
        console.log('   access_token primeros 20 chars:', googleTokens.access_token?.substring(0, 20));
        console.log('   refresh_token primeros 20 chars:', googleTokens.refresh_token?.substring(0, 20));
        console.log('   token_type:', googleTokens.token_type);
        console.log('   expiry_date:', googleTokens.expiry_date);
        console.log('   scope:', googleTokens.scope);
        console.log('   id_token existe?:', !!googleTokens.id_token);
      } else {
        console.log('   googleTokens es null o undefined');
      }
      console.log('');
      console.log('3. EVALUACIÓN DE CONDICIÓN:');
      console.log('   db && user.id && googleTokens =', !!(db && user.id && googleTokens));
      console.log('=========================================');
      
      if (db && user.id && googleTokens) {
        console.log('💾 ENTRANDO A GUARDAR TOKENS EN BD...');
        console.log('   User ID a guardar:', user.id, 'tipo:', typeof user.id);
        console.log('   ¿Es número?:', !isNaN(user.id));
        console.log('   Access token length:', googleTokens.access_token?.length);
        console.log('   Refresh token length:', googleTokens.refresh_token?.length);
        
        logger.writeLog('💾 Intentando guardar tokens en BD', {
          userId: user.id,
          hasAccessToken: !!googleTokens.access_token,
          hasRefreshToken: !!googleTokens.refresh_token,
          tokenType: googleTokens.token_type,
          expiryDate: googleTokens.expiry_date
        });
        
        try {
          console.log('📝 EJECUTANDO INSERT - VALORES EXACTOS:');
          console.log('   user_id:', user.id, 'tipo:', typeof user.id);
          console.log('   service: google_calendar');
          console.log('   access_token primeros 50 chars:', googleTokens.access_token?.substring(0, 50));
          console.log('   refresh_token primeros 50 chars:', googleTokens.refresh_token?.substring(0, 50));
          console.log('   expires_at:', googleTokens.expiry_date ? new Date(googleTokens.expiry_date) : new Date(Date.now() + 3600000));
          
          // Asegurar que user.id es un número
          const userId = parseInt(user.id, 10);
          if (isNaN(userId)) {
            throw new Error(`User ID inválido: ${user.id} (tipo: ${typeof user.id})`);
          }
          
          console.log('📊 ANTES DEL EXECUTE:');
          console.log('   userId convertido:', userId);
          console.log('   userId es número?:', typeof userId === 'number');
          
          const result = await db.execute(
            `INSERT INTO user_tokens (user_id, service, access_token, refresh_token, expires_at) 
             VALUES (?, 'google_calendar', ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             access_token = VALUES(access_token), 
             refresh_token = VALUES(refresh_token),
             expires_at = VALUES(expires_at)`,
            [
              userId,
              googleTokens.access_token,
              googleTokens.refresh_token,
              googleTokens.expiry_date ? new Date(googleTokens.expiry_date) : new Date(Date.now() + 3600000)
            ]
          );
          console.log('✅ TOKENS GUARDADOS - RESULTADO:');
          console.log('   affectedRows:', result[0].affectedRows);
          console.log('   insertId:', result[0].insertId);
          console.log('   warningStatus:', result[0].warningStatus);
        } catch (insertError) {
          console.error('❌ ERROR COMPLETO AL GUARDAR TOKENS:');
          console.error('   Mensaje:', insertError.message);
          console.error('   SQL Error Code:', insertError.code);
          console.error('   SQL State:', insertError.sqlState);
          console.error('   SQL Message:', insertError.sqlMessage);
          console.error('   Stack:', insertError.stack);
          logger.writeLog('❌ ERROR CRÍTICO en INSERT de tokens', {
            error: insertError.message,
            code: insertError.code,
            sqlState: insertError.sqlState,
            sqlMessage: insertError.sqlMessage,
            stack: insertError.stack,
            userId: user.id
          });
          // NO lanzar el error para que el usuario al menos pueda autenticarse
        }
      } else {
        console.log('⚠️ NO SE GUARDARON TOKENS - ANÁLISIS DETALLADO:');
        console.log('   db existe?:', !!db);
        console.log('   user.id existe?:', !!user?.id, '- valor:', user?.id);
        console.log('   googleTokens existe?:', !!googleTokens);
        if (!db) console.log('   ❌ No hay conexión a BD');
        if (!user?.id) console.log('   ❌ No hay user.id');
        if (!googleTokens) console.log('   ❌ No hay tokens de Google (probablemente login con ID Token simple)');
      }

      if (db && user.id) {
        await createSession(db, user.id, token, refreshToken);
      }

      // Verificar si el usuario tiene acceso a Calendar
      let hasCalendarAccess = false;
      if (googleTokens) {
        // Si acabamos de obtener tokens nuevos, tiene acceso
        hasCalendarAccess = true;
      } else if (db && user.id) {
        // Verificar si ya tiene tokens guardados de antes
        try {
          const [existingTokens] = await db.execute(
            'SELECT id, expires_at FROM user_tokens WHERE user_id = ? AND service = "google_calendar"',
            [user.id]
          );
          
          if (existingTokens.length > 0) {
            // Verificar si el token no ha expirado
            const expiresAt = new Date(existingTokens[0].expires_at);
            hasCalendarAccess = expiresAt > new Date();
          }
        } catch (error) {
          console.log('Error verificando tokens existentes:', error);
        }
      }
      
      const responseData = {
        success: true,
        token,
        refreshToken,
        hasCalendarAccess,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      };
      
      logger.writeLog('✅ ==========POST /api/auth/google ÉXITO==========', {
        userId: user.id,
        userEmail: user.email,
        hasCalendarAccess: !!googleTokens,
        tokensWereSaved: !!(db && user.id && googleTokens)
      });
      
      res.json(responseData);
    } catch (error) {
      console.error('❌ Error en login con Google:', error.message);
      console.error('   Detalles:', error);
      
      logger.writeLog('❌ ==========POST /api/auth/google ERROR==========', {
        error: error.message,
        stack: error.stack,
        details: error.response?.data
      });
      
      res.status(500).json({ 
        error: 'Error al autenticar con Google',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Refresh token
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token no proporcionado' });
      }

      const decoded = verifyRefreshToken(refreshToken);
      let user = null;
      
      if (db) {
        const [users] = await db.execute(
          'SELECT * FROM users WHERE id = ?',
          [decoded.id]
        );
        
        if (users.length === 0) {
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        user = users[0];
      } else {
        user = { id: decoded.id };
      }

      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user);

      if (db && user.id) {
        await createSession(db, user.id, newToken, newRefreshToken);
      }

      res.json({
        success: true,
        token: newToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error('Error en refresh token:', error);
      res.status(401).json({ error: 'Refresh token inválido' });
    }
  });

  // Logout
  router.post('/logout', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token && db) {
        await db.execute(
          'DELETE FROM user_sessions WHERE session_token = ?',
          [token]
        );
      }

      res.json({ success: true, message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({ error: 'Error al cerrar sesión' });
    }
  });

  // Obtener perfil
  router.get('/profile', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
          return res.status(401).json({ error: 'Token inválido' });
        }

        let hasCalendarAccess = false;

        if (db && decoded.id) {
          const [users] = await db.execute(
            'SELECT id, email, name, picture, locale, created_at FROM users WHERE id = ?',
            [decoded.id]
          );
          
          // Verificar si tiene tokens de Calendar
          const [tokens] = await db.execute(
            'SELECT id FROM user_tokens WHERE user_id = ?',
            [decoded.id]
          );
          
          hasCalendarAccess = tokens.length > 0;

          if (users.length > 0) {
            return res.json({ 
              user: users[0],
              hasCalendarAccess
            });
          }
        }

        res.json({ 
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture
          },
          hasCalendarAccess
        });
      });
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      res.status(500).json({ error: 'Error al obtener perfil' });
    }
  });

  return router;
};

module.exports = createAuthRoutes;