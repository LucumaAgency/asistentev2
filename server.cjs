const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { OpenAI } = require('openai');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const GoogleCalendarService = require('./services/googleCalendar.cjs');
const logger = require('./utils/logger.cjs');
const { authenticateToken, optionalAuth } = require('./middleware/auth.cjs');
const { router: todosRouter, setDatabase: setTodosDatabase } = require('./routes/todos.cjs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com"],
      mediaSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:3001',
    'https://asistentev2.pruebalucuma.site'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes desde esta IP, por favor intenta de nuevo más tarde.'
});

app.use('/api/', limiter);

let db = null;
let useDatabase = false;
const inMemoryStore = {
  conversations: new Map(),
  messages: []
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

async function createDefaultModes(connection) {
  try {
    // Verificar si ya existen modos por defecto
    const [existingModes] = await connection.execute(
      'SELECT mode_id FROM modes WHERE mode_id IN ("default", "calendar")'
    );
    
    if (existingModes.length < 2) {
      // Crear modo General si no existe
      await connection.execute(
        `INSERT IGNORE INTO modes (mode_id, name, prompt, is_active) VALUES (?, ?, ?, ?)`,
        [
          'default',
          'General',
          'Eres un asistente virtual útil y amigable. Responde en español.',
          true
        ]
      );
      
      // Crear modo Calendario si no existe
      await connection.execute(
        `INSERT IGNORE INTO modes (mode_id, name, prompt, is_active) VALUES (?, ?, ?, ?)`,
        [
          'calendar',
          '📅 Calendario',
          `Eres un asistente especializado en gestión de calendario y reuniones. 
          Puedes agendar reuniones, verificar disponibilidad y gestionar eventos en Google Calendar.
          
          Cuando el usuario quiera agendar una reunión:
          1. Recopila información de forma conversacional: título, fecha, hora, duración, asistentes
          2. Si falta información crítica, pregunta específicamente por ella
          3. Usa valores por defecto inteligentes (30 min duración, Google Meet incluido)
          4. SIEMPRE confirma todos los detalles antes de agendar
          5. Usa la fecha/hora actual para interpretar referencias como "mañana", "próximo lunes"
          6. Al confirmar, muestra un resumen claro con emojis
          
          Responde siempre en español y sé proactivo sugiriendo mejores horarios si detectas conflictos.`,
          true
        ]
      );
      
      console.log('✅ Modos por defecto creados: General y Calendario');
    }
  } catch (error) {
    console.error('Error creando modos por defecto:', error);
  }
}

async function initDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'ai_assistant_user',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'secure_password_2024',
      database: process.env.DB_NAME || 'ai_assistant_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        metadata JSON
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        role ENUM('user', 'assistant', 'system') NOT NULL,
        content TEXT NOT NULL,
        audio_data LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_created_at (created_at)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_name VARCHAR(100) NOT NULL,
        key_value TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type VARCHAR(50) DEFAULT 'Bearer',
        scope TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    db = connection;
    useDatabase = true;
    console.log('✅ Base de datos conectada y tablas creadas');
    
    // Establecer conexión en el módulo compartido
    dbModule.setConnection(connection);
    console.log('🔗 Conexión establecida en módulo compartido');
    
    // Crear modos por defecto si no existen
    await createDefaultModes(connection);
  } catch (error) {
    console.error('⚠️ Error conectando a la base de datos:', error.message);
    console.log('📝 Usando almacenamiento en memoria como fallback');
    useDatabase = false;
  }
}

// Endpoint para ver los logs de Calendar
app.get('/api/logs/calendar', (req, res) => {
  const fs = require('fs');
  const logPath = logger.getLogPath();
  
  if (fs.existsSync(logPath)) {
    const logs = fs.readFileSync(logPath, 'utf8');
    res.type('text/plain').send(logs);
  } else {
    res.send('No hay logs disponibles aún');
  }
});

app.get('/api/health', (req, res) => {
  const packageJson = require('./package.json');
  res.json({
    status: 'ok',
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    database: useDatabase ? 'connected' : 'in-memory',
    openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'not-configured',
    node_version: process.version
  });
});

