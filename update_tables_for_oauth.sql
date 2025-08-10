-- Script para actualizar tablas existentes para soportar usuarios
-- Ejecuta este script si ya tienes las tablas pero sin las columnas de usuario

-- Agregar columna user_id a modes si no existe
ALTER TABLE modes 
ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Agregar columna user_id a chat_sessions si no existe
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL;

-- Agregar columna user_id a conversations si no existe
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL;

-- Agregar índices si no existen
ALTER TABLE modes ADD INDEX IF NOT EXISTS idx_user_modes (user_id);
ALTER TABLE chat_sessions ADD INDEX IF NOT EXISTS idx_user_chats (user_id);
ALTER TABLE conversations ADD INDEX IF NOT EXISTS idx_user_conversations (user_id);

-- Verificar las columnas agregadas
DESCRIBE modes;
DESCRIBE chat_sessions;
DESCRIBE conversations;