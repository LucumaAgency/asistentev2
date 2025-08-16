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

      // Detectar si el usuario quiere agendar algo
      const calendarKeywords = [
        'agendar', 'agenda', 'reunión', 'cita', 'evento', 'calendario', 
        'programar', 'meet', 'meeting', 'mañana', 'próximo', 'próxima',
        'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'
      ];
      
      const textLower = text.toLowerCase();
      const isCalendarRequest = calendarKeywords.some(keyword => textLower.includes(keyword));
      
      // Usar modo calendar si detectamos intención de agendar
      const modeToUse = isCalendarRequest ? 'calendar' : 'general';
      
      if (isCalendarRequest && !token) {
        speakResponse('Para agendar eventos necesitas iniciar sesión con tu cuenta de Google. Por favor, vuelve al chat principal e inicia sesión.');
        return;
      }

      const requestData = {
        message: text,
        session_id: sessionIdRef.current,
        mode_id: modeToUse,
        context_enabled: false,
        conversation_history: []
      };

      console.log('=== VOICE ASSISTANT REQUEST ===');
      console.log('Enviando comando de voz:', text);
      console.log('Modo detectado:', modeToUse);
      console.log('Session ID:', sessionIdRef.current);
      console.log('Request data:', requestData);
      console.log('Headers:', headers);
      console.log('================================');
      
      const response = await axios.post('/api/chat', requestData, { headers });

      console.log('Respuesta recibida:', response.data);
      
      // Extraer el mensaje de respuesta
      let messageToSpeak = '';
      
      if (response.data.success && response.data.message) {
        messageToSpeak = response.data.message;
      } else if (response.data.response) {
        messageToSpeak = response.data.response;
      } else if (response.data.reply) {
        messageToSpeak = response.data.reply;
      } else {
        console.error('Formato de respuesta no reconocido:', response.data);
        messageToSpeak = 'No pude procesar tu solicitud.';
      }
      
      // Si el modo es calendar y hay información adicional del evento
      if (modeToUse === 'calendar' && response.data.eventDetails) {
        console.log('Detalles del evento creado:', response.data.eventDetails);
        if (response.data.eventDetails.meetLink) {
          messageToSpeak += ` El enlace de Google Meet se ha enviado a tu correo.`;
        }
      }
      
      speakResponse(messageToSpeak);
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

  const cleanTextForSpeech = (text) => {
    // Remover enlaces Markdown [texto](url)
    let cleanText = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remover emojis comunes
    cleanText = cleanText.replace(/[📹🗓️✅📅🎯💡⚠️ℹ️]/g, '');
    
    // Remover URLs directas
    cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, 'enlace disponible');
    
    // Remover caracteres especiales de Markdown
    cleanText = cleanText.replace(/[*_~`#]/g, '');
    
    // Remover saltos de línea múltiples
    cleanText = cleanText.replace(/\n+/g, '. ');
    
    // Limpiar espacios extras
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    console.log('Texto original:', text);
    console.log('Texto limpio para voz:', cleanText);
    
    return cleanText;
  };

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      // Limpiar el texto antes de sintetizar
      const cleanText = cleanTextForSpeech(text);
      
      if (!cleanText || cleanText.length === 0) {
        console.error('Texto vacío después de limpiar');
        return;
      }
      
      // Cancelar cualquier síntesis anterior
      if (synthRef.current.speaking) {
        synthRef.current.cancel();
      }
      
      setIsSpeaking(true);
      
      // Pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9; // Ligeramente más lento
        utterance.pitch = 1;
        utterance.volume = 1;

        // Usar la voz seleccionada si está disponible
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log(`Usando voz: ${selectedVoice.name}`);
        }

        utterance.onstart = () => {
          console.log('✅ Síntesis de voz iniciada correctamente');
          console.log('Texto a hablar:', cleanText.substring(0, 100) + '...');
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          console.log('✅ Síntesis de voz completada');
          setIsSpeaking(false);
          // Esperar un poco más antes de volver a escuchar
          setTimeout(() => {
            if (!isSpeaking) {
              startListening();
            }
          }, 1000);
        };

        utterance.onerror = (event) => {
          console.error('❌ Error en síntesis de voz:', event.error);
          console.error('Detalles del error:', event);
          setIsSpeaking(false);
          setError(`Error de voz: ${event.error}`);
          
          // Reintentar con texto más simple si falla
          if (event.error === 'text-too-long') {
            const shortText = cleanText.substring(0, 200);
            console.log('Reintentando con texto más corto:', shortText);
            setTimeout(() => speakResponse(shortText), 500);
          }
        };

        utterance.onpause = () => {
          console.log('⏸️ Síntesis pausada');
        };

        utterance.onresume = () => {
          console.log('▶️ Síntesis reanudada');
        };

        try {
          synthRef.current.speak(utterance);
          console.log('🔊 Utterance enviado a síntesis');
        } catch (error) {
          console.error('❌ Error al iniciar síntesis:', error);
          setIsSpeaking(false);
        }
      }, 100);
    } else {
      console.error('❌ SpeechSynthesis no disponible');
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
      try {
        recognitionRef.current.start();
        console.log('🎤 Iniciando escucha...');
      } catch (error) {
        console.error('Error al iniciar reconocimiento:', error);
        setError('Error al iniciar el micrófono');
      }
    } else {
      console.log('No se puede iniciar escucha:', {
        hasRecognition: !!recognitionRef.current,
        isListening,
        isSpeaking
      });
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