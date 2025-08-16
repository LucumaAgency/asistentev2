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
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [voiceQuality, setVoiceQuality] = useState('auto'); // 'auto', 'high', 'medium', 'low'
  
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

    // Función para evaluar la calidad de una voz
    const evaluateVoiceQuality = (voice) => {
      const name = voice.name.toLowerCase();
      
      // Voces de alta calidad (neurales/naturales)
      if (name.includes('neural') || name.includes('natural') || 
          name.includes('wavenet') || name.includes('premium')) {
        return 3; // Alta calidad
      }
      
      // Voces de servicios en línea (generalmente mejor calidad)
      if (!voice.localService && (name.includes('google') || 
          name.includes('microsoft') || name.includes('amazon'))) {
        return 2; // Calidad media-alta
      }
      
      // Voces remotas genéricas
      if (!voice.localService) {
        return 1; // Calidad media
      }
      
      // Voces locales (pueden sonar más robóticas)
      return 0; // Calidad básica
    };

    // Cargar voces disponibles
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('=== VOCES DISPONIBLES ===');
      console.log(`Total de voces: ${voices.length}`);
      
      // Filtrar voces en español
      const spanishVoices = voices.filter(voice => voice.lang.startsWith('es'));
      console.log(`Voces en español: ${spanishVoices.length}`);
      
      // Ordenar voces por calidad
      const sortedSpanishVoices = spanishVoices.sort((a, b) => {
        return evaluateVoiceQuality(b) - evaluateVoiceQuality(a);
      });
      
      sortedSpanishVoices.forEach(voice => {
        const quality = evaluateVoiceQuality(voice);
        const qualityLabel = ['Básica', 'Media', 'Media-Alta', 'Alta'][quality];
        console.log(`- ${voice.name} (${voice.lang}) ${voice.localService ? 'Local' : 'Remota'} - Calidad: ${qualityLabel}`);
      });
      
      setAvailableVoices(voices);
      
      // Seleccionar una voz en español por defecto
      if (sortedSpanishVoices.length > 0) {
        // Verificar si hay una voz guardada previamente
        const savedVoiceName = localStorage.getItem('selectedVoiceName');
        const savedVoice = savedVoiceName ? 
          sortedSpanishVoices.find(v => v.name === savedVoiceName) : null;
        
        // Usar la voz guardada o la de mejor calidad disponible
        const preferredVoice = savedVoice || sortedSpanishVoices[0];
        
        setSelectedVoice(preferredVoice);
        const quality = evaluateVoiceQuality(preferredVoice);
        const qualityLabel = ['Básica', 'Media', 'Media-Alta', 'Alta'][quality];
        console.log(`Voz seleccionada: ${preferredVoice.name} (Calidad: ${qualityLabel})`);
        
        // Advertir si la voz es de baja calidad
        if (quality === 0) {
          console.warn('⚠️ La voz seleccionada es de calidad básica y puede sonar robótica.');
          console.log('💡 Considera cambiar a una voz remota o premium desde el selector de voces.');
        }
        
        // Guardar en localStorage
        localStorage.setItem('selectedVoiceName', preferredVoice.name);
      } else if (voices.length > 0) {
        // Si no hay voces en español, usar la primera disponible
        setSelectedVoice(voices[0]);
        console.log(`No hay voces en español, usando: ${voices[0].name}`);
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
        console.log('🎤 Reconocimiento iniciado');
        setIsListening(true);
        setError(null);
        // Solo iniciar visualización si no es móvil
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) {
          startAudioVisualization();
        }
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('📝 Transcripción:', transcript);
        setTranscript(transcript);
        handleVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('❌ Error de reconocimiento:', event.error);
        
        // Mensajes de error específicos
        let errorMessage = 'Error de reconocimiento';
        switch(event.error) {
          case 'no-speech':
            errorMessage = 'No se detectó voz. Intenta hablar más cerca del micrófono.';
            break;
          case 'audio-capture':
            errorMessage = 'No se pudo acceder al micrófono.';
            break;
          case 'not-allowed':
            errorMessage = 'Permiso de micrófono denegado.';
            break;
          case 'network':
            errorMessage = 'Error de conexión. Verifica tu internet.';
            break;
          case 'aborted':
            errorMessage = 'Reconocimiento cancelado.';
            break;
          default:
            errorMessage = `Error: ${event.error}`;
        }
        
        setError(errorMessage);
        setIsListening(false);
        stopAudioVisualization();
      };

      recognitionRef.current.onend = () => {
        console.log('🔚 Reconocimiento finalizado');
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
      // Verificar si estamos en HTTPS (requerido para getUserMedia)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        console.error('❌ Se requiere HTTPS para acceder al micrófono');
        setError('Se requiere conexión segura (HTTPS)');
        return;
      }

      // Verificar disponibilidad de getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('❌ getUserMedia no disponible');
        setError('Tu navegador no soporta acceso al micrófono');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
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
      console.error('❌ Error accediendo al micrófono:', error);
      
      // Mensajes de error específicos
      if (error.name === 'NotAllowedError') {
        setError('Permiso de micrófono denegado. Por favor, permite el acceso al micrófono.');
      } else if (error.name === 'NotFoundError') {
        setError('No se encontró micrófono en tu dispositivo.');
      } else if (error.name === 'NotReadableError') {
        setError('El micrófono está siendo usado por otra aplicación.');
      } else {
        setError(`Error al acceder al micrófono: ${error.message}`);
      }
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
      
      // Detectar si es un dispositivo móvil
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      console.log('📱 Dispositivo móvil detectado:', isMobile);
      
      // En móviles, necesitamos un comportamiento especial
      if (isMobile) {
        // Cancelar y resetear completamente la síntesis
        synthRef.current.cancel();
        
        // En iOS necesitamos un pequeño delay
        const delay = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 250 : 100;
        
        setTimeout(() => {
          // Crear una nueva instancia para móviles
          const utterance = new SpeechSynthesisUtterance();
          utterance.text = cleanText;
          utterance.lang = 'es-ES';
          // Ajustar parámetros para voz más natural
          utterance.rate = 0.95; // Velocidad más natural (0.95 en vez de 0.9)
          utterance.pitch = 1.05; // Tono ligeramente más alto para naturalidad
          utterance.volume = 0.9; // Volumen ligeramente reducido para evitar distorsión
          
          // En móviles también intentar usar la voz seleccionada
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`📱 Usando voz en móvil: ${selectedVoice.name}`);
          }
          
          utterance.onstart = () => {
            console.log('📱 Síntesis iniciada en móvil');
            setIsSpeaking(true);
          };
          
          utterance.onend = () => {
            console.log('📱 Síntesis completada en móvil');
            setIsSpeaking(false);
            // No reiniciar automáticamente en móviles
          };
          
          utterance.onerror = (event) => {
            console.error('📱 Error en síntesis móvil:', event);
            setIsSpeaking(false);
          };
          
          try {
            synthRef.current.speak(utterance);
          } catch (error) {
            console.error('📱 Error al hablar en móvil:', error);
            setIsSpeaking(false);
          }
        }, delay);
        
        return;
      }
      
      // Código original para desktop
      // Cancelar cualquier síntesis anterior
      if (synthRef.current.speaking) {
        synthRef.current.cancel();
      }
      
      setIsSpeaking(true);
      
      // Pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        // Configuración optimizada para voces más naturales
        utterance.rate = 0.95; // Velocidad natural (entre 0.9 y 1.0)
        utterance.pitch = 1.05; // Tono ligeramente elevado para mayor naturalidad
        utterance.volume = 0.9; // Volumen optimizado para evitar distorsión

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
      setError(null); // Limpiar errores previos
      try {
        recognitionRef.current.start();
        console.log('🎤 Iniciando escucha...');
      } catch (error) {
        console.error('Error al iniciar reconocimiento:', error);
        
        // Mensajes de error más específicos
        if (error.name === 'InvalidStateError') {
          setError('El reconocimiento ya está en curso. Espera un momento.');
        } else if (error.message.includes('not-allowed')) {
          setError('Permisos de micrófono denegados. Verifica la configuración.');
        } else {
          setError('Error al iniciar el micrófono. Intenta nuevamente.');
        }
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

  const initializeMobileSpeech = () => {
    // En móviles, necesitamos "despertar" la síntesis con una interacción del usuario
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && window.speechSynthesis) {
      console.log('📱 Inicializando síntesis de voz para móvil...');
      // Crear un utterance vacío para inicializar
      const initUtterance = new SpeechSynthesisUtterance('');
      initUtterance.volume = 0;
      synthRef.current.speak(initUtterance);
      console.log('📱 Síntesis de voz inicializada');
    }
  };

  const toggleListening = async () => {
    // Verificar HTTPS primero
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      console.error('❌ Se requiere HTTPS para acceder al micrófono');
      setError('Esta página requiere conexión segura (HTTPS). Por favor, accede desde https://');
      return;
    }

    // Verificar compatibilidad del navegador
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError('Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Safari.');
      return;
    }

    // Inicializar síntesis en móviles si es la primera vez
    initializeMobileSpeech();
    
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
      // Pedir permisos de micrófono explícitamente en móviles
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          console.log('📱 Solicitando permisos de micrófono en móvil...');
          await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log('✅ Permisos de micrófono concedidos');
        } catch (error) {
          console.error('❌ Error obteniendo permisos:', error);
          if (error.name === 'NotAllowedError') {
            setError('Por favor, permite el acceso al micrófono en la configuración de tu navegador.');
          } else if (error.name === 'NotFoundError') {
            setError('No se detectó micrófono en tu dispositivo.');
          } else {
            setError('Error al acceder al micrófono. Verifica tu configuración.');
          }
          return;
        }
      }
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

  const handleVoiceChange = (voiceName) => {
    const voice = availableVoices.find(v => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice);
      localStorage.setItem('selectedVoiceName', voice.name);
      
      // Evaluar calidad de la voz
      const isNeural = voice.name.toLowerCase().includes('neural') || 
                       voice.name.toLowerCase().includes('natural');
      const isOnline = !voice.localService;
      
      console.log('🎤 Voz cambiada a:', voice.name);
      console.log('Calidad:', isNeural ? 'Premium (Neural/Natural)' : 
                              isOnline ? 'En línea (Buena)' : 
                              'Local (Básica)');
      
      // Probar la nueva voz con un mensaje apropiado
      const testText = isNeural ? 'Excelente elección. Esta voz suena muy natural.' :
                      isOnline ? 'Voz en línea seleccionada. Buena calidad.' :
                      'Voz local seleccionada. Puede sonar más sintética.';
      speakResponse(testText);
    }
    setShowVoiceSelector(false);
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
      
      {/* Botón de configuración de voz */}
      <button 
        className="voice-settings-button"
        onClick={() => setShowVoiceSelector(!showVoiceSelector)}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '2px solid #5d8ffc',
          color: '#5d8ffc',
          padding: '10px',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '20px',
          width: '45px',
          height: '45px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          zIndex: 10
        }}
        title="Configurar voz"
      >
        ⚙️
      </button>
      
      {/* Modal de selector de voces */}
      {showVoiceSelector && (
        <div className="voice-selector-modal" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          zIndex: 1000,
          maxWidth: '90%',
          width: '400px',
          maxHeight: '70vh',
          overflow: 'auto'
        }}>
          <h3 style={{ 
            marginTop: 0, 
            color: '#333',
            borderBottom: '2px solid #5d8ffc',
            paddingBottom: '10px'
          }}>
            Seleccionar Voz 🔊
          </h3>
          
          <div style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>
            Voz actual: <strong>{selectedVoice?.name || 'Ninguna'}</strong>
          </div>
          
          {/* Voces en español */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#5d8ffc', marginBottom: '10px' }}>Voces en Español 🇪🇸</h4>
            {availableVoices
              .filter(voice => voice.lang.startsWith('es'))
              .sort((a, b) => {
                // Ordenar por calidad (definida en loadVoices)
                const qualityA = a.name.toLowerCase().includes('neural') || a.name.toLowerCase().includes('natural') ? 2 : 
                                 !a.localService ? 1 : 0;
                const qualityB = b.name.toLowerCase().includes('neural') || b.name.toLowerCase().includes('natural') ? 2 : 
                                 !b.localService ? 1 : 0;
                return qualityB - qualityA;
              })
              .map(voice => {
                const isNeural = voice.name.toLowerCase().includes('neural') || 
                                 voice.name.toLowerCase().includes('natural') ||
                                 voice.name.toLowerCase().includes('wavenet');
                const isOnline = !voice.localService;
                const qualityBadge = isNeural ? '🌟 Premium' : 
                                    isOnline ? '✨ En línea' : 
                                    '💻 Local';
                const qualityColor = isNeural ? '#4CAF50' : 
                                     isOnline ? '#2196F3' : 
                                     '#9E9E9E';
                
                return (
                  <button
                    key={voice.name}
                    onClick={() => handleVoiceChange(voice.name)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px',
                      margin: '8px 0',
                      background: selectedVoice?.name === voice.name ? '#5d8ffc' : '#f0f0f0',
                      color: selectedVoice?.name === voice.name ? 'white' : '#333',
                      border: isNeural ? '2px solid #4CAF50' : 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedVoice?.name !== voice.name) {
                        e.currentTarget.style.background = '#e0e0e0';
                        e.currentTarget.style.transform = 'translateX(5px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedVoice?.name !== voice.name) {
                        e.currentTarget.style.background = '#f0f0f0';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}>
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {voice.name}
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.7 }}>
                          {voice.lang}
                        </div>
                      </div>
                      <span style={{
                        background: qualityColor,
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        {qualityBadge}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
          
          {/* Otras voces */}
          <div>
            <h4 style={{ color: '#888', marginBottom: '10px' }}>Otros Idiomas 🌍</h4>
            {availableVoices
              .filter(voice => !voice.lang.startsWith('es'))
              .map(voice => (
                <button
                  key={voice.name}
                  onClick={() => handleVoiceChange(voice.name)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px',
                    margin: '5px 0',
                    background: selectedVoice?.name === voice.name ? '#5d8ffc' : '#f0f0f0',
                    color: selectedVoice?.name === voice.name ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedVoice?.name !== voice.name) {
                      e.target.style.background = '#e0e0e0';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedVoice?.name !== voice.name) {
                      e.target.style.background = '#f0f0f0';
                    }
                  }}
                >
                  <div style={{ fontWeight: '500' }}>{voice.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.7 }}>
                    {voice.lang} • {voice.localService ? 'Local' : 'En línea'}
                  </div>
                </button>
              ))}
          </div>
          
          <button
            onClick={() => setShowVoiceSelector(false)}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#5d8ffc',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              width: '100%',
              fontWeight: '500'
            }}
          >
            Cerrar
          </button>
        </div>
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