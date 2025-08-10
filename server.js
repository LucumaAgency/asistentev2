import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'frontend', 'dist')));

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

async function initDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'ai_assistant_user',
      password: process.env.DB_PASSWORD || 'secure_password_2024',
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
      CREATE TABLE IF NOT EXISTS modes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mode_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        prompt TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(255) UNIQUE NOT NULL,
        mode_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_mode_id (mode_id),
        INDEX idx_created_at (created_at)
      )
    `);

    db = connection;
    useDatabase = true;
    console.log('✅ Base de datos conectada y tablas creadas');
  } catch (error) {
    console.error('⚠️ Error conectando a la base de datos:', error.message);
    console.log('📝 Usando almacenamiento en memoria como fallback');
    useDatabase = false;
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: useDatabase ? 'connected' : 'in-memory',
    openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'not-configured'
  });
});

// Endpoints para modos
app.get('/api/modes', async (req, res) => {
  try {
    if (useDatabase) {
      const [modes] = await db.execute('SELECT * FROM modes WHERE is_active = TRUE ORDER BY created_at');
      res.json(modes);
    } else {
      res.json([]); // Por ahora retornar vacío si no hay BD
    }
  } catch (error) {
    console.error('Error obteniendo modos:', error);
    res.status(500).json({ error: 'Error al obtener modos' });
  }
});

app.post('/api/modes', async (req, res) => {
  try {
    const { mode_id, name, prompt } = req.body;
    
    if (!mode_id || !name || !prompt) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    if (useDatabase) {
      await db.execute(
        'INSERT INTO modes (mode_id, name, prompt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), prompt = VALUES(prompt)',
        [mode_id, name, prompt]
      );
      res.json({ success: true, message: 'Modo guardado' });
    } else {
      res.json({ success: true, message: 'Modo guardado en memoria' });
    }
  } catch (error) {
    console.error('Error guardando modo:', error);
    res.status(500).json({ error: 'Error al guardar modo' });
  }
});

app.delete('/api/modes/:mode_id', async (req, res) => {
  try {
    const { mode_id } = req.params;
    
    if (useDatabase) {
      await db.execute('UPDATE modes SET is_active = FALSE WHERE mode_id = ?', [mode_id]);
      res.json({ success: true, message: 'Modo eliminado' });
    } else {
      res.json({ success: true, message: 'Modo eliminado de memoria' });
    }
  } catch (error) {
    console.error('Error eliminando modo:', error);
    res.status(500).json({ error: 'Error al eliminar modo' });
  }
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

app.post('/api/conversations', async (req, res) => {
  try {
    const { session_id, metadata = {} } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id es requerido' });
    }

    if (useDatabase) {
      const [result] = await db.execute(
        'INSERT INTO conversations (session_id, metadata) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP, metadata = ?',
        [session_id, JSON.stringify(metadata), JSON.stringify(metadata)]
      );
      
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

app.get('/api/conversations/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    if (useDatabase) {
      const [conversations] = await db.execute(
        'SELECT * FROM conversations WHERE session_id = ?',
        [session_id]
      );

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

app.post('/api/chat', async (req, res) => {
  console.log('📨 POST /api/chat - Iniciando');
  console.log('Body recibido:', { 
    message: req.body.message?.substring(0, 50), 
    session_id: req.body.session_id,
    has_history: req.body.conversation_history?.length > 0,
    system_prompt: req.body.system_prompt?.substring(0, 50)
  });
  
  try {
    const { message, session_id, audio_data, conversation_history = [], system_prompt } = req.body;

    if (!message || !session_id) {
      console.log('❌ Faltan parámetros requeridos');
      return res.status(400).json({ error: 'message y session_id son requeridos' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API key no configurada');
      return res.status(500).json({ 
        error: 'API key de OpenAI no configurada',
        message: 'Por favor, configura OPENAI_API_KEY en las variables de entorno'
      });
    }
    
    console.log('✅ Validaciones pasadas, procesando con OpenAI...');

    let conversationId;
    if (useDatabase) {
      const [conversations] = await db.execute(
        'SELECT id FROM conversations WHERE session_id = ?',
        [session_id]
      );

      if (conversations.length === 0) {
        const [result] = await db.execute(
          'INSERT INTO conversations (session_id, metadata) VALUES (?, ?)',
          [session_id, JSON.stringify({})]
        );
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

    const messages = [
      { 
        role: 'system', 
        content: system_prompt || 'Eres un asistente de IA útil y amigable. Responde en el mismo idioma que el usuario.'
      },
      ...conversation_history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    console.log('🤖 Enviando a OpenAI con', messages.length, 'mensajes');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    const assistantMessage = completion.choices[0].message.content;
    console.log('✅ Respuesta de OpenAI recibida:', assistantMessage.substring(0, 100));

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
    console.error('❌ Error en chat:', error);
    console.error('Stack trace:', error.stack);
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

app.delete('/api/conversations/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    if (useDatabase) {
      const [conversations] = await db.execute(
        'SELECT id FROM conversations WHERE session_id = ?',
        [session_id]
      );

      if (conversations.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      await db.execute(
        'DELETE FROM conversations WHERE session_id = ?',
        [session_id]
      );

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
    const { chat_id, mode_id, title } = req.body;
    
    if (!chat_id || !mode_id || !title) {
      return res.status(400).json({ error: 'chat_id, mode_id y title son requeridos' });
    }
    
    if (useDatabase) {
      const [result] = await db.execute(
        'INSERT INTO chat_sessions (chat_id, mode_id, title) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mode_id = VALUES(mode_id), title = VALUES(title)',
        [chat_id, mode_id, title]
      );
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

// Catch-all route for SPA - MUST be last
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'frontend', 'dist', 'index.html'));
});

async function startServer() {
  console.log('========================================');
  console.log('🔧 Iniciando servidor AI Assistant');
  console.log('========================================');
  console.log('📍 Variables de entorno detectadas:');
  console.log('   DB_HOST:', process.env.DB_HOST || 'no configurado');
  console.log('   DB_USER:', process.env.DB_USER || 'no configurado');
  console.log('   DB_NAME:', process.env.DB_NAME || 'no configurado');
  console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? '***configurado***' : 'no configurado');
  console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***configurado***' : 'no configurado');
  console.log('   PORT:', process.env.PORT || 3001);
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('   Node.js version:', process.version);
  console.log('========================================');
  
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Base de datos: ${useDatabase ? 'MariaDB conectada' : 'Usando memoria (fallback)'}`);
    console.log(`🤖 OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ No configurada'}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('========================================');
  });
}

startServer().catch(console.error);