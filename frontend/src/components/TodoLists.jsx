import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './TodoLists.css';

function TodoLists({ voiceInput, onVoiceProcessed }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState(null);
  
  const inputRef = useRef(null);

  useEffect(() => {
    loadCategories();
    loadStats();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadLists(selectedCategory.id);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedList) {
      loadItems(selectedList.id);
    }
  }, [selectedList]);

  // Procesar entrada de voz
  useEffect(() => {
    if (voiceInput && voiceInput.trim()) {
      handleVoiceInput(voiceInput);
    }
  }, [voiceInput]);

  const loadCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/todos/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setCategories(response.data.categories);
        // Seleccionar la primera categoría por defecto
        if (response.data.categories.length > 0) {
          setSelectedCategory(response.data.categories[0]);
        }
      }
    } catch (error) {
      console.error('Error cargando categorías:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async (categoryId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/todos/lists?category_id=${categoryId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setLists(response.data.lists);
        // Seleccionar la primera lista si existe
        if (response.data.lists.length > 0 && !selectedList) {
          setSelectedList(response.data.lists[0]);
        }
      }
    } catch (error) {
      console.error('Error cargando listas:', error);
    }
  };

  const loadItems = async (listId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/todos/lists/${listId}/items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setItems(response.data.items);
      }
    } catch (error) {
      console.error('Error cargando items:', error);
    }
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/todos/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const handleVoiceInput = async (text) => {
    // Analizar el comando de voz
    const lowerText = text.toLowerCase();
    
    // Comandos para crear items
    if (lowerText.includes('agregar') || lowerText.includes('añadir') || lowerText.includes('crear')) {
      // Extraer el contenido después del comando
      const content = text.replace(/^(agregar|añadir|crear)\s+/i, '');
      if (content && selectedList) {
        await addItem(content, true);
        onVoiceProcessed && onVoiceProcessed();
      }
    }
    // Comandos para crear listas
    else if (lowerText.includes('nueva lista')) {
      const title = text.replace(/^nueva lista\s*/i, '');
      if (title && selectedCategory) {
        await createList(title);
        onVoiceProcessed && onVoiceProcessed();
      }
    }
    // Comandos para completar items
    else if (lowerText.includes('completar') || lowerText.includes('marcar')) {
      const itemText = text.replace(/^(completar|marcar)\s+/i, '');
      const item = items.find(i => i.content.toLowerCase().includes(itemText.toLowerCase()));
      if (item) {
        await toggleItem(item.id, item.is_completed);
        onVoiceProcessed && onVoiceProcessed();
      }
    }
    // Si no es un comando, agregar como item
    else if (selectedList) {
      await addItem(text, true);
      onVoiceProcessed && onVoiceProcessed();
    }
  };

  const addItem = async (content, byVoice = false) => {
    if (!content.trim() || !selectedList) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/todos/lists/${selectedList.id}/items`,
        { 
          content: content.trim(),
          created_by_voice: byVoice
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setItems([...items, response.data.item]);
        setNewItemText('');
        loadStats(); // Actualizar estadísticas
      }
    } catch (error) {
      console.error('Error agregando item:', error);
    }
  };

  const toggleItem = async (itemId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(
        `/api/todos/items/${itemId}/toggle`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setItems(items.map(item => 
          item.id === itemId 
            ? { ...item, is_completed: response.data.is_completed, completed_at: response.data.completed_at }
            : item
        ));
        loadStats(); // Actualizar estadísticas
      }
    } catch (error) {
      console.error('Error actualizando item:', error);
    }
  };

  const deleteItem = async (itemId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `/api/todos/items/${itemId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      setItems(items.filter(item => item.id !== itemId));
      loadStats(); // Actualizar estadísticas
    } catch (error) {
      console.error('Error eliminando item:', error);
    }
  };

  const createList = async (title) => {
    if (!title.trim() || !selectedCategory) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/todos/lists',
        { 
          title: title.trim(),
          category_id: selectedCategory.id
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        const newList = response.data.list;
        setLists([...lists, newList]);
        setSelectedList(newList);
        setNewListTitle('');
        setIsAddingList(false);
        loadStats(); // Actualizar estadísticas
      }
    } catch (error) {
      console.error('Error creando lista:', error);
    }
  };

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetItem) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) return;

    const draggedIndex = items.findIndex(i => i.id === draggedItem.id);
    const targetIndex = items.findIndex(i => i.id === targetItem.id);

    const newItems = [...items];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setItems(newItems);
    setDraggedItem(null);

    // Actualizar posición en el backend
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/todos/items/${draggedItem.id}/reorder`,
        { newPosition: targetIndex },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error reordenando item:', error);
      loadItems(selectedList.id); // Recargar items si falla
    }
  };

  if (loading) {
    return <div className="todo-lists-loading">Cargando...</div>;
  }

  return (
    <div className="todo-lists-container">
      {/* Header con estadísticas */}
      <div className="todo-header">
        <div className="todo-stats">
          {stats && (
            <>
              <div className="stat-item">
                <span className="stat-value">{stats.total_items}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-value completed">{stats.completed_items}</span>
                <span className="stat-label">Completados</span>
              </div>
              <div className="stat-item">
                <span className="stat-value pending">{stats.pending_items}</span>
                <span className="stat-label">Pendientes</span>
              </div>
              {stats.overdue_items > 0 && (
                <div className="stat-item">
                  <span className="stat-value overdue">{stats.overdue_items}</span>
                  <span className="stat-label">Vencidos</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Categorías */}
      <div className="todo-categories">
        {categories.map(category => (
          <button
            key={category.id}
            className={`category-tab ${selectedCategory?.id === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category)}
            style={{ borderColor: category.color }}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
          </button>
        ))}
      </div>

      {/* Contenido principal */}
      <div className="todo-main">
        {/* Panel de listas */}
        <div className="todo-lists-panel">
          <div className="lists-header">
            <h3>Listas</h3>
            <button 
              className="add-list-btn"
              onClick={() => setIsAddingList(true)}
              title="Nueva lista"
            >
              +
            </button>
          </div>
          
          {isAddingList && (
            <div className="new-list-form">
              <input
                type="text"
                placeholder="Nombre de la lista..."
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createList(newListTitle)}
                autoFocus
              />
              <button onClick={() => createList(newListTitle)}>✓</button>
              <button onClick={() => {
                setIsAddingList(false);
                setNewListTitle('');
              }}>✕</button>
            </div>
          )}
          
          <div className="lists-container">
            {lists.map(list => (
              <div
                key={list.id}
                className={`list-card ${selectedList?.id === list.id ? 'active' : ''}`}
                onClick={() => setSelectedList(list)}
              >
                <div className="list-title">{list.title}</div>
                <div className="list-meta">
                  <span className="list-count">
                    {list.completed_items}/{list.total_items}
                  </span>
                  {list.total_items > 0 && (
                    <div className="list-progress">
                      <div 
                        className="progress-bar"
                        style={{ 
                          width: `${(list.completed_items / list.total_items) * 100}%`,
                          backgroundColor: selectedCategory?.color
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de items */}
        <div className="todo-items-panel">
          {selectedList ? (
            <>
              <div className="items-header">
                <h2>{selectedList.title}</h2>
                <div className="new-item-form">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Agregar tarea... (Enter para guardar)"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addItem(newItemText);
                      }
                    }}
                  />
                  <button 
                    className="add-item-btn"
                    onClick={() => addItem(newItemText)}
                  >
                    Agregar
                  </button>
                </div>
              </div>

              <div className="items-container">
                {items.filter(item => !item.is_completed).map(item => (
                  <div
                    key={item.id}
                    className="todo-item"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, item)}
                  >
                    <input
                      type="checkbox"
                      checked={item.is_completed}
                      onChange={() => toggleItem(item.id, item.is_completed)}
                    />
                    <span className="item-content">
                      {item.content}
                      {item.created_by_voice && <span className="voice-badge">🎤</span>}
                    </span>
                    <button
                      className="item-delete"
                      onClick={() => deleteItem(item.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                
                {items.filter(item => item.is_completed).length > 0 && (
                  <>
                    <div className="completed-separator">
                      <span>Completadas ({items.filter(item => item.is_completed).length})</span>
                    </div>
                    {items.filter(item => item.is_completed).map(item => (
                      <div
                        key={item.id}
                        className="todo-item completed"
                      >
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          onChange={() => toggleItem(item.id, item.is_completed)}
                        />
                        <span className="item-content">
                          {item.content}
                          {item.created_by_voice && <span className="voice-badge">🎤</span>}
                        </span>
                        <button
                          className="item-delete"
                          onClick={() => deleteItem(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="no-list-selected">
              <p>Selecciona o crea una lista para comenzar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TodoLists;