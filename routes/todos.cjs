const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.cjs');

// Función helper para obtener la conexión DB
let db = null;
const setDatabase = (database) => {
  db = database;
};

// ============= CATEGORÍAS =============

// Obtener todas las categorías del usuario
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Base de datos no disponible' });
    }
    
    const userId = req.user.id;
    
    const [categories] = await db.execute(
      `SELECT * FROM todo_categories 
       WHERE user_id = ? 
       ORDER BY position ASC`,
      [userId]
    );
    
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// Crear nueva categoría
router.post('/categories', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, color = '#667eea', icon = '📋' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    // Obtener la posición más alta
    const [maxPos] = await db.execute(
      'SELECT MAX(position) as max_pos FROM todo_categories WHERE user_id = ?',
      [userId]
    );
    const position = (maxPos[0].max_pos || 0) + 1;
    
    const [result] = await db.execute(
      `INSERT INTO todo_categories (user_id, name, color, icon, position) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name, color, icon, position]
    );
    
    res.json({ 
      success: true, 
      category: { 
        id: result.insertId, 
        name, 
        color, 
        icon, 
        position 
      } 
    });
  } catch (error) {
    console.error('Error creando categoría:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
    } else {
      res.status(500).json({ error: 'Error al crear categoría' });
    }
  }
});

// ============= TODO LISTS =============

// Obtener todas las listas del usuario
router.get('/lists', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, archived = false } = req.query;
    
    let query = `
      SELECT tl.*, tc.name as category_name, tc.color as category_color, tc.icon as category_icon,
             COUNT(ti.id) as total_items,
             COUNT(CASE WHEN ti.is_completed = TRUE THEN 1 END) as completed_items
      FROM todo_lists tl
      LEFT JOIN todo_categories tc ON tl.category_id = tc.id
      LEFT JOIN todo_items ti ON tl.id = ti.list_id
      WHERE tl.user_id = ? AND tl.is_archived = ?
    `;
    
    const params = [userId, archived === 'true'];
    
    if (category_id) {
      query += ' AND tl.category_id = ?';
      params.push(category_id);
    }
    
    query += ' GROUP BY tl.id ORDER BY tl.position ASC';
    
    const [lists] = await db.execute(query, params);
    
    res.json({ success: true, lists });
  } catch (error) {
    console.error('Error obteniendo listas:', error);
    res.status(500).json({ error: 'Error al obtener listas' });
  }
});

// Crear nueva lista
router.post('/lists', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description = '', category_id } = req.body;
    
    if (!title || !category_id) {
      return res.status(400).json({ error: 'Título y categoría son requeridos' });
    }
    
    // Verificar que la categoría pertenece al usuario
    const [categories] = await db.execute(
      'SELECT id FROM todo_categories WHERE id = ? AND user_id = ?',
      [category_id, userId]
    );
    
    if (categories.length === 0) {
      return res.status(403).json({ error: 'Categoría no válida' });
    }
    
    // Obtener la posición más alta en la categoría
    const [maxPos] = await db.execute(
      'SELECT MAX(position) as max_pos FROM todo_lists WHERE category_id = ?',
      [category_id]
    );
    const position = (maxPos[0].max_pos || 0) + 1;
    
    const [result] = await db.execute(
      `INSERT INTO todo_lists (category_id, user_id, title, description, position) 
       VALUES (?, ?, ?, ?, ?)`,
      [category_id, userId, title, description, position]
    );
    
    res.json({ 
      success: true, 
      list: { 
        id: result.insertId, 
        category_id,
        title, 
        description, 
        position,
        total_items: 0,
        completed_items: 0
      } 
    });
  } catch (error) {
    console.error('Error creando lista:', error);
    res.status(500).json({ error: 'Error al crear lista' });
  }
});

// ============= TODO ITEMS =============

// Obtener items de una lista
router.get('/lists/:listId/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId } = req.params;
    
    // Verificar que la lista pertenece al usuario
    const [lists] = await db.execute(
      'SELECT id FROM todo_lists WHERE id = ? AND user_id = ?',
      [listId, userId]
    );
    
    if (lists.length === 0) {
      return res.status(404).json({ error: 'Lista no encontrada' });
    }
    
    const [items] = await db.execute(
      `SELECT ti.*, GROUP_CONCAT(tt.name) as tags
       FROM todo_items ti
       LEFT JOIN todo_item_tags tit ON ti.id = tit.item_id
       LEFT JOIN todo_tags tt ON tit.tag_id = tt.id
       WHERE ti.list_id = ?
       GROUP BY ti.id
       ORDER BY ti.position ASC`,
      [listId]
    );
    
    res.json({ 
      success: true, 
      items: items.map(item => ({
        ...item,
        tags: item.tags ? item.tags.split(',') : []
      }))
    });
  } catch (error) {
    console.error('Error obteniendo items:', error);
    res.status(500).json({ error: 'Error al obtener items' });
  }
});

// Crear nuevo item
router.post('/lists/:listId/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { listId } = req.params;
    const { 
      content, 
      priority = 'normal', 
      due_date = null,
      notes = '',
      created_by_voice = false 
    } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'El contenido es requerido' });
    }
    
    // Verificar que la lista pertenece al usuario
    const [lists] = await db.execute(
      'SELECT id FROM todo_lists WHERE id = ? AND user_id = ?',
      [listId, userId]
    );
    
    if (lists.length === 0) {
      return res.status(404).json({ error: 'Lista no encontrada' });
    }
    
    // Obtener la posición más alta
    const [maxPos] = await db.execute(
      'SELECT MAX(position) as max_pos FROM todo_items WHERE list_id = ?',
      [listId]
    );
    const position = (maxPos[0].max_pos || 0) + 1;
    
    const [result] = await db.execute(
      `INSERT INTO todo_items 
       (list_id, user_id, content, priority, due_date, notes, position, created_by_voice) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [listId, userId, content, priority, due_date, notes, position, created_by_voice]
    );
    
    // Registrar actividad
    await db.execute(
      `INSERT INTO todo_activity (user_id, list_id, item_id, action, details)
       VALUES (?, ?, ?, 'item_created', ?)`,
      [userId, listId, result.insertId, JSON.stringify({ content, created_by_voice })]
    );
    
    res.json({ 
      success: true, 
      item: { 
        id: result.insertId,
        list_id: listId,
        content, 
        is_completed: false,
        priority,
        due_date,
        notes,
        position,
        created_by_voice
      } 
    });
  } catch (error) {
    console.error('Error creando item:', error);
    res.status(500).json({ error: 'Error al crear item' });
  }
});

