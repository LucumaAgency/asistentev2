-- Migración para agregar privacidad de chats por usuario
-- Fecha: 2025-08-23

USE ai_assistant_db;

-- 1. Agregar columna user_id a la tabla conversations
ALTER TABLE conversations 
ADD COLUMN user_id INT DEFAULT NULL AFTER session_id,
ADD INDEX idx_user_id (user_id),
ADD CONSTRAINT fk_conversations_user 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. Crear tabla para sesiones de chat (si no existe)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  mode_id VARCHAR(50) DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_sessions (user_id, created_at),
  INDEX idx_session_lookup (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Migrar datos existentes (asociar conversaciones huérfanas al primer usuario o marcarlas como públicas)
-- NOTA: Ajustar según la lógica de negocio deseada
UPDATE conversations 
SET user_id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users);

-- 4. Hacer user_id NOT NULL después de la migración (opcional, ejecutar manualmente después de verificar)
-- ALTER TABLE conversations MODIFY COLUMN user_id INT NOT NULL;

-- 5. Agregar índice compuesto para búsquedas eficientes
ALTER TABLE conversations 
ADD INDEX idx_user_conversations (user_id, updated_at DESC);

-- 6. Crear vista para facilitar consultas de conversaciones por usuario
CREATE OR REPLACE VIEW user_conversations_view AS
SELECT 
  c.id,
  c.session_id,
  c.user_id,
  u.email as user_email,
  u.name as user_name,
  c.created_at,
  c.updated_at,
  c.metadata,
  COUNT(m.id) as message_count,
  MAX(m.created_at) as last_message_at
FROM conversations c
INNER JOIN users u ON c.user_id = u.id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id;

-- 7. Procedimiento almacenado para limpiar conversaciones antiguas por usuario
DELIMITER $$
CREATE PROCEDURE cleanup_old_conversations(
  IN p_user_id INT,
  IN p_days_to_keep INT
)
BEGIN
  DELETE FROM conversations 
  WHERE user_id = p_user_id 
    AND updated_at < DATE_SUB(NOW(), INTERVAL p_days_to_keep DAY);
END$$
DELIMITER ;

-- Mensaje de confirmación
SELECT 'Migración de privacidad de chats completada' as status;