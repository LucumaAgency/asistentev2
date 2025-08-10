import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Sidebar.css';

const Sidebar = ({ onModeChange, currentMode, messages, isOpen, onClose }) => {
  const [modes, setModes] = useState([]);
  const [chats, setChats] = useState({});
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newMode, setNewMode] = useState({ name: '', prompt: '' });
  const [editingMode, setEditingMode] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar modos desde la API al iniciar
  useEffect(() => {
    loadModes();
    loadChatSessions();
  }, []);

  const loadModes = async () => {
    try {
      const response = await axios.get('/api/modes');
      if (response.data && response.data.length > 0) {
        const formattedModes = response.data.map(m => ({
          id: m.mode_id,
          name: m.name,
          prompt: m.prompt
        }));
        setModes(formattedModes);
      } else {
        // Si no hay modos en la BD, crear el modo por defecto
        const defaultMode = {
          id: 'default',
          name: 'General',
          prompt: 'Eres un asistente virtual útil y amigable.'
        };
        await createModeInDB(defaultMode);
        setModes([defaultMode]);
      }
    } catch (error) {
      console.error('Error cargando modos:', error);
      // Fallback a localStorage si falla la API
      const savedModes = localStorage.getItem('assistantModes');
      if (savedModes) {
        const localModes = JSON.parse(savedModes);
        setModes(localModes);
        // Intentar migrar a BD
        migrateModesToDB(localModes);
      } else {
        const defaultMode = {
          id: 'default',
          name: 'General',
          prompt: 'Eres un asistente virtual útil y amigable.'
        };
        setModes([defaultMode]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadChatSessions = async () => {
    try {
      const response = await axios.get('/api/chat-sessions');
      if (response.data && response.data.length > 0) {
        // Organizar chats por modo
        const chatsByMode = {};
        response.data.forEach(session => {
          if (!chatsByMode[session.mode_id]) {
            chatsByMode[session.mode_id] = [];
          }
          chatsByMode[session.mode_id].push({
            id: session.chat_id,
            title: session.title,
            timestamp: new Date(session.created_at).getTime(),
            messages: [] // Los mensajes se cargarán cuando se seleccione el chat
          });
        });
        setChats(chatsByMode);
      } else {
        // Intentar cargar desde localStorage y migrar
        const savedChats = localStorage.getItem('assistantChats');
        if (savedChats) {
          const localChats = JSON.parse(savedChats);
          setChats(localChats);
          migrateChatsToDB(localChats);
        }
      }
    } catch (error) {
      console.error('Error cargando sesiones de chat:', error);
      // Fallback a localStorage
      const savedChats = localStorage.getItem('assistantChats');
      if (savedChats) {
        setChats(JSON.parse(savedChats));
      }
    }
  };

  const createModeInDB = async (mode) => {
    try {
      await axios.post('/api/modes', {
        mode_id: mode.id,
        name: mode.name,
        prompt: mode.prompt
      });
    } catch (error) {
      console.error('Error creando modo en BD:', error);
    }
  };

  const migrateModesToDB = async (localModes) => {
    for (const mode of localModes) {
      await createModeInDB(mode);
    }
    console.log('Modos migrados a la BD');
  };

  const migrateChatsToDB = async (localChats) => {
    for (const [modeId, chatsInMode] of Object.entries(localChats)) {
      for (const chat of chatsInMode) {
        try {
          await axios.post('/api/chat-sessions', {
            chat_id: chat.id,
            mode_id: modeId,
            title: chat.title
          });
        } catch (error) {
          console.error('Error migrando chat a BD:', error);
        }
      }
    }
    console.log('Chats migrados a la BD');
  };

  // Guardar chats cuando los mensajes cambien
  useEffect(() => {
    if (messages.length > 0 && currentMode) {
      const chatId = Date.now().toString();
      const chatTitle = messages[0]?.content?.substring(0, 30) + '...' || 'Chat nuevo';
      
      // Guardar en la BD
      const saveChat = async () => {
        try {
          await axios.post('/api/chat-sessions', {
            chat_id: chatId,
            mode_id: currentMode.id,
            title: chatTitle
          });
        } catch (error) {
          console.error('Error guardando chat en BD:', error);
        }
      };

      setChats(prevChats => {
        const newChats = { ...prevChats };
        if (!newChats[currentMode.id]) {
          newChats[currentMode.id] = [];
        }
        
        // Verificar si ya existe un chat con estos mensajes
        const existingChat = newChats[currentMode.id].find(
          chat => chat.messages.length === messages.length && 
                  chat.messages[0]?.content === messages[0]?.content
        );
        
        if (!existingChat) {
          const newChat = {
            id: chatId,
            title: chatTitle,
            timestamp: Date.now(),
            messages: messages
          };
          newChats[currentMode.id].unshift(newChat);
          saveChat(); // Guardar en BD
        }
        
        return newChats;
      });
    }
  }, [messages, currentMode]);

  const handleAddMode = async () => {
    if (newMode.name && newMode.prompt) {
      const mode = {
        id: Date.now().toString(),
        name: newMode.name,
        prompt: newMode.prompt
      };
      
      try {
        await axios.post('/api/modes', {
          mode_id: mode.id,
          name: mode.name,
          prompt: mode.prompt
        });
        
        const updatedModes = [...modes, mode];
        setModes(updatedModes);
        setNewMode({ name: '', prompt: '' });
        setIsAddingMode(false);
      } catch (error) {
        console.error('Error añadiendo modo:', error);
        alert('Error al guardar el modo');
      }
    }
  };

  const handleEditMode = (mode) => {
    setEditingMode(mode);
    setNewMode({ name: mode.name, prompt: mode.prompt });
  };

  const handleUpdateMode = async () => {
    if (editingMode && newMode.name && newMode.prompt) {
      try {
        await axios.put(`/api/modes/${editingMode.id}`, {
          name: newMode.name,
          prompt: newMode.prompt
        });
        
        const updatedModes = modes.map(m => 
          m.id === editingMode.id 
            ? { ...m, name: newMode.name, prompt: newMode.prompt }
            : m
        );
        setModes(updatedModes);
        setEditingMode(null);
        setNewMode({ name: '', prompt: '' });
      } catch (error) {
        console.error('Error actualizando modo:', error);
        alert('Error al actualizar el modo');
      }
    }
  };

  const handleDeleteMode = async (modeId) => {
    if (modes.length > 1) {
      try {
        await axios.delete(`/api/modes/${modeId}`);
        
        const updatedModes = modes.filter(m => m.id !== modeId);
        setModes(updatedModes);
        
        // Si el modo eliminado era el actual, cambiar al primero
        if (currentMode?.id === modeId) {
          onModeChange(updatedModes[0]);
        }
        
        // Eliminar chats asociados
        const newChats = { ...chats };
        delete newChats[modeId];
        setChats(newChats);
      } catch (error) {
        console.error('Error eliminando modo:', error);
        alert('Error al eliminar el modo');
      }
    }
  };

  const handleDeleteChat = async (chatId, modeId) => {
    try {
      await axios.delete(`/api/chat-sessions/${chatId}`);
      
      setChats(prevChats => {
        const newChats = { ...prevChats };
        if (newChats[modeId]) {
          newChats[modeId] = newChats[modeId].filter(chat => chat.id !== chatId);
        }
        return newChats;
      });
      setChatMenuOpen(null);
    } catch (error) {
      console.error('Error eliminando chat:', error);
      alert('Error al eliminar el chat');
    }
  };

  const handleMoveChatToMode = async (chatId, fromModeId, toModeId) => {
    const chat = chats[fromModeId]?.find(c => c.id === chatId);
    if (!chat) return;

    try {
      await axios.put(`/api/chat-sessions/${chatId}`, {
        mode_id: toModeId
      });
      
      setChats(prevChats => {
        const newChats = { ...prevChats };
        
        // Eliminar del modo anterior
        newChats[fromModeId] = newChats[fromModeId].filter(c => c.id !== chatId);
        
        // Añadir al nuevo modo
        if (!newChats[toModeId]) {
          newChats[toModeId] = [];
        }
        newChats[toModeId].unshift(chat);
        
        return newChats;
      });
      setChatMenuOpen(null);
    } catch (error) {
      console.error('Error moviendo chat:', error);
      alert('Error al mover el chat');
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-section">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Botón de cierre para móviles */}
      <button 
        className="sidebar-close"
        onClick={onClose}
        aria-label="Cerrar menú"
      >
        ×
      </button>
      
      {/* Sección de Modos */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>MODOS</h3>
          <button 
            className="add-button"
            onClick={() => setIsAddingMode(true)}
            title="Añadir nuevo modo"
          >
            +
          </button>
        </div>

        <div className="modes-list">
          {modes.map(mode => (
            <div 
              key={mode.id} 
              className={`mode-item ${currentMode?.id === mode.id ? 'active' : ''}`}
              onClick={() => {
                onModeChange(mode);
                // Cerrar sidebar en móviles
                if (window.innerWidth <= 768 && onClose) {
                  onClose();
                }
              }}
            >
              <div className="mode-info">
                <span className="mode-name">{mode.name}</span>
              </div>
              {mode.id !== 'default' && (
                <div className="mode-actions">
                  <button 
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditMode(mode);
                    }}
                  >
                    ✏️
                  </button>
                  <button 
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMode(mode.id);
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Formulario para añadir/editar modo */}
        {(isAddingMode || editingMode) && (
          <div className="mode-form">
            <input
              type="text"
              placeholder="Nombre del modo"
              value={newMode.name}
              onChange={(e) => setNewMode({ ...newMode, name: e.target.value })}
              className="mode-input"
            />
            <textarea
              placeholder="Prompt del sistema"
              value={newMode.prompt}
              onChange={(e) => setNewMode({ ...newMode, prompt: e.target.value })}
              className="mode-textarea"
              rows="3"
            />
            <div className="form-buttons">
              <button 
                className="save-btn"
                onClick={editingMode ? handleUpdateMode : handleAddMode}
              >
                {editingMode ? 'Actualizar' : 'Guardar'}
              </button>
              <button 
                className="cancel-btn"
                onClick={() => {
                  setIsAddingMode(false);
                  setEditingMode(null);
                  setNewMode({ name: '', prompt: '' });
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sección de Chats */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>CHATS - {currentMode?.name || 'General'}</h3>
        </div>

        <div className="chats-list">
          {chats[currentMode?.id]?.length > 0 ? (
            chats[currentMode.id].map(chat => (
              <div 
                key={chat.id} 
                className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => setSelectedChat(chat)}
              >
                <div className="chat-info">
                  <span className="chat-title">{chat.title}</span>
                  <span className="chat-date">{formatDate(chat.timestamp)}</span>
                </div>
                <div className="chat-menu-container">
                  <button 
                    className="menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatMenuOpen(chatMenuOpen === chat.id ? null : chat.id);
                    }}
                  >
                    ⋮
                  </button>
                  {chatMenuOpen === chat.id && (
                    <div className="chat-dropdown">
                      <button 
                        className="dropdown-item delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(chat.id, currentMode.id);
                        }}
                      >
                        Eliminar
                      </button>
                      <div className="dropdown-divider"></div>
                      <div className="dropdown-label">Mover a:</div>
                      {modes.filter(m => m.id !== currentMode.id).map(mode => (
                        <button
                          key={mode.id}
                          className="dropdown-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveChatToMode(chat.id, currentMode.id, mode.id);
                          }}
                        >
                          {mode.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-chats">
              No hay chats en este modo
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;