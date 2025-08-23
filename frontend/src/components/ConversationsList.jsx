import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ConversationsList.css';

function ConversationsList({ currentSessionId, onSelectConversation, onNewConversation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('No autenticado');
        setLoading(false);
        return;
      }

      const response = await axios.get('/api/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setConversations(response.data.conversations);
      }
    } catch (err) {
      console.error('Error cargando conversaciones:', err);
      setError('Error al cargar conversaciones');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora mismo';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const handleNewConversation = () => {
    const newSessionId = crypto.randomUUID();
    localStorage.setItem('sessionId', newSessionId);
    onNewConversation(newSessionId);
  };

  const handleDeleteConversation = async (sessionId, e) => {
    e.stopPropagation();
    
    if (!confirm('¿Eliminar esta conversación?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/conversations/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Recargar lista
      loadConversations();
      
      // Si es la conversación actual, crear una nueva
      if (sessionId === currentSessionId) {
        handleNewConversation();
      }
    } catch (err) {
      console.error('Error eliminando conversación:', err);
    }
  };

  if (loading) {
    return (
      <div className="conversations-list">
        <div className="conversations-header">
          <h3>Mis Conversaciones</h3>
          <button className="new-chat-btn" onClick={handleNewConversation}>
            + Nueva
          </button>
        </div>
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="conversations-list">
        <div className="conversations-header">
          <h3>Mis Conversaciones</h3>
          <button className="new-chat-btn" onClick={handleNewConversation}>
            + Nueva
          </button>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="conversations-list">
      <div className="conversations-header">
        <h3>Mis Conversaciones</h3>
        <button className="new-chat-btn" onClick={handleNewConversation}>
          + Nueva
        </button>
      </div>
      
      {conversations.length === 0 ? (
        <div className="no-conversations">
          <p>No hay conversaciones</p>
          <button onClick={handleNewConversation}>
            Iniciar primera conversación
          </button>
        </div>
      ) : (
        <div className="conversations-items">
          {conversations.map((conv) => (
            <div
              key={conv.session_id}
              className={`conversation-item ${conv.session_id === currentSessionId ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv.session_id)}
            >
              <div className="conversation-info">
                <div className="conversation-title">
                  Chat {conv.message_count || 0} mensajes
                </div>
                <div className="conversation-time">
                  {formatDate(conv.last_message_at || conv.updated_at)}
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDeleteConversation(conv.session_id, e)}
                title="Eliminar conversación"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConversationsList;