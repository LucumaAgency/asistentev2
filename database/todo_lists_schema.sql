-- Schema para Todo Lists estilo Google Tasks
-- Fecha: 2025-08-23

USE ai_assistant_db;

-- 1. Tabla de categorías de todo lists
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

-- 2. Tabla de todo lists
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

-- 3. Tabla de todo items
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

-- 4. Tabla de etiquetas para todos
CREATE TABLE IF NOT EXISTS todo_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#407BFF',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_tag (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de relación muchos a muchos entre items y tags
CREATE TABLE IF NOT EXISTS todo_item_tags (
  item_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (item_id, tag_id),
  FOREIGN KEY (item_id) REFERENCES todo_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES todo_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla de colaboradores (para compartir listas)
CREATE TABLE IF NOT EXISTS todo_collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  user_id INT NOT NULL,
  invited_by INT NOT NULL,
  permission ENUM('view', 'edit') DEFAULT 'view',
  accepted BOOLEAN DEFAULT FALSE,
  invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_list_user (list_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla de actividad/historial
CREATE TABLE IF NOT EXISTS todo_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  list_id INT,
  item_id INT,
  action VARCHAR(50) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES todo_items(id) ON DELETE CASCADE,
  INDEX idx_user_activity (user_id, created_at DESC),
  INDEX idx_list_activity (list_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Vista para estadísticas de usuario
CREATE OR REPLACE VIEW user_todo_stats AS
SELECT 
  u.id as user_id,
  u.email,
  COUNT(DISTINCT tl.id) as total_lists,
  COUNT(DISTINCT ti.id) as total_items,
  COUNT(DISTINCT CASE WHEN ti.is_completed = TRUE THEN ti.id END) as completed_items,
  COUNT(DISTINCT CASE WHEN ti.is_completed = FALSE THEN ti.id END) as pending_items,
  COUNT(DISTINCT CASE WHEN ti.due_date < NOW() AND ti.is_completed = FALSE THEN ti.id END) as overdue_items,
  COUNT(DISTINCT tc.id) as total_categories
FROM users u
LEFT JOIN todo_lists tl ON u.id = tl.user_id
LEFT JOIN todo_items ti ON tl.id = ti.list_id
LEFT JOIN todo_categories tc ON u.id = tc.user_id
GROUP BY u.id;

-- 9. Procedimiento para crear categorías por defecto para nuevo usuario
DELIMITER $$
CREATE PROCEDURE create_default_categories(IN p_user_id INT)
BEGIN
  INSERT INTO todo_categories (user_id, name, color, icon, position, is_default) VALUES
    (p_user_id, 'Personal', '#667eea', '👤', 1, TRUE),
    (p_user_id, 'Trabajo', '#f59e0b', '💼', 2, FALSE),
    (p_user_id, 'Compras', '#10b981', '🛒', 3, FALSE),
    (p_user_id, 'Ideas', '#ec4899', '💡', 4, FALSE),
    (p_user_id, 'Proyectos', '#8b5cf6', '🚀', 5, FALSE);
END$$
DELIMITER ;

-- 10. Trigger para crear categorías por defecto cuando se crea un usuario
DELIMITER $$
CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  CALL create_default_categories(NEW.id);
END$$
DELIMITER ;

-- 11. Función para reordenar items en una lista
DELIMITER $$
CREATE PROCEDURE reorder_todo_items(
  IN p_list_id INT,
  IN p_item_id INT,
  IN p_new_position INT
)
BEGIN
  DECLARE current_pos INT;
  
  -- Obtener posición actual
  SELECT position INTO current_pos 
  FROM todo_items 
  WHERE id = p_item_id AND list_id = p_list_id;
  
  -- Reordenar items
  IF current_pos > p_new_position THEN
    -- Mover hacia arriba
    UPDATE todo_items 
    SET position = position + 1 
    WHERE list_id = p_list_id 
      AND position >= p_new_position 
      AND position < current_pos;
  ELSE
    -- Mover hacia abajo
    UPDATE todo_items 
    SET position = position - 1 
    WHERE list_id = p_list_id 
      AND position > current_pos 
      AND position <= p_new_position;
  END IF;
  
  -- Actualizar posición del item
  UPDATE todo_items 
  SET position = p_new_position 
  WHERE id = p_item_id;
END$$
DELIMITER ;

-- Mensaje de confirmación
SELECT 'Schema de Todo Lists creado exitosamente' as status;