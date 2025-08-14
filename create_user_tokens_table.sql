-- Script para crear la tabla user_tokens para Google Calendar OAuth
-- IMPORTANTE: Esta tabla es NECESARIA para que funcione la integración con Google Calendar

-- Crear tabla para almacenar tokens OAuth de servicios externos
CREATE TABLE IF NOT EXISTS user_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service VARCHAR(50) NOT NULL DEFAULT 'google_calendar',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_tokens (user_id),
  INDEX idx_service (service),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verificar que la tabla se creó correctamente
DESCRIBE user_tokens;

-- Ver si hay tokens guardados
SELECT 
  ut.id,
  ut.user_id,
  u.email,
  ut.service,
  LENGTH(ut.access_token) as token_length,
  LENGTH(ut.refresh_token) as refresh_length,
  ut.expires_at,
  ut.created_at
FROM user_tokens ut
LEFT JOIN users u ON ut.user_id = u.id
ORDER BY ut.created_at DESC;