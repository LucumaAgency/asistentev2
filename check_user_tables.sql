-- Script para verificar si las tablas de usuarios existen

-- Verificar qué tablas existen
SHOW TABLES;

-- Verificar estructura de la tabla users (si existe)
DESCRIBE users;

-- Verificar estructura de la tabla user_sessions (si existe) 
DESCRIBE user_sessions;

-- Contar usuarios existentes
SELECT COUNT(*) as total_users FROM users;

-- Ver las últimas sesiones
SELECT * FROM user_sessions ORDER BY created_at DESC LIMIT 5;