import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/CalendarEvents.css';

const CalendarEvents = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('today');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    duration: 30,
    attendees: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, activeTab]);

  const loadEvents = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const endpoint = activeTab === 'today' 
        ? '/api/calendar/events/today'
        : '/api/calendar/events';
      
      const response = await axios.get(endpoint);
      
      if (response.data.success) {
        setEvents(response.data.events || []);
      } else {
        setError('No se pudieron cargar los eventos');
      }
    } catch (err) {
      console.error('Error cargando eventos:', err);
      if (err.response?.status === 403) {
        setError('Necesitas autorizar el acceso a Google Calendar primero');
      } else {
        setError('Error al cargar eventos');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const eventData = {
        ...newEvent,
        attendees: newEvent.attendees ? newEvent.attendees.split(',').map(email => email.trim()) : []
      };
      
      const response = await axios.post('/api/calendar/events', eventData);
      
      if (response.data.success) {
        // Recargar eventos
        await loadEvents();
        // Limpiar formulario
        setNewEvent({
          title: '',
          description: '',
          date: new Date().toISOString().split('T')[0],
          time: '09:00',
          duration: 30,
          attendees: ''
        });
        setShowCreateForm(false);
        
        // Mostrar link de Meet si existe
        if (response.data.meetLink) {
          alert(`Evento creado! Link de Meet: ${response.data.meetLink}`);
        }
      }
    } catch (err) {
      console.error('Error creando evento:', err);
      setError(err.response?.data?.error || 'Error al crear evento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('¿Estás seguro de eliminar este evento?')) return;
    
    try {
      await axios.delete(`/api/calendar/events/${eventId}`);
      await loadEvents();
    } catch (err) {
      console.error('Error eliminando evento:', err);
      setError('Error al eliminar evento');
    }
  };

  const checkAvailability = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('/api/calendar/check-availability', {
        date: newEvent.date,
        time: newEvent.time,
        duration: newEvent.duration
      });
      
      if (response.data.available) {
        alert('✅ El horario está disponible');
      } else {
        alert(`❌ Hay conflictos en ese horario:\n${response.data.conflicts?.map(c => `${c.start} - ${c.end}`).join('\n')}`);
      }
    } catch (err) {
      console.error('Error verificando disponibilidad:', err);
      setError('Error al verificar disponibilidad');
    } finally {
      setIsLoading(false);
    }
  };

  const findNextAvailable = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/calendar/next-available?duration=${newEvent.duration}`);
      
      if (response.data.available) {
        const suggestedTime = new Date(response.data.suggestedTime);
        setNewEvent(prev => ({
          ...prev,
          date: suggestedTime.toISOString().split('T')[0],
          time: suggestedTime.toTimeString().substring(0, 5)
        }));
        alert(`Próximo horario disponible: ${response.data.suggestedTimeFormatted}`);
      } else {
        alert('No hay horarios disponibles en los próximos 7 días');
      }
    } catch (err) {
      console.error('Error buscando horario:', err);
      setError('Error al buscar horario disponible');
    } finally {
      setIsLoading(false);
    }
  };

  const formatEventTime = (start, end) => {
    if (!start) return 'Sin hora';
    
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;
    
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    const startTime = startDate.toLocaleTimeString('es-ES', timeOptions);
    const endTime = endDate ? endDate.toLocaleTimeString('es-ES', timeOptions) : '';
    
    const dateStr = startDate.toLocaleDateString('es-ES', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
    
    return `${dateStr} ${startTime}${endTime ? ' - ' + endTime : ''}`;
  };

  if (!isOpen) return null;

  return (
    <div className="calendar-modal-overlay">
      <div className="calendar-modal">
        <div className="calendar-modal-header">
          <h2>📅 Google Calendar</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>
        
        <div className="calendar-tabs">
          <button 
            className={`tab ${activeTab === 'today' ? 'active' : ''}`}
            onClick={() => setActiveTab('today')}
          >
            Eventos de Hoy
          </button>
          <button 
            className={`tab ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            Próximos Eventos
          </button>
          <button 
            className={`tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('create');
              setShowCreateForm(true);
            }}
          >
            Crear Evento
          </button>
        </div>
        
        <div className="calendar-modal-content">
          {error && (
            <div className="error-banner">{error}</div>
          )}
          
          {isLoading ? (
            <div className="loading">Cargando...</div>
          ) : showCreateForm ? (
            <form className="create-event-form" onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Título *</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                  required
                  placeholder="Reunión de equipo"
                />
              </div>
              
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                  placeholder="Descripción del evento..."
                  rows="3"
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Hora *</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({...newEvent, time: e.target.value})}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Duración (min)</label>
                  <select
                    value={newEvent.duration}
                    onChange={(e) => setNewEvent({...newEvent, duration: parseInt(e.target.value)})}
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1.5 horas</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Asistentes (emails separados por coma)</label>
                <input
                  type="text"
                  value={newEvent.attendees}
                  onChange={(e) => setNewEvent({...newEvent, attendees: e.target.value})}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>
              
              <div className="form-actions">
                <button type="button" onClick={checkAvailability} className="check-button">
                  🔍 Verificar Disponibilidad
                </button>
                <button type="button" onClick={findNextAvailable} className="find-button">
                  🔎 Buscar Próximo Disponible
                </button>
              </div>
              
              <div className="form-submit">
                <button type="submit" className="create-button" disabled={isLoading}>
                  {isLoading ? 'Creando...' : '✅ Crear Evento con Google Meet'}
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="cancel-button">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="events-list">
              {events.length === 0 ? (
                <div className="no-events">
                  <p>📅 No hay eventos para mostrar</p>
                  <button 
                    className="create-event-button"
                    onClick={() => {
                      setActiveTab('create');
                      setShowCreateForm(true);
                    }}
                  >
                    Crear nuevo evento
                  </button>
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="event-card">
                    <div className="event-header">
                      <h3>{event.title || 'Sin título'}</h3>
                      <button 
                        className="delete-event"
                        onClick={() => handleDeleteEvent(event.id)}
                        title="Eliminar evento"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="event-time">
                      🕐 {formatEventTime(event.start, event.end)}
                    </div>
                    {event.meetLink && (
                      <div className="event-meet">
                        <a href={event.meetLink} target="_blank" rel="noopener noreferrer">
                          📹 Unirse a Google Meet
                        </a>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarEvents;