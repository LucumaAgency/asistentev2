const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { OpenAI } = require('openai');
const rateLimit = require('express-rate-limit');
const path = require('path');

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
  try {
    const { message, session_id, audio_data, conversation_history = [] } = req.body;

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
        content: 'Eres un asistente de IA útil y amigable. Responde en el mismo idioma que el usuario.'
      },
      ...conversation_history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    const assistantMessage = completion.choices[0].message.content;

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
    console.error('Error en chat:', error);
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

async function startServer() {
  try {
    await initDatabase();
    
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