app.get('/api/db-test', async (req, res) => {
  if (!useDatabase) {
    return res.json({ 
      status: 'fallback', 
      message: 'Usando almacenamiento en memoria' 
    });
  }

  try {
    const [rows] = await db.execute('SELECT 1 as test');
    res.json({ 
      status: 'connected', 
      message: 'Base de datos funcionando correctamente',
      result: rows[0]
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

app.post('/api/conversations', optionalAuth, async (req, res) => {
  try {
    const { session_id, metadata = {} } = req.body;
    const userId = req.user ? req.user.id : null;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id es requerido' });
    }

    if (useDatabase) {
      const query = userId
        ? 'INSERT INTO conversations (session_id, user_id, metadata) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP, metadata = ?'
        : 'INSERT INTO conversations (session_id, metadata) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP, metadata = ?';
      const params = userId
        ? [session_id, userId, JSON.stringify(metadata), JSON.stringify(metadata)]
        : [session_id, JSON.stringify(metadata), JSON.stringify(metadata)];
      
      const [result] = await db.execute(query, params);
      
      const conversationId = result.insertId || result.affectedRows;
      res.json({ 
        success: true, 
        conversation_id: conversationId,
        session_id 
      });
    } else {
      const conversation = {
        id: Date.now(),
        session_id,
        created_at: new Date(),
        updated_at: new Date(),
        metadata
      };
      inMemoryStore.conversations.set(session_id, conversation);
      res.json({ 
        success: true, 
        conversation_id: conversation.id,
        session_id 
      });
    }
  } catch (error) {
    console.error('Error creando conversación:', error);
    res.status(500).json({ error: 'Error al crear conversación' });
  }
});

// Obtener todas las conversaciones del usuario autenticado
app.get('/api/conversations', optionalAuth, async (req, res) => {
  try {
    // Si no hay usuario autenticado, devolver array vacío
    if (!req.user) {
      return res.json({ success: true, conversations: [] });
    }
    
    const userId = req.user.id;
    
    if (useDatabase) {
      const [conversations] = await db.execute(
        `SELECT c.*, 
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
         (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) as last_message_at
         FROM conversations c 
         WHERE c.user_id = ? 
         ORDER BY c.updated_at DESC 
         LIMIT 50`,
        [userId]
      );
      
      res.json({ 
        success: true, 
        conversations: conversations.map(conv => ({
          ...conv,
          metadata: conv.metadata ? JSON.parse(conv.metadata) : {}
        }))
      });
    } else {
      // Sin base de datos, devolver array vacío
      res.json({ success: true, conversations: [] });
    }
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

app.get('/api/conversations/:session_id', optionalAuth, async (req, res) => {
  try {
    const { session_id } = req.params;
    const userId = req.user ? req.user.id : null;

    if (useDatabase) {
      const query = userId
        ? 'SELECT * FROM conversations WHERE session_id = ? AND user_id = ?'
        : 'SELECT * FROM conversations WHERE session_id = ?';
      const params = userId ? [session_id, userId] : [session_id];
      
      const [conversations] = await db.execute(query, params);

      if (conversations.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const conversation = conversations[0];
      const [messages] = await db.execute(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversation.id]
      );

      res.json({
        conversation: {
          ...conversation,
          metadata: JSON.parse(conversation.metadata || '{}')
        },
        messages
      });
    } else {
      const conversation = inMemoryStore.conversations.get(session_id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const messages = inMemoryStore.messages.filter(
        msg => msg.conversation_id === conversation.id
      );

      res.json({ conversation, messages });
    }
  } catch (error) {
    console.error('Error obteniendo conversación:', error);
    res.status(500).json({ error: 'Error al obtener conversación' });
  }
});

// Instancia del servicio de Google Calendar
const calendarService = new GoogleCalendarService();

// Funciones de calendario helpers
const calendarFunctions = {
  get_current_datetime: () => {
    const now = new Date();
    // Asegurar que usamos el año 2025 actual
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return {
      date: `${year}-${month}-${day}`,
      time: now.toTimeString().split(' ')[0].substring(0, 5),
      day_name: now.toLocaleDateString('es-ES', { weekday: 'long' }),
      year: year,
      formatted: now.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      current_year_info: `El año actual es ${year}. Usar este año para fechas futuras próximas.`
    };
  },
  
  schedule_meeting: async (params, userTokens) => {
    // Logger ya es una instancia, no una clase
    const logger = require('./utils/logger.cjs');
    logger.writeLog('📅 INICIO schedule_meeting con params:', params);
    
    // Validar y corregir el año si es 2023
    if (params.date && params.date.startsWith('2023-')) {
      params.date = params.date.replace('2023-', '2025-');
      logger.writeLog('⚠️ Corrigiendo año de 2023 a 2025:', params.date);
    }
    
    try {
      logger.logCalendarEvent('🎯 SCHEDULE_MEETING_CALLED', {
        params: params,
        hasTokens: !!userTokens,
        hasAccessToken: !!(userTokens && userTokens.access_token),
        tokenLength: userTokens?.access_token?.length
      });
      
      console.log('📅 FUNCIÓN schedule_meeting llamada con parámetros:', JSON.stringify(params, null, 2));
      console.log('🔑 DEBUG DETALLADO DE TOKENS:', {
        hasTokens: !!userTokens,
        hasAccessToken: !!(userTokens && userTokens.access_token),
        hasRefreshToken: !!(userTokens && userTokens.refresh_token),
        tokenService: userTokens?.service,
        tokenExpiresAt: userTokens?.expires_at,
        isExpired: userTokens?.expires_at ? new Date(userTokens.expires_at) < new Date() : 'N/A',
        accessTokenPreview: userTokens?.access_token ? userTokens.access_token.substring(0, 30) + '...' : 'NO HAY TOKEN'
      });
      
      // Validación explícita de tokens
      if (userTokens && userTokens.access_token) {
        logger.writeLog('🔐 USANDO GOOGLE CALENDAR REAL - CREANDO EVENTO');
        logger.writeLog('   Título:', params.title);
        logger.writeLog('   Fecha:', params.date);
        logger.writeLog('   Hora:', params.time);
        
        // Validar que calendarService existe
        if (!calendarService) {
          throw new Error('calendarService no está inicializado');
        }
        
        logger.writeLog('🔧 Configurando credenciales en calendarService');
        calendarService.setCredentials(userTokens);
        
        logger.writeLog('📝 Llamando a createEvent con parámetros:', {
          title: params.title,
          date: params.date,
          time: params.time,
          duration: params.duration || 30
        });
        
        let result;
        try {
          result = await calendarService.createEvent({
            title: params.title,
            date: params.date,
            time: params.time,
            duration: params.duration || 30,
            attendees: params.attendees || [],
            description: params.description || '',
            add_meet: params.add_meet !== false // Por defecto agregar Google Meet
          });
        } catch (createEventError) {
          logger.writeLog('❌ ERROR en calendarService.createEvent:', {
            message: createEventError.message,
            stack: createEventError.stack,
            code: createEventError.code
          });
          throw createEventError;
        }
        
        console.log('🎉 EVENTO CREADO EXITOSAMENTE:', result);
        logger.writeLog('✅ EVENTO CREADO EN GOOGLE CALENDAR', {
          eventId: result.eventId,
          meetLink: result.meetLink,
          calendarLink: result.htmlLink
        });
        
        return {
          success: true,
          meeting_id: result.eventId,
          meet_link: result.meetLink,
          calendar_link: result.htmlLink,
          message: `✅ Reunión "${params.title}" agendada exitosamente para ${params.date} a las ${params.time}. ${result.meetLink ? '\n📹 Link de Google Meet: ' + result.meetLink : ''}`
        };
      } else {
        // Modo simulación si no hay tokens
        console.log('⚠️ NO HAY TOKENS DE CALENDAR - MODO SIMULACIÓN');
        logger.writeLog('⚠️ MODO SIMULACIÓN - No hay tokens de Calendar');
        return {
          success: true,
          meeting_id: 'sim_' + Date.now(),
          meet_link: 'https://meet.google.com/sim-demo-test',
          message: `📅 [SIMULACIÓN] Reunión "${params.title}" agendada para ${params.date} a las ${params.time}.\n⚠️ Para agendar realmente en Google Calendar, asegúrate de haber iniciado sesión con los permisos de Calendar.`,
          simulated: true
        };
      }
    } catch (error) {
      console.error('❌ ERROR AGENDANDO REUNIÓN:', error);
      logger.logError(error);
      return {
        success: false,
        error: error.message,
        message: `❌ Error al agendar la reunión: ${error.message}`
      };
    }
  },
  
  check_availability: async (params, userTokens) => {
    try {
      if (userTokens && userTokens.access_token) {
        calendarService.setCredentials(userTokens);
        const result = await calendarService.checkAvailability(
          params.date,
          params.time,
          params.duration || 30
        );
        
        return {
          success: true,
          available: result.available,
          conflicts: result.conflicts,
          message: result.available 
            ? `✅ El horario está disponible`
            : `❌ Hay conflictos en ese horario: ${result.conflicts.map(c => `${c.start} - ${c.end}`).join(', ')}`
        };
      } else {
        return {
          success: true,
          available: true,
          message: '📅 [SIMULACIÓN] El horario parece estar disponible. Para verificar realmente, autoriza el acceso a Calendar.',
          simulated: true
        };
      }
    } catch (error) {
      console.error('Error verificando disponibilidad:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  list_events: async (params, userTokens) => {
    try {
      if (userTokens && userTokens.access_token) {
        calendarService.setCredentials(userTokens);
        const events = params.today 
          ? await calendarService.getTodayEvents()
          : await calendarService.listEvents(params.timeMin, params.maxResults || 10);
        
        if (events.length === 0) {
          return {
            success: true,
            events: [],
            message: '📅 No tienes eventos programados para este período'
          };
        }
        
        const formattedEvents = events.map(event => ({
          id: event.id,
          title: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          meetLink: event.conferenceData?.entryPoints?.[0]?.uri
        }));
        
        return {
          success: true,
          events: formattedEvents,
          count: events.length,
          message: `📅 Tienes ${events.length} evento(s) programado(s)`
        };
      } else {
        return {
          success: true,
          events: [],
          message: '📅 [SIMULACIÓN] Para ver tus eventos reales, autoriza el acceso a Calendar.',
          simulated: true
        };
      }
    } catch (error) {
      console.error('Error listando eventos:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  find_next_available: async (params, userTokens) => {
    try {
      if (userTokens && userTokens.access_token) {
        calendarService.setCredentials(userTokens);
        
        const result = await calendarService.checkAvailability(
          params.date,
          params.time,
          params.duration || 30
        );
        
        return result;
      } else {
        // Simulación
        return {
          available: true,
          conflicts: [],
          simulated: true
        };
      }
    } catch (error) {
      console.error('Error verificando disponibilidad:', error);
      return {
        available: true,
        conflicts: [],
        error: error.message
      };
    }
  },
  
  find_next_available: async (params, userTokens) => {
    try {
      if (userTokens && userTokens.access_token) {
        calendarService.setCredentials(userTokens);
        
        const result = await calendarService.findNextAvailableSlot(
          params.duration || 30,
          params.startFrom ? new Date(params.startFrom) : new Date()
        );
        
        return result;
      } else {
        // Simulación
        const nextSlot = new Date();
        nextSlot.setHours(nextSlot.getHours() + 1, 0, 0, 0);
        
        return {
          available: true,
          suggestedTime: nextSlot.toISOString(),
          suggestedTimeFormatted: nextSlot.toLocaleString('es-ES'),
          simulated: true
        };
      }
    } catch (error) {
      console.error('Error buscando horario disponible:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, session_id, audio_data, conversation_history = [], system_prompt, mode_context = false, mode_id } = req.body;
    
    // Obtener tokens del usuario para Calendar si está en modo calendar
    let userTokens = null;
    if (mode_id === 'calendar') {
      logger.writeLog('📅 ==========MODO CALENDAR ACTIVADO==========');
      logger.writeLog('   Mensaje recibido:', message);
      logger.writeLog('   Session ID:', session_id);
      logger.writeLog('   Mode ID:', mode_id);
      const authHeader = req.headers['authorization'];
      if (authHeader && useDatabase) {
        const token = authHeader.split(' ')[1];
        
        try {
          // Decodificar el JWT para obtener el user_id
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion');
          logger.writeLog('👤 Usuario autenticado:', { 
            email: decoded.email, 
            id: decoded.id,
            idType: typeof decoded.id,
            idLength: decoded.id?.toString().length 
          });
          
          if (decoded.id) {
            // IMPORTANTE: El ID en el JWT debe ser el ID numérico de la tabla users
            let realUserId = decoded.id;
            
            // Convertir a número si es string
            if (typeof realUserId === 'string') {
              realUserId = parseInt(realUserId, 10);
              
              // Si no es un número válido, buscar por email
              if (isNaN(realUserId)) {
                logger.writeLog('⚠️ ID no es numérico, buscando por email:', decoded.email);
                const [users] = await db.execute(
                  'SELECT id FROM users WHERE email = ?',
                  [decoded.email]
                );
                
                if (users.length > 0) {
                  realUserId = users[0].id;
                  logger.writeLog('✅ ID real encontrado por email:', realUserId);
                } else {
                  logger.writeLog('❌ No se encontró usuario con email:', decoded.email);
                }
              }
            }
            
            // Obtener tokens de Google del usuario usando el ID real
            logger.writeLog('🔎 Buscando tokens en BD para user_id:', realUserId);
            
            const [tokens] = await db.execute(
              'SELECT access_token, refresh_token, expires_at, service FROM user_tokens WHERE user_id = ? AND service = "google_calendar"',
              [realUserId]
            );
            
            logger.writeLog('📊 Resultado de búsqueda de tokens:', {
              userId: realUserId,
              tokensFound: tokens.length,
              hasAccessToken: tokens.length > 0 && !!tokens[0].access_token,
              hasRefreshToken: tokens.length > 0 && !!tokens[0].refresh_token
            });
            
            if (tokens.length > 0) {
              userTokens = {
                access_token: tokens[0].access_token,
                refresh_token: tokens[0].refresh_token,
                token_type: 'Bearer', // La tabla no tiene token_type, usar Bearer por defecto
                service: tokens[0].service,
                expiry_date: tokens[0].expires_at ? new Date(tokens[0].expires_at).getTime() : null
              };
              logger.writeLog('✅ Tokens de Calendar obtenidos de la BD', {
                hasAccessToken: !!userTokens.access_token,
                hasRefreshToken: !!userTokens.refresh_token,
                service: userTokens.service
              });
            } else {
              logger.writeLog('⚠️ No hay tokens de Calendar guardados para este usuario');
            }
          }
        } catch (error) {
          logger.logError(error);
          logger.writeLog('❌ Error obteniendo tokens de Calendar:', error.message);
        }
      } else if (!useDatabase) {
        logger.writeLog('⚠️ No hay BD conectada - Calendar funcionará en modo simulación');
      } else if (!authHeader) {
        logger.writeLog('⚠️ No hay header de autorización');
      }
    }

    if (!message || !session_id) {
      return res.status(400).json({ error: 'message y session_id son requeridos' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'API key de OpenAI no configurada',
        message: 'Por favor, configura OPENAI_API_KEY en las variables de entorno'
      });
    }

    let conversationId;
    let userIdForConversation = null;
    
    // Obtener el ID del usuario si está autenticado
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.google_id) {
          // Es un token con google_id, buscar el ID real del usuario
          const [users] = await db.execute(
            'SELECT id FROM users WHERE google_id = ?',
            [decoded.google_id]
          );
          if (users.length > 0) {
            userIdForConversation = users[0].id;
          }
        } else if (decoded.id) {
          // Es un token con el ID real
          userIdForConversation = decoded.id;
        } else if (decoded.email) {
          // Buscar por email como fallback
          const [users] = await db.execute(
            'SELECT id FROM users WHERE email = ?',
            [decoded.email]
          );
          if (users.length > 0) {
            userIdForConversation = users[0].id;
          }
        }
      } catch (error) {
        logger.writeLog('⚠️ Error verificando token para conversación:', error.message);
      }
    }
    
    if (useDatabase) {
      // Buscar conversación existente (con o sin user_id según autenticación)
      const conversationQuery = userIdForConversation
        ? 'SELECT id FROM conversations WHERE session_id = ? AND user_id = ?'
        : 'SELECT id FROM conversations WHERE session_id = ?';
      const conversationParams = userIdForConversation
        ? [session_id, userIdForConversation]
        : [session_id];
        
      const [conversations] = await db.execute(conversationQuery, conversationParams);

      if (conversations.length === 0) {
        // Crear nueva conversación con user_id si está disponible
        const insertQuery = userIdForConversation
          ? 'INSERT INTO conversations (session_id, user_id, metadata) VALUES (?, ?, ?)'
          : 'INSERT INTO conversations (session_id, metadata) VALUES (?, ?)';
        const insertParams = userIdForConversation
          ? [session_id, userIdForConversation, JSON.stringify({})]
          : [session_id, JSON.stringify({})];
          
        const [result] = await db.execute(insertQuery, insertParams);
        conversationId = result.insertId;
      } else {
        conversationId = conversations[0].id;
      }

      await db.execute(
        'INSERT INTO messages (conversation_id, role, content, audio_data) VALUES (?, ?, ?, ?)',
        [conversationId, 'user', message, audio_data || null]
      );
    } else {
      let conversation = inMemoryStore.conversations.get(session_id);
      if (!conversation) {
        conversation = {
          id: Date.now(),
          session_id,
          created_at: new Date(),
          updated_at: new Date(),
          metadata: {}
        };
        inMemoryStore.conversations.set(session_id, conversation);
      }
      conversationId = conversation.id;

      inMemoryStore.messages.push({
        id: Date.now(),
        conversation_id: conversationId,
        role: 'user',
        content: message,
        audio_data,
        created_at: new Date()
      });
    }

    let contextMessages = [];
    
    // Si se solicita contexto del modo, obtener todos los chats de ese modo
    if (mode_context && mode_id) {
      try {
        if (useDatabase) {
          // Obtener todas las sesiones del modo
          const [sessions] = await db.execute(
            'SELECT chat_id FROM chat_sessions WHERE mode_id = ? ORDER BY created_at DESC LIMIT 10',
            [mode_id]
          );
          
          // Para cada sesión, obtener sus mensajes
          for (const session of sessions) {
            // Buscar conversación asociada
            const [conversations] = await db.execute(
              `SELECT * FROM conversations WHERE metadata LIKE ?`,
              [`%"chat_id":"${session.chat_id}"%`]
            );
            
            if (conversations.length > 0) {
              const [msgs] = await db.execute(
                'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20',
                [conversations[0].id]
              );
              
              if (msgs.length > 0) {
                // Agregar resumen del chat al contexto
                const chatSummary = msgs.slice(0, 4).map(m => 
                  `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content.substring(0, 100)}...`
                ).join('\n');
                
                contextMessages.push({
                  role: 'system',
                  content: `[Contexto de chat anterior en esta categoría]:\n${chatSummary}\n---`
                });
              }
            }
          }
        }
      } catch (contextError) {
        console.log('Error obteniendo contexto del modo:', contextError);
        // Continuar sin contexto si hay error
      }
    }
    
    const messages = [
      { 
        role: 'system', 
        content: system_prompt || 'Eres un asistente de IA útil y amigable. Responde en el mismo idioma que el usuario.'
      },
      ...contextMessages, // Agregar mensajes de contexto
      ...conversation_history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Configurar herramientas si estamos en modo calendario
    let tools = undefined;
    if (mode_id === 'calendar') {
      tools = [
        {
          type: 'function',
          function: {
            name: 'get_current_datetime',
            description: 'Obtener la fecha y hora actual',
            parameters: { type: 'object', properties: {} }
          }
        },
        {
          type: 'function',
          function: {
            name: 'schedule_meeting',
            description: 'Agendar una reunión en Google Calendar. IMPORTANTE: Estamos en 2025, usar año 2025 para fechas futuras.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título de la reunión' },
                date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Usar año 2025 para fechas de este año.' },
                time: { type: 'string', description: 'Hora en formato HH:MM' },
                duration: { type: 'number', description: 'Duración en minutos' },
                attendees: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Lista de emails de los asistentes'
                },
                description: { type: 'string', description: 'Descripción de la reunión' },
                add_meet: { type: 'boolean', description: 'Agregar link de Google Meet' }
              },
              required: ['title', 'date', 'time']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'check_availability',
            description: 'Verificar disponibilidad en el calendario',
            parameters: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
                time: { type: 'string', description: 'Hora en formato HH:MM' },
                duration: { type: 'number', description: 'Duración en minutos' }
              },
              required: ['date', 'time']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'list_events',
            description: 'Listar eventos del calendario',
            parameters: {
              type: 'object',
              properties: {
                today: { type: 'boolean', description: 'Si es true, muestra solo eventos de hoy' },
                timeMin: { type: 'string', description: 'Fecha/hora mínima en formato ISO' },
                maxResults: { type: 'number', description: 'Número máximo de eventos a retornar' }
              }
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'find_next_available',
            description: 'Encontrar el próximo horario disponible',
            parameters: {
              type: 'object',
              properties: {
                duration: { type: 'number', description: 'Duración deseada en minutos' },
                startFrom: { type: 'string', description: 'Fecha/hora desde donde buscar (ISO format)' }
              }
            }
          }
        }
      ];
    }

    const completionParams = {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    };

    // Agregar tools si están definidas
    if (tools) {
      completionParams.tools = tools;
      completionParams.tool_choice = 'auto';
    }

    const completion = await openai.chat.completions.create(completionParams);

    let assistantMessage = completion.choices[0].message.content;
    
    // Manejar function calling si el modelo quiere usar herramientas
    if (completion.choices[0].message.tool_calls) {
      console.log('🛠️ El modelo quiere usar herramientas');
      
      // Logging detallado a archivo
      const debugInfo = {
        timestamp: new Date().toISOString(),
        calendarFunctionsExists: typeof calendarFunctions === 'object',
        hasScheduleMeeting: typeof calendarFunctions?.schedule_meeting === 'function',
        functionsAvailable: Object.keys(calendarFunctions || {}),
        toolCallsCount: completion.choices[0].message.tool_calls?.length || 0
      };
      
      logger.writeLog('📊 VERIFICACIÓN DE FUNCIONES:', debugInfo);
      console.log('📊 Verificación de funciones disponibles:', debugInfo);
      
      const toolCalls = completion.choices[0].message.tool_calls;
      const toolResults = [];
      
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log(`📞 Llamando función: ${functionName}`);
        console.log('   Argumentos:', functionArgs);
        
        let result;
        switch (functionName) {
          case 'get_current_datetime':
            result = calendarFunctions.get_current_datetime();
            break;
          case 'schedule_meeting':
            try {
              const scheduleDebug = {
                hasTokens: !!userTokens,
                hasAccessToken: !!userTokens?.access_token,
                userId: req.userId,
                modeId: req.body?.mode_id || 'unknown',
                functionArgs: functionArgs,
                tokenService: userTokens?.service
              };
              
              logger.writeLog('🗓️ IA EJECUTANDO schedule_meeting:', scheduleDebug);
              console.log('🗓️ IA ejecutando schedule_meeting - DEBUG:', scheduleDebug);
              
              // Validar que la función existe antes de llamarla
              if (typeof calendarFunctions.schedule_meeting !== 'function') {
                throw new Error('schedule_meeting function not found');
              }
              
              result = await calendarFunctions.schedule_meeting(functionArgs, userTokens);
              
              const resultDebug = {
                success: !!result?.id,
                eventId: result?.id,
                eventTitle: result?.summary,
                meetLink: result?.meetLink,
                error: result?.error
              };
              
              logger.writeLog('   ✅ RESULTADO DE IA:', resultDebug);
              console.log('   ✅ Resultado de IA:', resultDebug);
              
            } catch (scheduleError) {
              logger.writeLog('❌ ERROR EN schedule_meeting:', {
                message: scheduleError.message,
                stack: scheduleError.stack
              });
              console.error('❌ Error en schedule_meeting:', scheduleError);
              result = {
                error: scheduleError.message,
                details: 'Error al agendar la reunión'
              };
            }
            break;
          case 'check_availability':
            result = await calendarFunctions.check_availability(functionArgs, userTokens);
            break;
          case 'list_events':
            result = await calendarFunctions.list_events(functionArgs, userTokens);
            break;
          case 'find_next_available':
            result = await calendarFunctions.find_next_available(functionArgs, userTokens);
            break;
          default:
            result = { error: 'Función no encontrada' };
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }
      
      // Agregar la respuesta del modelo y los resultados de las herramientas
      const messagesWithTools = [
        ...messages,
        completion.choices[0].message,
        ...toolResults
      ];
      
      // Hacer una segunda llamada para obtener la respuesta final
      const finalCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesWithTools,
        temperature: 0.7,
        max_tokens: 1000
      });
      
      assistantMessage = finalCompletion.choices[0].message.content;
    }

    if (useDatabase) {
      await db.execute(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        [conversationId, 'assistant', assistantMessage]
      );
    } else {
      inMemoryStore.messages.push({
        id: Date.now() + 1,
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantMessage,
        created_at: new Date()
      });
    }

    res.json({
      success: true,
      message: assistantMessage,
      conversation_id: conversationId
    });

  } catch (error) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      name: error.name,
      modeId: req.body?.mode_id,
      hasUserTokens: !!userTokens,
      requestBody: {
        hasMessage: !!req.body?.message,
        sessionId: req.body?.session_id,
        modeId: req.body?.mode_id
      }
    };
    
    // Guardar en archivo de log
    logger.writeLog('❌ ERROR CRÍTICO EN CHAT:', errorDetails);
    
    // También en consola
    console.error('❌ ERROR EN CHAT - DETALLES COMPLETOS:', errorDetails);
    res.status(500).json({ 
      error: 'Error procesando mensaje',
      details: error.message 
    });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { conversation_id, role, content, audio_data } = req.body;

    if (!conversation_id || !role || !content) {
      return res.status(400).json({ 
        error: 'conversation_id, role y content son requeridos' 
      });
    }

    if (useDatabase) {
      const [result] = await db.execute(
        'INSERT INTO messages (conversation_id, role, content, audio_data) VALUES (?, ?, ?, ?)',
        [conversation_id, role, content, audio_data || null]
      );

      res.json({
        success: true,
        message_id: result.insertId
      });
    } else {
      const message = {
        id: Date.now(),
        conversation_id,
        role,
        content,
        audio_data,
        created_at: new Date()
      };
      inMemoryStore.messages.push(message);
      
      res.json({
        success: true,
        message_id: message.id
      });
    }
  } catch (error) {
    console.error('Error guardando mensaje:', error);
    res.status(500).json({ error: 'Error al guardar mensaje' });
  }
});

app.delete('/api/conversations/:session_id', optionalAuth, async (req, res) => {
  try {
    const { session_id } = req.params;
    const userId = req.user ? req.user.id : null;

    if (useDatabase) {
      // Solo permitir eliminar conversaciones propias si está autenticado
      const query = userId
        ? 'SELECT id FROM conversations WHERE session_id = ? AND user_id = ?'
        : 'SELECT id FROM conversations WHERE session_id = ?';
      const params = userId ? [session_id, userId] : [session_id];
      
      const [conversations] = await db.execute(query, params);

      if (conversations.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada o no autorizado' });
      }

      const deleteQuery = userId
        ? 'DELETE FROM conversations WHERE session_id = ? AND user_id = ?'
        : 'DELETE FROM conversations WHERE session_id = ?';
      const deleteParams = userId ? [session_id, userId] : [session_id];
      
      await db.execute(deleteQuery, deleteParams);

      res.json({ success: true, message: 'Conversación eliminada' });
    } else {
      const conversation = inMemoryStore.conversations.get(session_id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      inMemoryStore.messages = inMemoryStore.messages.filter(
        msg => msg.conversation_id !== conversation.id
      );
      inMemoryStore.conversations.delete(session_id);

      res.json({ success: true, message: 'Conversación eliminada' });
    }
  } catch (error) {
    console.error('Error eliminando conversación:', error);
    res.status(500).json({ error: 'Error al eliminar conversación' });
  }
});

// ======== MODES ENDPOINTS ========
// Get all modes
app.get('/api/modes', async (req, res) => {
  try {
    if (useDatabase) {
      const [modes] = await db.execute(
        'SELECT * FROM modes WHERE is_active = TRUE ORDER BY created_at'
      );
      res.json(modes);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error obteniendo modos:', error);
    res.status(500).json({ error: 'Error al obtener modos' });
  }
});

// Create mode
app.post('/api/modes', async (req, res) => {
  try {
    const { mode_id, name, prompt } = req.body;
    
    if (!mode_id || !name || !prompt) {
      return res.status(400).json({ error: 'mode_id, name y prompt son requeridos' });
    }
    
    if (useDatabase) {
      const [result] = await db.execute(
        'INSERT INTO modes (mode_id, name, prompt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), prompt = VALUES(prompt)',
        [mode_id, name, prompt]
      );
      res.json({ success: true, id: result.insertId });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error creando modo:', error);
    res.status(500).json({ error: 'Error al crear modo' });
  }
});

// Update mode
app.put('/api/modes/:mode_id', async (req, res) => {
  try {
    const { mode_id } = req.params;
    const { name, prompt } = req.body;
    
    if (!name || !prompt) {
      return res.status(400).json({ error: 'name y prompt son requeridos' });
    }
    
    if (useDatabase) {
      await db.execute(
        'UPDATE modes SET name = ?, prompt = ? WHERE mode_id = ?',
        [name, prompt, mode_id]
      );
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error actualizando modo:', error);
    res.status(500).json({ error: 'Error al actualizar modo' });
  }
});

// Delete mode
app.delete('/api/modes/:mode_id', async (req, res) => {
  try {
    const { mode_id } = req.params;
    
    if (useDatabase) {
      await db.execute(
        'UPDATE modes SET is_active = FALSE WHERE mode_id = ?',
        [mode_id]
      );
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error eliminando modo:', error);
    res.status(500).json({ error: 'Error al eliminar modo' });
  }
});

// ======== CALENDAR ENDPOINTS ========
// Importar middleware de Calendar
const { calendarAuth, calendarAuthOptional } = require('./middleware/calendarAuth.cjs');


// Middleware para pasar la BD a los middlewares
app.use((req, res, next) => {
  // Usar el módulo compartido para obtener la BD actual
  const currentDb = dbModule.getConnection();
  req.db = currentDb || db;  // Fallback a db local si existe
  
  if (!req.db) {
    console.log('⚠️ Middleware: No hay BD disponible para Calendar');
  }
  
  next();
});

// Obtener URL de autorización (redundante con /api/auth/google/auth-url pero lo mantenemos por compatibilidad)
app.get('/api/calendar/auth-url', (req, res) => {
  try {
    const authUrl = calendarService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generando URL de autorización:', error);
    res.status(500).json({ error: 'Error al generar URL de autorización' });
  }
});

// Listar eventos del calendario
app.get('/api/calendar/events', calendarAuth, async (req, res) => {
  try {
    console.log('📅 Listando eventos del calendario para usuario:', req.userEmail);
    
    const { timeMin, maxResults = 10 } = req.query;
    const events = await req.calendarService.listEvents(timeMin, maxResults);
    
    // Formatear eventos para el frontend
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.summary || 'Sin título',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri
    }));
    
    res.json({ 
      success: true,
      events: formattedEvents,
      count: formattedEvents.length
    });
  } catch (error) {
    console.error('❌ Error listando eventos:', error);
    res.status(500).json({ error: 'Error al obtener eventos del calendario' });
  }
});

// Obtener eventos de hoy
app.get('/api/calendar/events/today', calendarAuth, async (req, res) => {
  try {
    console.log('📅 Obteniendo eventos de hoy para:', req.userEmail);
    
    // Verificar que calendarService existe
    if (!req.calendarService) {
      console.error('❌ ERROR: No hay calendarService en req');
      return res.status(500).json({ 
        error: 'Servicio de Calendar no configurado',
        details: 'calendarService no existe en request',
        hasCalendarAccess: req.hasCalendarAccess
      });
    }
    
    // Verificar que el método existe
    if (typeof req.calendarService.getTodayEvents !== 'function') {
      console.error('❌ ERROR: getTodayEvents no es una función');
      return res.status(500).json({ 
        error: 'Método getTodayEvents no disponible',
        details: 'El servicio no tiene el método getTodayEvents',
        availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(req.calendarService))
      });
    }
    
    const events = await req.calendarService.getTodayEvents();
    
    // Formatear eventos para el frontend
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.summary || 'Sin título',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri
    }));
    
    res.json({ 
      success: true,
      events: formattedEvents,
      count: formattedEvents.length
    });
  } catch (error) {
    console.error('❌ Error COMPLETO obteniendo eventos de hoy:', error);
    console.error('   Stack:', error.stack);
    console.error('   Message:', error.message);
    
    // Devolver más detalles del error
    res.status(500).json({ 
      error: 'Error al obtener eventos de hoy',
      message: error.message,
      details: error.response?.data || error.toString(),
      hasCalendarService: !!req.calendarService,
      hasCalendarAccess: req.hasCalendarAccess,
      userEmail: req.userEmail
    });
  }
});

// Crear un evento
app.post('/api/calendar/events', calendarAuth, async (req, res) => {
  try {
    console.log('📅 Creando evento para usuario:', req.userEmail);
    console.log('   Datos del evento:', req.body);
    
    const { title, description, date, time, duration, attendees } = req.body;
    
    if (!title || !date || !time) {
      return res.status(400).json({ 
        error: 'Título, fecha y hora son requeridos' 
      });
    }
    
    const eventDetails = {
      title,
      description,
      date,
      time,
      duration: duration || 30,
      attendees: attendees || []
    };
    
    const result = await req.calendarService.createEvent(eventDetails);
    
    console.log('✅ Evento creado exitosamente:', result.eventId);
    
    res.json({
      success: true,
      eventId: result.eventId,
      htmlLink: result.htmlLink,
      meetLink: result.meetLink,
      message: 'Evento creado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error COMPLETO creando evento:', error);
    console.error('   Stack:', error.stack);
    console.error('   Message:', error.message);
    console.error('   Response data:', error.response?.data);
    
    res.status(500).json({ 
      error: 'Error al crear evento en el calendario',
      message: error.message,
      details: error.response?.data || error.toString(),
      hasCalendarService: !!req.calendarService,
      userEmail: req.userEmail
    });
  }
});

// Verificar disponibilidad
app.post('/api/calendar/check-availability', calendarAuth, async (req, res) => {
  try {
    const { date, time, duration = 30 } = req.body;
    
    if (!date || !time) {
      return res.status(400).json({ 
        error: 'Fecha y hora son requeridas' 
      });
    }
    
    console.log('🔍 Verificando disponibilidad:', { date, time, duration });
    
    const availability = await req.calendarService.checkAvailability(date, time, duration);
    
    res.json({
      success: true,
      ...availability
    });
  } catch (error) {
    console.error('❌ Error verificando disponibilidad:', error);
    res.status(500).json({ error: 'Error al verificar disponibilidad' });
  }
});

// Buscar próximo horario disponible
app.get('/api/calendar/next-available', calendarAuth, async (req, res) => {
  try {
    const { duration = 30 } = req.query;
    
    console.log('🔍 Buscando próximo horario disponible');
    
    const result = await req.calendarService.findNextAvailableSlot(parseInt(duration));
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('❌ Error buscando horario disponible:', error);
    res.status(500).json({ error: 'Error al buscar horario disponible' });
  }
});

// Actualizar un evento
app.patch('/api/calendar/events/:eventId', calendarAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const updates = req.body;
    
    console.log('📝 Actualizando evento:', eventId);
    
    const updatedEvent = await req.calendarService.updateEvent(eventId, updates);
    
    res.json({
      success: true,
      event: updatedEvent,
      message: 'Evento actualizado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error actualizando evento:', error);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

// Eliminar un evento
app.delete('/api/calendar/events/:eventId', calendarAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    
    console.log('🗑️ Eliminando evento:', eventId);
    
    await req.calendarService.deleteEvent(eventId);
    
    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error eliminando evento:', error);
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

// Verificar si el usuario tiene acceso a Calendar
app.get('/api/calendar/check-access', calendarAuthOptional, (req, res) => {
  res.json({
    hasAccess: req.hasCalendarAccess || false,
    userEmail: req.userEmail || null
  });
});

// ======== CHAT SESSIONS ENDPOINTS ========
// Get all chat sessions
app.get('/api/chat-sessions', async (req, res) => {
  try {
    if (useDatabase) {
      const [sessions] = await db.execute(
        'SELECT * FROM chat_sessions ORDER BY created_at DESC'
      );
      res.json(sessions);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error obteniendo sesiones de chat:', error);
    res.status(500).json({ error: 'Error al obtener sesiones de chat' });
  }
});

// Create chat session
app.post('/api/chat-sessions', async (req, res) => {
  try {
    const { chat_id, mode_id, title, session_id, messages } = req.body;
    
    if (!chat_id || !mode_id || !title) {
      return res.status(400).json({ error: 'chat_id, mode_id y title son requeridos' });
    }
    
    if (useDatabase) {
      // Primero crear o actualizar la sesión de chat
      const [result] = await db.execute(
        'INSERT INTO chat_sessions (chat_id, mode_id, title) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mode_id = VALUES(mode_id), title = VALUES(title)',
        [chat_id, mode_id, title]
      );
      
      // Si se proporcionan session_id y messages, guardar la conversación
      if (session_id && messages && messages.length > 0) {
        // Crear o actualizar la conversación
        const [convResult] = await db.execute(
          'INSERT INTO conversations (session_id, metadata) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
          [session_id, JSON.stringify({ chat_id, mode_id })]
        );
        
        const conversationId = convResult.insertId || convResult.affectedRows;
        
        // Guardar los mensajes
        for (const msg of messages) {
          if (msg.role && msg.content) {
            await db.execute(
              'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
              [conversationId, msg.role, msg.content]
            );
          }
        }
      }
      
      res.json({ success: true, id: result.insertId });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error creando sesión de chat:', error);
    res.status(500).json({ error: 'Error al crear sesión de chat' });
  }
});

// Update chat session (move to different mode)
app.put('/api/chat-sessions/:chat_id', async (req, res) => {
  try {
    const { chat_id } = req.params;
    const { mode_id, title } = req.body;
    
    if (useDatabase) {
      const updates = [];
      const values = [];
      
      if (mode_id) {
        updates.push('mode_id = ?');
        values.push(mode_id);
      }
      if (title) {
        updates.push('title = ?');
        values.push(title);
      }
      
      if (updates.length > 0) {
        values.push(chat_id);
        await db.execute(
          `UPDATE chat_sessions SET ${updates.join(', ')} WHERE chat_id = ?`,
          values
        );
      }
      
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error actualizando sesión de chat:', error);
    res.status(500).json({ error: 'Error al actualizar sesión de chat' });
  }
});

// Delete chat session
app.delete('/api/chat-sessions/:chat_id', async (req, res) => {
  try {
    const { chat_id } = req.params;
    
    if (useDatabase) {
      await db.execute(
        'DELETE FROM chat_sessions WHERE chat_id = ?',
        [chat_id]
      );
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error eliminando sesión de chat:', error);
    res.status(500).json({ error: 'Error al eliminar sesión de chat' });
  }
});

// Get chat sessions by mode
app.get('/api/chat-sessions/by-mode/:mode_id', async (req, res) => {
  try {
    const { mode_id } = req.params;
    
    if (useDatabase) {
      const [sessions] = await db.execute(
        'SELECT * FROM chat_sessions WHERE mode_id = ? ORDER BY created_at DESC',
        [mode_id]
      );
      res.json(sessions);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error obteniendo sesiones por modo:', error);
    res.status(500).json({ error: 'Error al obtener sesiones por modo' });
  }
});

// Get messages for a specific chat session
app.get('/api/chat-sessions/:chat_id/messages', async (req, res) => {
  try {
    const { chat_id } = req.params;
    
    if (useDatabase) {
      // First, get the session to find the conversation
      const [sessions] = await db.execute(
        'SELECT * FROM chat_sessions WHERE chat_id = ?',
        [chat_id]
      );
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: 'Sesión de chat no encontrada' });
      }
      
      // Try to find conversation by metadata containing chat_id
      const [conversations] = await db.execute(
        `SELECT * FROM conversations WHERE metadata LIKE ?`,
        [`%"chat_id":"${chat_id}"%`]
      );
      
      if (conversations.length > 0) {
        const conversation = conversations[0];
        const [messages] = await db.execute(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
          [conversation.id]
        );
        
        res.json({ 
          session: sessions[0],
          session_id: conversation.session_id,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        });
      } else {
        // No messages yet for this chat
        res.json({ 
          session: sessions[0],
          session_id: null,
          messages: []
        });
      }
    } else {
      // For in-memory storage, return empty for now
      res.json({ messages: [] });
    }
  } catch (error) {
    console.error('Error obteniendo mensajes del chat:', error);
    res.status(500).json({ error: 'Error al obtener mensajes del chat' });
  }
});

// Importar y configurar rutas de autenticación
const createAuthRoutes = require('./routes/auth.cjs');
const { optionalAuth, authenticateToken } = require('./middleware/auth.cjs');
const dbModule = require('./db-connection.cjs');


// Endpoint de debug para verificar configuración
app.get('/api/auth/config-check', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID ? 'Configurado' : 'NO CONFIGURADO',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Configurado' : 'NO CONFIGURADO',
    jwtSecret: process.env.JWT_SECRET ? 'Configurado' : 'NO CONFIGURADO',
    database: useDatabase ? 'Conectada' : 'No conectada',
    timestamp: new Date().toISOString()
  });
});

// Endpoint de debug simple para verificar tokens de Calendar
app.get('/api/debug/calendar-tokens', async (req, res) => {
  console.log('🔍 DEBUG CALENDAR TOKENS - Sin autenticación');
  
  try {
    if (!useDatabase || !db) {
      return res.json({ error: 'Base de datos no disponible' });
    }
    
    // Obtener todos los usuarios con tokens
    const [usersWithTokens] = await db.execute(
      'SELECT u.id, u.email, ut.service, ut.access_token IS NOT NULL as has_access, ' +
      'ut.refresh_token IS NOT NULL as has_refresh, ut.expires_at ' +
      'FROM users u ' +
      'LEFT JOIN user_tokens ut ON u.id = ut.user_id AND ut.service = "google_calendar"'
    );
    
    // Obtener modo Calendar
    const [calendarMode] = await db.execute(
      'SELECT * FROM modes WHERE mode_id = "calendar"'
    );
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      usersWithTokens: usersWithTokens.map(u => ({
        userId: u.id,
        email: u.email,
        hasTokens: u.has_access || u.has_refresh,
        hasAccessToken: u.has_access,
        hasRefreshToken: u.has_refresh,
        tokenExpiresAt: u.expires_at,
        isExpired: u.expires_at ? new Date(u.expires_at) < new Date() : null
      })),
      calendarModeExists: calendarMode.length > 0,
      calendarMode: calendarMode[0] || null
    };
    
    console.log('📊 Debug info:', JSON.stringify(debugInfo, null, 2));
    res.json(debugInfo);
    
  } catch (error) {
    console.error('❌ Error en debug tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de debug específico para Calendar + IA
app.get('/api/debug/calendar-ai', authenticateToken, async (req, res) => {
  console.log('🔍 DEBUG CALENDAR-AI INICIADO');
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    user: null,
    tokens: null,
    calendarMode: null,
    chatSession: null,
    errors: []
  };
  
  try {
    // 1. Verificar usuario autenticado
    const userId = req.user?.id || req.user?.userId || req.userId;
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario autenticado');
    }
    
    debugInfo.user = {
      id: userId,
      authenticated: true
    };
    console.log('✅ Usuario autenticado:', userId);
    
    // 2. Verificar tokens de Calendar
    if (useDatabase && db) {
      const [tokens] = await db.execute(
        'SELECT * FROM user_tokens WHERE user_id = ? AND service = "google_calendar"',
        [userId]
      );
      
      if (tokens && tokens.length > 0) {
        debugInfo.tokens = {
          exists: true,
          hasAccessToken: !!tokens[0].access_token,
          hasRefreshToken: !!tokens[0].refresh_token,
          expiresAt: tokens[0].expires_at,
          isExpired: tokens[0].expires_at ? new Date(tokens[0].expires_at) < new Date() : null
        };
        console.log('✅ Tokens encontrados:', debugInfo.tokens);
      } else {
        debugInfo.tokens = { exists: false };
        debugInfo.errors.push('No hay tokens de Calendar guardados');
        console.log('❌ No hay tokens de Calendar');
      }
      
      // 3. Verificar modo Calendar
      const [modes] = await db.execute(
        'SELECT * FROM modes WHERE mode_id = "calendar"'
      );
      
      if (modes && modes.length > 0) {
        debugInfo.calendarMode = {
          exists: true,
          id: modes[0].id,
          name: modes[0].name,
          hasFunctions: modes[0].available_functions ? true : false
        };
        console.log('✅ Modo Calendar configurado');
      } else {
        debugInfo.calendarMode = { exists: false };
        debugInfo.errors.push('Modo Calendar no existe en BD');
        console.log('❌ Modo Calendar no encontrado');
      }
      
      // 4. Verificar sesiones de chat
      // Buscar TODAS las sesiones para debug
      const [allSessions] = await db.execute(
        'SELECT chat_id, mode_id, title, created_at FROM chat_sessions ORDER BY created_at DESC LIMIT 5'
      );
      
      // Buscar sesión específica de calendar
      const [calendarSessions] = await db.execute(
        'SELECT * FROM chat_sessions WHERE mode_id = "calendar" ORDER BY created_at DESC LIMIT 1'
      );
      
      debugInfo.allRecentSessions = allSessions.map(s => ({
        chatId: s.chat_id,
        modeId: s.mode_id,
        title: s.title
      }));
      
      if (calendarSessions && calendarSessions.length > 0) {
        debugInfo.chatSession = {
          exists: true,
          chatId: calendarSessions[0].chat_id,
          modeId: calendarSessions[0].mode_id,
          title: calendarSessions[0].title,
          isCalendarMode: calendarSessions[0].mode_id === 'calendar'
        };
        console.log('✅ Sesión de chat Calendar encontrada:', debugInfo.chatSession);
      } else {
        debugInfo.chatSession = { exists: false };
        debugInfo.errors.push('No hay sesión de chat en modo Calendar');
        console.log('❌ No hay sesión de chat en modo Calendar');
      }
    }
    
    // 5. Verificar funciones disponibles
    debugInfo.functionsAvailable = {
      schedule_meeting: typeof calendarFunctions.schedule_meeting === 'function',
      check_availability: typeof calendarFunctions.check_availability === 'function',
      list_events: typeof calendarFunctions.list_events === 'function'
    };
    
    // 6. Resumen del diagnóstico
    debugInfo.summary = {
      canUseCalendarAI: !!(
        debugInfo.tokens?.exists && 
        debugInfo.calendarMode?.exists && 
        debugInfo.chatSession?.isCalendarMode
      ),
      issues: debugInfo.errors
    };
    
    console.log('🔍 DEBUG COMPLETO:', JSON.stringify(debugInfo, null, 2));
    
    res.json(debugInfo);
    
  } catch (error) {
    console.error('❌ Error en debug Calendar-AI:', error);
    debugInfo.errors.push(error.message);
    res.status(500).json(debugInfo);
  }
});

// Función removida - ya no necesaria

// Middleware para loguear TODAS las peticiones a /api/auth
app.use('/api/auth/*', (req, res, next) => {
  try {
    const logger = new Logger();
    logger.writeLog(`📨 REQUEST A ${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.log(`📨 REQUEST A ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Configurar auth routes temporalmente sin BD para que funcionen inmediatamente
const tempAuthRoutes = createAuthRoutes(null);
app.use('/api/auth', tempAuthRoutes);
console.log('⏳ Auth routes temporales configuradas (sin BD)');

async function startServer() {
  try {
    console.log('========================================');
    console.log('🔧 Iniciando servidor AI Assistant');
    console.log('========================================');
    console.log('📍 Variables de entorno:');
    console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('========================================');
    
    await initDatabase();
    
    // Reconfigurar auth routes con BD si está disponible
    if (useDatabase && db) {
      // MEJOR ENFOQUE: Eliminar las rutas temporales buscando específicamente el router
      const originalStackLength = app._router.stack.length;
      app._router.stack = app._router.stack.filter(layer => {
        // Eliminar solo las rutas que contienen /api/auth
        if (layer.regexp && layer.regexp.toString().includes('\\/api\\/auth')) {
          console.log('🗑️ Eliminando ruta temporal:', layer.regexp.toString());
          return false;
        }
        return true;
      });
      
      console.log(`🔄 Eliminadas ${originalStackLength - app._router.stack.length} rutas temporales de auth`);
      
      // Configurar nuevas rutas con BD
      const authRoutes = createAuthRoutes(db);
      app.use('/api/auth', authRoutes);
      
      // Configurar rutas de todos con BD solo si está disponible
      try {
        if (db) {
          setTodosDatabase(db);
          app.use('/api/todos', todosRouter);
          console.log('✅ Rutas de Todo Lists configuradas con BD');
        } else {
          console.log('⚠️ Rutas de Todo Lists no configuradas - BD no disponible');
        }
      } catch (error) {
        console.error('❌ Error configurando rutas de todos:', error);
      }
      
      console.log('✅ Rutas de autenticación RECONFIGURADAS con base de datos');
      console.log('📊 DB pasada a auth routes:', !!db);
      
      // Verificar que realmente se pasó la BD
      try {
        const testQuery = await db.execute('SELECT 1 as test');
        console.log('✅ BD verificada y funcionando en contexto de auth');
      } catch (e) {
        console.error('❌ ERROR: BD no funciona en contexto de auth:', e.message);
      }
      
      try {
        const logger = new Logger();
        logger.writeLog('✅ AUTH ROUTES RECONFIGURADAS CON BD', {
          timestamp: new Date().toISOString(),
          dbConnected: true,
          dbTest: 'passed'
        });
      } catch (e) {}
    } else {
      console.log('⚠️ Manteniendo rutas de autenticación SIN base de datos');
    }
    
    // Catch-all route DEBE ir al final, después de todas las rutas API
    app.get('*', (req, res) => {
      // No aplicar catch-all a archivos estáticos
      if (req.path.startsWith('/assets/') || 
          req.path.endsWith('.js') || 
          req.path.endsWith('.css') || 
          req.path.endsWith('.json') ||
          req.path.endsWith('.png') ||
          req.path.endsWith('.jpg') ||
          req.path.endsWith('.svg')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
    });
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📊 Base de datos: ${useDatabase ? 'MariaDB' : 'Memoria'}`);
      console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? 'Configurado' : 'No configurado'}`);
      console.log(`🟢 Node.js: ${process.version}`);
    });
  } catch (error) {
    console.error('Error iniciando servidor:', error);
    process.exit(1);
  }
}

startServer().catch(console.error);