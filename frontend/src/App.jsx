import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar';
import LoginWithCalendar from './components/LoginWithCalendar';
import CalendarEvents from './components/CalendarEvents';
import VoiceAssistant from './components/VoiceAssistant';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [currentMode, setCurrentMode] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceInitialized, setVoiceInitialized] = useState(false);
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  const [contextEnabled, setContextEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const silenceTimerRef = useRef(null);

  useEffect(() => {
    // Verificar soporte de síntesis de voz
    if ('speechSynthesis' in window) {
      console.log('Síntesis de voz soportada');
      
      // Cargar voces disponibles
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const spanishVoices = voices.filter(voice => voice.lang.startsWith('es'));
        console.log('Voces en español disponibles:', spanishVoices.length);
        if (spanishVoices.length > 0) {
          console.log('Primera voz en español:', spanishVoices[0].name);
        }
      };
      
      // Las voces pueden cargarse asíncronamente
      if (window.speechSynthesis.getVoices().length > 0) {
        loadVoices();
      } else {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    } else {
      console.warn('Síntesis de voz no soportada en este navegador');
    }
    
    // Verificar si hay token guardado
    const token = localStorage.getItem('token');  // Cambiar authToken por token
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      // Configurar axios con el token
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
      
      // Verificar que el token sigue siendo válido
      verifyToken(token);
    } else {
      // Mostrar login si no hay token
      setShowLogin(true);
    }
    
    const newSessionId = localStorage.getItem('sessionId') || uuidv4();
    localStorage.setItem('sessionId', newSessionId);
    setSessionId(newSessionId);
    
    // Cargar el modo por defecto
    const savedModes = localStorage.getItem('assistantModes');
    if (savedModes) {
      const modes = JSON.parse(savedModes);
      setCurrentMode(modes[0]);
    } else {
      const defaultMode = {
        id: 'default',
        name: 'General',
        prompt: 'Eres un asistente virtual útil y amigable.'
      };
      setCurrentMode(defaultMode);
      localStorage.setItem('assistantModes', JSON.stringify([defaultMode]));
    }
    
    checkConnection();
    loadConversation(newSessionId);
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;  // Cambiar a true para grabación continua
      recognitionRef.current.interimResults = true;  // Mostrar resultados parciales
      recognitionRef.current.lang = 'es-ES';
      
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Actualizar el mensaje con el texto final o parcial
        if (finalTranscript || interimTranscript) {
          // Reiniciar el timer de silencio cada vez que se detecta voz
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          // Establecer nuevo timer de 3 segundos
          silenceTimerRef.current = setTimeout(() => {
            console.log('3 segundos de silencio detectados, deteniendo grabación');
            if (recognitionRef.current) {
              recognitionRef.current.stop();
              setIsRecording(false);
            }
          }, 3000);
          
          if (finalTranscript) {
            setInputMessage(finalTranscript);
          } else if (interimTranscript) {
            // Mostrar texto parcial mientras habla
            setInputMessage(interimTranscript);
          }
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        // Solo detener si es un error grave
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          setIsRecording(false);
          setError('Error en el reconocimiento de voz');
        }
      };
      
      recognitionRef.current.onend = () => {
        // El estado se manejará en el efecto separado
        console.log('Recognition ended');
      };
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Efecto para manejar el reinicio automático del reconocimiento
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {
        if (isRecording) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.error('Error restarting recognition:', err);
            setIsRecording(false);
          }
        }
      };
    }
  }, [isRecording]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkConnection = async () => {
    try {
      const response = await axios.get('/api/health');
      setIsConnected(true);
      if (!response.data.openai) {
        setError('OpenAI API key no configurada. Configura OPENAI_API_KEY en las variables de entorno.');
      }
    } catch (err) {
      setIsConnected(false);
      setError('No se puede conectar al servidor');
    }
  };

  const loadConversation = async (sid) => {
    try {
      const response = await axios.get(`/api/conversations/${sid}`);
      if (response.data.messages) {
        setMessages(response.data.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })));
      }
    } catch (err) {
      // Es normal que no haya conversación previa en la primera carga
      if (err.response && err.response.status === 404) {
        console.log('Nueva sesión - no hay conversación previa');
      } else {
        console.error('Error al cargar conversación:', err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/chat', {
        message: inputMessage,
        session_id: sessionId,
        conversation_history: messages,
        system_prompt: currentMode?.prompt || 'Eres un asistente virtual útil y amigable.',
        mode_context: contextEnabled,
        mode_id: currentMode?.id || 'default'
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.message
      };

      setMessages(prev => [...prev, assistantMessage]);
      setLastAssistantMessage(response.data.message);
      
      // Solo leer la respuesta si está habilitado
      if (voiceEnabled && 'speechSynthesis' in window) {
        console.log('Intentando leer respuesta:', response.data.message.substring(0, 50) + '...');
        
        // Función para leer el mensaje
        const speakMessage = () => {
          // Cancelar cualquier lectura en curso
          window.speechSynthesis.cancel();
          
          // Crear nueva utterance
          const utterance = new SpeechSynthesisUtterance(response.data.message);
          utterance.lang = 'es-ES';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          
          // Intentar obtener una voz en español
          const voices = window.speechSynthesis.getVoices();
          const spanishVoice = voices.find(voice => 
            voice.lang === 'es-ES' || voice.lang === 'es-MX' || voice.lang.startsWith('es')
          );
          if (spanishVoice) {
            utterance.voice = spanishVoice;
            console.log('Usando voz:', spanishVoice.name);
          }
          
          // Agregar event listeners para debug
          utterance.onstart = () => console.log('Iniciando lectura de voz');
          utterance.onend = () => console.log('Lectura de voz finalizada');
          utterance.onerror = (event) => {
            console.error('Error en lectura de voz:', event);
            // En móviles, intentar de nuevo con un click simulado
            if (event.error === 'not-allowed' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
              console.log('Requiere interacción del usuario en móvil');
            }
          };
          
          // Intentar hablar
          try {
            window.speechSynthesis.speak(utterance);
          } catch (error) {
            console.error('Error al intentar hablar:', error);
          }
        };
        
        // En móviles, usar un pequeño delay y verificar si necesita inicialización
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          // Para móviles, intentar directamente y si falla, guardar para reproducir después
          setTimeout(speakMessage, 200);
        } else {
          // Para desktop, usar el delay normal
          setTimeout(speakMessage, 100);
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.response?.data?.error || 'Error al enviar el mensaje');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setError('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    if (isRecording) {
      // Detener la grabación y limpiar el timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      recognitionRef.current.stop();
      setIsRecording(false);
      console.log('Grabación detenida');
    } else {
      // Limpiar el campo de texto antes de comenzar nueva grabación (opcional)
      // setInputMessage('');
      
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setError('');
        console.log('Grabación iniciada');
      } catch (err) {
        console.error('Error starting recognition:', err);
        setError('Error al iniciar el reconocimiento de voz');
      }
    }
  };

  const clearConversation = async () => {
    try {
      await axios.delete(`/api/conversations/${sessionId}`);
      setMessages([]);
      const newSessionId = uuidv4();
      localStorage.setItem('sessionId', newSessionId);
      setSessionId(newSessionId);
      setError('');
      // Limpiar también el último mensaje del asistente
      setLastAssistantMessage('');
    } catch (err) {
      console.error('Error clearing conversation:', err);
      setError('Error al limpiar la conversación');
    }
  };

  const handleModeChange = (mode) => {
    setCurrentMode(mode);
    // Opcionalmente limpiar la conversación al cambiar de modo
    clearConversation();
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      console.log('Lectura de voz detenida');
    }
  };

  const speakLastMessage = () => {
    if (lastAssistantMessage && 'speechSynthesis' in window) {
      console.log('Reproduciendo último mensaje manualmente');
      
      // Cancelar cualquier lectura en curso
      window.speechSynthesis.cancel();
      
      // Crear nueva utterance
      const utterance = new SpeechSynthesisUtterance(lastAssistantMessage);
      utterance.lang = 'es-ES';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Intentar obtener una voz en español
      const voices = window.speechSynthesis.getVoices();
      const spanishVoice = voices.find(voice => 
        voice.lang === 'es-ES' || voice.lang === 'es-MX' || voice.lang.startsWith('es')
      );
      if (spanishVoice) {
        utterance.voice = spanishVoice;
      }
      
      utterance.onstart = () => console.log('Iniciando lectura manual');
      utterance.onend = () => console.log('Lectura manual finalizada');
      utterance.onerror = (event) => console.error('Error en lectura manual:', event);
      
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('Error al reproducir:', error);
      }
    }
  };

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/profile');
      if (response.data.user) {
        setUser(response.data.user);
        setIsAuthenticated(true);
        
        // Verificar si tiene acceso a Calendar
        if (response.data.hasCalendarAccess) {
          setHasCalendarAccess(true);
        }
      }
    } catch (error) {
      console.error('Token inválido:', error);
      // Si el token es inválido, limpiar y mostrar login
      handleLogout();
    }
  };

  const handleLoginSuccess = (userData) => {
    if (userData) {
      setUser(userData);
      setIsAuthenticated(true);
    }
    setShowLogin(false);
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.error('Error en logout:', error);
    }
    
    // Limpiar datos locales
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    
    // Resetear estado
    setUser(null);
    setIsAuthenticated(false);
    setMessages([]);
    setShowLogin(true);
  };

  const handleChatSelect = (chatId, chatMessages, chatSessionId) => {
    // Actualizar los mensajes con los del chat seleccionado
    setMessages(chatMessages || []);
    
    // Si hay un session_id del chat, usarlo para futuras interacciones
    if (chatSessionId) {
      setSessionId(chatSessionId);
      localStorage.setItem('sessionId', chatSessionId);
      console.log('Cargando conversación con session_id:', chatSessionId);
    } else {
      // Si no hay session_id, crear uno nuevo para continuar la conversación
      const newSessionId = uuidv4();
      setSessionId(newSessionId);
      localStorage.setItem('sessionId', newSessionId);
      console.log('Creando nuevo session_id para continuar:', newSessionId);
    }
    
    console.log('Chat seleccionado:', chatId, 'Mensajes cargados:', chatMessages?.length || 0);
  };

  const handleNewChat = () => {
    // Limpiar mensajes actuales
    setMessages([]);
    
    // Crear nuevo session ID
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    localStorage.setItem('sessionId', newSessionId);
    
    // Limpiar errores y último mensaje
    setError('');
    setLastAssistantMessage('');
    
    console.log('Nuevo chat creado con session_id:', newSessionId);
  };

  const authorizeCalendar = async () => {
    try {
      // Obtener URL de autorización
      const response = await axios.get('/api/auth/google/auth-url');
      const { authUrl } = response.data;
      
      // Abrir popup para autorización
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        authUrl,
        'google-auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      // Escuchar mensaje del popup
      const messageHandler = (event) => {
        if (event.data.type === 'google-auth-success') {
          console.log('Código recibido del popup:', event.data.code);
          
          // Procesar el código
          (async () => {
            try {
              console.log('📅 Procesando código OAuth desde popup...');
              const response = await axios.post('/api/auth/google', { code: event.data.code });
              console.log('Respuesta del servidor:', response.data);
              
              if (response.data.success) {
                // Actualizar tokens
                if (response.data.token) {
                  localStorage.setItem('token', response.data.token);
                  axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                }
                
                // Actualizar usuario si viene en la respuesta
                if (response.data.user) {
                  localStorage.setItem('user', JSON.stringify(response.data.user));
                  setUser(response.data.user);
                }
                
                setHasCalendarAccess(response.data.hasCalendarAccess || false);
                console.log('✅ Calendar autorizado exitosamente');
                alert('✅ Google Calendar autorizado exitosamente. Ya puedes agendar reuniones.');
              } else {
                console.error('Error en respuesta:', response.data);
                alert('Error al autorizar Calendar: ' + (response.data.error || 'Error desconocido'));
              }
            } catch (error) {
              console.error('Error procesando código OAuth:', error);
              console.error('Detalles del error:', error.response?.data);
              const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message;
              alert('Error al autorizar Calendar: ' + errorMsg);
            }
          })();
          
          // Limpiar listener
          window.removeEventListener('message', messageHandler);
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Verificar si el popup fue bloqueado
      if (!popup || popup.closed) {
        alert('Por favor permite las ventanas emergentes para autorizar Google Calendar');
        window.removeEventListener('message', messageHandler);
      }
      
    } catch (error) {
      console.error('Error obteniendo URL de autorización:', error);
      alert('Error al iniciar autorización');
    }
  };

  // Mostrar login si es necesario
  if (showLogin) {
    return <LoginWithCalendar onLoginSuccess={handleLoginSuccess} />;
  }

  if (showVoiceAssistant) {
    return <VoiceAssistant />;
  }

  return (
    <div className="app-container">
      {/* Overlay para móviles cuando el sidebar está abierto */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      
      <Sidebar 
        onModeChange={handleModeChange}
        currentMode={currentMode}
        messages={messages}
        user={user}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
      />
      
      <div className="app">
        <header className="header">
          <button 
            className="menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            ☰
          </button>
          <div>
            <h1>Asistente IA v3.38</h1>
            <p>Modo: {currentMode?.name || 'General'}</p>
          </div>
          <button 
            className="new-chat-button"
            onClick={handleNewChat}
            title="Nuevo chat"
          >
            + Nuevo Chat
          </button>
          {isAuthenticated && (
            <button 
              className="calendar-button"
              onClick={() => setShowCalendarModal(true)}
              title="Ver eventos de Calendar"
            >
              📅 Calendar
            </button>
          )}
          <button 
            className="voice-assistant-button"
            onClick={() => setShowVoiceAssistant(true)}
            title="Asistente de voz"
          >
            🎤 <span>Voz</span>
          </button>
          <div className="user-menu">
            {user ? (
              <div className="user-info">
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="user-avatar" />
                )}
                <div className="user-details">
                  <span className="user-name">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="logout-button">
                  Salir
                </button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="login-button">
                Iniciar sesión
              </button>
            )}
          </div>
        </header>

        <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">○</div>
              <div className="empty-state-text">
                Inicia una conversación<br />
                Escribe un mensaje o usa entrada de voz
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <div className="message-content">
                  {message.role === 'assistant' ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="loading">
              <div className="loading-dots">
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
                <div className="loading-dot"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <form onSubmit={handleSubmit} className="input-form">
            <button
              type="button"
              className={`voice-button ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
            >
            </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isRecording ? "🔴 Grabando... Habla ahora" : "Escribe tu mensaje..."}
              className={`message-input ${isRecording ? 'recording' : ''}`}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!inputMessage.trim() || isLoading}
            >
              {isLoading ? '...' : 'Enviar'}
            </button>
          </form>
          <div className="controls">
            <button onClick={clearConversation} className="clear-button">
              Limpiar
            </button>
            <button onClick={stopSpeaking} className="clear-button">
              Detener voz
            </button>
            {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && lastAssistantMessage && (
              <button onClick={speakLastMessage} className="clear-button" title="Reproducir última respuesta">
                🔊 Reproducir
              </button>
            )}
            <label className="voice-toggle">
              <input 
                type="checkbox" 
                checked={voiceEnabled} 
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setVoiceEnabled(enabled);
                  console.log('Lectura de respuestas:', enabled ? 'Activada' : 'Desactivada');
                  
                  // Si se activa en móvil, inicializar con una utterance vacía
                  if (enabled && 'speechSynthesis' in window) {
                    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && !voiceInitialized) {
                      // Inicializar con un texto vacío para "despertar" la síntesis de voz
                      const initUtterance = new SpeechSynthesisUtterance('');
                      initUtterance.volume = 0;
                      window.speechSynthesis.speak(initUtterance);
                      setVoiceInitialized(true);
                      console.log('Síntesis de voz inicializada en móvil');
                    }
                  } else if (!enabled && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Leer respuestas</span>
            </label>
            <label className="voice-toggle context-toggle">
              <input 
                type="checkbox" 
                checked={contextEnabled} 
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setContextEnabled(enabled);
                  console.log('Memoria contextual:', enabled ? 'Activada' : 'Desactivada');
                }}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label" title={`Incluir contexto de todos los chats en ${currentMode?.name || 'esta categoría'}`}>
                🧠 Memoria
              </span>
            </label>
          </div>
        </div>
      </div>

        <div className={`status ${isConnected ? 'connected' : 'error'}`}>
          {error ? (
            <span>• {error}</span>
          ) : (
            <span>{isConnected ? '• Connected' : '• Disconnected'}</span>
          )}
        </div>
      </div>
      
      {/* Modal de Calendar */}
      <CalendarEvents 
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
      />
    </div>
  );
}

export default App;