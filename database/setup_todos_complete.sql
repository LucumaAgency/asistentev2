-- Script completo para configurar el sistema de Todo Lists
-- Ejecutar este script para tener todo funcionando
-- Fecha: 2025-08-23

USE ai_assistant_db;

-- ============================================
-- 1. CREAR TABLAS BÁSICAS SI NO EXISTEN
-- ============================================

-- Tabla de usuarios (si no existe)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de modos (si no existe)
CREATE TABLE IF NOT EXISTS modes (
  mode_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. INSERTAR MODO TODO LISTS
-- ============================================

INSERT IGNORE INTO modes (mode_id, name, prompt, is_active) VALUES (
  'todos',
  '✅ Todo Lists',
  'Eres un asistente especializado en gestión de tareas y listas de pendientes.',
  true
);

-- ============================================
-- 3. CREAR ESTRUCTURA DE TODO LISTS
-- ============================================

-- Categorías de todo lists
CREATE TABLE IF NOT EXISTS todo_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#667eea',
  icon VARCHAR(50) DEFAULT '📋',
  position INT DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_categories (user_id, position),
  UNIQUE KEY unique_user_category (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Listas de tareas
CREATE TABLE IF NOT EXISTS todo_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position INT DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES todo_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_lists (user_id, category_id, position),
  INDEX idx_archived (is_archived, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Items de las listas
CREATE TABLE IF NOT EXISTS todo_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  due_date DATETIME NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  position INT DEFAULT 0,
  notes TEXT,
  created_by_voice BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_list_items (list_id, position),
  INDEX idx_user_items (user_id, is_completed, due_date),
  INDEX idx_completed (is_completed, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Actividad/historial
CREATE TABLE IF NOT EXISTS todo_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  list_id INT,
  item_id INT,
  action VARCHAR(50) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES todo_items(id) ON DELETE SET NULL,
  INDEX idx_user_activity (user_id, created_at DESC),
  INDEX idx_list_activity (list_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. CREAR PROCEDIMIENTO PARA CATEGORÍAS POR DEFECTO
-- ============================================

DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS create_default_categories(IN p_user_id INT)
BEGIN
  -- Solo crear si el usuario no tiene categorías
  DECLARE category_count INT;
  SELECT COUNT(*) INTO category_count FROM todo_categories WHERE user_id = p_user_id;
  
  IF category_count = 0 THEN
    INSERT INTO todo_categories (user_id, name, color, icon, position, is_default) VALUES
      (p_user_id, 'Personal', '#667eea', '👤', 1, TRUE),
      (p_user_id, 'Trabajo', '#f59e0b', '💼', 2, FALSE),
      (p_user_id, 'Compras', '#10b981', '🛒', 3, FALSE);
  END IF;
END$$
DELIMITER ;

-- ============================================
-- 5. CREAR CATEGORÍAS PARA USUARIOS EXISTENTES
-- ============================================

-- Crear categorías por defecto para todos los usuarios que no las tengan
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS setup_categories_for_all_users()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE user_id_var INT;
  DECLARE cur CURSOR FOR SELECT id FROM users;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN cur;
  
  read_loop: LOOP
    FETCH cur INTO user_id_var;
    IF done THEN
      LEAVE read_loop;
    END IF;
    CALL create_default_categories(user_id_var);
  END LOOP;
  
  CLOSE cur;
END$$
DELIMITER ;

-- Ejecutar para usuarios existentes
CALL setup_categories_for_all_users();

-- ============================================
-- 6. VISTA DE ESTADÍSTICAS
-- ============================================

CREATE OR REPLACE VIEW user_todo_stats AS
SELECT 
  u.id as user_id,
  u.email,
  COUNT(DISTINCT tl.id) as total_lists,
  COUNT(DISTINCT ti.id) as total_items,
  COUNT(DISTINCT CASE WHEN ti.is_completed = TRUE THEN ti.id END) as completed_items,
  COUNT(DISTINCT CASE WHEN ti.is_completed = FALSE THEN ti.id END) as pending_items,
  COUNT(DISTINCT tc.id) as total_categories
FROM users u
LEFT JOIN todo_lists tl ON u.id = tl.user_id AND tl.is_archived = FALSE
LEFT JOIN todo_items ti ON tl.id = ti.list_id
LEFT JOIN todo_categories tc ON u.id = tc.user_id
GROUP BY u.id, u.email;

-- ============================================
-- 7. MENSAJE DE CONFIRMACIÓN
-- ============================================

SELECT 'Sistema de Todo Lists configurado exitosamente' as status,
       (SELECT COUNT(*) FROM todo_categories) as total_categories,
       (SELECT COUNT(*) FROM users) as total_users;