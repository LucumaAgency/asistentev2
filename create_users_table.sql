-- Script para crear la tabla de usuarios con soporte para Google OAuth
-- Ejecuta este script en tu base de datos MariaDB/MySQL

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  picture VARCHAR(500),
  locale VARCHAR(10) DEFAULT 'es',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_google_id (google_id)
);

-- Crear tabla de sesiones de usuario
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_token VARCHAR(500) UNIQUE NOT NULL,
  refresh_token VARCHAR(500),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_token (session_token),
  INDEX idx_user_id (user_id)
);

-- Actualizar tabla de conversaciones para asociarlas con usuarios
ALTER TABLE conversations 
ADD COLUMN user_id INT DEFAULT NULL,
ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
ADD INDEX idx_user_id (user_id);

-- Actualizar tabla de modes para asociarlos con usuarios
ALTER TABLE modes 
ADD COLUMN user_id INT DEFAULT NULL,
ADD COLUMN is_public BOOLEAN DEFAULT FALSE,
ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
ADD INDEX idx_user_modes (user_id);

-- Actualizar tabla de chat_sessions para asociarlas con usuarios
ALTER TABLE chat_sessions 
ADD COLUMN user_id INT DEFAULT NULL,
ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
ADD INDEX idx_user_chats (user_id);

-- Verificar que las tablas se crearon/actualizaron
SHOW TABLES LIKE 'user%';
DESCRIBE users;
DESCRIBE user_sessions;