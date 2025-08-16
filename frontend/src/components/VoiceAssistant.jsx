import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './VoiceAssistant.css';

// Configurar axios baseURL si no está configurado
if (!axios.defaults.baseURL) {
  axios.defaults.baseURL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : '';
}

const VoiceAssistant = () => {
  const [showExitButton, setShowExitButton] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const sessionIdRef = useRef(`voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    // Verificar si hay token de autenticación
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    
    // Configurar axios con el token si existe
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Cargar voces disponibles
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('=== VOCES DISPONIBLES ===');
      console.log(`Total de voces: ${voices.length}`);
      
      // Filtrar voces en español
      const spanishVoices = voices.filter(voice => voice.lang.startsWith('es'));
      console.log(`Voces en español: ${spanishVoices.length}`);
      
      spanishVoices.forEach(voice => {
        console.log(`- ${voice.name} (${voice.lang}) ${voice.localService ? 'Local' : 'Remota'}`);
      });
      
      // Mostrar todas las voces disponibles
      console.log('\n=== TODAS LAS VOCES ===');
      voices.forEach(voice => {
        console.log(`- ${voice.name} (${voice.lang}) ${voice.localService ? 'Local' : 'Remota'}`);
      });
      
      setAvailableVoices(voices);
      
      // Seleccionar una voz en español por defecto
      if (spanishVoices.length > 0) {
        setSelectedVoice(spanishVoices[0]);
        console.log(`Voz seleccionada por defecto: ${spanishVoices[0].name}`);
      }
    };

    // Las voces pueden cargarse asíncronamente
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setError(null);
        startAudioVisualization();
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setTranscript(transcript);
        handleVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        setError(`Error de reconocimiento: ${event.error}`);
        setIsListening(false);
        stopAudioVisualization();
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        stopAudioVisualization();
      };
    } else {
      setError('Tu navegador no soporta reconocimiento de voz');
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          const average = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
          setAudioLevel(average / 255);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('No se pudo acceder al micrófono');
    }
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const handleVoiceCommand = async (text) => {
    try {
      const token = localStorage.getItem('token');
      
      // Configurar headers con el token si existe
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const requestData = {
        message: text,
        session_id: sessionIdRef.current,
        mode_id: 'general',
        context_enabled: false,
        conversation_history: []
      };

      console.log('=== VOICE ASSISTANT REQUEST ===');
      console.log('Enviando comando de voz:', text);
      console.log('Session ID:', sessionIdRef.current);
      console.log('Request data:', requestData);
      console.log('Headers:', headers);
      console.log('================================');
      
      const response = await axios.post('/api/chat', requestData, { headers });

      console.log('Respuesta recibida:', response.data);
      
      if (response.data.success && response.data.message) {
        speakResponse(response.data.message);
      } else if (response.data.response) {
        speakResponse(response.data.response);
      } else if (response.data.reply) {
        speakResponse(response.data.reply);
      } else {
        console.error('Formato de respuesta no reconocido:', response.data);
        speakResponse('No pude procesar tu solicitud.');
      }
    } catch (error) {
      console.error('Error en handleVoiceCommand:', error);
      console.error('Detalles del error:', error.response?.data);
      
      if (error.response?.status === 401) {
        speakResponse('Por favor, inicia sesión para usar el asistente de voz.');
      } else if (error.response?.status === 400) {
        speakResponse('Hubo un problema con tu solicitud. Por favor, intenta de nuevo.');
      } else {
        speakResponse('Lo siento, hubo un error al procesar tu solicitud.');
      }
    }
  };

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Usar la voz seleccionada si está disponible
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log(`Usando voz: ${selectedVoice.name}`);
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        console.log('Iniciando síntesis de voz...');
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        console.log('Síntesis de voz completada');
        setTimeout(() => {
          startListening();
        }, 500);
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        setError('Error al reproducir la respuesta');
        console.error('Error en síntesis de voz:', event);
      };

      synthRef.current.cancel();
      synthRef.current.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (synthRef.current && synthRef.current.speaking) {
      console.log('Deteniendo síntesis de voz...');
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      setTranscript('');
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const toggleListening = () => {
    // Si está hablando, detener la síntesis de voz
    if (isSpeaking) {
      console.log('Deteniendo síntesis para escuchar...');
      stopSpeaking();
      // Esperar un poco antes de empezar a escuchar
      setTimeout(() => {
        startListening();
      }, 100);
    } else if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const getCircleScale = () => {
    if (isSpeaking) {
      return 1 + Math.sin(Date.now() * 0.005) * 0.1;
    }
    return 1 + audioLevel * 0.5;
  };

  const handleExit = () => {
    window.location.reload();
  };

  return (
    <div className="voice-assistant-container">
      {showExitButton && (
        <button 
          className="exit-voice-button"
          onClick={handleExit}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '2px solid #5d8ffc',
            color: '#5d8ffc',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s ease',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#5d8ffc';
            e.target.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.9)';
            e.target.style.color = '#5d8ffc';
          }}
        >
          ← Volver al chat
        </button>
      )}
      <div className="voice-content">
        <div 
          className={`voice-circle ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}
          onClick={toggleListening}
          style={{
            transform: `scale(${getCircleScale()})`,
            boxShadow: isListening || isSpeaking 
              ? `0 0 ${30 + audioLevel * 50}px rgba(93, 143, 252, ${0.4 + audioLevel * 0.3})`
              : '0 0 20px rgba(93, 143, 252, 0.3)'
          }}
        >
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
          
          <svg className="mic-icon" viewBox="0 0 24 24" width="60" height="60">
            <path 
              fill="white" 
              d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
            />
            <path 
              fill="white" 
              d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
            />
          </svg>
        </div>

        <div className="status-text">
          {isSpeaking && <p className="status">Hablando...</p>}
          {isListening && !isSpeaking && <p className="status">Escuchando...</p>}
          {!isListening && !isSpeaking && <p className="status">Toca para hablar</p>}
          {transcript && <p className="transcript">"{transcript}"</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="instructions">
          <p>Haz clic en el círculo para activar el asistente de voz</p>
          <p className="subtitle">Habla claramente y espera la respuesta</p>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;