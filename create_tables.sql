-- Script para crear las tablas de modes y chat_sessions
-- Ejecuta este script en tu base de datos MariaDB/MySQL

-- Crear tabla de modos si no existe
CREATE TABLE IF NOT EXISTS modes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mode_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Crear tabla de sesiones de chat si no existe
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id VARCHAR(255) UNIQUE NOT NULL,
  mode_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mode_id (mode_id),
  INDEX idx_created_at (created_at)
);

-- Insertar modo por defecto si no existe
INSERT INTO modes (mode_id, name, prompt) 
VALUES ('default', 'General', 'Eres un asistente virtual útil y amigable.')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Verificar que las tablas se crearon
SHOW TABLES LIKE '%mode%';
SHOW TABLES LIKE '%chat_session%';