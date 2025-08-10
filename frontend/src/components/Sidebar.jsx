import React, { useState, useEffect } from 'react';
import '../styles/Sidebar.css';

const Sidebar = ({ onModeChange, currentMode, messages }) => {
  const [modes, setModes] = useState([]);
  const [chats, setChats] = useState({});
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newMode, setNewMode] = useState({ name: '', prompt: '' });
  const [editingMode, setEditingMode] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(null);

  // Cargar modos del localStorage al iniciar
  useEffect(() => {
    const savedModes = localStorage.getItem('assistantModes');
    if (savedModes) {
      setModes(JSON.parse(savedModes));
    } else {
      // Modo por defecto
      const defaultMode = {
        id: 'default',
        name: 'General',
        prompt: 'Eres un asistente virtual útil y amigable.'
      };
      setModes([defaultMode]);
      localStorage.setItem('assistantModes', JSON.stringify([defaultMode]));
    }
  }, []);

  // Cargar chats del localStorage
  useEffect(() => {
    const savedChats = localStorage.getItem('assistantChats');
    if (savedChats) {
      setChats(JSON.parse(savedChats));
    }
  }, []);

  // Guardar chats cuando los mensajes cambien
  useEffect(() => {
    if (messages.length > 0 && currentMode) {
      const chatId = Date.now().toString();
      const chatTitle = messages[0]?.content?.substring(0, 30) + '...' || 'Chat nuevo';
      
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
          newChats[currentMode.id].unshift({
            id: chatId,
            title: chatTitle,
            timestamp: Date.now(),
            messages: messages
          });
        }
        
        localStorage.setItem('assistantChats', JSON.stringify(newChats));
        return newChats;
      });
    }
  }, [messages, currentMode]);

  const handleAddMode = () => {
    if (newMode.name && newMode.prompt) {
      const mode = {
        id: Date.now().toString(),
        name: newMode.name,
        prompt: newMode.prompt
      };
      const updatedModes = [...modes, mode];
      setModes(updatedModes);
      localStorage.setItem('assistantModes', JSON.stringify(updatedModes));
      setNewMode({ name: '', prompt: '' });
      setIsAddingMode(false);
    }
  };

  const handleEditMode = (mode) => {
    setEditingMode(mode);
    setNewMode({ name: mode.name, prompt: mode.prompt });
  };

  const handleUpdateMode = () => {
    if (editingMode && newMode.name && newMode.prompt) {
      const updatedModes = modes.map(m => 
        m.id === editingMode.id 
          ? { ...m, name: newMode.name, prompt: newMode.prompt }
          : m
      );
      setModes(updatedModes);
      localStorage.setItem('assistantModes', JSON.stringify(updatedModes));
      setEditingMode(null);
      setNewMode({ name: '', prompt: '' });
    }
  };

  const handleDeleteMode = (modeId) => {
    if (modes.length > 1) {
      const updatedModes = modes.filter(m => m.id !== modeId);
      setModes(updatedModes);
      localStorage.setItem('assistantModes', JSON.stringify(updatedModes));
      
      // Si el modo eliminado era el actual, cambiar al primero
      if (currentMode?.id === modeId) {
        onModeChange(updatedModes[0]);
      }
    }
  };

  const handleSelectMode = (mode) => {
    onModeChange(mode);
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    // Aquí podrías cargar los mensajes del chat seleccionado
    // Por ahora solo lo marcamos como seleccionado
  };

  const handleDeleteChat = (modeId, chatId) => {
    setChats(prevChats => {
      const newChats = { ...prevChats };
      if (newChats[modeId]) {
        newChats[modeId] = newChats[modeId].filter(chat => chat.id !== chatId);
      }
      localStorage.setItem('assistantChats', JSON.stringify(newChats));
      return newChats;
    });
    setChatMenuOpen(null);
  };

  const handleMoveChatToMode = (chatId, fromModeId, toModeId) => {
    setChats(prevChats => {
      const newChats = { ...prevChats };
      
      // Encontrar el chat
      const chat = newChats[fromModeId]?.find(c => c.id === chatId);
      if (!chat) return prevChats;
      
      // Remover del modo actual
      newChats[fromModeId] = newChats[fromModeId].filter(c => c.id !== chatId);
      
      // Agregar al nuevo modo
      if (!newChats[toModeId]) {
        newChats[toModeId] = [];
      }
      newChats[toModeId].unshift(chat);
      
      localStorage.setItem('assistantChats', JSON.stringify(newChats));
      return newChats;
    });
    setChatMenuOpen(null);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="section-header">
          <h3>MODOS</h3>
          <button 
            className="add-button"
            onClick={() => setIsAddingMode(true)}
            title="Agregar modo"
          >
            +
          </button>
        </div>
        
        <div className="modes-list">
          {modes.map(mode => (
            <div 
              key={mode.id} 
              className={`mode-item ${currentMode?.id === mode.id ? 'active' : ''}`}
            >
              <div 
                className="mode-info"
                onClick={() => handleSelectMode(mode)}
              >
                <span className="mode-name">{mode.name}</span>
              </div>
              <div className="mode-actions">
                <button 
                  className="edit-btn"
                  onClick={() => handleEditMode(mode)}
                  title="Editar"
                >
                  ✏️
                </button>
                {modes.length > 1 && (
                  <button 
                    className="delete-btn"
                    onClick={() => handleDeleteMode(mode.id)}
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

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
              placeholder="Prompt personalizado (ej: Eres un experto en programación...)"
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

      <div className="sidebar-section">
        <div className="section-header">
          <h3>CHATS {currentMode && `- ${currentMode.name}`}</h3>
        </div>
        
        <div className="chats-list">
          {currentMode && chats[currentMode.id]?.map(chat => (
            <div 
              key={chat.id}
              className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
            >
              <div 
                className="chat-info"
                onClick={() => handleSelectChat(chat)}
              >
                <span className="chat-title">{chat.title}</span>
                <span className="chat-date">
                  {new Date(chat.timestamp).toLocaleDateString()}
                </span>
              </div>
              <div className="chat-menu-container">
                <button 
                  className="menu-btn"
                  onClick={() => setChatMenuOpen(chatMenuOpen === chat.id ? null : chat.id)}
                  title="Opciones"
                >
                  ⋮
                </button>
                
                {chatMenuOpen === chat.id && (
                  <div className="chat-dropdown">
                    <button 
                      className="dropdown-item delete"
                      onClick={() => handleDeleteChat(currentMode.id, chat.id)}
                    >
                      🗑️ Eliminar
                    </button>
                    <div className="dropdown-divider"></div>
                    <div className="dropdown-label">Mover a:</div>
                    {modes.filter(m => m.id !== currentMode.id).map(mode => (
                      <button
                        key={mode.id}
                        className="dropdown-item"
                        onClick={() => handleMoveChatToMode(chat.id, currentMode.id, mode.id)}
                      >
                        → {mode.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {(!currentMode || !chats[currentMode?.id] || chats[currentMode.id].length === 0) && (
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