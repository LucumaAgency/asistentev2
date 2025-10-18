import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Sidebar.css';
import { PlusIcon, MessageCircleIcon, MoreVerticalIcon, EditIcon, TrashIcon } from './Icons';
import { createLogger } from '../utils/logger';

const logger = createLogger('Sidebar');

const Sidebar = ({ onModeChange, currentMode, messages, isOpen, onClose, onChatSelect, onNewChat, onShowConversations }) => {
  const [modes, setModes] = useState([]);
  const [chats, setChats] = useState({});
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newMode, setNewMode] = useState({ name: '', prompt: '' });
  const [editingMode, setEditingMode] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  
  // Mínima distancia de swipe requerida (en px)
  const minSwipeDistance = 50;

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
        
        // Si es la primera carga y hay modo calendario, seleccionarlo
        if (!currentMode && formattedModes.find(m => m.id === 'calendar')) {
          const calendarMode = formattedModes.find(m => m.id === 'calendar');
          onModeChange(calendarMode);
        }
      } else {
        // Si no hay modos en la BD, usar los por defecto
        const defaultModes = [
          {
            id: 'default',
            name: 'General',
            prompt: 'Eres un asistente virtual útil y amigable.'
          },
          {
            id: 'calendar',
            name: '📅 Calendario',
            prompt: 'Eres un asistente especializado en gestión de calendario y reuniones.'
          }
        ];
        setModes(defaultModes);
        
        // Intentar crear en BD
        for (const mode of defaultModes) {
          await createModeInDB(mode);
        }
      }
    } catch (error) {
      logger.error('Error cargando modos:', error);
      // Fallback con modos por defecto
      const defaultModes = [
        {
          id: 'default',
          name: 'General',
          prompt: 'Eres un asistente virtual útil y amigable.'
        },
        {
          id: 'calendar',
          name: '📅 Calendario',
          prompt: 'Eres un asistente especializado en gestión de calendario y reuniones.'
        }
      ];
      setModes(defaultModes);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChatSessions = async () => {
    try {
      // SIEMPRE cargar desde localStorage primero (fuente de verdad)
      const savedChats = localStorage.getItem('assistantChats');
      if (savedChats) {
        const localChats = JSON.parse(savedChats);
        logger.debug('Chats cargados desde localStorage:', Object.keys(localChats).length, 'categorías');
        setChats(localChats);
        
        // Intentar sincronizar con BD en segundo plano (sin afectar la UI)
        try {
          const response = await axios.get('/api/chat-sessions');
          if (response.data && response.data.length > 0) {
            logger.log('Sincronizando con BD:', response.data.length, 'sesiones encontradas');
            // Solo usar para sincronización, no para cargar datos
          }
        } catch (dbError) {
          logger.log('BD no disponible, usando solo localStorage');
        }
      } else {
        // Si no hay nada en localStorage, intentar cargar de BD
        logger.log('No hay chats en localStorage, intentando cargar de BD...');
        const response = await axios.get('/api/chat-sessions');
        if (response.data && response.data.length > 0) {
          // Crear estructura básica sin mensajes (se cargarán después)
          const chatsByMode = {};
          response.data.forEach(session => {
            if (!chatsByMode[session.mode_id]) {
              chatsByMode[session.mode_id] = [];
            }
            chatsByMode[session.mode_id].push({
              id: session.chat_id,
              title: session.title,
              timestamp: new Date(session.created_at).getTime(),
              messages: [], // Los mensajes se cargarán cuando se seleccione
              sessionId: session.chat_id
            });
          });
          setChats(chatsByMode);
        } else {
          logger.log('No hay chats en ninguna fuente');
          setChats({});
        }
      }
    } catch (error) {
      logger.error('Error cargando sesiones de chat:', error);
      setChats({});
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
      logger.error('Error creando modo en BD:', error);
    }
  };

  const migrateModesToDB = async (localModes) => {
    for (const mode of localModes) {
      await createModeInDB(mode);
    }
    logger.log('Modos migrados a la BD');
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
          logger.error('Error migrando chat a BD:', error);
        }
      }
    }
    logger.log('Chats migrados a la BD');
  };

  // Guardar chats cuando los mensajes cambien
  useEffect(() => {
    const sessionId = localStorage.getItem('sessionId');
    setCurrentSessionId(sessionId);
    
    logger.log('useEffect triggered - Messages:', messages.length, 'Mode:', currentMode?.name, 'SessionId:', sessionId);
    
    if (messages.length > 0 && currentMode && sessionId) {
      const chatTitle = messages[0]?.content?.substring(0, 30) + '...' || 'Chat nuevo';
      logger.log('Guardando chat:', { sessionId, title: chatTitle, messages: messages.length });
      
      // Crear objeto del chat con todos los mensajes
      const chatToSave = {
        id: sessionId,
        title: chatTitle,
        timestamp: Date.now(),
        messages: messages.map(m => ({ // Asegurar que cada mensaje se guarde correctamente
          role: m.role,
          content: m.content
        })),
        sessionId: sessionId,
        modeId: currentMode.id
      };
      
      setChats(prevChats => {
        const newChats = { ...prevChats };
        if (!newChats[currentMode.id]) {
          newChats[currentMode.id] = [];
        }
        
        // Buscar si ya existe un chat con este sessionId
        const existingChatIndex = newChats[currentMode.id].findIndex(
          chat => chat.sessionId === sessionId || chat.id === sessionId
        );
        
        if (existingChatIndex >= 0) {
          // Actualizar chat existente
          logger.log('Actualizando chat existente en índice:', existingChatIndex);
          newChats[currentMode.id][existingChatIndex] = chatToSave;
        } else {
          // Agregar nuevo chat
          logger.log('Agregando nuevo chat');
          newChats[currentMode.id].unshift(chatToSave);
        }
        
        // IMPORTANTE: Guardar inmediatamente en localStorage
        try {
          const chatsToSave = JSON.stringify(newChats);
          localStorage.setItem('assistantChats', chatsToSave);
          logger.log('✅ Chats guardados en localStorage. Total:', Object.keys(newChats).reduce((acc, k) => acc + newChats[k].length, 0));
          
          // Verificar que se guardó correctamente
          const verification = localStorage.getItem('assistantChats');
          if (verification) {
            const parsed = JSON.parse(verification);
            const savedChat = parsed[currentMode.id]?.find(c => c.sessionId === sessionId);
            logger.log('✅ Verificación: Chat guardado con', savedChat?.messages?.length, 'mensajes');
          }
        } catch (saveError) {
          logger.error('❌ Error guardando en localStorage:', saveError);
        }
        
        // Guardar en BD de forma asíncrona (no crítico)
        axios.post('/api/chat-sessions', {
          chat_id: sessionId,
          mode_id: currentMode.id,
          title: chatTitle,
          session_id: sessionId,
          messages: messages
        }).catch(error => {
          logger.log('BD no disponible, usando solo localStorage');
        });
        
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
        logger.error('Error añadiendo modo:', error);
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
        logger.error('Error actualizando modo:', error);
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
        
        // Eliminar chats asociados y guardar en localStorage
        const newChats = { ...chats };
        delete newChats[modeId];
        setChats(newChats);
        
        // Guardar en localStorage
        localStorage.setItem('assistantChats', JSON.stringify(newChats));
        logger.log('✅ Modo y sus chats eliminados de localStorage');
      } catch (error) {
        logger.error('Error eliminando modo:', error);
        alert('Error al eliminar el modo');
      }
    }
  };

  const handleDeleteChat = async (chatId, modeId) => {
    logger.log(`Eliminando chat ${chatId} del modo ${modeId}`);
    
    try {
      // Primero actualizar el estado y localStorage
      setChats(prevChats => {
        const newChats = { ...prevChats };
        if (newChats[modeId]) {
          // Filtrar el chat eliminado
          newChats[modeId] = newChats[modeId].filter(chat => 
            chat.id !== chatId && chat.sessionId !== chatId
          );
          
          // IMPORTANTE: Guardar inmediatamente en localStorage
          try {
            localStorage.setItem('assistantChats', JSON.stringify(newChats));
            logger.log('✅ Chat eliminado de localStorage');
            
            // Verificar que se eliminó correctamente
            const verification = localStorage.getItem('assistantChats');
            if (verification) {
              const parsed = JSON.parse(verification);
              const stillExists = parsed[modeId]?.find(c => c.id === chatId || c.sessionId === chatId);
              if (!stillExists) {
                logger.log('✅ Verificado: Chat eliminado correctamente');
              } else {
                logger.error('❌ Error: El chat aún existe después de eliminar');
              }
            }
          } catch (saveError) {
            logger.error('❌ Error guardando en localStorage:', saveError);
          }
        }
        return newChats;
      });
      
      setChatMenuOpen(null);
      
      // Intentar eliminar de la BD (no crítico)
      axios.delete(`/api/chat-sessions/${chatId}`).catch(error => {
        logger.log('BD no disponible para eliminar, solo eliminado de localStorage');
      });
    } catch (error) {
      logger.error('Error eliminando chat:', error);
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
        
        // Guardar en localStorage
        localStorage.setItem('assistantChats', JSON.stringify(newChats));
        logger.log('✅ Chat movido y guardado en localStorage');
        
        return newChats;
      });
      setChatMenuOpen(null);
    } catch (error) {
      logger.error('Error moviendo chat:', error);
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

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    
    if (isLeftSwipe && isOpen && onClose) {
      onClose();
    }
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
    <div 
      className={`sidebar ${isOpen ? 'open' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      
      {/* Botón de Mis Conversaciones */}
      {onShowConversations && (
        <div className="sidebar-section">
          <button
            className="conversations-button"
            onClick={() => {
              onShowConversations();
              if (window.innerWidth <= 768 && onClose) {
                onClose();
              }
            }}
          >
            <MessageCircleIcon className="icon icon-sm" />
            Mis Conversaciones
          </button>
        </div>
      )}
      
      {/* Sección de Modos */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>MODOS</h3>
          <button
            className="add-button"
            onClick={() => setIsAddingMode(true)}
            title="Añadir nuevo modo"
          >
            <PlusIcon className="icon icon-sm" />
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
                <div className="mode-menu-container">
                  <button
                    className="menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModeMenuOpen(modeMenuOpen === mode.id ? null : mode.id);
                    }}
                  >
                    <MoreVerticalIcon className="icon icon-sm" />
                  </button>
                  {modeMenuOpen === mode.id && (
                    <div className="mode-dropdown">
                      <button
                        className="dropdown-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditMode(mode);
                          setModeMenuOpen(null);
                        }}
                      >
                        <EditIcon className="icon icon-sm" />
                        Editar
                      </button>
                      <button
                        className="dropdown-item delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMode(mode.id);
                          setModeMenuOpen(null);
                        }}
                      >
                        <TrashIcon className="icon icon-sm" />
                        Eliminar
                      </button>
                    </div>
                  )}
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
          <button
            className="add-button"
            onClick={() => {
              if (onNewChat) {
                onNewChat();
                // Cerrar sidebar en móviles
                if (window.innerWidth <= 768 && onClose) {
                  onClose();
                }
              }
            }}
            title="Nuevo chat"
          >
            <PlusIcon className="icon icon-sm" />
          </button>
        </div>

        <div className="chats-list">
          {chats[currentMode?.id]?.length > 0 ? (
            chats[currentMode.id].map(chat => (
              <div 
                key={chat.id} 
                className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedChat(chat);
                  logger.log('\n=== CHAT SELECCIONADO ===');
                  logger.log('Chat:', chat);
                  logger.log('Tiene mensajes?', chat.messages?.length > 0);
                  logger.log('SessionId:', chat.sessionId);
                  
                  // Cargar los mensajes del chat seleccionado
                  if (onChatSelect && chat.messages && chat.messages.length > 0) {
                    logger.log(`Cargando ${chat.messages.length} mensajes para el chat`);
                    onChatSelect(chat.id, chat.messages, chat.sessionId || chat.id);
                  } else {
                    logger.log('No hay mensajes para cargar o no hay callback onChatSelect');
                  }
                  
                  // Cerrar sidebar en móviles
                  if (window.innerWidth <= 768 && onClose) {
                    onClose();
                  }
                }}
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
                    <MoreVerticalIcon className="icon icon-sm" />
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
                        <TrashIcon className="icon icon-sm" />
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