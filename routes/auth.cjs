const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'https://asistentev2.pruebalucuma.site/api/auth/google/callback'
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
  return jwt.sign(
    {
      id: user.id,
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
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({ authUrl });
  });

  // Login con Google (soporta tanto ID Token como Code Flow)
  router.post('/google', async (req, res) => {
    try {
      console.log('📍 Recibiendo login con Google');
      const { credential, code } = req.body;

      let googleData, googleTokens;

      // Si viene un código de autorización (OAuth Code Flow)
      if (code) {
        console.log('🔐 Procesando código de autorización OAuth');
        const { tokens } = await client.getToken(code);
        googleTokens = tokens;
        
        // Verificar y decodificar el ID token
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
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
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Guardar tokens de Google si existen (para Calendar)
      if (db && user.id && googleTokens) {
        await db.execute(
          `INSERT INTO user_tokens (user_id, access_token, refresh_token, token_type, scope, expires_at) 
           VALUES (?, ?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE 
           access_token = VALUES(access_token), 
           refresh_token = VALUES(refresh_token),
           expires_at = VALUES(expires_at)`,
          [
            user.id,
            googleTokens.access_token,
            googleTokens.refresh_token,
            googleTokens.token_type || 'Bearer',
            googleTokens.scope || SCOPES.join(' '),
            googleTokens.expiry_date ? new Date(googleTokens.expiry_date) : new Date(Date.now() + 3600000)
          ]
        );
        console.log('✅ Tokens de Google Calendar guardados');
      }

      if (db && user.id) {
        await createSession(db, user.id, token, refreshToken);
      }

      res.json({
        success: true,
        token,
        refreshToken,
        hasCalendarAccess: !!googleTokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (error) {
      console.error('❌ Error en login con Google:', error.message);
      console.error('   Detalles:', error);
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

        if (db && decoded.id) {
          const [users] = await db.execute(
            'SELECT id, email, name, picture, locale, created_at FROM users WHERE id = ?',
            [decoded.id]
          );

          if (users.length > 0) {
            return res.json({ user: users[0] });
          }
        }

        res.json({ 
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture
          }
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