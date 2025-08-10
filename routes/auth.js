import express from 'express';
import { verifyGoogleToken } from '../config/googleAuth.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';

const router = express.Router();

// Función para crear o actualizar usuario en la BD
const createOrUpdateUser = async (db, googleData) => {
  try {
    // Buscar usuario existente
    const [existingUsers] = await db.execute(
      'SELECT * FROM users WHERE google_id = ? OR email = ?',
      [googleData.googleId, googleData.email]
    );

    let userId;
    
    if (existingUsers.length > 0) {
      // Actualizar usuario existente
      userId = existingUsers[0].id;
      await db.execute(
        'UPDATE users SET google_id = ?, name = ?, picture = ?, last_login = NOW() WHERE id = ?',
        [googleData.googleId, googleData.name, googleData.picture, userId]
      );
    } else {
      // Crear nuevo usuario
      const [result] = await db.execute(
        'INSERT INTO users (google_id, email, name, picture, locale, last_login) VALUES (?, ?, ?, ?, ?, NOW())',
        [googleData.googleId, googleData.email, googleData.name, googleData.picture, googleData.locale || 'es']
      );
      userId = result.insertId;
    }

    // Obtener el usuario actualizado
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

// Crear sesión en la BD
const createSession = async (db, userId, token, refreshToken) => {
  try {
    // Eliminar sesiones anteriores del usuario
    await db.execute(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [userId]
    );

    // Crear nueva sesión
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Token expira en 7 días

    await db.execute(
      'INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [userId, token, refreshToken, expiresAt]
    );
  } catch (error) {
    console.error('Error creando sesión:', error);
    throw error;
  }
};

export const createAuthRoutes = (db) => {
  // Endpoint para login con Google
  router.post('/google', async (req, res) => {
    try {
      const { credential } = req.body;

      if (!credential) {
        return res.status(400).json({ error: 'Token de Google no proporcionado' });
      }

      // Verificar el token de Google
      const googleData = await verifyGoogleToken(credential);

      if (!googleData.emailVerified) {
        return res.status(400).json({ error: 'Email no verificado' });
      }

      // Crear o actualizar usuario en la BD
      let user = null;
      if (db) {
        user = await createOrUpdateUser(db, googleData);
      } else {
        // Si no hay BD, crear usuario temporal
        user = {
          id: googleData.googleId,
          email: googleData.email,
          name: googleData.name,
          picture: googleData.picture
        };
      }

      // Generar tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Guardar sesión en BD si está disponible
      if (db && user.id) {
        await createSession(db, user.id, token, refreshToken);
      }

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (error) {
      console.error('Error en login con Google:', error);
      res.status(500).json({ error: 'Error al autenticar con Google' });
    }
  });

  // Endpoint para refresh token
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token no proporcionado' });
      }

      // Verificar refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Buscar usuario en BD
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
        // Usuario temporal si no hay BD
        user = { id: decoded.id };
      }

      // Generar nuevo token
      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user);

      // Actualizar sesión en BD
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

  // Endpoint para logout
  router.post('/logout', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token && db) {
        // Eliminar sesión de la BD
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

  // Endpoint para obtener perfil del usuario
  router.get('/profile', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      // Verificar token y obtener usuario
      const jwt = await import('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';
      
      jwt.default.verify(token, JWT_SECRET, async (err, decoded) => {
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

        // Si no hay BD o usuario, devolver los datos del token
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

export default createAuthRoutes;