// Marcar item como completado/incompleto
router.patch('/items/:itemId/toggle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    
    // Verificar que el item pertenece al usuario
    const [items] = await db.execute(
      'SELECT * FROM todo_items WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    
    const currentItem = items[0];
    const newStatus = !currentItem.is_completed;
    const completedAt = newStatus ? new Date() : null;
    
    await db.execute(
      'UPDATE todo_items SET is_completed = ?, completed_at = ? WHERE id = ?',
      [newStatus, completedAt, itemId]
    );
    
    // Registrar actividad
    await db.execute(
      `INSERT INTO todo_activity (user_id, list_id, item_id, action, details)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, currentItem.list_id, itemId, newStatus ? 'item_completed' : 'item_uncompleted', '{}']
    );
    
    res.json({ 
      success: true, 
      is_completed: newStatus,
      completed_at: completedAt 
    });
  } catch (error) {
    console.error('Error actualizando item:', error);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

// Actualizar item
router.put('/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { content, priority, due_date, notes } = req.body;
    
    // Verificar que el item pertenece al usuario
    const [items] = await db.execute(
      'SELECT * FROM todo_items WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    
    const updates = [];
    const values = [];
    
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(due_date);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    
    if (updates.length > 0) {
      values.push(itemId);
      await db.execute(
        `UPDATE todo_items SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error actualizando item:', error);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

// Eliminar item
router.delete('/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    
    // Verificar que el item pertenece al usuario
    const [items] = await db.execute(
      'SELECT * FROM todo_items WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    
    await db.execute('DELETE FROM todo_items WHERE id = ?', [itemId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando item:', error);
    res.status(500).json({ error: 'Error al eliminar item' });
  }
});

// Reordenar items
router.post('/items/:itemId/reorder', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { newPosition } = req.body;
    
    // Verificar que el item pertenece al usuario
    const [items] = await db.execute(
      'SELECT list_id FROM todo_items WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    
    // Llamar al procedimiento almacenado
    await db.execute(
      'CALL reorder_todo_items(?, ?, ?)',
      [items[0].list_id, itemId, newPosition]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordenando item:', error);
    res.status(500).json({ error: 'Error al reordenar item' });
  }
});

// Obtener estadísticas del usuario
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [stats] = await db.execute(
      'SELECT * FROM user_todo_stats WHERE user_id = ?',
      [userId]
    );
    
    res.json({ 
      success: true, 
      stats: stats[0] || {
        total_lists: 0,
        total_items: 0,
        completed_items: 0,
        pending_items: 0,
        overdue_items: 0,
        total_categories: 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

module.exports = { router, setDatabase };