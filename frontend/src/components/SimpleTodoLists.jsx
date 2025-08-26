import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SimpleTodoLists.css';
import { createLogger } from '../utils/logger';

const logger = createLogger('TodoLists');

function SimpleTodoLists({ voiceInput, onVoiceProcessed }) {
  const [lists, setLists] = useState([]);
  const [newListTitle, setNewListTitle] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUserLists();
  }, []);

  // Procesar entrada de voz
  useEffect(() => {
    if (voiceInput && voiceInput.trim()) {
      handleVoiceCommand(voiceInput);
    }
  }, [voiceInput]);

  const loadUserLists = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Por favor inicia sesión para usar Todo Lists');
        setLoading(false);
        return;
      }

      // Primero asegurar que el usuario tenga categorías
      await ensureUserSetup();
      
      // Cargar las listas del usuario
      const response = await axios.get('/api/todos/lists', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        // Cargar items para cada lista
        const listsWithItems = await Promise.all(
          response.data.lists.map(async (list) => {
            const itemsResponse = await axios.get(`/api/todos/lists/${list.id}/items`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            return {
              ...list,
              items: itemsResponse.data.items || []
            };
          })
        );
        setLists(listsWithItems);
      }
    } catch (err) {
      logger.error('Error cargando listas:', err);
      setError('Error al cargar las listas');
    } finally {
      setLoading(false);
    }
  };

  const ensureUserSetup = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Verificar si el usuario tiene categorías
      const catResponse = await axios.get('/api/todos/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Si no tiene categorías, crear una por defecto
      if (!catResponse.data.categories || catResponse.data.categories.length === 0) {
        await axios.post('/api/todos/categories', {
          name: 'Mis Tareas',
          color: '#667eea',
          icon: '📋'
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (err) {
      logger.error('Error configurando usuario:', err);
    }
  };

  const createList = async () => {
    if (!newListTitle.trim()) return;

    try {
      const token = localStorage.getItem('token');
      
      // Obtener la primera categoría disponible
      const catResponse = await axios.get('/api/todos/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (catResponse.data.categories && catResponse.data.categories.length > 0) {
        const categoryId = catResponse.data.categories[0].id;
        
        const response = await axios.post('/api/todos/lists', {
          title: newListTitle.trim(),
          category_id: categoryId
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data.success) {
          const newList = {
            ...response.data.list,
            items: []
          };
          setLists([...lists, newList]);
          setNewListTitle('');
          setIsCreatingList(false);
        }
      }
    } catch (err) {
      logger.error('Error creando lista:', err);
    }
  };

  const addItemToList = async (listId, content) => {
    if (!content.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/todos/lists/${listId}/items`, {
        content: content.trim(),
        created_by_voice: false
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setLists(lists.map(list => 
          list.id === listId 
            ? { ...list, items: [...list.items, response.data.item] }
            : list
        ));
      }
    } catch (err) {
      logger.error('Error agregando item:', err);
    }
  };

  const toggleItem = async (listId, itemId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(`/api/todos/items/${itemId}/toggle`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setLists(lists.map(list => 
          list.id === listId 
            ? {
                ...list,
                items: list.items.map(item =>
                  item.id === itemId
                    ? { ...item, is_completed: response.data.is_completed }
                    : item
                )
              }
            : list
        ));
      }
    } catch (err) {
      logger.error('Error actualizando item:', err);
    }
  };

  const deleteItem = async (listId, itemId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/todos/items/${itemId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setLists(lists.map(list => 
        list.id === listId 
          ? { ...list, items: list.items.filter(item => item.id !== itemId) }
          : list
      ));
    } catch (err) {
      logger.error('Error eliminando item:', err);
    }
  };

  const deleteList = async (listId) => {
    if (!confirm('¿Eliminar esta lista y todas sus tareas?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/todos/lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setLists(lists.filter(list => list.id !== listId));
    } catch (err) {
      logger.error('Error eliminando lista:', err);
    }
  };

  const handleVoiceCommand = async (text) => {
    const lowerText = text.toLowerCase();
    
    // Comando para crear nueva lista
    if (lowerText.includes('nueva lista') || lowerText.includes('crear lista')) {
      const title = text.replace(/^(nueva lista|crear lista)\s*/i, '').trim();
      if (title) {
        setNewListTitle(title);
        await createList();
      }
      onVoiceProcessed && onVoiceProcessed();
      return;
    }

    // Si hay listas, agregar a la primera lista por defecto
    if (lists.length > 0) {
      await addItemToList(lists[0].id, text);
      onVoiceProcessed && onVoiceProcessed();
    } else {
      // Si no hay listas, crear una primera
      setNewListTitle('Mi Lista');
      await createList();
      // Esperar un poco y luego agregar el item
      setTimeout(() => {
        if (lists.length > 0) {
          addItemToList(lists[0].id, text);
        }
      }, 1000);
      onVoiceProcessed && onVoiceProcessed();
    }
  };

  if (loading) {
    return (
      <div className="simple-todos-container">
        <div className="loading-message">Cargando tus listas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="simple-todos-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="simple-todos-container">
      {/* Botón para crear nueva lista */}
      <div className="create-list-section">
        {!isCreatingList ? (
          <button 
            className="create-list-btn"
            onClick={() => setIsCreatingList(true)}
          >
            + Nueva Lista
          </button>
        ) : (
          <div className="new-list-form">
            <input
              type="text"
              placeholder="Título de la lista..."
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createList()}
              autoFocus
            />
            <button onClick={createList} className="confirm-btn">✓</button>
            <button 
              onClick={() => {
                setIsCreatingList(false);
                setNewListTitle('');
              }}
              className="cancel-btn"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Listas de tareas */}
      <div className="lists-grid">
        {lists.length === 0 ? (
          <div className="empty-state">
            <p>No hay listas todavía</p>
            <p className="hint">Crea tu primera lista o di "nueva lista [nombre]"</p>
          </div>
        ) : (
          lists.map(list => (
            <TodoList
              key={list.id}
              list={list}
              onAddItem={addItemToList}
              onToggleItem={toggleItem}
              onDeleteItem={deleteItem}
              onDeleteList={deleteList}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Componente para cada lista individual
function TodoList({ list, onAddItem, onToggleItem, onDeleteItem, onDeleteList }) {
  const [newItemText, setNewItemText] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);

  const handleAddItem = () => {
    if (newItemText.trim()) {
      onAddItem(list.id, newItemText);
      setNewItemText('');
      setIsAddingItem(false);
    }
  };

  const completedCount = list.items.filter(item => item.is_completed).length;
  const totalCount = list.items.length;

  return (
    <div className="todo-list-card">
      <div className="list-header">
        <h3>{list.title}</h3>
        <div className="list-actions">
          <span className="item-count">
            {completedCount}/{totalCount}
          </span>
          <button 
            className="delete-list-btn"
            onClick={() => onDeleteList(list.id)}
            title="Eliminar lista"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="list-items">
        {/* Items no completados */}
        {list.items.filter(item => !item.is_completed).map(item => (
          <div key={item.id} className="todo-item">
            <input
              type="checkbox"
              checked={item.is_completed}
              onChange={() => onToggleItem(list.id, item.id, item.is_completed)}
            />
            <span className="item-text">{item.content}</span>
            <button
              className="delete-item-btn"
              onClick={() => onDeleteItem(list.id, item.id)}
            >
              ×
            </button>
          </div>
        ))}

        {/* Items completados */}
        {list.items.filter(item => item.is_completed).length > 0 && (
          <div className="completed-section">
            <div className="completed-header">Completadas</div>
            {list.items.filter(item => item.is_completed).map(item => (
              <div key={item.id} className="todo-item completed">
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={() => onToggleItem(list.id, item.id, item.is_completed)}
                />
                <span className="item-text">{item.content}</span>
                <button
                  className="delete-item-btn"
                  onClick={() => onDeleteItem(list.id, item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agregar nuevo item */}
      <div className="add-item-section">
        {!isAddingItem ? (
          <button 
            className="add-item-btn"
            onClick={() => setIsAddingItem(true)}
          >
            + Agregar tarea
          </button>
        ) : (
          <div className="new-item-form">
            <input
              type="text"
              placeholder="Nueva tarea..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
              autoFocus
            />
            <button onClick={handleAddItem} className="confirm-btn">✓</button>
            <button 
              onClick={() => {
                setIsAddingItem(false);
                setNewItemText('');
              }}
              className="cancel-btn"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SimpleTodoLists;