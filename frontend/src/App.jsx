import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar';
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
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  useEffect(() => {
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
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsRecording(false);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setError('Error en el reconocimiento de voz');
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      console.log('No hay conversación previa o error al cargar:', err);
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
        system_prompt: currentMode?.prompt || 'Eres un asistente virtual útil y amigable.'
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.message
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (synthRef.current && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(response.data.message);
        utterance.lang = 'es-ES';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        synthRef.current.speak(utterance);
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
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setError('');
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
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        onModeChange={handleModeChange}
        currentMode={currentMode}
        messages={messages}
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
            <h1>AI Assistant</h1>
            <p>Modo: {currentMode?.name || 'General'}</p>
          </div>
        </header>

        <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">○</div>
              <div className="empty-state-text">
                Start a conversation<br />
                Type a message or use voice input
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
              title={isRecording ? 'Detener grabación' : 'Mantén presionado para hablar'}
            >
              {isRecording ? '◼' : '●'}
            </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="message-input"
              disabled={isLoading || isRecording}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!inputMessage.trim() || isLoading}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </form>
          <div className="controls">
            <button onClick={clearConversation} className="clear-button">
              Clear
            </button>
            <button onClick={stopSpeaking} className="clear-button">
              Stop voice
            </button>
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
    </div>
  );
}

export default App;